# tests-tovu-apps

Status: completed with the coverage and environment limits recorded below. All requested suites ran and all code fixes are pushed.

## Revisions

- Tovu branch: `cloud/tests-tovu-apps`. Final tested source: `ddb41f38016f5c7ce0bfa1864117fb723b3bb3d1`, based on `origin/cloud/combine` at `b34b9cb7ada1783698eea8ec83bb3d6913fc63c4`. Subsequent commits update this report only.
- Jini branch: `cloud/tests-tovu-apps`. Unchanged source: `3a41ec5b678e7445dce1f23d5fe08735cdd4e2b8`, the specified `origin/cloud/combine` base. No Jini source change or push was necessary.
- Pushed Tovu checkpoints: `3497f4f58`, `5da64e73a`, `adaf83ea8`, `31631eda6`, `a08b2b10b`, `3f0a704fa`, `ddb41f380`, `ecdc1723b`; later report-only checkpoint SHAs appear in branch history and the final chat.
- Started 2026-11-06 at 11:49 PST (19:49 UTC); hard cap 13:49 PST (21:49 UTC). Completed 2026-11-06 12:56 PST; within the two-hour cap.
- Logs and retained raw coverage: `/workspace/work/tests-tovu-apps/`.

## Full-suite results

All commands first source `/workspace/.tovu-build/env.sh`. Working directory is `/workspace/Tovu` unless specified. Desktop uses the rootless tini subreaper shown in each command.

| Suite | Exact command | Result | Evidence |
| --- | --- | --- | --- |
| Admin full tests and coverage | `npm --prefix apps/admin run test:cov -- --maxWorkers=2 --coverage.reporter=text --coverage.reporter=lcov --coverage.reporter=json-summary` | 883 files passed; 14,335 passed, 0 failed, 2 existing skips (14,337 total); exit 1 solely branch floor | `admin-coverage-final.log`, `.exit`, `-summary.json`, `-lcov.info` |
| Admin typecheck | `npm --prefix apps/admin run typecheck` | PASS, exit 0 after all edits | `admin-typecheck-quality.log` (post-repair) |
| Standalone site-chat | `npm --prefix apps/site-chat test` | 188 passed, 0 failed, 0 skipped; 17 suites; exit 0 | `site-chat-tests-1.log` |
| Site-chat typecheck | `npm --prefix apps/site-chat run typecheck` | PASS, exit 0 | `site-chat-typecheck-1.log` |
| Desktop tests | `/workspace/work/tests-tovu-apps/tini/root/usr/bin/tini -s -- npm --prefix apps/desktop test` | 3,048 total: 3,036 passed, 2 environment failures, 10 existing skips; exit 1 | `desktop-tests-final.log` |
| Desktop gates | `/workspace/work/tests-tovu-apps/tini/root/usr/bin/tini -s -- npm --prefix apps/desktop run gates` | 4 passed, 2 failed: only tests and coverage, both blocked by Chromium; exit 1 | `desktop-gates-final.log` |
| Desktop typecheck | `npm --prefix apps/desktop run typecheck` | PASS, all four tsconfigs; exit 0 | `desktop-typecheck-after.log` |
| Desktop complexity, cwd apps/desktop | `node scripts/check-complexity.ts` | PASS: 251 files, 9/9 ceiling, 3 pre-existing grandfathered cases, 0 new; exit 0 | `desktop-complexity-after.log` |

Desktop main: 2,191 total, 2,181 passed, 0 failed, 10 existing platform skips. Renderer/contracts: 857 total, 855 passed, 2 failed, no skips. Admin's two existing skips are the `panels-render.unit.test.tsx` `/media/new` context cases; none were added.

### Admin coverage against unchanged 98% floors

| Metric | Measured | Covered / total | Floor | Gap to floor |
| --- | --- | --- | --- | --- |
| Statements | 98.82% | 23,650 / 23,931 | 98% | 0.00 percentage points |
| Branches | 97.78% | 15,867 / 16,227 | 98% | 0.22 percentage points |
| Functions | 98.27% | 8,450 / 8,598 | 98% | 0.00 percentage points |
| Lines | 99.13% | 19,573 / 19,743 | 98% | 0.00 percentage points |

