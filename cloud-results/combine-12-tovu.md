READY TO SWITCH 748c032db

All 5 merges and B1 are done and pushed. No new red test: every remaining red is BASE-RED (identical at 311d26dfa or in combine-11's per-file record), and admin/desktop equal combine-11. Complexity is 3 → 0. Listed, not fixed: new size, error-gate, architecture, boundaries and why-comments rows (decision 1). Owner confirmation owed: tv-howto2 rewrites the w1 owner-approved ui-ux-design wording (decision 2).

# combine-12 TOVU (2026-11-22) — `integ/merge-12-2026-11-22`

Unattended cloud run, Opus high.
- **Base:** `origin/integ/merge-11-2026-11-21` `311d26dfa6`.
- **Jini:** `origin/integ/merge-12-2026-11-22` `6b8e0d48a` plus a LOCAL, never-pushed `git merge --no-ff origin/codex/jx-chatlinks` (`b6e9573f5`) = local `bb6c4958`. Fresh clean `node_modules`, then `pnpm install --frozen-lockfile` 0 and `pnpm --no-bail -r build` 0 (0 `error TS`). Linked into Tovu.
- **Pushed:** only `integ/merge-12-2026-11-22`, with a plain `git push` after every merge and fix. Nothing was pushed to Jini.
- **Not used / not touched:** no subagents, no codebase-memory tools, no force-push, no `--no-verify`, no `git pull --rebase`, no tags, no publish. `main`, `refactor/terra` and `plan/*` were only fetched.
- **`_optional = {}` pads:** none removed or renamed. bugs3a's new `removeDisabledActivations` carries its own pad, and `reconcilePluginActivationsOnce` keeps its pad.

**Summary.** Part A: all 5 merges landed in order, with **0 textual conflicts**.
- Two branches were red on their own (untested Codex work); both were red identically on the branch alone:
  - **tv-bugs3b**: 7 admin reds. All were test defects against its own intended behaviour, fixed test-only in `6d92cf1ad`.
  - **tv-howto2**: 8 reds. One was a real guidance regression (the form marker lost its `forms_list_definitions` pointer), fixed in production and keeping both intents. Seven were stale wording pins, repointed (`8cef2d19b`).
- **14 mutations run, all 14 killed.**

Part B:
- **B1 DONE:** the open golden is green and its mutation is red.
- **B2: no repoint needed.** Tovu has no consumer of Jini core's `errors/reporter` or `errors/testing`. `reportServerFailure` is Tovu's own and unchanged.
- **B3: 1 repoint** (the moved-tools golden catalog bytes; names unchanged).

One production bug was found and fixed. tv-seed-upgrade's rename map missed `calendly` and `shopify` (23 of the 25 measured renames). It was fixed witness-first.

## Setup
- Read first: `cloud-results/combine-11-tovu.md` (Setup), Jini `cloud-results/combine-12-jini.md` ("Exported signatures the Tovu run must consume"), Tovu `origin/plan/err-design-1121` `err-design/CULL.md` (T1, T2). No COMMIT-PLAN sheet exists in the repo for tv-seed-upgrade, tv-err1, tv-bugs3a, tv-bugs3b or tv-howto2 (each commit says "Plan: COMMIT-PLAN.md in the job output"). Their commit messages and this dispatch were the intent.
- Tools: Node 24.22.3 (`/opt/node24`), npm 11.19.1, pnpm 10.33.2.
- Jini, at local `bb6c4958` (= `6b8e0d48a` + jx-chatlinks, `--no-ff`, no conflicts):
  - All `node_modules` were deleted first.
  - `pnpm install --frozen-lockfile`: 0.
  - `pnpm --no-bail -r build`: 0.
- Tovu:
  - Branch created from `311d26dfa6`.
  - `npm ci --ignore-scripts` in root, admin, desktop and site-chat: 0/0/0/0.
  - `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`: 0 (82 links changed).
  - `packages/contracts` tsc: 0. `packages/sdk` build: 0.
  - No lockfile changed in this run, so nothing was re-installed.
- PostgreSQL 16:
  - Role `la`; DBs `jini_chat_test_c12` (`TOVU_CHAT_TEST_POSTGRES_URL`) and `commerce_test` (`COMMERCE_PG_URL`).
  - `PGHOST/PGUSER/PGPASSWORD` set.
- Playwright: `PLAYWRIGHT_BROWSERS_PATH=/home/user/pwb`, which symlinks `/opt/pw-browsers/*` plus `chromium{,_headless_shell}-1228 → -1243`. Nothing was installed.
- `origin/refactor/terra` and `origin/main` were fetched first, because why-comments needs `refactor/terra`.
- Gate set (combine-11's): size, boundaries, admin tsc, desktop tsc ×4, typecheck(+e2e), errors, worker-import-graph, complexity, hooks, typecheck:scripts, why-comments, typecheck:tests, architecture.
  - It ran on the unmodified base first (`combine-12-tovu-base-*.txt`), then after merges 1–4 and after merge 5 + B1 (`combine-12-tovu-m<N>-gates-vs-base.txt`), and finally at the tip.
  - **Base = combine-11 final exactly.** Every gate has the same exit code and the same findings. The only differences are file and module counts (why-comments files scanned 2981 → 2992; depcruise modules 6770 → 6789).
  - Linking Jini merge-12 + chatlinks changed no Tovu gate.
- Test runner:
  - Each test file runs alone under a 15-min watchdog, 3 in parallel.
  - Node files use `node --test` with the root `npm test` imports.
  - Admin files use `npx vitest run <file>`.
  - Desktop uses its own `npm test` imports.
- Base attribution: a red file was re-run with the tree detached at the base or at the merge parent (clean tree, same `node_modules`), then the branch was checked out again.

## Part A — merges (raw: `combine-12-tovu-m<N>-tests.txt`, `…-m<N>-mutations.txt`, `…-m<N>-gates-vs-base.txt`)

| # | branch @ SHA | merge commit | conflicts | tests after merge | mutations (must go red) | gates vs base | status |
|---|---|---|---|---|---|---|---|
| 1 | `codex/tv-seed-upgrade` @ `2ddce9e825` | `25cba763c` + fix `748c032db` | none | installed-plugin-id-upgrade **4/0**; bundled-id-upgrade **3/0** (4/0 after the C12 fix); bootstrap-reporting 6/0; dev-startup-failure 12/0. combine-11's red B4 witness is now green | **3/3 killed** (each verdict is the target test going red): skip the verified move (`for … of []`) → installed 2 red + bundled 1 red; admit an unrelated publisher (publisher check off) → "an unrelated publisher's revision … stays in place" red; admit an edited copy (re-pack digest check off) → "a pre-rename copy whose files were edited … stays in place" red. **Plus the C12 witness** (rename map vs combine-11's measured 25): red `['calendly','shopify']` before the fix | NEW error-gate WARN: `[catch-reads-error]` `bundled-id-upgrade.ts` (5), `lifecycle.ts` (1). Architecture +1 file (propagation 3.26 → 3.27) | DONE; production bug fixed (C12); minor LISTED |
| 2 | `codex/tv-err1` @ `6da5c1455e` | `9f5eb508e` | none | T2 only: 7 production files (`afterSettled` / `observed` idioms). The diff does not touch `assistant-ag-ui.ts`, so the commit title's "T1" is not in it; T1 is B1 below. Importers: 30 files, 27 green; 3 red: automatic-agent-plugins.integration 41/2, serve-command-wiring 5/2, playwright-page-capture.unit 24/1. All 3 are **identical at `311d26dfa`** and long-standing BASE-RED (same counts since combine-8/9) | none named (keepstd T-items are verbatim idiom swaps) | error gate: 7 entries improved | DONE |
| 3 | `codex/tv-bugs3a` @ `5eb72847cd` | `652c3bf7c` | none | B6 golden: "mixed payloads stop at pending approval" and "unmarked payloads, then end with max_tool_turns" green; wire golden 11/1, where the 1 is the B1 target (green after B1). B7: tool-registrations **84/0** (combine-11's stale Q3 case is now the `UNSAFE_FILE` refusal). B8: push-cancellation 7/0, CopyKeysDialog 3/0, use-copy-keys 6/0, plugin-activation-poll boot 5/0 + deps 7/0 | **1/1 killed:** B7, remove the `UNSAFE_FILE` refusal → "the plan reports credential warnings and push refuses before writing" red. B6 and B8 are a golden repoint and verbatim splits, so there was no production line to mutate | **complexity exit 1 → 0** (the 3 combine-11 rows are gone); size `backup-service.ts` 547 row gone. NEW: architecture cross-feature edge `site-backup/push-content.ts → source-control/provider-module.ts`; boundaries `warn no-circular backup-service.ts ↔ push-content.ts` (111 → 112 warnings) | DONE; 2 minor LISTED |
| 4 | `codex/tv-bugs3b` @ `e73e946464` (contains `tv-post-editor-null` `3e0eb2a34d`) | `fd5632f11` + test fix `6d92cf1ad` | none | Admin pages + posts + external-refresh + importers: 62 files. Before the fix: **1627/7**. The same 7 are red at `origin/codex/tv-bugs3b` alone and green at m3, so they are the branch's own defects. **1634/0** after the test-only fix (details below) | **7/7 killed:** save before load (no `bodyReady` guard) → load-race 1 + use-post-editor 2 red; destroyed editor counted live → load-race 2 red; B1 no YouTube link → PageEditor 3 red; B3 raw page-load error → use-page-editor 2 red; B2 no window-focus recheck → use-page-editor 3 + external-refresh 2 red; B2 no post-save recheck → use-page-editor 2 + external-refresh 2 red; B4 no `cancelled` guard → use-post-editor 1 red | NEW size Worsened: `PageEditor.tsx` file 1015 (1002), `PageEditor` fn 221 (220), `PageEditorPane` 128 (125), `usePageEditor` 384 (380), `usePostEditor` 410 (400). Error gate: Worse `use-page-editor.hooks.ts` catch-reads-error 2 → 3 | DONE; minor LISTED |
| 5 | `codex/tv-howto2` @ `c0f70b84c2` | `1ebc98670` + fix `8cef2d19b` | none | 37 files (changed tests + importers + overlays): 32 green, 5 red. 1 is the base-red automatic-agent-plugins. **4 files / 8 tests are new reds**, green at m4: bundled-tovu-theme-package 20/1, pages tool-registrations 52/1, site-import overlay 4/3, ui-ux-design overlay 6/3. After the fix: all 4 green (21/0, 53/0, 7/0, 9/0), plus 8 page-html importers green | **2/2 killed:** site-import homepage-after-switch line → overlay red; remove the kept `forms_list_definitions` pointer → pages tool-registrations red | (with B1) why-comments 79 → **80**: `bundled-tovu-theme-package.unit.test.ts:196-197 [3ee47e16609e]` (a luvira-trial comment howto2 deleted) | DONE; owner wording confirmation owed (decision 2) |

**tv-bugs3b: the 7 reds, cause and fix** (`6d92cf1ad`, test-only, 6 files):
1. **Load latest (page and post): "the stored draft is discarded", 2 tests (new in the branch).**
   - Cause: Jini `clearStandingDraft` queues the server discard behind the held in-flight autosave. That is its serial chain, so a late PUT cannot resurrect the draft.
   - The tests asserted the discard before releasing that autosave.
   - Fix: they now assert `false` while it is held and `true` after it settles. This is stronger, not weaker.
2. **posts-i18n "translates the editor conflict fallback" (es, ja).**
   - Cause: B2's post-save version recheck loads the newer row into a *clean* editor and clears the conflict. A dirty editor keeps it.
   - Fix: the case edits the title first, as a real conflict has unsaved work.
3. **PostEditor "persists an explicit No template chosen".**
   - Cause: a third fetch is B2's post-save recheck.
   - Fix: the exact count of 2 became "at least 2". The test now also asserts every later call is a read.
4. **PostEditor DOM "version conflict banner" snapshot.**
   - Cause: the snapshot was not updated for B2's banner.
   - Fix: re-recorded. The only diff is the B2 banner: + "Loading the latest version discards your unsaved edits.", + a `Load latest` button, "Save anyway" → "Replace their version", and the "Saving again will replace their version." sentence removed.
5. **PostEditor DOM "the four notices keep their order".**
   - Cause: B2 hides the stale-basis notice while a save conflict shows (`&& !saveConflict`, deliberate in both editors).
   - Fix: the expected order dropped `post-autosave-stale`.

**tv-howto2: the 8 reds, cause and fix** (`8cef2d19b`):
- **Production, keeping both intents.** W8 rewrote the `form` marker description and dropped "listed by forms_list_definitions". `pages_write_html` / `pages_write_region` therefore no longer told the model where a form ID comes from (the test's intent). The pointer is back in front of W8's new words: "a live form from the site's forms system, listed by forms_list_definitions — reuse or create a native form with supported fields".
- **Test repoints to howto2's deliberate W9/W10 words**, with the same strength (exact text or anchored regex):
  - site-import overlay ×3: `load_agent_plugin` + `pluginId: "site-import"`; the hand-off names `pluginId: "tovu-theme"` / `"ui-ux-design"`; "Check `/` only after the agreed switch".
  - bundled-tovu-theme-package ×1: "hand theme work to Tovu Theme Part C … `pluginId: "tovu-theme"`".
  - ui-ux-design overlay ×3: the **w1 owner-approved chat-rules constant** now holds howto2's text; the `load_agent_plugin` name; screenshot widths are now "`web_screenshot_page` presets are desktop 1280px, tablet 768px and mobile 375px" + "Report only the widths actually checked", in place of the 360/390/768/1024/1280/1440 release gate.
  - **Owner confirmation is owed** for the w1 constant and the widths change (decision 2).

## Part B
### B1 · err-design T1 / bugs3 B5-T: AG-UI interruption words — DONE (`a6a94d354`)
- `assistant-ag-ui.ts` passes `drainRunFramesToAgUi(ctx, { interruptionMessage: AG_UI_INTERRUPTION_MESSAGE })`.
- The constant is bugs1 T4's approved "The assistant’s response was interrupted. Send your request again."
- Before: the golden "a dropped daemon stream … private interruption message" was red. At base and m1–m4 it read Jini's default "The response was interrupted. Try again."; in combine-11 it read `'aborted'`.
- After: wire golden **12/0**, routes 38/0, translate 3/0.
- Mutation (drop the option) → that golden red. Restored. Raw: `combine-12-tovu-b1-*.txt`.
- Closes `C11-agui-run-error-raw-message`.

### B2 · Jini core reporter/testing changes — nothing to repoint
- No Tovu file imports `@jini-ai/core/errors/reporter`, `…/errors/testing` or `…/errors/catalog`, or uses `ErrorReporterPorts`, `createRecordingTracker`, `createRecordingReporter` or `IncidentTrackerReport`. The only `@jini-ai/core/errors/*` import is `…/idioms`.
- `reportServerFailure` (`server/inbound/shared/admin-failure.ts`) is Tovu's own. It mints its own ID and calls `tracker.error`, so it is unchanged and keeps its signature.
- The gates confirm it: `typecheck`, `typecheck:tests`, admin tsc and desktop tsc ×4 are 0 at base, so linking merge-12 compiled clean.
- Files changed: **none**.

### B3 · other merge-12 export changes
- **`moved-tools.golden.test.ts` catalog bytes** (`f1348620b`):
  - Values: recorded 755760; at base with Jini merge-12, **755816** (+56, Jini catalog wording); at the tip, 757141 (+1325 from howto2's tool descriptions and the kept form pointer).
  - Names stay 328, and the golden diff is the byte count only.
  - Re-recorded with `MOVED_TOOLS_GOLDEN_WRITE=1`, following the `c4b928926` precedent.
- **protocol `decodeApiError` default words, sidecar handler words:**
  - Admin: no test pins `'request failed'` / `'internal error'` from these. Admin full is listed below.
  - Desktop: main and renderer equal combine-11.
- **agent-plugins `companions` / `allowInactiveGuidance` / "Load:" line:** no compile or test break.
  - Tovu's automatic `resolve` (`features/agent-plugins/automatic-agent-plugins.ts:125`) ignores the new `options` argument and always passes `allowInactiveGuidance: true`. This is pre-existing.
  - Jini decision 4 says hosts must honour the option. LISTED as decision 4, not changed (it would change behaviour, and no test is red).
- **chat `drainRunFramesToAgUi`:** consumed in B1.

## Production bugs found (also appended to `development/open-bugs.md` → "combine-12")
1. **`C12-seed-upgrade-missing-ids` — FIXED (`748c032db`).**
   - tv-seed-upgrade's `RENAMED_TO_JINI` listed 23 IDs. combine-11 measured 25 bundled packages renamed `tovu/<id>` → `jini/<id>` between 0.7.2 and next.2.
   - The two missing are `calendly` (0.1.0, which Tovu seeds per `bundled-catalog.ts:48`) and `shopify` (0.1.1).
   - Effect: a site holding either pre-rename copy kept it, with a seed conflict on every boot.
   - Witness first (`bundled-id-upgrade.unit.test.ts` "the rename map covers every bundled package 0.7.2 shipped as tovu/<id>": red `['calendly','shopify']`), then the two IDs.
2. **`C12-howto2-form-id-pointer` — FIXED (`8cef2d19b`).** The page HTML form marker lost "listed by forms_list_definitions" (tool description guidance).
3. **`C11-agui-run-error-raw-message` — FIXED (`a6a94d354`, B1).**
4. **`C11-installed-plugin-id-upgrade` — FIXED** by tv-seed-upgrade (merge 1) + C12 fix. combine-11's red witness is green.
5. **Minor, LISTED:** the new `Load latest` button in both conflict banners (`PostVersionConflictBanner.tsx`, `PageEditor.tsx` `PageVersionConflictBanner`) has no `data-agent-element/role/label`. Its siblings Save-anyway / Keep-editing do, so the assistant cannot target it by handle.

## Gates — base (`311d26dfa6`, Jini merge-12 + chatlinks linked) vs final (`748c032db`)
Raw: `combine-12-tovu-base-<gate>.txt`, `combine-12-tovu-final-<gate>.txt`, and per step `…-m1/m2/m3/m4/m5b1-gates-vs-base.txt`. The final diff is identical to m5b1's, since `748c032db` only adds two IDs and a test.

| gate | base | final | note |
|---|---|---|---|
| `npm run typecheck` (+e2e) | 0 | 0 | |
| `typecheck:tests` | 0 | 0 | |
| `typecheck:scripts` | exit 2, 3 errors | exit 2, same 3 | `agent-plugin-activation.ts(100,23)` TS2554, `check-size-drift.ts(9,8)` TS5097, `dev-admin-build.ts(6,12)` TS2339 (long-standing) |
| admin tsc | 0 | 0 | |
| desktop tsc preload / renderer / main / live-verify | 0/0/0/0 | 0/0/0/0 | |
| `check:complexity` | exit 1, 3 New | **exit 0, 0 entries** | tv-bugs3a B8a–c cleared `pushPlannedBackup`, `useCopyKeys`, `reconcilePluginActivationsOnce` |
| `check:size` | exit 1 (4 accepted + 5 New/Worsened, incl. `backup-service.ts` 547) | exit 1 | − `backup-service.ts` (bugs3a). **+ Worsened** `PageEditor.tsx` file 1015 (1002), `PageEditor` 221 (220), `PageEditorPane` 128 (125), `usePageEditor` 384 (380), `usePostEditor` 410 (400) (all tv-bugs3b). LISTED |
| `check:errors` | passed 590 / 326 | passed (WARN mode), **3 new/worse**, 7 improved | New `catch-reads-error` `bundled-id-upgrade.ts` (5), `lifecycle.ts` (1) (tv-seed-upgrade); Worse `use-page-editor.hooks.ts` 2 → 3 (tv-bugs3b); 7 improved (tv-err1). LISTED |
| `check:architecture` | exit 1 | exit 1 | Same hard-constraint failure (runtime propagation ratchet 3.06 → 3.26 base, **3.27** final). + NEW cross-feature edge `site-backup/push-content.ts → source-control/provider-module.ts` (bugs3a B8a); cross-feature edges 318 → 319. LISTED |
| `check:boundaries` | 0 errors / 111 warnings | 0 errors / **112** warnings | + `warn no-circular backup-service.ts → push-content.ts → backup-service.ts` (bugs3a B8a). LISTED |
| `check:hooks` | ok | ok | |
| `check:why-comments` | 79 open | **80 open** | + `bundled-tovu-theme-package.unit.test.ts:196-197 [3ee47e16609e]` (tv-howto2 deleted the luvira-trial comment). LISTED |
| `worker-import-graph.test.ts` | 26/26 | 26/26 | |

## Tests
- **Node changed files + importers** (`combine-12-tovu-changed-tests-list.txt`, 423 files):
  - Scope: combine-11's 337-file list; every test changed in `311d26dfa..HEAD`; tests importing a changed production module by path (stems with ≤ 30 importers); and every test pinning a merge-12 wording (`request failed`, `search_agent_plugin_local`, the interruption text, the sidecar/protocol defaults).
  - Method: each file alone, 15-min watchdog, 3 in parallel.
  - Result at `f1348620b`: **5,454 pass / 34 fail in 16 files** (`…-changed-tests-per-file.txt`, `…-failing-reasons.txt`). After that: the C12 fix files 4/0, 4/0, 6/0.
  - **8 files identical to combine-11's per-file record (12 fails):** pages-update-html-auth 12/1, l244-characterization 17/4, site-backups.integration 0/1, tool-restriction-wiring 11/1, byok-message-attachments 3/2, mail-send.golden 0/1, resolve-mailer 32/1, bundled-inactive-gating 7/1.
  - **3 long-standing BASE-RED, identical at `311d26dfa` and since combine-8/9 (5 fails):** automatic-agent-plugins.integration 41/2, serve-command-wiring 5/2, playwright-page-capture.unit 24/1.
  - **3 files not in combine-11's list, identical at `311d26dfa` (16 fails):**
    - copy-engine.postgres 0/14: `psql request failed`; BASE-RED since combine-7/8 with the same 14.
    - component-catalog-routes.integration 0/1: BASE-RED since combine-9.
    - `development/scripts/__tests__/site-plugin-directories.test.mjs` 0/1: stale import `pluginsInstallDir` from `composition/deps.ts`. It is not in the root `npm test` globs. LISTED.
  - **moved-tools.golden 0/1:** B3. Red at base (+56 bytes, Jini) and grown by howto2. Re-recorded in `f1348620b` → green.
  - assistant-agent-plugin-preflight (3/1 in combine-11) is now green.
- **Admin vitest full** (`…-admin-full.txt`): 909 files, **14,917 pass / 6 fail / 2 skipped**.
  - The 6 are exactly the owner's base-red set: `admin-literal-copy` ×1 (the same two `features/collections` placeholders), `credential-input-autocomplete` ×1, `dictionary-lookup-sinks` ×1, `JiniMediaPicker.hooks` ×3.
  - combine-11: 908 files, 14,884 / 6.
- **Desktop `npm test`** (`…-desktop-test.txt`): main **2,218 / 2,205 pass / 3 fail / 10 skipped**. The 3 are the known root-chmod cases. Renderer + contracts (`…-desktop-renderer.txt`): **916 / 914 / 2**, the known `WorkspaceChatPane uses no raw React primitives…` and `closing the settings dropdown…`. Both equal combine-11.
- **Mutations: 14 run, 14 killed** (raw `…-m1/m3/m4/m5-mutations.txt`, `…-b1-mutation.txt`): m1 3, m3 1, m4 7, m5 2, B1 1. The C12 witness was also red before its fix (`…-seed-rename-map-red.txt`). Every mutated file was restored and checked clean (`git diff --quiet`).
- **Hygiene:** `git status` clean after the suites, apart from the raw outputs committed with this report.

## OWED-LOCAL checks (cannot run in the cloud)
1. **tv-bugs3b in Chrome:**
   - Open a post whose TipTap instance gets replaced on mount (reload a few times). The body loads, and Save refuses until it does.
   - Page editor Preview with a YouTube embed shows the labelled "Watch on YouTube" link, with no sandbox/CSP change.
   - Make an assistant edit while a page or post is open. The editor rechecks on window focus and after a pending Save settles. The conflict banner offers Load latest / Replace their version / Keep editing.
2. **tv-seed-upgrade on a real pre-rename site (desktop + server):**
   - Start a site installed from 0.7.2 (`tovu/cloudflare`, `tovu/calendly`) with this build.
   - Each moves to `jini/<id>`, the owner switch, settings, data and memory stay, the saved copy sits under `.bundled-id-upgrade/<id>/<digest>`, and the next boot logs no seed conflict.
   - Also run `npm run dev` once to see the `waitForHttpOk({ url })` boot fix.
3. **B1 in the admin chat:** kill the agent daemon mid-reply. The chat shows "The assistant’s response was interrupted. Send your request again.", not the transport text.
4. **Jini jx-chatlinks (local merge only):** in the admin chat, a link to this site or its admin navigates in place with the ↗ new-tab icon, and another website opens a new tab.
5. **tv-howto2 live:** an assistant run for "add a contact form", "migrate this site" and "redesign from this URL" uses `load_agent_plugin` with `pluginId`, places a native form, and keeps the homepage until the agreed switch.
6. **Carried from combine-11:** the Recharts Chrome/Electron looks, Q4 import history, the tv-abort / tv-ag1 / tv-gate / SHARE-ZIP / WORKER manual checks.

## Decisions needed
1. **Gate debt** listed above:
   - size: 5 Worsened rows, all tv-bugs3b.
   - error gate WARN: 3 rows.
   - architecture edge and boundaries cycle from bugs3a's `push-content.ts` split.
   - why-comments 80.
   Accept into the baselines, or refactor.
2. **tv-howto2 wording vs owner-approved text:**
   - Change: the ui-ux-design overlay's w1 owner-approved chat-rules text (2026-11-02) now reads howto2's W9/W10 version. Gone: "Return the design in chat unless the user asks to save it…". Added: "Save requested site work…".
   - Change: theme screenshot QA drops the 360/390/768/1024/1280/1440 px release gate for "available widths, report only the widths actually checked" (the tool's presets are 1280/768/375).
   - The pins were repointed, so this run is not red. Confirm the new wording or revert W9/W10 in those two files.
3. **tv-bugs3b product choices that the repointed tests now pin:**
   - A clean editor's post-save recheck loads the newer row and clears a save conflict.
   - The stale-basis notice hides while a save conflict shows.
   - Confirm, or narrow B2.
4. **`allowInactiveGuidance`** (Jini decision 4): Tovu's automatic `resolve` (`automatic-agent-plugins.ts:125`) always passes `true` and ignores Jini's new `options`. Honour `options.allowInactiveGuidance ?? false`, or keep it.
5. **`site-plugin-directories.test.mjs`:** stale import, outside `npm test`. Fix or delete.
6. Carried: combine-11 decisions 4 (T-VENDOR), 6 (Q4 design pins) and 7 (PLUGIN-ID-UPGRADE journal; tv-seed-upgrade chose a moved-copy backup under `.bundled-id-upgrade/` with no journal entry, so confirm that design).

## Next step
1. Owner decisions 2–4.
2. Then the OWED-LOCAL Chrome/desktop checks for tv-bugs3b, tv-seed-upgrade (real 0.7.2 site) and B1.
3. A Jini release carrying merge-12 + jx-chatlinks (Jini's decision 1: a core changeset), then the Tovu pin bump and err-design T3/T4.

## Commits on `integ/merge-12-2026-11-22` (first parent)
- `a69b52f7e` base gates
- `25cba763c` m1 tv-seed-upgrade
- `6347b3de8` m1 records
- `9f5eb508e` m2 tv-err1
- `d850d225a` m2 records
- `652c3bf7c` m3 tv-bugs3a
- `fb3bf0d39` m3 records
- `fd5632f11` m4 tv-bugs3b
- `6d92cf1ad` bugs3b test fixes
- `f693edd59` m4 records
- `1ebc98670` m5 tv-howto2
- `8cef2d19b` howto2 form pointer + pins
- `a6a94d354` B1
- `f1348620b` B3 moved-tools golden
- `748c032db` C12 seed-upgrade IDs
- this commit (report, raw outputs, open-bugs)
