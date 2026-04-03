import { useEffect, useRef, useState } from 'react';
import {
  useMentionAutocomplete,
  usePlateContext,
  type ArtifactSuggestion as SDKArtifactSuggestion,
} from '@nuucognition/plate-sdk';
import {
  LoaderCircle,
  Puzzle,
  Sparkles,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Textarea } from './ui/textarea';
import { cn } from '../lib/utils';

export function LaunchDialog({
  open,
  action = 'refactor',
  artifactCount,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  action?: 'refactor' | 'refine' | 'refresh-check' | 'create-feature' | 'create-ui' | 'create-task' | 'create-test' | 'create-e2e' | 'create-system' | 'create-environment';
  artifactCount: number;
  onConfirm: (runtime: string, additionalContext: string) => void;
  onCancel: () => void;
}) {
  const context = usePlateContext();
  const [runtime, setRuntime] = useState('claude');
  const [additionalContext, setAdditionalContext] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mention = useMentionAutocomplete();

  useEffect(() => {
    let cancelled = false;

    void context.state.get<string>('preferred-runtime').then((savedRuntime) => {
      if (!cancelled && (savedRuntime === 'claude' || savedRuntime === 'codex')) {
        setRuntime(savedRuntime);
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [context.state]);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open) {
      setAdditionalContext('');
      mention.reset();
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open]);

  const handleConfirm = () => {
    void context.state.set('preferred-runtime', runtime).catch(() => {});
    onConfirm(runtime, additionalContext);
  };

  const insertSuggestion = (suggestion: SDKArtifactSuggestion) => {
    const link = mention.insertMention(suggestion);
    if (!link) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? additionalContext.length;
    const triggerIndex = additionalContext.lastIndexOf('@', cursor - 1);
    if (triggerIndex === -1) return;
    const next = `${additionalContext.slice(0, triggerIndex)}${link}${additionalContext.slice(cursor)}`;
    const nextCursor = triggerIndex + link.length;
    setAdditionalContext(next);
    mention.reset();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogClose onClose={onCancel} />
        <DialogHeader>
          <DialogTitle>
            {action === 'refine' ? 'Refine Artifact'
              : action === 'refresh-check' ? 'Refresh Check'
              : action === 'create-feature' ? 'Create Feature'
              : action === 'create-ui' ? 'Create UI'
              : action === 'create-task' ? 'Create Task'
              : action === 'create-test' ? 'Create Test'
              : action === 'create-e2e' ? 'Create E2E Test'
              : action === 'create-system' ? 'Create System'
              : action === 'create-environment' ? 'Create Environment'
              : 'Refactor Artifacts'}
          </DialogTitle>
          <DialogDescription>
            {action === 'refine'
              ? 'Launch an agent to refine this artifact. It will gather context from surrounding artifacts and code before applying your instructions.'
              : action === 'refresh-check'
              ? 'Launch an agent to check whether this artifact is up to date with the source code. It will validate code-refs, descriptions, and artifact-refs — and fix any drift it finds.'
              : action === 'create-feature'
              ? 'Launch an agent to create a new draft feature in the OrbCode map.'
              : action === 'create-ui'
              ? 'Launch an agent to create a new draft UI surface in the OrbCode map.'
              : action === 'create-task'
              ? 'Launch an agent to create a task for modifying this artifact. The task will be linked back to the artifact.'
              : action === 'create-test'
              ? 'Launch an agent to create a draft test that verifies the selected feature.'
              : action === 'create-e2e'
              ? 'Launch an agent to create a draft E2E test spanning systems and features.'
              : action === 'create-system'
              ? 'Launch an agent to create a new system boundary in the OrbCode map.'
              : action === 'create-environment'
              ? 'Launch an agent to create a new environment in the OrbCode map.'
              : `Launch an agent to refactor ${artifactCount} artifact${artifactCount > 1 ? 's' : ''} based on your instructions.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {/* Runtime */}
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">Runtime</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRuntime('claude')}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  runtime === 'claude'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-border/60 text-muted-foreground hover:border-brand/40 hover:text-foreground',
                )}
              >
                Claude
              </button>
              <button
                type="button"
                onClick={() => setRuntime('codex')}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  runtime === 'codex'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-border/60 text-muted-foreground hover:border-brand/40 hover:text-foreground',
                )}
              >
                Codex
              </button>
            </div>
          </div>

          {/* Prompt */}
          <div className="grid gap-1.5">
            <label className="text-xs font-medium">
              Instructions <span className="font-normal text-muted-foreground">(what should the agent do?)</span>
            </label>
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={additionalContext}
                onChange={(e) => {
                  setAdditionalContext(e.target.value);
                  mention.onInputChange(e.target.value, textareaRef.current);
                }}
                onKeyDown={(e) => {
                  if (mention.suggestionsOpen && mention.suggestions.length > 0) {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape') {
                      mention.onKeyDown(e);
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const suggestion = mention.suggestions[mention.selectedIndex] ?? mention.suggestions[0];
                      if (suggestion) insertSuggestion(suggestion);
                      return;
                    }
                  }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
                placeholder={
                  action === 'refine'
                    ? 'e.g. Update code-refs to match the latest file structure... (use @ to reference artifacts)'
                    : action === 'refresh-check'
                    ? 'e.g. Focus on the auth module — it was refactored last week... (use @ to reference artifacts)'
                    : action === 'create-feature'
                    ? 'e.g. A feature that handles webhook delivery with retry logic and dead-letter queue...'
                    : action === 'create-ui'
                    ? 'e.g. A REST API endpoint for managing user settings, with GET/PUT/DELETE...'
                    : action === 'create-task'
                    ? 'e.g. Implement using the existing event system. Add unit tests for retry logic...'
                    : action === 'create-test'
                    ? 'e.g. Unit test that verifies the retry logic handles timeout and network errors...'
                    : action === 'create-e2e'
                    ? 'e.g. End-to-end flow: user creates project → adds features → runs sync...'
                    : action === 'create-system'
                    ? 'e.g. A system boundary for the authentication and authorization subsystem...'
                    : action === 'create-environment'
                    ? 'e.g. A CI environment running GitHub Actions with Node 20 and pnpm...'
                    : 'e.g. Split this feature into two — one for the CLI command and one for the core logic... (use @ to reference artifacts)'
                }
                className="min-h-20 text-xs"
              />
              {mention.suggestionsOpen && mention.suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border/60 bg-background shadow-lg">
                  {mention.suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertSuggestion(suggestion);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                        index === mention.selectedIndex
                          ? 'bg-brand/8 text-brand'
                          : 'hover:bg-muted/40 text-foreground',
                      )}
                    >
                      {suggestion.path.startsWith('Shards/') ? (
                        <Puzzle className="h-3 w-3 shrink-0 text-violet-500" />
                      ) : (
                        <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{suggestion.filename.replace(/\.md$/i, '')}</span>
                      {suggestion.path.startsWith('Shards/') && (
                        <span className="ml-auto shrink-0 rounded bg-violet-500/10 px-1 py-px text-[10px] text-violet-500">shard</span>
                      )}
                    </button>
                  ))}
                  {mention.loading && (
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground">
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                      Searching...
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              The agent will read the selected artifacts and apply your instructions. <kbd className="rounded bg-muted px-1">Cmd+Enter</kbd> to confirm.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            <Sparkles className="h-3.5 w-3.5" />
            Launch Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
