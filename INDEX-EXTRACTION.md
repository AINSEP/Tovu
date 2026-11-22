EXTRACTION PLAN PARTIAL: 1,938 of 2,509 Jini-bound files are blocked and have no move steps until the owner answers K1–K5 (plans/P9-extraction.md §K); SEC-1…n wait for the SEC-0 parity report; apps/site-chat was not measured

# INDEX — P9 Tovu → Jini extraction

Bases: Tovu `integ/merge-12-2026-11-22` `748c032db` (merge-11 `311d26dfa` + seed-upgrade, err1, bugs3a, bugs3b, howto2, all verified contained); Jini `integ/merge-12-2026-11-22` `6b8e0d48a`. Plan: `plans/P9-extraction.md`. Step sheets: `plans/P9-steps/<step>.md` (one per J/T pair; SH in `SH-shells-1.md`). Appendices: `plans/P9-data/` (blocked files with reasons, files that stay in Tovu, generator tools), `plans/P9-BREAKS.md` (156 product-literal renames the moves create).

**Headline:** 2,509 Jini-bound files (344K LOC) are still in Tovu. **550** move verbatim now in 93 generated steps, and **21** re-export shells are deleted in SH-1/SH-2. **1,938** are blocked: 690 import Tovu-kept code (mostly `RouteDeps` and the shared route helpers), 579 would add a Jini cross-package edge (mostly `admin → ui`), and 669 are blocked through those. Tonight (N1–N5, 4–6 implementers) brings the count to **≈ 2,419** and lays the contracts base the T/P/D/U/X lanes need.

## Files left per area (Tovu merge-12, non-test source files)

