# BUGS-SWEEP report

**Base:**
- Tovu `cloud/combine` f4b2d153.
- Jini `cloud/combine` 60807a9c.

**Branch:** `cloud/bugs-sweep` in both repos, one commit per fix.

**Setup:**
- Node 24.22.2.
- Jini: `pnpm install` and `pnpm --no-bail -r build` exited 0 (`raw/setup-jini-build.txt`).
- Tovu: `npm ci` exited 0; `@tovu/sdk` was built, then `link:jini` ran against the local Jini (`raw/setup-tovu-link.txt`).

**Method:** I checked about 110 entries myself. One read-only subagent checked the other ~50 (49 rows). The "CANNOT TELL" rows mostly name things that are not in these repos (the kUInetic library source, the leon-editorial theme, live client sites) or were not reached within budget. Entries are referred to only by log line number.

## Summary

| class | count |
|---|---|
| FIXED ALREADY (including partly fixed rows) | 45 |
| STILL OPEN SMALL, fixed here | 2 ([750], [755]) |
| STILL OPEN LARGE | 9 |
| NEEDS OWNER | 17 |
| NEEDS A BROWSER | 21 |
| SKIPPED (excluded by the job or in plugin-extraction areas) | 15 |
| CANNOT TELL | 52 |

No other entry qualified as STILL OPEN SMALL. Two near-misses:
- **[627] part b** (direct form markers in safe-delete): not fixed, because it is unclear whether the marker id is an entry id or a slug.
- **[752]** (Jini guard R10): needs a decision on the public chat API.

## Classification

