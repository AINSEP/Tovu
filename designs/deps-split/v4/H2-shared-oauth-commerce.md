# H2 — `shared-oauth-commerce` (deps-split v4, hoisted closures → module functions)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
Root-level function declarations inside `composeSiteRouteDeps` (hoisted closures with `Record<string, never>` or empty placeholder signatures) become module functions with real `(required, optional = {})` inputs; each call passes the variables the body reads. No `await` is added or moved; the call stays where it is.

- `compositionSharedOAuth` is called inside the `routeDeps` literal (tip 2276, `      ...compositionSharedOAuth(),`), which L2 later moves; this sheet runs **before L1-L6** and edits only that one line. L2's hash is taken on the text after this edit.

### `compositionSharedOAuth` (tip 2787-2798, 10 code lines; called at tip 2276)
- **To**: `apps/website/src/server/runtime/composition/site-deps/shared-oauth-commerce.ts`, `export function compositionSharedOAuth(required: CompositionSharedOAuthRequired, _optional = {})`; first body line `const { resolvedSiteBinding, workspaceId, clock, identity, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteReferenceRepo, projectSiteId, projectStore } = required;`, then the tip body **verbatim** (getter fields read as `name()`), leading doc comment moved with it.
- **Call** (tip 2276, `...compositionSharedOAuth(),`) becomes exactly:
```ts
      ...compositionSharedOAuth({ resolvedSiteBinding, workspaceId, clock, identity, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteReferenceRepo, projectSiteId, projectStore }),
```
- **Inputs** (`CompositionSharedOAuthRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `resolvedSiteBinding` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `clock` | value | B03 output → `ReturnType<typeof composeStoreBasics>["clock"]` |
| `identity` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["identity"]` |
| `siteAssistantSecretKeyring` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"]` |
| `siteAssistantSecretSealer` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"]` |
| `siteReferenceRepo` | value | B17 output → `ReturnType<typeof composeAssistantCredentials>["siteReferenceRepo"]` |
| `projectSiteId` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `projectStore` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |

### `compositionCommerce` (tip 2802-2813, 9 code lines; called at tip 2800)
- **To**: `apps/website/src/server/runtime/composition/site-deps/shared-oauth-commerce.ts`, `export function compositionCommerce(required: CompositionCommerceRequired, _optional = {})`; first body line `const { dbPath, overrides, resolvedSiteBinding, agentPluginLayout, kernel, workspaceId, clock, idGen, settingsRepo, siteSettingsReady, projectSiteId, providerConfigSource, providerPlugins, observability } = required;`, then the tip body **verbatim** (getter fields read as `name()`), leading doc comment moved with it.
- **Call** (tip 2800, `const commerceBinding = compositionCommerce();`) becomes exactly:
```ts
  const commerceBinding = compositionCommerce({ dbPath, overrides, resolvedSiteBinding, agentPluginLayout, kernel, workspaceId, clock, idGen, settingsRepo, siteSettingsReady, projectSiteId, providerConfigSource, providerPlugins, observability });
```
- **Inputs** (`CompositionCommerceRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `dbPath` | value | by the rule (root parameter) |
| `overrides` | value | by the rule (root parameter) |
| `resolvedSiteBinding` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"]` |
| `agentPluginLayout` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"]` |
| `kernel` | value | `const kernel = store.content;` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `clock` | value | B03 output → `ReturnType<typeof composeStoreBasics>["clock"]` |
| `idGen` | value | B03 output → `ReturnType<typeof composeStoreBasics>["idGen"]` |
| `settingsRepo` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["settingsRepo"]` |
| `siteSettingsReady` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["siteSettingsReady"]` |
| `projectSiteId` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `providerConfigSource` | value | B18 output → `ReturnType<typeof composeProviderConfigSource>["providerConfigSource"]` |
| `providerPlugins` | value | `const providerPlugins = await providerPluginBoot({ overrides })({` |
| `observability` | value | `const { observability, tracker, aiTraceSink } = providerPlugins;` |

Type each required field mechanically: a B-sheet output → `ReturnType<typeof composeX>["name"]` as shown; `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js`; `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the call or is a root `let` reassigned after it; passing such a binding as a value is either a TypeScript error (TS2448/TS2454) or reads a stale cell — the characterization test fails on the latter.

### Imports used by the moved bodies
| name | from (as written in deps.ts) | action |
|---|---|---|
| `KyselyKernel` (type) | `@jini-ai/db/kernel` | copy (still used in deps.ts) |
| `SINGLE_HOP_HTTPS_EGRESS_POLICY` | `#src/platform/http/egress-policies` | copy (still used in deps.ts) |
| `composeCommerce` | `./commerce.js` | **move** (delete from deps.ts) |
| `createApiConnectionVault` | `#src/features/api-connections/vault-stores` | copy (still used in deps.ts) |
| `createDefaultHttpClient` | `#src/platform/http/client` | copy (still used in deps.ts) |
| `createSharedOAuthOwnerStorage` | `#src/features/api-connections/shared-owner` | **move** (delete from deps.ts) |
| `createSiteOAuthBindings` | `#src/features/project-keys/site-references` | copy (still used in deps.ts) |
| `dirname` | `node:path` | copy (still used in deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

## Importers to repoint
None: nothing exported from deps.ts moves.

## Source readers of deps.ts (literal match on the tip)
- none found by literal match on the tip; step 6 runs every source reader anyway.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/shared-oauth-commerce.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins: the calls keep their place in composeSiteRouteDeps, no root-level declaration of the moved
// functions remains, each is a module function with real inputs, and getter inputs are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
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
const FILES: Record<string, URL> = {"compositionSharedOAuth":"../shared-oauth-commerce.ts","compositionCommerce":"../shared-oauth-commerce.ts"};

test("H2: the calls keep their place and the root declares none of the functions", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  assert.deepEqual(body.filter((s) => ts.isFunctionDeclaration(s)).map((s) => (s as ts.FunctionDeclaration).name?.text).filter((n) => ["compositionSharedOAuth","compositionCommerce"].includes(n ?? "")), []);
  { const at = body.findIndex((s) => firstLine(s).startsWith("const commerceBinding = compositionCommerce({")); assert.ok(at > 0, "compositionCommerce call missing"); assert.ok(firstLine(body[at - 1]).startsWith("function compositionSharedOAuth() {")); }
});

test("H2: each function is a module function whose first statement destructures its inputs", () => {
  for (const [name, url] of Object.entries(FILES)) {
    const first = bodyOf(parse(new URL(url, import.meta.url)), name)[0];
    assert.ok(first && ts.isVariableStatement(first) && first.getText().endsWith("= required;"), name);
  }
});

test("H2: getter inputs are only read lazily", () => {
  const getters: readonly string[] = [];
  for (const [name, url] of Object.entries(FILES)) assert.deepEqual(eagerReads(bodyOf(parse(new URL(url, import.meta.url)), name), getters), [], name);
});
```
Red first (prove the pins bite, then revert each): move one call one statement down → test 1 fails; replace one function's first line with a plain statement → test 2 fails. Record the failing outputs in the commit message body.

## Steps (fail-closed; every block starts with `set -euo pipefail`; any non-zero exit = STOP with the step number)
**1. Start (clean tree, on the branch's last green commit).**
```bash
set -euo pipefail
git diff --quiet && git diff --cached --quiet
F=apps/website/src/server/runtime/composition/deps.ts
T=$(mktemp -d)
git rev-parse HEAD > "$T/parent"
# compositionSharedOAuth
test "$(grep -cxF -- '  function compositionSharedOAuth() {' "$F")" -eq 1
s=$(grep -nxF -- '  function compositionSharedOAuth() {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-2)),$((s+9))p" "$F" | sha256sum | cut -d' ' -f1)" = 05e60a37aa5e19aba8a184a9343eb864dbb89ce364929a0735f78321ac8eaaa7
# compositionCommerce
test "$(grep -cxF -- '  function compositionCommerce() {' "$F")" -eq 1
s=$(grep -nxF -- '  function compositionCommerce() {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-2)),$((s+9))p" "$F" | sha256sum | cut -d' ' -f1)" = 4a63f20b072474874360d2318c9afa37ba26830c5c87441b1235a0963200fe3c
test "$(grep -cxF -- '      ...compositionSharedOAuth(),' "$F")" -eq 1
test "$(grep -cxF -- '  const commerceBinding = compositionCommerce();' "$F")" -eq 1
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "$T/known.json"
echo "T=$T"
```
Each hash proves one function declaration (with its doc comment) is byte-identical to the design tip; each call line is checked to be present exactly once. A mismatch is STOP-STALE: the sheet is regenerated, nothing is frozen. `--update` writes the parent's architecture metrics into the working-tree baseline (never committed, restored in step 7) so step 5 compares the candidate with its parent, metric by metric and edge by edge, using the tool's own comparison.

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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/shared-oauth-commerce.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/shared-oauth-commerce.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/shared-oauth-commerce.ts apps/website/src/server/runtime/composition/site-deps/__tests__/shared-oauth-commerce.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): H2 shared-oauth-commerce become module functions with real inputs (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
