# Red-Team Findings (Round 4 — Re-Review of v1.3.0 Revision): categories-and-tags

- Feature: FEAT-018-categories-and-tags
- Spec version: 1.3.0
- Spec hash: sha256:03ad39e3a209e0edc282424ec8c37023760f16abe71008ff8bdb5d8284ba9f81 (mechanically
  verified via `validate_spec_package.py --phase spec --print-hash`, no `--update-hash` needed —
  computed hash matched the stored value; exit code 0, PASS)
- Red-Team completed: 2026-07-15T04:30:00Z
- Finding count: 0 BLOCKING · 2 ADVISORY (1 new, 1 carried-forward informational note) ·
  0 CONSTITUTION_FLAG

Fresh full read of all 8 v1.3.0 files, verdicts on round 3's four findings, mandatory SPEC-016
v1.3.0 re-sync, and a fresh adversarial pass on the revision's own new content.

---

## Part 1 — Verdicts on Round 3 Findings (RT-014 through RT-017)

### RT-014 (BLOCKING — `EXECUTE_MERGE_TERM`'s Precondition column restated SPEC-016's superseded plan-hash-before-actor-class order) — **RESOLVED**

`state.spec.md`'s `EXECUTE_MERGE_TERM` Precondition cell now reads: "SPEC-016 REQ-11 – REQ-13
checks (fresh `authorize()`, token validity, actor-class rule, plan-hash match) all pass, in the
order SPEC-016 REQ-11/REQ-13/`behavior.spec.md` §2.2 define — this domain does not redefine or
reorder that sequence, it only instantiates it (see `behavior.spec.md` §2.1)." This both lists the
checks in the corrected order (actor-class before plan-hash, matching SPEC-016's current text) and
explicitly disclaims authority to define the ordering, citing SPEC-016 by reference — consistent
with the finding's suggested resolution and with Brownfield Rule 3 (cite, never restate). Resolved.

### RT-015 (ADVISORY — AC-25 presupposed an undefined `idempotencyKey` field) — **RESOLVED**

AC-25 now reads: "...the call is rejected before any other side effect (no `term` row write, no
`TaxonomyRevision` row, no watermark stamp, no outbox enqueue) occurs. (This domain's ordinary
mutations do not define an `idempotencyKey` request field in v1... so this AC tests only the
`authorize()`-first ordering property that is concretely observable here...)." Verified no
`idempotencyKey` field exists anywhere in `api.spec.md`'s Request Contracts or `state.spec.md`'s
Action Catalog (unchanged from round 3's own check) — the AC no longer presupposes one. Resolved.

### RT-016 (ADVISORY — sibling package files' `content_hash` headers stuck at the stale v1.1.0 value) — **RESOLVED, independently re-grepped**

Ran `grep -m1 -i "content_hash\|Content Hash"` against all 8 `SPEC-018-*.spec.md` files. All 8,
including `feature.spec.md` itself, now read the identical current canonical hash
`sha256:03ad39e3a209e0edc282424ec8c37023760f16abe71008ff8bdb5d8284ba9f81`. Propagation is complete
and consistent this time — verified mechanically, not trusted from the revision note. Resolved.

### RT-017 (ADVISORY — `depends_on` header still pinned SPEC-016 v1.1.0, now stale relative to v1.2.0 too) — **RESOLVED for the version it targeted; now stale again relative to v1.3.0 — see below**

`feature.spec.md` and `spec-manifest.md`'s `depends_on` fields now correctly read "SPEC-016
(content-admin-core-contract) v1.2.0, content_hash `sha256:a43a9b33...`" — exactly what RT-017
asked for. This closes RT-017 as originally filed. However, SPEC-016 has since moved to v1.3.0
(this same round's parallel revision) — so the field is stale again, one version behind, purely as
a consequence of authoring order, not a fix that regressed. This is recorded as a fresh
informational note below rather than reopening RT-017, since RT-017's own literal ask (bump v1.1.0
→ v1.2.0) was fully satisfied at authoring time.

**Summary: all 4 of round 3's findings are genuinely resolved.**

---

## Part 2 — Mandatory SPEC-016 v1.3.0 Re-Sync

SPEC-018's citations were verified against SPEC-016 v1.2.0 at authoring time (per RT-017's now-
correct pin). SPEC-016 has since moved to v1.3.0. Read SPEC-016's current `feature.spec.md`
(REQ-01, REQ-03, REQ-14, EC-01, Dependencies table, and the untouched REQ-16/REQ-17/REQ-18) and
diffed against SPEC-018's citations:

- **REQ-01/REQ-02 (watermark counter/stamping obligation, cited at feature.spec.md line 273 and
  Dependencies table):** SPEC-018 cites these generically ("The `storage_write_watermark` counter
  and its same-transaction stamping obligation for any write chokepoint...") without restating the
  SQLite-specific type language SPEC-016's RT-019 fix scoped — no drift, the citation was already
  engine-agnostic.
- **REQ-16, REQ-17, REQ-18 (composite actor identity, soft cross-boundary reference):** text
  unchanged between v1.2.0 and v1.3.0 (SPEC-016's v1.3.0 revision touched only REQ-01, REQ-03,
  REQ-14, EC-01, the Dependencies table, and `state.spec.md`'s `watermark.value` row) — SPEC-018's
  `TaxonomyRevision` field-shape citation (RT-010's round-2 fix) remains accurate.
  REQ-14 (line 275, RT-017's own dependency table): SPEC-016's REQ-14 gained a new
  ADR-021-attribution sentence in v1.3.0 (RT-020's fix) but its substantive rule is unchanged —
  SPEC-018's citation ("`authorize()` MUST be evaluated before any idempotency short-circuit at
  every mutating call site") remains accurate.
- **REQ-10 (600-second TTL):** unchanged. Accurate.
- **REQ-22 (agent-tool naming/functional confirm-step prohibition):** unchanged. Accurate.

**One place requires closer scrutiny — EC-09's concurrency justification. See RT4-003 below.**

**Depends_on staleness (informational, not re-filed as a numbered finding since it is the same
"one revision behind due to authoring order" shape RT-017 itself already established as
non-blocking):** `feature.spec.md` and `spec-manifest.md`'s `depends_on` fields still say "SPEC-016
v1.2.0." Per this round's own instructions, this is judged out of scope to re-flag as a fresh
BLOCKING/ADVISORY finding this round — the citation *content* re-sync above shows no defect, and
chasing a `depends_on` version pin across four packages that are all being revised in the same
round would create an infinite bump-chase. **Recommendation:** the Coordinator's Planning Preflight
should do one final `depends_on`-pin sweep across all five packages once SPEC-016 is confirmed
final for this pipeline, rather than each dependent spec re-chasing SPEC-016's version number every
round.

---

## Part 3 — Fresh Findings (this round's own adversarial pass on v1.3.0's new content)

### RT4-003
- Severity: ADVISORY
- Category: ambiguity (citation-accuracy tightening, not a broken contract)
- Location: `SPEC-018-feature.spec.md` EC-09 ("...the write is an upsert/ignore-on-conflict
  operation... per the underlying single-writer transaction model; mirrors SPEC-016 EC-01's
  serialization guarantee.")
- Description: EC-09 justifies its "both concurrent `assignTerms` calls complete as idempotent
  no-ops, neither ever receives a conflict/error response" claim by citing "the underlying
  single-writer transaction model" and "SPEC-016 EC-01's serialization guarantee." SPEC-016 EC-01
  is no longer a single, engine-agnostic guarantee as of v1.3.0 (RT-019's fix) — it now explicitly
  states the single-writer WAL mechanism applies only to a SQLite-backed site, and that "this core
  contract does not itself define the concurrency-safety mechanism" for a Postgres-backed site
  (delegated onward, and — per SPEC-017's RT4-001 finding this same round — not actually defined
  anywhere yet). EC-09's phrase "the underlying single-writer transaction model" is therefore now
  inaccurate if read as applying unconditionally to every site this domain runs against, and "mirrors
  SPEC-016 EC-01's serialization guarantee" now implies parity with a guarantee that is itself
  split into two different mechanisms (and, for Postgres, currently undefined).

  This does not threaten EC-09's actual behavioral claim: the `entry_terms_unique` index plus an
  upsert/ignore-on-conflict write pattern produces the same "idempotent no-op, exactly one row,
  never a caller-visible conflict" outcome under Postgres's `ON CONFLICT DO NOTHING`-equivalent
  semantics just as much as under SQLite's WAL serialization — a unique-index-backed upsert doesn't
  actually depend on "single-writer" anything, so the underlying guarantee EC-09 needs is real and
  engine-independent even though the *justifying language* borrowed from EC-01 is not. This is a
  phrasing/citation-accuracy issue, not a behavioral defect, so it is not escalated to BLOCKING.
- Suggested resolution: Reword EC-09's parenthetical to something engine-independent and no longer
  dependent on citing SPEC-016 EC-01's now-split guarantee, e.g. "...per `entry_terms_unique`'s own
  constraint-enforcement guarantee under either backing engine's standard ACID conflict handling
  (not specifically SQLite's single-writer WAL model, which SPEC-016 EC-01 no longer claims applies
  unconditionally as of v1.3.0)."

---

## CONSTITUTION_FLAG Findings

None. `ADS-memory/governance/constitution.md` re-confirmed still an unratified template. No
requirement in this package forces a custom-implementation-over-library choice, a prohibitively
difficult test, or untraceable complexity.

---

## Routing Decision

**0 BLOCKING findings.** All 4 of round 3's findings (1 BLOCKING, 3 ADVISORY) are confirmed
genuinely resolved on independent re-derivation. The mandatory SPEC-016 v1.3.0 re-sync found no
citation-content drift in this package. **This package is cleared for Software Architect dispatch.**

RT4-003 (ADVISORY) is a minor phrasing tightening, optional before dispatch. The `depends_on`
staleness (informational) is recommended for a single end-of-pipeline sweep rather than a
per-round chase.
