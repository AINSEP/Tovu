# Handoff — Postgres foundation, plugin engine hardening, Jini infra

**Date:** 2026-08-12 · **Branch:** `general-work` (both Tovu and Jini) · **Nothing pushed.**

> Branch note: `general-work` is the renamed `refactor/jini-admin-extraction` (its original purpose
> had already merged to main). **Another session commits to this branch concurrently** — one agent
> hit a real `git add`/`git commit` race here and had to unwind a commit. Always
> `git status --short` and stage by explicit path.

---

> ## AMENDED 2026-08-12 (later session) — read before acting on the list below
>
> **Step 1 is DONE** (`de33c90`) and **the bigint item is DONE** (`b393752`, `bb14044`). Reports:
> `2026-08-12-migration-manifest-agent-report.md`, `2026-08-12-bigint-widening-agent-report.md`.
>
> Two things below are now **wrong**, not merely stale:
>
> 1. **The bigint recommendation was under-scoped.** "Append-only tables + the write watermark"
>    excludes all **11 autoincrement surrogate primary keys**. PK exhaustion at 2³¹ is far worse to
>    hit late than an events table — a PK and every FK referencing it cannot be rewritten in place.
>    Shipped policy is **widen ALL 65 `SQLiteInteger` columns**; the generated schema now has zero
>    `integer(`. Measured cost on live PG 14: index size **identical** int4 vs int8 (btree entries
>    already 8-byte aligned), heap +19% only on a synthetic all-integer table — the real schema is
>    515/583 text columns.
> 2. **"Both schema generation and migration verification should consume it" overstates the
>    remaining work.** With widen-all shipped, nothing is left for schema generation to consume on
>    the 64-bit-ID axis. Remaining integration is: plugin-table Postgres DDL calling
>    `classifyPluginColumn`; a copy-runner calling `reseedSequenceSql` per `collectIdentityColumns()`
>    entry after bulk copy; and `verifyClassifiedValue` running per-column during copy.
>
> ## ✅ RESOLVED — the CI blocker below is FIXED. Safe to push.
>
> A 5-auditor audit (round 1) + 4-auditor compliance re-audit (round 2) ran after the text below was
> written. **All 15 findings are fixed and verified; zero blocking findings remain.** Round-2 scores:
> Sonnet 9.5, Flash 9.2, Gemini Pro 8.5, Terra 8.1 (from 3, 6.5, 5, 3.5). 77/77 tests, typecheck 0.
> Fix commits: `d51ddb7` `404baad` `d214e39` `d36081a` `42f3d5a`.
> Full results: `ADS-memory/reports/external-audit/runs/2026-08-12-five-auditor-postgres-manifest-audit.md`
> and `…/2026-08-12-round2-compliance-result.md`.
>
> **The one result worth carrying forward:** round 2 caught a regression the *fix* introduced — making
> timestamp validation strict about calendars silently lost the timezone-offset bounds check
> `Date.parse` had provided. Sonnet scanned 3,431 values for over-rejection and found nothing; Terra
> probed under-rejection and found it. **Probe direction is a coverage dimension** — "does it wrongly
> reject?" and "does it wrongly accept?" are different tests, and round 1 only wrote the first kind.
>
> Still deliberately open: the live fixture hand-builds tables instead of applying `schema.postgres.ts`;
> and **no production code consumes the manifest yet** — that integration risk lands on the copier build.
>
> The strikethrough banner below is retained for history only.
>
> ~~**⛔ DO NOT PUSH until the CI blocker is fixed.**~~ Terra 5.6 (xhigh) audited all four commits and
> returned **FAIL**: `.github/workflows/ci.yml:39` runs `npm test` (glob `src/**/*.test.ts`, which
> includes `migration-manifest-postgres.test.ts`) with **no Postgres service**, while
> `pg-fixture.ts:17` hard-codes socket `/tmp` and role `la`. Those tests fail closed by design, so
> the build breaks on push. Fix = provision a PG 14.18 CI service + read connection settings from
> test-only env vars; **keep them fail-closed, do not make them skip.**
> Full audit: `ADS-memory/reports/external-audit/runs/2026-08-12-terra-xhigh-postgres-manifest-audit.md`
> (all findings independently re-verified). Five other gaps, ranked: identity-insert policy
> (`OVERRIDING SYSTEM VALUE`) exists only in the fixture, never exported for a copier — 11
> `generatedAlwaysAsIdentity` columns will reject id-preserving inserts; the ceiling is **2⁵³, not
> 2⁶³** (`PgBigInt53` → `Number(value)`) and nothing pins it; `post_search_document` is unmodelled so
> the search rebuild is incomplete; GATE A routes through the classifier so it is not independent of
> GATE B for an unreviewed new PK; timestamp verification accepts `2026-02-30T00:00:00Z`.
>
> **Next unstarted item is step 2 (write quiescence).** Steps 3–5 unchanged. Trap #1 (the watermark)
> is now enforced in code as the exported `WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY` constant.
>
> Timestamps still `text` ISO-8601 by explicit decision. The reversibility deadline is no longer
> prose — it is proven in `migration-manifest-postgres.test.ts`: the identical naive-local timestamp
> string resolves to different epochs under different session timezones.

