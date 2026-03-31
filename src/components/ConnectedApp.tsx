import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArtifactPreview,
  useArtifacts,
  usePlateContext,
} from '@nuucognition/plate-sdk';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  SelectionMode,
  type NodeTypes,
  type Node,
  type Edge,
  type OnSelectionChangeFunc,
  type ReactFlowInstance,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Database,
  Eye,
  EyeOff,
  FileText,
  Focus,
  Layers,
  Layout,
  Loader2,
  Map as MapIcon,
  MousePointer2,
  Orbit,
  PackageOpen,
  Radio,
  Route,
  Scissors,
  Server,
  Sparkles,
  TestTubes,
  UsersIcon,
  X,
  Zap,
  FlaskConical,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Tooltip } from './ui/tooltip';
import { MapPreviewStatusField } from './MapPreviewStatusField';
import { MapNode } from './nodes/MapNode';
import { OrbOverlay } from './OrbOverlay';
import { DetailPanel } from './DetailPanel';
import { LaunchDialog } from './LaunchDialog';
import { ActionsDropdown } from './ActionsDropdown';
import { cn } from '../lib/utils';
import {
  buildGraph,
  buildProjectHierarchy,
  computeHiddenIds,
  isOrbCodeArtifact,
  stripMd,
  toProject,
  TYPE_COLORS,
  type FlowNode,
  type MapNodeData,
  type OrbCodeProject,
  type SidebarNode,
} from '../lib/orbcode';
import { useOrbcraftSessions } from '../hooks/useOrbcraftSessions';
import { useGraphState } from '../hooks/useGraphState';
import { useSessionManagement, SESSION_STATUS_COLORS } from '../hooks/useSessionManagement';
import { useAgentLaunchers } from '../agents/launchAgent';

// ── Node Types ──────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  mapNode: MapNode,
};

// ── Connected App ───────────────────────────────────────────────────

