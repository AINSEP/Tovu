# Red-Team Findings (Round 4 — Re-Review of v1.3.0 Revision): content-admin-core-contract

- Feature: FEAT-016-content-admin-core-contract
- Spec version: 1.3.0
- Spec hash: sha256:901082ad5bc9bc60c7a298b40b2649bbf55ce579e79cc8b05a316e4e8583a466 (mechanically
  verified via `validate_spec_package.py --phase spec --print-hash`, no `--update-hash` needed —
  computed hash matched the stored value exactly; exit code 0, PASS)
- Red-Team completed: 2026-07-15T04:30:00Z (single-dispatch round covering all four packages)
- Finding count: 0 BLOCKING (own content) · 1 ADVISORY (cross-reference to SPEC-017's new
  BLOCKING finding) · 0 CONSTITUTION_FLAG (RT-011 carried forward unchanged, no action needed)

This is a fresh full read of all 9 v1.3.0 files (not diff-only), plus independent verdicts on
round 3's three findings and a dedicated look at whether the RT-019 "comprehensive sweep" claim
holds up.

---

## Part 1 — Verdicts on Round 3 Findings (RT-019, RT-020, RT-021)

### RT-019 (BLOCKING — REQ-01/EC-01/Dependencies table SQLite-only, no Postgres equivalent) — **RESOLVED**

Independently re-read REQ-01 (lines 153–167), EC-01 (lines 460–469), and the Dependencies table
(lines 519–520). REQ-01 now explicitly scopes the "64-bit signed integer matching SQLite's native
`INTEGER` affinity" description and its same-transaction atomicity argument to "only the
SQLite-backed case," and states in the same sentence that the Postgres-backed equivalent "is owned
and defined entirely by SPEC-017, which owns that state machine per this spec's own Out-of-Scope
section." EC-01 gained a parallel Postgres-backed branch with the same delegation. The Dependencies
table's `SQLite / better-sqlite3 WAL transaction runtime` row is now explicitly labeled
"(SQLite-backed sites only)," and a new sibling row, "Postgres-backed `content.db`'s own transaction
runtime and its watermark-atomicity mechanism, as defined by SPEC-017," carries the matching
Failure Mode/Fallback columns. Both implementers (SQLite-side and Postgres-side) now have textual
anchors to converge on, resolving the two-implementers-diverge problem RT-019 named. **This is
option (a) from RT-019's own suggested resolution — delegate to SPEC-017 — not option (b)
(self-define a parallel Postgres clause). See the cross-reference finding RT4-CROSS below: this
choice is only complete once SPEC-017's own package actually picks up the delegated obligation,
which it currently does not.**

**"Comprehensive sweep" claim, independently verified, not trusted:** grepped every SPEC-016 file
for `sqlite|INTEGER affinity|better-sqlite3|WAL` (case-insensitive). Every remaining hit is either
(a) a REQ that already explicitly branches by engine (REQ-19–REQ-21, REQ-01, EC-01 — all confirmed
above), or (b) `state.spec.md`'s `watermark.value` State Shape row, which the revision's own note
claims was the one additional instance found — independently confirmed: the row now reads
`integer (64-bit signed; for a SQLite-backed site, matches SQLite's native INTEGER affinity per
feature.spec.md REQ-01 — for a Postgres-backed site post-migrate-forward, the concrete column type
and atomicity mechanism are owned and defined by SPEC-017, not this contract)`. No orphaned
SQLite-only language describing REQ-01/EC-01's mechanism remains unscoped anywhere in the package.
The sweep claim holds up under independent re-derivation — this is the first round in this defect
shape's three-round recurrence (RT-003 → RT-004/RT-012 → RT-019) where a full sweep was actually
verified to have closed every instance, not just the one instance a prior round happened to name.

### RT-020 (ADVISORY — REQ-14 widened beyond this contract's own gateway, risks becoming a second source of truth for an ADR-021 property) — **RESOLVED**

REQ-14's text and `api.spec.md`'s Purpose note both now add the exact disclaiming sentence RT-020's
suggested resolution asked for: "This rule is a restatement, surfaced here for convenience because
the gated-mutation gateway's own check ordering depends on it, of an `authorize()`-ordering property
that ADR-021 defines as part of `authorize()`'s own contract... this spec does not originate the
rule independently of ADR-021, and a dependent domain citing REQ-14 for its own ordinary-mutation
endpoints is equally citing ADR-021's underlying `authorize()` contract property, not a rule this
core contract owns on its own authority." This is RT-020's second suggested-resolution option,
chosen cleanly — the cross-cutting breadth is kept, but ownership is now explicit. Resolved.

### RT-021 (ADVISORY — REQ-03's "after every commit" reads synchronous, AC-04/`RECONCILE_MIRROR` are weaker/time-unbounded) — **RESOLVED**

