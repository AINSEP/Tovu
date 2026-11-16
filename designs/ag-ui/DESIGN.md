# One chat protocol: AG-UI everywhere (hard item #7) — DESIGN

Date: 2026-11-16. Docs only. No source file was changed and no test was run.
Read with `INDEX.md` (order, prerequisites, estimates, owner decisions).

**Bases read**

| Repo | Ref | Commit |
|---|---|---|
| Tovu code | `origin/integ/wave-b-r2` (worktree `../code`) | `65302ee5` |
| Jini | `origin/integ/wave-b-r2` | `02edbb68` |
| Inputs | `plan/design-inputs-2026-11-16` (visitor page tools plan), `plan/daemon-untangle-design-2026-11-16` (R7-ROUTES), `plan/terra-2026-11-15` (untangle DESIGN, LANES), `plan/size-designs-2026-11-16` (LESSONS) | as fetched 2026-11-16 |
| AG-UI packages | `@ag-ui/core`, `@ag-ui/client`, `@ag-ui/encoder` **0.0.58** | npm tarballs, read from their `dist/*.d.ts` and `dist/*.mjs` |

Personas used: software-architect (lead), programmer, refactor, tdd, security.
Skills used: implementation-guardrails, feature-slice-design, architecture-migration, hexagonal-architecture, api-design, interface-design, testable-design-patterns, test-design.

---

## 0. Short answer

1. **The brief's picture of today is partly wrong, and the differences change the plan** (§1). The admin chat is on AG-UI only behind a per-browser canary switch. The public site chat does not run on the daemon at all. Jini already holds three of the four AG-UI pieces. Three copies of the same wire reducer exist and have drifted.
2. **What moves:** all AG-UI code ends in one folder, Jini `packages/chat/src/core/ag-ui/`, behind one host contract (§3). Tovu keeps route paths, authentication, the daemon HTTP client, the site's provider turn and its event names. Tovu's 670-line `assistant-ag-ui.ts` shrinks to wiring (target ≤ 120 lines).
3. **Confirmations** use AG-UI's own interrupt protocol, which **0.0.58 already ships**: `RUN_FINISHED` with `outcome: { type: "interrupt", interrupts }`, answered by `RunAgentInput.resume[]` (§5). No CUSTOM event.
4. **Browser-run page tools** become AG-UI frontend tools. The browser may execute a call **only after** `ToolExecutor` has authorized, confirmed and audited it. The call still goes through `FrontendSessionRegistry.invoke`; only the two wires around it change (§6). The bind token leaves the browser.
5. **The run can now outlive one HTTP response** (a paused run waits for a resume request). That is the one real lifecycle change, and the main risk (§7).
6. **Shared state (`STATE_SNAPSHOT`/`STATE_DELTA`): no, not now** (§9). It has no user today.
7. **Estimate:** about 0.25M Opus + 2.6M Sonnet for stages S0 to S5; the admin default path (S6) needs its own design first (§11, INDEX).

---

## 1. What is there today (verified)

Every row was read in the trees above. "Not verified" items are listed in §13.

### 1.1 Facts that differ from the brief