export function ConnectedApp() {
  const context = usePlateContext();

  // ── Artifact Subscriptions ──────────────────────────────────────
  const { artifacts: orbcodeArtifacts } = useArtifacts(isOrbCodeArtifact);

  // ── Derived Data ────────────────────────────────────────────────
  const projects = useMemo(() => {
    const p: OrbCodeProject[] = [];
    for (const a of orbcodeArtifacts) {
      const proj = toProject(a);
      if (proj) p.push(proj);
    }
    return p.sort((a, b) => a.name.localeCompare(b.name));
  }, [orbcodeArtifacts]);

  // ── Project Selection ──────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [launchAction, setLaunchAction] = useState<'refactor' | 'refine' | 'create-feature' | 'create-ui' | 'create-task' | 'create-test' | 'create-e2e' | 'create-system'>('refactor');
  const [launchTarget, setLaunchTarget] = useState<'selection' | 'detail'>('selection');
  const [orbcraftMode, setOrbcraftMode] = useState(true);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [sidebarView, setSidebarView] = useState<'artifacts' | 'sessions' | 'context' | 'orbs'>('artifacts');

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  );

  // Auto-select first project
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // ── Session Management ─────────────────────────────────────────
  const {
    sessionStatuses,
    plateSessions,
    sessionsForArtifact,
    activeSessionCount,
    activeOrbcraftSessionIds,
    optimisticSessions,
    trackSession,
    linkSessionToArtifacts,
  } = useSessionManagement(orbcodeArtifacts, projects, selectedProjectId, context);

  // ── OrbCraft Sessions ──────────────────────────────────────────
  const orbcraftSessions = useOrbcraftSessions(activeOrbcraftSessionIds, orbcraftMode);

  // ── Context Files ──────────────────────────────────────────────
  const contextArtifacts = useMemo(() => {
    if (!selectedProject) return [];
    return orbcodeArtifacts
      .filter(a => a.path.includes(`(OrbCode Project) ${selectedProject.name}/Context/`))
      .sort((a, b) => a.filename.localeCompare(b.filename));
  }, [orbcodeArtifacts, selectedProject]);

  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const selectedContextArtifact = useMemo(() => {
    if (!selectedContextId) return null;
    return contextArtifacts.find(a => a.id === selectedContextId) ?? null;
  }, [selectedContextId, contextArtifacts]);

  // ── Hierarchy & Graph State ────────────────────────────────────
  const hierarchy = useMemo(() => {
    if (!selectedProject) return null;
    return buildProjectHierarchy(orbcodeArtifacts, selectedProject.name);
  }, [orbcodeArtifacts, selectedProject]);

  const graphState = useGraphState(hierarchy);
  const {
    showData, setShowData, showUI, setShowUI, showDeps, setShowDeps,
    showConsumers, setShowConsumers, showE2E, setShowE2E, showEnvs, setShowEnvs,
    focusMode, setFocusMode, selectMode, setSelectMode, selectedIds, setSelectedIds,
    selectedNodeId, setSelectedNodeId,
    collapsedNodes, treeChildCounts,
    toggleCollapse, expandAll, collapseAll, expandAllTests, collapseAllTests,
  } = graphState;

  const hiddenIds = useMemo(() => {
    if (!hierarchy || collapsedNodes.size === 0) return new Set<string>();
    return computeHiddenIds(hierarchy.oneWayParents, collapsedNodes);
  }, [hierarchy, collapsedNodes]);

  // ── Graph ──────────────────────────────────────────────────────
  const collapseFilterIds = useMemo(() => {
    if (!hierarchy || hiddenIds.size === 0) return undefined;
    const visible = new Set(hierarchy.allMapIds);
    for (const id of hiddenIds) visible.delete(id);
    return visible;
  }, [hierarchy, hiddenIds]);

  const { fullNodes, fullEdges } = useMemo(() => {
    if (!selectedProject) return { fullNodes: [] as FlowNode[], fullEdges: [] as Edge[] };
    const { nodes, edges } = buildGraph(orbcodeArtifacts, selectedProject.name, {
      showData, showUI, showDeps, showConsumers, showE2E, showEnvs, filterIds: collapseFilterIds,
    });
    return { fullNodes: nodes, fullEdges: edges };
  }, [orbcodeArtifacts, selectedProject, showData, showUI, showDeps, showConsumers, showE2E, showEnvs, collapseFilterIds]);

  // ── Detail Panel ───────────────────────────────────────────────
  // ── Keyboard Shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectMode) {
          setSelectMode(false);
          setSelectedIds(new Set());
        } else if (selectedNodeId) {
          setSelectedNodeId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectMode, selectedNodeId, setSelectMode, setSelectedIds, setSelectedNodeId]);

  const detailArtifact = useMemo(() => {
    if (!selectedNodeId) return null;
    return orbcodeArtifacts.find(a => a.id === selectedNodeId) ?? null;
  }, [selectedNodeId, orbcodeArtifacts]);

  const connectedIds = useMemo(() => {
    if (!selectedNodeId) return null;
    const ids = new Set<string>([selectedNodeId]);
    for (const e of fullEdges) {
      if (e.source === selectedNodeId) ids.add(e.target);
      if (e.target === selectedNodeId) ids.add(e.source);
    }
    return ids;
  }, [selectedNodeId, fullEdges]);

  const { graphNodes, graphEdges } = useMemo(() => {
    if (focusMode && selectedNodeId && connectedIds && selectedProject) {
      const originalNode = fullNodes.find((n: FlowNode) => n.id === selectedNodeId);
      const originalPos = originalNode?.position as { x: number; y: number } | undefined;

      const { nodes, edges } = buildGraph(orbcodeArtifacts, selectedProject.name, {
        showData, showUI, showDeps, showConsumers, showE2E, showEnvs, filterIds: connectedIds,
      });

      if (originalPos) {
        const focusNode = nodes.find((n: FlowNode) => n.id === selectedNodeId);
        if (focusNode) {
          const dx = originalPos.x - focusNode.position.x;
          const dy = originalPos.y - focusNode.position.y;
          for (const n of nodes) { n.position.x += dx; n.position.y += dy; }
        }
      }
      return { graphNodes: nodes, graphEdges: edges };
    }
    return { graphNodes: fullNodes, graphEdges: fullEdges };
  }, [focusMode, selectedNodeId, connectedIds, selectedProject, orbcodeArtifacts, showData, showUI, showDeps, showConsumers, showE2E, showEnvs, fullNodes, fullEdges]);

  const orbcraftTargetIds = useMemo(() => {
    if (!orbcraftMode || orbcraftSessions.length === 0) return new Set<string>();
    const ids = new Set<string>();
    for (const session of orbcraftSessions) {
      for (const id of session.focusArtifactIds) ids.add(id);
    }
    return ids;
  }, [orbcraftMode, orbcraftSessions]);

  const displayNodes = useMemo(() => {
    const hasSelection = selectedNodeId !== null;
    const isFocusing = focusMode && hasSelection;
    const hasMultiSelect = selectMode && selectedIds.size > 0;
    return graphNodes.map((n: FlowNode) => ({
      ...n,
      selected: n.id === selectedNodeId || selectedIds.has(n.id as string),
      data: {
        ...n.data,
        _hasSelection: (hasSelection && !isFocusing) || hasMultiSelect,
        _isConnected: (connectedIds?.has(n.id) ?? false) || selectedIds.has(n.id as string),
        _isCollapsed: collapsedNodes.has(n.id as string),
        _collapsedChildCount: treeChildCounts.get(n.id as string) ?? 0,
        _hasOrbcraftOrb: orbcraftTargetIds.has(n.id as string),
      },
    }));
  }, [graphNodes, selectedNodeId, connectedIds, focusMode, collapsedNodes, treeChildCounts, selectMode, selectedIds, orbcraftTargetIds]);

  const displayEdges = useMemo(() => {
    if (!selectedNodeId || focusMode) return graphEdges;
    return graphEdges.map(e => {
      const connected = e.source === selectedNodeId || e.target === selectedNodeId;
      return {
        ...e,
        style: {
          ...e.style,
          strokeWidth: connected ? 2.5 : 1,
          opacity: connected ? 0.9 : 0.1,
        },
      };
    });
  }, [graphEdges, selectedNodeId, focusMode]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [nodes, setNodes] = useNodesState(displayNodes as any);
  const [edges, setEdges] = useEdgesState(displayEdges);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  useEffect(() => {
    setNodes(displayNodes as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    setEdges(displayEdges);
  }, [displayNodes, displayEdges, setNodes, setEdges]);

  // ── Viewport Recentre on Detail Panel ─────────────────────────
  useEffect(() => {
    if (!rfInstance || !selectedNodeId) return;

    const timer = setTimeout(() => {
      const zoom = rfInstance.getZoom();
      const flowNode = rfInstance.getNode(selectedNodeId);
      if (!flowNode) return;
      const w = flowNode.measured?.width ?? 200;
      const h = flowNode.measured?.height ?? 44;
      const cx = flowNode.position.x + w / 2;
      const cy = flowNode.position.y + h / 2;

      const allNodes = rfInstance.getNodes();
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (const n of allNodes) {
        const nw = n.measured?.width ?? 200;
        const nh = n.measured?.height ?? 44;
        minX = Math.min(minX, n.position.x);
        maxX = Math.max(maxX, n.position.x + nw);
        minY = Math.min(minY, n.position.y);
        maxY = Math.max(maxY, n.position.y + nh);
      }
      const graphW = maxX - minX;
      const graphH = maxY - minY;

      if (allNodes.length > 1 && (graphW > 1 || graphH > 1)) {
        const canvasW = Math.max(100, window.innerWidth - 260 - 640);
        const canvasH = window.innerHeight;
        const viewportFlowW = canvasW / zoom;
        const viewportFlowH = canvasH / zoom;

        const X_BIAS = 0.20;
        const Y_BIAS = 0.30;
        const MARGIN = 0.15;

        const ty = graphH > 1 ? Math.max(0, Math.min(1, (cy - minY) / graphH)) : 0.5;
        const rawYBias = (ty - 0.5) * 2 * viewportFlowH * Y_BIAS;
        const maxYShift = viewportFlowH * (0.5 - MARGIN);
        const yBias = Math.max(-maxYShift, Math.min(maxYShift, rawYBias));

        const tx = graphW > 1 ? Math.max(0, Math.min(1, (cx - minX) / graphW)) : 0.5;
        const rawXBias = (tx - 0.5) * 2 * viewportFlowW * X_BIAS;
        const maxXShift = viewportFlowW * (0.5 - MARGIN);
        const xBias = Math.max(-maxXShift, Math.min(maxXShift, rawXBias));

        rfInstance.setCenter(cx - xBias, cy - yBias, { zoom, duration: 300 });
      } else {
        rfInstance.setCenter(cx, cy, { zoom, duration: 300 });
      }
    }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, rfInstance]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const target = _event.target as HTMLElement;
    if (target.closest('[data-collapse-toggle]')) {
      toggleCollapse(node.id);
      return;
    }
    if (selectMode) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
        return next;
      });
      return;
    }
    setSelectedNodeId(node.id);
  }, [toggleCollapse, selectMode, setSelectedIds, setSelectedNodeId]);

  const isDragSelecting = useRef(false);
  const isShiftDrag = useRef(false);
  const preShiftSelection = useRef<Set<string>>(new Set());

  const onSelectionChange = useCallback<OnSelectionChangeFunc>(({ nodes: selectedNodes }) => {
    if (!selectMode) return;
    if (!isDragSelecting.current) return;
    const draggedIds = new Set(selectedNodes.map(n => n.id));
    if (isShiftDrag.current) {
      const merged = new Set(preShiftSelection.current);
      for (const id of draggedIds) merged.add(id);
      setSelectedIds(merged);
    } else {
      setSelectedIds(draggedIds);
    }
  }, [selectMode, setSelectedIds]);

  const closeDetail = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const onPaneClick = useCallback(() => {
    closeDetail();
    if (selectMode && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [closeDetail, selectMode, selectedIds.size, setSelectedIds]);

  const selectedNode = useMemo(
    () => selectedNodeId ? graphNodes.find((n: FlowNode) => n.id === selectedNodeId) ?? null : null,
    [graphNodes, selectedNodeId],
  );
  const nd = selectedNode ? (selectedNode.data as unknown as MapNodeData) : null;

  // ── Actions ────────────────────────────────────────────────────
  const openActionDialog = useCallback((action: typeof launchAction, target: 'detail' | 'selection' = 'detail') => {
    setLaunchTarget(target);
    setLaunchAction(action);
    setLaunchDialogOpen(true);
  }, []);

  const openRefactorDialog = useCallback((target: 'selection' | 'detail') => {
    setLaunchTarget(target);
    setLaunchAction('refactor');
    setLaunchDialogOpen(true);
  }, []);

  const openRefineDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('refine', target), [openActionDialog]);
  const openCreateFeatureDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-feature', target), [openActionDialog]);
  const openCreateTaskDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-task', target), [openActionDialog]);
  const openCreateUiDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-ui', target), [openActionDialog]);
  const openCreateTestDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-test', target), [openActionDialog]);
  const openCreateE2eDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-e2e', target), [openActionDialog]);
  const openCreateSystemDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-system', target), [openActionDialog]);

  // ── Agent Launchers ────────────────────────────────────────────
  const agentLaunchers = useAgentLaunchers({
    launchTarget,
    detailArtifact,
    selectedIds,
    orbcodeArtifacts,
    graphNodes,
    selectedProject,
    context,
    onDialogClose: () => setLaunchDialogOpen(false),
    onSelectionClear: () => { setSelectedIds(new Set()); setSelectMode(false); },
    onTrackSession: trackSession,
    onLinkSession: linkSessionToArtifacts,
    onSwitchToSessions: () => setSidebarView('sessions'),
  });

  const setArtifactStatus = useCallback(async (status: string) => {
    if (!detailArtifact) return;
    try {
      await context.artifacts.update(detailArtifact.id, {
        frontmatter: { status },
      });
    } catch (err) {
      console.error('Failed to set artifact status:', err);
    }
  }, [detailArtifact, context]);

  const setBulkStatus = useCallback(async (status: string) => {
    const targets = [...selectedIds]
      .map(id => orbcodeArtifacts.find(a => a.id === id))
      .filter(Boolean) as typeof orbcodeArtifacts;
    for (const a of targets) {
      const node = graphNodes.find((n: FlowNode) => n.id === a.id);
      const type = (node?.data as MapNodeData | undefined)?.artifactType;
      if (type === 'feature' || type === 'ui') {
        try {
          await context.artifacts.update(a.id, { frontmatter: { status } });
        } catch (err) {
          console.error(`Failed to set status on ${a.filename}:`, err);
        }
      }
    }
  }, [selectedIds, orbcodeArtifacts, graphNodes, context]);

  // ── Sidebar Tree Item ──────────────────────────────────────────
  const renderTreeNode = useCallback((node: SidebarNode, depth: number, parentKey: string) => {
    const isContainer = node.artifactType === 'system' || node.artifactType === 'testsuite' || node.artifactType === 'ui';
    const isCollapsed = collapsedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedNodeId === node.id;

    const iconMap: Record<string, typeof Layers> = { system: Layers, ui: Layout, feature: Zap, testsuite: TestTubes, test: FlaskConical };
    const iconColorMap: Record<string, string> = { system: 'text-water', ui: 'text-fire', feature: 'text-earth', testsuite: 'text-water', test: 'text-[#43a047]' };
    const NodeIcon = iconMap[node.artifactType] ?? Zap;
    const iconColor = iconColorMap[node.artifactType] ?? 'text-earth';

    return (
      <div key={`${parentKey}-${node.id}`}>
        <button
          onClick={() => setSelectedNodeId(node.id)}
          style={{ paddingLeft: depth * 16 + 8 }}
          className={cn(
            'flex w-full items-center gap-1 py-1 pr-2 text-left text-xs transition hover:bg-accent',
            isSelected && 'bg-accent',
          )}
        >
          {isContainer && hasChildren ? (
            <span
              className="flex-shrink-0 p-0.5 rounded hover:bg-accent-foreground/10"
              onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}
            >
              <ChevronRight className={cn('h-3 w-3 text-muted-foreground transition', !isCollapsed && 'rotate-90')} />
            </span>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <NodeIcon className={cn('h-3 w-3 flex-shrink-0', iconColor)} />
          <span className="truncate flex-1">{node.label}</span>
          {isContainer && isCollapsed && hasChildren && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{treeChildCounts.get(node.id) ?? node.children.length}</span>
          )}
        </button>
        {!isCollapsed && node.children.map(child =>
          renderTreeNode(child, depth + 1, `${parentKey}-${node.id}`),
        )}
      </div>
    );
  }, [collapsedNodes, selectedNodeId, toggleCollapse, treeChildCounts, setSelectedNodeId]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <div className="w-[260px] flex-shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
        {/* Project Switcher */}
        <div className="px-3 py-3 border-b border-border">
          <div className="relative">
            <button
              onClick={() => setProjectMenuOpen(!projectMenuOpen)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 transition hover:bg-accent',
                projectMenuOpen && 'ring-2 ring-ring/50',
              )}
            >
              <Layers className="h-4 w-4 text-brand flex-shrink-0" />
              <span className="text-sm font-semibold truncate flex-1 text-left">
                {selectedProject?.name ?? 'No projects'}
              </span>
              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition flex-shrink-0', projectMenuOpen && 'rotate-180')} />
            </button>
            {projectMenuOpen && projects.length > 1 && (
              <div className="absolute left-0 top-full mt-1 z-50 w-full rounded-lg border border-border bg-card shadow-lg">
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      setProjectMenuOpen(false);
                      closeDetail();
                      setSelectedContextId(null);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left transition first:rounded-t-lg last:rounded-b-lg hover:bg-accent',
                      p.id === selectedProject?.id && 'bg-accent/50',
                    )}
                  >
                    <Layers className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">{p.projectType}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* View Toggle */}
        <div className="px-3 py-2 border-b border-border flex items-center gap-1">
          <button
            onClick={() => setSidebarView('artifacts')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition',
              sidebarView === 'artifacts'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            <MapIcon className="h-3.5 w-3.5" />
            Map
          </button>
          <button
            onClick={() => setSidebarView('sessions')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition',
              sidebarView === 'sessions'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            <Radio className="h-3.5 w-3.5" />
            Sessions
            {activeSessionCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-earth/20 px-1 text-[9px] font-medium text-earth">
                {activeSessionCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setSidebarView('context')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition',
              sidebarView === 'context'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Context
          </button>
          {orbcraftMode && (
            <button
              onClick={() => setSidebarView('orbs')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition',
                sidebarView === 'orbs'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              <Orbit className="h-3.5 w-3.5" />
              Orbs
              {orbcraftSessions.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand/20 px-1 text-[9px] font-medium text-brand">
                  {orbcraftSessions.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto">
          {sidebarView === 'artifacts' && (
            <>
          {hierarchy && hierarchy.tree.length > 0 && (
            <>
              <div className="px-3 py-2 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-water" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Systems</span>
                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    onClick={expandAll}
                    className="p-0.5 rounded hover:bg-accent text-muted-foreground/50 hover:text-muted-foreground transition"
                    title="Expand all"
                  >
                    <ChevronsUpDown className="h-3 w-3" />
                  </button>
                  <button
                    onClick={collapseAll}
                    className="p-0.5 rounded hover:bg-accent text-muted-foreground/50 hover:text-muted-foreground transition"
                    title="Collapse all"
                  >
                    <ChevronsDownUp className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {hierarchy.tree.map(node => renderTreeNode(node, 0, 'root'))}
            </>
          )}

          {hierarchy && hierarchy.testTree.length > 0 && (
            <>
              <div className="px-3 py-2 mt-1 flex items-center gap-1.5 border-t border-border/50">
                <TestTubes className="h-3.5 w-3.5 text-water" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Testing</span>
                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    onClick={expandAllTests}
                    className="p-0.5 rounded hover:bg-accent text-muted-foreground/50 hover:text-muted-foreground transition"
                    title="Expand all tests"
                  >
                    <ChevronsUpDown className="h-3 w-3" />
                  </button>
                  <button
                    onClick={collapseAllTests}
                    className="p-0.5 rounded hover:bg-accent text-muted-foreground/50 hover:text-muted-foreground transition"
                    title="Collapse all tests"
                  >
                    <ChevronsDownUp className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {hierarchy.testTree.map(node => renderTreeNode(node, 0, 'test-root'))}
            </>
          )}

          {hierarchy && hierarchy.uiTree.length > 0 && (
            <>
              <div className="px-3 py-2 mt-1 flex items-center gap-1.5 border-t border-border/50">
                <Layout className="h-3.5 w-3.5 text-fire" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">UI</span>
                <button
                  onClick={() => setShowUI(!showUI)}
                  className={cn('ml-auto p-0.5 rounded transition', showUI ? 'text-fire hover:bg-fire-bg' : 'text-muted-foreground/40 hover:bg-accent')}
                  title={showUI ? 'Hide UI from graph' : 'Show UI on graph'}
                >
                  {showUI ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
              </div>
              {showUI && hierarchy.uiTree.map(node => renderTreeNode(node, 0, 'ui-root'))}
            </>
          )}

          {hierarchy && hierarchy.dataList.length > 0 && (
            <>
              <div className="px-3 py-2 mt-1 flex items-center gap-1.5 border-t border-border/50">
                <Database className="h-3.5 w-3.5 text-[#8b6aaf]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Data</span>
                <button
                  onClick={() => setShowData(!showData)}
                  className={cn('ml-auto p-0.5 rounded transition', showData ? 'text-[#8b6aaf] hover:bg-[#f3eef9]' : 'text-muted-foreground/40 hover:bg-accent')}
                  title={showData ? 'Hide data from graph' : 'Show data on graph'}
                >
                  {showData ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
              </div>
              {showData && hierarchy.dataList.map(node => renderTreeNode(node, 0, 'data-root'))}
            </>
          )}

          {hierarchy && hierarchy.dependencies.length > 0 && (
            <>
              <div className="px-3 py-2 mt-1 flex items-center gap-1.5 border-t border-border/50">
                <PackageOpen className="h-3.5 w-3.5 text-teal" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dependencies</span>
                <button
                  onClick={() => setShowDeps(!showDeps)}
                  className={cn('ml-auto p-0.5 rounded transition', showDeps ? 'text-teal hover:bg-teal-bg' : 'text-muted-foreground/40 hover:bg-accent')}
                  title={showDeps ? 'Hide dependencies from graph' : 'Show dependencies on graph'}
                >
                  {showDeps ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
              </div>
              {showDeps && hierarchy.dependencies.map(node => renderTreeNode(node, 0, 'dep-root'))}
            </>
          )}

          {hierarchy && hierarchy.consumers.length > 0 && (
            <>
              <div className="px-3 py-2 mt-1 flex items-center gap-1.5 border-t border-border/50">
                <UsersIcon className="h-3.5 w-3.5 text-rose" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Consumers</span>
                <button
                  onClick={() => setShowConsumers(!showConsumers)}
                  className={cn('ml-auto p-0.5 rounded transition', showConsumers ? 'text-rose hover:bg-rose-bg' : 'text-muted-foreground/40 hover:bg-accent')}
                  title={showConsumers ? 'Hide consumers from graph' : 'Show consumers on graph'}
                >
                  {showConsumers ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
              </div>
              {showConsumers && hierarchy.consumers.map(node => renderTreeNode(node, 0, 'con-root'))}
            </>
          )}

          {hierarchy && hierarchy.e2eTests.length > 0 && (
            <>
              <div className="px-3 py-2 mt-1 flex items-center gap-1.5 border-t border-border/50">
                <Route className="h-3.5 w-3.5 text-[#fb8c00]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">E2E Tests</span>
                <button
                  onClick={() => setShowE2E(!showE2E)}
                  className={cn('ml-auto p-0.5 rounded transition', showE2E ? 'text-[#fb8c00] hover:bg-[#fff3e0]' : 'text-muted-foreground/40 hover:bg-accent')}
                  title={showE2E ? 'Hide E2E tests from graph' : 'Show E2E tests on graph'}
                >
                  {showE2E ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
              </div>
              {showE2E && hierarchy.e2eTests.map(node => renderTreeNode(node, 0, 'e2e-root'))}
            </>
          )}

          {hierarchy && hierarchy.envs.length > 0 && (
            <>
              <div className="px-3 py-2 mt-1 flex items-center gap-1.5 border-t border-border/50">
                <Server className="h-3.5 w-3.5 text-[#26a69a]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Environments</span>
                <button
                  onClick={() => setShowEnvs(!showEnvs)}
                  className={cn('ml-auto p-0.5 rounded transition', showEnvs ? 'text-[#26a69a] hover:bg-[#e0f2f1]' : 'text-muted-foreground/40 hover:bg-accent')}
                  title={showEnvs ? 'Hide environments from graph' : 'Show environments on graph'}
                >
                  {showEnvs ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
              </div>
              {showEnvs && hierarchy.envs.map(node => renderTreeNode(node, 0, 'env-root'))}
            </>
          )}
            </>
          )}

          {sidebarView === 'sessions' && (
            <div className="px-1 py-2 space-y-0.5">
              {plateSessions.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <Radio className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground/60">No sessions for this project</p>
                </div>
              ) : (
                [...plateSessions].sort((a, b) => {
                  const aEnriched = sessionStatuses.get(a);
                  const bEnriched = sessionStatuses.get(b);
                  const priority = (s: string) => s === 'awaiting-input' ? 0 : s === 'active' ? 1 : 2;
                  const aPriority = priority(aEnriched?.status ?? 'unknown');
                  const bPriority = priority(bEnriched?.status ?? 'unknown');
                  if (aPriority !== bPriority) return aPriority - bPriority;
                  const aTime = aEnriched?.lastActive ? new Date(aEnriched.lastActive).getTime() : 0;
                  const bTime = bEnriched?.lastActive ? new Date(bEnriched.lastActive).getTime() : 0;
                  return bTime - aTime;
                }).map(sid => {
                  const enriched = sessionStatuses.get(sid);
                  const statusLabel = enriched?.status ?? 'unknown';
                  const isActive = statusLabel === 'active' || statusLabel === 'awaiting-input';
                  const title = enriched?.title ?? sid.slice(0, 8);
                  const action = typeof enriched?.metadata?.action === 'string' ? enriched.metadata.action : null;
                  const phaseProgress = [enriched?.phase, enriched?.progress].filter(Boolean).join(' · ');
                  return (
                    <Tooltip key={sid} label={`Session ${sid}`}>
                      <button
                        onClick={() => context.openSession(sid)}
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition text-left"
                      >
                        {isActive ? (
                          <Loader2 className="h-3 w-3 text-earth animate-spin flex-shrink-0" />
                        ) : (
                          <div className={cn('h-2 w-2 rounded-full flex-shrink-0', SESSION_STATUS_COLORS[statusLabel]?.split(' ')[0] ?? 'bg-muted')} />
                        )}
                        <span className="truncate flex-1">{title}</span>
                        {phaseProgress && <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">{phaseProgress}</span>}
                        {action && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 flex-shrink-0 capitalize">
                            {action}
                          </Badge>
                        )}
                        <Badge variant="outline" className={cn('text-[9px] px-1 py-0 flex-shrink-0', SESSION_STATUS_COLORS[statusLabel])}>
                          {statusLabel}
                        </Badge>
                      </button>
                    </Tooltip>
                  );
                })
              )}
            </div>
          )}

          {sidebarView === 'context' && (
            <div className="px-1 py-2 space-y-0.5">
              {contextArtifacts.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <FileText className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground/60">No context files for this project</p>
                </div>
              ) : (
                contextArtifacts.map(a => {
                  const label = stripMd(a.filename).replace(/^.*\.\s+\(\w+\)\s+/, '').replace(/^.*\.\s+\((\w+)\)$/, '$1');
                  const isSelected = selectedContextId === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedContextId(isSelected ? null : a.id)}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition text-left',
                        isSelected && 'bg-accent',
                      )}
                    >
                      <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="truncate flex-1">{label}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {sidebarView === 'orbs' && (
            <div className="px-1 py-2 space-y-0.5">
              {orbcraftSessions.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <Orbit className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground/60">No active orbs</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-1">Sessions with preset or runtime focus artifacts will appear here</p>
                </div>
              ) : (
                orbcraftSessions.map(session => {
                  const focusNames = session.focusArtifactIds
                    .map(id => {
                      const a = orbcodeArtifacts.find(art => art.id === id);
                      return a ? stripMd(a.filename).replace(/^.*\.\s+\(\w+\)\s+/, '').replace(/^.*\.\s+\((\w+)\)$/, '$1') : id.slice(0, 8);
                    });
                  return (
                    <button
                      key={session.sessionId}
                      onClick={() => {
                        if (!rfInstance) return;
                        const targetId = session.focusArtifactIds[0];
                        const node = graphNodes.find((n: FlowNode) => n.id === targetId);
                        if (node) {
                          rfInstance.setCenter(node.position.x + 100, node.position.y + 22, { zoom: 1, duration: 800 });
                          setSelectedNodeId(targetId);
                        }
                      }}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-xs hover:bg-accent transition text-left"
                    >
                      <div
                        className="mt-0.5 h-3 w-3 rounded-full flex-shrink-0 border border-white/50"
                        style={{ backgroundColor: session.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{session.title}</div>
                        {session.phase && (
                          <div className="text-[10px] text-muted-foreground">{session.phase}</div>
                        )}
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {focusNames.length === 1
                            ? focusNames[0]
                            : `${focusNames.length} artifacts: ${focusNames.join(', ')}`}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Quick layer toggles */}
        <div className="border-t border-border px-3 py-2 flex items-center justify-center gap-1">
          <button
            onClick={() => setShowUI(!showUI)}
            className={cn(
              'p-1.5 rounded-md transition',
              showUI ? 'bg-fire-bg text-fire' : 'bg-muted text-muted-foreground/40',
            )}
            title={showUI ? 'Hide UI' : 'Show UI'}
          >
            <Layout className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowData(!showData)}
            className={cn(
              'p-1.5 rounded-md transition',
              showData ? 'bg-[#f3eef9] text-[#8b6aaf]' : 'bg-muted text-muted-foreground/40',
            )}
            title={showData ? 'Hide Data' : 'Show Data'}
          >
            <Database className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowDeps(!showDeps)}
            className={cn(
              'p-1.5 rounded-md transition',
              showDeps ? 'bg-teal-bg text-teal' : 'bg-muted text-muted-foreground/40',
            )}
            title={showDeps ? 'Hide Dependencies' : 'Show Dependencies'}
          >
            <PackageOpen className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowConsumers(!showConsumers)}
            className={cn(
              'p-1.5 rounded-md transition',
              showConsumers ? 'bg-rose-bg text-rose' : 'bg-muted text-muted-foreground/40',
            )}
            title={showConsumers ? 'Hide Consumers' : 'Show Consumers'}
          >
            <UsersIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas */}
      <div className={cn('flex-1 relative', selectMode && 'select-mode-cursor')}>
        <ReactFlow
          onInit={setRfInstance}
          nodes={nodes}
          edges={edges}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onSelectionChange={onSelectionChange}
          onSelectionStart={(e) => {
            isDragSelecting.current = true;
            isShiftDrag.current = e.shiftKey;
            preShiftSelection.current = new Set(selectedIds);
          }}
          onSelectionEnd={() => {
            isDragSelecting.current = false;
            isShiftDrag.current = false;
          }}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          selectionOnDrag={selectMode}
          selectionMode={SelectionMode.Partial}
          panOnDrag={selectMode ? [1, 2] : true}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="bg-background"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
          <Controls
            className="!bg-card !border-border !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent"
            showInteractive={false}
          />
          <MiniMap
            className="!bg-card !border-border !shadow-sm"
            nodeColor={(node) => {
              const data = node.data as unknown as MapNodeData | undefined;
              if (!data?.artifactType) return 'var(--border)';
              const colorMap: Record<string, string> = {
                system: 'var(--water)',
                feature: 'var(--earth)',
                data: '#8b6aaf',
                ui: 'var(--fire)',
                dependency: 'var(--teal)',
                consumer: 'var(--rose)',
                overview: 'var(--air)',
              };
              return colorMap[data.artifactType] ?? 'var(--border)';
            }}
            maskColor="var(--background)"
            pannable
            zoomable
            nodeStrokeWidth={3}
          />

          {/* Mode Toggles */}
          <Panel position="top-left">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFocusMode(!focusMode)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition',
                  focusMode
                    ? 'border-brand/30 bg-brand/10 text-brand'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                <Focus className="h-3.5 w-3.5" />
                Focus
              </button>
              <button
                onClick={() => {
                  setSelectMode(!selectMode);
                  if (selectMode) setSelectedIds(new Set());
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition',
                  selectMode
                    ? 'border-brand/30 bg-brand/10 text-brand'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                <MousePointer2 className="h-3.5 w-3.5" />
                Select
                {selectMode && selectedIds.size > 0 && (
                  <span className="ml-0.5 rounded-full bg-brand/20 px-1.5 text-[10px]">{selectedIds.size}</span>
                )}
              </button>
              <button
                onClick={() => setOrbcraftMode(!orbcraftMode)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition',
                  orbcraftMode
                    ? 'border-brand/30 bg-brand/10 text-brand'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                <Orbit className="h-3.5 w-3.5" />
                OrbCraft
                {orbcraftMode && orbcraftSessions.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-brand/20 px-1.5 text-[10px]">{orbcraftSessions.length}</span>
                )}
              </button>
              <ActionsDropdown onAction={(action) => openActionDialog(action)} />
            </div>
          </Panel>

          {/* Action Bar */}
          {selectMode && selectedIds.size > 0 && (
            <Panel position="bottom-center">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur-sm">
                <span className="text-xs text-muted-foreground">
                  <strong className="text-foreground">{selectedIds.size}</strong> artifact{selectedIds.size > 1 ? 's' : ''} selected
                </span>
                <div className="h-4 w-px bg-border" />
                <button
                  onClick={() => openRefactorDialog('selection')}
                  className="flex items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand/20"
                >
                  <Scissors className="h-3.5 w-3.5" />
                  Refactor
                </button>
                <button
                  onClick={() => openRefineDialog('selection')}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Refine
                </button>
                <ActionsDropdown onAction={(action) => openActionDialog(action, 'selection')} label="Create" />
                <div className="h-4 w-px bg-border" />
                {(['draft', 'stale', 'active', 'verified', 'untested', 'pass', 'fail', 'deprecated'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setBulkStatus(s)}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                      s === 'draft' && 'text-muted-foreground hover:bg-accent',
                      s === 'untested' && 'text-sun hover:bg-sun/10',
                      s === 'stale' && 'text-fire hover:bg-fire/10',
                      s === 'verified' && 'text-earth hover:bg-earth/10',
                      s === 'active' && 'text-earth hover:bg-earth/10',
                      s === 'pass' && 'text-earth hover:bg-earth/10',
                      s === 'fail' && 'text-fire hover:bg-fire/10',
                      s === 'deprecated' && 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {s}
                  </button>
                ))}
                <div className="h-4 w-px bg-border" />
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-accent"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </Panel>
          )}

          {/* Empty State */}
          {nodes.length === 0 && selectedProject && (
            <Panel position="top-center" className="!mt-32">
              <div className="text-center space-y-2">
                <MapIcon className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">No map artifacts found for {selectedProject.name}</p>
                <p className="text-xs text-muted-foreground/60">Map artifacts live in the Map/ subfolder of the OrbCode project</p>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {/* OrbCraft Overlay */}
        {orbcraftMode && rfInstance && orbcraftSessions.length > 0 && (
          <OrbOverlay
            rfInstance={rfInstance}
            sessions={orbcraftSessions}
            hierarchy={hierarchy}
            hiddenIds={hiddenIds}
          />
        )}
      </div>

      {/* Detail Panel */}
      {detailArtifact && !selectedContextArtifact && (
        <DetailPanel
          artifact={detailArtifact}
          nodeData={nd}
          sessionIds={sessionsForArtifact(detailArtifact.id)}
          sessionStatuses={sessionStatuses}
          onRefactor={() => openRefactorDialog('detail')}
          onRefine={() => openRefineDialog('detail')}
          onCreateFeature={() => openCreateFeatureDialog('detail')}
          onCreateUi={() => openCreateUiDialog('detail')}
          onCreateTask={() => openCreateTaskDialog('detail')}
          onCreateTest={() => openCreateTestDialog('detail')}
          onCreateE2e={() => openCreateE2eDialog('detail')}
          onCreateSystem={() => openCreateSystemDialog('detail')}
          onSetStatus={setArtifactStatus}
          onClose={closeDetail}
          onLinkClick={(target) => context.previewWikilink(target)}
          onSessionClick={(sid) => context.openSession(sid)}
        />
      )}

      {/* Context Preview Panel */}
      {selectedContextArtifact && (
        <div className="w-[640px] flex-shrink-0 border-l border-border bg-card overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-semibold truncate">
                {stripMd(selectedContextArtifact.filename).replace(/^.*\.\s+\(\w+\)\s+/, '').replace(/^.*\.\s+\((\w+)\)$/, '$1')}
              </span>
            </div>
            <button type="button" onClick={() => setSelectedContextId(null)} title="Close" className="ml-1 rounded-md p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-4">
            <ArtifactPreview
              frontmatter={selectedContextArtifact.frontmatter}
              body={selectedContextArtifact.body}
              onLinkClick={(target) => context.previewWikilink(target)}
            />
          </div>
        </div>
      )}

      {/* Launch Dialog */}
      <LaunchDialog
        open={launchDialogOpen}
        action={launchAction}
        artifactCount={launchTarget === 'detail' ? 1 : selectedIds.size}
        onConfirm={
          launchAction === 'refine' ? agentLaunchers.launchRefine
          : launchAction === 'create-feature' ? agentLaunchers.launchCreateFeature
          : launchAction === 'create-ui' ? agentLaunchers.launchCreateUi
          : launchAction === 'create-task' ? agentLaunchers.launchCreateTask
          : launchAction === 'create-test' ? agentLaunchers.launchCreateTest
          : launchAction === 'create-e2e' ? agentLaunchers.launchCreateE2e
          : launchAction === 'create-system' ? agentLaunchers.launchCreateSystem
          : agentLaunchers.launchRefactor
        }
        onCancel={() => setLaunchDialogOpen(false)}
      />
    </div>
  );
}
