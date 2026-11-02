# Cloud FIX session — integ/demo-fixes (2026-11-02)

## HARD CAPS (iron rule — overrides everything)
- Wall clock 120 minutes from your first command. At 105 min: start nothing new, commit, push, write REPORT, END.
- At most 3 subagents at a time (Opus). Total ≤ 6 subagents for the whole session.
- Fix what is listed. Anything else you notice: LIST it in the report, don't fix it.

## Repos (pre-cloned /home/user/Tovu, /home/user/Jini)
- In BOTH: `git fetch origin integ/demo-fixes && git checkout -B integ/demo-fixes origin/integ/demo-fixes`. Push your commits to `integ/demo-fixes` in each repo (never main).
- Setup exactly as /home/user/Tovu/cloud-briefs/2026-11-02-integ-test-run.md "Setup" + Jini 1–2 + Tovu 1–4 (Node 24, pnpm install, `pnpm --no-bail -r build`, Tovu npm ci with the temp-package.json trick, sdk build, link:jini, compose). Also install Electron's binary for desktop tests if possible (`cd apps/desktop && npx electron --version` / `node node_modules/electron/install.js`); if it can't download, desktop electron tests stay ENV.
- The last test run's results: `git show origin/integ/merge-1029:cloud-results/2026-11-02-integ/RESULTS.md` (Tovu). Read it first.

## Rules for every fix
- Owner bug rule: FAILING TEST FIRST → run it, show RED → fix → GREEN. Run only the touched test files (+ the cascade files listed below after the root fix). vitest `--maxWorkers=2 --minWorkers=1`; node --test `--test-concurrency=1`.
- One commit per fix: `git commit -m "<type(scope)>: <what is fixed>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <paths>`.
- Code rules: (requiredArgs, optionalArgs) objects; deps as ports; complexity ≤ 10; move why-comments, never delete them; no as any / ts-ignore / eslint-disable; vendor-neutral Jini core (no "Tovu" in Jini source); never lazy-import to dodge a dependency; smallest change. Fixes must work for every agent CLI.
- Agent plugins are SUBPATHS of `@jini-ai/agent-plugins/<id>` — NEVER `@jini-ai/plugin-<id>`.

