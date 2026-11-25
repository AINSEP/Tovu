REVISED r62t-rev-p6: 2 SOL sheets (1 Jini / 1 Tovu), 7 OPUS sheets

Merge-21 anchors checked on Tovu `7c87b3c3f` and Jini `010c8cd87`, both at `origin/integ/merge-21-2026-11-24`. No files changed. No tests, builds, installs, or type-checks ran.

`W/` means Tovu `apps/website/src/`, `A/` means `apps/admin/src/`, `SC/` means `apps/site-chat/src/`, and `J/` means Jini `packages/`. Existing anchors are against merge-21. Declarations and files marked **new** are proposed.

**Dispatch order.** Run P6-J1.J, consume its Jini candidate through the P7-J2 handoff, then run P6-T1.T → P6-T2.T → P6-T3.J → P6-T3.T → P6-T4.J → P6-T4.T → P6-T5.T. T5 is listed in the SOL group but cannot dispatch before T4 is green. P6-T2.R is a separate release-gated dispatch after T2.T. The coordinator closes the compatibility window at the first release after P6-T1 ships. If the public-route extraction lands first, re-anchor T2.R to the landed spec and host mount. Do not extract the route in P6 or let the extraction lane recreate it after removal.

**Shared build rules.** Write the named tests first. If a case already passes on merge-21, prove the characterization goes red under the named mutation. New public functions take `(required, _optional = {})`. Existing positional `ChatTransport` methods remain an external conformance boundary. Inject collaborators and effects at composition, with custom hooks as required props. Keep why-comments with the logic they explain. Keep functions at or below 80 lines and complexity 10. No theme, provider, persistence-schema, or extraction changes. If the durable path needs a schema change, stop and raise a separate Opus migration sheet under ADR-066 with a TypeScript migration and pinned checksum.

## Jini SOL

### P6-J1.J — Byte activity on the existing AG-UI fetch agent

BUILDER: SOL

Jini already publishes `createAgUiFetchAgent` and `createAgUiRunClient` through `J/chat/package.json:190`. Reuse them. The fetch agent validates standard events and reads split frames, but does not expose byte activity.

**Tests first**

| File | Exact test and red mutation |
|---|---|
| `J/chat/src/core/assistant-client/__tests__/ag-ui-fetch-agent.test.ts:10–25` | `reports byte activity before a split event completes` — enqueue a heartbeat and an incomplete event, then the suffix. Assert activity sees every nonempty chunk before parsing, and the observer sees one `TEXT_MESSAGE_CONTENT` only after the suffix. Mutation: report activity from the decoded-event loop. |
| Same file | `uses the supplied controller and cancels the reader once` — abort with a pending read, assert one cancellation and no later `next` or `complete`. Mutation: construct a different controller or omit the signal on the pipe. |
| `J/chat/src/core/ag-ui/__tests__/interrupts.test.ts:10–23` | `rejects a matching resume with an unrecognized resolved payload` — use an otherwise-valid resume with an unknown payload and assert `undefined`. Preserve allow, deny, dismissed, cancelled and wrong-identity cases. Mutation: treat any resolved payload as allow. |

**Edits**

- At `J/chat/src/core/assistant-client/ag-ui-fetch-agent.ts:5–35`, extend the existing entry to `createAgUiFetchAgent({ request }, { abortController = new AbortController(), onBytes } = {})`. Keep `request` as `(required: { input: RunAgentInput; signal: AbortSignal }) => Promise<Response>`. The optional `onBytes` type is `(required: { byteLength: number }, optional?: Record<string, never>) => void`. Thread it into `readAgUiResponse` as an optional field.
- Replace the identity transform at `:13` with the following. Keep `, { signal }` on `pipeThrough` and keep `readSseFrames` and `EventSchemas.parse` as the sole parser and validator.

```ts
new TransformStream<Uint8Array, Uint8Array>({
  transform(chunk, controller) {
    if (chunk.byteLength > 0) onBytes?.({ byteLength: chunk.byteLength });
    controller.enqueue(chunk);
  },
})
```

- Add the following type in `ag-ui-fetch-agent.ts`, return it from the existing factory, and re-export it at `J/chat/src/core/assistant-client/ag-ui-transport.ts:21` next to `createAgUiFetchAgent`. Use the official `AGUIEvent` type. Preserve `abortController` and `abortRun`, assignability to `AgUiClient`, and the common `HttpAgent` port and behavior.

```ts
export interface AgUiFetchAgent extends AgUiClient {
  run(input: RunAgentInput): {
    subscribe(observer: {
      next(event: AGUIEvent): void;
      error(error: unknown): void;
      complete(): void;
    }): Promise<void>;
  };
}
```

- At `J/chat/src/core/ag-ui/event-projection.ts:308–321`, preserve `readConfirmationResume({ input, threadId, runId, interruptId }, _optional = {})` and its result. After schema and binding checks, delegate the matched entry’s status and payload to private `readResumeDecision({ entry }, _optional = {})`. Cancelled → deny. `allow` → allow. `deny` or `dismissed` → deny. Everything else → `undefined`. Keep the exact-one-entry and named-interrupt checks.

**Host injection and rationale.** Tovu supplies HTTP, same-origin credentials, the controller, the timer callback, and visitor copy. Heartbeats and partial UTF-8 or SSE frames count as byte activity. The host still owns idle, refusal and terminal policy. T1 supplies the end-to-end idle and safe-error witnesses.

**Package.** Keep `J/chat/package.json:190,394` mapping `./transports/ag-ui` to the existing binding. No new subpath, dependency or shell. Add `.changeset/p6-ag-ui-fetch-activity.md` as `@jini-ai/chat` minor. Do NOT edit `api-baseline/jini-ai__chat.json` (SOL cannot run `pnpm api:update`). The Opus verification run executes `pnpm api:update` and accepts only these deltas: the new optional arg of `createAgUiFetchAgent` and the new `AgUiFetchAgent` type. The resume helper signature and projection export do not change.

## Tovu SOL

