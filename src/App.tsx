import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArtifactPreview,
  useArtifacts,
  useMentionAutocomplete,
  usePlateContext,
  useSessionStatuses,
  type ArtifactSuggestion as SDKArtifactSuggestion,
  type EnrichedSessionStatus,
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
  ClipboardList,
  Database,
  Eye,
  EyeOff,
  FileText,
  Focus,
  Layers,
  Layout,
  Loader2,
  LoaderCircle,
  Map as MapIcon,
  MousePointer2,
  Orbit,
  PackageOpen,
  Plus,
  Puzzle,
  Radio,
  Scissors,
  Sparkles,
  Users as UsersIcon,
  X,
  Zap,
  TestTubes,
  Route,
  Server,
  FlaskConical,
} from 'lucide-react';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { MapPreviewStatusField } from './components/MapPreviewStatusField';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './components/ui/dialog';
import { Textarea } from './components/ui/textarea';
import { Tooltip } from './components/ui/tooltip';
import { cn } from './lib/utils';
import {
  buildGraph,
  buildProjectHierarchy,
  computeHiddenIds,
  isOrbCodeArtifact,
  stripMd,
  toProject,
  TYPE_COLORS,
  type MapNodeData,
  type OrbCodeProject,
  type SidebarNode,
} from './lib/orbcode';
import { MapNode } from './components/nodes/MapNode';
import { OrbOverlay } from './components/OrbOverlay';
import { useOrbcraftSessions } from './hooks/useOrbcraftSessions';
import { renderOrbCodePrompt } from './lib/prompts';

// ── Standalone ──────────────────────────────────────────────────────

function StandaloneApp() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10">
          <MapIcon className="h-6 w-6 text-brand" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">OrbCode Map</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Open this plate inside Steel, or run with{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">?server=http://localhost:7433&plate=orbcode-map</code>{' '}
          to connect in dev mode.
        </p>
      </div>
    </main>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FlowNode = any;

// ── Node Types ──────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  mapNode: MapNode,
};

// ── Session Helpers ─────────────────────────────────────────────────

/** Extract session IDs from the unified `orbh-sessions` frontmatter field. */
function extractSessionIds(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter['orbh-sessions'];
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const match = entry.trim().match(/^\[\[(.+)\]\]$/);
    const id = match ? match[1].trim() : entry.trim();
    if (id) ids.push(id);
  }
  return ids;
}

const SESSION_STATUS_COLORS: Record<string, string> = {
  active: 'bg-earth text-white',
  'awaiting-input': 'bg-sun text-white',
  finished: 'bg-muted text-muted-foreground',
  failed: 'bg-fire text-white',
  unknown: 'bg-muted text-muted-foreground',
};

// ── Connected App ───────────────────────────────────────────────────

