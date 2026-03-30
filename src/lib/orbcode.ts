import type { Artifact } from '@nuucognition/plate-sdk';
import type { Edge } from '@xyflow/react';
import dagre from 'dagre';

// ── Types ────────────────────────────────────────────────────────────

export type MapArtifactType = 'project' | 'system' | 'feature' | 'data' | 'ui' | 'dependency' | 'consumer' | 'overview' | 'test' | 'testsuite' | 'e2e' | 'env' | 'unknown';

// Spatial columns (LR layout):
//   0: Systems (boundaries)     — left
//   1: Test Suites (grouping)   — right of systems
//   2: Features (capabilities)  — center
//   3: Tests (verification)     — right of features
//   4: Data (concepts)          — middle-right
//   5: UIs (hierarchy)          — right
// Special bands (horizontal, not columns):
//  -1: Dependencies             — top band (second)
//  -2: Consumers                — bottom band
//  -3: Environments             — top band (first, above deps)
//  -4: E2E Tests                — bottom band (below consumers)
export type Column = -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;

const TYPE_COLUMN: Record<MapArtifactType, Column> = {
  env: -3,
  dependency: -1,
  system: 0,
  overview: 0,
  testsuite: 1,
  feature: 2,
  test: 3,
  data: 4,
  ui: 5,
  consumer: -2,
  e2e: -4,
  project: 0,
  unknown: 2,
};

export type ArtifactStatus = 'draft' | 'untested' | 'stale' | 'verified' | 'pass' | 'fail' | 'active' | 'deprecated';

export interface MapNodeData {
  artifact: Artifact;
  label: string;
  artifactType: MapArtifactType;
  featureStatus: ArtifactStatus | null;
  codeRefCount: number;
  description: string;
  parentSystem: string | null;
  column: Column;
  depth: number;
  _hasSelection?: boolean;
  _isConnected?: boolean;
  _isCollapsed?: boolean;
  _collapsedChildCount?: number;
  _hasOrbcraftOrb?: boolean;
}

export interface OrbCodeProject {
  artifact: Artifact;
  id: string;
  name: string;
  projectType: string;
  codebase: string | null;
}

export interface FeatureEntry {
  id: string;
  label: string;
  description: string;
  parentSystem: string | null;
  featureStatus: ArtifactStatus | null;
  codeRefCount: number;
  artifact: Artifact;
}

// ── Constants ────────────────────────────────────────────────────────

export const TYPE_COLORS: Record<MapArtifactType, { bg: string; border: string; text: string; icon: string }> = {
  project:    { bg: 'bg-muted',       border: 'border-border',       text: 'text-foreground',     icon: 'text-muted-foreground' },
  system:     { bg: 'bg-water-bg',    border: 'border-water/30',     text: 'text-water-text',     icon: 'text-water' },
  feature:    { bg: 'bg-earth-bg',    border: 'border-earth/30',     text: 'text-earth-text',     icon: 'text-earth' },
  data:       { bg: 'bg-[#f3eef9]',   border: 'border-[#a78bcc]/30', text: 'text-[#5b3d80]',     icon: 'text-[#8b6aaf]' },
  ui:         { bg: 'bg-fire-bg',     border: 'border-fire/30',      text: 'text-fire-text',      icon: 'text-fire' },
  dependency: { bg: 'bg-teal-bg',      border: 'border-teal/30',      text: 'text-teal-text',      icon: 'text-teal' },
  consumer:   { bg: 'bg-rose-bg',      border: 'border-rose/30',      text: 'text-rose-text',      icon: 'text-rose' },
  overview:   { bg: 'bg-air-bg',      border: 'border-air/30',       text: 'text-air-text',       icon: 'text-air' },
  test:       { bg: 'bg-[#e8f5e9]',   border: 'border-[#66bb6a]/30', text: 'text-[#2e7d32]',     icon: 'text-[#43a047]' },
  testsuite:  { bg: 'bg-water-bg',    border: 'border-water/30',     text: 'text-water-text',     icon: 'text-water' },
  e2e:        { bg: 'bg-[#fff3e0]',   border: 'border-[#ffb74d]/30', text: 'text-[#e65100]',     icon: 'text-[#fb8c00]' },
  env:    { bg: 'bg-[#e0f2f1]',   border: 'border-[#4db6ac]/30', text: 'text-[#00695c]',     icon: 'text-[#26a69a]' },
  unknown:    { bg: 'bg-muted',       border: 'border-border',       text: 'text-foreground',     icon: 'text-muted-foreground' },
};

// ── Artifact Filters ─────────────────────────────────────────────────

export function isOrbCodeArtifact(a: Artifact): boolean {
  return a.path.includes('Mesh/OrbCode/');
}

