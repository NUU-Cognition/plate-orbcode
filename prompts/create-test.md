---
name: create-test
description: Create a new draft Test artifact in the OrbCode map
variables:
  artifactPaths:
    type: string
    required: false
    description: Newline-separated list of feature artifact paths being tested
  additionalContext:
    type: string
    required: false
    description: Description of the test to create
---
You are creating a new draft Test artifact in the OrbCode map.
{{#if artifactPaths}}

Features being tested:
{{ artifactPaths }}

Read these artifacts to understand what needs testing. The test should verify the described behavior.
{{/if}}

Create the test using the OrbCode test template (tmp-orbc-test-v0.2).
Set status to `draft` — this test has not been implemented yet.
Name it: `(OrbCode Project) [ProjectName] . (Test) [Descriptive Test Name].md`
The test name should describe what it tests, not the type of test (not "Unit" or "Integration").
Link it to the feature being tested via artifact-refs — the feature relationship is a reference, not part of the filename.
The test lives in the Testing/ folder of the OrbCode project, not in the Map/ folder.

Test description:

Create a test that verifies the feature behavior described in the context artifacts.

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
