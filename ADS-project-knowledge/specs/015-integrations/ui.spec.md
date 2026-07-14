# UI Contract Spec: integrations

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-015`
- Feature: `FEAT-015-integrations`
- Version: `1.0.0`
- Content Hash: anchored in `feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

**As-built note:** documents the two real components that exist — `apps/admin/src/sections/Integrations.tsx` and `IntegrationDeliveries.tsx`. Both are plain React function components using `useState`/`useEffect` and a thin `api` fetch wrapper (`apps/admin/src/lib/api.ts`) — there is no orchestrator/state-management abstraction between them and the API (see `spec-manifest.md` for why `orchestrator.spec.md` is OMITTED). Hash-based routing (`#/integrations`, `#/integrations/:id`) is the existing admin-shell convention, not introduced by this feature.

## Purpose
Defines UI component contracts, interaction events, rendering conditions, and accessibility posture for the Integrations admin screens, independent of frontend framework.

## 1) Component Registry

| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `Integrations` | Top-level webhook subscriptions screen: list + create form + row actions | Section 2.1 | Section 3.1 |
| `IntegrationDeliveries` | Per-subscription delivery log screen | Section 2.2 | Section 3.2 |

There is no separate `ItemCard`/`ConfirmActionDialog`/`EmptyState` component decomposition — both screens are single files that render their own table/form/empty-state markup inline. This is documented as-is rather than retrofitted into the template's finer component breakdown.

## 2) Input Contracts (Props/Inputs)

### 2.1 `Integrations`
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| (none — no props) | — | — | — | Reads `WORKSPACE_ID` from the shared `api` module; not parameterized by a prop |

Internal state (not props, documented because it drives every rendering rule in Section 4):
| State | Type | Initial | Notes |
|---|---|---|---|
| `subscriptions` | `AdminWebhookSubscription[] \| null` | `null` | `null` = still loading |
| `error` | `string \| null` | `null` | Top-level fetch/action error |
| `formOpen` | `boolean` | `false` | Create-form visibility toggle |
| `label`, `targetUrl`, `topics` | `string` | `""` | Controlled create-form fields; `topics` is the raw comma-separated text |
| `saving` | `boolean` | `false` | Disables the Create submit button while a create is in flight |
| `formError` | `string \| null` | `null` | Create-form-scoped error, distinct from the top-level `error` |

### 2.2 `IntegrationDeliveries`
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `subscriptionId` | yes | `string` | none | The subscription whose delivery log is shown; re-fetches on change (`useEffect` dependency) |

Internal state:
| State | Type | Initial | Notes |
|---|---|---|---|
| `deliveries` | `AdminWebhookDelivery[] \| null` | `null` (reset to `null` on every `subscriptionId` change) | `null` = still loading |
| `error` | `string \| null` | `null` (reset on every `subscriptionId` change) | |

## 3) Event Contracts (Outputs / User Actions)

### 3.1 `Integrations`
| Event | Trigger | Behavior |
|---|---|---|
| Toggle create form | Click "Add webhook" / "Cancel" | Flips `formOpen`; does not clear form field values on cancel |
| Submit create | Submit the create form | Calls `api.createIntegrationSubscription({ label, targetUrl, topics: parseTopics(topics) })`; on success, clears `label`/`targetUrl`/`topics`, closes the form, and reloads the list; on failure, sets `formError` and leaves the form open and populated |
| Pause/Resume | Click the row's Pause/Resume button | Calls `api.pauseIntegrationSubscription(id, nextPausedValue)` where `nextPausedValue = subscription.status !== 'paused'`; reloads the list on success; sets the top-level `error` on failure |
| Delete | Click the row's Delete button | Shows a native `window.confirm` dialog ("Delete webhook "<label>"? This cannot be undone."); on confirm, calls `api.deleteIntegrationSubscription(id)` and reloads the list; on cancel, does nothing; sets the top-level `error` on failure |
| Open delivery log | Click a row's label | Navigates to `#/integrations/:id` (an `<a href>`, not a JS handler) |

