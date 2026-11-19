# L2 — `route-deps-assistant-mcp` (deps-split v4, literal runs)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
Contiguous entry runs of the `routeDeps` object literal (tip `const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {`, 2135-2715). A run never crosses one of the literal's 7 spreads (they stay in the literal, in place), so every key keeps its position relative to every spread and every other key: property evaluation order and overwrite order are unchanged by construction. Each run becomes one spread of a call at the run's place. No run contains a top-level `await` (the 7 `await`s inside entries are in nested async functions and move with them). Self-reads of `routeDeps` are getters. Runs are cut at ≤44 code lines so each function is ≤50 with its 4 frame lines. This sheet runs after H2 and L1.

### `routeDepsAssistantSettings` — tip 2210-2260 (27 entries, 43 code lines; first key `presentationRepo`, last `externalMcpToolApprovalRepo`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts`: `export function routeDepsAssistantSettings(required: RouteDepsAssistantSettingsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "presentationRepo" | "settingsRepo" | "getEffective" | "set" | "instructionsNamespace" | "seoReady" | "seoDeps" | "sitemapService" | "settingsReady" | "assistantSettingsReady" | "visitorToolsManagement" | "adminAssistantEnabled" | "siteAssistantCredentialRepo" | "siteAssistantSecretSealer" | "siteAssistantSecretKeyring" | "databaseTransferChatSnapshot" | "databaseTransferDestinationStore" | "adminExecutionCredentialRepo" | "mediaProviderCredentialRepo" | "externalMcpServerRepo" | "bundledSourceRoot" | "mcp" | "preferences" | "providerFaces" | "notifyRosterChanged" | "builtInExternalMcpServerIds" | "externalMcpToolApprovalRepo">` with body `const { agentPluginLayout, kernel, workspaceId, chat, clock, idGen, identity, settingsPrincipals, presentationRepo, settingsRepo, settingsReady, assistantSettingsReady, seoReady, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteAssistantCredentialRepo, externalMcpServerRepo, siteThemes, seoDeps, sitemapService, agentPluginMcp, routeDeps } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`), then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsAssistantSettings({ agentPluginLayout, kernel, workspaceId, chat, clock, idGen, identity, settingsPrincipals, presentationRepo, settingsRepo, settingsReady, assistantSettingsReady, seoReady, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteAssistantCredentialRepo, externalMcpServerRepo, siteThemes, seoDeps, sitemapService, agentPluginMcp, routeDeps: () => routeDeps }),
```
- **Inputs** (`RouteDepsAssistantSettingsRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `agentPluginLayout` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"]` |
| `kernel` | value | `const kernel = store.content;` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `chat` | value | `const chat = store.chat;` |
| `clock` | value | B03 output → `ReturnType<typeof composeStoreBasics>["clock"]` |
| `idGen` | value | B03 output → `ReturnType<typeof composeStoreBasics>["idGen"]` |
| `identity` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["identity"]` |
| `settingsPrincipals` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["settingsPrincipals"]` |
| `presentationRepo` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["presentationRepo"]` |
| `settingsRepo` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["settingsRepo"]` |
| `settingsReady` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["settingsReady"]` |
| `assistantSettingsReady` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["assistantSettingsReady"]` |
| `seoReady` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["seoReady"]` |
| `siteAssistantSecretKeyring` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"]` |
| `siteAssistantSecretSealer` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"]` |
| `siteAssistantCredentialRepo` | value | B17 output → `ReturnType<typeof composeAssistantCredentials>["siteAssistantCredentialRepo"]` |
| `externalMcpServerRepo` | value | B17 output → `ReturnType<typeof composeAssistantCredentials>["externalMcpServerRepo"]` |
| `siteThemes` | value | B21 output → `ReturnType<typeof composePublishingStoresThemes>["siteThemes"]` |
| `seoDeps` | value | B24 output → `ReturnType<typeof composePreAssembly>["seoDeps"]` |
| `sitemapService` | value | B24 output → `ReturnType<typeof composePreAssembly>["sitemapService"]` |
| `agentPluginMcp` | value | B24 output → `ReturnType<typeof composePreAssembly>["agentPluginMcp"]` |
| `routeDeps` | **getter** `() => routeDeps` | `const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {` |