### P6-T5.T — Default admin Local CLI to AG-UI

BUILDER: SOL

Dispatch only after all six P6-T4 parity gates are green.

**Tests first.** In `A/lib/__tests__/assistant-transport.ag-ui.unit.test.ts:75–97,694–765`, use the actual predicate as `getAgUiEnabled` in the new routing tests.

- Rename `"off by default"` at `:80` to `defaults to AG-UI when the browser setting is unset` and change its expected value to true. Mutation: restore `value === "1"`.
- Add `keeps 0 as an explicit Local CLI rollback`. Mutation: make any stored string truthy.
- Add `an unset toggle starts Local CLI on the AG-UI endpoint`. Mutation: make `isAgUiTransportEnabled` return `false` when `getItem` returns `null`.
- Add `changing the rollback setting affects the next Local CLI turn only`. Retain one transport, flip to `"0"`, assert the next start uses `/api/runs`, and assert an already-started turn retains its lifecycle. Mutation: capture the flag at transport construction.
- Rename the `:89–92` test to `"any value other than unset or '1' (including 'true') is treated as off"`. Keep its assertion. Retain the `"1"` and no-`localStorage` cases and `BYOK mode wins over the AG-UI toggle when both are set`. Mutation for BYOK: evaluate the toggle before the BYOK dispatch.

**Edits**

- In `A/lib/assistant-transport-ag-ui.ts:39–54`, keep the key, the missing-`localStorage` guard and the existing zero-argument predicate. Set `const value = localStorage.getItem(AG_UI_TOGGLE_STORAGE_KEY)` and return `value === null || value === "1"`. At `:44–50`, replace “flip it on with `localStorage.setItem('tovu:assistant-ag-ui', '1')`” with “on by default; roll back per tab with `localStorage.setItem('tovu:assistant-ag-ui', '0')`, read fresh at the next start; it does not affect restore, Stop or BYOK”.
- At `A/components/AssistantDock/hooks/assistant-transport.hooks.ts:110–112`, replace “off by default, flipped per-tab via `localStorage`” with “on by default; `'0'` in `localStorage` is the per-tab rollback”. Keep the live `isAgUiTransportEnabled` injection at `:113`. No new dependency or Jini release change.

**Stop condition.** Do not merge or enable on unit tests alone. Require the six real-path P6-T4 rows green, with Chrome and Electron evidence.

## OPUS

### P6-T1.T — Negotiate visitor AG-UI on the existing `/chat`

BUILDER: OPUS

Tovu public input and error boundary. Consume P6-J1.J through P7-J2. Preserve P4 sheet C refusal behavior already at `SC/site-assistant-transport.ts:276–285`, with both renderer witnesses at `SC/__tests__/site-assistant-transport.test.ts:760–805`.

**Tests first**

| File | Exact test and red mutation |
|---|---|
| **New** `W/server/__tests__/site-chat-stream.ag-ui.golden.test.ts` | `a visitor turn emits RUN_STARTED, text start, delta, end, and RUN_FINISHED` — use one recorded response and official event validation. Mutation: emit old `event: text` or omit `RUN_FINISHED`. Give this suite its own golden file and exact-scenarios pin. Leave `W/server/__tests__/site-chat-stream.golden.test.ts`, its golden bytes, and its exact-scenarios pin at `:335` untouched. |
| Same new AG-UI golden suite | `a no-reply visitor turn ends once with a plain error` — use whitespace-only provider output. Assert one `RUN_ERROR`, no success terminal, and the existing no-reply sentence in the UI. Mutation: treat provider end as success without checking for visible text. |
| `W/server/__tests__/site-assistant-routes.test.ts` and `W/server/__tests__/site-assistant-error-report.integration.test.ts:59–77` | `old and new visitor clients share gates and turn dedupe` and `AG-UI provider failure sends the public message and one incident reference` — assert versioned admission, disabled/refusal precedence, no second paid provider start for the same turn, and no diagnostic or internal tool bytes on the wire. Mutations: skip dedupe for AG-UI or send the caught error as `RUN_ERROR.message`. |
| `SC/__tests__/site-assistant-transport.test.ts:545,586–619,760–805` | `idle timeout aborts once after the last byte` and `EOF without a terminal does not mark a partial reply successful` — include split chunks, a heartbeat, pre-header silence, Stop, and late bytes after terminal. Mutations: reset idle only on complete events or accept bare EOF as success. Rerun both Sheet C refusals against the new request. |
| Same browser suite and `SC/__tests__/site-chat-comparison.test.ts` | `page navigation still navigates after saving the reply` and `both renderers render the same transcript from one recorded AG-UI stream` — drive the actual React and vanilla hosts. Mutations: remove the navigation terminal action or feed the stream through the old parser. |

**Server files and seams**