REQ-03 now reads: "...refreshed to match `content.db`'s authoritative value by the next
reconciliation opportunity (boot, or a periodic tick — see `state.spec.md`'s `RECONCILE_MIRROR`
action, the mirror's only two refresh triggers) after any `content.db` commit that changes it. This
is a bounded-eventual guarantee, not a claim that the mirror is refreshed synchronously inside the
same transaction as the watermark-changing commit — REQ-03 and `RECONCILE_MIRROR` describe the same
single guarantee, not two different ones." This is RT-021's second suggested-resolution option
(soften REQ-03 to match `RECONCILE_MIRROR`'s actual triggers) rather than the first (give an exact
numeric interval) — an acceptable choice per the finding's own either/or framing. AC-04 was
correspondingly left as "next reconciliation opportunity in the same boot session," now consistent
with REQ-03's own softened language rather than contradicting it. Resolved — the ambiguity (two
different guarantees) is gone, even though "a periodic tick" still has no numeric bound, which
RT-021 itself flagged as lower-risk and acceptable.

**Summary: all 3 of round 3's findings (RT-019, RT-020, RT-021) are genuinely resolved,**
independently re-derived rather than taken on the revision's own claim.

---

## Part 2 — Fresh Full Pass (v1.3.0's own new content)

No new BLOCKING or ADVISORY defect was found that originates purely within SPEC-016's own four
walls. The one item worth recording is a cross-package consequence of RT-019's own fix choice:

### RT4-CROSS (informational — see SPEC-017's RT4-001 for the full BLOCKING finding)
- Severity: ADVISORY (from this package's side — the defect's blocking severity is recorded
  against SPEC-017, since that is where the unfulfilled obligation and the live textual
  contradiction sit)
- Category: contradiction (cross-package)
- Location: `SPEC-016-feature.spec.md` REQ-01 (lines 153–167), EC-01 (lines 460–469), Dependencies
  table (line 520) — all three assign "the equivalent watermark storage type, same-transaction
  atomicity mechanism, and concurrency-safety argument for a Postgres-backed `content.db`... owned
  and defined entirely by SPEC-017"
- Description: RT-019's fix chose to delegate the Postgres-backed watermark mechanism to SPEC-017
  rather than self-defining it (option (a), not option (b), from RT-019's own suggested
  resolution). Verified directly against SPEC-017 v1.3.0's own text: SPEC-017's Out-of-Scope
  section explicitly states "The `storage_write_watermark` counter's own definition, the sidecar
  mirror and its boot reconciliation rule... all owned by SPEC-016, cited here by REQ/AC id, never
  restated," and no REQ, state entity, or dependency row anywhere in SPEC-017's own package defines
  a concrete Postgres column type, atomicity mechanism, or concurrency-safety argument for
  `storage_write_watermark`. The two packages now make mutually contradictory ownership claims —
  SPEC-016 says "SPEC-017 owns this," SPEC-017 says "SPEC-016 owns this, never restated here" — and
  the actual mechanism is defined in neither package (confirmed also absent from SPEC-019, which
  otherwise consumes the watermark baseline but does not define its Postgres storage mechanism
  either). This is filed as the primary BLOCKING finding under SPEC-017 (RT4-001) because that is
  where the disclaiming Out-of-Scope text lives, but resolving it may require a coordinated edit to
  either or both packages.
- Suggested resolution: See SPEC-017's RT4-001. Either SPEC-017 accepts the delegated obligation
  (add a concrete Postgres REQ/state entity defining the storage type and atomicity mechanism, and
  remove or narrow its Out-of-Scope disclaimer accordingly), or SPEC-016 withdraws the delegation
  and self-defines a parallel Postgres-specific REQ-01 clause (RT-019's original option (b)). Either
  path requires touching this file's REQ-01/EC-01/Dependencies-table text again if the resolution
  lands in SPEC-016 rather than SPEC-017 — flagged here so a future round doesn't need to
  re-discover the connection.

---

## CONSTITUTION_FLAG Findings

None newly introduced this round. RT-011 (Article IV — Anti-Abstraction Gate) remains the only
standing constitution-adjacent note, carried forward unchanged for Software Architect awareness.
`ADS-memory/governance/constitution.md` re-confirmed still an unratified template.

---

## Routing Decision

**0 BLOCKING findings originating in this package's own content.** All three of round 3's findings
are genuinely resolved on independent re-derivation, and the fresh full pass found no new defect
inside SPEC-016's own four walls.

**This package is cleared for Software Architect dispatch on its own content**, with one caveat:
RT4-CROSS/RT4-001 (filed as BLOCKING under SPEC-017) may require a follow-up edit to this file's
REQ-01/EC-01/Dependencies-table text if the Coordinator or Spec Agent chooses to resolve the
Postgres-watermark-ownership contradiction by having SPEC-016 self-define the mechanism rather than
having SPEC-017 pick it up. Do not finalize SPEC-016 v1.3.0 as immutable until that cross-package
decision is made — a v1.3.1 touch-up may still be needed depending on which side takes the fix.
