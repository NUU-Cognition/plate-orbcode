import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { OrbcraftSession } from '../hooks/useOrbcraftSessions';
import {
  resolveVisibleAncestor,
  NODE_WIDTHS,
  DEFAULT_NODE_WIDTH,
  NODE_HEIGHTS,
  DEFAULT_NODE_HEIGHT,
  type MapNodeData,
  type ProjectHierarchy,
} from '../lib/orbcode';

interface OrbOverlayProps {
  rfInstance: ReactFlowInstance;
  sessions: OrbcraftSession[];
  hierarchy: ProjectHierarchy | null;
  hiddenIds: Set<string>;
}

interface Point {
  x: number;
  y: number;
}

type OrbState = {
  distance: number;
  lastPos: Point | null;
  lastResolvedKey: string;
  transitionProgress: number;
  transitionFrom: Point | null;
};

const ORBIT_PADDING = 12;
const ORBIT_CORNER_RADIUS = 20;
const ORBIT_SPEED_PX = 120;
const TRANSITION_DURATION = 300;

function getNodeCenter(
  node: { position: { x: number; y: number }; data: unknown; measured?: { width?: number; height?: number } },
): Point {
  const data = node.data as MapNodeData | undefined;
  const w = node.measured?.width ?? NODE_WIDTHS[data?.artifactType ?? 'unknown'] ?? DEFAULT_NODE_WIDTH;
  const h = node.measured?.height ?? NODE_HEIGHTS[data?.artifactType ?? 'unknown'] ?? DEFAULT_NODE_HEIGHT;
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
}

function getNodeHalfSize(node: { data: unknown; measured?: { width?: number; height?: number } }): { hw: number; hh: number } {
  const data = node.data as MapNodeData | undefined;
  const w = node.measured?.width ?? NODE_WIDTHS[data?.artifactType ?? 'unknown'] ?? DEFAULT_NODE_WIDTH;
  const h = node.measured?.height ?? NODE_HEIGHTS[data?.artifactType ?? 'unknown'] ?? DEFAULT_NODE_HEIGHT;
  return { hw: w / 2, hh: h / 2 };
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ── Path Computation ───────────────────────────────────────────────

/** Rounded rectangle outline — orb traces the card shape */
function computeRoundedRectPath(
  center: Point, hw: number, hh: number, padding: number, cornerRadius: number,
): Point[] {
  const ehw = hw + padding;
  const ehh = hh + padding;
  const r = Math.min(cornerRadius, ehw, ehh);
  const pts: Point[] = [];
  const N = 6;

  // Top edge: left to right
  pts.push({ x: center.x - ehw + r, y: center.y - ehh });
  pts.push({ x: center.x + ehw - r, y: center.y - ehh });
  // Top-right corner arc
  for (let i = 1; i <= N; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / N);
    pts.push({ x: center.x + ehw - r + Math.cos(a) * r, y: center.y - ehh + r + Math.sin(a) * r });
  }
  // Right edge: top to bottom
  pts.push({ x: center.x + ehw, y: center.y + ehh - r });
  // Bottom-right corner arc
  for (let i = 1; i <= N; i++) {
    const a = (Math.PI / 2) * (i / N);
    pts.push({ x: center.x + ehw - r + Math.cos(a) * r, y: center.y + ehh - r + Math.sin(a) * r });
  }
  // Bottom edge: right to left
  pts.push({ x: center.x - ehw + r, y: center.y + ehh });
  // Bottom-left corner arc
  for (let i = 1; i <= N; i++) {
    const a = Math.PI / 2 + (Math.PI / 2) * (i / N);
    pts.push({ x: center.x - ehw + r + Math.cos(a) * r, y: center.y + ehh - r + Math.sin(a) * r });
  }
  // Left edge: bottom to top
  pts.push({ x: center.x - ehw, y: center.y - ehh + r });
  // Top-left corner arc
  for (let i = 1; i <= N; i++) {
    const a = Math.PI + (Math.PI / 2) * (i / N);
    pts.push({ x: center.x - ehw + r + Math.cos(a) * r, y: center.y - ehh + r + Math.sin(a) * r });
  }
  return pts;
}

/** Convex hull via Andrew's monotone chain */
function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const n = pts.length;
  if (n <= 2) return pts;
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = n - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
    upper.push(pts[i]);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Convex hull outline wrapping all padded card rectangles */