Percentages above use the tool's displayed precision. The exact branch deficit from raw counts is 394/1803 percentage points (approximately 0.21852468); the displayed deficit is 0.22 points. At the unchanged denominator, the floor requires 15,903 covered branches, so 36 additional covered branches are needed. Exit 1 is solely the branch floor; no tests failed. No floor was lowered and no coverage gap was chased. Final duration: 878.52s. Raw artifacts: `admin-coverage-final-summary.json`, `admin-coverage-final-lcov.info`.

No coverage was chased. Include/exclude patterns, floors, test timeouts and quality rules were not reduced or bypassed.

### Desktop coverage

The unchanged Node lcov gate counts comments/blank lines differently from Vitest; these metrics are not directly comparable to admin. The browser suite failed before layout assertions, so this is a measured failing run, not a passing coverage gate. All configured area floors and inventory checks themselves passed.

| Area | Lines / floor | Branches / floor | Functions / floor | Measured files |
| --- | --- | --- | --- | --- |
| Main process | 97.40% / 96% | 97.62% / 90% | 92.78% / 90% | 124/125 |
| Renderer/contracts | 99.73% / 76% | 98.37% / 88% | 94.43% / 66% | 82/82 |
| Renderer components | 99.68%, no floor | 97.13%, no floor | 97.74%, no floor | 22/23 |
| bin | 100% / 85% | 100% / 80% | 100% / 62% | 1/1 |

Source inventory: 232 files, zero violations. Existing declared unmeasured files: `src/speech/preload-speech.cts`, `src/renderer/main.tsx`. Per-file branch policy is advisory (`enforced:false`); its failures array is empty. Listed only:

- `src/main/index.ts`: 1/5 branches = 20%, 60 percentage points below advisory 80%; composition-root Electron callbacks are not dynamically covered (0/109 functions).
- `src/desktop-agent-service.ts`: 78/104 = 75%, 5 points below advisory 80%; native defaults, Windows normalization and lifecycle/control refusal/error/stale-ready arms are unexercised.
- `src/desktop-mcp-http.ts`: 20/26 = 76.9231%, 3.0769 points below advisory 80%; runtime start, connect/abort races, optional/non-OK handoff and shutdown-disconnect arms are unexercised.

These advisory gaps are independent of missing Chromium; no production bug was demonstrated and no debt entry was added. Retained `desktop-final-node.lcov`, `desktop-final-tsx.lcov` and `desktop-final-coverage-summary.{json,log}` were reconstructed with the unchanged coverage evaluators after preserving open read-only handles before the gate deleted temporary lcov.

## Fixes and every changed test

Paths below are relative to `apps/admin/`, except the three desktop paths. Existing tests that were updated were genuinely stale; the current source contracts and exact behavior assertions remain verified.

