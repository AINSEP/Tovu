# jy-pay refresh and combine handoff
All assigned sheets completed. No STOP. Verification commands were prohibited by the dispatch and were not run. No commits or staging performed.
## Deferred owners and scoped skips
- K1-T owns `packages/plugin-catalog/__tests__/catalog.test.ts`, `packages/agent-plugins/src/lifecycle/__tests__/unit/plugin-identity.unit.test.ts`, and `packages/plugins/src/host/__tests__/unit/plugin-identity.unit.test.ts`; all untouched.
- Other K2/K3 trees, provider manifests, plugin catalog generation, root scripts, API baselines, and every CHANGELOG were untouched. K1 did not edit the separately owned lifecycle `manifest-namespace` test or host plugin-format test.
- K9 found two references outside the renamed plugin folders: `packages/agent-plugins/scripts/__tests__/build-cloudflare.test.mjs:14` and `packages/agent-plugins/wordpress/__tests__/bundled-package.test.mjs:33`. Both were left unchanged; the first needs the renamed deployment descriptor path and the second is an old-name negative assertion. Coordinate their owners.
- `packages/agent-plugins/src/folder-customization.test.ts` had 11 published-id literal occurrences repointed by K1; its legacy host-key fixtures and semantics were left intact. Coordinate any later K3 fixture changes.
- OPUS-CLOUD must regenerate `packages/plugin-catalog/catalog.json` and API baselines, then run combined verification. Catalog still records the deleted deployment file and old ids/paths/digests by instruction.
- Existing stored credentials, worker deployments, D1 submissions, spreadsheet columns and storage manifests require the owner-approved follow-up in COMMIT-PLAN.md; no compatibility readers or aliases were added.
## Additional test/fixture reference repoints
- `packages/agent-plugins/cloudflare/form-destinations/__tests__/cloudflare-d1.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/admin-surfaces.pin.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/connection-panel.frame.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/destination-panel.frame.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/existing-files.pin.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/frame-harness.mjs`
- `packages/agent-plugins/google-workspace/__tests__/product-gating.security.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/sheets-admin.security.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/sheets-tools.security.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/sheets.contract.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/skill-content.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/surface-harness.mjs`
- `packages/agent-plugins/google-workspace/__tests__/surfaces.security.test.mjs`
- `packages/agent-plugins/resend/__tests__/resend.test.mjs`

## Residue counts from the authorized id grep
Counts below are matching lines, including regexes and non-id paths; they are not claims of remaining published ids. No broader residue scan was run.
| File | Matching lines |
| --- | ---: |
| `packages/agent-plugins/google-workspace/__tests__/skill-content.test.mjs` | 2 |
| `packages/agent-plugins/software-engineering/__tests__/bundled-package.test.mjs` | 1 |
| `packages/agent-plugins/src/lifecycle/__tests__/unit/manifest-namespace.unit.test.ts` | 2 |
| `packages/agent-plugins/src/lifecycle/__tests__/unit/plugin-identity.unit.test.ts` | 24 |
| `packages/agent-runtime/src/defs/__tests__/claude-filesystem-policy.test.ts` | 2 |
| `packages/agent-runtime/src/defs/__tests__/native-tool-policy.test.ts` | 2 |
| `packages/chat/src/server/durable-runs/__tests__/recover.test.ts` | 1 |
| `packages/mcp/src/federation/hosted/__tests__/second-host-store.test.ts` | 1 |
| `packages/plugin-catalog/__tests__/catalog.test.ts` | 4 |
| `packages/plugin-catalog/catalog.json` | 26 |
| `packages/plugins/CHANGELOG.md` | 1 |
| `packages/plugins/src/host/__tests__/unit/plugin-format.pins.unit.test.ts` | 1 |
| `packages/plugins/src/host/__tests__/unit/plugin-identity.unit.test.ts` | 10 |
| `packages/plugins/src/host/plugin-format.ts` | 1 |
| `packages/provider-plugins/CHANGELOG.md` | 1 |
| `packages/provider-plugins/src/charts-recharts/jini.plugin.json` | 1 |

