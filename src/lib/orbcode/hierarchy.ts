import type { Artifact } from '@nuucognition/plate-sdk';
import type { MapArtifactType, SidebarNode, ProjectHierarchy } from './types';
import {
  stripMd,
  detectArtifactType,
  extractLabel,
  extractArtifactRefs,
  belongsToProject,
  isMapLayerArtifact,
} from './detectors';

/**
 * Build the sidebar tree and one-way parent map for a project.
 * Tree: systems as collapsible folders, features as leaves.
 * One-way parents: used by computeHiddenIds for collapse cascade.
 */
export function buildProjectHierarchy(
  artifacts: Artifact[],
  projectName: string,
): ProjectHierarchy {
  const inProject = artifacts.filter(a => belongsToProject(a, projectName));
  const mapArtifacts = inProject.filter(a => isMapLayerArtifact(a));

  const byName = new Map<string, Artifact>();
  const typeOf = new Map<string, MapArtifactType>();
  const artifactById = new Map<string, Artifact>();
  for (const a of mapArtifacts) {
    byName.set(stripMd(a.filename), a);
    typeOf.set(a.id, detectArtifactType(a.filename));
    artifactById.set(a.id, a);
  }

  const allMapIds = new Set(mapArtifacts.map(a => a.id));

  // Raw refs for mutual detection (no ALLOWED_EDGE filter)
  const rawRefKeys = new Set<string>();
  for (const a of mapArtifacts) {
    for (const refName of extractArtifactRefs(a.frontmatter)) {
      const target = byName.get(refName);
      if (target && target.id !== a.id && allMapIds.has(target.id)) {
        rawRefKeys.add(`${a.id}->${target.id}`);
      }
    }
  }

  const oneWayParents = new Map<string, Set<string>>();
  const treeChildren = new Map<string, string[]>();

  for (const a of mapArtifacts) {
    const sourceType = typeOf.get(a.id)!;
    if (sourceType !== 'system' && sourceType !== 'testsuite' && sourceType !== 'ui') continue;
    for (const refName of extractArtifactRefs(a.frontmatter)) {
      const target = byName.get(refName);
      if (!target || target.id === a.id || !allMapIds.has(target.id)) continue;
      const targetType = typeOf.get(target.id)!;

      if (sourceType === 'system' && targetType !== 'system' && targetType !== 'feature') continue;
      if (sourceType === 'testsuite' && targetType !== 'testsuite' && targetType !== 'test') continue;
      if (sourceType === 'ui' && targetType !== 'ui') continue;

      if (targetType === sourceType && rawRefKeys.has(`${target.id}->${a.id}`)) continue;

      if (!oneWayParents.has(target.id)) oneWayParents.set(target.id, new Set());
      oneWayParents.get(target.id)!.add(a.id);

      if (!treeChildren.has(a.id)) treeChildren.set(a.id, []);
      treeChildren.get(a.id)!.push(target.id);
    }
  }

  // Build tree nodes recursively
  const buildTreeNode = (id: string, visited: Set<string>): SidebarNode | null => {
    if (visited.has(id)) return null;
    visited.add(id);
    const a = artifactById.get(id)!;
    const type = typeOf.get(id)!;
    const children: SidebarNode[] = [];
    for (const childId of treeChildren.get(id) ?? []) {
      const child = buildTreeNode(childId, new Set(visited));
      if (child) children.push(child);
    }
    const isContainer = (t: string) => t === 'system' || t === 'testsuite' || t === 'ui';
    children.sort((x, y) => {
      const xc = isContainer(x.artifactType);
      const yc = isContainer(y.artifactType);
      if (xc && !yc) return -1;
      if (!xc && yc) return 1;
      return x.label.localeCompare(y.label);
    });
    return { id, label: extractLabel(a.filename), artifactType: type, artifact: a, children };
  };

  const ownedByParent = new Set<string>();
  for (const [, childIds] of treeChildren) {
    for (const cid of childIds) ownedByParent.add(cid);
  }

  // System tree
  const rootSystems = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'system' && !ownedByParent.has(a.id))
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)));

  const tree: SidebarNode[] = [];
  for (const sys of rootSystems) {
    const node = buildTreeNode(sys.id, new Set());
    if (node) tree.push(node);
  }

  // Orphan features
  const inTree = new Set<string>();
  const collectIds = (nodes: SidebarNode[]) => {
    for (const n of nodes) { inTree.add(n.id); collectIds(n.children); }
  };
  collectIds(tree);

  const orphanFeatures = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'feature' && !inTree.has(a.id))
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)));

  for (const f of orphanFeatures) {
    tree.push({
      id: f.id,
      label: extractLabel(f.filename),
      artifactType: typeOf.get(f.id)!,
      artifact: f,
      children: [],
    });
  }

  // UI tree
  const rootUIs = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'ui' && !ownedByParent.has(a.id))
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)));

  const uiTree: SidebarNode[] = [];
  for (const ui of rootUIs) {
    const node = buildTreeNode(ui.id, new Set());
    if (node) uiTree.push(node);
  }

  // Data (flat list)
  const dataList: SidebarNode[] = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'data')
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)))
    .map(a => ({ id: a.id, label: extractLabel(a.filename), artifactType: 'data' as MapArtifactType, artifact: a, children: [] }));

  // Dependencies (flat list)
  const dependencies: SidebarNode[] = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'dependency')
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)))
    .map(a => ({ id: a.id, label: extractLabel(a.filename), artifactType: 'dependency' as MapArtifactType, artifact: a, children: [] }));

  // Consumers (flat list)
  const consumers: SidebarNode[] = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'consumer')
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)))
    .map(a => ({ id: a.id, label: extractLabel(a.filename), artifactType: 'consumer' as MapArtifactType, artifact: a, children: [] }));

  // Test tree
  const rootSuites = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'testsuite' && !ownedByParent.has(a.id))
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)));

  const testTree: SidebarNode[] = [];
  for (const suite of rootSuites) {
    const node = buildTreeNode(suite.id, new Set());
    if (node) testTree.push(node);
  }

  const inTestTree = new Set<string>();
  const collectTestIds = (nodes: SidebarNode[]) => {
    for (const n of nodes) { inTestTree.add(n.id); collectTestIds(n.children); }
  };
  collectTestIds(testTree);

  const orphanTests = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'test' && !inTestTree.has(a.id))
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)));

  for (const t of orphanTests) {
    testTree.push({
      id: t.id,
      label: extractLabel(t.filename),
      artifactType: typeOf.get(t.id)!,
      artifact: t,
      children: [],
    });
  }

  // E2E Tests (flat list)
  const e2eTests: SidebarNode[] = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'e2e')
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)))
    .map(a => ({ id: a.id, label: extractLabel(a.filename), artifactType: 'e2e' as MapArtifactType, artifact: a, children: [] }));

  // Environments (flat list)
  const envs: SidebarNode[] = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'env')
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)))
    .map(a => ({ id: a.id, label: extractLabel(a.filename), artifactType: 'env' as MapArtifactType, artifact: a, children: [] }));

  return { tree, uiTree, testTree, dataList, dependencies, consumers, e2eTests, envs, oneWayParents, allMapIds };
}