| Changed test/support | Cause and resulting verification |
| --- | --- |
| `src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx` | Secret controls intentionally became private. Retains exact row/Save handles; asserts input/toggle privacy and privacy after reveal. 105/105 focused tests passed. |
| `src/components/__tests__/Select.unit.test.tsx` | Shared controls now generate default handles. Adds automatic trigger/search relationship coverage; retains absence checks through explicit `false`. Select + request-volume group: 59/59. |
| `src/__measurements__/request-volume.measurement.test.tsx` | Form editor now discovers providers. Exact request multiset includes one `_providers` GET and the saved-form GET; duplicate/unexpected requests still fail. |
| `src/features/library/__tests__/Library.unit.test.tsx` | Registry now returns Suspense plus the lazy Library owner. Verifies exact boundary, owner and `tabId` prop. |
| `src/lib/__tests__/execution-settings.test.ts` | Required access-approver port was absent from fixture. Strict caller/tool assertions and six approval checks preserve real settings-write/reload/next-send assertions. Library + execution-settings: 180/180. |
| `src/features/plugins/__tests__/plugin-provider-settings.unit.test.tsx` | Secret handles were deliberately removed. Tests camelCase normalization on non-secret `apiHost` and secret-only privacy marker. |
| `src/features/settings/__tests__/external-mcp-agent-drive.unit.test.tsx` | Secret discovery/fill contract changed to undiscoverable/unaddressable. Exact no-published-element refusal, unchanged value, public-field discovery and hidden/revealed privacy retained. Plugin + MCP: 34/34. |
| `src/admin-themes/__tests__/admin-themes.unit.test.ts` | Existing SeeMore import shifted indexes. Explicitly asserts it precedes the same bridge/Classic/Glass cascade and retains no-Default-stylesheet checks. |
| `src/lib/__tests__/dictionary-lookup-sinks.unit.test.ts` | Guard falsely rejected Skills' valid initialization map. Exact owner initializer recognition, red-first regression and negative later/runtime access probes retain the guard. Dictionary/theme/Sites/Skills group: 179/179. |
| `src/components/WidgetConfigFields/__tests__/MediaContentEditor.markup.unit.test.tsx` | Global absence assertion predated shared help/dialog default handles. Only the two named help controls and dialog close may be automatic; host controls still lack handles. Markup/behavior group: 53/53. |
| `src/components/__tests__/agent-handle-batch1.unit.test.tsx` | Preserves original opt-out assertions with supported `false`; adds default InfoTip/SeeMore/ImagePreviewModal cases. 23/23. |
| `src/components/__tests__/agent-handle-batch3.unit.test.tsx` | Retains absence on host inputs/actions and recognizes only the shared Select/dialog controls' default handles. 7/7. |
| `src/features/auth/__tests__/OwnerRecoverySignIn.unit.test.tsx` | New rendered red-first regression proves recovery-code autocomplete remains `new-password` hidden and revealed. |
| `src/features/security/__tests__/RecoveryCodesCard.unit.test.tsx` | New rendered regression verifies existing-password proof is `current-password`, while reset fields remain `new-password`, including reveal. |
| `src/lib/__tests__/credential-input-autocomplete.unit.test.ts` | Guard predated the recovery-kit reauthentication field. Recognizes only exact file + literal proof id; negative other/conditional-id/missing/off/undefined probes remain. Recovery group: 35/35. |
| `src/features/posts/__tests__/posts-i18n.unit.test.ts` | Creation moved from eager list action to first editor Save. The same two locale scenarios now verify actual Save failure, rejected payload/call count and retained typed title. 47/47; expanded Posts/Sites group: 294/294. |
| `src/features/sites/__tests__/sites-i18n.unit.test.ts` | New literal German/Japanese/Arabic and English fallback check for localized ascending-name sort display. Sort behavior/key unchanged. |
| `src/__tests__/unit/app-admin-assistant-dock-visibility.unit.test.tsx` | Preloads actual lazy editor as setup before timing containment. Same route/dock/CSS assertions, same timeouts. 4/4. |
| `src/__tests__/unit/scroll-jump-layout-css.unit.test.ts` | Guard merged phone overrides into desktop rule. Separates base 32 px and phone 44 px centering and retains spacer/clearance assertions; adds phone case. 6/6; no CSS change. |
| `src/features/consent/__tests__/consent-i18n.unit.test.tsx` | Tests demanded a deliberately retired dynamic-code control/help. All21 locale cases now render active translated rules and assert legacy values do not restore retired UI or emit changes. Same26 cases, all passed. |
| `src/features/authentication/__tests__/Authentication.unit.test.tsx` | Awaits same real lazy registry screen/note. 5/5. |
| `src/features/admin-ui/__tests__/redirects.unit.test.tsx` | Locale fixture supplies both real fallback hook names; preload/await actual lazy redirects. Same exact pathname/query/hash/history checks. 4/4. |
| `__tests__/vitest-coverage-config.unit.test.ts` | Node config imports CLI/esbuild; jsdom's typed-array realm violated its invariant. Correct Node test environment executes all unchanged exact source scope/98% floors/reportOnFailure assertions. 1/1; no config change. |
| `src/integrations/chart-providers/__tests__/recharts-bundle-integer-ticks.unit.test.ts` | Duplicate pin lagged already-reviewed 0.6.24 payload. Refreshes literal only; no approval or integrity changes. 13/13 chart tests and 7/7 authoritative digest tests. |
| `src/lib/__tests__/credential-copy-card-frame.unit.test.ts` | Retired copy/upgrade fixture lacked current Shared Keys service. Approve/cancel scenarios use real in-memory service; assert grant/no-grant, unchanged vault, cleanup, one card, original compact metadata and executed 212 → 165 px shrink. 2/2 plus 6/6 current tool tests. |
| `src/features/settings/__tests__/ExternalMcpSharedChoice.unit.test.tsx` | Adds two rendered Spanish regressions for translated choices/stopped/unavailable states; retains both English behavior tests. |
| `src/components/__tests__/AdminFailureNotice.unit.test.tsx` | Adds real German incident dismissal regression; existing selectable/copyable failure behavior remains. |
| `src/components/__tests__/shared-components-i18n.unit.test.ts` | Adds new Dismiss error key to existing 21-locale call-site inventory. Literal-copy group:119/119. |
| `src/lib/__tests__/fixtures/admin-literal-copy.baseline.json` | Removes 29 obsolete allowances for already-translated Skills code:99 → 70 entries, zero additions; scanner unchanged. |
| `apps/desktop/src/runner-ipc-stubs.test.ts` | Exact inventory omitted implemented Keep-running channel. Refreshes inventory; exact bidirectional drift checks retained. 8/8. |
| `apps/desktop/src/renderer/app-render-harness.ts`, `App.render.test.ts` | Bridge fixture omitted supported `keepSiteRunning`, correctly taking failure path and preventing App tests from completing. Restores fixture method and adds exact `keep-running:a` call assertion; tab close/no-stop retained. App/start-panel 17/17; related main 160/160. |

