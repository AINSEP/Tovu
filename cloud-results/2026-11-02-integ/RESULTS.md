# Cloud test run — integ/merge-1029 (2026-11-02) — REPORT ONLY

Wall clock ≈ 50 min of the 90 min cap. Node v24.22.2, pnpm 10.33.2 (via corepack), npm. No product code changed. Jini HEAD 6ce15df, Tovu HEAD = origin/integ/merge-1029. No Jini commits were made or pushed (lockfile and catalog both unchanged — see Jini 1 and 3).
Raw output: `raw/` (`_jini-summary.txt`, `_jini-tc.txt`, `_tovu-summary.txt` hold rc + durations for every step).

Classification: PASS / FAIL (product) / ENV (no Chromium/Postgres/electron/IPv6/etc.) / EXPECTED / RUNNER (the brief's command can't work as written).

## Jini (/home/user/Jini)

| step | result | time |
|---|---|---|
| 1 `pnpm install` | PASS — pnpm-lock.yaml unchanged, nothing to commit | 23s |
| 2 `pnpm --no-bail -r build` | **FAIL** — `@jini-ai/provider-plugins` build: `error TS18003: No inputs were found in config file packages/provider-plugins/tsconfig.charts.json (include ["src/charts-*"])` (typecheck script runs before `scripts/build.ts charts-recharts/charts-echarts`, so plugin payloads `packages/provider-plugins/plugins/charts-*/0.6.13|0.6.19/` were never produced). All other packages built. | 158s |
| 3 `plugin-catalog generate` | **FAIL** (cascade of 2) — `ENOENT .../provider-plugins/plugins/charts-echarts/0.6.13/jini.plugin.json` (generate.ts:198). catalog.json NOT regenerated, nothing committed | 0s |
| 4 push | N/A — no commits made | – |
| 5a `pnpm test:agent-plugins:content` | **FAIL** — 1 file | 55s |
| 5c scripts vitest (8 files) | **FAIL** — 1 test failed, 245 passed, 26 skipped | 18s |
| 5b changed vitest files, per package | PASS: agent-runtime, agentic, chat, cms, core, daemon, db, desktop-host, devops, http-kit, mcp, platform, plugins, server, sqlite, ui. FAIL: plugin-catalog, provider-plugins | 1–32s each |
| 5d `guard:plugins` | PASS | 2s |
| 5d `guard` | **FAIL** — 7 violations | 32s |
| 5d `guard:plugins:packed` | **FAIL** — 2 | 115s |
| 5d `complexity:strict` | **FAIL** — 173 problems (73 errors, 100 warnings) | 88s |
| 5e `tsc -p scripts/tsconfig.json` | PASS | 3s |
| 5e typecheck changed packages | PASS: agent-plugins, agent-runtime, agentic, chat, cms, core, daemon, db, desktop-host, devops, http-kit, mcp, platform, plugins, server, sqlite, ui. **FAIL** provider-plugins (same TS18003 in `tsc -p tsconfig.charts.json`). N/A (no tsconfig.json, `tsc -p .` TS5057): plugin-analytics-posthog, plugin-catalog, plugin-observability-opentelemetry, plugin-observability-sentry, plugin-ui-ux-design | – |

### Jini failures (product unless noted)
**Build/typecheck**
- `packages/provider-plugins` build + typecheck: `TS18003 No inputs were found in config file tsconfig.charts.json` — `include: ["src/charts-*"]` matches no files with this tsc (the sources live in `src/charts-echarts/`, `src/charts-recharts/`; the glob has no `/**`). Root cause of the plugin-catalog, guard:plugins:packed and both Tovu `recharts-package-pin` failures below.
- `plugin-catalog generate`: ENOENT `packages/provider-plugins/plugins/charts-echarts/0.6.13/jini.plugin.json`.

**node:test — `pnpm test:agent-plugins:content`**
- `packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver.test.mjs` — whole file: `SyntaxError: missing ) after argument list` at `test('stores a valid submission with repeated checkbox values as an array and 303s back with the host's result keys', ...)` (unescaped apostrophe in a single-quoted title). Other files in the suite passed.

**vitest — scripts**
- `scripts/__tests__/check-plugin-isolation.test.ts` > "the legacy ui-ux-design package ships only its own payload; a subpath-only plugin has no package" — expected throw including "another plugin's payload", got "@jini-ai/plugin-slide-design: unexpected packed file slide-design/skills/slide-design/SKILL.md".

