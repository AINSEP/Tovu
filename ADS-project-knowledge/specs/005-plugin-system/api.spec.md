# API Contract Spec: Plugin System — Artifact, Loader, One Hook, `ext.*` Fields (v1)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-005`
- Feature: `FEAT-005-plugin-system`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T04:10:00Z`

## Purpose
Source of truth for the HTTP surface this feature adds or modifies. The **plugin author-facing** surface (the `@tovu/sdk` exports) is a package contract, not HTTP — it lives in state.spec.md §2 and behavior.spec.md, versioned by `sdkRange` (ADR-005), not here.

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `PLUGINS_LIST` (new) | `GET` | `/api/admin/v1/workspaces/:workspaceId/plugins` | List discovered plugins with source/status/enabled/errors | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `PLUGIN_SET_ENABLED` (new) | `PATCH` | `/api/admin/v1/workspaces/:workspaceId/plugins/:pluginId` | Enable/disable a plugin through the SPEC-001 gateway | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `ENTRY_CREATE` / `ENTRY_UPDATE` (modified behavior) | `POST`/`PUT` | `…/posts`, `…/pages`, `…/posts/:id`, `…/pages/:id` | `content.entry.beforeSave` hook now runs inside the write; response DTO gains additive `ext` | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `CONTENT_ENTRY_BY_SLUG` (modified) | `GET` | `/api/content/v1/workspaces/:workspaceId/posts/:slug` | Payload gains additive `ext` object | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `AUTH_LOCAL_DEV` | `false` | none | none | local developer | Unchanged carry-over (Art. VI exception). Future named actions: `admin.plugins.read`, `admin.plugins.enable`. |

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `NONE_LOCAL` | n/a | n/a | n/a | n/a | Unchanged. |

## 4) Request Contracts

### Endpoint: `PLUGINS_LIST`
- Path Params: `workspaceId: { type: string, required: true }`. Query: `{}`. Body: none. (Discovery + integrity/`sdkRange` checks run server-side on each call — no refresh parameter in v1.)

### Endpoint: `PLUGIN_SET_ENABLED`
- Path Params: `workspaceId`, `pluginId` (both required). Body: `{ enabled: boolean }`. Optional `Idempotency-Key` header (SPEC-001 duplicate semantics). The transition executes through the gateway (one change set).

### Endpoint: `ENTRY_CREATE` / `ENTRY_UPDATE`
- Request contracts unchanged from SPEC-002. Behavior change only: enabled plugins' `content.entry.beforeSave` filters run inside the write (BR-04); a throwing filter fails the write fail-closed (EC-10).

## 5) Response Contracts

### `PLUGINS_LIST` — 200
```yaml
plugins:
  type: array          # ordered per TB-01 (built-ins first by id asc, then site plugins by id asc)
  items:
    id: string
    name: string
    version: string (semver)
    source: enum[built-in, site]
    status: enum[valid, invalid, incompatible]
    enabled: boolean
    errors:            # empty array when valid
      type: array
      items:
        code: string   # validation vocabulary (errors.spec.md §3)
        file: string|null
        message: string
```

### `PLUGIN_SET_ENABLED` — 200
```yaml
plugin:
  id: string
  version: string
  enabled: boolean
  updatedAt: string (date-time)
changeSetId: string    # the applied change set for this transition (SPEC-001)
```

### `ENTRY_*` / `CONTENT_ENTRY_BY_SLUG` — 200 (modified, additive)
Pre-feature SPEC-002 envelope with one additive optional field on the entry object:
```yaml
ext:                   # OPTIONAL — present only when a plugin has written fields
  type: object
  additionalProperties:      # keyed by pluginId
    type: object             # the plugin's declared ext fields, e.g. { count: 5 }
```

### Error responses
SPEC-001/002/004 envelope (`error`, `code`, optional `details`).

## 6) Status Code Map

| Endpoint | 200 | 400 | 404 | 409 | 422 | 500 |
|---|---|---|---|---|---|---|
| `PLUGINS_LIST` | list | — | unknown workspace | — | — | internal |
| `PLUGIN_SET_ENABLED` | plugin+changeSetId | `VALIDATION_ERROR` (malformed body) | unknown workspace / `PLUGIN_NOT_FOUND` | `DUPLICATE_COMMAND` | `PLUGIN_INVALID` / `PLUGIN_INCOMPATIBLE` | internal |
| `ENTRY_CREATE`/`ENTRY_UPDATE` | entry (+`ext`) | SPEC-002 codes | SPEC-002 codes | SPEC-002 codes | SPEC-002 codes | `PLUGIN_HOOK_FAILED` (a beforeSave filter threw — entry unchanged, EC-10) |
| `CONTENT_ENTRY_BY_SLUG` | entry (+`ext`) | — | 404 | — | — | internal |

## 7) Compatibility Rules

- The `ext` object is **additive**: absent for entries with no plugin data; shells that don't read it are unaffected (REQ-11).
- `PLUGIN_INVALID` (422) vs `PLUGIN_INCOMPATIBLE` (422, `sdkRange`) vs `PLUGIN_NOT_FOUND` (404) are distinct codes on `PLUGIN_SET_ENABLED`.
- `ENTRY_*` request/response shapes are otherwise byte-identical to SPEC-002; only the `ext` addition and the fail-closed 500 path are new.
- The plugin **artifact + manifest format** (state.spec.md §2) and the **`@tovu/sdk` surface** are the ecosystem compatibility surfaces, versioned by the manifest `engine`/`sdkRange` and the ADR-005 snapshot test — not this HTTP surface. Third parties integrate through the SDK, not these endpoints.
