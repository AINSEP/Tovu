# D0c3 sheets: D0c3a-e (design `designs/D0c3.md`; written 2026-11-18 by design-d0c3, UNJUDGED)

Five Tovu-only runs, **serial** in this order (each edits `package.json`, both lockfiles and host-shared; D0c3b and D0c3d also edit `apps/desktop/src/main/index.ts`): **a -> b -> c -> d -> e**. Each is green alone. Budget per run is stated; none exceeds 250k. Read COMMON.md sections 2-7 first: they apply (S1 gate, S2-S12, landing unit with lockfiles, proof levels, report). Where this file is more specific, it wins.

| Sheet | Moves | Budget | Proof | Prerequisite |
|---|---|---|---|---|
| D0c3a | host signals: `bundled-plugin-sources` (+ `RETIRED_BUNDLED_AGENT_PLUGINS`), `host-signals`, the lazy `bundledAgentPluginsDir` formula | 150k | T; P owed (with e) | D0c2 (`09669849`) on the base |
| D0c3b | `runtime-mode` -> `@tovu/contracts`; `observability-export` -> host-shared, `checkout` required | 140k | T; P owed | D0c3a |
| D0c3c | plugin-host policy split: `plugin-export`, `extension-capability-vocabulary`, `system-content-types`, `declarative-content-types`, `provider-contracts`, `createPluginHostPolicy`/`createPluginModuleImporter` | 200k | T | D0c3b; owner Q2 |
| D0c3d | product telemetry: `loadCatalogProviders`, `startProductTelemetry`, consent reader; website + desktop bindings; forwarder deleted | 220k | T; P owed | D0c3c; owner Q1, Q3 |
| D0c3e | staging-step deletion + verifier + RELEASING.md, then **P** steps 1-4 | 120k + CI | **P** | D0c3d; Jini `0.7.1-next.N` snapshot (DX-OD10, after 2026-11-19); Electron on macOS and Windows (CI) |

## COMMON-1. Base and setup (every sheet)
Base: Tovu `origin/wave3/desktop-d0c` (a7ebde50 or later) or the branch the previous D0c3 sheet pushed; Jini `origin/wave3/desktop-d0c` (ccb90114). Branches: `wip/desktop-x/d0c3<x>` and `desktop-x/d0c3<x>` (COMMON S1). `P=<this plan checkout>` (for `desktop-extraction/tools/*.mjs`).
```bash
set -euo pipefail
export PATH="$HOME/.local/node24/bin:$PATH"; node -v | grep -q '^v24\.'           # Node 24, else STOP "node"
(cd ../Jini && pnpm install --frozen-lockfile && pnpm --no-bail -r build)
npm ci --ignore-scripts && npm ci --ignore-scripts --prefix apps/desktop             # plain npm ci fails at host-shared's prepare on 0.7.0 pins (d0c-verify-fix obs. 1)
JINI_PACKAGES_DIR="$(cd ../Jini && pwd)/packages" node development/scripts/link-jini.mjs
for p in contracts host-shared sdk; do npm --prefix packages/$p run build; done
B=$(git rev-parse HEAD); echo "B=$B"
```
Prerequisite check per sheet (prints `ok`, else STOP "base"): see the sheet's `PRE` block. Lockfiles: regenerate only with `npx npm@11.12.1 install --package-lock-only` (root) and the same with `--prefix apps/desktop` (the bundled npm 11.6.2 rewrites ~190 unrelated lines: d0c-desktop-2 report); commit both in the commit that changes a manifest.

