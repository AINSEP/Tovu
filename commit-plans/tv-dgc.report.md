Seven sheets implemented; **V3 STOPPED**. Tests and mutations remain unrun under the machine rule.

Paths below are under `apps/website/src`.

| Sheet | Status, files touched, witness |
|---|---|
| V1 | Done, **DEPENDS: Jini jx-dgc J1**. Agent-plugin `tool-registrations.ts`, search integration test, and assistant automatic-plugin test caller. Added one executor witness covering denial, allowance, and exact authorization inputs. Before the fix, the authorizer is unused and denied callers receive catalog data. |
| V2 | Done. Assistant `tool-registrations.ts` and authorization test. Added eight cases across four tools. Before the fix, generated policies skip authorization and admit denied callers. |
| V3 | **STOPPED:** unlisted production importer at `server/inbound/admin-http/routes/media/import-url.ts:7`. No files touched or tests added. |
| V4 | Done. Composition `other-site-keys.ts` and its integration test. Added captured-ID adoption after 50 earlier-sorting records. Before the fix, the capped lookup excludes the approved key. |
| QV1 | Done. Consent `__tests__/service.test.ts`: 20 assertion messages. |
| QV2 | Done. Assistant `agent-daemon-scope.behavior.integration.test.ts`: nine messages. |
| QV3 | Done. Screenshot deadlines characterization test: eight messages. |
| QV4 | Done. Screenshot deadlines unit test: eight messages. |

QV assertion expressions and existing cases are preserved. Their diagnostic mutations remain owed to combine.

[COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-dgc/COMMIT-PLAN.md) records every sheet’s base, files, red rationale, mutations, API delta, and browser obligations.

[REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-dgc/REFRESH.md) records the additional V1 test caller, J1 linkage, and V3 importer stop.

Diff-review deletion: removed an extra newly added V4 source-site grant assertion. Existing argument pads remain intact. Git state was not modified.
