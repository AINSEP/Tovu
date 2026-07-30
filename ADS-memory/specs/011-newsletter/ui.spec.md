# UI Contract Spec: newsletter

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-011`
- Feature: `FEAT-011-newsletter`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Defines the admin UI component contracts for the Newsletter section, following the existing
convention in `apps/admin/src/sections/Members.tsx` (`useState`/`useEffect` + a thin `api`
client wrapper, no state-management library) and `Menus.tsx`/`MenuEditor.tsx` (list +
dedicated editor screens). Today's `apps/admin/src/sections/Members.tsx` is intentionally
thin (fetch + render a table, no create/edit UI) — Newsletter's admin surface is richer
(composer, send actions) and follows the list+editor split instead.

## 1) Component Registry
| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `NewsletterCampaigns` | List screen: campaign table + status filter + "New campaign" action | Section 2.1 | Section 3.1 |
| `CampaignRow` | Presents a single campaign row with status badge and counters | Section 2.2 | Section 3.2 |
| `CampaignEditor` | Create/edit form for a single campaign (subject/body/list/from) | Section 2.3 | Section 3.3 |
| `CampaignSendPanel` | Schedule/send/send-test/pause/resume actions, surfaces the Launch Readiness Gate state | Section 2.4 | Section 3.4 |
| `NewsletterLists` | List-management screen: named lists + create/archive | Section 2.5 | Section 3.5 |
| `SubscriptionTable` | Read-only list of a list's subscriptions with add/remove/resend-confirmation actions | Section 2.6 | Section 3.6 |
| `SendLogTable` | Read-only per-recipient send-log view for a campaign | Section 2.7 | n/a |
| `LaunchGateBanner` | Displays which Launch Readiness Gate preconditions are unmet | Section 2.8 | n/a |
| `ErrorBanner` | Renders recoverable errors from any list/form/action | Section 2.9 | Section 3.9 |

## 2) Input Contracts (Props/Inputs)

### 2.1 `NewsletterCampaigns` (list screen)
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `workspaceId` | yes | `string (uuid)` | none | passed to the `api` client |
| `statusFilter` | no | `CampaignRecord['status'] \| null` | `null` | client-side filter |

### 2.2 `CampaignRow`
| Input | Required | Type | Notes |
|---|---|---|---|
| `campaign` | yes | `CampaignRecord` | — |
| `onSelect` | yes | `callback(campaignId)` | navigates to `#/newsletter/campaigns/:id` |

### 2.3 `CampaignEditor`
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `campaignId` | no | `string (ulid) \| null` | `null` | `null` = create mode |
| `initialValues` | no | `Partial<CampaignRecord>` | `{}` | prefilled when editing |
| `lists` | yes | `array<NewsletterListRow>` | none | populates the list-target select |
| `onSaved` | no | `callback(campaign)` | none | stays on the editor (unlike Redirects, editing continues after save) |
| `onCancel` | no | `callback()` | none | discards and navigates back to list |

### 2.4 `CampaignSendPanel`
| Input | Required | Type | Notes |
|---|---|---|---|
| `campaign` | yes | `CampaignRecord` | — |
| `launchGateHint` | yes | `{ met: boolean; unmetPreconditions: string[] }` | client-side best-effort mirror only (`state.spec.md` § 4) — the server re-checks authoritatively |
| `onSchedule` | yes | `callback(scheduledAt?: string)` | enabled only when `campaign.status === 'draft'` |
| `onSend` | yes | `callback()` | enabled only when `campaign.status === 'scheduled'`; disabled (not hidden) with an inline reason when `launchGateHint.met === false` |
| `onSendTest` | yes | `callback(addresses: string[])` | always enabled regardless of the Launch Readiness Gate (REQ-21 exempts test sends from (a)/(b)) |
| `onPause` | yes | `callback()` | enabled only when `campaign.status === 'sending'` |
| `onResume` | yes | `callback()` | enabled only when `campaign.status === 'paused'` |
| `onCancel` | yes | `callback()` | enabled only when `campaign.status` is `draft`/`scheduled` |

### 2.5 `NewsletterLists`
| Input | Required | Type | Notes |
|---|---|---|---|
| `workspaceId` | yes | `string (uuid)` | — |

### 2.6 `SubscriptionTable`
| Input | Required | Type | Notes |
|---|---|---|---|
| `listId` | yes | `string (uuid)` | — |
| `subscriptions` | yes | `array<SubscriptionRow>` | — |
| `onAdd` | yes | `callback(subscriberId)` | admin-driven add only (REQ-10); no free-text email field — Newsletter never mints identities |
| `onRemove` | yes | `callback(subscriptionId)` | |
| `onResendConfirmation` | yes | `callback(subscriptionId)` | enabled only for `status: 'pending'` rows |

### 2.7 `SendLogTable`
| Input | Required | Type | Notes |
|---|---|---|---|
| `campaignId` | yes | `string (ulid)` | — |
| `sendLog` | yes | `array<SendRow>` | `recipientEmail` may read `'[erased]'` post-GDPR-erasure (REQ-27); rendered as-is, not specially masked further |

### 2.8 `LaunchGateBanner`
| Input | Required | Type | Notes |
|---|---|---|---|
| `unmetPreconditions` | yes | `string[]` | empty array renders nothing |

### 2.9 `ErrorBanner`
| Input | Required | Type | Notes |
|---|---|---|---|
| `message` | yes | `string \| null` | `null` renders nothing |

## 3) Event Contracts (Outputs)

