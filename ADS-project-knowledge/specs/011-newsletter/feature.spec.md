# Feature Spec: newsletter

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-011 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:dc29d67a0df612ed7ba71a36b40279eb3dfb934c3d91e8538fa429cb4eb5a583 |
| feature_name | FEAT-011-newsletter |
| last_edited | 2026-07-13T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

> **[NEEDS CLARIFICATION] vs Open Questions — use the right one:**
>
> **`[NEEDS CLARIFICATION]`** — inline marker for a requirement that is too ambiguous to be testable as written. Blocks Software Architect dispatch. Must be resolved before the spec advances.
>
> **Open Questions** — tracked questions that do not block Software Architect dispatch. Each must have an owner and a resolution target date.

---

## Overview

Newsletter is the Tovu Tier-3 bundled plugin for composing, scheduling, and sending email
campaigns to a workspace's subscriber lists, layered over the Tier-2 `MailerPort` primitive
(ADR-037) and Members' read-only audience seam (ADR-030). It owns campaign authoring, list
membership, double opt-in confirmation mechanics, outbox-driven crash-safe fan-out, and
lawful one-click unsubscribe — while the subscriber's identity, email address, and consent
*record* stay Members-owned. A structural Launch Readiness Gate keeps real recipient mail
off until the operator explicitly enables it and every technical precondition it depends on
is actually live, not merely designed.

---

## Problem Statement

**Current state:** `src/newsletter/ports.ts` and `src/newsletter/types.ts` exist as
interface/type stubs only (ADR-034, design-only, PROPOSED-then-ACCEPTED text folded across
three sweep rounds). No adapters, no HTTP routes, no admin UI, no send pipeline, and no
own-tables exist. The Tier-2 primitives Newsletter depends on are in three different real
states today: `core/origin` (ADR-040, `src/origin/`) is genuinely implemented with a working
in-memory adapter; `core/mail` (ADR-037, `src/mail/`) is interfaces-only — zero adapter
classes exist anywhere in the repo, not even a console one at that path (Members has its own
local `mailer.console.ts`, predating the shared primitive); and Members' consent ledger
(`member_consents`, `members.consent.request/confirm/revoke`, ADR-030 §D1c) does not exist in
any form — confirmed absent in `src/members/INFO.md`'s own disclosure. Today, a workspace has
no way to compose a campaign, no list to target, and no lawful path to send or unsubscribe
anyone.

**Desired state:** A workspace admin holding the appropriate `admin.newsletter.*` permission
can compose a campaign, target a list, and schedule or send it; every send is crash-safe,
non-double-sending, and stops cleanly if paused; every subscriber can confirm a double
opt-in request and unsubscribe with one click, cookie-less and without logging in; and no
campaign can ever reach a real inbox until an explicit, named, code-enforced Launch
Readiness Gate is satisfied — not a comment, not a README warning, an `AC` a test can fail.

**Why now:** Newsletter is a named Wave-2 admin-section sweep item; ADR-034 is ACCEPTED
(cleared a 3-round `/audit-work` gate, zero blockers) and its Round-2/Round-3 folds resolved
the two open design questions (the Members consent boundary, and the `SubscriberDirectoryPort`
rule-of-two misclassification) that previously blocked writing a concrete spec. This spec
translates that already-decided ADR into a testable contract — it does not re-litigate any
of ADR-034's decisions.

**Success signal:** An admin can compose a campaign, target the seeded default list, and
either send a test to their own address or (once the Launch Readiness Gate is met in a
non-production/staging exercise) send to a small seeded audience and observe every recipient
land in `delivered` or a named failure state, with the campaign flipping to `sent` once the
ledger drains — confirmed by an integration test that drives compose → schedule → send →
drain end to end.

---

## User Journey

**Trigger:** A workspace admin wants to announce something to their subscriber list.

