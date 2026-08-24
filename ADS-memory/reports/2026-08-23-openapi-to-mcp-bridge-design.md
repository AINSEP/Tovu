# Tovu OpenAPI-to-MCP Bridge — Design Proposal

**Date:** 2026-08-23
**Status:** Design only; no production code proposed or changed
**Audience:** Tovu, Tovu-Runner, and Jini maintainers

## Decision in one sentence

Tovu-Runner should host a Jini-generated MCP server for each compatible Tovu API-contract profile; that server exposes one explicitly named tool per OpenAPI operation, each tool requires a registered `instanceId`, and its handler makes the corresponding HTTP call through Runner's instance/session broker.

This is an external-client bridge only. It is not for Tovu's in-process site assistant, which already has native tools and should continue to use them.

## Evidence and boundaries

- `openapi/README.md` says the 16 OpenAPI 3.0.3 fragments are hand-verified contract content for external callers, but deliberately have no aggregation/merge tooling. The current files contain **129** `operationId` entries, including some public operations whose operation-level `security: []` overrides the document default.
- The current server has no live OpenAPI or API-version endpoint. `/health` and `/healthz` return only `{ ok: true }` (`src/server/routes/ops/health.ts`). A remote caller therefore cannot safely infer which of the local fragments describes an older instance.
- Current admin authentication is cookie-session based, not bearer-token or API-key based. `POST /api/admin/v1/auth/login` sets the opaque `tovu_session` cookie; `requireAdminSession` validates it server-side and gates `/api/admin`. The documented identity API-key endpoints have no server handlers (`openapi/README.md`).
- `@jini-ai/mcp` already owns generic, caller-supplied MCP hosting: `McpToolDef` has a name, JSON input schema, annotations, and a handler; `createMcpToolServer` validates inputs and converts handler outcomes to MCP results. It is the correct generic home, rather than a new Tovu subsystem.
- Tovu-Runner's current product invariant separates its left fleet-supervisor chat (`runner.*`) from a site-content agent. This bridge must be attached to a distinct remote-site/automation agent context, never silently added to the supervisor's `runner.*` tool surface.

## Recommended topology

```text
Tovu release
  OpenAPI fragments + generated contract manifest/bundle (Tovu-owned content)
                                  |
                                  v
Tovu-Runner instance registry -- contract/session broker -- Jini @jini-ai/mcp/openapi
  instanceId, base URL,                 |                         |
  workspace binding, secret ref         |                         v
                                  authenticated HTTP          McpToolDef[]
                                                               |
                                                               v
                                                   one MCP server per contract profile
                                                               |
                                                               v
                                                     external Runner agent
```

The server is per **contract profile**, not per instance. A profile is the tuple
`{ apiFamily, compatibilityVersion, contractDigest }`. All registered instances with the same
tuple share one 129-or-fewer-operation toolset. This preserves accurate schemas while avoiding
`instances × operations` tools.

## 1. Generation mechanism

### Contract acquisition and cache lifecycle

Tovu should publish a release-generated, immutable contract manifest and bundle, for example:

```json
{
  "apiFamily": "tovu-admin",
  "compatibilityVersion": "1",
  "contractDigest": "sha256:…",
  "bundle": {
    "href": "/api/admin/v1/openapi/bundles/sha256-…",
    "sha256": "…"
  },
  "operationCount": 129
}
```

`GET /api/admin/v1/openapi/manifest` and its immutable bundle should be a small, authenticated
bootstrap surface (ideally protected by a specific contract-read permission). The login route is
known independently of the generated contract, so there is no discovery/authentication cycle. Tovu
owns this manifest and the spec content; it does **not** own OpenAPI parsing or MCP generation.

The release build should make the fragments a canonical bundle or manifest of self-contained
documents, validate unique operation IDs, and calculate a digest over the canonical bytes. The
Jini compiler accepts a bundle or an array of self-contained documents; it must resolve only
document-local `$ref`s and reject external references. It must not concatenate YAML text or guess
at component-name collisions.

At Runner startup, its contract broker:

