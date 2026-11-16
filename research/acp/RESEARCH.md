# ACP for Jini's agent adapters: research (2026-11-16)

Docs only. Bases: Jini `integ/wave-b-r2` @ `02edbb68`, Tovu `plan/terra-2026-11-15`.
All external sources were checked on **2026-11-16**. Most were read from a git clone of the
source repository at the commit given, not from a rendered web page.

**Network limit of this run.** Vendor documentation hosts (`opencode.ai`, `geminicli.com`,
`cursor.com`) are outside this session's allowed network. Where a vendor keeps its docs in a
public git repository I read them there. Where it does not (Cursor, Antigravity, Qoder, Droid,
Grok Build, CodeBuddy), the only primary source I could reach is the vendor's own entry in the
ACP registry. Those rows are marked **registry only** and their feature coverage is **unverified**.

**Nothing was run.** No CLI and no adapter was started. Every claim about what an agent does over
ACP comes from its docs or source, not from a live handshake.

---

## 1. The one-line finding

**Jini already has the ACP client the owner is asking for.** `packages/agent-runtime/src/agent-protocol/acp/`
is 3,249 lines of client code with 4,637 lines of tests, and **12 of Jini's 28 CLI defs already run
through it** (`streamFormat: 'acp-json-rpc'`). So the question is not "should Jini build an ACP
client" but "should the other 16 CLIs move onto the one it has, and is that client good enough".

Of the 16 that do not use ACP today, **12 have an ACP route** listed in the official ACP registry
and **4 have none**. Details in §4 and `CLI-MATRIX.tsv`.

---

## 2. What ACP is today

Source for this whole section: `github.com/agentclientprotocol/agent-client-protocol` @ `4aab69b`
(commit of 2026-11-16), files named per row.

### 2.1 Version and maturity

| Fact | Value | Source file |
|---|---|---|
| Wire protocol version | **1** (an integer, negotiated in `initialize`) | `schema/v1/meta.json` (`"version": 1`) |
| Latest spec release | **v1.18.0**, 2026-11-14 | `CHANGELOG.md` |
| Release pace | v1.15.0 (10-31), v1.15.1 (11-02), v1.16.0 (11-09), v1.17.0 (11-10), v1.18.0 (11-14) | `CHANGELOG.md` |
| What those releases change | almost only `unstable` and `unstable-v2` additions; v1.16.0 stabilised the client system prompt | `CHANGELOG.md` |
| v2 | **Draft**, published 2026-07-20. Breaking. "v2 as a whole is still labeled draft, so gate v2 support behind explicit version negotiation and feature flags until it stabilizes." | `docs/announcements/acp-v2-draft.mdx`, `docs/protocol/v2/migration.mdx` |
| SDKs | Rust and TypeScript reached 1.0.0 on 2026-06-25; Kotlin, Java, Python also maintained | `docs/announcements/sdk-1-0-releases.mdx`, `MAINTAINERS.md` |
| TypeScript SDK in use by adapters today | `@agentclientprotocol/sdk` 2.7.0 (Claude adapter), ~2.6.0 (Codex adapter) | their `package.json` (see §4) |

The release number (1.18.0) is the schema's release, not the wire version. The wire version has
stayed 1; features are added behind capabilities, so an old client keeps working.

### 2.2 Governance

- "ACP is jointly governed by Zed and JetBrains", under an **interim** model, "working toward
  transitioning to an independent foundation" (`docs/community/governance.mdx`).
- Two lead maintainers: Ben Brandt (Zed) and Sergey Ignatov (JetBrains). Four core maintainers.
  List last updated 2026-06-01 (`MAINTAINERS.md`).
- Changes go through an RFD process (`docs/rfds/`): Draft, Preview, Completed. 20 features carry a
  "stabilized" announcement (`docs/announcements/`).
