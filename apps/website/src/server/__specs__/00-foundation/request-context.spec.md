# Spec: Request Context Contract

## Goal

Define the normalized request context that `src/server` assembles once and passes through transport handlers.

This spec exists so routes do not invent their own ad hoc mixtures of framework globals, auth state, workspace state, and correlation metadata.

## Current Baseline

- The current Express baseline does not yet materialize a first-class request-context object.
- The runtime spec already assumes request-context assembly exists.

## Ownership

`src/server` owns the transport-safe request context shape.

It must:

- normalize framework-specific request data
- attach correlation metadata
- attach auth and scope state
- provide capability-evaluation inputs

It must not:

- leak raw framework request/response objects into feature code
- force features to pull values from globals or headers directly

## Canonical Shape

Every non-trivial route handler should be able to receive a context containing:

- `requestId`
- `correlationId`
- `actor`
- `authn`
- `scope`
- `locale`
- `featureFlags`
- `origin`
- `capabilityInputs`

The contract should be explicit and immutable:

```ts
type RequestContext = Readonly<{
  requestId: string;
  correlationId: string;
  actor: {
    mode: "anonymous" | "human" | "service";
    actorId: string | null;
    authMethod: "none" | "session" | "bearer_jwt" | "api_key" | "service_token";
  };
  authn: {
    state: "missing" | "resolved" | "rejected";
    scheme: "session" | "bearer_jwt" | "api_key" | "service_token" | null;
    subjectId: string | null;
  };
  scope: {
    mode: "system" | "workspace" | "unresolved";
    workspaceId: string | null;
    resolutionState: "resolved" | "unresolved" | "unknown";
  };
  locale: string | null;
  featureFlags: Record<string, boolean>;
  origin: {
    host: string | null;
    forwarded:
      | {
          for: string[];
          proto: string | null;
          host: string | null;
        }
      | null;
    userAgent: string | null;
    clientClass: "browser" | "api_client" | "service" | "unknown";
  };
  capabilityInputs: {
    method: string;
    path: string;
    routeId: string | null;
    actorMode: "anonymous" | "human" | "service";
    actorId: string | null;
    workspaceId: string | null;
    scopeMode: "system" | "workspace" | "unresolved";
    authMethod: "none" | "session" | "bearer_jwt" | "api_key" | "service_token";
    clientClass: "browser" | "api_client" | "service" | "unknown";
    locale: string | null;
    featureFlags: Record<string, boolean>;
  };
}>;
```

### Actor

The actor section should capture:

- anonymous, human, or service identity mode
- stable actor ID when known
- auth method summary when relevant

`actor` answers "who is acting from the server's point of view?" even if the request later fails authn or authorization checks.

### Authn

The authn section should capture:

- whether authentication data was missing, resolved, or rejected
- the normalized auth scheme when one was presented
- the resolved subject ID when authentication succeeded

`authn` answers "what happened during authentication resolution?" and is intentionally separate from `actor`.

### Scope

The scope section should capture:

- system or workspace mode
- resolved workspace ID when known
- unresolved or unknown scope state when resolution has not happened yet

### Origin

The origin section should capture transport-level metadata such as:

- host
- forwarded/proxied request metadata once normalized
- user agent or client class when relevant

### Capability Inputs

Capability evaluation should read from normalized context inputs, not raw request objects.

This contract exists so permission callbacks can be deterministic across HTTP and protocol adapters without re-reading framework globals.

## Lifecycle

The request context lifecycle is:

1. request enters transport
2. request/correlation IDs are resolved
3. auth is extracted
4. scope is resolved or marked unresolved
5. request context is assembled by transport middleware before permission evaluation
6. context is frozen or otherwise treated as immutable for handler use
7. route-local derived metadata lives in separate local variables or wrapper objects, not by mutating `RequestContext`

## Normalization Rules

- `requestId` must always exist.
- `correlationId` must always exist and reuses `requestId` when no upstream value exists.
- Missing auth state must be explicit, not inferred from missing fields later.
- Missing scope state must be explicit, not guessed inside route handlers.
- Route handlers must prefer context values over raw framework globals once the value exists in context.

## Acceptance Checks

- Route handlers can rely on one normalized source for actor, scope, and correlation data.
- Auth, admin, content, and extension routes can reuse the same context contract.
- Feature code remains transport-agnostic because only transport-safe values cross the boundary.

## Non-goals (current)

- Final auth provider choice
- Final tenant-resolution algorithm for every future route
