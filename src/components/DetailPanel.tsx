import {
  ArtifactPreview,
  type EnrichedSessionStatus,
} from '@nuucognition/plate-sdk';
import {
  ClipboardList,
  FlaskConical,
  Layers,
  Layout,
  Plus,
  Route,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';
import { MapPreviewStatusField } from './MapPreviewStatusField';
import { cn } from '../lib/utils';
import { TYPE_COLORS, type MapNodeData } from '../lib/orbcode';

export function DetailPanel({
  artifact,
  nodeData,
  sessionIds,
  sessionStatuses,
  onRefactor,
  onRefine,
  onCreateFeature,
  onCreateUi,
  onCreateTask,
  onCreateTest,
  onCreateE2e,
  onCreateSystem,
  onSetStatus,
  onClose,
  onLinkClick,
  onSessionClick,
}: {
  artifact: { id: string; filename: string; frontmatter: Record<string, unknown>; body: string; path?: string };
  nodeData: MapNodeData | null;
  sessionIds: string[];
  sessionStatuses: Map<string, EnrichedSessionStatus>;
  onRefactor: () => void;
  onRefine: () => void;
  onCreateFeature: () => void;
  onCreateUi: () => void;
  onCreateTask: () => void;
  onCreateTest: () => void;
  onCreateE2e: () => void;
  onCreateSystem: () => void;
  onSetStatus: (status: string) => void;
  onClose: () => void;
  onLinkClick: (target: string) => void;
  onSessionClick: (sessionId: string) => void;
}) {
  const hasActiveSession = sessionIds.some(sid => {
    const st = sessionStatuses.get(sid)?.status;
    return st === 'active' || st === 'awaiting-input';
  });

  const hasLifecycle = nodeData != null && nodeData.artifactType !== 'project' && nodeData.artifactType !== 'unknown';

  return (
    <div className="w-[640px] flex-shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {nodeData && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] py-0.5',
                TYPE_COLORS[nodeData.artifactType].text,
              )}
            >
              {nodeData.artifactType}
            </Badge>
          )}
          <span className="text-sm font-semibold truncate">
            {nodeData?.label ?? artifact.filename}
          </span>
          {hasActiveSession && (
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-earth opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-earth" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasLifecycle && (
            <MapPreviewStatusField
              frontmatter={artifact.frontmatter}
              disabled={false}
              onChange={onSetStatus}
            />
          )}
          {nodeData?.artifactType === 'overview' && (
            <Tooltip label="Create System">
              <Button size="icon" variant="outline" onClick={onCreateSystem} aria-label="Create System" className="h-7 w-7">
                <Layers className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {(nodeData?.artifactType === 'system' || nodeData?.artifactType === 'feature') && (
            <Tooltip label="Create Feature">
              <Button size="icon" variant="outline" onClick={onCreateFeature} aria-label="Create Feature" className="h-7 w-7">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {(nodeData?.artifactType === 'system' || nodeData?.artifactType === 'feature' || nodeData?.artifactType === 'ui') && (
            <Tooltip label="Create UI">
              <Button size="icon" variant="outline" onClick={onCreateUi} aria-label="Create UI" className="h-7 w-7">
                <Layout className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {(nodeData?.artifactType === 'feature' || nodeData?.artifactType === 'ui') && (
            <Tooltip label="Create Test">
              <Button size="icon" variant="outline" onClick={onCreateTest} aria-label="Create Test" className="h-7 w-7">
                <FlaskConical className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {(nodeData?.artifactType === 'system' || nodeData?.artifactType === 'feature') && (
            <Tooltip label="Create E2E">
              <Button size="icon" variant="outline" onClick={onCreateE2e} aria-label="Create E2E" className="h-7 w-7">
                <Route className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          {hasLifecycle && (
            <Tooltip label="Create Task">
              <Button size="icon" variant="outline" onClick={onCreateTask} aria-label="Create Task" className="h-7 w-7">
                <ClipboardList className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
          <Tooltip label="Refine">
            <Button size="icon" variant="outline" onClick={onRefine} aria-label="Refine" className="h-7 w-7">
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <Tooltip label="Refactor">
            <Button size="icon" variant="outline" onClick={onRefactor} aria-label="Refactor" className="h-7 w-7">
              <Scissors className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <button type="button" onClick={onClose} title="Close" className="ml-1 rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4">
        <ArtifactPreview
          frontmatter={artifact.frontmatter}
          body={artifact.body}
          onLinkClick={onLinkClick}
          onSessionClick={onSessionClick}
          sessionStatuses={sessionStatuses}
          renderFieldValue={({ key, frontmatter: fm }) => {
            if (key !== 'status') return undefined;
            return (
              <MapPreviewStatusField
                frontmatter={fm}
                disabled={false}
                onChange={onSetStatus}
              />
            );
          }}
        />
      </div>
    </div>
  );
}
