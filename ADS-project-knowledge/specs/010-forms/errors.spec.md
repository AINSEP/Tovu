# Error Code Registry Spec: forms

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-010`
- Feature: `FEAT-010-forms`
- Version: `1.0.0`
- Content Hash: `sha256:PENDING`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Canonical error registry for the Forms feature.

## 1) Error Envelope (Base Payload)
All errors MUST include:

```yaml
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null   # deferred per the existing Article VIII deferral pattern (SPEC-001 precedent)
details: object|null
```

## 2) Error Code Registry
| Code | Category | Layer (`api|orchestrator|ui|integration`) | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `FORMS_FIELD_VALIDATION_ERROR` | validation | `api` | 400 | no | "Please correct the highlighted field(s)." |
| `FORMS_SLUG_CONFLICT` | resource | `api` | 409 | no | "A form with this URL slug already exists." |
| `FORMS_DEFINITION_NOT_FOUND` | resource | `api` | 404 | no | "This form could not be found." (also returned when the form is disabled — REQ-07/AC-12 — never distinguished from not-found) |
| `FORMS_SUBMISSION_VALIDATION_ERROR` | validation | `api` | 400 | no | "Please fill in all required fields." |
| `FORMS_SUBMISSION_NOT_FOUND` | resource | `api` | 404 | no | "This submission could not be found." |
| `FORMS_RATE_LIMIT_EXCEEDED` | throttling | `api` | 429 | yes | "Too many submissions. Please try again shortly." |
| `UNAUTHENTICATED` | auth | `api` | 401 | maybe | "Please sign in again." |
| `FORBIDDEN` | authz | `api` | 403 | no | "You do not have permission." |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | "Unexpected server error." |

## 3) Per-Code Details Schema

```yaml
FORMS_FIELD_VALIDATION_ERROR:
  details:
    fieldErrors:
      type: array
      items:
        field: string
        reason: string

FORMS_SUBMISSION_VALIDATION_ERROR:
  details:
    fieldErrors:
      type: array
      items:
        field: string
        reason: string   # "required", "too_long", "unregistered_key"

FORMS_SLUG_CONFLICT:
  details:
    slug: string

FORMS_RATE_LIMIT_EXCEEDED:
  details:
    retryAfterSeconds: integer
```

## 4) Ownership and Source Rules
| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `FORMS_FIELD_VALIDATION_ERROR` | Form-definition write-service | API + admin UI | UI maps `fieldErrors` entries to `FormFieldsEditor` rows |
| `FORMS_SLUG_CONFLICT` | Form-definition write-service (unique-index violation) | API + admin UI | UI surfaces this as an inline error on the slug input |
| `FORMS_SUBMISSION_VALIDATION_ERROR` | Public submission handler | API only (consumed by the site/theme layer, out of scope here) | |
| `FORMS_DEFINITION_NOT_FOUND` | Public submission handler + admin read/write routes | API | Deliberately identical for "no such slug" and "disabled" (REQ-07) |
| `FORMS_RATE_LIMIT_EXCEEDED` | Public submission handler's rate-limit check | API | The one rate limit this feature actually enforces (see `api.spec.md` `FORMS_SUBMIT` profile) |

## 5) Acceptance Checklist
- [x] Every error emitted by feature code appears in Section 2.
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here.
- [x] User-safe message guidance is provided.
