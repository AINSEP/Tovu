# Recon: replace Tovu's chat assistant stack with Vercel AI SDK + assistant-ui?

Date: 2026-09-11. HEAD `c85b933c` on `restructure/apps-website-phased`. Software-architect
`skills.md` loaded per dispatch (v2.3.0). Recon only — no files modified except this report.

## Verdict

**Don't do the full swap. Keep the CLI-subprocess agentic core (it's what the multi-CLI/skills/
plugin story is built on and neither library replaces it), and treat assistant-ui as an
optional, incremental UI-layer replacement — never wired through Vercel AI SDK, wired directly
onto Tovu's existing SSE run stream via a custom `ExternalStoreRuntime`/`ChatModelAdapter`.**
Vercel AI SDK's core abstraction (`LanguageModelV2`-style provider: one model endpoint's
generate/stream call) has no concept of "spawn a local CLI that owns its own tool loop, skills,
and sub-agents"; adopting it for the model layer means either black-boxing each CLI run as one
opaque turn (losing token-level streaming and AI SDK's own tool-call loop, which would sit
unused since the CLI already resolves tools itself) or hand-writing a custom provider per CLI
that translates each CLI's event stream into AI SDK's stream-part protocol — real engineering
work that reproduces, rather than replaces, code Tovu already has. None of the four concrete
defects below are primarily "wrong library" bugs: three are Tovu's own persistence/bookkeeping
logic (fixable today, independent of any library swap) and one — the daemon-respawn-kills-every-
live-run failure mode — is a durability gap neither library touches, because it lives below both
of them, in how the agent daemon supervises its own child CLI processes.

---

## 1. Gaps

### What the current stack does that AI SDK + assistant-ui do NOT cover out of the box

- **The entire agentic loop is delegated to a local CLI subprocess**, not an in-process model
  call. `agent-daemon-server.ts:1-3` states this as an explicit architecture correction ("ADR-049:
  Tovu does not spawn coding-agent CLIs itself" — read literally alongside `daemon-supervisor.ts`
  this means Tovu's *main* process doesn't spawn the CLI directly; the *daemon* process,
  `child_process.spawn`ed by `index.ts` via `daemon-supervisor.ts`, does). `DEFAULT_AGENT_ID` is
  `"claude"` (`agent-daemon-server.ts:156`). Vercel AI SDK's provider interface models a single
  model endpoint (prompt in, token/tool-call deltas out); it has no first-class notion of an
  external, stateful CLI process that owns its own multi-turn memory, tool execution, and
  sub-agent spawning. Nothing in the AI SDK docs describes local-CLI-as-provider support
  (verified via WebFetch against ai-sdk.dev/docs/introduction, 2026-09-11) — every listed
  provider (25+) is a hosted API.
