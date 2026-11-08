# BULK-MEDIA

Completed on `cloud/bulk-media` in both repositories, based on the exact requested
`origin/cloud/combine` commits: Tovu `0a83efcfc6ab6c4046396b5bebf41fa4f01cc860`
and Jini `f1990bdc629d7e1ba3cc41fe7e5f71669d446de3`.
Work started November 8, 2026 at 10:13 America/Los_Angeles and completed within
the 30-minute cap. Jini's `AI-Dev-Shop/AGENTS.md` supplied the bootstrap; the
expected missing copy in Tovu did not block work. The owner brief was not saved.

## Changes

- Tovu production change: only the requested comment and
  `{ toolId: "media_import_local_file", maxItems: 50 }` after `plugin_source_read`
  in `BATCH_TOOL_SETTINGS`. The single-file handler, tool text and persistence
  code are unchanged.
- The bare Tovu `applyBatchInputs({ registrations })` already calls
  `resolveBatchableTools`, which reads `BATCH_TOOL_SETTINGS`; no extra settings
  argument was needed. Tests now use `LOCAL_IMPORT_MAX_ITEMS = 50`, reject 51
  items, and accept 50 copies of `photo.png` with distinct titles. They assert
  50 successes, zero failures, indexes 0–49, input title order and 50 media rows.
- Jini: only `nestedInvoker`'s message assignment and the requested explanatory
  comment changed in production. Internal failures now identify the nested
  execution's audit record instead of copying raw text. Confirmed that
  `ToolExecutionResult.executionId` is a required string before using it.
  Validation messages and other terminal status handling remain unchanged.
- The Jini regression throws `Error("open /secret/abs/path")`, succeeds on the
  next item, then throws `ToolInputError("name is required")`. It checks that
  the first item's error excludes `/secret`, includes that handler's nested
  execution ID, the next item succeeds, and the validation message is unchanged.
  It also verifies that the raw internal error remains in the nested audit log.

## Red and green evidence

Jini followed test-first order: write the regression and update the existing
leak assertion, run red, then apply the production fix, then run green.

| Check | Result |
| --- | --- |
| Jini initial baseline after correcting worker settings | 52 passed: 35 dispatch tests and 17 normalization tests |
| Jini test-first red | 36 tests: 34 passed, 2 failed; received `child broke` instead of the safe message, and `open /secret/abs/path` still contained `/secret` |
| Jini green after fix | 36 passed, 0 failed |
| Jini green after dependency refresh | 36 passed, 0 failed |
| Jini daemon type-check | `tsc -p tsconfig.json --noEmit`, exit 0 |
| Tovu unchanged baseline after dependency refresh | 30 passed, 0 failed |
| Tovu tests with the settings line still absent | 31 tests: 29 passed, 2 failed; descriptor cap was `25 !== 50`, and the 50-item import was refused because the cap was 25 |
| Tovu green after adding only the settings line | 31 passed, 0 failed, including the 51-item refusal |
| Both repository diffs | `git diff --check origin/cloud/combine`, exit 0 |

Part A ran against Jini's existing compiled daemon, whose `nestedInvoker` still
had `const message = result.error ?? ...`; the Part B daemon change was not built
into that dependency. Part A therefore does not depend on Part B.

## Existing raw-error assertions

Updated Jini's `packages/daemon/src/__tests__/tool-executor.dispatch.test.ts` test
formerly named `rethrows a nested internal failure as an Error carrying the
nested message`: it pinned `child broke`, the same nested-invoker leak. It now
checks the exact safe message with the nested execution ID.

Jini's `packages/core/src/__tests__/batch-tool-inputs.test.ts` also pins plain
Error text in these wrapper-level tests:

- `records a validateItem refusal and a thrown non-Error as that item's failure while later items still run`
- `strips the appended input schema from an item error, keeping only the domain message`
- `keeps a failed item's normalization notes alongside its error`

Those tests directly inject `validateItem` or an `invokeTool` stub; they do not
exercise an executor result classified as `internal`. They assert wrapper
behavior outside this leak and were left unchanged. Tovu's batch test
`a failing item does not stop the rest, and its error drops the appended schema`
throws `ToolInputError`, so its visible validation text was left unchanged.

## Commands and setup

Relevant test and type-check commands (run from the indicated repository/package):

```sh
# Tovu root; used for baseline, red and green runs
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks apps/website/src/features/media-import/__tests__/import-local-file.test.ts

# Jini/packages/daemon; initial invocation hit Vitest's conflicting default minimum
npm run test -- --maxWorkers=2 src/__tests__/tool-executor.dispatch.test.ts src/__tests__/tool-input-normalization.test.ts
# Corrected baseline
npm run test -- --maxWorkers=2 --minWorkers=1 src/__tests__/tool-executor.dispatch.test.ts src/__tests__/tool-input-normalization.test.ts
# Red, green and green after refreshed dependencies
npm run test -- --maxWorkers=2 --minWorkers=1 src/__tests__/tool-executor.dispatch.test.ts
npm run typecheck

# Discovery requested by the brief, from Jini root
git grep -l createToolExecutor -- packages/daemon
```

Scope deviation: the initial Jini baseline also ran the unchanged
`tool-input-normalization.test.ts` (17 tests). Subsequent test runs selected only
the changed test files. No full suites or lint runs were performed.

