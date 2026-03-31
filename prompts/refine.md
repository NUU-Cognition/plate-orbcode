---
name: refine
description: Refine OrbCode map artifacts to match current codebase state
variables:
  artifactPaths:
    type: string
    required: true
    description: Newline-separated list of artifact file paths to refine
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
    description: Optional user instructions for the refinement
---
You are refining OrbCode map artifacts. The artifacts to refine:

{{ artifactPaths }}

Before making changes, gather context by reading:
{{#if referencedArtifacts}}

Referenced artifacts:
{{ referencedArtifacts }}
{{/if}}
{{#if codeReferences}}

Code references:
{{ codeReferences }}
{{/if}}

Also read any other surrounding artifacts or code that would help you understand these artifacts' roles in the project map.

Then refine the artifacts according to these instructions:

Update the artifacts to accurately reflect the current state of the codebase. Fix any stale references, update descriptions, and ensure code-refs point to real files.

{{#if additionalContext}}
Also incorporate these user instructions:

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
