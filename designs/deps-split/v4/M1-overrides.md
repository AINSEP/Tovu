# M1 — `overrides` (deps-split v4, module helpers)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
- **Declarations** (module level of deps.ts, each with its leading doc comment, **verbatim, in tip order**, 46 code lines) → new file `apps/website/src/server/runtime/composition/site-deps/overrides.ts`:

| declaration | tip lines (doc + body) | anchor line | exported from the new file |
|---|---|---|---|
| `CreateSiteRouteDepsOverrides` (interface) | 419-504 | 425 | yes |
| `assertOverridesPairedOrAbsent` (function) | 506-521 | 513 | yes |
| `pluginFailureThresholdOverride` (function) | 523-534 | 530 | yes |
| `resolveThemesDirOverride` (function) | 553-561 | 559 | yes |
| `resolveSiteBindingOverride` (function) | 563-571 | 569 | yes |
| `resolveWorkspaceIdOverride` (function) | 762-772 | 768 | yes |

- **Edit, nothing else**: cut each row's lines from deps.ts and paste them, in this order, into the new file; add `export` to the rows marked "yes" (and to nothing else — no re-export from deps.ts, no shell); add the imports below to the new file. In deps.ts, add exactly one import line after the last relative `./` import:
```ts
import { type CreateSiteRouteDepsOverrides, assertOverridesPairedOrAbsent, pluginFailureThresholdOverride, resolveThemesDirOverride, resolveSiteBindingOverride, resolveWorkspaceIdOverride } from "./site-deps/overrides.js";
```
- **Module helpers the moved text reads that stay elsewhere**: none.
- `CreateSiteRouteDepsOverrides` keeps `export`. Doc comments elsewhere that say "deps.ts's X" (`credentials-deps.ts:250`) are prose and are not edited.

