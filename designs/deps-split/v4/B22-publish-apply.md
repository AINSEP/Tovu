# B22 — `publish-apply` (deps-split v4)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
- **Range**: `composeSiteRouteDeps` statements on tip lines **2014-2077** with their leading comment lines **2014-2013** (1 statements, 58 code lines). No `await`, no write to a root `let` (checked by the design census).
- **To**: new file `apps/website/src/server/runtime/composition/site-deps/publish-apply.ts`, function `export function composePublishContentApplyPort(required: ComposePublishContentApplyPortRequired, _optional = {})` whose body is the range **verbatim, same order, comments included**, followed by `return { publishContentApplyPort };`. Getter fields are read as `name()` at each use inside the moved text (the only allowed text edit besides imports). Why-comments move with their code.
- **Root replacement** (same position, one statement):
```ts
const { publishContentApplyPort } = composePublishContentApplyPort({ workspaceId, publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, clock, idGen, outbox, changeSets, identity, postRepo, trashRepo, trash, mediaRepo, assetBlobRepo, blobStore, mediaContentTypeStore, redirectsWriteDeps, menuRepo, navLocationBindingRepo, formDefinitionRepo, contentTypeRepo, contentTypeIndexProvisioner, taxonomyRepo, termRepo, sqliteEntryTermRepo, taxonomyRevisionRepo, stampWatermark, entryRepo, entryRefsRepo, widgetBindingRepo, settingsRepo, settingsPrincipals, presentationRepo, siteThemes, resolvedThemesDir, publishContentSeedHash });
```
- **Outputs** (destructured under the same names, so no other line of deps.ts changes): `publishContentApplyPort`.
- **Module helpers read by the range**: none.
- **Note**: 58 code lines. Move the value of the `publishContentDeps:` property (the whole `toPublishContentApplyDeps({ … })` call, verbatim) into `publishContentApplyDeps(required)` in the same file, returning that call; the property becomes `publishContentDeps: publishContentApplyDeps({ …its inputs… }),` at the same position. Argument evaluation order is unchanged (the property keeps its place in the object literal).

