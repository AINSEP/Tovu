# Coverage-wave fix report (2026-10-21, unattended, 21:24–22:05Z)
Branches (all pushed, on top of cov-*, no rebase/force): Jini fix-cov-J1/J2/J3, Tovu fix-cov-T1/T2/T3. 4 Opus subagents + coordinator.
Every behaviour fix: failing test first. Every test-quality fix: proven red by a source mutation, then reverted.

## 08-covJ1-product (fix-cov-J1)
| finding | result |
|---|---|
| HIGH Slack-token rule removed (user-text-redaction.ts:28) | fixed 3f1b4872: rule + why-kept comment back; hyphen-prefixed token in URL path/query tests |
| MED asset-harvest.mjs:261 per-stylesheet catch | fixed cad26b36 (unreadable stylesheet skipped, manifest still written) |
| MED main-guard.mjs:39 + script helpers two-object | fixed f0684d13 (isMainModule/exitOnFailure/runIfMain/runCli/parseCliArgs) |
| MED loadAnthropicLiveModels 4th arg | fixed dec39b13 `({ env, fallbackModels }, { now, listModels })` |
## 10-covJ1-tests
| fakes-wc2 awaits listeners | fixed 17d3c91e; exposed a REAL bug: network-capture lost in-flight bodies at browser.close, now awaited |
|---|---|
| security-editor exact create request | fixed 8117da74 |
## 09-covJ2 (fix-cov-J2)
| retry test cross-conversation | fixed 61afb88d (same conversation, 2 writes) |
|---|---|
| check-packaging.mjs two-object | fixed 39e07337 |
## 14-covJ3-product / 15-covJ3-tests (fix-cov-J3)
| MED os.userInfo() eager at import | fixed 03ed9819 (lazy `PGUSER ?? userInfo()` port) |
|---|---|
| LOW postgresUrlFor signature | fixed in 03ed9819 (touched anyway) |
| LOW nodeLoginShellPorts signature | listed |
| LOW stuck-run.ts:113 deleted why-comment | comment restored 29d05c2e (house rule); guard itself not restored |
| MED autosave cancellation test | fixed 400988cc (mounted entryId switch, resolve + reject-with-backup) |
## 16-covT1-product (fix-cov-T1)
| HIGH merge-locale-overlays / index-aligned-translations → Jini | listed: no paired Jini branch, Tovu would import unreleased Jini |
|---|---|
| MED server-reconnect reentrancy | fixed 89d409d1 (stack overflow reproduced) |
| MED navigator guards + SSR comment | fixed 2807096e |
| MED two-object (visitor-credential, plugin-preferences adapter) | fixed 8842abd6 |
| rules notes: Date.now() smoke-packaged-chat-gate.ts:336; hook in SettingsControl App.tsx:455 | listed (pre-existing) |
## 17-covT1-tests
| HIGH deleted conversation re-activated | fixed 9d8a0a52: PRODUCT bug; deleted id leaves switcher/fallback, never written; fake refuses deleted writes |
|---|---|
| MED unknown-run reported as replay-gap | fixed 53bd4de4: PRODUCT bug; fake uses Jini StreamSubscribeResult |
| MED find-in-page per-interaction | fixed 8f3490c6 |
| MED requestPublish exactly once | fixed 7a8bbd81 (optional `request` port) |
## 18-covT2-product / 19-covT2-tests (fix-cov-T2)
| HIGH parent-watchdog / dom-hook-harness → Jini | listed (same reason) |
|---|---|
| MED useZoom localStorage at render | fixed 0f17eba3 (SecurityError reproduced; lazy guarded adapter) |
| MED useSitePreview / admin-screen-link / destination-credential signatures | fixed 8c21dc80, a56a9f6b, 1982eded (+ sealed-key test 13516c40) |
| SiteGrid.tsx:193 preview via hook | listed (pre-existing) |
| MED plugin-command TTY skip after installer start | fixed 6d5bd1d1 |
## 20-covT3-product / 21-covT3-tests (fix-cov-T3)
| HIGH import.meta.main needs Node ≥24.2 | fixed 98b5dd2b (isEntrypoint with realpath port) |
|---|---|
| MED three `?? ''` guards | fixed 995b0810 (missing :mediaId was "undefined") |
| MED write-error-status two-object | fixed 628431b1 |
| MED key-only-site-meta timestamp helper → Jini | listed |
| MED bootstrap repeated start | fixed c26be60d (mock timers; one poll after restart, none after stop) |
| MED default detector test | fixed 5ca11e46 (child process, PATH = stub codex CLI) |
| LOW last-route-handler positional | listed |

## Tests run (touched packages/files only)
Jini: chat 3366 pass/1 skip; agent-runtime 4092/1 skip; admin 2783; cms check-packaging 22/22; db testing-helpers 7/7; ui autosave 17/17, observability 123/123.
Tovu: admin server-reconnect 17/18, themes+sites 1082/1084 (both fails pre-existing "flat refusal" from older @jini-ai decodeApiError); desktop renderer 579/579 excl. websites-width; website scoped 4295/0 fail/4 skip; T3 touched suites 194/194.
Pre-existing, not ours: Tovu tsc ~9-10 errors (composition/app.ts, deps.ts, backstop-service, cookie) from integration drift; cms `check-packaging.mjs` exits 1 on video-frames.ffmpeg.ts (same on base).
## Coverage (line/branch/function) of touched files
100/100/100: all Jini touched files; server-reconnect, use-site-transfer, use-visitor-credential-form, plugin-preferences adapter, workspace-chat-ipc, use-zoom, use-site-preview, SiteGrid, admin-screen-link-tool, destination-credential, where-used, consent/routes, both write-error-status.
Below 100, pre-existing gaps: ThemeExplore.tsx 99.13 br (l.998); admin App.hooks.ts 96.59 br (132,143-148,273); desktop App.hooks.ts 99.42 br (was 99.41); local-site-child.ts 97.37 br (top-level entry arm runs only in the spawned-child test).
## Complexity (eslint complexity + sonarjs cognitive, cap 10)
No violations in touched functions. Highest: writeFontsCss 8, parseCliArgs 8, resolvePublishDestinationCredential 7, flush ≈6, isEntrypoint 3. Untouched: useSiteSectionAvailability 10/9 (admin App.hooks.ts:405).
## LOCAL-RUN NEEDED
Jini db `test:postgres`; Tovu apps/desktop/src/renderer/websites-width.test.ts (Chromium); desktop `npm run typecheck` + full desktop `npm test`.
## LOCAL VISUAL CHECK
None expected; ThemeExplore Save tooltip only differs on a host with no `navigator`; SiteCard preview call shape only.
## Not code fixes / listed
Jini-ownership moves (16/18/20 above); lockfile/unreleased-Jini items; LOWs above.
## Owner questions
1. ~45 web-clone script helpers now exported (for tests) with positional args — convert to two-object?
2. Merge the two parallel web-clone CLI libs (script-cli.mjs vs cli-args.mjs + main-guard.mjs)?
3. Admin vitest never re-runs effects under StrictMode, so "Strict Mode" tests don't hit the handledRef guard — accept, or change the test React setup?
