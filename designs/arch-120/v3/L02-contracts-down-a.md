# L02 — contracts-down A: settings / credentials / secrets (15 edges, D)

Every moved declaration's own imports were checked on the tip: only `@jini-ai/*`, `node:*` or
`contracts/` — the precondition for `contracts/core` (`contracts/INFO.md`; rule
`contracts-no-server-or-app-imports` stays satisfied).

| moved symbol(s) | from | to | edges removed |
|---|---|---|---|
| `resolveOperatorLocale` (whole file) | `features/settings/operator-locale.ts` (imports `@jini-ai/core/settings`, `contracts/headless`) | `contracts/core/operator-locale.ts` | 7 |
| `ProjectKeyCreateConflictError` (class only; `projectKeyCreateVault` stays) | `features/project-keys/create-vault.ts:6` (imports `ToolInputError` from `@jini-ai/core`) | `contracts/core/credential-store.ts` | 3 |
| `scanTextForSecrets`, `SecretScanHit` | `features/webhooks/secret-scan-guard.ts:172,184` (uses `SECRET_PATTERNS` from `@jini-ai/diagnostics`) | `contracts/core/secret-scan.ts`; `secret-scan-guard.ts` imports it back (the CLI `check:secret-scan` keeps working) | 2 |
| `MailTestModeSetting` (pure union type) | `features/settings/mail-provider.ts:24` | `contracts/core/settings-vocabulary.ts` | 2 |
| `PUBLISHABLE_SETTINGS` (whole file) | `features/settings/contracts.ts` | `contracts/core/settings-vocabulary.ts`; delete `settings/contracts.ts`; remove `"contracts"` from `features/settings`' entry list in `.dependency-cruiser.mjs:692` only if no file remains (keeps the door list truthful, not a waiver) | 1 |

**Repoint, no forwarder:** remove the `settings/index.ts:161` export of `resolveOperatorLocale`,
and every other re-export of a moved symbol; repoint *every* import in the inventory below,
including tests (`features/agent-plugins/__tests__/unit/operator-locale.unit.test.ts`,
`.../integration/agent-plugin-uninstall-tool.integration.test.ts`) and composition
(`server/runtime/composition/agent-plugin-service-ports.ts:14`, `server/routes/types.ts:445`,
`server/runtime/boot/mail-delivery-policy.ts:10`). `git mv` the file for `operator-locale.ts` so
history follows. File stays ≤500 lines; no function changes.

**Characterization (named risks):**
- *Locale fallback changes during the move* → existing `operator-locale.unit.test.ts` (English on
  missing repo / failed read) moves next to the file: `contracts/core/__tests__/operator-locale.unit.test.ts`.
- *Duplicate-label mapping breaks* (the `instanceof` check in three stores must see the same class)
  → `features/deployments/publish-credentials/__tests__` and `features/source-control/__tests__`
  duplicate-label cases; add one assertion per store that a conflict from `projectKeyCreateVault`
  maps to that store's `…DuplicateLabelError` (fails if two class copies exist).
- *Secret backstop misses a secret* → existing `features/webhooks/__tests__/secret-scan-guard*.test.ts` and
  `features/publish-content/__tests__/*backstop*.test.ts`, `*file-tree-policy*.test.ts`.

