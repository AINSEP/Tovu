# RE-VERIFY 2026-10-29 (evening) — RESULTS (report only; no product code touched)
Start 21:33Z, stopped 00:09Z (~156 min, under the 165-min cap). All raw output is in `raw/*.txt|json`. Delta columns vs the two earlier passes were **NOT produced** (earlier reports not read — see §5).

## §0 One screen
| Area | Result |
|---|---|
| Jini install | OK |
| Jini build (`pnpm --no-bail -r build`) | **9 failures**: http-kit, infra, plugins, integrations, agent-runtime, ui, user-management, mcp (tsc, test-file type errors + ui-kit import), examples/reference-web (vite). `raw/jini-build.txt` |
| Jini `pnpm -r typecheck` | exit 1, **19 `error TS`** (`raw/jini-typecheck.txt`) |
| Jini `pnpm guard` | **6 violations** (2 L3 ui→@jini-ai/ui-kit/react undeclared, 2 SI-domain platform→net, 2 HW3 module-state: devops css-urls.ts, provider-plugins payments-stripe/webhook.ts) + 27 stale hardwiring debt entries. `raw/jini-guard.txt` |
| Jini `test:scripts` | 5 failed / 400 passed (1 file). `raw/jini-test-scripts.txt` |
| Jini vitest sweep (37 pkgs) | FAILING pkgs: admin 6 tests (15 files; ui-kit resolve), agent-plugins 1, cli 3, cookie-consent 3, db 3, mcp 1, plugins 2, provider-plugins 7, server 1, ui 6 tests (33 files), user-management 8 files (0 failed tests), chat (run corrupted by me, see §1). All others green. Table in §1 |
| Jini commerce `test:coverage` | 1247 pass / **2 fail** (worker-boundaries), lines 99.95 / br 100 / fn 99.83 |
| Jini provider-plugins `test:coverage` | 501 pass / **7 fail**, 100/100/100 (pre-failure) |
| Jini complexity:strict | no longer aborts: **54 errors, 74 warnings** (43 no-restricted-syntax, 8 cognitive, 3 cyclomatic) |
| Tovu `npm ci` | **FAILS** (ETARGET `@jini-ai/cookie-consent@^0.6.13` not on npm) → local uncommitted override (see §6) |
| Tovu typecheck | root **5 errors**, admin 3, desktop 1, site-chat 0, typecheck:tests **34**, typecheck:scripts **8** |
| Tovu node:test shards 1–3 (with coverage, complete) | 3922+3667+… see §1: shard1 22✖ lines (summary line unreadable, binary chars), shard2 3683 tests/5 fail, shard3 3931 tests/4 fail |
| Tovu shards 4–8 | **PARTIAL, killed at cap, NO coverage**: ✔ 1982/3812/3402/3385/3106, ✖ 1/2/10/4/6 (inline counts include suite lines) |
| Tovu admin vitest | run1 (as-is): 424/833 files failed (cascade of Jini ui build). Run2 after env fix: **4 failed / 13547 tests**; solo rerun: 3 pass (FLAKY), 1 still fails. Coverage L 99.33 / Br 98.19 / Fn 98.75 |
| Tovu desktop `npm test` | 1833 tests, 1822 pass, **1 fail**, 10 skipped |
| Tovu route coverage (PARTIAL = shards 1–3 only, 333 files) | lines **92.14%** (floor 99 → FAIL), branches 79.98%, funcs **83.93%** (floor 93 → FAIL). Lower bounds only |
| Tovu complexity:strict | **0 errors**, 3 warnings (sonarjs/redundant-type-aliases) |
| Tovu check:boundaries | **0 errors, 53 warnings** |
| Tovu check-architecture | **FAILED**: runtime propagation cost 3.06→3.80, bidirectional hubs 335→367, +2 cycle pairs, largest SCC 22→33 (ratchet) |
| madge circular | website 8, admin 6, desktop 8 (see §4) |

## §1 Failing tests
Classes: REAL / STALE / ENV. Detail (first error lines) in the raw files named. Solo re-runs were done ONLY for the 4 admin failures; everything else is **not re-run** (time).