1. loads a disk cache keyed by `contractDigest`;
2. checks every managed instance's expected profile from Runner's deployment metadata;
3. after establishing the session, reads the remote manifest and verifies its bundle digest;
4. compiles an immutable `McpToolDef[]` once per distinct digest; and
5. starts/restarts only the MCP server for a changed profile.

The Jini MCP server intentionally receives a fixed tool array for its lifetime. Therefore an
updated digest creates a new server/run binding rather than mutating tool definitions under an
active agent. Calls from an old binding fail explicitly with `CONTRACT_CHANGED`; a new agent run
receives the replacement tool list.

An instance predating the manifest endpoint is supported only when Runner already has an exact
profile/digest from the deployment image or an administrator has registered a verified local
bundle. If neither exists, mark it `contract_unknown` and do not expose a speculative operation
toolset for it. A 404 probe must not be treated as proof that the newest contract applies.

### Operation-to-tool mapping

The Jini compiler has a deliberately narrow, testable OpenAPI profile: OAS 3.0.3; unique
`operationId`; path/query/header parameters; JSON request bodies; JSON and bounded binary
responses; document-local references; and the schema constructs demonstrably used by Tovu's
published bundle. Unsupported serialization, ambiguous security requirements, external refs,
duplicate IDs, or a schema that cannot be represented by MCP's JSON-schema validator are
compile-time errors for the entire affected profile, never silently widened to `object`.

Use a maintained OAS parser/validator selected by the Jini package owner rather than a custom YAML
resolver. The implementation ADR must record that library choice and its supported-profile tests.

For every operation:

| OpenAPI element | Generated MCP element |
|---|---|
| `operationId: list_menus` | Tool name `tovu_list_menus`; the server alias supplies the contract-profile namespace. |
| `summary`, method, path | Bounded/sanitized description, e.g. `GET /api/admin/v1/workspaces/{workspaceId}/menus — List menus in a workspace`. Remote prose is data, not agent instructions. |
| required/optional path, query, and declared header parameters | Closed nested JSON-schema objects `path`, `query`, and `headers`; requiredness and schemas are preserved. Reserved headers (`Cookie`, `Authorization`, `Host`, `Content-Length`, forwarding headers) are never model-supplied. |
| `application/json` request body schema | Closed `body` property using the converted JSON schema; required only when OpenAPI requires it. |
| security requirement | Handler asks Runner's session broker for a session only for operations requiring `adminSessionCookie`; a `security: []` operation is invoked without that cookie. |
| success response | MCP success whose text content is canonical JSON for the response envelope below. |

Every generated input object also requires `instanceId`. It is an opaque Runner registry key, never
a URL. For Tovu's bound-workspace routes, Runner supplies the registered `workspaceId` as a fixed
path parameter and removes it from the agent-facing schema; the server today directly compares that
path value with its configured workspace. This prevents a model from using one instance's session
to probe arbitrary workspace identifiers.

