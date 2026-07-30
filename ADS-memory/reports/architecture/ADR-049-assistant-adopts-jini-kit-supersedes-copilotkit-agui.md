# ADR-049: Assistant Engine Adopts the `@jini-ai` Kit — Supersedes ADR-013/014's CopilotKit/AG-UI Transport Choice

- Status: Accepted (owner sign-off in conversation, 2026-07-28)
- Date: 2026-07-28
- Author: Claude Sonnet 5 / Leon Aburime
- Supersedes: ADR-013 §1–4,8 (client + protocol + execution substrate). Retains: ADR-013 §3's tool-registry-with-`surface` *concept* (re-homed, see Decision 3–4) and ADR-014 in full (Profile model unchanged, re-expressed as policy — see Decision 3).
- Relates: ADR-011 (deployment topologies, open-design host, one-way reuse boundary), ADR-021 (identity/authorization — `principals`, `authorize()`).

## Context

**What was decided and never built.** ADR-013 (2026-07-05, ACCEPTED) chose CopilotKit as the chat client and AG-UI as the wire protocol, with a single `tools.ts` registry whose entries declare an execution `surface` (`frontend` — runs in-browser via `useFrontendTool`; `data` — runs in the daemon/MCP). ADR-014 (2026-07-06, ACCEPTED) extended that registry with `contexts`/`scope`/`auth`/`effect` axes and a **Profile** (consumer/admin/operator) that computes the exposed toolset server-side per session — an explicit security control, not a UX filter. Neither was implemented: `package.json` has never carried `@copilotkit/*` or `@ag-ui/*` at any point since.

**What got built instead, off the books.** A separate, uncommitted pass (`apps/admin/src/sections/Assistant.tsx`, `apps/admin/src/lib/agent-transport.ts`, `src/agent-chat/runner.ts`, `src/server/routes/admin/agent-chat/stream.ts`, `apps/admin/src/styles/assistant.css` — all untracked in git, no ADR, no spec) used `@jini-ai/chat-react`'s `ChatPane` directly against a hand-rolled SSE frame protocol and a runner hardcoded to spawn only the Claude Code CLI (`claudeAgentDef`), with no tool registry, no profile filter, and no permission gate of any kind between the chat pane and the spawned process's own native tools. It satisfies neither ADR-013 (no CopilotKit, no AG-UI, no `tools.ts`) nor a real adoption of Jini's own capability-execution machinery (it only reaches for `chat-react`'s presentational shell, none of `chat-core`/`core`/`daemon`'s actual tool-registry/executor). This is the concrete "wrong thing built" this ADR replaces.

**Why re-open ADR-013 instead of just fixing the off-the-books build.** ADR-013 was written 2026-07-05 by studying Open Design (OD) directly and explicitly declining to reuse it ("OD is a feature reference, not a codebase to port"), because at that date OD's agent-control code was a single product's monolith, not an extractable kit. Since then, Jini — the product-neutral extraction of that same OD code — has matured into a published, versioned package set already present in this monorepo's dependency tree (`@jini-ai/agent-runtime@0.2.0`, `@jini-ai/platform@0.1.2` at the repo root; `@jini-ai/agentic`, `chat-core`, `chat-react`, `platform`, `protocol`, `renderers-react`, `ui` in `apps/admin`). Per Jini's own `understand-anything` architecture snapshot (2026-07-25, 2527 nodes) it now layers as:

```
@jini-ai/protocol   — wire vocabulary (events/messages/run DTOs), zero deps
@jini-ai/core       — ToolRegistry + DI kernel (public register/list; handlers/policy stay private)
@jini-ai/daemon     — RunLifecycle, durable EventLog, ToolExecutor (authorize→confirm→execute→audit),
                       AgentExecutor, FrontendSessionRegistry
@jini-ai/http, cli, mcp, sidecar   — transport bindings over the daemon
@jini-ai/node-host  — Node/Express composition preset (createLocalNodeDaemon, createFrontendControl)
@jini-ai/agent-runtime — 24 coding-agent CLI adapters (registry.ts's BASE_AGENT_DEFS), detection,
                       launch, a generic multi-CLI stream parser (createJsonEventStreamHandler) plus
                       bespoke ones for Claude/Qoder/Copilot
@jini-ai/agentic    — framework-free capability vocabulary (PAGE_CAPABILITIES, CHAT_CAPABILITIES),
                       the data-agent-* DOM convention, and findFieldFillRefusal (hard-blocks
                       password/CSRF-shaped fields regardless of tagging)
media, memory, artifacts, registry, deploy, composio  — capability/provider packages
chat-core, chat-react, renderers-react, ui  — the chat UI (ChatPane, headless hooks, artifact renderers)
```

