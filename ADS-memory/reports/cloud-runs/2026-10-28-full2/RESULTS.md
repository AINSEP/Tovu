# Full verification run, 2nd pass, 2026-10-28 evening — RESULTS (report only)
Tovu: branch cloud/full2-1028 (WIP snapshot 2a0c60ac); Jini: cloud/full2-1028. Sonnet 5.5, no product code/test/config/lockfile committed. Only local, uncommitted setup: every `@jini-ai/*` dependency in the root, apps/admin, apps/desktop (its own `overrides` removed), apps/site-chat and packages/sdk manifests rewritten to `file:/home/user/Jini/packages/<name>` and root `overrides` replaced the same way (`npm ci` impossible: `@jini-ai/cookie-consent`/`plugins@^0.6.13` are not on npm), `npm install --ignore-scripts`. Postgres 16 on socket /tmp (user `la`), Chromium symlinks (not needed by any step run). Node 24.22.0.
Wall clock at write-up ≈ 2h of the 4h cap; all six brief steps ran. Raw output in `raw/`.

## §0 One screen (delta = vs first pass `cloud/full-1028-results`)
| Area | 2nd pass | 1st pass → delta |
|---|---|---|
| Jini build (`pnpm -r build`) | exit 0, 0 errors | 3 pkgs failed → **fixed** |
| Jini typecheck | 0 errors | 2 TS errors → **fixed** |
| Jini `pnpm guard` | exit 1, **18** violations | 19 → −1 (see §1.3) |
| Jini `test:scripts` | exit 1: vitest 405/405 pass; node tests 6 pass **3 fail** (infra-retirement, they read the sibling Tovu checkout) | 3 fail → same |
| Jini package vitest (39 vitest runs incl. cms/forms) | **49 029 pass, 1 fail, 15 skipped**; 11 pkgs exit 1 = 10 from 100%-coverage thresholds + `ui` (1 real failing test) | all-pass + 11 exit 1 → same shape |
| Jini coverage | 12 pkgs at 100/100/100; lowest (excl. two outliers) diagnostics 94.74% L, vibecoding 96.41% L / 92.09% B, ui-kit 96.68% L; **commerce 4.01% L / 39.7% B**, provider-plugins 2.08% L (likely counts built bundles, see §2); 218 files under 100% (158 excl. commerce) | — |
| Jini `complexity:strict` | **aborts again** (sonarjs config error, same text) even with ts-only globs; fallback `complexity` rule only (max 10): **1 function** (cms/src/media/list-page.ts:13, 11) | aborted → aborted; cyclomatic fallback now measured |
| Tovu typecheck | root 0, admin 0, desktop (4 configs) 0, site-chat 0, scripts 0; **typecheck:tests 56 errors** (e2e project is part of root `typecheck`, exit 0 now) | e2e 7 + tests 396 + admin 2 → **big improvement** |
| Tovu node:test (8 shards, 2842 files) | **33 214 tests: 32 950 pass, 129 fail, 99 cancelled-by-parent, 36 skipped**; all 8 shards exit 1; no shard hit the guard; 63 failing files | 5 875 failing leaf tests (bootstrap 0036 root cause) → **129 (−97.8%)** |
| Admin vitest | 13 542 pass, **1 fail** (833 files), L99.41 B98.41 F98.74 | 3 fail → 1 (different test) |
| Desktop `npm test` | 2 534 tests (1 822+701 pass), **1 fail** (site-error-feedback D-24, repeats alone) | same test |
| Tovu coverage, all-files | **L 86.04% B 70.38% F 58.99%**; 3299 files, 1232 NEVER-LOADED (admin 794 + desktop 186 are vitest/other-runner files, plus sites 97, development 84, content 50 — so the headline is a lower bound); `apps/website` alone 99.51% lines, 4 never loaded | 85.31/69.63/56.10 (6 of 8 shards) → +0.7 L |
| Tovu route coverage (333 files) | **L 99.92% B 79.81% F 98.98%** — floor (99/68/93) **passes** (was expected to fail); only 28 uncovered lines/23 uncovered functions, 3 691 uncovered branches | L75.11 B86.72 → fixed; branch number not comparable (node-lcov branch accounting) |
| Tovu complexity:strict | 1280 messages/3124 files; **complexity=5, cognitive=6, all in old migrations 0006/0011/0012/0013** | same 11 core hits (1273 msgs before) |
| Architecture | `check:boundaries` exit 167: **167 errors / 416 warnings** (583); `check-architecture` FAILED (1 hard metric); madge cycles website **28**, admin 97, desktop 90 | 167 err / 528 warn; module surface 393→817 flagged |
| Largest SCC | check-architecture runtime SCC **22** (was 28), madge SCC (website) 9 files; admin/desktop graphs include the same 78-file cluster pulled through website imports | 28 → 22 |

**Headline:** the 0036 bootstrap blocker is gone; what remains is 63 failing test files (129 leaf failures) that are mostly **STALE tests** (39 files) behind recent product changes (versioned media URLs, migration 0037, approval-card layout, site-backup `moduleUrl`, deleted `site-credential-repo.ts`), plus **17 REAL** (13 guard/boundary + 4 product behaviours incl. consent banner privacy link, SEO deps receiver, retired tool in bundled SKILL.md, publish 500), 6 ENV, 1 flaky. Only 1 of 63 files passed on lone rerun.

## §1 Failures
### 1.1 Tovu node:test — 63 files (class counts: STALE 39, REAL 17, ENV 6, FLAKY 1)
Re-run: each file once alone (`node --import tsx --test … <file>`, 600 s guard): **62 of 63 fail again**; the one that passes is FLAKY(ENV) `cli/__tests__/unit/plugin-install-real-site.unit.test.ts` (died with SIGTRAP under load). First-error excerpt (~15 lines) for every file: `raw/tovu-failures-classified.json` (`errorHead`); full blocks `raw/tovu-failures-first-pass.json`; rerun TAP `raw/reruns/`. "Cancelled by parent" (99) are children of the failing hooks/files below, not independent failures. Causes below are from reading the stack/assertion + checking the cited source; items marked (verify) are inferred. `w/` = apps/website/src.

