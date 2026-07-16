# Red-Team Findings: content-admin-core-contract (round 5 — narrow re-review)

- Feature: FEAT-016-content-admin-core-contract
- Spec version: SPEC-016 v1.4.0 (SPEC-017 unchanged at v1.3.0, cited for cross-check only)
- Spec hash: sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe
- Red-Team completed: 2026-07-15T02:23:10Z
- Finding count: 0 BLOCKING · 0 ADVISORY · 0 CONSTITUTION_FLAG
- Scope: narrow, single-finding re-review of RT4-001's fix only. SPEC-018 and SPEC-020 were NOT
  re-reviewed (already cleared in round 4, untouched since). SPEC-019 was NOT re-reviewed (already
  cleared in round 3, untouched since).

---

## Mechanical Validation

`python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py
ADS-memory/specs/016-content-admin-core-contract --phase spec` (no `--update-hash`) →

```
PASS: strict Speckit package passed mechanical validation.
```

Run without `--update-hash`, so this PASS confirms the on-disk content hashes to
`sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe` — the exact hash claimed
by the header metadata and by this dispatch — not merely that the validator was able to compute
*some* hash. No drift between claimed and actual content.

---

## RT4-001 Verdict: RESOLVED

Independent basis (not taken on the revision's own claims):

**Chosen fix path confirmed.** The project owner chose option 2 from round 4's suggested
resolutions (SPEC-016 self-defines the Postgres mechanism, matching the REQ-19–REQ-21
self-contained pattern) rather than option 1 (SPEC-017 accepts the delegated obligation). I read
SPEC-016 v1.4.0's actual content, not its changelog claims, at every location round 4 flagged:

- **REQ-01** (`SPEC-016-feature.spec.md` lines 152–171): now contains two full clauses, not one.
  The SQLite clause is unchanged from v1.3.0. A new Postgres clause states, inline, in this
  contract: `storage_write_watermark` is a `BIGINT` column (cites ADR-015's Drizzle shared-schema
  Postgres mapping for the reason it's the 64-bit equivalent of SQLite's `INTEGER` affinity),
  incremented within the same ACID transaction as the write it stamps, with same-transaction
  atomicity from the transaction's own commit semantics and concurrent-writer serialization from
  "Postgres's normal MVCC/row-locking semantics on the counter row — not the SQLite single-writer
  WAL model." It explicitly says this is defined "following the same self-contained pattern
  REQ-19–REQ-21 already use... rather than delegating either engine's rule to a dependent domain
  spec." This is a concrete mechanism, not a restated pointer to SPEC-017.
- **EC-01** (lines 474–484): the concurrent-write race scenario now has two full expected-behavior
  paragraphs — SQLite (unchanged) and Postgres (new): MVCC/row-locking blocks the second writer
  until the first commits, or retries on serialization conflict per REQ-01's transaction contract,
  both increments land, INV-01 holds. The sentence "This mechanism description is Postgres-specific
  and is self-defined by this contract (REQ-01), not delegated to SPEC-017" is present verbatim —
  an explicit disclaimer of the exact delegation round 4 flagged.
- **Dependencies table** (line 535): a new row, `Postgres MVCC/row-locking transaction runtime
  (Postgres-backed sites only, post-migrate-forward per REQ-19–REQ-21)`, states the guarantee it
  provides is "self-defined directly by this contract, not delegated to SPEC-017" and gives the
  same no-fallback failure-mode language the pre-existing SQLite row uses. Parallel structure to
  the SQLite row, not a placeholder.
- **`state.spec.md`'s `watermark.value` row** (line 26): type is now `integer (64-bit signed; for a
  SQLite-backed site, matches SQLite's native INTEGER affinity per feature.spec.md REQ-01 — for a
  Postgres-backed site post-migrate-forward, stored as a BIGINT column, self-defined by this
  contract per feature.spec.md REQ-01, not owned by SPEC-017)`. Same disclaimer present here too —
  three independent locations in SPEC-016 now say "not owned by SPEC-017," not just REQ-01 prose.
- **AC-39 / AC-40** (lines 441–449): both present, both trace to REQ-01, both are deterministic and
  automatable — AC-39 asserts the `BIGINT` value increases by exactly 1 in the same transaction as
  a Postgres-backed write (P1, mirrors AC-01's SQLite-side phrasing exactly, substituting
  `BIGINT`/Postgres for the implicit SQLite case); AC-40 asserts two concurrent Postgres
  transactions serialize via row-locking with no lost update (P2, mirrors EC-01's new Postgres
  paragraph). Both appear in `traceability.spec.md` (lines 32–33) with `pending` status in every
  column, correctly reflecting that TDD/Programmer have not yet run — not a false "done" claim.
- **REQ-19–REQ-21 comparison**: read in full (lines 279–301) as the pattern SPEC-016 claims to be
  following. Confirmed structurally identical in spirit: REQ-19–REQ-21 define the SQLite/Postgres
  restore-point split entirely inside SPEC-016 with no delegation to any dependent spec. REQ-01's
  new Postgres clause follows the same shape (mechanism → atomicity source → concurrency argument,
  stated directly, no pointer to another package).

**Cross-check against SPEC-017's Out-of-Scope bullet (the other half of the original
contradiction):** SPEC-017 v1.3.0 line 135 still reads: "The `storage_write_watermark` counter's
own definition, the sidecar mirror and its boot reconciliation rule, the generic gated-mutation
gateway mechanics..., ...and the `db-ops` port's `getCapabilities()`/restore-point-capture
contract — all owned by SPEC-016, cited here by REQ/AC id, never restated." Round 4 correctly
identified this bullet as one half of the contradiction, because SPEC-016 v1.3.0 said the opposite
for the Postgres case (it does not own the Postgres mechanism, SPEC-017 does). With SPEC-016 v1.4.0
now owning both engine cases directly, this SPEC-017 bullet is no longer contradicted — it is now
simply true for both engines. No edit to SPEC-017 was required to close the gap, because the
contradiction was two-sided and only needed one side corrected to resolve; the chosen path
(SPEC-016 self-defines) makes SPEC-017's existing "all owned by SPEC-016" claim accurate rather
than requiring SPEC-017 to add a definition it had already refused to accept.

**Verdict: RT4-001 is genuinely RESOLVED**, not merely re-labeled. Both packages now make the same
claim about who owns the Postgres-backed watermark mechanism (SPEC-016, fully, for both engines).
No developer reading only one package is told to go find the answer in the other.

---

## Fresh-Pass Findings on SPEC-016 v1.4.0's New Content

Read REQ-01, EC-01, the Dependencies table's two watermark rows, `state.spec.md`'s `watermark.value`
row, AC-39, AC-40, and the traceability rows in full (not diff-only), specifically probing for the
same defect shape that has recurred four rounds running: a mechanism described in terms that don't
actually cover a case elsewhere treated as in scope.

- **No internal contradiction found.** The SQLite and Postgres clauses in REQ-01 and EC-01 are
  parenthetically scoped ("For a SQLite-backed site... For a Postgres-backed site...") rather than
  overwriting each other, and both engine cases are now covered with no residual "which engine does
  this sentence apply to" ambiguity.
- **No untestable language found.** AC-39/AC-40 use the same deterministic Given/When/Then shape
  and concrete assertions (`BIGINT` value increased by exactly 1 in the same transaction; row-lock
  serialization with no lost update) as the existing SQLite-side ACs (AC-01, AC-41-equivalent
  concurrency AC). Nothing relies on human judgment.
- **No new scope-creep found.** The new Postgres clause stays inside REQ-01's existing boundary
  (the watermark counter's storage/atomicity/concurrency contract) — it does not pull in unrelated
  migrate-forward mechanics; it explicitly treats REQ-19–REQ-21 (the migrate-forward state machine)
  as a citation, not a restatement, consistent with the Brownfield Rule 3 (reference by citation,
  never restatement) this pipeline is bound by.
- **Checked whether the fix "moves the goalposts" onto some other undefined case** (the concern
  this dispatch specifically asked to scrutinize, given the four-rounds-running recurrence of this
  defect shape): traced every consumer of `storage_write_watermark` across the five-package
  pipeline that round 4's RT4-001 investigation had flagged as relevant —
  - SPEC-017 REQ-10/REQ-11/REQ-12 (reads the value at quiesce time, migrate-forward schema-DDL
    state machine) — unaffected, does not need the storage/atomicity mechanism itself, only the
    value, which SPEC-016 still provides identically regardless of which engine backs it.
  - SPEC-019 (Backups/Recovery) — round 4 noted it references `watermarkAtCapture` and the
    disclosure rendering rule but never defined the storage/atomicity mechanism either. That is
    still true and still fine: SPEC-019 was never a candidate owner for this mechanism, and
    SPEC-016 now defines it directly, so SPEC-019 has no residual gap to close.
  - `storage_write_watermark` is also referenced in SPEC-018 and SPEC-020 (confirmed via
    `grep -rln "storage_write_watermark" ADS-memory/specs/`), but every occurrence in both packages
    is a citation-only pattern identical to SPEC-017's — "owned by SPEC-016, cited here by REQ id,
    never restated" (SPEC-018 line 236) or a bare `(SPEC-016 REQ-01)` parenthetical (SPEC-020 lines
    330/367/493). Neither package attempts to define the storage/atomicity mechanism itself, so
    neither is a candidate for the same contradiction and neither needed re-verification beyond
    this citation-shape check.
  - **Conclusion: the fix does not move the goalposts.** It closes the gap at its actual source
    (SPEC-016, the only package with any REQ, state entity, or Dependencies-table row for this
    mechanism) rather than re-delegating to a third location.
- One residual note, not a defect: OQ-01 (both `SPEC-016-feature.spec.md` line ~543 and echoed in
  SPEC-017's OQ-01) — the single-row-counter write-serialization cost under concurrent load —
  remains an open question in both packages, unresolved. This is pre-existing (was open before
  v1.4.0, unrelated to RT4-001) and is explicitly flagged as an Open Question rather than silently
  assumed, so it is not a Red-Team finding; noting it only for completeness since a "does the
  Postgres row-locking argument have a performance cost" reader might otherwise expect it addressed
  here. No action needed — Open Questions are correctly the human-decision mechanism, not a spec
  defect.

**No new BLOCKING, ADVISORY, or CONSTITUTION_FLAG findings from the fresh pass.**

---

## SPEC-017 Citation Re-Check (light, per dispatch scope)

SPEC-017 v1.3.0 was not touched by this fix. Re-checked only whether SPEC-016's v1.4.0 REQ-01/EC-01
changes created new drift against SPEC-017's existing citations:

- **Integration Contracts table row** (`SPEC-017-feature.spec.md` line 490): cites "REQ-01 – REQ-05
  (watermark counter, sidecar mirror, boot reconciliation, unknown/lower-bound rendering)" generically
  by id and one-line paraphrase, backed by AC-11/AC-16. The paraphrase does not quote REQ-01's
  specific words (SQLite/Postgres mechanism detail), so it is unaffected by REQ-01 growing a new
  clause — still textually accurate.
- **Out-of-Scope bullet** (line 135): as covered above under the RT4-001 verdict — now accurate for
  both engines, no longer contradicted.
- **REQ-10** (line 198): cites "SPEC-016's `storage_write_watermark` value (SPEC-016 REQ-01)" only
  as a value read at quiesce time — unaffected by which engine's mechanism produces that value.

**Result: no new drift. SPEC-017's existing citations remain accurate against SPEC-016 v1.4.0, and
the one substantive issue (the Out-of-Scope contradiction) is now closed rather than merely
unaffected.**

---

## Routing Decision

**0 BLOCKING findings this round.** RT4-001 is RESOLVED on independent verification, not merely
claimed-resolved. SPEC-016 v1.4.0 is cleared for Software Architect dispatch.

**Full 5-package pipeline status:**

| Package | Last Red-Team round | Result |
|---|---|---|
| SPEC-016 (content-admin-core-contract) | Round 5 (this dispatch) | 0 BLOCKING — CLEARED |
| SPEC-017 (storage-timeline) | Round 4 | 0 BLOCKING (SPEC-017's own findings all resolved; RT4-001 was a SPEC-016-side finding, now closed) — CLEARED |
| SPEC-018 (categories-and-tags) | Round 4 | 0 BLOCKING — CLEARED |
| SPEC-019 (backups-recovery) | Round 3 | 0 new BLOCKING — CLEARED |
| SPEC-020 (collections) | Round 4 | 0 BLOCKING — CLEARED |

All five packages are now clear of BLOCKING Red-Team findings, and the one live cross-package
contradiction discovered in round 4 (RT4-001) has been independently confirmed closed rather than
relocated. **The full 5-package pipeline is ready for Coordinator Planning Preflight / Software
Architect dispatch.** No outstanding BLOCKING items remain in any package as of this round.
