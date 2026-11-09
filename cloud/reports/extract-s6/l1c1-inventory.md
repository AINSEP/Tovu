# EXTRACT-S6 L1c part 1 — admin DTO, archive policy, tier-2 worker start: inventory (written before implementation)

Pins: Tovu `c3801c833a191be51753dcdecd133b0cad6f8945`, Jini `4044fe3c0fa34b1f903c5d20a6b4de7714cde573`.
Starting tips: Tovu `446892d2`, Jini `070fe2a9`. T = Tovu `apps/website/src/`; J = Jini `packages/`.
The three T files are unchanged between the Tovu pin and the starting tip.

## Origin of the transported text

| File | Git blob SHA (start tip) | SHA-256 (bytes) | Lines |
|---|---|---|---|
| `T features/plugin-runtime/admin-response.ts` | `e262baee3b174278e757c5e62362fb977facdca8` | `590a1066dfe24b58c3b6b7abf936a9b3b01bcd5516b0ea816369268eb8868d9d` | 94 |
| `T features/plugin-runtime/install-archive.ts` | `fb45d25dcfd96bd166aef14074a21e3cc5a4dcf4` | `22baf5fdd5b5874f74eaa209e55c684a78a8c6bebb3fea738915df46d9af4e61` | 132 |
| `T server/runtime/plugin-tier2/worker.ts` | `c1130a33eddcbefdd6d32f708342104905f40d3b` | `a6093270536eb6e0fd8efa473deffe8c89fd65ff39bfcaa7373a033f3cb9b699` | 78 |

Transport: cross-repo, so no Git rename edge. Function bodies and why-comments move as original text
into new J files; the T files are rewritten in place as thin shims keeping every old export name and
signature. Destinations:
- A: `J plugins/src/host/admin-response.ts` (universal `@jini-ai/plugins/host`).
- B: `J plugins/src/host/node/archive-policy.ts` (`@jini-ai/plugins/host/node`; Buffer is node-only).
- C: `J plugins/src/host/worker/start.ts` (`@jini-ai/plugins/host/worker`, existing entry; no auto-start).

## Rows

