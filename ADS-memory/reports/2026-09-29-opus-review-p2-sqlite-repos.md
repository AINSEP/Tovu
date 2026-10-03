# Opus review part 2 of 6: `platform/db/sqlite/**` + `platform/db/repos/**` (962f928fb..HEAD)

- Reviewer: Claude Opus 5.5 (code-inspection persona, read-only). Date: 2026-09-29.
- Excluded: theme sync commits 5179f6f32, 0925ef1e9, c52b8d547; the 11 fixed Codex findings
  (`2026-09-28-codex-sol-review-today.md`); the 4 parked items (redirects locks, members uniqueness,
  newsletter token lock, no real-PG concurrency suites).
- Code read via `git show HEAD:` / `git diff`. No tests, builds or app runs. Stopped early at the
  250k context line; see "Not reviewed".
- Counts: critical 0, high 0, medium 2, low 7.

## Bugs

### M1 (medium). Publish-credential and source-control stores do not see a Postgres UNIQUE violation
- `apps/website/src/features/deployments/publish-credentials/store.ts:276-280` and
  `apps/website/src/features/source-control/store.ts:244-248`: `isUniqueLabelViolation` checks only
  `SQLITE_CONSTRAINT_UNIQUE` or the message "UNIQUE constraint failed".
- Commit 53e2ba253 moved `SqlPublishCredentialSetRepo` / `SqlSourceControlCredentialSetRepo`
  (`repos/publish-credential-repo.ts:61-72`, `repos/source-control-credential-repo.ts`, same lines)
  onto one Kysely body for every dialect, and their `insert` comment says a duplicate label is
  meant to surface as that store-level error. The sibling stores were updated to the kernel's
  `isUniqueViolation` (which also accepts SQLSTATE `23505`): vendor-credentials `store.ts:345`,
  custom-credentials `store.ts:292`, publish-content `peers.ts:237`. These two were not.
- What goes wrong: on a PGlite or Postgres site, saving a second publish or source-control
  connection with an existing label throws a raw `23505` error (a 500) instead of the typed
  duplicate-label error. SQLite is unaffected.
- Fix direction: delegate to `isUniqueViolation`, as the three siblings do. The code sits in
  `features/`, outside this slice, but only this repo conversion made it reachable.

### M2 (medium). `db:generate:database-journal` now points drizzle-kit at a file with no Drizzle tables
- `package.json:32` keeps `db:generate:database-journal`. `platform/db/drizzle.database-journal.config.ts:5-7,21`
  still says "run it after changing `database-journal-schema.ts`", with `schema:` pointing there.
- `sqlite/database-journal-schema.ts` (3af9ac258) is now raw Kysely `sql` DDL with no `sqliteTable`
  exports. Commit 3af9ac258 removed `db:generate` for the content chain but left this one.
- What goes wrong (PLAUSIBLE; drizzle-kit not run): anyone following the config's instruction gets
  drizzle-kit comparing "no tables" with snapshot 0001, which would produce a `0002` that drops
  all three journal tables. The runtime no longer applies that folder, but
  `sqlite/__tests__/database-journal-kernel.test.ts:21` does read it. The dist build
  (`package.json:29`) also still copies `drizzle-database-journal/` although nothing reads it at
  runtime.
- Fix direction: remove the script and config (or mark them frozen), and stop copying the folder
  into dist.

### L1 (low). `SqlPublishTrustRevocationStore.revoke/restore` can now throw where it used to return `{ok:false}`
- `repos/publish-trust-revocations.ts:79-133`: the `try/catch` wraps only the insert or delete. The new
  `kernel.transaction` (BEGIN IMMEDIATE / SQLITE_BUSY after 5 s, a pool connect failure) and
  `lockKey` sit outside it. Before this change (`962f928fb:sqlite/publish-trust-revocations.sqlite.ts`)
  there was no transaction, so every failure became `RevocationWrite{ok:false}`.
