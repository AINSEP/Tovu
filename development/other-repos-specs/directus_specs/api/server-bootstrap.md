# Directus API Server Bootstrap

**Source files analyzed:**
- `other-repos/directus/api/src/start.ts`
- `other-repos/directus/api/src/server.ts`
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/api/src/controllers/server.ts`
- `other-repos/directus/api/src/services/server.ts`

---

## 1. Purpose

These files define how Directus:

- starts the HTTP runtime
- validates the runtime environment
- initializes database, storage, auth providers, extensions, and flows
- constructs the Express middleware sequence
- mounts all API families
- serves the admin app
- emits request/response telemetry
- exposes server metadata and health checks
- shuts down cleanly

This is the Directus equivalent of a combined application bootstrap, front controller, and server lifecycle layer.

---

## 2. Entry Point

`api/src/start.ts` is intentionally minimal:

1. import `startServer` from `server.ts`
2. invoke `startServer()`

All real boot logic starts in `server.ts`.

---

## 3. Server Creation

`createServer()` in `api/src/server.ts` performs these steps:

1. `await createApp()` to obtain the configured Express application
2. create an HTTP server around that app
3. merge any `SERVER_*` env-derived Node server options onto the server object
4. attach request-level instrumentation that:
   - times the request
   - computes bytes in/out per socket
   - derives protocol, URL, path, host, headers, query, and client IP
   - emits a `response` action through the Directus emitter
5. optionally create websocket controllers and start websocket handlers when `WEBSOCKETS_ENABLED === true`
6. install Terminus shutdown hooks

### 3.1 Request instrumentation

Every request gets post-response instrumentation on `finish` or `close`.

The emitted payload includes:

- whether the response finished or closed early
- request method
- full and parsed URL
- protocol
- host
- request size
- parsed query
- request headers
- response status
- response size
- response headers
- client IP
- request duration in milliseconds

This is not simple access logging. It is a structured event emitted with:

- database handle
- resolved schema
- accountability context when available

---

## 4. Pre-Express Validation In `createApp()`

Before Directus even instantiates the Express app, `api/src/app.ts` performs runtime gates:

1. validate database connection
2. ensure Directus tables are installed
3. warn if migrations are not fully applied
4. warn when `SECRET` is missing
5. warn when `SECRET` is shorter than 32 bytes
6. warn when `PUBLIC_URL` is not absolute
7. validate database extensions
8. validate storage
9. register auth providers
10. register deployment drivers
11. initialize the extension manager
12. initialize the flow manager

The installed-table check is a hard process exit:

- if the database does not have Directus tables, Directus logs an error and exits

This means the server will not start as a partially-booted API against an uninitialized schema.

---

## 5. Express Application Setup

After initialization, `createApp()` builds the Express app and configures the baseline runtime:

- disable default `x-powered-by`
- set `trust proxy` from env
- override Express query parsing with `qs.parse`, using env-controlled depth and array limits
- optionally enable pressure limiter middleware
- configure Helmet CSP and optional HSTS

### 5.1 Content Security Policy

The CSP configuration is notable because it explicitly allows extension-hostile behavior that Directus needs:

- `scriptSrc` includes `'unsafe-eval'`
- `workerSrc` and `childSrc` include `blob:`
- `connectSrc` allows `'self'`, `https://*`, and `wss://*`

The comment in source is explicit: unsafe-eval is required for app extensions.

This is an architectural clue that extension support is a first-class product requirement, not an afterthought.

---

## 6. Middleware Order

The middleware sequence in `app.ts` matters and should be treated as a contract.

The inspected order is:

1. emitter hook: `app.before`
2. emitter hook: `middlewares.before`
3. structured Express logger
4. custom `X-Powered-By: Directus` response header
5. optional CORS middleware
6. JSON body parser with `MAX_PAYLOAD_SIZE`, wrapped so parser failures become `InvalidPayloadError`
7. `cookieParser()`
8. token extraction middleware
9. root redirect route (`GET /`) when `ROOT_REDIRECT` is configured
10. `GET /robots.txt`
11. optional admin app serving under `/admin`
12. global rate limiter, if enabled
13. per-IP rate limiter, if enabled
14. `GET /server/ping` returning `pong`
15. authentication middleware
16. schema resolution middleware
17. query sanitization middleware
18. cache middleware
19. emitter hook: `middlewares.after`
20. emitter hook: `routes.before`
21. all mounted route families
22. custom endpoint router from extension manager
23. not found handler
24. error handler
25. emitter hook: `routes.after`
26. retention schedule boot
27. telemetry schedule boot
28. TUS schedule boot
29. metrics schedule boot
30. project schedule boot
31. emitter hook: `app.after`

The most important ordering facts are:

- authentication runs before schema, sanitizeQuery, and cache
- schema resolution runs before any controller uses `req.schema`
- sanitizeQuery runs before controllers read `req.sanitizedQuery`
- custom extension endpoints are mounted after built-in routes
- not found and error handling are terminal

---

## 7. Route Registration

The inspected built-in route prefixes mounted in `app.ts` are:

- `/auth`
- `/graphql`
- `/activity`
- `/access`
- `/assets`
- `/collections`
- `/comments`
- `/dashboards`
- `/deployments`
- `/extensions`
- `/fields`
- `/files`
- `/flows`
- `/folders`
- `/items`
- `/mcp` when enabled
- `/ai/chat` when enabled
- `/metrics` when enabled
- `/notifications`
- `/operations`
- `/panels`
- `/permissions`
- `/policies`
- `/presets`
- `/translations`
- `/relations`
- `/revisions`
- `/roles`
- `/schema`
- `/server`
- `/settings`
- `/shares`
- `/users`
- `/utils`
- `/versions`

The TUS upload endpoint is mounted specially:

- `/files/tus` only when `TUS_ENABLED === true`

---

## 8. Admin App Serving

When `SERVE_APP` is enabled, the API serves the compiled admin app:

1. resolve the installed `@directus/app` entry HTML
2. compute admin base URL from `PUBLIC_URL`
3. retrieve embed fragments from the extension manager
4. inject:
   - `<base href=".../admin/">`
   - extension head markup
   - extension body markup
5. serve `/admin`
6. serve static assets under `/admin`
7. serve the same HTML for `/admin/*`

Static assets are served with:

- `Cache-Control: max-age=31536000, immutable`
- `Vary: Origin, Cache-Control`

The HTML shell itself is served with:

- `Cache-Control: no-cache`

---

## 9. Server Metadata Endpoints

### 9.1 `GET /server/ping`

Defined directly in `app.ts`, not in `controllers/server.ts`.

Behavior:

- returns plain `pong`

This is the shallow liveness endpoint.

### 9.2 `GET /server/info`

`ServerService.serverInfo()` builds a conditional metadata object including:

- project settings payload
- `setupCompleted`
- version, in some contexts
- `mcp_enabled`
- `ai_enabled`
- file MIME allow-list
- rate limit configuration
- extension limit configuration
- query limits
- websocket configuration
- upload constraints

Much of this extra detail only appears when `accountability.user` is present.

### 9.3 `GET /server/health`

This uses `application/health+json` and returns:

- status only for non-admin callers
- expanded component checks for admins

Health checks inspect:

- database
- cache
- rate limiter
- global rate limiter
- storage
- email

If `SERVER_ONLINE === false`, overall health becomes `error`.

### 9.4 Specs endpoints

`controllers/server.ts` also exposes:

- `GET /server/specs/oas`
- `GET /server/specs/graphql/:scope?`

This shows that Directus treats API specification generation as part of the server surface, not as an external build-only concern.

---

## 10. Shutdown Lifecycle

Terminus is configured with signal handlers for:

- `SIGINT`
- `SIGTERM`
- `SIGHUP`

### 10.1 Before shutdown

- log shutdown message outside development
- set `SERVER_ONLINE = false`

### 10.2 On signal

- terminate subscription websocket controller
- terminate general websocket controller
- terminate log websocket controller
- terminate collaborative editing handler
- destroy database connections

### 10.3 On shutdown

- emit `server.stop`
- log final shutdown message outside development

This is a real lifecycle contract, not a best-effort process exit.

---

## 11. Architectural Invariants

From the inspected code, the following invariants are part of Directus's runtime model:

- Directus will not start against an uninstalled schema.
- Schema and storage validation happen before route serving.
- Extensions and flows are initialized before the app starts accepting requests.
- Auth, schema resolution, and query sanitization are middleware-owned cross-cutting concerns.
- The API can serve the admin app, but the admin app is still treated as a separately built product.
- Websocket, MCP, AI chat, metrics, and TUS are feature-gated at mount time.
- Health and shutdown are first-class concerns of the runtime.

---

## 12. Follow-Up Files Needed

This file defines the macro server contract. Follow-up specs should drill into:

- authentication middleware internals
- schema middleware internals
- caching behavior
- websocket controller and collaborative editing internals
- emitter hook lifecycle
- scheduler tasks in `schedules/`

---

## 13. Tovu Reconstruction Notes

### 13.1 Why this exists

This subsystem exists to guarantee that the platform only starts when its runtime invariants are satisfied. Directus is treating bootstrap as a contract boundary, not as a loose pile of startup code.

### 13.2 What Tovu should preserve

- Explicit startup ordering for config, schema readiness, storage readiness, extension loading, and route mounting
- Feature-gated mount points owned by startup composition, not scattered through handlers
- First-class shutdown behavior for websockets, workers, and database connections
- Cross-cutting middleware ownership for auth, schema resolution, and query sanitation

### 13.3 What Tovu can simplify

- V1 does not need every Directus runtime surface at boot
- Startup can be narrower as long as composition is still ordered and testable
- Some feature gates can start as config flags before evolving into richer policy profiles

### 13.4 Possible Tovu seams

- `src/server/` as the composition root only
- `src/core/ports/RuntimeReadinessPort.ts` for install/readiness checks
- `src/core/ports/FeatureGatePort.ts` for mount-time capability decisions
- `src/core/events/` for lifecycle and shutdown coordination

### 13.5 Suggested priority

- `V1`: deterministic boot, readiness gates, orderly shutdown, feature-gated route mounting
- `Later`: richer health/metrics surfaces, deeper background scheduler and websocket lifecycle policies