### Imports used by the moved text
| name | from (as written in deps.ts) | action |
|---|---|---|
| `ContentDb` (type) | `#src/platform/db/sqlite/content-db` | copy (still used in deps.ts) |
| `ContentDbOpenOptions` (type) | `#src/platform/db/sqlite/content-db` | **move** (delete from deps.ts) |
| `ContentKernel` (type) | `#src/platform/db/content-kernel` | **move** (delete from deps.ts) |
| `ProjectStore` (type) | `./project-store.js` | copy (still used in deps.ts) |
| `RouteDeps` (type) | `../../routes/types.js` | copy (still used in deps.ts) |
| `SiteBinding` (type) | `#src/platform/site-dir/index` | **move** (delete from deps.ts) |
| `SiteStore` (type) | `./open-site-store.js` | copy (still used in deps.ts) |
| `SiteStoreRole` (type) | `./open-site-store.js` | copy (still used in deps.ts) |
| `bootProviderPlugins` | `./provider-plugins.js` | copy (still used in deps.ts) |
| `describeSiteBinding` | `#src/platform/site-dir/index` | **move** (delete from deps.ts) |
| `resolveWorkspace` | `#src/platform/site-dir/resolve-workspace` | copy (still used in deps.ts) |
| `siteThemesDir` | `./site-paths.js` | copy (still used in deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

## Importers to repoint
- `apps/website/src/server/runtime/composition/__tests__/deps-observability-wiring.integration.test.ts:15` — `type CreateSiteRouteDepsOverrides` moves to its own line `import type { CreateSiteRouteDepsOverrides } from "#src/server/runtime/composition/site-deps/overrides";` (keep `createSiteRouteDeps` imported from `deps`).

## Source readers of deps.ts (literal match on the tip)
- `apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts` — its literal(s) found in this range: `createSiteRouteDepsForWorkspace`, `resolveWorkspace`, `createSiteRouteDeps`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/overrides.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts` — its literal(s) found in this range: `cli/commands/serve.ts`, `createRouteDeps`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/overrides.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts` — its literal(s) found in this range: `createSiteRouteDeps`, `openCompositionStore`, `openSiteStore`, `openSiteContentDb`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/overrides.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts` — its literal(s) found in this range: `createSiteRouteDeps`, `process.cwd()`, `openSiteStore`, `openCompositionStore(`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/overrides.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts` — its literal(s) found in this range: `createSiteRouteDeps`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/overrides.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts` — its literal(s) found in this range: `apps/website/src`, `server/runtime/composition/app.ts`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/overrides.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts` — its literal(s) found in this range: `package.json`, `apps/website/`, `apps/website/src/server/`, `apps/website/src/server`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/overrides.ts` (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/overrides.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this sheet must not change: the declarations move whole and in order, deps.ts keeps none of
// them, and deps.ts takes what it still uses from the new file (no re-export).
const DEPS = new URL("../../deps.ts", import.meta.url);
const MOVED = new URL("../overrides.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const declaredNames = (file: ts.SourceFile): string[] => file.statements.flatMap((s) => (ts.isFunctionDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name ? [s.name.text] : []);

test("M1: the declarations live only in site-deps/overrides.ts, in tip order", () => {
  const moved = ["CreateSiteRouteDepsOverrides","assertOverridesPairedOrAbsent","pluginFailureThresholdOverride","resolveThemesDirOverride","resolveSiteBindingOverride","resolveWorkspaceIdOverride"];
  assert.deepEqual(declaredNames(parse(MOVED)).filter((n) => moved.includes(n)), moved);
  assert.deepEqual(declaredNames(parse(DEPS)).filter((n) => moved.includes(n)), []);
});

test("M1: deps.ts imports exactly what it still uses from the new file", () => {
  const found = parse(DEPS).statements.find((s): s is ts.ImportDeclaration => ts.isImportDeclaration(s) && (s.moduleSpecifier as ts.StringLiteral).text === "./site-deps/overrides.js");
  assert.ok(found?.importClause?.namedBindings && ts.isNamedImports(found.importClause.namedBindings), "import missing");
  assert.deepEqual(found.importClause.namedBindings.elements.map((e) => e.name.text).sort(), ["CreateSiteRouteDepsOverrides","assertOverridesPairedOrAbsent","pluginFailureThresholdOverride","resolveSiteBindingOverride","resolveThemesDirOverride","resolveWorkspaceIdOverride"]);
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
# CreateSiteRouteDepsOverrides
test "$(grep -cxF -- 'export interface CreateSiteRouteDepsOverrides {' "$F")" -eq 1
s=$(grep -nxF -- 'export interface CreateSiteRouteDepsOverrides {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-6)),$((s+79))p" "$F" | sha256sum | cut -d' ' -f1)" = 7e3b386388ade1e7a12a57309a121e1cee4269d3b62bb7871114e148b1dceadd
# assertOverridesPairedOrAbsent
test "$(grep -cxF -- 'function assertOverridesPairedOrAbsent(overrides?: Partial<CreateSiteRouteDepsOverrides>): void {' "$F")" -eq 1
s=$(grep -nxF -- 'function assertOverridesPairedOrAbsent(overrides?: Partial<CreateSiteRouteDepsOverrides>): void {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-7)),$((s+8))p" "$F" | sha256sum | cut -d' ' -f1)" = b8f8f604b2030c75f858aa9e302f2f93a7b8105879db9c5cd587d669c864e8b9
# pluginFailureThresholdOverride
test "$(grep -cxF -- 'function pluginFailureThresholdOverride(' "$F")" -eq 1
s=$(grep -nxF -- 'function pluginFailureThresholdOverride(' "$F" | cut -d: -f1)
test "$(sed -n "$((s-7)),$((s+4))p" "$F" | sha256sum | cut -d' ' -f1)" = bc5db0549fedb5fd2ec43cacca98ecb20b1eca3f59082f8a21bf06732a7723d1
# resolveThemesDirOverride
test "$(grep -cxF -- 'function resolveThemesDirOverride(siteBinding: SiteBinding, overrides?: Partial<CreateSiteRouteDepsOverrides>): string {' "$F")" -eq 1
s=$(grep -nxF -- 'function resolveThemesDirOverride(siteBinding: SiteBinding, overrides?: Partial<CreateSiteRouteDepsOverrides>): string {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-6)),$((s+2))p" "$F" | sha256sum | cut -d' ' -f1)" = 6b08eccd696d0936e686de2f2df9c9c5a6c496c68c45827b5c8645b57128f79d
# resolveSiteBindingOverride
test "$(grep -cxF -- 'function resolveSiteBindingOverride(overrides?: Partial<CreateSiteRouteDepsOverrides>): SiteBinding {' "$F")" -eq 1
s=$(grep -nxF -- 'function resolveSiteBindingOverride(overrides?: Partial<CreateSiteRouteDepsOverrides>): SiteBinding {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-6)),$((s+2))p" "$F" | sha256sum | cut -d' ' -f1)" = 4788446c6c8ae4996a56acf3fb7b09f4c30437f152499e9f9c91b0233d622699
# resolveWorkspaceIdOverride
test "$(grep -cxF -- 'async function resolveWorkspaceIdOverride(kernel: ContentKernel, overrides?: Partial<CreateSiteRouteDepsOverrides>): Promise<string> {' "$F")" -eq 1
s=$(grep -nxF -- 'async function resolveWorkspaceIdOverride(kernel: ContentKernel, overrides?: Partial<CreateSiteRouteDepsOverrides>): Promise<string> {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-6)),$((s+4))p" "$F" | sha256sum | cut -d' ' -f1)" = 330384b61579fa316c67397c9a8da199e3c8a661f9052ce532e6e5291e7ce378
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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/overrides.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/overrides.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/overrides.ts apps/website/src/server/runtime/composition/site-deps/__tests__/overrides.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts apps/website/src/server/runtime/composition/__tests__/deps-observability-wiring.integration.test.ts
git status --short
git commit -m "refactor(composition): M1 overrides helpers move out of deps.ts (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
