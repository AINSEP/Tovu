EXTRACTION PLAN PARTIAL: SEC-1…n still wait for the SEC-0 parity report; apps/site-chat (26 files) is not measured; 3 owner decisions hold 4 files and 2 Jini retirements (SH-3 test block, C-contracts-core-1's guard regex, the RT-1/RT-2 next-major freeze). Every one of the 2,446 Jini-bound files has a step.

# INDEX — P9 / P9K Tovu → Jini extraction

**FILES LEFT: 2,486 (re-measure, old rules) → 2,446 after the Codex/K STAYS reclassification → 0 after batch B186 (6-wide, ≈ 274 h wall).**

Bases: Tovu `integ/merge-12-2026-11-22` `41e948ee4` + `codex/ex-sh-tovu`, `ex-core-tovu`, `ex-export-tovu`; Jini `integ/merge-12-2026-11-22` `6b8e0d48a` + `codex/ex-core-jini`, `ex-export-jini`, `ex-html-jini`, `ex-sh-jini`, `codex/jx-chatlinks` (= `integ/merge-13`). Plans: **`plans/P9K-extraction.md`** (K1–K5 recipes, batches, curve, risks) on top of `plans/P9-extraction.md` (§1 step contract, owner rules, STOP list). Sheets: `plans/P9-steps/<step>.md` — 425 generated K sheets (`RT-K1-*`, `A-K2-*`, `K5-*`, `K4-*`, `V-*`, `K4-seam-*`), 5 hand sheets (`RT-K1-0`, `A-K2-0`, `K4-i18n-common`, `SH-3`, `XC-6`), and the still-valid P9 sheets. Data: `plans/P9-data/` (`blocked-files.md` = the 1,942 formerly blocked files → K work → step; `stays-in-tovu.md` 412; `files-left-table.md`; `k2-kit-gaps.md`; `k-data.json`, `k-work.json`; tools `scan.mjs`, `plan.mjs`, `planK.mjs`, `appxK.mjs`). All 12,445 cited importer/K lines in the generated sheets were checked against the Tovu tree.

## Files left per area (re-measure on the new bases; same columns as before, old blocker rules)

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

## Files left per area — the K plan (owner K1–K5, 11-22)

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

## Projected curve (6 implementers per batch)

| after batch | files left | cumulative wall (h, sum of batch max est) |
|---|---|---|
| start | 2,446 | 0 |
| B10 | 2,171 | 11 |
| B20 | 2,073 | 21 |
| B30 | 2,013 | 36 |
| B40 | 1,860 | 53 |
| B50 | 1,607 | 70 |
| B60 | 1,430 | 87 |
| B80 | 1,094 | 120 |
| B100 | 723 | 152 |
| B120 | 438 | 184 |
| B140 | 335 | 212 |
| B160 | 134 | 241 |
| B186 | 0 | 274 |

## Steps

One row per J (Jini) or T (Tovu) item, in batch order. **files** = files moved (J) or deleted and repointed (T). **Files left after** counts down on Tovu items that delete files. Lanes: RT-K1 routes, A-K2 admin screens on the injected kit, K5 injection (K3 copy args ride inside these), K4 seam splits, V verbatim, XC/S/SEC/SH hand lanes, `P9 (…)` = still-valid P9 sheets. Not batched: RT-1, RT-2 (BLOCKED, next-major freeze), SEC-1…n and SEC-T1 (after SEC-0), S7b (after X-media-1), RN-J1…J4 / RN-T1 (last slot of a night). LOCK (Tovu manifest gains `@jini-ai/admin`): A-K2-shell-lib-1.T, K5-publish-content-ui-1.T. No step needs a Jini publish first (linked combines).

| step id | lane | repo | files | depends on | batch | est | files left after |
|---|---|---|---|---|---|---|---|
| T-post-1.J | P9 (T) | Jini | 7 (move) | C-platform-html-1.J | done (tonight) | 60 min |  |
| C-platform-html-1.J | P9 (C) | Jini | 3 (move) | — | done (tonight) | 60 min |  |
| R-public-http-1.J | P9 (R) | Jini | 14 (move) | — | B1 | 60 min |  |
| A-adm-other-2.J | P9 (A) | Jini | 14 (move) | — | B1 | 60 min |  |
| A-adm-other-1.J | P9 (A) | Jini | 14 (move) | — | B1 | 60 min |  |
| SH-3 | SH | Tovu | — | — | B1 | 45 min | 2,436 |
| SEC-0 | SEC | Tovu | — | — | B1 | 90 min |  |
| T-post-1.T | P9 (T) | Tovu | 7 (delete + repoint) | T-post-1.J | B1 | 60 min | 2,436 |
| X-agent-plugins-1.J | P9 (X) | Jini | 12 (move) | — | B2 | 60 min |  |
| DT-desktop-1.J | P9 (DT) | Jini | 12 (move) | — | B2 | 60 min |  |
| A-adm-shell-components-1.J | P9 (A) | Jini | 14 (move) | — | B2 | 60 min |  |
| A-adm-other-3.J | P9 (A) | Jini | 14 (move) | A-adm-other-1.J | B2 | 60 min |  |
| A-adm-other-1.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-other-1.J | B2 | 60 min | 2,408 |
| R-public-http-1.T | P9 (R) | Tovu | 14 (delete + repoint) | R-public-http-1.J | B2 | 60 min | 2,408 |
| A-adm-shell-lib-2.J | P9 (A) | Jini | 14 (move) | — | B3 | 60 min |  |
| A-adm-shell-lib-1.J | P9 (A) | Jini | 12 (move) | — | B3 | 60 min |  |
| A-adm-other-2.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-other-2.J | B3 | 60 min | 2,356 |
| A-adm-shell-components-1.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-shell-components-1.J | B3 | 60 min | 2,356 |
| DT-desktop-1.T | P9 (DT) | Tovu | 12 (delete + repoint) | DT-desktop-1.J | B3 | 60 min | 2,356 |
| X-agent-plugins-1.T | P9 (X) | Tovu | 12 (delete + repoint) | X-agent-plugins-1.J | B3 | 60 min | 2,356 |
| X-media-1.J | P9 (X) | Jini | 10 (move) | — | B4 | 60 min |  |
| X-identity-1.J | P9 (X) | Jini | 10 (move) | — | B4 | 60 min |  |
| T-theme-1.J | P9 (T) | Jini | 10 (move) | — | B4 | 60 min |  |
| A-adm-shell-lib-3.J | P9 (A) | Jini | 9 (move) | — | B4 | 60 min |  |
| A-adm-other-3.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-other-3.J | B4 | 60 min | 2,339 |
| C-platform-html-1.T | P9 (C) | Tovu | 3 (delete + repoint) | C-platform-html-1.J | B4 | 60 min | 2,339 |
| A-adm-other-5.J | P9 (A) | Jini | 14 (move) | A-adm-shell-lib-3.J, A-adm-other-2.J, A-adm-shell-components-1.J | B5 | 60 min |  |
| A-adm-other-4.J | P9 (A) | Jini | 14 (move) | A-adm-other-1.J, A-adm-shell-lib-3.J, A-adm-other-3.J, A-adm-shell-components-1.J, A-adm-shell-lib-1.J | B5 | 60 min |  |
| A-adm-shell-lib-2.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-shell-lib-2.J | B5 | 60 min | 2,295 |
| T-theme-1.T | P9 (T) | Tovu | 10 (delete + repoint) | T-theme-1.J | B5 | 60 min | 2,295 |
| X-identity-1.T | P9 (X) | Tovu | 10 (delete + repoint) | X-identity-1.J | B5 | 60 min | 2,295 |
| X-media-1.T | P9 (X) | Tovu | 10 (delete + repoint) | X-media-1.J | B5 | 60 min | 2,295 |
| X-trash-1.J | P9 (X) | Jini | 8 (move) | — | B6 | 60 min |  |
| X-plugin-runtime-1.J | P9 (X) | Jini | 7 (move) | — | B6 | 60 min |  |
| A-adm-shell-components-2.J | P9 (A) | Jini | 11 (move) | A-adm-shell-components-1.J, A-adm-other-1.J, A-adm-shell-lib-2.J, A-adm-shell-lib-3.J, A-adm-other-2.J, A-adm-other-3.J | B6 | 60 min |  |
| A-adm-posts-1.J | P9 (A) | Jini | 14 (move) | A-adm-shell-components-1.J, A-adm-shell-lib-3.J | B6 | 60 min |  |
| A-adm-other-4.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-other-4.J | B6 | 60 min | 2,267 |
| A-adm-other-5.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-other-5.J | B6 | 60 min | 2,267 |
| A-adm-shell-lib-4.J | P9 (A) | Jini | 9 (move) | A-adm-shell-lib-3.J, A-adm-shell-lib-1.J, A-adm-posts-1.J, A-adm-shell-lib-2.J | B7 | 60 min |  |
| A-adm-pages-1.J | P9 (A) | Jini | 9 (move) | A-adm-posts-1.J | B7 | 60 min |  |
| A-adm-posts-1.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-posts-1.J | B7 | 60 min | 2,227 |
| A-adm-shell-components-2.T | P9 (A) | Tovu | 11 (delete + repoint) | A-adm-shell-components-2.J | B7 | 60 min | 2,227 |
| X-plugin-runtime-1.T | P9 (X) | Tovu | 7 (delete + repoint) | X-plugin-runtime-1.J | B7 | 60 min | 2,227 |
| X-trash-1.T | P9 (X) | Tovu | 8 (delete + repoint) | X-trash-1.J | B7 | 60 min | 2,227 |
| X-settings-1.J | P9 (X) | Jini | 7 (move) | — | B8 | 60 min |  |
| P-publish-trust-1.J | P9 (P) | Jini | 5 (move) | — | B8 | 60 min |  |
| C-contracts-headless-1.J | P9 (C) | Jini | 5 (move) | — | B8 | 60 min |  |
| A-adm-themes-1.J | P9 (A) | Jini | 9 (move) | — | B8 | 60 min |  |
| A-adm-shell-hooks-1.J | P9 (A) | Jini | 10 (move) | A-adm-shell-lib-2.J, A-adm-shell-lib-4.J | B8 | 60 min |  |
| A-adm-shell-lib-1.T | P9 (A) | Tovu | 12 (delete + repoint) | A-adm-shell-lib-1.J | B8 | 60 min | 2,215 |
| X-navigation-1.J | P9 (X) | Jini | 5 (move) | — | B9 | 60 min |  |
| R-admin-http-1.J | P9 (R) | Jini | 4 (move) | — | B9 | 60 min |  |
| A-adm-recovery-1.J | P9 (A) | Jini | 4 (move) | A-adm-other-1.J, A-adm-other-3.J, A-adm-shell-lib-3.J | B9 | 60 min |  |
| A-adm-shell-hooks-1.T | P9 (A) | Tovu | 10 (delete + repoint) | A-adm-shell-hooks-1.J | B9 | 60 min | 2,193 |
| C-contracts-headless-1.T | P9 (C) | Tovu | 5 (delete + repoint) | C-contracts-headless-1.J | B9 | 60 min | 2,193 |
| X-settings-1.T | P9 (X) | Tovu | 7 (delete + repoint) | X-settings-1.J | B9 | 60 min | 2,193 |
| X-identity-2.J | P9 (X) | Jini | 4 (move) | X-identity-1.J | B10 | 60 min |  |
| SEC-adm-security-1.J | P9 (SEC) | Jini | 4 (move) | A-adm-shell-lib-3.J | B10 | 60 min |  |
| A-adm-pages-1.T | P9 (A) | Tovu | 9 (delete + repoint) | A-adm-pages-1.J | B10 | 60 min | 2,171 |
| A-adm-recovery-1.T | P9 (A) | Tovu | 4 (delete + repoint) | A-adm-recovery-1.J | B10 | 60 min | 2,171 |
| P-publish-trust-1.T | P9 (P) | Tovu | 5 (delete + repoint) | P-publish-trust-1.J | B10 | 60 min | 2,171 |
| R-admin-http-1.T | P9 (R) | Tovu | 4 (delete + repoint) | R-admin-http-1.J | B10 | 60 min | 2,171 |
| X-webhooks-1.J | P9 (X) | Jini | 4 (move) | — | B11 | 60 min |  |
| X-mail-status-1.J | P9 (X) | Jini | 4 (move) | X-identity-1.J | B11 | 60 min |  |
| K5-platform-routing-1.J | K5 | Jini | 3 (move) | — | B11 | 33 min |  |
| A-adm-shell-lib-3.T | P9 (A) | Tovu | 9 (delete + repoint) | A-adm-shell-lib-3.J | B11 | 60 min | 2,153 |
| X-identity-2.T | P9 (X) | Tovu | 4 (delete + repoint) | X-identity-2.J | B11 | 60 min | 2,153 |
| X-navigation-1.T | P9 (X) | Tovu | 5 (delete + repoint) | X-navigation-1.J | B11 | 60 min | 2,153 |
| X-database-transfer-1.J | P9 (X) | Jini | 3 (move) | — | B12 | 60 min |  |
| X-content-types-1.J | P9 (X) | Jini | 3 (move) | — | B12 | 60 min |  |
| A-adm-shell-lib-4.T | P9 (A) | Tovu | 9 (delete + repoint) | A-adm-shell-lib-4.J | B12 | 60 min | 2,132 |
| SEC-adm-security-1.T | P9 (SEC) | Tovu | 4 (delete + repoint) | SEC-adm-security-1.J | B12 | 60 min | 2,132 |
| X-mail-status-1.T | P9 (X) | Tovu | 4 (delete + repoint) | X-mail-status-1.J | B12 | 60 min | 2,132 |
| X-webhooks-1.T | P9 (X) | Tovu | 4 (delete + repoint) | X-webhooks-1.J | B12 | 60 min | 2,132 |
| X-skills-1.J | P9 (X) | Jini | 3 (move) | — | B13 | 60 min |  |
| X-forms-1.J | P9 (X) | Jini | 3 (move) | — | B13 | 60 min |  |
| X-entries-1.J | P9 (X) | Jini | 3 (move) | — | B13 | 60 min |  |
| K5-platform-routing-1.T | K5 | Tovu | 3 (delete + repoint) | K5-platform-routing-1.J | B13 | 55 min | 2,117 |
| A-adm-themes-1.T | P9 (A) | Tovu | 9 (delete + repoint) | A-adm-themes-1.J | B13 | 60 min | 2,117 |
| X-database-transfer-1.T | P9 (X) | Tovu | 3 (delete + repoint) | X-database-transfer-1.J | B13 | 60 min | 2,117 |
| A-adm-posts-2.J | P9 (A) | Jini | 2 (move) | A-adm-posts-1.J | B14 | 60 min |  |
| A-adm-deployment-1.J | P9 (A) | Jini | 2 (move) | A-adm-shell-lib-3.J, A-adm-other-2.J | B14 | 60 min |  |
| K5-origin-1.J | K5 | Jini | 2 (move) | — | B14 | 31 min |  |
| X-content-types-1.T | P9 (X) | Tovu | 3 (delete + repoint) | X-content-types-1.J | B14 | 60 min | 2,108 |
| X-forms-1.T | P9 (X) | Tovu | 3 (delete + repoint) | X-forms-1.J | B14 | 60 min | 2,108 |
| X-skills-1.T | P9 (X) | Tovu | 3 (delete + repoint) | X-skills-1.J | B14 | 60 min | 2,108 |
| X-analytics-1.J | P9 (X) | Jini | 2 (move) | — | B15 | 60 min |  |
| A-adm-publish-content-1.J | P9 (A) | Jini | 2 (move) | — | B15 | 60 min |  |
| K5-origin-1.T | K5 | Tovu | 2 (delete + repoint) | K5-origin-1.J | B15 | 20 min | 2,099 |
| A-adm-deployment-1.T | P9 (A) | Tovu | 2 (delete + repoint) | A-adm-deployment-1.J | B15 | 60 min | 2,099 |
| A-adm-posts-2.T | P9 (A) | Tovu | 2 (delete + repoint) | A-adm-posts-2.J | B15 | 60 min | 2,099 |
| X-entries-1.T | P9 (X) | Tovu | 3 (delete + repoint) | X-entries-1.J | B15 | 60 min | 2,099 |
| X-vendor-credentials-1.J | P9 (X) | Jini | 2 (move) | — | B16 | 60 min |  |
| X-form-destinations-1.J | P9 (X) | Jini | 2 (move) | — | B16 | 60 min |  |
| X-external-mcp-1.J | P9 (X) | Jini | 2 (move) | — | B16 | 60 min |  |
| X-content-duplication-1.J | P9 (X) | Jini | 2 (move) | — | B16 | 60 min |  |
| A-adm-publish-content-1.T | P9 (A) | Tovu | 2 (delete + repoint) | A-adm-publish-content-1.J | B16 | 60 min | 2,095 |
| X-analytics-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-analytics-1.J | B16 | 60 min | 2,095 |
| X-pages-1.J | P9 (X) | Jini | 2 (move) | — | B17 | 60 min |  |
| X-fs-files-1.J | P9 (X) | Jini | 2 (move) | — | B17 | 60 min |  |
| A-adm-members-1.J | P9 (A) | Jini | 1 (move) | — | B17 | 60 min |  |
| X-content-duplication-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-content-duplication-1.J | B17 | 60 min | 2,089 |
| X-form-destinations-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-form-destinations-1.J | B17 | 60 min | 2,089 |
| X-vendor-credentials-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-vendor-credentials-1.J | B17 | 60 min | 2,089 |
| X-workspace-1.J | P9 (X) | Jini | 2 (move) | — | B18 | 60 min |  |
| X-webmcp-1.J | P9 (X) | Jini | 2 (move) | — | B18 | 60 min |  |
| A-adm-members-1.T | P9 (A) | Tovu | 1 (delete + repoint) | A-adm-members-1.J | B18 | 60 min | 2,082 |
| X-external-mcp-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-external-mcp-1.J | B18 | 60 min | 2,082 |
| X-fs-files-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-fs-files-1.J | B18 | 60 min | 2,082 |
| X-pages-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-pages-1.J | B18 | 60 min | 2,082 |
| A-adm-source-control-1.J | P9 (A) | Jini | 1 (move) | A-adm-shell-lib-3.J | B19 | 60 min |  |
| A-adm-roles-1.J | P9 (A) | Jini | 1 (move) | — | B19 | 60 min |  |
| K5-workspace-1.J | K5 | Jini | 2 (move) | X-workspace-1.J | B19 | 33 min |  |
| RT-K1-pub-oauth-1.J | RT-K1 | Jini | 1 (move) | — | B19 | 28 min |  |
| X-webmcp-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-webmcp-1.J | B19 | 60 min | 2,078 |
| X-workspace-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-workspace-1.J | B19 | 60 min | 2,078 |
| K5-webmcp-1.J | K5 | Jini | 1 (move) | X-webmcp-1.J | B20 | 33 min |  |
| RT-K1-pub-site-site-chat-markup-1.J | RT-K1 | Jini | 1 (move) | — | B20 | 27 min |  |
| RT-K1-pub-oauth-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-oauth-1.J | B20 | 25 min | 2,073 |
| K5-workspace-1.T | K5 | Tovu | 2 (delete + repoint) | K5-workspace-1.J | B20 | 33 min | 2,073 |
| A-adm-roles-1.T | P9 (A) | Tovu | 1 (delete + repoint) | A-adm-roles-1.J | B20 | 60 min | 2,073 |
| A-adm-source-control-1.T | P9 (A) | Tovu | 1 (delete + repoint) | A-adm-source-control-1.J | B20 | 60 min | 2,073 |
| X-image-transform-1.J | P9 (X) | Jini | 1 (move) | — | B21 | 60 min |  |
| X-change-sets-1.J | P9 (X) | Jini | 1 (move) | — | B21 | 60 min |  |
| C-contracts-core-1.J | P9 (C) | Jini | 1 (move) | — | B21 | 60 min |  |
| A-adm-users-1.J | P9 (A) | Jini | 1 (move) | — | B21 | 60 min |  |
| RT-K1-pub-site-site-chat-markup-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-site-chat-markup-1.J | B21 | 29 min | 2,071 |
| K5-webmcp-1.T | K5 | Tovu | 1 (delete + repoint) | K5-webmcp-1.J | B21 | 23 min | 2,071 |
| X-object-storage-1.J | P9 (X) | Jini | 1 (move) | — | B22 | 60 min |  |
| A-adm-other-6.J | P9 (A) | Jini | 12 (move) | A-adm-other-3.J, A-adm-users-1.J, A-adm-other-4.J, A-adm-other-2.J, A-adm-other-5.J | B22 | 60 min |  |
| A-adm-users-1.T | P9 (A) | Tovu | 1 (delete + repoint) | A-adm-users-1.J | B22 | 60 min | 2,067 |
| C-contracts-core-1.T | P9 (C) | Tovu | 1 (delete + repoint) | C-contracts-core-1.J | B22 | 60 min | 2,067 |
| X-change-sets-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-change-sets-1.J | B22 | 60 min | 2,067 |
| X-image-transform-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-image-transform-1.J | B22 | 60 min | 2,067 |
| X-site-search-1.J | P9 (X) | Jini | 1 (move) | — | B23 | 60 min |  |
| X-redirects-1.J | P9 (X) | Jini | 1 (move) | — | B23 | 60 min |  |
| X-permanent-delete-1.J | P9 (X) | Jini | 1 (move) | — | B23 | 60 min |  |
| RT-K1-0.J | RT-K1 | Jini | — | — | B23 | 100 min |  |
| A-adm-other-6.T | P9 (A) | Tovu | 12 (delete + repoint) | A-adm-other-6.J | B23 | 60 min | 2,054 |
| X-object-storage-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-object-storage-1.J | B23 | 60 min | 2,054 |
| RT-K1-adm-seo-1.J | RT-K1 | Jini | 5 (move) | RT-K1-0.J, R-admin-http-1.J | B24 | 105 min |  |
| RT-K1-adm-forms-1.J | RT-K1 | Jini | 5 (move) | RT-K1-0.J, R-admin-http-1.J | B24 | 89 min |  |
| RT-K1-0.T | RT-K1 | Tovu | — | RT-K1-0.J | B24 | 90 min |  |
| X-permanent-delete-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-permanent-delete-1.J | B24 | 60 min | 2,051 |
| X-redirects-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-redirects-1.J | B24 | 60 min | 2,051 |
| X-site-search-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-site-search-1.J | B24 | 60 min | 2,051 |
| RT-K1-adm-redirects-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J | B25 | 90 min |  |
| RT-K1-adm-forms-2.J | RT-K1 | Jini | 4 (move) | RT-K1-adm-forms-1.J, RT-K1-0.J, R-admin-http-1.J | B25 | 89 min |  |
| K4-i18n-common.J | K4 | Jini | — | — | B25 | 80 min |  |
| A-K2-0a.J | A-K2 | Jini | — | — | B25 | 110 min |  |
| RT-K1-adm-forms-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-forms-1.J, RT-K1-0.T | B25 | 54 min | 2,041 |
| RT-K1-adm-seo-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-seo-1.J, RT-K1-0.T | B25 | 57 min | 2,041 |
| RT-K1-adm-system-1.J | RT-K1 | Jini | 3 (move) | RT-K1-0.J | B26 | 84 min |  |
| RT-K1-adm-redirects-2.J | RT-K1 | Jini | 5 (move) | RT-K1-adm-redirects-1.J, RT-K1-0.J | B26 | 104 min |  |
| A-K2-redirects-1.J | A-K2 | Jini | 2 (move) | A-adm-shell-lib-2.J, K4-i18n-common.J | B26 | 41 min |  |
| K4-i18n-common.T | K4 | Tovu | — | K4-i18n-common.J | B26 | 60 min |  |
| RT-K1-adm-forms-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-forms-2.J, RT-K1-0.T | B26 | 43 min | 2,033 |
| RT-K1-adm-redirects-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-redirects-1.J, RT-K1-0.T | B26 | 42 min | 2,033 |
| RT-K1-adm-sites-1.J | RT-K1 | Jini | 2 (move) | RT-K1-0.J | B27 | 97 min |  |
| RT-K1-adm-content-1.J | RT-K1 | Jini | 1 (move) | RT-K1-0.J | B27 | 39 min |  |
| A-K2-seo-1.J | A-K2 | Jini | 2 (move) | K4-i18n-common.J | B27 | 44 min |  |
| A-K2-redirects-1.T | A-K2 | Tovu | 2 (delete + repoint) | A-K2-redirects-1.J, K4-i18n-common.T | B27 | 25 min | 2,023 |
| RT-K1-adm-redirects-2.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-redirects-2.J, RT-K1-0.T | B27 | 43 min | 2,023 |
| RT-K1-adm-system-1.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-system-1.J, RT-K1-0.T | B27 | 37 min | 2,023 |
| X-seo-1.J | P9 (X) | Jini | 1 (move) | — | B28 | 60 min |  |
| RT-K1-adm-database-recovery-1.J | RT-K1 | Jini | 1 (move) | RT-K1-0.J | B28 | 36 min |  |
| A-K2-0b.J | A-K2 | Jini | — | A-K2-0a.J | B28 | 110 min |  |
| A-K2-seo-1.T | A-K2 | Tovu | 2 (delete + repoint) | A-K2-seo-1.J, K4-i18n-common.T | B28 | 25 min | 2,018 |
| RT-K1-adm-content-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-content-1.J, RT-K1-0.T | B28 | 55 min | 2,018 |
| RT-K1-adm-sites-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-sites-1.J, RT-K1-0.T | B28 | 52 min | 2,018 |
| RT-K1-adm-recovery-1.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-database-recovery-1.J, RT-K1-0.J | B29 | 85 min |  |
| RT-K1-adm-database-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-database-recovery-1.J, RT-K1-0.J | B29 | 90 min |  |
| XC-1 | XC | Jini | — | — | B29 | 100 min |  |
| A-K2-0.J | A-K2 | Jini | — | A-K2-0b.J | B29 | 110 min |  |
| RT-K1-adm-database-recovery-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-database-recovery-1.J, RT-K1-0.T | B29 | 24 min | 2,016 |
| X-seo-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-seo-1.J | B29 | 60 min | 2,016 |
| X-widgets-1.J | P9 (X) | Jini | 1 (move) | — | B30 | 60 min |  |
| A-K2-shell-lib-1.J | A-K2 | Jini | 8 (move) | A-K2-0.J, K4-i18n-common.J | B30 | 102 min |  |
| A-K2-shell-components-2.J | A-K2 | Jini | 8 (move) | A-K2-0.J | B30 | 94 min |  |
| XC-2 | XC | Jini | — | XC-1 | B30 | 80 min |  |
| A-K2-0.T | A-K2 | Tovu | — | A-K2-0.J | B30 | 45 min |  |
| RT-K1-adm-database-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-database-2.J, RT-K1-0.T | B30 | 41 min | 2,013 |
| A-K2-shell-lib-2.J | A-K2 | Jini | 7 (move) | A-K2-0.J, A-adm-shell-lib-1.J, A-adm-shell-lib-3.J | B31 | 90 min |  |
| A-K2-shell-components-1.J | A-K2 | Jini | 7 (move) | A-K2-0.J, K4-i18n-common.J | B31 | 104 min |  |
| A-K2-shell-components-2.T | A-K2 | Tovu | 8 (delete + repoint) | A-K2-shell-components-2.J, A-K2-0.T | B31 | 34 min | 1,993 |
| A-K2-shell-lib-1.T | A-K2 | Tovu | 8 (delete + repoint) | A-K2-shell-lib-1.J, A-K2-0.T, K4-i18n-common.T | B31 | 43 min | 1,993 |
| RT-K1-adm-recovery-1.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-recovery-1.J, RT-K1-0.T | B31 | 40 min | 1,993 |
| X-widgets-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-widgets-1.J | B31 | 60 min | 1,993 |
| A-K2-shell-lib-4.J | A-K2 | Jini | 1 (move) | A-K2-shell-lib-2.J, A-adm-shell-lib-2.J, A-adm-shell-lib-3.J, A-adm-shell-lib-1.J | B32 | 35 min |  |
| A-K2-admin-themes-1.J | A-K2 | Jini | 3 (move) | K4-i18n-common.J, A-adm-other-1.J, A-K2-0.J | B32 | 50 min |  |
| XC-5 | XC | Jini | — | — | B32 | 80 min |  |
| XC-4 | XC | Jini | — | — | B32 | 100 min |  |
| XC-3 | XC | Jini | — | — | B32 | 110 min |  |
| A-K2-shell-components-1.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-shell-components-1.J, A-K2-0.T, K4-i18n-common.T | B32 | 31 min | 1,986 |
| A-K2-pages-1.J | A-K2 | Jini | 11 (move) | A-K2-0.J, K4-i18n-common.J, A-adm-pages-1.J, A-adm-shell-lib-3.J, A-adm-themes-1.J, A-adm-posts-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J | B33 | 104 min |  |
| A-K2-collections-1.J | A-K2 | Jini | 16 (move) | K4-i18n-common.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-1.J, A-adm-other-4.J | B33 | 89 min |  |
| S6b.J | S6 | Jini | — | — | B33 | 110 min |  |
| XC-6a | XC | Jini | — | — | B33 | 90 min |  |
| A-K2-admin-themes-1.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-admin-themes-1.J, K4-i18n-common.T, A-K2-0.T | B33 | 28 min | 1,976 |
| A-K2-shell-lib-2.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-shell-lib-2.J, A-K2-0.T | B33 | 47 min | 1,976 |
| A-K2-themes-1.J | A-K2 | Jini | 11 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-themes-1.J, A-adm-shell-hooks-1.J, A-K2-pages-1.J, A-K2-0.J, A-adm-shell-lib-4.J | B34 | 103 min |  |
| A-K2-import-export-1.J | A-K2 | Jini | 10 (move) | K4-i18n-common.J, A-K2-0.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-2.J, A-adm-shell-lib-3.J | B34 | 75 min |  |
| K4-seam-1.J | K4 | Jini | — | — | B34 | 81 min |  |
| XC-6b | XC | Jini | — | XC-6a | B34 | 100 min |  |
| S6b.T | S | Tovu | — | S6b.J | B34 | 60 min |  |
| A-K2-collections-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-collections-1.J, K4-i18n-common.T | B34 | 64 min | 1,960 |
| K5-publish-content-1.J | K5 | Jini | 11 (move) | K4-seam-1.J | B35 | 58 min |  |
| K4-contracts-core-5.J | K4 | Jini | 16 (move) | K4-seam-1.J | B35 | 92 min |  |
| K5-contracts-core-4.J | K5 | Jini | 16 (move) | K4-seam-1.J | B35 | 96 min |  |
| A-K2-menus-1.J | A-K2 | Jini | 8 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-2.J, A-adm-other-6.J, A-adm-shell-lib-3.J, A-K2-shell-lib-2.J, A-adm-other-5.J, C-platform-html-1.J, A-K2-0.J | B35 | 68 min |  |
| K4-seam-1.T | K4 | Tovu | — | K4-seam-1.J | B35 | 65 min |  |
| A-K2-pages-1.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-pages-1.J, A-K2-0.T, K4-i18n-common.T | B35 | 54 min | 1,949 |
| K5-observability-1.J | K5 | Jini | 1 (move) | K4-contracts-core-5.J | B36 | 27 min |  |
| A-K2-fs-files-1.J | A-K2 | Jini | 4 (move) | A-K2-0.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J | B36 | 47 min |  |
| A-K2-comments-1.J | A-K2 | Jini | 3 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-1.J | B36 | 42 min |  |
| A-K2-themes-1.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-themes-1.J, K4-i18n-common.T, A-K2-0.T | B36 | 67 min | 1,906 |
| K5-contracts-core-4.T | K5 | Tovu | 16 (delete + repoint) | K5-contracts-core-4.J, K4-seam-1.T | B36 | 55 min | 1,906 |
| K4-contracts-core-5.T | K4 | Tovu | 16 (delete + repoint) | K4-contracts-core-5.J, K4-seam-1.T | B36 | 42 min | 1,906 |
| A-K2-widgets-1.J | A-K2 | Jini | 3 (move) | A-adm-shell-lib-2.J, K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-3.J | B37 | 45 min |  |
| A-K2-forms-1.J | A-K2 | Jini | 3 (move) | A-adm-other-4.J, K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-1.J | B37 | 48 min |  |
| K4-seam-2.J | K4 | Jini | — | — | B37 | 104 min |  |
| XC-6c | XC | Jini | — | XC-6b | B37 | 110 min |  |
| A-K2-import-export-1.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-import-export-1.J, K4-i18n-common.T, A-K2-0.T | B37 | 41 min | 1,885 |
| K5-publish-content-1.T | K5 | Tovu | 11 (delete + repoint) | K5-publish-content-1.J, K4-seam-1.T | B37 | 89 min | 1,885 |
| K5-publish-trust-1.J | K5 | Jini | 6 (move) | K4-seam-1.J, P-publish-trust-1.J, K4-seam-2.J | B38 | 59 min |  |
| K4-seam-3.J | K4 | Jini | — | — | B38 | 23 min |  |
| XC-6d | XC | Jini | — | XC-6c | B38 | 110 min |  |
| K4-seam-2.T | K4 | Tovu | — | K4-seam-2.J | B38 | 83 min |  |
| A-K2-menus-1.T | A-K2 | Tovu | 8 (delete + repoint) | A-K2-menus-1.J, K4-i18n-common.T, A-K2-0.T | B38 | 49 min | 1,876 |
| K5-observability-1.T | K5 | Tovu | 1 (delete + repoint) | K5-observability-1.J, K4-contracts-core-5.T | B38 | 20 min | 1,876 |
| K5-presentation-1.J | K5 | Jini | 3 (move) | K4-seam-3.J | B39 | 37 min |  |
| K4-seam-5.J | K4 | Jini | — | — | B39 | 96 min |  |
| K4-seam-4.J | K4 | Jini | — | — | B39 | 110 min |  |
| K4-seam-3.T | K4 | Tovu | — | K4-seam-3.J | B39 | 18 min |  |
| A-K2-fs-files-1.T | A-K2 | Tovu | 4 (delete + repoint) | A-K2-fs-files-1.J, A-K2-0.T | B39 | 26 min | 1,866 |
| K5-publish-trust-1.T | K5 | Tovu | 6 (delete + repoint) | K5-publish-trust-1.J, K4-seam-1.T, K4-seam-2.T | B39 | 54 min | 1,866 |
| A-K2-media-1.J | A-K2 | Jini | 14 (move) | A-K2-0.J, K4-seam-5.J, K4-i18n-common.J, A-adm-shell-lib-3.J, A-adm-other-5.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-shell-lib-4.J | B40 | 97 min |  |
| A-K2-integrations-1.J | A-K2 | Jini | 13 (move) | K4-i18n-common.J, A-adm-other-2.J, K4-seam-5.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-4.J, A-adm-shell-hooks-1.J, A-adm-other-6.J | B40 | 69 min |  |
| K4-seam-4.T | K4 | Tovu | — | K4-seam-4.J | B40 | 89 min |  |
| K4-seam-5.T | K4 | Tovu | — | K4-seam-5.J | B40 | 77 min |  |
| A-K2-comments-1.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-comments-1.J, K4-i18n-common.T | B40 | 25 min | 1,860 |
| K5-presentation-1.T | K5 | Tovu | 3 (delete + repoint) | K5-presentation-1.J, K4-seam-3.T | B40 | 47 min | 1,860 |
| A-K2-settings-1.J | A-K2 | Jini | 16 (move) | K4-i18n-common.J, A-K2-0.J, A-K2-integrations-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-3.J, A-adm-other-3.J | B41 | 91 min |  |
| A-K2-email-1.J | A-K2 | Jini | 16 (move) | A-adm-other-1.J, K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-K2-pages-1.J, A-K2-0.J, A-adm-shell-lib-3.J, A-K2-integrations-1.J | B41 | 74 min |  |
| K4-seam-7.J | K4 | Jini | — | — | B41 | 88 min |  |
| K4-seam-6.J | K4 | Jini | — | — | B41 | 83 min |  |
| A-K2-media-1.T | A-K2 | Tovu | 14 (delete + repoint) | A-K2-media-1.J, A-K2-0.T, K4-seam-5.T, K4-i18n-common.T | B41 | 109 min | 1,846 |
| K5-deployments-1.J | K5 | Jini | 15 (move) | K4-seam-1.J, K4-seam-5.J, K4-seam-6.J, K4-seam-3.J, K4-seam-2.J | B42 | 91 min |  |
| A-K2-roles-1.J | A-K2 | Jini | 16 (move) | A-adm-shell-lib-2.J, K4-i18n-common.J, A-adm-shell-components-1.J, A-adm-shell-lib-3.J, A-K2-0.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-roles-1.J, K4-seam-6.J | B42 | 86 min |  |
| A-K2-posts-1.J | A-K2 | Jini | 12 (move) | A-K2-0.J, A-adm-shell-lib-2.J, K4-i18n-common.J, A-adm-posts-1.J, A-adm-shell-lib-4.J, A-K2-media-1.J, A-adm-themes-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, T-post-1.J | B42 | 103 min |  |
| K4-seam-6.T | K4 | Tovu | — | K4-seam-6.J | B42 | 66 min |  |
| K4-seam-7.T | K4 | Tovu | — | K4-seam-7.J | B42 | 70 min |  |
| A-K2-email-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-email-1.J, K4-i18n-common.T, A-K2-0.T | B42 | 59 min | 1,830 |
| K5-agent-plugins-1.J | K5 | Jini | 6 (move) | K4-seam-6.J, K4-seam-1.J | B43 | 67 min |  |
| A-K2-roles-2.J | A-K2 | Jini | 2 (move) | A-adm-roles-1.J, A-K2-roles-1.J | B43 | 27 min |  |
| A-K2-providers-1.J | A-K2 | Jini | 10 (move) | K4-i18n-common.J, A-K2-integrations-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-2.J, A-adm-other-5.J, A-K2-0.J | B43 | 69 min |  |
| K4-seam-8.J | K4 | Jini | — | — | B43 | 84 min |  |
| A-K2-roles-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-roles-1.J, K4-i18n-common.T, A-K2-0.T, K4-seam-6.T | B43 | 49 min | 1,799 |
| K5-deployments-1.T | K5 | Tovu | 15 (delete + repoint) | K5-deployments-1.J, K4-seam-1.T, K4-seam-5.T, K4-seam-6.T, K4-seam-3.T, K4-seam-2.T | B43 | 83 min | 1,799 |
| A-K2-plugins-1.J | A-K2 | Jini | 9 (move) | A-K2-0.J, K4-seam-8.J, K4-i18n-common.J, A-K2-shell-lib-1.J, A-adm-shell-components-1.J | B44 | 104 min |  |
| K4-seam-9.J | K4 | Jini | — | — | B44 | 99 min |  |
| K4-seam-8.T | K4 | Tovu | — | K4-seam-8.J | B44 | 67 min |  |
| A-K2-roles-2.T | A-K2 | Tovu | 2 (delete + repoint) | A-K2-roles-2.J | B44 | 17 min | 1,775 |
| A-K2-settings-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-settings-1.J, K4-i18n-common.T, A-K2-0.T | B44 | 49 min | 1,775 |
| K5-agent-plugins-1.T | K5 | Tovu | 6 (delete + repoint) | K5-agent-plugins-1.J, K4-seam-6.T, K4-seam-1.T | B44 | 41 min | 1,775 |
| K5-platform-mail-1.J | K5 | Jini | 7 (move) | K4-seam-4.J, K4-seam-2.J, K4-seam-9.J | B45 | 92 min |  |
| A-K2-shell-components-3.J | A-K2 | Jini | 10 (move) | K4-i18n-common.J, A-adm-shell-components-1.J, A-K2-0.J, A-K2-plugins-1.J, A-adm-other-2.J, A-adm-shell-lib-2.J, A-K2-shell-components-2.J, A-K2-media-1.J | B45 | 105 min |  |
| A-K2-security-1.J | A-K2 | Jini | 16 (move) | K4-seam-5.J, K4-seam-9.J, A-adm-shell-components-1.J, A-K2-0.J, A-K2-integrations-1.J, A-K2-media-1.J, K4-seam-8.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-K2-providers-1.J, SEC-adm-security-1.J | B45 | 94 min |  |
| K4-seam-10.J | K4 | Jini | — | — | B45 | 93 min |  |
| K4-seam-9.T | K4 | Tovu | — | K4-seam-9.J | B45 | 79 min |  |
| A-K2-integrations-1.T | A-K2 | Tovu | 13 (delete + repoint) | A-K2-integrations-1.J, K4-i18n-common.T, K4-seam-5.T | B45 | 94 min | 1,762 |
| A-K2-plugins-2.J | A-K2 | Jini | 16 (move) | A-K2-plugins-1.J, A-adm-shell-components-1.J, A-K2-0.J, A-K2-integrations-1.J, A-adm-shell-lib-3.J, A-adm-other-5.J, A-K2-shell-components-3.J, A-adm-other-2.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, K4-seam-8.J | B46 | 80 min |  |
| A-K2-deployment-1.J | A-K2 | Jini | 16 (move) | A-K2-security-1.J, A-adm-shell-lib-3.J, K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-2.J, A-K2-import-export-1.J, A-adm-deployment-1.J, A-adm-shell-components-1.J, A-K2-0.J | B46 | 82 min |  |
| K4-seam-10.T | K4 | Tovu | — | K4-seam-10.J | B46 | 75 min |  |
| A-K2-security-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-security-1.J, K4-seam-5.T, K4-seam-9.T, A-K2-0.T, K4-seam-8.T | B46 | 86 min | 1,729 |
| A-K2-shell-components-3.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-shell-components-3.J, K4-i18n-common.T, A-K2-0.T | B46 | 51 min | 1,729 |
| K5-platform-mail-1.T | K5 | Tovu | 7 (delete + repoint) | K5-platform-mail-1.J, K4-seam-4.T, K4-seam-2.T, K4-seam-9.T | B46 | 50 min | 1,729 |
| K4-plugins-1.J | K4 | Jini | 2 (move) | K4-seam-10.J | B47 | 29 min |  |
| K5-platform-mail-2.J | K5 | Jini | 1 (move) | K5-platform-mail-1.J, K4-seam-4.J | B47 | 33 min |  |
| A-K2-source-control-1.J | A-K2 | Jini | 11 (move) | A-adm-shell-lib-2.J, K4-i18n-common.J, A-adm-shell-components-1.J, A-K2-0.J, A-K2-deployment-1.J, K4-seam-5.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-K2-shell-lib-1.J, A-K2-shell-components-3.J, A-adm-shell-lib-3.J, A-adm-shell-lib-4.J, A-adm-source-control-1.J | B47 | 72 min |  |
| A-K2-plugins-3.J | A-K2 | Jini | 16 (move) | A-K2-plugins-2.J, A-adm-shell-components-2.J, A-K2-integrations-1.J, A-K2-plugins-1.J, A-adm-other-2.J, A-K2-providers-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-1.J, A-adm-other-5.J, A-adm-shell-components-1.J, A-K2-shell-components-2.J, A-K2-0.J, A-adm-shell-hooks-1.J | B47 | 82 min |  |
| A-K2-deployment-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-deployment-1.J, K4-i18n-common.T, A-K2-0.T | B47 | 77 min | 1,704 |
| A-K2-plugins-1.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-plugins-1.J, A-K2-0.T, K4-seam-8.T, K4-i18n-common.T | B47 | 61 min | 1,704 |
| K5-newsletter-1.J | K5 | Jini | 13 (move) | K4-seam-1.J, K4-seam-10.J, K5-platform-mail-2.J | B48 | 79 min |  |
| K5-members-1.J | K5 | Jini | 13 (move) | K4-seam-1.J, K4-seam-5.J, K5-platform-mail-2.J, K4-seam-4.J | B48 | 79 min |  |
| A-K2-skills-1.J | A-K2 | Jini | 15 (move) | A-K2-0.J, A-adm-other-3.J, K4-i18n-common.J, A-K2-shell-lib-4.J, A-adm-shell-lib-1.J, A-adm-other-2.J, A-K2-plugins-3.J, A-K2-plugins-2.J, A-adm-other-5.J, A-adm-shell-components-2.J, A-K2-plugins-1.J | B48 | 91 min |  |
| A-K2-plugins-2.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-plugins-2.J, A-K2-0.T, K4-seam-8.T | B48 | 65 min | 1,685 |
| K5-platform-mail-2.T | K5 | Tovu | 1 (delete + repoint) | K5-platform-mail-2.J, K4-seam-4.T | B48 | 59 min | 1,685 |
| K4-plugins-1.T | K4 | Tovu | 2 (delete + repoint) | K4-plugins-1.J, K4-seam-10.T | B48 | 18 min | 1,685 |
| A-K2-auth-1.J | A-K2 | Jini | 9 (move) | A-adm-shell-lib-3.J, K4-i18n-common.J, A-K2-shell-lib-4.J, A-adm-other-1.J, A-adm-other-4.J, A-K2-shell-components-3.J | B49 | 59 min |  |
| K4-seam-11.J | K4 | Jini | — | — | B49 | 44 min |  |
| A-K2-plugins-3.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-plugins-3.J, A-K2-0.T | B49 | 59 min | 1,631 |
| A-K2-posts-1.T | A-K2 | Tovu | 12 (delete + repoint) | A-K2-posts-1.J, A-K2-0.T, K4-i18n-common.T | B49 | 68 min | 1,631 |
| K5-members-1.T | K5 | Tovu | 13 (delete + repoint) | K5-members-1.J, K4-seam-1.T, K4-seam-5.T, K4-seam-4.T | B49 | 104 min | 1,631 |
| K5-newsletter-1.T | K5 | Tovu | 13 (delete + repoint) | K5-newsletter-1.J, K4-seam-1.T, K4-seam-10.T | B49 | 106 min | 1,631 |
| K4-seam-13.J | K4 | Jini | — | — | B50 | 86 min |  |
| K4-seam-12.J | K4 | Jini | — | — | B50 | 110 min |  |
| K4-seam-11.T | K4 | Tovu | — | K4-seam-11.J | B50 | 36 min |  |
| A-K2-auth-1.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-auth-1.J, K4-i18n-common.T | B50 | 47 min | 1,607 |
| A-K2-skills-1.T | A-K2 | Tovu | 15 (delete + repoint) | A-K2-skills-1.J, A-K2-0.T, K4-i18n-common.T | B50 | 56 min | 1,607 |
| K5-tool-audit-1.J | K5 | Jini | 5 (move) | K4-seam-13.J | B51 | 58 min |  |
| K5-site-backup-1.J | K5 | Jini | 8 (move) | K4-seam-1.J, K4-seam-5.J, K4-seam-11.J, X-agent-plugins-1.J, K4-seam-13.J, C-platform-html-1.J | B51 | 97 min |  |
| RT-K1-adm-sites-2.J | RT-K1 | Jini | 2 (move) | RT-K1-0.J, K4-seam-12.J | B51 | 85 min |  |
| K4-seam-12.T | K4 | Tovu | — | K4-seam-12.J | B51 | 98 min |  |
| K4-seam-13.T | K4 | Tovu | — | K4-seam-13.J | B51 | 68 min |  |
| A-K2-source-control-1.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-source-control-1.J, K4-i18n-common.T, A-K2-0.T, K4-seam-5.T | B51 | 55 min | 1,596 |
| K4-seam-15.J | K4 | Jini | — | — | B52 | 98 min |  |
| K4-seam-14.J | K4 | Jini | — | — | B52 | 96 min |  |
| A-K2-providers-1.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-providers-1.J, K4-i18n-common.T, A-K2-0.T | B52 | 32 min | 1,571 |
| RT-K1-adm-sites-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-sites-2.J, RT-K1-0.T, K4-seam-12.T | B52 | 44 min | 1,571 |
| K5-site-backup-1.T | K5 | Tovu | 8 (delete + repoint) | K5-site-backup-1.J, K4-seam-1.T, K4-seam-5.T, K4-seam-11.T, K4-seam-13.T | B52 | 103 min | 1,571 |
| K5-tool-audit-1.T | K5 | Tovu | 5 (delete + repoint) | K5-tool-audit-1.J, K4-seam-13.T | B52 | 38 min | 1,571 |
| K5-identity-1.J | K5 | Jini | 9 (move) | K4-contracts-core-5.J, X-identity-1.J, K4-seam-15.J | B53 | 94 min |  |
| K4-contracts-headless-1.J | K4 | Jini | 7 (move) | K4-seam-6.J, K4-seam-14.J, K4-seam-7.J, K4-seam-1.J | B53 | 52 min |  |
| RT-K1-adm-assistant-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, K4-seam-14.J | B53 | 84 min |  |
| K4-seam-14.T | K4 | Tovu | — | K4-seam-14.J | B53 | 77 min |  |
| K4-seam-15.T | K4 | Tovu | — | K4-seam-15.J | B53 | 78 min |  |
| A-K2-forms-1.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-forms-1.J, K4-i18n-common.T | B53 | 40 min | 1,568 |
| RT-K1-adm-assistant-3.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-assistant-1.J, RT-K1-0.J | B54 | 90 min |  |
| RT-K1-adm-assistant-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-assistant-1.J, RT-K1-0.J, K4-seam-14.J | B54 | 99 min |  |
| A-K2-widgets-1.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-widgets-1.J, K4-i18n-common.T | B54 | 32 min | 1,545 |
| RT-K1-adm-assistant-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-assistant-1.J, RT-K1-0.T, K4-seam-14.T | B54 | 50 min | 1,545 |
| K4-contracts-headless-1.T | K4 | Tovu | 7 (delete + repoint) | K4-contracts-headless-1.J, K4-seam-6.T, K4-seam-14.T, K4-seam-7.T, K4-seam-1.T | B54 | 29 min | 1,545 |
| K5-identity-1.T | K5 | Tovu | 9 (delete + repoint) | K5-identity-1.J, K4-contracts-core-5.T, K4-seam-15.T | B54 | 45 min | 1,545 |
| RT-K1-adm-assistant-4.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-assistant-1.J, RT-K1-0.J | B55 | 82 min |  |
| K4-seam-17.J | K4 | Jini | — | — | B55 | 85 min |  |
| K4-seam-16.J | K4 | Jini | — | — | B55 | 91 min |  |
| A-K2-shell-lib-4.T | A-K2 | Tovu | 1 (delete + repoint) | A-K2-shell-lib-4.J | B55 | 120 min | 1,541 |
| RT-K1-adm-assistant-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-assistant-2.J, RT-K1-0.T, K4-seam-14.T | B55 | 44 min | 1,541 |
| K5-theme-1.J | K5 | Jini | 15 (move) | K4-seam-1.J, K4-seam-5.J, K4-seam-16.J, T-theme-1.J, K4-seam-6.J, C-platform-html-1.J | B56 | 101 min |  |
| A-K2-shell-hooks-1.J | A-K2 | Jini | 10 (move) | K4-seam-8.J, A-adm-shell-lib-2.J, A-K2-shell-lib-1.J, K4-seam-14.J, K4-seam-17.J, A-K2-shell-lib-2.J, A-K2-0.J, A-adm-shell-lib-4.J, A-adm-shell-lib-1.J, A-adm-shell-hooks-1.J | B56 | 104 min |  |
| K4-seam-18.J | K4 | Jini | — | — | B56 | 99 min |  |
| K4-seam-16.T | K4 | Tovu | — | K4-seam-16.J | B56 | 72 min |  |
| K4-seam-17.T | K4 | Tovu | — | K4-seam-17.J | B56 | 68 min |  |
| RT-K1-adm-assistant-3.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-assistant-3.J, RT-K1-0.T | B56 | 40 min | 1,538 |
| K5-theme-2.J | K5 | Jini | 16 (move) | C-platform-html-1.J, K5-theme-1.J, T-theme-1.J, K4-seam-6.J, K5-platform-routing-1.J, K4-seam-5.J, K4-seam-16.J | B57 | 91 min |  |
| A-K2-shell-components-4.J | A-K2 | Jini | 11 (move) | A-K2-shell-components-2.J, A-K2-0.J, A-K2-media-1.J, A-adm-other-1.J, A-K2-shell-lib-2.J, A-K2-shell-components-3.J, A-adm-shell-components-1.J, A-adm-shell-lib-4.J, A-adm-other-2.J, A-K2-plugins-1.J, A-adm-shell-lib-3.J, A-adm-shell-components-2.J, A-K2-shell-hooks-1.J, K4-seam-14.J | B57 | 99 min |  |
| K4-seam-18.T | K4 | Tovu | — | K4-seam-18.J | B57 | 79 min |  |
| A-K2-shell-hooks-1.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-shell-hooks-1.J, K4-seam-8.T, K4-seam-14.T, K4-seam-17.T, A-K2-0.T | B57 | 63 min | 1,510 |
| RT-K1-adm-assistant-4.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-assistant-4.J, RT-K1-0.T | B57 | 44 min | 1,510 |
| K5-theme-1.T | K5 | Tovu | 15 (delete + repoint) | K5-theme-1.J, K4-seam-1.T, K4-seam-5.T, K4-seam-16.T, K4-seam-6.T | B57 | 107 min | 1,510 |
| K5-theme-3.J | K5 | Jini | 9 (move) | K5-theme-2.J, K5-theme-1.J | B58 | 63 min |  |
| K5-desktop-1.J | K5 | Jini | 5 (move) | K4-seam-17.J, K4-seam-18.J | B58 | 67 min |  |
| K5-contracts-core-1.J | K5 | Jini | 7 (move) | K4-seam-18.J | B58 | 95 min |  |
| A-K2-shell-components-5.J | A-K2 | Jini | 12 (move) | A-adm-themes-1.J, A-adm-shell-components-2.J, A-adm-shell-components-1.J, A-K2-shell-components-4.J, A-K2-shell-components-3.J, A-K2-0.J, A-K2-shell-lib-4.J, A-K2-shell-lib-1.J, A-adm-shell-lib-1.J, A-adm-shell-lib-3.J, A-K2-plugins-1.J, A-adm-other-2.J, A-K2-skills-1.J, A-K2-media-1.J, A-K2-shell-components-2.J, A-adm-other-1.J, A-K2-collections-1.J, A-K2-menus-1.J, A-K2-forms-1.J, A-adm-other-3.J, A-K2-widgets-1.J | B58 | 98 min |  |
| A-K2-shell-components-4.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-shell-components-4.J, A-K2-0.T, K4-seam-14.T | B58 | 43 min | 1,483 |
| K5-theme-2.T | K5 | Tovu | 16 (delete + repoint) | K5-theme-2.J, K4-seam-6.T, K4-seam-5.T, K4-seam-16.T | B58 | 89 min | 1,483 |
| K5-contracts-core-6.J | K5 | Jini | 16 (move) | K4-seam-1.J, K5-contracts-core-1.J | B59 | 93 min |  |
| A-K2-shell-lib-3.J | A-K2 | Jini | 4 (move) | K5-contracts-core-1.J, A-K2-shell-lib-2.J, A-adm-shell-lib-2.J, A-K2-0.J, A-K2-shell-lib-1.J | B59 | 61 min |  |
| A-K2-shell-components-5.T | A-K2 | Tovu | 12 (delete + repoint) | A-K2-shell-components-5.J, A-K2-0.T | B59 | 45 min | 1,450 |
| K5-contracts-core-1.T | K5 | Tovu | 7 (delete + repoint) | K5-contracts-core-1.J, K4-seam-18.T | B59 | 74 min | 1,450 |
| K5-desktop-1.T | K5 | Tovu | 5 (delete + repoint) | K5-desktop-1.J, K4-seam-17.T, K4-seam-18.T | B59 | 46 min | 1,450 |
| K5-theme-3.T | K5 | Tovu | 9 (delete + repoint) | K5-theme-3.J | B59 | 103 min | 1,450 |
| K5-skills-1.J | K5 | Jini | 4 (move) | K5-contracts-core-6.J, K4-contracts-headless-1.J, X-skills-1.J | B60 | 53 min |  |
| V-change-sets-1.J | V | Jini | 1 (move) | K5-contracts-core-4.J, K5-contracts-core-6.J, X-change-sets-1.J | B60 | 23 min |  |
| A-K2-shell-lib-5.J | A-K2 | Jini | 12 (move) | A-adm-other-2.J, A-adm-shell-lib-3.J, A-adm-shell-lib-1.J, A-K2-shell-lib-3.J, A-K2-shell-lib-2.J, K5-contracts-core-1.J, A-K2-0.J, A-K2-shell-lib-4.J, A-K2-deployment-1.J, A-K2-source-control-1.J, K4-seam-6.J | B60 | 104 min |  |
| K4-seam-19.J | K4 | Jini | — | — | B60 | 93 min |  |
| A-K2-shell-lib-3.T | A-K2 | Tovu | 4 (delete + repoint) | A-K2-shell-lib-3.J, A-K2-0.T | B60 | 22 min | 1,430 |
| K5-contracts-core-6.T | K5 | Tovu | 16 (delete + repoint) | K5-contracts-core-6.J, K4-seam-1.T | B60 | 98 min | 1,430 |
| K5-contracts-core-3.J | K5 | Jini | 5 (move) | K4-seam-19.J, K4-seam-10.J | B61 | 53 min |  |
| K5-contracts-core-2.J | K5 | Jini | 8 (move) | K4-seam-14.J, K4-seam-18.J, K4-seam-19.J, K4-seam-10.J | B61 | 84 min |  |
| RT-K1-adm-change-sets-1.J | RT-K1 | Jini | 4 (move) | V-change-sets-1.J, RT-K1-adm-content-1.J, RT-K1-0.J, K5-contracts-core-6.J | B61 | 74 min |  |
| K4-seam-19.T | K4 | Tovu | — | K4-seam-19.J | B61 | 75 min |  |
| A-K2-shell-lib-5.T | A-K2 | Tovu | 12 (delete + repoint) | A-K2-shell-lib-5.J, A-K2-0.T, K4-seam-6.T | B61 | 56 min | 1,414 |
| K5-skills-1.T | K5 | Tovu | 4 (delete + repoint) | K5-skills-1.J, K4-contracts-headless-1.T | B61 | 49 min | 1,414 |
| K5-webhooks-1.J | K5 | Jini | 7 (move) | K4-seam-2.J, K4-seam-9.J, K5-contracts-core-3.J | B62 | 65 min |  |
| K5-source-control-1.J | K5 | Jini | 12 (move) | K4-seam-1.J, K4-seam-2.J, K5-contracts-core-2.J, X-vendor-credentials-1.J, K4-seam-5.J | B62 | 97 min |  |
| RT-K1-pub-site-1.J | RT-K1 | Jini | 8 (move) | R-public-http-1.J, RT-K1-0.J, K5-contracts-core-3.J, X-settings-1.J, C-platform-html-1.J, K5-platform-routing-1.J | B62 | 99 min |  |
| RT-K1-adm-change-sets-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-change-sets-1.J, RT-K1-0.T | B62 | 37 min | 1,401 |
| V-change-sets-1.T | V | Tovu | 1 (delete + repoint) | V-change-sets-1.J | B62 | 17 min | 1,401 |
| K5-contracts-core-2.T | K5 | Tovu | 8 (delete + repoint) | K5-contracts-core-2.J, K4-seam-14.T, K4-seam-18.T, K4-seam-19.T, K4-seam-10.T | B62 | 104 min | 1,401 |
| K5-post-1.J | K5 | Jini | 6 (move) | K4-seam-5.J, K4-seam-3.J, K5-contracts-core-3.J, T-post-1.J, K5-platform-routing-1.J | B63 | 50 min |  |
| K5-contracts-core-7.J | K5 | Jini | 4 (move) | K5-contracts-core-1.J, K5-contracts-core-2.J, K4-seam-3.J, K4-seam-14.J, K4-seam-19.J | B63 | 90 min |  |
| RT-K1-adm-skills-1.J | RT-K1 | Jini | 3 (move) | RT-K1-0.J, K5-skills-1.J | B63 | 85 min |  |
| RT-K1-pub-site-1.T | RT-K1 | Tovu | 8 (delete + repoint) | RT-K1-pub-site-1.J, RT-K1-0.T | B63 | 79 min | 1,374 |
| K5-source-control-1.T | K5 | Tovu | 12 (delete + repoint) | K5-source-control-1.J, K4-seam-1.T, K4-seam-2.T, K4-seam-5.T | B63 | 86 min | 1,374 |
| K5-webhooks-1.T | K5 | Tovu | 7 (delete + repoint) | K5-webhooks-1.J, K4-seam-2.T, K4-seam-9.T | B63 | 92 min | 1,374 |
| K4-publish-content-2.J | K4 | Jini | 3 (move) | K4-seam-5.J, K5-publish-content-1.J, K5-contracts-core-3.J | B64 | 36 min |  |
| K5-post-2.J | K5 | Jini | 4 (move) | K5-post-1.J, K5-contracts-core-3.J | B64 | 52 min |  |
| K5-custom-credentials-1.J | K5 | Jini | 8 (move) | K4-seam-10.J, K4-seam-15.J, K5-contracts-core-7.J, K5-contracts-core-1.J | B64 | 91 min |  |
| RT-K1-adm-skills-1.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-skills-1.J, RT-K1-0.T | B64 | 43 min | 1,361 |
| K5-contracts-core-7.T | K5 | Tovu | 4 (delete + repoint) | K5-contracts-core-7.J, K4-seam-3.T, K4-seam-14.T, K4-seam-19.T | B64 | 64 min | 1,361 |
| K5-post-1.T | K5 | Tovu | 6 (delete + repoint) | K5-post-1.J, K4-seam-5.T, K4-seam-3.T | B64 | 110 min | 1,361 |
| K5-site-backup-2.J | K5 | Jini | 7 (move) | C-platform-html-1.J, K5-site-backup-1.J, K4-seam-12.J, K4-publish-content-2.J | B65 | 87 min |  |
| K5-post-3.J | K5 | Jini | 14 (move) | K5-post-1.J, T-post-1.J, K5-post-2.J, K5-contracts-core-3.J, K5-contracts-core-6.J | B65 | 83 min |  |
| K5-contracts-headless-2.J | K5 | Jini | 1 (move) | C-contracts-headless-1.J, K4-contracts-headless-1.J, K4-seam-19.J | B65 | 30 min |  |
| RT-K1-adm-plugin-hook-error-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-2.J | B65 | 32 min |  |
| K5-custom-credentials-1.T | K5 | Tovu | 8 (delete + repoint) | K5-custom-credentials-1.J, K4-seam-10.T, K4-seam-15.T | B65 | 104 min | 1,349 |
| K5-post-2.T | K5 | Tovu | 4 (delete + repoint) | K5-post-2.J | B65 | 97 min | 1,349 |
| K5-trash-1.J | K5 | Jini | 13 (move) | X-identity-1.J, K4-seam-15.J, X-trash-1.J, K5-contracts-headless-2.J | B66 | 90 min |  |
| RT-K1-adm-widgets-1.J | RT-K1 | Jini | 4 (move) | RT-K1-adm-plugin-hook-error-1.J, RT-K1-0.J, K4-seam-5.J | B66 | 96 min |  |
| A-K2-webmcp-1.J | A-K2 | Jini | 3 (move) | K4-i18n-common.J, A-adm-other-3.J, K5-contracts-headless-2.J | B66 | 38 min |  |
| RT-K1-adm-plugin-hook-error-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-plugin-hook-error-1.J | B66 | 27 min | 1,329 |
| K5-contracts-core-3.T | K5 | Tovu | 5 (delete + repoint) | K5-contracts-core-3.J, K4-seam-19.T, K4-seam-10.T | B66 | 109 min | 1,329 |
| K5-post-3.T | K5 | Tovu | 14 (delete + repoint) | K5-post-3.J | B66 | 109 min | 1,329 |
| K4-trash-2.J | K4 | Jini | 3 (move) | X-trash-1.J, K5-trash-1.J, K5-contracts-core-6.J, K4-seam-5.J | B67 | 31 min |  |
| V-agent-plugins-2.J | V | Jini | 1 (move) | K5-contracts-headless-2.J | B67 | 23 min |  |
| A-K2-webmcp-1.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-webmcp-1.J, K4-i18n-common.T | B67 | 27 min | 1,306 |
| RT-K1-adm-widgets-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-widgets-1.J, RT-K1-0.T, K4-seam-5.T | B67 | 53 min | 1,306 |
| K4-publish-content-2.T | K4 | Tovu | 3 (delete + repoint) | K4-publish-content-2.J, K4-seam-5.T | B67 | 101 min | 1,306 |
| K5-trash-1.T | K5 | Tovu | 13 (delete + repoint) | K5-trash-1.J, K4-seam-15.T | B67 | 101 min | 1,306 |
| K5-webhooks-2.J | K5 | Jini | 1 (move) | K5-webhooks-1.J, K4-seam-11.J | B68 | 30 min |  |
| K4-content-duplication-1.J | K4 | Jini | 1 (move) | K5-contracts-core-4.J, K5-contracts-core-2.J, X-content-duplication-1.J, K4-seam-10.J | B68 | 25 min |  |
| K5-agent-plugins-3.J | K5 | Jini | 1 (move) | V-agent-plugins-2.J | B68 | 32 min |  |
| RT-K1-adm-trash-1.J | RT-K1 | Jini | 5 (move) | K4-trash-2.J, K4-seam-5.J, RT-K1-0.J | B68 | 97 min |  |
| K5-contracts-headless-2.T | K5 | Tovu | 1 (delete + repoint) | K5-contracts-headless-2.J, K4-contracts-headless-1.T, K4-seam-19.T | B68 | 102 min | 1,298 |
| K5-site-backup-2.T | K5 | Tovu | 7 (delete + repoint) | K5-site-backup-2.J, K4-seam-12.T, K4-publish-content-2.T | B68 | 92 min | 1,298 |
| RT-K1-pub-site-render-context-1.J | RT-K1 | Jini | 1 (move) | K5-post-3.J | B69 | 23 min |  |
| RT-K1-pub-site-assistant-confirm-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-3.J, K4-seam-10.J, K4-seam-15.J, RT-K1-0.J | B69 | 47 min |  |
| K5-agent-plugins-4.J | K5 | Jini | 1 (move) | V-agent-plugins-2.J, K5-agent-plugins-3.J, X-agent-plugins-1.J, K5-agent-plugins-1.J, K4-seam-3.J | B69 | 31 min |  |
| K5-agent-plugins-3.T | K5 | Tovu | 1 (delete + repoint) | K5-agent-plugins-3.J | B69 | 24 min | 1,293 |
| K4-trash-2.T | K4 | Tovu | 3 (delete + repoint) | K4-trash-2.J, K4-seam-5.T | B69 | 75 min | 1,293 |
| K5-webhooks-2.T | K5 | Tovu | 1 (delete + repoint) | K5-webhooks-2.J, K4-seam-11.T | B69 | 120 min | 1,293 |
| RT-K1-pub-site-render-1.J | RT-K1 | Jini | 12 (move) | R-public-http-1.J, C-platform-html-1.J, RT-K1-pub-site-site-chat-markup-1.J, T-post-1.J, T-theme-1.J, X-entries-1.J, RT-K1-pub-site-render-context-1.J, X-media-1.J, X-widgets-1.J | B70 | 73 min |  |
| K5-api-connections-1.J | K5 | Jini | 9 (move) | K4-seam-13.J, K4-seam-8.J, K5-contracts-core-3.J, K4-seam-15.J, K5-agent-plugins-4.J | B70 | 103 min |  |
| RT-K1-adm-trash-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-trash-1.J, K4-trash-2.T, K4-seam-5.T, RT-K1-0.T | B70 | 52 min | 1,285 |
| V-agent-plugins-2.T | V | Tovu | 1 (delete + repoint) | V-agent-plugins-2.J | B70 | 104 min | 1,285 |
| K4-content-duplication-1.T | K4 | Tovu | 1 (delete + repoint) | K4-content-duplication-1.J, K4-seam-10.T | B70 | 20 min | 1,285 |
| RT-K1-pub-site-assistant-confirm-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-assistant-confirm-1.J, K4-seam-10.T, K4-seam-15.T, RT-K1-0.T | B70 | 24 min | 1,285 |
| K5-webhooks-3.J | K5 | Jini | 1 (move) | K5-webhooks-1.J | B71 | 27 min |  |
| K4-seam-21.J | K4 | Jini | — | — | B71 | 77 min |  |
| K4-seam-20.J | K4 | Jini | — | — | B71 | 99 min |  |
| K5-api-connections-1.T | K5 | Tovu | 9 (delete + repoint) | K5-api-connections-1.J, K4-seam-13.T, K4-seam-8.T, K4-seam-15.T | B71 | 88 min | 1,264 |
| RT-K1-pub-site-render-1.T | RT-K1 | Tovu | 12 (delete + repoint) | RT-K1-pub-site-render-1.J | B71 | 94 min | 1,264 |
| K5-settings-1.J | K5 | Jini | 10 (move) | K4-seam-11.J, X-settings-1.J, K5-contracts-core-6.J, K4-seam-13.J, K4-seam-4.J, K4-seam-21.J | B72 | 92 min |  |
| K5-plugin-runtime-1.J | K5 | Jini | 9 (move) | K4-seam-20.J, K4-seam-5.J, K4-seam-7.J | B72 | 101 min |  |
| K5-domain-dns-1.J | K5 | Jini | 10 (move) | K4-seam-1.J, K4-seam-5.J, K4-seam-20.J, K5-platform-mail-2.J | B72 | 79 min |  |
| K4-seam-20.T | K4 | Tovu | — | K4-seam-20.J | B72 | 80 min |  |
| K4-seam-21.T | K4 | Tovu | — | K4-seam-21.J | B72 | 61 min |  |
| K5-agent-plugins-4.T | K5 | Tovu | 1 (delete + repoint) | K5-agent-plugins-4.J, K4-seam-3.T | B72 | 120 min | 1,263 |
| K5-server-logs-1.J | K5 | Jini | 4 (move) | K4-seam-21.J, K5-contracts-core-6.J | B73 | 47 min |  |
| K5-publish-content-ui-1.J | K5 | Jini | 7 (move) | K5-publish-content-1.J, K4-publish-content-2.J, K4-seam-21.J | B73 | 64 min |  |
| K5-external-mcp-1.J | K5 | Jini | 5 (move) | K4-seam-5.J, K4-seam-20.J, K4-seam-11.J | B73 | 56 min |  |
| K5-domain-dns-1.T | K5 | Tovu | 10 (delete + repoint) | K5-domain-dns-1.J, K4-seam-1.T, K4-seam-5.T, K4-seam-20.T | B73 | 60 min | 1,243 |
| K5-plugin-runtime-1.T | K5 | Tovu | 9 (delete + repoint) | K5-plugin-runtime-1.J, K4-seam-20.T, K4-seam-5.T, K4-seam-7.T | B73 | 63 min | 1,243 |
| RT-K1-pub-site-render-context-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-render-context-1.J | B73 | 48 min | 1,243 |
| K5-settings-2.J | K5 | Jini | 3 (move) | X-identity-1.J, K5-settings-1.J | B74 | 51 min |  |
| K5-publish-content-3.J | K5 | Jini | 15 (move) | K4-publish-content-2.J, K5-publish-content-1.J, K5-contracts-core-2.J, K5-contracts-core-3.J, K5-publish-content-ui-1.J, X-identity-1.J | B74 | 81 min |  |
| A-K2-shell-lib-6.J | A-K2 | Jini | 10 (move) | A-K2-shell-lib-4.J, A-adm-shell-lib-1.J, A-K2-integrations-1.J, A-K2-posts-1.J, A-K2-pages-1.J, A-K2-menus-1.J, A-K2-widgets-1.J, K4-seam-14.J, K5-contracts-headless-2.J, A-K2-settings-1.J, A-adm-shell-lib-3.J, K4-seam-8.J, A-K2-0.J, A-K2-themes-1.J, A-adm-shell-lib-4.J, A-K2-shell-lib-2.J, A-adm-shell-lib-2.J, K4-seam-17.J, K5-publish-content-ui-1.J | B74 | 84 min |  |
| K5-external-mcp-1.T | K5 | Tovu | 5 (delete + repoint) | K5-external-mcp-1.J, K4-seam-5.T, K4-seam-20.T, K4-seam-11.T | B74 | 104 min | 1,221 |
| K5-publish-content-ui-1.T | K5 | Tovu | 7 (delete + repoint) | K5-publish-content-ui-1.J, K4-publish-content-2.T, K4-seam-21.T | B74 | 65 min | 1,221 |
| K5-settings-1.T | K5 | Tovu | 10 (delete + repoint) | K5-settings-1.J, K4-seam-11.T, K4-seam-13.T, K4-seam-4.T, K4-seam-21.T | B74 | 59 min | 1,221 |
| A-K2-shell-components-6.J | A-K2 | Jini | 9 (move) | A-K2-shell-lib-6.J, A-adm-shell-lib-4.J, A-K2-0.J, A-K2-shell-components-1.J, A-K2-fs-files-1.J, A-K2-shell-components-5.J, A-K2-plugins-2.J, A-K2-skills-1.J, A-adm-shell-lib-1.J, A-adm-shell-lib-3.J, A-K2-plugins-1.J, A-adm-shell-components-1.J, A-adm-other-3.J, A-K2-shell-lib-1.J, A-K2-shell-lib-5.J, A-K2-shell-components-3.J, A-K2-shell-components-4.J, A-K2-shell-lib-4.J | B75 | 100 min |  |
| A-K2-settings-2.J | A-K2 | Jini | 12 (move) | A-K2-shell-lib-6.J, A-K2-shell-hooks-1.J, A-K2-0.J, K4-i18n-common.J, A-K2-fs-files-1.J, A-adm-shell-components-1.J, A-adm-shell-lib-3.J, A-K2-settings-1.J, A-adm-other-3.J | B75 | 104 min |  |
| A-K2-shell-lib-6.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-shell-lib-6.J, K4-seam-14.T, K4-seam-8.T, A-K2-0.T, K4-seam-17.T | B75 | 88 min | 1,191 |
| K5-publish-content-3.T | K5 | Tovu | 15 (delete + repoint) | K5-publish-content-3.J, K4-publish-content-2.T | B75 | 106 min | 1,191 |
| K5-server-logs-1.T | K5 | Tovu | 4 (delete + repoint) | K5-server-logs-1.J, K4-seam-21.T | B75 | 32 min | 1,191 |
| K5-webhooks-3.T | K5 | Tovu | 1 (delete + repoint) | K5-webhooks-3.J | B75 | 119 min | 1,191 |
| K5-widgets-1.J | K5 | Jini | 5 (move) | K4-seam-5.J, K5-post-3.J, K5-post-1.J, X-content-types-1.J, X-media-1.J, C-platform-html-1.J, K4-publish-content-2.J, K5-publish-content-1.J, K5-publish-content-3.J, K5-contracts-core-6.J, K5-contracts-core-4.J, K5-contracts-core-2.J | B76 | 82 min |  |
| RT-K1-adm-publish-content-1.J | RT-K1 | Jini | 4 (move) | K4-publish-content-2.J, RT-K1-0.J, P-publish-trust-1.J, K5-publish-content-3.J, K5-publish-content-1.J | B76 | 88 min |  |
| A-K2-shell-lib-7.J | A-K2 | Jini | 6 (move) | A-K2-shell-lib-6.J, A-K2-0.J, A-K2-media-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-2.J, A-adm-other-3.J, A-K2-widgets-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-4.J, A-K2-shell-components-3.J, A-adm-shell-lib-3.J | B76 | 55 min |  |
| A-K2-settings-2.T | A-K2 | Tovu | 12 (delete + repoint) | A-K2-settings-2.J, A-K2-0.T, K4-i18n-common.T | B76 | 51 min | 1,167 |
| A-K2-shell-components-6.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-shell-components-6.J, A-K2-0.T | B76 | 53 min | 1,167 |
| K5-settings-2.T | K5 | Tovu | 3 (delete + repoint) | K5-settings-2.J | B76 | 35 min | 1,167 |
| RT-K1-adm-widgets-3.J | RT-K1 | Jini | 5 (move) | K5-widgets-1.J, RT-K1-adm-widgets-1.J, RT-K1-0.J | B77 | 105 min |  |
| RT-K1-adm-publish-content-2.J | RT-K1 | Jini | 4 (move) | RT-K1-adm-publish-content-1.J, RT-K1-0.J, K5-publish-content-3.J, K5-publish-content-1.J, K4-publish-content-2.J, P-publish-trust-1.J | B77 | 85 min |  |
| A-K2-shell-hooks-2.J | A-K2 | Jini | 4 (move) | A-adm-shell-lib-1.J, A-K2-shell-lib-7.J, A-K2-shell-hooks-1.J, A-K2-shell-lib-5.J, A-K2-0.J, A-adm-shell-lib-4.J | B77 | 50 min |  |
| A-K2-shell-components-7.J | A-K2 | Jini | 11 (move) | A-K2-shell-components-6.J, A-K2-shell-components-3.J, A-K2-0.J, A-K2-shell-lib-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-5.J, A-K2-shell-lib-2.J, A-K2-shell-lib-6.J, A-K2-shell-components-5.J, A-K2-shell-hooks-1.J, A-adm-shell-lib-4.J, A-K2-shell-components-2.J, A-K2-shell-lib-7.J, A-adm-shell-lib-2.J | B77 | 99 min |  |
| A-K2-shell-lib-7.T | A-K2 | Tovu | 6 (delete + repoint) | A-K2-shell-lib-7.J, A-K2-0.T | B77 | 49 min | 1,156 |
| K5-widgets-1.T | K5 | Tovu | 5 (delete + repoint) | K5-widgets-1.J, K4-seam-5.T, K4-publish-content-2.T | B77 | 78 min | 1,156 |
| K5-redirects-1.J | K5 | Jini | 4 (move) | K5-contracts-core-6.J, K5-contracts-core-4.J, K5-publish-content-1.J, K5-publish-content-3.J, K4-publish-content-2.J, X-redirects-1.J | B78 | 66 min |  |
| RT-K1-adm-widgets-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-widgets-1.J, RT-K1-0.J, K5-widgets-1.J | B78 | 93 min |  |
| A-K2-shell-hooks-3.J | A-K2 | Jini | 3 (move) | A-K2-shell-hooks-1.J, A-adm-shell-hooks-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-K2-shell-lib-6.J, A-adm-shell-lib-4.J, A-K2-shell-lib-1.J, A-K2-0.J, K4-seam-8.J, K4-seam-5.J | B78 | 42 min |  |
| A-K2-shell-components-7.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-shell-components-7.J, A-K2-0.T | B78 | 56 min | 1,136 |
| RT-K1-adm-publish-content-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-publish-content-1.J, K4-publish-content-2.T, RT-K1-0.T | B78 | 62 min | 1,136 |
| RT-K1-adm-widgets-3.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-widgets-3.J, RT-K1-0.T | B78 | 43 min | 1,136 |
| A-K2-shell-components-8.J | A-K2 | Jini | 14 (move) | A-K2-fs-files-1.J, A-K2-shell-components-1.J, A-K2-settings-2.J, A-K2-shell-hooks-2.J, A-K2-0.J, A-K2-shell-lib-6.J, A-adm-shell-lib-4.J, A-K2-shell-components-6.J, A-K2-shell-components-7.J, A-K2-shell-hooks-3.J, A-K2-media-1.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-1.J, A-K2-shell-components-3.J, A-K2-shell-components-5.J, A-K2-shell-lib-1.J, A-K2-shell-lib-7.J | B79 | 101 min |  |
| A-K2-observability-1.J | A-K2 | Jini | 13 (move) | K4-i18n-common.J, A-adm-shell-lib-3.J, A-K2-0.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-2.J, A-adm-other-5.J, A-K2-auth-1.J, A-K2-shell-hooks-3.J | B79 | 96 min |  |
| A-K2-shell-hooks-2.T | A-K2 | Tovu | 4 (delete + repoint) | A-K2-shell-hooks-2.J, A-K2-0.T | B79 | 34 min | 1,121 |
| RT-K1-adm-publish-content-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-publish-content-2.J, RT-K1-0.T, K4-publish-content-2.T | B79 | 43 min | 1,121 |
| RT-K1-adm-widgets-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-widgets-2.J, RT-K1-0.T | B79 | 45 min | 1,121 |
| K5-redirects-1.T | K5 | Tovu | 4 (delete + repoint) | K5-redirects-1.J, K4-publish-content-2.T | B79 | 45 min | 1,121 |
| K5-settings-3.J | K5 | Jini | 3 (move) | K5-settings-1.J, X-settings-1.J, X-webmcp-1.J, K5-settings-2.J, K4-seam-5.J, K4-seam-11.J, K5-publish-content-3.J, K4-publish-content-2.J | B80 | 47 min |  |
| K5-content-types-1.J | K5 | Jini | 2 (move) | K5-contracts-core-1.J, K5-publish-content-1.J, K5-publish-content-3.J, K4-publish-content-2.J, X-content-types-1.J, K4-seam-5.J | B80 | 36 min |  |
| A-K2-publish-content-1.J | A-K2 | Jini | 12 (move) | K5-publish-content-ui-1.J, A-adm-publish-content-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-3.J | B80 | 69 min |  |
| A-K2-plugins-4.J | A-K2 | Jini | 13 (move) | A-K2-shell-hooks-3.J, A-K2-plugins-1.J, A-K2-plugins-2.J, A-K2-plugins-3.J, A-adm-other-2.J, A-adm-other-5.J, A-adm-shell-hooks-1.J, A-K2-integrations-1.J, A-K2-shell-components-8.J, A-adm-shell-lib-3.J, A-K2-0.J | B80 | 85 min |  |
| A-K2-observability-1.T | A-K2 | Tovu | 13 (delete + repoint) | A-K2-observability-1.J, K4-i18n-common.T, A-K2-0.T | B80 | 46 min | 1,094 |
| A-K2-shell-components-8.T | A-K2 | Tovu | 14 (delete + repoint) | A-K2-shell-components-8.J, A-K2-0.T | B80 | 67 min | 1,094 |
| K5-comments-1.J | K5 | Jini | 10 (move) | K4-seam-9.J, K4-seam-8.J, K4-seam-6.J, K4-seam-10.J, C-platform-html-1.J, K5-settings-3.J, K4-seam-5.J, K5-contracts-core-3.J | B81 | 84 min |  |
| A-K2-pages-2.J | A-K2 | Jini | 10 (move) | A-K2-themes-1.J, A-adm-pages-1.J, A-adm-themes-1.J, A-K2-pages-1.J, A-adm-posts-1.J, A-K2-shell-hooks-1.J, A-K2-shell-lib-6.J, A-K2-0.J, A-adm-shell-lib-3.J, A-adm-shell-lib-1.J, A-K2-posts-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-4.J, A-adm-shell-components-1.J, A-adm-shell-lib-2.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J | B81 | 81 min |  |
| A-K2-database-1.J | A-K2 | Jini | 11 (move) | K4-i18n-common.J, A-adm-other-1.J, A-adm-shell-lib-4.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-3.J, A-adm-other-4.J, A-K2-shell-hooks-3.J, A-adm-shell-lib-3.J, A-K2-0.J, A-K2-shell-components-8.J | B81 | 75 min |  |
| A-K2-plugins-4.T | A-K2 | Tovu | 13 (delete + repoint) | A-K2-plugins-4.J, A-K2-0.T | B81 | 46 min | 1,066 |
| A-K2-publish-content-1.T | A-K2 | Tovu | 12 (delete + repoint) | A-K2-publish-content-1.J | B81 | 55 min | 1,066 |
| K5-settings-3.T | K5 | Tovu | 3 (delete + repoint) | K5-settings-3.J, K4-seam-5.T, K4-seam-11.T, K4-publish-content-2.T | B81 | 106 min | 1,066 |
| K5-analytics-1.J | K5 | Jini | 7 (move) | K4-seam-3.J, K4-seam-6.J, K5-contracts-core-2.J, X-analytics-1.J, K5-contracts-core-4.J, K5-settings-3.J | B82 | 62 min |  |
| A-K2-posts-2.J | A-K2 | Jini | 16 (move) | A-K2-posts-1.J, A-K2-shell-components-5.J, A-adm-themes-1.J, A-adm-posts-1.J, A-adm-shell-lib-1.J, A-K2-media-1.J, A-K2-themes-1.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-1.J, A-adm-shell-lib-2.J, A-adm-shell-lib-3.J, A-K2-shell-lib-2.J, A-K2-shell-components-3.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-K2-pages-2.J | B82 | 66 min |  |
| A-K2-consent-1.J | A-K2 | Jini | 9 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, K4-seam-9.J, A-adm-shell-lib-3.J, A-K2-shell-hooks-3.J, A-adm-other-1.J, A-K2-0.J | B82 | 86 min |  |
| A-K2-database-1.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-database-1.J, K4-i18n-common.T, A-K2-0.T | B82 | 45 min | 1,035 |
| A-K2-pages-2.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-pages-2.J, A-K2-0.T | B82 | 65 min | 1,035 |
| K5-comments-1.T | K5 | Tovu | 10 (delete + repoint) | K5-comments-1.J, K4-seam-9.T, K4-seam-8.T, K4-seam-6.T, K4-seam-10.T, K4-seam-5.T | B82 | 55 min | 1,035 |
| A-K2-security-2.J | A-K2 | Jini | 9 (move) | A-K2-security-1.J, A-adm-shell-lib-2.J, SEC-adm-security-1.J, A-K2-0.J, A-K2-media-1.J, A-K2-source-control-1.J, A-K2-shell-lib-4.J, A-K2-deployment-1.J, K4-i18n-common.J, A-K2-shell-lib-1.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, K4-seam-9.J | B83 | 84 min |  |
| A-K2-recovery-1.J | A-K2 | Jini | 9 (move) | K4-i18n-common.J, A-adm-recovery-1.J, A-adm-shell-lib-4.J, A-K2-shell-lib-4.J, A-adm-other-3.J, A-adm-other-1.J, A-K2-database-1.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-adm-shell-lib-3.J, A-K2-shell-components-8.J, A-K2-0.J | B83 | 67 min |  |
| A-K2-consent-1.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-consent-1.J, K4-i18n-common.T, K4-seam-9.T, A-K2-0.T | B83 | 42 min | 1,001 |
| A-K2-posts-2.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-posts-2.J | B83 | 46 min | 1,001 |
| K5-analytics-1.T | K5 | Tovu | 7 (delete + repoint) | K5-analytics-1.J, K4-seam-3.T, K4-seam-6.T | B83 | 50 min | 1,001 |
| K5-content-types-1.T | K5 | Tovu | 2 (delete + repoint) | K5-content-types-1.J, K4-publish-content-2.T, K4-seam-5.T | B83 | 26 min | 1,001 |
| RT-K1-adm-comments-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, K5-comments-1.J | B84 | 95 min |  |
| A-K2-shell-components-9.J | A-K2 | Jini | 9 (move) | A-K2-shell-hooks-3.J, K4-seam-5.J, A-K2-shell-components-8.J, A-K2-shell-components-6.J, A-K2-shell-components-3.J, A-K2-media-1.J, A-K2-shell-components-5.J, A-K2-shell-components-4.J, A-K2-0.J, A-adm-other-3.J, A-K2-shell-hooks-2.J, A-K2-shell-components-2.J, A-K2-shell-components-7.J | B84 | 85 min |  |
| A-K2-email-2.J | A-K2 | Jini | 7 (move) | A-K2-email-1.J, A-K2-shell-components-3.J, A-adm-other-1.J, A-K2-plugins-2.J, A-adm-shell-lib-3.J, A-K2-shell-hooks-3.J, A-adm-shell-components-1.J, A-adm-shell-components-2.J, A-K2-pages-1.J, A-K2-pages-2.J, A-adm-other-4.J, A-K2-0.J, A-K2-shell-lib-4.J, A-K2-shell-lib-1.J | B84 | 69 min |  |
| A-K2-recovery-1.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-recovery-1.J, K4-i18n-common.T, A-K2-0.T | B84 | 34 min | 980 |
| A-K2-security-2.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-security-2.J, A-K2-0.T, K4-i18n-common.T, K4-seam-9.T | B84 | 59 min | 980 |
| A-K2-shell-hooks-3.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-shell-hooks-3.J, A-K2-0.T, K4-seam-8.T, K4-seam-5.T | B84 | 104 min | 980 |
| RT-K1-adm-settings-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, K5-contracts-headless-2.J, T-theme-1.J, R-admin-http-1.J, K5-settings-3.J, K5-contracts-core-2.J | B85 | 104 min |  |
| A-K2-security-3.J | A-K2 | Jini | 10 (move) | A-K2-shell-lib-1.J, A-K2-security-1.J, A-K2-source-control-1.J, A-K2-shell-lib-4.J, A-K2-shell-lib-5.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-K2-deployment-1.J, A-K2-security-2.J, K4-seam-9.J, A-adm-shell-lib-4.J, A-K2-shell-components-3.J, A-K2-shell-components-9.J, A-adm-shell-lib-3.J, A-K2-0.J, SEC-adm-security-1.J | B85 | 99 min |  |
| A-K2-deployment-2.J | A-K2 | Jini | 10 (move) | A-K2-deployment-1.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-3.J, A-K2-shell-lib-5.J, A-K2-shell-lib-1.J, A-K2-security-1.J, A-adm-other-2.J, A-adm-shell-hooks-1.J, A-adm-deployment-1.J, A-K2-shell-components-9.J, A-K2-shell-components-3.J, A-adm-shell-lib-3.J, A-adm-shell-lib-4.J, A-K2-0.J | B85 | 101 min |  |
| A-K2-email-2.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-email-2.J, A-K2-0.T | B85 | 31 min | 960 |
| A-K2-shell-components-9.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-shell-components-9.J, K4-seam-5.T, A-K2-0.T | B85 | 50 min | 960 |
| RT-K1-adm-comments-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-comments-1.J, RT-K1-0.T | B85 | 41 min | 960 |
| RT-K1-adm-settings-2.J | RT-K1 | Jini | 7 (move) | K5-settings-3.J, RT-K1-adm-settings-1.J, K4-seam-14.J | B86 | 45 min |  |
| RT-K1-adm-assistant-5.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-assistant-1.J, R-admin-http-1.J, RT-K1-adm-assistant-4.J, RT-K1-0.J, K5-settings-3.J | B86 | 102 min |  |
| A-K2-members-1.J | A-K2 | Jini | 7 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-members-1.J, K4-seam-6.J, A-K2-shell-hooks-3.J, A-adm-shell-lib-2.J, A-K2-shell-components-8.J | B86 | 54 min |  |
| A-K2-media-2.J | A-K2 | Jini | 8 (move) | A-K2-media-1.J, A-K2-0.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-K2-shell-components-9.J, A-K2-shell-components-8.J, A-adm-other-5.J, A-K2-publish-content-1.J | B86 | 105 min |  |
| A-K2-deployment-2.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-deployment-2.J, A-K2-0.T | B86 | 35 min | 946 |
| RT-K1-adm-settings-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-settings-1.J, RT-K1-0.T | B86 | 62 min | 946 |
| K5-contracts-core-8.J | K5 | Jini | 2 (move) | K5-contracts-core-4.J, K5-deployments-1.J, K5-domain-dns-1.J, K4-contracts-core-5.J, K5-members-1.J, K5-newsletter-1.J, K5-publish-content-1.J, K5-contracts-core-6.J, K5-site-backup-1.J, K5-source-control-1.J, K5-theme-1.J, K4-seam-1.J, K5-contracts-core-7.J | B87 | 97 min |  |
| A-K2-users-1.J | A-K2 | Jini | 7 (move) | A-adm-shell-lib-3.J, A-adm-shell-lib-2.J, K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-users-1.J, A-K2-roles-1.J, A-K2-auth-1.J, K4-seam-6.J, A-K2-shell-hooks-3.J, A-K2-shell-components-8.J | B87 | 68 min |  |
| A-K2-analytics-1.J | A-K2 | Jini | 6 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-1.J, A-adm-other-3.J, A-K2-shell-hooks-3.J, A-adm-shell-lib-3.J, A-adm-shell-lib-4.J | B87 | 38 min |  |
| A-K2-security-3.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-security-3.J, K4-seam-9.T, A-K2-0.T | B87 | 46 min | 926 |
| RT-K1-adm-assistant-5.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-assistant-5.J, RT-K1-0.T | B87 | 46 min | 926 |
| RT-K1-adm-settings-2.T | RT-K1 | Tovu | 7 (delete + repoint) | RT-K1-adm-settings-2.J, K4-seam-14.T | B87 | 78 min | 926 |
| K5-external-mcp-2.J | K5 | Jini | 2 (move) | K5-external-mcp-1.J, K5-contracts-core-1.J, K4-seam-1.J, K5-api-connections-1.J | B88 | 64 min |  |
| RT-K1-adm-analytics-1.J | RT-K1 | Jini | 1 (move) | K5-analytics-1.J, RT-K1-0.J, K4-seam-16.J | B88 | 42 min |  |
| A-K2-trash-1.J | A-K2 | Jini | 7 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-3.J, A-adm-users-1.J, A-K2-users-1.J, A-adm-other-6.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-K2-shell-lib-1.J, A-adm-shell-lib-4.J | B88 | 54 min |  |
| A-K2-library-1.J | A-K2 | Jini | 8 (move) | K4-i18n-common.J, A-K2-media-1.J, A-K2-0.J, A-K2-users-1.J, A-K2-auth-1.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-adm-shell-lib-3.J, A-adm-shell-lib-4.J | B88 | 74 min |  |
| A-K2-media-2.T | A-K2 | Tovu | 8 (delete + repoint) | A-K2-media-2.J, A-K2-0.T | B88 | 54 min | 916 |
| K5-contracts-core-8.T | K5 | Tovu | 2 (delete + repoint) | K5-contracts-core-8.J, K4-contracts-core-5.T, K4-seam-1.T | B88 | 74 min | 916 |
| K5-external-mcp-3.J | K5 | Jini | 7 (move) | K5-external-mcp-1.J, K5-external-mcp-2.J, K4-seam-5.J, K5-contracts-headless-2.J, K4-seam-1.J, K4-seam-10.J, K5-contracts-core-4.J, K5-contracts-core-3.J, X-external-mcp-1.J, K5-contracts-core-2.J | B89 | 82 min |  |
| A-K2-taxonomy-1.J | A-K2 | Jini | 16 (move) | K4-i18n-common.J, A-adm-other-3.J, A-K2-shell-lib-2.J, A-K2-shell-lib-4.J, A-adm-other-6.J, A-K2-trash-1.J, A-K2-auth-1.J, A-K2-shell-hooks-3.J, A-adm-shell-lib-2.J, A-K2-0.J | B89 | 88 min |  |
| A-K2-content-analysis-1.J | A-K2 | Jini | 6 (move) | K4-i18n-common.J, A-K2-shell-lib-4.J, A-adm-shell-lib-1.J, A-K2-shell-hooks-3.J | B89 | 44 min |  |
| A-K2-library-1.T | A-K2 | Tovu | 8 (delete + repoint) | A-K2-library-1.J, K4-i18n-common.T, A-K2-0.T | B89 | 32 min | 905 |
| RT-K1-adm-analytics-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-analytics-1.J, RT-K1-0.T, K4-seam-16.T | B89 | 22 min | 905 |
| K5-external-mcp-2.T | K5 | Tovu | 2 (delete + repoint) | K5-external-mcp-2.J, K4-seam-1.T | B89 | 108 min | 905 |
| RT-K1-adm-external-mcp-1.J | RT-K1 | Jini | 3 (move) | RT-K1-0.J, X-external-mcp-1.J, K5-external-mcp-2.J | B90 | 80 min |  |
| A-K2-themes-2.J | A-K2 | Jini | 5 (move) | A-K2-themes-1.J, A-adm-shell-components-1.J, A-adm-shell-components-2.J, A-adm-shell-lib-4.J, A-adm-shell-lib-3.J, A-K2-0.J, A-adm-themes-1.J, A-K2-publish-content-1.J | B90 | 67 min |  |
| A-K2-settings-3.J | A-K2 | Jini | 6 (move) | A-K2-shell-lib-1.J, A-K2-shell-hooks-3.J, A-K2-integrations-1.J, A-K2-shell-lib-4.J, A-K2-shell-lib-6.J, A-K2-settings-1.J, A-K2-settings-2.J, A-K2-0.J, A-K2-auth-1.J, A-K2-shell-lib-7.J, A-K2-admin-themes-1.J, K4-seam-17.J | B90 | 99 min |  |
| A-K2-content-analysis-1.T | A-K2 | Tovu | 6 (delete + repoint) | A-K2-content-analysis-1.J, K4-i18n-common.T | B90 | 29 min | 876 |
| A-K2-taxonomy-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-taxonomy-1.J, K4-i18n-common.T, A-K2-0.T | B90 | 56 min | 876 |
| K5-external-mcp-3.T | K5 | Tovu | 7 (delete + repoint) | K5-external-mcp-3.J, K4-seam-5.T, K4-seam-1.T, K4-seam-10.T | B90 | 51 min | 876 |
| RT-K1-adm-external-mcp-2.J | RT-K1 | Jini | 2 (move) | X-external-mcp-1.J, K5-external-mcp-2.J, RT-K1-adm-external-mcp-1.J, RT-K1-0.J, K5-external-mcp-1.J | B91 | 90 min |  |
| A-K2-taxonomy-2.J | A-K2 | Jini | 3 (move) | A-adm-other-3.J, A-K2-taxonomy-1.J, A-K2-0.J, A-adm-other-6.J, A-K2-shell-components-8.J, A-K2-publish-content-1.J | B91 | 38 min |  |
| A-K2-authentication-1.J | A-K2 | Jini | 4 (move) | K4-i18n-common.J, A-K2-shell-components-3.J, A-K2-shell-hooks-3.J, A-adm-other-1.J, A-K2-0.J | B91 | 43 min |  |
| A-K2-members-1.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-members-1.J, K4-i18n-common.T, K4-seam-6.T | B91 | 34 min | 860 |
| A-K2-settings-3.T | A-K2 | Tovu | 6 (delete + repoint) | A-K2-settings-3.J, A-K2-0.T, K4-seam-17.T | B91 | 35 min | 860 |
| RT-K1-adm-external-mcp-1.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-external-mcp-1.J, RT-K1-0.T | B91 | 44 min | 860 |
| RT-K1-pub-external-mcp-1.J | RT-K1 | Jini | 2 (move) | RT-K1-0.J, K5-api-connections-1.J, K5-external-mcp-2.J, K5-external-mcp-1.J, K5-contracts-core-3.J, RT-K1-pub-oauth-1.J | B92 | 79 min |  |
| RT-K1-adm-external-mcp-5.J | RT-K1 | Jini | 2 (move) | K5-external-mcp-3.J, K5-contracts-core-3.J, RT-K1-adm-external-mcp-1.J, RT-K1-0.J | B92 | 64 min |  |
| A-K2-pages-3.J | A-K2 | Jini | 3 (move) | A-K2-themes-1.J, A-K2-themes-2.J, A-adm-pages-1.J, A-K2-pages-1.J, A-adm-shell-components-1.J, A-adm-shell-components-2.J, A-adm-shell-lib-4.J, A-K2-shell-hooks-1.J, A-K2-pages-2.J, A-adm-themes-1.J, A-K2-shell-components-5.J, A-K2-taxonomy-2.J, A-K2-0.J, A-adm-posts-1.J, A-adm-shell-lib-3.J, A-K2-shell-components-8.J, A-K2-publish-content-1.J | B92 | 55 min |  |
| A-K2-collections-2.J | A-K2 | Jini | 6 (move) | A-K2-collections-1.J, A-K2-shell-components-8.J, A-K2-publish-content-1.J, A-adm-shell-lib-4.J, A-adm-other-1.J, A-K2-shell-lib-4.J, A-K2-shell-lib-6.J, A-K2-shell-lib-7.J, A-adm-shell-lib-3.J, A-K2-shell-hooks-3.J, A-adm-other-4.J, A-K2-taxonomy-2.J | B92 | 48 min |  |
| A-K2-trash-1.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-trash-1.J, K4-i18n-common.T | B92 | 32 min | 851 |
| RT-K1-adm-external-mcp-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-external-mcp-2.J, RT-K1-0.T | B92 | 45 min | 851 |
| V-contracts-core-9.J | V | Jini | 1 (move) | K5-contracts-core-8.J, K5-contracts-core-7.J | B93 | 22 min |  |
| RT-K1-adm-external-mcp-3.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-external-mcp-1.J, RT-K1-0.J | B93 | 43 min |  |
| RT-K1-adm-comments-2.J | RT-K1 | Jini | 1 (move) | K5-comments-1.J, RT-K1-adm-comments-1.J, RT-K1-0.J | B93 | 37 min |  |
| A-K2-shell-hooks-4.J | A-K2 | Jini | 2 (move) | A-K2-deployment-1.J, A-K2-settings-2.J, A-K2-0.J, A-K2-shell-components-7.J, A-K2-shell-lib-6.J | B93 | 50 min |  |
| A-K2-users-1.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-users-1.J, K4-i18n-common.T, K4-seam-6.T | B93 | 43 min | 842 |
| RT-K1-adm-external-mcp-5.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-external-mcp-5.J, RT-K1-0.T | B93 | 34 min | 842 |
| K5-newsletter-2.J | K5 | Jini | 11 (move) | K5-newsletter-1.J, K4-seam-1.J, K5-contracts-core-2.J, V-contracts-core-9.J, K5-platform-mail-2.J | B94 | 97 min |  |
| A-K2-analytics-1.T | A-K2 | Tovu | 6 (delete + repoint) | A-K2-analytics-1.J, K4-i18n-common.T | B94 | 23 min | 830 |
| A-K2-shell-hooks-4.T | A-K2 | Tovu | 2 (delete + repoint) | A-K2-shell-hooks-4.J, A-K2-0.T | B94 | 35 min | 830 |
| RT-K1-adm-comments-2.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-comments-2.J, RT-K1-0.T | B94 | 20 min | 830 |
| V-contracts-core-9.T | V | Tovu | 1 (delete + repoint) | V-contracts-core-9.J | B94 | 113 min | 830 |
| RT-K1-pub-external-mcp-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-external-mcp-1.J, RT-K1-0.T | B94 | 38 min | 830 |
| K5-members-2.J | K5 | Jini | 10 (move) | K5-members-1.J, K4-seam-20.J, K5-platform-mail-2.J, K5-newsletter-2.J, K4-seam-3.J | B95 | 94 min |  |
| RT-K1-adm-workspace-1.J | RT-K1 | Jini | 5 (move) | RT-K1-0.J, K5-workspace-1.J, V-contracts-core-9.J | B95 | 91 min |  |
| A-K2-shell-components-10.J | A-K2 | Jini | 5 (move) | A-K2-shell-lib-1.J, A-adm-shell-lib-4.J, A-K2-shell-components-9.J, A-K2-shell-components-7.J, A-K2-shell-components-8.J, A-K2-shell-components-6.J, A-K2-skills-1.J, A-K2-shell-lib-3.J, A-K2-shell-components-5.J, A-K2-shell-lib-6.J, A-K2-0.J, A-K2-media-1.J, A-K2-shell-components-3.J, A-K2-shell-components-4.J, A-adm-shell-components-2.J, A-K2-shell-hooks-4.J, A-K2-shell-hooks-2.J, A-K2-collections-1.J, A-adm-other-1.J, A-adm-other-2.J, A-adm-other-3.J, A-adm-shell-lib-1.J | B95 | 90 min |  |
| A-K2-collections-2.T | A-K2 | Tovu | 6 (delete + repoint) | A-K2-collections-2.J | B95 | 35 min | 812 |
| RT-K1-adm-external-mcp-3.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-external-mcp-3.J, RT-K1-0.T | B95 | 24 min | 812 |
| K5-newsletter-2.T | K5 | Tovu | 11 (delete + repoint) | K5-newsletter-2.J, K4-seam-1.T | B95 | 85 min | 812 |
| RT-K1-adm-content-types-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, X-content-types-1.J, V-contracts-core-9.J | B96 | 88 min |  |
| A-K2-shell-components-11.J | A-K2 | Jini | 5 (move) | A-K2-fs-files-1.J, A-K2-shell-components-8.J, A-K2-shell-components-7.J, A-K2-shell-components-6.J, A-K2-shell-hooks-4.J, A-K2-shell-components-3.J, A-K2-shell-components-1.J, A-adm-shell-components-1.J, A-adm-other-3.J, A-K2-skills-1.J, A-K2-shell-components-5.J, A-K2-shell-lib-6.J, A-K2-shell-components-4.J, A-K2-shell-lib-2.J, A-K2-shell-components-10.J, A-K2-0.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-1.J, A-K2-shell-hooks-3.J, A-K2-widgets-1.J, A-adm-shell-components-2.J, A-adm-shell-lib-3.J, A-K2-shell-components-9.J | B96 | 59 min |  |
| A-K2-shell-components-10.T | A-K2 | Tovu | 5 (delete + repoint) | A-K2-shell-components-10.J, A-K2-0.T | B96 | 51 min | 787 |
| A-K2-themes-2.T | A-K2 | Tovu | 5 (delete + repoint) | A-K2-themes-2.J, A-K2-0.T | B96 | 25 min | 787 |
| RT-K1-adm-workspace-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-workspace-1.J, RT-K1-0.T | B96 | 49 min | 787 |
| K5-members-2.T | K5 | Tovu | 10 (delete + repoint) | K5-members-2.J, K4-seam-20.T, K4-seam-3.T | B96 | 68 min | 787 |
| K5-contracts-core-10.J | K5 | Jini | 4 (move) | K5-contracts-headless-2.J, K4-seam-1.J, V-contracts-core-9.J, K5-contracts-core-8.J, K4-seam-13.J | B97 | 56 min |  |
| RT-K1-adm-entries-1.J | RT-K1 | Jini | 4 (move) | RT-K1-adm-content-types-1.J, RT-K1-0.J, V-contracts-core-9.J | B97 | 89 min |  |
| A-K2-posts-3.J | A-K2 | Jini | 15 (move) | A-adm-posts-1.J, A-K2-content-analysis-1.J, A-K2-taxonomy-2.J, A-adm-shell-components-1.J, A-adm-shell-components-2.J, A-K2-posts-2.J, A-K2-posts-1.J, A-K2-shell-components-9.J, A-K2-0.J, A-adm-shell-lib-4.J, A-adm-shell-lib-3.J, A-K2-shell-components-8.J, A-K2-shell-hooks-3.J, A-K2-publish-content-1.J, A-K2-shell-hooks-1.J, A-K2-pages-3.J, A-K2-shell-components-11.J, A-K2-shell-lib-6.J, A-adm-themes-1.J, A-K2-shell-lib-7.J, A-adm-shell-lib-2.J, A-adm-shell-hooks-1.J, A-K2-pages-1.J, A-K2-themes-2.J, A-adm-posts-2.J | B97 | 83 min |  |
| A-K2-authentication-1.T | A-K2 | Tovu | 4 (delete + repoint) | A-K2-authentication-1.J, K4-i18n-common.T, A-K2-0.T | B97 | 23 min | 774 |
| A-K2-shell-components-11.T | A-K2 | Tovu | 5 (delete + repoint) | A-K2-shell-components-11.J, A-K2-0.T | B97 | 40 min | 774 |
| RT-K1-adm-content-types-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-content-types-1.J, RT-K1-0.T | B97 | 47 min | 774 |
| K5-project-keys-1.J | K5 | Jini | 8 (move) | K4-seam-13.J, K4-seam-1.J, K5-contracts-core-2.J, K4-seam-10.J, K5-api-connections-1.J, K5-contracts-core-10.J, K5-contracts-core-4.J, K4-seam-20.J | B98 | 81 min |  |
| K5-plugin-runtime-2.J | K5 | Jini | 12 (move) | C-platform-html-1.J, K5-contracts-core-3.J, K5-plugin-runtime-1.J, K4-contracts-core-5.J, K4-seam-16.J, C-contracts-core-1.J, K5-contracts-headless-2.J, K5-contracts-core-10.J, X-plugin-runtime-1.J, K5-contracts-core-6.J, K4-seam-1.J | B98 | 99 min |  |
| K5-agent-plugins-5.J | K5 | Jini | 10 (move) | K5-agent-plugins-4.J, X-agent-plugins-1.J, K4-seam-15.J, K5-contracts-core-10.J, K4-seam-19.J | B98 | 65 min |  |
| A-K2-posts-3.T | A-K2 | Tovu | 15 (delete + repoint) | A-K2-posts-3.J, A-K2-0.T | B98 | 49 min | 751 |
| RT-K1-adm-entries-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-entries-1.J, RT-K1-0.T | B98 | 38 min | 751 |
| K5-contracts-core-10.T | K5 | Tovu | 4 (delete + repoint) | K5-contracts-core-10.J, K4-seam-1.T, K4-seam-13.T | B98 | 69 min | 751 |
| K5-taxonomy-1.J | K5 | Jini | 8 (move) | K4-seam-7.J, K4-publish-content-2.J, K4-seam-5.J, K5-publish-content-3.J, K5-contracts-core-6.J, K5-contracts-core-4.J, K5-contracts-core-10.J, C-platform-html-1.J | B99 | 82 min |  |
| K5-fs-files-1.J | K5 | Jini | 7 (move) | X-fs-files-1.J, X-identity-1.J, K4-contracts-core-5.J, K5-contracts-core-10.J | B99 | 80 min |  |
| K5-custom-credentials-2.J | K5 | Jini | 7 (move) | K5-project-keys-1.J, K5-custom-credentials-1.J, K4-seam-15.J, K5-source-control-1.J, K5-contracts-core-4.J, K4-seam-1.J, K4-seam-5.J | B99 | 95 min |  |
| K5-agent-plugins-6.J | K5 | Jini | 10 (move) | K5-agent-plugins-5.J, K5-contracts-core-4.J, V-agent-plugins-2.J, K5-agent-plugins-4.J, K5-agent-plugins-3.J, K5-contracts-headless-2.J, K4-seam-10.J, K5-api-connections-1.J, K4-seam-19.J, K5-agent-plugins-1.J, K4-contracts-headless-1.J, X-agent-plugins-1.J, K4-seam-14.J | B99 | 97 min |  |
| A-K2-pages-3.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-pages-3.J, A-K2-0.T | B99 | 22 min | 736 |
| K5-plugin-runtime-2.T | K5 | Tovu | 12 (delete + repoint) | K5-plugin-runtime-2.J, K4-contracts-core-5.T, K4-seam-16.T, K4-seam-1.T | B99 | 80 min | 736 |
| K5-entries-1.J | K5 | Jini | 5 (move) | K4-publish-content-2.J, K5-publish-content-1.J, K5-publish-content-3.J, K5-taxonomy-1.J, K4-seam-5.J, X-content-types-1.J, K5-contracts-core-3.J, X-entries-1.J, K5-contracts-core-1.J, K4-trash-2.J | B100 | 66 min |  |
| K5-database-1.J | K5 | Jini | 6 (move) | K4-seam-7.J, K5-contracts-core-4.J, K5-contracts-core-2.J, K5-contracts-core-10.J | B100 | 75 min |  |
| K5-custom-credentials-3.J | K5 | Jini | 6 (move) | K5-contracts-core-4.J, K5-contracts-headless-2.J, K4-seam-15.J, K5-custom-credentials-2.J, K4-seam-10.J, K5-custom-credentials-1.J, K5-project-keys-1.J, K5-contracts-core-2.J, K5-contracts-core-10.J | B100 | 71 min |  |
| K5-agent-plugins-7.J | K5 | Jini | 12 (move) | K5-agent-plugins-6.J, K4-contracts-headless-1.J, V-agent-plugins-2.J, K5-contracts-core-3.J, K5-agent-plugins-4.J, X-agent-plugins-1.J, K5-contracts-headless-2.J, K5-contracts-core-10.J, K5-agent-plugins-5.J, K4-seam-1.J, K5-agent-plugins-1.J, K5-api-connections-1.J | B100 | 89 min |  |
| A-K2-taxonomy-2.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-taxonomy-2.J, A-K2-0.T | B100 | 26 min | 723 |
| K5-agent-plugins-5.T | K5 | Tovu | 10 (delete + repoint) | K5-agent-plugins-5.J, K4-seam-15.T, K4-seam-19.T | B100 | 109 min | 723 |
| K5-mail-1.J | K5 | Jini | 12 (move) | K4-seam-4.J, K4-seam-5.J, K5-platform-mail-2.J, K4-seam-13.J, K5-custom-credentials-3.J | B101 | 87 min |  |
| K5-form-destinations-1.J | K5 | Jini | 7 (move) | K4-seam-13.J, K5-custom-credentials-3.J, X-form-destinations-1.J, K5-agent-plugins-4.J | B101 | 64 min |  |
| K5-api-connections-2.J | K5 | Jini | 8 (move) | K5-custom-credentials-3.J, K5-api-connections-1.J, K5-project-keys-1.J, K5-agent-plugins-4.J, K5-contracts-core-3.J, K4-seam-6.J, K4-seam-15.J, K4-seam-8.J | B101 | 79 min |  |
| K5-agent-plugins-8.J | K5 | Jini | 12 (move) | K5-agent-plugins-7.J, V-agent-plugins-2.J, K5-agent-plugins-6.J, K5-contracts-headless-2.J, K5-agent-plugins-1.J, K5-agent-plugins-5.J, K4-seam-1.J, K5-contracts-core-4.J, K4-contracts-headless-1.J, X-agent-plugins-1.J, K5-contracts-core-2.J, K5-contracts-core-10.J, K5-agent-plugins-4.J, K4-seam-10.J | B101 | 85 min |  |
| K5-agent-plugins-7.T | K5 | Tovu | 12 (delete + repoint) | K5-agent-plugins-7.J, K4-contracts-headless-1.T, K4-seam-1.T | B101 | 109 min | 703 |
| K5-taxonomy-1.T | K5 | Tovu | 8 (delete + repoint) | K5-taxonomy-1.J, K4-seam-7.T, K4-publish-content-2.T, K4-seam-5.T | B101 | 63 min | 703 |
| K5-mail-status-1.J | K5 | Jini | 6 (move) | K5-platform-mail-2.J, K4-seam-13.J, X-mail-status-1.J, K4-seam-4.J, K5-custom-credentials-3.J, K5-project-keys-1.J, K5-newsletter-2.J, K4-seam-6.J, K5-mail-1.J, K4-contracts-core-5.J, K5-contracts-core-10.J, K4-seam-1.J | B102 | 81 min |  |
| K5-identity-2.J | K5 | Jini | 5 (move) | K5-identity-1.J, X-identity-1.J, K5-contracts-core-10.J, K4-contracts-core-5.J, K5-contracts-headless-2.J | B102 | 80 min |  |
| RT-K1-adm-taxonomy-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, K5-taxonomy-1.J | B102 | 102 min |  |
| K5-agent-plugins-8.T | K5 | Tovu | 12 (delete + repoint) | K5-agent-plugins-8.J, K4-seam-1.T, K4-contracts-headless-1.T, K4-seam-10.T | B102 | 86 min | 672 |
| K5-form-destinations-1.T | K5 | Tovu | 7 (delete + repoint) | K5-form-destinations-1.J, K4-seam-13.T | B102 | 49 min | 672 |
| K5-mail-1.T | K5 | Tovu | 12 (delete + repoint) | K5-mail-1.J, K4-seam-4.T, K4-seam-5.T, K4-seam-13.T | B102 | 55 min | 672 |
| K5-recovery-1.J | K5 | Jini | 4 (move) | K4-seam-5.J, K4-contracts-core-5.J, K5-contracts-core-2.J, K5-contracts-core-10.J, K5-database-1.J, K4-seam-7.J | B103 | 75 min |  |
| K5-object-storage-1.J | K5 | Jini | 4 (move) | K5-agent-plugins-5.J, K5-agent-plugins-4.J, K4-seam-13.J, X-object-storage-1.J | B103 | 56 min |  |
| RT-K1-adm-api-keys-1.J | RT-K1 | Jini | 4 (move) | X-identity-1.J, K4-seam-5.J, X-identity-2.J, K5-identity-2.J, RT-K1-0.J | B103 | 96 min |  |
| RT-K1-adm-taxonomy-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-taxonomy-1.J, RT-K1-0.T | B103 | 55 min | 651 |
| K5-agent-plugins-6.T | K5 | Tovu | 10 (delete + repoint) | K5-agent-plugins-6.J, K4-seam-10.T, K4-seam-19.T, K4-contracts-headless-1.T, K4-seam-14.T | B103 | 97 min | 651 |
| K5-custom-credentials-2.T | K5 | Tovu | 7 (delete + repoint) | K5-custom-credentials-2.J, K4-seam-15.T, K4-seam-1.T, K4-seam-5.T | B103 | 95 min | 651 |
| RT-K1-adm-taxonomy-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-taxonomy-1.J, RT-K1-0.J | B104 | 71 min |  |
| A-K2-settings-4.J | A-K2 | Jini | 3 (move) | A-K2-settings-2.J, A-K2-shell-hooks-4.J, A-K2-shell-lib-7.J, A-adm-shell-lib-3.J, A-K2-settings-1.J, A-adm-other-3.J, A-K2-shell-hooks-3.J, A-K2-shell-components-8.J, A-adm-shell-lib-1.J, A-K2-shell-lib-6.J, A-K2-webmcp-1.J, A-K2-0.J, A-K2-settings-3.J | B104 | 69 min |  |
| RT-K1-adm-api-keys-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-api-keys-1.J, K4-seam-5.T, RT-K1-0.T | B104 | 49 min | 628 |
| K5-api-connections-2.T | K5 | Tovu | 8 (delete + repoint) | K5-api-connections-2.J, K4-seam-6.T, K4-seam-15.T, K4-seam-8.T | B104 | 64 min | 628 |
| K5-fs-files-1.T | K5 | Tovu | 7 (delete + repoint) | K5-fs-files-1.J, K4-contracts-core-5.T | B104 | 76 min | 628 |
| K5-object-storage-1.T | K5 | Tovu | 4 (delete + repoint) | K5-object-storage-1.J, K4-seam-13.T | B104 | 44 min | 628 |
| K5-webhooks-4.J | K5 | Jini | 3 (move) | K5-webhooks-1.J, X-webhooks-1.J, K5-webhooks-3.J, K5-webhooks-2.J, K4-seam-11.J, K5-contracts-core-4.J, K5-contracts-core-10.J, K5-contracts-core-6.J | B105 | 67 min |  |
| K5-deployments-3.J | K5 | Jini | 3 (move) | K5-agent-plugins-5.J, K5-agent-plugins-4.J, K5-deployments-1.J, K4-seam-6.J | B105 | 72 min |  |
| RT-K1-adm-users-1.J | RT-K1 | Jini | 3 (move) | K4-seam-5.J, K5-identity-2.J, X-identity-1.J, K4-seam-14.J, RT-K1-0.J | B105 | 80 min |  |
| A-K2-settings-4.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-settings-4.J, A-K2-0.T | B105 | 30 min | 614 |
| RT-K1-adm-taxonomy-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-taxonomy-2.J, RT-K1-0.T | B105 | 34 min | 614 |
| K5-project-keys-1.T | K5 | Tovu | 8 (delete + repoint) | K5-project-keys-1.J, K4-seam-13.T, K4-seam-1.T, K4-seam-10.T, K4-seam-20.T | B105 | 83 min | 614 |
| K5-publish-content-4.J | K5 | Jini | 10 (move) | K5-publish-content-1.J, K5-publish-content-3.J, K4-publish-content-2.J, K4-seam-7.J, K4-seam-21.J, K5-webhooks-4.J, K4-seam-1.J, K5-publish-trust-1.J, K4-seam-2.J | B106 | 95 min |  |
| K5-media-1.J | K5 | Jini | 11 (move) | K4-seam-3.J, X-media-1.J, K4-contracts-core-5.J, K4-seam-15.J, X-content-duplication-1.J, K4-seam-10.J, K5-webhooks-4.J, K5-contracts-headless-2.J, K5-contracts-core-10.J, K4-seam-5.J | B106 | 94 min |  |
| K5-database-transfer-1.J | K5 | Jini | 8 (move) | X-database-transfer-1.J, K5-webhooks-4.J, K4-seam-1.J, K5-contracts-headless-2.J, K4-seam-13.J, K5-contracts-core-10.J | B106 | 91 min |  |
| K5-custom-credentials-3.T | K5 | Tovu | 6 (delete + repoint) | K5-custom-credentials-3.J, K4-seam-15.T, K4-seam-10.T | B106 | 83 min | 600 |
| K5-deployments-3.T | K5 | Tovu | 3 (delete + repoint) | K5-deployments-3.J, K4-seam-6.T | B106 | 59 min | 600 |
| K5-entries-1.T | K5 | Tovu | 5 (delete + repoint) | K5-entries-1.J, K4-publish-content-2.T, K4-seam-5.T, K4-trash-2.T | B106 | 49 min | 600 |
| K5-vendor-credentials-1.J | K5 | Jini | 6 (move) | K4-seam-5.J, K5-webhooks-4.J, K5-source-control-1.J, X-vendor-credentials-1.J | B107 | 63 min |  |
| K5-mail-status-2.J | K5 | Jini | 2 (move) | K4-contracts-core-5.J, K5-contracts-core-7.J, K5-platform-mail-2.J, X-mail-status-1.J, K5-mail-status-1.J, K5-agent-plugins-8.J, K5-custom-credentials-1.J, K4-seam-1.J, K5-contracts-core-10.J | B107 | 60 min |  |
| RT-K1-adm-users-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-users-1.J, RT-K1-0.J | B107 | 101 min |  |
| RT-K1-adm-integrations-1.J | RT-K1 | Jini | 4 (move) | K5-webhooks-4.J, RT-K1-0.J | B107 | 92 min |  |
| K5-identity-2.T | K5 | Tovu | 5 (delete + repoint) | K5-identity-2.J, K4-contracts-core-5.T | B107 | 68 min | 584 |
| K5-media-1.T | K5 | Tovu | 11 (delete + repoint) | K5-media-1.J, K4-seam-3.T, K4-contracts-core-5.T, K4-seam-15.T, K4-seam-10.T, K4-seam-5.T | B107 | 59 min | 584 |
| K5-deployments-2.J | K5 | Jini | 8 (move) | K5-deployments-1.J, K4-seam-3.J, K5-contracts-core-7.J, K5-publish-content-4.J, K5-webhooks-4.J, K5-contracts-headless-2.J, K5-custom-credentials-3.J, K5-contracts-core-10.J, K5-vendor-credentials-1.J | B108 | 98 min |  |
| RT-K1-adm-integrations-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-integrations-1.J, RT-K1-0.T | B108 | 53 min | 557 |
| RT-K1-adm-users-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-users-2.J, RT-K1-0.T | B108 | 49 min | 557 |
| K5-publish-content-4.T | K5 | Tovu | 10 (delete + repoint) | K5-publish-content-4.J, K4-publish-content-2.T, K4-seam-7.T, K4-seam-21.T, K4-seam-1.T, K4-seam-2.T | B108 | 91 min | 557 |
| K5-recovery-1.T | K5 | Tovu | 4 (delete + repoint) | K5-recovery-1.J, K4-seam-5.T, K4-contracts-core-5.T, K4-seam-7.T | B108 | 44 min | 557 |
| K5-vendor-credentials-1.T | K5 | Tovu | 6 (delete + repoint) | K5-vendor-credentials-1.J, K4-seam-5.T | B108 | 55 min | 557 |
| K5-source-control-2.J | K5 | Jini | 4 (move) | K5-agent-plugins-5.J, X-agent-plugins-1.J, K5-agent-plugins-4.J, K5-source-control-1.J, K4-seam-2.J, K5-contracts-core-1.J, K5-vendor-credentials-1.J, K4-seam-1.J, K5-custom-credentials-2.J, K5-contracts-core-2.J | B109 | 96 min |  |
| K5-deployments-4.J | K5 | Jini | 7 (move) | K5-contracts-core-1.J, K5-vendor-credentials-1.J, K5-deployments-1.J, K4-seam-5.J, K4-seam-1.J, K5-deployments-3.J, K5-deployments-2.J, K5-contracts-core-10.J, X-identity-2.J | B109 | 95 min |  |
| RT-K1-adm-integrations-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-integrations-1.J, RT-K1-0.J, K5-webhooks-4.J | B109 | 79 min |  |
| RT-K1-adm-users-1.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-users-1.J, K4-seam-5.T, K4-seam-14.T, RT-K1-0.T | B109 | 80 min | 540 |
| K5-database-1.T | K5 | Tovu | 6 (delete + repoint) | K5-database-1.J, K4-seam-7.T | B109 | 51 min | 540 |
| K5-database-transfer-1.T | K5 | Tovu | 8 (delete + repoint) | K5-database-transfer-1.J, K4-seam-1.T, K4-seam-13.T | B109 | 62 min | 540 |
| K5-source-control-3.J | K5 | Jini | 3 (move) | K5-contracts-core-2.J, K5-custom-credentials-1.J, X-vendor-credentials-1.J, K5-contracts-headless-2.J, K5-contracts-core-1.J, K5-contracts-core-10.J, K5-source-control-2.J, K5-source-control-1.J, K5-custom-credentials-3.J, K4-seam-1.J, K4-seam-2.J | B110 | 94 min |  |
| K5-custom-credentials-4.J | K5 | Jini | 1 (move) | X-vendor-credentials-1.J, K5-custom-credentials-1.J, K5-deployments-1.J, K5-contracts-core-4.J, K5-contracts-headless-2.J, K5-contracts-core-1.J, K5-contracts-core-10.J, K5-contracts-core-2.J, K5-custom-credentials-2.J, K5-custom-credentials-3.J, K5-source-control-2.J, K4-seam-1.J, K4-seam-2.J | B110 | 58 min |  |
| RT-K1-adm-users-6.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-users-1.J, RT-K1-0.J, X-identity-1.J | B110 | 77 min |  |
| RT-K1-adm-users-5.J | RT-K1 | Jini | 3 (move) | X-identity-1.J, RT-K1-adm-users-1.J, RT-K1-0.J | B110 | 103 min |  |
| RT-K1-adm-integrations-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-integrations-2.J, RT-K1-0.T | B110 | 36 min | 529 |
| K5-deployments-2.T | K5 | Tovu | 8 (delete + repoint) | K5-deployments-2.J, K4-seam-3.T | B110 | 86 min | 529 |
| K5-external-mcp-4.J | K5 | Jini | 1 (move) | K5-contracts-core-3.J, K5-contracts-core-4.J, K5-contracts-core-7.J, K5-contracts-core-1.J, K5-contracts-core-10.J, K5-external-mcp-2.J, K5-external-mcp-1.J, K5-external-mcp-3.J, X-external-mcp-1.J | B111 | 53 min |  |
| K5-database-transfer-2.J | K5 | Jini | 1 (move) | K5-contracts-core-4.J, K5-contracts-core-10.J, K5-database-transfer-1.J, K5-contracts-headless-2.J, K5-contracts-core-2.J, X-database-transfer-1.J, K4-seam-7.J | B111 | 43 min |  |
| RT-K1-adm-fs-files-1.J | RT-K1 | Jini | 2 (move) | K5-fs-files-1.J, X-fs-files-1.J, RT-K1-0.J | B111 | 56 min |  |
| RT-K1-adm-agent-plugins-1.J | RT-K1 | Jini | 2 (move) | K5-agent-plugins-4.J, K5-agent-plugins-6.J, RT-K1-0.J, K4-seam-16.J, K5-contracts-headless-2.J, K5-agent-plugins-7.J, K5-agent-plugins-5.J | B111 | 93 min |  |
| RT-K1-adm-users-5.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-users-5.J, RT-K1-0.T | B111 | 52 min | 519 |
| K5-deployments-4.T | K5 | Tovu | 7 (delete + repoint) | K5-deployments-4.J, K4-seam-5.T, K4-seam-1.T | B111 | 94 min | 519 |
| RT-K1-adm-agent-plugins-3.J | RT-K1 | Jini | 2 (move) | K5-agent-plugins-4.J, RT-K1-adm-agent-plugins-1.J, RT-K1-0.J, K5-agent-plugins-3.J | B112 | 90 min |  |
| RT-K1-adm-agent-plugins-2.J | RT-K1 | Jini | 2 (move) | K5-agent-plugins-5.J, RT-K1-adm-agent-plugins-1.J, RT-K1-0.J, K5-api-connections-2.J, K5-api-connections-1.J, RT-K1-pub-oauth-1.J | B112 | 78 min |  |
| RT-K1-adm-agent-plugins-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-agent-plugins-1.J, RT-K1-0.T, K4-seam-16.T | B112 | 53 min | 506 |
| RT-K1-adm-fs-files-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-fs-files-1.J, RT-K1-0.T | B112 | 27 min | 506 |
| RT-K1-adm-users-6.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-users-6.J, RT-K1-0.T | B112 | 36 min | 506 |
| K5-mail-status-1.T | K5 | Tovu | 6 (delete + repoint) | K5-mail-status-1.J, K4-seam-13.T, K4-seam-4.T, K4-seam-6.T, K4-contracts-core-5.T, K4-seam-1.T | B112 | 49 min | 506 |
| V-members-3.J | V | Jini | 1 (move) | K5-members-1.J, K5-platform-mail-2.J, K5-members-2.J | B113 | 23 min |  |
| RT-K1-adm-newsletter-1.J | RT-K1 | Jini | 2 (move) | K5-newsletter-2.J, RT-K1-0.J, K4-seam-5.J, K5-newsletter-1.J, K4-seam-1.J | B113 | 83 min |  |
| RT-K1-adm-agent-plugins-4.J | RT-K1 | Jini | 2 (move) | K5-agent-plugins-7.J, K5-agent-plugins-4.J, K5-agent-plugins-6.J, K5-agent-plugins-8.J, RT-K1-adm-agent-plugins-1.J, RT-K1-0.J | B113 | 102 min |  |
| RT-K1-adm-agent-plugins-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-agent-plugins-2.J, RT-K1-0.T | B113 | 39 min | 498 |
| K5-mail-status-2.T | K5 | Tovu | 2 (delete + repoint) | K5-mail-status-2.J, K4-contracts-core-5.T, K4-seam-1.T | B113 | 39 min | 498 |
| K5-source-control-2.T | K5 | Tovu | 4 (delete + repoint) | K5-source-control-2.J, K4-seam-2.T, K4-seam-1.T | B113 | 83 min | 498 |
| K5-member-login-1.J | K5 | Jini | 7 (move) | K4-seam-1.J, K5-contracts-headless-2.J, K5-custom-credentials-3.J, K4-seam-15.J, V-members-3.J, K5-agent-plugins-5.J, K5-agent-plugins-4.J | B114 | 78 min |  |
| RT-K1-adm-newsletter-4.J | RT-K1 | Jini | 4 (move) | K5-newsletter-2.J, RT-K1-adm-newsletter-1.J, RT-K1-0.J | B114 | 97 min |  |
| RT-K1-adm-members-1.J | RT-K1 | Jini | 4 (move) | V-members-3.J, K5-contracts-core-3.J, RT-K1-0.J | B114 | 91 min |  |
| RT-K1-adm-agent-plugins-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-agent-plugins-3.J, RT-K1-0.T | B114 | 49 min | 491 |
| RT-K1-adm-newsletter-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-newsletter-1.J, RT-K1-0.T, K4-seam-5.T, K4-seam-1.T | B114 | 87 min | 491 |
| K5-source-control-3.T | K5 | Tovu | 3 (delete + repoint) | K5-source-control-3.J, K4-seam-1.T, K4-seam-2.T | B114 | 60 min | 491 |
| RT-K1-adm-newsletter-2.J | RT-K1 | Jini | 3 (move) | K5-newsletter-1.J, RT-K1-adm-newsletter-1.J, RT-K1-0.J | B115 | 86 min |  |
| RT-K1-adm-members-2.J | RT-K1 | Jini | 3 (move) | V-members-3.J, RT-K1-adm-members-1.J, RT-K1-0.J, K5-platform-mail-2.J | B115 | 87 min |  |
| RT-K1-adm-agent-plugins-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-agent-plugins-4.J, RT-K1-0.T | B115 | 53 min | 475 |
| RT-K1-adm-newsletter-4.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-newsletter-4.J, RT-K1-0.T | B115 | 43 min | 475 |
| K5-member-login-1.T | K5 | Tovu | 7 (delete + repoint) | K5-member-login-1.J, K4-seam-1.T, K4-seam-15.T | B115 | 49 min | 475 |
| K5-webhooks-4.T | K5 | Tovu | 3 (delete + repoint) | K5-webhooks-4.J, K4-seam-11.T | B115 | 81 min | 475 |
| K5-site-search-1.J | K5 | Jini | 3 (move) | K4-seam-5.J, K5-platform-routing-1.J, K5-contracts-core-3.J, K5-post-3.J, V-members-3.J | B116 | 61 min |  |
| RT-K1-adm-newsletter-5.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-newsletter-1.J, RT-K1-0.J, K5-newsletter-2.J | B116 | 85 min |  |
| RT-K1-adm-newsletter-3.J | RT-K1 | Jini | 3 (move) | K5-newsletter-1.J, RT-K1-adm-newsletter-1.J, RT-K1-0.J, K5-newsletter-2.J | B116 | 85 min |  |
| RT-K1-adm-members-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-members-1.J, RT-K1-0.T | B116 | 53 min | 467 |
| RT-K1-adm-newsletter-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-newsletter-2.J, RT-K1-0.T | B116 | 40 min | 467 |
| K5-custom-credentials-4.T | K5 | Tovu | 1 (delete + repoint) | K5-custom-credentials-4.J, K4-seam-1.T, K4-seam-2.T | B116 | 40 min | 467 |
| RT-K1-adm-newsletter-7.J | RT-K1 | Jini | 3 (move) | K5-newsletter-2.J, RT-K1-adm-newsletter-1.J, RT-K1-0.J, K5-newsletter-1.J | B117 | 95 min |  |
| RT-K1-adm-newsletter-6.J | RT-K1 | Jini | 3 (move) | K5-newsletter-1.J, K5-newsletter-2.J, RT-K1-adm-newsletter-1.J, RT-K1-0.J | B117 | 91 min |  |
| RT-K1-adm-members-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-members-2.J, RT-K1-0.T | B117 | 42 min | 457 |
| RT-K1-adm-newsletter-3.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-newsletter-3.J, RT-K1-0.T | B117 | 40 min | 457 |
| K5-database-transfer-2.T | K5 | Tovu | 1 (delete + repoint) | K5-database-transfer-2.J, K4-seam-7.T | B117 | 29 min | 457 |
| K5-site-search-1.T | K5 | Tovu | 3 (delete + repoint) | K5-site-search-1.J, K4-seam-5.T | B117 | 31 min | 457 |
| K5-newsletter-3.J | K5 | Jini | 1 (move) | K5-newsletter-1.J, K5-contracts-core-2.J, K5-contracts-core-10.J, K5-newsletter-2.J | B118 | 49 min |  |
| RT-K1-adm-publish-content-3.J | RT-K1 | Jini | 2 (move) | K5-contracts-core-2.J, K5-publish-content-1.J, K5-publish-content-4.J, RT-K1-adm-plugin-hook-error-1.J, RT-K1-0.J, K5-publish-content-3.J, K4-publish-content-2.J, RT-K1-adm-publish-content-1.J, RT-K1-adm-publish-content-2.J | B118 | 101 min |  |
| RT-K1-adm-plugins-1.J | RT-K1 | Jini | 2 (move) | RT-K1-0.J, K5-plugin-runtime-2.J, K5-contracts-core-3.J, K5-plugin-runtime-1.J, K4-seam-10.J, K4-seam-16.J | B118 | 87 min |  |
| RT-K1-adm-newsletter-5.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-newsletter-5.J, RT-K1-0.T | B118 | 41 min | 452 |
| K5-external-mcp-4.T | K5 | Tovu | 1 (delete + repoint) | K5-external-mcp-4.J | B118 | 32 min | 452 |
| V-members-3.T | V | Tovu | 1 (delete + repoint) | V-members-3.J | B118 | 66 min | 452 |
| RT-K1-adm-plugins-4.J | RT-K1 | Jini | 2 (move) | K5-contracts-core-3.J, K5-plugin-runtime-2.J, RT-K1-adm-plugins-1.J, RT-K1-0.J | B119 | 104 min |  |
| RT-K1-adm-plugins-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-plugins-1.J, RT-K1-0.J, K5-plugin-runtime-2.J, K4-seam-16.J, RT-K1-adm-plugin-hook-error-1.J | B119 | 88 min |  |
| RT-K1-adm-newsletter-6.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-newsletter-6.J, RT-K1-0.T | B119 | 43 min | 444 |
| RT-K1-adm-plugins-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-plugins-1.J, RT-K1-0.T, K4-seam-10.T, K4-seam-16.T | B119 | 53 min | 444 |
| RT-K1-adm-publish-content-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-publish-content-3.J, RT-K1-0.T, K4-publish-content-2.T | B119 | 52 min | 444 |
| K5-newsletter-3.T | K5 | Tovu | 1 (delete + repoint) | K5-newsletter-3.J | B119 | 32 min | 444 |
| RT-K1-adm-recovery-2.J | RT-K1 | Jini | 2 (move) | K5-contracts-core-2.J, K5-recovery-1.J, RT-K1-0.J, RT-K1-adm-database-recovery-1.J | B120 | 97 min |  |
| RT-K1-adm-plugins-5.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-plugins-1.J, RT-K1-adm-plugins-2.J, RT-K1-0.J | B120 | 71 min |  |
| K4-seam-23.J | K4 | Jini | — | — | B120 | 94 min |  |
| K4-seam-22.J | K4 | Jini | — | — | B120 | 91 min |  |
| RT-K1-adm-newsletter-7.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-newsletter-7.J, RT-K1-0.T | B120 | 43 min | 438 |
| RT-K1-adm-plugins-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-plugins-2.J, RT-K1-0.T, K4-seam-16.T | B120 | 47 min | 438 |
| K5-web-screenshot-1.J | K5 | Jini | 8 (move) | K4-seam-2.J, K4-seam-22.J, K4-seam-13.J | B121 | 99 min |  |
| RT-K1-adm-system-2.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, K4-seam-23.J, K5-contracts-core-3.J, K5-platform-mail-2.J | B121 | 103 min |  |
| K4-seam-22.T | K4 | Tovu | — | K4-seam-22.J | B121 | 73 min |  |
| K4-seam-23.T | K4 | Tovu | — | K4-seam-23.J | B121 | 76 min |  |
| RT-K1-adm-plugins-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-plugins-4.J, RT-K1-0.T | B121 | 54 min | 434 |
| RT-K1-adm-recovery-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-recovery-2.J, RT-K1-0.T | B121 | 49 min | 434 |
| K5-web-screenshot-2.J | K5 | Jini | 1 (move) | K5-contracts-core-6.J, K5-web-screenshot-1.J | B122 | 27 min |  |
| RT-K1-adm-system-10.J | RT-K1 | Jini | 2 (move) | K5-deployments-4.J, K5-custom-credentials-3.J, RT-K1-0.J, K5-source-control-3.J | B122 | 88 min |  |
| RT-K1-adm-system-3.J | RT-K1 | Jini | 2 (move) | K5-server-logs-1.J, RT-K1-0.J, K5-mail-status-1.J | B122 | 69 min |  |
| RT-K1-adm-plugins-5.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-plugins-5.J, RT-K1-0.T | B122 | 36 min | 420 |
| RT-K1-adm-system-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-system-2.J, RT-K1-0.T, K4-seam-23.T | B122 | 45 min | 420 |
| K5-web-screenshot-1.T | K5 | Tovu | 8 (delete + repoint) | K5-web-screenshot-1.J, K4-seam-2.T, K4-seam-22.T, K4-seam-13.T | B122 | 60 min | 420 |
| RT-K1-adm-users-3.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-users-1.J, X-identity-1.J, RT-K1-0.J | B123 | 80 min |  |
| RT-K1-adm-taxonomy-3.J | RT-K1 | Jini | 2 (move) | K5-taxonomy-1.J, RT-K1-0.J, RT-K1-adm-taxonomy-1.J | B123 | 86 min |  |
| RT-K1-adm-system-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-3.J, RT-K1-0.T | B123 | 34 min | 417 |
| K5-web-screenshot-2.T | K5 | Tovu | 1 (delete + repoint) | K5-web-screenshot-2.J | B123 | 20 min | 417 |
| RT-K1-adm-users-7.J | RT-K1 | Jini | 2 (move) | X-identity-1.J, RT-K1-adm-users-1.J, RT-K1-0.J | B124 | 90 min |  |
| RT-K1-adm-users-4.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-users-1.J, RT-K1-0.J, X-identity-1.J | B124 | 80 min |  |
| RT-K1-adm-system-10.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-10.J, RT-K1-0.T | B124 | 44 min | 411 |
| RT-K1-adm-taxonomy-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-taxonomy-3.J, RT-K1-0.T | B124 | 42 min | 411 |
| RT-K1-adm-users-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-users-3.J, RT-K1-0.T | B124 | 41 min | 411 |
| RT-K1-adm-users-9.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-users-1.J, X-identity-1.J, RT-K1-0.J | B125 | 81 min |  |
| RT-K1-adm-users-8.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-users-1.J, RT-K1-0.J | B125 | 74 min |  |
| RT-K1-adm-users-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-users-4.J, RT-K1-0.T | B125 | 42 min | 409 |
| K5-media-2.J | K5 | Jini | 2 (move) | K5-media-1.J, K5-contracts-core-1.J, K5-webhooks-4.J, K4-seam-1.J | B126 | 56 min |  |
| RT-K1-adm-workspace-2.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-workspace-1.J, RT-K1-0.J, K5-workspace-1.J | B126 | 54 min |  |
| RT-K1-adm-users-7.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-users-7.J, RT-K1-0.T | B126 | 49 min | 407 |
| K5-settings-4.J | K5 | Jini | 2 (move) | K5-contracts-core-10.J, K5-contracts-core-6.J, K5-settings-1.J, K5-settings-2.J, K4-seam-1.J, K4-seam-11.J, K5-contracts-headless-2.J, X-settings-1.J | B127 | 43 min |  |
| RT-K1-pub-agent-plugin-surfaces-1.J | RT-K1 | Jini | 2 (move) | K5-contracts-core-3.J, K5-agent-plugins-4.J, K5-agent-plugins-5.J, K4-seam-14.J | B127 | 70 min |  |
| RT-K1-adm-users-8.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-users-8.J, RT-K1-0.T | B127 | 38 min | 401 |
| RT-K1-adm-workspace-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-workspace-2.J, RT-K1-0.T | B127 | 27 min | 401 |
| K5-media-2.T | K5 | Tovu | 2 (delete + repoint) | K5-media-2.J, K4-seam-1.T | B127 | 44 min | 401 |
| RT-K1-adm-api-keys-2.J | RT-K1 | Jini | 1 (move) | X-identity-2.J, RT-K1-adm-api-keys-1.J, RT-K1-0.J | B128 | 42 min |  |
| RT-K1-adm-agent-plugins-5.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-2.J, K5-agent-plugins-7.J, K5-agent-plugins-8.J, RT-K1-adm-agent-plugins-1.J, RT-K1-0.J | B128 | 78 min |  |
| RT-K1-adm-users-9.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-users-9.J, RT-K1-0.T | B128 | 43 min | 395 |
| RT-K1-pub-agent-plugin-surfaces-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-agent-plugin-surfaces-1.J, K4-seam-14.T | B128 | 33 min | 395 |
| K5-settings-4.T | K5 | Tovu | 2 (delete + repoint) | K5-settings-4.J, K4-seam-1.T, K4-seam-11.T | B128 | 26 min | 395 |
| RT-K1-adm-content-types-2.J | RT-K1 | Jini | 1 (move) | X-content-types-1.J, RT-K1-adm-content-types-1.J, RT-K1-0.J | B129 | 37 min |  |
| RT-K1-adm-commerce-1.J | RT-K1 | Jini | 1 (move) | RT-K1-0.J, K4-seam-22.J | B129 | 44 min |  |
| RT-K1-adm-agent-plugins-5.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-agent-plugins-5.J, RT-K1-0.T | B129 | 42 min | 393 |
| RT-K1-adm-api-keys-2.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-api-keys-2.J, RT-K1-0.T | B129 | 23 min | 393 |
| RT-K1-adm-external-mcp-4.J | RT-K1 | Jini | 1 (move) | K5-api-connections-1.J, K5-external-mcp-2.J, K5-external-mcp-1.J, K5-contracts-core-3.J, RT-K1-pub-external-mcp-1.J, RT-K1-adm-external-mcp-1.J, RT-K1-0.J | B130 | 85 min |  |
| RT-K1-adm-database-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-2.J, K5-database-1.J, RT-K1-0.J | B130 | 80 min |  |
| RT-K1-adm-commerce-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-commerce-1.J, RT-K1-0.T, K4-seam-22.T | B130 | 23 min | 391 |
| RT-K1-adm-content-types-2.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-content-types-2.J, RT-K1-0.T | B130 | 22 min | 391 |
| RT-K1-adm-plugins-3.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-plugins-1.J, K5-project-keys-1.J, RT-K1-0.J, K4-seam-22.J | B131 | 62 min |  |
| RT-K1-adm-owner-mfa-deps-1.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-users-1.J, RT-K1-0.J | B131 | 42 min |  |
| RT-K1-adm-database-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-database-1.J, RT-K1-0.T | B131 | 44 min | 389 |
| RT-K1-adm-external-mcp-4.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-external-mcp-4.J, RT-K1-0.T | B131 | 47 min | 389 |
| RT-K1-adm-skills-2.J | RT-K1 | Jini | 1 (move) | K5-skills-1.J, RT-K1-adm-skills-1.J, K4-contracts-headless-1.J, RT-K1-0.J, K4-seam-22.J | B132 | 62 min |  |
| RT-K1-adm-owner-passkey-routes-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-3.J, RT-K1-adm-owner-mfa-deps-1.J, RT-K1-0.J | B132 | 54 min |  |
| RT-K1-adm-owner-mfa-deps-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-owner-mfa-deps-1.J, RT-K1-0.T | B132 | 26 min | 387 |
| RT-K1-adm-plugins-3.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-plugins-3.J, RT-K1-0.T, K4-seam-22.T | B132 | 32 min | 387 |
| RT-K1-adm-system-8.J | RT-K1 | Jini | 1 (move) | K5-deployments-4.J, RT-K1-0.J | B133 | 50 min |  |
| RT-K1-adm-system-4.J | RT-K1 | Jini | 1 (move) | K5-webhooks-4.J, X-identity-2.J, RT-K1-0.J, K4-seam-22.J | B133 | 112 min |  |
| RT-K1-adm-owner-passkey-routes-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-owner-passkey-routes-1.J, RT-K1-0.T | B133 | 30 min | 385 |
| RT-K1-adm-skills-2.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-skills-2.J, K4-contracts-headless-1.T, RT-K1-0.T, K4-seam-22.T | B133 | 34 min | 385 |
| RT-K1-adm-system-9.J | RT-K1 | Jini | 1 (move) | K5-mail-status-1.J, X-mail-status-1.J, RT-K1-0.J | B134 | 95 min |  |
| RT-K1-adm-system-5.J | RT-K1 | Jini | 2 (move) | K5-webhooks-4.J, K5-identity-2.J, RT-K1-adm-system-4.J, RT-K1-0.J, RT-K1-adm-settings-1.J, K5-settings-3.J | B134 | 90 min |  |
| RT-K1-adm-system-4.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-4.J, RT-K1-0.T, K4-seam-22.T | B134 | 60 min | 384 |
| RT-K1-adm-system-7.J | RT-K1 | Jini | 2 (move) | K5-contracts-core-1.J, RT-K1-adm-settings-1.J, RT-K1-adm-system-5.J, K5-deployments-4.J, RT-K1-0.J | B135 | 91 min |  |
| RT-K1-adm-system-6.J | RT-K1 | Jini | 3 (move) | K5-domain-dns-1.J, RT-K1-0.J, K5-custom-credentials-3.J, K5-mail-status-1.J, K5-contracts-headless-2.J, RT-K1-adm-settings-1.J, RT-K1-adm-system-5.J | B135 | 97 min |  |
| RT-K1-adm-system-5.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-5.J, RT-K1-0.T | B135 | 46 min | 382 |
| K5-comments-2.J | K5 | Jini | 1 (move) | K5-contracts-core-4.J, K5-contracts-core-10.J, K5-settings-3.J, K5-comments-1.J, K4-seam-8.J, K4-seam-5.J | B136 | 42 min |  |
| RT-K1-adm-system-14.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-sites-2.J, RT-K1-adm-sites-1.J, K5-agent-plugins-8.J, RT-K1-0.J, K4-seam-23.J | B136 | 120 min |  |
| RT-K1-adm-system-6.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-system-6.J, RT-K1-0.T | B136 | 54 min | 379 |
| RT-K1-pub-api-connections-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-3.J, K5-api-connections-2.J, K5-api-connections-1.J, RT-K1-pub-oauth-1.J, RT-K1-0.J | B137 | 53 min |  |
| V-media-3.J | V | Jini | 1 (move) | X-media-1.J, K5-media-2.J, K5-media-1.J | B137 | 23 min |  |
| RT-K1-adm-system-7.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-7.J, RT-K1-0.T | B137 | 47 min | 376 |
| K5-comments-2.T | K5 | Tovu | 1 (delete + repoint) | K5-comments-2.J, K4-seam-8.T, K4-seam-5.T | B137 | 31 min | 376 |
| K5-theme-4.J | K5 | Jini | 16 (move) | K5-theme-1.J, K5-theme-3.J, K5-platform-routing-1.J, K5-theme-2.J, T-theme-1.J, C-platform-html-1.J, V-media-3.J, K5-publish-content-1.J, K4-publish-content-2.J, K4-trash-2.J, K5-publish-content-3.J, K4-seam-5.J | B138 | 96 min |  |
| K5-forms-1.J | K5 | Jini | 13 (move) | K4-seam-5.J, K5-contracts-core-2.J, K5-contracts-core-3.J, K5-contracts-headless-2.J, V-media-3.J, V-contracts-core-9.J, C-platform-html-1.J, X-content-duplication-1.J, X-forms-1.J, K5-contracts-core-6.J, K5-publish-content-1.J, K5-publish-content-3.J, K4-publish-content-2.J, K5-contracts-core-4.J, K4-contracts-core-5.J, K4-seam-10.J | B138 | 89 min |  |
| RT-K1-adm-system-8.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-8.J, RT-K1-0.T | B138 | 27 min | 373 |
| V-media-3.T | V | Tovu | 1 (delete + repoint) | V-media-3.J | B138 | 120 min | 373 |
| RT-K1-pub-api-connections-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-api-connections-1.J, RT-K1-0.T | B138 | 32 min | 373 |
| K5-media-4.J | K5 | Jini | 8 (move) | K5-media-1.J, V-media-3.J, K5-publish-content-1.J, K4-publish-content-2.J, K4-seam-5.J, K4-contracts-core-5.J, X-media-1.J, K5-publish-content-3.J, K4-seam-1.J | B139 | 57 min |  |
| RT-K1-adm-media-1.J | RT-K1 | Jini | 7 (move) | RT-K1-0.J, V-media-3.J | B139 | 104 min |  |
| RT-K1-adm-system-9.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-9.J, RT-K1-0.T | B139 | 55 min | 356 |
| K5-theme-4.T | K5 | Tovu | 16 (delete + repoint) | K5-theme-4.J, K4-publish-content-2.T, K4-trash-2.T, K4-seam-5.T | B139 | 94 min | 356 |
| K5-post-4.J | K5 | Jini | 7 (move) | K5-publish-content-1.J, K4-publish-content-2.J, K5-publish-content-3.J, K5-taxonomy-1.J, K5-post-3.J, K5-post-2.J, K5-post-1.J, K5-contracts-core-3.J, K4-seam-5.J, V-media-3.J | B140 | 92 min |  |
| K5-media-generation-1.J | K5 | Jini | 5 (move) | K5-agent-plugins-4.J, K5-media-2.J, K4-seam-5.J, K4-contracts-core-5.J, K5-contracts-headless-2.J, K5-contracts-core-1.J, K5-contracts-core-10.J, K4-seam-20.J, K4-seam-1.J, V-media-3.J, X-media-1.J, K5-contracts-core-7.J, K5-media-4.J, K4-seam-3.J | B140 | 93 min |  |
| RT-K1-adm-media-1.T | RT-K1 | Tovu | 7 (delete + repoint) | RT-K1-adm-media-1.J, RT-K1-0.T | B140 | 81 min | 335 |
| RT-K1-adm-system-14.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-14.J, RT-K1-0.T, K4-seam-23.T | B140 | 64 min | 335 |
| K5-forms-1.T | K5 | Tovu | 13 (delete + repoint) | K5-forms-1.J, K4-seam-5.T, K4-publish-content-2.T, K4-contracts-core-5.T, K4-seam-10.T | B140 | 81 min | 335 |
| RT-K1-adm-media-2.J | RT-K1 | Jini | 4 (move) | V-media-3.J, RT-K1-adm-media-1.J, RT-K1-0.J | B141 | 88 min |  |
| RT-K1-adm-forms-3.J | RT-K1 | Jini | 3 (move) | K5-forms-1.J, R-admin-http-1.J, RT-K1-adm-forms-1.J, RT-K1-0.J | B141 | 73 min |  |
| K5-media-4.T | K5 | Tovu | 8 (delete + repoint) | K5-media-4.J, K4-publish-content-2.T, K4-seam-5.T, K4-contracts-core-5.T, K4-seam-1.T | B141 | 52 min | 327 |
| K5-media-import-1.J | K5 | Jini | 3 (move) | K5-fs-files-1.J, V-media-3.J, K4-seam-2.J, X-media-1.J, K4-contracts-core-5.J, K5-media-4.J, K5-contracts-core-10.J, K4-seam-3.J | B142 | 47 min |  |
| RT-K1-adm-assistant-6.J | RT-K1 | Jini | 2 (move) | K5-settings-3.J, RT-K1-0.J, K4-seam-11.J, V-media-3.J, RT-K1-adm-media-1.J | B142 | 74 min |  |
| RT-K1-adm-forms-3.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-forms-3.J, RT-K1-0.T | B142 | 38 min | 313 |
| RT-K1-adm-media-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-media-2.J, RT-K1-0.T | B142 | 39 min | 313 |
| K5-post-4.T | K5 | Tovu | 7 (delete + repoint) | K5-post-4.J, K4-publish-content-2.T, K4-seam-5.T | B142 | 78 min | 313 |
| K5-theme-5.J | K5 | Jini | 9 (move) | K5-theme-4.J, V-media-3.J, K5-media-import-1.J, K5-fs-files-1.J, K5-theme-2.J, T-theme-1.J, K4-seam-2.J, K5-theme-3.J, K5-presentation-1.J, K5-theme-1.J, K4-seam-3.J | B143 | 63 min |  |
| RT-K1-adm-media-3.J | RT-K1 | Jini | 5 (move) | V-media-3.J, K5-media-import-1.J, K5-media-4.J, RT-K1-adm-media-1.J, RT-K1-0.J, R-admin-http-1.J | B143 | 99 min |  |
| RT-K1-adm-assistant-6.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-assistant-6.J, RT-K1-0.T, K4-seam-11.T | B143 | 36 min | 306 |
| K5-media-generation-1.T | K5 | Tovu | 5 (delete + repoint) | K5-media-generation-1.J, K4-seam-5.T, K4-contracts-core-5.T, K4-seam-20.T, K4-seam-1.T, K4-seam-3.T | B143 | 50 min | 306 |
| K5-theme-7.J | K5 | Jini | 10 (move) | K5-theme-1.J, K5-theme-3.J, K5-theme-5.J, K5-theme-4.J, K5-theme-2.J, T-theme-1.J, K4-trash-2.J, K5-media-import-1.J, K5-fs-files-1.J | B144 | 85 min |  |
| K4-asset-transfer-1.J | K4 | Jini | 3 (move) | K5-contracts-core-10.J, K5-media-import-1.J, V-media-3.J, K5-theme-5.J, K5-fs-files-1.J, K4-contracts-core-5.J, K5-media-1.J, K4-seam-1.J | B144 | 30 min |  |
| RT-K1-adm-media-3.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-media-3.J, RT-K1-0.T | B144 | 55 min | 292 |
| K5-theme-5.T | K5 | Tovu | 9 (delete + repoint) | K5-theme-5.J, K4-seam-2.T, K4-seam-3.T | B144 | 58 min | 292 |
| K4-image-transform-1.J | K4 | Jini | 1 (move) | K4-contracts-core-5.J, K5-contracts-core-10.J, K5-fs-files-1.J, K4-asset-transfer-1.J, K5-theme-5.J, K5-media-import-1.J, X-image-transform-1.J, K4-seam-1.J | B145 | 25 min |  |
| RT-K1-adm-media-4.J | RT-K1 | Jini | 2 (move) | V-media-3.J, RT-K1-adm-media-1.J, RT-K1-adm-media-3.J, RT-K1-0.J, K5-media-1.J | B145 | 58 min |  |
| K5-theme-7.T | K5 | Tovu | 10 (delete + repoint) | K5-theme-7.J, K4-trash-2.T | B145 | 65 min | 282 |
| RT-K1-pub-mail-feedback-1.J | RT-K1 | Jini | 1 (move) | K5-mail-1.J, RT-K1-0.J | B146 | 38 min |  |
| V-post-5.J | V | Jini | 1 (move) | K5-post-2.J, K5-post-3.J, K5-post-1.J, T-post-1.J, K5-contracts-core-3.J, K5-post-4.J | B146 | 22 min |  |
| RT-K1-adm-media-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-media-4.J, RT-K1-0.T | B146 | 32 min | 277 |
| K4-asset-transfer-1.T | K4 | Tovu | 3 (delete + repoint) | K4-asset-transfer-1.J, K4-contracts-core-5.T, K4-seam-1.T | B146 | 22 min | 277 |
| K5-publish-content-5.J | K5 | Jini | 9 (move) | K5-contracts-core-2.J, K5-publish-content-1.J, K5-publish-content-3.J, K5-publish-content-4.J, K4-publish-content-2.J, K4-seam-5.J, K5-platform-routing-1.J, K5-publish-content-ui-1.J, P-publish-trust-1.J, V-post-5.J, K4-seam-7.J | B147 | 99 min |  |
| K5-plugin-runtime-3.J | K5 | Jini | 6 (move) | X-plugin-runtime-1.J, K4-contracts-headless-1.J, K5-contracts-headless-2.J, K5-plugin-runtime-1.J, K5-plugin-runtime-2.J, K5-contracts-core-3.J, K4-seam-3.J, K4-seam-1.J, K4-seam-7.J, K4-contracts-core-5.J, V-post-5.J | B147 | 64 min |  |
| K5-navigation-1.J | K5 | Jini | 8 (move) | K5-contracts-core-6.J, X-navigation-1.J, K5-platform-routing-1.J, K5-publish-content-3.J, K4-publish-content-2.J, K4-seam-5.J, V-post-5.J | B147 | 58 min |  |
| K5-consent-1.J | K5 | Jini | 13 (move) | K4-seam-15.J, K4-seam-5.J, K5-contracts-core-10.J, K5-contracts-core-4.J, K4-seam-1.J, K5-agent-plugins-4.J, V-post-5.J | B147 | 98 min |  |
| K5-media-import-1.T | K5 | Tovu | 3 (delete + repoint) | K5-media-import-1.J, K4-seam-2.T, K4-contracts-core-5.T, K4-seam-3.T | B147 | 36 min | 273 |
| RT-K1-pub-mail-feedback-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-mail-feedback-1.J, RT-K1-0.T | B147 | 20 min | 273 |
| K5-site-backup-3.J | K5 | Jini | 9 (move) | K5-site-backup-2.J, K5-site-backup-1.J, K4-seam-2.J, K4-seam-12.J, K5-contracts-core-2.J, V-agent-plugins-2.J, K4-seam-7.J, K5-publish-content-5.J, K5-publish-content-1.J | B148 | 101 min |  |
| RT-K1-pub-middleware-1.J | RT-K1 | Jini | 7 (move) | K4-seam-23.J, R-public-http-1.J, K5-theme-1.J, K5-theme-2.J, K5-webmcp-1.J, K5-contracts-core-3.J, K5-consent-1.J, K5-post-1.J, K4-seam-6.J, RT-K1-0.J | B148 | 96 min |  |
| K5-deployments-5.J | K5 | Jini | 6 (move) | K5-contracts-core-7.J, K5-contracts-core-2.J, K5-theme-1.J, K5-deployments-1.J, K5-form-destinations-1.J, K5-deployments-4.J, K5-deployments-2.J, K4-seam-3.J, K4-seam-6.J, K5-vendor-credentials-1.J, K4-seam-1.J, K5-custom-credentials-1.J, K5-consent-1.J, K5-contracts-headless-2.J, K4-seam-7.J | B148 | 101 min |  |
| RT-K1-adm-menus-1.J | RT-K1 | Jini | 4 (move) | K5-navigation-1.J, RT-K1-0.J, R-admin-http-1.J | B148 | 92 min |  |
| K5-consent-1.T | K5 | Tovu | 13 (delete + repoint) | K5-consent-1.J, K4-seam-15.T, K4-seam-5.T, K4-seam-1.T | B148 | 76 min | 251 |
| K5-publish-content-5.T | K5 | Tovu | 9 (delete + repoint) | K5-publish-content-5.J, K4-publish-content-2.T, K4-seam-5.T, K4-seam-7.T | B148 | 63 min | 251 |
| K5-site-inspection-1.J | K5 | Jini | 10 (move) | K4-seam-14.J, K5-platform-routing-1.J, K5-publish-content-4.J, K5-deployments-5.J | B149 | 95 min |  |
| K5-site-backup-4.J | K5 | Jini | 8 (move) | K5-site-backup-3.J, K5-site-backup-1.J, K5-agent-plugins-4.J, K5-site-backup-2.J, K5-theme-3.J, K4-seam-7.J, K5-source-control-1.J, V-media-3.J, K4-seam-16.J | B149 | 89 min |  |
| RT-K1-adm-menus-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-menus-1.J, RT-K1-0.T | B149 | 45 min | 225 |
| K5-plugin-runtime-3.T | K5 | Tovu | 6 (delete + repoint) | K5-plugin-runtime-3.J, K4-contracts-headless-1.T, K4-seam-3.T, K4-seam-1.T, K4-seam-7.T, K4-contracts-core-5.T | B149 | 46 min | 225 |
| RT-K1-pub-middleware-1.T | RT-K1 | Tovu | 7 (delete + repoint) | RT-K1-pub-middleware-1.J, K4-seam-23.T, K4-seam-6.T, RT-K1-0.T | B149 | 77 min | 225 |
| K5-site-backup-3.T | K5 | Tovu | 9 (delete + repoint) | K5-site-backup-3.J, K4-seam-2.T, K4-seam-12.T, K4-seam-7.T | B149 | 100 min | 225 |
| K5-site-backup-5.J | K5 | Jini | 3 (move) | K5-agent-plugins-4.J, X-agent-plugins-1.J, V-agent-plugins-2.J, K5-site-backup-4.J, K5-site-backup-3.J, V-media-3.J, K5-media-1.J, K5-site-backup-1.J, K5-site-backup-2.J, K5-contracts-core-2.J | B150 | 55 min |  |
| K5-seo-1.J | K5 | Jini | 4 (move) | K4-seam-5.J, K5-settings-3.J, V-post-5.J, V-media-3.J, V-members-3.J, K5-platform-routing-1.J, V-contracts-core-9.J, X-seo-1.J, K5-contracts-core-6.J, K5-contracts-core-4.J | B150 | 55 min |  |
| RT-K1-adm-menus-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-menus-1.J, RT-K1-0.J, K5-navigation-1.J, R-admin-http-1.J | B150 | 72 min |  |
| K5-navigation-1.T | K5 | Tovu | 8 (delete + repoint) | K5-navigation-1.J, K4-publish-content-2.T, K4-seam-5.T | B150 | 74 min | 199 |
| K5-site-backup-4.T | K5 | Tovu | 8 (delete + repoint) | K5-site-backup-4.J, K4-seam-7.T, K4-seam-16.T | B150 | 74 min | 199 |
| K5-site-inspection-1.T | K5 | Tovu | 10 (delete + repoint) | K5-site-inspection-1.J, K4-seam-14.T | B150 | 73 min | 199 |
| K5-web-1.J | K5 | Jini | 3 (move) | K4-seam-2.J, K5-contracts-core-6.J, K5-contracts-core-3.J, K5-site-inspection-1.J | B151 | 59 min |  |
| RT-K1-adm-publish-content-5.J | RT-K1 | Jini | 2 (move) | V-media-3.J, RT-K1-adm-publish-content-1.J, RT-K1-0.J, K5-publish-content-5.J, K5-publish-content-ui-1.J, K5-publish-content-4.J, K5-publish-trust-1.J, K5-publish-content-1.J, RT-K1-adm-publish-content-2.J | B151 | 81 min |  |
| RT-K1-adm-publish-content-4.J | RT-K1 | Jini | 3 (move) | K5-publish-content-4.J, RT-K1-adm-publish-content-1.J, RT-K1-adm-publish-content-2.J, RT-K1-0.J, K5-publish-content-1.J, K4-publish-content-2.J, K5-publish-trust-1.J, P-publish-trust-1.J, K5-publish-content-5.J | B151 | 92 min |  |
| RT-K1-adm-menus-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-menus-2.J, RT-K1-0.T | B151 | 34 min | 189 |
| K5-deployments-5.T | K5 | Tovu | 6 (delete + repoint) | K5-deployments-5.J, K4-seam-3.T, K4-seam-6.T, K4-seam-1.T, K4-seam-7.T | B151 | 64 min | 189 |
| K4-image-transform-1.T | K4 | Tovu | 1 (delete + repoint) | K4-image-transform-1.J, K4-contracts-core-5.T, K4-asset-transfer-1.T, K4-seam-1.T | B151 | 17 min | 189 |
| RT-K1-pub-http-1.J | RT-K1 | Jini | 2 (move) | K5-post-1.J, K5-contracts-headless-2.J, V-post-5.J | B152 | 25 min |  |
| K5-deployments-6.J | K5 | Jini | 2 (move) | K5-deployments-5.J, K5-contracts-core-10.J, K5-deployments-2.J, K5-deployments-1.J, K4-seam-1.J | B152 | 56 min |  |
| RT-K1-adm-seo-2.J | RT-K1 | Jini | 2 (move) | K5-seo-1.J, RT-K1-adm-seo-1.J, RT-K1-0.J | B152 | 53 min |  |
| RT-K1-adm-publish-content-4.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-publish-content-4.J, RT-K1-0.T, K4-publish-content-2.T | B152 | 42 min | 179 |
| K5-seo-1.T | K5 | Tovu | 4 (delete + repoint) | K5-seo-1.J, K4-seam-5.T | B152 | 54 min | 179 |
| K5-site-backup-5.T | K5 | Tovu | 3 (delete + repoint) | K5-site-backup-5.J | B152 | 38 min | 179 |
| RT-K1-adm-posts-1.J | RT-K1 | Jini | 5 (move) | V-post-5.J, K5-contracts-headless-2.J, RT-K1-pub-http-1.J, RT-K1-adm-content-1.J, RT-K1-0.J, V-contracts-core-9.J, RT-K1-adm-plugin-hook-error-1.J | B153 | 98 min |  |
| RT-K1-adm-publish-content-5.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-publish-content-5.J, RT-K1-0.T | B153 | 41 min | 168 |
| RT-K1-adm-seo-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-seo-2.J, RT-K1-0.T | B153 | 26 min | 168 |
| K5-deployments-6.T | K5 | Tovu | 2 (delete + repoint) | K5-deployments-6.J, K4-seam-1.T | B153 | 33 min | 168 |
| RT-K1-pub-http-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-http-1.J | B153 | 26 min | 168 |
| K5-web-1.T | K5 | Tovu | 3 (delete + repoint) | K5-web-1.J, K4-seam-2.T | B153 | 40 min | 168 |
| K5-site-backup-6.J | K5 | Jini | 2 (move) | K5-site-backup-1.J, K5-site-backup-4.J, V-post-5.J, V-media-3.J, K4-seam-5.J, K5-site-backup-3.J, K4-seam-7.J | B154 | 94 min |  |
| K5-publish-content-6.J | K5 | Jini | 2 (move) | K5-publish-content-5.J, K5-publish-content-1.J, K5-contracts-core-10.J, K5-publish-content-4.J, K5-publish-content-3.J, K5-contracts-core-2.J, K5-publish-trust-1.J, P-publish-trust-1.J, V-post-5.J, K4-publish-content-2.J, K4-seam-1.J, K4-seam-5.J | B154 | 38 min |  |
| K5-deployments-7.J | K5 | Jini | 1 (move) | K5-deployments-5.J, K5-deployments-1.J, X-vendor-credentials-1.J, K5-contracts-core-2.J, K5-custom-credentials-1.J, K5-contracts-core-10.J, K5-deployments-6.J, K5-contracts-headless-2.J, K5-contracts-core-7.J, K5-contracts-core-1.J, K5-deployments-4.J, K5-vendor-credentials-1.J, K4-seam-7.J, K4-seam-5.J, K4-seam-13.J, K4-seam-1.J | B154 | 80 min |  |
| RT-K1-adm-pages-1.J | RT-K1 | Jini | 4 (move) | V-contracts-core-9.J, V-post-5.J, RT-K1-adm-posts-1.J, RT-K1-adm-plugin-hook-error-1.J, RT-K1-adm-content-1.J, RT-K1-0.J, K5-agent-plugins-6.J | B154 | 94 min |  |
| RT-K1-adm-posts-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-posts-1.J, RT-K1-0.T | B154 | 46 min | 163 |
| K5-site-inspection-2.J | K5 | Jini | 2 (move) | K5-contracts-core-6.J, K5-site-inspection-1.J, K4-seam-2.J | B155 | 33 min |  |
| K5-site-backup-7.J | K5 | Jini | 5 (move) | K5-site-backup-1.J, K5-site-backup-6.J, K5-site-backup-4.J, K5-site-backup-3.J, K5-site-backup-2.J, K4-seam-16.J, K5-agent-plugins-4.J, K5-agent-plugins-8.J, K5-site-backup-5.J, K4-seam-7.J, K4-seam-5.J, K4-seam-3.J, K4-seam-2.J, K4-seam-12.J | B155 | 98 min |  |
| RT-K1-adm-consent-1.J | RT-K1 | Jini | 1 (move) | K5-consent-1.J, RT-K1-0.J | B155 | 49 min |  |
| RT-K1-adm-pages-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-pages-1.J, RT-K1-0.T | B155 | 37 min | 155 |
| K5-publish-content-6.T | K5 | Tovu | 2 (delete + repoint) | K5-publish-content-6.J, K4-publish-content-2.T, K4-seam-1.T, K4-seam-5.T | B155 | 26 min | 155 |
| K5-site-backup-6.T | K5 | Tovu | 2 (delete + repoint) | K5-site-backup-6.J, K4-seam-5.T, K4-seam-7.T | B155 | 55 min | 155 |
| K5-site-backup-8.J | K5 | Jini | 2 (move) | K5-site-backup-2.J, K5-site-backup-3.J, K5-site-backup-1.J, K5-custom-credentials-3.J, K5-custom-credentials-2.J, K5-webhooks-4.J, K5-source-control-1.J, K5-source-control-2.J, K5-source-control-3.J, K5-site-backup-7.J, K5-site-backup-4.J, K4-seam-7.J, K4-seam-2.J, K4-seam-1.J | B156 | 96 min |  |
| RT-K1-adm-system-11.J | RT-K1 | Jini | 2 (move) | K5-site-backup-7.J, K5-site-backup-1.J, K4-seam-3.J, RT-K1-0.J, K5-deployments-4.J, K5-deployments-5.J | B156 | 97 min |  |
| RT-K1-adm-owner-mfa-routes-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-3.J, RT-K1-pub-middleware-1.J, RT-K1-adm-owner-mfa-deps-1.J, RT-K1-0.J | B156 | 54 min |  |
| RT-K1-adm-consent-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-consent-1.J, RT-K1-0.T | B156 | 26 min | 147 |
| K5-site-backup-7.T | K5 | Tovu | 5 (delete + repoint) | K5-site-backup-7.J, K4-seam-16.T, K4-seam-7.T, K4-seam-5.T, K4-seam-3.T, K4-seam-2.T, K4-seam-12.T | B156 | 72 min | 147 |
| K5-site-inspection-2.T | K5 | Tovu | 2 (delete + repoint) | K5-site-inspection-2.J, K4-seam-2.T | B156 | 26 min | 147 |
| RT-K1-adm-system-15.J | RT-K1 | Jini | 2 (move) | K5-site-backup-7.J, K5-site-backup-1.J, K5-site-backup-3.J, RT-K1-0.J, K5-custom-credentials-3.J, K5-site-backup-8.J | B157 | 88 min |  |
| RT-K1-adm-owner-recovery-routes-1.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-owner-mfa-deps-1.J, RT-K1-pub-middleware-1.J, RT-K1-adm-users-1.J, K5-contracts-core-3.J, RT-K1-0.J | B157 | 54 min |  |
| RT-K1-adm-owner-mfa-routes-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-owner-mfa-routes-1.J, RT-K1-0.T | B157 | 30 min | 141 |
| RT-K1-adm-system-11.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-11.J, K4-seam-3.T, RT-K1-0.T | B157 | 47 min | 141 |
| V-post-5.T | V | Tovu | 1 (delete + repoint) | V-post-5.J | B157 | 120 min | 141 |
| K5-site-backup-8.T | K5 | Tovu | 2 (delete + repoint) | K5-site-backup-8.J, K4-seam-7.T, K4-seam-2.T, K4-seam-1.T | B157 | 58 min | 141 |
| RT-K1-adm-site-1.J | RT-K1 | Jini | 1 (move) | K5-site-inspection-2.J, RT-K1-0.J | B158 | 40 min |  |
| RT-K1-adm-publish-content-6.J | RT-K1 | Jini | 1 (move) | K5-publish-content-3.J, K5-publish-content-4.J, K4-publish-content-2.J, K5-publish-content-1.J, K5-publish-content-5.J, V-media-3.J, RT-K1-adm-publish-content-1.J, RT-K1-adm-publish-content-2.J, RT-K1-adm-publish-content-5.J, RT-K1-0.J | B158 | 66 min |  |
| RT-K1-adm-owner-recovery-routes-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-owner-recovery-routes-1.J, RT-K1-0.T | B158 | 30 min | 137 |
| RT-K1-adm-system-15.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-15.J, RT-K1-0.T | B158 | 47 min | 137 |
| K5-deployments-7.T | K5 | Tovu | 1 (delete + repoint) | K5-deployments-7.J, K4-seam-7.T, K4-seam-5.T, K4-seam-13.T, K4-seam-1.T | B158 | 43 min | 137 |
| RT-K1-adm-system-13.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-system-11.J, K5-site-backup-3.J, K5-site-backup-1.J, K5-site-backup-2.J, RT-K1-0.J | B159 | 102 min |  |
| RT-K1-adm-system-12.J | RT-K1 | Jini | 1 (move) | K5-publish-content-4.J, K5-deployments-5.J, K5-deployments-1.J, RT-K1-0.J | B159 | 69 min |  |
| RT-K1-adm-publish-content-6.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-publish-content-6.J, K4-publish-content-2.T, RT-K1-0.T | B159 | 40 min | 135 |
| RT-K1-adm-site-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-site-1.J, RT-K1-0.T | B159 | 21 min | 135 |
| RT-K1-pub-middleware-2.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-2.J, K5-contracts-core-3.J, K5-contracts-headless-2.J, K5-theme-4.J, K5-consent-1.J, RT-K1-pub-site-1.J, RT-K1-pub-middleware-1.J, K4-seam-6.J, RT-K1-0.J | B160 | 112 min |  |
| K5-permanent-delete-1.J | K5 | Jini | 1 (move) | K5-contracts-core-10.J, K4-contracts-core-5.J, X-permanent-delete-1.J, K5-deployments-7.J, K4-seam-10.J | B160 | 32 min |  |
| RT-K1-adm-system-12.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-12.J, RT-K1-0.T | B160 | 35 min | 134 |
| RT-K1-pub-publish-trust-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-2.J, K5-contracts-core-3.J, K5-publish-trust-1.J, P-publish-trust-1.J, K5-webhooks-4.J, K4-seam-1.J | B161 | 66 min |  |
| RT-K1-pub-ops-1.J | RT-K1 | Jini | 1 (move) | K4-seam-23.J | B161 | 57 min |  |
| RT-K1-adm-system-13.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-13.J, RT-K1-0.T | B161 | 65 min | 131 |
| K5-permanent-delete-1.T | K5 | Tovu | 1 (delete + repoint) | K5-permanent-delete-1.J, K4-contracts-core-5.T, K4-seam-10.T | B161 | 22 min | 131 |
| RT-K1-pub-middleware-2.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-middleware-2.J, K4-seam-6.T, RT-K1-0.T | B161 | 60 min | 131 |
| RT-K1-pub-site-share-1.J | RT-K1 | Jini | 1 (move) | K5-site-backup-3.J, K5-site-backup-2.J | B162 | 49 min |  |
| RT-K1-pub-site-seo-render-context-1.J | RT-K1 | Jini | 1 (move) | K5-seo-1.J | B162 | 22 min |  |
| RT-K1-pub-ops-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-ops-1.J, K4-seam-23.T | B162 | 31 min | 130 |
| RT-K1-pub-visitor-analytics-1.J | RT-K1 | Jini | 1 (move) | K5-analytics-1.J, K4-seam-6.J | B163 | 26 min |  |
| RT-K1-pub-site-worker-sandbox-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-render-context-1.J, K4-seam-23.J | B163 | 36 min |  |
| RT-K1-pub-publish-trust-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-publish-trust-1.J, K4-seam-1.T | B163 | 32 min | 127 |
| RT-K1-pub-site-seo-render-context-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-seo-render-context-1.J | B163 | 22 min | 127 |
| RT-K1-pub-site-share-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-share-1.J | B163 | 30 min | 127 |
| RT-K1-pub-site-3.J | RT-K1 | Jini | 3 (move) | RT-K1-pub-visitor-analytics-1.J, K5-platform-mail-2.J, K5-newsletter-1.J, K5-newsletter-2.J, K4-seam-1.J, C-platform-html-1.J, RT-K1-0.J | B164 | 96 min |  |
| RT-K1-pub-site-2.J | RT-K1 | Jini | 4 (move) | RT-K1-pub-visitor-analytics-1.J, K5-analytics-1.J, K4-seam-16.J, K5-contracts-core-2.J, K5-contracts-core-3.J, K4-seam-8.J, RT-K1-0.J, X-seo-1.J, K5-post-3.J, K5-platform-routing-1.J, RT-K1-pub-site-1.J | B164 | 90 min |  |
| RT-K1-pub-site-worker-sandbox-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-worker-sandbox-1.J, K4-seam-23.T | B164 | 29 min | 125 |
| RT-K1-pub-visitor-analytics-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-visitor-analytics-1.J, K4-seam-6.T | B164 | 32 min | 125 |
| RT-K1-pub-site-handlebars-sandbox-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-worker-sandbox-1.J | B165 | 23 min |  |
| RT-K1-pub-members-1.J | RT-K1 | Jini | 5 (move) | V-members-3.J, RT-K1-pub-visitor-analytics-1.J, K5-contracts-core-3.J, K5-platform-mail-2.J, RT-K1-pub-site-2.J, K4-seam-5.J, RT-K1-0.J | B165 | 96 min |  |
| RT-K1-pub-site-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-pub-site-2.J, K4-seam-16.T, K4-seam-8.T, RT-K1-0.T | B165 | 47 min | 118 |
| RT-K1-pub-site-3.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-pub-site-3.J, K4-seam-1.T, RT-K1-0.T | B165 | 54 min | 118 |
| RT-K1-pub-site-6.J | RT-K1 | Jini | 4 (move) | RT-K1-pub-site-1.J, RT-K1-pub-visitor-analytics-1.J, K5-platform-routing-1.J, K5-forms-1.J, K5-contracts-core-3.J, R-public-http-1.J, RT-K1-0.J, RT-K1-pub-members-1.J, K4-seam-15.J, K4-seam-23.J, RT-K1-pub-site-seo-render-context-1.J, K5-settings-3.J, RT-K1-adm-seo-1.J | B166 | 99 min |  |
| RT-K1-pub-members-2.J | RT-K1 | Jini | 3 (move) | V-members-3.J, RT-K1-pub-members-1.J, RT-K1-0.J, RT-K1-pub-visitor-analytics-1.J, K5-platform-mail-2.J | B166 | 90 min |  |
| RT-K1-pub-members-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-pub-members-1.J, K4-seam-5.T, RT-K1-0.T | B166 | 80 min | 112 |
| RT-K1-pub-site-handlebars-sandbox-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-handlebars-sandbox-1.J | B166 | 22 min | 112 |
| RT-K1-pub-site-4.J | RT-K1 | Jini | 2 (move) | V-members-3.J, RT-K1-0.J, K5-publish-content-1.J, K5-post-1.J, K5-members-1.J, RT-K1-adm-media-1.J, RT-K1-pub-members-1.J | B167 | 87 min |  |
| RT-K1-pub-members-3.J | RT-K1 | Jini | 3 (move) | RT-K1-pub-members-1.J, RT-K1-0.J, V-members-3.J, RT-K1-pub-members-2.J, K5-member-login-1.J | B167 | 82 min |  |
| RT-K1-pub-members-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-pub-members-2.J, RT-K1-0.T | B167 | 45 min | 105 |
| RT-K1-pub-site-6.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-pub-site-6.J, RT-K1-0.T, K4-seam-15.T, K4-seam-23.T | B167 | 41 min | 105 |
| RT-K1-pub-site-5.J | RT-K1 | Jini | 4 (move) | K5-post-3.J, K5-members-1.J, V-members-3.J, RT-K1-pub-members-1.J, RT-K1-0.J, K5-theme-1.J, K5-theme-3.J, K5-platform-routing-1.J, RT-K1-pub-site-4.J, RT-K1-pub-site-site-chat-markup-1.J, K5-widgets-1.J, K5-post-1.J, RT-K1-pub-site-1.J, K5-plugin-runtime-1.J, R-public-http-1.J | B168 | 102 min |  |
| RT-K1-pub-members-4.J | RT-K1 | Jini | 2 (move) | V-members-3.J, RT-K1-pub-members-1.J, RT-K1-pub-members-3.J, RT-K1-pub-visitor-analytics-1.J, K5-member-login-1.J, K5-contracts-core-3.J | B168 | 75 min |  |
| RT-K1-pub-members-3.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-pub-members-3.J, RT-K1-0.T | B168 | 51 min | 100 |
| RT-K1-pub-site-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-site-4.J, RT-K1-0.T | B168 | 43 min | 100 |
| RT-K1-pub-members-5.J | RT-K1 | Jini | 2 (move) | RT-K1-pub-members-1.J, RT-K1-pub-visitor-analytics-1.J, K5-member-login-1.J, RT-K1-pub-members-3.J, V-members-3.J, K5-contracts-core-3.J | B169 | 85 min |  |
| RT-K1-pub-commerce-1.J | RT-K1 | Jini | 1 (move) | C-platform-html-1.J, K5-members-1.J, K5-contracts-core-3.J, RT-K1-pub-members-3.J, RT-K1-pub-site-2.J, RT-K1-0.J | B169 | 73 min |  |
| RT-K1-pub-members-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-members-4.J | B169 | 41 min | 94 |
| RT-K1-pub-site-5.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-pub-site-5.J, RT-K1-0.T | B169 | 63 min | 94 |
| RT-K1-pub-members-6.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-members-1.J, K5-member-login-1.J, K5-contracts-core-3.J, RT-K1-pub-members-4.J, RT-K1-pub-members-3.J | B170 | 47 min |  |
| RT-K1-pub-content-1.J | RT-K1 | Jini | 1 (move) | K5-post-1.J, K5-members-1.J, V-members-3.J, RT-K1-pub-http-1.J, RT-K1-pub-members-1.J, RT-K1-0.J | B170 | 44 min |  |
| RT-K1-pub-commerce-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-commerce-1.J, RT-K1-0.T | B170 | 42 min | 91 |
| RT-K1-pub-members-5.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-members-5.J | B170 | 45 min | 91 |
| RT-K1-pub-site-liquid-sandbox-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-worker-sandbox-1.J | B171 | 22 min |  |
| RT-K1-pub-plugin-contributions-1.J | RT-K1 | Jini | 1 (move) | K5-members-1.J, RT-K1-pub-members-1.J, K4-seam-10.J, RT-K1-0.J | B171 | 58 min |  |
| RT-K1-pub-content-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-content-1.J, RT-K1-0.T | B171 | 24 min | 89 |
| RT-K1-pub-members-6.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-members-6.J | B171 | 27 min | 89 |
| V-theme-6.J | V | Jini | 1 (move) | K5-theme-4.J, K5-theme-3.J, K5-theme-1.J, K5-theme-5.J, K5-theme-2.J, T-theme-1.J | B172 | 23 min |  |
| RT-K1-pub-plugin-contributions-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-plugin-contributions-1.J, K4-seam-10.T, RT-K1-0.T | B172 | 33 min | 87 |
| RT-K1-pub-site-liquid-sandbox-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-liquid-sandbox-1.J | B172 | 21 min | 87 |
| K5-site-export-1.J | K5 | Jini | 5 (move) | C-platform-html-1.J, K5-contracts-core-2.J, K5-theme-1.J, X-media-1.J, V-media-3.J, K4-seam-13.J, V-post-5.J, V-theme-6.J, K5-platform-routing-1.J, K5-presentation-1.J, K4-seam-21.J | B173 | 99 min |  |
| K5-post-6.J | K5 | Jini | 11 (move) | K5-presentation-1.J, V-theme-6.J, K5-post-3.J, K5-post-1.J, T-post-1.J, K5-post-2.J, K5-post-4.J, K4-seam-9.J, K5-site-inspection-1.J, K5-contracts-core-3.J, K5-platform-routing-1.J, K5-contracts-core-6.J, V-contracts-core-9.J, X-content-duplication-1.J, K4-seam-10.J, K5-contracts-core-2.J, K4-seam-1.J | B173 | 89 min |  |
| K5-pages-1.J | K5 | Jini | 8 (move) | K5-contracts-core-2.J, X-identity-1.J, K5-agent-plugins-6.J, K5-contracts-core-1.J, V-post-5.J, K5-contracts-core-3.J, K5-post-3.J, K4-contracts-core-5.J, X-pages-1.J, V-theme-6.J, C-platform-html-1.J | B173 | 91 min |  |
| V-theme-6.T | V | Tovu | 1 (delete + repoint) | V-theme-6.J | B173 | 111 min | 86 |
| K5-site-export-2.J | K5 | Jini | 3 (move) | K5-theme-3.J, K5-theme-4.J, K5-site-export-1.J, K5-contracts-core-2.J, K4-contracts-headless-1.J | B174 | 62 min |  |
| RT-K1-pub-site-render-2.J | RT-K1 | Jini | 6 (move) | RT-K1-pub-site-render-1.J, C-platform-html-1.J, R-public-http-1.J, RT-K1-pub-site-render-context-1.J, K5-theme-1.J, V-theme-6.J, RT-K1-pub-site-site-chat-markup-1.J, T-theme-1.J, K5-post-3.J, X-media-1.J | B174 | 60 min |  |
| K5-email-templates-1.J | K5 | Jini | 4 (move) | K5-pages-1.J, K5-contracts-core-3.J, V-post-5.J, K5-contracts-core-4.J | B174 | 67 min |  |
| RT-K1-adm-pages-2.J | RT-K1 | Jini | 2 (move) | V-contracts-core-9.J, V-post-5.J, RT-K1-adm-posts-1.J, RT-K1-adm-plugin-hook-error-1.J, RT-K1-adm-content-1.J, RT-K1-0.J, K5-agent-plugins-6.J, K5-pages-1.J, R-admin-http-1.J | B174 | 66 min |  |
| K5-post-6.T | K5 | Tovu | 11 (delete + repoint) | K5-post-6.J, K4-seam-9.T, K4-seam-10.T, K4-seam-1.T | B174 | 81 min | 70 |
| K5-site-export-1.T | K5 | Tovu | 5 (delete + repoint) | K5-site-export-1.J, K4-seam-13.T, K4-seam-21.T | B174 | 59 min | 70 |
| RT-K1-pub-site-7.J | RT-K1 | Jini | 5 (move) | RT-K1-pub-site-seo-render-context-1.J, RT-K1-pub-site-4.J, R-public-http-1.J, RT-K1-pub-site-1.J, RT-K1-0.J, RT-K1-adm-seo-1.J, K5-widgets-1.J, K5-post-1.J, RT-K1-pub-site-render-2.J, K5-post-3.J, V-theme-6.J, X-media-1.J, RT-K1-pub-site-render-context-1.J | B175 | 80 min |  |
| RT-K1-adm-widgets-4.J | RT-K1 | Jini | 4 (move) | K5-widgets-1.J, RT-K1-adm-widgets-1.J, RT-K1-0.J, V-theme-6.J, K5-theme-2.J, RT-K1-pub-site-render-2.J | B175 | 93 min |  |
| K5-pages-1.T | K5 | Tovu | 8 (delete + repoint) | K5-pages-1.J, K4-contracts-core-5.T | B175 | 82 min | 59 |
| K5-site-export-2.T | K5 | Tovu | 3 (delete + repoint) | K5-site-export-2.J, K4-contracts-headless-1.T | B175 | 48 min | 59 |
| RT-K1-pub-site-render-3.J | RT-K1 | Jini | 2 (move) | RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-render-1.J, RT-K1-pub-site-render-2.J, C-platform-html-1.J, R-public-http-1.J, V-theme-6.J | B176 | 25 min |  |
| RT-K1-pub-site-8.J | RT-K1 | Jini | 5 (move) | K5-post-3.J, K5-post-1.J, V-members-3.J, K5-theme-2.J, K5-theme-1.J, K5-platform-routing-1.J, RT-K1-pub-site-render-2.J, RT-K1-pub-site-4.J, RT-K1-pub-site-1.J, R-public-http-1.J, RT-K1-pub-site-2.J, RT-K1-pub-site-5.J, RT-K1-pub-site-7.J, RT-K1-0.J, T-theme-1.J, X-content-types-1.J, K5-entries-1.J, RT-K1-pub-site-site-chat-markup-1.J, K5-widgets-1.J, V-theme-6.J, K5-theme-3.J, RT-K1-pub-site-render-1.J, K5-theme-4.J, K5-comments-1.J | B176 | 97 min |  |
| RT-K1-adm-pages-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-pages-2.J, RT-K1-0.T | B176 | 30 min | 47 |
| K5-email-templates-1.T | K5 | Tovu | 4 (delete + repoint) | K5-email-templates-1.J | B176 | 43 min | 47 |
| RT-K1-pub-site-render-2.T | RT-K1 | Tovu | 6 (delete + repoint) | RT-K1-pub-site-render-2.J | B176 | 106 min | 47 |
| RT-K1-adm-themes-1.J | RT-K1 | Jini | 1 (move) | T-theme-1.J, V-theme-6.J, V-post-5.J, RT-K1-adm-content-1.J, RT-K1-0.J | B177 | 108 min |  |
| RT-K1-adm-email-templates-1.J | RT-K1 | Jini | 1 (move) | K5-email-templates-1.J, K5-pages-1.J, R-admin-http-1.J, RT-K1-adm-content-1.J, RT-K1-0.J | B177 | 72 min |  |
| RT-K1-pub-site-7.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-pub-site-7.J, RT-K1-0.T | B177 | 50 min | 40 |
| RT-K1-pub-site-render-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-site-render-3.J | B177 | 28 min | 40 |
| RT-K1-pub-site-bare-page-1.J | RT-K1 | Jini | 1 (move) | V-post-5.J, RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-render-2.J | B178 | 23 min |  |
| RT-K1-adm-themes-2.J | RT-K1 | Jini | 3 (move) | V-theme-6.J, RT-K1-adm-content-1.J, RT-K1-0.J, K5-contracts-core-2.J, K5-theme-2.J, RT-K1-adm-sites-1.J, T-theme-1.J, RT-K1-adm-themes-1.J | B178 | 86 min |  |
| RT-K1-adm-email-templates-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-email-templates-1.J, RT-K1-0.T | B178 | 42 min | 30 |
| RT-K1-adm-widgets-4.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-widgets-4.J, RT-K1-0.T | B178 | 41 min | 30 |
| RT-K1-pub-site-8.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-pub-site-8.J, RT-K1-0.T | B178 | 62 min | 30 |
| RT-K1-adm-presentation-1.J | RT-K1 | Jini | 4 (move) | K5-presentation-1.J, K5-contracts-headless-2.J, T-theme-1.J, V-theme-6.J, RT-K1-adm-content-1.J, RT-K1-0.J, K5-theme-2.J, RT-K1-adm-themes-2.J | B179 | 82 min |  |
| RT-K1-adm-posts-2.J | RT-K1 | Jini | 4 (move) | V-post-5.J, RT-K1-adm-posts-1.J, RT-K1-adm-content-1.J, RT-K1-0.J, V-contracts-core-9.J, RT-K1-adm-plugin-hook-error-1.J, V-members-3.J, K5-presentation-1.J, K5-platform-routing-1.J, V-theme-6.J, K5-theme-4.J, RT-K1-pub-site-8.J, RT-K1-pub-site-7.J, RT-K1-pub-site-5.J, RT-K1-pub-site-bare-page-1.J, K5-settings-3.J | B179 | 94 min |  |
| RT-K1-adm-themes-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-themes-2.J, RT-K1-0.T | B179 | 37 min | 26 |
| RT-K1-pub-site-bare-page-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-bare-page-1.J | B179 | 21 min | 26 |
| RT-K1-pub-site-liquid-render-1.J | RT-K1 | Jini | 1 (move) | T-theme-1.J, RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-render-3.J, RT-K1-pub-site-render-2.J, RT-K1-pub-site-liquid-sandbox-1.J | B180 | 23 min |  |
| RT-K1-pub-site-handlebars-render-1.J | RT-K1 | Jini | 1 (move) | T-theme-1.J, RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-render-3.J, RT-K1-pub-site-render-2.J, RT-K1-pub-site-handlebars-sandbox-1.J | B180 | 23 min |  |
| RT-K1-adm-posts-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-posts-2.J, RT-K1-0.T | B180 | 45 min | 22 |
| RT-K1-pub-site-liquid-worker-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-liquid-render-1.J | B181 | 22 min |  |
| RT-K1-pub-site-handlebars-worker-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-handlebars-render-1.J | B181 | 22 min |  |
| RT-K1-adm-presentation-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-presentation-1.J, RT-K1-0.T | B181 | 40 min | 17 |
| RT-K1-pub-site-handlebars-render-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-handlebars-render-1.J | B181 | 21 min | 17 |
| RT-K1-pub-site-render-site-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-site-chat-markup-1.J, K5-post-3.J, V-theme-6.J, K5-theme-1.J, K5-theme-2.J, C-platform-html-1.J, RT-K1-pub-site-render-1.J, RT-K1-pub-site-render-2.J, RT-K1-pub-site-render-3.J, RT-K1-pub-site-liquid-sandbox-1.J, RT-K1-pub-site-handlebars-sandbox-1.J, K4-seam-6.J | B182 | 31 min |  |
| RT-K1-adm-themes-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-themes-1.J, RT-K1-0.T | B182 | 68 min | 14 |
| RT-K1-pub-site-handlebars-worker-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-handlebars-worker-1.J | B182 | 20 min | 14 |
| RT-K1-pub-site-liquid-render-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-liquid-render-1.J | B182 | 21 min | 14 |
| RT-K1-pub-site-9.J | RT-K1 | Jini | 3 (move) | RT-K1-pub-site-1.J, RT-K1-pub-middleware-1.J, K5-theme-4.J, RT-K1-pub-site-render-site-1.J, RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-5.J, RT-K1-0.J, K5-comments-1.J, RT-K1-pub-site-site-chat-markup-1.J, K5-post-3.J, V-members-3.J, K5-theme-3.J, K5-platform-routing-1.J, RT-K1-pub-site-bare-page-1.J, RT-K1-pub-site-2.J, RT-K1-pub-site-7.J, RT-K1-pub-site-8.J | B183 | 95 min |  |
| RT-K1-pub-middleware-3.J | RT-K1 | Jini | 4 (move) | T-theme-1.J, K5-theme-4.J, RT-K1-0.J, K5-theme-3.J, RT-K1-pub-middleware-1.J, R-public-http-1.J, V-theme-6.J, V-post-5.J, RT-K1-adm-themes-1.J, RT-K1-pub-site-render-site-1.J, RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-7.J, RT-K1-pub-site-5.J, RT-K1-pub-site-1.J | B183 | 98 min |  |
| RT-K1-pub-site-liquid-worker-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-liquid-worker-1.J | B183 | 20 min | 12 |
| RT-K1-pub-site-render-site-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-render-site-1.J, K4-seam-6.T | B183 | 35 min | 12 |
| RT-K1-pub-site-10.J | RT-K1 | Jini | 3 (move) | K5-members-1.J, K5-post-1.J, RT-K1-pub-members-1.J, RT-K1-pub-site-9.J, RT-K1-0.J, RT-K1-pub-site-site-chat-markup-1.J, K5-post-3.J, V-members-3.J, RT-K1-pub-middleware-1.J, K5-theme-4.J, K5-theme-3.J, RT-K1-pub-site-render-site-1.J, RT-K1-pub-site-4.J, RT-K1-pub-site-1.J, RT-K1-pub-site-7.J, RT-K1-pub-site-5.J, RT-K1-pub-site-2.J, RT-K1-pub-site-8.J, RT-K1-pub-visitor-analytics-1.J | B184 | 101 min |  |
| RT-K1-pub-middleware-3.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-pub-middleware-3.J, RT-K1-0.T | B184 | 52 min | 5 |
| RT-K1-pub-site-9.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-pub-site-9.J, RT-K1-0.T | B184 | 47 min | 5 |
| RT-K1-pub-site-11.J | RT-K1 | Jini | 2 (move) | K5-post-1.J, K5-members-1.J, RT-K1-pub-middleware-1.J, K5-theme-4.J, K5-theme-3.J, K5-platform-routing-1.J, RT-K1-pub-site-1.J, RT-K1-pub-site-7.J, RT-K1-pub-site-5.J, RT-K1-pub-site-8.J, RT-K1-pub-site-9.J, RT-K1-pub-site-10.J, RT-K1-0.J | B185 | 66 min |  |
| RT-K1-pub-site-10.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-pub-site-10.J, RT-K1-0.T | B185 | 42 min | 2 |
| RT-K1-pub-site-11.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-site-11.J, RT-K1-0.T | B186 | 41 min | 0 |
