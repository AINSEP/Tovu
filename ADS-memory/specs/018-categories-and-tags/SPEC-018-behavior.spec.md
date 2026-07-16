# Behavior Rules Spec: categories-and-tags

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-018 |
| feature_name | FEAT-018-categories-and-tags |
| version | 1.3.0 |
| content_hash | sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60 |
| last_edited | 2026-07-15T02:00:00Z |

**Purpose:** Captures the deterministic, rule-based behavior of the taxonomy write chokepoint that
acceptance criteria alone don't fully express — the fixed validation-check ordering, the defaults
for seeded taxonomies, the hierarchy-depth/limits picture, and the merge-dedup boundary
conditions.

---

## EARS Syntax Guide

All behavior rules below use EARS (Easy Approach to Requirements Syntax) format.

---

## 1. Precedence Rules

### 1.1 Content-type/lens precedence vs. hardcoded allow-list

**Situation:** `assignTerms` is called for `contentType ∈ {'post','page'}`.

**Sources in precedence order (highest to lowest):**
1. The hardcoded `post`/`page` allow-list (REQ-06) — evaluated first; if the taxonomy isn't on it,
   reject immediately with `TAXONOMY_NOT_APPLICABLE` without resolving the content row at all.
2. Workspace-ownership validation (REQ-07).
3. Content-type/lens validation against the resolved row's own `kind` (REQ-08).

**Example:**
- Scenario: a caller assigns a taxonomy not on the allow-list to a `post` row that also happens to
  belong to a different workspace than the caller supplied.
- Input: `taxonomyId` not applicable to `post`; `workspaceId` mismatched.
- Result: `TAXONOMY_NOT_APPLICABLE` is returned — the cheaper, no-lookup-required check runs first
  and short-circuits before the workspace lookup is even performed.

**Test requirement:** The TDD Agent must write a test proving the allow-list check runs before any
database lookup of the target content row.

### 1.2 Watermark/outbox obligation vs. domain-specific write

**Situation:** Any taxonomy mutation commits its own row change.

**Sources in precedence order (highest to lowest):**
1. The domain-specific row write (e.g. `terms` insert/update, `entry_terms` insert/delete) and the
   watermark-stamping call (SPEC-016 REQ-01/REQ-02) happen inside the same transaction — neither
   is "first," they are atomic together.
2. The outbox enqueue happens in the same transaction as both of the above.

**Example:**
- Scenario: `renameTerm` succeeds.
- Input: a valid rename request.
- Result: the `terms` row update, the `storage_write_watermark` increment, and the outbox row
  insert either all commit together or (on any failure) none of them do — this domain never
  partially commits a rename without its watermark stamp.

**Test requirement:** The TDD Agent must write a test proving a simulated failure after the row
write but before the watermark stamp rolls back the entire transaction, leaving no partial state.

---

## 2. Ordering Rules

### 2.1 Ordinary-mutation validation chain ordering

**Sequence:** `authorize()` (REQ-17/SPEC-016 REQ-14) → allow-list check (REQ-06, when
`contentType`-scoped) → workspace-ownership check (REQ-07, when content-scoped) → content-type/lens
check (REQ-08, when content-scoped) → hierarchy checks (REQ-10 → [resolve the candidate `parentId`/
`newParentId` to an existing term, rejecting with `TERM_NOT_FOUND` if it does not resolve to any
term at all — Red-Team RT-012] → REQ-09 → REQ-11, when `parentId`-scoped, in that exact sub-order)
→ domain-specific write.

**Resolution of Red-Team RT-001 (BLOCKING):** The hierarchy-check sub-order is REQ-10
(hierarchical-mode) *before* REQ-09 (same-taxonomy), not the other way around. This is a deliberate
choice, not an arbitrary tie-break: REQ-10's check is strictly cheaper (it only reads the child
term's own already-resolved taxonomy row; it requires no lookup of the candidate parent term at
all), and running it first makes §7's Edge Case Handling table's EC-04 claim
("`reparentTerm`/`createTerm` called with a non-null `parentId` on a `hierarchical=false` taxonomy`
→ `TAXONOMY_NOT_HIERARCHICAL`") unconditionally true — including the compound case where the
supplied `parentId` also belongs to a different taxonomy than the child term's own (the common case
for a flat/tag taxonomy, which never has a legitimate same-taxonomy parent to begin with). Under
this order, `PARENT_CROSS_TAXONOMY` (EC-03) can only ever fire for a term whose own taxonomy is
already known to be hierarchical, since REQ-10 has already passed by the time REQ-09 runs.

