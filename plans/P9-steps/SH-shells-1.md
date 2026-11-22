# SH — delete Tovu re-export shells / compat adapters of Jini (owner: no re-export shells)

For each file: every importer line below imports names the shell re-exports from Jini. Replace the specifier with the Jini specifier the shell re-exports those names from (shown per shell); if one import pulls names from two Jini specifiers, split it into two import lines. Then delete the shell. **adapter** files also hold host values (product constants such as transfer schema names): move ONLY the re-export lines out (importers import Jini directly), keep the host constants in the file, and delete the file only if nothing else remains.

## `apps/admin/src/lib/standing-draft-recovery-message.ts` (shell, 9 LOC) → `@jini-ai/ui/panel-kit`
```
```

## `apps/website/src/contracts/core/external-mcp-access.ts` (shell, 6 LOC) → `@jini-ai/core/contracts/hosted-mcp`, `@jini-ai/mcp/federation/hosted`
```
apps/website/src/features/agent-plugins/__tests__/unit/mcp-ports.error-identity.unit.test.ts:4  '../../../../contracts/core/external-mcp-access.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/oauth-sign-in-refusal.unit.test.ts:13  '../../../../contracts/core/external-mcp-access.js'  (test)
apps/website/src/features/agent-plugins/mcp-host-bindings.ts:2  '../../contracts/core/external-mcp-access.js'
apps/website/src/features/external-mcp/__tests__/h1a/hosted-mcp-error-identity.test.ts:5  '../../../../contracts/core/external-mcp-access.js'  (test)
apps/website/src/features/external-mcp/__tests__/h1a/hosted-mcp-projections.test.ts:7  '../../../../contracts/core/external-mcp-access.js'  (test)
apps/website/src/features/external-mcp/__tests__/h1a/hosted-mcp-type-pins.test.ts:14  '../../../../contracts/core/external-mcp-access.js'  (test)
apps/website/src/features/external-mcp/contracts.ts:1  '../../contracts/core/external-mcp-access.js'
apps/website/src/features/external-mcp/external-mcp-store.ts:1  '../../contracts/core/external-mcp-access.js'
```

## `apps/website/src/contracts/core/external-mcp-auth.ts` (shell, 8 LOC) → `@jini-ai/mcp/federation/hosted`, `@jini-ai/core/contracts/hosted-mcp`
```
apps/website/src/assistant/external-mcp-reauth-tool.ts:20  '../contracts/core/external-mcp-auth.js'
apps/website/src/assistant/external-mcp-reauth-tool.ts:21  '../contracts/core/external-mcp-auth.js'
apps/website/src/assistant/external-mcp-reauth-tool.ts:22  '../contracts/core/external-mcp-auth.js'
apps/website/src/features/agent-plugins/__tests__/unit/mcp-ports.error-identity.unit.test.ts:5  '../../../../contracts/core/external-mcp-auth.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/oauth-sign-in-refusal.unit.test.ts:14  '../../../../contracts/core/external-mcp-auth.js'  (test)
apps/website/src/features/agent-plugins/mcp-host-bindings.ts:3  '../../contracts/core/external-mcp-auth.js'
apps/website/src/features/external-mcp/__tests__/external-mcp-dcr.test.ts:13  '../../../contracts/core/external-mcp-auth.js'  (test)
apps/website/src/features/external-mcp/__tests__/h1a/hosted-mcp-projections.test.ts:8  '../../../../contracts/core/external-mcp-auth.js'  (test)
apps/website/src/features/external-mcp/__tests__/h1a/hosted-mcp-type-pins.test.ts:15  '../../../../contracts/core/external-mcp-auth.js'  (test)
apps/website/src/features/external-mcp/__tests__/h2c/sign-in-ports.test.ts:27  '../../../../contracts/core/external-mcp-auth.js'  (test)
apps/website/src/features/external-mcp/__tests__/unit/auth-mode.unit.test.ts:5  '../../../../contracts/core/external-mcp-auth.js'  (test)
apps/website/src/features/external-mcp/external-mcp-oauth.ts:14  '../../contracts/core/external-mcp-auth.js'
apps/website/src/features/external-mcp/external-mcp-oauth.ts:15  '../../contracts/core/external-mcp-auth.js'
```

