# ADR-053: MCP-UI Confirmation Transport — Browser as Host, Side-Channel Delivery, Stopgap Until Built

- Status: **Accepted** 2026-09-08 (owner sign-off — Leona). Added to `ADR-INDEX.md`.
- Date: 2026-08-03
- Author: Claude Sonnet 5 (dispatched software-architect recon)
- Supersedes: nothing formally (no prior ADR ever authorized MCP-UI as a mechanism — see Context). Extends ADR-049 (assistant transport/tool-registry choice) into the one capability ADR-049 explicitly deferred ("in-page DOM agent control... not designed here" — a sibling problem, not this one, but same deferral pattern).
- Relates: ADR-049 (assistant engine adopts `@jini-ai` kit), ADR-021 (identity/authorization, `principals`, `authorize()`).

## Context

**MCP-UI shipped in this codebase with no ADR authorizing it.** A 2026-07-30 commit (`0429d81`) built a genuine MCP-UI wire-protocol implementation — `src/assistant/mcp-ui.ts`, `src/assistant/pending-confirmations.ts` — as part of a domain feature (Posts/Pages soft delete), citing exact published-package literals and testing the protocol correctly against a fake host. The only ADR that ever mentioned MCP-UI (ADR-013, 2026-07-05) was superseded eleven days later by ADR-049, which doesn't mention it at all. So by the time the wire protocol was written, no live architectural decision said "this is how Tovu gates destructive agent actions."

**A full recon (`ADS-memory/reports/recon/2026-08-03-mcp-ui-and-agent-driven-ui.md`) found three things, in order:**

1. **Built twice, never connected.** The wire-protocol half (above) and a general-purpose rendering half (`@jini-ai/ui/mcp-ui`'s `McpUiHost`/`useMcpUiHost`, built the same day in the sibling Jini repo) both exist, both work in isolation, and nothing imports the second into Tovu's actual chat surface (`AssistantDock`/`ChatPane`).
2. **A confirmed, live security leak.** `content_post_delete`'s confirmation token — whose entire purpose is preventing the agent from self-approving a delete — reaches model-visible text today. Traced statically, hop by hop: `@jini-ai/mcp`'s generic `okResult()` wrapper (`packages/mcp/src/server/tool-protocol.ts:73-76`) `JSON.stringify`s any non-string tool-handler return into a single MCP text block, and `content_post_delete`'s first-call return (`{content:[textBlock, uiResource]}`, token embedded in the resource's HTML) is not a string. The model receives the token in its own tool-call history and can complete the delete itself, no human involved.
3. **A structural transport mismatch, deeper than the leak.** Even with (2) fixed, Tovu's spawned Claude Code CLI runs headlessly (`-p`/stream-json) with no human present — it structurally cannot be the "host" MCP-UI's security model requires (render to a human, wait for that human, make the follow-up call). Documentary research found no evidence Claude Code (the CLI) implements MCP Apps/MCP-UI in any mode; every related bug report and capability statement traces to Claude Desktop/claude.ai instead.

**A pre-existing, unrelated codebase convention already covers exactly this failure mode, and `content_post_delete` is the one place it wasn't applied.** `packages/cms/src/core/tools/registration-kit.ts`'s `assertToolIsWirable` refuses to build any tool whose catalog entry declares `actorClassRule: "confirmer-must-equal-own-delegatedBy"` while `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` is unsatisfied — with the error message stating the rule outright: *"requires a human-confirmation transport this host has not wired — leave it unwired until one exists."* Three tools (`collections_execute_cleanup`, `database_execute_migrate_forward`, `backup_execute_restore`) and a fourth content-types ceremony are, correctly, excluded by this gate today. `content_post_delete` used a different confirmation mechanism (the MCP-UI token protocol) that this gate has no visibility into, so it bypassed the safety net that exists for precisely this situation.