**vitest — plugin-catalog** (`__tests__/catalog.test.ts`, 4 failed; consequence of the stale/uncgenerated catalog.json)
- "lists every provider source exactly once and each agent plugin package" — expected [ 'agent:slide-design', …(7) ] to deeply equal [ 'agent:charts-echarts', …(35) ]
- "'agent' 'slide-design' matches its real package, publisher, path and contract" — deep-equal mismatch
- "'agent' 'ui-ux-design' matches its real package, publisher, path and contract" — deep-equal mismatch
- "preserves each agent manifest version independently of the npm release" — object does not match

**vitest — provider-plugins** (6 failed / 248; 2 files)
- `src/__tests__/artifact.integration.test.ts` > "charts-recharts: packs, installs, loads and admits identical browser-only bytes with both host SDK ABIs outside the workspace" — AssertionError (see raw)
- same file > "charts-echarts: packs, installs, loads and admits …" — expected { loaded: false, … } to deeply equal { loaded: true }
- same file > "charts-recharts: the built client bundle mounts and draws a bar chart with whole-number ticks" — expected <g> to have a length of 2 but got 1 (jsdom: `Error: Not implemented: HTMLCanvasElement.prototype.getContext` emitted repeatedly → ENV-contributing, canvas pkg absent; the first two follow from the missing charts build)
- `src/charts-recharts/__tests__/provider.test.tsx` > "…preserves the bar-chart wire alias while drawing real SVG", "…line-chart…", "…pie-chart…" — expected [Function RegisteredChart] to be [Function RegisteredChart] (Object.is)

**guard (7 violations)**
- R2-deep-path `packages/chat/tests/folder-drop-redaction.integration.test.ts`: relative import "../../ui/src/features/folder-path-drop/rules.js" reaches into another package's src
- N1-consumer-identity (forbidden source reference "Tovu"): `packages/provider-plugins/src/charts-echarts/option.ts`, `.../charts-recharts/bar-chart.tsx`, `.../charts-recharts/chart-config.ts`
- SI-domain `packages/db/src/kernel/sqlite/driver.ts`: ./kernel/sqlite reaches src/sqlite/backup-policy.ts via ../../sqlite/backup-policy.js
- HW3-module-state `packages/chat/src/react/hooks/composer-draft-cache.ts` and `packages/provider-plugins/src/charts-echarts/mount.ts`
- also reported (non-failing): "30 stale debt occurrences; remove them from scripts/hardwiring-debt.json"; R13 MF3 skipped for codex/antigravity (ENV: CLIs absent)