- A registry of agents was stabilised 2026-03-09 (`docs/announcements/acp-agent-registry-stabilized.mdx`).
  At `github.com/agentclientprotocol/registry` @ `131167e` (2026-11-16) it holds **47 agent
  entries**; 5 of them are quarantined for breakage (`quarantine.json`).

Reading: the protocol is past the experiment stage (two editor vendors, model vendors named as
authors of the Claude and Codex adapters, 47 agents), but it is not under a neutral foundation yet
and it has a breaking v2 in draft.

### 2.3 Transport

`docs/protocol/v1/transports.mdx`: JSON-RPC 2.0, UTF-8. One defined transport, **stdio**: the client
starts the agent as a child process; messages are newline-delimited and must not contain embedded
newlines; the agent may log to stderr; nothing but ACP messages may go on stdout. A remote
transport (Streamable HTTP / WebSocket) is an RFD, not stable. Custom transports are allowed.

### 2.4 Stable v1 methods

From `schema/v1/meta.json`:

| Direction | Methods |
|---|---|
| Client calls agent | `initialize`, `authenticate`, `logout`, `session/new`, `session/load`, `session/resume`, `session/close`, `session/list`, `session/delete`, `session/set_mode`, `session/set_config_option`, `session/prompt`, `session/cancel` |
| Agent calls client | `session/update` (notification), `session/request_permission`, `fs/read_text_file`, `fs/write_text_file`, `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release`, `elicitation/create`, `elicitation/complete` |
| Either | `$/cancel_request` |

Unstable in v1 (`schema/v1/meta.unstable.json`): `providers/*`, `mcp/message`, `session/fork`,
`session/archive`, `session/unarchive`, `session/status`, `session/options`, `session/set_title`,
`auth/status`, `auth/status_update`, `proxy/initialize`, `proxy/successor`.

### 2.5 What each area covers (mapped to what Jini needs)

