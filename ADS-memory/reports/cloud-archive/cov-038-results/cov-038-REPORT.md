# Coverage measure — lot 038 (T3), origin/main code, 2026-10-22

Tests run (node:test, --test-concurrency=1 --experimental-test-module-mocks --experimental-test-coverage, Node 24):
- features/site-backup/__tests__/share-plugin-policy.integration.test.ts
- platform/db/sqlite/__tests__/publish-backstop-row.sqlite.test.ts
- platform/db/sqlite/__tests__/import-database.unit.test.ts
Result: 17 tests, 17 pass, 0 fail, 0 skipped.

Source files are under apps/website/src/platform/db/sqlite/. The site-backup test drives rebuildImportDatabase, so its target is import-database.ts and its worker, not the site-backup feature dir.

| source file | line % | branch % | func % | uncovered lines |
|---|---|---|---|---|
| import-database.ts | 100.00 | 100.00 | 87.50 | none listed (function gap only) |
| import-database-worker.ts | 79.20 | 77.78 | 72.22 | 27-39, 59, 71-76, 81-86 |
| publish-backstop-row.sqlite.ts | 100.00 | 98.33 | 100.00 | none (branch gap only) |

Failing tests: none.

SKIPPED: none. None of the three needed Postgres or Chromium. The share-plugin-policy "integration" test ran on SQLite.

Notes:
- Branch/main source for import-database.ts and import-database-worker.ts is identical, so the lot's source changes are already on origin/main.
- Worker gaps are probably because import-database-worker.ts runs in a forked child, so the parent's coverage does not see it. This is a guess I did not check.

Verdict: NOT 100% per file. import-database-worker.ts is at 79/78/72, import-database.ts is short on function %, and publish-backstop-row.sqlite.ts is short on branch %.
