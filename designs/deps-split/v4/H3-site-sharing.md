# H3 — `site-sharing` (deps-split v4, hoisted closures → module functions)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
Root-level function declarations inside `composeSiteRouteDeps` (hoisted closures with `Record<string, never>` or empty placeholder signatures) become module functions with real `(required, optional = {})` inputs; each call passes the variables the body reads. No `await` is added or moved; the call stays where it is.

- **Size split (68 code lines → about 28 + 45)**: the `delivery` port object is built by a second module function in the same file, `shareDeliveryPorts(required: ShareDeliveryPortsRequired, _optional = {}): Parameters<typeof resolveShareDelivery>[0]`. Its body is, verbatim and in this order: tip lines 2846-2862 (the `resolveShareCredential` and `createShareHostKit` closures, used only by the port object's `objectStore`), then `return {`, tip lines 2877-2905 (the object's entries), `};`. In `configureSiteSharing`, tip lines 2846-2862 are deleted and tip lines 2876-2906 (`          delivery: selection => resolveShareDelivery({` … `          }, selection),`) become the one line
```ts
          delivery: selection => resolveShareDelivery(shareDeliveryPorts({ selection, registry, credentials, routeDeps, workspaceId, guardedOutboundHttpClient, siteAssistantSecretSealer, siteAssistantSecretKeyring, publishContentPeerHttpClient, settingsRepo, mediaStorePorts }), selection),
```
  Evaluation order inside one `delivery(selection)` call is unchanged (the object is built, then `resolveShareDelivery` runs). The two closures are now created per `delivery` call instead of once per boot; they hold no state (one reads `credentials`, the other calls `createDeployHostKit({})` when invoked, as before). `ShareDeliveryPortsRequired`: `selection` → `Parameters<typeof resolveShareDelivery>[1]`, `registry` → `SiteShareRegistry`, `credentials` → `ReturnType<typeof composePublishCredentialSource>`, the rest as in the table below. `createDeployHostKit`, `toDeployTargetCredential`, `readMediaObjectStoreSetting` follow the import table.

