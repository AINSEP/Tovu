All four sheets are implemented. No STOPs or chain skips.

- **AG2-J:** Added the fetch agent and 5 tests; updated `ag-ui-transport.ts` with `onLiveEvent` and the export. Changeset: `jm7-ag2-fetch-agent.md`.
- **AG3-J:** Added interrupt/resume helpers, the pause store, `resumeAgUiRun`, and 8 tests across `event-projection.ts`, `ag-ui-transport.ts`, and new `interrupts.test.ts`. Changeset: `jm7-ag3-interrupts.md`.
- **AG3A-J:** Updated frame projection and frame tests; added the daemon marker test. Existing `surface-exchanges.ts` already preserves the marker and needed no edit. Changeset: `jm7-ag3a-pending-approval.md`.
- **AG4-J:** Added `begin` to the scoped handle, owner-checked registry operation, and facade; added 5 tests. Changeset: `jm7-ag4-begin.md`.

All API deltas, test assertions, mutations owed, and review deletions are recorded in `COMMIT-PLAN.md`. `REFRESH.md` records importer findings and combine checks. Review removed only newly introduced redundant code/assertions; no existing tests were deleted.

**20 new test cases were written and reviewed before source implementation.** Tests and other prohibited checks were not run. API baselines and `.git` remain untouched.
