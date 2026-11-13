### jini:packages/integrations/src/media-providers/dispatch/sqlite-async-operation-store.ts
- **Over:** `createSqliteAsyncOperationStore` 145
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/media-providers/dispatch/__tests__/sqlite-async-operation-store.test.ts`, `…/async-operation-store.contract.test.ts`, `src/media-providers/__tests__/hardwiring-ports.test.ts` (`pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `LIVE_*`, `OperationRow`, `rowToOperation` | row mapping (unchanged) |
| B | `db.pragma` + `db.exec(` | schema setup |
| C | `getStmt` … `releaseDeadLeasesStmt` | prepared statements |
| D | `jsonOrNull` | JSON column encoding (pure) |
| E | `createTxn` … `reconcileTxn`, `return {` | the store (stays) |

- **Splits** (same file, above `createSqliteAsyncOperationStore`, in order):
  1. Lift `function jsonOrNull(value: object | null | undefined): string | null` verbatim (with its comment) to module level.
  2. HELPER `prepareAsyncOperationSchema({ db }: PrepareAsyncOperationSchemaInput): void` ← `db.pragma('journal_mode = WAL');` and the `db.exec(` statement.
  3. HELPER `prepareAsyncOperationStatements({ db }: PrepareAsyncOperationStatementsInput)` ← `const getStmt = db.prepare<[string], OperationRow>(` through `const releaseDeadLeasesStmt = db.prepare<unknown[], OperationRow>(` (keep the "Variadic bind params" comment). Returns all eight statements; type `AsyncOperationStatements = ReturnType<typeof prepareAsyncOperationStatements>`. `db` type = the opener's return type already used in the file.
  4. Main keeps `open`, `db`, calls the two helpers, destructures the eight statements, then the txns and `return {` unchanged.
- **Importers to update:** none.
- **After:** file ~225; `createSqliteAsyncOperationStore` ~75; `prepareAsyncOperationStatements` ~47.
- **Risks / notes:** order preserved: pragma → exec → prepare (prepare needs the table).
