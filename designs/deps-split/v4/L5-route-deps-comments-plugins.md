# L5 — `route-deps-comments-plugins` (deps-split v4, literal runs)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
Contiguous entry runs of the `routeDeps` object literal (tip `const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {`, 2135-2715). A run never crosses one of the literal's 7 spreads (they stay in the literal, in place), so every key keeps its position relative to every spread and every other key: property evaluation order and overwrite order are unchanged by construction. Each run becomes one spread of a call at the run's place. No run contains a top-level `await` (the 7 `await`s inside entries are in nested async functions and move with them). Self-reads of `routeDeps` are getters. Runs are cut at ≤44 code lines so each function is ≤50 with its 4 frame lines. This sheet runs after H2 and L1, L2, L3, L4.

### `routeDepsTaxonomyComments` — tip 2496-2567 (28 entries, 44 code lines; first key `siteAssistantRateLimiter`, last `commentWriteService`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts`: `export function routeDepsTaxonomyComments(required: RouteDepsTaxonomyCommentsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "siteAssistantRateLimiter" | "databaseLedgerRepo" | "contentTypeRepo" | "contentTypeIndexProvisioner" | "entryRepo" | "taxonomyRepo" | "termRepo" | "removeTerm" | "removeTaxonomy" | "entryTermRepo" | "entryTermReadRepo" | "taxonomyRevisionRepo" | "stampWatermark" | "restorePointsRepo" | "dbOps" | "databaseIntrospection" | "toolAttemptAuditSink" | "toolGaps" | "siteStatusRepo" | "migrationRunsRepo" | "contentKernel" | "verifyDueDomainBindings" | "disclosureWatermarkSource" | "deepLinkRestorePointLookup" | "gatedMutations" | "commentRepo" | "commentIngressPolicy" | "commentWriteService">` with body `const { kernel, workspaceId, clock, idGen, reportToolAuditError, identity, trash, databaseLedgerRepo, migrationRunsRepo, restorePointsRepo, dbOps, databaseIntrospection, entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCapability, observability, tracker } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`), then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsTaxonomyComments({ kernel, workspaceId, clock, idGen, reportToolAuditError, identity, trash, databaseLedgerRepo, migrationRunsRepo, restorePointsRepo, dbOps, databaseIntrospection, entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCapability, observability, tracker }),
```
- **Inputs** (`RouteDepsTaxonomyCommentsRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `kernel` | value | `const kernel = store.content;` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `clock` | value | B03 output → `ReturnType<typeof composeStoreBasics>["clock"]` |
| `idGen` | value | B03 output → `ReturnType<typeof composeStoreBasics>["idGen"]` |
| `reportToolAuditError` | value | B03 output → `ReturnType<typeof composeStoreBasics>["reportToolAuditError"]` |
| `identity` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["identity"]` |
| `trash` | value | B11 output → `ReturnType<typeof composeTrashService>["trash"]` |
| `databaseLedgerRepo` | value | B13 output → `ReturnType<typeof composeDatabaseJournal>["databaseLedgerRepo"]` |
| `migrationRunsRepo` | value | B13 output → `ReturnType<typeof composeDatabaseJournal>["migrationRunsRepo"]` |
| `restorePointsRepo` | value | B13 output → `ReturnType<typeof composeDatabaseJournal>["restorePointsRepo"]` |
| `dbOps` | value | B13 output → `ReturnType<typeof composeDatabaseJournal>["dbOps"]` |
| `databaseIntrospection` | value | B13 output → `ReturnType<typeof composeDatabaseJournal>["databaseIntrospection"]` |
| `entryRepo` | value | B14 output → `ReturnType<typeof composeContentRepos>["entryRepo"]` |
| `sqliteEntryTermRepo` | value | B14 output → `ReturnType<typeof composeContentRepos>["sqliteEntryTermRepo"]` |
| `taxonomyRepo` | value | B14 output → `ReturnType<typeof composeContentRepos>["taxonomyRepo"]` |
| `termRepo` | value | B14 output → `ReturnType<typeof composeContentRepos>["termRepo"]` |
| `taxonomyRevisionRepo` | value | B14 output → `ReturnType<typeof composeContentRepos>["taxonomyRevisionRepo"]` |
| `stampWatermark` | value | B14 output → `ReturnType<typeof composeContentRepos>["stampWatermark"]` |
| `contentTypeRepo` | value | B15 output → `ReturnType<typeof composeContentResolversComments>["contentTypeRepo"]` |
| `contentTypeIndexProvisioner` | value | B15 output → `ReturnType<typeof composeContentResolversComments>["contentTypeIndexProvisioner"]` |
| `commentsModule` | value | B15 output → `ReturnType<typeof composeContentResolversComments>["commentsModule"]` |
| `commentsCapability` | value | B15 output → `ReturnType<typeof composeContentResolversComments>["commentsCapability"]` |
| `observability` | value | `const { observability, tracker, aiTraceSink } = providerPlugins;` |
| `tracker` | value | `const { observability, tracker, aiTraceSink } = providerPlugins;` |

### `routeDepsPluginsSiteApp` — tip 2568-2645 (37 entries, 44 code lines; first key `commentsProviders`, last `resolveActiveThemeId`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts`: `export function routeDepsPluginsSiteApp(required: RouteDepsPluginsSiteAppRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "commentsProviders" | "commentsReady" | "commentsSettingsReady" | "widgetBindingRepo" | "entryRefsRepo" | "pluginActivationRepo" | "discoverPlugins" | "onPluginEnabled" | "onPluginDisabled" | "listPluginConflicts" | "removePlugin" | "removeTheme" | "readPluginPackageFiles" | "previewPluginBeforeSave" | "pluginInstaller" | "pluginSource" | "pluginSourcePolicy" | "pluginLoadedVersion" | "browserProviders" | "chartProviderSnapshot" | "pluginContributions" | "pluginBeforeSaveHook" | "pluginRuntimeReady" | "publishContentBundleRepo" | "fileBlobIndex" | "publishContentBaselineRepo" | "publishContentApplyPort" | "publishContentSeedHash" | "publishContentRunRepo" | "publishContentPeerRepo" | "publishContentPeerHttpClient" | "runExportSite" | "exportOutputRootDir" | "createSiteApp" | "siteAppBootWork" | "resolveStorefrontProducts" | "resolveActiveThemeId">` with body `const { resolvedSiteBinding, workspaceId, pluginActivationRepo, pluginRuntime, settingsRepo, commentsSettingsReady, commentsReady, removePlugin, publishContentRunRepo, widgetBindingRepo, entryRefsRepo, commentsCapability, providerPlugins, publishContentPeerHttpClient, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, removeTheme, publishContentApplyPort, siteAppBootWork, routeDeps } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`), then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsPluginsSiteApp({ resolvedSiteBinding, workspaceId, pluginActivationRepo, pluginRuntime, settingsRepo, commentsSettingsReady, commentsReady, removePlugin, publishContentRunRepo, widgetBindingRepo, entryRefsRepo, commentsCapability, providerPlugins, publishContentPeerHttpClient, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, removeTheme, publishContentApplyPort, siteAppBootWork, routeDeps: () => routeDeps }),
```
- **Inputs** (`RouteDepsPluginsSiteAppRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `resolvedSiteBinding` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `pluginActivationRepo` | value | B03 output → `ReturnType<typeof composeStoreBasics>["pluginActivationRepo"]` |
| `pluginRuntime` | value | B04 output → `ReturnType<typeof composeSitePluginRuntime>["pluginRuntime"]` |
| `settingsRepo` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["settingsRepo"]` |
| `commentsSettingsReady` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["commentsSettingsReady"]` |
| `commentsReady` | value | B06 output → `ReturnType<typeof startBootData>["commentsReady"]` |
| `removePlugin` | value | B11 output → `ReturnType<typeof composeTrashService>["removePlugin"]` |
| `publishContentRunRepo` | value | B13 output → `ReturnType<typeof composeDatabaseJournal>["publishContentRunRepo"]` |
| `widgetBindingRepo` | value | B14 output → `ReturnType<typeof composeContentRepos>["widgetBindingRepo"]` |
| `entryRefsRepo` | value | B14 output → `ReturnType<typeof composeContentRepos>["entryRefsRepo"]` |
| `commentsCapability` | value | B15 output → `ReturnType<typeof composeContentResolversComments>["commentsCapability"]` |
| `providerPlugins` | value | `const providerPlugins = await providerPluginBoot({ overrides })({` |
| `publishContentPeerHttpClient` | value | B19 output → `ReturnType<typeof composeMailHttp>["publishContentPeerHttpClient"]` |
| `publishContentBundleRepo` | value | B21 output → `ReturnType<typeof composePublishingStoresThemes>["publishContentBundleRepo"]` |
| `publishContentBaselineRepo` | value | B21 output → `ReturnType<typeof composePublishingStoresThemes>["publishContentBaselineRepo"]` |
| `publishContentFileBlobIndex` | value | B21 output → `ReturnType<typeof composePublishingStoresThemes>["publishContentFileBlobIndex"]` |
| `publishContentPeerRepo` | value | B21 output → `ReturnType<typeof composePublishingStoresThemes>["publishContentPeerRepo"]` |
| `publishContentSeedHash` | value | B21 output → `ReturnType<typeof composePublishingStoresThemes>["publishContentSeedHash"]` |
| `removeTheme` | value | B21 output → `ReturnType<typeof composePublishingStoresThemes>["removeTheme"]` |
| `publishContentApplyPort` | value | B22 output → `ReturnType<typeof composePublishContentApplyPort>["publishContentApplyPort"]` |
| `siteAppBootWork` | value | B24 output → `ReturnType<typeof composePreAssembly>["siteAppBootWork"]` |
| `routeDeps` | **getter** `() => routeDeps` | `const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {` |

