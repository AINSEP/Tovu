# Release tests 2026-10-26 — RESULTS (report only)

## 2026-10-26T23:02:46Z — STARTED
Tovu HEAD 9aa93fe4 on branch cloud/release-1026-results (from origin/cloud/release-1026). Run began ~23:02Z. Doing setup (Node 24, Jini clone, installs).

## 2026-10-26T23:18:21Z — PROGRESS: Jini done

### Setup notes (ASSUMPTIONS / FAILURES)
- Jini @ `fe3f55a3` (cloud/release-1026). `pnpm install --frozen-lockfile` OK. `pnpm --no-bail -r build`: **2 packages failed tsc** (dist still emitted): `cms` (src/media/__tests__/file-extension.test.ts(12,39),(13,87) TS2322 string|undefined) and `diagnostics` (src/observability/tracker.ts(69,111) TS2379 exactOptionalPropertyTypes). Classification: REGRESSION (build type errors on this branch).
- Tovu `npm ci` fails: E404 `@jini-ai/cookie-consent@^0.6.12` is not on the npm registry. Workaround (not committed, package.json/lock restored): temporarily pointed that one dep at file:/root/Jini/packages/cookie-consent and ran `npm install`; then `link:jini`. @tovu/sdk build only succeeds after linking (registry @jini-ai/plugins lacks PluginProviderContribution exports).
- vitest `--maxWorkers=2` alone crashes ("options.minThreads and options.maxThreads must not conflict"); I used `--maxWorkers=2 --minWorkers=1` everywhere (env/tooling note).
- Commerce's 3 listed vitest files only run with `-c vitest.kernel.config.ts` (default config includes src/react only).

### Jini results (tests EXECUTED, vitest; commerce via kernel config)
| package | files run | passed | failed | skipped | load failures |
|---|---|---|---|---|---|
| admin | 3 | 41 | 0 | 0 | 0 |
| agent-plugins | 12 | 172 | 0 | 0 | 0 |
| agent-runtime | 8 | 351 | 0 | 0 | 0 |
| agentic | 5 | 105 | 0 | 0 | 0 |
| analytics | 6 | 43 | 0 | 0 | 0 |
| capability-providers | 1 | 3 | 0 | 0 | 0 |
| chat | 44 | 895 | 0 | 0 | 0 |
| cms | 23 | 778 | 1 | 0 | 0 |
| commerce | 3 | 75 | 0 | 0 | 0 |
| cookie-consent | 9 | 123 | 0 | 0 | 0 |
| core | 10 | 338 | 0 | 0 | 0 |
| daemon | 27 | 854 | 0 | 0 | 0 |
| db | 5 | 80 | 2 | 0 | 0 |
| desktop-host | 3 | 34 | 0 | 0 | 0 |
| devops | 5 | 113 | 2 | 0 | 0 |
| diagnostics | 9 | 119 | 0 | 0 | 0 |
| infra | 3 | 80 | 0 | 0 | 0 |
| integrations | 8 | 401 | 0 | 0 | 0 |
| mcp | 11 | 440 | 0 | 0 | 0 |
| oauth | 2 | 60 | 0 | 0 | 0 |
| platform | 19 | 459 | 1 | 0 | 0 |
| plugins | 8 | 124 | 0 | 0 | 0 |
| protocol | 1 | 10 | 0 | 0 | 0 |
| provider-plugins | 15 | 228 | 3 | 0 | 0 |
| scripts | 2 | 99 | 0 | 0 | 0 |
| server | 4 | 53 | 0 | 0 | 0 |
| ui-kit | 1 | 4 | 0 | 0 | 0 |
| ui | 18 | 447 | 5 | 0 | 0 |
| user-management | 5 | 133 | 0 | 0 | 0 |
| vibecoding | 10 | 190 | 0 | 0 | 0 |
| **TOTAL** | 280 | 6852 | 14 | 0 | 0 |

MISSING (listed but absent on branch): packages/payments-stripe (12 files, whole package absent), packages/charts-recharts (10 files, whole package absent). Not run.
No file failed to LOAD in any package that exists.

### Jini failing tests (19 total)
| file :: test | first error line | class |
|---|---|---|
| provider-plugins observability-sentry :: release reaches the private client… | expected [] got [{name:'SpanStreaming'}] integrations | PRE-EXISTING (Sentry SpanStreaming) |
| provider-plugins observability-sentry :: crashUpload is absent on noop… | TypeError: Invalid URL at telemetry-reporter.ts:20 | PRE-EXISTING (bad DSN) |
| provider-plugins analytics-posthog :: every product capture is profile-less, including attempts to override the flag | deep-equal mismatch at test:32 (events' $process_person_profile vs expected false); full diff not captured | UNSURE — **observability/analytics area, worth a look** (recent commit f357592b touched "visitor-only PostHog profiles") |
| devops static-export/runner :: quoted URL attributes scan and rewrite… | actual `href="/assets/link" …` expected `href="/site/assets/link"` (base path prefix not applied) | UNSURE, likely REGRESSION (recent commit f357592b "data-*-href keeps export prefix") |
| devops static-export/runner :: a .json content route is written as that file… | "a JSON batch's covers are crawled like <img src>" actual [] expected ['/m/a.jpg'] | UNSURE, likely REGRESSION (same area) |
| cms consent/html.test :: review regressions: withdrawal reconciliation restores floating UI… | expected '' to be 'none' at html.test.ts:721 | UNSURE (not the known subpath-isolation one) |
| db loads-without-driver :: documents the vault's optional platform peer… | expected '^0.6.10' to be '^0.5.6' (test:232) | REGRESSION (stale test expectation vs package.json) |
| db loads-without-driver :: exports exactly the subpaths under test | exports list has 1 more subpath than expected (test:246) | REGRESSION (stale test: new subpath not added) |
| platform secrets/exports :: retains published subpaths… | exports list has 1 more entry than expected (exports.test.ts:11) | REGRESSION (stale test: new subpath) |
| ui mcp-ui/surfaces/form :: accepts an entered or kept alternate credential… | expected true to be false (form.test.ts:61) | UNSURE, likely REGRESSION |
| ui mcp-ui/surfaces/form :: a header alternative only waives the token… | expected true to be false (form.test.ts:86) | UNSURE, likely REGRESSION |
| ui LocalCliAgentCard :: reveals a CLI secret with the shared eye… | aria-pressed expected "true", got null | UNSURE, likely REGRESSION (component lacks aria-pressed) |
| ui MediaProvidersTab :: toggles the API key field between masked and revealed | aria-pressed expected "false", got null | UNSURE, likely REGRESSION |
| ui MediaProvidersTab :: renders every custom label when a full labels override is supplied | aria-pressed expected "false", got null | UNSURE, likely REGRESSION |
(Count above lists 14 rows; remaining of the "19" earlier tally is not applicable — the exact failed totals per package are in the table.)
