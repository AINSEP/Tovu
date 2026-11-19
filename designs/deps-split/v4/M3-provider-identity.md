# M3 — `provider-identity` (deps-split v4, module helpers)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
- **Declarations** (module level of deps.ts, each with its leading doc comment, **verbatim, in tip order**, 49 code lines) → new file `apps/website/src/server/runtime/composition/site-deps/provider-identity.ts`:

| declaration | tip lines (doc + body) | anchor line | exported from the new file |
|---|---|---|---|
| `providerPluginBoot` (function) | 846-849 | 847 | yes |
| `composeProviderConfig` (function) | 851-872 | 856 | yes |
| `credentialProject` (function) | 874-885 | 881 | yes |
| `acceptedSiteId` (function) | 887-892 | 888 | no (used only inside the new file) |
| `siteIdentityFor` (function) | 894-909 | 904 | yes |
| `projectStoreFor` (function) | 911-929 | 917 | no (used only inside the new file) |

- **Edit, nothing else**: cut each row's lines from deps.ts and paste them, in this order, into the new file; add `export` to the rows marked "yes" (and to nothing else — no re-export from deps.ts, no shell); add the imports below to the new file. In deps.ts, add exactly one import line after the last relative `./` import:
```ts
import { providerPluginBoot, composeProviderConfig, credentialProject, siteIdentityFor } from "./site-deps/provider-identity.js";
```
- **Module helpers the moved text reads that stay elsewhere**: `CreateSiteRouteDepsOverrides` → import from `./overrides.js` (moved by M1).
- Prose that says "`deps.ts`'s `siteIdentityFor`"/"`credentialProject`" (`cli/commands/deploy-config.ts:112`, `features/webhooks/site-key-sources.ts:157`, `features/vendor-credentials/project-scope.ts:36`, `features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:60`) is not edited.

