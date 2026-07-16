# Red-Team Findings (Round 3 — Citation-Sync Re-Review): backups-recovery

- Feature: FEAT-019-backups-recovery
- Spec version (SPEC-019, unchanged this round): 1.1.0
- Spec hash (SPEC-019, unchanged this round): sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1
- Trigger for this round: SPEC-016 (the shared core contract SPEC-019 depends on) moved
  v1.1.0 → v1.2.0 (hash `sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d` →
  `sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`) via its own
  Red-Team-round-2-driven revision, resolving SPEC-016's RT-012–RT-018. SPEC-019 itself did **not**
  need a content revision at round 2 (0 BLOCKING) — this round exists solely to re-verify SPEC-019's
  citations against SPEC-016's new text and to re-confirm SPEC-019's own package is untouched.
- Prior round: `red-team-findings-round2.md` (v1.1.0, same hash as above) — 0 new BLOCKING · 1 new
  ADVISORY (RT-010) · 0 new CONSTITUTION_FLAG; 4 prior BLOCKING RESOLVED; 3 of 4 prior ADVISORY
  RESOLVED, RT-006 PARTIALLY RESOLVED.
- Red-Team completed: 2026-07-15T00:30:00Z
- Finding count (this round, new only): 0 BLOCKING · 3 new ADVISORY (RT-011, RT-012, RT-013) ·
  0 new CONSTITUTION_FLAG (RT-009 carried forward unchanged, not recounted as new)

All 10 SPEC-019 files were re-read in full this round, plus SPEC-016's current v1.2.0
`feature.spec.md` and `traceability.spec.md` (and, for completeness, `api.spec.md`/`state.spec.md`/
`orchestrator.spec.md`/`errors.spec.md`/`behavior.spec.md`), plus SPEC-016's own
`pipeline-state.md` and `red-team-findings-round2.md` to get the exact, itemized diff between
SPEC-016 v1.1.0 and v1.2.0 (RT-012 through RT-018) rather than guessing at what changed from the
feature-spec text alone.

---

## Part 0 — Package Integrity Check (SPEC-019 itself)

Verified by direct inspection, not assumption: SPEC-019's own `content_hash` is identical across
all 8 hash-bearing files (`feature`/`api`/`state`/`orchestrator`/`ui`/`errors`/`behavior`/
`traceability`), and identical to the hash round 2 reviewed:

`sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1`

**SPEC-019's own content is unchanged since round 2.** This round's findings are therefore either
(a) re-verifications of round-2 findings against SPEC-016's new text, or (b) genuinely new
observations from this round's fresh full pass — never a claim that SPEC-019's content moved.

---

## Part 1 — SPEC-016 v1.1.0 → v1.2.0 Delta, Itemized

Read directly from SPEC-016's own `pipeline-state.md` Revision History (v1.2.0 entry) and
cross-checked against SPEC-016's current `feature.spec.md`/`errors.spec.md`/`state.spec.md`/
`orchestrator.spec.md`/`behavior.spec.md` text (not taken on faith):