- **24 local-CLI adapters**, not "claude, codex, agy" (the brief's shorthand) but a full catalog:
  `BASE_AGENT_DEFS` in `/Users/la/Programming/Jini/packages/agent-runtime/src/registry.ts:48-71`
  lists 24 defs (amr, claude, codex, devin, opencode, hermes, trae-cli, grok-build, kimi,
  cursor-agent, qwen, qoder, copilot, amp, pi, kiro, kilo, vibe, deepseek, aider, antigravity
  [binary `agy`], reasonix, codebuddy, mimo). Several declare `resumesSessionViaCli: true`
  (`defs/claude.ts:248`, `defs/codex.ts:382`, `defs/codebuddy.ts:137`, `defs/opencode.ts:85`) or
  `resumesSessionViaAcpLoad: true` (`defs/amr.ts:334`) — each a different resume protocol AI SDK
  has no concept of.
- **Agent plugins / skills / MCP servers with per-workspace allowlists.** Confirmed live:
  `apps/website/src/features/agent-plugins/activation.ts` (per-workspace bundled-vs-installed
  activation state, `enabled: false, origin: "bundled"` default for Tovu-seeded plugins — see its
  module doc), `apps/website/src/assistant/external-mcp-store.ts`,
  `apps/website/src/assistant/mcp-federation/trust.ts`, and
  `apps/website/src/features/external-mcp/agent-tools.ts` implementing the two-list
  (tool-allowlist + separate write-grant allowlist) model. This machinery exists to gate what a
  spawned CLI subprocess is allowed to touch. AI SDK's `tools` parameter is a plain object of
  callable functions passed per-request; it carries no workspace/tenant/allowlist concept — Tovu
  would still own and enforce all of this itself either way, so it is not "lost" by adopting AI
  SDK, but it is also not provided by it.
- **Server-rendered MCP-UI surfaces returned as tool results.** `save-form.ts:1-6,29` builds a
  `UIResource` via `@jini-ai/ui/mcp-ui/surfaces`'s `buildFormSurface`. The rendering side is a
  hand-built host, not the reference `@mcp-ui/client` package: confirmed at
  `/Users/la/Programming/Jini/packages/ui/src/react/mcp-ui/McpUiHost.tsx` plus a full protocol/
  sandbox-proxy/escape-hatch implementation in `packages/ui/src/features/mcp-ui/{protocol,
  sandbox-proxy,escape,resource,confirmation-store,early-message-buffer}.ts` and a `surfaces/`
  DSL (`form.ts`, `checkbox.ts`, `select.ts`, `choice-group.ts`, `text-input.ts`, `document.ts`,
  `confirmation.ts`, `outcome.ts`, `bridge.ts`, `tokens.ts`, `fields.ts`). assistant-ui has no
  MCP-UI concept at all — it has "Tool UI," a per-tool React component contract
  (`makeAssistantToolUI`, now superseded by a `Tools()` API — confirmed via WebSearch against
  assistant-ui.com/docs, 2026-09-11). This is a gap AI SDK/assistant-ui does not cover; see
  Section 2 for why it's a smaller gap than it looks.
- **Multi-process daemon architecture with its own DB connection, principal propagation, and
  bearer-token auth**, documented at length in `agent-daemon-server.ts:1-51` (own SQLite
  connection under WAL, `contextRef`-based principal stamping, `daemon-auth.ts`'s
  `requireAgentDaemonToken()`). This is infrastructure, not chat-UI/model-SDK concern — orthogonal
  to both candidates.

### What AI SDK + assistant-ui cover that the current stack does badly

- **assistant-ui's runtime abstraction decouples UI from transport.** Per WebSearch against
  assistant-ui.com/docs (2026-09-11): `LocalRuntime` wants one `ChatModelAdapter` "run" function;
  `ExternalStoreRuntime` "bridges your existing state management... you provide messages and
  callbacks; the runtime renders whatever you give it." Neither requires Vercel AI SDK. This is
  materially better factored than what's in `apps/admin/src/components/AssistantDock/` today —
  9 files, ~1,880 lines (`wc -l`, 2026-09-11) of dock/tray/overflow/indicator components built
  directly against Tovu's own SSE wire format, with branching/editing/regeneration/cancellation
  presumably hand-rolled rather than inherited from a maintained runtime.
- **AI SDK's message/parts model and `onFinish`-gated persistence is a cleaner discipline than
  what's in production today.** Per WebSearch (2026-09-11, DEV Community / DeepWiki sources): the
  convention is "only persist the message when it's complete, not on every chunk," with
  `onFinish`/`onError` as the explicit save points. Tovu's current code does not follow this
  discipline — see Defect 2/3 below, where a failed run persists an empty assistant row anyway.
- **AI SDK's resumable-stream feature** targets exactly the "client reconnects to an in-flight
  stream after a drop" case — but note it requires the underlying generation to still be running
  somewhere with a persisted event log to reattach to; Tovu's specific failure mode (the whole
  daemon process dies, taking the run with it — see Defect 4) is a different, harder problem this
  feature does not solve. See Section 2.

---

## 2. Improvements — defect by defect

