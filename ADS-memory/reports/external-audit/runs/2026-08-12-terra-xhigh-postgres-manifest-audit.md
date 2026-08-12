# External audit — Terra 5.6 (xhigh) on the Postgres manifest + bigint widening

**Date:** 2026-08-12 · **Peer:** `gpt-5.6-terra`, `model_reasoning_effort="xhigh"`, codex-cli 0.147.0
**Target:** `b393752`, `bb14044`, `de33c90`, `fe53825` · **Snapshot:** detached worktree at `ffd7b74`
**Run:** `turn.completed`, 0 `error` / 0 `turn.failed`, 156 tool executions, 975 KB JSONL

## Verdict: **FAIL**

> First change if only one were possible: *provision PostgreSQL 14.18 in CI and parameterize the
> fixture so the mandatory live tests can actually run.*

**Every finding below was independently re-verified by the Coordinator against the real working tree**
(Terra audited a worktree with no `node_modules`, so it could not run the repo's own tests and
correctly limited its CONFIRMED labels to standalone probes). Two findings it filed as INFERRED are
upgraded to CONFIRMED here, because they are checkable and I checked them.

---

## 1. BLOCKER — CI runs the live-Postgres tests with no Postgres. **CONFIRMED**

`.github/workflows/ci.yml:39` runs `npm test`, whose glob is `src/**/*.test.ts` and therefore includes
`src/db/__tests__/migration-manifest-postgres.test.ts`. The workflow has **no `services:` block and no
Postgres setup step**. `src/db/migration/pg-fixture.ts:17` hard-codes the Unix socket `/tmp` and role
`la`. The `before` hook unconditionally creates a database.

These tests were deliberately built to **fail closed** rather than skip — which is what makes them
trustworthy locally, and is exactly why they will break the build on push. **This is the finding that
gates pushing this branch.**

**Fix (Terra's, endorsed):** provision a PG 14.18 CI service and read host/port/user/password from
test-only env vars. **Keep them fail-closed — do not make them skip.** A skipping fixture suite proves
nothing, which was the whole point of building them this way.

## 2. HIGH — identity-insert policy is unmodelled. **CONFIRMED** (Terra filed INFERRED)

The generated schema has **11** `generatedAlwaysAsIdentity` columns. A copier preserving SQLite ids
emits `INSERT INTO analytics_events (id, ...) VALUES (...)`, which PostgreSQL **rejects** against a
`GENERATED ALWAYS` identity unless it carries `OVERRIDING SYSTEM VALUE`.

Verified: `OVERRIDING SYSTEM VALUE` appears **only** in
`src/db/__tests__/migration-manifest-postgres.test.ts` — nowhere in `manifest.ts` or `verify.ts`. The
fixture knows the rule; the manifest does not export it. So the reseeding story is complete only
*after* an insert that the manifest never tells a copier how to write.

**Fix:** export a structured identity-copy rule including `OVERRIDING SYSTEM VALUE`, and test a
generic copy statement against a generated-always identity *before* the reseed test.

## 3. MEDIUM — the ceiling is 2⁵³, not 2⁶³, and nothing pins it. **CONFIRMED**

`bigint(..., {mode:"number"})` builds a `PgBigInt53`. The Postgres column is genuinely `int8`, but
every value crossing the JS boundary goes through `Number(value)`. Terra executed the conversion:
`9007199254740993` → `9007199254740992`. `verify.ts:95` returns success unconditionally for
`reviewed-id`, and the live test proves only the 2³¹ boundary.

**Terra's severity call is the useful part, and it corrects my framing:** this is a latent
*correctness* risk, not a growth risk. At 1,000 ids/sec, 2⁵³ is ~285,000 years away; at a million/sec,
~285 years. The realistic route to hitting it is a **direct Postgres write by another client, or a
bulk import** — not organic CMS growth. I had flagged this as a headline concern; it is real but
correctly ranked third.

**Fix:** before any Postgres runtime ships, either move to `{mode:"bigint"}` and have the PG adapter
handle `bigint` explicitly, or retain `number` and add a manifest rule + test declaring the system
**53-bit, not 64-bit**. The claim "we fixed the 2³¹ problem" must not be allowed to read as "the
ceiling is now int8."

## 4. MEDIUM — the search rebuild plan is incomplete. **CONFIRMED**

`src/db/drizzle/0022_posts_fts_search_index.sql` defines **two** dependent objects: the durable
`post_search_document` projection and the `post_search_fts` index/triggers. `post_search_document`
appears **9 times** in that migration and **0 times** anywhere in `src/db/migration/`. The manifest
schedules only the FTS object, so a cutover following it has no complete search rebuild.

**Fix:** model the post-search subsystem as one derived rebuild unit — target DDL, source-of-truth
query, post-copy backfill — and test that every raw SQLite search object is accounted for by it.

## 5. LOW — GATE A and GATE B are not independent for the case that matters. **CONFIRMED**

GATE A's first line is `const all = classifyAllCoreColumns();`
(`migration-manifest.test.ts:61`). The classifier **throws** when an autoincrement PK has no
growth-class registry entry. So for the specific scenario "someone adds a new PK, the generator
handles it correctly, but nobody reviews it," **both gates fail** — A does not isolate a generator
regression from an unreviewed identity.

They do separate in other cases (a pure generator regression breaks A alone; a stale registry key
breaks B alone). But this is a direct hit on the Coordinator's own instruction, which asked for two
gates that fail for *different* reasons.

**Fix (Terra's, endorsed):** have GATE A enumerate `SQLiteInteger` columns directly via
`getTableConfig`, exactly as `schema-postgres-parity.test.ts` already does, rather than routing
through the manifest classifier.

## 6. LOW — timestamp verification is permissive. **CONFIRMED** (Terra executed both probes)

`verify.ts:33` relies on a suffix check plus `Date.parse`. `"2026-02-30T00:00:00Z"` passes and is
silently normalized by JavaScript to March 2. `"2026-08-12 10:00:00Z"` also passes despite not being
the stated ISO-8601 form.

**Fix:** validate strict RFC3339 syntax *and* calendar ranges instead of leaning on `Date.parse`.

---

## What Terra confirmed as sound

- **No call-site regression from widening.** Static search found no non-test consumer of the
  classifier, verifier, reseeder, or constants, and **no production import of `schema.postgres.ts`**.
  The widening is preparatory; there is no SQLite/JSON/raw-SQL breakage today.
- The manifest is "a useful library start, **but not yet an executable migration specification**" —
  which is a fair reading of a step-1 deliverable with no copier to consume it.

## Coordinator note on the verdict

FAIL is the right call, but note *what* fails: **finding 1 is a CI/infrastructure gap, not a defect in
the manifest or the widening.** Findings 2, 4, 5 and 6 are genuine gaps in shipped code and should be
fixed. None of them invalidates the widen-all decision or the manifest's design — and finding 3
explicitly narrows a concern the Coordinator had over-weighted.
