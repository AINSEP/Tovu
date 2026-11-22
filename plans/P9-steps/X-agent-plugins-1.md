# X-agent-plugins-1 — agent-plugins → @jini-ai/agent-plugins (Jini step J then Tovu step T)

Lane X. Batch J:19 T:20. Depends on: none (only already-Jini code). Est: J 88 min, T 107 min.

## J — move verbatim into Jini (13 files, 867 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/agent-plugins/admin-surfaces/capabilities.ts` | `packages/agent-plugins/src/site/admin-surfaces/capabilities.ts` | 45 | W1 |
| `apps/website/src/features/agent-plugins/admin-surfaces/forms.ts` | `packages/agent-plugins/src/site/admin-surfaces/forms.ts` | 38 |  |
| `apps/website/src/features/agent-plugins/admin-surfaces/public-config.ts` | `packages/agent-plugins/src/site/admin-surfaces/public-config.ts` | 31 | W3 |
| `apps/website/src/features/agent-plugins/bundled-catalog.ts` | `packages/agent-plugins/src/site/bundled-catalog.ts` | 173 | W22 |
| `apps/website/src/features/agent-plugins/bundled-id-upgrade.ts` | `packages/agent-plugins/src/site/bundled-id-upgrade.ts` | 171 | W10 |
| `apps/website/src/features/agent-plugins/deploy-split-activation.ts` | `packages/agent-plugins/src/site/deploy-split-activation.ts` | 30 |  |
| `apps/website/src/features/agent-plugins/descriptor-i18n.ts` | `packages/agent-plugins/src/site/descriptor-i18n.ts` | 23 |  |
| `apps/website/src/features/agent-plugins/executable-tools/approval-bindings.ts` | `packages/agent-plugins/src/site/executable-tools/approval-bindings.ts` | 8 |  |
| `apps/website/src/features/agent-plugins/mcp-metadata.ts` | `packages/agent-plugins/src/site/mcp-metadata.ts` | 14 | W2 |
| `apps/website/src/features/agent-plugins/memory-i18n.ts` | `packages/agent-plugins/src/site/memory-i18n.ts` | 172 |  |
| `apps/website/src/features/agent-plugins/executable-tools/approval.ts` | `packages/agent-plugins/src/site/executable-tools/approval.ts` | 10 |  |
| `apps/website/src/features/agent-plugins/retired-plugin-tool-aliases.ts` | `packages/agent-plugins/src/site/retired-plugin-tool-aliases.ts` | 52 |  |
| `apps/website/src/features/agent-plugins/soon-lock.ts` | `packages/agent-plugins/src/site/soon-lock.ts` | 100 | W2 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/agent-plugins" exports["./site/admin-surfaces/capabilities"]
- "@jini-ai/agent-plugins" exports["./site/admin-surfaces/forms"]
- "@jini-ai/agent-plugins" exports["./site/admin-surfaces/public-config"]
- "@jini-ai/agent-plugins" exports["./site/bundled-catalog"]
- "@jini-ai/agent-plugins" exports["./site/bundled-id-upgrade"]
- "@jini-ai/agent-plugins" exports["./site/deploy-split-activation"]
- "@jini-ai/agent-plugins" exports["./site/descriptor-i18n"]
- "@jini-ai/agent-plugins" exports["./site/executable-tools/approval"]
- "@jini-ai/agent-plugins" exports["./site/executable-tools/approval-bindings"]
- "@jini-ai/agent-plugins" exports["./site/mcp-metadata"]
- "@jini-ai/agent-plugins" exports["./site/memory-i18n"]
- "@jini-ai/agent-plugins" exports["./site/retired-plugin-tool-aliases"]
- "@jini-ai/agent-plugins" exports["./site/soon-lock"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (10, 1104 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/agent-plugins/admin-surfaces/__tests__/unit/capabilities.unit.test.ts`
- `apps/website/src/features/agent-plugins/admin-surfaces/__tests__/unit/forms.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/fixtures/bundled-source-root.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-catalog.pointer.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-id-upgrade.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/manifest.default-tools-read.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-site-compliance-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/manifest.unit.test.ts`
- `apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/approval.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/retired-plugin-tool-aliases.unit.test.ts`


## T — Tovu repoint: delete the 13 sources, rewrite every importer (82 lines)

```
apps/website/src/features/agent-plugins/executable-tools/__tests__/capability-lifetime.security.test.ts:22  '../../admin-surfaces/capabilities.js' -> '@jini-ai/agent-plugins/site/admin-surfaces/capabilities'
apps/website/src/features/api-connections/__tests__/surface-adapters.security.test.ts:34  '../../agent-plugins/admin-surfaces/capabilities.js' -> '@jini-ai/agent-plugins/site/admin-surfaces/capabilities'
apps/website/src/server/runtime/composition/agent-plugin-connections.ts:26  '#src/features/agent-plugins/admin-surfaces/capabilities' -> '@jini-ai/agent-plugins/site/admin-surfaces/capabilities'
apps/website/src/server/runtime/composition/agent-plugin-connections.ts:30  '#src/features/agent-plugins/admin-surfaces/forms' -> '@jini-ai/agent-plugins/site/admin-surfaces/forms'
apps/website/src/features/api-connections/__tests__/surface-adapters.security.test.ts:32  '../../agent-plugins/admin-surfaces/public-config.js' -> '@jini-ai/agent-plugins/site/admin-surfaces/public-config'
apps/website/src/server/runtime/composition/agent-plugin-connections.ts:28  '#src/features/agent-plugins/admin-surfaces/public-config' -> '@jini-ai/agent-plugins/site/admin-surfaces/public-config'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts:8  '../../bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-package.unit.test.ts:22  '../../bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-kuinetic-package.unit.test.ts:9  '../../bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-site-import-package.unit.test.ts:11  '../../bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-software-engineering-package.unit.test.ts:11  '../../bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts:9  '../../bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/__tests__/unit/plugin-credential-cards.unit.test.ts:181  '../../bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/__tests__/unit/retire-bundled.unit.test.ts:566  '../../bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts:10  '../../bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/automatic-agent-plugins.ts:8  './bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/bundled-contribution-sources.ts:4  './bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/lifecycle.ts:33  './bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/lifecycle.ts:54  './bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/tool-registrations.ts:36  './bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/deployments/deploy-targets/__tests__/vendor-scan.ts:6  '#src/features/agent-plugins/bundled-catalog' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/site-backup/bundled-export-file-policy.ts:5  '../agent-plugins/bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/server/inbound/assistant/plugin-prompt-prefix.ts:19  '../../../features/agent-plugins/bundled-catalog.js' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/server/runtime/boot/__tests__/bootstrap-reporting.unit.test.ts:10  '#src/features/agent-plugins/bundled-catalog' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/server/runtime/boot/bootstrap.ts:7  '#src/features/agent-plugins/bundled-catalog' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/server/runtime/composition/modules/assistant-byok.ts:9  '#src/features/agent-plugins/bundled-catalog' -> '@jini-ai/agent-plugins/site/bundled-catalog'
development/scripts/__tests__/bundled-agent-plugin-selection.test.ts:12  '../../../apps/website/src/features/agent-plugins/bundled-catalog.ts' -> '@jini-ai/agent-plugins/site/bundled-catalog'
development/scripts/compose-bundled-agent-plugins.mjs:25  '../../apps/website/src/features/agent-plugins/bundled-catalog.ts' -> '@jini-ai/agent-plugins/site/bundled-catalog'
apps/website/src/features/agent-plugins/lifecycle.ts:29  './bundled-id-upgrade.js' -> '@jini-ai/agent-plugins/site/bundled-id-upgrade'
apps/website/src/features/agent-plugins/lifecycle.ts:71  './bundled-id-upgrade.js' -> '@jini-ai/agent-plugins/site/bundled-id-upgrade'
apps/website/src/features/agent-plugins/__tests__/unit/deploy-split-activation.unit.test.ts:9  '../../deploy-split-activation.js' -> '@jini-ai/agent-plugins/site/deploy-split-activation'
apps/website/src/features/agent-plugins/__tests__/unit/deploy-split-activation.unit.test.ts:46  '../../deploy-split-activation.js' -> '@jini-ai/agent-plugins/site/deploy-split-activation'
apps/website/src/features/agent-plugins/__tests__/unit/deploy-split-activation.unit.test.ts:59  '../../deploy-split-activation.js' -> '@jini-ai/agent-plugins/site/deploy-split-activation'
apps/website/src/features/agent-plugins/__tests__/unit/deploy-split-activation.unit.test.ts:71  '../../deploy-split-activation.js' -> '@jini-ai/agent-plugins/site/deploy-split-activation'
apps/website/src/features/agent-plugins/lifecycle.ts:28  './deploy-split-activation.js' -> '@jini-ai/agent-plugins/site/deploy-split-activation'
apps/website/src/features/agent-plugins/__tests__/unit/descriptor-i18n.unit.test.ts:9  '../../descriptor-i18n.js' -> '@jini-ai/agent-plugins/site/descriptor-i18n'
apps/website/src/features/source-control/provider-registry.ts:7  '#src/features/agent-plugins/descriptor-i18n' -> '@jini-ai/agent-plugins/site/descriptor-i18n'
apps/website/src/features/agent-plugins/executable-tools/host-bindings.ts:16  './approval-bindings.js' -> '@jini-ai/agent-plugins/site/executable-tools/approval-bindings'
apps/website/src/assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts:11  '../../features/agent-plugins/mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/assistant/__tests__/moved-tools.access-token.golden.test.ts:26  '../../features/agent-plugins/mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-pipeline.integration.test.ts:14  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/a10b-connect-seam.unit.test.ts:19  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/access-token-tool.unit.test.ts:18  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/apply-connect-defaults.unit.test.ts:19  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/apply-tool-renames.unit.test.ts:15  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-composio-package.unit.test.ts:8  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-package.unit.test.ts:20  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-package.unit.test.ts:7  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-higgsfield-media-package.unit.test.ts:8  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-search-meilisearch.unit.test.ts:22  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-site-import-package.unit.test.ts:14  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts:8  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/capability-projection.unit.test.ts:13  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts:29  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/declined-access.unit.test.ts:10  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/enable-access.regression.test.ts:12  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/federate-mcp.unit.test.ts:23  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/import-access-token.unit.test.ts:26  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/mcp-projection-seam.distinct-ports.unit.test.ts:23  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/portable-readers.unit.test.ts:3  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/token-sign-in.unit.test.ts:8  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/tw2-L224-characterization.unit.test.ts:7  '../../mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/capability-projection.ts:9  './mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/capability-projection.ts:10  './mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/connect-tool.ts:23  './mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/federate-mcp.ts:16  './mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/server/__tests__/admin-supabase-token-no-agent.test.ts:16  '../../features/agent-plugins/mcp-metadata.js' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/server/runtime/boot/__tests__/agent-plugin-token-boot-order.unit.test.ts:13  '#src/features/agent-plugins/mcp-metadata' -> '@jini-ai/agent-plugins/site/mcp-metadata'
apps/website/src/features/agent-plugins/__tests__/unit/memory-i18n.unit.test.ts:5  '../../memory-i18n.js' -> '@jini-ai/agent-plugins/site/memory-i18n'
apps/website/src/features/agent-plugins/uninstall-confirmation-ui.ts:1  './memory-i18n.js' -> '@jini-ai/agent-plugins/site/memory-i18n'
apps/website/src/assistant/__tests__/moved-tools.golden.test.ts:28  '../../features/agent-plugins/executable-tools/approval.js' -> '@jini-ai/agent-plugins/site/executable-tools/approval'
apps/website/src/features/agent-plugins/executable-tools/__tests__/executable-tools.security.test.ts:9  '../approval.js' -> '@jini-ai/agent-plugins/site/executable-tools/approval'
apps/website/src/features/agent-plugins/executable-tools/host-bindings.ts:15  './approval.js' -> '@jini-ai/agent-plugins/site/executable-tools/approval'
apps/website/src/server/runtime/composition/installed-extension-tools.ts:30  '#src/features/agent-plugins/retired-plugin-tool-aliases' -> '@jini-ai/agent-plugins/site/retired-plugin-tool-aliases'
apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts:15  '../../soon-lock.js' -> '@jini-ai/agent-plugins/site/soon-lock'
apps/website/src/features/agent-plugins/lifecycle.ts:31  './soon-lock.js' -> '@jini-ai/agent-plugins/site/soon-lock'
apps/website/src/features/agent-plugins/set-enabled.ts:41  './soon-lock.js' -> '@jini-ai/agent-plugins/site/soon-lock'
apps/website/src/features/agent-plugins/set-enabled.ts:42  './soon-lock.js' -> '@jini-ai/agent-plugins/site/soon-lock'
apps/website/src/features/site-backup/import-plugin-state.ts:4  '#src/features/agent-plugins/soon-lock' -> '@jini-ai/agent-plugins/site/soon-lock'
apps/website/src/server/runtime/boot/__tests__/bootstrap-reporting.unit.test.ts:12  '#src/features/agent-plugins/soon-lock' -> '@jini-ai/agent-plugins/site/soon-lock'
apps/website/src/server/runtime/boot/bootstrap.ts:6  '#src/features/agent-plugins/soon-lock' -> '@jini-ai/agent-plugins/site/soon-lock'
apps/website/src/server/runtime/composition/agent-plugin-service-ports.ts:17  '#src/features/agent-plugins/soon-lock' -> '@jini-ai/agent-plugins/site/soon-lock'
```

## Tovu tests that must stay green (43; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts`
- `apps/website/src/assistant/__tests__/moved-tools.access-token.golden.test.ts`
- `apps/website/src/assistant/__tests__/moved-tools.golden.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-pipeline.integration.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/a10b-connect-seam.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/access-token-tool.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/apply-connect-defaults.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/apply-tool-renames.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-composio-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-higgsfield-media-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-kuinetic-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-search-meilisearch.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-site-import-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-software-engineering-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/capability-projection.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/declined-access.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/deploy-split-activation.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/descriptor-i18n.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/enable-access.regression.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/federate-mcp.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/import-access-token.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/mcp-projection-seam.distinct-ports.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/memory-i18n.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-credential-cards.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/portable-readers.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/retire-bundled.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/token-sign-in.unit.test.ts`
- `apps/website/src/features/agent-plugins/__tests__/unit/tw2-L224-characterization.unit.test.ts`
- `apps/website/src/features/agent-plugins/executable-tools/__tests__/capability-lifetime.security.test.ts`
- `apps/website/src/features/agent-plugins/executable-tools/__tests__/executable-tools.security.test.ts`
- `apps/website/src/features/api-connections/__tests__/surface-adapters.security.test.ts`
- `apps/website/src/features/deployments/deploy-targets/__tests__/vendor-scan.ts`
- `apps/website/src/server/__tests__/admin-supabase-token-no-agent.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/agent-plugin-token-boot-order.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/bootstrap-reporting.unit.test.ts`
- `development/scripts/__tests__/bundled-agent-plugin-selection.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/agent-plugins/admin-surfaces/capabilities.ts` (1)
- `apps/website/src/features/agent-plugins/admin-surfaces/public-config.ts` (3)
- `apps/website/src/features/agent-plugins/bundled-catalog.ts` (22)
- `apps/website/src/features/agent-plugins/bundled-id-upgrade.ts` (10)
- `apps/website/src/features/agent-plugins/mcp-metadata.ts` (2)
- `apps/website/src/features/agent-plugins/soon-lock.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/agent-plugins/admin-surfaces/public-config.ts:15: const PUBLIC_NAME_PATTERN = /^(TOVU_[A-Z0-9_]{1,48}_(APP_ID|CLIENT_ID|BROWSER_KEY|PUBLIC_KEY)|JINI_GOOGLE_PICKER_APP_ID|JINI_GOOGLE_PICKER_B
apps/website/src/features/agent-plugins/bundled-catalog.ts:24: export const BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED: ReadonlySet<string> = new Set(["github", "site-import", "tovu-theme", "how-tovu-works", "
apps/website/src/features/agent-plugins/bundled-catalog.ts:83: ["tovu-deploy-fly", "fly"],
apps/website/src/features/agent-plugins/bundled-catalog.ts:86: ["create-tovu-theme", "tovu-theme"],
apps/website/src/features/agent-plugins/bundled-catalog.ts:87: ["tovuize-site", "tovu-theme"],
apps/website/src/features/agent-plugins/bundled-id-upgrade.ts:37: new Map(RENAMED_TO_JINI.map(id => [id, { from: `tovu/${id}`, to: `jini/${id}` }]));
apps/website/src/features/agent-plugins/bundled-id-upgrade.ts:133: if (ledger.get(revision.pluginId) !== revision.archiveDigest) return "its installed copy is not the one Tovu installed from its own build";
```

## Named mutation
in the Jini copy of `bundled-catalog.ts`, negate the first `if (` condition of its first exported function; `bundled-source-root.ts` must go red, then revert
