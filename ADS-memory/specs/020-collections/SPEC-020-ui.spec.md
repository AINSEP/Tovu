# UI Contract Spec: collections

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-020`
- Feature: `FEAT-020-collections`
- Version: `1.4.0`
- Content Hash: `sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6`
- Last Edited: `2026-07-15T03:30:00Z`

## Purpose

Defines the Collections admin screen (`apps/admin/src/sections/Collections.tsx`, per ADR-043 §4/§5)
component contracts, events, rendering conditions, and accessibility requirements, independent of
frontend framework.

## 1) Component Registry

| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `CollectionsContainer` | Top-level screen wiring | Section 2.1 | Section 3.1 |
| `ContentTypeList` | Presents registered content types | Section 2.2 | Section 3.2 |
| `ContentTypeBuilderForm` | Captures content-type key/label/field definitions | Section 2.3 | Section 3.3 |
| `EntryList` | Presents entries for a selected content type | Section 2.4 | Section 3.4 |
| `EntryEditorForm` | Dynamic form for entry title/body/fields, driven by the type's schema | Section 2.5 | Section 3.5 |
| `CleanupConfirmationDialog` | Drives the plan/confirm/execute cleanup ceremony | Section 2.6 | Section 3.6 |
| `EmptyState` | Renders no-data state | Section 2.7 | n/a |
| `ErrorBanner` | Renders recoverable errors | Section 2.8 | Section 3.8 |

## 2) Input Contracts (Props/Inputs)

### 2.1 `CollectionsContainer`
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `workspaceId` | yes | `string` | none | passed to orchestrator |
| `onContentTypeCreated` | no | `callback(contentType)` | none | optional external hook |
| `onCleanupExecuted` | no | `callback(contentTypeKey)` | none | optional external hook |

### 2.2 `ContentTypeList`
| Input | Required | Type | Notes |
|---|---|---|---|
| `contentTypes` | yes | `array<ContentType>` | empty list allowed |
| `isLoading` | yes | `boolean` | shows loading skeleton |
| `selectedKey` | no | `string \| null` | selected row styling |
| `statusFilter` | no | `ContentTypeStatus \| 'all'` | default `'all'` |

### 2.3 `ContentTypeBuilderForm`
| Input | Required | Type | Notes |
|---|---|---|---|
| `mode` | yes | `enum[create, edit]` | `edit` pre-fills from an existing `ContentType` |
| `initialValue` | conditional | `ContentType` | required when `mode='edit'` |
| `queryableFieldCap` | yes | `integer` | `20` (REQ-05); form disables the "queryable" checkbox once the cap is reached |
| `isSaving` | yes | `boolean` | disables submit while a save is in-flight |
| `fieldErrors` | no | `array<{field, reason}>` | rendered inline per field |

### 2.4 `EntryList`
| Input | Required | Type | Notes |
|---|---|---|---|
| `entries` | yes | `array<Entry>` | empty list allowed |
| `contentType` | yes | `ContentType` | drives which columns render for `fieldsJson` |
| `isLoading` | yes | `boolean` | |
| `hasMoreEntries` | yes | `boolean` | controls load-more visibility |

### 2.5 `EntryEditorForm`
| Input | Required | Type | Notes |
|---|---|---|---|
| `contentType` | yes | `ContentType` | the *current* schema — orphaned fields from a prior schema version are never rendered as editable inputs (REQ-15) |
| `initialValue` | conditional | `Entry` | required when editing an existing entry |
| `isSaving` | yes | `boolean` | |
| `fieldErrors` | no | `array<{field, reason}>` | same shape `ENTRY_VALIDATE_FIELDS`/`ENTRY_CREATE` return |
| `onValidateRequested` | no | `callback(fieldsJson)` | triggers a dry-run `ENTRY_VALIDATE_FIELDS` call without saving |

### 2.6 `CleanupConfirmationDialog`
| Input | Required | Type | Notes |
|---|---|---|---|
| `contentType` | yes | `ContentType` | must have `status='tombstone'` for the dialog to be openable at all (see §4) |
| `eligibility` | yes | `{eligible: boolean, reason: string \| null}` | from `selectCleanupEligibility` (`state.spec.md` §4) |
| `plan` | no | `GatewayPlan \| null` | populated after `collections/cleanup/plan` succeeds |
| `isConfirming` | yes | `boolean` | true between `confirm()` request and response |
| `isExecuting` | yes | `boolean` | true between `execute()` request and response |

### 2.7-2.8 `EmptyState`, `ErrorBanner`
Equivalent to the generic shapes in this project's UI-contract convention: `EmptyState` takes a
`message`/`actionLabel`/`onAction`; `ErrorBanner` takes the latest error object and a
`onRetry` callback.

## 3) Event Contracts (Outputs)

### 3.1 `CollectionsContainer`
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onContentTypeCreated` | `contentType` | successful `CONTENT_TYPE_CREATE` | parent notified once |
| `onCleanupExecuted` | `contentTypeKey` | successful `COLLECTIONS_CLEANUP_EXECUTE` | parent notified once; `ContentTypeList` refetches |

### 3.2 `ContentTypeList`
| Event | Payload | Trigger |
|---|---|---|
| `onContentTypeSelect` | `key` | row click / Enter key |
| `onDeprecateRequest` | `key` | deprecate control activation |
| `onReactivateRequest` | `key` | reactivate control activation |
| `onTombstoneRequest` | `key` | tombstone control activation |
| `onCleanupRequest` | `key` | cleanup control activation — only rendered when `status='tombstone'` (§4) |