Type each required field mechanically: a B-sheet output → `ReturnType<typeof composeX>["name"]` as shown; `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js`; `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the call or is a root `let` reassigned after it; passing such a binding as a value is either a TypeScript error (TS2448/TS2454) or reads a stale cell — the characterization test fails on the latter.

### Imports used by the moved entries
| name | from (as written in deps.ts) | action |
|---|---|---|
| `AlwaysUnavailableWatermarkSource` | `@jini-ai/db/recovery/lookup-adapters` | **move** (delete from deps.ts) |
| `DOMAIN_DNS_EGRESS_POLICY` | `./domain-dns-adapters.js` | **move** (delete from deps.ts) |
| `InMemorySiteStatusRepo` | `#src/features/database/repo.memory` | **move** (delete from deps.ts) |
| `RECHARTS_DEFAULT_PROVIDER` | `./charts-recharts-source.js` | **move** (delete from deps.ts) |
| `RestorePointDeepLinkLookup` | `@jini-ai/db/recovery/lookup-adapters` | **move** (delete from deps.ts) |
| `SITE_ASSISTANT_PER_IP` | `#src/contracts/core/rate-limit/rate-limit` | **move** (delete from deps.ts) |
| `SqliteTokenStore` | `#src/platform/db/sqlite/gated-mutation-token-repo.sqlite` | **move** (delete from deps.ts) |
| `SqliteToolAttemptAuditSink` | `#src/features/tool-audit/repo.sqlite` | **move** (delete from deps.ts) |
| `bindRemoveEntity` | `@jini-ai/cms/trash` | copy (still used in deps.ts) |
| `buildGatewayDeps` | `#src/contracts/core/gated-mutations/composition` | **move** (delete from deps.ts) |
| `buildOwnerOnlyInstanceAuthorize` | `#src/contracts/core/gated-mutations/composition` | **move** (delete from deps.ts) |
| `createApp` | `./app.js` | copy (still used in deps.ts) |
| `createDefaultHttpClient` | `#src/platform/http/client` | copy (still used in deps.ts) |
| `createDomainBindingSweep` | `./dns-change-deps.js` | **move** (delete from deps.ts) |
| `createRateLimiter` | `#src/contracts/core/rate-limit/rate-limit` | **move** (delete from deps.ts) |
| `createToolGapReader` | `#src/features/tool-audit/tool-gaps.repo` | **move** (delete from deps.ts) |
| `exportSite` | `#src/features/site-export/index` | copy (still used in deps.ts) |
| `readAdminChartProviderSnapshot` | `./chart-providers.js` | **move** (delete from deps.ts) |
| `removeEntityWithoutBlocker` | `#src/features/trash/index` | copy (still used in deps.ts) |
| `resolveActiveThemeId` | `#src/features/presentation/index` | **move** (delete from deps.ts) |
| `resolveExportOutputRootDir` | `./site-paths.js` | copy (still used in deps.ts) |
| `resolveStorefrontProducts` | `../../inbound/public-http/routes/site/products.js` | copy (still used in deps.ts) |
| `withToolUseEvents` | `./tool-use-events.js` | **move** (delete from deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

Also import `type NewsletterRouteDeps` (`../../../inbound/admin-http/routes/newsletter/deps.js`) and `type ByokToolSurfaceDeps` (deps.ts's specifier with one more `../`) for the return types; both stay imported by deps.ts (the root literal's annotation).

## Importers to repoint
None.

## Source readers of deps.ts (literal match on the tip)
- `apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts` — its literal(s) found in this range: `gated-mutations`, `InMemoryTokenStore`, `core/gated-mutations/composition.ts`, `buildGatewayDeps`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts` — its literal(s) found in this range: `createServingApp`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts` — its literal(s) found in this range: `apps/website/src`, `server/runtime/composition/app.ts`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts` — its literal(s) found in this range: `apps/website/`, `apps/website/src/server/`, `apps/website/src/server`, `apps/website/src/server/runtime/composition`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts` (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-comments-plugins.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins: each run's call sits in the routeDeps literal exactly where its entries sat (between the same
// neighbours, spreads included), each run returns its keys in tip order, and getters are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const RUNS = new URL("../route-deps-comments-plugins.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, `${name} not found`);
  return found.body.statements;
}
function eagerReads(statements: readonly ts.Node[], getters: readonly string[]): string[] {
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of statements) visit(statement, false);
  return eager;
}
function literalItems(): string[] {
  const statement = bodyOf(parse(DEPS), "composeSiteRouteDeps").find((s) => ts.isVariableStatement(s) && s.declarationList.declarations[0]?.name.getText() === "routeDeps");
  assert.ok(statement && ts.isVariableStatement(statement));
  const literal = statement.declarationList.declarations[0].initializer;
  assert.ok(literal && ts.isObjectLiteralExpression(literal));
  return literal.properties.map((p) => firstLine(p));
}

