GH-J1: **done; validation deferred to combine**.

Changed `packages/agent-plugins/github/source-control/commit-site.mjs` and its `__tests__/commit-site.test.mjs`. Added canonical-404 predecessor fallback, pinned ownership reads, both-path reservation, and canonical publication through the existing non-forced update. Existing optional pads remain unchanged.

Added the three tests first; test count **6 → 9**. Expected pre-change failures, reasoned rather than executed:

- Predecessor case cannot recover ownership or complete publication.
- Empty canonical case reads the branch instead of the parent SHA.
- Canonical-500 case likewise uses the wrong read ref.

Recorded the commit entry in [COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-jx-gh/COMMIT-PLAN.md). [REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-jx-gh/REFRESH.md) records the three mutations and packed-Jini/GH-T1 sandbox proof owed to combine.

No unlisted importers found. Diff re-read deletions: none. No tests, builds, installs, typechecks, linters, or git writes performed.