| # | file | failing tests | rerun alone | class | likely cause |
|--|--|--|--|--|--|
| 1 | `development/scripts/__tests__/unit/script-inventory-characterization.unit.test.ts` | 3 | FAIL | ENV | `Cannot redefine property: constants` — test patches a frozen node builtin namespace; behaviour differs on Node 24.22 (this container) — rerun reproduces; also `?characterization` query imports flagged by dead-path-sweep. |
| 2 | `development/scripts/__tests__/repair-site.test.ts` | 2 | FAIL | ENV | repair-site dry run exits 1 — needs real site-dir/HOME state in this container (verify). |
| 3 | `development/scripts/__tests__/unit/mutation-cli-characterization.unit.test.ts` | 1 | FAIL | ENV | `Cannot redefine property: constants` — test patches a frozen node builtin namespace; behaviour differs on Node 24.22 (this container) — rerun reproduces; also `?characterization` query imports flagged by dead-path-sweep. |
| 4 | `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts` | 1 | FAIL | ENV | Assertion sees `file:/home/user/Jini/packages/*` instead of a semver range because this run overrode every @jini-ai dependency with local file: paths (setup, not product). |
| 5 | `development/scripts/__tests__/openapi-contract-fixtures.test.ts` | 1 | FAIL | ENV | `Test home isolation required` — refuses the real HOME (/root); needs an isolated HOME/profile env that the sharded run did not set. |
| 6 | `w/assistant/persistence/__tests__/release-manifests.test.ts` | 1 | FAIL | ENV | Assertion sees `file:/home/user/Jini/packages/*` instead of a semver range because this run overrode every @jini-ai dependency with local file: paths (setup, not product). |
| 7 | `w/cli/__tests__/unit/plugin-install-real-site.unit.test.ts` | 1 | PASS | FLAKY (ENV) | Process died with SIGTRAP; passes on rerun. |
| 8 | `w/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts` | 3 | FAIL | REAL | Default consent banner renders without the `/privacy` "Privacy policy" link: test helper default-consent-page.ts:31 asserts `a[href="/privacy"]`, but Jini cookie-consent banner.ts:25 defaults `privacyPolicyUrl: ''` — Tovu host (site-consent middleware) no longer passes it, or Jini default changed. Tovu↔Jini drift. |
| 9 | `development/scripts/__tests__/dead-path-sweep.test.ts` | 2 | FAIL | REAL | Guard/boundary test failing on the live tree: see first error lines (matches check:boundaries errors `domain-no-direct-assistant-tool-registration`, vendor/idle-motion/dead-path allowlists out of date). |
| 10 | `w/server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts` | 2 | FAIL | REAL | Default consent banner renders without the `/privacy` "Privacy policy" link: test helper default-consent-page.ts:31 asserts `a[href="/privacy"]`, but Jini cookie-consent banner.ts:25 defaults `privacyPolicyUrl: ''` — Tovu host (site-consent middleware) no longer passes it, or Jini default changed. Tovu↔Jini drift. |
| 11 | `development/scripts/__tests__/check-menu-href-allowlist-sync.test.ts` | 2 | FAIL | REAL | Cannot find SAFE_HREF_RESOLUTION_BASE/ORIGIN const pair in features/theme/static-render — refactor moved/renamed them; drift script no longer parses. |
| 12 | `w/assistant/site/__tests__/visitor-executor-confirmation.unit.test.ts` | 1 | FAIL | REAL | Test timed out after 600000 ms: Ask-without-snapshot path never settles (hang) — see visitor-executor-confirmation.unit.test.ts; possibly confirmation-card change. |
| 13 | `w/platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts` | 1 | FAIL | REAL | Ratchet: new raw SQLite outside the storage kernel — project-keys/attachments.ts (insert-or), migrations/project/0000_project_vault.ts + 0001 (sqlite-json x2), server/runtime/composition/project-store.ts (pragma x2). |
| 14 | `w/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts` | 1 | FAIL | REAL | Bundled tovu-theme SKILL.md still cites retired tool `media_list_assets` (use content_read.media_asset); unit test flags it. |
| 15 | `w/server/inbound/admin-http/routes/system/__tests__/publish-site.tw4.pins.test.ts` | 1 | FAIL | REAL | POST publish returns 500 instead of 409 (publish-site.tw4.pins.test.ts:53) — unhandled error path; likely consent/default-consent or deps wiring change; triage needed. |
| 16 | `w/contracts/core/__tests__/integration/child-process-coverage-env-wiring.test.ts` | 1 | FAIL | REAL | serve-command.integration.test.ts has a spawn whose env bypasses the coverage helper (policy test) — add helper to that spawn. |
| 17 | `w/features/seo/__tests__/index.unit.test.ts` | 1 | FAIL | REAL | createSeoDeps loses its receiver: transform-repo called with `[object Object]` instead of `og` (seo/index.ts, test line 67). |
| 18 | `w/assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts` | 1 | FAIL | REAL | Guard/boundary test failing on the live tree: see first error lines (matches check:boundaries errors `domain-no-direct-assistant-tool-registration`, vendor/idle-motion/dead-path allowlists out of date). |
| 19 | `w/server/inbound/public-http/routes/site/__tests__/integration/taxonomy-render-surface.integration.test.ts` | 1 | FAIL | REAL | Default consent banner renders without the `/privacy` "Privacy policy" link: test helper default-consent-page.ts:31 asserts `a[href="/privacy"]`, but Jini cookie-consent banner.ts:25 defaults `privacyPolicyUrl: ''` — Tovu host (site-consent middleware) no longer passes it, or Jini default changed. Tovu↔Jini drift. |
| 20 | `development/scripts/__tests__/check-idle-motion.test.ts` | 1 | FAIL | REAL | Guard/boundary test failing on the live tree: see first error lines (matches check:boundaries errors `domain-no-direct-assistant-tool-registration`, vendor/idle-motion/dead-path allowlists out of date). |
| 21 | `development/scripts/__tests__/request-site-binding.guard.test.ts` | 1 | FAIL | REAL | Guard/boundary test failing on the live tree: see first error lines (matches check:boundaries errors `domain-no-direct-assistant-tool-registration`, vendor/idle-motion/dead-path allowlists out of date). |
| 22 | `w/features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts` | 1 | FAIL | REAL | Guard/boundary test failing on the live tree: see first error lines (matches check:boundaries errors `domain-no-direct-assistant-tool-registration`, vendor/idle-motion/dead-path allowlists out of date). |
| 23 | `w/features/site-export/__tests__/site-exporter.test.ts` | 1 | FAIL | REAL | Default consent banner renders without the `/privacy` "Privacy policy" link: test helper default-consent-page.ts:31 asserts `a[href="/privacy"]`, but Jini cookie-consent banner.ts:25 defaults `privacyPolicyUrl: ''` — Tovu host (site-consent middleware) no longer passes it, or Jini default changed. Tovu↔Jini drift. |
| 24 | `w/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts` | 1 | FAIL | REAL | Default consent banner renders without the `/privacy` "Privacy policy" link: test helper default-consent-page.ts:31 asserts `a[href="/privacy"]`, but Jini cookie-consent banner.ts:25 defaults `privacyPolicyUrl: ''` — Tovu host (site-consent middleware) no longer passes it, or Jini default changed. Tovu↔Jini drift. |
| 25 | `w/features/site-backup/__tests__/import-backend.unit.test.ts` | 19 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 26 | `w/features/site-backup/__tests__/library-share.integration.test.ts` | 14 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 27 | `w/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts` | 8 | FAIL | STALE | New versioned media URLs (`?v=sha12`, 0037/replace-restamp work) — tests still assert exact `/m/<slug>/...` URLs without the query (e.g. regex `src="/m/promo-01/original.mp4"`, `/og.v1/image.jpg$`). library.test 500!=400 and peer-site-reads image-decode error look like the same media-pipeline change; verify. |
| 28 | `w/features/site-backup/__tests__/import-interruption.integration.test.ts` | 8 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 29 | `w/features/site-backup/__tests__/import-failures.integration.test.ts` | 4 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 30 | `w/server/inbound/admin-http/routes/assistant/__tests__/agent-probe-characterization.test.ts` | 4 | FAIL | STALE | detect-agents payload now carries `discoveryPending` (and other new fields) not in the pinned expected object. |
| 31 | `w/platform/db/__tests__/parity/vault-boundary-parity.test.ts` | 3 | FAIL | STALE | Imports apps/website/src/platform/db/repos/site-credential-repo.ts which no longer exists (deleted in the snapshot commit 2a0c60ac). |
| 32 | `w/features/site-backup/__tests__/import.integration.test.ts` | 3 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 33 | `w/platform/db/__tests__/parity/vault-write-parity.test.ts` | 3 | FAIL | STALE | Imports apps/website/src/platform/db/repos/site-credential-repo.ts which no longer exists (deleted in the snapshot commit 2a0c60ac). |
| 34 | `w/features/site-backup/__tests__/share-plugin-policy.integration.test.ts` | 2 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 35 | `w/server/__tests__/integration/member-magic-link-real-composition.unrun.integration.test.ts` | 2 | FAIL | STALE | Rate-limit/refusal expectation deep-equal mismatch on sixth request; pinned shape stale (verify). |
| 36 | `w/features/site-backup/__tests__/import-download.integration.test.ts` | 2 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 37 | `w/platform/db/__tests__/parity/vault-cascade-parity.test.ts` | 2 | FAIL | STALE | Imports apps/website/src/platform/db/repos/site-credential-repo.ts which no longer exists (deleted in the snapshot commit 2a0c60ac). |
| 38 | `w/platform/db/__tests__/parity/vault-hot-path.test.ts` | 2 | FAIL | STALE | Imports apps/website/src/platform/db/repos/site-credential-repo.ts which no longer exists (deleted in the snapshot commit 2a0c60ac). |
| 39 | `w/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts` | 2 | FAIL | STALE | Transfer catalog table list changed (migrations 0036/0037); pin needs updating. |
| 40 | `w/features/site-backup/__tests__/share-refusals.integration.test.ts` | 2 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 41 | `w/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts` | 2 | FAIL | STALE | Imports apps/website/src/platform/db/repos/site-credential-repo.ts which no longer exists (deleted in the snapshot commit 2a0c60ac). |
| 42 | `w/features/site-backup/__tests__/import-malicious.integration.test.ts` | 2 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 43 | `w/platform/db/__tests__/parity/vault-read-parity.test.ts` | 2 | FAIL | STALE | Imports apps/website/src/platform/db/repos/site-credential-repo.ts which no longer exists (deleted in the snapshot commit 2a0c60ac). |
| 44 | `w/features/site-backup/__tests__/import-private-rows.integration.test.ts` | 2 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 45 | `w/features/site-backup/__tests__/share-round-trip.integration.test.ts` | 2 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 46 | `w/server/runtime/composition/__tests__/peer-site-reads.test.ts` | 2 | FAIL | STALE | New versioned media URLs (`?v=sha12`, 0037/replace-restamp work) — tests still assert exact `/m/<slug>/...` URLs without the query (e.g. regex `src="/m/promo-01/original.mp4"`, `/og.v1/image.jpg$`). library.test 500!=400 and peer-site-reads image-decode error look like the same media-pipeline change; verify. |
| 47 | `development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts` | 2 | FAIL | STALE | check:outbox-bridge output text changed (finding wording) — regex pin stale. |
| 48 | `w/platform/db/migrations/__tests__/member-external-identities-step.test.ts` | 2 | FAIL | STALE | Expected migration head 0036_publish_history_config_jsonb; head is now 0037_media_source_metadata. |
| 49 | `w/features/publish-content/__tests__/media-video-embed.round-trip.test.ts` | 1 | FAIL | STALE | New versioned media URLs (`?v=sha12`, 0037/replace-restamp work) — tests still assert exact `/m/<slug>/...` URLs without the query (e.g. regex `src="/m/promo-01/original.mp4"`, `/og.v1/image.jpg$`). library.test 500!=400 and peer-site-reads image-decode error look like the same media-pipeline change; verify. |
| 50 | `w/features/source-control/__tests__/github-backup-restore-accounts.integration.test.ts` | 1 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 51 | `w/server/runtime/composition/__tests__/installed-extension-tools.executable-tools.test.ts` | 1 | FAIL | STALE | Confirmation-card row labels changed (actual rows `Connection ref`/`Table`/`Values`/`ID`, tests expect `Tool`/`Input`) — tests not updated for the new approval-card layout. |
| 52 | `w/features/source-control/__tests__/github-backup-secrets.integration.test.ts` | 1 | FAIL | STALE | Test wiring calls features/site-backup rebuildImportDatabase without the now-required `moduleUrl` (import-database.ts:24-26,35; wrapper at server/runtime/composition/site-portability.ts:19 supplies it) and github-backup-secrets expects `deps.siteBackupSanitize` that no longer exists. Matches typecheck:tests TS2345 errors in the same files. |
| 53 | `w/platform/db/migrations/__tests__/runner.postgres.test.ts` | 1 | FAIL | STALE | Expected migration head 0036_publish_history_config_jsonb; head is now 0037_media_source_metadata. |
| 54 | `w/features/agent-plugins/executable-tools/__tests__/executable-tools.vertical-slice.test.ts` | 1 | FAIL | STALE | Confirmation-card row labels changed (actual rows `Connection ref`/`Table`/`Values`/`ID`, tests expect `Tool`/`Input`) — tests not updated for the new approval-card layout. |
| 55 | `w/server/inbound/admin-http/routes/media/__tests__/library.test.ts` | 1 | FAIL | STALE | New versioned media URLs (`?v=sha12`, 0037/replace-restamp work) — tests still assert exact `/m/<slug>/...` URLs without the query (e.g. regex `src="/m/promo-01/original.mp4"`, `/og.v1/image.jpg$`). library.test 500!=400 and peer-site-reads image-decode error look like the same media-pipeline change; verify. |
| 56 | `w/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts` | 1 | FAIL | STALE | Confirmation-card row labels changed (actual rows `Connection ref`/`Table`/`Values`/`ID`, tests expect `Tool`/`Input`) — tests not updated for the new approval-card layout. |
| 57 | `content/agent-plugins/fly/__tests__/credential-schemes.test.mjs` | 1 | FAIL | STALE | Test imports apps/website/src/features/custom-credentials/auth-schemes.ts, which no longer exists (ERR_MODULE_NOT_FOUND). |
| 58 | `content/agent-plugins/google-workspace/__tests__/sheets-admin.vertical-slice.test.mjs` | 1 | FAIL | STALE | Confirmation-card row labels changed (actual rows `Connection ref`/`Table`/`Values`/`ID`, tests expect `Tool`/`Input`) — tests not updated for the new approval-card layout. |
| 59 | `w/platform/db/sqlite/__tests__/share-database.integration.test.ts` | 1 | FAIL | STALE | File-level failure (exit 1, ERR_TEST_FAILURE/AssertionError) — see reruns/ tap for the assertion; not root-caused. |
| 60 | `w/server/__tests__/routes/seo-og-image-crawlability.test.ts` | 1 | FAIL | STALE | New versioned media URLs (`?v=sha12`, 0037/replace-restamp work) — tests still assert exact `/m/<slug>/...` URLs without the query (e.g. regex `src="/m/promo-01/original.mp4"`, `/og.v1/image.jpg$`). library.test 500!=400 and peer-site-reads image-decode error look like the same media-pipeline change; verify. |
| 61 | `w/server/runtime/composition/__tests__/provider-plugins.unit.test.ts` | 1 | FAIL | STALE | Telemetry/diagnostics default object is no longer reference-identical (diagnostics optional analytics change in Jini); pin needs updating. |
| 62 | `w/assistant/__tests__/agent-plugin-executable-tools.characterization.test.ts` | 1 | FAIL | STALE | Confirmation-card row labels changed (actual rows `Connection ref`/`Table`/`Values`/`ID`, tests expect `Tool`/`Input`) — tests not updated for the new approval-card layout. |
| 63 | `w/assistant/__tests__/declared-tool-keywords.contract.test.ts` | 1 | FAIL | STALE | Contract still expects `fly: credential_save` keyword entry (test line 67); tool/keyword registry changed. |

