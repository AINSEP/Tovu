# X-plugin-runtime-1 — plugin-runtime → @jini-ai/plugins (Jini step J then Tovu step T)

Lane X. Batch J:19 T:21. Depends on: none (only already-Jini code). Est: J 51 min, T 46 min.

## J — move verbatim into Jini (7 files, 675 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/plugin-runtime/agent-tools.ts` | `packages/plugins/src/runtime/agent-tools.ts` | 294 | W14 |
| `apps/website/src/features/plugin-runtime/built-ins/content-analyzer/index.ts` | `packages/plugins/src/runtime/built-ins/content-analyzer/index.ts` | 108 | W2 |
| `apps/website/src/features/plugin-runtime/install-consent.ts` | `packages/plugins/src/runtime/install-consent.ts` | 30 |  |
| `apps/website/src/features/plugin-runtime/plugin-tool-ids.ts` | `packages/plugins/src/runtime/plugin-tool-ids.ts` | 4 |  |
| `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts` | `packages/plugins/src/runtime/plugin-tool-messages.ts` | 73 | W12 |
| `apps/website/src/features/plugin-runtime/sdk-resolver.ts` | `packages/plugins/src/runtime/sdk-resolver.ts` | 125 | W15 |
| `apps/website/src/features/plugin-runtime/source-tool-catalog.ts` | `packages/plugins/src/runtime/source-tool-catalog.ts` | 41 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/plugins" exports["./runtime/agent-tools"]
- "@jini-ai/plugins" exports["./runtime/built-ins/content-analyzer"]
- "@jini-ai/plugins" exports["./runtime/install-consent"]
- "@jini-ai/plugins" exports["./runtime/plugin-tool-ids"]
- "@jini-ai/plugins" exports["./runtime/plugin-tool-messages"]
- "@jini-ai/plugins" exports["./runtime/sdk-resolver"]
- "@jini-ai/plugins" exports["./runtime/source-tool-catalog"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 67 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/plugin-runtime/__tests__/unit/install-consent.unit.test.ts`


## T — Tovu repoint: delete the 7 sources, rewrite every importer (32 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:73  '../../features/plugin-runtime/agent-tools.js' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-families.test.ts:30  '../../features/plugin-runtime/agent-tools.js' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.plugins-uninstall.test.ts:24  '../../features/plugin-runtime/agent-tools.js' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts:20  '../../features/plugin-runtime/agent-tools.js' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool.integration.test.ts:27  '#src/features/plugin-runtime/agent-tools' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-observe.ts:26  '../../agent-tools.js' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/features/plugin-runtime/__tests__/unit/agent-plugin-enable-guidance.test.ts:9  '../../agent-tools.js' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/features/plugin-runtime/__tests__/unit/source-tools.unit.test.ts:9  '../../agent-tools.js' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/features/plugin-runtime/enable-confirmation-ui.ts:3  './agent-tools.js' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/features/plugin-runtime/host-tool-binding.ts:9  './agent-tools.js' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/features/plugin-runtime/tool-registrations.ts:16  './agent-tools.js' -> '@jini-ai/plugins/runtime/agent-tools'
apps/website/src/features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-observe.ts:27  '../../built-ins/content-analyzer/index.js' -> '@jini-ai/plugins/runtime/built-ins/content-analyzer'
apps/website/src/features/plugin-runtime/__tests__/unit/capability-tool-registrations.unit.test.ts:7  '../../built-ins/content-analyzer/index.js' -> '@jini-ai/plugins/runtime/built-ins/content-analyzer'
apps/website/src/features/plugin-runtime/built-ins/content-analyzer/__tests__/unit/index.unit.test.ts:13  '../../index.js' -> '@jini-ai/plugins/runtime/built-ins/content-analyzer'
apps/website/src/server/runtime/composition/__tests__/installed-extension-tools.preview-port.test.ts:8  '#src/features/plugin-runtime/built-ins/content-analyzer/index' -> '@jini-ai/plugins/runtime/built-ins/content-analyzer'
apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts:27  '#src/features/plugin-runtime/built-ins/content-analyzer/index' -> '@jini-ai/plugins/runtime/built-ins/content-analyzer'
apps/website/src/server/runtime/composition/app.ts:70  '#src/features/plugin-runtime/built-ins/content-analyzer/index' -> '@jini-ai/plugins/runtime/built-ins/content-analyzer'
apps/website/src/server/runtime/composition/site-deps/plugin-runtime.ts:1  '#src/features/plugin-runtime/built-ins/content-analyzer/index' -> '@jini-ai/plugins/runtime/built-ins/content-analyzer'
apps/website/src/cli/commands/plugin/install.ts:5  '#src/features/plugin-runtime/install-consent' -> '@jini-ai/plugins/runtime/install-consent'
apps/website/src/features/plugin-runtime/install-tool-binding.ts:4  './install-consent.js' -> '@jini-ai/plugins/runtime/install-consent'
apps/website/src/features/plugin-runtime/host-tool-binding.ts:1  './plugin-tool-ids.js' -> '@jini-ai/plugins/runtime/plugin-tool-ids'
apps/website/src/features/plugin-runtime/source-tools.ts:1  './plugin-tool-ids.js' -> '@jini-ai/plugins/runtime/plugin-tool-ids'
apps/website/src/features/plugin-runtime/tool-registrations.ts:2  './plugin-tool-ids.js' -> '@jini-ai/plugins/runtime/plugin-tool-ids'
apps/website/src/features/plugin-runtime/host-tool-binding.ts:13  './plugin-tool-messages.js' -> '@jini-ai/plugins/runtime/plugin-tool-messages'
apps/website/src/features/plugin-runtime/install-tool-binding.ts:9  './plugin-tool-messages.js' -> '@jini-ai/plugins/runtime/plugin-tool-messages'
apps/website/src/cli/commands/export.ts:11  '../../features/plugin-runtime/sdk-resolver.js' -> '@jini-ai/plugins/runtime/sdk-resolver'
apps/website/src/cli/commands/serve.ts:23  '../../features/plugin-runtime/sdk-resolver.js' -> '@jini-ai/plugins/runtime/sdk-resolver'
apps/website/src/server/runtime/boot/plugin-sdk-resolver.ts:2  '../../../features/plugin-runtime/sdk-resolver.js' -> '@jini-ai/plugins/runtime/sdk-resolver'
apps/website/src/server/runtime/boot/plugin-sdk-resolver.ts:3  '../../../features/plugin-runtime/sdk-resolver.js' -> '@jini-ai/plugins/runtime/sdk-resolver'
apps/website/src/server/runtime/plugin-tier2/worker.ts:18  '../../../features/plugin-runtime/sdk-resolver.js' -> '@jini-ai/plugins/runtime/sdk-resolver'
apps/website/src/features/plugin-runtime/host-tool-binding.ts:12  './source-tool-catalog.js' -> '@jini-ai/plugins/runtime/source-tool-catalog'
apps/website/src/features/plugin-runtime/source-tools.ts:2  './source-tool-catalog.js' -> '@jini-ai/plugins/runtime/source-tool-catalog'
```

## Tovu tests that must stay green (12; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-families.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.plugins-uninstall.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool.integration.test.ts`
- `apps/website/src/features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-observe.ts`
- `apps/website/src/features/plugin-runtime/__tests__/unit/agent-plugin-enable-guidance.test.ts`
- `apps/website/src/features/plugin-runtime/__tests__/unit/capability-tool-registrations.unit.test.ts`
- `apps/website/src/features/plugin-runtime/__tests__/unit/source-tools.unit.test.ts`
- `apps/website/src/features/plugin-runtime/built-ins/content-analyzer/__tests__/unit/index.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/installed-extension-tools.preview-port.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/plugin-runtime/agent-tools.ts` (14)
- `apps/website/src/features/plugin-runtime/built-ins/content-analyzer/index.ts` (2)
- `apps/website/src/features/plugin-runtime/plugin-tool-messages.ts` (12)
- `apps/website/src/features/plugin-runtime/sdk-resolver.ts` (15)
- `apps/website/src/features/plugin-runtime/source-tool-catalog.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/plugin-runtime/agent-tools.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/plugin-runtime/agent-tools.ts:136: "Which plugin SYSTEM the id belongs to. Required, and never guessed — Tovu has two unrelated systems that share the word 'plugin'. " +
apps/website/src/features/plugin-runtime/agent-tools.ts:138: "anything search_agent_plugin_local returned, e.g. an image/video plugin). Use 'site-runtime' for a .tovu-plugin site/runtime plugin — " +
apps/website/src/features/plugin-runtime/agent-tools.ts:159: "to restart Tovu or claim an unavailable tool is ready.",
apps/website/src/features/plugin-runtime/agent-tools.ts:174: "argument, and the same reason: Tovu has two unrelated systems that share the word 'plugin'. Use 'agent-plugin' for an " +
apps/website/src/features/plugin-runtime/agent-tools.ts:176: ".tovu-plugin site/runtime plugin (anything content_read.plugin returned). If you did not get the id from one of those " +
apps/website/src/features/plugin-runtime/agent-tools.ts:185: "returned by search_agent_plugin_local — must be installed in this workspace and not bundled with Tovu.",
apps/website/src/features/plugin-runtime/agent-tools.ts:210: "Turns a plugin ON or OFF. This is the ONE tool for enabling and disabling plugins, and it covers BOTH of Tovu's plugin systems — " +
apps/website/src/features/plugin-runtime/agent-tools.ts:212: "image/video plugin), 'site-runtime' for a .tovu-plugin site plugin listed by content_read.plugin. Use this when the " +
apps/website/src/features/plugin-runtime/agent-tools.ts:228: "Uninstalls a plugin. This is the ONE tool for uninstalling plugins, and it covers BOTH of Tovu's plugin systems — say " +
apps/website/src/features/plugin-runtime/agent-tools.ts:235: "Agent Plugin from THIS workspace — its package and activation record. This is NOT reversible from inside Tovu: there " +
apps/website/src/features/plugin-runtime/agent-tools.ts:237: "id is not installed in this workspace or is BUNDLED with Tovu (bundled plugins are re-seeded on every boot) — call " +
apps/website/src/features/plugin-runtime/built-ins/content-analyzer/index.ts:35: extensions: { tovu: { id: "tovu/content-analyzer", provides: ["content-analysis"] } },
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:2: export const familyRequired = "'family' is required and must be exactly one of: 'site-runtime' (a .tovu-plugin site plugin, as listed by " +
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:3: "content_read.plugin) or 'agent-plugin' (an Agent Plugin, as returned by search_agent_plugin_local). Tovu has two " +
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:38: `search for agent_plugin_${request.pluginId} to read its guidance. Do not ask the person to restart Tovu.`
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:44: "daemon starts — tell the user Tovu has to be restarted before that tool can be called."
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:46: "in the running daemon until Tovu restarts, but every call to it is refused from now on.";
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:55: ? "Tell the user to restart Tovu (recovery runs at start) and then try again."
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:56: : `Its update recovery record needs manual repair (${error.code}); restarting Tovu will not fix it. Tell the user an operator has to repair 
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:60: export function hostIncompatibleNote({ pluginId }: { pluginId: string }): string { return `Nothing changed: '${pluginId}' is not made for th
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:61: "Tell the user it needs a version of the plugin that supports this Tovu."; }
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:65: export function activationsBusyNote({ pluginId, enabled }: { pluginId: string; enabled: boolean }): string { return `Nothing changed: anothe
apps/website/src/features/plugin-runtime/plugin-tool-messages.ts:69: export const localInstallDisabledNote = "Nothing was installed: local plugin installs are off on this server. The owner has to start Tovu wi
apps/website/src/features/plugin-runtime/source-tool-catalog.ts:36: { name: 'plugin_source_seal', description: 'Validates the draft manifest, computes integrity for every package file, uses a higher manifest 
```

## Named mutation
in the Jini copy of `agent-tools.ts`, negate the first `if (` condition of its first exported function; `install-consent.unit.test.ts` must go red, then revert
