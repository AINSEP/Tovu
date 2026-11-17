# R10 sheet: agent-runtime off platform, oauth and integrations (2 sub-sheets)

Read `COMMON.md` first. Sites: `sites/R10.sites.tsv` (11 sites, 8 files, all in `packages/agent-runtime/src`). Needs: C5 (landed), C6 (done on `refactor/c6`). `analytics → agent-runtime` (the other half of the old R10 row) is **gone**: C6 moved the ai-trace types to core; only a stale optional peer is left (G-STALE-DEPS).

| Sub-sheet | Sites | Estimate (Sonnet) |
|---|---|---|
| R10a pure moves (command plan, OAuth URL redaction) | 4 | 45k |
| R10b ports (guarded reader, proxy env, toolchain bins, vendor base URLs, OAuth client) | 7 | 140k |

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
```
1. **`createCommandInvocation` ×3 → core's pure `planCommandInvocation`** (`core/src/contracts/runtime/command.ts:75`). Platform's function is `createCommandInvocation({ args = [], command, env = process.env }, _options)` (`platform/src/command.ts:27`). The pure form takes `{ command, platform, env }, { args }`. agent-runtime is a Node package, so each site passes `platform: process.platform` and the **same env it passed before**:
   - `claude-code-models.ts:207` passes `env` → `planCommandInvocation({ command: bin, platform: process.platform, env }, { args: [...CLAUDE_CODE_INITIALIZE_ARGS] })`.
   - `model-discovery-adapters.ts:271` passes `input.context.env` → same pattern.
   - `invocation.ts:37`: read the call; if it passes no `env`, pass `process.env` explicitly (that was the default).
   - CHECK first that platform's function is only a wrapper over the core planner (`sed -n 20,60p packages/platform/src/command.ts`). If it does anything the planner does not (line 52 re-invokes itself with `execPath`: read why), **STOP** and report: the extra behaviour needs a port, not a repoint.
2. **`redactOAuthUrls` → core** as `packages/core/src/text/redact-urls.ts`, exported from `@jini-ai/core/text` (`core/src/text/index.ts`), renamed `redactUrlsByPattern`? **No: keep the name `redactOAuthUrls`** (one refactor type per change). Delete `oauth/src/redact.ts`, remove it from oauth's index, and repoint every importer: `rg -n "redactOAuthUrls" packages apps examples` in both repos (Tovu importers are a paired commit). Move its test file to core. Core rule check: no `node:`, no state.

### Tests to write first
| # | Asserts | Fails when |
|---|---|---|
| T1 (agent-runtime `__tests__/invocation.plan.unit.test.ts`) | on a simulated `win32` + `.cmd` command, the result has the cmd-shim form with `windowsVerbatimArguments` and uses the `ComSpec` from the **passed** env; on `linux` it passes through | env not forwarded (falls back to nothing); platform hard-coded |
| T2 | `execAgentFile` hands `execute` the planned `command`/`args` unchanged for a plain binary | args dropped |
To simulate platform in T1, the three call sites take `platform` from one small local helper `currentPlatform()` in `invocation.ts` that tests can override through the function's existing optional argument; do not stub `process.platform` globally.

### Steps
1. T1–T2 (RED on the helper's absence), then the three repoints. Commit. 2. Pair: move `redactOAuthUrls` to core + repoint all importers (Jini commit, Tovu commit if any). Coordinator: no new core subpath (it joins `./text`); changesets for core (minor) and oauth (breaking).

## R10b: ports

```
id: R10b-agent-runtime-ports
jini_files:
  - packages/agent-runtime/src/ports.ts                              | NEW (≤ 80 lines)
  - packages/agent-runtime/src/claude-filesystem-policy.ts:4,19     | edit
  - packages/agent-runtime/src/env.ts:10,95,98                       | edit
  - packages/agent-runtime/src/executables.ts:12,27,158              | edit (reword the header note at :12)
  - packages/agent-runtime/src/model-discovery-adapters.ts:309-332   | edit
  - packages/agent-runtime/src/providers/pkce.ts:28-33 + its users   | edit (175 lines)
