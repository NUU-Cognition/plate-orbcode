import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  ChevronRight,
  Layers,
  Zap,
  Database,
  Layout,
  Map,
  CheckCircle2,
  HelpCircle,
  PackageOpen,
  Users,
  FlaskConical,
  TestTubes,
  Route,
  Server,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { TYPE_COLORS, NODE_WIDTHS, DEFAULT_NODE_WIDTH, type MapNodeData, type MapArtifactType } from '../../lib/orbcode';

const TYPE_ICONS: Record<MapArtifactType, typeof Layers> = {
  project: Layers,
  system: Layers,
  feature: Zap,
  data: Database,
  ui: Layout,
  dependency: PackageOpen,
  consumer: Users,
  overview: Map,
  test: CheckCircle2,
  testsuite: TestTubes,
  e2e: Route,
  env: Server,
  unknown: HelpCircle,
};

function MapNodeComponent({ data, selected }: { data: MapNodeData; selected?: boolean }) {
  const colors = TYPE_COLORS[data.artifactType];
  const Icon = TYPE_ICONS[data.artifactType];
  const isContainer = data.artifactType === 'system' || data.artifactType === 'testsuite' || data.artifactType === 'ui';
  const w = NODE_WIDTHS[data.artifactType] ?? DEFAULT_NODE_WIDTH;

  const hasSelection = data._hasSelection;
  const isConnected = data._isConnected;
  const dimmed = hasSelection && !isConnected && !selected;

  const isCollapsed = data._isCollapsed;
  const childCount = data._collapsedChildCount ?? 0;
  const isCollapsible = isContainer && childCount > 0;

  const fs = data.featureStatus;
  const hasOrb = data._hasOrbcraftOrb;

  return (
    <>
      <Handle id="left-in" type="target" position={Position.Left} className="!w-0 !h-0 !border-0 !bg-transparent !min-w-0 !min-h-0" />
      <div
        style={{ width: w }}
        className={cn(
          'rounded-xl border shadow-sm transition-all duration-200',
          'px-3 py-2',
          colors.bg,
          colors.border,
          selected && 'ring-2 ring-ring/50 shadow-md',
          fs === 'draft' && 'border-dashed bg-muted border-muted-foreground/25',
          fs === 'untested' && 'bg-sun-bg border-sun/40',
          fs === 'stale' && 'bg-sun-bg border-sun/40',
          fs === 'fail' && 'bg-rose-bg border-rose/40',
          fs === 'deprecated' && 'opacity-50 border-dashed',
          isConnected && !selected && 'ring-1 ring-ring/30 shadow-sm',
          dimmed && '!opacity-25',
          hasOrb && 'orbcraft-glow',
        )}
      >
        <div className="flex items-center gap-1.5">
          {isCollapsible && (
            <span
              data-collapse-toggle
              className="flex-shrink-0 p-0.5 -ml-1 rounded hover:bg-black/10 cursor-pointer"
            >
              <ChevronRight className={cn('h-3 w-3 text-muted-foreground transition', !isCollapsed && 'rotate-90')} />
            </span>
          )}
          <div className={cn(
            'flex-shrink-0',
            colors.icon,
            fs === 'draft' && 'text-muted-foreground',
            fs === 'untested' && 'text-sun',
            fs === 'stale' && 'text-sun',
            fs === 'fail' && 'text-rose',
            fs === 'deprecated' && 'text-muted-foreground',
          )}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn(
              'font-semibold leading-tight truncate text-xs',
              colors.text,
              fs === 'draft' && 'text-muted-foreground',
              fs === 'untested' && 'text-sun-text',
              fs === 'stale' && 'text-sun-text',
              fs === 'fail' && 'text-rose-text',
              fs === 'deprecated' && 'text-muted-foreground line-through',
            )}>
              {data.label}
            </div>
          </div>
          {isCollapsed && childCount > 0 && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">+{childCount}</span>
          )}
        </div>
      </div>
      <Handle id="right-out" type="source" position={Position.Right} className="!w-0 !h-0 !border-0 !bg-transparent !min-w-0 !min-h-0" />
    </>
  );
}

export const MapNode = memo(MapNodeComponent);
