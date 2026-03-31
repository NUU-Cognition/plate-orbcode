import { useCallback } from 'react';
import type { Artifact } from '@nuucognition/plate-sdk';
import type { MapNodeData, FlowNode, OrbCodeProject } from '../lib/orbcode';
import { renderOrbCodePrompt } from '../lib/prompts';

interface LaunchDeps {
  launchTarget: 'selection' | 'detail';
  detailArtifact: Artifact | null;
  selectedIds: Set<string>;
  orbcodeArtifacts: Artifact[];
  graphNodes: FlowNode[];
  selectedProject: OrbCodeProject | null;
  context: {
    launchAgent: (params: {
      prompt: string;
      shard: string;
      title: string;
      description: string;
      runtime: string;
      artifactId?: string;
      metadata: Record<string, string>;
    }) => Promise<{ sessionId: string; session?: { title?: string; runCount?: number; updated?: string } | null }>;
    notify: (opts: { tone: 'info' | 'success' | 'warning' | 'error'; text: string; title?: string }) => void;
    artifacts: {
      update: (id: string, data: { frontmatter: Record<string, unknown> }) => void;
    };
  };
  onDialogClose: () => void;
  onSelectionClear: () => void;
  onTrackSession: (sessionId: string, artifactIds: string[], title: string, action: string, session: { title?: string; runCount?: number; updated?: string } | null | undefined) => void;
  onLinkSession: (sessionId: string, artifacts: Artifact[]) => void;
  onSwitchToSessions: () => void;
}

function resolveTargetArtifacts(deps: LaunchDeps): Artifact[] {
  if (deps.launchTarget === 'detail' && deps.detailArtifact) {
    return [deps.detailArtifact];
  }
  return [...deps.selectedIds]
    .map(id => deps.orbcodeArtifacts.find(a => a.id === id))
    .filter(Boolean) as Artifact[];
}

