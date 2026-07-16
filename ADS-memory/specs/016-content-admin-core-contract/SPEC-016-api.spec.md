# API Contract Spec: content-admin-core-contract

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-016`
- Feature: `FEAT-016-content-admin-core-contract`
- Version: `1.4.0`
- Content Hash: `sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f`
- Last Edited: `2026-07-15T05:00:00Z`

## Purpose

This file defines the generic, parameterized route shape and agent-tool catalog shape for the
gated-mutation gateway (`plan → confirm → execute`) that SPEC-017 (Storage/Timeline) and SPEC-019
(Backups/Recovery) both instantiate for their own destructive operations. `{domain}` and
`{action}` are placeholders a dependent spec fills in (e.g. `storage`/`migrate-forward`,
`recovery`/`restore`) — this file defines the shape every instantiation must follow, not any one
concrete route.

**Note on REQ-14/AC-21 (idempotency-vs-authorize precedence):** this file's three endpoints do not
themselves accept an idempotency-key request field — `GATEWAY_EXECUTE`'s single-use confirmation
token already provides equivalent replay protection (`TOKEN_ALREADY_REDEEMED`). REQ-14 is a generic
cross-cutting precedence rule for any dependent-domain mutating endpoint that does accept an
idempotency key; that field and its own request contract belong in the dependent domain's own
`api.spec.md`, not here. REQ-14 itself is a restatement of an `authorize()`-ordering property ADR-021
defines as part of `authorize()`'s own contract, surfaced here for convenience because the gateway's
own check ordering depends on it — this file does not originate the rule independently of ADR-021.

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `GATEWAY_PLAN` | `POST` | `/api/admin/v1/{domain}/{action}/plan` | Read-only preview of a gated mutation; no durable state change | `AUTH_GATEWAY_READ` | `GATED_READ` |
| `GATEWAY_CONFIRM` | `POST` | `/api/admin/v1/{domain}/{action}/confirm` | Human-only acknowledgment step; mints a single-use confirmation token | `AUTH_GATEWAY_CONFIRM` | `GATED_WRITE` |
| `GATEWAY_EXECUTE` | `POST` | `/api/admin/v1/{domain}/{action}/execute` | Redeems a confirmation token and runs the gated mutation | `AUTH_GATEWAY_EXECUTE` | `GATED_WRITE` |

Worked concrete example (from ADR-041 §3, owned in full by SPEC-017, shown here only to prove this
shape is instantiable): `POST /api/admin/v1/storage/migrate-forward/plan`,
`POST /api/admin/v1/storage/migrate-forward/confirm`,
`POST /api/admin/v1/storage/migrate-forward/execute`.

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Principal Kinds | Notes |
|---|---|---|---|---|---|
| `AUTH_GATEWAY_READ` | `true` | Session cookie, Bearer API key, or agent delegation token | `{domain}.read` | `user, agent, api_key` | REQ-09 — plan is safely callable by any principal kind holding the permission |
| `AUTH_GATEWAY_CONFIRM` | `true` | Session cookie only | `{domain}.{mutating-verb}` (e.g. `storage.migrate`, `backup.restore`) | `user` only | REQ-10 — `authorize()` evaluated at mint time; no other principal kind may call this endpoint at all |
| `AUTH_GATEWAY_EXECUTE` | `true` | Session cookie, Bearer API key, or agent delegation token | `{domain}.{mutating-verb}` | `user, agent, api_key` — subject to the actor-class redemption rule (REQ-13) | REQ-11 — `authorize()` is re-evaluated fresh at this call, never cached from the confirm-time evaluation |

## 3) Rate Limit Profiles

Gated mutations are rare, human-paced, high-stakes operations, not high-volume list/read traffic.
The values below are a conservative Spec Agent default (a `SAFE DEFAULT` NFR assumption, not a
value stated by ADR-041/043/044/045) — the owning domain spec (SPEC-017/SPEC-019) may tighten
these further but should not need to loosen them.

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `GATED_READ` | `60` | `60` | `10` | `principalId` | `plan()` is read-only; generous headroom for agent polling |
| `GATED_WRITE` | `60` | `5` | `0` | `principalId` | `confirm()`/`execute()` are rare, high-stakes calls; no burst allowance by design |

## 4) Request Contracts

### Endpoint: `GATEWAY_PLAN` (`POST /api/admin/v1/{domain}/{action}/plan`)
- Path Params:
```yaml
{}
```
- Query Params:
```yaml
{}
```
- Headers:
```yaml
Authorization: "Bearer <token>"    # or an authenticated session cookie
Content-Type: "application/json"
```
- Body: domain-specific plan input parameters are defined by the owning dependent spec's own
  `api.spec.md`. This core contract requires only that the caller's identity and permission
  context (`workspaceId`, `actorId`, resolved principal `kind`) be resolvable from the
  authenticated session/token — no body field is required by this contract itself.
```yaml
{}
```

### Endpoint: `GATEWAY_CONFIRM` (`POST /api/admin/v1/{domain}/{action}/confirm`)
- Body:
```yaml
planId:
  type: string
  format: ulid
  required: true
