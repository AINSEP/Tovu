# DESKTOP-GATES — desktop 0.1.31 release blocker

Branch: `release/desktop-v0.1.31`, cut from `origin/main` at `e9694b16b` (the commit tag
`desktop-v0.1.31` points at). The tag was not touched; nothing was pushed to `main`.

GitHub "Desktop Gates" (run 42942008161, same commit) failed four gates: typecheck, complexity,
tests, coverage. All four are fixed on this branch, and `npm run gates` in `apps/desktop` now ends
with every gate PASS.

## Setup (container)

Node 24.22.2 (nodejs.org tarball), corepack enabled. Root `npm ci` + `npm rebuild`, `@tovu/sdk`
build, `apps/desktop` `npm ci`, `npm run build:preload`. The Electron binary was not downloaded by
`npm ci` (install scripts are not allowed), so it was fetched with `node node_modules/electron/install.js`.
Raw output: `raw/desktop-gates/root-npm-ci.txt`, `root-npm-rebuild.txt`, `sdk-build.txt`,
`desktop-npm-ci.txt`, `build-preload.txt`, `electron-install.txt`.

## Failures, causes and fixes

### 1. typecheck — TS2531 in `src/site-archive-import.test.ts` (56, 171, 189, 206)

- **Cause (release line):** `importSiteArchive` now resolves `null` when the person cancels an
  import (`Promise<ImportedSiteArchive | null>`). Four tests still read `.warnings` / `.siteId`
  straight off `await promise`.
- **Fix:** a test helper `importedSite(promise)` awaits the import and `assert.ok`s that a site came
  back, which narrows the type. The assertions themselves are unchanged. A `null` in those tests is
  still a failure, now with a clear message.
- **Commit:** `27963fd0`

### 2. complexity — three new functions over the 9/9 ceiling

| Function | Was | Fix |
|---|---|---|
| `src/project-ipc.ts` `archiveSource` | 10 | Moved the dropped-file `.zip` check to `droppedArchive` and the file dialog to `pickArchive`. `archiveSource` still decides the url, file, pick or refusal order. |
| `src/renderer/app/SiteStartPanel.tsx` `SiteStartPanel` | 10 | Moved the wake-on-open effect to `useWakeOnOpen` (its StrictMode "claim the attempt" comment moved with it). The button text is now `startButtonLabel`. |
| `src/renderer/use-add-site.hooks.ts` `add` async arrow | 11 | Moved the success branch (merge the card, notify, duplicate notice) to `showAddedSite`. |

The behaviour is the same. Nothing was added to the debt list. `check-complexity` reports
`260 files linted at 9/9 — 3 grandfathered, 0 new`, and the 3 grandfathered entries were already
on the list before this change. `development/open-bugs.md` was not touched.
- **Commit:** `e07b8a55`. Raw output: `raw/desktop-gates/complexity-after.txt`.

### 3. tests — 7 failing tests in 5 files (`raw/desktop-gates/tests-node.txt`, `tests-tsx.txt`)

| File | Failure | Class | Fix |
|---|---|---|---|
| `src/main-shutdown-wiring.test.ts` (2 tests) | `ReferenceError: stopRunningImports is not defined` | Release line: stale test | `before-quit` now tracks `stopRunningImports()` so an in-progress import cannot finish after the app is gone. The vm context now provides it. The order assertions include `"imports"`, and a new assertion checks that repeated quits stop imports exactly once. |
| `src/main-agent-runtime-wiring.test.ts` | same | Release line: stale test | Same: the stub is provided, the order includes `"imports"`, and `importStops === 1` is asserted. |
| `src/runner-ipc-stubs.test.ts` | `runner:sites:import-archive`, `runner:sites:cancel-import` have neither a stub nor a handler | Release line: stale test | Both have real handlers in `project-ipc.ts` (`registerProjectIpc`), so they were added to `IMPLEMENTED_CHANNELS`. |
| `src/renderer/sites-home-view.test.ts` | exact-shape `deepEqual` lacks `showImportPage` | Release line: stale test | `deriveSitesHomeView` returns `showImportPage`, so the expected object now includes `showImportPage: false`. |
| `src/renderer/websites-width.test.ts` (2 tests) | Playwright 1.61.1 wants `chromium_headless_shell-1228`, but the container only has build 1243 | **ENV** | No code change. CI runs `npx playwright install --only-shell chromium`. For the local runs, `PLAYWRIGHT_BROWSERS_PATH` pointed at a scratch directory that symlinks the 1228 name to the preinstalled 1243 shell. Both tests then pass. |

Every fix adds to or corrects the expected values. None removes, skips or loosens an assertion.
- **Commit:** `5c67a256`

### 4. coverage — FAIL

- **Cause:** the coverage gate refuses numbers from a failed run:
  `check-coverage: the test suite itself did not pass (node=1, tsx=1)`. This was not a gap under a
  threshold.
- **Fix:** none needed beyond #3. Once the suite passed, every floor was met: main-process
  97.35 / 97.55 / 92.66 (line / branch / funcs), renderer+contracts 99.75 / 98.17 / 94.40, bin 100.
  No threshold was changed. Raw output: `raw/desktop-gates/coverage-1.txt`.

## Final `npm run gates` (`raw/desktop-gates/gates-final.txt`)

```
DESKTOP GATE SUMMARY
  PASS      tree-quiet
  PASS      tests
  PASS      typecheck
  PASS      coverage
  PASS      complexity
  PASS      js-backslide
  6 gates: 6 pass, 0 fail, 0 DISABLED
check-gates: OK
```

The pre-push hook ran the same gates on the push of `5c67a256` and reported `check-gates: OK`
(`raw/desktop-gates/push-1.txt`), so `--no-verify` was never used.

## Notes

- `raw/desktop-gates/gates-initial.txt` is the first local run. The typecheck and complexity edits
  landed while it was running, so only its tests and coverage FAILs reflect the untouched tree. The
  typecheck and complexity failures are the ones from the GitHub run listed in the brief.
- A first push attempt was started from a shell whose PATH still pointed at Node 22, while the tests
  were still red. Its pre-push gates were stopped before anything was pushed. All later work used
  Node 24.
- No test or server processes were left running.

Pushed commits on `release/desktop-v0.1.31`: `27963fd0`, `e07b8a55`, `5c67a256`, plus this report's commit.

DESKTOP-GATES DONE