## COMMON-2. Rules for every move commit (D0c1/D0c2 rules, restated)
- `git mv` the file; the old file is gone; every importer in the census is repointed in the SAME commit to `@tovu/host-shared/<name>` (or `@tovu/contracts/<name>`); no `export ... from` shell anywhere new (S4). Pre-existing alias lines that are only repointed are listed in the report (`lifecycle.ts:52`, website `product-telemetry.ts:19`).
- Allowed test edits, ONLY: (a) import specifiers of moved names; (b) the specifier string of `t.mock.module(...)` + its paired `await import(...)` targeting a moved file, changed to the public subpath, then the mutation proof (make the stub throw, expect RED, restore); (c) comment-only path text; (d) the exact test edits a sheet step names (each with the value proof it states). Anything else, or a red test after (a)-(c): STOP.
- Debt follows code: an `error-gate-debt.json`/`size-debt.json`/`src-complexity-debt.json` `file` key of a moved file changes in the move commit; a `check-architecture.baseline.json` edge whose target left `apps/website/src` is DELETED (only deletion).
- Why-comments move (S6 per moved file; `npm run check:why-comments` prints no new lost block).
- A `#src/` or website import inside `packages/host-shared/src` or `packages/contracts/src` is a STOP (gate G-SRC).

## COMMON-3. Gates (fail closed). Write once per run, prove each with its planted failure, then run on every lane commit
```bash
D0C3="${TMPDIR:-/tmp}/d0c3-gates.sh"
cat > "$D0C3" <<'GATES_EOF'
#!/usr/bin/env bash
# D0c3 gates. Every check either exits non-zero or prints nothing. No '|| echo', no '! cmd' (a leading '!' never trips
# errexit), no pipeline whose first command may fail silently (pipefail + explicit rg status handling).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
: "${P:?set P to the plan checkout}"; : "${EXPECT:?set EXPECT to the expected-inventory file}"
OUT="$(mktemp -d)"; trap 'rm -rf "$OUT"' EXIT
rgq() { local s=0; rg "$@" > "$OUT/rg" || s=$?; [ "$s" -le 1 ] || { echo "G: rg failed ($s)"; exit "$s"; }; return 0; }

# G-INV: desktop -> website relative imports equal the sheet's expected set exactly (module and count).
rgq -n "from ['\"](\.\./)+website/src/" apps/desktop/src apps/desktop/bin apps/desktop/scripts -g '!*.test.*'
sed -E "s/.*website\/src\/([^'\"]+).*/\1/" "$OUT/rg" | sort | uniq -c > "$OUT/inv"
diff -u "$EXPECT" "$OUT/inv"

# G-SRC: no website import from the shared packages.
rgq -n "^\s*(import|export)\b[^;]*['\"](#src/|(\.\./)+[^'\"]*website/src/)" packages/host-shared/src packages/contracts/src
if [ -s "$OUT/rg" ]; then cat "$OUT/rg"; echo "G-SRC: shared package imports the website"; exit 1; fi

# G-DEPS: every runtime external of host-shared is installed for the desktop (app.asar gets only what the desktop declares).
rg --files packages/host-shared/src -g '*.ts' -g '!**/__tests__/**' > "$OUT/files"     # no process substitution: its failure would be ignored
mapfile -t FILES < "$OUT/files"; [ "${#FILES[@]}" -gt 0 ] || { echo "G-DEPS: no host-shared sources found"; exit 1; }
node "$P/desktop-extraction/tools/runtime-externals.mjs" "${FILES[@]}" > "$OUT/ext"
node -e '
const lock = require("./apps/desktop/package-lock.json"); const want = require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean);
const missing = want.filter(p => !lock.packages["node_modules/" + p]);
if (missing.length) { console.log("G-DEPS missing in apps/desktop: " + missing.join(" ")); process.exit(1); }' "$OUT/ext"
echo "d0c3-gates: ok"
GATES_EOF
# Planted-failure self-test (all three must print "planted: failed as expected"; any "PASSED" is a STOP "gate").
plant() { local name=$1; shift; local s=0; "$@" > /dev/null 2>&1 || s=$?; if [ "$s" -ne 0 ]; then echo "planted $name: failed as expected"; else echo "planted $name: PASSED (gate is open)"; exit 1; fi; }
printf '      9 planted/module.ts\n' > "$EXPECT.planted"; plant G-INV env EXPECT="$EXPECT.planted" bash "$D0C3"; rm "$EXPECT.planted"
printf 'import { x } from "#src/planted";\nexport { x };\n' > packages/host-shared/src/zz-planted.ts; plant G-SRC bash "$D0C3"; rm packages/host-shared/src/zz-planted.ts
printf 'import { y } from "@planted/not-installed";\nexport { y };\n' > packages/host-shared/src/zz-planted.ts; plant G-DEPS bash "$D0C3"; rm packages/host-shared/src/zz-planted.ts
STATUS="$(git status --porcelain)"; if [ -n "$STATUS" ]; then echo "self-test left files: $STATUS"; exit 1; fi   # not a pipe into rg -q: SIGPIPE + pipefail could hide it
```

