#!/usr/bin/env bash
# Job Q — commands only; NOT executed by the implementing agent.
# Land the updated Jini release and Tovu dependency/lockfile bump first.
# B14-4 ordinary-upload round-trip is an unconfirmed RED regression; see Q-result.md.
set -u
q_status=0
(
  cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/cms || exit 1
  npx --no-install vitest run --maxWorkers=2 src/media/__tests__/{replace-media-file,media-service}.test.ts
) || q_status=1
(
  cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/diagnostics || exit 1
  npx --no-install vitest run --maxWorkers=2 src/core/__tests__/secrets-only*.test.ts src/__tests__/secrets-only.test.ts
) || q_status=1
(
  cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/agent-plugins || exit 1
  npx --no-install vitest run --maxWorkers=2 src/lifecycle/__tests__/unit/bundled-file-policy.unit.test.ts
) || q_status=1
(
  cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/sidecar || exit 1
  npx --no-install vitest run --maxWorkers=2 src/supervision/__tests__ src/__tests__/integration-surface.test.ts src/__tests__/supervisor-isolation.test.ts
) || q_status=1
(
  cd /Users/la/Programming/tovu-integration-clones/prov2-tovu || exit 1
  TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-timeout=60000 --test-concurrency=2 \
    apps/website/src/features/media/__tests__/{publish-content.overwrite,replacement.dialects,import-media-entity,publish-content.apply,publish-content.write,library-publish}.test.ts \
    apps/website/src/features/publish-content/__tests__/{planner,apply-loop,gated-hooks.confirmed-report}.test.ts \
    apps/website/src/features/site-backup/__tests__/{share-zip,bundled-export-file-policy}.unit.test.ts
) || q_status=1
(
  cd /Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/desktop || exit 1
  node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-timeout=60000 --test-concurrency=2 src/{desktop-resources,desktop-reported-regressions,product-memory-telemetry,project-ipc,resources-ipc}.test.ts
) || q_status=1
(
  cd /Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/desktop || exit 1
  node --import tsx --test --test-timeout=60000 --test-concurrency=2 src/renderer/{ResourcesPanel.render,use-resources.hooks.render}.test.ts
) || q_status=1
(
  cd /Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/admin || exit 1
  npx --no-install vitest run --maxWorkers=2 src/__tests__/unit/app-assistant-alias.unit.test.tsx
) || q_status=1
exit "$q_status"