## `apps/website/src/contracts/core/path-containment.ts` (shell, 21 LOC) → `@jini-ai/platform/fs`
```
apps/website/src/contracts/core/__tests__/unit/path-containment.unit.test.ts:5  '../../path-containment.js'  (test)
apps/website/src/contracts/core/index.ts:6  './path-containment.js'
apps/website/src/server/inbound/public-http/middleware/theme-asset-dirs.ts:3  '#src/contracts/core/path-containment'
apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts:6  '#src/contracts/core/path-containment'
```

## `apps/website/src/contracts/core/upload-limits.ts` (shell, 8 LOC) → `@jini-ai/cms/media`
```
apps/website/src/features/media/__tests__/tool-registrations.test.ts:22  '#src/contracts/core/upload-limits'  (test)
apps/website/src/features/media/duplicate-asset.ts:13  '../../contracts/core/upload-limits.js'
apps/website/src/features/media/import-media-entity.ts:6  '#src/contracts/core/upload-limits'
apps/website/src/features/media/index.ts:136  '../../contracts/core/upload-limits.js'
apps/website/src/features/media/tool-registrations.ts:18  '../../contracts/core/upload-limits.js'
apps/website/src/features/publish-content/file-tree-policy.ts:1  '#src/contracts/core/upload-limits'
apps/website/src/server/inbound/assistant/agent-daemon-scope-attachments.ts:9  '#src/contracts/core/upload-limits'
```

## `apps/website/src/features/agent-plugins/mcp-metadata.ts` (shell, 14 LOC) → `@jini-ai/agent-plugins/lifecycle`
```
apps/website/src/assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts:11  '../../features/agent-plugins/mcp-metadata.js'  (test)
apps/website/src/assistant/__tests__/moved-tools.access-token.golden.test.ts:26  '../../features/agent-plugins/mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-pipeline.integration.test.ts:14  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/manifest.default-tools-read.test.ts:5  '../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/a10b-connect-seam.unit.test.ts:19  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/access-token-tool.unit.test.ts:18  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/apply-connect-defaults.unit.test.ts:19  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/apply-tool-renames.unit.test.ts:15  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/bundled-composio-package.unit.test.ts:8  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-package.unit.test.ts:20  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-package.unit.test.ts:7  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/bundled-higgsfield-media-package.unit.test.ts:8  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/bundled-search-meilisearch.unit.test.ts:22  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/bundled-site-compliance-package.unit.test.ts:8  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/bundled-site-import-package.unit.test.ts:14  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/bundled-supabase-package.unit.test.ts:8  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/capability-projection.unit.test.ts:13  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts:29  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/declined-access.unit.test.ts:10  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/enable-access.regression.test.ts:12  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/federate-mcp.unit.test.ts:23  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/import-access-token.unit.test.ts:26  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/manifest.unit.test.ts:5  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/mcp-projection-seam.distinct-ports.unit.test.ts:23  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/portable-readers.unit.test.ts:3  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/token-sign-in.unit.test.ts:8  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/tw2-L224-characterization.unit.test.ts:7  '../../mcp-metadata.js'  (test)
apps/website/src/features/agent-plugins/capability-projection.ts:9  './mcp-metadata.js'
apps/website/src/features/agent-plugins/capability-projection.ts:10  './mcp-metadata.js'
apps/website/src/features/agent-plugins/connect-tool.ts:23  './mcp-metadata.js'
apps/website/src/features/agent-plugins/federate-mcp.ts:16  './mcp-metadata.js'
apps/website/src/server/__tests__/admin-supabase-token-no-agent.test.ts:16  '../../features/agent-plugins/mcp-metadata.js'  (test)
apps/website/src/server/runtime/boot/__tests__/agent-plugin-token-boot-order.unit.test.ts:13  '#src/features/agent-plugins/mcp-metadata'  (test)
```