Lane gate (COMMON S1 script `$GATE` + this file), each commit alone:
```bash
git rebase --exec "bash $GATE && EXPECT=$EXPECT P=$P bash $D0C3" "$B"
```
Then once per sheet, on the tip: the six desktop gates and the root ratchets (each must exit 0; `npm run check:errors` must print no `New:`/`Worse:` line):
```bash
set -euo pipefail
npm --prefix apps/desktop run gates                 # must print "6 gates: 6 pass" (tree-quiet, tests, typecheck, coverage, complexity, js-backslide)
npm run check:size && npm run check:complexity && npm run check:hooks && npm run check:architecture
npm run check:errors > "${TMPDIR:-/tmp}/errs.txt"; if rg -n "^(New|Worse):" "${TMPDIR:-/tmp}/errs.txt"; then exit 1; fi
git fetch origin refactor/terra && npm run check:why-comments    # no lost block beyond the 4 known console-tee/redact-local-text ones
```
Plus COMMON S2-S12 blocks with `B`. S3: the only accepted new runtime `import()` lines are the ones the sheet names.

---

## D0c3a: host signals and the lazy plugins-dir root (150k; T, P owed)
PRE (prints `ok`):
```bash
git merge-base --is-ancestor 09669849 HEAD && test -f packages/host-shared/src/daemon-connection.ts && echo ok
```
EXPECT at start (`$EXPECT`, write it with `printf`; must match G-INV before step 1, else STOP "inventory"):
```
      1 features/agent-plugins/host-signals.ts
      1 server/runtime/composition/observability-export.ts
      2 server/runtime/composition/product-telemetry.ts
      1 server/runtime/composition/site-paths.ts
```
EXPECT after step 2 drops `host-signals`; after step 3 drops `site-paths` (2 modules, 3 lines). Update `$EXPECT` in the commit's gate accordingly (the gate checks each commit against its own expected set; list them in the report).
Census (design 1.5; every hit must be listed there, else STOP with the extra paths; comment-only hits are edit (c)):
```bash
git grep -n -E "agent-plugins/(host-signals|bundled-contribution-sources)(\.js|\.ts)?['\"]|\./(host-signals|bundled-contribution-sources)(\.js|\.ts)?['\"]" -- apps development packages
git grep -n -w -E "RETIRED_BUNDLED_AGENT_PLUGINS|bundledContributionSources|bundledAgentPluginsDir" -- apps/desktop
```
Steps (one commit each):
0. **Characterization first (commit `test(d0c3a): pin bundled source selection and lazy root`, on the unmodified tree, must be green):** in `apps/website/src/features/agent-plugins/__tests__/unit/host-signals.unit.test.ts` (or a new sibling file) pin: (i) a source root holding a retired folder (`deploy`) with a valid `plugin.json` declaring signals contributes nothing; (ii) a missing source root yields `CORE_HOST_SIGNAL_FALLBACK`-based signals equal to `resolveBundledHostSignals({ env, get bundledSourceRoot(): string { throw new Error('x') } })`. In `apps/desktop/src/desktop-host-signals.test.ts`: (iii) with `TOVU_BUNDLED_AGENT_PLUGINS_DIR` set in `env`, the result's source root is that value. Mutations, each RED then restored: drop the `RETIRED_BUNDLED_AGENT_PLUGINS` filter (i); move the `bundledSourceRoot` read in `resolveBundledHostSignals` above its `try` (ii).
1. **`bundled-plugin-sources`.** `git mv apps/website/src/features/agent-plugins/bundled-contribution-sources.ts packages/host-shared/src/bundled-plugin-sources.ts`; move `RETIRED_BUNDLED_AGENT_PLUGINS` with its whole doc comment from `bundled-catalog.ts` into it (S6 pair: `bundled-catalog.ts` old vs both new files); `TrustedPluginPackage` type from `@jini-ai/plugins/host`. host-shared `dependencies` += `@jini-ai/plugins` (root range; type use now, runtime in D0c3c); G-DEPS needs nothing new yet (type only). Repoint the 17 + 5 importers (design 1.5), `lifecycle.ts:52` alias (listed), the lazy-contract mock (edit b + mutation proof). Delete the 6 now-dead `check-architecture.baseline.json` edges ending in `bundled-contribution-sources.ts`. Tests that also import website fixtures (for example `bundled-mail-credential-cards.unit.test.ts`) stay and are repointed.
2. **`host-signals`.** `git mv apps/website/src/features/agent-plugins/host-signals.ts packages/host-shared/src/host-signals.ts` (verbatim except `./bundled-contribution-sources.js` -> `./bundled-plugin-sources.js` and `AgentPluginPathsPort` -> inline `{ readonly bundledSourceRoot: string }` (a type-only website import is still a website import, G-SRC)). host-shared `dependencies` += `@jini-ai/agent-plugins`, `@tovu/contracts` (`*`). Desktop `package.json` += `@jini-ai/agent-plugins` (root range) + desktop lockfile (G-DEPS fails without it: proven by step order). Repoint 4 importers; `error-gate-debt.json:948` `file` key; the `install.ts -> host-signals.ts` architecture edge is deleted.
3. **Lazy root.** In `bundled-plugin-sources.ts` add `bundledAgentPluginsDirFor({ env, productRoot }: { env: Readonly<Record<string, string | undefined>>; productRoot: () => string }, _optional = {})` = `env.TOVU_BUNDLED_AGENT_PLUGINS_DIR ?? path.join(productRoot(), "content", "agent-plugins")`, carrying the why-comment of `product-root.ts:151-172` (S6). Website `product-root.ts:173` body becomes `bundledAgentPluginsDirFor({ env: optional.env ?? process.env, productRoot: () => resolveProductRoot({}) })` with a one-line comment naming the owner; its 70 importers are untouched. Desktop `desktop-host-signals.ts`: drop the two website imports; optional port `productRoot = desktopCheckoutRoot` (`() => path.resolve(import.meta.dirname, "..", "..", "..")`); the getter calls `bundledAgentPluginsDirFor({ env: required.env, productRoot })`. Red-first new tests (written before the code, RED because the export does not exist): host-shared `bundled-plugin-sources.unit.test.ts`: env set -> `productRoot` called 0 times (counter); env unset -> called once, path joined; desktop: `productRoot` that throws -> result `deepEqual` the core fallback; `productRoot: () => "/nonexistent"` -> same fallback (packaged without payload, design 3.3). Mutation: compute `productRoot()` before the env check -> RED. Test edit (d): `desktop-host-signals.test.ts:6,20` compare against `bundledAgentPluginsDirFor({ env, productRoot: () => <repo root> })` instead of the website function; value proof: on the parent both print the same path (`node --import tsx -e` printing both, pasted in the report).
Done when: G-INV matches the 2-module set; `node apps/desktop/scripts/stage-website-shared.ts` bundles 2 modules (paste its output).

