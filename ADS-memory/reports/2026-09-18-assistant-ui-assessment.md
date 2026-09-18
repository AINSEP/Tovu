# Would assistant-ui mitigate the chat problems we are having?

Date: 2026-09-18. Branch `restructure/apps-website-phased`. Software-architect `skills.md` v2.3.0
loaded. Research and assessment only — no production code written, nothing started, stopped or
restarted.

> **Corrections, 2026-09-18 (same day, after first commit `62671495`).** Two claims in the original
> version were checked against the source by the agent that owns this code and **disproven**. Both
> are corrected in place below, and each correction is marked `[CORRECTED]` so a later reader can
> see it was checked rather than silently edited.
>
> 1. **§3's `interleaveMessageBlocks` lead was wrong.** That bail-out changes block *order*, never
>    *presence* — the flat fallback renders every ext group. It could not have caused problem 2.
>    This contradicted a finding stated two paragraphs earlier in my own §3; I published both.
> 2. **§1's "the server half is already built" was materially wrong** — the route accepting a
>    top-level `exchangeId` was necessary and nowhere near sufficient. This one was relayed to the
>    owner before it was checked, so it cost something. Detail in §1.
>
> The fix for problem 2 is committed: `f90453e3`, `c4542107`, `c1b4b496`. The rest of the
> assessment — including the finding that problem 2 was never a missing capability in the component
> model — was independently confirmed and stands.

---

## Verdict

**PILOT, narrowly — and no, assistant-ui would not have prevented today's stuck chat.**

Of the five things that went wrong today, assistant-ui touches **one** (the choice form not
rendering), and even that one it does not fix as a drop-in: it would need Tovu to emit MCP metadata
it does not emit today and to restructure `assistant_ask_choice` around a static widget template.
The other four — the parked tool call, the typed answer starting a new run, that run dying because
one CLI session per conversation was already busy, and runs dying mid-flight generally — are all
server- and daemon-side. A React component cannot reach them.

Recommended action: **one 1–2 day throwaway probe** (spec in §6) that answers the single question
that actually matters, before anyone budgets weeks. Do not begin a migration on today's evidence.

---

## 1. Which of today's five problems are UI-layer problems at all?

I agree with the coordinator's read, with one refinement on item 2.

| # | What happened | Layer | Could a UI swap fix it? |
|---|---|---|---|
| 1 | Model parks inside `assistant_ask_choice` waiting on a form; 5-minute idle TTL | Server, **by design** | No — and it is not a defect. It is ADR-055 Decision 1, deliberate |
| 2 | The choice form rendered as two spinner rows, no clickable buttons | **Client rendering** | **Partly — this is the one place it could help.** See §2 |
| 3 | Owner typed the answer; it saved as a message and started a NEW run | Client **and** server | Partly — see below |
| 4 | New runs failed because the conversation's one CLI session was parked | **Server/daemon** | No |
| 5 | Runs dying mid-flight ("you just quit") is recurring | **Server/daemon** | No |

**Item 1 is not a bug.** `tool-surface-exchanges.ts`'s own module doc states the design: hold the
agent's call open so "the transcript is correct by construction rather than reconstructed
afterwards." The exchange store even solves the two deadlocks explicitly (inbound buffering;
`open()` requiring an emitter). This is considered, load-bearing work. Any recommendation that
casually replaces it is replacing a decision, not fixing a defect.

**Item 3 deserves a nuance.** It is *partly* a UI problem — the composer had no idea a tool call was
awaiting a human answer, so it offered the owner the only affordance it has (send a message). A UI
that knows about pending tool calls would route or at least warn.

**[CORRECTED]** The original version of this report went on to claim the server half was "already
built," on the grounds that `mcp-ui-tool-calls-route.ts` accepts the exchange id as a top-level
`exchangeId`. **That claim was materially wrong**, and I relayed it upward before it was checked.
The route has always accepted that field — that was read and quoted before any work began. It was
necessary and nowhere near sufficient:

- **The composer has no exchange id to send.** The only client-side copy lives inside sandboxed,
  model-influenced surface HTML. A client that scraped it would be posting back a correlation the
  model wrote both ends of — which is the exact forgery `ask-choice-tool.ts`'s ticket store already
  exists to prevent on the sibling path.
