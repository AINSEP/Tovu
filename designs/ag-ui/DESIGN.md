# One chat protocol: AG-UI everywhere (hard item #7) — DESIGN

Date: 2026-11-16. **Revision 2** (same day), after the adversarial review in `CODEX-JUDGE.md`: 13 findings, all checked against the code, all accepted; see "Judge response" at the end. Docs only. No source file was changed and no test was run.
Read with `INDEX.md` (order, prerequisites, estimates, owner decisions).

**Bases read**

| Repo | Ref | Commit |
|---|---|---|
| Tovu code | `origin/integ/wave-b-r2` (worktree `../code`) | `65302ee5` |
| Jini | `origin/integ/wave-b-r2` | `02edbb68` |
| Inputs | `plan/design-inputs-2026-11-16` (visitor page tools plan), `plan/daemon-untangle-design-2026-11-16` (R7-ROUTES), `plan/terra-2026-11-15` (untangle DESIGN, LANES), `plan/size-designs-2026-11-16` (LESSONS) | as fetched 2026-11-16 |
| AG-UI packages | `@ag-ui/core`, `@ag-ui/client`, `@ag-ui/encoder` **0.0.58** | npm tarballs, read from their `dist/*.d.ts` and `dist/*.mjs` |

Personas used: software-architect (lead), programmer, refactor, tdd, security.
Skills used: implementation-guardrails, architecture-migration, hexagonal-architecture, api-design, interface-design, testable-design-patterns, test-design, security-review.

---

## 0. Short answer

1. **The brief's picture of today is partly wrong, and the differences change the plan** (§1). The admin chat is on AG-UI only behind a per-browser canary switch. The public site chat does not run on the daemon at all. Jini already holds three of the four AG-UI pieces. Three copies of the same wire reducer exist and have drifted.
2. **What moves:** all AG-UI code ends in one folder, Jini `packages/chat/src/core/ag-ui/`, behind one host contract (§3). Tovu keeps route paths, authentication, the daemon HTTP client, the site's provider turn and its event names. Tovu's 670-line `assistant-ag-ui.ts` shrinks to wiring (target ≤ 120 lines).
3. **Confirmations on the site** use AG-UI's own interrupt protocol, which **0.0.58 already ships**: `RUN_FINISHED` with `outcome: { type: "interrupt", interrupts }`, answered by `RunAgentInput.resume[]` (§5). **Admin confirmations keep their existing owner** (the server's chat-card exchange) until S6; rev 1 had designed against a producer that does not exist (§5.2).
4. **Browser-run page tools** become AG-UI frontend tools. The browser may execute a call **only after** `ToolExecutor` has authorized, confirmed and audited it. The call still goes through `FrontendSessionRegistry.invoke`; only the two wires around it change (§6). A refused call has no executable form on the wire, executions are keyed by the registry's invocation id, and the browser asks the server "begin?" right before an effect so a server cancel still wins (§6.1, §6.4). The bind token leaves the browser.
5. **The run can now outlive one HTTP response** (owner decision OD-1: yes). The response and the logical run are two lifetimes with an explicit handoff, separate quota keys, and seven named endings (§7.4, §7.5).
6. **Shared state (`STATE_SNAPSHOT`/`STATE_DELTA`): no, not now** (§9). It has no user today.
7. **Estimate (rev 2):** about 0.285M Opus + 2.85M Sonnet for stages S0 to S5; the admin default path (S6) needs its own design first (§11, INDEX).

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
| `status` without detail | no `detail` key | no `detail` key | `detail: undefined` key (**object only**: JSON drops it, so the wire is the same) |

All rows but the last are observable on the wire; the last is a reducer-object difference only (judge finding 13). These payload rows are not the whole drift: the **frame** handlers differ too (stdout echo and heartbeats, stderr, the error frame, failed and cancelled `end`), listed in §10 S1 step B3 (judge finding 8). Deleting two copies without a test would be a silent behaviour change (practice 10). Stage S0 writes one table-driven golden that feeds every `RunAgentPayload` type through all three and records the differences; the owner decision is OD-2.

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
- G5. After this work, an AG-UI major upgrade is: bump `@ag-ui/*`, fix files in **one folder**, re-run that folder's round-trip tests. Check: `rg "@ag-ui/" --glob '*.ts'` finds matches only under `packages/chat/src/core/ag-ui/` in Jini and only in `package.json` files, the one admin line that constructs `HttpAgent`, and admin test files that build official events (`assistant-transport.ag-ui.unit.test.ts:4`, `AgentPlugins.unit.test.tsx:4`) in Tovu.

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
| `pauses.ts` | pause records: atomic admission against global and per-key quotas, claim by owner, abandon deadline | new | ≤ 180 |
| `interrupts.ts` | pause to `Interrupt`, and `resume[]` entry to answer; the reason constants | new | ≤ 120 |
| `frontend-tools.ts` | capability to AG-UI tool, claim intersection, tool-result text encoding | `agentic/src/core/ag-ui.ts` (moved in S4; the whole six-name export block at `agentic/src/core/index.ts:70-83` removed) | ≤ 150 |
| `run-stream.ts` | one request to one SSE `Response`: commit, produce, backpressure, close, cleanup (§7) | Tovu `handleAgUiRun`, `drainAgUiStream` | ≤ 220 |
| `run-route.ts` | `agUiRunRoutes({ host, path }) => ServerRoute[]`: run, `begin`, `stop` (core server vocabulary) | Tovu `createAssistantAgUiModule` (generic half) | ≤ 100 |
| `daemon-frames-source.ts` | a run handle over a daemon run's SSE frames, using `run-events` `translateRunFrame` (or a host `translateFrame` port if OD-9 is no); cursor reopen; display records for claimed frontend tools; daemon calls are ports | new in S2 (Tovu's frame handlers are deleted or kept by S1 step B3) | ≤ 200 |
| `client/run-client.ts` | `createAgUiRunClient` (today one 113-line function, in `scripts/size-debt.json:374`) split into small functions; interrupts and frontend tools added | `assistant-client/ag-ui-transport.ts` | ≤ 250 |
| `client/frontend-tool-runner.ts` | runs a licensed frontend tool call once on a `ChatPagePort`; asks `begin` before an effect; replay memory | the invocation half of `embed-widget/browser/frontend-session-bridge.ts` | ≤ 160 |
| `client/light-agent.ts` | a small `fetch` + `decodeSseFrames` client that satisfies the existing `AgUiClient` port, for the embed widget (OD-4) | new | ≤ 150 |

Imports allowed in this folder: its own files, `../events.js`, `../run-events/entry.js`, `../page-port.js`, `@jini-ai/core`, `@jini-ai/protocol`, and the optional peers `@ag-ui/core` and `@ag-ui/encoder`. Nothing from `@jini-ai/daemon`, `@jini-ai/agentic`, `@jini-ai/http-kit`, Express or React.

Published subpaths after the change (`packages/chat/package.json` `exports` and the `jini.entries` map, plus `src/__tests__/fixtures/chat-subpaths.json`):

| Subpath | File | Runtime |
|---|---|---|
| `./core/ag-ui` (kept name) | `event-projection.ts` | universal |
| `./core/ag-ui/reduction` | `event-reduction.ts` | universal |
| `./server/ag-ui` | `run-route.ts` | universal (web `Request`/`Response`) |
| `./server/ag-ui/daemon-frames` | `daemon-frames-source.ts` | universal |
| `./server/ag-ui/run-input` (S1 to S2 only; removed when the route parses) | `run-input.ts` | universal |
| `./transports/ag-ui` (kept name) | `client/run-client.ts` | universal |
| `./transports/ag-ui/light` | `client/light-agent.ts` | universal |
| `./browser/ag-ui-frontend-tools` | `client/frontend-tool-runner.ts` | browser |

`./core/ag-ui` keeps exporting the names admin imports today from it (`AgUiEvent`, `createAgUiTranslationState`, `translateAgentEventToAgUi`, `closeAgUiRun`). The reverse names (`createAgUiToAgentTranslationState`, `translateAgUiEventToAgentEvent`, `AgUiToAgentTranslationState`) move to `./core/ag-ui/reduction`; their importers are listed in §10 S1.

### 3.2 The host contract (practice 1: typed ports from the host)

Revised in rev 2 (judge findings 4, 5, 9, 10). Three things changed: the run source no longer receives a request signal, authorization identity and quota identities are separate fields, and the handle can settle a pause inside the same response.

```ts
// run-route.ts
/** Everything a host supplies to mount the AG-UI run endpoint. Admin and site each build one. */
export interface AgUiRunHost {
  /** Who is calling. Runs first; returning a Response refuses the request before anything starts. */
  readonly authenticate: (required: { request: Request; locals: Record<string, unknown> }) => Promise<AgUiCaller | Response>;
  /** Body-dependent admission (bounds, rate limits), after parsing and before anything starts or resumes.
   *  One call per request kind, so start and resume can have different rules (§7.1). */
  readonly admit: (required: { kind: AgUiRequestKind; caller: AgUiCaller; request: Request; input?: AgUiRunInput }) => Promise<Response | null>;
  /** Starts a logical run. The only thing that executes anything. */
  readonly runs: AgUiRunSourcePort;
  /** Paused-run records and their counts. Jini ships `createMemoryPauseStore`. */
  readonly pauses: AgUiPauseStore;
  readonly customEventNames: CustomEventNames;
  readonly ids: EventIdGenerator & { newRequestId(): string };
  readonly limits: AgUiRunLimits;          // history count, per-message chars, body bytes, max paused runs (global), abandon grace ms
  readonly scheduler: SseSchedulerPort;    // keepalive and pause deadlines (core port)
  readonly clock: { nowMs(): number };
  readonly describeFailure: (required: { error: unknown; phase: AgUiRunPhase; requestId: string }) => { message: string; code: string };
}
export type AgUiRequestKind = 'start' | 'resume' | 'begin' | 'stop';

export interface AgUiCaller {
  /** AUTHORIZATION identity. Opaque to Jini. Equality decides who may answer, begin or stop a paused run.
   *  Never used for counting. The site puts guest + tab credential + publication revision in it. */
  readonly ownerKey: string;
  /** QUOTA identities. Each key is counted on its own. A run may park only if the global count and
   *  every key here are under their limit. The site passes `ip:<addr>` and `guest:<id>`. */
  readonly quotas: readonly { readonly key: string; readonly maxPausedRuns: number }[];
  /** Frontend tool ids this caller may be offered at all (host policy). Empty for a caller with no page. */
  readonly allowedFrontendTools: readonly string[];
}

/** Three routes: POST `path` (start or resume), POST `path/begin`, POST `path/stop` (§6.4, §7.4). */
export function agUiRunRoutes({ host, path }: { host: AgUiRunHost; path: string }, _optional: Record<string, never> = {}): readonly ServerRoute[]
```