### Required inputs (`ComposePublishContentApplyPortRequired`)
| field | how passed | declared at | declared as |
|---|---|---|---|
| `workspaceId` | value | tip 1033 | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `publishContentBundleRepo` | value | tip 1983 | `const publishContentBundleRepo = new SqlitePublishContentBundleRepo({ store: kernel });` |
| `publishContentBaselineRepo` | value | tip 1984 | `const publishContentBaselineRepo = new SqlitePublishContentBaselineRepo({ store: kernel });` |
| `publishContentRunRepo` | value | tip 1608 | `const publishContentRunRepo = new SqlitePublishContentRunRepo({ store: kernel });` |
| `clock` | value | tip 1081 | `const clock = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() };` |
| `idGen` | value | tip 1082 | `const idGen = { newId: () => randomUUID() };` |
| `outbox` | value | tip 1294 | `const outbox = new SqliteOutboxAdapter({ store: kernel });` |
| `changeSets` | value | tip 1973 | `const changeSets = new SqliteChangeSetRepo({ store: kernel });` |
| `identity` | value | tip 1120 | `const identity = createSqliteIdentityRouteDeps({ db: kernel, workspaceId, clock, idGen, permissionGrants: createAppPermissionGrants({}), ownerCredenti` |
| `postRepo` | value | tip 1965 | `const postRepo = new SqlitePostRepo({ store: kernel });` |
| `trashRepo` | value | tip 1380 | `const trashRepo = new SqliteTrashRepo({ store: kernel });` |
| `trash` | value | tip 1521 | `const trash = createTrashService({` |
| `mediaRepo` | value | tip 1978 | `const mediaRepo = new SqliteMediaRepo({ store: kernel });` |
| `assetBlobRepo` | value | tip 1979 | `const assetBlobRepo = new SqliteAssetBlobRepo({ store: kernel });` |
| `blobStore` | value | tip 1020 | `const { blobStore, mediaIsRemoteByEnv, isMediaRemote } = createMediaBlobStore({ uploadsDir: resolvedUploadsDir, env: process.env, ports: mediaStorePor` |
| `mediaContentTypeStore` | value | tip 1982 | `const mediaContentTypeStore = new SqliteMediaContentTypeStore({ store: kernel });` |
| `redirectsWriteDeps` | value | tip 1549 | `const redirectsWriteDeps: RedirectsWriteDeps = {` |
| `menuRepo` | value | tip 1193 | `const menuRepo = new SqliteMenuRepo({ store: kernel });` |
| `navLocationBindingRepo` | value | tip 1194 | `const navLocationBindingRepo = new SqliteNavLocationBindingRepo({ store: kernel });` |
| `formDefinitionRepo` | value | tip 1637 | `const formDefinitionRepo = new SqliteFormDefinitionRepo({ store: kernel });` |
| `contentTypeRepo` | value | tip 1644 | `const contentTypeRepo = new SqliteContentTypeRepo({ store: kernel });` |
| `contentTypeIndexProvisioner` | value | tip 1645 | `const contentTypeIndexProvisioner = new NoopContentTypeIndexProvisioner();` |
| `taxonomyRepo` | value | tip 1628 | `const taxonomyRepo = new SqliteTaxonomyRepo({ db: kernel, workspaceId: workspaceId });` |
| `termRepo` | value | tip 1629 | `const termRepo = new SqliteTermRepo({ db: kernel, workspaceId: workspaceId });` |
| `sqliteEntryTermRepo` | value | tip 1626 | `const sqliteEntryTermRepo = new SqliteEntryTermRepo({ db: kernel, workspaceId: workspaceId });` |
| `taxonomyRevisionRepo` | value | tip 1630 | `const taxonomyRevisionRepo = new SqliteTaxonomyRevisionRepo({ db: kernel, workspaceId: workspaceId });` |
| `stampWatermark` | value | tip 1631 | `const stampWatermark = storeBound.stampWatermark;` |
| `entryRepo` | value | tip 1622 | `const entryRepo = new SqliteEntryRepo({ store: kernel });` |
| `entryRefsRepo` | value | tip 1636 | `const entryRefsRepo = new SqliteEntryRefsRepo({ store: kernel });` |
| `widgetBindingRepo` | value | tip 1635 | `const widgetBindingRepo = new SqliteWidgetRegionBindingRepo(kernel);` |
| `settingsRepo` | value | tip 1133 | `const settingsRepo = new SqliteSettingsRepo({ store: kernel });` |
| `settingsPrincipals` | value | tip 1122 | `const settingsPrincipals = {` |
| `presentationRepo` | value | tip 1132 | `const presentationRepo = new SqlitePresentationSettingsRepo({ store: kernel });` |
| `siteThemes` | value | tip 2002 | `const siteThemes = discoverAllBuiltInThemes({ dir: resolvedThemesDir, source: "built-in" });` |
| `resolvedThemesDir` | value | tip 989 | `const resolvedThemesDir = resolveThemesDirOverride(resolvedSiteBinding, overrides);` |
| `publishContentSeedHash` | value | tip 1993 | `const publishContentSeedHash = createSqlitePublishContentSeedHash({` |

Type each required field mechanically from the binding's declaration (column "declared as"): `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js` (moved by M2); `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the range or is a root `let` reassigned later; passing such a binding as a value is either a TypeScript error (TS2448/TS2454 "used before its declaration", verified on a probe) or reads a stale cell — the characterization test below fails on the latter.

