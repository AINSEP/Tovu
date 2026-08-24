# AG-UI retrofit — sample spec (prototype, not a build plan)

Status: illustrative only. Written to support the owner's 2026-08-17 decision to reopen
ADR-049 (`ADS-memory/reports/architecture/ADR-049-assistant-adopts-jini-kit-supersedes-copilotkit-agui.md`)
and the matching HIGH PRIORITY entry in `development/todos.md`. Nothing here is wired into
the running app, no package was installed, no existing file was touched. If this goes
forward it needs its own ADR superseding ADR-049's transport decision, per that ADR's own
closing note and the todo's "before real implementation work starts" section.

## 1. Goal

Prove out AG-UI (`ag-ui-protocol/ag-ui`) as a second, parallel transport for Tovu's admin
assistant — a **canary path**, not a replacement:

- The existing `@jini-ai/chat-react` + `@jini-ai/daemon` transport
  (`apps/admin/src/lib/assistant-transport.ts`, ADR-049) stays exactly as it is.
- A new AG-UI adapter runs **alongside** it, reachable only when explicitly selected
  (feature flag / runtime picker entry), so it can be evaluated with real traffic and
  dropped with zero blast radius if it doesn't pan out.
- Nothing about `ChatPane`'s Local-CLI or BYOK paths changes. The daemon
  (`src/assistant/agent-daemon-server.ts`) is untouched.

This is a **port-and-adapter** shape: define a transport-neutral seam, then plug AG-UI in
as one implementation of it, the same way `assistant-transport.ts` already picks between
Local CLI and BYOK inside one `ChatTransport` implementation (see that file's own module
doc — this is the same pattern one level up).

## 2. What already exists that this adapts

- `apps/admin/src/lib/assistant-transport.ts` — implements `@jini-ai/chat-react`'s
  `ChatTransport` (`startRun`/`reattachRun`/`fetchRunStatus`/`stopRun`). Two backend paths:
  - **Local CLI**: `POST /api/runs` → `EventSource(GET /api/runs/:runId/events)`, frames are
    `@jini-ai/protocol`'s `RunProtocolEvent` (`{runId, kind, payload}`).
  - **BYOK**: one held-open `POST /api/admin/v1/assistant/byok-turn`, frames carry the same
    `payload.type` vocabulary directly (no `RunProtocolEvent` envelope).
- `translateRunAgentPayload()` (same file) reduces **either** wire shape's `payload` into one
  common `chat-core` `AgentEvent`: `status | text | thinking | tool_use | tool_result |
  usage | raw | ext`. This is the one place both backend paths already agree on a shared
  vocabulary — see §3 for why the AG-UI adapter builds on this function's *output*, not on
  either backend's raw wire format.
- `src/server/modules/assistant-byok.ts`'s `handleTurn()` — the simplest backend shape to
  clone for a canary: one Express route, one held-open SSE response, no separate daemon
  process or reattach/cancel machinery. `runByokProviderTurn()`'s `onEvent` callback is
  exactly the seam a new adapter route would hook.
- `apps/admin/src/components/AssistantDock/AssistantDock.tsx` — the mounted chat pane.
  `AssistantDock.hooks.ts`'s `useExecutionConfig`/`useByokRuntime`/`useLocalCliSelection`
  already give the runtime picker a third mode to add to (`"local" | "byok"` → `"local" |
  "byok" | "agui"`).

## 3. Adapter shape

