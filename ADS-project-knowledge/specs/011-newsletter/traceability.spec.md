# Traceability Matrix: newsletter

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-011 |
| feature_name | FEAT-011-newsletter |
| version | 1.0.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-13T00:00:00Z |
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every REQ/AC/INV/EC/error code/behavior rule in this spec package to its
future implementation and test. All rows are `pending` — no code exists yet beyond the
interface stubs in `src/newsletter/ports.ts`/`types.ts`.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Create campaign with editorial fields | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Create returns 201 with draft defaults | P1 | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-01) | Create without permission returns 403 | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | List campaigns filterable by status | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-02) | List with status filter returns only matching rows | P2 | pending | pending | pending | pending | PENDING |
| REQ-03 | Fetch single campaign by id | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | Get existing/missing id | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | Update editorial fields only while draft/scheduled | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-04) | Update draft succeeds, version increments | P1 | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-04) | Update sent campaign rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Cancel a draft/scheduled campaign | — | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-05) | Cancel scheduled campaign | P2 | pending | pending | pending | pending | PENDING |
| REQ-06 | Single write chokepoint + same-tx revision | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-06) | Campaign + revision written atomically | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | Schedule draft campaign with valid list | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-07) | Schedule transitions and emits event | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Seed exactly one default list per workspace, never archivable | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-08) | Default list seeded + archive rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | Reject schedule/send with unknown listId | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-09) | Unknown listId rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | Add/import/remove subscription referencing existing Members principal | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-10) | Add existing principal creates pending subscription | P1 | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-10) | Add unknown subscriberId rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | Confirmation email on pending subscription; Members grants consent | — | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-11) | Pending subscription sends confirm email, no status change yet | P1 | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-11) | Valid confirm token invokes Members, flips to subscribed only after granted | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Resend confirmation, invalidate previous token | — | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-12) | Resend mints new token, old one invalid | P2 | pending | pending | pending | pending | PENDING |
| REQ-13 | Reject expired/consumed confirm token | — | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-13) | Expired token rejected, no state change | P1 | pending | pending | pending | pending | PENDING |
| REQ-14 | Unsubscribe token bound to current consent revision | — | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-14) | Stale-revision token rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-14) | Current-revision token succeeds, revokes consent | P1 | pending | pending | pending | pending | PENDING |
| REQ-15 | Idempotent, cookie-less, no-login unsubscribe | — | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-15) | Repeated unsubscribe is idempotent success | P1 | pending | pending | pending | pending | PENDING |
| REQ-16 | Audience freeze into snapshot + send rows | — | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-16) | Freeze creates snapshot + N send rows | P1 | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-16) | Unresolvable subscriber silently excluded | P2 | pending | pending | pending | pending | PENDING |
| REQ-17 | Outbox-driven fan-out with beforeSend + MailerPort.send | — | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-17) | Batch processed, hook ran before each send | P1 | pending | pending | pending | pending | PENDING |
| REQ-18 | Campaign status machine, pipeline-only terminal transitions | — | pending | pending | pending | pending | PENDING |
| AC-24 (REQ-18) | Non-pipeline actor cannot set sent directly | P1 | pending | pending | pending | pending | PENDING |
| REQ-19 | admin.newsletter.campaign.send required for full send | — | pending | pending | pending | pending | PENDING |
| AC-25 (REQ-19) | Compose-only principal cannot send | P1 | pending | pending | pending | pending | PENDING |
| REQ-20 | send_test restricted to operator-supplied addresses | — | pending | pending | pending | pending | PENDING |
| AC-26 (REQ-20) | Test send hits only given addresses, no snapshot | P1 | pending | pending | pending | pending | PENDING |
| REQ-21 | Launch Readiness Gate blocks full-audience send | — | pending | pending | pending | pending | PENDING |
| AC-27 (REQ-21) | sending_enabled false blocks send | P1 | pending | pending | pending | pending | PENDING |
| AC-28 (REQ-21) | Unbound consent capability blocks send | P1 | pending | pending | pending | pending | PENDING |
| AC-29 (REQ-21) | Console/memory mailer adapter blocks send | P1 | pending | pending | pending | pending | PENDING |
| AC-30 (REQ-21) | All four preconditions met allows send | P1 | pending | pending | pending | pending | PENDING |
| AC-31 (REQ-21) | send_test exempt from (a)/(b) | P2 | pending | pending | pending | pending | PENDING |
| REQ-22 | Consume mail.feedback.received as suppression projection | — | pending | pending | pending | pending | PENDING |
| AC-32 (REQ-22) | Complaint flips subscription, future sends excluded | P1 | pending | pending | pending | pending | PENDING |
| AC-33 (REQ-22) | Non-newsletter sourceContext ignored | P2 | pending | pending | pending | pending | PENDING |
| REQ-23 | beforeSend + recipient.filter hooks, sync/ordered/fail-closed | — | pending | pending | pending | pending | PENDING |
| AC-34 (REQ-23) | beforeSend transform reflected in delivered message | P1 | pending | pending | pending | pending | PENDING |
| REQ-24 | Atomic counters + send-row status write | — | pending | pending | pending | pending | PENDING |
| AC-35 (REQ-24) | Counter increments atomically with row status | P1 | pending | pending | pending | pending | PENDING |
| REQ-25 | admin.newsletter.* gates every admin operation | — | pending | pending | pending | pending | PENDING |
| AC-42 (REQ-25) | Every route calls authorize() with its specific permission | P1 | pending | pending | pending | pending | PENDING |
| REQ-26 | Admin UI: campaign/list/subscriber/send-log screens | — | pending | pending | pending | pending | PENDING |
| AC-43 (REQ-26) | List/composer/list-management/send-log screens render | P1 | pending | pending | pending | pending | PENDING |
| REQ-27 | GDPR erasure anonymizes send-log PII | — | pending | pending | pending | pending | PENDING |
| AC-36 (REQ-27) | Erasure anonymizes rows, preserves counters | P2 | pending | pending | pending | pending | PENDING |
| REQ-28 | Idempotent per-row send via idempotencyKey | — | pending | pending | pending | pending | PENDING |
| AC-37 (REQ-28) | Redelivery does not double-send | P2 | pending | pending | pending | pending | PENDING |
| REQ-29 | Pause/resume a sending campaign | — | pending | pending | pending | pending | PENDING |
| AC-38 (REQ-29) | Pause stops claiming, resume continues | P1 | pending | pending | pending | pending | PENDING |
| REQ-30 | Links built only from verified canonical origin | — | pending | pending | pending | pending | PENDING |
| AC-39 (REQ-30) | Host-header injection does not affect link origin | P1 | pending | pending | pending | pending | PENDING |
| REQ-31 | Import reuses standard subscription chokepoint | — | pending | pending | pending | pending | PENDING |
| AC-40 (REQ-31) | Partial-batch import: valid written, invalid rejected | P2 | pending | pending | pending | pending | PENDING |
| REQ-32 | Newsletter never writes Members consent record directly | — | pending | pending | pending | pending | PENDING |
| AC-41 (REQ-32) | Code review: no direct Members-table write | P1 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | A campaign row never exists without a same-tx revision row | pending | pending | PENDING |
| INV-02 | SendRow terminal-status write and counters update commit together | pending | pending | PENDING |
| INV-03 | Newsletter never writes to member_consents directly | pending | pending | PENDING |
| INV-04 | Unsubscribe token never verifies past a consent-revision change | pending | pending | PENDING |
| INV-05 | Full-audience send never proceeds while the Launch Readiness Gate is unmet | pending | pending | PENDING |
| INV-06 | AudienceSnapshotRow frozen recipient set is never mutated after creation | pending | pending | PENDING |
| INV-07 | A mail-lib-suppressed recipient never receives a subsequent send | pending | pending | PENDING |
| INV-08 | Newsletter plugin never holds a live MailerPort instance | pending | pending | PENDING |
| INV-09 | No path reads the raw request Host header for a subscriber-facing link | pending | pending | PENDING |
| INV-10 | SendBatchJob/SendRow redelivery never double-sends | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Unsubscribe after freeze, before dispatch — suppressed, not sent | pending | pending | PENDING |
| EC-02 | Confirm link clicked twice — second is invalid, not a repeat success | pending | pending | PENDING |
| EC-03 | Unsubscribe link double-clicked — idempotent success | pending | pending | PENDING |
| EC-04 | Outbox crash mid-batch — dedup ledger prevents double real send | pending | pending | PENDING |
| EC-05 | Launch gate flips unmet mid-send — in-flight completes, no new batches | pending | pending | PENDING |
| EC-06 | Concurrent schedule — version-conflict rejection | pending | pending | PENDING |
| EC-07 | SubscriberDirectoryPort returns null — silently excluded from snapshot | pending | pending | PENDING |
| EC-08 | Import with unknown subscriberId — rejected per-row | pending | pending | PENDING |
| EC-09 | Feedback event for a different module — ignored | pending | pending | PENDING |
| EC-10 | send_test with no verified origin — still rejected | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| NEWSLETTER_CAMPAIGN_NOT_FOUND | pending | pending | pending | PENDING |
| NEWSLETTER_LIST_NOT_FOUND | pending | pending | pending | PENDING |
| NEWSLETTER_SUBSCRIPTION_NOT_FOUND | pending | pending | pending | PENDING |
| NEWSLETTER_SUBSCRIBER_NOT_FOUND | pending | pending | pending | PENDING |
| NEWSLETTER_VALIDATION_ERROR | pending | pending | pending | PENDING |
| NEWSLETTER_CAMPAIGN_NOT_EDITABLE | pending | pending | pending | PENDING |
| NEWSLETTER_DEFAULT_LIST_PROTECTED | pending | pending | pending | PENDING |
| NEWSLETTER_CONFLICT | pending | pending | pending | PENDING |
| NEWSLETTER_LAUNCH_GATE_BLOCKED | pending | pending | pending | PENDING |
| NEWSLETTER_CONFIRM_TOKEN_INVALID | pending | pending | pending | PENDING |
| NEWSLETTER_UNSUBSCRIBE_TOKEN_INVALID | pending | pending | pending | PENDING |
| FORBIDDEN | pending | pending | pending | PENDING |
| VALIDATION_ERROR | pending | pending | pending | PENDING |
| INTERNAL_ERROR | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Campaign status transition authority (pipeline vs admin permission tiers) | § 1.1 | pending | pending | PENDING |
| Launch Readiness Gate precondition evaluation order, all-named reporting | § 1.2 | pending | pending | PENDING |
| Per-row send hook ordering (recipient.filter → beforeSend → MailerPort.send) | § 1.3 | pending | pending | PENDING |
| Confirmation token reissuance (newest wins, prior invalidated) | § 2.1 | pending | pending | PENDING |
| Default values (status/counters/isDefault/sending_enabled/TTLs/caps) | § 3 | pending | pending | PENDING |
| Limits and bounds (subject/preheader length, address/batch caps, TTL, gate precondition count) | § 4 | pending | pending | PENDING |
| Deduplication: one SendRow per (campaign, subscriber, snapshot); redelivery/retry semantics | § 5 | pending | pending | PENDING |
| Tie-break: concurrent campaign edits, optimistic concurrency | § 6.1 | pending | pending | PENDING |
| Edge case: subject = 999 chars rejected | § 7 | pending | pending | PENDING |
| Edge case: two gate preconditions unmet, both named | § 7 | pending | pending | PENDING |
| Edge case: zero-subscription list drains immediately to sent | § 7 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| All REQ-*/AC-* | Spec-stage package; no code beyond `src/newsletter/ports.ts`/`types.ts` stubs exists yet | TDD/Programmer phase (post `/plan`) | Software Architect → TDD Agent |

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
| `HttpApiMailerAdapter` provider adapter | Future FEAT (ADR-037 follow-up) | ADR-034 §9 DEFERRED; neither mail adapter exists in code today (Dependencies table) | ADR-034/ADR-037 (already accepted) |
| Open/click analytics (`email-analytics`) | Future FEAT, own privacy ADR | ADR-034 §9 DEFERRED | ADR-034 |
| A/B subject testing | Future FEAT | ADR-034 §9 DEFERRED | ADR-034 |
| Audience segmentation by behavior/query | Future FEAT | ADR-034 §9 DEFERRED — v1 lists are explicit membership only | ADR-034 |
| Public unauthenticated signup form | Future FEAT | Not built in this spec; admin-driven list membership/import only | This spec's own Scope section |
| ADR-023 `dataModule` reconciliation engine | Future FEAT (ADR-023 §12) | Newsletter's own tables ride the first-party interim path per sweep §A.2, not the general engine | ADR-023/ADR-034 |

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
| Spec Agent | Spec Agent | 2026-07-13 | Seeded from feature.spec.md v1.0.0 |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Review Agent | | | |
| Coordinator | | | |