| entry | class | evidence |
|---|---|---|
| [17] | NEEDS A BROWSER | Heavy-load daemon readiness timeout on desktop 0.1.30; needs a loaded desktop run to see. Version fields on the error card were not found in chat/ui source. |
| [19] | CANNOT TELL | leon-editorial theme is a site's content, not in either repo (`git ls-files` has no leon-editorial). |
| [20] | CANNOT TELL | leon-editorial `render/partials/nav.html` is not in either repo. |
| [21] | NEEDS A BROWSER | Spacing at 360–375 px on a site theme outside the repos. |
| [22] | CANNOT TELL | kUInetic library source is not in these repos; only minified vendor copies under `content/themes/**/vendor/kuinetic`. |
| [23] | CANNOT TELL | Lock timeout seen only under load around 20; not reproducible here (4 cores, no load). Same as [664]. |
| [26] | NEEDS OWNER | `media-rendition.ts:741-747`: `/m/:id/original` serves only video, audio and SVG by design; rasters use the transform route. Serving raster originals, or rewording the 404, is a product choice. |
| [27] | STILL OPEN LARGE | Static export asset discovery reads markup and CSS references only; files reached only by scripts or data attributes need a manifest or a theme-declared list. |
| [28] | CANNOT TELL | kUInetic library is not in these repos. |
| [29] | CANNOT TELL | kUInetic library is not in these repos. |
| [30] | CANNOT TELL | kUInetic library is not in these repos. |
| [31] | CANNOT TELL | `references/kuinetic-reference.md` is not in Tovu's ui-ux-design plugin tree (only `tovu-theme/.../kuinetic-worked-example.md`). |
| [32] | CANNOT TELL | kUInetic library is not in these repos. |
| [33] | CANNOT TELL | kUInetic `src/core/activation.ts` is not in these repos. |
| [34] | CANNOT TELL | Live client site content; not in either repo. |
| [35] | CANNOT TELL | Live client site content; not in either repo. |
| [36] | CANNOT TELL | kUInetic behaviour on a live site; library not in the repos. |
| [51] | CANNOT TELL | kUInetic library is not in these repos. |
| [52] | CANNOT TELL | kUInetic library is not in these repos. |
| [53] | CANNOT TELL | kUInetic library is not in these repos. |
| [54] | CANNOT TELL | leon-editorial `theme.css` is not in either repo. |
| [55] | CANNOT TELL | kUInetic library is not in these repos. |
| [56] | CANNOT TELL | kUInetic library is not in these repos. |
| [57] | CANNOT TELL | kUInetic library and its docs are not in these repos. |
| [58] | CANNOT TELL | leon-editorial is not in either repo. |
| [59] | CANNOT TELL | leon-editorial is not in either repo. |
| [60] | CANNOT TELL | leon-editorial is not in either repo. |
| [61] | NEEDS OWNER | `content/themes/static/tovu-starter/scripts/theme-toggle.js:2` still uses `tovu-starter:mode`. Changing the key resets every existing visitor's saved choice, so the naming scheme for copied themes is a product choice. |
| [62] | CANNOT TELL | kUInetic library is not in these repos. |
| [63] | CANNOT TELL | leon-editorial screenshots and `theme.json` are not in either repo. |
| [76] | STILL OPEN LARGE | (a) fixed: `peer-transport.ts:159-177` keeps the peer's error id. (b) still open: no warning before the volume fills, which needs capacity monitoring. |
| [80] | NEEDS A BROWSER | `StaticExportPicker.tsx:61` still renders `theme.name`, and the button narrowing needs a visual check. |
| [82] | NEEDS A BROWSER | Model label truncation in the chat toolbar. |
| [95] | CANNOT TELL | Model wording in one reply; not a code path. |
| [117] | FIXED ALREADY | `composition/deps.ts:1399` heals the persisted localhost site URL row; `routes/types.ts:434` pins the public origin. |
| [132] | STILL OPEN LARGE | Untranslated text across many admin screens; a broad i18n sweep. |
| [137] | CANNOT TELL | Over-count not reproduced; suspected native accounting, needs a desktop run. |
| [168] | CANNOT TELL | Not reproduced here; depends on the verified-origin change in Jini http-kit and a multi-port local stack. |
| [197] | NEEDS OWNER | A stale row in the owner's local `sites.json`; the cleanup is on the owner's machine. |
| [274] | STILL OPEN LARGE | New bare listeners are guarded with 120 baselined calls; migrating them is a broad, low-value sweep. |
| [400] | CANNOT TELL | Bookkeeping entry (triaged and fixed by an earlier job; a verify run was pending); no single code claim to check. |
| [474] | STILL OPEN LARGE | Remaining part: coverage merge needs per-line lcov, an API change to the lcov parser. |
| [477] | FIXED ALREADY | `charts-recharts-source.ts:20` says the PENDING pins were replaced; `fly-deploy.yml` around line 233 no longer imports the deleted path. |
| [487] | SKIPPED | Agent Plugins admin page and status projection are under features/agent-plugins (being moved). |
| [489] | SKIPPED | external-mcp approval card lifetime is in external-mcp (being moved). |
| [503] | SKIPPED | Plugin MCP re-admission and per-plugin tool registration are under agent-plugins (being moved). |
| [509] | NEEDS A BROWSER | Cookie banner default on a fresh browser; needs a live run. |
| [515] | STILL OPEN LARGE | Desktop memory per site; architectural (shared daemon). |
| [566] | CANNOT TELL | A failing-test snapshot from 11-03 on another branch; superseded by the later full-test reports [695]. |
| [570] | FIXED ALREADY | `static-download-landing.ts:13` strips comments before reading `<title>`; the template comment is gone from the themes. |
| [572] | NEEDS A BROWSER | Export "Show files" layout. |
| [573] | NEEDS A BROWSER | Export row type label (UI). |
| [574] | NEEDS A BROWSER | Layout shift under the pointer. |
| [575] | NEEDS A BROWSER | Theme thumbnails on one site. |
| [577] | NEEDS A BROWSER | Tap sizes at 390 px. |
| [581] | CANNOT TELL | Silent 503s, cause unknown; needs a loaded live session. |
| [582] | FIXED ALREADY | Jini `mcp/src/server/tool-arguments.ts:118` unwraps the `{input: ...}` envelope; "the the" no longer appears in tool schema text. |
| [583] | NEEDS A BROWSER | Antigravity card ordering and progress timing in a live chat. |
| [584] | NEEDS A BROWSER | OpenCode block message layout and copy. |
| [585] | NEEDS A BROWSER | Route-change loading time under load and the alias route. |
| [587] | FIXED ALREADY | `site-plugin-directories.test.mjs` 7/7 pass under `node --import tsx --test`. |
| [591] | FIXED ALREADY | Jini media replace recomputes sha256; old authored `?v=` links are kept on purpose and are served `max-age=60` plus ETag (`media-rendition.ts:49-54`). |
| [592] | CANNOT TELL | The no-op overwrite on live was noted "maybe old live build, retry after deploy"; it needs a live publish. |
| [594] | FIXED ALREADY | `features/media/import-media-entity.ts:49-52`: a server-confirmed replacement goes through an atomic replace, not the write-once path. |
| [596] | FIXED ALREADY | The three named agent-daemon-server suites pass 6/6; `agent-daemon-scope.ts:321` defines `siteTools`. |
| [597] | NEEDS A BROWSER | Desktop site card memory label. |
| [598] | FIXED ALREADY | `agent-daemon-scope.ts:1047` now passes `startup: { stage, error }` to `failRunBeforeStart`, so the cause reaches the run, not only the console. |
| [600] | SKIPPED | Plugin auth kind visibility is in agent-plugins (being moved). |
| [601] | CANNOT TELL | kUInetic demo is not in these repos. |
| [602] | CANNOT TELL | kUInetic library is not in these repos. |
| [603] | CANNOT TELL | Interrupted-run recovery on desktop 0.1.28; needs a desktop quit-and-resume run. |
| [605] | FIXED ALREADY | `credential-copy-tool.ts:23,103`: the card is now the owner Shared Keys picker with the placeholder "Choose a key". |
| [606] | NEEDS OWNER | The approval policy for theme overwrites is platform policy in `tool-metadata/theme.ts`; changing it is an owner decision (a job was queued). |
| [607] | NEEDS A BROWSER | Jini `efe7777f` dedupes mid-run sends; whether "Sending…" still sticks has to be looked at. |
| [608] | FIXED ALREADY | `desktop-agent-service.ts` (around line 181) `withdrawStaleBinding` recovers a dead boot's scope. |
| [610] | FIXED ALREADY | A static-publish status tool exists (`contracts/core/tool-metadata/deployments.ts:6`); Jini `4ec60b88` adds background publish. |
| [611] | FIXED ALREADY | `SiteStartPanel.tsx:89` checks `status !== 'failed'`. |
| [613] | CANNOT TELL | The named parts are fixed: `notify-subscriber.ts:21,57` warns with the reason, `static-copy.ts` uses `downloadForms`, `import-remote-submissions.ts:146` keeps the invalid status. The Cloudflare receiver part is too vague to check. |
| [615] | FIXED ALREADY | Jini `agent-runtime/src/native-tool-policy.ts:60`: full-access runtimes need explicit host consent. |
| [616] | FIXED ALREADY | Jini `mcp/src/agent-install/owned-json-install.ts` refuses symlinks, takes a lock, keeps a first backup and writes atomically after consent. |
| [617] | FIXED ALREADY | `mcp-ui-tool-calls.ts:70-85`: typed answers are accepted only for `assistant_ask_choice`, and a typed marker cannot authorize a secret form. |
| [618] | SKIPPED | MCP sign-in browser binding is owned by another job. |
| [619] | FIXED ALREADY | Jini `ui/src/features/mcp-ui/secret-card.ts:92` reserves `freeText` with the other reserved names. |
| [622] | FIXED ALREADY | `admin-page-tools.ts` no longer exposes a page-approval answer tool; the header says the browser agent never receives a confirmation-answer capability. |
| [623] | FIXED ALREADY | Jini `dom-page-driver.ts:354-360`: a published descendant is never adopted as another handle's control. |
| [624] | FIXED ALREADY | Jini `oauth/src/refresh.ts:130-145` reloads the token after acquiring the lease. |
| [625] | FIXED ALREADY | Jini `plugin-release-consistency.test.ts` 9/9, including the packed release-set comparison. The published tarballs themselves were not checked. |
| [626] | FIXED ALREADY | Same test as [625]: same-version byte changes are now explicit. |
| [627] | CANNOT TELL (part b) | (a) and (c) fixed: `http/shared/post.ts:73-75` returns `bodyHtml`; the media reference index is cached. (b): `entry-refs/extractor.ts:268-271` maps only widget and media. It is unclear whether a direct form marker's id is an entry id or a slug, so the fix size is unknown. Not fixed. |
| [628] | STILL OPEN LARGE | Complexity 15 in `AssistantMessageRow` needs a refactor, which is not a bug fix. |
| [629] | FIXED ALREADY | Jini cookie-consent `client/features.ts:23` builds declared scripts from config, not only from existing inert tags (medium confidence). |
| [630] | CANNOT TELL | A batch of scan totals and test notes from other branches; no single claim to check. |
| [631] | CANNOT TELL | Codex's own approval policy refusing bridge calls; needs a live Codex run. |
| [632] | FIXED ALREADY | Jini `chat/src/core/turn-usage.ts:180` keeps the server's `durationMs` and fills from timestamps only when it is absent. |
| [636] | FIXED ALREADY | `features/media/versioned-media-repo.ts:191` has `saveRenditionIfSource`. |
| [637] | FIXED ALREADY | `formspree` is present in Jini `packages/provider-plugins/catalog.json`. |
| [641] | FIXED ALREADY | tovu-theme `SKILL.md` no longer mentions `data-consent-category`. |
| [642] | FIXED ALREADY | `composition/site-cookie-consent.ts:11,29-41` re-reads consent inputs every 60 s, not once at boot. |
| [643] | NEEDS OWNER (PostHog part) | `middleware/site-cookie-consent.ts:178`: with consent off, PostHog sends nothing; whether that is intended is a product call. The refresh part is fixed by the 60 s re-read. |
| [644] | CANNOT TELL (reload-loop part) | The publish-report part is fixed (`consent/service.ts:165-167` only warns after success); the client allows one reload per page, and a loop across page loads was not checked. |
| [645] | SKIPPED | The cause is in features/agent-plugins (being moved). |
| [646] | SKIPPED | agent-plugins and external-mcp (being moved). |
| [647] | SKIPPED | Kind "user" from the delegating id and secret-setting listings touch external-mcp and agent-plugins; the env-secret part is fixed (see [674]). |
| [648] | FIXED ALREADY | Both named tests pass, 11/11. |
| [649] | FIXED ALREADY | `media-rendition.ts:497-508` builds the ETag from stored identity without reading bytes; the reference index is cached. |
| [650] | FIXED ALREADY | (json-line part) Jini `json-line-stream.ts:57-61` re-processes a complete frame after a stray line. Other parts were not traced; see the subagent rows. |
| [651] | CANNOT TELL (form retry part) | The commerce shadowing is fixed (`commerce-http.ts:44-46` calls `next()` when commerce is off); Jini forms has attempt-token dedupe, but the retry page itself was not checked. The guidance part is in a skipped area. |
| [654] | FIXED ALREADY | (llms.txt part) `routes/site/llms.ts:41,60` uses the resolved site title. The stray date and placeholder text are client-site content outside the repos. |
| [656] | CANNOT TELL | Several fixture and test items; not reached within budget. |
| [660] | FIXED ALREADY | The consent loader is injected by the server (`middleware/site-cookie-consent.ts:259-267`), so theme copies no longer need the tag. |
| [661] | CANNOT TELL (form-rename part) | The loader route now has error handling and subpath rebasing; Reset is moot because the loader is injected; the order API stays on the host app. The stdio-args part is in external-mcp (skipped). |
| [662] | CANNOT TELL | The 1 MB regression test and its scanner were not located within budget. |
| [663] | NEEDS OWNER | The prelaunch consent card for tools is product policy in `assistant-tool-consent.ts`; whether CLIs should start without it is an owner decision. |
| [664] | FIXED ALREADY (copy part) / CANNOT TELL (rest) | `site-transfer-i18n.ts` no longer has "Include saved keys". The lock timeout and recovery text happen under load; the 390 px overlap needs a browser. |
| [665] | STILL OPEN LARGE | Several separate parts. One small part: Jini `chat/src/core/question-answer.ts:14` joins a title that ends in "." with ": ", which gives ".:". The rest (Pi error JSON, credential counts, 390 px sizes) needs a browser or is larger. |
| [666] | NEEDS A BROWSER | Error notice fields and duplicate "All sites" labels. |
| [667] | NEEDS A BROWSER | Queued message at a width change and model switch after a failure; seen once. |
| [670] | NEEDS A BROWSER | Queued Cancel size and overlap; desktop test hang cause not proven. |
| [673] | FIXED ALREADY | `cloud/reports/open-fixes.md` records the L3 isolated guard passing. |
| [674] | FIXED ALREADY | `server/runtime/boot/startup-secrets.ts:4-5` now lists the admin password and both desktop MCP tokens. |
| [677] | FIXED ALREADY | `diff -rq` of tovu-starter static against `__original-themes__` is empty. |
| [678] | CANNOT TELL (test part) | The admin vitest could not run here. The stale ADR text is gone from chat-pane styles. |
| [679] | CANNOT TELL | The details are in a private review thread. |
| [680] | CANNOT TELL (baseline and fixture parts) | The loader part is moot (injected at render time); the other parts were not checked. |
| [681] | CANNOT TELL (other parts) | The mail-key save part is fixed: `mail-providers-route.test.ts` passes 9/9, including the save and re-save 200s (`raw/681-probe.txt`). The concurrency, approval, 320 px and regex parts were not checked. |
| [682] | FIXED ALREADY (type part) | None of the four named test files appear in the current typecheck diagnostics list. The selector part was not checked. |
| [683] | SKIPPED (Cloudflare part) / CANNOT TELL | The Cloudflare payload lives in Jini `packages/agent-plugins/cloudflare` (plugin extraction area). `exportCredentialDetail` still exists at `SiteExportTab.tsx:132`; the batching part was not checked. |
| [684] | FIXED ALREADY | `deployment-overview.ts` (around line 108) reads the startup secret environment; commit `2eb49e1b` rechecks domain publish consent. |
| [687] | CANNOT TELL | Baseline drift and a config example; not reached within budget. |
| [689] | CANNOT TELL | Branch status report. The open parts are infra or tool access (Semgrep, Gitleaks triage, Playwright shell). |
| [690] | NEEDS OWNER | Admin branch coverage floor (97.78% vs 98%) is "owner decides"; the desktop layout tests need Chromium. |
| [691] | STILL OPEN LARGE | Desktop Import has no share-link path because the importer needs a running site. |
| [695] | CANNOT TELL | Many separate test failures with causes unproven; no single claim. |
| [697] | CANNOT TELL | No `export-run.ts` error from the desktop main tsconfig (partial: Electron is not installed here). The quit and zip parts were not checked. |
| [700] | NEEDS OWNER | Commerce is on hold. |
| [703] | NEEDS OWNER | `.import-quarantine` has no production path to turn it on; the real fix (a separate origin for themes) is a design decision. |
| [704] | NEEDS OWNER | The remaining import parts follow the same theme-isolation design decision as [703]; Electron and packaged runs are needed for the rest. |
| [708] | FIXED ALREADY | The named Jini test passes (part of 9/9). |
| [718] | NEEDS OWNER | The jump button floats by design (owner call). |
| [720] | NEEDS OWNER | A 503 while the server is starting is expected; whether to shorten it is a choice. |
| [727] | FIXED ALREADY | Jini `useChatPane.hooks.ts:592` clears the attachment error when attachments drop, and line 632 clears it on a new upload. |
| [728] | NEEDS OWNER | A test-harness wish (patched `window.fetch`); no product bug. |
| [739] | NEEDS A BROWSER | Chip tray scroll position. |
| [740] | NEEDS A BROWSER | Rejected-file copy and chip. |
| [746] | NEEDS OWNER | `keyring.env.ts:1-6` legacy aliases depend on a Jini platform release with SiteKey exports; Jini `platform/src/secrets/index.ts:10-12` still carries the same legacy aliases. Removing them is release work. |
| [747] | NEEDS OWNER | Jini `cms/src/comments/sql/repo.ts:9` relies on host-declared tables; making them portable is an architecture decision. |
| [750] | STILL OPEN SMALL → FIXED HERE | Jini `server/src/lifecycle/boot-lifecycle.ts` stopped only started modules on a critical start failure; Tovu's own lifecycle also stops the prepared ones. Jini `1c2f0b63`. |
| [752] | NEEDS OWNER | R2 is fixed. R10 is still red (`raw/752-guard-before.txt`): Jini `ChatPane.tsx:10` imports `Icon`, which is not in the public chat barrel. This regressed in `3b6f5ed8`. The fix is either to widen the public API or to restructure. |
| [753] | NEEDS OWNER | About 60 unreviewed vendor counts; re-baselining needs a reviewer's decision. |
| [755] | STILL OPEN SMALL → FIXED HERE | `contracts/core/commands/revert.ts:116` refused a force only when the kind was literally `agent`. Tovu `59cd9a85`. The second part (a later inverse failure leaves earlier writes) is still open and pinned by its test; it needs a transaction, so it is LARGE. |
| [767] | SKIPPED | Already fixed on cloud/bug-batch (import expiry on null). |
| [771] | SKIPPED | Already fixed on cloud/bug-batch (data-module dbPath). |
| [775] | FIXED ALREADY | The re-check fixes came in with merge `eb4c54a2` (cloud/import-fix, "six bugs, review fixes, re-check fixes"). |
| [776] | FIXED ALREADY | Same merge `eb4c54a2`. |
| [777] | FIXED ALREADY | Same merge `eb4c54a2`. |
| [780] | SKIPPED | Already fixed on cloud/bug-batch (parse5 cms dependency). |
| [781] | SKIPPED | Already fixed on cloud/bug-batch (source_ip null). |
| [789] | FIXED ALREADY | Jini base `60807a9c`: "batch items use host failure redaction". |
| [790] | SKIPPED | The guarded-reader absolute path item is excluded from this job. |
| [801] | NEEDS A BROWSER | `panels.tsx:1035` defines the access-tokens route and no redirect was found; it was seen once after a restart. |
| [804] | SKIPPED | `rememberDelivery` lives in Jini agent-plugins (being moved); the argv budget part needs a design choice for headroom. |
## Fixes