- Change `W/server/runtime/composition/modules/site-assistant.ts:104,224–242,269–305,657–731,749–807,850–909`. Add **new** adjacent `site-assistant-ag-ui.ts` for negotiated wire construction. Use `selectVisitorChatWire({ accept }: { accept: string | undefined }, _optional = {}): "legacy" | "ag-ui"`. Only the explicit media range `text/event-stream; agui=1` selects AG-UI. A bare range, wildcard, absent header, or disabled range does not. Both paths share the same POST and gate order. Append `Vary: Accept`, preserving any existing `Vary`. Keep loaded old bundles working. `SC/loader-host.ts:26` and `W/server/inbound/public-http/middleware/site-chat-static.ts:26–39` serve stable widget URLs. Zero cache age cannot replace a script already running in a tab.
- Use `readVisitorChatInput({ body, wire }, _optional = {})` to normalize to `{ message, rawHistory, turnId, wireIds? }` or a validation refusal. For AG-UI, require bounded nonempty `threadId` and `runId` and a trailing nonblank user message. Use `RunAgentInput` on the sender. On the receiver, fail soft on individual passive history entries as the current parser does, then reuse count and character limits. Keep the 2,000-character live-message guard. Pass `forwardedProps.turnId` through `readVisitorTurnId`. `logicalRunId`, visitor identity, provider selection and tool catalog stay server-owned. Client `tools`, `context`, `state` and miscellaneous `forwardedProps` are not authority. T2 owns the resume branch.
- Create `createVisitorAgUiWriter({ ids, encode, write, threadId, runId, copy }, _optional = {})` with `start({}, {})`, `text({ delta }, {})`, `directive({ value }, {})`, and `finish({ outcome }, {})`. `outcome` is `{ kind: "ok"; reason: string } | { kind: "error"; message: string; code?: string }`. Tovu injects `EventEncoder.encodeSSE`, the current ID service, response writer, and public copy. Use Jini `createAgUiTranslationState`, `translateAgentEventToAgUi` and `closeAgUiRun`. Use one terminal latch across the provider callback, navigation branch and outer error boundary. Close open text before one `RUN_FINISHED` or `RUN_ERROR`. No visible reply means `RUN_ERROR`, not a second terminal after success. Retain the HTTP/2, buffering and response-close why-comments.
- The visitor provider at `:862–906` emits callbacks, not daemon SSE envelopes. Feed those events directly to the same Jini projection. Keep `drainRunFramesToAgUi` on the real admin daemon stream. Treat dropped or failed delivery as interruption with fixed Tovu copy. Preserve existing pre-header refusal statuses and JSON. After headers, emit only the reporter’s fixed message and safe reference, never provider detail, raw thinking, tool arguments or lookup output.
- The only interim `CUSTOM` name is `client_directive`, for the existing bounded, resolved directive and temporary live approval card. It is not a second text or terminal protocol. Navigation/form completion still uses `RUN_FINISHED.result.reason === "navigation"` to release the existing deferred action. Arbitrary `CUSTOM` data cannot drive the browser. Keep legacy `sse()` only in the compatibility writer.

**Browser files and seams**

- In `SC/site-assistant-transport.ts:92–153,159–173,193–314,323–360`, remove the handwritten reader. Use `createAgUiFetchAgent({ request }, { abortController: controller, onBytes: life.armIdleTimer })`. `onBytes: life.armIdleTimer` replaces `pumpServerSentEvents({ …, onChunk: life.armIdleTimer })` at `:298`. Keep the 90 s constant at `:41` and pre-header arming at `:291`. Preserve the single immediate `ChatTransport.startRun` handle and once-only lifecycle.
- `buildVisitorRunInput({ input, threadId, runId, turnId }, _optional = {}): RunAgentInput` carries the latest user turn plus bounded prior messages with IDs and roles, `state: null`, empty `tools` and `context`, and `forwardedProps: { turnId }`. Keep a stable thread ID per mounted conversation, rotate on New thread, and keep the same turn ID for any existing retry of that start. No automatic retry or fallback POST on protocol mismatch.
- Inject `fetch`, `/api/site-assistant/chat`, the exact Accept, current frontend headers, and `credentials: "same-origin", mode: "same-origin", redirect: "error"`. Run non-OK responses through `failOnRefusal` before streaming. Preserve the private cause on body-read failure, HTTP status fallback for non-JSON and the safe incident reference. Feed allowed text events through `createAgUiToAgentTranslationState` and `translateAgUiEventToAgentEvent`. Intercept `CUSTOM`, errors and terminal events before reduction. Keep machine events out of transcripts. Match start and finish correlators to the active request and ignore late events. Use fixed host recovery wording on unclassified parser/body/network failure. Preserve `NO_REPLY_REASON` and silent intentional Stop.
- `SC/SiteAssistantWidget.hooks.ts:25–32` and `SC/vanilla-host.ts:22–29` continue to inject the same transport and their existing confirmation and page-control callbacks. No prop redesign. `SC/site-assistant-errors.ts:24` remains the wording owner. `apps/site-chat/package.json:17–20` already has the AG-UI/Jini dependencies. Use the coordinated P7-J2 pin when needed. No new package.

**Release witness.** In Chrome, run both renderers with one already-loaded old widget and one fresh widget against the same server. Verify streaming, no reply, Stop, refusal/reference, approval display and save-before-navigation. Keep both formats for the accepted one-release window. Do not retire the old writer because the new fixture is green.

### P6-T2.T — Resume the same approval, for visitor and admin

BUILDER: OPUS

Tovu authorization, cancellation and parked work. Cut over AG-UI approvals after T1. Keep `/confirm` and the legacy writer available to the already-loaded legacy bundles until P6-T2.R.

**Tests first.** Use new `W/server/__tests__/site-assistant-ag-ui-resume.integration.test.ts` and `W/server/__tests__/assistant-ag-ui-routes.test.ts:402,1041`. Use the approval scenarios at `W/server/__tests__/site-chat-stream.golden.test.ts:197–225` as reference without editing the legacy golden in this dispatch. Drive real pending exchanges and count invocations, not just HTTP 200s.

| Exact test | Mutation that must turn it red |
|---|---|
| `accept resumes the parked call exactly once` | Start a fresh provider/daemon run on resume or call the parked invocation twice. |
| `decline runs nothing` | Map deny/cancelled to allow. |
| `expired resume is refused in plain words` | Claim after the deadline or surface a raw timeout. |
| `another visitor or owner cannot resume` | Remove the owner check, or substitute a request-supplied owner for the authenticated one. Exercise wrong workspace, tab, thread, parent run and challenge. |
| `resume without an authenticated owner refuses without consuming the claim` | Allow an unresolved owner to reach the claim or settlement operation. |
| `replayed resume does nothing` | Move claim/removal after awaiting the answer. |
| `ordinary non-approval cards still render` | Interrupt every surface exchange instead of identified confirmation prompts. |
| `closing the interrupt response leaves the parked invocation alive` | Release or abort the run on normal response close after the interrupt. |
| `stop and a racing resume cannot both claim the parked call` | Let Stop and Allow use independent settlement paths. |
| `visitor approval without a page publication remains answerable` | Require page publication to resolve the approval identity. |