### 3.2 `IntegrationDeliveries`
| Event | Trigger | Behavior |
|---|---|---|
| Load deliveries | Mount, or `subscriptionId` prop change | Resets `deliveries`/`error` to loading state, then calls `api.listIntegrationDeliveries(subscriptionId)` |
| Back to Integrations | Click the "← Integrations" link | Navigates to `#/integrations` (an `<a href>`) |

**As-built note:** `parseTopics(raw)` splits on `,`, trims each segment, and filters out blanks — it is the exact client-side mirror of `subscriptions.ts`'s server-side `normalizeTopics`, except the client does not also de-duplicate (only the server does).

## 4) Rendering and Interaction Rules

- [x] `Integrations`: while `subscriptions === null` and no `error`, renders `"Loading integrations…"` and nothing else.
- [x] `Integrations`: if `error` is set (top-level), renders only the error notice — the table and form are not rendered at all, even if `subscriptions` was previously loaded.
- [x] `Integrations`: the create form only renders when `formOpen === true`.
- [x] `Integrations`: `formError` renders inline inside the (already-open) create form; it does not replace the whole screen.
- [x] `Integrations`: Pause/Resume and Delete buttons are `disabled` whenever `subscription.status === 'disabled'` — this is the only per-row disable condition; `paused` and `active` rows both keep both buttons enabled.
- [x] `Integrations`: the Pause/Resume button's label reads `"Resume"` when `status === 'paused'`, else `"Resume"`'s sibling label `"Pause"` for every other non-disabled status.
- [x] `Integrations`: the "Last delivery" column renders the delivery's status badge when `lastDelivery` is non-null, else a muted `"never"` label.
- [x] `IntegrationDeliveries`: while `deliveries === null` and no `error`, renders `"Loading delivery log…"`.
- [x] `IntegrationDeliveries`: if `error` is set, renders only the error notice.
- [x] `IntegrationDeliveries`: if `deliveries` is an empty array (not `null`), renders `"No deliveries yet for this subscription."` instead of an empty table.
- [x] `IntegrationDeliveries`: the "Timestamp" column shows `deliveredAt` if present, else `createdAt`, truncated to `YYYY-MM-DD HH:MM` (first 16 characters with `T` replaced by a space) — not a full ISO string, not a relative/humanized time.
- [x] `IntegrationDeliveries`: `lastError`, when present, renders as a second line under the response-status cell, not as a separate column.

## 5) Accessibility Requirements

| Area | As-built status |
|---|---|
| Semantic roles | Uses native `<table>`/`<form>`/`<button>`/`<a>` elements throughout — no custom ARIA roles are added or needed for these native elements. |
| Labels | Form fields use `<label>` wrapping their `<input>` (implicit association) for Label/Target URL/Topics. The Actions column header uses `aria-label="Actions"` on an empty `<th>` (no visible text) — this is the one explicit ARIA attribute in either component. |
| Keyboard | Native elements are keyboard-operable by default (buttons, links, form submit via Enter); no custom keyboard handling is implemented or required beyond what native HTML provides. |
| Status updates | No ARIA live region exists for async state changes (loading/error text simply re-renders in place) — this is a real gap relative to the template's aspirational requirement, not a deliberate design choice; flagged here rather than silently claimed as met. |
| Error clarity | Errors render as visible text (`.notice.error`/`.save-error` classes) adjacent to the relevant context (form vs. whole-screen) but are not programmatically associated with specific fields via `aria-describedby`. |

## 6) Composition Rules
- `Integrations` and `IntegrationDeliveries` are both directly registered as top-level admin-shell routes (hash-routed) — neither is nested inside the other; navigation between them is via plain anchor links, not shared state or props.
- No shared parent component wraps both; each independently owns its own loading/error state.

## 7) Acceptance Checklist
- [x] Each public component has explicit input and event contracts (as they actually exist — no props were invented to match the template's fuller shape).
- [x] Rendering conditions are deterministic and traced to real conditionals in the source.
- [x] Accessibility requirements are documented as-is, including the one real gap (no live region) rather than marked compliant by default.
- [x] Entity names and statuses align with `state.spec.md`/`api.spec.md` (`AdminWebhookSubscription`/`AdminWebhookDelivery` field names match `AdminWebhookSubscriptionResponse`/`AdminWebhookDeliveryResponse` exactly).