### 3.3 `ContentTypeBuilderForm`
| Event | Payload | Trigger |
|---|---|---|
| `onSubmit` | `{key, label, fields}` or `{label?, fields?, expectedVersion}` | form submission |
| `onFieldAdd` / `onFieldRemove` | `fieldIndex` | field-row add/remove control |

### 3.4 `EntryList`
| Event | Payload | Trigger |
|---|---|---|
| `onEntrySelect` | `id` | row click / Enter key |
| `onLoadMore` | none | load-more control activation |

### 3.5 `EntryEditorForm`
| Event | Payload | Trigger |
|---|---|---|
| `onSubmit` | `{type, slug, title, bodyJson?, fieldsJson?}` or update variant | form submission |
| `onPublishRequest` / `onUnpublishRequest` | `id` | publish/unpublish control |
| `onValidateRequested` | `fieldsJson` | "Check fields" control, calls `ENTRY_VALIDATE_FIELDS` |

### 3.6 `CleanupConfirmationDialog`
| Event | Payload | Trigger |
|---|---|---|
| `onPlanRequested` | `{contentTypeKey, exportReference}` | dialog opened |
| `onConfirmRequested` | `{planId, planHash}` | operator clicks "Confirm" |
| `onExecuteRequested` | `{confirmationToken}` | operator clicks "Permanently remove" |
| `onCancel` | none | operator dismisses the dialog at any step before `execute()` succeeds |

### 3.8 `ErrorBanner`
| Event | Payload | Trigger |
|---|---|---|
| `onRetry` | none | retry control activation |

## 4) Rendering and Interaction Rules
- [x] `EmptyState` renders in `ContentTypeList` when `contentTypes.length == 0` and not loading.
- [x] `EmptyState` renders in `EntryList` when `entries.length == 0` and not loading.
- [x] Loading skeletons render while the initial `CONTENT_TYPE_LIST`/`ENTRY_LIST` fetch is in-flight.
- [x] The "queryable" checkbox in `ContentTypeBuilderForm` is disabled, with an inline explanation,
      once the content type already has 20 queryable fields (REQ-05) — never silently ignored on
      submit.
- [x] `ContentTypeList`'s `onCleanupRequest` control (and therefore `CleanupConfirmationDialog`) is
      rendered only when a row's `status == 'tombstone'` — it never appears for `active` or
      `deprecated` rows, matching REQ-20's `plan()` eligibility gate.
- [x] `CleanupConfirmationDialog`'s "Confirm" control is disabled until a `plan` has been
      successfully returned, and is re-disabled (forcing a fresh `onPlanRequested`) if the dialog was
      left open long enough that the plan could plausibly be stale.
- [x] `CleanupConfirmationDialog`'s "Permanently remove" control is disabled until `confirm()` has
      returned a `confirmationToken`.
- [x] `EntryEditorForm` never renders an input for a `fieldsJson` key that is not present in the
      content type's *current* schema (REQ-15) — an orphaned legacy key is retained in the
      underlying payload on save but is never surfaced as an editable field.
- [x] `ErrorBanner` displays the latest recoverable error and a retry affordance.
- [x] `EntryEditorForm`'s save/publish/unpublish controls are disabled, with an inline explanation,
      when the entry's owning content type's `status` is `tombstone` — matching the backend's
      `CONTENT_TYPE_NOT_ACTIVE` rejection for `UPDATE_ENTRY`/`PUBLISH_ENTRY`/`UNPUBLISH_ENTRY`
      against a tombstoned type (REQ-28); these same controls remain enabled when the owning
      type's `status` is `deprecated`, since REQ-28 only blocks them for `tombstone`.

## 5) Accessibility Requirements
| Area | Requirement |
|---|---|
| Semantic roles | Interactive elements use correct roles (`button`, `dialog`, `list`, `form`). |
| Labels | Every field-definition row in `ContentTypeBuilderForm` and every dynamic field in `EntryEditorForm` has an accessible name tied to its declared field `name`. |
| Keyboard | Full keyboard operation with visible focus states, including the three-step `CleanupConfirmationDialog`. |
| Status updates | Async state changes (save in-flight, plan/confirm/execute transitions) are announced via an ARIA live region. |
| Error clarity | Field-level `VALIDATION_ERROR` entries are announced and associated with their specific input via `aria-describedby`. |
| Destructive-action clarity | `CleanupConfirmationDialog` states in plain language, before the "Permanently remove" control is enabled, exactly how many entries and revisions will be irreversibly deleted (from `plan.details`). |

## 6) Composition Rules
- `CollectionsContainer` is the only public entry component.
- `ContentTypeBuilderForm` and `EntryEditorForm` are rendered only within `CollectionsContainer`'s
  routed create/edit views, never inline inside a list row.
- `CleanupConfirmationDialog` may be rendered only when a `ContentType` with `status='tombstone'`
  is selected — it is never reachable from an `active` or `deprecated` row (§4).
- Internal helper components (field-row editors, dynamic-field renderers) are implementation
  detail and excluded from this contract.

## 7) Acceptance Checklist
- [x] Each public component has explicit input and event contracts.
- [x] Rendering conditions are deterministic.
- [x] Accessibility requirements are testable.
- [x] Entity names and statuses align with `orchestrator.spec.md` and `state.spec.md`.
