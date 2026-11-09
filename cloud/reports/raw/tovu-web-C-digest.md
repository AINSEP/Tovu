# tovu-web-C digest (shards 3 and 6, node:test)

| suite | exit | files pass/fail | tests pass/fail/skip(+todo) | duration (s) |
|---|---|---|---|---|
| tovu-web shard 3 | 1 | 384 files run; 6 files failed at file level or had failing tests only in postgres/other files (see below); not separately counted by runner | 4291 / 36 / 8 (todo 0, cancelled 0), 4335 total | 1866 |
| tovu-web shard 6 | 1 | 383 files run; runner prints no file counts | 4279 / 7 / 5 (todo 0, cancelled 0), 4291 total | 1709 |

Both shards completed with a runner summary (no timeout, no exit 124). All files in each list ran. The "36" count includes 4 file-level `not ok` entries.

## Shard 3 failures (36)
Class: environment — "psql: connection to server on socket /tmp/.s.PGSQL.5432 failed: No such file or directory" (no Postgres). 34 tests.
- apps/website/src/cli/__tests__/integration/init-storage.postgres.test.ts › --storage-env: the site names the variable, keeps no secret, and its database is at head with the template — failed to drop fixture database "tovu_r1f2_init_env": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed
- same file › sealed: the connection string is sealed in the site folder (0600, no plaintext) and the site reopens from its meta — same error (tovu_r1f2_init_sealed)
- same file › a database that already holds a Tovu site is refused, before any folder, secret or key is made — same error (tovu_r1f2_init_taken)
- apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts › refuses a target other than postgres, and a --storage-env that is not set — failed to drop fixture database "tovu_storage_move_cli_test": psql ... No such file or directory
- same file › the program routes `storage move` to the command — same
- same file › --storage-env moves the site and leaves the connection string in that variable — same
- same file › (file-level) storage-move.postgres.test.ts — same
- apps/website/src/features/entries/__tests__/integration/unreadable-owner-entries-repair.postgres.test.ts › two processes booting at once: the mismatched rows go exactly once, one marker, readable rows survive — failed to drop fixture database "tovu_unreadable_owner_entries_repair_pg_fixture": psql ... No such file or directory
- same file › (file-level) — same
- apps/website/src/features/identity/__tests__/passkeys.real-postgres.test.ts › real PostgreSQL passkey completion has one winner, atomic session rollback, and recovery clears credentials — failed to drop fixture database "tovu_passkeys_10799": psql ... No such file or directory
- apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts (all fail with "failed to list databases for the stale fixture-database sweep: psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory"):
  - FIXTURE_DB is namespaced by this run's own process.pid — two different pids can never compute the same fixture database name...
  - sweepStaleFixtureDatabases: reclaims a fixture database whose owning pid has died, and leaves one whose pid is still alive completely untouched
  - sweepStaleFixtureDatabases: a non-canonical suffix Number() would coerce into a plausible dead pid is never touched...
  - CANONICAL_PID_SUFFIX: matches only a bare decimal pid shape; rejects every adversarial suffix Number() would otherwise coerce
  - int4 rejects 2147483648 on a live server; int8 accepts the identical value
  - reseedSequenceSql, executed after a copy that preserved original ids, makes the next plain insert land at max+1 with no collision
  - reseedSequenceSql handles the empty-table edge case: reseeding an empty table still starts identity at 1
  - reseedSequenceSql: a table containing ONLY non-positive copied ids (0 and -1) reseeds to 1...
  - reseedSequenceSql: a mixed-sign table (some non-positive, some positive ids) still reseeds to max+1...
  - a plain INSERT naming an explicit identity-column value fails WITHOUT OVERRIDING SYSTEM VALUE, and succeeds WITH it
  - COPY accepts an explicit identity-column value with NO override syntax at all...
  - a naive-local timestamp string casts to a DIFFERENT instant depending on the reading session's timezone; a UTC-offset string does not
  - string-collation ORDER BY on a text timestamp column disagrees with chronological ORDER BY when Z and offset forms mix...
  - Postgres accepts a UTC offset up to and including ±15:59 and rejects ±16:00 and beyond...
  - a plain Postgres text column silently accepts malformed JSON...
  - publish backstop audit is workspace-scoped core data included once in the Postgres copy catalog
  - (file-level) migration-manifest-postgres.test.ts — failed to drop fixture database "tovu_migration_fixture_20032": psql ... No such file or directory
- apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts › a running site is refused; nothing changes / a target that already holds data is refused; nothing changes / a row written to the target after the emptiness check refuses the copy; nothing is truncated / a failure after the copy rolls the target back and leaves the site on PGlite / the move copies every table, seals the secret, switches the meta last, and the site boots on Postgres / (file-level) — all: failed to drop fixture database "tovu_move_site_test": psql ... No such file or directory

Other shard 3 failures (not Postgres connection errors):
- apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts › a project store that can't open (EACCES on its folder): the site boots, warns, and a settings save is refused, never sent to the site vault — AssertionError: `actual: false, expected: true` (operator ==, the ok(warnings.some(...)) at line 166). Class: unclear, likely environment (tests run as uid 0 root; the test injects a synthetic EACCES at line 157 so root alone may not explain it; not investigated further).
- apps/website/src/server/runtime/composition/__tests__/storage-secret.unit.test.ts › new-site sealing prepares its identified key file and the default reader reopens it — child process (spawnSync of tsx) threw "no site key: none of the configured sources resolved (the site key file at /tmp/tovu-test-catalog-3V9ET1/.tovu/site-keys/storage-secret-audit-site.hex, env var TOVU_SITE_KEY, ..." from keyring.env.ts:149; `1 !== 0` exit status. Class: unclear (possibly environment: root/tmp/subprocess or a product bug in key sealing); not isolated.
- packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts › SDK external type contracts are declared package dependencies for standalone consumers — Expected values to be strictly equal: actual '^0.6.22' expected '^0.6.17'. Class: stale test or stale package.json: test line 142 expects packages/sdk/package.json @jini-ai/plugins '^0.6.17' (matches), but line 144 requires root package.json (^0.6.22) to equal it, so the two manifests are out of sync (stale sdk version spec).

## Shard 6 failures (7)
- apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts › postgres: two writers on the same base version, B blocked on A's row lock — A lands, B gets the version conflict — failed to drop fixture database "tovu_entry_cas_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed. Class: environment (no Postgres)
- same file › postgres: two import-as-creates of one id, B blocked on A's uncommitted insert — one row, one revision, one event; B is a version conflict — same. environment
- apps/website/src/features/forms/__tests__/repo.postgres.test.ts › postgres: racing creates of one slug persist one winner and give the loser FormSlugConflictError — failed to drop fixture database "tovu_forms_repo_pg_fixture": psql ... No such file or directory. environment
- apps/website/src/platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts › no new raw SQLite outside the storage kernel (ratchet: the baseline only shrinks) — AssertionError: New raw SQLite outside platform/db/kernel. Offenders: apps/website/src/features/project-keys/attachments.ts: sqlite-json 0 -> 2; apps/website/src/server/runtime/composition/project-store.ts: sqlite-json 0 -> 3. Class: product bug (ratchet violation in source, not env-dependent).
- apps/website/src/server/runtime/composition/__tests__/app-federation-reload.observability.test.ts › a roster change after createApp traces the agent daemon's federation reload with RouteDeps.observability — Expected values to be strictly deep-equal: actual [] expected ['POST /api/federation/reload']. Class: unclear (no span recorded; could be environment such as no IPv6/loopback networking or a product regression; not isolated).
- apps/website/src/server/runtime/composition/modules/__tests__/assistant-daemon-client.unit.test.ts › a refused parked mutation waits for replacement and is dispatched once — Error: agent daemon origin requested before ensure() resolved a self-allocated port — call ensure() before createApp(). Class: unclear (error is a guard in product code; test may be stale against a newer ensure()-first contract, or port allocation failed in this container).
- same file › a passive frontend stream cannot wake a daemon racing park — same error. unclear (same cause).

Noise, not failures: shard 6 TAP stderr contains a SqliteError "no such table: posts" from development/scripts/convert-legacy-doc-pages-to-html.ts (a test-driven script, assertion passed) and HPE_INVALID_CONSTANT / ECONNRESET / UND_ERR_SOCKET lines emitted by passing tests.

## Type/lint errors
None (not a type/lint run).

## Did not run
- Skipped by the runner: 8 tests in shard 3, 5 in shard 6 (names not enumerated; skip reasons not examined).
- No file lists were truncated; no timeout; cancelled 0, todo 0 in both shards.
- Raw files: /home/user/Tovu/cloud/reports/raw/tovu-web-shard3.{tap,spec,stdout}.txt, tovu-web-shard6.{tap,spec,stdout}.txt, plus -summary.txt.
