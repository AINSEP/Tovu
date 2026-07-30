# API Contract Spec: Admin Command Gateway — Auditable, Undoable Mutations

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-001`
- Feature: `FEAT-001-admin-command-gateway`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T04:15:00Z`

## Purpose
Source of truth for the HTTP surface this feature adds or modifies, independent of implementation.

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `CHANGE_SETS_LIST` | `GET` | `/api/admin/v1/workspaces/:workspaceId/change-sets` | List workspace change sets newest-first | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `CHANGE_SET_GET` | `GET` | `/api/admin/v1/workspaces/:workspaceId/change-sets/:changeSetId` | Read one change set with items | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `CHANGE_SET_REVERT` | `POST` | `/api/admin/v1/workspaces/:workspaceId/change-sets/:changeSetId/revert` | Revert an applied change set | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `POST_UPDATE` (modified) | `PUT` | `/api/admin/v1/workspaces/:workspaceId/posts/:postId` | Update a post through the gateway | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `PRESENTATION_PATCH` (modified) | `PATCH` | `/api/admin/v1/workspaces/:workspaceId/presentation` | Set active theme through the gateway | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `AUTH_LOCAL_DEV` | `false` | none | none | local developer | Constitution Art. VI EXCEPTION recorded in feature.spec.md: the Tovu dev server has no auth layer yet. The permissions feature will replace this profile with named-action checks (`admin.change-sets.read`, `admin.change-sets.revert`, …) before any non-local deployment. Workspace scoping via path param is enforced structurally (ADR-007). |

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `NONE_LOCAL` | n/a | n/a | n/a | n/a | No rate limiting in the local dev server. Budgets/limits arrive with the agent gateway feature. |

## 4) Request Contracts

### Endpoint: `CHANGE_SETS_LIST` (`GET …/change-sets`)
- Path Params:
```yaml
workspaceId: { type: string, required: true }
```
- Query Params: `{}` (pagination deferred; list is workspace-scoped, in-memory)
- Body: none

### Endpoint: `CHANGE_SET_GET` (`GET …/change-sets/:changeSetId`)
- Path Params:
```yaml
workspaceId: { type: string, required: true }
changeSetId: { type: string, required: true }
```
- Body: none

### Endpoint: `CHANGE_SET_REVERT` (`POST …/change-sets/:changeSetId/revert`)
- Path Params: as `CHANGE_SET_GET`
- Body: `{}` (empty object or no body; force-revert flag is out of scope)

### Endpoint: `POST_UPDATE` (modified)
- Unchanged body contract: `{ title: string, slug: string, bodyJson: object, status: "draft"|"published" }`
- New optional header:
```yaml
Idempotency-Key: { type: string, required: false, maxLength: 200 }
```

### Endpoint: `PRESENTATION_PATCH` (modified)
- Unchanged body contract: `{ activeThemeId: string }`
- New optional header: `Idempotency-Key` as above.

**Gateway summary (both modified endpoints):** the request bodies carry no `summary`, so each wired route supplies the non-empty summary the gateway requires — `POST_UPDATE` records `Update post {postId}`, `PRESENTATION_PATCH` records `Set active theme {activeThemeId}` (behavior.spec.md §3; REQ-04/REQ-05).

## 5) Response Contracts

### `CHANGE_SETS_LIST` — 200
```yaml
changeSets:
  type: array
  items:
    id: string
    workspaceId: string
    actorId: string
    status: enum[applied, reverted]     # proposed/discarded reserved, never emitted in v1
    summary: string
    intentRef: string|null
    createdAt: string (date-time)
    appliedAt: string (date-time)|null
    revertedAt: string (date-time)|null
```

### `CHANGE_SET_GET` — 200
```yaml
changeSet: <header shape as list item above>
items:
  type: array
  items:
    id: string
    entityType: string
    entityId: string
    operation: enum[create, update, delete, activate]
    revertible: boolean            # false when inversePayload is null
    entityVersionAtApply: integer|null
    position: integer
# inversePayload is intentionally NOT exposed over HTTP (may contain full content snapshots)
```

### `CHANGE_SET_REVERT` — 200
```yaml
changeSet: <header shape, status == reverted, revertedAt set>
```

### `POST_UPDATE` / `PRESENTATION_PATCH` — 200
Byte-for-byte the pre-feature success shapes (REQ-04, REQ-05). `PRESENTATION_PATCH` response additionally reflects the new `version` field only if the existing serializer already includes the full record; otherwise the serializer is unchanged.

### Error responses (all endpoints)
```yaml
error: string          # human-readable message (existing convention)
code: string|null      # machine-readable code from errors.spec.md; present on all NEW endpoints
                       # and on DUPLICATE_COMMAND responses from modified endpoints
changeSetId: string|null  # present only for DUPLICATE_COMMAND (the original change set)
```

## 6) Status Code Map

| Endpoint | 200 | 400 | 404 | 409 | 422 | 500 |
|---|---|---|---|---|---|---|
| `CHANGE_SETS_LIST` | list | — | unknown workspace | — | — | internal |
| `CHANGE_SET_GET` | record | — | unknown workspace / `CHANGE_SET_NOT_FOUND` | — | — | internal |
| `CHANGE_SET_REVERT` | reverted | — | unknown workspace / `CHANGE_SET_NOT_FOUND` | `REVERT_CONFLICT`, `CHANGE_SET_INVALID_STATUS` | `REVERT_NOT_POSSIBLE` | internal |
| `POST_UPDATE` | post | `VALIDATION_ERROR` | workspace/post not found | slug conflict / `DUPLICATE_COMMAND` | — | internal |
| `PRESENTATION_PATCH` | settings | `VALIDATION_ERROR` | workspace/settings not found | `DUPLICATE_COMMAND` | — | internal |

## 7) Compatibility Rules

- Existing consumers of `POST_UPDATE` and `PRESENTATION_PATCH` (Next/Vue local shells) must require zero changes: success shapes and existing error statuses are preserved (REQ-04).
- New `code` field is additive on error payloads and only guaranteed on new endpoints and `DUPLICATE_COMMAND`.
