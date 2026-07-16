# Red-Team Findings: categories-and-tags

- Feature: FEAT-018-categories-and-tags
- Spec version: 1.0.0
- Spec hash: sha256:a800dda30d1938b0f16629b3f8afc2f6d06242b30a89820f4c8ad5f7f2e6091c
- Red-Team completed: 2026-07-14T22:30:00Z
- Finding count: 3 BLOCKING · 6 ADVISORY · 0 CONSTITUTION_FLAG

---

## BLOCKING Findings

Spec must be revised before Software Architect dispatch. 3 BLOCKING findings exist — per the
Red-Team escalation rule, this stops the pipeline and routes back to Spec Agent.

### RT-001
- Severity: BLOCKING
- Category: contradiction
- Location: `feature.spec.md` REQ-09/REQ-10, AC-12/AC-13, EC-03/EC-04; `behavior.spec.md` §2.1
  (Ordinary-mutation validation chain ordering) vs §7 (Edge Case Handling table); `state.spec.md`
  §3 `CREATE_TERM`/`REPARENT_TERM` preconditions
- Description: `behavior.spec.md` §2.1 fixes the hierarchy-check sub-order as REQ-09 (same-taxonomy)
  → REQ-10 (hierarchical-mode) → REQ-11 (cycle), and this exact order is repeated in
  `state.spec.md`'s `CREATE_TERM`/`REPARENT_TERM` preconditions. But `behavior.spec.md` §7's own
  Edge Case Handling table states unconditionally: "`reparentTerm`/`createTerm` called with a
  non-null `parentId` on a `hierarchical=false` taxonomy" → `TAXONOMY_NOT_HIERARCHICAL` (EC-04),
  with no carve-out. Consider the compound case: a flat (tag) taxonomy's term is reparented with a
  `newParentId` that happens to belong to a *different* taxonomy (the common case, since a flat
  taxonomy never has a legitimate same-taxonomy parent to begin with). Per the fixed REQ-09-before-
  REQ-10 ordering, the same-taxonomy check runs first and fails, so the call is rejected with
  `PARENT_CROSS_TAXONOMY` — not `TAXONOMY_NOT_HIERARCHICAL` as EC-04/AC-13 claim unconditionally.
  Two developers reading only EC-04/AC-13 vs. only §2.1's ordering rule would legitimately implement
  (and test) two different error codes for the same input. This is a same-document contradiction
  (§2.1 vs. §7 of `behavior.spec.md`), not a subtle cross-file inference.
- Suggested resolution: Either (a) swap the fixed sub-order to REQ-10 before REQ-09 — the
  hierarchical-mode check is strictly cheaper (it only reads the child's own already-resolved
  taxonomy row, no lookup of the candidate parent needed) and would make EC-04's unconditional claim
  true, since a non-hierarchical taxonomy's `parentId` rejection would always fire first regardless
  of what the caller supplied as `newParentId`; or (b) keep REQ-09 first but explicitly qualify
  EC-04/AC-13 with "...when the supplied `parentId` also resolves to a term in the same taxonomy" and
  add a distinct AC for the cross-taxonomy+non-hierarchical compound case naming
  `PARENT_CROSS_TAXONOMY` as the expected code. Pick one and make `behavior.spec.md` §2.1 and §7
  agree.

### RT-002
- Severity: BLOCKING
- Category: missing-failure-mode
- Location: REQ-15, REQ-16, AC-21–AC-24, `api.spec.md` `TERM_MERGE_PLAN`/`TERM_MERGE_CONFIRM`/
  `TERM_MERGE_EXECUTE`, `state.spec.md` `PLAN_MERGE_TERM`/`EXECUTE_MERGE_TERM`
