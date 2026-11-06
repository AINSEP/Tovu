# older-fixes — in progress

Branch: `cloud/older-fixes`. Base: `c11d491f3cb2a695caa5d0f2e700581d747af735`.

O01–O08 pending; C11–C30 pending focused traces. C01–C10 excluded as instructed.

Setup: rebuilding Jini from the specified base before relinking Tovu; focused baselines follow.

## Bugs found

- O01: static options use allocated archive folder names.
- O02: export history has no type label.

O01 fixed: static options return installed theme titles; archive allocation unchanged. Old backend assertion expected folder names and now asserts the installed titles.
O02 fixed: history Type column uses the established `.tovu.zip` backup filename contract. Chrome follow-up: check picker titles, Type column width and mobile cards.
Tests: `node --import tsx --test --experimental-test-module-mocks apps/website/src/features/site-backup/__tests__/share-backend.unit.test.ts` — 12 pass after red (11 pass, 1 fail).
Tests: `npm --prefix apps/admin run test -- src/features/sites/__tests__/SiteExportTab.history.unit.test.tsx` — 2 pass after red (1 pass, 1 fail).
Baseline: `pnpm -r build` in Jini fails in provider-plugins (fix-round scope). Remaining-package build fails in chat on existing test import of @jini-ai/ui-kit/react. Contracts rebuilt and local Jini links refreshed.

O04 fixed: llms.txt uses the shared site-title resolver and configured SEO description; absent descriptions stay absent. `node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks apps/website/src/server/inbound/public-http/routes/site/__tests__/llms.route.test.ts` — 10 pass after 2 focused identity failures on the base.
O05 fixed: HTML content DTO carries bodyFormat/html and null bodyJson; document responses stay byte-compatible. Reuses the existing body validator; private/admin fields stay excluded. `node --import tsx --test apps/website/src/server/inbound/public-http/http/shared/__tests__/post.test.ts apps/website/src/server/http/__tests__/headless-contracts.test.ts` — 9 pass after the new HTML case failed.

- O04: llms.txt describes the platform rather than the site.
- O05: HTML content responses omit bodyHtml.

O08 fixed: a shared workspace reverse index replaces per-asset whole-post-list scans. A distinct asset/alias miss reads matching access records from the index; a cold/expired workspace snapshot lists/posts/scans once. Existing post/widget/Trash invalidation still drops derived evidence. No entry bodies or visitor decisions are retained. Opaque gated referrers preserve the existing fail-closed behavior, including alias deduplication.
Cost: previously A distinct misses × all post bodies/scan work per 60 seconds; now one snapshot refresh × all post bodies plus O(alias + matching refs + opaque gates) per asset. Cache retains O(authored references + opaque gates) access metadata, at most 256 workspace indexes per repo. Cold snapshot refresh still requires one source listing; there is no new persisted reference table.
Tests: `node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks apps/website/src/server/inbound/public-http/routes/site/__tests__/media-rendition.route.test.ts apps/website/src/features/trash/__tests__/post-trash-media-evidence.integration.test.ts` — 13 pass; new distinct-asset test failed before fix (2 lists instead of 1).
Affected gating: same Node command with `apps/website/src/server/__tests__/media-rendition-gating-bypass.test.ts apps/website/src/server/__tests__/media-rendition-route.test.ts apps/website/src/server/__tests__/media-original-video-route.test.ts` — 62 pass. Scoped ESLint passes.

- O08: distinct asset cache misses repeat the complete post scan.
