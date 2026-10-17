# error-mapping Overview

Owns Tovu's domain-to-HTTP classification policy. The generic envelope,
serializer and default status mapping already belong to Jini; call them rather
than implementing another version here.

## Contract to adopt

Source: `development/todos.md:1514`, triage s4-59 (2026-10-17).
Status: contract documented; route-family migration is **not implemented**.

`@jini-ai/protocol` owns `ApiErrorResponse` and `ApiError`:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "workspace was not found",
    "requestId": "proxy-request-123"
  }
}
```

`details` (JSON), `retryable` (boolean), and `requestId` (string) are optional
fields inside `error`. `@jini-ai/http-kit` exports `createCompatApiError`,
`sendApiError` and `statusForError`; the installed package already supplies them.
Use `res.locals.requestId` from request tracking for correlation, matching the
response's `x-request-id`. Never mint a second id during error translation.

The existing Jini status taxonomy includes:

| Class / code | HTTP status | Caller interpretation |
|---|---|---|
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Authenticated but action denied |
| `NOT_FOUND` | 404 | Resource absent or outside the workspace |
| `CONFLICT` | 409 | State conflicts with the requested operation |
| `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | 413 / 415 | Request transport rejected |
| `VALIDATION_FAILED` | 422 | Well-formed input fails validation |
| `RATE_LIMITED` | 429 | Respect the server's retry policy |
| `INTERNAL_ERROR` | 500 | Unexpected failure; caller-safe message only |
| `UPSTREAM_UNAVAILABLE` / `SERVICE_UNAVAILABLE` | 502 / 503 | Dependency or capability unavailable |

Unknown codes default to 500 in Jini. Domain-owned codes remain permitted by
Jini's open code type; preserve an established domain status contract explicitly
rather than assuming a generic default fits it. `retryable` is not permission
to retry a mutation without its existing idempotency contract. Never serialize a
raw exception, stack, SQL, credentials or unreviewed domain payload into `details`.

## First family and migration prerequisite

The bounded pilot is the analytics admin family, currently the single route
`GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits` (registered by
`runtime/composition/modules/analytics.ts`). Its workspace miss, authorization
denial and unexpected failure map to `NOT_FOUND`, `FORBIDDEN`, `INTERNAL_ERROR`.
Success, workspace-check ordering and authorization policy must stay intact.
Auth/session and recovery-gate middleware are separate migration surfaces.

Do not convert the route until the shared client understands both formats:
`apps/admin/src/lib/api.ts`'s `buildRequestFailedError` currently calls
`String(body.error)` and reads only top-level `body.code`. A nested envelope
would display `[object Object]` and lose its code. Its session-invalidity logic
also relies on the legacy `UNAUTHENTICATED` code; preserve that behavior during
any later auth migration. A generic compatible decoder belongs in Jini first;
this session cannot write the sibling Jini checkout. Coordinator must assign
that owner/adoption slice before the pilot, including decoder and route tests.

The route tests live in `server/__tests__/routes/analytics-recent-hits.test.ts`;
`server/__tests__/route-async-guards.test.ts` also asserts its legacy 500 shape.
Change these assertions with the pilot, retaining opacity and status checks.

## Remaining surfaces

After analytics, the admin families still to review/migrate are: agent-plugins,
api-keys, assistant, change-sets, comments, commerce, content, content-types,
database, database-recovery, deployments, entries, external-mcp, forms, fs-files,
integrations, media, members, menus, newsletter, pages, plugins, posts,
presentation, publish-content, recovery, redirects, seo, settings, site, sites,
skills, system, taxonomy, themes, trash, users, widgets and workspace.

Public families are content, external-mcp, members, oauth, ops, publish-trust and
site. Include shared auth/authorization, serving gates, body-parser errors,
fallback 404/500 handlers and plugin-contributed routes in the inventory.
Inspect each contract: streamed/SSE errors and protocol-owned OAuth/MCP failures
must retain their owning protocol's wire format. This is an inventory, not a
claim that every listed surface currently returns a legacy JSON error.
