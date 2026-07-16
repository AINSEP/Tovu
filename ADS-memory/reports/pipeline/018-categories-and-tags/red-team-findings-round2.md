# Red-Team Findings (Round 2): categories-and-tags

- Feature: FEAT-018-categories-and-tags
- Spec version: 1.1.0
- Spec hash: sha256:6e959768c9165b5c32c73a286022103ebe6f43a4186d4ded2c323792fe317505 (mechanically
  verified — see "Hash Verification" below)
- Red-Team completed: 2026-07-14T23:59:00Z
- Round: 2 (fresh full adversarial pass against the v1.1.0 revision, not a checklist re-check)
- Finding count: 1 BLOCKING · 3 ADVISORY · 0 CONSTITUTION_FLAG

---

## Hash Verification

Ran the provider-local validator without `--update-hash` to confirm the recorded hash is already
canonical (not merely asserted):

```
python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py \
  ADS-memory/specs/018-categories-and-tags --phase spec
→ PASS: strict Speckit package passed mechanical validation. (exit 0)
```

A clean pass with no `--update-hash` confirms `sha256:6e959768...5` in every package file's header
is the true canonical hash of the current content — it did not need recomputation.

---

## Part 1 — Disposition of Round-1 Findings (RT-001 through RT-009)

### RT-001 (prior: BLOCKING, contradiction) — **RESOLVED**

Round 1 found that `behavior.spec.md` §2.1's fixed hierarchy sub-order (originally REQ-09 →
REQ-10 → REQ-11) contradicted §7's unconditional EC-04 claim in the compound
cross-taxonomy-plus-non-hierarchical case. The revision reorders the sub-order to **REQ-10
(hierarchical-mode) → REQ-09 (same-taxonomy) → REQ-11 (cycle)**.

I re-derived the fix from scratch rather than trusting the revision note, enumerating every
combination of (term's own taxonomy: hierarchical H / flat F) × (candidate parent: same taxonomy S
/ different taxonomy D / null N) for both `createTerm` and `reparentTerm`:

| Term's taxonomy | Candidate parent | REQ-10 (runs 1st) | REQ-09 (runs 2nd) | Result |
|---|---|---|---|---|
| F | null | pass (null always ok) | n/a | succeeds |
| F | non-null, any taxonomy (S or D) | **fails → `TAXONOMY_NOT_HIERARCHICAL`** | never reached | EC-04 fires unconditionally, regardless of what taxonomy the parent belongs to |
| H | null | pass | n/a | succeeds (moves to top-level) |
| H | non-null, same taxonomy (S) | pass | pass | proceeds to REQ-11 cycle check |
| H | non-null, different taxonomy (D) | pass | **fails → `PARENT_CROSS_TAXONOMY`** | EC-03 fires, only reachable once REQ-10 has already passed |

This confirms the claim in `feature.spec.md` EC-04 and `behavior.spec.md` §2.1 is now
unconditionally true: REQ-10 only ever reads the child term's own already-resolved taxonomy row,
so it can reject a non-null `parentId` on a flat taxonomy without ever needing to know which
taxonomy the supplied `parentId` itself resolves to. The reordering eliminates the exact compound
case RT-001 named, and I could not construct any input combination where the fixed order produces
a result inconsistent with EC-03/EC-04's stated expectations. `state.spec.md`'s `CREATE_TERM`/
`REPARENT_TERM` preconditions and `orchestrator.spec.md`'s `onBeforeOrdinaryWrite` hook both encode
the same REQ-10 → REQ-09 → REQ-11 order consistently. **No residual contradiction found.**

### RT-002 (prior: BLOCKING, missing-failure-mode) — **RESOLVED**

