# Desktop gates: make them pass without a bypass

Run date 2026-11-16, cloud container (Linux, Node 24.22.3). Branch `fix/desktop-waveb`.

**Result: all six desktop gates pass in this container** (`npm run gates` in `apps/desktop`
prints `check-gates: OK`). Before this run three of the six failed.

## What was pushed and what is in the patch

| Where | Commit | What |
| --- | --- | --- |
| Pushed to `fix/desktop-waveb` | `ff37b74f` | Website type fixes (19 files under `apps/website`). No `apps/desktop` paths. |
| `cloud-results/desktop-gates.patch` | not pushed | One commit, 20 files, all under `apps/desktop` (+308 / -97). |

Apply the patch on top of the pushed branch:

```
git checkout fix/desktop-waveb && git pull --rebase
git am cloud-results/desktop-gates.patch
```

The patch was made with `git format-patch` on top of `ff37b74f` and `git apply --check` passes
there. With the patch applied, the pre-push hook ran green here, so on a machine set up like this
one the push should not need `--no-verify`. I still followed the push rule and did not push any
`apps/desktop` path.

## The gates the hook runs

`apps/desktop/scripts/hooks/pre-push` runs `npm run gates`, which reads
`apps/desktop/quality-gates.json`. The CI workflow `.github/workflows/desktop.yml` runs the same
command. Six gates, all enabled:

| Gate | Before | After | 
| --- | --- | --- |
| tree-quiet | pass | pass |
| tests | **fail**: 15 failing in the main-process pass, 2 failing in the renderer pass | pass: 2,297 tests (2,287 pass, 10 skipped) and 928 tests (926 pass, 2 skipped) |
| typecheck | **fail**: 45 errors | pass: 0 errors |
| coverage | **fail**: suite red, and 2 files with no coverage record | pass |
| complexity | **fail**: 4 new violations | pass: 0 new, 3 grandfathered (unchanged) |
| js-backslide | pass | pass |

Note that `tree-quiet` fails when `apps/desktop` has uncommitted changes. That is by design: commit
before pushing.

The brief expected about 61 typecheck errors, including `desktop-agent.ts:485/490` and three
`*-ipc.test.ts` files. Those were already fixed by the branch tip (`75185227`). What was left was
45 errors, all in website files.

## Root causes and fixes

### typecheck: 45 errors, one root cause (fixed in pushed commit `ff37b74f`)

`apps/desktop` imports website modules directly (server boot, log redaction, daemon contracts). Its
main-process config turns on `noUncheckedIndexedAccess`; the website's own config does not. So the
desktop typecheck re-checks 1,071 website files under the stricter rule, and 19 of them read an
array slot or a regex capture group without proving it exists.

I did not exclude them in `tsconfig.main.json`. They belong to the desktop program because desktop
code imports them, and `exclude` does not remove an imported file anyway.

Each read now states the guarantee the code already had (a loop bound, a required capture group, a
length check, a filter that ran first). Two reads could really be absent, and say so now:

- `publish-credentials/store.ts`: a custom payload with no token becomes the blank token that the
  very next check refuses. Same error as before.
- `theme/tool-registrations.ts`: a read offset at the very end of the text has no byte. A new
  helper `isUtf8ContinuationByte` treats that as a boundary. Same result as before.

No behaviour change. Checked with: root `npm run typecheck` (pass), 58 website test files that
import the changed modules (1,196 of 1,198 pass, 1 skipped, 1 failing before my change too, see
"Not mine" below), and the root complexity check (no new entry from these files).

### tests: 17 failures, five root causes (in the patch)

1. **A real regression in product code (1 test).** `src/main/index.ts` imported `electron-updater`
   at module scope. A refactor (`b70d1b7f`) had replaced the lazy `await import(...)`. The file's
   own comment and `DesktopUpdaterPorts` both say it must load at call time so a dev launch never
   loads it. Restored the lazy import. The failing test was already the red test; the old code is
   the mutation that fails it.
2. **Tests left behind by the (required, optional) argument refactor (6 tests).** Three preload
   pins (`find-menu`, `site-history-menu`, `zoom-menu`) matched `subscribe(CHANNEL, listener)`; the
   preload now calls `subscribe({ channel, listener })`. The theme-preview sender guard is now
   `({ sender }) => ...`, and the test now anchors on `registerSiteThemePreviewIpc` so it cannot
   pick up another channel's guard. A conversation-store fake still took `(path, value)`.
3. **Tests that run TypeScript as JavaScript (4 tests).** `main-shutdown-wiring` and
   `main-agent-runtime-wiring` cut the `before-quit` handler out of `main/index.ts` and run it in a
   VM. The handler gained `(error: unknown)` annotations, which is a syntax error in a VM. The
   tests now strip types first with `stripTypeScriptTypes`, as two other tests in the tree already
   do. The product code is unchanged.
