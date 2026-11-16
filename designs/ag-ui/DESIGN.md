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
| F1 | Admin chat streams over AG-UI | Only when `localStorage["tovu:assistant-ag-ui"] === "1"` in that browser. The default admin paths are the durable daemon path (`POST /api/runs` + `EventSource`, reattachable) and BYOK. The AG-UI path has no reattach and no server-side run record reachable from the client. | `apps/admin/src/lib/assistant-transport-ag-ui.ts:43-55`, `assistant-transport.ts` (`agUi: agUiRunClient`, `getAgUiEnabled`) |
| F2 | "Keep Jini's daemon/run/session layer" for the site chat | The site chat has **no daemon run**. `POST /api/site-assistant/chat` calls `runByokProviderTurn` in the website process for the life of one request. Tools go through a request-lifetime `createVisitorExecutor`, which wraps Jini's `createToolExecutor` and `withToolAttemptAudit`. Its header says: "no admin daemon, registry or proxy enters this composition". | `modules/site-assistant.ts:654-829`, `assistant/site/visitor-executor.ts:45-111`, `visitor-frontend-control.ts:1` |
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
| `handleAgUiRun` close/cancel state machine | 79 (lines 570-648, about 25 of them comment; over the 50-line warn either way; the file has no size-debt entry) | none | move to Jini `run-stream.ts`, split (§3.4) |
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
- Tool calls are deliberately **not echoed** to the visitor (`site-assistant.ts:813`: echoing would disclose internal tool names and raw lookup results).
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
- `handleAgUiRun` (79 lines with its comment) is split into: `openRun` (authenticate, parse, start or resume; ≤ 35), `pumpRun` (the loop; ≤ 40), `settleRun` (terminal, pause, client-left; ≤ 35), `agUiRunRoute` handler (≤ 25). The long "why" comment about close ordering moves with `settleRun` and is rewritten for `request.signal` (§7.4).
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

---

## 5. Confirmations as AG-UI interrupts

### 5.1 Wire shape

A run that needs a human answer ends its response like this:

```json
{ "type": "RUN_FINISHED", "threadId": "t1", "runId": "r1",
  "outcome": { "type": "interrupt", "interrupts": [
    { "id": "<pause id>", "reason": "confirmation", "toolCallId": "<when one is known>",
      "message": "Allow navigation? Open a published public page.",
      "responseSchema": { "type": "object", "properties": { "allow": { "type": "boolean" } }, "required": ["allow"] },
      "expiresAt": "2026-11-16T18:31:00.000Z",
      "metadata": { "title": "Allow navigation?", "summary": "Open a published public page." } } ] } }
```

The client answers with a new run on the same thread:

```json
{ "threadId": "t1", "runId": "r2", "parentRunId": "r1", "messages": [], "tools": [],
  "resume": [ { "interruptId": "<pause id>", "status": "resolved", "payload": { "allow": true } } ] }
```

`status: "cancelled"` (the user closed the prompt) and `payload.allow === false` both reach the source as a refusal; `ToolExecutor` records `confirmation-denied` for a decline and `cancelled` when the requester vanished, exactly as it distinguishes them today.

The `reason` values (`"confirmation"`, `"frontend_tool"`) are constants in `interrupts.ts`. The schema types `reason` as a free string (verified). Whether AG-UI documents preferred reason words was not verified (§13); if it does, only those two constants change.

### 5.2 Where each side's confirmation comes from (unchanged owners)

| Path | Who decides a confirmation is needed | How it reaches the source today | Change |
|---|---|---|---|
| Site | `ToolExecutor` (`requiresConfirmation` on an Ask-mode registration, or `requireConfirmation: true` per call) → `ExecutionDelegate.onConfirm` → `createVisitorConfirmationGate.confirm` → `VisitorConfirmations.request({ emit, validate, … })` | `emit` writes `client_directive` on the response | `emit` now pushes a `pause` event into the run source. The challenge id becomes the interrupt id. The answer no longer arrives on `/api/site-assistant/confirm`; the source calls the **same** `confirmations` function that route's handler calls, with the same owner check and the same rate limiter. Policy re-read, input digest and publication checks in the gate are untouched. |
| Admin (daemon) | `ToolExecutor` inside the daemon | wire payload `surface_request { surfaceId, surfaceKind: "confirmation", payload }`, which today falls through to `CUSTOM tovu.ext.surface_request` | `daemon-frames-source.ts` turns a `surface_request` whose `surfaceKind` is `confirmation` into a `pause`. The answer goes to the daemon through the `answer` port (the existing surface reply call). `form`, `choice` and `oauth-prompt` surfaces keep riding as `CUSTOM` until they have a consumer on this path (they are not confirmations). |

Nothing new decides anything. The interrupt is a rendering of a wait that `ToolExecutor` already owns.

### 5.3 Rules