## `apps/website/src/features/analytics/types.ts` (shell, 54 LOC) → `@jini-ai/analytics`
```
apps/website/src/features/analytics/__tests__/forwarding.test.ts:7  '../types.js'  (test)
apps/website/src/features/analytics/__tests__/jini-adapters.test.ts:7  '../types.js'  (test)
apps/website/src/features/analytics/__tests__/jini-adapters.unit.test.ts:5  '../types.js'  (test)
apps/website/src/features/analytics/__tests__/repo.contract.test.ts:13  '../types.js'  (test)
apps/website/src/features/analytics/config.settings.ts:11  './types.js'
apps/website/src/features/analytics/index.ts:37  './types.js'
apps/website/src/features/analytics/jini-adapters.ts:15  './types.js'
apps/website/src/features/analytics/ports.ts:44  './types.js'
```

## `apps/website/src/features/custom-credentials/sets/host.ts` (shell, 8 LOC) → `@jini-ai/integrations/credentialed-http/sets`
```
apps/website/src/features/custom-credentials/__tests__/extract-s8-c1-second-host.test.ts:9  '../sets/host.js'  (test)
```

## `apps/website/src/features/custom-credentials/sets/store.ts` (shell, 8 LOC) → `@jini-ai/integrations/credentialed-http/sets`
```
apps/website/src/features/custom-credentials/__tests__/extract-s8-c1-second-host.test.ts:15  '../sets/store.js'  (test)
apps/website/src/features/custom-credentials/__tests__/extract-s8-c1-source-scan.test.ts:9  '../sets/store.js'  (test)
```

## `apps/website/src/features/custom-credentials/sets/vault-repo.ts` (shell, 8 LOC) → `@jini-ai/integrations/credentialed-http/sets`
```
apps/website/src/features/custom-credentials/__tests__/extract-s8-c1-second-host.test.ts:10  '../sets/vault-repo.js'  (test)
apps/website/src/features/custom-credentials/__tests__/extract-s8-c1-source-scan.test.ts:11  '../sets/vault-repo.js'  (test)
```

## `apps/website/src/features/database-transfer/copy-engine.ts` (adapter, 22 LOC) → `@jini-ai/db/transfer`
```
apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts:20  '../copy-engine.js'  (test)
apps/website/src/features/database-transfer/__tests__/exclusions.unit.test.ts:12  '../copy-engine.js'  (test)
apps/website/src/features/database-transfer/tool-registrations.ts:20  './copy-engine.js'
apps/website/src/features/database-transfer/tool-registrations.ts:29  './copy-engine.js'
```

## `apps/website/src/features/database-transfer/plan-store.ts` (adapter, 6 LOC) → `@jini-ai/db/tools`
```
apps/website/src/features/database-transfer/__tests__/confirmation-policy.unit.test.ts:9  '../plan-store.js'  (test)
apps/website/src/features/database-transfer/__tests__/confirmation-ui.unit.test.ts:7  '../plan-store.js'  (test)
apps/website/src/features/database-transfer/__tests__/tool-registrations.faults.unit.test.ts:13  '../plan-store.js'  (test)
apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts:17  '../plan-store.js'  (test)
apps/website/src/features/database-transfer/__tests__/transfer-snapshots.unit.test.ts:13  '../plan-store.js'  (test)
apps/website/src/features/database-transfer/confirmation-ui.ts:3  './plan-store.js'
apps/website/src/features/database-transfer/tool-registrations.ts:23  './plan-store.js'
```

