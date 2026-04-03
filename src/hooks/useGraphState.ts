import { useCallback, useMemo, useState } from 'react';
import type { ProjectHierarchy, SidebarNode } from '../lib/orbcode';

export function useGraphState(hierarchy: ProjectHierarchy | null) {
  // ── Visibility Filters ────────────────────────────────────────────
  const [showData, setShowData] = useState(true);
  const [showUI, setShowUI] = useState(true);
  const [showDeps, setShowDeps] = useState(true);
  const [showConsumers, setShowConsumers] = useState(true);
  const [showE2E, setShowE2E] = useState(true);
  const [showEnvs, setShowEnvs] = useState(true);

  // ── Modes ─────────────────────────────────────────────────────────
  const [focusMode, setFocusMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Selection ─────────────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // ── Collapse State ────────────────────────────────────────────────
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

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

  return {
    // Visibility
    showData, setShowData,
    showUI, setShowUI,
    showDeps, setShowDeps,
    showConsumers, setShowConsumers,
    showE2E, setShowE2E,
    showEnvs, setShowEnvs,
    // Modes
    focusMode, setFocusMode,
    selectMode, setSelectMode,
    selectedIds, setSelectedIds,
    // Selection
    selectedNodeId, setSelectedNodeId,
    // Collapse
    collapsedNodes,
    setCollapsedNodes,
    treeChildCounts,
    toggleCollapse,
    expandAll,
    collapseAll,
    expandAllTests,
    collapseAllTests,
  };
}
