Both sheets are **done** against `06559affb`.

- **C7-J-EXDEV-CAUSE:** Updated `packages/cms/src/trash/adapters/directory.node.ts` and its `directory-adapter.test.ts`. The renamed EXDEV case requires the original cause while preserving the message and recovery assertions. Added `.changeset/c7-trash-exdev-cause.md`.
- **C7-J-AGUI-ERROR:** Updated `packages/chat/src/core/assistant-client/ag-ui-transport.ts` and its `__tests__/ag-ui-transport.test.ts`. Added the HTTP-status/start-rejection case and the mid-stream cause assertion. Added `.changeset/c7-agui-run-error.md`. The log-safety test remains unchanged.

[COMMIT-PLAN.md](COMMIT-PLAN.md) records each sheet’s files, red-by-inspection reasoning, and mutations owed to the combine. [REFRESH.md](REFRESH.md) records the message-search findings and separate host follow-up.

Tests were edited and read before each source fix. No tests, builds, or other checks were run, as instructed. Diff review found nothing extra to delete. No commits or git-state changes were made.
