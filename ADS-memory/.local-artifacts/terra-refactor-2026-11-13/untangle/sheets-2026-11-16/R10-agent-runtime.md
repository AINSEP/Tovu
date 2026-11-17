# R10 sheet: agent-runtime off platform, oauth and integrations (2 sub-sheets)

Read `COMMON.md` first. Sites: `sites/R10.sites.tsv` (11 sites, 8 files, all in `packages/agent-runtime/src`). Needs: C5 (landed), C6 (landed in `integ/merge-a-2026-11-16`). Revision 2: R10b is rewritten (judge finding 4) and split in two runs. `analytics → agent-runtime` (the other half of the old R10 row) is **gone**: C6 moved the ai-trace types to core; only a stale optional peer is left (G-STALE-DEPS).

| Sub-sheet | Sites | Estimate (Sonnet) |
|---|---|---|
| R10a pure moves (command plan, OAuth URL redaction) | 4 | 45k |
| R10b-1 host ports (guarded reader, proxy env, toolchain bins) through `createNativeAgentRuntime` | 5 | 150k |
| R10b-2 vendor base URLs, OAuth client | 2 + pkce | 90k |

R10a and R10b touch different files except `model-discovery-adapters.ts` (R10a line 6/271, R10b lines 309–332). Run R10a first.

## R10a: pure moves (no port)

```
id: R10a-agent-runtime-pure
jini_files:
  - packages/agent-runtime/src/claude-code-models.ts:43,207        | edit
  - packages/agent-runtime/src/invocation.ts:7,16,37               | edit (the header comment at :7 names platform: reword it, do not delete the reason)
  - packages/agent-runtime/src/model-discovery-adapters.ts:6,271   | edit
  - packages/agent-runtime/src/defs/antigravity/index.ts:2,93      | edit
  - packages/oauth/src/redact.ts                                    | DELETE (4 lines, pure, no imports) -> packages/core/src/text/redact-urls.ts (NEW)
  - api-baseline/jini-ai__core.json, api-baseline/jini-ai__oauth.json, api-baseline/jini-ai__agent-runtime.json | `pnpm api:update` in the commit that changes each surface (core has wave-1 co-writers: INDEX §4, COMMON "generated, never hand-merged")
```
1. **`createCommandInvocation` ×3 → core's pure `planCommandInvocation`** (`core/src/contracts/runtime/command.ts:75`). Platform's function is `createCommandInvocation({ args = [], command, env = process.env }, _options)` (`platform/src/command.ts:27`), and its body is `planCommandInvocation({ command, platform: process.platform, env }, { args, fallbackComSpec: ambientComSpec() })` (`:28`): when the passed `env` has no `ComSpec` (host-built envs), Windows falls back to the **process's own** `ComSpec` (`core/.../command.ts:65`: `env.ComSpec ?? fallbackComSpec ?? "cmd.exe"`). **Revision 3 (Opus review B10): every converted site passes that fallback too**, or the Windows cmd-shim silently changes to a bare `cmd.exe`. agent-runtime is a Node package, so each site passes `platform: process.platform`, the **same env it passed before**, and `fallbackComSpec: process.env.ComSpec`, all through one local helper (below):
   - `claude-code-models.ts:207` passes `env` → `planCommandInvocation({ command: bin, platform, env }, { args: [...CLAUDE_CODE_INITIALIZE_ARGS], fallbackComSpec })`.
   - `model-discovery-adapters.ts:271` passes `input.context.env` → same pattern.
   - `invocation.ts:37`: read the call; if it passes no `env`, pass `process.env` explicitly (that was the default).
   - CHECK first that platform's function is only a wrapper over the core planner plus the ambient `ComSpec` fallback (`sed -n 20,60p packages/platform/src/command.ts`). The fallback is known and handled above (it is a value read, not a port). If it does anything else the planner does not (line 52 re-invokes itself with `execPath`: read why; that is `createPackageManagerInvocation`, which the three sites do not call), **STOP** and report: the extra behaviour needs a port, not a repoint.
2. **`redactOAuthUrls` → core** as `packages/core/src/text/redact-urls.ts`, exported from `@jini-ai/core/text` (`core/src/text/index.ts`), renamed `redactUrlsByPattern`? **No: keep the name `redactOAuthUrls`** (one refactor type per change). Delete `oauth/src/redact.ts`, remove it from oauth's index, and repoint every importer: `rg -n "redactOAuthUrls" packages apps examples` in both repos (Tovu importers are a paired commit). Move its test file to core. Core rule check: no `node:`, no state.

