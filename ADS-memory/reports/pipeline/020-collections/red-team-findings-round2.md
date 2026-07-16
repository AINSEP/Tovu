# Red-Team Findings (Round 2): collections

- Feature: FEAT-020-collections
- Spec version: 1.1.0
- Spec hash: sha256:26782f655075384c4f743e04d9fe6224e3eb121bafd7fba49e69ed26776f40d8
- Red-Team completed: 2026-07-14T23:45:00Z
- Finding count: 1 BLOCKING · 3 ADVISORY · 0 CONSTITUTION_FLAG (new, this pass)
- Prior-round disposition: 5/5 BLOCKING RESOLVED · 5/5 ADVISORY RESOLVED · 1/1 CONSTITUTION_FLAG correctly carried forward unchanged

---

## Pre-flight verification duties

**Mechanical hash re-check:** PASS — re-ran the validator, did not trust the recorded hash blindly.
```
python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/020-collections --phase spec --print-hash
→ Feature hash computed: sha256:26782f655075384c4f743e04d9fe6224e3eb121bafd7fba49e69ed26776f40d8
→ PASS: strict Speckit package passed mechanical validation.
```
Matches `SPEC-020-feature.spec.md`'s header, `SPEC-020-spec-manifest.md`'s Validation Notes, and
`pipeline-state.md`'s `spec_hash` exactly. No drift.

**Integration Contracts citation-accuracy re-check (against SPEC-016 v1.1.0's current text,
`content_hash: sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`):** PASS on
textual accuracy. Every cited id (REQ-01, REQ-02, REQ-08–REQ-19, REQ-22; INV-03, INV-04, INV-05,
INV-07) was individually diffed against SPEC-016's current requirement/AC/invariant text and every
citation correctly states what that id actually says, including the newer SPEC-016 v1.1.0 details
(exact 600-second token TTL at REQ-10, REQ-13's `FORBIDDEN` actor-class-redemption coverage, the
formal `ActorIdentityRef` entity in SPEC-016 `state.spec.md` — confirmed present verbatim at
`SPEC-016-state.spec.md:53-59` with fields `actorWorkspaceId`, `actorId`, `delegatedByWorkspaceId`,
`delegatedById`, matching what SPEC-020 claims it added to `ContentTypeRevision`/`EntryRevision`).
One pre-existing quality nit surfaced during this check — see RT-013 below (not a citation-accuracy
failure; a phrasing clarity issue in how REQ-17's applicability is explained).

**OQ-04 rewrite accuracy re-check:** PASS. SPEC-020's OQ-04 now reads "**Resolved** — inherited
directly from SPEC-016's own OQ-04, which is itself marked 'Resolved 2026-07-14 (Coordinator
fold-back from SPEC-017)'... a second `confirm()` call for the same still-valid `planId`/`planHash`
mints an independent additional single-use token; the first token remains valid until it is
separately redeemed or expires." This is verified against SPEC-016's actual current OQ-04 text
(`SPEC-016-feature.spec.md` lines 447–456): "**Resolved 2026-07-14 (Coordinator fold-back from
SPEC-017).** A second `confirm()` call for the same still-valid `planId`/`planHash` mints an
independent additional single-use token; the first token remains valid until it is separately
redeemed or expires. This is the contract's single global answer..." — SPEC-020's paraphrase is an
accurate restatement, not a distortion, and correctly drops the Owner/Resolve-by framing since the
question genuinely has no further pending action. **Confirmed accurate.**

**Constitution re-check:** `ADS-memory/governance/constitution.md` is still the unfilled template
(literal `[PRINCIPLE NAME]` placeholders, no ratified articles) — the "N/A, forward-looking flag
only" framing in both SPEC-020's Constitution Compliance table and the carried-forward RT-011 remain
accurate. No live constitution violation exists.

---

## Verdicts on the 5 Prior BLOCKING Findings

### RT-001 (full-replace vs. merge-by-name for `CONTENT_TYPE_UPDATE_FIELDS.fields`) — **RESOLVED, with a new edge case (see RT-012 below)**
New REQ-26 states explicitly: "the `fields` array... MUST be treated as a full-replacement list of
the content type's entire field set, never a merge-by-name patch." `state.spec.md`'s
`UPDATE_CONTENT_TYPE_FIELDS` action row, `orchestrator.spec.md` §2.1/§4, and `api.spec.md`'s
`CONTENT_TYPE_UPDATE_FIELDS` body all consistently restate full-replace. AC-41/AC-42 cover the
"omit one field" and "cap checked against submitted array alone" cases concretely. The core ambiguity
Red-Team raised in round 1 is gone. However, applying the fresh-pass mandate to specifically probe
the REQ-05/REQ-26 interaction surfaced a still-open edge case at the extreme end of "omission" —
submitting an **empty** `fields` array — which is not the same question RT-001 asked and is not
covered by AC-41/AC-42. See **RT-012** (new BLOCKING) below.

