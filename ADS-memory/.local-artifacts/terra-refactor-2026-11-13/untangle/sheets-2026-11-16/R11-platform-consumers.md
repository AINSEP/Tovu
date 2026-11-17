# R11 sheet: platform consumers and the search registration (3 sub-sheets, one Sonnet run each)

Read `COMMON.md` first. Sites: `sites/R11.sites.tsv` (17 sites, 15 files, 7 owner packages). Needs: C5 (landed: `@jini-ai/core/contracts/runtime`), Q8 (answered: Node adapters go to the host preset), Q1 (done: `server` already has `jini.kind: "host-preset"`).

The three sub-sheets touch different packages, so they can run in parallel. R11c writes into `packages/server`, which R13 and R8 also write: R11c only **adds new files** there and reports the `package.json` lines.

| Sub-sheet | Packages | Sites | Estimate (Sonnet) |
|---|---|---|---|
| R11a | agent-plugins (`src/lifecycle`), plugins | 5 | 110k |
| R11b | mcp, sidecar, integrations | 9 | 150k |
| R11c | devops, search | 3 | 60k |

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
- `ProcessControlPort.stopProcesses` takes `{ pids }`, `waitForProcessExit` takes `{ pid }`. sidecar's node adapter calls the platform functions **positionally** today (`supervisor-node.ts:78` `waitForProcessExit(pid)`, `:167` `stopProcesses(pids)`). Before binding, read `packages/platform/src/process*.ts` and record which form the platform functions take; if the two differ, the binding is an arrow that maps one to the other, and the test asserts the pid arrives.
- `planCommandInvocation` needs `platform` and `env` explicitly; `createCommandInvocation` defaulted `env = process.env` (`platform/src/command.ts:27`). Every converted call site must pass the env it used before (some pass `env`, some rely on the default).
- `FileLockPortOptions.sleep` takes `{ durationMs }`; agent-plugins' clock takes `{ ms }`. The existing mapping arrows (`persistent-state.ts:18`, `activation.ts:824`) stay.

---

## R11a: agent-plugins lifecycle and plugins host (5 sites)

```
id: R11a-lifecycle-file-ports
feature: agent-plugins lifecycle and the plugins source service take file-lock and atomic-write ports
precondition: rg -n "export interface FileLockPort" packages/core/src/contracts/runtime/file-lock.ts -> hit
jini_files (blob_merged from GUARDS.tsv; all 5 unchanged since terra):
  - packages/agent-plugins/src/lifecycle/ports.ts                 | edit (add 2 required ports)
  - packages/agent-plugins/src/lifecycle/persistent-state.ts:4,15 | edit
  - packages/agent-plugins/src/lifecycle/activation.ts:52,819     | edit (file is 935 lines: already over 500; this lane must not grow it)
  - packages/agent-plugins/src/lifecycle/update-store.ts:2,99     | edit
  - packages/agent-plugins/src/lifecycle/node.ts                  | DELETE here, re-created in the preset (Q8)
  - packages/plugins/src/host/node/source-drafts.ts:8,154,173     | edit
  - packages/server/src/adapters/agent-plugin-effects.ts          | NEW (the moved node.ts)
tovu_file: apps/website/src/server/runtime/composition/jini-file-ports.ts (NEW)
```

