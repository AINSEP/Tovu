# ACP for Jini's agent adapters: design and recommendation (2026-11-16, revision 2)

Docs only. Read `RESEARCH.md` first; this file uses its section and gap numbers (G1–G9).
Revision 2 answers `CODEX-JUDGE.md` (13 findings); the answer to each is in the last section.

**Bases, pinned.** Jini `integ/wave-b-r2` @ `02edbb68`. Tovu `plan/acp-research-2026-11-16`. R8:
`origin/plan/daemon-untangle-design-2026-11-16` @ `32cd78ed`, file
`ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/daemon/R8-RUNTIME.md` (499 lines, last
changed in `23b2132b`). C6: same branch, `…/untangle/sheets/C6.md`. Adapters: `claude-agent-acp` @
`0073280` (0.107.3), `codex-acp` @ `6567651` (2.6.0), spec @ `4aab69b`; all re-cloned and re-read
2026-11-16. Claude Agent SDK types: npm `@anthropic-ai/claude-agent-sdk@0.3.325`, `sdk.d.ts`.

Personas: software-architect (lead), programmer, security. Skills: hexagonal-architecture,
api-design, architecture-migration, security-review.

Paths: `AR/` = `packages/agent-runtime/src/`, `DA/` = `packages/daemon/src/agent-executor/`.

Three words are used strictly in this file (lesson 23):
**configured** = Jini's def or an adapter's source says it; **advertised** = the agent says it in
`initialize`; **demonstrated** = someone ran it and saw it. Nothing in this file is demonstrated.

## 0. Recommendation in six lines

1. **Jini already has the ACP client, and 12 of 28 CLIs use it. Fix that client first (Phase A).** The fixes are worth doing even if nothing else moves: over ACP today, session resume does not work for any CLI, the reasoning-effort choice is not sent, cost updates are dropped, and an unknown agent request hangs for ten minutes.
2. **ACP is not a line-count saving.** Counted symbol by symbol (`DELETION-LEDGER.tsv`): at most 1,254 lines go, about 1,290 are added. Break-even. The earlier "1,900 to 3,400 fewer" was wrong.
3. **The gain is function.** Qwen, Droid and Grok Build run as plain text today (no tool events, no permission gate, no resume). ACP gives them all three.
4. **Move only CLIs whose own binary speaks ACP, one at a time, behind a host opt-in.** OpenCode first.
5. **Do not move Claude now.** It needs a second program, a new translation of the whole security policy, and saves about 50 lines. Codex is a trial at most (it removes one 379-line parser).
6. **Lane K should not wait.** 81% of what it moves is still needed under ACP.

---

## 1. Who does what, today and under ACP

| Responsibility | Today | Under ACP |
|---|---|---|
| Find the binary, probe version, detect login | `AR/{executables,detection,auth}.ts`, `defs/<cli>/` | **stays per CLI, and doubles for an adapter**: the adapter program and the engine it starts are two programs with two versions (§3.5) |
| Launch arguments | `def.buildArgs` | argv shrinks to the ACP switch. **The policy the arguments carried does not go away**; it has to be said again in the adapter's own words (§3.6) |
| Config and home staging | `DA/claude/config-dir.ts`, `DA/codex/home-staging.ts`, `DA/codex/isolation.ts`, `AR/claude-filesystem-policy.ts` | **stays per CLI** |
| How the `jini` tool server reaches the CLI | five carriers plus `acp-merge` (`DA/contracts.ts:498-518`) | **unchanged when a CLI changes transport** (§3.4). `session/new` delivery is used only where no other carrier exists |
| Keeping the operator's personal MCP servers out | `DA/codex/isolation.ts`, `DA/codex/home-config.ts:125-221`, Claude `--strict-mcp-config` | **stays per CLI** |
| Permission gate | Claude argv; Antigravity settings file; ACP `onPermissionRequest` | ACP gives one gate, `session/request_permission`. Switching built-in tools off stays per CLI |
| Event translation | per-format parsers → `translateAgentRuntimeEvent` | one `session/update` handler; a parser goes only with its last user |
| Session resume | argv (`--resume`, `-s`); `capturedSessionId` | `session/load` or `session/resume`. **Not working over ACP today** (§3.7) |
| Model and reasoning effort | argv per CLI | session config options, set in order (§3.8) |
| Cost and usage | per-parser usage; Claude segment cost | prompt-result tokens, plus `usage_update` (§3.9) |
| Run lifecycle, event log, cancel, cleanup | `DA/{launch,events}.ts` | Jini keeps. Teardown has to cover the adapter's children (§3.10) |
| Tool execution | `ToolExecutor` through the MCP bridge | Jini keeps; it stays the only door |

## 2. Options

| Option | Fit | Why |
|---|---|---|
| A. Replace all adapters with ACP in one move | poor | four CLIs cannot move; nothing about Claude parity is demonstrated |
| **B. Fix the existing client; move built-in-ACP CLIs one at a time behind a host opt-in** | **good** | each step is small and reversible; the native path stays |
| C. Leave it | acceptable | costs nothing, but the four defects in §0 line 1 stay for the 12 CLIs already on ACP |

---

## 3. Target shape

### 3.1 Where things live (after lane K)

```
AR/agent-protocol/acp/          the one ACP client
AR/defs/<cli>/
  def.ts                        native def
  acp.ts                        ACP variant of the def + its AcpProfile (only if the CLI has one)
  acp-launch-policy.ts          only claude/codex: the policy said in adapter words (§3.6)
  <staging files>               what lane K moves in
```

### 3.2 The profile: wire choices only