## D0c3b: runtime mode and observability export (140k; T, P owed)
PRE: `git merge-base --is-ancestor <D0c3a tip> HEAD && test -f packages/host-shared/src/host-signals.ts && echo ok`. EXPECT at start = the 2-module set; after step 2: `      2 server/runtime/composition/product-telemetry.ts` only.
Census:
```bash
git grep -n -E "core/runtime-mode(\.js|\.ts)?['\"]|\./runtime-mode(\.js|\.ts)?['\"]" -- apps development packages      # 33 files on a7ebde50
git grep -n -E "composition/observability-export(\.js|\.ts)?['\"]|\./observability-export(\.js|\.ts)?['\"]|resolveTovuObservabilityExport\(" -- apps development packages
```
Steps:
1. **`runtime-mode` -> `@tovu/contracts/runtime-mode`** (pure, no imports; D0a precedent). `git mv apps/website/src/contracts/core/runtime-mode.ts packages/contracts/src/runtime-mode.ts`; repoint 33 files; its test (if it imports only this module) moves to `packages/contracts/src/__tests__/`. If the census exceeds 80 files, split into a repoint-by-path commit and the move (COMMON rule). No behaviour change: its tests run unchanged.
2. **`observability-export` with `checkout` required.** Characterization first, on the parent (green): `observability-export.unit.test.ts` gains: `resolveTovuObservabilityExport({ env })` equals the explicit-checkout form with `checkout: existsSync(path.join(resolveCheckoutRoot({}), ".git"))` for three env fixtures (development, packaged desktop `TOVU_PACKAGED_DESKTOP=1`, production `TOVU_RUNTIME_MODE=production`). Then `git mv ... packages/host-shared/src/observability-export.ts`; signature `({ env = process.env, packagedDesktop, checkout }: { env?; packagedDesktop?; checkout: boolean }, _optional = {})`; the location default and its `product-root` import are gone (G-SRC). Callers pass the old default's value: website `product-telemetry.ts:242,265` and `provider-plugins.ts` call sites pass `checkout: existsSync(path.join(resolveCheckoutRoot({}), ".git"))` (import `resolveCheckoutRoot` there; the value is computed where the website file lives, as before). Desktop: `ProductTelemetryBootArgs` gains `repoRoot: string`; `main/index.ts` passes `repoRoot: REPO_ROOT`; `initializeDesktopProductTelemetry` passes `checkout: !app.isPackaged && existsSync(path.join(repoRoot, ".git"))` (through an injectable `pathExists` option, default `existsSync`). Red-first desktop tests in `product-telemetry-boot.test.ts`: packaged -> the export fake receives `checkout: false` and `pathExists` is not called; dev with `.git` present -> `true`; dev without -> `false`. Mutation: pass `checkout: true` constantly -> RED. Test edit (d): the existing `observability-export.unit.test.ts` calls without `checkout` gain the value their default computed (`checkout: existsSync(path.join(resolveCheckoutRoot({}), ".git"))`); value proof: the characterization above.
Done when: G-INV = 1 module / 2 lines.

