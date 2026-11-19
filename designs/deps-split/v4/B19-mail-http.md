# B19 — `mail-http` (deps-split v4)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
- **Range**: `composeSiteRouteDeps` statements on tip lines **1902-1958** with their leading comment lines **1892-1901** (7 statements, 31 code lines). No `await`, no write to a root `let` (checked by the design census).
- **To**: new file `apps/website/src/server/runtime/composition/site-deps/mail-http.ts`, function `export function composeMailHttp(required: ComposeMailHttpRequired, _optional = {})` whose body is the range **verbatim, same order, comments included**, followed by `return { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHttpClient, outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient };`. Getter fields are read as `name()` at each use inside the moved text (the only allowed text edit besides imports). Why-comments move with their code.
- **Root replacement** (same position, one statement):
```ts
const { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHttpClient, outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient } = composeMailHttp({ workspaceId, customCredentialSetRepo, siteAssistantSecretSealer, observability, agentPluginLifecycle, externalMcpServerRepo, runtimeMode, settingsRepo, clock, idGen, settingsPrincipals, identity, siteTitleReady, kernel, originRegistry, overrides });
```
- **Outputs** (destructured under the same names, so no other line of deps.ts changes): `resolvedMailer`, `mailDurableOutboxReady`, `customCredentialsHttpClient`, `siteBackupHttpClient`, `outboundTestOrigins`, `mediaImportHttpClient`, `publishContentPeerHttpClient`.
- **Module helpers read by the range**: none.
- **Note**: Contains the hoisted closure function `composeContentHttpClients` (tip 1937-1958, a `Record<string, never>` placeholder signature): it becomes a module-level function in the slice file with real `(required, optional = {})` inputs (the variables its body reads); the call at tip 1935 passes them.

### Required inputs (`ComposeMailHttpRequired`)
| field | how passed | declared at | declared as |
|---|---|---|---|
| `workspaceId` | value | tip 1033 | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `customCredentialSetRepo` | value | tip 1835 | `const customCredentialSetRepo = compositionCustomCredentials();` |
| `siteAssistantSecretSealer` | value | tip 1790 | `const siteAssistantSecretSealer = new AesGcmSecretSealer(siteAssistantSecretKeyring);` |
| `observability` | value | tip 1884 | `const { observability, tracker, aiTraceSink } = providerPlugins;` |
| `agentPluginLifecycle` | value | tip 979 | `const agentPluginLifecycle = createTovuAgentPluginLifecycle({ layout: agentPluginLayout }, {` |
| `externalMcpServerRepo` | value | tip 1804 | `const externalMcpServerRepo = new SqliteExternalMcpServerRepo({ store: kernel });` |
| `runtimeMode` | value | tip 1702 | `const runtimeMode = resolveRuntimeMode();` |
| `settingsRepo` | value | tip 1133 | `const settingsRepo = new SqliteSettingsRepo({ store: kernel });` |
| `clock` | value | tip 1081 | `const clock = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() };` |
| `idGen` | value | tip 1082 | `const idGen = { newId: () => randomUUID() };` |
| `settingsPrincipals` | value | tip 1122 | `const settingsPrincipals = {` |
| `identity` | value | tip 1120 | `const identity = createSqliteIdentityRouteDeps({ db: kernel, workspaceId, clock, idGen, permissionGrants: createAppPermissionGrants({}), ownerCredenti` |
| `siteTitleReady` | value | tip 1174 | `const siteTitleReady = siteSettingsReady` |
| `kernel` | value | tip 993 | `const kernel = store.content;` |
| `originRegistry` | value | tip 1356 | `const originRegistry = new OriginRegistry({ repo: new SqliteOriginSettingRepo({ store: kernel }, { after: originReady }) });` |
| `overrides` | value | root parameter |  |

Type each required field mechanically from the binding's declaration (column "declared as"): `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js` (moved by M2); `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the range or is a root `let` reassigned later; passing such a binding as a value is either a TypeScript error (TS2448/TS2454 "used before its declaration", verified on a probe) or reads a stale cell — the characterization test below fails on the latter.