```ts
// AR/agent-protocol/acp/profile.ts   (type also restated in core once C6 lands)
export interface AcpProfile {
  /** Method used when the def is resume-eligible (`resumesSessionViaAcpLoad`). */
  readonly resume: 'load' | 'resume';
  /** 'legacy' = today: config option if listed, else session/set_model. */
  readonly model: 'config-option' | 'legacy';
  /** 'not-forwarded' = today: the run's effort is not sent. */
  readonly effort: 'config-option' | 'not-forwarded';
  /** Reads the handle to store for the next run. Default: the standard `sessionId`. */
  readonly durableSessionId?: (required: { result: Readonly<Record<string, unknown>> }) => string | null;
}
export const DEFAULT_ACP_PROFILE: AcpProfile = { resume: 'load', model: 'legacy', effort: 'not-forwarded' };
```

It holds no security policy, no text filter and no vendor error reading (those were in revision 1
and are withdrawn; see findings 1 and 8). `RuntimeAgentDef` gains `acp?: AcpProfile`.

### 3.3 One catalog, chosen once (finding 9)

Revision 1 swapped the def inside `defs.get`. That is wrong: `createNativeAgentRuntime` binds four
functions separately (`AR/native-runtime.ts:54-59`), detection reads the static table
(`AR/detection.ts:518-520`), and Tovu's inventory defaults to the static export
(`apps/website/src/assistant/agents.ts:94,180`). A swap in one of them makes the others describe a
launch that is not the one that runs.

```ts
createNativeAgentRuntime({ env }, { acpPreferred: ['opencode'] })   // default []
```

- The runtime builds its catalog **once**: for each id in `acpPreferred` that has an ACP variant, the variant replaces the native def. `detectAgents`, `probeAgentModels`, `resolveAgentLaunch` and `getAgentDef` all read that catalog. The runtime exposes it as `runtime.defs`.
- Consumers that must change in the same commit: `AR/detection.ts:518-520` (takes the catalog as an argument), `AR/native-runtime.ts:54-59`, Tovu `assistant/agents.ts:94,180` (default becomes `runtime.defs`), Tovu `agent-daemon-scope.ts:205-210` (already reads the runtime). The static `AGENT_DEFS` export stays and stays native.
- `AR/launch.ts:21` keys the Codex binary search by `def.id`. An ACP variant keeps the id, so it would get the native search applied to the adapter. The key becomes a def field (`launchAdapter: 'codex-native'`), set only on the native def.
- An unknown id in `acpPreferred`, or an id whose def has no variant, throws at runtime creation. It is not skipped.

### 3.4 Tools: changing transport does not change delivery (finding 2, finding 3)

The failure the judge found is real: `DA/launch.ts:1567-1568` sets `mcpBridge = null` whenever an
HTTP endpoint was prepared, and ACP dispatch reads servers only from an `acp-merge` bridge
(`DA/events.ts:1305-1307`). Tovu binds `prepareHttp` (`apps/website/src/assistant/mcp-injection.ts:71`),
and `claude`, `codex` and `opencode` declare `mcpHttp: true`. A variant that only switched
`streamFormat` and `externalMcpInjection` would start with no Jini tools and no error.

Rule: **an ACP variant keeps its def's `externalMcpInjection` and `mcpHttp`.**

| CLI | Carrier under ACP | Why it still works (configured, not demonstrated) |
|---|---|---|
| opencode | `opencode-env-content`, HTTP through `HTTP_MCP_ENV_ADAPTERS` (`DA/launch.ts:117`) | same binary, same env variable |
| codex | `codex-toml` in the staged `CODEX_HOME`, HTTP through `HTTP_MCP_HOME_ADAPTERS` (`:118`) | the adapter reads `CODEX_HOME`. Staging gets its entry exactly as today, so the refusal at `DA/codex/home-staging.ts:235-241` and the table stripping in `home-config.ts` are untouched |
| claude | none: its carrier is argv. Needs `session/new` delivery, over HTTP for a host like Tovu | step A8 |
| qwen, droid, grok-build | `acp-merge` over stdio (new: they have no tools today) | spec: every agent must support stdio |

Two guards make the silent case impossible:

1. `runAcpDispatch` fails before the prompt, with a typed `AGENT_SPAWN_FAILED` ("tools could not be delivered"), when an HTTP endpoint was prepared and neither a native carrier nor an HTTP `session/new` entry consumed it.
2. A registry test fails if any def has `mcpHttp: true` together with `acp-merge` before A8 lands.

**A8 (HTTP entry in `session/new`).** `AcpMcpServerInput` becomes a union of today's stdio shape and
`{ type: 'http', name, url, headers: [{ name, value }] }` (spec `session-setup.mdx`, "HTTP transport").
ACP dispatch receives `httpEndpoint?: Pick<McpHttpEndpoint, 'url' | 'token'>`. The entry is sent only
when the agent **advertised** `mcpCapabilities.http` (A1). Not advertised → typed failure before
`session/new`; there is no fallback after spawn, because no stdio bridge was built. The endpoint is
closed by the existing `watchEndpoint` (`DA/http-mcp.ts:19-37`).

`ToolExecutor` stays the only door: the client never advertises `fs` or `terminal`
(`session.ts:1527-1530`, pinned by A0), and never picks `allow_always` unless the host policy asked.

### 3.5 Two programs, two identities (finding 9, lesson 23)

| | Adapter program | Engine |
|---|---|---|
| claude | `claude-agent-acp` | `claude`, passed as `CLAUDE_CODE_EXECUTABLE` |
| codex | `codex-acp` | `codex`, passed as `CODEX_PATH` |
| opencode, qwen, … | the CLI itself | same program |

