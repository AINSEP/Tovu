# Red-Team Findings (Round 4 — Re-Review of v1.3.0 Revision + Mandatory SPEC-016 v1.3.0 Re-Sync): storage-timeline

- Feature: FEAT-017-storage-timeline
- Spec version: 1.3.0
- Spec hash: sha256:2f09a7f1fa6e0de45592f3829bd491dd9d89a47e3a9d0a6a8ae295ed9b85066f (mechanically
  verified via `validate_spec_package.py --phase spec --print-hash`, no `--update-hash` needed —
  computed hash matched the stored value; exit code 0, PASS)
- Red-Team completed: 2026-07-15T04:30:00Z
- Finding count: 1 BLOCKING (new — cross-package) · 1 ADVISORY (new — documentation-integrity) ·
  0 new CONSTITUTION_FLAG (2 carried forward unchanged)

This is a fresh full read of all 10 v1.3.0 files (not diff-only), verdicts on round 3's three
findings, the mandatory re-verification of every Integration Contracts citation against SPEC-016's
**current v1.3.0** text (not v1.2.0), and a dedicated check for whether SPEC-016's RT-019 fix
(Postgres-backed watermark ownership assigned to SPEC-017) created a new obligation SPEC-017 has
picked up.

---

## Part 1 — Verdicts on Round 3 Findings (RT3-001, RT3-002, RT3-003)

### RT3-001 (BLOCKING — REQ-08/`onBeforeQuiesce` restated the superseded plan-hash-before-actor-class order) — **RESOLVED**

Independently re-read `SPEC-017-feature.spec.md` REQ-08 and `SPEC-017-orchestrator.spec.md`'s
`onBeforeQuiesce` row. REQ-08 now reads "...MUST follow SPEC-016 REQ-11–REQ-13's
authorize-then-token-state-then-**actor-class-then-plan-hash** ordering..." and `onBeforeQuiesce`
now reads "...after SPEC-016's `authorize()`/token-state/**actor-class/plan-hash** checks have all
passed (REQ-08)..." Both now match SPEC-016 v1.3.0's current REQ-11 order exactly (verified
directly against SPEC-016's own text — unchanged from v1.2.0's corrected order; SPEC-016's v1.3.0
revision did not touch REQ-11/REQ-13 again). REQ-08 also adds an explicit "no domain-specific
instantiation needed beyond SPEC-016's own generic coverage" sentence, closing the finding cleanly
rather than merely swapping two words. Resolved.

### RT3-002 (ADVISORY — Integration Contracts row cited AC-35 instead of AC-37 for REQ-28's `kind='system'` attribution) — **RESOLVED**

The `REQ-16 – REQ-18` row now reads "AC-19, AC-37 (REQ-28's `kind='system'` attribution)."
Independently checked AC-37's actual text: "Given a site boots behind the runtime with
`costClass='cheap'`... the resulting ledger rows attribute the actor as the seeded `kind='system'`
principal" — this is the correct evidence for the claim. Resolved.

### RT3-003 (ADVISORY — AC-41/AC-42 could optionally assert `details.reasonCode` for parity with SPEC-016's own tightened ACs) — **RESOLVED**

AC-41 now reads "...the response is `FORBIDDEN` with `details.reasonCode === 'AUTHORIZE_DENIED'`
(produced by the `authorize()` check) rather than `TOKEN_ALREADY_REDEEMED`..." and AC-42 has the
identical addition. Both are now as precise as SPEC-016's own AC-18/AC-19. Resolved (this was an
optional tightening in round 3; the revision took it).

**Summary: all 3 of round 3's findings are genuinely resolved**, verified by direct re-read, not
taken on the revision's own claim.

---

## Part 2 — Mandatory SPEC-016 v1.3.0 Re-Sync

