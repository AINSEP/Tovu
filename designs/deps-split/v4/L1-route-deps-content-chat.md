# L1 — `route-deps-content-chat` (deps-split v4, literal runs)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
Contiguous entry runs of the `routeDeps` object literal (tip `const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {`, 2135-2715). A run never crosses one of the literal's 7 spreads (they stay in the literal, in place), so every key keeps its position relative to every spread and every other key: property evaluation order and overwrite order are unchanged by construction. Each run becomes one spread of a call at the run's place. No run contains a top-level `await` (the 7 `await`s inside entries are in nested async functions and move with them). Self-reads of `routeDeps` are getters. Runs are cut at ≤44 code lines so each function is ≤50 with its 4 frame lines. This sheet runs after H2.

### `routeDepsContentTrash` — tip 2136-2186 (21 entries, 44 code lines; first key `siteBackupSanitize`, last `postSearch`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-content-chat.ts`: `export function routeDepsContentTrash(required: RouteDepsContentTrashRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "siteBackupSanitize" | "pluginExports" | "assistantAgentInventory" | "workspaceId" | "peerSiteReads" | "workspaceRepo" | "trash" | "removePost" | "removeComment" | "removeMedia" | "removeRedirect" | "removeWidget" | "forgetRemovedMedia" | "forgetRemovedPost" | "sweepTrash" | "isTrashableEntityType" | "registry" | "db" | "postRepo" | "postGoLiveCandidates" | "postSearch">` with body `const { assistantAgentInventory, resolvedSiteBinding, kernel, workspaceId, postSearchBackfillReady, trashRegistry, sqliteTrashDb, trashRepo, trashAdapters, trashTransaction, trash, postRepo, pluginExports } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`), then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsContentTrash({ assistantAgentInventory, resolvedSiteBinding, kernel, workspaceId, postSearchBackfillReady, trashRegistry, sqliteTrashDb, trashRepo, trashAdapters, trashTransaction, trash, postRepo, pluginExports }),
```
- **Inputs** (`RouteDepsContentTrashRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `assistantAgentInventory` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["assistantAgentInventory"]` |
| `resolvedSiteBinding` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"]` |
| `kernel` | value | `const kernel = store.content;` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `postSearchBackfillReady` | value | B03 output → `ReturnType<typeof composeStoreBasics>["postSearchBackfillReady"]` |
| `trashRegistry` | value | B08 output → `ReturnType<typeof composeTrashStores>["trashRegistry"]` |
| `sqliteTrashDb` | value | B08 output → `ReturnType<typeof composeTrashStores>["sqliteTrashDb"]` |
| `trashRepo` | value | B08 output → `ReturnType<typeof composeTrashStores>["trashRepo"]` |
| `trashAdapters` | value | B10 output → `ReturnType<typeof composeTrashAdapters>["trashAdapters"]` |
| `trashTransaction` | value | B11 output → `ReturnType<typeof composeTrashService>["trashTransaction"]` |
| `trash` | value | B11 output → `ReturnType<typeof composeTrashService>["trash"]` |
| `postRepo` | value | B20 output → `ReturnType<typeof composeContentStores>["postRepo"]` |
| `pluginExports` | value | B24 output → `ReturnType<typeof composePreAssembly>["pluginExports"]` |

### `routeDepsChatAgents` — tip 2187-2208 (7 entries, 7 code lines; first key `slugChangeCapture`, last `conversationToolApprovals`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-content-chat.ts`: `export function routeDepsChatAgents(required: RouteDepsChatAgentsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "slugChangeCapture" | "docBodyAsPageHtml" | "pagesHtmlStore" | "chatHistory" | "chatRunLedger" | "agentSessions" | "conversationToolApprovals">` with body `const { kernel, chat, clock, outbox, entryRefsRepo, tracker, postRepo, pluginExports } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`), then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsChatAgents({ kernel, chat, clock, outbox, entryRefsRepo, tracker, postRepo, pluginExports }),
```
- **Inputs** (`RouteDepsChatAgentsRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `kernel` | value | `const kernel = store.content;` |
| `chat` | value | `const chat = store.chat;` |
| `clock` | value | B03 output → `ReturnType<typeof composeStoreBasics>["clock"]` |
| `outbox` | value | B07 output → `ReturnType<typeof composeEventsOrigin>["outbox"]` |
| `entryRefsRepo` | value | B14 output → `ReturnType<typeof composeContentRepos>["entryRefsRepo"]` |
| `tracker` | value | `const { observability, tracker, aiTraceSink } = providerPlugins;` |
| `postRepo` | value | B20 output → `ReturnType<typeof composeContentStores>["postRepo"]` |
| `pluginExports` | value | B24 output → `ReturnType<typeof composePreAssembly>["pluginExports"]` |

