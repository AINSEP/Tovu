# H1 — `chat-orphans-project-keys` (deps-split v4, hoisted closures → module functions)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
Root-level function declarations inside `composeSiteRouteDeps` (hoisted closures with `Record<string, never>` or empty placeholder signatures) become module functions with real `(required, optional = {})` inputs; each call passes the variables the body reads. No `await` is added or moved; the call stays where it is.

- `warnCompositionChatOrphans` stays **in deps.ts**, as a module-level function placed directly after `composeSiteRouteDeps`'s closing brace: `platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts` reads deps.ts and requires `warnOnOrphanedChatRows(` to occur in deps.ts after `await openCompositionStore({ dbPath }, { overrides })` (that call is in `createSiteRouteDeps`, above). Its signature becomes `async function warnCompositionChatOrphans(required: WarnCompositionChatOrphansRequired, _optional = {}): Promise<void>` (not exported) with `const { … } = required;` as its first line; the body is otherwise verbatim (it keeps reading the module singleton `consoleLogger`).
- `compositionProjectKeys` reads the root `let bindSharedApiOAuth` inside its `bindOAuth` closure, so it receives a getter. The getter read needs one local so TypeScript keeps the narrowing (a second `bindSharedApiOAuth()` call is not narrowed): the three lines
```ts
        if (!bindSharedApiOAuth) throw new Error("Shared connections are not available yet. Reopen this saved connection and try again.");
        return bindSharedApiOAuth(input);
```
become exactly
```ts
        const bind = bindSharedApiOAuth();
        if (!bind) throw new Error("Shared connections are not available yet. Reopen this saved connection and try again.");
        return bind(input);
```
(the cell is still read once per `bindOAuth` call, at call time — the original read it twice synchronously, same value). Nothing else in either body changes.