- On Postgres, when the insert fails and is caught, the aborted transaction then "commits" (really a
  rollback). That is harmless on its own, but if a caller ever runs `revoke` inside an outer
  `kernel.transaction` (nested calls join it), the outer transaction is poisoned. PLAUSIBLE: no such
  caller was found.

### L2 (low). Some lists have no `ORDER BY` + `LIMIT`, which is stable on SQLite but arbitrary on Postgres
- `repos/webhook-repo.ts:312-327` `listBySubscription` uses `.limit(n)` with no order. The old code
  took the first n in SQLite rowid (insertion) order. On Postgres an UPDATE writes a new heap tuple,
  so the "first n" changes as deliveries are retried or marked, and admin views can page
  inconsistently.
- The same missing order (without a limit) appears in the credential-set `listBy*` methods, the
  `external-mcp` lists, `publish-content-peer` `listByWorkspace` and asset-blob `list`. Those return
  in an arbitrary order on Postgres, which only matters where the UI shows the order as-is.

### L3 (low, PLAUSIBLE). `registerConfiguredOriginOn` and `seedDevCapabilityOriginOn` do not share a lock
- `repos/origin-repo.ts:191-216` locks `origin_settings:<ws>` and then does a plain INSERT when it finds
  no row. `seedDevCapabilityOriginOn` (`:105-127`) takes no lock and uses ON CONFLICT DO NOTHING.
- If the two ever run at the same time for one workspace (for example two processes booting, one
  with `TOVU_PUBLIC_URL`), register's plain insert can fail with a unique violation, which on
  Postgres fails that boot write and so every origin read (`after`).
- Fix: in register, INSERT … ON CONFLICT DO NOTHING RETURNING, then fall through to the compare and
  update.

## Excess

### L4 (low). The three credential-set repos are one clone group
`repos/publish-credential-repo.ts`, `repos/source-control-credential-repo.ts` and
`repos/vendor-credential-repo.ts` (212, 212 and 214 lines) differ only in table, column and type
names. There were 3 copies at base too (`head == base`), so the duplication gate does not fire. This
is noted, not a Required finding. A generic "sealed credential set with one default per group" body
would take the three.

### L5 (low). Redundant double guard in `SqlTokenStore.tryRedeem`
`repos/gated-mutation-token-repo.ts:79-101` both takes `lockKey` and conditions the UPDATE on the
status it read. Either alone makes the redeem single-use. The header admits it is belt-and-braces.
Keep it if intended; otherwise drop the lock.

## Slop

### L6 (low). A misleading comment and an inconsistent import
- `repos/oauth-pending-store.ts:91-94`: `countOf` says Postgres `count(*)` arrives as "a numeric
  string (Postgres bigint)". In fact `kernel/drivers/pg-types.ts` `parseInt8` makes int8 a
  `number` on both PG transports. The same wrong premise is in `sqlite/chat-orphan-check.ts`
  (`n: number | string`) and in `gated-mutation-token-repo.ts:106`. The code is harmless; the
  comment is wrong.
- `repos/publish-history-repo.ts:14` imports `toBool` from `../kernel/index.js`, which statically
  pulls in the PGlite and node-postgres drivers. Every other repo imports from
  `../kernel/dialect.js`, and `content-kernel.ts:3-4` states why: tsx build scripts must not load the
  PG drivers. `sqlite/database-journal-db.ts:4` does the same with `openSqliteFileKernel`.
- Fix: import from `dialect.js` and `drivers/sqlite.js`.

### L7 (low). `Sqlite*` names now wrap engine-neutral kernels
`sqlite/*.sqlite.ts` (for example `media-repo.sqlite.ts`, `outbox-repo.sqlite.ts`,
`webhook-repo.sqlite.ts`) are subclasses that only rename, and they accept any `ContentKernel`.
`server/runtime/composition/deps.ts:1144-1270` builds `SqliteOutboxAdapter(kernel)`,
`SqliteOriginSettingRepo(kernel)` and others with whatever kernel the site opened, so on PGlite or
Postgres a class named `Sqlite…` runs Postgres. This contradicts ADR-067 §3's "the body never
branches on the engine" only in naming, not in behaviour. It is a tidy-up target once the call
sites move to the `…For(kernel)` factories. There are about 25 files of pure indirection.

