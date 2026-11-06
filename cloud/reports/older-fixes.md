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

## Focused unsettled checks — in progress

C11 not reproduced: current memory rendition adapter CAS/source-change contract passes (3).
C12 not reproduced in the individual notification/export/receiver/storage/cleanup fixtures: CMS31, host25, receiver23 pass. Broad whole-system claims remain bounded to those cases.
C13 not a supported-marker bug: new fixture persists page widget marker → widget config.formDefinitionId → form, and checks workspace-scoped reverse references. Legacy direct type:form is not supported render syntax. The fixture verifies the reference chain, not every Trash-purge policy.
C14 not reproduced: isolated two-SQLite publish/replan of video and poster is unchanged immediately after publish (1).
C15 not reproduced on recorded scanner boundaries: 87 pass.
C16 not reproduced: retention/overwrite/restore fixtures36 pass, including an empty generated tree restoring nothing.
C17 not reproduced: injected initial provider failure stays discoverable and recovers on reapply (1).
C18 not reproduced with time and occurrence IDs controlled: new native+hosted two-export content comparison passes (3 static form cases total).
C19 not reproduced: a real Vite server is started twice around a fake installed-package version/byte upgrade; the preserved optimizer cache rebuilds through the production fingerprint plugin identity. Six fingerprint/optimizer tests pass.
C20 not reproduced: two actual npm-packed provider/agent release sets exercise stale catalog digests and same-version changed agent bytes. Jini release-consistency9 pass; unchanged plugin versions require explicit replacement and the release checker rejects changed agent bytes without a plugin version advance.
C21 not reproduced: staged closure8 and real caller-root5 pass.
C22 not reproduced at sampled public boundaries: injected recovery authorization failure redacts HTTP/log secrets; unexpected manual-publish snapshot redacts a secret-shaped message. Internal toRecoveryResult still carries the raw unexpected cause to its owning outer boundary; this is not claimed safe for arbitrary new consumers.
C23 not reproduced: secret targets/aliases advertise unwritable and reject writes (43 core settings tests); the actual executor/card fixture rejects a wrong principal and commits one revision attributed to the authenticated caller. The kernel principal is the run's bound delegating identity; model input cannot choose the confirmer.
C24 replacement consent path checks pass: context/reload guard and script/frame lifecycle11; declaration/disabled-read/publication-refresh host47. Legacy page-rewriting paths do not exist in this implementation; raw authored embeds remain explicitly unmanaged.
C25 package build and standalone artifact/build fixtures33 pass. Fresh composition produced 33 selected plugin manifests; vendor discovery/content test checks in progress.
C26 not reproduced: current liveness/host/boot file-lock boundary fixtures85 pass. This does not certify all scheduler-load timing conditions.
C27 not reproduced: two throwing-hook kernel cases and 19 real host/helper cleanup cases pass.
C28 not reproduced: current editor controller/banner/version/draft-routing fixtures46 pass.
C29 not reproduced: isolated two-site grants and guarded credential-copy fixtures13 pass.
C30 confirmed residual gap: all six individual producers return image previews, but each real two-item batch keeps both saved-media results and zero image blocks. Jini explicitly strips per-item images to prevent base64-in-JSON growth. Fixing this requires a bounded top-level image envelope across batch/MCP/chat contracts; left open rather than changing that shared contract inside a ten-minute check.

- C30: batch media production drops every inline preview image block; individual calls retain previews.
