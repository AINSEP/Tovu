### jini:packages/daemon/src/store/event-log/sqlite.ts
- **Over:** `bindSqliteEventLog` 106
- **Phase:** now · **Batch:** size-17
- **Package entry:** IS the `./store/event-log/sqlite` exports target; no export moves, so its public surface is unchanged.
- **Tests:** `src/store/event-log/__tests__/sqlite.f1.test.ts` (+ any other file in that folder), `src/__tests__/slow-watchdog-resume.regression.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | statements in `bindSqliteEventLog` | job |
|---|---|---|
| A | `const getRunStmt = db.prepare…` through `const deleteRunStmt = …` (15 prepared statements) | prepare the SQL statements |
| B (stays) | options, schema exec, `appendTxn`, `replaySync`, `dropTxn`, return | event-log behaviour |

- **Splits:**
  1. HELPER `prepareEventLogStatements({ db }: PrepareEventLogStatementsInput): EventLogStatements` — module level above `bindSqliteEventLog` ← the 15 `db.prepare` statements verbatim (same generic type arguments, same SQL text), returning `{ getRunStmt, insertRunStmt, …, deleteRunStmt }`. `interface EventLogStatements` spells each field as `ReturnType<typeof db.prepare<…>>`'s concrete type (`Statement<[string], RunRow>` etc. from the SqliteDb port) — no `any`.
  2. `bindSqliteEventLog` calls it AFTER the schema `db.exec` (same order: schema first, then prepare) and destructures the names.
- **Importers to update:** none.
- **After:** `bindSqliteEventLog` ~64; helper ~44; file ~200.
- **Risks / notes:** preparing must stay after `db.exec(SQLITE_EVENT_LOG_SCHEMA)` (tables must exist). If the `SqliteDb` port has no exported statement type, export the existing one from where it is declared.
