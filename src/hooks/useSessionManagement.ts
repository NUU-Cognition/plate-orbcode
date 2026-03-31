import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useSessionStatuses,
  type EnrichedSessionStatus,
} from '@nuucognition/plate-sdk';
import type { Artifact } from '@nuucognition/plate-sdk';
import type { OrbCodeProject } from '../lib/orbcode';

/** Extract session IDs from the unified `orbh-sessions` frontmatter field. */
function extractSessionIds(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter['orbh-sessions'];
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const match = entry.trim().match(/^\[\[(.+)\]\]$/);
    const id = match ? match[1].trim() : entry.trim();
    if (id) ids.push(id);
  }
  return ids;
}

export const SESSION_STATUS_COLORS: Record<string, string> = {
  active: 'bg-earth text-white',
  'awaiting-input': 'bg-sun text-white',
  finished: 'bg-muted text-muted-foreground',
  failed: 'bg-fire text-white',
  unknown: 'bg-muted text-muted-foreground',
};

export function useSessionManagement(
  orbcodeArtifacts: Artifact[],
  projects: OrbCodeProject[],
  selectedProjectId: string | null,
  context: { artifacts: { update: (id: string, data: { frontmatter: Record<string, unknown> }) => void } },
) {
  // Discover sessions from artifact frontmatter
  const { artifactSessionIds, sessionToArtifacts } = useMemo(() => {
    const ids = new Set<string>();
    const mapping = new Map<string, string[]>();
    for (const a of orbcodeArtifacts) {
      for (const sid of extractSessionIds(a.frontmatter)) {
        ids.add(sid);
        const existing = mapping.get(sid) ?? [];
        existing.push(a.id);
        mapping.set(sid, existing);
      }
    }
    return { artifactSessionIds: ids, sessionToArtifacts: mapping };
  }, [orbcodeArtifacts]);

  // Optimistic overlay for freshly launched sessions
  const [optimisticSessions, setOptimisticSessions] = useState<Map<string, string[]>>(new Map());
  const [optimisticStatuses, setOptimisticStatuses] = useState<Map<string, EnrichedSessionStatus>>(new Map());

  // Merge artifact + optimistic session IDs
  const allSessionIds = useMemo(() => {
    const ids = new Set(artifactSessionIds);
    for (const sid of optimisticSessions.keys()) ids.add(sid);
    return [...ids].sort();
  }, [artifactSessionIds, optimisticSessions]);

  const sdkSessionStatuses = useSessionStatuses(allSessionIds);

  // Merge SDK statuses with optimistic layer
  const sessionStatuses = useMemo(() => {
    if (optimisticStatuses.size === 0) return sdkSessionStatuses;
    const merged = new Map(sdkSessionStatuses);
    for (const [id, status] of optimisticStatuses) {
      if (!sdkSessionStatuses.has(id) || sdkSessionStatuses.get(id)?.status === 'unknown') {
        merged.set(id, status);
      }
    }
    return merged;
  }, [sdkSessionStatuses, optimisticStatuses]);

  // Clean up optimistic state once artifact SSE / SDK catches up
  useEffect(() => {
    if (optimisticSessions.size === 0 && optimisticStatuses.size === 0) return;
    let sessionsChanged = false;
    let statusesChanged = false;
    const nextSessions = new Map(optimisticSessions);
    const nextStatuses = new Map(optimisticStatuses);
    for (const [sid] of optimisticSessions) {
      if (artifactSessionIds.has(sid)) { nextSessions.delete(sid); sessionsChanged = true; }
    }
    for (const [sid] of optimisticStatuses) {
      const sdk = sdkSessionStatuses.get(sid);
      if (sdk && sdk.status !== 'unknown') { nextStatuses.delete(sid); statusesChanged = true; }
    }
    if (sessionsChanged) setOptimisticSessions(nextSessions);
    if (statusesChanged) setOptimisticStatuses(nextStatuses);
  }, [artifactSessionIds, sdkSessionStatuses, optimisticSessions, optimisticStatuses]);

  // Filter to sessions launched from this plate for the current project
  const currentProjectName = useMemo(() => {
    const proj = projects.find(p => p.id === selectedProjectId) ?? projects[0];
    return proj?.name ?? null;
  }, [projects, selectedProjectId]);

  const plateSessions = useMemo(() => {
    return allSessionIds.filter(sid => {
      const status = sessionStatuses.get(sid);
      if (!status?.metadata || status.metadata.plate !== 'orbcode-map') return false;
      if (currentProjectName && status.metadata.project) {
        return status.metadata.project === currentProjectName;
      }
      return true;
    });
  }, [allSessionIds, sessionStatuses, currentProjectName]);

  // Sessions for a specific artifact
  const sessionsForArtifact = useCallback((artifactId: string) => {
    return plateSessions.filter(sid => {
      const fromArtifact = sessionToArtifacts.get(sid) ?? [];
      const fromOptimistic = optimisticSessions.get(sid) ?? [];
      return fromArtifact.includes(artifactId) || fromOptimistic.includes(artifactId);
    });
  }, [plateSessions, sessionToArtifacts, optimisticSessions]);

  // Active session count (for sidebar badge)
  const activeSessionCount = useMemo(() => {
    let count = 0;
    for (const sid of plateSessions) {
      const status = sessionStatuses.get(sid)?.status;
      if (status === 'active' || status === 'awaiting-input') count++;
    }
    return count;
  }, [plateSessions, sessionStatuses]);

  // Active orbcraft session IDs
  const activeOrbcraftSessionIds = useMemo(() => {
    return plateSessions.filter(sid => {
      const status = sessionStatuses.get(sid)?.status;
      return status === 'active' || status === 'awaiting-input';
    });
  }, [plateSessions, sessionStatuses]);

  /** Track optimistic session state for launched agents. */
  const trackSession = useCallback((sessionId: string, artifactIds: string[], title: string, action: string, session: { title?: string; runCount?: number; updated?: string } | null | undefined) => {
    setOptimisticSessions(prev => new Map(prev).set(sessionId, artifactIds));
    setOptimisticStatuses(prev => {
      const next = new Map(prev);
      next.set(sessionId, {
        status: 'active',
        title: session?.title ?? title,
        runCount: session?.runCount ?? 0,
        lastActive: session?.updated,
        metadata: { plate: 'orbcode-map', project: currentProjectName ?? '', action, 'orbcraft-artifacts': artifactIds.join(',') },
      });
      return next;
    });
  }, [currentProjectName]);

  /** Link session to multiple artifacts (beyond the first that launchAgent handles). */
  const linkSessionToArtifacts = useCallback((sessionId: string, artifacts: Artifact[]) => {
    const sessionRef = `[[${sessionId}]]`;
    for (const a of artifacts.slice(1)) {
      const existing = Array.isArray(a.frontmatter['orbh-sessions'])
        ? (a.frontmatter['orbh-sessions'] as string[])
        : [];
      if (!existing.some(e => e.includes(sessionId))) {
        context.artifacts.update(a.id, {
          frontmatter: { 'orbh-sessions': [...existing, sessionRef] },
        });
      }
    }
  }, [context]);

  return {
    sessionStatuses,
    plateSessions,
    sessionsForArtifact,
    activeSessionCount,
    activeOrbcraftSessionIds,
    optimisticSessions,
    trackSession,
    linkSessionToArtifacts,
  };
}
