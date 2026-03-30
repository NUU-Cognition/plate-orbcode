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
{{ additionalContext }}
{{else}}
Review the selected artifacts and suggest how they could be better organized — splitting large artifacts, merging related ones, or restructuring the hierarchy. Present your plan before making changes.
{{/if}}

After making changes, run [[hwkfl-orbc-sync]] to verify the map is consistent.

## OrbCraft

Read [[knw-orbc-orbcraft]] for full documentation on the OrbCraft visualization system.

Your initial focus artifacts have been set in session metadata (`orbcraft-artifacts`). Your orb is now orbiting those artifacts on the map.

When your focus shifts to different artifacts, update the `orbcraft-focus` interface key:
```bash
flint orb set <your-session-id> orbcraft-focus "<comma-separated artifact UUIDs>"
```
Additions merge with your preset artifacts. When you create new artifacts, add their UUIDs so the user sees your orb move to them.