```ts
// run-stream.ts
export interface AgUiRunSourcePort {
  /** No request signal: a logical run has its own lifetime. The route cancels through the handle (§7.4). */
  start(required: { input: AgUiRunInput; caller: AgUiCaller }): Promise<AgUiRunStart>;
}
export type AgUiRunStart = { readonly ok: true; readonly run: AgUiRunHandle } | { readonly ok: false; readonly response: Response };

export interface AgUiRunHandle {
  /** Pull-based. The stream asks for the next event only when the client can take it (§7.3). */
  next(): Promise<AgUiSourceEvent>;
  /** Settles open pauses, each id once. Called by a resume request, or in the same response when
   *  the pause store refuses to park the run (capacity). Unknown or already-settled ids are reported, not thrown. */
  answer(required: { answers: readonly AgUiPauseAnswer[] }): readonly { id: string; accepted: boolean }[];
  /** "May the browser start this effect now?" False once the server cancelled or timed out that execution (§6.4). */
  begin(required: { id: string }): boolean;
  /** Ends the logical run. Idempotent. */
  cancel(required: { reason: 'client-left' | 'stopped' | 'abandoned' | 'overflow' }): void;
}

export type AgUiSourceEvent =
  | { readonly kind: 'agent'; readonly event: AgentEvent }
  | { readonly kind: 'pause'; readonly pauses: readonly AgUiPauseRequest[] }
  | { readonly kind: 'end'; readonly reason: string }
  | { readonly kind: 'error'; readonly error: unknown };

export type AgUiPauseRequest =
  | { readonly kind: 'confirmation'; readonly id: string; readonly title: string; readonly summary: string; readonly expiresAtMs: number }
  /** `id` is the registry's invocation id. It is the only correlation key for a browser execution. */
  | { readonly kind: 'frontend-tool'; readonly id: string; readonly toolName: string; readonly input: Record<string, unknown>; readonly effectful: boolean; readonly expiresAtMs: number };

export type AgUiPauseAnswer =
  | { readonly id: string; readonly kind: 'confirmation'; readonly allow: boolean }
  | { readonly id: string; readonly kind: 'frontend-tool'; readonly outcome: { ok: true; output: unknown } | { ok: false; message: string } }
  | { readonly id: string; readonly kind: 'dismissed' }                       // the user closed the prompt, or the client's own deadline passed
  | { readonly id: string; readonly kind: 'refused'; readonly reason: 'capacity' }; // the run could not be parked
```

```ts
// pauses.ts
export interface AgUiPauseStore {
  /** One synchronous step: check the global count and every quota key, then count the run against all of
   *  them. No `await` between check and count, so two requests cannot both take the last slot. */
  park(required: { run: AgUiRunHandle; caller: AgUiCaller; threadId: string; runId: string;
    pauseIds: readonly string[]; translation: AgUiTranslationState; abandonAtMs: number }): { ok: true } | { ok: false; limit: 'global' | 'quota'; key?: string };
  /** Owner + thread + exact id set. Single use: removes the record and releases every count. */
  claim(required: { ownerKey: string; threadId: string; pauseIds: readonly string[] }): AgUiParkedRun | { missing: 'unknown' | 'gone' };
  /** For `begin` and `stop`: owner + thread + one id. Does not remove. */
  peek(required: { ownerKey: string; threadId: string; pauseId: string }): AgUiParkedRun | null;
}
```

There is no `park()` on the handle and no `resume` on the source port (both were in rev 1). Parking is: the route stops calling `next()`, removes its `request.signal` listener, and gives the handle to the pause store. Resuming is: `claim`, `answer`, call `next()` again from the new request. A source that wants to free a connection while parked (the daemon source closes its upstream reader) does so itself when it returns a `pause` event and reopens from its cursor on the next `next()`.

Why `next()` and not an event emitter: a pull makes backpressure and pause explicit, and a fake source in a test is an array.

Hexagonal reading: inbound adapter = `run-route.ts` (HTTP). Inbound port = `AgUiRunSourcePort` as seen from the stream. Outbound ports = `runs`, `pauses`, `admit`, `scheduler`, `clock`, `ids`, `describeFailure`. Composition roots = Tovu `modules/assistant-ag-ui.ts` (admin) and `modules/site-assistant.ts` (site). Core tests run `run-stream.ts` against an in-memory source, a manual scheduler and `createInMemoryServer` from core; no socket.

### 3.3 The two run sources