function summarizeNames(artifacts: Artifact[], graphNodes: FlowNode[]): string {
  const names = artifacts.map(a => {
    const node = graphNodes.find((n: FlowNode) => n.id === a.id);
    return (node?.data as MapNodeData | undefined)?.label ?? a.filename;
  });
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useAgentLaunchers(deps: LaunchDeps) {
  const {
    launchTarget,
    detailArtifact,
    selectedIds,
    orbcodeArtifacts,
    graphNodes,
    selectedProject,
    context,
    onDialogClose,
    onSelectionClear,
    onTrackSession,
    onLinkSession,
    onSwitchToSessions,
  } = deps;

  const clearSelectionIfNeeded = useCallback(() => {
    if (launchTarget === 'selection') {
      onSelectionClear();
    }
  }, [launchTarget, onSelectionClear]);

  const launchRefactor = useCallback(async (runtime: string, additionalContext: string) => {
    const targetIds = launchTarget === 'detail' && detailArtifact
      ? [detailArtifact.id]
      : [...selectedIds];

    const artifacts = targetIds
      .map(id => orbcodeArtifacts.find(a => a.id === id))
      .filter(Boolean) as Artifact[];

    if (artifacts.length === 0) {
      context.notify({ tone: 'warning', text: 'Select an artifact before launching a refactor session.' });
      return;
    }

    const nameList = summarizeNames(artifacts, graphNodes);
    const title = `Refactor: ${nameList}`;
    const pathList = artifacts.map(a => `- ${a.path}`).join('\n');

    try {
      const prompt = await renderOrbCodePrompt('refactor', {
        artifactPaths: pathList,
        additionalContext: additionalContext.trim() || undefined,
      });

      const { sessionId, session } = await context.launchAgent({
        prompt,
        shard: 'OrbCode',
        title,
        description: `Refactoring ${artifacts.length} OrbCode artifact${artifacts.length > 1 ? 's' : ''}`,
        runtime,
        artifactId: artifacts[0].id,
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'refactor', 'orbcraft-artifacts': artifacts.map(a => a.id).join(',') },
      });

      onLinkSession(sessionId, artifacts);
      onTrackSession(sessionId, artifacts.map(a => a.id), title, 'refactor', session);
      onDialogClose();
      clearSelectionIfNeeded();
      onSwitchToSessions();
    } catch (err) {
      console.error('Failed to launch refactor agent:', err);
      context.notify({ tone: 'error', text: `Failed to launch refactor session: ${describeError(err)}` });
    }
  }, [launchTarget, detailArtifact, selectedIds, orbcodeArtifacts, graphNodes, context, selectedProject, onDialogClose, clearSelectionIfNeeded, onTrackSession, onLinkSession, onSwitchToSessions]);

  const launchRefine = useCallback(async (runtime: string, userPrompt: string) => {
    const targetIds = launchTarget === 'detail' && detailArtifact
      ? [detailArtifact.id]
      : [...selectedIds];

    const artifacts = targetIds
      .map(id => orbcodeArtifacts.find(a => a.id === id))
      .filter(Boolean) as Artifact[];

    if (artifacts.length === 0) {
      context.notify({ tone: 'warning', text: 'Select an artifact before launching a refine session.' });
      return;
    }

    const nameList = summarizeNames(artifacts, graphNodes);
    const title = `Refine: ${nameList}`;
    const pathList = artifacts.map(a => `- ${a.path}`).join('\n');

    const allRefs = new Set<string>();
    const allCodeRefs = new Set<string>();
    for (const a of artifacts) {
      for (const r of (a.frontmatter['artifact-refs'] as string[] | undefined) ?? []) allRefs.add(r);
      for (const r of (a.frontmatter['code-refs'] as string[] | undefined) ?? []) allCodeRefs.add(r);
    }

    try {
      const prompt = await renderOrbCodePrompt('refine', {
        artifactPaths: pathList,
        referencedArtifacts: allRefs.size > 0 ? [...allRefs].map(r => `- ${r}`).join('\n') : undefined,
        codeReferences: allCodeRefs.size > 0 ? [...allCodeRefs].map(r => `- ${r}`).join('\n') : undefined,
        additionalContext: userPrompt.trim() || undefined,
      });

      const { sessionId, session } = await context.launchAgent({
        prompt,
        shard: 'OrbCode',
        title,
        description: `Refining ${artifacts.length} OrbCode artifact${artifacts.length > 1 ? 's' : ''}`,
        runtime,
        artifactId: artifacts[0].id,
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action: 'refine', 'orbcraft-artifacts': artifacts.map(a => a.id).join(',') },
      });

      onLinkSession(sessionId, artifacts);
      onTrackSession(sessionId, artifacts.map(a => a.id), title, 'refine', session);
      onDialogClose();
      clearSelectionIfNeeded();
      onSwitchToSessions();
    } catch (err) {
      console.error('Failed to launch refine agent:', err);
      context.notify({ tone: 'error', text: `Failed to launch refine session: ${describeError(err)}` });
    }
  }, [launchTarget, detailArtifact, selectedIds, orbcodeArtifacts, graphNodes, context, selectedProject, onDialogClose, clearSelectionIfNeeded, onTrackSession, onLinkSession, onSwitchToSessions]);

  // Generic create-action launcher
  const launchCreateAction = useCallback(async (
    action: string,
    promptType: string,
    runtime: string,
    userPrompt: string,
    titlePrefix: string,
    descriptionPrefix: string,
  ) => {
    const contextArtifacts = resolveTargetArtifacts(deps);
    const pathList = contextArtifacts.map(a => `- ${a.path}`).join('\n');
    const hasContext = contextArtifacts.length > 0;
    const nameList = hasContext ? summarizeNames(contextArtifacts, graphNodes) : '';

    const title = hasContext ? `${titlePrefix}: ${nameList}` : titlePrefix;

    try {
      const prompt = await renderOrbCodePrompt(promptType, {
        artifactPaths: hasContext ? pathList : undefined,
        additionalContext: userPrompt.trim() || undefined,
      });

      const { sessionId, session } = await context.launchAgent({
        prompt,
        shard: 'OrbCode',
        title,
        description: `${descriptionPrefix}${hasContext ? ` ${nameList}` : ''}`,
        runtime,
        ...(hasContext ? { artifactId: contextArtifacts[0].id } : {}),
        metadata: { plate: 'orbcode-map', project: selectedProject?.name ?? '', action, 'orbcraft-artifacts': contextArtifacts.map(a => a.id).join(',') },
      });

      if (hasContext) onLinkSession(sessionId, contextArtifacts);
      onTrackSession(sessionId, hasContext ? contextArtifacts.map(a => a.id) : [], title, action, session);
      onDialogClose();
      clearSelectionIfNeeded();
      onSwitchToSessions();
    } catch (err) {
      console.error(`Failed to launch ${action} agent:`, err);
      context.notify({ tone: 'error', text: `Failed to launch ${action} session: ${describeError(err)}` });
    }
  }, [deps, graphNodes, context, selectedProject, onDialogClose, clearSelectionIfNeeded, onTrackSession, onLinkSession, onSwitchToSessions]);

  const launchCreateFeature = useCallback(async (runtime: string, userPrompt: string) => {
    await launchCreateAction('create-feature', 'create-feature', runtime, userPrompt, 'Create Feature', 'Creating draft feature under');
  }, [launchCreateAction]);

  const launchCreateUi = useCallback(async (runtime: string, userPrompt: string) => {
    await launchCreateAction('create-ui', 'create-ui', runtime, userPrompt, 'Create UI', 'Creating draft UI under');
  }, [launchCreateAction]);

  const launchCreateTask = useCallback(async (runtime: string, userPrompt: string) => {
    await launchCreateAction('create-task', 'create-task', runtime, userPrompt, 'Create Task', 'Creating task for');
  }, [launchCreateAction]);

  const launchCreateTest = useCallback(async (runtime: string, userPrompt: string) => {
    await launchCreateAction('create-test', 'create-test', runtime, userPrompt, 'Create Test', 'Creating draft test for');
  }, [launchCreateAction]);

  const launchCreateE2e = useCallback(async (runtime: string, userPrompt: string) => {
    await launchCreateAction('create-e2e', 'create-e2e', runtime, userPrompt, 'Create E2E', 'Creating draft E2E test spanning');
  }, [launchCreateAction]);

  const launchCreateSystem = useCallback(async (runtime: string, userPrompt: string) => {
    await launchCreateAction('create-system', 'create-system', runtime, userPrompt, 'Create System', 'Creating draft system under');
  }, [launchCreateAction]);

  return {
    launchRefactor,
    launchRefine,
    launchCreateFeature,
    launchCreateUi,
    launchCreateTask,
    launchCreateTest,
    launchCreateE2e,
    launchCreateSystem,
  };
}