Cause clusters (verified against source unless marked):
1. **site-backup `moduleUrl` (≈11 files, ~60 tests, STALE)** — `TypeError: Cannot read properties of undefined (reading 'endsWith')` at `features/site-backup/import-database.ts:25` (`importWorkerLaunch({moduleUrl})`), reached via `import-verifier.ts:40` → `rebuildImportDatabase` (`import-database.ts:35,44`). The production wrapper `server/runtime/composition/site-portability.ts:18-19` injects `import.meta.url`; the tests build deps with the raw feature function. Same files show TS2345 in `typecheck:tests` (import-backend.unit.test.ts:100/107 …).
2. **vault parity (6 files, STALE)** — tests import `platform/db/repos/site-credential-repo.ts`, deleted in the snapshot commit.
3. **Consent banner without privacy link (5 files, REAL)** — `server/__tests__/helpers/default-consent-page.ts:31` expects `a[href="/privacy"]` "Privacy policy"; Jini `cookie-consent/src/render/banner.ts:25` defaults `privacyPolicyUrl: ''`. Tovu↔Jini contract drift; `typecheck:tests` also shows TS2305/TS2345 in site-consent*.test.ts.
4. **Versioned media URLs `?v=sha12` (5 files, STALE)** — e.g. `media-video-embed.round-trip` expects `src="/m/promo-01/original.mp4"` but gets `…original.mp4?v=7af950870f90`; seo-og-image regex `/og.v1/image.jpg$`. library.test (500≠400) and peer-site-reads (image decode error) look related (verify).
5. **Approval-card layout (6 files, STALE)** — rows are now `Connection ref/Table/Values/ID`, tests expect `Tool/Input` (executable-tools, installed-extension-tools, agent-plugin-connections, sheets-admin, agent-plugin-executable-tools.characterization).
6. **Migration head moved to 0037_media_source_metadata (2 files, STALE)** — runner.postgres + member-external-identities-step expect 0036 as head; commerce-strip-parity table list likely same.
7. **Guard/boundary on live tree (REAL)** — `no-raw-sqlite` ratchet (new raw SQLite in `features/project-keys/attachments.ts`, `migrations/project/0000_project_vault.ts`, `0001_project_credential_kinds.ts`, `server/runtime/composition/project-store.ts`), `domain-no-direct-tool-registration` (same 3 edges depcruise reports in §4), `no-vendor-in-core`, `request-site-binding`, `check-idle-motion`, `child-process-coverage-env-wiring` (serve-command.integration.test.ts spawn bypasses coverage helper), `check-menu-href-allowlist-sync` (SAFE_HREF const pair no longer found in features/theme/static-render).
8. **Product behaviour (REAL)** — `features/seo/index.ts` createSeoDeps loses its receiver (`transform-repo:[object Object]` vs `og`, test line 67); bundled tovu-theme `SKILL.md` cites retired `media_list_assets`; publish-site route returns 500 not 409 (publish-site.tw4.pins.test.ts:53); visitor-executor-confirmation hangs to the 600 s test timeout.
9. **ENV (6)** — `file:` comparator in release-manifests/sdk-public-api (my local override), `Cannot redefine property: constants` (script-inventory + mutation-cli characterization; Node 24.22 frozen fs namespace), openapi-contract-fixtures needs isolated HOME, repair-site needs real site-dir, plugin-install-real-site SIGTRAP (flaky).
10. **Other STALE** — fly `credential-schemes.test.mjs` imports deleted `features/custom-credentials/auth-schemes.ts`; agent-probe pin lacks `discoveryPending`; af-cli outbox wording; provider-plugins identity pin; declared-tool-keywords `fly: credential_save`; dead-path-sweep flags `?characterization` imports and `sonarjs/…` strings in check-admin-complexity-drift.ts.