## START HERE — the ranked next steps

From an external forward-risk analysis (`gpt-5.6-sol` at `max`), full text at
`ADS-memory/reports/external-audit/runs/2026-08-12-forward-risk-sol-max.md`.

1. **Build an executable semantic migration manifest**, tested against a real SQLite→Postgres
   fixture. It must cover: 64-bit IDs, UTC timestamps, JSON/text distinctions, identity reseeding,
   copy transforms, plugin tables, and derived objects needing rebuild. Both schema generation and
   migration verification should consume it. *Highest leverage — it prevents a schema that compiles
   but rejects row 2,147,483,648 or misreads an imported local timestamp.*
2. **Implement genuine instance-wide write quiescence** before calling any migration "live." See
   the trap section below — neither the operation lock nor the watermark currently covers this.
3. **Extract a plugin provisioner boundary**, keeping the existing SQLite strategy intact.
4. **Build the WordPress importer** as plan → review → apply, with fixed read-only source reads.
5. **Add Postgres search last**, rebuilt from canonical post data (never copied).

**Leave alone** (all reviewed and endorsed): the strict generator, the FTS exclusion, `PostSearchPort`,
the instance-authorization port, Jini's driver isolation, the 63-byte identifier guard.

**Drop from the roadmap** unless CDC is explicitly funded: any promise of *uninterrupted* migration.
A short controlled write pause is far safer than a superficially "live" cutover that loses edits.

### Cheap now, expensive later — do these before Postgres holds real data
- **`SQLiteInteger` → `bigint`, not `integer`**, for append-only tables (analytics events, tool
  attempts, revisions) and the write watermark. The original justification ("nothing exceeds 2³¹")
  was refuted, and the stated tradeoff was a false dilemma: **Drizzle supports pg `bigint` with
  `mode: "number"`**, so keeping a JS `number` never required choosing `integer`.
  Change in `development/scripts/generate-postgres-schema.ts`.
- **Timestamps** stay `text` ISO-8601 today. Reversible to `timestamptz` *only until* noncanonical
  data accumulates — a WordPress import introduces naive local timestamps immediately.

---

## Traps found the hard way — do NOT re-derive these

1. **The write watermark is NOT a change boundary.** It is opt-in; normal post save/delete paths do
   not advance it (`core/gated-mutations/watermark.ts:11`, `features/post/repo.sqlite.ts:98`). The
   operation lock is in-process only and does not stop ordinary repository writes
   (`operation-lock.ts:53`). **A copier treating the watermark as complete WILL silently lose a post
   edited between bulk copy and cutover.** Every migration design in the earlier debate assumed
   otherwise.
