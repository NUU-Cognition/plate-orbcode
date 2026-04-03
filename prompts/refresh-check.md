---
name: refresh-check
description: Check OrbCode map artifacts against source code and fix any drift
variables:
  artifactPaths:
    type: string
    required: true
    description: Newline-separated list of artifact file paths to refresh
  referencedArtifacts:
    type: string
    required: false
    description: Newline-separated list of referenced artifact paths from artifact-refs
  codeReferences:
    type: string
    required: false
    description: Newline-separated list of code reference paths from code-refs
  additionalContext:
    type: string
    required: false
    description: Optional user instructions for the refresh check
---
You are performing a **refresh check** on OrbCode map artifacts. Your job is to validate each artifact against the current source code and **fix any drift you find**.

Artifacts to refresh:

{{ artifactPaths }}

Read each artifact fully, then gather context:
{{#if referencedArtifacts}}

Referenced artifacts:
{{ referencedArtifacts }}
{{/if}}
{{#if codeReferences}}

Code references to validate:
{{ codeReferences }}
{{/if}}

## Validation & Fix Steps

For each artifact:

1. **Code-refs validity** — Check that all `code-refs` paths still exist. Remove refs to deleted files. Update refs to renamed/moved files. Add missing refs for files that clearly belong to this artifact's scope.
2. **Description accuracy** — Read the referenced source code. If the artifact's description no longer matches what the code does (new features added, purpose changed, major refactors), update the description to reflect current reality.
3. **Artifact-refs validity** — Check that all `artifact-refs` still point to existing artifacts. Remove broken refs, update renamed ones.
4. **Status field** — If the artifact was marked `stale`, and you've now brought it up to date, set status to `verified` (for features/UI) or `active` (for systems/data). If you find issues you cannot resolve, set status to `stale`.

## Approach

This is a **quick, targeted refresh** — not a full rewrite. Focus on factual accuracy:
- Fix broken or outdated references
- Correct descriptions that have diverged from the code
- Keep the artifact's existing structure and voice
- Don't expand scope or add speculative content

If an artifact is already accurate, leave it unchanged.

{{#if additionalContext}}
Additional instructions from the user:

{{ additionalContext }}
{{/if}}

## OrbCraft

Read [[knw-orbc-orbcraft]] for full documentation on the OrbCraft visualization system.

Your initial focus artifacts have been set in session metadata (`orbcraft-artifacts`). Your orb is now orbiting those artifacts on the map.

When your focus shifts to different artifacts, update the `orbcraft-focus` interface key:
```bash
flint orb set <your-session-id> orbcraft-focus "<comma-separated artifact UUIDs>"
```
Additions merge with your preset artifacts. When you create new artifacts, add their UUIDs so the user sees your orb move to them.