Existing dependencies were installed, but several compiled packages were stale.
Ran `npm run build` in Jini packages `integrations`, `protocol`, `core`,
`platform`, `agent-runtime`, `agent-plugins`, `cms`, `ui-kit` and `ui`.
Tovu's initial baselines reported missing exports `createSignInHandoffs`,
`createVersionedPluginActivationReader`, `mediaFileReplacementRecord`, then
`accessApprovalDetails`; refreshing those dependency builds resolved them.
The first daemon type-check likewise failed on stale dependency declarations,
then passed after rebuilding core/platform/agent-runtime. Platform's build was
rerun successfully after core finished. Agent-plugins needed its existing
esbuild and CMS dependencies linked into its ignored `node_modules`; its build
then passed. UI's build passed after refreshing ui-kit. No dependency manifests,
lockfiles or generated tracked files changed. No tools were installed.

In each repo, fetched `cloud/combine` into `origin/cloud/combine`, verified its
SHA, then ran `git switch -c cloud/bulk-media origin/cloud/combine`. Before the
first push ran `git pull --rebase origin cloud/combine`, then
`git push -u origin cloud/bulk-media`. For the report push, used
`git pull --rebase` followed by `git push`. No force pushes.

## Confirmed pushed code commits

- Tovu `cloud/bulk-media`: `c22e7a18dfae354b3af4dcfd7ea4b8145a5f65fb`
  — `feat(media): allow fifty local imports per batch`.
- Jini `cloud/bulk-media`: `51af9831751d2359e27f59aafec264f145ba9bdd`
  — `fix(daemon): redact internal nested tool failures in batches`.

This report is a following commit on Tovu's same branch; the final response
identifies the report-inclusive branch tip. Both code pushes succeeded and
were checked against remote branch refs.

No requested implementation or validation remains undone. Nothing was
published, and main was untouched. `packages/platform/src/fs/guarded-reader.ts`
was untouched. No lint disables, helpers, abstractions, retries, progress
events or production options were added. No test or server processes remain.
Switching Jini to the requested base exposed an existing local plugin payload
under `packages/plugin-ui-ux-design/` as untracked; it was preserved and excluded
from the commits. Raw command logs remain outside the repos under
`/workspace/work/bulk-media/`.

BULK-MEDIA DONE

## BULK-MEDIA-2

Owner-approved follow-up, November 8, 2026, started at 10:24 America/Los_Angeles
and completed within the 30-minute cap. Part A is unchanged. The following
supersedes Part B's blanket withholding only when the host supplies redaction.

Added one optional `redactNestedFailure` callback to `createToolExecutor`.
`nestedInvoker` consults it only for an internal failure, after the inner
execution has settled. Without that callback, the original safe withheld
message remains byte-for-byte unchanged.

The assistant executor composition supplies the callback using its existing
`toolFailures` ports and the existing `redactFailedResult` function. That
function was exported for reuse; its implementation was not changed. This is
the smallest route because it adds only a nested-failure seam and composition
wiring, with no second redactor and no routing of nested calls through the
recovery/audit decorator stack. The normal single-call redaction wrapper stays
in its original position. No recovery behavior, new packages, cross-package
imports, or lint disables were introduced.

Test-first evidence:

- Before changing production, added a regression through the real assistant
  executor stack. One batched handler throws a readable credential-rejection
  reason containing a secret value constructed by joining strings in the test;
  the host's injected redaction port blanks that value. The next item succeeds,
  and a third item throws `ToolInputError` with unchanged text.
- Red: 41 tests ran in the two changed test files; 40 passed and 1 failed.
  The batch returned the old withheld message instead of
  `Error ERR-0001-0000-0000-0000: upstream rejected credential [REDACTED]`.
  The no-host fallback and nested-recovery checks already passed.
- After the fix, green: both changed test files passed, 41 tests, zero failures.
  The regression asserts the exact reason-preserving error format, absence of
  the constructed secret, exactly one minted ID and one redaction record for
  the internal batch item, successful continuation and unchanged validation
  text. A subsequent single call adds exactly one ID and one record, with the
  same formatted reason. Single-call status and raw audit detail are preserved.
- An issued credential-setup diagnostic returned by a nested call still does
  not run recovery; the test asserts its remedy handler is never called.
  Existing no-host withheld-message tests remain intact, with names clarified.
- Daemon type-check: `tsc -p tsconfig.json --noEmit`, exit 0.

Commands (from `Jini/packages/daemon`, identical test selection for red and green):

```sh
npm run test -- --maxWorkers=2 --minWorkers=1 src/tool-recovery/__tests__/stack.test.ts src/__tests__/tool-executor.dispatch.test.ts
npm run typecheck
```

Only changed test files were run. Also ran `git diff --check`, committed the
Jini change, then `git pull --rebase` and `git push` on `cloud/bulk-media` without
force. Confirmed pushed Jini SHA:
`ad2e705274d08e58424ad2ed104cf74b968d9808`
(`fix(daemon): use host redaction for nested internal failures`).

Tovu changes in this follow-up consist solely of this appended section, committed
and pushed on its existing `cloud/bulk-media` branch after `git pull --rebase`.
Nothing was published and main was untouched. No requested work is left undone.
No test, type-check or server processes remain. Existing untracked Jini plugin
payloads were preserved. Raw red, green and type-check logs are under
`/workspace/work/bulk-media/bulk-media-2-*.log`.

BULK-MEDIA-2 DONE
