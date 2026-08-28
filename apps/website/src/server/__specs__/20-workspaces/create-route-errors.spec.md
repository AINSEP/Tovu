# Spec: Workspace Create Route Error Mapping

## Goal

Define how the workspace create route translates feature and transport failures into stable HTTP behavior.

## Error Mapping

### Unsupported Content Type

If the request uses an unsupported content type:

- shared category: `unsupported_content_type`
- HTTP `415`
- no workspace write is committed
- no outbox flush is triggered

### Transport Input Failure

If the request body is malformed JSON or `name` / `slug` are missing or non-string:

- shared category: `transport_input_error`
- HTTP `400`
- no workspace write is committed
- no outbox flush is triggered

### Domain Validation Failure

If the workspace feature rejects the request as invalid:

- shared category: `domain_validation`
- HTTP `422`
- no workspace write is committed
- no successful outbox flush is triggered

### Conflict Failure

If the workspace feature reports a slug conflict:

- shared category: `domain_conflict`
- HTTP `409`
- no duplicate workspace is created
- no successful outbox flush is triggered

### Unexpected Failure

If any unclassified error escapes:

- shared category: `unexpected_server_error`
- HTTP `500`
- internal details are not leaked in production-facing payloads
- structured logs retain the request ID and error classification data

### Post-Commit Delivery Failure

If the workspace write committed but the immediate outbox flush failed:

- do not map the outcome to generic `500`
- preserve the created workspace ID
- return the route's degraded-success contract:

```json
{
  "id": "workspace-id",
  "delivery": {
    "status": "degraded"
  }
}
```

## Response Shape

Target canonical shape:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {},
    "requestId": "string"
  }
}
```

Transition note:

- current runtime may temporarily use a simpler `{ "error": "message" }` payload
- the canonical envelope must eventually be enforced centrally across the server runtime
- shared category mapping is defined by `00-foundation/error-mapping.spec.md`

## Side-Effect Suppression Rules

- Validation and conflict failures must not publish `workspace.created`.
- Unexpected failures must not pretend the mutation succeeded.
- Post-commit delivery failure must not pretend the authoritative write never happened.
- Error mapping itself must not swallow telemetry or audit emission.

## Acceptance Checks

- Invalid JSON shape or missing required fields reach a stable `400` transport-input path.
- Semantically invalid workspace input reaches the route's explicit `422` `domain_validation` path.
- Workspace conflict reaches a stable `409` path.
- Unknown failures reach a stable `500` path.
- Post-commit delivery failure reaches a stable degraded-success path instead of generic `500`.
- Error responses are safe to expose to clients and useful to operators through logs.

## Non-goals (current)

- Designing the final global error code registry
- Defining user-facing localization for every error message
