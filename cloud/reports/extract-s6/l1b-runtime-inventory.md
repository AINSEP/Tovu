# EXTRACT-S6 L1b part 2 — runtime / SDK binding seam: inventory (written before implementation)

Pins: Tovu `c3801c833a191be51753dcdecd133b0cad6f8945`, Jini `4044fe3c0fa34b1f903c5d20a6b4de7714cde573`.
Starting tips: Tovu `b5711eb6`, Jini `ecefd458` (L1a + L1b part 1 done). T = Tovu `apps/website/src/`; J = Jini `packages/`.
All three origin files are byte-identical between the pin and `b5711eb6` (`git diff --stat` empty), so line numbers are pin lines.
Scope: runtime factory seam, invocation core deps, tracker, lookup/admission. The capability registrar (part 1) is not touched.

## Origin of the transported text

| File | Git blob SHA (pin) | SHA-256 (pin bytes) | Lines |
|---|---|---|---|
| `T server/runtime/composition/plugin-runtime.ts` | `dd49b615183c7ba3f967a9d8d3ddc644f756dbeb` | `5e9094e0a48c9ef8174e9a2241772b678741164b7897e375e22df77be51fe7b3` | 758 |
| `T features/plugin-runtime/invocation-core-deps.ts` | `2efe82e350814f9c4eb18478687211867d6c6722` | `aacce8e625ceb6b622c599458e7717a6a66164a38ee9745dad66cf2cb4518ec6` | 87 |
| `T features/plugin-runtime/host-binding.ts` (read only; not edited) | `48440ad0dbe7790ec98e0e0dd28882dae34342f4` | `e4c524049b4e67257bf5232cbc3383007c266430d6b24122ed6699367b96ff8e` | 123 |

## Decision (smallest change)

1. **invocation-core-deps → Jini now.** The algorithm (87 lines, one ALS) is plugin-domain once the SDK hook
   constant and SDK types are replaced by the plugin-domain `ContentEntryDraft`/`BeforeSaveFilter`/`HookContext`
   already exported from `J plugins/src/host/ports.ts` and a required `beforeSaveHook` id. It needs
   `node:async_hooks`, so it is a NEW file `J plugins/src/host/node/invocation-binding.ts` exported from the
   existing `@jini-ai/plugins/host/node` entry as `createPluginInvocationBinding(required, optional)`.
   Original text transported (header, doc comments, body); changed expressions = only the rows marked
   "host input" below. The T file stays at its path as a binder: same export names/signature, binds
   `beforeSaveHook: HOOK_CONTENT_ENTRY_BEFORE_SAVE` and keeps the rich `@tovu/sdk` typing on its own
   exported types (T keeps SDK adaptation). `host-binding.ts` and the worker ABI (`RunTier2CallRequired
   ["createInvocationCoreDeps"]`) are unchanged.
2. **Runtime factory → seam IN PLACE in T (move is L1c).** Inside `plugin-runtime.ts` the body of
   `composePluginRuntime` becomes `createPluginRuntimeCore(required, optional)` whose REQUIRED args include
   `pluginSourcePolicy`, `tier2CallRunner`, `pluginSdkBinding`, plus the injected host binding bag,
   module importer factory and host text/telemetry projection. The core section reads no host module
   (no `host-signals`, `install`, `run-in-worker`, `host-binding`, `@tovu/sdk`, `features/post`,
   `contracts/headless`, `diagnostics`) — only `@jini-ai/*` (plugins host/node/worker, core) and
   `node:path`/`node:fs`. `composePluginRuntime` keeps its exact signature and optional overrides and
   constructs: env/host-signals policy, `createTier2WorkerRunner({})`, `pluginHostBinding`, the tracker
   projection, the lookup port from `getPluginHost`, and the product text. `PluginRuntimeBindings` keeps
   its member names; its two product-typed members are re-declared over the core's narrow local types.
   Not moved to Jini now because the core's closure (≈600 lines incl. `resolveLoadTarget`, package-location
   guards, snapshot/reload/source service wiring) exceeds this window; L1c moves `createPluginRuntimeCore`
   and its local port types verbatim into `@jini-ai/plugins/host/node`.

