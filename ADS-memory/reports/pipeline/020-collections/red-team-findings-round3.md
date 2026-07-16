# Red-Team Findings (Round 3): collections

- Feature: FEAT-020-collections
- Spec version: 1.2.0
- Spec hash: sha256:eba25e6e95a82b7c4fe847d16f414f265d768c958d0757088b24d2a0865c9efe
- Red-Team completed: 2026-07-15T02:00:00Z
- Finding count: 1 BLOCKING · 3 ADVISORY · 0 new CONSTITUTION_FLAG (1 carried forward unchanged)
- Prior-round disposition: RT-012 (BLOCKING) — RESOLVED, no residual gap in the exact scenario it named. RT-013, RT-014 (ADVISORY) — RESOLVED.

---

## Pre-flight verification duties

**Mechanical hash re-check:** PASS — re-ran the validator against both packages, did not trust the recorded hashes blindly.
```
python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/020-collections --phase spec --print-hash
→ Feature hash computed: sha256:eba25e6e95a82b7c4fe847d16f414f265d768c958d0757088b24d2a0865c9efe
→ PASS

python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/016-content-admin-core-contract --phase spec --print-hash
→ Feature hash computed: sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981
→ PASS
```
SPEC-020's hash matches `SPEC-020-feature.spec.md`'s header, every sibling file's header, `spec-manifest.md`'s
Validation Notes, and `pipeline-state.md`'s `spec_hash`. SPEC-016's hash matches its own header and traceability
file. No drift on either package.

**Constitution re-check:** `ADS-memory/governance/constitution.md` is still the unfilled template (literal
`[PRINCIPLE NAME]` placeholders). The "N/A, forward-looking flag only" framing in SPEC-020's Constitution
Compliance table and RT-011 remain accurate.

**Mandatory SPEC-016 v1.2.0 re-sync:** SPEC-020's citations were last verified (round 2) against SPEC-016
v1.1.0 (`content_hash: sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`). SPEC-016 is
now v1.2.0 (`content_hash: sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`,
`last_edited: 2026-07-14T23:45:00Z` — edited *before* SPEC-020's own v1.2.0 edit at `2026-07-15T00:30:00Z`, so
SPEC-016 v1.2.0 already existed when SPEC-020 v1.2.0 was authored, yet SPEC-020's own bookkeeping did not pick
up the bump — see RT-018 below). Every citation in SPEC-020's `## Integration Contracts` section was
individually re-diffed against SPEC-016 v1.2.0's current text:

- **Watermark stamping (REQ-01, REQ-02):** REQ-02's exact text ("Any core write chokepoint that wants a write
  to count toward the discarded-write-window disclosure (e.g. Collections' entries/content-types
  write-service...) MUST call the watermark-stamping function inside the same transaction... Each dependent
  domain spec's own `## Integration Contracts` section MUST explicitly name, one by one, every write
  chokepoint...") is unchanged from v1.1.0 in substance and still names Collections explicitly. SPEC-020's
  citation is accurate. REQ-01 gained new explicit 64-bit/overflow-scoping language in v1.2.0, but SPEC-020
  only cites REQ-01 generically ("the watermark-stamping function") — unaffected.
- **Gated-mutation gateway (REQ-08–REQ-15, REQ-22; INV-03, INV-04, INV-05):** REQ-13's actor-class rule text
  and ordering (actor-class check before plan-hash recompute) are unchanged from what round 2 verified. SPEC-016
  gained a new AC-38 formalizing the actor-class-vs-stale-plan tie-break, but this doesn't change the rule
  SPEC-020 cites, only adds test evidence upstream. Accurate.
