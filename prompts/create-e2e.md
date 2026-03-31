---
name: create-e2e
description: Create a new draft E2E test artifact in the OrbCode map
variables:
  artifactPaths:
    type: string
    required: false
    description: Newline-separated list of source artifact paths (systems/features the E2E spans)
  additionalContext:
    type: string
    required: false
    description: Description of the E2E test flow to create
---
You are creating a new draft E2E (end-to-end) test artifact in the OrbCode map.
{{#if artifactPaths}}

Source artifacts:
{{ artifactPaths }}

Read these artifacts to understand the system boundaries and features that the E2E test should span.
{{/if}}

Create the E2E artifact using the OrbCode E2E template (tmp-orbc-e2e-v0.2).
Name it: `(OrbCode Project) [ProjectName] . (E2E) [Descriptive Flow Name].md`
Set status to `draft` — this E2E test has not been implemented yet.
Link it to the relevant features, systems, and environments via artifact-refs.
The E2E test lives in the Testing/ folder of the OrbCode project, not in the Map/ folder.

E2E test description:

Create an E2E test that verifies cross-system behavior.

{{#if additionalContext}}
Additional instructions from the user:

{{ additionalContext }}
{{/if}}

Ask the user for more details about the flow being tested if the scope is still unclear.

## OrbCraft

Read [[knw-orbc-orbcraft]] for full documentation on the OrbCraft visualization system.

Your initial focus artifacts have been set in session metadata (`orbcraft-artifacts`). Your orb is now orbiting those artifacts on the map.

When your focus shifts to different artifacts, update the `orbcraft-focus` interface key:
```bash
flint orb set <your-session-id> orbcraft-focus "<comma-separated artifact UUIDs>"
```
Additions merge with your preset artifacts. When you create new artifacts, add their UUIDs so the user sees your orb move to them.
