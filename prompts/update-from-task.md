---
name: update-from-task
description: Update OrbCode artifacts based on completed task work
variables:
  taskPath:
    type: string
    required: true
    description: Path to the completed task artifact
  taskTitle:
    type: string
    required: true
    description: Human-readable task title
  taskNumber:
    type: string
    required: false
    description: Task number label when available
  projectName:
    type: string
    required: false
    description: OrbCode project name when known
  orbcodeArtifactPaths:
    type: string
    required: false
    description: Newline-separated list of linked OrbCode artifact paths
  orbcodeRefs:
    type: string
    required: false
    description: Newline-separated list of linked OrbCode wikilinks
  additionalContext:
    type: string
    required: false
    description: Optional extra instructions from the caller
---
You are updating OrbCode artifacts to reflect the implementation captured in the following task:

{{ taskPath }}

Read the task artifact fully before making changes.

Task label: {{#if taskNumber}}#{{ taskNumber }}{{else}}{{ taskTitle }}{{/if}}

{{#if projectName}}
Relevant OrbCode project: {{ projectName }}
{{/if}}

{{#if orbcodeArtifactPaths}}
The task already links to these OrbCode artifacts:

{{ orbcodeArtifactPaths }}
{{/if}}

{{#if orbcodeRefs}}
Linked OrbCode references from the task:

{{ orbcodeRefs }}
{{/if}}

{{#if additionalContext}}
Additional instructions:

{{ additionalContext }}
{{/if}}

Your job:

1. Read the task and identify what changed in the implementation.
2. Update the linked OrbCode artifacts to match the current system.
3. If the task is not linked yet, inspect the relevant OrbCode project and determine which artifacts should be updated or created.
4. Keep bidirectional links accurate: when you touch an OrbCode artifact that is implemented by this task, ensure its `artifact-refs` includes the task, and ensure the task's `orbcode-refs` stays current if names or paths changed.
5. Run [[hwkfl-orbc-sync]] after edits to verify the map remains consistent.

## OrbCraft

Read [[knw-orbc-orbcraft]] for full documentation on the OrbCraft visualization system.

Your initial focus artifacts have been set in session metadata (`orbcraft-artifacts`) when available. If your focus shifts, update the `orbcraft-focus` interface key:

```bash
flint orb set <your-session-id> orbcraft-focus "<comma-separated artifact UUIDs>"
```