function ConnectedApp() {
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
  const [showData, setShowData] = useState(true);
  const [showUI, setShowUI] = useState(true);
  const [showDeps, setShowDeps] = useState(true);
  const [showConsumers, setShowConsumers] = useState(true);
  const [showE2E, setShowE2E] = useState(true);
  const [showEnvs, setShowEnvs] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [launchAction, setLaunchAction] = useState<'refactor' | 'refine' | 'create-feature' | 'create-ui' | 'create-task' | 'create-test' | 'create-e2e' | 'create-system'>('refactor');
  const [launchTarget, setLaunchTarget] = useState<'selection' | 'detail'>('selection');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [orbcraftMode, setOrbcraftMode] = useState(true);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [sidebarView, setSidebarView] = useState<'artifacts' | 'sessions' | 'context' | 'orbs'>('artifacts');

  // ── Session Tracking ──────────────────────────────────────────
  // Discover sessions from artifact frontmatter (persists across refresh)
  const { artifactSessionIds, sessionToArtifacts } = useMemo(() => {
    const ids = new Set<string>();
    const mapping = new Map<string, string[]>();
    for (const a of orbcodeArtifacts) {
      for (const sid of extractSessionIds(a.frontmatter)) {
        ids.add(sid);
        const existing = mapping.get(sid) ?? [];
        existing.push(a.id);
        mapping.set(sid, existing);
      }
    }
    return { artifactSessionIds: ids, sessionToArtifacts: mapping };
  }, [orbcodeArtifacts]);

  // Optimistic overlay for freshly launched sessions (before artifact SSE catches up)
  const [optimisticSessions, setOptimisticSessions] = useState<Map<string, string[]>>(new Map()); // sessionId → artifactIds
  const [optimisticStatuses, setOptimisticStatuses] = useState<Map<string, EnrichedSessionStatus>>(new Map());

  // Merge artifact + optimistic session IDs
  const allSessionIds = useMemo(() => {
    const ids = new Set(artifactSessionIds);
    for (const sid of optimisticSessions.keys()) ids.add(sid);
    return [...ids].sort();
  }, [artifactSessionIds, optimisticSessions]);

  const sdkSessionStatuses = useSessionStatuses(allSessionIds);

  // Merge SDK statuses with optimistic layer
  const sessionStatuses = useMemo(() => {
    if (optimisticStatuses.size === 0) return sdkSessionStatuses;
    const merged = new Map(sdkSessionStatuses);
    for (const [id, status] of optimisticStatuses) {
      if (!sdkSessionStatuses.has(id) || sdkSessionStatuses.get(id)?.status === 'unknown') {
        merged.set(id, status);
      }
    }
    return merged;
  }, [sdkSessionStatuses, optimisticStatuses]);

  // Clean up optimistic state once artifact SSE / SDK catches up
  useEffect(() => {
    if (optimisticSessions.size === 0 && optimisticStatuses.size === 0) return;
    let sessionsChanged = false;
    let statusesChanged = false;
    const nextSessions = new Map(optimisticSessions);
    const nextStatuses = new Map(optimisticStatuses);
    for (const [sid] of optimisticSessions) {
      if (artifactSessionIds.has(sid)) { nextSessions.delete(sid); sessionsChanged = true; }
    }
    for (const [sid] of optimisticStatuses) {
      const sdk = sdkSessionStatuses.get(sid);
      if (sdk && sdk.status !== 'unknown') { nextStatuses.delete(sid); statusesChanged = true; }
    }
    if (sessionsChanged) setOptimisticSessions(nextSessions);
    if (statusesChanged) setOptimisticStatuses(nextStatuses);
  }, [artifactSessionIds, sdkSessionStatuses, optimisticSessions, optimisticStatuses]);

  // Filter to sessions launched from this plate for the current project
  const currentProjectName = useMemo(() => {
    const proj = projects.find(p => p.id === selectedProjectId) ?? projects[0];
    return proj?.name ?? null;
  }, [projects, selectedProjectId]);

  const plateSessions = useMemo(() => {
    return allSessionIds.filter(sid => {
      const status = sessionStatuses.get(sid);
      if (!status?.metadata || status.metadata.plate !== 'orbcode-map') return false;
      if (currentProjectName && status.metadata.project) {
        return status.metadata.project === currentProjectName;
      }
      return true;
    });
  }, [allSessionIds, sessionStatuses, currentProjectName]);

  // Sessions for a specific artifact
  const sessionsForArtifact = useCallback((artifactId: string) => {
    return plateSessions.filter(sid => {
      const fromArtifact = sessionToArtifacts.get(sid) ?? [];
      const fromOptimistic = optimisticSessions.get(sid) ?? [];
      return fromArtifact.includes(artifactId) || fromOptimistic.includes(artifactId);
    });
  }, [plateSessions, sessionToArtifacts, optimisticSessions]);

  // Active session count (for sidebar badge)
  const activeSessionCount = useMemo(() => {
    let count = 0;
    for (const sid of plateSessions) {
      const status = sessionStatuses.get(sid)?.status;
      if (status === 'active' || status === 'awaiting-input') count++;
    }
    return count;
  }, [plateSessions, sessionStatuses]);

  // ── OrbCraft Sessions ──────────────────────────────────────────
  const activeOrbcraftSessionIds = useMemo(() => {
    return plateSessions.filter(sid => {
      const status = sessionStatuses.get(sid)?.status;
      return status === 'active' || status === 'awaiting-input';
    });
  }, [plateSessions, sessionStatuses]);

  const orbcraftSessions = useOrbcraftSessions(activeOrbcraftSessionIds, orbcraftMode);

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

  // ── Hierarchy & Collapse ───────────────────────────────────────
  const hierarchy = useMemo(() => {
    if (!selectedProject) return null;
    return buildProjectHierarchy(orbcodeArtifacts, selectedProject.name);
  }, [orbcodeArtifacts, selectedProject]);

  const hiddenIds = useMemo(() => {
    if (!hierarchy || collapsedNodes.size === 0) return new Set<string>();
    return computeHiddenIds(hierarchy.oneWayParents, collapsedNodes);
  }, [hierarchy, collapsedNodes]);

  // Tree descendant counts for collapsed badges
  const treeChildCounts = useMemo(() => {
    if (!hierarchy) return new Map<string, number>();
    const counts = new Map<string, number>();
    const countDescendants = (nodes: SidebarNode[]): number => {
      let c = 0;
      for (const n of nodes) { c += 1; c += countDescendants(n.children); }
      return c;
    };
    const visit = (nodes: SidebarNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) counts.set(n.id, countDescendants(n.children));
        visit(n.children);
      }
    };
    visit(hierarchy.tree);
    visit(hierarchy.uiTree);
    visit(hierarchy.testTree);
    return counts;
  }, [hierarchy]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const collectContainerIds = useCallback((nodes: SidebarNode[]): string[] => {
    const ids: string[] = [];
    for (const n of nodes) {
      if ((n.artifactType === 'system' || n.artifactType === 'testsuite' || n.artifactType === 'ui') && n.children.length > 0) {
        ids.push(n.id);
      }
      ids.push(...collectContainerIds(n.children));
    }
    return ids;
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedNodes(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    if (!hierarchy) return;
    const ids = [
      ...collectContainerIds(hierarchy.tree),
      ...collectContainerIds(hierarchy.uiTree),
      ...collectContainerIds(hierarchy.testTree),
    ];
    setCollapsedNodes(new Set(ids));
  }, [hierarchy, collectContainerIds]);

  const expandAllTests = useCallback(() => {
    if (!hierarchy) return;
    const testIds = new Set(collectContainerIds(hierarchy.testTree));
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      for (const id of testIds) next.delete(id);
      return next;
    });
  }, [hierarchy, collectContainerIds]);

  const collapseAllTests = useCallback(() => {
    if (!hierarchy) return;
    const testIds = collectContainerIds(hierarchy.testTree);
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      for (const id of testIds) next.add(id);
      return next;
    });
  }, [hierarchy, collectContainerIds]);

  // ── Graph ──────────────────────────────────────────────────────
  // Visible IDs = all map IDs minus hidden (collapsed children)
  const collapseFilterIds = useMemo(() => {
    if (!hierarchy || hiddenIds.size === 0) return undefined;
    const visible = new Set(hierarchy.allMapIds);
    for (const id of hiddenIds) visible.delete(id);
    return visible;
  }, [hierarchy, hiddenIds]);

  // Full graph re-layouts when collapse changes (hidden nodes excluded from dagre)
  const { fullNodes, fullEdges } = useMemo(() => {
    if (!selectedProject) return { fullNodes: [] as FlowNode[], fullEdges: [] as Edge[] };
    const { nodes, edges } = buildGraph(orbcodeArtifacts, selectedProject.name, {
      showData, showUI, showDeps, showConsumers, showE2E, showEnvs, filterIds: collapseFilterIds,
    });
    return { fullNodes: nodes, fullEdges: edges };
  }, [orbcodeArtifacts, selectedProject, showData, showUI, showDeps, showConsumers, showE2E, showEnvs, collapseFilterIds]);

  // ── Detail Panel ───────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
  }, [selectMode, selectedNodeId]);

  const detailArtifact = useMemo(() => {
    if (!selectedNodeId) return null;
    return orbcodeArtifacts.find(a => a.id === selectedNodeId) ?? null;
  }, [selectedNodeId, orbcodeArtifacts]);

  // Adjacency from collapse-filtered graph
  const connectedIds = useMemo(() => {
    if (!selectedNodeId) return null;
    const ids = new Set<string>([selectedNodeId]);
    for (const e of fullEdges) {
      if (e.source === selectedNodeId) ids.add(e.target);
      if (e.target === selectedNodeId) ids.add(e.source);
    }
    return ids;
  }, [selectedNodeId, fullEdges]);

  // Focus graph: re-layout with only connected visible nodes
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

  // IDs of artifacts that have active orbcraft orbs orbiting them
  const orbcraftTargetIds = useMemo(() => {
    if (!orbcraftMode || orbcraftSessions.length === 0) return new Set<string>();
    const ids = new Set<string>();
    for (const session of orbcraftSessions) {
      for (const id of session.focusArtifactIds) ids.add(id);
    }
    return ids;
  }, [orbcraftMode, orbcraftSessions]);

  // Display nodes: selection highlight + collapse indicator (no hidden — already filtered out)
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

  // Style edges
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

  // ── Viewport Recentre on Detail Panel ─────────────────────────────
  // Biases both axes based on where the node sits in the graph so
  // edge nodes don't leave large empty areas around them. Horizontal
  // bias is subtler and uses actual canvas width (minus sidebar + panel).
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

      // Compute graph bounding box from all visible nodes
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
        // Actual canvas size (sidebar 260 + detail panel 640 are outside)
        const canvasW = Math.max(100, window.innerWidth - 260 - 640);
        const canvasH = window.innerHeight;
        const viewportFlowW = canvasW / zoom;
        const viewportFlowH = canvasH / zoom;

        // Bias strengths — subtle horizontal, stronger vertical
        const X_BIAS = 0.20;
        const Y_BIAS = 0.30;
        // Safety margin: node stays at least 15 % of visible from edge
        const MARGIN = 0.15;

        // Vertical bias
        const ty = graphH > 1 ? Math.max(0, Math.min(1, (cy - minY) / graphH)) : 0.5;
        const rawYBias = (ty - 0.5) * 2 * viewportFlowH * Y_BIAS;
        const maxYShift = viewportFlowH * (0.5 - MARGIN);
        const yBias = Math.max(-maxYShift, Math.min(maxYShift, rawYBias));

        // Horizontal bias
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
  }, [toggleCollapse, selectMode]);

  // Track whether the user is actively drag-selecting (vs programmatic selection changes)
  const isDragSelecting = useRef(false);
  const isShiftDrag = useRef(false);
  const preShiftSelection = useRef<Set<string>>(new Set());

  // Sync React Flow's internal drag-selection with our selectedIds state.
  // Only applies during an active drag — click-to-toggle is handled by onNodeClick.
  // When Shift is held during drag, merge with the pre-existing selection.
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
  }, [selectMode]);

  const closeDetail = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    closeDetail();
    if (selectMode && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [closeDetail, selectMode, selectedIds.size]);

  const selectedNode = useMemo(
    () => selectedNodeId ? graphNodes.find((n: FlowNode) => n.id === selectedNodeId) ?? null : null,
    [graphNodes, selectedNodeId],
  );
  const nd = selectedNode ? (selectedNode.data as unknown as MapNodeData) : null;

  // ── Actions ────────────────────────────────────────────────────
  const openRefactorDialog = useCallback((target: 'selection' | 'detail') => {
    setLaunchTarget(target);
    setLaunchAction('refactor');
    setLaunchDialogOpen(true);
  }, []);

  const openActionDialog = useCallback((action: typeof launchAction, target: 'detail' | 'selection' = 'detail') => {
    setLaunchTarget(target);
    setLaunchAction(action);
    setLaunchDialogOpen(true);
  }, []);

  const openRefineDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('refine', target), [openActionDialog]);
  const openCreateFeatureDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-feature', target), [openActionDialog]);
  const openCreateTaskDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-task', target), [openActionDialog]);
  const openCreateUiDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-ui', target), [openActionDialog]);
  const openCreateTestDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-test', target), [openActionDialog]);
  const openCreateE2eDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-e2e', target), [openActionDialog]);
  const openCreateSystemDialog = useCallback((target: 'detail' | 'selection' = 'detail') => openActionDialog('create-system', target), [openActionDialog]);

  const launchRefactor = useCallback(async (runtime: string, additionalContext: string) => {
    const targetIds = launchTarget === 'detail' && detailArtifact
      ? [detailArtifact.id]
      : [...selectedIds];

    const artifacts = targetIds
      .map(id => orbcodeArtifacts.find(a => a.id === id))
      .filter(Boolean) as typeof orbcodeArtifacts;

    if (artifacts.length === 0) return;

    // Build short names for title
    const names = artifacts.map(a => {
      const node = graphNodes.find((n: FlowNode) => n.id === a.id);
      const d = node?.data as MapNodeData | undefined;
      return d?.label ?? a.filename;
    });
    const nameList = names.length <= 3
      ? names.join(', ')
      : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;

    const title = `Refactor: ${nameList}`;
    const pathList = artifacts.map(a => `- ${a.path}`).join('\n');

    const prompt = await renderOrbCodePrompt('refactor', {
      artifactPaths: pathList,
      additionalContext: additionalContext.trim() || undefined,
    });

    setLaunchDialogOpen(false);
    if (launchTarget === 'selection') {
      setSelectedIds(new Set());
      setSelectMode(false);
    }

    try {
      // Link session to the first artifact (OrbH writes sessionId to its frontmatter automatically)
      const { sessionId, session } = await context.launchAgent({
        prompt,
        shard: 'OrbCode',
        title,
        description: `Refactoring ${artifacts.length} OrbCode artifact${artifacts.length > 1 ? 's' : ''}`,
        runtime,
        artifactId: artifacts[0].id,
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'refactor', 'orbcraft-artifacts': artifacts.map(a => a.id).join(',') },
      });

      // Append session ID to ALL selected artifacts' orbh-sessions frontmatter
      // (launchAgent only writes to the first one via artifactId)
      const sessionRef = `[[${sessionId}]]`;
      for (const a of artifacts.slice(1)) {
        const existing = Array.isArray(a.frontmatter['orbh-sessions'])
          ? (a.frontmatter['orbh-sessions'] as string[])
          : [];
        if (!existing.some(e => e.includes(sessionId))) {
          context.artifacts.update(a.id, {
            frontmatter: { 'orbh-sessions': [...existing, sessionRef] },
          });
        }
      }

      // Optimistically track session + status before SSE catches up
      const artifactIds = artifacts.map(a => a.id);
      setOptimisticSessions(prev => new Map(prev).set(sessionId, artifactIds));
      setOptimisticStatuses(prev => {
        const next = new Map(prev);
        const enriched: EnrichedSessionStatus = {
          status: 'active',
          title: session?.title ?? title,
          runCount: session?.runCount ?? 0,
          lastActive: session?.updated,
          metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'refactor', 'orbcraft-artifacts': artifacts.map(a => a.id).join(',') },
        };
        next.set(sessionId, enriched);
        return next;
      });
      setSidebarView('sessions');
    } catch (err) {
      console.error('Failed to launch refactor agent:', err);
    }
  }, [launchTarget, detailArtifact, selectedIds, orbcodeArtifacts, graphNodes, context, selectedProject]);

  const launchRefine = useCallback(async (runtime: string, userPrompt: string) => {
    const targetIds = launchTarget === 'detail' && detailArtifact
      ? [detailArtifact.id]
      : [...selectedIds];

    const artifacts = targetIds
      .map(id => orbcodeArtifacts.find(a => a.id === id))
      .filter(Boolean) as typeof orbcodeArtifacts;

    if (artifacts.length === 0) return;

    const names = artifacts.map(a => {
      const node = graphNodes.find((n: FlowNode) => n.id === a.id);
      return (node?.data as MapNodeData | undefined)?.label ?? a.filename;
    });
    const nameList = names.length <= 3
      ? names.join(', ')
      : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
    const title = `Refine: ${nameList}`;

    const pathList = artifacts.map(a => `- ${a.path}`).join('\n');

    // Gather referenced artifact paths from all targets
    const allRefs = new Set<string>();
    const allCodeRefs = new Set<string>();
    for (const a of artifacts) {
      for (const r of (a.frontmatter['artifact-refs'] as string[] | undefined) ?? []) allRefs.add(r);
      for (const r of (a.frontmatter['code-refs'] as string[] | undefined) ?? []) allCodeRefs.add(r);
    }

    const prompt = await renderOrbCodePrompt('refine', {
      artifactPaths: pathList,
      referencedArtifacts: allRefs.size > 0 ? [...allRefs].map(r => `- ${r}`).join('\n') : undefined,
      codeReferences: allCodeRefs.size > 0 ? [...allCodeRefs].map(r => `- ${r}`).join('\n') : undefined,
      additionalContext: userPrompt.trim() || undefined,
    });

    setLaunchDialogOpen(false);
    if (launchTarget === 'selection') {
      setSelectedIds(new Set());
      setSelectMode(false);
    }

    try {
      const { sessionId, session } = await context.launchAgent({
        prompt,
        shard: 'OrbCode',
        title,
        description: `Refining ${artifacts.length} OrbCode artifact${artifacts.length > 1 ? 's' : ''}`,
        runtime,
        artifactId: artifacts[0].id,
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'refine', 'orbcraft-artifacts': artifacts.map(a => a.id).join(',') },
      });

      // Link session to all artifacts
      const sessionRef = `[[${sessionId}]]`;
      for (const a of artifacts.slice(1)) {
        const existing = Array.isArray(a.frontmatter['orbh-sessions'])
          ? (a.frontmatter['orbh-sessions'] as string[])
          : [];
        if (!existing.some(e => e.includes(sessionId))) {
          context.artifacts.update(a.id, {
            frontmatter: { 'orbh-sessions': [...existing, sessionRef] },
          });
        }
      }

      setOptimisticSessions(prev => new Map(prev).set(sessionId, artifacts.map(a => a.id)));
      setOptimisticStatuses(prev => {
        const next = new Map(prev);
        next.set(sessionId, {
          status: 'active',
          title: session?.title ?? title,
          runCount: session?.runCount ?? 0,
          lastActive: session?.updated,
          metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'refine', 'orbcraft-artifacts': artifacts.map(a => a.id).join(',') },
        });
        return next;
      });
      setSidebarView('sessions');
    } catch (err) {
      console.error('Failed to launch refine agent:', err);
    }
  }, [launchTarget, detailArtifact, selectedIds, orbcodeArtifacts, graphNodes, context, selectedProject]);

  /** Resolve context artifacts from either detail panel or selection. */
  const resolveContextArtifacts = useCallback(() => {
    if (launchTarget === 'detail' && detailArtifact) {
      return [detailArtifact];
    }
    return [...selectedIds]
      .map(id => orbcodeArtifacts.find(a => a.id === id))
      .filter(Boolean) as typeof orbcodeArtifacts;
  }, [launchTarget, detailArtifact, selectedIds, orbcodeArtifacts]);

  /** After a create/refine action from selection, clear selection state. */
  const clearSelectionIfNeeded = useCallback(() => {
    if (launchTarget === 'selection') {
      setSelectedIds(new Set());
      setSelectMode(false);
    }
  }, [launchTarget]);

  /** Build a name summary for titles. */
  const summarizeNames = useCallback((artifacts: typeof orbcodeArtifacts) => {
    const names = artifacts.map(a => {
      const node = graphNodes.find((n: FlowNode) => n.id === a.id);
      return (node?.data as MapNodeData | undefined)?.label ?? a.filename;
    });
    return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
  }, [graphNodes]);

  /** Track optimistic session state for launched agents. */
  const trackSession = useCallback((sessionId: string, artifactIds: string[], title: string, action: string, session: { title?: string; runCount?: number; updated?: string } | null | undefined) => {
    setOptimisticSessions(prev => new Map(prev).set(sessionId, artifactIds));
    setOptimisticStatuses(prev => {
      const next = new Map(prev);
      next.set(sessionId, {
        status: 'active',
        title: session?.title ?? title,
        runCount: session?.runCount ?? 0,
        lastActive: session?.updated,
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action, 'orbcraft-artifacts': artifactIds.join(',') },
      });
      return next;
    });
    setSidebarView('sessions');
  }, [selectedProject]);

  /** Link session to multiple artifacts (beyond the first that launchAgent handles). */
  const linkSessionToArtifacts = useCallback((sessionId: string, artifacts: typeof orbcodeArtifacts) => {
    const sessionRef = `[[${sessionId}]]`;
    for (const a of artifacts.slice(1)) {
      const existing = Array.isArray(a.frontmatter['orbh-sessions'])
        ? (a.frontmatter['orbh-sessions'] as string[])
        : [];
      if (!existing.some(e => e.includes(sessionId))) {
        context.artifacts.update(a.id, {
          frontmatter: { 'orbh-sessions': [...existing, sessionRef] },
        });
      }
    }
  }, [context]);

  const launchCreateFeature = useCallback(async (runtime: string, userPrompt: string) => {
    const contextArtifacts = resolveContextArtifacts();
    const pathList = contextArtifacts.map(a => `- ${a.path}`).join('\n');
    const hasContext = contextArtifacts.length > 0;
    const nameList = hasContext ? summarizeNames(contextArtifacts) : '';

    const title = hasContext
      ? `Create Feature: under ${nameList}`
      : 'Create Feature';

    const prompt = await renderOrbCodePrompt('create-feature', {
      artifactPaths: hasContext ? pathList : undefined,
      additionalContext: userPrompt.trim() || undefined,
    });

    setLaunchDialogOpen(false);
    clearSelectionIfNeeded();

    try {
      const { sessionId, session } = await context.launchAgent({
        prompt,
        shard: 'OrbCode',
        title,
        description: `Creating draft feature${hasContext ? ` under ${nameList}` : ''}`,
        runtime,
        ...(hasContext ? { artifactId: contextArtifacts[0].id } : {}),
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'create-feature', 'orbcraft-artifacts': contextArtifacts.map(a => a.id).join(',') },
      });

      if (hasContext) {
        linkSessionToArtifacts(sessionId, contextArtifacts);
        trackSession(sessionId, contextArtifacts.map(a => a.id), title, 'create-feature', session);
      } else {
        trackSession(sessionId, [], title, 'create-feature', session);
      }
    } catch (err) {
      console.error('Failed to launch create-feature agent:', err);
    }
  }, [resolveContextArtifacts, summarizeNames, clearSelectionIfNeeded, linkSessionToArtifacts, trackSession, context, selectedProject]);

  const launchCreateUi = useCallback(async (runtime: string, userPrompt: string) => {
    const contextArtifacts = resolveContextArtifacts();
    const pathList = contextArtifacts.map(a => `- ${a.path}`).join('\n');
    const hasContext = contextArtifacts.length > 0;
    const nameList = hasContext ? summarizeNames(contextArtifacts) : '';

    const title = hasContext ? `Create UI: under ${nameList}` : 'Create UI';

    const prompt = await renderOrbCodePrompt('create-ui', {
      artifactPaths: hasContext ? pathList : undefined,
      additionalContext: userPrompt.trim() || undefined,
    });

    setLaunchDialogOpen(false);
    clearSelectionIfNeeded();

    try {
      const { sessionId, session } = await context.launchAgent({
        prompt, shard: 'OrbCode', title,
        description: `Creating draft UI${hasContext ? ` under ${nameList}` : ''}`,
        runtime,
        ...(hasContext ? { artifactId: contextArtifacts[0].id } : {}),
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'create-ui', 'orbcraft-artifacts': contextArtifacts.map(a => a.id).join(',') },
      });
      if (hasContext) linkSessionToArtifacts(sessionId, contextArtifacts);
      trackSession(sessionId, hasContext ? contextArtifacts.map(a => a.id) : [], title, 'create-ui', session);
    } catch (err) {
      console.error('Failed to launch create-ui agent:', err);
    }
  }, [resolveContextArtifacts, summarizeNames, clearSelectionIfNeeded, linkSessionToArtifacts, trackSession, context, selectedProject]);

  const launchCreateTask = useCallback(async (runtime: string, userPrompt: string) => {
    const contextArtifacts = resolveContextArtifacts();
    const pathList = contextArtifacts.map(a => `- ${a.path}`).join('\n');
    const hasContext = contextArtifacts.length > 0;
    const nameList = hasContext ? summarizeNames(contextArtifacts) : '';
    const title = hasContext ? `Create Task: ${nameList}` : 'Create Task';

    const prompt = await renderOrbCodePrompt('create-task', {
      artifactPaths: hasContext ? pathList : undefined,
      additionalContext: userPrompt.trim() || undefined,
    });

    setLaunchDialogOpen(false);
    clearSelectionIfNeeded();

    try {
      const { sessionId, session } = await context.launchAgent({
        prompt, shard: 'OrbCode', title,
        description: `Creating task${hasContext ? ` for ${contextArtifacts.length} artifact${contextArtifacts.length > 1 ? 's' : ''}` : ''}`,
        runtime,
        ...(hasContext ? { artifactId: contextArtifacts[0].id } : {}),
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'create-task', 'orbcraft-artifacts': contextArtifacts.map(a => a.id).join(',') },
      });
      if (hasContext) linkSessionToArtifacts(sessionId, contextArtifacts);
      trackSession(sessionId, hasContext ? contextArtifacts.map(a => a.id) : [], title, 'create-task', session);
    } catch (err) {
      console.error('Failed to launch create-task agent:', err);
    }
  }, [resolveContextArtifacts, summarizeNames, clearSelectionIfNeeded, linkSessionToArtifacts, trackSession, context, selectedProject]);

  const launchCreateTest = useCallback(async (runtime: string, userPrompt: string) => {
    const contextArtifacts = resolveContextArtifacts();
    const pathList = contextArtifacts.map(a => `- ${a.path}`).join('\n');
    const hasContext = contextArtifacts.length > 0;
    const nameList = hasContext ? summarizeNames(contextArtifacts) : '';
    const title = hasContext ? `Create Test: for ${nameList}` : 'Create Test';

    const prompt = await renderOrbCodePrompt('create-test', {
      artifactPaths: hasContext ? pathList : undefined,
      additionalContext: userPrompt.trim() || undefined,
    });

    setLaunchDialogOpen(false);
    clearSelectionIfNeeded();

    try {
      const { sessionId, session } = await context.launchAgent({
        prompt, shard: 'OrbCode', title,
        description: `Creating draft test${hasContext ? ` for ${nameList}` : ''}`,
        runtime,
        ...(hasContext ? { artifactId: contextArtifacts[0].id } : {}),
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'create-test', 'orbcraft-artifacts': contextArtifacts.map(a => a.id).join(',') },
      });
      if (hasContext) linkSessionToArtifacts(sessionId, contextArtifacts);
      trackSession(sessionId, hasContext ? contextArtifacts.map(a => a.id) : [], title, 'create-test', session);
    } catch (err) {
      console.error('Failed to launch create-test agent:', err);
    }
  }, [resolveContextArtifacts, summarizeNames, clearSelectionIfNeeded, linkSessionToArtifacts, trackSession, context, selectedProject]);

  const launchCreateE2e = useCallback(async (runtime: string, userPrompt: string) => {
    const contextArtifacts = resolveContextArtifacts();
    const pathList = contextArtifacts.map(a => `- ${a.path}`).join('\n');
    const hasContext = contextArtifacts.length > 0;
    const nameList = hasContext ? summarizeNames(contextArtifacts) : '';
    const title = hasContext ? `Create E2E: spanning ${nameList}` : 'Create E2E';

    const prompt = await renderOrbCodePrompt('create-e2e', {
      artifactPaths: hasContext ? pathList : undefined,
      additionalContext: userPrompt.trim() || undefined,
    });

    setLaunchDialogOpen(false);
    clearSelectionIfNeeded();

    try {
      const { sessionId, session } = await context.launchAgent({
        prompt, shard: 'OrbCode', title,
        description: `Creating draft E2E test${hasContext ? ` spanning ${nameList}` : ''}`,
        runtime,
        ...(hasContext ? { artifactId: contextArtifacts[0].id } : {}),
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'create-e2e', 'orbcraft-artifacts': contextArtifacts.map(a => a.id).join(',') },
      });
      if (hasContext) linkSessionToArtifacts(sessionId, contextArtifacts);
      trackSession(sessionId, hasContext ? contextArtifacts.map(a => a.id) : [], title, 'create-e2e', session);
    } catch (err) {
      console.error('Failed to launch create-e2e agent:', err);
    }
  }, [resolveContextArtifacts, summarizeNames, clearSelectionIfNeeded, linkSessionToArtifacts, trackSession, context, selectedProject]);

  const launchCreateSystem = useCallback(async (runtime: string, userPrompt: string) => {
    const contextArtifacts = resolveContextArtifacts();
    const pathList = contextArtifacts.map(a => `- ${a.path}`).join('\n');
    const hasContext = contextArtifacts.length > 0;
    const nameList = hasContext ? summarizeNames(contextArtifacts) : '';
    const title = hasContext ? `Create System: under ${nameList}` : 'Create System';

    const prompt = await renderOrbCodePrompt('create-system', {
      artifactPaths: hasContext ? pathList : undefined,
      additionalContext: userPrompt.trim() || undefined,
    });

    setLaunchDialogOpen(false);
    clearSelectionIfNeeded();

    try {
      const { sessionId, session } = await context.launchAgent({
        prompt, shard: 'OrbCode', title,
        description: `Creating draft system${hasContext ? ` under ${nameList}` : ''}`,
        runtime,
        ...(hasContext ? { artifactId: contextArtifacts[0].id } : {}),
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'create-system', 'orbcraft-artifacts': contextArtifacts.map(a => a.id).join(',') },
      });
      if (hasContext) linkSessionToArtifacts(sessionId, contextArtifacts);
      trackSession(sessionId, hasContext ? contextArtifacts.map(a => a.id) : [], title, 'create-system', session);
    } catch (err) {
      console.error('Failed to launch create-system agent:', err);
    }
  }, [resolveContextArtifacts, summarizeNames, clearSelectionIfNeeded, linkSessionToArtifacts, trackSession, context, selectedProject]);

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
  }, [collapsedNodes, selectedNodeId, toggleCollapse, treeChildCounts]);

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
          onRefine={openRefineDialog}
          onCreateFeature={openCreateFeatureDialog}
          onCreateUi={openCreateUiDialog}
          onCreateTask={openCreateTaskDialog}
          onCreateTest={openCreateTestDialog}
          onCreateE2e={openCreateE2eDialog}
          onCreateSystem={openCreateSystemDialog}
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
          launchAction === 'refine' ? launchRefine
          : launchAction === 'create-feature' ? launchCreateFeature
          : launchAction === 'create-ui' ? launchCreateUi
          : launchAction === 'create-task' ? launchCreateTask
          : launchAction === 'create-test' ? launchCreateTest
          : launchAction === 'create-e2e' ? launchCreateE2e
          : launchAction === 'create-system' ? launchCreateSystem
          : launchRefactor
        }
        onCancel={() => setLaunchDialogOpen(false)}
      />
    </div>
  );
}

