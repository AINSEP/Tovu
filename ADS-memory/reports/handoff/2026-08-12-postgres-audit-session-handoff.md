# Handoff — Postgres manifest: 4 audit rounds, all findings fixed

**Date:** 2026-08-12 · **Branch:** `general-work` · **Pushed.** · **typecheck exit 0**

> **STOP HERE. The work is done.** Do not run a round 5. Rationale below under *Why to stop*.

---

## State: green

- **85/85 tests** across all six affected files; `npm run typecheck` exit 0.
- **Zero blocking findings** from all four round-4 auditors (Sonnet 9.2, Terra 8.7, Gemini Pro 8.5,
  Flash 8.0). The 8.5 risk-tier floor is met by three of four.
- **Safe to push.** The round-1 CI blocker is fixed — `.github/workflows/ci.yml` now provisions a
  Postgres 14 service and `pg-fixture.ts` reads connection settings from env with local defaults.

## Commits (in order)

| SHA | What |
|---|---|
| `b393752` | `SQLiteInteger` → `bigint(mode:"number")`, all 65 columns |
| `bb14044` | generator doc census corrected + marked non-binding |
| `de33c90` | the semantic migration manifest (ranked step 1) |
| `fe53825` | growth-class reframing + GATE A/B |
| `38cda3e` | round-1 audit report (5 auditors, unanimous FAIL) |
| `d51ddb7` | CI Postgres service + pg-fixture import guard |
| `404baad` | identity/FK parity theater closed + heap-growth doc |
| `d214e39` | non-positive reseed, copy fidelity, + 9 more |
| `d36081a` | offset-bounds regression + fixture-db race |
| `42f3d5a` | ledger #14 JSON oracle |
| `c9193d0` | sweep can't misdrop; offset bound → Postgres's ±15:59 |
| `2cb39fc` | 5 unconventioned JSON columns classified |
| `aa68742` | round-2 audit report |

**RESOLVED 2026-08-12 (session 7):** `fix-r4`'s tripwire landed and is committed (`3cd312d`), together
with a fix for a hole in it that mutation-testing found — see *Known-open* item 1. Also committed:
`c4bc276`, the untracked `src/db/sqlite/jsonb-column.ts` that `schema.ts:1713` had been pointing at
since it was written (every clone had a dangling reference until now).

## Why to stop

**This subsystem has ZERO production consumers.** Verified repeatedly: no non-test caller of
`verifyClassifiedValue`, `IDENTITY_COLUMN_INSERT_OVERRIDE`, `computeCoreTableCopyOrder`, or
`classifyAllCoreColumns`. Every round after round 2 audited code nothing runs.

The findings decayed accordingly: round 1 = 15 real defects; round 2 = 1 genuine regression; round 3 =
2; round 4 = **0 new bugs**, only a missing future-proofing gate. Scores 3 → 9.2. It converged.

**The real remaining risk is not in this code — it is in the copier that will consume it.** That is
where these guarantees actually get spent.

## Known-open, deliberately

1. **`REVIEWED_JSON_COLUMNS` has no completeness gate.** Its tests check staleness, non-redundancy,
   end-to-end classification, and a 5-column snapshot — none asserts anything about a column *not* in
   the registry, and `classifyCoreColumn` falls through to `plain-text` (`manifest.ts:474`) ungated. A
   future genuinely-JSON column named outside `_json`/`Json` and not registered will silently
   misclassify. Owner chose the heuristic tripwire fix. **CLOSED `3cd312d`** — but note *how* it closed,
   because it is the trap of this whole audit in miniature: the tripwire was green and blind. Mutation
   -testing it (plant a JSON-looking column, three declaration shapes) showed both signals fire on the two
   single-line shapes and NEITHER fires when the builder chain wraps `.default("{}")` onto continuation
   lines. Its own comment claimed the sanity count-assertion would catch that first; it does not, because
   `declPattern`'s trailing `(.*)` matches the empty string, so a wrapped declaration still counts as one
   declaration and both sides of the equality move together. Fixed by folding `.`-prefixed continuation
   lines into `declLine`. **A green scanner test proves nothing until you make it fail.** The tripwire is
   still a heuristic by design and says so — a JSON column with no "JSON" in its doc comment and no
   `{}`/`[]` default still slips through.
