# Red-Team Findings: collections

- Feature: FEAT-020-collections
- Spec version: 1.0.0
- Spec hash: sha256:e206a5c22ae6fb7c66d7b397eb69698ee5f22e1c30d09333642af5ae646af882
- Red-Team completed: 2026-07-14T22:15:00Z
- Finding count: 5 BLOCKING · 5 ADVISORY · 1 CONSTITUTION_FLAG

---

## Pre-flight verification duties (per Coordinator directive)

**Leftover "SPEC-003"/"003-collections" string check:** CLEAN. `grep -rn "SPEC-003\|003-collections\|FEAT-003-collections"` across
`ADS-memory/specs/020-collections/` and `ADS-memory/reports/pipeline/020-collections/` returns zero hits. The two "003-*" strings that
do appear in `SPEC-020-spec-dod.md` (B-01) and `SPEC-020-feature.spec.md` (Implementation Readiness Gate) are legitimate audit trail —
they record that `ADS-memory/specs/003-*` and `ADS-memory/reports/pipeline/003-*` were checked and found absent before SPEC-020 was
assigned its number, not leftover rename artifacts. Separately verified that the repo's real, pre-existing `SPEC-003`
(`ADS-project-knowledge/specs/003-site-install-dir/`) is unrelated to Collections and is correctly left alone — no cross-contamination
in either direction. `ADR-043-collections.md` (Collections' own ADR) contains zero "SPEC-003" references. No other spec package in
`ADS-memory/specs/` misattributes SPEC-020 content to SPEC-003 or vice versa.

**Content_hash cross-check:** PASS — re-derived, not trusted blindly. Ran the actual mechanical validator:
```
python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/020-collections --phase spec --print-hash
→ Feature hash computed: sha256:e206a5c22ae6fb7c66d7b397eb69698ee5f22e1c30d09333642af5ae646af882
→ PASS: strict Speckit package passed mechanical validation.
```
This matches the `content_hash` recorded in `SPEC-020-feature.spec.md`'s header, `SPEC-020-spec-manifest.md`'s Validation Notes, and
`pipeline-state.md`'s `spec_hash` field exactly. No drift.

**Integration Contracts citation-accuracy check (against SPEC-016's current, post-edit content):** PASS on textual accuracy — every
SPEC-016 REQ/AC/INV id SPEC-020 cites (`## Integration Contracts`: REQ-01, REQ-02, REQ-08–REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-22;
INV-03, INV-04, INV-05, INV-07) was individually diffed against SPEC-016-feature.spec.md's current text (content_hash
`sha256:0d527b31e34a595a0c3c8b0715e9134c97ac1bc7389af21f4212d3f395157142`, last_edited `2026-07-14T20:00:00Z`) and every citation
correctly quotes/paraphrases what that id actually says — including REQ-02's verbatim naming of "Collections' entries/content-types
write-service" as a required watermark caller, and REQ-22's exact plan/execute-callable-confirm-never rule. The "Not cited" carve-out
(REQ-03–REQ-07, REQ-20–REQ-21 as Storage/Recovery-owned) is also accurate. **However**, two independent problems surfaced during this
check that are *not* citation-text-accuracy failures but real defects — see RT-004 (SPEC-020 cites REQ-16 accurately but its own
`state.spec.md` doesn't implement the shape REQ-16 requires) and RT-009 (SPEC-020's own Open Questions section, not the Integration
Contracts section, treats SPEC-016's OQ-04 as still-unresolved when SPEC-016 already resolved it earlier in this same session).

---

## BLOCKING Findings

5 findings. Per the Red-Team persona's escalation rule, 3+ BLOCKING findings means **stop and route back to Spec Agent** — this
package has a systemic quality problem, not a small patch list.

### RT-001
- Severity: BLOCKING
- Category: ambiguity
- Location: `SPEC-020-api.spec.md` §4 `CONTENT_TYPE_UPDATE_FIELDS`; `SPEC-020-state.spec.md` §3 `UPDATE_CONTENT_TYPE_FIELDS`; `SPEC-020-orchestrator.spec.md` §4 `ContentTypeWriteService.updateFields`; REQ-05
- Description: The `fields` array in `PATCH /content-types/{key}` is never specified as full-replace vs. merge-by-`name`. `state.spec.md`'s action row says the update "drops indexes for any field removed from `queryable`, provisions indexes for any newly `queryable` field" — but this is consistent with either interpretation: (a) `fields` is a complete replacement list, so any existing field simply absent from the payload is deleted from the schema (which is also the only stated mechanism by which REQ-15's "field removed from schema" scenario could ever occur), or (b) `fields` is a partial merge by field name, existing fields not mentioned are left untouched, and there is no way to delete a field through this endpoint at all. Two competent developers would diverge on this and produce materially different behavior for REQ-05's queryable-cap arithmetic (is the cap checked against the submitted array alone, or against submitted-plus-untouched-existing fields?) and for whether REQ-15's orphaned-field scenario is even reachable.
- Suggested resolution: State explicitly in REQ-03/REQ-05 or a new REQ whether `CONTENT_TYPE_UPDATE_FIELDS.fields` is full-replace or merge-by-name, and if merge, define the delete mechanism (e.g. an explicit `removeFields: string[]` list) explicitly rather than leaving field removal implicit.

### RT-002
- Severity: BLOCKING
- Category: missing-failure-mode
- Location: REQ-10, REQ-11; `SPEC-020-orchestrator.spec.md` §4 `EntryWriteService.update` / `.publish` / `.unpublish`
- Description: REQ-10 blocks only *creation* of a new entry against a `deprecated` content type ("refuse creation of a new entry of that type ... while continuing to allow reads"). Nothing in the spec states whether `UPDATE_ENTRY`, `PUBLISH_ENTRY`, or `UNPUBLISH_ENTRY` may still run against an *existing* entry whose owning content type has since become `deprecated` or, more importantly, `tombstone`. The orchestrator's failure-code lists for `.update`/`.publish`/`.unpublish` (`orchestrator.spec.md` §4) do not include `CONTENT_TYPE_NOT_ACTIVE` at all — only `.create` does — which reads as an implicit "updates/publishes are still allowed," but this is never stated as a deliberate decision. This directly undermines REQ-11's own guarantee that a tombstoned type's entries are "excluded from any public-facing serving surface": if an admin (or an agent holding `admin.collections.manage`) can still call `collections_entry_publish` against an entry of a tombstoned type, a fresh `entry.published` outbox event fires for content the spec elsewhere treats as retired.
- Suggested resolution: Add an explicit REQ stating whether update/publish/unpublish are permitted, blocked, or blocked-only-for-tombstone (not deprecated) against a non-`active` content type, with a matching AC and error code in the failure-code list for each of the three actions.

### RT-003
- Severity: BLOCKING
- Category: missing-failure-mode
- Location: REQ-04, INV-04; `SPEC-020-state.spec.md` §3 `UPDATE_CONTENT_TYPE_FIELDS`
- Description: A field that stays `queryable=true` across an `UPDATE_CONTENT_TYPE_FIELDS` call but has its `kind` changed (e.g. `text` → `integer`) is never addressed. The action row only describes index provisioning/teardown triggered by a `queryable` flag *flip*, not by a `kind` change on a field that remains queryable. Given REQ-04's core-owned `kind → CAST(...)` lookup table is exactly the mechanism this spec relies on for both correctness and injection-safety, a field whose `kind` changes without a corresponding index rebuild would leave a live index built against a stale `CAST` expression — silently corrupting query results for that field, with no REQ/AC/test surface guarding against it.
- Suggested resolution: Add a requirement that any `kind` change to an existing `queryable` field forces the index to be torn down and re-provisioned under the new `kind`'s `CAST` mapping, with an AC covering the "kind changed while still queryable" case explicitly (distinct from the existing "queryable flag flipped" case).

### RT-004
- Severity: BLOCKING
- Category: contradiction
- Location: `SPEC-020-state.spec.md` §2 `ContentTypeRevision` / `EntryRevision`; `SPEC-020-feature.spec.md` `## Integration Contracts` ("Composite actor identity (SPEC-016 REQ-16, REQ-17)"); AC-12, AC-25
- Description: SPEC-020's own Integration Contracts section asserts "Every row in `content_type_revisions` and `entry_revisions` carries the actor pair via its own `workspaceId` column plus `actorId` ... per SPEC-016 REQ-16 ... This spec's AC-12 and AC-25 assume this shape is available." But SPEC-016 REQ-16 requires more than that: "when the action was performed by a delegated agent, MUST additionally carry `(delegatedByWorkspaceId, delegatedById)`." Neither `ContentTypeRevision` nor `EntryRevision` in `state.spec.md` §2 has any `delegatedByWorkspaceId`/`delegatedById` field (`EntryRevision` has `pluginId`, which is a different concept). Since Collections' own `api.spec.md` §2 explicitly permits `agent` principals to call every `*.manage` mutating route (`AUTH_COLLECTIONS_MANAGE` permits `user, agent, api_key`), a delegated-agent write against `content_types`/`entries` is squarely in-scope, not a hypothetical — so this is a real, reachable gap between what SPEC-020 claims is satisfied and what its own contract files actually define.
- Suggested resolution: Add `delegatedByWorkspaceId`/`delegatedById` (nullable, populated only when the writer is a delegated agent) to both `ContentTypeRevision` and `EntryRevision` in `state.spec.md`, and update AC-12/AC-25 (or add new ACs) to assert the field is populated correctly for an agent-delegated write.

### RT-005
- Severity: BLOCKING
- Category: contradiction / untestable
- Location: REQ-14; `SPEC-020-behavior.spec.md` §7 (last row); `SPEC-020-traceability.spec.md` §5 (last row)
- Description: `behavior.spec.md` §7's edge-case table asserts: "An entry's `fieldsJson` key exists in the schema but its value's runtime type does not match the field's declared `kind` → Rejected with `VALIDATION_ERROR` — kind-conformance is part of REQ-14's schema validation, not a separate concern." But REQ-14's actual normative text only requires rejecting (a) a payload key not present in the current schema, or (b) an omitted `required` field — it never states a runtime-value-type/`kind`-conformance check. No REQ or AC anywhere establishes that obligation; `traceability.spec.md` §5 seeds a row for this rule but it traces to `behavior.spec.md` §7, not to any REQ/AC, so a TDD Agent following REQ-14's literal words would have no requirement to certify a test against for this case. This is exactly the kind of untestable/unanchored assertion the Test Design skill flags: a claim of behavior with no REQ/AC to bind a test's certification to.
- Suggested resolution: Either add an explicit clause to REQ-14 (e.g. "...and rejecting with `VALIDATION_ERROR` when a supplied field value's runtime type does not conform to the field's declared `kind`") with a matching AC, or remove the claim from `behavior.spec.md` §7 if kind-conformance checking is not actually intended to be part of this spec's scope.

---

## ADVISORY Findings

Spec Agent and human are informed. Human decides whether to revise or accept risk.

### RT-006
- Severity: ADVISORY
- Category: contradiction
- Location: Overview/User Journey step 2 vs. REQ-24 and `behavior.spec.md` §2.1
- Description: The User Journey narrative states the definition-time validation order as "(reserved-key check, key/field-name grammar, field-kind enum, queryable-field cap)" — reserved-key check listed *before* grammar. REQ-24 (the authoritative requirement) and `behavior.spec.md` §2.1 both state the fixed order as "key grammar → reserved-key → field-name grammar → field-kind → queryable-cap" — grammar *before* reserved-key. AC-38 is consistent with REQ-24's order, not the User Journey's. This is a real inconsistency between descriptive prose and the normative requirement, even though the normative requirement (which a competent implementer would follow) is unambiguous on its own.
- Suggested resolution: Correct the User Journey step 2 bullet's parenthetical to list the guards in REQ-24's actual order, or state explicitly that the User Journey's ordering is illustrative/non-normative and REQ-24 governs.

### RT-007
- Severity: ADVISORY
- Category: untestable (wording clarity only — the intended assertion is still inferable)
- Location: AC-38
- Description: AC-38's "Then" clause is grammatically malformed: "then the reported error is `INVALID_KEY_GRAMMAR`/`INVALID_FIELD_NAME_GRAMMAR`'s guard ordering resolves deterministically to the first-failing guard in the fixed order ... for this payload, the key grammar check ... passes, so the reserved-key check is the one that fails and is reported, never the later field-name grammar violation." The clause reads as two spliced sentences. The eventual expected outcome (reserved-key error is reported) is still recoverable by careful reading, so this does not block testability, but it should be tightened before TDD writes a test off of it.
- Suggested resolution: Rewrite as: "Given a content-type submission has `key='post'` (reserved) AND an invalid field name in the same payload, when it is processed, then `RESERVED_CONTENT_TYPE_KEY` is the reported error (per REQ-24's fixed guard order — key grammar passes since `'post'` is grammar-valid, so reserved-key is the first-failing guard), never `INVALID_FIELD_NAME_GRAMMAR`."

### RT-008
- Severity: ADVISORY
- Category: ambiguity
- Location: `SPEC-020-api.spec.md` §4 `ENTRY_CREATE`/`ENTRY_UPDATE`/`ENTRY_VALIDATE_FIELDS` `fieldsJson` request contracts
- Description: `fieldsJson`'s nested shape (`{ ext: { site: { <fieldName>: <value> } } }`) is documented only as a free-text `description:` string in the yaml contract, never as an enforced nested schema. AC-22 and the other field-validation ACs all correctly reference the nested path, so the *intended* shape is clear — but the spec never states what happens if a caller submits `fieldsJson` without the `ext.site` wrapper (e.g. flat `{ foo: 30 }`): rejected as a structural error, silently coerced, or treated as "no recognized fields present" (and thus passing/failing REQ-14 for unrelated reasons)?
- Suggested resolution: Either formalize the nested shape as a typed schema in `api.spec.md` §5's Contract Definitions and add an explicit AC for a malformed/unwrapped `fieldsJson` payload, or state that any deviation from the wrapper shape is itself a `VALIDATION_ERROR` before per-field validation runs.

### RT-009
- Severity: ADVISORY
- Category: ambiguity (staleness)
- Location: `SPEC-020-feature.spec.md` Open Questions, OQ-04
- Description: SPEC-020's OQ-04 frames SPEC-016's OQ-04 as still open ("Owner: whoever resolves SPEC-016 OQ-04 (tracked against SPEC-017) — Resolve by: before SPEC-017's spec-dod.md sign-off"). But SPEC-016's own OQ-04, in the copy of `SPEC-016-feature.spec.md` read for this review, is already marked **"Resolved 2026-07-14 (Coordinator fold-back from SPEC-017)"** with the exact answer SPEC-020 says it "inherits ... rather than re-deciding" (an independent additional token is minted). The *behavior* SPEC-020 states is correct and matches SPEC-016's resolution — but presenting an already-resolved upstream question as a still-open, dated action item is stale bookkeeping that could cause the Coordinator or a human reviewer to believe there is a pending decision blocking SPEC-017's sign-off when there is not. This is precisely the kind of drift the assignment's brief flagged as a risk given SPEC-016's OQ-04 fold-back edit landed in the same session as SPEC-020's authoring.
- Suggested resolution: Update SPEC-020's OQ-04 to state the question is RESOLVED (citing SPEC-016's resolution directly) and drop the Owner/Resolve-by framing, or explicitly explain why Collections still needs an independent sign-off gate despite SPEC-016's resolution.