test("L5: the run calls sit where their entries sat", () => {
  const items = literalItems();
  const at = items.findIndex((t) => t.startsWith("...routeDepsTaxonomyComments("));
  assert.ok(at >= 0, "first run call missing");
  assert.ok(items[at - 1].startsWith("...routeDepsMailFormsNewsletter("));
  const expected: readonly string[] = ["...routeDepsTaxonomyComments(","...routeDepsPluginsSiteApp(","listPublishedPosts: () =>"];
  expected.forEach((prefix, i) => assert.ok(items[at + i]?.startsWith(prefix), `item ${at + i}: ${items[at + i]}`));
});

test("L5: each run returns its keys in tip order", () => {
  const file = parse(RUNS);
  const keys: Record<string, readonly string[]> = {"routeDepsTaxonomyComments":["siteAssistantRateLimiter","databaseLedgerRepo","contentTypeRepo","contentTypeIndexProvisioner","entryRepo","taxonomyRepo","termRepo","removeTerm","removeTaxonomy","entryTermRepo","entryTermReadRepo","taxonomyRevisionRepo","stampWatermark","restorePointsRepo","dbOps","databaseIntrospection","toolAttemptAuditSink","toolGaps","siteStatusRepo","migrationRunsRepo","contentKernel","verifyDueDomainBindings","disclosureWatermarkSource","deepLinkRestorePointLookup","gatedMutations","commentRepo","commentIngressPolicy","commentWriteService"],"routeDepsPluginsSiteApp":["commentsProviders","commentsReady","commentsSettingsReady","widgetBindingRepo","entryRefsRepo","pluginActivationRepo","discoverPlugins","onPluginEnabled","onPluginDisabled","listPluginConflicts","removePlugin","removeTheme","readPluginPackageFiles","previewPluginBeforeSave","pluginInstaller","pluginSource","pluginSourcePolicy","pluginLoadedVersion","browserProviders","chartProviderSnapshot","pluginContributions","pluginBeforeSaveHook","pluginRuntimeReady","publishContentBundleRepo","fileBlobIndex","publishContentBaselineRepo","publishContentApplyPort","publishContentSeedHash","publishContentRunRepo","publishContentPeerRepo","publishContentPeerHttpClient","runExportSite","exportOutputRootDir","createSiteApp","siteAppBootWork","resolveStorefrontProducts","resolveActiveThemeId"]};
  for (const [name, expected] of Object.entries(keys)) {
    const ret = bodyOf(file, name).find((s): s is ts.ReturnStatement => ts.isReturnStatement(s));
    assert.ok(ret?.expression && ts.isObjectLiteralExpression(ret.expression), name);
    assert.deepEqual(ret.expression.properties.map((p) => p.name?.getText() ?? ""), expected);
  }
});