**User decision, received mid-recon: MCP-UI is now a commitment.** "We have to make mcp-ui work." This ADR is written against that mandate — the question this ADR answers is not whether to adopt MCP-UI, but what transport makes it sound, and how to sequence getting there without leaving a broken confirmation live in the meantime.

## Decision

1. **The browser (`ChatPane`/`AssistantDock`) becomes the real MCP-UI host, not the spawned CLI.** It is the only actor in the pipeline with a human present. `@jini-ai/ui/mcp-ui`'s `McpUiHost`/`useMcpUiHost` — already built, already protocol-correct against the MCP Apps/SEP-1865 JSON-RPC handshake, already unimported anywhere in Tovu — is adopted as that host rather than built fresh.

2. **`delete-confirmation-ui.ts` is replaced by `@jini-ai/ui`'s `features/mcp-ui/surfaces/confirmation.ts` builder, not patched.** The two are protocol-incompatible as they stand: Tovu's hand-rolled dialog speaks the older ad hoc `mcp-ui` community-SDK postMessage shape (`{type:"tool", messageId, payload}` / `ui-message-received`/`ui-message-response`); `useMcpUiHost` speaks the standardized MCP Apps JSON-RPC handshake (`ui/initialize` → `tools/call`). The Jini builder's own module doc states it was generalized from this exact Tovu file for this exact reason. `pending-confirmations.ts`'s token substrate (minting, TTL, single-use, entity-version binding) is unchanged — only the HTML-generation and postMessage layer is swapped.

3. **The confirmation redemption call becomes a new, browser-reachable, admin-session-authenticated endpoint — not a second MCP round-trip.** `useMcpUiHost`'s `onToolCall` is a plain callback, not an MCP client requirement; it does not need to re-enter the CLI/MCP-server loop. The endpoint invokes the same handler logic `content_post_delete`'s step 2 already contains, directly. `/api/delegated-tool-calls` is not reused for this — its own documentation states its only legitimate caller is the run's own spawned `jini-mcp` process, and widening that trust boundary is a decision to make explicitly if it's ever wanted, not a side effect of routing through it here.

4. **The fork point is inside the daemon, at the moment the tool handler executes — before its return value ever crosses back toward the CLI/MCP boundary. The CLI hop is supplemented, not bypassed.** This is the precise answer to "where does the resource have to diverge from the model-visible path": anywhere *downstream* of the handler's own return (in `okResult()`, in the CLI's own relay, in `claude-stream.ts`, in the browser) is provably too late, because by definition a tool call's return value is what the calling model receives — that is what "the model called a tool" means. There is no point after the handler returns where content can be shown to a human but hidden from the model, because past that point both are reading the same value. So `content_post_delete`'s handler, running server-side in the daemon's `ToolExecutor`, must emit **two separate outputs** at the moment it mints a confirmation: (a) the ordinary, minimal, model-safe text acknowledgment, returned as the handler's actual return value — unchanged, still flows through the CLI exactly as any tool result does, because the model still legitimately needs to know "a dialog is open, wait" — and (b) the UI resource, emitted directly onto the run's own event log (which the daemon already owns and already streams to the browser over the same SSE connection `assistant-transport.ts` subscribes to) as its own event, which the CLI never sees and never relays. The CLI hop stays exactly as it is for (a); it is never touched for (b).

   **This requires no change to `@jini-ai/chat-core`'s `AgentEvent` type, and no change to `ChatPane`'s own source — confirmed by reading the actual mechanism, not assumed.** `AgentEvent` already has a `kind: 'ext'` escape hatch, built specifically for "host-specific event kinds chat-core doesn't know about" (its own module doc names `live_artifact`/`plugin_candidate` as existing examples), and Tovu's `translateRunAgentPayload` already routes any unrecognized wire event type into it by default (`assistant-transport.ts`'s `default: return { kind: "ext", name: payload.type, data: payload }`). `@jini-ai/ui/chat` ships a working, precedented **per-name renderer registry** for exactly this (`registerExtEventRenderer(name, renderer)`, `packages/ui/src/react/chat/ext-event-renderer-registry.ts`) — a host registers a component against an event name once, at module scope, and every `ChatPane` renders matching events through it, wrapped in its own error boundary so a bad render can't take down the transcript. There is a live precedent doing exactly this shape for a different protocol (`A2uiSurfaceCard.tsx`, registered against `kind:'ext', name:'a2ui'`), and that component's own header names the sibling precedent this ADR's approach would mirror: `McpUiLab.tsx` registering `show_mcpui_widget` this same way. Concretely: Tovu names a new wire event kind (e.g. `mcp_ui_resource_offered`), the daemon emits it from the handler per above, it lands in the browser as `{kind:'ext', name:'mcp_ui_resource_offered', data:{...}}` with zero transport-layer changes, and a new Tovu-owned component registered via `registerExtEventRenderer` mounts `McpUiHost` against it. This is genuinely additive at every layer — no widened union, no forked consumer behavior, no risk to any other Jini/chat-core consumer.

   One mechanism this rules out, checked and rejected: routing the resource through `registerToolRenderer` (the sibling registry `McpUiLab.tsx` actually uses for `show_mcpui_widget`) instead of a new event kind. It looked promising — it's the more direct A2UI/MCP-UI-widget precedent — but its `ToolRenderProps.result` is typed `string | undefined` (`packages/chat-core/src/tools.ts:24`), the same flattened-string constraint as `AgentEvent.tool_result.content`, because it derives from the exact same tool-call return value the model itself received. Using it would put the resource back on the model-visible path this whole design exists to avoid. It's the right tool for rendering a tool call's own (non-secret) result nicely; it is structurally the wrong tool for content that must never be part of that result in the first place.