1. **Human-only.** An interrupt never becomes an `AgentEvent`, never enters `collected`, a saved transcript, or the next provider history. Today's rule for `client_directive` ("challenges never enter events, persisted messages or provider history", `site-assistant-transport.ts:162`) is kept by construction: the client hands interrupts to an `onPause` handler, not to `handlers.onEvent`. A characterization test asserts the transcript after an Ask-mode call contains no challenge id.
2. **Only `resume[]` answers a pause.** `messages` (including `role: "tool"` entries), `forwardedProps`, `state` and `context` are never read for an answer.
3. **One answer, exact set.** A resume request must address every open pause of the parked run and nothing else. A second answer for the same id is refused (`409`), not replayed.
4. **Expiry is the server's.** `expiresAt` is advisory for the UI. The server timer (site: `VISITOR_CONFIRMATION_WAIT_MS` = 60 s, verified; daemon: the daemon's own surface timeout) settles the wait as a refusal and releases the parked run (§7.5).
5. **Copy stays CMS-owned on the site.** `confirmationCopy` keeps building the title and summary from fixed strings plus one sanitized field. The model's raw input is never serialized into an interrupt.

### 5.4 What the two widgets render

No new UI. The React widget and the vanilla strip already render a title, a summary, Allow and Cancel from a `ToolConfirmation`. `apps/site-chat/src/tool-confirmation.ts` keeps `parseToolConfirmation`'s bounds (22-char id pattern, 200/240 chars) applied to the interrupt, and `confirmSiteAssistantTool` is replaced by "answer this pause" on the transport. `vanilla-tool-confirmation.ts` (DOM projection, focus, 60 s deadline) does not change.

---

## 6. Page tools as AG-UI frontend tools

### 6.1 The rule that keeps `ToolExecutor` the only door

In plain AG-UI a client runs a frontend tool as soon as it sees `TOOL_CALL_END` for a tool it declared. If we emitted that event when the model asked for `page.click`, the browser would click **before** policy, budget, confirmation and audit had run. So:

> **FT-1.** The server emits the event that licenses browser execution only from inside `FrontendSessionRegistry`'s `deliver` callback. That callback is reachable only from a `ToolHandler`, which `ToolExecutor` runs only after authorization and confirmation. The browser executes the **input carried by that delivery**, never the model's raw arguments.

> **FT-2.** Our client executes a frontend tool only when the response ends with an interrupt whose `reason` is `"frontend_tool"` and whose `toolCallId` names it. Seeing `TOOL_CALL_END` alone executes nothing.

> **FT-3.** A frontend tool call that the gate refuses is written as a finished call: `TOOL_CALL_START/ARGS/END` and `TOOL_CALL_RESULT` in the same write, with no interrupt. A client that only knows the plain AG-UI flow sees a call that already has its result.

FT-1 protects every client. FT-2 and FT-3 protect a stock AG-UI client from running a refused call; how a stock client (CopilotKit) treats a call that already has a result was not verified (§13).

### 6.2 Sequence (site)

```
model: tool call page.click {id}
  -> executeTool -> capabilities.invoke -> ToolExecutor
       authorize (policy re-read, mode, budget charge)        [unchanged]
       confirm if Ask / forced                                [§5; may pause once here]
       handler -> registry.invoke(runId, "page.click", input) [unchanged]
            -> deliver(invocation)                            <- NEW transport: push a pause into the run source
  stream: TOOL_CALL_START/ARGS/END(toolCallId = fe_<invocationId>, args = invocation.input)
          RUN_FINISHED { outcome: interrupt [{ id, reason: "frontend_tool", toolCallId }] }
browser: frontend-tool-runner executes on ChatPagePort (once; replay memory)
  -> POST same route, resume [{ interruptId, status: "resolved", payload: { ok: true, output } }]
server: authenticate -> pause store (owner + thread + exact id set) -> attachment.settle(invocationId, outcome)
       handler returns -> ToolExecutor completes, truncates, audits   [unchanged]
  stream: RUN_STARTED(parentRunId) TOOL_CALL_RESULT ... (run continues)
```

`toolCallId` for a frontend execution is derived from the registry's `invocationId` (minted by the registry, "never supplied by the surface"). It is not the provider's tool-use id: `FrontendInvocation` carries `invocationId`, `capabilityId` and `input` only, and the handler context exposes `executionId` but no model tool-use id that I found. On the site this costs nothing, because server-run tool calls are not echoed at all. On the admin path the daemon also emits its own `tool_use`/`tool_result` for the same call; §6.4 says how the two are kept from showing twice.

### 6.3 Who attaches, and what leaves the wire

Today a tab holds a long-lived SSE stream, receives a `bindToken` on it, and sends the token with each chat request. In the new shape the surface **is** the run request:

| Step | Today | New |
|---|---|---|
| Prove the tab | guest cookie + `x-frontend-tab` credential + `x-visitor-publication` | same three, on the AG-UI run request (`authenticate` port) |
| Claim capabilities | `?capability=` query on the stream, intersected with `allowedCapabilities` | `RunAgentInput.tools[].name`, intersected with `caller.allowedFrontendTools`. **Descriptions and parameter schemas sent by the client are ignored**; the server's `CapabilityDef` is the only source of what the model is told. |
| Attach | `registry.attach` in the stream route | `frontend.attachRun({ runId, owner, capabilities, capacityKeys, deliver, cancel, signal })` at run start, released at run end |
| Bind the run | `bindRunByToken(runId, bindToken, owner)` | done inside `attachRun` (attach and bind in one server-side step) |
| Deliver | SSE `invocation` frame | `pause` event → interrupt |
| Answer | `POST /frontend-sessions/:sessionId/responses` + bind token header | `resume[]` on the run route → `attachment.settle` |
| Cancel | SSE `cancelled` frame | the paused run's next response carries `TOOL_CALL_RESULT` with the cancellation as content; a tab that never resumes is covered by the pause timer |

