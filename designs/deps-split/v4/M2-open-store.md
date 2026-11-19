# M2 — `open-store` (deps-split v4, module helpers)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
- **Declarations** (module level of deps.ts, each with its leading doc comment, **verbatim, in tip order**, 68 code lines) → new file `apps/website/src/server/runtime/composition/site-deps/open-store.ts`:

| declaration | tip lines (doc + body) | anchor line | exported from the new file |
|---|---|---|---|
| `hydrateContentDbIfNeeded` (function) | 536-551 | 546 | no (used only inside the new file) |
| `prepareCompositionStorage` (function) | 653-660 | 653 | no (used only inside the new file) |
| `StoreCloseRegistration` (typealias) | 662-667 | 667 | yes |
| `openCompositionStore` (function) | 669-722 | 687 | yes |
| `resolveChatDbPath` (function) | 724-733 | 728 | yes |
| `startOwnerSweeps` (function) | 735-752 | 740 | no (used only inside the new file) |
| `startOwnerChatExpirySweep` (function) | 754-760 | 755 | no (used only inside the new file) |

- **Edit, nothing else**: cut each row's lines from deps.ts and paste them, in this order, into the new file; add `export` to the rows marked "yes" (and to nothing else — no re-export from deps.ts, no shell); add the imports below to the new file. In deps.ts, add exactly one import line after the last relative `./` import:
```ts
import { type StoreCloseRegistration, openCompositionStore, resolveChatDbPath } from "./site-deps/open-store.js";
```
- **Module helpers the moved text reads that stay elsewhere**: `CreateSiteRouteDepsOverrides` → import from `./overrides.js` (moved by M1); `resolveSiteBindingOverride` → import from `./overrides.js` (moved by M1).
- **Why `hydrateContentDbIfNeeded` is here**: `openCompositionStore` calls it; leaving it in deps.ts would make `open-store.ts` import deps.ts, a cycle step 5's dependency-cruiser check rejects.