### `warnCompositionChatOrphans` (tip 1045-1060, 7 code lines; called at tip 1043)
- **To**: module level of deps.ts (see note); first body line `const { dbPath, store, kernel, chatDbPath } = required;`, then the tip body **verbatim** (getter fields read as `name()`), leading doc comment moved with it.
- **Call** (tip 1043, `await warnCompositionChatOrphans({}, {});`) becomes exactly:
```ts
  await warnCompositionChatOrphans({ dbPath, store, kernel, chatDbPath });
```
- **Inputs** (`WarnCompositionChatOrphansRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `dbPath` | value | by the rule (root parameter) |
| `store` | value | `const { store, onStoreClose } = opened;` |
| `kernel` | value | `const kernel = store.content;` |
| `chatDbPath` | value | `const chatDbPath = resolveChatDbPath({ dbPath }, { overrides });` |

### `compositionProjectKeys` (tip 1862-1878, 14 code lines; called at tip 1860)
- **To**: `apps/website/src/server/runtime/composition/site-deps/project-keys.ts`, `export function compositionProjectKeys(required: CompositionProjectKeysRequired, _optional = {})`; first body line `const { resolvedSiteBinding, kernel, clock, projectKeyReferences, projectSiteId, projectStore, providerConfigSource, providerPlugins, bindSharedApiOAuth } = required;`, then the tip body **verbatim** (getter fields read as `name()`), leading doc comment moved with it.
- **Call** (tip 1860, `const projectKeys = compositionProjectKeys();`) becomes exactly:
```ts
  const projectKeys = compositionProjectKeys({ resolvedSiteBinding, kernel, clock, projectKeyReferences, projectSiteId, projectStore, providerConfigSource, providerPlugins, bindSharedApiOAuth: () => bindSharedApiOAuth });
```
- **Inputs** (`CompositionProjectKeysRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `resolvedSiteBinding` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"]` |
| `kernel` | value | `const kernel = store.content;` |
| `clock` | value | B03 output → `ReturnType<typeof composeStoreBasics>["clock"]` |
| `projectKeyReferences` | value | B17 output → `ReturnType<typeof composeAssistantCredentials>["projectKeyReferences"]` |
| `projectSiteId` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `projectStore` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `providerConfigSource` | value | B18 output → `ReturnType<typeof composeProviderConfigSource>["providerConfigSource"]` |
| `providerPlugins` | value | `const providerPlugins = await providerPluginBoot({ overrides })({` |
| `bindSharedApiOAuth` | **getter** `() => bindSharedApiOAuth` | `let bindSharedApiOAuth: ((input: { keyId: string; use: boolean }) => Promise<void>) \| undefined;` |

Type each required field mechanically: a B-sheet output → `ReturnType<typeof composeX>["name"]` as shown; `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js`; `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the call or is a root `let` reassigned after it; passing such a binding as a value is either a TypeScript error (TS2448/TS2454) or reads a stale cell — the characterization test fails on the latter.

### Imports used by the moved bodies
| name | from (as written in deps.ts) | action |
|---|---|---|
| `createOtherSiteKeys` | `./other-site-keys.js` | **move** (delete from deps.ts) |
| `createProjectKeys` | `#src/features/project-keys/service` | **move** (delete from deps.ts) |
| `createSharedOAuthLabels` | `#src/features/api-connections/shared-owner` | **move** (delete from deps.ts) |
| `isLocalTovuHost` | `./registered-sites.js` | **move** (delete from deps.ts) |
| `sqliteConnectionOf` | `#src/platform/db/kernel/drivers/sqlite` | **move** (delete from deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

(`warnOnOrphanedChatRows` stays imported by deps.ts: its user stays there.)

## Importers to repoint
None: nothing exported from deps.ts moves.

## Source readers of deps.ts (literal match on the tip)
- `apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts` — its literal(s) found in this range: `TOVU_RUNTIME_MODE`, `TOVU_SITE_KEY`, `site-key.hex`, `newsletterKeyring`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/project-keys.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts` — its literal(s) found in this range: `identityReady`, `'settingsReady'`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/project-keys.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts` — its literal(s) found in this range: `cli/commands/serve.ts`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/project-keys.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts` — its literal(s) found in this range: `preparePostSearchIndex`, `await warnOnOrphanedChatRows(`, `preparePostSearchIndex(`, `  await normalizeSiteVaultAtBoot({ kernel, workspaceId, siteDir: siteD`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/project-keys.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts` — its literal(s) found in this range: `better-sqlite3`, `already-migrated`, `warnOnOrphanedChatRows`, `warnOnOrphanedChatRows(`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/project-keys.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts` — its literal(s) found in this range: `(required, optional)`, `, workspaceId: `. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/project-keys.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts` — its literal(s) found in this range: `apps/website/src`, `server/runtime/composition/app.ts`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/project-keys.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts` — its literal(s) found in this range: `apps/website/`, `apps/website/src/server/`, `apps/website/src/server`, `apps/website/src/server/runtime/composition`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/project-keys.ts` (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/chat-orphans-project-keys.characterization.unit.test.ts`)
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
const FILES: Record<string, URL> = {"warnCompositionChatOrphans":"../../deps.ts","compositionProjectKeys":"../project-keys.ts"};

test("H1: the calls keep their place and the root declares none of the functions", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  assert.deepEqual(body.filter((s) => ts.isFunctionDeclaration(s)).map((s) => (s as ts.FunctionDeclaration).name?.text).filter((n) => ["warnCompositionChatOrphans","compositionProjectKeys"].includes(n ?? "")), []);
  { const at = body.findIndex((s) => firstLine(s).startsWith("await warnCompositionChatOrphans({")); assert.ok(at > 0, "warnCompositionChatOrphans call missing"); assert.ok(firstLine(body[at - 1]).startsWith("const chat = store.chat;")); }
  { const at = body.findIndex((s) => firstLine(s).startsWith("const projectKeys = compositionProjectKeys({")); assert.ok(at > 0, "compositionProjectKeys call missing"); assert.ok(firstLine(body[at - 1]).startsWith("let bindSharedApiOAuth: ((input: { keyId: string; use: boolean }) => Promise<void>) | undefined;")); }
});

test("H1: each function is a module function whose first statement destructures its inputs", () => {
  for (const [name, url] of Object.entries(FILES)) {
    const first = bodyOf(parse(new URL(url, import.meta.url)), name)[0];
    assert.ok(first && ts.isVariableStatement(first) && first.getText().endsWith("= required;"), name);
  }
});

test("H1: getter inputs are only read lazily", () => {
  const getters: readonly string[] = ["bindSharedApiOAuth"];
  for (const [name, url] of Object.entries(FILES)) assert.deepEqual(eagerReads(bodyOf(parse(new URL(url, import.meta.url)), name), getters), [], name);
});
```
Red first (prove the pins bite, then revert each): move one call one statement down → test 1 fails; replace one function's first line with a plain statement → test 2 fails; add `void bindSharedApiOAuth();` as the second statement of `compositionProjectKeys` → test 3 fails. Record the failing outputs in the commit message body.

## Steps (fail-closed; every block starts with `set -euo pipefail`; any non-zero exit = STOP with the step number)
**1. Start (clean tree, on the branch's last green commit).**
```bash
set -euo pipefail
git diff --quiet && git diff --cached --quiet
F=apps/website/src/server/runtime/composition/deps.ts
T=$(mktemp -d)
git rev-parse HEAD > "$T/parent"
# warnCompositionChatOrphans
test "$(grep -cxF -- '  async function warnCompositionChatOrphans(_required: Record<string, never>, _options = {}): Promise<void> {' "$F")" -eq 1
s=$(grep -nxF -- '  async function warnCompositionChatOrphans(_required: Record<string, never>, _options = {}): Promise<void> {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+15))p" "$F" | sha256sum | cut -d' ' -f1)" = 1e32665cb664d0ba9622d8e0a36ba2681b9482c5ea81f68741d1694ef8588fee
# compositionProjectKeys
test "$(grep -cxF -- '  function compositionProjectKeys() {' "$F")" -eq 1
s=$(grep -nxF -- '  function compositionProjectKeys() {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-2)),$((s+14))p" "$F" | sha256sum | cut -d' ' -f1)" = 52eeae6ff52f2c32572186a6a87b1259a951e5b809ddfa7421894eba0e625913
test "$(grep -cxF -- '  await warnCompositionChatOrphans({}, {});' "$F")" -eq 1
test "$(grep -cxF -- '  const projectKeys = compositionProjectKeys();' "$F")" -eq 1
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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/project-keys.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/chat-orphans-project-keys.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/project-keys.ts apps/website/src/server/runtime/composition/site-deps/__tests__/chat-orphans-project-keys.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): H1 chat-orphans-project-keys become module functions with real inputs (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