- **Even handed a correct id, the answer was dropped.** `deliver()` would unpark the call, but
  `describeAskChoiceAnswer` reads only `choice`/`selections`, so the model would receive
  `{submitted: true}` with the human's actual words silently discarded — worse than the deadlock,
  because it *looks* answered. That was the RED test.

So "typed text answers the parked exchange" was **not** buildable today against the existing
endpoint. It required real work, now committed (`f90453e3`, `c4542107`, `c1b4b496`). The conclusion
this paragraph supports is unchanged — assistant-ui is not what unlocks it — but the reasoning
above is the correct reasoning, and the cost was not near zero.

**The general lesson, since it is this repo's recurring defect:** I read a route that accepts the
right parameter and concluded the path was wired. Correct primitive, unwired call site. Reading one
end of a path is not tracing it.

**Items 4 and 5 are out of reach of any chat library.** Item 4 is the `assistant_agent_sessions`
table's `PRIMARY KEY (conversation_id, agent_id)` — one CLI session per conversation, independently
verified in the 2026-09-11 codex recon. Item 5 is the daemon-respawn-kills-every-in-flight-run gap
the supervisor's own comment documents (`daemon-supervisor.ts:216-222`). Both were already called
out as "NOT deferred, no library choice fixes that" in `development/todos.md`. That ruling stands.

**Bottom line for the owner: four of the five failures are ours, in our server code. Swapping the
chat UI would leave today's transcript looking almost exactly the same.**

---

## 2. Does assistant-ui actually render this shape better?

The shape in question: *a tool call that is still running, that shows an interactive `ui://` MCP-UI
widget mid-call, which the human clicks to unblock the model.*

**Yes — structurally, this is assistant-ui's native model, not an edge case.** Verified against the
published package and the docs source, not marketing pages.

### Verified facts

- `@assistant-ui/react` **0.15.21**, published **2026-09-18** (today), **MIT**. Dependencies:
  `zod`, `zustand`, `radix-ui`, `assistant-cloud`, `assistant-stream`, `@assistant-ui/tap`,
  `@assistant-ui/core`, `safe-content-frame`, `@assistant-ui/store`, `react-textarea-autosize`.
  (Read from `registry.npmjs.org`.)
- `McpAppRenderer`, `McpAppsRemoteHost`, `getMcpAppFromToolPart`, `useExternalStoreRuntime`,
  `AssistantTransport*`, `defineToolkit`, `useToolArgsStatus` are all present in the **published**
  `dist/index.d.ts` at 0.15.21 — not just in docs.
- The MIME type assistant-ui fixes, `MCP_APP_MIME_TYPE = "text/html;profile=mcp-app"`, is
  **byte-identical** to Jini's own `MCP_UI_MIME_TYPE`
  (`Jini/packages/ui/src/features/mcp-ui/resource.ts:41`). The `ui://` URI scheme matches too.
  **Our resources are already in the right format.**
- Tool-call parts carry `status.type: "running" | "complete" | "incomplete"` and partial `args`,
  and renderers are explicitly invoked while `running` (`useToolArgsStatus`, `useToolCallElapsed`,
  the documented "render partial results and streaming progress" pattern). Rendering an in-progress
  tool call is first-class.
- The MCP Apps bridge sends the widget `notifications/tools/call/input` **"whenever `part.args` (the
  streaming tool input) changes"** and `notifications/tools/call/result` **"when the tool result
  lands"**. The widget therefore mounts and is interactive *before any result exists*.
- Human-in-the-loop is first-class: `humanTool()` / `type: "human"` tools pause the agent and
  resume via `addResult(...)` called exactly once from the renderer; separately, approval gates
  (`approval: { id }`, `respondToApproval({approved, reason})`, `ToolApprovalResponse`) pause a run
  until allowed or denied.
- Cross-origin sandboxing via `SafeContentFrame`, message filtering on both source window and
  origin; `handlers.allowedTools` is a built-in per-widget tool allowlist.

### The claim in `development/todos.md` — re-verified, and it is TRUE

