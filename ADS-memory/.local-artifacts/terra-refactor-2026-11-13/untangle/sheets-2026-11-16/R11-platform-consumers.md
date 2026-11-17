# R11 sheet: platform consumers and the search registration (5 sub-sheets, one Sonnet run each)

Revision 2 (judge findings 1, 5, 8, 9, 11, 16; owner decision OD-3). Read `COMMON.md` first. Sites: `sites/R11.sites.tsv` (17 sites, 15 files, 7 owner packages, all class `work`). Needs: C5 (landed: `@jini-ai/core/contracts/runtime`), **N1** (`@jini-ai/node-adapters` exists with `./fs` and `./process`), G-TESTS setup (`@jini-ai/core/contracts/runtime/testing` fakes).

**OD-3 changes this sheet:** no adapter moves to the server preset, and no host hand-writes a binding. A domain package keeps its own logic and takes the port as a **required** argument; the Node **binding** of a port lives in `@jini-ai/node-adapters`; the preset, the examples and Tovu import the binding from there at the place they already build the feature (existing owners: no new Tovu wiring file, so no file is shared between sub-sheets).

| Sub-sheet | Packages | Sites | Estimate (Sonnet) |
|---|---|---|---|
| R11a | agent-plugins (`src/lifecycle`), plugins, node-adapters `./agent-plugins` | 5 | 120k |
| R11b-1 | mcp (`agent-install`, `federation`), sidecar | 6 | 120k |
| R11b-2 | mcp `core/config.ts` + `core/tokens.ts` (secret writer) | 1 | 80k |
| R11b-3 | integrations, node-adapters `./http` | 3 | 80k |
| R11c | devops, search | 3 | 70k |

Write sets are disjoint except `packages/node-adapters/package.json` (R11a adds `./agent-plugins`, R11b-3 adds `./http`) and `packages/mcp/package.json` (R11b-1, R11b-2): INDEX §3 is the order (revision 3 fixed this line, Opus review B3): **R11a and R11c in wave 2; R11b-1 and R11b-3 in wave 3; R11b-2 in wave 4** (after R11b-1, because both edit `packages/mcp/package.json`).

## Port shapes that already exist (verified in `packages/core/src/contracts/runtime/`)
```ts
// file-lock.ts:57
interface FileLockPort<Filesystem = never> { withFileLock<T>(required: { lockPath: string; run: (lock: HeldFileLock) => Promise<T> | T }, optional?: FileLockPortOptions<Filesystem>): Promise<T> }
// fs.ts:9
interface AtomicFileWriterPort<Filesystem = never> {
  writeText(required: { filePath: string; content: string | Uint8Array }, optional?: AtomicWritePortOptions<Filesystem>): Promise<void>;
  writeJson(required: { filePath: string; data: unknown }, optional?: AtomicWritePortOptions<Filesystem> & { trailingNewline?: boolean }): Promise<void>;
  backupOriginalOnce(required: { filePath: string }, optional?: Record<string, never>): Promise<void> }
// http.ts:48, :53
interface HttpFetchPort { fetchWithTimeout(required: { url; timeoutMs }, optional?: { init? }): Promise<Response>; readResponseText(required: { response }, optional?: TextReadOptions): Promise<string> }
interface GuardedHttpPort { createClient(required: GuardedHttpRequired): HttpClientPort; fetch(required: { client; url; timeoutMs }, optional?: {...}): Promise<Response> }
// process.ts:47
interface ProcessControlPort { listProcessSnapshots(required?, optional?); stopProcesses(required: { pids }); waitForProcessExit(required: { pid }, optional?) }
// command.ts:75 (pure) planCommandInvocation({ command, platform, env }, { args, fallbackComSpec })
```
**Behavioural traps (lesson 12), each has a test below:**
- The port's option that carries a filesystem is named `filesystem` on `FileLockPortOptions` but `fs` on `AtomicWritePortOptions`. agent-plugins passes both today (`persistent-state.ts:16`, `update-store.ts:99`); keep each name as it is.
- `ProcessControlPort.stopProcesses` takes `{ pids }`, `waitForProcessExit` takes `{ pid }`. sidecar's node adapter calls the platform functions **positionally** today (`supervisor-node.ts:78` `waitForProcessExit(pid)`, `:167` `stopProcesses(pids)`). Verified: platform's functions are positional (`process.ts:292` `waitForProcessExit(pid, timeoutMs = 5000)`, `:570` `stopProcesses(pids)`), so the host binding is an arrow per method that maps the object to the positions (`waitForProcessExit: (r, o) => waitForProcessExit(r.pid, o?.timeoutMs)`), and the test asserts the pid and the timeout arrive.
- `planCommandInvocation` needs `platform` and `env` explicitly; `createCommandInvocation` defaulted `env = process.env` (`platform/src/command.ts:27`). Every converted call site must pass the env it used before (some pass `env`, some rely on the default).
- `FileLockPortOptions.sleep` takes `{ durationMs }`; agent-plugins' clock takes `{ ms }`. The existing mapping arrows (`persistent-state.ts:18`, `activation.ts:824`) stay.

