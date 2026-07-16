# Red-Team Findings (Round 3): categories-and-tags

- Feature: FEAT-018-categories-and-tags
- Spec version: 1.2.0
- Spec hash: sha256:5191fc93e7714f827be3d2febe5033ddaaa42e910ed803038c47797829ae4ae3 (mechanically
  verified — see "Hash Verification" below)
- Red-Team completed: 2026-07-15T01:30:00Z
- Round: 3 (fresh full adversarial pass against the v1.2.0 revision, plus the mandatory SPEC-016
  v1.1.0 → v1.2.0 citation re-sync directed by the Coordinator)
- Finding count: 1 BLOCKING · 3 ADVISORY · 0 CONSTITUTION_FLAG

**Persona-load confirmation:** `AI-Dev-Shop/agents/red-team/skills.md`,
`AI-Dev-Shop/skills/general-behavior/SKILL.md`, `AI-Dev-Shop/skills/spec-writing/SKILL.md`,
`AI-Dev-Shop/skills/test-design/SKILL.md`, `AI-Dev-Shop/skills/architecture-decisions/SKILL.md`, and
`AI-Dev-Shop/framework/templates/red-team-template.md` were all read in full before this review
began, per the Red-Team Agent's mandatory bootstrap.

---

## Hash Verification

Ran the provider-local validator without `--update-hash` to confirm the recorded hash is already
canonical (not merely asserted):

```
python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py \
  ADS-memory/specs/018-categories-and-tags --phase spec
→ PASS: strict Speckit package passed mechanical validation. (exit 0)
```

A clean pass with no `--update-hash` confirms `sha256:5191fc93...ae4ae3` in `feature.spec.md`'s
header is the true canonical hash of the current content (the validator recomputes
`compute_feature_hash()` over `feature.spec.md` and compares it against the stored value; a
mismatch is a hard error, so a clean PASS is a mechanical, not asserted, confirmation).

**Important caveat surfaced by this round's own review (see RT-016 below):** the validator only
checks `feature.spec.md`'s own `content_hash` field — it does not check whether the *sibling*
package files' own "Content Hash" header lines match that same value. I found they currently do
not (all 7 non-`feature.spec.md` files still say `sha256:6e959768...5`, the v1.1.0 hash). This does
not invalidate the PASS result above — `feature.spec.md` is the sole canonical hash anchor per
`compatibility.md`'s Canonical Hash Rule — but it is a real, previously-unflagged package-internal
inconsistency; see RT-016.

---

## Part 1 — Disposition of Round-2 Findings (RT-010 through RT-013)

### RT-010 (prior: BLOCKING, contradiction/missing-failure-mode) — **RESOLVED, independently hand-verified**

Round 2 found that `state.spec.md`'s `TaxonomyRevision` entity had no field to carry SPEC-016
REQ-16's composite actor-identity attribution for a delegated-agent or api_key-owner mutation, even
though every agent-callable taxonomy tool routinely produces exactly that case.

I did not trust the Coordinator's note that this was fixed — I independently re-read the actual
current field list in `SPEC-018-state.spec.md` §2's `TaxonomyRevision` entity:

```yaml
TaxonomyRevision:
  seq: integer
  taxonomyId: string (ulid)
  perTaxonomySeq: integer
  workspaceId: string (ulid)  # also serves as this row's actorWorkspaceId (REQ-12) ...
  stateJson: string
  actorId: string
  delegatedByWorkspaceId: string | null   # populated only when the writer is a delegated agent ...
  delegatedById: string | null             # the agent's delegator, or the api_key's owning user
  pluginId: string | null
  op: TaxonomyRevisionOp
  recordedAt: string (date-time)
```

I then compared this field-by-field against SPEC-016 v1.2.0's actual `ActorIdentityRef` shape
(`SPEC-016-state.spec.md` §2, lines 58–64):

```yaml
ActorIdentityRef:
  actorWorkspaceId: string
  actorId: string
  delegatedByWorkspaceId: string | null
  delegatedById: string | null
```