### 3.1 `NewsletterCampaigns` (list-level)
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| navigate-to-new | none | "New campaign" click | route to `#/newsletter/campaigns/new` |
| navigate-to-campaign | `campaignId` | row click | route to `#/newsletter/campaigns/:id` |

### 3.2 `CampaignRow` Events
| Event | Payload | Trigger |
|---|---|---|
| `onSelect` | `campaignId` | row click |

### 3.3 `CampaignEditor` Events
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSaved` | saved `CampaignRecord` | successful create/update | inline success state; editor stays open |
| `onCancel` | none | cancel button | discard unsaved changes, no API call |
| validation-error | field-level message from `NEWSLETTER_VALIDATION_ERROR` | failed save | inline error next to the offending field |

### 3.4 `CampaignSendPanel` Events
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSchedule` | `scheduledAt?` | Schedule button | campaign moves to `scheduled` |
| `onSend` | none | Send button, after a confirm dialog ("this will email N subscribers") | campaign moves to `sending`; `NEWSLETTER_LAUNCH_GATE_BLOCKED` surfaces inline via `LaunchGateBanner`, not a silent failure |
| `onSendTest` | `addresses` | Send test button | per-address result list rendered (`SendTestResponse`) |
| `onPause` / `onResume` | none | respective button | campaign status flips |
| `onCancel` | none | Cancel button, after a confirm dialog | campaign moves to `canceled` |

### 3.5 `NewsletterLists` Events
| Event | Payload | Trigger |
|---|---|---|
| create-list | `{ name, slug }` | "New list" form submit |
| archive-list | `listId` | archive button click (disabled/hidden for the default list per REQ-08) |

### 3.6 `SubscriptionTable` Events
| Event | Payload | Trigger |
|---|---|---|
| `onAdd` | `subscriberId` | add form submit |
| `onRemove` | `subscriptionId` | remove button click, after a confirm dialog |
| `onResendConfirmation` | `subscriptionId` | resend button click |

### 3.9 `ErrorBanner` Events
None — display-only.

## 4) Rendering and Interaction Rules
- [ ] `CampaignEditor`'s fields are read-only (form disabled, not hidden) whenever
  `campaign.status` is not `draft`/`scheduled` (REQ-04) — an editor viewing a `sent`
  campaign can still read the body, just not save changes.
- [ ] `CampaignSendPanel`'s "Send" button is present but disabled (never hidden) whenever
  `launchGateHint.met === false`, with `LaunchGateBanner` naming the specific unmet
  preconditions inline — the operator must see *why*, not just that it's blocked.
- [ ] `CampaignSendPanel`'s "Send test" button is never disabled by the Launch Readiness
  Gate (REQ-21's test-send exemption) — only by an empty address list.
- [ ] The default list (`isDefault: true`) never renders an "Archive" action in
  `NewsletterLists` (REQ-08) — this is enforced client-side for UX and re-enforced
  server-side (`NEWSLETTER_DEFAULT_LIST_PROTECTED`) as the actual authority.
- [ ] `SubscriptionTable`'s "Add" form only accepts an existing Members principal reference
  (e.g. an autocomplete against Members, not a free-text email input) — reinforces REQ-10 at
  the UI layer.
- [ ] A campaign row's status badge is visually distinct per status (`draft`/`scheduled`/
  `sending`/`sent`/`paused`/`canceled`/`failed`), matching the `status status-${status}`
  class convention already used in `Members.tsx`.
- [ ] `CampaignCounters` render as a compact summary (`delivered / recipients`) in
  `CampaignRow`, with the full breakdown (bounced/complained/unsubscribed) shown only in
  `SendLogTable`'s parent view.
- [ ] Loading skeleton renders while the initial campaign-list fetch is in-flight.
- [ ] `ErrorBanner` displays the latest recoverable error from any list/form/action.

## 5) Accessibility Requirements
| Area | Requirement |
|---|---|
| Semantic roles | Table markup for campaign/list/subscription/send-log lists; form controls use native `input`/`select`/`textarea`/`button`; destructive/irreversible actions (`onSend`, `onRemove`, archive) use a native `confirm()` dialog (matches `Menus.tsx` convention) or an accessible `dialog` role if replaced. |
| Labels | Every form field in `CampaignEditor` (`subject`, `preheader`, `fromName`, `fromEmail`, `replyTo`, `listId`, body editor) has an associated accessible label. |
| Keyboard | Full keyboard operation for all lists (row actions reachable via Tab) and both editor forms. |
| Status updates | Save/schedule/send/pause/resume success and failure are announced via a visible, non-modal status message (matches the `notice`/`notice error` pattern). |
| Error clarity | `LaunchGateBanner`'s unmet-precondition list and field-level validation errors are associated with their specific control, not only the global `ErrorBanner`. |

## 6) Composition Rules
- `NewsletterCampaigns` is the only public entry component for the campaign list route.
- `CampaignRow` is rendered only within `NewsletterCampaigns`'s table body.
- `CampaignEditor` is the only public entry component for
  `#/newsletter/campaigns/new`/`#/newsletter/campaigns/:id`; `CampaignSendPanel` and
  `SendLogTable` render only inside `CampaignEditor`'s detail view (never standalone
  routes).
- `NewsletterLists` is the only public entry component for `#/newsletter/lists`;
  `SubscriptionTable` renders only inside a selected list's detail view within it.
- `LaunchGateBanner` is rendered only within `CampaignSendPanel`.

## 7) Acceptance Checklist
- [x] Each public component has explicit input and event contracts.
- [x] Rendering conditions are deterministic.
- [x] Accessibility requirements are testable.
- [x] Entity names and statuses align with `state.spec.md` and `api.spec.md`.
