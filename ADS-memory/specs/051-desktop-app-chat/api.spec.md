# API Contract Spec: desktop-app-chat

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/api.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-051 |
| feature_name | FEAT-051-desktop-app-chat |
| version | 0.1.2 |
| last_edited | 2026-09-16T00:00:00Z |

## Purpose

This feature adds two contract surfaces: one HTTP route on a site's agent daemon (REQ-06), and seven Electron IPC channels between the desktop renderer and main process (REQ-10). The IPC channels already exist as declarations in `apps/desktop/src/contracts/workspace-chat.ts`; this file records the obligations the main-process half takes on, because that half has never existed.

> **`[OQ-03 OPEN]` — Section 4.1's transport shape is not settled.** Sections 1, 2 and 4.1 below specify the **plain authenticated HTTP** shape (the recommendation in `ADS-memory/.local-artifacts/agent-reports/2026-09-16-w4-spec051-designs.md` §2 OQ-03, option A). If the owner or Architect instead chooses an inbound MCP server (option B), Section 1's row, Section 4.1 and Section 6's mapping are all replaced by an MCP `initialize`/`tools/list`/`tools/call` contract; Sections 2, 3, 5 and 4.2 are unaffected either way. Owner: Software Architect. Resolve by: 2026-09-19.

---

## 1) Endpoint Registry

All HTTP endpoints this feature adds, in one place.

| Constant | Method | Path | Auth Profile | Rate Limit Profile | Purpose | REQ |
|---|---|---|---|---|---|---|
| `DESKTOP_TOOL_CALLS_PATH` | POST | `/api/admin/v1/desktop/tool-calls` | `admin-session` at the site's admin server; `agent-daemon-bearer` on the daemon hop | none (loopback, single operator) | Execute one allowlisted tool from this site's own `ToolRegistry` on behalf of the desktop shell's app-level agent | REQ-06, REQ-07 |

**Why a new path rather than reusing `MCP_UI_TOOL_CALLS_PATH`.** `/api/admin/v1/mcp-ui/tool-calls` exists and does structurally the same thing, and reusing it would be the cheapest possible change — but `apps/website/src/assistant/mcp-ui-tool-calls.ts`'s own header states the rule that makes that allowlist safe: an id belongs there only if its handler holds up one of two confirmation shapes, and "adding an id whose handler does neither would turn this into an unauthenticated remote-execution allowlist for that tool, model-callable with no human in the loop." REQ-06's tools are exactly that kind — ordinary tools with no confirmation shape. A sibling route with its own allowlist keeps both rules true and both allowlists reviewable on their own terms.

**Pre-existing endpoints this feature must NOT reuse:**

| Path | Why not |
|---|---|
| `/api/delegated-tool-calls` | Run-scoped by design. `apps/website/src/assistant/run-ownership.ts:51` states that the route's whole remaining defence is that a run id only resolves while the run is alive, and `agent-daemon-server.ts:1038` scopes it to "this run's own spawned `jini-mcp`". The desktop agent has no run inside the site's daemon, so reuse would mean minting a run id that stands for nothing — removing the one property the route's security rests on |
| `/api/admin/v1/mcp-ui/tool-calls` | Not for general tool execution; see above. It IS reused, unchanged, for the confirmation round trip (Section 4.3) |

---

## 2) Authentication and Authorization Profiles

| Profile | Applies To | Credential | Where Checked | Failure Code |
|---|---|---|---|---|
| `admin-session` | The site's admin server hop | The site's admin session cookie, already in `session.fromPartition(sitePartition(siteDir))`'s jar from `ensureSiteSession` (`apps/desktop/src/desktop-auth.ts`) | `requireAdminSession(routeDeps)` mounted on the path prefix in `apps/website/src/server/runtime/composition/modules/assistant.ts`, exactly as it is for `MCP_UI_TOOL_CALLS_PATH` | HTTP 401 |
| `agent-daemon-bearer` | The admin-server-to-daemon hop | The daemon bearer token | `daemon-auth.ts`'s `requireAgentDaemonToken`, mounted ahead of every daemon route | HTTP 401 |
| `allowlist` | Tool name, on the daemon | — | `isDesktopToolCallAllowed(toolName)` before any execution branch runs | HTTP 403 `TOOL_NOT_ALLOWLISTED` |

**Caller-side obligation (REQ-06, AC-06, INV-07).** The request MUST be issued from the Electron **main** process using `net` bound to that site's own partitioned session. It MUST NOT be issued as a `fetch` from the Sites Home renderer: `openSitesHomeWindow` (`apps/desktop/main.ts:482-512`) passes no `partition` in `webPreferences`, so the top-level renderer runs in the default session and holds no site cookie at all. A renderer-issued call does not fail closed in an obvious way — it fails as a 401 that looks like an expired session, which is the wrong diagnosis.

---

## 3) Rate Limit Profiles

