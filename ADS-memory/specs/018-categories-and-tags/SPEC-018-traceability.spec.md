# Traceability Matrix: categories-and-tags

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-018 |
| feature_name | FEAT-018-categories-and-tags |
| version | 1.3.0 |
| content_hash | sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60 |
| last_edited | 2026-07-15T02:00:00Z |
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every requirement, acceptance criterion, invariant, and edge case in
`SPEC-018-feature.spec.md` forward to implementation and test coverage. No implementation exists
yet — this spec has not been dispatched to Software Architect or TDD. Every row below is
intentionally `PENDING`.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | One shared write-service/schema for categories and tags via `hierarchical` boolean | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Both category and tag taxonomies exist in the same `taxonomies` table | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | `hierarchical=1` allows `parentId`; `hierarchical=0` forces `parentId=null` | — | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-02) | Non-null parentId rejected on a flat (tag) taxonomy | P1 | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-02) | Valid same-taxonomy parentId accepted on a hierarchical (category) taxonomy | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Term-to-content relations stored as real rows, never JSON array | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | `posts` row contains no JSON/delimited term-membership field | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | "All content tagged X" answerable via a single indexed relational query | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-04) | Reverse lookup uses `idx_entry_terms_by_term`, no full posts scan | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | `entry_terms` uses the soft polymorphic (workspaceId, contentType, contentId) tuple | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-05) | No DB-level FK from entry_terms to posts; validated at write time instead | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | post/page taxonomy applicability via hardcoded, permanent allow-list | — | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-06) | assignTerms rejected for a taxonomy not on the allow-list | P1 | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-06) | Allow-list check never queries content_types for post/page, even after ADR-043/SPEC-020 ships (verified by mechanism-level call-count assertion / architectural review, not a live-state behavioral test — see feature.spec.md) | P2 | pending | pending | pending | pending | PENDING |
| REQ-07 | Write chokepoint validates workspace match before writing | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-07) | Cross-workspace assignTerms rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-07) | Same-workspace assignTerms proceeds to lens check | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Write chokepoint validates content row's own type/lens matches supplied contentType | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-08) | contentType='page' against a posts.kind='post' row rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | parentId must belong to the same taxonomyId as the child; a parentId/newParentId that resolves to no existing term is rejected with TERM_NOT_FOUND | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-09) | Cross-taxonomy parentId rejected (reparentTerm) | P1 | pending | pending | pending | pending | PENDING |
| AC-12a (REQ-09) | Cross-taxonomy parentId rejected (createTerm) | P1 | pending | pending | pending | pending | PENDING |
| AC-12b (REQ-09) | parentId/newParentId that resolves to no existing term rejected with TERM_NOT_FOUND | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | parentId must be null when taxonomy is non-hierarchical | — | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-10) | Non-null parentId on a tag taxonomy rejected at createTerm | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | parentId update rejected if it creates a cycle | — | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-11) | Reparent creating an ancestor cycle rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Every taxonomy/term mutation writes an append-only taxonomy_revisions row, carrying composite actor identity (delegatedByWorkspaceId/delegatedById when actor is agent/api_key, per SPEC-016 REQ-16) | — | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-12) | renameTerm commit produces a taxonomy_revisions row with pre-rename state | P1 | pending | pending | pending | pending | PENDING |
| AC-15a (REQ-12) | taxonomy_revisions row for a kind='agent' delegated actor carries (delegatedByWorkspaceId, delegatedById) | P1 | pending | pending | pending | pending | PENDING |
| AC-15b (REQ-12) | taxonomy_revisions row for a kind='api_key' actor carries (delegatedByWorkspaceId, delegatedById) identifying the owning user | P1 | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-12) | mergeTerm execute produces a taxonomy_revisions row with op='merge' | P1 | pending | pending | pending | pending | PENDING |
| REQ-13 | entry_terms membership changes are NOT revisioned (explicit ADR-022 §4a narrowing) | — | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-13) | assignTerms commit produces no taxonomy_revisions row | P1 | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-13) | ADR-022 §4a CI canary recognizes entry_terms as an allow-listed exemption | P2 | pending | pending | pending | pending | PENDING |
| REQ-14 | Every mutating write stamps the watermark and enqueues an outbox event, same transaction | — | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-14) | renameTerm commit includes exactly one watermark stamp + one outbox enqueue | P1 | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-14) | assignTerms commit includes exactly one watermark stamp + one outbox enqueue | P1 | pending | pending | pending | pending | PENDING |
| REQ-15 | mergeTerm implemented as this domain's one gated mutation via SPEC-016's gateway | — | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-15) | No direct single-call mergeTerm entry point exists | P1 | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-15) | plan/confirm/execute pair runs the merge exactly once, subject to SPEC-016 rejections | P1 | pending | pending | pending | pending | PENDING |
| REQ-15a | mergeTerm rejects a self-merge (fromTermId === intoTermId) with SAME_TERM_MERGE before any plan is produced | — | pending | pending | pending | pending | PENDING |
| AC-22a (REQ-15a) | planMergeTerm with fromTermId===intoTermId rejected with SAME_TERM_MERGE, no plan returned | P1 | pending | pending | pending | pending | PENDING |
| REQ-16 | mergeTerm's plan() discloses irrecoverable pre-merge assignment loss | — | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-16) | Plan discloses overlapping content will lose pre-merge assignment | P1 | pending | pending | pending | pending | PENDING |
| AC-24 (REQ-16) | Plan states no loss when no overlap exists | P2 | pending | pending | pending | pending | PENDING |
| REQ-17 | All other taxonomy mutations are ordinary (non-gated); authorize() before idempotency | — | pending | pending | pending | pending | PENDING |
| AC-25 (REQ-17) | Unauthorized renameTerm rejected before any other side effect (no idempotencyKey field exists in this domain's v1 contracts) | P1 | pending | pending | pending | pending | PENDING |
| AC-26 (REQ-17) | createTaxonomy succeeds with no plan()/confirmation token required | P2 | pending | pending | pending | pending | PENDING |
| REQ-18 | Taxonomy library subscribes to content-deletion event for entry_terms cleanup | — | pending | pending | pending | pending | PENDING |
| AC-27 (REQ-18) | Deletion event processed, entry_terms rows removed for that content | P1 | pending | pending | pending | pending | PENDING |
| REQ-19 | Orphaned entry_terms rows inert-on-read and swept by reconciliation | — | pending | pending | pending | pending | PENDING |
| AC-28 (REQ-19) | Orphaned row silently omitted from reverse-lookup join, not an error | P1 | pending | pending | pending | pending | PENDING |
| AC-29 (REQ-19) | Reconciliation sweep removes orphaned rows | P1 | pending | pending | pending | pending | PENDING |
| REQ-20 | admin.taxonomy.manage for mutation; admin.taxonomy.read for read-only | — | pending | pending | pending | pending | PENDING |
| AC-30 (REQ-20) | Read-only principal rejected with FORBIDDEN on renameTerm | P1 | pending | pending | pending | pending | PENDING |
| AC-31 (REQ-20) | user/agent/api_key each holding read succeed identically on list | P1 | pending | pending | pending | pending | PENDING |
| REQ-21 | Human admin CRUD routes under /api/admin/v1/taxonomy | — | pending | pending | pending | pending | PENDING |
| AC-32 (REQ-21) | Route registry has CRUD routes for taxonomies/terms/assignment | P1 | pending | pending | pending | pending | PENDING |
| REQ-22 | Agent-tool catalog: taxonomy CRUD + assign/unassign; merge follows plan/execute naming; functional (not name-pattern) ban on any tool performing confirm() | — | pending | pending | pending | pending | PENDING |
| AC-33 (REQ-22) | taxonomy_plan_merge_term/taxonomy_execute_merge_term exist; no tool of any name maps to confirmMergeTerm — verified by mechanism-level inspection of each tool's mapped orchestrator action, not a name-pattern check | P1 | pending | pending | pending | pending | PENDING |

<!-- All REQ-* and AC-* rows above are copied from SPEC-018-feature.spec.md. -->

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | A term's parentId, if non-null, always references a term in the same taxonomyId | pending | pending | PENDING |
| INV-02 | A term's parentId is always null when its taxonomy has hierarchical=0 | pending | pending | PENDING |
| INV-03 | The term hierarchy under any taxonomy never contains a cycle | pending | pending | PENDING |
| INV-04 | (workspaceId, contentType, contentId, termId) never has more than one entry_terms row | pending | pending | PENDING |
| INV-05 | No taxonomy_revisions row is ever produced for an assignTerms/unassignTerms change | pending | pending | PENDING |
| INV-06 | mergeTerm never executes without a prior successful confirm() bound to the same planHash | pending | pending | PENDING |
| INV-07 | An orphaned entry_terms row never causes a read to fail with an error | pending | pending | PENDING |
| INV-08 | mergeTerm never executes with fromTermId === intoTermId | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | assignTerms with a cross-workspace termId | pending | pending | PENDING |
| EC-02 | assignTerms with a contentType/kind lens mismatch | pending | pending | PENDING |
| EC-03 | reparentTerm with a cross-taxonomy newParentId | pending | pending | PENDING |
| EC-03a | createTerm with a cross-taxonomy parentId | pending | pending | PENDING |
| EC-03b | createTerm/reparentTerm with a parentId/newParentId that resolves to no existing term | pending | pending | PENDING |
| EC-04 | reparentTerm/createTerm with a non-null parentId on a flat taxonomy | pending | pending | PENDING |
| EC-05 | reparentTerm creating an ancestor cycle | pending | pending | PENDING |
| EC-05a | reparentTerm with newParentId equal to the term's own id (self-parenting) | pending | pending | PENDING |
| EC-05b | reparentTerm creating a 3+-node ancestor cycle | pending | pending | PENDING |
| EC-06 | mergeTerm deduplicating an overlapping entry_terms row | pending | pending | PENDING |
| EC-06a | mergeTerm called with fromTermId === intoTermId (self-merge) | pending | pending | PENDING |
| EC-07 | Content row deleted outside the taxonomy chokepoint | pending | pending | PENDING |
| EC-08 | assignTerms for a taxonomy not on the post/page allow-list | pending | pending | PENDING |
| EC-09 | Two concurrent assignTerms calls for the same term/content pair (idempotent no-op only, per Red-Team RT-008) | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| TAXONOMY_NOT_FOUND | pending | pending | pending | PENDING |
| TERM_NOT_FOUND | pending | pending | pending | PENDING |
| TAXONOMY_NOT_HIERARCHICAL | pending | pending | pending | PENDING |
| PARENT_CROSS_TAXONOMY | pending | pending | pending | PENDING |
| HIERARCHY_CYCLE_DETECTED | pending | pending | pending | PENDING |
| WORKSPACE_MISMATCH | pending | pending | pending | PENDING |
| CONTENT_TYPE_MISMATCH | pending | pending | pending | PENDING |
| TAXONOMY_NOT_APPLICABLE | pending | pending | pending | PENDING |
| SAME_TERM_MERGE | pending | pending | pending | PENDING |
| PLAN_STALE (reused from SPEC-016) | pending | pending | pending | PENDING |
| TOKEN_EXPIRED (reused from SPEC-016) | pending | pending | pending | PENDING |
| TOKEN_ALREADY_REDEEMED (reused from SPEC-016) | pending | pending | pending | PENDING |
| FORBIDDEN (reused from SPEC-016) | pending | pending | pending | PENDING |
| UNAUTHENTICATED (reused from SPEC-016) | pending | pending | pending | PENDING |
| VALIDATION_ERROR (reused from SPEC-016) | pending | pending | pending | PENDING |
| RATE_LIMIT_EXCEEDED (reused from SPEC-016) | pending | pending | pending | PENDING |
| INTERNAL_ERROR (reused from SPEC-016) | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Allow-list precedence vs. workspace/lens checks | § 1.1 | pending | pending | PENDING |
| Watermark/outbox obligation atomicity with domain write | § 1.2 | pending | pending | PENDING |
| Ordinary-mutation validation chain ordering | § 2.1 | pending | pending | PENDING |
| mergeTerm plan/confirm/execute step ordering | § 2.2 | pending | pending | PENDING |
| Default: seeded category/tag taxonomies | § 3 | pending | pending | PENDING |
| Default: term.parentId = null | § 3 | pending | pending | PENDING |
| Default: entryTerm.position = 0 | § 3 | pending | pending | PENDING |
| Default: taxonomy/term status = active | § 3 | pending | pending | PENDING |
| Default: mergeTerm token TTL = exactly 600 seconds (10 minutes), no jitter | § 3 | pending | pending | PENDING |
| Limit: mergeTerm token TTL / redemption count | § 4 | pending | pending | PENDING |
| Dedup: entry_terms_unique tuple | § 5 | pending | pending | PENDING |
| Edge case: assignTerms cross-workspace/lens mismatch | § 7 | pending | pending | PENDING |
| Edge case: reparentTerm cross-taxonomy/non-hierarchical/cycle | § 7 | pending | pending | PENDING |
| Edge case: mergeTerm overlap dedup loss | § 7 | pending | pending | PENDING |
| Edge case: mergeTerm self-merge (fromTermId === intoTermId) rejection | § 7 | pending | pending | PENDING |
| Edge case: reparentTerm self-parenting and 3+-node cycle | § 7 | pending | pending | PENDING |
| Edge case: orphaned entry_terms after out-of-band deletion | § 7 | pending | pending | PENDING |
| Edge case: taxonomy not on allow-list | § 7 | pending | pending | PENDING |
| Edge case: concurrent assignTerms race | § 7 | pending | pending | PENDING |
| Edge case: second confirm before first merge token resolved | § 7 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| All REQ/AC rows above | This is a spec-stage artifact; Software Architect and TDD have not yet been dispatched for SPEC-018 | Upon SPEC-018 implementation (dependent on SPEC-016's contract being realized first or in parallel) | Coordinator |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| All REQ/AC rows above | No implementation exists yet to test | Upon SPEC-018 TDD dispatch | Coordinator |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| All error codes above | No implementation exists yet to test | Upon SPEC-018 TDD dispatch | Coordinator |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| — | — | No requirement in this spec is deferred — every REQ/AC here is in-scope for this domain spec | — |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval — all
      entries here are explicitly "pending implementation," not deferred/skipped
- [x] Section 6.2 (untested) is empty or all entries are DEFERRED with approval — same basis
- [x] Section 6.3 (untested error codes) is empty or all entries are DEFERRED with approval — same basis
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Review Agent — not
      applicable yet; no row has reached VERIFIED status

**[ ] TRACEABILITY COMPLETE** — not yet; this is a spec-stage package, pending implementation.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-14 | Seeded matrix from feature.spec.md; all rows PENDING |
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-14 | v1.1.0 revision: added REQ-15a/AC-22a/INV-08/EC-05a/EC-05b/EC-06a/SAME_TERM_MERGE rows (Red-Team RT-001–RT-009 fold-in); all still PENDING |
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-15 | v1.2.0 revision: added AC-12a/AC-12b/EC-03a/EC-03b (Red-Team RT-011/RT-012 fold-in) and AC-15a/AC-15b (Red-Team RT-010 composite actor-identity fold-in); all still PENDING |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Review Agent | | | |
| Coordinator | | | |
