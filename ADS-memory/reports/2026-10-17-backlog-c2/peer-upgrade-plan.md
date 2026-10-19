# Peer-site "Open tovu-dev once to upgrade it" — plan (backlog-c2, 2026-10-17)

## Finding: tovu-dev is NOT behind. The check is a false positive.

- `peer-site-reads.ts:346` refuses when `introspection.listPendingMigrations()` is non-empty.
- On SQLite that list compares the bundled drizzle journal's `when` stamps with
  `__drizzle_migrations.created_at` (`database-introspection-adapter.sqlite.ts:153-170`).
- `legacy-sqlite.ts:16-26` (ADR-066) already says that rule is unsound: drizzle history is decided
  by content HASH, because stamps were rewritten (0068–0077 fake 2027 stamps).
- tovu-dev (read-only check): `tovu_migrations` holds every step 0000–0012 (at head, same as
  order-pinch and zoran). Its `__drizzle_migrations` has 79 rows: 0067's row carries
  `created_at=1799841600000` instead of the journal's `1789839111568`, but its hash
  (`4d8d08a1…ff01`) equals sha256 of `0067_durable_publish_trust_revocations.sql`, and the
  `publish_trust_revocations` table exists.
- So "Open tovu-dev once" would not help: its boot runner has nothing to apply and the stamp stays.
  The same false "pending 0067" shows on tovu-dev's own Database page.

## Part A — fix the false positive (low risk, read-only; implementing via Codex now)

In `SqliteDatabaseIntrospectionAdapter.listPendingMigrations` (SQLite): when the ADR-066 ledger
`tovu_migrations` exists and records `0000_legacy_baseline`, report pending exactly as Postgres
does — `CONTENT_MIGRATIONS` steps missing from the ledger. (The baseline step only lands after the
frozen chain was reconciled by hash, so the drizzle stamps no longer matter.) Files with no ledger
(pre-ADR-066, never booted since) keep the journal comparison. Side effect, correct: a SQLite site
missing a TS step (0001–0012) is now reported pending; before, SQLite never reported TS steps.

## Part B — auto-upgrade a genuinely behind peer (NEEDS OWNER DECISION; not built)

Smallest version: in `resolve`, when Part A still reports pending steps, open the peer content.db
writable and run `migrateSqliteContentFile` (backup to `<site>/ops/pre-migrations-*.db` first),
then reopen read-only and continue.

Why not decided here:
1. The file's contract is "write-free host composition"; this makes a read tool write another
   site's database.
2. Boot does more than migrations (`open-site-content-db.ts`: watermark, first-run seed, stored-data
   repairs, chat migrations). Running only the content steps gives a half-booted site.
3. The owner runs the packaged desktop app (older runtime) and `npm run dev` (newer) on the same
   `~/Documents/Tovu` sites, and desktop allows multiple instances. There is no "site open elsewhere"
   lock to check, so an older instance could have that site open while we migrate it.
   (Switching to the site has the same risk today; doing it silently from a chat read is new.)

Alternative with no new write path: when the active site boots, list registered SQLite sites that
are behind and show one admin notice / chat line "N sites will upgrade when opened" — no manual
fix, no hidden writes. Recommendation: Part A now; Part B only if the owner accepts point 3.
