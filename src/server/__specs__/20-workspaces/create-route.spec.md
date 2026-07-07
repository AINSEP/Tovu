# Spec: Workspace Create Route

## Goal

Expose the workspace creation slice through HTTP without moving workspace business rules into the transport layer.

## Endpoint

`POST /workspaces`

## Request Shape

Content type:

- `application/json`

Request body:

```json
{
  "name": "string",
  "slug": "string"
}
```

Transport responsibilities:

- read JSON body
- reject missing or non-string `name` and `slug` values as `transport_input_error`
- reject unsupported content types as `unsupported_content_type`
- pass typed request values to the feature command

Domain responsibilities remain in the workspace feature spec.

## Transport Orchestration

The server route must:

1. parse the body
2. invoke `createWorkspace`
3. if the command succeeds, run the outbox flush once for that request
4. if the write committed but the flush failed, serialize the route's degraded-success response
5. otherwise serialize the normal success response

This route is a `Category B: Write Commit Plus Immediate Delivery Attempt` route as defined by `10-ops/command-lifecycle.spec.md`.

The route must not:

- implement slug validation itself
- perform uniqueness checks itself
- emit domain events directly

## Success Response

On normal success:

- HTTP `201`
- response body:

```json
{
  "id": "workspace-id",
  "delivery": {
    "status": "delivered"
  }
}
```

On post-commit delivery failure:

- HTTP `201`
- response body:

```json
{
  "id": "workspace-id",
  "delivery": {
    "status": "degraded"
  }
}
```

## Side Effects

On successful command completion:

- the workspace slice enqueues `workspace.created`
- the route triggers the transport-side outbox flush
- route completion must not require knowledge of downstream subscribers
- if the flush fails after commit, the route preserves the created workspace ID and reports degraded delivery instead of generic mutation failure

## Feature Dependencies

This route depends on:

- workspace feature command contract
- workspace repo port implementation
- outbox contract
- event bus delivery mechanism

## Acceptance Checks

- Post-commit flush failure still returns `201` with `{ id, delivery: { status: "degraded" } }`.
- Valid input returns `201` with `{ id, delivery: { status: "delivered" } }`.
- The route calls the workspace feature rather than reimplementing workspace rules.
- A successful request triggers outbox processing once.
- Failed requests do not flush the outbox as if the command succeeded.
- A post-commit flush failure does not return the same response path as if the workspace write failed.

## Non-goals (current)

- Authentication or authorization
- Workspace read/list/update/delete routes
- Multi-tenant host-based workspace resolution
- Persistent DB-specific behavior beyond the route contract