**Steps (compose → send):**
1. Admin opens Admin → Newsletter, clicks "New campaign." Composes subject, preheader,
   from/reply-to, body, and picks a target list (defaults to the workspace's seeded "all
   subscribers" list).
2. Admin saves as `draft`, iterates, then either sends a test to their own address
   (`admin.newsletter.campaign.send_test`) or schedules/sends to the real list
   (`admin.newsletter.campaign.send`).
3. On `send`, the command gateway authorizes the action, flips the campaign to `sending`,
   and — only if the Launch Readiness Gate (§ REQ-21) is satisfied — the system freezes the
   current `subscribed` audience into a snapshot and enqueues one `p_newsletter__sends` row
   per recipient.
4. The outbox worker claims `SendBatchJob`s in bounded batches, runs the `beforeSend` hook,
   calls `MailerPort.send()` per row with a stable idempotency key, and records
   `delivered`/`failed` per row.
5. When every row reaches a terminal state, the campaign flips to `sent` and emits
   `newsletter.campaign.sent`.

**Steps (subscribe/confirm/unsubscribe, subscriber side):**
1. A subscriber (an existing Members principal — Newsletter never mints its own identities)
   is added to a list (import, admin action, or a future public signup form — out of scope
   here) with subscription `status: 'pending'`.
2. Newsletter composes and sends a confirmation email with a signed, short-TTL confirm link.
   Clicking it calls a typed `members.consent.request`/`.confirm` capability; once Members
   confirms, Newsletter's own subscription row flips `pending → subscribed`.
3. Any later email that subscriber receives carries a one-click, cookie-less unsubscribe
   link. Clicking it flips the subscription to `unsubscribed` and revokes the Members consent
   grant — idempotently; a second click is a no-op success, not an error.

**Outcome:** The admin sees the campaign move through `draft → scheduled → sending → sent`
with live counters; the subscriber received exactly what they consented to and can leave with
one click, without ever creating a session.

**Alternate paths:** A `send` attempted while the Launch Readiness Gate is unmet is rejected
outright — the campaign stays `scheduled`, nothing is enqueued, no partial audience is
frozen. A confirm link clicked after its TTL is rejected with a typed error and no consent
state changes; the subscriber can request a fresh one. A paused campaign's outbox worker
simply stops claiming new rows for it — in-flight rows already claimed still complete
normally, and resuming continues from wherever the ledger left off with no duplicate sends
(the idempotency key protects every retry).

Note: Campaign status precedence, the Launch Readiness Gate's exact preconditions, tie-break
and default-value rules for the send pipeline are specified in `behavior.spec.md`, not here.

---

## Scope

**In scope:**
- Campaign CRUD: create/list/fetch/update-while-editable/cancel (REQ-01–REQ-06, REQ-18)
- List management: create/list/archive a named audience; one seeded default list per
  workspace, never deletable (REQ-08, REQ-09)
- Subscription management referencing an existing Members principal only — no ad-hoc
  identity creation by Newsletter (REQ-10, REQ-31)
- Double opt-in confirmation mechanics: compose/send/resend/expire the confirm email and
  signed confirm link; the `pending → granted` write itself lands in Members, not here
  (REQ-11–REQ-13, REQ-32)
- One-click, cookie-less, idempotent unsubscribe via a `KeyringPort`-derived token bound to
  the current consent revision (REQ-14, REQ-15)
- Audience freeze + outbox-driven, idempotent, crash-safe fan-out (REQ-16–REQ-18, REQ-28,
  REQ-29)
- `admin.newsletter.campaign.send` vs `.send_test` as two distinct, separately-gated actions
  (REQ-19, REQ-20)
- **The Launch Readiness Gate** — a structural, code-enforced precondition on every
  full-audience send (REQ-21)
- Bounce/complaint feedback consumption (Newsletter is a consumer, never the record owner)
  and the resulting subscription-status projection (REQ-22)
- `beforeSend` (message transform) and `recipient.filter` (suppression) hooks (REQ-23)
- Denormalized counters, atomically co-written with each send-row status transition
  (REQ-24)
- `admin.newsletter.*`-gated admin CRUD for every operation above (REQ-25)
- Admin UI: campaign list/composer, list management, read-only subscriber/send-log view
  (REQ-26)
- GDPR erasure handling for Newsletter-held send-log PII (REQ-27)
- Confirm/unsubscribe links built exclusively from the verified canonical origin, never the
  raw request host (REQ-30)

**Out of scope (deferred per ADR-034 §9, not silently reintroduced):**
- The `HttpApiMailerAdapter` provider (SMTP-shaped adapter ships first, per ADR-037 — and
  per this spec's own brownfield findings, *neither* adapter exists in code yet; building
  either is a Programmer-phase deliverable, not this spec's job)
- Open/click analytics (`email-analytics`) — its own privacy-sensitive ADR
- A/B subject-line testing
- Audience segmentation by behavior/query — v1 lists are explicit membership only
- Paid-tier gating / monetization
- The ADR-023 `dataModule` reconciliation engine itself — Newsletter's own tables ride the
  first-party, core-run, snapshot-before-DDL interim path (sweep §A.2), not a general
  third-party engine
- Attachment/virus scanning on any future signup upload surface
- A public, unauthenticated signup form (this spec covers admin-driven list membership and
  import only; a public form is a plausible fast-follow, not built here)
- Building Members' `member_consents` ledger or `members.consent.*` handlers — those are
  ADR-030's own deliverable; Newsletter only calls them and is structurally blocked from
  sending real mail while they don't exist (see REQ-21)

---

## Requirements

- REQ-01: The system shall let a principal holding `admin.newsletter.campaign.compose`
  create a campaign with `subject`, `preheader`, `fromName`, `fromEmail`, `replyTo`,
  `listId`, and a `bodyJson` editorial body, defaulting to `status: 'draft'`.
- REQ-02: The system shall let a principal holding `admin.newsletter.read` list campaigns
  for a workspace, filterable by `status`.
- REQ-03: The system shall let a principal holding `admin.newsletter.read` fetch a single
  campaign by id.
- REQ-04: The system shall let a principal holding `admin.newsletter.campaign.compose`
  update a campaign's editorial fields (`subject`, `preheader`, `fromName`, `fromEmail`,
  `replyTo`, `listId`, `bodyJson`) only while its `status` is `draft` or `scheduled`; an
  update attempted against `sending`, `sent`, `paused`, `canceled`, or `failed` is rejected.
- REQ-05: The system shall let a principal holding `admin.newsletter.campaign.compose`
  cancel a `draft` or `scheduled` campaign, transitioning it to `canceled`; a campaign that
  has already begun `sending` cannot be canceled outright (only paused, REQ-29).
- REQ-06: The system shall persist every campaign create/update/status-transition through
  exactly one write chokepoint that writes the campaign record and an append-only revision
  in the same transaction; no other code path may write campaign rows directly.
- REQ-07: The system shall let a principal holding `admin.newsletter.campaign.schedule`
  transition a `draft` campaign to `scheduled` with a `listId` that references an existing,
  non-archived list in the same workspace and an optional future `scheduledAt`.
- REQ-08: The system shall let a principal holding `admin.newsletter.list.manage`
  create/list/archive named lists; the system shall seed exactly one `isDefault: true` list
  per workspace at workspace creation, and the default list can never be archived or
  deleted.
- REQ-09: The system shall reject a campaign schedule/send whose `listId` does not resolve
  to an existing, non-archived list in the same workspace.
- REQ-10: The system shall let a principal holding `admin.newsletter.subscriber.manage` add,
  import, or remove a subscription referencing an existing Members principal id
  (`subscriberId`); the system shall never create a new Members identity on Newsletter's
  behalf.
- REQ-11: The system shall, when a subscription is created with `status: 'pending'`, compose
  and send (via `MailerPort`) a confirmation email containing a signed, single-use,
  short-TTL confirm link; clicking the link shall invoke the Members-owned
  `members.consent.request`/`members.consent.confirm` capability with an evidence payload
  (`consentTextRef`/`hash`, `source`, `confirmTokenId`), and only flip the local
  `SubscriptionRow.status` to `subscribed` after Members reports the consent as granted.
- REQ-12: The system shall let a principal holding `admin.newsletter.subscriber.manage`, or
  the subscriber via a still-valid original request context, resend a confirmation email,
  minting a fresh single-use confirm token and invalidating the previous one.
- REQ-13: The system shall reject a confirm-link click whose token has expired or was
  already consumed, with a typed error, and shall not change any subscription or consent
  state as a result.
- REQ-14: The system shall accept a one-click unsubscribe request bearing a token derived
  via `KeyringPort.derive()` whose payload includes `workspaceId`, `subscriberId`, `listId`,
  optional `campaignId`, and the subscriber's current `consentRevisionId`; the system shall
  reject (fail closed) a token whose embedded `consentRevisionId` does not match the
  subscriber's current consent revision.
- REQ-15: The system shall process a valid unsubscribe token idempotently and without
  requiring a session or login: the first click flips the subscription to `unsubscribed` and
  invokes `members.consent.revoke`; a repeated click with the same (now-stale, since revoked)
  token context returns the same success outcome without erroring.
- REQ-16: The system shall, when a `send` is authorized, materialize the target list's
  current `subscribed` subscriptions — filtered through `newsletter.recipient.filter` and
  the mail-lib suppression ledger — into one `AudienceSnapshotRow` and one `SendRow` per
  resolved recipient (`status: 'pending'`, unique `idempotencyKey`), resolving contact
  addresses through the Members read seam (`SubscriberDirectoryPort` /
  `getContacts`/`getContact`).
- REQ-17: The system shall fan out a frozen audience via the existing outbox worker
  (`processOutbox`) claiming `SendBatchJob`s in bounded batches; for each row the system
  shall run the `newsletter.email.beforeSend` hook, call `MailerPort.send()` with the row's
  stable `idempotencyKey`, and record `delivered`/`failed` with retry/backoff.
- REQ-18: The system shall drive campaign `status` through
  `draft → scheduled → sending → sent` (plus `paused`/`canceled`/`failed`) such that only
  the send pipeline — never an editor — can move a campaign into or out of
  `sending`/`sent`/`failed`.
- REQ-19: The system shall require `admin.newsletter.campaign.send` (held separately from
  `.compose`) to authorize a full-audience send.
- REQ-20: The system shall require `admin.newsletter.campaign.send_test` to authorize a test
  send, and shall restrict a test send to an operator-supplied list of test addresses
  provided at request time — a test send shall never read from or write to the campaign's
  subscription list or trigger an audience freeze.
- REQ-21: **Launch Readiness Gate.** The system shall reject a full-audience `send`
  (`admin.newsletter.campaign.send`) with `NEWSLETTER_LAUNCH_GATE_BLOCKED` unless all of the
  following hold at the moment of authorization: (a) the workspace setting
  `newsletter.launch_gate.sending_enabled` is explicitly `true` (default `false` on every
  workspace — never implied by any other setting); (b) the Members consent capability
  (`members.consent.request`/`.confirm`/`.revoke`) is registered and live, not an unbound
  stub; (c) `OriginRegistryPort.canonicalOrigin` resolves a verified origin for the
  workspace without throwing; and (d) the bound `MailerPort` adapter's
  `capabilities().driver` is neither `console` nor `memory`. A `send_test`
  (REQ-20) is exempt from preconditions (a) and (b) but remains subject to (c) and (d).
- REQ-22: The system shall consume `mail.feedback.received` events filtered to
  `sourceContext.module === 'newsletter'`, and shall treat the resulting subscription
  `bounced`/`complained` status as a downstream projection of the mail-lib suppression
  ledger (`MailSuppressionRepoPort`) — never as the record of suppression itself; a
  suppressed recipient must never receive mail from any future campaign regardless of
  whether Newsletter's local projection is current.
- REQ-23: The system shall run the `newsletter.email.beforeSend` hook (value-transforming:
  footer/unsubscribe-link/UTM injection) and the `newsletter.recipient.filter` hook
  (suppression) as synchronous, ordered, fail-closed steps before every per-row send.
- REQ-24: The system shall update a `SendRow`'s terminal status and the campaign's
  denormalized `counters` in the same atomic multi-write operation — both write or neither
  writes; the `counters` bag is always rebuildable from `p_newsletter__sends` and is never
  authored by any path other than that atomic operation.
- REQ-25: The system shall require the applicable `admin.newsletter.*` permission
  (§ Constitution Compliance / permission catalog below) for every admin operation named in
  REQ-01–REQ-20, REQ-26.
- REQ-26: The system shall present an admin screen listing campaigns (subject, list,
  status, counters) with a composer for create/edit, a list-management screen, and a
  read-only subscriber/send-log view scoped to the current campaign.
- REQ-27: The system shall implement the `principal.erasure.requested` handler for
  Newsletter-held PII: on receipt, the system shall anonymize `SendRow.recipientEmail`
  (and any other subscriber-identifying field on `p_newsletter__*` rows) for the named
  principal while preserving aggregate `counters` and revision history.
- REQ-28: The system shall make every per-row send idempotent by `idempotencyKey`: an
  outbox redelivery of the same `SendBatchJob`/`SendRow` shall never cause the provider (or
  the mail-lib send-dedup ledger, when the adapter lacks native idempotency) to send twice.
- REQ-29: The system shall let a principal holding `admin.newsletter.campaign.send` pause a
  `sending` campaign (the outbox worker stops claiming further rows for it) and resume a
  `paused` campaign (claiming continues from wherever the ledger left off).
- REQ-30: The system shall build every confirm and unsubscribe link from
  `OriginRegistryPort.canonicalOrigin` exclusively; no code path in this feature may read the
  raw inbound request `Host`/`:authority` header to construct a subscriber-facing link.
- REQ-31: The system shall write every imported subscription through the same subscription
  write chokepoint used by manual add — the same Members-principal-existence check, the
  same pending-confirmation flow — no separate unvalidated import path exists.
- REQ-32: The system shall never write directly to Members' `member_consents` record from
  Newsletter code; every consent-state transition (`request`/`confirm`/`revoke`) shall be a
  typed, capability-gated call into Members, with Newsletter supplying only the evidence
  payload — Newsletter's own `SubscriptionRow.status` is a local projection of that outcome,
  never its source of truth.

<!-- Add more as needed. Numbers must not be reused, even if a requirement is removed. -->

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a principal holding `admin.newsletter.campaign.compose`, when
  they submit a create request with valid `subject`/`fromEmail`/`listId`/`bodyJson`, then
  the API returns 201 with the created campaign, `status: 'draft'`, a generated ULID `id`,
  and `version: 1`.
- AC-02 (REQ-01) [P1]: Given a principal lacking `admin.newsletter.campaign.compose`, when
  they submit a create request, then the API returns 403 `FORBIDDEN` and no campaign is
  created.
- AC-03 (REQ-02) [P2]: Given a workspace with 2 `draft` and 1 `sent` campaign, when a
  principal holding `admin.newsletter.read` lists with `status: 'draft'`, then the API
  returns exactly the 2 draft campaigns.
- AC-04 (REQ-03) [P1]: Given an existing campaign id, when a principal holding
  `admin.newsletter.read` fetches it, then the API returns 200 with the full campaign;
  given a non-existent id, the API returns 404 `NEWSLETTER_CAMPAIGN_NOT_FOUND`.
- AC-05 (REQ-04) [P1]: Given a `draft` campaign, when a principal holding
  `admin.newsletter.campaign.compose` updates its `subject`, then the API returns 200 with
  `version` incremented by 1 and a new revision recorded.
- AC-06 (REQ-04) [P1]: Given a `sent` campaign, when a principal attempts to update its
  `subject`, then the API returns 409 `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` and the campaign is
  unchanged.
- AC-07 (REQ-05) [P2]: Given a `scheduled` campaign, when a principal holding
  `admin.newsletter.campaign.compose` cancels it, then the campaign transitions to
  `canceled` and is excluded from future send-pipeline consideration.
- AC-08 (REQ-06) [P1]: Given a campaign create request, when the write succeeds, then
  exactly one campaign row and exactly one revision row are written in the same
  transaction (verified by an integration test that forces a mid-transaction failure and
  asserts neither persists).
- AC-09 (REQ-07) [P1]: Given a `draft` campaign and an existing non-archived list, when a
  principal holding `admin.newsletter.campaign.schedule` schedules it, then the campaign
  transitions to `scheduled` and `newsletter.campaign.scheduled` is emitted.
- AC-10 (REQ-08) [P1]: Given a brand-new workspace, when the workspace is created, then
  exactly one `NewsletterListRow` with `isDefault: true` exists for it; when a principal
  attempts to archive that default list, the API returns 409
  `NEWSLETTER_DEFAULT_LIST_PROTECTED` and the list is unchanged.
- AC-11 (REQ-09) [P1]: Given a schedule/send request whose `listId` does not exist in the
  workspace, when the write chokepoint validates it, then the API returns 400
  `NEWSLETTER_VALIDATION_ERROR` and no transition occurs.
- AC-12 (REQ-10) [P1]: Given an existing Members principal id, when a principal holding
  `admin.newsletter.subscriber.manage` adds it to a list, then a `SubscriptionRow` is
  created with `status: 'pending'`, `source: 'admin'`.
- AC-13 (REQ-10) [P1]: Given a `subscriberId` that does not resolve to any Members
  principal, when a principal attempts to add it, then the API returns 400
  `NEWSLETTER_SUBSCRIBER_NOT_FOUND` and no subscription row is created.
- AC-14 (REQ-11) [P1]: Given a newly created `pending` subscription, when the create
  completes, then exactly one confirmation email is sent (via `MailerPort.send()`) carrying
  a signed confirm link, and no `SubscriptionRow.status` change occurs until that link is
  clicked and Members reports `granted`.
- AC-15 (REQ-11) [P1]: Given a valid, unexpired confirm token, when it is submitted, then
  `members.consent.request`/`.confirm` is invoked with the evidence payload, and only after
  a `granted` response does the local `SubscriptionRow.status` flip to `subscribed`.
- AC-16 (REQ-12) [P2]: Given a `pending` subscription whose original confirm token has not
  been consumed, when a resend is requested, then a new token is minted and the previous
  token no longer verifies.
- AC-17 (REQ-13) [P1]: Given a confirm token whose `expiresAt` has passed, when it is
  submitted, then the API returns 400 `NEWSLETTER_CONFIRM_TOKEN_INVALID` and no consent or
  subscription state changes.
- AC-18 (REQ-14) [P1]: Given a subscriber who has since re-subscribed (their
  `consentRevisionId` has advanced), when an unsubscribe token minted against the prior
  revision is submitted, then the request is rejected (fails closed) and the subscription
  remains `subscribed`.
- AC-19 (REQ-14) [P1]: Given a currently-valid unsubscribe token whose embedded
  `consentRevisionId` matches the subscriber's current revision, when it is submitted, then
  the subscription flips to `unsubscribed` and `members.consent.revoke` is invoked.
- AC-20 (REQ-15) [P1]: Given a subscription already `unsubscribed` via a token, when the
  same unsubscribe request is submitted again, then the API returns the same success
  outcome (idempotent), not an error, and no duplicate `newsletter.subscriber.unsubscribed`
  event is emitted for an already-processed unsubscribe.
- AC-21 (REQ-16) [P1]: Given a list with 3 `subscribed`, 1 `pending`, and 1 `unsubscribed`
  subscription, when a `send` is authorized (Launch Readiness Gate met), then exactly one
  `AudienceSnapshotRow` with `recipientCount: 3` and exactly 3 `SendRow`s are created.
- AC-22 (REQ-16) [P2]: Given a `subscribed` subscription whose `SubscriberDirectoryPort`
  lookup returns `null` (the Members principal no longer exists), when the audience freeze
  runs, then that subscriber is silently excluded from the snapshot and `recipientCount`
  reflects only resolved contacts.
- AC-23 (REQ-17) [P1]: Given a frozen audience of 3 `SendRow`s, when the outbox worker
  processes the campaign's `SendBatchJob`s, then each row transitions to `delivered` or
  `failed`, `MailerPort.send()` is called once per row with that row's stable
  `idempotencyKey`, and the `beforeSend` hook ran before each call.
- AC-24 (REQ-18) [P1]: Given a `sending` campaign, when any actor other than the send
  pipeline attempts to set its status directly to `sent`, then the API rejects the request;
  only the pipeline's own completion logic may perform that transition.
- AC-25 (REQ-19) [P1]: Given a principal holding `admin.newsletter.campaign.compose` but
  not `admin.newsletter.campaign.send`, when they attempt to send a scheduled campaign, then
  the API returns 403 `FORBIDDEN` and the campaign remains `scheduled`.
- AC-26 (REQ-20) [P1]: Given a principal holding `admin.newsletter.campaign.send_test`,
  when they submit a test send with 2 operator-supplied addresses, then exactly 2 mail sends
  occur, no `AudienceSnapshotRow`/`SendRow` is created, and the campaign's `status` is
  unchanged.
- AC-27 (REQ-21) [P1]: Given `newsletter.launch_gate.sending_enabled` is `false` (the
  default) for a workspace, when a principal holding `admin.newsletter.campaign.send`
  attempts a full-audience send, then the API returns 409
  `NEWSLETTER_LAUNCH_GATE_BLOCKED`, the campaign remains `scheduled`, and no
  `AudienceSnapshotRow` is created.
- AC-28 (REQ-21) [P1]: Given `sending_enabled: true` but the Members consent capability is
  unbound (a stub, not a live implementation), when a full-audience send is attempted, then
  the API returns 409 `NEWSLETTER_LAUNCH_GATE_BLOCKED` naming the unmet precondition.
- AC-29 (REQ-21) [P1]: Given `sending_enabled: true`, a live consent capability, and a
  verified origin, but the bound `MailerPort` adapter's `capabilities().driver` is
  `'console'`, when a full-audience send is attempted, then the API returns 409
  `NEWSLETTER_LAUNCH_GATE_BLOCKED`.
- AC-30 (REQ-21) [P1]: Given all four Launch Readiness Gate preconditions are met, when a
  full-audience send is authorized, then the send proceeds per REQ-16/REQ-17 with no gate
  error.
- AC-31 (REQ-21) [P2]: Given the Launch Readiness Gate is unmet, when a `send_test` is
  requested with a verified origin and a non-console/non-memory mailer adapter, then the
  test send proceeds (test sends are exempt from preconditions (a)/(b)).
- AC-32 (REQ-22) [P1]: Given a `mail.feedback.received` event with
  `sourceContext.module: 'newsletter'` and `kind: 'complained'`, when it is consumed, then
  the corresponding subscription flips to `complained` and no future campaign resolves that
  subscriber into an audience snapshot, even if the local flip is delayed.
- AC-33 (REQ-22) [P2]: Given a `mail.feedback.received` event with
  `sourceContext.module: 'members'` (a different consumer's send), when it arrives at
  Newsletter's handler, then it is ignored — no Newsletter subscription state changes.
- AC-34 (REQ-23) [P1]: Given a `beforeSend` hook registered by another plugin that injects
  a UTM parameter, when a row is sent, then the delivered message's body reflects that
  transform, proving the hook ran before `MailerPort.send()`.
- AC-35 (REQ-24) [P1]: Given a `SendRow` transitioning to `delivered`, when that write
  commits, then the campaign's `counters.delivered` is incremented in the same atomic
  operation (verified by an integration test that forces a mid-write failure and asserts
  neither the row nor the counter changed).
- AC-36 (REQ-27) [P2]: Given a `principal.erasure.requested` event for a subscriber with 2
  historical `SendRow`s, when the handler runs, then both rows' `recipientEmail` is
  anonymized while `campaign.counters` and revision history are unchanged.
- AC-37 (REQ-28) [P2]: Given a `SendRow` already marked `delivered` with
  `providerMessageId: X`, when the same outbox job is redelivered, then no second provider
  call occurs for that row (mail-lib send-dedup ledger short-circuits it) and the row
  remains `delivered` with the same `providerMessageId`.
- AC-38 (REQ-29) [P1]: Given a `sending` campaign, when a principal holding
  `admin.newsletter.campaign.send` pauses it, then the outbox worker claims no further
  `SendBatchJob`s for that campaign until it is resumed, and rows already claimed still
  complete.
- AC-39 (REQ-30) [P1]: Given a request whose `Host` header is attacker-controlled
  (`evil.example.com`), when a confirm or unsubscribe link is generated, then the link's
  origin is the workspace's `OriginRegistryPort`-verified canonical origin, never the
  request's `Host` header value.
- AC-40 (REQ-31) [P2]: Given a subscriber import batch of 3 rows where one `subscriberId`
  does not exist, when the import runs, then the 2 valid rows are written through the
  standard subscription chokepoint (each producing a pending confirmation email) and the
  invalid one is rejected with the same `NEWSLETTER_SUBSCRIBER_NOT_FOUND` a manual add would
  produce.
- AC-41 (REQ-32) [P1]: Given a code review of the Newsletter write paths, when the
  subscription-confirm and unsubscribe flows are inspected, then no path writes to a
  Members-owned table or record directly — every consent-state transition is a call to
  `members.consent.request`/`.confirm`/`.revoke`.
- AC-42 (REQ-25) [P1]: Given every route registered by this feature, when each is inspected,
  then each calls `deps.authorize()` with the specific `admin.newsletter.*` permission named
  in `api.spec.md` § 2 before performing any read or write — none falls back to a broader or
  missing permission check.
- AC-43 (REQ-26) [P1]: Given at least one existing campaign, list, and send-log row, when an
  admin opens Admin → Newsletter, then the campaign list, list-management screen, and the
  selected campaign's send-log view each render without error, showing the fields named in
  `ui.spec.md` § 4.

<!-- Rules:
  - Every REQ-* has at least one AC.
  - Every AC has a [P1], [P2], or [P3] tag.
  - P1 ACs are independently testable — each can be verified without other stories complete.
  - No AC requires knowledge of the implementation to evaluate.
  - AC numbers are never reused.
-->

---

## Invariants

- INV-01: A campaign row must never exist without a corresponding revision row recorded in
  the same write transaction that created or last mutated it.
- INV-02: A `SendRow`'s terminal-status write and the corresponding campaign `counters`
  update must always commit together, atomically — never one without the other.
- INV-03: Newsletter code must never write directly to Members' `member_consents` record or
  any Members-owned table; every consent-state transition is a typed call into Members
  (`members.consent.request`/`.confirm`/`.revoke`).
- INV-04: An unsubscribe token must never verify once the subscriber's `consentRevisionId`
  has advanced past the value embedded in that token at mint time.
- INV-05: A full-audience send (`admin.newsletter.campaign.send`) must never proceed while
  any Launch Readiness Gate precondition (REQ-21) is unmet.
- INV-06: An `AudienceSnapshotRow`'s frozen recipient set must never be mutated after
  creation — mid-send subscription churn changes future sends, never an in-flight one's
  already-frozen snapshot.
- INV-07: A recipient recorded as suppressed in the mail-lib suppression ledger
  (`MailSuppressionRepoPort`) must never receive a subsequent send from any Newsletter
  campaign, regardless of whether Newsletter's local subscription-status projection has
  caught up.
- INV-08: The Newsletter plugin must never hold a live `MailerPort` instance in its own
  code — every send is submitted as data through the outbox/command spine; core injects and
  calls the port.
- INV-09: No code path in this feature may read the raw inbound request `Host`/`:authority`
  header to construct a confirm or unsubscribe link; every link is built from
  `OriginRegistryPort.canonicalOrigin`.
- INV-10: A `SendBatchJob`/`SendRow` redelivery must never cause a duplicate provider send
  to the same recipient for the same campaign — enforced by a stable `idempotencyKey` and,
  when the adapter lacks native idempotency, the mail-lib send-dedup ledger.

---

## Edge Cases

- EC-01: What happens when a subscriber unsubscribes after their campaign's audience has
  already been frozen but before their `SendRow` is processed?
  Expected behavior: The frozen snapshot is not retroactively edited (INV-06); instead, the
  per-row send path re-checks `newsletter.recipient.filter` and the mail-lib suppression
  ledger immediately before calling `MailerPort.send()` for that row, marks the row `failed`
  with `lastError: 'SUPPRESSED_POST_FREEZE'` without ever calling the provider, and does not
  increment `delivered`/`bounced` — only `failed`.
- EC-02: What happens when a confirm link is clicked twice — once successfully, then again
  after the token has been consumed?
  Expected behavior: The second click returns `NEWSLETTER_CONFIRM_TOKEN_INVALID` (a
  consumed token behaves identically to an expired one); no state changes on the repeat.
- EC-03: What happens when an unsubscribe link is clicked twice in a row (the common
  double-click case)?
  Expected behavior: The first click flips the subscription and revokes consent; the second
  click, evaluated against the now-advanced `consentRevisionId`, would ordinarily fail INV-04
  — but a repeat of the *same* already-processed unsubscribe token, for the *same* token and
  the *same* resulting terminal state, is treated as an idempotent success (REQ-15), not a
  rejected stale-token error, since the outcome it requests (`unsubscribed`) already holds.
- EC-04: What happens when the outbox worker crashes mid-batch, after calling
  `MailerPort.send()` for a row but before recording the result?
  Expected behavior: On restart, the same `SendBatchJob` is reclaimed; the row's
  `idempotencyKey` is unchanged, so the mail-lib send-dedup ledger (or the provider's native
  idempotency) prevents a second real send even though the local row still reads `pending`
  — the retry safely reconciles to the true delivered/failed outcome.
- EC-05: What happens when the Launch Readiness Gate flips from met to unmet (an operator
  disables `sending_enabled`) while a campaign is actively `sending`?
  Expected behavior: Rows already claimed by an in-flight `SendBatchJob` complete normally
  (no interrupt of an in-progress atomic operation); the outbox worker simply claims no
  further batches for any campaign until the gate is re-met — the gate blocks starting new
  irreversible work, not existing in-flight work.
- EC-06: What happens when two admins schedule the same campaign concurrently?
  Expected behavior: The second writer's request carries a stale `version`; the write
  chokepoint rejects it with a version-conflict error (mirrors the ADR-022 §4c optimistic-
  concurrency convention) rather than silently overwriting the first writer's transition.
- EC-07: What happens when `SubscriberDirectoryPort.getContacts` is called with a
  `subscriberId` that no longer resolves to a Members principal?
  Expected behavior: Per the existing `MembersSubscriberDirectory` implementation
  (`src/members/subscriber-directory.ts`), the id is silently omitted from the returned
  array — the audience freeze excludes that subscriber and `recipientCount` reflects only
  resolved contacts (AC-22); this is expected, not an error.
- EC-08: What happens when an import batch contains a `subscriberId` that does not exist?
  Expected behavior: The valid rows in the batch are written through the standard
  subscription chokepoint; the invalid row is rejected with
  `NEWSLETTER_SUBSCRIBER_NOT_FOUND`, identical to a manual add of the same bad id — import
  does not silently skip or special-case it.
- EC-09: What happens when a `mail.feedback.received` event's `sourceContext.module` is not
  `'newsletter'`?
  Expected behavior: Newsletter's handler filters it out and takes no action — the event may
  legitimately belong to Members or another mail consumer.
- EC-10: What happens when a `send_test` is requested in a workspace with no verified
  origin registered?
  Expected behavior: The test send is still rejected — precondition (c) (verified origin) of
  the Launch Readiness Gate is NOT waived for test sends, since the rendered test message
  still carries a real confirm/unsubscribe footer link that must be safe and correctly
  formed; only preconditions (a) `sending_enabled` and (b) live consent capability are
  waived for `send_test` (REQ-21).

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `mail` library (`src/mail/`, ADR-037) `MailerPort` | The single mail-send seam; core injects it, Newsletter never holds it | **No adapter class exists in this repo today** (`src/mail/` is interfaces-only — no `ConsoleMailerAdapter`/`SmtpMailerAdapter`/`HttpApiMailerAdapter`/`InMemoryMailerAdapter` class, no `MailSuppressionRepoPort`/`MailSendDedupRepoPort` implementation) — this alone blocks any real send today, independent of Members' readiness | None by design for production sending — building at least one production-capable adapter is an explicit precondition of the Launch Readiness Gate (REQ-21d), owed to ADR-037, not this spec |
| `origin` library (`src/origin/`, ADR-040) `OriginRegistryPort` | Verified canonical origin for confirm/unsubscribe links; `isAllowedRedirectTarget` for any future redirect-shaped link | Genuinely implemented (`OriginRegistry` class + `InMemoryOriginSettingRepo`) — if no verified origin is registered for a workspace, `canonicalOrigin` throws `OriginNotVerifiedError` and the Launch Readiness Gate fails closed (REQ-21c) | None by design — fail-closed is the intended behavior |
| Members library (`src/members/`, ADR-030) — subscriber directory seam | Read-only contact resolution (`SubscriberDirectoryPort.getContact`/`getContacts`, implemented today as `MembersSubscriberDirectory`) for global (not purpose-scoped) deliverability | Real and working for the global-suppression case; **`member_consents` and `members.consent.request/confirm/revoke` do not exist anywhere in this codebase today** (confirmed in `src/members/INFO.md`) — REQ-11/REQ-14/REQ-15/REQ-32's calls into Members' consent capability have no live implementation to call yet | None — this is the structural reason the Launch Readiness Gate's precondition (b) exists; Newsletter cannot originate consent state itself as a workaround (INV-03) |
| `KeyringPort` (home: `src/integrations/`, re-exported via its index; ADR-036 Round-4 fold names it the shared derivation primitive) | `derive({ workspaceId, purpose, info })` for the unsubscribe token, matching Analytics' salt-derivation precedent | Interfaces-only in this repo today, same as `mail` — no concrete adapter class exists; an in-memory adapter is named as the intended test double in the port's own doc comments, but is not yet built | Building a concrete `KeyringPort` adapter (even an in-memory one for tests) is a Programmer-phase precondition for REQ-14/REQ-15, not a design gap this spec introduces |
| Content-entries substrate for `newsletter_campaign` | ADR-034 §2 designs the campaign as a seeded content-type `entries` row (`fields.ext.newsletter.*`) reusing the write-chokepoint/revision/status machinery ADR-022 describes | **No generalized `entries`/content-type-registry abstraction exists in this repo** — only a concrete `src/features/post` feature (posts) is built; there is no registry-as-data content-type mechanism a `newsletter_campaign` type could register into today | This spec specifies `CampaignRecord`'s shape and transition rules independent of which concrete storage mechanism implements them (`state.spec.md` § 1); Software Architect must decide whether to generalize `src/features/post`'s chokepoint pattern or build a dedicated `newsletter_campaigns` table via the ADR-023 `dataModule` interim path — this is a real, named implementation-planning decision, not resolved here |
| ADR-023 `dataModule` declared-schema shape (`src/features/plugins/data-module.ts`) | The shape core's reconciliation engine will eventually execute to create `p_newsletter__*` tables | The reconciliation **engine itself does not exist** (ADR-INDEX: "engine built v-next"); ADR-034's own Round-3 fold states plainly: "Neither [the engine nor a fully-specified first-party interim table-creation path] exists today" | Per sweep §A.2, first-party bundled (Comments/Newsletter) execution through the existing snapshot-before-DDL path is sanctioned in principle, but the concrete snapshot-before-DDL *code path* for this interim case is itself unbuilt — Software Architect must name/build it before `p_newsletter__*` tables can exist, or wait for the engine; this spec freezes the five tables' *row shapes* (`state.spec.md`) so that work is not blocked on this spec |
| `outbox` worker (`src/core/events/outbox-worker.ts`) `processOutbox`/`OutboxPort`/`EventBusPort` | The generic, already-implemented claim/deliver/retry loop `SendBatchJob` fan-out rides (REQ-17) | If Newsletter never registers a job handler, no send ever progresses past `pending` | None — this is a hard integration requirement; the primitive itself is real and working today |
| Identity/permissions catalog (`src/identity/permissions.ts`) | Registration + enforcement of the `admin.newsletter.*` catalog | If the permission ids are never registered, `authorize()` calls referencing them fail closed (denied) | None — registering the catalog is an in-scope REQ-25 precondition, not an external risk; see Agent Directives for the exact naming mismatch this spec corrects |

---

## Open Questions

- OQ-01: Whether a subscriber-initiated confirm-resend (REQ-12, no admin session) needs its
  own rate limit / anti-enumeration mitigation analogous to Members' magic-link OQ-8. This
  spec assumes the same constant-response posture Members already uses (`{ delivered: true
  }` regardless of subscription existence) pending confirmation. — Owner: Software Architect
  — Resolve by: `/plan` dispatch for FEAT-011.
- OQ-02: The exact mechanism/store for `newsletter.launch_gate.sending_enabled` (a
  workspace setting via the ADR-028 settings ledger, vs. a Newsletter-local flag) is left to
  Software Architect; this spec only requires that it default to `false` and require an
  explicit operator action to flip, never inherited from another setting's value. — Owner:
  Software Architect — Resolve by: `/plan` dispatch for FEAT-011.
- OQ-03: Whether `p_newsletter__confirmation_tokens` (the 5th own-table this spec introduces
  beyond ADR-034's four named tables — lists/subscriptions/audience_snapshots/sends — to
  data-model the round-2-fold-added confirmation mechanics) should instead be modeled as a
  Newsletter-owned ext-field on the subscription row rather than a separate table, is left
  to Software Architect as a storage-shape decision; this spec only requires single-use,
  hashed, TTL-bound token semantics (mirroring `MagicLinkTokenRecord`). — Owner: Software
  Architect — Resolve by: `/plan` dispatch for FEAT-011.
- OQ-04: Ledger retention/pruning policy for `p_newsletter__sends` (ADR-034 OPEN-4,
  unresolved at the ADR level) is inherited here unresolved; this spec does not invent a
  retention policy. — Owner: pending Storage/Backups primitive owner — Resolve by: not
  gating for FEAT-011 v1.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No custom crypto/mail-transport/URL-parsing is introduced — `KeyringPort.derive()` (existing HKDF-based primitive), `MailerPort` (existing shared seam), and `OriginRegistryPort` (existing WHATWG-parser-based oracle) are reused as-is; no new library evaluated/rejected in this spec. |
| II — Test-First | COMPLIES | No implementation code exists yet beyond `src/newsletter/ports.ts`/`types.ts` interface stubs; TDD Agent certifies failing tests against this spec's ACs/INVs/ECs before any adapter/route/UI code is written. |
| III — Simplicity Gate | COMPLIES | Every module traces to a REQ: campaign chokepoint (REQ-06), list/subscription management (REQ-08–REQ-10), confirm mechanics (REQ-11–REQ-13), unsubscribe (REQ-14/REQ-15), send pipeline (REQ-16–REQ-18), Launch Readiness Gate (REQ-21), feedback consumption (REQ-22), hooks (REQ-23), admin UI (REQ-26). Analytics/segmentation/monetization/edge-adapter work is explicitly out of scope, not built speculatively. |
| IV — Anti-Abstraction Gate | COMPLIES | No new ADR-006 port is introduced by this spec. `MailerPort`/`OriginRegistryPort`/`KeyringPort` are imported, already-decided seams; the Members read seam is, per ADR-034's own Round-3/4 fold, a corrected **single-evaluator typed dependency** (`SubscriberDirectoryPort`, implemented as `MembersSubscriberDirectory`) — explicitly NOT re-promoted to a port here, matching the ADR text exactly. |
| V — Integration-First Testing | COMPLIES | Every P1 AC above names an HTTP/route, cross-module (Members consent capability, outbox worker), or transactional boundary and is tested at that boundary, per `traceability.spec.md`. |
| VI — Security-by-Default | COMPLIES | The Launch Readiness Gate (REQ-21), permission gating (REQ-19/REQ-20/REQ-25), fail-closed unsubscribe-token revision check (REQ-14/INV-04), and origin-only link construction (REQ-30/INV-09) are load-bearing P1 requirements, not deferred. Per the constitution's standing Art. VI exception, the local dev server itself remains unauthenticated, but structural authz (`admin.newsletter.*` checks) is enforced in code from day one. |
| VII — Spec Integrity | COMPLIES | This spec's `spec_id`/`content_hash` are the reference every downstream artifact (a future ADR-PIPE-011 if one is drafted, tasks, tests) must cite; hash is computed/verified via the provider-local validator. |
| VIII — Observability | COMPLIES | `newsletter.campaign.*`/`newsletter.send.*`/`newsletter.subscriber.unsubscribed` outbox events (ADR-009 lane) carry `campaignId`/`workspaceId`/`sendId` as correlation ids; `errors.spec.md` defines a structured error envelope for every feature-specific error code, including the Launch Readiness Gate's own code. |

---

## Implementation Readiness Gate

This checklist must be fully checked before the spec is handed off to the Software Architect Agent.
The Spec Agent completes this. The Coordinator verifies before routing.

- [x] spec_id assigned and unique (verified against existing `ADS-project-knowledge/reports/pipeline/` folders — no existing `011-*` folder prior to this run)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has non-trivial ordering/precedence rules — campaign status machine, gate precondition ordering, tie-break, defaults)
- [x] traceability.spec.md complete (pending implementation — REQ/AC/INV/EC rows seeded, impl/test columns pending)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] If `spec_mode` is `brownfield`, `reverse_spec`, or `migration`, brownfield/reverse-spec evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Register the `admin.newsletter.*` catalog in `src/identity/permissions.ts` following the
  existing `PermissionDescriptor` pattern: `admin.newsletter.read`,
  `admin.newsletter.campaign.compose`, `admin.newsletter.campaign.schedule`,
  `admin.newsletter.campaign.send`, `admin.newsletter.campaign.send_test`,
  `admin.newsletter.list.manage`, `admin.newsletter.subscriber.read`,
  `admin.newsletter.subscriber.manage`, `admin.newsletter.settings.manage`,
  `admin.newsletter.manage` (umbrella). Note: `src/newsletter/types.ts`'s current
  `NEWSLETTER_PERMISSIONS` constant uses **unprefixed** `newsletter.*` strings (predates the
  2026-07-10 sweep's frozen `admin` + section + action ruling, `sweep-crosscutting-
  decisions-20260710.md` line 71) — Software Architect must update that constant to the
  `admin.newsletter.*` forms during implementation planning, matching how SPEC-009 (Redirects)
  handled the identical `admin.redirects.manage` naming reconciliation.
- Treat `src/mail`, `src/integrations` (`KeyringPort`'s current home), and Members'
  `member_consents`/`members.consent.*` as **named, unbuilt preconditions**, not silent
  gaps — the Launch Readiness Gate (REQ-21) exists specifically because this spec is
  buildable and testable today even though none of those three are live yet.
- Treat `MembersSubscriberDirectory`/`SubscriberDirectoryPort` (`src/members/subscriber-
  directory.ts`, `src/newsletter/ports.ts`) as the real, already-implemented seam this
  spec's REQ-16 audience-freeze resolution calls — it satisfies ADR-030's decided
  "publish `AudienceDirectoryPort`" outcome under its existing, pre-existing interface name;
  do not rename it without a separate decision, and do not treat the name difference as a
  functional gap.

Ask before:
- Building a public, unauthenticated signup form, any `email-analytics` pixel/redirect
  surface, A/B subject testing, or audience segmentation — named DEFERRED items, not
  silently in scope.
- Choosing the concrete storage mechanism for `newsletter_campaign` (extend
  `src/features/post`'s pattern vs. a dedicated `dataModule` table) — see the Dependencies
  table; this is a real open implementation-planning decision.

Never:
- Let `admin.newsletter.campaign.send` (full-audience) proceed while any Launch Readiness
  Gate precondition (REQ-21) is unmet, regardless of how urgent the request seems.
- Let Newsletter code write to a Members-owned table or record directly (INV-03) — every
  consent-state transition is a typed call into Members.
- Build the Newsletter plugin to hold a live `MailerPort` object in its own code path
  (INV-08) — sends are always data submitted through the outbox/command spine.