| # | Brief says | Code says | Where |
|---|---|---|---|
| F1 | Admin chat streams over AG-UI | Only when `localStorage["tovu:assistant-ag-ui"] === "1"` in that browser. The default admin paths are the durable daemon path (`POST /api/runs` + `EventSource`, reattachable) and BYOK. The AG-UI path has no reattach and no server-side run record reachable from the client. | `apps/admin/src/lib/assistant-transport-ag-ui.ts:43-53`, `assistant-transport.ts` (`agUi: agUiRunClient`, `getAgUiEnabled`) |
| F2 | "Keep Jini's daemon/run/session layer" for the site chat | The site chat has **no daemon run**. `POST /api/site-assistant/chat` calls `runByokProviderTurn` in the website process for the life of one request. Tools go through a request-lifetime `createVisitorExecutor`, which wraps Jini's `createToolExecutor` and `withToolAttemptAudit`. Its header says: "no admin daemon, registry or proxy enters this composition". | `modules/site-assistant.ts:654-829`, `assistant/site/visitor-executor.ts:44-108`, `visitor-frontend-control.ts:1` |
| F3 | Move Tovu's adapter "next to" Jini's | Jini already has: the event projection in both directions (`chat/src/core/ag-ui/entry.ts`, 310 lines), the client transport (`chat/src/core/assistant-client/ag-ui-transport.ts`, 218 lines, published as `@jini-ai/chat/transports/ag-ui`), and a capability-to-frontend-tool projection (`agentic/src/core/ag-ui.ts`, 127 lines, no production caller). Tovu's file re-exports and forwards to the first one. | files named |
| F4 | One adapter | **Three** daemon-wire-to-`AgentEvent` reducers exist: `chat/core/run-events` `translateRunAgentPayload` (canonical), `chat/core/ag-ui` `reduceAgentWirePayload`, and Tovu `assistant-ag-ui.ts` `reduceAgentWirePayload`. They disagree (§1.4). | files named |
| F5 | (version) | Tovu root and Jini chat pin `@ag-ui/core` **0.0.58** exactly; admin has `^0.0.58` for core and client. npm's latest `@ag-ui/core` is **1.0.4**. A major upgrade is pending, which is the owner's reason for one adapter. | `package.json` files; `npm view @ag-ui/core version` |

### 1.2 Tovu `modules/assistant-ag-ui.ts` (670 lines by `wc -l`; the brief said ~669)

Exports (9 lines, `grep -n "^export"`):

