### jini:packages/ui/src/features/memory/react/hooks/useMemoryExtractions.store.ts
- **Over:** `createExtractionHistoryStore` 144 (file 183)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/memory/__tests__/react/hooks/useMemoryExtractions.store.test.ts` (no mocks)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MAX_ROWS`, `phaseProgress`, `mergeSameAttempt`, token/store interfaces | ordering rules + public types (unchanged) |
| B | `commitSnapshot` body math | reconcile a confirmed server snapshot against local rows (pure) |
| C | `upsertFrame` next-rows math | insert/merge one live frame into rows (pure) |
| D | `markPendingDelete`, `unmarkPendingDelete`, returned `beginDelete`/`settleDeleteSuccess`/`settleDeleteFailure` | per-id delete op lifecycle (never writes the store's `let`s) |
| E | rest of `createExtractionHistoryStore` | owns the mutable lets (`rows`, `clock`, `clearStamp`, `pendingClears`), frames, clear ops |

- **Splits** (same file, module level, above `createExtractionHistoryStore`):
  1. HELPER `reconcileSnapshot({ rows, confirmed, sinceClock, clearSupersedes, tombstones, pendingDeletes, rowStamp }: ReconcileSnapshotInput): { accepted: MemoryExtractionRecord[]; merged: MemoryExtractionRecord[] }` ← statements of `commitSnapshot` from `const accepted = clearSupersedes` through the `for (const row of accepted) { if (survivorIds.has…` merge loop. `commitSnapshot` keeps `const clearSupersedes = …`, calls the helper, then `const revision = commit(merged); for (const row of accepted) rowStamp.set(row.id, revision); return rows;` unchanged.
  2. HELPER `upsertRow({ rows, ev }: UpsertRowInput): MemoryExtractionRecord[]` ← `upsertFrame`'s `const at = rows.findIndex…` through the `if/else` that builds `next` (returns `next`). `upsertFrame` keeps `rowStamp.set(ev.id, commit(upsertRow({ rows, ev })));`.
  3. FACTORY `createDeleteOps({ getRows, commit, pendingDeletes, deferred, tombstone, applyFrame }: CreateDeleteOpsInput): Pick<ExtractionHistoryStore, 'beginDelete' | 'settleDeleteSuccess' | 'settleDeleteFailure'>` ← `markPendingDelete`, `unmarkPendingDelete` (with its "Returns true when this was the LAST…" comment, verbatim, as inner functions) and the three returned methods, with `rows` read through `getRows()` (each read site becomes `getRows()`; no commit sits between the two reads in `beginDelete`, so values are identical). The store's return object spreads `...createDeleteOps({ getRows: () => rows, commit, pendingDeletes, deferred, tombstone, applyFrame })` in the same key position. `beginClear` still reads `pendingDeletes.keys()` directly.
- **Importers to update:** none (no export moves).
- **After:** `createExtractionHistoryStore` ~92; file ~195.
- **Risks / notes:** `applyFrame`/`commit` are function declarations (hoisted) — pass them after they are declared, at the return statement. The non-null `!` already in `unmarkPendingDelete`/`rowStamp.get(...)!` moves as-is (pre-existing; do not add new ones). Key order of the returned object is not observable but keep it.