### Tests to write first
| # | Asserts | Fails when |
|---|---|---|
| T1 (agent-runtime `__tests__/invocation.plan.unit.test.ts`) | on a simulated `win32` + `.cmd` command: (a) the result has the cmd-shim form with `windowsVerbatimArguments` and uses the `ComSpec` from the **passed** env; (b) **the passed env has no `ComSpec`** and the simulated ambient one is `C:\fake\cmd.exe` → the shim uses the ambient one, not `cmd.exe` (characterize (b) on old code through platform's function first: GREEN, then RED with the fallback removed); on `linux` it passes through | env not forwarded (falls back to nothing); ambient ComSpec fallback dropped; platform hard-coded |
| T2 | `execAgentFile` hands `execute` the planned `command`/`args` unchanged for a plain binary | args dropped |
To simulate platform and the ambient `ComSpec` in T1, the three call sites take both from one small local helper in `invocation.ts`, `ambientCommandShell({ platform = process.platform, ambientEnv = process.env } = {})` → `{ platform, fallbackComSpec: ambientEnv.ComSpec }` (the same shape as daemon's `commandShell` port, `daemon/src/ports/runtime.ts:15`); tests override it through each function's existing optional argument; do not stub `process.platform` or `process.env` globally. The values are read on every call (never hoisted).

### Steps
1. T1–T2 (RED on the helper's absence), then the three repoints. Commit. 2. Pair: move `redactOAuthUrls` to core + repoint all importers (Jini commit, Tovu commit if any). No new core subpath (it joins `./text`); the same commits carry `pnpm api:update`, the debt keys for the removed `agent-runtime → platform/command` and `→ oauth` (redact) edges, and changesets for core (minor) and oauth (breaking).

## R10b: ports (revision 2: two runs, R10b-1 then R10b-2)

Judge finding 4 was right: adding ports to "the state" does not reach `spawnEnvForAgent` (`env.ts:95`), `validateFilesystemLaunch` (`claude-filesystem-policy.ts:12`) or `providers/pkce.ts` (no state argument; pkce builds `guard` at module load, `:135`), and the default state is one **module instance** (`runtime-state.ts:41` `defaultRuntimeState`, 25 references in 7 production files), so a port stored there would be shared by every host. **OD-4 is closed by the owner rule "DI via typed ports from the host":** the dependency owner is the existing `createNativeAgentRuntime` (`native-runtime.ts:36`); ports are **required** there; functions without a state take the port as an explicit required field; nothing falls back to a shared instance.

```
id: R10b-1-agent-runtime-host-ports   (~150k)      id: R10b-2-agent-runtime-oauth-catalog   (~90k)
needs: N1, R10a, R8b (see precondition)             needs: R10b-1
jini_files (R10b-1):
  - packages/agent-runtime/src/ports.ts                              | NEW (≤ 80 lines)
  - packages/agent-runtime/src/runtime-state.ts                      | edit (optional `ports` on the state; `requirePlatformPorts`; **NEW class `AgentRuntimeConfigError`**, see below)
  - api-baseline/jini-ai__agent-runtime.json, api-baseline/jini-ai__node-adapters.json | `pnpm api:update` in the commits that change those surfaces
  - packages/agent-runtime/src/native-runtime.ts:36-58               | edit (`ports` required; `runtime.ports`)
  - packages/agent-runtime/src/runtime-def-binding.ts                | edit (binds the Claude builder, same pattern as Codex at :18)
  - packages/agent-runtime/src/runtime-port-bindings.ts:65-68        | edit (`bindFilesystem({ runtime })`)
  - packages/agent-runtime/src/claude-filesystem-policy.ts:4,12-27   | edit
  - packages/agent-runtime/src/defs/claude.ts:140-150,247-249        | edit
  - packages/agent-runtime/src/env.ts:10,95,98 ; detection.ts:247    | edit
  - packages/agent-runtime/src/executables.ts:12,27,150-161          | edit (reword the header note at :12, keep its reason)
  - packages/agent-runtime/src/__tests__/fakes/platform-ports.ts     | NEW
  - packages/node-adapters/src/agent-runtime.ts + test + `./agent-runtime` export | NEW (type-only import of `@jini-ai/agent-runtime`)
  - packages/server/src/kernel-base.ts:122 ; examples/minimal-host/src/index.ts:50 ; examples/reference-web/src/daemon.ts:344 | edit (the 3 Jini constructions)
  - packages/agent-runtime/package.json, scripts/injection-debt.json, pnpm-lock.yaml | same commit as the last platform import
tovu_files (R10b-1 pair): apps/website/src/server/runtime/composition/jini-agent-runtime-ports.ts (NEW);
  the 7 constructions: apps/website/src/assistant/agents.ts:80,180,266 ; server/inbound/assistant/agent-daemon-scope.ts:202 ;
  server/runtime/composition/app.ts:382 ; composition/deps.ts:1093 ; apps/desktop/src/main/index.ts:452 (+ a desktop ports file beside it)
jini_files (R10b-2): model-discovery-adapters.ts:309-332 ; providers/pkce.ts ; providers/oauth-provider.ts:34 ; providers/index.ts:34 ; package.json ; debt ; lockfile
```
**Precondition (command; otherwise STOP):**
```bash
rg -n "validateFilesystemLaunch|spawnEnvForAgent|defaultRuntimeState" packages/daemon/src -g '!**/__tests__/**'   # prints nothing
```
On merge-final daemon still has five such lines (`daemon/src/agent-executor/launch.ts:218` and `:274` use `defaultRuntimeState`; `:1135,1159,1164` call `validateFilesystemLaunch`). R8b (daemon design `R8-RUNTIME.md` §12.5 step 6 and §12.8) routes them through the `AgentRuntimePort` and its acceptance is this same command (INDEX §2). Until R8b has landed, a required reader port would break daemon in a file R8 owns.

**`AgentRuntimeConfigError` is new (Opus review B7: it does not exist on merge-final; `rg -n "ConfigError" packages/agent-runtime/src` prints nothing).** R10b-1 step 1 creates it in `runtime-state.ts` beside `requirePlatformPorts`; that file is already exported by the root entry (`src/index.ts:115` `export * from './runtime-state.js'`), so no new export line is added (COMMON S3). Shape:
```ts
/** A host built the runtime without the ports a function needs. Plain words; `details` is what Copy details shows. */
export class AgentRuntimeConfigError extends Error {
  readonly code = 'agent_runtime_ports_missing' as const;
  readonly details: string;
  constructor(required: { message: string; details: string }, _optional: Record<string, never> = {}) {
    super(required.message); this.name = 'AgentRuntimeConfigError'; this.details = required.details;
  }
}
```
The two messages, in plain words: "The agent runtime was started without its connections to this computer, so it cannot <task>. Restart the app; if this keeps happening, copy the details into a bug report." (`details`: the function that asked and which port field was missing) and "This agent runtime state already belongs to another host. Restart the app; if this keeps happening, copy the details into a bug report." (`details`: the two host labels if known, else "two port objects"). T6 asserts the class, the `code`, and that `details` names the function.

### Ports (local to agent-runtime, `src/ports.ts`; one consumer each)
```ts
import type { GuardedReaderPort, RuntimePlatform } from '@jini-ai/core/contracts/runtime';
type Env = Readonly<Record<string, string | undefined>>;
export interface ToolchainBinsPort { wellKnownUserToolchainBins(required: { home: string; includeSystemBins: boolean; env: Env }): string[] }
export interface ProxyEnvPort {
  resolveSystemProxyEnv(required?: Record<string, never>): Env;
  mergeProxyAwareEnv(required: { platform: RuntimePlatform; systemProxyEnv: Env; baseEnv: Env; configuredEnv: Env }): Record<string, string | undefined>;
}
export type VendorBaseUrlsPort = () => Promise<Readonly<Record<string, string>>>;
export interface OAuthClientPort { /* exactly the 8 values pkce.ts imports from @jini-ai/oauth today (pkce.ts:28-33); copy each signature */ }
export interface AgentRuntimePlatformPorts { readonly guardedReader: GuardedReaderPort; readonly toolchain: ToolchainBinsPort; readonly proxyEnv: ProxyEnvPort; readonly vendorBaseUrls: VendorBaseUrlsPort; readonly oauth: OAuthClientPort }
```
The whole interface exists from R10b-1, so hosts bind all five fields once; R10b-2 only starts **reading** the last two (no second host pair). If `RuntimePlatform` does not line up with platform's `mergeProxyAwareEnv` first parameter without a cast, **STOP** (`pnpm --filter @jini-ai/node-adapters build`).

### How each function reaches its port (the complete path)
| Function | Path |
|---|---|
| `createNativeAgentRuntime({ env, ports }, optional)` | `ports` is required. It builds `createAgentRuntimeState({}, { ports })` when no state is passed; when a state is passed, `state.ports` must be absent (then it is set) or the same object; a different object throws `AgentRuntimeConfigError` ("this state is bound to another host's ports"). `NativeAgentRuntime` gains `readonly ports`. |
| `requirePlatformPorts({ state })` (new, `runtime-state.ts`) | returns `state.ports` or throws `AgentRuntimeConfigError` naming the function that asked. `defaultRuntimeState` **never** gets ports: a call that falls back to it fails closed. |
| `wellKnownUserToolchainBins` at `executables.ts:158` | `requirePlatformPorts({ state }).toolchain…` (`state` is already in scope there). Comment at `:152-157` and `env: hasOverride ? {} : env` stay. |
| `spawnEnvForAgent({ agentId, baseEnv, proxyEnv }, { configuredEnv, systemProxyEnv = proxyEnv.resolveSystemProxyEnv(), hooks })` | `proxyEnv` is a new **required** field. The default stays a default parameter (read on every call, not hoisted). Only production caller: `detection.ts:247` (`probeEnvForLaunch` has `state`): passes `requirePlatformPorts({ state }).proxyEnv`. Line 98 becomes `proxyEnv.mergeProxyAwareEnv({ platform: process.platform, systemProxyEnv, baseEnv, configuredEnv: expandedConfiguredEnv })`. |
| `validateFilesystemLaunch({ …, guardedReader })` | new required field; the body calls `guardedReader.createReader({ rootPath: root, denyRules, limits })` with today's literals (`:19-22`). Callers: (1) `runtime-port-bindings.ts:68` → `bindFilesystem({ runtime })` closes over `runtime.ports.guardedReader`; the bound `validateLaunch(required)` keeps its public shape (the launcher never passes ports: file header). (2) `defs/claude.ts:145` → next row. |
| Claude `buildArgs` (`defs/claude.ts:247`) | export `createClaudeBuildArgs({ guardedReader })` holding today's body; the static def's `buildArgs` is that builder made with a reader whose `createReader` throws `AgentRuntimeConfigError` (an unbound def cannot validate a filesystem launch: fail closed). `bindRuntimeAgentDef` swaps it when `def.buildArgs === claudeAgentDef.buildArgs`, exactly as it already does for Codex (`runtime-def-binding.ts:18`), using `requirePlatformPorts({ state }).guardedReader`. |
| `resolveProviderBaseUrl` / `defaultProviderBaseUrl` (`model-discovery-adapters.ts:309-332`) — R10b-2 | the lazy `import('@jini-ai/integrations/…')` default and `ProviderCatalogImport` are deleted; the function reads `requirePlatformPorts({ state }).vendorBaseUrls()` (its caller chain starts at `getRuntimeModelDiscoveryDeps({ state })`). The two inline `import('…')` types (`:316`, `:332`) become a local union of the provider ids this file uses. The existing error message for a failed load is kept for a rejected port call (cause attached). |
| `providers/pkce.ts` — R10b-2 | becomes `createPkceClient({ oauth }: { oauth: OAuthClientPort }, _optional = {})` returning today's exported functions; `guard`, `clock` and the pending-authorization store are created **inside** the factory (no module-load read of a port). `providers/index.ts:34` `export * from './pkce.js'` is a barrel line: replace it with the named exports that remain. `providers/oauth-provider.ts:34` takes the client as a required field of its own factory/required object; trace upward (`rg -n "oauth-provider" packages/agent-runtime/src`) until a function that has `state` or a `NativeAgentRuntime`, and take `requirePlatformPorts({ state }).oauth` there. If the chain ends at a module-level constant with no state, **STOP** and report the chain. |

### Tests to write first
| # | Asserts | Fails when |
|---|---|---|
| T3 | `spawnEnvForAgent` passes `{ platform, systemProxyEnv, baseEnv, configuredEnv }` as four distinct sentinels in the right fields; resolver called once per call (two calls → 2) | swapped fields; hoisted default |
| T4 | `validateFilesystemLaunch` calls `createReader` with `rootPath` = the realpath, empty deny rules and the exact limits literal; a path outside the root still throws (existing cases, now with a fake reader **and** once with the real Node binding in node-adapters' test) | limits changed; guard removed |
| T5 | with an override home the toolchain port receives `env: {}` and `includeSystemBins: false` | env leak |
| T6 | a port-needing function called with no state (falls to `defaultRuntimeState`) throws `AgentRuntimeConfigError`; an unbound Claude def with `filesystemRoot` set throws the same class | shared fallback; silent skip of the filesystem check |
| T9 (isolation) | two runtimes built with two different fake port sets: each runtime's detection/launch calls reach only its own fakes; passing runtime A's state to `createNativeAgentRuntime` with B's ports throws | ports shared between hosts |
| T7 (R10b-2) | known id → the port's value; unknown id → today's behaviour (characterize on old code first); rejected port → today's message with `cause` | fallback changed |
| T8 (R10b-2) | pinned `Date` and entropy; authorize URL, token-exchange and refresh requests are byte-identical before and after (characterize through the real `@jini-ai/oauth` first, then through a recording fake); two clients do not share pending authorizations | argument renamed or dropped; module-level store |

Where T8 lives (Opus review B13): the **recording-fake** half is in agent-runtime (`providers/__tests__/pkce.client.unit.test.ts`). The **real-`@jini-ai/oauth`** half is a test of two packages together, so it lives in `packages/integration-tests/src/agent-runtime/pkce-oauth.test.ts` (that package exists from G-TESTS setup, wave 1; R10b-2 runs in wave 5). Characterize on old code first in that file, then keep it green across the change. agent-runtime's own tests gain no import of `@jini-ai/oauth`, so the per-owner `scripts/injection-test-debt.json` ratchet does not grow.
| T10 (node-adapters) | recording fakes of platform's functions: `mergeProxyAwareEnv` gets the four values **positionally in order**; `createGuardedFileReader` gets `filesystem` from `createNodeGuardedReaderFilesystem({})` and `excludedListingDirs` in the object platform expects | order or field placement wrong |

### Steps (each commit green alone)
R10b-1: 1. `ports.ts`, `requirePlatformPorts`, fakes, optional `ports` on the state, T6 (state part). No caller changes yet. 2. node-adapters `./agent-runtime` (`nodeAgentRuntimeHostPorts` = `{ guardedReader, toolchain, proxyEnv } satisfies Pick<AgentRuntimePlatformPorts, …>`) + T10. 3. **One pair:** `ports` required on `createNativeAgentRuntime` + the 3 Jini constructions + every agent-runtime test that constructs a runtime (use the fakes) — then the Tovu commit (7 constructions + the two port files). 4. toolchain (T5). 5. proxy env (T3). 6. reader + Claude builder + `bindFilesystem` (T4, T6 def part, T9). 7. Delete `@jini-ai/platform` from agent-runtime's manifest with its debt keys.
R10b-2: 1. T7 + vendor base URLs. 2. T8 + pkce factory. 3. Delete `@jini-ai/oauth` and `@jini-ai/integrations` from the manifest with their debt keys and any manifest-assertion test.

### Host wiring
```ts
// Tovu apps/website/src/server/runtime/composition/jini-agent-runtime-ports.ts (the desktop file has the same body)
import { nodeAgentRuntimeHostPorts } from '@jini-ai/node-adapters/agent-runtime';
import { VENDOR_API_BASE_URLS } from '@jini-ai/integrations/media-providers/catalog';   // static: declared deps are never imported lazily
import { /* the 8 names */ } from '@jini-ai/oauth';
export const agentRuntimePlatformPorts = {
  ...nodeAgentRuntimeHostPorts, vendorBaseUrls: async () => VENDOR_API_BASE_URLS, oauth: { /* the 8 names, by reference */ },
} satisfies AgentRuntimePlatformPorts;
```
`packages/server/src/kernel-base.ts` builds the same object in the preset (it may import all three packages). A static catalog import changes when that module loads in Tovu (today it loads on first use): confirm it has no import-time side effect (`rg -n "^(const|let) .*= (await|new |create)" packages/integrations/src/media-providers/catalog*`); if it does, **STOP**.

### STOP (commands above)
- the daemon precondition; a cast is needed on a binding; the pkce chain ends in a module constant; a caller outside this inventory constructs a runtime or a state (`rg -n "createNativeAgentRuntime\(|createAgentRuntimeState\(" packages apps examples -g '!**/dist/**'` in both repos lists more production sites than this sheet).
- R10a's own STOP: `platform/src/command.ts` does more than the pure planner.
