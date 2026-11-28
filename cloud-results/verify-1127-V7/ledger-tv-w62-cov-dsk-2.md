# ledger dsk-2 (tv-w62-cov-dsk-2) worktree /home/user/tovu-dsk2
## status
- started; running batch triage
- batch NR: 445 tests, 3 red: site-archive-import msg (test fixed), storage-sheet-actions overlap (PROD BUG fixed: recheck runningJobs after confirm), site-dir-store initSiteDir (pre-existing env: linked Jini user-management lacks ./identity/repo export; not Codex's test)
- batch R: 4 files fail at import (env: linked @jini-ai/ui/core lacks resolveSystemLocale) -> verified with /tmp/claude-0/dsk2-shim-reg.mjs loader: 38/38 pass; use-site-workspace scroll log test fixed (log redacts message -> 'Error')
- next: typecheck, quality pass, mutations, coverage, commit
- typecheck: changed tests clean (main/renderer/temp storage tsconfig); unrelated env errors from stale Jini build. committed.
- mutations red confirmed: item-ids <=, update-check errorDetails default, smoke-bridge desktopHttp; + compact overlap (prod bug)
- next: coverage (two batches) then final commit
- coverage done (scoped). update-check-now gap closed (+2 tests). final commit 5e9984fe. DONE. Report delivered.
## ROUND 2 (successor)
- shims deleted. NR batch (20 files): 441 pass/0 fail/6 skip (pre-existing launchd skips, site-child-registry). site-dir-store now green.
- R batch (10 files): 114/114. ResourcesPanel+use-resources+SiteGrid+websites-width: 41 pass, 2 env skips (no chromium).
- next: typecheck, complexity, coverage renderer, branch gaps
- typecheck 4 projects clean; storage tests via temp tsconfig clean (needs typeRoots).
- act() complexity was 10 -> extracted confirmThenRun (act 7). lint clean (pre-existing expression-complexity warning only). mutation (drop recheck) red confirmed. committed.
- next: renderer coverage no shim, then branch gaps storage/tovu-server/smoke-bridge
- renderer cov (no shim, 255 tests pass): all 100/100/100 except use-site-workspace L99.76(l101) B98.50, use-tab-close-ask B91.30, workspace-chat-transport B99.26
- storage-sheet-actions: +6 tests, 87.27 -> 100 branches; mutations M1 (pre-confirm in-use), M2 (token), M3 (apply refused) red. committed.
- storage-sheet-ipc: +4 tests, 89.83 -> 98.55 br (l147 target-gone-at-act left); mutation automaticBytes null->0 red. committed. DONE round 2 (call cap). left: tovu-server 611-612/710-714, smoke-bridge, tovu-server.output 56-57, trash-dismissed-folder, report-cli, renderer workspace/tab-close-ask.
## ROUND 3 (successor) - started
- storage-sheet-ipc l147: +1 test (item expires, confirmation live) -> 100/100/100; mutation (drop target check) red
- smoke-bridge: +1 test (malformed entries 125/127) B94.68->97.98; mutations (drop empty-cmd check, drop record check) red; 220 & 284 EXCEPTION unreachable
- tovu-server.output: +1 test -> 100/100/100. tovu-server: +dev proxy env test, +tovu-server.taskkill.test.ts (module-mocked OS boundary) -> 611/710 covered; mutations red (drop /T, drop null check, drop empty-url check). B 96.58 left: 483,851,933,950. WIP committed.
- tovu-server: taskkill file replaced by PATH-based test in tovu-server-failures (success path was already covered there); +isPackaged, +idle stop w/o agent. B 98.33; left 851 (POSIX force no pid), 933 (?? on env value). mutations red. committed.
- trash-dismissed-folder +2 tests -> 100/100/100; storage-report-cli +3 tests -> 100/100/100; mutations red. committed. next: typecheck, final commit, report (renderer gaps not attempted)
- typecheck changed tests clean (0 errors). ROUND 3 DONE. left: renderer use-tab-close-ask/use-site-workspace/workspace-chat-transport (not attempted, call cap); tovu-server 851/933; smoke-bridge 220/284 EXCEPTION
## ROUND 4 (successor) - started; base f7e17e5f
- renderer: use-tab-close-ask B 43/47->52/52, workspace-chat-transport 138/139->139/139 (native loader); use-site-workspace l101 = tsx source-map artifact (native loader shows covered by existing test l200), added fallthrough test. mutations red (keep-running stale answer, in-flight guard, fallthroughs, unknown type). committed.
- tovu-server 851: EXCEPTION. stop() exists only on the post-ready handle; a real ChildProcess that reached ready has a pid that is never cleared, and there is no spawn seam (readiness missing-pid rejects before any handle/stop exists).
- tovu-server 933 (`value ?? ""` in createBootRedactor): REACHABLE, NOT DONE (call cap). Plan: startTovuServer via the fake-serve harness in tovu-server-failures.test.ts with baseEnv { EXTRA_API_TOKEN: undefined } (check buildServeEnv keeps the key) -> boot succeeds and outputTail is not mangled; mutation: drop `?? ""`.
- ROUND 4 STOPPED at call cap after commit 670f59e690. Left: 933; item 3 (re-measure site-retirement, site-archive-import, site-dir-store, stage-payload-run, site-child-registry, site-theme-preview, shared-sites, site-directory-identity, others) NOT started.
## ROUND 5 (successor) - started 05:38
- tovu-server 933: +1 test (undefined EXTRA_API_TOKEN) -> B 119/120 (only 851 EXCEPTION). mutation drop `?? ""` SURVIVES: equivalent mutant, redactSecrets exactSecrets accepts undefined|null (Jini core redaction-patterns.ts:146). committed.
- next: item 3 re-measure
- site-retirement: +1 test, NO_RETIREMENT test extended -> 130/130 L, 28/28 B, 15/15 F (was B20/23 F12/15 scoped). mutations red: drop isDirectory parent check, non-ENOENT->absent, NO_RETIREMENT absent. committed.
- site-archive-import: +3 tests -> L172/172 B50/51 F24/24 (was B44/47 F23/24). 166 EXCEPTION (split() always non-empty, at(-1) never undefined). mutations red (stdin handler, keepTail, tidy catch). committed.
- stage-payload-run: +3 tests -> L485/485 B111/111 F44/44 (was B105/108 F43/44). mutations red x4. committed. next: typecheck, site-dir-store 324/562, site-child-registry 232
- site-dir-store: cancel test extended to undefined -> 562 covered; mutation (drop undefined check) red. 324 EXCEPTION (!stdin with payload: stdio always pipe, guard only narrows ChildProcess type). committed.
- site-child-registry: +1 test (no ps on PATH) -> B46/46 F22/22 L290/290. mutation 'fall back to /bin/ps' red; 'return empty' is equivalent (readProcessCommand maps both to null). committed. tsc main 0 errors.
- site-directory-identity: +3 tests -> L99/99 B26/29 F16/17 (was L92/99 B13/20 F9/17). left: 28/29 (legacy markerless + default workspace), 53 (marker changed under lock), removeTree port. mutations red x3. tsc 0. committed.
- re-measured (scoped, with all importing test files): sites-mcp-tools 100/100/100, startup-env 100/100/100, tracked-sites 100/100/100, storage-item-ids 100/100/100.
- EXCEPTIONS: site-theme-preview.ts:101 (invariant throw: live stream implies watchers, comment-documented); shared-sites.ts:206 (stopped||reported guard inside interval that both paths clear; only a queued tick hits it, timing-only); stage-payload-lib.ts:156 (`?? false`: Jini devops staging.ts:183 always passes dropNestedModules: true); site-dir-store.ts:324; site-archive-import.ts:166; tovu-server.ts:851.
- ROUND 5 DONE 05:52. Final commit 886c3c78db. Left: site-directory-identity 28/29/53 + removeTree port.

## ROUND 6 (last successor) - started 06:03
- site-directory-identity: +4 tests (markerless legacy folder; default catalog via HOME + random UUID; marker re-identified before lock -> kept; marker write fails -> appData snapshot removed + data link restored) -> L100 B100 F100 scoped. removeTree IS used by production (Jini desktop-host copied-site-databases rollback path), covered by the rollback test. mutations red x3 (drop null check, drop siteId re-check under lock, removeTree no-op). tsc main 0. committed.
- next: scoped re-measure of FILES + ROUND6 FINAL table

## ROUND6 FINAL (06:09) - per-file before (brief) -> after (round-6 scoped re-measure: NR batch 70 test files 1159 pass/0 fail/6 pre-existing launchd skips; R batch 35 test files 354/354)
| file | before L/B/F | after L/B/F | note |
|---|---|---|---|
| src/renderer/use-site-actions.hooks.ts | 62.75/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-site-folders.hooks.ts | 97.5/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-site-list-prefs.hooks.ts | 82.93/100.0/92.31 | 100.00/100.00/100.00 |  |
| src/renderer/use-site-locate.hooks.ts | 86.15/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-site-power.hooks.ts | 93.0/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-site-preview.hooks.ts | 58.33/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-site-rename.hooks.ts | 87.44/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-site-start.hooks.ts | 95.59/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-site-storage-settings.hooks.ts | 95.83/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-site-toast.hooks.ts | 81.25/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-site-workspace.hooks.ts | 99.7/98.51/97.37 | 99.76/99.24/100.00 | l101 tsx source-map artifact (round 4: native loader shows it covered); B gap same artifact |
| src/renderer/use-sites-folders-dialog.hooks.ts | 93.75/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-sites-inventory.hooks.ts | 96.15/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-start-imported.hooks.ts | 85.71/94.12/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-tab-close-ask.hooks.ts | 93.52/85.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-update-check.hooks.ts | 90.91/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/use-workspace-chat-transport.hooks.ts | 58.82/100.0/100.0 | 88.24/100.00/50.00 | combined-batch artifact; scoped run with its importers App.hooks.render.test.ts + App.hooks.test.ts = 100/100/100 (4/4 pass) |
| src/renderer/use-zoom.hooks.ts | 72.0/100.0/100.0 | 100.00/100.00/100.00 |  |
| src/renderer/workspace-chat-transport.ts | 100.0/99.24/100.0 | 100.00/100.00/100.00 |  |
| src/shared-sites.ts | 100.0/98.84/100.0 | 100.00/98.84/100.00 | EXCEPTION 206: stopped||reported guard inside interval, reachable only via a queued timer tick (timing-only) |
| src/site-archive-import.ts | 100.0/90.91/87.5 | 100.00/98.04/100.00 | EXCEPTION 166: split() always non-empty, at(-1) never undefined |
| src/site-child-registry.ts | 99.31/97.73/95.45 | 100.00/100.00/100.00 |  |
| src/site-dir-store.ts | 100.0/97.0/100.0 | 100.00/98.00/100.00 | EXCEPTION 324: !stdin guard only narrows ChildProcess type (stdio always pipe) |
| src/site-directory-identity.ts | 100.0/96.77/100.0 | 100.00/100.00/100.00 | round 6: +4 tests (28/29/53 + removeTree rollback); removeTree IS used by Jini commitWithCopiedDatabases rollback |
| src/site-retirement.ts | 100.0/86.96/80.0 | 100.00/100.00/100.00 |  |
| src/site-theme-preview.ts | 100.0/98.15/100.0 | 100.00/98.18/100.00 | EXCEPTION 101: invariant throw (live stream implies watchers) |
| src/sites-mcp-tools.ts | 100.0/98.08/100.0 | 100.00/100.00/100.00 |  |
| src/smoke-bridge.ts | 100.0/94.68/100.0 | 100.00/97.98/100.00 | EXCEPTION 220, 284: unreachable (round 3) |
| src/speech/preload-speech.cts | MISSING/MISSING/MISSING | n/a | EXCEPTION (measurement): sandbox preload is TS-transpiled and run in node:vm by preload-speech.test.ts, so node coverage cannot attribute it; behaviour is tested |
| src/stage-payload-lib.ts | 100.0/99.33/100.0 | 100.00/99.33/100.00 | EXCEPTION 156: ?? false, Jini devops staging.ts:183 always passes dropNestedModules: true |
| src/stage-payload-run.ts | 100.0/97.2/97.73 | 100.00/100.00/100.00 |  |
| src/startup-env.ts | 100.0/96.97/100.0 | 100.00/100.00/100.00 |  |
| src/storage/storage-item-ids.ts | 100.0/94.74/100.0 | 100.00/100.00/100.00 |  |
| src/storage/storage-report-cli.ts | 100.0/93.1/95.24 | 100.00/100.00/100.00 |  |
| src/storage/storage-sheet-actions.ts | 100.0/80.77/100.0 | 100.00/100.00/100.00 |  |
| src/storage/storage-sheet-ipc.ts | 99.42/86.44/100.0 | 100.00/100.00/100.00 |  |
| src/storage/trash-dismissed-folder.ts | 100.0/90.32/100.0 | 100.00/100.00/100.00 |  |
| src/tovu-server.output.ts | 100.0/89.47/100.0 | 100.00/100.00/100.00 |  |
| src/tovu-server.ts | 100.0/96.64/100.0 | 100.00/99.17/100.00 | EXCEPTION 851: POSIX force-stop without pid; post-ready handle always has a pid, no spawn seam |
| src/tracked-sites.ts | 99.86/100.0/98.25 | 100.00/100.00/100.00 |  |
| src/update-check-now.ts | 92.22/88.46/88.89 | 100.00/100.00/100.00 |  |
- Totals: 41 files; 31 at 100/100/100 in the batch run (32 counting use-workspace-chat-transport scoped); remaining gaps are EXCEPTIONs or measurement artifacts listed above. Round-6 commit: 1dd1abe387 (local, not pushed).
- ROUND 6 DONE 06:09. tree clean.