| Profile | Scope | Limit | Window | Enforcement |
|---|---|---|---|---|
| none | `/api/admin/v1/desktop/tool-calls` | — | — | Deliberately unlimited. The caller is a single local operator's own agent over loopback, behind two authentication hops, executing from a fixed allowlist. A rate limit here would be a limit on the operator's own machine and would add a failure mode (a long turn throttled mid-way) with no threat it defends against. This matches `MCP_UI_TOOL_CALLS_PATH`, which also declares none |

---

## 4) Request Contracts

### 4.1 Endpoint: `DESKTOP_TOOL_CALLS_PATH` (`POST /api/admin/v1/desktop/tool-calls`)

**Headers**

| Header | Required | Value |
|---|---|---|
| `content-type` | yes | `application/json` |
| `x-tovu-principal-id` (`RUN_PRINCIPAL_HEADER`, `apps/website/src/assistant/run-ownership.ts:44`) | yes | The principal id the call acts for. Read the same way `mcp-ui-tool-calls-route.ts` reads it; absent → 401 `UNAUTHENTICATED` |
| `cookie` | yes | Supplied by the Electron session partition; never constructed by hand |

**Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `toolName` | `string` | yes | A site tool id, e.g. `content_post_list`. Checked against the allowlist before anything else |
| `params` | `Record<string, unknown>` | yes | Passed through to `ToolExecutor.execute` unmodified. May be `{}` |

Kept flat, with no schema library, for the same reason `McpUiToolCallRequest` is: a server must be able to validate it field by field.

**Execution contract**

- The route resolves the tool through the daemon's own `ToolRegistry` and executes it via `toolExecutor.execute(...)` with a **synthetic single-use `RunRef`** (`{ id }` is `@jini-ai/core`'s whole structural contract for one). Precedent and reasoning: `apps/website/src/assistant/mcp-ui-tool-calls-route.ts`'s header, "Deliberately NOT run-scoped".
- The route MUST NOT start a run, an `AgentExecutor`, or any LLM call (INV-02).
- `ToolExecutionResult.status` maps to HTTP exactly as `respondToExecutionResult` already maps it in `mcp-ui-tool-calls-route.ts` (`completed` → 200; `denied` → 403 `FORBIDDEN`; `confirmation-denied` → 409 `CONFLICT`; `timed-out` → 504 `GATEWAY_TIMEOUT`; `cancelled` → 500 `INTERNAL_ERROR`; `failed` → 400 `TOOL_CALL_FAILED`). Reuse that function rather than restating the switch.

**`[OQ-02 OPEN]` — the allowlist's contents.** The route's shape does not depend on the answer; the allowlist module's contents do. Recommended first slice: reads plus reversible Posts/Pages writes, with the standing rule that no tool opening a `SurfaceExchangeStore` exchange may be admitted until the desktop panel hosts mcp-ui surfaces (Section 4.3). Owner: Leona Burime / Software Architect. Resolve by: 2026-09-19.

### 4.2 IPC contract (REQ-10)

`apps/desktop/src/contracts/workspace-chat.ts` declares seven channels. Five are `invoke` (renderer → main, awaiting a reply) and two are push (main → renderer).

| Channel | Direction | Main-process obligation |
|---|---|---|
| `workspace:chat:start` | invoke | Start a run; resolve with the run's subscription id and initial snapshot |
| `workspace:chat:reattach` | invoke | Re-subscribe to a live run after a renderer reload |
| `workspace:chat:detach` | invoke | Drop a subscription without stopping the run |
| `workspace:chat:stop` | invoke | Cancel a live run |
| `workspace:chat:status` | invoke | Return a `WorkspaceChatRunSnapshot` |
| `workspace:chat:event` | push (`webContents.send`) | Run-protocol events, including confirmation-request records (REQ-11) |
| `workspace:chat:navigate` | push (`webContents.send`) | Emitted when a `desktop.navigate` call resolves (REQ-17) |

**Mandatory prerequisite, and the way this goes wrong.** All five invoke channels are **already registered**, as deliberately-throwing stubs, by `registerRunnerIpcStubs` (`apps/desktop/src/runner-ipc-stubs.ts`, called at `apps/desktop/main.ts:1393`). Electron's `ipcMain.handle` **throws on a duplicate registration**, so adding real handlers without first removing those five names from `RUNNER_STUB_CHANNELS` crashes the app at boot. That module's own doc states the rule: "Removing a name from the list above is therefore part of implementing it." `runner-ipc-stubs.test.ts` parses the contract sources and must be updated in the same commit.

Neither push channel may be implemented as an `ipcMain.handle` (AC-13).

### 4.3 Confirmation round trip (REQ-11, site tools)

Not a new endpoint — the existing `POST /api/admin/v1/mcp-ui/tool-calls`, reached the same way Section 2 describes.

