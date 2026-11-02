# Cloud FIX session — integ/demo-fixes (2026-11-02)

Wall clock: start 21:14 UTC; this report written ~22:10–22:40 UTC (cap 120 min). Node v24.22.2, pnpm 10.33.2. Subagents used: 6 total, never more than 3 at once.
Both repos are on `integ/demo-fixes` only; nothing was pushed to main. Setup followed the brief: Jini `pnpm install` (lockfile unchanged) and `pnpm --no-bail -r build`; Tovu `npm ci` with the temp-package.json trick (`package.json` clean afterwards), sdk build, `link:jini` → /home/user/Jini/packages, compose, Electron binary (installed by the desktop agent).

Notes on the setup:
- Tovu has no `AI-Dev-Shop/`. Jini's exists. This was a structured dispatch, so the AI-Dev-Shop startup was skipped under that file's own scope rules.
- The charts-recharts payload on disk was built at the unreleased **0.6.19** version: `package.json` was bumped only for that build and then restored, never committed. The Tovu pin is the integrity map of that build. It stays valid only if the release builds the same bytes.

**PUSH STATUS: see the end of this file.**

## PART A — YC-demo fixes

| # | item | result |
|---|---|---|
| A1 | banner off by default | **FIXED** Tovu `4fe15ba07` (completes WIP a428f27af). `SITE_CONSENT_DEFAULTS.enabled=false`; explicit owner choice / published policy still wins; readiness + ensure-privacy-defaults never force it on; deploy preflight returns null for a never-chosen site. Test "fresh site → no banner; saved enabled:true → Jini banner" in `features/consent/__tests__/adapters.test.ts`. Tests pinning the old default updated (theme-page-preview, site-inspection tool-registrations, analytics-providers, pages.edge-paths, app.consent-capture, publish-site-route). 49/49 touched files' tests green |
| A2 | model picker friendly names + Escape | **FIXED** Jini `5bdc984b` (WIP 7ecffbb9a already held the fix; RED proven by restoring the pre-WIP sources: 12 failures → GREEN 60/60) |
| A3 | chat tool rows shown twice (`mcp__jini__X` + `X`) | **FIXED** Jini `96956860`. Cause: `@jini-ai/mcp` normalizes arguments (integer strings, aliases, `input` nesting), so the existing exact-input fold missed the pair. A second pass pairs a direct `mcp__<server>__X` call by name with the first unclaimed bridge `X` row between the call and its result, for any server name. A failed call never pairs with one that succeeded. 4 new tests (RED → GREEN); chat 523/523 |
| A4 | composio file-lock timeout every boot | **FIXED** Jini `3ea0fbc1`, `799ae5e7` (root cause inferred from code; not reproduced live — no Mac / fake-test-site here). The plugin state lock (`staleMs: Infinity`) never reclaimed a holder recorded under another hostname spelling (`LAs-MacBook-Pro.lan` vs `.local`). A dead holder from the same machine and the same boot (first hostname label plus boot id, or `acquiredAt` after the boot) is now reclaimed. Live owners and other machines are never evicted. The agent-plugins node port now supplies `bootIdentity`. New tests: `platform/src/fs/__tests__/file-lock.hostname-variants.test.ts` and `agent-plugins/.../stale-plugin-lock.unit.test.ts`, both RED (`FileLockTimeoutError`) → GREEN |
| A5 | theme rebuilt in place / switched live without a card | **FIXED** Tovu `d97484470`: `theme_set_active` now needs the confirmation card (`publish`/`policy`). Tovu `475896fd9`: `theme_write_file` asks only when it would overwrite an existing file with different bytes, and keeps the old bytes as a restorable revision in the theme's existing `.trash/<ms>/` (reused mechanism), returned as `previousRevision`. A built theme warns "There is no undo". New and identical writes do not ask. Tests RED → GREEN; 265/265 across every `theme_write_file` test file |
| A6 | summary named header links the header doesn't show | **FIXED** Tovu `5785fbf76`. The header already renders the site menu. `content_post_create` (page) now returns `headerNavigation` (header = site menu; add via `menus_update_menu_tree`; name links only from `menus_list_menus`), and its description and the Themes site-guide card say the same. Test RED → GREEN 3/3 |

## PART B — cloud test-run failures

