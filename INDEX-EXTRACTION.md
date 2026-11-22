EXTRACTION PLAN PARTIAL: SEC-1…n still wait for the SEC-0 parity report; apps/site-chat (26 files) is not measured; 3 owner decisions hold 4 files and 2 Jini retirements (SH-3 test block, C-contracts-core-1's guard regex, the RT-1/RT-2 next-major freeze). Every one of the 2,446 Jini-bound files has a step.

# INDEX — P9 / P9K Tovu → Jini extraction

**FILES LEFT: 2,486 (re-measure, old rules) → 2,446 after the Codex/K STAYS reclassification → 0 after batch B180 (6-wide, ≈ 278 h wall; 136 batches at 12-wide).**

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
| B10 | 2,344 | 17 |
| B20 | 2,096 | 33 |
| B30 | 1,869 | 50 |
| B40 | 1,732 | 66 |
| B50 | 1,576 | 83 |
| B60 | 1,436 | 97 |
| B80 | 1,143 | 130 |
| B100 | 869 | 160 |
| B120 | 445 | 194 |
| B140 | 193 | 225 |
| B160 | 105 | 251 |
| B180 | 0 | 278 |

## Steps

One row per J (Jini) or T (Tovu) item, in batch order. **files** = files moved (J) or deleted and repointed (T). **Files left after** counts down on Tovu items that delete files. Lanes: RT-K1 routes, A-K2 admin screens on the injected kit, K5 injection (K3 copy args ride inside these), K4 seam splits, V verbatim, XC/S/SEC/SH hand lanes, `P9 (…)` = still-valid P9 sheets. Not batched: RT-1, RT-2 (BLOCKED, next-major freeze), SEC-1…n and SEC-T1 (after SEC-0), S7b (after X-media-1), RN-J1…J4 / RN-T1 (last slot of a night). LOCK (Tovu manifest gains `@jini-ai/admin`): A-K2-shell-lib-1.T, K5-publish-content-ui-1.T. No step needs a Jini publish first (linked combines).

| step id | lane | repo | files | depends on | batch | est | files left after |
|---|---|---|---|---|---|---|---|
| T-post-1.J | P9 (T) | Jini | 7 (move) | C-platform-html-1.J | done (tonight) | 60 min |  |
| C-platform-html-1.J | P9 (C) | Jini | 3 (move) | — | done (tonight) | 60 min |  |
| K4-i18n-common.J | K4 | Jini | — | — | B1 | 80 min |  |
| A-K2-0a.J | A-K2 | Jini | — | — | B1 | 110 min |  |
| RT-K1-0.J | RT-K1 | Jini | — | — | B1 | 100 min |  |
| SH-3 | SH | Tovu | — | — | B1 | 45 min | 2,436 |
| SEC-0 | SEC | Tovu | — | — | B1 | 90 min |  |
| T-post-1.T | P9 (T) | Tovu | 7 (delete + repoint) | T-post-1.J | B1 | 60 min | 2,436 |
| K4-seam-2.J | K4 | Jini | — | — | B2 | 104 min |  |
| K4-seam-1.J | K4 | Jini | — | — | B2 | 81 min |  |
| A-K2-0b.J | A-K2 | Jini | — | A-K2-0a.J | B2 | 110 min |  |
| RT-K1-0.T | RT-K1 | Tovu | — | RT-K1-0.J | B2 | 90 min |  |
| K4-i18n-common.T | K4 | Tovu | — | K4-i18n-common.J | B2 | 60 min |  |
| C-platform-html-1.T | P9 (C) | Tovu | 3 (delete + repoint) | C-platform-html-1.J | B2 | 60 min | 2,433 |
| A-adm-other-1.J | P9 (A) | Jini | 14 (move) | — | B3 | 60 min |  |
| K4-contracts-core-5.J | K4 | Jini | 16 (move) | K4-seam-1.J | B3 | 92 min |  |
| K4-seam-3.J | K4 | Jini | — | — | B3 | 23 min |  |
| A-K2-0.J | A-K2 | Jini | — | A-K2-0b.J | B3 | 110 min |  |
| K4-seam-1.T | K4 | Tovu | — | K4-seam-1.J | B3 | 65 min |  |
| K4-seam-2.T | K4 | Tovu | — | K4-seam-2.J | B3 | 83 min |  |
| K4-seam-5.J | K4 | Jini | — | — | B4 | 96 min |  |
| K4-seam-4.J | K4 | Jini | — | — | B4 | 110 min |  |
| A-K2-0.T | A-K2 | Tovu | — | A-K2-0.J | B4 | 45 min |  |
| K4-seam-3.T | K4 | Tovu | — | K4-seam-3.J | B4 | 18 min |  |
| K4-contracts-core-5.T | K4 | Tovu | 16 (delete + repoint) | K4-contracts-core-5.J, K4-seam-1.T | B4 | 42 min | 2,403 |
| A-adm-other-1.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-other-1.J | B4 | 60 min | 2,403 |
| A-adm-other-3.J | P9 (A) | Jini | 14 (move) | A-adm-other-1.J | B5 | 60 min |  |
| A-adm-other-2.J | P9 (A) | Jini | 14 (move) | — | B5 | 60 min |  |
| K4-seam-7.J | K4 | Jini | — | — | B5 | 88 min |  |
| K4-seam-6.J | K4 | Jini | — | — | B5 | 83 min |  |
| K4-seam-4.T | K4 | Tovu | — | K4-seam-4.J | B5 | 89 min |  |
| K4-seam-5.T | K4 | Tovu | — | K4-seam-5.J | B5 | 77 min |  |
| K5-deployments-1.J | K5 | Jini | 15 (move) | K4-seam-1.J, K4-seam-5.J, K4-seam-6.J, K4-seam-3.J, K4-seam-2.J | B6 | 91 min |  |
| K4-seam-9.J | K4 | Jini | — | — | B6 | 99 min |  |
| K4-seam-8.J | K4 | Jini | — | — | B6 | 84 min |  |
| K4-seam-6.T | K4 | Tovu | — | K4-seam-6.J | B6 | 66 min |  |
| K4-seam-7.T | K4 | Tovu | — | K4-seam-7.J | B6 | 70 min |  |
| A-adm-other-2.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-other-2.J | B6 | 60 min | 2,389 |
| K4-seam-11.J | K4 | Jini | — | — | B7 | 44 min |  |
| K4-seam-10.J | K4 | Jini | — | — | B7 | 93 min |  |
| K4-seam-8.T | K4 | Tovu | — | K4-seam-8.J | B7 | 67 min |  |
| K4-seam-9.T | K4 | Tovu | — | K4-seam-9.J | B7 | 79 min |  |
| K5-deployments-1.T | K5 | Tovu | 15 (delete + repoint) | K5-deployments-1.J, K4-seam-1.T, K4-seam-5.T, K4-seam-6.T, K4-seam-3.T, K4-seam-2.T | B7 | 83 min | 2,360 |
| A-adm-other-3.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-other-3.J | B7 | 60 min | 2,360 |
| A-adm-shell-components-1.J | P9 (A) | Jini | 14 (move) | — | B8 | 60 min |  |
| K4-plugins-1.J | K4 | Jini | 2 (move) | K4-seam-10.J | B8 | 29 min |  |
| K4-seam-13.J | K4 | Jini | — | — | B8 | 86 min |  |
| K4-seam-12.J | K4 | Jini | — | — | B8 | 110 min |  |
| K4-seam-10.T | K4 | Tovu | — | K4-seam-10.J | B8 | 75 min |  |
| K4-seam-11.T | K4 | Tovu | — | K4-seam-11.J | B8 | 36 min |  |
| K4-seam-15.J | K4 | Jini | — | — | B9 | 98 min |  |
| K4-seam-14.J | K4 | Jini | — | — | B9 | 96 min |  |
| K4-seam-12.T | K4 | Tovu | — | K4-seam-12.J | B9 | 98 min |  |
| K4-seam-13.T | K4 | Tovu | — | K4-seam-13.J | B9 | 68 min |  |
| K4-plugins-1.T | K4 | Tovu | 2 (delete + repoint) | K4-plugins-1.J, K4-seam-10.T | B9 | 18 min | 2,344 |
| A-adm-shell-components-1.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-shell-components-1.J | B9 | 60 min | 2,344 |
| R-public-http-1.J | P9 (R) | Jini | 14 (move) | — | B10 | 60 min |  |
| A-adm-shell-lib-2.J | P9 (A) | Jini | 14 (move) | — | B10 | 60 min |  |
| K4-contracts-headless-1.J | K4 | Jini | 7 (move) | K4-seam-6.J, K4-seam-14.J, K4-seam-7.J, K4-seam-1.J | B10 | 52 min |  |
| K4-seam-16.J | K4 | Jini | — | — | B10 | 91 min |  |
| K4-seam-14.T | K4 | Tovu | — | K4-seam-14.J | B10 | 77 min |  |
| K4-seam-15.T | K4 | Tovu | — | K4-seam-15.J | B10 | 78 min |  |
| K4-seam-18.J | K4 | Jini | — | — | B11 | 99 min |  |
| K4-seam-17.J | K4 | Jini | — | — | B11 | 85 min |  |
| K4-seam-16.T | K4 | Tovu | — | K4-seam-16.J | B11 | 72 min |  |
| K4-contracts-headless-1.T | K4 | Tovu | 7 (delete + repoint) | K4-contracts-headless-1.J, K4-seam-6.T, K4-seam-14.T, K4-seam-7.T, K4-seam-1.T | B11 | 29 min | 2,309 |
| A-adm-shell-lib-2.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-shell-lib-2.J | B11 | 60 min | 2,309 |
| R-public-http-1.T | P9 (R) | Tovu | 14 (delete + repoint) | R-public-http-1.J | B11 | 60 min | 2,309 |
| DT-desktop-1.J | P9 (DT) | Jini | 12 (move) | — | B12 | 60 min |  |
| A-adm-shell-lib-1.J | P9 (A) | Jini | 12 (move) | — | B12 | 60 min |  |
| K4-seam-20.J | K4 | Jini | — | — | B12 | 99 min |  |
| K4-seam-19.J | K4 | Jini | — | — | B12 | 93 min |  |
| K4-seam-17.T | K4 | Tovu | — | K4-seam-17.J | B12 | 68 min |  |
| K4-seam-18.T | K4 | Tovu | — | K4-seam-18.J | B12 | 79 min |  |
| K4-seam-22.J | K4 | Jini | — | — | B13 | 91 min |  |
| K4-seam-21.J | K4 | Jini | — | — | B13 | 77 min |  |
| K4-seam-19.T | K4 | Tovu | — | K4-seam-19.J | B13 | 75 min |  |
| K4-seam-20.T | K4 | Tovu | — | K4-seam-20.J | B13 | 80 min |  |
| A-adm-shell-lib-1.T | P9 (A) | Tovu | 12 (delete + repoint) | A-adm-shell-lib-1.J | B13 | 60 min | 2,285 |
| DT-desktop-1.T | P9 (DT) | Tovu | 12 (delete + repoint) | DT-desktop-1.J | B13 | 60 min | 2,285 |
| X-agent-plugins-1.J | P9 (X) | Jini | 12 (move) | — | B14 | 60 min |  |
| K5-publish-content-1.J | K5 | Jini | 11 (move) | K4-seam-1.J | B14 | 58 min |  |
| K5-contracts-core-4.J | K5 | Jini | 16 (move) | K4-seam-1.J | B14 | 96 min |  |
| K4-seam-23.J | K4 | Jini | — | — | B14 | 94 min |  |
| K4-seam-21.T | K4 | Tovu | — | K4-seam-21.J | B14 | 61 min |  |
| K4-seam-22.T | K4 | Tovu | — | K4-seam-22.J | B14 | 73 min |  |
| X-media-1.J | P9 (X) | Jini | 10 (move) | — | B15 | 60 min |  |
| X-identity-1.J | P9 (X) | Jini | 10 (move) | — | B15 | 60 min |  |
| T-theme-1.J | P9 (T) | Jini | 10 (move) | — | B15 | 60 min |  |
| K4-seam-23.T | K4 | Tovu | — | K4-seam-23.J | B15 | 76 min |  |
| K5-contracts-core-4.T | K5 | Tovu | 16 (delete + repoint) | K5-contracts-core-4.J, K4-seam-1.T | B15 | 55 min | 2,257 |
| X-agent-plugins-1.T | P9 (X) | Tovu | 12 (delete + repoint) | X-agent-plugins-1.J | B15 | 60 min | 2,257 |
| K5-theme-1.J | K5 | Jini | 15 (move) | K4-seam-1.J, K4-seam-5.J, K4-seam-16.J, T-theme-1.J, K4-seam-6.J, C-platform-html-1.J | B16 | 101 min |  |
| K5-plugin-runtime-1.J | K5 | Jini | 9 (move) | K4-seam-20.J, K4-seam-5.J, K4-seam-7.J | B16 | 101 min |  |
| K5-identity-1.J | K5 | Jini | 9 (move) | K4-contracts-core-5.J, X-identity-1.J, K4-seam-15.J | B16 | 94 min |  |
| K5-publish-content-1.T | K5 | Tovu | 11 (delete + repoint) | K5-publish-content-1.J, K4-seam-1.T | B16 | 89 min | 2,226 |
| T-theme-1.T | P9 (T) | Tovu | 10 (delete + repoint) | T-theme-1.J | B16 | 60 min | 2,226 |
| X-media-1.T | P9 (X) | Tovu | 10 (delete + repoint) | X-media-1.J | B16 | 60 min | 2,226 |
| A-adm-themes-1.J | P9 (A) | Jini | 9 (move) | — | B17 | 60 min |  |
| A-adm-shell-lib-3.J | P9 (A) | Jini | 9 (move) | — | B17 | 60 min |  |
| K5-site-backup-1.J | K5 | Jini | 8 (move) | K4-seam-1.J, K4-seam-5.J, K4-seam-11.J, X-agent-plugins-1.J, K4-seam-13.J, C-platform-html-1.J | B17 | 97 min |  |
| K5-contracts-core-2.J | K5 | Jini | 8 (move) | K4-seam-14.J, K4-seam-18.J, K4-seam-19.J, K4-seam-10.J | B17 | 84 min |  |
| K5-theme-1.T | K5 | Tovu | 15 (delete + repoint) | K5-theme-1.J, K4-seam-1.T, K4-seam-5.T, K4-seam-16.T, K4-seam-6.T | B17 | 107 min | 2,201 |
| X-identity-1.T | P9 (X) | Tovu | 10 (delete + repoint) | X-identity-1.J | B17 | 60 min | 2,201 |
| A-adm-other-5.J | P9 (A) | Jini | 14 (move) | A-adm-shell-lib-3.J, A-adm-other-2.J, A-adm-shell-components-1.J | B18 | 60 min |  |
| A-adm-other-4.J | P9 (A) | Jini | 14 (move) | A-adm-other-1.J, A-adm-shell-lib-3.J, A-adm-other-3.J, A-adm-shell-components-1.J, A-adm-shell-lib-1.J | B18 | 60 min |  |
| K5-identity-1.T | K5 | Tovu | 9 (delete + repoint) | K5-identity-1.J, K4-contracts-core-5.T, K4-seam-15.T | B18 | 45 min | 2,166 |
| K5-plugin-runtime-1.T | K5 | Tovu | 9 (delete + repoint) | K5-plugin-runtime-1.J, K4-seam-20.T, K4-seam-5.T, K4-seam-7.T | B18 | 63 min | 2,166 |
| K5-site-backup-1.T | K5 | Tovu | 8 (delete + repoint) | K5-site-backup-1.J, K4-seam-1.T, K4-seam-5.T, K4-seam-11.T, K4-seam-13.T | B18 | 103 min | 2,166 |
| A-adm-shell-lib-3.T | P9 (A) | Tovu | 9 (delete + repoint) | A-adm-shell-lib-3.J | B18 | 60 min | 2,166 |
| A-adm-shell-components-2.J | P9 (A) | Jini | 11 (move) | A-adm-shell-components-1.J, A-adm-other-1.J, A-adm-shell-lib-2.J, A-adm-shell-lib-3.J, A-adm-other-2.J, A-adm-other-3.J | B19 | 60 min |  |
| A-adm-posts-1.J | P9 (A) | Jini | 14 (move) | A-adm-shell-components-1.J, A-adm-shell-lib-3.J | B19 | 60 min |  |
| K5-contracts-core-2.T | K5 | Tovu | 8 (delete + repoint) | K5-contracts-core-2.J, K4-seam-14.T, K4-seam-18.T, K4-seam-19.T, K4-seam-10.T | B19 | 104 min | 2,121 |
| A-adm-other-4.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-other-4.J | B19 | 60 min | 2,121 |
| A-adm-other-5.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-other-5.J | B19 | 60 min | 2,121 |
| A-adm-themes-1.T | P9 (A) | Tovu | 9 (delete + repoint) | A-adm-themes-1.J | B19 | 60 min | 2,121 |
| X-trash-1.J | P9 (X) | Jini | 8 (move) | — | B20 | 60 min |  |
| A-adm-shell-lib-4.J | P9 (A) | Jini | 9 (move) | A-adm-shell-lib-3.J, A-adm-shell-lib-1.J, A-adm-posts-1.J, A-adm-shell-lib-2.J | B20 | 60 min |  |
| A-adm-pages-1.J | P9 (A) | Jini | 9 (move) | A-adm-posts-1.J | B20 | 60 min |  |
| K5-web-screenshot-1.J | K5 | Jini | 8 (move) | K4-seam-2.J, K4-seam-22.J, K4-seam-13.J | B20 | 99 min |  |
| A-adm-posts-1.T | P9 (A) | Tovu | 14 (delete + repoint) | A-adm-posts-1.J | B20 | 60 min | 2,096 |
| A-adm-shell-components-2.T | P9 (A) | Tovu | 11 (delete + repoint) | A-adm-shell-components-2.J | B20 | 60 min | 2,096 |
| A-adm-shell-hooks-1.J | P9 (A) | Jini | 10 (move) | A-adm-shell-lib-2.J, A-adm-shell-lib-4.J | B21 | 60 min |  |
| K5-contracts-core-1.J | K5 | Jini | 7 (move) | K4-seam-18.J | B21 | 95 min |  |
| A-K2-shell-components-2.J | A-K2 | Jini | 8 (move) | A-K2-0.J | B21 | 94 min |  |
| K5-web-screenshot-1.T | K5 | Tovu | 8 (delete + repoint) | K5-web-screenshot-1.J, K4-seam-2.T, K4-seam-22.T, K4-seam-13.T | B21 | 60 min | 2,071 |
| A-adm-pages-1.T | P9 (A) | Tovu | 9 (delete + repoint) | A-adm-pages-1.J | B21 | 60 min | 2,071 |
| X-trash-1.T | P9 (X) | Tovu | 8 (delete + repoint) | X-trash-1.J | B21 | 60 min | 2,071 |
| K5-contracts-core-6.J | K5 | Jini | 16 (move) | K4-seam-1.J, K5-contracts-core-1.J | B22 | 93 min |  |
| A-K2-shell-lib-1.J | A-K2 | Jini | 8 (move) | A-K2-0.J, K4-i18n-common.J | B22 | 102 min |  |
| A-K2-shell-components-1.J | A-K2 | Jini | 7 (move) | A-K2-0.J, K4-i18n-common.J | B22 | 104 min |  |
| A-K2-shell-components-2.T | A-K2 | Tovu | 8 (delete + repoint) | A-K2-shell-components-2.J, A-K2-0.T | B22 | 34 min | 2,046 |
| K5-contracts-core-1.T | K5 | Tovu | 7 (delete + repoint) | K5-contracts-core-1.J, K4-seam-18.T | B22 | 74 min | 2,046 |
| A-adm-shell-hooks-1.T | P9 (A) | Tovu | 10 (delete + repoint) | A-adm-shell-hooks-1.J | B22 | 60 min | 2,046 |
| X-plugin-runtime-1.J | P9 (X) | Jini | 7 (move) | — | B23 | 60 min |  |
| K5-platform-mail-1.J | K5 | Jini | 7 (move) | K4-seam-4.J, K4-seam-2.J, K4-seam-9.J | B23 | 92 min |  |
| A-K2-shell-lib-2.J | A-K2 | Jini | 7 (move) | A-K2-0.J, A-adm-shell-lib-1.J, A-adm-shell-lib-3.J | B23 | 90 min |  |
| A-K2-plugins-1.J | A-K2 | Jini | 9 (move) | A-K2-0.J, K4-seam-8.J, K4-i18n-common.J, A-K2-shell-lib-1.J, A-adm-shell-components-1.J | B23 | 104 min |  |
| K5-contracts-core-6.T | K5 | Tovu | 16 (delete + repoint) | K5-contracts-core-6.J, K4-seam-1.T | B23 | 98 min | 2,021 |
| A-adm-shell-lib-4.T | P9 (A) | Tovu | 9 (delete + repoint) | A-adm-shell-lib-4.J | B23 | 60 min | 2,021 |
| X-settings-1.J | P9 (X) | Jini | 7 (move) | — | B24 | 60 min |  |
| K5-agent-plugins-1.J | K5 | Jini | 6 (move) | K4-seam-6.J, K4-seam-1.J | B24 | 67 min |  |
| A-K2-shell-hooks-1.J | A-K2 | Jini | 10 (move) | K4-seam-8.J, A-adm-shell-lib-2.J, A-K2-shell-lib-1.J, K4-seam-14.J, K4-seam-17.J, A-K2-shell-lib-2.J, A-K2-0.J, A-adm-shell-lib-4.J, A-adm-shell-lib-1.J, A-adm-shell-hooks-1.J | B24 | 104 min |  |
| A-K2-plugins-1.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-plugins-1.J, A-K2-0.T, K4-seam-8.T, K4-i18n-common.T | B24 | 61 min | 1,998 |
| K5-platform-mail-1.T | K5 | Tovu | 7 (delete + repoint) | K5-platform-mail-1.J, K4-seam-4.T, K4-seam-2.T, K4-seam-9.T | B24 | 50 min | 1,998 |
| X-plugin-runtime-1.T | P9 (X) | Tovu | 7 (delete + repoint) | X-plugin-runtime-1.J | B24 | 60 min | 1,998 |
| K5-settings-1.J | K5 | Jini | 10 (move) | K4-seam-11.J, X-settings-1.J, K5-contracts-core-6.J, K4-seam-13.J, K4-seam-4.J, K4-seam-21.J | B25 | 92 min |  |
| K5-contracts-core-3.J | K5 | Jini | 5 (move) | K4-seam-19.J, K4-seam-10.J | B25 | 53 min |  |
| A-K2-shell-components-1.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-shell-components-1.J, A-K2-0.T, K4-i18n-common.T | B25 | 31 min | 1,968 |
| A-K2-shell-hooks-1.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-shell-hooks-1.J, K4-seam-8.T, K4-seam-14.T, K4-seam-17.T, A-K2-0.T | B25 | 63 min | 1,968 |
| K5-agent-plugins-1.T | K5 | Tovu | 6 (delete + repoint) | K5-agent-plugins-1.J, K4-seam-6.T, K4-seam-1.T | B25 | 41 min | 1,968 |
| X-settings-1.T | P9 (X) | Tovu | 7 (delete + repoint) | X-settings-1.J | B25 | 60 min | 1,968 |
| K5-webhooks-1.J | K5 | Jini | 7 (move) | K4-seam-2.J, K4-seam-9.J, K5-contracts-core-3.J | B26 | 65 min |  |
| K4-publish-content-2.J | K4 | Jini | 3 (move) | K4-seam-5.J, K5-publish-content-1.J, K5-contracts-core-3.J | B26 | 36 min |  |
| K5-desktop-1.J | K5 | Jini | 5 (move) | K4-seam-17.J, K4-seam-18.J | B26 | 67 min |  |
| A-K2-shell-lib-1.T | A-K2 | Tovu | 8 (delete + repoint) | A-K2-shell-lib-1.J, A-K2-0.T, K4-i18n-common.T | B26 | 43 min | 1,945 |
| K5-contracts-core-3.T | K5 | Tovu | 5 (delete + repoint) | K5-contracts-core-3.J, K4-seam-19.T, K4-seam-10.T | B26 | 109 min | 1,945 |
| K5-settings-1.T | K5 | Tovu | 10 (delete + repoint) | K5-settings-1.J, K4-seam-11.T, K4-seam-13.T, K4-seam-4.T, K4-seam-21.T | B26 | 59 min | 1,945 |
| K5-site-backup-2.J | K5 | Jini | 7 (move) | C-platform-html-1.J, K5-site-backup-1.J, K4-seam-12.J, K4-publish-content-2.J | B27 | 87 min |  |
| K5-publish-content-ui-1.J | K5 | Jini | 7 (move) | K5-publish-content-1.J, K4-publish-content-2.J, K4-seam-21.J | B27 | 64 min |  |
| K5-external-mcp-1.J | K5 | Jini | 5 (move) | K4-seam-5.J, K4-seam-20.J, K4-seam-11.J | B27 | 56 min |  |
| A-K2-shell-lib-2.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-shell-lib-2.J, A-K2-0.T | B27 | 47 min | 1,926 |
| K5-desktop-1.T | K5 | Tovu | 5 (delete + repoint) | K5-desktop-1.J, K4-seam-17.T, K4-seam-18.T | B27 | 46 min | 1,926 |
| K5-webhooks-1.T | K5 | Tovu | 7 (delete + repoint) | K5-webhooks-1.J, K4-seam-2.T, K4-seam-9.T | B27 | 92 min | 1,926 |
| P-publish-trust-1.J | P9 (P) | Jini | 5 (move) | — | B28 | 60 min |  |
| C-contracts-headless-1.J | P9 (C) | Jini | 5 (move) | — | B28 | 60 min |  |
| K5-tool-audit-1.J | K5 | Jini | 5 (move) | K4-seam-13.J | B28 | 58 min |  |
| K5-publish-content-3.J | K5 | Jini | 15 (move) | K4-publish-content-2.J, K5-publish-content-1.J, K5-contracts-core-2.J, K5-contracts-core-3.J, K5-publish-content-ui-1.J, X-identity-1.J | B28 | 81 min |  |
| K5-external-mcp-1.T | K5 | Tovu | 5 (delete + repoint) | K5-external-mcp-1.J, K4-seam-5.T, K4-seam-20.T, K4-seam-11.T | B28 | 104 min | 1,918 |
| K4-publish-content-2.T | K4 | Tovu | 3 (delete + repoint) | K4-publish-content-2.J, K4-seam-5.T | B28 | 101 min | 1,918 |
| X-navigation-1.J | P9 (X) | Jini | 5 (move) | — | B29 | 60 min |  |
| K5-publish-trust-1.J | K5 | Jini | 6 (move) | K4-seam-1.J, P-publish-trust-1.J, K4-seam-2.J | B29 | 59 min |  |
| A-K2-shell-lib-3.J | A-K2 | Jini | 4 (move) | K5-contracts-core-1.J, A-K2-shell-lib-2.J, A-adm-shell-lib-2.J, A-K2-0.J, A-K2-shell-lib-1.J | B29 | 61 min |  |
| K5-publish-content-3.T | K5 | Tovu | 15 (delete + repoint) | K5-publish-content-3.J, K4-publish-content-2.T | B29 | 106 min | 1,891 |
| K5-site-backup-2.T | K5 | Tovu | 7 (delete + repoint) | K5-site-backup-2.J, K4-seam-12.T, K4-publish-content-2.T | B29 | 92 min | 1,891 |
| C-contracts-headless-1.T | P9 (C) | Tovu | 5 (delete + repoint) | C-contracts-headless-1.J | B29 | 60 min | 1,891 |
| RT-K1-adm-publish-content-1.J | RT-K1 | Jini | 4 (move) | K4-publish-content-2.J, RT-K1-0.J, P-publish-trust-1.J, K5-publish-content-3.J, K5-publish-content-1.J | B30 | 88 min |  |
| RT-K1-adm-assistant-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, K4-seam-14.J | B30 | 84 min |  |
| A-K2-shell-lib-3.T | A-K2 | Tovu | 4 (delete + repoint) | A-K2-shell-lib-3.J, A-K2-0.T | B30 | 22 min | 1,869 |
| K5-publish-content-ui-1.T | K5 | Tovu | 7 (delete + repoint) | K5-publish-content-ui-1.J, K4-publish-content-2.T, K4-seam-21.T | B30 | 65 min | 1,869 |
| K5-publish-trust-1.T | K5 | Tovu | 6 (delete + repoint) | K5-publish-trust-1.J, K4-seam-1.T, K4-seam-2.T | B30 | 54 min | 1,869 |
| K5-tool-audit-1.T | K5 | Tovu | 5 (delete + repoint) | K5-tool-audit-1.J, K4-seam-13.T | B30 | 38 min | 1,869 |
| K5-server-logs-1.J | K5 | Jini | 4 (move) | K4-seam-21.J, K5-contracts-core-6.J | B31 | 47 min |  |
| K5-contracts-core-7.J | K5 | Jini | 4 (move) | K5-contracts-core-1.J, K5-contracts-core-2.J, K4-seam-3.J, K4-seam-14.J, K4-seam-19.J | B31 | 90 min |  |
| RT-K1-adm-redirects-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J | B31 | 90 min |  |
| RT-K1-adm-publish-content-2.J | RT-K1 | Jini | 4 (move) | RT-K1-adm-publish-content-1.J, RT-K1-0.J, K5-publish-content-3.J, K5-publish-content-1.J, K4-publish-content-2.J, P-publish-trust-1.J | B31 | 85 min |  |
| RT-K1-adm-assistant-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-assistant-1.J, RT-K1-0.T, K4-seam-14.T | B31 | 50 min | 1,860 |
| P-publish-trust-1.T | P9 (P) | Tovu | 5 (delete + repoint) | P-publish-trust-1.J | B31 | 60 min | 1,860 |
| K5-custom-credentials-1.J | K5 | Jini | 8 (move) | K4-seam-10.J, K4-seam-15.J, K5-contracts-core-7.J, K5-contracts-core-1.J | B32 | 91 min |  |
| RT-K1-adm-redirects-2.J | RT-K1 | Jini | 5 (move) | RT-K1-adm-redirects-1.J, RT-K1-0.J | B32 | 104 min |  |
| RT-K1-adm-publish-content-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-publish-content-2.J, RT-K1-0.T, K4-publish-content-2.T | B32 | 43 min | 1,843 |
| RT-K1-adm-redirects-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-redirects-1.J, RT-K1-0.T | B32 | 42 min | 1,843 |
| K5-contracts-core-7.T | K5 | Tovu | 4 (delete + repoint) | K5-contracts-core-7.J, K4-seam-3.T, K4-seam-14.T, K4-seam-19.T | B32 | 64 min | 1,843 |
| X-navigation-1.T | P9 (X) | Tovu | 5 (delete + repoint) | X-navigation-1.J | B32 | 60 min | 1,843 |
| X-identity-2.J | P9 (X) | Jini | 4 (move) | X-identity-1.J | B33 | 60 min |  |
| SEC-adm-security-1.J | P9 (SEC) | Jini | 4 (move) | A-adm-shell-lib-3.J | B33 | 60 min |  |
| R-admin-http-1.J | P9 (R) | Jini | 4 (move) | — | B33 | 60 min |  |
| A-adm-recovery-1.J | P9 (A) | Jini | 4 (move) | A-adm-other-1.J, A-adm-other-3.J, A-adm-shell-lib-3.J | B33 | 60 min |  |
| RT-K1-adm-redirects-2.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-redirects-2.J, RT-K1-0.T | B33 | 43 min | 1,830 |
| K5-custom-credentials-1.T | K5 | Tovu | 8 (delete + repoint) | K5-custom-credentials-1.J, K4-seam-10.T, K4-seam-15.T | B33 | 104 min | 1,830 |
| RT-K1-adm-forms-1.J | RT-K1 | Jini | 5 (move) | RT-K1-0.J, R-admin-http-1.J | B34 | 89 min |  |
| RT-K1-adm-publish-content-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-publish-content-1.J, K4-publish-content-2.T, RT-K1-0.T | B34 | 62 min | 1,810 |
| A-adm-recovery-1.T | P9 (A) | Tovu | 4 (delete + repoint) | A-adm-recovery-1.J | B34 | 60 min | 1,810 |
| R-admin-http-1.T | P9 (R) | Tovu | 4 (delete + repoint) | R-admin-http-1.J | B34 | 60 min | 1,810 |
| SEC-adm-security-1.T | P9 (SEC) | Tovu | 4 (delete + repoint) | SEC-adm-security-1.J | B34 | 60 min | 1,810 |
| X-identity-2.T | P9 (X) | Tovu | 4 (delete + repoint) | X-identity-2.J | B34 | 60 min | 1,810 |
| X-webhooks-1.J | P9 (X) | Jini | 4 (move) | — | B35 | 60 min |  |
| X-mail-status-1.J | P9 (X) | Jini | 4 (move) | X-identity-1.J | B35 | 60 min |  |
| RT-K1-adm-seo-1.J | RT-K1 | Jini | 5 (move) | RT-K1-0.J, R-admin-http-1.J | B35 | 105 min |  |
| RT-K1-adm-forms-2.J | RT-K1 | Jini | 4 (move) | RT-K1-adm-forms-1.J, RT-K1-0.J, R-admin-http-1.J | B35 | 89 min |  |
| RT-K1-adm-forms-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-forms-1.J, RT-K1-0.T | B35 | 54 min | 1,801 |
| K5-server-logs-1.T | K5 | Tovu | 4 (delete + repoint) | K5-server-logs-1.J, K4-seam-21.T | B35 | 32 min | 1,801 |
| RT-K1-adm-assistant-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-assistant-1.J, RT-K1-0.J, K4-seam-14.J | B36 | 99 min |  |
| A-K2-admin-themes-1.J | A-K2 | Jini | 3 (move) | K4-i18n-common.J, A-adm-other-1.J, A-K2-0.J | B36 | 50 min |  |
| RT-K1-adm-forms-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-forms-2.J, RT-K1-0.T | B36 | 43 min | 1,784 |
| RT-K1-adm-seo-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-seo-1.J, RT-K1-0.T | B36 | 57 min | 1,784 |
| X-mail-status-1.T | P9 (X) | Tovu | 4 (delete + repoint) | X-mail-status-1.J | B36 | 60 min | 1,784 |
| X-webhooks-1.T | P9 (X) | Tovu | 4 (delete + repoint) | X-webhooks-1.J | B36 | 60 min | 1,784 |
| X-skills-1.J | P9 (X) | Jini | 3 (move) | — | B37 | 60 min |  |
| X-database-transfer-1.J | P9 (X) | Jini | 3 (move) | — | B37 | 60 min |  |
| RT-K1-adm-assistant-4.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-assistant-1.J, RT-K1-0.J | B37 | 82 min |  |
| RT-K1-adm-assistant-3.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-assistant-1.J, RT-K1-0.J | B37 | 90 min |  |
| A-K2-admin-themes-1.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-admin-themes-1.J, K4-i18n-common.T, A-K2-0.T | B37 | 28 min | 1,778 |
| RT-K1-adm-assistant-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-assistant-2.J, RT-K1-0.T, K4-seam-14.T | B37 | 44 min | 1,778 |
| K5-skills-1.J | K5 | Jini | 4 (move) | K5-contracts-core-6.J, K4-contracts-headless-1.J, X-skills-1.J | B38 | 53 min |  |
| K5-platform-routing-1.J | K5 | Jini | 3 (move) | — | B38 | 33 min |  |
| RT-K1-adm-system-1.J | RT-K1 | Jini | 3 (move) | RT-K1-0.J | B38 | 84 min |  |
| RT-K1-adm-assistant-3.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-assistant-3.J, RT-K1-0.T | B38 | 40 min | 1,769 |
| X-database-transfer-1.T | P9 (X) | Tovu | 3 (delete + repoint) | X-database-transfer-1.J | B38 | 60 min | 1,769 |
| X-skills-1.T | P9 (X) | Tovu | 3 (delete + repoint) | X-skills-1.J | B38 | 60 min | 1,769 |
| K5-theme-2.J | K5 | Jini | 16 (move) | C-platform-html-1.J, K5-theme-1.J, T-theme-1.J, K4-seam-6.J, K5-platform-routing-1.J, K4-seam-5.J, K4-seam-16.J | B39 | 91 min |  |
| RT-K1-pub-site-1.J | RT-K1 | Jini | 8 (move) | R-public-http-1.J, RT-K1-0.J, K5-contracts-core-3.J, X-settings-1.J, C-platform-html-1.J, K5-platform-routing-1.J | B39 | 99 min |  |
| RT-K1-adm-assistant-4.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-assistant-4.J, RT-K1-0.T | B39 | 44 min | 1,756 |
| RT-K1-adm-system-1.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-system-1.J, RT-K1-0.T | B39 | 37 min | 1,756 |
| K5-platform-routing-1.T | K5 | Tovu | 3 (delete + repoint) | K5-platform-routing-1.J | B39 | 55 min | 1,756 |
| K5-skills-1.T | K5 | Tovu | 4 (delete + repoint) | K5-skills-1.J, K4-contracts-headless-1.T | B39 | 49 min | 1,756 |
| K5-theme-3.J | K5 | Jini | 9 (move) | K5-theme-2.J, K5-theme-1.J | B40 | 63 min |  |
| K5-post-1.J | K5 | Jini | 6 (move) | K4-seam-5.J, K4-seam-3.J, K5-contracts-core-3.J, T-post-1.J, K5-platform-routing-1.J | B40 | 50 min |  |
| A-K2-seo-1.J | A-K2 | Jini | 2 (move) | K4-i18n-common.J | B40 | 44 min |  |
| A-K2-redirects-1.J | A-K2 | Jini | 2 (move) | A-adm-shell-lib-2.J, K4-i18n-common.J | B40 | 41 min |  |
| RT-K1-pub-site-1.T | RT-K1 | Tovu | 8 (delete + repoint) | RT-K1-pub-site-1.J, RT-K1-0.T | B40 | 79 min | 1,732 |
| K5-theme-2.T | K5 | Tovu | 16 (delete + repoint) | K5-theme-2.J, K4-seam-6.T, K4-seam-5.T, K4-seam-16.T | B40 | 89 min | 1,732 |
| A-adm-deployment-1.J | P9 (A) | Jini | 2 (move) | A-adm-shell-lib-3.J, A-adm-other-2.J | B41 | 60 min |  |
| K5-post-2.J | K5 | Jini | 4 (move) | K5-post-1.J, K5-contracts-core-3.J | B41 | 52 min |  |
| RT-K1-adm-skills-1.J | RT-K1 | Jini | 3 (move) | RT-K1-0.J, K5-skills-1.J | B41 | 85 min |  |
| A-K2-redirects-1.T | A-K2 | Tovu | 2 (delete + repoint) | A-K2-redirects-1.J, K4-i18n-common.T | B41 | 25 min | 1,715 |
| K5-post-1.T | K5 | Tovu | 6 (delete + repoint) | K5-post-1.J, K4-seam-5.T, K4-seam-3.T | B41 | 110 min | 1,715 |
| K5-theme-3.T | K5 | Tovu | 9 (delete + repoint) | K5-theme-3.J | B41 | 103 min | 1,715 |
| K5-presentation-1.J | K5 | Jini | 3 (move) | K4-seam-3.J | B42 | 37 min |  |
| K5-post-3.J | K5 | Jini | 14 (move) | K5-post-1.J, T-post-1.J, K5-post-2.J, K5-contracts-core-3.J, K5-contracts-core-6.J | B42 | 83 min |  |
| A-K2-seo-1.T | A-K2 | Tovu | 2 (delete + repoint) | A-K2-seo-1.J, K4-i18n-common.T | B42 | 25 min | 1,704 |
| RT-K1-adm-skills-1.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-skills-1.J, RT-K1-0.T | B42 | 43 min | 1,704 |
| K5-post-2.T | K5 | Tovu | 4 (delete + repoint) | K5-post-2.J | B42 | 97 min | 1,704 |
| A-adm-deployment-1.T | P9 (A) | Tovu | 2 (delete + repoint) | A-adm-deployment-1.J | B42 | 60 min | 1,704 |
| X-content-types-1.J | P9 (X) | Jini | 3 (move) | — | B43 | 60 min |  |
| X-analytics-1.J | P9 (X) | Jini | 2 (move) | — | B43 | 60 min |  |
| A-adm-publish-content-1.J | P9 (A) | Jini | 2 (move) | — | B43 | 60 min |  |
| A-adm-posts-2.J | P9 (A) | Jini | 2 (move) | A-adm-posts-1.J | B43 | 60 min |  |
| K5-settings-2.J | K5 | Jini | 3 (move) | X-identity-1.J, K5-settings-1.J | B43 | 51 min |  |
| K5-post-3.T | K5 | Tovu | 14 (delete + repoint) | K5-post-3.J | B43 | 109 min | 1,690 |
| K5-widgets-1.J | K5 | Jini | 5 (move) | K4-seam-5.J, K5-post-3.J, K5-post-1.J, X-content-types-1.J, X-media-1.J, C-platform-html-1.J, K4-publish-content-2.J, K5-publish-content-1.J, K5-publish-content-3.J, K5-contracts-core-6.J, K5-contracts-core-4.J, K5-contracts-core-2.J | B44 | 82 min |  |
| K5-presentation-1.T | K5 | Tovu | 3 (delete + repoint) | K5-presentation-1.J, K4-seam-3.T | B44 | 47 min | 1,678 |
| K5-settings-2.T | K5 | Tovu | 3 (delete + repoint) | K5-settings-2.J | B44 | 35 min | 1,678 |
| A-adm-posts-2.T | P9 (A) | Tovu | 2 (delete + repoint) | A-adm-posts-2.J | B44 | 60 min | 1,678 |
| A-adm-publish-content-1.T | P9 (A) | Tovu | 2 (delete + repoint) | A-adm-publish-content-1.J | B44 | 60 min | 1,678 |
| X-analytics-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-analytics-1.J | B44 | 60 min | 1,678 |
| X-vendor-credentials-1.J | P9 (X) | Jini | 2 (move) | — | B45 | 60 min |  |
| X-forms-1.J | P9 (X) | Jini | 3 (move) | — | B45 | 60 min |  |
| X-external-mcp-1.J | P9 (X) | Jini | 2 (move) | — | B45 | 60 min |  |
| X-entries-1.J | P9 (X) | Jini | 3 (move) | — | B45 | 60 min |  |
| A-K2-shell-lib-4.J | A-K2 | Jini | 1 (move) | A-K2-shell-lib-2.J, A-adm-shell-lib-2.J, A-adm-shell-lib-3.J, A-adm-shell-lib-1.J | B45 | 35 min |  |
| K5-widgets-1.T | K5 | Tovu | 5 (delete + repoint) | K5-widgets-1.J, K4-seam-5.T, K4-publish-content-2.T | B45 | 78 min | 1,673 |
| A-K2-media-1.J | A-K2 | Jini | 14 (move) | A-K2-0.J, K4-seam-5.J, K4-i18n-common.J, A-adm-shell-lib-3.J, A-adm-other-5.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-shell-lib-4.J | B46 | 97 min |  |
| A-K2-collections-1.J | A-K2 | Jini | 16 (move) | K4-i18n-common.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-1.J, A-adm-other-4.J | B46 | 89 min |  |
| A-K2-shell-lib-4.T | A-K2 | Tovu | 1 (delete + repoint) | A-K2-shell-lib-4.J | B46 | 120 min | 1,664 |
| X-content-types-1.T | P9 (X) | Tovu | 3 (delete + repoint) | X-content-types-1.J | B46 | 60 min | 1,664 |
| X-forms-1.T | P9 (X) | Tovu | 3 (delete + repoint) | X-forms-1.J | B46 | 60 min | 1,664 |
| X-vendor-credentials-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-vendor-credentials-1.J | B46 | 60 min | 1,664 |
| K5-source-control-1.J | K5 | Jini | 12 (move) | K4-seam-1.J, K4-seam-2.J, K5-contracts-core-2.J, X-vendor-credentials-1.J, K4-seam-5.J | B47 | 97 min |  |
| A-K2-posts-1.J | A-K2 | Jini | 12 (move) | A-K2-0.J, A-adm-shell-lib-2.J, K4-i18n-common.J, A-adm-posts-1.J, A-adm-shell-lib-4.J, A-K2-media-1.J, A-adm-themes-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, T-post-1.J | B47 | 103 min |  |
| A-K2-pages-1.J | A-K2 | Jini | 11 (move) | A-K2-0.J, K4-i18n-common.J, A-adm-pages-1.J, A-adm-shell-lib-3.J, A-adm-themes-1.J, A-adm-posts-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J | B47 | 104 min |  |
| A-K2-collections-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-collections-1.J, K4-i18n-common.T | B47 | 64 min | 1,643 |
| X-entries-1.T | P9 (X) | Tovu | 3 (delete + repoint) | X-entries-1.J | B47 | 60 min | 1,643 |
| X-external-mcp-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-external-mcp-1.J | B47 | 60 min | 1,643 |
| RT-K1-adm-sites-2.J | RT-K1 | Jini | 2 (move) | RT-K1-0.J, K4-seam-12.J | B48 | 85 min |  |
| RT-K1-adm-sites-1.J | RT-K1 | Jini | 2 (move) | RT-K1-0.J | B48 | 97 min |  |
| A-K2-themes-1.J | A-K2 | Jini | 11 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-themes-1.J, A-adm-shell-hooks-1.J, A-K2-pages-1.J, A-K2-0.J, A-adm-shell-lib-4.J | B48 | 103 min |  |
| A-K2-import-export-1.J | A-K2 | Jini | 10 (move) | K4-i18n-common.J, A-K2-0.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-2.J, A-adm-shell-lib-3.J | B48 | 75 min |  |
| A-K2-media-1.T | A-K2 | Tovu | 14 (delete + repoint) | A-K2-media-1.J, A-K2-0.T, K4-seam-5.T, K4-i18n-common.T | B48 | 109 min | 1,617 |
| K5-source-control-1.T | K5 | Tovu | 12 (delete + repoint) | K5-source-control-1.J, K4-seam-1.T, K4-seam-2.T, K4-seam-5.T | B48 | 86 min | 1,617 |
| K5-origin-1.J | K5 | Jini | 2 (move) | — | B49 | 31 min |  |
| K5-content-types-1.J | K5 | Jini | 2 (move) | K5-contracts-core-1.J, K5-publish-content-1.J, K5-publish-content-3.J, K4-publish-content-2.J, X-content-types-1.J, K4-seam-5.J | B49 | 36 min |  |
| A-K2-shell-components-3.J | A-K2 | Jini | 10 (move) | K4-i18n-common.J, A-adm-shell-components-1.J, A-K2-0.J, A-K2-plugins-1.J, A-adm-other-2.J, A-adm-shell-lib-2.J, A-K2-shell-components-2.J, A-K2-media-1.J | B49 | 105 min |  |
| A-K2-fs-files-1.J | A-K2 | Jini | 4 (move) | A-K2-0.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J | B49 | 47 min |  |
| A-K2-posts-1.T | A-K2 | Tovu | 12 (delete + repoint) | A-K2-posts-1.J, A-K2-0.T, K4-i18n-common.T | B49 | 68 min | 1,603 |
| RT-K1-adm-sites-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-sites-1.J, RT-K1-0.T | B49 | 52 min | 1,603 |
| A-K2-shell-components-4.J | A-K2 | Jini | 11 (move) | A-K2-shell-components-2.J, A-K2-0.J, A-K2-media-1.J, A-adm-other-1.J, A-K2-shell-lib-2.J, A-K2-shell-components-3.J, A-adm-shell-components-1.J, A-adm-shell-lib-4.J, A-adm-other-2.J, A-K2-plugins-1.J, A-adm-shell-lib-3.J, A-adm-shell-components-2.J, A-K2-shell-hooks-1.J, K4-seam-14.J | B50 | 99 min |  |
| A-K2-pages-1.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-pages-1.J, A-K2-0.T, K4-i18n-common.T | B50 | 54 min | 1,576 |
| A-K2-shell-components-3.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-shell-components-3.J, K4-i18n-common.T, A-K2-0.T | B50 | 51 min | 1,576 |
| RT-K1-adm-sites-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-sites-2.J, RT-K1-0.T, K4-seam-12.T | B50 | 44 min | 1,576 |
| K5-content-types-1.T | K5 | Tovu | 2 (delete + repoint) | K5-content-types-1.J, K4-publish-content-2.T, K4-seam-5.T | B50 | 26 min | 1,576 |
| K5-origin-1.T | K5 | Tovu | 2 (delete + repoint) | K5-origin-1.J | B50 | 20 min | 1,576 |
| X-form-destinations-1.J | P9 (X) | Jini | 2 (move) | — | B51 | 60 min |  |
| X-content-duplication-1.J | P9 (X) | Jini | 2 (move) | — | B51 | 60 min |  |
| A-K2-comments-1.J | A-K2 | Jini | 3 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-1.J | B51 | 42 min |  |
| A-K2-auth-1.J | A-K2 | Jini | 9 (move) | A-adm-shell-lib-3.J, K4-i18n-common.J, A-K2-shell-lib-4.J, A-adm-other-1.J, A-adm-other-4.J, A-K2-shell-components-3.J | B51 | 59 min |  |
| A-K2-shell-components-4.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-shell-components-4.J, A-K2-0.T, K4-seam-14.T | B51 | 43 min | 1,554 |
| A-K2-themes-1.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-themes-1.J, K4-i18n-common.T, A-K2-0.T | B51 | 67 min | 1,554 |
| K4-content-duplication-1.J | K4 | Jini | 1 (move) | K5-contracts-core-4.J, K5-contracts-core-2.J, X-content-duplication-1.J, K4-seam-10.J | B52 | 25 min |  |
| A-K2-widgets-1.J | A-K2 | Jini | 3 (move) | A-adm-shell-lib-2.J, K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-3.J | B52 | 45 min |  |
| A-K2-forms-1.J | A-K2 | Jini | 3 (move) | A-adm-other-4.J, K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-1.J | B52 | 48 min |  |
| A-K2-import-export-1.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-import-export-1.J, K4-i18n-common.T, A-K2-0.T | B52 | 41 min | 1,540 |
| X-content-duplication-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-content-duplication-1.J | B52 | 60 min | 1,540 |
| X-form-destinations-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-form-destinations-1.J | B52 | 60 min | 1,540 |
| X-pages-1.J | P9 (X) | Jini | 2 (move) | — | B53 | 60 min |  |
| X-fs-files-1.J | P9 (X) | Jini | 2 (move) | — | B53 | 60 min |  |
| K5-observability-1.J | K5 | Jini | 1 (move) | K4-contracts-core-5.J | B53 | 27 min |  |
| K5-contracts-headless-2.J | K5 | Jini | 1 (move) | C-contracts-headless-1.J, K4-contracts-headless-1.J, K4-seam-19.J | B53 | 30 min |  |
| A-K2-auth-1.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-auth-1.J, K4-i18n-common.T | B53 | 47 min | 1,530 |
| K4-content-duplication-1.T | K4 | Tovu | 1 (delete + repoint) | K4-content-duplication-1.J, K4-seam-10.T | B53 | 20 min | 1,530 |
| K5-trash-1.J | K5 | Jini | 13 (move) | X-identity-1.J, K4-seam-15.J, X-trash-1.J, K5-contracts-headless-2.J | B54 | 90 min |  |
| A-K2-webmcp-1.J | A-K2 | Jini | 3 (move) | K4-i18n-common.J, A-adm-other-3.J, K5-contracts-headless-2.J | B54 | 38 min |  |
| A-K2-fs-files-1.T | A-K2 | Tovu | 4 (delete + repoint) | A-K2-fs-files-1.J, A-K2-0.T | B54 | 26 min | 1,521 |
| K5-contracts-headless-2.T | K5 | Tovu | 1 (delete + repoint) | K5-contracts-headless-2.J, K4-contracts-headless-1.T, K4-seam-19.T | B54 | 102 min | 1,521 |
| X-fs-files-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-fs-files-1.J | B54 | 60 min | 1,521 |
| X-pages-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-pages-1.J | B54 | 60 min | 1,521 |
| X-webmcp-1.J | P9 (X) | Jini | 2 (move) | — | B55 | 60 min |  |
| K4-trash-2.J | K4 | Jini | 3 (move) | X-trash-1.J, K5-trash-1.J, K5-contracts-core-6.J, K4-seam-5.J | B55 | 31 min |  |
| V-agent-plugins-2.J | V | Jini | 1 (move) | K5-contracts-headless-2.J | B55 | 23 min |  |
| A-K2-comments-1.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-comments-1.J, K4-i18n-common.T | B55 | 25 min | 1,502 |
| A-K2-webmcp-1.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-webmcp-1.J, K4-i18n-common.T | B55 | 27 min | 1,502 |
| K5-trash-1.T | K5 | Tovu | 13 (delete + repoint) | K5-trash-1.J, K4-seam-15.T | B55 | 101 min | 1,502 |
| K5-settings-3.J | K5 | Jini | 3 (move) | K5-settings-1.J, X-settings-1.J, X-webmcp-1.J, K5-settings-2.J, K4-seam-5.J, K4-seam-11.J, K5-publish-content-3.J, K4-publish-content-2.J | B56 | 47 min |  |
| K5-agent-plugins-3.J | K5 | Jini | 1 (move) | V-agent-plugins-2.J | B56 | 32 min |  |
| RT-K1-adm-trash-1.J | RT-K1 | Jini | 5 (move) | K4-trash-2.J, K4-seam-5.J, RT-K1-0.J | B56 | 97 min |  |
| A-K2-forms-1.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-forms-1.J, K4-i18n-common.T | B56 | 40 min | 1,494 |
| K4-trash-2.T | K4 | Tovu | 3 (delete + repoint) | K4-trash-2.J, K4-seam-5.T | B56 | 75 min | 1,494 |
| X-webmcp-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-webmcp-1.J | B56 | 60 min | 1,494 |
| K5-comments-1.J | K5 | Jini | 10 (move) | K4-seam-9.J, K4-seam-8.J, K4-seam-6.J, K4-seam-10.J, C-platform-html-1.J, K5-settings-3.J, K4-seam-5.J, K5-contracts-core-3.J | B57 | 84 min |  |
| K5-analytics-1.J | K5 | Jini | 7 (move) | K4-seam-3.J, K4-seam-6.J, K5-contracts-core-2.J, X-analytics-1.J, K5-contracts-core-4.J, K5-settings-3.J | B57 | 62 min |  |
| A-K2-widgets-1.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-widgets-1.J, K4-i18n-common.T | B57 | 32 min | 1,482 |
| RT-K1-adm-trash-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-trash-1.J, K4-trash-2.T, K4-seam-5.T, RT-K1-0.T | B57 | 52 min | 1,482 |
| K5-agent-plugins-3.T | K5 | Tovu | 1 (delete + repoint) | K5-agent-plugins-3.J | B57 | 24 min | 1,482 |
| K5-settings-3.T | K5 | Tovu | 3 (delete + repoint) | K5-settings-3.J, K4-seam-5.T, K4-seam-11.T, K4-publish-content-2.T | B57 | 106 min | 1,482 |
| K5-agent-plugins-4.J | K5 | Jini | 1 (move) | V-agent-plugins-2.J, K5-agent-plugins-3.J, X-agent-plugins-1.J, K5-agent-plugins-1.J, K4-seam-3.J | B58 | 31 min |  |
| RT-K1-adm-settings-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, K5-contracts-headless-2.J, T-theme-1.J, R-admin-http-1.J, K5-settings-3.J, K5-contracts-core-2.J | B58 | 104 min |  |
| RT-K1-adm-comments-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, K5-comments-1.J | B58 | 95 min |  |
| V-agent-plugins-2.T | V | Tovu | 1 (delete + repoint) | V-agent-plugins-2.J | B58 | 104 min | 1,470 |
| K5-comments-1.T | K5 | Tovu | 10 (delete + repoint) | K5-comments-1.J, K4-seam-9.T, K4-seam-8.T, K4-seam-6.T, K4-seam-10.T, K4-seam-5.T | B58 | 55 min | 1,470 |
| K5-observability-1.T | K5 | Tovu | 1 (delete + repoint) | K5-observability-1.J, K4-contracts-core-5.T | B58 | 20 min | 1,470 |
| K5-api-connections-1.J | K5 | Jini | 9 (move) | K4-seam-13.J, K4-seam-8.J, K5-contracts-core-3.J, K4-seam-15.J, K5-agent-plugins-4.J | B59 | 103 min |  |
| RT-K1-adm-settings-2.J | RT-K1 | Jini | 7 (move) | K5-settings-3.J, RT-K1-adm-settings-1.J, K4-seam-14.J | B59 | 45 min |  |
| RT-K1-adm-assistant-5.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-assistant-1.J, R-admin-http-1.J, RT-K1-adm-assistant-4.J, RT-K1-0.J, K5-settings-3.J | B59 | 102 min |  |
| RT-K1-adm-comments-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-comments-1.J, RT-K1-0.T | B59 | 41 min | 1,455 |
| RT-K1-adm-settings-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-settings-1.J, RT-K1-0.T | B59 | 62 min | 1,455 |
| K5-analytics-1.T | K5 | Tovu | 7 (delete + repoint) | K5-analytics-1.J, K4-seam-3.T, K4-seam-6.T | B59 | 50 min | 1,455 |
| X-workspace-1.J | P9 (X) | Jini | 2 (move) | — | B60 | 60 min |  |
| K5-external-mcp-2.J | K5 | Jini | 2 (move) | K5-external-mcp-1.J, K5-contracts-core-1.J, K4-seam-1.J, K5-api-connections-1.J | B60 | 64 min |  |
| RT-K1-adm-analytics-1.J | RT-K1 | Jini | 1 (move) | K5-analytics-1.J, RT-K1-0.J, K4-seam-16.J | B60 | 42 min |  |
| RT-K1-adm-assistant-5.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-assistant-5.J, RT-K1-0.T | B60 | 46 min | 1,436 |
| RT-K1-adm-settings-2.T | RT-K1 | Tovu | 7 (delete + repoint) | RT-K1-adm-settings-2.J, K4-seam-14.T | B60 | 78 min | 1,436 |
| K5-api-connections-1.T | K5 | Tovu | 9 (delete + repoint) | K5-api-connections-1.J, K4-seam-13.T, K4-seam-8.T, K4-seam-15.T | B60 | 88 min | 1,436 |
| K5-workspace-1.J | K5 | Jini | 2 (move) | X-workspace-1.J | B61 | 33 min |  |
| K5-external-mcp-3.J | K5 | Jini | 7 (move) | K5-external-mcp-1.J, K5-external-mcp-2.J, K4-seam-5.J, K5-contracts-headless-2.J, K4-seam-1.J, K4-seam-10.J, K5-contracts-core-4.J, K5-contracts-core-3.J, X-external-mcp-1.J, K5-contracts-core-2.J | B61 | 82 min |  |
| RT-K1-adm-external-mcp-1.J | RT-K1 | Jini | 3 (move) | RT-K1-0.J, X-external-mcp-1.J, K5-external-mcp-2.J | B61 | 80 min |  |
| RT-K1-adm-analytics-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-analytics-1.J, RT-K1-0.T, K4-seam-16.T | B61 | 22 min | 1,431 |
| K5-external-mcp-2.T | K5 | Tovu | 2 (delete + repoint) | K5-external-mcp-2.J, K4-seam-1.T | B61 | 108 min | 1,431 |
| X-workspace-1.T | P9 (X) | Tovu | 2 (delete + repoint) | X-workspace-1.J | B61 | 60 min | 1,431 |
| K5-platform-mail-2.J | K5 | Jini | 1 (move) | K5-platform-mail-1.J, K4-seam-4.J | B62 | 33 min |  |
| RT-K1-adm-external-mcp-5.J | RT-K1 | Jini | 2 (move) | K5-external-mcp-3.J, K5-contracts-core-3.J, RT-K1-adm-external-mcp-1.J, RT-K1-0.J | B62 | 64 min |  |
| RT-K1-adm-external-mcp-2.J | RT-K1 | Jini | 2 (move) | X-external-mcp-1.J, K5-external-mcp-2.J, RT-K1-adm-external-mcp-1.J, RT-K1-0.J, K5-external-mcp-1.J | B62 | 90 min |  |
| RT-K1-adm-external-mcp-1.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-external-mcp-1.J, RT-K1-0.T | B62 | 44 min | 1,420 |
| K5-agent-plugins-4.T | K5 | Tovu | 1 (delete + repoint) | K5-agent-plugins-4.J, K4-seam-3.T | B62 | 120 min | 1,420 |
| K5-external-mcp-3.T | K5 | Tovu | 7 (delete + repoint) | K5-external-mcp-3.J, K4-seam-5.T, K4-seam-1.T, K4-seam-10.T | B62 | 51 min | 1,420 |
| K5-newsletter-1.J | K5 | Jini | 13 (move) | K4-seam-1.J, K4-seam-10.J, K5-platform-mail-2.J | B63 | 79 min |  |
| K5-members-1.J | K5 | Jini | 13 (move) | K4-seam-1.J, K4-seam-5.J, K5-platform-mail-2.J, K4-seam-4.J | B63 | 79 min |  |
| K5-domain-dns-1.J | K5 | Jini | 10 (move) | K4-seam-1.J, K4-seam-5.J, K4-seam-20.J, K5-platform-mail-2.J | B63 | 79 min |  |
| RT-K1-adm-system-2.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, K4-seam-23.J, K5-contracts-core-3.J, K5-platform-mail-2.J | B63 | 103 min |  |
| RT-K1-adm-external-mcp-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-external-mcp-2.J, RT-K1-0.T | B63 | 45 min | 1,416 |
| K5-workspace-1.T | K5 | Tovu | 2 (delete + repoint) | K5-workspace-1.J | B63 | 33 min | 1,416 |
| K5-contracts-core-8.J | K5 | Jini | 2 (move) | K5-contracts-core-4.J, K5-deployments-1.J, K5-domain-dns-1.J, K4-contracts-core-5.J, K5-members-1.J, K5-newsletter-1.J, K5-publish-content-1.J, K5-contracts-core-6.J, K5-site-backup-1.J, K5-source-control-1.J, K5-theme-1.J, K4-seam-1.J, K5-contracts-core-7.J | B64 | 97 min |  |
| RT-K1-adm-comments-2.J | RT-K1 | Jini | 1 (move) | K5-comments-1.J, RT-K1-adm-comments-1.J, RT-K1-0.J | B64 | 37 min |  |
| RT-K1-adm-external-mcp-5.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-external-mcp-5.J, RT-K1-0.T | B64 | 34 min | 1,384 |
| RT-K1-adm-system-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-system-2.J, RT-K1-0.T, K4-seam-23.T | B64 | 45 min | 1,384 |
| K5-members-1.T | K5 | Tovu | 13 (delete + repoint) | K5-members-1.J, K4-seam-1.T, K4-seam-5.T, K4-seam-4.T | B64 | 104 min | 1,384 |
| K5-newsletter-1.T | K5 | Tovu | 13 (delete + repoint) | K5-newsletter-1.J, K4-seam-1.T, K4-seam-10.T | B64 | 106 min | 1,384 |
| V-contracts-core-9.J | V | Jini | 1 (move) | K5-contracts-core-8.J, K5-contracts-core-7.J | B65 | 22 min |  |
| RT-K1-adm-content-1.J | RT-K1 | Jini | 1 (move) | RT-K1-0.J | B65 | 39 min |  |
| RT-K1-adm-commerce-1.J | RT-K1 | Jini | 1 (move) | RT-K1-0.J, K4-seam-22.J | B65 | 44 min |  |
| RT-K1-adm-comments-2.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-comments-2.J, RT-K1-0.T | B65 | 20 min | 1,371 |
| K5-contracts-core-8.T | K5 | Tovu | 2 (delete + repoint) | K5-contracts-core-8.J, K4-contracts-core-5.T, K4-seam-1.T | B65 | 74 min | 1,371 |
| K5-domain-dns-1.T | K5 | Tovu | 10 (delete + repoint) | K5-domain-dns-1.J, K4-seam-1.T, K4-seam-5.T, K4-seam-20.T | B65 | 60 min | 1,371 |
| K5-newsletter-2.J | K5 | Jini | 11 (move) | K5-newsletter-1.J, K4-seam-1.J, K5-contracts-core-2.J, V-contracts-core-9.J, K5-platform-mail-2.J | B66 | 97 min |  |
| RT-K1-adm-workspace-1.J | RT-K1 | Jini | 5 (move) | RT-K1-0.J, K5-workspace-1.J, V-contracts-core-9.J | B66 | 91 min |  |
| RT-K1-adm-content-types-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, X-content-types-1.J, V-contracts-core-9.J | B66 | 88 min |  |
| RT-K1-adm-commerce-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-commerce-1.J, RT-K1-0.T, K4-seam-22.T | B66 | 23 min | 1,368 |
| RT-K1-adm-content-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-content-1.J, RT-K1-0.T | B66 | 55 min | 1,368 |
| K5-platform-mail-2.T | K5 | Tovu | 1 (delete + repoint) | K5-platform-mail-2.J, K4-seam-4.T | B66 | 59 min | 1,368 |
| K5-members-2.J | K5 | Jini | 10 (move) | K5-members-1.J, K4-seam-20.J, K5-platform-mail-2.J, K5-newsletter-2.J, K4-seam-3.J | B67 | 94 min |  |
| K5-contracts-core-10.J | K5 | Jini | 4 (move) | K5-contracts-headless-2.J, K4-seam-1.J, V-contracts-core-9.J, K5-contracts-core-8.J, K4-seam-13.J | B67 | 56 min |  |
| RT-K1-adm-entries-1.J | RT-K1 | Jini | 4 (move) | RT-K1-adm-content-types-1.J, RT-K1-0.J, V-contracts-core-9.J | B67 | 89 min |  |
| RT-K1-adm-content-types-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-content-types-1.J, RT-K1-0.T | B67 | 47 min | 1,348 |
| RT-K1-adm-workspace-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-workspace-1.J, RT-K1-0.T | B67 | 49 min | 1,348 |
| K5-newsletter-2.T | K5 | Tovu | 11 (delete + repoint) | K5-newsletter-2.J, K4-seam-1.T | B67 | 85 min | 1,348 |
| K5-taxonomy-1.J | K5 | Jini | 8 (move) | K4-seam-7.J, K4-publish-content-2.J, K4-seam-5.J, K5-publish-content-3.J, K5-contracts-core-6.J, K5-contracts-core-4.J, K5-contracts-core-10.J, C-platform-html-1.J | B68 | 82 min |  |
| K5-project-keys-1.J | K5 | Jini | 8 (move) | K4-seam-13.J, K4-seam-1.J, K5-contracts-core-2.J, K4-seam-10.J, K5-api-connections-1.J, K5-contracts-core-10.J, K5-contracts-core-4.J, K4-seam-20.J | B68 | 81 min |  |
| K5-fs-files-1.J | K5 | Jini | 7 (move) | X-fs-files-1.J, X-identity-1.J, K4-contracts-core-5.J, K5-contracts-core-10.J | B68 | 80 min |  |
| K5-agent-plugins-5.J | K5 | Jini | 10 (move) | K5-agent-plugins-4.J, X-agent-plugins-1.J, K4-seam-15.J, K5-contracts-core-10.J, K4-seam-19.J | B68 | 65 min |  |
| RT-K1-adm-entries-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-entries-1.J, RT-K1-0.T | B68 | 38 min | 1,334 |
| K5-members-2.T | K5 | Tovu | 10 (delete + repoint) | K5-members-2.J, K4-seam-20.T, K4-seam-3.T | B68 | 68 min | 1,334 |
| K5-identity-2.J | K5 | Jini | 5 (move) | K5-identity-1.J, X-identity-1.J, K5-contracts-core-10.J, K4-contracts-core-5.J, K5-contracts-headless-2.J | B69 | 80 min |  |
| K5-entries-1.J | K5 | Jini | 5 (move) | K4-publish-content-2.J, K5-publish-content-1.J, K5-publish-content-3.J, K5-taxonomy-1.J, K4-seam-5.J, X-content-types-1.J, K5-contracts-core-3.J, X-entries-1.J, K5-contracts-core-1.J, K4-trash-2.J | B69 | 66 min |  |
| K5-database-1.J | K5 | Jini | 6 (move) | K4-seam-7.J, K5-contracts-core-4.J, K5-contracts-core-2.J, K5-contracts-core-10.J | B69 | 75 min |  |
| K5-custom-credentials-2.J | K5 | Jini | 7 (move) | K5-project-keys-1.J, K5-custom-credentials-1.J, K4-seam-15.J, K5-source-control-1.J, K5-contracts-core-4.J, K4-seam-1.J, K4-seam-5.J | B69 | 95 min |  |
| K5-agent-plugins-6.J | K5 | Jini | 10 (move) | K5-agent-plugins-5.J, K5-contracts-core-4.J, V-agent-plugins-2.J, K5-agent-plugins-4.J, K5-agent-plugins-3.J, K5-contracts-headless-2.J, K4-seam-10.J, K5-api-connections-1.J, K4-seam-19.J, K5-agent-plugins-1.J, K4-contracts-headless-1.J, X-agent-plugins-1.J, K4-seam-14.J | B69 | 97 min |  |
| K5-agent-plugins-5.T | K5 | Tovu | 10 (delete + repoint) | K5-agent-plugins-5.J, K4-seam-15.T, K4-seam-19.T | B69 | 109 min | 1,324 |
| K5-custom-credentials-3.J | K5 | Jini | 6 (move) | K5-contracts-core-4.J, K5-contracts-headless-2.J, K4-seam-15.J, K5-custom-credentials-2.J, K4-seam-10.J, K5-custom-credentials-1.J, K5-project-keys-1.J, K5-contracts-core-2.J, K5-contracts-core-10.J | B70 | 71 min |  |
| K5-agent-plugins-7.J | K5 | Jini | 12 (move) | K5-agent-plugins-6.J, K4-contracts-headless-1.J, V-agent-plugins-2.J, K5-contracts-core-3.J, K5-agent-plugins-4.J, X-agent-plugins-1.J, K5-contracts-headless-2.J, K5-contracts-core-10.J, K5-agent-plugins-5.J, K4-seam-1.J, K5-agent-plugins-1.J, K5-api-connections-1.J | B70 | 89 min |  |
| RT-K1-adm-taxonomy-1.J | RT-K1 | Jini | 4 (move) | RT-K1-0.J, K5-taxonomy-1.J | B70 | 102 min |  |
| RT-K1-adm-api-keys-1.J | RT-K1 | Jini | 4 (move) | X-identity-1.J, K4-seam-5.J, X-identity-2.J, K5-identity-2.J, RT-K1-0.J | B70 | 96 min |  |
| K5-agent-plugins-6.T | K5 | Tovu | 10 (delete + repoint) | K5-agent-plugins-6.J, K4-seam-10.T, K4-seam-19.T, K4-contracts-headless-1.T, K4-seam-14.T | B70 | 97 min | 1,306 |
| K5-taxonomy-1.T | K5 | Tovu | 8 (delete + repoint) | K5-taxonomy-1.J, K4-seam-7.T, K4-publish-content-2.T, K4-seam-5.T | B70 | 63 min | 1,306 |
| K5-agent-plugins-8.J | K5 | Jini | 12 (move) | K5-agent-plugins-7.J, V-agent-plugins-2.J, K5-agent-plugins-6.J, K5-contracts-headless-2.J, K5-agent-plugins-1.J, K5-agent-plugins-5.J, K4-seam-1.J, K5-contracts-core-4.J, K4-contracts-headless-1.J, X-agent-plugins-1.J, K5-contracts-core-2.J, K5-contracts-core-10.J, K5-agent-plugins-4.J, K4-seam-10.J | B71 | 85 min |  |
| RT-K1-adm-api-keys-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-api-keys-1.J, K4-seam-5.T, RT-K1-0.T | B71 | 49 min | 1,278 |
| RT-K1-adm-taxonomy-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-taxonomy-1.J, RT-K1-0.T | B71 | 55 min | 1,278 |
| K5-agent-plugins-7.T | K5 | Tovu | 12 (delete + repoint) | K5-agent-plugins-7.J, K4-contracts-headless-1.T, K4-seam-1.T | B71 | 109 min | 1,278 |
| V-contracts-core-9.T | V | Tovu | 1 (delete + repoint) | V-contracts-core-9.J | B71 | 113 min | 1,278 |
| K5-custom-credentials-2.T | K5 | Tovu | 7 (delete + repoint) | K5-custom-credentials-2.J, K4-seam-15.T, K4-seam-1.T, K4-seam-5.T | B71 | 95 min | 1,278 |
| K5-recovery-1.J | K5 | Jini | 4 (move) | K4-seam-5.J, K4-contracts-core-5.J, K5-contracts-core-2.J, K5-contracts-core-10.J, K5-database-1.J, K4-seam-7.J | B72 | 75 min |  |
| K5-mail-1.J | K5 | Jini | 12 (move) | K4-seam-4.J, K4-seam-5.J, K5-platform-mail-2.J, K4-seam-13.J, K5-custom-credentials-3.J | B72 | 87 min |  |
| K5-form-destinations-1.J | K5 | Jini | 7 (move) | K4-seam-13.J, K5-custom-credentials-3.J, X-form-destinations-1.J, K5-agent-plugins-4.J | B72 | 64 min |  |
| K5-api-connections-2.J | K5 | Jini | 8 (move) | K5-custom-credentials-3.J, K5-api-connections-1.J, K5-project-keys-1.J, K5-agent-plugins-4.J, K5-contracts-core-3.J, K4-seam-6.J, K4-seam-15.J, K4-seam-8.J | B72 | 79 min |  |
| K5-agent-plugins-8.T | K5 | Tovu | 12 (delete + repoint) | K5-agent-plugins-8.J, K4-seam-1.T, K4-contracts-headless-1.T, K4-seam-10.T | B72 | 86 min | 1,261 |
| K5-entries-1.T | K5 | Tovu | 5 (delete + repoint) | K5-entries-1.J, K4-publish-content-2.T, K4-seam-5.T, K4-trash-2.T | B72 | 49 min | 1,261 |
| K5-mail-status-1.J | K5 | Jini | 6 (move) | K5-platform-mail-2.J, K4-seam-13.J, X-mail-status-1.J, K4-seam-4.J, K5-custom-credentials-3.J, K5-project-keys-1.J, K5-newsletter-2.J, K4-seam-6.J, K5-mail-1.J, K4-contracts-core-5.J, K5-contracts-core-10.J, K4-seam-1.J | B73 | 81 min |  |
| RT-K1-adm-taxonomy-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-taxonomy-1.J, RT-K1-0.J | B73 | 71 min |  |
| K5-contracts-core-10.T | K5 | Tovu | 4 (delete + repoint) | K5-contracts-core-10.J, K4-seam-1.T, K4-seam-13.T | B73 | 69 min | 1,231 |
| K5-form-destinations-1.T | K5 | Tovu | 7 (delete + repoint) | K5-form-destinations-1.J, K4-seam-13.T | B73 | 49 min | 1,231 |
| K5-fs-files-1.T | K5 | Tovu | 7 (delete + repoint) | K5-fs-files-1.J, K4-contracts-core-5.T | B73 | 76 min | 1,231 |
| K5-mail-1.T | K5 | Tovu | 12 (delete + repoint) | K5-mail-1.J, K4-seam-4.T, K4-seam-5.T, K4-seam-13.T | B73 | 55 min | 1,231 |
| K5-mail-status-2.J | K5 | Jini | 2 (move) | K4-contracts-core-5.J, K5-contracts-core-7.J, K5-platform-mail-2.J, X-mail-status-1.J, K5-mail-status-1.J, K5-agent-plugins-8.J, K5-custom-credentials-1.J, K4-seam-1.J, K5-contracts-core-10.J | B74 | 60 min |  |
| K5-deployments-3.J | K5 | Jini | 3 (move) | K5-agent-plugins-5.J, K5-agent-plugins-4.J, K5-deployments-1.J, K4-seam-6.J | B74 | 72 min |  |
| RT-K1-adm-users-1.J | RT-K1 | Jini | 3 (move) | K4-seam-5.J, K5-identity-2.J, X-identity-1.J, K4-seam-14.J, RT-K1-0.J | B74 | 80 min |  |
| RT-K1-adm-agent-plugins-1.J | RT-K1 | Jini | 2 (move) | K5-agent-plugins-4.J, K5-agent-plugins-6.J, RT-K1-0.J, K4-seam-16.J, K5-contracts-headless-2.J, K5-agent-plugins-7.J, K5-agent-plugins-5.J | B74 | 93 min |  |
| RT-K1-adm-taxonomy-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-taxonomy-2.J, RT-K1-0.T | B74 | 34 min | 1,220 |
| K5-api-connections-2.T | K5 | Tovu | 8 (delete + repoint) | K5-api-connections-2.J, K4-seam-6.T, K4-seam-15.T, K4-seam-8.T | B74 | 64 min | 1,220 |
| RT-K1-adm-users-5.J | RT-K1 | Jini | 3 (move) | X-identity-1.J, RT-K1-adm-users-1.J, RT-K1-0.J | B75 | 103 min |  |
| RT-K1-adm-users-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-users-1.J, RT-K1-0.J | B75 | 101 min |  |
| RT-K1-adm-agent-plugins-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-agent-plugins-1.J, RT-K1-0.T, K4-seam-16.T | B75 | 53 min | 1,204 |
| RT-K1-adm-users-1.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-users-1.J, K4-seam-5.T, K4-seam-14.T, RT-K1-0.T | B75 | 80 min | 1,204 |
| K5-deployments-3.T | K5 | Tovu | 3 (delete + repoint) | K5-deployments-3.J, K4-seam-6.T | B75 | 59 min | 1,204 |
| K5-project-keys-1.T | K5 | Tovu | 8 (delete + repoint) | K5-project-keys-1.J, K4-seam-13.T, K4-seam-1.T, K4-seam-10.T, K4-seam-20.T | B75 | 83 min | 1,204 |
| V-members-3.J | V | Jini | 1 (move) | K5-members-1.J, K5-platform-mail-2.J, K5-members-2.J | B76 | 23 min |  |
| K5-external-mcp-4.J | K5 | Jini | 1 (move) | K5-contracts-core-3.J, K5-contracts-core-4.J, K5-contracts-core-7.J, K5-contracts-core-1.J, K5-contracts-core-10.J, K5-external-mcp-2.J, K5-external-mcp-1.J, K5-external-mcp-3.J, X-external-mcp-1.J | B76 | 53 min |  |
| RT-K1-adm-users-6.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-users-1.J, RT-K1-0.J, X-identity-1.J | B76 | 77 min |  |
| RT-K1-adm-agent-plugins-3.J | RT-K1 | Jini | 2 (move) | K5-agent-plugins-4.J, RT-K1-adm-agent-plugins-1.J, RT-K1-0.J, K5-agent-plugins-3.J | B76 | 90 min |  |
| RT-K1-adm-users-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-users-2.J, RT-K1-0.T | B76 | 49 min | 1,195 |
| K5-custom-credentials-3.T | K5 | Tovu | 6 (delete + repoint) | K5-custom-credentials-3.J, K4-seam-15.T, K4-seam-10.T | B76 | 83 min | 1,195 |
| K5-site-search-1.J | K5 | Jini | 3 (move) | K4-seam-5.J, K5-platform-routing-1.J, K5-contracts-core-3.J, K5-post-3.J, V-members-3.J | B77 | 61 min |  |
| K5-member-login-1.J | K5 | Jini | 7 (move) | K4-seam-1.J, K5-contracts-headless-2.J, K5-custom-credentials-3.J, K4-seam-15.J, V-members-3.J, K5-agent-plugins-5.J, K5-agent-plugins-4.J | B77 | 78 min |  |
| RT-K1-adm-members-1.J | RT-K1 | Jini | 4 (move) | V-members-3.J, K5-contracts-core-3.J, RT-K1-0.J | B77 | 91 min |  |
| RT-K1-adm-agent-plugins-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-agent-plugins-3.J, RT-K1-0.T | B77 | 49 min | 1,184 |
| RT-K1-adm-users-5.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-users-5.J, RT-K1-0.T | B77 | 52 min | 1,184 |
| K5-database-1.T | K5 | Tovu | 6 (delete + repoint) | K5-database-1.J, K4-seam-7.T | B77 | 51 min | 1,184 |
| RT-K1-adm-members-2.J | RT-K1 | Jini | 3 (move) | V-members-3.J, RT-K1-adm-members-1.J, RT-K1-0.J, K5-platform-mail-2.J | B78 | 87 min |  |
| RT-K1-adm-agent-plugins-4.J | RT-K1 | Jini | 2 (move) | K5-agent-plugins-7.J, K5-agent-plugins-4.J, K5-agent-plugins-6.J, K5-agent-plugins-8.J, RT-K1-adm-agent-plugins-1.J, RT-K1-0.J | B78 | 102 min |  |
| RT-K1-adm-users-6.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-users-6.J, RT-K1-0.T | B78 | 36 min | 1,165 |
| K5-mail-status-1.T | K5 | Tovu | 6 (delete + repoint) | K5-mail-status-1.J, K4-seam-13.T, K4-seam-4.T, K4-seam-6.T, K4-contracts-core-5.T, K4-seam-1.T | B78 | 49 min | 1,165 |
| K5-member-login-1.T | K5 | Tovu | 7 (delete + repoint) | K5-member-login-1.J, K4-seam-1.T, K4-seam-15.T | B78 | 49 min | 1,165 |
| K5-site-search-1.T | K5 | Tovu | 3 (delete + repoint) | K5-site-search-1.J, K4-seam-5.T | B78 | 31 min | 1,165 |
| K5-newsletter-3.J | K5 | Jini | 1 (move) | K5-newsletter-1.J, K5-contracts-core-2.J, K5-contracts-core-10.J, K5-newsletter-2.J | B79 | 49 min |  |
| RT-K1-adm-newsletter-1.J | RT-K1 | Jini | 2 (move) | K5-newsletter-2.J, RT-K1-0.J, K4-seam-5.J, K5-newsletter-1.J, K4-seam-1.J | B79 | 83 min |  |
| RT-K1-adm-fs-files-1.J | RT-K1 | Jini | 2 (move) | K5-fs-files-1.J, X-fs-files-1.J, RT-K1-0.J | B79 | 56 min |  |
| RT-K1-adm-agent-plugins-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-agent-plugins-4.J, RT-K1-0.T | B79 | 53 min | 1,154 |
| RT-K1-adm-members-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-members-1.J, RT-K1-0.T | B79 | 53 min | 1,154 |
| K5-identity-2.T | K5 | Tovu | 5 (delete + repoint) | K5-identity-2.J, K4-contracts-core-5.T | B79 | 68 min | 1,154 |
| RT-K1-adm-newsletter-4.J | RT-K1 | Jini | 4 (move) | K5-newsletter-2.J, RT-K1-adm-newsletter-1.J, RT-K1-0.J | B80 | 97 min |  |
| RT-K1-adm-newsletter-2.J | RT-K1 | Jini | 3 (move) | K5-newsletter-1.J, RT-K1-adm-newsletter-1.J, RT-K1-0.J | B80 | 86 min |  |
| RT-K1-adm-fs-files-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-fs-files-1.J, RT-K1-0.T | B80 | 27 min | 1,143 |
| RT-K1-adm-members-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-members-2.J, RT-K1-0.T | B80 | 42 min | 1,143 |
| RT-K1-adm-newsletter-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-newsletter-1.J, RT-K1-0.T, K4-seam-5.T, K4-seam-1.T | B80 | 87 min | 1,143 |
| K5-recovery-1.T | K5 | Tovu | 4 (delete + repoint) | K5-recovery-1.J, K4-seam-5.T, K4-contracts-core-5.T, K4-seam-7.T | B80 | 44 min | 1,143 |
| K5-web-screenshot-2.J | K5 | Jini | 1 (move) | K5-contracts-core-6.J, K5-web-screenshot-1.J | B81 | 27 min |  |
| RT-K1-adm-newsletter-5.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-newsletter-1.J, RT-K1-0.J, K5-newsletter-2.J | B81 | 85 min |  |
| RT-K1-adm-newsletter-3.J | RT-K1 | Jini | 3 (move) | K5-newsletter-1.J, RT-K1-adm-newsletter-1.J, RT-K1-0.J, K5-newsletter-2.J | B81 | 85 min |  |
| RT-K1-adm-newsletter-4.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-newsletter-4.J, RT-K1-0.T | B81 | 43 min | 1,136 |
| K5-mail-status-2.T | K5 | Tovu | 2 (delete + repoint) | K5-mail-status-2.J, K4-contracts-core-5.T, K4-seam-1.T | B81 | 39 min | 1,136 |
| V-members-3.T | V | Tovu | 1 (delete + repoint) | V-members-3.J | B81 | 66 min | 1,136 |
| K5-webhooks-3.J | K5 | Jini | 1 (move) | K5-webhooks-1.J | B82 | 27 min |  |
| K5-webhooks-2.J | K5 | Jini | 1 (move) | K5-webhooks-1.J, K4-seam-11.J | B82 | 30 min |  |
| RT-K1-adm-newsletter-7.J | RT-K1 | Jini | 3 (move) | K5-newsletter-2.J, RT-K1-adm-newsletter-1.J, RT-K1-0.J, K5-newsletter-1.J | B82 | 95 min |  |
| RT-K1-adm-newsletter-6.J | RT-K1 | Jini | 3 (move) | K5-newsletter-1.J, K5-newsletter-2.J, RT-K1-adm-newsletter-1.J, RT-K1-0.J | B82 | 91 min |  |
| RT-K1-adm-newsletter-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-newsletter-2.J, RT-K1-0.T | B82 | 40 min | 1,132 |
| K5-external-mcp-4.T | K5 | Tovu | 1 (delete + repoint) | K5-external-mcp-4.J | B82 | 32 min | 1,132 |
| K5-webhooks-4.J | K5 | Jini | 3 (move) | K5-webhooks-1.J, X-webhooks-1.J, K5-webhooks-3.J, K5-webhooks-2.J, K4-seam-11.J, K5-contracts-core-4.J, K5-contracts-core-10.J, K5-contracts-core-6.J | B83 | 67 min |  |
| RT-K1-adm-taxonomy-3.J | RT-K1 | Jini | 2 (move) | K5-taxonomy-1.J, RT-K1-0.J, RT-K1-adm-taxonomy-1.J | B83 | 86 min |  |
| RT-K1-adm-system-3.J | RT-K1 | Jini | 2 (move) | K5-server-logs-1.J, RT-K1-0.J, K5-mail-status-1.J | B83 | 69 min |  |
| RT-K1-adm-newsletter-3.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-newsletter-3.J, RT-K1-0.T | B83 | 40 min | 1,127 |
| K5-newsletter-3.T | K5 | Tovu | 1 (delete + repoint) | K5-newsletter-3.J | B83 | 32 min | 1,127 |
| K5-webhooks-2.T | K5 | Tovu | 1 (delete + repoint) | K5-webhooks-2.J, K4-seam-11.T | B83 | 120 min | 1,127 |
| K5-publish-content-4.J | K5 | Jini | 10 (move) | K5-publish-content-1.J, K5-publish-content-3.J, K4-publish-content-2.J, K4-seam-7.J, K4-seam-21.J, K5-webhooks-4.J, K4-seam-1.J, K5-publish-trust-1.J, K4-seam-2.J | B84 | 95 min |  |
| K5-media-1.J | K5 | Jini | 11 (move) | K4-seam-3.J, X-media-1.J, K4-contracts-core-5.J, K4-seam-15.J, X-content-duplication-1.J, K4-seam-10.J, K5-webhooks-4.J, K5-contracts-headless-2.J, K5-contracts-core-10.J, K4-seam-5.J | B84 | 94 min |  |
| K5-database-transfer-1.J | K5 | Jini | 8 (move) | X-database-transfer-1.J, K5-webhooks-4.J, K4-seam-1.J, K5-contracts-headless-2.J, K4-seam-13.J, K5-contracts-core-10.J | B84 | 91 min |  |
| RT-K1-adm-newsletter-5.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-newsletter-5.J, RT-K1-0.T | B84 | 41 min | 1,119 |
| RT-K1-adm-taxonomy-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-taxonomy-3.J, RT-K1-0.T | B84 | 42 min | 1,119 |
| K5-webhooks-4.T | K5 | Tovu | 3 (delete + repoint) | K5-webhooks-4.J, K4-seam-11.T | B84 | 81 min | 1,119 |
| K5-vendor-credentials-1.J | K5 | Jini | 6 (move) | K4-seam-5.J, K5-webhooks-4.J, K5-source-control-1.J, X-vendor-credentials-1.J | B85 | 63 min |  |
| RT-K1-adm-integrations-1.J | RT-K1 | Jini | 4 (move) | K5-webhooks-4.J, RT-K1-0.J | B85 | 92 min |  |
| RT-K1-adm-newsletter-6.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-newsletter-6.J, RT-K1-0.T | B85 | 43 min | 1,102 |
| RT-K1-adm-system-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-3.J, RT-K1-0.T | B85 | 34 min | 1,102 |
| K5-media-1.T | K5 | Tovu | 11 (delete + repoint) | K5-media-1.J, K4-seam-3.T, K4-contracts-core-5.T, K4-seam-15.T, K4-seam-10.T, K4-seam-5.T | B85 | 59 min | 1,102 |
| K5-web-screenshot-2.T | K5 | Tovu | 1 (delete + repoint) | K5-web-screenshot-2.J | B85 | 20 min | 1,102 |
| K5-source-control-2.J | K5 | Jini | 4 (move) | K5-agent-plugins-5.J, X-agent-plugins-1.J, K5-agent-plugins-4.J, K5-source-control-1.J, K4-seam-2.J, K5-contracts-core-1.J, K5-vendor-credentials-1.J, K4-seam-1.J, K5-custom-credentials-2.J, K5-contracts-core-2.J | B86 | 96 min |  |
| K5-deployments-2.J | K5 | Jini | 8 (move) | K5-deployments-1.J, K4-seam-3.J, K5-contracts-core-7.J, K5-publish-content-4.J, K5-webhooks-4.J, K5-contracts-headless-2.J, K5-custom-credentials-3.J, K5-contracts-core-10.J, K5-vendor-credentials-1.J | B86 | 98 min |  |
| RT-K1-adm-integrations-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-integrations-1.J, RT-K1-0.T | B86 | 53 min | 1,079 |
| RT-K1-adm-newsletter-7.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-newsletter-7.J, RT-K1-0.T | B86 | 43 min | 1,079 |
| K5-publish-content-4.T | K5 | Tovu | 10 (delete + repoint) | K5-publish-content-4.J, K4-publish-content-2.T, K4-seam-7.T, K4-seam-21.T, K4-seam-1.T, K4-seam-2.T | B86 | 91 min | 1,079 |
| K5-vendor-credentials-1.T | K5 | Tovu | 6 (delete + repoint) | K5-vendor-credentials-1.J, K4-seam-5.T | B86 | 55 min | 1,079 |
| K5-source-control-3.J | K5 | Jini | 3 (move) | K5-contracts-core-2.J, K5-custom-credentials-1.J, X-vendor-credentials-1.J, K5-contracts-headless-2.J, K5-contracts-core-1.J, K5-contracts-core-10.J, K5-source-control-2.J, K5-source-control-1.J, K5-custom-credentials-3.J, K4-seam-1.J, K4-seam-2.J | B87 | 94 min |  |
| K5-deployments-4.J | K5 | Jini | 7 (move) | K5-contracts-core-1.J, K5-vendor-credentials-1.J, K5-deployments-1.J, K4-seam-5.J, K4-seam-1.J, K5-deployments-3.J, K5-deployments-2.J, K5-contracts-core-10.J, X-identity-2.J | B87 | 95 min |  |
| RT-K1-adm-users-3.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-users-1.J, X-identity-1.J, RT-K1-0.J | B87 | 80 min |  |
| RT-K1-adm-integrations-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-integrations-1.J, RT-K1-0.J, K5-webhooks-4.J | B87 | 79 min |  |
| K5-database-transfer-1.T | K5 | Tovu | 8 (delete + repoint) | K5-database-transfer-1.J, K4-seam-1.T, K4-seam-13.T | B87 | 62 min | 1,067 |
| K5-source-control-2.T | K5 | Tovu | 4 (delete + repoint) | K5-source-control-2.J, K4-seam-2.T, K4-seam-1.T | B87 | 83 min | 1,067 |
| K5-custom-credentials-4.J | K5 | Jini | 1 (move) | X-vendor-credentials-1.J, K5-custom-credentials-1.J, K5-deployments-1.J, K5-contracts-core-4.J, K5-contracts-headless-2.J, K5-contracts-core-1.J, K5-contracts-core-10.J, K5-contracts-core-2.J, K5-custom-credentials-2.J, K5-custom-credentials-3.J, K5-source-control-2.J, K4-seam-1.J, K4-seam-2.J | B88 | 58 min |  |
| RT-K1-adm-users-4.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-users-1.J, RT-K1-0.J, X-identity-1.J | B88 | 80 min |  |
| RT-K1-adm-system-10.J | RT-K1 | Jini | 2 (move) | K5-deployments-4.J, K5-custom-credentials-3.J, RT-K1-0.J, K5-source-control-3.J | B88 | 88 min |  |
| RT-K1-adm-integrations-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-integrations-2.J, RT-K1-0.T | B88 | 36 min | 1,054 |
| RT-K1-adm-users-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-users-3.J, RT-K1-0.T | B88 | 41 min | 1,054 |
| K5-deployments-2.T | K5 | Tovu | 8 (delete + repoint) | K5-deployments-2.J, K4-seam-3.T | B88 | 86 min | 1,054 |
| K5-database-transfer-2.J | K5 | Jini | 1 (move) | K5-contracts-core-4.J, K5-contracts-core-10.J, K5-database-transfer-1.J, K5-contracts-headless-2.J, K5-contracts-core-2.J, X-database-transfer-1.J, K4-seam-7.J | B89 | 43 min |  |
| RT-K1-adm-users-8.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-users-1.J, RT-K1-0.J | B89 | 74 min |  |
| RT-K1-adm-users-7.J | RT-K1 | Jini | 2 (move) | X-identity-1.J, RT-K1-adm-users-1.J, RT-K1-0.J | B89 | 90 min |  |
| RT-K1-adm-system-10.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-10.J, RT-K1-0.T | B89 | 44 min | 1,043 |
| RT-K1-adm-users-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-users-4.J, RT-K1-0.T | B89 | 42 min | 1,043 |
| K5-deployments-4.T | K5 | Tovu | 7 (delete + repoint) | K5-deployments-4.J, K4-seam-5.T, K4-seam-1.T | B89 | 94 min | 1,043 |
| A-adm-roles-1.J | P9 (A) | Jini | 1 (move) | — | B90 | 60 min |  |
| A-adm-members-1.J | P9 (A) | Jini | 1 (move) | — | B90 | 60 min |  |
| RT-K1-adm-workspace-2.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-workspace-1.J, RT-K1-0.J, K5-workspace-1.J | B90 | 54 min |  |
| RT-K1-adm-users-9.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-users-1.J, X-identity-1.J, RT-K1-0.J | B90 | 81 min |  |
| RT-K1-adm-users-7.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-users-7.J, RT-K1-0.T | B90 | 49 min | 1,038 |
| K5-source-control-3.T | K5 | Tovu | 3 (delete + repoint) | K5-source-control-3.J, K4-seam-1.T, K4-seam-2.T | B90 | 60 min | 1,038 |
| A-K2-roles-1.J | A-K2 | Jini | 16 (move) | A-adm-shell-lib-2.J, K4-i18n-common.J, A-adm-shell-components-1.J, A-adm-shell-lib-3.J, A-K2-0.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-roles-1.J, K4-seam-6.J | B91 | 86 min |  |
| RT-K1-adm-users-8.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-users-8.J, RT-K1-0.T | B91 | 38 min | 1,031 |
| RT-K1-adm-workspace-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-workspace-2.J, RT-K1-0.T | B91 | 27 min | 1,031 |
| K5-custom-credentials-4.T | K5 | Tovu | 1 (delete + repoint) | K5-custom-credentials-4.J, K4-seam-1.T, K4-seam-2.T | B91 | 40 min | 1,031 |
| A-adm-members-1.T | P9 (A) | Tovu | 1 (delete + repoint) | A-adm-members-1.J | B91 | 60 min | 1,031 |
| A-adm-roles-1.T | P9 (A) | Tovu | 1 (delete + repoint) | A-adm-roles-1.J | B91 | 60 min | 1,031 |
| K5-media-2.J | K5 | Jini | 2 (move) | K5-media-1.J, K5-contracts-core-1.J, K5-webhooks-4.J, K4-seam-1.J | B92 | 56 min |  |
| A-K2-roles-2.J | A-K2 | Jini | 2 (move) | A-adm-roles-1.J, A-K2-roles-1.J | B92 | 27 min |  |
| A-K2-roles-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-roles-1.J, K4-i18n-common.T, A-K2-0.T, K4-seam-6.T | B92 | 49 min | 1,011 |
| RT-K1-adm-users-9.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-users-9.J, RT-K1-0.T | B92 | 43 min | 1,011 |
| K5-database-transfer-2.T | K5 | Tovu | 1 (delete + repoint) | K5-database-transfer-2.J, K4-seam-7.T | B92 | 29 min | 1,011 |
| K5-webhooks-3.T | K5 | Tovu | 1 (delete + repoint) | K5-webhooks-3.J | B92 | 119 min | 1,011 |
| A-adm-users-1.J | P9 (A) | Jini | 1 (move) | — | B93 | 60 min |  |
| A-adm-source-control-1.J | P9 (A) | Jini | 1 (move) | A-adm-shell-lib-3.J | B93 | 60 min |  |
| K5-settings-4.J | K5 | Jini | 2 (move) | K5-contracts-core-10.J, K5-contracts-core-6.J, K5-settings-1.J, K5-settings-2.J, K4-seam-1.J, K4-seam-11.J, K5-contracts-headless-2.J, X-settings-1.J | B93 | 43 min |  |
| RT-K1-pub-agent-plugin-surfaces-1.J | RT-K1 | Jini | 2 (move) | K5-contracts-core-3.J, K5-agent-plugins-4.J, K5-agent-plugins-5.J, K4-seam-14.J | B93 | 70 min |  |
| A-K2-roles-2.T | A-K2 | Tovu | 2 (delete + repoint) | A-K2-roles-2.J | B93 | 17 min | 1,007 |
| K5-media-2.T | K5 | Tovu | 2 (delete + repoint) | K5-media-2.J, K4-seam-1.T | B93 | 44 min | 1,007 |
| A-adm-other-6.J | P9 (A) | Jini | 12 (move) | A-adm-other-3.J, A-adm-users-1.J, A-adm-other-4.J, A-adm-other-2.J, A-adm-other-5.J | B94 | 60 min |  |
| RT-K1-adm-agent-plugins-5.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-2.J, K5-agent-plugins-7.J, K5-agent-plugins-8.J, RT-K1-adm-agent-plugins-1.J, RT-K1-0.J | B94 | 78 min |  |
| RT-K1-pub-agent-plugin-surfaces-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-agent-plugin-surfaces-1.J, K4-seam-14.T | B94 | 33 min | 1,001 |
| K5-settings-4.T | K5 | Tovu | 2 (delete + repoint) | K5-settings-4.J, K4-seam-1.T, K4-seam-11.T | B94 | 26 min | 1,001 |
| A-adm-source-control-1.T | P9 (A) | Tovu | 1 (delete + repoint) | A-adm-source-control-1.J | B94 | 60 min | 1,001 |
| A-adm-users-1.T | P9 (A) | Tovu | 1 (delete + repoint) | A-adm-users-1.J | B94 | 60 min | 1,001 |
| RT-K1-adm-content-types-2.J | RT-K1 | Jini | 1 (move) | X-content-types-1.J, RT-K1-adm-content-types-1.J, RT-K1-0.J | B95 | 37 min |  |
| RT-K1-adm-api-keys-2.J | RT-K1 | Jini | 1 (move) | X-identity-2.J, RT-K1-adm-api-keys-1.J, RT-K1-0.J | B95 | 42 min |  |
| A-K2-menus-1.J | A-K2 | Jini | 8 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-2.J, A-adm-other-6.J, A-adm-shell-lib-3.J, A-K2-shell-lib-2.J, A-adm-other-5.J, C-platform-html-1.J, A-K2-0.J | B95 | 68 min |  |
| A-K2-integrations-1.J | A-K2 | Jini | 13 (move) | K4-i18n-common.J, A-adm-other-2.J, K4-seam-5.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-4.J, A-adm-shell-hooks-1.J, A-adm-other-6.J | B95 | 69 min |  |
| RT-K1-adm-agent-plugins-5.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-agent-plugins-5.J, RT-K1-0.T | B95 | 42 min | 988 |
| A-adm-other-6.T | P9 (A) | Tovu | 12 (delete + repoint) | A-adm-other-6.J | B95 | 60 min | 988 |
| RT-K1-adm-database-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-2.J, K5-database-1.J, RT-K1-0.J | B96 | 80 min |  |
| A-K2-plugins-2.J | A-K2 | Jini | 16 (move) | A-K2-plugins-1.J, A-adm-shell-components-1.J, A-K2-0.J, A-K2-integrations-1.J, A-adm-shell-lib-3.J, A-adm-other-5.J, A-K2-shell-components-3.J, A-adm-other-2.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, K4-seam-8.J | B96 | 80 min |  |
| A-K2-email-1.J | A-K2 | Jini | 16 (move) | A-adm-other-1.J, K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-K2-pages-1.J, A-K2-0.J, A-adm-shell-lib-3.J, A-K2-integrations-1.J | B96 | 74 min |  |
| A-K2-integrations-1.T | A-K2 | Tovu | 13 (delete + repoint) | A-K2-integrations-1.J, K4-i18n-common.T, K4-seam-5.T | B96 | 94 min | 973 |
| RT-K1-adm-api-keys-2.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-api-keys-2.J, RT-K1-0.T | B96 | 23 min | 973 |
| RT-K1-adm-content-types-2.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-content-types-2.J, RT-K1-0.T | B96 | 22 min | 973 |
| RT-K1-adm-external-mcp-3.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-external-mcp-1.J, RT-K1-0.J | B97 | 43 min |  |
| RT-K1-adm-database-recovery-1.J | RT-K1 | Jini | 1 (move) | RT-K1-0.J | B97 | 36 min |  |
| A-K2-settings-1.J | A-K2 | Jini | 16 (move) | K4-i18n-common.J, A-K2-0.J, A-K2-integrations-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-3.J, A-adm-other-3.J | B97 | 91 min |  |
| A-K2-providers-1.J | A-K2 | Jini | 10 (move) | K4-i18n-common.J, A-K2-integrations-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-2.J, A-adm-other-5.J, A-K2-0.J | B97 | 69 min |  |
| A-K2-email-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-email-1.J, K4-i18n-common.T, A-K2-0.T | B97 | 59 min | 956 |
| RT-K1-adm-database-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-database-1.J, RT-K1-0.T | B97 | 44 min | 956 |
| RT-K1-adm-database-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-database-recovery-1.J, RT-K1-0.J | B98 | 90 min |  |
| A-K2-security-1.J | A-K2 | Jini | 16 (move) | K4-seam-5.J, K4-seam-9.J, A-adm-shell-components-1.J, A-K2-0.J, A-K2-integrations-1.J, A-K2-media-1.J, K4-seam-8.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-K2-providers-1.J, SEC-adm-security-1.J | B98 | 94 min |  |
| A-K2-plugins-3.J | A-K2 | Jini | 16 (move) | A-K2-plugins-2.J, A-adm-shell-components-2.J, A-K2-integrations-1.J, A-K2-plugins-1.J, A-adm-other-2.J, A-K2-providers-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-1.J, A-adm-other-5.J, A-adm-shell-components-1.J, A-K2-shell-components-2.J, A-K2-0.J, A-adm-shell-hooks-1.J | B98 | 82 min |  |
| A-K2-plugins-2.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-plugins-2.J, A-K2-0.T, K4-seam-8.T | B98 | 65 min | 938 |
| RT-K1-adm-database-recovery-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-database-recovery-1.J, RT-K1-0.T | B98 | 24 min | 938 |
| RT-K1-adm-external-mcp-3.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-external-mcp-3.J, RT-K1-0.T | B98 | 24 min | 938 |
| RT-K1-adm-recovery-1.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-database-recovery-1.J, RT-K1-0.J | B99 | 85 min |  |
| A-K2-skills-1.J | A-K2 | Jini | 15 (move) | A-K2-0.J, A-adm-other-3.J, K4-i18n-common.J, A-K2-shell-lib-4.J, A-adm-shell-lib-1.J, A-adm-other-2.J, A-K2-plugins-3.J, A-K2-plugins-2.J, A-adm-other-5.J, A-adm-shell-components-2.J, A-K2-plugins-1.J | B99 | 91 min |  |
| A-K2-deployment-1.J | A-K2 | Jini | 16 (move) | A-K2-security-1.J, A-adm-shell-lib-3.J, K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-other-2.J, A-K2-import-export-1.J, A-adm-deployment-1.J, A-adm-shell-components-1.J, A-K2-0.J | B99 | 82 min |  |
| A-K2-plugins-3.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-plugins-3.J, A-K2-0.T | B99 | 59 min | 903 |
| A-K2-security-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-security-1.J, K4-seam-5.T, K4-seam-9.T, A-K2-0.T, K4-seam-8.T | B99 | 86 min | 903 |
| RT-K1-adm-database-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-database-2.J, RT-K1-0.T | B99 | 41 min | 903 |
| RT-K1-adm-recovery-2.J | RT-K1 | Jini | 2 (move) | K5-contracts-core-2.J, K5-recovery-1.J, RT-K1-0.J, RT-K1-adm-database-recovery-1.J | B100 | 97 min |  |
| A-K2-source-control-1.J | A-K2 | Jini | 11 (move) | A-adm-shell-lib-2.J, K4-i18n-common.J, A-adm-shell-components-1.J, A-K2-0.J, A-K2-deployment-1.J, K4-seam-5.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-K2-shell-lib-1.J, A-K2-shell-components-3.J, A-adm-shell-lib-3.J, A-adm-shell-lib-4.J, A-adm-source-control-1.J | B100 | 72 min |  |
| A-K2-shell-components-5.J | A-K2 | Jini | 12 (move) | A-adm-themes-1.J, A-adm-shell-components-2.J, A-adm-shell-components-1.J, A-K2-shell-components-4.J, A-K2-shell-components-3.J, A-K2-0.J, A-K2-shell-lib-4.J, A-K2-shell-lib-1.J, A-adm-shell-lib-1.J, A-adm-shell-lib-3.J, A-K2-plugins-1.J, A-adm-other-2.J, A-K2-skills-1.J, A-K2-media-1.J, A-K2-shell-components-2.J, A-adm-other-1.J, A-K2-collections-1.J, A-K2-menus-1.J, A-K2-forms-1.J, A-adm-other-3.J, A-K2-widgets-1.J | B100 | 98 min |  |
| A-K2-deployment-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-deployment-1.J, K4-i18n-common.T, A-K2-0.T | B100 | 77 min | 869 |
| A-K2-skills-1.T | A-K2 | Tovu | 15 (delete + repoint) | A-K2-skills-1.J, A-K2-0.T, K4-i18n-common.T | B100 | 56 min | 869 |
| RT-K1-adm-recovery-1.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-recovery-1.J, RT-K1-0.T | B100 | 40 min | 869 |
| RT-K1-adm-plugin-hook-error-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-2.J | B101 | 32 min |  |
| RT-K1-adm-owner-mfa-deps-1.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-users-1.J, RT-K1-0.J | B101 | 42 min |  |
| A-K2-shell-lib-6.J | A-K2 | Jini | 10 (move) | A-K2-shell-lib-4.J, A-adm-shell-lib-1.J, A-K2-integrations-1.J, A-K2-posts-1.J, A-K2-pages-1.J, A-K2-menus-1.J, A-K2-widgets-1.J, K4-seam-14.J, K5-contracts-headless-2.J, A-K2-settings-1.J, A-adm-shell-lib-3.J, K4-seam-8.J, A-K2-0.J, A-K2-themes-1.J, A-adm-shell-lib-4.J, A-K2-shell-lib-2.J, A-adm-shell-lib-2.J, K4-seam-17.J, K5-publish-content-ui-1.J | B101 | 84 min |  |
| A-K2-shell-lib-5.J | A-K2 | Jini | 12 (move) | A-adm-other-2.J, A-adm-shell-lib-3.J, A-adm-shell-lib-1.J, A-K2-shell-lib-3.J, A-K2-shell-lib-2.J, K5-contracts-core-1.J, A-K2-0.J, A-K2-shell-lib-4.J, A-K2-deployment-1.J, A-K2-source-control-1.J, K4-seam-6.J | B101 | 104 min |  |
| A-K2-settings-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-settings-1.J, K4-i18n-common.T, A-K2-0.T | B101 | 49 min | 851 |
| RT-K1-adm-recovery-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-recovery-2.J, RT-K1-0.T | B101 | 49 min | 851 |
| A-K2-shell-components-6.J | A-K2 | Jini | 9 (move) | A-K2-shell-lib-6.J, A-adm-shell-lib-4.J, A-K2-0.J, A-K2-shell-components-1.J, A-K2-fs-files-1.J, A-K2-shell-components-5.J, A-K2-plugins-2.J, A-K2-skills-1.J, A-adm-shell-lib-1.J, A-adm-shell-lib-3.J, A-K2-plugins-1.J, A-adm-shell-components-1.J, A-adm-other-3.J, A-K2-shell-lib-1.J, A-K2-shell-lib-5.J, A-K2-shell-components-3.J, A-K2-shell-components-4.J, A-K2-shell-lib-4.J | B102 | 100 min |  |
| A-K2-settings-2.J | A-K2 | Jini | 12 (move) | A-K2-shell-lib-6.J, A-K2-shell-hooks-1.J, A-K2-0.J, K4-i18n-common.J, A-K2-fs-files-1.J, A-adm-shell-components-1.J, A-adm-shell-lib-3.J, A-K2-settings-1.J, A-adm-other-3.J | B102 | 104 min |  |
| A-K2-shell-components-5.T | A-K2 | Tovu | 12 (delete + repoint) | A-K2-shell-components-5.J, A-K2-0.T | B102 | 45 min | 826 |
| A-K2-source-control-1.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-source-control-1.J, K4-i18n-common.T, A-K2-0.T, K4-seam-5.T | B102 | 55 min | 826 |
| RT-K1-adm-owner-mfa-deps-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-owner-mfa-deps-1.J, RT-K1-0.T | B102 | 26 min | 826 |
| RT-K1-adm-plugin-hook-error-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-plugin-hook-error-1.J | B102 | 27 min | 826 |
| RT-K1-adm-widgets-1.J | RT-K1 | Jini | 4 (move) | RT-K1-adm-plugin-hook-error-1.J, RT-K1-0.J, K4-seam-5.J | B103 | 96 min |  |
| A-K2-shell-lib-7.J | A-K2 | Jini | 6 (move) | A-K2-shell-lib-6.J, A-K2-0.J, A-K2-media-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-2.J, A-adm-other-3.J, A-K2-widgets-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-4.J, A-K2-shell-components-3.J, A-adm-shell-lib-3.J | B103 | 55 min |  |
| A-K2-shell-hooks-3.J | A-K2 | Jini | 3 (move) | A-K2-shell-hooks-1.J, A-adm-shell-hooks-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-K2-shell-lib-6.J, A-adm-shell-lib-4.J, A-K2-shell-lib-1.J, A-K2-0.J, K4-seam-8.J, K4-seam-5.J | B103 | 42 min |  |
| A-K2-providers-1.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-providers-1.J, K4-i18n-common.T, A-K2-0.T | B103 | 32 min | 792 |
| A-K2-settings-2.T | A-K2 | Tovu | 12 (delete + repoint) | A-K2-settings-2.J, A-K2-0.T, K4-i18n-common.T | B103 | 51 min | 792 |
| A-K2-shell-lib-5.T | A-K2 | Tovu | 12 (delete + repoint) | A-K2-shell-lib-5.J, A-K2-0.T, K4-seam-6.T | B103 | 56 min | 792 |
| RT-K1-adm-widgets-3.J | RT-K1 | Jini | 5 (move) | K5-widgets-1.J, RT-K1-adm-widgets-1.J, RT-K1-0.J | B104 | 105 min |  |
| RT-K1-adm-widgets-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-widgets-1.J, RT-K1-0.J, K5-widgets-1.J | B104 | 93 min |  |
| A-K2-publish-content-1.J | A-K2 | Jini | 12 (move) | K5-publish-content-ui-1.J, A-adm-publish-content-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-3.J | B104 | 69 min |  |
| A-K2-observability-1.J | A-K2 | Jini | 13 (move) | K4-i18n-common.J, A-adm-shell-lib-3.J, A-K2-0.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-2.J, A-adm-other-5.J, A-K2-auth-1.J, A-K2-shell-hooks-3.J | B104 | 96 min |  |
| A-K2-shell-lib-6.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-shell-lib-6.J, K4-seam-14.T, K4-seam-8.T, A-K2-0.T, K4-seam-17.T | B104 | 88 min | 778 |
| RT-K1-adm-widgets-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-widgets-1.J, RT-K1-0.T, K4-seam-5.T | B104 | 53 min | 778 |
| A-K2-shell-components-7.J | A-K2 | Jini | 11 (move) | A-K2-shell-components-6.J, A-K2-shell-components-3.J, A-K2-0.J, A-K2-shell-lib-1.J, A-adm-shell-lib-1.J, A-K2-shell-lib-5.J, A-K2-shell-lib-2.J, A-K2-shell-lib-6.J, A-K2-shell-components-5.J, A-K2-shell-hooks-1.J, A-adm-shell-lib-4.J, A-K2-shell-components-2.J, A-K2-shell-lib-7.J, A-adm-shell-lib-2.J | B105 | 99 min |  |
| A-K2-pages-2.J | A-K2 | Jini | 10 (move) | A-K2-themes-1.J, A-adm-pages-1.J, A-adm-themes-1.J, A-K2-pages-1.J, A-adm-posts-1.J, A-K2-shell-hooks-1.J, A-K2-shell-lib-6.J, A-K2-0.J, A-adm-shell-lib-3.J, A-adm-shell-lib-1.J, A-K2-posts-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-4.J, A-adm-shell-components-1.J, A-adm-shell-lib-2.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J | B105 | 81 min |  |
| A-K2-observability-1.T | A-K2 | Tovu | 13 (delete + repoint) | A-K2-observability-1.J, K4-i18n-common.T, A-K2-0.T | B105 | 46 min | 745 |
| A-K2-shell-components-6.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-shell-components-6.J, A-K2-0.T | B105 | 53 min | 745 |
| A-K2-shell-lib-7.T | A-K2 | Tovu | 6 (delete + repoint) | A-K2-shell-lib-7.J, A-K2-0.T | B105 | 49 min | 745 |
| RT-K1-adm-widgets-3.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-widgets-3.J, RT-K1-0.T | B105 | 43 min | 745 |
| RT-K1-adm-publish-content-3.J | RT-K1 | Jini | 2 (move) | K5-contracts-core-2.J, K5-publish-content-1.J, K5-publish-content-4.J, RT-K1-adm-plugin-hook-error-1.J, RT-K1-0.J, K5-publish-content-3.J, K4-publish-content-2.J, RT-K1-adm-publish-content-1.J, RT-K1-adm-publish-content-2.J | B106 | 101 min |  |
| A-K2-posts-2.J | A-K2 | Jini | 16 (move) | A-K2-posts-1.J, A-K2-shell-components-5.J, A-adm-themes-1.J, A-adm-posts-1.J, A-adm-shell-lib-1.J, A-K2-media-1.J, A-K2-themes-1.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-1.J, A-adm-shell-lib-2.J, A-adm-shell-lib-3.J, A-K2-shell-lib-2.J, A-K2-shell-components-3.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-K2-pages-2.J | B106 | 66 min |  |
| A-K2-consent-1.J | A-K2 | Jini | 9 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, K4-seam-9.J, A-adm-shell-lib-3.J, A-K2-shell-hooks-3.J, A-adm-other-1.J, A-K2-0.J | B106 | 86 min |  |
| A-K2-pages-2.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-pages-2.J, A-K2-0.T | B106 | 65 min | 720 |
| A-K2-publish-content-1.T | A-K2 | Tovu | 12 (delete + repoint) | A-K2-publish-content-1.J | B106 | 55 min | 720 |
| RT-K1-adm-widgets-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-widgets-2.J, RT-K1-0.T | B106 | 45 min | 720 |
| A-K2-security-2.J | A-K2 | Jini | 9 (move) | A-K2-security-1.J, A-adm-shell-lib-2.J, SEC-adm-security-1.J, A-K2-0.J, A-K2-media-1.J, A-K2-source-control-1.J, A-K2-shell-lib-4.J, A-K2-deployment-1.J, K4-i18n-common.J, A-K2-shell-lib-1.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, K4-seam-9.J | B107 | 84 min |  |
| A-K2-email-2.J | A-K2 | Jini | 7 (move) | A-K2-email-1.J, A-K2-shell-components-3.J, A-adm-other-1.J, A-K2-plugins-2.J, A-adm-shell-lib-3.J, A-K2-shell-hooks-3.J, A-adm-shell-components-1.J, A-adm-shell-components-2.J, A-K2-pages-1.J, A-K2-pages-2.J, A-adm-other-4.J, A-K2-0.J, A-K2-shell-lib-4.J, A-K2-shell-lib-1.J | B107 | 69 min |  |
| A-K2-consent-1.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-consent-1.J, K4-i18n-common.T, K4-seam-9.T, A-K2-0.T | B107 | 42 min | 682 |
| A-K2-posts-2.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-posts-2.J | B107 | 46 min | 682 |
| A-K2-shell-components-7.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-shell-components-7.J, A-K2-0.T | B107 | 56 min | 682 |
| RT-K1-adm-publish-content-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-publish-content-3.J, RT-K1-0.T, K4-publish-content-2.T | B107 | 52 min | 682 |
| RT-K1-adm-owner-passkey-routes-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-3.J, RT-K1-adm-owner-mfa-deps-1.J, RT-K1-0.J | B108 | 54 min |  |
| A-K2-content-analysis-1.J | A-K2 | Jini | 6 (move) | K4-i18n-common.J, A-K2-shell-lib-4.J, A-adm-shell-lib-1.J, A-K2-shell-hooks-3.J | B108 | 44 min |  |
| A-K2-analytics-1.J | A-K2 | Jini | 6 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-1.J, A-adm-other-3.J, A-K2-shell-hooks-3.J, A-adm-shell-lib-3.J, A-adm-shell-lib-4.J | B108 | 38 min |  |
| A-K2-menus-1.T | A-K2 | Tovu | 8 (delete + repoint) | A-K2-menus-1.J, K4-i18n-common.T, A-K2-0.T | B108 | 49 min | 662 |
| A-K2-security-2.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-security-2.J, A-K2-0.T, K4-i18n-common.T, K4-seam-9.T | B108 | 59 min | 662 |
| A-K2-shell-hooks-3.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-shell-hooks-3.J, A-K2-0.T, K4-seam-8.T, K4-seam-5.T | B108 | 104 min | 662 |
| RT-K1-adm-skills-2.J | RT-K1 | Jini | 1 (move) | K5-skills-1.J, RT-K1-adm-skills-1.J, K4-contracts-headless-1.J, RT-K1-0.J, K4-seam-22.J | B109 | 62 min |  |
| A-K2-themes-2.J | A-K2 | Jini | 5 (move) | A-K2-themes-1.J, A-adm-shell-components-1.J, A-adm-shell-components-2.J, A-adm-shell-lib-4.J, A-adm-shell-lib-3.J, A-K2-0.J, A-adm-themes-1.J, A-K2-publish-content-1.J | B109 | 67 min |  |
| A-K2-settings-3.J | A-K2 | Jini | 6 (move) | A-K2-shell-lib-1.J, A-K2-shell-hooks-3.J, A-K2-integrations-1.J, A-K2-shell-lib-4.J, A-K2-shell-lib-6.J, A-K2-settings-1.J, A-K2-settings-2.J, A-K2-0.J, A-K2-auth-1.J, A-K2-shell-lib-7.J, A-K2-admin-themes-1.J, K4-seam-17.J | B109 | 99 min |  |
| A-K2-content-analysis-1.T | A-K2 | Tovu | 6 (delete + repoint) | A-K2-content-analysis-1.J, K4-i18n-common.T | B109 | 29 min | 648 |
| A-K2-email-2.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-email-2.J, A-K2-0.T | B109 | 31 min | 648 |
| RT-K1-adm-owner-passkey-routes-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-owner-passkey-routes-1.J, RT-K1-0.T | B109 | 30 min | 648 |
| RT-K1-adm-system-4.J | RT-K1 | Jini | 1 (move) | K5-webhooks-4.J, X-identity-2.J, RT-K1-0.J, K4-seam-22.J | B110 | 112 min |  |
| A-K2-shell-hooks-2.J | A-K2 | Jini | 4 (move) | A-adm-shell-lib-1.J, A-K2-shell-lib-7.J, A-K2-shell-hooks-1.J, A-K2-shell-lib-5.J, A-K2-0.J, A-adm-shell-lib-4.J | B110 | 50 min |  |
| A-K2-authentication-1.J | A-K2 | Jini | 4 (move) | K4-i18n-common.J, A-K2-shell-components-3.J, A-K2-shell-hooks-3.J, A-adm-other-1.J, A-K2-0.J | B110 | 43 min |  |
| A-K2-analytics-1.T | A-K2 | Tovu | 6 (delete + repoint) | A-K2-analytics-1.J, K4-i18n-common.T | B110 | 23 min | 635 |
| A-K2-settings-3.T | A-K2 | Tovu | 6 (delete + repoint) | A-K2-settings-3.J, A-K2-0.T, K4-seam-17.T | B110 | 35 min | 635 |
| RT-K1-adm-skills-2.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-skills-2.J, K4-contracts-headless-1.T, RT-K1-0.T, K4-seam-22.T | B110 | 34 min | 635 |
| RT-K1-adm-system-5.J | RT-K1 | Jini | 2 (move) | K5-webhooks-4.J, K5-identity-2.J, RT-K1-adm-system-4.J, RT-K1-0.J, RT-K1-adm-settings-1.J, K5-settings-3.J | B111 | 90 min |  |
| A-K2-shell-hooks-4.J | A-K2 | Jini | 2 (move) | A-K2-deployment-1.J, A-K2-settings-2.J, A-K2-0.J, A-K2-shell-components-7.J, A-K2-shell-lib-6.J | B111 | 50 min |  |
| A-K2-shell-components-8.J | A-K2 | Jini | 14 (move) | A-K2-fs-files-1.J, A-K2-shell-components-1.J, A-K2-settings-2.J, A-K2-shell-hooks-2.J, A-K2-0.J, A-K2-shell-lib-6.J, A-adm-shell-lib-4.J, A-K2-shell-components-6.J, A-K2-shell-components-7.J, A-K2-shell-hooks-3.J, A-K2-media-1.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-1.J, A-K2-shell-components-3.J, A-K2-shell-components-5.J, A-K2-shell-lib-1.J, A-K2-shell-lib-7.J | B111 | 101 min |  |
| A-K2-shell-hooks-2.T | A-K2 | Tovu | 4 (delete + repoint) | A-K2-shell-hooks-2.J, A-K2-0.T | B111 | 34 min | 625 |
| A-K2-themes-2.T | A-K2 | Tovu | 5 (delete + repoint) | A-K2-themes-2.J, A-K2-0.T | B111 | 25 min | 625 |
| RT-K1-adm-system-4.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-4.J, RT-K1-0.T, K4-seam-22.T | B111 | 60 min | 625 |
| RT-K1-adm-system-7.J | RT-K1 | Jini | 2 (move) | K5-contracts-core-1.J, RT-K1-adm-settings-1.J, RT-K1-adm-system-5.J, K5-deployments-4.J, RT-K1-0.J | B112 | 91 min |  |
| RT-K1-adm-system-6.J | RT-K1 | Jini | 3 (move) | K5-domain-dns-1.J, RT-K1-0.J, K5-custom-credentials-3.J, K5-mail-status-1.J, K5-contracts-headless-2.J, RT-K1-adm-settings-1.J, RT-K1-adm-system-5.J | B112 | 97 min |  |
| A-K2-plugins-4.J | A-K2 | Jini | 13 (move) | A-K2-shell-hooks-3.J, A-K2-plugins-1.J, A-K2-plugins-2.J, A-K2-plugins-3.J, A-adm-other-2.J, A-adm-other-5.J, A-adm-shell-hooks-1.J, A-K2-integrations-1.J, A-K2-shell-components-8.J, A-adm-shell-lib-3.J, A-K2-0.J | B112 | 85 min |  |
| A-K2-database-1.J | A-K2 | Jini | 11 (move) | K4-i18n-common.J, A-adm-other-1.J, A-adm-shell-lib-4.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-3.J, A-adm-other-4.J, A-K2-shell-hooks-3.J, A-adm-shell-lib-3.J, A-K2-0.J, A-K2-shell-components-8.J | B112 | 75 min |  |
| A-K2-shell-components-8.T | A-K2 | Tovu | 14 (delete + repoint) | A-K2-shell-components-8.J, A-K2-0.T | B112 | 67 min | 609 |
| RT-K1-adm-system-5.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-5.J, RT-K1-0.T | B112 | 46 min | 609 |
| RT-K1-adm-system-8.J | RT-K1 | Jini | 1 (move) | K5-deployments-4.J, RT-K1-0.J | B113 | 50 min |  |
| A-K2-shell-components-9.J | A-K2 | Jini | 9 (move) | A-K2-shell-hooks-3.J, K4-seam-5.J, A-K2-shell-components-8.J, A-K2-shell-components-6.J, A-K2-shell-components-3.J, A-K2-media-1.J, A-K2-shell-components-5.J, A-K2-shell-components-4.J, A-K2-0.J, A-adm-other-3.J, A-K2-shell-hooks-2.J, A-K2-shell-components-2.J, A-K2-shell-components-7.J | B113 | 85 min |  |
| A-K2-recovery-1.J | A-K2 | Jini | 9 (move) | K4-i18n-common.J, A-adm-recovery-1.J, A-adm-shell-lib-4.J, A-K2-shell-lib-4.J, A-adm-other-3.J, A-adm-other-1.J, A-K2-database-1.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-adm-shell-lib-3.J, A-K2-shell-components-8.J, A-K2-0.J | B113 | 67 min |  |
| A-K2-plugins-4.T | A-K2 | Tovu | 13 (delete + repoint) | A-K2-plugins-4.J, A-K2-0.T | B113 | 46 min | 591 |
| A-K2-shell-hooks-4.T | A-K2 | Tovu | 2 (delete + repoint) | A-K2-shell-hooks-4.J, A-K2-0.T | B113 | 35 min | 591 |
| RT-K1-adm-system-6.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-system-6.J, RT-K1-0.T | B113 | 54 min | 591 |
| RT-K1-adm-system-9.J | RT-K1 | Jini | 1 (move) | K5-mail-status-1.J, X-mail-status-1.J, RT-K1-0.J | B114 | 95 min |  |
| A-K2-security-3.J | A-K2 | Jini | 10 (move) | A-K2-shell-lib-1.J, A-K2-security-1.J, A-K2-source-control-1.J, A-K2-shell-lib-4.J, A-K2-shell-lib-5.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-K2-deployment-1.J, A-K2-security-2.J, K4-seam-9.J, A-adm-shell-lib-4.J, A-K2-shell-components-3.J, A-K2-shell-components-9.J, A-adm-shell-lib-3.J, A-K2-0.J, SEC-adm-security-1.J | B114 | 99 min |  |
| A-K2-deployment-2.J | A-K2 | Jini | 10 (move) | A-K2-deployment-1.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-3.J, A-K2-shell-lib-5.J, A-K2-shell-lib-1.J, A-K2-security-1.J, A-adm-other-2.J, A-adm-shell-hooks-1.J, A-adm-deployment-1.J, A-K2-shell-components-9.J, A-K2-shell-components-3.J, A-adm-shell-lib-3.J, A-adm-shell-lib-4.J, A-K2-0.J | B114 | 101 min |  |
| A-K2-database-1.T | A-K2 | Tovu | 11 (delete + repoint) | A-K2-database-1.J, K4-i18n-common.T, A-K2-0.T | B114 | 45 min | 569 |
| A-K2-shell-components-9.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-shell-components-9.J, K4-seam-5.T, A-K2-0.T | B114 | 50 min | 569 |
| RT-K1-adm-system-7.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-7.J, RT-K1-0.T | B114 | 47 min | 569 |
| K5-comments-2.J | K5 | Jini | 1 (move) | K5-contracts-core-4.J, K5-contracts-core-10.J, K5-settings-3.J, K5-comments-1.J, K4-seam-8.J, K4-seam-5.J | B115 | 42 min |  |
| RT-K1-adm-system-14.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-sites-2.J, RT-K1-adm-sites-1.J, K5-agent-plugins-8.J, RT-K1-0.J, K4-seam-23.J | B115 | 120 min |  |
| A-K2-members-1.J | A-K2 | Jini | 7 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-members-1.J, K4-seam-6.J, A-K2-shell-hooks-3.J, A-adm-shell-lib-2.J, A-K2-shell-components-8.J | B115 | 54 min |  |
| A-K2-media-2.J | A-K2 | Jini | 8 (move) | A-K2-media-1.J, A-K2-0.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-K2-shell-components-9.J, A-K2-shell-components-8.J, A-adm-other-5.J, A-K2-publish-content-1.J | B115 | 105 min |  |
| A-K2-deployment-2.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-deployment-2.J, A-K2-0.T | B115 | 35 min | 558 |
| RT-K1-adm-system-8.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-8.J, RT-K1-0.T | B115 | 27 min | 558 |
| V-media-3.J | V | Jini | 1 (move) | X-media-1.J, K5-media-2.J, K5-media-1.J | B116 | 23 min |  |
| A-K2-users-1.J | A-K2 | Jini | 7 (move) | A-adm-shell-lib-3.J, A-adm-shell-lib-2.J, K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-users-1.J, A-K2-roles-1.J, A-K2-auth-1.J, K4-seam-6.J, A-K2-shell-hooks-3.J, A-K2-shell-components-8.J | B116 | 68 min |  |
| A-K2-shell-components-10.J | A-K2 | Jini | 5 (move) | A-K2-shell-lib-1.J, A-adm-shell-lib-4.J, A-K2-shell-components-9.J, A-K2-shell-components-7.J, A-K2-shell-components-8.J, A-K2-shell-components-6.J, A-K2-skills-1.J, A-K2-shell-lib-3.J, A-K2-shell-components-5.J, A-K2-shell-lib-6.J, A-K2-0.J, A-K2-media-1.J, A-K2-shell-components-3.J, A-K2-shell-components-4.J, A-adm-shell-components-2.J, A-K2-shell-hooks-4.J, A-K2-shell-hooks-2.J, A-K2-collections-1.J, A-adm-other-1.J, A-adm-other-2.J, A-adm-other-3.J, A-adm-shell-lib-1.J | B116 | 90 min |  |
| A-K2-security-3.T | A-K2 | Tovu | 10 (delete + repoint) | A-K2-security-3.J, K4-seam-9.T, A-K2-0.T | B116 | 46 min | 546 |
| RT-K1-adm-system-9.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-9.J, RT-K1-0.T | B116 | 55 min | 546 |
| K5-comments-2.T | K5 | Tovu | 1 (delete + repoint) | K5-comments-2.J, K4-seam-8.T, K4-seam-5.T | B116 | 31 min | 546 |
| K5-theme-4.J | K5 | Jini | 16 (move) | K5-theme-1.J, K5-theme-3.J, K5-platform-routing-1.J, K5-theme-2.J, T-theme-1.J, C-platform-html-1.J, V-media-3.J, K5-publish-content-1.J, K4-publish-content-2.J, K4-trash-2.J, K5-publish-content-3.J, K4-seam-5.J | B117 | 96 min |  |
| K5-forms-1.J | K5 | Jini | 13 (move) | K4-seam-5.J, K5-contracts-core-2.J, K5-contracts-core-3.J, K5-contracts-headless-2.J, V-media-3.J, V-contracts-core-9.J, C-platform-html-1.J, X-content-duplication-1.J, X-forms-1.J, K5-contracts-core-6.J, K5-publish-content-1.J, K5-publish-content-3.J, K4-publish-content-2.J, K5-contracts-core-4.J, K4-contracts-core-5.J, K4-seam-10.J | B117 | 89 min |  |
| A-K2-recovery-1.T | A-K2 | Tovu | 9 (delete + repoint) | A-K2-recovery-1.J, K4-i18n-common.T, A-K2-0.T | B117 | 34 min | 530 |
| A-K2-shell-components-10.T | A-K2 | Tovu | 5 (delete + repoint) | A-K2-shell-components-10.J, A-K2-0.T | B117 | 51 min | 530 |
| RT-K1-adm-system-14.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-14.J, RT-K1-0.T, K4-seam-23.T | B117 | 64 min | 530 |
| V-media-3.T | V | Tovu | 1 (delete + repoint) | V-media-3.J | B117 | 120 min | 530 |
| K5-media-4.J | K5 | Jini | 8 (move) | K5-media-1.J, V-media-3.J, K5-publish-content-1.J, K4-publish-content-2.J, K4-seam-5.J, K4-contracts-core-5.J, X-media-1.J, K5-publish-content-3.J, K4-seam-1.J | B118 | 57 min |  |
| RT-K1-adm-media-1.J | RT-K1 | Jini | 7 (move) | RT-K1-0.J, V-media-3.J | B118 | 104 min |  |
| A-K2-trash-1.J | A-K2 | Jini | 7 (move) | K4-i18n-common.J, A-adm-shell-lib-1.J, A-K2-shell-lib-4.J, A-adm-shell-lib-2.J, A-adm-other-3.J, A-adm-users-1.J, A-K2-users-1.J, A-adm-other-6.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-K2-shell-lib-1.J, A-adm-shell-lib-4.J | B118 | 54 min |  |
| A-K2-library-1.J | A-K2 | Jini | 8 (move) | K4-i18n-common.J, A-K2-media-1.J, A-K2-0.J, A-K2-users-1.J, A-K2-auth-1.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-3.J, A-adm-shell-hooks-1.J, A-adm-shell-lib-3.J, A-adm-shell-lib-4.J | B118 | 74 min |  |
| A-K2-media-2.T | A-K2 | Tovu | 8 (delete + repoint) | A-K2-media-2.J, A-K2-0.T | B118 | 54 min | 506 |
| K5-theme-4.T | K5 | Tovu | 16 (delete + repoint) | K5-theme-4.J, K4-publish-content-2.T, K4-trash-2.T, K4-seam-5.T | B118 | 94 min | 506 |
| K5-post-4.J | K5 | Jini | 7 (move) | K5-publish-content-1.J, K4-publish-content-2.J, K5-publish-content-3.J, K5-taxonomy-1.J, K5-post-3.J, K5-post-2.J, K5-post-1.J, K5-contracts-core-3.J, K4-seam-5.J, V-media-3.J | B119 | 92 min |  |
| A-K2-taxonomy-1.J | A-K2 | Jini | 16 (move) | K4-i18n-common.J, A-adm-other-3.J, A-K2-shell-lib-2.J, A-K2-shell-lib-4.J, A-adm-other-6.J, A-K2-trash-1.J, A-K2-auth-1.J, A-K2-shell-hooks-3.J, A-adm-shell-lib-2.J, A-K2-0.J | B119 | 88 min |  |
| A-K2-shell-components-11.J | A-K2 | Jini | 5 (move) | A-K2-fs-files-1.J, A-K2-shell-components-8.J, A-K2-shell-components-7.J, A-K2-shell-components-6.J, A-K2-shell-hooks-4.J, A-K2-shell-components-3.J, A-K2-shell-components-1.J, A-adm-shell-components-1.J, A-adm-other-3.J, A-K2-skills-1.J, A-K2-shell-components-5.J, A-K2-shell-lib-6.J, A-K2-shell-components-4.J, A-K2-shell-lib-2.J, A-K2-shell-components-10.J, A-K2-0.J, A-K2-shell-lib-4.J, A-K2-shell-hooks-1.J, A-K2-shell-hooks-3.J, A-K2-widgets-1.J, A-adm-shell-components-2.J, A-adm-shell-lib-3.J, A-K2-shell-components-9.J | B119 | 59 min |  |
| A-K2-library-1.T | A-K2 | Tovu | 8 (delete + repoint) | A-K2-library-1.J, K4-i18n-common.T, A-K2-0.T | B119 | 32 min | 478 |
| RT-K1-adm-media-1.T | RT-K1 | Tovu | 7 (delete + repoint) | RT-K1-adm-media-1.J, RT-K1-0.T | B119 | 81 min | 478 |
| K5-forms-1.T | K5 | Tovu | 13 (delete + repoint) | K5-forms-1.J, K4-seam-5.T, K4-publish-content-2.T, K4-contracts-core-5.T, K4-seam-10.T | B119 | 81 min | 478 |
| K5-media-generation-1.J | K5 | Jini | 5 (move) | K5-agent-plugins-4.J, K5-media-2.J, K4-seam-5.J, K4-contracts-core-5.J, K5-contracts-headless-2.J, K5-contracts-core-1.J, K5-contracts-core-10.J, K4-seam-20.J, K4-seam-1.J, V-media-3.J, X-media-1.J, K5-contracts-core-7.J, K5-media-4.J, K4-seam-3.J | B120 | 93 min |  |
| RT-K1-adm-media-2.J | RT-K1 | Jini | 4 (move) | V-media-3.J, RT-K1-adm-media-1.J, RT-K1-0.J | B120 | 88 min |  |
| A-K2-authentication-1.T | A-K2 | Tovu | 4 (delete + repoint) | A-K2-authentication-1.J, K4-i18n-common.T, A-K2-0.T | B120 | 23 min | 445 |
| A-K2-shell-components-11.T | A-K2 | Tovu | 5 (delete + repoint) | A-K2-shell-components-11.J, A-K2-0.T | B120 | 40 min | 445 |
| A-K2-taxonomy-1.T | A-K2 | Tovu | 16 (delete + repoint) | A-K2-taxonomy-1.J, K4-i18n-common.T, A-K2-0.T | B120 | 56 min | 445 |
| K5-media-4.T | K5 | Tovu | 8 (delete + repoint) | K5-media-4.J, K4-publish-content-2.T, K4-seam-5.T, K4-contracts-core-5.T, K4-seam-1.T | B120 | 52 min | 445 |
| RT-K1-adm-forms-3.J | RT-K1 | Jini | 3 (move) | K5-forms-1.J, R-admin-http-1.J, RT-K1-adm-forms-1.J, RT-K1-0.J | B121 | 73 min |  |
| A-K2-taxonomy-2.J | A-K2 | Jini | 3 (move) | A-adm-other-3.J, A-K2-taxonomy-1.J, A-K2-0.J, A-adm-other-6.J, A-K2-shell-components-8.J, A-K2-publish-content-1.J | B121 | 38 min |  |
| A-K2-settings-4.J | A-K2 | Jini | 3 (move) | A-K2-settings-2.J, A-K2-shell-hooks-4.J, A-K2-shell-lib-7.J, A-adm-shell-lib-3.J, A-K2-settings-1.J, A-adm-other-3.J, A-K2-shell-hooks-3.J, A-K2-shell-components-8.J, A-adm-shell-lib-1.J, A-K2-shell-lib-6.J, A-K2-webmcp-1.J, A-K2-0.J, A-K2-settings-3.J | B121 | 69 min |  |
| A-K2-members-1.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-members-1.J, K4-i18n-common.T, K4-seam-6.T | B121 | 34 min | 427 |
| RT-K1-adm-media-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-media-2.J, RT-K1-0.T | B121 | 39 min | 427 |
| K5-post-4.T | K5 | Tovu | 7 (delete + repoint) | K5-post-4.J, K4-publish-content-2.T, K4-seam-5.T | B121 | 78 min | 427 |
| K5-media-import-1.J | K5 | Jini | 3 (move) | K5-fs-files-1.J, V-media-3.J, K4-seam-2.J, X-media-1.J, K4-contracts-core-5.J, K5-media-4.J, K5-contracts-core-10.J, K4-seam-3.J | B122 | 47 min |  |
| A-K2-pages-3.J | A-K2 | Jini | 3 (move) | A-K2-themes-1.J, A-K2-themes-2.J, A-adm-pages-1.J, A-K2-pages-1.J, A-adm-shell-components-1.J, A-adm-shell-components-2.J, A-adm-shell-lib-4.J, A-K2-shell-hooks-1.J, A-K2-pages-2.J, A-adm-themes-1.J, A-K2-shell-components-5.J, A-K2-taxonomy-2.J, A-K2-0.J, A-adm-posts-1.J, A-adm-shell-lib-3.J, A-K2-shell-components-8.J, A-K2-publish-content-1.J | B122 | 55 min |  |
| A-K2-collections-2.J | A-K2 | Jini | 6 (move) | A-K2-collections-1.J, A-K2-shell-components-8.J, A-K2-publish-content-1.J, A-adm-shell-lib-4.J, A-adm-other-1.J, A-K2-shell-lib-4.J, A-K2-shell-lib-6.J, A-K2-shell-lib-7.J, A-adm-shell-lib-3.J, A-K2-shell-hooks-3.J, A-adm-other-4.J, A-K2-taxonomy-2.J | B122 | 48 min |  |
| A-K2-trash-1.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-trash-1.J, K4-i18n-common.T | B122 | 32 min | 412 |
| RT-K1-adm-forms-3.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-forms-3.J, RT-K1-0.T | B122 | 38 min | 412 |
| K5-media-generation-1.T | K5 | Tovu | 5 (delete + repoint) | K5-media-generation-1.J, K4-seam-5.T, K4-contracts-core-5.T, K4-seam-20.T, K4-seam-1.T, K4-seam-3.T | B122 | 50 min | 412 |
| C-contracts-core-1.J | P9 (C) | Jini | 1 (move) | — | B123 | 60 min |  |
| K5-theme-5.J | K5 | Jini | 9 (move) | K5-theme-4.J, V-media-3.J, K5-media-import-1.J, K5-fs-files-1.J, K5-theme-2.J, T-theme-1.J, K4-seam-2.J, K5-theme-3.J, K5-presentation-1.J, K5-theme-1.J, K4-seam-3.J | B123 | 63 min |  |
| RT-K1-adm-media-3.J | RT-K1 | Jini | 5 (move) | V-media-3.J, K5-media-import-1.J, K5-media-4.J, RT-K1-adm-media-1.J, RT-K1-0.J, R-admin-http-1.J | B123 | 99 min |  |
| A-K2-posts-3.J | A-K2 | Jini | 15 (move) | A-adm-posts-1.J, A-K2-content-analysis-1.J, A-K2-taxonomy-2.J, A-adm-shell-components-1.J, A-adm-shell-components-2.J, A-K2-posts-2.J, A-K2-posts-1.J, A-K2-shell-components-9.J, A-K2-0.J, A-adm-shell-lib-4.J, A-adm-shell-lib-3.J, A-K2-shell-components-8.J, A-K2-shell-hooks-3.J, A-K2-publish-content-1.J, A-K2-shell-hooks-1.J, A-K2-pages-3.J, A-K2-shell-components-11.J, A-K2-shell-lib-6.J, A-adm-themes-1.J, A-K2-shell-lib-7.J, A-adm-shell-lib-2.J, A-adm-shell-hooks-1.J, A-K2-pages-1.J, A-K2-themes-2.J, A-adm-posts-2.J | B123 | 83 min |  |
| A-K2-users-1.T | A-K2 | Tovu | 7 (delete + repoint) | A-K2-users-1.J, K4-i18n-common.T, K4-seam-6.T | B123 | 43 min | 402 |
| K5-media-import-1.T | K5 | Tovu | 3 (delete + repoint) | K5-media-import-1.J, K4-seam-2.T, K4-contracts-core-5.T, K4-seam-3.T | B123 | 36 min | 402 |
| K5-plugin-runtime-2.J | K5 | Jini | 12 (move) | C-platform-html-1.J, K5-contracts-core-3.J, K5-plugin-runtime-1.J, K4-contracts-core-5.J, K4-seam-16.J, C-contracts-core-1.J, K5-contracts-headless-2.J, K5-contracts-core-10.J, X-plugin-runtime-1.J, K5-contracts-core-6.J, K4-seam-1.J | B124 | 99 min |  |
| K4-asset-transfer-1.J | K4 | Jini | 3 (move) | K5-contracts-core-10.J, K5-media-import-1.J, V-media-3.J, K5-theme-5.J, K5-fs-files-1.J, K4-contracts-core-5.J, K5-media-1.J, K4-seam-1.J | B124 | 30 min |  |
| A-K2-posts-3.T | A-K2 | Tovu | 15 (delete + repoint) | A-K2-posts-3.J, A-K2-0.T | B124 | 49 min | 372 |
| RT-K1-adm-media-3.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-media-3.J, RT-K1-0.T | B124 | 55 min | 372 |
| K5-theme-5.T | K5 | Tovu | 9 (delete + repoint) | K5-theme-5.J, K4-seam-2.T, K4-seam-3.T | B124 | 58 min | 372 |
| C-contracts-core-1.T | P9 (C) | Tovu | 1 (delete + repoint) | C-contracts-core-1.J | B124 | 60 min | 372 |
| X-site-search-1.J | P9 (X) | Jini | 1 (move) | — | B125 | 60 min |  |
| X-object-storage-1.J | P9 (X) | Jini | 1 (move) | — | B125 | 60 min |  |
| K5-theme-7.J | K5 | Jini | 10 (move) | K5-theme-1.J, K5-theme-3.J, K5-theme-5.J, K5-theme-4.J, K5-theme-2.J, T-theme-1.J, K4-trash-2.J, K5-media-import-1.J, K5-fs-files-1.J | B125 | 85 min |  |
| RT-K1-adm-assistant-6.J | RT-K1 | Jini | 2 (move) | K5-settings-3.J, RT-K1-0.J, K4-seam-11.J, V-media-3.J, RT-K1-adm-media-1.J | B125 | 74 min |  |
| A-K2-collections-2.T | A-K2 | Tovu | 6 (delete + repoint) | A-K2-collections-2.J | B125 | 35 min | 354 |
| K5-plugin-runtime-2.T | K5 | Tovu | 12 (delete + repoint) | K5-plugin-runtime-2.J, K4-contracts-core-5.T, K4-seam-16.T, K4-seam-1.T | B125 | 80 min | 354 |
| K5-object-storage-1.J | K5 | Jini | 4 (move) | K5-agent-plugins-5.J, K5-agent-plugins-4.J, K4-seam-13.J, X-object-storage-1.J | B126 | 56 min |  |
| A-K2-pages-3.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-pages-3.J, A-K2-0.T | B126 | 22 min | 337 |
| RT-K1-adm-assistant-6.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-assistant-6.J, RT-K1-0.T, K4-seam-11.T | B126 | 36 min | 337 |
| K5-theme-7.T | K5 | Tovu | 10 (delete + repoint) | K5-theme-7.J, K4-trash-2.T | B126 | 65 min | 337 |
| X-object-storage-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-object-storage-1.J | B126 | 60 min | 337 |
| X-site-search-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-site-search-1.J | B126 | 60 min | 337 |
| RT-K1-adm-plugins-1.J | RT-K1 | Jini | 2 (move) | RT-K1-0.J, K5-plugin-runtime-2.J, K5-contracts-core-3.J, K5-plugin-runtime-1.J, K4-seam-10.J, K4-seam-16.J | B127 | 87 min |  |
| RT-K1-adm-media-4.J | RT-K1 | Jini | 2 (move) | V-media-3.J, RT-K1-adm-media-1.J, RT-K1-adm-media-3.J, RT-K1-0.J, K5-media-1.J | B127 | 58 min |  |
| XC-1 | XC | Jini | — | — | B127 | 100 min |  |
| A-K2-settings-4.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-settings-4.J, A-K2-0.T | B127 | 30 min | 327 |
| K4-asset-transfer-1.T | K4 | Tovu | 3 (delete + repoint) | K4-asset-transfer-1.J, K4-contracts-core-5.T, K4-seam-1.T | B127 | 22 min | 327 |
| K5-object-storage-1.T | K5 | Tovu | 4 (delete + repoint) | K5-object-storage-1.J, K4-seam-13.T | B127 | 44 min | 327 |
| RT-K1-adm-plugins-4.J | RT-K1 | Jini | 2 (move) | K5-contracts-core-3.J, K5-plugin-runtime-2.J, RT-K1-adm-plugins-1.J, RT-K1-0.J | B128 | 104 min |  |
| RT-K1-adm-plugins-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-plugins-1.J, RT-K1-0.J, K5-plugin-runtime-2.J, K4-seam-16.J, RT-K1-adm-plugin-hook-error-1.J | B128 | 88 min |  |
| XC-2 | XC | Jini | — | XC-1 | B128 | 80 min |  |
| A-K2-taxonomy-2.T | A-K2 | Tovu | 3 (delete + repoint) | A-K2-taxonomy-2.J, A-K2-0.T | B128 | 26 min | 320 |
| RT-K1-adm-media-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-media-4.J, RT-K1-0.T | B128 | 32 min | 320 |
| RT-K1-adm-plugins-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-plugins-1.J, RT-K1-0.T, K4-seam-10.T, K4-seam-16.T | B128 | 53 min | 320 |
| RT-K1-adm-plugins-5.J | RT-K1 | Jini | 2 (move) | RT-K1-adm-plugins-1.J, RT-K1-adm-plugins-2.J, RT-K1-0.J | B129 | 71 min |  |
| RT-K1-adm-plugins-3.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-plugins-1.J, K5-project-keys-1.J, RT-K1-0.J, K4-seam-22.J | B129 | 62 min |  |
| XC-5 | XC | Jini | — | — | B129 | 80 min |  |
| XC-4 | XC | Jini | — | — | B129 | 100 min |  |
| XC-3 | XC | Jini | — | — | B129 | 110 min |  |
| RT-K1-adm-plugins-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-plugins-2.J, RT-K1-0.T, K4-seam-16.T | B129 | 47 min | 317 |
| RT-K1-pub-mail-feedback-1.J | RT-K1 | Jini | 1 (move) | K5-mail-1.J, RT-K1-0.J | B130 | 38 min |  |
| V-post-5.J | V | Jini | 1 (move) | K5-post-2.J, K5-post-3.J, K5-post-1.J, T-post-1.J, K5-contracts-core-3.J, K5-post-4.J | B130 | 22 min |  |
| S6b.J | S6 | Jini | — | — | B130 | 110 min |  |
| XC-6a | XC | Jini | — | — | B130 | 90 min |  |
| RT-K1-adm-plugins-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-plugins-4.J, RT-K1-0.T | B130 | 54 min | 315 |
| K5-publish-content-5.J | K5 | Jini | 9 (move) | K5-contracts-core-2.J, K5-publish-content-1.J, K5-publish-content-3.J, K5-publish-content-4.J, K4-publish-content-2.J, K4-seam-5.J, K5-platform-routing-1.J, K5-publish-content-ui-1.J, P-publish-trust-1.J, V-post-5.J, K4-seam-7.J | B131 | 99 min |  |
| K5-consent-1.J | K5 | Jini | 13 (move) | K4-seam-15.J, K4-seam-5.J, K5-contracts-core-10.J, K5-contracts-core-4.J, K4-seam-1.J, K5-agent-plugins-4.J, V-post-5.J | B131 | 98 min |  |
| S6b.T | S | Tovu | — | S6b.J | B131 | 60 min |  |
| RT-K1-adm-plugins-5.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-plugins-5.J, RT-K1-0.T | B131 | 36 min | 311 |
| V-post-5.T | V | Tovu | 1 (delete + repoint) | V-post-5.J | B131 | 120 min | 311 |
| RT-K1-pub-mail-feedback-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-mail-feedback-1.J, RT-K1-0.T | B131 | 20 min | 311 |
| K5-site-backup-3.J | K5 | Jini | 9 (move) | K5-site-backup-2.J, K5-site-backup-1.J, K4-seam-2.J, K4-seam-12.J, K5-contracts-core-2.J, V-agent-plugins-2.J, K4-seam-7.J, K5-publish-content-5.J, K5-publish-content-1.J | B132 | 101 min |  |
| K5-navigation-1.J | K5 | Jini | 8 (move) | K5-contracts-core-6.J, X-navigation-1.J, K5-platform-routing-1.J, K5-publish-content-3.J, K4-publish-content-2.J, K4-seam-5.J, V-post-5.J | B132 | 58 min |  |
| K5-deployments-5.J | K5 | Jini | 6 (move) | K5-contracts-core-7.J, K5-contracts-core-2.J, K5-theme-1.J, K5-deployments-1.J, K5-form-destinations-1.J, K5-deployments-4.J, K5-deployments-2.J, K4-seam-3.J, K4-seam-6.J, K5-vendor-credentials-1.J, K4-seam-1.J, K5-custom-credentials-1.J, K5-consent-1.J, K5-contracts-headless-2.J, K4-seam-7.J | B132 | 101 min |  |
| RT-K1-adm-plugins-3.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-plugins-3.J, RT-K1-0.T, K4-seam-22.T | B132 | 32 min | 288 |
| K5-consent-1.T | K5 | Tovu | 13 (delete + repoint) | K5-consent-1.J, K4-seam-15.T, K4-seam-5.T, K4-seam-1.T | B132 | 76 min | 288 |
| K5-publish-content-5.T | K5 | Tovu | 9 (delete + repoint) | K5-publish-content-5.J, K4-publish-content-2.T, K4-seam-5.T, K4-seam-7.T | B132 | 63 min | 288 |
| K5-site-inspection-1.J | K5 | Jini | 10 (move) | K4-seam-14.J, K5-platform-routing-1.J, K5-publish-content-4.J, K5-deployments-5.J | B133 | 95 min |  |
| K5-site-backup-4.J | K5 | Jini | 8 (move) | K5-site-backup-3.J, K5-site-backup-1.J, K5-agent-plugins-4.J, K5-site-backup-2.J, K5-theme-3.J, K4-seam-7.J, K5-source-control-1.J, V-media-3.J, K4-seam-16.J | B133 | 89 min |  |
| K5-plugin-runtime-3.J | K5 | Jini | 6 (move) | X-plugin-runtime-1.J, K4-contracts-headless-1.J, K5-contracts-headless-2.J, K5-plugin-runtime-1.J, K5-plugin-runtime-2.J, K5-contracts-core-3.J, K4-seam-3.J, K4-seam-1.J, K4-seam-7.J, K4-contracts-core-5.J, V-post-5.J | B133 | 64 min |  |
| K5-deployments-6.J | K5 | Jini | 2 (move) | K5-deployments-5.J, K5-contracts-core-10.J, K5-deployments-2.J, K5-deployments-1.J, K4-seam-1.J | B133 | 56 min |  |
| RT-K1-adm-menus-1.J | RT-K1 | Jini | 4 (move) | K5-navigation-1.J, RT-K1-0.J, R-admin-http-1.J | B133 | 92 min |  |
| K5-site-backup-3.T | K5 | Tovu | 9 (delete + repoint) | K5-site-backup-3.J, K4-seam-2.T, K4-seam-12.T, K4-seam-7.T | B133 | 100 min | 279 |
| RT-K1-adm-publish-content-4.J | RT-K1 | Jini | 3 (move) | K5-publish-content-4.J, RT-K1-adm-publish-content-1.J, RT-K1-adm-publish-content-2.J, RT-K1-0.J, K5-publish-content-1.J, K4-publish-content-2.J, K5-publish-trust-1.J, P-publish-trust-1.J, K5-publish-content-5.J | B134 | 92 min |  |
| RT-K1-adm-menus-2.J | RT-K1 | Jini | 3 (move) | RT-K1-adm-menus-1.J, RT-K1-0.J, K5-navigation-1.J, R-admin-http-1.J | B134 | 72 min |  |
| K5-deployments-6.T | K5 | Tovu | 2 (delete + repoint) | K5-deployments-6.J, K4-seam-1.T | B134 | 33 min | 251 |
| K5-navigation-1.T | K5 | Tovu | 8 (delete + repoint) | K5-navigation-1.J, K4-publish-content-2.T, K4-seam-5.T | B134 | 74 min | 251 |
| K5-site-backup-4.T | K5 | Tovu | 8 (delete + repoint) | K5-site-backup-4.J, K4-seam-7.T, K4-seam-16.T | B134 | 74 min | 251 |
| K5-site-inspection-1.T | K5 | Tovu | 10 (delete + repoint) | K5-site-inspection-1.J, K4-seam-14.T | B134 | 73 min | 251 |
| K5-web-1.J | K5 | Jini | 3 (move) | K4-seam-2.J, K5-contracts-core-6.J, K5-contracts-core-3.J, K5-site-inspection-1.J | B135 | 59 min |  |
| K5-site-backup-5.J | K5 | Jini | 3 (move) | K5-agent-plugins-4.J, X-agent-plugins-1.J, V-agent-plugins-2.J, K5-site-backup-4.J, K5-site-backup-3.J, V-media-3.J, K5-media-1.J, K5-site-backup-1.J, K5-site-backup-2.J, K5-contracts-core-2.J | B135 | 55 min |  |
| RT-K1-adm-menus-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-menus-1.J, RT-K1-0.T | B135 | 45 min | 232 |
| RT-K1-adm-publish-content-4.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-publish-content-4.J, RT-K1-0.T, K4-publish-content-2.T | B135 | 42 min | 232 |
| K5-deployments-5.T | K5 | Tovu | 6 (delete + repoint) | K5-deployments-5.J, K4-seam-3.T, K4-seam-6.T, K4-seam-1.T, K4-seam-7.T | B135 | 64 min | 232 |
| K5-plugin-runtime-3.T | K5 | Tovu | 6 (delete + repoint) | K5-plugin-runtime-3.J, K4-contracts-headless-1.T, K4-seam-3.T, K4-seam-1.T, K4-seam-7.T, K4-contracts-core-5.T | B135 | 46 min | 232 |
| K5-site-backup-6.J | K5 | Jini | 2 (move) | K5-site-backup-1.J, K5-site-backup-4.J, V-post-5.J, V-media-3.J, K4-seam-5.J, K5-site-backup-3.J, K4-seam-7.J | B136 | 94 min |  |
| RT-K1-pub-http-1.J | RT-K1 | Jini | 2 (move) | K5-post-1.J, K5-contracts-headless-2.J, V-post-5.J | B136 | 25 min |  |
| RT-K1-adm-publish-content-5.J | RT-K1 | Jini | 2 (move) | V-media-3.J, RT-K1-adm-publish-content-1.J, RT-K1-0.J, K5-publish-content-5.J, K5-publish-content-ui-1.J, K5-publish-content-4.J, K5-publish-trust-1.J, K5-publish-content-1.J, RT-K1-adm-publish-content-2.J | B136 | 81 min |  |
| RT-K1-adm-menus-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-menus-2.J, RT-K1-0.T | B136 | 34 min | 223 |
| K5-site-backup-5.T | K5 | Tovu | 3 (delete + repoint) | K5-site-backup-5.J | B136 | 38 min | 223 |
| K5-web-1.T | K5 | Tovu | 3 (delete + repoint) | K5-web-1.J, K4-seam-2.T | B136 | 40 min | 223 |
| K5-site-backup-7.J | K5 | Jini | 5 (move) | K5-site-backup-1.J, K5-site-backup-6.J, K5-site-backup-4.J, K5-site-backup-3.J, K5-site-backup-2.J, K4-seam-16.J, K5-agent-plugins-4.J, K5-agent-plugins-8.J, K5-site-backup-5.J, K4-seam-7.J, K4-seam-5.J, K4-seam-3.J, K4-seam-2.J, K4-seam-12.J | B137 | 98 min |  |
| K5-publish-content-6.J | K5 | Jini | 2 (move) | K5-publish-content-5.J, K5-publish-content-1.J, K5-contracts-core-10.J, K5-publish-content-4.J, K5-publish-content-3.J, K5-contracts-core-2.J, K5-publish-trust-1.J, P-publish-trust-1.J, V-post-5.J, K4-publish-content-2.J, K4-seam-1.J, K4-seam-5.J | B137 | 38 min |  |
| RT-K1-adm-posts-1.J | RT-K1 | Jini | 5 (move) | V-post-5.J, K5-contracts-headless-2.J, RT-K1-pub-http-1.J, RT-K1-adm-content-1.J, RT-K1-0.J, V-contracts-core-9.J, RT-K1-adm-plugin-hook-error-1.J | B137 | 98 min |  |
| RT-K1-adm-publish-content-5.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-publish-content-5.J, RT-K1-0.T | B137 | 41 min | 217 |
| RT-K1-pub-http-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-http-1.J | B137 | 26 min | 217 |
| K5-site-backup-6.T | K5 | Tovu | 2 (delete + repoint) | K5-site-backup-6.J, K4-seam-5.T, K4-seam-7.T | B137 | 55 min | 217 |
| K5-site-backup-8.J | K5 | Jini | 2 (move) | K5-site-backup-2.J, K5-site-backup-3.J, K5-site-backup-1.J, K5-custom-credentials-3.J, K5-custom-credentials-2.J, K5-webhooks-4.J, K5-source-control-1.J, K5-source-control-2.J, K5-source-control-3.J, K5-site-backup-7.J, K5-site-backup-4.J, K4-seam-7.J, K4-seam-2.J, K4-seam-1.J | B138 | 96 min |  |
| RT-K1-adm-system-11.J | RT-K1 | Jini | 2 (move) | K5-site-backup-7.J, K5-site-backup-1.J, K4-seam-3.J, RT-K1-0.J, K5-deployments-4.J, K5-deployments-5.J | B138 | 97 min |  |
| RT-K1-adm-pages-1.J | RT-K1 | Jini | 4 (move) | V-contracts-core-9.J, V-post-5.J, RT-K1-adm-posts-1.J, RT-K1-adm-plugin-hook-error-1.J, RT-K1-adm-content-1.J, RT-K1-0.J, K5-agent-plugins-6.J | B138 | 94 min |  |
| RT-K1-adm-posts-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-adm-posts-1.J, RT-K1-0.T | B138 | 46 min | 205 |
| K5-publish-content-6.T | K5 | Tovu | 2 (delete + repoint) | K5-publish-content-6.J, K4-publish-content-2.T, K4-seam-1.T, K4-seam-5.T | B138 | 26 min | 205 |
| K5-site-backup-7.T | K5 | Tovu | 5 (delete + repoint) | K5-site-backup-7.J, K4-seam-16.T, K4-seam-7.T, K4-seam-5.T, K4-seam-3.T, K4-seam-2.T, K4-seam-12.T | B138 | 72 min | 205 |
| K5-site-inspection-2.J | K5 | Jini | 2 (move) | K5-contracts-core-6.J, K5-site-inspection-1.J, K4-seam-2.J | B139 | 33 min |  |
| K5-deployments-7.J | K5 | Jini | 1 (move) | K5-deployments-5.J, K5-deployments-1.J, X-vendor-credentials-1.J, K5-contracts-core-2.J, K5-custom-credentials-1.J, K5-contracts-core-10.J, K5-deployments-6.J, K5-contracts-headless-2.J, K5-contracts-core-7.J, K5-contracts-core-1.J, K5-deployments-4.J, K5-vendor-credentials-1.J, K4-seam-7.J, K4-seam-5.J, K4-seam-13.J, K4-seam-1.J | B139 | 80 min |  |
| RT-K1-adm-system-15.J | RT-K1 | Jini | 2 (move) | K5-site-backup-7.J, K5-site-backup-1.J, K5-site-backup-3.J, RT-K1-0.J, K5-custom-credentials-3.J, K5-site-backup-8.J | B139 | 88 min |  |
| RT-K1-adm-pages-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-pages-1.J, RT-K1-0.T | B139 | 37 min | 197 |
| RT-K1-adm-system-11.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-11.J, K4-seam-3.T, RT-K1-0.T | B139 | 47 min | 197 |
| K5-site-backup-8.T | K5 | Tovu | 2 (delete + repoint) | K5-site-backup-8.J, K4-seam-7.T, K4-seam-2.T, K4-seam-1.T | B139 | 58 min | 197 |
| RT-K1-adm-publish-content-6.J | RT-K1 | Jini | 1 (move) | K5-publish-content-3.J, K5-publish-content-4.J, K4-publish-content-2.J, K5-publish-content-1.J, K5-publish-content-5.J, V-media-3.J, RT-K1-adm-publish-content-1.J, RT-K1-adm-publish-content-2.J, RT-K1-adm-publish-content-5.J, RT-K1-0.J | B140 | 66 min |  |
| RT-K1-adm-consent-1.J | RT-K1 | Jini | 1 (move) | K5-consent-1.J, RT-K1-0.J | B140 | 49 min |  |
| XC-6b | XC | Jini | — | XC-6a | B140 | 100 min |  |
| RT-K1-adm-system-15.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-system-15.J, RT-K1-0.T | B140 | 47 min | 193 |
| K5-site-inspection-2.T | K5 | Tovu | 2 (delete + repoint) | K5-site-inspection-2.J, K4-seam-2.T | B140 | 26 min | 193 |
| RT-K1-adm-system-12.J | RT-K1 | Jini | 1 (move) | K5-publish-content-4.J, K5-deployments-5.J, K5-deployments-1.J, RT-K1-0.J | B141 | 69 min |  |
| RT-K1-adm-site-1.J | RT-K1 | Jini | 1 (move) | K5-site-inspection-2.J, RT-K1-0.J | B141 | 40 min |  |
| XC-6c | XC | Jini | — | XC-6b | B141 | 110 min |  |
| RT-K1-adm-consent-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-consent-1.J, RT-K1-0.T | B141 | 26 min | 190 |
| RT-K1-adm-publish-content-6.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-publish-content-6.J, K4-publish-content-2.T, RT-K1-0.T | B141 | 40 min | 190 |
| K5-deployments-7.T | K5 | Tovu | 1 (delete + repoint) | K5-deployments-7.J, K4-seam-7.T, K4-seam-5.T, K4-seam-13.T, K4-seam-1.T | B141 | 43 min | 190 |
| RT-K1-pub-oauth-1.J | RT-K1 | Jini | 1 (move) | — | B142 | 28 min |  |
| RT-K1-adm-system-13.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-system-11.J, K5-site-backup-3.J, K5-site-backup-1.J, K5-site-backup-2.J, RT-K1-0.J | B142 | 102 min |  |
| XC-6d | XC | Jini | — | XC-6c | B142 | 110 min |  |
| RT-K1-adm-site-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-site-1.J, RT-K1-0.T | B142 | 21 min | 189 |
| RT-K1-pub-external-mcp-1.J | RT-K1 | Jini | 2 (move) | RT-K1-0.J, K5-api-connections-1.J, K5-external-mcp-2.J, K5-external-mcp-1.J, K5-contracts-core-3.J, RT-K1-pub-oauth-1.J | B143 | 79 min |  |
| RT-K1-adm-agent-plugins-2.J | RT-K1 | Jini | 2 (move) | K5-agent-plugins-5.J, RT-K1-adm-agent-plugins-1.J, RT-K1-0.J, K5-api-connections-2.J, K5-api-connections-1.J, RT-K1-pub-oauth-1.J | B143 | 78 min |  |
| RT-K1-adm-system-12.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-12.J, RT-K1-0.T | B143 | 35 min | 187 |
| RT-K1-pub-oauth-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-oauth-1.J | B143 | 25 min | 187 |
| RT-K1-pub-api-connections-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-3.J, K5-api-connections-2.J, K5-api-connections-1.J, RT-K1-pub-oauth-1.J, RT-K1-0.J | B144 | 53 min |  |
| RT-K1-adm-external-mcp-4.J | RT-K1 | Jini | 1 (move) | K5-api-connections-1.J, K5-external-mcp-2.J, K5-external-mcp-1.J, K5-contracts-core-3.J, RT-K1-pub-external-mcp-1.J, RT-K1-adm-external-mcp-1.J, RT-K1-0.J | B144 | 85 min |  |
| RT-K1-adm-agent-plugins-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-agent-plugins-2.J, RT-K1-0.T | B144 | 39 min | 182 |
| RT-K1-adm-system-13.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-system-13.J, RT-K1-0.T | B144 | 65 min | 182 |
| RT-K1-pub-external-mcp-1.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-external-mcp-1.J, RT-K1-0.T | B144 | 38 min | 182 |
| RT-K1-pub-publish-trust-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-2.J, K5-contracts-core-3.J, K5-publish-trust-1.J, P-publish-trust-1.J, K5-webhooks-4.J, K4-seam-1.J | B145 | 66 min |  |
| RT-K1-pub-ops-1.J | RT-K1 | Jini | 1 (move) | K4-seam-23.J | B145 | 57 min |  |
| RT-K1-adm-external-mcp-4.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-external-mcp-4.J, RT-K1-0.T | B145 | 47 min | 180 |
| RT-K1-pub-api-connections-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-api-connections-1.J, RT-K1-0.T | B145 | 32 min | 180 |
| RT-K1-pub-site-render-context-1.J | RT-K1 | Jini | 1 (move) | K5-post-3.J | B146 | 23 min |  |
| RT-K1-pub-site-assistant-confirm-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-3.J, K4-seam-10.J, K4-seam-15.J, RT-K1-0.J | B146 | 47 min |  |
| RT-K1-pub-ops-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-ops-1.J, K4-seam-23.T | B146 | 31 min | 179 |
| RT-K1-pub-site-site-chat-markup-1.J | RT-K1 | Jini | 1 (move) | — | B147 | 27 min |  |
| RT-K1-pub-site-share-1.J | RT-K1 | Jini | 1 (move) | K5-site-backup-3.J, K5-site-backup-2.J | B147 | 49 min |  |
| RT-K1-pub-publish-trust-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-publish-trust-1.J, K4-seam-1.T | B147 | 32 min | 176 |
| RT-K1-pub-site-assistant-confirm-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-assistant-confirm-1.J, K4-seam-10.T, K4-seam-15.T, RT-K1-0.T | B147 | 24 min | 176 |
| RT-K1-pub-site-render-context-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-render-context-1.J | B147 | 48 min | 176 |
| RT-K1-pub-visitor-analytics-1.J | RT-K1 | Jini | 1 (move) | K5-analytics-1.J, K4-seam-6.J | B148 | 26 min |  |
| RT-K1-pub-site-worker-sandbox-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-render-context-1.J, K4-seam-23.J | B148 | 36 min |  |
| RT-K1-pub-site-share-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-share-1.J | B148 | 30 min | 174 |
| RT-K1-pub-site-site-chat-markup-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-site-chat-markup-1.J | B148 | 29 min | 174 |
| RT-K1-pub-site-handlebars-sandbox-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-worker-sandbox-1.J | B149 | 23 min |  |
| RT-K1-pub-site-3.J | RT-K1 | Jini | 3 (move) | RT-K1-pub-visitor-analytics-1.J, K5-platform-mail-2.J, K5-newsletter-1.J, K5-newsletter-2.J, K4-seam-1.J, C-platform-html-1.J, RT-K1-0.J | B149 | 96 min |  |
| RT-K1-pub-site-worker-sandbox-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-worker-sandbox-1.J, K4-seam-23.T | B149 | 29 min | 172 |
| RT-K1-pub-visitor-analytics-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-visitor-analytics-1.J, K4-seam-6.T | B149 | 32 min | 172 |
| V-theme-6.J | V | Jini | 1 (move) | K5-theme-4.J, K5-theme-3.J, K5-theme-1.J, K5-theme-5.J, K5-theme-2.J, T-theme-1.J | B150 | 23 min |  |
| RT-K1-pub-site-liquid-sandbox-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-worker-sandbox-1.J | B150 | 22 min |  |
| RT-K1-pub-site-3.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-pub-site-3.J, K4-seam-1.T, RT-K1-0.T | B150 | 54 min | 168 |
| RT-K1-pub-site-handlebars-sandbox-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-handlebars-sandbox-1.J | B150 | 22 min | 168 |
| K5-site-export-1.J | K5 | Jini | 5 (move) | C-platform-html-1.J, K5-contracts-core-2.J, K5-theme-1.J, X-media-1.J, V-media-3.J, K4-seam-13.J, V-post-5.J, V-theme-6.J, K5-platform-routing-1.J, K5-presentation-1.J, K4-seam-21.J | B151 | 99 min |  |
| K5-post-6.J | K5 | Jini | 11 (move) | K5-presentation-1.J, V-theme-6.J, K5-post-3.J, K5-post-1.J, T-post-1.J, K5-post-2.J, K5-post-4.J, K4-seam-9.J, K5-site-inspection-1.J, K5-contracts-core-3.J, K5-platform-routing-1.J, K5-contracts-core-6.J, V-contracts-core-9.J, X-content-duplication-1.J, K4-seam-10.J, K5-contracts-core-2.J, K4-seam-1.J | B151 | 89 min |  |
| K5-pages-1.J | K5 | Jini | 8 (move) | K5-contracts-core-2.J, X-identity-1.J, K5-agent-plugins-6.J, K5-contracts-core-1.J, V-post-5.J, K5-contracts-core-3.J, K5-post-3.J, K4-contracts-core-5.J, X-pages-1.J, V-theme-6.J, C-platform-html-1.J | B151 | 91 min |  |
| RT-K1-pub-site-liquid-sandbox-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-liquid-sandbox-1.J | B151 | 21 min | 166 |
| V-theme-6.T | V | Tovu | 1 (delete + repoint) | V-theme-6.J | B151 | 111 min | 166 |
| K5-site-export-2.J | K5 | Jini | 3 (move) | K5-theme-3.J, K5-theme-4.J, K5-site-export-1.J, K5-contracts-core-2.J, K4-contracts-headless-1.J | B152 | 62 min |  |
| K5-email-templates-1.J | K5 | Jini | 4 (move) | K5-pages-1.J, K5-contracts-core-3.J, V-post-5.J, K5-contracts-core-4.J | B152 | 67 min |  |
| RT-K1-adm-themes-1.J | RT-K1 | Jini | 1 (move) | T-theme-1.J, V-theme-6.J, V-post-5.J, RT-K1-adm-content-1.J, RT-K1-0.J | B152 | 108 min |  |
| RT-K1-adm-pages-2.J | RT-K1 | Jini | 2 (move) | V-contracts-core-9.J, V-post-5.J, RT-K1-adm-posts-1.J, RT-K1-adm-plugin-hook-error-1.J, RT-K1-adm-content-1.J, RT-K1-0.J, K5-agent-plugins-6.J, K5-pages-1.J, R-admin-http-1.J | B152 | 66 min |  |
| K5-post-6.T | K5 | Tovu | 11 (delete + repoint) | K5-post-6.J, K4-seam-9.T, K4-seam-10.T, K4-seam-1.T | B152 | 81 min | 150 |
| K5-site-export-1.T | K5 | Tovu | 5 (delete + repoint) | K5-site-export-1.J, K4-seam-13.T, K4-seam-21.T | B152 | 59 min | 150 |
| RT-K1-adm-themes-2.J | RT-K1 | Jini | 3 (move) | V-theme-6.J, RT-K1-adm-content-1.J, RT-K1-0.J, K5-contracts-core-2.J, K5-theme-2.J, RT-K1-adm-sites-1.J, T-theme-1.J, RT-K1-adm-themes-1.J | B153 | 86 min |  |
| RT-K1-adm-email-templates-1.J | RT-K1 | Jini | 1 (move) | K5-email-templates-1.J, K5-pages-1.J, R-admin-http-1.J, RT-K1-adm-content-1.J, RT-K1-0.J | B153 | 72 min |  |
| RT-K1-adm-themes-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-themes-1.J, RT-K1-0.T | B153 | 68 min | 138 |
| K5-pages-1.T | K5 | Tovu | 8 (delete + repoint) | K5-pages-1.J, K4-contracts-core-5.T | B153 | 82 min | 138 |
| K5-site-export-2.T | K5 | Tovu | 3 (delete + repoint) | K5-site-export-2.J, K4-contracts-headless-1.T | B153 | 48 min | 138 |
| K5-webmcp-1.J | K5 | Jini | 1 (move) | X-webmcp-1.J | B154 | 33 min |  |
| RT-K1-adm-presentation-1.J | RT-K1 | Jini | 4 (move) | K5-presentation-1.J, K5-contracts-headless-2.J, T-theme-1.J, V-theme-6.J, RT-K1-adm-content-1.J, RT-K1-0.J, K5-theme-2.J, RT-K1-adm-themes-2.J | B154 | 82 min |  |
| RT-K1-adm-themes-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-adm-themes-2.J, RT-K1-0.T | B154 | 37 min | 131 |
| K5-email-templates-1.T | K5 | Tovu | 4 (delete + repoint) | K5-email-templates-1.J | B154 | 43 min | 131 |
| X-change-sets-1.J | P9 (X) | Jini | 1 (move) | — | B155 | 60 min |  |
| RT-K1-pub-middleware-1.J | RT-K1 | Jini | 7 (move) | K4-seam-23.J, R-public-http-1.J, K5-theme-1.J, K5-theme-2.J, K5-webmcp-1.J, K5-contracts-core-3.J, K5-consent-1.J, K5-post-1.J, K4-seam-6.J, RT-K1-0.J | B155 | 96 min |  |
| RT-K1-adm-presentation-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-presentation-1.J, RT-K1-0.T | B155 | 40 min | 126 |
| K5-webmcp-1.T | K5 | Tovu | 1 (delete + repoint) | K5-webmcp-1.J | B155 | 23 min | 126 |
| RT-K1-adm-owner-recovery-routes-1.J | RT-K1 | Jini | 1 (move) | RT-K1-adm-owner-mfa-deps-1.J, RT-K1-pub-middleware-1.J, RT-K1-adm-users-1.J, K5-contracts-core-3.J, RT-K1-0.J | B156 | 54 min |  |
| RT-K1-adm-owner-mfa-routes-1.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-3.J, RT-K1-pub-middleware-1.J, RT-K1-adm-owner-mfa-deps-1.J, RT-K1-0.J | B156 | 54 min |  |
| RT-K1-adm-pages-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-pages-2.J, RT-K1-0.T | B156 | 30 min | 116 |
| RT-K1-pub-middleware-1.T | RT-K1 | Tovu | 7 (delete + repoint) | RT-K1-pub-middleware-1.J, K4-seam-23.T, K4-seam-6.T, RT-K1-0.T | B156 | 77 min | 116 |
| X-change-sets-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-change-sets-1.J | B156 | 60 min | 116 |
| RT-K1-pub-middleware-2.J | RT-K1 | Jini | 1 (move) | K5-contracts-core-2.J, K5-contracts-core-3.J, K5-contracts-headless-2.J, K5-theme-4.J, K5-consent-1.J, RT-K1-pub-site-1.J, RT-K1-pub-middleware-1.J, K4-seam-6.J, RT-K1-0.J | B157 | 112 min |  |
| V-change-sets-1.J | V | Jini | 1 (move) | K5-contracts-core-4.J, K5-contracts-core-6.J, X-change-sets-1.J | B157 | 23 min |  |
| RT-K1-adm-email-templates-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-email-templates-1.J, RT-K1-0.T | B157 | 42 min | 114 |
| RT-K1-adm-owner-mfa-routes-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-owner-mfa-routes-1.J, RT-K1-0.T | B157 | 30 min | 114 |
| X-image-transform-1.J | P9 (X) | Jini | 1 (move) | — | B158 | 60 min |  |
| RT-K1-adm-change-sets-1.J | RT-K1 | Jini | 4 (move) | V-change-sets-1.J, RT-K1-adm-content-1.J, RT-K1-0.J, K5-contracts-core-6.J | B158 | 74 min |  |
| RT-K1-adm-owner-recovery-routes-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-adm-owner-recovery-routes-1.J, RT-K1-0.T | B158 | 30 min | 111 |
| V-change-sets-1.T | V | Tovu | 1 (delete + repoint) | V-change-sets-1.J | B158 | 17 min | 111 |
| RT-K1-pub-middleware-2.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-middleware-2.J, K4-seam-6.T, RT-K1-0.T | B158 | 60 min | 111 |
| X-permanent-delete-1.J | P9 (X) | Jini | 1 (move) | — | B159 | 60 min |  |
| K4-image-transform-1.J | K4 | Jini | 1 (move) | K4-contracts-core-5.J, K5-contracts-core-10.J, K5-fs-files-1.J, K4-asset-transfer-1.J, K5-theme-5.J, K5-media-import-1.J, X-image-transform-1.J, K4-seam-1.J | B159 | 25 min |  |
| RT-K1-adm-change-sets-1.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-change-sets-1.J, RT-K1-0.T | B159 | 37 min | 106 |
| X-image-transform-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-image-transform-1.J | B159 | 60 min | 106 |
| X-redirects-1.J | P9 (X) | Jini | 1 (move) | — | B160 | 60 min |  |
| K5-permanent-delete-1.J | K5 | Jini | 1 (move) | K5-contracts-core-10.J, K4-contracts-core-5.J, X-permanent-delete-1.J, K5-deployments-7.J, K4-seam-10.J | B160 | 32 min |  |
| K4-image-transform-1.T | K4 | Tovu | 1 (delete + repoint) | K4-image-transform-1.J, K4-contracts-core-5.T, K4-asset-transfer-1.T, K4-seam-1.T | B160 | 17 min | 105 |
| X-seo-1.J | P9 (X) | Jini | 1 (move) | — | B161 | 60 min |  |
| K5-redirects-1.J | K5 | Jini | 4 (move) | K5-contracts-core-6.J, K5-contracts-core-4.J, K5-publish-content-1.J, K5-publish-content-3.J, K4-publish-content-2.J, X-redirects-1.J | B161 | 66 min |  |
| K5-permanent-delete-1.T | K5 | Tovu | 1 (delete + repoint) | K5-permanent-delete-1.J, K4-contracts-core-5.T, K4-seam-10.T | B161 | 22 min | 103 |
| X-redirects-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-redirects-1.J | B161 | 60 min | 103 |
| K5-seo-1.J | K5 | Jini | 4 (move) | K4-seam-5.J, K5-settings-3.J, V-post-5.J, V-media-3.J, V-members-3.J, K5-platform-routing-1.J, V-contracts-core-9.J, X-seo-1.J, K5-contracts-core-6.J, K5-contracts-core-4.J | B162 | 55 min |  |
| RT-K1-pub-site-2.J | RT-K1 | Jini | 4 (move) | RT-K1-pub-visitor-analytics-1.J, K5-analytics-1.J, K4-seam-16.J, K5-contracts-core-2.J, K5-contracts-core-3.J, K4-seam-8.J, RT-K1-0.J, X-seo-1.J, K5-post-3.J, K5-platform-routing-1.J, RT-K1-pub-site-1.J | B162 | 90 min |  |
| K5-redirects-1.T | K5 | Tovu | 4 (delete + repoint) | K5-redirects-1.J, K4-publish-content-2.T | B162 | 45 min | 97 |
| X-permanent-delete-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-permanent-delete-1.J | B162 | 60 min | 97 |
| X-seo-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-seo-1.J | B162 | 60 min | 97 |
| RT-K1-pub-members-1.J | RT-K1 | Jini | 5 (move) | V-members-3.J, RT-K1-pub-visitor-analytics-1.J, K5-contracts-core-3.J, K5-platform-mail-2.J, RT-K1-pub-site-2.J, K4-seam-5.J, RT-K1-0.J | B163 | 96 min |  |
| RT-K1-adm-seo-2.J | RT-K1 | Jini | 2 (move) | K5-seo-1.J, RT-K1-adm-seo-1.J, RT-K1-0.J | B163 | 53 min |  |
| RT-K1-pub-site-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-pub-site-2.J, K4-seam-16.T, K4-seam-8.T, RT-K1-0.T | B163 | 47 min | 89 |
| K5-seo-1.T | K5 | Tovu | 4 (delete + repoint) | K5-seo-1.J, K4-seam-5.T | B163 | 54 min | 89 |
| RT-K1-pub-site-4.J | RT-K1 | Jini | 2 (move) | V-members-3.J, RT-K1-0.J, K5-publish-content-1.J, K5-post-1.J, K5-members-1.J, RT-K1-adm-media-1.J, RT-K1-pub-members-1.J | B164 | 87 min |  |
| RT-K1-pub-members-2.J | RT-K1 | Jini | 3 (move) | V-members-3.J, RT-K1-pub-members-1.J, RT-K1-0.J, RT-K1-pub-visitor-analytics-1.J, K5-platform-mail-2.J | B164 | 90 min |  |
| RT-K1-adm-seo-2.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-adm-seo-2.J, RT-K1-0.T | B164 | 26 min | 82 |
| RT-K1-pub-members-1.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-pub-members-1.J, K4-seam-5.T, RT-K1-0.T | B164 | 80 min | 82 |
| RT-K1-pub-site-5.J | RT-K1 | Jini | 4 (move) | K5-post-3.J, K5-members-1.J, V-members-3.J, RT-K1-pub-members-1.J, RT-K1-0.J, K5-theme-1.J, K5-theme-3.J, K5-platform-routing-1.J, RT-K1-pub-site-4.J, RT-K1-pub-site-site-chat-markup-1.J, K5-widgets-1.J, K5-post-1.J, RT-K1-pub-site-1.J, K5-plugin-runtime-1.J, R-public-http-1.J | B165 | 102 min |  |
| RT-K1-pub-members-3.J | RT-K1 | Jini | 3 (move) | RT-K1-pub-members-1.J, RT-K1-0.J, V-members-3.J, RT-K1-pub-members-2.J, K5-member-login-1.J | B165 | 82 min |  |
| RT-K1-pub-members-2.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-pub-members-2.J, RT-K1-0.T | B165 | 45 min | 77 |
| RT-K1-pub-site-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-site-4.J, RT-K1-0.T | B165 | 43 min | 77 |
| RT-K1-pub-members-5.J | RT-K1 | Jini | 2 (move) | RT-K1-pub-members-1.J, RT-K1-pub-visitor-analytics-1.J, K5-member-login-1.J, RT-K1-pub-members-3.J, V-members-3.J, K5-contracts-core-3.J | B166 | 85 min |  |
| RT-K1-pub-members-4.J | RT-K1 | Jini | 2 (move) | V-members-3.J, RT-K1-pub-members-1.J, RT-K1-pub-members-3.J, RT-K1-pub-visitor-analytics-1.J, K5-member-login-1.J, K5-contracts-core-3.J | B166 | 75 min |  |
| RT-K1-pub-members-3.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-pub-members-3.J, RT-K1-0.T | B166 | 51 min | 70 |
| RT-K1-pub-site-5.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-pub-site-5.J, RT-K1-0.T | B166 | 63 min | 70 |
| RT-K1-pub-content-1.J | RT-K1 | Jini | 1 (move) | K5-post-1.J, K5-members-1.J, V-members-3.J, RT-K1-pub-http-1.J, RT-K1-pub-members-1.J, RT-K1-0.J | B167 | 44 min |  |
| RT-K1-pub-commerce-1.J | RT-K1 | Jini | 1 (move) | C-platform-html-1.J, K5-members-1.J, K5-contracts-core-3.J, RT-K1-pub-members-3.J, RT-K1-pub-site-2.J, RT-K1-0.J | B167 | 73 min |  |
| RT-K1-pub-members-4.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-members-4.J | B167 | 41 min | 68 |
| RT-K1-pub-plugin-contributions-1.J | RT-K1 | Jini | 1 (move) | K5-members-1.J, RT-K1-pub-members-1.J, K4-seam-10.J, RT-K1-0.J | B168 | 58 min |  |
| RT-K1-pub-members-6.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-members-1.J, K5-member-login-1.J, K5-contracts-core-3.J, RT-K1-pub-members-4.J, RT-K1-pub-members-3.J | B168 | 47 min |  |
| RT-K1-pub-commerce-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-commerce-1.J, RT-K1-0.T | B168 | 42 min | 64 |
| RT-K1-pub-content-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-content-1.J, RT-K1-0.T | B168 | 24 min | 64 |
| RT-K1-pub-members-5.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-members-5.J | B168 | 45 min | 64 |
| X-widgets-1.J | P9 (X) | Jini | 1 (move) | — | B169 | 60 min |  |
| RT-K1-pub-site-seo-render-context-1.J | RT-K1 | Jini | 1 (move) | K5-seo-1.J | B169 | 22 min |  |
| RT-K1-pub-members-6.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-members-6.J | B169 | 27 min | 62 |
| RT-K1-pub-plugin-contributions-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-plugin-contributions-1.J, K4-seam-10.T, RT-K1-0.T | B169 | 33 min | 62 |
| RT-K1-pub-site-render-1.J | RT-K1 | Jini | 12 (move) | R-public-http-1.J, C-platform-html-1.J, RT-K1-pub-site-site-chat-markup-1.J, T-post-1.J, T-theme-1.J, X-entries-1.J, RT-K1-pub-site-render-context-1.J, X-media-1.J, X-widgets-1.J | B170 | 73 min |  |
| RT-K1-pub-site-6.J | RT-K1 | Jini | 4 (move) | RT-K1-pub-site-1.J, RT-K1-pub-visitor-analytics-1.J, K5-platform-routing-1.J, K5-forms-1.J, K5-contracts-core-3.J, R-public-http-1.J, RT-K1-0.J, RT-K1-pub-members-1.J, K4-seam-15.J, K4-seam-23.J, RT-K1-pub-site-seo-render-context-1.J, K5-settings-3.J, RT-K1-adm-seo-1.J | B170 | 99 min |  |
| RT-K1-pub-site-seo-render-context-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-seo-render-context-1.J | B170 | 22 min | 60 |
| X-widgets-1.T | P9 (X) | Tovu | 1 (delete + repoint) | X-widgets-1.J | B170 | 60 min | 60 |
| RT-K1-pub-site-render-2.J | RT-K1 | Jini | 6 (move) | RT-K1-pub-site-render-1.J, C-platform-html-1.J, R-public-http-1.J, RT-K1-pub-site-render-context-1.J, K5-theme-1.J, V-theme-6.J, RT-K1-pub-site-site-chat-markup-1.J, T-theme-1.J, K5-post-3.J, X-media-1.J | B171 | 60 min |  |
| RT-K1-pub-site-6.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-pub-site-6.J, RT-K1-0.T, K4-seam-15.T, K4-seam-23.T | B171 | 41 min | 44 |
| RT-K1-pub-site-render-1.T | RT-K1 | Tovu | 12 (delete + repoint) | RT-K1-pub-site-render-1.J | B171 | 94 min | 44 |
| RT-K1-pub-site-7.J | RT-K1 | Jini | 5 (move) | RT-K1-pub-site-seo-render-context-1.J, RT-K1-pub-site-4.J, R-public-http-1.J, RT-K1-pub-site-1.J, RT-K1-0.J, RT-K1-adm-seo-1.J, K5-widgets-1.J, K5-post-1.J, RT-K1-pub-site-render-2.J, K5-post-3.J, V-theme-6.J, X-media-1.J, RT-K1-pub-site-render-context-1.J | B172 | 80 min |  |
| RT-K1-adm-widgets-4.J | RT-K1 | Jini | 4 (move) | K5-widgets-1.J, RT-K1-adm-widgets-1.J, RT-K1-0.J, V-theme-6.J, K5-theme-2.J, RT-K1-pub-site-render-2.J | B172 | 93 min |  |
| RT-K1-pub-site-render-2.T | RT-K1 | Tovu | 6 (delete + repoint) | RT-K1-pub-site-render-2.J | B172 | 106 min | 38 |
| RT-K1-pub-site-render-3.J | RT-K1 | Jini | 2 (move) | RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-render-1.J, RT-K1-pub-site-render-2.J, C-platform-html-1.J, R-public-http-1.J, V-theme-6.J | B173 | 25 min |  |
| RT-K1-pub-site-8.J | RT-K1 | Jini | 5 (move) | K5-post-3.J, K5-post-1.J, V-members-3.J, K5-theme-2.J, K5-theme-1.J, K5-platform-routing-1.J, RT-K1-pub-site-render-2.J, RT-K1-pub-site-4.J, RT-K1-pub-site-1.J, R-public-http-1.J, RT-K1-pub-site-2.J, RT-K1-pub-site-5.J, RT-K1-pub-site-7.J, RT-K1-0.J, T-theme-1.J, X-content-types-1.J, K5-entries-1.J, RT-K1-pub-site-site-chat-markup-1.J, K5-widgets-1.J, V-theme-6.J, K5-theme-3.J, RT-K1-pub-site-render-1.J, K5-theme-4.J, K5-comments-1.J | B173 | 97 min |  |
| RT-K1-pub-site-7.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-pub-site-7.J, RT-K1-0.T | B173 | 50 min | 33 |
| RT-K1-pub-site-handlebars-render-1.J | RT-K1 | Jini | 1 (move) | T-theme-1.J, RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-render-3.J, RT-K1-pub-site-render-2.J, RT-K1-pub-site-handlebars-sandbox-1.J | B174 | 23 min |  |
| RT-K1-pub-site-bare-page-1.J | RT-K1 | Jini | 1 (move) | V-post-5.J, RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-render-2.J | B174 | 23 min |  |
| RT-K1-adm-widgets-4.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-widgets-4.J, RT-K1-0.T | B174 | 41 min | 22 |
| RT-K1-pub-site-8.T | RT-K1 | Tovu | 5 (delete + repoint) | RT-K1-pub-site-8.J, RT-K1-0.T | B174 | 62 min | 22 |
| RT-K1-pub-site-render-3.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-site-render-3.J | B174 | 28 min | 22 |
| RT-K1-pub-site-handlebars-worker-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-handlebars-render-1.J | B175 | 22 min |  |
| RT-K1-adm-posts-2.J | RT-K1 | Jini | 4 (move) | V-post-5.J, RT-K1-adm-posts-1.J, RT-K1-adm-content-1.J, RT-K1-0.J, V-contracts-core-9.J, RT-K1-adm-plugin-hook-error-1.J, V-members-3.J, K5-presentation-1.J, K5-platform-routing-1.J, V-theme-6.J, K5-theme-4.J, RT-K1-pub-site-8.J, RT-K1-pub-site-7.J, RT-K1-pub-site-5.J, RT-K1-pub-site-bare-page-1.J, K5-settings-3.J | B175 | 94 min |  |
| RT-K1-pub-site-bare-page-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-bare-page-1.J | B175 | 21 min | 20 |
| RT-K1-pub-site-handlebars-render-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-handlebars-render-1.J | B175 | 21 min | 20 |
| RT-K1-pub-site-render-site-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-site-chat-markup-1.J, K5-post-3.J, V-theme-6.J, K5-theme-1.J, K5-theme-2.J, C-platform-html-1.J, RT-K1-pub-site-render-1.J, RT-K1-pub-site-render-2.J, RT-K1-pub-site-render-3.J, RT-K1-pub-site-liquid-sandbox-1.J, RT-K1-pub-site-handlebars-sandbox-1.J, K4-seam-6.J | B176 | 31 min |  |
| RT-K1-pub-site-liquid-render-1.J | RT-K1 | Jini | 1 (move) | T-theme-1.J, RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-render-3.J, RT-K1-pub-site-render-2.J, RT-K1-pub-site-liquid-sandbox-1.J | B176 | 23 min |  |
| RT-K1-adm-posts-2.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-adm-posts-2.J, RT-K1-0.T | B176 | 45 min | 15 |
| RT-K1-pub-site-handlebars-worker-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-handlebars-worker-1.J | B176 | 20 min | 15 |
| RT-K1-pub-site-9.J | RT-K1 | Jini | 3 (move) | RT-K1-pub-site-1.J, RT-K1-pub-middleware-1.J, K5-theme-4.J, RT-K1-pub-site-render-site-1.J, RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-5.J, RT-K1-0.J, K5-comments-1.J, RT-K1-pub-site-site-chat-markup-1.J, K5-post-3.J, V-members-3.J, K5-theme-3.J, K5-platform-routing-1.J, RT-K1-pub-site-bare-page-1.J, RT-K1-pub-site-2.J, RT-K1-pub-site-7.J, RT-K1-pub-site-8.J | B177 | 95 min |  |
| RT-K1-pub-middleware-3.J | RT-K1 | Jini | 4 (move) | T-theme-1.J, K5-theme-4.J, RT-K1-0.J, K5-theme-3.J, RT-K1-pub-middleware-1.J, R-public-http-1.J, V-theme-6.J, V-post-5.J, RT-K1-adm-themes-1.J, RT-K1-pub-site-render-site-1.J, RT-K1-pub-site-render-context-1.J, RT-K1-pub-site-7.J, RT-K1-pub-site-5.J, RT-K1-pub-site-1.J | B177 | 98 min |  |
| RT-K1-pub-site-liquid-render-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-liquid-render-1.J | B177 | 21 min | 14 |
| RT-K1-pub-site-liquid-worker-1.J | RT-K1 | Jini | 1 (move) | RT-K1-pub-site-liquid-render-1.J | B178 | 22 min |  |
| RT-K1-pub-site-10.J | RT-K1 | Jini | 3 (move) | K5-members-1.J, K5-post-1.J, RT-K1-pub-members-1.J, RT-K1-pub-site-9.J, RT-K1-0.J, RT-K1-pub-site-site-chat-markup-1.J, K5-post-3.J, V-members-3.J, RT-K1-pub-middleware-1.J, K5-theme-4.J, K5-theme-3.J, RT-K1-pub-site-render-site-1.J, RT-K1-pub-site-4.J, RT-K1-pub-site-1.J, RT-K1-pub-site-7.J, RT-K1-pub-site-5.J, RT-K1-pub-site-2.J, RT-K1-pub-site-8.J, RT-K1-pub-visitor-analytics-1.J | B178 | 101 min |  |
| RT-K1-pub-middleware-3.T | RT-K1 | Tovu | 4 (delete + repoint) | RT-K1-pub-middleware-3.J, RT-K1-0.T | B178 | 52 min | 6 |
| RT-K1-pub-site-9.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-pub-site-9.J, RT-K1-0.T | B178 | 47 min | 6 |
| RT-K1-pub-site-render-site-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-render-site-1.J, K4-seam-6.T | B178 | 35 min | 6 |
| RT-K1-pub-site-11.J | RT-K1 | Jini | 2 (move) | K5-post-1.J, K5-members-1.J, RT-K1-pub-middleware-1.J, K5-theme-4.J, K5-theme-3.J, K5-platform-routing-1.J, RT-K1-pub-site-1.J, RT-K1-pub-site-7.J, RT-K1-pub-site-5.J, RT-K1-pub-site-8.J, RT-K1-pub-site-9.J, RT-K1-pub-site-10.J, RT-K1-0.J | B179 | 66 min |  |
| RT-K1-pub-site-10.T | RT-K1 | Tovu | 3 (delete + repoint) | RT-K1-pub-site-10.J, RT-K1-0.T | B179 | 42 min | 2 |
| RT-K1-pub-site-liquid-worker-1.T | RT-K1 | Tovu | 1 (delete + repoint) | RT-K1-pub-site-liquid-worker-1.J | B179 | 20 min | 2 |
| RT-K1-pub-site-11.T | RT-K1 | Tovu | 2 (delete + repoint) | RT-K1-pub-site-11.J, RT-K1-0.T | B180 | 41 min | 0 |