| Jini need | ACP v1 answer | Status | Source |
|---|---|---|---|
| Streaming text | `session/update` with `agent_message_chunk`; reasoning as `agent_thought_chunk` | stable | `docs/protocol/v1/prompt-turn.mdx` |
| Tool calls | `tool_call` then `tool_call_update`; `kind` (`read`, `edit`, `execute`, `fetch`, and others), `status` (`pending`, `in_progress`, completed, failed), `rawInput`, `rawOutput`, `locations`, content of type text, `diff`, or terminal | stable | `docs/protocol/v1/tool-calls.mdx` |
| Permission prompts | agent calls `session/request_permission` with options of kind `allow_once`, `allow_always`, `reject_once`, `reject_always`; client answers `selected` or `cancelled`. **"The Agent owns remembered decisions"**: an `allow_always` is stored and scoped by the agent, not the client | stable | `docs/protocol/v1/tool-calls.mdx` |
| MCP server injection | `mcpServers` on `session/new`, `session/load`, `session/resume`. "All Agents MUST support the stdio transport"; HTTP and SSE are optional and advertised in `mcpCapabilities` | stable | `docs/protocol/v1/session-setup.mdx` |
| File edits | reported as tool calls with `diff` content. Separately the client may *offer* `fs/read_text_file` and `fs/write_text_file` so the agent reads and writes through the client | stable in v1, **removed in v2** | `docs/protocol/v1/file-system.mdx`, `docs/protocol/v2/migration.mdx` |
| Terminals | client may offer `terminal/*` so commands run in the client | stable in v1, **removed in v2** | same |
| Sessions and resume | `session/load` replays history (needs `loadSession`); `session/resume` restores without replay (needs `sessionCapabilities.resume`; stable since 2026-04-22); `session/close`, `session/list`, `session/delete` | stable | `docs/protocol/v1/session-setup.mdx`, `docs/announcements/session-resume-stabilized.mdx` |
| Model selection | **session config options**: the agent lists options (category `model`, `model_config`, `thought_level`, `mode`), the client calls `session/set_config_option` | stable | `docs/protocol/v1/session-config-options.mdx`, `docs/announcements/model-config-category-stabilized.mdx` |
| Model selection, old way | `session/set_model` was **never stabilised and was removed from the protocol artifacts on 2026-06-01**. "Agents should continue to expose model selection through Session Config Options." | removed | `docs/rfds/updates.mdx` (entry "Unstable Session Model API removed") |
| Cost and usage | `usage_update` session notification: context tokens used, context window size, optional **cumulative session cost**. Stable since 2026-06-05 | stable | `docs/announcements/session-usage-stabilized.mdx` |
| Per-turn token usage in the prompt result | RFD `end-turn-token-usage` exists; I did not read its status | **unverified** | `docs/rfds/end-turn-token-usage.mdx` |
| Images | `promptCapabilities.image` allows image content blocks in the prompt; `audio` and `embeddedContext` likewise; `resource_link` is the baseline | stable | `docs/protocol/v1/initialization.mdx`, `content.mdx` |
| Cancellation | `session/cancel` notification; the prompt then ends with `stopReason: "cancelled"`. The client "MUST respond to all pending `session/request_permission` requests with the `cancelled` outcome". `$/cancel_request` cancels one request | stable | `docs/protocol/v1/prompt-turn.mdx`, `cancellation.mdx` |
| Stop reasons | `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled` | stable | `docs/protocol/v1/prompt-turn.mdx` |
| System prompt from the client | `systemPrompt` on session setup, when the agent advertises `sessionCapabilities.systemPrompt`. Text blocks only. Stable since 2026-11-06 (v1.16.0) | stable, **ten days old** | `docs/announcements/client-system-prompt-stabilized.mdx` |
| Extra readable folders | `additionalDirectories` on session setup, when advertised. Stable since 2026-06-01 | stable | `docs/announcements/additional-directories-stabilized.mdx` |
| Login | `authenticate` with a method from `authMethods`; `logout`; error `auth_required` | stable | `docs/protocol/v1/authentication.mdx` |
| Asking the user a question | `elicitation/create` | stable | `docs/announcements/elicitation-stabilized.mdx` |
| Vendor extras | `_meta` on every object; method names starting with `_`; custom capabilities | stable | `docs/protocol/v1/extensibility.mdx` |
| Tools served over the ACP pipe itself | RFD "MCP-over-ACP": an MCP server of `"type": "acp"`, requests sent as `mcp/message` | **unstable draft** | `docs/rfds/mcp-over-acp.mdx` |

### 2.6 What v2 will change (so the design does not paint Jini into a corner)

From `docs/protocol/v2/migration.mdx`:

1. `fs/*` and `terminal/*` client methods are **removed**. "Use client-provided MCP servers when the Agent needs Client-side tools."
2. `session/load` is removed; `session/resume` with `replayFrom` replaces it.
3. `session/set_mode` is removed; modes become config options.
4. The `session/prompt` response no longer ends the turn; completion arrives as a `state_update`.
5. `tool_call` is removed; the first `tool_call_update` creates the call.
6. `authenticate` becomes `auth/login`.
7. "Migrating does not mean dropping v1 ... implementers should support both versions side by side."

Points 1 and 2 matter now: Jini's client already offers no `fs` or `terminal` capability (good, that
is where v2 goes), but it resumes with `session/load` (the method v2 drops).

---

## 3. What Jini has today (verified in code @ `02edbb68`)

### 3.1 The ACP client

`packages/agent-runtime/src/agent-protocol/acp/` (see its `README.md`, one level up):

| File | Lines | Job |
|---|---:|---|
| `session.ts` | 1,608 | `attachAcpSession`: handshake, model switch, prompt, updates, permission replies, cancel |
| `models.ts` | 439 | `detectAcpModels`, `normalizeModels` (a short-lived probe session to list models) |
| `text-suppression.ts` | 293 | hides artifact/tool-call text echoed by one vendor's agent |
| `updates.ts` | 287 | parses `session/update` payloads; vendor retry/stderr promotion |
| `rpc.ts` | 177 | send helpers, error shapes, `formatUsage`, default permission decision |
| `json.ts` | 167 | JSON helpers, `resolveAcpTimeoutMs` |
| `session-params.ts` | 115 | `buildAcpSessionNewParams` (`AcpMcpServerInput`, env as array or map), `buildPromptBlocks` |
| `account-failure.ts` | 67 | `AccountFailureClassifier` port and no-op default |
| `constants.ts`, `types.ts`, `index.ts` | 96 | protocol version 1, timeouts |