Other scoped residue observed: 6 share-suffix references in the named S3/Vercel source/tests (outside K1–K9 renames); 1 historical MCP-key note in Resend NOTES; 2 out-of-folder contribution-filename test lines above. Existing test provenance/product-rejection regexes are unchanged.
## Files already over 500 lines
- `packages/agent-plugins/cloudflare/jini-deploy-targets.json`: 630 lines (already over 500 at base).
- `packages/agent-plugins/github-pages/targets/github-pages.mjs`: 543 lines (already over 500 at base).
- `packages/agent-plugins/google-workspace/__tests__/sheets.contract.test.mjs`: 790 lines (already over 500 at base).
- `packages/agent-plugins/google-workspace/jini-agent-tools.json`: 1178 lines (already over 500 at base).
- `packages/agent-plugins/s3-compatible/__tests__/s3-compatible.test.mjs`: 1347 lines (already over 500 at base).
- `packages/agent-plugins/s3-compatible/targets/s3-compatible.mjs`: 1054 lines (already over 500 at base).
- `packages/agent-plugins/vercel/targets/vercel.mjs`: 644 lines (already over 500 at base).
- `packages/chat/src/core/assistant-client/transport.ts`: 1018 lines (already over 500 at base).

## Per-sheet file inventory

### K1
- `packages/agent-plugins/README.md`
- `packages/agent-plugins/calendly/plugin.json`
- `packages/agent-plugins/cloudflare/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/cloudflare/plugin.json`
- `packages/agent-plugins/composio/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/composio/plugin.json`
- `packages/agent-plugins/fly/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/fly/plugin.json`
- `packages/agent-plugins/github-pages/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/github-pages/plugin.json`
- `packages/agent-plugins/github/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/github/plugin.json`
- `packages/agent-plugins/google-login/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/google-login/plugin.json`
- `packages/agent-plugins/google-workspace/__tests__/skill-content.test.mjs`
- `packages/agent-plugins/google-workspace/plugin.json`
- `packages/agent-plugins/higgsfield-media/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/higgsfield-media/plugin.json`
- `packages/agent-plugins/jev/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/jev/plugin.json`
- `packages/agent-plugins/meilisearch/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/meilisearch/plugin.json`
- `packages/agent-plugins/netlify/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/netlify/plugin.json`
- `packages/agent-plugins/opentelemetry/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/opentelemetry/plugin.json`
- `packages/agent-plugins/posthog/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/posthog/plugin.json`
- `packages/agent-plugins/railway/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/railway/plugin.json`
- `packages/agent-plugins/render/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/render/plugin.json`
- `packages/agent-plugins/resend/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/resend/plugin.json`
- `packages/agent-plugins/s3-compatible/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/s3-compatible/plugin.json`
- `packages/agent-plugins/sentry/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/sentry/plugin.json`
- `packages/agent-plugins/shopify/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/shopify/plugin.json`
- `packages/agent-plugins/site-compliance/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/site-compliance/plugin.json`
- `packages/agent-plugins/site-import/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/site-import/plugin.json`
- `packages/agent-plugins/src/folder-customization.test.ts`
- `packages/agent-plugins/supabase/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/supabase/plugin.json`
- `packages/agent-plugins/vercel/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/vercel/plugin.json`
- `packages/agent-plugins/wordpress/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/wordpress/plugin.json`

### K4
- `packages/agent-plugins/cloudflare/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/cloudflare/lib/__tests__/forms-edges.test.mjs`
- `packages/agent-plugins/cloudflare/lib/__tests__/forms.test.mjs`
- `packages/agent-plugins/cloudflare/lib/forms.mjs`
- `packages/agent-plugins/cloudflare/lib/target.mjs`
- `packages/agent-plugins/cloudflare/targets/__tests__/forms-publish.test.mjs`
- `packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver-edges.test.mjs`
- `packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver.test.mjs`
- `packages/agent-plugins/cloudflare/worker/__tests__/forms-urgent.test.mjs`
- `packages/agent-plugins/cloudflare/worker/__tests__/forms-validation-parity.test.mjs`
- `packages/agent-plugins/cloudflare/worker/forms-receiver.mjs`