/**
 * Given a potentially hidden artifact ID, walk up the oneWayParents hierarchy
 * and return the first ancestor that is visible (not in hiddenIds).
 */
export function resolveVisibleAncestor(
  artifactId: string,
  hiddenIds: Set<string>,
  oneWayParents: Map<string, Set<string>>,
): string {
  if (!hiddenIds.has(artifactId)) return artifactId;

  const queue = [artifactId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const parents = oneWayParents.get(current);
    if (!parents) continue;

    for (const parentId of parents) {
      if (!hiddenIds.has(parentId)) return parentId;
      queue.push(parentId);
    }
  }

  return artifactId;
}

/**
 * Given collapsed system IDs, compute which node IDs should be hidden.
 */
export function computeHiddenIds(
  oneWayParents: Map<string, Set<string>>,
  collapsedIds: Set<string>,
): Set<string> {
  if (collapsedIds.size === 0) return new Set();
  const hidden = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [childId, parents] of oneWayParents) {
      if (hidden.has(childId)) continue;
      let allParentsGone = true;
      for (const pid of parents) {
        if (!collapsedIds.has(pid) && !hidden.has(pid)) { allParentsGone = false; break; }
      }
      if (allParentsGone) { hidden.add(childId); changed = true; }
    }
  }
  return hidden;
}
