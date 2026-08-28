# Spec: Server App Bootstrap

## Goal

Define how the server process boots, composes dependencies, mounts transport surfaces, and shuts down without leaking framework concerns into feature or core code.

This is Tovu's replacement for the "bootstrap chain + admin bootstrap + runtime initialization" responsibilities that WordPress handles across `wp-load.php`, `wp-settings.php`, and `wp-admin/admin.php`, but expressed as typed composition instead of file-by-file includes.

## Current Baseline

- Express is the active HTTP runtime.
- `app.ts` is the composition root.
- In-memory adapters are wired directly for the workspace slice and event flow.

## Bootstrap Phases

### 1. Process Configuration

At process start the server must resolve:

- environment and config schema
- logger
- clock
- ID generator
- feature flags
- transport runtime settings
- persistence adapter selection
- protocol adapter selection

The server must fail fast on missing or invalid required configuration.

### 2. Core Service Construction

The bootstrap layer constructs concrete adapters for:

- repositories
- outbox
- event bus
- auth/session services
- capability evaluation services
- media storage
- extension registry readers
- import/export pipelines
- protocol bridges

Construction happens in the composition root only.

### 3. Feature Wiring

The server wires feature use cases into transport handlers through explicit dependency objects.

The server may depend on:

- `src/contracts/core`
- `src/features`

Neither `src/contracts/core` nor `src/features` may depend back on `src/server`.

### 4. Middleware Installation

The server installs transport-wide middleware in a predictable order:

1. request ID / correlation bootstrap
2. proxy / host normalization
3. body parsing and upload parsing
4. auth extraction
5. workspace / tenant resolution
6. rate limiting / request policy
7. route dispatch
8. not-found handling
9. global error mapping

### 5. Route Surface Mounting

Routes must be mounted by transport context, not by framework convenience alone.

The canonical route groups are:

- ops
- auth
- admin
- content
- media
- extensions
- settings
- migration
- protocol surfaces

### 6. Startup Verification

Before accepting traffic, the server should be able to verify:

- route table is mounted
- critical adapters are present
- configuration is valid
- recovery / safe-mode state is known

### 7. Shutdown

The server must support graceful shutdown for:

- active HTTP requests
- open DB/storage handles
- outbox workers
- protocol streams
- telemetry flush

## Composition Rules

- The composition root may know concrete classes; feature code must not.
- No route handler may instantiate its own persistence or provider adapter.
- Middleware may enrich a request context; it may not own domain workflows.
- Background work must be delegated to workers or outbox-driven jobs, not hidden in route glue.
- SSR adapters such as Next.js may call server-side queries and commands, but they do not replace this bootstrap layer.

## Safe Mode And Recovery

The bootstrap layer must support a recovery posture for broken extensions or invalid runtime state.

Safe mode requirements:

- core routes for health, auth recovery, and admin recovery stay available
- broken extensions can be excluded from activation
- the server can boot with reduced capability while preserving operator access
- recovery state is visible to admin consumers and audit logs

## Acceptance Checks

- The server can boot with different transport adapters without changing feature code.
- The server can swap persistence adapters without changing route contracts.
- The server can start in safe mode without executing extension-owned runtime hooks.
- A startup misconfiguration fails before traffic is accepted.
- Route mounting order and shutdown behavior are deterministic and testable.

## Non-goals (current)

- Choosing the final long-term transport beyond the current Express baseline
- Defining business semantics for content, media, or extensions
- Defining worker retry internals