What it does on the wire (`session.ts`, line numbers at `02edbb68`):

- `initialize` with `protocolVersion: 1` and `clientCapabilities: { terminal: false }`, no `fs` (`:1527-1530`).
- `session/new`, or `session/load` when `resumeSessionId` is set (`:760-785`).
- Model: `session/set_config_option` when the agent listed a model config option, else `session/set_model` (`:803`).
- `session/prompt` with a text block plus one `resource_link` per image path (`session-params.ts:105-113`).
- `session/update`: handles `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `current_model_update` (`:701-757`).
- `session/request_permission`: an injected `onPermissionRequest` handler decides; with no handler, `bypass` allows once and anything else rejects; a handler that throws or picks an option that was not offered cancels (`:1395-1445`).
- `session/cancel` on abort (`:1554`).
- Usage: read from the `session/prompt` **result** (`:867`, `:1356`).
- A silence watchdog per stage, 10 minutes by default, paused while a permission question is open.

The daemon side is `wireAcpLifecycle` in `packages/daemon/src/agent-executor/events.ts:1018-1112`:
one child process per run, one prompt, events translated by `translateAgentRuntimeEvent`, MCP servers
passed as `mcpServers` (delivery kind `'acp-merge'`), success decided by the controller's
clean-prompt signal.

### 3.2 Gaps between that client and the spec as of today

Each row was checked by reading or grepping the files above. "Absent" means the string does not
occur in `acp/session.ts`, `updates.ts` or `rpc.ts`.

| # | Gap | Evidence | Why it matters |
|---|---|---|---|
| G1 | `usage_update` is not handled | absent | cost and context size reported during a session are dropped; only the end-of-prompt `usage` is read |
| G2 | `session/set_model` is still the fallback | `session.ts:803` | removed from the spec 2026-06-01; an agent that follows the spec and offers no model config option gets a method it may not know. The code does recover from the error (`recoverFromModelSelectionError`), so today this is a wasted round trip, not a failure |
| G3 | Resume always uses `session/load`, and I found no check of `loadSession` before sending it | `session.ts:760-785` | the spec says the client MUST check the capability; `session/resume` (stable, no replay) is never used; v2 removes `session/load` |
| G4 | `authenticate` is never sent | absent | an agent that answers `auth_required` fails the run with a generic error instead of a typed "log in first" |
| G5 | `systemPrompt` and `additionalDirectories` are not sent | absent | Jini still needs per-CLI overlay tricks (`append-flag`, `env-var`, `config-instructions-file`) and `--add-dir` argv for things ACP now carries |
| G6 | Images always go as `resource_link` | `session-params.ts:105-113` | fine for agents that read the path; agents that advertise `promptCapabilities.image` could take the bytes |
| G7 | Vendor code inside the shared client | `AMR_STDERR_RETRY_TAIL_LIMIT`, `promotedAmrStderrPayload`, `modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE'`, DSML artifact suppression in `session.ts`/`updates.ts`/`constants.ts` | owner practice 7 (vendor code in its own folder). Every new ACP CLI pays for one vendor's quirks |
| G8 | Size | `session.ts` 1,608 lines; `attachAcpSession` runs from `:1007` to the end | owner practice 3. Size-design 10 mentions an `AcpRun` context refactor on another branch; I did not verify that branch |
| G9 | What happens to an agent request the client does not know (for example `elicitation/create`) | falls to `routeResultById` (`:1504`); I did not trace whether an error reply is sent | **unverified**. If nothing is sent, the agent waits until the watchdog fires |