5. **`okResult()` (or `delegated-tool.ts`) is fixed in parallel, on its own timeline — not a prerequisite for Decision 4.** Once `content_post_delete`'s handler stops routing the resource through its own tool-call return value at all (Decision 4), `okResult()` never sees a resource-bearing payload for this tool either way, so it is off this critical path. It remains worth fixing regardless: it is the generic wrapper any *other* future tool would leak a withheld-by-design secret through the same way, and leaving it unfixed means the next tool that reaches for this same confirmation pattern can reintroduce today's exact bug independently.

6. **Stopgap, effective immediately, until Decisions 1-4 ship: `content_post_delete`'s destructive path is gated the same way this codebase already gates `database_execute_migrate_forward` and its three siblings** — excluded from the wired agent-tool surface until a real confirmation transport exists, rather than left live with a token protocol that currently provides no real gate. This is not a separate design; it is Decisions 1-4 not yet done, expressed the same way the rest of the codebase already expresses "no transport yet." A confirmation the model can self-approve is worse than no confirmation, because it creates belief in a control that isn't there. Team-lead asked directly whether to disable or leave it live: disable — no consideration found during this recon outweighs that framing.

## Consequences

- **Posts/Pages agent-initiated delete has no working confirmation between the stopgap landing and step 5 shipping.** Same state as `database_execute_migrate_forward` today — a tool that would need one and doesn't have one yet, so it stays unreachable rather than reachable-but-unsafe. Human-initiated delete through the admin UI is unaffected; it never went through this path (Part 3 of the recon).
- **`mcp-ui.ts`/`pending-confirmations.ts` are retained as-is.** The token substrate was correct; only the delivery and rendering layers around it change.
- **New dependency surface: `@jini-ai/ui/mcp-ui` and `@jini-ai/ui/mcp-ui/surfaces` become real, imported dependencies of `apps/admin`,** not just linked-but-unused packages. Both already exist in the pinned `file:../Jini/packages/ui` dependency, so this is not a new external dependency, only new usage of an existing one.
- **A new HTTP endpoint is added to Tovu's server surface**, admin-session-authenticated, distinct from `/api/delegated-tool-calls`. Its authorization shape (which permission it checks, how it re-validates the token's binding) is implementation detail for the eventual spec, not decided here.
- **A new wire event kind is added at the daemon/protocol layer, carried through the existing `kind:'ext'` escape hatch — not a widened `AgentEvent` union, not a `ChatPane` change.** Confirmed additive: `registerExtEventRenderer` (already shipped, already precedented by `A2uiSurfaceCard`) is the whole integration surface on the browser side. Blast radius to other Jini/chat-core consumers: none — they simply never register a renderer for this event name and see nothing, the same as they see nothing for `a2ui` today.
- **This generalizes beyond Posts/Pages.** Once steps 1-5 exist, the same mechanism is available to any future destructive tool that needs human confirmation — including the three tools currently excluded by the `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` gate, if their owners choose to build against it (a separate decision each, not implied here).