Removed from the browser: the session id in a URL, the bind token, the `/stream` and `/responses` routes for AG-UI hosts. `/frontend-sessions/credentials` stays (it is how a tab is authenticated).

**One daemon change is needed** (`packages/daemon/src/http/frontend-control.ts`): a fourth facade method.

```ts
/** A request-scoped surface: attaches, binds one run, and can only answer its own invocations. */
attachRun(required: {
  runId: string; owner: FrontendSessionOwner; capabilities: readonly string[]; capacityKeys?: readonly string[];
  deliver: (invocation: FrontendInvocation) => void; cancel: (required: { invocationId: string }) => void; signal: AbortSignal;
}, optional?: Record<string, never>): { settle(required: { invocationId: string; outcome: FrontendOutcome }): boolean; release(): void };
```

It keeps the facade's most important property: **the registry is still never returned**, and the handle has no `invoke`. `settle` is the same registry call the responses route makes after its ownership check. Capacity (`maxSessions`, `maxSessionsPerKey`, capacity keys) applies exactly as for a stream attachment because it goes through the same `registry.attach`. `bindRequest` (today's site hook) loses its last caller at the end of S5 and is deleted then.

**Admin (daemon reached over HTTP).** The website process cannot call the daemon's registry in-process. The daemon-frames source therefore acts as the surface on the browser's behalf, using the daemon's existing routes server-to-server: it opens `GET /api/frontend-sessions/stream?capability=…` as the admin principal, reads `attached { bindToken }`, starts the run with that token in `contextRef` (as today), turns each `invocation` frame into a `pause`, and posts the answer to `/:sessionId/responses`. This needs **no daemon change**. The small client for those two routes belongs to the package that owns the routes: new `packages/daemon/src/http/frontend-session-client.ts` (fetch injected, `decodeSseFrames` from core). Tovu wires it into the source's `answer`/relay ports. The relay stream lives as long as the run, including while paused (a detached relay would make the registry reject the pending call).

### 6.4 Admin: one call, one card

For a frontend tool on the daemon path two things arrive: the daemon's `tool_use` (model's id, raw args, before the gate) and later the relay's `invocation` (after the gate). Rule: for a tool id in the caller's claimed frontend set, the source **holds** the `tool_use` and emits nothing yet. Then:

- an `invocation` for that capability arrives → emit `TOOL_CALL_START/ARGS/END` with the held call's id and the **invocation's** input, then pause;
- a `tool_result` for the held id arrives with no invocation (refused, denied, timed out) → emit the finished call (FT-3).