Type each required field mechanically: a B-sheet output → `ReturnType<typeof composeX>["name"]` as shown; `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js`; `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the call or is a root `let` reassigned after it; passing such a binding as a value is either a TypeScript error (TS2448/TS2454) or reads a stale cell — the characterization test fails on the latter.

### Imports used by the moved entries
| name | from (as written in deps.ts) | action |
|---|---|---|
| `COMMENT_ENTITY_TYPE` | `#src/features/trash/index` | copy (still used in deps.ts) |
| `MEDIA_ENTITY_TYPE` | `#src/features/trash/index` | copy (still used in deps.ts) |
| `POST_ENTITY_TYPE` | `#src/features/trash/index` | copy (still used in deps.ts) |
| `PagesHtmlDocumentStore` | `#src/features/pages/index` | **move** (delete from deps.ts) |
| `REDIRECT_ENTITY_TYPE` | `#src/features/trash/index` | copy (still used in deps.ts) |
| `SqliteWorkspaceRepo` | `#src/features/workspace/index` | **move** (delete from deps.ts) |
| `bindForgetRemovedEntity` | `@jini-ai/cms/trash` | copy (still used in deps.ts) |
| `bindRemoveEntity` | `@jini-ai/cms/trash` | copy (still used in deps.ts) |
| `bindWidgetRemoval` | `#src/features/trash/index` | **move** (delete from deps.ts) |
| `createChatRunLedger` | `#src/assistant/index` | **move** (delete from deps.ts) |
| `createChatStoreFactory` | `#src/assistant/index` | **move** (delete from deps.ts) |
| `createPeerSiteReads` | `./peer-site-reads.js` | **move** (delete from deps.ts) |
| `createSqliteAgentSessionStore` | `#src/assistant/index` | **move** (delete from deps.ts) |
| `createSqliteConversationToolApprovalStore` | `#src/assistant/persistence/conversation-tool-approval-store` | **move** (delete from deps.ts) |
| `createTrashSweep` | `@jini-ai/cms/trash` | **move** (delete from deps.ts) |
| `getSlugChangeCapture` | `#src/platform/routing/adapter` | **move** (delete from deps.ts) |
| `postSearchIndexFor` | `#src/features/post/index` | **move** (delete from deps.ts) |
| `removeEntityWithoutBlocker` | `#src/features/trash/index` | copy (still used in deps.ts) |
| `renderDocBodyAsPageHtml` | `#src/server/inbound/public-http/http/site/render/content-html` | **move** (delete from deps.ts) |
| `sanitizeShareDatabase` | `#src/server/runtime/composition/site-portability` | copy (still used in deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

Also import `type NewsletterRouteDeps` (`../../../inbound/admin-http/routes/newsletter/deps.js`) and `type ByokToolSurfaceDeps` (deps.ts's specifier with one more `../`) for the return types; both stay imported by deps.ts (the root literal's annotation).

## Importers to repoint
None.

## Source readers of deps.ts (literal match on the tip)
- `apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts` — its literal(s) found in this range: `createServingApp`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-content-chat.ts` (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-content-chat.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins: each run's call sits in the routeDeps literal exactly where its entries sat (between the same
// neighbours, spreads included), each run returns its keys in tip order, and getters are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const RUNS = new URL("../route-deps-content-chat.ts", import.meta.url);
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

test("L1: the run calls sit where their entries sat", () => {
  const items = literalItems();
  const at = items.findIndex((t) => t.startsWith("...routeDepsContentTrash("));
  assert.ok(at >= 0, "first run call missing");
  assert.equal(at, 0);
  const expected: readonly string[] = ["...routeDepsContentTrash(","...routeDepsChatAgents(","...compositionApprovalOverrides({ overrides })"];
  expected.forEach((prefix, i) => assert.ok(items[at + i]?.startsWith(prefix), `item ${at + i}: ${items[at + i]}`));
});

test("L1: each run returns its keys in tip order", () => {
  const file = parse(RUNS);
  const keys: Record<string, readonly string[]> = {"routeDepsContentTrash":["siteBackupSanitize","pluginExports","assistantAgentInventory","workspaceId","peerSiteReads","workspaceRepo","trash","removePost","removeComment","removeMedia","removeRedirect","removeWidget","forgetRemovedMedia","forgetRemovedPost","sweepTrash","isTrashableEntityType","registry","db","postRepo","postGoLiveCandidates","postSearch"],"routeDepsChatAgents":["slugChangeCapture","docBodyAsPageHtml","pagesHtmlStore","chatHistory","chatRunLedger","agentSessions","conversationToolApprovals"]};
  for (const [name, expected] of Object.entries(keys)) {
    const ret = bodyOf(file, name).find((s): s is ts.ReturnStatement => ts.isReturnStatement(s));
    assert.ok(ret?.expression && ts.isObjectLiteralExpression(ret.expression), name);
    assert.deepEqual(ret.expression.properties.map((p) => p.name?.getText() ?? ""), expected);
  }
});

test("L1: getter inputs are only read lazily", () => {
  const file = parse(RUNS);
  for (const name of ["routeDepsContentTrash","routeDepsChatAgents"]) assert.deepEqual(eagerReads(bodyOf(file, name), []), [], name);
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
# routeDepsContentTrash
test "$(grep -cxF -- '    siteBackupSanitize: sanitizeShareDatabase,' "$F")" -eq 1
s=$(grep -nxF -- '    siteBackupSanitize: sanitizeShareDatabase,' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+50))p" "$F" | sha256sum | cut -d' ' -f1)" = 1ab683c94621410f754c5742466a848d1cf9a5a99495ee81022936431c0eb40f
# routeDepsChatAgents
test "$(grep -cxF -- '    // SPEC-009 REQ-15 — `updatePost` looks the capture up per write, so whatever is bound in routing'\''s' "$F")" -eq 1
s=$(grep -nxF -- '    // SPEC-009 REQ-15 — `updatePost` looks the capture up per write, so whatever is bound in routing'\''s' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+21))p" "$F" | sha256sum | cut -d' ' -f1)" = ebe45f08221794360bcff91455bb97b8e09da686632a51ec8131b4c75ee1290d
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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/route-deps-content-chat.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-content-chat.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/route-deps-content-chat.ts apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-content-chat.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): L1 route-deps-content-chat literal runs move out of composeSiteRouteDeps (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed, and `development/scripts/size-debt.json` only if `check:size` printed `Delete stale debt entry` for a deps.ts row (delete exactly that row) — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
