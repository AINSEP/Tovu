# API Contract Spec: forms

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-010`
- Feature: `FEAT-010-forms`
- Version: `1.0.0`
- Content Hash: `sha256:PENDING`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
This file is the source of truth for API behavior for the Forms admin section and its one
public submission route, independent of implementation language.

Routing note: this repo mounts admin routes at
`/api/admin/v1/workspaces/:workspaceId/...` and checks
`req.params.workspaceId === deps.workspaceId` (single-workspace-per-process dev deployment —
see `presentation/get.ts`, `settings/get-effective.ts`). The public submission route follows the
same public-route convention `sitemap.xml`/`robots.txt` already established: the workspace is
resolved implicitly from `deps.workspaceId`, with no path param, since this dev server serves one
workspace per process.

## 1) Endpoint Registry
| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `FORMS_LIST_DEFINITIONS` | `GET` | `/api/admin/v1/workspaces/:workspaceId/forms` | List all form definitions in the workspace | `FORMS_ADMIN` | `ADMIN_STANDARD` |
| `FORMS_CREATE_DEFINITION` | `POST` | `/api/admin/v1/workspaces/:workspaceId/forms` | Create a new form definition | `FORMS_ADMIN` | `ADMIN_STANDARD` |
| `FORMS_GET_DEFINITION` | `GET` | `/api/admin/v1/workspaces/:workspaceId/forms/:formId` | Read one form definition | `FORMS_ADMIN` | `ADMIN_STANDARD` |
| `FORMS_UPDATE_DEFINITION` | `PUT` | `/api/admin/v1/workspaces/:workspaceId/forms/:formId` | Update (partial) a form definition, including `active`/`disabled` status | `FORMS_ADMIN` | `ADMIN_STANDARD` |
| `FORMS_LIST_SUBMISSIONS` | `GET` | `/api/admin/v1/workspaces/:workspaceId/forms/:formId/submissions` | List submissions for a form definition | `FORMS_SUBMISSIONS_READ` | `ADMIN_STANDARD` |
| `FORMS_GET_SUBMISSION` | `GET` | `/api/admin/v1/workspaces/:workspaceId/forms/:formId/submissions/:submissionId` | Read one submission's full field values | `FORMS_SUBMISSIONS_READ` | `ADMIN_STANDARD` |
| `FORMS_DELETE_SUBMISSION` | `DELETE` | `/api/admin/v1/workspaces/:workspaceId/forms/:formId/submissions/:submissionId` | Permanently delete one submission | `FORMS_SUBMISSIONS_DELETE` | `ADMIN_STANDARD` |
| `FORMS_POST_SUBMIT` | `POST` | `/forms/:slug/submit` | Public submission endpoint for a form by slug | `FORMS_PUBLIC` | `FORMS_SUBMIT` |

## 2) Authentication and Authorization Profiles
| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `FORMS_ADMIN` | `true` | Dev-auth session principal (`getAuthedPrincipal`, matches every existing admin route) | `admin.forms.manage` | `editor`, `admin`, `owner` (`*`) | Gates all form-definition CRUD reads and writes — one permission per domain, matching the `admin.seo.manage`/`admin.redirects.manage` precedent. |
| `FORMS_SUBMISSIONS_READ` | `true` | Dev-auth session principal | `admin.forms.submissions.read` | `editor`, `admin`, `owner` (`*`) | Separate from `FORMS_ADMIN` because submission data is visitor-supplied PII — an admin who manages form config need not automatically see submission content, and vice versa (mirrors the `webhooks.read` vs `webhooks.redeliver` granularity precedent in ADR-036 §6). |
| `FORMS_SUBMISSIONS_DELETE` | `true` | Dev-auth session principal | `admin.forms.submissions.delete` | `admin`, `owner` (`*`) | Separate from read so a data-subject-deletion action is independently grantable/auditable. |
| `FORMS_PUBLIC` | `false` | none | none | none (public) | The submission endpoint is intentionally unauthenticated (REQ-05) — a public contact form must be reachable by any site visitor, matching the `sitemap.xml`/`robots.txt` public-route precedent. |

## 3) Rate Limit Profiles
| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By (`userId|apiKey|ip|tenantId`) | Notes |
|---|---:|---:|---:|---|---|
| `ADMIN_STANDARD` | `60` | `30` | `5` | `userId` | Not enforced by any middleware in the current v1 dev server (no rate-limiting infra exists yet anywhere in this repo, same not-yet-enforced posture as SEO/Redirects); profile is reserved for the future rate-limiting feature, consistent with the Article VI standing exception. |
| `FORMS_SUBMIT` | `60` | `5` | `0` | `ip` (composite-keyed with the target `formId` — see `behavior.spec.md` §4) | **This one IS enforced by this feature** (REQ-09) — it is the one Forms-specific abuse control this spec builds itself, independent of the not-yet-built general rate-limiting infra. Keyed on `(ip, formId)`, not `ip` alone, so a busy visitor submitting to two different forms is not cross-throttled. |

## 4) Request Contracts

### Endpoint: `FORMS_LIST_DEFINITIONS` (`GET /api/admin/v1/workspaces/:workspaceId/forms`)
- Path Params:
```yaml
workspaceId:
  type: string
  format: uuid
  required: true
