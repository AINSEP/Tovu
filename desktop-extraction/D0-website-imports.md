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

## D0c (revision 4, sheet-fixes-2 2026-11-18): split into D0c1, D0c2 (EXECUTABLE) and D0c3 (BLOCKED)
The D0c design run happened (`wave3/desktop-d0c`, draft `designs/D0c.md` on that branch) and was judged in this pass: `designs/D0c.md` here = the draft + the JUDGMENT section, which wins where they differ. The 2026-11-18 run stopped correctly (inventory set changed; no judged design). Revision-2/3 text for D0c1/D0c2 is replaced by this section. The three "decisions fixed now" of revision 2 still hold and are carried into D0c3.
**Base for D0c1/D0c2:** Tovu and Jini `wave3/desktop-d0c` (Tovu faa0b6b7 = refactor/terra ada11733f + `wave2/desktop-d0` (tip 830a98511); Jini ccb901145), or `origin/refactor/terra` once it contains `wave2/desktop-d0`. Check (Tovu root; prints `ok`, else STOP "base"):
```bash
git merge-base --is-ancestor 830a98511 HEAD && test -e packages/contracts/src/host-signals.ts && echo ok
```
COMMON section 1's merge-a/merge-b BASE description is historical for this sheet; COMMON sections 2-7 apply. First commands add `npm --prefix packages/host-shared run build` after the contracts build once the package exists.
**Inventory at the start of D0c1** (replaces the revision-3 row; tolerance: exact set):
```bash
rg -n "from ['\"](\.\./)+website/src/" apps/desktop/src apps/desktop/bin apps/desktop/scripts -g '!*.test.*' | sed -E "s/.*website\/src\/([^'\"]+).*/\1/" | sort | uniq -c
```
Expected 9 modules / 11 lines: `features/agent-plugins/host-signals.ts` 1, `platform/secrets/startup-secrets.ts` 2, `server/runtime/boot/process-error-guards.ts` 1, `server/runtime/composition/jini-routes.ts` 1, `server/runtime/composition/observability-export.ts` 1, `server/runtime/composition/product-events.ts` 1, `server/runtime/composition/product-telemetry.ts` 2, `server/runtime/composition/site-paths.ts` 1, `server/runtime/lifecycle/assistant-daemon-connection.ts` 1. At the start of D0c2: the same minus `process-error-guards`, `product-events`, `jini-routes` (6 modules, 8 lines). At the start of D0c3: 4 modules (`host-signals`, `observability-export`, `product-telemetry`, `site-paths`), 5 lines.