2. **Pid-reuse race in the fixture sweep.** Failure mode is "database does not exist" on a sibling test
   run — infra churn, not data loss. A UUID nonce would fix it but ends auto-reclaim of pid-suffixed
   fixtures. Deliberately declined.
3. **The live fixture hand-builds tables** rather than applying `schema.postgres.ts`, so a generator
   regression could still pass the live proofs. Accepted-risk.
4. **`pg-fixture.ts`'s `dropDatabase` is unquoted.** Safe today — every caller passes
   `PREFIX_ + String(pid)`. The sweep (the only path reading names back from `pg_database`) uses a
   quoted local variant.

## Traps found the hard way — do NOT re-derive

- **`mode:"number"` caps at 2⁵³, not 2⁶³** (`PgBigInt53`). Documented as an invariant.
  **Do NOT "fix" it with `mode:"bigint"`** — that breaks `JSON.stringify` (throws on BigInt) and mixed
  Number/BigInt arithmetic across the API. ~285 years of headroom at 1M ids/sec.
- **Postgres caps timezone displacement at ±15:59**, not `Date.parse`'s ±23:59. `+16:00` fails with
  `time zone displacement out of range`.
- **`COPY` needs no `OVERRIDING SYSTEM VALUE`; `INSERT` does.** A copier told to "always add the
  override" gets a syntax error on the `COPY` path — the one a bulk migration would pick.
- **The write watermark is NOT a change boundary** (exported as
  `WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY`).
- **drizzle pg-core builds a separate column instance for the `pgTable` extra-config callback**, so FK
  `.reference().columns` never matches `getTableConfig().columns` by identity. sqlite-core does not
  split them — a helper validated on SQLite breaks on pg. Key on raw SQL name.
- **A regenerated migration `.sql` changes its content hash**, so drizzle re-runs it and dies on
  "table already exists" — and every later migration then silently never runs. Fixed once this session
  (dev server was down); see [[reference_drizzle_migration_hash_partial_apply]].

## Process lessons that actually mattered

1. **Probe direction is a coverage dimension.** A regression survived an auditor that scanned 3,431
   real values, because every probe asked *"does this wrongly reject valid data?"* and none asked
   *"does this wrongly accept invalid data?"* Making both directions mandatory — plus a required case
   count per verdict — is what caught the rest.
2. **Auditor diversity beat auditor depth, twice.** The highest-scoring auditor missed what a
   lower-scoring one found. A packet-only auditor with no file access found the Postgres offset bound
   by reasoning about which authority was correct.
3. **Divergence is the signal, not convergence.** Round 2 converged (and stopping there would have
   shipped two bugs); round 3 diverged and found them.
4. **Ranked fix slates with explicit failure modes.** Every regression in rounds 2-3 came from a single
   unreviewed fix choice whose failure mode nobody wrote down. `/audit-work` defaults to
   `suggest_changes=patches` + the Solution Slate Protocol — **use the default; do not downgrade to
   `notes`.**
5. **Match the git check to the question.** `git status` answers only "what is uncommitted now" — it is
   silent for committed work, untracked work, and work that never existed. Use `git log -- <path>` for
   "was this done", `git cat-file -e HEAD:<path>` for "is this in the branch".

## Next actual work

**Step 2 of the original roadmap: instance-wide write quiescence.** Design-heavy — neither the
watermark nor the operation lock covers it. Then steps 3-5 (plugin provisioner boundary, WordPress
importer, Postgres search). See `2026-08-12-postgres-foundation-handoff.md`.