| SPEC-016 finding | What changed | Confirmed present in current v1.2.0 text |
|---|---|---|
| RT-012 (BLOCKING) | `restorePoint.kind: 'external'` given a defined trigger (externally-managed PITR/backup mechanism the `db-ops` adapter cannot itself execute, paired with `costClass: 'unavailable'`); new AC-37 | Yes — REQ-19's final sentences and AC-37 both present verbatim |
| RT-013 (BLOCKING) | `FORBIDDEN.details.reason` (free text) got a new sibling field `details.reasonCode: enum[AUTHORIZE_DENIED, ACTOR_CLASS_MISMATCH]` as the closed, testable discriminator; REQ-13/AC-18/AC-19 now assert on `reasonCode` | Yes — `errors.spec.md` §3/§4, REQ-13, AC-18/AC-19 all present |
| RT-014 (ADVISORY) | REQ-18 and `state.spec.md`'s Purpose now explicitly state this core contract instantiates *only* the composite-actor-identity flavor of the soft-cross-boundary-reference rule; the polymorphic-content-reference flavor (e.g. `entry_terms`) has no concrete entity here and is each dependent domain's own responsibility to formalize in its own `state.spec.md` | Yes — REQ-18's added final sentences |
| RT-015 (ADVISORY) | REQ-19: "working" (Postgres tooling) clarified as a static configuration-presence check, never a live health probe; configured-but-broken now explicitly also reports `'unavailable'` (new AC-36) | Yes — REQ-19's "is determined by a static configuration-presence check..." sentence, AC-36 |
| RT-016 (ADVISORY) | REQ-14 / `api.spec.md` Purpose: explicit statement that REQ-14 is a generic cross-cutting rule for any mutating call site (gated or ordinary) in any dependent domain, and that this contract's own 3 gateway endpoints do not themselves accept an idempotency-key field | Yes — REQ-14's final two sentences, `api.spec.md` Purpose note |
| RT-017 (ADVISORY) | `execute()`'s check ordering changed: the actor-class redemption rule (REQ-13) now runs immediately after the token expiry/redemption-state check and **before** plan re-derivation/hash comparison (previously after) — new EC-10, AC-38; `behavior.spec.md` §2.2, `orchestrator.spec.md`'s new `onActorClassCheck` hook, `state.spec.md`'s `REDEEM_TOKEN` precondition order all updated to match | Yes — REQ-11/REQ-13 text, `behavior.spec.md` §2.2, EC-10, AC-38 all present and consistent |
| RT-018 (ADVISORY) | Timestamp-consistency fix inside `SPEC-016-spec-dod.md` only | N/A to SPEC-019 (pure internal SPEC-016 housekeeping) |

REQ-01 – REQ-22's **numbering** is unchanged end to end — confirmed by grepping every `- REQ-NN:`
line in the current `SPEC-016-feature.spec.md` and comparing against what SPEC-019 cites throughout
its `## Integration Contracts` section. No renumbering, no REQ deletion, no REQ id reuse for a
different meaning.

---

## Part 2 — Citation-by-Citation Re-Verification (Primary Duty)

Every citation range in `SPEC-019-feature.spec.md`'s `## Integration Contracts` section, re-checked
against SPEC-016's *current* v1.2.0 text (not spot-checked, not assumed unchanged from round 2's
verification against v1.1.0):

**Watermark / discarded-write-window disclosure (SPEC-016 REQ-01 – REQ-07, AC-01 – AC-08, INV-01 –
INV-02):** All still present, unchanged content, in v1.2.0. **No correction needed.**

**Gated-mutation gateway (SPEC-016 REQ-08 – REQ-15, REQ-22, AC-09 – AC-22, AC-32, INV-03 – INV-05):**
All still present. RT-017's reordering (actor-class rule now evaluated before plan
re-derivation/hash comparison) sits entirely *inside* REQ-11/REQ-13's already-cited range — SPEC-019
never restates or contradicts the internal check ordering anywhere in its own package (its
`orchestrator.spec.md` lifecycle hooks delegate `confirmRestore`/`executeRestore` entirely to
`GatedMutationGateway.confirm`/`.execute` without describing the internal sequence), so the
reordering is absorbed transparently by citation — **no correction needed**, but see RT-013 below
for a completeness (not correctness) observation.

**Composite actor identity / soft cross-boundary reference (SPEC-016 REQ-16 – REQ-18, INV-06 –
INV-07):** REQ-18 gained new clarifying sentences (RT-014) stating the polymorphic-content-reference
flavor is each dependent domain's own responsibility to formalize. SPEC-019/Recovery has no
polymorphic content-reference table of its own (no `entry_terms`-analog — Recovery's Out of Scope
section explicitly excludes Collections/Categories & Tags), so this new obligation does not attach
to SPEC-019. The composite-actor-identity half of REQ-18 (the half SPEC-019 actually cites) is
byte-for-byte unchanged. **No correction needed.**