When a site tool returns an mcp-ui resource, `@jini-ai/daemon`'s `delegated-tool-bridge.ts` emits it as an `mcp-ui` run event, `McpUiSurfaceCard` renders it in a sandboxed iframe, and the human's click posts `{toolName, params}` back. `@jini-ai/chat` 0.3.7 — which `apps/desktop` already depends on — ships both halves: `registerMcpUiSurfaceRenderer({ onToolCall: createMcpUiToolCaller(baseUrl, { path: '/api/admin/v1/mcp-ui/tool-calls' }) })`.

**The obligation this adds.** `createMcpUiToolCaller`'s own doc states that the endpoint it calls is "a host-authenticated one (a browser session, typically)" and that "the human's own credentials are what authorize the second step." In the desktop shell the human's credentials for a site live in that site's partition, not in the Sites Home renderer. So the panel's `onToolCall` **must route through main over the same `net` + `session.fromPartition` hop as Section 2**, not issue a direct request. This is a constraint `feature.spec.md` does not currently state; REQ-06's rule applies to the confirmation channel as well as the tool-call channel.

---

## 5) Response Contracts

### Success Responses

| Endpoint | Status | Body |
|---|---|---|
| `DESKTOP_TOOL_CALLS_PATH` | 200 | `result.output ?? {}` — the tool's own output object, unwrapped, exactly as `respondToExecutionResult` returns it today |

### Contract Definitions

| Type | Shape | Notes |
|---|---|---|
| `DesktopToolCallRequest` | `{ readonly toolName: string; readonly params: Record<string, unknown> }` | Flat by design; see Section 4.1 |
| `DesktopToolCallErrorBody` | `{ readonly error: string; readonly code: string }` | The shape `mcp-ui-tool-calls-route.ts` already returns on every non-2xx, reused verbatim so one client parser serves both routes |
| `WorkspaceChatRunSnapshot` | `{ runId: string; state: WorkspaceChatRunState }` | Existing, `apps/desktop/src/contracts/workspace-chat.ts:89-92`. Unchanged by this feature |
| `WorkspaceChatRunState` | `'queued' \| 'starting' \| 'running' \| 'succeeded' \| 'failed' \| 'cancelled'` | Existing. Note the spelling: `@jini-ai/protocol`'s vocabulary, two Ls, mapped once in the transport |

---

## 6) Error Mapping

| Condition | HTTP | Code | Caller-visible? |
|---|---|---|---|
| No admin session cookie for that site | 401 | — (proxy-level `requireAdminSession`) | Yes, mapped client-side to `SITE_SESSION_NOT_ESTABLISHED` |
| `x-tovu-principal-id` header absent | 401 | `UNAUTHENTICATED` (existing) | Should be impossible from the shell; indicates a wiring bug |
| Daemon bearer missing or wrong | 401 | — (`requireAgentDaemonToken`) | Should be impossible from the shell; indicates a wiring bug |
| `toolName` missing or not a non-empty string | 400 | `VALIDATION_ERROR` (existing) | Yes |
| `toolName` not on the allowlist | 403 | `TOOL_NOT_ALLOWLISTED` (existing string, new allowlist) | **Yes — the refusal text reaches the model** (REQ-07, AC-07, EC-09) |
| Principal not authorized for the tool | 403 | `FORBIDDEN` (existing) | Yes |
| Tool declined without a further confirmation | 409 | `CONFLICT` (existing) | Yes. Should be unreachable if OQ-02's standing rule holds (no exchange-opening tool admitted) |
| Tool timed out | 504 | `GATEWAY_TIMEOUT` (existing) | Yes |
| Tool cancelled before completing | 500 | `INTERNAL_ERROR` (existing) | Yes |
| Tool handler failed | 400 | `TOOL_CALL_FAILED` (existing) | Yes, with the handler's own message |
| Connection refused / site daemon down | — (no response) | `SITE_TOOL_SURFACE_UNREACHABLE` (client-side, new) | Yes, and it triggers REQ-19 degradation at turn start where possible |

Every code above appears in `errors.spec.md` §2 (new codes) or §2a (existing codes this route reuses unchanged), and has a row in `traceability.spec.md` §4.

---

## 7) Contract Acceptance Checklist

- [x] Every endpoint is registered in one constant (`DESKTOP_TOOL_CALLS_PATH`), following `MCP_UI_TOOL_CALLS_PATH`'s own precedent of exporting the path so the proxy mount and the daemon route cannot drift
- [x] Every endpoint declares an explicit auth profile
- [x] Every error condition maps to an HTTP status and a code in `errors.spec.md`
- [x] Request and response bodies are typed with no `any` escape hatch (`params`' `Record<string, unknown>` is pass-through by contract, mirroring `McpUiToolCallRequest`)
- [x] Rate-limit posture is stated, including where it is deliberately absent and why
- [x] Endpoints this feature must NOT reuse are named, with the reason
- [ ] `[OQ-03 OPEN]` Transport shape confirmed (plain HTTP vs inbound MCP server) — due 2026-09-19
- [ ] `[OQ-02 OPEN]` Allowlist contents settled — due 2026-09-19
