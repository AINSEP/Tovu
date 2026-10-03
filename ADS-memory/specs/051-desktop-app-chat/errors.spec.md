# Error Code Registry Spec: desktop-app-chat

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/errors.spec.md -->
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

Three of this feature's requirements are entirely about refusals: REQ-07 (a tool absent from the allowlist), REQ-09 (no bind token yet), REQ-19 (a site's tool surface unreachable). Each states the same property in different words — **refused by name, visible to the caller, never silently dropped and never a hang**. This file is where those refusals get their names.

The property matters more here than in most features because the caller is a language model. A silent drop teaches the model nothing and it retries; a hang consumes the turn's whole deadline; a redacted 500 makes the model guess. The existing precedent this registry follows is `agent-daemon-server.ts:451-453`, which refuses a bind-token-less `page.*`/`chat.*`/`admin.*` call **by name**.

---

## 1) Error Envelope (Base Payload)

The HTTP surface reuses the envelope `mcp-ui-tool-calls-route.ts` already returns, unchanged, so one client parser serves both routes:

| Field | Type | Required | Notes |
|---|---|---|---|
| `error` | `string` | yes | Human- and model-readable. Names the tool or resource involved |
| `code` | `string` | yes | One of Section 2's codes |
| `details` | `Record<string, unknown>` | no | Per-code shape in Section 3 |

The IPC surface carries the same `code` on an `Error` object, following `runner-ipc-stubs.ts`'s existing `RunnerNotPortedError` shape (`code`, plus a field naming what failed).

---

## 2) Error Code Registry

| Code | HTTP | Surface | Retryable | Raised When | Reaches the Model? | REQ |
|---|---|---|---|---|---|---|
| `TOOL_NOT_ALLOWLISTED` | 403 | REQ-06 route | No | `toolName` is absent from the desktop tool-call allowlist | **Yes, deliberately.** The turn continues and the model sees the refusal text rather than a hang | REQ-07, AC-07, EC-09 |
| `SITE_TOOL_SURFACE_UNREACHABLE` | — (no response) | main-process client | Yes, next turn | The site's daemon or route does not answer the turn-start probe | Indirectly: the tool set is assembled without that site's tools, and the transcript says so in plain words | REQ-19, AC-26, EC-04 |
| `SITE_SESSION_NOT_ESTABLISHED` | 401 mapped | main-process client | Yes, next turn | The partition has no valid admin cookie yet (boot race, or `ensureSiteSession` has not resolved) | Same as above — excluded from the turn with a stated reason | REQ-06, REQ-19 |
| `BIND_TOKEN_UNAVAILABLE` | — | DOM-tool bridge | No, this turn | The site's admin page has not mounted a bind token at call time | **Yes.** Refused by name for that turn, exactly as the existing no-token case is | REQ-09, AC-11 |
| `CONFIRMATION_CANCELLED` | — | confirmation | No | The operator clicked Cancel on a pending call | **Yes.** The call ends as cancelled and the turn continues; the model must be able to tell "the human said no" from "it failed" | REQ-11, AC-15, EC-05 |
| `CONFIRMATION_EXPIRED` | — | confirmation | No | A pending confirmation was not answered within its deadline | **Yes** | REQ-11 |
| `WORKSPACE_CHAT_DAEMON_UNAVAILABLE` | — | IPC, all five invoke channels | No | The app-level daemon failed to construct at boot | No model exists to see it. The pane shows an explicit "assistant unavailable" state; the rest of the app is unaffected | `feature.spec.md` Dependencies table |
| `RUNNER_MAIN_NOT_PORTED` | — | IPC | No | **Existing**, `apps/desktop/src/runner-ipc-stubs.ts`. Raised by the stub handlers on all five `workspace:chat:*` invoke channels today | — | REQ-10 — this code must **stop** being raised for these five channels; the stub names are removed in the same commit the real handlers land |

### 2a) Existing codes the REQ-06 route reuses unchanged

Not new. Listed so `api.spec.md` §6 and this registry agree (spec-dod.md F-01), and so nobody invents a second spelling for a condition that already has one. All come from `respondToExecutionResult` and the request guards in `apps/website/src/assistant/mcp-ui-tool-calls-route.ts`.

| Code | HTTP | Raised When | Reaches the Model? |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | `x-tovu-principal-id` (`RUN_PRINCIPAL_HEADER`) absent | Should not occur from the shell; a wiring bug if it does |
| `VALIDATION_ERROR` | 400 | `toolName` missing or not a non-empty string | Yes |
| `FORBIDDEN` | 403 | `ToolExecutionResult.status === 'denied'` | Yes |
| `CONFLICT` | 409 | `status === 'confirmation-denied'` | Yes. Unreachable while no exchange-opening tool is on the allowlist |
| `GATEWAY_TIMEOUT` | 504 | `status === 'timed-out'` | Yes |
| `INTERNAL_ERROR` | 500 | `status === 'cancelled'`, or an unexpected throw | Yes |
| `TOOL_CALL_FAILED` | 400 | `status === 'failed'`; carries the handler's own message | Yes |