test("L5: getter inputs are only read lazily", () => {
  const file = parse(RUNS);
  for (const name of ["routeDepsTaxonomyComments","routeDepsPluginsSiteApp"]) assert.deepEqual(eagerReads(bodyOf(file, name), ["routeDeps"]), [], name);
});
```
Red first (prove the pins bite, then revert each): swap two adjacent entries inside one run → test 2 fails; move one run call after the following spread → test 1 fails; add `void routeDeps();` as a run's first statement → test 3 fails. Record the failing outputs in the commit message body.

## Steps (fail-closed; every block starts with `set -euo pipefail`; any non-zero exit = STOP with the step number)
**1. Start (clean tree, on the branch's last green commit).**
```bash
set -euo pipefail
git diff --quiet && git diff --cached --quiet
F=apps/website/src/server/runtime/composition/deps.ts
T=$(mktemp -d)
git rev-parse HEAD > "$T/parent"
# routeDepsTaxonomyComments
test "$(grep -cxF -- '    // SPEC-046 REQ-7 — same one-process-lifetime-counter-store shape as `formsRateLimiter` above,' "$F")" -eq 1
s=$(grep -nxF -- '    // SPEC-046 REQ-7 — same one-process-lifetime-counter-store shape as `formsRateLimiter` above,' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+71))p" "$F" | sha256sum | cut -d' ' -f1)" = e057daceaacbeef1af84adc129224f4e0474cdb311963859ef74a5164a5c51e7
# routeDepsPluginsSiteApp
test "$(grep -cxF -- '    commentsProviders: commentsCapability.providers,' "$F")" -eq 1
s=$(grep -nxF -- '    commentsProviders: commentsCapability.providers,' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+77))p" "$F" | sha256sum | cut -d' ' -f1)" = 336b062c7d758dec774bcedc8425447f9e3adf6eb7da59f53d3cff2df4f18402
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "$T/known.json"
echo "T=$T"
```
Each hash proves one run (with the comments between its entries) is byte-identical to the design tip, wherever it now sits; the anchor is the run's first line that is unique in the file. A mismatch is STOP-STALE: the sheet is regenerated, nothing is frozen. `--update` writes the parent's architecture metrics into the working-tree baseline (never committed, restored in step 7) so step 5 compares the candidate with its parent, metric by metric and edge by edge, using the tool's own comparison.

**2. Edit** as "What moves" says. **3. Add the characterization test.** **4. Readers**: change only the assertions step 6 shows failing, as listed above.

**5. Gate (repo commands only).**
```bash
set -euo pipefail
npm run typecheck
npm run typecheck:tests
SIZE_BASE_REF=$(cat "$T/parent") npm run check:size
npm run check:complexity
npm run check:errors -- --strict
npm run check:hooks
npm run check:architecture
node development/scripts/check-feature-ranks.mjs . development/boundaries/feature-ranks.json
npx depcruise --config .dependency-cruiser.mjs apps/website/src --ignore-known "$T/known.json"
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts
npm run build:server
```
**6. Tests** (the repo's own runner line from `package.json` "test", with explicit files: every test that boots `createSiteRouteDeps` without Postgres, every source reader of deps.ts, and this sheet's test).
```bash
set -euo pipefail
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 \
  apps/website/src/__tests__/index-boot.characterization.test.ts \
  apps/website/src/cli/__tests__/integration/export-command-plugin-sdk-resolver.integration.test.ts \
  apps/website/src/cli/__tests__/integration/export-command.integration.test.ts \
  apps/website/src/cli/__tests__/unit/export-base-path-notice.unit.test.ts \
  apps/website/src/cli/__tests__/unit/export-command-boot-work.unit.test.ts \
  apps/website/src/cli/__tests__/unit/export-l149.unit.test.ts \
  apps/website/src/cli/__tests__/unit/export-public-url.unit.test.ts \
  apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts \
  apps/website/src/features/publish-content/__tests__/no-dead-apply-stub.boundary.test.ts \
  apps/website/src/features/redirects/__tests__/phase-handler.multi-site-lifecycle.test.ts \
  apps/website/src/features/trash/__tests__/post-trash-media-evidence.integration.test.ts \
  apps/website/src/features/trash/__tests__/tool-registrations.purge-ban.test.ts \
  apps/website/src/platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts \
  apps/website/src/platform/site-dir/__tests__/unit/read-template.unit.test.ts \
  apps/website/src/platform/site-dir/__tests__/unit/resolve-workspace.unit.test.ts \
  apps/website/src/server/__tests__/integration/agent-daemon-outbox-event-loss.integration.test.ts \
  apps/website/src/server/__tests__/integration/boot-lifecycle-real-deps.integration.test.ts \
  apps/website/src/server/__tests__/integration/composition-served-site-dir.integration.test.ts \
  apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts \
  apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts \
  apps/website/src/server/__tests__/integration/database-migration-reconciliation-boot.integration.test.ts \
  apps/website/src/server/__tests__/integration/design-c-package-themes-dir-wiring.integration.test.ts \
  apps/website/src/server/__tests__/integration/dev-capability-origin-scheme.integration.test.ts \
  apps/website/src/server/__tests__/integration/hydrate-blob-store-boot.integration.test.ts \
  apps/website/src/server/__tests__/integration/hydrate-content-db-boot.integration.test.ts \
  apps/website/src/server/__tests__/integration/observability-wiring.integration.test.ts \
  apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts \
  apps/website/src/server/__tests__/integration/publish-content-export-no-leak.integration.test.ts \
  apps/website/src/server/__tests__/integration/tool-attempt-audit-sink-composition.integration.test.ts \
  apps/website/src/server/__tests__/routes/newsletter-routes.test.ts \
  apps/website/src/server/__tests__/routes/publish-trust-revocation-gate.test.ts \
  apps/website/src/server/__tests__/routes/settings-principal-check.test.ts \
  apps/website/src/server/__tests__/routes/settings-read-scoping.test.ts \
  apps/website/src/server/__tests__/routes/settings-register-definitions-op-validation.test.ts \
  apps/website/src/server/__tests__/routes/taxonomy-trash-routes.test.ts \
  apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts \
  apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts \
  apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts \
  apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts \
  apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts \
  apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.outbox-enqueue-only-wiring.unit.test.ts \
  apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts \
  apps/website/src/server/runtime/boot/__tests__/index-bind-host-wiring.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/boot-settings-rejection.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/commerce-data-retention.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-failure-release.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.pglite.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/declared-content-types-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/deps-observability-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/deps-project-credentials.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/mail-sender-identity-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/open-site-content-db.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/open-site-store.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/pages-html-revisions-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-face-sync-compositions.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-live-enable.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/redirects-phase-disposed-on-store-close.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/registrations-disposed-on-store-close.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-backup-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-key-l005.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-search-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-theme-override.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/static-export-none.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts \
  apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts \
  apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-comments-plugins.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/route-deps-comments-plugins.ts apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-comments-plugins.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): L5 route-deps-comments-plugins literal runs move out of composeSiteRouteDeps (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed, and `development/scripts/size-debt.json` only if `check:size` printed `Delete stale debt entry` for a deps.ts row (delete exactly that row) — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
