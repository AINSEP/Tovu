# API Contract Spec: Content Entry Authoring — Create and Edit Pages + Posts

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-002`
- Feature: `FEAT-002-content-entry-authoring`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:05:00Z`

## Purpose
Source of truth for the HTTP surface this feature adds or modifies, independent of implementation.

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `POST_CREATE` (new) | `POST` | `/api/admin/v1/workspaces/:workspaceId/posts` | Create a `kind "post"` entry via the gateway | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `PAGE_CREATE` (new) | `POST` | `/api/admin/v1/workspaces/:workspaceId/pages` | Create a `kind "page"` entry via the gateway | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `PAGES_LIST` (new) | `GET` | `/api/admin/v1/workspaces/:workspaceId/pages` | List `kind "page"` entries (drafts included) | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `PAGE_GET` (new) | `GET` | `/api/admin/v1/workspaces/:workspaceId/pages/:pageId` | Read one page | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `PAGE_UPDATE` (new) | `PUT` | `/api/admin/v1/workspaces/:workspaceId/pages/:pageId` | Update a page via the gateway | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `POSTS_LIST` (modified) | `GET` | `/api/admin/v1/workspaces/:workspaceId/posts` | Now returns only `kind "post"` entries, ordered per TB-01 | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `POST_GET` (modified) | `GET` | `/api/admin/v1/workspaces/:workspaceId/posts/:postId` | 404 when the record's kind is not `post` | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `POST_UPDATE` (modified) | `PUT` | `/api/admin/v1/workspaces/:workspaceId/posts/:postId` | 404 when kind is not `post`; reserved-slug check added | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `CONTENT_ENTRY_BY_SLUG` (modified) | `GET` | `/api/content/v1/workspaces/:workspaceId/posts/:slug` | Serves published entries of BOTH kinds; payload gains `kind` | `AUTH_LOCAL_DEV` | `NONE_LOCAL` |
| `SITE_HOME` (modified) | `GET` | `/` | Home listing filters to published `kind "post"` only | public | `NONE_LOCAL` |
| `SITE_SLUG` (behavior confirmed) | `GET` | `/:slug` | Renders any published entry (post or page); unchanged code path | public | `NONE_LOCAL` |

Path note: the content API keeps the `/posts/:slug` path for both kinds in this slice (renaming to `/entries/:slug` is coupled to OQ-02 and would break the existing shells for zero MVP value).

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `AUTH_LOCAL_DEV` | `false` | none (dev-auth middleware only) | none | local developer | Carried over from SPEC-001 (Constitution Art. VI EXCEPTION). Permissions feature will introduce named actions (`admin.entries.create`, `admin.entries.update`, …). Workspace scoping via path param is enforced structurally (ADR-007). |

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `NONE_LOCAL` | n/a | n/a | n/a | n/a | No rate limiting in the local dev server (unchanged from SPEC-001). |

## 4) Request Contracts

### Endpoint: `POST_CREATE` / `PAGE_CREATE`
- Path Params:
```yaml
workspaceId: { type: string, required: true }
```
- Headers:
```yaml
Idempotency-Key: { type: string, required: false, maxLength: 200 }   # SPEC-001 semantics
```
- Body:
```yaml
title:    { type: string, required: true,  minLength: 1 (after trim), maxLength: 200 }
slug:     { type: string, required: false, pattern: "^[a-z0-9-]+$" (after trim+lowercase), maxLength: 120 }
bodyJson: { type: object, required: false, default: { type: "doc", content: [] } }
status:   { type: enum[draft, published], required: false, default: draft }
# kind is NOT accepted in the body — it is fixed by the route family (REQ-01)
```
- Body size limit: 1 MiB (route layer; exceeding ⇒ 413, EC-05).

### Endpoint: `PAGES_LIST`
- Path Params: `workspaceId` as above. Query Params: `{}` (pagination deferred, OQ-04). Body: none.

### Endpoint: `PAGE_GET`
- Path Params:
```yaml
workspaceId: { type: string, required: true }
pageId:      { type: string, required: true }
```
- Body: none.

### Endpoint: `PAGE_UPDATE`
- Path Params: as `PAGE_GET`.
- Headers: optional `Idempotency-Key` (SPEC-001 REQ-04 semantics).
- Body (identical to the existing `POST_UPDATE` contract; `kind` ignored if present per AC-19):
```yaml
title:    { type: string, required: true }
slug:     { type: string, required: true, pattern: "^[a-z0-9-]+$" }
bodyJson: { type: object, required: true }
status:   { type: enum[draft, published], required: true }
```

### Endpoints: `POSTS_LIST` / `POST_GET` / `POST_UPDATE` (modified)
- Request contracts unchanged from their pre-feature/SPEC-001 shapes. Behavioral deltas only: kind filter/guard (REQ-07/REQ-08) and the reserved-slug check on update (REQ-04).

