# Spec: HTTP Runtime Contract

## Goal

Define the canonical request/response behavior for the server boundary regardless of whether the active runtime is Express, Fastify, Hono, Next route handlers, or another adapter.

## Current Baseline

- JSON requests are parsed through Express middleware.
- Health and workspace routes return plain JSON.
- Error responses are currently minimal.

## Canonical Request Pipeline

Every incoming request must pass through these phases:

1. request ID generation or propagation
2. proxy and host normalization
3. method/path normalization
4. content-type and body parsing
5. auth extraction
6. request-context assembly
7. permission evaluation
8. handler dispatch
9. response serialization
10. audit/log emission

## Request Context

Handlers must receive a transport-safe request context containing:

- request ID
- correlation ID
- actor identity, if present
- workspace/system scope
- locale, if present
- feature flags relevant to the request
- request origin metadata
- transport-level capability decision inputs

The canonical request-context shape and lifecycle are defined by `00-foundation/request-context.spec.md`.

Route handlers must not pull raw framework globals directly when the request context already contains the normalized value.

## Content Types

The runtime must explicitly support:

- JSON for API/admin mutations
- query-string driven reads
- multipart upload flows for media
- streaming or chunked responses where protocol surfaces need them

Unsupported content types must fail explicitly with a stable error code.

## Response Rules

### Success

Success payloads may vary by resource, but all success responses must be:

- JSON-serializable unless the route explicitly defines another format
- tagged with request correlation headers
- consistent about pagination/meta where relevant

Mutation routes that use Category B or Category C lifecycle rules must also expose the delivery or job outcome defined by `10-ops/command-lifecycle.spec.md` and `80-platform/tenancy-and-jobs.spec.md`.

### Errors

The canonical target error envelope is:

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

`details` must be a JSON-serializable object, not an arbitrary string or framework error dump.

Transition note:

- current routes may temporarily emit `{ "error": "message" }`
- new route specs should target the canonical envelope
- migration to the canonical envelope should be done centrally, not route-by-route with ad hoc shapes

Shared category mapping is defined by `00-foundation/error-mapping.spec.md`.

## Status Mapping

- `200` for successful reads
- `201` for successful creation
- `202` for accepted long-running async initiation
- `204` for successful no-body operations
- `400` for malformed or invalid transport input
- `400` is reserved for `transport_input_error`
- `401` for unauthenticated requests
- `403` for authenticated but unauthorized requests
- `404` for resource or route absence where disclosure is allowed
- `409` for state conflicts
- `415` for unsupported content type
- `422` for semantically invalid but well-formed input unless a route explicitly overrides the shared `domain_validation` default
- `429` for request throttling
- `500` for unclassified server errors
- `503` for maintenance or recovery mode limitations

## Logging And Correlation

Every request must produce structured logs that include:

- request ID
- route identifier
- actor/workspace identifiers when known
- response status
- latency
- error code when applicable

The runtime must not log secrets, raw credentials, or unsafe personal data by default.

## Framework-Swap Constraints

- Route logic must not depend on Express request/response types outside the adapter layer.
- Body parsing, cookie extraction, and header mapping must be adapter-replaceable.
- Response serialization must be definable without changing feature code.
- SSR adapters may reuse query handlers, but client components must only receive DTO/view-model data.

## Acceptance Checks

- The same route contract can be served by another HTTP adapter with only transport-layer changes.
- Error mapping is central and testable.
- Request correlation survives through command handling and async handoff.
- Unsupported input shapes fail consistently.

## Non-goals (current)

- Finalizing pagination style for all future APIs
- Defining every future resource envelope in this file