## Rejected alternatives

- **Fix `okResult()` alone and consider it done.** Rejected: closes the confirmed leak but not the underlying unsoundness (Decision 3's structural argument — the CLI still cannot be the host). Would very likely produce a second, harder-to-find leak the next time someone traces "does the confirmation actually work," since the failure would move from "obviously flattened text" to "silently mis-relayed structured content" — worse to diagnose, not better.
- **Give the spawned Claude Code CLI its own rendering surface (e.g., a companion window) so it can act as host.** Rejected without deep investigation, but implausible on its face: Tovu spawns it specifically because no human is watching that process; retrofitting a display for a deliberately headless subprocess inverts the reason it's headless, and there's no evidence Claude Code's own client code has anywhere to hang MCP Apps support even if one existed.
- **Adopt Jini's native `surface_request`/`surface_response` protocol event (`surfaceKind:'confirmation'`) instead of MCP-UI.** A real, closely related, already-partially-wired mechanism (Tovu's transport layer already reserves space for it) that would solve the same user-facing problem with less new work. Rejected as the primary path **only** because the user's decision was specifically "make MCP-UI work" — substituting a different mechanism, however capable, would answer a different question than the one asked. Recorded here so it isn't rediscovered from scratch if "does it have to be literally MCP-UI" is ever revisited.
- **Leave `content_post_delete` wired as-is and accept the risk.** Rejected: explicitly contradicted by team-lead's own stated standard during this recon ("a confirmation gate the model can self-approve is worse than no gate at all"), and inconsistent with how this codebase already treats every structurally identical case.

## Deferred

