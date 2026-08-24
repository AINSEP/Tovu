# ADR-013: In-App Assistant — CopilotKit Client + AG-UI Daemon Agent, One Tool Registry with an Execution `surface`

- Status: ACCEPTED — **⚠️ Client/transport choice SUPERSEDED 2026-07-28 by [ADR-049](ADR-049-assistant-adopts-jini-kit-supersedes-copilotkit-agui.md)** (CopilotKit + AG-UI replaced by `@jini-ai/chat-react`'s `ChatPane` + `@jini-ai/daemon`'s own event vocabulary). **ADR-049's own transport conclusion was then partially re-opened 2026-08-18 by [ADR-059](ADR-059-assistant-transport-ag-ui-canary.md)**, which adds AG-UI back as a second, additive, opt-in canary transport — not a return to this ADR's "CopilotKit is the single client" framing. Read ADR-049 first, then ADR-059, before treating anything below as current.
- Date: 2026-07-05
- Author: Claude Opus 4.8 / Leon Aburime

## Context

Tovu's in-app assistant (bottom-right FAB → chat) must do two things that look
like they need two different chat systems:

1. **Drive the live front-end** — "navigate to Appearance", "toggle the theme",
   "open this site's admin". This is what CopilotKit's frontend actions do.
2. **Generate content** — "make me a website / slide deck / theme", generate
   media. This is what **open-design** (OD) does: its daemon spawns a coding-CLI
   agent (Claude Code, Codex…) that writes files into a project workspace and
   streams `tool_use` / `live_artifact` events back over SSE.

Investigation of OD (CBM index `…OSS-Repos-open-design`) established, as fact:

- **OD uses zero CopilotKit** and zero A2UI / MCP-UI. Its chat is 100% custom:
  own daemon, own SSE event model (`PersistedAgentEvent`), own React components,
  a hand-rolled `packages/agui-adapter` (OD events → AG-UI wire protocol).
- OD's rich chat UI is three homegrown mechanisms: (a) **GenUI Surfaces**
  (`GenUISurfaceRenderer` + `GenUISurfaceSpec`: schema-driven `confirmation` /
  `choice` / `form` + sandboxed plugin-component surfaces, answered via
  `POST /api/runs/:runId/genui/:surfaceId/respond`); (b) **inline markup tags**
  the agent writes into its text stream (`<question-form>`, `<od-card>`,
  `<od-title>`); (c) **typed events → dedicated components** (`producedFiles`,
  `live_artifact`, `ToolCard`) + markdown.
- The **agent picker** ("Local CLI" vs "Use API · BYOK", the code-agent list,
  "Rescan PATH") is a *daemon* feature: `AGENT_DEFS` (`runtimes/defs/*`) +
  `detectAgents()` → `probeVersionAtPath()` spawns `<bin> --version` on PATH;
  served at `GET /api/agents` (+ `?stream=1` SSE). Framework-agnostic.
- OD's composer, `apps/web/src/components/ChatComposer.tsx`, is a **5,555-line
  god-component** — the model/agent picker, attachments, working-directory
  (backed by a native Electron dialog, `showDirectoryPickerForSender`), and
  design-system picker all live in it; it only assembles a `ChatRequest`.

CopilotKit (context7 `/copilotkit/copilotkit`, verified) is AG-UI-native and
supports: connecting a **custom AG-UI agent** to `CopilotRuntime`; injecting
**frontend tools** (`useFrontendTool` / `useCopilotAction`) into that agent's
tool list automatically (`copilotkit.actions`); a **fully headless** composer
(`useCopilotChat` / `useCopilotChatHeadless_c`); and **custom generative UI**
per tool call (`useRenderTool`, `render({status,args,result})`).

This ADR is the assistant counterpart to ADR-011 (topologies) and ADR-012
(site instantiation), and depends on ADR-006 (rule of two) and ADR-010
(declarative themes).

## Decision

**One chat client, one agent, one tool registry.** We do not combine two chat
runtimes. CopilotKit is the single client; the OD-style daemon run is the single
agent, connected over AG-UI. OD is a **feature reference, not a codebase to
port** — with exactly one clean exception (agent detection).

> **⚠️ SUPERSEDED 2026-07-28 — see [ADR-049](ADR-049-assistant-adopts-jini-kit-supersedes-copilotkit-agui.md).** CopilotKit was never adopted; the client became `@jini-ai/chat-react`'s `ChatPane`. AG-UI as the wire protocol was dropped in favor of `@jini-ai/protocol`/`@jini-ai/daemon`'s own event stream — then partially revived 2026-08-18 as an additive canary transport by [ADR-059](ADR-059-assistant-transport-ag-ui-canary.md). Neither reinstates "CopilotKit is the single client."

1. **CopilotKit owns the shell.** The FAB chat is a **headless** composer built
   on `useCopilotChat` — we do **not** port OD's `ChatComposer`. Rich in-chat UI
   (tool cards, confirmations, clarifying forms, "actual buttons") is rendered
   with `useRenderTool` / generative UI, i.e. **as tool calls the agent makes**,
   rendered client-side. This replaces OD's `<question-form>` markup-parsing and
   GenUI-surface protocol with typed tool calls + `render` — a HITL upgrade.

