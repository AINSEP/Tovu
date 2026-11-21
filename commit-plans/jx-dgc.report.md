- **J1 — done:** Changed `AP/lifecycle/host-tools/search-tool.ts` and added `__tests__/search-tool.authorization.test.ts` first. The witness would fail before the fix because denied callers receive no permission rejection. Covers denial before layout access, allowed empty results, and the configured permission.
- **J3 — done:** Changed CMS content-type registration, write service, and existing test file. Tests were written first: admission cancellation would incorrectly persist before the fix; the post-save control preserves successful version 2 behavior. No S6 overlap found.
- **J4 — STOPPED:** Unlisted production importer at `packages/cms/src/widgets/host-ports.ts:3`, exposing `typeof updateEntry` at line 58. No files or tests changed.
- **QJ1 — done:** Changed only `CMS/routing/__tests__/routing.ports.test.ts`. Added hidden-entry and normalized-path assertions; removed the specified README test and `readFileSync` import.

Diff re-read found no extra changes to delete. All existing argument pads remain unchanged. `REFRESH.md` records J4’s importer blocker; no test repoints were needed.

[COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-jx-dgc/COMMIT-PLAN.md) contains one entry per sheet with API deltas and outstanding mutations.

No tests, builds, type checks, linters, mutations, or git writes ran. Verification remains with combine.
