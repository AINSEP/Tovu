# Behavior Rules Spec: newsletter

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
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

**Purpose:** Newsletter has several competing sources of truth for "what wins" (who may
drive a campaign-status transition, the order the Launch Readiness Gate's four
preconditions are evaluated and reported, the order the per-row `recipient.filter`/
`beforeSend` hooks run) and several non-obvious defaults/bounds (confirm-token TTL, test-send
address cap, batch size). This file is required per the template's own criteria.

---

## EARS Syntax Guide

(See template for the full pattern reference; all rules below use EARS form.)

---

## 1. Precedence Rules

### 1.1 Campaign Status Transition Authority

**Situation:** Applies to every attempt to change `CampaignRecord.status`.

**Sources in precedence order (highest to lowest):**
1. The send pipeline (`NewsletterSendPipeline`, `orchestrator.spec.md`) — the only actor
   that may set `sending → sent` and the only actor that may set `scheduled → sending`
   (via `authorizeSend`, which folds in the Launch Readiness Gate check).
2. An admin holding `admin.newsletter.campaign.send` — may set `sending ↔ paused` and may
   trigger `authorizeSend` (which the pipeline then executes), but may never directly set
   `status: 'sent'` or `status: 'sending'` without going through `authorizeSend`.
3. An admin holding `admin.newsletter.campaign.schedule` — may set `draft → scheduled` only.
4. An admin holding `admin.newsletter.campaign.compose` — may set `draft ↔ scheduled` (edit
   fields, or revert a `scheduled` campaign back to `draft` by clearing its schedule) and
   `draft/scheduled → canceled`, but no other transition.

**Example:**
- Scenario: an admin holding only `admin.newsletter.campaign.compose` calls the API with a
  raw `status: 'sent'` field in an update payload.
- Result: rejected with `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` (or `FORBIDDEN` if the permission
  check runs first) — no compose-level permission can ever set a pipeline-owned status
  value directly; the update endpoint does not accept `status` as a settable field at all
  (see `api.spec.md` `UPDATE_CAMPAIGN` body — `status` is not in its schema).

**Test requirement:** The TDD Agent must write a test proving each permission level's
transition ceiling is enforced even when the request shape would otherwise be well-formed.

EARS: WHEN a status-changing request targets `sending` or `sent`, the system shall accept it
only from the send pipeline's own internal actions (`authorizeSend`, `completeIfDrained`),
never from a direct admin-supplied `status` field.

---

### 1.2 Launch Readiness Gate Precondition Evaluation Order

**Situation:** Applies whenever `authorizeSend` (a full-audience `send`, REQ-21) evaluates
whether the gate is met.

**Sources in evaluation order (all four are always evaluated; this is not a short-circuit
chain — see rationale below):**
1. (a) `newsletter.launch_gate.sending_enabled === true` for the workspace.
2. (b) The Members consent capability (`members.consent.request`/`.confirm`/`.revoke`) is
   registered and live.
3. (c) `OriginRegistryPort.canonicalOrigin` resolves without throwing.
4. (d) The bound `MailerPort` adapter's `capabilities().driver` is neither `'console'` nor
   `'memory'`.

**Rationale for evaluating all four (not short-circuiting on the first failure):** The
`NEWSLETTER_LAUNCH_GATE_BLOCKED` error's `details.unmetPreconditions` array (§ errors.spec.md
§ 3) is more useful to an operator when it names every unmet precondition at once, rather
than forcing a fix-one/re-request/discover-the-next-one loop — this mirrors how a form
validator reports every invalid field in one response rather than one at a time.

**Example:**
- Scenario: `sending_enabled: false` AND no verified origin registered.
- Result: `NEWSLETTER_LAUNCH_GATE_BLOCKED` with
  `unmetPreconditions: ['sending_enabled_false', 'origin_not_verified']` — both named, in
  the stable (a)→(d) order, not just the first one found.

**Test requirement:** The TDD Agent must write a test with exactly two of the four
preconditions unmet and assert both — and only those two — appear in
`unmetPreconditions`, in (a)→(d) order.

EARS: WHEN `authorizeSend` runs, the system shall evaluate all four Launch Readiness Gate
preconditions in the fixed order (a) sending_enabled, (b) consent capability, (c) verified
origin, (d) production mailer adapter, and shall report every unmet precondition in that
same order in a single `NEWSLETTER_LAUNCH_GATE_BLOCKED` response.

---

### 1.3 Per-Row Send Hook Ordering

**Situation:** Applies to every `SendRow` the pipeline dispatches (`dispatchRow`,
`orchestrator.spec.md` § 4).