export function isOrbCodeProject(a: Artifact): boolean {
  const name = stripMd(a.filename);
  return name.startsWith('(OrbCode Project)') && !name.includes(' . ');
}

// ── Extractors ───────────────────────────────────────────────────────

export function stripMd(filename: string): string {
  return filename.endsWith('.md') ? filename.slice(0, -3) : filename;
}

function detectArtifactType(filename: string): MapArtifactType {
  const name = stripMd(filename);
  // Collect all type segments in the dot chain — the LAST one is the actual type.
  // e.g. "... . (System) Auth . (Feature) Login" → types are ['System', 'Feature'], use 'Feature'
  const allMatches = [...name.matchAll(/\.\s+\(([^)]+)\)/g)];
  if (allMatches.length > 0) {
    const lastType = allMatches[allMatches.length - 1][1].toLowerCase();
    if (lastType === 'test suite') return 'testsuite';
    if (lastType === 'system') return 'system';
    if (lastType === 'feature') return 'feature';
    if (lastType === 'data') return 'data';
    if (lastType === 'ui') return 'ui';
    if (lastType === 'dependency') return 'dependency';
    if (lastType === 'consumer') return 'consumer';
    if (lastType === 'overview') return 'overview';
    if (lastType === 'test') return 'test';
    if (lastType === 'e2e') return 'e2e';
    if (lastType === 'environment') return 'env';
  }
  if (name.startsWith('(OrbCode Project)') && !name.includes(' . ')) return 'project';
  return 'unknown';
}

function extractLabel(filename: string): string {
  const name = stripMd(filename);
  // For chained types like "... . (System) Auth . (Feature) Login", extract label from the LAST segment.
  // Named: last ". (Type) Label" with text after the parens
  const namedMatch = name.match(/\.\s+\([^)]+\)\s+([^.]+)$/);
  if (namedMatch) return namedMatch[1].trim();
  // Singleton: last ". (Type)" with no text after
  const singletonMatch = name.match(/\.\s+\(([^)]+)\)$/);
  if (singletonMatch) return singletonMatch[1];
  const projectMatch = name.match(/\(OrbCode Project\)\s+(.+)$/);
  if (projectMatch) return projectMatch[1];
  return name;
}

function extractDescription(body: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('```') && !trimmed.startsWith('~~~')) {
      return trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed;
    }
  }
  return '';
}

function extractArtifactStatus(fm: Record<string, unknown>, artifactType: MapArtifactType): ArtifactStatus | null {
  if (artifactType === 'project' || artifactType === 'unknown') return null;
  const s = fm.status;
  if (typeof s !== 'string') {
    // Default when status field is missing
    if (artifactType === 'feature' || artifactType === 'ui') return 'verified';
    if (artifactType === 'test' || artifactType === 'testsuite' || artifactType === 'e2e') return 'pass';
    return 'active';
  }
  // Universal statuses (all tiers)
  if (s === 'draft') return 'draft';
  if (s === 'stale') return 'stale';
  if (s === 'deprecated') return 'deprecated';
  // Tier 1 — Feature, UI: draft|untested|stale|verified
  if (artifactType === 'feature' || artifactType === 'ui') {
    if (s === 'untested' || s === 'implementing' || s === 'testing') return 'untested';
    if (s === 'verified') return 'verified';
    return 'verified';
  }
  // Tier 3 — Test, Test Suite, E2E: draft|pass|fail|stale|deprecated
  if (artifactType === 'test' || artifactType === 'testsuite' || artifactType === 'e2e') {
    if (s === 'pass' || s === 'passing') return 'pass';
    if (s === 'fail' || s === 'failing') return 'fail';
    return 'pass';
  }
  // Tier 2 — System, Data, Dependency, Consumer, Overview, Environment: draft|active|stale|deprecated
  if (s === 'active') return 'active';
  return 'active';
}

function extractCodeRefs(fm: Record<string, unknown>): number {
  const refs = fm['code-refs'];
  if (Array.isArray(refs)) return refs.length;
  return 0;
}

function extractArtifactRefs(fm: Record<string, unknown>): string[] {
  const refs = fm['artifact-refs'];
  if (!Array.isArray(refs)) return [];
  return refs
    .map(r => {
      if (typeof r !== 'string') return null;
      const match = r.match(/\[\[(.+?)\]\]/);
      return match ? match[1] : null;
    })
    .filter((r): r is string => r !== null);
}

function belongsToProject(artifact: Artifact, projectName: string): boolean {
  return artifact.path.includes(`(OrbCode Project) ${projectName}/`);
}

// ── Converters ───────────────────────────────────────────────────────