Example shape for `tovu_list_menus` after that binding:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["instanceId"],
  "properties": {
    "instanceId": { "type": "string", "description": "Registered Tovu instance ID; not a URL" },
    "path": { "type": "object", "additionalProperties": false, "properties": {} },
    "query": { "type": "object", "additionalProperties": false, "properties": {} },
    "headers": { "type": "object", "additionalProperties": false, "properties": {} }
  }
}
```

The generic executor percent-encodes path values, applies the OpenAPI-declared query/header
serialization, adds only broker-owned authentication and tracing headers, rejects cross-origin
redirects, and enforces request/response byte limits. It assigns read-only/destructive annotations
from HTTP method plus an explicit Runner policy override; all state-changing calls pass through
Runner's confirmation/allow-list gate before the HTTP handler runs.

### Tool-result contract

Jini's existing MCP host turns a handler return value into a single text content block, so success
is a JSON-encoded envelope rather than an invented protocol:

```json
{
  "ok": true,
  "instanceId": "prod-west",
  "operationId": "list_menus",
  "contractDigest": "sha256:…",
  "http": { "status": 200, "requestId": "runner-generated-id" },
  "data": { "menus": [] }
}
```

For binary results, `data` contains artifact metadata (`artifactId`, MIME type, byte length, and
digest), not unbounded base64. Runner owns the artifact storage decision. For a remote HTTP,
transport, schema, or compatibility failure, the MCP result has `isError: true` and its text is a
bounded, sanitized JSON `BridgeFailure`:

```json
{
  "ok": false,
  "kind": "REMOTE_HTTP | TRANSPORT | CONTRACT | AUTH",
  "instanceId": "prod-west",
  "operationId": "list_menus",
  "status": 403,
  "retryable": false,
  "requestId": "runner-generated-id",
  "message": "Remote instance denied this operation"
}
```

The Jini addition should provide structured-error support centrally rather than each generated
handler inventing string formatting. It must cap/redact body excerpts and never return cookies,
credentials, or arbitrary response headers.

## 2. Multi-instance addressing

**Recommendation: require `instanceId` on every operation tool, with one server per contract
profile. Do not create a namespace per instance.**

Per-instance namespaces would make a 129-operation surface grow linearly with fleet size, crowd
the model's tool menu, and require re-registration for routine fleet changes. A target parameter
keeps the operation contract stable, makes intent auditable (`instanceId=prod-west` is in the tool
event), and lets the bridge enforce a central allowed-instance list.

The only namespace boundary is the contract profile's MCP-server alias, for example
`tovu-admin-v1-4a31`. Its tools remain `tovu_list_menus`, `tovu_create_post`, and so on. This
allows a small number of older-instance profiles to expose the schema they actually support without
polluting a current profile or weakening a schema into an unhelpful union.

Runner's instance record owns at least:

- immutable `instanceId`, display name, HTTPS base URL, and pinned origin;
- bound workspace ID and deployment/API-profile metadata;
- secret-store reference for the service principal, never credential material in tool arguments;
- observed manifest digest, last validation time, and health/contract state; and
- permitted operation classes for the agent context.

The bridge resolves an `instanceId` exclusively through this record. An unknown, disabled, or
profile-mismatched ID produces an error before any network attempt, eliminating model-directed SSRF
and accidental cross-fleet targeting.

## 3. Authentication and authorization

The initial bridge must fit the server that exists today:

1. Runner retrieves a per-instance dedicated admin username/password from the OS secret store.
2. Its session broker calls `POST /api/admin/v1/auth/login` over HTTPS and retains the returned
   `tovu_session` only in protected process/session storage.
3. For an admin operation, the broker adds `Cookie: tovu_session=<opaque value>` itself. The model
   cannot set or inspect this header.
4. On session expiry, the broker obtains a new session through the same login endpoint. It does not
   try to use the currently documented API-key routes: the OpenAPI audit reports that those routes
   do not exist server-side.

This matches `src/server/middleware/dev-auth.ts`: sessions are server-side and revocable;
`requireAdminSession` returns `401 { error: "unauthenticated", code: "UNAUTHENTICATED" }` before
the protected route runs; login is rate limited to 10 attempts per 60 seconds per client IP; and
`/api/admin/v1/auth/me` returns the effective permissions. `Secure; HttpOnly; SameSite=Strict` on
the cookie is appropriate for browser use; a Node MCP bridge must explicitly retain and send the
cookie rather than expecting a browser cookie jar.

Runner should require HTTPS and normal certificate validation for remote instances. A local HTTP
exception may exist only behind an explicit development-only setting. It should validate login and
call `/api/admin/v1/auth/me` when an instance is registered, so the operator sees the service
principal's permissions before an agent is allowed to call tools.

Use a dedicated, least-privilege Runner principal per instance, with Tovu's existing action-specific
RBAC grants. Runner's own tool gate is an additional boundary, not a substitute for remote
authorization: a tool being available does not grant a remote permission. Credentials, cookies,
request bodies containing secrets, and `Set-Cookie` headers must be excluded from logs, model
context, artifacts, and error messages.

**Follow-on Tovu work:** add a real revocable, scoped machine/service-account credential flow. It
should eventually replace password-backed cookie login for Runner, but it must be a separately
specified HTTP contract. This proposal deliberately does not pretend that the unimplemented
API-key documentation already provides that capability.

## 4. Ownership and package placement

### Jini — extend `@jini-ai/mcp` with `./openapi`

Place the reusable OpenAPI-to-MCP compiler and HTTP bridge in the existing
`@jini-ai/mcp` package, exported as a Node-oriented `@jini-ai/mcp/openapi` subpath. The package
already owns the product-neutral `McpToolDef` contract, schema validation, MCP server, handler
error conversion, and injected HTTP seams. Creating a sibling `@jini-ai/openapi-mcp` package would
split one protocol adapter domain without a demonstrated benefit.

The subpath should contain only generic capabilities:

- OpenAPI document/profile validation and safe `$ref` resolution;
- operation-to-`McpToolDef` compilation and stable naming;
- request serialization, bounded response decoding, and structured bridge failures; and
- injected target/session lookup, fixed parameter binding, policy classification, fetch, clock, and
  binary-result callbacks for hosts to supply.

It must not know Tovu paths, Tovu permission names, Runner storage, or a Tovu credential format.

### Tovu-Runner

Runner owns the concrete fleet adapter: instance registry, deployment-profile knowledge, contract
cache/refresh scheduling, OS-secret integration, cookie-session broker, workspace bindings, agent
allow/confirmation policy, artifact persistence, and composition of one MCP process/server per
profile. It also owns the product decision to attach these tools only to the appropriate remote
site/automation agent context, not its protected fleet-supervisor chat.

### Tovu

Tovu owns only its OpenAPI fragment content and the release-time publication of the immutable
manifest/bundle. It should add the narrowly scoped contract-discovery endpoint and later its real
machine-credential contract. It should not import Jini's generator into the Tovu process or wrap its
native assistant tools in HTTP merely to reuse this bridge.

## 5. Failure and version handling

| Condition | Required behavior |
|---|---|
| Invalid or unsupported published spec | Do not start that profile's tool server; retain last known-good cached profile only if its manifest remains pinned, and surface `CONTRACT_INVALID` to Runner. |
| Unknown/disabled/mismatched `instanceId` | Fail before DNS or HTTP. No raw base-URL argument exists. |
| DNS/TLS/connect timeout | Return `TRANSPORT` with a correlation/request ID. Retry only safe reads using bounded backoff; never turn a timed-out write into a blind retry. |
| 401 for an admin call | Invalidate the cached session and perform at most one broker-controlled re-login/retry. The current gate returns 401 before the protected route handler, but the generic bridge still records the retry and never exposes the cookie. |
| 403 | Return non-retryable `REMOTE_HTTP`; retain safe Tovu permission details when supplied. Do not re-login or request broader credentials automatically. |
| 429 | Respect `Retry-After` when present and return a retryable failure; do not silently wait/retry a state-changing command. |
| 4xx/5xx, malformed JSON, or response too large | Return bounded structured error with status/content type and redacted body excerpt. Validate declared success payloads when practical. |
| Ambiguous write timeout | Return `AMBIGUOUS_WRITE`, preserve a supplied/generated declared idempotency key, and require reconciliation. Retry automatically only where the published operation explicitly supplies a safe idempotency mechanism. |
| Remote manifest digest changes | Mark the instance/profile stale, compile and verify the new digest, then create a new profile server for subsequent runs. Old runs fail `CONTRACT_CHANGED` rather than issuing a request against a different contract. |
| Older instance without a manifest | Use only a deployment-pinned verified bundle; otherwise disable its operation tools and ask for explicit registration/upgrade. |
| Endpoint/status outside the generated contract | Treat 405, unexpected 404, incompatible success content, or unsupported media as possible contract drift; refresh the manifest once and report `CONTRACT_MISMATCH` if still incompatible. A documented resource-level 404 remains an ordinary remote result. |

All bridge events need structured logs and traces with `instanceId`, contract-digest prefix,
operation ID, method, normalized route template, status/error kind, duration, retry count, and a
correlation ID. They must not include raw URLs with credentials, cookies, sensitive bodies, or
unbounded response text. Metrics should use the operation template rather than raw resource IDs.

## 6. Relationship to the capability-discovery design

This is **not new capability-discovery architecture**. It is an application of the settled
separation:

- A `CapabilitySource` lists discovery-only cards. The settled card shape has no `execute` field,
  and there is no `capability_invoke`.
- The bridge is an activation adapter. It exposes an ordinary, explicitly named MCP tool per
  operation and its handler performs that operation's HTTP request.

Consequently, the bridge needs no new `CapabilitySource`-like registry to work. If a future Runner
or Tovu catalog wants these operations to be searchable, it can project a card such as
`tovu-openapi:<contractDigest>:<operationId>` through the already-settled source registration
pattern. That card may point the agent to `tovu_update_post`; it must not contain a generic execution
callback. The separate MCP tool remains the only activation path.

The current `CapabilitySource` registry described in the consensus materials is Tovu-target
architecture, not a Jini package that Runner can import today. Therefore Runner must not copy it or
invent a parallel generic registry just for this bridge. Reuse the pattern when a real shared
discovery consumer exists; until then, compile and host explicit MCP tools directly.

## Security and implementation acceptance criteria

Before implementation, write contract/integration tests that prove at least:

1. all published Tovu fragments compile to one unique tool per operation under the supported
   profile, with a snapshot of names and schemas;
2. each parameter location serializes correctly, while a model cannot override authentication,
   host, or bound workspace values;
3. two same-profile instances route to different registered origins using the required
   `instanceId`, and a foreign/unknown ID makes no outbound request;
4. session login, expiry, one re-authentication, remote 403, and no-cookie public operations match
   the real `requireAdminSession` contract;
5. timed-out non-idempotent writes are never retried, and a documented idempotency key remains
   stable through reconciliation;
6. an instance upgrade changes the digest, replaces the profile server only for later runs, and
   rejects stale calls safely;
7. malformed/adversarial remote specs, descriptions, redirects, response bodies, and binary
   payloads cannot inject tool instructions, escape the registered origin, exhaust memory, or leak
   secrets; and
8. MCP results, error classification, tool confirmations, trace/log fields, and redaction work at
   the actual HTTP boundary.

## Constitution and architecture check

| Article | Result | Design implication |
|---|---|---|
| I — Library-first | Complies conditionally | Jini selects a maintained OAS parser/validator; no handwritten YAML resolver. Record the selection before code. |
| II — Test-first | Complies conditionally | The acceptance cases above must be certified first; no generator or endpoint code precedes them. |
| III — Simplicity | Complies | The immediate external-caller requirement justifies one Jini subpath and a small Tovu publication contract; no per-instance tool explosion or universal invoker. |
| IV — Rule of two | Complies | No new Tovu core port is proposed. Jini extends its existing injected MCP hosting mechanism rather than creating an unconsumed Tovu abstraction. |
| V — Integration-first | Complies conditionally | Contract tests run against real HTTP/session behavior, not only a compiled schema fixture. |
| VI — Security-by-default | Complies conditionally | Registered origins, HTTPS, secret isolation, service-principal RBAC, fixed workspace bindings, and confirmation gates are mandatory. |
| VII — Spec integrity | Pending adoption spec | This is a dated design request, not an active pipeline feature package. Implementation must attach an approved spec ID/version/hash before work begins. |
| VIII — Observability | Complies conditionally | The per-call structured telemetry and correlation requirements above are implementation acceptance criteria. |

## Main risks and re-evaluation triggers

The largest current risk is **contract identity**: the server does not yet publish a live
contract-manifest/digest, and `/health` exposes no version. Without the publication prerequisite,
Runner cannot know whether a remote instance's routes and schemas match the local fragments; a
best-effort newest-spec call would be an unsafe hidden client implementation.

The next risk is that current machine access requires a stored admin password and a browser-shaped
session cookie because API-key endpoints are not implemented. Re-evaluate the broker design when
Tovu ships real scoped service credentials, when Tovu introduces non-JSON/multipart or streaming
operations, when more than a small number of contract profiles coexist, or when Runner's chat
ownership model changes.