## Rows

| Symbol | Value/type | Pinned source file:line | Destination | Host vocabulary: permission names, ids, paths — injected OR justified | @agent-note obligations | Caller/proof |
|---|---|---|---|---|---|---|
| `InvocationState` | type | invocation-core-deps.ts:20-23 | same package (J node, private) over J `ContentEntryDraft` | none, inspected | none (private) | T invocation unit; G-plug 4 |
| `CreatePluginInvocationCoreDepsRequired` | type | :24-28 | T keeps (binder signature); J `CreatePluginInvocationBindingRequired` adds `beforeSaveHook` | hook id → host input | yes: declaredHooks are validated manifest hooks; hook id is the host SDK's | T binder, host-binding |
| `CreatePluginInvocationCoreDepsOptional` | type | :30 | T keeps; J `…Optional = Record<string, never>` | none, inspected | — | — |
| `PluginInvocationCoreDeps` | type | :32-38 | T keeps (SDK `BeforeSaveFilter`); J `PluginInvocationBinding` over plugin-domain `BeforeSaveFilter` | none, inspected | yes: one instance per plugin load; capturedFilter null until setup | worker run-call ABI unchanged |
| `createPluginInvocationCoreDeps` | value | :47-87 | J `createPluginInvocationBinding` (node entry); T export = binder | `HOOK_CONTENT_ENTRY_BEFORE_SAVE` (`@tovu/sdk` id) → required `beforeSaveHook` host input; error texts `plugin '…' called content.read/extend outside a beforeSave hook`, `attempted to attach undeclared hook`, `more than one beforeSave filter` = plugin-domain SDK error wording shared by every host (the `beforeSave` word is the plugin wire name in J `BeforeSaveFilter`), justified, kept byte-identical | yes: ONE AsyncLocalStorage per load; reads/writes only inside the running filter; exactly one declared filter; returned keys win over extend writes; non-object returns pass through | T invocation-core-deps.unit (unchanged); NEW J test with second hook id |
| `AsyncLocalStorage` (import) | value | :13 | J node entry only (`node:async_hooks`) | none | node-only placement | J entry purity |
| `@tovu/sdk` types/const (import) | type+value | :15 | stay T binder only | SDK specifier → host | no SDK type in J emitted .d.ts | grep emitted .d.ts |
| `CapabilityScopedSdkCoreDeps` (import) | type | :17 | same package (`capability-sdk.ts`) | none | existing | — |
| `pluginSourcePolicy` default | value | plugin-runtime.ts:274 | core REQUIRED `pluginSourcePolicy`; T wrapper builds `createSitePluginPolicy({ env: process.env, hostSignals: resolveHostSignals(...) })` | env/host signals → host | yes: host owns env/policy | source-runtime integration, G-plug |
| `tier2CallRunner` default | value | :283 | core REQUIRED; T wrapper `required.tier2CallRunner ?? createTier2WorkerRunner({})` | runner/env/paths stay T (R5.3 edge 13) | yes: worker entry is host's; runner owns timeout | T-worker tests, G-plug 4 |
| `pluginHostBinding.pluginSdkBinding` | value | :284, :392-395 | core REQUIRED `pluginSdkBinding`; T passes product binding | SDK ids/version → host | yes: host owns SDK | composition tests |
| `pluginHostBinding` bag spread | value | :295, :302, :312, :350, :389, :428, :649, :651, :701 | core REQUIRED `hostBinding` (local `PluginRuntimeHostBinding` derived from J parameter types); T passes `pluginHostBinding` | identityNamespace `tovu`, coreOwnerName, localInstallDisabledMessage, archiveReader, tierPolicy, verifyDigest, declarativeContentTypes: all already host values inside the bag — injected | yes: one shared bag per runtime; archive reader host-supplied | all composition tests |
| `createPluginModuleImporter` | value | :4, :429 | core REQUIRED `createModuleImporter`; T passes it | none (host importer) | yes: called only after integrity/sdkRange; resolver-before-import | package-paths, provider-plugins tests |
| `HOOK_CONTENT_ENTRY_BEFORE_SAVE` | value | :29, :412 | core reads `pluginSdkBinding.beforeSaveHook` (same string in T binding) | SDK hook id → host (already in binding) | yes | L005 characterization |
| `productTracker` / `plugin_quarantined` telemetry | value | :163, :268-269 | core optional `tracker` (local `PluginRuntimeTracker<E,O>` = `{ capture }` only) + REQUIRED `quarantineTelemetry({ pluginId })` projection; T binds `{ name: "plugin_quarantined", userId: "system" }`, `{ properties: { pluginId, pluginKind: "cms", reasonClass: "lifecycle" } }` | telemetry name/user/properties → host projection | yes: capture called once per quarantine, after the repo write callback order unchanged; no second tracker | L005 characterization |
| `Tracker` (diagnostics import) | type | :2 | stays T wrapper only | — | no diagnostics import in core | tsc |
| `getPluginHost` → lookup / `withInstallIdentity` | value | :168, :394-396, :655-657 | core optional `lookup?: () => PluginRuntimeLookup \| undefined` where `PluginRuntimeLookup = PluginLookupPort (core) & { withInstallIdentity }` (local); T wrapper passes `required.getPluginHost` (wide T port is structurally assignable) | `family: "site-runtime"`, `unknown/<id>` publisher fallback: plugin-domain install identity grammar (J publisher identity), justified | yes: serialized admission via host `withInstallIdentity`; read per call | install integration, G-plug |
| `createPluginLookupFacade` | value | :3, :396 | core (`@jini-ai/core/plugin-directory`) | none | existing | — |
| scaffold entry text | value | :708-717 | core REQUIRED `text.scaffoldEntry`; T binds exact bytes | names `tovu.plugin.json`, `/api/p/<plugin-id>/hello` → host text | yes: host wording | source-runtime integration |
| reload approval message | value | :679 | core REQUIRED `text.reloadApprovalRequired({ added })`; T binds exact bytes | `plugins_set_enabled` tool name → host text | yes | source-runtime integration |
| restored-reload quarantine reason | value | :688 | core REQUIRED `text.restoreFailedReason`; T binds exact bytes | `plugin_source_rollback` tool name → host text | yes | source-runtime integration |
| `[plugin-runtime]` console prefixes | value | various | stays core | neutral module tag, justified | — | — |
| `-runtime` sibling dir suffix | value | :271 | stays core | plugin runtime snapshot layout (J `module-snapshot`), justified; unchanged saved path | yes: saved layout | package-paths unit |
| `SAFE_PLUGIN_ID_SEGMENT`, `SAFE_VERSION_SEGMENT`, `PluginUninstallPathError`, `resolvePackageLocation`, `resolveLoadTarget` | value | :74-160 | stay at module scope (core section) unchanged | none (plugin id/version grammar) | existing comments | package-paths unit |
| `BeforeSaveHookPort` (T post) | type | :30, :234 | stays on T `PluginRuntimeBindings`; core local `PluginRuntimeBeforeSave` | — | positional adapter preserves entry fields (passes entry object through) | contribution/declarative integration |
| `PluginBeforeSavePreview` (T host-binding) | type | :4, :237 | stays on T bindings; core local positional `PluginRuntimePreviewBeforeSave` | — | preview writes/counts nothing | G-plug 4 preview |
| `PluginHostPort` (contracts/headless) | type | :168 | stays T `ComposePluginRuntimeRequired` | — | not copied into core | tsc |

Transitives/emitted declarations: J emits `dist/host/node/invocation-binding.d.ts` (types only from `../ports.js`,
`../capability-sdk.js`); no `@tovu` in any emitted J declaration (gate greps). No new J dependency. No A8–A11/H symbol
in the closure (inspected: `withInstallIdentity` is the existing T port member; no hosted/OAuth/agent-plugins type).

Caller search at Jini pin (packages + examples): `createInvocationCoreDeps` appears only in J worker `run-call.ts`
(ABI type, unchanged) and its tests/support; no J or example caller of the T runtime factory. T callers of
`composePluginRuntime`: composition `app.ts`, `deps.ts`, CLI-free; tests listed in the gate keep the old signature.
