# EXTRACT-X2 — full ordinary suites once, `cloud/extract-s10`

## Verdict

**Result: FAIL** (independent of the end marker). Every planned lane ran to completion: no cap was hit and no suite was dropped.

- **Tovu**: **no NEW failure** in any test lane. Website 34,555 pass / 35 fail (34 PRIOR, 1 FLAKY); admin 14,339 / 2 (1 PRIOR, 1 FLAKY); desktop 3,113 / 5 (all PRIOR). 148 of combine's 209 failing website rows now pass, mostly because Postgres and Chromium were available.
- **Jini**: **16 NEW failures**. 15 trace to extract-only commits whose tests were not updated. The 16th, J-13 (reference-web e2e), was absent from combine's run and is probably older (unconfirmed). The 15:
  - db isolation ×2 (`2364f89e`);
  - plugins-host raw error logging, through the http-kit redaction guard (extract-s6);
  - agent-plugins ×8 (`291a2200`/`dbe650df`), including a lifecycle import cycle and a **behavioural** commerce-manifest read;
  - OS-helper reach ×2 (`52365d5b`);
  - google-login guidance ×2.

  Also 4 PRIOR (chat ×1, infra-retirement ×3). `pnpm guard`: R10 PRIOR, R13 ENV.
- **Static**: Tovu lint has **1 NEW** error (an extraction shim). Architecture and boundaries fail as at combine, with extraction drift (+8 cross-feature edges, +2 exposed files, +3 cycle warnings). The test type-check has the same 10 errors as combine.

**Does anything NEW need fixing before merge? Yes.** The Jini reds J-2…J-12, J-14, J-15, J-19 and J-20 are caused by the extraction. J-12 (the commerce manifest loses its publisher and `provides`) and J-8…J-11 (the lifecycle import cycle) are real defects, not just stale pins.

Report only. Nothing in production code, tests, fixtures, guides, guard baselines or lockfiles was changed. The only commits are this report, its raw files under `cloud/reports/raw/extract-x2/`, and one Jini changeset (§9).

## Tips tested

| | Tovu | Jini |
| --- | --- | --- |
| Tested (brief) | `bd96a31a3` (cloud/extract-s10) | `de19462cf` (cloud/extract-s10); `6c7a7857` adds only the X2 changeset file and was committed while the lanes ran |
| TAP/log baseline ("combine") | release-check's committed run of `f4b2d1531` | release-check's committed run of `60807a9ca` |
| Combine-pair worktrees used for the lanes release-check did not run | `7cf9658e5` (origin/cloud/combine now, 20 commits past `f4b2d1531`) | `e1b1bdbd6` (8 commits past `60807a9ca`) |

Neither release-check commit is an ancestor of extract-s10 (merge-base Tovu `b45d2ee75`, Jini `32e9c9c21`). The current combine tip is the X1 report's own combine baseline pair. The worktrees were `git worktree add --detach` checkouts at `/home/user/cmb/{Jini,Tovu}`, with Jini's root `node_modules` symlinked in and no per-package install. A worktree result is used only where it is clean (see §4).

Environment: 4 cores, 16 GB, no swap, no IPv6, running as root. Node 24.22.2 from the nodejs.org tarball; pnpm 10.33.2 through corepack (the repo pin). Tovu ran with Jini **linked** (`JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`, 79 links). `@tovu/sdk` was built first. Run window: 2026-11-09 23:50Z to 2026-11-10 ~02:0xZ (see §10).

### Environment noise reduced (within the 5-minute budget)

- **PostgreSQL 16** (`apt-get install -y postgresql`, after an `apt-get update`; the first attempt without it found no package). The cluster listens on `/var/run/postgresql`, `/tmp` and `127.0.0.1`, with trust auth and roles `root` and `la` (the fixture default in `@jini-ai/db` pg-fixture). Jini commerce got `COMMERCE_PG_URL=postgres://la@127.0.0.1/commerce_test`, so its Postgres ledger suite **ran**; it was skipped at combine.
- **Chromium**: `npx playwright install chromium-headless-shell` was **blocked** by the network policy: `cdn.playwright.dev` returned 403. The image already holds `/opt/pw-browsers/chromium_headless_shell-1243`. A symlink `chromium_headless_shell-1228 → …-1243` lets Tovu's Playwright 1.61.1 launch it; the probe printed `ok x 153.0.8010.12` (`raw/…/tovu-chromium-probe.txt`). Browser cases therefore ran on a **newer headless-shell build than Playwright pins**. That is disclosed here and is the only browser caveat.
- Jini `examples/reference-web` e2e imports `playwright`, which the Jini workspace does not install. After its first run failed with `ERR_MODULE_NOT_FOUND`, `/home/user/Jini/node_modules/playwright` was symlinked to Tovu's installed copy (gitignored; environment only) and the 3 cases were rerun (§3).

## 1. Inventory (taken before running, so no suite is silently dropped)

