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

## D0a: pure contracts to `@tovu/contracts` (Tovu only; ~120k; proof T, then **P steps 1-3**)

Revision 3 (judge finding 6): `daemon-exit-codes` and `hosted-sign-in-links` are loaded by the packaged main process at runtime (`main/index.ts`), so this run owes COMMON section 6 P steps 1-3 (stage, package, `verify-staged-closure.ts --asar <archive>` shows `@tovu/contracts` resolving inside the archive). Tovu only, so no Jini snapshot is needed.

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
2. **Headless barrel (revision 3; round-2 text was wrong, Opus review).** `contracts/headless/index.ts:13-14` export the seven names from `./assistant-subagents-policy.js`: that is the **headless definitions file** `contracts/headless/assistant-subagents-policy.ts`, which this run **moves** to `packages/contracts/src/assistant-subagents-policy.ts`. It is not the shell `assistant/assistant-subagents-policy.ts`, which only does `export { assistantCliPermissions } from "../contracts/core/assistant-native-fallbacks.js"` (merge-final, its only line). `assistant-native-fallbacks.ts` does **not** export the seven names; it imports them (`:1`). So:
   - In the commit that moves the definitions file: delete **both** barrel lines and repoint every file that takes one of the seven names through the headless barrel (`#src/contracts/headless/index`, relative `contracts/headless/index.js`, or the `@tovu/headless` alias in `apps/admin`) to **`@tovu/contracts/assistant-subagents-policy`** (the package's `./*` export map already serves it). Direct importers of the definitions file (merge-final: `assistant/daemon-core-protocol.ts:5`, `contracts/core/assistant-native-fallbacks.ts:1`) are repointed in the same commit. No re-export exception is taken (judge findings 15, 16). `apps/admin` already depends on `@tovu/contracts` (`apps/admin/package.json:21`); `apps/admin/src/lib/assistant-subagents.ts:3` is a pre-existing alias line in a real module: repoint it and list it in the report (S4).
   - In the commit that deletes the shell `assistant/assistant-subagents-policy.ts`: its importers (23 files on merge-final, tests included) take `assistantCliPermissions` from **`@tovu/contracts/assistant-native-fallbacks`**.
   - More than 80 files in either census: land the repoint as its own earlier commit, then the move/delete.
   ```bash
   # census A: the seven names through the headless barrel (type and value importers)
   rg -l "\b(AssistantCliCapability|AssistantCliPermissions|ASSISTANT_SUBAGENTS_NAMESPACE|ASSISTANT_SUBAGENTS_KEY|ASSISTANT_CLI_PERMISSIONS_KEY|ASSISTANT_CLI_CAPABILITIES|ASSISTANT_SUBAGENTS_WRITE_REASON)\b" apps packages development -g '*.{ts,tsx,mts,mjs}' \
     | xargs rg -l "contracts/headless(/index)?(\.js)?['\"]|@tovu/headless['\"]"
   # census B: the shell and the definitions file by path
   rg -l "(assistant|headless)/assistant-subagents-policy" apps packages development -g '*.{ts,tsx,mts,mjs}'
   # proof (after the run): all four print nothing
   test -e apps/website/src/assistant/assistant-subagents-policy.ts && echo "shell still exists"
   test -e apps/website/src/contracts/headless/assistant-subagents-policy.ts && echo "definitions file not moved"
   rg -n "(assistant|headless)/assistant-subagents-policy" apps packages development -g '!**/node_modules/**' -g '!**/dist/**'
   rg -n "assistant-subagents-policy" apps/website/src/contracts/headless/index.ts
   ```
   The proof does not search for the bare name `assistant-subagents-policy`: the moved file keeps that name in `packages/contracts`, so that search could never pass. Then website, admin and desktop typecheck.
3. One commit per moved file, each green alone: move, repoint every importer, run website typecheck (`npx tsc -p apps/website --noEmit` or the repo's `npm run typecheck`), `packages/contracts` build, desktop `npm run typecheck && npm test`.
4. Compiler check (lesson 22): `packages/contracts/tsconfig.json` is `module: NodeNext`, no `verbatimModuleSyntax`. The moved files use `.js` relative specifiers already; `#src/...` aliases inside them must become relative `./x.js`. A type-only import that the website compiled away must be written `import type` so the built `.js` has no runtime edge to it.
5. `@tovu/contracts` gains no dependency. If a moved file needs one: **STOP**.

**Tests first.** These files move with their tests (find them: `rg -l "assistant-native-fallbacks|host-signals|hosted-sign-in-links" apps/website/src -g '*.test.*'`); a test that reads the old path as text is updated in the same commit. Add to `apps/desktop/src/dist-import-check.test.ts` (it already exists for this purpose) a case that fails if any desktop file imports `website/src/contracts` or `website/src/assistant/daemon-exit-codes`.

**Security gate on the path (class: URL admission for hosted sign-in links; location: `main/index.ts` navigation wiring).** `isHostedSignInLinkPath` / `isHostedMcpSignInLinkPath` decide which same-origin paths the shell hands to the OS browser. The move must not change either regular expression: the existing tests are run before and after, and one new case per function asserts a near-miss path is refused (a segment longer or shorter by one character).

---

## D0b: generic log helpers to `@jini-ai/diagnostics` (Jini + Tovu pair; ~120k; proof T, then **P steps 1-3** on the published diagnostics snapshot, OD-10)

Revision 3: `console-tee` is used by `tovu-server.ts` in the packaged main process, so P steps 1-3 are owed by this run itself (COMMON section 6), not deferred to D0c2.

Existing-owner search (done): Jini has `redactText` with a `username` option (`diagnostics/src/redaction.ts:58`) but nothing that masks a literal home directory, and no console tee or redacting output sink (`rg -i "consoletee|createRedactedOutputSink|LogBuffer" packages/*/src` is empty).

```
id: D0b-diagnostics-logs
jini (new): packages/diagnostics/src/local-text.ts        <- website platform/server-logs/redact-local-text.ts (27)
            packages/diagnostics/src/console-tee.ts       <- website platform/server-logs/console-tee.ts (126)
            packages/diagnostics/src/log-buffer.ts        <- website platform/server-logs/log-buffer.ts (139)  [only if step 2 says it is generic]
exports: "./local-text", "./console-tee", and "./log-buffer" **in the same commit that moves `log-buffer.ts`** (runtime "node" in jini.entries; real modules). A file is deleted from the website only in the commit that gives every one of its importers (`rg -ln "server-logs/log-buffer" apps development`) a published defining module; if step 2 says the buffer is not generic it does not move, is not deleted, and keeps its website path.
tovu: every importer repointed; the three website files deleted
```
1. Read `diagnostics/package.json` `exports` and `jini.entries` first; follow the naming it already uses. If diagnostics already has a `./node` entry that fits, add there instead of two new keys, and report.
2. `log-buffer.ts`: read it. If it names Tovu concepts (sources, routes, site ids), **only its three types** (`ServerLogBuffer`, `ServerLogLevel`, `ServerLogSource`) are needed by the tee: declare a minimal structural `LogSink` port in `console-tee.ts` and leave `log-buffer.ts` in the website. Do not move Tovu vocabulary into Jini.
3. `redactLocalText({ text }, { homeDir = os.homedir() })` keeps its default (a declared Node built-in, not a lazy import). **Windows:** the function already strips trailing `/` and `\`; add tests with `homeDir: 'C:\\Users\\ada'` and `'C:\\'` (a root home must leave paths alone).
4. Pair: Jini commit, then Tovu commit repointing 11 desktop import lines (4 `src`, 7 `scripts`), 3 console-tee lines, and the website's importers (`rg -l "server-logs/(redact-local-text|console-tee)" apps`: planning count 4 + 3).
5. `apps/desktop/package.json`: `@jini-ai/diagnostics` is already a dependency. `scripts/*.ts` run in development only; `src/smoke-*.ts` ship in the asar: confirm with `rg -n "smoke" electron-builder.yml`.

**Tests first** (Jini, vitest, in `packages/diagnostics/src/__tests__/`): port the website's existing tests for both files unchanged (find: `rg -l "redact-local-text|console-tee" apps/website/src -g '*.test.*'`), then add: (a) sink: an oversized line is dropped whole and the next line still arrives (fails if truncation leaks a prefix: class: secret fragment exposure); (b) sink: a throwing redactor emits the fixed placeholder, never the raw text; (c) tee: a full buffer does not stop the original console call. Each must be shown red under the named mutation before the move commit.

---

## D0c1: telemetry boot shared code to `@tovu/host-shared` — **NOT EXECUTABLE in revision 2: needs the D0c design run first** [needs OD-1]
Round 1 scheduled four module moves "one per green commit" while the import closures were unresolved (judge blocker 5). Verified on merge-b `450ac748`: `server/runtime/composition/product-telemetry.ts` imports `#src/server/runtime/composition/build-release` (`:16`, no move assigned); computes `INSTALL_ROOT` and `KEEP_ROOTS` **from its own file location** (`:32-37`, "five levels above composition/") and resolves provider packages relative to it (`:123-125`); and dynamically imports the host plugin binding and provider contracts (`:120-121`). Moving the file changes those roots (lesson 32) and drags host composition into a shared package. Injecting `resolvePackage` alone does not preserve them.
**Decisions fixed now (the design may not reopen them):**
1. Host composition stays in each app. `loadProductProviders` and everything that reads `import.meta.url`, the plugin host binding or the provider contracts stays in `apps/website` (unchanged) and gets a desktop twin written in `apps/desktop/src/main/updates/` that passes the desktop's own roots. No dynamic import moves (S3), and **the twin does not copy them**: the website's `product-telemetry.ts:120-121` dynamic imports of the host plugin binding and the provider contracts stay in the website only; the desktop twin imports what it needs statically (declared dependencies) or receives it as an argument. A twin that contains `import(` fails S3.
2. Only code with a **closed, location-free closure** moves to `@tovu/host-shared`, and it takes what it used to derive as required arguments: `{ installRoot, keepRoots, release, providers }`.
3. `process-error-guards.ts`: installations are **independent** — the file documents that a second registration is harmless and deliberately not guarded (`:59-63`), each call adds its own listener (`:75-85`) and each disposer removes only its own (`:139-141`). Round 1's "idempotent: two installs, one dispose, back to baseline" would be a behaviour change (judge finding 14). Characterization: two installs add two listeners; disposing the first leaves exactly one; disposing the second returns to the baseline; the first disposer called twice removes nothing more.
**D0c design run (one Opus-class run, about 200k, edits no source; output `desktop-extraction/designs/D0c.md`):**
- per module of rows 9-16: the full import closure to its leaves (`rg -n "^import|import\(" <file>` recursively, every level, `#src/` aliases resolved), each leaf marked PURE / NODE / HOST-COMPOSITION / PRODUCT-POLICY;
- the `import.meta.url` / `__dirname` / `createRequire` inventory of the closure (`rg -n "import\.meta\.url|__dirname|createRequire" <closure files>`), each use with the root it derives and who must supply it after the move;
- per module: MOVES (closure listed, all inside the package after the move) or STAYS + the exact values injected, with the port type;
- the commit list: for each commit the complete import graph of `@tovu/host-shared`, the importers repointed, the tests that move with it and their runner (`node:test` in desktop, the website's runner), manifests + lockfile in the same commit, and for runtime-loaded modules the P steps 1-3 of COMMON section 6;
- the `verify-staged-closure.ts` change of D0c2 (below).
The design is judged before D0c1/D0c2 are dispatched. Estimates after design: D0c1 about 120k, D0c2 about 170k (unchanged order of magnitude; unsupported until the design exists).

## D0c2: daemon schemas, startup secrets, host signals; then delete the staging step (Tovu; ~150k; proof **P**) [needs OD-1, after D0a, D0b, D0c1]

Rows 13 to 16.
- **`startup-secrets.ts` has module state** (`credentials`, `startup`). Today the packaged desktop holds its **own bundled copy** (esbuild inlines it under `Resources/website`), separate from the website child's copy; they are different processes, so that is correct. After the move both apps import one package file; still one instance per process. Test (node:test, desktop): `initializeStartupSecrets` called twice returns the same promise; `startupSecretEnvironment({ env: {} })` never contains a secret key. Class: launch-credential handling; the six key names do not change (they are an installation compatibility surface, lesson 26).
- `assistant-daemon-connection.ts`: desktop needs only the three zod schemas and one type. Split by the dependency graph: the schemas and types go to `@tovu/host-shared/daemon-connection` (`zod` becomes its dependency; both apps already ship zod: verify with `npm ls zod --prefix apps/desktop`); the module-state functions (`setAssistantDaemonConnection`, `delegated...`, `previous...`, `assistantDaemonToken`) **stay in the website** and import the schemas from the package.
- `desktop-host-signals.ts` needs `resolveBundledHostSignals` (reads bundled plugin manifests; imports `./service-ports.js` types and `./bundled-contribution-sources.js`) and `bundledAgentPluginsDir`. Trace both closures first (`rg -n "^import" <file>` recursively, two levels). If the closure is over 400 lines, do **not** move it: pass the resolved host signals to the desktop over the port it already has (`HostSignals` type from D0a) by computing them in the `tovu serve` child, and report this as a design change needing review instead of doing it.
- **The verifier's resource model changes in the same commit as the resource removal (judge finding 6).** `scripts/verify-staged-closure.ts:39-40` unconditionally copies the archive's sibling `website` directory (`cpSync(path.join(path.dirname(archive), 'website'), …)`); once the `website` resource is gone that line throws. The search `website-shared|Resources/website` does not find it (it is a path expression): use `rg -n "'website'|\"website\"" apps/desktop/scripts apps/desktop/electron-builder.yml .github`. In the last commit, together: remove the `cpSync` of `website` and any check that expects it, add the assertion that `@tovu/host-shared` and `@tovu/contracts` resolve from inside the extracted archive, and run COMMON P steps 1-3 with the real archive path.
- Last commit, only when `rg -n "website/src" apps/desktop/src apps/desktop/bin apps/desktop/scripts -g '!*.test.*'` is empty: delete `scripts/stage-website-shared.ts`; `package.json` `stage` becomes `node scripts/stage-payload.ts`; remove the `staging/website-shared -> website` entry from `electron-builder.yml` `extraResources` (planning lines 96 to 98+); remove matching rules in `verify-package`/`asar-verify` (`rg -n "website-shared|Resources/website" apps/desktop .github`). The 13 test files that import website modules for fixtures are listed in the report and left alone unless they import a moved file.

**Packaged proof (P), owed before this is called done:** `@tovu/host-shared` and `@tovu/contracts` must be inside the app's dependency closure (COMMON section 6, P steps 1-3: stage, package, then `node scripts/verify-staged-closure.ts --asar <archive>`; the script refuses to run without the archive), and the release workflow's `build` job must pass `smoke-native` on macOS and Windows: that smoke is the one that failed with `ERR_MODULE_NOT_FOUND` the last time these imports were not staged (see the header of the deleted script; copy that paragraph into `apps/desktop/RELEASING.md`).

---

## D0d: renderer-safe bridge entry in `desktop-host`; unused desktop deps (Jini + Tovu; ~40k; proof T)

**One owner (coordinator decision, 2026-11-16):** this run is the only one that adds `desktop-host` `./bridge`. The notes plan's former D0 sheet no longer builds it; notes `D1` (notes-desktop) lists this run as a prerequisite and consumes the entry.

1. `packages/desktop-host/src/index.ts` (22 lines) re-exports `sidecar.ts` (`node:child_process`), `logging.ts` and `windows-registry.ts` beside `bridge.ts` (180 lines, no imports). Add export key `"./bridge": dist/bridge.js` with `jini.entries` runtime `"universal"`. Do **not** remove anything from the root entry (hosts import `RenderServiceError`, `withRenderTimeout`, `UrlCapturePort` from it: 6 Tovu sites).
2. Test first (`src/__tests__/bridge-entry.test.ts`): read the built `dist/bridge.js` import graph (or `bridge.ts` source) and assert it has no `node:` specifier and no relative import. Red when someone adds one.
3. Tovu: `apps/desktop/package.json` declares `@mcp-ui/client` and `@cfworker/json-schema` with **0** import sites in `src`, `scripts`, `bin` (verified by `rg`). Before removing: `rg -n "mcp-ui/client|cfworker" apps/desktop/src/stage-payload-lib.ts apps/desktop/electron-builder.yml apps/website/package.json` and `npm ls @mcp-ui/client --prefix apps/desktop`. If the staged payload or a Jini package's peer range needs them, **keep and report why**; otherwise remove both, run `npm install --prefix apps/desktop`, and commit the regenerated `apps/desktop/package-lock.json` **in the same commit** as the manifest change (COMMON section 5: the landing unit includes the lockfile; nothing is left for a coordinator). Proof: T here; the packaged check of the smaller dependency set rides on D0c2's P run.

## Starting inventory per run (round-1 judge finding 18: one fixed 16-module table cannot be every run's start)
Each run's Inventory block is this command, and its expected result is the table's rows **minus what earlier runs removed**:
`rg -n "from ['\"](\.\./)+website/src/" apps/desktop/src apps/desktop/bin apps/desktop/scripts -g '!*.test.*' | sed -E "s/.*website\/src\/([^'\"]+).*/\1/" | sort | uniq -c`
| Run | Website modules still imported at its start | Count |
|---|---|---|
| D0a | rows 1-16 | 16 |
| D0b | rows 7-16 (rows 1-6 went to `@tovu/contracts`; the headless barrel no longer names the shell) | 10 |
| D0c1 | rows 9-16 (rows 7-8 went to `@jini-ai/diagnostics`; `log-buffer` only if D0b's report says it moved) | 8 |
| D0c2 | rows 13-16 | 4 |
A different set (not only a different count) is a STOP: report the module names.

## D0e: remove the existing lazy imports of declared dependencies (new in revision 2; outline, design-first)
Owner rule: declared dependencies are imported statically. Round 1 left the 8 existing `await import(` sites to OD-7 with no sheet. They are now a scheduled run **after D0c2** with proof P (it needs one deduplicated `@jini-ai/core` in the staged closure; the "resolve core from the daemon's location" site at `desktop-agent.ts:219-221` is the hard one and is shared with daemon R7/R8). Not yet an executable sheet: its first step is the per-site table (site | what the lazy load works around | the static form | what must be true in the packaged closure). About 150k after that table is reviewed.
**The 8 runtime sites (merge-final, counted on the syntax tree by COMMON block S3; the round-2 regex's other ~20 matches are type-position `import()` and JSDoc, not lazy loads):** `desktop-agent.ts:222` (core from the daemon's location; the `import.meta.resolve`/`createRequire` pair at `:220-221`), `renderer/app-render-harness.ts:45,47,48`, `smoke-bridge.ts:76,77,86`, `smoke-native.ts:257`. Also in scope as the same class: `site-directory-identity.ts:94` (`createRequire(import.meta.url)('node:sqlite')`). The website's `product-telemetry.ts:120-121` dynamic imports stay in the website and are **not** copied into the desktop twin (D0c1 decision 1).