## `apps/website/src/features/database-transfer/postgres-target.ts` (adapter, 11 LOC) → `@jini-ai/db/transfer`
```
apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts:23  '../postgres-target.js'  (test)
apps/website/src/features/database-transfer/__tests__/pg-test-db.ts:1  '../postgres-target.js'  (test)
apps/website/src/features/database-transfer/destination-store.ts:8  './postgres-target.js'
apps/website/src/features/database-transfer/tool-registrations.ts:24  './postgres-target.js'
```

## `apps/website/src/features/database/timeline.ts` (shell, 4 LOC) → `@jini-ai/db/tools`
```
apps/website/src/features/database/__tests__/unit/repo.memory.unit.test.ts:8  '../../timeline.js'  (test)
apps/website/src/features/database/__tests__/unit/timeline.unit.test.ts:4  '../../timeline.js'  (test)
apps/website/src/features/database/__tests__/unit/timeline.unit.test.ts:88  '../../timeline.js'  (test)
apps/website/src/features/database/repo.memory.ts:1  './timeline.js'
apps/website/src/features/database/tool-registrations.ts:48  './timeline.js'
apps/website/src/platform/db/sqlite/database-journal-repo.ts:9  '#src/features/database/timeline'
apps/website/src/server/inbound/admin-http/routes/database/timeline.ts:6  '#src/features/database/timeline'
apps/website/src/server/routes/types.ts:87  '../../features/database/timeline.js'
```

## `apps/website/src/features/entries/index.ts` (shell, 69 LOC) → `@jini-ai/cms/entries`, `@jini-ai/core/primitives`, `@jini-ai/core`
```
apps/website/src/assistant/__tests__/merged-readers-batch.test.ts:15  '../../features/entries/index.js'  (test)
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:71  '../../features/entries/index.js'  (test)
apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts:11  '../../features/entries/index.js'  (test)
apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts:12  '../../features/entries/index.js'  (test)
apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts:11  '../../features/entries/index.js'  (test)
apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts:28  '../../features/entries/index.js'  (test)
apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts:136  '../../features/entries/index.js'  (test)
apps/website/src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts:29  '../../features/entries/index.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts:6  '#src/features/entries/index'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-scripts.test.ts:7  '#src/features/entries/index'  (test)
apps/website/src/features/comments/__tests__/index.test.ts:6  '../../entries/index.js'  (test)
apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts:12  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts:13  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.test.ts:7  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.test.ts:8  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/integration/repo.dialects.test.ts:10  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/integration/repo.dialects.test.ts:11  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/integration/repo.sqlite.integration.test.ts:11  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/repo.characterization.test.ts:7  '../index.js'  (test)
apps/website/src/features/entries/__tests__/repo.characterization.test.ts:8  '../index.js'  (test)
apps/website/src/features/entries/__tests__/unit/publish-content.test.ts:14  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts:6  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts:7  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.display.unit.test.ts:7  '../../index.js'  (test)
apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.display.unit.test.ts:8  '../../index.js'  (test)
apps/website/src/features/entries/publish-content.ts:22  './index.js'
apps/website/src/features/plugin-runtime/__tests__/integration/testimonials-faq-sample.integration.test.ts:18  '#src/features/entries/index'  (test)
apps/website/src/features/publish-content/__tests__/media-video-embed.round-trip.test.ts:19  '#src/features/entries/index'  (test)
apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts:25  '../../entries/index.js'  (test)
apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts:13  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts:8  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/__tests__/integration/gallery-widget.integration.test.ts:6  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/__tests__/integration/gallery.integration.test.ts:5  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/__tests__/integration/header-occurrence-collision.integration.test.ts:5  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/__tests__/integration/html-form-embeds.integration.test.ts:4  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts:5  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts:60  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/__tests__/integration/region-area-service.integration.test.ts:7  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts:5  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/__tests__/unit/resolvers-recent-entries.unit.test.ts:7  '#src/features/entries/index'  (test)
apps/website/src/features/widgets/publish-content.ts:9  '../entries/index.js'
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:335  '../../features/entries/index.js'  (test)
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:1032  '../../features/entries/index.js'  (test)
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:1332  '../../features/entries/index.js'  (test)
apps/website/src/server/__tests__/admin-widgets-routes.test.ts:1446  '../../features/entries/index.js'  (test)
apps/website/src/server/__tests__/widgets-error-code-parity.test.ts:10  '../../features/entries/index.js'  (test)
apps/website/src/server/inbound/admin-http/routes/entries/create.ts:4  '#src/features/entries/index'
apps/website/src/server/inbound/admin-http/routes/entries/lifecycle.ts:5  '#src/features/entries/index'
apps/website/src/server/inbound/admin-http/routes/entries/list.ts:5  '#src/features/entries/index'
apps/website/src/server/inbound/admin-http/routes/entries/update.ts:5  '#src/features/entries/index'
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/embed-insert.unit.test.ts:4  '#src/features/entries/index'  (test)
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/library.unit.test.ts:5  '#src/features/entries/index'  (test)
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/preview.unit.test.ts:6  '#src/features/entries/index'  (test)
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/region-bind.unit.test.ts:5  '#src/features/entries/index'  (test)
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/route-guards.unit.test.ts:6  '#src/features/entries/index'  (test)
apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts:5  '#src/features/entries/index'  (test)
apps/website/src/server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts:8  '#src/features/entries/index'  (test)
apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts:14  '#src/features/entries/index'  (test)
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/collection-lists.ts:12  '#src/features/entries/index'
```

