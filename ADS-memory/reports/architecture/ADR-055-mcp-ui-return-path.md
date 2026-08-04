# ADR-055: MCP-UI Return Path — One Path, Two Behaviors, and the Removal of the Confirmation Token

- Status: **DRAFT — not accepted.** Written for human review; not self-approved. Do not add to `ADR-INDEX.md` until a human accepts it.
- Date: 2026-08-04
- Author: Claude Opus 5 (1M context), Coordinator
- Relates: **ADR-053** (MCP-UI confirmation transport — browser as host, side-channel delivery). ADR-053's Decisions 1–4 are assumed, not restated. This ADR changes only what happens *after* the human acts on a surface ADR-053 delivered.
- Supersedes: ADR-053 **Decision 3** (the redemption endpoint as a second, browser-authenticated tool call) and the token mechanism that decision exists to carry. Everything else in ADR-053 stands.

## Context

ADR-053 got a surface in front of a human and got their click back to the server. It never specified where that answer *goes*. The answer to that question, as built, is: nowhere.

`src/assistant/mcp-ui-tool-calls-route.ts` executes the tool and returns an HTTP response to the iframe. It contains zero occurrences of `emit`, `publish`, `appendMessage`, or `conversation`, and is unchanged since `61edab4`. Nothing routes into the run, the conversation, or the model.

Two consequences, the second more serious:

1. **The transcript ends on a false statement.** Live store read (`ai_chats`/`ai_chat_messages`, conversation `fbef2774…`): two messages, last with `run_status=succeeded`, ending *"Nothing has been deleted yet… Once you click through, it'll be a soft delete."* Meanwhile `posts` shows `Dummy Test Post` with `deleted_at = 2026-08-03T23:53:05.082Z`. The delete succeeded; the log says it did not. A later agent turn reading that history concludes the post still exists.

2. **Form surfaces are functionally useless.** `assistant_demo_choices` returns `{submitted, plan, extras, extrasCount}` to the *dialog*. A form exists to collect input **for the agent**; the agent never receives it. The values were proven to cross the sandbox correctly (`Array.isArray(extras) === true`) — they stop one hop short of the only consumer that matters. This is not polish; the feature does not work.

Full evidence chain: `ADS-memory/.local-artifacts/reports/20260803-mcp-ui-browser-verification.md`.

### The gating measurement, now taken

The viability of a *blocking* tool call was gated on one unknown: the tool-call ceiling of the spawned agent CLIs. Measured 2026-08-04 (`ADS-memory/.local-artifacts/reports/20260804-agent-cli-tool-call-timeout-measurement.md`):

| Hop | Ceiling |
|---|---|
| Daemon `ToolExecutor` confirmation park | **unbounded** — `startTimeout` is armed *after* the `requiresConfirmation` await |
| **Jini MCP server → daemon HTTP** | **15 000 ms** ← the binding ceiling |
| Claude Code 2.1.221 (stdio) | 30 min idle; call timeout defaults to `1e8` ms ≈ 27.8 h |
| Gemini CLI | 10 min (`MCP_DEFAULT_TIMEOUT_MSEC`) |
| Codex | per-server `tool_timeout_sec`; numeric default not extractable from the stripped binary |

**The agent CLI is not the constraint.** The 15 s comes from `Jini/packages/mcp/src/server/daemon-client.ts:32` (`DEFAULT_TIMEOUT_MS`), inherited because `daemonCallOptions()` passes no override. `timeoutMs` is already a first-class option on `postDaemonJson`. The blocking design is therefore viable, and unblocking it is a parameter, not a refactor.

## Decision

**One return path, two behaviors, selected by whether the handler is permitted to act.**

1. **Non-destructive surfaces** (forms, pickers, anything informational): the human's answer returns **straight to the agent** as the tool call's ordinary result. No gate, no token, no second call. This half is unblocked regardless of everything below and should ship first — it is the more broken of the two.

2. **Gated / destructive surfaces** (delete, anything with side effects): the tool call **blocks**. The handler awaits the human's out-of-band answer, **acts on it server-side**, and returns the **outcome** to the agent.

3. **The confirmation token is removed entirely.** Today's token exists because the delete is a *second* tool call the model could otherwise make itself, so the design needed a secret the model cannot see. A blocking single call replaces *"the model must present a secret it cannot read"* with *"the handler awaits an out-of-band human signal."* There is nothing to mint, redeem, leak, or replay. `src/assistant/pending-confirmations.ts`'s binding, TTL, and single-use substrate are retained as the parked-promise store's bookkeeping; `mint`/`redeem` lose their secret-bearing role and `redeem` gains the job of resolving the parked promise.

4. **The transcript is correct by construction.** The agent is still alive when the outcome is known, so it writes the outcome itself. Consequence 1 above is not patched — it becomes unreachable.