In `SC/__tests__/SiteAssistantWidget.confirmation.test.ts`, `SC/__tests__/vanilla-host.confirmation.test.ts` and `SC/__tests__/tool-confirmation.test.ts`, cover `the live approval posts a resume to chat and keeps its nonce out of storage`. Mutations: send to `/confirm`, append the challenge to events/history, or post two resumes on double-click.

**Server and host injections**

1. In `W/server/runtime/composition/modules/site-assistant.ts:595–641,657–731,804–829` and `W/assistant/site/visitor-confirmations.ts:8–42`, replace the AG-UI visitor confirmation channel with a bounded process-local handoff. Add **new** `W/assistant/site/visitor-ag-ui-resume.ts` with these methods on one host-created coordinator:

   - `parkVisitorApproval({ owner, threadId, runId, interruptId, held, abandonAtMs }, _optional = {}): boolean`
   - `resumeVisitorApproval({ input, owner, attachResponse }, _optional = {}): Promise<"resumed" | "expired">`
   - `abandonVisitorApproval({ interruptId, reason }, _optional = {}): void`

   `held` is a typed handle to the existing execution, response writer, approval settle/deny port and cleanup. It is not serialized tool input. Inject the clock, scheduler, secure ID source, reporter and existing bound confirmation operations. Use Jini `createAgUiPauseStore`, `confirmationInterrupt`, and `readConfirmationResume`. Preserve the 20-held/two-per-IP caps and 60-second wait. IP is a quota key, not authority. Park before emitting the interrupt. Bind the authenticated workspace/guest/tab, original thread/run and exact challenge/execution. Validate before consuming the claim, claim synchronously, attach the replacement writer, then settle the existing exchange. Preserve publication revision, policy and input revalidation in `W/assistant/site/visitor-confirmation-gate.ts:62–82`. Never take a model result, tool name, argument list or approval owner from the resume body.

2. Recognize resume before ordinary message/provider start but after the applicable enabled, body and same-origin checks. Carry the bounded shape, JSON/origin protection, and rate limit from `W/server/inbound/public-http/routes/site-assistant-confirm.ts:22–44,57–59` to the new branch. In the new branch, `resolveOwner` is required. If no owner is resolved, refuse with `This request expired. Ask again.` The current route calls `ports.resolveOwner?.(…)` at `:58` and confirms ownerless. Do not carry that optional fallback forward. Missing, expired, foreign, mismatched and replayed claims use the same plain refusal without distinguishing ownership. In `W/assistant/site/visitor-frontend-control.ts:72–85,94–116`, expose a separate approval-owner resolver using the existing signed guest-cookie/tab verification without requiring page-publication authority. Both browser hosts reuse one in-memory guest/tab credential for start and resume, even with no publication. Keep the stricter revision-bound resolver for DOM control. Failed credential issuance cannot grant Ask and must not break plain chat.

3. Separate the original execution signal and resource ownership from the HTTP writer. At park, transfer only the bounded paused run out of response-close cleanup. Close text, emit `RUN_FINISHED` with `outcome.type: "interrupt"`, then end that segment. Resume uses a fresh AG-UI run ID, the original thread and original run as `parentRunId`. It follows the same provider execution. Resume, expiry, Stop and shutdown share one cleanup. A decline cannot run the tool. The resumed turn may deliver a normal refusal. A pause is not a successful completion.

4. For admin, change `W/server/runtime/composition/modules/assistant-ag-ui.ts:160–185,210–290` and inject the daemon-side redemption binding from `W/server/inbound/assistant/agent-daemon-scope-http.ts` and `W/assistant/mcp-ui-tool-calls-route.ts:98,134–140`. The existing daemon fixture is `W/server/inbound/assistant/__tests__/agent-daemon-server.page-confirmation.integration.test.ts:64–99`. Add a server-neutral `redeemAgUiApproval({ owner, threadId, parentRunId, interruptId, decision }, _optional = {}): Promise<"resumed" | "expired">` host port. The daemon owns its live exchange, not the public website proxy. Bind to the authenticated admin scope and actual daemon run, then use its existing guarded answer/validation path once. Dispatch `handleAdminAgUiResume({ req, res, ports }, _optional = {})` before `startDaemonRun`. Subscribe to the same daemon run for the new segment. Carry the interrupt checkpoint so replay neither repeats the card nor appends previously rendered deltas. Gate `pendingApproval` emission on the working AG-UI resume path. Ordinary cards and explicit BYOK keep their routes.

5. **Lifetime gate before cutover.** Prove both original executions outlive deliberate closure of the interrupt response on the real stack. Visitor release is attached unconditionally at `site-assistant.ts:723–728` today and its signal is forwarded at `:905`. Jini `tool-executor-invocation.ts:23–40` cancels confirmation on signal abort. Visitor human wait is at `visitor-confirmations.ts:8` and `site-assistant.ts:597–600`. The separate handler deadline is at `visitor-executor.ts:141` and Jini `tool-executor-handler.ts:134`. Prove the human wait is outside the handler deadline for the selected path. Prove admin cancel-on-close at `assistant-ag-ui.ts:249–257` cannot fire on intentional park. If an original invocation cannot survive, stop with the failing phase and timeout/abort anchor. Do not recreate the invocation or extend all tool timeouts.

**Browser**