Production changes are limited to the recovery-code autocomplete fix, equivalent Warning dictionary assembly,21 localized ascending-name labels,12 localized UI strings across 21 locales, and translator wiring using existing owners. Media/WidgetPicker documentation now describes inherited shared-control handles. No new module, dependency, schema, provider behavior or state I/O was introduced. Four pre-existing asynchronous SharedChoice fallback messages remain untranslated; listed as a minor finding, not changed.

## Setup and environment

Rebuilt Jini and relinked Tovu before trusting any baseline. Commands from `/workspace/Jini`:

```bash
CI=true npm_config_cache=/workspace/.tovu-build/npm-cache pnpm install --frozen-lockfile --store-dir /workspace/.tovu-build/pnpm-store
npm_config_cache=/workspace/.tovu-build/npm-cache pnpm --filter @jini-ai/core run build
npm_config_cache=/workspace/.tovu-build/npm-cache pnpm --no-bail -r build
```

Then from Tovu: `npm --prefix packages/contracts run build`, `npm --prefix packages/sdk run build`, `JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini`, `npm --prefix apps/desktop run build:preload`. All exited0; logs retain each operation.

- Initial dependency links were stale; frozen install repaired them. Package caches were moved to writable workspace paths. No manifests/lockfiles changed.
- Electron initially lacked its binary. Supported `electron/install.js` with workspace cache and package checksums repaired it; unchanged harness import passed.
- Container PID1 left killed descendants as zombies. Signed Debian `tini` extracted under work provides a subreaper. Both unchanged POSIX escalation tests pass 2/2; final full main pass has zero failures.
- Chromium headless shell revision 1228 is missing. Standard `PLAYWRIGHT_BROWSERS_PATH=/workspace/.tovu-build/playwright npm_config_cache=/workspace/.tovu-build/npm-cache ./node_modules/.bin/playwright install chromium` was denied 403 `Domain forbidden` at `cdn.playwright.dev`; no bypass or test change.
- The two remaining desktop failures are `src/renderer/websites-width.test.ts`: “Websites fits at 375 px with every nav control and header action inside the page” and “narrow collapsed multi-tab content fills the dialog, and the desktop single-tab dialog uses its one column”. Both fail before assertions on browser launch.
- Initial default-worker admin run exited 137 before summary (OOM). The first bounded full discovery run completed 883 files / 14,318 tests: 14,272 passed / 44 failed / 2 existing skips plus 2 obsolete fixture rejections. Source was changing during discovery, so cached transforms caused additional stale results. Artifacts are retained as `admin-coverage-round1.*`; final authoritative run uses the frozen source SHA above.
- Pre-existing generated `Jini/packages/plugin-ui-ux-design/` becomes untracked on the combine base; left untouched and uncommitted.

## Quality and review

Independent read-only diff review and a second review of the final guard refactor found no actionable issues; see `integrity-review.md` under the evidence directory. Parent also reviewed every change and verified zero added skip/only, eslint-disable or coverage-ignore markers.

