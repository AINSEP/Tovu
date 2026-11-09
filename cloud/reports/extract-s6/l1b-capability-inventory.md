# EXTRACT-S6 L1b part 1 — capability-tool seam: inventory (written before implementation)

Pins: Tovu `c3801c833a191be51753dcdecd133b0cad6f8945`, Jini `4044fe3c0fa34b1f903c5d20a6b4de7714cde573`.
Starting tips: Tovu `3a400db4`, Jini `1f7bcbe1` (L1a done). T = Tovu `apps/website/src/`; J = Jini `packages/`.
Line numbers are at the Tovu pin (the file is unchanged between the pin and `3a400db4`).
Scope: the capability-tool registrar only. The runtime factory (`server/runtime/composition/plugin-runtime.ts`),
`invocation-core-deps`, tracker and lookup are L1b part 2 and are not touched.

## Origin of the transported text

| File | Git blob SHA (pin) | SHA-256 (pin bytes) | Lines |
|---|---|---|---|
| `T features/plugin-runtime/capability-tool-registrations.ts` | `204ccbf944ebe91f939145ef1a75104aa0cd64c0` | `5b9e237eb0b1132d994e10ffe01faa2dabf74b123e45fe1439e65ab3b8b09da9` | 518 |

Transport method: the plugin-owned algorithm (lines 23-518 minus host prose) is carried as its original
text into the NEW J file `J plugins/src/host/capability-tools.ts` (cross-repo, so no Git rename edge),
exported from the universal `@jini-ai/plugins/host` barrel: its whole closure is `@jini-ai/core`,
`@jini-ai/core/plugin-directory` (universal) and same-package universal modules (`plugin-claims`,
`tool-contributions`, `activation`, `discovery-types`, `manifest-types`); no `node:`/async_hooks/fs/worker.
Functions keep their original names and bodies; the changed expressions are only the host literals
listed below, each replaced by a read of the factory's required args. The T file is rewritten in place
as a thin binder that keeps every old export name and signature and binds the exact original bytes in a
`CAPABILITY_TOOL_MESSAGES` text object.

Comment map: `@file` header (T 23-123) → J file header, verbatim (it names T-side history files as
history, no product identity); the disclosed cross-domain read note (T 14-19) stays in T beside the
`PostRecord` import it explains; every per-function doc comment moves with its function; the
`capabilityToolIdFor` pointer note (T 125-126) moves with the source loader; the `executablePluginToolPorts`
inline notes (T 506, 514-515) move with that function.

## Destination legend

`same package` = J `@jini-ai/plugins` universal `plugins/host`; `core` = existing `@jini-ai/core` value
or type (no new core export); `named local port` = new local contract in the J file; `host input` =
value the host supplies through `createPluginCapabilityTools`' required args (Tovu binds it in the T binder).

## Rows