## D0c3c: plugin-host policy split (200k; T; needs owner Q2)
PRE: D0c3b tip is an ancestor; `test -f packages/host-shared/src/observability-export.ts`. EXPECT unchanged (1 module / 2 lines): this sheet does not touch the desktop's imports.
Census:
```bash
git grep -n -E "(plugin-runtime/|\./)(host-binding|plugin-export|declarative-content-types)(\.js|\.ts)?['\"]|core/(extension-capability-vocabulary|system-content-types)(\.js|\.ts)?['\"]|composition/provider-contracts(\.js|\.ts)?['\"]|\./provider-contracts(\.js|\.ts)?['\"]" -- apps development packages
git grep -n -w -E "createPluginModuleImporter|PLUGIN_HOOK_SEMANTICS" -- apps development
```
Characterization first (commit 0, green on the parent): `features/plugin-runtime/__tests__/unit/host-binding.unit.test.ts` gains pins (if not already pinned, check by mutation): `Object.keys(pluginHostBinding).sort()` equals today's list; `tierPolicy.siteErrors` returns `TIER_NOT_ALLOWED` for `{ tier: "tier-2" }` and `[]` otherwise; `checkInstall` refuses a tier-1 package with `index.mjs`; `allowLoad` true for `source: "built-in"` and for tier-3, false for tier-2 site; `verifyDigest` of a fixture file equals `sha256-<hex>`; `identityNamespace === "tovu"`. Mutations (each RED): `allowLoad` returns true for tier-2; `DECLARATIVE_DATA_FILE` admits `.js`.
Steps:
1. Move `features/plugin-runtime/plugin-export.ts`, `contracts/core/extension-capability-vocabulary.ts`, `contracts/core/system-content-types.ts` to host-shared (9 importers; tests importing only these move with them). host-shared deps += `@tovu/sdk` (`*`, workspace), `@jini-ai/cms`; desktop `package.json` += `@jini-ai/cms` (G-DEPS); `@tovu/sdk` reaches the desktop as a `file:../../packages/sdk` dependency beside `@tovu/contracts`, + desktop `predev`/`prebuild` build it (d0c-verify-fix obs. 2 applies: list it).
2. Move `declarative-content-types.ts` (3 importers). On owner Q2 = "factory": a separate preceding commit turns the module constant into `createTovuDeclarativeContentTypes(_required = {}, _optional = {})` called inside each exported function (behaviour pinned by its existing unit test). Q2 unanswered: move verbatim and list the module constant in the report.
3. NEW `packages/host-shared/src/plugin-host-policy.ts`: `createPluginHostPolicy(_required = {}, _optional = {})` returns `{ pluginSdkBinding, capabilityVocabulary, declarativeContentTypes, coreOwnerName, identityNamespace, tierPolicy, verifyDigest }` (code moved from `host-binding.ts:18-69,77-84`, why-comments with it), plus `PLUGIN_HOOK_SEMANTICS` and `createPluginModuleImporter` (`host-binding.ts:90-123`; its `import(pathToFileURL(entryPath).href)` is the ONE S3 line this sheet may add to host-shared). `host-binding.ts` keeps `pluginHostBinding = { ...createPluginHostPolicy(), localInstallDisabledMessage, archiveReader, createInvocationCoreDeps }` and `PluginBeforeSavePreview`; importers of `createPluginModuleImporter`/`PLUGIN_HOOK_SEMANTICS` are repointed. Desktop `package.json` += `@jini-ai/plugins`. The commit-0 tests run unchanged.
4. Move `provider-contracts.ts` (3 importers; `@jini-ai/commerce` += host-shared and desktop deps).
Done when: `rg -n "plugin-runtime/host-binding" packages` prints nothing and G-DEPS passes with the four new desktop deps.