- Exact shape of the new redemption endpoint (route, request/response schema, authorization check).
- Exact shape of the new SSE side-channel event (name, payload, how `ChatPane` distinguishes it from `ext`-routed events it doesn't yet render).
- Whether `page.click`-driven dialogs (the separate, non-MCP-UI mechanism this recon's Part 2/3 covers for human-initiated in-app actions) and this mechanism should share any wiring beyond the discipline both already follow (explicit opt-in, resolvable handle, fail-closed on miss) — Part 3 of the recon argues they should stay separate implementations; nothing here revisits that.
- Whether the three currently-excluded `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT` tools should be built against this mechanism once it exists — a decision for each tool's owner, not implied by this ADR.
- Full implementation outline / task breakdown for steps 1-5 — this ADR establishes the shape and sequencing; a follow-up spec/outline is needed before implementation starts.

---

## Addendum A (2026-08-03, implementation): `@jini-ai/ui` becomes a root Tovu dependency

**Decision:** add `"@jini-ai/ui": "file:../Jini/packages/ui"` to the **root** `package.json`, rather than
moving the surface builders into a separate server-safe package.

**Why this needed deciding at all.** `src/features/post/delete-confirmation-ui.ts` is server-side code
compiled by the root `tsconfig.json` and running in the API process. Consequence bullet above claims
`@jini-ai/ui` "already exists in the pinned `file:../Jini/packages/ui` dependency" — **that is true of
`apps/admin/package.json` only.** The root had no such entry and no `node_modules/@jini-ai/ui`
symlink, so the rewritten adapter failed to compile (`TS2307`). Adding a *UI* package to the *server's*
dependency list is a real layering choice, and the risk it carries is pulling React into the API
process by accident.

**Evidence gathered before choosing — observed, not inferred from the subtree's own doc comment:**

1. `packages/ui/package.json` maps `./mcp-ui/surfaces` → `dist/features/mcp-ui/index.js`, a subpath
   distinct from the React entry `./mcp-ui` → `dist/react/mcp-ui/index.js`.
2. `grep` for `from 'react'` / `require('react')` / `jsx` across the **built** `dist/features/mcp-ui/`
   tree returns nothing. Every occurrence of the string "React" in that subtree is prose in a comment.
3. `react` and `react-dom` are **optional** `peerDependenciesMeta` entries of `@jini-ai/ui`, so the
   install cannot drag them in implicitly.
4. **The decisive check:** after installing, `node -e "await import('@jini-ai/ui/mcp-ui/surfaces')"`
   from the Tovu root succeeds and yields 59 exports — in a root where `node_modules/react` does not
   exist. A React import anywhere in that graph would have thrown `ERR_MODULE_NOT_FOUND`. The
   React-free property is therefore *executed*, not asserted.

**Cost actually paid:** `npm install` added 99 packages — all `micromark` / `micromark-extension-gfm`
transitives (`@jini-ai/ui`'s only non-workspace runtime deps). No `react`, no `react-dom`, no
`lexical`, no `@lexical/*` at the root. The three `@jini-ai/*` workspace deps resolve inside the Jini
monorepo through the existing symlink, exactly as the nine sibling `file:` entries already do.

**Rejected: move the builders to a new server-safe package.** Better layering on paper, but it buys
nothing here — the export map already *is* the split, and the split is now empirically verified. It
would also cut against the owner's 2026-08-03 steer to maximise Jini reuse by adding a package
boundary whose only job is to restate a boundary that already holds.

**What to re-check if this ages badly:** the guarantee is "the `./mcp-ui/surfaces` subpath imports no
React." If a future change makes `features/mcp-ui/` import from `react/mcp-ui/`, the server silently
gains React. `packages/ui/src/features/mcp-ui/index.ts`'s header already forbids that direction; a
build-time assertion would be the durable version of this addendum.

**Verified after:** Tovu root `npm run typecheck` clean; `apps/admin` `npm run typecheck` clean.

---

## Status note, 2026-09-08

Recorded at acceptance time, from reading today's code — not a rewrite of the Decision/Context
above, which stay as written on 2026-08-03.

- **Decision 1 (browser as host) — SHIPPED.** `apps/admin/src/components/AssistantDock/AssistantDock.tsx`
  imports and wires `@jini-ai/ui/mcp-ui`'s `McpUiHost`/`useMcpUiHost` via
  `registerExtEventRenderer(MCP_UI_EXT_EVENT_NAME, ...)` (event name is literally `"mcp-ui"`, confirmed
  at `apps/admin/src/lib/assistant-transport.ts:154` — not the `mcp_ui_resource_offered` example name
  this ADR sketched; naming detail, not a different mechanism). `@jini-ai/ui` is now a pinned npm
  dependency (`^0.3.4`, both root and `apps/admin/package.json`) rather than the `file:../Jini/...`
  path Addendum A described — the dependency direction and React-free-server property Addendum A
  verified still hold.
- **Decision 2 (`delete-confirmation-ui.ts` replaced, not patched) — SHIPPED.** It now imports
  `buildConfirmationSurface` from `@jini-ai/ui/mcp-ui/surfaces`; its own header states outright "the
  confirmation token is gone (ADR-055 Decision 2/3)." The same builder is now used by 7+ feature areas
  (`comments`, `post`, `custom-credentials`, `redirects`, `theme`, `webhooks`, `media`
  `tool-registrations.ts`), all sharing one `resolveConfirmationDecision` helper
  (`contracts/core/tool-surface-exchanges.ts:340`) — this generalized far past Posts/Pages.
- **Decision 3 (new redemption endpoint) — SUPERSEDED, not built as decided here.** ADR-055 (accepted
  the same day, commit `fc035beb`) replaced the token mint/redeem-endpoint shape entirely with a single
  held-open call: the handler parks on `ToolExecutionContext.emitSurface` +
  `SurfaceExchangeStore`/`resolveConfirmationDecision` and answers its own call when the human responds
  — "one held-open call, not a mint call plus a redeem call." `content_post_delete`'s own
  `tool-registrations.ts:697-699` comment names this explicitly: "(superseding ADR-053 Decision 3, the
  token-redemption shape this handler used to implement)." No separate admin-session-authenticated
  redemption endpoint exists or was built.
- **Decision 4 (fork point in the daemon, dual output, new wire event kind) — SHIPPED IN SPIRIT.**
  `content_post_delete`'s tool-call return value (`agent-tools.ts:500-543`) is now plain data —
  `{ deleted, cancelled, post }` / `{ deleted: false, cancelled: false, reason }` — and structurally
  never carries a UI resource. The resource travels via `ToolExecutionContext.emitSurface` (ADR-055
  Decision 7) onto the `kind:'ext'` channel exactly as this ADR proposed, landing in the browser through
  `registerExtEventRenderer`, confirmed additive, zero change to `ChatPane`'s own source or the
  `AgentEvent` type. The concrete wire event name shipped as `"mcp-ui"`, not `mcp_ui_resource_offered`.
- **Decision 5 (fix `okResult()` in parallel) — NOT shipped as a hardening fix, and the specific
  leak this ADR traced can no longer occur through `content_post_delete` (Decision 2 means it never
  returns a resource-bearing payload), but the generic wrapper itself is unchanged against the failure
  mode.** Read `node_modules/@jini-ai/mcp/dist/server/tool-protocol.js:63-105` (pinned `@jini-ai/mcp
  ^0.3.1`): `okResult()` now passes a well-formed content envelope through verbatim if every block is
  `type:'text'` or `type:'image'` — but a `type:'resource'` block is not in that allowlist, so a
  `{content:[textBlock, uiResource]}` payload still falls to the generic branch and is
  `JSON.stringify`'d whole, unchanged from what this ADR documented. No tool in the current tree
  triggers it (all 7+ gated tools route resources through `emitSurface` instead of their own return
  value), so there is no live leak today — but the generic risk Decision 5 named is still open in the
  dependency as pinned.
- **Decision 6 (stopgap: exclude `content_post_delete` from the wired surface) — NO LONGER IN FORCE.**
  `apps/website/src/assistant/tool-registrations.ts:632` states outright: "`content_post_delete`
  (ADR-055 Decision 2) is now a shipped, non-env-gated tool that parks." It is live on the wired
  agent-tool surface today, gated by the working mechanism above rather than excluded.

**Net:** the central decision this ADR records — the browser becomes the real MCP-UI host — is intact
and shipped; nothing in today's code contradicts it. Decisions 1, 2, 4, and 6's resolution have shipped;
Decision 3 was explicitly superseded (by an already-accepted ADR-055, not by this note); Decision 5's
underlying dependency is unfixed but currently unreachable by any shipped tool. Commits: `61edab4b`
(original wire-protocol build), `89420ed5`, `6dbbd30e`, `ba002973`, `f04f8e0e`, `be2fb111`, `47c8c84e`
(2026-09-08 generalization to comments/post/custom-credentials/redirects/theme/webhooks/media), and
`fc035beb` (ADR-055 acceptance, the same day).
