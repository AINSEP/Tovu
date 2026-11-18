# B25 — `after-assembly-forms-search` (deps-split v4)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
- **Range**: `composeSiteRouteDeps` statements on tip lines **2723-2785** with their leading comment lines **2717-2722** (9 statements, 44 code lines). No `await`, no write to a root `let` (checked by the design census).
- **To**: new file `apps/website/src/server/runtime/composition/site-deps/after-assembly-forms-search.ts`, function `export function wireFormsAndSearch(required: WireFormsAndSearchRequired, _optional = {})` whose body is the range **verbatim, same order, comments included**, followed by `return { widgetAdoptionReady };`. Getter fields are read as `name()` at each use inside the moved text (the only allowed text edit besides imports). Why-comments move with their code.
- **Root replacement** (same position, one statement):
```ts
const { widgetAdoptionReady } = wireFormsAndSearch({ siteTitleReady, menuBindingsReady, mediaTransformReady, routeDeps, workspaceId, kernel, outbox, bus, clock, idGen, customCredentialSetRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring, agentPluginLifecycle, settingsRepo, observability, formDeliveryRepo, agentPluginConnections, identity, settingsPrincipals, agentPluginLayout });
```
- **Outputs** (destructured under the same names, so no other line of deps.ts changes): `widgetAdoptionReady`.
- **Module helpers read by the range**: `consoleLogger` (tip 417, also used elsewhere).
- **Note**: Uses the module singleton `consoleLogger` (deps.ts:417): pass it as the required input `consoleLogger`. Keeps `consoleLogger.info` (tip 2727) and `consoleLogger.error` (tip 2731) with their texts.

### Required inputs (`WireFormsAndSearchRequired`)
| field | how passed | declared at | declared as |
|---|---|---|---|
| `siteTitleReady` | value | tip 1174 | `const siteTitleReady = siteSettingsReady` |
| `menuBindingsReady` | value | tip 1195 | `const menuBindingsReady = rebuildNavLocationBindings({` |
| `mediaTransformReady` | value | tip 1252 | `const mediaTransformReady = commentsReady` |
| `routeDeps` | value | tip 2135 | `const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {` |
| `workspaceId` | value | tip 1033 | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `kernel` | value | tip 993 | `const kernel = store.content;` |
| `outbox` | value | tip 1294 | `const outbox = new SqliteOutboxAdapter({ store: kernel });` |
| `bus` | value | tip 1295 | `const bus = new InMemoryEventBus();` |
| `clock` | value | tip 1081 | `const clock = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() };` |
| `idGen` | value | tip 1082 | `const idGen = { newId: () => randomUUID() };` |
| `customCredentialSetRepo` | value | tip 1835 | `const customCredentialSetRepo = compositionCustomCredentials();` |
| `siteAssistantSecretSealer` | value | tip 1790 | `const siteAssistantSecretSealer = new AesGcmSecretSealer(siteAssistantSecretKeyring);` |
| `siteAssistantSecretKeyring` | value | tip 1787 | `const siteAssistantSecretKeyring = new EnvOrFileKeyring({` |
| `agentPluginLifecycle` | value | tip 979 | `const agentPluginLifecycle = createTovuAgentPluginLifecycle({ layout: agentPluginLayout }, {` |
| `settingsRepo` | value | tip 1133 | `const settingsRepo = new SqliteSettingsRepo({ store: kernel });` |
| `observability` | value | tip 1884 | `const { observability, tracker, aiTraceSink } = providerPlugins;` |
| `formDeliveryRepo` | value | tip 1391 | `const formDeliveryRepo = new SqlFormDeliveryRepo({ kernel });` |
| `agentPluginConnections` | value | tip 2102 | `const agentPluginConnections = composeAgentPluginConnections({` |
| `identity` | value | tip 1120 | `const identity = createSqliteIdentityRouteDeps({ db: kernel, workspaceId, clock, idGen, permissionGrants: createAppPermissionGrants({}), ownerCredenti` |
| `settingsPrincipals` | value | tip 1122 | `const settingsPrincipals = {` |
| `agentPluginLayout` | value | tip 978 | `const agentPluginLayout = resolveAgentPluginLayout({ siteDir: resolvedSiteBinding.dir });` |

Type each required field mechanically from the binding's declaration (column "declared as"): `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js` (moved by M2); `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the range or is a root `let` reassigned later; passing such a binding as a value is either a TypeScript error (TS2448/TS2454 "used before its declaration", verified on a probe) or reads a stale cell — the characterization test below fails on the latter.