## D0c3d: product telemetry (220k; T, P owed; needs owner Q1, Q3)
PRE: D0c3c tip is an ancestor; `test -f packages/host-shared/src/plugin-host-policy.ts`. EXPECT at start: `      2 server/runtime/composition/product-telemetry.ts`; at the end: EMPTY (`: > "$EXPECT"`).
Census:
```bash
git grep -n -w -E "bootProductTelemetry|bootProductTelemetryFromEnv|createProductConsentReader|loadProductProviders|ProductProviderInput|ProductTelemetryOptions|ProductTelemetryConfig|ProductTelemetryRequired" -- apps development packages
rg -n "website/src/server/runtime/composition/product-telemetry" apps/desktop/src
find apps/website -name node_modules -prune -print      # must print nothing (design 3.1: dev search root = [repoRoot] is equivalent)
```
Characterization first (commit 0, green on the parent):
- host-shared-to-be behaviour through the website binding: `product-telemetry.unit.test.ts` (20 tests) is the pin and stays UNCHANGED through this sheet (its call shapes `bootProductTelemetry(required, options)` and `loadProductProviders(input, { resolvePackage })` are kept by the website binding). Add one test: a reported error whose stack contains `${INSTALL_ROOT}/x.js` keeps that path and masks `/tmp/other/y.js` (needs `INSTALL_ROOT` exported for the test? no: derive it in the test from the module URL the same way, five levels up). Mutation: `KEEP_ROOTS = []` -> RED.
- desktop: `product-telemetry.test.ts` gains `desktopProductRoots` cases (red-first, the function is new): packaged `{ resourcesPath: "/R", repoRoot: "/repo" }` -> `{ installRoot: "/R", searchRoots: ["/R/tovu", "/R/app.asar"] }`; dev -> `{ installRoot: "/repo/apps", searchRoots: ["/repo"] }`.
Steps:
1. NEW `packages/host-shared/src/product-providers.ts`: `loadCatalogProviders` = the body of website `loadProductProviders` (`product-telemetry.ts:117-155`, why-comments moved) with static `import { discoverPlugins, loadProviderPluginArtifact, siteEntryPath } from "@jini-ai/plugins/host/node"`, `policy`/`contracts`/`searchRoots` REQUIRED (no `INSTALL_ROOT`, no `import.meta.url` path), optional `resolvePackage = createRequire(import.meta.url).resolve` (the moved S3 site, named). Website `loadProductProviders(required, { resolvePackage } = {})` keeps its signature and calls it with `policy: createPluginHostPolicy()`, `contracts: PROVIDER_CONTRACTS`, `searchRoots: [composition dir, INSTALL_ROOT/tovu, INSTALL_ROOT/app.asar]` (the exact old list). The three `import()` at `:120-121` are deleted (owner Q1 yes; Q1 no: keep them and import `@tovu/host-shared/product-providers` lazily there instead, listed under S3). The website tests run unchanged.
2. NEW `packages/host-shared/src/product-telemetry.ts`: `createProductConsentReader`, `startProductTelemetry(required: { configPath; preferencePath; processRole; release; observabilityExportEnabled: boolean; loadProviders; installRoot }, optional: { readConsent?; warn? } = {})` and the private helpers (`product-telemetry.ts:30-31,39-69,71-94,157-229,231-255` moved; `KEEP_ROOTS` built per call from `installRoot` and its `redactLocalText` spelling). Website `product-telemetry.ts` keeps `INSTALL_ROOT`, `loadProductProviders`, `bootProductTelemetry(required, options = {})` = `startProductTelemetry({ ...required, observabilityExportEnabled: required.observabilityExportEnabled ?? resolveTovuObservabilityExport({ checkout: <website value> }), loadProviders: options.loadProviders ?? loadProductProviders, installRoot: INSTALL_ROOT }, options)` and `bootProductTelemetryFromEnv`; `createProductConsentReader` importers repointed. host-shared deps += `@jini-ai/analytics` runtime now (desktop += `@jini-ai/analytics`, G-DEPS). `error-gate-debt.json:2348` key: split per the findings' functions (the entries of moved functions change `file`).
3. **Desktop binding.** `product-telemetry.ts`: import `startProductTelemetry` from host-shared; `desktopProductRoots`; `bootLaunchProduct` passes `loadProviders: input => loadCatalogProviders({ ...input, policy: createPluginHostPolicy(), contracts: PROVIDER_CONTRACTS, searchRoots })` and `installRoot`; `bootDesktopProductTelemetry` gains required `repoRoot` + `isPackaged` + `resourcesPath` through `launch`'s caller (`product-telemetry-boot.ts:146-150`, which already has `app.isPackaged`, `processInfo.resourcesPath` and, from D0c3b, `repoRoot`). Delete `product-telemetry-preference.ts:4,7`; `product-telemetry-boot.ts:13-18` and `product-telemetry-preference.test.ts:6` import `createProductConsentReader` from `@tovu/host-shared/product-telemetry`. Test edits (d): `product-telemetry.test.ts:4` and `product-memory-telemetry.test.ts:6` take `ProductTelemetry`/`ProductConsent` from `@tovu/contracts/product-telemetry` and `typeof startProductTelemetry` from host-shared; the existing boot-forwarding test (`:139-150`) asserts the new `installRoot` and that `loadProviders` is a function (value proof: `desktopProductRoots` tests). Mutation: the desktop passes `installRoot: "/"` -> the commit-0 keep-root test's desktop twin (add it here: a stack under `/R` kept when packaged) RED.
Done when: G-INV prints nothing for the expected EMPTY set (the `diff` of two empty files), `node apps/desktop/scripts/stage-website-shared.ts` bundles 0 modules, S3 shows the website's three `import()` gone and only the two named host-shared lines new.