**Gates:** shared gate, `LANE=L02`, `SUITES` = the test files named above (rg `-l` them at run time; STOP if any listed path is missing).

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L02.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L02`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `custom-credentials/tool-registrations.ts` -> `settings/index.ts` [D] resolveOperatorLocale -> contracts/core/operator-locale.ts
- `database-transfer/tool-registrations.ts` -> `settings/index.ts` [D] resolveOperatorLocale -> contracts/core/operator-locale.ts
- `deployments/deploy-ops/typed-secret-card.ts` -> `settings/index.ts` [D] resolveOperatorLocale -> contracts/core/operator-locale.ts
- `deployments/publish-agent-tools.ts` -> `settings/index.ts` [D] resolveOperatorLocale -> contracts/core/operator-locale.ts
- `external-mcp/tool-registrations.ts` -> `settings/index.ts` [D] resolveOperatorLocale -> contracts/core/operator-locale.ts
- `media-generation/providers-tools.ts` -> `settings/index.ts` [D] resolveOperatorLocale -> contracts/core/operator-locale.ts
- `source-control/credential-setup.ts` -> `settings/index.ts` [D] resolveOperatorLocale -> contracts/core/operator-locale.ts
- `custom-credentials/tovu-credential-sets.ts` -> `project-keys/create-vault.ts` [D] ProjectKeyCreateConflictError -> contracts/core/credential-store.ts
- `deployments/publish-credentials/store.ts` -> `project-keys/create-vault.ts` [D] ProjectKeyCreateConflictError -> contracts/core/credential-store.ts
- `source-control/store.ts` -> `project-keys/create-vault.ts` [D] ProjectKeyCreateConflictError -> contracts/core/credential-store.ts
- `publish-content/backstop-policy.ts` -> `webhooks/index.ts` [D] scanTextForSecrets,SecretScanHit -> contracts/core/secret-scan.ts
- `publish-content/file-tree-policy.ts` -> `webhooks/index.ts` [D] scanTextForSecrets,SecretScanHit -> contracts/core/secret-scan.ts
- `mail-status/test-send.ts` -> `settings/index.ts` [D] MailTestModeSetting -> contracts/core/settings-vocabulary.ts
- `mail/attempts.repo.ts` -> `settings/index.ts` [D] MailTestModeSetting -> contracts/core/settings-vocabulary.ts
- `site-backup/share-database/repo.sqlite.ts` -> `settings/contracts.ts` [D] PUBLISHABLE_SETTINGS -> contracts/core/settings-vocabulary.ts (settings/contracts.ts deleted)

#### Every import/re-export of a moved or redirected symbol — repoint each; delete each re-export (no forwarder)
- `MailTestModeSetting`:
    - `features/mail-status/__tests__/test-send.test.ts:202` import()-type from `features/settings/mail-provider.ts`
    - `features/mail-status/test-send.ts:16` import from `features/settings/index.ts`
    - `features/mail/__tests__/attempts-retention.dialects.test.ts:12` import from `features/settings/mail-provider.ts`
    - `features/mail/attempts.repo.ts:8` import from `features/settings/index.ts`
    - `features/settings/index.ts:156` reexport from `features/settings/mail-provider.ts`
    - `server/routes/types.ts:445` import()-type from `features/settings/mail-provider.ts`
    - `server/runtime/boot/__tests__/mail-delivery-policy.unit.test.ts:6` import from `features/settings/mail-provider.ts`
    - `server/runtime/boot/__tests__/mail-engine-parity.unit.test.ts:10` import from `features/settings/mail-provider.ts`
    - `server/runtime/boot/mail-delivery-policy.ts:10` import from `features/settings/index.ts`
- `PUBLISHABLE_SETTINGS`:
    - `features/settings/publish-content.ts:1` import from `features/settings/contracts.ts`
    - `features/settings/publish-content.ts:2` reexport from `features/settings/contracts.ts`
    - `features/site-backup/share-database/repo.sqlite.ts:13` import from `features/settings/contracts.ts`
- `ProjectKeyCreateConflictError`:
    - `features/custom-credentials/tovu-credential-sets.ts:1` import from `features/project-keys/create-vault.ts`
    - `features/deployments/publish-credentials/store.ts:5` import from `features/project-keys/create-vault.ts`
    - `features/source-control/store.ts:1` import from `features/project-keys/create-vault.ts`
- `SecretScanHit`:
- `resolveOperatorLocale`:
    - `features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool.integration.test.ts:20` import from `features/settings/index.ts`
    - `features/agent-plugins/__tests__/unit/operator-locale.unit.test.ts:6` import from `features/settings/index.ts`
    - `features/custom-credentials/tool-registrations.ts:15` import from `features/settings/index.ts`
    - `features/database-transfer/tool-registrations.ts:4` import from `features/settings/index.ts`
    - `features/deployments/deploy-ops/typed-secret-card.ts:3` import from `features/settings/index.ts`
    - `features/deployments/publish-agent-tools.ts:22` import from `features/settings/index.ts`
    - `features/external-mcp/tool-registrations.ts:7` import from `features/settings/index.ts`
    - `features/media-generation/providers-tools.ts:6` import from `features/settings/index.ts`
    - `features/settings/index.ts:161` reexport from `features/settings/operator-locale.ts`
    - `features/source-control/credential-setup.ts:8` import from `features/settings/index.ts`
    - `server/runtime/composition/agent-plugin-service-ports.ts:14` import from `features/settings/index.ts`
- `scanTextForSecrets`:
    - `features/publish-content/backstop-policy.ts:2` import from `features/webhooks/index.ts`
    - `features/publish-content/file-tree-policy.ts:2` import from `features/webhooks/index.ts`
    - `features/webhooks/__tests__/secret-scan-guard.test.ts:8` import from `features/webhooks/secret-scan-guard.ts`
    - `features/webhooks/index.ts:93` reexport from `features/webhooks/secret-scan-guard.ts`

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/custom-credentials/tool-registrations.ts`
    - prod: assistant/tool-registrations.ts, server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/moved-tools.credential-cards.golden.test.ts, assistant/__tests__/read-only-tool-constraint.composition.test.ts, assistant/__tests__/tool-registrations.custom-credentials-egress-refusal.integration.test.ts, features/custom-credentials/__tests__/create-agent-tool.unit.test.ts, features/custom-credentials/__tests__/credential-save-probe.test.ts, features/custom-credentials/__tests__/extract-s8-c2p2-host-inputs.test.ts, features/custom-credentials/__tests__/extract-s8-c2p2-pins.support.ts, features/custom-credentials/__tests__/extract-s8-c2p2c-ports.test.ts, features/custom-credentials/__tests__/extract-s8-x-host-operations.test.ts, features/custom-credentials/__tests__/extract-s9-tools-public.test.ts, features/custom-credentials/__tests__/form-save-errors.model-facing.test.ts, features/custom-credentials/__tests__/list-agent-tool.unit.test.ts, features/custom-credentials/__tests__/make-request-delete-confirmation.test.ts, features/custom-credentials/__tests__/set-token-agent-tool.unit.test.ts, features/custom-credentials/__tests__/set-username-agent-tool.unit.test.ts, features/custom-credentials/__tests__/tool-registrations.model-facing-errors.test.ts, features/custom-credentials/__tests__/write-files-confirmation.test.ts, features/custom-credentials/__tests__/write-files-network-failure.model-facing.test.ts, server/runtime/boot/__tests__/mail-credential-cards.unit.test.ts
