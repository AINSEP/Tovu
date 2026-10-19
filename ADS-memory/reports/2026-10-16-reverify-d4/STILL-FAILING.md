# Re-verify 2026-10-16 (reverify-d4) — what still fails

Tovu `9e057ff5c` → `47ebd0331` (restructure/apps-website-phased, dirty shared tree), Jini `87720117` (general-work). Batched under the machine lock with a copy of `day-runner/run-shards.sh` (owner `reverify-d4`, 55-min cap). Commands: `landing-cmds.json`; per-command status: `results.tsv`; logs/TAP/vitest JSON: `logs/`; digests: `FAILS-<shard>.md`. Real home checked after every command (sites.json md5, site-keys count, ~/Documents/Tovu): see bottom.

## RELEASE BLOCKERS

None confirmed. One risk to decide on:

- **Desktop site Start/Restart can fail with "tovu serve did not report a port within 60000ms."** Seen in dev (source-mode) Electron journeys under machine load 25-40: `site-lifecycle.desktop.ts:79` Restart went Starting → Stopped (run 1), and every Start in 3 isolated reruns hit the same card error (text from the page snapshot). The 60 s readiness deadline is `apps/desktop/src/tovu-server.ts:80` (no override at `main.ts:789`); the child is killed at the deadline (`tovu-server.ts:903/961`). Codex read-only review (r3, ~70% confidence): load-sensitive source-mode startup, no port/WAL/stale-exit race found in the Restart path. The packaged app runs compiled mode, so likely **not** a release blocker, but a slow first boot on a user machine would hit the same 60 s wall. Suggested fix (not done): a longer bounded readiness budget for source mode via the existing `readyTimeoutMs` seam, with a fake-clock RED test. Report: `ADS-memory/.local-artifacts/codex/2026-10-16-reverify-d4-r3/out/desktop-restart-stopped.md`.

## Unit / integration: overnight failing files rerun

160 files rerun (154 overnight-failing files minus 4 `*.postgres.test.ts`, plus 6 extra files from the r2 fix round). Result: **157 files green; 3 still red.**

| file | now | verdict | action |
|---|---|---|---|
| Jini `scripts/__tests__/integration/infra-retirement.integration.test.ts` (3 tests) | FAIL | j1 Jini infra-retirement, RED by design | known, skipped |
| Tovu `apps/admin/src/lib/fetch-query/__tests__/devtools-bundle.unit.test.ts` › observability panel bundle | FAIL in batch: `Test timed out in 5000ms` (5,636 ms; it runs a real `vite build`; load 30+) | **flaky (timing)**: 2/2 pass isolated (2 runs). The overnight assertion failure was fixed by ccbf3e5e0 | not fixed: the test has no explicit timeout, so the 5 s default fails under load. Suggest a per-test timeout (e.g. 30 s) |
| Tovu `apps/website/src/assistant/__tests__/tool-registrations.redirects.test.ts` (2 tests) | FAIL → **fixed** | stale: Jini 30290220 dropped `(REQ-22)` from the regex error text | Codex r1 → commit `0c6d3713c` (RED 2 fail on HEAD, GREEN 28/28) |

Not rerun (known env): `storage-move.postgres`, `search-index.postgres`, `create-site-route-deps.postgres`, `move-site-storage.postgres` (local Postgres state).

Fixed since overnight (now green): every other row of the overnight FAILURES.md, including the BYOK-after-close exit-1 files (phase-handler multi-site, site-title-preservation, sqlite-create-site-app-module-identity), publish-site concurrency, resolve-mailer, admin locale shared read, theme-preview-dirty, sites-route admin-password/served-site binding (no real-home writes this time), security guards (default-credential-exposure, mcp-ui-sandbox-proxy-route, run-ownership), route-class-precedence, all guard/boundary ratchets, Jini html-starter URL control, sandbox-proxy sync, sqlite/user-management/server/infra stale tests. The 4 TSX_TSCONFIG_PATH env files pass without that variable (35/35).
Jini commerce `charge-refund.test.ts` no longer hangs: 53/53 and exits (1.3 s).