| repo | suite source | what ran | notes |
| --- | --- | --- | --- |
| Jini | 40 `packages/*/package.json` `test` scripts (all `vitest run`; commerce is compound; search already caps its workers) | all 40, in lanes J1 (19) and J2 (21), the same split as release-check | commerce expanded into its 3 constituents: `node --import tsx --test src/catalog/__tests__/unit/*.unit.test.ts`, `vitest run`, `vitest run -c vitest.kernel.config.ts`; **every** Vitest call capped `--maxWorkers=2 --minWorkers=1` |
| Jini | `examples/*` with a `test` script: minimal-host, neutral-host, nlweb-demo, reference-desktop, reference-web (`vitest run src && node --test e2e/*.test.mjs`) | all 5, lane EX | cookie-consent-standalone and sample-projects have no test script; **release-check did not run examples** |
| Jini | root `test:scripts` = `vitest run scripts/__tests__` + `test:scripts:node` (3 explicit files) | both | **not run by release-check** |
| Jini | root `test:agent-plugins:content` (`node --test "packages/agent-plugins/**/__tests__/*.test.mjs"`) | yes | **not run by release-check**; node:test, run under node, not Vitest |
| Jini | `test:plugins:artifacts` | covered: it is one file of provider-plugins' own vitest run | — |
| Tovu | root `npm test` globs (website, content agent-plugins + overlays `.test.mjs`, `packages/*/src` = contracts + sdk, site-chat, development/scripts, eslint-rules) | **3,119 files** (combine: 3,067), 8 round-robin shards of 389–390, at most 3 at a time; the named command plus `--test-concurrency=1 --test-timeout=300000`, TAP + spec reporters | site-chat's own `test` script is a subset of these globs |
| Tovu | `apps/admin` `test` = `vitest run` (Vitest 4) | `vitest run --maxWorkers=2`, 883 files | no bridge or wrapper |
| Tovu | `apps/desktop` `test` (two node:test commands; `pretest` = `build:preload`) | `build:preload`, then both commands with `--test-concurrency=2` (same as release-check) | — |
| Tovu | Playwright journeys (`e2e:*`), soak/visual, `test:cov*` | **not run** (out of scope: no live-service campaign; same as release-check) | — |

Existing native skips are disclosed in the lane tables; none were added. The website shard lists are committed as `raw/extract-x2/shards/shard<N>.txt`.

## 2. Lane table

| # | lane | command (capped) | pass | fail | skip/todo | exit | secs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Jini J1 (19 pkgs) | per pkg `vitest run --maxWorkers=2 --minWorkers=1` (commerce: 3 parts) | 23,012 | 0 | 2 | all 0 | 747 |
| 2 | Jini J2 (21 pkgs) | same | 30,256 | **12** (chat 1, db 2, http-kit 1, agent-plugins 8) | 13 | 4 pkgs exit 1 | 1,370 |
| 3 | Jini examples (5) | same; reference-web adds `node --test e2e/*.test.mjs` | 145 vitest + 2 e2e | **1** e2e (after env fix; 3 before) | 13 todo | reference-web 1 | 145 |
| 4 | Jini `test:scripts` (vitest) | `vitest run scripts/__tests__ --maxWorkers=2 --minWorkers=1` | 800 | **2** | 32 | 1 | 98 |
| 5 | Jini `test:scripts:node` | as scripted | 7 | **3** | 0 | 1 | 24 |
| 6 | Jini `test:agent-plugins:content` | as scripted | 1,404 | **2** | 0 | 1 | 47 |
| 7 | Tovu admin vitest | `vitest run --maxWorkers=2` (883 files) | 14,339 | **2** | 2 | 1 | 1,383 |
| 8 | Tovu desktop `build:preload` | — | ok | — | — | 0 | ~1 |
| 9 | Tovu desktop main | `--test-concurrency=2` | 2,208 | **4** | 10 | 1 | 112 |
| 10 | Tovu desktop renderer + contracts | `--test-concurrency=2` | 905 | **1** | 0 | 1 | 127 |
| 11–18 | Tovu website, 8 shards (3 lanes) | named command + `--test-concurrency=1 --test-timeout=300000`, TAP | 34,555 | **35** | 36 | all 1 | 16,794 (sum) |
| 19 | static gates (Jini guard, guard:drift, guard:plugins, typecheck; Tovu typecheck ×3, lint, architecture, boundaries) | see §5 | — | — | — | — | ~10 min |

## 3. Every failure — Jini (lanes 1–6)

Baseline: release-check's `jini-test-<pkg>.txt` for the 40 packages. For lanes 4–6 and examples, which release-check never ran, the comparison is a rerun on the combine-pair worktree (`raw/extract-x2/combine-*.txt`).

