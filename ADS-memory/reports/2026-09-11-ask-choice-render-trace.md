# `assistant_ask_choice` render-failure trace — 2026-09-11

Skill loaded: `AI-Dev-Shop/agents/codebase-analyzer/skills.md` (confirmed at dispatch start).

Diagnosis only. No source file was modified. No daemon restart, no build, no `.db` write. Direct
`rg`/Read exploration was used throughout (no graph backend bootstrapped) — the task was a precise,
already-scoped trace across a known small set of files, not open-ended repo comprehension, so this
matched the skill's "direct exploration acceptable" guidance rather than triggering the Phase-0
backend-gate offer.

## Compressed answer

1. **Streamed live, not terminal-only, by design.** `text_delta`/`tool_use`/`mcp-ui` events are
   pushed to the pane per-delta through `handlers.onEvent`, and the SAME per-delta callback
   (`onMessagesChange`) drives BOTH rendering and persistence to `chat.db`. So "only persisted at
   terminal state" is not what the architecture does — but it does mean rendering and persistence
   fail *together*, which matters below.
2. **The broken hop:** `useRunStream`'s `reattach()` — the one function that re-opens a live
   `EventSource` onto an already-running daemon run — is fully implemented and wired end-to-end
   (`transport.reattachRun` → `subscribeToRun`, a real `GET /api/runs/:runId/events`), but **is never
   called anywhere in either package.** `Jini/packages/chat/src/react/hooks/useRunStream.ts:42` is
   the only place `.reattach(` appears in the whole `@jini-ai/chat` react tree or in
   `apps/admin/src` — confirmed by an exhaustive grep, zero other hits. Once the browser's live
   subscription for a run is torn down for ANY reason (tab remount, HMR reload of the admin bundle,
   the daemon process restarting), nothing ever reconnects it. The pane and `chat.db` both go
   permanently silent for that run, no matter how much more the agent does.
3. **General, not `assistant_ask_choice`-specific.** Both of her two assistant text messages
   (plain prose, no tool involved) were equally invisible, not just the two `assistant_ask_choice`
   prompts. The `mcp-ui` surface path itself (tool handler → `emitSurface`/`splitToolResultSurfaces`
   → `case "mcp-ui"` → render) traces clean end-to-end and shows no `ask_choice`-specific defect.
4. **Smallest fix:** give `useRunStream`'s already-built `reattach()` a caller — on chat-pane mount
   (or conversation switch), if the newest message for the active conversation carries a
   non-terminal `runId`, call `reattach(runId)` instead of leaving the pane in whatever dead state
   the last torn-down subscription left it in. The transport-level plumbing this needs already
   exists; only the trigger is missing.

## Sampling notice

Files read in full: `apps/website/src/assistant/ask-choice-tool.ts`,
`apps/website/src/assistant/mcp-ui-tool-calls.ts`,
`apps/website/src/assistant/persistence/agent-session-store.ts`,
`apps/website/src/server/inbound/assistant/agent-session-binding.ts`,
`apps/website/src/server/inbound/assistant/conversation-start-lock.ts`,
`Jini/packages/daemon/src/delegated-tool-bridge.ts`,
`Jini/packages/chat/src/react/hooks/useRunStream.ts`,
top-of-file module docs for `apps/website/src/server/inbound/assistant/agent-daemon-server.ts`,
`apps/admin/src/lib/assistant-transport.ts`.

Read in part (targeted `grep`/offset reads, not full files): `agent-daemon-server.ts` (1426 lines —
only the surface/lifecycle/route-registration hits), `assistant-transport.ts` (1192 lines — the
translate-event switch, `subscribeToRun`, `reattachRun`, `persistUserTurnBeforeDispatch`),
`use-assistant-chats.hooks.ts` (function/hook index only, not bodies beyond `flush`'s doc comments),
`AssistantDock.hooks.tsx` (grep hits only), `useConversation.ts` (grep hits only).

Not opened at all: `Jini/packages/chat/src/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts`
and `useChatPane.hooks.ts` (these are the most likely place a `reattach()` caller *would* live if one
were added, or where a caller was silently dropped in a refactor — I could not rule out an in-flight
call I simply didn't grep for, though the exhaustive `.reattach(` grep across the whole react tree
found none). `chat.db` itself was not queried again beyond the dispatch's own stated evidence — I did
not independently re-verify the single-row claim. The live CLI JSONL transcript
(`b2500118-951c-46de-aba2-12cbe95332f6.jsonl`) was not re-read line-by-line; I relied on the
dispatch's own description of its contents. `Jini/packages/http-kit`'s `registerRunRoutes` (the
daemon-side SSE route implementation itself) was not opened — I inferred its behavior from
`agent-daemon-server.ts`'s module doc and `assistant.ts`'s proxy comments rather than reading its
source directly, so "the SSE route replays buffered events on connect" is plausible-but-unverified,
not confirmed.

Confidence:
- The "reattach is dead code" finding: **High** — exhaustive grep, positive dead-code claim, easy to
  falsify if wrong.
- "General, not ask_choice-specific": **High** — grounded in the dispatch's own evidence (plain text
  also invisible) plus a clean trace of the mcp-ui pipeline finding no defect.
