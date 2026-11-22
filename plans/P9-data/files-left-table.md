# Files left — re-measure on Tovu merge-12 + ex-sh/ex-core/ex-export (old blocker rules, same columns as INDEX)

| area | Tovu dirs measured | Jini-bound files left in Tovu | LOC | re-export shells to delete | verbatim-movable now | blocked: imports Tovu-kept code | blocked: would add a Jini cross-package edge | blocked: only through blocked deps | files with Tovu words | stays in Tovu (files) | goes to | stays in Tovu and why |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| themes | theme, adm-themes | **111** | 23623 | 0 | 27 | 5 | 15 | 64 | 35 | 0 | theme engine, validation, preview, theme files → `@jini-ai/cms/themes/site/*`; admin Themes screen → `@jini-ai/admin/themes` | composition binding (`server/runtime/composition/modules/*theme*`), Tovu starter-theme seeding (`platform/site-dir/seed-site-themes.ts`), product literals (`data-tovu-*` rename → P9-BREAKS) |
| publish-content | publish-content, publish-content-ui, publish-trust, adm-publish-content | **83** | 17335 | 0 | 19 | 14 | 9 | 41 | 33 | 1 | bundle/apply/peer engine → `@jini-ai/cms/publish/*`; dialog UI → `@jini-ai/admin/publish-content` | `tovu-publish-ports.ts` (the host's port bag, product-named), peer vault owner key `"tovu"` policy, composition |
| post | post, adm-posts | **110** | 19189 | 0 | 24 | 14 | 12 | 60 | 11 | 0 | post model/services → `@jini-ai/cms/posts/*`; Posts screen → `@jini-ai/admin/posts` | post-kind/author product rules in `contracts/core` that carry Tovu policy; composition |
| newsletter | newsletter | **25** | 5557 | 0 | 2 | 5 | 6 | 12 | 2 | 0 | → `@jini-ai/user-management/newsletter/*` (beside members, which import it) | sender identity/product mail copy; composition |
| site-backup | site-backup | **44** | 6979 | 0 | 2 | 16 | 18 | 8 | 26 | 0 | → `@jini-ai/devops/backup/site/*` | site-folder layout reads (`platform/site-dir`, Tovu product), `.tovu/` managed-file names until RN |
| deployments | deployments, adm-deployment | **70** | 15019 | 0 | 8 | 12 | 23 | 27 | 30 | 0 | → `@jini-ai/devops/deploy/site/*`; Deployment screen → `@jini-ai/admin/deployment` | vendor credential labels (product copy in `@tovu/contracts`), composition |
| security (admin → Jini admin/security) | adm-security | **39** | 8514 | 0 | 4 | 11 | 8 | 16 | 10 | 0 | SWAP, not move: port the Tovu-only behaviour into the existing `@jini-ai/admin/security` (22 files), then delete Tovu's | nothing after the swap except the screen's mount in `panels.tsx` |
| rendering/routes | public-http, admin-http | **470** | 47845 | 0 | 29 | 348 | 43 | 50 | 114 | 0 | → `@jini-ai/cms/public-http/*`, `@jini-ai/cms/admin-http/*` (route handlers) | route registration + `RouteDeps` (`server/routes/types.ts`, 1,490 lines, owner 11-20 dropped re-wiring) — blocks 133 route files directly |
| admin screens (other) | adm-other, adm-pages, adm-recovery, adm-source-control, adm-members, adm-users | **485** | 88539 | 0 | 98 | 72 | 127 | 188 | 80 | 122 | → `@jini-ai/admin/<feature>` screens on the injected kit | assistant dock, dashboard, sites switcher, playground, voice input (product screens, 122 files) |
| admin shell/transport/roles | adm-shell-lib, adm-shell-hooks, adm-shell-components, adm-roles | **266** | 33425 | 0 | 80 | 43 | 89 | 54 | 68 | 2 | `lib/` transport (`api.ts`, `admin-http`) and shell components → `@jini-ai/admin/shell/*`; roles → `@jini-ai/admin/roles` | `App*.tsx`, `nav.ts`, `panels.tsx`, admin themes/styles (product look), product i18n strings |
| desktop | desktop | **17** | 1085 | 0 | 12 | 3 | 2 | 0 | 11 | 235 | generic Electron shell pieces (find-in-page, spellcheck, auto-update, durable JSON, PTY helpers, instance presence, toolchain, asar verify, memory sampler, speech, backslide guard, app-version IPC, staleness) → `@jini-ai/desktop-host/shell/*` | packaging, site management, owner store, tovu-server, project IPC, release notes (235 files) |
| users U (members, member-login) | members, member-login | **31** | 5041 | 0 | 4 | 4 | 9 | 14 | 3 | 0 | → `@jini-ai/user-management/members/*`, `/member-login/*` | member mail copy; composition |
| devops other (source-control, site-export, domain-dns) | source-control, site-export, domain-dns | **38** | 5405 | 0 | 7 | 8 | 15 | 8 | 13 | 0 | → `@jini-ai/devops/{source-control,static-export,dns}/site/*` | vendor credential labels; composition |
| shared contracts + platform helpers | contracts-core, contracts-headless, platform-html, platform-routing, platform-mail, presentation | **140** | 7545 | 0 | 86 | 7 | 39 | 8 | 46 | 0 | pure contracts → `@jini-ai/core/contracts/site/*`; per-feature `tool-metadata/<x>.ts` follow their feature; html/routing helpers → `@jini-ai/cms` | product vocabulary with Tovu policy (`@tovu/contracts/*` copy, admin locales) |
| other generic features (X lane) | 53 feature dirs | **557** | 58588 | 3 | 139 | 128 | 168 | 119 | 265 | 12 | media, widgets, settings, taxonomy, entries, navigation, comments, forms, seo, trash, identity, webhooks, credentials, agent-plugins, plugin-runtime, … → their owning Jini package (see `plans/P9-data/tools/plan.mjs` AREAS) | sites switcher/site guide/site evidence (product), composition |
| **TOTAL** | | **2486** | 343689 | 3 | 541 | 690 | 583 | 669 | 747 | 372 | | |

# Files left — the K plan (owner K1–K5, 11-22)

| area | Jini-bound files left (after Codex/K STAYS) | verbatim (no own K work) | K1 route spec | K2 injected kit | K3 copy arg | K4 type → core | K5 injected collaborator | stays in Tovu (files) | of which newly STAYS (Codex FIX, K1 host ports, K3 no-args) | steps |
|---|---|---|---|---|---|---|---|---|---|---|
| themes | **111** | 80 | 0 | 4 | 0 | 12 | 19 | 0 | 0 | 11 |
| publish-content | **82** | 55 | 0 | 1 | 3 | 21 | 12 | 2 | 1 | 11 |
| post | **109** | 75 | 0 | 10 | 0 | 14 | 15 | 1 | 1 | 12 |
| newsletter | **25** | 13 | 0 | 0 | 0 | 9 | 5 | 0 | 0 | 3 |
| site-backup | **44** | 9 | 0 | 0 | 7 | 19 | 28 | 0 | 0 | 8 |
| deployments | **70** | 32 | 0 | 8 | 7 | 19 | 20 | 0 | 0 | 10 |
| security (admin → Jini admin/security) | **39** | 20 | 0 | 9 | 2 | 8 | 6 | 0 | 0 | 4 |
| rendering/routes | **463** | 71 | 340 | 0 | 6 | 74 | 207 | 7 | 7 | 174 |
| admin screens (other) | **485** | 286 | 0 | 127 | 5 | 54 | 50 | 122 | 0 | 56 |
| admin shell/transport/roles | **266** | 134 | 0 | 105 | 13 | 18 | 31 | 2 | 0 | 32 |
| desktop | **17** | 12 | 0 | 0 | 0 | 3 | 4 | 235 | 0 | 2 |
| users U (members, member-login) | **31** | 17 | 0 | 0 | 0 | 12 | 7 | 0 | 0 | 4 |
| devops other (source-control, site-export, domain-dns) | **37** | 12 | 0 | 0 | 2 | 17 | 18 | 1 | 1 | 6 |
| shared contracts + platform helpers | **110** | 17 | 0 | 0 | 2 | 77 | 34 | 30 | 30 | 19 |
| other generic features (X lane) | **557** | 241 | 0 | 0 | 17 | 208 | 197 | 12 | 0 | 116 |
| **TOTAL** | **2446** | 1074 | 340 | 264 | 64 | 565 | 653 | 412 | 40 | 468 |
