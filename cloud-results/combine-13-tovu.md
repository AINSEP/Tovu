READY TO SWITCH 0d7f78fa4

All 3 merges and Part B are done and pushed. One break was found and fixed: ex-sh deleted a shell that 6 overlay tests imported by relative path (`0d7f78fa4`, test import lines only). No new red test remains: every red in the node suite, admin full and desktop full is BASE-RED (identical at `41e948ee4a`, or in combine-12's record). Admin and desktop equal combine-12 exactly. 7 mutations run: 6 killed in Tovu; 1 (M3-a) survives Tovu's suite and is killed only by Jini's own test (listed). FILES-LEFT 2,509 → **2,486** (−23). No production bug found.

# combine-13 TOVU (2026-11-22) — `integ/merge-13-2026-11-22`

Unattended cloud run, Opus high.
- **Base:** `origin/integ/merge-12-2026-11-22` `41e948ee4a`.
- **Jini:** `origin/integ/merge-13-2026-11-22` `7c4ee7881` (READY content `e4e3bf175`), checked out detached. Nothing merged locally. Nothing pushed to Jini.
- **Pushed:** only `integ/merge-13-2026-11-22`, with a plain `git push` after every merge, every record and the fix.
- **Not used / not touched:** no subagents, no codebase-memory tools, no force-push, no `--no-verify`, no `git pull --rebase`, no tags, no publish. `main`, `refactor/terra` and `plan/*` were only fetched. `codex/ex-html-tovu` was only read (report-only, skipped as instructed).
- **`_optional = {}` pads:** none removed or renamed on a surviving declaration. The only removed pad lines are in the files that moved to Jini (`post-author`, `watermark`, `request-facts`, `strict-base64`). All four keep their pad in Jini `packages/core/src/contracts/site/*`. `captureRequestFacts` keeps its pad; only its return type changed (`TovuRequestFacts` → `RequestFacts`).

## Setup
- Read first: `cloud-results/combine-12-tovu.md` (Setup), Jini `cloud-results/combine-13-jini.md` ("New exports the Tovu run must consume"), and the Tovu branch reports `ex-sh.md`, `ex-core.md`, `ex-export.md`, `ex-html.md`. Also read: `plans/P9F-feature-lanes.md` on `origin/plan/whats-left-1122` (the 2,479 definition).
- Tools: Node 24.22.3 (`/opt/node24`), npm 11.19.1, pnpm 10.33.2.
- Jini at `7c4ee7881`:
  - All `node_modules` deleted first.
  - `pnpm install --frozen-lockfile`: 0.
  - `pnpm --no-bail -r build`: 0 (0 `error TS`).
  - `git status` clean before and after the run.
- Tovu:
  - Branch created from `41e948ee4a`.
  - `npm ci --ignore-scripts` in root, admin, desktop and site-chat: 0/0/0/0.
  - `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`: 0 (82 links changed).
  - `packages/contracts` tsc: 0. `packages/sdk` build: 0.
- PostgreSQL 16:
  - Role `la`; DBs `jini_chat_test_c13` (`TOVU_CHAT_TEST_POSTGRES_URL`) and `commerce_test` (`COMMERCE_PG_URL`).
  - `PGHOST/PGUSER/PGPASSWORD` set.
- Playwright: `PLAYWRIGHT_BROWSERS_PATH=/home/user/pwb`, which symlinks `/opt/pw-browsers/*` plus `chromium{,_headless_shell}-1228 → -1243`. Nothing was installed.
- `origin/refactor/terra` and `origin/main` fetched (why-comments base).
- **Gate set:** the same 16 as combine-12: size, boundaries, admin tsc, desktop tsc ×4, typecheck(+e2e), errors, worker-import-graph, complexity, hooks, typecheck:scripts, why-comments, typecheck:tests, architecture.
  - It ran on the base first, after each merge, and at the tip `0d7f78fa4`.
  - **Base = combine-12 final, byte for byte, after normalising timings.** Linking Jini merge-13 changed no Tovu gate.
- **Test runner:** each file alone under a 15-min watchdog, 3 in parallel. Node files use `node --test` with the root `npm test` imports. Admin files use `npx vitest run <file>`.
- **Base attribution:** red files were re-run at `41e948ee4a`.
  - m1's reds ran with the main tree detached at the base.
  - The final suite's reds ran in a clean `git worktree` at `41e948ee4a`, sharing the same `node_modules`. This let the main tree keep running.
- **Mutations:** every named mutation is a Tovu consumer of code that now lives in Jini. Each plant therefore went into the **linked Jini `dist/` file** that Tovu imports (the Jini git tree is untouched).
  - Then the Tovu consumer tests were run.
  - The file was restored by byte copy, `cmp` checked it identical, and the tests were run again green.

## Part A — merges (raw: `combine-13-tovu-m<N>-tests.txt`, `…-m<N>-mutations.txt`, `…-m<N>-gates-vs-base.txt`)

| # | branch @ SHA | merge commit | conflicts | tests after merge | mutations (must go red) | gates vs base | status |
|---|---|---|---|---|---|---|---|
| 1 | `codex/ex-sh-tovu` @ `10905eaa1e` | `f9d2f0226` + test fix `0d7f78fa4` | none | 240 files: every test it changed + all tests under `features/{entries,taxonomy,form-destinations,member-login,database-transfer,database,recovery,navigation,analytics,custom-credentials}`, external-mcp h1a and composition `form-*` (its report's sets). **3,046 pass / 41 fail in 10 files**, all 10 **identical at `41e948ee4a`** (list under Tests). **Missed by the branch and by this list:** 6 `content/agent-plugin-overlays` tests imported the deleted `mcp-metadata.ts` by relative path → `ERR_MODULE_NOT_FOUND`. Found by a repo-wide string sweep for every deleted path, fixed in `0d7f78fa4` (below) | none named: the lane plan says "Mutation: none (no behaviour)". The repoints bind the same Jini objects the shells forwarded | equal, apart from counts. Architecture runtime-only propagation 3.27 → 3.28 (same single ratchet row as base; the ex-sh report saw the same). why-comments 80 open, the same set (13 new shell-header rows are in the debt file) | DONE; 1 break fixed |
| 2 | `codex/ex-core-tovu` @ `a053aa2b04` | `1242ca802` | **4, both intents kept** (below) | 173 files (changed tests + direct importers of changed production; hub skipped: `features/post/index.ts`, 148 importers). **2,579 pass / 1 fail**: `resolve-html-page-embeds.integration` 64/1, BASE-RED | **4/4 killed** (`combine-13-tovu-m2-mutations.txt`): **M2-a** (ex-core's named mutation) negates the strict-base64 decode guard → upload 2/10, replace 4/12 red. **M2-b** puts the request-facts reader back on the old `"tovuRequestFacts"` key → request-facts 10/1, admin-frontend-owner 5/5 red. **M2-c** makes `isTrashed` always false → post.delete 31/10, retire-post 5/3 red. **M2-d** makes `postAuthorForDisplay` ignore `showAuthor` → render-author 1/5, post-template-author 2/9 red. All restored green. The watermark guard mutation (C-core-1.J) has no Tovu consumer; Jini combine-13 ran it (3/3 red) | equal to m1 apart from counts (denominator 2279 → 2274) | DONE |
| 3 | `codex/ex-export-tovu` @ `5edda51d26` | `69659e729` | **1, both intents kept** (below) | 63 files (hub skipped: `server/routes/types.ts`, 174 importers). **751 pass / 0 fail** | **2 named, 1 killed in Tovu.** **M3-a** (named) negates `exportPublicOrigin`'s `workspace-setting` check → **SURVIVED in Tovu**: static-copy-policy 9/0, static-copy 56/0, site-exporter 46/0, render-origin 12/0. Jini's own characterization test kills it (combine-13 Jini: 1/3 red). LISTED as a Tovu coverage gap. **M3-b** (named) negates the `PresentationSettingsNotFoundError` catch → theme-list-active 2/1 and preview-switcher.integration 8/1 red. **M3-c** (wiring check) makes `rewriteRenderOrigins` keep every URL → static-copy-policy 6/3, static-copy 54/2, site-exporter 44/2, render-origin 6/6 red, so Tovu does run the Jini module. All restored green | equal to m2 apart from counts. Propagation 3.28 → 3.29 (same ratchet row). Cross-feature edges 312 → 309 | DONE; 1 minor LISTED |

**Conflicts and their resolution (all kept both intents):**
- **Merge 2 (ex-sh × ex-core), 4 files:**
  - `contracts/core/index.ts`: ex-sh deleted the `resolvePathWithin` re-export (SH-2) and ex-core deleted the `decodeStrictBase64` re-export (core-2.T). Both lines are gone.
  - `routes/media/replace.ts`, `routes/media/upload.ts`, `routes/publish-content/blob-put.ts`: ex-sh's `MAX_DOCUMENT_BYTES as TOVU_MAX_UPLOAD_BYTES` import from `@jini-ai/cms/media` (with the owner-policy note in upload.ts) plus ex-core's `decodeStrictBase64` import from `@jini-ai/core/contracts/site/strict-base64`. ex-core's side still took `TOVU_MAX_UPLOAD_BYTES` from the media barrel line that ex-sh deleted, so ex-sh's import is the one kept.
- **Merge 3 (ex-sh × ex-export), 1 file:**
  - `development/why-comments-debt.json`: union of ex-sh's 13 SH shell-header rows and ex-export's 3 "Moved to Jini" rows. The JSON is valid, 686 ids, all unique.

**The overlay-test break and fix (`0d7f78fa4`, raw `combine-13-tovu-overlay-fix.txt`):**
- **Cause:** SH-2 deleted `apps/website/src/features/agent-plugins/mcp-metadata.ts`, which re-exported `parseAgentPluginMcpConfig` from `@jini-ai/agent-plugins/lifecycle`. The importer rewrite only resolved TS specifiers inside `apps/`. It did not see these `.mjs` tests importing `../../../../apps/website/src/features/agent-plugins/mcp-metadata.ts`:
  - `composio/connection-contract`
  - `fly/package-manifest`
  - `higgsfield-media/connection-contract`
  - `resend/bundled-mail`
  - `resend/resend-mcp`
  - `supabase/connection-contract`
- **Witness:**
  - At base: 5/6 green (1/0, 4/0, 1/0, 28/0, 1/0); resend-mcp 0/1.
  - After merge 1: all 6 fail with `ERR_MODULE_NOT_FOUND`.
- **Fix:** the specifier now points at `@jini-ai/agent-plugins/lifecycle`, the module the shell forwarded. Import line only, quote style kept, no assertion touched.
- **After:** the 5 are green with base counts. resend-mcp is back to its base failure, a pre-existing stale `createRandomUuidGenerator` import from `@jini-ai/core/primitives` (listed below).
- **Sweep:** I also checked every other file the three merges deleted. I grepped for its path in string specifiers across `*.ts/tsx/mjs/js/cjs/json`, and for every name removed from a Tovu barrel (`TOVU_MAX_UPLOAD_BYTES`, `MenuVersionConflictError`, `resolvePathWithin`, `decodeStrictBase64`, `isTrashed`, `resolveActiveThemeId`, `TOVU_REQUEST_FACTS`, …) in untyped `.mjs/.js`. Nothing else was found, apart from stale `check-architecture.baseline.json` edge rows (listed).

## Part B — consume Jini merge-13
- **RT-3 (`@jini-ai/agent-plugins/commerce/server` removed): no Tovu consumer, nothing to repoint.**
  - No Tovu file imports the subpath. The only hits are historical reports under `cloud/reports/`.
  - Tovu's commerce composition imports `createCommerceServer`, `CommerceUnavailableError`, `readOwnedCommerceOrder` and `normalizedCommerceOrigin` from `@jini-ai/commerce` directly. Those files are `composition/commerce.ts:13`, `commerce-origin.ts:1`, `tool-catalog-commerce.unit.test.ts:5` and `settlement.integration.test.ts:12`. merge-13 does not change that package.
  - Commerce tests in the final suite are green, or BASE-RED where already red.
- **New core / devops / cms / chat exports:** all additive. The three merges consume `contracts/site/*`, `static-export/site/*` and `presentation/site/active-theme-id`.
  - Typecheck, typecheck:tests, admin tsc and desktop tsc ×4 are 0 at base with merge-13 linked, and 0 at the tip.
  - `cms html/site/*` and `posts/*` have no Tovu consumer yet. Their `.T` halves were not in this run (ex-html is report-only).
- **chat/react `currentOrigin` / `isOwnLinkHref` and the own-link behaviour:** combine-12 already ran with jx-chatlinks merged locally. Admin full and desktop renderer are identical to combine-12, so nothing pins the old every-link-new-tab behaviour.
- **Files changed in Part B:** none. The only fix in this run is the merge-1 test break above.

## FILES-LEFT (owner rule) — raw `combine-13-tovu-files-left.txt`
Measured with `plans/P9-data/tools/scan.mjs` + `plan.mjs` from `origin/plan/whats-left-1122` (`75b14f028`), on a clean worktree of each commit. FILES-LEFT = moving + shells.

| tree | moving | shells | **FILES-LEFT** | excluding the scanner's theme areas (`theme` 86 + `adm-themes` 25 = 111) |
|---|---|---|---|---|
| base `41e948ee4a` | 2,488 | 21 | **2,509** | **2,398** |
| after m1 ex-sh `f9d2f0226` | 2,491 | 3 | 2,494 | 2,383 |
| after m2 ex-core `1242ca802` | 2,486 | 3 | 2,489 | 2,378 |
| final `0d7f78fa4` | 2,483 | 3 | **2,486** | **2,375** |

- −23 = ex-sh −15 (18 shells gone; the 3 database-transfer adapters now count as ordinary moving files), ex-core −5, ex-export −3. Each matches its branch report.
- The 3 shells left are the BLOCKed `custom-credentials/sets/{host,store,vault-repo}.ts`.
- **Themes:** the scanner has no theme switch, so both numbers are shown.
  - The plan's **2,479** (P9F) is a different inventory: the combined plan's 2,626 minus 147 theme files (111 in the Themes area, 25 theme-only index sheets, 7 in mixed sheets, 4 desktop theme-preview). It already credits ex-sh, ex-core and ex-export.
  - The scanner cannot reproduce it. Scanner minus its 111 Themes-area files gives 2,375.

## Production bugs found (also appended to `development/open-bugs.md` → "combine-13")
**None.** Fixed and listed:
1. **`C13-overlay-tests-deleted-shell` — FIXED (`0d7f78fa4`).** A test-harness break, not production. See Part A.
2. **Pre-existing, LISTED, not fixed:**
   - `C13-overlay-core-primitives-uuid`: 4 overlay tests import `createRandomUuidGenerator` from `@jini-ai/core/primitives`. Jini moved it to `@jini-ai/platform/system` in `2d0216d6`, before merge-12. The 4 are `resend/resend-mcp`, `github/source-control-tool-wiring`, `google-workspace/form-delivery.e2e` and `sheets-admin-host-schema.security`. All are BASE-RED.
   - `C13-test-writes-dev-site`: some node test writes agent-plugin packages into the repo's own `sites/tovu-dev/agent-plugins/ws/workspace-local/`, plus a root `chat.db`. I removed them before committing.
   - **M3-a** coverage gap: Tovu has no test of `exportPublicOrigin`'s configured-vs-development evidence choice.
   - Stale `check-architecture.baseline.json` edges to deleted files: `form-destinations/types.ts` ×4, `member-login/types.ts`, `entries/index.ts`, `taxonomy/index.ts`, `presentation/active-theme-id.ts:235`.

## Gates — base (`41e948ee4a`, Jini merge-13 linked) vs final (`0d7f78fa4`)
Raw: `combine-13-tovu-base-<gate>.txt`, `combine-13-tovu-final-<gate>.txt`, `…-final-gates-vs-base.txt`, and per merge `…-m<N>-gates-vs-base.txt`. The base equals combine-12 final exactly.

| gate | base | final | note |
|---|---|---|---|
| `npm run typecheck` (+e2e) | 0 | 0 | |
| `typecheck:tests` | 0 | 0 | |
| `typecheck:scripts` | exit 2, 3 errors | exit 2, same 3 | `agent-plugin-activation.ts(100,23)` TS2554, `check-size-drift.ts(9,8)` TS5097, `dev-admin-build.ts(6,12)` TS2339 (long-standing) |
| admin tsc | 0 | 0 | |
| desktop tsc preload / renderer / main / live-verify | 0/0/0/0 | 0/0/0/0 | |
| `check:complexity` | 0 | 0 | |
| `check:size` | exit 1 | exit 1, **identical findings** | `dev-auth.ts` 508, `assistant-byok.ts` 531 New; Worsened `PageEditor.tsx`/`PageEditor`/`PageEditorPane`/`usePageEditor`/`usePostEditor` (combine-12), `SiteGrid.tsx` 502, `publish-agent-tools.ts` 775 |
| `check:errors` | WARN, 3 new/worse, 7 improved | identical | the combine-12 rows |
| `check:architecture` | exit 1 (runtime-only propagation ratchet 3.06 → 3.27) | exit 1, **same single row, 3.29** | +0.01 each from ex-sh and ex-export, because the module count shrank (2293 → 2271). Cross-feature edges 319 → 309, API surface 692 → 687, hubs 315 → 313 (all improved). No new edge rows |
| `check:boundaries` | 0 errors / 112 warnings | 0 / 112, identical | modules 6791 → 6773 |
| `check:hooks` | ok | ok | |
| `check:why-comments` | 80 open (450 lost / 370 allow-listed) | **80 open, the same set** (466 / 386) | 16 new rows are all in the debt file (13 ex-sh, 3 ex-export) |
| `worker-import-graph.test.ts` | 26/26 | 26/26 | |

## Tests
- **Node: changed files + importers + Jini-sensitive tests** (`combine-13-tovu-changed-tests-list.txt`, 1,308 files).
  - Scope: every test changed in `41e948ee4a..HEAD`; tests importing a changed production module directly (stems with ≤ 30 test importers); every test importing `@jini-ai/agent-plugins`, `@jini-ai/commerce`, cms `html|posts|presentation`, devops `static-export`, core `contracts`, `@jini-ai/chat` or `node_modules/@jini-ai`, or mentioning commerce / moved-tools; and combine-12's 423-file list.
  - Method: each file alone, 15-min watchdog, 3 in parallel.
  - The run was stopped once at the 30-min background limit after 863 files. It was resumed for the remaining 445; no file was run twice or skipped.
  - **Result: 1,308 files, 2 parts** (`…-changed-tests-per-file.txt`, `…-changed-tests-failing-reasons.txt`). Part 1 (863 files, on `2df9efdfd`): 26 red files. Part 2 (445 files, on `0d7f78fa4`): 4,432 pass / 69 fail, 31 red files.
  - **Every red file is BASE-RED:** 57 files, each with an identical pass/fail count at `41e948ee4a`. The 6 overlay files of the fix are green apart from resend-mcp (base-red).
  - **Already in combine-12's record (BASE-RED):**
    - automatic-agent-plugins.integration 41/2, serve-command-wiring 5/2, playwright-page-capture.unit 24/1, copy-engine.postgres 0/14
    - pages-update-html-auth 12/1, l244-characterization 17/4, site-backups.integration 0/1, tool-restriction-wiring 11/1
    - byok-message-attachments 3/2, component-catalog-routes.integration 0/1, mail-send.golden 0/1, resolve-mailer 32/1
    - bundled-inactive-gating 7/1, `development/scripts/__tests__/site-plugin-directories.test.mjs` 0/1 (stale `pluginsInstallDir`)
  - **Not in combine-12's list, identical at base:**
    - *Agent-plugins:* bundled-deploy-package 7/6 and calendly `guidance` 1/1 (`tovu/<id>` vs `jini/<id>`); federate-mcp 30/4; tw2-L224 3/1; bundled-automatic-relevance 2/4; bundled-ui-ux-design-package 3/4; install-upload-update 17/1.
    - *Postgres and migrations:* tool-registrations.postgres 0/7 (`psql request failed`); external-mcp-frozen-db.postgres 0/1; checksums 3/2 (`0002_drop_empty_legacy_chat_tables` changed after pin); postgres-baseline 2/1; runner.postgres 2/1; no-raw-sqlite.boundary 77/1.
    - *Run ledger:* run-ledger.dialects 54/0, which **times out at 15 min at base too** (exit 124).
    - *Login and members:* member-login providers 59/1 and ready-providers 0/4 (google-login preset missing); member-password-auth 29/1.
    - *Webhooks:* webhooks tool-contract.characterization 13/2; webhook-delivery-worker.shutdown 2/1 and webhook-delivery-worker 13/1.
    - *Widgets, render, forms, outbox:* resolve-html-page-embeds 64/1; render.golden.characterization 12/1 (contact-form widget drift); forms-submit 39/1; outbox-retry-policies 6/1.
    - *Composition and plugin host:* deps-provider-plugin-boot 6/1; plugin-host.integration 22/3; portable-plugin-host 4/2; after-assembly-forms-search 2/1; shared-oauth-commerce 2/1.
    - *Overlays:* fly deploy-config 3/2, host-signals 129/34, publish-candidates 0/1; github source-control-credential 2/1; google-login exports 5/1; railway credential-card 2/1 and deploy-config 1/1; render credential-card 2/1 and deploy-config 1/1; the 4 `createRandomUuidGenerator` loaders (0/1 each).
    - *Scripts:* bundled-agent-plugin-selection 2/1.
- **Admin vitest full** (`…-admin-full.txt`): 909 files, **14,917 pass / 6 fail / 2 skipped**, equal to combine-12. The 6 are the owner's base-red set:
  - `admin-literal-copy` ×1 (the same two `features/collections` placeholders)
  - `credential-input-autocomplete` ×1
  - `dictionary-lookup-sinks` ×1
  - `JiniMediaPicker.hooks` ×3
- **Desktop `npm test`** (`…-desktop-test.txt`): main **2,218 / 2,205 pass / 3 fail / 10 skipped**, the known root-chmod cases. Renderer + contracts (`…-desktop-renderer.txt`): **916 / 914 / 2**, the known `WorkspaceChatPane uses no raw React primitives…` and `closing the settings dropdown…`. Both equal combine-12.
- **Mutations: 7 run, 6 killed in Tovu, 1 survived in Tovu (M3-a, killed by Jini's own test).** Raw: `…-m2-mutations.txt`, `…-m3-mutations.txt`. Every plant was restored byte-identical and re-run green. Jini `git status` is clean.
- **Hygiene:** `git status` is clean after the suites, apart from this report, its raw outputs and `open-bugs.md`. Test-written `chat.db` and `sites/tovu-dev/agent-plugins/` were removed (listed above).

## OWED-LOCAL checks (cannot run in the cloud)
1. **ex-core request facts, live:** boot the server and use an admin tab plus a visitor page. Frontend-control and visitor-origin requests work: the locals key is now `jiniRequestFacts`, and every writer and reader goes through the constant.
2. **ex-export, live:** a static export or download from a site with a verified public origin rewrites to that origin. A development-only origin does not (M3-a's behaviour; Tovu has no test of it). The theme preview switcher still works with no presentation row.
3. **Media upload / replace and publish blob PUT with a real file** (strict-base64 now from Jini).
4. Carried from combine-12: its OWED-LOCAL items 1–6.

## Decisions needed
1. **ex-sh BLOCK:** `custom-credentials/sets/{host,store,vault-repo}.ts` stay, because `extract-s8-c1-source-scan.test.ts` reads them off disk. Retiring them needs the owner to drop that test's first block. The same choice applies to the residual re-export lines in `external-mcp/contracts.ts:1` and `external-mcp-store.ts:1`, which `hosted-mcp-type-pins.test.ts:83` pins.
2. **ex-core STOP 5:** `extension-capability-vocabulary.ts` is held in Tovu, because its test asserts an import regex on `host-binding.ts`. Decide whether that regex may name the Jini specifier.
3. **P9-BREAKS rows owed on the plan branch** (from ex-core):
   - `TOVU_REQUEST_FACTS`/`"tovuRequestFacts"` → `JINI_REQUEST_FACTS`/`"jiniRequestFacts"`
   - `TovuRequestFacts` → `RequestFacts`
   - the watermark message losing `(U-002-B1)`
4. **M3-a:** add a Tovu test that pins export-origin selection (configured vs development evidence), or accept Jini's characterization test as the only guard.
5. **`C13-overlay-core-primitives-uuid`** (4 overlay tests, pre-existing): repoint to `@jini-ai/platform/system` in a later run.
6. **Stale architecture-baseline edge rows** (8, listed above): accept or refresh the baseline.
7. **The FILES-LEFT measure:** the scanner gives 2,486 (2,375 without its theme areas), and P9F's combined inventory says 2,479. Pick one measure for later reports, or have `plan.mjs` read P9F's theme drop list.
8. Carried: combine-12 decisions 1–6 and Jini combine-13 decisions 1–5 (jx-chatlinks changeset, the barrel-vs-move choice, why-comment rows).

## Next step
1. Owner decisions 1–3. Then the `.T` halves of C-platform-html-1 and T-post-1 (ex-html is J-only), which consume `@jini-ai/cms/html/site/*` and `posts/*`.
2. Then the OWED-LOCAL checks above.
3. A Jini release carrying merge-13 (with the chat changeset), then the Tovu pin bump.

## Commits on `integ/merge-13-2026-11-22` (first parent)
- `f4e36308a` base gates
- `f9d2f0226` m1 ex-sh
- `bc3cb7331` m1 records
- `1242ca802` m2 ex-core (4 conflicts resolved)
- `afe8c297d` m2 records
- `69659e729` m3 ex-export (1 conflict resolved)
- `2df9efdfd` m3 records
- `0d7f78fa4` fix: 6 overlay tests off the deleted `mcp-metadata.ts` shell
- this commit (report, raw outputs, open-bugs)
