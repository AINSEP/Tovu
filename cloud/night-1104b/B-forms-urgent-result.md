Programmer(Direct): Implemented notification retries/terminal status, native download-form disabling, persisted invalid-import classification, receiver validation/PII corrections, private attachment handling and purge scheduling, early admission limits, and HTML duplication.

**CMS typecheck passed. No tests ran**, per your rule; red/green status remains unconfirmed. No tables, provider rewrite, builds, servers, or commits.

[Handoff: root causes, changed files, tests, I/O costs and remaining gaps](/Users/la/Programming/tovu-integration-clones/prov2-tovu/ADS-memory/reports/2026-11-04-forms-urgent-handoff.md)

Open: historical schema/consent evidence, durable storage quotas, pre-existing orphan/derived files, and previously lost validation errors. Content transfer remains with item 14. Integration needs the changed Jini packages and Cloudflare republishing.

Deferred test commands:

```bash
cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/cms
npx vitest run --maxWorkers=2 src/forms/__tests__/{notify-durable,submission-validation-metadata,attachment-purge,attachment-cleanup,request-admission,submission-ip-retention,notify-subscriber}.test.ts src/media/__tests__/{media-service,rendition-service,replace-media-file}.test.ts

cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/admin
npx vitest run --maxWorkers=2 src/forms/react/__tests__/submissions-states.unit.test.tsx

cd /Users/la/Programming/tovu-integration-clones/prov2-jini
node --test --test-timeout=60000 --test-concurrency=2 packages/agent-plugins/cloudflare/worker/__tests__/forms-*.test.mjs packages/agent-plugins/cloudflare/lib/__tests__/forms.test.mjs

cd /Users/la/Programming/tovu-integration-clones/prov2-tovu
TSX_TSCONFIG_PATH=ADS-memory/.local-artifacts/forms-urgent/test-tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-timeout=60000 --test-concurrency=2 apps/website/src/features/forms/__tests__/*.test.ts apps/website/src/features/site-export/__tests__/download-forms-privacy.test.ts apps/website/src/contracts/core/events/__tests__/forms-notification-retry.test.ts apps/website/src/server/inbound/admin-http/http/__tests__/forms-response.test.ts apps/website/src/server/inbound/public-http/routes/site/__tests__/forms-admission.test.ts apps/website/src/server/inbound/public-http/routes/site/__tests__/media-rendition.route.test.ts
```