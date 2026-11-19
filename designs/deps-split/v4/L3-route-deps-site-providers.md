# L3 — `route-deps-site-providers` (deps-split v4, literal runs)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
Contiguous entry runs of the `routeDeps` object literal (tip `const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {`, 2135-2715). A run never crosses one of the literal's 7 spreads (they stay in the literal, in place), so every key keeps its position relative to every spread and every other key: property evaluation order and overwrite order are unchanged by construction. Each run becomes one spread of a call at the run's place. No run contains a top-level `await` (the 7 `await`s inside entries are in nested async functions and move with them). Self-reads of `routeDeps` are getters. Runs are cut at ≤44 code lines so each function is ≤50 with its 4 frame lines. This sheet runs after H2 and L1, L2.

### `routeDepsSiteThemesTelemetry` — tip 2294-2355 (31 entries, 44 code lines; first key `mailFeedbackRoute`, last `reapplyProvider`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-site-providers.ts`: `export function routeDepsSiteThemesTelemetry(required: RouteDepsSiteThemesTelemetryRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "mailFeedbackRoute" | "siteTitlePreservationStore" | "siteDisplayName" | "siteTimeZone" | "changeSets" | "revertRegistry" | "themes" | "themesDir" | "packageThemesDir" | "siteBinding" | "createSite" | "federatedMcpPresetRegistry" | "agentPluginLayout" | "agentPluginLifecycle" | "skillLayout" | "siteBackupSources" | "siteStoragePaths" | "outbox" | "bus" | "observability" | "tracker" | "visitorTracker" | "observabilityEnabled" | "flushTelemetry" | "browserAnalytics" | "consentAdapters" | "telemetryStatus" | "sendTelemetryTest" | "aiTraceSink" | "providerConfig" | "reapplyProvider">` with body `const { dbPath, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, federatedMcpPresetRegistry, skillLayout, resolvedThemesDir, kernel, resolvedUploadsDir, isMediaRemote, mediaIsRemoteByEnv, workspaceId, clock, idGen, pluginRuntime, siteTitlePreservationStore, siteDisplayName, siteTimeZone, menuRepo, outbox, bus, trashRepo, siteAssistantSecretSealer, providerConfigSource, customCredentialSetRepo, providerPlugins, aiTraceSink, observability, tracker, postRepo, siteThemes } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`), then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsSiteThemesTelemetry({ dbPath, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, federatedMcpPresetRegistry, skillLayout, resolvedThemesDir, kernel, resolvedUploadsDir, isMediaRemote, mediaIsRemoteByEnv, workspaceId, clock, idGen, pluginRuntime, siteTitlePreservationStore, siteDisplayName, siteTimeZone, menuRepo, outbox, bus, trashRepo, siteAssistantSecretSealer, providerConfigSource, customCredentialSetRepo, providerPlugins, aiTraceSink, observability, tracker, postRepo, siteThemes }),
```
- **Inputs** (`RouteDepsSiteThemesTelemetryRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `dbPath` | value | by the rule (root parameter) |
| `resolvedSiteBinding` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"]` |
| `agentPluginLayout` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"]` |
| `agentPluginLifecycle` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLifecycle"]` |
| `federatedMcpPresetRegistry` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["federatedMcpPresetRegistry"]` |
| `skillLayout` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["skillLayout"]` |
| `resolvedThemesDir` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["resolvedThemesDir"]` |
| `kernel` | value | `const kernel = store.content;` |
| `resolvedUploadsDir` | value | B02 output → `ReturnType<typeof composeMediaStorage>["resolvedUploadsDir"]` |
| `isMediaRemote` | value | B02 output → `ReturnType<typeof composeMediaStorage>["isMediaRemote"]` |
| `mediaIsRemoteByEnv` | value | B02 output → `ReturnType<typeof composeMediaStorage>["mediaIsRemoteByEnv"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `clock` | value | B03 output → `ReturnType<typeof composeStoreBasics>["clock"]` |
| `idGen` | value | B03 output → `ReturnType<typeof composeStoreBasics>["idGen"]` |
| `pluginRuntime` | value | B04 output → `ReturnType<typeof composeSitePluginRuntime>["pluginRuntime"]` |
| `siteTitlePreservationStore` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["siteTitlePreservationStore"]` |
| `siteDisplayName` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["siteDisplayName"]` |
| `siteTimeZone` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["siteTimeZone"]` |
| `menuRepo` | value | B06 output → `ReturnType<typeof startBootData>["menuRepo"]` |
| `outbox` | value | B07 output → `ReturnType<typeof composeEventsOrigin>["outbox"]` |
| `bus` | value | B07 output → `ReturnType<typeof composeEventsOrigin>["bus"]` |
| `trashRepo` | value | B08 output → `ReturnType<typeof composeTrashStores>["trashRepo"]` |
| `siteAssistantSecretSealer` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"]` |
| `providerConfigSource` | value | B18 output → `ReturnType<typeof composeProviderConfigSource>["providerConfigSource"]` |
| `customCredentialSetRepo` | value | B18 output → `ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"]` |
| `providerPlugins` | value | `const providerPlugins = await providerPluginBoot({ overrides })({` |
| `aiTraceSink` | value | `const { observability, tracker, aiTraceSink } = providerPlugins;` |
| `observability` | value | `const { observability, tracker, aiTraceSink } = providerPlugins;` |
| `tracker` | value | `const { observability, tracker, aiTraceSink } = providerPlugins;` |
| `postRepo` | value | B20 output → `ReturnType<typeof composeContentStores>["postRepo"]` |
| `siteThemes` | value | B21 output → `ReturnType<typeof composePublishingStoresThemes>["siteThemes"]` |

### `routeDepsProviderAnalytics` — tip 2356-2376 (9 entries, 13 code lines; first key `providerAppliesAt`, last `analyticsProviders`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-site-providers.ts`: `export function routeDepsProviderAnalytics(required: RouteDepsProviderAnalyticsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "providerAppliesAt" | "projectKeys" | "legacyProviderCredential" | "publishTrustRevocations" | "clock" | "idGen" | "analyticsSink" | "analyticsConfig" | "analyticsProviders">` with body `const { agentPluginLifecycle, kernel, workspaceId, publishTrustRevocations, clock, idGen, settingsRepo, siteAssistantSecretSealer, customCredentialSetRepo, providerPlugins, projectKeys, observability } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`), then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsProviderAnalytics({ agentPluginLifecycle, kernel, workspaceId, publishTrustRevocations, clock, idGen, settingsRepo, siteAssistantSecretSealer, customCredentialSetRepo, providerPlugins, projectKeys, observability }),
```
- **Inputs** (`RouteDepsProviderAnalyticsRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `agentPluginLifecycle` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLifecycle"]` |
| `kernel` | value | `const kernel = store.content;` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `publishTrustRevocations` | value | `const publishTrustRevocations = await publishTrustRevocationStoreFor({ kernel });` |
| `clock` | value | B03 output → `ReturnType<typeof composeStoreBasics>["clock"]` |
| `idGen` | value | B03 output → `ReturnType<typeof composeStoreBasics>["idGen"]` |
| `settingsRepo` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["settingsRepo"]` |
| `siteAssistantSecretSealer` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"]` |
| `customCredentialSetRepo` | value | B18 output → `ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"]` |
| `providerPlugins` | value | `const providerPlugins = await providerPluginBoot({ overrides })({` |
| `projectKeys` | value | `ReturnType<typeof compositionProjectKeys>` |
| `observability` | value | `const { observability, tracker, aiTraceSink } = providerPlugins;` |

Type each required field mechanically: a B-sheet output → `ReturnType<typeof composeX>["name"]` as shown; `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js`; `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the call or is a root `let` reassigned after it; passing such a binding as a value is either a TypeScript error (TS2448/TS2454) or reads a stale cell — the characterization test fails on the latter.

### Imports used by the moved entries
| name | from (as written in deps.ts) | action |
|---|---|---|
| `POST_ENTITY_TYPE` | `#src/features/trash/index` | copy (still used in deps.ts) |
| `SINGLE_HOP_HTTPS_EGRESS_POLICY` | `#src/platform/http/egress-policies` | copy (still used in deps.ts) |
| `SqliteBufferSink` | `#src/platform/db/sqlite/analytics-sink.sqlite` | **move** (delete from deps.ts) |
| `SqliteChangeSetRepo` | `#src/platform/db/sqlite/change-set-repo.sqlite` | copy (still used in deps.ts) |
| `bindForgetRemovedEntity` | `@jini-ai/cms/trash` | copy (still used in deps.ts) |
| `buildAnalyticsProviders` | `./analytics-providers.js` | **move** (delete from deps.ts) |
| `builtInThemesDir` | `./site-paths.js` | copy (still used in deps.ts) |
| `createDefaultHttpClient` | `#src/platform/http/client` | copy (still used in deps.ts) |
| `createPostRevertRegistry` | `#src/features/post/index` | **move** (delete from deps.ts) |
| `createSettingsAnalyticsConfig` | `#src/features/analytics/config.settings` | **move** (delete from deps.ts) |
| `createSiteMailFeedbackRoute` | `#src/features/mail/index` | **move** (delete from deps.ts) |
| `legacyProviderCredentialCheck` | `./provider-plugins.js` | **move** (delete from deps.ts) |
| `listCustomCredentials` | `#src/features/custom-credentials/index` | **move** (delete from deps.ts) |
| `loadMailAdapterRegistry` | `#src/features/agent-plugins/mail-adapter-registry` | copy (still used in deps.ts) |
| `pluginsInstallDir` | `./site-paths.js` | copy (still used in deps.ts) |
| `registerMenuReverters` | `#src/features/navigation/index` | **move** (delete from deps.ts) |
| `resolveCustomCredentialByLabel` | `#src/features/custom-credentials/index` | copy (still used in deps.ts) |
| `resolveSiteStoragePaths` | `./site-paths.js` | copy (still used in deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

Also import `type NewsletterRouteDeps` (`../../../inbound/admin-http/routes/newsletter/deps.js`) and `type ByokToolSurfaceDeps` (deps.ts's specifier with one more `../`) for the return types; both stay imported by deps.ts (the root literal's annotation).

Module helpers read by the entries: `resolveSiteBackupSources` (tip 583) — `resolveSiteBackupSources` (still used only by this run) moves with it into the run file, with its doc comment, unexported.

## Importers to repoint
None.

## Source readers of deps.ts (literal match on the tip)
- `apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts` — its literal(s) found in this range: `durable-adapter`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-site-providers.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts` — its literal(s) found in this range: `, workspaceId: `. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-site-providers.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts` — its literal(s) found in this range: `builtInThemesDir`, `builtInThemesDir()`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-site-providers.ts` (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-site-providers.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins: each run's call sits in the routeDeps literal exactly where its entries sat (between the same
// neighbours, spreads included), each run returns its keys in tip order, and getters are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const RUNS = new URL("../route-deps-site-providers.ts", import.meta.url);
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

test("L3: the run calls sit where their entries sat", () => {
  const items = literalItems();
  const at = items.findIndex((t) => t.startsWith("...routeDepsSiteThemesTelemetry("));
  assert.ok(at >= 0, "first run call missing");
  assert.ok(items[at - 1].startsWith("...compositionConsentOptions({ workspaceId, loadContributions: agentPluginLifecycle.loadPluginContri"));
  const expected: readonly string[] = ["...routeDepsSiteThemesTelemetry(","...routeDepsProviderAnalytics(","...identity"];
  expected.forEach((prefix, i) => assert.ok(items[at + i]?.startsWith(prefix), `item ${at + i}: ${items[at + i]}`));
});

test("L3: each run returns its keys in tip order", () => {
  const file = parse(RUNS);
  const keys: Record<string, readonly string[]> = {"routeDepsSiteThemesTelemetry":["mailFeedbackRoute","siteTitlePreservationStore","siteDisplayName","siteTimeZone","changeSets","revertRegistry","themes","themesDir","packageThemesDir","siteBinding","createSite","federatedMcpPresetRegistry","agentPluginLayout","agentPluginLifecycle","skillLayout","siteBackupSources","siteStoragePaths","outbox","bus","observability","tracker","visitorTracker","observabilityEnabled","flushTelemetry","browserAnalytics","consentAdapters","telemetryStatus","sendTelemetryTest","aiTraceSink","providerConfig","reapplyProvider"],"routeDepsProviderAnalytics":["providerAppliesAt","projectKeys","legacyProviderCredential","publishTrustRevocations","clock","idGen","analyticsSink","analyticsConfig","analyticsProviders"]};
  for (const [name, expected] of Object.entries(keys)) {
    const ret = bodyOf(file, name).find((s): s is ts.ReturnStatement => ts.isReturnStatement(s));
    assert.ok(ret?.expression && ts.isObjectLiteralExpression(ret.expression), name);
    assert.deepEqual(ret.expression.properties.map((p) => p.name?.getText() ?? ""), expected);
  }
});

test("L3: getter inputs are only read lazily", () => {
  const file = parse(RUNS);
  for (const name of ["routeDepsSiteThemesTelemetry","routeDepsProviderAnalytics"]) assert.deepEqual(eagerReads(bodyOf(file, name), []), [], name);
});
```
Red first (prove the pins bite, then revert each): swap two adjacent entries inside one run → test 2 fails; move one run call after the following spread → test 1 fails. Record the failing outputs in the commit message body.

## Steps (fail-closed; every block starts with `set -euo pipefail`; any non-zero exit = STOP with the step number)
**1. Start (clean tree, on the branch's last green commit).**
```bash
set -euo pipefail
git diff --quiet && git diff --cached --quiet
F=apps/website/src/server/runtime/composition/deps.ts
T=$(mktemp -d)
git rev-parse HEAD > "$T/parent"
# routeDepsSiteThemesTelemetry
test "$(grep -cxF -- '    mailFeedbackRoute: createSiteMailFeedbackRoute({ db: kernel, workspaceId, credentials: { repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer },' "$F")" -eq 1
s=$(grep -nxF -- '    mailFeedbackRoute: createSiteMailFeedbackRoute({ db: kernel, workspaceId, credentials: { repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer },' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+61))p" "$F" | sha256sum | cut -d' ' -f1)" = 3e46c5f8fc148c14f9d4d9cd31b37b5b7973a8ea03fbb09dfffce52c1a95c468
# routeDepsProviderAnalytics
test "$(grep -cxF -- '    providerAppliesAt: input => providerPlugins.appliesAt(input),' "$F")" -eq 1
s=$(grep -nxF -- '    providerAppliesAt: input => providerPlugins.appliesAt(input),' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+20))p" "$F" | sha256sum | cut -d' ' -f1)" = 2d06ce25773a91bea7884da00bd4ae98c0366c3caffcab4d9766b860ca850e1b
# resolveSiteBackupSources (module helper moving with this run)
test "$(grep -cxF -- 'function resolveSiteBackupSources(input: { siteDir: string; uploadsDir: string; mediaIsRemoteByEnv: boolean; isMediaRemote: () => Promise<boolean>; themesDir: string; agentPluginLayout: RouteDeps["agentPluginLayout"]; skillLayout: RouteDeps["skillLayout"]; sitePlugins: NonNullable<SiteBackupSources["sitePlugins"]> }): SiteBackupSources {' "$F")" -eq 1
s=$(grep -nxF -- 'function resolveSiteBackupSources(input: { siteDir: string; uploadsDir: string; mediaIsRemoteByEnv: boolean; isMediaRemote: () => Promise<boolean>; themesDir: string; agentPluginLayout: RouteDeps["agentPluginLayout"]; skillLayout: RouteDeps["skillLayout"]; sitePlugins: NonNullable<SiteBackupSources["sitePlugins"]> }): SiteBackupSources {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-10)),$((s+11))p" "$F" | sha256sum | cut -d' ' -f1)" = 29b6c7f0b741f5a5fb6ef17e4715c42801fa82b3f884d6ab02a88a5cc9ae5e87
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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/route-deps-site-providers.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-site-providers.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/route-deps-site-providers.ts apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-site-providers.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): L3 route-deps-site-providers literal runs move out of composeSiteRouteDeps (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed, and `development/scripts/size-debt.json` only if `check:size` printed `Delete stale debt entry` for a deps.ts row (delete exactly that row) — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