### Tovu — shards 1–3 (detail: `raw/tovu-failures-shards1-3-detail.txt`)
| Test | File | Error | Class / cause |
|---|---|---|---|
| sites settings validate every root before calling the settings writer | apps/website/src/server/inbound/admin-http/routes/sites/__tests__/unit/h4-site-effects.unit.test.ts | strictDeepEqual mismatch | REAL (untested refactor) |
| imports shouldClearSessionOnFailedResume from the pure decision module | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-resume-wiring.unit.test.ts | source-text assertion: onStarted must import the H1 function from agent-session-preset.ts | STALE (import moved in boundary rounds) |
| native fallback guidance stops after one denial… | …/assistant/__tests__/assistant-system-overlay.unit.test.ts | regex `/no ~\/\.claude\/tool-results.../` no longer in overlay text | STALE/REAL (copy changed) |
| SDK external type contracts are declared package dependencies | packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts | strictEqual mismatch | ENV-likely (my `"next"` dep rewrite of manifests) |
| apps/site-chat SiteAssistantActivation / Header / Widget.confirmation test files | apps/site-chat/src/__tests__/*.test.ts | `Cannot find package '@jini-ai/ui-kit' imported from /home/user/Jini/packages/ui/dist/react/components/SecretInput.js` (ERR_MODULE_NOT_FOUND) | ENV→REAL in Jini: ui imports ui-kit/react but does not declare it (guard L3) |
| main mounts the React widget… | apps/site-chat/src/__tests__/entries.test.ts | same ERR_MODULE_NOT_FOUND | same |
| page verbs are classified… | apps/website/src/assistant/__tests__/tool-approval-policy.test.ts | TypeError: Cannot convert undefined or null to object | REAL (unexamined) |
| shard 2: 5 failures, shard 1: 22 ✖ lines | see `raw/shards/spec-1.txt`, `spec-2.txt` (`grep -a '✖'`) | not triaged in time | UNCLASSIFIED |

### Tovu — shards 4–8 (killed, inline ✖ titles only; `raw/tovu-failures-shards4-8-inline.txt`; no error text because node:test prints it only at the end)
- 4: root/admin/site-chat select the same new chat release and preserve the UI override
- 5: agent-daemon-port exports exactly the documented runtime surface; stock resolvers work from a dist/src module layout independently of cwd
- 6: an order INSERT failure rolls back the preceding stock and version update; default boot adapters preserve a failed onboarding token…; lazy kernel resolves the handle only on first use…; no production file under src/{analytics,features,…}/ value-imports from src/assistant/; null expectedVersion still flips the real marker…; page delete compensates a failed audit write…; store plugin data [pglite]; store plugin data [sqlite]; workspaceIdOverride supplied: the db opened for validation is the SAME handle…
- 7: live site: a request carrying the static-export marker gets no widget AND a never-store Cache-Control; real core tree has only reviewed pattern exceptions…; the redirects barrel exports only the SQLite repo and the phase-handler registrar; vendor-credentials exposes the publish-credentials in-memory repo as its only runtime export
- 8: no new raw SQLite outside the storage kernel (ratchet); store: activation is idempotent; store: checkout decrements stock (OCC) and records an order; store: checkout refuses out-of-stock…; store: invalid quantities are refused…; t10 media expired form closes without saving
Likely classes: the "exports exactly / only exports / ratchet / no production file value-imports" tests are STALE architecture pins after the boundary rounds; "store: …" and "store plugin data" are the new commerce/store code (REAL, probably the commerce Phase 1 work). Not verified.

### Tovu — admin vitest (`raw/tovu-admin-vitest.txt`, `raw/tovu-admin-rerun-failures.txt`)
- app-admin-assistant-dock-visibility, app-confirm-dialog-i18n (logout Cancel), use-assistant-runtime-preferences.hooks: timeouts under load → **FLAKY** (pass solo).
- main-entry-signed-in.unit.test.tsx "mounts the signed-in shell…": timed out 30 s, **still fails solo** → ENV/REAL unresolved.
- run1 (as-is, `raw/tovu-admin-vitest-run1-asis.txt`): 424 files failed, cause `Failed to resolve import "@jini-ai/ui/settings-dialog.css"` etc. = Jini `ui` build aborts at tsc so the css copy steps never run (REAL in Jini build).

### Tovu — desktop (`raw/tovu-desktop-test.txt`)
- "the default Windows stop invokes taskkill for the whole tree and waits for child exit" — apps/desktop/src/tovu-server-failures.test.ts — 1 fail; Linux-only environment likely (ENV), not verified.

### Jini vitest (`raw/jini-vitest-<pkg>.txt`, failures list `raw/jini-failures-list.txt`)
| pkg | tests failed | cause (class) |
|---|---|---|
| admin | 6 tests/15 files | `Failed to resolve import "@jini-ai/ui-kit/react"` from ui/dist SecretInput.js; REAL (ui missing dep) + media.test.tsx credential tab, seo-binding ×5 |
| ui | 6 tests/33 files | same ui-kit resolve; missing `dist/.../remixicon.css` (build aborted); `vi.mock("node:fs")` no default export ×2; jsdom "Not implemented" noise |
| user-management | 8 files, 0 tests | ui-kit/react resolve (REAL) |
| agent-plugins | 1 | src/lifecycle/__tests__/unit/set-enabled-compatibility.unit.test.ts:49 "activation observers run only for committed transitions…" deep-equal mismatch (REAL) |
| cli | 3 | "promise resolved undefined instead of rejecting" ×3 (REAL/ENV — probably missing codex/agy binaries) |
| cookie-consent | 3 | expected undefined to match {status:'set',action:'reject'} etc. (REAL) |
| db | 3 | "owner-store/migrate loaded shared/ddl.adapter.js: expected false to be true"; arrays not equal (REAL, import-purity pins) |
| mcp, plugins, provider-plugins | 1 / 2 / 5 | `Invalid Chai property: toHaveBeenCalledExactlyOnceWith` — matcher does not exist in installed vitest 2.1.9 (same cause as the tsc build errors in http-kit/plugins/mcp) → REAL (dep drift) |
| provider-plugins (rest) | 2 | PostHog 401 flush; ENOENT `plugins/analytics-posthog/0.6.13/server/module.full.no-external.js.map` (ENV) |
| server | 1 | `Cannot find package 'smol-toml' imported from /tmp/c2-server-memory-*/node_modules/@jini-ai/daemon/dist/agent-executor/codex/isolation.js` (REAL: undeclared dep) |
| commerce (test:coverage) | 2 | worker-boundaries.vitest.test.ts:24 — outbox payload now has extra `reference: "order-1"` (STALE test vs new commerce code) |
| chat | n/a | **my error**: I deleted `raw/jini-cov/*/.tmp` while chat ran → ENOENT on coverage tmp, run invalid. NOT re-run |
| test:scripts | 5 | 1 file failed, 5 tests (see `raw/jini-test-scripts.txt`) |
Passing: agentic, agent-runtime, analytics, artifacts, capability-providers, cms, core, daemon, desktop-host, devops, diagnostics, http-kit, infra, integrations, memory, oauth, platform, protocol, registry, sandbox, search, sidecar, sqlite, ui-kit, vibecoding.

### Typecheck errors (all lines in raw)
- Tovu root (5): `raw/tovu-typecheck.txt` — duplicate-resource-registry.ts:97 TS2352; assistant-permanent-deletes.ts:23 TS2769/TS18046, :26 TS2488; tool-catalog-manifest.ts:413 TS2345 (DnsRouteDeps vs SavedHostingDeps).
- admin (3): redirects.unit.test.tsx(24,36), Authentication.unit.test.tsx(20,38), Library.unit.test.tsx(67,36) — PanelRenderContext arg mismatches.
- desktop (1): ../website/src/platform/site-dir/site-trash.ts(87,3) TS2322.
- typecheck:tests 34 (`raw/tovu-typecheck-tests-rerun.txt`), typecheck:scripts 8 (`raw/tovu-typecheck-scripts-rerun.txt`).
- Jini 19 (`raw/jini-typecheck.txt`).

## §2 Coverage
- Tovu route table: `raw/route-coverage-per-file.json` (333 files, sorted by uncovered lines; 159 at zero uncovered; total 2821 uncovered lines — PARTIAL, shards 1–3 only). Floor script output: `raw/tovu-route-coverage-floor-PARTIAL-shards1-3.txt`. `classify-coverage-gaps.ts` FAILED (needs `development/coverage/lcov.unit.info` from the tiered run, not produced) → `raw/classify-coverage-gaps.txt`. `coverage:all-files` NOT RUN.
- Jini per package: `raw/jini-coverage-per-package.json`; 205 production files under 100% in `raw/jini-files-under-100.json` (examples/ and provider-plugins/plugins bundles excluded). Packages below 99% lines: admin 91.72, user-management 90.69, diagnostics 94.91, ui 95.18, ui-kit 97.29 (some of these depress because test files failed to load). 100% in all axes: agentic, artifacts, capability-providers, cli, devops, http-kit, memory, protocol, registry, search, sidecar, sqlite. Note: the first sweep used each package's default vitest config; commerce and provider-plugins use `vitest.coverage.config.ts` (figures above come from that).

## §3 Complexity
- Tovu: 0 errors, 3 warnings (`raw/tovu-complexity-messages.txt`).
- Jini: 54 errors (full list `raw/jini-complexity-messages.txt`): cognitive>10 in chat question-form/scan.ts:339, cli flags.ts:100, cms navigation/repo.memory.ts:131, widgets/resolver-service.ts:107, resolvers/menu.ts:69, resolvers/taxonomy.ts:6, desktop-host updates/instance-presence.ts:69, ui-kit react/testing/driver.ts:87; cyclomatic 11 in commerce/src/catalog/settle-order-payment.ts:55, provider-plugins payments-stripe/checkout-session.ts:32 and session-reading.ts:19; 43× no-restricted-syntax ("Use host-neutral messages and injected wire constants") e.g. admin consent/react/ConsentFields.tsx:112, admin seo/messages.en.ts:6.

## §4 Architecture
- dependency-cruiser: 0 errors / 53 warnings: no-circular 37, no-deep-imports (settings 4, platform/mail 3, taxonomy 2, entries 2, analytics 2, webhooks 1, navigation 1), only-composition-constructs-concrete-adapters 1. Full list `raw/tovu-boundaries-err-long.txt`, by rule `raw/tovu-boundaries-by-rule.txt`.
- check-architecture: FAILED, list of NEW cross-feature edges in `raw/tovu-check-architecture.txt` (435 edges, propagation 13.94%, 7 runtime cycle pairs, SCC 33, API surface 765).
- madge (website/admin/desktop = 8/6/8 cycles; `raw/madge-*.txt`, `raw/madge-*-parsed.json`). Classification `raw/madge-admin-desktop-classified.txt`:
  - admin: own-code 3 — WidgetPickerDialog.tsx↔WidgetPickerDialog.hooks.tsx; features/pages/hooks/use-theme-pages.hooks.ts↔lib/theme-page-publish-state.ts; features/pages/rules.ts↔use-theme-pages.hooks.ts. Jini dist 2 (chat useUserTextGuard.d.ts↔index.d.ts; ui standing-draft helpers). Mixed 1 (MediaPickerDialog.tsx↔JiniMediaPicker.hooks.ts). Website-only 0.
  - desktop: own-code 1 — renderer/use-site-workspace.hooks.ts↔site-theme-preview.hooks.ts. Website-only 5 (same SCC as website: external-mcp-oauth/store, webhooks/index↔keyring.env, platform/site-dir/*, db/site-store-copy, media/provider-credential-store). Jini dist 2.
  - Website files imported by admin/desktop: `raw/admin-imports-of-website.txt` (9 distinct specifiers from 43 files), `raw/desktop-imports-of-website.txt` (9 specifiers from 17 files). Caveat: grep of `website/src` path strings only; alias imports could be missed.

## §5 NOT RUN / incomplete
- Tovu shards 4–8: stopped at cap, no coverage, no failure detail, no solo re-runs. Shard 1 summary unreadable (binary chars); shard 2 and 1 failures not triaged.
- Solo re-runs for all Jini/Tovu failures except the 4 admin tests; chat package (invalidated by me); `coverage:all-files`; classify-coverage-gaps (needs lcov.unit.info); route coverage is 3/8 of the suite.
- Delta columns vs 10-28 evening and cloud/verify-1029-results: not produced.
- Jini `pnpm -r typecheck` exit 1 but dist was emitted despite tsc errors, so downstream tests ran against that dist.
- madge website run used root tsconfig; counts may differ from earlier passes.
- Desktop/admin "own cycle" check done with madge, extensions ts,tsx(,cts).

## §6 Environment deviations (all uncommitted/local, never pushed)
- Tovu package.json files (root, admin, desktop, site-chat, contracts, sdk): every `@jini-ai/*` dep set to `"next"`, root `overrides` with `@^` keys and the apps' `overrides` (incl. admin tiptap pins) deleted, `npm install --ignore-scripts`, `npm run link:jini` to /home/user/Jini/packages. The tiptap pin removal may affect admin tests.
- Jini: symlinked ui-kit into packages/ui/node_modules and ran the post-tsc css copy steps of the ui build by hand (`raw/jini-ui-post-tsc-manual.txt`) before the 2nd admin run.
- Postgres 16 from /usr/lib/postgresql (apt had no package) on /tmp socket + 5432; chromium-1228 symlinks. Postgres was never needed by a run I looked at.
- Tovu working tree has local modifications to manifests/lockfiles; nothing but this directory was committed.
