#!/usr/bin/env bash
set -euo pipefail
# Job O: commands only; the Programmer did not execute this file or any tests.
# Source aliases use this isolated Jini checkout without install, builds, or touching live repos.
cd /Users/la/Programming/tovu-integration-clones/prov2-tovu
TSX_TSCONFIG_PATH="/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-04-night/O-tsconfig.json" node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/features/project-keys/__tests__/attached-vault.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/reference-only.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/tools.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/site-reference.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/site-sealer.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/create-abort.unit.test.ts \
  apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts \
  apps/website/src/features/custom-credentials/__tests__/set-token-agent-tool.unit.test.ts \
  apps/website/src/features/custom-credentials/__tests__/credential-copy-tool.test.ts \
  apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts \
  apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts \
  apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts \
  apps/website/src/features/vendor-credentials/__tests__/index.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-config-source.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-key-reference-only.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/deps-project-credentials.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/owner-store-location.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/project-store.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-saved-keys.integration.test.ts \
  apps/website/src/cli/__tests__/integration/owner-store.integration.test.ts \
  apps/website/src/server/inbound/admin-http/routes/system/__tests__/custom-credentials-inventory.unit.test.ts \
  apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-password.integration.test.ts \
  apps/website/src/features/site-backup/__tests__/saved-keys.test.ts \
  apps/website/src/features/site-backup/__tests__/owner-keys-excluded.unit.test.ts \
  apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts

cd /Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/desktop
node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-timeout=60000 --test-concurrency=2 \
  src/owner-store-ipc.test.ts src/owner-store-cli.test.ts src/preload/preload.test.ts
node --import tsx --test --test-timeout=60000 --test-concurrency=2 \
  src/renderer/SharedKeys.render.test.ts src/renderer/SharedKeys.hooks.test.ts

cd /Users/la/Programming/tovu-integration-clones/prov2-tovu
TSX_TSCONFIG_PATH="/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-04-night/O-tsconfig.json" node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/features/forms/__tests__/form-file-purge.test.ts \
  apps/website/src/features/forms/__tests__/form-destination-manifest.test.ts \
  apps/website/src/features/site-export/__tests__/download-forms-privacy.test.ts \
  apps/website/src/features/site-export/__tests__/static-copy-policy.unit.test.ts \
  apps/website/src/server/inbound/public-http/routes/site/__tests__/forms-admission.test.ts \
  apps/website/src/server/inbound/admin-http/routes/forms/__tests__/forms-route-failures.unit.test.ts \
  apps/website/src/platform/db/repos/__tests__/form-delivery-repo.dialects.test.ts

cd /Users/la/Programming/tovu-integration-clones/prov2-jini
node --test --test-timeout=60000 --test-concurrency=2 \
  packages/agent-plugins/cloudflare/worker/__tests__/forms-urgent.test.mjs \
  packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver.test.mjs \
  packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver-edges.test.mjs \
  packages/agent-plugins/cloudflare/lib/__tests__/forms.test.mjs \
  packages/agent-plugins/cloudflare/lib/__tests__/forms-edges.test.mjs \
  packages/agent-plugins/cloudflare/targets/__tests__/forms-publish.test.mjs

cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/cms
npx --no-install vitest run --maxWorkers=2 --testTimeout=60000 \
  src/forms/__tests__/attachment-purge.test.ts \
  src/forms/__tests__/request-admission.test.ts \
  src/forms/__tests__/attachment-cleanup.test.ts \
  src/media/__tests__/list-page-w2g.unit.test.ts

cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/admin
npx --no-install vitest run --maxWorkers=2 --testTimeout=60000 \
  src/forms/react/__tests__/submissions-states.unit.test.tsx