export function toProject(a: Artifact): OrbCodeProject | null {
  if (!isOrbCodeProject(a)) return null;
  const name = extractLabel(a.filename);
  return {
    artifact: a,
    id: a.id,
    name,
    projectType: (a.frontmatter['project-type'] as string) ?? 'application',
    codebase: (a.frontmatter.codebase as string) ?? null,
  };
}

export function isMapLayerArtifact(a: Artifact): boolean {
  const type = detectArtifactType(a.filename);
  return type !== 'unknown' && type !== 'project';
}

// ── Graph Builder ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FlowNode = any;

// Edge rules — hierarchies with external boundaries:
//
//   ENV (top)            DEPS (top)            SYSTEMS (left)         SUITES              FEATURES (center)      TESTS                 DATA / UI (right)     CONSUMERS (bottom)    E2E (bottom)
//   (leaf — no outbound) (leaf — no outbound)  system → system  ✓    suite → test    ✓   feature → feature ✓   test → feature   ✓   feature → data  ✓    consumer → system  ✓  e2e → feature ✓
//                                              system → feature ✓    suite → feature ✓   feature → ui     ✓                         ui → ui         ✓    consumer → feature ✓  e2e → system  ✓
//                                              system → dep     ✓    suite → system  ✓   feature → dep    ✓                                               consumer → data    ✓  e2e → env ✓
//                                              system → consumer✓    suite → env ✓                                                                    consumer → ui      ✓
//
// Blocked: feature → system (no back-refs)
const ALLOWED_EDGE: Record<string, Set<string>> = {
  system:     new Set(['system', 'feature', 'data', 'ui', 'dependency', 'consumer']),
  feature:    new Set(['feature', 'data', 'ui', 'dependency']),
  data:       new Set([]),
  ui:         new Set(['ui']),
  dependency: new Set([]),
  consumer:   new Set(['system', 'feature', 'data', 'ui']),
  overview:   new Set(['system', 'feature']),
  test:       new Set(['feature']),
  testsuite:  new Set(['test', 'feature', 'system', 'env']),
  e2e:        new Set(['feature', 'system', 'env']),
  env:    new Set([]),
};

function isEdgeAllowed(sourceType: string, targetType: string): boolean {
  return ALLOWED_EDGE[sourceType]?.has(targetType) ?? false;
}


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

  // Build parent maps by following one-way refs downward:
  //   system → feature  (direct children)
  //   feature → feature (sub-features)
  // Sub-features propagate upward: if System A → Feature X → Sub-feature Y,
  // then Y also belongs to System A.
  const systemArtifacts = projectArtifacts.filter(a => typeOf.get(a.id) === 'system');
  const featureParent = new Map<string, string>(); // feature id → system label

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

  // Second pass: propagate system ownership through feature → sub-feature refs
  // (BFS from features that have a system, follow their feature refs downward)
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
  // References are one-way (parent → child). Depth 0 = root (no incoming same-type edge).
  // Mutual refs (A→B + B→A) are peers, not hierarchy — skip them.
  const sameTypeChildren = new Map<string, string[]>(); // parent id → child ids
  const hasIncomingSameType = new Set<string>();

  // First: collect all same-type ref pairs to detect mutual refs
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
        // Skip mutual refs — they're peers at the same depth
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
  // Nodes without depth (disconnected) get depth 0
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

  // First pass: collect all valid edge keys so we can detect mutual pairs
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

      // Deduplicate exact same edge (same source→target)
      const edgeKey = `${a.id}->${target.id}`;
      if (edgeDedup.has(edgeKey)) continue;
      edgeDedup.add(edgeKey);

      // Detect mutual pair: A→B and B→A both exist — peers, not hierarchy
      const reverseKey = `${target.id}->${a.id}`;
      const isMutual = allEdgeKeys.has(reverseKey);

      // For mutual pairs, only render one edge — mark reverse as consumed
      if (isMutual) {
        if (edgeDedup.has(reverseKey)) continue;
        edgeDedup.add(reverseKey);
      }

      // Color by source type
      let stroke = 'var(--border)';
      const isSameColumn = TYPE_COLUMN[sourceType] === TYPE_COLUMN[targetType];
      if (sourceType === 'feature' && targetType === 'feature') stroke = 'var(--earth)';
      else if (sourceType === 'system' && targetType === 'system') stroke = 'var(--water)';
      else if (sourceType === 'ui' && targetType === 'ui') stroke = 'var(--fire)';
      else if (sourceType === 'system') stroke = 'var(--water)';

      // Mutual edges are excluded from dagre — they're peers, not parent→child.
      // Dagre would break the cycle and assign different ranks.
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

// ── Layout ───────────────────────────────────────────────────────────

