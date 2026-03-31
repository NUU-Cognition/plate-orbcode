import type { Edge } from '@xyflow/react';
import dagre from 'dagre';
import {
  type FlowNode,
  type MapNodeData,
  NODE_WIDTHS,
  DEFAULT_NODE_WIDTH,
  NODE_HEIGHTS,
  DEFAULT_NODE_HEIGHT,
} from './types';

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

export function applyColumnLayout(
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
  const BAND_GAP = 80;
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

  // Compute vertical offsets
  const envBandHeight = envNodes.length > 0 ? (NODE_HEIGHTS['env'] ?? DEFAULT_NODE_HEIGHT) + BAND_GAP : 0;
  const depBandHeight = depNodes.length > 0 ? (NODE_HEIGHTS['dependency'] ?? DEFAULT_NODE_HEIGHT) + BAND_GAP : 0;
  const mainTopY = MARGIN + envBandHeight + depBandHeight;

  // Align all column zones to the same top edge
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
  for (const [id, p] of envPos) finalPos.set(id, { x: p.x, y: p.y + MARGIN });
  for (const [id, p] of depPos) finalPos.set(id, { x: p.x, y: p.y + MARGIN + envBandHeight });
  for (const [id, p] of sysPos)   finalPos.set(id, { x: p.x + sysOffX,   y: p.y + sysOffY });
  for (const [id, p] of suitePos) finalPos.set(id, { x: p.x + suiteOffX, y: p.y + suiteOffY });
  for (const [id, p] of featPos)  finalPos.set(id, { x: p.x + featOffX,  y: p.y + featOffY });
  for (const [id, p] of testPos)  finalPos.set(id, { x: p.x + testOffX,  y: p.y + testOffY });
  for (const [id, p] of dataPos)  finalPos.set(id, { x: p.x + dataOffX,  y: p.y + dataOffY });
  for (const [id, p] of uiPos)    finalPos.set(id, { x: p.x + uiOffX,    y: p.y + uiOffY });
  for (const [id, p] of conPos) finalPos.set(id, { x: p.x, y: p.y + consumerTopY });
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