Non-failing finding: `apps/website/src/server/__tests__/integration/composition-served-site-dir.integration.test.ts` reports a `hookFailed` ENOTEMPTY from its `after()` `rmSync` (2/2 runs) while the file still exits 0 (10/10 pass). The `after` calls `settleBoot(deps)` then deletes the site dir; something still writes into it, and the env restore after the `rmSync` never runs. Test hygiene, not a blocker.

## E2E journeys (chromium, 1 worker)

| overnight # | test | now |
|---|---|---|
| E1 | byok.pins base-URL settle ×4, state races ×2 | pass (all 6 are `known gap` expected-fail pins; they pass as expected-fail). Overnight failure was the long-run flake |
| E2 | agent-page.pins › LEVEL 1 DOM page-driver | pass |
| E3 | assistant.journey › ask_choice card baseline | pass (re-baselined by 2865ace50) |
| E4/E5 | deployment.pins › provider split (Cloudflare default, switch to Vercel) | pass (tests updated: Cloudflare Pages is now the default) |
| E5b | deployment.pins › Preview reports a real derived base path | not re-verified (queued run stopped at the context budget) |
| E8 | pages.journey › published page at phone width | pass |
| E9 | pages.journey › preview script cannot navigate window.top (security) | **pass** |
| E10 | settings-locale.journey › phone-width baselines for the busiest screens | **FAIL** toHaveScreenshot: 3,011 px (ratio 0.01) differ → UI lane |

Not re-verified (queued run stopped at the context budget): E6 admin-visual media desktop+tablet + media.journey baseline, E7 admin-visual mobile (~54), E11 mobile-visual (66/69). 2865ace50 re-baselined ask_choice, media and phone screens on 10-15 evening, so some may be green now.

## Desktop (Electron, dev build)

Desktop journeys (`npm run e2e:desktop`, 7 files, 26 tests; admin built with `npx vite build` because `npm run build` refuses linked Jini): **24/26 pass** in the full run.

| test | runs | verdict |
|---|---|---|
| site-lifecycle.desktop.ts:79 Start, Restart and Stop | fail ×4 (run 1: Restart → Stopped; isolated ×3: Start times out) | env/load: "did not report a port within 60000ms" (see blockers) |
| settings.desktop.ts:51 Zoom In on a site tab | fail ×4 (run 1: guest zoom stayed 0 after Zoom In; isolated ×3: Start timeout first) | run 1 = stale test: `openSiteTab()` returned before the guest finished loading, so the renderer drops the command by design (Codex r3). Codex r4 fix in `development/e2e/desktop/_fixtures.ts` (wait for `isLoading()` false) is **uncommitted, GREEN not shown**: every rerun failed earlier on the 60 s Start timeout |

desktop-shell (`playwright.desktop-shell.config.ts`, 12 tests): was 1 fail / 11 not run (beforeAll expected `<site>/content.db`). Fixed by commit `47ebd0331` (Codex r2: `data.nosync/content.db`). Now 4 fail / 1 skipped / 7 not run: 'Start' button selector times out (cards now name it `Start <site>`), first window `waitForLoadState` times out, beforeAll site init hit its 150 s timeout under load, and the after-hook `rmSync` hits ENOTEMPTY. This older suite has drifted from the sites-home UI; the newer desktop journeys cover the same flows (add/open/start/two sites) and pass.

## For the UI lane (do not fix here)

- settings-locale.journey.ts:139 phone-width baselines for the busiest screens: 3,011 px (ratio 0.01) differ.
- desktop-shell.spec.ts: selectors drifted from the sites-home cards (`Start` → `Start <site>`), first-window load wait; needs someone to look at the app.
- Not re-verified, from the overnight list: admin-visual media (desktop/tablet) + media.journey baseline, admin-visual mobile (~54), mobile-visual (66).

## Real home

Unchanged by this run: sites.json lists only luvira, plannie, tovu-dev, order-pinch; 859 site-keys before and after; ~/Documents/Tovu has the same 4 folders. The sites.json md5 did change at 13:50 (tovu-dev `lastOpened`), while my runner was waiting on the lock, so another process opened that site, not a test of mine.