### RT-002 (update/publish/unpublish vs. a non-active content type) — **RESOLVED**
New REQ-28 states the decision precisely: blocked with `CONTENT_TYPE_NOT_ACTIVE` only for
`tombstone`; fully permitted for `deprecated`. New AC-44/AC-45/AC-46 cover reject-on-tombstone
(update), reject-on-tombstone (publish/unpublish, with explicit "no outbox event enqueued" language
closing the exact risk Red-Team named), and accept-on-deprecated. `orchestrator.spec.md` §4's
failure-code lists for `.update`/`.publish`/`.unpublish` now include `CONTENT_TYPE_NOT_ACTIVE`
explicitly (previously only `.create` had it). `behavior.spec.md` §2.4 adds an explicit ordering rule
(tombstone-check runs before any other precondition) and correctly states the "inverse relationship"
to REQ-10. Fully closed.

### RT-003 (kind change on a still-queryable field has no reindex rule) — **RESOLVED**
New REQ-27 requires teardown + re-provision in the same transaction when a field's `kind` changes
while `queryable` stays `true` across the call, explicitly stating this must never be a no-op "only
[triggered by] the former [flag flip]." New INV-09 makes this an absolute invariant ("a `queryable`
field's live index must never reference a `CAST` mapping for a `kind` other than that field's current
`kind`"). New AC-43 gives a concrete before/after scenario (`integer`→`real`). Fully closed.

### RT-004 (`ContentTypeRevision`/`EntryRevision` missing `delegatedByWorkspaceId`/`delegatedById`) — **RESOLVED**
Both entities in `state.spec.md` §2 now carry `delegatedByWorkspaceId`/`delegatedById` with clear
inline comments citing SPEC-016 REQ-16's `ActorIdentityRef` shape. Cross-checked against SPEC-016's
actual `ActorIdentityRef` definition (`SPEC-016-state.spec.md` lines 53–59:
`actorWorkspaceId, actorId, delegatedByWorkspaceId, delegatedById`) — field names and nullability
match. New AC-47/AC-48 give concrete agent-delegated / api_key-delegated test scenarios. REQ-08 and
REQ-16 were amended to state the obligation in the requirement text itself, not just the entity
comment. Fully closed. (Note: SPEC-020's revision tables name the row-tenant column `workspaceId`
rather than `actorWorkspaceId` — this is intentional and licensed by SPEC-016's own INV-06, which
establishes that a core-mediated actor's own workspace always equals the referencing row's workspace
by default; it is not a residual gap.)

### RT-005 (`behavior.spec.md` §7 claimed kind-conformance was "part of REQ-14" but REQ-14's text didn't say so) — **RESOLVED**
REQ-14's normative text now explicitly lists both the envelope-shape check and the "a supplied field
value's runtime type does not conform to that field's declared `kind`" clause, with an explicit
statement of check ordering (envelope shape first). New AC-49 (kind-conformance) and AC-50 (envelope
shape) anchor both clauses to a testable AC. `traceability.spec.md` §1 now has rows for both. Fully
closed.

---

## Verdicts on the 5 Prior ADVISORY Findings

### RT-006 (User Journey step 2 ordering contradicted REQ-24) — **RESOLVED**
Step 2's parenthetical now reads "(key grammar, reserved-key check, field-name grammar, field-kind
enum, queryable-field cap)" — this now matches REQ-24 and `behavior.spec.md` §2.1's fixed order
exactly (previously it had reserved-key before grammar).

### RT-007 (AC-38's grammar was malformed) — **RESOLVED**
AC-38 is now a single well-formed Given/When/Then sentence with a correct causal chain
(key-grammar-passes → reserved-key-is-next-guard → reserved-key-fails-and-is-reported →
field-name-grammar-never-evaluated). Clean.

### RT-008 (`fieldsJson` envelope shape only in a free-text description) — **RESOLVED**
`api.spec.md` §5 now defines a typed `FieldsJsonEnvelope` Contract Definition, referenced from
`ENTRY_CREATE`/`ENTRY_UPDATE`/`ENTRY_VALIDATE_FIELDS`'s request bodies, and the malformed-payload case
is now covered by REQ-14 + AC-50 rather than left to inference.

### RT-009 (OQ-04 presented an already-resolved upstream question as still-open) — **RESOLVED**
Verified above under "OQ-04 rewrite accuracy re-check" — accurate and current.