**Stability:** This ordering is fixed for every ordinary mutation. A mutation type only runs the
checks that apply to it (e.g. `renameTerm` runs none of the content-join or hierarchy checks).

**When overridden:** Never — this is the one ordering rule this domain makes non-negotiable for
ordinary mutations, mirroring how SPEC-016 treats its own `execute()` check sequence as
non-negotiable (SPEC-016 `behavior.spec.md` §2.2).

**Invariant:** No check later in this order may run once an earlier check has failed.

### 2.2 mergeTerm step ordering

**Sequence:** `planMergeTerm()` MUST precede `confirmMergeTerm()`; `confirmMergeTerm()` MUST
precede `executeMergeTerm()` — this is SPEC-016's REQ-08 gated-mutation ordering rule, instantiated
for this domain's one gated mutation, not a separate rule this domain invents.

**Tie-break:** Not applicable — sequential gate checks, not competing candidates.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `taxonomies` seeded rows | first boot / provisioning | `category` (`hierarchical: true`), `tag` (`hierarchical: false`) | ADR-044 §1 names these two as the shipped instances of the shared primitive; every workspace gets both without an operator having to create them |
| `term.parentId` | `CREATE_TERM` when omitted | `null` | A term with no stated parent is top-level within its taxonomy — the safe, unambiguous default |
| `entryTerm.position` | `ASSIGN_TERMS` | `0` | No display-ordering preference stated by ADR-044; `0` for every new assignment is a stable, deterministic default. Reordering itself is out of scope for v1 (Red-Team RT-009; see `feature.spec.md` Out of Scope) — this default is forward-compatible groundwork, not an implied v1 capability |
| `taxonomy.status` / `term.status` | creation | `'active'` | A newly created taxonomy/term is usable immediately; nothing in ADR-044 implies a draft/pending state for taxonomy metadata itself. `'deprecated'` is display/filtering-only in v1 — no write-time enforcement gates further mutation of a deprecated row (Red-Team RT-006; see `feature.spec.md` Scope) |
| `mergeTerm` confirmation token TTL | `TERM_MERGE_CONFIRM` response | exactly `600 seconds (10 minutes)`, no jitter | Reused verbatim from SPEC-016 REQ-10 (ADR-041 §3's originating "~10 minutes" was pinned to an exact figure by SPEC-016 v1.1.0) — this domain does not define an independent TTL for its one gated mutation |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| `mergeTerm` confirmation token TTL | exactly 600 seconds (10 minutes), no jitter | API (`TERM_MERGE_CONFIRM`/`TERM_MERGE_EXECUTE`) | Fixed by SPEC-016 REQ-10 (originating in ADR-041 §3); not a free parameter for this domain (Agent Directives, `feature.spec.md`) |
| `mergeTerm` token redemption count | exactly 1 | API (`executeMergeTerm`) | SPEC-016 INV-03, applied to this domain's token |
| Maximum term-hierarchy depth | not addressed | n/a | ADR-044 does not state a maximum nesting depth for categories; this spec does not invent one — cycle prevention (REQ-11) is the only structural bound in scope |
| Maximum taxonomies per content type | not addressed | n/a | See `feature.spec.md` OQ-02 — explicitly an open question, not a silently assumed limit |

---

## 5. Deduplication Rules

**What counts as a duplicate:** For `entry_terms`, the tuple `(workspaceId, contentType,
contentId, termId)` is the duplicate key (`entry_terms_unique`, INV-04). Two `assignTerms` calls
adding the same term to the same content produce at most one row, never two.

**mergeTerm's dedup role:** When `executeMergeTerm` re-points every `entry_terms` row from
`fromTermId` to `intoTermId`, any row that would collide with an existing `(workspaceId,
contentType, contentId, intoTermId)` row is dropped rather than duplicated — this is the exact
mechanism EC-06 describes, and the dropped row is the one that is not independently recoverable
afterward.

---

## 6. Tie-Break Logic

N/A — this domain has no scenario where multiple candidate rows compete for the same role. The
ordinary-mutation validation chain (behavior 2.1) and the `mergeTerm` step ordering (behavior 2.2)
are both strictly sequential gate evaluations, not tie-breaks between competing candidates.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| `assignTerms` called with a `termId` from a different workspace than the resolved content row | `WORKSPACE_MISMATCH` returned before any row is written (EC-01) | Yes |
| `assignTerms` called with `contentType: "page"` against a `posts` row whose actual `kind` is `"post"` | `CONTENT_TYPE_MISMATCH` returned (EC-02) | Yes |
| `reparentTerm` called with a `newParentId` in a different `taxonomyId`, on a term whose own taxonomy is hierarchical | `PARENT_CROSS_TAXONOMY` returned (EC-03) — only reachable once REQ-10's hierarchical-mode check has already passed | Yes |
| `createTerm` called under a hierarchical target taxonomy with a `parentId` in a different `taxonomyId` | `PARENT_CROSS_TAXONOMY` returned (EC-03a) — identical outcome to `reparentTerm`'s EC-03, since REQ-09 covers both mutation types (Red-Team RT-011) | Yes |
| `createTerm`/`reparentTerm` called with a `parentId`/`newParentId` that does not resolve to any existing term | `TERM_NOT_FOUND` returned (EC-03b) — distinct from EC-03/EC-03a (parent exists, wrong taxonomy) and EC-05/EC-05a/EC-05b (parent exists, would create a cycle); Red-Team RT-012 | Yes |
| `reparentTerm`/`createTerm` called with a non-null `parentId` on a `hierarchical=false` taxonomy | `TAXONOMY_NOT_HIERARCHICAL` returned **unconditionally**, before the same-taxonomy check even runs (EC-04) — resolves Red-Team RT-001; see §2.1 | Yes |
| `reparentTerm` would create an ancestor cycle | `HIERARCHY_CYCLE_DETECTED` returned before any write (EC-05) | Yes |
| `reparentTerm` called with `newParentId` equal to the term's own id (self-parenting) | `HIERARCHY_CYCLE_DETECTED` returned — the minimal degenerate case of the same cycle rule (EC-05a) | Yes |
| `reparentTerm` would create a 3+-node ancestor cycle | `HIERARCHY_CYCLE_DETECTED` returned — `wouldCreateCycle`'s recursive walk detects cycles at any depth (EC-05b) | Yes |
| `mergeTerm` deduplicates an `entry_terms` row for content already assigned to both terms | the duplicate row for `fromTermId` is dropped and not recoverable afterward; `taxonomy_revisions` records only the term-metadata mapping (EC-06) | Yes |
| `mergeTerm`'s `planMergeTerm`/`executeMergeTerm` is called with `fromTermId === intoTermId` (self-merge) | `planMergeTerm` rejects with `SAME_TERM_MERGE` before any overlap computation; no plan is ever produced (EC-06a) | Yes |
| A content row referenced by `entry_terms` is deleted through a path that does not emit the cleanup event | rows become orphaned, inert on read, removed at next reconciliation sweep (EC-07) | Yes |
| `assignTerms` called for a taxonomy not on the `post`/`page` allow-list | `TAXONOMY_NOT_APPLICABLE` returned (EC-08) | Yes |
| Two concurrent `assignTerms` calls add the same term to the same content simultaneously | `entry_terms_unique` prevents a duplicate row; both calls complete as idempotent no-ops with a success response — never a conflict error (EC-09; Red-Team RT-008 dropped the ambiguous "or fails with a conflict" branch) | Yes |
| A second `planMergeTerm`/`confirmMergeTerm` pair is started for the same `fromTermId`/`intoTermId` before the first token is redeemed or expired | mints an independent additional token, per SPEC-016's stated default assumption for its generic gateway (SPEC-016 OQ-04/`behavior.spec.md` §7) — this domain does not override that default | Yes |