// ── Actions Dropdown ────────────────────────────────────────────────

type ActionType = 'create-feature' | 'create-ui' | 'create-test' | 'create-e2e' | 'create-system' | 'create-task';

const ACTION_ITEMS: { action: ActionType; label: string; icon: typeof Plus }[] = [
  { action: 'create-feature', label: 'Feature', icon: Zap },
  { action: 'create-system', label: 'System', icon: Layers },
  { action: 'create-ui', label: 'UI', icon: Layout },
  { action: 'create-test', label: 'Test', icon: FlaskConical },
  { action: 'create-e2e', label: 'E2E', icon: Route },
  { action: 'create-task', label: 'Task', icon: ClipboardList },
];

function ActionsDropdown({ onAction, label = 'Actions' }: { onAction: (action: ActionType) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as unknown as globalThis.Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('mousedown', handlePointerDown); window.removeEventListener('keydown', handleKeyDown); };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition',
          open
            ? 'border-brand/30 bg-brand/10 text-brand'
            : 'border-border bg-card text-muted-foreground hover:bg-accent',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {label}
        <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-xl">
          {ACTION_ITEMS.map(({ action, label: itemLabel, icon: Icon }) => (
            <button
              key={action}
              type="button"
              onClick={() => { setOpen(false); onAction(action); }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {itemLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detail Panel ────────────────────────────────────────────────────

function DetailPanel({
  artifact,
  nodeData,
  sessionIds,
  sessionStatuses,
  onRefactor,
  onRefine,
  onCreateFeature,
  onCreateUi,
  onCreateTask,
  onCreateTest,
  onCreateE2e,
  onCreateSystem,
  onSetStatus,
  onClose,
  onLinkClick,
  onSessionClick,
}: {
  artifact: { id: string; filename: string; frontmatter: Record<string, unknown>; body: string; path?: string };
  nodeData: MapNodeData | null;
  sessionIds: string[];
  sessionStatuses: Map<string, EnrichedSessionStatus>;
  onRefactor: () => void;
  onRefine: () => void;
  onCreateFeature: () => void;
  onCreateUi: () => void;
  onCreateTask: () => void;
  onCreateTest: () => void;
  onCreateE2e: () => void;
  onCreateSystem: () => void;
  onSetStatus: (status: string) => void;
  onClose: () => void;
  onLinkClick: (target: string) => void;
  onSessionClick: (sessionId: string) => void;
}) {
  const hasActiveSession = sessionIds.some(sid => {
    const st = sessionStatuses.get(sid)?.status;
    return st === 'active' || st === 'awaiting-input';
  });

  const hasLifecycle = nodeData != null && nodeData.artifactType !== 'project' && nodeData.artifactType !== 'unknown';

  return (
    <div className="w-[640px] flex-shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {nodeData && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] py-0.5',
                TYPE_COLORS[nodeData.artifactType].text,
              )}
            >
              {nodeData.artifactType}
            </Badge>
          )}
          <span className="text-sm font-semibold truncate">
            {nodeData?.label ?? artifact.filename}
          </span>
          {hasActiveSession && (
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-earth opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-earth" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasLifecycle && (
            <MapPreviewStatusField
              frontmatter={artifact.frontmatter}
              disabled={false}
              onChange={onSetStatus}
            />
          )}
          {nodeData?.artifactType === 'overview' && (
            <Tooltip label="Create System">
              <Button size="icon" variant="outline" onClick={onCreateSystem} aria-label="Create System" className="h-7 w-7">
                <Layers className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {(nodeData?.artifactType === 'system' || nodeData?.artifactType === 'feature') && (
            <Tooltip label="Create Feature">
              <Button size="icon" variant="outline" onClick={onCreateFeature} aria-label="Create Feature" className="h-7 w-7">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {(nodeData?.artifactType === 'system' || nodeData?.artifactType === 'feature' || nodeData?.artifactType === 'ui') && (
            <Tooltip label="Create UI">
              <Button size="icon" variant="outline" onClick={onCreateUi} aria-label="Create UI" className="h-7 w-7">
                <Layout className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {(nodeData?.artifactType === 'feature' || nodeData?.artifactType === 'ui') && (
            <Tooltip label="Create Test">
              <Button size="icon" variant="outline" onClick={onCreateTest} aria-label="Create Test" className="h-7 w-7">
                <FlaskConical className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {(nodeData?.artifactType === 'system' || nodeData?.artifactType === 'feature') && (
            <Tooltip label="Create E2E">
              <Button size="icon" variant="outline" onClick={onCreateE2e} aria-label="Create E2E" className="h-7 w-7">
                <Route className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {hasLifecycle && (
            <Tooltip label="Create Task">
              <Button size="icon" variant="outline" onClick={onCreateTask} aria-label="Create Task" className="h-7 w-7">
                <ClipboardList className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          <Tooltip label="Refine">
            <Button size="icon" variant="outline" onClick={onRefine} aria-label="Refine" className="h-7 w-7">
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <Tooltip label="Refactor">
            <Button size="icon" variant="outline" onClick={onRefactor} aria-label="Refactor" className="h-7 w-7">
              <Scissors className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <button type="button" onClick={onClose} title="Close" className="ml-1 rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4">
        <ArtifactPreview
          frontmatter={artifact.frontmatter}
          body={artifact.body}
          onLinkClick={onLinkClick}
          onSessionClick={onSessionClick}
          sessionStatuses={sessionStatuses}
          renderFieldValue={({ key, frontmatter: fm }) => {
            if (key !== 'status') return undefined;
            return (
              <MapPreviewStatusField
                frontmatter={fm}
                disabled={false}
                onChange={onSetStatus}
              />
            );
          }}
        />
      </div>
    </div>
  );
}

// ── Launch Dialog ───────────────────────────────────────────────────

function LaunchDialog({
  open,
  action = 'refactor',
  artifactCount,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  action?: 'refactor' | 'refine' | 'create-feature' | 'create-ui' | 'create-task' | 'create-test' | 'create-e2e' | 'create-system';
  artifactCount: number;
  onConfirm: (runtime: string, additionalContext: string) => void;
  onCancel: () => void;
}) {
  const [runtime, setRuntime] = useState(() => {
    try { return localStorage.getItem('preferred-runtime') ?? 'claude'; } catch { return 'claude'; }
  });
  const [additionalContext, setAdditionalContext] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mention = useMentionAutocomplete();

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open) {
      setAdditionalContext('');
      mention.reset();
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open]);

  const handleConfirm = () => {
    try { localStorage.setItem('preferred-runtime', runtime); } catch { /* ignore */ }
    onConfirm(runtime, additionalContext);
  };

  const insertSuggestion = (suggestion: SDKArtifactSuggestion) => {
    const link = mention.insertMention(suggestion);
    if (!link) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? additionalContext.length;
    const triggerIndex = additionalContext.lastIndexOf('@', cursor - 1);
    if (triggerIndex === -1) return;
    const next = `${additionalContext.slice(0, triggerIndex)}${link}${additionalContext.slice(cursor)}`;
    const nextCursor = triggerIndex + link.length;
    setAdditionalContext(next);
    mention.reset();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogClose onClose={onCancel} />
        <DialogHeader>
          <DialogTitle>
            {action === 'refine' ? 'Refine Artifact'
              : action === 'create-feature' ? 'Create Feature'
              : action === 'create-ui' ? 'Create UI'
              : action === 'create-task' ? 'Create Task'
              : action === 'create-test' ? 'Create Test'
              : action === 'create-e2e' ? 'Create E2E Test'
              : action === 'create-system' ? 'Create System'
              : 'Refactor Artifacts'}
          </DialogTitle>
          <DialogDescription>
            {action === 'refine'
              ? 'Launch an agent to refine this artifact. It will gather context from surrounding artifacts and code before applying your instructions.'
              : action === 'create-feature'
              ? 'Launch an agent to create a new draft feature in the OrbCode map.'
              : action === 'create-ui'
              ? 'Launch an agent to create a new draft UI surface in the OrbCode map.'
              : action === 'create-task'
              ? 'Launch an agent to create a task for modifying this artifact. The task will be linked back to the artifact.'
              : action === 'create-test'
              ? 'Launch an agent to create a draft test that verifies the selected feature.'
              : action === 'create-e2e'
              ? 'Launch an agent to create a draft E2E test spanning systems and features.'
              : action === 'create-system'
              ? 'Launch an agent to create a new system boundary in the OrbCode map.'
              : `Launch an agent to refactor ${artifactCount} artifact${artifactCount > 1 ? 's' : ''} based on your instructions.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {/* Runtime */}
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">Runtime</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRuntime('claude')}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  runtime === 'claude'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-border/60 text-muted-foreground hover:border-brand/40 hover:text-foreground',
                )}
              >
                Claude
              </button>
              <button
                type="button"
                onClick={() => setRuntime('codex')}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  runtime === 'codex'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-border/60 text-muted-foreground hover:border-brand/40 hover:text-foreground',
                )}
              >
                Codex
              </button>
            </div>
          </div>

          {/* Prompt */}
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">
              Instructions <span className="font-normal text-muted-foreground">(what should the agent do?)</span>
            </label>
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={additionalContext}
                onChange={(e) => {
                  setAdditionalContext(e.target.value);
                  mention.onInputChange(e.target.value, textareaRef.current);
                }}
                onKeyDown={(e) => {
                  if (mention.suggestionsOpen && mention.suggestions.length > 0) {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape') {
                      mention.onKeyDown(e);
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const suggestion = mention.suggestions[mention.selectedIndex] ?? mention.suggestions[0];
                      if (suggestion) insertSuggestion(suggestion);
                      return;
                    }
                  }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
                placeholder={
                  action === 'refine'
                    ? 'e.g. Update code-refs to match the latest file structure... (use @ to reference artifacts)'
                    : action === 'create-feature'
                    ? 'e.g. A feature that handles webhook delivery with retry logic and dead-letter queue...'
                    : action === 'create-ui'
                    ? 'e.g. A REST API endpoint for managing user settings, with GET/PUT/DELETE...'
                    : action === 'create-task'
                    ? 'e.g. Implement using the existing event system. Add unit tests for retry logic...'
                    : action === 'create-test'
                    ? 'e.g. Unit test that verifies the retry logic handles timeout and network errors...'
                    : action === 'create-e2e'
                    ? 'e.g. End-to-end flow: user creates project → adds features → runs sync...'
                    : action === 'create-system'
                    ? 'e.g. A system boundary for the authentication and authorization subsystem...'
                    : 'e.g. Split this feature into two — one for the CLI command and one for the core logic... (use @ to reference artifacts)'
                }
                className="min-h-20 text-xs"
              />
              {mention.suggestionsOpen && mention.suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border/60 bg-background shadow-lg">
                  {mention.suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertSuggestion(suggestion);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                        index === mention.selectedIndex
                          ? 'bg-brand/8 text-brand'
                          : 'hover:bg-muted/40 text-foreground',
                      )}
                    >
                      {suggestion.path.startsWith('Shards/') ? (
                        <Puzzle className="h-3 w-3 shrink-0 text-violet-500" />
                      ) : (
                        <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{suggestion.filename.replace(/\.md$/i, '')}</span>
                      {suggestion.path.startsWith('Shards/') && (
                        <span className="ml-auto shrink-0 rounded bg-violet-500/10 px-1 py-px text-[10px] text-violet-500">shard</span>
                      )}
                    </button>
                  ))}
                  {mention.loading && (
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground">
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                      Searching...
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              The agent will read the selected artifacts and apply your instructions. <kbd className="rounded bg-muted px-1">Cmd+Enter</kbd> to confirm.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            <Sparkles className="h-3.5 w-3.5" />
            Launch Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Root ─────────────────────────────────────────────────────────────

export function App({ connected }: { connected: boolean }) {
  return connected ? <ConnectedApp /> : <StandaloneApp />;
}