- In `SC/site-assistant-transport.ts`, add one host-scoped `answerApproval({ challengeId, allow }, _optional = {}): Promise<boolean>` to the transport binding. Keep the live correlators and original callbacks in memory only. Use `RunAgentInput` with one `resume` entry, empty messages/tools/context, a fresh run ID, and the original parent/thread. Handle the standard interrupt before ordinary terminal processing. Keep the logical turn busy and settle it once across segments.
- Inject `answerApproval` as the required `confirm` at `SC/SiteAssistantWidget.hooks.ts:8,29` and `SC/vanilla-host.ts:10,24`. In `SC/SiteToolConfirmation.hooks.ts:2,9` and `SC/vanilla-tool-confirmation.ts:2,57`, require the callback without defaulting to `confirmSiteAssistantTool`. Keep focus, pending-strip and Stop/reset behavior, and retain `parseToolConfirmation`. The new bundle must not POST to `/confirm`. Server-side removal and final legacy-test repoints belong to T2.R.
- In `A/lib/assistant-transport-ag-ui.ts:67+`, use the existing live-event seam and `resumeAgUiRun` for the existing card’s decision. Wrap segment completion at the logical-run boundary. Jini currently observes interrupts before completing the HTTP segment (`J/chat/src/core/ag-ui/__tests__/interrupts.test.ts:51–74`). At `A/components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:57,177+`, inject the poster in existing renderer composition. Route only matching live AG-UI approval decisions there. Do not globally redirect MCP-UI or typed-answer routes.

**Why-comments to keep.** The pause is a one-use right to answer an already-running call. The challenge addresses a decision but cannot authenticate it. Normal segment close is not Stop. Invalid answers cannot consume the legitimate owner’s claim. No new Jini API required.

### P6-T3.J — Put a server claim in front of AG-UI browser execution

BUILDER: OPUS

Jini authorization and effect ordering. The registry already checks `begin` at `J/daemon/src/frontend-session-registry.ts:291–298,451–454`. The bridge currently reaches the driver without it at `J/chat/src/embed-widget/browser/frontend-session-bridge.ts:286–299`.

**Tests first**

- `J/daemon/src/__tests__/frontend-session-ag-ui.test.ts:37–88` — `an AG-UI invocation is delivered only to its own bound run` and `an AG-UI result is refused before begin`. Mutations: deliver through the session-wide callback as well as the bound run callback, or settle without checking the claimed state.
- `J/daemon/src/http/__tests__/frontend-sessions.test.ts`, beside the response ownership tests — `begin requires the live session token, owner, run and invocation`. Mutation: authorize by session ID alone. Exercise expiry/unbind and duplicate or foreign claims through the real route.
- Same route suite — `begin is not mounted without an owner hook`. Verify opted-in delivery binds also refuse in that configuration. Mutation: mount begin behind the same-origin gate when `resolveOwner` is absent.
- `J/chat/src/embed-widget/browser/__tests__/frontend-session-bridge.test.ts` — `an AG-UI page action begins before the driver and acknowledges its own invocation` and `refused begin never enters the page driver`. Mutations: execute before awaiting begin or substitute the model tool-call ID for the invocation ID.

**Edits and injected ports**

- At `J/daemon/src/frontend-session-registry.ts:74–80,108–112,236–251,291–298,400–408,427+` and `J/daemon/src/http/frontend-control.ts:98–106,179–188,219–225`, extend the existing authenticated bind with optional run-specific delivery. Use `bindRequest({ runId, bindToken, owner, signal }, { deliverInvocation } = {})`, with `deliverInvocation(required: { runId: string; invocation: FrontendInvocation }, _optional = {}): void`. The opted-in invocation goes to one destination, after its pending record exists. Store and retire the port with that exact binding. Require `begin` before success or failure settlement for opted-in results. Leave existing session-stream consumers unchanged. Cancel retires the claim before a late effect or result can be accepted.
- In `J/daemon/src/http/frontend-sessions.ts:169–216,326–355`, add server-neutral `frontendSessionBeginRoute` as `defineJsonRoute` beside the response spec, with bounded `{ sessionId, runId, invocationId }` and a small `FrontendSessionBeginDeps` containing only session authorization and existing claim operations. Validate the origin and bind the resolved owner, session and live bind token to the exact run and invocation. Mount `POST <prefix>/:sessionId/begin` ONLY through the owner gate at `frontend-sessions.ts:326`. When `deps.resolveOwner` is absent, do not mount the begin route, and opted-in `deliverInvocation` bindings refuse to bind. Do not copy the responses route’s `requireSameOrigin: !deps.resolveOwner` fallback at `:344`. Keep `/:sessionId/responses` for bounded result delivery. Return no invocation data on refusal. An AG-UI `TOOL_CALL_RESULT`, if projected back, uses the same invocation ID and is not an alternate settlement route.
- At `J/chat/src/embed-widget/browser/frontend-session-bridge.ts:270–299,302–367`, add opt-in `acceptRunInvocation({ runId, action }: { runId: string; action: ChatPaneAgentToolAction }, _optional = {}): void` on the existing bridge. Require an injected `begin` in the opt-in binding, typed `(required: { runId: string; invocationId: string; signal: AbortSignal }, _optional = {}) => Promise<boolean>`. Reuse the queue, page executor, pending controller and response hooks. Do not execute opted-in runs through ordinary session-stream dispatch. Check abort immediately after the claim and before the driver. Host composition supplies authentication, requests and AG-UI-to-action projection. No daemon↔chat implementation import.

**Why-comments.** Model tool IDs correlate transcripts and are not capabilities. Registry-authenticated delivery chooses one browser. Delivery alone is not permission. `begin` must claim the invocation against the live binding.

**Package.** No new subpath. Use daemon `./http` at `J/daemon/package.json:115` and chat `./browser/frontend-session-bridge` at `J/chat/package.json:241`. Add `.changeset/p6-ag-ui-frontend-delivery.md` with minor bumps for `@jini-ai/daemon` and `@jini-ai/chat`. In Opus verification, run `pnpm api:update` and accept only additive spec and port deltas in `api-baseline/jini-ai__daemon.json` and `api-baseline/jini-ai__chat.json`. If a cross-package declaration is needed, put the type in core with its own changeset entry and baseline delta.

### P6-T3.T — Bind visitor page control to the AG-UI run and fix B192

BUILDER: OPUS

Tovu browser effects and approval binding. Consume P6-T3.J through the existing release handoff. On merge-21, the separate frontend SSE channel still executes actions at `SC/visitor-page-control.ts:115–126`. B192 is at `:77–82,128–129` and `SC/site-assistant-transport.ts:289–313`.

**Tests first**

