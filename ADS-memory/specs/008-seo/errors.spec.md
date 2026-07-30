# Error Code Registry Spec: seo

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-008`
- Feature: `FEAT-008-seo`
- Version: `1.0.0`
- Content Hash: `sha256:5647a1176b49a39923b174865ecebeec4115078ec0625c6a58087815c4e0e128`
- Last Edited: `2026-07-13T20:18:23Z`

## Purpose
Canonical error registry for the SEO admin section, independent of stack/language.

## 1) Error Envelope (Base Payload)
All errors MUST include:

```yaml
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null
details: object|null
```

`correlationId` is deferred (`null`) in this pass, consistent with the deferred-observability-field pattern the Constitution's Article VIII exception process allows (as SPEC-001 defers `occurredAt`/`correlationId` elsewhere in this codebase); `workspaceId`/`entryId` in `details` serve as the available correlation identifiers for now.

## 2) Error Code Registry
| Code | Category | Layer (`api|orchestrator|ui|integration`) | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `SEO_FIELD_VALIDATION_ERROR` | validation | `api` | 400 | no | "One or more SEO fields could not be saved — check the highlighted fields." |
| `SEO_INVALID_CANONICAL_URL` | validation | `api` | 400 | no | "Canonical URL must be a valid absolute web address." |
| `SEO_SETTINGS_VALIDATION_ERROR` | validation | `api` | 400 | no | "SEO settings could not be saved — check the highlighted fields." |
| `SEO_ENTRY_NOT_FOUND` | resource | `api` | 404 | no | "This post or page could not be found." |
| `UNAUTHENTICATED` | auth | `api` | 401 | maybe | "Please sign in again." |
| `FORBIDDEN` | authz | `api` | 403 | no | "You do not have permission to manage SEO for this workspace." |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | "Unexpected server error. Try again shortly." |

Note: `sitemap.xml`/`robots.txt` are public reads (no `UNAUTHENTICATED`/`FORBIDDEN` path — see `api.spec.md` §2 `SEO_PUBLIC` profile); their only defined failure is `INTERNAL_ERROR`, and per REQ-16/`feature.spec.md` the `page.head` render path itself never surfaces an error to the visitor (a throwing contributor is silently dropped, not converted into one of these codes) — these codes apply to the dedicated `sitemap.xml`/`robots.txt` route handlers themselves, not to `page.head` rendering.

## 3) Per-Code Details Schema

```yaml
SEO_FIELD_VALIDATION_ERROR:
  details:
    fieldErrors:
      type: array
      items:
        field: string
        reason: string   # e.g. "unregistered_key" | "exceeds_max_length"

SEO_INVALID_CANONICAL_URL:
  details:
    field: string          # "canonical" | "ogImage" | "twitterImage"
    reason: string          # e.g. "not_absolute" | "unsafe_scheme"

SEO_SETTINGS_VALIDATION_ERROR:
  details:
    fieldErrors:
      type: array
      items:
        field: string       # e.g. "titleTemplate" | "robotsRules[3].userAgent"
        reason: string

SEO_ENTRY_NOT_FOUND:
  details:
    entryId: string (uuid)
    workspaceId: string (uuid)

FORBIDDEN:
  details:
    permission: string      # always "admin.seo.manage"
    reason: string           # authorize()'s machine-readable reason
```

## 4) Ownership and Source Rules
| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `SEO_FIELD_VALIDATION_ERROR` | `SET_ENTRY_SEO_OVERRIDES` write-path validator | API + UI (`SeoEntryPanel`) | UI maps `fieldErrors` to inline per-field errors |
| `SEO_INVALID_CANONICAL_URL` | `SET_ENTRY_SEO_OVERRIDES` write-path validator (a specialization of `SEO_FIELD_VALIDATION_ERROR` for URL-shaped fields) | API + UI | Rejects `javascript:`/`data:` schemes and non-absolute values (mirrors `routing`'s existing `UrlTarget` scheme-validation posture) |
| `SEO_SETTINGS_VALIDATION_ERROR` | `UPSERT_SEO_SETTINGS` write-path validator | API + UI (`SeoSettingsScreen`) | Includes `titleTemplate` `%s`-presence check and `robotsRules` shape/length checks |
| `SEO_ENTRY_NOT_FOUND` | `RESOLVE_ENTRY_EFFECTIVE_META` / `ANALYZE_ENTRY` selectors | API | Entry id doesn't resolve via `PostRepoPort.findById` in the given workspace |
| `FORBIDDEN` | `authorize()` gateway (`src/identity`) | API + UI | Existing cross-cutting mechanism, reused unchanged |
| `UNAUTHENTICATED` | `getAuthedPrincipal` dev-auth middleware | API + UI | Existing cross-cutting mechanism, reused unchanged |
| `INTERNAL_ERROR` | Any unexpected failure in a route handler | API | Catch-all, matches every existing admin route's `catch` block |

## 5) Acceptance Checklist
- [x] Every error emitted by feature code appears in Section 2.
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here.
- [x] User-safe message guidance is provided.