| # | item | result |
|---|---|---|
| B1 | provider-plugins charts build | **FIXED** Jini `fddacaaa` (glob `src/charts-*/**/*`, plus the TS1230 it then exposed in `charts-echarts/descriptor.ts`). Build emits `plugins/charts-*`. Catalog regenerated + committed Jini `3fe42c13`; plugin-catalog vitest 56/56. Tovu real integrity map committed Tovu `7c596d29e` (recharts-package-pin 7/7). Cascade: browser-provider.integration PASS; registry/installed-* deploy tests fixed (harness, see B7/B8); provider-plugins artifact.integration harness fixed Jini `f4216ce2` (loader requires a built-in approved record for browser providers since 6cb5190b). **Still failing:** see the list below |
| B2 | forms-receiver apostrophe | **FIXED** Jini `1e895f26` (18/18) |
| B3 | check-plugin-isolation slide-design | **FIXED** Jini `c27c4480`. The gate already refuses a package under the retired name; the test now pins the refusal it really gets ("unexpected packed file"). 63/63 |
| B4 | recharts provider.test alias identity ×3 | **FIXED** Jini `27a1c1e7`. Aligned with d3064f3: aliases keep generic selection, so they no longer share the provider entry's component. It mirrors the ui react-host test |
| B5 | guard 7 violations + 30 stale debt | **FIXED**. N1 "Tovu" comments: Jini `6250cfe0`. R2 deep import: `9cc4fe02`. SI-domain: `2bc07611` (backup-policy registered as shared source, same as `checked-state.ts`). HW3: ECharts description ids now come from the chart instance, Jini `ebc9e988` (+ test). The composer folder-draft map was recorded under the reviewed draft-cache singleton debt and the 30 stale entries were dropped, Jini `79caee65`. `pnpm guard` → **ok, zero violations** |
| B6 | guard:plugins:packed cookie-consent banner.js | **FIXED** Jini `0e6059bf`. False positive: `render` is also a plugin id. Core packages are checked only at payload roots (root folder / `plugins/<id>`). New test RED → GREEN. `pnpm guard:plugins:packed` → **exit 0** |
| B7 | publish-site-route (20), tool-registrations.contracts six providers, stock-content-dirs | **FIXED (harness)**. The hosting plugins now ship from `@jini-ai/agent-plugins`, but the tests read only `content/agent-plugins`. New sync side-effect fixture `apps/website/src/features/agent-plugins/__tests__/fixtures/composed-bundle-env.ts`. Tovu `eae23d626` (publish-site-route 34/34), `6f2d4f7b3` (contracts 36/36), `d2335b3f5` (stock-content-dirs 7/7: resolver moved to product-root; build copies overlays) |
| B8 | the listed Tovu failures | **FIXED**, all of them. Tovu `c76b78357` deploy-config-command (2). `f10301ea2` descriptor-i18n. `ea5262543` higgsfield failure-modes (host strings live in Tovu's overlay). `8151caae9` comments newId (port is `ids`). `90d539c05` render.test menu rel policy. `8851fac09` **product**: the WebMCP injector also skips `/theme-preview-assets` (fixes theme-static-assets-live-roster). `09bdc1056` site-title AC-12. `c982028bb` TOVU_MEDIA_BLOB_STORE s3. `60d17b9af` skill-supporting-files. `44420ae72` desktop-portable. `3a383f66f` tool-search "is github connected", github and higgsfield tool-discovery. `c668ede16` google-workspace host-token-refusals. `b491d9ecb` registry + installed-deploy-verb. `66fb3f1f9` railway/render installed-deploy, fly installed-observe-only, github installed-deploy-verb. Fly workflow parity = EXPECTED (left) |
| B9 | check-hardwiring parse error coverage-floors.ts:273 | **FIXED** Tovu `aa2a95822` (a `**/` inside a JSDoc closed it early). The checker now parses and reports its real findings (25 violations + 38 stale debt; not in scope, listed below) |
| B10 | Tovu desktop | DESKTOP_PLACEHOLDER |
| B11 | `tsc -p tsconfig.tests.json` (80 errors) | **FIXED for changed files**: 0 errors in files changed vs origin/main. Tovu `e6e2148e0` adds `.d.mts` for `agent-plugin-source.mjs` / `dev-sites-home.mjs`, fixing TS7016 in 39 files. `5b8e68d1d` fixes 3 files; the B8/desktop agents fixed others. 37 errors remain, all in unchanged files (pre-existing, listed in raw) |
| B12 | complexity:strict in changed files | CX_PLACEHOLDER |

## Still failing (file — test — first error)
STILLFAILING_PLACEHOLDER

## New bugs / noticed, not fixed
NOTICED_PLACEHOLDER

## Push status
PUSH_PLACEHOLDER