### Decisions
1. **agent-plugins:** add to `AgentPluginLifecyclePorts` (`ports.ts:40`) two **required** fields:
   `readonly fileLock: FileLockPort<FilesystemPort>;` and `readonly atomicWriter: Pick<AtomicFileWriterPort<FilesystemPort>, 'writeJson'>;`
   (`FilesystemPort` is the package's own narrowed `node:fs/promises` type, `ports.ts:9`.) Add both to `AgentPluginLifecycleRequired` (`ports.ts:76`) by leaving them out of its `Omit` list. They are required, not defaulted: a default would re-import platform.
2. **Call sites:** `withFileLock(` → `ports.fileLock.withFileLock(` at `persistent-state.ts:15` and `activation.ts:819`; `writeJsonFileAtomicAsync(` → `ports.atomicWriter.writeJson(` at `update-store.ts:99`. Arguments are byte-identical. Delete the three platform imports.
3. **`lifecycle/node.ts` (39 lines) is a Node default adapter (Q8).** It moves to `packages/server/src/adapters/agent-plugin-effects.ts` unchanged except: its `./ports.js` type import becomes `@jini-ai/agent-plugins/lifecycle` (check that entry exports `AgentPluginClockPort`, `AgentPluginIdsPort`, `AgentPluginProcessPort`, `FilesystemPort`; if not, add the type exports to `lifecycle/index.ts` in this commit), and the returned object gains `fileLock` and `atomicWriter` bound to platform. Delete the `./lifecycle/node` export from `packages/agent-plugins/package.json` and its `jini.entries` line.
4. **Consumers of `lifecycle/node` to repoint in the same commit** (`rg -l "agent-plugins/lifecycle/node|createNodeAgentPluginEffects"`): `examples/neutral-host/src/neutral-host/support/host.ts`, `packages/agent-plugins/tests/plugin-uninstall-message.unit.test.ts`, `src/lifecycle/__tests__/test-support.ts`, `__tests__/unit/node-sleep.unit.test.ts`, `__tests__/unit/error-codes-and-grammar.unit.test.ts`, plus `CAPABILITIES.md`, `API.md`, `README.md`, `docs/spec/api.spec.md` (text). Tovu: `rg -n "createNodeAgentPluginEffects|agent-plugins/lifecycle/node" apps packages` found **no** production importer at `refactor/terra`; re-run it.
   - Tests inside agent-plugins may not import `@jini-ai/server` (nothing imports a preset). `test-support.ts` builds its effects from `fakeFileLock()` / `fakeAtomicWriter()` in `@jini-ai/core/contracts/runtime/testing` (**G-TESTS creates that entry; if it does not exist yet, create `src/lifecycle/__tests__/fakes/file-ports.ts` with a Map-backed lock and a writer that calls the test's own `FilesystemPort`**). `node-sleep.unit.test.ts` tests the Node adapter itself: move it with the adapter to `packages/server/src/adapters/__tests__/`.
5. **plugins:** `createPluginSourceService(required: PluginSourceDeps, optional)` (`source-drafts.ts:154`). Add `readonly fileLock: FileLockPort` to `PluginSourceDeps` (`:45`). `optional.lockPorts` keeps its shape but its type becomes `Pick<FileLockPortOptions, 'clock' | 'process' | 'hostname'>` from core. Line 173 becomes `required.fileLock.withFileLock({ lockPath: root + '-source-lock', run: action }, { ...optional.lockPorts, timeoutMs: 100, staleMs: Infinity })`. `plugins/src/host/node/*` is named by Q8, but this file holds the source service's logic, not only wiring: it stays; only the import goes. Report this reading in the lane report.

### Tests to write first
| # | File | Asserts | Fails when |
|---|---|---|---|
| T1 | agent-plugins `lifecycle/__tests__/unit/file-ports.unit.test.ts` (new) | a recording `fileLock` receives `lockPath` ending in the activations lock filename and options `{ timeoutMs: 15000, staleMs: 10000, pollMs: 10 }` plus a `filesystem` equal to the injected one | options object dropped or `filesystem` renamed |
| T2 | same file | persistent-state lock gets `staleMs: Infinity, createParent: true`; the update journal write gets `{ createParent: true, mode: 0o600 }` and `fs` equal to the injected filesystem | `fs`/`filesystem` swapped |
| T3 | same file | a `fileLock` that rejects with `FileLockTimeoutError` surfaces the same error class to the caller of an activation write | error swallowed or wrapped generically |
| T4 | plugins `host/__tests__/source-drafts.lock.unit.test.ts` (new) | recording lock receives `timeoutMs: 100, staleMs: Infinity` and the caller's `lockPorts.hostname` | spread order reversed |
T1–T3 are RED until step 1 (the port does not exist). Existing lifecycle tests must stay green with the fake.

### Steps (each green alone)
1. agent-plugins: decisions 1–2 + T1–T3 + `test-support.ts` on fakes. Commit.
2. Pair: move `node.ts` to the preset (decision 3), repoint consumers (decision 4), delete the export. Jini commit; then Tovu `jini-file-ports.ts` commit.
3. plugins: decision 5 + T4. Commit. Then delete `@jini-ai/platform` from `packages/agent-plugins/package.json` and `packages/plugins/package.json` if `rg -n "@jini-ai/platform" packages/<pkg>/src -g '!**/__tests__/**'` prints nothing (tests that still import platform are G-TESTS T2; then keep it as a devDependency only).

### Tovu wiring (new file; coordinator adds the use line)
```ts
// apps/website/src/server/runtime/composition/jini-file-ports.ts
import { withFileLock, writeFileAtomicAsync, writeJsonFileAtomicAsync, backupOriginalOnce } from '@jini-ai/platform/fs';
import type { FileLockPort, AtomicFileWriterPort } from '@jini-ai/core/contracts/runtime';
/** The host picks the Node implementations; packages only state the ports. A shape change fails typecheck here. */
export const fileLock = { withFileLock: (required, optional) => withFileLock(required, optional) } satisfies FileLockPort<never>;
export const atomicWriter = {
  writeText: (required, optional) => writeFileAtomicAsync(required, optional),
  writeJson: (required, optional) => writeJsonFileAtomicAsync(required, optional),
  backupOriginalOnce: (required) => backupOriginalOnce(required),
} satisfies AtomicFileWriterPort<never>;
```
CHECK before writing it: the platform functions' own parameter types against the port (`platform/src/fs/atomic-write.ts:212,257`, `file-lock.ts:297`). If the generic `Filesystem` parameter does not line up without a cast, **STOP**: the port is wrong, not the binding. Coordinator lines: where Tovu builds agent-plugin lifecycle ports and the plugin source service (`rg -n "createAgentPluginActivations|createPluginSourceService|AgentPluginLifecycleRequired" apps/website/src`), add `fileLock, atomicWriter`.

### STOP
- `activation.ts` grows (it is already 935 lines; the edit is one identifier).
- A consumer needs `lifecycle/node` from inside a domain package.
- Tovu has a production importer of `createNodeAgentPluginEffects` that this sheet did not find.

---

## R11b: mcp, sidecar, integrations (9 sites)

```
id: R11b-runtime-ports
jini_files:
  - packages/mcp/src/agent-install/owned-json-install.ts:3,38-43  | edit (45 lines)
  - packages/mcp/src/core/config.ts:28,94                          | edit (359 lines)
  - packages/mcp/src/federation/adapter.http.ts:513                | edit (dynamic import; file is over 500 lines: do not grow)
  - packages/sidecar/src/json-file.ts:13,32                        | edit
  - packages/sidecar/src/daemon-registry.ts:61                     | edit (caller of writeJsonFile)
  - packages/sidecar/src/supervision/supervisor-node.ts            | MOVE to packages/server/src/adapters/daemon-process.ts (Q8; 342 lines)
  - packages/integrations/src/media-providers/dispatch/node.ts     | MOVE to packages/server/src/adapters/media-http-client.ts (Q8; 36 lines)
  - packages/integrations/src/media-providers/dispatch/outbound.ts:2,36 | edit
  - packages/integrations/src/saved-requests/execute.ts:1,82       | edit
tovu_file: apps/website/src/server/runtime/composition/jini-runtime-ports.ts (NEW)
```

### Decisions
1. **mcp `installOwnedJsonAgent`** (`owned-json-install.ts:28`): add required `files: { fileLock: FileLockPort; writer: Pick<AtomicFileWriterPort, 'writeText' | 'backupOriginalOnce'> }`. Lines 38–43 call `files.fileLock.withFileLock`, `files.writer.backupOriginalOnce`, `files.writer.writeText(…, { refuseSymlink: true })`. **Host caller:** Tovu `apps/website/src/server/inbound/assistant/ensure-json-agent-install.ts:11` passes `required` through, so the Tovu edit is at its caller: this is a **pair**.
2. **mcp `config.ts:94`:** `defaultMcpSecretFilesystem.writeSecretText` is a module-level default object that calls platform. Remove the default: `readMcpConfig`/`writeMcpConfig` (`:233`, `:264`) take `filesystem` as a **required** field. Inventory first: `rg -n "defaultMcpSecretFilesystem|readMcpConfig\(|writeMcpConfig\(" packages apps examples` in both repos; every caller is in this commit (Jini) or the paired Tovu commit. If more than 12 call sites exist, split this decision into its own run and report.
   - Security gate to preserve (class: secret file permissions): the write uses `{ mode: 0o600, verifyOwnerOnly: true, createParent: true }`. The options stay **in mcp** (mcp builds them and passes them to `writer.writeText`); the host binding must not be the place that decides the mode. T2 fails if the mode is missing.
3. **mcp `adapter.http.ts:513`:** the lazy `import("@jini-ai/platform/fetch-with-timeout")` (through `loadOptionalPeer`) becomes an injected `readResponseText: HttpFetchPort['readResponseText']` on the adapter's options. Find the factory that builds this adapter (the enclosing function of line 513) and its callers; when `maxResponseBytes` or `strictUtf8` is set and no reader was injected, throw the package's existing typed configuration error (find it with `rg -n "class .*Error" packages/mcp/src/federation`), never fall back to an unbounded `response.text()`. (Class: response-size limit. T3 covers it.)
4. **sidecar `json-file.ts`:** `writeJsonFile({ filePath, payload })` gains a required `writer: Pick<AtomicFileWriterPort, 'writeJson'>`; `daemon-registry.ts:61` passes the writer it receives. `writeJsonFile` is exported from the sidecar root (`index.ts:56`): find host callers with `rg -n "writeJsonFile" apps packages examples`. Keep the options currently passed at `json-file.ts:33-40` exactly.
5. **sidecar `supervisor-node.ts`** is the Node process adapter (Q8). It moves to the preset. Tovu imports `createSupervisorRegistry`, `createNodeIpcChannel`, `createNodeDaemonProcessAdapter`, `NodeDaemonProcessOptions` from `@jini-ai/sidecar/supervisor/node` in 4 files (`agent-daemon-server.ts`, `lifecycle/daemon-supervisor.ts`, `local-site-process.ts`, `assistant-daemon-registry.ts`). **Owner decision OD-3 (INDEX): may Tovu import `@jini-ai/server/adapters/*`?** Until answered, do the smaller change that removes the edge without moving the file: the adapter keeps living in sidecar but takes `process: ProcessControlPort` and `planInvocation: CommandInvocationPort` as **required** fields of `NodeDaemonProcessRequired` (`:34`), replacing the three `typeof` overrides at `:50-52` and the direct calls at `:78,104,157,167`. Line 104 becomes `required.planInvocation({ command: required.command, platform: process.platform, env }, { args: [...required.args] })`.
6. **integrations:** `outbound.ts:36` `guardedFetch({ client, url, timeoutMs }, {…})` → an injected `fetch: GuardedHttpPort['fetch']` on `MediaOutboundOptions` (`:5`, next to the existing `httpClient`). `saved-requests/execute.ts:82` `createHttpClient({...})` → `deps.createClient: GuardedHttpPort['createClient']` (the `deps` object already carries `dns`, `transport`, `clock`, `userAgent`). `dispatch/node.ts` (`createNodeMediaHttpClient`) is a Node default adapter: same OD-3 question; until answered it takes `http: GuardedHttpPort` and `ports: Omit<GuardedHttpRequired, 'policy' | 'userAgent'>` as required arguments instead of calling `createNodeGuardedHttpPorts({})`.
   - Security gate to preserve (class: outbound request guard): the `policy` object built at `execute.ts:82-…` and in `node.ts:20-…` stays in integrations, unchanged. T5 fails if the policy passed to `createClient` differs.

### Tests to write first
| # | Where | Asserts | Fails when |
|---|---|---|---|
| T1 | mcp `agent-install/__tests__/owned-json-install.ports.unit.test.ts` | order: lock taken → backup (only when a file existed) → write with `refuseSymlink: true`; lock path is `<configPath>.jini-lock` | backup after write; option dropped |
| T2 | mcp `core/__tests__/config.write.unit.test.ts` | the injected writer receives `mode: 0o600, verifyOwnerOnly: true, createParent: true` | mode missing |
| T3 | mcp `federation/__tests__/adapter.http.limits.unit.test.ts` | with `maxResponseBytes` set, the injected reader is called with that limit; with no reader, the typed error | silent unbounded read |
| T4 | sidecar `supervision/__tests__/supervisor-node.ports.unit.test.ts` | fake `ProcessControlPort` receives `{ pid }` / `{ pids }` with the spawned pid; `planInvocation` receives the env the adapter built | positional pid lost; env default used |
| T5 | integrations `saved-requests/__tests__/execute.client.unit.test.ts` | `createClient` is called once with the same `policy` fields as before (snapshot taken on the old code first) | policy changed |
21 integrations test files `vi.mock('@jini-ai/platform/http/guarded')` today (census). They are G-TESTS T2's work; in this lane only the tests of the three edited files move to the injected fake, and the `vi.mock` lines in those files are deleted, not kept.

### Steps
1. mcp decisions 1–3 with T1–T3 (pair with Tovu for decision 1/2 callers). 2. sidecar 4–5 with T4 (pair). 3. integrations 6 with T5 (pair if Tovu calls `fetchMediaOutbound`, `executeSavedRequest` or `createNodeMediaHttpClient`: `rg -n` them first). 4. Manifests: drop `@jini-ai/platform` from mcp, sidecar, integrations `dependencies`/`peerDependencies` when no production import is left.

### Tovu wiring
`jini-runtime-ports.ts`: `processControl` (`listProcessSnapshots`, `stopProcesses`, `waitForProcessExit` from `@jini-ai/platform/process`) `satisfies ProcessControlPort`; `planInvocation = planCommandInvocation satisfies CommandInvocationPort`; `guardedHttp = { createClient: (r) => createHttpClient(r), fetch: (r, o) => guardedFetch(r, o) } satisfies GuardedHttpPort`; `httpFetch satisfies HttpFetchPort` from `@jini-ai/platform/fetch-with-timeout`. Import `fileLock`/`atomicWriter` from R11a's `jini-file-ports.ts` (R11a lands first, or R11b creates the file if R11a has not landed: say which in the report).

### STOP
- `config.ts` callers exceed 12 (split). A security option would have to move to the host. A binding needs a cast.

---

## R11c: devops and search (3 sites)

```
id: R11c-devops-search
jini_files:
  - packages/devops/src/deploy/node.ts:4,21,54   | edit (64 lines)
  - packages/search/src/contribution.ts:22-29    | edit
```
1. **devops `deploy/node.ts`** binds platform's `assertSafePublicUrl` and `createValidatingLookup` into reachability ports (Q8 adapter). Tovu calls `createNodeReachabilityPorts` (`features/deployments/deploy-targets/host-kit.ts:2`). Same OD-3 dependency as R11b. Until answered: the two platform functions become required arguments, `createNodeReachabilityPorts({ assertSafeUrl, createValidatingLookup }, optional)`; types are declared locally in devops (`(raw: string) => …`, read the platform signatures first). Security gate (class: outbound address validation): the lookup wrapper at `:21` and the guard at `:54` stay in the call path; T1 asserts a blocked address is refused when the injected guard throws, and that the lookup passed to the dispatcher is the validating one.
2. **search `contribution.ts:29`** `export { contributeProviders } from '@jini-ai/agent-plugins/lifecycle'` is a re-export shell: delete it. Callers import `contributeProviders` from agent-plugins themselves (`rg -n "contributeProviders" apps packages examples`; in Jini only `search/src/__tests__/contribution.test.ts`).
3. **search `contribution.ts:22`** imports `defineProviderContribution` (value) and 4 types. Check whether C8 put the contribution descriptor types in `@jini-ai/core/contracts/plugin-sdk` (`rg -n "ProviderContributionDescriptor|defineProviderContribution" packages/core/src`). **Not verified by this run.**
   - If core has them: repoint the import.
   - If not: search exports plain data (`SEARCH_PROVIDER_CONTRIBUTION = { contract: SEARCH_CONTRACT, manifestSchemaVersion, validate: validateSearchProvider }`) typed by a local structural type, and the host passes it to agent-plugins' `defineProviderContribution`. The test asserts that every fault class listed in the file header (bad JSON, bad entry, duplicate id, bad export, restricted vendor, id mismatch) still returns a refusal string and never throws; in Jini that test moves to `packages/integration-tests` if it needs the real agent-plugins function (G-TESTS).
4. Manifests: drop `@jini-ai/platform` from devops and `@jini-ai/agent-plugins` from search when clean.

### STOP
- The descriptor type would have to be copied into core by this lane (that is a C-lane change; report it).