- **Composite actor identity (REQ-16, REQ-17):** This is the specific area the assignment flagged for scrutiny
  (SPEC-016's own RT-014-area `ActorIdentityRef` expansion). Re-verified `SPEC-016-state.spec.md`'s
  `ActorIdentityRef` entity directly (current file, lines 58–64): fields are still exactly
  `actorWorkspaceId, actorId, delegatedByWorkspaceId, delegatedById`, unchanged from what round 2 confirmed
  against v1.1.0. SPEC-020's `ContentTypeRevision`/`EntryRevision` `delegatedByWorkspaceId`/`delegatedById`
  fields remain a correct match. **No drift in the specific shape SPEC-020 depends on.**
- **Soft cross-boundary reference validation/tolerance (REQ-18; INV-07):** This citation **is** affected by
  v1.2.0 content and gets its own finding — see **RT-017** below (ADVISORY, not a hard citation-accuracy
  failure, but a newly-introduced scope ambiguity).
- **`db-ops` capability shape (REQ-19):** SPEC-016 REQ-19 gained expanded "working"/`'unavailable'` catch-all
  language in v1.2.0 (or was already present — text is materially unchanged from what governs this citation).
  SPEC-020's citation is a forward-compatibility note only, not a live dependency of any of its own ACs.
  Unaffected.
- **"Not cited" carve-out (REQ-03–REQ-07, REQ-20–REQ-21):** Still accurate — these remain Storage/Recovery-owned
  and untouched by Collections in v1.2.0's text.

**Conclusion of the mandatory re-sync:** every citation remains *textually* accurate except REQ-18, which now
raises a genuine scope-applicability question (RT-017, ADVISORY) that did not exist against v1.1.0's shorter
text. Additionally, the dependency-version bookkeeping itself (not the citation content) is stale — see RT-018.

---

## Verdicts on the Round 2 BLOCKING and ADVISORY Findings

### RT-012 (empty `fields: []` submission had no stated floor) — **RESOLVED for the exact scenario it named**

New REQ-26 floor text, `api.spec.md`'s `minItems: 1`, new AC-51, new EC-16, and the new `VALIDATION_ERROR`
(`details.reason='fields_empty'`) error shape all correctly implement "reject an empty array, leave the schema
unchanged." Verified against `state.spec.md`, `orchestrator.spec.md`, `errors.spec.md` — all four files agree.
The specific defect RT-012 named (an empty array silently wiping the schema) cannot occur. **However**, applying
the assignment's mandatory interaction check — "does rejecting first, before other checks, actually hold up
against every other rule that also touches `fields`?" — surfaced two residual issues the RT-012 fix itself
does not cause but that sit immediately adjacent to it:

1. The fields_empty rejection's interaction with the `expectedVersion` optimistic-concurrency check is
   ambiguous (not wrong, ambiguous) — see **RT-016** below.
2. REQ-26 and REQ-27/REQ-29 (the two reindex rules that also govern `UPDATE_CONTENT_TYPE_FIELDS`) do not, in
   combination, cover every point in the field-update matrix — see **RT-015** below (the more significant
   finding this round).

Neither of these is a re-opening of RT-012 itself: the empty-array case RT-012 named is fully and correctly
closed.

### RT-013 (ordinary `queryable` flip had no REQ/INV anchor) — **RESOLVED**

New REQ-29 and INV-10 anchor the plain `queryable` flip (kind unchanged) to testable criteria; new AC-52/AC-53
and EC-17 give it concrete before/after scenarios. Closed for the exact case it named. (REQ-29's narrower
literal scope — "resubmits an existing field" — is exactly what RT-015 below revisits, but that's a fresh
finding about REQ-29's boundary, not a re-opening of the original RT-13 gap, which is fully fixed.)

### RT-014 (`spec-dod.md` B-02 stale version self-reference) — **RESOLVED**

`spec-dod.md`'s header and B-02's Notes cell both now correctly read `1.2.0`/consistent version counts; the
G-05/B-21 P1-count mismatch flagged in the same fix is also corrected (both now read 47). Verified directly
against the current file. Closed.

---

## New Findings (this pass)

### RT-015
- Severity: **BLOCKING**
- Category: contradiction / missing-failure-mode
- Location: REQ-27, REQ-29 (`SPEC-020-feature.spec.md`); `SPEC-020-state.spec.md` §3
  `UPDATE_CONTENT_TYPE_FIELDS` action-row prose; `SPEC-020-orchestrator.spec.md` §4
  `ContentTypeWriteService.updateFields`; INV-09, INV-10
- Description: REQ-27 and REQ-29 are each written as a **mutually exclusive** case: REQ-27 fires "when...kind
  [changes] while that field remains `queryable` both before and after the call (i.e. the `queryable` flag
  itself does not flip)"; REQ-29 fires "when...resubmits an **existing** field with its `queryable` value
  changed...while that field's `kind` does not change." Taken at their literal words, these two requirements do
  not jointly cover two reachable, ordinary scenarios that `UPDATE_CONTENT_TYPE_FIELDS`'s own full-replace
  semantics (REQ-26) explicitly permit:
  1. **A brand-new field, never seen before, is added in the submitted `fields` array with `queryable=true`
     from the start.** This is not a "resubmission" of "an existing field" (REQ-29's own words), so REQ-29
     does not literally apply to it, and no other REQ establishes the obligation to provision its index.
  2. **A single field's `kind` AND `queryable` both change in the same call** (e.g. `kind: integer→real` and
     `queryable: false→true` together). REQ-27 excludes this ("queryable flag itself does not flip"); REQ-29
     excludes this too ("kind does not change"). Neither requirement, as written, governs this combination.

  Despite this, `state.spec.md`'s own descriptive prose for `UPDATE_CONTENT_TYPE_FIELDS` asserts complete
  coverage and explicitly attributes it to REQ-29: "...provisions indexes for any newly `queryable` field
  (**whether newly added or resubmitted with `queryable` flipped `false→true`, REQ-29**)..." — citing REQ-29 for
  exactly the "newly added" case that REQ-29's own normative text (in `feature.spec.md`) does not establish.
  This is the same defect shape round 1's RT-005 found BLOCKING: a contract file (here, `state.spec.md`) claims
  a REQ number anchors a specific behavior, and the REQ's actual words fall short of that claim. A TDD Agent
  who binds test certification to REQ-27's and REQ-29's literal text — exactly what the Test Design skill
  requires ("tests are written against a specific spec version...they certify what they were written against")
  — has no REQ to certify a test against for either of the two scenarios above. Confirmed no AC or EC covers
  either scenario either: AC-52/AC-53/EC-17 only exercise a pure `queryable` flip with `kind` held constant;
  AC-43/EC-12 only exercise a pure `kind` change with `queryable` held constant at `true`. Neither a
  brand-new-queryable-field-via-update test nor a combined-kind-and-queryable-change test has a REQ/AC anchor
  anywhere in this package.

  This is a reachable, non-hypothetical gap, not an exotic edge case — adding a new field with `queryable=true`
  in the same call that adds it, and changing a field's type while also toggling its searchability, are both
  ordinary uses of the "full-replace" update endpoint this spec already builds (REQ-26). If an implementer
  wires index provisioning strictly off REQ-27's and REQ-29's literal trigger conditions (which is exactly what
  spec-driven implementation is supposed to encourage), a newly-added queryable field or a combined-change field
  would silently end up with no index — violating INV-10's general "iff" statement with no test in place to
  catch it.
- Suggested resolution: Either broaden REQ-27/REQ-29 (or add a new REQ-30) to explicitly state the residual
  cases — "a field newly introduced by a full-replace `fields` submission with `queryable=true` MUST have its
  index provisioned in the same transaction, identically to registration-time provisioning (REQ-01/REQ-06)"
  and "a field whose `kind` and `queryable` both change in the same call MUST have its index state resolved
  according to its *post-call* `queryable` value and `kind` (i.e., REQ-27 and REQ-29 combine, not exclude, when
  both conditions hold simultaneously)" — with a matching AC and EC for each. Then correct `state.spec.md`'s
  citation so it no longer attributes "newly added" coverage to REQ-29 alone.

---

### RT-016
- Severity: ADVISORY
- Category: ambiguity
- Location: `SPEC-020-state.spec.md` §3 `UPDATE_CONTENT_TYPE_FIELDS` Precondition column; `SPEC-020-orchestrator.spec.md`
  §5 `onBeforeContentTypeWrite` Lifecycle Hook; REQ-26
- Description: This is precisely the RT-012-fix interaction check the assignment asked for, applied to a
  precondition other than the field-level guards. `state.spec.md`'s Precondition cell for
  `UPDATE_CONTENT_TYPE_FIELDS` lists, in this textual order: "`expectedVersion` matches current `version`;
  when `fields` is present it MUST contain at least 1 entry — a present-but-empty `fields: []` is rejected...
  **before any other precondition below is evaluated** (REQ-26)..." Read literally, "below" refers only to the
  items listed *after* the fields_empty clause in this same cell (the per-field guards, the queryable cap) —
  not to `expectedVersion`, which appears *before* it in the same list. This reading implies `expectedVersion`
  is checked first.

  `orchestrator.spec.md`'s Lifecycle Hooks table, however, describes the same action's check sequence as:
  "for `op='update-fields'`, **first** checks a present `fields` array is non-empty (REQ-26) — a `fields: []`
  submission fails here **before the guard order below ever runs**; then runs the fixed guard order from
  REQ-24..." — this sentence never mentions `expectedVersion` at all, and its "first" framing, read in
  isolation, would suggest the fields_empty check is the very first thing evaluated for an update call,
  including before the version check.

  REQ-26's own normative text only states the fields_empty rejection happens "before any per-field guard or
  the queryable-cap check runs" — it is silent on where the `expectedVersion` check falls relative to it. No
  AC or EC anywhere in the package exercises the combined scenario (a call submitting both a stale
  `expectedVersion` and an empty `fields: []` array). Two competent developers reading these three sources
  together would diverge on which error code such a call returns — a version-conflict error, or
  `VALIDATION_ERROR` (`details.reason='fields_empty'`) — and neither reading contradicts REQ-26's own literal
  words. This does not threaten data integrity (the call is rejected either way, no schema mutation occurs
  under either reading), so it is not escalated to BLOCKING, but it is a genuine, testable ambiguity a TDD
  Agent would have no way to resolve from the spec alone.
- Suggested resolution: State explicitly, in REQ-26 or a new sentence in the `UPDATE_CONTENT_TYPE_FIELDS`
  Precondition row, whether the fields_empty check runs before or after the `expectedVersion` match (the
  optimistic-concurrency convention in most systems checks the version guard first, since it is the cheapest,
  most fundamental precondition — but either choice is acceptable as long as it's stated), and add one AC
  covering the combined-failure scenario so the two contract files stop giving different signals.

---

### RT-017
- Severity: ADVISORY
- Category: ambiguity (citation scope, newly surfaced by SPEC-016 v1.2.0's own content change)
- Location: `SPEC-020-feature.spec.md` `## Integration Contracts`, "Soft cross-boundary reference
  validation/tolerance (SPEC-016 REQ-18; INV-07)" bullet; SPEC-016 `SPEC-016-feature.spec.md` REQ-18 (current
  v1.2.0 text)
- Description: SPEC-016 REQ-18's text, as it now stands in v1.2.0, names exactly two flavors of "soft,
  cross-boundary reference" in its parenthetical: "(a composite actor identity across a physical file
  boundary, or a polymorphic content reference such as `(workspaceId, contentType, contentId)`)" — and then
  states explicitly, in newly-expanded language: "The polymorphic-content-reference flavor has no concrete
  instance in this contract's own schema — every concrete polymorphic reference table (e.g. `entry_terms`) is
  owned and instantiated entirely by the dependent domain spec that defines it." This explicitly names
  `entry_terms` (Categories & Tags, SPEC-018) as the flavor's only real example.

  SPEC-020's own citation applies REQ-18 directly to `entries.type`'s soft reference to `content_types.key`:
  "This spec's REQ-19/AC-29/AC-30 instantiate that rule for this specific reference shape." But
  `entries.type → content_types.key` is neither of REQ-18's two named example flavors: it is not a composite
  actor-identity reference (REQ-16/REQ-17's territory), and it is not "polymorphic" in the sense REQ-18's own
  example illustrates (a single row's target type varies, e.g. `entry_terms`'s `contentType` selecting among
  heterogeneous tables) — `entries.type` always references exactly one fixed target table
  (`content_types`), never a heterogeneous set. It is a third, plainer flavor: a single-target-type soft
  reference within the same physical `content.db` file (SPEC-020's own citation already establishes both
  tables share that file).

  This does not change SPEC-020's actual behavioral obligation — REQ-19's write-time validation/read-time
  tolerance rule is sound and correctly implemented regardless of which REQ-18 sub-flavor it is understood to
  instantiate — but the v1.2.0 REQ-18 text's new explicit narrowing ("no concrete instance...every concrete
  polymorphic reference table...is `entry_terms`") makes it newly ambiguous whether REQ-18's general opening
  sentence ("Any soft, cross-boundary reference...MUST have its target existence and workspace ownership
  validated...") is meant to extend, by its general wording, to this third un-named flavor, or whether the two
  parenthetical examples are meant to be the exhaustive scope of what REQ-18 covers (in which case SPEC-020's
  citation would need a different anchor, or REQ-18 would need a third named flavor). This ambiguity did not
  exist against v1.1.0's shorter REQ-18 text and is a direct product of SPEC-016's own v1.2.0 revision — exactly
  the drift class the assignment's mandatory re-sync was designed to catch.
- Suggested resolution: Either have SPEC-016 add a third named flavor to REQ-18's parenthetical (a plain
  single-target-type soft reference, e.g. "or a plain soft reference to a single fixed target table, such as
  `entries.type → content_types.key`"), or have SPEC-020 state explicitly that its `entries.type` reference
  instantiates REQ-18's general opening rule independent of either named example flavor, rather than implying
  it is an instance of the "polymorphic content reference" flavor specifically.

---

### RT-018
- Severity: ADVISORY
- Category: ambiguity (staleness, self-referential bookkeeping — not a citation-content-accuracy failure)
- Location: `SPEC-020-spec-manifest.md` Header Metadata / Purpose paragraph ("`depends_on: SPEC-016 v1.1.0`
  (`content_hash: sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`)"); `pipeline-state.md`
  `depends_on` field (same stale v1.1.0 pin)
- Description: SPEC-016 was revised to v1.2.0 (`content_hash: sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`,
  `last_edited: 2026-07-14T23:45:00Z`) *before* SPEC-020's own v1.2.0 revision was authored
  (`last_edited: 2026-07-15T00:30:00Z`). Despite this, `SPEC-020-spec-manifest.md`'s header and Purpose text,
  and `pipeline-state.md`'s `depends_on` field, still declare `SPEC-016 v1.1.0` and its superseded hash as the
  dependency version — neither was bumped when SPEC-020's v1.2.0 revision was written, even though this
  round's mandatory re-sync (above) confirms the *content* of every citation was in fact checked against the
  live v1.2.0 text at authoring time (round 2's own re-check log already references v1.1.0-era details
  accurately). This is the same class of self-referential bookkeeping staleness as round 1's RT-009 (an
  already-resolved upstream fact presented as pending) and round 2's RT-014 (a stale version string in an
  adjacent file) — and this exact `depends_on` field has been bumped once before in this same pipeline
  (`pipeline-state.md`'s own Notes record: "bumped from the v1.0.0 dependency this pipeline-state previously
  recorded"), so there is direct precedent for keeping it current that wasn't followed this round.
- Suggested resolution: Update `SPEC-020-spec-manifest.md`'s `depends_on` line and `pipeline-state.md`'s
  `depends_on` field to `SPEC-016 v1.2.0` (`content_hash: sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`),
  matching the version this round's re-sync actually verified against.

---

## CONSTITUTION_FLAG Findings

### RT-011 (carried forward, unchanged from rounds 1 and 2)
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: I — Library-First (template placeholder name; default heuristic equivalent)
- Location: REQ-04, REQ-06; `SPEC-020-behavior.spec.md` §3/§4 (kind→CAST lookup, index-name construction)
- Description: Unchanged — re-verified still accurate against the current v1.2.0 spec text. The core-mediated
  `kind`→`CAST` lookup table and workspace-scoped index-name construction remain a bespoke, hand-rolled
  dynamic-DDL-generation layer, reasonably justified by the injection-safety requirement (REQ-04/INV-04), but
  exactly the shape of thing a ratified Library-First article would ask the Architect to justify against
  Drizzle's existing typed-column/cast API (ADR-015).
- Architect note: Unchanged — prepare a Complexity Justification entry for the ADR showing why the fixed
  `kind→CAST` lookup table is hand-rolled rather than routed through Drizzle's typed-column API, even though no
  constitution article is live yet to force this.

---

## Routing Decision

**1 new BLOCKING finding (RT-015).** This is below the persona's 3-or-more "systemic quality problem, stop and
route back wholesale" threshold. However, a BLOCKING finding by definition still means **the spec must be
revised before Software Architect dispatch** for the specific item it names: RT-015's residual gap in
REQ-27/REQ-29's mutual-exclusivity boundary (brand-new queryable field via update; combined kind+queryable
change in one call) must be closed — with a matching REQ text change (or new REQ) and AC/EC — before this
package is cleared for `/plan`.

**Recommendation:** Route RT-015 back to the Spec Agent for a narrow, single-issue fix (not a full revision
cycle) — extend REQ-27/REQ-29 (or add REQ-30) to cover the two residual scenarios explicitly, add one AC and
one EC for each, and correct `state.spec.md`'s misattributed "REQ-29" citation for the "newly added field"
case. RT-016, RT-017, and RT-018 (ADVISORY) should be folded into the same small revision pass since all three
are quick, precise fixes, but none of them block dispatch on their own. RT-011 (CONSTITUTION_FLAG) carries
forward unchanged into Software Architect context once RT-015 is closed and this spec is re-cleared.

All prior round-2 findings (RT-012, RT-013, RT-014) are verified RESOLVED in this pass for the exact scenarios
they named — none require further spec action beyond what RT-015/RT-016 (adjacent, newly-surfaced issues) now
raise.