## `apps/website/src/features/form-destinations/types.ts` (shell, 23 LOC) → `@jini-ai/cms/forms`
```
apps/website/src/features/api-connections/form-delivery-connection.ts:4  '../form-destinations/types.js'
apps/website/src/features/deployments/deploy-targets/types.ts:1  '#src/features/form-destinations/types'
apps/website/src/features/deployments/static-publish/__tests__/inspection.unit.test.ts:8  '#src/features/form-destinations/types'  (test)
apps/website/src/features/deployments/static-publish/adapter.ts:20  '#src/features/form-destinations/types'
apps/website/src/features/deployments/static-publish/inspection.ts:6  '#src/features/form-destinations/types'
apps/website/src/features/form-destinations/__tests__/byho-compat.unit.test.ts:21  '../types.js'  (test)
apps/website/src/features/form-destinations/__tests__/deliver.unit.test.ts:12  '../types.js'  (test)
apps/website/src/features/form-destinations/__tests__/delivery.security.test.ts:13  '../types.js'  (test)
apps/website/src/features/form-destinations/__tests__/port.unit.test.ts:11  '../types.js'  (test)
apps/website/src/features/form-destinations/__tests__/pull.unit.test.ts:4  '../types.js'  (test)
apps/website/src/features/form-destinations/__tests__/registry.unit.test.ts:9  '../types.js'  (test)
apps/website/src/features/form-destinations/__tests__/select.unit.test.ts:6  '../types.js'  (test)
apps/website/src/features/form-destinations/connection-port.ts:2  './types.js'
apps/website/src/features/form-destinations/deliver.ts:3  './types.js'
apps/website/src/features/form-destinations/index.ts:22  './types.js'
apps/website/src/features/form-destinations/key-store.ts:10  './types.js'
apps/website/src/features/form-destinations/port.ts:6  './types.js'
apps/website/src/features/form-destinations/pull.ts:1  './types.js'
apps/website/src/features/form-destinations/registry.ts:4  './types.js'
apps/website/src/features/form-destinations/select.ts:1  './types.js'
```