- In `SC/__tests__/site-assistant-transport.test.ts:545–619`, add `attach failure still answers the question`. Use the real page-control adapter with a rejected or timed-out first attachment or rebind. Assert one chat POST, no stale page binding headers, no chat error, and a streamed answer. Assert Stop racing attach prevents the POST. Mutations: let `headers()` rejection leave `performRun`, or turn Stop into fallback chat.
- In `SC/__tests__/visitor-page-control.recovery.test.ts:24–50`, add `an effect from another run is ignored`, `result carries the invocation id`, and `navigation persists before the document is replaced and never replays`. Mutations: accept a tool from a previous bound run, use the model call ID in the result, or act on replay before transcript persistence.
- In `W/assistant/site/__tests__/visitor-frontend-control.unit.test.ts` and `W/server/__tests__/visitor-assistant-safety.integration.test.ts`, add `a refused model call never becomes a browser tool call` and `a disconnected page cannot begin or settle its old invocation`. Mutations: project provider `tool_use` as actionable or accept a result after unbind. Include accepted form submission, a form filled without submission, and a rejected navigation target.

**Edits**

- At `W/assistant/site/visitor-frontend-control.ts:38–50,88–117` and `W/server/runtime/composition/modules/site-assistant.ts:725–731,749–767,786–796,884–896`, extend `bindRequest({ req, signal, runId }, { deliverInvocation } = {})` using the Jini port. Close over the authenticated attachment and internal logical run. In **new** `projectVisitorBrowserInvocation({ runId, invocation, writer }, _optional = {})`, project only registry-delivered reviewed actions as `TOOL_CALL_START/ARGS/END`. Use the registry invocation ID as `toolCallId`, never the model call ID. Use the existing assembled, bounded publication plan sent to the driver. Do not mirror internal provider calls, raw results or browser credentials. On T2 resume, update the active segment writer without reauthorizing an old attachment or changing the invocation identity.
- In `SC/site-assistant-transport.ts` and `SC/visitor-page-control.ts:22–39,41–75,86–132`, add `acceptBrowserInvocation({ runId, action }, _optional = {})` to the injected frontend object and `resolvePageHeadersForTurn({ frontend, signal }, _optional = {}): Promise<Record<string, string>>`. Assemble complete tool calls only on the current validated AG-UI segment. Send them to the page adapter as live-only data. Never store them in chat events or session storage. Validate reviewed capability, publication and path at the existing driver boundary. Request `begin` with original attachment credentials before driver execution and post the bounded result with that invocation ID. Keep page headers all-or-nothing. On failed attach/rebind, close and invalidate the stale binding, omit page headers for this turn and leave the next turn eligible to reattach. Preserve T2’s separate approval identity. Recheck the run signal before the fallback POST. Do not write a model apology from the transport.
- Preserve the terminal navigation handshake. For an unloading action, the claimed driver prepares the exact reviewed destination or deferred submit, the matching response is acknowledged, and the terminal callback then persists synchronously and commits the one-use action. A terminal alone cannot authorize an action. Invalidate prepared actions on refusal, cancel, replacement or failed result acknowledgement. Do not move `location.assign` or actual submission ahead of acceptance and transcript flush. If the driver cannot keep the deferred effect tied to the same live claim through the handoff, stop and fix the ordering before enabling.
- Remove only the navigation/form-fill branches of `CUSTOM client_directive` that P6-T3's tool calls now deliver. Keep the `client_directive` CUSTOM name (owner rec 2: the only custom name) for any remaining directive kind, including the T2 approval card. If no kind remains, list the removal as a follow-up; do not remove it in this sheet. Keep comparison and renderer wiring in `SC/SiteAssistantWidget.hooks.ts:28–32` and `SC/vanilla-host.ts:22–29` as host injection. No admin kit dependency or DOM driver fork.

**Why-comments.** The model can request an effect but cannot deliver one. Browser reload preserves chat without replaying actions. Losing the optional page channel does not make a visitor’s question unanswerable.

### P6-T4.J — Bind the AG-UI admin start to the durable chat lifecycle

BUILDER: OPUS

Jini public transport contracts and acceptance/Stop ordering. This is the Jini half of a parity finding larger than the plan’s 30-minute fix allowance. It is not a request for a second store or run lifecycle.

**Tests first**

- `J/chat/src/core/__tests__/durable-run-subscription.paths.unit.test.ts:97+` — `an accepted AG-UI start follows the canonical run checkpoint without duplicate deltas`. Mutation: append stream replay to a seeded transcript or use the client segment ID as a durable run ID.
- `J/chat/src/core/assistant-client/__tests__/ag-ui-transport.test.ts:180+` — `AG-UI detach closes only the reader and explicit Stop cancels the canonical run once`. Mutation: cancel off the detach signal, or cancel only the in-memory fetch after acceptance.
- Same assistant-client test area — `a durable AG-UI start retains Local CLI launch and attachment context`. Mutation: use the display-only `messages` array as the launch context, or omit the assistant message ID, attachment references or conversation binding.

**Edits**