### 1.2 Other suites
- **Admin** `src/features/auth/__tests__/login-default-credential.unit.test.tsx:13` — `expect(seed).not.toBeNull()`; test greps `../website/src/features/identity/wiring.ts` for `export const DEFAULT_OWNER_PASSWORD`, which now lives in `platform/site-dir/new-site-owner.ts:10`. Alone: FAIL → **STALE** (test path). Previous admin failures (describeApiError) are fixed.
- **Desktop** `src/renderer/site-error-feedback.test.ts:82-88` "D-24: Add feedback stays on the websites view…" — `ReferenceError: appScreen is not defined`; `renderer/App.tsx:51` added `function appScreen` which the source-test-harness (`source-test-harness.ts`) does not extract. Alone: FAIL → **STALE** harness.
- **Jini ui** `src/features/mcp-ui/__tests__/surfaces/structured-details.test.ts:103` "treats reordered objects as unchanged…" — expected group text `Removed`, got `ArrayBefore1, 2After2, 1EmptyBefore—After—`. Alone: FAIL → **REAL/STALE** (null→null field rendered as changed Empty with no `Removed` group; renderer vs test — verify).
- **Jini test:scripts** — 3 node tests in `scripts/__tests__/integration/infra-retirement.integration.test.ts` fail: they scan `/home/user/Tovu` and find `@jini-ai/infra/events/outbox` imports in `apps/website/src/contracts/core/events/{enqueue-only-outbox,jini-outbox-adapter}.ts` (+ manifests, infra workspace still present). **REAL** (cross-repo state; same as first pass).
- **Jini coverage-threshold exits (10 pkgs)** agent-runtime (99.89/99.49 vs 99.9/99.9), desktop-host (branches 99.3<100), diagnostics (L94.74), http-kit (B99.19), infra (B99.02), integrations, mcp, platform (F99.65), sandbox, server — all tests pass; failures are the threshold gate only.