### [750] Boot rollback leaves prepared but unstarted modules running (Jini)
- **Commit:** Jini `1c2f0b63` on `cloud/bugs-sweep`.
- **Files:**
  - `packages/server/src/lifecycle/boot-lifecycle.ts` (about 6 production lines)
  - its characterization test
  - `DR-001-partial-boot-rollback.md` (status line)
- **Cause:** on a critical `start()` failure, only modules that had started were stopped. Modules after the failing one had finished `prepare()` and kept those resources. Tovu's own lifecycle already stops them too.
- **Red:** I changed the pinned characterization test to expect `unstarted.stop` before `two.stop`. Result: 1 failed / 19 passed, `AssertionError: expected [...(7)] to deeply equal [...(8)]` (`raw/750-red.txt`).
- **Mutation:** stopping `modules.slice(index + 2)` instead of `index + 1` gives 1 failed / 19 passed (`raw/750-mutation.txt`).
- **Green:** 20/20 passed (`raw/750-green.txt`).
- **Type-check:** `tsc -p packages/server/tsconfig.json --noEmit` exited 0 (`raw/750-typecheck.txt`).

### [755] A forced change-set revert with no principal kind skipped the version guard (Tovu)
- **Commit:** Tovu `59cd9a85` on `cloud/bugs-sweep`.
- **Files:**
  - `apps/website/src/contracts/core/commands/revert.ts` (about 7 production lines)
  - `__tests__/revert.unit.test.ts`