SPEC-017's citations were checked against SPEC-016 v1.2.0 in round 3. SPEC-016 has since moved to
v1.3.0 (content_hash `sha256:901082ad5bc9bc60c7a298b40b2649bbf55ce579e79cc8b05a316e4e8583a466`) via
its own RT-019/RT-020/RT-021 revision. Read SPEC-016's current `feature.spec.md`,
`state.spec.md`, and `errors.spec.md` in full and cross-checked every SPEC-017 citation:

| SPEC-016 v1.2.0→v1.3.0 change | Effect on SPEC-017's citations |
|---|---|
| RT-019: REQ-01/EC-01/Dependencies table now explicitly scoped to SQLite-backed sites; Postgres-backed equivalent assigned to SPEC-017 | **Direct, material impact — see RT4-001 (BLOCKING) below.** SPEC-017's own REQ-10 cites "SPEC-016's `storage_write_watermark` value (SPEC-016 REQ-01)" generically (accurate, does not misquote REQ-01's words), but SPEC-017 is now the named owner of a mechanism it does not itself define anywhere, and its own Out-of-Scope section actively disclaims exactly that obligation. |
| RT-020: REQ-14 gained an ADR-021-attribution sentence | No impact on SPEC-017 — SPEC-017's own "Note on SPEC-016 REQ-14" section (unchanged since round 2) already states REQ-14 has no independent domain-specific instantiation here; SPEC-016's new sentence is fully consistent with that, not a contradiction. |
| RT-021: REQ-03 softened to a bounded-eventual guarantee matching `RECONCILE_MIRROR`'s actual triggers | No impact — SPEC-017 does not cite REQ-03/AC-04/`RECONCILE_MIRROR` anywhere in its own Integration Contracts table or body text. |

### Integration Contracts table — row-by-row re-verification against SPEC-016 v1.3.0

| Row (SPEC-016 id(s)) | Cited SPEC-017 evidence | Result |
|---|---|---|
| REQ-01 – REQ-05 | AC-11, AC-16 | **REQ-01's own words changed materially in v1.3.0 (engine-scoping added) — see RT4-001.** AC-11/AC-16 themselves remain accurate as evidence for what they claim. |
| REQ-06, REQ-07 | AC-27 | Accurate — unchanged in v1.3.0 |
| REQ-08 – REQ-13 | AC-06 – AC-10, AC-41 | Accurate — now correctly matches v1.3.0's REQ-11 order per RT3-001's fix (re-verified above) |
| REQ-15 | AC-42 | Accurate — REQ-15 unchanged in v1.3.0 |
| REQ-16 – REQ-18 | AC-19, AC-37 | Accurate — REQ-16/REQ-17/REQ-18 text unchanged in v1.3.0 (SPEC-016's v1.3.0 revision only touched REQ-01, REQ-03, REQ-14, EC-01, the Dependencies table, and `state.spec.md`'s `watermark.value` row) |
| REQ-19 – REQ-21 | AC-06, AC-09 | Accurate — unchanged in v1.3.0 |
| REQ-22 | AC-25 | Accurate — unchanged |
| (Note on REQ-14, no row) | n/a | Accurate, reinforced by SPEC-016's own RT-020 clarification |

**Result: every SPEC-016 REQ-id citation in SPEC-017's Integration Contracts table remains textually
accurate against v1.3.0 — no citation quotes words SPEC-016 no longer says.** The one substantive
issue this re-sync surfaces is not a citation-accuracy failure in the traditional sense; it is that
SPEC-016 v1.3.0 assigned SPEC-017 a concrete obligation (define the Postgres-backed watermark
mechanism) that SPEC-017's own package explicitly refuses to accept. See RT4-001.

---

## BLOCKING Findings

