# External Audit — 5 auditors, Postgres manifest + bigint foundation

**Packet:** `PKT-tovu-pg-manifest-2026-08-12` · **Threat model:** `TM-tovu-pg-migration-001` (round 1)
**Risk tier:** high · **Score floor:** 8.5 · **suggest_changes:** notes
**Target:** `b393752`, `bb14044`, `de33c90`, `fe53825`

## Auditor Matrix

| Auditor | Resolved model | Access | Score | One-line rationale |
|---|---|---|---|---|
| Sonnet 5 (internal) | `claude-sonnet-5` via Agent | files + live PG | **3** | Design is careful and genuinely tested, but the branch cannot be pushed without breaking CI |
| Terra | `gpt-5.6-terra` @ xhigh, codex-cli 0.147.0 | files; **PG socket sandbox-denied** | **3.5** | Three new blockers incl. a reseed that rejects legitimate source ids |
| Gemini 3.1 Pro | `gemini-3.1-pro-high` via agy | **packet only** | **5** | Real collation finding; two blockers were false |
| Gemini 3.6 Flash | `gemini-3.6-flash-high` via agy | **packet only** | **6.5** | Useful regression analysis; repeated the same false blocker |
| Opus 5 (coordinator) | `claude-opus-5[1m]` | files + live PG | **7.5** | Least independent — authored `bb14044` |

**`blocking_gate` = FAIL**, recomputed by the coordinator on both legs independently: validated blockers
exist AND all five scores fall below the 8.5 floor. Neither leg rescues the other.

## Degraded coverage

- **Gemini 3.6 Flash needed two retries.** Attempt 1 died on the documented agy trap (headless mode
  auto-denies tool permissions it cannot prompt for → zero output). Attempt 2 hit a transient
  `Eligibility check failed: INTERNAL (code 500)`. Attempt 3 succeeded with an explicit no-tools preamble.
- **Both Gemini auditors had no file access**, so their findings are `INFERRED` by construction.
- **Terra's Postgres socket was sandbox-denied**, so its B1 was filed `INFERRED`. **The coordinator
  reproduced it live and upgraded it to CONFIRMED** (see below).
- **The coordinator is not independent** — authored one of the four commits under audit.

---

## Confirmed blockers

### 1. CI runs the live-Postgres tests with no Postgres. **5/5 auditors. CONFIRMED.** Domain 4
`.github/workflows/ci.yml:39` runs `npm test` (glob `src/**/*.test.ts`); no `services:` block exists.
`pg-fixture.ts` hard-codes socket `/tmp` and role `la`. Sonnet proved the failure mode by a method
nobody else used — stripping `psql` from `PATH` and re-running: **5/5 failed, 0 skipped.** So the
tests' fail-closed design is *correct*; the defect is purely CI wiring.

### 2. `reseedSequenceSql()` rejects legitimate non-positive source ids. **Terra B1. CONFIRMED by coordinator.** Domain 2
It emits `setval(..., COALESCE(max(id),1), max(id) IS NOT NULL)`. SQLite's
`INTEGER PRIMARY KEY AUTOINCREMENT` accepts `0` and `-1` (Terra executed this). Coordinator reproduced
the Postgres half on the live server:

```
INSERT INTO t (id,v) OVERRIDING SYSTEM VALUE VALUES (-1,'a'), (0,'b');   -- INSERT 0 2
SELECT setval(pg_get_serial_sequence('t','id'), COALESCE(max(id),1), max(id) IS NOT NULL) FROM t;
ERROR:  setval: value 0 is out of bounds for sequence "t_id_seq" (1..9223372036854775807)
```

**The rows copy successfully and the migration then aborts at reseed** — after data has landed. The
fixture covers only the empty and positive-max cases.

### 3. `verifyClassifiedValue` validates destination shape, not copy fidelity. **Terra B2.** Domain 1
The JSON and timestamp branches validate only `postgresValue`; `sqliteValue` is ignored, and
`plain-text`/`plain-integer`/`reviewed-id` always pass. Valid source JSON can become *different* valid
JSON and verification still returns success — e.g. `{"role":"admin"}` → `{"role":"member"}`. The
existing tests pass `null` as the source value, which conceals the omission.

### 4. Identity and FK parity are verification theater. **Terra B3. CONFIRMED.** Domain 3
GATE A proves only `PgBigInt53` — it never asserts `.generatedAlwaysAsIdentity()`. FK parity counts
`foreignKey({` **tokens**, not their meaning. The live fixture builds its *own* identity table instead
of using the generated schema. So a generator regression that emitted `.primaryKey()` instead of an
identity, or pointed one FK at the wrong table while keeping nine declarations, **passes drift, GATE
A, GATE B, parity, and the live fixture.**

---

## High

### 5. `OVERRIDING SYSTEM VALUE` is unexported — and the obvious fix is wrong for `COPY`. **Terra R1#2 + Sonnet A. CONFIRMED live.**
11 columns are `generatedAlwaysAsIdentity`; the clause exists only in the test fixture. Sonnet tested
both bulk-load paths on the live server: plain `INSERT` with an explicit id **fails** without the
override, but `COPY t (id,...) FROM STDIN` **succeeds with no override syntax at all** — and `COPY` has
no such clause to offer. **The natural fix for #5 ("always add OVERRIDING SYSTEM VALUE before bulk
insert") produces a syntax error the moment a copier uses `COPY`** — which is the textbook choice for a
one-time bulk migration.

