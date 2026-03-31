---
name: create-system
description: Create a new draft System artifact in the OrbCode map
variables:
  artifactPaths:
    type: string
    required: false
    description: Newline-separated list of context artifact paths (existing systems/overview)
  additionalContext:
    type: string
    required: false
    description: Description of the system boundary to create
---
You are creating a new draft System artifact in the OrbCode map.
{{#if artifactPaths}}

Context artifacts:
{{ artifactPaths }}

Read these artifacts to understand the existing system boundaries. The new system should represent a distinct bounded context.
{{/if}}

Create the system using the OrbCode system template (tmp-orbc-system-v0.2).
Name it: `(OrbCode Project) [ProjectName] . (System) [Descriptive Name].md`
Set status to `draft` — this system boundary has not been fully documented yet.
Link it to the overview via artifact-refs if applicable.
The system artifact lives in the Map/ folder of the OrbCode project.

System description:

Create a new system boundary that represents a distinct bounded context.

{{#if additionalContext}}
Additional instructions from the user:

{{ additionalContext }}
{{/if}}

Ask the user for more details about what this system encapsulates if the boundary is still unclear.

## OrbCraft

Read [[knw-orbc-orbcraft]] for full documentation on the OrbCraft visualization system.

Your initial focus artifacts have been set in session metadata (`orbcraft-artifacts`). Your orb is now orbiting those artifacts on the map.

When your focus shifts to different artifacts, update the `orbcraft-focus` interface key:
```bash
flint orb set <your-session-id> orbcraft-focus "<comma-separated artifact UUIDs>"
```
Additions merge with your preset artifacts. When you create new artifacts, add their UUIDs so the user sees your orb move to them.
