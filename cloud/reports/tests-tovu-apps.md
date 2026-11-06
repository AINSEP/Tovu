# tests-tovu-apps

Status: in progress. Started 2026-11-06 19:49 UTC; hard cap 21:49 UTC.

## Revisions and scope

- Tovu branch `cloud/tests-tovu-apps`, tested code revision `adaf83ea8` (final publication revision pending).
- Tovu base `b34b9cb7ada1783698eea8ec83bb3d6913fc63c4` (`origin/cloud/combine`).
- Jini branch `cloud/tests-tovu-apps`, unchanged code revision `3a41ec5b678e7445dce1f23d5fe08735cdd4e2b8` (`origin/cloud/combine`); no Jini source changes or push needed.
- Pushed Tovu checkpoints: `3497f4f58`, `5da64e73a`, `adaf83ea8`.
- All logs are under `/workspace/work/tests-tovu-apps/`. All commands below source `/workspace/.tovu-build/env.sh`; commands use `/workspace/Tovu` unless stated otherwise.
- No deployment, publication, main push, force push, threshold reduction, exclusion, skipped-test addition, timeout increase, or complexity-debt addition.

## Setup

Refreshed the stale Jini dependency tree with a frozen install into a writable workspace store, then rebuilt from the specified base and relinked Tovu before trusting tests. Non-Jini installed Tovu dependencies match the base manifests.

```bash
# /workspace/Jini
CI=true npm_config_cache=/workspace/.tovu-build/npm-cache pnpm install --frozen-lockfile --store-dir /workspace/.tovu-build/pnpm-store
npm_config_cache=/workspace/.tovu-build/npm-cache pnpm --filter @jini-ai/core run build
npm_config_cache=/workspace/.tovu-build/npm-cache pnpm --no-bail -r build
# /workspace/Tovu
npm --prefix packages/contracts run build
npm --prefix packages/sdk run build
JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini
npm --prefix apps/desktop run build:preload
```

All above commands exited 0. Logs: `jini-install-workspace.log`, `jini-core-build.log`, `jini-build.log`, `contracts-build.log`, `sdk-build.log`, `link-jini.log`, `desktop-preload-build.log`.

## Final suite results

| Suite | Exact command | Result | Log |
| --- | --- | --- | --- |
| Standalone site-chat | `npm --prefix apps/site-chat test` | 188 passed, 0 failed, 0 skipped; 17 suites; exit 0 | `site-chat-tests-1.log` |
| Site-chat typecheck | `npm --prefix apps/site-chat run typecheck` | exit 0 | `site-chat-typecheck-1.log` |
| Admin typecheck | `npm --prefix apps/admin run typecheck` | exit 0 after all admin edits | `admin-typecheck-final.log` |
| Admin full suite and coverage | `npm --prefix apps/admin run test:cov -- --maxWorkers=2 --coverage.reporter=text --coverage.reporter=lcov --coverage.reporter=json-summary` | running | `admin-coverage.log` |
| Desktop gates | `/workspace/work/tests-tovu-apps/tini/root/usr/bin/tini -s -- npm --prefix apps/desktop run gates` | four gates passed, tests/coverage blocked by missing Chromium; direct final counts pending | `desktop-gates-final.log` |

Admin coverage retains the full source include/exclude configuration and 98% floor on statements, branches, functions and lines. Exact measured totals and gaps pending; coverage is not being chased.

Initial default-worker admin run (`npm --prefix apps/admin test`, `admin-test.log`) exited 137 before its final summary. Cgroup memory events confirmed OOM; it produced no complete suite counts. The full retry bounds workers without changing tests, source scope, timeouts, or thresholds.

Initial desktop gates exited 1: tree-quiet, typecheck, complexity and JS-backslide passed; tests and coverage failed. Untruncated diagnostic runs found 2,191 main tests (2,177 passed, 4 failed, 10 existing skips) and 847 renderer/contracts tests (844 passed, 3 failed, 0 skipped). These are initial results, not final results.

## Fixes and every test changed

