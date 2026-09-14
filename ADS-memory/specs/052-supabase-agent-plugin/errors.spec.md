# Error Code Registry Spec: supabase-agent-plugin

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-052`
- Feature: `FEAT-052-supabase-agent-plugin`
- Version: `1.0.0`
- Content Hash: `sha256:0000000000000000000000000000000000000000000000000000000000000`
- Last Edited: `2026-09-13T00:00:00Z`

## Purpose

Canonical error registry for the Supabase agent plugin's connect, scope-selection, and tool-call flows. Codes here are additive to (and must not duplicate) the existing generic External MCP / custom-credential error codes; this feature reuses those unmodified wherever they already cover a case.

## 1) Error Envelope (Base Payload)

All errors emitted by this feature reuse the existing assistant error envelope (unchanged):

```yaml
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null
details: object|null
```

## 2) Error Code Registry

| Code | Category | Layer (`api\|orchestrator\|ui\|integration`) | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `SUPABASE_OAUTH_DISCOVERY_FAILED` | auth | `integration` | 502 | no (triggers fallback, not a retry) | "We couldn't start Supabase login automatically. Use a personal access token instead." |
| `SUPABASE_OAUTH_CANCELLED` | auth | `ui` | 499 | yes (user may retry) | "Supabase login was cancelled. Try again when you're ready." |
| `SUPABASE_NO_PROJECT_SELECTED` | validation | `ui` | 400 | yes | "Pick a Supabase project to continue." |
| `SUPABASE_PROJECT_NOT_IN_ACCOUNT` | validation | `api` | 400 | no | "That project isn't available to this Supabase account." |
| `SUPABASE_TOKEN_INVALID` | auth | `api` | 401 | no (must submit a new token) | "That access token didn't work. Create a new one and try again." |
| `SUPABASE_TOKEN_REVOKED` | auth | `integration` | 401 | no (must reconnect) | "Your Supabase connection was revoked. Reconnect to keep using it." |
| `SUPABASE_TOOL_ID_NOT_REDEEMABLE` | authz | `api` | 403 | no | Not user-facing — indicates a missing `MCP_UI_REDEEMABLE_TOOL_IDS` entry; surfaced to operators/logs only. |
| `SUPABASE_WRITE_TOOL_NOT_ALLOWED` | authz | `api` | 403 | no | "This action needs write access. Ask an admin to allow it in Integrations." |
| `SUPABASE_UPSTREAM_UNAVAILABLE` | dependency | `integration` | 502 | yes | "Supabase is unavailable right now. Try again shortly." |
| `SUPABASE_UPSTREAM_TIMEOUT` | dependency | `integration` | 504 | yes | "Supabase took too long to respond. Try again." |
| `SUPABASE_DISCONNECTED` | resource | `api` | 409 | no (must reconnect) | "Supabase isn't connected. Connect it again to continue." |

## 3) Per-Code Details Schema

```yaml
SUPABASE_PROJECT_NOT_IN_ACCOUNT:
  details:
    submittedProjectRef: string

SUPABASE_WRITE_TOOL_NOT_ALLOWED:
  details:
    toolName: string
    connectionId: string

SUPABASE_UPSTREAM_UNAVAILABLE:
  details:
    dependencyName: "supabase-hosted-mcp"
    upstreamStatus: integer|null

SUPABASE_TOOL_ID_NOT_REDEEMABLE:
  details:
    toolId: string
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `SUPABASE_OAUTH_DISCOVERY_FAILED` | `ExternalMcpOAuthService.beginConnect` (existing, generic) | Agent chat response | Triggers the fallback path per REQ-08; not itself a dead end |
| `SUPABASE_NO_PROJECT_SELECTED` | `ProjectScopeForm` submit handler (new) | `ProjectScopeForm` inline validation + agent chat | Client-side guard first; server re-validates and returns the same code if bypassed |
| `SUPABASE_TOKEN_INVALID` | `AccessTokenForm` submit handler (new), via a probe call before sealing | `AccessTokenForm` outcome resource | Token is never sealed on this path — EC-03 |
| `SUPABASE_TOOL_ID_NOT_REDEEMABLE` | Existing `mcp-ui-tool-calls.ts` route (unmodified) | Server logs / operator diagnostics only | This code existing in production for a Supabase tool id is itself a release defect (REQ-07) |
| `SUPABASE_UPSTREAM_UNAVAILABLE` / `SUPABASE_UPSTREAM_TIMEOUT` | Federated tool-call layer (existing, generic) | Agent chat response (EC-07) | No plugin-specific retry logic is added |
| `SUPABASE_DISCONNECTED` | Federated tool-call layer, checked before dispatch | Agent chat response (REQ-14, EC-05) | Distinguishes "never connected" / "disconnected" from a live 401 (`SUPABASE_TOKEN_REVOKED`) |

## 5) Acceptance Checklist

- [x] Every error this feature's new code can emit appears in Section 2.
- [x] Every code has clear retry behavior (Section 2, "Retryable" column).
- [x] No `api.spec.md` exists for this feature (see `spec-manifest.md`); all codes here are cross-checked against `feature.spec.md`'s Edge Cases (EC-01–EC-07) instead.
- [x] User-safe message guidance is provided for every code a user can see; `SUPABASE_TOOL_ID_NOT_REDEEMABLE` is explicitly marked operator/log-only since a user should never be able to trigger it in a correctly shipped build.
