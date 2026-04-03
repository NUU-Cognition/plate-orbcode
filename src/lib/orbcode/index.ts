// Barrel export — single entry point for all orbcode modules

export type {
  MapArtifactType,
  Column,
  ArtifactStatus,
  MapNodeData,
  OrbCodeProject,
  OrbCodeViewConfig,
  FeatureEntry,
  FlowNode,
  SidebarNode,
  ProjectHierarchy,
} from './types';

export {
  TYPE_COLUMN,
  TYPE_COLORS,
  applyOrbCodeViewConfig,
  NODE_WIDTHS,
  DEFAULT_NODE_WIDTH,
  NODE_HEIGHTS,
  DEFAULT_NODE_HEIGHT,
  ALLOWED_EDGE,
  isEdgeAllowed,
  parseOrbCodeViewConfig,
} from './types';

export {
  isOrbCodeArtifact,
  isOrbCodeProject,
  stripMd,
  detectArtifactType,
  extractLabel,
  extractDescription,
  extractArtifactStatus,
  extractCodeRefs,
  extractArtifactRefs,
  belongsToProject,
  toProject,
  isMapLayerArtifact,
} from './detectors';

export { buildGraph } from './graph';
export { applyColumnLayout } from './layout';
export { buildProjectHierarchy, resolveVisibleAncestor, computeHiddenIds } from './hierarchy';