### K5
- `packages/agent-plugins/github/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/github/source-control/commit-site.mjs`
- `packages/agent-plugins/s3-compatible/__tests__/s3-compatible.test.mjs`
- `packages/agent-plugins/s3-compatible/__tests__/target-edges.test.mjs`
- `packages/agent-plugins/s3-compatible/targets/s3-compatible.mjs`

### K6
- `packages/agent-plugins/google-workspace/__tests__/fake-sheets-grid.mjs`
- `packages/agent-plugins/google-workspace/__tests__/form-delivery.contract.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/runtime-neutral.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/skill-content.test.mjs`
- `packages/agent-plugins/google-workspace/form-destinations/README.md`
- `packages/agent-plugins/google-workspace/form-destinations/dedupe.mjs`
- `packages/agent-plugins/google-workspace/form-destinations/mapping.mjs`
- `packages/agent-plugins/google-workspace/form-destinations/sheets.mjs`

### K7
- `packages/agent-plugins/fly/plugin.json`
- `packages/agent-plugins/google-workspace/README.md`
- `packages/agent-plugins/google-workspace/__tests__/runtime-neutral.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/skill-content.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/surfaces.contract.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/surfaces.security.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/surfaces.vertical-slice.test.mjs`
- `packages/agent-plugins/google-workspace/jini-admin-surfaces.json`
- `packages/agent-plugins/google-workspace/jini-connections.json`
- `packages/agent-plugins/google-workspace/lib/picker-flow.mjs`
- `packages/agent-plugins/google-workspace/ui/README.md`
- `packages/agent-plugins/s3-compatible/jini-object-stores.json`
- `packages/agent-plugins/s3-compatible/object-stores/s3-compatible.mjs`
- `packages/agent-plugins/supabase/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/supabase/mcp.json`

### K8
- `packages/agent-plugins/meilisearch/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/meilisearch/plugin.json`
- `packages/agent-plugins/resend/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/resend/__tests__/resend.test.mjs`
- `packages/agent-plugins/resend/jini-mail-adapters.json`