| Symbol | Value/type | Pinned source file:line | Destination | Host vocabulary: permission names, ids, paths — injected OR justified | @agent-note obligations | Caller/proof |
|---|---|---|---|---|---|---|
| `isPluginEnabledInWorkspace` | value (fn) | T capability-tool-registrations.ts:132-135 | same package (private) | none, inspected (`enabled === true` is the plugin activation contract, J `activation.ts`) | none (private) | G-plug 2 `bootRegistered`/`activationGate`; revocation integration |
| `PluginCapabilityFieldSource` | type | :138-150 | same package (exported); T re-exports type | none, inspected (`ext.{pluginId}.` is J manifest namespacing grammar, `manifest.ts validateField`) | yes: fields are already-validated manifest data | T unit/discoverability tests (type) |
| `PluginCapabilityToolSource` | type | :155-165 | same package (exported); T re-exports type | `id` = `capabilityToolIdFor` output (saved format, J-owned, unchanged) | yes: id is the conflict-claimed saved id; `runsFresh` meaning | discoverability integration (type) |
| `runsFreshFor` | value | :169-171 | same package (private) | `"tier-2"`, `"content.entry.beforeSave"`: plugin-domain manifest tier/hook grammar owned by J `manifest.ts` (`VALID_HOOKS`) — justified, not host | none (private) | G-plug 2 fresh descriptor/call |
| `genericFieldDescription` | value (template) | :176-178 | host input `text.genericFieldDescription({ pluginName, path, type })`; T binds exact template | product prose ("written whenever a post is saved…") — injected | yes on `PluginCapabilityToolText` member | G-plug 2 fallback descriptor |
| `buildFieldSources` | value | :187-197 | same package (private) | `ext.${id}.` prefix: plugin manifest namespacing grammar — justified | none (private) | G-plug 2 `sources[].fields` |
| `buildCapabilityToolDescription` | value | :207-224 | same package (private algorithm) + host inputs | `namespace: "tovu"` → `identityNamespace` (injected); `Plugin discovery: …` → `text.discovery({ terms })`; fresh/stored prose naming `content_post_search/list/get`, "post or page", "JSON-valued fields…" → `text.freshDescription/storedDescription({ pluginName, fieldText })` (injected, exact bytes in T) | yes: namespace and description prose are host-owned; join order `fields… + discovery` stays | G-plug 2 `sources[].description` (fresh/stored/fallback) |
| `readPluginIdentity` (import) | value | :3 | core `@jini-ai/core/plugin-directory` (unchanged import) | namespace injected (above) | — | G-plug 2 |
| `loadEnabledPluginCapabilityToolSources` | value (exported) | :234-260 | J factory member `loadSources(required)`; T export = binder, same signature | none, inspected | yes: one discovery call, one activation read per plugin, short-circuit order | T unit, discoverability, plugin-host integration, G-plug 2 |
| `capabilityToolIdFor` (import) | value | :13, :250 | same package `plugin-claims.ts` — already J, unchanged | saved `plugin_capability_<id>` derivation + conflict claim (saved format, J-owned, kept) | existing | G-plug 2 `sources[].id`; J claim-conflicts test |
| `pluginCapabilityToolDerivedRisk` | value (exported) | :265-267 | same package exported `pluginCapabilityToolDerivedRisk({ sources }, {})`; T export keeps positional binder | `"none"`: core `DerivedRiskByToolId` vocabulary — justified | yes | T unit test, G-plug 2 `derivedRisk` |
| `buildCapabilityInputSchema` | value | :269-284 | same package (private) + host input `text.postIdDescription` | prose naming `content_post_search/list/get` → injected; key `postId`, `minLength 1`, `additionalProperties:false`: the tool's own frozen input wire (G-plug 2), justified | yes on text member | G-plug 2 `descriptors[].inputSchema` |
| `readStoredFieldBag` | value | :290-294 | same package (private) | none, inspected | none (private) | G-plug 2 stored calls |
| `decodeFieldValue` | value | :299-306 | same package (private) | none, inspected | none (private) | G-plug 2 JSON decode call |
| `buildCapabilityToolResult` | value | :310-337 | same package (private) + host input `text.noDataNote({ pluginName })` | note prose → injected; result keys `postId/pluginId/computedNow/fields/note` = frozen content payload, justified | yes: payload shape unchanged | G-plug 2 no-data call; NEW J test payload |
| `PluginCapabilityToolDeps` | type (exported) | :339-351 | T keeps its interface (T `AuthorizeFn`, `PluginPostReadPort`, `PluginBeforeSavePreview`); J gets named local port `PluginCapabilityToolDeps<TPost, TDraft>` with the same member names | `authorize` → core `LegacyToolAuthorizeFn`; `postRead` → local `PluginCapabilityPostReadPort<TPost>`; `previewPluginBeforeSave` → local positional `PluginCapabilityPreviewPort<TDraft>` (existing callback ABI) | yes on every member: per-call live reads, read-only post port, preview writes/counts nothing | installed-extension-tools (type), all tests |
| `PostRecord` / `PluginPostReadPort` (T imports) | type | :20-21 | stay T; J uses named local `PluginCapabilityPost` (`id`, `workspaceId`, `ext?`) — no broad post contract | `post` entity is injected (below) | yes: read-only, never writes | T tsc |
| `PluginBeforeSavePreview` (T import) | type | :11 | stays T; J local `PluginCapabilityPreviewPort<TDraft>` | draft payload fields (id/workspaceId/title/slug/status/bodyJson/ext) are host SDK payload → host input `toPreviewDraft({ post })`, T binds the exact field list | yes: draft built per call, positional ABI preserved | G-plug 2 fresh call |
| `resolveFieldBag` | value | :358-383 | same package (private) + host inputs | `PLUGIN_HOOK_FAILED: '…' could not run on post '…'…` → `text.previewFailed({ pluginName, postId })` (injected; code prefix is part of the host bytes); `ToolInputError` from core (same class) | yes: cause kept on error, fixed text to model | G-plug 2 `calls.previewFailure`; T unit |
| `capabilityCatalogEntry` | value | :386-394 | same package (private) + host input `access.permission` | `"content.read"` → injected; `sideEffects: "none"` core vocabulary, justified | yes: SAME `access` object as handler | G-plug 2 `descriptors`; NEW J test |
| `capabilityToolHandler` | value | :397-406 | same package (private) | `"content.read"` + `entityType: "post"` → injected `access` (same object as catalog); `requireToolPermission`/`adaptLegacyAuthorize` → core (T imported cms/core re-exports of the same core functions) | yes: same supplied permission reaches catalog and handler | G-plug 2 `authorizeCalls`; NEW J test |
| `isCapabilityCallableNow` | value | :410-419 | same package (private) + host input `text.activationReadDenied({ pluginId, detail })` | log prefix `[plugin-runtime]` + prose → injected; `console.warn` channel kept | yes: read failure denies and is logged | T unit (non-Error throw), revocation integration |
| `withActivationGate` | value | :427-438 | same package (private) | none, inspected | yes: gate runs before inner policy, per call | revocation integration |
| `buildPluginCapabilityToolRegistrations` | value (exported) | :458-471 | J factory member `buildRegistrations({ sources, deps, applyApprovalPolicy }, {})`; T export = binder, same signature | `toolMetadata` → host input `catalog.metadata` (stays T); `"plugin-capability"` → `catalog.domain`; `"features/plugin-runtime/capability-tool-registrations.ts"` → `catalog.catalogModule`; `'plugin-capability-result'` → `approvalFamily`; `withExtensionApprovalPolicy` → per-call `applyApprovalPolicy` callback (extension approval stays T) | yes: wrapping order gate-then-approval; build is sync, no I/O | T unit, extension-approval-classification, plugin-host integration, G-plug 2 |
| `registerEnabledPluginCapabilityTools` | value (exported) | :488-502 | J factory member `registerEnabled({ registry, deps, applyApprovalPolicy }, {})`; T export = binder, same signature | none beyond rows above | yes: registration before FTS snapshot is the caller's ordering; throws registry collisions | revocation integration, T unit, G-plug 2 `bootRegistered` |
| `executablePluginToolPorts` | value | :505-518 | same package (private) + host input `executableAccess` | `'admin.plugins.enable'`, entity `'plugin'`, metadata `{ approval: { class: 'publish', confirmation: 'direct' } }` → injected (`executableAccess.permission/entityType/metadata`); `access: 'admin'` = J `PluginAuthContext` vocabulary, justified | yes: admin gate per call, isEnabled live read | T unit (executable attach test) |
| `attachPluginContributionTools`, `PluginToolContributionPorts`, `PluginContributionRegistry` (imports) | value/type | :2 | same package (unchanged) | — | existing | — |
| `PluginActivationRepoPort`, `PluginManifest`, `PluginManifestFieldDecl` | type | :9, :12 | same package | — | existing | — |
| `PluginDiscoveryRecord` | type | :10 (from `plugins/host/node`) | same package universal `discovery-types.ts` (the node entry only re-exports it) | — | existing | — |
| `ApplyExtensionApprovalPolicy` (T import) | type | :5 | stays T; J local `PluginCapabilityApprovalPort<TFamily>` | family type is T's `keyof EXTENSION_TOOL_APPROVAL_POLICY` → generic `TFamily` | yes | extension-approval-classification |
| `AuthorizeFn` (T import) | type | :8 | stays T; J uses core `LegacyToolAuthorizeFn` | — | yes | T tsc |
| `toolMetadata` (T import) | value | :4 | stays T, injected as `catalog.metadata` | host metadata | yes on member | tool-registrations.contracts, moved-tools.golden, metadata baseline SHA |
| `buildDomainRegistrations`, `indexCatalogById`, `isRecord`, `requireInputRecord`, `requireString`, `ToolInputError`, core types | value/type | :1, :6 | core (unchanged) | — | — | — |
| NEW `createPluginCapabilityTools` | value | — | same package exported factory `(required, optional)` | all host vocabulary above arrives here | yes: every member | NEW J test, T binder |
| NEW `PluginCapabilityToolText`, `PluginCapabilityToolAccess`, `PluginCapabilityExecutableAccess`, `PluginCapabilityToolsRequired`, `PluginCapabilityTools`, `PluginCapabilityPost`, `PluginCapabilityPostReadPort`, `PluginCapabilityPreviewPort`, `PluginCapabilityApprovalPort` | type | — | same package exported | — | yes on each and members, verified in emitted `dist/host/capability-tools.d.ts` | NEW J test, T tsc |
| Emitted declarations | — | — | `dist/host/capability-tools.d.ts`, `dist/host/index.d.ts` (one `export *` line) | no cms, T or SDK type in emitted declarations | yes | .d.ts grep |

