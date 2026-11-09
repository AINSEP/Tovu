# EXTRACT-S6 L1c part 2 — plugin runtime core move: inventory (written before implementation)

Pins: Tovu `c3801c833a191be51753dcdecd133b0cad6f8945`, Jini `4044fe3c0fa34b1f903c5d20a6b4de7714cde573`.
Starting tips: Tovu `d6a2581d`, Jini `7087c132` (L1a, L1b-1, L1b-2, L1c-1 green). T = Tovu `apps/website/src/`; J = Jini `packages/`.
The seam was cut in place by L1b part 2 (`l1b-runtime-inventory.md`); this batch moves the seamed core, unchanged in
behaviour, into the existing `@jini-ai/plugins/host/node` entry (node: it uses `node:path` and `node:fs/promises` `lstat`).

## Origin of the transported text

| File | Git blob SHA (start tip d6a2581d) | SHA-256 (bytes) | Lines |
|---|---|---|---|
| `T server/runtime/composition/plugin-runtime.ts` | `538c77d9222caa43ee83c240f3abef16f5306d31` | `751d2ead3c5445469a3897e2dcb281ff303cd85cb284797e3177f99039a2dc33` | 897 |

Transport: cross-repo, so no Git rename edge. Lines 32–160 (module helpers) and 194–315 + 334–343 + 380–897
(core contracts, `declaresProviders`, `createPluginRuntimeCore`) move as original text into the NEW file
`J plugins/src/host/node/runtime-core.ts`, exported from `J plugins/src/host/node/index.ts` (existing entry; no new
entry or wrapper). Imports change from `@jini-ai/plugins/host{,/node,/worker}` specifiers to same-package relative
files; `@jini-ai/core/plugin-directory` and `@jini-ai/core/primitives` stay. T `plugin-runtime.ts` keeps
`ComposePluginRuntimeRequired`, `PluginRuntimeBindings`, `composePluginRuntime`, `TOVU_PLUGIN_RUNTIME_TEXT` and
re-exports every moved exported symbol (same class object for `PluginUninstallPathError`, so `instanceof` in
`routes/plugins/uninstall.ts` and the package-paths unit test is unchanged).

Comment destinations: every why-comment/`@complexity`/`@throws`/`@agent-note` moves with its symbol. Minimal rewording
only where a comment names a host tool/path or a symbol that no longer exists beside it (listed exactly in the digest
and the commit): the `plugins_set_enabled` tool name in `assertReloadApproved` (N1), `plugins_list` in
`listPluginConflicts` doc, the T route path `routes/plugins/files.ts` in `PluginRuntimeSource.sourceDir` doc, and the
`{@link composePluginRuntime}` link plus the "in place; L1c moves it" status in the core's own docs.

## Rows