### `configureSiteSharing` (tip 2838-2913, 68 code lines; called at tip 2836)
- **To**: `apps/website/src/server/runtime/composition/site-deps/site-sharing.ts`, `export function configureSiteSharing(required: ConfigureSiteSharingRequired, _optional = {}): void`; first body line `const { dbPath, resolvedSiteBinding, agentPluginLayout, skillLayout, resolvedThemesDir, resolvedUploadsDir, mediaStorePorts, blobStore, workspaceId, identity, settingsRepo, siteAssistantSecretKeyring, siteAssistantSecretSealer, publishContentPeerHttpClient, guardedOutboundHttpClient, routeDeps, savedKeys } = required;`, then the tip body **verbatim** (getter fields read as `name()`), leading doc comment moved with it.
- **Call** (tip 2836, `configureSiteSharing({}, {});`) becomes exactly:
```ts
  configureSiteSharing({ dbPath, resolvedSiteBinding, agentPluginLayout, skillLayout, resolvedThemesDir, resolvedUploadsDir, mediaStorePorts, blobStore, workspaceId, identity, settingsRepo, siteAssistantSecretKeyring, siteAssistantSecretSealer, publishContentPeerHttpClient, guardedOutboundHttpClient, routeDeps, savedKeys });
```
- **Inputs** (`ConfigureSiteSharingRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `dbPath` | value | by the rule (root parameter) |
| `resolvedSiteBinding` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"]` |
| `agentPluginLayout` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"]` |
| `skillLayout` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["skillLayout"]` |
| `resolvedThemesDir` | value | B01 output → `ReturnType<typeof composeAgentPluginBootstrap>["resolvedThemesDir"]` |
| `resolvedUploadsDir` | value | B02 output → `ReturnType<typeof composeMediaStorage>["resolvedUploadsDir"]` |
| `mediaStorePorts` | value | B02 output → `ReturnType<typeof composeMediaStorage>["mediaStorePorts"]` |
| `blobStore` | value | B02 output → `ReturnType<typeof composeMediaStorage>["blobStore"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `identity` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["identity"]` |
| `settingsRepo` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["settingsRepo"]` |
| `siteAssistantSecretKeyring` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"]` |
| `siteAssistantSecretSealer` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"]` |
| `publishContentPeerHttpClient` | value | B19 output → `ReturnType<typeof composeMailHttp>["publishContentPeerHttpClient"]` |
| `guardedOutboundHttpClient` | value | B23 output → `ReturnType<typeof composeOutboundConnections>["guardedOutboundHttpClient"]` |
| `routeDeps` | value | `const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {` |
| `savedKeys` | value | `const savedKeys = composeSiteSavedKeys({ workspaceId, sealer: siteAssistantSecretSealer });` |

Type each required field mechanically: a B-sheet output → `ReturnType<typeof composeX>["name"]` as shown; `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js`; `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the call or is a root `let` reassigned after it; passing such a binding as a value is either a TypeScript error (TS2448/TS2454) or reads a stale cell — the characterization test fails on the latter.

### Imports used by the moved bodies
| name | from (as written in deps.ts) | action |
|---|---|---|
| `SiteShareRegistry` | `#src/features/site-backup/share-registry` | **move** (delete from deps.ts) |
| `artifactStoreBinding` | `#src/features/object-storage/index` | **move** (delete from deps.ts) |
| `artifactStoreTarget` | `#src/features/object-storage/index` | **move** (delete from deps.ts) |
| `composePublishCredentialSource` | `#src/features/deployments/static-publish/credentials` | copy (still used in deps.ts) |
| `createDeployHostKit` | `#src/features/deployments/deploy-targets/host-kit` | copy (still used in deps.ts) |
| `createRuntimeShareDelivery` | `#src/features/site-backup/share-hosting` | **move** (delete from deps.ts) |
| `createSiteCreationTimeZone` | `#src/platform/site-dir/read-site-dir` | copy (still used in deps.ts) |
| `createSiteShareBackend` | `#src/features/site-backup/share-backend` | **move** (delete from deps.ts) |
| `join` | `node:path` | copy (still used in deps.ts) |
| `prepareShareContent` | `#src/features/site-backup/share-preparation` | **move** (delete from deps.ts) |
| `readMediaObjectStoreSetting` | `#src/features/object-storage/index` | copy (still used in deps.ts) |
| `resolvePublishDestinationCredential` | `#src/features/publish-content/destination-credential` | **move** (delete from deps.ts) |
| `resolveShareDelivery` | `#src/features/site-backup/share-hosting` | **move** (delete from deps.ts) |
| `resolveShareDirectory` | `./site-paths.js` | **move** (delete from deps.ts) |
| `resolveSiteTimeZone` | `#src/features/settings/site-timezone` | **move** (delete from deps.ts) |
| `rewriteArchiveMedia` | `#src/server/runtime/composition/site-portability` | **move** (delete from deps.ts) |
| `sanitizeShareDatabase` | `#src/server/runtime/composition/site-portability` | copy (still used in deps.ts) |
| `selectArtifactStoreProvider` | `#src/features/object-storage/index` | **move** (delete from deps.ts) |
| `selectConnectedDestination` | `#src/features/publish-content/peers` | **move** (delete from deps.ts) |
| `tmpdir` | `node:os` | copy (still used in deps.ts) |
| `toDeployTargetCredential` | `#src/features/deployments/static-publish/credentials` | copy (still used in deps.ts) |
| `zipFolderFiles` | `@jini-ai/agent-plugins/folder-zip` | **move** (delete from deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

## Importers to repoint
None: nothing exported from deps.ts moves.

## Source readers of deps.ts (literal match on the tip)
- none found by literal match on the tip; step 6 runs every source reader anyway.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/site-sharing.characterization.unit.test.ts`)
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
const FILES: Record<string, URL> = {"configureSiteSharing":"../site-sharing.ts"};

test("H3: the calls keep their place and the root declares none of the functions", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  assert.deepEqual(body.filter((s) => ts.isFunctionDeclaration(s)).map((s) => (s as ts.FunctionDeclaration).name?.text).filter((n) => ["configureSiteSharing"].includes(n ?? "")), []);
  { const at = body.findIndex((s) => firstLine(s).startsWith("configureSiteSharing({")); assert.ok(at > 0, "configureSiteSharing call missing"); assert.ok(firstLine(body[at - 1]).startsWith("const savedKeys = composeSiteSavedKeys({ workspaceId, sealer: siteAssistantSecretSealer });")); }
});

test("H3: each function is a module function whose first statement destructures its inputs", () => {
  for (const [name, url] of Object.entries(FILES)) {
    const first = bodyOf(parse(new URL(url, import.meta.url)), name)[0];
    assert.ok(first && ts.isVariableStatement(first) && first.getText().endsWith("= required;"), name);
  }
});

test("H3: getter inputs are only read lazily", () => {
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
# configureSiteSharing
test "$(grep -cxF -- '  function configureSiteSharing(_required: Record<string, never>, _options = {}): void {' "$F")" -eq 1
s=$(grep -nxF -- '  function configureSiteSharing(_required: Record<string, never>, _options = {}): void {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+75))p" "$F" | sha256sum | cut -d' ' -f1)" = cefc8c0d28b3361491049871c2ed839a93319b9de3801842a8d24221891c0ec1
test "$(grep -cxF -- '  configureSiteSharing({}, {});' "$F")" -eq 1
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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/site-sharing.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/site-sharing.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/site-sharing.ts apps/website/src/server/runtime/composition/site-deps/__tests__/site-sharing.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): H3 site-sharing become module functions with real inputs (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