`TaxonomyRevision` carries all four semantic fields of `ActorIdentityRef`: `actorId` directly,
`actorWorkspaceId` via the explicitly-documented and reasonable assumption that the row's own
`workspaceId` column serves that role (actor and taxonomy/term always share a workspace in this
domain — this is stated as an explicit assumption in both `feature.spec.md` REQ-12 and
`state.spec.md`'s own inline comment, exactly as round 2's suggested resolution asked for), and
`delegatedByWorkspaceId`/`delegatedById` verbatim, nullable, with the same population rule
("populated only when the writer is a delegated agent (`kind='agent'`) or an api_key acting for its
owning user (`kind='api_key'`)"). **The shape genuinely matches.**

I then verified the "real AC demonstrating coverage" requirement the Coordinator's directive asked
me to check specifically — round 2 explicitly flagged that AC-16 only tested `op:'merge'`
term-metadata mapping, not actor-identity stamping, so a fix that only added the fields without a
corresponding AC would still leave a coverage gap. Two new ACs exist and are substantively distinct
from AC-16:

- **AC-15a** (REQ-12) [P1]: `kind='agent'` delegated actor → row carries
  `(delegatedByWorkspaceId, delegatedById)` identifying the delegator.
- **AC-15b** (REQ-12) [P1]: `kind='api_key'` actor → row carries the same pair identifying the
  owning user.

Both are Given/When/Then, both name the specific principal kind, both assert on the specific field
pair, and both cite a real, checkable cross-reference: "mirroring `SPEC-020-feature.spec.md`
AC-47's identical pattern for `ContentTypeRevision`" (AC-15a) and "...AC-48's identical pattern for
`EntryRevision`" (AC-15b). I did not take this cross-reference on faith — I read
`SPEC-020-feature.spec.md` directly and confirmed AC-47 (line 413, REQ-08, `content_type_revisions`
row for a `kind='agent'` delegated write) and AC-48 (line 417, REQ-16, `entry_revisions` row for a
`kind='api_key'` write identifying the owning user) exist with matching substance. **The
cross-spec citation is accurate, not invented.**

`traceability.spec.md` §1 also carries dedicated PENDING rows for AC-15a and AC-15b (lines 58–59),
so the previously-zero test-coverage placeholder gap round 2 named is closed.

**Verdict: RESOLVED**, and independently re-derived rather than trusting the revision note or the
Coordinator's hand-verification claim.

### RT-011 (prior: ADVISORY, missing-failure-mode) — **RESOLVED**

`createTerm`'s cross-taxonomy `parentId` case now has its own AC (**AC-12a**) and EC (**EC-03a**),
and `api.spec.md`'s `TERM_CREATE` 400 error mapping now lists `PARENT_CROSS_TAXONOMY` alongside
`TAXONOMY_NOT_HIERARCHICAL` (confirmed at `SPEC-018-api.spec.md` line 259: `TERM_CREATE | 400 |
VALIDATION_ERROR, TAXONOMY_NOT_HIERARCHICAL, PARENT_CROSS_TAXONOMY`). Resolved.

### RT-012 (prior: ADVISORY, missing-failure-mode/ambiguity) — **RESOLVED**

A `parentId`/`newParentId` that resolves to no existing term now has its own AC (**AC-12b**) and EC
(**EC-03b**), `state.spec.md`'s `CREATE_TERM` Failure Handling column now lists `TERM_NOT_FOUND`,
and `api.spec.md`'s `TERM_CREATE` 404 mapping lists `TAXONOMY_NOT_FOUND, TERM_NOT_FOUND` (confirmed
at line 261). `errors.spec.md`'s ownership row for `TERM_NOT_FOUND` also now explicitly states it
covers both the `createTerm`/`reparentTerm` parent-resolution case and the original lookup case.
Resolved.

### RT-013 (prior: ADVISORY, documentation-integrity) — **RESOLVED, mechanically re-verified**

I did not trust the revision's own claimed recount — I reran the exact mechanical check round 2
specified:

```
grep -cE '^- AC-[0-9]+[a-z]? ' SPEC-018-feature.spec.md          → 38
grep -E '^- AC-[0-9]+[a-z]? ' SPEC-018-feature.spec.md | grep -oE '\[P[123]\]' | sort | uniq -c
  → 34 [P1], 4 [P2], 0 [P3]
```

This matches `spec-dod.md` B-21 and G-05's current text exactly (both now say "34 P1, 4 P2, 0 P3
(38 total)" and agree with each other, closing the two-different-numbers contradiction round 2
found). `version` fields are `1.2.0` in all 10 files (mechanically grepped). `last_edited` in
`spec-dod.md`'s B-06 cell (`2026-07-15T00:15:00Z`) matches `feature.spec.md`'s actual header.
Resolved.

**Summary: all 4 prior findings (1 BLOCKING, 3 ADVISORY) are genuinely resolved**, not merely
asserted resolved. RT-010 in particular was independently re-derived field-by-field against
SPEC-016's actual `ActorIdentityRef` shape and cross-checked against SPEC-020's cited ACs, not taken
on the Coordinator's or the stalled agent's word.