5. **Hop #3's timeout is set explicitly on the delegated-tool route**, rather than left to inherit 15 s. The budget is bounded by the CLI idle timeout (30 min Claude Code, 10 min Gemini) against a `DEFAULT_CONFIRMATION_TTL_MS` of 5 min. The TTL is already the tightest thing in the stack and sits comfortably inside every ceiling; it stays the operative deadline.

6. **The no-answer path is specified, not assumed.** Tab closed, TTL expiry, run cancelled: the tool returns an explicit *"the human did not respond"* result, and the model is expected to say something sensible. Blocking moves the timeout story; it does not remove it.

## What was explicitly rejected, and why

**"Route the human's approval back to the agent, and let the agent then call delete."**

This is the intuitive design and was proposed directly. It is recorded here so it is not re-proposed.

Once approval arrives as *context* — a message saying "the user said yes" — the agent's next delete call is no longer bound to that approval. **Text in a context window cannot bind an approval to a specific operation.** The agent could call delete on a different id, call it twice, or be talked into it by a prompt injection in post content claiming approval already happened. That is precisely the threat model the token was built for; routing approval as context reintroduces it while discarding the mechanism that answered it.

The distinction that matters is not dialog-vs-agent. It is:

- **(a)** human answer → agent → *agent calls delete* — the agent has the data, but is the actor again.
- **(b)** human answer → handler completes the delete → *outcome* → agent — the agent has the data, and was never the actor.

The agent should have the context and the outcome. It does not need to pull the trigger, and for destructive operations that is the part worth giving up. **(b) is this ADR's decision.**

## Consequences

- **A held-open run costs a live subprocess and its context for the whole deliberation.** Accepted. The 5-minute TTL bounds it, and a human staring at a delete dialog is not a high-concurrency workload.
- **`descriptor.requiresConfirmation` becomes usable for the first time.** `pending-confirmations.ts`'s header records that the flag was a hang because `ToolExecutor` is built with no `ExecutionDelegate` and no route calls `resumeConfirmation`. This ADR supplies both. (Verified against `Jini/packages/daemon/src/tool-executor.ts`: the park genuinely precedes `startTimeout`, so it is unbounded from the daemon's side — the bound comes from hop #3.)
- **The property ADR-053 verified in the browser must be preserved by a different mechanism.** The token never reaching the model was proven by scanning `tool_result` blocks. With no token, that specific check retires — but its *purpose* does not. The replacement invariant is: the handler, not the model, performs the destructive act. It needs its own test, and the old grep must not be left in place implying coverage it no longer provides.
- **Never echo surface output into the transcript.** Whatever composes the outcome message must build it from the tool id and result only. Echoing tool output would make the return path a new channel to the model and undo the property above.
- **No elicitation dependency is taken on.** Jini/Tovu still have zero elicitation support; this design is built in-house. Noted for a future revisit: the codex binary ships an MCP elicitation client (`ElicitationCapability`, `FormElicitationCapability`, `UrlElicitationCapability`, plus schema variants), and its schema vocabulary overlaps closely with the closed field-kind list SPEC-parked in the surface builders. Whether Claude Code and Gemini CLI do the same was not checked.
- **Sequencing.** Decision 1 (forms) ships first, but is **not** independent — see the amendment below. It requires Decision 5 and Decision 7. Decisions 2–4 and 6 follow. ADR-053's stopgap — `content_post_delete` excluded from the wired tool surface — stays in force until Decision 2 lands.

## Amendment — 2026-08-04, after implementing Decision 1

Tracing the real path before writing code found the Decision 1 sequencing claim above to be wrong in
two ways. Both follow from Decision 1's own wording (*"no second call"*), which means the agent's
FIRST call parks until the human submits. Recorded as an amendment rather than a silent rewrite so
the change is reviewable. Evidence:
`ADS-memory/.local-artifacts/reports/20260804-adr-055-step3-prerequisites.md`.

**Decision 5 is a prerequisite of Decision 1, not a follow-up.** A parked form call travels hop #3 and
inherits `daemon-client.ts`'s 15 s default, because `daemonCallOptions`
(`Jini/packages/mcp/src/server/tool-protocol.ts:49`) passes no `timeoutMs`. Fifteen seconds fails
every human-in-the-loop call regardless of what the person eventually clicks.

**Decision 7 (new) — the surface emitter.** A parked handler cannot show the surface it is waiting on.
`Jini/packages/daemon/src/delegated-tool-bridge.ts` reads surfaces out of the *completed* result, so
parking first means the dialog never renders, the human can never answer, and the park never
resolves — a deadlock by construction, not a race. `ToolHandler`'s ctx carried no emitter.

