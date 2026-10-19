# Test sweep 2026-10-15 — suite list (test-sweep-0c)

Tovu HEAD: 06ea5fd8b (branch restructure/apps-website-phased); Jini HEAD: e703e78e. Working trees dirty (other agents' in-flight work) — results reflect the tree as it was at run time.

Driver: `run-suites.sh` (copy in this folder). Each suite: test-lock acquire/release test-sweep-0c, own process group, 60-min hard limit, leftovers killed. Logs: `logs/<name>.log`; vitest JSON `logs/<name>.json`; node TAP `logs/<name>.tap`. File lists for Tovu website batches in `batches/` (all 1910 apps/website/src/**/*.test.ts, the 26 `*.unrun.*` files in their own batch).

Caps: vitest --maxWorkers=2 (+ --minWorkers=1 on Jini vitest 2.1.9); node --test --test-concurrency=1; Playwright workers=1 headless; TOVU_ADMIN_PASSWORD unset.

## Suites (run order)

| # | name | cwd | command |
|---|---|---|---|
| 1 | jini-admin | Jini/packages/admin | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-admin.json` |
| 2 | jini-agent-plugins | Jini/packages/agent-plugins | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-agent-plugins.json` |
| 3 | jini-agent-runtime | Jini/packages/agent-runtime | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-agent-runtime.json` |
| 4 | jini-agentic | Jini/packages/agentic | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-agentic.json` |
| 5 | jini-analytics | Jini/packages/analytics | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-analytics.json` |
| 6 | jini-artifacts | Jini/packages/artifacts | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-artifacts.json` |
| 7 | jini-capability-providers | Jini/packages/capability-providers | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-capability-providers.json` |
| 8 | jini-charts-recharts | Jini/packages/charts-recharts | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-charts-recharts.json` |
| 9 | jini-chat | Jini/packages/chat | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-chat.json` |
| 10 | jini-cli | Jini/packages/cli | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-cli.json` |
| 11 | jini-cms | Jini/packages/cms | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-cms.json` |
| 12 | jini-cms-forms | Jini/packages/cms/forms | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-cms-forms.json` |
| 13 | jini-core | Jini/packages/core | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-core.json` |
| 14 | jini-daemon | Jini/packages/daemon | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-daemon.json` |
| 15 | jini-db | Jini/packages/db | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-db.json` |
| 16 | jini-desktop-host | Jini/packages/desktop-host | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-desktop-host.json` |
| 17 | jini-devops | Jini/packages/devops | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-devops.json` |
| 18 | jini-diagnostics | Jini/packages/diagnostics | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-diagnostics.json` |
| 19 | jini-http-kit | Jini/packages/http-kit | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-http-kit.json` |
| 20 | jini-infra | Jini/packages/infra | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-infra.json` |
| 21 | jini-integrations | Jini/packages/integrations | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-integrations.json` |
| 22 | jini-mcp | Jini/packages/mcp | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-mcp.json` |
| 23 | jini-memory | Jini/packages/memory | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-memory.json` |
| 24 | jini-oauth | Jini/packages/oauth | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-oauth.json` |
| 25 | jini-platform | Jini/packages/platform | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-platform.json` |
| 26 | jini-plugins | Jini/packages/plugins | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-plugins.json` |
| 27 | jini-protocol | Jini/packages/protocol | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-protocol.json` |
| 28 | jini-registry | Jini/packages/registry | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-registry.json` |
| 29 | jini-sandbox | Jini/packages/sandbox | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-sandbox.json` |
| 30 | jini-server | Jini/packages/server | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-server.json` |
| 31 | jini-sidecar | Jini/packages/sidecar | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-sidecar.json` |
| 32 | jini-sqlite | Jini/packages/sqlite | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-sqlite.json` |
| 33 | jini-ui-kit | Jini/packages/ui-kit | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-ui-kit.json` |
| 34 | jini-ui | Jini/packages/ui | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-ui.json` |
| 35 | jini-user-management | Jini/packages/user-management | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-user-management.json` |
| 36 | jini-vibecoding | Jini/packages/vibecoding | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-vibecoding.json` |
| 37 | jini-commerce-node | Jini/packages/commerce | `node --import tsx --test --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/jini-commerce-node.tap src/catalog/__tests__/unit/*.test.ts src/payments/__tests__/*.test.ts src/http/__tests__/*.test.ts src/store/__tests__/*.test.ts` |
| 38 | jini-commerce-vitest | Jini/packages/commerce | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-commerce-vitest.json` |
| 39 | jini-ex-minimal-host | Jini/examples/minimal-host | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-ex-minimal-host.json` |
| 40 | jini-ex-nlweb-demo | Jini/examples/nlweb-demo | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-ex-nlweb-demo.json` |
| 41 | jini-ex-reference-desktop | Jini/examples/reference-desktop | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-ex-reference-desktop.json` |
| 42 | jini-ex-reference-web | Jini/examples/reference-web | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-ex-reference-web.json` |
| 43 | jini-root-scripts | Jini | `npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/jini-root-scripts.json scripts/__tests__` |
| 44 | tovu-admin-vitest | Tovu/apps/admin | `npx vitest run --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=<sweep>/logs/tovu-admin-vitest.json` |
| 45 | tovu-web-assistant | Tovu | `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-web-assistant.tap $(cat <sweep>/batches/w-assistant.txt)` |
| 46 | tovu-web-cli-contracts | Tovu | `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-web-cli-contracts.tap $(cat <sweep>/batches/w-cli-contracts.txt)` |
| 47 | tovu-web-features-am | Tovu | `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-web-features-am.tap $(cat <sweep>/batches/w-features-am.txt)` |
| 48 | tovu-web-features-nz | Tovu | `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-web-features-nz.tap $(cat <sweep>/batches/w-features-nz.txt)` |
| 49 | tovu-web-platform | Tovu | `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-web-platform.tap $(cat <sweep>/batches/w-platform.txt)` |
| 50 | tovu-web-server-inbound | Tovu | `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-web-server-inbound.tap $(cat <sweep>/batches/w-server-inbound.txt)` |
| 51 | tovu-web-server-tests | Tovu | `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-web-server-tests.tap $(cat <sweep>/batches/w-server-tests.txt)` |
| 52 | tovu-web-server-runtime | Tovu | `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-web-server-runtime.tap $(cat <sweep>/batches/w-server-runtime.txt)` |
| 53 | tovu-desktop-main | Tovu/apps/desktop | `npm run build:preload && env -u TOVU_ADMIN_PASSWORD node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-desktop-main.tap "src/*.test.ts" "src/!(renderer\|contracts)/**/*.test.ts"` |
| 54 | tovu-desktop-renderer | Tovu/apps/desktop | `env -u TOVU_ADMIN_PASSWORD node --import tsx --test --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-desktop-renderer.tap "src/renderer/**/*.test.ts" "src/contracts/**/*.test.ts"` |
| 55 | tovu-devtooling | Tovu | `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-devtooling.tap "packages/*/src/**/*.test.ts" "apps/site-chat/src/**/*.test.ts" "development/scripts/**/*.test.ts" "development/eslint-rules/**/*.test.ts"` |
| 56 | tovu-web-unrun | Tovu | `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=<sweep>/logs/tovu-web-unrun.tap $(cat <sweep>/batches/w-unrun.txt)` |
| 57 | tc-tovu-root | Tovu | `npm run typecheck` |
| 58 | tc-tovu-scripts | Tovu | `npm run typecheck:scripts` |
| 59 | tc-tovu-tests | Tovu | `npm run typecheck:tests` |
| 60 | tc-tovu-admin | Tovu/apps/admin | `npx tsc --noEmit` |
| 61 | tc-tovu-desktop | Tovu/apps/desktop | `npm run typecheck` |
| 62 | tc-tovu-site-chat | Tovu/apps/site-chat | `npx tsc --noEmit` |
| 63 | tc-jini | Jini | `pnpm -r --workspace-concurrency=1 --if-present run typecheck && npx tsc -p scripts/tsconfig.json --noEmit` |

## E2E (run last, after the list above)

`npx playwright test --config=development/playwright.journeys.config.ts --workers=1` (isolated memory-DB journey site on ports 9101-9103, headless), split into 3 runs by journey file so each stays under the 60-min lock staleness window:
- e2e-journeys-1: admin-*.pins, agent-page, assistant-*, auth, byok, collections, composer, credential-card-safety
- e2e-journeys-2: deployment*, forms, media*, native-dialog-families, pages*, plugins*, posts*, release-0113-ui
- e2e-journeys-3: settings-locale, site-chat, site-import, smoke, surfaces, themes*, users*, widgets-menus*, zz-*-shots (SHOT_DIR -> scratch)
`@live` / `@real-service` tests are grep-inverted by the config without TOVU_E2E_REAL_SERVICES=1 (not set: needs real provider credentials).
admin-layout.pins writes PNGs into tracked ADS-memory/reports/{visual-parity-taxonomy-workspace/before,placeholder-tabs-card-parity}: backed up before and restored after.

## Skipped (with reason)

- Jini `test:postgres` (chat, daemon, db): needs a Postgres server URL; not part of default `test`.
- Jini ui-kit `test:headless`: runs `pnpm run build` (rewrites package dist that release agents use) before a smoke.
- Tovu `npm run e2e:journeys:real` / `@live` / `@real-service`: needs real provider credentials/network.
- Tovu `e2e:desktop` (playwright.desktop-journeys) and `e2e:desktop:app`: decided at the end (needs fresh dev builds or the packaged app; launches Electron windows).
- Other development/playwright.*.config.ts (desktop-shell, mobile-visual) and legacy `development/e2e/*.spec.ts`: decided at the end.
- Lint / complexity / check:* gate scripts: not test suites.
- Coverage runs: out of scope (pass/fail sweep).

## Results per suite (name rc seconds counts; log = logs/<name>.log, plus .json/.tap)

```
jini-admin rc=1 90s total 1645 pass 1644 fail 1 skip 0
jini-agent-plugins rc=0 18s total 389 pass 389 fail 0 skip 0
jini-agent-runtime rc=0 32s total 2912 pass 2912 fail 0 skip 0
jini-agentic rc=0 12s total 948 pass 948 fail 0 skip 0
jini-analytics rc=0 2s total 86 pass 86 fail 0 skip 0
jini-artifacts rc=0 3s total 137 pass 137 fail 0 skip 0
jini-capability-providers rc=0 5s total 182 pass 182 fail 0 skip 0
jini-charts-recharts rc=0 8s total 63 pass 63 fail 0 skip 0
jini-chat rc=0 300s total 2202 pass 2201 fail 0 skip 1
jini-cli rc=0 5s total 336 pass 336 fail 0 skip 0
jini-cms rc=0 61s total 2435 pass 2435 fail 0 skip 0
jini-cms-forms rc=0 4s total 154 pass 154 fail 0 skip 0
jini-core rc=0 15s total 706 pass 706 fail 0 skip 0
jini-daemon rc=0 54s total 2535 pass 2535 fail 0 skip 0
jini-db rc=0 61s total 329 pass 329 fail 0 skip 0
jini-desktop-host rc=0 22s total 430 pass 430 fail 0 skip 0
jini-devops rc=0 11s total 321 pass 321 fail 0 skip 0
jini-diagnostics rc=0 6s total 381 pass 381 fail 0 skip 0
jini-http-kit rc=0 5s total 453 pass 453 fail 0 skip 0
jini-infra rc=1 4s total 42 pass 41 fail 1 skip 0
jini-integrations rc=0 10s total 843 pass 843 fail 0 skip 0
jini-mcp rc=0 11s total 842 pass 842 fail 0 skip 0
jini-memory rc=0 3s total 237 pass 237 fail 0 skip 0
jini-oauth rc=0 5s total 288 pass 288 fail 0 skip 0
jini-platform rc=0 23s total 1105 pass 1105 fail 0 skip 0
jini-plugins rc=0 16s total 358 pass 358 fail 0 skip 0
jini-protocol rc=0 2s total 34 pass 34 fail 0 skip 0
jini-registry rc=0 6s total 230 pass 230 fail 0 skip 0
jini-sandbox rc=0 5s total 103 pass 103 fail 0 skip 0
jini-server rc=1 37s total 345 pass 344 fail 1 skip 0
jini-sidecar rc=0 4s total 131 pass 131 fail 0 skip 0
jini-sqlite rc=1 19s total 8 pass 6 fail 2 skip 0
jini-ui-kit rc=0 5s total 69 pass 69 fail 0 skip 0
jini-ui rc=0 293s total 7170 pass 7170 fail 0 skip 0
jini-user-management rc=1 25s total 447 pass 441 fail 6 skip 0
jini-vibecoding rc=0 6s total 122 pass 122 fail 0 skip 0
jini-commerce-node rc=1 696s total 162 pass 162 fail 0 skip 0
jini-commerce-vitest rc=0 3s total 4 pass 4 fail 0 skip 0
jini-ex-minimal-host rc=0 89s total 3 pass 3 fail 0 skip 0
jini-ex-nlweb-demo rc=0 2s total 18 pass 18 fail 0 skip 0
jini-ex-reference-desktop rc=0 1s total 4 pass 4 fail 0 skip 0
jini-ex-reference-web rc=1 3s total 46 pass 45 fail 1 skip 0
jini-root-scripts rc=1 32s total 187 pass 187 fail 0 skip 0
tovu-admin-vitest rc=1 797s total 10618 pass 10540 fail 76 skip 2
tovu-web-assistant rc=1 491s total 2623 pass 2570 fail 51 skip 2
tovu-web-cli-contracts rc=1 1132s total 700 pass 678 fail 22 skip 0
tovu-web-features-am rc=1 926s total 3699 pass 3675 fail 21 skip 3
tovu-web-features-nz rc=1 895s total 5840 pass 5805 fail 33 skip 2
tovu-web-platform rc=1 721s total 1839 pass 1825 fail 12 skip 2
tovu-web-server-inbound rc=1 1151s total 2556 pass 2548 fail 8 skip 0
tovu-web-server-tests rc=1 1473s total 1830 pass 1805 fail 25 skip 0
tovu-web-server-runtime rc=1 476s total 660 pass 646 fail 13 skip 1
tovu-desktop-main rc=0 99s total 1408 pass 1404 fail 0 skip 4
tovu-desktop-renderer rc=0 56s total 513 pass 513 fail 0 skip 0
tovu-devtooling rc=1 316s total 602 pass 594 fail 8 skip 0
tovu-web-unrun rc=1 684s total 192 pass 182 fail 10 skip 0
tc-tovu-root rc=0 35s (no structured output; see log)
tc-tovu-scripts rc=0 16s (no structured output; see log)
tc-tovu-tests rc=0 42s (no structured output; see log)
tc-tovu-admin rc=0 30s (no structured output; see log)
tc-tovu-desktop rc=0 12s (no structured output; see log)
tc-tovu-site-chat rc=0 4s (no structured output; see log)
tc-jini rc=0 131s (no structured output; see log)
jini-root-scripts-node rc=1 15s total 9 pass 6 fail 3 skip 0
e2e-journeys-1 rc=142 3600s (no structured output; see log)
e2e-j1b rc=1 47s (no structured output; see log)
e2e-j2a rc=1 958s (no structured output; see log)
e2e-j2b rc=1 1127s (no structured output; see log)
e2e-j3a rc=1 612s (no structured output; see log)
e2e-j3b rc=0 466s (no structured output; see log)
e2e-visual-tablet-mobile rc=142 3600s (no structured output; see log)
e2e-mobile-visual rc=1 319s (no structured output; see log)
rerun-env-no-tsx-tsconfig rc=1 43s total 36 pass 33 fail 3 skip 0
rerun-flaky-node rc=1 34s total 113 pass 107 fail 6 skip 0
rerun-flaky-admin rc=1 14s total 28 pass 24 fail 4 skip 0
rerun-flaky-jini-commerce rc=142 180s total 51 pass 51 fail 0 skip 0
rerun-e2e-j1-fails rc=1 502s (no structured output; see log)
rerun-e2e-visual-media rc=1 284s (no structured output; see log)
```

E2E counts are in FAILURES.md (E2E section). Desktop journeys (playwright.desktop-journeys / desktop-shell, Electron) SKIPPED: they need fresh desktop+admin dev builds (rewrites bundles the owner's dev setup serves) and open Electron windows. Legacy development/e2e/pages-editor.spec.ts: no config matches *.spec.ts any more.