### Endpoint: `CONTENT_ENTRY_BY_SLUG` (modified)
- Request contract unchanged (`workspaceId`, `slug` path params).

## 5) Response Contracts

### `POST_CREATE` / `PAGE_CREATE` — 201
```yaml
post:                       # envelope key stays `post` (headless AdminPostEnvelope; rename is OQ-02)
  id: string
  workspaceId: string
  kind: enum[post, page]    # NEW field
  title: string
  slug: string              # provided or derived (BR-01/BR-02)
  bodyJson: object
  status: enum[draft, published]
  updatedAt: string (date-time)
  version: integer          # always 1 on create
```

### `PAGE_GET` / `PAGE_UPDATE` — 200
Same envelope as above with `kind == "page"`.

### `PAGES_LIST` — 200
```yaml
pages:
  type: array               # ordered updatedAt desc, id desc tie-break (TB-01)
  items: <entry shape as above, kind == "page">
```

### `POSTS_LIST` — 200 (modified)
Pre-feature shape `{ posts: [...] }` with each item gaining `kind` (always `"post"` here); ordering per TB-01 (previously unspecified).

### `POST_GET` / `POST_UPDATE` — 200 (modified)
Pre-feature `AdminPostEnvelope` with the added `kind` field. No other change.

### `CONTENT_ENTRY_BY_SLUG` — 200 (modified)
```yaml
post:
  id: string
  kind: enum[post, page]    # NEW field
  title: string
  slug: string
  bodyJson: object
  updatedAt: string (date-time)
presentation:
  activeThemeId: enum[paper, atlas, glassmorphic]
```

### `SITE_HOME` / `SITE_SLUG` — 200
`text/html` (server-rendered, active theme). Home lists published posts only (AC-14); `/:slug` renders any published entry; drafts and unknown slugs render the site 404 page.

### Error responses (all JSON endpoints)
```yaml
error: string             # human-readable message (existing convention, always present)
code: string|null         # machine-readable code from errors.spec.md; REQUIRED on new endpoints,
                          # on DUPLICATE_COMMAND, and on SLUG_CONFLICT responses
changeSetId: string|null  # only for DUPLICATE_COMMAND (SPEC-001)
```

## 6) Status Code Map

| Endpoint | 200/201 | 400 | 404 | 409 | 413 | 422 | 500 |
|---|---|---|---|---|---|---|---|
| `POST_CREATE` / `PAGE_CREATE` | 201 entry | `VALIDATION_ERROR` | unknown workspace | `SLUG_CONFLICT`, `DUPLICATE_COMMAND` | `PAYLOAD_TOO_LARGE` | — | internal |
| `PAGES_LIST` | 200 list | — | unknown workspace | — | — | — | internal |
| `PAGE_GET` | 200 entry | — | unknown workspace / `ENTRY_NOT_FOUND` (incl. kind mismatch) | — | — | — | internal |
| `PAGE_UPDATE` | 200 entry | `VALIDATION_ERROR` | unknown workspace / `ENTRY_NOT_FOUND` | `SLUG_CONFLICT`, `DUPLICATE_COMMAND` | `PAYLOAD_TOO_LARGE` | — | internal |
| `POSTS_LIST` | 200 list | — | unknown workspace | — | — | — | internal |
| `POST_GET` | 200 entry | — | unknown workspace / not found / kind mismatch | — | — | — | internal |
| `POST_UPDATE` | 200 entry | validation (incl. reserved slug) | unknown workspace / not found / kind mismatch | slug conflict / `DUPLICATE_COMMAND` | `PAYLOAD_TOO_LARGE` | — | internal |
| `CONTENT_ENTRY_BY_SLUG` | 200 payload | — | not found / draft / unknown workspace | — | — | — | internal |
| `SITE_HOME` | 200 html | — | — | — | — | — | 500 html |
| `SITE_SLUG` | 200 html | — | 404 html (draft/unknown) | — | — | — | 500 html |

## 7) Compatibility Rules

- All wire changes are additive: the new `kind` field is added to existing envelopes; no field is removed or renamed; the `post`/`posts` envelope keys are retained (rename coupled to OQ-02).
- Existing consumers (the Vite admin shell, headless contract tests) require only type-level updates for `kind` (REQ-10); runtime behavior of pre-feature calls is unchanged except: `POSTS_LIST` ordering becomes deterministic (TB-01), and post routes 404 on page ids (impossible before this feature, since pages could not exist).
- Modified endpoints keep the legacy `{ error }` payload; the `code` field is guaranteed only on new endpoints, `DUPLICATE_COMMAND`, and `SLUG_CONFLICT` (extends the SPEC-001 rule).
- Kind-mismatch 404s are deliberately indistinguishable from not-found (no existence leak across kind families).