## `apps/website/src/features/member-login/types.ts` (shell, 5 LOC) → `@jini-ai/user-management/server`
```
apps/website/src/features/agent-plugins/__tests__/fixtures/plugin-exports.ts:4  '../../../member-login/types.js'  (test)
apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts:81  '#src/features/member-login/types'  (test)
apps/website/src/features/agent-plugins/exports/runtime.ts:7  '../../member-login/types.js'
apps/website/src/features/member-login/__tests__/credentials.test.ts:6  '../types.js'  (test)
apps/website/src/features/member-login/__tests__/fixtures.ts:5  '../types.js'  (test)
apps/website/src/features/member-login/__tests__/link-service.dialects.test.ts:10  '../types.js'  (test)
apps/website/src/features/member-login/__tests__/link-service.test.ts:11  '../types.js'  (test)
apps/website/src/features/member-login/__tests__/oidc-login.test.ts:5  '../types.js'  (test)
apps/website/src/features/member-login/credentials.ts:4  './types.js'
apps/website/src/features/member-login/index.ts:8  './types.js'
apps/website/src/features/member-login/index.ts:9  './types.js'
apps/website/src/features/member-login/link-service.ts:9  './types.js'
apps/website/src/features/member-login/oidc-login.ts:10  './types.js'
apps/website/src/features/member-login/providers.ts:10  './types.js'
apps/website/src/features/member-login/ready-providers.ts:6  './types.js'
```

## `apps/website/src/features/navigation/menu-version-conflict-error.ts` (shell, 13 LOC) → `@jini-ai/cms/navigation`
```
apps/website/src/features/navigation/__tests__/import-menu.test.ts:6  '../menu-version-conflict-error.js'  (test)
apps/website/src/features/navigation/__tests__/repo.sqlite.compare-and-set.test.ts:10  '../menu-version-conflict-error.js'  (test)
apps/website/src/features/navigation/index.ts:139  './menu-version-conflict-error.js'
apps/website/src/features/navigation/trash-aware-memory-menu-repo.ts:5  './menu-version-conflict-error.js'
```

## `apps/website/src/features/recovery/recovery-orchestrator.ts` (shell, 3 LOC) → `@jini-ai/db/recovery/recovery-orchestrator`
```
apps/website/src/features/recovery/__tests__/integration/recovery-orchestrator.execute-restore.integration.test.ts:5  '../../recovery-orchestrator.js'  (test)
apps/website/src/features/recovery/__tests__/integration/restore-flow-ordering.integration.test.ts:5  '../../recovery-orchestrator.js'  (test)
apps/website/src/features/recovery/__tests__/integration/restore-flow-ordering.integration.test.ts:69  '../../recovery-orchestrator.js'  (test)
apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts:4  '../../recovery-orchestrator.js'  (test)
apps/website/src/features/recovery/__tests__/unit/recovery-orchestrator.confirm-restore.unit.test.ts:4  '../../recovery-orchestrator.js'  (test)
apps/website/src/features/recovery/__tests__/unit/recovery-orchestrator.plan-restore.unit.test.ts:4  '../../recovery-orchestrator.js'  (test)
apps/website/src/features/recovery/tool-registrations.ts:53  './recovery-orchestrator.js'
apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts:6  '#src/features/recovery/recovery-orchestrator'
```

