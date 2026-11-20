Implemented A1, A2, B, and C in the working tree.

- `process.ts`: **429 lines**. Private probes/parsers moved to `process-probes.ts` (**155**); macOS top parsers to `process-top-footprint.ts` (**29**). Public exports retained; **0 existing importers repointed**.
- `indexer.ts`: **108 lines**. Moved writes to `indexer-write.ts` (**177**), reconciliation to `indexer-reconcile.ts` (**146**), and backfill/rebuild to `indexer-backfill.ts` (**123**). **2 original importer files adjusted**.
- Indexer tests: event suite **186 lines**, reconciliation **196**, backfill **212**, existing fixtures **54**.
- Supporting process-test split: lifecycle **389 lines**, probes/memory **283**, stamps **107**, shared mock setup **46**.

B uses one bounded top read. C rejects older bookkeeping writes and dispatches/counts only accepted plans. Added the specified cases, both changesets, and four `COMMIT-PLAN.md` entries.

All edited/new files are below 500 lines. No matching size-debt entries existed; JSON files remain unchanged.

Tests, builds, installs, type checks, and linters were not run, as instructed. No Git writes occurred.
