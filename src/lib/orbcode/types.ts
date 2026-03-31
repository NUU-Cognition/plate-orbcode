import type { Artifact } from '@nuucognition/plate-sdk';

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

export const TYPE_COLUMN: Record<MapArtifactType, Column> = {
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

// ── Node Dimensions ─────────────────────────────────────────────────

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FlowNode = any;

// ── Edge Rules ──────────────────────────────────────────────────────

export const ALLOWED_EDGE: Record<string, Set<string>> = {
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

export function isEdgeAllowed(sourceType: string, targetType: string): boolean {
  return ALLOWED_EDGE[sourceType]?.has(targetType) ?? false;
}

// ── Sidebar & Hierarchy ─────────────────────────────────────────────

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