### K9
- `packages/agent-plugins/cloudflare/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/cloudflare/form-destinations/__tests__/cloudflare-d1.test.mjs`
- `packages/agent-plugins/cloudflare/jini-consent.json`
- `packages/agent-plugins/cloudflare/jini-deploy-targets.json`
- `packages/agent-plugins/cloudflare/jini-form-destinations.json`
- `packages/agent-plugins/fly/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/fly/jini-credential-schemes.json`
- `packages/agent-plugins/fly/jini-deploy-configs.json`
- `packages/agent-plugins/fly/jini-deploy-ops.json`
- `packages/agent-plugins/github-pages/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/github-pages/jini-deploy-targets.json`
- `packages/agent-plugins/github/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/github/jini-deploy-ops.json`
- `packages/agent-plugins/github/jini-source-control.json`
- `packages/agent-plugins/google-login/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/google-login/jini-login-providers.json`
- `packages/agent-plugins/google-workspace/README.md`
- `packages/agent-plugins/google-workspace/__tests__/admin-surfaces.pin.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/connection-panel.frame.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/destination-panel.frame.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/existing-files.pin.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/frame-harness.mjs`
- `packages/agent-plugins/google-workspace/__tests__/product-gating.security.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/sheets-admin.security.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/sheets-tools.security.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/sheets.contract.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/skill-content.test.mjs`
- `packages/agent-plugins/google-workspace/__tests__/surface-harness.mjs`
- `packages/agent-plugins/google-workspace/__tests__/surfaces.security.test.mjs`
- `packages/agent-plugins/google-workspace/form-destinations/README.md`
- `packages/agent-plugins/google-workspace/jini-admin-surfaces.json`
- `packages/agent-plugins/google-workspace/jini-agent-tools.json`
- `packages/agent-plugins/google-workspace/jini-connections.json`
- `packages/agent-plugins/google-workspace/jini-form-destinations.json`
- `packages/agent-plugins/google-workspace/lib/auth.mjs`
- `packages/agent-plugins/google-workspace/lib/form-destination-settings.mjs`
- `packages/agent-plugins/google-workspace/lib/request-policy.mjs`
- `packages/agent-plugins/google-workspace/lib/surface-actions.mjs`
- `packages/agent-plugins/google-workspace/tools/sheets-admin/README.md`
- `packages/agent-plugins/google-workspace/tools/sheets/README.md`
- `packages/agent-plugins/google-workspace/ui/README.md`
- `packages/agent-plugins/meilisearch/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/meilisearch/jini-search-providers.json`
- `packages/agent-plugins/netlify/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/netlify/jini-consent.json`
- `packages/agent-plugins/netlify/jini-deploy-targets.json`
- `packages/agent-plugins/railway/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/railway/jini-deploy-configs.json`
- `packages/agent-plugins/railway/jini-deploy-ops.json`
- `packages/agent-plugins/render/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/render/jini-deploy-configs.json`
- `packages/agent-plugins/render/jini-deploy-ops.json`
- `packages/agent-plugins/resend/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/resend/__tests__/resend.test.mjs`
- `packages/agent-plugins/resend/jini-mail-adapters.json`
- `packages/agent-plugins/s3-compatible/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/s3-compatible/jini-deploy-targets.json`
- `packages/agent-plugins/s3-compatible/jini-object-stores.json`
- `packages/agent-plugins/vercel/NOTES.md`
- `packages/agent-plugins/vercel/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/vercel/jini-consent.json`
- `packages/agent-plugins/vercel/jini-deploy-targets.json`
- `packages/agent-plugins/vercel/jini-object-stores.json`
- `packages/commerce/source-map.md`
- `packages/devops/source-map.md`
- `packages/integrations/source-map.md`
- `packages/plugins/source-map.md`

### P1
- `packages/agent-plugins/google-workspace/README.md`
- `packages/agent-plugins/google-workspace/jini-agent-tools.json`
- `packages/agent-plugins/google-workspace/tools/sheets-admin/README.md`
- `packages/agent-plugins/google-workspace/tools/sheets/README.md`
- `packages/agent-plugins/google-workspace/ui/README.md`
- `packages/agent-plugins/resend/NOTES.md`

### P2
- `packages/agent-plugins/fly/jini-credential-schemes.json`
- `packages/agent-plugins/github-pages/jini-deploy-targets.json`
- `packages/agent-plugins/github-pages/targets/github-pages.mjs`
- `packages/agent-plugins/netlify/targets/netlify.mjs`
- `packages/agent-plugins/s3-compatible/__tests__/target-edges.test.mjs`
- `packages/agent-plugins/s3-compatible/jini-deploy-targets.json`
- `packages/agent-plugins/s3-compatible/object-stores/s3-compatible.mjs`
- `packages/agent-plugins/s3-compatible/targets/s3-compatible.mjs`
- `packages/agent-plugins/vercel/object-stores/vercel-blob.mjs`
- `packages/agent-plugins/vercel/targets/vercel.mjs`

### P3
25 manifests inspected; no further writes.

### D3
- `packages/agent-plugins/github/__tests__/bundled-package.test.mjs`
- `packages/agent-plugins/github/__tests__/deployments-provider.test.mjs` (deleted)
- `packages/agent-plugins/github/deployments/github.mjs` (deleted)

### J13
- `packages/agent-plugins/README.md`
- `packages/agent-plugins/src/connect/access-token-tool.ts`
- `packages/chat/src/core/assistant-client/transport.ts`
- `packages/core/src/surface-exchanges.ts`
- `packages/daemon/src/core/tool-audit.ts`
- `packages/daemon/src/surface-exchanges.ts`