> "it expects MCP metadata on a **tool-call part** and fetches the resource through a host route,
> whereas Jini emits an inline `mcp-ui` event."

Confirmed exactly. `McpAppsHost.loadResource({uri}) => Promise<{uri, mimeType, html, meta}>`, with
`McpAppsRemoteHost` POSTing `mcp-apps/read-resource` to a route you expose. Tovu instead pushes the
HTML inline on the run stream (`delegated-tool-bridge.ts`'s `emitSurface` →
`{type:"mcp-ui", resource, toolUseId}` → `assistant-transport.ts` `case "mcp-ui"` →
`{kind:"ext", name:"mcp-ui", data: resource}`).

**But that gap is smaller than the todos entry implies.** The docs state a custom host is a
supported extension point: *"A different strategy can be plugged in by writing a custom resource
that returns the same `McpAppsHost` shape (`{loadResource, callTool, readResource, listResources}`)."*
A Tovu host whose `loadResource` reads from a client-side map populated by the existing inline SSE
event, and whose `callTool` posts to the existing `/api/admin/v1/mcp-ui/tool-calls`, is on the order
of 30–50 lines. **No new server resource store is required.** Correct the todos entry accordingly:
a translation layer is needed, but it is small and it is client-side.

### The structural difference that actually matters

Tovu's design makes the surface's **arrival** a separate event that must be correlated to a message
and rendered. assistant-ui's design makes the widget a **function of the tool-call part that is
already on screen**, activated by the tool's own `_meta.ui.resourceUri`.

In the owner's screenshot the tool-call part *was* on screen — two spinner rows, "Tool call ·
Assistant Ask Choice W…" plus the raw args. Under assistant-ui's model, that part alone would have
been enough to mount a widget. That is a real robustness advantage: one less thing that has to
arrive correctly.

**The catch:** Tovu's ask-choice surface is minted fresh per call —
`ui://tovu/ask-choice/${principalId}/${Date.now()}`, with the title and every option supplied by
the model. MCP Apps' standard pattern is a **static per-tool template** driven by tool args. To get
the robustness benefit, `assistant_ask_choice` would have to be restructured into a static
`ui://tovu/ask-choice` template rendered from the streamed args — a genuine change to how we build
surfaces, not a wiring change. Using a dynamic `resourceUri` pointer instead (the AG-UI
`ACTIVITY_SNAPSHOT` path, which does support attaching a resource after `TOOL_CALL_START`)
reintroduces the same mid-call correlation step, and therefore the same class of bug we have now.

### And the mismatch nobody has flagged yet

assistant-ui's human-in-the-loop resumes by **ending the run** in a `requires-action` state and
**re-invoking the adapter** once the human answers. Tovu cannot do that: the CLI owns its own tool
loop, so once the CLI's call returns there is no way to hand it a tool result. That is precisely
*why* `tool-surface-exchanges.ts` parks a live subprocess instead. assistant-ui's HITL model is
built for an in-process tool loop — the AI SDK shape the owner already ruled out on 2026-09-11.

So: **adopt assistant-ui's rendering of a running tool call; do not adopt its HITL resume
semantics.** They are incompatible with the local-CLI architecture, which is not negotiable.

Worth noting for its own sake: ending the run while waiting would structurally remove problem 4
(busy session). It is not available to us for the reason above, but it does show problem 4 is an
architecture consequence, not a stray bug — worth a separate decision.

---

## 3. What is problem 2, really?

I did not chase this to root cause — `chat-askchoice-fix` owns it, and I deliberately did not touch
its files. But I established enough to keep the assessment honest, and this bounds the verdict:

- The mid-run emit and the result-carried surface produce the **identical** event on the wire.
  `emitSurface({channel:"mcp-ui", …})` emits `{type:"mcp-ui", resource, toolUseId}`; a returned
  surface is split out by the daemon into the same `mcp-ui` event. The transport maps both with the
  same one-line `case "mcp-ui"`.
- `MessageRow.tsx` renders ext-event groups in **both** of its layouts (the interleaved-block path
  and the flat fallback), so neither path structurally drops an `mcp-ui` surface.

