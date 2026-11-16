# ACP for Jini's agent adapters: design and recommendation (2026-11-16)

Docs only. Read `RESEARCH.md` first; this file uses its section and gap numbers (G1–G9).
Bases: Jini `integ/wave-b-r2` @ `02edbb68`; R8 and C6 as cited in `RESEARCH.md` §7.
Personas: software-architect (lead), programmer, security. Skills: hexagonal-architecture,
api-design, architecture-migration. (`interface-design` is a visual-UI skill; nothing here has a UI,
so it was read and not used.)

## 0. Recommendation in five lines

1. **Do not build "one ACP client". Jini has one, and 12 of 28 CLIs already use it.** Finish it and move more CLIs onto it.
2. **Keep a native path.** Four CLIs have no ACP at all, and pi's only ACP route is a hobby adapter over the RPC Jini already speaks. The native launcher and stream path stay.
3. **Move CLI by CLI, each behind a host opt-in**, starting with the seven whose ACP mode is built into the CLI (OpenCode first). Claude and Codex come last, through the vendors' adapters, and only if the owner accepts an extra process on the security path (decision O-2).
4. **Expected saving: about 1,000 lines for the seven built-in ones, 1,700–2,100 more for Claude, Codex and Antigravity**, out of roughly 8,000 lines of adapter code. `launch.ts` and `events.ts` shrink little, because the native path stays.
5. **Lane K should not wait.** More than half of what it moves is still needed under ACP, and ACP profiles need the folder it creates.

---

## 1. Who does what, today and under ACP

"Profile" means a small per-CLI object beside the def (§3.2). "Jini keeps" means the code is the
same for every CLI and stays in daemon or in the ACP client.

