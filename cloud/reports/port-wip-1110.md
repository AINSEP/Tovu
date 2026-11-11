# Changed-file tests: port/wip-1110 (tip 1a4fb72f) — REPORT ONLY

Node v24.22.2, published Jini 0.7.0. Runners: desktop = `node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1` (the desktop app's own `npm test` renderer half; it is node:test, not vitest); admin = `vitest run --maxWorkers=2`; website = root `test` flags (`node --import tsx --import composed-bundle-env --test --experimental-test-module-mocks --test-concurrency=1`).
Raw output: `cloud/reports/raw/port-wip-1110/<runner>_<file>.txt` (main-worktree reruns: `main_*.txt`).

| file | runner | pass/fail | already failing on main? |
|---|---|---|---|
| desktop App.render.test.ts | node:test | 22 / **1** | No (26/26 pass on main) |
| desktop App.sites-home.render.test.ts | node:test | 5 / 0 | - |
| desktop ImportWebsite.render.test.ts | node:test | 6 / **4** | No (10/10 pass on main) |
| desktop TabStrip.render.test.ts | node:test | 7 / 0 | - |
| desktop use-import-drop.hooks.render.test.ts | node:test | 5 / 0 | - |
| desktop use-section-nav.hooks.render.test.ts | node:test | 5 / 0 | - |
| admin use-live-import-site.hooks.unit.test.tsx | vitest | 6 / 0 | - |
| admin site-transfer-tabs.unit.test.tsx | vitest | 44 / **1** | No (42/42 pass on main) |
| admin use-site-transfer.hooks.unit.test.tsx | vitest | 63 / 0 | - |
| admin sites-i18n.unit.test.ts | vitest | 93 / 0 | - |
| admin ImportExport.unit.test.tsx | vitest | 11 / 0 | - |
| admin AgentPluginRow.unit.test.tsx | vitest | 19 / 0 | - |
| website soon-lock.unit.test.ts | node:test | 8 / 0 | - |
| website plugins-tool-registrations.unit.test.ts | node:test | 25 / 0 (after sdk build) | - |
| website bootstrap-reporting.unit.test.ts | node:test | 5 / 0 | - |
| website retire-bundled.unit.test.ts | node:test | 22 / 0 | - |
| website plugin-host.integration.test.ts | node:test | 25 / 0 (after sdk build) | - |
| website provider-plugin-link.unit.test.ts | node:test | 7 / 0 | - |
| website tool-registrations.unit.test.ts | node:test | 26 / 0 | - |
| website switch-on-saved-token.unit.test.ts | node:test | 10 / 0 | - |
| website moved-tools.golden.test.ts | node:test | 0 / **1** (after sdk build) | No (1/1 pass on main) |
| website admin-supabase-token-no-agent.test.ts | node:test | 2 / 0 (after sdk build) | - |
| website connect-tool.unit.test.ts | node:test | 54 / 0 | - |
| website import-access-token.unit.test.ts | node:test | 25 / 0 | - |
| website agent-plugin-search-tool.integration.test.ts | node:test | 18 / 0, 1 skipped | - |
| website tool-registrations.contracts.test.ts (assistant) | node:test | 36 / 0 (after sdk build) | - |
| website portable-host-guidance.unit.test.ts | node:test | 0 / **1** | No (1/1 pass on main) |
| website identity.unit.test.ts | node:test | 8 / 0 | - |

All 7 failing tests pass on origin/main, so they are regressions on the branch (or tests out of sync with branch code). Desktop failures were re-run once on the branch and reproduced identically.

## Failing tests

**desktop App.render.test.ts** — `App: Import never opens or starts a site, whether sites exist or not`
`AssertionError: only the Websites tab; no site tab was opened` / `2 !== 1`

**desktop ImportWebsite.render.test.ts** (4)
1. `ImportWebsite: the shared drop zone holds both Choose buttons, and its own picker routes a .zip by its real path` — `TypeError: Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of type 'Event'` at ImportWebsite.render.test.ts:60
2. `ImportWebsite: each button reaches its own source, and Cancel goes back` — assertion output `{}` (no message captured)
3. `ImportWebsite: working disables both sources and says so on the button that was pressed` — `Expected values to be strictly equal: false !== true` (test:78)
4. `ImportWebsite: a failure shows its words and a Copy details button; the address stays in the field` — `'' !== 'example.com'` (test:87)
(Likely related: the address input is not found/filled; compare with the admin failure below.)

**admin site-transfer-tabs.unit.test.tsx** — `transfer tab browser contracts > forwards field edits to their controllers and exposes loading import history`
`TestingLibraryElementError: Unable to find a label with the text of: Website address` (test:582; the Import Site section rendered without a field labelled that).

**website moved-tools.golden.test.ts** — `moved tools, cards, approvals and counters match the golden recorded before any move`
Log before failure: `[plugin-runtime] bundled initialization failed for 'charts-recharts' PluginLoadError: plugin 'charts-recharts' failed to load (INTEGRITY_FAILED)`; test fails on that (see raw file for the diff).

**website portable-host-guidance.unit.test.ts** — `Tovu delivers host tool rules beside portable skills, including tools-first delivery`
`Error: ENOENT: no such file or directory, lstat '/home/user/Tovu/content/agent-plugins/formspree'` from `__tests__/fixtures/bundled-source-root.ts:28` (copyPlugins). Note `content/agent-plugins` contains only how-tovu-works and tovu-theme on both branch and main here, yet the test passes on main, so the branch's fixture/selection now names `formspree`.

## Setup notes
- Node 24.22.2 installed from the nodejs.org tarball to ~/.local/node24.
- Root `npm ci` is not enough: `apps/desktop` and `apps/admin` each need their own `npm ci` (first admin run failed with unresolved vitest/@vitejs/plugin-react until then; those first-run outputs were overwritten).
- `npm run build:preload` in apps/desktop failed until apps/desktop's own `npm ci` installed electron; then succeeded.
- `packages/sdk` is not built after `npm ci` (`@tovu/sdk/dist/index.js` missing), which made 5 website files fail with ERR_MODULE_NOT_FOUND. I ran `npm run build` in packages/sdk and re-ran them (initial outputs kept as `*.prebuild.txt`). The main worktree got the same sdk build. This is a setup gap, not a branch fault.
- The kernel OOM-killed a process during the desktop run and again during a desktop rerun; the desktop failures are deterministic assertion failures and reproduced, so this is not believed to affect them.
- The website files were run one at a time with `--test-concurrency=1`; agent-plugin-search-tool reports 1 skipped test.
