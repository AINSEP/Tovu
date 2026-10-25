# Verify codex fixes (Tovu 6664d6df, Jini 1ccae4cc) — node 24.22.0, report-only

## Previously failing (merge2-REPORT) — PASS/FAIL
- Jini admin theme-boundaries (ConsentFields.tsx hex): PASS (suite 2799/2799)
- Admin: panels-render, panel-access, untranslated-copy, admin-screens-manifest, chat-settings-tip-phone-css: PASS (full admin suite 803 files, 13243 pass / 2 skipped / 0 fail)
- Admin dictionary-lookup-sinks: PASS (inside full admin suite; 0 fails)
- Website merged-readers-batch redirects_get: PASS
- Website mcp-ui-tool-calls (allowlist / cross-site-read-catalog): PASS
- Website agent-plugin-search-discovery (describe_tool required): PASS
- Website bundled-site-import / bundled-tovu-theme skill tests: PASS (agent-plugins dir, no failures)
- Website init-site-directory-sync: PASS
- Website site-exporter Cache-Control: PASS
- Website bundled-mail-resend 429: PASS
- Website install-tool-update: PASS (also in batch)
- Website analytics-ingest forwarder: PASS
- Website route-modules 'agent-plugins': PASS
- Website publish-agent-tools propose-credential: FAIL (see below; not touched by the fix commit)
- 3x Chromium render-form-layout: NOT RUN (ENV: no Chromium installed, owner rule)

## NEW / still-failing (website)
- apps/website/.../deployments/__tests__/publish-agent-tools.unit.test.ts — "propose-credential: a secret field is refused as a pre-fill hint, so a secret can never come from the chat" — FAIL (was already in pre-existing list)
- apps/website/.../deployments/deploy-targets/__tests__/descriptor-fields.unit.test.ts — "the shipped hosting plugins declare the credential fields and vendors core used to hard-code" — FAIL: AssertionError deep-equal, actual fields has extra 'mediaBucket' after 'publicUrl*'. Not in merge2 list, not touched by fix commit; likely pre-existing on main (not checked on main directly — no baseline run), appeared because that dir was not run before.

## Totals
- Jini admin (vitest, maxWorkers=2 flag unsupported by pool opts → forks=2): 208 files, 2799/2799 pass. 1st run had 1 flaky waitFor-timeout failure; 2nd run and theme-boundaries alone green.
- Tovu website node:test (conc=1): touched files 201/201 pass; related dirs (agent-plugins, deployments, site-export, platform/site-dir; no *.postgres) 2960/2975 counted-pass... exact: tests 2975, pass 2960, fail 2 (rest cancelled/skipped).
- Tovu admin vitest full: 803/803 files, 13243 pass, 2 skipped, 0 fail.
- NOT run: whole website suite (time cap), *.postgres (no PG), Chromium tests (ENV), desktop/site-chat.

## tsc --noEmit
- admin: 4 errors (= expected 4). website (tsc -p tsconfig.json): 9 errors (= expected 9).

## Setup notes
- npm ci fails on @jini-ai/search (not on npm) -> used temp removal + npm install --no-save, restored package files.
- Jini `pnpm -r build` completed; link:jini OK (58 links).