## PART A — finish the YC-demo fixes (stopped mid-work locally)
Evidence: Tovu `ADS-memory/.local-artifacts/demo-reel-2026-11-02/practice-ground{,-2}/NOTES.md` may not be in git; the bug text below is authoritative.
Already done (don't redo): search_tools max_results (Jini 7e9fae1c7), Done·Ns timer (f1ec9c710), duplicate site-name boot (cda5e1694 / Tovu dc472fd28), consent 403 / thumbnails / dashboard refresh / theme-from-reference guidance (Tovu da5ebc7c9 92247090c 3dc161838 e958237f9).
1. FINISH WIP Tovu a428f27af "banner off by default": SITE_CONSENT_DEFAULTS.enabled=false (owner decision 11-02); explicit saved choices preserved; readiness/ensure-privacy-defaults must not force it on or refuse deploys; update every test pinning the old default; add test "fresh site → banner off; saved enabled:true → jini". Make the touched consent/route/export tests green.
2. FINISH WIP Jini 7ecffbb9a model picker: friendly names (no raw ids under "Offline fallback" unless the live list failed), Escape closes it. Tests green.
3. Every chat tool row shows twice — once `mcp__jini__X`, once `X`. Dedupe by canonical tool id where tool-call events become rows (Jini chat), for every CLI.
4. On every fake-test-site boot the composio plugin times out on a file lock and stays off. Root-cause the lock (stale lock / racing boots) and auto-recover a stale lock.
5. SAFETY: the chat rebuilt an existing theme IN PLACE (no copy, no undo) and switched the live site to it without a confirmation card; it also overwrote theme.css with a placeholder mid-run. Close at the TOOL level: overwriting an existing theme's files and activating a theme on the live site go through the confirmation card (sideEffects/confirmation metadata) or work on a copy; theme writes keep a revision/undo point (reuse an existing revision mechanism).
6. The chat's final summary named header links that the live header doesn't show (the header renders the site menu). Fix root cause: theme header renders the site menu + guidance says change nav via menu tools, or tool results tell the agent what the header shows.

## PART B — fix the cloud test-run failures (RESULTS.md), in this order
1. Jini `packages/provider-plugins/tsconfig.charts.json` include `["src/charts-*"]` matches nothing (TS18003) → build never produces plugins/charts-*/<ver>/. Fix the glob, rebuild provider-plugins, then re-run: plugin-catalog generate (COMMIT the regenerated catalog.json), provider-plugins vitest, guard:plugins:packed, and the Tovu cascade files (recharts-package-pin, product-telemetry, browser-provider.integration, registry/installed-* deploy tests). Note: Tovu charts-recharts-source.ts pins are `sha256-PENDING-PACKAGED-PIN` placeholders — once the payload builds, compute the real integrity map from the built payload and commit it so recharts-package-pin passes.
2. Jini `packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver.test.mjs` SyntaxError (unescaped apostrophe in a test title).
3. Jini scripts `check-plugin-isolation.test.ts` "legacy ui-ux-design … subpath-only plugin has no package" — expectation vs the deleted @jini-ai/plugin-slide-design; fix the test or the gate (no per-plugin package must exist).
4. Jini provider-plugins recharts `provider.test.tsx` alias identity (×3) — follows the chart-provider cache-key change d3064f359; align the test with the intended behaviour (aliases keep generic selection).
5. Jini `guard` 7 violations: "Tovu" in provider-plugins (option.ts, bar-chart.tsx, chart-config.ts), chat folder-drop test deep import, db kernel/sqlite SI-domain, HW3 module state (composer-draft-cache.ts, charts-echarts/mount.ts). Also remove the 30 stale hardwiring-debt entries it reports.
6. Jini `guard:plugins:packed` cookie-consent "another plugin's payload in dist/render/banner.js".
7. Tovu publish-site-route.test.ts (20 failures, "no publish targets are installed") + tool-registrations.contracts "all six static-publish providers" + stock-content-dirs (bundledAgentPluginsDir resolver, build-script overlays copy) — test harnesses don't compose the moved hosting plugins / overlays dir. Fix harness or product, whichever is wrong.
8. Tovu deploy-config-command.unit.test.ts (2), descriptor-i18n (github/tovu-source-control.json moved), higgsfield failure-modes.md strings, comments index.test newId, render.test menu widget, theme-static-assets-live-roster, site-title-preservation AC-12, create-site-route-deps-boot-options (TOVU_MEDIA_BLOB_STORE s3), skill-supporting-files ui-ux-design reference, tool-search ranking ("is github connected"), overlay failures (github tool-discovery, higgsfield tool-discovery, google-workspace host-token-refusals, railway/render installed-deploy, fly installed-observe-only, github installed-deploy-verb). Fly workflow parity = EXPECTED, leave it.
9. Tovu `check-hardwiring.mjs` cannot parse apps/desktop/src/coverage-floors.ts:273.
10. Tovu desktop: stage-payload-lib (2), stage-payload-run, verify-package-cli, electron-builder-files ("card Stop must receive the same tracker"), main-shutdown-wiring, settings-menu (2), product-telemetry-boot, websites-width (App.ts import path), renderer *.render.test.ts files failing with no message (find the shared cause). Electron-missing ones are ENV if the binary can't be installed.
11. `npx tsc -p tsconfig.tests.json --noEmit` (use NODE_OPTIONS=--max-old-space-size=8192): 80 errors — fix those in files changed vs origin/main.
12. complexity:strict errors ONLY in files changed vs origin/main (both repos); pre-existing ones → list.
Not in scope: admin vitest/@types/react ENV (but if `npm i -D` is not needed and a plain `npx vitest` from apps/admin works, run the admin files from PART A).

## REPORT
Write /home/user/Tovu/cloud-results/2026-11-02-fix/REPORT.md: per item FIXED <repo sha> / NOT FIXED (why) / ENV; every still-failing test listed by file + name + first error line; new bugs found. `git add -f` it, commit, push integ/demo-fixes in both repos. END.
