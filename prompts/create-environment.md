---
name: create-environment
description: Create a new draft Environment artifact in the OrbCode map
variables:
  artifactPaths:
    type: string
    required: false
    description: Newline-separated list of context artifact paths (existing environments/overview)
  additionalContext:
    type: string
    required: false
    description: Description of the environment to create
  projectName:
    type: string
    required: false
    description: The OrbCode project name this artifact belongs to
  stubPath:
    type: string
    required: false
    description: Path to the stub file to rewrite in place
---
You are creating a new draft Environment artifact in the OrbCode map.
{{#if projectName}}

**OrbCode Project:** {{ projectName }}

All artifacts you create must be placed under the `(OrbCode Project) {{ projectName }}` project. Use this project name in artifact filenames.
{{/if}}
{{#if artifactPaths}}

Context artifacts:
{{ artifactPaths }}

Read these artifacts to understand the existing infrastructure landscape. The new environment should represent a distinct infrastructure context.
{{/if}}
{{#if stubPath}}

**Stub file:** A stub artifact has been created at `{{ stubPath }}`. You must rewrite this file in place with the full environment content — do NOT create a new file. Rename the stub to its final name after writing the content.
{{/if}}

Create the environment using the OrbCode environment template (tmp-orbc-environment-v0.2).
Name it: `(OrbCode Project) {{#if projectName}}{{ projectName }}{{/if}} . (Environment) [Descriptive Name].md`
Set status to `draft` — this environment has not been fully documented yet.
The environment artifact lives in the Context/ folder of the OrbCode project.
Environments are leaf nodes — they have no outbound artifact-refs.

Environment description:

Create a new environment that represents a distinct infrastructure context (CI, local, Docker, staging, preview, production, etc.).

{{#if additionalContext}}
Additional instructions from the user:

{{ additionalContext }}
{{/if}}

Ask the user for more details about what this environment provides if the scope is still unclear.

## OrbCraft

Read [[knw-orbc-orbcraft]] for full documentation on the OrbCraft visualization system.

Your initial focus artifacts have been set in session metadata (`orbcraft-artifacts`). Your orb is now orbiting those artifacts on the map.

When your focus shifts to different artifacts, update the `orbcraft-focus` interface key:
```bash
flint orb set <your-session-id> orbcraft-focus "<comma-separated artifact UUIDs>"
```
Additions merge with your preset artifacts. When you create new artifacts, add their UUIDs so the user sees your orb move to them.