4. **Tests that pin something Jini owns (5 tests).** This container links Jini from
   `refactor/terra`. The desktop lockfile pins the published 0.7.0. The two differ:
   - Jini's newer log lines carry a fixed label instead of the error text
     (`Error(EACCES)` instead of `Error: EACCES: permission denied`, and `check failed: Error`
     instead of `check failed: offline`). Four tests compared the full line. They now accept
     exactly those two known wordings and nothing else. The desktop-owned parts of each line
     (which file, that nothing was written over it) are still compared exactly.
   - `jini-mcp-peers.test.ts` compared the locked sidecar version with the resolved package. With
     a linked checkout that compares the lockfile with whatever the checkout is on. The check now
     runs only against an installed copy and prints a one-line note when Jini is linked. A linked
     tree cannot be packaged (`check-no-linked-jini.mjs`), so nothing shippable escapes it.
5. **No browser on this machine (2 tests).** `websites-width.test.ts` launches Playwright's
   headless Chromium. It now skips with a plain message only when the browser executable is
   missing and `CI` is not set. In CI a missing browser still fails the test. I confirmed both
   ways here: plain run skips 2, `CI=true` fails 2. I also ran both tests against the container's
   own Chromium (temporary link, removed afterwards) and both pass.

### complexity: 4 new violations (in the patch)

The gate lints at a hard 9/9 ceiling. Each function is split into a named helper; no rule is
disabled and the debt list is untouched.

| Function | Was | Fix |
| --- | --- | --- |
| `handleSiteControl` (`desktop-agent-service.ts`) | 10 | `handleBoundSiteControl` serves register and withdraw once identity is proven |
| `handleRename` (`project-ipc.ts`) | 10 | `acceptedNewSiteName` holds the name rule and the duplicate check |
| `resolveSiteDir` (`site-dir-store.ts`) | 10 | `resolveOverrideSiteDir` holds the `TOVU_DESKTOP_SITE_DIR` branch |
| `smokeBridge` (`smoke-bridge.ts`) | cognitive 12 | `createHandshakeSteps`, `retainStderr`, `bridgeSmokeFailure`; the function also drops from 72 lines to under 50 |

All four have existing tests (277 tests across the four files' suites pass).

### coverage: 2 files with no coverage record (in the patch)

`src/renderer/jini-kits.ts` and `src/renderer/jini-surfaces.ts` are loaded only by `main.tsx`, which
no test imports. The gate refuses to grandfather a new unmeasured file, and I did not extend
`knownUnmeasured`. Two new render tests (5 tests) mount the bindings the way `main.tsx` does:

- the kit gives ui's secret input a masked field whose toggle really shows and hides the value;
- ui's reveal and overlay hooks reach the kit's real ones;
- chat's MCP-UI card renders through ui's sandboxed host;
- the A2UI catalog offers exactly the components the registry can render;
- the page probe adapts the first installed model context, and reports none when there is none.

I mutated each of the five bindings in turn; each mutation fails exactly one test.

Coverage figures, before and after (floors unchanged):

| Area | Before | After |
| --- | --- | --- |
| main process | line 97.31, branch 97.19, funcs 92.63 | line 97.31, branch 97.18, funcs 92.67 |
| renderer + contracts | 92 of 94 files measured | 94 of 94 files measured; line 99.76, branch 97.87, funcs 94.69 |
| renderer components | line 99.67, branch 97.79, funcs 95.90 | same |
| bin | 100 / 100 / 100 | same |

The 0.01 point drop in main-process branch coverage comes from the new helper functions. It is
seven points above the floor.

## Electron

None of the six gates needs the Electron binary. The suite reads `main/index.ts` as source text or
uses fakes, so nothing had to be made to skip for Electron. The `electron` npm package (types and
JS) installs fine here; only its binary download is absent.

## What still needs a local run

1. **The two Chromium layout tests** on a machine with Playwright's browser (they skip here). CI
   runs them.
2. **Eleven tests that skip here by design**: six need launchd (orphan reconciliation), one needs
   the Swift toolchain, four are unconditional skips that were already in the tree.
3. **`npm run package` and its smokes** (`verify-package`, `smoke-native`, `smoke-bridge`) need a
   Mac and a built app. They are not gates. `smokeBridge` was refactored in the patch; its unit
   tests pass, but a real packaged smoke has not been run against the new code.
4. **A launch of the desktop app** to see the updater still starts. The lazy import is covered by
   `desktop-updater.test.ts` and the wiring test, not by a real launch.
5. **The gates against the pinned Jini 0.7.0** (what CI installs). See the next section.

## Gates with the pinned Jini release instead of a linked checkout

See the end of this file; filled in by a follow-up commit if the run had time for it.

## Not mine, found on the way

- `apps/website/.../static-publish/__tests__/publish-run.unit.test.ts`, test "a registry reload
  failure logs a sanitized warning…", fails in this container with and without my change. An extra
  log line appears: `bundled initialization failed for 'charts-recharts'`.
- Root `npm run check:complexity` is red before and after: 22 "New violation" lines in
  `apps/admin` and `apps/website`, none in a file I touched.
- `apps/desktop/src/project-ipc.ts` is over the 500-line file limit in the root ESLint config. It
  was before this run too.
