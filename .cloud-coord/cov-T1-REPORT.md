# cov-T1 REPORT — Tovu lots 001..018 (238 files)

Branch `cloud/cov-T1` (base Tovu e0c935bb5, Jini b3c4144b, `cloud/integration-2026-10-21`). Per-lot detail: `.cloud-coord/cov-T1-progress.md`.
Wall clock: 15:37–17:15Z, then an API usage-limit pause until 19:50Z (owner lifted it and moved the hard stop to 21:45Z), then 19:50–~21:20Z.
Caps: 10 subagent sessions used (of 15): A,B,C,D,E,F,G(stopped at launch),G,H,I. Concurrency was briefly 4 at 16:41 (T1-G was launched over the cap and stopped by the coordinator within a minute, with no changes), otherwise ≤3.
Persona reads were confirmed in every subagent's first line. The coordinator reviewed each lot through `agents/code-review/skills.md`, because `code-inspection/` is not vendored. Review checks: no ignore comments, no `as any`, no module-mocking of the unit, no weakened or deleted assertions, and comments moved rather than deleted.

## Setup
Node 24.22.0. Jini: pnpm install + build OK. Tovu: npm ci (root, admin, site-chat, desktop) + build:preload + sdk build + link:jini OK. Each subagent ran in its own git worktree under /home/user/wt/<X> with hardlinked node_modules.
Postgres and Playwright were not installed (OWNER OVERRIDE). None of these lots needed Postgres.

## Result per lot (verified on the merged branch)
"Full" = the whole app suite with coverage scoped to the lot's files. "Scoped" = the lot's feature dirs.
| lot(s) | files | at 100/100/100 | merged-branch run |
|---|---|---|---|
| 001+002 admin | 44 | 43 (T1-A 34, T1-I +9; AssistantDock.hooks has 3 br left) | full admin: 783 files, 12848 pass, 0 fail (T1-A); final run below |
| 003+004 admin | 50 | 48 | scoped: 156 files, 2524 pass |
| 005+006 admin | 50 | 44 | scoped: 228 files, 5059 pass |
| 007+008 admin lib + desktop main.ts | 28 | 26 | full admin: 12918 pass, 4 load-timeouts (see Tests); desktop main: 1723 pass |
| 009+010 desktop bin/scripts | 10 | 10 | full desktop main: 1658 pass, 0 fail |
| 011–013 desktop scripts | 5 | 3 | full desktop main: 1712 pass, 0 fail |
| 014+015 desktop src | 34 | 31 | full desktop main: 1559 pass, 0 fail |
| 016 desktop src/contracts/preload | 15 | 15 | full desktop main + contracts pass, 100% |
| 017+018 desktop renderer | 2 | 0 | renderer (no websites-width): 579/579 |

Baseline → after for every file: in each lot's subagent report, summarised in the progress ledger. Headline moves: Select.hooks 3/52 lines → 100%; Library.tsx 64/88 → 100%; desktop-agent-tools 0/8 fn → 100%; workspace-chat-ipc 3/25 fn → 100%; preload.mts 10/57 fn → 57/57; six desktop check/smoke scripts and three more scripts 0% → 100%; renderer App.hooks.ts 29/53 fn → 142/142; renderer App.tsx 0% → 96% lines / 100% branches.

## Files not at 100% (reason)
- **Owner decision / possible bug:**
  - use-agent-plugins.hooks.ts:147 `current ?? []` is reachable, and probing it shows it empties the plugin list. Likely a BUG; not pinned by a test.
  - renderer App.tsx: TabStrip close onClick hangs jsdom. Possibly an infinite update loop on tab close; LOCAL check needed.
  - App.tsx WorkspaceChatPane has zero call sites but a test requires it to stay.
- **Defensive guards kept** (reachable only by a race or a contract the type allows):
  - desktop-agent.ts:314 deny branch (security backstop) and :380 `.catch`
  - shared-sites.ts:56 readdir race and :64 lockTimeout notice
  - site-process-registry.ts:502/505-507/564 kill races
  - use-package-file-tree.hooks.ts:81 (Jini contract)
  - ThemeExplore.tsx:998 (disabled switch)
  - use-publish-content-confirm.hooks.ts:727,981,1302
- **Required no-op props that are never called** (functions):
  - ExternalMcpSettingsPanel.tsx:168,223
  - UsersPanel.tsx:33
  - use-theme-explore.hooks.ts:902
- **Platform/environment:**
  - site-process-registry.ts:565-568: macOS-only orphan reaping
  - page-lifecycle.ts SSR branch: only a subprocess test reaches it, and v8 cannot see subprocess coverage
  - AdminAppearance.tsx:39: parked Glass theme
- **Never loaded (composition roots / Playwright drivers):**
  - desktop main.ts 0/467: logic extracted into startup-env/supervised-site-url/site-name, each 100%
  - verify-find-in-page.ts and verify-site-power.ts: pure logic extracted to find-in-page-verify / site-power-verify / live-verify-checks, each 100%
- **Unlocated:** App.hooks.ts (renderer), 2 branches that lcov maps to comment lines 357/360.
- AssistantDock.hooks.tsx: 3 branches (:1160, :1203 `loader.peek() ?? agents`; :1210 `previous?.pendingStep ?? 0`). Reachability was not established in time.