None of these stops the 12 CLIs that work today. All of them get more expensive as more CLIs are added.

### 3.3 The CLIs that do not use ACP

`defs/index.ts` exports 28 defs. By `streamFormat`:

| Format | Count | Defs |
|---|---:|---|
| `acp-json-rpc` | 12 | amr, auggie, cline, devin, goose, hermes, kilo, kimi, kiro, reasonix, trae-cli, vibe |
| `claude-stream-json` | 3 | claude, amp, codebuddy |
| `json-event-stream` | 5 | codex, opencode, mimo, cursor-agent, antigravity |
| `qoder-stream-json` | 1 | qoder |
| `pi-rpc` | 1 | pi |
| `plain` | 6 | aider, crush, deepseek, droid, grok-build, qwen |

There is **no `gemini` def**. `defs/gemini/event-stream.ts` (205 lines) is a parser, and
`daemon/src/agent-executor/gemini/tool-calls.ts` (7 lines) adapts tool receipts for a stream kind
named `legacy-google-stream-json`. Google's CLI in Jini is `antigravity` (binary `agy`). I did not
trace which def feeds the gemini parser (**unverified**).

Per-CLI code, counted with `wc -l`, tests excluded:

| CLI | `agent-runtime/src/defs/<cli>*` | `daemon/src/agent-executor/<cli>/` | Per-vendor files outside those folders |
|---|---:|---:|---|
| codex | 1,038 | 609 | none |
| claude | 398 | 445 | `claude-stream.ts` 971, `claude-filesystem-policy.ts` 243, `claude-segment-usage.ts` 101, `claude-code-models.ts` 327 |
| antigravity (+ gemini parser) | 519 + 205 | 68 + 7 | none |
| opencode | 254 | 136 | `opencode-log.ts` 185 |
| cursor-agent | 268 | 0 | none |
| pi | 136 | 7 | `agent-protocol/pi-rpc/` 795, `pi-models.ts` 53 |
| qoder | 80 | 0 | `qoder-stream.ts` 201 |
| codebuddy, grok-build, amp, qwen, droid | 132, 124, 78, 55, 49 | 0 | share `claude-stream.ts` (amp, codebuddy) |
| aider, deepseek, crush, mimo | 95, 95, 49, 38 | 0 | mimo shares opencode's parser |
| the 12 ACP defs together | 811 (373 of it amr) | 1 | none |

All 28 defs plus their daemon folders: **5,698 lines**. The six daemon folders the task names:
**1,272 lines** (matches the "~1.3k" in the brief). `http/xai.ts` is 802 lines and is not an agent
CLI adapter (it is an HTTP model proxy); ACP does not touch it.

---

## 4. Each CLI and ACP

Full table with one row per def: `CLI-MATRIX.tsv`. Summary:

| Group | Count | CLIs |
|---|---:|---|
| **Already ACP in Jini** | 12 | amr, auggie, cline, devin, goose, hermes, kilo, kimi, kiro, reasonix, trae-cli, vibe |
| **ACP built into the CLI**, Jini uses another format | 7 | opencode (`opencode acp`), cursor-agent (`cursor-agent acp`), qoder (`qodercli --acp`), qwen (`qwen --acp`), droid (`droid exec --output-format acp-daemon`), grok-build (`grok agent stdio`), codebuddy (`codebuddy --acp`) |
| **ACP through a separate program from the vendor** | 3 | claude (`claude-agent-acp`), codex (`codex-acp`), antigravity (`agy_acp_server.par`) |
| **ACP through a community adapter** | 2 | pi (`pi-acp`), amp (`amp-acp`) |
| **No ACP route found** | 4 | aider, crush, deepseek, mimo |

Launch commands and versions are from each agent's `agent.json` in the registry @ `131167e`.

### 4.1 Claude Code