REQ-15a, AC-22a, EC-06a, INV-08, and the `SAME_TERM_MERGE` error code were added for the
`fromTermId === intoTermId` self-merge case, checked at `planMergeTerm` before any overlap
computation. I traced this addition through every file in the package: `state.spec.md`'s
`PLAN_MERGE_TERM` precondition, `orchestrator.spec.md`'s `onBeforeMergePlanCompute` hook and
`planMergeTerm` failure codes, `api.spec.md`'s `TERM_MERGE_PLAN` 400 mapping and Agent Tool Catalog
rule, `errors.spec.md`'s registry entry (with a details schema and ownership row), `ui.spec.md`'s
`MergeTermDialog` note (server-side check remains authoritative even though the 2-term multi-select
trigger can't supply a duplicate), and `traceability.spec.md`'s REQ-15a/AC-22a/INV-08/EC-06a rows.
All eight touchpoints agree with each other. **No gap remains.**

### RT-003 (prior: BLOCKING, untestable/ambiguity) — **RESOLVED**

REQ-22 and AC-33 are restated functionally. I compared the restated text word-for-word against
SPEC-016's actual current REQ-22 (`SPEC-016-feature.spec.md` line 231-234): "...MUST NOT expose any
agent-callable tool that performs the `confirm()` step" — SPEC-018's REQ-22 now says "No
agent-callable tool in the catalog — regardless of its name — may perform the `confirm()` step for
`mergeTerm`... This is a functional prohibition." This is an accurate restatement, not merely an
accurate citation-of-wording; it closes the exact loophole RT-003 identified (a tool named e.g.
`taxonomy_finalize_merge_step2` that internally calls `confirmMergeTerm`). AC-33 and `api.spec.md`
§7's Agent Tool Catalog Contract rule both now say verification "MUST inspect each tool definition's
mapped orchestrator action, not its name" — this is genuinely mechanism-level, not name-pattern,
phrasing. **Fully resolved, and the fix generalizes correctly (it doesn't just patch around the one
example name RT-003 gave).**

### RT-004 (prior: ADVISORY, contradiction) — **RESOLVED**

OQ-03 is now marked "Resolved 2026-07-14 (Red-Team RT-004 fold-back)" in the same
resolved-with-reasoning-trail format as SPEC-016's OQ-04, stating the count-only shape is the
adopted answer. Matches `api.spec.md`/`ui.spec.md`'s existing count-only contracts. Consistent.

### RT-005 (prior: ADVISORY, untestable) — **RESOLVED**

AC-08 is restated as a mechanism-level, call-count assertion ("verified by a call-count assertion
(zero calls) on the `content_types` repository dependency"), with an explicit note that this is
Code-Review-verified architectural review, not a black-box behavioral comparison, and
`traceability.spec.md`'s AC-08 row echoes the same mechanism-level framing. Resolved.

### RT-006 (prior: ADVISORY, missing-failure-mode) — **RESOLVED**

`feature.spec.md`'s Scope section now states explicitly: "`'deprecated'` is display/filtering
guidance only in v1 — no write-time enforcement... A deprecated taxonomy/term remains fully mutable
and assignable." `behavior.spec.md`'s Default Values table repeats the same statement for
`taxonomy.status`/`term.status`. Resolved — the previously silent boundary condition is now an
explicit, stated answer (not merely a removed question).

### RT-007 (prior: ADVISORY, traceability gap) — **RESOLVED**

EC-05a (self-parent) and EC-05b (3+-node cycle) were added as their own edge cases, each with its
own `traceability.spec.md` row, and `state.spec.md`'s `wouldCreateCycle` selector description was
tightened to explicitly separate "candidateParentId is termId itself" from "any existing
descendant" as two distinct disjuncts (so self-parenting is explicit, not merely assumed subsumed
under "descendant"). Resolved.

### RT-008 (prior: ADVISORY, untestable) — **RESOLVED**

EC-09 now commits to the idempotent-no-op-only behavior; the ambiguous "or fails with a conflict"
branch is gone from `feature.spec.md`, `behavior.spec.md` §7, and `traceability.spec.md`. I checked
`errors.spec.md` and `api.spec.md`'s `CONTENT_TERMS_ASSIGN` error mapping for any lingering
409/conflict code that would contradict this commitment — none exists. Resolved cleanly.

### RT-009 (prior: ADVISORY, ambiguity) — **RESOLVED**

`feature.spec.md`'s Out of Scope list now explicitly states `entryTerm.position` reordering is not
a v1 capability, and `behavior.spec.md`'s Default Values table cross-references this. Resolved.

**Summary: all 3 prior BLOCKING findings and all 6 prior ADVISORY findings are genuinely resolved
in the current package, not just asserted resolved.** I independently re-derived RT-001's fix
rather than trusting the revision note, and it holds.

---

## Part 2 — Integration Contracts Citation-Accuracy Re-Check (against SPEC-016's CURRENT text)

Read `SPEC-016-feature.spec.md` v1.1.0 in full directly (not from memory/paraphrase) and compared
every cited id in SPEC-018's `## Integration Contracts` table line-by-line:

| SPEC-016 id(s) cited | SPEC-016's actual current text | Match? |
|---|---|---|
| REQ-18 (soft cross-boundary reference rule) | "MUST have its target existence and workspace ownership validated... at write time, MUST tolerate orphaned rows as inert-on-read..., and MUST be swept by a periodic or boot-time reconciliation process" | Verbatim match |
| REQ-16/REQ-17 (composite actor-identity, soft value-join) | Matches, used only as contextual grounding | Accurate (see also Part 3 below — a **new** finding about whether this citation's implications are fully carried through to `state.spec.md`) |
| REQ-01/REQ-02 (watermark + stamping obligation, incl. REQ-02's "name every write chokepoint" clause) | Matches; REQ-02 itself names "Taxonomy's write-service" as a worked example | Accurate |
| REQ-08–REQ-13 (gated-mutation gateway) | Matches | Accurate |
| REQ-14 (authorize() before idempotency) | Verbatim match | Accurate |
| REQ-22 (functional confirm-step prohibition) | "MUST NOT expose any agent-callable tool that performs the `confirm()` step" — verbatim | Accurate (this is the RT-003 fix, confirmed against source) |
| REQ-10 TTL (**"exactly 600 seconds (10 minutes)... with no jitter or tolerance band"**) | Verbatim match | Accurate — this is the citation that was drifted at v1.0.0 ("~10 minutes") and is now corrected everywhere it's cited (Integration Contracts, Agent Directives, `behavior.spec.md` §3/§4, `api.spec.md`'s `MergeConfirmResponse` comment) |

**Result: PASS.** No stale, invented, or misquoted SPEC-016 citation found anywhere in SPEC-018's
current package. The TTL fix specifically named in the Coordinator's directive is confirmed
character-for-character against SPEC-016's actual REQ-10 text.

---

## Part 3 — New Findings (Fresh Full Pass)

These were not raised in Round 1 (Round 1 audited v1.0.0, before REQ-15a and the lettered-ID
content existed, and did not surface these specific gaps). All three are genuinely new to this
Round 2 pass.

### RT-010
- Severity: **BLOCKING**
- Category: contradiction / missing-failure-mode
- Location: `state.spec.md` §2 `TaxonomyRevision` entity; `orchestrator.spec.md` §4
  `executeMergeTerm` Action Contract; SPEC-016 REQ-16
- Description: `orchestrator.spec.md`'s Action Contracts table states that `executeMergeTerm`
  "stamps composite actor identity onto the `taxonomy_revisions` row (SPEC-016 REQ-16)". SPEC-016
  REQ-16 requires that **every** ledger/audit/revision row referencing a principal carry
  `(actorWorkspaceId, actorId)` and, additionally, `(delegatedByWorkspaceId, delegatedById)`
  whenever the actor is a delegated agent (`kind='agent'`) or an api_key acting for its owning
  user. But `state.spec.md` §2's `TaxonomyRevision` entity schema is:
  ```yaml
  TaxonomyRevision:
    seq: integer
    taxonomyId: string (ulid)
    perTaxonomySeq: integer
    workspaceId: string (ulid)
    stateJson: string
    actorId: string
    pluginId: string | null
    op: TaxonomyRevisionOp
    recordedAt: string (date-time)
  ```
  There is no `delegatedByWorkspaceId`/`delegatedById` field anywhere on this entity. This is not a
  hypothetical gap: this domain's agent-tool catalog (`api.spec.md` §7) makes
  `taxonomy_execute_merge_term` agent-callable with `actorClassRule:
  confirmer-must-equal-own-delegatedBy` — meaning an agent principal routinely *is* the actor for
  `executeMergeTerm`, and by REQ-16 the resulting `taxonomy_revisions{op:'merge'}` row MUST carry
  the delegator's `(delegatedByWorkspaceId, delegatedById)`. The canonical entity schema this spec
  hands to Programmer/TDD has nowhere to put that data. The same gap applies to every other
  agent-performed mutation's revision row (`taxonomy_create_term`, `taxonomy_rename_term`, etc. are
  all agent-callable per `api.spec.md` §7 and all produce a `taxonomy_revisions` row per REQ-12),
  not only the merge ceremony `orchestrator.spec.md` happens to call out by name. Two competent
  developers reading this package would diverge here: one adds ad hoc `delegatedBy*` columns not
  sanctioned by the canonical `TaxonomyRevision` shape (inventing a second, undocumented schema),
  the other implements exactly what `state.spec.md` specifies and silently fails to attribute
  delegated actions — a genuine audit-integrity gap for a domain whose entire `taxonomy_revisions`
  ledger exists to make mutations attributable. There is also no AC/EC anywhere in the package that
  tests composite actor-identity stamping on a `taxonomy_revisions` row at all (AC-16 only tests
  the `op:'merge'` term-metadata mapping, not the actor-identity columns), so this gap has zero
  test-coverage placeholder in `traceability.spec.md` either.
- Suggested resolution: Add `actorWorkspaceId` (if not intended to be inferred from the row's own
  `workspaceId`, since actor and taxonomy share a workspace in this domain — state that assumption
  explicitly if so) and `delegatedByWorkspaceId`/`delegatedById` (nullable) to `state.spec.md`'s
  `TaxonomyRevision` entity, add an AC (e.g. an addition to AC-16 or a new AC) asserting that an
  agent-authored `taxonomy_revisions` row carries the delegator's identity per SPEC-016 REQ-16, and
  add a corresponding `traceability.spec.md` row. Also clarify whether `orchestrator.spec.md`'s
  REQ-16 callout is meant to apply to `executeMergeTerm` only or to every taxonomy mutation's
  revision row (REQ-12's blanket "every taxonomy/term mutation" wording plus REQ-16's own blanket
  "every...revision row" wording both suggest the latter, which is the wider and more consequential
  reading).

---

### RT-011
- Severity: ADVISORY
- Category: missing-failure-mode / documentation-completeness
- Location: `feature.spec.md` REQ-09, AC-12, EC-03; `state.spec.md` `CREATE_TERM` Failure Handling;
  `api.spec.md` §6 `TERM_CREATE` Error Mapping
- Description: REQ-09's own text explicitly covers both mutation types — "A `reparentTerm`/
  term-create `parentId` value MUST be rejected unless the referenced parent term belongs to the
  same `taxonomyId`" — and `state.spec.md`'s `CREATE_TERM` action row lists `PARENT_CROSS_TAXONOMY`
  in its Failure Handling column, confirming the mechanism is meant to apply to `createTerm` too.
  But AC-12 and EC-03 only ever instantiate the `reparentTerm` case ("when `reparentTerm` is
  called..."); no AC or EC anywhere tests `createTerm` being called with a `parentId` that resolves
  to a term in a different taxonomy. More concretely, `api.spec.md` §6's Error Mapping table for
  `TERM_CREATE` lists only `400: VALIDATION_ERROR, TAXONOMY_NOT_HIERARCHICAL` — it omits
  `PARENT_CROSS_TAXONOMY` entirely, even though it documents the *sibling* check from the exact
  same validation chain for the exact same endpoint (REQ-10/`TAXONOMY_NOT_HIERARCHICAL`). This
  selective inclusion (one hierarchy-check code documented for `TERM_CREATE`, the other omitted)
  reads as an oversight rather than an intentional scope narrowing, since nothing in the package
  states `createTerm` is exempt from the cross-taxonomy check REQ-09 explicitly names it under.
  This is a lower-severity, cross-file completeness gap rather than a hard contradiction, because
  `state.spec.md` and `errors.spec.md` (whose ownership row cites "REQ-09 – REQ-11" generically,
  not endpoint-specific) both already establish the underlying rule correctly — a developer reading
  the full package (not `api.spec.md` in isolation) would very likely still implement this
  correctly.
- Suggested resolution: Add an AC (or extend AC-12) covering `createTerm` with a cross-taxonomy
  `parentId`, add `PARENT_CROSS_TAXONOMY` to `api.spec.md`'s `TERM_CREATE` error mapping row, and
  add the corresponding `traceability.spec.md` row.

### RT-012
- Severity: ADVISORY
- Category: missing-failure-mode / ambiguity
- Location: `state.spec.md` `CREATE_TERM`/`REPARENT_TERM` Failure Handling columns; `api.spec.md`
  §6 `TERM_REPARENT`/`TERM_CREATE` Error Mapping
- Description: No REQ/AC/EC anywhere addresses what happens when the supplied `parentId`/
  `newParentId` does not resolve to any existing term at all (as distinct from resolving to a term
  in the wrong taxonomy, which REQ-09 covers). `state.spec.md`'s `REPARENT_TERM` Failure Handling
  column lists `TERM_NOT_FOUND` generically — it is ambiguous whether this covers only the child
  `termId` not being found, the parent `newParentId` not being found, or both, since REQ-09's "the
  referenced parent term belongs to the same `taxonomyId`" presupposes the parent term exists.
  `CREATE_TERM`'s Failure Handling column omits `TERM_NOT_FOUND` altogether, even though REQ-09's
  same-taxonomy check for `createTerm` requires resolving the candidate parent term by id — leaving
  no defined outcome at all for a `createTerm` call whose `parentId` is well-formed but does not
  point at any real term. Two developers could reasonably diverge on whether a nonexistent
  `parentId` in `createTerm` should 404 with `TERM_NOT_FOUND` (most standard REST convention, and
  consistent with how `assignTerms` already handles a nonexistent `termId`) or should be silently
  folded into `PARENT_CROSS_TAXONOMY`/`VALIDATION_ERROR` since the same-taxonomy check technically
  can't be satisfied either way.
- Suggested resolution: Add an explicit statement that a `parentId`/`newParentId` that does not
  resolve to any existing term is rejected with `TERM_NOT_FOUND` (mirroring how `assignTerms`
  already treats a nonexistent `termId`), add `TERM_NOT_FOUND` to `CREATE_TERM`'s Failure Handling
  column and `api.spec.md`'s `TERM_CREATE` 404 mapping, and add a dedicated EC/AC for this case
  distinct from EC-03 (cross-taxonomy) and EC-05 (cycle).

### RT-013
- Severity: ADVISORY
- Category: untestable / documentation-integrity (spec-dod.md evidence staleness)
- Location: `spec-dod.md` items B-02, B-06, B-21, F-08, G-05
- Description: Several `spec-dod.md` evidence cells were not refreshed for this v1.1.0 revision
  pass and now contradict both the current file content and each other:
  - B-02 ("`version` is set to correct semver") cites evidence `1.0.0`, but every package file's own
    header (including `spec-dod.md`'s own Header Metadata table two sections above it) states
    `version: 1.1.0`.
  - B-06 ("`last_edited` is a valid ISO-8601 UTC timestamp") cites evidence `2026-07-14T21:00:00Z`
    — the v1.0.0-era timestamp — while `feature.spec.md`'s actual current header states
    `last_edited: 2026-07-14T23:30:00Z`.
  - F-08 ("All spec files have consistent version numbers") cites evidence "`1.0.0` in every file"
    — every file actually says `1.1.0`.
  - B-21 claims the package's acceptance criteria break down as "27 P1, 7 P2, no P3." I mechanically
    counted every `[P1]`/`[P2]`/`[P3]` tag in `feature.spec.md`'s Acceptance Criteria section
    (`grep -n '\[P[123]\]'`, excluding the one generic mention of the tag scheme in the Readiness
    Gate checklist text): the actual count across all 34 ACs (AC-01–AC-33 plus AC-22a) is **30 P1,
    4 P2, 0 P3.** G-05 separately claims "All 26 P1 ACs" — a third, different number, contradicting
    both B-21 and the actual count.
  None of these mistakes affect implementability — the `[P1]`/`[P2]` tags on the actual AC lines in
  `feature.spec.md` are themselves correct and unambiguous, and I found no case where a wrong
  priority tag was read from `spec-dod.md` instead of `feature.spec.md` by any downstream contract.
  But `spec-dod.md`'s own stated purpose is to be verified evidence of completion, not a template
  carried forward unedited, and "Overall DoD Result: PASS" in this file is only as trustworthy as
  the evidence backing each row — three internally-contradicting AC/P1 counts across two rows in
  the same document, plus two stale version/timestamp cells, indicate this file's Section B/F/G
  rows were not mechanically re-verified against the v1.1.0 content during the revision pass.
- Suggested resolution: Recompute and correct B-02, B-06, F-08 to the actual `1.1.0` /
  `2026-07-14T23:30:00Z` values, and recount B-21/G-05's AC priority tallies against the current
  `feature.spec.md` (30 P1 / 4 P2 / 0 P3), reconciling the two rows to agree with each other and
  with the file.

---

## Traceability & Lettered-ID Ordering Check (explicit Coordinator duty)

Checked whether the lettered-ID scheme (REQ-15a, AC-22a, EC-05a, EC-05b, EC-06a) introduced any
traceability gap or ambiguous ordering relative to the surrounding integer-numbered items:

- `traceability.spec.md` §1: REQ-15 → AC-21 → AC-22 → **REQ-15a → AC-22a** → REQ-16 → AC-23 → AC-24
  → REQ-17. Correctly interposed between REQ-15/REQ-16, immediately following the items it
  logically extends. No gap, no ordering ambiguity.
- `traceability.spec.md` §2 (Invariants): INV-01–INV-07 then **INV-08** appended at the end, rather
  than interposed near INV-06 (the other `mergeTerm`-related invariant). This is a minor ordering
  inconsistency (INV-08 is thematically about `mergeTerm`, like INV-06, but sits after the
  unrelated INV-07 orphan-read invariant) — purely cosmetic, since `feature.spec.md`'s own
  Invariants section places INV-08 in the identical appended position and `traceability.spec.md`
  mirrors it exactly 1:1. Not a defect, not worth a formal finding.
- `traceability.spec.md` §3 (Edge Cases): EC-05 → **EC-05a → EC-05b** → EC-06 → **EC-06a** → EC-07.
  Correctly interposed in both places. No gap.
- `errors.spec.md` §2: `SAME_TERM_MERGE` appended at the end of the registry table rather than
  interposed near the other validation-category codes — cosmetic only, no functional or
  traceability consequence (the code is still fully cross-referenced everywhere it's used).

**Result: no traceability gap or ambiguous ordering was introduced by the lettered-ID scheme.** The
two cosmetic append-at-end placements (INV-08, `SAME_TERM_MERGE`) do not create any missing row,
duplicate id, or reading-order ambiguity — they are consistently appended in the same position
across every file that lists them.

---

## Routing Decision

**1 BLOCKING finding (RT-010) and 3 ADVISORY findings (RT-011, RT-012, RT-013).**

This does not meet the "3 or more BLOCKING findings" bright-line threshold that forces a
"systemic quality problem" stop, but per the Red-Team Agent's own finding classification (`BLOCKING
— spec must be revised before Software Architect dispatch`), RT-010 alone still requires a revision
pass before Software Architect dispatch — **route back to Spec Agent.**

RT-010 is narrow and mechanical to fix (add two/three fields to one entity, add one AC, add one
traceability row) — consistent with how Round 1's three BLOCKING findings were each narrow and
mechanical rather than evidence of a systemic quality collapse. All three prior BLOCKING findings
and all six prior ADVISORY findings from Round 1 are confirmed genuinely resolved, not merely
asserted resolved — the package's overall quality trajectory is improving, not regressing.

RT-011, RT-012, and RT-013 (ADVISORY) should be folded into the same revision pass for efficiency,
consistent with how Round 1's ADVISORY findings were folded into this same v1.1.0 revision rather
than deferred to a second round.

No CONSTITUTION_FLAG findings were raised. `ADS-memory/governance/constitution.md` remains an
unratified template (confirmed by direct read in this round, independent of Round 1's own
confirmation) — the Constitution Compliance table's blanket N/A treatment for all 8 articles
remains accurate. No requirement in this package independently forces a custom-implementation-
over-library choice, a prohibitively-difficult test, or complexity untraceable to a stated
requirement.