- Description: Nowhere in the package (REQ, AC, EC, error registry, or state/orchestrator action
  catalog) is the case `fromTermId === intoTermId` addressed — a caller merging a term into itself.
  Every other degenerate/boundary input for this domain is explicitly enumerated (cross-workspace,
  cross-taxonomy, non-hierarchical parent, cycle, orphaned content, allow-list rejection, concurrent
  race, a second confirm before the first token resolves) — this is the one glaring omission for the
  domain's single gated, destructive mutation. Per `state.spec.md`'s `EXECUTE_MERGE_TERM` action, a
  self-merge would set `fromTerm.status = 'deprecated'` while "re-pointing" its own `entry_terms`
  rows to itself and writing a `TaxonomyRevision{op:'merge'}` recording `fromTermId`→`intoTermId`
  where both are the same id — deprecating the term that is nominally its own merge target, with
  undefined resulting UX/data state. There is no `VALIDATION_ERROR` or dedicated error code reserved
  for this in `errors.spec.md` either.
- Suggested resolution: Add a requirement (e.g. REQ-15a) that `planMergeTerm`/`executeMergeTerm`
  MUST reject when `fromTermId === intoTermId` with a `VALIDATION_ERROR` (or a new
  `SAME_TERM_MERGE` code), plus a corresponding AC and EC, and register it in
  `traceability.spec.md`.

