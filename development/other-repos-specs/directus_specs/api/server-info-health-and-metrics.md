# Directus Server Info, Health, And Metrics

**Source files analyzed:**
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/api/src/server.ts`
- `other-repos/directus/api/src/controllers/server.ts`
- `other-repos/directus/api/src/controllers/metrics.ts`
- `other-repos/directus/api/src/services/server.ts`
- `other-repos/directus/api/src/metrics/lib/use-metrics.ts`
- `other-repos/directus/api/src/metrics/lib/create-metrics.ts`
- `other-repos/directus/api/src/services/graphql/resolvers/system.ts`
- `other-repos/directus/packages/specs/src/openapi.yaml`
- `other-repos/directus/packages/specs/src/paths/server/info.yaml`
- `other-repos/directus/packages/specs/src/paths/server/ping.yaml`

---

## 1. Scope

This slice covers the server-facing introspection surface:

- `GET /server/info`
- `GET /server/health`
- `GET /server/ping`
- `GET /server/specs/oas`
- `GET /server/specs/graphql/:scope?`
- `POST /server/setup`
- `GET /metrics` when metrics are enabled

The runtime surface is broader than the packaged OpenAPI index. The static corpus currently only documents `/server/info` and `/server/ping`.

---

## 2. Mount Order And Gating

`api/src/app.ts` mounts `/server` as a normal HTTP router after the shared middleware stack has already been installed.

The effective order is:

1. auth middleware
2. schema middleware
3. query sanitization
4. cache middleware
5. built-in route families, including `/server`

Inside `api/src/server.ts`, websocket startup happens separately, so the server controller is part of the normal HTTP app lifecycle, not the upgrade path.

`/metrics` is conditionally mounted in `app.ts` only when `METRICS_ENABLED === true`.

---

## 3. Server Info

`api/src/controllers/server.ts` exposes `GET /server/info`, which delegates to `ServerService.serverInfo()`.

The response always includes:

- `project`
- `setupCompleted`

`project` is read from the singleton `directus_settings` record and includes fields such as:

- `project_name`
- `project_descriptor`
- `project_logo`
- `project_color`
- `default_appearance`
- `default_theme_light`
- `default_theme_dark`
- `theme_light_overrides`
- `theme_dark_overrides`
- `default_language`
- `public_foreground`
- `public_background.id`
- `public_background.type`
- `public_favicon`
- `public_note`
- `custom_css`
- `public_registration`
- `public_registration_verify_email`

When the requester has a user accountability, the response expands to include runtime settings:

- `mcp_enabled`
- `ai_enabled`
- `files.mimeTypeAllowList`
- `rateLimit`
- `rateLimitGlobal`
- `extensions.limit`
- `queryLimit`
- `websocket`
- `uploads`

The websocket block is itself conditional and mirrors the active websocket configuration:

- REST websocket auth mode and path
- GraphQL websocket auth mode and path
- heartbeat period
- collaborative editing enabled state
- logs websocket availability for admins

If the requester is a user, or setup is not complete, the response also includes `version`.

### 3.1 GraphQL parity

The same information is surfaced through the GraphQL system resolver as `server_info`.

That is useful because it confirms `ServerService.serverInfo()` is the canonical data source for both REST and GraphQL.

### 3.2 OpenAPI drift

`packages/specs/src/paths/server/info.yaml` still documents a `super_admin_token` query parameter, but the runtime controller does not read or enforce that parameter. The controller simply returns the service payload.

That is a stale packaged-contract detail, not a runtime requirement.

---

## 4. Health

`GET /server/health` is implemented in `api/src/controllers/server.ts`, but it is not present in the packaged OpenAPI corpus.

The controller:

- calls `ServerService.health()`
- sets `Content-Type: application/health+json`
- returns HTTP 503 when the service status is `error`
- disables caching for the response

`ServerService.health()` builds an API-health style object with:

- `status`
- `releaseId`
- `serviceId`
- `checks`

The checks aggregate results from:

- database
- cache
- rate limiter
- global rate limiter
- storage
- email

There is a runtime redaction rule here:

- admins get the full health document
- non-admins only get `{ status }`

That keeps operational details available to operators without exposing them to regular users.

---

## 5. Ping

`GET /server/ping` is mounted directly in `app.ts` and returns the literal string `pong`.

This route is present in the packaged OpenAPI document and is the simplest contract in the server family.

It exists independently of the `/server` router file, which is why the app bootstrap matters for understanding the real mount order.

---

## 6. Metrics

`GET /metrics` is only mounted when `METRICS_ENABLED === true`.

The controller requires one of two auth paths:

- admin accountability
- a `Metrics` bearer token that matches one of the configured `METRICS_TOKENS`

The response is:

- `text/plain`
- uncached
- meant for Prometheus-style scraping

`api/src/metrics/lib/use-metrics.ts` returns `undefined` when metrics are disabled, so the controller can exist without a metrics registry.

`api/src/metrics/lib/create-metrics.ts` shows the concrete instrumentation targets:

- database connection error counters
- database response time histograms
- cache connection error counters
- redis connection error counters
- storage connection error counters

It also has PM2 aggregation support, which means the text response can represent multiple worker processes rather than a single Node process.

---

## 7. Setup And Spec Routes

`api/src/controllers/server.ts` also includes:

- `GET /server/specs/oas`
- `GET /server/specs/graphql/:scope?`
- `POST /server/setup`

These are useful to understand because they show the server controller is also the specs and install-control surface.

The runtime OpenAPI and GraphQL spec endpoints are generated from live state, but they are not part of the packaged `packages/specs/src/openapi.yaml` document.

`/server/setup` is guarded by `ServerService.isSetupCompleted()`, and it is only meant for first-run initialization.

---

## 8. Notable Gaps

- The packaged OpenAPI corpus does not include `/server/health`.
- The packaged OpenAPI corpus does not include `/server/specs/oas` or `/server/specs/graphql/:scope?`.
- The packaged OpenAPI corpus does not include `/metrics`.
- The packaged `server/info` path file contains a stale parameter description that the runtime controller does not use.
- Health response shape is role-sensitive, so the full payload is not what every caller receives.

---

## 9. Tovu Reconstruction Notes

### 9.1 Why this exists

This subsystem exists to answer three different runtime questions:

- what can the current client know about the server
- whether the platform is healthy enough to operate
- what operators and infrastructure need for monitoring and setup control

Those are related, but they are not one endpoint and should not be modeled as one concern.

### 9.2 What Tovu should preserve

- Separate operator/infra health surfaces from ordinary app metadata
- Role-sensitive disclosure of operational detail
- Setup and spec endpoints as part of platform lifecycle, not ad hoc admin actions
- Metrics as an operational scrape surface with explicit enablement

### 9.3 What Tovu can simplify

- V1 can ship a smaller health/metrics surface than Directus
- Prometheus-grade metrics can come later if health/readiness semantics are already explicit
- Setup routes can be minimal if install state and readiness are still properly gated

### 9.4 Possible Tovu seams

- `src/core/ports/HealthCheckPort.ts` for readiness/health evaluation
- `src/core/ports/MetricsPort.ts` for metrics registry/scrape output
- `src/server/` for route exposure only, not health logic ownership

### 9.5 Suggested priority

- `V1`: server info, readiness/health, setup gating
- `Later`: richer operator metrics, live spec endpoints, more granular health disclosures
