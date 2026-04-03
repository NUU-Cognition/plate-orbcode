import { useCallback } from 'react';
import type { Artifact, LaunchAgentOpts, PlateContext } from '@nuucognition/plate-sdk';
import type { MapNodeData, FlowNode, OrbCodeProject } from '../lib/orbcode';
import { renderOrbCodePrompt } from '../lib/prompts';

/** Maps create actions to their OrbCode artifact type name and subfolder. */
const CREATE_ACTION_META: Record<string, { type: string; tag: string; folder: string }> = {
  'create-feature': { type: 'Feature', tag: '#orbc/feature', folder: 'Map' },
  'create-ui': { type: 'UI', tag: '#orbc/ui', folder: 'Map' },
  'create-system': { type: 'System', tag: '#orbc/system', folder: 'Map' },
  'create-test': { type: 'Test', tag: '#orbc/test', folder: 'Testing' },
  'create-e2e': { type: 'E2E', tag: '#orbc/e2e', folder: 'Testing' },
  'create-environment': { type: 'Environment', tag: '#orbc/environment', folder: 'Context' },
  'create-task': { type: 'Task', tag: '#proj/task', folder: '' },
};

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
      create: (template: string, data: Record<string, unknown>) => Promise<Artifact>;
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

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function inferProjectName(value: string): string | null {
  const match = value.match(/\(OrbCode Project\)\s+([^.\/]+)/);
  return match?.[1]?.trim() ?? null;
}