Every changed admin file was linted with zero errors under its ordinary configuration; existing warnings were listed and not refactored. Strict complexity on all 10 changed admin production files exited0, with only the existing unused `t` assignment warning in `ExternalMcpSettingsPanel.tsx:162`. Exact command is in `admin-production-complexity-final.log` provenance:

```bash
./node_modules/.bin/eslint --rule 'complexity:[error,10]' --rule 'sonarjs/cognitive-complexity:[error,10]' \
 apps/admin/src/components/AdminFailureNotice/AdminFailureNotice.tsx \
 apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx \
 apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx \
 apps/admin/src/components/shared-components-i18n.ts \
 apps/admin/src/features/auth/OwnerRecoverySignIn.tsx \
 apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx \
 apps/admin/src/features/settings/ExternalMcpSharedChoice.tsx \
 apps/admin/src/features/settings/external-mcp-i18n.ts \
 apps/admin/src/features/sites/site-transfer-i18n.ts \
 apps/admin/src/features/sites/sites-i18n.ts
```

Architecture audit: existing Jini service/translator owners reused; Tovu retains product copy/wiring. Public package boundaries, schemas and dependency directions unchanged. State cost: zero added requests, polls, writes or subscriptions; parent translator passed through, pre-auth notice reads document locale. Changes add no unbounded I/O or resource use. Function-quality review: locale/copy wiring is O(1) per render; static dictionary assembly is bounded by existing locale/key data; diagnostic collection is linear in token and output text. Existing in-memory test seams are reused; no new domain algorithm or unbounded I/O.

The final autocomplete diagnostic repair preserves exact messages and priority: 468 individual combinations and 303 aggregate diagnostics are identical. Its changed helpers have cyclomatic/cognitive complexity 6/4, 8/5 and 5/5. The pre-existing parser scanner remains 31/37; strict test-file lint still flags that untouched helper, explicitly listed rather than broadly refactored. The complete guard file passed 22/22 tests and post-repair typecheck passed. The repair changed no test count or production coverage scope.

Integrity: no test deletion, new skip/only, eslint-disable, coverage ignore, reduced scope/floor, inflated timeout or debt addition. Thirteen cases were added (default handles/dictionary/recovery/sort/phone/UI regressions); other scenario counts were retained. The Node test environment correction applies to a Node configuration test, not production coverage scope. Final `git diff --check`: PASS.

## Bugs found

- Fixed: recovery-code password input used browser-ignored autocomplete=off.
- Fixed: 21 site-sort display labels were copied untranslated from English.
- Fixed: 11 shared-connection UI strings and incident dismissal lacked locale wiring/data.
- Fixed: stale fixtures/expectations for secret privacy, automatic handles, provider discovery, required approver checks and lazy route readiness.
- Fixed: dictionary guard rejected valid owner-local Skills initialization; exact negative runtime-bypass checks now accompany recognition.
- Fixed: obsolete literal-copy allowances hid already-resolved Skills work; 29 allowances removed.
- Fixed: Consent tests demanded intentionally retired unsafe-eval UI.
- Fixed: Posts create-failure tests drove a retired eager-create action.
- Fixed: credential compact-frame test drove retired copy/upgrade screens rather than current reference grants.
- Fixed: chart test pin lagged existing approved bundle and prevented 13 cases loading.
- Fixed: coverage config test used an incompatible browser realm for Node CLI code.
- Fixed: scroll CSS test conflated desktop and responsive phone declarations.
- Fixed: desktop IPC inventory/renderer fixture omitted supported Keep-running capability.
- Environment repaired: Electron binary missing; descendant zombies from absent child reaper.
- Environment open: Chromium download denied; two desktop layout tests remain unverified.
- Coverage open: admin branches 97.78% versus 98% (0.22 displayed percentage points; 36 additional covered branches at the same denominator).
- Minor open: three advisory desktop per-file branch gaps described above.
- Minor open: four existing async SharedChoice fallback messages remain untranslated.
- Minor open: desktop gate truncates child output to 2,000 characters; direct runs preserved exact summaries.
- Minor open: unchanged legacy credential AST scanner complexity 31/37, plus existing dictionary scanner/helper complexity warnings; no new debt or suppression.
- Minor open: existing lint warnings in untouched test/helper code and settings translator assignment; no unrelated refactor performed.