This is close enough to what ADR-013/014 designed by hand — a permissioned tool registry, a run lifecycle, a frontend bridge for in-page actions, a chat UI — that re-deriving it via CopilotKit + AG-UI is now duplicate work against a real, tested, versioned kit already one `npm install` away, not a hypothetical.

**Correction to avoid a wrong assumption downstream.** Jini's kit does **not** speak CopilotKit's AG-UI protocol. A similarly-named `agui`/`a2ui` folder inside `@jini-ai/agentic` (`agentic/src/a2ui`, imported in Jini's own playground as `createLabCatalog`/`parseAgentToRendererMessage`) is Jini's own, unrelated generative-UI markup protocol — not `@ag-ui/client`-compatible. Adopting Jini's kit means adopting Jini's own chat client (`ChatPane`) and event vocabulary (`chat-core`'s `AgentEvent`/`ChatMessage`), not bolting Jini onto CopilotKit's AG-UI.

**What Tovu already has that this ADR does not throw away.** `features/{content-types,database,recovery}/agent-tools.ts` are real, committed, per-domain `AgentToolDefinition[]` catalogs (name/description/`sideEffects`/`authorization.permission`/`actorClassRule`) — this is ADR-014's Profile-filtered-registry *shape*, already partly built. `server/routes/admin/widgets/agent-tools.ts` (SPEC-043, ADR-047 §5) is a real, wired, tested thin-gateway tool surface for widgets. Neither is currently reachable from any chat surface, old or new.

## Decision

1. **Supersede ADR-013 §1–4,8's transport/client choice.** Tovu's assistant client is `@jini-ai/chat-react`'s `ChatPane` (+ `@jini-ai/chat-core`'s event/message vocabulary), not CopilotKit. The wire protocol is `@jini-ai/protocol` + `@jini-ai/daemon`'s canonical run-event stream, not AG-UI.

2. **Tool execution is `@jini-ai/core` + `@jini-ai/daemon`, not a bare CLI spawn.** Every agent-callable action goes through `@jini-ai/core`'s `ToolRegistry`/DI kernel and `@jini-ai/daemon`'s `ToolExecutor` (authorize → confirm → execute → audit) and `RunLifecycle`/`EventLog`, composed server-side via `@jini-ai/node-host` (or its constituent `@jini-ai/daemon`/`@jini-ai/http` pieces directly, if the full `createLocalNodeDaemon` preset does not compose cleanly with Tovu's existing Express bootstrap — an implementation-time call, not decided here). A spawned coding-agent CLI (Claude Code, etc.) remains available as one *agent runtime* choice, not the only path to tool execution, and per ADR-021 §"agents = delegated principals," any tool call it makes still resolves through `authorize()`.

3. **ADR-014's Profile model is retained in full, re-homed as policy.** Consumer/admin/operator profiles and the `contexts`/`scope`/`auth`/`effect` axes remain Tovu's own decision surface — Jini does not decide *what* is exposed to *whom*, only *how* an authorized call is executed/streamed/audited. Concretely: ADR-014's per-session `exposed = registry.filter(...)` computation becomes the `ToolPolicy` (and/or the `capabilities` list) Tovu passes into `@jini-ai/daemon`'s registration calls.

4. **`features/*/agent-tools.ts` catalogs become the registered content, not a parallel system.** Each domain's existing `AgentToolDefinition[]` is the source manifest mapped into `@jini-ai/core`'s `ToolRegistration` shape — re-homed, not rewritten. The mapping (exact field correspondence, where handlers live) is deferred to the implementation spec (M1), not decided here.

5. **Multi-agent support replaces the Claude-only hardcode.** `@jini-ai/agent-runtime`'s full `AGENT_DEFS` registry (24 adapters) is the source of truth for `listAgents()`; availability is probed per-def via `resolveAgentLaunch`, not assumed. `startAgentRun` accepts an `agentId` and dispatches to the matching def and its stream parser (bespoke for Claude/Qoder/Copilot, `createJsonEventStreamHandler` generically for the rest).

6. **In-page DOM agent control is a distinct, later capability, not required for the first slice.** `@jini-ai/agentic`'s `page.*` verbs (`createDomPageDriver`, `createFrontendSessionBridge`, `findFieldFillRefusal`) — the pattern demonstrated in Jini's own `examples/reference-web/src/AgentLab.tsx` — layers onto the same kernel this ADR adopts, sequenced after the core swap ships. Not designed here.

7. **Reuse boundary unchanged from ADR-011.** All reuse is at the published-package boundary (`@jini-ai/*` on npm); Tovu never imports Jini or Open Design source directly.

## Consequences

- **Drops from ADR-013's dependency list, permanently:** `@copilotkit/react-core`, `@copilotkit/react-ui`, `@copilotkit/runtime`, `@ag-ui/client`. Never installed; now never will be under this plan.
- **New dependencies when this lands:** `@jini-ai/core`, `@jini-ai/daemon`, `@jini-ai/node-host`, `@jini-ai/http` — joining the already-installed `@jini-ai/agent-runtime` (root), and `@jini-ai/agentic`/`chat-core`/`chat-react`/`platform`/`protocol`/`renderers-react`/`ui` (`apps/admin`). Version pin discipline and a contract-tested boundary carry over unchanged from ADR-013's own "version-coupling risk" note.
- **The uncommitted `Assistant.tsx`/`agent-transport.ts`/`runner.ts`/`stream.ts` are not salvageable as-is.** They bypass the tool-registry/profile gate this ADR requires (ADR-014's core security requirement) and hardcode one CLI agent against a 24-adapter registry. `ChatPane` usage and the presentational CSS may carry forward; the transport and runner do not.
- **ADR-013 §1's headless-composer requirement stands, re-scoped.** "We do not port OD's `ChatComposer`" still holds; evaluate at implementation time whether `chat-react`'s own `ChatPane`/headless hooks satisfy that bar directly, or Tovu still needs a thin composer shell around them (attachments, working-directory picker, agent/model picker UI) — this is what `examples/reference-web/src/AgentLab.tsx` composes for Jini's own playground and is a reasonable reference shape.
- **This ADR does not decide the DOM-page-control feature.** Deferred to a follow-up ADR/spec once the core swap (Decisions 1–5) ships and is stable.
- **Process gap, stated plainly:** unlike ADR-013/014 and most of this index, this ADR has not been through this repo's usual `/debate` or `/audit-work` rounds — it was converged in a single conversation between the assistant and the owner after a direct architecture-options question. It is marked Accepted on owner sign-off, matching the precedent set by ADR-025/046, not on multi-round convergence. If the team's normal bar applies here too, run `/audit-work` against this ADR and the M1 spec before implementation proceeds past the first vertical slice.

## Rejected alternatives

- **Build ADR-013/014 exactly as specified (CopilotKit + AG-UI + hand-rolled `tools.ts`).** Rejected: duplicates a published, tested kit already in the dependency tree; strictly more code to write and maintain for the same security/architecture outcome ADR-014 wanted.
- **Keep the uncommitted `chat-react`-direct implementation and patch it in place** (add multi-agent support, leave the rest). Rejected: it has no tool-registry/profile gate at all, which is ADR-014's central requirement, not an optional add-on; patching around that gap would re-derive `@jini-ai/core`/`@jini-ai/daemon` badly instead of adopting them.

## Deferred

- Concrete `ToolRegistration` mapping from each `features/*/agent-tools.ts` catalog into `@jini-ai/core`'s registry shape (M1 spec).
- Whether `@jini-ai/node-host`'s `createLocalNodeDaemon` preset is adopted wholesale, or Tovu composes `@jini-ai/daemon` + `@jini-ai/core` + `@jini-ai/http` primitives directly against `src/server/app.ts` (implementation-time engineering call).
- In-page DOM agent control (`@jini-ai/agentic`'s `page.*` verbs, `createFrontendSessionBridge`, `findFieldFillRefusal`) — explicitly out of scope for the first slice.
- Per-`RuntimeAgentDef` stream-parser mapping (which of the 24 adapters use the generic `createJsonEventStreamHandler` vs. a bespoke handler).
- Whether Tovu still needs its own composer shell around `chat-react`'s `ChatPane`, or the package's own surface is sufficient headless-composer coverage for ADR-013 §1's bar.