## Caller search at the Jini pin (packages + examples)

`rg 'capability-tool-registrations|loadEnabledPluginCapabilityToolSources|buildPluginCapabilityToolRegistrations|registerEnabledPluginCapabilityTools|PluginCapabilityToolSource'`
in J `packages/` and `examples/`: comment mentions only (`plugins/src/host/manifest-types.ts:36`,
`manifest.ts:398`, `plugin-claims.ts:64`, `__tests__/unit/manifest.unit.test.ts:202-204`) and generated
ledgers (`daemon/docs/caller-ledger.csv`, `call-shape-sweep.tsv`). No code caller; no existing J export name
collides (`PluginCapabilityTool*`, `createPluginCapabilityTools`, `pluginCapabilityToolDerivedRisk` absent).

T callers (all keep working through the old-path binder): `server/runtime/composition/installed-extension-tools.ts:31`,
`assistant/installed-extension-tools.ts:25` (type), tests `features/plugin-runtime/__tests__/unit/capability-tool-registrations.unit.test.ts`,
`__tests__/integration/capability-tool-{revocation,search-discoverability}.integration.test.ts`,
`__tests__/fixtures/extract-s6-g-plug-observe.ts`, `assistant/__tests__/extension-approval-classification.test.ts`,
`server/runtime/composition/__tests__/plugin-host.integration.test.ts`. `development/scripts/check-architecture.baseline.json:244`
records the edge `capability-tool-registrations.ts -> features/post/index.ts`; the binder keeps that type import.

## Design decision: deps passed by reference

The J members take the caller's `deps` object itself (same member names as T's `PluginCapabilityToolDeps`), never a
copy, so every per-call read (`pluginActivationRepo`, `previewPluginBeforeSave`, `postRead`) stays live exactly as
before. The preview draft is built by the host's `toPreviewDraft` at call time, keeping the positional preview ABI.

No unresolved row: implementation may start.