export const NODE_WIDTHS: Record<string, number> = {
  system: 200,
  data: 180,
  ui: 200,
  dependency: 180,
  consumer: 180,
  overview: 220,
  test: 160,
  testsuite: 200,
  e2e: 200,
  env: 180,
};
export const DEFAULT_NODE_WIDTH = 200;

export const NODE_HEIGHTS: Record<string, number> = {};
export const DEFAULT_NODE_HEIGHT = 44;

// Layout: six column zones arranged left-to-right, plus four horizontal bands.
// Systems, Features, and UIs get their own dagre DAG hierarchy layout.
// Data, Test Suites, and Tests are anchored columns.
// Env and Dependencies bands at top, Consumers and E2E bands at bottom.
//
// Spatial order:  [Env band]
//                [Dependencies band]
//                [Systems DAG] | [Suites col] | [Features DAG] | [Tests col] | [Data col] | [UIs DAG]
//                [Consumers band]
//                [E2E band]

const ZONE_GAP = 140;

/** Run dagre LR on a subset of nodes using only intra-zone edges. Nodes inserted alphabetically for stable ordering. */
function layoutZoneDAG(
  zoneNodes: FlowNode[],
  allDagreEdges: { source: string; target: string; minlen: number; sameColumn: boolean }[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (zoneNodes.length === 0) return positions;

  const nodeIds = new Set(zoneNodes.map((n: FlowNode) => n.id as string));
  const intraEdges = allDagreEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 80, marginx: 0, marginy: 0 });

  // Insert nodes alphabetically for stable vertical ordering
  const sorted = [...zoneNodes].sort((a, b) =>
    (a.data as MapNodeData).label.localeCompare((b.data as MapNodeData).label),
  );
  for (const node of sorted) {
    const type = (node.data as MapNodeData).artifactType;
    g.setNode(node.id, {
      width: NODE_WIDTHS[type] ?? DEFAULT_NODE_WIDTH,
      height: NODE_HEIGHTS[type] ?? DEFAULT_NODE_HEIGHT,
    });
  }
  for (const edge of intraEdges) g.setEdge(edge.source, edge.target);

  dagre.layout(g);

  for (const node of zoneNodes) {
    const pos = g.node(node.id);
    if (pos) positions.set(node.id as string, { x: pos.x, y: pos.y });
  }
  return positions;
}

/**
 * Layout features grouped by parent system.
 * Groups are sorted alphabetically by system name, orphans last.
 * Within each group, dagre LR handles the feature→feature hierarchy.
 */