| Responsibility | Today (file) | Under ACP |
|---|---|---|
| Find the binary, probe version, detect login | `agent-runtime/src/{executables,detection,auth}.ts`, `defs/<cli>/{executable,auth}.ts` | **stays per CLI.** ACP does not start the process for you |
| Launch arguments | `def.buildArgs`, up to 300 lines for Claude and Codex (`defs/claude.ts:242-310`, `defs/codex.ts`, `defs/codex/launch.ts`) | **ACP replaces most of it.** Arguments shrink to the fixed ACP switch (`acp`, `--acp`). Prompt, images, model, resume, extra folders travel as protocol fields. Prompt-size budgets for argv (`prompt-budget.ts`) stop applying to ACP runs |
| Config and home staging (isolation from the operator's own setup) | `daemon/.../claude/config-dir.ts`, `codex/home-staging.ts`, `codex/isolation.ts`, `claude/filesystem.ts`, `agent-runtime/src/claude-filesystem-policy.ts` | **stays per CLI.** The vendor engine still reads its home. Verified for Claude (`settingSources` default, `CLAUDE_CONFIG_DIR`) and Codex (`CODEX_HOME`); see `RESEARCH.md` §4.1, §4.2 |
| MCP delivery (how the `jini` tool server reaches the CLI) | five mechanisms: `claude-mcp-json`, `codex-toml`, `opencode-env-content`, `mimo-env-content`, `env-passthrough`, plus `acp-merge` (`daemon/.../contracts.ts:498-518`) | **ACP replaces it** with `mcpServers` on `session/new`, which is what `acp-merge` already does. Jini keeps the bridge and the server entry (`mcp-bridge.ts`) |
| Keeping the operator's personal MCP servers out | `codex/isolation.ts`, `inheritUserMcp` in `claude/mcp-config.ts` | **stays per CLI.** ACP adds servers; it has no field to switch the agent's own servers off |
| Permission handling | Claude: `--allowedTools`/permission-mode argv; Antigravity: a settings file written under a lock (`antigravity/permissions.ts`); ACP defs: `onPermissionRequest` | **ACP replaces the gate** with `session/request_permission`, one handler for all. **Stays per CLI:** telling the agent which built-in tools are off, because ACP has no standard field for that |
| Event translation | four parsers (`claude-stream.ts` 971, `defs/codex/event-stream.ts` 379, `qoder-stream.ts` 201, `json-event-stream.ts` 251 plus per-CLI ones) feeding `event-translation.ts` | **ACP replaces the parsers** with the one `session/update` handler. Jini keeps `translateAgentRuntimeEvent` |
| Tool-call receipts (matching a CLI's tool row to the bridge call) | `opencode/tool-calls.ts`, `gemini/tool-calls.ts`, `tool-call-receipts.ts` | **mostly replaced**: ACP tool calls carry `rawInput` and a kind. Naming of MCP tools still differs per agent (Gemini puts it in `_meta`), so a small per-CLI mapper may stay. Unverified per CLI |
| Session coordination and resume | `resumesSessionViaCli` + argv (`-s`, `--resume`), `capturedSessionId` in `events.ts` | **ACP replaces the mechanism** (`session/resume` or `session/load`). Jini keeps the session store and the reseed-on-failure rule |
| Model selection and model receipts | argv flag per CLI; `model-receipts.ts` | **ACP replaces selection** (config options). Jini keeps receipts. Model *listing* stays a probe session |
| Cost and usage | Claude stream totals (`claude-segment-usage.ts`), per-parser usage | **ACP replaces it** with `usage_update` and the prompt result, once G1 is closed. Whether cost matches Jini's "session vs run" cost basis is unverified |
| System prompt overlay | three strategies in `types.ts` (`append-flag`, `env-var`, `config-instructions-file`) plus prompt prefix | **ACP replaces it where the agent advertises `systemPrompt`** (stable ten days). Elsewhere the strategies stay |
| Run lifecycle, event log, cancel and process-tree stop, journal, cleanup | `daemon/src/agent-executor/{launch,events}.ts`, `run-lifecycle` | **Jini keeps.** |
| Tool execution | `ToolExecutor`, reached through the MCP bridge | **Jini keeps, and it stays the only door** (§3.4) |

---

## 2. Options

| Option | Fit | Why |
|---|---|---|
| A. Replace all adapters with ACP in one move | poor | Four CLIs cannot move; Claude parity is unproven; one commit could not be green alone |
| **B. Finish the existing client, add per-CLI profiles, move one CLI at a time behind a host opt-in** | **good** | Reuses 3,249 tested lines; each step is small and reversible; the native path stays as fallback |
| C. Leave it | acceptable short term | Costs nothing now, but every vendor stream-format change keeps landing in Jini, and gaps G1–G5 stay |

B wins on reversibility: a CLI that misbehaves over ACP is switched back by removing its id from one list.

---

## 3. Target shape

### 3.1 Where things live (after lane K)

```
packages/agent-runtime/src/
  agent-protocol/acp/        the one ACP client. No vendor names in it.
    profile.ts               AcpProfile type (below)
    capabilities.ts          pure: initialize result -> AcpAgentCapabilities
  defs/<cli>/
    def.ts (today <cli>.ts)  RuntimeAgentDef: binary, auth, models, native buildArgs
    acp-profile.ts           only for a CLI that can run over ACP
    <staging files>          what lane K moves in (config dir, home, isolation)
    event-stream.ts          only while the CLI's native path is alive
```

A CLI is one folder (owner practices 4 and 7). Deleting a native path later is deleting files in
that folder, not editing shared files.

### 3.2 The profile: only what the def does not already say

The def already carries most ACP differences as data: `buildArgs` (the `acp` switch),
`acpMcpEnvFormat` (`types.ts:675`), `externalMcpInjection: 'acp-merge'`, `imageDelivery`. The profile
adds only the rest. It is data plus pure functions; it does no I/O.

```ts
// packages/agent-runtime/src/agent-protocol/acp/profile.ts
export interface AcpProfile {
  /** How to continue a session. The agent's advertised capability still has to allow it. */
  readonly resume: 'load' | 'resume' | 'none';
  /** 'legacy' = today's behaviour: config option if the agent lists one, else session/set_model. */
  readonly model: 'config-option' | 'legacy' | 'none';
  /** Vendor fields for session/new `_meta` (for example Claude tool policy). Pure. */
  readonly sessionMeta?: (required: { policy: NativeToolPolicyInput }) => Readonly<Record<string, unknown>>;
  /** Vendor text filter for message chunks (today: one vendor's artifact echo). */
  readonly textFilter?: (required: { profile: ExecutionProfile }) => AcpTextFilter;
  /** Vendor reading of stderr and retry notices into a typed account failure. */
  readonly accountFailure?: AccountFailureClassifier;
}
export const DEFAULT_ACP_PROFILE: AcpProfile = { resume: 'load', model: 'legacy' };
```

`RuntimeAgentDef` gains one optional field, `acp?: AcpProfile`. A def without it gets
`DEFAULT_ACP_PROFILE`, which is exactly today's behaviour for the 12 defs. **Prerequisite:** after
C6, `RuntimeAgentDef` is a core contract (`@jini-ai/core/contracts/agents`), so this field and the
`AcpProfile` type are a core change. If C6 has landed, the field goes in through C6's owner; if not,
it is added in `agent-runtime/src/types.ts` and C6's copy list picks it up. **STOP** if neither is
clear at execution time.

### 3.3 Behind the port

Nothing new on `AgentRuntimePort`. `sessions.attachAcp(required, optional?)` (C6 §4) remains the one
ACP entry. The daemon already chooses the path from `def.streamFormat` (`launch.ts:1416`), so a CLI
moves to ACP by the runtime handing the daemon a def whose format is `acp-json-rpc`.

The switch is a host choice, made where the host binds the runtime:

```ts
createAgentRuntimeBindings({ runtime }, { acpPreferred: ['opencode'] })   // default: []
```

`defs.get({ id })` returns the ACP variant of a def when its id is in `acpPreferred` and the def has
one, else the native def. Default empty, so **no host changes behaviour until it opts in**
(practice 10). `createAgentRuntimeBindings` is C6 §11.2 and "not landed"; until it lands the same
option goes on whatever function builds the def registry today (`registry.ts`). The lookup exists
(`registry.ts:94`, `getAgentDef({ id })`); I did not read how its table is built, so the executor
confirms where the option enters first (lesson 11).

C6 restates the ACP session types "byte for byte" in `daemon/src/ports/agent-runtime-sessions.ts`.
Any step below that adds a field to `AttachAcpSessionOptions` must update that copy in the same
commit once C6 has landed. This is the one place where this work and the untangle touch the same lines.

### 3.4 The tool door

Three rules keep `ToolExecutor` the only door:

1. **Jini's tools go to the agent only as the `jini` MCP server** in `session/new` `mcpServers`. The agent calls it; the bridge calls `ToolExecutor`. This is `acp-merge` today.
2. **The client never advertises `fs` or `terminal`.** It does not today (`session.ts:1529`). If it did, an agent could read, write and run commands through Jini's process, outside `ToolExecutor`. v2 removes these methods anyway. A test pins the `initialize` frame so this cannot change by accident.
3. **The agent's own built-in tools** (shell, edit) run inside the agent, as they do today on every path. Jini's control over them is (a) what the profile switches off at session start and (b) the permission request. Jini never selects an `allow_always` option unless the host policy asked for it, because the agent, not Jini, stores and scopes that decision (`RESEARCH.md` §2.5).

Later, not in this plan: the "MCP-over-ACP" RFD would let the tool server ride the ACP pipe and remove
the bridge's HTTP or stdio hop. It is an unstable draft. Watch it; do not build on it.

---

## 4. Numbers

Counted at `02edbb68` with `wc -l`, tests excluded. "Goes" assumes the CLI's native path is deleted
after it has run over ACP for the agreed time (O-4). A profile is estimated at 35–40 lines.

| Group | CLIs | Goes | Stays (still needed) |
|---|---|---:|---|
| Built-in ACP | cursor-agent, qoder (+`qoder-stream.ts`), codebuddy, grok-build, qwen, droid | ~680 | binary, auth, model list |
| Built-in ACP | opencode (+`opencode-log.ts`, daemon `opencode/`) | 250–450 | `defs/opencode/event-stream.ts` and env-content MCP while mimo stays on them (unverified how much mimo shares) |
| **Subtotal built-in** | 7 | **~930–1,130** | |
| Vendor adapter | claude | ~400 (launch args ~250; daemon `mcp-config`, `mcp-delivery`, `subagent-start` 156) | `config-dir.ts` 176, `contracts.ts` 80, `filesystem.ts` 33, `claude-filesystem-policy.ts` 243 |
| Vendor adapter | codex | ~780–1,100 (args ~300, `event-stream.ts` 379, part of `home-config.ts` 231) | `home-staging.ts` 264, `isolation.ts` 67, `contracts.ts` 41 |
| Vendor binary | antigravity (+ gemini parser) | ~550–620 | auth, model lock |
| **Subtotal vendor** | 3 | **~1,700–2,100** | ~900 lines of staging and isolation |
| Later | `claude-stream.ts` 971 + `claude-segment-usage.ts` 101 | 1,072 | only when amp and codebuddy have also left the Claude stream format |
| Never | aider, crush, deepseek, mimo, pi (+`pi-rpc/` 795) | 0 | all of it, plus `wireChildLifecycle` (`events.ts:470-950`) and `json-event-stream.ts` |

- **Ceiling: about 2,700–3,200 lines, or 3,800–4,300 if amp also moves**, out of about 8,000
  (5,698 per-CLI + 1,524 shared parsers + 795 pi-rpc).
- **Added:** client fixes A1–A6 about 300–400 lines; ten profiles about 400; adapter binary lookup about 100.
- **Net: roughly 1,900 to 3,400 lines fewer.** Tests shrink in proportion (5,176 lines of def tests, 893 of per-CLI daemon tests today) and gain one contract test per profile.
- `launch.ts` (1,710) and `events.ts` (1,398) lose only their Claude- and Qoder-specific branches.

These are estimates from file sizes, not from a trial deletion. The honest headline is "a third of
the adapter code, in the best case", not "most adapters become one client".

The larger gain is not line count. Qwen, Droid, Grok Build, Aider-class CLIs run as `plain` text
today: no tool events, no permission gate, no session resume. The three that have ACP would get all
of that for a 35-line profile.

---

## 5. Risks

| # | Risk | Size | Answer |
|---|---|---|---|
| R1 | Claude over the adapter loses behaviour Jini built on the stream format (background-task hold, delegated-result correlation, segment cost basis, subagent-start hook, mid-run message) | high | Claude is last. A written parity list is checked live before the opt-in list ever includes `claude`. Native path stays until the owner removes it |
| R2 | Adapter adds a process and a fast-moving dependency on the security path (Claude adapter publishes a preview on every push; 0.107.x) | medium | pin an exact version; install it, never `npx` at run time; contract test per pinned version |
| R3 | Isolation regresses because "ACP handles MCP now" is read as "staging is no longer needed" | high | §1 rows 3 and 5 say it stays; the staging files are not touched by any step here; a test asserts the staged env reaches the ACP child |
| R4 | ACP v2 lands and agents drop v1 | low for 2027 | the spec tells agents to keep v1; stay on v1 (O-6); G3 fix removes the one v2-dropped method Jini depends on |
| R5 | Spec additions are unstable for months and agents ship them anyway (`_meta`, `unstable_` methods) | medium | profile owns vendor fields; the shared client only speaks stable v1 |
| R6 | Registry-only CLIs (five) do less over ACP than over their native format | medium | each is opt-in and checked live first; if it is worse, it stays native and costs nothing |
| R7 | Two paths per CLI during the soak means more code, not less, for a while | certain | bounded by O-4; one CLI at a time |
| R8 | Jini's client and C6's restated session types drift | medium | same-commit rule in §3.3 |

**Non-ACP CLIs:** nothing breaks. Their defs, the plain path and the JSON-stream path are untouched.
The cost is that Jini keeps two ways of driving a CLI for as long as aider, crush, deepseek, mimo and
pi are supported (O-5).

---

## 6. Fit with R8 and lane K

**R8.** No conflict. R8 changes who supplies the runtime to the daemon; this work changes what is
behind `sessions.attachAcp` and which def the runtime hands out. R8a and R8b do not need to know.

**Lane K** moves `daemon/src/agent-executor/{claude,codex,opencode,antigravity,pi,gemini}/`
(1,272 lines) to `agent-runtime/defs/<cli>/`. Sorted by what ACP does to them:

| Kind | Files | Lines | Under ACP |
|---|---|---:|---|
| Staging and isolation | `claude/{config-dir,contracts,filesystem}.ts`, `codex/{home-staging,isolation,contracts}.ts`, `antigravity/permissions.ts` | 729 | still needed (antigravity's unverified) |
| MCP delivery | `claude/{mcp-config,mcp-delivery}.ts`, `codex/{home-config,mcp-delivery}.ts`, `opencode/{mcp-config,constants}.ts` | 480 | replaceable later, per CLI |
| Small adapters | `claude/subagent-start.ts`, `opencode/tool-calls.ts`, `gemini/tool-calls.ts`, `pi/*` | 63 | mixed |

**Should lane K wait? No.**

1. 57% of what it moves (729 of 1,272) is needed with or without ACP.
2. The other 480 lines are deleted, if ever, one CLI at a time and months later. Deleting a file from `defs/<cli>/` costs the same as deleting it from `agent-executor/<cli>/`.
3. ACP profiles need `defs/<cli>/` to hold a CLI's staging, so ACP work is easier after K.
4. R8 §12.14 already makes K's files take their dependencies as arguments and hold no daemon state. That is exactly what lets the same staging function serve a native launch and an ACP launch.

**One request to lane K:** keep staging files and MCP-delivery files separate, as they are today. Do
not merge `mcp-config.ts` into `config-dir.ts` while moving. Then a later ACP step deletes whole files.

**Order:** R8a → C6 → R8b → lane K → this plan's B and C steps. This plan's A steps touch only
`agent-protocol/acp/` and can run **before or beside** all of them, subject to the same-commit rule in §3.3.

---

## 7. Migration order

Every step is one commit that compiles and passes `npm --prefix packages/agent-runtime run test` and
`npm --prefix packages/daemon run test` on its own, plus `pnpm typecheck` and `pnpm guard`. Test
seams that exist today: `FakeAcpChild` (`acp/__tests__/session.test.ts:30`) and a real Node
subprocess fixture `ACP_FIXTURE` (`daemon/.../__tests__/agent-executor-acp.integration.test.ts:16`).

### Phase A: make the existing client match the spec (agent-runtime only)

| Step | Change | Needs | Test that can fail on the named risk |
|---|---|---|---|
| A0 | Tests only. Pin today's wire behaviour: exact method order for new, resume, and model-switch runs; the `initialize` frame (`terminal: false`, no `fs`); what the client sends back to an unknown agent request (closes G9 by observation); what a replayed history on `session/load` turns into | — | frame-by-frame equality on `FakeAcpChild`, fake timers for the watchdog |
| A1 | Today the `initialize` result is not read at all (`session.ts:942-944`). Pure `readAgentCapabilities({ result })` → `{ loadSession, resume, mcpHttp, image, systemPrompt, additionalDirectories }`; stored in session state; nothing reads it yet | A0 | table test of capability shapes, including absent and malformed |
| A2 | `AcpProfile` type and `DEFAULT_ACP_PROFILE`; `attachAcpSession` takes `profile` (optional, default = today). Move the AMR stderr tail, retry promotion, `AMR_MODEL_UNAVAILABLE` and the artifact text filter out of the shared files into `defs/amr/acp-profile.ts`. Why-comments move with the code (practice 6). Closes G7 | A0; `amr` def passes its profile in the same commit | A0's frames unchanged for amr and for a default def; the existing `text-suppression` and `account-failure` tests move with the code and still pass |
| A3 | Resume by capability (G3). `profile.resume: 'resume'` uses `session/resume` if advertised; `'load'` uses `session/load` only if `loadSession` is advertised; otherwise fail **before sending** with the existing `resume_failed` kind and `details.reason: 'unsupported'`. Default profile stays `'load'` | A1, A2 | (a) agent without `loadSession`: no `session/load` frame is written, error kind is `resume_failed`; (b) agent with both: `'resume'` profile writes `session/resume` |
| A4 | `usage_update` → one new agent event carrying context size and cumulative cost (G1). It must not be summed with the end-of-prompt token usage | A0; read `event-translation.ts` and the cost-metadata tests first. **STOP** if a second usage event would be added to totals | two `usage_update`s then a prompt result: totals equal the result's, cost equals the last update's |
| A5 | `auth_required` from the agent → a typed error with the agent's `authMethods` in details (G4). The client never logs in by itself | A0 | error code and details asserted; no `authenticate` frame written |
| A6 | Unknown agent request → JSON-RPC `-32601` reply. Today nothing is sent (G9, confirmed by reading `session.ts:941`) | A0 pins today's silence first | the reply frame, and that the run continues |
| A7 | `profile.model: 'config-option'` never sends `session/set_model` (G2). Default stays `'legacy'` | A2 | no `session/set_model` frame for a `'config-option'` profile when the agent lists no model option; the run proceeds on the agent's default with a `model` status event |

A3 and A7 change behaviour only for a def that sets the profile field. A3's fail-fast for an agent
without `loadSession` is the one change that reaches existing defs; it replaces a failed round trip
with the same error kind, and the commit message says so (practice 10).

### Phase B: the switch (after C6 or on today's registry)

| Step | Change | Needs |
|---|---|---|
| B1 | `acpPreferred` option on the runtime binding; `defs.get` returns a def's ACP variant when listed. Default `[]`. No def has a variant yet, so nothing changes | A2; the seam in `registry.ts` confirmed |
| B2 | Send `systemPrompt` and `additionalDirectories` on session setup when the agent advertises them and the run has them (G5); otherwise today's overlay and prompt-path behaviour | A1 |

### Phase C: built-in ACP CLIs, one commit each, each opt-in

Order: **opencode** (documented protocol reference, open source), then cursor-agent, qoder, qwen,
droid, grok-build, codebuddy.

Per CLI: add `defs/<cli>/acp-profile.ts` and the ACP variant of the def (same id, ACP `buildArgs`,
`streamFormat: 'acp-json-rpc'`, `externalMcpInjection: 'acp-merge'`); a contract test that replays a
recorded handshake of that CLI through `FakeAcpChild`; a live checklist run by a person (streaming,
one tool call through the bridge, a denied permission, cancel, resume, model switch, image). The
host then adds the id to `acpPreferred`.

### Phase D: vendor adapters (needs O-2)

Order: **codex**, then **claude**, then antigravity. Extra per CLI: resolve the adapter binary as its
own executable; call the lane-K staging function and pass its env to the ACP child; tool policy
through `profile.sessionMeta` (Claude) or env/config option (Codex); the parity list in R1.

### Phase E: delete a native path (needs O-4, per CLI)

One commit per CLI: delete its native `buildArgs`, parser and MCP-delivery files; remove its id from
`acpPreferred` handling by making the ACP def the only def. A shared parser goes with its last user.
`streams.qoder` leaves `AgentRuntimePort` with Qoder's native path (a C6 port change, same commit).

### STOP conditions

- A0 shows the 12 current ACP defs depend on behaviour a later step changes (for example a replayed history that Jini relies on). Re-plan A3.
- C6 lands in a shape where `RuntimeAgentDef` cannot take an optional `acp` field without a cast.
- A live check in C or D shows a CLI is worse over ACP. That CLI stays native; the plan continues with the next.
- The owner answers O-2 with "no". Phase D is dropped and the saving stops at about 1,000 lines.

---

## 8. Security view (design time; nothing was patched)

| # | Surface | Finding | Required in the design |
|---|---|---|---|
| S1 | Operator config reaching the model | Adapters default to loading it (Claude adapter: user, project and local settings) | staging stays; a test asserts the staged directory env is on the ACP child |
| S2 | Personal MCP servers | ACP can add servers, not remove the agent's own | Codex refusal (`isolation.ts`) and Claude `inheritUserMcp` logic stay and run before an ACP launch too |
| S3 | A second tool door | `fs/*` and `terminal/*` would run in Jini's process | never advertised; pinned by A0 |
| S4 | Remembered approvals | `allow_always` is stored by the agent with a scope Jini cannot see | default decision never picks it; only an explicit host policy may |
| S5 | Supply chain | registry launch commands use `npx <pkg>@<version>`; 5 of 47 registry agents are quarantined for breakage | install pinned adapters ahead of time; no network fetch at run time |
| S6 | Run token in transit | the `jini` server entry (run id and bearer token) is sent inside `session/new` and passes through the adapter process; Codex adapter can write logs to `APP_SERVER_LOGS` | do not set adapter log directories in production; token stays run-scoped as today |
| S7 | Vendor `_meta` | unversioned, can change with any adapter release | profile contract test per pinned version |

Severity is not assigned here; this is a threat-surface list for the Security agent to review before Phase D.

---

## 9. Owner practices, checked

| # | Practice | In this design |
|---|---|---|
| 1 | DI via typed ports | no new port; `attachAcp` on `AgentRuntimePort`; profile hooks and the permission handler are injected |
| 2 | Args `(required, optional = {})` | `readAgentCapabilities({ result })`, `sessionMeta({ policy })`, `createAgentRuntimeBindings({ runtime }, { acpPreferred })`. `attachAcpSession(options)` keeps its current single-object shape; changing it is C6's call |
| 3 | Functions ≤50, files ≤500, complexity ≤10 | new files are small. **Not met today and not fixed here:** `acp/session.ts` is 1,608 lines. A2 removes vendor code from it but does not split it; that is a size lane (G8) |
| 4 | Feature slicing | one folder per CLI holds def, profile, staging, native parser |
| 5 | No barrels, shells, forwarders | no new index files; no re-export left behind when vendor code moves in A2. (`defs/index.ts` is an existing `export *` barrel; not touched) |
| 6 | Why-comments move with code | stated in A2 and for every Phase E deletion (comments that explain a still-needed rule move to the profile) |
| 7 | Package imports only itself, core, protocol; vendor code in its own folder | A2 moves the one vendor's code out of the shared client. agent-runtime's existing imports of `oauth`, `integrations`, `platform` are the untangle's subject, not this plan's. No new npm dependency (O-7) |
| 8 | Tests use fakes of interfaces | `FakeAcpChild`, recorded-handshake replay, fake classifier; no vendor CLI in CI |
| 9 | Errors never swallowed or generic | A3, A5, A6 turn three silent or generic failures into typed ones. Existing empty `catch` at `session.ts:1414` (broken pipe on a permission reply) is noted, not changed |
| 10 | No silent behaviour change | every switch is opt-in (`acpPreferred`, profile fields); the one change that reaches existing defs (A3 fail-fast) is named |
| 11 | Smallest change, reuse first | reuse the existing client, defs, fixtures and `acp-merge`; one optional field on the def |
| 12 | Memory and I/O cost | see `Cost:` below |

**Cost:** an adapter run is two processes where a native run is one (adapter plus the vendor engine).
Not measured. Bound: one adapter process per run, started and stopped with the run, same process-tree
stop as today (`terminateChildTreeBestEffort`). `usage_update` adds events at the agent's pace; A4
emits one event per update with no buffering. OpenCode documents that one ACP process can serve many
sessions; reusing a process across runs would save startup but changes run isolation and is **not**
proposed.

## 10. Lessons applied (the 11 in `LESSONS-FOR-DESIGN-BRIEFS.md`)

| Lesson | Where |
|---|---|
| 1 real dependency graph | §1 maps by responsibility and data flow, not by file |
| 2 inventory consumers first | consumers of the ACP exports listed: `daemon/src/agent-executor/{launch,events,contracts,mcp-bridge}.ts`, `agent-runtime/src/{acp-model-probe,index}.ts`, `defs/{shared,hermes/index,amr/index}.ts`. Tovu has none in `apps/` or `packages/` |
| 3 late-bound reads | A2 passes the vendor hooks as an argument where today they are imported; they are read at call time in both shapes. Executor re-checks |
| 4 inputs, outputs, state owner per slice | session state stays owned by `attachAcpSession`; profile is read-only data |
| 5 migration graph | §7 lists what each step needs |
| 6 tests that can fail | §7 test column |
| 7 keep optional, fallback, error distinct | A3 and A7 keep "absent", "unsupported" and "failed" as different outcomes |
| 8 limits inside each file | practice 3 row says what is not met |
| 9 mechanism vs host binding | `acpPreferred` is chosen by the host; the mechanism is in agent-runtime |
| 10 untangle lanes first | §6 order; same-commit rule with C6 |
| 11 seams exist | test commands and both fakes verified; `getAgentDef` exists at `registry.ts:94`; how its table is built is **not** verified and flagged |

## 11. Owner decisions

| # | Decision | Recommendation |
|---|---|---|
| O-1 | Extend the existing ACP client and move CLI by CLI, or something larger | extend, CLI by CLI |
| O-2 | May the vendor adapters for Claude and Codex (an extra pinned program and process) sit on the run path | yes for Codex as a trial; Claude only after the parity list passes. If no, stop after Phase C |
| O-3 | Lane K now or after ACP | now, keeping staging and MCP-delivery files separate |
| O-4 | How long a native path is kept after its CLI is switched | until one release has shipped with it switched, per CLI |
| O-5 | Keep CLIs with no ACP (aider, crush, deepseek, mimo) | keep; they are why the native path stays, and they cost about 280 lines of defs |
| O-6 | ACP v2 | stay on v1 until v2 leaves draft |
| O-7 | Use `@agentclientprotocol/sdk` (types or client) or keep the hand-written client | keep hand-written; revisit when adding v2 |
| O-8 | Pi over `pi-acp` | no; keep pi-rpc |
| O-9 | Existing ACP defs that drifted from the registry (kiro `--agent-engine=v3`, kimi legacy vs Kimi Code) | check live, fix as separate small commits |
| O-10 | Do Phase A at all if O-1 is "leave it" | yes; G1–G5 affect the 12 CLIs already on ACP |