- `features/custom-credentials/tovu-credential-sets.ts`
    - prod: features/custom-credentials/store.ts, features/custom-credentials/vault-repo.ts
    - tests: 
- `features/database-transfer/tool-registrations.ts`
    - prod: server/runtime/composition/database-transfer-adapters.ts, server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/tool-registrations.contracts.test.ts, features/database-transfer/__tests__/confirmation-policy.unit.test.ts, features/database-transfer/__tests__/tool-registrations.faults.unit.test.ts, features/database-transfer/__tests__/tool-registrations.postgres.test.ts, features/database-transfer/__tests__/transfer-snapshots.unit.test.ts, features/database/__tests__/db-tool-descriptors.snapshot.unit.test.ts
- `features/deployments/deploy-ops/typed-secret-card.ts`
    - prod: features/deployments/deploy-ops/tool-registrations.ts
    - tests: features/deployments/deploy-ops/__tests__/typed-secret-card.test.ts
- `features/deployments/publish-agent-tools.ts`
    - prod: assistant/tool-registrations.ts, features/permanent-delete/tool-registrations.ts, server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/confirmation-copy.unit.test.ts, assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts, assistant/__tests__/moved-tools.credential-cards.golden.test.ts, assistant/__tests__/tool-registrations.contracts.test.ts, features/deployments/__tests__/publish-agent-tools.abort-guard.unit.test.ts, features/deployments/__tests__/publish-agent-tools.unit.test.ts, features/deployments/static-publish/__tests__/domain-publish-tool.unit.test.ts, server/__tests__/routes/publish-site-route.test.ts
- `features/deployments/publish-credentials/store.ts`
    - prod: features/deployments/publish-agent-tools.ts, features/deployments/publish-credentials/compatibility-port.ts, features/deployments/publish-credentials/index.ts, features/deployments/static-publish/credentials.ts, features/deployments/static-publish/verify.ts
    - tests: features/credential-safety/__tests__/stores.test.ts, features/deployments/__tests__/publish-agent-tools.unit.test.ts, features/deployments/publish-credentials/__tests__/credential-works-for.unit.test.ts, features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts, features/deployments/publish-credentials/__tests__/store.unit.test.ts, features/deployments/static-publish/__tests__/credentials.unit.test.ts, features/deployments/static-publish/__tests__/publish-run.unit.test.ts, features/deployments/static-publish/__tests__/verify.unit.test.ts
- `features/external-mcp/tool-registrations.ts`
    - prod: server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/mcp-ui-tool-calls-route.external-mcp-save.integration.test.ts, assistant/__tests__/tool-registrations.external-mcp.test.ts, features/credential-safety/__tests__/probes-and-cards.test.ts, features/external-mcp/__tests__/access-save.integration.test.ts, features/external-mcp/__tests__/unit/operations-tools.unit.test.ts, features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts, features/external-mcp/__tests__/unit/tool-registrations.oauth-origin.unit.test.ts
