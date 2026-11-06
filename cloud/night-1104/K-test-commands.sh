
# Job K — Part 2 regression checks. Authored only; the Programmer ran NO tests.
(
  set -e
  cd /Users/la/Programming/tovu-integration-clones/prov2-tovu || exit 1
  node --test --test-timeout=60000 --test-concurrency=2 development/scripts/__tests__/dev-startup-failure.test.mjs development/scripts/__tests__/dev-api-restart.test.mjs development/scripts/__tests__/dev-sites-home.test.mjs development/scripts/__tests__/dev-lite.test.mjs
  node --import tsx --test --test-timeout=60000 --test-concurrency=2 apps/website/src/server/runtime/boot/__tests__/boot-readiness-gate.unit.test.ts apps/website/src/platform/site-dir/__tests__/unit/site-running.unit.test.ts apps/website/src/features/newsletter/__tests__/repo.dialects.test.ts apps/website/src/features/newsletter/__tests__/campaign-write-service.test.ts apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/create-campaign.test.ts apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/update-campaign.test.ts apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/list-campaigns-and-subscriptions.test.ts
  node --import tsx --test --test-timeout=60000 --test-concurrency=2 apps/desktop/src/desktop-resources.test.ts apps/desktop/src/renderer/ResourcesPanel.render.test.ts apps/desktop/src/renderer/use-resources.hooks.render.test.ts apps/desktop/src/main/boot/site-backend.test.ts apps/desktop/src/shared-sites-home.test.ts apps/desktop/src/shared-sites-stale-lease.test.ts apps/desktop/src/tovu-server-failures.test.ts
)
