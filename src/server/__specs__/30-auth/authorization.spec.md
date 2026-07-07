# Spec: Authorization

## Goal

Define how the server evaluates permissions before handler execution while keeping capability policy in reusable domain/core layers rather than hardcoded route logic.

## Model

Authorization must be capability-based and resource-aware.

The server should support:

- primitive capabilities
- resource-aware capabilities
- workspace-scoped permissions
- system-scoped permissions
- extension-declared permissions for controlled surfaces

## Route Contract

Every protected route must declare a permission callback or equivalent policy hook before the main handler runs.

Minimum callback contract:

```ts
type PermissionCallbackInput = {
  capabilityId: string;
  capabilityInputs: RequestContext["capabilityInputs"];
  resourceRef?:
    | {
        kind: string;
        id: string | null;
      }
    | null;
};

type PermissionDecision =
  | {
      outcome: "allow";
      policyCode: string;
    }
  | {
      outcome: "deny";
      policyCode: string;
      denyAs: "unauthenticated" | "unauthorized" | "not_found";
      auditNote?: string | null;
    };
```

The server route layer must not:

- branch on raw role names in ad hoc ways
- duplicate capability rules in each handler

The server route layer must:

- assemble the request context
- call the authorization surface
- map the result to HTTP behavior

## Status Semantics

- `401` when the request is unauthenticated
- `403` when the actor is authenticated but lacks permission
- `404` may be used only when the route explicitly opts into resource non-disclosure as part of the contract

## Audit

Permission-denied actions should emit auditable server events or logs containing:

- actor
- workspace/system scope
- attempted action
- policy decision result
- request ID

## Acceptance Checks

- Handlers do not own permission logic directly.
- Resource-aware permissions can distinguish between same-action calls on different resources.
- Authorization decisions are consistent across HTTP and protocol surfaces.
- Protected routes can share one permission callback contract instead of inventing route-local policy shapes.

## Non-goals (current)

- Full RBAC table definition
- Domain-specific permission matrices for every future module