| Source | Lives in | Why there | Paused state it must hold |
|---|---|---|---|
| **Daemon frames** (`createDaemonFramesRunSource`) | Jini `daemon-frames-source.ts` | It only speaks the daemon's HTTP wire, which Jini owns. It takes ports: `startRun`, `openEvents({ runId, lastEventId })`, `cancelRun`, and from S4 the frontend-session relay client. Tovu binds them to `fetchAgentDaemon`, `fetchAgentDaemonEventStream`, `cancelDaemonRunBestEffort`. It answers nothing about confirmations: admin cards are answered on the existing exchange route (§5.2). | daemon run id, last event id, the server-held frontend relay and its cancelled-invocation set (§6.3, §6.4) |
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
| frontend tool, delivered after the gate | `TOOL_CALL_START/ARGS/END` (`toolCallId = fe_<invocationId>`, the delivery's input) then a `frontend_tool` interrupt (§6) | std | `run-stream.ts` + `interrupts.ts` | new |
| frontend tool, refused / denied / timed out before delivery | **no `TOOL_CALL_*` event at all** (FT-2) | — | — | new |
| model's own record of a call to a claimed frontend tool (admin) | `ACTIVITY_SNAPSHOT { activityType: "tool-call", replace: true }`, once at `tool_use`, once at `tool_result` (§6.1) | std | `surface-events.ts` | new |
| confirmation needed (site) | `RUN_FINISHED { outcome: { type: "interrupt", interrupts } }` | std | `interrupts.ts` | **yes**: was `client_directive` |
| confirmation needed (admin) | the approval card, as the `mcp-ui` row below; answered on the existing exchange route (§5.2) | std | `surface-events.ts` | carrier only (OD-6) |
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
2. **`RUN_FINISHED` or `RUN_ERROR` is always the last event of a response**, including a paused one. No rule in this design depends on two events arriving in the same network write: a client processes one event at a time.
3. **The reverse direction is specified field by field (§4.1)**, not claimed "exact". Each row has a round-trip golden with every optional field populated (§10 S0, T0-3).
4. **Ids are deterministic per run** (`<prefix>_<ordinal>` from the injected generator). That is what makes replay by event count possible later (§7.7).

### 4.1 Field fidelity (judge finding 11)

Rev 1 claimed an exact round trip with two losses. The projection today also drops fields the UI uses: `bridgeCall` and `toolOrigin` decide duplicate-call matching (`tool-events.ts:195-200`), and are dropped at `ag-ui/entry.ts:148-154` and not rebuilt at `:241-251`.

| `AgentEvent` field | On the AG-UI wire after S1 step B4 | Round trip |
|---|---|---|
| `tool_use.id`, `.name`, `.input` | `TOOL_CALL_START.toolCallId`, `.toolCallName`; `TOOL_CALL_ARGS.delta` (JSON) | exact; unparseable args come back as the raw string (kept, tested) |
| `tool_use.toolOrigin`, `.bridgeCall { name, input, buffered? }` | extra fields on `TOOL_CALL_START` | exact (new) |
| `tool_result.toolUseId`, `.content` | `TOOL_CALL_RESULT.toolCallId`, `.content` | exact |
| `tool_result.isError`, `.media`, `.outcome` | extra fields on `TOOL_CALL_RESULT` (OD-3) | exact (new) |
| `status.label`, `.detail`, `.code` | `CUSTOM <names.status>` value | exact |
| `usage.*` | `CUSTOM <names.usage>` value | exact |
| `text`, `thinking` | message / reasoning triplets | text exact; chunk boundaries kept; `TEXT_MESSAGE_START` yields a `status step_start` (stated loss) |
| `ext a2ui`, `ext mcp-ui` (with `_meta["jini/surface-exchange"]`) | `ACTIVITY_SNAPSHOT.content` | exact |
| other `ext` | `CUSTOM <prefix><name>` | exact |
| `thinking_start`, `tool_input_delta` payloads | not emitted (reducer returns `null`) | dropped before projection (stated) |

### 4.2 How A2UI and MCP ride

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
{ "threadId": "t1", "runId": "r2", "parentRunId": "r1", "state": null, "messages": [], "tools": [], "context": [], "forwardedProps": {},
  "resume": [ { "interruptId": "<pause id>", "status": "resolved", "payload": { "allow": true } } ] }
```

`context` is required by the 0.0.58 schema (judge finding 12; `RunAgentInputSchema` has `context: z.array(ContextSchema)`); every complete example in this document is schema-parsed in T0-3. `status: "cancelled"` (the user closed the prompt) and `payload.allow === false` both reach the source as a denial of that tool; a requester who never comes back is a different ending (§7.5).

The `reason` values (`"confirmation"`, `"frontend_tool"`) are constants in `interrupts.ts`. The schema types `reason` as a free string (verified). Whether AG-UI documents preferred reason words was not verified (§13); if it does, only those two constants change.

### 5.2 Where each side's confirmation comes from (unchanged owners)

Rev 2 (judge finding 1, blocker, accepted). Rev 1 wrote the admin row against a protocol type that no driver produces. The real owners are these.

| Path | Owner of "ask a human" today | How the question and answer travel today | Change in this design |
|---|---|---|---|
| Site | `ToolExecutor` → `ExecutionDelegate.onConfirm` → `createVisitorConfirmationGate.confirm` → `VisitorConfirmations.request` (`assistant/site/visitor-confirmations.ts`), which holds a Jini `SurfaceExchangeStore` exchange | `emit` writes `client_directive` on the open response; the answer arrives on `/api/site-assistant/confirm` and calls `VisitorConfirmations.confirm({ challengeId, allow, owner })` | **Interrupt.** `emit` pushes a `pause` into the site run source; the challenge id is the interrupt id; a resume request calls the same `confirm` function with the same owner check. The store's own caps (20 held turns, one per turn, two per IP, `visitor-confirmations.ts:27-33`) and its 60 s timer stay. The gate's policy re-read and input digest are untouched. |
| Admin (daemon) | Tovu `applyToolApprovalPolicy` (`assistant/tool-approval-policy.ts`) over Jini core `applyApprovalPolicy`, asking through `requireHumanConfirm` and the daemon's `SurfaceExchangeStore` (`packages/daemon/src/surface-exchanges.ts`). Page clicks use the same owner with a view snapshot (`page-approval-context.ts`, `agent-daemon-scope.ts:405-412`: "The server's human chat-card exchange owns page approval for every transport"). | The question is an `mcp-ui` card emitted through `emitSurface`; on the wire it is an `mcp-ui` payload carrying `surfaceExchange { exchangeId, toolId, runId }` (`surface-exchanges.ts:215`). The human's answer is a POST to `MCP_UI_TOOL_CALLS_PATH`, which calls `deliverSurfaceCallback` and never `toolExecutor.execute` (`mcp-ui-tool-calls-route.ts`). The tool call stays parked inside the daemon; the frozen input, the principal binding (`intruder` → 409), the typed-answer refusal (403) and the single use (second answer → 409) are pinned by `agent-daemon-server.page-confirmation.integration.test.ts:59-107`. | **None in S0–S5.** The card rides the stream as `ACTIVITY_SNAPSHOT { activityType: "mcp-ui" }` (OD-6) with its `_meta["jini/surface-exchange"]` identity intact, and it is answered on the existing route. The AG-UI stream stays open while the card is pending, exactly as on the canary today. |

Why the admin confirmation is **not** turned into an interrupt here:

1. A second answer path would be a second owner of the same wait. The owner is named in the code and is binding (implementation-guardrails rule 6).
2. The wire cannot tell "this card is waiting for an answer" from "this card reports a result": `askThenReport` sends a second emission on the same exchange after the answer, and both carry `surfaceExchange`. Rendering cards as interrupts needs an explicit "awaiting an answer" marker added where the exchange sends, which is a daemon protocol change.
3. Exchange cards are more than yes/no (forms, choices, several turns). One interrupt mapping for all of them is S6 work, together with the admin default path that real users are on.

So goal G3 is met on the site in S5 and on admin only in S6. This is owner decision **OD-10**. Nothing new decides anything on either path: the interrupt is a rendering of a wait that `ToolExecutor` and the exchange store already own.

### 5.3 Rules

1. **Human-only.** An interrupt never becomes an `AgentEvent`, never enters `collected`, a saved transcript, or the next provider history. Today's rule for `client_directive` ("challenges never enter events, persisted messages or provider history", `site-assistant-transport.ts:162`) is kept by construction: the client hands interrupts to an `onPause` handler, not to `handlers.onEvent`. A characterization test asserts the transcript after an Ask-mode call contains no challenge id.
2. **Only `resume[]` answers a pause.** `messages` (including `role: "tool"` entries), `forwardedProps`, `state` and `context` are never read for an answer.
3. **One answer, exact set.** A resume request must address every open pause of the parked run and nothing else. The pause record is single use (`claim` removes it), so a second request for the same ids finds nothing and gets 404.
4. **Endings are never merged** (judge finding 10). The table in §7.5 names the trigger, the source operation and the cleanup for each: answered, dismissed, could not park, expired, timed out, abandoned, stopped. In short: an expired confirmation is a **deny of that tool**, as today (`visitor-confirmations.ts:56-57` returns `false`, the gate resumes with `"deny"`); only a run that nobody comes back to is cancelled.
5. **Expiry is the server's.** `expiresAt` is advisory for the UI. The exchange store's timer (site: `VISITOR_CONFIRMATION_WAIT_MS` = 60 s) decides.
6. **Copy stays CMS-owned on the site.** `confirmationCopy` keeps building the title and summary from fixed strings plus one sanitized field. The model's raw input is never serialized into an interrupt.

### 5.4 What the two widgets render

No new UI. The React widget and the vanilla strip already render a title, a summary, Allow and Cancel from a `ToolConfirmation`. `apps/site-chat/src/tool-confirmation.ts` keeps `parseToolConfirmation`'s bounds (22-char id pattern, 200/240 chars) applied to the interrupt, and `confirmSiteAssistantTool` is replaced by "answer this pause" on the transport. `vanilla-tool-confirmation.ts` (DOM projection, focus, 60 s deadline) does not change.

---

## 6. Page tools as AG-UI frontend tools

Rewritten in rev 2 (judge findings 2, 3 and 6, all accepted).

### 6.1 The rules that keep `ToolExecutor` the only door

In plain AG-UI a client runs a frontend tool as soon as it has processed `TOOL_CALL_END` for a tool name it declared. Events are processed one at a time. Two events in one network write are still two steps for the client, so "the result follows in the same write" protects nothing (rev 1's FT-3 was wrong and is deleted).

> **FT-1 (wire invariant).** A `TOOL_CALL_START` whose `toolCallName` is in the caller's claimed frontend-tool set is emitted **only** from inside `FrontendSessionRegistry`'s `deliver` callback. That callback is reachable only from a `ToolHandler`, which `ToolExecutor` runs only after authorization, confirmation and audit. Its arguments are the delivery's input, never the model's raw arguments. Nothing else on the stream ever carries a claimed name in a `TOOL_CALL_*` event.

> **FT-2 (a refused call has no executable form).** A call that the gate refuses, denies or times out before delivery never reaches `deliver`, so by FT-1 no `TOOL_CALL_*` event exists for it. There is nothing a client could execute, whatever its timing.

> **FT-3 (identity).** A browser execution is identified by the registry's `invocationId` (`toolCallId = fe_<invocationId>`, interrupt `id = <invocationId>`). The capability name is a label, never a key. Nothing is paired by name or by arrival order.

> **FT-4 (our client).** Our runner executes only on a `frontend_tool` interrupt, and for an effectful tool only after the server said "begin" (§6.4).

How the model's own call record is shown without breaking FT-1 (admin only; the site echoes no tool calls at all):

- The daemon emits `tool_use { id, name: "page.click", input (raw), toolOrigin: "bridge" }` before the gate and `tool_result` after (`delegated-tool-bridge.ts:267-284`). For a name in the claimed set, the source projects these as **display records**, not tool calls: `ACTIVITY_SNAPSHOT { messageId: "toolcall_<id>", activityType: "tool-call", replace: true, content: { toolCallId, name, input, toolOrigin?, bridgeCall?, result?, isError?, media?, outcome? } }`, once at `tool_use` and once more (same `messageId`) at `tool_result`. Which `tool_result` belongs to which record is decided by the exact `toolUseId`, a set lookup, bounded by the calls in flight.
- Our reducer turns that activity back into the same `tool_use` / `tool_result` `AgentEvent`s the default daemon path produces, so tool cards and saved transcripts are identical on both paths. A refused click shows as a card with its refusal text.
- The execution handoff (`TOOL_CALL_START/ARGS/END` for `fe_<invocationId>`) is an instruction to the runner. Our reducer does not turn it into a transcript item. So one model call is one card, with no pairing.
- Calls with no model record at all exist and are fine: the approval owner reads the page first through the audited executor (`page-approval-context.ts:28-33`, `page.find_elements`). That nested call reaches `deliver` like any other, the browser runs it, and no card appears, as today.

A stock AG-UI client sees an activity entry plus a tool call. That is a cosmetic duplicate, not a second execution. What a stock client can and cannot do is in §6.6.

### 6.2 Sequence (site)

```
model: tool call page.click {id}
  -> executeTool -> capabilities.invoke -> ToolExecutor
       authorize (policy re-read, mode, budget charge)        [unchanged]
       confirm if Ask / forced                                [§5; may pause once here]
       handler -> registry.invoke(runId, "page.click", input) [unchanged]
            -> deliver(invocation)                            <- push a `pause` into the run source
  stream: TOOL_CALL_START/ARGS/END(toolCallId = fe_<invocationId>, args = invocation.input)
          RUN_FINISHED { outcome: interrupt [{ id: <invocationId>, reason: "frontend_tool", toolCallId,
                         expiresAt, metadata: { effectful: true } }] }
browser: runner queues the work, prepares it, then POST <path>/begin { threadId, interruptId }
         200 { proceed: true } -> perform the effect once (replay memory)   |   409 -> do nothing
  -> POST <path>, resume [{ interruptId, status: "resolved", payload: { ok: true, output } }]
server: authenticate -> admit('resume') -> pauses.claim (owner + thread + exact ids) -> handle.answer
        -> attachment.settle(invocationId, outcome) -> handler returns -> ToolExecutor truncates, audits  [unchanged]
  stream: RUN_STARTED(parentRunId) ... (run continues)
```

### 6.3 Who attaches, and what leaves the wire

Today a tab holds a long-lived SSE stream, receives a `bindToken` on it, and sends the token with each chat request. In the new shape the surface **is** the run request:

| Step | Today | New |
|---|---|---|
| Prove the tab | guest cookie + `x-frontend-tab` credential + `x-visitor-publication` | same three, on every AG-UI request (`authenticate` port) |
| Claim capabilities | `?capability=` query on the stream, intersected with `allowedCapabilities` | `RunAgentInput.tools[].name`, intersected with `caller.allowedFrontendTools`. **Descriptions and parameter schemas sent by the client are ignored**; the server's `CapabilityDef` is the only source of what the model is told. |
| Attach | `registry.attach` in the stream route | `frontend.attachRun({ runId, owner, capabilities, capacityKeys, deliver, cancel })` at run start; the returned `release()` is called by the run source at run end |
| Bind the run | `bindRunByToken(runId, bindToken, owner)` | done inside `attachRun` (attach and bind in one server-side step) |
| Deliver | SSE `invocation` frame | `pause` event → handoff + interrupt |
| Answer | `POST /frontend-sessions/:sessionId/responses` + bind token header | `resume[]` on the run route → `attachment.settle` |
| Cancel | SSE `cancelled` frame aborts the browser's controller (`frontend-session-bridge.ts:388-390`), and queued page work checks it before the effect (`:303-307`) | the registry's `cancel` callback marks the execution cancelled in the run source; the browser learns it at `begin` (§6.4) |

Removed from the browser: the session id in a URL, the bind token, the `/stream` and `/responses` routes for AG-UI hosts. `/frontend-sessions/credentials` stays (it is how a tab is authenticated).

**One daemon change** (`packages/daemon/src/http/frontend-control.ts`): a facade method.

```ts
/** A run-scoped surface: attaches, binds one run, and can only answer its own invocations.
 *  It takes no AbortSignal. The caller owns the lifetime and must call `release()` (§7.4). */
attachRun(required: {
  runId: string; owner: FrontendSessionOwner; capabilities: readonly string[];
  deliver: (invocation: FrontendInvocation) => void; cancel: (required: { invocationId: string }) => void;
}, optional?: { capacityKeys?: readonly string[] }): {
  settle(required: { invocationId: string; outcome: FrontendOutcome }): boolean;
  /** True while the registry still holds this invocation as pending. */
  isPending(required: { invocationId: string }): boolean;
  release(): void;
};
```

It keeps the facade's most important property: **the registry is never returned**, and the handle has no `invoke`. `settle` is the same registry call the responses route makes after its ownership check. Session capacity (`maxSessions` 256, `maxSessionsPerKey` 3, keys `ip:` and `guest:`, `visitor-frontend-control.ts:27-35`) applies unchanged because the method goes through the same `registry.attach` with the same independent keys. `bindRequest` (today's site hook, which ties the binding to a request signal at `frontend-control.ts:218-223`) loses its last caller at the end of S5 and is deleted then; until then it is untouched.

**Admin (daemon reached over HTTP).** The website process cannot call the daemon's registry in-process. The daemon-frames source acts as the surface on the browser's behalf, using the daemon's existing routes server-to-server: it opens `GET /api/frontend-sessions/stream?capability=…` as the admin principal, reads `attached { bindToken }`, starts the run with that token in `contextRef` (as today), turns each `invocation` frame into a `pause`, records each `cancelled` frame against its invocation id, and posts the answer to `/:sessionId/responses`. This needs **no daemon change**. The small client for those routes belongs to the package that owns them: new `packages/daemon/src/http/frontend-session-client.ts` (fetch injected, `decodeSseFrames` from core). The relay stream lives as long as the run, including while paused. While paused, daemon run events are not read; on resume the source reopens `GET /api/runs/:id/events` with `Last-Event-ID` (the route replays, `packages/daemon/src/http/runs.ts:289`).

### 6.4 Cancellation must reach the browser before the effect (`begin`)

Rev 1 removed the `cancelled` frame and said the next response would carry the news. During a browser execution there is no open response, so a queued or still-preparing page action could run after the tool timed out or the run was cancelled (judge finding 3, accepted).

Replacement: the browser asks at the last moment instead of being told.

- `POST <path>/begin { threadId, interruptId }`, same `authenticate`, then `admit('begin')`, then `pauses.peek` (owner + thread + id). The route calls `handle.begin({ id })`.
- Site source: `begin` returns `attachment.isPending({ invocationId })`. Admin source: it returns false once a `cancelled` frame for that invocation arrived on the relay, or the run ended.
- `200 { proceed: true }` or `409 { proceed: false, reason: "cancelled" | "expired" }`. Unknown or foreign id: 404, one answer for both.
- The runner calls it **after** queueing and asynchronous preparation and immediately before the effect, and performs the effect only on `proceed: true`. Read-only tools (`effectful: false`; the host marks them, as `withReadOnlyFrontendCapabilities` does today) skip the call.
- Server cancels that happen later still win at the next step: `settle` returns false for a cancelled invocation, so a late result changes nothing.

What this guarantees: no effect starts for an execution the server had already cancelled when the browser asked. The old push frame was unacknowledged, so this is at least as strong in every window the judge named. The remaining window (cancel lands between the 200 and the effect) is one network return trip, the same order as the old frame's delivery delay. Cost: one small POST per effectful page action.

Tests that must be able to fail (S4): cancel while the action is queued; cancel during asynchronous preparation; cancel after the effect and before the result is sent (result is ignored, run continues); tool timeout while paused; `begin` from another tab credential (404).

### 6.5 Terminal actions (navigation, form submit)

Order today: browser returns the result → server accepts it → server ends the turn with a text line and `end { reason: "navigation" }` → browser saves the transcript → browser navigates. New order is the same with different wires: resume carries the result → the site source applies `isTerminalVisitorAction` → stream emits the text message and `RUN_FINISHED { result: { reason: "navigation" } }` → the client's existing `finish({ navigation: true, messages })` path runs. `visitor-page-control.ts`'s `flushTerminalNavigation` and its guard against replaying an old effect on rehydrate stay.

### 6.6 What a stock AG-UI client gets (stated, not promised)

- Safe: it can never execute a refused or unauthorized call (FT-1, FT-2). Test: a client fake that executes the moment it processes `TOOL_CALL_END` for a declared name, against a denying policy, records zero executions.
- Not complete: a stock client answers a frontend tool with a `role: "tool"` message. The server reads only `resume[]` (§5.3 rule 2), and it does not call `begin`. So with a stock client an effectful page tool either is answered through the interrupt by application code, or times out. No compatibility with CopilotKit is claimed (§13).

### 6.7 The admin page-approval dialog — OD-5 withdrawn

Rev 1 said a protected admin page call shows a browser dialog (`pageApproval`). That is no longer true: `apps/admin/src/App.hooks.ts:1085-1095` builds the bridge without that option, and the registration loop states the server's chat-card exchange is the one approval gate. The code already has what OD-5 asked for, so OD-5 needs no decision. The approval card stays as described in §5.2.

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
| 4 | `host.admit({ kind })`. **Start** (site): map the last user message and earlier messages onto today's `message` / `history` bounds (`admitVisitorMessage`: empty → 400, over `MAX_MESSAGE_CHARS` → 413, history fail-soft), then the chat limiter (`siteAssistantRateLimiter`, per IP). **Resume** (site): no message checks, no provider start; the limiter `/confirm` uses today (`site-assistant.ts:592`, 60 per 60 s). | the host's `Response` (400 / 413 / 429 with `Retry-After`) |
| 5 | resume only: `pauses.claim` by `ownerKey` + `threadId` + exact id set | 404 (unknown, already claimed, or not yours; one answer for all three), 410 (the run was abandoned or stopped) |
| 6 | start only: `runs.start`. A resume calls `handle.answer` on the parked run and **never** constructs a provider turn or a daemon run. | the source's `Response` (today's 502/503 from the daemon client, or the site's public error) |
| 7 | commit: `createSseStream(...)`, queue `RUN_STARTED`, return `stream.response` | none; from here failures are events |

The site's enabled check (404, indistinguishable from an unregistered route) and same-origin check stay first, inside `authenticate`. Rev 1 said "the preflight stays in front"; it cannot, because it reads `body.message` and rejects an empty one (`site-assistant.ts:297-301`), and a resume has `messages: []` (judge finding 9). S5.1 splits it.

This keeps today's rule from `assistant-ag-ui.ts:619-621` ("start the daemon run before switching into SSE mode"). Test: a source whose `start` never resolves leaves the response uncommitted; aborting the request then cancels nothing that exists.

### 7.2 Production

One loop: `event = await run.next()`, project, `stream.send`. Terminal source events (`end`, `error`, `pause`) leave the loop through `settleRun`. Projection is pure and per-run; no module-level state (the existing rule about concurrent admins and tabs).

### 7.3 Backpressure

`createSseStream` is pull-based and drops the connection at 1,000 queued frames (core, SEC-006). The loop adds real backpressure on top so the cap is not the normal control: after each `send` it awaits a `stream.drained()` signal when the queue is above a high-water mark (64 frames), and only then calls `run.next()` again. `drained()` is not on `SseStream` today; it is a small addition to core `contracts/server/sse.ts` (the `wake` cell already exists). Without it, the fallback is the 1,000-frame drop, which is safe but turns a slow client into a cancelled run. For the daemon source, not calling `next()` stops reading the upstream body, so the daemon's own stream cap applies there. For the site source, events are produced by the provider callback; the source buffers at most 256 events and aborts the turn beyond that (memory bound stated, practice 12).

Per event cost: one `JSON.stringify`, one string frame, no copy of history. Usage and status events are small; A2UI envelopes are bounded by the daemon's existing surface size limits.

### 7.4 Two lifetimes: the response and the logical run

Rev 2 (judge finding 4, accepted). Rev 1 passed the request's signal into the run and then said "disconnect after parking does nothing". Those cannot both hold: today's code attaches cancellation directly to that signal (`frontend-control.ts:218-223`, `visitor-confirmations.ts:50-51`, `visitor-confirmation-gate.ts:57-58, 76-82`).

| Lifetime | Starts | Ends | Owner | Its signal |
|---|---|---|---|---|
| **Response** | stream commit (§7.1 step 7) | terminal event, pause, client left, overflow | `run-stream.ts` | `request.signal` |
| **Logical run** | `runs.start` returns a handle | source `end` / `error`, or `handle.cancel(reason)` | the run source | the source's own `AbortController` (site) or the daemon run (admin) |

Rules:

1. **Nothing inside a run ever sees `request.signal`.** `runs.start` has no signal argument. The site source creates one `AbortController` per run and passes **its** signal to everything that takes one today: `createVisitorExecutor` ports (`ports.signal`), `VisitorConfirmations.request({ signal })`, `runByokProviderTurn`. `attachRun` takes no signal; the source calls `release()`.
2. **The route is the only bridge.** While a response is attached, the route listens on `request.signal` and calls `handle.cancel({ reason: "client-left" })`. This is the one place a disconnect becomes a cancel.
3. **Handoff at park, in this order:** (a) `pauses.park(...)` succeeds; (b) the route removes its `request.signal` listener; (c) the pause deadline timer is armed; (d) `RUN_FINISHED(interrupt)` is queued and the stream ends. From (b) on, a disconnect cannot reach the run. If (a) fails, nothing is handed off and the run continues in this response (§7.5).
4. **Handoff at resume:** `pauses.claim` disarms the deadline, the new route attaches its own `request.signal` listener, then calls `handle.answer` and `next()`.
5. **Disposal has one path:** every ending of a logical run (end, error, cancel for any reason) runs the source's own `dispose`, which releases the frontend attachment or relay, aborts the run controller, and reports the audit sink's terminal phase. The pause store releases its counts when a record is claimed, cancelled or abandoned.

What a disconnect means, by phase:

| When the client leaves | Action |
|---|---|
| before the run exists | nothing to cancel; if `start` resolves later, cancel that run immediately (today's `closedEarly` case; test kept) |
| while producing | `handle.cancel({ reason: "client-left" })`, once |
| after a terminal event was queued | nothing (today's `runFinished` guard) |
| during the park handoff, before step (b) | treated as "while producing": cancel, and the pause record is never created or is removed |
| after step (b) | nothing; the run is parked and owned by the pause deadline |

**Stop.** Today Stop aborts the open fetch (`ag-ui-transport.ts:204-207`). A paused run has no open fetch, so the client transport's `stopRun` does one of two things: if a response is open, abort it (unchanged); if the run is paused, `POST <path>/stop { threadId, interruptId }` (any one open interrupt id of that run). The route runs `authenticate`, `admit('stop')`, `pauses.peek` (owner + thread + id), removes the record and calls `handle.cancel({ reason: "stopped" })`. 204 on success; 404 for unknown or foreign. Stop is idempotent.

The long comment in `handleAgUiRun` that explains the two leak windows and the "exactly once" argument moves with this code and is updated to name `request.signal` and the park handoff.

Tests (each must be able to fail): disconnect before / during / after the park handoff → 1, 1, 0 cancels; Stop while producing and Stop while paused → 1 cancel each and the attachment is released; a resumed run's disconnect cancels again (the listener was re-attached); the source's `dispose` runs exactly once for every ending.

### 7.5 Pause, park, resume, and the endings

On a `pause` event the stream closes open messages, emits the handoff triplet for each frontend-tool pause, and tries to park (§7.4 rule 3). The pause record holds `{ pauseIds, ownerKey, threadId, runId, handle, translation state, abandonAtMs }`. It is in memory in the process that holds the run, because a parked run is live objects (a suspended tool call, a relay stream).

**Quotas (judge finding 5, accepted).** Rev 1 folded guest and IP into one `ownerKey`. A composite key counts each pair separately, so it cannot limit several guests behind one IP or one guest across IPs. Now:

| Dimension | Field | Used for |
|---|---|---|
| who may answer / begin / stop | `caller.ownerKey` (site: guest + tab credential + publication revision) | equality only |
| how many runs may be parked | `caller.quotas[]`, each key counted on its own, plus one global count | admission only |

`pauses.park` checks the global count and every key, then counts the run against all of them, in one synchronous step. Thresholds (host values in `AgUiRunLimits` and `AgUiCaller.quotas`; the owner may tune them):

| Limit | Site | Admin canary | Source of the number |
|---|---|---|---|
| parked runs, global | 64 | 16 | new |
| parked runs per `ip:` key | 3 | not used | matches `maxSessionsPerKey: 3` |
| parked runs per `guest:` key | 2 | not used | new; two tabs of one visitor |
| parked runs per `principal:` key | not used | 4 | new |
| open confirmations | 20 global, 1 per run, 2 per IP | n/a (card exchange) | **unchanged**, still enforced inside `VisitorConfirmations` (`visitor-confirmations.ts:27-33`) |
| frontend attachments | 256 global, 3 per `ip:` / `guest:` key | daemon's own | **unchanged**, registry capacity through `attachRun` |

Boundary tests at limit − 1, limit, limit + 1 for each row, with three guests on one IP and one guest on three IPs.

**Endings (judge finding 10, accepted).** Rev 1 said in one place that expiry refuses the tool and in another that it cancels the whole turn. These are different outcomes with different triggers:

| Ending | Trigger | Operation | The tool sees | The run |
|---|---|---|---|---|
| answered | resume, `status: "resolved"` | `handle.answer` | confirmation: confirm or deny; frontend tool: its result | continues on the new response |
| dismissed | resume, `status: "cancelled"` (user closed the prompt, or the client's own copy of the deadline passed) | `handle.answer({ kind: "dismissed" })` | confirmation: deny; frontend tool: failed, "not performed" | continues on the new response |
| could not park | `pauses.park` refused (global or a quota key) | `handle.answer({ kind: "refused", reason: "capacity" })` **in the same response**; no interrupt is sent | confirmation: deny (today `request` returns `false` at capacity); frontend tool: failed with plain words | continues in the same response |
| confirmation expired | the exchange store's own timer (60 s), unchanged | none from the route; the owner settles it | deny, exactly as today | keeps running, parked. A resume that arrives before `abandonAtMs` attaches and streams what followed. Its late answer for that id is reported `accepted: false` and changes nothing. |
| frontend tool timed out or cancelled | `ToolExecutor`'s `timeoutMs` / run signal → registry `onAbort` → `cancel` callback (`frontend-session-registry.ts:370-374`) | the source marks the execution cancelled; `begin` → false | failed: timeout or cancelled, as today | as the row above |
| abandoned | nobody resumed by `abandonAtMs` = the pause's own expiry + `limits.abandonGraceMs` (10 s) | pause store timer → `handle.cancel({ reason: "abandoned" })` | cancelled through the run signal | ends; same cleanup as a disconnect today |
| stopped | `POST <path>/stop` | `handle.cancel({ reason: "stopped" })` | cancelled | ends |

So an expired confirmation stays a denial of one tool, as it is today, and whole-run cancellation happens only when the requester is gone or pressed Stop. No behaviour decision is needed for that part. One thing does change and is stated: after an expiry with the tab gone, the turn runs on for at most the 10 s grace before it is cancelled (today the open socket's close cancels it at once).

- While parked, the site source buffers at most 256 events (§7.3) and cancels the run beyond that (`overflow`).
- Resume: a new request, a new response, a new AG-UI `runId` with `parentRunId`. The translation state continues, so message ids keep counting.
- A resume never starts a provider turn (§7.1).

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

`createSseStream`'s `onClose` runs once for abort, overflow and `end()`. `settleRun` and `parkRun` are the only callers that decide between cancel, park and nothing (§7.4). Every resource has one owner:

| Resource | Owner | Released when |
|---|---|---|
| upstream daemon event reader | daemon-frames source | `cancel`, `park` (reader only), terminal |
| frontend attachment / relay | the run source (`dispose`) | any ending of the logical run; never on response close |
| run `AbortController` (site) | the run source | any ending of the logical run |
| pause record, its quota counts, its abandon timer | pause store | claimed, stopped, abandoned |
| keepalive timer | `createSseStream` | `onClose` |
| tracker span (`assistant.run`) | Tovu wiring, through a `onOutcome` callback on the route | terminal, cancel; a paused response reports `paused`, not `succeeded` |

---

## 8. Security: the whole chain, gate by gate

Classes and fixes only (public repos).

| # | Class | Where it could appear | Design answer | Test that can fail |
|---|---|---|---|---|
| S1 | Execution before authorization | a frontend tool event emitted at `tool_use` time, or a refused call shown in an executable form | FT-1/FT-2 (§6.1): holds event by event, whatever the chunking | fake policy denies → a client fake that executes on `TOOL_CALL_END` records zero executions and the stream has no `TOOL_CALL_*` with a claimed name |
| S1b | Effect after cancellation | a queued page action running after timeout or run cancel | `begin` before every effect (§6.4); late results ignored by `settle` | cancel while queued / while preparing → zero effects |
| S1c | Wrong call executed or shown | pairing by tool name or order | identity is `invocationId` / `toolUseId` (FT-3) | two same-name calls finishing in reverse order → each result on its own id; nested read with no model call → executes once, no card |
| S2 | Client-defined tools | `RunAgentInput.tools` | names are a claim only, intersected with host policy; descriptions and schemas ignored; unknown names dropped | a request declaring an unlisted tool and a hostile description → model-facing descriptor unchanged |
| S3 | Forged answer | `resume[]`, or a `role: "tool"` message | pause ids are 128-bit, single-use, stored server-side, matched on `ownerKey` + `threadId` + exact set; tool messages never settle anything; `begin` and `stop` use the same owner match | wrong owner → 404; replay → 404; tool message with a valid pause's `toolCallId` → ignored |
| S4 | Self-approval by the model | interrupt id or challenge reaching model-visible text | interrupts are not `AgentEvent`s; ids never enter tool results or history (unchanged rule) | transcript and provider history after an Ask call contain no pause id |
| S5 | Cross-tab or cross-user control | binding a run to another surface | no cross-request bind exists any more: run and surface are one authenticated exchange; `ownerKey` equality (it includes the tab credential) on resume, `begin` and `stop`; quota keys play no part in authorization | resume / begin / stop from another tab credential → 404 |
| S6 | Cross-site request | run and resume POSTs | same-origin check stays in the host's `authenticate` (site: `allowsVisitorRequestOrigin`; admin: `requireAdminSession`), and the tab credential is a custom header a cross-site form cannot set | cross-origin POST → 403 before any source call |
| S7 | Resource exhaustion | parked runs, relay streams, event queues | independent counts per quota key plus a global count, admitted atomically (§7.5); abandon deadline; resume, `begin` and `stop` pass `admit` (site: the `/confirm` limiter) | limit and limit + 1 per key, three guests on one IP, one guest on three IPs → the tool call fails, the run continues; slow reader → bounded queue |
| S8 | Disclosure to visitors | echoing server tool calls | the site source emits **no** `tool_use`/`tool_result` for server-run tools (today's rule); only page tools the browser must run are visible, with input the browser receives today anyway | site golden stream contains no content-tool name |
| S9 | Error text leakage | `RUN_ERROR.message` | `describeFailure` per audience; secrets redaction stays in the host reporter | provider error containing a key-shaped string → stream shows the public sentence |
| S10 | Untrusted page output | frontend tool results | still pass through `ToolExecutor`'s `maxOutputBytes` truncation (24 KB site) because the handler returns them; the client-side 96 KB bound stays in the runner | oversize result → truncated in the tool result, run continues |
| S11 | Stale approval | policy or input changed between click and execution | the gate's revision + digest re-check is unchanged and still runs just before the handler | existing gate tests, re-run on the new transport |
| S12 | Inbound `state` / `context` / `forwardedProps` | future shared state, prompt stuffing | `state` and `context` are ignored; `forwardedProps` is read for a fixed allow-list of bounded fields only (`agentId`, `secretRedacted`); the bind-token fields are removed | unknown forwarded prop has no effect; `state` has no effect |

What gets **weaker or different** and why it is acceptable:

- The bind token is gone. It existed because session ids travel in URLs and binding was a separate request. Neither is true now (S5).
- A run can exist without an open connection for up to the pause deadline plus a 10 s grace (S7). Bounded, counted per key, and timed.
- Cancellation reaches the browser by a question (`begin`) instead of a pushed frame. One network trip of window remains, as before (§6.4).
- Admin confirmations are unchanged, so nothing about them gets weaker.
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

Rewritten in rev 2 (judge findings 7 and 8, accepted). Each commit has one change type (move, behaviour, add, delete), compiles and passes alone in its repo, and names every importer it repoints. Tovu links Jini as `file:../Jini/packages/*`, so a Jini commit that removes a name Tovu imports is listed with its **paired** Tovu commit; the pair lands together. Path-keyed debt entries are moved by hand in the commit that moves the file (lesson 10).

### S0. Characterize (tests only; must be able to fail)

| Test | Pins | Fails if |
|---|---|---|
| T0-1 `ag-ui-wire.golden` (Tovu, admin route) | exact SSE bytes for a fixture daemon stream covering every `RunAgentPayload` type **with every optional field populated** (`media`, `outcome`, `isError`, `bridgeCall`, `toolOrigin`, `status.detail`, `surfaceExchange`), and the frame-level cases of §10 S1 step B: a `stdout` chunk with an echo line and a heartbeat line, a `stderr` chunk, an `error` frame, `end` with `max_tool_turns`, `end` with a failed status, `end` with a cancelled status, a stream that closes with no `end`; response headers on HTTP/1.1 | any event, order, id, header or frame text changes |
| T0-2 `reducer-drift.unit` (Jini) | the §1.4 table: all three payload reducers over one fixture. Two assertions per row: reducer **object** equality, and **serialized** equality after projection (finding 13: `detail: undefined` differs as an object and not on the wire) | a copy is deleted while a listed difference is still observable |
| T0-3 `ag-ui-round-trip.golden` (Jini) | `AgentEvent[]` → encoder bytes → official `EventSchemas` parse → reducer → `AgentEvent[]`, with populated optional fields; the field table of §4.1 is the expected loss list. Every complete wire example in this document (§5.1) is parsed with the locked `RunAgentInputSchema` / `EventSchemas` | projection or reduction changes shape; an AG-UI upgrade breaks a schema |
| T0-4 `site-chat-stream.golden` (Tovu) | today's site frames for: plain reply, Ask-mode content tool (directive, allow, deny, **expiry → deny and the turn continues**, capacity → deny), `page.navigate`, provider error, visitor abort | lifecycle order, disclosure or an ending changes |
| T0-5 `cancel-windows` (Tovu, exists; extended) | client leaves before start resolves / while subscribing / mid-stream / after finish → exactly 1, 1, 1, 0 daemon cancels | the close state machine regresses in the move |
| T0-6 `bridge-replay` and `bridge-cancel` (Jini, exist) | an executed invocation id is never executed twice; a `cancelled` frame while the action is queued prevents the effect | the runner loses replay memory or the cancel-before-effect property |

Clock, ids and randomness are injected in all six. T0-1 and T0-4 are mutation-checked once (change one emitted field, see red, revert).

### S1. Consolidate (Jini moves first, then Tovu behaviour steps, each visible in the golden)

Rev 1 called S1 "byte-identical" and at the same time applied OD-2, which changes bytes. S1 is now three kinds of commit, never mixed.

**A. Jini moves (no behaviour change; Jini test count before and after recorded in each commit).**

| # | Commit | Every importer repointed in the same commit |
|---|---|---|
| A1 | split `chat/src/core/ag-ui/entry.ts` into `event-projection.ts` (forward names, the types, and for now `reduceAgentWirePayload`) and `event-reduction.ts` (reverse names); delete `entry.ts`; `./core/ag-ui` → `event-projection.ts`; add `./core/ag-ui/reduction` | `assistant-client/ag-ui-transport.ts:13-14`; `assistant-client/__tests__/ag-ui-transport.test.ts:4`; `core/__tests__/conversation-cost.test.ts:8`; `ag-ui/__tests__/{ports,translation,reverse-translation}.test.ts`; `package.json` `exports` (`:135-138`), `jini.entries` (`:29`), `typesVersions` (`:311-312`); `src/__tests__/fixtures/chat-subpaths.json:8-11,42,55-56`; `knip.json:222`; `docs/spec/api.spec.md:254,330`; `CAPABILITIES.md:271`. **Paired Tovu commit:** `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.unit.test.ts:3` imports the reverse names from `/reduction`; `apps/admin/src/lib/assistant-transport-ag-ui.ts:36` (a type re-export shell with no production importer) is deleted and its test importers take the types from Jini directly. |
| A2 | move `assistant-client/ag-ui-transport.ts` → `ag-ui/client/run-client.ts`, unchanged | `assistant-client/transport.ts:8`; `assistant-client/entry.ts:4` (the four re-exported AG-UI types are removed; the commit first greps Jini, Tovu and `examples/` for importers of those four names through `./transports/http` and repoints each to `./transports/ag-ui`); tests `ag-ui-transport.test.ts` (moves beside the file), `credential-notice-current-turn.unit.test.ts:3`, `transport.test.ts:7`, `transport-redaction-signal.test.ts:3`, `core/__tests__/durable-run-subscription.paths.unit.test.ts:4`; `package.json:150-153,320-321`; `knip.json:225`; `scripts/size-debt.json:374` and `scripts/log-safety-debt.json:223` (paths updated, entries kept) |
| A3 | refactor: split `createAgUiRunClient` (113 lines) into `startRun`, `subscribeRun`, `settleRunOnce`, each ≤ 45; remove the `size-debt.json` entry | none (same exports) |
| A4 | add `run-input.ts` with its unit tests and a real subpath `./server/ag-ui/run-input` (contract and parser arrive before any user). The why-comments come with the code in the paired move C1. | `package.json`, `chat-subpaths.json`, `api.spec.md`, `CAPABILITIES.md` |

**B. Behaviour steps (each one commit pair, each lists its golden diff; nothing else changes in it).**

| # | Commit | Observable change, listed in the commit and in T0-1's diff |
|---|---|---|
| B1 (OD-2, decided) | Tovu: `assistant-ag-ui.ts` calls `translateRunAgentPayload` from `@jini-ai/chat/core/run-events`; Tovu's `reduceAgentWirePayload` and `WIRE_PAYLOAD_REDUCERS` are deleted; `assistant-ag-ui-translate.test.ts` and `assistant-ag-ui.wire.unit.test.ts` reducer cases are re-pointed (case count recorded) | `CUSTOM tovu.ext.tool_input_delta` no longer appears; an `mcp-ui` resource gains `_meta["jini/surface-exchange"]` when the daemon sent `surfaceExchange`. `tool_use` correlation and `tool_result` media/outcome reach the `AgentEvent` and are still dropped by the projection until B4, so no other byte changes. |
| B2 (OD-2, decided) | Jini: delete `reduceAgentWirePayload` from `event-projection.ts` (no production caller in Jini; Tovu does not import it, `assistant-ag-ui.ts:53-60`) | none on any wire. Tests: `ports.test.ts:2,24`, `translation.test.ts:6-89` (11 cases) and `conversation-cost.test.ts:8,57` are re-pointed at `translateRunAgentPayload`; a case is deleted only when the same assertion already exists under `run-events/__tests__`, named in the commit. T0-2 becomes a single-reducer test. `CAPABILITIES.md:271` and `api.spec.md:254` drop the name. |
| B3 (**OD-9, open**) | Tovu: the four frame handlers, `parseDaemonFrame` and `readDaemonSseFrames` are replaced by `translateRunFrame` + `readSseFrames`; `terminalReasonNotice` comes from `run-events` with Tovu's notice text passed in | (1) stdout echo lines are dropped and heartbeat lines add a `CUSTOM tovu.status` (`run-events/entry.ts:587-615`); (2) `stderr` chunks appear as `RAW` (ignored today, `assistant-ag-ui.ts:403-420`); (3) an `error` frame adds a status event before `RUN_ERROR` (`:689-693`); (4) an `end` frame with a failed status becomes `RUN_ERROR`, and with a cancelled status `RUN_FINISHED { result: { reason: "cancelled" } }` (today every `end` is a success, `assistant-ag-ui.ts:416-418`). If OD-9 is no, B3 is skipped, the four handlers stay in Tovu as host code, and `daemon-frames-source.ts` (S2) takes a `translateFrame` port instead of calling `translateRunFrame`. |
| B4 (OD-3 and finding 11) | Jini: field fidelity of §4.1 in `event-projection.ts` and `event-reduction.ts` together, with the populated-field round-trip golden | `TOOL_CALL_START` gains `toolOrigin?`, `bridgeCall?`; `TOOL_CALL_RESULT` gains `isError?`, `media?`, `outcome?`. Consumers: none change (the fields already exist on `AgentEvent`; `tool-events.ts:195-200` starts seeing them on this path). The admin unit test drives the official `HttpAgent` with a fake fetch and asserts the extra fields survive its pipeline; if they do not, the same fields ride a `CUSTOM <prefix>tool_meta` event keyed by `toolCallId` (§13). |

**C. Tovu moves and deletions.**

| # | Commit | Callers and tests |
|---|---|---|
| C1 | move `resolveAgUiMessages`, `resolveAgUiRunRequest`, `resolveForwarded*` bodies and why-comments to Jini `run-input.ts` (A4's file); Tovu imports `@jini-ai/chat/server/ag-ui/run-input` | route; the parsing cases of `assistant-ag-ui-translate.test.ts` move to Jini with it (count recorded) |
| C2 | delete the three forwarders and the type re-export at `assistant-ag-ui.ts:62`; the route calls Jini's names with one `customEventNames` constant | route; remaining `assistant-ag-ui-translate.test.ts` cases; `AssistantDock.hooks.unit.test.tsx:63` (`vi.mock` of admin's own module) must still pass |

End of S1: the Express response-writing and the close state machine still live in Tovu. `frontend-tools.ts` is **not** moved in S1 any more (no user yet; it moves in S4).

### S2. The route becomes `ServerRoute[]` (needs the untangle lanes)

Prerequisites: C4 (landed at `02edbb68`), **P-NODE-BRIDGE** (not landed), C-ORIGIN-PORT for test hosts. If P-NODE-BRIDGE has not landed, S2 waits; Tovu does not write its own bridge.

| # | Repo | Commit |
|---|---|---|
| 2.1 | Jini | core `sse.ts`: add `drained()` (failing test first) |
| 2.2 | Jini | contracts first: the types of §3.2 in `run-stream.ts` and `pauses.ts` with `createMemoryPauseStore` and its quota boundary tests |
| 2.3 | Jini | `run-stream.ts` implementation + `run-route.ts` (`agUiRunRoutes`: run, `begin`, `stop`) with a fake source; `./server/ag-ui` export |
| 2.4 | Jini | `daemon-frames-source.ts` (implements `AgUiRunHandle` over ports `startRun`, `openEvents({ runId, lastEventId })`, `cancelRun`); real subpath `./server/ag-ui/daemon-frames`; fake-port test fed by T0-1's fixture |
| 2.5 | Tovu | `assistant-ag-ui.ts` builds an `AgUiRunHost` and mounts the routes through `mountJiniRoutes` (R7 §4.2). `requireAdminSession` stays an Express gate above them. T0-1 allowed differences, listed: keepalive comment frames, `outcome` on `RUN_FINISHED`, the `connection` header (§13). The paired Jini commit removes the `./server/ag-ui/run-input` subpath (its only outside importer is gone). |

### S3. Interrupt mapping and the client (no production user yet)

3.1 Jini: `interrupts.ts` (pause ↔ `Interrupt`, `resume[]` entry ↔ answer). 3.2 Jini: `client/run-client.ts` gains `onPause`, `answerPauses`, the paused branch of `stopRun`, and the local-deadline "dismissed" answer. 3.3 Jini: a reference test host (in-memory source) drives start → pause → each ending of §7.5. The admin canary does not use confirmation interrupts (§5.2, OD-10); its first interrupts are the frontend-tool ones in S4.

### S4. Frontend tools (admin canary)

Prerequisite: R7's frontend-sessions group. 4.1 Jini: move `agentic/src/core/ag-ui.ts` → `chat/.../frontend-tools.ts` (`CapabilityDef` comes from `@jini-ai/core`, `core/src/contracts/capabilities.ts:45`, so no `agentic` import); remove the whole export block and its doc comment at `agentic/src/core/index.ts:70-83` (**six** names: `toAgUiTool`, `toAgUiTools`, `createAgUiToolResult`, `AG_UI_TOOL_CALL_EVENTS`, `AgUiTool`, `AgUiToolResultMessage`); `agentic/core/__tests__/ag-ui.test.ts` moves; the `toAgUiTool` assertion at `messages.contract.test.ts:2,11` moves with it (not dropped). No Tovu importer exists (checked). 4.2 Jini daemon: `attachRun` on the facade + `frontend-session-client.ts`, tested through fakes of the registry interface. 4.3 Jini chat: `client/frontend-tool-runner.ts` (moved from the bridge's `servePage`/`serveLocally`/`remember`, with comments) plus the `begin` call; the bridge keeps its attachment half for non-AG-UI hosts until S6. 4.4 Jini: display records and handoff in the daemon-frames source (§6.1); no pairing code. 4.5 Tovu admin: canary passes page tool claims; `frontendBindToken` / `frontendTabId` forwarded props are removed from `run-input.ts` and the client in one commit pair.

### S5. Site chat cutover

5.1 Tovu: split `preflight` (`site-assistant.ts:288-329`) into `checkSiteAssistantEnabled`, `admitVisitorMessage({ message, history })` and `checkChatRateLimit`, behaviour unchanged, old `/chat` calls all three (move; T0-4 unchanged). 5.2 Tovu: `visitor-run-source.ts` wrapping the body of `handleChat`, with the run-owned `AbortController` of §7.4 (`site-assistant.ts` carries three size-debt entries, `development/scripts/size-debt.json:1748-1762`; the move must not add one). 5.3 Tovu: routes at `/api/site-assistant/ag-ui-run` beside the old `/chat`, with the admission of §7.1. 5.4 Jini: `client/light-agent.ts` (OD-4, decided). 5.5 Tovu site-chat: `createSiteAssistantTransport` becomes a thin binding of Jini's run client; `visitor-page-control.ts` drops the bridge and uses the runner; both widgets unchanged above the transport. 5.6 After one release with the new route on (OD-7): delete `/chat`, `/confirm`, `/frontend-sessions/stream`, `/frontend-sessions/:id/responses`, `client-directives.ts`, `bindRequest`, and the hand-written SSE parser. T0-4 is replaced by its AG-UI twin with the same scenario list; the scenario count before and after is recorded.

Rollback for S5: the old route and client stay in the tree until 5.6; a build flag in site-chat picks the transport. No data migration exists.

### S6. Admin default paths (separate design)

Local CLI (durable, reattachable, queued start) and BYOK onto AG-UI; replay (§7.7); a run-id map; the cut of `createAssistantTransportClient`. **Added in rev 2:** rendering the admin card exchange as an interrupt (§5.2), which first needs an "awaiting an answer" marker on exchange emissions in `packages/daemon/src/surface-exchanges.ts`.

### S7. Shared state: not planned (§9).

---

## 11. Estimate (rev 2)

| Stage | Opus (design/review) | Sonnet (execute) | Change from rev 1 and why |
|---|---|---|---|
| S0 | 25k | 300k | +50k: frame-level and populated-field fixtures, both-assertion drift test |
| S1 | 40k | 520k | +70k: complete importer map, four separate behaviour steps, no `agentic` move |
| S2 | 50k | 470k | +70k: quotas, two extra routes, contracts-first commit |
| S3 | 30k | 240k | −110k: no admin confirmation mapping; client and reference host only |
| S4 | 70k | 690k | +90k: `begin`, display records, the `agentic` move; pairing code removed |
| S5 | 70k | 630k | +80k: preflight split, run-owned lifetimes, endings table tests |
| **S0–S5** | **≈ 285k** | **≈ 2.85M** | rev 1: 250k + 2.6M |
| S6 | own design ≈ 140k | ≈ 1.4M–2.0M | + admin card-exchange interrupts |
| S7 | 60k | 450k | unchanged |

---

## 12. Owner practices, checked one by one (rev 2)

| # | Practice | Status in this design |
|---|---|---|
| 1 | DI through typed ports from the host | `AgUiRunHost` (now with `admit`), `AgUiRunSourcePort`, pause store, scheduler, clock, ids, `describeFailure`. No request signal crosses into a run. **Conflict flagged:** `createFrontendSessionBridge` and `openFetchFrontendStream` default to `globalThis.fetch`; the runner takes `fetch` as required. `visitor-confirmation-gate.ts` reads `globalThis.crypto` directly (existing, not touched). |
| 2 | `(required, optional = {})` | all new exports. `attachRun` moved `capacityKeys` to the optional object. |
| 3 | Functions ≤ 50 (80 error), files ≤ 500, complexity ≤ 10 | per-file targets in §3.1; `handleAgUiRun` and `createAgUiRunClient` are split (§3.4); `settleRun` gains the park handoff and is split into `parkRun` (≤ 30) and `settleRun` (≤ 30). **Flag:** `site-assistant.ts` is 857 lines today; S5 only shrinks it. |
| 4 | Feature slicing | unchanged |
| 5 | No barrels, re-export shells, forwarders | Tovu's type re-export and three forwarders, admin's `assistant-transport-ag-ui.ts:36` re-export, and `entry.ts` are deleted. No subpath points at a forwarding file; a subpath with no outside importer is removed (S2.5). **Conflict flagged, not fixed here:** `assistant-client/entry.ts` stays a re-export file for its non-AG-UI names (chat lane R4). |
| 6 | Why-comments move with code | named in A2, C1, 4.3 and §7.4 |
| 7 | Generic → Jini; a Jini package imports itself + core + protocol; no server framework in Jini | new code obeys it. `frontend-tools.ts` imports `CapabilityDef` from core, not `agentic`. `@ag-ui/*` stays an optional peer of `@jini-ai/chat`. **Existing conflicts flagged:** `@jini-ai/chat` → `agentic`, `db`, `diagnostics` (R4); `daemon/src/http` imports Express (R7). **Host binding kept in Tovu:** preflight split, visitor run source, approval policy, card exchange route. |
| 8 | Fakes of interfaces, never `vi.mock` of another package's internals | fake source, fake pause store, manual scheduler, `createInMemoryServer`, fake registry interface, a client fake that executes on `TOOL_CALL_END` |
| 9 | Errors never swallowed or generic | §7.6; `handle.answer` reports unknown ids instead of throwing or ignoring; 404 / 409 / 410 bodies carry a code and request id |
| 10 | No new `eslint-disable` / `@ts-ignore`; no silent behaviour changes | every wire change has its own commit in S1 step B with its golden diff; the 10 s abandon grace (§7.5) and the `begin` round trip (§6.4) are stated |
| 11 | Smallest change; reuse first; no abstraction with one user | admin confirmations keep their existing owner and route; `park()` / `resume` removed from the port; no pairing code; `frontend-tools.ts` moves only when it gets a user. **Flag:** `begin` and `stop` are two Jini-owned routes outside the AG-UI standard (OD-11). |
| 12 | Memory and IO on hot paths | queue 64/1000, site buffer 256, parked runs capped per §7.5, display-record set bounded by calls in flight; +1 small POST per effectful page action, +1 round trip per frontend tool call and per site confirmation, one loopback relay stream per admin run that claims page tools |

---

## 13. What I could not verify

1. Whether extra fields on `TOOL_CALL_START` / `TOOL_CALL_RESULT` survive the official `HttpAgent` pipeline (the schemas are `passthrough`; the client's own transforms were not read). B4 tests it and names the fallback.
2. How a stock AG-UI client (CopilotKit) behaves; no compatibility is claimed (§6.6). No AG-UI documentation was read, only the 0.0.58 package files. Whether AG-UI documents preferred `Interrupt.reason` words or `activityType` values is unknown.
3. Whether `HttpAgent` in 0.0.58 implements `connect`, and anything about 1.0.4 beyond its version number.
4. Whether the R7 node bridge strips the `connection: keep-alive` header that `createSseStream` always sets (T0-1 pins today's header; S2.5 must check).
5. The daemon's event-log retention. S4's admin resume relies on `Last-Event-ID` replay for the seconds a frontend tool takes; the route exists (`runs.ts:289`), its retention window was not read.
6. Bundle size of the light client and of `@ag-ui/client` inside the site widget.
7. Test counts are `grep` counts; no test was executed in either revision. `@ag-ui/core` is not installed in this checkout; the 0.0.58 tarball was fetched and `RunAgentInputSchema` read from `dist/index.mjs` (`context: z.array(ContextSchema)`, required), but no example was run through `safeParse` here.
8. Importers of the four AG-UI types through `./transports/http` outside the two repos read (A2 greps before removing them).
9. Whether the daemon runs in the website process or beside it in Tovu's deployment; §6.3 assumes only HTTP reachability.
10. The LESSONS file on `plan/size-designs-2026-11-16` has **11** numbered rules at `b62acb7e`, not the 19 the brief names. All 11 were applied; rules 12–19 could not be found.

---

## Judge response

Judge: `CODEX-JUDGE.md` (Codex gpt-6.1-sol HIGH, design `7d75f120`). Every finding was checked in the trees at Tovu `65302ee5` and Jini `02edbb68` before it was accepted. Result: **13 accepted, 0 rebutted.** Two were accepted with a narrower premise (3 and 8), noted in their rows. The judge's evidence was correct in every place I opened.

| # | Severity | Verdict | What I checked | What changed |
|---|---|---|---|---|
| 1 | Blocker | Accepted | `protocol/src/events.ts:157-167` ("No driver in this codebase produces these yet"); `agent-daemon-scope.ts:405-412`; `tool-approval-policy.ts`; `page-approval-context.ts`; `mcp-ui-tool-calls-route.ts` header; `surface-exchanges.ts:215`; the page-confirmation integration test `:59-107`; `apps/admin/src/App.hooks.ts:1085-1095` (no `pageApproval`) | §5.2 rewritten around the real owner (approval policy + surface exchange + exchange delivery). Admin confirmations keep that owner and route; no second mechanism. Interrupt rendering for admin moves to S6 (OD-10). OD-5 withdrawn (§6.7). S3 no longer maps `surface_request`. |
| 2 | Blocker | Accepted | `agentic/src/core/ag-ui.ts` header (the client executes after the call); the judge's point that one write is not one client step | Old FT-3 deleted. New FT-1/FT-2 (§6.1): a claimed tool name appears in `TOOL_CALL_*` only from `deliver`; a refused call has no `TOOL_CALL_*` at all and is shown as a display record. Test with a client fake that executes on `TOOL_CALL_END`. §4 rows and §8 row S1 updated. |
| 3 | Major | Accepted, premise narrowed | `frontend-session-registry.ts:370-374`; `frontend-session-bridge.ts:303-307, 388-390`. Narrowing: today's `cancelled` frame is an unacknowledged push, so it is prompt, not a guarantee | §6.4: the browser asks `begin` right before an effect; the server refuses once it cancelled. Three cancel-window tests. T0-6 pins today's property first. |
| 4 | Major | Accepted | `frontend-control.ts:218-223`; `visitor-confirmations.ts:50-51`; `visitor-confirmation-gate.ts:57-58, 76-82`; `ag-ui-transport.ts:204-207` | §7.4: two lifetimes, ordered park and resume handoffs, one disposal path, `stop` route for a paused run. `runs.start` and `attachRun` no longer take a signal (§3.2, §6.3). |
| 5 | Major | Accepted | `visitor-frontend-control.ts:27-35` (separate `ip:` and `guest:` keys); `visitor-confirmations.ts:27-33` | `AgUiCaller.ownerKey` (authorization) and `AgUiCaller.quotas[]` (counting) are separate; `pauses.park` admits atomically against global and every key; thresholds table and boundary tests (§7.5). |
| 6 | Major | Accepted | `page-approval-context.ts:28-33` (nested `page.find_elements` through the executor, no model event); `delegated-tool-bridge.ts:267-284` | Hold-and-pair (old §6.4) deleted. Identity is the registry's `invocationId` (FT-3); the model's record is a display record keyed by exact `toolUseId`; nested calls need no partner (§6.1). |
| 7 | Blocker | Accepted | all five items, plus importers the judge did not list: `credential-notice-current-turn.unit.test.ts:3`, `transport.test.ts:7`, `transport-redaction-signal.test.ts:3`, `durable-run-subscription.paths.unit.test.ts:4`, `assistant-client/entry.ts:4`, `knip.json:222,225`, `scripts/size-debt.json:374`, `scripts/log-safety-debt.json:223` | §10 S1 rewritten as a per-commit importer map with paired Tovu commits; real subpaths for `run-input.ts` and `daemon-frames-source.ts`; contracts before implementations (2.2 before 2.3); the `agentic` move goes to S4 and removes all six names. |
| 8 | Major | Accepted, scope note | `assistant-ag-ui.ts:362-420`; `run-events/entry.ts:587-693`. All four differences are real. OD-2 (decided) covers the payload reducer only, as the judge says | S1 is no longer called byte-identical. Step B3 lists the four frame-level changes as one behaviour commit behind new **OD-9**, with the fallback if the answer is no. T0-1's fixture gains the frame cases so the diff is visible. |
| 9 | Major | Accepted | `site-assistant.ts:297-325` (reads `body.message` / `body.history`, then the chat limiter); `:592` (`/confirm` has its own limiter, 60 per 60 s — rev 1's "same rate limiter" was wrong) | `admit({ kind })` port (§3.2); §7.1 has separate start and resume admission; S5.1 splits `preflight`; a resume never builds a provider turn. |
| 10 | Major | Accepted | `visitor-confirmations.ts:35-36, 56-57` (capacity and expiry both yield `false`); gate `:56-58` (`"deny"`) | §7.5 endings table: answered, dismissed, could not park, expired, timed out, abandoned, stopped, each with trigger, operation and cleanup. Expiry stays a tool denial. `handle.answer` can refuse a pause inside the same response. The one changed timing (10 s abandon grace) is stated. |
| 11 | Major | Accepted | `run-events/entry.ts:53-58, 140-142`; `ag-ui/entry.ts:148-154, 241-251`; `tool-events.ts:195-200` (`toolOrigin` decides duplicate matching) | New §4.1 field table; correlation and result extras are encoded and decoded in one commit (B4) with a populated-field golden; rev 1's "exact reverse mapping" claim is removed. |
| 12 | Minor | Accepted | `@ag-ui/core@0.0.58` `dist/index.mjs`: `context: z.array(ContextSchema)` with no `.optional()` | `context: []` and `state` added to the §5.1 example; T0-3 parses every complete wire example with the locked schemas. |
| 13 | Minor | Accepted | `assistant-ag-ui.ts:153` vs `ag-ui/entry.ts:43`; `JSON.stringify` drops `undefined` | §1.4 marks that row "object only"; T0-2 asserts object parity and serialized parity separately. |

Recurring mistake classes, applied across the document and not only where the judge pointed:

- **A transport write is not a consumer transaction.** FT-1/FT-2; also §4 rule 2 now says "last event the client processes", and no rule anywhere relies on two events arriving together.
- **Authorization identity ≠ quota identity.** `ownerKey` vs `quotas[]`; the frontend attachment keeps its own independent `capacityKeys`; the confirmation store keeps its own counts.
- **A capability name is not a correlation id.** FT-3; display records are matched by `toolUseId`, executions by `invocationId`, pauses by pause id, exchanges by `exchangeId`.
