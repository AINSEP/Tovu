# API Contract Spec: Members (As-Built)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-013`
- Feature: `FEAT-013-members`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Documents the four admin HTTP endpoints for Members exactly as implemented in
`src/server/routes/admin/members/*.ts` and mounted in `src/server/app.ts`. There is no public
(non-admin) member API today — see `feature.spec.md` REQ-15/OQ-01.

## 1) Endpoint Registry
| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `MEMBERS_LIST` | `GET` | `/api/admin/v1/workspaces/:workspaceId/members` | List all members in the workspace (all statuses) | `AUTH_SESSION_ONLY` | `NONE` |
| `MEMBERS_GET` | `GET` | `/api/admin/v1/workspaces/:workspaceId/members/:memberId` | Fetch one member by id | `AUTH_SESSION_ONLY` | `NONE` |
| `MEMBERS_DISABLE` | `POST` | `/api/admin/v1/workspaces/:workspaceId/members/:memberId/disable` | Disable a member (disable-only, idempotent) | `AUTH_MEMBER_MANAGE` | `NONE` |
| `MEMBERS_REQUEST_MAGIC_LINK` | `POST` | `/api/admin/v1/workspaces/:workspaceId/members/request-magic-link` | Operator-triggered resend of a passwordless sign-in link to a member email | `AUTH_SESSION_ONLY` | `NONE` |

No `MEMBERS_COMPLETE_SIGN_IN` endpoint exists — `completeSignIn` has zero HTTP callers
(`feature.spec.md` REQ-15).

## 2) Authentication and Authorization Profiles
| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `AUTH_SESSION_ONLY` | `true` | Admin session cookie (`requireAdminSession`, dev-auth middleware) | none beyond a valid session | any authenticated operator | No `authorize()` permission check is performed for this profile — see REQ-10/OQ-02. |
| `AUTH_MEMBER_MANAGE` | `true` | Admin session cookie + `authorize()` | `member.manage` | operators holding `member.manage` | The only member route with a per-action permission check. |

## 3) Rate Limit Profiles
| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `NONE` | n/a | n/a | n/a | n/a | No rate limiter exists for any member route (`feature.spec.md` REQ-17). `MEMBERS_REQUEST_MAGIC_LINK` in particular has no throttle despite ADR-030 OQ-8 naming one a hard pre-launch precondition — flagged, not built. |

## 4) Request Contracts

### Endpoint: `MEMBERS_LIST` (`GET /api/admin/v1/workspaces/:workspaceId/members`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
```
- Query Params:
```yaml
afterId:
  type: string
  required: false
  description: "Keyset pagination cursor (a member id); omit for the first page."
limit:
  type: integer
  required: false
  minimum: 1
  description: "Passed through to MemberRepoPort.list; the in-memory adapter caps at 100 regardless of a larger requested value."
```

### Endpoint: `MEMBERS_GET` (`GET /api/admin/v1/workspaces/:workspaceId/members/:memberId`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
memberId:
  type: string
  required: true
```

### Endpoint: `MEMBERS_DISABLE` (`POST /api/admin/v1/workspaces/:workspaceId/members/:memberId/disable`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
memberId:
  type: string
  required: true
```
- Body: none (empty POST body; no request payload is read by the handler)

### Endpoint: `MEMBERS_REQUEST_MAGIC_LINK` (`POST /api/admin/v1/workspaces/:workspaceId/members/request-magic-link`)
- Path Params:
```yaml
workspaceId:
  type: string
  required: true
```
- Body:
```yaml
email:
  type: string
  required: true
  description: "Coerced with String(req.body?.email ?? \"\"); validated server-side against EMAIL_PATTERN."
redirectPath:
  type: string
  required: false
```

## 5) Response Contracts
### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `MEMBERS_LIST` | `200` | `AdminMemberListResponse` | `{ members: AdminMemberResponse[] }` |
| `MEMBERS_GET` | `200` | `AdminMemberEnvelope` | `{ member: AdminMemberResponse }` |
| `MEMBERS_DISABLE` | `200` | `AdminMemberEnvelope` | Returns the (possibly unchanged, if already disabled) member |
| `MEMBERS_REQUEST_MAGIC_LINK` | `200` | `{ delivered: true }` | Always this exact shape on any syntactically valid email (REQ-02/INV-06) |

### Contract Definitions
```yaml
AdminMemberResponse:
  id: { type: string }
  workspaceId: { type: string }
  email: { type: string }
  name: { type: string, nullable: true }
  status: { type: string, enum: [pending, active, disabled] }
  emailVerifiedAt: { type: string, format: date-time, nullable: true }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }
  version: { type: integer }
  # Deliberately excludes `note` and `fields` (src/server/http/admin/members.ts).
  # Cannot include a session/token field — MemberRecord carries none.

AdminMemberListResponse:
  members: { type: array, items: { $ref: AdminMemberResponse } }

AdminMemberEnvelope:
  member: { $ref: AdminMemberResponse }
```

## 6) Error Mapping
Reference canonical codes in `errors.spec.md`.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `MEMBERS_LIST` | `404` | `WORKSPACE_NOT_FOUND` |
| `MEMBERS_LIST` | `500` | `INTERNAL_ERROR` |
| `MEMBERS_GET` | `404` | `WORKSPACE_NOT_FOUND`, `MEMBER_NOT_FOUND` |
| `MEMBERS_GET` | `500` | `INTERNAL_ERROR` |
| `MEMBERS_DISABLE` | `404` | `WORKSPACE_NOT_FOUND`, `MEMBER_NOT_FOUND` |
| `MEMBERS_DISABLE` | `400` | `MEMBER_VALIDATION_ERROR` |
| `MEMBERS_DISABLE` | `403` | `FORBIDDEN` |
| `MEMBERS_DISABLE` | `500` | `INTERNAL_ERROR` |
| `MEMBERS_REQUEST_MAGIC_LINK` | `404` | `WORKSPACE_NOT_FOUND` |
| `MEMBERS_REQUEST_MAGIC_LINK` | `400` | `MEMBER_VALIDATION_ERROR` |
| `MEMBERS_REQUEST_MAGIC_LINK` | `500` | `INTERNAL_ERROR` |

Note: `MEMBERS_LIST` and `MEMBERS_GET` return a generic `500` for any thrown error other than
`MemberNotFoundError` on the get route — neither route distinguishes further error categories today
(both `catch` blocks are a single generic branch, except `get-by-id.ts` which special-cases
`MemberNotFoundError`).

## 7) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles (rate-limit profile is `NONE` — documented as
      an as-built gap, not an oversight).
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md` and `ui.spec.md`.