- "Streamed live by design, not terminal-only": **High** for the architecture; **Medium** for
  whether THIS run's original subscription was ever actually live in the first place (see below).
- Root cause of why the original subscription (before any reattach would even be needed) went
  silent: **Low / hypothesis only** — see next section.

## Full trace

### 1. Is text streamed live, or only persisted at a terminal state?

Live, by design. `apps/admin/src/lib/assistant-transport.ts`'s module doc (lines 1-26) describes two
run paths; both feed the same `translateRunAgentPayload` switch. Cases `"text_delta"` (line 121),
`"tool_use"` (125), `"tool_result"` (127), `"mcp-ui"` (155-156), and `"a2ui"` (166) each produce one
small `AgentEvent`, dispatched per-delta via `handlers.onEvent(translated)` at the call sites around
lines 508-556 (`subscribeToRun`'s `EventSource` listeners) and line 628 (the BYOK path).

`onEvent` feeds `Jini/packages/chat/src/react/hooks/useRunStream.ts`'s `makeHandlers` (line 113-116),
which appends the event to `RunStreamState.events` via `setState`. `useConversation.ts` derives
`messages`/`ChatMessage[]` from `run.events` (grep hits at lines 92-124), and that derived list is
what `apps/admin/src/hooks/use-assistant-chats.hooks.ts`'s `onMessagesChange` (line 850) receives —
the SAME callback that both re-renders the pane (`AssistantDock`) and drives `flush` (line 693),
which is what PUTs each message to `/messages/<id>` (`apps/admin/src/lib/assistant-chats.ts:113`,
`saveMessage`) and is what actually writes rows into `chat.db`'s `ai_chat_messages`.

**Consequence that matters for this bug:** rendering and persistence are the same downstream
consumer of the same upstream event stream. They cannot diverge — if one is silent, so is the other.
That is consistent with the observed state (only the user's own row, written by a wholly separate,
eager path — `persistUserTurnBeforeDispatch`, `assistant-transport.ts:1045-1055` — exists; nothing
from the assistant side reached `chat.db` at all, for either turn, across ~2.5 minutes and two
`assistant_ask_choice` prompts). Not a partial miss; total silence on the assistant side.

### 2. How is `assistant_ask_choice`'s surface supposed to reach the pane?

Traced hop by hop:

1. **Tool handler** — `apps/website/src/assistant/ask-choice-tool.ts:509-582`,
   `buildAskChoiceRegistrations`. On a real (non-fallback) call: opens a `SurfaceExchange` via
   `surfaces.surfaceExchanges.open(..., ctx.emitSurface)` (line 546), builds the form
   (`buildAskChoiceFormSurface`, line 553), then blocks in `awaitAskChoiceSubmission` (line 569),
   which calls `askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } })`
   (`ask-choice-tool.ts:485`).
2. **`ctx.emitSurface`'s real implementation** — for the Local CLI / daemon path (the mode this
   incident is in, given the CLI JSONL transcript), tool execution happens through
   `@jini-ai/http-kit`'s delegated-tool-calls route into `Jini/packages/daemon/src/delegated-tool-bridge.ts`.
   Its `emitSurface` closure (lines 158-188) writes an `agent` event
   `{ type: emission.channel, ...correlation }` onto the run's own `RunLifecycle` via
   `lifecycle.emit(runId, ...)` (line 187) — this is the SAME event log the browser's SSE stream
   reads from (per `agent-daemon-server.ts`'s own top-of-file doc, lines 5-13).
3. **Even the no-`emitSurface` fallback branch reaches the same place.** If `ctx.emitSurface` were
   ever absent, `ask-choice-tool.ts`'s fallback (lines 558-566) returns the UI resource embedded in
   the tool's own result instead of parking. But `delegated-tool-bridge.ts:226` calls
   `splitToolResultSurfaces(executed.output)` on EVERY tool result regardless of path, and any
   extracted surface is emitted as `{ type: MCP_UI_EVENT_TYPE, toolUseId, resource }` (lines 231-236)
   — deliberately BEFORE the `tool_result` event (line 238), so the form is on screen before the
   transcript shows the call completing. **Both branches of `ask-choice-tool.ts` converge on the
   identical daemon-side emission mechanism.** I found no `ask_choice`-specific gap here.
4. **Allowlist gate for the human's answer, not for showing the form** —
   `apps/website/src/assistant/mcp-ui-tool-calls.ts:104-114` confirms `assistant_ask_choice` is on
   `MCP_UI_REDEEMABLE_TOOL_IDS`, added 2026-08-31. This gate only matters once she clicks something
   inside a rendered form; it cannot be why the form never appeared in the first place.
5. **Browser side** — `assistant-transport.ts`'s `case "mcp-ui"` (line 155-156) is a one-line unwrap
   into `{ kind: "ext", name: "mcp-ui", data: payload.resource }`. `Jini/packages/ui/src/features/mcp-ui/`
   registers no allowlist that would gate rendering (only `sandbox-proxy.ts` mentions one, and only
   for a future third-party-server widening, not present today). No rendering-side gap found.

**Conclusion for Q2/Q3:** the `assistant_ask_choice`-specific machinery (tool handler, emission,
allowlist, unwrap, render) is intact and not where this broke. The break is upstream of all of it —
at the point of whether the browser had a live subscription receiving ANY event for this run at all,
`assistant_ask_choice`-flavored or plain text.

### 3. Where does it actually break?

`apps/admin/src/lib/assistant-transport.ts:1143-1159` implements `reattachRun(runId, handlers,
options)`: for a real daemon run (not BYOK, not AG-UI) it calls `subscribeToRun(runId, handlers,
options?.signal)` (line 1158) — a genuine new `EventSource` on `GET /api/runs/:runId/events`
(`subscribeToRun`, line 489-490). This is real, working code — not a stub.

`Jini/packages/chat/src/react/hooks/useRunStream.ts` exposes this as `reattach` (line 42, defined
170-191): tear down any existing subscription, bump the generation counter, call
`transport.reattachRun`, and seed state with any `initialEvents` passed in.

**Nothing calls it.** `grep -rn "\.reattach(" Jini/packages/chat/src/react/` returns only the
definition line itself (`useRunStream.ts:42`, the type signature). `grep -rn "\.reattach(|useRunStream\b"
apps/admin/src apps/website/src` returns only comments in `assistant-transport.ts` that reference
`useRunStream`'s *other* callbacks (`onError`, `onDone`) — no call to `.reattach(`. This is
dead-but-wired code: the transport-level plumbing (`reattachRun` → `subscribeToRun` → real
`EventSource`) fully exists and would work if invoked, but no React layer ever invokes it.

**What this means concretely:** `useRunStream`'s `start()` (lines 135-168) DOES set up a live
subscription and SHOULD render/persist deltas as they arrive, as long as that one `useRunStream`
hook instance stays mounted and its subscription stays open for the run's whole life. The moment
that subscription is torn down for any reason — the hook unmounts (pane closed/reopened,
conversation-list navigation remounting `ChatPane`, an admin-bundle HMR reload from a save under
`apps/admin/src`), or the underlying connection drops (a daemon process restart, e.g. from a save
under `apps/website/src`, both of which project memory already documents as killing a live run) —
there is no code path anywhere that reconnects it. The run keeps going on the daemon (as the CLI
transcript proves), the events keep landing in the daemon's own `RunLifecycle`/`EventLog`, but
nothing on the browser side is listening any more, so nothing renders and nothing flushes to
`chat.db`. This is fully general — it would silence plain text exactly as it silences an
`assistant_ask_choice` form, which matches what was observed.

**What I could not pin down: WHY the original subscription (not a reattach — the very first one,
from `start()`) went silent for this specific run, twice.** Two candidate mechanisms, both
plausible, neither confirmed:

- **Live-edit interruption.** `agent-daemon-server.ts`, `assistant-transport.ts`, and
  `use-assistant-chats.hooks.ts` were all mid-edit and uncommitted at dispatch time (confirmed via
  `git status`, still true as of this report). Project memory independently records that a save
  under `apps/website/src` restarts the API/daemon (~3s) and a save under `apps/admin/src` destroys
  a live chat run's connection outright. If another session saved either during her ~16:48-16:51
  window, that alone would tear down the subscription with the exact "went silent mid-run, twice"
  shape observed — no session-fork or race required. I did not check any session's save timestamps
  against her window, so this is circumstantial, not proven.
- **Conversation/session-binding fork.** `agent-session-binding.ts` and `conversation-start-lock.ts`
  (both new, uncommitted, landed within the hour per the dispatch) exist specifically to close a race
  where two overlapping `onStarted` calls for the same conversation can both see "no session bound
  yet" and mint two divergent CLI sessions — see `conversation-start-lock.ts`'s own header (lines
  6-12) for the exact "loser's CLI session is orphaned" shape. If that race is what actually happened
  here, the browser's `EventSource` could be attached to one run's id while the CLI transcript being
  read belongs to a different, divergent run the browser was never told about — producing total
  silence on the browser side while the CLI keeps working. I did not trace far enough to confirm or
  rule this out (would require reading `agent-daemon-server.ts`'s full `onStarted` body, which I did
  not do beyond grep hits, given the "no source file changes, stay diagnosis-scoped" constraint and
  that a sibling agent — `fix-chat-lifecycle` — is already working this exact defect).

