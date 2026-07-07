# API Contract Spec: Declarative Theme System — Manifest, Hierarchy Resolver, Activation

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-004`
- Feature: `FEAT-004-declarative-theme-system`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:35:00Z`

## Purpose
Source of truth for the HTTP surface this feature adds or modifies.

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `THEMES_LIST` (new) | `GET` | `/api/admin/v1/workspaces/:workspaceId/themes` | List discovered themes with source/status/errors | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `PRESENTATION_GET` (modified) | `GET` | `/api/admin/v1/workspaces/:workspaceId/presentation` | `availableThemeIds` becomes the dynamic valid set | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `PRESENTATION_PATCH` (modified) | `PATCH` | `/api/admin/v1/workspaces/:workspaceId/presentation` | Activation validated against discovery; new error codes | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `CONTENT_ENTRY_BY_SLUG` (modified) | `GET` | `/api/content/v1/workspaces/:workspaceId/posts/:slug` | `presentation.activeThemeId` type widens to string | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `SITE_*` (modified behavior) | `GET` | `/`, `/:slug` | Rendered through the template resolver + fallback (REQ-03/REQ-10) | public | `NONE_LOCAL` |

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `AUTH_LOCAL_DEV` | `false` | none | none | local developer | Unchanged carry-over (Art. VI exception). Future named actions: `admin.themes.read`, `admin.themes.activate`. |

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `NONE_LOCAL` | n/a | n/a | n/a | n/a | Unchanged. |

## 4) Request Contracts

### Endpoint: `THEMES_LIST`
- Path Params: `workspaceId: { type: string, required: true }`. Query: `{}`. Body: none. (Discovery refresh happens server-side on each call — no refresh parameter in v1.)

### Endpoint: `PRESENTATION_PATCH` (modified)
- Body contract unchanged: `{ activeThemeId: string }` — but the value is now validated against discovered valid themes (REQ-08) instead of a hardcoded union. Optional `Idempotency-Key` per SPEC-001.

### Others
- No request-contract changes.

## 5) Response Contracts

### `THEMES_LIST` — 200
```yaml
themes:
  type: array          # ordered per TB-01 (built-ins first by id asc, then site themes by id asc)
  items:
    id: string
    name: string
    version: string (semver)
    source: enum[built-in, site]
    status: enum[valid, invalid]
    errors:            # empty array when valid
      type: array
      items:
        code: string   # validation error code (errors.spec.md §3 THEME_INVALID details)
        file: string|null
        message: string
    active: boolean    # exactly one true across the array
```

### `PRESENTATION_GET` / `PRESENTATION_PATCH` — 200 (modified)
Pre-feature envelope with two type-level changes:
```yaml
settings:
  workspaceId: string
  activeThemeId: string        # WAS enum[paper, atlas, glassmorphic] — now any valid theme id
  updatedAt: string (date-time)
  version: integer             # SPEC-001 REQ-05 field
availableThemeIds: array<string>   # ids of discovered themes with status valid
```

### `CONTENT_ENTRY_BY_SLUG` — 200 (modified)
`presentation.activeThemeId` widens from the 3-value enum to `string`. No other change.

### `SITE_*` — 200/404 html
Rendered via template resolution (REQ-03). Theme-data failures never yield 5xx (REQ-10/INV-05); unmatched slugs yield 404 via `not-found.json` or built-in markup.

### Error responses
SPEC-001/002 envelope (`error`, `code`, optional details).

## 6) Status Code Map

| Endpoint | 200 | 400 | 404 | 409 | 422 | 500 |
|---|---|---|---|---|---|---|
| `THEMES_LIST` | list | — | unknown workspace | — | — | internal |
| `PRESENTATION_GET` | settings | — | unknown workspace/settings | — | — | internal |
| `PRESENTATION_PATCH` | settings | `VALIDATION_ERROR` (malformed body) | unknown workspace / `THEME_NOT_FOUND` | `DUPLICATE_COMMAND` | `THEME_INVALID` | internal |
| `SITE_*` | html | — | 404 html | — | — | 500 html (non-theme causes only) |

## 7) Compatibility Rules

- `HeadlessThemeId` (headless contracts) widens from the 3-id union to `string`; `availableThemeIds` remains the runtime source of truth for valid choices — shells must not hardcode ids (the current admin shell does not).
- `PRESENTATION_PATCH` responses keep their exact pre-feature shape; only the accepted input domain and error codes change. Activating any of the 3 built-in ids behaves as before (AC-01).
- `THEME_NOT_FOUND` (404) vs `THEME_INVALID` (422) are new codes on PATCH; the pre-feature 400 `VALIDATION_ERROR` for "not supported" ids is superseded by these (breaking only for clients that matched on the 400 status for bad ids — the admin shell surfaces the message string, unaffected).
- The theme *package format* (state.spec.md) is an ecosystem compatibility surface versioned by `engine`; the HTTP surface above is not where themes integrate.
