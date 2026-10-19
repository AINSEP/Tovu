# Stale schema expectation in skill-tool-search-ranking.integration.test.ts

Repos: Tovu (/Users/la/Programming/Tovu, cwd). RULES: do NOT run tests, typecheck, builds or any
package scripts. Do NOT commit or touch git state. Edit the test file only, then report
`CHANGED FILES:` + `NOT DONE:`. Smallest change. Never weaken other assertions.

apps/website/src/features/skills/__tests__/integration/skill-tool-search-ranking.integration.test.ts:167
(it already has the isolated-catalog-home import from the previous round; keep it):
```
✖ the skill tool IS present in registry.list({}) and describable by exact id — installing one skill adds exactly +1 to the real catalog size
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    {
      additionalProperties: false,
  +   properties: {
  +     file: {
  +       description: 'Optional supporting text file relative to this skill folder, e.g. references/guide.md. Omit to read SKILL.md. Responses list readable files; unknown, unsafe, binary or over-256-KiB requests return a note and valid files.',
  +       type: 'string'
  +     }
  +   },
  -   properties: {},
      required: [],
      type: 'object'
    }
```
Commit a8bd03a3d ("feat(assistant): plugin and skill tools read a skill's supporting files")
deliberately added the optional `file` input. Update the expected schema to include `file` as an
optional string property (assert `required` stays `[]`), and cite a8bd03a3d in a one-line comment.
Prefer asserting against the schema source the tool uses (import it) over pasting the long
description string, if that source is exported; otherwise assert the property's type and that it is optional.