---

## Part 2 — SPEC-016 v1.1.0 → v1.2.0 Citation Re-Sync (mandatory, per Coordinator directive)

Read `SPEC-016-feature.spec.md` and `SPEC-016-traceability.spec.md` v1.2.0
(`sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`) in full, plus
`SPEC-016-state.spec.md` and `SPEC-016-behavior.spec.md` for the entity/ordering detail SPEC-018
cites. Also read SPEC-016's own round-2 Red-Team report
(`ADS-memory/reports/pipeline/016-content-admin-core-contract/red-team-findings-round2.md`) to
understand exactly what changed between v1.1.0 and v1.2.0, rather than diffing blind.

SPEC-016 v1.1.0 → v1.2.0 changed three substantive things: (1) added `details.reasonCode: enum
['ACTOR_CLASS_MISMATCH', 'AUTHORIZE_DENIED']` to REQ-13 as a stable discriminator (fixing SPEC-016's
own RT-013), (2) added the `ActorIdentityRef`/`APPEND_ACTOR_REFERENCE` concrete state/action
contract to REQ-18 and clarified the dependent-domain split for the polymorphic-reference flavor
(fixing SPEC-016's own RT-004/RT-014), and (3) **reordered `execute()`'s internal check
sequence — moved the actor-class redemption rule to run *before* plan re-derivation/hash
comparison, not after** (fixing SPEC-016's own RT-017, and adding AC-38 to make the new order
testable).

| SPEC-016 id(s) cited by SPEC-018 | v1.2.0 current text | Match? |
|---|---|---|
| REQ-18 (soft cross-boundary reference rule) | Still "MUST have its target existence and workspace ownership validated... at write time, MUST tolerate orphaned rows..., MUST be swept..." — the v1.2.0 addition only appends the `ActorIdentityRef`/dependent-domain-split clarification, which SPEC-018 already independently satisfies (`EntryTerm` entity + `ASSIGN_TERMS`/`UNASSIGN_TERM`/`RECONCILE_ORPHANED_ENTRY_TERMS` actions in `state.spec.md`) | Accurate, and the v1.2.0 addition explicitly names `entry_terms` as its own worked example — reinforces rather than invalidates this citation |
| REQ-16, REQ-17 (composite actor-identity shape, soft value-join) | REQ-16 gained one sentence ("This extra-attribution obligation is symmetric... no asymmetry between agent delegation and api_key ownership") — does not change the cited substance | Accurate |
| REQ-16 (attribution obligation, cited directly against REQ-12 for RT-10's fix) | Verbatim match against the current REQ-16 text | Accurate |
| REQ-01, REQ-02 | Unchanged; REQ-02 still names "Taxonomy's write-service" as a worked example | Accurate |
| REQ-08 – REQ-13 (gated-mutation gateway, cited generically) | **REQ-11/REQ-13's internal check ordering changed in v1.2.0** (see Part 3, RT-014) | **Citation of the REQ numbers themselves is still correct — SPEC-018 does not misquote the words of any REQ. But SPEC-018's own `state.spec.md` separately restates the internal check order in a way that now contradicts the current v1.2.0 order — this is a new finding, not a stale REQ-number citation. See RT-014.** |
| REQ-14 (`authorize()` before idempotency) | Unchanged | Accurate |
| REQ-22 (functional confirm-step prohibition) | Unchanged | Accurate |
| REQ-10 (600-second/10-minute TTL) | Unchanged | Accurate |

**Result: every SPEC-016 id and every direct quotation of SPEC-016's REQ text in SPEC-018's
Integration Contracts table remains accurate against v1.2.0.** No citation is stale in the sense of
"quotes words SPEC-016 no longer says." However, the mandatory re-sync surfaced one place where
SPEC-018 does not merely *cite* a SPEC-016 REQ range but *restates a specific internal ordering
detail* of that REQ range's mechanism — and that restatement is now stale relative to v1.2.0's
corrected ordering. That is this round's one BLOCKING finding (RT-014).

Additionally, `feature.spec.md`'s and `spec-manifest.md`'s own `depends_on` header metadata fields
still literally say "SPEC-016 (content-admin-core-contract) v1.1.0, content_hash
sha256:02382c267..." — this is now stale (SPEC-016 is v1.2.0,
`sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`), even though (as shown
above) the actual substance of every citation still holds. See RT-017.

---

## Part 3 — New Findings (Fresh Full Pass)

### RT-014
- Severity: **BLOCKING**
- Category: contradiction (citation drift against SPEC-016's current text)
- Location: `SPEC-018-state.spec.md` §3, `EXECUTE_MERGE_TERM` row, Precondition column; SPEC-016
  REQ-11, REQ-13, `SPEC-016-behavior.spec.md` §2.2, `SPEC-016-feature.spec.md` AC-38
- Description: `state.spec.md`'s `EXECUTE_MERGE_TERM` action's Precondition column reads: "SPEC-016
  REQ-11 – REQ-13 checks (fresh `authorize()`, token validity, plan-hash match, actor-class rule)
  all pass." This literally enumerates the check order as: authorize() → token validity → **plan-hash
  match → actor-class rule**.

  This is SPEC-016 **v1.1.0's** order — the exact order SPEC-016's own round-2 Red-Team report
  (`ADS-memory/reports/pipeline/016-content-admin-core-contract/red-team-findings-round2.md`,
  RT-017) flagged as a non-disclosure-principle violation: "a caller who fails the actor-class rule
  ... but whose token also happens to be hash-stale would receive `PLAN_STALE`, not `FORBIDDEN`
  — i.e., they learn the live plan has drifted *before* being told they were never allowed to
  redeem this token in the first place." SPEC-016 v1.2.0 fixed exactly this: its current
  `behavior.spec.md` §2.2 now states the order as "`authorize()` (fresh, fail-closed) → token
  expiry/redemption-state check → **actor-class redemption rule → plan re-derivation and hash
  comparison** → domain-specific mutation," with an explicit rationale ("the actor-class rule is
  deliberately evaluated before plan re-derivation/hash comparison so that a caller who was never
  allowed to redeem this token never learns, ahead of that denial, whether live state has
  drifted") and a new acceptance criterion, **AC-38**, making this order a first-class, testable
  contract: "Given a redemption attempt fails the actor-class rule and the recomputed plan would
  also be stale..., then the response is `FORBIDDEN` — the actor-class rule is evaluated before
  plan re-derivation/hash comparison... — never `PLAN_STALE`."

  SPEC-018's own `state.spec.md` was last touched in this v1.2.0 revision (its header still shows
  the v1.1.0 content hash — see RT-016) and was written/re-synced against SPEC-016 **v1.1.0**,
  before SPEC-016's own v1.2.0 fix landed. The result is that SPEC-018's package now contains one
  concrete, explicit restatement of the merge-domain's `execute()` check order that reproduces the
  exact defect shape SPEC-016 itself just fixed. This is a real cross-file contradiction, not a
  hypothetical one: `SPEC-018-behavior.spec.md` §2.1's own closing sentence points to "SPEC-016
  `behavior.spec.md` §2.2" as the authority for non-negotiable check ordering — but `state.spec.md`
  §3's own enumeration for this domain's one gated mutation now disagrees with what that exact
  cited section currently says.

  Two competent developers implementing `taxonomy.merge`'s `executeMergeTerm` from this package
  would diverge here: one reads `state.spec.md`'s literal parenthetical as the authoritative
  sub-order for this domain's instantiation and implements plan-hash-before-actor-class (wrong,
  per SPEC-016's current, corrected contract, and reproducing a live-state information leak to
  a caller who was never authorized to redeem this token); the other correctly defers entirely to
  SPEC-016's `GatedMutationGateway` (as `orchestrator.spec.md`'s own framing — "delegates ... rather
  than redefining a second gateway" — instructs) and gets the current, correct order. The package
  should not contain a restatement that can be read as authoritative and is simultaneously wrong;
  this is exactly the Brownfield Rule 3 ("reference legacy behavior by citation, never by
  restatement") this project itself established specifically to prevent this class of drift, and
  the restatement here has drifted.

  There is no corresponding hook in `orchestrator.spec.md`'s Lifecycle Hooks table (§5) that fixes
  this either — `onBeforeMergeExecute` and `onAfterMergePlanRecompute` do not mention the
  actor-class rule's position at all, so `state.spec.md`'s Precondition column is the only place in
  SPEC-018's own package that states this order, and it is currently wrong.
- Suggested resolution: Remove the ordering implication from `state.spec.md`'s `EXECUTE_MERGE_TERM`
  Precondition column — either state the four checks as an unordered conjunctive list ("all of the
  following must hold, in the order SPEC-016 REQ-11/REQ-13/`behavior.spec.md` §2.2 define,
  currently: authorize() → token-state → actor-class rule → plan-hash match") or drop the
  parenthetical order entirely and cite SPEC-016's `behavior.spec.md` §2.2 by reference only,
  consistent with how `SPEC-018-behavior.spec.md` §2.1 already does it correctly. Since SPEC-016 is
  explicitly out of scope to edit for this task, this is entirely a SPEC-018-side fix.

---

### RT-015
- Severity: ADVISORY
- Category: untestable
- Location: `feature.spec.md` REQ-17, AC-25; `api.spec.md` §4 (all Request Contracts);
  `orchestrator.spec.md` §5 `onBeforeOrdinaryWrite`
- Description: AC-25 (REQ-17) [P1] reads: "Given a `kind='user'` principal without
  `admin.taxonomy.manage` calls `renameTerm`, when `authorize()` is evaluated, then the call is
  rejected before any idempotency key lookup occurs." This presupposes a concrete idempotency-key
  request field on `renameTerm` (or some ordinary mutation) that an implementation can be observed
  short-circuiting around. I checked every Request Contract in `api.spec.md` §4
  (`TAXONOMY_CREATE`, `TERM_CREATE`, `TERM_RENAME`, `TERM_REPARENT`, `TERM_MERGE_PLAN`,
  `TERM_MERGE_CONFIRM`, `TERM_MERGE_EXECUTE`, `CONTENT_TERMS_ASSIGN`) and none defines an
  `idempotencyKey` field anywhere. `state.spec.md`'s Action Catalog similarly has no
  `idempotencyKey` field in any action's Payload column.

  SPEC-016's own REQ-14 text (accurately cited by SPEC-018) explicitly anticipates this: "any
  dependent domain endpoint that does accept an idempotency key defines that field in its own
  `api.spec.md`" — meaning REQ-14/AC-21's precedence rule only has observable content for a domain
  that actually defines such a field. SPEC-018 never does. This is the identical defect shape
  SPEC-016's own round-2 Red-Team report flagged as RT-016 (ADVISORY) for SPEC-016's *own* gateway
  endpoints — the same untestability gap now exists one layer down, in SPEC-018's inherited AC-25.
  As currently worded, no concrete request shape exists in this package to write a deterministic
  test against — a TDD Agent would either have to invent an idempotency-key field not defined
  anywhere else in the contract (scope creep this project's own conventions warn against), or mark
  AC-25 untestable/vacuous, which is not what the AC's Given/When/Then implies to a reader.
- Suggested resolution: Either state explicitly that this domain's ordinary mutations do not accept
  an idempotency key in v1 and reword AC-25 to test only the ordering property that *is* concretely
  observable here (`authorize()` runs and rejects before any other side effect, full stop, dropping
  the idempotency-specific framing), or add a genuine `idempotencyKey` field to at least the
  endpoint AC-25 names (`TERM_RENAME`) if idempotent retry is actually intended for this domain's
  ordinary mutations.

---

### RT-016
- Severity: ADVISORY
- Category: untestable / documentation-integrity (package-internal hash-propagation staleness)
- Location: `SPEC-018-state.spec.md`, `-orchestrator.spec.md`, `-api.spec.md`, `-errors.spec.md`,
  `-behavior.spec.md`, `-traceability.spec.md`, `-ui.spec.md` Header Metadata; `spec-dod.md` G-07
- Description: `feature.spec.md`'s `content_hash` field correctly reads
  `sha256:5191fc93e7714f827be3d2febe5033ddaaa42e910ed803038c47797829ae4ae3` — the current, canonical
  v1.2.0 hash, mechanically confirmed above. But every one of the other 7 package files' own
  "Content Hash" / `content_hash` header field still reads
  `sha256:6e959768c9165b5c32c73a286022103ebe6f43a4186d4ded2c323792fe317505` — the **v1.1.0** hash
  (mechanically grepped across all 8 non-`feature.spec.md` files; confirmed identical stale value in
  all 7). This is not caught by the mechanical validator, because `compatibility.md`'s Canonical
  Hash Rule and the validator's own implementation only compute and check `feature.spec.md`'s own
  hash — sibling-file header propagation is a project convention, not a validator-enforced rule.

  But it *is* a convention this project set for itself and claims to have followed:
  `pipeline-state.md`'s own v1.1.0 revision history states "The new hash was propagated to every
  sibling package file's own header," confirming this was done correctly for the 1.0.0→1.1.0 bump.
  It was not done for this 1.1.0→1.2.0 bump — consistent with the stalled agent's own reported
  failure mode (it completed the edits and the hash recompute, but its session ended before its
  final reporting step; propagating the new hash to 7 sibling headers appears to be exactly the
  kind of last-mile bookkeeping step that got dropped). `spec-dod.md`'s own G-07 item currently
  makes a specific, now-false claim about this: "every other file in this package carries the same
  `spec_id`/`content_hash` value for human cross-reference" — they do not; they carry the prior
  version's value. This is the same defect *shape* as round 2's RT-013 (stale evidence cells in
  `spec-dod.md`), just in a different location (sibling-file headers rather than DoD evidence
  cells), and again slipped through the Coordinator's hand-verification, which checked the RT-010
  field *content* in `state.spec.md` but not that file's own header hash value.
- Suggested resolution: Update the `content_hash` / "Content Hash" header field in `api.spec.md`,
  `state.spec.md`, `orchestrator.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, and
  `traceability.spec.md` to `sha256:5191fc93e7714f827be3d2febe5033ddaaa42e910ed803038c47797829ae4ae3`,
  and correct `spec-dod.md` G-07's Notes cell if it needs updating after that fix (it should not,
  once the sibling headers actually match).

---

### RT-017
- Severity: ADVISORY
- Category: documentation-integrity (stale dependency-version header, substance unaffected)
- Location: `feature.spec.md` Header Metadata `depends_on` field; `spec-manifest.md` Header
  Metadata `depends_on` field
- Description: Both fields still read "SPEC-016 (content-admin-core-contract) v1.1.0, content_hash
  `sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`." SPEC-016 has since
  moved to v1.2.0 (`sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`), which
  this round's mandatory citation re-sync (Part 2 above) confirms does not invalidate any of
  SPEC-018's actual Integration Contracts citations — so this is a metadata-only staleness, not a
  content defect, and does not by itself block anything. Leaving it unfixed does, however, create a
  small but real risk for whoever next re-verifies this package's dependency freshness (e.g. a
  future round 4, or the Coordinator's Planning Preflight): they would need to independently
  discover that "v1.1.0" in the header no longer matches SPEC-016's actual current version, exactly
  the kind of silent-drift bookkeeping gap this project's hash discipline exists to eliminate.
- Suggested resolution: Update both `depends_on` fields to "SPEC-016 (content-admin-core-contract)
  v1.2.0, content_hash `sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`."

---

## CONSTITUTION_FLAG Findings

None. `ADS-memory/governance/constitution.md` remains an unratified template (re-confirmed by
direct read this round, independent of rounds 1/2's own confirmation) — the blanket N/A treatment
for all 8 articles in both `feature.spec.md`'s Constitution Compliance table and `spec-dod.md`
Section G remains accurate. No requirement in this package independently forces a
custom-implementation-over-library choice, a prohibitively-difficult test, or complexity
untraceable to a stated requirement.

---

## Routing Decision

**1 BLOCKING finding (RT-014) and 3 ADVISORY findings (RT-015, RT-016, RT-017).**

This is below the "3 or more BLOCKING findings" systemic-quality-problem escalation threshold, but
per the Red-Team persona's own unconditional Output Format rule, BLOCKING means the spec must be
revised before Software Architect dispatch regardless of count. **Route back to Spec Agent for a
v1.3.0 revision.**

RT-014 is narrow and mechanical to fix (correct one Precondition-column parenthetical in
`state.spec.md` to stop implying a stale check order, or remove the ordering implication and cite
SPEC-016's `behavior.spec.md` §2.2 by reference only) — consistent with how every prior round's
BLOCKING findings in this package have been narrow, mechanical fixes rather than evidence of a
systemic quality collapse. All 4 prior findings from round 2 (1 BLOCKING, 3 ADVISORY) are confirmed
genuinely resolved, independently re-derived rather than trusted from the revision note or the
Coordinator's own hand-verification. The mandatory SPEC-016 v1.2.0 citation re-sync (Part 2) found
every direct REQ-id/quoted-text citation in SPEC-018's Integration Contracts table still accurate —
RT-014 is not a citation-id error, it is a restatement of internal mechanism detail (check
ordering) that has drifted out of sync with SPEC-016's own corrected behavior, which is exactly
the failure mode SPEC-016 was created to prevent and exactly what this round's mandatory re-sync
was chartered to catch.

RT-015, RT-016, and RT-017 (ADVISORY) should be folded into the same revision pass for efficiency,
consistent with how every prior round's ADVISORY findings were folded into the same revision as
that round's BLOCKING fixes rather than deferred to a later round.