```

### Endpoint: `FORMS_CREATE_DEFINITION` (`POST /api/admin/v1/workspaces/:workspaceId/forms`)
- Path Params: same as `FORMS_LIST_DEFINITIONS`.
- Body:
```yaml
name:
  type: string
  minLength: 1
  maxLength: 200
  required: true
slug:
  type: string
  pattern: "^[a-z0-9][a-z0-9-]{0,63}$"
  required: true
fields:
  type: array
  minItems: 1
  maxItems: 20
  required: true
  items:
    id:
      type: string
      pattern: "^[a-z][a-z0-9_]*$"
      maxLength: 64
      required: true
    label:
      type: string
      minLength: 1
      maxLength: 200
      required: true
    type:
      type: string
      enum: [text, email, textarea, checkbox]
      required: true
    required:
      type: boolean
      default: false
    maxLength:
      type: integer
      minimum: 1
      maximum: 5000
      required: false
      description: "Ignored/forbidden for type=checkbox — see behavior.spec.md §4"
notify:
  type: object
  required: false
  properties:
    enabled:
      type: boolean
      default: false
    recipients:
      type: array
      items: { type: string, format: email }
      minItems: 0
      maxItems: 10
```

### Endpoint: `FORMS_GET_DEFINITION` (`GET /api/admin/v1/workspaces/:workspaceId/forms/:formId`)
- Path Params:
```yaml
workspaceId:
  type: string
  format: uuid
  required: true
formId:
  type: string
  required: true
```

### Endpoint: `FORMS_UPDATE_DEFINITION` (`PUT /api/admin/v1/workspaces/:workspaceId/forms/:formId`)
- Path Params: same as `FORMS_GET_DEFINITION`.
- Body (all fields optional; `slug` and `fields[].id` values are immutable once created — see
  `behavior.spec.md` §1; unknown keys are rejected):
```yaml
name:
  type: string
  minLength: 1
  maxLength: 200
  required: false
fields:
  type: array
  minItems: 1
  maxItems: 20
  required: false
  description: "Replaces the full field list; existing field ids must be a superset-preserving edit — see behavior.spec.md §1.2 for the exact rule"
notify:
  type: object
  required: false
  properties:
    enabled: { type: boolean }
    recipients: { type: array, items: { type: string, format: email }, maxItems: 10 }
status:
  type: string
  enum: [active, disabled]
  required: false
```

### Endpoint: `FORMS_LIST_SUBMISSIONS` (`GET /api/admin/v1/workspaces/:workspaceId/forms/:formId/submissions`)
- Path Params: same as `FORMS_GET_DEFINITION`.
- Query Params:
```yaml
limit:
  type: integer
  minimum: 1
  maximum: 100
  default: 50
cursor:
  type: string
  required: false
```

### Endpoint: `FORMS_GET_SUBMISSION` (`GET /api/admin/v1/workspaces/:workspaceId/forms/:formId/submissions/:submissionId`)
- Path Params:
```yaml
workspaceId:
  type: string
  format: uuid
  required: true
formId:
  type: string
  required: true
submissionId:
  type: string
  required: true
```

### Endpoint: `FORMS_DELETE_SUBMISSION` (`DELETE /api/admin/v1/workspaces/:workspaceId/forms/:formId/submissions/:submissionId`)
- Path Params: same as `FORMS_GET_SUBMISSION`.
- Body: `{}` (no payload).

### Endpoint: `FORMS_POST_SUBMIT` (`POST /forms/:slug/submit`)
- Path Params:
```yaml
slug:
  type: string
  required: true
```
- Body: dynamic — one key per the addressed form definition's declared `fields[].id`, plus the
  reserved honeypot key `_hp` (always accepted, never declared in `fields`):
```yaml
_hp:
  type: string
  required: false
  maxLength: 200
  description: "Reserved honeypot field. Must be sent empty/absent by real visitors (hidden via CSS on the rendering theme). Non-empty triggers REQ-08 silent-discard."