- `features/mail-status/test-send.ts`
    - prod: features/mail-status/tool-registrations.ts, server/inbound/admin-http/routes/system/mail-test-send.ts, server/routes/types.ts, server/runtime/composition/site-mailer.ts
    - tests: features/mail-status/__tests__/test-send.test.ts, server/inbound/admin-http/routes/system/__tests__/mail-dns-and-test-send.unit.test.ts, server/runtime/composition/__tests__/site-mailer.unit.test.ts
- `features/mail/attempts.repo.ts`
    - prod: server/runtime/boot/mail-delivery-policy.ts, server/runtime/composition/deps.ts
    - tests: features/mail/__tests__/activity.repo.dialects.test.ts, features/mail/__tests__/attempts-retention.dialects.test.ts
- `features/media-generation/providers-tools.ts`
    - prod: server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/tool-registrations.contracts.test.ts, features/media-generation/__tests__/providers-tools.test.ts
- `features/publish-content/backstop-policy.ts`
    - prod: features/publish-content/backstop-preview.ts, features/publish-content/backstop-service.ts, features/publish-content/publish-backstop-file.ts, features/publish-content/publish-backstop-row.sqlite.ts, features/publish-content/raw-file-contributor.ts, features/publish-content/raw-row-contributor.ts, server/inbound/admin-http/routes/publish-content/backstop.ts
    - tests: features/publish-content/__tests__/backstop-audit.sqlite.test.ts, features/publish-content/__tests__/backstop-policy.boundary.test.ts, features/publish-content/__tests__/backstop-policy.private-tables.unit.test.ts, features/publish-content/__tests__/backstop.l061.test.ts, features/publish-content/__tests__/file-tree-policy.backup-suffix.unit.test.ts, features/publish-content/__tests__/raw-file-contributor.test.ts, features/publish-content/__tests__/raw-row-contributor.test.ts, features/site-backup/__tests__/share-catalog-private.integration.test.ts, platform/site-dir/__tests__/integration/publish-backstop-file.integration.test.ts, server/inbound/admin-http/routes/publish-content/__tests__/backstop-errors.unit.test.ts
- `features/publish-content/file-tree-policy.ts`
    - prod: features/publish-content/backstop-policy.ts, features/publish-content/publish-backstop-file.ts, features/publish-content/raw-file-contributor.ts, features/site-backup/share-file-policy.ts, features/theme/publish-content.ts
    - tests: features/media/__tests__/library-publish-transport.test.ts, features/publish-content/__tests__/file-tree-policy.backup-suffix.unit.test.ts, features/publish-content/__tests__/file-tree-policy.boundary.test.ts, features/publish-content/__tests__/file-tree-policy.l044.test.ts, features/theme/__tests__/publish-content.pack.test.ts, platform/site-dir/__tests__/integration/migration-backup-exclusion.integration.test.ts, platform/site-dir/__tests__/integration/storage-secret-exclusion.integration.test.ts
- `features/site-backup/share-database/repo.sqlite.ts`
    - prod: server/runtime/composition/import-database/repo.sqlite.ts, server/runtime/composition/site-portability.ts
    - tests: features/site-backup/__tests__/integration/share-database-blobs.integration.test.ts, platform/db/sqlite/__tests__/share-database.integration.test.ts
- `features/source-control/credential-setup.ts`
    - prod: features/source-control/tool-registrations.ts
    - tests: features/source-control/__tests__/credential-setup-projections.unit.test.ts, features/source-control/__tests__/propose-credential-tool.test.ts
- `features/source-control/store.ts`
    - prod: features/source-control/commit-site.ts, features/source-control/credential-setup.ts, features/source-control/index.ts, features/source-control/tool-registrations.ts
    - tests: features/credential-safety/__tests__/stores.test.ts, features/site-backup/__tests__/tool-registrations-host-connection.unit.test.ts, features/site-backup/__tests__/tool-registrations.unit.test.ts, features/source-control/__tests__/account-probe.guarded.unit.test.ts, features/source-control/__tests__/commit-site.unit.test.ts, features/source-control/__tests__/credential-setup-projections.unit.test.ts, features/source-control/__tests__/gates.characterization.unit.test.ts, features/source-control/__tests__/project-scope.unit.test.ts, features/source-control/__tests__/propose-credential-tool.test.ts, features/source-control/__tests__/shared-key-reader.unit.test.ts, features/source-control/__tests__/store.resolve.unit.test.ts, features/source-control/__tests__/store.unit.test.ts, features/source-control/__tests__/tool-registrations.dry-run.test.ts, features/source-control/__tests__/tool-registrations.unit.test.ts, server/inbound/admin-http/routes/system/__tests__/source-control-credentials.unit.test.ts
