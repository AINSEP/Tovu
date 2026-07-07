# Spec: Transport Error Mapping

## Goal

Define the central transport error categories and how they map into HTTP responses.

This spec exists so routes do not hand-roll incompatible `instanceof` trees and so post-commit delivery failures are not accidentally reported as if the authoritative write failed.

## Current Baseline

- The current runtime still emits minimal `{ "error": "message" }` payloads.
- Route-specific error mapping exists for workspace creation, but there is no shared contract yet.

## Canonical Error Categories

The server should classify transport-visible failures into at least:

- `transport_input_error`
- `unsupported_content_type`
- `unauthenticated`
- `unauthorized`
- `not_found`
- `domain_validation`
- `domain_conflict`
- `rate_limited`
- `post_commit_delivery_failure`
- `unexpected_server_error`
- `recovery_mode_limitation`

## Mapping Principles

- Domain validation must not become generic `500`.
- Domain conflict must not become generic `500`.
- Unsupported transport input must fail before business logic is blamed.
- Post-commit delivery failure must not share the same response path as pre-commit command failure.

## Canonical Error Envelope

The target envelope is:

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

`details` must always be a JSON-serializable object. Use an empty object when there is nothing structured to attach.

Transition note:

- current runtime may temporarily emit simpler payloads
- centralized mapping should own migration to the canonical envelope

## Status Mapping Defaults

- `transport_input_error` -> `400`
- `unsupported_content_type` -> `415`
- `unauthenticated` -> `401`
- `unauthorized` -> `403`
- `not_found` -> `404`
- `domain_validation` -> `422`
- `domain_conflict` -> `409`
- `rate_limited` -> `429`
- `unexpected_server_error` -> `500`
- `recovery_mode_limitation` -> `503`

## Post-Commit Delivery Failure

`post_commit_delivery_failure` is special:

- the authoritative command already succeeded
- the response must preserve that fact
- the route must not emit a plain generic `500` as if the mutation failed before commit

Each Category B route must choose one explicit contract:

- degraded success response that preserves the creation/update result
- accepted recovery response that preserves the authoritative result and shifts follow-up handling into async recovery

The shared delivery vocabulary is:

```ts
type DeliveryOutcome = {
  status: "delivered" | "degraded" | "accepted";
  jobId?: string | null;
};
```

Default mapping rule:

- `post_commit_delivery_failure` is a classification for logs, telemetry, and route-level branching
- it does not default to the canonical error envelope
- Category B routes should preserve a `2xx` success-class response and set `delivery.status = "degraded"` unless the route explicitly adopts the accepted-recovery pattern
- accepted-recovery routes return `202` and include job-tracking data

For the current workspace create route, the target first-tranche behavior is:

- HTTP `201`
- authoritative resource ID preserved
- machine-readable delivery degradation marker in the response body

## Route Override Rule

Routes may specialize mapping details, but they must do so from these shared categories rather than inventing unrelated error taxonomies.

Route overrides are allowed only when the route spec explicitly:

- references the shared category being specialized
- names the alternate status or success-class pattern
- explains why the shared default is not being used

## Acceptance Checks

- Route-level error specs can reference shared categories instead of redefining them.
- Post-commit delivery failure is distinguishable from command failure.
- Error mapping is central, testable, and correlation-aware.
- Shared defaults do not leave route families with ambiguous status selection.

## Non-goals (current)

- Final localized user-facing message catalog
- Final incident-management workflow for every degraded-success response
