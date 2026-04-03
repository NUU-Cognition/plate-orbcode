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
  projectName:
    type: string
    required: false
    description: The OrbCode project name this artifact belongs to
  stubPath:
    type: string
    required: false
    description: Path to the stub file to rewrite in place
---
You are creating a new draft Feature artifact in the OrbCode map.
{{#if projectName}}

**OrbCode Project:** {{ projectName }}

All artifacts you create must be placed under the `(OrbCode Project) {{ projectName }}` project. Use this project name in artifact filenames.
{{/if}}
{{#if artifactPaths}}

Context artifacts:
{{ artifactPaths }}

Read these artifacts to understand the context. The new feature should fit within their scope.
{{/if}}
{{#if stubPath}}

**Stub file:** A stub artifact has been created at `{{ stubPath }}`. You must rewrite this file in place with the full feature content — do NOT create a new file. Rename the stub to its final name after writing the content.
{{/if}}

Create the feature using the OrbCode feature template (tmp-orbc-feature-v0.2).
Name it: `(OrbCode Project) {{#if projectName}}{{ projectName }}{{/if}} . (Feature) [Descriptive Name].md`
Set status to `draft` — this feature has not been implemented yet.
Link it to the appropriate parent system via artifact-refs.
The feature lives in the Map/ folder of the OrbCode project.

Feature description:

Create a new feature that fits the available context and project boundaries.

{{#if additionalContext}}
Additional instructions from the user:

{{ additionalContext }}
{{/if}}

Ask the user for more details if the scope is still unclear.

## OrbCraft

Read [[knw-orbc-orbcraft]] for full documentation on the OrbCraft visualization system.

Your initial focus artifacts have been set in session metadata (`orbcraft-artifacts`). Your orb is now orbiting those artifacts on the map.

When your focus shifts to different artifacts, update the `orbcraft-focus` interface key:
```bash
flint orb set <your-session-id> orbcraft-focus "<comma-separated artifact UUIDs>"
```
Additions merge with your preset artifacts. When you create new artifacts, add their UUIDs so the user sees your orb move to them.