**Integration point: `AgentEvent` (chat-core's already-reduced vocabulary), not the raw
`RunProtocolEvent`/`payload.type` wire format.** Reasoning:

- `translateRunAgentPayload` is *already* the canonical reduction both of Tovu's existing
  backend paths converge on — building the AG-UI adapter on top of its output means **one**
  `AgentEvent → AG-UI event[]` function covers both Local CLI and BYOK for free, instead of
  writing two wire-format-aware adapters that would drift apart the way the two backend
  routes' raw shapes already have (see that file's own module doc on why `RunProtocolEvent`
  and BYOK's bare `payload.type` are different envelopes over the same vocabulary).
- It keeps the adapter a **pure function over a stable, already-tested union type**, matching
  the testability pattern `assistant-transport.ts` itself values (its own doc calls out
  `translateRunAgentPayload` being exported specifically so it's unit-testable without a
  `fetch`/`EventSource` stub — `backend-agui-adapter.sample.ts` follows the same shape).
- Cost: `AgentEvent` already dropped some wire-level detail Tovu's own comments flag as
  deliberately unrenderable today (`thinking_start`/`stage_start`/`stage_end` return `null`
  in the switch). The AG-UI adapter inherits that same loss — it cannot emit anything for
  data Tovu's own transport already threw away one layer down. Fine for a canary; worth
  re-checking if AG-UI's richer event set (activity/step events) turns out to want that data.

### Event mapping (`AgentEvent.kind` → AG-UI `EventType`)

| Tovu `AgentEvent.kind` | AG-UI event(s) emitted | Notes |
|---|---|---|
| *(run start)* | `RUN_STARTED` | Emitted once, before the first translated event. |
| `text` | `TEXT_MESSAGE_START` (once) + `TEXT_MESSAGE_CONTENT` (per delta) + `TEXT_MESSAGE_END` (on boundary) | Tovu's `text` events are bare deltas with no explicit message-start/end signal — the adapter has to **synthesize** the START/END boundary itself. See the sample's `AgUiTranslationState` for the heuristic and its limits. |
| `thinking` | `REASONING_START` (once) + `REASONING_MESSAGE_START`/`REASONING_MESSAGE_CONTENT` (per delta) + `REASONING_MESSAGE_END`/`REASONING_END` (on boundary) | AG-UI has a native reasoning-stream lifecycle — cleaner fit than folding this into `CUSTOM`. Same synthesized-boundary caveat as `text`. |
| `tool_use` | `TOOL_CALL_START` + `TOOL_CALL_ARGS` + `TOOL_CALL_END` | Tovu emits one complete `tool_use` event (input already assembled), not incremental arg deltas — so all three fire back-to-back for one Tovu event, unlike a provider that streams args token-by-token. |
| `tool_result` | `TOOL_CALL_RESULT` | Direct mapping; `toolUseId` → `toolCallId`. |
| `usage` | `CUSTOM` (`name: "tovu.usage"`) | AG-UI's `RUN_FINISHED.usage` field is the more "native" home, but Tovu can emit `usage` mid-stream, before the run's real end — folding it into the terminal event would mean buffering it and losing the mid-stream signal. Flagged as a rough edge, not solved. |
| `status` | `CUSTOM` (`name: "tovu.status"`) | AG-UI's `STEP_STARTED`/`STEP_FINISHED` imply a matched pair the adapter can't reliably close (Tovu's `status` events are fire-and-forget labels, not named steps with a start and an end) — `CUSTOM` avoids emitting a promise the adapter can't keep. |
| `raw` | `RAW` (`{event: <line>}`) | AG-UI's `RAW` type is documented as exactly this escape hatch. |
| `ext` (`mcp-ui` / `a2ui`) | `CUSTOM` (`name: "tovu.ext.<name>"`), **unsolved** | See §4 — explicitly out of scope for this pass. |
| *(run end)* | `RUN_FINISHED` or `RUN_ERROR` | Mirrors `terminalReasonNotice`'s existing `max_tool_turns` special case — worth carrying over as a `CUSTOM` event or a `RUN_FINISHED.result` note, not designed here. |

Sources for the AG-UI event shapes above: [AG-UI core events](https://docs.ag-ui.com/sdk/js/core/events),
[`@ag-ui/core` on npm](https://www.npmjs.com/package/@ag-ui/core). SSE wire encoding
(`data: {json}\n\n`, `text/event-stream`, with protobuf negotiation available but not used
here) via [`@ag-ui/encoder`](https://www.npmjs.com/package/@ag-ui/encoder).

## 4. Explicitly out of scope

- **`mcp-ui` / `a2ui` handling.** These are Jini's own generative-UI channels (confirmed
  unrelated to AG-UI despite the similar name — see ADR-049 and the todo's own correction).
  The sample routes them through AG-UI's `CUSTOM` event as an inert side-channel so nothing
  throws, but **no frontend renderer for that `CUSTOM` payload is designed here.** Real
  question for whoever picks this up: does `McpUiSurfaceCard`/`A2uiSurfaceCard` (today wired
  against `chat-core`'s `ext` event kind — see `AssistantDock.tsx`'s two
  `registerExtEventRenderer`/`registerMcpUiSurfaceRenderer` calls) get a CopilotKit-side
  equivalent, or do these two features simply not exist on the AG-UI canary path until
  someone builds one? Left open on purpose.
- Multi-agent / model picker parity with the Local CLI path's `AgentRuntimePicker`.
- Attachments, MCP-UI confirmation redemption, frontend page-control (`page.navigate` etc.) —
  none of it is touched by the AG-UI path in this sample.
- Reattach-after-reload. The sample backend route mirrors `assistant-byok.ts`'s
  held-open-POST shape (see §5), which inherits that shape's same disclosed limitation: no
  reattach, no `fetchRunStatus`, no server-side cancel-by-id.

## 5. How this would actually get wired in as a canary (sketch only)

1. **Backend**: a new route, `POST /api/admin/v1/assistant/agui-turn`, registered in
   `src/server/modules/assistant-byok.ts` (or a sibling module) — same
   `requireAdminSession` gate, same `runByokProviderTurn()` call Tovu already has, but its
   `onEvent` callback runs events through `backend-agui-adapter.sample.ts`'s translator and
   writes them with `@ag-ui/encoder`'s `EventEncoder` instead of the current bare
   `sse(res, "agent", event)` helper. Reuses the existing tool surface/credential
   resolution unchanged — only the wire format changes.
2. **Frontend transport picker**: `AssistantDock.hooks.ts`'s `ExecutionConfig.mode` grows a
   third value (`"agui"`), same shape as the existing `"local" | "byok"` picker in
   `AssistantDock.tsx`'s `executionMode`/`onExecutionModeChange` props. Behind a feature
   flag (env var or admin setting) so it's invisible until explicitly turned on.
3. **Frontend rendering**: when `mode === "agui"`, swap in the component sketched in
   `frontend-agui-chat.sample.tsx` instead of `<ChatPane>` — a parallel render path, not a
   prop change to the existing one, since it speaks a structurally different message/event
   model (`AbstractAgent`'s `messages`/`toolCalls`, not `chat-core`'s `ChatMessage`/
   `AgentEvent`).
4. **Fallback**: nothing about steps 1–3 removes the existing Local CLI/BYOK paths. If the
   canary underperforms or the licensing question in §6 kills it, deleting the flag and the
   new route/component reverts Tovu to exactly ADR-049's current state.

## 6. Open questions / risks for the owner (found during research, not solved here)

1. **The todo's named frontend hook, `useCopilotChatHeadless_c`, is a paid feature.**
   Confirmed via [CopilotKit's "Fully Headless UI" docs](https://docs.copilotkit.ai/premium/headless-ui):
   it's an **Early Access Premium** feature gated behind a `publicLicenseKey` from Copilot
   Cloud. That's a real tension with the stated rationale for this whole retrofit ("AG-UI is
   a stable **public** protocol... worth having over a hand-rolled one") — the *protocol* is
   open and free; *this specific convenience hook* is not. `frontend-agui-chat.sample.tsx`
   is built instead on `useAgent` + `useCopilotKit` from `@copilotkit/react-core/v2`
   ([docs](https://docs.copilotkit.ai/reference/hooks/useAgent)), which appear to be
   ordinary (non-premium) v2 hooks giving equivalent low-level control — own message list,
   own tool-call rendering, own styling, no license key found to be required for those two
   specifically. This needs a real licensing conversation before anyone commits to the
   premium hook; the sample takes the free path and flags it.
2. **Direct-to-Tovu-backend wiring without CopilotKit Cloud/runtime could not be fully
   confirmed.** `@ag-ui/client`'s `HttpAgent` (constructor `{url, headers}`,
   [docs](https://docs.ag-ui.com/sdk/js/client/http-agent)) is clearly meant to let a
   frontend talk directly to any AG-UI-compatible HTTP endpoint — which is what Tovu wants
   (talk to Tovu's own Express route, not a hosted CopilotKit runtime) — and CopilotKit's own
   docs mention passing an `HttpAgent` "straight to the CopilotKit" as a supported pattern.
   But the exact `<CopilotKit>` provider props for that zero-runtime, zero-cloud-key case
   didn't come back from the docs during this research pass. Flagged as a verify-at-
   implementation-time item in the sample rather than guessed.
3. **The text/thinking start-end synthesis in §3 is a real design decision, not a detail.**
   Tovu's `AgentEvent` stream has no explicit "new message started" signal beyond a change
   in `kind` — the adapter has to infer message boundaries. Get this wrong and either
   AG-UI's client throws (its own issue tracker shows exactly this failure mode — sending
   `TEXT_MESSAGE_START` twice without an intervening `END` is a protocol violation some
   client implementations reject) or messages render merged together. Worth a second pass
   once real multi-turn transcripts are available to test against, not something to trust
   from a paper design.
4. **`mcp-ui`/`a2ui` (§4) has no answer here.** If those two features matter for the AG-UI
   canary to be a fair comparison against the existing transport, that's separate scoped
   work, not a footnote.
