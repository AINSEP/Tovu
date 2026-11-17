# D0: cut the desktop's relative imports into `apps/website/src` (5 runs)

Inherits `COMMON.md`. This is survey step 0. The survey called it cheap; it is not: 16 website modules are reached through **36 import lines in 22 desktop files** (15 under `src`, 7 under `scripts`; plus 13 test files), and only 5 of the 16 are pure contracts. The other 11 are Node code with their own website dependencies, and packaging bundles a **second copy** of each into `Resources/website` (`scripts/stage-website-shared.ts`, esbuild, dependencies inlined).

## Inventory (run first; tolerance: exact)

```
cd apps/desktop
rg -n "['\"](\.\./)+website/src/[^'\"]+" src scripts bin -g '!*.test.*' -o --no-filename | sed -E "s/.*website\/src\///; s/['\"]//" | sort | uniq -c
rg -l "['\"](\.\./)+website/" src scripts -g '*.test.*' | wc -l          # 13
```
Expected (module: desktop import lines):

| # | Website module (lines) | Desktop importers | Kind | Sheet |
|---|---|---|---|---|
| 1 | `assistant/daemon-exit-codes.ts` (20) | `main/index.ts`, `desktop-agent-service.ts`, `project-ipc.ts`, `project-ipc.site-lifecycle.ts`, `tovu-server.ts` | constants | D0a |
| 2 | `contracts/core/hosted-sign-in-links.ts` (10) | `main/index.ts` | pure functions | D0a |
| 3 | `contracts/core/host-signals.ts` (93, no imports) | `desktop-agent.ts`, `desktop-host-signals.ts` (types) | types + pure rules | D0a |
| 4 | `contracts/core/assistant-native-fallbacks.ts` (139) | `desktop-agent.ts` | pure rules; imports #3 and `contracts/headless/assistant-subagents-policy.ts` (19, no imports) | D0a |
| 5 | `assistant/assistant-subagents-policy.ts` (1: an existing re-export shell of #4) | `desktop-agent.ts` | shell | D0a (delete) |
| 6 | `contracts/headless/index.ts` (21, barrel, 633 website importers) | `desktop-agent.ts`, `desktop-chat-main.ts` (type `AssistantCliPermissions` only) | type | D0a (repoint to the defining file; the barrel does not move) |
| 7 | `platform/server-logs/redact-local-text.ts` (27) | 4 src + 7 scripts | generic | D0b |
| 8 | `platform/server-logs/console-tee.ts` (126; types from `log-buffer.ts`, 139) | `tovu-server.ts`, `tovu-server.start.ts`, `desktop-agent-service.ts` | generic (its own header says so) | D0b |
| 9 | `server/runtime/boot/process-error-guards.ts` (164) | `main/updates/product-telemetry-boot.ts` | Tovu Node | D0c1 |
| 10 | `server/runtime/composition/observability-export.ts` (47; imports `#src/contracts/core/runtime-mode`, `#src/platform/site-dir/product-root`) | same file | Tovu Node | D0c1 |
| 11 | `server/runtime/composition/product-telemetry.ts` (266; uses `createRequire(import.meta.url).resolve`) | `product-telemetry.ts`, `product-telemetry-preference.ts` | Tovu Node | D0c1 |
| 12 | `server/runtime/composition/product-events.ts` (107) | `product-telemetry-ipc.ts` | Tovu rules | D0c1 |
| 13 | `server/runtime/boot/startup-secrets.ts` (43; **module state**; imports `@jini-ai/sidecar/supervisor/node`) | `main/index.ts`, `tovu-server.ts` | Tovu Node | D0c2 |
| 14 | `server/runtime/lifecycle/assistant-daemon-connection.ts` (46; `zod`; **module state**; imports `#src/assistant/daemon-access`) | `desktop-agent-service.ts` (3 schemas + 1 type) | Tovu schemas | D0c2 |
| 15 | `features/agent-plugins/host-signals.ts` (84; reads bundled plugin manifests) | `desktop-host-signals.ts` | Tovu Node | D0c2 |
| 16 | `server/runtime/composition/site-paths.ts` (221) | `desktop-host-signals.ts` (`bundledAgentPluginsDir`, itself re-exported from `#src/platform/site-dir/product-root`) | Tovu Node | D0c2 |

Not verified: the import closure of rows 9 to 16 beyond their first level.

## Owner decision this sheet needs (OD-1, INDEX)

Rows 9 to 16 are Tovu product code that two Tovu apps share and that runs in Node. `@tovu/contracts` is types and pure rules only. **Recommended:** one new **Tovu** workspace package `packages/host-shared` (`@tovu/host-shared`, built with `tsc` like `packages/contracts`, a `file:` dependency of both apps). This is not a Jini `desktop-*` package, so the owner rule is not touched, but it is a new package and needs a yes. D0a, D0b and D0d do not wait for the answer; D0c1 and D0c2 do.

---

## D0a: pure contracts to `@tovu/contracts` (Tovu only; ~110k; proof T)

```
id: D0a-contracts
moves (git mv; old path deleted; no shell):
  apps/website/src/assistant/daemon-exit-codes.ts                 -> packages/contracts/src/daemon-exit-codes.ts
  apps/website/src/contracts/core/hosted-sign-in-links.ts         -> packages/contracts/src/hosted-sign-in-links.ts
  apps/website/src/contracts/core/host-signals.ts                 -> packages/contracts/src/host-signals.ts
  apps/website/src/contracts/headless/assistant-subagents-policy.ts -> packages/contracts/src/assistant-subagents-policy.ts
  apps/website/src/contracts/core/assistant-native-fallbacks.ts   -> packages/contracts/src/assistant-native-fallbacks.ts
delete: apps/website/src/assistant/assistant-subagents-policy.ts (shell; its 8 importers go to the package)
```
1. **Inventory every importer first** (website, admin, site-chat, development, desktop, tests): `rg -l "contracts/core/host-signals|contracts/core/assistant-native-fallbacks|assistant/daemon-exit-codes|hosted-sign-in-links|assistant-subagents-policy" apps development packages -g '*.{ts,tsx,mts,mjs}'`. Planning count: 45 non-test files outside desktop, plus desktop's 9 and their tests. More than 80 files in total: split after step 3 and report.
2. `contracts/headless/index.ts:14` re-exports names from `./assistant-subagents-policy.js`. That barrel stays (633 importers; out of scope): its line 14 becomes an import-and-export from `@tovu/contracts/assistant-subagents-policy`. **This is the one allowed re-export line**, because the barrel already exists; say so in the report (S4 will flag it).
3. One commit per moved file, each green alone: move, repoint every importer, run website typecheck (`npx tsc -p apps/website --noEmit` or the repo's `npm run typecheck`), `packages/contracts` build, desktop `npm run typecheck && npm test`.
4. Compiler check (lesson 22): `packages/contracts/tsconfig.json` is `module: NodeNext`, no `verbatimModuleSyntax`. The moved files use `.js` relative specifiers already; `#src/...` aliases inside them must become relative `./x.js`. A type-only import that the website compiled away must be written `import type` so the built `.js` has no runtime edge to it.
5. `@tovu/contracts` gains no dependency. If a moved file needs one: **STOP**.

**Tests first.** These files move with their tests (find them: `rg -l "assistant-native-fallbacks|host-signals|hosted-sign-in-links" apps/website/src -g '*.test.*'`); a test that reads the old path as text is updated in the same commit. Add to `apps/desktop/src/dist-import-check.test.ts` (it already exists for this purpose) a case that fails if any desktop file imports `website/src/contracts` or `website/src/assistant/daemon-exit-codes`.

**Security gate on the path (class: URL admission for hosted sign-in links; location: `main/index.ts` navigation wiring).** `isHostedSignInLinkPath` / `isHostedMcpSignInLinkPath` decide which same-origin paths the shell hands to the OS browser. The move must not change either regular expression: the existing tests are run before and after, and one new case per function asserts a near-miss path is refused (a segment longer or shorter by one character).

---

## D0b: generic log helpers to `@jini-ai/diagnostics` (Jini + Tovu pair; ~120k; proof T, then P with D0c2)

Existing-owner search (done): Jini has `redactText` with a `username` option (`diagnostics/src/redaction.ts:58`) but nothing that masks a literal home directory, and no console tee or redacting output sink (`rg -i "consoletee|createRedactedOutputSink|LogBuffer" packages/*/src` is empty).

```
id: D0b-diagnostics-logs
jini (new): packages/diagnostics/src/local-text.ts        <- website platform/server-logs/redact-local-text.ts (27)
            packages/diagnostics/src/console-tee.ts       <- website platform/server-logs/console-tee.ts (126)
            packages/diagnostics/src/log-buffer.ts        <- website platform/server-logs/log-buffer.ts (139)  [only if step 2 says it is generic]
exports: "./local-text", "./console-tee" (runtime "node" in jini.entries; real modules)
tovu: every importer repointed; the three website files deleted
```
1. Read `diagnostics/package.json` `exports` and `jini.entries` first; follow the naming it already uses. If diagnostics already has a `./node` entry that fits, add there instead of two new keys, and report.
2. `log-buffer.ts`: read it. If it names Tovu concepts (sources, routes, site ids), **only its three types** (`ServerLogBuffer`, `ServerLogLevel`, `ServerLogSource`) are needed by the tee: declare a minimal structural `LogSink` port in `console-tee.ts` and leave `log-buffer.ts` in the website. Do not move Tovu vocabulary into Jini.
3. `redactLocalText({ text }, { homeDir = os.homedir() })` keeps its default (a declared Node built-in, not a lazy import). **Windows:** the function already strips trailing `/` and `\`; add tests with `homeDir: 'C:\\Users\\ada'` and `'C:\\'` (a root home must leave paths alone).
4. Pair: Jini commit, then Tovu commit repointing 11 desktop import lines (4 `src`, 7 `scripts`), 3 console-tee lines, and the website's importers (`rg -l "server-logs/(redact-local-text|console-tee)" apps`: planning count 4 + 3).
5. `apps/desktop/package.json`: `@jini-ai/diagnostics` is already a dependency. `scripts/*.ts` run in development only; `src/smoke-*.ts` ship in the asar: confirm with `rg -n "smoke" electron-builder.yml`.

**Tests first** (Jini, vitest, in `packages/diagnostics/src/__tests__/`): port the website's existing tests for both files unchanged (find: `rg -l "redact-local-text|console-tee" apps/website/src -g '*.test.*'`), then add: (a) sink: an oversized line is dropped whole and the next line still arrives (fails if truncation leaks a prefix: class: secret fragment exposure); (b) sink: a throwing redactor emits the fixed placeholder, never the raw text; (c) tee: a full buffer does not stop the original console call. Each must be shown red under the named mutation before the move commit.

---

## D0c1: telemetry boot shared code to `@tovu/host-shared` (Tovu; ~120k; proof T) [needs OD-1]

Rows 9 to 12. Create `packages/host-shared` (copy `packages/contracts`' `package.json` shape: `exports: { "./*": ... }`, `build: tsc`), add it as `file:../../packages/host-shared` to `apps/website` and `apps/desktop`, and to the root build order where `packages/contracts` is built (`rg -n "packages/contracts" package.json apps/*/package.json .github/workflows`: every hit gets a sibling line; planning saw `predev`/`prebuild` in `apps/desktop/package.json` and both desktop workflows).

Traps, each with a test:
- **`createRequire(import.meta.url).resolve`** (`product-telemetry.ts:117`, default of `loadProductProviders`): after the move it resolves from `packages/host-shared`, not from the website. Make `resolvePackage` a **required** argument of `loadProductProviders` and pass it from each app's composition (`createRequire(import.meta.url).resolve` written in the app file). Test: with a fake resolver, the provider path comes from the resolver given, and the function throws the typed "provider package not found" error when the resolver throws. This is not a lazy import: it resolves optional provider plugins by name, as today.
- `observability-export.ts` imports `#src/contracts/core/runtime-mode` and `#src/platform/site-dir/product-root`. If either drags more than two further files, **stop moving this file**: instead change `resolveTovuObservabilityExport` to take those two values as arguments and move only that function. Report which.
- `process-error-guards.ts` installs process-level listeners: its installers return a disposer today; keep that, and keep them idempotent per process (test: two installs, one dispose, listener count back to the baseline).

Commits: (1) empty package + build wiring, green; (2..5) one module each with its tests and every importer.

## D0c2: daemon schemas, startup secrets, host signals; then delete the staging step (Tovu; ~150k; proof **P**) [needs OD-1, after D0a, D0b, D0c1]

Rows 13 to 16.
- **`startup-secrets.ts` has module state** (`credentials`, `startup`). Today the packaged desktop holds its **own bundled copy** (esbuild inlines it under `Resources/website`), separate from the website child's copy; they are different processes, so that is correct. After the move both apps import one package file; still one instance per process. Test (node:test, desktop): `initializeStartupSecrets` called twice returns the same promise; `startupSecretEnvironment({ env: {} })` never contains a secret key. Class: launch-credential handling; the six key names do not change (they are an installation compatibility surface, lesson 26).
- `assistant-daemon-connection.ts`: desktop needs only the three zod schemas and one type. Split by the dependency graph: the schemas and types go to `@tovu/host-shared/daemon-connection` (`zod` becomes its dependency; both apps already ship zod: verify with `npm ls zod --prefix apps/desktop`); the module-state functions (`setAssistantDaemonConnection`, `delegated...`, `previous...`, `assistantDaemonToken`) **stay in the website** and import the schemas from the package.
- `desktop-host-signals.ts` needs `resolveBundledHostSignals` (reads bundled plugin manifests; imports `./service-ports.js` types and `./bundled-contribution-sources.js`) and `bundledAgentPluginsDir`. Trace both closures first (`rg -n "^import" <file>` recursively, two levels). If the closure is over 400 lines, do **not** move it: pass the resolved host signals to the desktop over the port it already has (`HostSignals` type from D0a) by computing them in the `tovu serve` child, and report this as a design change needing review instead of doing it.
- Last commit, only when `rg -n "website/src" apps/desktop/src apps/desktop/bin apps/desktop/scripts -g '!*.test.*'` is empty: delete `scripts/stage-website-shared.ts`; `package.json` `stage` becomes `node scripts/stage-payload.ts`; remove the `staging/website-shared -> website` entry from `electron-builder.yml` `extraResources` (planning lines 96 to 98+); remove matching rules in `verify-package`/`asar-verify` (`rg -n "website-shared|Resources/website" apps/desktop .github`). The 13 test files that import website modules for fixtures are listed in the report and left alone unless they import a moved file.

**Packaged proof (P), owed before this is called done:** `@tovu/host-shared` and `@tovu/contracts` must be inside the app's dependency closure (`npm run stage && node scripts/verify-staged-closure.ts`), and the release workflow's `build` job must pass `smoke-native` on macOS and Windows: that smoke is the one that failed with `ERR_MODULE_NOT_FOUND` the last time these imports were not staged (see the header of the deleted script; copy that paragraph into `apps/desktop/RELEASING.md`).

---

## D0d: renderer-safe bridge entry in `desktop-host`; unused desktop deps (Jini + Tovu; ~40k; proof T)

1. `packages/desktop-host/src/index.ts` (22 lines) re-exports `sidecar.ts` (`node:child_process`), `logging.ts` and `windows-registry.ts` beside `bridge.ts` (180 lines, no imports). Add export key `"./bridge": dist/bridge.js` with `jini.entries` runtime `"universal"`. Do **not** remove anything from the root entry (hosts import `RenderServiceError`, `withRenderTimeout`, `UrlCapturePort` from it: 6 Tovu sites).
2. Test first (`src/__tests__/bridge-entry.test.ts`): read the built `dist/bridge.js` import graph (or `bridge.ts` source) and assert it has no `node:` specifier and no relative import. Red when someone adds one.
3. Tovu: `apps/desktop/package.json` declares `@mcp-ui/client` and `@cfworker/json-schema` with **0** import sites in `src`, `scripts`, `bin` (verified by `rg`). Before removing: `rg -n "mcp-ui/client|cfworker" apps/desktop/src/stage-payload-lib.ts apps/desktop/electron-builder.yml apps/website/package.json` and `npm ls @mcp-ui/client --prefix apps/desktop`. If the staged payload or a Jini package's peer range needs them, **keep and report why**; otherwise remove both, run `npm install --prefix apps/desktop`, report the lock diff for the coordinator. Proof P rides on D0c2's packaged run.