## Architecture

- ADR-067 layering holds in the reviewed files. Repos reach the database only through
  `kernel.run/transaction/lockKey`, raw better-sqlite3 appears only in `chat-db.ts`, `content-db.ts`
  and the kernel's sqlite driver, and the journal stays SQLite (§5).
- No function over complexity 9 stood out on read. `code_metrics`, `dependency_graph`,
  `type_safety` and `duplication` were NOT run (read-only brief, no tools run), so they are
  INCONCLUSIVE, not a pass.
- `openContentDb` (`sqlite/content-db.ts:127-131`) no longer creates the watermark row or drops the
  legacy chat tables, and its doc says so. Its remaining non-test callers are the hermetic
  `app.ts:524` (which uses `noopStampWatermark`), `publish-content-seed-hash.ts:78` and two dev
  backfill scripts. None of them stamps the watermark, so this is no bug today.

## Checked, no finding
- media-repo: slug lock plus read/claim/write in one transaction matches the old Drizzle
  transaction. `insertIfAbsent` targets `id`. Rendition save as an upsert is equivalent to the old
  update-or-insert.
- webhook-repo: `enqueue` now uses ON CONFLICT DO NOTHING instead of catching the error, which is
  correct for PG. `markFailed`'s `dead_at` semantics match the old code. `claimPending` takes a lock.
- outbox-repo, change-set-repo (one transaction including the outbox row), entry-refs (bulk insert
  unchanged from the old code), gated tokens, oauth pending store (atomic `DELETE … RETURNING`,
  locked cap), external-mcp lease CAS, analytics sink, publish-content repos and publish history
  match their old semantics.
- The journal DDL matches drizzle-database-journal 0000+0001 exactly (columns, defaults, index names).
- `reset-legacy-site-title-pin.ts` is async and its `seed-site.mjs:410` caller awaits it.

## Files reviewed
repos: analytics-sink, change-set-repo, custom-credential-repo, entry-refs-repo,
execution-credential-repo, external-mcp-repo, external-mcp-tool-approval-repo,
gated-mutation-token-repo, media-provider-credential-repo, media-repo, oauth-pending-store,
origin-repo, outbox-repo, publish-content-{baseline,bundle,peer,run}-repo, publish-credential-repo,
publish-history-repo, publish-trust-revocations, site-credential-repo,
source-control-credential-repo, vendor-credential-repo, webhook-repo.
sqlite: every thin `*.sqlite.ts` subclass (read the analytics, media, oauth, origin, outbox and
webhook ones and listed the rest by line count), chat-db, chat-orphan-check, content-db,
database-journal-db, database-journal-repo, database-journal-schema, reset-legacy-site-title-pin.

## Not reviewed (stopped at the context budget)
- `sqlite/database-introspection-adapter.sqlite.ts` (08df166f2), `sqlite/db-ops.ts` (5-line diff).
- Deleted files, checked only that they are gone and not what replaced them: `watermark.ts`,
  `content-watermark-adapter.ts`, `jsonb-column.ts`, `repo-helpers.ts`,
  `drop-empty-legacy-chat-tables.ts` (now migration step `0002`, not verified),
  `sealed-credential-inventory.sqlite.ts` (moved to `db/sealed-credential-inventory.ts`, part 1's slice?).
- A caller-side await audit for journal repos was started; no unawaited calls were found in the grep.
- Postgres jsonb caveats not chased: `\u0000` inside JSON strings is rejected by jsonb, and key
  reordering could change anything that hashes JSON read back (for example change-set
  `inverse_payload_json`). Possible follow-ups.
