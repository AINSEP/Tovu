# Agent report — executable semantic migration manifest

**Date:** 2026-08-12 · **Agent:** Sonnet 5, Database persona · **Branch:** `general-work`
**Commit:** `de33c90` (5 files, 1108 insertions) · **Ranked step 1 of the postgres-foundation handoff**

---

## What shipped

| File | Role |
|---|---|
| `src/db/migration/manifest.ts` | The manifest — classification policy + derivation from `schema.ts` |
| `src/db/migration/verify.ts` | Verification consumer (`verifyClassifiedValue`) |
| `src/db/migration/pg-fixture.ts` | `psql` shell-out test helper (no npm driver added) |
| `src/db/__tests__/migration-manifest.test.ts` | Pure-logic tests |
| `src/db/__tests__/migration-manifest-postgres.test.ts` | Live-Postgres proofs |

TypeScript, not JSON/YAML — "executable" was a hard requirement, and structural facts (table/column
list, kind, PK-ness) are derived via the same `getTableConfig()` introspection the DDL generator
uses, so they cannot drift from source. Manual annotation only where structure genuinely can't answer
the question (Drizzle has no concept of "this integer column is an unbounded event log").

Classifies all 583 real columns without throwing. Trap #1 is encoded as an exported
`WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY` constant with reasoning inline — a named export rather than a
comment, so a copier author has to actively ignore it.

## Coordinator verification (independent, not taken on report)

- `git show --stat de33c90` — 5 files, matches.
- `npm run typecheck` — **exit 0**. This also clears the 4 in-flight errors that made HEAD red.
- 28/28 tests pass, scoped run.
- Fixture db `tovu_migration_fixture` dropped; `psql -l` shows only `postgres`/`template0`/`template1`.

**The check that mattered most:** the live-Postgres tests could have been passing vacuously. Verified
they do not — grepped the file for skip/env-guard/try-catch bail logic (none), then **stopped
Postgres and re-ran: 6 tests, 0 pass, 6 fail.** Restarted: 28/28 green again. The proofs genuinely
reach the server. A suite that green-skips when its dependency is absent is the exact failure this
project has been bitten by before.

The agent had also done its own negative-verification pass — deleted a registry entry, confirmed 7
tests went red with the fail-closed error, restored, reconfirmed green. The completeness gate is real.

## The five live-Postgres proofs

1. int4 rejects `2147483648`; int8 accepts it.
2. `reseedSequenceSql` executed for real prevents a PK collision after an `OVERRIDING SYSTEM VALUE`
   bulk copy — plus the empty-table edge case.
3. The identical naive-local timestamp string resolves to **different epochs** under
   `SET timezone='America/New_York'` vs `'Asia/Tokyo'`; a UTC-offset string does not. This is the
   concrete mechanism behind the reversibility deadline — no longer prose.
4. A Postgres `text` column silently accepts malformed JSON exactly like SQLite does — proving the
   semantic layer, not the column type, is what must catch corruption.
5. Classification round-trips against the live server.

## Finding that changes the next round's scope

The agent designed its `REVIEWED_INTEGER_ID_COLUMNS` registry against the handoff's narrower
"append-only + watermark" policy. `b393752` then shipped **widen-all**. Rather than fight it, the
agent re-documented the registry: it is no longer something schema generation consumes on the
64-bit-ID axis — that question is settled, and settled more conservatively than the manifest would
have. The `int4-safe-id` label now describes **risk profile for monitoring**, not generated type.

**So "wire the generator to consume the manifest" is now a smaller job than the handoff implies.**
There is nothing left to consume on the 64-bit-ID axis. Remaining integration, per the agent:

1. Plugin-table Postgres DDL path (does not exist yet) should call `classifyPluginColumn` per
   `ColumnDecl` and set its own bigint policy.
2. A copy-runner should call `reseedSequenceSql` once per `collectIdentityColumns()` entry after bulk
   copy, before any ordinary insert.
3. `verifyClassifiedValue` should run per-column during/after copy for
   `json-text` / `utc-timestamp-text` / `boolean-flag` classes.

## Self-correction worth noting

The agent's checkpoint said the bigint set was 9 columns; the real figure is **10** (7 revision
tables + `agentToolAttempts.id` + `analyticsEvents.id` + `databaseWriteWatermark.value`). It caught
this by running its own classifier rather than recounting by hand, and said so unprompted.

## Shared-index hazard, hit and survived

A concurrent commit emptied the shared git index between the agent's `git add` and its `commit`. It
re-staged, re-verified `--cached`, and re-committed with nothing lost. Second distinct manifestation
of the shared-working-tree problem this session (see the bigint report for the first, where a
Coordinator `git add` absorbed another agent's in-progress hunk).
