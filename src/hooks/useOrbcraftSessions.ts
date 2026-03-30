import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlateContext } from '@nuucognition/plate-sdk';

export interface OrbcraftSession {
  sessionId: string;
  title: string;
  phase?: string;
  focusArtifactIds: string[];
  color: string;
}

const ORB_COLORS = [
  'var(--water)',
  'var(--earth)',
  'var(--fire)',
  'var(--sun)',
  'var(--air)',
  'var(--teal)',
  'var(--rose)',
];

/**
 * Poll active sessions for orbcraft focus artifacts.
 *
 * The effective orbit set for each session is:
 *   metadata['orbcraft-artifacts'] (presets declared at launch)
 *   + interface['orbcraft-focus'] (runtime additions via agent)
 *
 * Returns sessions that have a non-empty combined set, with stable color assignment.
 */
export function useOrbcraftSessions(
  activeSessionIds: string[],
  enabled: boolean,
): OrbcraftSession[] {
  const context = usePlateContext();
  const [sessions, setSessions] = useState<OrbcraftSession[]>([]);
  const colorMap = useRef<Map<string, string>>(new Map());
  const colorIndex = useRef(0);

  const getColor = useCallback((sessionId: string) => {
    if (!colorMap.current.has(sessionId)) {
      colorMap.current.set(sessionId, ORB_COLORS[colorIndex.current % ORB_COLORS.length]);
      colorIndex.current++;
    }
    return colorMap.current.get(sessionId)!;
  }, []);

  const idsKey = activeSessionIds.join(',');

  useEffect(() => {
    if (!enabled || activeSessionIds.length === 0) {
      setSessions([]);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `${context.serverUrl}/orbh/sessions?ids=${activeSessionIds.join(',')}`,
          { cache: 'no-store' },
        );
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as {
          sessions: Record<string, {
            title?: string;
            metadata?: Record<string, unknown>;
            interface?: Record<string, string>;
          } | null>;
        };

        const result: OrbcraftSession[] = [];
        for (const [sid, entry] of Object.entries(payload.sessions)) {
          if (!entry) continue;

          // Collect preset artifacts from session metadata (set at launch)
          const metadataArtifacts = parseArtifactIds(
            entry.metadata?.['orbcraft-artifacts'] as string | undefined,
          );

          // Collect runtime additions from interface key (set mid-session by agent)
          const interfaceArtifacts = parseArtifactIds(
            entry.interface?.['orbcraft-focus'],
          );

          // Merge and deduplicate: presets + runtime additions
          const allIds = [...new Set([...metadataArtifacts, ...interfaceArtifacts])];
          if (allIds.length === 0) continue;

          result.push({
            sessionId: sid,
            title: entry.title ?? sid.slice(0, 8),
            phase: entry.interface?.phase,
            focusArtifactIds: allIds,
            color: getColor(sid),
          });
        }

        if (!cancelled) setSessions(result);
      } catch {
        // Ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, idsKey, context.serverUrl, getColor]);

  return sessions;
}

/** Parse a comma-separated string of artifact UUIDs into a trimmed, non-empty array */
function parseArtifactIds(raw: string | undefined): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