**`db-ops` capability surface (SPEC-016 REQ-19 – REQ-21, AC-28 – AC-31, AC-33):** REQ-19 gained the
`'external'`-kind trigger (RT-012, new AC-37) and the configured-but-broken clarification (RT-015,
new AC-36). Checked whether either affects any assumption in SPEC-019:
- SPEC-019's own `RecoveryCapabilitiesResponse.restorePointKind` enum (`api.spec.md` §5) already
  includes `external` — it was never assuming that value was unreachable or omitting it.
- SPEC-019's REQ-12/AC-20 degrade uniformly on `costClass === 'unavailable'` regardless of *why* it
  is unavailable (never-configured, configured-but-broken, or externally-managed-PITR) — the
  screen's behavior does not branch on `restorePoint.kind`, only on `costClass`. Both new SPEC-016
  triggers (AC-36, AC-37) resolve to `costClass: 'unavailable'`, which SPEC-019 already handles as a
  single degraded state.
- SPEC-019's citation pattern here already follows a "cite the REQ range broadly, name a specific AC
  only when a specific SPEC-019 AC needs that exact case" convention (it names AC-33 specifically
  because AC-06 tests exactly the `'expensive'` case). Neither AC-36 nor AC-37 has an SPEC-019 AC
  that specifically needs to distinguish them from the general `'unavailable'` case, so no new named
  citation is required under that same convention.

**Conclusion: zero of SPEC-019's Integration Contracts citations require a correction.** SPEC-016's
v1.1.0 → v1.2.0 changes were additive/clarifying within already-cited REQ ranges, not renumbering or
removal, and none of them contradict an assumption SPEC-019 actually makes.

---

## Part 3 — RT-006 Status Check (Secondary Duty)

**RT-006 (round 2, ADVISORY, PARTIALLY RESOLVED as of round 2):** OQ-03's ownership was correctly
reassigned from "Software Architect for SPEC-019" to "SPEC-016, not SPEC-019 alone," but the
underlying gap — whether `authorize()` itself can run at all when its own backing store
(`content.db`, which holds `principals`) is unreadable, as distinct from the watermark/disclosure
degrading to an unknown estimate — was flagged as **not yet landed in SPEC-016**.

Checked directly against SPEC-016's current v1.2.0 text: **the gap is still not addressed.**
- SPEC-016's EC-05 is byte-for-byte unchanged from what round 2 quoted: "What happens when
  `content.db` cannot be opened at boot? Expected behavior: the sidecar mirror cannot be refreshed
  from the authoritative counter; any disclosure computed from the watermark renders an explicit
  unknown/lower-bound estimate, never a stale precise number." This still only addresses
  watermark/disclosure degradation.
- SPEC-016's Dependencies table still carries only the generic statement: "If `authorize()` is
  unavailable, no gated or ordinary mutation covered by this contract can be evaluated... None —
  fail-closed; the mutation is denied, never allowed by default" — not scoped specifically to the
  `content.db`-unreadable case the way EC-05 is scoped for the watermark.
- None of SPEC-016's v1.2.0 revision items (RT-012 – RT-018) touch this question at all — they
  address `restorePoint.kind`, `FORBIDDEN.details.reasonCode`, the polymorphic-reference flavor,
  Postgres tooling-verification semantics, REQ-14's scope statement, and execute() check ordering.
  None of them is the EC/REQ addition RT-006's original suggested resolution called for.

**Verdict: RT-006 remains PARTIALLY RESOLVED, unchanged from round 2.** This is not a new defect and
not a fault of SPEC-019 — OQ-03 is still honestly open, correctly owned by SPEC-016, and does not
gate any SPEC-019 P1 AC. It should continue to be tracked as a live, non-blocking gap on SPEC-016's
side rather than being treated as newly BLOCKING here, per this round's assignment.

---

## Part 4 — Fresh Full Adversarial Pass (Secondary — Cheap While Already Reading Everything)

Since SPEC-019's own content is unchanged since round 2, a fresh attack-vector pass over the same
text reproduces round 2's standing items:

- **RT-009 (CONSTITUTION_FLAG)** — carried forward unchanged. Recovery's four composed pieces of
  machinery (five-step gated ceremony, non-gated `backup.create` path, cross-screen in-flight lock,
  mandatory envelope re-verification) are still folded into the Constitution Compliance table's
  Article III row, ready for Software Architect's Complexity Justification. No action required.
- **RT-010 (ADVISORY)** — carried forward unchanged. AC-06's "cost/disk-estimate acknowledgment
  requirement" phrasing is still ambiguous against a package that defines exactly one acknowledgment
  control (the Step 2 disclosure's `acknowledged`/`onAcknowledge`, gated to the partial-coverage
  caveat text) and a REQ-26 uniformity requirement that argues against a second, cost-specific gate.
  Still not resolved (SPEC-019 was not revised), still not BLOCKING for the reasons stated in round 2
  (the disclosure gate already provides a deterministic confirm-reachability test regardless of how
  AC-06 is read).

Three new observations surfaced on this pass that round 2 did not raise:

### RT-011
- Severity: ADVISORY
- Category: ambiguity (provenance/documentation staleness, not a substantive citation error)
- Location: `SPEC-019-feature.spec.md` § Integration Contracts, "Re-sync note (2026-07-14)"; and
  `ADS-memory/reports/pipeline/019-backups-recovery/pipeline-state.md`'s `depends_on` field
- Description: Both of these still state SPEC-019's citations were derived against "SPEC-016 v1.1.0
  (`content_hash: sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`)."
  SPEC-016 has since moved to v1.2.0 (`sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`).
  Part 2 above independently re-verified that every citation is still substantively accurate against
  v1.2.0's actual text, so this is not a broken citation — but the provenance metadata itself is now
  factually wrong about which SPEC-016 version/hash was last checked, which is exactly the kind of
  small drift this project's own hash-discipline exists to catch (and is analogous to SPEC-016's own
  RT-018 timestamp-consistency finding one level up).
- Suggested resolution: In SPEC-019's next content revision (not this round, since 0 BLOCKING
  findings exist to force one), update the Re-sync note to record this round's re-verification
  (v1.2.0, new hash, "no citation required a change") the same way the existing note records the
  v1.1.0 re-sync. Separately, `pipeline-state.md`'s `depends_on` field should be updated to point at
  SPEC-016 v1.2.0/its current hash — this is a process-metadata correction, not a spec-content change,
  and can be done independently of a SPEC-019 version bump.

### RT-012
- Severity: ADVISORY
- Category: ambiguity / untestable
- Location: `SPEC-019-feature.spec.md` § Integration Contracts (Watermark paragraph); SPEC-016
  REQ-02/AC-34
- Description: SPEC-016 REQ-02 requires "each dependent domain spec's own `## Integration Contracts`
  section MUST explicitly name, one by one, every write chokepoint in that domain that calls the
  watermark-stamping function," and AC-34 makes this an inspectable, testable audit ("any write
  chokepoint not named there is treated as not watermark-stamped"). SPEC-019's own Integration
  Contracts section never names any Recovery-domain write chokepoint that calls the
  watermark-stamping function, and also never states that Recovery has zero such chokepoints.
  Recovery's own domain-owned writes (`backup.create`'s restore-point row insert; the restore
  execution itself, which replaces content wholesale rather than incrementally) plausibly are not
  watermark-stamping chokepoints in REQ-02's sense — restore points *read* the watermark
  (`watermarkAtCapture`) rather than advancing it, and a restore is a wholesale content replacement,
  not the kind of incremental content write REQ-02 is describing (Collections' entries, Taxonomy's
  terms). But SPEC-019 never says this affirmatively. An AC-34-style audit of SPEC-019's own package
  today has nothing to positively confirm — silence could be read either as "correctly has none" or
  as "an omission," and the two are not distinguishable from the text alone.
