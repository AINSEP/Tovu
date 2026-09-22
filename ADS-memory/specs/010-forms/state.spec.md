# State Contract Spec: forms

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-010`
- Feature: `FEAT-010-forms`
- Version: `1.0.0`
- Content Hash: `sha256:PENDING`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Defines persistent and derived state, legal transitions, and invariants for the Forms feature,
in a language-neutral format.

## 0) Greenfield Storage Decision (read first)

Forms has no prior stub or existing table to attach to (unlike SEO/Redirects, which reconciled
against pre-existing `src/seo`/`src/redirects` interface stubs). There is also no generic ADR-022
`entries` model in this repo — `todos.md`'s AW-7 text says "submissions as core entries" loosely,
describing the desired end-state shape, not a literal attachment point. This spec creates two new,
bespoke, core-owned tables — `form_definitions` and `form_submissions` — following the exact
precedent ADR-027 (`asset_blobs`)/ADR-028 (settings)/ADR-036 (`webhook_subscriptions`) already set
for "core-owned, ADR-022-discipline tables that are not the generic entries model." When (if) the
generic `entries` model lands, `form_submissions.data_json` maps onto
`entries.fields.ext.forms.*` **by a rename, not a reshape** — same posture SEO recorded for
`posts.seo_ext_json`.

## 1) State Shape

### 1.1 Persistent: `form_definitions` (new table)
| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `id` | `TEXT (ULID)` | no | generated | Primary key |
| `workspace_id` | `TEXT` | no | — | Workspace scope (ADR-007) |
| `name` | `TEXT` | no | — | Display name |
| `slug` | `TEXT` | no | — | Public-URL identifier; unique per `workspace_id` (INV-03) |
| `fields_json` | `TEXT (serialized FieldDescriptor[])` | no | — | The declarative field vocabulary (REQ-01/02) |
| `notify_json` | `TEXT (serialized NotifyConfig)` | no | `{"enabled": false, "recipients": []}` | Notification config |
| `status` | `TEXT enum[active, disabled]` | no | `active` | Lifecycle — only `active`/`disabled`; deletion is tracked separately via the Trash, not this column (INV-08) |
| `created_at` | `TEXT (ISO-8601)` | no | now | |
| `updated_at` | `TEXT (ISO-8601)` | no | now | |

### 1.2 Persistent: `form_submissions` (new table)
| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `id` | `TEXT (ULID)` | no | generated | Primary key |
| `workspace_id` | `TEXT` | no | — | Workspace scope (ADR-007) |
| `form_definition_id` | `TEXT` | no | — | FK to `form_definitions.id` |
| `data_json` | `TEXT (serialized object)` | no | — | field id → submitted value (INV-01) |
| `source_ip` | `TEXT` | no | — | Submitter's IP at accept time — see `feature.spec.md` OQ-03 for the raw/hash/omit open question |
| `submitted_at` | `TEXT (ISO-8601)` | no | now | Immutable once written (REQ-10) |

No generic `entries` table is created, extended, or queried by this feature.

### 1.3 Derived (computed at read/dispatch time, never stored)
| Field | Type | Description |
|---|---|---|
| `submissionCount` (per definition, admin list view) | `integer` | `COUNT(*)` over `form_submissions` for that `form_definition_id` — display-only, not persisted on `form_definitions` |
| `form.submission.received` envelope | `WebhookEventEnvelope`-compatible `JsonObject` | `{ workspaceId, formDefinitionId, submissionId }` — built at emit time from the just-written submission row, never persisted separately from the submission itself |

## 2) Entity Contracts
```yaml
FieldDescriptor:
  id: string             # ^[a-z][a-z0-9_]*$, unique within one definition's fields[]
  label: string
  type: enum[text, email, textarea, checkbox]
  required: boolean
  maxLength: integer?    # forbidden for type=checkbox (behavior.spec.md §4)

NotifyConfig:
  enabled: boolean
  recipients: array<string>   # email addresses, max 10

FormDefinitionRecord:
  id: string
  workspaceId: string (uuid)
  name: string
  slug: string
  fields: array<FieldDescriptor>
  notify: NotifyConfig
  status: enum[active, disabled]
  createdAt: string (date-time)
  updatedAt: string (date-time)

FormSubmissionRecord:
  id: string
  workspaceId: string (uuid)
  formDefinitionId: string
  data: object            # field id -> string | boolean, keys subset-of fields[].id
  sourceIp: string
  submittedAt: string (date-time)