## K9 plain-mv rename pairs
- `packages/agent-plugins/cloudflare/tovu-consent.json` → `packages/agent-plugins/cloudflare/jini-consent.json`
- `packages/agent-plugins/cloudflare/tovu-deploy-targets.json` → `packages/agent-plugins/cloudflare/jini-deploy-targets.json`
- `packages/agent-plugins/cloudflare/tovu-form-destinations.json` → `packages/agent-plugins/cloudflare/jini-form-destinations.json`
- `packages/agent-plugins/fly/tovu-credential-schemes.json` → `packages/agent-plugins/fly/jini-credential-schemes.json`
- `packages/agent-plugins/fly/tovu-deploy-configs.json` → `packages/agent-plugins/fly/jini-deploy-configs.json`
- `packages/agent-plugins/fly/tovu-deploy-ops.json` → `packages/agent-plugins/fly/jini-deploy-ops.json`
- `packages/agent-plugins/github/tovu-deploy-ops.json` → `packages/agent-plugins/github/jini-deploy-ops.json`
- `packages/agent-plugins/github/tovu-source-control.json` → `packages/agent-plugins/github/jini-source-control.json`
- `packages/agent-plugins/github-pages/tovu-deploy-targets.json` → `packages/agent-plugins/github-pages/jini-deploy-targets.json`
- `packages/agent-plugins/google-login/tovu-login-providers.json` → `packages/agent-plugins/google-login/jini-login-providers.json`
- `packages/agent-plugins/google-workspace/tovu-admin-surfaces.json` → `packages/agent-plugins/google-workspace/jini-admin-surfaces.json`
- `packages/agent-plugins/google-workspace/tovu-agent-tools.json` → `packages/agent-plugins/google-workspace/jini-agent-tools.json`
- `packages/agent-plugins/google-workspace/tovu-connections.json` → `packages/agent-plugins/google-workspace/jini-connections.json`
- `packages/agent-plugins/google-workspace/tovu-form-destinations.json` → `packages/agent-plugins/google-workspace/jini-form-destinations.json`
- `packages/agent-plugins/meilisearch/tovu-search-providers.json` → `packages/agent-plugins/meilisearch/jini-search-providers.json`
- `packages/agent-plugins/netlify/tovu-consent.json` → `packages/agent-plugins/netlify/jini-consent.json`
- `packages/agent-plugins/netlify/tovu-deploy-targets.json` → `packages/agent-plugins/netlify/jini-deploy-targets.json`
- `packages/agent-plugins/railway/tovu-deploy-configs.json` → `packages/agent-plugins/railway/jini-deploy-configs.json`
- `packages/agent-plugins/railway/tovu-deploy-ops.json` → `packages/agent-plugins/railway/jini-deploy-ops.json`
- `packages/agent-plugins/render/tovu-deploy-configs.json` → `packages/agent-plugins/render/jini-deploy-configs.json`
- `packages/agent-plugins/render/tovu-deploy-ops.json` → `packages/agent-plugins/render/jini-deploy-ops.json`
- `packages/agent-plugins/resend/tovu-mail-adapters.json` → `packages/agent-plugins/resend/jini-mail-adapters.json`
- `packages/agent-plugins/s3-compatible/tovu-deploy-targets.json` → `packages/agent-plugins/s3-compatible/jini-deploy-targets.json`
- `packages/agent-plugins/s3-compatible/tovu-object-stores.json` → `packages/agent-plugins/s3-compatible/jini-object-stores.json`
- `packages/agent-plugins/vercel/tovu-consent.json` → `packages/agent-plugins/vercel/jini-consent.json`
- `packages/agent-plugins/vercel/tovu-deploy-targets.json` → `packages/agent-plugins/vercel/jini-deploy-targets.json`
- `packages/agent-plugins/vercel/tovu-object-stores.json` → `packages/agent-plugins/vercel/jini-object-stores.json`
