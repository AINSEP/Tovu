### jini:packages/integrations/src/media-providers/sqlite-task-store.ts
- **Over:** `createSqliteMediaTaskStore` 140
- **Phase:** now · **Batch:** size-29
- **Tests:** `src/media-providers/__tests__/sqlite-task-store.test.ts`, `src/media-providers/__tests__/hardwiring-ports.test.ts` (`pnpm --filter @jini-ai/integrations exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `TaskRow`, `rowToTask` | row mapping (unchanged) |
| B | `db.pragma` + `db.exec(` | schema setup |
| C | `getStmt` … `selectAllStmt` | prepared statements |
| D | `writeRow` | task → row write |
| E | txns + `return {` | the store (stays) |

- **Splits** (same file, above the function):
  1. HELPER `prepareMediaTaskSchema({ db }: PrepareMediaTaskSchemaInput): void` ← `db.pragma('journal_mode = WAL');` + `db.exec(`.
  2. HELPER `prepareMediaTaskStatements({ db }: PrepareMediaTaskStatementsInput)` ← `const getStmt = db.prepare<[string], TaskRow>(` through `const selectAllStmt = db.prepare<[], TaskRow>(`; returns the seven statements; `MediaTaskStatements = ReturnType<typeof prepareMediaTaskStatements>`.
  3. HELPER `writeTaskRow({ statements, task, isInsert }: WriteTaskRowInput): void` ← body of `function writeRow(task: MediaTask, isInsert: boolean)` (reads `statements.insertStmt`/`statements.updateStmt`). Main keeps `const writeRow = (task: MediaTask, isInsert: boolean): void => writeTaskRow({ statements, task, isInsert });` so txn bodies are unchanged.
  4. Main keeps `dbPath`, `open` (with the "string overload" comment), `db`, the two calls, destructure, `writeRow` wrapper, txns, `return {`.
- **Importers to update:** none.
- **After:** file ~195; `createSqliteMediaTaskStore` ~75; helpers ≤ 30.
- **Risks / notes:** none beyond statement order (pragma → exec → prepare).