tovu_file: apps/website/src/server/runtime/composition/jini-agent-runtime-ports.ts (NEW)
```

### Ports (all local to agent-runtime, `src/ports.ts`; one consumer each, DESIGN B4)
```ts
import type { GuardedReaderPort } from '@jini-ai/core/contracts/runtime';
export interface ToolchainBinsPort { wellKnownUserToolchainBins(required: { home: string; includeSystemBins: boolean; env: Readonly<Record<string, string | undefined>> }): string[] }
export interface ProxyEnvPort {
  resolveSystemProxyEnv(required?: Record<string, never>): Readonly<Record<string, string | undefined>>;
  mergeProxyAwareEnv(required: { platform: string; systemProxyEnv: Readonly<Record<string, string | undefined>>; baseEnv: Readonly<Record<string, string | undefined>>; configuredEnv: Readonly<Record<string, string | undefined>> }): Record<string, string | undefined>;
}
export type VendorBaseUrlsPort = () => Promise<Readonly<Record<string, string>>>;
export interface OAuthClientPort { /* exactly the 8 functions pkce.ts imports today; copy each signature from packages/oauth/src */ }
export interface AgentRuntimePlatformPorts { readonly guardedReader: GuardedReaderPort; readonly toolchain: ToolchainBinsPort; readonly proxyEnv: ProxyEnvPort; readonly vendorBaseUrls: VendorBaseUrlsPort; readonly oauth: OAuthClientPort }
```
**Behavioural traps:**
- `mergeProxyAwareEnv` is **positional** in platform: `(process.platform, systemProxyEnv, baseEnv, expandedConfiguredEnv)` (`env.ts:98`, `platform/src/proxy-env.ts:81`). The port is object-shaped, so the host binding is an arrow that maps the four fields to the four positions **in that order**. T3 fails when two are swapped.
- `spawnEnvForAgent`'s `systemProxyEnv = resolveSystemProxyEnv()` is a **default parameter**, so it is read on every call, not once at load (`env.ts:95`). Keep it per call: the new default is `ports.proxyEnv.resolveSystemProxyEnv()` evaluated in the same position. Do not hoist it.
- `wellKnownUserToolchainBins` is called inside a cache keyed by home/env (`executables.ts:150-161`); the comment at `:152-157` explains why an override home passes an **empty env**. The comment and the `env: hasOverride ? {} : env` argument both stay.
- `claude-filesystem-policy.ts:19` passes `filesystem: createNodeGuardedReaderFilesystem({})` to platform; `GuardedReaderPort.createReader({ rootPath, denyRules, limits }, { excludedListingDirs })` has **no filesystem field**: the host binding supplies the Node filesystem. T4 asserts the deny rules and limits object arrive unchanged (class: filesystem read guard).
- `model-discovery-adapters.ts:318-326` already has an injectable `ProviderCatalogImport` with a default that does `import('@jini-ai/integrations/media-providers/catalog')` through `loadOptionalPeer`. Remove the default (it is a lazy import of another package); the catalog function becomes the required `vendorBaseUrls` port; the two inline `import('…')` types at `:316,332` are replaced by `Readonly<Record<string, string>>` keyed by the provider ids agent-runtime itself uses (declare the id union locally).

### How the ports reach free functions (owner decision OD-4, recommendation applied here)
agent-runtime's functions are free functions with an optional `state?: AgentRuntimeState` argument defaulting to a module instance (`executables.ts:89,277`). The sheet adds `platformPorts?: AgentRuntimePlatformPorts` to that state object and one exported `bindAgentRuntimePlatformPorts({ ports }, { state })`. A function that needs a port and finds none throws `AgentRuntimeConfigError` (new, typed, names the missing port). This keeps every existing call signature. The alternative (thread a `ports` argument through every exported function and every caller in daemon, server and Tovu) is cleaner but is ~+150k and touches R8's files; do it only if the owner says so.

Inventory before editing (lesson 2): `rg -n "spawnEnvForAgent|userToolchainBinDirs|agentSearchDirs|resolveOnPath|validateFilesystemLaunch|resolveProviderBaseUrl|generateCodeVerifier|exchangeCodeForToken|refreshAccessToken" packages apps examples -g '!**/dist/**'` in both repos; list callers and tests in the report. Tests that construct their own `state` must bind fake ports (a `createFakeAgentRuntimePlatformPorts()` in `src/__tests__/fakes/platform-ports.ts`, Map-backed, no platform import).

### Tests to write first
| # | Asserts | Fails when |
|---|---|---|
| T3 | `spawnEnvForAgent` passes `{ platform, systemProxyEnv, baseEnv, configuredEnv }` with the four distinct sentinel objects in the right fields; resolver called once per call (call twice → 2) | swapped fields; hoisted default |
| T4 | `validateFilesystemLaunch` calls `createReader` with `rootPath` = the realpath, empty deny rules and the exact limits literal | limits changed |
| T5 | with an override home, the toolchain port receives `env: {}` and `includeSystemBins: false` | env leak |
| T6 | unbound state → `AgentRuntimeConfigError` naming the port, not `TypeError` | generic error |
| T7 | `resolveProviderBaseUrl` returns the port's value for a known id and the existing fallback for an unknown one (read the old behaviour first and pin it) | fallback changed |
| T8 (pkce) | pin `Date`/entropy; `buildAuthorizeUrl`, `exchangeCodeForToken`, `refreshAccessToken` produce the same URL, body and headers through a fake `OAuthClientPort` that records its arguments as through the real functions (characterize on old code first) | argument renamed or dropped |

### Steps
1. `ports.ts` + fakes + `bind…` + T6. 2. reader (T4). 3. proxy env (T3). 4. toolchain (T5). 5. vendor base URLs (T7). 6. pkce (T8). 7. Pair: Tovu wiring file; then delete `@jini-ai/platform`, `@jini-ai/oauth`, `@jini-ai/integrations` from `packages/agent-runtime/package.json` and update any manifest-assertion test.
Each of steps 2–6 is a pair only if the default binding disappears for a host: because the state starts unbound, **step 1's pair must land the Tovu and `packages/server` bind calls first** (bind before first use; put the call where each host creates its agent executor: `packages/server/src/kernel-base.ts`, Tovu `rg -n "createAgentExecutor" apps/website/src`).

### Tovu wiring
```ts
// apps/website/src/server/runtime/composition/jini-agent-runtime-ports.ts
export const agentRuntimePlatformPorts = {
  guardedReader: { createReader: (r, o) => createGuardedFileReader({ ...r, filesystem: createNodeGuardedReaderFilesystem({}), ...o }) },
  toolchain: { wellKnownUserToolchainBins: (r) => wellKnownUserToolchainBins(r) },
  proxyEnv: { resolveSystemProxyEnv: () => resolveSystemProxyEnv(), mergeProxyAwareEnv: (r) => mergeProxyAwareEnv(r.platform as NodeJS.Platform, r.systemProxyEnv, r.baseEnv, r.configuredEnv) },
  vendorBaseUrls: async () => (await import('@jini-ai/integrations/media-providers/catalog')).VENDOR_API_BASE_URLS,
  oauth: { /* the 8 @jini-ai/oauth functions, one arrow each */ },
} satisfies AgentRuntimePlatformPorts;
```
The `as NodeJS.Platform` above is a cast on a binding line and is therefore **not allowed as written**: type the port's `platform` field as core's `RuntimePlatform` (`core/contracts/runtime/platform.ts`) and check it lines up with platform's parameter; if it does not, STOP. Check whether `createGuardedFileReader` takes `excludedListingDirs` in the first or second object before spreading `o`.

### STOP
- `platform/src/command.ts` does more than the pure planner (R10a). The OAuth port would need more than the 8 imported functions. A caller outside this lane's inventory constructs agent-runtime state.
