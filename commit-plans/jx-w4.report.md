**WORKER-JINI: done.** Added the three CMS subpath exports and runtime entries in `packages/cms/package.json`. Wrote one contract test first in `packages/cms/src/__tests__/integration-package.contract.test.ts`; it is expected red on the base because all three export entries are absent.

**tv-rjk T2-J: STOPPED before edits.** The required importer lookup found an unlisted non-test importer at `packages/plugin-catalog/scripts/generate.ts:6`, with a call at line 57. The sheet requires stopping for this condition. No T2-J source or tests changed.

Created root `COMMIT-PLAN.md` and `REFRESH.md` with per-sheet status, API deltas, combine mutations, packed-import checks, and the importer refresh needed for T2-J.

Diff re-read found no incidental edits. Deletions: none. Existing pads remain unchanged.

No checks ran, no subagents spawned, and `.git` was not modified.