**guard:plugins:packed (2)**
- P1-plugin-isolation `packages/cookie-consent/package.json`: another plugin's payload in dist/render/banner.js
- P1-plugin-isolation `packages/provider-plugins/package.json`: exported paths missing from tarball: ./plugins/charts-echarts/*, ./plugins/charts-recharts/*, ./plugins/* (cascade of build failure)

**complexity:strict** — 73 errors; files with errors: cms/src/consent/express/index.ts (9), chat/.../useChatPane.hooks.ts (6), search/src/tools.ts (4), db/src/recovery/degraded-banners.ts (4), admin/src/seo/messages.en.ts (4), plugins/src/host/plugin-format.ts (3), core/src/origin-validation.ts (2), cookie-consent/src/client/index.ts (2), chat/src/store/runtime/history-tools.ts (2), admin/src/seo/react/hooks/SeoPage.hooks.ts (2), and 1 each in vibecoding types.ts, ui-kit testing/driver.ts, sidecar supervisor.ts, provider-plugins payments-stripe session-reading.ts + checkout-session.ts, plugins declarative-enable.ts, platform vault-archive.ts + directory-user-config.ts, mcp site-guide-resource.ts + install.ts, http-kit rate-limit.ts, desktop-host instance-presence.ts, db restore-point-create.ts + recovery-orchestrator.ts, daemon frontend-session-registry.ts, core tool-input-normalization.ts, cookie-consent receipt.ts + policy.ts, commerce settle-order-payment.ts, cms widgets/resolvers/taxonomy.ts. Rules: `no-restricted-syntax` ("Use host-neutral messages and injected wire constants" / "Consumer product identities belong to the host") and complexity/cognitive-complexity > 10. Full list: `raw/jini-5d-complexity.txt`.

## Tovu (/home/user/Tovu)

| step | result | time |
|---|---|---|
| 1 `npm ci` (temp package.json, restored; `git diff --exit-code package.json` clean) | PASS | 81s |
| 2 `build --workspace @tovu/sdk` | PASS | 2s |
| 2 `link:jini` (JINI_PACKAGES_DIR=/home/user/Jini/packages) | PASS — 68 links; node_modules/@jini-ai/{provider-plugins,agent-plugins} → /home/user/Jini/packages/* confirmed | – |
| 3 `agent-plugins:compose` | PASS (28 plugins composed) | 3s |
| 4 `apps/desktop build:preload` | **ENV/FAIL** — `TS2307 Cannot find module 'electron'` (src/preload/preload.mts:27, src/speech/preload-speech.cts:46); electron not installed (postinstall download blocked/not run). Retried-equivalent in 5e typecheck, same error | 3s |
| 5 website/content/development node:test (255 listed, 74 are deleted files → skipped) | **FAIL** — batches 00,01,03,04,06 fail; 02 PASS; 05 contains only deleted files (nothing to run) | 124/276/285/276/23/0/18 s |
| 5 overlays (plain `node --test`, as briefed) | RUNNER-FAIL: 64/65 ERR_MODULE_NOT_FOUND (`.js` import → `.ts` file, needs the tsx loader); rerun with tsx loader: 438 tests, **9 fail** (below) | 10s / 110s |
| 5 admin vitest (19 files) | **ENV/FAIL** — `sh: vitest: not found` (vitest not installed in apps/admin or root after `npm ci`); not run | 4s |
| 5 desktop node:test (145; 11 deleted) | **FAIL** — gd-00: 10, gd-01: 23, gd-02: PASS, gd-03: 6 | 16/9/14/15 s |
| 5e `tsc -p tsconfig.tests.json` | **FAIL** — first run OOM (2GB heap); rerun with `--max-old-space-size=8192`: 80 errors (list in `tsc-tests-errors.txt`) | 35s / 74s |
| 5e `apps/admin tsc --noEmit` | **ENV/FAIL** — TS7016 "Could not find a declaration file for module 'react'" (+ cascading implicit-any), @types/react not installed | 35s |
| 5e `apps/desktop typecheck` | **ENV/FAIL** — TS2307 'electron' | 2s |
| 5f `quality:properties` | PASS | 1s |
| 5f `check-hardwiring.mjs` | **FAIL** — `Cannot parse apps/desktop/src/coverage-floors.ts: syntax error at line 273` (file contains a doc comment at ~line 270 that looks like it terminates early / unparsable; see raw) | 7s |
| 5f `complexity:strict` | **FAIL** — 53 problems (10 errors, 43 warnings): admin Media.tsx (2), admin use-folder-drop.hooks.ts (2), website observability-export.ts, composition/deps.ts, site-share-errors.ts, posts/create.ts, theme/theme.ts, desktop coverage-floors.ts, admin use-post-editor.hooks.ts, admin AssistantDock.tsx | 89s |

### Classification summary of Tovu failures
- **Cascade of Jini provider-plugins build failure / unpublished Jini (treat as the same root cause):** recharts-package-pin (3), product-telemetry lock check, browser-provider.integration, installed-* / registry digest tests, split-upgrade tests — they read plugin payloads under /home/user/Jini/packages/provider-plugins/plugins/… which don't exist. (Inferred from messages, not individually proven.)
- **ENV:** all `electron` failures (desktop), admin vitest + @types/react missing, jsdom canvas.
- **EXPECTED:** `fly-overlay.test.mjs` "the committed Tovu deploy workflow is exactly the render of the plugin template plus this overlay" (+ `deploy-config.test.mjs` fly "re-render with the command in this file's header" when run without tsx) — fly-deploy workflow parity until publish.
- Everything else listed below: product failures (or not distinguishable from cascades above).

### Every failing test — website/content/development (node:test, tsx)
## tovu-5a-web-gw-00 (ℹ fail 6)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts` :: deployment_get_static_publish_capabilities actually executes through the REAL ToolExecutor and returns real per-provider data — presence in the registry is not the same a :: AssertionError [ERR_ASSERTION]: all six static-publish providers must be reported
- `apps/website/src/assistant/__tests__/tool-search-keywords.backfill-ranking.test.ts` :: CRUX: every newly-backfilled tool ranks in the top 3 for a realistic operator phrasing, against the real ~160-tool catalog :: AssertionError [ERR_ASSERTION]: "is github connected" must rank source_control_get_capabilities (or an acceptable alternate) in the top 3 — got rank 9, top hit was skills_install
- `apps/website/src/cli/__tests__/unit/deploy-config-command.unit.test.ts` :: keeps the product's Chromium note when cwd has deployment inputs but no overlays :: Error: tovu deploy config: could not derive the default app name from package.json (name) — its format changed since deploy-config.ts's extraction pattern was written. Update the pattern in deploy-con
- `apps/website/src/cli/__tests__/unit/deploy-config-command.unit.test.ts` :: a missing or unknown --target is refused with the loaded ids :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-higgsfield-media-package.unit.test.ts` :: failure-modes.md maps every observed failure string to a real cause :: AssertionError [ERR_ASSERTION]: failure-modes.md must carry the observed string 'remote-declares-not-read-only'
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-higgsfield-media-package.unit.test.ts` :: failure-modes.md routes an expired OAuth token to the one tool that can surface it :: AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Settings\s*(->|→)\s*External MCP/. Input:

## tovu-5a-web-gw-01 (ℹ fail 10)
- `apps/website/src/features/agent-plugins/__tests__/unit/descriptor-i18n.unit.test.ts` :: github/tovu-source-control.json: every i18n key is a string that entry declares (no stale translation) :: Error: ENOENT: no such file or directory, open '/home/user/Tovu/content/agent-plugins/github/tovu-source-control.json'
- `apps/website/src/features/agent-plugins/__tests__/unit/descriptor-i18n.unit.test.ts` :: every bundled descriptor file still parses with its i18n blocks :: AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
- `apps/website/src/features/comments/__tests__/index.test.ts` :: comment submissions immediately honor a changed per-IP budget without resetting the hour :: TypeError [Error]: Cannot read properties of undefined (reading 'newId')
- `apps/website/src/features/deployments/deploy-ops/__tests__/installed-deploy-verb.test.ts` :: split upgrade: deploy=false, github=true — Actions follows github, Fly follows deploy :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `apps/website/src/features/deployments/deploy-ops/__tests__/installed-deploy-verb.test.ts` :: split upgrade: deploy=true, github=false — Actions follows github, Fly follows deploy :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `apps/website/src/features/deployments/deploy-ops/__tests__/installed-deploy-verb.test.ts` :: split upgrade: deploy=true, github=true — Actions follows github, Fly follows deploy :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `apps/website/src/features/deployments/deploy-ops/__tests__/registry.test.ts` :: installed fly package must be active and match the bundled digest :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `apps/website/src/features/deployments/deploy-ops/__tests__/registry.test.ts` :: installed github package must be active and match the bundled digest :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `apps/website/src/features/deployments/deploy-ops/__tests__/registry.test.ts` :: installed railway package must be active and match the bundled digest :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `apps/website/src/features/deployments/deploy-ops/__tests__/registry.test.ts` :: installed render package must be active and match the bundled digest :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:

## tovu-5a-web-gw-03 (ℹ fail 32)
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site preview: netlify and cloudflare-pages are accepted targets (2026-08-15, all four Jini targets) — never 400 for a bare target with no other fields :: AssertionError [ERR_ASSERTION]: netlify preview must not 400
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site: trigger starts a real run (202), and — with no GITHUB_TOKEN configured — the poll settles quickly to an honest errored/NO_CREDENTIALS_CONFIGURED result, nev :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site: a concurrent second trigger gets 409 while the first provider request is held open :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site: a concurrent call through the ASSISTANT TOOL while the HTTP route's own publish is in flight is refused, not raced — the two callers share one guard (Terra  :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site preview: github-pages reports the derived base path and, with no GITHUB_TOKEN configured, credentialsConfigured false — never starting a run :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site preview: an invalid owner is reported as invalid with no base path, and vercel never carries one :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site preview: with a token configured, credentialsConfigured is true and the token itself never crosses the response :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site: a trigger body missing 'owner' for github-pages, and an invalid (non-string) 'branch'/'teamId', all 400 -- the TRIGGER route's own copy of the shape checks  :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site: a github-pages trigger WITH a valid 'branch', and a vercel trigger WITH a valid 'teamId', both parse and start a real run (202) -- same hermetic NO_CREDENTI :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site: branch, teamId and projectName reach the provider port and a successful run completes :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site: netlify, cloudflare-pages and s3-compatible TRIGGER requests (not just their preview counterparts above) parse and start a real run (202) :: AssertionError [ERR_ASSERTION]: netlify trigger must not 400
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site preview: a missing owner entirely (not just blank) for github-pages 400s the same as a blank one :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site preview: a github-pages preview WITH a 'branch' query param, and a vercel preview WITH a 'teamId' query param, both still 200 -- proving the parse succeeds e :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site: a trigger naming a credential this workspace does not own is refused by the run — never falls back to the default/env credential :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-targets: lists every registry target with its label and declared config fields :: AssertionError [ERR_ASSERTION]: the bundled plugin's github-pages target must be listed
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-targets: a target with a saved credential carries its form's field specs, secret flagged, no vendor id :: AssertionError [ERR_ASSERTION]: cloudflare-pages declares a saved credential
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-targets: a target's i18n block crosses the response exactly as its plugin declares it :: AssertionError [ERR_ASSERTION]: the bundled vercel target ships Spanish translations
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish destinations: empty array, saved public destination, system.read gate and workspace isolation :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site HTTP cannot substitute a request flag for exact human domain confirmation :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site: enabled consent returns 409 with explicit choices before starting a deployment :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` :: publish-site: a fresh site's default-on banner does not block a static publish; an owner's explicit ON still refuses :: AssertionError [ERR_ASSERTION]: {"error":"publish target 'github-pages' is not available: no publish targets are installed (turn on a hosting plugin under Agent Plugins)"}
- `apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts` :: stock resolvers work from a dist/src module layout independently of cwd :: AssertionError [ERR_ASSERTION]: missing resolver bundledAgentPluginsDir
- `apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts` :: the build script copies stock data to dist/content, not dist/src :: Error: ENOENT: no such file or directory, lstat '/tmp/tovu-asset-copy-v5grKJ/content/agent-plugin-overlays'
- `apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts` :: every asset copy in the build script cleans its destination first :: Error: ENOENT: no such file or directory, lstat '/tmp/tovu-asset-copy-pkLfM9/content/agent-plugin-overlays'
- `apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts` :: menu widget: nested hostile labels stay inert, unsafe child URLs are neutralized, and unavailable children have no link :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/inbound/public-http/middleware/__tests__/theme-static-assets-live-roster.unit.test.ts` :: View Template reads the replacement theme roster after a refresh without restarting the app :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts` :: AC-12 (REQ-07, T-W3): with the definition registered and the pin held open, a pre-existing site renders Tovu Demo Site, never its display name :: AssertionError [ERR_ASSERTION]: products: legacy site identity
- `apps/website/src/server/runtime/composition/__tests__/browser-provider.integration.test.ts` :: step 5: boot enables and admits the bundled provider; disable/reboot preserves the owner's row :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/runtime/composition/__tests__/browser-provider.integration.test.ts` :: N-1: an enabled 0.1.0 row boots, admits the packaged provider and serves the packaged bytes :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts` :: an unknown TOVU_MEDIA_BLOB_STORE refuses to boot, naming the accepted backends :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts` :: TOVU_MEDIA_BLOB_STORE=s3 with missing variables refuses to boot, naming every required one and exactly the missing ones :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts` :: a complete S3 config boots with the S3 blob store, and the site backup then leaves uploads out :: Error: Unknown TOVU_MEDIA_BLOB_STORE 's3' — expected 'local'.

## tovu-5a-web-gw-04 (ℹ fail 5)
- `apps/website/src/server/runtime/composition/__tests__/product-telemetry.unit.test.ts` :: Tovu declares no production vendor plugins; OTLP is development-only and lock entries match the selected packages :: AssertionError [ERR_ASSERTION]: @jini-ai/agent-plugins
- `apps/website/src/server/runtime/composition/__tests__/recharts-package-pin.unit.test.ts` :: the source directory is the pinned version inside the installed package, not content/plugins :: AssertionError [ERR_ASSERTION]: @jini-ai/provider-plugins must ship plugins/charts-recharts/0.6.19
- `apps/website/src/server/runtime/composition/__tests__/recharts-package-pin.unit.test.ts` :: the approval equals the packaged manifest: id, version, browser providers and the FULL integrity map :: Error: ENOENT: no such file or directory, open '/home/user/Jini/packages/provider-plugins/plugins/charts-recharts/0.6.19/jini.plugin.json'
- `apps/website/src/server/runtime/composition/__tests__/recharts-package-pin.unit.test.ts` :: every pinned file is on disk with exactly the pinned bytes :: Error: ENOENT: no such file or directory, open '/home/user/Jini/packages/provider-plugins/plugins/charts-recharts/0.6.19/client/provider.js'
- `apps/website/src/server/runtime/composition/__tests__/skill-supporting-files.chat.integration.test.ts` :: assistant tool-call transcript contains the installed ui-ux-design foundations reference :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

## tovu-5a-web-gw-06 (ℹ fail 2)
- `development/scripts/__tests__/desktop-portable.unit.test.ts` :: desktop dev CLI launches preload, watcher and Electron portably on win32 :: AssertionError [ERR_ASSERTION]: node:internal/modules/esm/resolve:272
- `development/scripts/__tests__/desktop-portable.unit.test.ts` :: desktop dev CLI launches preload, watcher and Electron portably on linux :: AssertionError [ERR_ASSERTION]: node:internal/modules/esm/resolve:272



### Overlays (rerun with tsx loader)
- `content/agent-plugin-overlays/fly/__tests__/fly-overlay.test.mjs` :: the committed Tovu deploy workflow is exactly the render of the plugin template plus this overlay :: AssertionError [ERR_ASSERTION]: re-render with the command in this file's header
- `content/agent-plugin-overlays/fly/__tests__/installed-observe-only.test.mjs` :: seeded from this build, the installed fly adapter stays observe-only :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `content/agent-plugin-overlays/github/__tests__/installed-deploy-verb.test.mjs` :: seeded from this build, the installed github-actions adapter exports deploy :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `content/agent-plugin-overlays/github/__tests__/installed-deploy-verb.test.mjs` :: upgrade: a site holding the previous github digest loads the changed adapter after the next boot :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `content/agent-plugin-overlays/github/__tests__/tool-discovery.test.mjs` :: vendor requests retain discovery in the production catalog :: AssertionError [ERR_ASSERTION]: my GitHub token changed: expected credential_save, got skills_install, custom_credential_verify, custom_credential_write_files
- `content/agent-plugin-overlays/google-workspace/__tests__/host-token-refusals.security.test.mjs` :: host budget refusal: a write becomes quota-delay with the host retryAfterMs and outcome not-applied, never uncertain-outcome; nothing is sent :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `content/agent-plugin-overlays/higgsfield-media/__tests__/tool-discovery.test.mjs` :: vendor requests retain discovery in the production catalog :: AssertionError [ERR_ASSERTION]: connect higgsfield mcp: expected external_mcp_save, got external_mcp_oauth_connect, external_mcp_oauth_poll_device, content_read.external_mcp
- `content/agent-plugin-overlays/railway/__tests__/installed-deploy.test.mjs` :: installed Railway contributes deploy and observes its returned run through the bound host :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `content/agent-plugin-overlays/render/__tests__/installed-deploy.test.mjs` :: installed Render deploys and observes the returned ID through the guarded host :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:


### Desktop (node:test)
## tovu-5d-desktop-gd-00 (ℹ fail 10)
- `src/asar-verify.test.ts` :: src/asar-verify.test.ts :: 
- `src/check-coverage-script.test.ts` :: src/check-coverage-script.test.ts :: 
- `src/coverage-floors.test.ts` :: src/coverage-floors.test.ts :: 
- `src/coverage-runner-split.test.ts` :: src/coverage-runner-split.test.ts :: AssertionError [ERR_ASSERTION]: Error: Cannot find module 'electron'
- `src/e2e-harness-import.test.ts` :: the desktop journey harness loads through Playwright on the supported Node runtime :: AssertionError [ERR_ASSERTION]: Error: Cannot find module 'electron'
- `src/electron-builder-files.test.ts` :: src/electron-builder-files.test.ts :: AssertionError [ERR_ASSERTION]: card Stop must receive the same tracker before-quit drains
- `src/main-shutdown-wiring.test.ts` :: Quit during a card Stop waits for its tracked teardown after openSites becomes empty :: AssertionError [ERR_ASSERTION]: card Stop must receive the same tracker before-quit drains
- `src/main/updates/product-telemetry-boot.test.ts` :: an inactive product never asks :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `src/main/updates/settings-menu.test.ts` :: Settings carries Automatic updates, checked from the persisted choice :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
- `src/main/updates/settings-menu.test.ts` :: with no product launch config the sharing checkboxes are absent :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

## tovu-5d-desktop-gd-01 (ℹ fail 23)
- `src/preload/preload-staleness.test.ts` :: the compiled preload exposes every current source bridge method regardless of mtimes :: Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'electron' imported from /home/user/Tovu/apps/desktop/src/preload/preload-staleness.test.ts
- `src/preload/preload.test.ts` :: the ESM preload exposes shared keys, runner and voice and maps methods to fixed contract channels :: Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'electron' imported from /home/user/Tovu/apps/desktop/src/preload/preload.test.ts
- `src/renderer/App.sites-home.render.test.ts` :: src/renderer/App.sites-home.render.test.ts :: 
- `src/renderer/App.workspace-start.render.test.ts` :: src/renderer/App.workspace-start.render.test.ts :: 
- `src/renderer/CreateWebsiteOnboarding.database-options.render.test.ts` :: src/renderer/CreateWebsiteOnboarding.database-options.render.test.ts :: 
- `src/renderer/CreateWebsiteOnboarding.render.test.ts` :: src/renderer/CreateWebsiteOnboarding.render.test.ts :: 
- `src/renderer/SiteGrid.jsdom.test.ts` :: src/renderer/SiteGrid.jsdom.test.ts :: 
- `src/renderer/SiteGrid.no-add-tile.render.test.ts` :: src/renderer/SiteGrid.no-add-tile.render.test.ts :: 
- `src/renderer/SiteGrid.status-title.render.test.ts` :: src/renderer/SiteGrid.status-title.render.test.ts :: 
- `src/renderer/SitesFolders.dialog.render.test.ts` :: src/renderer/SitesFolders.dialog.render.test.ts :: 
- `src/renderer/WorkspaceChatPane.render.test.ts` :: src/renderer/WorkspaceChatPane.render.test.ts :: 
- `src/renderer/app/CreateWebsiteHost.render.test.ts` :: src/renderer/app/CreateWebsiteHost.render.test.ts :: 
- `src/renderer/app/FindBar.render.test.ts` :: src/renderer/app/FindBar.render.test.ts :: 
- `src/renderer/app/MainArea.render.test.ts` :: src/renderer/app/MainArea.render.test.ts :: 
- `src/renderer/app/MainContent.render.test.ts` :: src/renderer/app/MainContent.render.test.ts :: 
- `src/renderer/app/MainHeader.render.test.ts` :: src/renderer/app/MainHeader.render.test.ts :: 
- `src/renderer/app/SettingsControl.render.test.ts` :: src/renderer/app/SettingsControl.render.test.ts :: 
- `src/renderer/app/SiteStartPanel.render.test.ts` :: src/renderer/app/SiteStartPanel.render.test.ts :: 
- `src/renderer/app/SiteWorkspace.loading-overlay.render.test.ts` :: src/renderer/app/SiteWorkspace.loading-overlay.render.test.ts :: 
- `src/renderer/app/SiteWorkspace.render.test.ts` :: src/renderer/app/SiteWorkspace.render.test.ts :: 
- `src/renderer/app/TabStrip.render.test.ts` :: src/renderer/app/TabStrip.render.test.ts :: 
- `src/renderer/app/TopNav.render.test.ts` :: src/renderer/app/TopNav.render.test.ts :: 
- `src/renderer/icons.section-icon.render.test.ts` :: src/renderer/icons.section-icon.render.test.ts :: 

## tovu-5d-desktop-gd-03 (ℹ fail 6)
- `src/renderer/websites-width.test.ts` :: Websites fits at 375px with every nav control and header action inside the page :: Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/user/Tovu/apps/desktop/src/renderer/App.ts' imported from /home/user/Tovu/apps/desktop/src/renderer/app-render-harness.ts
- `src/renderer/websites-width.test.ts` :: narrow collapsed multi-tab content fills the dialog, and the desktop single-tab dialog uses its one column :: Error: ENOENT: no such file or directory, open 'data:text/javascript,'
- `src/stage-payload-lib.test.ts` :: stageTransitiveDependencies: follows a multi-level dependency chain, staging every link :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `src/stage-payload-lib.test.ts` :: stageTransitiveDependencies: does not re-copy a dependency whose staged destination already exists, but still walks its own dependencies :: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
- `src/stage-payload-run.test.ts` :: src/stage-payload-run.test.ts :: 
- `src/verify-package-cli.test.ts` :: src/verify-package-cli.test.ts :: 