- **Not in the `claude` binary.** The route is `@agentclientprotocol/claude-agent-acp`, registry
  version 0.107.2 (repo `package.json` says 0.107.3 @ `0073280`, 2026-11-16). Registry authors:
  Anthropic, Zed Industries, JetBrains. Apache-2.0. Built on `@anthropic-ai/claude-agent-sdk` 0.3.325.
  It then runs the Claude CLI itself (bundled, or `CLAUDE_CODE_EXECUTABLE`).
- README feature list: images, tool calls with permission requests, edit review, TODO lists,
  subagent transcripts, terminals, slash commands, **client MCP servers**, config options.
  Advertises `loadSession: true` and `sessionCapabilities.resume` (`src/v1/acp-agent.ts:1812-1859`).
  Sends `usage_update` with a `cost` (`:5789-5797`). Also serves draft v2.
- **Passing Claude options through.** `session/new` accepts `_meta.claudeCode.options`, forwarded to
  the SDK. `cwd`, `permissionMode`, `canUseTool`, `executable` are managed by the adapter;
  `hooks`, `mcpServers`, `disallowedTools` are merged; `tools` passes through
  (`src/new-session-meta.ts:11-40`).
- **Isolation fact that matters.** The adapter starts the SDK with
  `settingSources: ["user", "project", "local"]` by default (`src/v1/acp-agent.ts:10040`), and
  resolves the config directory as `CLAUDE_CONFIG_DIR` or `~/.claude` (`src/paths.ts:6`). The
  client's options are spread after the default, so they can override it. So Jini's staged
  `CLAUDE_CONFIG_DIR` (the fix for SEC-assistant-env-isolation-2026-09-07 finding 1,
  `daemon/src/agent-executor/claude/contracts.ts:1-10`) **is still needed** with the adapter.
- Mid-turn input ("steering") exists as an extension, v1 only.
- Not verified: that the adapter reproduces Jini's background-task hold, delegated-result
  correlation, segment usage basis, or the subagent-start hook. These live in Jini's Claude stream
  path today (`events.ts:563-570`, `:383`; `claude-segment-usage.ts`; `claude/subagent-start.ts`).

### 4.2 Codex

- **Not in the `codex` binary as an ACP mode** (none listed). The route is
  `@agentclientprotocol/codex-acp` 2.6.0 @ `6567651` (2026-11-12). Registry authors: OpenAI,
  JetBrains, Zed Industries. Apache-2.0. Depends on `@openai/codex` ^0.166.0. "It starts the Codex
  App Server, translates ACP requests into Codex operations."
- README: model, reasoning effort, approval and sandbox mode selection; text, images, resource
  links, additional directories; shell, file change, permission, MCP tool call, token usage events;
  **client MCP servers over stdio and HTTP**; mid-turn input through a `_session/steering` extension.
- Options through env: `CODEX_PATH`, `CODEX_CONFIG` (JSON merged into the session config),
  `INITIAL_AGENT_MODE` (`read-only`, `workspace-write`, `agent`, `agent-full-access`).
- **Isolation fact.** It reads and watches `CODEX_HOME` (`src/CodexHomeWatcher.ts`). Jini's staged
  `CODEX_HOME` (`codex/home-staging.ts`, 264 lines) and its "personal MCP off" refusal
  (`codex/isolation.ts`, 67 lines) **are still needed**.

### 4.3 Gemini CLI and Antigravity

- Gemini CLI: `gemini --acp`, registry version 0.68.0. Docs in the repo
  (`github.com/google-gemini/gemini-cli` @ `4fa64e7`, `docs/cli/acp-mode.md`): `initialize`,
  `authenticate`, `newSession`, `loadSession`, `prompt`, `cancel`, `setSessionMode`,
  `unstable_setSessionModel`; a file-system proxy through the client; client MCP servers; permission
  requests carry `toolCall._meta['gemini-cli'].mcp` with the server and tool name. Note it still
  documents the model call the spec removed (G2 above applies in reverse: Jini's fallback is what
  Gemini wants).
