---
name: create-feature
description: Create a new draft Feature artifact in the OrbCode map
variables:
  artifactPaths:
    type: string
    required: false
    description: Newline-separated list of context artifact paths (parent system/feature)
  additionalContext:
    type: string
    required: false
    description: Description of the feature to create
---
You are creating a new draft Feature artifact in the OrbCode map.
{{#if artifactPaths}}

Context artifacts:
{{ artifactPaths }}

Read these artifacts to understand the context. The new feature should fit within their scope.
{{/if}}

Create the feature using the OrbCode feature template (tmp-orbc-feature-v0.2).
Name it: `(OrbCode Project) [ProjectName] . (Feature) [Descriptive Name].md`
Set status to `draft` — this feature has not been implemented yet.
Link it to the appropriate parent system via artifact-refs.
The feature lives in the Map/ folder of the OrbCode project.

Feature description:

{{#if additionalContext}}
{{ additionalContext }}
{{else}}
Create a new feature based on the context. Ask the user for more details if the scope is unclear.
{{/if}}

## OrbCraft

Read [[knw-orbc-orbcraft]] for full documentation on the OrbCraft visualization system.

Your initial focus artifacts have been set in session metadata (`orbcraft-artifacts`). Your orb is now orbiting those artifacts on the map.

When your focus shifts to different artifacts, update the `orbcraft-focus` interface key:
```bash
flint orb set <your-session-id> orbcraft-focus "<comma-separated artifact UUIDs>"
```
Additions merge with your preset artifacts. When you create new artifacts, add their UUIDs so the user sees your orb move to them.
