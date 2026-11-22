# C-contracts-core-1 — contracts-core → @jini-ai/core (Jini step J then Tovu step T)

Lane C. Batch J:1 T:2. Depends on: none (only already-Jini code). Est: J 76 min, T 111 min.

## J — move verbatim into Jini (14 files, 544 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/contracts/core/approval-i18n.ts` | `packages/core/src/contracts/site/approval-i18n.ts` | 118 |  |
| `apps/website/src/contracts/core/assistant-content-guidance.ts` | `packages/core/src/contracts/site/assistant-content-guidance.ts` | 13 |  |
| `apps/website/src/contracts/core/consent-refusal.ts` | `packages/core/src/contracts/site/consent-refusal.ts` | 12 |  |
| `apps/website/src/contracts/core/credential-store.ts` | `packages/core/src/contracts/site/credential-store.ts` | 9 |  |
| `apps/website/src/contracts/core/custom-credential-categories.ts` | `packages/core/src/contracts/site/custom-credential-categories.ts` | 10 |  |
| `apps/website/src/contracts/core/extension-capability-vocabulary.ts` | `packages/core/src/contracts/site/extension-capability-vocabulary.ts` | 34 | W1 |
| `apps/website/src/contracts/core/fs-folder-recovery.ts` | `packages/core/src/contracts/site/fs-folder-recovery.ts` | 4 |  |
| `apps/website/src/contracts/core/gated-mutations/ports.ts` | `packages/core/src/contracts/site/gated-mutations/ports.ts` | 54 | W2 |
| `apps/website/src/contracts/core/gated-mutations/token.ts` | `packages/core/src/contracts/site/gated-mutations/token.ts` | 147 | W2 |
| `apps/website/src/contracts/core/gated-mutations/watermark.ts` | `packages/core/src/contracts/site/gated-mutations/watermark.ts` | 53 |  |
| `apps/website/src/contracts/core/post-author.ts` | `packages/core/src/contracts/site/post-author.ts` | 8 |  |
| `apps/website/src/contracts/core/public-page-security-headers.ts` | `packages/core/src/contracts/site/public-page-security-headers.ts` | 49 | W1 |
| `apps/website/src/contracts/core/publish-history-list-limit.ts` | `packages/core/src/contracts/site/publish-history-list-limit.ts` | 25 |  |
| `apps/website/src/contracts/core/redirect-tables.ts` | `packages/core/src/contracts/site/redirect-tables.ts` | 8 | W2 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/core" exports["./contracts/site/approval-i18n"]
- "@jini-ai/core" exports["./contracts/site/assistant-content-guidance"]
- "@jini-ai/core" exports["./contracts/site/consent-refusal"]
- "@jini-ai/core" exports["./contracts/site/credential-store"]
- "@jini-ai/core" exports["./contracts/site/custom-credential-categories"]
- "@jini-ai/core" exports["./contracts/site/extension-capability-vocabulary"]
- "@jini-ai/core" exports["./contracts/site/fs-folder-recovery"]
- "@jini-ai/core" exports["./contracts/site/gated-mutations/ports"]
- "@jini-ai/core" exports["./contracts/site/gated-mutations/token"]
- "@jini-ai/core" exports["./contracts/site/post-author"]
- "@jini-ai/core" exports["./contracts/site/public-page-security-headers"]
- "@jini-ai/core" exports["./contracts/site/publish-history-list-limit"]
- "@jini-ai/core" exports["./contracts/site/redirect-tables"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (3, 327 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/contracts/core/gated-mutations/__tests__/unit/token.unit.test.ts`
- `apps/website/src/contracts/core/gated-mutations/__tests__/unit/watermark.unit.test.ts`
- `apps/website/src/contracts/core/__tests__/public-page-security-headers.unit.test.ts`


## T — Tovu repoint: delete the 14 sources, rewrite every importer (103 lines)

```
apps/website/src/assistant/__tests__/approval-schema-labels-i18n.test.ts:4  '../../contracts/core/approval-i18n.js' -> '@jini-ai/core/contracts/site/approval-i18n'
apps/website/src/assistant/__tests__/tool-approval-policy.test.ts:113  '../../contracts/core/approval-i18n.js' -> '@jini-ai/core/contracts/site/approval-i18n'
apps/website/src/assistant/__tests__/tool-approval-policy.test.ts:122  '../../contracts/core/approval-i18n.js' -> '@jini-ai/core/contracts/site/approval-i18n'
apps/website/src/assistant/__tests__/tool-approval-policy.test.ts:129  '../../contracts/core/approval-i18n.js' -> '@jini-ai/core/contracts/site/approval-i18n'
apps/website/src/contracts/core/human-confirm.ts:25  './approval-i18n.js' -> '@jini-ai/core/contracts/site/approval-i18n'
apps/website/src/features/pages/agent-tools.ts:3  '../../contracts/core/assistant-content-guidance.js' -> '@jini-ai/core/contracts/site/assistant-content-guidance'
apps/website/src/features/post/agent-tools.ts:8  '../../contracts/core/assistant-content-guidance.js' -> '@jini-ai/core/contracts/site/assistant-content-guidance'
apps/website/src/server/inbound/assistant/assistant-system-overlay.ts:4  '#src/contracts/core/assistant-content-guidance' -> '@jini-ai/core/contracts/site/assistant-content-guidance'
apps/website/src/server/runtime/composition/modules/assistant-byok.ts:3  '#src/contracts/core/assistant-content-guidance' -> '@jini-ai/core/contracts/site/assistant-content-guidance'
apps/website/src/features/consent/readiness.ts:5  '#src/contracts/core/consent-refusal' -> '@jini-ai/core/contracts/site/consent-refusal'
apps/website/src/features/consent/service.ts:11  '#src/contracts/core/consent-refusal' -> '@jini-ai/core/contracts/site/consent-refusal'
apps/website/src/features/consent/validation.ts:6  '#src/contracts/core/consent-refusal' -> '@jini-ai/core/contracts/site/consent-refusal'
apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts:4  '#src/contracts/core/consent-refusal' -> '@jini-ai/core/contracts/site/consent-refusal'
apps/website/src/features/deployments/static-publish/__tests__/domain-publish-tool.unit.test.ts:18  '#src/contracts/core/consent-refusal' -> '@jini-ai/core/contracts/site/consent-refusal'
apps/website/src/features/deployments/static-publish/publish-consent.ts:1  '#src/contracts/core/consent-refusal' -> '@jini-ai/core/contracts/site/consent-refusal'
apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts:2  '#src/contracts/core/consent-refusal' -> '@jini-ai/core/contracts/site/consent-refusal'
apps/website/src/server/runtime/composition/site-consent.ts:17  '#src/contracts/core/consent-refusal' -> '@jini-ai/core/contracts/site/consent-refusal'
apps/website/src/features/custom-credentials/tovu-credential-sets.ts:1  '#src/contracts/core/credential-store' -> '@jini-ai/core/contracts/site/credential-store'
apps/website/src/features/deployments/publish-credentials/store.ts:5  '#src/contracts/core/credential-store' -> '@jini-ai/core/contracts/site/credential-store'
apps/website/src/features/project-keys/create-vault.ts:1  '../../contracts/core/credential-store.js' -> '@jini-ai/core/contracts/site/credential-store'
apps/website/src/features/source-control/store.ts:1  '#src/contracts/core/credential-store' -> '@jini-ai/core/contracts/site/credential-store'
apps/website/src/features/custom-credentials/__tests__/extract-s8-c1-old-shape.types.test.ts:8  '../../../contracts/core/custom-credential-categories.js' -> '@jini-ai/core/contracts/site/custom-credential-categories'
apps/website/src/features/custom-credentials/credential-save-tool.ts:4  '../../contracts/core/custom-credential-categories.js' -> '@jini-ai/core/contracts/site/custom-credential-categories'
apps/website/src/features/custom-credentials/custom-credential-create-ui.ts:5  '../../contracts/core/custom-credential-categories.js' -> '@jini-ai/core/contracts/site/custom-credential-categories'
apps/website/src/features/custom-credentials/index.ts:6  '../../contracts/core/custom-credential-categories.js' -> '@jini-ai/core/contracts/site/custom-credential-categories'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/custom-credentials/tovu-credential-sets.ts:9  '../../contracts/core/custom-credential-categories.js' -> '@jini-ai/core/contracts/site/custom-credential-categories'
apps/website/src/features/custom-credentials/types.ts:13  '#src/contracts/core/custom-credential-categories' -> '@jini-ai/core/contracts/site/custom-credential-categories'
apps/website/src/features/custom-credentials/types.ts:14  '#src/contracts/core/custom-credential-categories' -> '@jini-ai/core/contracts/site/custom-credential-categories'
apps/website/src/features/custom-credentials/vault-repo.ts:3  '../../contracts/core/custom-credential-categories.js' -> '@jini-ai/core/contracts/site/custom-credential-categories'
apps/website/src/platform/secrets/__tests__/vault-kinds.unit.test.ts:13  '../../../contracts/core/custom-credential-categories.js' -> '@jini-ai/core/contracts/site/custom-credential-categories'
apps/website/src/platform/secrets/vault-meta-rules.ts:9  '#src/contracts/core/custom-credential-categories' -> '@jini-ai/core/contracts/site/custom-credential-categories'
apps/website/src/contracts/core/__tests__/unit/extension-capability-vocabulary.unit.test.ts:7  '../../extension-capability-vocabulary.js' -> '@jini-ai/core/contracts/site/extension-capability-vocabulary'
apps/website/src/features/plugin-runtime/host-binding.ts:10  '../../contracts/core/extension-capability-vocabulary.js' -> '@jini-ai/core/contracts/site/extension-capability-vocabulary'
apps/website/src/contracts/core/__tests__/shared-constants.unit.test.ts:5  '#src/contracts/core/fs-folder-recovery' -> '@jini-ai/core/contracts/site/fs-folder-recovery'
apps/website/src/features/fs-files/site-file-request.ts:5  '#src/contracts/core/fs-folder-recovery' -> '@jini-ai/core/contracts/site/fs-folder-recovery'
apps/website/src/features/media-import/agent-tools.ts:4  '#src/contracts/core/fs-folder-recovery' -> '@jini-ai/core/contracts/site/fs-folder-recovery'
apps/website/src/contracts/core/gated-mutations/__tests__/unit/gateway.unit.test.ts:13  '../../ports.js' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/contracts/core/gated-mutations/composition.ts:8  './ports.js' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/contracts/core/gated-mutations/gateway.ts:103  './ports.js' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/database/repo.memory.ts:5  '../../contracts/core/gated-mutations/ports.js' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/database/tool-registrations.ts:38  '../../contracts/core/gated-mutations/ports.js' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts:12  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/database-transfer/tool-registrations.ts:13  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/recovery/tool-registrations.ts:30  '../../contracts/core/gated-mutations/ports.js' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/site-backup/__tests__/share-snapshot-location.integration.test.ts:11  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/site-backup/__tests__/sources.unit.test.ts:11  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/site-backup/__tests__/tool-registrations-host-connection.unit.test.ts:17  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/site-backup/__tests__/tool-registrations.unit.test.ts:12  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/site-backup/backup-service.ts:12  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/site-backup/share-preparation-steps.ts:6  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/site-backup/share-preparation.ts:5  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/features/site-backup/sources.ts:9  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/platform/db/__tests__/watermark-kernel.dialects.test.ts:10  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/platform/db/postgres/db-ops-adapter.ts:1  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/platform/db/sqlite/db-ops.ts:3  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/platform/db/watermark-kernel.ts:1  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/server/inbound/admin-http/dev-auth.ts:27  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/server/routes/types.ts:99  '../../contracts/core/gated-mutations/ports.js' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/server/runtime/composition/store-bound-contracts.ts:1  '#src/contracts/core/gated-mutations/ports' -> '@jini-ai/core/contracts/site/gated-mutations/ports'
apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts:9  '../../contracts/core/gated-mutations/token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/contracts/core/gated-mutations/__tests__/unit/gateway.unit.test.ts:12  '../../token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/contracts/core/gated-mutations/composition.ts:6  './token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/contracts/core/gated-mutations/composition.ts:7  './token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/contracts/core/gated-mutations/gateway.ts:105  './token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/features/deployments/static-publish/__tests__/domain-publish-tool.unit.test.ts:21  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/features/deployments/static-publish/domain-publish-tool.ts:7  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/features/publish-content/__tests__/execute-pull-tool.test.ts:4  '../../../contracts/core/gated-mutations/token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/features/publish-content/__tests__/gated-hooks.baseline-principal.test.ts:29  '../../../contracts/core/gated-mutations/token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts:44  '../../../contracts/core/gated-mutations/token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/features/publish-content/__tests__/pull-tool-fixture.ts:5  '../../../contracts/core/gated-mutations/token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/features/recovery/__tests__/unit/gated-hooks.unit.test.ts:5  '../../../../contracts/core/gated-mutations/token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts:9  '../../../../contracts/core/gated-mutations/token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts:23  '../../../contracts/core/gated-mutations/token.js' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/platform/db/repos/__tests__/gated-mutation-token-repo.test.ts:8  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/platform/db/repos/__tests__/token-store.characterization.test.ts:6  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/platform/db/sqlite/__tests__/gated-mutation-token-binding.test.ts:4  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts:7  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/platform/db/sqlite/gated-mutation-token-repo.sqlite.ts:2  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/server/inbound/admin-http/__tests__/credential-provenance.unit.test.ts:5  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/server/inbound/admin-http/__tests__/credential-provenance.unit.test.ts:6  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/server/inbound/admin-http/routes/database/__tests__/migrate-forward-errors.test.ts:8  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts:6  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts:18  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/server/inbound/admin-http/routes/publish-content/import-errors.ts:4  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts:5  '#src/contracts/core/gated-mutations/token' -> '@jini-ai/core/contracts/site/gated-mutations/token'
apps/website/src/features/theme/static-render-content.ts:2  '../../contracts/core/post-author.js' -> '@jini-ai/core/contracts/site/post-author'
apps/website/src/server/inbound/public-http/http/shared/post.ts:2  '#src/contracts/core/post-author' -> '@jini-ai/core/contracts/site/post-author'
apps/website/src/server/inbound/public-http/http/site/render/post-body.ts:10  '#src/contracts/core/post-author' -> '@jini-ai/core/contracts/site/post-author'
apps/website/src/server/inbound/public-http/http/site/render/template-render-data.ts:5  '#src/contracts/core/post-author' -> '@jini-ai/core/contracts/site/post-author'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/post-previews.ts:18  '#src/contracts/core/post-author' -> '@jini-ai/core/contracts/site/post-author'
apps/website/src/contracts/core/__tests__/unit/form-provider-security-headers.contract.test.ts:5  '../../public-page-security-headers.js' -> '@jini-ai/core/contracts/site/public-page-security-headers'
apps/website/src/contracts/core/__tests__/unit/public-theme-resource-policy.contract.test.ts:4  '../../public-page-security-headers.js' -> '@jini-ai/core/contracts/site/public-page-security-headers'
apps/website/src/features/theme/font-links.ts:3  '../../contracts/core/public-page-security-headers.js' -> '@jini-ai/core/contracts/site/public-page-security-headers'
apps/website/src/features/theme/public-page-security-headers.ts:2  '../../contracts/core/public-page-security-headers.js' -> '@jini-ai/core/contracts/site/public-page-security-headers'
apps/website/src/features/theme/public-theme-resources.ts:4  '../../contracts/core/public-page-security-headers.js' -> '@jini-ai/core/contracts/site/public-page-security-headers'
apps/website/src/features/deployments/static-publish/__tests__/publish-history.unit.test.ts:12  '#src/contracts/core/publish-history-list-limit' -> '@jini-ai/core/contracts/site/publish-history-list-limit'
apps/website/src/features/deployments/static-publish/publish-history.ts:4  '#src/contracts/core/publish-history-list-limit' -> '@jini-ai/core/contracts/site/publish-history-list-limit'
apps/website/src/platform/db/repos/publish-history-repo.ts:11  '#src/contracts/core/publish-history-list-limit' -> '@jini-ai/core/contracts/site/publish-history-list-limit'
apps/website/src/contracts/core/__tests__/shared-constants.unit.test.ts:4  '#src/contracts/core/redirect-tables' -> '@jini-ai/core/contracts/site/redirect-tables'
apps/website/src/features/redirects/__tests__/index.test.ts:11  '#src/contracts/core/redirect-tables' -> '@jini-ai/core/contracts/site/redirect-tables'
apps/website/src/features/redirects/publish-content.ts:10  '#src/contracts/core/redirect-tables' -> '@jini-ai/core/contracts/site/redirect-tables'
apps/website/src/features/redirects/repo.sqlite.ts:4  '#src/contracts/core/redirect-tables' -> '@jini-ai/core/contracts/site/redirect-tables'
apps/website/src/features/trash/adapters/redirect.ts:13  '#src/contracts/core/redirect-tables' -> '@jini-ai/core/contracts/site/redirect-tables'
```

## Tovu tests that must stay green (34; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/approval-schema-labels-i18n.test.ts`
- `apps/website/src/assistant/__tests__/tool-approval-policy.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts`
- `apps/website/src/contracts/core/__tests__/shared-constants.unit.test.ts`
- `apps/website/src/contracts/core/__tests__/unit/extension-capability-vocabulary.unit.test.ts`
- `apps/website/src/contracts/core/__tests__/unit/form-provider-security-headers.contract.test.ts`
- `apps/website/src/contracts/core/__tests__/unit/public-theme-resource-policy.contract.test.ts`
- `apps/website/src/contracts/core/gated-mutations/__tests__/unit/gateway.unit.test.ts`
- `apps/website/src/features/custom-credentials/__tests__/extract-s8-c1-old-shape.types.test.ts`
- `apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts`
- `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts`
- `apps/website/src/features/deployments/static-publish/__tests__/domain-publish-tool.unit.test.ts`
- `apps/website/src/features/deployments/static-publish/__tests__/publish-history.unit.test.ts`
- `apps/website/src/features/publish-content/__tests__/execute-pull-tool.test.ts`
- `apps/website/src/features/publish-content/__tests__/gated-hooks.baseline-principal.test.ts`
- `apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts`
- `apps/website/src/features/publish-content/__tests__/pull-tool-fixture.ts`
- `apps/website/src/features/recovery/__tests__/unit/gated-hooks.unit.test.ts`
- `apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts`
- `apps/website/src/features/redirects/__tests__/index.test.ts`
- `apps/website/src/features/site-backup/__tests__/share-snapshot-location.integration.test.ts`
- `apps/website/src/features/site-backup/__tests__/sources.unit.test.ts`
- `apps/website/src/features/site-backup/__tests__/tool-registrations-host-connection.unit.test.ts`
- `apps/website/src/features/site-backup/__tests__/tool-registrations.unit.test.ts`
- `apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts`
- `apps/website/src/platform/db/__tests__/watermark-kernel.dialects.test.ts`
- `apps/website/src/platform/db/repos/__tests__/gated-mutation-token-repo.test.ts`
- `apps/website/src/platform/db/repos/__tests__/token-store.characterization.test.ts`
- `apps/website/src/platform/db/sqlite/__tests__/gated-mutation-token-binding.test.ts`
- `apps/website/src/platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts`
- `apps/website/src/platform/secrets/__tests__/vault-kinds.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/__tests__/credential-provenance.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/database/__tests__/migrate-forward-errors.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/contracts/core/extension-capability-vocabulary.ts` (1)
- `apps/website/src/contracts/core/gated-mutations/ports.ts` (2)
- `apps/website/src/contracts/core/gated-mutations/token.ts` (2)
- `apps/website/src/contracts/core/public-page-security-headers.ts` (1)
- `apps/website/src/contracts/core/redirect-tables.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/contracts/core/custom-credential-categories.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `token.ts`, negate the first `if (` condition of its first exported function; `token.unit.test.ts` must go red, then revert
