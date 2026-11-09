# Digest: lane tovu-apps

| suite | exit | files pass/fail | tests pass/fail/skip(+todo) | duration (s) |
|---|---|---|---|---|
| admin vitest | 1 | 882 / 1 (883) | 14341 / 1 / 2 (todo 0) | 1290 (wall 1292) |
| desktop build:preload | 0 | n/a | n/a (no tests; built OK) | ~0 |
| desktop part1 (main, node:test) | 1 | n/a (no per-file count printed) | 2216 / 4 / 10 (todo 0, cancelled 0; 2230 total) | 98 (wall 100) |
| desktop part2 (renderer+contracts, node:test) | 1 | n/a | 906 / 3 / 0 (todo 0, cancelled 0; 909 total) | 118 |

## Failing tests
1. `apps/admin/src/__tests__/unit/chat-fab-z-order-css.unit.test.ts` › chat FAB z-order › sits above every in-page layer; only blocking modals and their popovers go higher — AssertionError: expected [ Array(1) ] to deeply equal [] (received: "components/AdminFailureNotice/admin-failure-notice.css .admin-failure-notice z-index: 1000")
2. `apps/desktop/src/main-agent-runtime-wiring.test.ts` › quit waits for owned runtime disposal even without sites and disposes once across repeated quits — ReferenceError: stopRunningImports is not defined
3. `apps/desktop/src/main-shutdown-wiring.test.ts` › before-quit waits on in-flight teardowns, not only on openSites — ReferenceError: stopRunningImports is not defined
4. `apps/desktop/src/main-shutdown-wiring.test.ts` › Quit during a card Stop waits for its tracked teardown after openSites becomes empty — ReferenceError: stopRunningImports is not defined
5. `apps/desktop/src/runner-ipc-stubs.test.ts` › every channel the contracts declare has a stub or a real handler — Expected values to be strictly deep-equal: missing ['runner:sites:import-archive','runner:sites:cancel-import']
6. `apps/desktop/src/renderer/sites-home-view.test.ts` › an open tab on Projects shows that site's workspace, in tab order — Expected values to be strictly deep-equal: actual has extra `showImportPage: false`
7. `apps/desktop/src/renderer/websites-width.test.ts` › Websites fits at 375px with every nav control and header action inside the page — browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/.../chrome-headless-shell
8. `apps/desktop/src/renderer/websites-width.test.ts` › narrow collapsed multi-tab content fills the dialog, and the desktop single-tab dialog uses its one column — browserType.launch: Executable doesn't exist (same)

## Type/lint errors
None run in this lane (no tsc/lint step requested): 0.

## Classification
- #1 stale test (likely; small chance product bug): new component admin-failure-notice.css:3 (`position: fixed; top:1rem; right:1rem; z-index:1000`) is not in the test's ABOVE_FAB allowlist (chat-fab-z-order-css.unit.test.ts:20-28); test says a new layer must be filed as a modal only if it truly blocks. Decision for owner: allowlist it or lower its z-index.
- #2, #3, #4 stale test: apps/desktop/src/main/index.ts:159 imports `stopRunningImports` and :1098 calls `pendingTeardowns.track({ promise: stopRunningImports() })` in before-quit; the tests run the extracted handler via `vm.runInNewContext` (main-shutdown-wiring.test.ts:90,156) with injected fakes that do not provide `stopRunningImports` (added by recent site-archive-import work, e80fe81a5).
- #5 stale test: `runner:sites:import-archive` / `cancel-import` are declared in src/contracts/project.ts:229,231 and handled in project-ipc.ts:66-67,1822, but not in IMPLEMENTED_CHANNELS in runner-ipc-stubs.test.ts:66.
- #6 stale test: view-state now returns `showImportPage: false` (new import page feature); expected object in sites-home-view.test.ts lacks it.
- #7, #8 environment: Playwright Chromium headless shell not installed (no Chromium).

## Did not run
- Nothing timed out or was skipped by the lane. Runner-skipped: admin 2 tests, desktop part1 10 tests (not individually investigated; no skip reasons extracted).
- admin finished normally (1292 s), no runner/config error.