Rules for every D0c1/D0c2 move commit (in addition to COMMON section 4):
- `git mv apps/website/src/<old> packages/host-shared/src/<name>.ts`; the website file is gone (no shell); every importer in the census is repointed in the SAME commit to `@tovu/host-shared/<name>` (`.js`-less specifier, as `@tovu/contracts/<name>` is used today). No `export ... from "@tovu/host-shared/..."` anywhere (COMMON S4).
- In moved code, `_optional: Record<string, never> = {}` / `_required: Record<string, never> = {}` become `_optional = {}` / `_required = {}` (owner args rule); no caller changes.
- Tests that import ONLY the moved module move with it into `packages/host-shared/src/__tests__/` and run with `node --test` like `packages/contracts/src/__tests__/` (check `packages/contracts/package.json`/its CI line for the runner; use the same); tests that also import website modules stay and are repointed.
- Allowed test edits: (a) import specifiers of the moved names; (b) ONLY the specifier string of `t.mock.module(...)` calls and their paired `await import(...)` that target a moved file, changed to `@tovu/host-shared/<name>` (public subpath), mocked names unchanged; (c) COMMENT-ONLY lines that name the old path (repoint to `packages/host-shared/src/<name>.ts`; no code, string or assertion changes); (d) the exact-call-list pins of the build wiring (`development/scripts/__tests__/build-server-portable.test.mjs`: the new `--workspace=@tovu/host-shared` call after contracts, and `calls.length` 3 -> 4). Any other test edit, or a red test after (b): STOP. Seams that a literal "change the specifier" cannot reach (found by the D0c1/D0c2 run, verified by mutation): a helper that builds `new URL(relative, import.meta.url)` (`serve-command-wiring.unit.test.ts` `module()`) takes `import.meta.resolve("@tovu/host-shared/<name>")` instead, which the URL constructor accepts as an absolute URL; a module path inside a child-process script string (`moduleUrl('../x.ts')` in `startup-secrets.unit.test.ts`, `boot-credential-order.pins.unit.test.ts`) becomes the bare `'@tovu/host-shared/<name>'`, resolved from the repo-root cwd. After editing a mock, PROVE it still takes effect: make the stub throw, run the test, expect RED, restore.
- Census hits that are COMMENT-ONLY (a `//` or ` * ` line naming the old path, such as `store.unit.test.ts:185` and `agent-daemon-installs-unhandled-rejection-guard.unit.test.ts:12,18,35`) are NOT a STOP: list them in the report and repoint them in the same commit (edit (c)). Only a hit in code (`import`, `from`, `mock.module`, `moduleUrl(`, `import(`, a path string) outside the lists is a STOP. Child-process script strings (`moduleUrl('../startup-secrets.ts')`) ARE matched by the census pattern (its `\./startup-secrets` alternative); list them with the other hits (`startup-secrets.unit.test.ts:78`, `boot-credential-order.pins.unit.test.ts:70`).
- Debt that follows code: an `error-gate-debt.json` / `size-debt.json` / `src-complexity-debt.json` entry whose `file` is the moved path changes `file` in the move commit (census below prints them).
- Proof: T after each commit (COMMON S1 gate + `npm --prefix apps/desktop run typecheck` + the census'd tests + `npm run check:errors | rg "^(New|Worse):"` prints nothing + `npm run check:size && npm run check:complexity`). P (COMMON section 6 steps 1-3) is OWED for both runs (the packaged main loads all five modules); per DX-OD10 it waits for the `0.7.1-next.N` snapshot that contains the D0b `diagnostics` entries. Report "T passed on linked Jini <sha>; P owed".

## D0c1: `@tovu/host-shared` + `process-error-guards`, `product-events`, `jini-routes` (Tovu only; ~130k; T, P owed) — EXECUTABLE
Census (Tovu root, before step 1; every hit must be in the lists below, else STOP with the extra paths):
```bash
git grep -n -E "(boot/|\./)process-error-guards(\.js|\.ts)?['\"]|(composition/|\./)product-events(\.js|\.ts)?['\"]|(composition/|\./)jini-routes(\.js|\.ts)?['\"]|runtime/boot/process-error-guards\.ts|composition/(product-events|jini-routes)\.ts" -- apps development packages .github
rg -n -l "workspace=@tovu/contracts|packages/contracts" -g '!**/node_modules/**' -g '!**/dist/**' development .github apps/desktop/scripts apps/desktop/electron-builder.yml package.json
```
Expected on faa0b6b7: process-error-guards -> `apps/desktop/src/main/updates/product-telemetry-boot.ts:9`, `cli/commands/serve.ts:18`, `index.ts:26`, `server/inbound/assistant/agent-daemon-server.ts:10`, tests `cli/__tests__/unit/serve-command-wiring.unit.test.ts:234` (mock), `serve-import-cleanup.unit.test.ts:19-20` (mock), `server/runtime/boot/__tests__/fatal-boot-failure.unit.test.ts:5,103`, `__tests__/fixtures/unhandled-rejection-child.ts:1`, `process-error-reporting.unit.test.ts:8`, `development/scripts/error-gate-debt.json:2198` (`file`); product-events -> `product-telemetry.ts:13`, `composition/__tests__/product-telemetry.unit.test.ts:11`, desktop `product-telemetry-ipc.ts:3`; jini-routes -> `server/inbound/assistant/agent-daemon-scope.ts:119`, `__tests__/helpers/daemon-catalog.ts:6`, `composition/__tests__/jini-routes.unit.test.ts:8`, `development/evals/tool-search-caller2-compliance-harness.ts:91`, desktop `desktop-agent.ts:40`. Build-wiring hits of the second command: `development/scripts/build-server.mjs:20` (and `dev-lite.mjs:13`, a watch root list: add `packages/host-shared/src` beside contracts); any other build/CI hit gets the same treatment in step 1.
Steps (each one commit, green alone, pushed):
1. **Scaffold + `process-error-guards`.** NEW `packages/host-shared/{package.json,tsconfig.json}` copied from `packages/contracts` (name `@tovu/host-shared`, `private`, `type: module`, `files: ["dist"]`, `exports: {"./*": {types, default}}`, `build`/`prepare` scripts; tsconfig identical, `__tests__` excluded as in contracts). `dependencies`: `@jini-ai/core`, `@jini-ai/diagnostics` with the SAME ranges as the root `package.json`. Root `package.json`: `"@tovu/host-shared": "*"` beside `@tovu/contracts`; `apps/desktop/package.json`: `"@tovu/host-shared": "file:../../packages/host-shared"` beside line 29. Then `npm install` (root) and `npm install --prefix apps/desktop`; commit `package-lock.json` and `apps/desktop/package-lock.json` in this commit (never hand-edited; this is npm, the Jini pnpm lockfile rule does not apply). `build-server.mjs`: build `@tovu/host-shared` right after contracts. Characterization FIRST (revision-2 decision 3, kept): `process-error-guards` installs are independent (two installs add two listeners; disposing the first leaves exactly one; disposing the second returns to the baseline; the first disposer called twice removes nothing more): add it to the existing `process-error-reporting.unit.test.ts` if it is not already pinned there, run it on the parent RED-under-mutation (make the disposer remove all listeners), then the move. Move the file, repoint the census rows, the error-gate debt `file`, the two mock specifiers (allowed edit b).
2. **`product-events`.** Add `@jini-ai/analytics`, `@jini-ai/daemon` to host-shared `dependencies` (root ranges) + both lockfiles. Move; repoint 3 importers. Its `_options = {}` signatures stay.
3. **`jini-routes`.** Add `@jini-ai/http-kit` (root range) to `dependencies`; `express` is a TYPE-only import: add `@types/express` (root's range) to `devDependencies` only if the package build fails without it. Move; repoint 5 importers; `daemonRouteHost`'s `_optional: Record<string, never>` -> `_optional = {}`. V3: in `jini-routes.unit.test.ts` (moved or repointed), flip `expressCompatible: true` to `false` in the moved file -> a test RED (if none goes red, add a pinning test first; class: route-matching compatibility).
After step 3: inventory = the D0c2 start set; `node apps/desktop/scripts/stage-website-shared.ts` (linked) bundles 6 modules and none of the moved ones (paste its output line).

## D0c2: `startup-secrets` + daemon-connection schemas (Tovu only; ~120k; T, P owed) — EXECUTABLE after D0c1
Census (every hit in the lists, else STOP):
```bash
git grep -n -E "secrets/startup-secrets(\.js|\.ts)?['\"]|\./startup-secrets(\.js|\.ts)?['\"]|lifecycle/assistant-daemon-connection(\.js|\.ts)?['\"]|\./assistant-daemon-connection(\.js|\.ts)?['\"]|platform/secrets/startup-secrets\.ts" -- apps development packages
git grep -n -w -E "daemonSiteRegistration|DaemonSiteRegistration|daemonControlRequest|siteIdleStopReply|daemonEndpoint|daemonConnection|AssistantDaemonConnection" -- apps development | rg -v "^apps/website/src/server/runtime/lifecycle/assistant-daemon-connection\.ts:"
```
Expected on faa0b6b7 (startup-secrets, 19 files): desktop `main/index.ts:115`, `tovu-server.ts:31`; website `assistant/daemon-access.ts:3`, `assistant/desktop-mcp-runtime.ts:4`, `cli/commands/serve.ts:23`, `index.ts:33`, `platform/headless-browser/desktop-render.ts:6`, `server/inbound/admin-http/routes/system/deployment-overview.ts:1`, `server/inbound/assistant/agent-daemon-server.ts:15`, `server/runtime/boot/boot-readiness-gate.ts:10`, `server/runtime/composition/deps.ts:4`, `memory-deps/slices/identity-settings.ts:4`, `server/runtime/lifecycle/daemon-supervisor.ts:22`, `development/evals/tool-search-caller2-compliance-harness.ts:94`; tests `assistant/__tests__/desktop-mcp-runtime.process-env.unit.test.ts:13`, `cli/__tests__/unit/serve-command-wiring.unit.test.ts:238` (mock), `serve-import-cleanup.unit.test.ts:13-14` (mock), `platform/secrets/__tests__/startup-secrets.unit.test.ts` (moves with the file if it imports nothing else), `server/runtime/boot/__tests__/boot-credential-order.pins.unit.test.ts:7,70`, `server/runtime/lifecycle/__tests__/daemon-startup-secrets.unit.test.ts:10`. Daemon-connection (12 files): desktop `desktop-agent-service.ts:19`; website `agent-daemon-scope-control.ts:2`, `modules/{assistant-daemon-client,assistant-tool-access-lowering,assistant-tool-exec,assistant,run-daemon-http-client,run-daemon-origins}.ts`, `lifecycle/{agent-daemon-port,daemon-supervisor,warm-site-retirement}.ts`, test `lifecycle/__tests__/assistant-daemon-connection.test.ts:12`.
Steps:
1. **`startup-secrets`.** Characterization first (in the moved test file): `initializeStartupSecrets()` called twice returns the SAME promise; `startupSecretEnvironment({ env: {} })` contains none of `STARTUP_SECRET_KEYS`; the key list equals today's literal list (installation compatibility surface, lesson 26). V3: return a new promise on the second call -> RED. Add `@jini-ai/sidecar` (root range) + both lockfiles. Move; repoint 19 files (mock specifiers: allowed edit b). Module state: one instance per process in each app, as today (website child and desktop main are different processes). Update the stale path in `apps/desktop/scripts/stage-website-shared.ts:9`'s header comment.
2. **Daemon-connection schemas (split by the dependency graph).** NEW `packages/host-shared/src/daemon-connection.ts` = lines 1-25 of `server/runtime/lifecycle/assistant-daemon-connection.ts` (the file comment, `scopeKey` + its why-comment, the five schemas, the two types) verbatim EXCEPT line 3, `import { currentAgentDaemonToken } from "#src/assistant/daemon-access"`, which serves the module state that stays in the website and must NOT be carried (a `#src/` import in `@tovu/host-shared` is a STOP: `rg -n '#src|website/src' packages/host-shared/src` must show no import), `import { z } from "zod"` (add `zod`, root range, + lockfiles). The website file keeps lines 27-46 (module state, `currentAgentDaemonToken`) and imports `daemonConnection`/`AssistantDaemonConnection` from `@tovu/host-shared/daemon-connection`; it does NOT re-export any schema. Every importer of a schema/type name (second census command) takes it from `@tovu/host-shared/daemon-connection`; importers of the state functions keep the website path. Behaviour pin before the split (in `assistant-daemon-connection.test.ts` or the moved test): `daemonControlRequest.safeParse` rejects an unknown `operation` and an extra key (`.strict()`), `siteIdleStopReply` rejects `{ idle: "yes" }`. V3: drop one `.strict()` -> RED.
After D0c2: inventory = the D0c3 start set (4 modules, 5 lines).

## D0c3: product telemetry, host signals, then delete the staging step — BLOCKED (design; Opus)
**2026-11-18 (design-d0c3):** designed in `designs/D0c3.md` (draft, unjudged) and split into five executable sheets D0c3a-e in `D0c3-sheets.md`, which supersede the text below wherever they differ (the `stage`-script rule below is kept verbatim in D0c3e). Still blocked on the judge (and owner Q1-Q3 for D0c3c/d).
Reason (judgment, `designs/D0c.md`): (1) the desktop main boots product telemetry through the website's `loadProductProviders`, whose dynamic imports reach `features/plugin-runtime/host-binding.ts` and `provider-contracts.ts` (closure not designed; revision-2 decision 1 forbids copying the dynamic imports and moving location-derived roots); (2) `resolveBundledHostSignals` needs `bundled-contribution-sources.ts` + `bundled-catalog.ts` (40 website importers) or a port; (3) `bundledAgentPluginsDir` must take a lazy root thunk. The design must answer: the desktop's provider-loading port (what the desktop passes instead of the website loader, and how its roots `{ installRoot, keepRoots }` are derived for both dev and packaged), whether `observability-export` takes `checkout` as a required value (and the desktop's value in dev vs packaged, with a test per case), the host-signals option (move the three files with their 40 importers vs pass resolved signals from the `tovu serve` child), and the forwarder `apps/desktop/src/product-telemetry-preference.ts:7` (delete, repoint). The revision-2 text for the last commit still applies to D0c3: `verify-staged-closure.ts:39-40` `cpSync(... 'website')` removal + the assertion that `@tovu/host-shared` and `@tovu/contracts` resolve inside the archive, deleting `scripts/stage-website-shared.ts`, dropping ONLY the `&& node scripts/stage-website-shared.ts` half of the `stage` script (the script `stage` stays as `node scripts/stage-payload.ts`: `.github/workflows/desktop-release.yml:87,162,406` run `npm run stage`, so deleting it breaks the release build; the commit's proof is `rg -n "npm run stage" .github apps/desktop/package.json` showing every caller still resolves), the `extraResources` entry (`electron-builder.yml:95-97`), matching `verify-package`/`asar-verify` rules, then P (COMMON 6 steps 1-4, incl. `smoke-native` on macOS and Windows), and copying the deleted script's header paragraph into `apps/desktop/RELEASING.md`.

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
| D0c1 | revision 4: the 9-module set in section D0c (rows 9-16 drifted: `startup-secrets` is now `platform/secrets/`, `jini-routes` is new) | 9 |
| D0c2 | that set minus `process-error-guards`, `product-events`, `jini-routes` | 6 |
| D0c3 (BLOCKED) | `host-signals`, `observability-export`, `product-telemetry`, `site-paths` | 4 |
A different set (not only a different count) is a STOP: report the module names.

## D0e: remove the existing lazy imports of declared dependencies (new in revision 2; outline, design-first)
Owner rule: declared dependencies are imported statically. Round 1 left the 8 existing `await import(` sites to OD-7 with no sheet. They are now a scheduled run **after D0c2** with proof P (it needs one deduplicated `@jini-ai/core` in the staged closure; the "resolve core from the daemon's location" site at `desktop-agent.ts:219-221` is the hard one and is shared with daemon R7/R8). Not yet an executable sheet: its first step is the per-site table (site | what the lazy load works around | the static form | what must be true in the packaged closure). About 150k after that table is reviewed.
**The 8 runtime sites (merge-final, counted on the syntax tree by COMMON block S3; the round-2 regex's other ~20 matches are type-position `import()` and JSDoc, not lazy loads):** `desktop-agent.ts:222` (core from the daemon's location; the `import.meta.resolve`/`createRequire` pair at `:220-221`), `renderer/app-render-harness.ts:45,47,48`, `smoke-bridge.ts:76,77,86`, `smoke-native.ts:257`. Also in scope as the same class: `site-directory-identity.ts:94` (`createRequire(import.meta.url)('node:sqlite')`). The website's `product-telemetry.ts:120-121` dynamic imports stay in the website and are **not** copied into the desktop twin (D0c1 decision 1).