2. **The daemon run is the AG-UI agent.** Tovu's `web/src/server` daemon exposes
   an AG-UI-compatible endpoint; CopilotKit connects to it. Generation
   (website / deck / theme / media) is what happens when the agent executes a
   **data** tool. This is the OD run model (spawn CLI or BYOK, write artifacts,
   stream events) recast as one AG-UI agent.

3. **`tools.ts` is the seam.** A single tool registry is the source of truth.
   Every tool declares an execution `surface`:
   - `surface: 'frontend'` → registered in React via `useFrontendTool`; handler
     runs **in the browser** (navigate, `set_theme`, `open_admin`), bound to
     `useNav` / controllers. CopilotKit injects these into the agent's tools.
   - `surface: 'data'` → exposed to the agent as **backend / MCP tools**;
     handler runs in the daemon (`create_site`, `create_theme`,
     `generate_media`).
   One LLM sees the merged toolbox; the origin of each call decides where it
   executes. An MCP-like `search_tools` over the tool index (see Consequences)
   keeps the exposed set bounded.

4. **Agent runtime is a separate axis, ported from OD.** A picker chooses
   *where inference runs* — **Local CLI** (detected desktop agent) vs **BYOK
   API** — independent of the tool layer. We **port OD's agent detection**
   (`AGENT_DEFS` + PATH probe + `GET /api/agents` SSE) into `web/src/server`;
   it is the one OD module clean enough to port rather than reference.

5. **Two execution tiers for the agent loop:**
   - **Tier 1 — daemon-owned loop (BYOK), built first.** The daemon runs the
     agent loop with the merged tool list; frontend tool calls relay to the
     browser over AG-UI, data tools run in the daemon. Fully supports the
     combined model out of the box.
   - **Tier 2 — Local CLI agent (the desktop headline).** A spawned CLI can't
     call browser functions, so frontend tools are exposed to it as an **MCP
     "frontend-bridge" server** (OD's `buildLiveArtifactsMcpServersForAgent`
     pattern) whose calls emit an event the browser executes and returns.

6. **Skills are know-how, tools are actions — kept separate** (OD's split).
   A `tovu/skills/` registry of Anthropic-style `SKILL.md` packs (`make-theme`,
   `make-website`, `make-deck`) is injected per-run into the agent's context
   (selected explicitly or by trigger); the executable actions stay in
   `tools.ts`. A deck/site template is itself a skill.

7. **Deployment: desktop-first now, runtime behind a port** (ADR-011 topology 2
   is the near-term target). The agent-runtime and per-site store are ports so a
   hosted / BYOK-only mode drops in later without touching the tool or chat
   layers.

8. **Boundary unchanged (ADR-011): never import OD source.** All reuse is at the
   protocol boundary (AG-UI / HTTP / SSE) or by re-implementing a referenced
   pattern.

## Consequences

- **`ChatComposer` is rebuilt, not ported.** The headless Tovu composer re-earns
  OD's feature set cleanly: model/agent picker (→ `/api/agents`), attachments,
  working-directory (Electron-native dialog), design-system picker, skill
  `@`-mention. Refactoring/rebuilding the composer is a **prerequisite** for the
  chat input work and is owned by Leon; until then the FAB ships a disabled
  input (`web/src/assistant/ChatFab.tsx`) that says so.
- **Two-tier SQLite, per ADR-006/012.** A **platform DB** (workspaces, users,
  `tools_index`, `workspace_tool_grants`, `user_tools`, agent config, detected-
  agent cache) plus **per-site `content.db`**. The per-site store goes behind a
  new `SiteStorePort`: `better-sqlite3` now, **Supabase** later (the rule-of-two
  second adapter). Neither `better-sqlite3` nor CopilotKit is installed yet
  (`web/package.json` has only express/react).
- **New dependencies when this lands:** `@copilotkit/react-core` +
  `@copilotkit/react-ui` (frontend), `@copilotkit/runtime` and/or
  `@ag-ui/client` (the AG-UI bridge), `better-sqlite3`.
- **Build order.** Layer C (`tools.ts` with `surface`) + Layer D (CopilotKit
  client ↔ AG-UI daemon agent) *are* the combine. Layer B (agent detection) is
  independent and portable now. Layer E (skills) hangs off the agent side. The
  composer (Layer D's input) is blocked on the ChatComposer refactor.
- **A12 appendix** (`docs/architecture/appendices/A12-tool-use-first-
  architecture.md`) is the paradigm note; the `@tovu/ai` it references does not
  exist — `tools.ts` supersedes it as the concrete surface.
- **Version-coupling risk (as ADR-011):** the daemon AG-UI surface must be a
  pinned, contract-tested boundary so OD/CopilotKit churn breaks adapter tests,
  not Tovu core.