### Imports used by the range
| name | from | action |
|---|---|---|
| `DefaultMemberAccessResolver` | `#src/features/members/index` | **move** (delete from deps.ts) |
| `SINGLE_HOP_HTTPS_EGRESS_POLICY` | `#src/platform/http/egress-policies` | copy (still used in deps.ts) |
| `SqlFormPullLeaseRepo` | `#src/platform/db/repos/form-delivery-repo` | **move** (delete from deps.ts) |
| `SqlFormSubmissionReceiptRepo` | `#src/platform/db/repos/form-submission-receipt-repo` | **move** (delete from deps.ts) |
| `adoptLegacyTrashedWidgets` | `@jini-ai/cms/widgets` | **move** (delete from deps.ts) |
| `bindSiteSearchPorts` | `./modules/site-search.js` | **move** (delete from deps.ts) |
| `buildWidgetsDeps` | `#src/features/widgets/deps` | copy (still used in deps.ts) |
| `composeFormDelivery` | `#src/server/runtime/composition/form-delivery` | **move** (delete from deps.ts) |
| `composeFormDeliveryDeliverer` | `#src/server/runtime/composition/form-delivery-deliverer` | **move** (delete from deps.ts) |
| `composeFormSubmissions` | `#src/server/runtime/composition/form-submissions` | **move** (delete from deps.ts) |
| `createDefaultHttpClient` | `#src/platform/http/client` | copy (still used in deps.ts) |
| `createDeployHostKit` | `#src/features/deployments/deploy-targets/host-kit` | copy (still used in deps.ts) |
| `createSiteSearchRuntime` | `./modules/site-search.js` | **move** (delete from deps.ts) |
| `loadFormDestinationRegistry` | `#src/features/form-destinations/registry` | **move** (delete from deps.ts) |
| `resolveCustomCredentialByLabel` | `#src/features/custom-credentials/index` | copy (still used in deps.ts) |

Relative specifiers (`./x.js`) become `../x.js` in `site-deps/`.

## Importers to repoint
None: no exported symbol of deps.ts moves (verify: `git grep -n "wireFormsAndSearch" -- apps` returns only the two files of this slice after the commit).

## Source readers of deps.ts (literal match on the tip)
- none found by literal match on the tip; step 6 runs every source reader anyway.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/after-assembly-forms-search.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this slice must not change: its call sits where the moved statements sat, the moved
// statements keep their order, and inputs that are built later are only read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const SLICE = new URL("../after-assembly-forms-search.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, `${name} not found`);
  return found.body.statements;
}

test("B25: the call keeps the moved statements' place in composeSiteRouteDeps", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  const at = body.findIndex((s) => firstLine(s).startsWith("wireFormsAndSearch("));
  assert.ok(at > 0, "slice call missing");
  assert.equal(firstLine(body[at - 1]), "resolveRouteDeps(routeDeps);");
  assert.equal(firstLine(body[at + 1]), "function compositionSharedOAuth() {");
});

test("B25: the moved statements keep their order", () => {
  const declared = bodyOf(parse(SLICE), "wireFormsAndSearch").flatMap((s) => ts.isVariableStatement(s) ? s.declarationList.declarations.map((d) => d.name.getText().replace(/\s+/g, " ")) : []);
  assert.deepEqual(declared, ["widgetAdoptionReady","formSubmissions"]);
});

test("B25: later-built inputs are only read lazily", () => {
  const getters: readonly string[] = [];
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of bodyOf(parse(SLICE), "wireFormsAndSearch")) visit(statement, false);
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
test "$(grep -cxF -- '  const widgetAdoptionReady = Promise.allSettled([siteTitleReady, menuBindingsReady, mediaTransformReady])' "$F")" -eq 1
s=$(grep -nxF -- '  const widgetAdoptionReady = Promise.allSettled([siteTitleReady, menuBindingsReady, mediaTransformReady])' "$F" | cut -d: -f1)
test "$(sed -n "$((s-6)),$((s+62))p" "$F" | sha256sum | cut -d' ' -f1)" = cfff29fa8734e342c666dd2fedc0be4f961bd6ba4d940a3fe1f0107bca250fdd
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "$T/known.json"
echo "T=$T s=$s"
```
The hash proves the 69 lines are byte-identical to the design tip, wherever they now sit (earlier slices shift line numbers; they never edit this range). A mismatch is STOP-STALE: the sheet is regenerated, nothing is frozen. `--update` writes the parent's architecture metrics into the working-tree baseline (never committed, restored in step 7) so step 5 compares the candidate with its parent, metric by metric and edge by edge, using the tool's own comparison.

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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/after-assembly-forms-search.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/after-assembly-forms-search.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/after-assembly-forms-search.ts apps/website/src/server/runtime/composition/site-deps/__tests__/after-assembly-forms-search.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): B25 after-assembly-forms-search moves out of composeSiteRouteDeps (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only the slice's files, the readers step 4 changed, and (B05 only) the error debt file — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