### 1.3 Jini `pnpm guard` — 18 violations
L0-unlisted-package ×4 (cookie-consent not in layer table; provider-plugins→cookie-consent ×3), L1-layer-edge ×3 (diagnostics→analytics L2→L4 ×2; user-management→ui L4→L5), SI-domain ×4 + SI-resolution ×1 (cookie-consent `./client`/`./server`/`./node` reach `policy.ts`/`plugins.ts`; `./client.min.js` has no source), SI-domain ×1 (db owner-store → migrate/ddl), SI-dependency ×1 (daemon `smol-toml` should be optional peer), HW3-module-state ×2 (desktop-host electron-url-capture.ts, ui InfoTip.hooks.tsx), HW2-vendor-adapter ×2 (mcp server/stdio-hosting.ts). Full: `raw/jini-guard.log`.

### 1.4 typecheck:tests — 56 errors (raw/tc-tests.log)
TS2345 ×31 (site-backup/import-* fixtures — cause 1 above; process-root-parity, create-site-route-deps), TS7016 ×11 (`jsdom` has no declaration file — `@types/jsdom` not resolvable here, ENV), TS7006 ×4, TS2322 ×3, TS2305 ×2 (site-consent), TS2339 `sha256` missing on media list item (assistant/__tests__/tool-registrations.media.test.ts:292), TS2353 `limit` not in `{query}` (library-save-text.test.ts:43), TS2571/TS18046/TS2741 ×1 each. Top files: import-backend.unit.test.ts 11, import-download.integration.test.ts 6, share-database.integration.test.ts 4.