function layoutGroupedFeatureDAG(
  featureNodes: FlowNode[],
  allDagreEdges: { source: string; target: string; minlen: number; sameColumn: boolean }[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (featureNodes.length === 0) return positions;

  // Group by parentSystem
  const groups = new Map<string, FlowNode[]>();
  const orphans: FlowNode[] = [];
  for (const node of featureNodes) {
    const sys = (node.data as MapNodeData).parentSystem;
    if (sys) {
      if (!groups.has(sys)) groups.set(sys, []);
      groups.get(sys)!.push(node);
    } else {
      orphans.push(node);
    }
  }

  // Sort group keys alphabetically, orphans at end
  const sortedKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  if (orphans.length > 0) {
    sortedKeys.push('__orphans__');
    groups.set('__orphans__', orphans);
  }

  // Layout each group independently, stack vertically
  const GROUP_GAP = 40;
  let yOffset = 0;
  let maxRight = 0;

  for (const key of sortedKeys) {
    const groupNodes = groups.get(key)!;
    const groupPos = layoutZoneDAG(groupNodes, allDagreEdges);
    const bounds = zoneBounds(groupPos, groupNodes);

    for (const [id, pos] of groupPos) {
      positions.set(id, {
        x: pos.x - bounds.minX,               // normalize x to 0
        y: pos.y - bounds.minY + yOffset,      // stack vertically
      });
    }

    maxRight = Math.max(maxRight, bounds.width);
    yOffset += bounds.height + GROUP_GAP;
  }

  return positions;
}

/**
 * Layout a flat column anchored to connected feature positions.
 * Nodes are sorted by the average y of their connected features,
 * then spaced dynamically to fill the target height.
 */
function layoutAnchoredColumn(
  zoneNodes: FlowNode[],
  featPos: Map<string, { x: number; y: number }>,
  allEdges: { source: string; target: string }[],
  targetHeight: number,
  gap: number = 24,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (zoneNodes.length === 0) return positions;

  const featIds = new Set([...featPos.keys()]);

  // Compute anchor y for each node from connected feature positions
  const anchors = new Map<string, number>();
  for (const node of zoneNodes) {
    const id = node.id as string;
    const ys: number[] = [];
    for (const e of allEdges) {
      if (e.source === id && featIds.has(e.target)) { const fp = featPos.get(e.target); if (fp) ys.push(fp.y); }
      if (e.target === id && featIds.has(e.source)) { const fp = featPos.get(e.source); if (fp) ys.push(fp.y); }
    }
    if (ys.length > 0) anchors.set(id, ys.reduce((a, b) => a + b, 0) / ys.length);
  }

  // Sort: anchored nodes by feature y, unanchored alphabetically at end
  const sorted = [...zoneNodes].sort((a, b) => {
    const aA = anchors.get(a.id as string);
    const bA = anchors.get(b.id as string);
    if (aA != null && bA != null) return aA - bA;
    if (aA != null) return -1;
    if (bA != null) return 1;
    return (a.data as MapNodeData).label.localeCompare((b.data as MapNodeData).label);
  });

  let maxW = 0;
  for (const node of sorted) {
    const type = (node.data as MapNodeData).artifactType;
    maxW = Math.max(maxW, NODE_WIDTHS[type] ?? DEFAULT_NODE_WIDTH);
  }

  // Dynamic gap: fill targetHeight if larger than natural height
  let totalNodeH = 0;
  for (const node of sorted) totalNodeH += NODE_HEIGHTS[(node.data as MapNodeData).artifactType] ?? DEFAULT_NODE_HEIGHT;
  const dynamicGap = sorted.length > 1
    ? Math.max(gap, (targetHeight - totalNodeH) / (sorted.length - 1))
    : gap;

  let y = 0;
  for (const node of sorted) {
    const type = (node.data as MapNodeData).artifactType;
    const h = NODE_HEIGHTS[type] ?? DEFAULT_NODE_HEIGHT;
    positions.set(node.id as string, { x: maxW / 2, y: y + h / 2 });
    y += h + dynamicGap;
  }
  return positions;
}

/** Stretch a zone's y-positions proportionally to fill a target height. */
function stretchToHeight(
  positions: Map<string, { x: number; y: number }>,
  nodes: FlowNode[],
  targetHeight: number,
) {
  if (nodes.length <= 1 || targetHeight <= 0) return;
  const bounds = zoneBounds(positions, nodes);
  if (bounds.height === 0 || bounds.height >= targetHeight) return;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const scale = targetHeight / bounds.height;
  for (const node of nodes) {
    const pos = positions.get(node.id as string);
    if (pos) pos.y = midY + (pos.y - midY) * scale;
  }
}

/** Compute the bounding box of positioned nodes. */
function zoneBounds(
  positions: Map<string, { x: number; y: number }>,
  nodes: FlowNode[],
) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const node of nodes) {
    const pos = positions.get(node.id as string);
    if (!pos) continue;
    const type = (node.data as MapNodeData).artifactType;
    const w = NODE_WIDTHS[type] ?? DEFAULT_NODE_WIDTH;
    const h = NODE_HEIGHTS[type] ?? DEFAULT_NODE_HEIGHT;
    minX = Math.min(minX, pos.x - w / 2);
    maxX = Math.max(maxX, pos.x + w / 2);
    minY = Math.min(minY, pos.y - h / 2);
    maxY = Math.max(maxY, pos.y + h / 2);
  }
  if (!isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

/** Layout nodes in a horizontal row, evenly spread across the given width. */
function layoutHorizontalBand(
  bandNodes: FlowNode[],
  totalWidth: number,
  marginX: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (bandNodes.length === 0) return positions;

  // Sort alphabetically for stable ordering
  const sorted = [...bandNodes].sort((a, b) =>
    (a.data as MapNodeData).label.localeCompare((b.data as MapNodeData).label),
  );

  const gap = 24;
  let totalNodeW = 0;
  for (const node of sorted) {
    totalNodeW += NODE_WIDTHS[(node.data as MapNodeData).artifactType] ?? DEFAULT_NODE_WIDTH;
  }
  const totalGaps = (sorted.length - 1) * gap;
  const rowWidth = totalNodeW + totalGaps;

  // Center the row within the content width
  const startX = marginX + Math.max(0, (totalWidth - rowWidth) / 2);
  const h = NODE_HEIGHTS[sorted[0]?.data?.artifactType] ?? DEFAULT_NODE_HEIGHT;

  let x = startX;
  for (const node of sorted) {
    const w = NODE_WIDTHS[(node.data as MapNodeData).artifactType] ?? DEFAULT_NODE_WIDTH;
    positions.set(node.id as string, { x: x + w / 2, y: h / 2 });
    x += w + gap;
  }

  return positions;
}

function applyColumnLayout(
  nodes: FlowNode[],
  edges: Edge[],
  dagreEdges: { source: string; target: string; minlen: number; sameColumn: boolean }[],
): { nodes: FlowNode[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  // Partition into zones: 6 vertical columns + 4 horizontal bands
  const envNodes = nodes.filter(n => (n.data as MapNodeData).column === -3);
  const depNodes     = nodes.filter(n => (n.data as MapNodeData).column === -1);
  const systems      = nodes.filter(n => (n.data as MapNodeData).column === 0);
  const suiteNodes   = nodes.filter(n => (n.data as MapNodeData).column === 1);
  const features     = nodes.filter(n => (n.data as MapNodeData).column === 2);
  const testNodes    = nodes.filter(n => (n.data as MapNodeData).column === 3);
  const dataNodes    = nodes.filter(n => (n.data as MapNodeData).column === 4);
  const uiNodes      = nodes.filter(n => (n.data as MapNodeData).column === 5);
  const conNodes     = nodes.filter(n => (n.data as MapNodeData).column === -2);
  const e2eNodes     = nodes.filter(n => (n.data as MapNodeData).column === -4);

  // 1. Features first — this is the tallest zone and the anchor
  //    Grouped by parent system (alphabetical), with hierarchy within each group
  const featPos = layoutGroupedFeatureDAG(features, dagreEdges);
  const featBnds = zoneBounds(featPos, features);

  // 2. Systems: DAG hierarchy, stretched to match feature height
  const sysPos = layoutZoneDAG(systems, dagreEdges);
  if (featBnds.height > 0) stretchToHeight(sysPos, systems, featBnds.height);

  // 3. Test Suites: anchored to connected system y positions, spaced to fill feature height
  const suitePos = layoutAnchoredColumn(suiteNodes, sysPos, dagreEdges, featBnds.height, 24);

  // 4. Tests: anchored to connected feature y positions, spaced to fill feature height
  const testPos = layoutAnchoredColumn(testNodes, featPos, dagreEdges, featBnds.height, 24);

  // 5. Data: sorted by connected feature y, spaced to fill feature height
  const dataPos = layoutAnchoredColumn(dataNodes, featPos, dagreEdges, featBnds.height, 24);

  // 6. UIs: DAG hierarchy (like systems), stretched to match feature height
  const uiPos = layoutZoneDAG(uiNodes, dagreEdges);
  if (featBnds.height > 0) stretchToHeight(uiPos, uiNodes, featBnds.height);

  // Compute bounds (after stretching/anchoring)
  const sysBounds   = zoneBounds(sysPos, systems);
  const suiteBounds = zoneBounds(suitePos, suiteNodes);
  const featBounds  = featBnds;
  const testBounds  = zoneBounds(testPos, testNodes);
  const dataBounds  = zoneBounds(dataPos, dataNodes);
  const uiBounds    = zoneBounds(uiPos, uiNodes);

  // Arrange the 6 column zones left-to-right with ZONE_GAP spacing
  const MARGIN = 40;
  const BAND_GAP = 80; // vertical gap between horizontal bands and main content
  let zoneX = MARGIN;

  const sysOffX = systems.length > 0 ? zoneX - sysBounds.minX : 0;
  if (systems.length > 0) zoneX += sysBounds.width + ZONE_GAP;

  const suiteOffX = suiteNodes.length > 0 ? zoneX - suiteBounds.minX : 0;
  if (suiteNodes.length > 0) zoneX += suiteBounds.width + ZONE_GAP;

  const featOffX = features.length > 0 ? zoneX - featBounds.minX : 0;
  if (features.length > 0) zoneX += featBounds.width + ZONE_GAP;

  const testOffX = testNodes.length > 0 ? zoneX - testBounds.minX : 0;
  if (testNodes.length > 0) zoneX += testBounds.width + ZONE_GAP;

  const dataOffX = dataNodes.length > 0 ? zoneX - dataBounds.minX : 0;
  if (dataNodes.length > 0) zoneX += dataBounds.width + ZONE_GAP;

  const uiOffX = uiNodes.length > 0 ? zoneX - uiBounds.minX : 0;

  // Compute total width of the main content area (for centering horizontal bands)
  const mainColumns = [systems, suiteNodes, features, testNodes, dataNodes, uiNodes].filter(z => z.length > 0);
  const allColumnBounds = [sysBounds, suiteBounds, featBounds, testBounds, dataBounds, uiBounds];
  const allColumnOffX = [sysOffX, suiteOffX, featOffX, testOffX, dataOffX, uiOffX];
  let totalContentWidth = 0;
  for (let i = 0; i < mainColumns.length; i++) {
    if (mainColumns[i].length > 0) {
      const endX = allColumnOffX[i] + allColumnBounds[i].maxX;
      totalContentWidth = Math.max(totalContentWidth, endX - MARGIN);
    }
  }

  // 7. Environments: horizontal band at very top
  const envPos = layoutHorizontalBand(envNodes, totalContentWidth, MARGIN);

  // 8. Dependencies: horizontal band below test environments
  const depPos = layoutHorizontalBand(depNodes, totalContentWidth, MARGIN);

  // Compute vertical offsets — test env band sits above deps, deps above main content
  const envBandHeight = envNodes.length > 0 ? (NODE_HEIGHTS['env'] ?? DEFAULT_NODE_HEIGHT) + BAND_GAP : 0;
  const depBandHeight = depNodes.length > 0 ? (NODE_HEIGHTS['dependency'] ?? DEFAULT_NODE_HEIGHT) + BAND_GAP : 0;
  const mainTopY = MARGIN + envBandHeight + depBandHeight;

  // Align all column zones to the same top edge, shifted down by band heights
  const sysOffY   = systems.length    > 0 ? mainTopY - sysBounds.minY    : 0;
  const suiteOffY = suiteNodes.length > 0 ? mainTopY - suiteBounds.minY  : 0;
  const featOffY  = features.length   > 0 ? mainTopY - featBounds.minY   : 0;
  const testOffY  = testNodes.length  > 0 ? mainTopY - testBounds.minY   : 0;
  const dataOffY  = dataNodes.length  > 0 ? mainTopY - dataBounds.minY   : 0;
  const uiOffY    = uiNodes.length    > 0 ? mainTopY - uiBounds.minY     : 0;

  // Compute the bottom of the main content for consumer and E2E bands
  const mainHeights = [sysBounds, suiteBounds, featBounds, testBounds, dataBounds, uiBounds]
    .map(b => b.height)
    .filter(h => h > 0);
  const mainContentHeight = Math.max(0, ...mainHeights);
  const consumerTopY = mainTopY + mainContentHeight + BAND_GAP;

  // 9. Consumers: horizontal band below main content
  const conPos = layoutHorizontalBand(conNodes, totalContentWidth, MARGIN);

  // 10. E2E Tests: horizontal band below consumers
  const conBandHeight = conNodes.length > 0 ? (NODE_HEIGHTS['consumer'] ?? DEFAULT_NODE_HEIGHT) + BAND_GAP : 0;
  const e2eTopY = consumerTopY + conBandHeight;
  const e2ePos = layoutHorizontalBand(e2eNodes, totalContentWidth, MARGIN);

  // Merge into final position map
  const finalPos = new Map<string, { x: number; y: number }>();
  // Environments at very top
  for (const [id, p] of envPos) finalPos.set(id, { x: p.x, y: p.y + MARGIN });
  // Dependencies below test envs
  for (const [id, p] of depPos) finalPos.set(id, { x: p.x, y: p.y + MARGIN + envBandHeight });
  // Main column zones
  for (const [id, p] of sysPos)   finalPos.set(id, { x: p.x + sysOffX,   y: p.y + sysOffY });
  for (const [id, p] of suitePos) finalPos.set(id, { x: p.x + suiteOffX, y: p.y + suiteOffY });
  for (const [id, p] of featPos)  finalPos.set(id, { x: p.x + featOffX,  y: p.y + featOffY });
  for (const [id, p] of testPos)  finalPos.set(id, { x: p.x + testOffX,  y: p.y + testOffY });
  for (const [id, p] of dataPos)  finalPos.set(id, { x: p.x + dataOffX,  y: p.y + dataOffY });
  for (const [id, p] of uiPos)    finalPos.set(id, { x: p.x + uiOffX,    y: p.y + uiOffY });
  // Consumers below main content
  for (const [id, p] of conPos) finalPos.set(id, { x: p.x, y: p.y + consumerTopY });
  // E2E below consumers
  for (const [id, p] of e2ePos) finalPos.set(id, { x: p.x, y: p.y + e2eTopY });

  const laid = nodes.map(node => {
    const pos = finalPos.get(node.id as string);
    const type = (node.data as MapNodeData).artifactType;
    const w = NODE_WIDTHS[type] ?? DEFAULT_NODE_WIDTH;
    const h = NODE_HEIGHTS[type] ?? DEFAULT_NODE_HEIGHT;
    return {
      ...node,
      position: {
        x: (pos?.x ?? 0) - w / 2,
        y: (pos?.y ?? 0) - h / 2,
      },
    };
  });

  return { nodes: laid, edges };
}

// ── Sidebar Tree & Collapse ─────────────────────────────────────────

export interface SidebarNode {
  id: string;
  label: string;
  artifactType: MapArtifactType;
  artifact: Artifact;
  children: SidebarNode[];
}

export interface ProjectHierarchy {
  tree: SidebarNode[];
  uiTree: SidebarNode[];
  testTree: SidebarNode[];
  dataList: SidebarNode[];
  dependencies: SidebarNode[];
  consumers: SidebarNode[];
  e2eTests: SidebarNode[];
  envs: SidebarNode[];
  /** childId → set of one-way parentIds (for collapse cascade) */
  oneWayParents: Map<string, Set<string>>;
  /** All map-layer artifact IDs in the project */
  allMapIds: Set<string>;
}

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

  // Collapse parents + tree children:
  //   system → {system, feature} one-way refs (system hierarchy)
  //   testsuite → {testsuite, test} one-way refs (testing hierarchy)
  //   ui → ui one-way refs (ui hierarchy)
  // Feature→data etc. do NOT create parent relationships for collapse.
  const oneWayParents = new Map<string, Set<string>>();
  const treeChildren = new Map<string, string[]>();

  for (const a of mapArtifacts) {
    const sourceType = typeOf.get(a.id)!;
    // Only systems, test suites, and ui nodes own things for collapse
    if (sourceType !== 'system' && sourceType !== 'testsuite' && sourceType !== 'ui') continue;
    for (const refName of extractArtifactRefs(a.frontmatter)) {
      const target = byName.get(refName);
      if (!target || target.id === a.id || !allMapIds.has(target.id)) continue;
      const targetType = typeOf.get(target.id)!;

      // System owns: system, feature
      // Test Suite owns: testsuite, test
      // UI owns: ui (sub-pages/components)
      if (sourceType === 'system' && targetType !== 'system' && targetType !== 'feature') continue;
      if (sourceType === 'testsuite' && targetType !== 'testsuite' && targetType !== 'test') continue;
      if (sourceType === 'ui' && targetType !== 'ui') continue;

      // Mutual refs between same type = peers, not parent-child
      if (targetType === sourceType && rawRefKeys.has(`${target.id}->${a.id}`)) continue;

      if (!oneWayParents.has(target.id)) oneWayParents.set(target.id, new Set());
      oneWayParents.get(target.id)!.add(a.id);

      if (!treeChildren.has(a.id)) treeChildren.set(a.id, []);
      treeChildren.get(a.id)!.push(target.id);
    }
  }

  // Build tree nodes recursively (duplicates allowed across parents)
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
    // Sort: containers first (systems/suites/ui), then leaves, alphabetical within each
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

  // Root containers: not owned by another of the same type
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

  // Orphan features: features not in any system's tree
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

  // Data (flat list, alphabetical)
  const dataList: SidebarNode[] = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'data')
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)))
    .map(a => ({ id: a.id, label: extractLabel(a.filename), artifactType: 'data' as MapArtifactType, artifact: a, children: [] }));

  // Dependencies (flat list, alphabetical)
  const dependencies: SidebarNode[] = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'dependency')
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)))
    .map(a => ({ id: a.id, label: extractLabel(a.filename), artifactType: 'dependency' as MapArtifactType, artifact: a, children: [] }));

  // Consumers (flat list, alphabetical)
  const consumers: SidebarNode[] = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'consumer')
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)))
    .map(a => ({ id: a.id, label: extractLabel(a.filename), artifactType: 'consumer' as MapArtifactType, artifact: a, children: [] }));

  // Test tree (suites as collapsible folders, tests as leaves — mirrors system/feature tree)
  const rootSuites = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'testsuite' && !ownedByParent.has(a.id))
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)));

  const testTree: SidebarNode[] = [];
  for (const suite of rootSuites) {
    const node = buildTreeNode(suite.id, new Set());
    if (node) testTree.push(node);
  }

  // Orphan tests: tests not owned by any suite
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

  // E2E Tests (flat list, alphabetical)
  const e2eTests: SidebarNode[] = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'e2e')
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)))
    .map(a => ({ id: a.id, label: extractLabel(a.filename), artifactType: 'e2e' as MapArtifactType, artifact: a, children: [] }));

  // Environments (flat list, alphabetical)
  const envs: SidebarNode[] = mapArtifacts
    .filter(a => typeOf.get(a.id) === 'env')
    .sort((a, b) => extractLabel(a.filename).localeCompare(extractLabel(b.filename)))
    .map(a => ({ id: a.id, label: extractLabel(a.filename), artifactType: 'env' as MapArtifactType, artifact: a, children: [] }));

  return { tree, uiTree, testTree, dataList, dependencies, consumers, e2eTests, envs, oneWayParents, allMapIds };
}

/**
 * Given a potentially hidden artifact ID, walk up the oneWayParents hierarchy
 * and return the first ancestor that is visible (not in hiddenIds).
 * If the artifact itself is visible, returns it unchanged.
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
 * A node is hidden if ALL its one-way parents are collapsed or hidden (cascade).
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