### Imports used by the moved text
| name | from (as written in deps.ts) | action |
|---|---|---|
| `SiteStorage` (type) | `#src/platform/site-dir/types` | **move** (delete from deps.ts) |
| `SiteStore` (type) | `./open-site-store.js` | copy (still used in deps.ts) |
| `SiteStoreRole` (type) | `./open-site-store.js` | copy (still used in deps.ts) |
| `builtInContentSeedDbPath` | `./site-paths.js` | copy (still used in deps.ts) |
| `defaultChatDbPath` | `./site-paths.js` | **move** (delete from deps.ts) |
| `dirname` | `node:path` | copy (still used in deps.ts) |
| `hydrateContentDbFromSeed` | `#src/platform/db/sqlite/hydrate-content-db-from-seed` | **move** (delete from deps.ts) |
| `isInMemoryDbPath` | `@jini-ai/db/data-modules` | copy (still used in deps.ts) |
| `mkdirSync` | `node:fs` | copy (still used in deps.ts) |
| `openSiteStore` | `./open-site-store.js` | **move** (delete from deps.ts) |
| `resolveSiteDirForDatabase` | `#src/platform/site-dir/site-databases` | copy (still used in deps.ts) |
| `resolveSiteStorage` | `#src/platform/site-dir/site-storage` | copy (still used in deps.ts) |
| `startChatExpirySweep` | `#src/assistant/persistence/chat-expiry-sweep` | copy (still used in deps.ts) |
| `startMailRetention` | `#src/features/mail/retention` | **move** (delete from deps.ts) |
| `startSubmissionIpExpirySweep` | `#src/features/forms/submission-ip-expiry-sweep` | **move** (delete from deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

## Reader edit (required; found by applying M1-M3 in a scratch worktree)
`apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts`, test "createSiteRouteDeps: storage choice, then hydration, then the store open …", reads `openCompositionStore`, `prepareCompositionStorage` and `startOwnerSweeps` from deps.ts and fails with `anchor missing: async function openCompositionStore(`. Change exactly its three reads of those bodies to the new file: add `const store = readCode("server/runtime/composition/site-deps/open-store.ts");` after `const deps = …`, and replace `functionBody(deps, "async function openCompositionStore(")`, `functionBody(deps, "function prepareCompositionStorage(")` and `functionBody(deps, "function startOwnerSweeps(")` with `functionBody(store, …)` (same signatures). The `createSiteRouteDeps` read stays on deps.ts. Commit it with this sheet.

## Importers to repoint
None: no moved name is imported outside deps.ts (verify: `git grep -nE "hydrateContentDbIfNeeded|prepareCompositionStorage|StoreCloseRegistration|openCompositionStore|resolveChatDbPath|startOwnerSweeps|startOwnerChatExpirySweep" -- apps development` lists only deps.ts, the new file, this test and prose comments).

## Source readers of deps.ts (literal match on the tip)
- `apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts` — its literal(s) found in this range: `createSiteRouteDeps`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/open-store.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts` — its literal(s) found in this range: `createSiteRouteDeps`, `openCompositionStore`, `openSiteStore`, `openSiteContentDb`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/open-store.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts` — its literal(s) found in this range: `createSiteRouteDeps`, `process.cwd()`, `openSiteStore`, `openCompositionStore(`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/open-store.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts` — its literal(s) found in this range: `createSiteRouteDeps`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/open-store.ts` (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/open-store.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this sheet must not change: the declarations move whole and in order, deps.ts keeps none of
// them, and deps.ts takes what it still uses from the new file (no re-export).
const DEPS = new URL("../../deps.ts", import.meta.url);
const MOVED = new URL("../open-store.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const declaredNames = (file: ts.SourceFile): string[] => file.statements.flatMap((s) => (ts.isFunctionDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name ? [s.name.text] : []);

test("M2: the declarations live only in site-deps/open-store.ts, in tip order", () => {
  const moved = ["hydrateContentDbIfNeeded","prepareCompositionStorage","StoreCloseRegistration","openCompositionStore","resolveChatDbPath","startOwnerSweeps","startOwnerChatExpirySweep"];
  assert.deepEqual(declaredNames(parse(MOVED)).filter((n) => moved.includes(n)), moved);
  assert.deepEqual(declaredNames(parse(DEPS)).filter((n) => moved.includes(n)), []);
});

test("M2: deps.ts imports exactly what it still uses from the new file", () => {
  const found = parse(DEPS).statements.find((s): s is ts.ImportDeclaration => ts.isImportDeclaration(s) && (s.moduleSpecifier as ts.StringLiteral).text === "./site-deps/open-store.js");
  assert.ok(found?.importClause?.namedBindings && ts.isNamedImports(found.importClause.namedBindings), "import missing");
  assert.deepEqual(found.importClause.namedBindings.elements.map((e) => e.name.text).sort(), ["StoreCloseRegistration","openCompositionStore","resolveChatDbPath"]);
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
# hydrateContentDbIfNeeded
test "$(grep -cxF -- 'function hydrateContentDbIfNeeded({ dbPath, storage }: { dbPath: string; storage: SiteStorage }, { overrides }: { overrides?: Partial<CreateSiteRouteDepsOverrides> } = {}): void {' "$F")" -eq 1
s=$(grep -nxF -- 'function hydrateContentDbIfNeeded({ dbPath, storage }: { dbPath: string; storage: SiteStorage }, { overrides }: { overrides?: Partial<CreateSiteRouteDepsOverrides> } = {}): void {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-10)),$((s+5))p" "$F" | sha256sum | cut -d' ' -f1)" = a35c76e901b75046969ff1d68594584f25d92c3a2281ce7b8b721c264d8455ec
# prepareCompositionStorage
test "$(grep -cxF -- 'function prepareCompositionStorage({ dbPath, overrides }: {' "$F")" -eq 1
s=$(grep -nxF -- 'function prepareCompositionStorage({ dbPath, overrides }: {' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+7))p" "$F" | sha256sum | cut -d' ' -f1)" = b3cb1f8b6619c046a6bef64392a2cca03d7ae5b7c273005ba91aee92c5243266
# StoreCloseRegistration
test "$(grep -cxF -- 'type StoreCloseRegistration = (() => unknown) | Promise<() => unknown>;' "$F")" -eq 1
s=$(grep -nxF -- 'type StoreCloseRegistration = (() => unknown) | Promise<() => unknown>;' "$F" | cut -d: -f1)
test "$(sed -n "$((s-5)),$((s+0))p" "$F" | sha256sum | cut -d' ' -f1)" = f6600541cf09101bdc152dac7c593b0a083aac27fce870df03e3ddce7cddfbe4
# openCompositionStore
test "$(grep -cxF -- 'async function openCompositionStore(' "$F")" -eq 1
s=$(grep -nxF -- 'async function openCompositionStore(' "$F" | cut -d: -f1)
test "$(sed -n "$((s-18)),$((s+35))p" "$F" | sha256sum | cut -d' ' -f1)" = 3912f98ef5a60c959e9ad5d25f51df988d53025522390ae5d2ba6cfeb9ed2d20
# resolveChatDbPath
test "$(grep -cxF -- 'function resolveChatDbPath(' "$F")" -eq 1
s=$(grep -nxF -- 'function resolveChatDbPath(' "$F" | cut -d: -f1)
test "$(sed -n "$((s-4)),$((s+5))p" "$F" | sha256sum | cut -d' ' -f1)" = 4b2d6bf2a00bdc88a635ffb7235e7303ddbe6ac363c0185b83232ea68e701c92
# startOwnerSweeps
test "$(grep -cxF -- 'function startOwnerSweeps(' "$F")" -eq 1
s=$(grep -nxF -- 'function startOwnerSweeps(' "$F" | cut -d: -f1)
test "$(sed -n "$((s-5)),$((s+12))p" "$F" | sha256sum | cut -d' ' -f1)" = 0a3531275566491b2d038d4164036080fee3c25286feeea1929a9bfa1c460d7a
# startOwnerChatExpirySweep
test "$(grep -cxF -- 'function startOwnerChatExpirySweep(' "$F")" -eq 1
s=$(grep -nxF -- 'function startOwnerChatExpirySweep(' "$F" | cut -d: -f1)
test "$(sed -n "$((s-1)),$((s+5))p" "$F" | sha256sum | cut -d' ' -f1)" = 0bfb5184e40a89ed2c0a83a3e4ee1391794b806707b04e36fcb0a6311e00890c
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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/open-store.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/open-store.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/open-store.ts apps/website/src/server/runtime/composition/site-deps/__tests__/open-store.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts
git status --short
git commit -m "refactor(composition): M2 open-store helpers move out of deps.ts (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