All four defects were independently re-verified against `sites/tovu-com/chat.db` and
`~/.claude/projects/-Users-la-Programming-Tovu/*.jsonl`, not taken on faith.

**Defect 1 — conversation memory forked across two CLI sessions.**
Verified: `ai_chat_messages` position 0 ("we have the higgsfield plugin...") is the only message
in CLI session `56bfd415-de2a-4c21-9912-db96ecf74d0d.jsonl` (81 lines; first user turn matches
verbatim). Every later turn (positions 1,2,4,5,7,9) is in `76ffce45-...jsonl` (150 lines), whose
first turn is "i dont have a client id" (position 1) — `56bfd415` is never referenced again.
`assistant_agent_sessions` (schema dumped via `sqlite3`) has PRIMARY KEY
`(conversation_id, agent_id)` and the upsert in
`apps/website/src/assistant/persistence/agent-session-store.ts:58-63` does
`ON CONFLICT (conversation_id, agent_id) DO UPDATE ... session_id = excluded.session_id` — by
construction this table can only ever remember the single most-recently-confirmed session id per
(conversation, agent). Whatever caused the first run's session id to never get stored (unverified
— `agent-session-resume.ts`'s own doc describes a related but distinct "H1" dead-session bug it
already fixed, not this one) left the second turn believing there was no prior session, so it
started cold under a fresh id, silently orphaning turn 0.
*Fix scope: this is a Tovu persistence-logic bug, in `onStarted`/`agent-session-store.ts`'s own
code, not a "chat library" problem.* Neither AI SDK nor assistant-ui touches
`assistant_agent_sessions`; both are indifferent to how Tovu manages a resumed CLI session. The
one real architectural point: if Tovu ever abandoned CLI-session-resume for a subset of runs (sent
full transcript per call instead of trusting external resume), this whole bug class would
disappear structurally for those runs — but that's a design choice Tovu can make today, with or
without AI SDK; AI SDK does not provide it, it's just what "stateless model call, full history
sent every turn" implies as a byproduct.

**Defect 2/3 — failed run persists an empty assistant turn; next turn is fed a placeholder
instead of the real user text.**
Verified: position 3 and position 6 in `ai_chat_messages` are `role='assistant'`,
`content` length 0, `run_status='failed'`. Position 5's real user text ("why are you talking all
fucking daay") does not appear in either CLI transcript file — consistent with a run that failed
140ms after start, before the CLI ever read its prompt. **The brief's exact string "Continue from
where you left off." was searched for verbatim across both `/Users/la/Programming/Tovu` and
`/Users/la/Programming/Jini` (excluding `dist/`, `node_modules/`) and found nowhere — mark that
specific claim unverified/likely an inexact paraphrase.** The empty-content-on-failure pattern
itself, however, is directly confirmed in the data.
*Fix scope: Tovu's own run-lifecycle→message-persistence bridge in
`agent-daemon-server.ts`/wherever `ai_chat_messages` rows get written from run events — decide not
to write a placeholder assistant row on failure, and don't discard the user's real text.* AI SDK's
`onFinish`/`onError`-gated persistence convention (Section 1) is a better default IDIOM for this
exact class of bug, but adopting the idiom requires no library — Tovu can apply "only persist on
confirmed success, never a placeholder on failure" to its existing SQLite writes today.