| # | file › test | first failing assertion | class | evidence / likely cause |
| --- | --- | --- | --- | --- |
| J-1 | `packages/chat/src/react/features/chat-pane/__tests__/hooks/useChatPaneAgentControl.test.tsx` › chat.send_message goes through the pane guard › refuses to send while a run is streaming, with a reason instead of a silent bypass | `expected [Function] to throw error matching /streaming/ but got 'cannot send: A reply is still running…'` | **PRIOR** | identical title and assertion in release-check `jini-test-chat.txt` |
| J-2 | `packages/db/src/__tests__/import-isolation.test.ts` › database import isolation › scans every production TypeScript file and confines optional dependencies | `expected [ …(4) ] to deeply equal []`: `src/data-modules/{data-module,migration-journal,plugin-identity,plugin-store}.ts: kysely outside kernel/migrate` | **NEW** | passed at combine (db 735/735). Extract-only commit `2364f89e` "feat(db): expose portable plugin data-module engine" added `src/data-modules/*` importing `kysely`; the test's allowlist (line 19: only `kernel/`, `migrate/`, `secrets-vault/repo.sql.ts`) was not updated |
| J-3 | `packages/db/src/__tests__/loads-without-driver.test.ts` › @jini-ai/db in an install with no database driver present › exports exactly the subpaths under test (no root barrel that would load everything) | `expected [ 'core', 'data-modules', …(17) ] to deeply equal [ 'core', 'kernel', …(16) ]` | **NEW** | passed at combine. Same commit `2364f89e` adds the `./data-modules` export to `packages/db/package.json`; the test's pinned subpath list lacks it, so its driver-free load is not proven |
| J-4 | `packages/http-kit/src/__tests__/http-error-log-redaction.test.ts` › HTTP exception logging class guard › requires shared redaction for caught errors across the remaining packages | `expected [ …(9) ] to deeply equal []`: 9 raw `console.warn(… error …)` in `packages/plugins/src/host/capability-tools.ts` (1), `host/node/runtime-core.ts` (6), `host/tools/management.ts` (2) | **NEW** | passed at combine (579/579). All three files are absent on combine; extract-only commits `152c4551`, `0f76f157`, `39326471` (extract-s6 L1b/L1c) moved plugin-runtime code into `@jini-ai/plugins/host` without the shared redaction helper |
| J-5 | `packages/agent-plugins/src/__tests__/integration-contract.test.ts` › identity namespace injection preserves the legacy plugin format and selects host metadata | `toMatchObject` fails: `warnings` gains "Legacy extensions.tovu agent-plugin metadata is deprecated; compatibility is retained through at least 2027-05-06…" | **NEW** | test file unchanged since combine and passed there. Extract-only `291a2200` "make bundled agent plugin metadata portable" (+ `dbe650df`) adds the deprecation warning |
| J-6 | `packages/agent-plugins/src/__tests__/manifest.test.ts` › ui-ux-design plugin › has a plugin.json that validates as a PluginManifest | `expected '0.6.3' to be '0.6.2'` | **NEW** | same commits bump bundled `plugin.json` versions; pinned version not updated |
| J-7 | same file › slide-design plugin › has a plugin.json the strict parser accepts, with its publisher id and capability | `toMatchObject`: `"version": "0.1.0"` expected, `"0.1.1"` received | **NEW** | same |
| J-8 | `packages/agent-plugins/src/lifecycle/__tests__/type-cycles.test.ts` › shared contracts have no implementation import cycles › keeps lifecycle ports acyclic | `expected [ …(7) ] to deeply equal []`: cycle `lifecycle/ports.ts → manifest.ts → credential-card-metadata.ts → contribution-loader.ts → trusted-plugin-files.ts → activation.ts → ports.ts` | **NEW** | `291a2200` added `export * from './credential-card-metadata.js'` to `lifecycle/manifest.ts` (`git log -S`), which closes the cycle |
| J-9 | same file › installed package read ownership › installed-package-index.ts reaches no installation or removal module | same 7-file cycle | **NEW** | same cause |
| J-10 | same file › installed package read ownership › resolve-agent-plugin-refs.ts reaches no installation or removal module | same | **NEW** | same cause |
| J-11 | same file › installed package read ownership › install.ts stays acyclic while reusing uninstall removal | same | **NEW** | same cause |
| J-12 | `packages/agent-plugins/src/lifecycle/__tests__/unit/commerce-manifest.unit.test.ts` › validates the packaged commerce manifest without claiming a payment provider | `toMatchObject`: `id` `"jini/commerce"` expected, `"unknown/commerce"` received; `provides` `["commerce"]` expected, `[]` received | **NEW** | passed at combine. The commerce `plugin.json` metadata moved to the portable namespace in `291a2200`/`dbe650df`, and the parser path this test uses no longer finds publisher or `provides`. **Behavioural**, not just pinned text |
| J-13 | `examples/reference-web/e2e/composer-hit-targets.test.mjs` › Send and Stop receive real coordinate clicks beside the effort selector at 320px dock width | `locator.waitFor: strict mode violation: getByRole('button', { name: 'Send', exact: true }) resolved to 2 elements` | **NEW** (absent at combine) | release-check did not run examples. No file under `examples/reference-web/` or `packages/chat/src/` changed since combine, so it is likely older, but that is **unconfirmed**: the combine worktree has no per-package install to run it |
| J-14 | `scripts/__tests__/coupling-isolation.test.ts` › platform OS helper import isolation › process reaches only its existing OS owners | `expected [ …(21) ] to deeply equal [ …(20) ]`: extra `packages/core/src/text/descriptor-i18n.ts` | **NEW** | the same file passes 21/21 on the combine worktree (`combine-jini-test-root-scripts-coupling.txt`). `descriptor-i18n.ts` was added by extract-only `52365d5b` and is missing from the test's explicit `text` owner list |
| J-15 | same file › proxy-env reaches only its existing OS owners | `expected [ …(8) ] to deeply equal [ …(7) ]`, same extra file | **NEW** | same |
| J-16 | `scripts/__tests__/integration/infra-retirement.integration.test.ts` › Tovu consumers have no imports or re-exports of the retired package | `Retirement requires every consumer import to move first` (Tovu `contracts/core/events/*` import `@jini-ai/infra/events/outbox`) | **PRIOR** | fails identically on the combine pair (`combine-jini-test-root-scripts-node.txt`, paths under the combine Tovu worktree) |
| J-17 | same file › Tovu consumer manifests have no dependency on the retired package | `Retirement requires every consumer dependency to move first` (`package.json` dependencies) | **PRIOR** | same |
| J-18 | same file › j05 final state removes the infra workspace, including stale generated leftovers | `Retirement is incomplete: retain infra until its release gate and outbox ownership are resolved` | **PRIOR** | same |
| J-19 | `packages/agent-plugins/google-login/__tests__/setup-guidance.test.mjs` › Supabase instructions use its displayed callback and human-only secret entry | `did not match /card is unnecessary unless this site also uses Tovu members/` (text now says "site members") | **NEW** | passes on the combine worktree run. `google-login` guidance de-branded in extract-only `291a2200` (only commit touching that plugin since combine); test not updated |
| J-20 | same suite › Tovu guidance preserves configured base paths, requires first-link proof and explains unlink | `did not match /const callback = new URL\(configuredSiteAddress\)/` | **NEW** | passes on combine; same de-branding of the google-login guidance |

