# Traceability Matrix: forms

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-010 |
| feature_name | FEAT-010-forms |
| version | 1.0.0 |
| content_hash | sha256:PENDING |
| last_edited | 2026-07-13T00:00:00Z |
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every REQ/AC/INV/EC/error code/behavior rule from this package's other files
through to implementation and test. All rows are `PENDING` — expected at spec stage, before TDD.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Create a form definition with name/slug/fields/notify, default `active` | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Valid create → 201, GET returns unchanged | P1 | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-01) | Notify config persisted and returned | P2 | pending | pending | pending | pending | PENDING |
| REQ-02 | Reject unregistered field type | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-02) | `type: "date"` rejected, nothing created | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Enforce workspace-unique slug | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | Duplicate slug rejected with FORMS_SLUG_CONFLICT | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | Read/update/disable definition; permanent delete only via Trash purge | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-04) | Disable stops new submissions; GET still shows disabled | P1 | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-04) | SUPERSEDED (2026-09-21 owner ruling — forms deleted via the Trash): no delete endpoint on the definition write routes | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Public unauthenticated submit endpoint | — | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-05) | No Authorization header required, 201 | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | Validate submission against field vocabulary | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-06) | Missing required field rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-06) | Unregistered key rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-06) | maxLength exceeded rejected | P2 | pending | pending | pending | pending | PENDING |
| REQ-07 | Reject submission to missing/disabled form, indistinguishably | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-07) | Nonexistent slug → FORMS_DEFINITION_NOT_FOUND | P1 | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-07) | Disabled slug → same FORMS_DEFINITION_NOT_FOUND | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Silently discard honeypot-tripped submissions | — | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-08) | Honeypot non-empty → 201, nothing persisted/emitted | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | Rate-limit per (ip, formId) | — | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-09) | (N+1)-th request rejected, first N succeed | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | Persist accepted submission immutably | — | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-10) | GET returns same values as submitted | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | Emit form.submission.received on outbox | — | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-11) | Matching webhook subscription fires via existing worker | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Send email via MailerPort when notify enabled | — | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-12) | MailerPort.send() invoked with correct recipient | P1 | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-12) | Notify disabled → send() never invoked | P2 | pending | pending | pending | pending | PENDING |
| REQ-13 | List/view submissions with read permission | — | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-13) | Returns every non-deleted submission, newest first | P1 | pending | pending | pending | pending | PENDING |
| REQ-14 | Delete a submission — moves it to the Trash; only a purge deletes it permanently | — | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-14) | Deleted submission 404s and disappears from list | P1 | pending | pending | pending | pending | PENDING |
| REQ-15 | Reject unauthorized definition/submission actions | — | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-15) | Definition write without admin.forms.manage → FORBIDDEN | P1 | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-15) | Submissions read without permission → FORBIDDEN | P1 | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-15) | Submission delete without permission → FORBIDDEN | P1 | pending | pending | pending | pending | PENDING |
| REQ-16 | Never block public response on mail/webhook outcome | — | pending | pending | pending | pending | PENDING |
| AC-24 (REQ-16) | Response completes before mail-send outcome awaited | P1 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant | Test File | Test ID | Status |
|--------|-----------|-----------|---------|--------|
| INV-01 | `data_json` keys are always a subset of the definition's declared field ids | pending | pending | PENDING |
| INV-02 | `fields_json[].type` is always in the registered vocabulary | pending | pending | PENDING |
| INV-03 | `slug` unique per workspace across every status | pending | pending | PENDING |
| INV-04 | Honeypot-tripped submission never persisted/emitted/notified | pending | pending | PENDING |
| INV-05 | Public endpoint never blocks on mail/webhook completion | pending | pending | PENDING |
| INV-06 | No admin action bypasses its permission check | pending | pending | PENDING |
| INV-07 | form.submission.received emitted for every accepted submission, only those | pending | pending | PENDING |
| INV-08 | Form definition permanently deleted only by a Trash purge; deleting moves it to the Trash, restore brings it back with its submissions | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case | Test File | Test ID | Status |
|-------|-----------|-----------|---------|--------|
| EC-01 | Submission with only required fields present | pending | pending | PENDING |
| EC-02 | Submission missing a required field | pending | pending | PENDING |
| EC-03 | Submission to a recently-disabled slug | pending | pending | PENDING |
| EC-04 | Concurrent creates racing on the same slug | pending | pending | PENDING |
| EC-05 | Definition disabled mid-flight of an in-progress submission | pending | pending | PENDING |
| EC-06 | MailerPort returns SUPPRESSED for a recipient | pending | pending | PENDING |
| EC-07 | No webhook subscriptions match the topic | pending | pending | PENDING |
| EC-08 | Submissions list for a form with zero submissions | pending | pending | PENDING |
| EC-09 | Honeypot field present but empty | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By | Test File | Test ID | Status |
|------------|-------------|-----------|---------|--------|
| FORMS_FIELD_VALIDATION_ERROR | pending | pending | pending | PENDING |
| FORMS_SLUG_CONFLICT | pending | pending | pending | PENDING |
| FORMS_DEFINITION_NOT_FOUND | pending | pending | pending | PENDING |
| FORMS_SUBMISSION_VALIDATION_ERROR | pending | pending | pending | PENDING |
| FORMS_SUBMISSION_NOT_FOUND | pending | pending | pending | PENDING |
| FORMS_RATE_LIMIT_EXCEEDED | pending | pending | pending | PENDING |
| UNAUTHENTICATED | pending | pending | pending | PENDING |
| FORBIDDEN | pending | pending | pending | PENDING |
| INTERNAL_ERROR | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Slug immutability | § 1.1 | pending | pending | PENDING |
| Field-id removal restriction | § 1.2 | pending | pending | PENDING |
| Submissions list order (newest first) | § 2.1 | pending | pending | PENDING |
| Default `status: active` | § 3 | pending | pending | PENDING |
| Default `notify.enabled: false` | § 3 | pending | pending | PENDING |
| Limit: fields per definition 1-20 | § 4 | pending | pending | PENDING |
| Limit: checkbox forbids maxLength | § 4 | pending | pending | PENDING |
| Limit: notify recipients 0-10 | § 4 | pending | pending | PENDING |
| Limit: FORMS_SUBMIT rate limit 5/60s per (ip, formId) | § 4 | pending | pending | PENDING |
| Honeypot trip definition + identical response | § 5 | pending | pending | PENDING |
| Slug creation race tie-break (DB unique index) | § 6.1 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements
| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| — | — | — | — |

### 6.2 Untested Requirements
| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| — | — | — | — |

### 6.3 Untested Error Codes
| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| — | — | — | — |

### 6.4 Deferred Items
| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| — | — | — | — |

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
- [x] Section 6.1 (unimplemented) is empty
- [x] Section 6.2 (untested) is empty
- [x] Section 6.3 (untested error codes) is empty
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Review Agent (N/A — pre-implementation)

**[ ] TRACEABILITY COMPLETE** — pending implementation (expected at spec stage).

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent | 2026-07-13T00:00:00Z | Matrix seeded from feature.spec.md/behavior.spec.md/errors.spec.md — all rows PENDING per spec-stage convention |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Review Agent | | | |
| Coordinator | | | |