### Imports used by the moved text
| name | from (as written in deps.ts) | action |
|---|---|---|
| `ProjectStore` (type) | `./project-store.js` | copy (still used in deps.ts) |
| `ProjectVaultScope` (type) | `./project-store.js` | **move** (delete from deps.ts) |
| `ProviderConfigSource` (type) | `./provider-config-source.js` | **move** (delete from deps.ts) |
| `RuntimeMode` (type) | `#src/contracts/core/runtime-mode` | **move** (delete from deps.ts) |
| `SiteIdentity` (type) | `./provider-plugins.js` | **move** (delete from deps.ts) |
| `SiteKeyReferences` (type) | `#src/features/project-keys/site-references` | **move** (delete from deps.ts) |
| `TOVU_ERROR_REDACTION_OPTIONS` | `@tovu/contracts/secret-redaction` | copy (still used in deps.ts) |
| `attachedOnlyVault` | `#src/features/project-keys/attached-vault` | **move** (delete from deps.ts) |
| `bootProviderPlugins` | `./provider-plugins.js` | copy (still used in deps.ts) |
| `createSitesWorkspace` | `#src/platform/site-dir/sites-home` | copy (still used in deps.ts) |
| `formatErrorForLog` | `@jini-ai/core` | copy (still used in deps.ts) |
| `homedir` | `node:os` | copy (still used in deps.ts) |
| `isSiteIdToken` | `#src/features/webhooks/site-key-sources` | **move** (delete from deps.ts) |
| `localOwnerStoreEnabled` | `./project-store.js` | **move** (delete from deps.ts) |
| `openProjectStore` | `./project-store.js` | copy (still used in deps.ts) |
| `ownerKeyHandleOnly` | `#src/features/project-keys/site-sealer` | **move** (delete from deps.ts) |
| `projectKeyCreateVault` | `#src/features/project-keys/create-vault` | **move** (delete from deps.ts) |
| `readSiteMetaId` | `#src/features/webhooks/site-key-sources` | **move** (delete from deps.ts) |
| `siteGrantedSealer` | `#src/features/project-keys/site-sealer` | **move** (delete from deps.ts) |
| `telemetryEnvironment` | `./build-release.js` | **move** (delete from deps.ts) |
| `withAttachedProject` | `./provider-config-source.js` | **move** (delete from deps.ts) |
| `withUnavailableProject` | `./provider-config-source.js` | **move** (delete from deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

## Importers to repoint
- `apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts:15` — `siteIdentityFor` moves to its own line `import { siteIdentityFor } from "#src/server/runtime/composition/site-deps/provider-identity";` (keep `createSiteRouteDeps` imported from `deps`).

## Source readers of deps.ts (literal match on the tip)
- `apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts` — its literal(s) found in this range: `workspace-local`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/provider-identity.ts` (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/provider-identity.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this sheet must not change: the declarations move whole and in order, deps.ts keeps none of
// them, and deps.ts takes what it still uses from the new file (no re-export).
const DEPS = new URL("../../deps.ts", import.meta.url);
const MOVED = new URL("../provider-identity.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const declaredNames = (file: ts.SourceFile): string[] => file.statements.flatMap((s) => (ts.isFunctionDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name ? [s.name.text] : []);

test("M3: the declarations live only in site-deps/provider-identity.ts, in tip order", () => {
  const moved = ["providerPluginBoot","composeProviderConfig","credentialProject","acceptedSiteId","siteIdentityFor","projectStoreFor"];
  assert.deepEqual(declaredNames(parse(MOVED)).filter((n) => moved.includes(n)), moved);
  assert.deepEqual(declaredNames(parse(DEPS)).filter((n) => moved.includes(n)), []);
});

test("M3: deps.ts imports exactly what it still uses from the new file", () => {
  const found = parse(DEPS).statements.find((s): s is ts.ImportDeclaration => ts.isImportDeclaration(s) && (s.moduleSpecifier as ts.StringLiteral).text === "./site-deps/provider-identity.js");
  assert.ok(found?.importClause?.namedBindings && ts.isNamedImports(found.importClause.namedBindings), "import missing");
  assert.deepEqual(found.importClause.namedBindings.elements.map((e) => e.name.text).sort(), ["composeProviderConfig","credentialProject","providerPluginBoot","siteIdentityFor"]);
});
```
Red first (prove the pins bite, then revert each): paste one moved declaration back into deps.ts → test 1 fails; swap the first two declarations in the new file → test 1 fails; drop one name from the deps.ts import line → test 2 fails (typecheck too). Record the three failing outputs in the commit message body.

## Steps (fail-closed; every block starts with `set -euo pipefail`; any non-zero exit = STOP with the step number)
**1. Start (clean tree, on the branch's last green commit).**
```bash
set -euo pipefail
git diff --quiet && git diff --cached --quiet
F=apps/website/src/server/runtime/composition/deps.ts
T=$(mktemp -d)
git rev-parse HEAD > "$T/parent"
# providerPluginBoot
test "$(grep -cxF -- 'function providerPluginBoot({ overrides }: { overrides: Partial<CreateSiteRouteDepsOverrides> }): typeof bootProviderPlugins {' "$F")" -eq 1
s=$(grep -nxF -- 'function providerPluginBoot({ overrides }: { overrides: Partial<CreateSiteRouteDepsOverrides> }): typeof bootProviderPlugins {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-1)),$((s+2))p" "$F" | sha256sum | cut -d' ' -f1)" = d9d3bc0f7315e49fc1ea784b935eca769966340a4dc78544d15cb485121878d4
# composeProviderConfig
test "$(grep -cxF -- 'async function composeProviderConfig({ overrides, runtimeMode, onStoreClose, site, binding, references }: {' "$F")" -eq 1
s=$(grep -nxF -- 'async function composeProviderConfig({ overrides, runtimeMode, onStoreClose, site, binding, references }: {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-5)),$((s+16))p" "$F" | sha256sum | cut -d' ' -f1)" = 455aff1d2435f317664f86f1a776f4682fc8174e7b0d34a749240d3d4256aac6
# credentialProject
test "$(grep -cxF -- 'function credentialProject<R>({ projectVault, repo }: { projectVault: ProjectVaultScope | undefined; repo: (vault: ProjectVaultScope["repo"]) => R }, _optional = {}): { project?: { workspaceId: string; repo: R; createRepo?: R; replaceRepo?: R; sealer: ProjectVaultScope["sealer"]; keyring: ProjectVaultScope["keyring"] } } {' "$F")" -eq 1
s=$(grep -nxF -- 'function credentialProject<R>({ projectVault, repo }: { projectVault: ProjectVaultScope | undefined; repo: (vault: ProjectVaultScope["repo"]) => R }, _optional = {}): { project?: { workspaceId: string; repo: R; createRepo?: R; replaceRepo?: R; sealer: ProjectVaultScope["sealer"]; keyring: ProjectVaultScope["keyring"] } } {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-7)),$((s+4))p" "$F" | sha256sum | cut -d' ' -f1)" = b01b53b236bb6d1e1288aa4d9699e9994ffedde64ba259e0ab5d573363ae2b36
# acceptedSiteId
test "$(grep -cxF -- 'function acceptedSiteId({ value, source }: { value: string | undefined; source: string }, _optional = {}): string | undefined {' "$F")" -eq 1
s=$(grep -nxF -- 'function acceptedSiteId({ value, source }: { value: string | undefined; source: string }, _optional = {}): string | undefined {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-1)),$((s+4))p" "$F" | sha256sum | cut -d' ' -f1)" = c112829856a69dacc5296e7e2e252650a1637612ac8bfffba9f9980bded20c59
# siteIdentityFor
test "$(grep -cxF -- 'export function siteIdentityFor({ workspaceId, binding, runtimeMode, projectId }: { workspaceId: string; binding: { name: string; dir: string }; runtimeMode: RuntimeMode; projectId: string | undefined }, { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): SiteIdentity {' "$F")" -eq 1
s=$(grep -nxF -- 'export function siteIdentityFor({ workspaceId, binding, runtimeMode, projectId }: { workspaceId: string; binding: { name: string; dir: string }; runtimeMode: RuntimeMode; projectId: string | undefined }, { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): SiteIdentity {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-10)),$((s+5))p" "$F" | sha256sum | cut -d' ' -f1)" = 0e1a1dc39f3ac839628a875033cfc06d27bb358c4b3b19d6c1b17f11f0688146
# projectStoreFor
test "$(grep -cxF -- 'async function projectStoreFor({ overrides, runtimeMode }: { overrides: Partial<CreateSiteRouteDepsOverrides>; runtimeMode: RuntimeMode }): Promise<ProjectStore | { unavailable: string } | undefined> {' "$F")" -eq 1
s=$(grep -nxF -- 'async function projectStoreFor({ overrides, runtimeMode }: { overrides: Partial<CreateSiteRouteDepsOverrides>; runtimeMode: RuntimeMode }): Promise<ProjectStore | { unavailable: string } | undefined> {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-6)),$((s+12))p" "$F" | sha256sum | cut -d' ' -f1)" = a6eafe7311f583daa7941a0c35324b042a76da964b59e3d1a2e0d9fb2ec732e9
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "$T/known.json"
echo "T=$T"
```
Each hash proves one declaration (with its doc comment) is byte-identical to the design tip wherever it now sits. A mismatch is STOP-STALE: the sheet is regenerated, nothing is frozen. `--update` writes the parent's architecture metrics into the working-tree baseline (never committed, restored in step 7) so step 5 compares the candidate with its parent, metric by metric and edge by edge, using the tool's own comparison.

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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/provider-identity.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/provider-identity.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/provider-identity.ts apps/website/src/server/runtime/composition/site-deps/__tests__/provider-identity.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts
git status --short
git commit -m "refactor(composition): M3 provider-identity helpers move out of deps.ts (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