### Imports used by the range
| name | from | action |
|---|---|---|
| `CUSTOM_CREDENTIALS_EGRESS_POLICY` | `#src/platform/http/egress-policies` | copy (still used in deps.ts) |
| `MEDIA_IMPORT_EGRESS_POLICY` | `#src/platform/http/egress-policies` | copy (still used in deps.ts) |
| `SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID` | `../configuration/seed.js` | copy (still used in deps.ts) |
| `SINGLE_HOP_HTTPS_EGRESS_POLICY` | `#src/platform/http/egress-policies` | copy (still used in deps.ts) |
| `SITE_BACKUP_EGRESS_POLICY` | `#src/platform/http/egress-policies` | copy (still used in deps.ts) |
| `createDefaultHttpClient` | `#src/platform/http/client` | copy (still used in deps.ts) |
| `createMailAttemptObserver` | `#src/features/mail/attempts.repo` | **move** (delete from deps.ts) |
| `createMailCaptureRepo` | `#src/features/mail/index` | **move** (delete from deps.ts) |
| `createMailSendLedgerRepo` | `#src/features/mail/index` | **move** (delete from deps.ts) |
| `createMailSuppressionRepo` | `#src/features/mail/index` | **move** (delete from deps.ts) |
| `createPluginAccountTokenResolver` | `../boot/mail-plugin-account-token.js` | **move** (delete from deps.ts) |
| `createSiteMailer` | `./site-mailer.js` | **move** (delete from deps.ts) |
| `createTestOriginHttpClientFactory` | `#src/platform/http/test-origin-allowlist` | **move** (delete from deps.ts) |
| `formsMailOutboxReady` | `#src/features/forms/mail-outbox-readiness` | **move** (delete from deps.ts) |
| `loadMailAdapterRegistry` | `#src/features/agent-plugins/mail-adapter-registry` | copy (still used in deps.ts) |
| `notifyExternalMcpRosterChanged` | `../../../assistant/external-mcp-roster-change.js` | copy (still used in deps.ts) |
| `readMailSenderSetting` | `#src/features/settings/index` | **move** (delete from deps.ts) |
| `resolvePublishContentPeerHttpClient` | `./publish-content-http.js` | **move** (delete from deps.ts) |
| `setAgentPluginEnabled` | `#src/features/agent-plugins/set-enabled` | copy (still used in deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged.

## Importers to repoint
None: no exported symbol of deps.ts moves (verify: `git grep -n "composeMailHttp" -- apps` returns only the two files of this slice after the commit).

## Source readers of deps.ts (literal match on the tip)
- `apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts` — its literal(s) found in this range: `newsletterKeyring`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/mail-http.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts` — its literal(s) found in this range: `, workspaceId: `. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/mail-http.ts` (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/mail-http.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this slice must not change: its call sits where the moved statements sat, the moved
// statements keep their order, and inputs that are built later are only read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const SLICE = new URL("../mail-http.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, `${name} not found`);
  return found.body.statements;
}

test("B19: the call keeps the moved statements' place in composeSiteRouteDeps", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  const at = body.findIndex((s) => firstLine(s).startsWith("composeMailHttp("));
  assert.ok(at > 0, "slice call missing");
  assert.equal(firstLine(body[at - 1]), "instrumentStorageKernel({ kernel: chat, observability });");
});

test("B19: the moved statements keep their order", () => {
  const declared = bodyOf(parse(SLICE), "composeMailHttp").flatMap((s) => ts.isVariableStatement(s) ? s.declarationList.declarations.map((d) => d.name.getText().replace(/\s+/g, " ")) : []);
  assert.deepEqual(declared, ["mailResolveDeps","resolvedMailer","mailDurableOutboxReady","customCredentialsHttpClient","siteBackupHttpClient","{ outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient }"]);
});

test("B19: later-built inputs are only read lazily", () => {
  const getters: readonly string[] = [];
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of bodyOf(parse(SLICE), "composeMailHttp")) visit(statement, false);
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
test "$(grep -cxF -- '  const mailResolveDeps = {' "$F")" -eq 1
s=$(grep -nxF -- '  const mailResolveDeps = {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-10)),$((s+56))p" "$F" | sha256sum | cut -d' ' -f1)" = f6c0cda690009ec300083dd09a8d0fb527f1c54361717a1c952b6640ab75e04b
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "$T/known.json"
echo "T=$T s=$s"
```
The hash proves the 67 lines are byte-identical to the design tip, wherever they now sit (earlier slices shift line numbers; they never edit this range). A mismatch is STOP-STALE: the sheet is regenerated, nothing is frozen. `--update` writes the parent's architecture metrics into the working-tree baseline (never committed, restored in step 7) so step 5 compares the candidate with its parent, metric by metric and edge by edge, using the tool's own comparison.

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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/mail-http.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/mail-http.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/mail-http.ts apps/website/src/server/runtime/composition/site-deps/__tests__/mail-http.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): B19 mail-http moves out of composeSiteRouteDeps (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only the slice's files, the readers step 4 changed, and (B05 only) the error debt file — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
