TV-AG1: implementation done; verification owed to combine.

Changed `assistant-ag-ui.ts` to call Jini’s drain, set `runFinished` before `res.end()`, then record the tracker outcome. Preserved the close listener, daemon cancellation and all surviving pads.

Tests were written first:

- Added the text-then-approval interrupt golden. The old drain should fail because it emits a CUSTOM card followed by a normal finish.
- Added a five-second HTTP EOF bound for the omitted-`res.end()` mutation.
- Extended the Stop witness to await subscription closure while retaining authenticated, exactly-once daemon cancellation checks.

Files touched: `assistant-ag-ui.ts`, `assistant-ag-ui-wire.golden.test.ts`, its golden JSON, `assistant-ag-ui-routes.test.ts`, and root [COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-ag1/COMMIT-PLAN.md) and [REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-ag1/REFRESH.md).

Diff re-read confirmed deletion of the five named declarations, their owned comments, three pads and exclusive imports. No incidental edits remained. Existing golden entries are byte-identical; no unlisted importers appeared.

REFRESH records the `catch-reads-error` row, named mutations and Chrome checks owed to combine.

**BREAKS:** valid `pendingApproval` now ends the response with an interrupt. Production marker emission remains gated on AG3-T’s working admin resume path.

No tests, builds, installs, type checks or linters ran. `.git` was not modified.