- Suggested resolution: Add one sentence to the Watermark/disclosure Integration Contracts paragraph
  stating explicitly that the Recovery domain owns no write chokepoint that stamps
  `storage_write_watermark` (restore-point capture reads the watermark, it does not advance it; a
  restore replaces content wholesale rather than incrementally, and is not itself a
  disclosure-covered write path) — closing the AC-34 audit loop the same way other "N/A" sections in
  this package are explicitly stated rather than left silent.

### RT-013
- Severity: ADVISORY
- Category: missing-failure-mode (test-coverage completeness, not a citation defect)
- Location: `SPEC-019-feature.spec.md` Edge Cases (EC-04); `SPEC-019-traceability.spec.md` §3
- Description: SPEC-016 v1.2.0 added EC-10/AC-38 (an actor-class-mismatch-and-stale-plan-both-present
  scenario, resolved as `FORBIDDEN` — the actor-class check now runs first, per RT-017's reordering).
  SPEC-019's own EC-04 covers only the actor-class-mismatch case in isolation ("an agent whose
  `delegatedBy` does not match the token's confirmer... rejected... with `FORBIDDEN`") and has no
  edge case mirroring SPEC-016's new combined scenario for the restore action specifically. This is
  not a citation error — SPEC-019 correctly inherits the ordering by full delegation to
  `GatedMutationGateway.execute` and states nothing that contradicts it — but the TDD Agent building
  Recovery's own test suite would currently have no domain-specific edge case prompting it to write a
  restore-specific test for "an agent redeems a stale-plan token it also isn't entitled to redeem,"
  even though the equivalent scenario is now explicitly tested at the SPEC-016 level.
- Suggested resolution: Optionally add an edge case to SPEC-019 mirroring SPEC-016 EC-10/AC-38 for
  the restore action specifically (e.g., "What happens when `backup_execute_restore` is called with a
  token that both fails the actor-class rule and would also recompute to a stale plan hash? Expected
  behavior: `FORBIDDEN`, per SPEC-016 REQ-13/EC-10 — the actor-class rule is evaluated before plan
  re-derivation.") — cheap to add, not required for correctness since the behavior is already
  correctly inherited by citation.

No BLOCKING or new CONSTITUTION_FLAG findings were found in this round beyond RT-009 (carried
forward, not new).

---

## Routing Decision

**0 new BLOCKING findings.** SPEC-016's v1.1.0 → v1.2.0 changes (RT-012 – RT-018) were verified
item-by-item against SPEC-019's Integration Contracts citations; every citation remains accurate,
and none of the new SPEC-016 content (the `'external'`-kind trigger, the `FORBIDDEN.details.reasonCode`
enum, the polymorphic-reference-flavor clarification, the Postgres-tooling clarification, the REQ-14
scope statement, or the actor-class-vs-plan-staleness reordering) contradicts anything SPEC-019
assumes or asserts. RT-006's partial-resolution status is unchanged and re-confirmed still open on
SPEC-016's side, not newly BLOCKING. RT-009's CONSTITUTION_FLAG and RT-010's ADVISORY carry forward
unchanged (SPEC-019 itself was not revised).

Three new ADVISORY findings (RT-011, RT-012, RT-013) were found on this round's fresh pass — a
provenance/documentation staleness in the re-sync note and `depends_on` field, an unstated
"zero write chokepoints" audit gap under REQ-02/AC-34, and an optional test-completeness gap
mirroring SPEC-016's new EC-10/AC-38. None of these rises to BLOCKING: none changes what a test
suite can deterministically assert today, and the underlying behavior in each case is either already
correctly handled (RT-012's actual runtime behavior) or immaterial to correctness (RT-011's metadata
staleness, RT-013's optional mirrored edge case).

**Recommendation: SPEC-019 remains cleared for Software Architect dispatch.** Carry RT-006
(residual, SPEC-016-side gap), RT-009 (CONSTITUTION_FLAG), and RT-010/RT-011/RT-012/RT-013 (ADVISORY)
forward into Software Architect context. None blocks dispatch.