**Why `CONFIRMATION_EXPIRED` exists at all.** `apps/website/src/assistant/pending-confirmations.ts:14-21` records what happens without a deadline: with no `ExecutionDelegate` wired, setting `descriptor.requiresConfirmation` parks the execution on a promise only `resumeConfirmation` can settle, and "the park is unbounded, because `descriptor.timeoutMs`'s timer is armed only AFTER the confirmation await." A confirmation mechanism without an expiry is a hang with extra steps. Whatever mechanism REQ-11 finally uses, it owns a deadline and this code.

---

## 3) Per-Code Details Schema

| Code | `details` Shape |
|---|---|
| `TOOL_NOT_ALLOWLISTED` | `{ toolName: string }` |
| `SITE_TOOL_SURFACE_UNREACHABLE` | `{ siteDir: string; reason: 'connection-refused' \| 'timeout' \| 'not-found' \| 'assistant-disabled' }` |
| `SITE_SESSION_NOT_ESTABLISHED` | `{ siteDir: string }` |
| `BIND_TOKEN_UNAVAILABLE` | `{ siteDir: string; toolName: string }` |
| `CONFIRMATION_CANCELLED` | `{ callId: string; toolName: string }` |
| `CONFIRMATION_EXPIRED` | `{ callId: string; toolName: string; deadlineMs: number }` |
| `WORKSPACE_CHAT_DAEMON_UNAVAILABLE` | `{ cause: string }` |

`SITE_TOOL_SURFACE_UNREACHABLE`'s `'assistant-disabled'` reason is separate from `'connection-refused'` on purpose. `TOVU_ADMIN_ASSISTANT=off` is read **once at boot** (`apps/website/src/server/runtime/composition/admin-assistant-enabled.ts:29`) and skips the daemon entirely when external MCP is also unconfigured (`server/runtime/boot/agent-daemon-wanted.ts:26-37`), so that site has no `ToolRegistry` process at all — permanently, until it is restarted with the switch changed. Telling the operator "site A's tools were temporarily unavailable" would be false and would send them looking for a crash. See `traceability.spec.md` §3, proposed EC-11.

---

## 4) Ownership and Source Rules

| Code | Owning Layer | Single Source |
|---|---|---|
| `TOOL_NOT_ALLOWLISTED` | Site daemon (`apps/website/src/assistant/`) | The new allowlist module, sibling of `mcp-ui-tool-calls.ts`. **Reuses the existing code string deliberately** — `mcp-ui-tool-calls-route.ts` already returns `TOOL_NOT_ALLOWLISTED`, the two allowlists mean the same thing to a caller, and two different spellings for one condition is a bug waiting to be written |
| `SITE_TOOL_SURFACE_UNREACHABLE`, `SITE_SESSION_NOT_ESTABLISHED` | Desktop main process | The site tool client |
| `BIND_TOKEN_UNAVAILABLE` | Desktop main process | The DOM-tool bridge |
| `CONFIRMATION_*` | Desktop main process (for `desktop.*` tools); the site's own exchange store (for site tools, which use the shipped mcp-ui shape) | Split by tool origin; see the report's §3 |
| `WORKSPACE_CHAT_DAEMON_UNAVAILABLE` | Desktop main process | Daemon construction |
| `RUNNER_MAIN_NOT_PORTED` | Desktop main process | `runner-ipc-stubs.ts`, existing, unchanged for the channels this feature does not implement |

**`[OQ-02 OPEN]` and `[OQ-03 OPEN]` note.** None of the codes above depends on either answer. If OQ-03 selects an inbound MCP server instead of plain HTTP, `TOOL_NOT_ALLOWLISTED` is carried as a JSON-RPC error with `isError: true` rather than an HTTP 403 — the code, the meaning, and the requirement that the model can read it are unchanged. Recorded here so the choice does not look like it reopens this file.

---

## 5) Acceptance Checklist

- [x] Every code has an HTTP status (or an explicit "no HTTP surface"), a retry disposition, an owning layer, and a stated audience
- [x] Every code states whether the model sees it, because for this feature that is the load-bearing property
- [x] Every code has a `details` shape
- [x] Every code appears in `traceability.spec.md` §4
- [x] No code is a redacted 500 — every refusal names what was refused
- [x] The one pre-existing code this feature retires (`RUNNER_MAIN_NOT_PORTED`, for five channels) is named with the commit that must retire it