| Export | Kind | Today's users | Fate |
|---|---|---|---|
| `AgUiEvent`, `AgUiTranslationState` (type re-export, line 62) | re-export shell | none in production (admin mirrors the type from Jini directly) | **deleted** (practice 5) |
| `AG_UI_RUN_PATH` | Tovu route path | module itself; admin keeps its own copy (`assistant-transport-ag-ui.ts:38`); `development/parity/route-tool-parity.json:16`; e2e `byok.pins.journey.ts:1274` | stays in Tovu |
| `resolveAgUiMessages` | pure parse | route; `assistant-ag-ui-translate.test.ts` | moves to Jini `run-input.ts` |
| `reduceAgentWirePayload` | pure reduce | route; 2 test files | **deleted**; Jini `run-events` is the one reducer (after §1.4 is pinned) |
| `terminalReasonNotice` | pure | route; test | **deleted**; Jini `run-events` `terminalReasonNotice` already exists (it takes the notice text as an argument, so Tovu's words stay in Tovu) |
| `createAgUiTranslationState`, `translateAgentEventToAgUi`, `closeAgUiRun` | forwarders to Jini with Tovu names bound | route; test | **deleted**; the names (`tovu.usage`, `tovu.status`, `tovu.ext.`) become one host config value |
| `createAssistantAgUiModule` | Express wiring | `composition/app.ts:396, 2415` | stays, shrinks |

Private pieces and their existing Jini owner:

| Tovu private code | Lines (approx.) | Jini already has | Result |
|---|---|---|---|
| `parseDaemonFrame`, `readDaemonSseFrames` | 60 | `core/primitives` `decodeSseFrames`; `chat/core/run-events` `parseFrame`, `readSseFrames` | delete |
| `unwrapDaemonEnvelope`, `handle{Agent,Stdout,Error,End}DaemonFrame`, `handleDaemonFrame` | 95 | `chat/core/run-events` `translateRunFrame({ kind, raw, notices }, { carry })` returns `{ events, error?, terminal? }` | delete after §1.4 goldens |
| `resolveAgUiRunRequest`, `resolveForwarded*` | 55 | none | move to Jini `run-input.ts` |
| `beginAgUiStream`, `writeAgUiEvent`, `drainAgUiStream` | 70 | `core/contracts/server` `createSseStream` (pull-based, 1000-frame cap, injected scheduler) | replace (§7) |
| `handleAgUiRun` close/cancel state machine | 80 with its comment (over the 50-line warn, at the 80 error line) | none | move to Jini `run-stream.ts`, split (§3.4) |
| `startDaemonRun`, `subscribeToDaemonEvents` | 55 | none; they call Tovu's `fetchAgentDaemon` | stay in Tovu as the daemon port binding |

Tests today (counted with `grep -c "^\s*\(it\|test\)("`, so `test.each` rows are not expanded): `assistant-ag-ui-routes.test.ts` 33, `assistant-ag-ui-translate.test.ts` 20, `modules/__tests__/assistant-ag-ui.wire.unit.test.ts` 3; admin `assistant-transport.ag-ui.unit.test.ts` 51; Jini `ag-ui/__tests__` 19 + 6 + 2, `ag-ui-transport.test.ts` 9, agentic `ag-ui.test.ts` 11.

### 1.3 The site chat today

```
browser (apps/site-chat)                         website server
  site-assistant-transport.ts  --POST /api/site-assistant/chat-->  modules/site-assistant.ts
     hand-rolled SSE reader                         runByokProviderTurn (apps/website/src/assistant/byok-provider-turn.ts)
     frames: text | error | end | client_directive    executeTool -> capabilities.invoke -> createVisitorExecutor
  visitor-page-control.ts                             -> Jini createToolExecutor (+ audit, policy, budgets, confirmation gate)
     POST /frontend-sessions/credentials  (guest cookie + tab credential)
     GET  /frontend-sessions/stream       (attached{sessionId, bindToken}, invocation, cancelled)
     POST /frontend-sessions/:id/responses
  tool-confirmation.ts  --POST /api/site-assistant/confirm {challengeId, allow}-->
```

- Wire: `event: text|error|end|client_directive` + `data:` (`site-assistant.ts:237 sse()`). The client is `site-assistant-transport.ts` (350 lines, one hand-written SSE parser, a 90 s idle timer because the server sends no keepalive).
- Tool calls are deliberately **not echoed** to the visitor (`site-assistant.ts:812-815`: echoing would disclose internal tool names and raw lookup results).
- Page tools: `createVisitorFrontendControl` builds Jini's `createFrontendControl({ capabilities: PAGE_CAPABILITIES, … })` with a guest scope (cookie `tovu_visitor_frontend`, path `/api/site-assistant`), 256 sessions, 3 per key, keys `ip:` and `guest:`. A run is bound per request with `control.bindRequest({ runId, bindToken, owner, signal })`.
- Confirmation: the executor's delegate asks `VisitorConfirmations.request`, which emits a `client_directive` `{ kind: "tool_confirmation", challengeId, title, summary }`; the browser answers on `/api/site-assistant/confirm`. The gate re-reads policy and the input digest after the click and again just before the handler (`visitor-confirmation-gate.ts`).
- A navigation or accepted form submit ends the turn (`isTerminalVisitorAction`); the server writes a text line and `end { reason: "navigation" }`, and only then does the browser change the page (`visitor-page-control.ts flushTerminalNavigation`).
- Two widgets share this transport: React (`SiteAssistantWidget.tsx`) and vanilla (`vanilla-host.ts`). Only the loader has a hard size budget (3 KB gzip, `scripts/measure-bundles.mjs`); the widget totals are measured and reported.

### 1.4 The three reducers disagree (must be pinned before any is deleted)

| Wire payload | `run-events` (canonical) | `chat/core/ag-ui` copy | Tovu copy |
|---|---|---|---|
| `tool_use` | adds `toolCallCorrelation` (`bridgeCall`, `toolOrigin`) | plain | plain |
| `tool_result` | adds `media[]`, `outcome: "unknown"` | plain | plain |
| `mcp-ui` | `recoverableSurfaceResource({ resource, exchange })` | raw `payload.resource` | raw `payload.resource` |
| `tool_input_delta` | dropped (`null`) | `ext` | `ext`, so the wire carries `CUSTOM tovu.ext.tool_input_delta` |
| `usage` | `parseUsageEvent` | its own field copy | `parseUsageEvent` |
| `status` without detail | no `detail` key | no `detail` key | `detail: undefined` key |

These are observable on the wire. Deleting two copies without a test would be a silent behaviour change (practice 10). Stage S0 writes one table-driven golden that feeds every `RunAgentPayload` type through all three and records the differences; the owner decision is OD-2.

### 1.5 What AG-UI 0.0.58 gives us (verified in the package)

| Need | AG-UI 0.0.58 | Verified in |
|---|---|---|
| Human-in-the-loop | `RUN_FINISHED.outcome = { type: "interrupt", interrupts: Interrupt[] }`; `Interrupt = { id, reason, message?, toolCallId?, responseSchema?, expiresAt?, metadata? }`; `RunAgentInput.resume?: { interruptId, status: "resolved" \| "cancelled", payload? }[]` | `core/dist/index.d.ts:2267-2302, 2984, 9645+` |
| Client support | `AbstractAgent.pendingInterrupts`, `buildResumeArray`, and a guard that **throws** if a new run does not address every open interrupt or one has expired | `client/dist/index.d.ts:493-496, 618-627`; `index.mjs` |
| Frontend tools | `RunAgentInput.tools[]` (`name`, `description`, `parameters`), `TOOL_CALL_START/ARGS/END/RESULT` | `core` `.d.ts` |
| Agent-made UI carrier | `ACTIVITY_SNAPSHOT { messageId, activityType, content, replace }`, `ACTIVITY_DELTA` | `core/dist/index.d.ts:6526-6534` |
| Shared state | `STATE_SNAPSHOT`, `STATE_DELTA` | enum at `:4172-4173` |
| Tool error flag | **none** on `TOOL_CALL_RESULT` (`messageId, toolCallId, content, role?`). Event schemas are zod `passthrough`, so extra fields survive validation. | `:4434-4443` |
| SSE framing | `data: <json>\n\n`. The client keeps only `data:` lines, so comment frames (`: ping`) and `id:` lines are ignored safely. | encoder and client `index.mjs` |
| Reconnect | `connectAgent()` exists on the abstract agent; whether `HttpAgent` implements `connect` was not verified | `client/dist/index.d.ts:524-525` |

Client weight: `@ag-ui/client` own code is 47 KB raw / 12 KB gzip, `@ag-ui/core` 29 KB / 6.5 KB, and the client also pulls `rxjs`, `zod`, `fast-json-patch`, `uuid`, `untruncate-json`, `compare-versions` (not measured bundled).

---

## 2. Goals and non-goals

Goals (the owner's four items, restated as checks):

- G1. Admin and site chat speak the same AG-UI wire and use the same Jini client transport.
- G2. Page tools are AG-UI frontend tools, and `ToolExecutor` is still the only door for every tool call (trace in §8).
- G3. Confirmations use the AG-UI interrupt shape. No CUSTOM event carries a confirmation.
- G4. A recommendation on shared state, with cost.
- G5. After this work, an AG-UI major upgrade is: bump `@ag-ui/*`, fix files in **one folder**, re-run that folder's round-trip tests. Check: `rg "@ag-ui/" --glob '*.ts'` finds matches only under `packages/chat/src/core/ag-ui/` in Jini and only in `package.json` files plus the one admin line that constructs `HttpAgent` in Tovu.

Non-goals:

- No change to `ToolExecutor`, `RunLifecycle`, `EventLog`, the visitor policy, budgets, or the audit sink.
- The site chat does **not** move onto daemon runs (F2). AG-UI replaces the wire only.
- No rewrite of the 1,018-line `createAssistantTransportClient`; the admin default path is stage S6 with its own design.
- WebMCP (`features/webmcp/`, external browser agents) is untouched.
- The six-tool visitor page set (`page.read`, batched `page.fill`, `page.submit`, …) is the visitor page tools plan's work. This design carries whatever capability list the host passes.

---

## 3. Target shape

### 3.1 One folder, sliced by feature (Jini `packages/chat/src/core/ag-ui/`)

No barrel. Each published subpath points at a real file. `entry.ts` (310 lines today, the `./core/ag-ui` export) is split and deleted; importers are repointed in the same commit.

| File | Holds | From | Size target |
|---|---|---|---|
| `event-projection.ts` | `AgentEvent` to AG-UI events; per-run `AgUiTranslationState`; `closeAgUiRun` | `entry.ts:9-207` | ≤ 200 |
| `event-reduction.ts` | AG-UI events to `AgentEvent`; tool-args accumulation | `entry.ts:210-310` | ≤ 130 |
| `surface-events.ts` | how A2UI, MCP-UI, usage and status ride (§5.4): names, encode, decode | new (replaces the `ext` to CUSTOM default for these two) | ≤ 120 |
| `run-input.ts` | parse and bound an inbound `RunAgentInput`: messages, `resume[]`, tool claims, forwarded props | Tovu `resolveAgUi*`, `resolveForwarded*` | ≤ 180 |
| `pauses.ts` | pause records: create, find by owner, answer once, expire | new | ≤ 160 |
| `interrupts.ts` | pause to `Interrupt`, and `resume[]` entry to answer; the reason constants | new | ≤ 120 |
| `frontend-tools.ts` | capability to AG-UI tool, claim intersection, tool-result text encoding | `agentic/src/core/ag-ui.ts` (moved; `agentic/core/index.ts:77-78` export lines removed) | ≤ 150 |
| `run-stream.ts` | one request to one SSE `Response`: commit, produce, backpressure, close, cleanup (§7) | Tovu `handleAgUiRun`, `drainAgUiStream` | ≤ 220 |
| `run-route.ts` | `agUiRunRoute({ host }) => ServerRoute` (core server vocabulary) | Tovu `createAssistantAgUiModule` (generic half) | ≤ 100 |
| `daemon-frames-source.ts` | a run source over a daemon run's SSE frames, using `run-events` `translateRunFrame`; daemon calls are ports | Tovu frame handlers | ≤ 150 |
| `client/run-client.ts` | `createAgUiRunClient` (today one 113-line function, in `scripts/size-debt.json:374`) split into small functions; interrupts and frontend tools added | `assistant-client/ag-ui-transport.ts` | ≤ 250 |
| `client/frontend-tool-runner.ts` | runs a licensed frontend tool call once on a `ChatPagePort`; replay memory | the invocation half of `embed-widget/browser/frontend-session-bridge.ts` | ≤ 160 |
| `client/light-agent.ts` | a small `fetch` + `decodeSseFrames` client that satisfies the existing `AgUiClient` port, for the embed widget (OD-4) | new | ≤ 150 |

Imports allowed in this folder: its own files, `../events.js`, `../run-events/entry.js`, `../page-port.js`, `@jini-ai/core`, `@jini-ai/protocol`, and the optional peers `@ag-ui/core` and `@ag-ui/encoder`. Nothing from `@jini-ai/daemon`, `@jini-ai/agentic`, `@jini-ai/http-kit`, Express or React.

Published subpaths after the change (`packages/chat/package.json` `exports` and the `jini.entries` map, plus `src/__tests__/fixtures/chat-subpaths.json`):

| Subpath | File | Runtime |
|---|---|---|
| `./core/ag-ui` (kept name) | `event-projection.ts` | universal |
| `./core/ag-ui/reduction` | `event-reduction.ts` | universal |
| `./server/ag-ui` | `run-route.ts` | universal (web `Request`/`Response`) |
| `./transports/ag-ui` (kept name) | `client/run-client.ts` | universal |
| `./transports/ag-ui/light` | `client/light-agent.ts` | universal |
| `./browser/ag-ui-frontend-tools` | `client/frontend-tool-runner.ts` | browser |

`./core/ag-ui` keeps exporting the names admin imports today from it (`AgUiEvent`, `createAgUiTranslationState`, `translateAgentEventToAgUi`, `closeAgUiRun`). The reverse names (`createAgUiToAgentTranslationState`, `translateAgUiEventToAgentEvent`, `AgUiToAgentTranslationState`) move to `./core/ag-ui/reduction`; their importers are listed in §10 S1.

### 3.2 The host contract (practice 1: typed ports from the host)

```ts
// run-route.ts
/** Everything a host supplies to mount one AG-UI run endpoint. Admin and site each build one. */
export interface AgUiRunHost {
  /** Who is calling. Runs first; returning a Response refuses the request before anything starts. */
  readonly authenticate: (required: { request: Request; locals: Record<string, unknown> }) => Promise<AgUiCaller | Response>;
  /** Starts a run, or continues a paused one. The only thing that executes anything. */
  readonly runs: AgUiRunSourcePort;
  /** Paused-run records. Jini ships `createMemoryPauseStore`; a host may bring a durable one later. */
  readonly pauses: AgUiPauseStore;
  /** Wire names for the events AG-UI has no standard shape for (usage, status, unknown extensions). */
  readonly customEventNames: CustomEventNames;
  readonly ids: EventIdGenerator & { newRequestId(): string };
  readonly limits: AgUiRunLimits;          // history count, per-message chars, body bytes, tool-result bytes, pause seconds
  readonly scheduler: SseSchedulerPort;    // keepalive timer (core port)
  readonly clock: { nowMs(): number };
  /** Turns an internal failure into words safe for this audience plus a reference id (practice 9). */
  readonly describeFailure: (required: { error: unknown; phase: AgUiRunPhase; requestId: string }) => { message: string; code: string };
}

export interface AgUiCaller {
  /** Opaque to Jini. Equality decides who may answer a pause. */
  readonly ownerKey: string;
  /** Frontend tool ids this caller may be offered at all (host policy). Empty for a caller with no page. */
  readonly allowedFrontendTools: readonly string[];
}

export function agUiRunRoute({ host, path }: { host: AgUiRunHost; path: string }, _optional: Record<string, never> = {}): ServerRoute
```

```ts
// run-stream.ts
export interface AgUiRunSourcePort {
  start(required: { input: AgUiRunInput; caller: AgUiCaller; signal: AbortSignal }): Promise<AgUiRunStart>;
  resume(required: { paused: AgUiPausedRun; answers: readonly AgUiPauseAnswer[]; caller: AgUiCaller; signal: AbortSignal }): Promise<AgUiRunStart>;
}
export type AgUiRunStart = { readonly ok: true; readonly run: AgUiRunHandle } | { readonly ok: false; readonly response: Response };

export interface AgUiRunHandle {
  /** Pull-based. The stream asks for the next event only when the client can take it (§7.3). */
  next(): Promise<AgUiSourceEvent>;
  /** The client left or the pause expired. Idempotent. */
  cancel(required: { reason: 'client-left' | 'pause-expired' | 'superseded' }): void;
  /** Stop reading but leave the run alive, because it is paused (§7.5). Returns what `resume` needs. */
  park(): AgUiParkToken;
}

export type AgUiSourceEvent =
  | { readonly kind: 'agent'; readonly event: AgentEvent }
  | { readonly kind: 'pause'; readonly pauses: readonly AgUiPauseRequest[] }
  | { readonly kind: 'end'; readonly reason: string }
  | { readonly kind: 'error'; readonly error: unknown };

export type AgUiPauseRequest =
  | { readonly kind: 'confirmation'; readonly id: string; readonly title: string; readonly summary: string; readonly toolCallId?: string; readonly expiresAtMs: number }
  | { readonly kind: 'frontend-tool'; readonly id: string; readonly toolName: string; readonly input: Record<string, unknown>; readonly expiresAtMs: number };

export type AgUiPauseAnswer =
  | { readonly id: string; readonly kind: 'confirmation'; readonly allow: boolean }
  | { readonly id: string; readonly kind: 'frontend-tool'; readonly outcome: { ok: true; output: unknown } | { ok: false; message: string } }
  | { readonly id: string; readonly kind: 'cancelled' };
```

Why `next()` and not an event emitter: a pull makes backpressure and pause explicit, and a fake source in a test is an array.

Hexagonal reading: inbound adapter = `run-route.ts` (HTTP). Inbound port = `AgUiRunSourcePort` as seen from the stream. Outbound ports = `runs`, `pauses`, `scheduler`, `clock`, `ids`, `describeFailure`. Composition roots = Tovu `modules/assistant-ag-ui.ts` (admin) and `modules/site-assistant.ts` (site). Core tests run `run-stream.ts` against an in-memory source, a manual scheduler and `createInMemoryServer` from core; no socket.

### 3.3 The two run sources

| Source | Lives in | Why there | Paused state it must hold |
|---|---|---|---|
| **Daemon frames** (`createDaemonFramesRunSource`) | Jini `daemon-frames-source.ts` | It only speaks the daemon's HTTP wire, which Jini owns. It takes four ports: `startRun`, `openEvents({ runId, afterCursor })`, `cancelRun`, `answer` (surface reply / frontend settle). Tovu binds them to `fetchAgentDaemon`, `fetchAgentDaemonEventStream`, `cancelDaemonRunBestEffort`. | daemon run id, last event cursor, the server-held frontend relay (§6.3) |
| **Site provider turn** | Tovu `assistant/site/visitor-run-source.ts` (new) | It wraps Tovu's `runByokProviderTurn`, the visitor registry, the Tovu confirmation store and the terminal-navigation rule. All of that is host binding (lesson 9). | the in-flight turn promise, its `AbortController`, its bounded event buffer |

One source implementation is generic and one is host-owned. No shared base class: two users with different lifecycles do not justify one (practice 11).

### 3.4 Size and argument rules checked inside each new file (lesson 8)

- Every exported function takes `(required, optional = {})`. Existing positional signatures that move are converted in the move commit of that function, with their callers (`translateAgentEventToAgUi(event, state)` in Tovu's forwarder is already `({ event, state })` in Jini).
- `handleAgUiRun` (80 lines with comment) is split into: `openRun` (authenticate, parse, start or resume; ≤ 35), `pumpRun` (the loop; ≤ 40), `settleRun` (terminal, pause, client-left; ≤ 35), `agUiRunRoute` handler (≤ 25). The long "why" comment about close ordering moves with `settleRun` and is rewritten for `request.signal` (§7.4).
- `createAgUiRunClient` (113 lines, size debt) is split into `startRun`, `subscribeRun`, `settleRunOnce`, `answerPauses`, each ≤ 45. The size-debt entry is removed in the same commit; no new entry is added.
- Exhaustive `switch` over `AgentEvent.kind` and over `AgUiSourceEvent.kind` keep their `never` default. They are the accepted cognitive-complexity justification (testable-design-patterns hatch).
- The frame dispatch table `WIRE_PAYLOAD_REDUCERS` disappears with the duplicate reducers.

---

## 4. Event mapping (one table, one owner file each)

Legend: **std** = standard AG-UI event; **ext** = standard event with a documented extra field (schemas are `passthrough`); **custom** = `CUSTOM` with a host-supplied name.

| Source event | AG-UI wire | Kind | File | Changed from today? |
|---|---|---|---|---|
| run accepted | `RUN_STARTED { threadId, runId, parentRunId? }` | std | `run-stream.ts` | `parentRunId` added on a resumed run |
| `text` | `TEXT_MESSAGE_START/CONTENT/END` | std | `event-projection.ts` | no |
| `thinking` | `REASONING_START`, `REASONING_MESSAGE_START/CONTENT/END`, `REASONING_END` | std | same | no |
| `tool_use` (server-run tool) | `TOOL_CALL_START/ARGS/END` | std | same | no |
| `tool_result` | `TOOL_CALL_RESULT { messageId, toolCallId, content, role: "tool" }` + `isError?`, `media?`, `outcome?` | **ext** | same | **yes**: today `isError` and `media` are lost on this path (OD-3) |
| frontend tool, gate passed | `TOOL_CALL_START/ARGS/END` then interrupt (§6) | std | `run-stream.ts` + `interrupts.ts` | new |
| frontend tool, gate refused | `TOOL_CALL_START/ARGS/END` + `TOOL_CALL_RESULT` in one write; **no interrupt** | std | same | new |
| confirmation needed | `RUN_FINISHED { outcome: { type: "interrupt", interrupts } }` | std | `interrupts.ts` | **yes**: was `CUSTOM tovu.ext.surface_request` (admin) / `client_directive` (site) |
| `a2ui` envelope | `ACTIVITY_SNAPSHOT { activityType: "a2ui", content: { message } }` | std | `surface-events.ts` | **yes**: was `CUSTOM tovu.ext.a2ui` (OD-6) |
| `mcp-ui` resource | `ACTIVITY_SNAPSHOT { activityType: "mcp-ui", content: { toolCallId, resource } }` | std | same | **yes**: was `CUSTOM tovu.ext.mcp-ui` (OD-6) |
| `usage` | `CUSTOM <names.usage>` | custom | `event-projection.ts` | no (mid-stream usage has no standard event) |
| `status` | `CUSTOM <names.status>` | custom | same | no |
| any other `ext` | `CUSTOM <names.extensionPrefix><name>` | custom | same | no |
| `raw` | `RAW` | std | same | no |
| run ended | `RUN_FINISHED { result: { reason }, outcome: { type: "success" } }` | std | `run-stream.ts` | `outcome` added |
| run failed | `RUN_ERROR { message, code }` | std | same | `code` added; `message` is the host's safe words (§7.6) |

Rules that hold across the table:

1. **Lifecycle order is strict.** A text or reasoning message is closed before a tool call starts, before an interrupt, and before `RUN_FINISHED`/`RUN_ERROR`. `closeAgUiRun` is the one place that closes.
2. **`RUN_FINISHED` or `RUN_ERROR` is always the last event of a response**, including a paused one.
3. **The reverse direction is exact for what our own client renders.** Each row has a round-trip golden (§10 S0): `AgentEvent[]` → wire bytes → `AgentEvent[]`, compared with `deepEqual`. The two known lossy rows are stated in the golden, not hidden: `thinking_start` (dropped today) and `TEXT_MESSAGE_START` (becomes a `status step_start`).
4. **Ids are deterministic per run** (`<prefix>_<ordinal>` from the injected generator). That is what makes replay by event count possible later (§7.7).

### 4.1 How A2UI and MCP ride

- **A2UI** (agent-made UI, a2ui.org envelopes) stays the content format. Each envelope message (`createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`, …) is one `ACTIVITY_SNAPSHOT` with `activityType: "a2ui"`, `messageId: a2ui_<ordinal>`, `content: { message }`. Our client turns it back into the same `ext a2ui` `AgentEvent` the existing `A2uiSurfaceCard` renders, so the renderer does not change. A2UI actions from the user keep going through `createA2uiActionPoster` (unchanged; it is a plain host POST, not an AG-UI event).
- **MCP-UI** resources (the human-only blocks the daemon withholds from the model) ride the same way with `activityType: "mcp-ui"`. They never become a tool result, so the property "the model cannot read the dialog it must not approve" is unchanged.
- **MCP** itself is not on this wire. It stays the tool plane between an agent CLI and the daemon (`delegated-tool-bridge`, `@jini-ai/mcp`). An MCP tool call shows up here as an ordinary `TOOL_CALL_*` because the daemon already emits it as `tool_use`/`tool_result`.
- Cost on the hot path: O(1) per envelope, no per-surface state on the server, no JSON Patch. One `ACTIVITY_SNAPSHOT` per message means a stock AG-UI client shows several activity entries for one surface; ours assembles them. If a single evolving entry per surface is wanted later, that is `ACTIVITY_DELTA` with an append patch and a per-run surface set (bounded); not built now (no user).