An adapter variant's def carries both: `bin` (adapter) and `engine: { bin, versionArgs, envVar }`.

- **Version and availability:** both are probed; the variant is available only if both resolve. Detection reports both versions.
- **Login probe, capability probe, Claude's filesystem floor (2.1.285, `AR/claude-filesystem-policy.ts:70-76`):** run against the **engine**. Today they run against `launchPath`, which under an adapter would be the wrong program.
- **Which engine runs:** always the one Jini resolved, passed by env. Never the adapter's bundled copy, or the probe and the run could disagree.
- **Teardown:** §3.10.

### 3.6 Security policy for an adapter (finding 1, blocker)

Revision 1 gave the Claude profile only `NativeToolPolicyInput`, which has four fields
(`AR/native-tool-policy.ts:53-58`). The real policy is wider. `claude.ts` enforces: the deny and
allow lists (`:96-108`), setting sources (`:110-123`), and folder confinement, which reaches the CLI
**only** through generated `--settings` (`:135-146`, `AR/claude-filesystem-policy.ts:136-150`: read
blocking, the sandbox, read-only folders). Revision 1 would have kept the host's "folder-limited"
decision and dropped its enforcement.

Contract: **the ACP variant receives exactly what native `buildArgs` receives**
(`RuntimeBuildOptions`, `RuntimeContext`, extra folders, image paths), through one new optional pure
function on the def:

```ts
acpSessionSetup?: (required: { options: RuntimeBuildOptions; runtimeContext: RuntimeContext;
  extraAllowedDirs: readonly string[]; imagePaths: readonly string[] }, optional?: Record<string, never>)
  => { readonly meta?: Readonly<Record<string, unknown>>; readonly env?: Readonly<Record<string, string>> };
```

For Claude the existing policy owner is split, not copied:

```
resolveClaudeLaunchPolicy(...)  -> { settings, settingSources, deniedTools, allowedTools, directories, chrome }
  renderClaudeArgv(policy)            today's bytes; pinned by the existing argv tests
  renderClaudeAdapterOptions(policy)  -> _meta.claudeCode.options
```

What the adapter does with those options, read from its source:

| Policy | Adapter option | Source says |
|---|---|---|
| deny / allow lists | `disallowedTools` (merged), `allowedTools` | `acp-agent.ts:10102`; SDK `:1714`, `:1734` |
| no personal settings | `settingSources: []` | default is user+project+local (`:10040`), client value is spread after it (`:10060`) |
| folder confinement | `settings` (object), `sandbox` | `:10001`, `session-env.ts:71-81`; SDK `:2351`, `:2369` |
| no personal MCP | `strictMcpConfig: true` | SDK `:2471`; passes through the spread |
| permission mode | **cannot be set**: the adapter ignores it (`new-session-meta.ts:15-20`) | the gate becomes `session/request_permission` and Jini's handler; `allowDangerouslySkipPermissions: false` removes bypass from the session |

All of that is **configured**. None is demonstrated. The renderer fails closed: a policy field it
cannot express throws `NATIVE_TOOL_POLICY_UNSUPPORTED` before spawn.

**Gate before `claude` may appear in any `acpPreferred`** (run live, at pinned adapter and engine
versions, on a folder-limited run): a read outside the root is denied; a write outside is denied; a
shell command cannot reach outside (sandbox on); a read-only extra folder cannot be written; a
personal MCP server is absent; a hook in the operator's user, project and local settings does not
run. Each also has a contract test on the rendered `_meta` that fails if the field is removed. If any
live check fails, Claude stays native.

Codex is the same shape and smaller: the sandbox tier and capability table (`AR/defs/codex.ts:204-291`)
render to `INITIAL_AGENT_MODE` and `CODEX_CONFIG`; home staging is unchanged (§3.4).

### 3.7 Resume, end to end (finding 4)

What is true at `02edbb68`: the daemon never passes `resumeSessionId` to the ACP client
(`DA/launch.ts:1319-1338`, `DA/events.ts:993-1005`); the client stores a handle only from a vendor
field (`session.ts:823`); the daemon never calls `getDurableSessionId()` and the ACP client emits no
event carrying a session id, so `sessionRef` is never set on this path (`DA/events.ts:1079`).
**No ACP CLI resumes today, including `amr`, which declares it (`AR/defs/amr/index.ts:290-291`).**

One contract, one step (A3):

1. Eligibility stays the def flag `resumesSessionViaAcpLoad` (read at `DA/session-coordination.ts:128`, `DA/launch.ts:616`). The profile only picks the method.
2. The daemon forwards `resumeSessionId` for an eligible def.
3. The client records `profile.durableSessionId?.({ result }) ?? result.sessionId`. `amr`'s profile reads its vendor field.
4. On finish the daemon sets `sessionRef = controller.getDurableSessionId()` for an eligible def.
5. `'load'` needs advertised `loadSession`; `'resume'` needs advertised `sessionCapabilities.resume`. Not advertised → `resume_failed` with `reason: 'unsupported'`, before any frame is written; the host's reseed path already handles that kind.

This turns resume **on** for `amr`. It is a visible change, it is what the flag already claims, and
the commit says so. The other 11 are not eligible and do not change.

### 3.8 Model and effort (findings 5 and 6)

G2 corrected: a concrete model on an agent that has no model config option and no
`session/set_model` **fails the run**. Recovery needs a default model (`session.ts:357-358`); the
request is sent only for a non-default one (`:796`); and the launcher resolves a concrete model
before dispatch (`DA/launch.ts:1240-1250`).

Order, after the session is established:

1. **Model.** Already active → nothing. Else a `model` config option → `session/set_config_option`; the reply is the complete option list (spec `session-config-options.mdx:304`, `:374`) and replaces the stored one. Else, profile `'legacy'` → `session/set_model` as today. Else → `AGENT_MODEL_UNSUPPORTED`, naming the model and what the agent offers. **The run never continues on a different model.** Revision 1's A7 did that and is withdrawn.
2. **Effort**, for a `'config-option'` profile and a non-default effort: read the `thought_level` option from the **latest** list (the model change may have changed it). Value offered → set it. Option absent or value not offered → `AGENT_EFFORT_UNSUPPORTED`, listing the offered values.
3. Then the prompt.

Daemon side: `reasoning` is forwarded (today `DA/launch.ts:1319-1338` does not). Both adapters and
OpenCode list a `thought_level` or `effort` option (`claude-agent-acp/src/session-effort.ts:144`,
`codex-acp/src/ModelConfigOption.ts:89`); that is configured, not demonstrated.

A CLI's native path may be deleted only after a test shows the same effort value arriving over ACP.

### 3.9 Usage (finding 10)

`usage_update` carries context `used` and `size` (tokens in the window now) and an optional
cumulative `cost { amount, currency }` where currency may be `"credits"` (spec `prompt-turn.mdx:448`).
These are three different things and none is billable token usage.

| Dimension | Goes to | Status |
|---|---|---|
| billable tokens, per turn | today's `usage` event from the prompt result | unchanged |
| cumulative session cost in USD | the **existing** `usage` fields `cumulativeCostUsd` + `costSessionId` (`DA/event-translation.ts:53-55`) | A4 |
| cost in another unit | not emitted as USD. Needs a protocol field | O-11 |
| context occupancy | needs a protocol payload | O-11 |

Revision 1 proposed a new event type; the daemon drops unknown types (`:175-186`, `:211-216`), so it
would have been discarded. A4 uses the existing fields. Until O-11 is answered, occupancy and
non-USD cost are still dropped, and this file says so rather than implying G1 is closed.

Not traced: who reads `cumulativeCostUsd` after translation. The executor reads that first; **STOP**
if it assumes Claude's stream semantics.

### 3.10 Who stops what, and when staged files go (finding 11)

At `02edbb68`: cancel stops the process tree (`DA/events.ts:1054-1057`); a clean finish and a protocol
failure signal **only the immediate child** (`session.ts:1149`, `:1184`, `:1370-1373`); staged homes
are removed when that child closes (`DA/events.ts:1060-1067`). Tree stop walks parent ids from a
snapshot, and the launcher does not start a process group, so once an adapter exits its engine can no
longer be found. Codex's adapter gives its engine two seconds after stdin closes
(`codex-acp/src/index.ts:80-83`); Claude's exits after disposing (`claude-agent-acp/src/index.ts:91-104`).
Revision 1's "started and stopped with the run" was not supported.

Required, for a def with an `engine`:

| End | Order |
|---|---|
| clean finish, protocol failure | snapshot descendants while the adapter is alive → end stdin / signal the adapter → stop the snapshotted descendants → wait for all to exit (bounded) → remove staged files |
| cancel | as today (tree stop), then wait, then remove |
| adapter crashed | descendants recorded at session start are stopped → wait → remove |

If a descendant is still alive at the bound, staged files are **not** removed; the failure goes to
`onCleanupFailure` with the pids. A process-group spawn would be sturdier and is a change to R8's
spawn port (O-12).

Also on this path: the daemon emits and journals the child's raw stdout and stderr
(`DA/events.ts:1040-1048`). Whatever an adapter prints is stored. Before any adapter is opted in,
those two sinks need the run token and the endpoint token masked. No masking seam was found for the
ACP path; the executor confirms one exists or adds it (lesson 11).

### 3.11 How the daemon hands these to the client (finding 7)

The path is `dispatchAcpPrompt` (`DA/launch.ts:1314`) → `RunAcpDispatchInput` (`DA/events.ts:1260`) →
`runAcpDispatch` (`:1289`) → `WireAcpLifecycleContext` → `acpSessionOptions` (`:993`) →
`attachAcpSession` (`session.ts:1007`). Each field is copied by hand at each hop. Five new values
(profile, resume id, effort, HTTP endpoint, session setup) would mean 25 edits.

Step A2 first replaces the hand copies with one object, `session: AcpSessionRequest`, built once in
`dispatchAcpPrompt` and passed through unchanged. Same frames; A0 proves it. Files in that commit:
`DA/launch.ts`, `DA/events.ts`, `DA/contracts.ts:593` (the injected `attachAcpSession` type), the
daemon fakes of it, `AR/agent-protocol/acp/session.ts` (options type), and C6's restated copy
(`daemon/src/ports/agent-runtime-sessions.ts`) if C6 has landed. Phase A is **not** agent-runtime only.

---

## 4. Numbers

Source: `DELETION-LEDGER.tsv`, one row per symbol or file, with why and when. Tests excluded.

| | Lines |
|---|---:|
| Go when the native path is deleted, source read (claude 54, codex 443, opencode 29, qwen 13) | 539 |
| Go if a live check shows parity; registry-only CLIs (cursor 138, qoder 224, antigravity 146, codebuddy 29, grok 21, droid 12) | 570 |
| Go only with an extra step (Claude HTTP config 32, OpenCode HTTP merge 45, Antigravity permission writer 68) | 145 |
| **Gross ceiling, all ten CLIs, everything passing** | **1,254** |
| Added: client A1–A8 ~400; daemon forwarding and teardown ~150; catalog and two identities ~200; Claude and Codex policy renderers ~160; ten variants and profiles ~380 | ~1,290 |
| **Net** | **about −40: break-even (range −350 to +250)** |
| Extra, only if amp and codebuddy also leave the Claude stream format (parser 971, segment cost 101, shared args 47, MCP json 84) | 1,203 |
| Dead today, removable without ACP (Gemini parser 205, its receipt adapter 7) | 212 |