planHash:
  type: string
  pattern: "^sha256:[0-9a-f]{64}$"
  required: true
```

### Endpoint: `GATEWAY_EXECUTE` (`POST /api/admin/v1/{domain}/{action}/execute`)
- Body:
```yaml
confirmationToken:
  type: string
  required: true
```

## 5) Response Contracts

### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `GATEWAY_PLAN` | `200` | `GatewayPlanResponse` | No durable state change (REQ-09) |
| `GATEWAY_CONFIRM` | `200` | `GatewayConfirmResponse` | Mints a single-use token (REQ-10) |
| `GATEWAY_EXECUTE` | `200` | Domain-defined result payload (see the owning dependent spec) | Runs the gated mutation exactly once on success |

### Contract Definitions
```yaml
GatewayPlanResponse:
  planId: { type: string, format: ulid }
  planHash: { type: string, pattern: "^sha256:[0-9a-f]{64}$" }
  domain: { type: string, example: "storage.migrate" }
  createdAt: { type: string, format: date-time }
  details: { type: object }   # domain-defined preview payload — see the owning dependent spec's api.spec.md

GatewayConfirmResponse:
  confirmationToken: { type: string }
  expiresAt: { type: string, format: date-time }   # createdAt + 600 seconds (exact, no jitter), REQ-10
  boundTo:
    planHash: { type: string }
    scopeId: { type: string }               # e.g. siteId or workspaceId; domain-defined
    confirmerPrincipalId: { type: string }
```

## 6) Error Mapping

Reference canonical codes in `errors.spec.md`.

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `GATEWAY_PLAN` | `401` | `UNAUTHENTICATED` |
| `GATEWAY_PLAN` | `403` | `FORBIDDEN` |
| `GATEWAY_PLAN` | `429` | `RATE_LIMIT_EXCEEDED` |
| `GATEWAY_CONFIRM` | `400` | `VALIDATION_ERROR` |
| `GATEWAY_CONFIRM` | `401` | `UNAUTHENTICATED` |
| `GATEWAY_CONFIRM` | `403` | `FORBIDDEN` |
| `GATEWAY_CONFIRM` | `429` | `RATE_LIMIT_EXCEEDED` |
| `GATEWAY_EXECUTE` | `400` | `VALIDATION_ERROR` |
| `GATEWAY_EXECUTE` | `401` | `UNAUTHENTICATED` |
| `GATEWAY_EXECUTE` | `403` | `FORBIDDEN` |
| `GATEWAY_EXECUTE` | `409` | `PLAN_STALE, TOKEN_ALREADY_REDEEMED` |
| `GATEWAY_EXECUTE` | `410` | `TOKEN_EXPIRED` |
| `GATEWAY_EXECUTE` | `429` | `RATE_LIMIT_EXCEEDED` |
| `GATEWAY_EXECUTE` | `500` | `INTERNAL_ERROR` |

## 7) Agent Tool Catalog Contract

Every domain implementing this gateway registers its tools using this naming convention and
callability rule (REQ-22), matching ADR-021 §3's flat-dotted-string permission house style and
ADR-041 §6's concrete tool catalog (`storage_get_health`, `storage_plan_migrate_forward`,
`storage_execute_migrate_forward`, `backup_create_restore_point`, `storage_get_restore_guidance`,
`recovery_restore_to`).

```yaml
AgentToolDefinition:
  name: string            # "{domain}_plan_{action}" | "{domain}_execute_{action}" | a pure-read tool name
  description: string
  params: object           # JSON-schema-shaped, domain-defined
  returns: object           # JSON-schema-shaped, domain-defined
  sideEffects: enum[none, mutates-durable-state, mints-token]
  authorization:
    permission: string      # e.g. "storage.read", "storage.migrate", "backup.restore"
    deniesIfMissing: "FORBIDDEN"
  actorClassRule: enum[confirmer-must-equal-own-delegatedBy, user-only, none]
```

Rules:
- A `{domain}_plan_{action}` tool MUST exist, MUST be agent-callable, MUST require only
  `{domain}.read`, and MUST have `sideEffects: none`.
- A `{domain}_execute_{action}` tool MUST exist, MUST be agent-callable, MUST require
  `{domain}.{mutating-verb}`, MUST have `sideEffects: mutates-durable-state`, and MUST carry
  `actorClassRule: confirmer-must-equal-own-delegatedBy` (REQ-13).
- No tool in the catalog may perform the `confirm()` step — there is no
  `{domain}_confirm_{action}` tool, ever. An agent that needs a human to confirm receives a
  routing/guidance tool instead (e.g. `storage_get_restore_guidance`), never a lever.

## 8) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md`, `orchestrator.spec.md`. (No `ui.spec.md` exists — see `spec-manifest.md`.)
