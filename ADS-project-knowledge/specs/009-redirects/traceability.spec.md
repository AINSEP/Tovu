# Traceability Matrix: redirects

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-009 |
| feature_name | FEAT-009-redirects |
| version | 1.0.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-12T00:00:00Z |
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every REQ/AC/INV/EC/error code/behavior rule in this spec package to its
future implementation and test. All rows are `pending` — no code exists yet beyond the
interface stubs in `src/redirects/ports.ts`/`types.ts`.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Create rule with matchType/fromPattern/toTarget/statusCode | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Create returns 201 with defaults | P1 | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-01) | Create wildcard rule stores unexpanded template | P2 | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-01) | Create without permission returns 403 | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | List rules filterable by status/source/matchType | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-02) | List with status filter returns only matching rows | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Fetch single rule by id | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-03) | Get existing/missing id | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | Update mutable rule fields | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-04) | Update increments version + revision | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Tombstone (soft-delete) a rule | — | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-05) | Tombstoned rule stops matching, still listable | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | Single write chokepoint + same-tx revision | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-06) | Rule + revision written atomically | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | Write-time pattern validation | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-07) | Invalid pattern rejected before store | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Write-time open-redirect validation | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-08) | Disallowed absolute target rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-08) | Same-origin target allowed | P2 | pending | pending | pending | pending | PENDING |
| REQ-09 | Read-time open-redirect validation of interpolated location | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-09) | Wildcard capture injection re-validated and blocked | P1 | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-09) | Same-origin relative target passes read-path check | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | Failed read-path check falls through, never 500/serves | — | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-10) | Disallowed interpolated target never served | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | `override:true` requires admin.redirects.manage | — | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-11) | Override set succeeds under the single v1 permission | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | All admin operations gated by admin.redirects.manage | — | pending | pending | pending | pending | PENDING |
| REQ-13 | One-hop chain collapse at write time | — | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-13) | A→B→C collapses to A→C | P1 | pending | pending | pending | pending | PENDING |
| REQ-14 | Reject cycle-introducing writes | — | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-14) | B→A rejected when A→B exists | P1 | pending | pending | pending | pending | PENDING |
| REQ-15 | In-tx auto-capture on slug change | — | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-15) | Rule exists atomically with the rename | P1 | pending | pending | pending | pending | PENDING |
| REQ-16 | Fail-closed LINK_PRESERVATION_UNAVAILABLE | — | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-16) | Unbound capture aborts the rename | P1 | pending | pending | pending | pending | PENDING |
| REQ-17 | Idempotent capture by changeSetId | — | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-17) | Retried change-set does not duplicate the rule | P2 | pending | pending | pending | pending | PENDING |
| REQ-18 | Phase eligibility (pre_content override-only, post_content all) | — | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-18) | override:false never beats live content | P1 | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-18) | override:true beats live content | P1 | pending | pending | pending | pending | PENDING |
| REQ-19 | Match-type precedence + tie-break | — | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-19) | exact beats prefix | P1 | pending | pending | pending | pending | PENDING |
| AC-24 (REQ-19) | longest prefix wins | P2 | pending | pending | pending | pending | PENDING |
| REQ-20 | Bounded, capped dynamic-set evaluation | — | pending | pending | pending | pending | PENDING |
| AC-25 (REQ-20) | listDynamic returns at most the cap | P2 | pending | pending | pending | pending | PENDING |
| REQ-21 | Async, non-blocking hit counting | — | pending | pending | pending | pending | PENDING |
| AC-26 (REQ-21) | Hit-count failure doesn't affect the response | P2 | pending | pending | pending | pending | PENDING |
| REQ-22 | Reject matchType:'regex' in v1 | — | pending | pending | pending | pending | PENDING |
| AC-27 (REQ-22) | Regex create always rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-23 | Admin list + create/edit UI | — | pending | pending | pending | pending | PENDING |
| AC-28 (REQ-23) | List renders required fields | P1 | pending | pending | pending | pending | PENDING |
| REQ-24 | Only exact/prefix/wildcard offered in UI | — | pending | pending | pending | pending | PENDING |
| AC-29 (REQ-24) | Match-type select has exactly 3 options | P1 | pending | pending | pending | pending | PENDING |
| REQ-25 | auto_slug_change viewable/tombstonable, not creatable | — | pending | pending | pending | pending | PENDING |
| AC-30 (REQ-25) | Auto rule tombstonable, not in create form | P2 | pending | pending | pending | pending | PENDING |
| REQ-26 | Import reuses the same chokepoint | — | pending | pending | pending | pending | PENDING |
| AC-31 (REQ-26) | Partial-batch import: valid written, invalid rejected consistently | P2 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | A `redirects` row must never exist without a same-tx `redirect_revisions` row | pending | pending | PENDING |
| INV-02 | No request may observe a moved entry without its redirect already existing | pending | pending | PENDING |
| INV-03 | No redirect emitted to a location that failed the open-redirect oracle | pending | pending | PENDING |
| INV-04 | A rule's resolved chain never requires more than one hop | pending | pending | PENDING |
| INV-05 | `matchType:'regex'` never accepted while unbuilt in v1 | pending | pending | PENDING |
| INV-06 | Hit-count updates never gate/block a redirect response | pending | pending | PENDING |
| INV-07 | Only `RedirectRepoPort` may write `redirects`/`redirect_revisions` | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Bare relative `toTarget` normalized to leading-slash | pending | pending | PENDING |
| EC-02 | True tie on priority+timestamp — lexicographic id fallback | pending | pending | PENDING |
| EC-03 | Rule points at a path that no longer resolves to anything | pending | pending | PENDING |
| EC-04 | Prefix rule matched at exactly its fromPattern (no tail) | pending | pending | PENDING |
| EC-05 | SlugChangeCapture implementation throws unexpectedly | pending | pending | PENDING |
| EC-06 | Reused slug: live content wins over a stale post_content rule | pending | pending | PENDING |
| EC-07 | Interpolated location with raw forbidden characters | pending | pending | PENDING |
| EC-08 | Import batch with duplicate exact fromPattern | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| REDIRECT_NOT_FOUND | pending | pending | pending | PENDING |
| REDIRECT_VALIDATION_ERROR | pending | pending | pending | PENDING |
| REDIRECT_TARGET_NOT_ALLOWED | pending | pending | pending | PENDING |
| REDIRECT_CONFLICT | pending | pending | pending | PENDING |
| REDIRECT_LOOP_DETECTED | pending | pending | pending | PENDING |
| LINK_PRESERVATION_UNAVAILABLE | pending | pending | pending | PENDING |
| FORBIDDEN | pending | pending | pending | PENDING |
| VALIDATION_ERROR | pending | pending | pending | PENDING |
| INTERNAL_ERROR | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Match-type precedence (exact > prefix > wildcard) | § 1.1 | pending | pending | PENDING |
| Phase eligibility (pre_content override-only vs post_content all) | § 1.2 | pending | pending | PENDING |
| Tie-break: priority > recency > lexicographic id | § 2.1 / § 6.1 | pending | pending | PENDING |
| Dynamic-set evaluation order | § 2.2 | pending | pending | PENDING |
| Default values (status/override/priority/statusCode/matchType/source/version/cap) | § 3 | pending | pending | PENDING |
| Limits and bounds (pattern/target length, priority range, chain hops, dynamic cap, import batch size, regex disabled) | § 4 | pending | pending | PENDING |
| Deduplication: exact fromPattern conflict | § 5.1/5.2 | pending | pending | PENDING |
| Edge case: fromPattern = 2049 chars rejected | § 7 | pending | pending | PENDING |
| Edge case: priority = 1001 rejected | § 7 | pending | pending | PENDING |
| Edge case: import batch of 501 rejected | § 7 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| All REQ-*/AC-* | Spec-stage package; no code beyond `src/redirects/ports.ts`/`types.ts` stubs exists yet | TDD/Programmer phase (post `/plan`) | Software Architect → TDD Agent |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| All REQ-*/AC-* | No tests written yet (pre-TDD) | TDD phase | TDD Agent |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| All codes | No tests written yet (pre-TDD) | TDD phase | TDD Agent |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| `matchType:'regex'` authoring, `redirects.use_regex` | Future FEAT (post-v1) | ADR-033 §8 explicit DEFERRED item; REQ-22 only specifies the v1 reject behavior, not the future enable path | ADR-033 (already accepted) |
| Edge/CDN redirect compilation | Future FEAT (second `RedirectMatcher` adapter) | ADR-033 §8 DEFERRED | ADR-033 |
| Per-hit analytics timeseries | Future FEAT | ADR-033 §8 DEFERRED — v1 ships aggregate counters only | ADR-033 |
| Conditional redirects (geo/device/auth/time) | Future FEAT, lands on `redirect.resolve` hook | ADR-033 §8 DEFERRED | ADR-033 |
| Query-string/matrix-param matching | Future FEAT | ADR-033 §8 DEFERRED | ADR-033 |

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
- [x] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval — recorded as pre-TDD stage, not a gap
- [x] Section 6.2 (untested) is empty or all entries are DEFERRED with approval — recorded as pre-TDD stage, not a gap
- [x] Section 6.3 (untested error codes) is empty or all entries are DEFERRED with approval — recorded as pre-TDD stage, not a gap
- [x] Section 7 (untraced) is empty

**[ ] TRACEABILITY COMPLETE** — not yet; this is expected at spec stage (pending implementation), not a failure.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent | 2026-07-12 | Seeded from feature.spec.md v1.0.0 |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Review Agent | | | |
| Coordinator | | | |
