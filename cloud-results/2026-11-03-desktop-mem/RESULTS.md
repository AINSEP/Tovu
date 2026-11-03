# Cloud verify run — integ/desktop-mem-1103 (report-only)

Run date 2026-11-03, started 20:58 UTC. **Minutes used: ~40.** Node v24.22.2 (from the nodejs.org tarball in `~/.local/node24`) and pnpm via corepack.
Tovu HEAD `3d0fa7d` (base `bfdbf1be7`); Jini HEAD `3763ffe` (base `09a36d561`). I edited no source or test files; this folder is the only thing committed.

## Summary

| repo | changed test files | PASS | FAIL | HELPER (fixture, not a test) | MISSING (deleted at HEAD) | ENV |
|---|---|---|---|---|---|---|
| Tovu | 230 | 135 | 81 | 10 | 4 | 0 |
| Jini | 83 | 74 | 7 | 1 | 0 | 1 (counted outside FAIL) |

### Headline findings (root causes behind most failures)

1. **Tovu: `resolveRegisteredPresets` is not exported.** It is declared at `apps/website/src/assistant/mcp-federation/bootstrap.ts:246` but not exported, while `apps/website/src/assistant/external-mcp-federation-runtime.ts:5` imports it. tsc agrees: `TS2459` at that line. The bug came in with `d3cd357`. **53 of the 81 Tovu file failures** are this one module-load `SyntaxError`, so none of their assertions ran and their real status is **unknown**.
2. **Tovu: `startLocalSiteWhenRunning` is missing from `#src/platform/site-dir/index`.** `apps/website/src/server/runtime/lifecycle/local-site-host.ts:7` imports it (tsc `TS2305`), and it is exported only from `local-site-supervisor.ts`. This breaks the module load of 3 more files (e.g. `design-c-package-themes-dir-wiring.integration.test.ts`).
3. **Tovu: the root lockfile is out of sync and asks for unpublished versions.** Root `package.json` wants `@jini-ai/agent-plugins@^0.6.19`, `@jini-ai/agentic@^0.6.18` and `@jini-ai/provider-plugins@^0.6.19`. npm's latest `agent-plugins` is 0.6.17, `provider-plugins` returned ETARGET even for `^0.6.17`, the lock pins 0.6.17 and has no `provider-plugins` entry at all. **`npm ci` fails with ETARGET.** This was already true at base `bfdbf1be7` (introduced in `28e0689`). Raw output: `raw/tovu-npm-ci.txt`.
4. **Tovu: root `package.json` does not declare `zod`**, but 6 apps/website runtime files import it (the repo's own guard `apps/desktop/src/jini-mcp-peers.test.ts:130` fails on this). This is a packaging risk; see step 4.
5. **Jini: the `provider-plugins` build fails.** `tsconfig.charts.json` has `"include": ["src/charts-*"]`, which matches the directories but no files, so tsc reports `TS18003 No inputs were found`. `pnpm -r build` exits 1, the charts dist is not produced, and that most likely explains `artifact.integration.test.ts` (`BROWSER_PROVIDER_FORBIDDEN`) and `charts-recharts/provider.test.tsx`.
6. **Jini timeouts that reproduce on their own** (rerun one file at a time with light load; logs in `raw/isolated-rerun-jini/`): `mcp run-tool-host.http.test.ts` ("cancellation reaches the delegated handler", 10 s hook timeout), `mcp tools/wait.unit.test.ts` (5 s), `sidecar supervisor.test.ts` ("demand already discovering a parking child…", 5 s). They are real failures on this box, but could be timing-sensitive.


## Setup deviations (read before trusting the numbers)

- **`AI-Dev-Shop/AGENTS.md` is missing from the Tovu checkout** (Tovu `CLAUDE.md` says to load it). I noted it and continued with the dispatched verification task.
- **Jini:** `pnpm install` OK. `pnpm --no-bail -r build` **exit 1**: only `packages/provider-plugins` failed (TS18003, see headline 5). Raw output: `raw/jini-install.txt`, `raw/jini-build.txt`.
- **Tovu `npm ci` failed** (ETARGET, headline 3). To get a test tree at all, I **temporarily** changed root `package.json` (`agent-plugins`/`agentic` → `^0.6.17`, `provider-plugins` → `file:../Jini/packages/provider-plugins`), ran `npm install`, then **restored `package.json` and `package-lock.json` with `git checkout`**. The tree is clean apart from this folder. Raw output: `raw/tovu-npm-install-workaround.txt`.
- npm 11 skipped install scripts (`allowScripts`). I ran `npm rebuild better-sqlite3 argon2 esbuild` (root) and `esbuild`/`node-pty` rebuilds in apps/desktop and apps/admin, and checked that the native modules load.
- `apps/admin`, `apps/site-chat` and `apps/desktop` each got their own `npm ci` (all exit 0). `npm run build --workspace @tovu/sdk` OK. `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` OK (79 links). `apps/desktop npm run build:preload` OK.
- Runners: Tovu root/website/site-chat/development used `node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1` (the root `test` script's flags). apps/desktop used its package `test` script's two loaders. apps/admin used vitest `--maxWorkers=2`. Jini packages used vitest `--maxWorkers=2 --minWorkers=1` (vitest 2.1 rejects `--maxWorkers=2` alone with a min/max thread conflict). Jini `*.test.mjs` used `node --test`. Each file ran on its own, with a 300 s timeout.
- One runner mistake I fixed and reran: the first admin pass errored with `--minWorkers` (vitest 4 has no such flag), so all 17 admin files were rerun. The numbers above are from the rerun.


## Red/green proof (step 2)

For each pair I checked out the `test:` commit in a git worktree (`node_modules` symlinked from the main checkout, so `@jini-ai/*` resolves to **Jini HEAD build output** and Tovu workspace packages to Tovu HEAD). I ran only the test files that commit changed, then did the same at the fix commit. **red?** = every file failed at the test commit. **green?** = every file passed at the fix commit.

| repo | pair (test → fix) | files | red? | green? | notes |
|---|---|---|---|---|---|
| Tovu | 30d2786 → 9063ea4 | – | NOT RUN | NOT RUN | ran out of time |
| Tovu | 98457c9 → 7c7eb59 | – | NOT RUN | NOT RUN | ran out of time |
| Tovu | 0ef3583 → 20871ad | – | NOT RUN | NOT RUN | ran out of time |
| Tovu | 30491f3 → 9c2fac3 | – | NOT RUN | NOT RUN | ran out of time |
| Tovu | 7def946 → 0cb1197 | 6 | YES | NO (3/6 pass) | failed at fix commit: `tool-catalog-query.test.ts`, `agent-daemon-remote-tools.integration.test.ts`, `assistant-tool-exec.integration.test.ts` |
| Tovu | d7f2f6c → b389d72 | 18 | PARTIAL (17/18) | NO (13/18 pass) | passed at test commit (not red): `agent-daemon-server.session-binding-wiring.unit.test.ts`; failed at fix commit: `assistant-byok-routes.test.ts`, `agent-daemon-remote-tools.integration.test.ts`, `agent-daemon-server.federation-runtime-wiring.unit.test.ts`, `assistant-agent-plugin-preflight.integration.test.ts`, `assistant-server-federation.integration.test.ts` |
| Tovu | 7d299e5 → d3cd357 | 32 | PARTIAL (25/28) | NO (17/28 pass) | passed at test commit (not red): `built-in-mcp-ownership.test.ts`, `design-c-package-themes-dir-wiring.integration.test.ts`, `create-site-route-deps.pglite.integration.test.ts`; failed at fix commit: `desktop-mcp-runtime.integration.test.ts`, `admin-external-mcp-admissions-routes.test.ts`, `agent-daemon-outbox-event-loss.integration.test.ts`, `design-c-package-themes-dir-wiring.integration.test.ts`, `agent-daemon-server.session-binding-wiring.unit.test.ts`, `plugin-activation-poll-boot.unit.test.ts`, `agent-daemon-core-deps.unit.test.ts`, `agent-daemon-deps.memory-route-deps.unit.test.ts`, `create-site-route-deps.pglite.integration.test.ts`, `agent-daemon-core-rpc.integration.test.ts`, `sqlite-shutdown.integration.test.ts` |
| Tovu | 91c4ebe → 3d36da0 | 11 | YES | NO (1/11 pass) | failed at fix commit: `agent-daemon-port.barrel.test.ts`, `assistant-proxy-routes.test.ts`, `agent-daemon-idle-park.integration.test.ts`, `agent-daemon-import-graph.unit.test.ts`, `agent-daemon-remote-tools.integration.test.ts`, `assistant-cold-start.unit.test.ts`, `assistant-daemon-client.unit.test.ts`, `assistant-run-finalizer.http-client.unit.test.ts`, `assistant-daemon-demand.unit.test.ts`, `daemon-demand-fetch.unit.test.ts` |
| Tovu | 35d1f8c → e377c1d | 4 | PARTIAL (3/4) | YES | passed at test commit (not red): `SiteWorkspace.render.test.ts` |
| Tovu | e98479a → b8c5c07 | 7 | YES | YES |  |
| Tovu | f648bc7 → bbb5bd9 | 6 | YES | NO (4/6 pass) | failed at fix commit: `preload.test.ts`, `LoadedSitesStepper.render.test.ts` |
| Tovu | a722d8f → dc5483f | 2 | PARTIAL (1/2) | YES | passed at test commit (not red): `worker-precompile.test.ts` |
| Tovu | 44ea593 → 3b8c3a1 | 2 | YES | YES |  |
| Tovu | f1b73e5 → 2a0a4a9 | 8 | YES | NO (7/8 pass) | failed at fix commit: `warm-site-retirement.unit.test.ts` |
| Tovu | acc6700 → b4e9b0d | 15 | YES | NO (10/15 pass) | failed at fix commit: `agent-daemon-server.session-binding-wiring.unit.test.ts`, `agent-daemon-server.tool-restriction-wiring.unit.test.ts`, `shared-agent-daemon.integration.test.ts`, `agent-daemon-core-isolation.integration.test.ts`, `assistant-daemon-connection.test.ts` |
| Tovu | 27b1db9 → a5236a4 | 4 | PARTIAL (3/4) | NO (3/4 pass) | passed at test commit (not red): `connect-card-state.unit.test.ts`; failed at fix commit: `plugin-export-boundaries.test.ts` |
| Tovu | 8c58cdb → 3d0fa7d | 36 | PARTIAL (33/36) | NO (22/36 pass) | passed at test commit (not red): `shared-daemon-evidence.test.ts`, `daemon-source-roots.unit.test.ts`, `agent-daemon-core-isolation.integration.test.ts`; failed at fix commit: `jini-mcp-peers.test.ts`, `visitor-page-control.recovery.test.ts`, `agent-daemon-remote-tools.integration.test.ts`, `shared-agent-daemon.integration.test.ts`, `site-daemon-callback-wiring.unit.test.ts`, `site-daemon-listener.integration.test.ts`, `agent-daemon-core-deps.unit.test.ts`, `process-root-parity.test.ts`, `assistant-run-finalizer.http-client.unit.test.ts`, `assistant-run-finalizer.reconnect-pin.test.ts`, `assistant-server-federation.integration.test.ts`, `agent-daemon-spawn-env.test.ts`, `daemon-startup-secrets.unit.test.ts`, `warm-site-retirement.unit.test.ts` |
| Jini | b2359bf → b6764eb | 20 | PARTIAL (15/20) | NO (16/20 pass) | passed at test commit (not red): `exclusive-file-lock.unit.test.ts`, `manifest-namespace.unit.test.ts`, `directory-home.test.ts`, `durable-json.test.ts`, `bar-chart.test.tsx`; failed at fix commit: `tool-argument-recovery.test.ts`, `wait.unit.test.ts`, `artifact.integration.test.ts`, `outcome-cancellation.test.ts` |
| Jini | 6d7da80 → 0a86e64 | 1 | YES | YES |  |
| Jini | 7f36e81 → 84acf21 | 29 | YES | NO (27/29 pass) | failed at fix commit: `provider.test.tsx`, `check-plugin-isolation.test.ts` |
| Jini | ca0b8d9 → cffc859 | 2 | YES | YES |  |
| Jini | 545b252 → b2808f7 | 4 | YES | NO (3/4 pass) | failed at fix commit: `supervisor.test.ts` |
| Jini | 5c9c8de → 40a4d2e | 10 | YES | NO (9/10 pass) | failed at fix commit: `run-tool-host.http.test.ts` |
| Jini | e1dbc33 → 7003af8 | 2 | YES | YES |  |
| Jini | 4d906a2 → a6a67f0 | 5 | YES | YES |  |
| Jini | ceef987 → 91fc896 | 1 | YES | YES |  |
| Jini | f59d346 → 6ab2226 | 2 | YES | YES |  |
| Jini | 185f1b0 → 6271be6 | 1 | YES | YES |  |
| Jini | cf19763 → 3763ffe | 14 | PARTIAL (11/14) | NO (13/14 pass) | passed at test commit (not red): `composer-action-hit-targets.test.tsx`, `delegated-local-tools.integration.test.ts`, `tool-argument-recovery.test.ts`; failed at fix commit: `composer-hit-targets.test.mjs` |
| Tovu | b901bc8a0 → bfdbf1be7 | – | NOT RUN | NOT RUN | ran out of time |
| Jini | 78d991e9c → 09a36d561 | 1 | YES | YES |  |
| Tovu | 8529b61a4 → 094813ae7 | – | NOT RUN | NOT RUN | ran out of time |

Per-file logs: `raw/redgreen/<Repo>-<test>-<fix>/{red,green}/`. Most fix-commit failures in Tovu match HEAD failures with the same root causes listed below (`resolveRegisteredPresets` not exported, etc.). The intermediate commits ran against Jini **HEAD** build output, not the Jini of their own time, so drift between the two repos can cause failures there.


## Step 1 — every failing changed test file at HEAD

### Tovu

- **FAIL(1)** `apps/admin/src/components/AssistantDock/__tests__/daemon-starting-label.integration.test.tsx`
  - ✗ clears on activation rejection and rejects the required page-bound send 47ms
  - error: `AssertionError: expected { value: { runId: '' } } to deeply equal { error: ObjectContaining{…} }` at `apps/admin/src/components/AssistantDock/__tests__/daemon-starting-label.integration.test.tsx:165:30`
- **FAIL(1)** `apps/desktop/src/jini-mcp-peers.test.ts`
  - ✗ runtime source imports declare their packages instead of relying on hoisting (6359.422126ms)
  - error: `AssertionError [ERR_ASSERTION]: runtime imports must be declared by the package that loads them` at `apps/desktop/src/jini-mcp-peers.test.ts:130:10`
- **MISSING** `apps/desktop/src/mcp-bridge.integration.test.ts`
  - file deleted at HEAD (listed in diff as removed/renamed) — not runnable
- **MISSING** `apps/desktop/src/mcp-bridge.unit.test.ts`
  - file deleted at HEAD (listed in diff as removed/renamed) — not runnable
- **FAIL(1)** `apps/desktop/src/preload/preload.test.ts`
  - ✗ the ESM preload exposes shared keys, runner and voice and maps methods to fixed contract channels (55.20795ms)
  - error: `AssertionError [ERR_ASSERTION]: a new bridge method needs a case here` at `apps/desktop/src/preload/preload.test.ts:216:10`
- **FAIL(1)** `apps/desktop/src/renderer/app/LoadedSitesStepper.render.test.ts`
  - ✗ Loaded sites: a typed digit saves at once, clamped to 1-5; a cleared field shows the saved value again on leaving it (48.053966ms)
  - error: `TypeError: activeElement$1.attachEvent is not a function` at `apps/desktop/src/renderer/app/LoadedSitesStepper.render.test.ts:94:10`
- **MISSING** `apps/desktop/src/sites-mcp-registration.test.ts`
  - file deleted at HEAD (listed in diff as removed/renamed) — not runnable
- **MISSING** `apps/desktop/src/sites-mcp-server.test.ts`
  - file deleted at HEAD (listed in diff as removed/renamed) — not runnable
- **FAIL(1)** `apps/desktop/src/smoke-native.test.ts`
  - ✗ desktop main's source module graph resolves without the test-only TypeScript remapper (1168.90836ms)
  - error: `AssertionError [ERR_ASSERTION]: Desktop main import graph failed:` at `apps/desktop/src/smoke-native.test.ts:218:10`
- **FAIL(1)** `apps/site-chat/src/__tests__/visitor-page-control.recovery.test.ts`
  - ✗ visitor page actions recover after a dropped stream before the next message is sent (457.8849ms)
  - error: `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:` at `apps/site-chat/src/__tests__/visitor-page-control.recovery.test.ts:45:12`
- **FAIL(1)** `apps/website/src/assistant/__tests__/agent-daemon-port.barrel.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/assistant/__tests__/batch-tool-inputs.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/assistant/__tests__/desktop-mcp-runtime.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/assistant/__tests__/external-mcp-federation-runtime.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/assistant/__tests__/newsletter-draft-discovery.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/assistant/__tests__/plugin-grant-reload.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/assistant/__tests__/plugin-guidance-reload.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/assistant/__tests__/tool-approval-policy.test.ts`
  - ✗ permanent deletes and actions that leave this site refuse without a human confirmation channel (7.827407ms)
  - error: `AssertionError [ERR_ASSERTION]: theme_set_active` at `apps/website/src/assistant/__tests__/tool-approval-policy.test.ts:84:12`
- **FAIL(1)** `apps/website/src/assistant/__tests__/tool-catalog-query.entries.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/assistant/__tests__/tool-catalog-query.test.ts`
  - ✗ describe content_read lists only registered cards and their first authored sentence (4.02369ms)
  - error: `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:` at `apps/website/src/assistant/__tests__/tool-catalog-query.test.ts:84:10`
- **FAIL(1)** `apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/cli/__tests__/unit/export-base-path-notice.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/contracts/headless/__tests__/plugin-export-boundaries.test.ts`
  - ✗ listing installed plugin components depends on a shared host contract, not another plugin family (87.148845ms)
  - error: `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:` at `apps/website/src/contracts/headless/__tests__/plugin-export-boundaries.test.ts:14:10`
- **FAIL(1)** `apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts`
  - ✗ agent_plugin_connect: an already signed-in OAuth row gets the plugin's declared default tools, with no new sign-in (1.648939ms)
  - error: `Error: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.` at `apps/website/src/__tests__/fixtures/site-layout-context.ts:59:149`
- **FAIL(1)** `apps/website/src/features/agent-plugins/__tests__/unit/host-plugin-guidance.unit.test.ts`
  - ✗ Bash leaves delivered frontmatter allowed-tools only; other tools, body text and fenced examples stay byte-identical (7.79351ms)
  - ✗ Markdown rules before another plugin do not hide its refused tool permissions (1.280436ms)
  - ✗ frontmatter with leading YAML comments or blank lines still removes refused tools (0.976567ms)
  - error: `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:` at `apps/website/src/features/agent-plugins/__tests__/unit/host-plugin-guidance.unit.test.ts:131:10`
- **FAIL(1)** `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/features/deployments/static-publish/__tests__/adapter.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/features/deployments/static-publish/__tests__/deploy-public-url.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'` at `apps/website/src/features/deployments/static-publish/__tests__/deploy-public-url.integration.test.ts:46:29`
- **FAIL(1)** `apps/website/src/features/post/__tests__/post.presentation-validation.unit.test.ts`
  - ✗ update: null, empty template and false retain their distinct presentation choices (1.13028ms)
  - error: `TypeError [Error]: Cannot read properties of undefined (reading 'enqueue')` at `apps/website/src/features/post/__tests__/post.presentation-validation.unit.test.ts:29:100`
- **FAIL(1)** `apps/website/src/features/site-backup/__tests__/static-export-themes.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'` at `apps/website/src/features/site-backup/__tests__/static-export-themes.integration.test.ts:75:29`
- **FAIL(1)** `apps/website/src/features/source-control/__tests__/propose-credential-tool.test.ts`
  - ✗ t10 source callback delivers a human token only to its parked call, rejects wrong principals and replay (55.985933ms)
  - error: `TypeError [Error]: res.on is not a function` at `apps/website/src/features/source-control/__tests__/propose-credential-tool.test.ts:54:11`
- **FAIL(1)** `apps/website/src/features/theme/__tests__/theme-files.test.ts`
  - ✗ writeThemeFile replaces an existing target via rename rather than truncating it in place, and leaves no temp file behind (16.467503ms)
  - error: `AssertionError [ERR_ASSERTION]: expected no temp file left behind in the theme folder, found: .trash` at `apps/website/src/features/theme/__tests__/theme-files.test.ts:320:10`
- **FAIL(1)** `apps/website/src/features/theme/__tests__/theme-write-file-built-gate.test.ts`
  - ✗ writing inside a compiled theme's declared sourceDir is still allowed (24.001433ms)
  - ✗ writing a compiled theme's own theme.json is still allowed (19.784707ms)
  - error: `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:` at `apps/website/src/features/theme/__tests__/theme-write-file-built-gate.test.ts:135:10`
- **FAIL(1)** `apps/website/src/server/__tests__/admin-external-mcp-admissions-routes.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/__tests__/assistant-byok-routes.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/__tests__/assistant-proxy-routes.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/__tests__/integration/agent-daemon-outbox-event-loss.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/__tests__/integration/design-c-package-themes-dir-wiring.integration.test.ts`
  - error: `SyntaxError: The requested module '#src/platform/site-dir/index' does not provide an export named 'startLocalSiteWhenRunning'`
- **FAIL(1)** `apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugins-http.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/inbound/admin-http/routes/system/site-shares.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-idle-park.integration.test.ts`
  - ✗ run without conversationId prevents park (152.243449ms)
  - ✗ a terminal run stays busy until its retained attachment cleanup finishes (112.784373ms)
  - error: `Error: The assistant could not start: the request was malformed.` at `apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:124:78`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts`
  - ✗ daemon local tools never load federation clients or the desktop capability (412.784282ms)
  - error: `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:` at `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts:132:10`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-installs-unhandled-rejection-guard.unit.test.ts`
  - ✗ agent-daemon-server.ts calls installUnhandledRejectionGuard() unconditionally at module load, before this process's own first real I/O (3.743965ms)
  - error: `AssertionError [ERR_ASSERTION]: this test's own anchor (the routeDeps line) must still exist verbatim — update the anchor if that line's shape changes` at `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-installs-unhandled-rejection-guard.unit.test.ts:65:10`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-remote-tools.integration.test.ts`
  - ✗ delegation records tool_use and tool_result (10097.225575ms)
  - ✗ cancel aborts the server handler (1.007438ms)
  - ✗ committed write with dropped response dispatches once (0.617012ms)
  - ✗ memory site writes are visible in the server (0.696517ms)
  - ✗ read-only delegation refuses a server write before routing it (0.915743ms)
  - ✗ a dropped remote write remains unknown to the durable gateway and a blind repeat is refused (1.019586ms)
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'` at `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-remote-tools.integration.test.ts:83:31`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.federation-runtime-wiring.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-binding-wiring.unit.test.ts`
  - ✗ runtime: cold and resumed CLI cwd defaults to the site directory (187.789911ms)
  - ✗ runtime: cold and resumed CLI cwd ignores TOVU_AGENT_CWD (owner 2026-10-23) (33.084457ms)
  - ✗ runtime: a new CLI session receives prior conversation context, while a resumed session keeps its compact prompt (27.580027ms)
  - ✗ runtime: first switches, A→B→A repeats and lost sessions select one transcript and isolate conversations (21.272202ms)
  - ✗ runtime: a cold dispatch waits for durable persistence and resumes that exact executor session next turn (24.605001ms)
  - ✗ runtime: concurrent dispatches serialize the lookup and pending write, minting only one session (23.664237ms)
  - error: `ReferenceError [Error]: idlePark is not defined` at `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-binding-wiring.unit.test.ts:114:14`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.site-capabilities-registry-wiring.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.tool-restriction-wiring.unit.test.ts`
  - ✗ catalog identity survives a parser continuation using the pre-existing request resource (50.774637ms)
  - error: `AssertionError [ERR_ASSERTION]: capture the real JSON parser and live-run scope registrations` at `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.tool-restriction-wiring.unit.test.ts:167:10`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-site-tools.unit.test.ts`
  - ✗ the inherited site tool token is removed before any CLI or plugin runtime can inherit it (1118.440248ms)
  - error: `ReferenceError [Error]: toolExecTokenHolder is not defined` at `apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:1:3575`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/assistant-system-overlay.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/inbound/assistant/__tests__/shared-agent-daemon.integration.test.ts`
  - ✗ disposing one site leaves another run streaming and refuses late callbacks (5044.885248ms)
  - ✗ identical upload batches and principal IDs remain scoped to their site (47.396141ms)
  - ✗ withdrawing a site releases its finished-run owner retention timers (36.31554ms)
  - error: `[agent-daemon] run 9f1204a0-1d82-4e6f-9364-e2d60749bb1a failed to start [TypeError: fetch failed] {` at `apps/website/src/server/inbound/assistant/__tests__/shared-agent-daemon.integration.test.ts:132:12`
- **FAIL(1)** `apps/website/src/server/inbound/public-http/middleware/__tests__/site-consent.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/boot/__tests__/plugin-activation-poll-boot.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/boot/__tests__/site-daemon-callback-wiring.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/boot/__tests__/site-daemon-listener.integration.test.ts`
  - ✗ chat can reach authenticated retained state when the site listens on http://192.168.1.20:4200 (202.419271ms)
  - ✗ chat can reach authenticated retained state when the site listens on https://[2001:db8::20]:4200 (53.05338ms)
  - error: `SyntaxError: Expected property name or '}' in JSON at position 1 (line 1 column 2)` at `apps/website/src/server/runtime/boot/__tests__/site-daemon-listener.integration.test.ts:37:16`
- **FAIL(1)** `apps/website/src/server/runtime/composition/__tests__/agent-daemon-core-deps.unit.test.ts`
  - ✗ only the configured database driver loads: postgres (5.534143ms)
  - ✗ a retained resource closes on composition failure and shutdown (6.197071ms)
  - ✗ a slow telemetry drain cannot keep the daemon database client open (3.379344ms)
  - error: `AssertionError [ERR_ASSERTION]: The input did not match the regular expression /shutdown registration failed/. Input:` at `apps/website/src/server/runtime/composition/__tests__/agent-daemon-core-deps.unit.test.ts:69:18`
- **FAIL(1)** `apps/website/src/server/runtime/composition/__tests__/agent-daemon-deps.memory-route-deps.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/__tests__/app.consent-capture.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/__tests__/app.title-rejection.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.pglite.integration.test.ts`
  - error: `SyntaxError: The requested module '#src/platform/site-dir/index' does not provide an export named 'startLocalSiteWhenRunning'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/__tests__/process-root-parity.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/__tests__/static-export-none.integration.test.ts`
  - error: `SyntaxError: The requested module '#src/platform/site-dir/index' does not provide an export named 'startLocalSiteWhenRunning'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/__tests__/tool-catalog-manifest.observability.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/__tests__/web-fetch-own-origin.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/agent-daemon-core-rpc.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-cold-start.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-component-catalog.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-daemon-client.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-run-finalizer.failed-run.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-run-finalizer.http-client.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-run-finalizer.reconnect-pin.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-server-federation.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec-principal.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec.integration.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/lifecycle/__tests__/agent-daemon-spawn-env.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/lifecycle/__tests__/assistant-daemon-connection.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/lifecycle/__tests__/assistant-daemon-demand.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/lifecycle/__tests__/daemon-demand-fetch.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/lifecycle/__tests__/daemon-startup-secrets.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts`
  - ✗ owner: SIGTERM closes its owned databases before exit (14368.083751ms)
  - ✗ owner: SIGINT closes its owned databases before exit (16091.526778ms)
  - ✗ workspace-client: SIGTERM closes its owned databases before exit (17326.679316ms)
  - ✗ workspace-client: SIGINT closes its owned databases before exit (14059.274447ms)
  - error: `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:` at `apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts:70:16`
- **FAIL(1)** `apps/website/src/server/runtime/lifecycle/__tests__/warm-site-retirement.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`
- **FAIL(1)** `apps/website/src/server/runtime/services/__tests__/external-mcp-operations.unit.test.ts`
  - error: `SyntaxError: The requested module './mcp-federation/bootstrap.js' does not provide an export named 'resolveRegisteredPresets'`


### Jini

- **FAIL(1)** `examples/reference-web/e2e/composer-hit-targets.test.mjs`
  - ✗ Send and Stop receive real coordinate clicks beside the effort selector at 320px dock width (2.707949ms)
  - error: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright' imported from /home/user/Jini/examples/reference-web/e2e/composer-hit-targets.test.mjs`
- **FAIL(1)** `packages/mcp/src/server/__tests__/run-tool-host.http.test.ts`
  - ✗ cancellation reaches the delegated handler 10094ms
  - error: `Error: Hook timed out in 10000ms.`
- **FAIL(1)** `packages/mcp/src/server/tools/__tests__/wait.unit.test.ts`
  - ✗ waiting before another generation poll takes the requested time without Bash 5018ms
  - error: `Error: Test timed out in 5000ms.`
- **FAIL(1)** `packages/provider-plugins/src/__tests__/artifact.integration.test.ts`
  - ✗ charts-recharts: packs, installs, loads and admits identical browser-only bytes with both host SDK ABIs outside the workspace 1063ms
  - ✗ charts-echarts: packs, installs, loads and admits identical browser-only bytes with both host SDK ABIs outside the workspace 691ms
  - error: `AssertionError: expected { loaded: false, …(1) } to deeply equal { loaded: true }` at `packages/provider-plugins/src/__tests__/artifact.integration.test.ts:275:41`
- **FAIL(1)** `packages/provider-plugins/src/charts-recharts/__tests__/provider.test.tsx`
  - ✗ Recharts artifact through the neutral UI host and A2UI catalog > preserves the bar-chart wire alias while drawing real SVG 10ms
  - ✗ Recharts artifact through the neutral UI host and A2UI catalog > preserves the line-chart wire alias while drawing real SVG 2ms
  - ✗ Recharts artifact through the neutral UI host and A2UI catalog > preserves the pie-chart wire alias while drawing real SVG 2ms
  - error: `AssertionError: expected [Function RegisteredChart] to be [Function RegisteredChart] // Object.is equality` at `packages/provider-plugins/src/charts-recharts/__tests__/provider.test.tsx:29:29`
- **FAIL(1)** `packages/sidecar/src/__tests__/supervisor.test.ts`
  - ✗ demand already discovering a parking child carries over to its replacement 5009ms
  - error: `Error: Test timed out in 5000ms.`
- **FAIL(1)** `packages/ui/src/features/mcp-ui/__tests__/surfaces/outcome-cancellation.test.ts`
  - ✗ Skip releases a waiting sign-in card through its exchange without opening the sign-in link 87ms
  - error: `Error: expect(received).toHaveTextContent()` at `packages/ui/src/features/mcp-ui/__tests__/surfaces/outcome-cancellation.test.ts:14:36`
- **FAIL(1)** `scripts/__tests__/check-plugin-isolation.test.ts`
  - ✗ plugin package installation isolation > the legacy ui-ux-design package ships only its own payload; a subpath-only plugin has no package 23ms
  - error: `AssertionError: expected [Function] to throw error including 'another plugin\'s payload' but got '@jini-ai/plugin-slide-design: unexpec…'` at `scripts/__tests__/check-plugin-isolation.test.ts:89:8`


Per-file raw output: `raw/head-tovu/`, `raw/head-jini/` (path with `/`→`_`). Result lists: `raw/step1-{tovu,jini}-results.tsv`.


## Step 3 — type checks (no emit): every error

### Jini (touched packages, each package's own `typecheck` script)

| package | exit | errors |
|---|---|---|
| agent-plugins | 0 | 0 |
| agent-runtime | 0 | 0 |
| chat | 2 | 1 |
| cms | 0 | 0 |
| core | 0 | 0 |
| daemon | 0 | 0 |
| desktop-host | 0 | 0 |
| devops | 0 | 0 |
| mcp | 0 | 0 |
| platform | 0 | 0 |
| protocol | 2 | 1 |
| provider-plugins | 2 | 1 |
| sandbox | 0 | 0 |
| sidecar | 0 | 0 |
| ui | 2 | 3 |

- `packages/chat: src/store/__tests__/types.fixture.ts(24,2): error TS2578: Unused '@ts-expect-error' directive.`
- `packages/protocol: src/__tests__/event-log-contract.test.ts(5,50): error TS2554: Expected 1 arguments, but got 0.`
- `packages/provider-plugins: error TS18003: No inputs were found in config file '/home/user/Jini/packages/provider-plugins/tsconfig.charts.json'. Specified 'include' paths were '["src/charts-*"]' and 'exclude' paths were '[]'.`
- `packages/ui: src/features/html-editor/react/components/InteractiveHtmlEditor.tsx(2,8): error TS2882: Cannot find module or type declarations for side-effect import of 'grapesjs/dist/css/grapes.min.css'.`
- `packages/ui: src/react/__tests__/components/TooltipLayer.test.tsx(465,5): error TS2322: Type '(selector: string) => boolean' is not assignable to type '{ <K extends keyof HTMLElementTagNameMap>(selectors: K): this is HTMLElementTagNameMap[K]; <K extends keyof SVGElementTagNameMap>(selectors: K): this is SVGElementTagNameMap[K]; <K extends keyof MathMLElementTagNameMap>(selectors: K): this is MathMLElementTagNameMap[K]; (selectors: string): boolean; }'.`
- `packages/ui: src/react/__tests__/unit/select-popover.unit.test.ts(37,3): error TS2322: Type '(selector: string) => boolean' is not assignable to type '{ <K extends keyof HTMLElementTagNameMap>(selectors: K): this is HTMLElementTagNameMap[K]; <K extends keyof SVGElementTagNameMap>(selectors: K): this is SVGElementTagNameMap[K]; <K extends keyof MathMLElementTagNameMap>(selectors: K): this is MathMLElementTagNameMap[K]; (selectors: string): boolean; }'.`

### Tovu apps/admin `tsc --noEmit`: 1 errors (exit codes: 2)

- `src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx(56,38): error TS2345: Argument of type '{ ready: Promise<{ sessionId: string; bindToken: string; }>; bindToken: () => string; close: Mock<Procedure>; bridgeAccess: { subscribe: () => () => void; respondSuccess: () => Promise<...>; respondError: () => Promise<...>; }; }' is not assignable to parameter of type 'FrontendSessionBridge'.`

### Tovu apps/desktop (`tsconfig.preload.json`, `tsconfig.renderer.json`, `tsconfig.main.json`, `tsconfig.live-verify.json`): 22 errors (exit codes: 0 2 2 0)

- [tsconfig.renderer.json] `src/renderer/app/MainHeader.render.test.ts(54,58): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.`
- [tsconfig.main.json] `src/desktop-agent-service.ts(82,33): error TS2345: Argument of type '{}' is not assignable to parameter of type '{ now: () => number; }'.`
- [tsconfig.main.json] `src/desktop-mcp-http.test.ts(77,22): error TS18046: 'result' is of type 'unknown'.`
- [tsconfig.main.json] `src/desktop-mcp-http.test.ts(90,16): error TS18046: 'initialized' is of type 'unknown'.`
- [tsconfig.main.json] `src/desktop-mcp-http.test.ts(92,20): error TS18046: 'listed' is of type 'unknown'.`
- [tsconfig.main.json] `src/desktop-mcp-http.test.ts(94,16): error TS18046: 'sites' is of type 'unknown'.`
- [tsconfig.main.json] `src/desktop-mcp-http.test.ts(96,16): error TS18046: 'refused' is of type 'unknown'.`
- [tsconfig.main.json] `src/desktop-mcp-http.test.ts(97,16): error TS18046: 'refused' is of type 'unknown'.`
- [tsconfig.main.json] `src/desktop-mcp-http.test.ts(99,16): error TS18046: 'invalid' is of type 'unknown'.`
- [tsconfig.main.json] `src/desktop-mcp-http.test.ts(101,16): error TS18046: 'unknown' is of type 'unknown'.`
- [tsconfig.main.json] `src/main/boot/own-server-boot.test.ts(84,156): error TS2345: Argument of type 'string' is not assignable to parameter of type 'never'.`
- [tsconfig.main.json] `src/main/boot/site-preview-guests.test.ts(22,64): error TS2741: Property 'webContents' is missing in type '{ isDestroyed(): boolean; }' but required in type '{ isDestroyed(): boolean; webContents: { getURL(): string; }; }'.`
- [tsconfig.main.json] `src/main/boot/site-preview-guests.test.ts(22,71): error TS2741: Property 'session' is missing in type 'PreviewGuestContents' but required in type '{ hostWebContents?: unknown; session: object; }'.`
- [tsconfig.main.json] `src/main/boot/site-preview-guests.test.ts(55,58): error TS2353: Object literal may only specify known properties, and 'webContents' does not exist in type '{ isDestroyed(): boolean; }'.`
- [tsconfig.main.json] `src/main/index.ts(399,53): error TS2322: Type 'Dialog' is not assignable to type 'ConsentDialogPort<ConsentWindow>'.`
- [tsconfig.main.json] `src/main/index.ts(493,3): error TS2322: Type 'SitesHomeWindow | null' is not assignable to type 'BrowserWindow | null'.`
- [tsconfig.main.json] `src/main/index.ts(498,95): error TS2740: Type 'SitesHomeWindow' is missing the following properties from type 'BrowserWindow': off, once, addListener, removeListener, and 171 more.`
- [tsconfig.main.json] `src/main/index.ts(500,5): error TS2322: Type '({ window }: { window: { webContents: NativeResultSource; isDestroyed(): boolean; }; }) => () => void' is not assignable to type '(args: { window: SitesHomeWindow; }) => unknown'.`
- [tsconfig.main.json] `src/main/index.ts(503,76): error TS2345: Argument of type 'SitesHomeWindow' is not assignable to parameter of type 'SelftestWindow'.`
- [tsconfig.main.json] `src/main/index.ts(548,36): error TS2488: Type 'SiteSupervisor<OpenSite>' must have a '[Symbol.iterator]()' method that returns an iterator.`
- [tsconfig.main.json] `src/main/updates/product-telemetry-boot.test.ts(289,28): error TS2339: Property 'window' does not exist on type 'never'.`
- [tsconfig.main.json] `../website/src/features/agent-plugins/host-plugin-guidance.ts(139,33): error TS2345: Argument of type 'unknown' is not assignable to parameter of type '{ value: unknown; }'.`

### Tovu root `tsconfig.tests.json`: 29 errors (exit codes: 2)

- `apps/website/src/assistant/__tests__/desktop-mcp-runtime.integration.test.ts(40,23): error TS2339: Property 'ok' does not exist on type 'ToolExecutionResult'.`
- `apps/website/src/assistant/__tests__/desktop-mcp-runtime.integration.test.ts(127,23): error TS2339: Property 'ok' does not exist on type 'ToolExecutionResult'.`
- `apps/website/src/assistant/__tests__/desktop-mcp-runtime.integration.test.ts(145,23): error TS2339: Property 'ok' does not exist on type 'ToolExecutionResult'.`
- `apps/website/src/assistant/external-mcp-federation-runtime.ts(5,35): error TS2459: Module '"./mcp-federation/bootstrap.js"' declares 'resolveRegisteredPresets' locally, but it is not exported.`
- `apps/website/src/assistant/external-mcp-federation-runtime.ts(157,82): error TS7006: Parameter 'connection' implicitly has an 'any' type.`
- `apps/website/src/features/agent-plugins/host-plugin-guidance.ts(139,33): error TS2345: Argument of type 'unknown' is not assignable to parameter of type '{ value: unknown; }'.`
- `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts(1096,3): error TS2322: Type '(input: { outputDir: string; clean?: boolean | undefined; basePath?: string | undefined; }) => Promise<{ outputDir: string; routes: { succeeded: unknown[]; failed: { path: string; kind: string; reason: string; }[]; }; ... 5 more ...; basePathRewriteWarning?: string | undefined; }>' is not assignable to type 'ExportSiteBoundFn'.`
- `apps/website/src/features/deployments/static-publish/__tests__/adapter.unit.test.ts(305,3): error TS2322: Type '(input: { outputDir: string; clean?: boolean | undefined; basePath?: string | undefined; } | { outputDir: string; clean?: boolean | undefined; basePath?: string | undefined; } | { outputDir: string; clean?: boolean | undefined; basePath?: string | undefined; includeThemePreviews?: boolean | undefined; themeId?: stri...' is not assignable to type '((options: { outputDir: string; clean?: boolean | undefined; basePath?: string | undefined; publicUrl?: string | undefined; includeThemePreviews?: boolean | undefined; themeId?: string | undefined; }) => Promise<...>) & ((options: { ...; }) => Promise<...>) & ExportSiteBoundFn & ExportSiteBoundFn'.`
- `apps/website/src/features/deployments/static-publish/__tests__/deploy-public-url.integration.test.ts(106,58): error TS2322: Type 'Promise<{ outputDir: string; routes: { succeeded: unknown[]; failed: { path: string; kind: string; reason: string; }[]; }; assets: { succeeded: unknown[]; failed: { url: string; reason: string; }[]; }; skippedManifestEntries: { reason: string; detail: string; }[]; unreferencedThemeFiles: string[]; droppedReferences:...' is not assignable to type 'Promise<ExportReport>'.`
- `apps/website/src/features/post/__tests__/post.presentation-validation.unit.test.ts(17,24): error TS2741: Property 'outbox' is missing in type '{ repo: InMemoryPostRepo; clock: { nowMs: () => number; }; }' but required in type 'UpdatePostDeps'.`
- `apps/website/src/features/post/__tests__/post.presentation-validation.unit.test.ts(29,119): error TS2741: Property 'outbox' is missing in type '{ repo: InMemoryPostRepo; clock: { nowMs: () => number; }; }' but required in type 'UpdatePostDeps'.`
- `apps/website/src/server/__tests__/integration/agent-daemon-outbox-event-loss.integration.test.ts(44,101): error TS2739: Type 'readonly ToolDescriptor[]' is missing the following properties from type 'Promise<readonly ToolDescriptor[]>': then, catch, finally, [Symbol.toStringTag]`
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-remote-tools.integration.test.ts(112,85): error TS2739: Type 'readonly ToolDescriptor[]' is missing the following properties from type 'Promise<readonly ToolDescriptor[]>': then, catch, finally, [Symbol.toStringTag]`
- `apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-tool-surface.ts(13,44): error TS2345: Argument of type 'NewsletterRouteDeps' is not assignable to parameter of type 'ClockDeps & IdentityDeps & MediaDeps & CredentialsDeps & ContentTaxonomyDeps & CommentsDeps & ... 20 more ... & { ...; }'.`
- `apps/website/src/server/inbound/assistant/__tests__/shared-agent-daemon.integration.test.ts(177,73): error TS2820: Type '"canceled"' is not assignable to type 'TerminalRunOutcome'. Did you mean '"cancelled"'?`
- `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts(1097,50): error TS2820: Type '"canceled"' is not assignable to type 'TerminalRunOutcome'. Did you mean '"cancelled"'?`
- `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts(1300,36): error TS2322: Type '{ isModelSafeToolFailure: (required: { result: ToolExecutionResult; }) => boolean; describeInternalError: (context: DelegatedInternalErrorContext) => string; lifecycle: RunLifecycle; toolExecutor: ToolExecutor; resolvePrincipal: ({ request }: { readonly request: DelegatedToolExecuteRequest; }) => Principal; toolRegi...' is not assignable to type 'DelegatedToolsHttpDeps'.`
- `apps/website/src/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.fixture.ts(26,120): error TS2739: Type 'readonly ToolDescriptor[]' is missing the following properties from type 'Promise<readonly ToolDescriptor[]>': then, catch, finally, [Symbol.toStringTag]`
- `apps/website/src/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts(22,239): error TS2739: Type 'never[]' is missing the following properties from type 'Promise<readonly ToolDescriptor[]>': then, catch, finally, [Symbol.toStringTag]`
- `apps/website/src/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts(63,239): error TS2739: Type 'never[]' is missing the following properties from type 'Promise<readonly ToolDescriptor[]>': then, catch, finally, [Symbol.toStringTag]`
- `apps/website/src/server/runtime/composition/modules/__tests__/assistant-cold-start.unit.test.ts(92,45): error TS7006: Parameter 'input' implicitly has an 'any' type.`
- `apps/website/src/server/runtime/composition/modules/__tests__/assistant-cold-start.unit.test.ts(92,52): error TS7006: Parameter 'init' implicitly has an 'any' type.`
- `apps/website/src/server/runtime/composition/modules/__tests__/assistant-component-catalog.integration.test.ts(32,128): error TS2739: Type 'never[]' is missing the following properties from type 'Promise<readonly ToolDescriptor[]>': then, catch, finally, [Symbol.toStringTag]`
- `apps/website/src/server/runtime/composition/modules/__tests__/assistant-component-catalog.integration.test.ts(77,128): error TS2739: Type 'never[]' is missing the following properties from type 'Promise<readonly ToolDescriptor[]>': then, catch, finally, [Symbol.toStringTag]`
- `apps/website/src/server/runtime/composition/modules/__tests__/assistant-server-federation.integration.test.ts(158,23): error TS2339: Property 'ok' does not exist on type 'ToolExecutionResult'.`
- `apps/website/src/server/runtime/composition/modules/__tests__/assistant-server-federation.integration.test.ts(163,23): error TS2339: Property 'ok' does not exist on type 'ToolExecutionResult'.`
- `apps/website/src/server/runtime/composition/modules/__tests__/assistant-server-federation.integration.test.ts(168,23): error TS2339: Property 'ok' does not exist on type 'ToolExecutionResult'.`
- `apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts(557,10): error TS7053: Element implicitly has an 'any' type because expression of type '"TOVU_TOOL_EXEC_TOKEN"' can't be used to index type '{ TOVU_PG_SOCKET?: string | undefined; TOVU_SITE_DIR: string; TOVU_WORKSPACE: string; TOVU_SITE_CALLBACK_ORIGIN: string | undefined; TOVU_SITE_LISTENER_ORIGIN: string | undefined; TOVU_SITE_PROCESS_CWD: string; }'.`
- `apps/website/src/server/runtime/lifecycle/local-site-host.ts(7,26): error TS2305: Module '"#src/platform/site-dir/index"' has no exported member 'startLocalSiteWhenRunning'.`

## Step 4 — packaging guard (apps/desktop)

- **B-01 `@jini-ai/sidecar`: declared.** `apps/desktop/package.json` has `"@jini-ai/sidecar": "^0.6.17"` (added in this range), and **`apps/desktop/package-lock.json` already includes it** (root `""` deps plus a `node_modules/@jini-ai/sidecar` entry). `npm ci` in apps/desktop succeeded, so **the desktop lockfile does not need updating.**
- Scan of all 123 non-test, non-renderer `apps/desktop/src/**` + main sources for bare imports not in `dependencies`/`optionalDependencies` (`raw/packaging-guard.txt`):
  - `@jini-ai/protocol` in `src/workspace-chat-ipc.ts:22`: **`import type` only**, erased at runtime, so OK.
  - `@jini-ai/devops`, `@electron/asar`, `typescript` (devDependencies) in `asar-verify.ts`, `coverage-floors.ts`, `dist-import-check.ts`, `stage-payload-lib.ts`, `staged-closure-scan.ts`: build/verify tooling (`stage-payload-run.ts`, `verify-package-cli.ts`), not loaded by main/preload. OK.
  - **No missing runtime declaration found for apps/desktop main/preload.**
- **Related gap (outside apps/desktop):** the repo's own guard `apps/desktop/src/jini-mcp-peers.test.ts` ("runtime source imports declare their packages") fails because **root `package.json` does not declare `zod`**, which these files import: `apps/website/src/assistant/daemon-core-protocol.ts`, `server/inbound/assistant/agent-daemon-core-client.ts`, `server/inbound/assistant/agent-daemon-site-tools.ts`, `server/inbound/assistant/agent-plugin-preflight-events.ts`, `server/runtime/composition/modules/assistant-tool-exec.ts`, `server/runtime/lifecycle/assistant-daemon-connection.ts`. Fixing it means adding `zod` to root `dependencies` **and updating the root `package-lock.json`**, which is already out of sync (headline 3).
- `apps/desktop/src/smoke-native.test.ts:218` ("Desktop main import graph failed") fails at HEAD. Its unresolved list is: `../server/runtime/boot/startup-secrets.js (from apps/website/src/assistant/daemon-access.ts:3): ERR_MODULE_NOT_FOUND`, and `apps/desktop/src/main/index.ts: … '../server/runtime/boot/startup-secrets.js' does not provide an export named 'startupSecretEnvironment'`. The `.ts` file exists and does export `startupSecretEnvironment` (`startup-secrets.ts:40`), so this is a `.js`→`.ts` specifier-resolution problem in the desktop main import graph, not a missing dependency declaration. It still means the desktop main graph does not load under the smoke loader.


## ENV-skipped (not counted as failures)

- Jini `examples/reference-web/e2e/composer-hit-targets.test.mjs`: `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'` (browser e2e; Playwright isn't a resolvable dependency of this example in the box). **ENV.** It also explains the "fix commit" failure for pair `cf19763 → 3763ffe`.
- No test in scope needed a live Postgres. (`agent-daemon-core-deps.unit.test.ts` mentions postgres but fails on `AgentSessionStoreError: invalid agent session kernel` from Jini `packages/daemon/src/store/agent-sessions/sql.ts:17`, which is a real failure, not ENV.)
- `apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts` refuses to run against the real HOME ("Test home isolation required") when run as a single file. It probably relies on suite-level HOME isolation, so it is **possibly ENV/runner**. I still count it as FAIL.


## NOT RUN

- red/green pair tovu 30d2786→9063ea4
- red/green pair tovu 98457c9→7c7eb59
- red/green pair tovu 0ef3583→20871ad
- red/green pair tovu 30491f3→9c2fac3
- red/green pair tovu b901bc8a0→bfdbf1be7
- red/green pair tovu 8529b61a4→094813ae7
- Full-repo suites were deliberately not run (out of scope per instructions). No subagents were used.
