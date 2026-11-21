Implemented all four sheets in order on `codex/tv-gate`, base `0973a5fdc8`. No sheet STOPs.

**DEPENDS: jx-w5 GATE-ABORT-J**

- **A10-ABORT-T — done.** Changed the gateway adapter, database handler and shared database/recovery tests. Added two tests first. Expected RED: stopping still saves approval or redeems it and migrates because signals were absent.
- **A18-ABORT-T — done.** Changed the pull handler and execute-pull tests. Added two tests first. Expected RED: stopping still saves approval or applies content.
- **A19-ABORT-T — done.** Changed the recovery handler and shared tests. Added two tests first. Expected RED: stopping still saves approval or redeems it and applies an artifact.
- **T46 — done.** Changed the key source/service, credential-copy route, admin types/hook/dialog, and three test files. Added listing/dialog cases and extended GET coverage first. Expected RED: omission metadata, route projection and notices were missing. The 50/source limit and known-ID behavior remain.

All existing argument pads remain intact. Affected functions stay within the caps; `useCopyKeys` is exactly 50 lines. Diff re-read deletions: **none**.

[COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-gate/COMMIT-PLAN.md) contains exact per-sheet file lists, API deltas, mutations and browser checks owed.

[REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-gate/REFRESH.md) records the Jini dependency, conditional S13 reconciliation and unchanged test consumers.

Tests, mutations, builds, type-checks, linters and browser checks were **not run**, per the machine rule. Nothing was staged, committed or pushed.