| area | Tovu dirs measured | Jini-bound files left in Tovu | LOC | re-export shells to delete | verbatim-movable now | blocked: imports Tovu-kept code | blocked: would add a Jini cross-package edge | blocked: only through blocked deps | files with Tovu words | stays in Tovu (files) | goes to | stays in Tovu and why |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| themes | theme, adm-themes | **111** | 23623 | 0 | 27 | 5 | 15 | 64 | 35 | 0 | theme engine, validation, preview, theme files → `@jini-ai/cms/themes/site/*`; admin Themes screen → `@jini-ai/admin/themes` | composition binding (`server/runtime/composition/modules/*theme*`), Tovu starter-theme seeding (`platform/site-dir/seed-site-themes.ts`), product literals (`data-tovu-*` rename → P9-BREAKS) |
| publish-content | publish-content, publish-content-ui, publish-trust, adm-publish-content | **83** | 17335 | 0 | 19 | 14 | 9 | 41 | 33 | 1 | bundle/apply/peer engine → `@jini-ai/cms/publish/*`; dialog UI → `@jini-ai/admin/publish-content` | `tovu-publish-ports.ts` (the host's port bag, product-named), peer vault owner key `"tovu"` policy, composition |
| post | post, adm-posts | **110** | 19183 | 0 | 24 | 14 | 12 | 60 | 11 | 0 | post model/services → `@jini-ai/cms/posts/*`; Posts screen → `@jini-ai/admin/posts` | post-kind/author product rules in `contracts/core` that carry Tovu policy; composition |
| newsletter | newsletter | **25** | 5557 | 0 | 2 | 5 | 6 | 12 | 2 | 0 | → `@jini-ai/user-management/newsletter/*` (beside members, which import it) | sender identity/product mail copy; composition |
| site-backup | site-backup | **44** | 6979 | 0 | 2 | 16 | 18 | 8 | 26 | 0 | → `@jini-ai/devops/backup/site/*` | site-folder layout reads (`platform/site-dir`, Tovu product), `.tovu/` managed-file names until RN |
| deployments | deployments, adm-deployment | **70** | 15019 | 0 | 11 | 12 | 21 | 26 | 30 | 0 | → `@jini-ai/devops/deploy/site/*`; Deployment screen → `@jini-ai/admin/deployment` | vendor credential labels (product copy in `@tovu/contracts`), composition |
| security (admin → Jini admin/security) | adm-security | **39** | 8514 | 0 | 4 | 11 | 8 | 16 | 10 | 0 | SWAP, not move: port the Tovu-only behaviour into the existing `@jini-ai/admin/security` (22 files), then delete Tovu's | nothing after the swap except the screen's mount in `panels.tsx` |
| rendering/routes | public-http, admin-http | **470** | 47832 | 0 | 30 | 348 | 41 | 51 | 114 | 0 | → `@jini-ai/cms/public-http/*`, `@jini-ai/cms/admin-http/*` (route handlers) | route registration + `RouteDeps` (`server/routes/types.ts`, 1,490 lines, owner 11-20 dropped re-wiring) — blocks 133 route files directly |
| admin screens (other) | adm-other, adm-pages, adm-recovery, adm-source-control, adm-members, adm-users | **485** | 88539 | 0 | 98 | 72 | 127 | 188 | 80 | 122 | → `@jini-ai/admin/<feature>` screens on the injected kit | assistant dock, dashboard, sites switcher, playground, voice input (product screens, 122 files) |
| admin shell/transport/roles | adm-shell-lib, adm-shell-hooks, adm-shell-components, adm-roles | **267** | 33425 | 1 | 80 | 43 | 89 | 54 | 68 | 2 | `lib/` transport (`api.ts`, `admin-http`) and shell components → `@jini-ai/admin/shell/*`; roles → `@jini-ai/admin/roles` | `App*.tsx`, `nav.ts`, `panels.tsx`, admin themes/styles (product look), product i18n strings |
| desktop | desktop | **17** | 1085 | 0 | 12 | 3 | 2 | 0 | 11 | 235 | generic Electron shell pieces (find-in-page, spellcheck, auto-update, durable JSON, PTY helpers, instance presence, toolchain, asar verify, memory sampler, speech, backslide guard, app-version IPC, staleness) → `@jini-ai/desktop-host/shell/*` | packaging, site management, owner store, tovu-server, project IPC, release notes (235 files) |
| users U (members, member-login) | members, member-login | **32** | 5043 | 1 | 4 | 4 | 9 | 14 | 3 | 0 | → `@jini-ai/user-management/members/*`, `/member-login/*` | member mail copy; composition |
| devops other (source-control, site-export, domain-dns) | source-control, site-export, domain-dns | **40** | 5564 | 0 | 9 | 8 | 15 | 8 | 13 | 0 | → `@jini-ai/devops/{source-control,static-export,dns}/site/*` | vendor credential labels; composition |
| shared contracts + platform helpers | contracts-core, contracts-headless, platform-html, platform-routing, platform-mail, presentation | **150** | 7756 | 4 | 92 | 7 | 39 | 8 | 47 | 0 | pure contracts → `@jini-ai/core/contracts/site/*`; per-feature `tool-metadata/<x>.ts` follow their feature; html/routing helpers → `@jini-ai/cms` | product vocabulary with Tovu policy (`@tovu/contracts/*` copy, admin locales) |
| other generic features (X lane) | 53 feature dirs | **566** | 58565 | 15 | 136 | 128 | 168 | 119 | 263 | 12 | media, widgets, settings, taxonomy, entries, navigation, comments, forms, seo, trash, identity, webhooks, credentials, agent-plugins, plugin-runtime, … → their owning Jini package (see `plans/P9-data/tools/plan.mjs` AREAS) | sites switcher/site guide/site evidence (product), composition |
| **TOTAL** | | **2509** | 344019 | 21 | 550 | 690 | 579 | 669 | 746 | 372 | | |

## Steps

Order: hand lanes first (SH, RT, XC, SEC, S, RN, K), then the generated J/T items in tonight order (N1–N6), then machine-batch order. **Batch** = tonight batch N and/or machine batch number from `plan.mjs`; machine batches run 6-wide (37 batches, about 50 h wall). **Files left after** counts down only on Tovu (T/SH) steps.

| step id | lane | repo | files | depends on | batch (tonight N / machine) | est | Jini-bound files left in Tovu after |
|---|---|---|---|---|---|---|---|
| SH-1 | SH | Tovu | 4 shells (123 importer lines) | — | N1 | 110 min | 2505 |
| SH-2 | SH | Tovu | 17 shells/adapters (123 importer lines) | SH-1 (pushed first) | N1 | 110 min | 2488 |
| RT-1 | RT | Jini | packages/sqlite (delete) + comments | — | N2 | 60 min | (no change) |
| RT-2 | RT | Jini | packages/infra/src/db (3 shims) | — | N3 | 45 min | (no change) |
| RT-3 | RT | Jini | agent-plugins/core/commerce-server.{mjs,d.ts} | — | N3 | 45 min | (no change) |
| XC-1 | XC | Jini | chat→agent-runtime (5 sites) | — | N4 | 100 min | (no change) |
| XC-2 | XC | Jini | chat→diagnostics, chat→db | — | N6 | 80 min | (no change) |
| XC-3 | XC | Jini | agent-runtime→platform/oauth/integrations (7 sites) | — | after N6 | 110 min | (no change) |
| XC-4 | XC | Jini | daemon→agent-runtime/platform (5 sites) | — | after N6 | 100 min | (no change) |
| XC-5 | XC | Jini | integrations→platform, cli→sidecar (4 sites) | — | after N6 | 80 min | (no change) |
| XC-6 | XC | Jini | node-adapters (no step until K5) | K5 | — | — | (no change) |
| SEC-0 | SEC | Tovu (read-only report) | parity table, 39 Tovu vs 22 Jini files | — | N5 | 90 min | (no change) |
| SEC-1…n | SEC | Jini | per missing behaviour group (from SEC-0) | SEC-0 | later | 120 min | (no change) |
| SEC-T1 | SEC | Tovu | swap screen; delete 39 files | SEC-1…n, A-adm-shell-lib-3.J | later | 120 min | −35 |
| S6b.J | S | Jini | webhook-repo.ts (395 LOC) → integrations/webhooks/sql (LOCK: kysely peer) | — | N2–N3 (replaces RT-2/3 if lock cleared) | 110 min | (no change) |
| S6b.T | S | Tovu | 5 importer lines; sqlite binding kept | S6b.J | next T slot | 60 min | (no change) |
| S7a | S | — | DONE (retire; evidence in P9 §2) | — | — | — | (no change) |
| S7b.J | S | Jini | media-repo.ts (725 LOC) → cms/media/sql | X-media-1.J | after X-media-1 | 120 min | (no change) |
| S7b.T | S | Tovu | 12 importer lines; sqlite binding kept | S7b.J | next T slot | 90 min | (no change) |
| RN-J1 | RN | Jini | identity-namespace.ts, plugin-format.ts, allowlist | merge-12 landed on both integ lines | last slot of a night | 100 min | (no change) |
| RN-T1 | RN | Tovu | 4 tovu.plugin.json → jini.plugin.json; extensions.tovu manifests | RN-J1 | after RN-J1 | 90 min | (no change) |
| RN-J2 | RN | Jini | agent-plugins bundles + tests | RN-J1 | after RN-T1 | 110 min | (no change) |
| RN-J3 | RN | Jini | cms/db/plugins/provider-plugins tests | RN-J1 | parallel with RN-J2 | 110 min | (no change) |
| RN-J4 | RN | Jini | remaining packages + examples | RN-J1 | parallel with RN-J2 | 100 min | (no change) |
| K1–K5 | K | owner | decisions that unblock 1,938 files | — | owner, morning | — | (no change) |
| C-contracts-core-1.J | C | Jini | 14 (544 LOC) | — | N1 / 1 | 76 min |  |
| C-contracts-core-2.J | C | Jini | 8 (274 LOC) | — | N1 / 1 | 54 min |  |
| C-platform-html-1.J | C | Jini | 6 (378 LOC) | — | N1 / 1 | 49 min |  |
| C-presentation-1.J | C | Jini | 1 (59 LOC) | — | N1 / 1 | 30 min |  |
| D-site-export-1.J | D | Jini | 3 (215 LOC) | — | N1 / 1 | 35 min |  |
| P-publish-content-ui-1.J | P | Jini | 1 (104 LOC) | — | N2 / 1 | 29 min |  |
| C-contracts-core-1.T | C | Tovu | 14 (544 LOC, 103 importer lines) | C-contracts-core-1.J | N2 / 2 | 111 min | 2474 |
| C-contracts-core-3.J | C | Jini | 11 (545 LOC) | C-contracts-core-1.J, C-contracts-core-2.J | N2 / 2 | 65 min |  |
| C-contracts-headless-1.J | C | Jini | 6 (289 LOC) | — | N2 / 2 | 44 min |  |
| C-presentation-1.T | C | Tovu | 1 (59 LOC, 4 importer lines) | C-presentation-1.J | N2 / 2 | 17 min | 2473 |
| D-site-export-1.T | D | Tovu | 3 (215 LOC, 9 importer lines) | D-site-export-1.J | N2 / 2 | 23 min | 2470 |
| P-publish-content-ui-1.T | P | Tovu | 1 (104 LOC, 5 importer lines) | P-publish-content-ui-1.J | N2 / 2 | 20 min | 2469 |
| C-contracts-core-2.T | C | Tovu | 8 (274 LOC, 120 importer lines) | C-contracts-core-2.J | N3 / 3 | 117 min | 2461 |
| C-contracts-core-4.J | C | Jini | 14 (1200 LOC) | C-contracts-core-3.J | N3 / 3 | 73 min |  |
| C-contracts-core-5.J | C | Jini | 14 (950 LOC) | C-contracts-core-3.J | N3 / 3 | 72 min |  |
| C-contracts-headless-1.T | C | Tovu | 6 (289 LOC, 15 importer lines) | C-contracts-headless-1.J | N3 / 3 | 27 min | 2455 |
| T-theme-1.J | T | Jini | 10 (1393 LOC) | — | N3 / 3 | 72 min |  |
| C-contracts-core-3.T | C | Tovu | 11 (545 LOC, 123 importer lines) | C-contracts-core-3.J | N4 / 4 | 102 min | 2444 |
| C-contracts-core-6.J | C | Jini | 14 (787 LOC) | C-contracts-core-3.J | N4 / 4 | 71 min |  |
| C-contracts-core-7.J | C | Jini | 1 (164 LOC) | C-contracts-core-3.J, C-contracts-core-1.J | N4 / 4 | 31 min |  |
| T-post-1.J | T | Jini | 8 (803 LOC) | C-contracts-core-3.J, C-platform-html-1.J | N4 / 4 | 55 min |  |
| T-theme-1.T | T | Tovu | 10 (1393 LOC, 77 importer lines) | T-theme-1.J | N4 / 4 | 84 min | 2434 |
| C-platform-routing-1.J | C | Jini | 3 (99 LOC) | C-contracts-core-3.J | N5 / 3 | 34 min |  |
| C-contracts-core-4.T | C | Tovu | 14 (1200 LOC, 48 importer lines) | C-contracts-core-4.J | N5 / 5 | 51 min | 2420 |
| C-contracts-core-7.T | C | Tovu | 1 (164 LOC, 20 importer lines) | C-contracts-core-7.J | N5 / 5 | 34 min | 2419 |
| P-publish-trust-1.J | P | Jini | 5 (1312 LOC) | — | N5 / 5 | 61 min |  |
| T-newsletter-1.J | T | Jini | 2 (364 LOC) | C-contracts-core-3.J | N5 / 5 | 35 min |  |
| T-theme-2.J | T | Jini | 8 (1450 LOC) | C-contracts-core-3.J, T-theme-1.J, C-contracts-core-1.J, C-platform-html-1.J | N6 / 4 | 70 min |  |
| P-publish-content-1.J | P | Jini | 11 (1251 LOC) | C-contracts-core-3.J, C-contracts-core-2.J | N6 / 5 | 72 min |  |
| C-contracts-core-5.T | C | Tovu | 14 (950 LOC, 42 importer lines) | C-contracts-core-5.J | N6 / 6 | 43 min | 2405 |
| D-site-backup-1.J | D | Jini | 2 (56 LOC) | C-contracts-core-3.J | N6 / 6 | 31 min |  |
| P-publish-trust-1.T | P | Tovu | 5 (1312 LOC, 46 importer lines) | P-publish-trust-1.J | N6 / 6 | 58 min | 2400 |
| C-platform-routing-1.T | C | Tovu | 3 (99 LOC, 58 importer lines) | C-platform-routing-1.J | 5 | 74 min | 2397 |
| D-deployments-1.J | D | Jini | 9 (683 LOC) | C-contracts-core-3.J | 6 | 63 min |  |
| U-members-1.J | U | Jini | 4 (573 LOC) | C-contracts-core-3.J | 6 | 42 min |  |
| X-media-1.J | X | Jini | 10 (731 LOC) | P-publish-content-1.J | 6 | 65 min |  |
| C-contracts-core-6.T | C | Tovu | 14 (787 LOC, 32 importer lines) | C-contracts-core-6.J | 7 | 35 min | 2383 |
| D-domain-dns-1.J | D | Jini | 2 (201 LOC) | C-contracts-core-3.J | 7 | 34 min |  |
| D-source-control-1.J | D | Jini | 4 (171 LOC) | C-contracts-core-3.J | 7 | 40 min |  |
| X-image-transform-1.J | X | Jini | 1 (171 LOC) | — | 7 | 31 min |  |
| X-media-1.T | X | Tovu | 10 (731 LOC, 33 importer lines) | X-media-1.J | 7 | 43 min | 2373 |
| X-widgets-1.J | X | Jini | 1 (15 LOC) | — | 7 | 34 min |  |
| C-platform-html-1.T | C | Tovu | 6 (378 LOC, 46 importer lines) | C-platform-html-1.J | 8 | 47 min | 2367 |
| T-newsletter-1.T | T | Tovu | 2 (364 LOC, 18 importer lines) | T-newsletter-1.J | 8 | 32 min | 2365 |
| X-image-transform-1.T | X | Tovu | 1 (171 LOC, 1 importer lines) | X-image-transform-1.J | 8 | 16 min | 2364 |
| X-settings-1.J | X | Jini | 7 (785 LOC) | — | 8 | 52 min |  |
| X-taxonomy-1.J | X | Jini | 3 (167 LOC) | C-contracts-core-3.J, C-contracts-core-7.J | 8 | 37 min |  |
| X-widgets-1.T | X | Tovu | 1 (15 LOC, 1 importer lines) | X-widgets-1.J | 8 | 16 min | 2363 |
| T-theme-2.T | T | Tovu | 8 (1450 LOC, 70 importer lines) | T-theme-2.J | 9 | 81 min | 2355 |
| X-analytics-1.J | X | Jini | 2 (223 LOC) | — | 9 | 32 min |  |
| X-consent-1.J | X | Jini | 6 (343 LOC) | C-contracts-core-1.J | 9 | 57 min |  |
| X-entries-1.J | X | Jini | 3 (92 LOC) | C-contracts-core-4.J | 9 | 34 min |  |
| X-navigation-1.J | X | Jini | 5 (363 LOC) | C-contracts-core-5.J | 9 | 42 min |  |
| X-site-search-1.J | X | Jini | 1 (85 LOC) | — | 9 | 28 min |  |
| T-post-1.T | T | Tovu | 8 (803 LOC, 28 importer lines) | T-post-1.J | 10 | 40 min | 2347 |
| X-comments-1.J | X | Jini | 2 (104 LOC) | C-contracts-core-2.J | 10 | 36 min |  |
| X-content-types-1.J | X | Jini | 3 (234 LOC) | C-platform-routing-1.J, C-contracts-core-4.J | 10 | 35 min |  |
| X-navigation-1.T | X | Tovu | 5 (363 LOC, 15 importer lines) | X-navigation-1.J | 10 | 29 min | 2342 |
| X-settings-1.T | X | Tovu | 7 (785 LOC, 52 importer lines) | X-settings-1.J | 10 | 65 min | 2335 |
| X-taxonomy-1.T | X | Tovu | 3 (167 LOC, 9 importer lines) | X-taxonomy-1.J | 10 | 23 min | 2332 |
| P-publish-content-1.T | P | Tovu | 11 (1251 LOC, 113 importer lines) | P-publish-content-1.J | 11 | 120 min | 2321 |
| X-comments-1.T | X | Tovu | 2 (104 LOC, 3 importer lines) | X-comments-1.J | 11 | 17 min | 2319 |
| X-entries-1.T | X | Tovu | 3 (92 LOC, 8 importer lines) | X-entries-1.J | 11 | 21 min | 2316 |
| X-form-destinations-1.J | X | Jini | 2 (180 LOC) | — | 11 | 32 min |  |
| X-forms-1.J | X | Jini | 3 (155 LOC) | — | 11 | 37 min |  |
| X-site-search-1.T | X | Tovu | 1 (85 LOC, 4 importer lines) | X-site-search-1.J | 11 | 19 min | 2315 |
| D-site-backup-1.T | D | Tovu | 2 (56 LOC, 6 importer lines) | D-site-backup-1.J | 12 | 21 min | 2313 |
| X-content-types-1.T | X | Tovu | 3 (234 LOC, 81 importer lines) | X-content-types-1.J | 12 | 113 min | 2310 |
| X-form-destinations-1.T | X | Tovu | 2 (180 LOC, 5 importer lines) | X-form-destinations-1.J | 12 | 20 min | 2308 |
| X-forms-1.T | X | Tovu | 3 (155 LOC, 7 importer lines) | X-forms-1.J | 12 | 22 min | 2305 |
| X-redirects-1.J | X | Jini | 1 (96 LOC) | C-platform-routing-1.J | 12 | 32 min |  |
| X-seo-1.J | X | Jini | 1 (44 LOC) | — | 12 | 28 min |  |
| D-deployments-1.T | D | Tovu | 9 (683 LOC, 60 importer lines) | D-deployments-1.J | 13 | 78 min | 2296 |
| X-pages-1.J | X | Jini | 2 (163 LOC) | — | 13 | 32 min |  |
| X-redirects-1.T | X | Tovu | 1 (96 LOC, 6 importer lines) | X-redirects-1.J | 13 | 23 min | 2295 |
| X-seo-1.T | X | Tovu | 1 (44 LOC, 3 importer lines) | X-seo-1.J | 13 | 18 min | 2294 |
| X-trash-1.J | X | Jini | 8 (411 LOC) | — | 13 | 57 min |  |
| X-webhooks-1.J | X | Jini | 4 (450 LOC) | — | 13 | 43 min |  |
| D-source-control-1.T | D | Tovu | 4 (171 LOC, 10 importer lines) | D-source-control-1.J | 14 | 23 min | 2290 |
| X-analytics-1.T | X | Tovu | 2 (223 LOC, 9 importer lines) | X-analytics-1.J | 14 | 23 min | 2288 |
| X-consent-1.T | X | Tovu | 6 (343 LOC, 38 importer lines) | X-consent-1.J | 14 | 56 min | 2282 |
| X-pages-1.T | X | Tovu | 2 (163 LOC, 3 importer lines) | X-pages-1.J | 14 | 18 min | 2280 |
| X-permanent-delete-1.J | X | Jini | 1 (35 LOC) | — | 14 | 28 min |  |
| X-trash-1.T | X | Tovu | 8 (411 LOC, 46 importer lines) | X-trash-1.J | 14 | 71 min | 2272 |
| D-domain-dns-1.T | D | Tovu | 2 (201 LOC, 9 importer lines) | D-domain-dns-1.J | 15 | 21 min | 2270 |
| X-change-sets-1.J | X | Jini | 1 (108 LOC) | — | 15 | 29 min |  |
| X-custom-credentials-1.J | X | Jini | 2 (93 LOC) | C-contracts-core-1.J | 15 | 33 min |  |
| X-permanent-delete-1.T | X | Tovu | 1 (35 LOC, 8 importer lines) | X-permanent-delete-1.J | 15 | 25 min | 2269 |
| X-webhooks-1.T | X | Tovu | 4 (450 LOC, 20 importer lines) | X-webhooks-1.J | 15 | 37 min | 2265 |
| X-workspace-1.J | X | Jini | 2 (133 LOC) | C-contracts-core-6.J | 15 | 32 min |  |
| U-members-1.T | U | Tovu | 4 (573 LOC, 44 importer lines) | U-members-1.J | 16 | 61 min | 2261 |
| X-content-duplication-1.J | X | Jini | 2 (241 LOC) | — | 16 | 34 min |  |
| X-custom-credentials-1.T | X | Tovu | 2 (93 LOC, 19 importer lines) | X-custom-credentials-1.J | 16 | 37 min | 2259 |
| X-fs-files-1.J | X | Jini | 2 (408 LOC) | — | 16 | 37 min |  |
| X-vendor-credentials-1.J | X | Jini | 2 (99 LOC) | — | 16 | 31 min |  |
| X-workspace-1.T | X | Tovu | 2 (133 LOC, 6 importer lines) | X-workspace-1.J | 16 | 22 min | 2257 |
| X-change-sets-1.T | X | Tovu | 1 (108 LOC, 3 importer lines) | X-change-sets-1.J | 17 | 19 min | 2256 |
| X-fs-files-1.T | X | Tovu | 2 (408 LOC, 10 importer lines) | X-fs-files-1.J | 17 | 24 min | 2254 |
| X-object-storage-1.J | X | Jini | 1 (37 LOC) | — | 17 | 30 min |  |
| X-origin-1.J | X | Jini | 2 (92 LOC) | C-contracts-core-2.J | 17 | 33 min |  |
| X-vendor-credentials-1.T | X | Tovu | 2 (99 LOC, 15 importer lines) | X-vendor-credentials-1.J | 17 | 29 min | 2252 |
| X-webmcp-1.J | X | Jini | 2 (62 LOC) | — | 17 | 31 min |  |
| X-content-duplication-1.T | X | Tovu | 2 (241 LOC, 6 importer lines) | X-content-duplication-1.J | 18 | 20 min | 2250 |
| X-external-mcp-1.J | X | Jini | 2 (244 LOC) | — | 18 | 34 min |  |
| X-object-storage-1.T | X | Tovu | 1 (37 LOC, 3 importer lines) | X-object-storage-1.J | 18 | 19 min | 2249 |
| X-origin-1.T | X | Tovu | 2 (92 LOC, 2 importer lines) | X-origin-1.J | 18 | 17 min | 2247 |
| X-site-inspection-1.J | X | Jini | 4 (1269 LOC) | C-contracts-core-2.J | 18 | 49 min |  |
| X-webmcp-1.T | X | Tovu | 2 (62 LOC, 5 importer lines) | X-webmcp-1.J | 18 | 20 min | 2245 |
| X-agent-plugins-1.J | X | Jini | 12 (853 LOC) | — | 19 | 79 min |  |
| X-external-mcp-1.T | X | Tovu | 2 (244 LOC, 11 importer lines) | X-external-mcp-1.J | 19 | 25 min | 2243 |
| X-identity-1.J | X | Jini | 10 (1249 LOC) | — | 19 | 71 min |  |
| X-plugin-runtime-1.J | X | Jini | 7 (675 LOC) | — | 19 | 51 min |  |
| X-site-inspection-1.T | X | Tovu | 4 (1269 LOC, 21 importer lines) | X-site-inspection-1.J | 19 | 32 min | 2239 |
| X-skills-1.J | X | Jini | 3 (35 LOC) | — | 19 | 42 min |  |
| X-agent-plugins-1.T | X | Tovu | 12 (853 LOC, 52 importer lines) | X-agent-plugins-1.J | 20 | 65 min | 2227 |
| X-identity-1.T | X | Tovu | 10 (1249 LOC, 76 importer lines) | X-identity-1.J | 20 | 87 min | 2217 |
| X-identity-2.J | X | Jini | 4 (649 LOC) | X-identity-1.J | 20 | 42 min |  |
| X-mail-status-1.J | X | Jini | 4 (145 LOC) | X-identity-1.J | 20 | 42 min |  |
| X-plugin-runtime-1.T | X | Tovu | 7 (675 LOC, 32 importer lines) | X-plugin-runtime-1.J | 20 | 46 min | 2210 |
| X-skills-1.T | X | Tovu | 3 (35 LOC, 5 importer lines) | X-skills-1.J | 20 | 19 min | 2207 |
| A-adm-roles-1.J | A | Jini | 1 (29 LOC) | — | 21 | 28 min |  |
| R-admin-http-1.J | R | Jini | 7 (642 LOC) | — | 21 | 63 min |  |
| R-public-http-1.J | R | Jini | 14 (1202 LOC) | — | 21 | 87 min |  |
| X-database-1.J | X | Jini | 3 (44 LOC) | C-contracts-core-7.J | 21 | 38 min |  |
| X-database-transfer-1.J | X | Jini | 3 (292 LOC) | — | 21 | 39 min |  |
| X-identity-2.T | X | Tovu | 4 (649 LOC, 15 importer lines) | X-identity-2.J | 21 | 29 min | 2203 |
| A-adm-roles-1.T | A | Tovu | 1 (29 LOC, 13 importer lines) | A-adm-roles-1.J | 22 | 26 min | 2202 |
| R-public-http-1.T | R | Tovu | 14 (1202 LOC, 49 importer lines) | R-public-http-1.J | 22 | 57 min | 2188 |
| R-public-http-2.J | R | Jini | 9 (608 LOC) | R-public-http-1.J, C-platform-html-1.J, C-presentation-1.J, C-contracts-core-2.J, T-post-1.J, T-theme-1.J, X-entries-1.J, C-platform-routing-1.J | 22 | 61 min |  |
| X-database-transfer-1.T | X | Tovu | 3 (292 LOC, 13 importer lines) | X-database-transfer-1.J | 22 | 31 min | 2185 |
| X-mail-status-1.T | X | Tovu | 4 (145 LOC, 12 importer lines) | X-mail-status-1.J | 22 | 25 min | 2181 |
| X-recovery-1.J | X | Jini | 2 (187 LOC) | C-contracts-core-7.J | 22 | 36 min |  |
| A-adm-themes-1.J | A | Jini | 9 (800 LOC) | — | 23 | 64 min |  |
| A-adm-users-1.J | A | Jini | 1 (16 LOC) | — | 23 | 30 min |  |
| DT-desktop-1.J | DT | Jini | 12 (713 LOC) | — | 23 | 89 min |  |
| R-public-http-2.T | R | Tovu | 9 (608 LOC, 28 importer lines) | R-public-http-2.J | 23 | 33 min | 2172 |
| X-database-1.T | X | Tovu | 3 (44 LOC, 9 importer lines) | X-database-1.J | 23 | 23 min | 2169 |
| A-adm-publish-content-1.J | A | Jini | 2 (217 LOC) | — | 24 | 32 min |  |
| A-adm-themes-1.T | A | Tovu | 9 (800 LOC, 41 importer lines) | A-adm-themes-1.J | 24 | 49 min | 2160 |
| A-adm-users-1.T | A | Tovu | 1 (16 LOC, 10 importer lines) | A-adm-users-1.J | 24 | 28 min | 2159 |
| DT-desktop-1.T | DT | Tovu | 12 (713 LOC, 24 importer lines) | DT-desktop-1.J | 24 | 36 min | 2147 |
| R-admin-http-1.T | R | Tovu | 7 (642 LOC, 21 importer lines) | R-admin-http-1.J | 24 | 30 min | 2140 |
| X-recovery-1.T | X | Tovu | 2 (187 LOC, 6 importer lines) | X-recovery-1.J | 24 | 22 min | 2138 |
| A-adm-members-1.J | A | Jini | 1 (12 LOC) | — | 25 | 28 min |  |
| A-adm-other-1.J | A | Jini | 14 (936 LOC) | — | 25 | 76 min |  |
| A-adm-publish-content-1.T | A | Tovu | 2 (217 LOC, 13 importer lines) | A-adm-publish-content-1.J | 25 | 30 min | 2136 |
| A-adm-members-1.T | A | Tovu | 1 (12 LOC, 4 importer lines) | A-adm-members-1.J | 26 | 20 min | 2135 |
| A-adm-other-1.T | A | Tovu | 14 (936 LOC, 95 importer lines) | A-adm-other-1.J | 26 | 96 min | 2121 |
| A-adm-other-2.J | A | Jini | 14 (542 LOC) | — | 26 | 76 min |  |
| A-adm-other-3.J | A | Jini | 14 (996 LOC) | A-adm-other-1.J | 26 | 76 min |  |
| A-adm-other-2.T | A | Tovu | 14 (542 LOC, 89 importer lines) | A-adm-other-2.J | 27 | 98 min | 2107 |
| A-adm-shell-lib-1.J | A | Jini | 12 (729 LOC) | — | 27 | 81 min |  |
| A-adm-shell-lib-2.J | A | Jini | 14 (784 LOC) | — | 27 | 89 min |  |
| A-adm-other-3.T | A | Tovu | 14 (996 LOC, 84 importer lines) | A-adm-other-3.J | 28 | 90 min | 2093 |
| A-adm-shell-components-1.J | A | Jini | 14 (917 LOC) | — | 28 | 82 min |  |
| A-adm-shell-lib-3.J | A | Jini | 9 (562 LOC) | — | 28 | 63 min |  |
| A-adm-posts-1.J | A | Jini | 14 (894 LOC) | A-adm-shell-components-1.J, A-adm-shell-lib-3.J | 29 | 79 min |  |
| A-adm-shell-components-1.T | A | Tovu | 14 (917 LOC, 38 importer lines) | A-adm-shell-components-1.J | 29 | 39 min | 2079 |
| A-adm-shell-lib-1.T | A | Tovu | 12 (729 LOC, 131 importer lines) | A-adm-shell-lib-1.J | 29 | 118 min | 2067 |
| SEC-adm-security-1.J | SEC | Jini | 4 (57 LOC) | A-adm-shell-lib-3.J | 29 | 37 min |  |
| A-adm-pages-1.J | A | Jini | 9 (630 LOC) | A-adm-posts-1.J | 30 | 61 min |  |
| A-adm-posts-1.T | A | Tovu | 14 (894 LOC, 111 importer lines) | A-adm-posts-1.J | 30 | 119 min | 2053 |
| A-adm-posts-2.J | A | Jini | 2 (38 LOC) | A-adm-posts-1.J | 30 | 31 min |  |
| SEC-adm-security-1.T | SEC | Tovu | 4 (57 LOC, 6 importer lines) | SEC-adm-security-1.J | 30 | 20 min | 2049 |
| A-adm-deployment-1.J | A | Jini | 2 (24 LOC) | A-adm-shell-lib-3.J, A-adm-other-2.J | 31 | 31 min |  |
| A-adm-pages-1.T | A | Tovu | 9 (630 LOC, 31 importer lines) | A-adm-pages-1.J | 31 | 46 min | 2040 |
| A-adm-posts-2.T | A | Tovu | 2 (38 LOC, 2 importer lines) | A-adm-posts-2.J | 31 | 16 min | 2038 |
| A-adm-source-control-1.J | A | Jini | 1 (7 LOC) | A-adm-shell-lib-3.J | 31 | 28 min |  |
| A-adm-deployment-1.T | A | Tovu | 2 (24 LOC, 3 importer lines) | A-adm-deployment-1.J | 32 | 17 min | 2036 |
| A-adm-other-4.J | A | Jini | 14 (643 LOC) | A-adm-other-1.J, A-adm-shell-lib-3.J, A-adm-other-3.J, A-adm-shell-components-1.J, A-adm-shell-lib-1.J | 32 | 72 min |  |
| A-adm-recovery-1.J | A | Jini | 4 (145 LOC) | A-adm-other-1.J, A-adm-other-3.J, A-adm-shell-lib-3.J | 32 | 40 min |  |
| A-adm-shell-lib-2.T | A | Tovu | 14 (784 LOC, 96 importer lines) | A-adm-shell-lib-2.J | 32 | 120 min | 2022 |
| A-adm-source-control-1.T | A | Tovu | 1 (7 LOC, 1 importer lines) | A-adm-source-control-1.J | 32 | 16 min | 2021 |
| A-adm-other-4.T | A | Tovu | 14 (643 LOC, 29 importer lines) | A-adm-other-4.J | 33 | 38 min | 2007 |
| A-adm-other-5.J | A | Jini | 14 (808 LOC) | A-adm-shell-lib-3.J, A-adm-other-2.J, A-adm-shell-components-1.J | 33 | 81 min |  |
| A-adm-recovery-1.T | A | Tovu | 4 (145 LOC, 16 importer lines) | A-adm-recovery-1.J | 33 | 29 min | 2003 |
| A-adm-shell-lib-4.J | A | Jini | 9 (426 LOC) | A-adm-shell-lib-3.J, A-adm-shell-lib-1.J, A-adm-posts-1.J, A-adm-shell-lib-2.J | 33 | 60 min |  |
| A-adm-other-5.T | A | Tovu | 14 (808 LOC, 37 importer lines) | A-adm-other-5.J | 34 | 43 min | 1989 |
| A-adm-other-6.J | A | Jini | 12 (428 LOC) | A-adm-other-3.J, A-adm-users-1.J, A-adm-other-4.J, A-adm-other-2.J, A-adm-other-5.J | 34 | 67 min |  |
| A-adm-shell-hooks-1.J | A | Jini | 10 (592 LOC) | A-adm-shell-lib-2.J, A-adm-shell-lib-4.J | 34 | 72 min |  |
| A-adm-shell-lib-4.T | A | Tovu | 9 (426 LOC, 102 importer lines) | A-adm-shell-lib-4.J | 34 | 112 min | 1980 |
| A-adm-other-6.T | A | Tovu | 12 (428 LOC, 27 importer lines) | A-adm-other-6.J | 35 | 37 min | 1968 |
| A-adm-shell-components-2.J | A | Jini | 11 (587 LOC) | A-adm-shell-components-1.J, A-adm-other-1.J, A-adm-shell-lib-2.J, A-adm-shell-lib-3.J, A-adm-other-2.J, A-adm-other-3.J | 35 | 73 min |  |
| A-adm-shell-lib-3.T | A | Tovu | 9 (562 LOC, 132 importer lines) | A-adm-shell-lib-3.J | 36 | 120 min | 1959 |
| A-adm-shell-components-2.T | A | Tovu | 11 (587 LOC, 24 importer lines) | A-adm-shell-components-2.J | 37 | 32 min | 1948 |
| A-adm-shell-hooks-1.T | A | Tovu | 10 (592 LOC, 36 importer lines) | A-adm-shell-hooks-1.J | 37 | 42 min | 1938 |