Revision 1 claimed 2,700–3,200 gross and 1,900–3,400 net. Where it went wrong: it counted whole def
folders, though binary, login and model code stay; it counted Claude's launch arguments as about 250
lines when `buildArgs` is 46 and the rest is policy; it counted Codex's `home-config.ts` as
replaceable though it does isolation; and it credited Antigravity with a Gemini parser that no def uses.

By group:

| Group | Gross | Added | Verdict |
|---|---:|---:|---|
| Client fixes for the 12 already on ACP (Phase A) | 0 | ~550 | do it: fixes real defects |
| Catalog switch (Phase B) | 0 | ~100 | needed for any move |
| qwen, droid, grok-build (plain text today) | 46 | ~115 | do it: gains tool events, permissions, resume |
| opencode | 29–74 | ~40 | do it: first target, best documented |
| cursor-agent, qoder, codebuddy | 391 | ~115 | only after a live parity check each |
| codex | 443 | ~160 | trial; the saving is the 379-line parser |
| claude | 54–86 | ~180 | **no** |
| antigravity | 146–214 | ~40 | unknown; nothing read |

---

## 5. Risks

| # | Risk | Size | Answer |
|---|---|---|---|
| R1 | Claude over the adapter loses folder confinement, or stream-only behaviour (background-task hold, delegated-result correlation, segment cost, subagent-start hook) | high | Claude does not move (O-2). If the owner overrides: §3.6 gate first |
| R2 | An adapter is a fast-moving program on the security path (Claude adapter 0.107.x) | medium | pin exact adapter and engine versions; install ahead; contract test per pin |
| R3 | "ACP handles tools now" read as "staging and delivery can go" | high | §3.4 rule and its two guards |
| R4 | ACP v2 lands and agents drop v1 | low for 2027 | stay on v1 (O-6) |
| R5 | Vendor `_meta` changes with any adapter release | medium | only the per-CLI renderer writes it; contract test per pin |
| R6 | A registry-only CLI is worse over ACP than natively | medium | opt-in, live check first, native stays |
| R7 | Two paths per CLI during the soak | certain | bounded by O-4 |
| R8 | The client and C6's restated types drift | medium | same-commit rule (§3.11) |
| R9 | An engine outlives its adapter and keeps a staged home open, or staged secrets are removed under it | medium | §3.10 |
| R10 | A def says a CLI supports something the agent does not advertise | medium | A1; act only on advertised capability; fail typed, never guess |

---

## 6. Fit with R8 and lane K

**R8.** No conflict. R8 changes who supplies the runtime; this work changes which catalog the
runtime holds and what the ACP client does.

**Lane K** moves `DA/{claude,codex,opencode,antigravity,pi,gemini}/`, 1,272 lines, to
`AR/defs/<cli>/`. Its contract is R8 §12.14 (line 475 at `23b2132b`): dependencies arrive as
arguments, types come from core, no daemon state, direct `node:fs` stays, and the seam the launcher
calls becomes an `AgentRuntimePort` member.

From the ledger:

| Under ACP | Lines | Share | Files |
|---|---:|---:|---|
| Still needed | 1,036 | 81% | all of `codex/` (609); `claude/{config-dir,contracts,filesystem,subagent-start}.ts` (329); `opencode/` env merge and receipts (91); `pi/` (7) |
| Deletable, ever | 161 | 13% | `claude/mcp-config.ts` 32 (after A8), `claude/mcp-delivery.ts` 84 (after claude **and** codebuddy), OpenCode HTTP merge 45 |
| Unknown | 68 | 5% | `antigravity/permissions.ts` |
| Dead today | 7 | 1% | `gemini/tool-calls.ts` |

**Lane K does not wait.** Revision 1 said 57% stays; counted properly it is 81%, and the 161
deletable lines need Claude to move, which this file advises against.

Inputs for lane K found here (vendor ids in shared launcher code, practice 7):
`DA/launch.ts:117-119` (`HTTP_MCP_ENV_ADAPTERS`, `HTTP_MCP_HOME_ADAPTERS`, `FILESYSTEM_ADAPTERS`, keyed
by id) and `DA/claude/config-dir.ts:161` (`def.id !== 'claude'`). They become def fields in K. Lane K
can also drop the Gemini files instead of moving them.

**Order:** R8a → C6 → R8b → lane K → Phases B and C here. Phase A can start now, with the
same-commit rule for C6's copy.

---

## 7. Migration

Every step is one commit that compiles and passes `npm --prefix packages/agent-runtime run test`,
`npm --prefix packages/daemon run test`, `pnpm typecheck`, `pnpm guard`. Seams that exist:
`FakeAcpChild` (`AR/agent-protocol/acp/__tests__/session.test.ts:30`) and the real subprocess fixture
`ACP_FIXTURE` (`packages/daemon/.../__tests__/agent-executor-acp.integration.test.ts:16`).

### Prerequisite P: size (finding 13)

`session.ts` is 1,608 lines and `attachAcpSession` runs from `:1007` to the end. Phase A changes that
function. The split exists on Jini `refactor/size-jini-chat-runtime` (`3bcc2a2a`, `52aee119`;
verified: `session.ts` 1,017, `session-run.ts` 603, `session-permission.ts` 136) and is **not** in
`integ/wave-b-r2`. Even there two files are over 500.

