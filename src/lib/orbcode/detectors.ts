import type { Artifact } from '@nuucognition/plate-sdk';
import type { ArtifactStatus, MapArtifactType, OrbCodeProject } from './types';

// ── Artifact Filters ─────────────────────────────────────────────────

export function isOrbCodeArtifact(a: Artifact): boolean {
  return a.path.includes('Mesh/OrbCode/');
}

export function isOrbCodeProject(a: Artifact): boolean {
  const name = stripMd(a.filename);
  return name.startsWith('(OrbCode Project)') && !name.includes(' . ');
}

// ── Extractors ───────────────────────────────────────────────────────

export function stripMd(filename: string): string {
  return filename.endsWith('.md') ? filename.slice(0, -3) : filename;
}

export function detectArtifactType(filename: string): MapArtifactType {
  const name = stripMd(filename);
  // Collect all type segments in the dot chain — the LAST one is the actual type.
  // e.g. "... . (System) Auth . (Feature) Login" → types are ['System', 'Feature'], use 'Feature'
  const allMatches = [...name.matchAll(/\.\s+\(([^)]+)\)/g)];
  if (allMatches.length > 0) {
    const lastType = allMatches[allMatches.length - 1][1].toLowerCase();
    if (lastType === 'test suite') return 'testsuite';
    if (lastType === 'system') return 'system';
    if (lastType === 'feature') return 'feature';
    if (lastType === 'data') return 'data';
    if (lastType === 'ui') return 'ui';
    if (lastType === 'dependency') return 'dependency';
    if (lastType === 'consumer') return 'consumer';
    if (lastType === 'overview') return 'overview';
    if (lastType === 'test') return 'test';
    if (lastType === 'e2e') return 'e2e';
    if (lastType === 'environment' || lastType === 'env') return 'env';
  }
  if (name.startsWith('(OrbCode Project)') && !name.includes(' . ')) return 'project';
  return 'unknown';
}

export function extractLabel(filename: string): string {
  const name = stripMd(filename);
  // For chained types like "... . (System) Auth . (Feature) Login", extract label from the LAST segment.
  // Named: last ". (Type) Label" with text after the parens
  const namedMatch = name.match(/\.\s+\([^)]+\)\s+([^.]+)$/);
  if (namedMatch) return namedMatch[1].trim();
  // Singleton: last ". (Type)" with no text after
  const singletonMatch = name.match(/\.\s+\(([^)]+)\)$/);
  if (singletonMatch) return singletonMatch[1];
  const projectMatch = name.match(/\(OrbCode Project\)\s+(.+)$/);
  if (projectMatch) return projectMatch[1];
  return name;
}

export function extractDescription(body: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('`' + '``') && !trimmed.startsWith('~~~')) {
      return trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed;
    }
  }
  return '';
}

export function extractArtifactStatus(fm: Record<string, unknown>, artifactType: MapArtifactType): ArtifactStatus | null {
  if (artifactType === 'project' || artifactType === 'unknown') return null;
  const s = fm.status;
  if (typeof s !== 'string') {
    // Default when status field is missing
    if (artifactType === 'feature' || artifactType === 'ui') return 'verified';
    if (artifactType === 'test' || artifactType === 'testsuite' || artifactType === 'e2e') return 'pass';
    return 'active';
  }
  // Universal statuses (all tiers)
  if (s === 'draft') return 'draft';
  if (s === 'stale') return 'stale';
  if (s === 'deprecated') return 'deprecated';
  // Tier 1 — Feature, UI: draft|untested|stale|verified
  if (artifactType === 'feature' || artifactType === 'ui') {
    if (s === 'untested' || s === 'implementing' || s === 'testing') return 'untested';
    if (s === 'verified') return 'verified';
    return 'verified';
  }
  // Tier 3 — Test, Test Suite, E2E: draft|pass|fail|stale|deprecated
  if (artifactType === 'test' || artifactType === 'testsuite' || artifactType === 'e2e') {
    if (s === 'pass' || s === 'passing') return 'pass';
    if (s === 'fail' || s === 'failing') return 'fail';
    return 'pass';
  }
  // Tier 2 — System, Data, Dependency, Consumer, Overview, Environment: draft|active|stale|deprecated
  if (s === 'active') return 'active';
  return 'active';
}

export function extractCodeRefs(fm: Record<string, unknown>): number {
  const refs = fm['code-refs'];
  if (Array.isArray(refs)) return refs.length;
  return 0;
}

export function extractArtifactRefs(fm: Record<string, unknown>): string[] {
  const refs = fm['artifact-refs'];
  if (!Array.isArray(refs)) return [];
  return refs
    .map(r => {
      if (typeof r !== 'string') return null;
      const match = r.match(/\[\[(.+?)\]\]/);
      return match ? match[1] : null;
    })
    .filter((r): r is string => r !== null);
}

export function belongsToProject(artifact: Artifact, projectName: string): boolean {
  return artifact.path.includes(`(OrbCode Project) ${projectName}/`);
}

// ── Converters ───────────────────────────────────────────────────────

export function toProject(a: Artifact): OrbCodeProject | null {
  if (!isOrbCodeProject(a)) return null;
  const name = extractLabel(a.filename);
  return {
    artifact: a,
    id: a.id,
    name,
    projectType: (a.frontmatter['project-type'] as string) ?? 'application',
    codebase: (a.frontmatter.codebase as string) ?? null,
  };
}

export function isMapLayerArtifact(a: Artifact): boolean {
  const type = detectArtifactType(a.filename);
  return type !== 'unknown' && type !== 'project';
}