Pairing is first-in-first-out per capability id within the run. If two identical-capability calls race, only which display id gets which result can swap; what executes is always an invocation's own input. A stale held call cannot leak: it is flushed by its `tool_result` or by run end. Memory: at most the model's in-flight calls for claimed ids (bounded by the daemon's own tool concurrency).

### 6.5 Terminal actions (navigation, form submit)

Order today: browser returns the result → server accepts it → server ends the turn with a text line and `end { reason: "navigation" }` → browser saves the transcript → browser navigates. New order is the same with different wires: resume carries the result → the site source applies `isTerminalVisitorAction` → stream emits the text message and `RUN_FINISHED { result: { reason: "navigation" } }` → the client's existing `finish({ navigation: true, messages })` path runs. `visitor-page-control.ts`'s `flushTerminalNavigation` and its guard against replaying an old effect on rehydrate stay.

### 6.6 The page-approval dialog (admin) — decision OD-5

Today a protected admin page call shows a browser dialog (`pageApproval`), and the browser reports `approval-pending`, then `execution-started` with the decision **before** it performs the effect, so the audit shows the decision even if the tab dies mid-effect. With pause/resume there are two ways to keep "decision recorded before effect":

- **(a) Recommended:** make it a `ToolExecutor` confirmation (`requiresConfirmation` on the capability instead of `requiresFrontendApproval`). The confirmation interrupt comes first (§5), `resumeConfirmation` records it, and only then the handler runs and the frontend-tool interrupt follows. Two round trips, one confirmation mechanism for every tool, same dialog component.
- **(b)** Keep `requiresFrontendApproval` and emulate the two progress phases with two interrupts on the frontend-tool pause.

(a) removes a second confirm mechanism, which is what "only door" asks for, but it changes where the decision is taken, so it needs sign-off.

---

## 7. Streaming lifecycle (each phase separate)

`run-stream.ts` owns these seven phases. Each has its own function and its own test.

### 7.1 Response commitment

Everything that can refuse does so **before** the SSE `Response` is created, so a refusal is a normal status code:

| Order | Check | Failure answer |
|---|---|---|
| 1 | `host.authenticate` | the host's `Response` (401/403/429) |
| 2 | body size (`limits.maxBodyBytes`), JSON parse | 413 / 400 |
| 3 | `parseRunInput` (messages end with a user turn, **or** `resume[]` is non-empty) | 400 `VALIDATION_ERROR` naming the field |
| 4 | resume only: pause store lookup by `ownerKey` + `threadId` + exact id set, not expired, not answered | 404 (unknown or not yours; one answer for both), 409 (already answered), 410 (expired) |
| 5 | `runs.start` / `runs.resume` | the source's `Response` (today's 502/503 from the daemon client, or the site's public error) |
| 6 | commit: `createSseStream(...)`, queue `RUN_STARTED`, return `stream.response` | none; from here failures are events |

This keeps today's rule from `assistant-ag-ui.ts:619-621` ("start the daemon run before switching into SSE mode"). Test: a source whose `start` never resolves leaves the response uncommitted; aborting the request then cancels nothing that exists.

### 7.2 Production

One loop: `event = await run.next()`, project, `stream.send`. Terminal source events (`end`, `error`, `pause`) leave the loop through `settleRun`. Projection is pure and per-run; no module-level state (the existing rule about concurrent admins and tabs).

### 7.3 Backpressure

`createSseStream` is pull-based and drops the connection at 1,000 queued frames (core, SEC-006). The loop adds real backpressure on top so the cap is not the normal control: after each `send` it awaits a `stream.drained()` signal when the queue is above a high-water mark (64 frames), and only then calls `run.next()` again. `drained()` is not on `SseStream` today; it is a small addition to core `contracts/server/sse.ts` (the `wake` cell already exists). Without it, the fallback is the 1,000-frame drop, which is safe but turns a slow client into a cancelled run. For the daemon source, not calling `next()` stops reading the upstream body, so the daemon's own stream cap applies there. For the site source, events are produced by the provider callback; the source buffers at most 256 events and aborts the turn beyond that (memory bound stated, practice 12).

Per event cost: one `JSON.stringify`, one string frame, no copy of history. Usage and status events are small; A2UI envelopes are bounded by the daemon's existing surface size limits.

### 7.4 Client disconnect

Signal: `request.signal` (R7's rule; replaces `res.on("close")`). What it means depends on the phase:

| When the client leaves | Action |
|---|---|
| before the run exists | nothing to cancel; if `start` resolves later, cancel that run immediately (today's `closedEarly` case; test kept) |
| while producing | `run.cancel({ reason: "client-left" })`, once |
| after a terminal event was queued | nothing (today's `runFinished` guard) |
| after a pause was queued | nothing; the run is parked and owned by the pause timer (§7.5) |

The long comment in `handleAgUiRun` that explains the two leak windows and the "exactly once" argument moves with this code and is updated to name `request.signal`.

### 7.5 Pause, park, resume

- On a `pause` event: close open messages, emit any licensed tool-call triplets, create one pause record per request, call `run.park()`, queue `RUN_FINISHED(interrupt)`, end the stream. The pause record holds `{ ids, ownerKey, threadId, runId, parkToken, expiresAtMs }`.
- The pause store is in memory in the process that holds the parked run (a parked run holds live objects: a promise, a relay stream). Caps: global and per `ownerKey`, set by the host (site: 1 per guest, 2 per IP through `ownerKey` composition, global = the frontend session cap of 256; admin: 4 per principal). Over the cap, the pause is refused: the tool call fails with a plain message and the run continues.
- Timer: one deadline per pause record from `clock` + `scheduler`. On expiry the source is told `cancel({ reason: "pause-expired" })`. Site: the turn's `AbortController` fires, `ToolExecutor` reports `cancelled`, the frontend attachment is released, the audit sink gets its terminal phase. Admin (until S6): the daemon run is cancelled, as a vanished client is today.
- Resume: a new request, a new response, a new AG-UI `runId` with `parentRunId`. The same translation state continues (it is part of the park token) so message ids keep counting.
- A paused run counts against the same per-IP and per-guest budgets as an open connection does today. It is cheaper for an attacker only by one socket.

### 7.6 Errors

- Before commit: status code + JSON `{ error, code, requestId }`.
- After commit: `RUN_ERROR { message, code }` then end. `message` comes from `host.describeFailure`, never from `error.message` directly. Today `drainAgUiStream` sends `error.message` to the admin and the site sends a fixed public sentence with an error id; both behaviours are kept by each host's `describeFailure` (admin: plain words + the redacted detail + request id; site: the fixed public message + error id).
- Nothing is swallowed: every `catch` either rethrows, or calls `describeFailure` (which logs with the request id) and emits. The one silent catch that stays is the existing "reporting channel itself failed" case in the daemon's bind-error sink.
- A stream that ends with no terminal source event still gets `RUN_FINISHED { result: { reason: "stop" } }` (today's dual-completion behaviour), pinned by a test.

### 7.7 Reconnect and replay

- **S1 to S5: none**, same as the canary today. A dropped stream is an ended turn; the client shows what it has. This is stated in the client (`reattachRun` answers "already over").
- **Keepalive** is new: `createSseStream` writes `: ping` every 15 s. The official client ignores comment frames (verified). The site client's 90 s idle timer stays as the last line of defence.
- **S6 design hook (not built here):** because event ids are deterministic and projection is pure, replay can be "re-read the daemon run's events from the start, re-project, skip the first N", with `id: <N>` on each frame and `Last-Event-ID` on reconnect. Cost is CPU proportional to the run on each reconnect and no extra server memory. It depends on the daemon's event-log retention, which was not verified.

### 7.8 Cleanup (one place)

`createSseStream`'s `onClose` runs once for abort, overflow and `end()`. `settleRun` is the only caller that decides between cancel, park and nothing. Every resource has one owner:

| Resource | Owner | Released when |
|---|---|---|
| upstream daemon event reader | daemon-frames source | `cancel`, `park` (reader only), terminal |
| frontend attachment / relay | the run source | run terminal or pause expiry (not on response close) |
| pause record + timer | pause store | answered, expired |
| keepalive timer | `createSseStream` | `onClose` |
| tracker span (`assistant.run`) | Tovu wiring, through a `onOutcome` callback on the route | terminal, cancel; a paused response reports `paused`, not `succeeded` |

---

## 8. Security: the whole chain, gate by gate

Classes and fixes only (public repos).

| # | Class | Where it could appear | Design answer | Test that can fail |
|---|---|---|---|---|
| S1 | Execution before authorization | a frontend tool event emitted at `tool_use` time | FT-1/FT-2/FT-3 (§6.1) | fake policy denies → browser fake records zero executions and the stream has no `frontend_tool` interrupt |
| S2 | Client-defined tools | `RunAgentInput.tools` | names are a claim only, intersected with host policy; descriptions and schemas ignored; unknown names dropped | a request declaring an unlisted tool and a hostile description → model-facing descriptor unchanged |
| S3 | Forged answer | `resume[]`, or a `role: "tool"` message | pause ids are 128-bit, single-use, stored server-side, matched on `ownerKey` + `threadId` + exact set; tool messages never settle anything | wrong owner → 404; replay → 409; tool message with a valid pause's `toolCallId` → ignored |
| S4 | Self-approval by the model | interrupt id or challenge reaching model-visible text | interrupts are not `AgentEvent`s; ids never enter tool results or history (unchanged rule) | transcript and provider history after an Ask call contain no pause id |
| S5 | Cross-tab or cross-user control | binding a run to another surface | no cross-request bind exists any more: run and surface are one authenticated exchange; `sameFrontendOwner` equality on resume; a second tab has a different tab credential | resume from another tab credential → 404 |
| S6 | Cross-site request | run and resume POSTs | same-origin check stays in the host's `authenticate` (site: `allowsVisitorRequestOrigin`; admin: `requireAdminSession`), and the tab credential is a custom header a cross-site form cannot set | cross-origin POST → 403 before any source call |
| S7 | Resource exhaustion | parked runs, relay streams, event queues | caps and deadlines in §7.3 and §7.5; resume requests pass the same rate limiter as chat requests | cap+1 pauses → tool call fails, run continues; slow reader → bounded queue |
| S8 | Disclosure to visitors | echoing server tool calls | the site source emits **no** `tool_use`/`tool_result` for server-run tools (today's rule); only page tools the browser must run are visible, with input the browser receives today anyway | site golden stream contains no content-tool name |
| S9 | Error text leakage | `RUN_ERROR.message` | `describeFailure` per audience; secrets redaction stays in the host reporter | provider error containing a key-shaped string → stream shows the public sentence |
| S10 | Untrusted page output | frontend tool results | still pass through `ToolExecutor`'s `maxOutputBytes` truncation (24 KB site) because the handler returns them; the client-side 96 KB bound stays in the runner | oversize result → truncated in the tool result, run continues |
| S11 | Stale approval | policy or input changed between click and execution | the gate's revision + digest re-check is unchanged and still runs just before the handler | existing gate tests, re-run on the new transport |
| S12 | Inbound `state` / `context` / `forwardedProps` | future shared state, prompt stuffing | `state` and `context` are ignored; `forwardedProps` is read for a fixed allow-list of bounded fields only (`agentId`, `secretRedacted`); the bind-token fields are removed | unknown forwarded prop has no effect; `state` has no effect |

What gets **weaker or different** and why it is acceptable:

- The bind token is gone. It existed because session ids travel in URLs and binding was a separate request. Neither is true now (S5).
- A run can exist without an open connection for up to the pause deadline (S7). Bounded, counted, and timed.
- Admin: the website server now holds the frontend relay that the browser used to hold. It runs as the same admin principal that started the run; the daemon's ownership checks on those routes are unchanged.

---

## 9. Shared state (`STATE_SNAPSHOT` / `STATE_DELTA`): recommend **no** for now

| Question | Answer |
|---|---|
| Is there a user today? | No. No feature reads or writes run-scoped shared state. The client sends `state: null` and the server ignores it. |
| What it would need | a server-owned state document per thread; a rule for who may write which path; JSON Patch generation and coalescing on the event hot path; snapshot-first on every reconnect; persistence with the conversation; conflict handling for two writers |
| Security cost | inbound `state` is client-supplied. It would need the same treatment as tool input: never trusted for authorization, bounded, validated per path. A new surface for S12. |
| Hot-path cost | one patch per change (coalesce to ≥ 50 ms), a snapshot cap (64 KB) re-sent on each reconnect, plus `fast-json-patch` on the client (already a dependency of `@ag-ui/client`, not of the light client) |
| Build cost | about 1 Opus design (60k) + 450k Sonnet, and it depends on S6 (reconnect) to be useful |
| What we do now | reserve the events: the projection type simply does not include them, and one test asserts inbound `state` changes nothing. When a real co-editing feature is specified, decide then whether AG-UI state or the editor's own sync channel fits it. |

This follows practice 11 (no abstraction without a user).

---

## 10. Migration: stages and commits

Each commit compiles and passes alone, lists its caller and test updates, and has one change type. Jini first, then Tovu, per the lane rule.

### S0. Characterize (tests only; must be able to fail)

| Test | Pins | Fails if |
|---|---|---|
| T0-1 `ag-ui-wire.golden` (Tovu, admin route) | the exact SSE bytes for a fixture daemon stream covering every `RunAgentPayload` type, `stdout`, `error`, `end` with `max_tool_turns`, and a stream that closes with no `end`; response headers on HTTP/1.1 | any event, order, id, header or frame text changes |
| T0-2 `reducer-drift.unit` (Jini) | the §1.4 table: all three reducers over one payload fixture, differences listed explicitly | a copy is deleted while a listed difference is still observable |
| T0-3 `ag-ui-round-trip.golden` (Jini) | `AgentEvent[]` → encoder bytes → official `EventSchemas` parse → reducer → `AgentEvent[]`; ids from a fixed generator | projection or reduction changes shape; **an AG-UI upgrade breaks a schema** (this is the upgrade canary) |
| T0-4 `site-chat-stream.golden` (Tovu) | today's site frames for: plain reply, Ask-mode content tool (directive, allow, deny, expiry), `page.navigate` (text + `end navigation`, navigation only after `end`), provider error, visitor abort | lifecycle order or disclosure changes |
| T0-5 `cancel-windows` (Tovu, exists; extended) | client leaves before start resolves / while subscribing / mid-stream / after finish → exactly 1, 1, 1, 0 daemon cancels | the close state machine regresses in the move |
| T0-6 `bridge-replay` (Jini, exists) | an executed invocation id is never executed twice | the runner loses replay memory |

Clock, ids and randomness are injected in all six. T0-1 and T0-4 are mutation-checked once (change one emitted field, see red, revert).

### S1. Consolidate in Jini (move and dedupe; wire bytes unchanged)

| # | Repo | Commit | Prerequisite | Callers and tests updated in the same commit |
|---|---|---|---|---|
| 1.1 | Jini | split `ag-ui/entry.ts` into `event-projection.ts` + `event-reduction.ts`; delete `entry.ts`; repoint `./core/ag-ui`, add `./core/ag-ui/reduction` | S0 | `assistant-client/ag-ui-transport.ts`; 3 files in `ag-ui/__tests__`; `core/__tests__/conversation-cost.test.ts`; `package.json` exports + `jini.entries`; `chat-subpaths.json`; `docs/spec/api.spec.md`; `CAPABILITIES.md`; `dbpkg-chat/host-callers.json` |
| 1.2 | Jini | delete `reduceAgentWirePayload` from the AG-UI folder; projection callers use `run-events` `translateRunAgentPayload`. Only after OD-2 is answered. | 1.1, OD-2 | `ports.test.ts`, `translation.test.ts`; T0-2 rewritten as a single-reducer test |
| 1.3 | Jini | add `run-input.ts` (moved from Tovu with its why-comments) + its unit tests (moved from `assistant-ag-ui-translate.test.ts`) | 1.1 | none yet (new file, first user in 1.6) |
| 1.4 | Jini | add `daemon-frames-source.ts` over `translateRunFrame`, with a fake-port test fed by T0-1's fixture | 1.2 | none yet |
| 1.5 | Jini | move `agentic/src/core/ag-ui.ts` → `chat/.../frontend-tools.ts`; remove the two export lines in `agentic/core/index.ts` | 1.1 | `agentic/core/__tests__/ag-ui.test.ts` moves; `messages.contract.test.ts:2,11` drops its `toAgUiTool` assertion or moves it; `knip.json` if it lists the file |
| 1.6 | Tovu | `assistant-ag-ui.ts` uses 1.3 and 1.4; deletes its reducers, frame parsers, forwarders and the type re-export | Jini 1.1–1.4 published to the linked base | `assistant-ag-ui-translate.test.ts` (shrinks to Tovu's names and notice text), `assistant-ag-ui.wire.unit.test.ts`, T0-1 must stay byte-identical; `apps/admin/.../assistant-transport.ag-ui.unit.test.ts:3` and `assistant-transport-ag-ui.ts:36` repoint to `/reduction` |

End of S1: the Express response-writing still lives in Tovu. That is deliberate (next stage's prerequisite).

### S2. The route becomes a `ServerRoute` (needs the untangle lanes)

Prerequisites, all from the daemon untangle design: C4 (landed at `02edbb68`: `ServerRoute`, `createSseStream`, `readJsonBody`), **P-NODE-BRIDGE** (not landed: without it no host can mount a `ServerRoute`), C-ORIGIN-PORT for test hosts. If P-NODE-BRIDGE has not landed, S2 waits; Tovu does not write its own bridge.

| # | Repo | Commit |
|---|---|---|
| 2.1 | Jini | core `sse.ts`: add `drained()` (failing test first: a producer that awaits it never exceeds the high-water mark) |
| 2.2 | Jini | `run-stream.ts` + `run-route.ts` + `pauses.ts` (memory store) with fakes; `./server/ag-ui` export. Pause paths exist but no source emits a pause yet. |
| 2.3 | Tovu | `assistant-ag-ui.ts` builds an `AgUiRunHost` and mounts `agUiRunRoute` through `mountJiniRoutes` (R7 §4.2) on the line of today's `app.post`. `requireAdminSession` stays an Express gate above it. T0-1 allowed differences, listed in the commit: keepalive comment frames, `outcome` on `RUN_FINISHED`, the `connection` header (see §13). |

### S3. Confirmations as interrupts (admin canary first)

3.1 Jini: `interrupts.ts`; client `run-client.ts` gains `onPause` and `answerPauses` (uses `buildResumeArray` semantics; the light client implements the same). 3.2 Jini: daemon-frames source maps confirmation surfaces to pauses. 3.3 Tovu admin: the dock's existing confirmation UI is fed from `onPause`. Canary only, so no default user is affected.

### S4. Frontend tools (admin canary)

Prerequisite: R7's frontend-sessions group (it renames `httpExtension` → `routes` and changes `resolveOwner`'s signature in the same file). 4.1 Jini daemon: `attachRun` on the facade + tests through fakes of the registry interface; `frontend-session-client.ts`. 4.2 Jini chat: `client/frontend-tool-runner.ts` (moved from the bridge's `servePage`/`serveLocally`/`remember`, with their comments); the bridge keeps its attachment half for non-AG-UI hosts until S6. 4.3 Jini: hold-and-pair in the daemon-frames source (§6.4). 4.4 Tovu admin: canary passes page tool claims; `frontendBindToken`/`frontendTabId` forwarded props removed from `run-input.ts` and the client in the same pair of commits. OD-5 decides the approval dialog.

### S5. Site chat cutover

5.1 Tovu: `visitor-run-source.ts` wrapping the body of `handleChat` (provider turn, executor, terminal action rule); `site-assistant.ts` shrinks (it carries three size-debt entries today, `development/scripts/size-debt.json:1748-1762`; the move must not add one). 5.2 Tovu: new route `POST /api/site-assistant/ag-ui-run` next to the old `/chat`; the public JSON body-error handler and preflight stay in front. 5.3 Jini: `client/light-agent.ts` (if OD-4 says light). 5.4 Tovu site-chat: `createSiteAssistantTransport` becomes a thin binding of Jini's run client (errors through `visitorFacingError`, idle timer kept); `visitor-page-control.ts` drops the bridge and uses the runner; both widgets unchanged above the transport. 5.5 After one release with the new route on (OD-7): delete `/chat`, `/confirm`, `/frontend-sessions/stream`, `/frontend-sessions/:id/responses`, `client-directives.ts`, `bindRequest`, and the hand-written SSE parser. T0-4 is replaced by its AG-UI twin with the same scenario list; the scenario count before and after is recorded in the commit.

Rollback for S5: the old route and client stay in the tree until 5.5; a build flag in site-chat picks the transport. No data migration exists (nothing about a visitor run is persisted).

### S6. Admin default paths (separate design)

Local CLI (durable, reattachable, queued start, acceptance, persistence) and BYOK onto AG-UI. Needs: replay (§7.7), a run-id map from the client's AG-UI `runId` to the daemon run, and a careful cut of `createAssistantTransportClient` (1,018 lines, a 400-line function in size debt). This design fixes the contracts it will use (`AgUiRunSourcePort.resume`, deterministic ids, `id:` frames) and stops there.

### S7. Shared state: not planned (§9).

---

## 11. Estimate

Token estimates in the planning documents' units. Wall-clock is not estimated.

| Stage | Opus (design/review) | Sonnet (execute) | Notes |
|---|---|---|---|
| S0 | 20k review | 250k | six goldens, two repos |
| S1 | 30k review | 450k | mostly moves; many small test repoints |
| S2 | 40k | 400k | blocked on P-NODE-BRIDGE |
| S3 | 40k | 350k | both clients |
| S4 | 60k | 600k | daemon facade + relay + runner; security review |
| S5 | 60k | 550k | site source, cutover, deletion commit |
| **S0–S5** | **≈ 250k** | **≈ 2.6M** | |
| S6 | own design ≈ 120k | ≈ 1.2M–1.8M | wide range until designed |
| S7 | 60k | 450k | only if a user appears |

---

## 12. Owner practices, checked one by one

| # | Practice | Status in this design |
|---|---|---|
| 1 | DI through typed ports from the host | `AgUiRunHost`, `AgUiRunSourcePort`, pause store, scheduler, clock, ids, `describeFailure`; no `process.env`, no global `fetch` default in new code. **Conflict flagged:** `createFrontendSessionBridge` and `openFetchFrontendStream` default to `globalThis.fetch` ("0.6.x compatibility"); the runner that replaces them takes `fetch` as required. |
| 2 | `(required, optional = {})` | all new exports; moved positional functions converted with their callers (§3.4) |
| 3 | Functions ≤ 50 (80 error), files ≤ 500, complexity ≤ 10 | per-file targets in §3.1; `handleAgUiRun` (79 with comment) and `createAgUiRunClient` (113) are split; two exhaustive switches use the documented justification. **Flag:** `site-assistant.ts` is 857 lines today; S5 only shrinks it. |
| 4 | Feature slicing | one folder, files named by what they do (projection, reduction, pauses, interrupts, frontend-tools, run-stream); client files under `client/` |
| 5 | No barrels, re-export shells, forwarders | Tovu's type re-export and three forwarders are deleted; `entry.ts` is deleted. **Conflict flagged, not fixed here:** `assistant-client/entry.ts` is a re-export file (the `./transports/http` entry) and re-exports four AG-UI types; S1 removes those four lines, the rest belongs to the chat lane (R4). |
| 6 | Why-comments move with code | named in each move commit (close-ordering comment, bind-token comments, replay-suppression comment, `flattenMessagesToPrompt` simplification note) |
| 7 | Generic → Jini; a Jini package imports itself + core + protocol; no vendor code in core; no server framework in Jini | new code obeys it (web `Request`/`Response`, no Express). `@ag-ui/*` stays an optional peer of `@jini-ai/chat`, never core. **Existing conflicts flagged:** `@jini-ai/chat` depends on `@jini-ai/agentic`, `db`, `diagnostics` (untangle R4); `daemon/src/http` imports Express in 30 files (R7); `embed-widget/browser/frontend-session-bridge.ts` imports a type from `react/` |
| 8 | Fakes of interfaces, never `vi.mock` of another package's internals | all new tests use a fake source, fake pause store, manual scheduler, `createInMemoryServer`. **Flag:** admin's `AssistantDock.hooks.unit.test.tsx:63` does `vi.mock("../../lib/assistant-transport-ag-ui")` (own module, allowed, but it must keep working after S1.6) |
| 9 | Errors never swallowed or generic | §7.6; every failure has a code, plain words and a request id; validation errors name the field |
| 10 | No new `eslint-disable` / `@ts-ignore`; no silent behaviour changes | every wire change is listed in §4's last column and in the commit that makes it; reducer drift is pinned first |
| 11 | Smallest change; reuse first; no abstraction with one user | reuses `run-events`, `decodeSseFrames`, `createSseStream`, the registry, the gate, the confirmation store; no shared-state layer; no base class for sources; no `connect` yet |
| 12 | Memory and IO on hot paths | §7.3 (queue 64/1000, site buffer 256), §4.1 (O(1) per A2UI envelope), §7.5 (pause caps), one extra loopback stream per admin run that claims page tools, one extra HTTP round trip per frontend tool call and per confirmation |

---

## 13. What I could not verify

1. How the admin UI answers a daemon confirmation today (the exact surface-reply route and whether `surface_request` is what the daemon emits for a `ToolExecutor` confirmation in Tovu's composition). §5.2's admin row is written against the protocol type only.
2. Whether `ToolExecutionContext` exposes the model's tool-use id. I saw `executionId`, `run`, `input`, `signal`. §6.4's pairing assumes it does not.
3. How a stock AG-UI client treats a tool call that already has a result, and whether AG-UI documents preferred `Interrupt.reason` words or a standard `activityType` for A2UI. No AG-UI documentation was read; only the 0.0.58 package files.
4. Whether `HttpAgent` in 0.0.58 implements `connect`, and anything about 1.0.4 beyond its version number.
5. Whether the R7 node bridge strips the `connection: keep-alive` header that `createSseStream` always sets. Tovu's route omits it on HTTP/2 today because Node throws on it; T0-1 pins this and S2.3 must check it.
6. The daemon's event-log retention (needed for S6 replay).
7. Bundle size of `@ag-ui/client` with its dependencies inside the site widget (only the packages' own files were measured).
8. Test counts are `grep` counts of `it(`/`test(` lines; `test.each` tables are not expanded. No test was executed.
9. Whether the daemon runs in the website process or beside it in Tovu's deployment. §6.3 assumes only that the AG-UI route reaches it over HTTP, which the code shows.
10. The LESSONS file on `plan/size-designs-2026-11-16` has 11 numbered rules, not the 15 the brief mentions; the brief's own list was used for the rest.