export async function buildUpdateOrbCodeFromTaskLaunch(
  context: PlateContext,
  input: Record<string, unknown>,
): Promise<LaunchAgentOpts> {
  const taskArtifactId = normalizeString(input.taskArtifactId);
  const taskArtifact = taskArtifactId ? await context.artifacts.get(taskArtifactId) : null;
  const taskPath = normalizeString(input.taskPath) || taskArtifact?.path || '';
  const taskTitle = normalizeString(input.taskTitle) || taskArtifact?.filename.replace(/\.md$/i, '') || 'Task';
  const taskNumber = normalizeString(input.taskNumber);
  const additionalContext = normalizeString(input.additionalContext);
  const runtime = normalizeString(input.runtime) || 'claude';

  if (!taskPath) {
    throw new Error('taskArtifactId or taskPath is required.');
  }

  const taskOrbCodeRefs = [
    ...normalizeStringArray(input.orbcodeRefs),
    ...normalizeStringArray(taskArtifact?.frontmatter['orbcode-refs']),
  ].filter((value, index, values) => values.indexOf(value) === index);

  const resolvedOrbCodeArtifacts = await Promise.all(taskOrbCodeRefs.map(async (ref) => {
    const resolved = await context.artifacts.resolveWikilink(ref);
    if (!resolved?.id) {
      return null;
    }
    try {
      return await context.artifacts.get(resolved.id);
    } catch {
      return null;
    }
  }));

  const orbCodeArtifacts = resolvedOrbCodeArtifacts.filter((artifact): artifact is Artifact => artifact != null);
  const projectName = normalizeString(input.orbcodeProject)
    || inferProjectName(taskOrbCodeRefs[0] ?? '')
    || inferProjectName(orbCodeArtifacts[0]?.path ?? '')
    || '';

  const orbCodeArtifactPaths = orbCodeArtifacts.map((artifact) => `- ${artifact.path}`).join('\n');
  const orbCodeRefs = taskOrbCodeRefs.map((ref) => `- ${ref}`).join('\n');
  const label = taskNumber ? `Task #${taskNumber}` : taskTitle;

  return {
    shard: 'OrbCode',
    title: `Update OrbCode for ${label}`,
    description: taskOrbCodeRefs.length > 0
      ? `Update linked OrbCode artifacts based on ${label}.`
      : `Inspect OrbCode projects and update the relevant artifacts for ${label}.`,
    prompt: await renderOrbCodePrompt('update-from-task', {
      taskPath,
      taskTitle,
      taskNumber: taskNumber || undefined,
      projectName: projectName || undefined,
      orbcodeArtifactPaths: orbCodeArtifactPaths || undefined,
      orbcodeRefs: orbCodeRefs || undefined,
      additionalContext: additionalContext || undefined,
    }),
    runtime,
    open: false,
    artifactId: orbCodeArtifacts[0]?.id ?? taskArtifactId ?? undefined,
    metadata: {
      plate: 'orbcode-map',
      action: 'update-from-task',
      ...(projectName ? { 'orbcode-project': projectName, project: projectName } : {}),
      ...(orbCodeArtifacts.length > 0 ? { 'orbcraft-artifacts': orbCodeArtifacts.map((artifact) => artifact.id).join(',') } : {}),
    },
  };
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
        metadata: { plate: 'orbcode-map', 'orbcode-project': selectedProject?.name ?? '', project: selectedProject?.name ?? '', action: 'refactor', 'orbcraft-artifacts': artifacts.map(a => a.id).join(',') },
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
        metadata: { plate: 'orbcode-map', 'orbcode-project': selectedProject?.name ?? '', project: selectedProject?.name ?? '', action: 'refine', 'orbcraft-artifacts': artifacts.map(a => a.id).join(',') },
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

  const launchRefreshCheck = useCallback(async (runtime: string, userPrompt: string) => {
    const targetIds = launchTarget === 'detail' && detailArtifact
      ? [detailArtifact.id]
      : [...selectedIds];

    const artifacts = targetIds
      .map(id => orbcodeArtifacts.find(a => a.id === id))
      .filter(Boolean) as Artifact[];

    if (artifacts.length === 0) {
      context.notify({ tone: 'warning', text: 'Select an artifact before launching a refresh check.' });
      return;
    }

    const nameList = summarizeNames(artifacts, graphNodes);
    const title = `Refresh Check: ${nameList}`;
    const pathList = artifacts.map(a => `- ${a.path}`).join('\n');

    const allRefs = new Set<string>();
    const allCodeRefs = new Set<string>();
    for (const a of artifacts) {
      for (const r of (a.frontmatter['artifact-refs'] as string[] | undefined) ?? []) allRefs.add(r);
      for (const r of (a.frontmatter['code-refs'] as string[] | undefined) ?? []) allCodeRefs.add(r);
    }

    try {
      const prompt = await renderOrbCodePrompt('refresh-check', {
        artifactPaths: pathList,
        referencedArtifacts: allRefs.size > 0 ? [...allRefs].map(r => `- ${r}`).join('\n') : undefined,
        codeReferences: allCodeRefs.size > 0 ? [...allCodeRefs].map(r => `- ${r}`).join('\n') : undefined,
        additionalContext: userPrompt.trim() || undefined,
      });

      const { sessionId, session } = await context.launchAgent({
        prompt,
        shard: 'OrbCode',
        title,
        description: `Checking freshness of ${artifacts.length} OrbCode artifact${artifacts.length > 1 ? 's' : ''}`,
        runtime,
        artifactId: artifacts[0].id,
        metadata: { plate: 'orbcode-map', 'orbcode-project': selectedProject?.name ?? '', project: selectedProject?.name ?? '', action: 'refresh-check', 'orbcraft-artifacts': artifacts.map(a => a.id).join(',') },
      });

      onLinkSession(sessionId, artifacts);
      onTrackSession(sessionId, artifacts.map(a => a.id), title, 'refresh-check', session);
      onDialogClose();
      clearSelectionIfNeeded();
      onSwitchToSessions();
    } catch (err) {
      console.error('Failed to launch refresh check agent:', err);
      context.notify({ tone: 'error', text: `Failed to launch refresh check session: ${describeError(err)}` });
    }
  }, [launchTarget, detailArtifact, selectedIds, orbcodeArtifacts, graphNodes, context, selectedProject, onDialogClose, clearSelectionIfNeeded, onTrackSession, onLinkSession, onSwitchToSessions]);

  // Generic create-action launcher — creates a stub file, then launches the agent to fill it in.
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
    const projectName = selectedProject?.name ?? '';

    if (!projectName) {
      context.notify({ tone: 'warning', text: 'Select an OrbCode project before launching a create action.' });
      return;
    }

    try {
      // Create a stub file before launching the agent so it appears on the UI immediately.
      const meta = CREATE_ACTION_META[action];
      let stubArtifact: Artifact | null = null;
      let stubPath: string | undefined;

      if (meta && projectName) {
        const stubFilename = meta.folder
          ? `Mesh/OrbCode/(OrbCode Project) ${projectName}/${meta.folder}/(OrbCode Project) ${projectName} . (${meta.type}) Stub.md`
          : `Mesh/Types/Tasks/(Task) Stub.md`;

        try {
          stubArtifact = await context.artifacts.create('stub', {
            path: stubFilename,
            type: meta.type,
            tags: [meta.tag],
            status: 'stub',
          });
          stubPath = stubArtifact.path;
        } catch (stubErr) {
          console.warn(`Stub creation failed for ${action}, launching without stub:`, stubErr);
        }
      }

      const prompt = await renderOrbCodePrompt(promptType as Parameters<typeof renderOrbCodePrompt>[0], {
        artifactPaths: hasContext ? pathList : undefined,
        additionalContext: userPrompt.trim() || undefined,
        projectName: projectName || undefined,
        stubPath: stubPath || undefined,
      });

      // Include the stub's ID in orbcraft-artifacts so it shows as "in session" on the map.
      const orbcraftIds = contextArtifacts.map(a => a.id);
      if (stubArtifact) orbcraftIds.push(stubArtifact.id);

      const { sessionId, session } = await context.launchAgent({
        prompt,
        shard: 'OrbCode',
        title,
        description: `${descriptionPrefix}${hasContext ? ` ${nameList}` : ''}`,
        runtime,
        ...((stubArtifact ?? contextArtifacts[0]) ? { artifactId: (stubArtifact ?? contextArtifacts[0]).id } : {}),
        metadata: { plate: 'orbcode-map', 'orbcode-project': projectName, project: projectName, action, 'orbcraft-artifacts': orbcraftIds.join(',') },
      });

      if (stubArtifact && hasContext) {
        onLinkSession(sessionId, [stubArtifact, ...contextArtifacts]);
      } else if (hasContext) {
        onLinkSession(sessionId, contextArtifacts);
      }
      onTrackSession(sessionId, orbcraftIds, title, action, session);
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

  const launchCreateEnvironment = useCallback(async (runtime: string, userPrompt: string) => {
    await launchCreateAction('create-environment', 'create-environment', runtime, userPrompt, 'Create Environment', 'Creating draft environment under');
  }, [launchCreateAction]);

  return {
    launchRefactor,
    launchRefine,
    launchRefreshCheck,
    launchCreateFeature,
    launchCreateUi,
    launchCreateTask,
    launchCreateTest,
    launchCreateE2e,
    launchCreateSystem,
    launchCreateEnvironment,
  };
}