### RT-010
- Severity: ADVISORY
- Category: ambiguity
- Location: `SPEC-020-feature.spec.md` `## Integration Contracts`, "Composite actor identity (SPEC-016 REQ-16, REQ-17)" bullet
- Description: SPEC-016 REQ-17's soft-value-join/no-FK rule is explicitly conditioned on "the referencing table and the `principals` table are not in the same physical database (e.g. a sidecar file vs. `content.db`)." SPEC-020 cites REQ-17 without stating whether Collections' `content_type_revisions`/`entry_revisions` tables actually share a physical database with `principals` (ADR-021) or not — if they do (both plausibly live in the same per-workspace `content.db`), REQ-17's specific "physical boundary" clause may not even apply to Collections the way it applies to Storage's sidecar journal, making the citation's relevance unclear rather than wrong.
- Suggested resolution: State explicitly whether `content_type_revisions`/`entry_revisions` live in the same physical database as `principals`, and if so, clarify that REQ-17 is cited only for its general soft-reference posture, not its physical-boundary-specific FK-absence clause.

---

## CONSTITUTION_FLAG Findings

Likely to require a constitution exception once `ADS-memory/governance/constitution.md` is ratified (it is currently an unfilled
template, so no live violation exists today — this is a forward-looking flag only).

### RT-011
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: I — Library-First (template placeholder name; default heuristic equivalent)
- Location: REQ-04, REQ-06; `SPEC-020-behavior.spec.md` §3/§4 (kind→CAST lookup, index-name construction)
- Description: The core-mediated index-provisioning subsystem — mapping an operator-declared field `kind` through a fixed lookup table to a `CAST(...)` literal, and constructing workspace-scoped index identities — is a bespoke, hand-rolled dynamic-DDL-generation layer built specifically to avoid raw string interpolation (REQ-04/INV-04). This is a reasonable and well-justified custom implementation given the injection-safety requirement, but it is exactly the shape of thing a ratified Library-First article would ask the Architect to justify against existing query-builder/schema-migration libraries (e.g. why not delegate cast-safety to the existing Drizzle layer ADR-015 already established for this codebase).
- Architect note: When drafting the ADR, prepare a Complexity Justification entry showing why the fixed kind→CAST lookup table is implemented directly rather than through Drizzle's existing typed-column/cast API (ADR-015), even though no constitution article is live yet to force this — it is very likely to become one.

---

## Routing Decision

**5 BLOCKING findings — this exceeds the persona's 3+ threshold.** Per the Red-Team persona's escalation rule: stop and route back
to Spec Agent. Do not patch findings inline; do not dispatch Software Architect. The package has a systemic quality problem
concentrated in two areas: (1) the content-type field-update/index-maintenance surface (RT-001, RT-003) has real behavioral gaps at
exactly the points where operator-controlled schema mutation meets index-provisioning safety, and (2) the entry lifecycle's
interaction with a non-`active` content type is underspecified for every write path except creation (RT-002), while a claimed
Integration Contract satisfaction (RT-004) and a claimed behavior-rule backing (RT-005) both turn out not to be actually established
by the spec's own normative text.

None of these findings invent new requirements — every one traces to a gap or contradiction inside REQ/AC/state/behavior text that
already exists in this package. ADVISORY and CONSTITUTION_FLAG findings (RT-006 through RT-011) should also be folded into the Spec
Agent's revision pass since several are quick, precise fixes (RT-007, RT-009, RT-010) that would otherwise resurface at the next
Red-Team pass.