Therefore problem 2 is **a wiring/association defect in our own event→message plumbing, not a
missing capability in the component model.** That conclusion was independently confirmed and the
fix is committed (`f90453e3`, `c4542107`, `c1b4b496`).

**[CORRECTED]** The original version of this report offered `interleaveMessageBlocks` bailing to the
flat layout (`Jini/packages/chat/src/react/message-blocks.ts:91`) as a candidate cause. **That lead
is disproven.** The bail-out changes block *order*, never *presence*: `MessageRow.tsx:250` falls
back to the flat layout and `MessageRow.tsx:352` renders `extGroups.map(renderExtGroup)`
unconditionally there, so an in-flight message that fails the byte-for-byte check still renders
every ext group, MCP-UI card included. The module's own doc says this is deliberate — losing
ordering is a presentation regression, dropping the assistant's words is a correctness one, so it
prefers the former. The second bail at `MessageRow.tsx:250`
(`visibleContent === message.content ? interleave(...) : null`) lands in the same flat path and is
equally harmless.

Worth naming plainly: that lead contradicted the sentence two paragraphs above it in this same
section, which already established that *both* layouts render ext groups. I published both. A
"flagged, not concluded" label does not make an internally inconsistent claim safe to ship — it
still sends someone down a dead end.

This matters for the verdict: *a defect we can fix is not a reason to adopt a library.*

---

## 4. What would adoption actually cost here?

Measured on disk today (non-test source):

| Surface | Lines |
|---|---|
| `Jini/packages/chat/src` | 17,468 |
| `apps/admin/src/components/AssistantDock` | 3,906 |
| `apps/admin/src/lib/assistant-transport.ts` + `use-assistant-chats.hooks.ts` | 2,164 |
| **Total** | **~23,500** |

(`development/todos.md`'s "~19k" understates it. And note `@jini-ai/chat` is a Jini package with
consumers beyond Tovu, so it is not ours to retire regardless.)

| Dimension | Honest assessment |
|---|---|
| **Transport** | Real work. Tovu streams its own SSE shapes. `ExternalStoreRuntime` is the right seam (you own the messages; UI features turn on per callback provided) — no AI SDK required, confirming the todos entry. But the MCP Apps activation paths documented today assume either AI SDK provider metadata or `@assistant-ui/react-ag-ui`'s `ACTIVITY_SNAPSHOT`. With `ExternalStoreRuntime` we would be hand-constructing `ToolCallMessagePart.mcp` ourselves. Feasible, and the type is exported (`ToolCallMessagePartMcpMetadata`), but it is off the paved path and the docs do not cover it. |
| **Redemption endpoint** | **Cheap.** `handlers.allowedTools` + `host.callTool` map almost one-to-one onto `MCP_UI_REDEEMABLE_TOOL_IDS` and `createMcpUiToolCaller`. The route already accepts a top-level `exchangeId`. |
| **Resource format** | **Free.** Identical MIME type and URI scheme. |
| **Attachments** | Adapters exist (`AttachmentAdapter`, `CompositeAttachmentAdapter`, `SimpleImage/TextAttachmentAdapter`). Tovu's uploader would be re-expressed, not rebuilt. |
| **History / threads** | `ThreadHistoryAdapter`, `ExternalStoreThreadListAdapter`, `RemoteThreadListAdapter` all exist. Our SQLite stays canonical. Real but bounded work. |
| **A2UI** | assistant-ui has no A2UI concept. `RoutedA2uiSurfaceCard` gets ported as a custom `ToolCallMessagePartComponent`. Moderate. |
| **Theming** | Radix + (in the shipped elements) Tailwind. Tovu's admin is hand-rolled CSS. Using the primitives without the styled elements avoids Tailwind; using the elements does not. Not a blocker, but it is a second design system in the admin. |
| **Version risk** | **The largest under-discussed risk.** 0.15.x, pre-1.0, publishing today. Already visible churn: `makeAssistantToolUI` superseded by `Tools()`/`defineToolkit`; MCP Apps protocol pinned at `"0.1"`. We would be tracking a moving API against an upstream spec that is itself pre-release. |
| **Dependency weight** | `assistant-cloud` is a hard (not optional) dependency of `@assistant-ui/react`. Presumably inert unwired, but it ships. Bundle impact **unverified** — needs a locked build. |
| **"Side by side"** | Concretely: a second admin route or a flag rendering an alternative dock against the **same** `chat.db`, the same daemon, the same SSE stream, the same redemption route. Only the React tree differs. That remains achievable and remains the right shape. |

