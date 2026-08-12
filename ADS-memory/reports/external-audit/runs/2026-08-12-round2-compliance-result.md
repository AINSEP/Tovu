# External Audit ROUND 2 — compliance inspection result

**Packet:** `PKT-tovu-pg-manifest-R2-2026-08-12` · **Threat model:** `TM-tovu-pg-migration-001` (unchanged, scores comparable)
**Diff inspected:** `38cda3e..HEAD` — fix commits `d51ddb7`, `404baad`, `d214e39`

## Result: all 15 ledger entries resolved · ZERO blocking findings

| Auditor | Round 1 | Round 2 | Blockers R2 |
|---|---|---|---|
| Sonnet 5 (internal, live PG) | 3 | **9.5** | none |
| Gemini 3.6 Flash (packet-only) | 6.5 | **9.2** | none |
| Gemini 3.1 Pro (packet-only) | 5 | **8.5** | 1 — **downgraded on evidence** |
| Terra `gpt-5.6-terra` xhigh (files, PG sandbox-denied) | 3.5 | **8.1** | none |

Gemini Pro's blocker ("database destruction via env-driven connection target") was **refuted against the
code**: `pg-fixture.ts:23,31` keeps `ADMIN_DATABASE` a hardcoded, non-overridable constant — env vars
select *which server*, never *which database*. It had no file access and could not see the guard.

## THE headline result: round 2 caught a fix-introduced regression

**Terra R2-01 — the fix for ledger #11 introduced a new hole.** Replacing `Date.parse` with
`STRICT_RFC3339_SHAPE` + `isValidCalendarInstant` correctly caught `2026-02-30`, but **silently lost
timezone-offset bounds checking that `Date.parse` had provided for free.** Coordinator-verified live:

| value | post-fix validator | old `Date.parse` |
|---|---|---|
| `+24:00`, `+23:60`, `+99:99` | **accept** | REJECT |

**Why every other signal missed it:** Sonnet verified ledger #11 exhaustively in *one direction* —
3,431 real values scanned for **over**-rejection, zero found. It never probed **under**-rejection.
Terra probed the opposite direction. **Neither auditor alone was sufficient**; only the union caught it.
A single auditor would have shipped this with a 9.5 and a clean bill of health.

The root cause is a test-design gap, not carelessness: every round-1 test asked "does this wrongly
reject valid data?" and none asked "does this wrongly accept invalid data?"

## Fixes applied (`d36081a`, `42f3d5a`) — all coordinator-verified

1. **Offset bounds restored** — `isValidUtcOffset()` (hours 00-23, minutes 00-59), new
   `INVALID_UTC_OFFSET` code. Verified: all four invalid offsets reject; `+23:59`/`-23:59`/`+00:00`/`Z`
   accept; **and round 1's gains survive** — `2026-02-30` still `INVALID_CALENDAR_DATE`, space-separated
   still `UNPARSEABLE_TIMESTAMP`. Real-data impact re-measured independently by the fixing agent:
   117 in-scope columns, 3,027 values, **0 rejections**.
   Range deliberately matches `Date.parse` (not the ±14:00 political range) and says so in a comment.
2. **`FIXTURE_DB` race** — now `tovu_migration_fixture_${process.pid}`, with
   `sweepStaleFixtureDatabases()` dropping only orphans whose pid is dead (`kill(pid,0)`/ESRCH), so a
   live sibling run is never touched. **The agent's first concurrency proof failed because its own new
   test used a bare literal pid — the identical race class, reintroduced by its own fixture.** It found
   and fixed that itself.
3. **Ledger #14 JSON oracle** — Terra correctly marked this *partially* resolved: the timestamp oracle
   had been made genuinely independent (camelCase `*At` TS names vs snake_case `_at` SQL names) but the
   JSON one still scanned `_json` with the implementation's own rule. Now mirrored. 40 `_json` columns
   checked both directions, **0 disagreements**; logic separately proven non-vacuous against 3 planted
   mismatches including the `settings_payload` case.

**Final verification:** 77/77 tests across all six affected files, `npm run typecheck` exit 0.

## Known-open, deliberately

- **Live fixture hand-builds tables** rather than applying `schema.postgres.ts` — accepted-risk,
  deferred. Flagged by round-1 Sonnet, re-confirmed round 2.
- **No production consumer exists yet** — zero non-test callers of `verifyClassifiedValue`,
  `IDENTITY_COLUMN_INSERT_OVERRIDE`, or `computeCoreTableCopyOrder`. This is the documented scope of
  this stage; **the real integration risk lands on whoever builds the copier.**

## Process lessons

1. **Probe direction is a coverage dimension.** "Does it wrongly reject?" and "does it wrongly accept?"
   are different tests. Round 1 wrote only the first kind.
2. **Auditor diversity beat auditor depth.** The deepest auditor (9.5, most live execution) missed what
   a lower-scoring one found, because they probed different directions.
3. **A packet gap manufactures phantom blockers.** Round 1's packet omitted `reseedSequenceSql`;
   *both* file-less auditors independently invented the same false blocker. Round 2's packet carried a
   "what already exists" section and the phantom did not recur.
4. **Score convergence (3→9.5, 3.5→8.1, 5→8.5, 6.5→9.2) with zero blockers is the signal to stop**, not
   a reason to run round 3.