### 6. Copy sequencing is unmodelled against 9 FKs. **Opus O-1. CONFIRMED.** Domain 1/5
No ordering, topological sort, `DEFERRABLE`, or `session_replication_role` anywhere in
`src/db/migration/`. The danger is not the FK error — it is the obvious workaround of dropping
constraints for the copy and never re-`VALIDATE`ing them, leaving silent referential corruption.

---

## Medium

### 7. The 2⁵³ ceiling is unpinned — **but do NOT fix it with `mode:"bigint"`.** Terra R1#3, Flash M3, Gemini Pro
`PgBigInt53` routes every value through `Number(value)`; `9007199254740993` → `...992`. **Both Gemini
auditors independently warned** that switching to `mode:"bigint"` breaks `JSON.stringify` (throws on
BigInt without a replacer) and mixed `Number`/`BigInt` arithmetic across the API layer. At 1M ids/sec
2⁵³ is ~285 years away. **Correct fix is to document the ceiling as an invariant, not to change the mode.**

### 8. `post_search_document` is invisible, and `DERIVED_OBJECTS` misdescribes the rebuild. Terra R1#4 + Sonnet B
It is an ordinary table created by raw SQL, so it is structurally invisible to the generator *and* the
manifest. Its rebuild is not a single SQL projection — it is SQL + an application-level
`extractPostPlainText()` + a tsvector build. **The tempting fix (promote it to a real `sqliteTable()`)
would create two competing DDL sources** and strip the three sync triggers from generated output.

### 9. Mixed timezone offsets corrupt string-collation ordering. **Gemini 3.1 Pro. Verified by coordinator.**
`UTC_DESIGNATOR` accepts `Z` **and** `+HH:MM`, and `migration-manifest.test.ts:273` explicitly asserts
offset form is valid. Timestamps are `text`; the app sorts them by string collation at 4 sites. So
`...T10:00:00-05:00` (15:00 UTC) sorts *before* `...T12:00:00Z` (12:00 UTC). Nothing is broken today —
the app writes only `toISOString()` (always `Z`), and a live scan found **zero** non-`Z` text
timestamps. A WordPress import is exactly what would introduce them.

---

## Low

| # | Finding | Source |
|---|---|---|
| 10 | GATE A/B not independent — A funnels through the throwing classifier | Terra R1#5 |
| 11 | `Date.parse` accepts `2026-02-30T00:00:00Z` (→ Mar 2) and space-separated form | Terra R1#6 |
| 12 | `entry_revisions.seq` rationale says "every entry/post save"; the post repo never touches entries | Sonnet C |
| 13 | The "+19% heap" figure reproduces only at ~3 columns; **+54.6% at 8** (index-identical claim confirmed exact) | Sonnet D |
| 14 | Timestamp/JSON completeness gates share their predicate with the implementation | Opus O-2 |
| 15 | `pg-fixture.ts`'s "never import from product code" invariant is unenforced | Opus O-3 |

---

## Refuted findings — recorded so they are not re-raised

- **"No sequence reseeding exists; first insert collides."** Raised as a **BLOCKER by BOTH Geminis
  independently.** **FALSE** — `reseedSequenceSql` (`manifest.ts:411`) and `collectIdentityColumns`
  (`:389`) exist, with two live tests. **Root cause: the coordinator's packet never mentioned them.**
  Two independent auditors converging on the same false blocker is diagnostic of a packet defect, not
  a code defect. *Fix the packet before round 2.*
- **"`Hello World Z` passes verification."** Gemini Pro. **FALSE** — `verifyUtcTimestampText` calls
  `Date.parse` after the regex and returns `UNPARSEABLE_TIMESTAMP`. It saw only a truncated excerpt.
- **"Plugin columns named `*_at` holding epoch integers are misclassified as timestamps."** Coordinator
  hypothesis. **REFUTED by coordinator** — `classifyPluginColumn` switches on `decl.type` first, so
  `INTEGER` never reaches the name heuristic.
- **Flash M2** ("timestamp validation is dead code") is an overstated form of Opus O-2; timestamps *are*
  classified `utc-timestamp-text` and do reach the verifier.
- **Gemini Pro's scope claim** that finding #8 is out of scope: rejected. The threat model excludes
  *FTS5→tsvector implementation*; it does not excuse the manifest from **listing** a derived object.

## Coordinator process failures worth keeping

1. **The packet omitted `reseedSequenceSql`** → manufactured two false blockers in the two auditors who
   could not read files. Packet completeness matters most for the least-equipped auditor.
2. **The dispatch brief named a nonexistent persona path** (`agents/code-review/skills.md`; the real
   file is `agents/code-inspection/skills.md`). The fallback instruction saved the run.
3. **`agy --print` takes the prompt as its VALUE** — flags must precede it, or the flag name becomes the
   prompt and the CLI silently substitutes its default model. Both "Gemini" auditors were about to be
   Claude Sonnet 4.6. Caught only by a discriminative smoke test.