## D0c3e: delete the staging step, then packaged proof (120k + CI; P)
PRE: D0c3d tip is an ancestor; G-INV with an EMPTY `$EXPECT` passes; the Jini snapshot exists and is pinned unlinked: `npm view @jini-ai/core@next version` prints `0.7.1-next.N` and `apps/desktop/package.json` + root pin it (DX-OD10); else STOP "snapshot" and stay at T.
Step 1 (one commit; tests first, RED before the code change):
- `src/staged-closure.test.ts:7`: expect `stage` === `node scripts/stage-payload.ts`, plus `assert.ok(!existsSync(new URL('../scripts/stage-website-shared.ts', import.meta.url)))` (RED until the deletion).
- `src/verify-package-cli.test.ts:243`: drop the `Resources/website` fixture dir; add an assertion that the audit fails when `@tovu/host-shared` is absent from the fixture archive (RED until `verify-staged-closure.ts` asserts it).
- Code: delete `scripts/stage-website-shared.ts` (its "Why" paragraph goes to `apps/desktop/RELEASING.md`, S6); `package.json:25` `"stage": "node scripts/stage-payload.ts"`; delete `electron-builder.yml:94-99`; `verify-staged-closure.ts`: delete `:39-40` and add, after extraction, a check that `app/node_modules/@tovu/host-shared/package.json` and `app/node_modules/@tovu/contracts/package.json` exist (throw with the missing path), and that each runtime external of host-shared (`tools/runtime-externals.mjs` list, committed as a fixture list in the script) resolves to ONE directory inside `app/node_modules` (duplicate-instance check).
- Proof lines in the report: `rg -n "npm run stage" .github apps/desktop/package.json` (the three workflow lines + the `package` script still resolve), `rg -n "website-shared|stage-website-shared|staging/website" apps/desktop .github` prints nothing (exit 1 handled as in COMMON-3).
Step 2 (P, COMMON section 6, on the UNLINKED tree pinned to the snapshot): (1) `npm --prefix apps/desktop run stage`; (2) package (`electron-builder` as `package` does); (3) `node --experimental-import-meta-resolve scripts/verify-staged-closure.ts --asar <archive>` (print the path) with 0 missing imports and the new host-shared/contracts/duplicate checks passing; (4) `.github/workflows/desktop-release.yml` `build` job on macOS AND Windows (`verify-package`, `smoke-native`, `smoke-bridge`). Owed with it: P for D0c1, D0c2, D0c3a-d (this one run proves all, since they all ship in the same archive). Without a machine with Electron, push the branch and report "T passed; P pending CI run <url>" (S11 rules).

## Report (each sheet)
COMMON section 7, plus: the G-INV expected file per commit, the three planted-failure lines, `d0c3-gates: ok` per commit (rebase log), the six desktop gates line, each mutation (what, RED test name, restored), each test edit (d) with its value proof, the desktop dependencies added, owner answers used (Q1-Q3).