**Sources in order (highest to lowest — "highest" here means "runs first"):**
1. Live `newsletter.recipient.filter` re-check (a second, dispatch-time evaluation distinct
   from the freeze-time filter in REQ-16) — if this returns "suppress," the row is marked
   `failed`/`SUPPRESSED_POST_FREEZE` and `MailerPort.send()` is never called (EC-01).
2. `newsletter.email.beforeSend` (message transform: footer/unsubscribe-link/UTM injection)
   — only runs for a row that passed step 1.
3. `MailerPort.send()` — only called with the step-2-transformed message.

**Example:**
- Scenario: a subscriber unsubscribes after audience freeze but before their row is
  dispatched.
- Result: step 1 catches it; steps 2 and 3 never run for that row.

**Test requirement:** The TDD Agent must write a test proving `beforeSend` never runs for a
row that step 1 suppresses, and a separate test proving `MailerPort.send()` never runs
without a prior `beforeSend` invocation for a row that passes step 1.

EARS: WHILE dispatching a `SendRow`, the system shall evaluate `recipient.filter` before
`beforeSend`, and shall evaluate `beforeSend` before calling `MailerPort.send()` — in that
fixed order, never reordered or parallelized.

---

## 2. Ordering Rules

### 2.1 Confirmation Token Reissuance

**Field used:** `ConfirmationTokenRecord.createdAt` (only the most recently issued,
unconsumed token for a given `subscriptionId` is valid).

**Direction:** Newest wins — issuing a new token (REQ-12) immediately invalidates every
prior unconsumed token for the same subscription.

**Stability:** A `CONSUME_CONFIRMATION_TOKEN` action always checks the submitted token's own
`consumedAt`/`expiresAt`, not a comparison against other tokens — invalidation of a prior
token is implemented as marking it superseded (or deleting it) at reissuance time, not as a
runtime "is this the latest" query.

**Invariant:** At most one unconsumed, unexpired `ConfirmationTokenRecord` exists per
`subscriptionId` at any moment.