## §2 Coverage gaps
Method: 8 shard lcov files merged (sum of DA/BRDA/FN hits; `raw/tovu-lcov-merged.info.gz`); all-files via `npm run coverage:all-files` (`raw/coverage/coverage-all-files.{json,md}`). **Caveat:** `classify-coverage-gaps.ts` expects separate unit and integration lcov; both were fed the same merged file, so its tier verdicts (451 of 492 route files "below tier threshold": 188 ARCHITECTURE_DEBT, rest TEST_GAP; `raw/classify-coverage-gaps.log`) are pessimistic/not comparable to CI. Route numbers: floor passes (L99.92 B79.81 F98.98), totals 35 806 route lines, 28 uncovered; the real gap is branches (3 691 uncovered; `routes/site/pages.ts` alone 518). Per-file table: `raw/route-coverage-per-file.json` (333 rows).
### Top 50 route files by uncovered lines (then branches)
| file (under apps/website/src/server/) | L% | B% | F% | uncov lines | uncov branches | uncov funcs |
|--|--|--|--|--|--|--|
| inbound/admin-http/routes/system/observability-status.ts | 92.86 | 83.78 | 100 | 6 | 6 | 0 |
| inbound/admin-http/routes/members/request-magic-link.ts | 97.44 | 82.93 | 83.33 | 3 | 7 | 1 |
| inbound/admin-http/routes/system/publish-site.ts | 99.58 | 75.9 | 100 | 2 | 60 | 0 |
| inbound/admin-http/routes/system/site-key.ts | 99.68 | 80.8 | 90 | 2 | 43 | 4 |
| inbound/public-http/routes/site/search.ts | 98.85 | 77.45 | 94.12 | 2 | 23 | 1 |
| inbound/admin-http/routes/posts/autosave.ts | 98.97 | 81.65 | 100 | 2 | 20 | 0 |
| inbound/public-http/routes/members/oidc-deps.ts | 98.11 | 74.19 | 100 | 2 | 16 | 0 |
| inbound/public-http/routes/agent-plugin-surfaces/export-files.ts | 96.88 | 74.36 | 100 | 2 | 10 | 0 |
| inbound/public-http/routes/members/oidc-start.ts | 95.65 | 81.25 | 100 | 2 | 3 | 0 |
| inbound/admin-http/routes/pages/delete.ts | 99.25 | 80.85 | 100 | 1 | 9 | 0 |
| inbound/admin-http/routes/plugins/provider-settings.ts | 99.28 | 90.63 | 95 | 1 | 9 | 1 |
| inbound/public-http/routes/members/oidc-callback.ts | 98.95 | 78.57 | 100 | 1 | 9 | 0 |
| inbound/admin-http/routes/system/browser-telemetry.ts | 99.36 | 95.59 | 100 | 1 | 3 | 0 |
| inbound/admin-http/routes/system/mail-activity.ts | 99.15 | 97.62 | 92.86 | 1 | 1 | 1 |
| inbound/public-http/routes/site/pages.ts | 100 | 79.01 | 99.24 | 0 | 518 | 1 |
| inbound/admin-http/routes/themes/explore.ts | 100 | 74.52 | 100 | 0 | 184 | 0 |
| inbound/public-http/routes/site/media-rendition.ts | 100 | 76.13 | 100 | 0 | 106 | 0 |
| inbound/admin-http/routes/system/sites.ts | 100 | 65.12 | 94.12 | 0 | 98 | 1 |
| inbound/admin-http/routes/publish-content/import.ts | 100 | 58.22 | 100 | 0 | 94 | 0 |
| inbound/admin-http/routes/system/publish-credentials.ts | 100 | 70.27 | 100 | 0 | 55 | 0 |
| inbound/admin-http/routes/publish-content/bundle-create.ts | 100 | 74.65 | 100 | 0 | 54 | 0 |
| inbound/admin-http/routes/publish-content/peer-transport.ts | 100 | 74.13 | 100 | 0 | 52 | 0 |
| inbound/admin-http/routes/system/custom-credentials.ts | 100 | 75.57 | 100 | 0 | 43 | 0 |
| inbound/admin-http/routes/media/upload.ts | 100 | 74.84 | 100 | 0 | 40 | 0 |
| inbound/admin-http/routes/pages/update.ts | 100 | 66.36 | 100 | 0 | 37 | 0 |
| inbound/public-http/routes/api-connections/oauth-callback.ts | 100 | 73.53 | 100 | 0 | 36 | 0 |
| inbound/admin-http/routes/posts/update.ts | 100 | 66.34 | 100 | 0 | 34 | 0 |
| inbound/admin-http/routes/publish-content/backstop.ts | 100 | 83.65 | 93.94 | 0 | 34 | 2 |
| inbound/admin-http/routes/menus/update-tree.ts | 100 | 63.33 | 100 | 0 | 33 | 0 |
| inbound/admin-http/routes/trash/list.ts | 100 | 74.8 | 100 | 0 | 31 | 0 |
| inbound/admin-http/routes/assistant/detect-agents.ts | 100 | 76.74 | 100 | 0 | 30 | 0 |
| inbound/admin-http/routes/trash/restore.ts | 100 | 74.79 | 100 | 0 | 30 | 0 |
| inbound/admin-http/routes/widgets/agent-tools.ts | 100 | 78.26 | 100 | 0 | 30 | 0 |
| inbound/admin-http/routes/plugins/set-enabled.ts | 100 | 76.03 | 100 | 0 | 29 | 0 |
| inbound/admin-http/routes/users/update.ts | 100 | 70.41 | 100 | 0 | 29 | 0 |
| inbound/admin-http/routes/widgets/region-mutate-placements.ts | 100 | 71.11 | 100 | 0 | 26 | 0 |
| inbound/admin-http/routes/media/original.ts | 100 | 78.26 | 100 | 0 | 25 | 0 |
| inbound/admin-http/routes/system/source-control-credentials.ts | 100 | 80 | 100 | 0 | 25 | 0 |
| inbound/admin-http/routes/taxonomy/assign-terms.ts | 100 | 75 | 100 | 0 | 25 | 0 |
| inbound/public-http/routes/publish-trust/handshake.ts | 100 | 75 | 100 | 0 | 25 | 0 |
| inbound/public-http/routes/site/comments-submit.ts | 100 | 73.96 | 100 | 0 | 25 | 0 |
| inbound/admin-http/routes/newsletter/update-campaign.ts | 100 | 71.95 | 100 | 0 | 23 | 0 |
| inbound/admin-http/routes/comments/moderate.ts | 100 | 75.82 | 100 | 0 | 22 | 0 |
| inbound/admin-http/routes/media/update.ts | 100 | 69.86 | 100 | 0 | 22 | 0 |
| inbound/admin-http/routes/settings/events.ts | 100 | 85.99 | 100 | 0 | 22 | 0 |
| inbound/admin-http/routes/settings/shared.ts | 100 | 86.25 | 100 | 0 | 22 | 0 |
| inbound/admin-http/routes/trash/items.ts | 100 | 75.28 | 100 | 0 | 22 | 0 |
| inbound/admin-http/routes/recovery/restore.ts | 100 | 77.42 | 100 | 0 | 21 | 0 |
| inbound/public-http/routes/members/complete-sign-in.ts | 100 | 73.08 | 100 | 0 | 21 | 0 |
| inbound/admin-http/routes/posts/create.ts | 100 | 77.53 | 100 | 0 | 20 | 0 |

