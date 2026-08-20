# Untested production paths surfaced by the 2026-08-20 complexity campaign

These were found by refactor agents while reducing complexity, NOT by a coverage run.
They are production code paths with **zero** test files referencing them anywhere in `src/`.
Both were verified by the Coordinator with an independent grep, not taken on report.

## 1. `src/server/agent-daemon/agent-daemon-server.ts` — attachment-claim branch

Inside `onStarted`. Extracted into `resolveAttachmentRunFields` during the refactor.

```
$ grep -rl 'attachmentStore' src --include=*.test.ts
(0 files)
```

Closest existing coverage, none of it direct: the daemon-boot integration test, the
unhandled-rejection-guard unit test, and `assistant-proxy-routes.test.ts`'s real-daemon-proxy
tests. All exercise the file, none exercise this branch.

## 2. `src/server/middleware/theme-page-preview.ts` — templated `.liquid` preview route

Route: `/theme-explore/:themeId/template/:templateId`. Extracted into
`resolveTemplatedPreviewTarget` during the refactor.

```
$ grep -rl 'registerThemePagePreview\|theme-explore.*template\|liquidTemplateIdOverride' src --include=*.test.ts
(0 files)
```

Closest existing coverage: two theme-domain integration tests that share this file's imports.
Neither hits the templated route.

## Why this matters more than the raw number

Both were **refactored today without a test that would catch a mistake**. The edits were pure
mechanical extractions (identical logic moved into named functions, verified by typecheck and by
the nearest available integration tests), so the risk is low — but it is not zero, and "low risk"
is a judgement, not a measurement.

The agent disclosed both rather than silently treating a pure extraction as safe. That is the
correct behaviour under the refactor guardrail and should stay the norm.

## Why a coverage gate would NOT have caught these

`theme-page-preview.ts` is in `src/server/`, which had **no coverage gate at all** on this date —
only `src/server/routes/**` did. `agent-daemon-server.ts` likewise. Extending the coverage floor
past `src/server/routes/**` is the open work item that would surface this class of gap
automatically instead of by accident during a refactor.

## Suggested follow-up

Write direct tests for both paths. Neither needs new infrastructure — both files already have
integration tests that construct the surrounding server, so the seam exists.