### RT-003
- Severity: BLOCKING
- Category: untestable (ambiguity in what the AC actually protects)
- Location: REQ-22, AC-33, `api.spec.md` §7 Agent Tool Catalog rules; cites SPEC-016 REQ-22
- Description: SPEC-016 REQ-22 states a **functional** prohibition: "MUST NOT expose any
  agent-callable tool that performs the `confirm()` step" (no naming assumption at all). SPEC-018's
  own REQ-22 narrows this into a **name-pattern** prohibition: "no `taxonomy_confirm_merge_term`
  tool (or any other `{domain}_confirm_{action}` tool) may ever exist in the catalog," and AC-33
  tests exactly that narrower claim ("no tool named `taxonomy_confirm_merge_term` ... or any other
  `taxonomy_confirm_*` tool exists"). As literally written, an implementer could add an
  agent-callable tool that performs the confirm step under a different name (e.g.
  `taxonomy_human_ack_merge`, `taxonomy_finalize_merge_step2`) and satisfy AC-33's literal words
  while violating the actual safety property this whole gateway exists to protect — SPEC-016's own
  Agent Directives are explicit that "confirm is human-only with no exception." This is exactly the
  ambiguity probe "can two developers implement it differently and both satisfy the words of the
  AC?" applied to a security-critical control, and it is a genuine narrowing relative to the
  mechanism SPEC-018 claims (accurately, per its own citation table) to inherit from SPEC-016.
- Suggested resolution: Restate REQ-22/AC-33 functionally, matching SPEC-016's actual REQ-22:
  "no agent-callable tool in the catalog, regardless of name, may perform the `confirm()` step for
  `mergeTerm`" — and add a mechanism-level test note (e.g. "verified by inspecting each tool
  definition's mapped orchestrator action, not by name pattern alone") so TDD doesn't certify a
  name-only check as satisfying the underlying invariant.

---

## ADVISORY Findings

Spec Agent and human are informed; human decides whether to revise or accept risk. These do not
change the routing recommendation below (which is already forced to "route back" by the 3 BLOCKING
findings above), but should be folded into the same revision pass for efficiency.

### RT-004
- Severity: ADVISORY
- Category: contradiction
- Location: `feature.spec.md` Open Questions OQ-03; `api.spec.md` `MergePlanResponse.details`;
  `ui.spec.md` §2.6 `MergeTermDialog.overlapDisclosure`
- Description: OQ-03 asks "whether `mergeTerm`'s plan-time disclosure (REQ-16) must enumerate the
  specific overlapping content items ... or may state only a count" and lists it as unresolved,
  owned by the Software Architect, "resolve by: before this package's `ui.spec.md` is finalized for
  implementation." But `ui.spec.md` — part of this very package, already marked `PRESENT` and
  complete in `spec-manifest.md` and `spec-dod.md` (Section C, all PASS) — already commits to a
  count-only shape: `overlapDisclosure: {overlappingContentCount: integer,
  willLoseAssignmentHistory: boolean}`, matching `api.spec.md`'s `MergePlanResponse.details` (no
  enumerated-items field exists anywhere in the typed contracts). The decision this OQ claims is
  still open has, in effect, already been made and shipped in the same package, but OQ-03 was never
  updated to reflect that (contrast with SPEC-016's own OQ-04, which explicitly documents "Resolved
  2026-07-14" with a reasoning trail — the correct pattern this spec doesn't follow for OQ-03).
- Suggested resolution: Either mark OQ-03 resolved (mirroring SPEC-016 OQ-04's format) stating that
  `api.spec.md`/`ui.spec.md`'s count-only shape is the answer, or — if a richer enumerated-items
  disclosure is still genuinely intended for a later pass — explicitly flag `api.spec.md`'s
  `MergePlanResponse.details` and `ui.spec.md`'s `overlapDisclosure` as provisional/v1-only shapes
  subject to that open decision.

### RT-005
- Severity: ADVISORY
- Category: untestable
- Location: AC-08 (REQ-06), `state.spec.md` `isTermApplicableToContentType` selector
- Description: AC-08's Given clause ("ADR-043/SPEC-020's Collections engine has since shipped")
  implicitly requires constructing a scenario where `content_types` disagrees with the hardcoded
  `post`/`page` allow-list, to prove the allow-list — not the registry — governs. But ADR-043 §4
  (cited in this very spec's Dependencies table) permanently rejects `content_types.key ∈
  {'post','page'}` at write time, so a compliant system can never legally hold a conflicting
  `content_types` row to diverge against. A purely behavioral/output-comparison test therefore has
  no valid input that could ever produce a different outcome under the two candidate mechanisms —
  the AC's literal Given scenario cannot be constructed through normal write paths. As stated, this
  AC can only be verified by a mechanism-level assertion (e.g., spying on/mocking the `content_types`
  repository and confirming it is never consulted when `contentType ∈ {'post','page'}`), which the
  spec doesn't say to do.
- Suggested resolution: Reword AC-08 to specify the mechanism-level assertion directly (e.g. "the
  allow-list check never queries the `content_types` table for `contentType ∈ {'post','page'}`,
  verified by a call-count assertion on the `content_types` repository dependency"), or note in
  `traceability.spec.md` that this AC is verified by static/architectural review (Code Review Agent)
  rather than a black-box behavioral test, since ADR-043's reservation makes a divergent live-state
  test impossible to construct.

### RT-006
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: `state.spec.md` §1 (`taxonomy.status`/`term.status`), REQ-17/REQ-20, Action Catalog
- Description: `taxonomy.status`/`term.status` support an `active`/`deprecated` enum, but no
  REQ/AC anywhere ties `deprecated` status to write-time rejection of `assignTerms`, `createTerm`
  (under a deprecated parent taxonomy), or `reparentTerm` (onto a deprecated parent term). It is
  unspecified whether a deprecated taxonomy/term remains fully mutable and assignable, or whether
  deprecation is meant to block further use. This is the kind of "what happens at this state
  boundary" question the Edge Cases section is supposed to cover but doesn't for this particular
  state field.
- Suggested resolution: Add an explicit statement (even if the answer is "deprecated is
  display/filtering-only in v1; no write-time enforcement exists") to Scope or Edge Cases, so this
  isn't left to an implementer's guess.

### RT-007
- Severity: ADVISORY
- Category: missing-failure-mode (traceability gap, not an ambiguity in the underlying rule)
- Location: REQ-11, AC-14, EC-05; `state.spec.md` §4 `wouldCreateCycle` selector
- Description: Per my assigned duty to check the cycle-detection rule's boundary conditions: the
  underlying rule is *not* ambiguous — `state.spec.md`'s `wouldCreateCycle({termId,
  candidateParentId})` selector is precisely defined as "`true` if `candidateParentId` is `termId`
  itself or any existing descendant of `termId`," which cleanly and recursively covers both
  self-parenting (`newParentId === termId`) and cycles of any depth. However, `feature.spec.md`
  itself never gives either boundary condition its own AC/EC — AC-14/EC-05 only instantiate the
  minimal 2-node case ("term A is the parent of term B... set term B as the parent of term A").
  `traceability.spec.md` §3 has exactly one row for cycle detection (EC-05), so there is no
  dedicated test-coverage placeholder for the self-parent case or a 3+-node chain, even though the
  mechanism is designed to handle them.
- Suggested resolution: Add EC-05a ("`reparentTerm` called with `newParentId` equal to the term's
  own id") and optionally EC-05b (a 3-node ancestor chain) as their own edge cases with their own
  traceability rows, even though both resolve to the same `HIERARCHY_CYCLE_DETECTED` code and the
  same underlying selector — this makes the boundary explicit for TDD instead of relying on an
  implementer noticing the selector's own wording covers it.

### RT-008
- Severity: ADVISORY
- Category: untestable / missing-failure-mode
- Location: EC-09; `errors.spec.md` §2; `api.spec.md` §6 (`CONTENT_TERMS_ASSIGN` error mapping)
- Description: EC-09 states two concurrent `assignTerms` calls for the same term/content pair result
  in "the second call either no-ops idempotently or fails with a conflict that the caller may safely
  ignore." The "no-op" branch is testable (assert final state has exactly one row). The "fails with
  a conflict" branch has no corresponding entry anywhere: `errors.spec.md` §2's registry has no
  conflict/duplicate code, and `api.spec.md` §6's `CONTENT_TERMS_ASSIGN` error mapping lists only
  `VALIDATION_ERROR`/`WORKSPACE_MISMATCH`/`CONTENT_TYPE_MISMATCH`/`TAXONOMY_NOT_APPLICABLE` (400) and
  `TERM_NOT_FOUND` (404) — no 409/conflict code exists for this scenario. A TDD Agent cannot write a
  deterministic assertion for the "fails" branch because its shape (status code, error code) is
  never specified.
- Suggested resolution: Either commit to the idempotent-no-op behavior only (drop the "or fails with
  a conflict" branch, since `entry_terms_unique` plus a straightforward upsert/ignore-on-conflict
  write can make this always a no-op), or add the specific error code and its HTTP status/retryable
  mapping to `errors.spec.md`/`api.spec.md` if a genuine conflict response is intended.

### RT-009
- Severity: ADVISORY
- Category: ambiguity
- Location: `behavior.spec.md` §3 Default Values table (`entryTerm.position` row)
- Description: The rationale column for `entryTerm.position`'s default states: "`0` for every new
  assignment is a stable, deterministic default an admin UI can re-order from." This is phrased as a
  present-tense capability, but no REQ, AC, endpoint (`api.spec.md` §1), or UI event
  (`ui.spec.md` §3 — `TermAssignmentPicker` only has `onAssign`/`onUnassign`) exists anywhere in this
  package for actually updating `position` after creation. It's unclear whether reordering is a
  committed v1 capability with a missing contract, or purely forward-looking rationale for a future
  feature not yet in scope.
- Suggested resolution: If reordering is out of scope for v1, say so explicitly (add it to Out of
  Scope) so the rationale text doesn't read as an implied, uncontracted commitment. If it is in
  scope, add the missing endpoint/action/event and AC.

---

## Integration Contracts Citation-Accuracy Check (extra verification duty)

**Result: PASS with one fidelity gap (folded into RT-003 above).**

Cross-checked every SPEC-016 id cited in `feature.spec.md`'s `## Integration Contracts` table
against SPEC-016's current `SPEC-016-feature.spec.md` content directly (not from memory or
paraphrase):

- SPEC-016 REQ-01/REQ-02 (watermark counter + same-transaction stamping obligation) — verbatim
  match; REQ-02's own text even names "Taxonomy's write-service" as a worked example. Accurate.
- SPEC-016 REQ-08–REQ-13 (gated-mutation gateway: two-phase-plus-execute, `plan()` permission tier,
  `confirm()` user-only + TTL, `execute()` fail-closed re-evaluation + `PLAN_STALE`, actor-class
  redemption rule) — accurate paraphrase of the cited range.
- SPEC-016 REQ-14 (`authorize()` before idempotency at every mutating call site) — verbatim match.
- SPEC-016 REQ-16/REQ-17 (composite actor-identity shape, soft value-join treatment across a
  physical boundary) — accurate; correctly used only as contextual grounding for REQ-05's "same
  generalization" framing, not as an AC-bearing citation.
- SPEC-016 REQ-18 (general soft cross-boundary reference rule: write-time validation, orphan
  tolerance, reconciliation sweep) — accurate; the "population-at-write-time" phrase folded into
  this row mirrors how SPEC-016's own Scope section bundles REQ-16–REQ-18 together, so this is not a
  misattribution.
- SPEC-016 REQ-10's ~10-minute TTL — verbatim match, correctly cited as a fixed reused value, not a
  free parameter.
- SPEC-016 REQ-22 (agent-tool naming convention) — the *citation itself* (what SPEC-016 REQ-22 says)
  is accurately described in the Integration Contracts table. The gap is in SPEC-018's own REQ-22/
  AC-33 text, which narrows SPEC-016's functional prohibition into a name-pattern-only one — see
  BLOCKING finding RT-003. This is a fidelity problem in SPEC-018's restatement, not a
  misrepresentation of what SPEC-016 says.

No stale, invented, or misquoted SPEC-016 id was found anywhere in the Integration Contracts table.

## SPEC-020 Renaming-Consistency Check (extra verification duty)

**Result: PASS.**

`grep`'d every SPEC-018 package file for `SPEC-003`/`SPEC-020`/`Collections`: zero occurrences of
`SPEC-003` anywhere in the SPEC-018 package. Every reference to Collections consistently says
`ADR-043/SPEC-020` (feature.spec.md Scope, Integration Contracts, AC-08, Dependencies table;
traceability.spec.md AC-08 row; state.spec.md's `isTermApplicableToContentType` note). No leftover
"SPEC-003" naming anywhere in this spec's own text.

(Side observation, not a formal finding since it's outside SPEC-018 and I was directed not to touch
SPEC-016: SPEC-016's own `feature.spec.md` OQ-02/OQ-03 still reference an unrelated historical
"SPEC-003" in the context of `siteId`/`workspaceId` scoping lineage and the Postgres cutover
mechanism — this appears to predate the Collections renumbering and refers to a different, older
spec number entirely, not a missed Collections rename. Flagging for Coordinator awareness only; out
of scope for this Red-Team run.)

---

## Routing Decision

**3 BLOCKING findings.** Per the Red-Team escalation rule ("if 3 or more BLOCKING findings exist,
stop and route back to Spec Agent — do not patch findings inline"): **route back to Spec Agent.**
Do not dispatch Software Architect until RT-001, RT-002, and RT-003 are resolved in the spec text
(not patched inline by this run).

All three BLOCKING findings are narrow and mechanical to fix (a check-order swap or explicit
carve-out; one missing validation rule + AC/EC; a wording fix from name-pattern to functional
prohibition plus a test-method note) — this does not look like a systemic quality failure of the
whole package (32/33 DoD Section B items and all of Section H passed), but the rule is a bright-line
3-count trigger and all three genuinely meet the BLOCKING bar (each would let two competent
developers legitimately diverge, or silently ships a gap in the domain's one destructive mutation,
or under-protects a security-critical confirm-only control).

ADVISORY findings RT-004 through RT-009 should be folded into the same revision pass for efficiency
— none of them independently changes the routing decision, but several (RT-004, RT-006) are cheap,
concrete clarifications worth fixing alongside the BLOCKING items rather than in a second round.

No CONSTITUTION_FLAG findings were raised. The constitution file remains an unratified template
(confirmed by direct read); this spec's own Constitution Compliance table already marks all 8
articles N/A on that basis, consistent with SPEC-016's identical treatment. No requirement in this
package independently forces a custom-implementation-over-library choice, a prohibitively-difficult
test, or complexity untraceable to a stated requirement — SPEC-018's one nontrivial abstraction
(instantiating SPEC-016's gateway for `mergeTerm`) is a reuse of an already-justified 3-consumer
abstraction, not a new one.