# ...plus one entry per the target form definition's fields[].id, typed per that field's
# declared `type` (string for text/email/textarea, boolean for checkbox), honoring its
# `required`/`maxLength`. See behavior.spec.md §1 for the exact per-request validation rule.
```

## 5) Response Contracts
### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `FORMS_LIST_DEFINITIONS` | `200` | `FormDefinitionListResponse` | |
| `FORMS_CREATE_DEFINITION` | `201` | `FormDefinitionResponse` | Returns the full created definition |
| `FORMS_GET_DEFINITION` | `200` | `FormDefinitionResponse` | |
| `FORMS_UPDATE_DEFINITION` | `200` | `FormDefinitionResponse` | Returns the definition after the write |
| `FORMS_LIST_SUBMISSIONS` | `200` | `FormSubmissionListResponse` | Newest-first (see `behavior.spec.md` §2) |
| `FORMS_GET_SUBMISSION` | `200` | `FormSubmissionResponse` | |
| `FORMS_DELETE_SUBMISSION` | `204` | (empty body) | |
| `FORMS_POST_SUBMIT` | `201` | `FormSubmitResponse` | Returned for both a genuinely-accepted submission and a honeypot-discarded one (REQ-08) — identical response either way, so a bot cannot distinguish the two outcomes |

### Contract Definitions
```yaml
FieldDescriptor:
  id: { type: string }
  label: { type: string }
  type: { type: string, enum: [text, email, textarea, checkbox] }
  required: { type: boolean }
  maxLength: { type: integer, nullable: true }

NotifyConfig:
  enabled: { type: boolean }
  recipients: { type: array, items: { type: string, format: email } }

FormDefinition:
  id: { type: string }
  workspaceId: { type: string, format: uuid }
  name: { type: string }
  slug: { type: string }
  fields: { type: array, items: { $ref: FieldDescriptor } }
  notify: { $ref: NotifyConfig }
  status: { type: string, enum: [active, disabled] }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }

FormDefinitionResponse:
  data: { $ref: FormDefinition }

FormDefinitionListResponse:
  data: { type: array, items: { $ref: FormDefinition } }

FormSubmission:
  id: { type: string }
  formDefinitionId: { type: string }
  workspaceId: { type: string, format: uuid }
  data: { type: object, description: "field id -> submitted value, string or boolean per field type" }
  sourceIp: { type: string }
  submittedAt: { type: string, format: date-time }

FormSubmissionResponse:
  data: { $ref: FormSubmission }

FormSubmissionListResponse:
  data: { type: array, items: { $ref: FormSubmission } }
  nextCursor: { type: string, nullable: true }

FormSubmitResponse:
  status: { type: string, enum: [accepted] }
```

## 6) Error Mapping
Reference canonical codes in `errors.spec.md`.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `FORMS_LIST_DEFINITIONS` | `401` | `UNAUTHENTICATED` |
| `FORMS_LIST_DEFINITIONS` | `403` | `FORBIDDEN` |
| `FORMS_CREATE_DEFINITION` | `400` | `FORMS_FIELD_VALIDATION_ERROR` |
| `FORMS_CREATE_DEFINITION` | `401` | `UNAUTHENTICATED` |
| `FORMS_CREATE_DEFINITION` | `403` | `FORBIDDEN` |
| `FORMS_CREATE_DEFINITION` | `409` | `FORMS_SLUG_CONFLICT` |
| `FORMS_GET_DEFINITION` | `401` | `UNAUTHENTICATED` |
| `FORMS_GET_DEFINITION` | `403` | `FORBIDDEN` |
| `FORMS_GET_DEFINITION` | `404` | `FORMS_DEFINITION_NOT_FOUND` |
| `FORMS_UPDATE_DEFINITION` | `400` | `FORMS_FIELD_VALIDATION_ERROR` |
| `FORMS_UPDATE_DEFINITION` | `401` | `UNAUTHENTICATED` |
| `FORMS_UPDATE_DEFINITION` | `403` | `FORBIDDEN` |
| `FORMS_UPDATE_DEFINITION` | `404` | `FORMS_DEFINITION_NOT_FOUND` |
| `FORMS_LIST_SUBMISSIONS` | `401` | `UNAUTHENTICATED` |
| `FORMS_LIST_SUBMISSIONS` | `403` | `FORBIDDEN` |
| `FORMS_LIST_SUBMISSIONS` | `404` | `FORMS_DEFINITION_NOT_FOUND` |
| `FORMS_GET_SUBMISSION` | `401` | `UNAUTHENTICATED` |
| `FORMS_GET_SUBMISSION` | `403` | `FORBIDDEN` |
| `FORMS_GET_SUBMISSION` | `404` | `FORMS_SUBMISSION_NOT_FOUND` |
| `FORMS_DELETE_SUBMISSION` | `401` | `UNAUTHENTICATED` |
| `FORMS_DELETE_SUBMISSION` | `403` | `FORBIDDEN` |
| `FORMS_DELETE_SUBMISSION` | `404` | `FORMS_SUBMISSION_NOT_FOUND` |
| `FORMS_POST_SUBMIT` | `400` | `FORMS_SUBMISSION_VALIDATION_ERROR` |
| `FORMS_POST_SUBMIT` | `404` | `FORMS_DEFINITION_NOT_FOUND` |
| `FORMS_POST_SUBMIT` | `429` | `FORMS_RATE_LIMIT_EXCEEDED` |
| `*` | `500` | `INTERNAL_ERROR` |

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md` and `ui.spec.md`.