**P: land that branch's ACP commits, then split until every file Phase A touches is ≤500 and every
function ≤50.** Or the owner records an exception (O-13). Phase A is not estimated or dispatched
until one of the two is done.

### Phase A: make the client correct (agent-runtime and daemon)

| Step | Change | Needs | Test that fails on the named risk |
|---|---|---|---|
| A0 | Tests only. Pin: method order for a new run and a model switch; the `initialize` frame; silence toward an unknown agent request; **emitted events** for split tags, flush, prose and tool text through the suppressor; the OpenCode error promotion (`rpc.ts:98-122`) | P | frame equality and event equality on `FakeAcpChild`; fake timers |
| A1 | Pure `readAgentCapabilities({ result })` → `{ loadSession, resume, mcpHttp, image, systemPrompt, additionalDirectories }`. Today the result is not read (`session.ts:942-944`) | A0 | table of shapes, including absent and malformed |
| A2 | `AcpSessionRequest` object through the daemon (§3.11); `AcpProfile`, `def.acp`, default profile. **No code moves, no event changes** | A0 | A0 unchanged for every def; removing the profile forward fails a daemon test |
| A3 | Resume contract (§3.7) | A1, A2 | two runs through `ACP_FIXTURE` joined by the `sessionRef` the first run's `finish` stored, fixture returns only standard `sessionId`: run 2 writes `session/load` with it. Agent without `loadSession`: no frame, `resume_failed` |
| A4 | USD cumulative cost into the existing usage fields (§3.9) | A0; consumer of `cumulativeCostUsd` read first | two runs in one session: run 2's cost ≥ run 1's; new session: resets; no `cost`: no cost fields; `credits`: no USD field; tokens equal the prompt result's, not summed |
| A5 | `auth_required` → typed error with `authMethods`; the client never logs in | A0 | code and details; no `authenticate` frame |
| A6 | Unknown agent request → `-32601` reply (today: nothing, then the 10-minute watchdog) | A0 | the reply frame; the run continues |
| A7 | Model then effort (§3.8); `reasoning` forwarded | A1, A2 | concrete model, no option, `'config-option'` profile: `AGENT_MODEL_UNSUPPORTED`, **no prompt frame**; effort not offered: `AGENT_EFFORT_UNSUPPORTED`; model reply drops the effort option: effort is not set from the stale list |
| A8 | HTTP entry in `session/new`, and the two guards (§3.4) | A1, A2 | through the executor: HTTP prepared + advertised → `type: 'http'` entry; not advertised → typed failure, no `session/new`; stdio def unchanged; endpoint closed on finish |
| A9 | Teardown order and masking (§3.10) | A2 | fixture that leaves a grandchild: staged dir exists until the grandchild exits; token absent from emitted stdout and stderr |

Changes that reach existing defs, each named in its commit: A3 (resume starts working for `amr`),
A6 (a reply where there was silence), A9 (cleanup waits). A7 does not: the default profile keeps
`'legacy'` and `'not-forwarded'`.

### Phase B: the catalog switch

B1: `acpPreferred` on `createNativeAgentRuntime`, one catalog, the consumers in §3.3, `launchAdapter`
field. Default `[]`; no def has a variant yet. Needs A2. Test: with a fake variant listed, detection,
launch resolution and `getAgentDef` all return the variant; an unknown id throws.

B2: `systemPrompt` and `additionalDirectories` on session setup when advertised (G5). Needs A1.

### Phase C: built-in ACP CLIs, one commit each

Order: **opencode**, then qwen, droid, grok-build, then cursor-agent, qoder, codebuddy.