| Changed file | Cause and preserved verification |
| --- | --- |
| `apps/admin/src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx` | Secret controls intentionally stopped publishing agent handles. Retains exact row/Save handles, asserts token/toggle privacy, and checks privacy persists after reveal. 105/105 passed. |
| `apps/admin/src/components/__tests__/Select.unit.test.tsx` | Shared controls now publish stable automatic handles by default. Adds the automatic-handle/search relationship test and retains the original absence check through the supported explicit `false` opt-out. |
| `apps/admin/src/__measurements__/request-volume.measurement.test.tsx` | Form editor now discovers providers on mount. Exact request multiset now includes its one `_providers` GET and the existing form GET; duplicates/unexpected requests still fail. Select + request-volume: 59/59 passed. |
| `apps/admin/src/features/library/__tests__/Library.unit.test.tsx` | Routes now use Suspense and lazy page owners. Verifies the actual boundary, exact lazy Library owner, and unchanged `tabId` prop. |
| `apps/admin/src/lib/__tests__/execution-settings.test.ts` | Integration fixture omitted the required access-approver port. Supplies a strict caller/tool assertion and asserts six checks across three fresh cards; retains real settings write, reload and next-send assertions. Library + execution-settings: 180/180 passed. |
| `apps/admin/src/features/plugins/__tests__/plugin-provider-settings.unit.test.tsx` | Secret field handles are intentionally suppressed. Keeps camelCase handle normalization coverage on a non-secret `apiHost` field and asserts the secret has only the private marker. |
| `apps/admin/src/features/settings/__tests__/external-mcp-agent-drive.unit.test.tsx` | Secret inputs are now undiscoverable and unaddressable. Retains discovery of public fields; asserts secret existence, exact no-published-element fill refusal, unchanged empty value, and privacy hidden/revealed. Plugin + MCP: 34/34 passed. |
| `apps/admin/src/admin-themes/__tests__/admin-themes.unit.test.ts` | Existing SeeMore stylesheet shifted import positions. Asserts its explicit position followed by the same bridge/Classic/Glass cascade; retains the no-Default-stylesheets checks. |
| `apps/admin/src/lib/__tests__/dictionary-lookup-sinks.unit.test.ts` | Guard falsely rejected Skills' valid module initialization map. Extends existing exact initializer recognition for that owner; a new regression test was observed red first and verifies subsequent/runtime accesses are still rejected. No blanket exemption or debt entry. |
| `apps/admin/src/features/sites/site-transfer-i18n.ts` | Warning copy used direct property mutation outside the guard's supported initialization syntax. One equivalent `Object.assign` statement reuses the file's existing assembly idiom. No translation, runtime request or state cost changes. Dictionary/theme/Sites/Skills group: 179/179 passed. |
| `apps/desktop/src/runner-ipc-stubs.test.ts` | Exact channel inventory omitted the already implemented Keep-running handler. Adds that real channel to the implemented inventory; drift assertions remain exact. 8/8 passed. |
| `apps/desktop/src/renderer/app-render-harness.ts` and `App.render.test.ts` | Shared bridge fixture omitted supported `keepSiteRunning`, so a close-tab test correctly hit the unavailable-connection path and failed with a large DOM assertion. Adds the real bridge capability and exact `keep-running:a` call assertion; tab-close/no-stop checks retained. App/start-panel: 17/17 passed. |

Production edits also correct recovery-code autocomplete and localize the existing alphabetical-sort label; no state I/O or sorting behavior changes. All other edits are tests/support or this report. Nine test cases were added across default handles, dictionary/recovery regressions and sort copy; none were deleted or newly skipped.

## Environment findings and repairs

