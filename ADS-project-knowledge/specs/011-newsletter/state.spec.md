# State Contract Spec: newsletter

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-011`
- Feature: `FEAT-011-newsletter`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Defines the durable persisted state ADR-034 §2 names (a campaign entry + four own-tables)
plus one own-table this spec adds (`p_newsletter__confirmation_tokens`, § Note below) and
the admin-UI client state, in a language-neutral format. Row shapes are taken directly from
`src/newsletter/types.ts` (already written, ADR-034-governed) where they exist; this file
specifies transitions and invariants over them, plus the shapes ADR-034's text describes but
`types.ts` does not yet declare (the confirmation-token record — see Note).

**Note on storage substrate (see `feature.spec.md` Dependencies table):** ADR-034 §2 designs
the campaign as a seeded content-type `entries` row. No generalized `entries`/content-type
registry exists in this repo today (only the concrete `src/features/post` feature) — so
`CampaignRecord` below is specified as a row shape and a set of transition/invariant rules
independent of which concrete mechanism ultimately stores it. Software Architect decides the
storage mechanism (extend `post`'s pattern vs. a dedicated `dataModule` table); this file is
the contract that mechanism must satisfy either way.

## 1) Durable State Shape (per workspace)
| Table / Substrate | Row Shape | Nullable Fields | Initial Value on Create | Description |
|---|---|---|---|---|
| Campaign substrate (mechanism TBD — see Note) | `CampaignRecord` | `preheader`, `scheduledAt`, `sendStartedAt`, `audienceSnapshotId` | `status: 'draft'`, `version: 1`, `counters` all-zero | One row per campaign; append-only revision on every write |
| Campaign revisions (same substrate as above) | `CampaignRevision` | none | one row per write (`seq: 1` on create) | Append-only ledger; never updated in place |
| `p_newsletter__lists` | `NewsletterListRow` | none | `isDefault: false` unless workspace-seeded | Named audiences; exactly one `isDefault: true` row seeded per workspace |
| `p_newsletter__subscriptions` | `SubscriptionRow` | `subscribedAt`, `unsubscribedAt` | `status: 'pending'`, `source` as given | Per-(subscriber, list) edge; Newsletter-owned status only, identity is Members-owned |
| `p_newsletter__audience_snapshots` | `AudienceSnapshotRow` | none | one row per send attempt | Frozen recipient count at freeze time; immutable after creation (INV-06) |
| `p_newsletter__sends` | `SendRow` | `providerMessageId`, `lastError`, `nextAttemptAt` | `status: 'pending'`, `attempts: 0` | One row per (campaign, subscriber) delivery attempt; source of truth for counters |
| `p_newsletter__confirmation_tokens` (this spec's addition — OQ-03) | `ConfirmationTokenRecord` | `consumedAt` | one row per confirm-email send | Single-use, hashed, TTL-bound token backing REQ-11/REQ-12/REQ-13; mirrors `MagicLinkTokenRecord` (`src/members/types.ts`) shape by design for consistency |

## 2) Entity Contracts
```yaml
CampaignRecord:
  id: string (ulid)
  workspaceId: string (uuid)
  status: enum[draft, scheduled, sending, sent, paused, canceled, failed]
  subject: string
  preheader: string | null
  fromName: string
  fromEmail: string
  replyTo: string
  listId: string (uuid)
  scheduledAt: string (date-time) | null
  sendStartedAt: string (date-time) | null
  audienceSnapshotId: string (uuid) | null
  counters: CampaignCounters
  createdByPrincipal: string (uuid)
  createdAt: string (date-time)
  updatedAt: string (date-time)
  version: integer

CampaignCounters:
  recipients: integer
  delivered: integer
  failed: integer
  bounced: integer
  complained: integer
  unsubscribed: integer
  # Denormalized read cache — source of truth is p_newsletter__sends (REQ-24);
  # never authored by any path other than the atomic multi-write step.

CampaignRevision:
  campaignId: string (ulid)
  workspaceId: string (uuid)
  seq: integer
  state: CampaignRecord
  actorId: string (uuid)
  recordedAt: string (date-time)