## Unreachable code removed (behaviour-preserving; each site has a comment naming its guarantee)
~60 sites. Full file:line lists are in each subagent report, quoted in the ledger. Most common kinds:
- `split()[0] ?? x` and `.at(-1) ?? ""`: split always returns at least one element (router, descriptor-i18n, App.tsx, workspace-conversation-store, move-site-home)
- `OVERLAY[locale] ?? {}` fallbacks, now centralised in lib/merge-locale-overlays.ts
- fake-id defaults in *-dependencies fakes: id is now required
- dead `!pages` / `!posts` gates
- `for(;;)` loops with an unreachable exit (packaged-gate-isolation, site-name-policy)
- unused identity `translate` props
- unreachable `String(err)` fallbacks
- a dead creation-notice variant in renderer App.tsx
- a `disabled = false` ternary in SettingsControl

One wrong removal (site-relocation movedRow no-id) was caught by tsc and restored with a test (79f5a20a).

## Refactors for testability
Optional injected ports with defaults wired at the edge:
- runPs, quarantine, platform, removeDir, accessSync, spawn
- createReader for readFileAsBase64
- library / chat-preferences ports
- queued-daemon-start request/schedule
- server-reconnect deps
- `BridgeLookup` getBridge for the renderer hooks
- `sitesSettings` prop on App

Scripts:
- Six desktop scripts that ran on import now export `run…(ports)` and execute only when run directly.
- Three scripts became thin edges over new src modules.
- stage-payload gained `--repo-root`; check-coverage gained `--root`.
- Two now-tested files were removed from desktop coverage-floors.json `knownUnmeasured`. This only tightens the gate. desktop-agent*/desktop-chat-main are now tested too and could also be removed.

## Bugs
- **Fixed:** workspace-chat-ipc subscribe() leaked a dead subscription entry on every reattach to a finished run.
- **Found, not fixed:**
  - sites-mcp-server.ts `METHODS[method]` has no `Object.hasOwn`, so prototype names reach Object.prototype
  - use-agent-plugins.hooks.ts:147 (above)
  - a possible tab-close loop in renderer App.tsx (above)
  - the lifecycle returns `{kind:'unknown-run'}`, so an unknown run is reported as a "replay-gap"

## Tests, typecheck, complexity
- Every touched or added function passes complexity ≤10 and sonarjs cognitive ≤10: 0 errors in every lot. Only warnings from other rules remain, all pre-existing.
- tsc: no new errors. Pre-existing ones:
  - admin: use-admin-surface-frame.hooks.unit.test.ts:67 (fixed by T1-B) and use-external-mcp.unit.test.ts:854
  - desktop: smoke-native.test.ts:296 and website log-buffer.ts:94
- No tests were deleted, skipped or weakened. Before→after test counts are per file in the subagent reports.
- Load-sensitive: admin `main-entry-signed-in.unit.test.tsx` (new, T1-A) passed in the 17:08 full run. Under load average ~12 at 20:40 it timed out, both on the merged branch and on its own branch. Three other files timed out only in that loaded full run and passed in isolation: use-trash, widgets-swap, devtools-bundle. Rerun locally under normal load.

## LOCAL-RUN NEEDED
- apps/desktop/scripts/verify-find-in-page.ts: whole script, on a Mac with the renderer built; again with FIND_VERIFY_NATIVE_KEYS=1
- apps/desktop/scripts/verify-site-power.ts: whole script with SITE_POWER_SITE_DIR set to a scratch site
- apps/desktop/src/renderer/websites-width.test.ts (Playwright): existing, not run; it is the only test that loads all of contracts/sections.ts's functions
- site-process-registry launchd-only tests: run on macOS
- the renderer tab-close hang

## Not finished → next wave
None of lots 001–018 is left unstarted. The next wave should take the residual gaps listed above (the AssistantDock 3 branches, the renderer App.tsx close/WorkspaceChatPane, the 2 App.hooks branches) and the owner decisions.
T1-I behaviour note: the AdminThemes card preview now resolves "system" through the injected env.matchMedia, the same way the picker does.
T1-I removed as unreachable: admin App.hooks:1079 cleanup updater, App.tsx:198 null panel, use-collection-entry-editor:207/296, a dead StaticSiteTab CopyLine prose variant (orphan CSS at styles.css:5554 left), AiAssistant:422 no-op onChange.

## Final verification (final merged branch, all lots merged)
- **Admin:** full suite with coverage over every lot 001–008 admin file: 791 files, 13057 pass, 1 fail, 2 skip.
  - Coverage: lines 99.98%, branches 99.81% (6441/6453), functions 99.88%.
  - The 1 failure is main-entry-signed-in, a 30 s timeout. It passed alone right after, so it is TIMING-SENSITIVE (flaky, new in T1-A). Its miss also accounts for the main.tsx:59 gap in that run. Fix next wave: lazy-load or a shorter import path.
- **Desktop main suite:** 1733 tests, 1723 pass, 0 fail, 10 skip.
- **Desktop contracts pass:** 12/12, all contracts at 100%.
- **Renderer:** 579/579 pass.
