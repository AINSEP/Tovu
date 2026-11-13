### jini:packages/search/src/indexer.ts
- **Over:** `createSearchIndexer` 239
- **Phase:** now · **Batch:** size-23
- **Tests:** `src/__tests__/indexer.test.ts`, `src/__tests__/exports.test.ts` (`pnpm --filter @jini-ai/search exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | destructures, `resolve`, `currentTargets`, `return {` | indexer wiring + entry points (stays) |
| B | `planRow`, `putPlan`, `freshRecords`, `settleCall`, `writeChunks`, `writeToTarget` | write records to one target |
| C | `settleObserved`, `settledRow`, `settleTask`, `checkRevisions`, `checkChunk`, `settleInFlight`, `rewriteRow`, `reconcileTarget` | reconcile in-flight / failed rows |
| D | `scanSource`, `promote`, `dropRetired`, `backfillTarget`, `readMarks` | backfill + target promotion/retirement |

- **Splits** (module level above `createSearchIndexer`, order B, C, D):
  1. HELPER `createTargetWriter({ state, now, resolve }: CreateTargetWriterInput): { writeToTarget }` ← `const planRow =` through `const writeToTarget =` (keep every "why" comment). `resolve: (target: SearchTarget, workspaceId: string) => Promise<Resolved | null>`.
  2. HELPER `createTargetReconciler({ state, now, sources, maxAttempts, resolve, writeToTarget }: CreateTargetReconcilerInput): { reconcileTarget }` ← `const settleObserved =` (L114, with its CAS comment — it moves out of its original position before `freshRecords`; it is a `const` arrow only used by C, so no order effect) plus `const settledRow =` through `const reconcileTarget =`. Include `writeToTarget`/`putPlan` only if `rewriteRow`/`reconcileTarget` read them (outline truncates — check).
  3. HELPER `createTargetBackfill({ state, targets, sources, scanPageSize, resolve, writeToTarget }: CreateTargetBackfillInput): { promote; dropRetired; backfillTarget; readMarks }` ← `const scanSource =` through `const readMarks =`.
  4. Main: destructures, `resolve`, `currentTargets`, the three helper calls (B, C, D), `return {` unchanged.
- **Importers to update:** none.
- **After:** file ~315; `createSearchIndexer` ~70; `createTargetReconciler` ~82; `createTargetWriter` ~62; `createTargetBackfill` ~55.
- **Risks / notes:** helper types `Resolved`, `Plan`, `Settle`, `WriteTally`, `Watermark` are module-level already. `state`/`targets`/`sources` typed via `SearchIndexerRequired['state']` etc.