| Symbol | Value/type | Pinned source file:line | Destination | Host vocabulary: permission names, ids, paths — injected OR justified | @agent-note obligations | Caller/proof |
|---|---|---|---|---|---|---|
| `@file` header (C-017, SPEC-005 REQ-10, projection rationale) | comment | `T admin-response.ts:1-23` | same package J `@file` (projection rationale); T-path history (`server/http/admin`, `routes/admin/plugins/*`, where-used relocation) stays in T shim header | T route/module paths → T shim header only; spec ids are domain rule names | factory note: pure, no I/O, host owns the transport/route | T plugins-dto.unit; G-plug 5 |
| `AdminPluginEnvelope` | type | `T admin-response.ts:28-56` | same package (`plugins/host`), T re-exports | `source` `"built-in"\|"site"`, tiers `tier-1..3`, status values = existing plugin-domain discovery vocabulary (`discovery-types.ts`), justified; `providerSettings` comment's T route path → T shim | members: `enabled` projected from activation; `conflicts` always present; `providerSettings` present only when true | G-plug 5 exact bytes |
| `toAdminPluginResponse` (positional) | value | `T admin-response.ts:58-82` | J two-object `toAdminPluginResponse({ discovery, activation }, { conflicts })`; T positional shim delegates | none, inspected (fallback `"tier-3"` is domain default, unchanged) | key order = wire order; null activation = disabled; no I/O; host owns route/auth | T plugins-dto.unit (unchanged), G-plug 5, NEW J test |
| `quarantineResponse` | value (private) | `T admin-response.ts:85-93` | same package, private | none, inspected | all three activation fields or `null` | T plugins-dto.unit |
| `PluginDiscoveryRecord`/`PluginActivationRecord`/`PluginConflict` | type imports | `T admin-response.ts:25-27` | same package (`../discovery-types.js`, `./activation.js`, `./plugin-claims.js`); no `/host/node` import from universal | none | — | J tsc, host-entry-purity |
| `@file`-like header (CMS ZIP policy, keep bytes off disk) | comment | `T install-archive.ts:1-3` | J `@file`; T shim keeps the reader half | none | policy note: holds accepted bytes in memory only; host publishes | T install-archive.unit/integration |
| `MAX_PLUGIN_ARCHIVE_BYTES` (32 MiB) | value | `T install-archive.ts:9` | same package (`host/node`), T re-exports same binding | plugin-domain limit, justified (unchanged) | upload limit checked before the reader is called | T install-archive.unit |
| `MAX_ENTRIES` 4096 / `MAX_FILE_BYTES` 16 MiB / `MAX_EXPANDED_BYTES` 64 MiB / `SIZE_LIMIT_MESSAGE` | value (private) | `T install-archive.ts:10-13` | same package, private | plugin-domain limits and error text, justified (exact text preserved) | — | T install-archive.unit/integration |
| `isSpecialUnixEntry`, `guardedYauzl`, `defaultReader` | value | `T install-archive.ts:15-37` | **stay T** (concrete yauzl + agent-plugins reader). Special-Unix-entry defense lives in the T reader, recorded here, unchanged | `@jini-ai/agent-plugins`, `yauzl` → T only | — | T install-archive.unit special-entry cases |
| `fail` | value (private) | `T install-archive.ts:39` | same package (`PluginInstallError` is already J `host/node/install.ts`, same class identity) | none | errors are `PluginInstallError(code, message)`, codes/text unchanged | T unit identity checks |
| `ArchivePolicyState`, `FileEntry` | type (private) | `T install-archive.ts:41-51` | same package, private; `FileEntry` derives from NEW local `PluginArchiveEntry` | none | one state per read | — |
| `AgentPluginArchiveEntry`/`AgentPluginArchiveReaderPort` | type (agent-plugins) | `T install-archive.ts:6` | **NEW local port** `PluginArchiveEntry`/`PluginArchiveReaderPort` in J archive-policy (structurally a supertype of the agent-plugins shapes; no agent-plugins import) | entry kinds file/directory/link family: archive-domain vocabulary, justified | host supplies reader; `entries` called exactly once per read; non-file/dir kinds refused | J tsc; T shim assigns the agent-plugins reader to the local port (strict typecheck) |
| `assertInsidePackage`, `claimSpelling`, `claimPath`, `assertDeclaredSize`, `readFileBytes`, `acceptEntry` | value (private) | `T install-archive.ts:53-118` | same package, original text | none, inspected | order: count → kind → path → claim → size → stream | T install-archive.unit/integration, install-declarative.integration |
| `readSitePluginArchive(required, optional={reader?})` | value | `T install-archive.ts:120-132` | J `readPluginArchive({ archive, reader }, {})` with REQUIRED reader, no fallback; T shim binds `optional.reader ?? defaultReader` | none | reader required; non-`PluginInstallError` → `PLUGIN_ARCHIVE_INVALID` | T unit + NEW J test (fake reader) |
| worker `@file` header | comment | `T worker.ts:1-11` | split: per-call wiring rationale → J `start.ts`; spawn-by-path/relative product binding/tsx CJS note → T entry | T paths (`run-in-worker.ts`, host binding) stay T | worker entry is host's file; one call per worker | T worker.unit, tier2-runtime.integration |
| `Tier2WorkerMainRequired`/`Optional` | type | `T worker.ts:20-29` | J `StartTier2WorkerRequired`/`Optional` (adds `binding`, `registerSdkResolver`, `realImport`); T keeps old interfaces | none | `importModule` test seam ⇒ no resolver registration | T worker.unit |
| `importPluginModule` | value | `T worker.ts:31-37` | **stays T** (tsx rewrite of `import()` is bound to the host entry module; test pins it) | none | — | T worker.unit tsx test |
| `main` | value | `T worker.ts:39-63` | J `startTier2Worker(required, optional)` holds body; T `main` delegates with `pluginHostBinding`, `registerPluginSdkResolver`, `importPluginModule` | `pluginHostBinding`/`registerPluginSdkResolver` → host input | resolver registered before the first real import, once per worker; default-export unwrap unchanged; missing port error text unchanged | T worker.unit, tier2-runtime.integration, NEW J test |
| `startIfWorker` + module-level auto-start | value | `T worker.ts:65-78` | stays T (auto-start is the product entry's job; J has no top-level side effect) | none | J import must not start | plain Node smoke import of `/host/worker` |

## Caller search at Jini start tip (`packages/` and `examples/`, excluding dist/node_modules)

`toAdminPluginResponse`/`readSitePluginArchive`/`startTier2Worker`/`admin-response`/`install-archive`:
no J callers (only comment mentions in `cms/src/widgets/where-used.ts`, `agent-plugins/src/folder-zip.ts`,
`plugins/src/host/capability-tools.ts`). `admin/src/core/ports/plugins.ts` has its own `AdminPlugin` DTO
(different name, not touched). New names do not collide in the `plugins/host*` barrels (checked).

## Closure audit (planned)

New J files import only same-package modules (`../discovery-types.js`, `./activation.js`,
`./plugin-claims.js`, `./install.js`, `./run-call.js`, `./protocol.js`). No `@tovu`, product SDK, CMS,
diagnostics, agent-plugins, sandbox or other Jini package import; universal `admin-response.ts`
imports no `node:`. No dependency/version edit. Changeset `.changeset/extract-s6-l1c-plugins-host.md`.