## `apps/website/src/features/taxonomy/index.ts` (shell, 60 LOC) → `@jini-ai/cms/taxonomy`, `@jini-ai/core/primitives`, `@jini-ai/core`
```
apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts:22  '../../features/taxonomy/index.js'  (test)
apps/website/src/features/entries/__tests__/unit/publish-content.test.ts:9  '#src/features/taxonomy/index'  (test)
apps/website/src/features/entries/publish-content.ts:10  '#src/features/taxonomy/index'
apps/website/src/features/taxonomy/__tests__/gated-hooks.test.ts:3  '../index.js'  (test)
apps/website/src/features/taxonomy/__tests__/integration/repo.sqlite.integration.test.ts:20  '../../index.js'  (test)
apps/website/src/features/taxonomy/__tests__/integration/repo.sqlite.integration.test.ts:21  '../../index.js'  (test)
apps/website/src/features/taxonomy/__tests__/publish-content.test.ts:7  '../index.js'  (test)
apps/website/src/features/taxonomy/__tests__/repo.characterization.test.ts:6  '../index.js'  (test)
apps/website/src/features/taxonomy/__tests__/repo.dialects.test.ts:5  '../index.js'  (test)
apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts:27  '../index.js'  (test)
apps/website/src/features/taxonomy/content-targets.ts:5  './index.js'
apps/website/src/features/taxonomy/gated-hooks.ts:4  './index.js'
apps/website/src/features/taxonomy/publish-content.ts:19  './index.js'
apps/website/src/features/taxonomy/publish-term-ids.ts:5  './index.js'
apps/website/src/features/taxonomy/tool-registrations.ts:37  './index.js'
apps/website/src/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts:6  '#src/features/taxonomy/index'  (test)
apps/website/src/server/inbound/admin-http/routes/taxonomy/__tests__/assign-terms-error-mapping.unit.test.ts:8  '#src/features/taxonomy/index'  (test)
apps/website/src/server/inbound/admin-http/routes/taxonomy/assign-terms.ts:15  '#src/features/taxonomy/index'
apps/website/src/server/inbound/admin-http/routes/taxonomy/create-taxonomy.ts:5  '#src/features/taxonomy/index'
apps/website/src/server/inbound/admin-http/routes/taxonomy/create-term.ts:14  '#src/features/taxonomy/index'
apps/website/src/server/inbound/admin-http/routes/taxonomy/list.ts:4  '#src/features/taxonomy/index'
apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts:6  '#src/features/taxonomy/index'
apps/website/src/server/inbound/admin-http/routes/taxonomy/rename-term.ts:5  '#src/features/taxonomy/index'
apps/website/src/server/routes/types.ts:111  '../../features/taxonomy/index.js'
apps/website/src/server/runtime/composition/app.ts:82  '#src/features/taxonomy/index'
apps/website/src/server/runtime/composition/memory-deps/route-deps/model-comments-plugins.ts:1  '#src/features/taxonomy/index'
apps/website/src/server/runtime/composition/memory-deps/slices/taxonomy-trash-repos.ts:6  '#src/features/taxonomy/index'
apps/website/src/server/runtime/composition/site-deps/trash-follow-up-hooks.ts:21  '#src/features/taxonomy/index'
apps/website/src/server/runtime/composition/site-deps/trash-stores.ts:6  '#src/features/taxonomy/index'
```

## `apps/website/src/features/webhooks/types.ts` (shell, 14 LOC) → `@jini-ai/integrations/webhooks`, `@jini-ai/platform/secrets`
```
apps/website/src/assistant/__tests__/tool-registrations.webhooks.test.ts:29  '../../features/webhooks/types.js'  (test)
apps/website/src/features/webhooks/__tests__/delivery.test.ts:19  '../types.js'  (test)
apps/website/src/features/webhooks/__tests__/repo.memory.test.ts:9  '../types.js'  (test)
apps/website/src/features/webhooks/__tests__/signing.keyring.test.ts:7  '../types.js'  (test)
apps/website/src/features/webhooks/__tests__/tool-contract.characterization.test.ts:24  '../types.js'  (test)
apps/website/src/features/webhooks/repo.memory.ts:12  './types.js'
apps/website/src/features/webhooks/repo.memory.ts:22  './types.js'
apps/website/src/platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts:17  '#src/features/webhooks/types'  (test)
apps/website/src/platform/db/sqlite/__tests__/webhook-subscription-repo.sqlite.test.ts:13  '#src/features/webhooks/types'  (test)
apps/website/src/server/runtime/composition/__tests__/webhook-delivery-worker.shutdown.test.ts:10  '#src/features/webhooks/types'  (test)
```