### Jini files under 100% (218; full list `raw/jini-files-under-100.json`; top 60 by uncovered lines excl. commerce and tests)
commerce has 60 files at 0% (src/payments/**, src/catalog/**: 4 020 uncovered lines; package has only 3 test files/9 tests). provider-plugins reports 2.08% lines (46 345 uncovered) — the package total includes built plugin bundles that my file list excludes, so treat that package-level number as an artefact (branches 96.74%).
| pkg | file | L% | B% | F% | uncov lines |
|--|--|--|--|--|--|
| ui | scripts/generate-agent-icon-data-uris.mjs | 0 | 0 | 0 | 77 |
| core | src/args-convention.typecheck.ts | 0 | 0 | 0 | 43 |
| vibecoding | src/node/project.ts | 85.96 | 84.86 | 73.46 | 40 |
| ui-kit | scripts/headless-smoke.mjs | 0 | 0 | 0 | 29 |
| agent-plugins | core/persistent-state.d.ts | 0 | 0 | 0 | 25 |
| vibecoding | src/node/store.ts | 94.83 | 86.17 | 100 | 19 |
| admin | src/browser/telemetry.ts | 85 | 89.36 | 91.66 | 12 |
| plugins | src/host/provider-host.ts | 93.64 | 89.39 | 88.46 | 11 |
| db | src/owner-store/migrations/0000_owner_store.ts | 0 | 0 | 0 | 9 |
| plugins | src/host/node/module-snapshot.ts | 94.15 | 96.2 | 94.73 | 9 |
| ui | src/features/panel-kit/fetch-query/binding.react.tsx | 70.96 | 100 | 87.5 | 9 |
| agent-runtime | src/ai-trace/recorder.ts | 96.46 | 89.51 | 93.1 | 7 |
| cms | src/media/provenance.ts | 77.77 | 73.68 | 100 | 6 |
| agent-runtime | src/claude-filesystem-policy.ts | 96.71 | 94.33 | 93.33 | 5 |
| plugins | src/host/node/discovery.ts | 97.5 | 98.11 | 100 | 5 |
| agent-plugins | src/lifecycle/resolve-agent-plugin-refs.ts | 96.68 | 98.68 | 100 | 5 |
| db | src/migrate/ddl.ts | 16.66 | 100 | 0 | 5 |
| agent-plugins | src/lifecycle/set-enabled.ts | 93.65 | 88.23 | 100 | 4 |
| provider-plugins | scripts/build.ts | 96.26 | 92.3 | 100 | 4 |
| server | src/owner-store/backup.ts | 96.22 | 93.47 | 100 | 4 |
| provider-plugins | src/observability-opentelemetry/index.ts | 94.87 | 98.86 | 100 | 4 |
| core | src/filesystem.ts | 0 | 100 | 100 | 4 |
| db | src/owner-store/migrations/index.ts | 0 | 0 | 0 | 3 |
| mcp | src/bin/serve.ts | 97.97 | 97.29 | 100 | 3 |
| vibecoding | src/html/node/parse5-region-parser.ts | 98.19 | 97.82 | 100 | 3 |
| plugins | src/host/node/package-files.ts | 98.21 | 97.91 | 100 | 3 |
| plugins | src/host/hook-registry.ts | 98.32 | 98.66 | 100 | 3 |
| daemon | src/agent-executor/events.ts | 99.57 | 98.92 | 98.3 | 3 |
| agent-plugins | src/lifecycle/activation.ts | 99.17 | 99.5 | 98.11 | 3 |
| daemon | src/remote-attachment-lookup.ts | 96.42 | 80.76 | 100 | 2 |
| agent-runtime | src/ai-trace/capture.ts | 92.3 | 84.21 | 100 | 2 |
| daemon | src/http/message-relay.ts | 92.3 | 90 | 75 | 2 |
| desktop-host | src/electron/electron-url-capture.ts | 98.55 | 90.9 | 100 | 2 |
| diagnostics | src/observability/telemetry-test.ts | 93.93 | 92.59 | 100 | 2 |
| mcp | src/server/stdio-hosting.ts | 98.62 | 93.68 | 100 | 2 |
| daemon | src/agent-executor/live-session-state.ts | 98.33 | 96.07 | 100 | 2 |
| cms | src/forms/email-sender-fields.ts | 95.34 | 96.55 | 100 | 2 |
| cms | src/navigation/tool-registrations.ts | 98.57 | 98.38 | 100 | 2 |
| platform | src/asset-cache.ts | 99.11 | 98.4 | 100 | 2 |
| cookie-consent | src/client/index.ts | 98.82 | 100 | 96.55 | 2 |
| db | src/owner-store/index.ts | 0 | 0 | 0 | 1 |
| server | src/owner-store/index.ts | 0 | 0 | 0 | 1 |
| vibecoding | src/node/index.ts | 0 | 0 | 0 | 1 |
| plugins | src/host/quarantine.ts | 96.55 | 50 | 100 | 1 |
| daemon | src/remote-tool-executor.ts | 99.41 | 93.61 | 96.15 | 1 |
| sandbox | src/e2b/wrap-e2b-sandbox.ts | 99.61 | 98.38 | 100 | 1 |
| cms | src/consent/node/index.ts | 99.28 | 99.07 | 100 | 1 |
| integrations | src/credentialed-http/credentialed-request.ts | 99.66 | 99.4 | 100 | 1 |
| daemon | src/agent-executor/launch.ts | 99.87 | 99.55 | 100 | 1 |
| daemon | src/tool-recovery/analytics.ts | 100 | 45.45 | 50 | 0 |
| db | src/kernel/owned-transaction.ts | 100 | 50 | 100 | 0 |
| plugins | src/host/node/provider-artifact.ts | 100 | 75 | 100 | 0 |
| agent-runtime | src/ai-trace/sinks.ts | 100 | 76.74 | 94.11 | 0 |
| server | src/owner-store/legacy.ts | 100 | 83.33 | 81.81 | 0 |
| cms | src/media/plugins/document-text/unpdf.ts | 100 | 85.71 | 100 | 0 |
| cms | src/redirects/path-key.ts | 100 | 85.71 | 100 | 0 |
| provider-plugins | src/analytics-posthog/browser.ts | 100 | 85.71 | 66.66 | 0 |
| plugins | src/host/provider-settings-migrations.ts | 100 | 87.5 | 100 | 0 |
| db | src/migrate/legacy-ledger.ts | 100 | 88.57 | 100 | 0 |
| agent-plugins | src/admin-surfaces/action-tools.ts | 100 | 90 | 100 | 0 |

## §3 Complexity
- **Tovu** `npm run complexity:strict`: 3124 files, 1280 messages, 0 fatal. Core rules: `complexity` 5 + `sonarjs/cognitive-complexity` 6 — **all in migrations** 0006_submission_ip_retention (cog 19), 0011_drop_empty_core_commerce_tables (cx 16/cog 13), 0012_secrets_vault (up cx 29/cog 21; insertMapped 15/13; metadata 12; l.220 cog 12), 0013_unify_vault_credentials (cx 13/cog 20). So **0 outside old migrations**. Rest is the full sonarjs set enabled by the strict config: no-nested-conditional 156, expression-complexity 148, no-inconsistent-returns 125, no-nested-template-literals 109, no-redundant-optional 105, no-duplicate-string 85, too-many-break-or-continue 73, super-linear-regex 59, elseif-without-else 55, nested-functions 45, hardcoded-passwords 44 (test-ish constants), … (`raw/tovu-complexity-violations.json`; the 15 MB raw eslint JSON was reduced to this file).
- **Jini** `pnpm run complexity:strict`: **ABORTED** exit 2 — `ESLint: 10.8.0 — A configuration object specifies rule "sonarjs/cognitive-complexity", but could not find plugin "sonarjs"` (`raw/jini-complexity.stdout`). Retried once with `npx eslint` + the repo config, ts/tsx-only globs: same error. Fallback (not what the script measures): same flags but only `--rule complexity:10` over `packages/*/src/**/*.{ts,tsx}` + cms/forms → **1 violation**: `packages/cms/src/media/list-page.ts:13 listOptions complexity 11` (3135 files; `raw/jini-complexity-cyclomatic-only.json`). Cognitive complexity for Jini: **not measured**.

## §4 Architecture
- `check:boundaries` (dependency-cruiser, apps/website/src): exit 167, **583 violations (167 errors, 416 warnings)**, 5563 modules, 36 796 deps. Errors by rule: no-deep-imports:platform/site-dir 41, :features/theme 32, :features/media 28, :features/post 22, :platform/routing 18, :features/deployments 10, domain-no-direct-assistant-tool-registration 3 (features/agent-plugins/{automatic-agent-plugins→ask-choice-tool, apply-connect-defaults→assistant/index, access-token-tool→assistant/index}); warnings: no-circular 136, no-deep-imports:contracts/headless 77, :assistant 51, only-composition-constructs-concrete-adapters 36. (`raw/arch-boundaries.log`)
- `check-architecture.ts`: **FAILED** (1 hard metric). 1980 prod files, 73 modules: cross-feature edges 447, propagation cost 15.55% all-import (baseline 15.52, ratchet warning) / 3.07% runtime (3.06), back-edges into composition root 0, mutual module cycles 5, **largest runtime SCC 22 (was 28)**, module API surface 821, deep-import edges 2643, bidirectional hubs 16.92% (335/1980). New cross-feature edges flagged: `asset-transfer/asset-destinations.ts → media/library-save-attachment.ts`, `asset-transfer/copy-tool.ts → media/document-archive.ts`. (`raw/arch-check.log`)
- **madge --circular**: apps/website/src **28** cycles (18 SCCs, largest 9 files: assistant/{host-contracts, tool-registrations, tool-contribution-registry, index, byok-tool-surface, external-mcp-connection-source, duplicate-resource-registry}.ts + features/agent-plugins/{federate-mcp, tool-registrations}.ts); apps/admin/src 97 cycles and apps/desktop/src 90 cycles, each with a 78-file SCC that is the same website `assistant`/`agent-plugins` cluster pulled in through cross-app imports (members listed in `raw/madge-scc-*.json`). Admin/desktop own-code cycles were not separated out.

## §5 NOT RUN / limits
- Playwright/e2e, Docker, deploys — not in scope. Chromium symlinks done but unused.
- node:test per-file 600 s guard implemented as `--test-timeout=600000` per shard process, not a per-file kill (one test hit it: visitor-executor-confirmation). No shard needed the 5400 s outer timeout.
- Tovu route coverage uses merged lcov for both unit and integration tiers (see §2); `check:route-coverage-diff` not run.
- Desktop and admin: admin coverage via vitest only (L99.41 B98.41 F98.74); desktop has no coverage collection, so apps/desktop shows NEVER-LOADED in all-files.
- Jini cognitive complexity (see §3); Jini per-package coverage is vitest v8 summary (raw/jini-pkg/*-cov).
- `npm run typecheck` includes e2e; `typecheck:scripts` run too. `development/coverage/` (merged lcov) and tests' stray files (`chat.db`, `sites/tovu-dev/{agent-plugins,consent-receipts}`) are untracked local artefacts, not committed.
- ≈2h of the 4h cap used; no cap was hit.
