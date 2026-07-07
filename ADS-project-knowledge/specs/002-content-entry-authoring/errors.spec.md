# Error Code Registry Spec: Content Entry Authoring — Create and Edit Pages + Posts

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-002`
- Feature: `FEAT-002-content-entry-authoring`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:05:00Z`

## Purpose
Canonical error registry for this feature. Extends (never redefines) the SPEC-001 registry.

## 1) Error Envelope (Base Payload)

Unchanged from SPEC-001:

```yaml
error: string              # human-readable message (always present — existing convention)
code: string|null          # machine-readable code; REQUIRED on new endpoints, DUPLICATE_COMMAND,
                           # and SLUG_CONFLICT responses; legacy endpoints otherwise keep {error} only
changeSetId: string|null   # only for DUPLICATE_COMMAND (SPEC-001)
```

## 2) Error Code Registry

| Code | Category | Layer | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `VALIDATION_ERROR` | validation | `api` | 400 | no | Message from feature validation (`title is required`, `slug must use lowercase letters, numbers, and dashes`, `slug 'admin' is reserved`, `bodyJson must be a JSON object`, `title must contain characters usable in a slug`). |
| `SLUG_CONFLICT` (new) | conflict | `api` | 409 | no | "That URL slug is already in use — pick another." Distinct code so shells/agents can offer the derived-suffix alternative. |
| `ENTRY_NOT_FOUND` (new) | resource | `api` | 404 | no | "Page not found." Covers unknown id AND kind mismatch (deliberately indistinguishable). |
| `PAYLOAD_TOO_LARGE` (new) | validation | `api` | 413 | no | "Content too large to save." Route-layer body limit (1 MiB). |
| `DUPLICATE_COMMAND` | idempotency | `api` | 409 | no | SPEC-001 — "This change was already submitted." Carries original `changeSetId`. |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | "Unexpected server error." |

Existing modified endpoints (`POST_GET`, `POST_UPDATE`, `POSTS_LIST`, `CONTENT_ENTRY_BY_SLUG`) keep their legacy message-only 404/400/409 payloads for pre-feature failure kinds; new failure kinds introduced by this feature (kind mismatch) reuse the legacy 404 shape there (compatibility rule in api.spec.md §7).

## 3) Per-Code Details Schema

```yaml
SLUG_CONFLICT:
  details:                 # optional in v1
    slug: string           # the conflicting slug as normalized (trimmed/lowercased)

DUPLICATE_COMMAND:         # per SPEC-001
  changeSetId: string
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `VALIDATION_ERROR` | `features/post` (`PostValidationError` — existing + reserved-slug + empty-derived-slug cases) | route error mapping | thrown before any write; gateway records nothing (SPEC-001 BR-03) |
| `SLUG_CONFLICT` | `features/post` (`PostConflictError` — existing class, new code mapping) | route error mapping | covers explicit-slug conflict (AC-03), cross-kind conflict (EC-06), suffix exhaustion (EC-03) |
| `ENTRY_NOT_FOUND` | `features/post` (`PostNotFoundError`) incl. kind-mismatch guard (BR-06) | route error mapping | new `/pages` endpoints emit the code; legacy `/posts` endpoints keep message-only shape |
| `PAYLOAD_TOO_LARGE` | Express JSON body-parser limit (route layer) | route error mapping | applies to create/update endpoints; limit 1 MiB (behavior §4) |
| `DUPLICATE_COMMAND` | `core/commands` (SPEC-001 `DuplicateCommandError`) | route error mapping | unchanged; now also fired by create endpoints |
| `INTERNAL_ERROR` | any uncaught error | route catch-all | unchanged |

## 5) Acceptance Checklist

- [x] Every code has HTTP status, retryability, ownership, and user guidance
- [x] Every code maps to at least one AC or EC in feature.spec.md (see traceability.spec.md §4)
- [x] No status code is reused for two distinguishable failure kinds on the same endpoint without distinct `code` values (409 on creates distinguishes `SLUG_CONFLICT` vs `DUPLICATE_COMMAND` by code)