2. **The drizzle cross-package wall is ESM-vs-CJS, not two installs.** Proven: same tarball, CJS
   consumer = 1 error, ESM consumer = 0. `paths` cannot fix it; publishing alone cannot either. A
   `file:` symlink adds a *second* independent problem (two physical copies). Both must be solved.
   Moot in practice — `@jini-ai/infra` is now ORM-free by design.
3. **Postgres identifiers cap at 63 bytes and truncate SILENTLY.** Guarded at declare time in
   `data-module.ts`. Longest live identifier is 42 bytes.
4. **better-sqlite3 already sets `foreign_keys=1` and `busy_timeout=5000`.** Only `journal_mode=WAL`
   changes behaviour, so it is the only usable probe for whether a pragma list ran.
5. **`PRAGMA wal_checkpoint(FULL)` throws `database table is locked`** if issued from the connection
   holding an open write transaction. Hence `stageJournalPhase` (checkpoint-free) for in-transaction
   use.
6. **Peer dispatch:** the harness kills foreground bash at 10 minutes — long codex/agy runs MUST be
   backgrounded, and written to a **fresh filename** (a re-dispatch with `>` destroyed 1.1MB of a
   prior run). `agy --print` auto-denies tool permissions, so its packet must be self-contained.

---

## What shipped (all verified independently; typecheck 0, complexity gate clean)

**Tovu** — `b4d680f 5c83c3f 62426db 167a838 b1ffc90 56fe89b 90ca299 69f9b52 d97dbec 4b17687 c5bdbb7 b204b9b`

- **Postgres schema is GENERATED**, not hand-maintained. `development/scripts/generate-postgres-schema.ts`
  derives `src/db/schema.postgres.ts` (63 tables) from `src/db/schema.ts` via Drizzle introspection.
  Guarded by a drift test (regenerate + exact match) and a **parity test against the SOURCE schema**
  — the latter exists because the drift test is structurally blind to a generator that omits
  consistently, which it did four times (FKs, CHECKs, column `.unique()`, index config).
- **Plugin data-module engine**: column/constraint/index reconciliation against live `PRAGMA` state,
  63-byte identifier guard, and post-DDL verification moved *inside* the DDL transaction (closing a
  data-loss window an earlier fix had opened).
- **Gated mutations**: instance scope (`scopeKind`, `authorizeInstance`) applied to `backup.restore`
  and `database.migrate`, including `/confirm` and the `/execute` pre-lock check.

**Jini** — `116c4b7c 9a0e6233 603075fc 64f6297d b6c06f8f c38f442c`

- `@jini-ai/infra` with `./db/core` (ports, zero deps) + `./db/sqlite` (`openSqliteConnection`
  returning a raw handle, `SqliteDbOpsAdapter`). **Contains no ORM at all.** `better-sqlite3` is an
  optional peer; dual-published CJS+ESM. R12 guard enforces driver isolation with fail-closed
  self-test fixtures.

---

## Audit record

Four auditors, two rounds. All ten findings fixed and verified. Round 2: sol 7.7 / Gemini 6.0, both
FAIL — but every failure was a *new* finding, and sol verified all eight prior fixes as genuinely
present in code. Artifacts under `ADS-memory/reports/external-audit/`.

**Coordinator error worth remembering:** the in-memory snapshot finding was raised by terra in round
1, disputed by me on the argument that transaction rollback covers every `:memory:` failure, and
**disproved by sol via direct reproduction** — a post-commit verification failure left the column
live while reporting failure. Fixed in `b4d680f`. Reproduction beat my reasoning; when an auditor
reproduces and I only argue, it wins.

## Still not built (deliberately)

SQLite→Postgres data migration · WordPress MySQL importer (MySQL is a read-only **source** only,
never a Tovu target) · FTS5→tsvector adapter · Postgres DDL path for plugin-declared tables.