### `routeDepsExternalMcpOAuth` — tip 2261-2282 (4 entries, 14 code lines; first key `externalMcpOAuth`, last `passkeyOrigin`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts`: `export function routeDepsExternalMcpOAuth(required: RouteDepsExternalMcpOAuthRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "externalMcpOAuth" | "externalMcpOAuthDevices" | "derivedPublicOrigin" | "passkeyOrigin">` with body `const { resolvedSiteBinding, agentPluginLayout, workspaceId, clock, identity, siteAssistantSecretKeyring, siteAssistantSecretSealer, externalMcpServerRepo, externalMcpOAuthDevices, siteReferenceRepo, projectSiteId, projectStore, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginMcp, routeDeps } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`) — the line `...compositionSharedOAuth({ … }),` is as H2 left it; `compositionSharedOAuth` is imported from `./shared-oauth-commerce.js`, then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsExternalMcpOAuth({ resolvedSiteBinding, agentPluginLayout, workspaceId, clock, identity, siteAssistantSecretKeyring, siteAssistantSecretSealer, externalMcpServerRepo, externalMcpOAuthDevices, siteReferenceRepo, projectSiteId, projectStore, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginMcp, routeDeps: () => routeDeps }),
```
- **Inputs** (`RouteDepsExternalMcpOAuthRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `resolvedSiteBinding` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"]` |
| `agentPluginLayout` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `clock` | value | B03 output → `ReturnType<typeof composeStoreBasics>["clock"]` |
| `identity` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["identity"]` |
| `siteAssistantSecretKeyring` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"]` |
| `siteAssistantSecretSealer` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"]` |
| `externalMcpServerRepo` | value | B17 output → `ReturnType<typeof composeAssistantCredentials>["externalMcpServerRepo"]` |
| `externalMcpOAuthDevices` | value | B17 output → `ReturnType<typeof composeAssistantCredentials>["externalMcpOAuthDevices"]` |
| `siteReferenceRepo` | value | B17 output → `ReturnType<typeof composeAssistantCredentials>["siteReferenceRepo"]` |
| `projectSiteId` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `projectStore` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `externalMcpOAuthHttpPorts` | value | B23 output → `ReturnType<typeof composeOutboundConnections>["externalMcpOAuthHttpPorts"]` |
| `derivedPublicOrigin` | value | B23 output → `ReturnType<typeof composeOutboundConnections>["derivedPublicOrigin"]` |
| `agentPluginMcp` | value | B24 output → `ReturnType<typeof composePreAssembly>["agentPluginMcp"]` |
| `routeDeps` | **getter** `() => routeDeps` | `const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {` |

### `routeDepsExecutionPlugins` — tip 2284-2292 (8 entries, 8 code lines; first key `executionSettingsReady`, last `pluginExportHosts`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts`: `export function routeDepsExecutionPlugins(required: RouteDepsExecutionPluginsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "executionSettingsReady" | "settingsUiTabsReady" | "analyticsSettingsReady" | "siteTitleReady" | "siteConsentReady" | "consentStore" | "publicPageSecurityHeaders" | "pluginExportHosts">` with body `const { kernel, workspaceId, analyticsSettingsReady, executionSettingsReady, settingsUiTabsReady, siteTitleReady, formCollectionProviders, siteConsentReady, pluginExports } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`), then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsExecutionPlugins({ kernel, workspaceId, analyticsSettingsReady, executionSettingsReady, settingsUiTabsReady, siteTitleReady, formCollectionProviders, siteConsentReady, pluginExports }),
```
- **Inputs** (`RouteDepsExecutionPluginsRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `kernel` | value | `const kernel = store.content;` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `analyticsSettingsReady` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["analyticsSettingsReady"]` |
| `executionSettingsReady` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["executionSettingsReady"]` |
| `settingsUiTabsReady` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["settingsUiTabsReady"]` |
| `siteTitleReady` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["siteTitleReady"]` |
| `formCollectionProviders` | value | `let formCollectionProviders = () => createFormCollectionRegistry({});` |
| `siteConsentReady` | value | B24 output → `ReturnType<typeof composePreAssembly>["siteConsentReady"]` |
| `pluginExports` | value | B24 output → `ReturnType<typeof composePreAssembly>["pluginExports"]` |

