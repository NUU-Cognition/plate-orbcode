---
name: create-ui
description: Create a new draft UI artifact in the OrbCode map
variables:
  artifactPaths:
    type: string
    required: false
    description: Newline-separated list of context artifact paths (parent system/feature)
  additionalContext:
    type: string
    required: false
    description: Description of the UI surface to create
  projectName:
    type: string
    required: false
    description: The OrbCode project name this artifact belongs to
  stubPath:
    type: string
    required: false
    description: Path to the stub file to rewrite in place
---
You are creating a new draft UI artifact in the OrbCode map.
{{#if projectName}}

**OrbCode Project:** {{ projectName }}

All artifacts you create must be placed under the `(OrbCode Project) {{ projectName }}` project. Use this project name in artifact filenames.
{{/if}}
{{#if artifactPaths}}

Context artifacts:
{{ artifactPaths }}

Read these artifacts to understand the context. The new UI should fit within their scope.
{{/if}}
{{#if stubPath}}

**Stub file:** A stub artifact has been created at `{{ stubPath }}`. You must rewrite this file in place with the full UI content — do NOT create a new file. Rename the stub to its final name after writing the content.
{{/if}}

Create the UI artifact using the OrbCode UI template (tmp-orbc-ui-v0.2).
Name it: `(OrbCode Project) {{#if projectName}}{{ projectName }}{{/if}} . (UI) [Descriptive Name].md`
UI covers all user-facing surfaces: pages, views, CLI commands, REST endpoints, GraphQL endpoints.
Set status to `draft` — this UI has not been implemented yet.
Link it to the appropriate parent system or UI via artifact-refs.
The UI artifact lives in the Map/ folder of the OrbCode project.

UI description:

Create a new UI surface that fits the available context and project boundaries.

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
