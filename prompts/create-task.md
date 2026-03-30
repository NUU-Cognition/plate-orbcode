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
---
You are creating a task to modify OrbCode map artifacts.
{{#if artifactPaths}}

Target artifacts:
{{ artifactPaths }}

Read each artifact to understand the current state and what needs to change.
{{/if}}

Create a (Task) artifact using the Projects shard template (tmp-proj-task-v0.1) with these requirements:
{{#if artifactPaths}}

1. Link the task to the target artifacts in the Related Documents section
2. Describe what modifications need to be made to the artifacts and/or their underlying code
3. After creating the task, update each target artifact's frontmatter to add a `tasks:` field (or append to existing) with a wikilink to the new task
4. Link the task session in the artifact's orbh-sessions frontmatter
{{else}}

1. Create a task based on the user's instructions below
2. If no specific artifacts are targeted, create the task for the project at large
{{/if}}

Note: status transitions are handled manually by the user, not by the task agent.

Instructions from the user:

{{#if additionalContext}}
{{ additionalContext }}
{{else}}
Create a task based on the artifact context.
{{/if}}

## OrbCraft

Read [[knw-orbc-orbcraft]] for full documentation on the OrbCraft visualization system.

Your initial focus artifacts have been set in session metadata (`orbcraft-artifacts`). Your orb is now orbiting those artifacts on the map.

When your focus shifts to different artifacts, update the `orbcraft-focus` interface key:
```bash
flint orb set <your-session-id> orbcraft-focus "<comma-separated artifact UUIDs>"
```
Additions merge with your preset artifacts. When you create new artifacts, add their UUIDs so the user sees your orb move to them.