NewsletterListRow:
  id: string (ulid)
  workspaceId: string (uuid)
  name: string
  slug: string
  isDefault: boolean
  archivedAt: string (date-time) | null
  createdAt: string (date-time)
  updatedAt: string (date-time)

SubscriptionRow:
  id: string (ulid)
  workspaceId: string (uuid)
  listId: string (uuid)
  subscriberId: string (uuid)     # FK into the Members-owned subscriber directory
  status: enum[pending, subscribed, unsubscribed, bounced, complained]
  source: enum[import, signup_form, admin, api]
  consentRevisionIdAtSubscribe: string | null
  # Snapshot of the Members consent-revision id in effect when this subscription last
  # entered 'subscribed' — the input the unsubscribe-token derivation binds to (REQ-14).
  subscribedAt: string (date-time) | null
  unsubscribedAt: string (date-time) | null
  createdAt: string (date-time)
  updatedAt: string (date-time)

AudienceSnapshotRow:
  id: string (ulid)
  workspaceId: string (uuid)
  campaignId: string (ulid)
  listId: string (uuid)
  recipientCount: integer
  createdAt: string (date-time)
  # Immutable after creation (INV-06) — no update action exists for this row.

SendRow:
  id: string (ulid)
  workspaceId: string (uuid)
  campaignId: string (ulid)
  audienceSnapshotId: string (uuid)
  subscriberId: string (uuid)
  recipientEmail: string           # frozen at snapshot time; anonymized post-erasure (REQ-27)
  status: enum[pending, sent, delivered, failed, bounced, complained]
  attempts: integer
  idempotencyKey: string
  providerMessageId: string | null
  lastError: string | null
  nextAttemptAt: string (date-time) | null
  createdAt: string (date-time)
  updatedAt: string (date-time)

ConfirmationTokenRecord:
  id: string (ulid)
  workspaceId: string (uuid)
  subscriptionId: string (ulid)
  tokenHash: string                # SHA-256 of the raw token; raw token never persisted
  purpose: "newsletter_subscription_confirm"
  createdAt: string (date-time)
  expiresAt: string (date-time)
  consumedAt: string (date-time) | null

# Admin UI client state
AdminNewsletterState:
  campaigns: array<CampaignRecord>
  selectedCampaignId: string | null
  lists: array<NewsletterListRow>
  subscriptions: array<SubscriptionRow>
  sendLog: array<SendRow>
  loading: NewsletterLoadingState
  errors: NewsletterErrorState
  campaignStatusFilter: enum[draft, scheduled, sending, sent, paused, canceled, failed] | null

NewsletterLoadingState:
  fetchingCampaigns: boolean
  creatingCampaign: boolean
  updatingCampaign: boolean
  schedulingCampaign: boolean
  sendingCampaign: boolean
  sendingTestCampaign: boolean
  fetchingLists: boolean
  fetchingSubscriptions: boolean
  fetchingSendLog: boolean

NewsletterErrorState:
  fetchCampaigns: Error | null
  createCampaign: Error | null
  updateCampaign: Error | null
  scheduleCampaign: Error | null
  sendCampaign: Error | null
  sendTestCampaign: Error | null
  fetchLists: Error | null
  fetchSubscriptions: Error | null