### Imports used by the range
| name | from | action |
|---|---|---|
| `POST_ENTITY_TYPE` | `#src/features/trash/index` | copy (still used in deps.ts) |
| `bindForgetRemovedEntity` | `@jini-ai/cms/trash` | copy (still used in deps.ts) |
| `bindRemoveEntity` | `@jini-ai/cms/trash` | copy (still used in deps.ts) |
| `buildContentPublishPorts` | `#src/server/runtime/composition/content-publish-ports` | **move** (delete from deps.ts) |
| `createPublishContentApplyPort` | `#src/features/publish-content/apply-port` | **move** (delete from deps.ts) |
| `removeEntityWithoutBlocker` | `#src/features/trash/index` | copy (still used in deps.ts) |
| `rescanThemes` | `#src/features/theme/index` | copy (still used in deps.ts) |
| `toPublishContentApplyDeps` | `#src/features/publish-content/apply-port` | **move** (delete from deps.ts) |

Relative specifiers (`./x.js`) become `../x.js` in `site-deps/`.

## Importers to repoint
None: no exported symbol of deps.ts moves (verify: `git grep -n "composePublishContentApplyPort" -- apps` returns only the two files of this slice after the commit).

## Source readers of deps.ts (literal match on the tip)
- none found by literal match on the tip; step 6 runs every source reader anyway.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/publish-apply.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this slice must not change: its call sits where the moved statements sat, the moved
// statements keep their order, and inputs that are built later are only read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const SLICE = new URL("../publish-apply.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, `${name} not found`);
  return found.body.statements;
}

test("B22: the call keeps the moved statements' place in composeSiteRouteDeps", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  const at = body.findIndex((s) => firstLine(s).startsWith("composePublishContentApplyPort("));
  assert.ok(at > 0, "slice call missing");
  assert.equal(firstLine(body[at - 1]), "const { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, siteThemes, removeTheme } = composePublishingStoresThemes(");
});

test("B22: the moved statements keep their order", () => {
  const declared = bodyOf(parse(SLICE), "composePublishContentApplyPort").flatMap((s) => ts.isVariableStatement(s) ? s.declarationList.declarations.map((d) => d.name.getText().replace(/\s+/g, " ")) : []);
  assert.deepEqual(declared, ["publishContentApplyPort"]);
});

test("B22: later-built inputs are only read lazily", () => {
  const getters: readonly string[] = [];
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of bodyOf(parse(SLICE), "composePublishContentApplyPort")) visit(statement, false);
  assert.deepEqual(eager, []);
});
```
Red first (prove the pins bite, then revert each): swap the first two moved statements → test 2 fails; move the root call one statement down → test 1 fails. Record the three failing outputs in the commit message body.

## Steps (fail-closed; every block starts with `set -euo pipefail`; any non-zero exit = STOP with the step number)
**1. Start (clean tree, on the branch's last green commit).**
```bash
set -euo pipefail
git diff --quiet && git diff --cached --quiet
F=apps/website/src/server/runtime/composition/deps.ts
T=$(mktemp -d)
git rev-parse HEAD > "$T/parent"
test "$(grep -cxF -- '  const publishContentApplyPort = createPublishContentApplyPort({' "$F")" -eq 1
s=$(grep -nxF -- '  const publishContentApplyPort = createPublishContentApplyPort({' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+63))p" "$F" | sha256sum | cut -d' ' -f1)" = 3ec26da10ecf19ae5c52075150a50f1c3408c6361345049868019588aac9e3f1
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "$T/known.json"
echo "T=$T s=$s"
```
The hash proves the 64 lines are byte-identical to the design tip, wherever they now sit (earlier slices shift line numbers; they never edit this range). A mismatch is STOP-STALE: the sheet is regenerated, nothing is frozen. `--update` writes the parent's architecture metrics into the working-tree baseline (never committed, restored in step 7) so step 5 compares the candidate with its parent, metric by metric and edge by edge, using the tool's own comparison.

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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/publish-apply.ts
npm run build:server
```
**6. Tests** (the repo's own runner line from `package.json` "test", with explicit files: every test that boots `createSiteRouteDeps` without Postgres, every source reader of deps.ts, and this slice's test).
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/publish-apply.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/publish-apply.ts apps/website/src/server/runtime/composition/site-deps/__tests__/publish-apply.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): B22 publish-apply moves out of composeSiteRouteDeps (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only the slice's files, the readers step 4 changed, and (B05 only) the error debt file — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