### RT4-001
- Severity: **BLOCKING**
- Category: contradiction / missing-failure-mode (the exact "mandatory re-sync" defect class this
  dispatch's own instructions anticipated and asked to be checked for)
- Location: `SPEC-016-feature.spec.md` REQ-01 (lines 153–167), EC-01 (lines 460–469), Dependencies
  table (line 520) — all three state the Postgres-backed watermark storage type, same-transaction
  atomicity mechanism, and concurrency-safety argument "is owned and defined entirely by SPEC-017,
  which owns that state machine per this spec's own Out-of-Scope section"; vs.
  `SPEC-017-feature.spec.md`'s own "Out of scope" bullet list: "The `storage_write_watermark`
  counter's own definition, the sidecar mirror and its boot reconciliation rule, the generic
  gated-mutation gateway mechanics... — all owned by SPEC-016, cited here by REQ/AC id, never
  restated. (see Integration Contracts)"
- Description: SPEC-016's round-3 Red-Team fix (RT-019) closed its own engine-scoping gap by
  choosing delegation — REQ-01/EC-01 now explicitly state the SQLite-specific language covers only
  the SQLite-backed case, and that the Postgres-backed equivalent (concrete column type,
  same-transaction atomicity mechanism, concurrency-safety argument under Postgres MVCC rather than
  SQLite's single-writer WAL model) is SPEC-017's responsibility to define, since SPEC-017 owns the
  migrate-forward state machine that reaches a Postgres-backed `content.db` in the first place.

  I read SPEC-017's entire package looking for that definition: no REQ, no `state.spec.md` entity,
  no Dependencies-table row, and no behavior-narrative section anywhere in SPEC-017 defines a
  concrete Postgres column type, atomicity mechanism, or concurrency argument for
  `storage_write_watermark`. REQ-10 cites "SPEC-016's `storage_write_watermark` value (SPEC-016
  REQ-01)" only as a value it *reads* at quiesce time (`revisionSeqAtQuiesce`), never as something
  whose Postgres-side storage/atomicity mechanism this domain itself specifies. REQ-11/REQ-12 define
  the migrate-forward *schema-DDL* state machine (`IDLE→...→DONE` for each engine) but say nothing
  about the watermark counter's own column type or write-atomicity guarantee once a site is
  Postgres-backed.

  Worse, SPEC-017's own Out-of-Scope section makes an affirmative, opposite claim: the
  `storage_write_watermark` counter's "own definition" is explicitly listed as something SPEC-017
  does *not* own — "all owned by SPEC-016... never restated here." This is not merely an
  unfulfilled obligation; it is a live, textual contradiction between the two packages. SPEC-016
  says "ask SPEC-017." SPEC-017 says "ask SPEC-016." Neither package contains the actual mechanism.
  I also checked SPEC-019 (Backups/Recovery, the other package that consumes the watermark
  baseline) for completeness — it references `watermarkAtCapture` and the disclosure rendering rule
  extensively but likewise never defines the Postgres-backed watermark storage/atomicity mechanism;
  this obligation is genuinely undefined anywhere in the five-package pipeline.

  This is the identical failure mode this pipeline has now hit four times running (RT-003, RT-004/
  RT-012/RT-014, RT-019, and now this) — a mechanism one spec exists specifically to own, described
  in a way that provably does not cover a case that same ecosystem treats as in scope, with no
  spec actually closing the gap. The difference this time is that the gap is not silent — it is an
  active cross-package contradiction, which is arguably worse: a developer who reads only SPEC-016
  is told to go read SPEC-017; a developer who reads only SPEC-017 is told the opposite. Neither
  developer ever reaches a concrete answer.
- Suggested resolution: Exactly one of the following, chosen by the Coordinator/Spec Agent (both
  are legitimate, this is not prescribing implementation, only naming the two structurally sound
  options):
  1. **SPEC-017 accepts the delegated obligation.** Add a concrete REQ (e.g. "For a Postgres-backed
     site, `storage_write_watermark` is stored as a `BIGINT` column, incremented within the same
     ACID transaction as the write it stamps; concurrent writers are serialized by Postgres's
     normal MVCC/row-locking semantics, not a single-writer WAL model"), remove or narrow the
     Out-of-Scope bullet's "all owned by SPEC-016... never restated here" claim so it no longer
     contradicts the new REQ, and add a matching AC/EC and Dependencies-table row.
  2. **SPEC-016 withdraws the delegation and self-defines the mechanism** (RT-019's original option
     (b) — a parallel Postgres-specific REQ-01 clause, EC-01 sibling case, and Dependencies-table
     row, analogous to how REQ-19–REQ-21 handle the SQLite/Postgres split directly inside SPEC-016
     rather than delegating out).

  Either path closes the gap. The current state — SPEC-016 delegates to a package that explicitly
  refuses the delegation — does not, and is strictly worse than round 3's original silent gap
  because it is now an active, discoverable contradiction rather than an omission.

---

## ADVISORY Findings

### RT4-002
- Severity: ADVISORY
- Category: documentation-integrity (stale evidence cells in `spec-dod.md`, same defect shape as
  SPEC-016's own round-1/round-2 RT-018 and SPEC-018's round-2 RT-013)
- Location: `SPEC-017-spec-dod.md` B-02, B-06 rows
- Description: The file's Header Metadata correctly shows `version | 1.3.0` and
  `last_edited | 2026-07-15T00:45:00Z` (matching `feature.spec.md`'s own header exactly), and F-08
  (line 180) correctly says "`1.3.0` in every file (bumped from `1.2.0` in this v1.3.0
  Red-Team-round-3-fix revision...)." But B-02's Notes cell still reads "`1.2.0` — minor-bumped
  from `1.1.0` in this Red-Team-round-2-fix revision..." and B-06's Notes cell still reads
  "`2026-07-14T23:58:00Z` (revised from `2026-07-14T23:00:00Z`...)" — both describing the *prior*
  v1.2.0 revision as if it were the current state, one revision behind the file's own header and
  its own F-08 row later in the same document. This is an internal self-contradiction within a
  single file (F-08 says 1.3.0, B-02 two rows earlier says 1.2.0), not merely staleness relative to
  an external file.
- Suggested resolution: Update B-02's Notes cell to "`1.3.0` — minor-bumped from `1.2.0` for this
  Red-Team-round-3-fix revision (RT3-001 BLOCKING plus RT3-002/RT3-003 ADVISORY, no scope change);
  `1.2.0` was itself minor-bumped from `1.1.0` in the round-2 fix," and update B-06's Notes cell to
  the current `2026-07-15T00:45:00Z` last_edited value, consistent with F-08's already-correct text.

---

## CONSTITUTION_FLAG Findings (carried forward, unchanged)

RT3-004/RT3-005 (= round 1's RT-008/RT-009 — Postgres `CUTOVER` repoint library-fit and
test-determinism concerns) remain unchanged and valid; nothing in the v1.3.0 revision touched this
surface. Carried forward for Software Architect awareness.

---

## Routing Decision

**1 new BLOCKING finding (RT4-001), a cross-package contradiction, not a defect introduced by
SPEC-017's own round-3 fix work** (RT3-001–RT3-003 all genuinely resolved). This is below the
"3 or more" systemic-quality-problem threshold but still means: **route back to Spec Agent** for
either SPEC-017 or SPEC-016 (Coordinator's choice per RT4-001's two suggested-resolution paths)
before Software Architect dispatch.

RT4-002 (ADVISORY, documentation-integrity) should be folded into the same revision pass for
efficiency but does not independently block dispatch.

**Integration Contracts citation-accuracy check (mandatory SPEC-016 v1.3.0 re-sync): PASS on
citation text, FAIL on obligation fulfillment** — every SPEC-016 REQ-id and quoted phrase SPEC-017
cites remains textually accurate against v1.3.0's current wording, but SPEC-016's own RT-019 fix
created a delegated obligation (RT4-001) that SPEC-017's package has not picked up and in fact
actively disclaims.