function computeHullOutlinePath(
  centers: Point[], halfSizes: { hw: number; hh: number }[], padding: number, cornerRadius: number,
): Point[] {
  const allPts: Point[] = [];
  const N = 4;
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    const { hw, hh } = halfSizes[i];
    const ehw = hw + padding;
    const ehh = hh + padding;
    const r = Math.min(cornerRadius, ehw, ehh);
    const corners = [
      { cx: c.x + ehw - r, cy: c.y - ehh + r, sa: -Math.PI / 2 },
      { cx: c.x + ehw - r, cy: c.y + ehh - r, sa: 0 },
      { cx: c.x - ehw + r, cy: c.y + ehh - r, sa: Math.PI / 2 },
      { cx: c.x - ehw + r, cy: c.y - ehh + r, sa: Math.PI },
    ];
    for (const { cx, cy, sa } of corners) {
      for (let s = 0; s <= N; s++) {
        const a = sa + (Math.PI / 2) * (s / N);
        allPts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
    }
  }
  return convexHull(allPts);
}

/** Get position at a given distance along a closed polygon path */
function samplePathAtDistance(points: Point[], totalLength: number, distance: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (totalLength === 0) return points[0];
  const d = ((distance % totalLength) + totalLength) % totalLength;
  let accum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (accum + segLen >= d) {
      const t = segLen > 0 ? (d - accum) / segLen : 0;
      return { x: a.x + dx * t, y: a.y + dy * t };
    }
    accum += segLen;
  }
  return points[0];
}