Fixed since combine (passing now): `platform` source-boundaries (`fetch-with-timeout` fixture), and `agent-plugins` load-supporting-files `already-loaded`. Reruns: agent-plugins' 4 failing files were rerun alone and failed the same 8 tests (`raw/…/jini-rerun-agent-plugins.txt`), so they are **not FLAKY**.

Jini skips (all native): 2 sidecar `skipIf(isRoot)` in J1; 13 in J2 (chat 1, platform, daemon, agent-runtime, desktop-host, server, agent-plugins 2 …, the same set as combine minus commerce Postgres, which **ran**); 13 `todo` in neutral-host; 32 skips in root `scripts/__tests__`.

## 4. Every failure — Tovu admin and desktop

| # | file › test | first failing assertion | class | evidence |
| --- | --- | --- | --- | --- |
| A-1 | `apps/admin/src/__tests__/unit/chat-fab-z-order-css.unit.test.ts` › chat FAB z-order › sits above every in-page layer; only blocking modals and their popovers go higher | `expected [ Array(1) ] to deeply equal []` (`admin-failure-notice.css .admin-failure-notice z-index: 1000`) | **PRIOR** | identical in release-check `tovu-admin-vitest.txt` |
| A-2 | `apps/admin/src/features/pages/__tests__/use-theme-canvas-styling.unit.test.ts` › useThemeCanvasStyling — bounded pending state (Bug B, Slice B2) › resolves to no canvas styling after the 8s timeout when the token fetch never settles | `expected { status: 'ready', styling: {} } to deeply equal { status: 'pending' }` | **FLAKY** | passed at combine; rerun alone twice: 44/44 pass both times (`raw/…/tovu-admin-rerun-theme-canvas-{1,2}.txt`). A timing assertion that failed under a full-machine load; `apps/admin/src/features/pages` is unchanged since combine |
| D-1 | `apps/desktop/src/main-agent-runtime-wiring.test.ts` › quit waits for owned runtime disposal even without sites and disposes once across repeated quits | `ReferenceError: stopRunningImports is not defined` | **PRIOR** | same title and error in release-check part 1 |
| D-2 | `apps/desktop/src/main-shutdown-wiring.test.ts` › before-quit waits on in-flight teardowns, not only on openSites | same | **PRIOR** | same |
| D-3 | same file › Quit during a card Stop waits for its tracked teardown after openSites becomes empty | same | **PRIOR** | same |
| D-4 | `apps/desktop/src/runner-ipc-stubs.test.ts` › every channel the contracts declare has a stub or a real handler | `Expected values to be strictly deep-equal`: missing `runner:sites:import-archive`, `runner:sites:cancel-import` | **PRIOR** | same |
| D-5 | `apps/desktop/src/renderer/sites-home-view.test.ts` › an open tab on Projects shows that site's workspace, in tab order | strict deep-equal, extra `showImportPage: false` | **PRIOR** | same |

Fixed by the environment: the two `websites-width.test.ts` browser cases (ENV at combine) **pass** with Chromium. Desktop main ran 2,222 tests against combine's 2,230 (8 fewer); per-test diffing of desktop main was not done.

## 5. Static gates