---

## R11a: agent-plugins lifecycle and plugins host (5 sites)

```
id: R11a-lifecycle-file-ports
precondition (commands; a miss is a STOP):
  rg -n "export interface FileLockPort" packages/core/src/contracts/runtime/file-lock.ts          -> hit
  rg -n "fakeFileLock|fakeAtomicWriter" packages/core/src/contracts/runtime/testing.ts            -> hit (G-TESTS setup landed)
  test -f packages/node-adapters/src/fs.ts                                                         -> N1 landed
jini_files:
  - packages/agent-plugins/src/lifecycle/ports.ts                 | edit (2 required ports)
  - packages/agent-plugins/src/lifecycle/persistent-state.ts:4,15 | edit
  - packages/agent-plugins/src/lifecycle/activation.ts:52,819     | edit (935 lines: already over 500; must not grow)
  - packages/agent-plugins/src/lifecycle/update-store.ts:2,99     | edit
  - packages/agent-plugins/src/lifecycle/node.ts (39 lines)       | git mv -> packages/node-adapters/src/agent-plugins.ts (+ `./agent-plugins` export, `jini.entries`)
  - packages/agent-plugins/src/lifecycle/__tests__/unit/{node-sleep.unit,native-effects.contract}.test.ts | git mv -> packages/node-adapters/src/__tests__/ (they test the Node adapter itself)
  - constructors (same commit): examples/neutral-host/src/neutral-host/support/host.ts:68 ; packages/agent-plugins/tests/plugin-uninstall-message.unit.test.ts:29 ; src/lifecycle/__tests__/test-support.ts ; __tests__/unit/{error-codes-and-grammar,lifecycle-edge-paths,stale-plugin-lock}.unit.test.ts
  - docs that name `lifecycle/node`: CAPABILITIES.md, packages/agent-plugins/{README.md,API.md,docs/spec/api.spec.md}
  - packages/plugins/src/host/node/source-drafts.ts:8,45,154,173  | edit
  - packages/{agent-plugins,plugins,node-adapters}/package.json, scripts/injection-debt.json, pnpm-lock.yaml, API baseline | same commit as the edge
tovu_files (pair): apps/website/src/features/agent-plugins/lifecycle.ts (imports `createNodeAgentPluginEffects` today), the Tovu caller of `createPluginSourceService` (rg in step 3), and the manifests COMMON names for the first `@jini-ai/node-adapters` import
```