The 2026-09-11 estimate of **3–6 engineer-weeks** for a UI swap retaining Jini execution still looks
right to me. Nothing I found makes it cheaper; the static-template restructuring of ask-choice makes
it slightly dearer.

---

## 5. Recommendation

**PILOT.** Not ADOPT — there is no evidence yet that assistant-ui renders *our* surface correctly in
*our* app, and we would be betting weeks on a pre-1.0 API. Not DON'T — the MCP Apps fit is real,
the resource format is already identical, and "widget is a function of the tool call part" is
genuinely more robust than "widget is a separate event that must arrive and be correlated."

Sequence, in priority order:

1. **Fix items 2, 3, 4 in Tovu code now.** **Done, same day** — `f90453e3`, `c4542107`, `c1b4b496`
   (`chat-askchoice-fix`). This is what actually unstuck the owner's chat. A library evaluation was
   never going to.
2. **Run the probe in §6.** 1–2 days, throwaway, zero production code.
3. **Only if the probe is clean**, budget the side-by-side dock the owner already directed on
   2026-09-11.
4. **Separately and independently:** run durability (item 5) and the one-CLI-session-per-conversation
   constraint (item 4). Neither is a UI question and neither should wait on one.

---

## 6. The cheapest experiment that de-risks this

One throwaway page, outside the repo tree (scratchpad or a scratch Vite app). No changes to the
daemon, the transport, or `@jini-ai/chat`.

**Build:** mount `AssistantRuntimeProvider` + `useExternalStoreRuntime` over a hand-written message
array containing exactly one assistant message with one tool-call part in `status: "running"`,
carrying `mcp` metadata pointing at `ui://tovu/ask-choice/probe`. Configure
`McpAppRenderer({ host: <custom McpAppsHost> })` where:

- `loadResource` returns `{uri, mimeType: "text/html;profile=mcp-app", html}` with `html` being the
  **exact** output of `buildFormSurface` for a real `assistant_ask_choice` call (dump it from a test
  or from the daemon);
- `callTool` POSTs to the live `/api/admin/v1/mcp-ui/tool-calls` with the real
  `__exchangeId` from a genuinely parked exchange.

**Pass criterion:** the radio buttons render while the tool call is still `running`, and clicking
Submit unblocks a real parked `assistant_ask_choice` call in the live daemon.

**This is the whole bet.** It tests, in one page: the resource format compatibility (predicted free),
the custom-host escape hatch (predicted ~40 lines), rendering on an in-progress tool call (predicted
native), and the redemption round trip (predicted free). If it passes, the side-by-side dock is a
known quantity. If it fails, we have spent two days instead of six weeks.

**What the probe deliberately does NOT test**, and what therefore stays unknown until someone builds
the real thing: streaming an entire live conversation through `ExternalStoreRuntime` from Tovu's SSE
shapes, attachments, history, A2UI, and bundle size.

---

## 7. Claims I am marking UNVERIFIED

- ~~The exact root cause of problem 2 (§3).~~ **[CORRECTED]** Resolved by `chat-askchoice-fix` and
  committed (`f90453e3`, `c4542107`, `c1b4b496`). My `interleaveMessageBlocks` lead was disproven —
  see §3.
- Bundle impact of `@assistant-ui/react` in Tovu's admin build. Needs a locked build; still
  unverified, exactly as `development/todos.md` said in September.
- Whether `ExternalStoreRuntime` can carry `ToolCallMessagePart.mcp` metadata end to end without the
  AI SDK or AG-UI adapters. The type is exported; the docs do not show that path. **This is the
  single most important thing the probe settles.**
- Whether `assistant-cloud`, a hard dependency, is fully inert when unconfigured.
- I did not run, restart or touch the owner's app, API, site server or Electron, per the dispatch.