/** Compute total perimeter of a closed polygon */
function computePerimeter(points: Point[]): number {
  let total = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/** Convert outline points to SVG path string in screen coords */
function outlineToSvgPath(points: Point[], vp: { x: number; y: number; zoom: number }): string {
  if (points.length < 2) return '';
  const parts = points.map((p, i) => {
    const sx = p.x * vp.zoom + vp.x;
    const sy = p.y * vp.zoom + vp.y;
    return i === 0 ? `M${sx},${sy}` : `L${sx},${sy}`;
  });
  parts.push('Z');
  return parts.join(' ');
}

// ── Component ───────────────────────────────────────────────────────

function OrbOverlayComponent({
  rfInstance,
  sessions,
  hierarchy,
  hiddenIds,
}: OrbOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number>(0);
  const orbStatesRef = useRef<Map<string, OrbState>>(new Map());
  const lastTimestampRef = useRef<number>(0);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const hierarchyRef = useRef(hierarchy);
  hierarchyRef.current = hierarchy;
  const hiddenIdsRef = useRef(hiddenIds);
  hiddenIdsRef.current = hiddenIds;

  const [hoveredOrb, setHoveredOrb] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [followingId, setFollowingId] = useState<string | null>(null);
  const followingIdRef = useRef(followingId);
  followingIdRef.current = followingId;

  const toggleFollow = useCallback((sessionId: string) => {
    setFollowingId(prev => prev === sessionId ? null : sessionId);
  }, []);

  useEffect(() => {
    if (sessions.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
      return;
    }

    const activeIds = new Set(sessions.map((s) => s.sessionId));
    for (const key of orbStatesRef.current.keys()) {
      if (!activeIds.has(key)) orbStatesRef.current.delete(key);
    }

    const animate = (timestamp: number) => {
      const svg = svgRef.current;
      if (!svg) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const dt = lastTimestampRef.current ? (timestamp - lastTimestampRef.current) / 1000 : 0;
      lastTimestampRef.current = timestamp;

      const vp = rfInstance.getViewport();
      const nodes = rfInstance.getNodes();
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const currentSessions = sessionsRef.current;
      const currentHierarchy = hierarchyRef.current;
      const currentHidden = hiddenIdsRef.current;

      for (const session of currentSessions) {
        const resolvedIds = session.focusArtifactIds
          .map((id) =>
            currentHierarchy && currentHidden.size > 0
              ? resolveVisibleAncestor(id, currentHidden, currentHierarchy.oneWayParents)
              : id,
          )
          .filter((id) => nodeMap.has(id));

        if (resolvedIds.length === 0) {
          const pathEl = svg.querySelector(`[data-orb-path="${session.sessionId}"]`);
          if (pathEl) pathEl.setAttribute('d', '');
          const highlightsEl = svg.querySelector(`[data-orb-highlights="${session.sessionId}"]`);
          if (highlightsEl) highlightsEl.setAttribute('d', '');
          const group = svg.querySelector(`[data-orb-group="${session.sessionId}"]`);
          if (group) group.setAttribute('transform', 'translate(-100, -100)');
          continue;
        }

        let state = orbStatesRef.current.get(session.sessionId);
        if (!state) {
          state = {
            distance: 0,
            lastPos: null,
            lastResolvedKey: resolvedIds.join(','),
            transitionProgress: 1,
            transitionFrom: null,
          };
          orbStatesRef.current.set(session.sessionId, state);
        }

        const resolvedKey = resolvedIds.join(',');
        if (resolvedKey !== state.lastResolvedKey) {
          state.transitionFrom = state.lastPos ? { ...state.lastPos } : null;
          state.transitionProgress = 0;
          state.lastResolvedKey = resolvedKey;
          state.distance = 0;
        }

        if (state.transitionProgress < 1) {
          state.transitionProgress = Math.min(1, state.transitionProgress + dt / (TRANSITION_DURATION / 1000));
        }

        // Measure node dimensions from DOM for accurate centering
        const centers: Point[] = [];
        const halfSizes: { hw: number; hh: number }[] = [];
        for (const id of resolvedIds) {
          const node = nodeMap.get(id);
          if (!node) continue;
          const nodeEl = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
          let w: number, h: number;
          if (nodeEl) {
            w = nodeEl.clientWidth;
            h = nodeEl.clientHeight;
          } else {
            const data = node.data as unknown as MapNodeData | undefined;
            w = node.measured?.width ?? NODE_WIDTHS[data?.artifactType ?? 'unknown'] ?? DEFAULT_NODE_WIDTH;
            h = node.measured?.height ?? NODE_HEIGHTS[data?.artifactType ?? 'unknown'] ?? DEFAULT_NODE_HEIGHT;
          }
          centers.push({ x: node.position.x + w / 2, y: node.position.y + h / 2 });
          halfSizes.push({ hw: w / 2, hh: h / 2 });
        }
        if (centers.length === 0) continue;

        // Compute outline path — single card rect or multi-card convex hull
        let pathPoints: Point[];
        if (centers.length === 1) {
          pathPoints = computeRoundedRectPath(centers[0], halfSizes[0].hw, halfSizes[0].hh, ORBIT_PADDING, ORBIT_CORNER_RADIUS);
        } else {
          pathPoints = computeHullOutlinePath(centers, halfSizes, ORBIT_PADDING, ORBIT_CORNER_RADIUS);
        }
        const perimeter = computePerimeter(pathPoints);

        // Advance distance along outline
        state.distance += dt * ORBIT_SPEED_PX;
        let orbPos = samplePathAtDistance(pathPoints, perimeter, state.distance);

        // Render path outline
        const pathEl = svg.querySelector(`[data-orb-path="${session.sessionId}"]`);
        if (pathEl) {
          pathEl.setAttribute('d', outlineToSvgPath(pathPoints, vp));
        }

        // Render node highlight rings when following this session
        const highlightsEl = svg.querySelector(`[data-orb-highlights="${session.sessionId}"]`);
        if (highlightsEl) {
          if (followingIdRef.current === session.sessionId) {
            const hPaths: string[] = [];
            for (let i = 0; i < centers.length; i++) {
              const hPoints = computeRoundedRectPath(centers[i], halfSizes[i].hw, halfSizes[i].hh, 4, ORBIT_CORNER_RADIUS);
              hPaths.push(outlineToSvgPath(hPoints, vp));
            }
            highlightsEl.setAttribute('d', hPaths.join(' '));
          } else {
            highlightsEl.setAttribute('d', '');
          }
        }

        // Transition blending
        if (state.transitionProgress < 1 && state.transitionFrom) {
          const ease = easeInOutQuad(state.transitionProgress);
          orbPos = {
            x: state.transitionFrom.x + (orbPos.x - state.transitionFrom.x) * ease,
            y: state.transitionFrom.y + (orbPos.y - state.transitionFrom.y) * ease,
          };
        }

        state.lastPos = { ...orbPos };

        const screenX = orbPos.x * vp.zoom + vp.x;
        const screenY = orbPos.y * vp.zoom + vp.y;

        const group = svg.querySelector(`[data-orb-group="${session.sessionId}"]`);
        if (group) {
          group.setAttribute('transform', `translate(${screenX}, ${screenY})`);
        }

        // Follow mode: pan viewport to keep orb centered
        if (followingIdRef.current === session.sessionId) {
          const container = svg.parentElement;
          if (container) {
            const cx = container.clientWidth / 2;
            const cy = container.clientHeight / 2;
            const targetVpX = cx - orbPos.x * vp.zoom;
            const targetVpY = cy - orbPos.y * vp.zoom;
            const lerpFactor = Math.min(1, dt * 3);
            const newVpX = vp.x + (targetVpX - vp.x) * lerpFactor;
            const newVpY = vp.y + (targetVpY - vp.y) * lerpFactor;
            rfInstance.setViewport({ x: newVpX, y: newVpY, zoom: vp.zoom });
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
    };
  }, [sessions.length > 0, rfInstance]);

  if (sessions.length === 0) return null;

  const hoveredSession = hoveredOrb ? sessions.find((s) => s.sessionId === hoveredOrb) : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 10,
      }}
    >
      <svg ref={svgRef} width="100%" height="100%">
        <defs>
          <filter id="orb-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Node highlight rings — visible when following a session */}
        {sessions.map((session) => (
          <path
            key={`highlights-${session.sessionId}`}
            data-orb-highlights={session.sessionId}
            d=""
            fill={session.color}
            fillOpacity={followingId === session.sessionId ? 0.04 : 0}
            stroke={session.color}
            strokeWidth={2}
            opacity={followingId === session.sessionId ? 0.35 : 0}
          />
        ))}

        {/* Path outlines */}
        {sessions.map((session) => {
          const isFollowed = followingId === session.sessionId;
          return (
            <path
              key={`path-${session.sessionId}`}
              data-orb-path={session.sessionId}
              d=""
              fill="none"
              stroke={session.color}
              strokeWidth={isFollowed ? 2 : 1}
              strokeDasharray={isFollowed ? 'none' : '6,4'}
              opacity={isFollowed ? 0.5 : 0.2}
            />
          );
        })}

        {/* Orb groups */}
        {sessions.map((session) => {
          const isFollowed = followingId === session.sessionId;
          return (
            <g
              key={session.sessionId}
              data-orb-group={session.sessionId}
              transform="translate(-100, -100)"
            >
              <circle
                r={isFollowed ? 14 : 10}
                fill={session.color}
                opacity={isFollowed ? 0.2 : 0.12}
              />
              <circle
                r={8}
                fill={session.color}
                opacity={0.9}
                stroke="white"
                strokeWidth={isFollowed ? 2.5 : 1.5}
                filter="url(#orb-glow)"
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  setHoveredOrb(session.sessionId);
                  setTooltipPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => {
                  setTooltipPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoveredOrb(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFollow(session.sessionId);
                }}
              />
              {isFollowed && (
                <circle
                  r={12}
                  fill="none"
                  stroke="white"
                  strokeWidth={1}
                  opacity={0.4}
                  strokeDasharray="3,3"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredSession && (
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.x + 14,
            top: tooltipPos.y - 10,
            pointerEvents: 'none',
            zIndex: 50,
          }}
          className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg"
        >
          <div className="text-xs font-semibold">{hoveredSession.title}</div>
          {hoveredSession.phase && (
            <div className="text-[10px] text-muted-foreground">{hoveredSession.phase}</div>
          )}
          <div className="text-[10px] text-muted-foreground/60 mt-0.5">
            Click to {followingId === hoveredSession.sessionId ? 'unfollow' : 'follow'}
          </div>
        </div>
      )}

      {/* Floating OrbCraft session panel */}
      <div
        style={{ pointerEvents: 'auto' }}
        className="absolute bottom-3 left-3 z-10 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-lg overflow-hidden"
      >
        <div className="px-3 py-1.5 border-b border-border/50 flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-brand animate-pulse" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">OrbCraft</span>
          <span className="text-[10px] text-muted-foreground/50">{sessions.length}</span>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {sessions.map((session) => {
            const isFollowed = followingId === session.sessionId;
            return (
              <div
                key={session.sessionId}
                className={`flex items-center gap-2 px-2 py-1.5 transition cursor-pointer ${isFollowed ? 'bg-accent/60' : 'hover:bg-accent/30'}`}
                onClick={() => toggleFollow(session.sessionId)}
              >
                <div
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0 border border-white/30"
                  style={{ backgroundColor: session.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium truncate leading-tight">{session.title}</div>
                  {session.phase && (
                    <div className="text-[9px] text-muted-foreground leading-tight">{session.phase}</div>
                  )}
                </div>
                {isFollowed && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground flex-shrink-0">
                    <circle cx="6" cy="6" r="3" />
                    <line x1="6" y1="1" x2="6" y2="3" />
                    <line x1="6" y1="9" x2="6" y2="11" />
                    <line x1="1" y1="6" x2="3" y2="6" />
                    <line x1="9" y1="6" x2="11" y2="6" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const OrbOverlay = memo(OrbOverlayComponent);