Either way, the dead `reattach()` path is the layer that turns "the original subscription broke" into
"and nothing ever recovers" — fixing reattach would paper over both candidate root causes without
needing to resolve which one actually fired this time.

### 4. Is the ordering wrong too?

No ordering defect found in the code read. `delegated-tool-bridge.ts` deliberately emits the
`mcp-ui` surface event BEFORE the `tool_result` event (lines 229-236, with an explicit comment
explaining why), and `assistant-transport.ts`'s per-delta `onEvent` forwarding preserves arrival
order (`events: [...prev.events, ev]`, `useRunStream.ts:115`) — nothing reorders after receipt.

I could not evaluate the "prints out of order" symptom against this incident specifically: with
`chat.db` holding a single user-message row and nothing from the assistant, there is no persisted
sequence to check order against, and I did not re-read the CLI JSONL transcript byte-for-byte to
compare its internal event order against anything the browser might have separately received (it
received nothing, per this same evidence). This may be a separate incident/conversation the owner
encountered elsewhere — I did not find evidence either confirming or ruling out an ordering bug in
the pipeline itself.

### 5. `assistant_ask_choice` vs. every parked surface, and the external-mcp-save contrast

Both `assistant_ask_choice` and `external_mcp_save` hold up the identical exchange shape (open a
`SurfaceExchangeStore` exchange via `ctx.emitSurface`, park on `askOnce`/equivalent, redeemable via
the same `MCP_UI_REDEEMABLE_TOOL_IDS` allowlist — `mcp-ui-tool-calls.ts:181-194` for the save form's
own entry, added 2026-09-08). Nothing in either tool's own code differs in a way that would explain
one rendering and the other not. The simplest explanation consistent with everything traced above:
the earlier `external_mcp_save` session's browser subscription stayed live and uninterrupted for that
run's whole duration, while this run's subscription was severed partway through (by whichever
mechanism in §3) with no reattach to recover it. The difference is about subscription continuity for
a given run, not about which tool was involved.

## Recommendation (diagnosis only — not applied)

Smallest fix: wire a caller for `useRunStream.reattach()`. On `ChatPane`/`AssistantDock` mount (and
on conversation switch), if the active conversation's most recent message carries a non-terminal
`runId` (the field `useConversation.ts` already stamps onto messages, lines ~92-104), call
`reattach(runId)` instead of leaving the pane however the last subscription left it. This does not
require resolving which upstream cause (live-edit interruption vs. session-binding fork) severed the
original subscription this time — it makes ANY future occurrence of "the daemon kept going but the
browser stopped listening" recoverable instead of silent, for `assistant_ask_choice` and every other
parked surface alike.
