import { type EdgeProps, getSmoothStepPath, BaseEdge } from '@xyflow/react';

/**
 * A smooth-step edge that offsets the routing corridor (centerY) so
 * overlapping edges fan out in the middle while converging at node handles.
 * The offset is passed via edge data.offset (in pixels).
 */
export function OffsetSmoothStepEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const offset = (data?.offset as number) ?? 0;
  const midY = (sourceY + targetY) / 2;

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    centerY: midY + offset,
  });

  return <BaseEdge path={path} style={style} markerEnd={markerEnd} />;
}