- `J/chat/src/core/assistant-client/transport.ts:734–757,837–844,879–905,921–950`. Factor the existing preparation call into `prepareLocalRunStart({ input, userMessage, conversationId, options }, _optional = {})`. Its returned object carries the existing contextRef launch projection, agent selection, idempotency/message identity and conversation binding. Use the same prep before both Local CLI starts. Keep durable user persistence before dispatch. Preserve unseen-tail versus cold-start selection, current-turn redaction signal, existing attachment normalization, and existing `cancelSignal` distinct from detach. Do not allow the browser’s forwarded context to choose or trust a session ID at admission.
- `J/chat/src/core/assistant-client/ag-ui-transport.ts:23–38,104–123,148–222,230–265`. Add an opt-in durable Local CLI binding to the existing `AgUiClientPorts`, with neutral hooks:

  - `prepareRunInput({ input, wire, launch }, _optional = {}): RunAgentInput`
  - `readAcceptedRun({ event, input }, _optional = {}): { runId: string; messageId: string; conversationId: string } | undefined`
  - `followAcceptedRun({ runId, messageId, conversationId, handlers, signal }, _optional = {}): void`
  - `cancelAcceptedRun({ runId, messageId, conversationId }, _optional = {}): Promise<void>`

  `launch` is the prepared Local CLI start object, not a package implementation. Type `event` as the validated `RUN_STARTED` variant. Return the canonical accepted ID to `ChatTransport` and retain the client segment ID for wire correlation only. Keep the no-binding behavior for existing consumers. Add a once-only explicit pre-acceptance cancel using the existing acceptance-cancel port and message ID. If acceptance wins, cancel that accepted run without launching again. Persist the existing binding before reporting start. Reuse `followDurableRun` at `J/chat/src/core/assistant-client/durable-run-subscription.ts:22` and `onCheckpoint` in that file at `:81–94,96–141`, with one authoritative transcript projection and one final usage. No saved frames as live effects. Do not change BYOK dispatch or positional `ChatTransport` signatures.

**Host injection and why-comments.** Tovu injects wire launch-field projection, accepted-ID interpretation, checkpoint following and explicit cancellation. The logical message is durable, the AG-UI stream is a delivery segment, and aborting a delivery segment on unload is not Stop. Preserve the comments explaining why acceptance precedes waiting and why saved projections replace replay.

**Package.** No new export path. Keep `./transports/ag-ui` and assistant-client mappings in `J/chat/package.json`. Add `.changeset/p6-durable-ag-ui.md` as `@jini-ai/chat` minor. In Opus verification, run `pnpm api:update` and inspect `api-baseline/jini-ai__chat.json` for only the additive opt-in port and type deltas. Separate incompatible changes if existing ports cannot stay source-compatible.

### P6-T4.T — Close the six admin parity gates

BUILDER: OPUS

Tovu · real persistence, authenticated recovery and verification

**Tests first.** Use the existing `W/server/__tests__/assistant-ag-ui-routes.test.ts`, `assistant-ag-ui-wire.golden.test.ts`, and `A/lib/__tests__/assistant-transport.ag-ui.unit.test.ts`. Add **new** `W/server/__tests__/assistant-ag-ui-durable.integration.test.ts` for the real acceptance, transcript checkpoint and provider-start count. A fake daemon alone is not reload proof.

| Gate and exact test | Required proof and mutation |
|---|---|
| **Resume** — `reopening an AG-UI conversation follows its actual run without duplicate deltas` | Replace the empty and null pins at admin unit `:627–636,767–801` for the durable path. Reopen the persisted message, observe its real status and terminal text, verify exactly one launch. On follow-up, check CLI/ACP session carryover and full stateless context. Mutations: save the ephemeral segment ID or append live deltas over a checkpoint. |
| **Approvals** — `admin AG-UI resumes a real parked approval and still renders ordinary cards` | Reuse T2’s allow, deny, expiry, foreign owner and replay witnesses on the durable canary. Mutations: bypass the existing bound answer gate, or drop ordinary-card frames. |
| **Stop** — `Stop reaches an AG-UI run before headers, during subscribe, streaming and parked approval` and `Stop after reopen cancels the owned run once` | Preserve applicable existing tests at server `:769–923`, with explicit Stop distinct from ordinary detach. Check no orphan start and no error banner on intentional Stop. Mutations: cancel only the fetch, cancel on mere reload, or drop the message-ID cancel-before-acceptance path. |
| **Errors** — `admin AG-UI refusals, failures, disconnects and no reply each leave one actionable terminal outcome` | Exercise JSON refusal, daemon/provider failure, dropped stream and no-reply through the dock. A recoverable drop goes back to the same run. Use a private diagnostic canary. Mutations: expose `startUpstream.text()`, mark an interrupted reply successful, or deliver two terminal callbacks. |
| **Attachments** — `an AG-UI attachment reaches the selected agent and survives reopen and retry` | Assert canonical attachment refs reach staging, cancellation cleans its own staging, and the reopened transcript retains the same attachment. Mutation: omit `attachmentIds` from accepted context or strip the attachment refs at persistence. |
| **Cost footer** — `the AG-UI cost footer survives reconnect exactly once` | Go through `tovu.usage` and the final checkpoint; duplicate the last delivery in the fixture and assert one final footer with the same totals. Mutations: drop usage projection or append totals again after reconnect. |

**Edits and injection**

1. In `W/server/runtime/composition/modules/assistant.ts:172–194`, factor existing acceptance into a host helper **new** adjacent `assistant-run-acceptance.ts`, `acceptOwnedAssistantRun({ principalId, workspaceId, conversationId, messageId, request, ports }, _optional = {})`. Return the existing canonical accepted run/binding, not a response. Both `proxyAcceptedRun` and `assistant-ag-ui.ts:160–185,210–290` inject the same ledger, finalizer, clock, ID source, daemon launch and tracking. Keep the existing durable acceptance before launch/watch. Do not invent an AG-UI storage table. Parse bounded launch fields before acceptance, strip browser-owned principal/recovery authority as `assistant.ts:145–166` does, and keep context normalization/redaction on the server. Use the actual durable ID in `RUN_STARTED`, with the accepted message/conversation binding from the verified request. Preserve the legacy start branch for canary clients without durable identity during the handoff. Do not silently pass those clients off as having parity.
2. At `W/server/runtime/composition/modules/assistant-ag-ui.ts:196–204,249–290`, inject the existing owner-scoped daemon subscription. Reuse `assistant.ts:224–248,618–623` for checkpoint/status/cancel ownership and the native cursor/recovery machinery underneath. The checkpoint is the existing app persistence API, not a second AG-UI event protocol. Disconnect of a durable reader closes only its subscription. Explicit Stop uses the same owned durable cancel and pending-message admission ordering as `/api/runs`. A live projection can deliver cards and interrupts, but do not replay executable card actions or page effects from saved text/events.
3. Bind in `A/lib/assistant-transport-ag-ui.ts:67+`, `A/lib/assistant-transport.ts:25–33,117–152`, and `A/components/AssistantDock/hooks/assistant-transport.hooks.ts:89–124`. Inject the existing transport fetch, message/run binding, checkpoint and cancel hooks, and the T2 approval poster. Keep `tovu.usage` on the existing reducer path and let the final authoritative snapshot replace the interim projection. No admin kit domain imports, panel movement or new client persistence.
4. Preserve the fixed interruption/failed-run copy in `assistant-ag-ui.ts:293–299`. At `:179–182`, remove public raw daemon `detail` on the durable route. Keep safe known refusal information and a report reference. Record redacted detail only at the host reporter. Verify `agent-daemon-run-start.ts:204–238,248–265,315–359` receives the existing launch fields and stages attachments through the existing owner-bound path.