**Defect 4 — "chats dying," bad streaming.**
Verified, and stronger than the brief states: `daemon-supervisor.ts:217-219`'s own comment, dated
to a "2026-09-06 chat-death investigation," reads: *"A daemon respawn kills every run in flight,
and a run killed that way looks — in `chat.db` and in the pane — exactly like a chat that 'just
stopped answering'."* This is not dev-only noise: it's a structural property of the daemon
supervisor — `killCurrentChild` process-group-kills the daemon (`daemon-supervisor.ts:254-266`,
`process.kill(-pid, "SIGTERM")`), and since the daemon "owns the FULL `@jini-ai/*` kernel for a
run's whole lifetime" in-process (`agent-daemon-server.ts:4-5` — `RunLifecycle` + `EventLog` +
`AgentExecutor`), any daemon exit takes every live CLI child and its in-memory run state with it,
with nothing durable to resume from. In dev, `tsx watch` triggers this on every save under
`apps/website/src` (confirmed comment at `daemon-supervisor.ts:221-223`); in production the
trigger would be a crash, OOM, or deploy restart instead — same structural gap either way,
severity unverified in production specifically.
*Fix scope: this is a durability gap below the chat-UI layer entirely — it lives in how the daemon
supervises its own child processes and whether run state survives a daemon restart (detach CLI
children from the daemon's process group, or checkpoint/resume run state). Neither AI SDK nor
assistant-ui reaches this layer.* AI SDK's resumable-stream feature (Section 1) solves a related
but different problem — a client reconnecting to a stream whose generation is still running
server-side — and explicitly requires the app to wire its own persistence backing store (Redis,
etc. — WebSearch, 2026-09-11); it does not solve "the server-side generation process itself died."
Swapping to AI SDK would not fix this defect; it would just relocate the same durability problem
into a differently-shaped custom provider.

**Net:** of the four defects, three are Tovu-code bugs fixable today without touching either
library; one (Defect 4, the most user-visible) requires infrastructure work neither library
provides. **Migrating to Vercel AI SDK + assistant-ui fixes zero of the four defects directly.**
The best each library offers is a better-factored place to redo the same fixes (assistant-ui's
runtime/persistence conventions), not a fix in itself.

---

## 3. Feasibility

### Load-bearing, hard to move

- **The CLI-subprocess agentic core** (`@jini-ai/agent-runtime`'s 24 `AGENT_DEFS`,
  `@jini-ai/daemon`'s `RunLifecycle`/`AgentExecutor`/`ToolRegistry`, the daemon process itself).
  This is the actual product differentiator (multi-CLI support, skills, sub-agents inherited free
  from each CLI vendor) and has no equivalent in AI SDK. Replacing it with an in-process AI SDK
  model loop means rebuilding tool execution, skills, and sub-agent orchestration from scratch for
  every provider Tovu wants to keep supporting — a different, much larger project than "swap the
  chat SDK."
- **The MCP-UI surface system** (`packages/ui/src/features/mcp-ui/*`, `McpUiHost.tsx`, the
  `surfaces/` DSL). Not a rewrite to move to assistant-ui: assistant-ui's Tool UI contract is "a
  React component per tool," so `McpUiHost.tsx` (or a thin wrapper around it) can plug in directly
  as the tool's render component. Real work is the *glue* (mapping assistant-ui's tool-call
  message part into `McpUiHost`'s existing props/message-source contract), not reimplementing the
  sandboxed iframe host, the escape-hatch, or the surfaces DSL. Rough cost: days, not weeks,
  assuming `McpUiHost`'s props are already decoupled from Jini's own chat-pane wiring (unverified
  — would need to read `McpUiHost.tsx` and `host-message-source.ts` in full to confirm).
- **Per-workspace tool/write-grant allowlists and agent-plugin activation state** — Tovu-owned,
  survives any UI/SDK swap unchanged since neither library has an opinion here.
- **The daemon process boundary and its auth model** (`daemon-auth.ts`, bearer token, principal
  propagation) — infrastructure, untouched by a UI swap.

### Could be swapped incrementally

- **The chat UI layer alone** (`packages/chat`, ~17,400 lines across 102 files per
  `find ... | xargs wc -l`, Apache-2.0, React 18/19 peer dep) and
  `apps/admin/src/components/AssistantDock/` (~1,880 lines, 9 files) could be replaced by
  assistant-ui wired via a custom `ExternalStoreRuntime`/`ChatModelAdapter` directly onto Tovu's
  existing SSE stream (`server/modules/assistant.ts`'s proxy) — **without touching Vercel AI SDK
  at all**, since assistant-ui doesn't require it. This is the one piece of the proposal that is
  genuinely low-risk and separable from the CLI/daemon architecture question.
- Vercel AI SDK's persistence/message conventions could inform a Tovu-authored fix to Defect 2/3
  without adopting the package — copy the idiom, not the dependency.

### What it costs, roughly

- **Full swap (AI SDK for the model/transport layer + assistant-ui for UI):** large and, per
  Section 1, architecturally incoherent as long as Tovu wants to keep the CLI-subprocess model —
  you'd end up writing a custom AI SDK provider per CLI that just proxies CLI stdout into AI SDK's
  stream-part shape, gaining none of AI SDK's actual model-call/tool-loop machinery (the CLI
  already owns that) while taking on a new abstraction layer to maintain. Not recommended.
- **UI-only swap (assistant-ui replacing `packages/chat` + `AssistantDock`, backend unchanged):**
  moderate — bounded by ~19,000 lines of existing UI code to replace/retire and the MCP-UI glue
  work above, but self-contained and reversible (can run alongside the existing UI during
  transition, per-workspace or per-flag). This is the piece worth prototyping if the owner wants
  concrete evidence before committing further.
- **Fixing the four defects directly, no library swap:** small-to-medium, bounded, and addresses
  the actual pain reported today faster than any migration would. Defects 1-3 are
  contained-scope bugs in `agent-session-store.ts`/`agent-daemon-server.ts`'s persistence path;
  Defect 4 needs a real design decision (process-group detachment for CLI children, or a
  checkpoint/resume mechanism for run state) but is still bounded to the daemon-supervisor layer.

### Recommendation

Fix the four verified defects first — they are Tovu-code bugs, cheap relative to a migration, and
account for essentially all of the reported pain. In parallel or after, if the owner wants a
better chat UI on its own merits (branching, editing, regeneration, a maintained runtime instead
of ~19,000 lines of hand-rolled dock/chat components), prototype assistant-ui as a UI-only swap
wired directly onto the existing SSE stream — not through Vercel AI SDK, and not as a reason to
touch the CLI-subprocess/daemon architecture. Do not adopt Vercel AI SDK for the model/transport
layer while the multi-CLI/skills/plugin architecture is a requirement; the two are not a good fit,
and nothing in this recon suggests AI SDK would fix a defect that today's code doesn't already fix
better and cheaper on its own.

---

## Unexamined / explicitly unverified

- Root cause of *why* turn 0's session id (`56bfd415`) was never persisted to
  `assistant_agent_sessions` — traced the symptom (schema + upsert semantics), not the specific
  code path that failed to call `setSessionId` for that particular run. Would need to read
  `onStarted`'s full body (`agent-daemon-server.ts:700-985`) against the H1/H2 fixes already
  documented in `agent-session-resume.ts` to confirm whether this is a third, undocumented bug or
  a gap in those two fixes' coverage.
- `McpUiHost.tsx` / `host-message-source.ts` were located and their existence/scope confirmed, but
  not read in full — the "days not weeks" glue estimate for wiring them into assistant-ui's Tool
  UI contract is a rough call, not verified against their actual prop/message-source shape.
- Production-specific severity of Defect 4 (daemon respawn triggers other than `tsx watch` — crash
  loops, OOM, deploy restarts) was not checked against any production incident log; only the dev-
  trigger and the supervisor's own general "any respawn kills every in-flight run" comment were
  verified.
- assistant-ui's exact bundle-size/dependency-tree weight was not obtained (npm search didn't
  surface it); only license (MIT, AgentbaseAI Inc.) and current version (`@assistant-ui/react`
  0.15.18) were confirmed.
- Did not verify how many of the 24 `AGENT_DEFS` are actually reachable/tested end-to-end from
  Tovu today (vs. defined in Jini but unused) — `assistant/agents.ts`'s `probeAssistantAgents` was
  identified as the relevant probe but not read.
