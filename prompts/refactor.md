---
name: refactor
description: Refactor OrbCode map artifacts based on user instructions
variables:
  artifactPaths:
    type: string
    required: true
    description: Newline-separated list of artifact file paths to refactor
  additionalContext:
    type: string
    required: false
    description: Optional user instructions for the refactor
---
You are refactoring OrbCode map artifacts. The user has selected the following artifacts from the visual map:

{{ artifactPaths }}

Read each artifact fully to understand the current map structure, boundaries, and relationships.

{{#if additionalContext}}
Additional instructions from the user:

{{ additionalContext }}
{{/if}}

If no additional instructions were provided, review the selected artifacts and suggest how they could be better organized — splitting large artifacts, merging related ones, or restructuring the hierarchy. Present your plan before making changes.

After making changes, run [[hwkfl-orbc-sync]] to verify the map is consistent.

If you rename, split, or delete any OrbCode artifacts, check their `artifact-refs` for linked Tasks. Update the `orbcode-refs` field on those Tasks to reflect the new artifact name/path. This keeps the bidirectional link intact.

## OrbCraft

Read [[knw-orbc-orbcraft]] for full documentation on the OrbCraft visualization system.

Your initial focus artifacts have been set in session metadata (`orbcraft-artifacts`). Your orb is now orbiting those artifacts on the map.

When your focus shifts to different artifacts, update the `orbcraft-focus` interface key:
```bash
flint orb set <your-session-id> orbcraft-focus "<comma-separated artifact UUIDs>"
```
Additions merge with your preset artifacts. When you create new artifacts, add their UUIDs so the user sees your orb move to them.