| gate | exit | result | vs combine |
| --- | --- | --- | --- |
| Jini `pnpm guard` | 1 | 2 violations: **R10** `ChatPane.tsx` imports `Icon` not in the public barrel; **R13** `defs/claude.ts` fallbackModels missing `claude-fable-5-2` | R10 **PRIOR** (identical text). R13 **ENV**: MF3 compares the defs to the *live picker cache of the Claude CLI installed in this container* (17 live ids here, 16 in release-check's container); no repo input changed |
| Jini `pnpm guard:drift` | 1 | the same 2, "not covered by guard-baseline.json"; HW1–HW9 0 new | same classes as above. A combine-worktree run is degraded (no per-package installs: 14 load errors) and is **not** used as evidence |
| Jini `pnpm guard:plugins` | 0 | packages + agent-plugin content checks pass | not run at combine |
| Jini typecheck (every package's `typecheck` + `tsc -p scripts/tsconfig.json`) | 0 / 0 | clean | same as combine |
| Tovu typecheck root / e2e | 0 / 0 | clean with Jini linked | same |
| Tovu `typecheck:tests` (6 GB heap) | 2 | 10 errors | **PRIOR**: the same 10 `file(line,col)` locations as combine, none new |
| Tovu lint (`biome lint . --max-diagnostics=none --diagnostic-level=error`) | 1 | **601** errors (combine 607) | 6 gone. **1 NEW**: `apps/website/src/features/plugins/migration-recovery.ts:5` `lint/correctness/noVoidTypeReturn` (`restoreSqliteSnapshots(): void { return restore(…) }`), from extract-only `721bce46` "consume Jini data modules through compatibility shims". `raw/…/tovu-static-lint-new-vs-combine.txt` |
| Tovu `check:architecture` (blocking in CI) | 1 | the same 4 hard metrics regressed vs the committed baseline: back-edges 0→5; API surface 821→**870** (combine 868); module cycles: the same 3 new pairs and largest SCC 22→61 | **PRIOR** gate failure. Drift since combine: **8 new cross-feature edges**, 17 removed (`tovu-static-arch-new-edges-vs-combine.txt`: api-connections→agent-plugins/custom-credentials, custom-credentials→source-control/project-keys/vendor-credentials, deploy-ops→webhooks, deploy-targets→form-destinations), API surface +2, hubs 372→376 |
| Tovu `check:boundaries` (report-only in CI) | 15 | 15 errors, 86 warnings | errors **PRIOR** (the same 15 lines). Warnings +3 (83→86): new `no-circular` from `api-connections/host-bindings.ts`, `surface-connection-bindings.ts`, `plugin-runtime/*-tool-binding.ts`, `source-control/provider-registry.ts`, and one deep import `agent-plugins/executable-tools/host-bindings.ts → contracts/headless/…` (`tovu-static-boundaries-diff-vs-combine.txt`) |

## 6. Every failure — Tovu website node:test (lanes 11–18)

| shard | files | pass | fail | skip | cancelled | exit | secs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 390 | 4,127 | 1 | 5 | 0 | 1 | 2,282 |
| 2 | 390 | 4,323 | 4 | 5 | 0 | 1 | 2,249 |
| 3 | 390 | 5,410 | 8 | 4 | 0 | 1 | 2,593 |
| 4 | 390 | 3,857 | 1 | 2 | 0 | 1 | 2,387 |
| 5 | 390 | 4,369 | 4 | 1 | 0 | 1 | 1,950 |
| 6 | 390 | 4,154 | 2 | 6 | 0 | 1 | 1,926 |
| 7 | 390 | 4,162 | 12 | 6 | 0 | 1 | 1,697 |
| 8 | 389 | 4,153 | 3 | 7 | 0 | 1 | 1,710 |
| **total** | **3,119** | **34,555** | **35** | **36** | **0** | | 16,794 |

At combine the totals were 34,203 pass, 188 fail and 19 cancelled. Classification was done by script: every `not ok` in this run's TAP, keyed by `location` file and exact title, was matched against release-check's eight committed combine TAPs. PRIOR rows then had their whole assertion block (the `error:` and `+`/`-` diff lines) compared with combine's (`raw/extract-x2/prior-assertion-compare-all.txt`). No timeout fired: every shard exited 1 from test failures, none with 124.

| # | shard | file › test | first failing assertion | class | first assertion vs combine |
| --- | --- | --- | --- | --- | --- |
| W-1 | shard1 | `apps/website/src/server/__tests__/routes/forms-submit.test.ts` › POST /forms/:slug/submit: AC-13 — a honeypot-tripped request returns the identical 201 accepted response | Missing expected rejection (FormRateLimitExceededError). | **PRIOR** | same assertion block |
| W-2 | shard2 | `apps/website/src/server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts` › ../../../inbound/assistant/agent-daemon-server.ts: desktop accepts a loopback OAuth callback; hosted requires HTTPS | ../../../inbound/assistant/agent-daemon-server.ts must have one OAuth ports call | **PRIOR** | same assertion block |
| W-3 | shard2 | `apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts` › createSiteApp() on a SQLite composition adds no second copy of the serving app's event handlers | sanity: forms analytics, forms notify and webhook fan-out each subscribe once | **PRIOR** | same assertion block |
| W-4 | shard2 | `apps/website/src/server/runtime/composition/modules/__tests__/assistant-daemon-client.unit.test.ts` › a refused parked mutation waits for replacement and is dispatched once | agent daemon origin requested before ensure() resolved a self-allocated port — call ensure() before createApp() | **PRIOR** | same assertion block |
| W-5 | shard2 | `apps/website/src/server/runtime/composition/modules/__tests__/assistant-daemon-client.unit.test.ts` › a passive frontend stream cannot wake a daemon racing park | agent daemon origin requested before ensure() resolved a self-allocated port — call ensure() before createApp() | **PRIOR** | same assertion block |
| W-6 | shard3 | `apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` › handlebars-worker.ts source graph contains no @jini-ai package roots, including deferred imports | handlebars-worker.ts names @jini-ai root barrels; use narrow export subpaths: | **PRIOR** | same assertion block |
| W-7 | shard3 | `apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` › handlebars-worker.ts loads no database, blob-store or agent packages | handlebars-worker.ts loaded @jini-ai root barrels; use narrow export subpaths: | **PRIOR** | same assertion block |
| W-8 | shard3 | `apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` › liquid-worker.ts source graph contains no @jini-ai package roots, including deferred imports | liquid-worker.ts names @jini-ai root barrels; use narrow export subpaths: | **PRIOR** | same assertion block |
| W-9 | shard3 | `apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` › liquid-worker.ts loads no database, blob-store or agent packages | liquid-worker.ts loaded @jini-ai root barrels; use narrow export subpaths: | **PRIOR** | same assertion block |
| W-10 | shard3 | `apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec.integration.test.ts` › a committed write whose response is dropped is OUTCOME UNKNOWN, ran once, and blocks a blind repeat | The validation function is expected to return "true". Received false | **PRIOR** | same assertion block |
| W-11 | shard3 | `development/scripts/__tests__/bundled-agent-plugin-selection.test.ts` › the composed bundled id set is pinned, and no id ships from both content and a package | Expected values to be strictly deep-equal: | **PRIOR** | same assertion block |
| W-12 | shard3 | `development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts` › web dev CLI attaches to the selected running site and opens its admin URL | node:internal/modules/esm/resolve:272 | **PRIOR** | same assertion block |
| W-13 | shard3 | `development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts` › desktop dev CLI builds preload before watching and forwards Electron flags on normal exit | node:internal/modules/esm/resolve:272 | **PRIOR** | same assertion block |
| W-14 | shard4 | `apps/website/src/server/runtime/composition/modules/__tests__/agent-daemon-core-rpc.integration.test.ts` › an accepted memory-mode answer reaches CLI launch through the site's attempt authority | Expected values to be strictly equal: | **PRIOR** | same assertion block |
| W-15 | shard5 | `apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` › every surfaceExchanges.open(...) call names a toolId constant this scan can resolve | Expected values to be strictly deep-equal: | **PRIOR** | same assertion block |
| W-16 | shard5 | `apps/website/src/features/api-connections/__tests__/vendor-neutrality.test.ts` › no generic seam file names the first provider | Expected values to be strictly deep-equal: | **PRIOR** | same assertion block |
| W-17 | shard5 | `apps/website/src/platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts` › no new raw SQLite outside the storage kernel (ratchet: the baseline only shrinks) | New raw SQLite outside platform/db/kernel. Use the storage kernel (run/transaction + Drizzle, dialect.ts helpers) instead. | **PRIOR** | same assertion block |
| W-18 | shard5 | `apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts` › a project store that can't open (EACCES on its folder): the site boots, warns, and a settings save is refused, never sent to the site vault | (testCodeFailure) | **PRIOR** | same assertion block |
| W-19 | shard6 | `apps/website/src/server/runtime/composition/__tests__/storage-secret.unit.test.ts` › new-site sealing prepares its identified key file and the default reader reopens it | /home/user/Tovu/apps/website/src/features/webhooks/keyring.env.ts:149 | **PRIOR** | same assertion block |
| W-20 | shard6 | `apps/website/src/server/runtime/composition/modules/__tests__/route-modules.unit.test.ts` › module 'forms-admin': registers exactly its routes, in order, and nothing else | Expected values to be strictly deep-equal: | **PRIOR** | same assertion block |
| W-21 | shard7 | `apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts` › tovu introspect: exits 0 and prints valid JSON describing init/serve/export — matches the live CLI, not a hand-maintained doc | introspect must list the real registered commands (nested subcommands flattened to their full invocation path), and exclude itself/help | **PRIOR** | same assertion block |
| W-22 | shard7 | `apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts` › tovu introspect --format mcp: exits 0 and prints valid MCP tool definitions | Expected values to be strictly deep-equal: | **PRIOR** | same assertion block |
| W-23 | shard7 | `apps/website/src/features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts` › real core tree has only reviewed pattern exceptions, each with its exact current total | Vendor knowledge belongs in its plugin. Uncovered file/vendor/count pairs: | **PRIOR** | **differs** |
| W-24 | shard7 | `apps/website/src/features/theme/__tests__/preview-switcher.integration.test.ts` › live server chooses per request; cookie persists, reset clears, canonical and no-store hold; disabled is inert | Expected values to be strictly equal: | **FLAKY** | FLAKY |
| W-25 | shard7 | `apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts` › boot redemption rejects a missing owner before minting a session | Expected values to be partially and strictly deep-equal: | **PRIOR** | same assertion block |
| W-26 | shard7 | `apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts` › boot redemption rejects a disabled owner before minting a session | Expected values to be partially and strictly deep-equal: | **PRIOR** | same assertion block |
| W-27 | shard7 | `apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts` › boot redemption rejects a member owner before minting a session | Expected values to be partially and strictly deep-equal: | **PRIOR** | same assertion block |
| W-28 | shard7 | `apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts` › boot redemption refuses a minted session that Jini cannot validate before setting a cookie | Expected values to be partially and strictly deep-equal: | **PRIOR** | same assertion block |
| W-29 | shard7 | `apps/website/src/server/inbound/assistant/__tests__/integration/component-catalog-routes.integration.test.ts` › the real daemon answers component-catalog search, describe, and a 404 over real HTTP | expected the daemon to start listening, but it exited: | **PRIOR** | same assertion block |
| W-30 | shard7 | `apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts` › AC-12 (REQ-07, T-W3): with the definition registered and the pin held open, a pre-existing site renders Tovu Demo Site, never its display na | Express request did not finish | **PRIOR** | same assertion block |
| W-31 | shard7 | `apps/website/src/server/runtime/composition/__tests__/app-federation-reload.observability.test.ts` › a roster change after createApp traces the agent daemon's federation reload with RouteDeps.observability | Expected values to be strictly deep-equal: | **PRIOR** | same assertion block |
| W-32 | shard7 | `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts` › SDK external type contracts are declared package dependencies for standalone consumers | Expected values to be strictly equal: | **PRIOR** | same assertion block |
| W-33 | shard8 | `development/scripts/__tests__/check-idle-motion.test.ts` › the live tree has no idle-CPU offenders and no stale allowlist entries | Expected values to be strictly deep-equal: | **PRIOR** | **differs** |
| W-34 | shard8 | `development/scripts/__tests__/dead-path-sweep.test.ts` › dead-path sweep: no path reference outside the known-broken register resolves to nothing | a path reference under development/scripts or the db tooling points at a file that does not exist | **PRIOR** | same assertion block |
| W-35 | shard8 | `development/scripts/__tests__/dead-path-sweep.test.ts` › generated coverage artifacts are not reported as dead paths | "development/coverage/lcov.unit.info's parent directory should exist" | **PRIOR** | same assertion block |

Notes on the rows:
- **W-24 FLAKY**: it passed at combine (release-check shard 8, `ok 2038`), failed here with `81 !== 69` (`settingsRepo.maxRevisionSeq()` at test line 148, under 3-lane load), and passed **9/9 in both solo reruns** (`raw/…/tovu-web-rerun-preview-switcher-{1,2}.txt`). `apps/website/src/features/theme` is unchanged since combine.
- The two PRIOR rows whose assertion block **differs** are both ratchet gates whose offender set moved slightly:
  - `no-vendor-in-core`: one combine offender is gone (`assistant-tool-exec.ts: anthropic 1`), and none is new.
  - `check-idle-motion`: the same bare `setInterval(` in `apps/desktop/src/main/index.ts`, now at line 979 instead of 994.
  Every other PRIOR row has the **same assertion block** as combine.
- Rows that were **environment-unclear at combine** and are now PRIOR on exact title and assertion: dev-auth-boot-owner ×4, assistant-daemon-client ×2, component-catalog-routes, agent-daemon-core-rpc, app-federation-reload, sqlite-create-site-app-module-identity, storage-secret, deps-provider-plugin-boot (EACCES; probably root), forms-submit AC-13, site-title-preservation AC-12. `dead-path-sweep` ×2 (missing generated `development/coverage/`) was ENV at combine and is PRIOR here by title.
- **Combine failures that no longer fail**: of combine's 209 failing rows, 148 now pass by exact title. That includes every Postgres-backed case and every Chromium case (both available now), the api-connections `Invalid URL` family (15), webhook-delivery-worker shutdown, bundled-automatic-relevance ×5, assistant-byok ×2, agent-daemon-site-tools and process-root-parity. 27 have no row now: these are file-level wrappers that only appear on failure (for example serve-export-teardown's `SIGTRAP`, which is gone) and two vertical-slice titles that do not appear now. The per-row list is in `raw/extract-x2/combine-web-failures-now.txt`.

## 7. E1–E6 from the source suites (distinct from X1)

X1 (`cloud/reports/extract-s10.md`) proved E1–E6 on **packed tarballs**. X2 re-ran nothing from X1: no packaged app, no tarballs, no live services, no X3. The table below says only what the **ordinary source suites** in this run show for each item.

| item | source-suite evidence in X2 | X2 status |
| --- | --- | --- |
| E1 contribution kinds/modules | Jini `server` (contribution contracts, neutral host harness, cost counters) all pass; `cookie-consent` contribution-file tests pass; agent-plugins manifest/metadata tests **fail** (J-5…J-7, J-12: deprecation warning, version pins, commerce manifest read as `unknown/commerce` with no `provides`) | **FAIL**: J-12 is behavioural |
| E2 neutral public-contract runtime coverage | `examples/neutral-host` 66 pass / 13 todo (15 files), `examples/minimal-host` 3/3, nlweb-demo 18/18, reference-desktop 4/4, reference-web vitest 54/54 | PASS for what these suites cover; the 13 `todo` entries are uncovered contracts by the suite's own declaration |
| E3 thin adapters / exceptions | Tovu compatibility shims type-check clean (root, e2e). One NEW lint error in the shim `features/plugins/migration-recovery.ts` (void function returns a value) | PASS with one lint finding (lint does not block CI) |
| E4 byte equality / frozen tests / metadata / no migrations | Frozen pins **broke**: bundled `plugin.json` versions (J-6, J-7) and the db subpath list (J-3). No migration-related test failed (Postgres and SQLite migration suites ran green, including commerce's Postgres ledger, and Tovu's Postgres paths, which failed for ENV at combine) | **FAIL**: frozen pins drifted without updates |
| E5 guard / layer / isolation findings and baselines | guard R10 PRIOR, R13 ENV; NEW isolation reds J-2, J-3 (db), J-4 (redaction), J-8…J-11 (lifecycle import cycle), J-14, J-15 (OS-helper reach); Tovu architecture drift (+8 cross-feature edges, API surface +2) and boundaries (+3 cycle warnings) on top of the PRIOR gate failures. No baseline was edited | **FAIL** |
| E6 tarballs / plain Node / strict emitted-type consumer | not in X2's scope (source suites only); X1 covered it on packed installs | not re-proven here |

Old/new/old saved replay, cost counters and disk growth were X1's subject and were not re-run. This run's own cost: the 3,119-file website suite took 16,794 s of shard time (3 lanes; about 108 min wall); Jini lanes 2,384 s; admin 1,383 s. The disk used was the two checkouts and their installs; nothing else was retained outside the repos.

## 8. What could not run and why

- **Browser cases** ran on headless shell 1243 aliased as 1228 (the download host is blocked); any browser difference between those builds is untested.
- **Jini reference-web e2e** needed `playwright` to be resolvable from the Jini workspace (an environment symlink); the first run's 3 failures were `ERR_MODULE_NOT_FOUND` (ENV), and after the symlink 2 pass and J-13 fails.
- **Combine comparisons for lanes release-check never ran** used combine-pair worktrees without per-package installs. They were clean for the root scripts (coupling-isolation, infra-retirement) and the agent-plugins content tests whose titles are cited. The same worktree's `guard:drift` and 31 file-level content-suite failures there are install artefacts and are not used. J-13 could not be compared.
- **Running as root**: chmod/EACCES cases self-skip; W-row `deps-provider-plugin-boot` EACCES is PRIOR and probably root-caused.
- **Not run (out of scope, as in release-check)**: Playwright journeys, soak/visual, `test:cov*`, the other `check:*` scripts, admin type-check, Tovu `build` (blocked while linked), and anything packaged or live (X1/X3).
- **Per-test diff of desktop main** (2,222 tests vs 2,230 at combine) not done.
- **Test pollution**: the website run left untracked `chat.db` (repo root) and `sites/tovu-dev/.form-files-protected-v1` in the Tovu checkout, the same pollution release-check saw. They were not committed.

## 9. Jini changeset

`.changeset/extract-x2-cookie-consent-contribution-file.md` (Jini `6c7a7857` on cloud/extract-s10): `"@jini-ai/cookie-consent": patch`. Every published package changed on extract-s10 since the combine merge-base has a changeset except `cookie-consent`, whose public `./plugins` entry gained `parseConsentContributions`, `consentBridgeContribution` and `declaredScriptsContribution` in `d611333f`. (`server` changed too, but only an unexported `src/lifecycle` copy was deleted, so it needs no changeset.) No version bump, and no lockfile or dependency edit.

## 10. Run record

- Setup started 23:50Z (Node 24 tarball, Postgres, Jini `pnpm install` + `pnpm --no-bail -r build` exit 0, Tovu `npm ci` ×4 exit 0, sdk build, link). Lanes ran from 23:54Z; the last website shard ended 01:40:55Z. Total wall time was well under the 2.5 h cap; no cap was hit.
- Concurrency: at most 3 website shards at once; one fourth lane (Jini J1→J2→examples→root scripts→admin→desktop); static gates at `nice 10`. Every Vitest call was capped as stated in §1. No recursive runner multiplied the cap: no lane ran `pnpm -r test`.
- Reruns, all reported above: agent-plugins' 4 failing files (deterministic); admin theme-canvas ×2 (FLAKY); website preview-switcher ×2 (FLAKY); reference-web e2e after the Playwright symlink (ENV → 1 NEW).
- Raw output: `cloud/reports/raw/extract-x2/`. `*-summary.txt` hold each lane's exit and time; `tovu-web-shard<N>.tap.txt` hold the TAP (SHA-256 in `sha256-tap.txt`); `cls-shard<N>.txt` hold the classifier output; `jini-failing-tests.txt` and `tovu-admin-failing-tests.txt` hold the failures extracted from the Vitest JSON; `combine-*.txt` hold the combine-worktree reruns; `shards/` holds the file lists.
- Processes: no test process is left running. The Postgres cluster was stopped (`pg_lsclusters`: down). The combine worktrees under `/home/user/cmb` were removed after the run.
- Commits: Tovu `cloud/extract-s10` = WIP evidence commits `41cbd996`, `45231309`, `95d24685`, `22df99dd` + this report; Jini `cloud/extract-s10` = `6c7a7857` (changeset only). No force-push, nothing on main or cloud/combine, nothing published.

EXTRACT-X2 DONE