```

## 3) Action Catalog
| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `CREATE_FORM_DEFINITION` | `{workspaceId, name, slug, fields, notify?}` | caller holds `admin.forms.manage`; `slug` unique in workspace; every `fields[].type` in vocabulary | Inserts a new `form_definitions` row, `status: "active"` | Bad field type → `FORMS_FIELD_VALIDATION_ERROR`, nothing persisted; duplicate slug → `FORMS_SLUG_CONFLICT` |
| `UPDATE_FORM_DEFINITION` | `{workspaceId, formId, patch}` | caller holds `admin.forms.manage`; definition exists; `patch.fields[].id` values are a superset-preserving edit (behavior.spec.md §1.2); `slug` not present in patch (immutable) | Merges patch, bumps `updated_at` | Definition not found → `FORMS_DEFINITION_NOT_FOUND`; bad field → `FORMS_FIELD_VALIDATION_ERROR`, no partial write |
| `SET_FORM_DEFINITION_STATUS` | `{workspaceId, formId, status}` | caller holds `admin.forms.manage`; definition exists | Sets `status` (`active`⇄`disabled`); never deletes the row — deletion happens only via the Trash, a separate action (INV-08) | Definition not found → `FORMS_DEFINITION_NOT_FOUND` |
| `SUBMIT_FORM` | `{slug, body}` | none (public) | If `_hp` non-empty: no state change (REQ-08). Else if valid and rate-limit not exceeded: inserts a `form_submissions` row, emits `form.submission.received` on the outbox | Slug not found or definition `disabled` → `FORMS_DEFINITION_NOT_FOUND`; validation failure → `FORMS_SUBMISSION_VALIDATION_ERROR`, no row inserted; rate limit exceeded → `FORMS_RATE_LIMIT_EXCEEDED`, no row inserted |
| `NOTIFY_ON_SUBMISSION` (outbox subscriber to `form.submission.received`) | envelope `{workspaceId, formDefinitionId, submissionId}` | form definition's `notify.enabled === true` | Calls `MailerPort.send()` for each configured recipient; no local state change (a mail-lib-owned dedup/suppression ledger governs retry, per ADR-037) | `MailerPort.send()` returns `{ok:false}` → logged, not retried inline (rides ADR-009 outbox redelivery per ADR-037); submission row is never affected either way (INV-05) |
| `LIST_FORM_SUBMISSIONS` | `{workspaceId, formId, limit, cursor?}` | caller holds `admin.forms.submissions.read`; definition exists | Pure read, newest-first | Definition not found → `FORMS_DEFINITION_NOT_FOUND` |
| `GET_FORM_SUBMISSION` | `{workspaceId, formId, submissionId}` | caller holds `admin.forms.submissions.read` | Pure read | Not found → `FORMS_SUBMISSION_NOT_FOUND` |
| `DELETE_FORM_SUBMISSION` | `{workspaceId, formId, submissionId}` | caller holds `admin.forms.submissions.delete` | Moves the `form_submissions` row to the Trash (REQ-14); permanently deleted only by a subsequent Trash purge | Not found → `FORMS_SUBMISSION_NOT_FOUND` |

## 4) Selector Contracts
| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `listFormDefinitions` | `{workspaceId}` | `FormDefinitionRecord[]` | `[]` when the workspace has no forms — never `null` |
| `getFormDefinitionBySlug` | `{workspaceId, slug}` | `FormDefinitionRecord \| null` | `null` when not found — the caller (submission handler) maps this to `FORMS_DEFINITION_NOT_FOUND` (EC-03) |
| `listFormSubmissions` | `{workspaceId, formId, limit, cursor?}` | `{items: FormSubmissionRecord[], nextCursor: string \| null}` | `items: []`, `nextCursor: null` when no submissions exist (EC-08) |

## 5) State Invariants
- [ ] `form_definitions.slug` is unique per `workspace_id`, across every `status` (INV-03).
- [ ] `form_submissions.data_json` keys are always a subset of the referenced definition's
  `fields[].id` values as they existed at submission time (INV-01).
- [ ] `form_definitions.fields_json[].type` is always one of `text`/`email`/`textarea`/`checkbox`
  (INV-02).
- [ ] `form_definitions` rows are removed permanently only via a Trash purge; `status` transitions
  (`active`⇄`disabled`) are a separate, non-destructive action (INV-08).
- [ ] `form_submissions` rows are immutable once inserted, except for deletion — which moves a row
  to the Trash, with permanent removal only via a subsequent Trash purge (REQ-14) — there is no
  update action on a submission.
- [ ] A honeypot-tripped request (`_hp` non-empty) never reaches `CREATE`/`INSERT` for
  `form_submissions` and never triggers `form.submission.received` (INV-04).

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free.
- [x] Entity fields and enums align with `api.spec.md` and `ui.spec.md`.