Type each required field mechanically: a B-sheet output → `ReturnType<typeof composeX>["name"]` as shown; `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js`; `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the call or is a root `let` reassigned after it; passing such a binding as a value is either a TypeScript error (TS2448/TS2454) or reads a stale cell — the characterization test fails on the latter.

### Imports used by the moved entries
| name | from (as written in deps.ts) | action |
|---|---|---|
| `DatabaseDestinationRepo` | `#src/features/database-transfer/destination-repo` | **move** (delete from deps.ts) |
| `INSTRUCTIONS_NAMESPACE` | `#src/features/settings/index` | **move** (delete from deps.ts) |
| `SealedDatabaseDestinationStore` | `#src/features/database-transfer/destination-store` | **move** (delete from deps.ts) |
| `SqliteAdminExecutionCredentialRepo` | `#src/assistant/execution-credential-repo.sqlite` | **move** (delete from deps.ts) |
| `SqliteExternalMcpToolApprovalRepo` | `#src/platform/db/sqlite/external-mcp-tool-approval-repo.sqlite` | **move** (delete from deps.ts) |
| `SqliteMediaProviderCredentialRepo` | `#src/features/media/media-provider-credential-repo.sqlite` | **move** (delete from deps.ts) |
| `bundledAgentPluginsDir` | `./site-paths.js` | copy (still used in deps.ts) |
| `composeAgentPluginPreferences` | `./agent-plugin-service-ports.js` | **move** (delete from deps.ts) |
| `composePluginProviderFaces` | `./agent-plugin-service-ports.js` | **move** (delete from deps.ts) |
| `composeVisitorToolsManagement` | `./visitor-tools-management.js` | **move** (delete from deps.ts) |
| `createApplyConnectDefaults` | `#src/features/agent-plugins/apply-connect-defaults` | **move** (delete from deps.ts) |
| `createExternalMcpOAuthService` | `../../../features/external-mcp/external-mcp-oauth.js` | **move** (delete from deps.ts) |
| `createSiteConsentStore` | `#src/features/consent/revisions.repo` | **move** (delete from deps.ts) |
| `getEffective` | `#src/features/settings/index` | **move** (delete from deps.ts) |
| `isAdminAssistantEnabled` | `./admin-assistant-enabled.js` | copy (still used in deps.ts) |
| `join` | `node:path` | copy (still used in deps.ts) |
| `mkdtemp` | `node:fs/promises` | **move** (delete from deps.ts) |
| `notifyExternalMcpRosterChanged` | `../../../assistant/external-mcp-roster-change.js` | copy (still used in deps.ts) |
| `preparePreviewSwitcherWrite` | `#src/features/theme/preview-switcher` | **move** (delete from deps.ts) |
| `publicPageSecurityHeaders` | `#src/features/theme/public-page-security-headers` | **move** (delete from deps.ts) |
| `readBuiltInExternalMcpServerIds` | `#src/features/external-mcp/built-in-connections` | **move** (delete from deps.ts) |
| `readFile` | `node:fs/promises` | **move** (delete from deps.ts) |
| `resolveActiveThemeId` | `#src/features/presentation/index` | **move** (delete from deps.ts) |
| `resolvePublicAssistantAvailability` | `../../../assistant/index.js` | **move** (delete from deps.ts) |
| `rm` | `node:fs/promises` | **move** (delete from deps.ts) |
| `set` | `#src/features/settings/index` | copy (still used in deps.ts) |
| `tmpdir` | `node:os` | copy (still used in deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

Also import `type NewsletterRouteDeps` (`../../../inbound/admin-http/routes/newsletter/deps.js`) and `type ByokToolSurfaceDeps` (deps.ts's specifier with one more `../`) for the return types; both stay imported by deps.ts (the root literal's annotation).

## Importers to repoint
None.

## Source readers of deps.ts (literal match on the tip)
- `apps/website/src/server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts` — its literal(s) found in this range: `externalMcpOAuthHttpPorts`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts` — its literal(s) found in this range: `createRouteDeps`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts` — its literal(s) found in this range: `(required, optional)`, `, workspaceId: `. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts` — its literal(s) found in this range: `apps/website/src`, `server/runtime/composition/app.ts`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts` — its literal(s) found in this range: `apps/website/`, `apps/website/src/server/`, `apps/website/src/server`, `apps/website/src/server/runtime/composition`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts` (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-assistant-mcp.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins: each run's call sits in the routeDeps literal exactly where its entries sat (between the same
// neighbours, spreads included), each run returns its keys in tip order, and getters are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const RUNS = new URL("../route-deps-assistant-mcp.ts", import.meta.url);
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

test("L2: the run calls sit where their entries sat", () => {
  const items = literalItems();
  const at = items.findIndex((t) => t.startsWith("...routeDepsAssistantSettings("));
  assert.ok(at >= 0, "first run call missing");
  assert.ok(items[at - 1].startsWith("...compositionApprovalOverrides({ overrides })"));
  const expected: readonly string[] = ["...routeDepsAssistantSettings(","...routeDepsExternalMcpOAuth(","...agentPluginConnections","...routeDepsExecutionPlugins(","...compositionConsentOptions({ workspaceId, loadContributions: agentPluginLifecycle.loadPluginContri"];
  expected.forEach((prefix, i) => assert.ok(items[at + i]?.startsWith(prefix), `item ${at + i}: ${items[at + i]}`));
});

test("L2: each run returns its keys in tip order", () => {
  const file = parse(RUNS);
  const keys: Record<string, readonly string[]> = {"routeDepsAssistantSettings":["presentationRepo","settingsRepo","getEffective","set","instructionsNamespace","seoReady","seoDeps","sitemapService","settingsReady","assistantSettingsReady","visitorToolsManagement","adminAssistantEnabled","siteAssistantCredentialRepo","siteAssistantSecretSealer","siteAssistantSecretKeyring","databaseTransferChatSnapshot","databaseTransferDestinationStore","adminExecutionCredentialRepo","mediaProviderCredentialRepo","externalMcpServerRepo","bundledSourceRoot","mcp","preferences","providerFaces","notifyRosterChanged","builtInExternalMcpServerIds","externalMcpToolApprovalRepo"],"routeDepsExternalMcpOAuth":["externalMcpOAuth","externalMcpOAuthDevices","derivedPublicOrigin","passkeyOrigin"],"routeDepsExecutionPlugins":["executionSettingsReady","settingsUiTabsReady","analyticsSettingsReady","siteTitleReady","siteConsentReady","consentStore","publicPageSecurityHeaders","pluginExportHosts"]};
  for (const [name, expected] of Object.entries(keys)) {
    const ret = bodyOf(file, name).find((s): s is ts.ReturnStatement => ts.isReturnStatement(s));
    assert.ok(ret?.expression && ts.isObjectLiteralExpression(ret.expression), name);
    assert.deepEqual(ret.expression.properties.map((p) => p.name?.getText() ?? ""), expected);
  }
});

test("L2: getter inputs are only read lazily", () => {
  const file = parse(RUNS);
  for (const name of ["routeDepsAssistantSettings","routeDepsExternalMcpOAuth","routeDepsExecutionPlugins"]) assert.deepEqual(eagerReads(bodyOf(file, name), ["routeDeps"]), [], name);
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
# routeDepsAssistantSettings
test "$(grep -cxF -- '    set: (required, optional) => set(required, {' "$F")" -eq 1
s=$(grep -nxF -- '    set: (required, optional) => set(required, {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-3)),$((s+47))p" "$F" | sha256sum | cut -d' ' -f1)" = 21ed132a347582baafd4d4c323a9e464870860d3ffabe939f269f2d90c603d04
# routeDepsExternalMcpOAuth
test "$(grep -cxF -- '     * ADR-058 sealing again, one more consumer: the OAuth subsystem for `authMode: "oauth"`' "$F")" -eq 1
s=$(grep -nxF -- '     * ADR-058 sealing again, one more consumer: the OAuth subsystem for `authMode: "oauth"`' "$F" | cut -d: -f1)
test "$(sed -n "$((s-1)),$((s+20))p" "$F" | sha256sum | cut -d' ' -f1)" = 16e464cae967266ef8b65c6e2410006e1114de804827119930cd6280d595ee00
# routeDepsExecutionPlugins
test "$(grep -cxF -- '    // Same shared sealer/keyring once more — see the note above the BYOK repo.' "$F")" -eq 1
s=$(grep -nxF -- '    // Same shared sealer/keyring once more — see the note above the BYOK repo.' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+8))p" "$F" | sha256sum | cut -d' ' -f1)" = de1ef590d322e3c8b8ab2fc9621228d8c1d800fb3b9927ae9d04617167be4dab
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "$T/known.json"
echo "T=$T"
```
Each hash proves one run (with the comments between its entries) is byte-identical to the design tip after H2's one-line edit, wherever it now sits; the anchor is the run's first line that is unique in the file. A mismatch is STOP-STALE: the sheet is regenerated, nothing is frozen. `--update` writes the parent's architecture metrics into the working-tree baseline (never committed, restored in step 7) so step 5 compares the candidate with its parent, metric by metric and edge by edge, using the tool's own comparison.

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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-assistant-mcp.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-assistant-mcp.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): L2 route-deps-assistant-mcp literal runs move out of composeSiteRouteDeps (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed, and `development/scripts/size-debt.json` only if `check:size` printed `Delete stale debt entry` for a deps.ts row (delete exactly that row) — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