**Stop and sign-off.** Keep the default off. For each gate, fix bounded findings within the step or list a separate follow-up if it exceeds the plan’s 30-minute allowance. The known durable work above is such a follow-up, and the gate remains red until it lands and is exercised. Require Chrome and Electron on the Local CLI canary with Claude, Codex and agy. Explicit BYOK must still choose its own mode. Check client Stop and physical reload separately, and simulate a dropped connection rather than relying on a successful mock stream. Record pass/fail per row before releasing P6-T5.

### P6-T2.R — Retire the visitor `/confirm` compatibility route

BUILDER: OPUS

P6-T2.R: dispatch only after the release that shipped P6-T1's dual format has been live for one release (owner rec 1). The coordinator closes the window at the first release after P6-T1 ships, with no additional owner sign-off. Require T2.T’s visitor resume and lifetime witnesses before removal. The old `/confirm` mount, compatibility writer and legacy browser behavior stay in service during the window.

**Tests first and security ports**

- Port every case from `W/server/inbound/public-http/routes/__tests__/site-assistant-confirm.unit.test.ts` to the resume branch, keeping the original test names prefixed `resume:`. Preserve SEC-F3b/F3c proofs for null/forged Origin, method-aware Referer, Sec-Fetch, bad shape, replay and the limiter. Keep the literal decision, uniform refusal, disabled/rollback and existing serving-host coverage. Port the regressions before deleting the old route test. Mutation: bypass the corresponding origin, shape, replay or limiter gate and observe the matching test fail.
- In `W/assistant/site/__tests__/visitor-frontend-control.unit.test.ts:13,27,50–86`, replace the old confirm import and mount and move the class guard to compare resume against credentials. Keep the title `F3b class guard: resume and frontend credentials apply identical visitor origin verdicts`. Require a resolved owner on the resume path. Missing owner returns `This request expired. Ask again.` without consuming or settling the challenge.
- In `W/server/__tests__/site-assistant-routes.test.ts:79–93,147`, repoint the real-stream Ask witnesses to the resumed AG-UI segment. Preserve the no-effect-before-click, refusal, one-use and provider-continuation assertions.
- Repoint the `/confirm` consumers in `W/server/__tests__/site-chat-stream.golden.test.ts:197–240` to the AG-UI golden path, including the helper at `:146–149` and the capacity scenario’s cleanup at `:258`. Carry over allow, deny, expiry and capacity behavior before retiring the legacy wire fixture. Keep exact-scenario coverage in the surviving golden. This is the removal dispatch, not permission to change the legacy golden during T1.
- Repoint `SC/__tests__/tool-confirmation.test.ts`, `SC/__tests__/SiteToolConfirmation.hooks.test.ts`, `SC/__tests__/vanilla-tool-confirmation.test.ts`, `SC/__tests__/SiteAssistantWidget.confirmation.test.ts:19,50` and `SC/__tests__/vanilla-host.confirmation.test.ts:18`. Assert the new bundle uses the injected answer and never requests `/confirm`. Supply an explicit callback in the vanilla missing-markup test at `vanilla-tool-confirmation.test.ts:90`. Verify cross-app `A/features/ai-assistant/__tests__/VisitorToolsPanel.unit.test.tsx:17,85` still compiles with its existing injected `confirm`.
- Assert `/confirm` is no longer mounted and cannot settle a live approval. Mutation: restore the old POST mount. Verify the new bundle has no reference to that endpoint.

**Removal**

- Remove the `registerSiteAssistantConfirm` import at `W/server/runtime/composition/modules/site-assistant.ts:28`, its mount at `:630–641`, and `W/server/inbound/public-http/routes/site-assistant-confirm.ts`. If extraction landed first, remove the equivalent extracted spec and host mount instead, and make sure the extraction lane does not recreate it.
- Remove the legacy POST at `SC/tool-confirmation.ts:25–30`. Keep `parseToolConfirmation`, imported at `SC/site-assistant-transport.ts:33`, and its still-needed narrowing and why-comment. Ensure `confirm` is a REQUIRED injected answer, with no `confirmSiteAssistantTool` import or default, at `SC/SiteToolConfirmation.hooks.ts:2,9`, `SC/vanilla-tool-confirmation.ts:2,57`, `SC/vanilla-host.ts:10,24`, and `SC/SiteAssistantWidget.hooks.ts:8,29`. Both hosts pass the live resume answer. Keep the existing adapter seams and optional-argument pads.
- Delete the interim **legacy** approval writer with the expired legacy wire path. Do not remove the surviving AG-UI `CUSTOM client_directive` name or unrelated approval and card routes.

**Route-table baseline.** Regenerate `W/server/runtime/composition/__tests__/fixtures/create-app-route-table.snapshot.json` through `create-app-route-table.pin.test.ts` with `UPDATE_ROUTE_TABLE_PIN=1`. Remove the `162 route post /api/site-assistant/confirm` row at merge-21 line `170` (`[<anonymous>]` handler), and its equivalent in every variant. Merge-21 also contains rows at `726,1281,1796,2359,2914,3470`. Let the generator renumber affected entries. Verify the relative registration order of surviving routes is unchanged and record the intentional snapshot baseline refresh in the report. No Jini API change.