### RT-010 (REQ-17 citation didn't state whether Collections' tables share a physical DB with `principals`) — **RESOLVED, with a minor residual phrasing nit**
The Integration Contracts section now states plainly that `content_type_revisions`/`entry_revisions`
share `content.db` with `principals` (verified against ADR-021, which states identity "lives per-site
in `content.db`," the same per-site database Collections' own tables live in per this project's
overall SQLite-per-site model). The core ambiguity RT-010 flagged is closed. A small residual
phrasing wrinkle remains — see **RT-013** below (ADVISORY, not a re-opening of RT-010).

---

## New Findings (this pass)

### RT-012
- Severity: **BLOCKING**
- Category: ambiguity / missing-failure-mode
- Location: REQ-26; `SPEC-020-api.spec.md` §4 `CONTENT_TYPE_UPDATE_FIELDS` body (`fields` — no
  `minItems`); `SPEC-020-state.spec.md` §3 `UPDATE_CONTENT_TYPE_FIELDS`; contrast with
  `CONTENT_TYPE_CREATE`'s `fields: { minItems: 1 }`
- Description: This is precisely the interaction the assignment asked to probe — does REQ-05's cap
  check interact correctly with REQ-26's full-replace removal semantics in every combination? Most
  combinations are handled (AC-41 covers omitting one field of several; AC-42 covers the cap being
  checked against the submitted array alone), but the extreme case of the submitted `fields` array
  being **present but empty** (`fields: []`) is not addressed by any REQ, AC, or EC. Per REQ-26's
  literal text ("the content type's `fieldsSchemaJson` becomes exactly the submitted `fields`
  array"), an empty array would legally reduce a content type to zero fields — including silently
  dropping any field currently marked `required`. Nothing in the guard chain stops this: REQ-24's
  fixed guard order (key grammar → reserved-key → field-name grammar → field-kind → queryable-cap)
  iterates per-field checks zero times against an empty array, and the queryable-cap check
  (`0 <= 20`) trivially passes. `CONTENT_TYPE_CREATE`'s request contract enforces `minItems: 1` on
  `fields` (registration requires at least one field), but `CONTENT_TYPE_UPDATE_FIELDS`'s `fields`
  carries no equivalent floor — an asymmetry with no stated justification. Two competent developers
  would diverge here: one would mirror `CONTENT_TYPE_CREATE`'s `minItems: 1` and reject `fields: []`
  with `VALIDATION_ERROR` (or a dedicated code), reasoning that a fieldless content type is a
  degenerate, almost certainly unintended state; another would implement REQ-26 literally and accept
  it, reasoning that "full replacement, no separate `removeFields` mechanism" was stated as an
  unqualified rule with no floor carved out. Neither reading is "wrong" given what the spec currently
  says — which is exactly the kind of two-developer divergence the Red-Team persona's ambiguity probe
  exists to catch. This also silently strips a `required` field with no distinct warning/error path,
  which is a missing-failure-mode gap layered on top of the ambiguity.
- Suggested resolution: State explicitly in REQ-26 (or a new REQ) whether a submitted `fields` array
  may be empty. If the intent is to disallow it (recommended, for symmetry with
  `CONTENT_TYPE_CREATE`'s `minItems: 1` and to avoid an accidental total-schema-wipe via a single
  malformed agent-tool call), add `minItems: 1` to `CONTENT_TYPE_UPDATE_FIELDS`'s `fields` contract in
  `api.spec.md` §4, add a rejection AC, and give it an explicit error code (or reuse
  `VALIDATION_ERROR` with a named `details.reason`). If the intent is to allow it, state that
  explicitly as a deliberate design decision with an AC covering "all fields removed via an empty
  `fields` array succeeds and the content type has zero fields" so a TDD Agent has something to
  certify a test against either way.

---

### RT-013
- Severity: ADVISORY
- Category: untestable (missing REQ/INV anchor for an existing, load-bearing behavior)
- Location: `SPEC-020-state.spec.md` §3 `UPDATE_CONTENT_TYPE_FIELDS` action row ("drops indexes for
  any field removed from `queryable`... provisions indexes for any newly `queryable` field");
  `SPEC-020-orchestrator.spec.md` §4 `ContentTypeWriteService.updateFields`
- Description: This wording predates v1.1.0 (round 1's RT-001 quoted it verbatim as already-existing
  text) and was not itself flagged in round 1, so it is not a regression introduced by this revision.
  But the fresh-pass mandate to apply the full attack-vector set surfaces it now for a specific
  reason: this revision added REQ-27 and INV-09 to give the "`kind` change while staying `queryable`"
  reindex case its own explicit REQ+invariant anchor, which makes the *ordinary* case — a field's
  `queryable` flag simply flipping `true→false` (or `false→true`) with no `kind` change, whether by
  explicit resubmission or by full-replace omission — stand out by contrast as the one index-mutation
  trigger in this action row with no REQ or INV number attached anywhere in `feature.spec.md`. A TDD
  Agent writing a certification test for "ordinary queryable flip on update tears down/provisions the
  index" would have no REQ/AC id to bind that test's certification to — the same class of gap RT-005
  described (a behavioral claim asserted in a contract file but not anchored in the numbered
  requirement text), just one level less severe since there is no contradicting REQ text here (unlike
  RT-005, where REQ-14's actual words fell short of what `behavior.spec.md` claimed).
- Suggested resolution: Either fold the ordinary queryable-flip index-provisioning/teardown obligation
  into REQ-05's or REQ-06's text explicitly (e.g., "...and whenever an existing field's `queryable`
  value changes on either a register or an update-fields call, the write chokepoint MUST provision or
  tear down that field's index in the same transaction"), or add a small new REQ dedicated to it,
  with a matching AC. This is not a blocking gap today because the state/orchestrator contract files
  already describe the behavior in enough detail for an implementer to build it correctly — the gap
  is purely in traceability/certification anchoring, not in behavioral clarity.

---

### RT-014
- Severity: ADVISORY
- Category: ambiguity (internal consistency, self-referential — not a normative spec-content issue)
- Location: `SPEC-020-spec-dod.md` item B-02
- Description: B-02's Notes column reads `"1.0.0"` while the same row's own Status is `PASS` for the
  claim "version is set to correct semver," and every other file in the package (including this same
  `spec-dod.md`'s own Header Metadata table one section above) states `version: 1.1.0`. This is a
  stale artifact from the v1.0.0 DoD pass that was not updated when the DoD file's other rows (B-15,
  B-18, B-21, B-24, B-26 etc.) were correctly bumped to reflect the v1.1.0 REQ/AC/INV/EC counts. It is
  not a normative requirement-text problem and does not affect implementability, but it is a real,
  literal self-contradiction inside the DoD artifact's own row, and DoD checklists exist specifically
  to be trustworthy at face value without a reader needing to cross-check every cell against the
  header.
- Suggested resolution: Update B-02's Notes cell to `"1.1.0"` to match the header and the rest of the
  file.

---

## CONSTITUTION_FLAG Findings

### RT-011 (carried forward, unchanged from round 1)
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: I — Library-First (template placeholder name; default heuristic equivalent)
- Location: REQ-04, REQ-06; `SPEC-020-behavior.spec.md` §3/§4 (kind→CAST lookup, index-name
  construction)
- Description: Unchanged from round 1 — re-verified still accurate against the current spec text.
  The core-mediated `kind`→`CAST` lookup table and workspace-scoped index-name construction remain a
  bespoke, hand-rolled dynamic-DDL-generation layer, reasonably justified by the injection-safety
  requirement (REQ-04/INV-04), but exactly the shape of thing a ratified Library-First article would
  ask the Architect to justify against Drizzle's existing typed-column/cast API (ADR-015).
- Architect note: Unchanged — prepare a Complexity Justification entry for the ADR showing why the
  fixed `kind→CAST` lookup table is hand-rolled rather than routed through Drizzle's typed-column API,
  even though no constitution article is live yet to force this.

---

## Routing Decision

**1 new BLOCKING finding (RT-012).** This is below the Red-Team persona's 3-or-more "systemic quality
problem, stop and route back wholesale" escalation threshold — the package is not in the state it was
in at round 1 (5 BLOCKING). However, a BLOCKING finding by definition still means **the spec must be
revised before Software Architect dispatch** for the specific item it names: RT-012 must be resolved
(pick full-replace-allows-empty or full-replace-requires-minItems-1, state it explicitly, add the
matching AC and, if rejecting, an error code) before this spec is cleared for `/plan`.

**Recommendation:** Route RT-012 back to the Spec Agent for a narrow, single-issue fix (not a full
revision cycle) — add the missing floor decision to REQ-26/`api.spec.md`, plus one new AC. RT-013 and
RT-014 (ADVISORY) should be folded into the same small revision pass since both are quick, precise
fixes, but do not themselves block dispatch. RT-011 (CONSTITUTION_FLAG) carries forward unchanged into
Software Architect context once RT-012 is closed and this spec is re-cleared.

All prior BLOCKING and ADVISORY findings from round 1 (RT-001 through RT-010) are verified RESOLVED
in this pass — none require further spec action. RT-011 is correctly unchanged.