- **Cause:** the refusal fired only when the kind was literally `"agent"`. A force now needs a principal kind (fail closed) and gets a plain-words refusal, `FORCE_NEEDS_PRINCIPAL_KIND`. Both current callers already pass a kind (the HTTP route passes the session principal's kind, the agent tool passes `"agent"`), so their behaviour is unchanged.
- **Red:** I changed the pinned "reported, not fixed" test to expect a refusal before any write. Result: 22 passed / 1 failed, `Missing expected rejection` (`raw/755-red.txt`).
- **Mutation:** checking `=== null` instead of `=== undefined` gives 22 passed / 1 failed (`raw/755-mutation.txt`).
- **Green:** 23/23 passed (`raw/755-green.txt`).
- **Still open:** the second half of [755] (a later inverse failure leaves earlier writes applied) needs a transaction across reverters. It is STILL OPEN LARGE and stays pinned by its existing test.

## Not done and why
- **Skipped by the job's rules:**
  - the MCP sign-in browser binding ([618])
  - the guarded-reader path ([790])
  - items already fixed on `cloud/bug-batch` ([767], [771], [780], [781])
  - the agent-plugins, api-connections and external-mcp areas ([487], [489], [503], [600], [645], [646], [647], [804], and part of [683])
- **The parse5 select-parsing item** was not in this list.
- **Not run:**
  - the Tovu website typecheck (only the touched file's unit test ran)
  - the desktop tests and admin vitest (vitest is not installed in `apps/admin` here)

BUGS-SWEEP DONE
