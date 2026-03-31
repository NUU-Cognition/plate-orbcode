import type { Artifact } from '@nuucognition/plate-sdk';
import type { Edge } from '@xyflow/react';
import {
  type FlowNode,
  type MapArtifactType,
  type MapNodeData,
  type FeatureEntry,
  TYPE_COLUMN,
  isEdgeAllowed,
} from './types';
import {
  stripMd,
  detectArtifactType,
  extractLabel,
  extractDescription,
  extractArtifactStatus,
  extractCodeRefs,
  extractArtifactRefs,
  belongsToProject,
  isMapLayerArtifact,
} from './detectors';
import { applyColumnLayout } from './layout';

export function buildGraph(
  artifacts: Artifact[],
  projectName: string,
  opts: { showData?: boolean; showUI?: boolean; showDeps?: boolean; showConsumers?: boolean; showTests?: boolean; showTestSuites?: boolean; showE2E?: boolean; showEnvs?: boolean; filterIds?: Set<string> } = {},
): { nodes: FlowNode[]; edges: Edge[]; features: FeatureEntry[] } {
  const { showData = true, showUI = true, showDeps = true, showConsumers = true, showTests = true, showTestSuites = true, showE2E = true, showEnvs = true, filterIds } = opts;

  const inProject = artifacts.filter(a => belongsToProject(a, projectName));
  let projectArtifacts = inProject.filter(a => isMapLayerArtifact(a));

  // Focus mode: keep only the specified subset
  if (filterIds) {
    projectArtifacts = projectArtifacts.filter(a => filterIds.has(a.id));
  }

  // Layer visibility filters
  const hiddenTypes = new Set<MapArtifactType>();
  if (!showData) hiddenTypes.add('data');
  if (!showUI) hiddenTypes.add('ui');
  if (!showDeps) hiddenTypes.add('dependency');
  if (!showConsumers) hiddenTypes.add('consumer');
  if (!showTests) hiddenTypes.add('test');
  if (!showTestSuites) hiddenTypes.add('testsuite');
  if (!showE2E) hiddenTypes.add('e2e');
  if (!showEnvs) hiddenTypes.add('env');
  if (hiddenTypes.size > 0) {
    projectArtifacts = projectArtifacts.filter(a => !hiddenTypes.has(detectArtifactType(a.filename)));
  }
  // Lookup by stripped filename for edge resolution
  const byName = new Map<string, Artifact>();
  const typeOf = new Map<string, MapArtifactType>();
  for (const a of projectArtifacts) {
    byName.set(stripMd(a.filename), a);
    typeOf.set(a.id, detectArtifactType(a.filename));
  }

  // Build parent maps by following one-way refs downward
  const systemArtifacts = projectArtifacts.filter(a => typeOf.get(a.id) === 'system');
  const featureParent = new Map<string, string>();

  // First pass: direct system → feature ownership
  for (const sys of systemArtifacts) {
    const sysLabel = extractLabel(sys.filename);
    for (const refName of extractArtifactRefs(sys.frontmatter)) {
      const target = byName.get(refName);
      if (target && typeOf.get(target.id) === 'feature' && !featureParent.has(target.id)) {
        featureParent.set(target.id, sysLabel);
      }
    }
  }

  // Second pass: propagate system ownership through feature → sub-feature refs (BFS)
  const queue = [...featureParent.entries()].map(([id, sys]) => ({ id, sys }));
  while (queue.length > 0) {
    const { id, sys } = queue.shift()!;
    const artifact = projectArtifacts.find(a => a.id === id);
    if (!artifact) continue;
    for (const refName of extractArtifactRefs(artifact.frontmatter)) {
      const target = byName.get(refName);
      if (target && typeOf.get(target.id) === 'feature' && !featureParent.has(target.id)) {
        featureParent.set(target.id, sys);
        queue.push({ id: target.id, sys });
      }
    }
  }

  // ── Compute hierarchy depth for systems and features ────────────
  const sameTypeChildren = new Map<string, string[]>();
  const hasIncomingSameType = new Set<string>();

  const sameTypeRefKeys = new Set<string>();
  for (const a of projectArtifacts) {
    const sourceType = typeOf.get(a.id)!;
    for (const refName of extractArtifactRefs(a.frontmatter)) {
      const target = byName.get(refName);
      if (!target || target.id === a.id) continue;
      const targetType = typeOf.get(target.id)!;
      if (sourceType === targetType && (sourceType === 'system' || sourceType === 'feature' || sourceType === 'ui' || sourceType === 'testsuite' || sourceType === 'test')) {
        sameTypeRefKeys.add(`${a.id}->${target.id}`);
      }
    }
  }

  for (const a of projectArtifacts) {
    const sourceType = typeOf.get(a.id)!;
    for (const refName of extractArtifactRefs(a.frontmatter)) {
      const target = byName.get(refName);
      if (!target || target.id === a.id) continue;
      const targetType = typeOf.get(target.id)!;
      if (sourceType === targetType && (sourceType === 'system' || sourceType === 'feature' || sourceType === 'ui' || sourceType === 'testsuite' || sourceType === 'test')) {
        if (sameTypeRefKeys.has(`${target.id}->${a.id}`)) continue;
        if (!sameTypeChildren.has(a.id)) sameTypeChildren.set(a.id, []);
        sameTypeChildren.get(a.id)!.push(target.id);
        hasIncomingSameType.add(target.id);
      }
    }
  }

  // BFS from roots to assign depth
  const depthOf = new Map<string, number>();
  const depthQueue: { id: string; depth: number }[] = [];
  for (const a of projectArtifacts) {
    const t = typeOf.get(a.id)!;
    if ((t === 'system' || t === 'feature' || t === 'ui' || t === 'testsuite' || t === 'test') && !hasIncomingSameType.has(a.id)) {
      depthOf.set(a.id, 0);
      depthQueue.push({ id: a.id, depth: 0 });
    }
  }
  while (depthQueue.length > 0) {
    const { id, depth } = depthQueue.shift()!;
    for (const childId of sameTypeChildren.get(id) ?? []) {
      if (!depthOf.has(childId)) {
        depthOf.set(childId, depth + 1);
        depthQueue.push({ id: childId, depth: depth + 1 });
      }
    }
  }
  for (const a of projectArtifacts) {
    if (!depthOf.has(a.id)) depthOf.set(a.id, 0);
  }

  // Create nodes
  const nodes: FlowNode[] = projectArtifacts.map(a => {
    const type = typeOf.get(a.id)!;
    return {
      id: a.id,
      type: 'mapNode',
      position: { x: 0, y: 0 },
      draggable: false,
      connectable: false,
      data: {
        artifact: a,
        label: extractLabel(a.filename),
        artifactType: type,
        featureStatus: extractArtifactStatus(a.frontmatter, type),
        codeRefCount: extractCodeRefs(a.frontmatter),
        description: extractDescription(a.body),
        parentSystem: featureParent.get(a.id) ?? null,
        column: TYPE_COLUMN[type],
        depth: depthOf.get(a.id) ?? 0,
      },
    };
  });

  // ── Create directed edges ─────────────────────────────────────────
  const nodeIdSet = new Set(nodes.map(n => n.id));
  const edgeDedup = new Set<string>();
  const edges: Edge[] = [];
  const dagreEdges: { source: string; target: string; minlen: number; sameColumn: boolean }[] = [];

  const allEdgeKeys = new Set<string>();
  for (const a of projectArtifacts) {
    const sourceType = typeOf.get(a.id)!;
    for (const refName of extractArtifactRefs(a.frontmatter)) {
      const target = byName.get(refName);
      if (!target || !nodeIdSet.has(target.id) || target.id === a.id) continue;
      const targetType = typeOf.get(target.id)!;
      if (!isEdgeAllowed(sourceType, targetType)) continue;
      allEdgeKeys.add(`${a.id}->${target.id}`);
    }
  }

  for (const a of projectArtifacts) {
    const sourceType = typeOf.get(a.id)!;
    for (const refName of extractArtifactRefs(a.frontmatter)) {
      const target = byName.get(refName);
      if (!target || !nodeIdSet.has(target.id) || target.id === a.id) continue;
      const targetType = typeOf.get(target.id)!;
      if (!isEdgeAllowed(sourceType, targetType)) continue;

      const edgeKey = `${a.id}->${target.id}`;
      if (edgeDedup.has(edgeKey)) continue;
      edgeDedup.add(edgeKey);

      const reverseKey = `${target.id}->${a.id}`;
      const isMutual = allEdgeKeys.has(reverseKey);

      if (isMutual) {
        if (edgeDedup.has(reverseKey)) continue;
        edgeDedup.add(reverseKey);
      }

      let stroke = 'var(--border)';
      const isSameColumn = TYPE_COLUMN[sourceType] === TYPE_COLUMN[targetType];
      if (sourceType === 'feature' && targetType === 'feature') stroke = 'var(--earth)';
      else if (sourceType === 'system' && targetType === 'system') stroke = 'var(--water)';
      else if (sourceType === 'ui' && targetType === 'ui') stroke = 'var(--fire)';
      else if (sourceType === 'system') stroke = 'var(--water)';

      if (!isMutual) {
        dagreEdges.push({ source: a.id, target: target.id, minlen: 1, sameColumn: isSameColumn });
      }

      edges.push({
        id: isMutual ? `${a.id}<->${target.id}` : `${a.id}->${target.id}`,
        source: a.id,
        target: target.id,
        sourceHandle: 'right-out',
        targetHandle: 'left-in',
        type: 'smoothstep',
        animated: false,
        style: {
          strokeWidth: isSameColumn ? 2 : 1.5,
          stroke,
          opacity: isMutual ? 0.7 : isSameColumn ? 0.6 : 0.35,
        },
      });
    }
  }

  // Extract feature list
  const features: FeatureEntry[] = nodes
    .filter(n => (n.data as MapNodeData).artifactType === 'feature')
    .map(n => {
      const d = n.data as MapNodeData;
      return {
        id: n.id,
        label: d.label,
        description: d.description,
        parentSystem: d.parentSystem,
        featureStatus: d.featureStatus,
        codeRefCount: d.codeRefCount,
        artifact: d.artifact,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return { ...applyColumnLayout(nodes, edges, dagreEdges), features };
}