Per CLI: `defs/<cli>/acp.ts` (variant with the ACP `buildArgs`, `streamFormat: 'acp-json-rpc'`, the
def's **own** `externalMcpInjection` and `mcpHttp`, and a profile); a contract test replaying a
recorded handshake; then a person runs the live list: streaming, one Jini tool call reaching the
bridge, a denied permission, cancel, resume, model, effort, image. Only then does a host list the id.

### Phase D: Codex trial (needs O-2)

D1: Codex policy renderer (§3.6), `engine` identity (§3.5). D2: variant and profile. Live list as in
C, plus: staged home in use, personal MCP absent, refusal still raised when personal config cannot be
turned off.

### Phase E: delete a native path (needs O-4, per CLI)

One commit per CLI: the rows marked `E-<cli>` in the ledger, with their tests. A shared file goes
with its last user. `streams.qoder` leaves `AgentRuntimePort` with Qoder's native path.

### STOP conditions

- P is neither done nor excepted.
- A0 shows an existing def depends on behaviour a later step changes.
- A4: the consumer of `cumulativeCostUsd` assumes Claude semantics.
- A live check shows a CLI is worse over ACP: it stays native.
- Codex live check shows the engine under the adapter does not load MCP servers from the staged home: Codex stays native until A8-style delivery is designed for it together with staging.

---

## 8. Security view (design time; nothing was patched)

| # | Surface | Finding | Required |
|---|---|---|---|
| S1 | Folder confinement under an adapter | enforced only through generated settings; revision 1 dropped it | §3.6 contract and gate |
| S2 | Operator config and personal MCP | adapters load them by default | staging unchanged; `settingSources: []`, `strictMcpConfig`; Codex refusal preserved |
| S3 | Jini tools silently missing | HTTP-capable def moved to ACP | §3.4 rule and guards |
| S4 | A second tool door | `fs/*`, `terminal/*` | never advertised; pinned by A0 |
| S5 | Remembered approvals | `allow_always` is stored by the agent | never chosen by default |
| S6 | Supply chain | registry commands use `npx <pkg>@<version>` | pinned install; no fetch at run time |
| S7 | Tokens in transit and at rest | the server entry passes through the adapter; raw stdout and stderr are journaled | A9 masking; no adapter log directory |
| S8 | Engine outlives the run | staged secrets removed under a live engine, or left behind | §3.10 |
| S9 | Wrong program probed | version floor and login checked on the adapter | §3.5 |
| S10 | Model or effort changed without the user | revision 1's A7 | §3.8: typed failure |

Severity is not assigned; this is the surface list for the Security agent before Phase D.

---

## 9. Owner practices, checked

| # | Practice | In this design | Conflict |
|---|---|---|---|
| 1 | DI via typed ports | no new port; profile, session setup and permission handler are injected data and functions | none |
| 2 | Args `(required, optional = {})` | all new functions. `attachAcpSession` already has this shape (`session.ts:1007`); revision 1 said otherwise | none |
| 3 | Functions ≤50, files ≤500, complexity ≤10 | prerequisite P | **open until P or O-13** |
| 4 | Feature slicing | one folder per CLI | none |
| 5 | No barrels, shells, forwarders | A2 removes five hand-copy hops instead of adding a sixth | `defs/index.ts` is an existing barrel, not touched |
| 6 | Why-comments move | Phase E: a comment explaining a rule that still holds moves to the renderer | none |
| 7 | Package imports itself, core, protocol; vendor code in its own folder | renderers live in `defs/<cli>/` | **existing, not fixed here:** AMR and OpenCode names inside the shared client (O-14); vendor-id maps in `DA/launch.ts:117-119` (lane K) |
| 8 | Tests use fakes of interfaces | `FakeAcpChild`, recorded handshakes, `ACP_FIXTURE` | none |
| 9 | Errors never swallowed or generic | A3, A5, A6, A7, A8 add typed errors. Existing empty `catch` at `session.ts:1414` noted | `DA/launch.ts:1434` catches HTTP preparation errors without the cause; noted, not changed |
| 10 | No silent behaviour change | default `[]`; default profile is today's; three changes that reach existing defs are named; a model is never substituted | none |
| 11 | Smallest change | carriers kept; staging untouched; no code moved in A2 | none |
| 12 | IO cost | below | none |

**Cost.** An adapter run is two processes. Not measured. `usage_update`: one event per update, no
buffering. Teardown adds one process snapshot per run and a bounded wait. Capability reading is one
parse of a frame already received.

## 10. Lessons applied (all 23 in `LESSONS-FOR-DESIGN-BRIEFS.md`)

| Lesson | Where |
|---|---|
| 1 real dependency graph | §3.11 traces the value flow def → session; §3.3 traces the four registry readers |
| 2 inventory consumers first | §3.3, §3.11 list every caller, fake and copy; the ledger lists callers per deletion |
| 3 late-bound reads | the catalog is built once at runtime creation; nothing reads `acpPreferred` later |
| 4 inputs, outputs, state owner | session state stays in the client; profile and setup are read-only |
| 5 migration graph | §7 "Needs" column; P first |
| 6 tests that can fail | §7 test column; A0 pins emitted events, not only frames |
| 7 optional, fallback, error distinct | absent capability, unsupported value and failed call are three outcomes (§3.7, §3.8) |
| 8 limits inside each file | P |
| 9 mechanism vs host binding | host chooses `acpPreferred`; the mechanism is the runtime's |
| 10 untangle lanes first | §6 order; lane-K inputs listed |
| 11 seams exist | both fixtures verified; **not** verified: a masking seam on the ACP path, the consumer of `cumulativeCostUsd` |
| 12 behavioural port compatibility | A2 passes one object; A0 proves the frames did not change |
| 13 security gates across the whole chain | §3.6 lists every Claude policy input and its adapter form; the gate tests fail when a field is removed |
| 14 streaming lifecycle | §3.10 separates finish, failure, crash, cancel |
| 15 owner limits are acceptance criteria | P; no estimate excludes it |
| 16 concurrency by the real key | cost is keyed by session id, not run (§3.9) |
| 17 no-op across the lifecycle | a non-eligible def gets no `sessionRef`, no load frame, no overlay change (§3.7) |
| 18 transport write is not a transaction; cancel is part of safety | §3.10 |
| 19 name is not a correlation id; producer exists | revision 1's new usage event had no consumer (§3.9); tool rows keep `toolCallId` |
| 20 explicit absence checks | capabilities: absent means "not advertised", never truthiness of an object |
| 21 process death vs rejection | §3.10 "adapter crashed" row |
| 22 runtime vs type-only imports | `AcpProfile` on a core type: a type-only import after C6; the executor checks the package's compiler settings |
| 23 adapter vs engine; configured ≠ advertised ≠ demonstrated; telemetry dimensions; ledger | §3.5, the three words at the top, §3.9, `DELETION-LEDGER.tsv` |

## 11. Owner decisions

| # | Decision | Recommendation |
|---|---|---|
| O-1 | Fix the existing ACP client (Phase A) | yes |
| O-2 | Vendor adapter programs on the run path | **Claude: no. Codex: trial only**, after Phase C |
| O-3 | Lane K now or after ACP | now |
| O-4 | How long a native path is kept after a switch | one shipped release, per CLI |
| O-5 | Keep CLIs with no ACP | keep |
| O-6 | ACP v2 | stay on v1 |
| O-7 | `@agentclientprotocol/sdk` or the hand-written client | hand-written |
| O-8 | Pi over `pi-acp` | no |
| O-9 | kiro and kimi drift from the registry | check live, fix separately |
| O-10 | Resume starts working for `amr` in A3 | accept, with a live check |
| O-11 | Protocol fields for context occupancy and non-USD cost | add them, or accept that they stay dropped |
| O-12 | Process-group spawn so engines can always be stopped | decide with R8's spawn port |
| O-13 | Size exception for `acp/session.ts` if P is not done first | do P |
| O-14 | AMR and OpenCode code inside the shared ACP client: `modelUnavailableErrorCode`, the stderr and retry promoters and the account-failure classifier have **no caller** in Jini or Tovu at `02edbb68` | delete, or give `amr` a profile hook and turn them on. Not decided here |
| O-15 | Remove the unused Gemini parser (212 lines) | yes, separately |

---

## Judge response

`#` = finding number in `CODEX-JUDGE.md`. Each was re-checked against Jini `02edbb68` and the pinned
sources before being accepted. **12 accepted, 1 accepted in part (one sub-point rebutted). Blockers
left: 0.**

| # | Sev | Verdict | Evidence I checked | Fix |
|---|---|---|---|---|
| 1 | Blocker | **Accepted.** One correction: `NativeToolPolicyInput` has four fields, not five | `AR/native-tool-policy.ts:53-58`; `AR/defs/claude.ts:96-146`; `AR/claude-filesystem-policy.ts:136-150`; adapter `new-session-meta.ts:11-30`, `acp-agent.ts:10001-10102`; SDK `sdk.d.ts:1714,2351,2369,2422,2471`; spec `session-setup.mdx:447-453` | §3.6: the variant receives all of `RuntimeBuildOptions`; one policy owner, two renderers; fail closed; six live checks before opt-in. And O-2 now says Claude does not move |
| 2 | Blocker | **Accepted.** Wider than stated: it also hits `opencode` (`defs/opencode.ts:96`), the first planned target | `DA/launch.ts:1567-1568`; `DA/events.ts:1305-1307`; `DA/http-mcp.ts:73-97`; `session-params.ts:14-20,64-77`; Tovu `mcp-injection.ts:71` | §3.4: carriers do not change with transport; two guards; A8 for HTTP in `session/new`, capability-checked, tested through the executor |
| 3 | Major | **Accepted**, with a smaller fix than proposed | `DA/codex/home-staging.ts:234-241`; `home-config.ts:125-221` | Codex keeps `codex-toml`, so staging receives its entry and is not edited at all. Separating isolation from delivery is needed only if delivery ever moves; that is a named STOP in §7 |
| 4 | Major | **Accepted.** Worse than stated: no ACP def resumes today, `amr` included | `DA/launch.ts:1319-1338`; `DA/events.ts:993-1005,1079`; `session.ts:816-823`; no session id in any event the client sends | §3.7, step A3, two-run executor test without the vendor field |
| 5 | Major | **Accepted** | `session.ts:357-358`, `:796-800`; `DA/launch.ts:1240-1250` | G2 corrected in `RESEARCH.md`; §3.8: typed failure, never another model |
| 6 | Major | **Accepted** | `AR/defs/claude.ts:84-87,257`; `session.ts:120-168`; `DA/launch.ts:1319-1338`; spec `session-config-options.mdx:304,374` | §3.8 order; `effort` on the profile; parity test before any native deletion |
| 7 | Major | **Accepted.** Also found: the existing vendor hooks have no route either | route in §3.11; `grep` for `modelUnavailableErrorCode`, `accountFailureClassifier`, `executionProfile` finds no caller outside `session.ts` | §3.11: one request object, every hop and copy listed; Phase A is no longer "agent-runtime only" |
| 8 | Major | **Accepted** | `session.ts:1052`, `:419-426`, `:547`; `text-suppression.ts:1-8`; `rpc.ts:98-122` | A2 moves nothing. Text suppression stays shared and is pinned by A0 on emitted events. The vendor-named code is an owner decision (O-14) |
| 9 | Major | **Accepted** | `AR/native-runtime.ts:54-59`; `AR/detection.ts:518-520`; `AR/launch.ts:21,32-35`; Tovu `agent-daemon-scope.ts:205-210`, `agents.ts:94,180` | §3.3 one catalog; §3.5 two identities; launch adapter keyed by a def field |
| 10 | Major | **Accepted** | `DA/event-translation.ts:50-65,175-186,211-216`; spec `prompt-turn.mdx:427-448` | §3.9: existing fields for USD; occupancy and other units are an owner decision; multi-run test |
| 11 | Major | **Accepted** | `session.ts:1149,1184,1370-1373`; `DA/events.ts:1040-1067`; no `detached` spawn in `DA/`; adapters' shutdown code | §3.10, step A9, O-12 |
| 12 | Major | **Accepted in part.** Three sub-points accepted (Claude argv size, Gemini parser, `home-config.ts`). **One rebutted:** R8 §12.14 exists. The judge read `5bf9c7fb` (331 lines); the file was replaced in `23b2132b` and is 499 lines at the branch tip `32cd78ed`, with §12.14 at line 475. The fault was mine for citing it without a commit | `git log -- …/R8-RUNTIME.md`; ledger rows | `DELETION-LEDGER.tsv`; §4 and §6 recomputed; every base pinned at the top |
| 13 | Major | **Accepted** | `session.ts:1007` takes `(requiredArgs, optionalArgs = {})`; Jini `refactor/size-jini-chat-runtime` `3bcc2a2a` exists, unmerged, files still 1,017 and 603 | Prerequisite P; O-13; practice 2 row corrected |

What changed in the conclusions: the saving (from "a third of the adapter code" to break-even);
Claude (from "last" to "no"); lane K (from 57% retained to 81%); Phase A (from seven agent-runtime
steps to a size prerequisite plus ten steps across two packages).