| Symbol | Value/type | Pinned source file:line (d6a2581d) | Destination | Host vocabulary: permission names, ids, paths — injected OR justified | @agent-note obligations | Caller/proof |
|---|---|---|---|---|---|---|
| `PluginRuntimeSource` | type (interface) | plugin-runtime.ts:35-43 | J node `runtime-core.ts`, exported; T re-exports type | `routes/plugins/files.ts` doc mention → reworded to "host package-files viewer"; `"built-in"` = J discovery source literal, justified | yes: `importModule` only reached through `loadPlugin()` after integrity/sdkRange | T callers (8 tests, `app.ts`, `deps.ts`) via re-export; tsc |
| `PluginLoadTarget` | type (private) | :49-54 | same file, private | none, inspected | none (private) | package-paths unit |
| `resolveLoadTarget` | value (private) | :74-101 | same file, private, unchanged | none (`siteEntryPath` = J REQ-02 layout) | existing doc kept | G-plug, provider-plugins, source-runtime |
| `SAFE_PLUGIN_ID_SEGMENT` | value (private) | :113 | same file, private | comment names T `src/features/agent-plugins/layout.ts` as the parallel pattern it deliberately does NOT import — historical why-comment, no import, not emitted (private const); justified | — | package-paths unit |
| `PluginUninstallPathError` | value (class) | :120-125 | J node, exported; T `export { PluginUninstallPathError } from "@jini-ai/plugins/host/node"` | error text = plugin-domain path refusal, kept byte-identical | yes: error identity — one class object, `name` unchanged | `uninstall.ts` `instanceof`; package-paths unit `instanceof` |
| `SAFE_VERSION_SEGMENT` | value (private) | :130 | same file, private | none | — | package-paths unit |
| `resolvePackageLocation` | value (private) | :145-160 | same file, private | `<installDir>/<id>/<version>/` = J REQ-02 layout, justified | existing `@throws` kept | files.integration |
| `PluginRuntimeCoreBindings` | type | :195-260 | J node, exported; T re-exports | `plugins_list` doc mention → reworded "host plugin-list tool"; `seedBundledAgentPlugins` named as a design precedent in a why-comment, justified (no import) | yes: dispose order/drain, preview writes nothing, shared hook registry | all composition tests |
| `PluginRuntimeHostBinding` | type | :278-288 | J node, exported; T re-exports | all members host-owned (identityNamespace, coreOwnerName, install-disabled wording, tier policy, archive reader, digest, invocation factory) — injected | yes (existing): one bag per runtime, archive reader host-supplied | composition tests |
| `PluginRuntimeTracker` | type | :292-294 | J node, exported; T re-exports | telemetry name/user/properties → host `quarantineTelemetry` projection | yes (existing): capture only, no second tracker | L005 characterization |
| `PluginRuntimeLookup` | type | :298-300 | J node over core `PluginLookupPort`; T re-exports | `family: "site-runtime"` = plugin-domain install identity grammar, justified | yes (existing): serialized admission, read per install | install integration, G-plug |
| `PluginRuntimeText` | type | :304-311 | J node, exported; T re-exports; T keeps `TOVU_PLUGIN_RUNTIME_TEXT` | scaffold entry, `plugins_set_enabled`, `plugin_source_rollback`, `tovu.plugin.json`, `/api/p/` → host text (T only) | yes (existing): exact host bytes | source-runtime integration |
| `PluginRuntimeCoreRequired` / `PluginRuntimeCoreOptional` | type | :321-351 | J node, exported; T re-exports | none in J (all host values injected) | yes (existing) + second-host rule | J new test, composition tests |
| `declaresProviders` | value (private) | :354-356 | same file, private | none | — | provider-plugins test |
| `createPluginRuntimeCore` | value (factory, two objects) | :409-897 | J node, exported; T re-exports and calls it | `[plugin-runtime]` console prefix = neutral module tag, justified; `-runtime` / `-trash` sibling dir suffixes = J plugin snapshot / uninstall parking layout (saved paths unchanged), justified; `unknown/<id>` publisher fallback = J publisher identity grammar, justified; `10_000` provider timeout default = plugin-domain default, unchanged | yes: shared repo/workspace/registry, single activation queue and ONE invocation ALS per load (from the injected factory), epochs/disposal/drain, reload approval/rollback, resolver-before-import, preview writes nothing, host owns SDK/entry/env/policy/telemetry/wording, error identity | NEW J `runtime-core.extract-s6.unit.test.ts` (second host); all T gates |
| `assertReloadApproved` comment `plugins_set_enabled` | comment | :854-856 | same function in J | host tool name → reworded neutrally (N1) | — | grep emitted .d.ts / source |
| `ComposePluginRuntimeRequired`, `PluginRuntimeBindings`, `composePluginRuntime`, `TOVU_PLUGIN_RUNTIME_TEXT` | type/value | :162-192, :263-269, :361-379, :382-398 | STAY T (product wiring + text) | env/host signals, `createTier2WorkerRunner`, `pluginHostBinding`, `plugin_quarantined`/`system`/`cms` telemetry, `getPluginHost` → host | existing | all T gates |

## Closure audit (moved code, runtime and type imports)

Direct imports of `runtime-core.ts`: `node:path`, `node:fs/promises`; `@jini-ai/core/plugin-directory`
(`createPluginLookupFacade`, `PluginLookupPort`), `@jini-ai/core/primitives` (`Clock`); same package:
`../activation.js`, `../bundled-initialization.js`, `../contributions.js`, `../browser-providers.js`, `../ports.js`,
`../source-policy.js`, `../declarative-enable.js`, `../discovery-types.js`, `../hook-registry.js`, `../manifest-types.js`
(or `../manifest.js`), `../quarantine.js`, `../claim-conflicts.js`, `../plugin-claims.js`, `../attach-loaded-plugin.js`,
`./install.js`, `./module-snapshot.js`, `./source-drafts.js`, `./discovery.js`, `./package-files.js`, `./loader.js`,
`../worker/import-seam.js`, `../worker/protocol.js` (type), `../worker/run-call.js` (type). `./host/worker` is the same
`node` runtime domain, no `jini.isolation.domains` split. No T, `@tovu/*`, CMS, diagnostics, agent-plugins, sandbox,
daemon or other neighbour import (types included). Transitive: `./source-drafts.js` already reaches the existing
optional peer `@jini-ai/platform/fs/file-lock` through the node entry (unchanged; no new dependency/peer).
No A8–A11/H0–H3 symbol in the closure (inspected: no hosted/OAuth/connect/agent-plugins type).

## Caller search at Jini pin (packages AND examples/)

`git grep` at `4044fe3c` for `createPluginRuntimeCore|PluginRuntimeSource|PluginUninstallPathError|resolveLoadTarget|
resolvePackageLocation|PluginRuntimeHostBinding|PluginRuntimeLookup|PluginRuntimeText|PluginRuntimeTracker` over
`packages examples`: one hit, a doc comment in `J plugins/src/host/discovery-types.ts:53` naming
`PluginRuntimeSource.manifest` — no code caller; the new export introduces no name clash in the node entry.

T importers of `composition/plugin-runtime` (all keep compiling via re-exports): `app.ts`, `deps.ts`,
`routes/plugins/uninstall.ts` (`PluginUninstallPathError` instanceof), tests: tier2-runtime.integration,
browser-provider.integration, plugin-runtime.provider-plugins, plugin-runtime.package-paths.unit (instanceof),
plugin-runtime-l005-characterization, plugin-host.integration, files.integration, g-plug observe fixtures (2),
contribution-runtime, install, declarative-runtime, source-runtime, plugin-conflicts, activation integrations.