- Electron binary initially absent. Installed with the package's existing checksum-verifying installer using `electron_config_cache=/workspace/.tovu-build/electron-cache`. Affected main group including harness import and project lifecycle passed 160/160 afterward. Logs: `electron-install-workspace.log`, worker's affected-main log.
- Container PID 1 did not reap killed descendants; two unchanged POSIX tests saw zombies as live PIDs. A rootless `tini` from the signed Debian package provides a proper subreaper. The unchanged two-test group passed 2/2 under it (`desktop-process-reaping-after.log`). Final desktop validation uses that environment.
- Playwright Chromium absent. Standard install (`PLAYWRIGHT_BROWSERS_PATH=/workspace/.tovu-build/playwright npm_config_cache=/workspace/.tovu-build/npm-cache ./node_modules/.bin/playwright install chromium`) was blocked at `cdn.playwright.dev` with HTTP 403 `Domain forbidden`. No test changes or network-policy bypass. Two desktop browser-layout tests require that executable.
- Initial missing dependency/build failures were repaired through the frozen install; missing package manager cache writes were moved to workspace paths.

## Quality and integrity

- Fresh admin typecheck passed after the last source edit. Desktop full typecheck/complexity final results pending.
- Every changed admin file was linted: zero errors. Existing warnings in measurement/theming/dictionary-checker/Library code are listed rather than refactored. No eslint-disable was added.
- Strict complexity on the changed production source: `./node_modules/.bin/eslint --rule 'complexity:[error,10]' --rule 'sonarjs/cognitive-complexity:[error,10]' apps/admin/src/features/sites/site-transfer-i18n.ts` — exit 0 (`admin-source-complexity.log`).
- Architecture review: no package boundary/import/public API/schema change; generic behavior remains in Jini, product copy remains in Tovu. No state I/O added.
- Diff integrity reviewed: stronger/current-contract assertions; no scope/threshold/suppression changes. Final `git diff --check` pending.
- A pre-existing generated `packages/plugin-ui-ux-design/` directory becomes untracked on the Jini combine base; left untouched and not committed.

## Bugs found

- Fixed: stale admin assertions conflicted with intentional secret privacy, automatic handles, provider discovery and lazy route contracts.
- Fixed: execution-settings test fixture lacked the required access-approver dependency.
- Fixed: dictionary guard falsely rejected valid Skills owner initialization; narrow recognition and negative probes added.
- Fixed: desktop channel inventory and renderer bridge fixture omitted the implemented Keep-running capability.
- Environment repaired: missing Electron binary.
- Environment repaired: descendant zombies caused by a container without a child-process reaper.
- Environment open: Chromium download blocked by network policy; browser layout tests cannot launch.
- Open: final coverage floor results and any remaining test failures pending.

## Second fix round — in progress

- MediaContentEditor markup test: retains exact absence on host controls, while identifying only the two shared help controls and dialog close as automatically addressable; markup/behavior group 53/53 passed. Its source documentation now describes that inherited shared-control behavior.
- agent-handle-batch1: retains zero-markup assertions with the supported explicit false opt-out, adds default-handle cases for InfoTip, SeeMore and ImagePreviewModal; 23/23 passed.
- OwnerRecoverySignIn: real recovery-code input incorrectly used autocomplete=off, ignored on password inputs. New rendered hidden/revealed regression observed red first; production attribute changed to new-password.
- RecoveryCodesCard test and credential-input-autocomplete guard: current-owner-password reauthentication legitimately uses current-password. Recognizes only that exact file/id, rejecting other/new/conditional ids and missing/off/undefined values. Rendered current-proof/new-reset checks added. Recovery group 35/35 passed.
- Dock visibility test now awaits the real lazy PostEditor import before asserting the same preview/dock containment; focused result pending.
- Posts localization test moves the unchanged pair of create-failure scenarios from the retired eager list-create path to real first Save in the unsaved editor; verifies rejected create call/payload and retained title. 47/47 passed; expanded related tests pending.
- Sites sort copy: existing A-Z key was untranslated in 21 locales. Only its values now read localized Name (A–Z), preserving lookup key, ascending indicator and sort behavior. Literal German/Japanese/Arabic/English assertions added; full untranslated-copy scanner unchanged.

Bugs found in this round:
- Fixed: recovery-code password input used autocomplete=off.
- Fixed: all 21 translated site-sort labels were copied from the English key.
- Fixed: stale shared-control default-handle tests and recovery-proof classification.
- Fixed: Posts test exercised an impossible eager list-create failure after creation moved to first editor Save.
- Pending verification: dock test assumed its lazy editor module was already loaded.