```

## 3) Action Catalog

### 3.1 Durable-state (chokepoint) actions
| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `SAVE_CAMPAIGN` | `{ record, revision }` | fields pass shape validation; `listId` resolves to an existing non-archived list (REQ-09) if scheduling/sending | Insert-or-update campaign row + append revision, same transaction | `NEWSLETTER_VALIDATION_ERROR`/`NEWSLETTER_LIST_NOT_FOUND` on precondition failure |
| `CANCEL_CAMPAIGN` | `{ workspaceId, id, revision }` | `status` is `draft` or `scheduled` | Flip `status: 'canceled'`, append revision | `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` otherwise |
| `SCHEDULE_CAMPAIGN` | `{ workspaceId, id, scheduledAt?, revision }` | `status === 'draft'`; `listId` resolves | Flip `status: 'scheduled'`, set `scheduledAt`, append revision | `NEWSLETTER_VALIDATION_ERROR` |
| `AUTHORIZE_SEND` | `{ workspaceId, id }` | `status === 'scheduled'`; Launch Readiness Gate met (REQ-21) | Flip `status: 'sending'`, set `sendStartedAt`, append revision | `NEWSLETTER_LAUNCH_GATE_BLOCKED` / `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` |
| `FREEZE_AUDIENCE` | `{ workspaceId, campaignId, listId }` | Called only immediately after `AUTHORIZE_SEND` commits | Insert one `AudienceSnapshotRow` + N `SendRow`s (`status: 'pending'`), set `campaign.audienceSnapshotId` | Never partially applied — one transaction |
| `RECORD_SEND_RESULT` | `{ workspaceId, sendId, status, providerMessageId?, lastError? }` | `SendRow` exists, not already in a terminal state for this attempt | Update `SendRow` status + campaign `counters`, same atomic multi-write (REQ-24/ADR-026 envelope) | Never one write without the other (INV-02) |
| `COMPLETE_CAMPAIGN` | `{ workspaceId, campaignId }` | Every `SendRow` for the campaign's `audienceSnapshotId` is terminal | Flip campaign `status: 'sent'`, append revision, emit `newsletter.campaign.sent` | n/a |
| `PAUSE_CAMPAIGN` / `RESUME_CAMPAIGN` | `{ workspaceId, id, revision }` | `status === 'sending'` (pause) / `'paused'` (resume) | Flip `status`, append revision | `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` otherwise |
| `SAVE_LIST` / `ARCHIVE_LIST` | `{ record }` | `ARCHIVE_LIST` rejects `isDefault: true` (REQ-08) | Insert-or-update `NewsletterListRow` | `NEWSLETTER_DEFAULT_LIST_PROTECTED` |
| `SAVE_SUBSCRIPTION` | `{ record }` | `subscriberId` resolves via the Members directory seam (REQ-10) | Insert-or-update `SubscriptionRow`, `status: 'pending'` on create | `NEWSLETTER_SUBSCRIBER_NOT_FOUND` |
| `ISSUE_CONFIRMATION_TOKEN` | `{ subscriptionId }` | Subscription `status === 'pending'` | Insert `ConfirmationTokenRecord`; invalidate any prior unconsumed token for the same subscription (REQ-12); send confirmation mail | n/a |
| `CONSUME_CONFIRMATION_TOKEN` | `{ tokenHash }` | Token exists, unexpired, unconsumed | Mark token consumed; invoke `members.consent.request`/`.confirm`; on `granted`, flip `SubscriptionRow.status: 'subscribed'`, stamp `consentRevisionIdAtSubscribe` | `NEWSLETTER_CONFIRM_TOKEN_INVALID` |
| `PROCESS_UNSUBSCRIBE` | `{ derivedTokenClaims }` | `derivedTokenClaims.consentRevisionId === subscription.consentRevisionIdAtSubscribe` (INV-04) | Flip `SubscriptionRow.status: 'unsubscribed'`; invoke `members.consent.revoke`; emit `newsletter.subscriber.unsubscribed` | `NEWSLETTER_UNSUBSCRIBE_TOKEN_INVALID`; already-`unsubscribed` is treated as success (REQ-15/EC-03), not an error |
| `APPLY_FEEDBACK_PROJECTION` | `MailerFeedbackEvent` (filtered `sourceContext.module==='newsletter'`) | none (best-effort projection) | Flip matching `SubscriptionRow.status` to `bounced`/`complained` | Never blocks the mail-lib ledger write it projects from (REQ-22) |
| `ANONYMIZE_SEND_LOG` (`principal.erasure.requested` handler) | `{ subscriberId }` | none | Set `recipientEmail: '[erased]'` on all matching `SendRow`s | Never mutates `counters`/revision history |

### 3.2 Admin-UI client actions
| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `FETCH_CAMPAIGNS_REQUEST`/`_SUCCESS`/`_FAILURE` | optional `statusFilter` / `campaigns` / error | none | `loading.fetchingCampaigns` toggles; `campaigns` replaced on success | set/clear `errors.fetchCampaigns` |
| `CREATE_CAMPAIGN_REQUEST`/`_SUCCESS`/`_FAILURE` | `CreateCampaignInput` / created `CampaignRecord` / error | valid form input | `loading.creatingCampaign` toggles; append to `campaigns` on success, form retained on failure | set/clear `errors.createCampaign` |
| `UPDATE_CAMPAIGN_*` | `id + changes` | campaign exists in `campaigns` | optimistic patch / reconcile / rollback | set/clear `errors.updateCampaign` |
| `SCHEDULE_CAMPAIGN_*` | `id, scheduledAt?` | campaign is `draft` | optimistic `status: 'scheduled'` / reconcile / rollback | set/clear `errors.scheduleCampaign` |
| `SEND_CAMPAIGN_*` | `id` | campaign is `scheduled` | optimistic `status: 'sending'` / reconcile / rollback (surfaces `NEWSLETTER_LAUNCH_GATE_BLOCKED` inline) | set/clear `errors.sendCampaign` |
| `SEND_TEST_CAMPAIGN_*` | `id, testAddresses` | non-empty address list | `loading.sendingTestCampaign` toggles; no `campaigns` mutation | set/clear `errors.sendTestCampaign` |
| `SELECT_CAMPAIGN` | `id \| null` | none | update `selectedCampaignId` | none |
| `SET_CAMPAIGN_STATUS_FILTER` | `status \| null` | none | update filter, re-fetch | none |
| `FETCH_LISTS_*` / `FETCH_SUBSCRIPTIONS_*` / `FETCH_SEND_LOG_*` | — | none | analogous `loading`/`errors`/data-replace pattern | analogous |

## 4) Selector Contracts
| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `selectCampaigns` | full state | `array<CampaignRecord>` filtered by `campaignStatusFilter` | empty array when no data |
| `selectSelectedCampaign` | full state | `CampaignRecord \| null` | null when no selection or missing campaign |
| `selectIsLoading` | full state | `boolean` | OR of all `loading.*` flags |
| `selectLaunchGateHint` | full state + workspace settings | `{ met: boolean; unmetPreconditions: string[] }` | Client-side best-effort mirror of REQ-21 for UI messaging only — the server re-evaluates authoritatively on `SEND_CAMPAIGN`; never trusted as the enforcement point |
| `selectCampaignDeliveryRate` | one `CampaignRecord` | `number` (0–1) | `0` when `counters.recipients === 0` |

## 5) State Invariants
- [ ] A campaign row's `version` is monotonically increasing and equals the count of
  revisions recorded for it.
- [ ] A campaign revision row is never updated or deleted after insert (append-only).
- [ ] `AudienceSnapshotRow.recipientCount` never changes after creation (INV-06).
- [ ] `SendRow.status` transitions only through `pending → {sent|failed} → {delivered|
  bounced|complained}` or terminates directly at `failed` (never regresses to `pending`
  once left).
- [ ] `CampaignCounters` fields always equal the count of `SendRow`s in the corresponding
  terminal status for that `audienceSnapshotId` (rebuildable invariant, REQ-24).
- [ ] `ConfirmationTokenRecord.consumedAt`, once set, is never cleared.
- [ ] `SubscriptionRow.consentRevisionIdAtSubscribe` is only ever set by
  `CONSUME_CONFIRMATION_TOKEN`, never by any client-supplied value.
- [ ] `selectedCampaignId` is `null` or exists in `campaigns`.
- [ ] Any `*_REQUEST` action sets only its matching loading flag; any `*_SUCCESS`/`*_FAILURE`
  clears it.
- [ ] Optimistic rollback paths restore pre-request values.

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free.
- [x] Entity fields and enums align with `api.spec.md` and `ui.spec.md`.