The seam chosen, of three considered, is **an emitter on the handler's context**:
`@jini-ai/core`'s `ToolExecutionContext.emitSurface`, supplied by the delegated-tool bridge and
threaded through `ToolExecutor.execute`. The alternatives and why they lost:

- *Supply the `ExecutionDelegate` and use `requiresConfirmation`.* The seam the daemon already has,
  firing at the right moment (before the handler). Rejected: the delegate never receives `toolUseId`,
  which the `mcp-ui` event needs to key a surface to its call, and it would have to rebuild the
  surface from `(toolId, input)`, duplicating logic the handler already owns.
- *Keep the two-call shape and route the answer in as fresh input.* Needs no daemon change and would
  have made Decision 1's "ships first, independently" claim true. Rejected as contradicting
  Decision 1's own wording; the approval-as-context argument does not transfer (a form answer is data,
  not an approval), so this remains the honest fallback if the emit seam is ever unavailable — which
  is why the implementation degrades to it rather than parking when `emitSurface` is absent.

`emitSurface` is typed `(surface: unknown) => Promise<void>` and is human-only in both directions:
emitting never puts anything into model context. It is refused once the call settles, so a handler
cannot paint a surface onto a run whose `tool_result` is already on screen.

**Also decided in passing, and worth review:** a park id is a *correlation handle*, not a capability.
It needs no secrecy, so `pending-surface-answers.ts` stores it in the clear and compares it with
`===` — deliberately none of `pending-confirmations.ts`'s hashing and constant-time comparison, which
would imply a security property this handle does not carry. And the surface's Cancel action now posts
back rather than closing silently, because with the call parked a silent close strands the agent for
the full TTL.

## Amendment 2 — 2026-08-04, generalizing past MCP

Decision 7's first implementation was MCP-shaped in three places that had no reason to be. Widened
before anything depended on the narrow form. No behaviour change to the mcp-ui path.

**Decision 8 — the emit seam is channel-neutral.** `SurfaceEmitter` now takes a `SurfaceEmission`
(`{ channel, payload }`) and the bridge injects only correlation, rather than owning an `mcp-ui`
envelope. `channel` is an open string on purpose: a seam that only accepts channels the daemon
already knows about is not channel-neutral. This mirrors `@jini-ai/protocol`'s existing posture of
typing each channel's *body* `unknown` and validating where the concrete type is known, applied one
level up. `toolUseId` is injected only for channels whose payload declares it; the others carry their
own handle, which is the better correlation anyway because it survives across the several messages
one exchange sends.

**Decision 9 — a park becomes an exchange.** `open()/send()/receive()/close()`, multi-turn, with the
one-shot ask as a helper (`askOnce`). Two properties motivated doing this now rather than later:

- **The inbound buffer is a correctness requirement.** A message arriving while the handler is
  between `receive()` calls has nowhere to go in a one-shot store and is dropped, deadlocking the
  exchange on an answer the human already gave. This is the one part that is genuinely painful to
  retrofit, which is why it exists before a multi-turn channel is wired to need it.
- **`open()` takes the emitter as a required argument.** The other deadlock — waiting on a message
  that was never sent — becomes unrepresentable rather than merely discouraged.

**Decision 10 — the correlation handle leaves MCP's tool-call params.** The route accepts a top-level
`exchangeId`; the `__exchangeId` param remains because an mcp-ui surface can only answer by issuing a
tool call, so its correlation has no other way home. That is MCP-UI's constraint, not the route's.

**Deadline shape changed.** The single 5-minute TTL became an idle deadline (resets per turn, so a
long conversation is not punished for its length) plus a 5.5-minute total ceiling. The total exists
because activity alone would otherwise hold the call open indefinitely, and the call is not ours to
hold — it is an HTTP request the agent's MCP server abandons at 6 minutes. **That transport deadline,
not the idle one, is what caps a multi-turn conversation today; the two must move together.**

**What this does NOT do, stated so it is not assumed.** No A2UI adapter was built. A2UI is already
implemented in `@jini-ai/agentic/a2ui` (both directions, with an interpreter) and `@jini-ai/protocol`
already carries `{ type: 'a2ui', message }`, so emitting it now works — but there is **no inbound
renderer→agent HTTP route in any product package**, only in `examples/reference-web`. An end-to-end
A2A/A2UI surface still needs that transport built. The protocol's own channel-neutral
`surface_request`/`surface_response` pair likewise still has no producer.

## Open

- ADR-053 remains **DRAFT**. This ADR builds on it and inherits that status. Accepting either is a human call.
- Codex's default `tool_timeout_sec` is unmeasured. If codex becomes a target host for gated surfaces, measure it with a deliberately-slow stdio MCP server rather than assuming.
