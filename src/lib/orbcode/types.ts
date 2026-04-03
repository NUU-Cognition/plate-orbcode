import type { Artifact } from '@nuucognition/plate-sdk';
import defaultViewConfig from '../../../views/default.json';

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

export interface OrbCodeViewConfig {
  columns: Record<MapArtifactType, Column>;
  colors: Record<MapArtifactType, { bg: string; border: string; text: string; icon: string }>;
}

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

export function parseOrbCodeViewConfig(value: unknown): OrbCodeViewConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const columns = (value as { columns?: unknown }).columns;
  const colors = (value as { colors?: unknown }).colors;
  if (!columns || typeof columns !== 'object' || !colors || typeof colors !== 'object') {
    return null;
  }

  return {
    columns: columns as Record<MapArtifactType, Column>,
    colors: colors as Record<MapArtifactType, { bg: string; border: string; text: string; icon: string }>,
  };
}

const parsedDefaultViewConfig = parseOrbCodeViewConfig(defaultViewConfig);

export const TYPE_COLUMN: Record<MapArtifactType, Column> = { ...(parsedDefaultViewConfig?.columns ?? {}) };

export const TYPE_COLORS: Record<MapArtifactType, { bg: string; border: string; text: string; icon: string }> = {
  ...(parsedDefaultViewConfig?.colors ?? {}),
};

export function applyOrbCodeViewConfig(config: OrbCodeViewConfig) {
  Object.assign(TYPE_COLUMN, config.columns);
  Object.assign(TYPE_COLORS, config.colors);
}

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
  test:       new Set(['feature', 'env']),
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