- Antigravity: registry entry `antigravity-acp` 1.5.0, author "Google LLC", proprietary, a separate
  binary `agy_acp_server.par`. **Registry only; coverage unverified.** Jini's antigravity def is the
  most hand-fitted one (369 lines, a model lock, a settings-file permission writer under a file
  lock, MCP by env passthrough), so parity here is the least certain of all.

### 4.4 OpenCode

- Built in: `opencode acp`, registry version 2.3.0. (Jini's def uses the binary name `opencode-cli`.)
- Docs in the repo (`github.com/anomalyco/opencode` @ `0ac0d7e`,
  `services/site/src/docs/content/cli/acp.mdx`), which has a section written for client authors:
  protocol version 1; `loadSession: true`; `mcpCapabilities: { http: true, sse: false }`;
  `promptCapabilities: { embeddedContext: true, image: true }`; session capabilities
  `additionalDirectories`, `close`, `delete`, `fork`, `list`, `resume`; config options `model`
  (`provider/model`), `effort`, `mode`; "One process can serve many ACP sessions"; a session runs one
  prompt at a time; cancel rejects pending permission requests.
- This is the best-documented target and the cleanest fit: MCP by `session/new` replaces Jini's
  `OPENCODE_CONFIG_CONTENT` merge (`daemon/.../opencode/mcp-config.ts`, 126 lines).

### 4.5 Pi

- Pi itself speaks its own RPC (`pi --mode rpc`), which Jini already drives
  (`agent-protocol/pi-rpc/`, 795 lines).
- ACP route: community adapter `pi-acp` 0.0.34 (MIT, one author) @ `04d0a15` (2026-10-05). Its README
  calls itself "MVP-style" and lists under Limitations that MCP servers are "accepted in ACP params
  ... but not wired through to pi". It wraps the same `pi --mode rpc` Jini already speaks.
- A discussion on native support exists (`github.com/earendil-works/pi/discussions/4444`); I did not
  read it (**unverified**).
- Moving pi to ACP would put a third-party MVP between Jini and an RPC Jini already handles. No gain.

### 4.6 The rest

- cursor-agent, qoder, droid, grok-build, codebuddy: ACP mode is in the vendor's own registry entry.
  **Registry only; coverage unverified.**
- qwen: `qwen --acp --experimental-skills`, 0.27.4, Apache-2.0, a Gemini CLI fork. Jini runs it as
  `plain` text today (no tool events, no permissions), so ACP would be a functional gain, not only a
  saving.
- amp: community `amp-acp` 0.13.0 @ `6d5b506` (2026-11-15). README: MCP passthrough, session
  load/resume, `usage_update`. One maintainer.
- aider: third-party articles from 2025-10 and 2026-03 say an implementation is "in progress"; no
  registry entry. **Unverified.**
- crush: an `acp` branch with a `crush acp` command exists on a mirror; no registry entry; I could
  not confirm it is released. **Unverified.**
- deepseek, mimo: nothing found.

### 4.7 Drift in the 12 defs that already use ACP

Comparing Jini's launch arguments with the registry:

| Def | Jini launches | Registry says | Note |
|---|---|---|---|
| kiro | `kiro-cli acp` | `kiro-cli acp --agent-engine=v3` (3.0.0) | flag missing in Jini; effect unverified |
| kimi | `kimi acp` | that is "Kimi CLI (Legacy)" 1.52.0; the current product is "Kimi Code", `@moonshot-ai/kimi-code acp` 2.6.2 | Jini targets the legacy CLI |
| vibe, cline, auggie, goose, kilo, devin | match | match | |
| hermes, reasonix, trae-cli, amr | — | not in the registry | Jini's own knowledge is the only source |

---

## 5. What ACP does not solve for Jini

1. **Isolation of the operator's own config.** Every adapter still runs the vendor's engine, which
   reads the vendor's home directory. Staged homes and config dirs stay per-CLI work.
2. **Tool policy.** ACP has no standard "disable these built-in tools" field. Each agent takes it its
   own way (`_meta.claudeCode.options.disallowedTools`, `INITIAL_AGENT_MODE`, a `mode` config option).
   ACP gives one standard gate, the permission request, and Jini already has it.
3. **Launch.** Finding the binary, the version probe, auth detection, env building: unchanged.
4. **The four CLIs with no ACP**, and pi. As long as one of them stays, Jini keeps its plain and
   JSON-stream child path (`wireChildLifecycle`, `events.ts:470-950`).
5. **Model lists before a session exists.** ACP lists models as session config options, so Jini's
   `detectAcpModels` has to open a throwaway session (it does this today).

---

## 6. Everything marked unverified, in one place

1. Feature coverage of cursor-agent, qoder, droid, grok-build, codebuddy, antigravity over ACP (registry entry only).
2. Parity of the Claude adapter with Jini's background-task hold, delegated-result correlation, segment usage and subagent-start hook.
3. Startup time and memory of the adapter processes (nothing was run).
4. G9: how Jini's client answers an unknown agent request.
5. Whether `session/load` is sent without a capability check in every path (G3 was read at the send site only).
6. Status of the `end-turn-token-usage` RFD.
7. Which def feeds `defs/gemini/event-stream.ts`.
8. aider, crush and native pi ACP status.
9. The `AcpRun` refactor branch named in size-design 10.
10. The brief says `LESSONS-FOR-DESIGN-BRIEFS.md` has 22 rules; the file at `origin/plan/size-designs-2026-11-16` has **11**. I applied those 11.

## 7. Sources

| What | Where | Commit / version | Checked |
|---|---|---|---|
| ACP spec, schema, changelog, governance, RFDs | https://github.com/agentclientprotocol/agent-client-protocol | `4aab69b`, v1.18.0 | 2026-11-16 |
| ACP registry (agent list, launch commands, versions) | https://github.com/agentclientprotocol/registry | `131167e` | 2026-11-16 |
| Claude adapter | https://github.com/agentclientprotocol/claude-agent-acp | `0073280`, 0.107.3 | 2026-11-16 |
| Codex adapter | https://github.com/agentclientprotocol/codex-acp | `6567651`, 2.6.0 | 2026-11-16 |
| Gemini CLI ACP docs | https://github.com/google-gemini/gemini-cli (`docs/cli/acp-mode.md`) | `4fa64e7` | 2026-11-16 |
| OpenCode ACP docs | https://github.com/anomalyco/opencode (`services/site/src/docs/content/cli/acp.mdx`) | `0ac0d7e` | 2026-11-16 |
| pi adapter | https://github.com/svkozak/pi-acp | `04d0a15`, 0.0.34 | 2026-11-16 |
| amp adapter | https://github.com/tao12345666333/amp-acp | `6d5b506`, 0.13.0 | 2026-11-16 |
| Rendered spec (same content as the repo's `docs/`) | https://agentclientprotocol.com/protocol/v2/migration , https://agentclientprotocol.com/announcements/acp-v2-draft | — | 2026-11-16 (search result only) |
| aider status (secondary) | https://zed.dev/blog/acp-progress-report , https://www.morphllm.com/agent-client-protocol | — | 2026-11-16 (search result only) |
| crush `acp` branch (mirror) | https://git.secluded.site/crush/commits/acp | — | 2026-11-16 (search result only) |
| pi native discussion | https://github.com/earendil-works/pi/discussions/4444 | — | not read |
| Jini code | `leonaburime-ucla` Jini `integ/wave-b-r2` | `02edbb68` | 2026-11-16 |
| R8 runtime design, C6 port sheet | Tovu `origin/plan/daemon-untangle-design-2026-11-16` (`untangle/daemon/R8-RUNTIME.md`), Tovu `plan/terra-2026-11-15` (`untangle/sheets/C6.md`) | — | 2026-11-16 |
