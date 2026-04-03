---
name: create-task
description: Create a task to modify OrbCode map artifacts
variables:
  artifactPaths:
    type: string
    required: false
    description: Newline-separated list of target artifact paths
  additionalContext:
    type: string
    required: false
    description: Instructions for the task to create
  projectName:
    type: string
    required: false
    description: The OrbCode project name this task relates to
  stubPath:
    type: string
    required: false
    description: Path to the stub file to rewrite in place
---
You are creating a task to modify OrbCode map artifacts.
{{#if projectName}}

**OrbCode Project:** {{ projectName }}

This task relates to the `(OrbCode Project) {{ projectName }}` project. Reference this project when linking artifacts.
{{/if}}
{{#if artifactPaths}}

Target artifacts:
{{ artifactPaths }}

Read each artifact to understand the current state and what needs to change.
{{/if}}
{{#if stubPath}}

**Stub file:** A stub task has been created at `{{ stubPath }}`. You must rewrite this file in place with the full task content — do NOT create a new file. Rename the stub to its final name after writing the content.
{{/if}}

Create a (Task) artifact using the Projects shard template (tmp-proj-task-v0.1) with these requirements:
- Describe what modifications need to be made to the artifacts and/or their underlying code.
{{#if artifactPaths}}
- Link the task to the target artifacts in the Related Documents section.
- Add an `orbcode-refs` list to the Task's frontmatter with wikilinks to the target OrbCode artifacts (e.g. `orbcode-refs:\n  - "[[(OrbCode Project) Name . (Feature) Name]]"`).
- After creating the task, update each target artifact's `artifact-refs` frontmatter list (append the task wikilink). Create the `artifact-refs` field if it doesn't exist.
- Link the task session in the artifact's `orbh-sessions` frontmatter.
{{/if}}
- If no specific artifacts are targeted, create the task for the project at large.

Note: status transitions are handled manually by the user, not by the task agent.

Instructions from the user:

Create a task based on the artifact context.

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