EARS: WHEN a confirmation email is resent for a subscription with an existing unconsumed
token, the system shall invalidate that prior token before or in the same transaction as
issuing the new one.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `status` | `CampaignRecord` on create | `'draft'` | A newly composed campaign is not yet ready to schedule or send. |
| `preheader` | `CreateCampaignInput` | `null` | Optional inbox-preview text; many campaigns omit it. |
| `counters` (all fields) | `CampaignRecord` on create | `0` | No sends have happened yet; the bag is rebuildable from `p_newsletter__sends` (REQ-24). |
| `isDefault` | `NewsletterListRow`, workspace-seeded list | `true` (exactly one per workspace) | REQ-08 — every workspace needs at least one usable target list without manual setup. |
| `isDefault` | `NewsletterListRow`, any admin-created list | `false` | Only the seeded list is default; operators cannot create a second default. |
| `status` | `SubscriptionRow` on create | `'pending'` | Double opt-in is the default posture (REQ-11) — a subscription is never silently `subscribed` on creation. |
| `newsletter.launch_gate.sending_enabled` | workspace setting | `false` | Safety-first: real recipient sending is an explicit, auditable operator decision, never an implicit default (REQ-21a; this is the literal enforcement of "must not ship to real recipients before Members is live"). |
| Confirmation-token TTL | `ConfirmationTokenRecord.expiresAt` | `72 hours` from issue | Longer than Members' 15-minute magic-link TTL (`MAGIC_LINK_TTL_MS`, `src/members/write-service.ts`) because a subscription confirm is a lower-stakes, non-authentication action a subscriber may reasonably act on days later — assumed pending confirmation (OQ-01 territory, but not itself an open question: this spec fixes the value; Software Architect may only revisit with a documented reason). |
| Unsubscribe-token expiry | `UnsubscribeTokenClaims.expiresAt` | `null` (non-expiring) | Matches `src/newsletter/types.ts`'s existing doc comment: "short expiry is optional for unsubscribe (links live in old inboxes); default = non-expiring." Safety is instead provided by the `consentRevisionId` binding (INV-04), not a TTL. |
| Test-send address cap | `SEND_TEST_CAMPAIGN` body | `10` addresses max | Prevents a "test" send from becoming a de facto small real send that bypasses the Launch Readiness Gate. |
| Outbox claim batch size | `NewsletterSendPipeline.claimBatch` | `20` | Matches `processOutbox`'s existing default (`src/core/events/outbox-worker.ts`) — Newsletter reuses the primitive's own tuning, does not fork a separate value. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| `subject` length | 1–998 characters | API | RFC 5322 practical unfolded-header-line cap; rejected with `NEWSLETTER_VALIDATION_ERROR`. |
| `preheader` length | 0–300 characters | API | Longer text is truncated by inbox UIs anyway; capped to avoid pointlessly large payloads. |
| Test-send address count | 1–10 | API | Above 10, rejected with `VALIDATION_ERROR` before any send attempt — this is not a batch-import path. |
| Subscriber import batch size | 1–500 | API | Values above 500 rejected with `VALIDATION_ERROR` before any per-row processing begins (mirrors Redirects' `IMPORT_REDIRECTS` precedent). |
| Confirmation-token TTL | 72 hours | write chokepoint (`ISSUE_CONFIRMATION_TOKEN`) | See § 3 Default Values rationale. |
| Outbox claim batch size | 1–200 | orchestrator (`claimBatch`) | Upper bound matches `processOutbox`'s general shape; Newsletter does not claim unboundedly per tick. |
| Launch Readiness Gate preconditions | exactly 4, fixed set | `authorizeSend` | Not configurable per workspace — a workspace cannot opt out of preconditions (b)/(c)/(d) even if it disables its own `sending_enabled` flag's *effect*; all four are always evaluated (§ 1.2). |

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate Send

A `SendRow` is never re-created for the same `(campaignId, subscriberId, audienceSnapshotId)`
triple — `freezeAudience` creates exactly one row per resolved recipient per snapshot, and a
campaign has at most one active (non-superseded) snapshot per send attempt.

### 5.2 How Redeliveries Are Handled

**At outbox redelivery:** The same `SendRow.idempotencyKey` is reused; the mail-lib
send-dedup ledger (`MailSendDedupRepoPort`, when the adapter lacks native idempotency)
short-circuits a second real provider call, and the row's terminal status is reconciled from
its already-recorded outcome rather than re-derived from a fresh send attempt (REQ-28,
EC-04).

**At `freezeAudience` retry:** A retry of `authorizeSend`/`freezeAudience` for a campaign
that already has an `audienceSnapshotId` set is rejected (or is a no-op returning the
existing snapshot) rather than creating a second snapshot and doubling every recipient's
send count — this is the send-pipeline analog of Redirects' `SlugChangeCapture`
idempotent-by-`changeSetId` rule (§ `orchestrator.spec.md` § 6).

---

## 6. Tie-Break Logic

### 6.1 Concurrent Campaign Edits (Optimistic Concurrency)

**When does this apply:** Two writers submit an update to the same campaign with the same
base `version`.

**Tie-break rule:** The first write to commit wins; the second writer's request — now
carrying a stale `version` relative to the just-committed row — is rejected with
`NEWSLETTER_CONFLICT` (EC-06), never silently merged or overwritten.

**Rationale:** Matches the ADR-022 §4c optimistic-concurrency convention already used
elsewhere in this repo (Redirects, Members); no new conflict-resolution strategy is
introduced.

**Invariant:** Given the same starting `version`, only one of two concurrent writers ever
succeeds; the loser always receives `NEWSLETTER_CONFLICT`, never a silent no-op success.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| `subject` = exactly 998 characters | Accepted. | Yes |
| `subject` = 999 characters | Rejected with `NEWSLETTER_VALIDATION_ERROR`. | Yes |
| Test-send with exactly 10 addresses | Accepted. | Yes |
| Test-send with 11 addresses | Rejected with `VALIDATION_ERROR` before any send attempt. | Yes |
| Subscriber import batch of exactly 500 rows | Accepted (processed individually, REQ-31). | Yes |
| Subscriber import batch of 501 rows | Rejected with top-level `VALIDATION_ERROR` before any row is written. | Yes |
| Confirm token submitted at exactly `expiresAt` (boundary instant) | Treated as expired (rejected) — the boundary itself is not valid, consistent with a closed-below/open-above expiry convention. | Yes |
| Two Launch Readiness Gate preconditions unmet simultaneously | Both named in `unmetPreconditions`, in fixed (a)→(d) order (§ 1.2). | Yes |
| `authorizeSend` called twice in rapid succession (double-click "Send") | The second call finds `status !== 'scheduled'` (already `sending`) and is rejected with `NEWSLETTER_CAMPAIGN_NOT_EDITABLE`, never a second `freezeAudience`/duplicate snapshot (§ 5.2). | Yes |
| A `recipient.filter` hook throws (not just returns "suppress") | Fail-closed: the row is treated as suppressed (`failed`/`SUPPRESSED_POST_FREEZE`), matching ADR-024 §7's fail-closed hook posture, never treated as "keep by default." | Yes |
| Workspace has zero subscriptions on the target list at `freezeAudience` time | `AudienceSnapshotRow.recipientCount: 0`, zero `SendRow`s created, `completeIfDrained` immediately flips the campaign to `sent` (a zero-row snapshot is trivially drained). | Yes |