### Decisions
1. **agent-plugins:** `AgentPluginLifecyclePorts` (`ports.ts:40`) gains two **required** fields, `readonly fileLock: FileLockPort<FilesystemPort>` and `readonly atomicWriter: Pick<AtomicFileWriterPort<FilesystemPort>, 'writeJson'>` (`FilesystemPort` is the package's own type, `ports.ts:9`), also in `AgentPluginLifecycleRequired` (`ports.ts:76`). Required, not defaulted: a default would re-import platform.
2. **Call sites:** `withFileLock(` → `ports.fileLock.withFileLock(` at `persistent-state.ts:15` and `activation.ts:819`; `writeJsonFileAtomicAsync(` → `ports.atomicWriter.writeJson(` at `update-store.ts:99`. Arguments byte-identical. Delete the three platform imports.
3. **The Node effects move to `@jini-ai/node-adapters/agent-plugins`** (not the preset). `createNodeAgentPluginEffects` keeps its name, signature and body; its `./ports.js` type import becomes `import type { … } from '@jini-ai/agent-plugins/lifecycle'` (type-only: allowed for a runtime-adapter; if that entry does not export `AgentPluginClockPort`, `AgentPluginIdsPort`, `AgentPluginProcessPort`, `FilesystemPort`, add the type exports there in this commit). The returned object gains `fileLock: { withFileLock } satisfies FileLockPort<FilesystemPort>` and `atomicWriter: { writeJson: writeJsonFileAtomicAsync } satisfies Pick<AtomicFileWriterPort<FilesystemPort>, 'writeJson'>`, bound **directly to platform's functions** (they accept a filesystem option; `nodeFileLock` from `./fs` is typed `FileLockPort<never>` and would refuse the `filesystem` option agent-plugins passes). If either `satisfies` needs a cast, **STOP** (`pnpm --filter @jini-ai/node-adapters build`): the port is wrong, not the binding. Delete the `./lifecycle/node` export and its `jini.entries` line from agent-plugins.
4. **Finding 8: decisions 1–3 and every constructor are ONE commit.** The effects object is spread into the required lifecycle ports by `examples/neutral-host/…/support/host.ts:68` and `tests/plugin-uninstall-message.unit.test.ts:29`; they compile only when the adapter already returns the two new fields. Tests inside agent-plugins never import `@jini-ai/node-adapters` (only hosts do): `test-support.ts` and the three unit tests build their effects from `fakeFileLock()` / `fakeAtomicWriter()` of `@jini-ai/core/contracts/runtime/testing`, with the test's own `FilesystemPort`. `examples/neutral-host` is a host: it imports the adapter package.
5. **plugins:** `createPluginSourceService(required: PluginSourceDeps, optional)` (`source-drafts.ts:154`): add `readonly fileLock: FileLockPort` to `PluginSourceDeps` (`:45`); `optional.lockPorts` keeps its shape, typed `Pick<FileLockPortOptions, 'clock' | 'process' | 'hostname'>` from core. Line 173 becomes `required.fileLock.withFileLock({ lockPath: root + '-source-lock', run: action }, { ...optional.lockPorts, timeoutMs: 100, staleMs: Infinity })`. This file holds the source service's logic, not a binding: it stays in plugins; hosts pass `nodeFileLock` from `@jini-ai/node-adapters/fs`.

### Tests to write first
| # | File | Asserts | Fails when |
|---|---|---|---|
| T1 | agent-plugins `lifecycle/__tests__/unit/file-ports.unit.test.ts` (new) | a recording `fileLock` receives `lockPath` ending in the activations lock filename, options `{ timeoutMs: 15000, staleMs: 10000, pollMs: 10 }` and a `filesystem` equal to the injected one | options dropped; `filesystem` renamed |
| T2 | same file | persistent-state lock gets `staleMs: Infinity, createParent: true`; the update journal write gets `{ createParent: true, mode: 0o600 }` and `fs` equal to the injected filesystem | `fs`/`filesystem` swapped |
| T3 | same file | a `fileLock` rejecting with `FileLockTimeoutError` surfaces the same error class to the caller of an activation write | error swallowed or wrapped |
| T4 | plugins `host/__tests__/source-drafts.lock.unit.test.ts` (new) | recording lock receives `timeoutMs: 100, staleMs: Infinity` and the caller's `lockPorts.hostname` | spread order reversed |
| T5 | node-adapters `__tests__/agent-plugins.binding.test.ts` (new) | on a temp dir, the returned `fileLock` + `atomicWriter` really write the journal with mode `0o600` from creation and honour an injected filesystem; plus the two moved test files unchanged | binding ignores the filesystem or the mode |
T1–T3 are RED until the port exists (write them against the new field names; they fail to compile, which is the RED run).

### Steps (each commit green alone)
1. **Pair, one Jini commit:** decisions 1–4 + T1–T3 + T5 + manifests (`./agent-plugins` entry added; agent-plugins' `./lifecycle/node` entry removed) + debt keys of the 4 `agent-plugins → platform` sites + lockfile + API baseline. Then the Tovu commit: `features/agent-plugins/lifecycle.ts` imports the effects from `@jini-ai/node-adapters/agent-plugins` (its existing spread now carries the two new ports; `npm run typecheck` proves it) and the manifest lines.
2. plugins: decision 5 + T4 + its host callers (`rg -n "createPluginSourceService" packages examples apps -g '!**/dist/**'` in both repos: each passes `nodeFileLock`; Tovu's is a paired commit) + `plugins → platform` debt key.
3. Delete `@jini-ai/platform` from `packages/agent-plugins/package.json` and `packages/plugins/package.json` production fields when `rg -n "@jini-ai/platform" packages/<pkg>/src -g '!**/__tests__/**' -g '!*.test.*'` prints nothing (keep it as a devDependency while tests import it; G-TESTS T2 moves those), with the manifest debt keys.

### STOP
- `git diff --stat $BASE..HEAD -- packages/agent-plugins/src/lifecycle/activation.ts` shows net growth.
- `rg -n "node-adapters" packages/*/src -g '!packages/server/**' -g '!packages/cli/**' -g '!packages/node-adapters/**'` prints a hit (a domain package imports the adapter).
- A precondition command misses; a `satisfies` needs a cast.

---

## R11b-1: mcp install + federation reader, sidecar (6 sites)

```
id: R11b-1-mcp-sidecar-ports
jini_files:
  - packages/mcp/src/agent-install/owned-json-install.ts:3,28,38-43 | edit (45 lines)
  - packages/mcp/src/federation/adapter.http.ts:513                 | edit (file is over 500 lines: must not grow)
  - packages/sidecar/src/json-file.ts:13,32 ; daemon-registry.ts:61 | edit
  - packages/sidecar/src/supervision/supervisor-node.ts:34,50-52,78,104,157,167 | edit (stays in sidecar: it is supervision logic, not a binding)
  - host callers in packages/server/src/** and examples/** (step 0 lists them), manifests, debt keys, lockfile
tovu_files (pair): apps/website/src/server/inbound/assistant/ensure-json-agent-install.ts and its caller; the 4 importers of `@jini-ai/sidecar/supervisor/node` (`agent-daemon-server.ts`, `lifecycle/daemon-supervisor.ts`, `local-site-process.ts`, `assistant-daemon-registry.ts`); callers of sidecar's `writeJsonFile`
```
1. **mcp `installOwnedJsonAgent`** (`owned-json-install.ts:28`): required `files: { fileLock: FileLockPort; writer: Pick<AtomicFileWriterPort, 'writeText' | 'backupOriginalOnce'> }`. Lines 38–43 call `files.fileLock.withFileLock`, `files.writer.backupOriginalOnce`, `files.writer.writeText(…, { refuseSymlink: true })`. Hosts pass `{ fileLock: nodeFileLock, writer: nodeAtomicWriter }` from `@jini-ai/node-adapters/fs`. Tovu's `ensure-json-agent-install.ts:11` passes `required` through, so the Tovu edit is at **its** caller.
2. **mcp `adapter.http.ts:513`:** the lazy `import("@jini-ai/platform/fetch-with-timeout")` (through `loadOptionalPeer`) becomes an injected `readResponseText: HttpFetchPort['readResponseText']` on the options of the factory that encloses line 513 (find it and its callers). When `maxResponseBytes` or `strictUtf8` is set and no reader was injected, throw the package's existing typed configuration error (`rg -n "class .*Error" packages/mcp/src/federation`); never fall back to an unbounded `response.text()` (class: response-size limit). Hosts pass platform's `readResponseText` (a host may import platform).
3. **sidecar `json-file.ts`:** `writeJsonFile({ filePath, payload, writer })`, `writer: Pick<AtomicFileWriterPort, 'writeJson'>` required; `daemon-registry.ts:61` passes the writer it receives (add it to that function's required object and to its callers). Keep the options passed at `json-file.ts:33-40` exactly.
4. **sidecar `supervisor-node.ts`:** `NodeDaemonProcessRequired` (`:34`) gains required `process: ProcessControlPort` and `planInvocation: typeof planCommandInvocation` (core's pure planner type, `core/contracts/runtime/command.ts:75`), replacing the three `typeof` overrides at `:50-52` and the direct calls at `:78,104,157,167`. The port is object-shaped (`{ pid }`, `{ pids }`); the positional mapping lives in `@jini-ai/node-adapters/process` (`nodeProcessControl`, already tested there). Line 104 passes `platform: process.platform`, the **env the adapter built** (the old function defaulted to `process.env`: pass the same value it used) **and `fallbackComSpec: process.env.ComSpec`** in the second argument (revision 3, Opus review B10): platform's `createCommandInvocation` passed the process's own `ComSpec` as the fallback when the env it was given has none (`platform/src/command.ts:28`), and dropping it changes the Windows cmd-shim to a bare `cmd.exe`. The ambient value is read at the call (an optional `ambientEnv = process.env` on `NodeDaemonProcessOptions` lets T4 pass a fake); never hoisted.

| # | Test first | Asserts | Fails when |
|---|---|---|---|
| T1 | mcp `agent-install/__tests__/owned-json-install.ports.unit.test.ts` | order: lock taken → backup (only when a file existed) → write with `refuseSymlink: true`; lock path `<configPath>.jini-lock` | backup after write; option dropped |
| T3 | mcp `federation/__tests__/adapter.http.limits.unit.test.ts` | with `maxResponseBytes` set the injected reader is called with that limit; with no reader, the typed error | silent unbounded read |
| T4 | sidecar `supervision/__tests__/supervisor-node.ports.unit.test.ts` | fake `ProcessControlPort` receives `{ pid }` / `{ pids }` with the spawned pid and the timeout; `planInvocation` receives the env the adapter built; **with a built env that has no `ComSpec` and a fake ambient env with `ComSpec: 'C:\fake\cmd.exe'`, `planInvocation`'s second argument carries `fallbackComSpec: 'C:\fake\cmd.exe'`** | pid lost; env default used; ambient ComSpec fallback dropped |
| T4b | sidecar `__tests__/json-file.writer.unit.test.ts` | the writer receives the same options object as before (characterize on old code with a recording platform import replaced by the fake) | option dropped |
Steps: 0. inventory callers in both repos (`rg -n "installOwnedJsonAgent|writeJsonFile\b|createNodeDaemonProcessAdapter|NodeDaemonProcessRequired" packages apps examples -g '!**/dist/**'`). 1. mcp decision 1 pair (T1). 2. mcp decision 2 (T3) + its host callers. 3. sidecar 3–4 pair (T4, T4b). 4. `@jini-ai/platform` leaves sidecar's production manifest fields with debt keys (mcp keeps it until R11b-2).
STOP: `git diff --stat` shows `adapter.http.ts` grew; a binding needs a cast; step 0 finds a caller in a file INDEX §4 gives to another lane.

---

## R11b-2: mcp config secret writer (1 site; judge finding 11)

```
id: R11b-2-mcp-config-writer
jini_files: packages/mcp/src/core/config.ts:28,58-66,90-97,233,264,280 ; core/tokens.ts (3 call sites) ; core/__tests__/{config,secret-defaults}.test.ts ; src/__tests__/args-convention.unit.test.ts ; host callers (step 0) ; packages/mcp/package.json ; debt ; lockfile
tovu_files: none expected (no Tovu caller of `readMcpConfig`/`writeMcpConfig`/`defaultMcpSecretFilesystem` on merge-a); step 0 re-checks
```
**Today:** `McpConfigFilesystemPort` is `{ readText({ filePath }); writeSecretText({ filePath, contents }) }` (`config.ts:62`). The owner-only guarantee lives **inside the default implementation** (`:94`: `writeFileAtomicAsync(…, { mode: 0o600, verifyOwnerOnly: true, createParent: true })`); `doWrite` (`:280`) passes no options. Injecting that interface as it is would hand the permission decision to the host.
**Target (mcp keeps the security decision; the host supplies only the mechanism):**
```ts
export interface McpConfigFilesPort { readText(args: { filePath: string }): Promise<string>; readonly writer: Pick<AtomicFileWriterPort, 'writeText'> }
/** Owner-only from creation; the options are mcp's, never the host's. */
export const MCP_SECRET_WRITE_OPTIONS = { mode: 0o600, verifyOwnerOnly: true, createParent: true } as const;
function writeSecretText(required: { files: McpConfigFilesPort; filePath: string; contents: string }): Promise<void>   // calls files.writer.writeText({ filePath, content: contents }, MCP_SECRET_WRITE_OPTIONS)
```
`readMcpConfig`/`writeMcpConfig` (`:233`, `:264`) and the `tokens.ts` callers take `files: McpConfigFilesPort` as a **required** field; `defaultMcpSecretFilesystem` and the platform import are deleted (no alias left). The comment at `:61` ("secret writes must be atomic and owner-only from creation") **and the CR-006 / SEC-RB-002 block above `defaultMcpSecretFilesystem` (`config.ts:68-92`: why the temp file must be created owner-only rather than `chmod`ed after the rename)** move onto `MCP_SECRET_WRITE_OPTIONS`, which now carries that decision (Opus review A11; COMMON S7 prints them if they vanish). Hosts pass `{ readText: ({ filePath }) => readFile(filePath, 'utf8'), writer: nodeAtomicWriter }`.
| # | Test first | Asserts | Fails when |
|---|---|---|---|
| T2 | `core/__tests__/config.write.unit.test.ts` (new, recording writer) | every config and token write reaches `writer.writeText` with exactly `{ mode: 0o600, verifyOwnerOnly: true, createParent: true }` | an option missing; a write path that bypasses `writeSecretText` |
| T2b | existing real-file cases in `secret-defaults.test.ts` / `config.test.ts` (they already import platform as a test dependency) | unchanged assertions on the **real** file mode at creation, now passing platform's writer through `files` | permissions weakened in the real path |
| T2c | `config.test.ts` | a writer that rejects (owner check failed) surfaces the same error to the caller; nothing is reported as saved | error swallowed |
Steps: 0. `rg -n "defaultMcpSecretFilesystem|readMcpConfig\(|writeMcpConfig\(|McpConfigFilesystemPort" packages apps examples -g '!**/dist/**'` in both repos (merge-a: `config.ts` 4, `tokens.ts` 3, three test files 14; no host caller). 1. T2/T2c RED, then the port change and all callers in one commit; test count unchanged except the new cases. 2. `@jini-ai/platform` leaves mcp's production manifest fields (devDependency while T2b imports it) with debt keys.
STOP: a production caller outside mcp exists in a file another lane owns; `rg -n "0o600|verifyOwnerOnly" packages/mcp/src -g '!**/__tests__/**'` shows the options anywhere but `MCP_SECRET_WRITE_OPTIONS`.

---

## R11b-3: integrations (3 sites)

```
id: R11b-3-integrations-http
jini_files: packages/integrations/src/media-providers/dispatch/{outbound.ts:2,5,36, node.ts} ; saved-requests/execute.ts:1,82 ; the tests of those three files ; packages/node-adapters/src/http.ts + test + `./http` export ; host callers ; manifests ; debt ; lockfile
tovu_files (pair only if step 0 finds callers of `fetchMediaOutbound`, `executeSavedRequest`, `createNodeMediaHttpClient`)
```
1. `outbound.ts:36` `guardedFetch({ client, url, timeoutMs }, {…})` → injected `fetch: GuardedHttpPort['fetch']` on `MediaOutboundOptions` (`:5`, beside `httpClient`). `saved-requests/execute.ts:82` `createHttpClient({...})` → `deps.createClient: GuardedHttpPort['createClient']` (`deps` already carries `dns`, `transport`, `clock`, `userAgent`).
2. `dispatch/node.ts` (`createNodeMediaHttpClient`, 36 lines) **stays in integrations** (it builds the outbound **policy**, which is the security decision) and takes `http: GuardedHttpPort` and `ports: Omit<GuardedHttpRequired, 'policy' | 'userAgent'>` as required arguments instead of calling `createNodeGuardedHttpPorts({})`.
3. node-adapters `./http`: `nodeGuardedHttp = { createClient: createHttpClient, fetch: guardedFetch } satisfies GuardedHttpPort` and `nodeGuardedHttpPorts = createNodeGuardedHttpPorts` (by reference), from platform's `http/guarded` entry. A cast → **STOP**.
Security (class: outbound request guard): the `policy` objects at `execute.ts:82-…` and `node.ts:20-…` stay in integrations, unchanged. **T5** (characterize on old code first): `createClient` is called once with the same `policy` fields as before; a blocked address still refuses. **T6**: `fetch` receives `{ client, url, timeoutMs }` and the same options object.
21 integrations test files `vi.mock('@jini-ai/platform/http/guarded')` today (`census/merged/CENSUS-test-mocks.tsv`). They are G-TESTS T2's work; here only the tests of the three edited files move to the injected fake, and their `vi.mock` lines are deleted.
Steps: 0. inventory callers both repos. 1. node-adapters `./http` + binding test. 2. integrations 1–2 with T5/T6 + host callers (pair if Tovu calls them). 3. `@jini-ai/platform` leaves integrations' production manifest fields with debt keys.

---

## R11c: devops and search (3 sites)

```
id: R11c-devops-search
jini_files: packages/devops/src/deploy/node.ts:4,21,54 (64 lines) ; packages/search/src/contribution.ts:22-29,104-126 ; search/src/__tests__/contribution.test.ts ; examples/neutral-host/src/contribution-contracts.test.ts:28,170 ; manifests ; debt
tovu_files (pair): apps/website/src/features/deployments/deploy-targets/host-kit.ts:2 ; the Tovu caller of `defineSearchProviderContribution` if step 0 finds one
```
1. **devops `deploy/node.ts`** stays in devops (it composes the reachability check) and takes platform's two functions as required arguments: `createNodeReachabilityPorts({ assertSafeUrl, createValidatingLookup }, optional)`, typed locally from the platform signatures. Hosts pass platform's `assertSafePublicUrl` and `createValidatingLookup` directly (a host may import platform; the shapes are identical, so no node-adapters entry is needed). Security (class: outbound address validation): the lookup wrapper at `:21` and the guard at `:54` stay in the call path. T1: a blocked address is refused when the injected guard throws, and the lookup handed to the dispatcher is the validating one (identity).
2. **search `contribution.ts:29`** `export { contributeProviders } from '@jini-ai/agent-plugins/lifecycle'` is a re-export shell: delete it; `search/src/__tests__/contribution.test.ts` imports it from agent-plugins itself.
3. **search `contribution.ts:22` (judge finding 5).** Today `defineSearchProviderContribution({ filename }, recovery)` calls agent-plugins' `defineProviderContribution({ contract, filename, parse: parseSearchProviderManifest, validate: validateContributedSearchProvider }, recovery)` and wraps `load` with the **manifest-id = provider-id** check (`:112-126`); `validateContributedSearchProvider` (`:91`) refuses a provider that accepts restricted content. All of that stays in search. Only agent-plugins' function is injected:
```ts
/** What search needs from the host's contribution machinery (agent-plugins' `defineProviderContribution`). */
export interface SearchContributionSpec { readonly contract: string; readonly filename: string; readonly parse: typeof parseSearchProviderManifest; readonly validate: typeof validateContributedSearchProvider }
export function defineSearchProviderContribution<Base extends SearchContributionBase>(
  required: { readonly filename: string; readonly define: (spec: SearchContributionSpec) => Base }, _optional: Record<string, never> = {}): Base
```
`SearchContributionBase` is a local structural type naming only what the wrapper touches: `load(input: { descriptor: { id: string }; plugin: { pluginId: string } }): Promise<{ definition: { provider: { id: string } } } | string>`. The body is today's: `const base = required.define({ contract: SEARCH_CONTRACT, filename, parse, validate })`, then the same `load` wrapper and message. **The loader's recovery options** (today's second argument, "passed through unchanged") are bound by the host inside `define`: `define: spec => defineProviderContribution(spec, { onReadError })`. If `defineProviderContribution`'s real return type is not assignable to `SearchContributionBase` without a cast, **STOP** (`pnpm --filter @jini-ai/search typecheck` on the test below).
   - Tests first: (a) the existing `contribution.test.ts` cases run **unchanged in assertions** with the real `defineProviderContribution` passed as `define` (the test already imports agent-plugins): bad JSON, bad entry, duplicate id, bad export, **restricted vendor**, **id mismatch** each return their refusal string and never throw; (b) new unit case with a fake `define`: it receives `SEARCH_CONTRACT`, the filename, and `parse`/`validate` **by identity**; a fake base whose loaded provider id differs from the descriptor id yields the mismatch message; (c) `examples/neutral-host/src/contribution-contracts.test.ts:170` passes `define` and keeps its recovery option.
4. Manifests: drop `@jini-ai/platform` from devops and `@jini-ai/agent-plugins` from search production fields (devDependency while tests import it) with debt keys.
Steps: 0. inventory (`rg -n "createNodeReachabilityPorts|defineSearchProviderContribution|contributeProviders" packages apps examples -g '!**/dist/**'`, both repos). 1. devops pair. 2. search 2. 3. search 3 (+ examples; Tovu pair if a caller exists). 4. manifests.
STOP: the descriptor types would have to be copied into core (a C-lane change); a restricted-vendor or id-mismatch assertion would have to change.
