Programmer(Execution): Selected Programmer for the focused adapter fix and regression coverage.

SQLite now reuses the Postgres pending-step logic when its ledger contains the baseline. Ledger reads check `tovu_migrations` directly; legacy fallback and `getSchemaState` remain unchanged.

Added real-runner regression cases for rewritten timestamps and a missing final step, plus coverage for ledger independence and both fallback conditions. `git diff --check` passed. Protected files were untouched.

CHANGED FILES:

- [Adapter](/Users/la/Programming/Tovu/apps/website/src/platform/db/sqlite/database-introspection-adapter.sqlite.ts)
- [Integration tests](/Users/la/Programming/Tovu/apps/website/src/platform/db/sqlite/__tests__/database-introspection-adapter.sqlite.integration.test.ts)

NOT DONE: Tests, typecheck, and builds were not run; RED→GREEN remains unverified. No commits or index changes.
