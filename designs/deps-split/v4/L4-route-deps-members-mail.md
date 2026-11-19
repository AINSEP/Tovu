# L4 — `route-deps-members-mail` (deps-split v4, literal runs)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.

## What moves
Contiguous entry runs of the `routeDeps` object literal (tip `const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {`, 2135-2715). A run never crosses one of the literal's 7 spreads (they stay in the literal, in place), so every key keeps its position relative to every spread and every other key: property evaluation order and overwrite order are unchanged by construction. Each run becomes one spread of a call at the run's place. No run contains a top-level `await` (the 7 `await`s inside entries are in nested async functions and move with them). Self-reads of `routeDeps` are getters. Runs are cut at ≤44 code lines so each function is ≤50 with its 4 frame lines. This sheet runs after H2 and L1, L2, L3.

### `routeDepsMembersMail` — tip 2378-2412 (19 entries, 23 code lines; first key `principalRepo`, last `mailDomainRequirements`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-members-mail.ts`: `export function routeDepsMembersMail(required: RouteDepsMembersMailRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "principalRepo" | "removeUser" | "isInTrash" | "redirectRepo" | "redirectHitSink" | "originRegistry" | "redirectsWriteDeps" | "memberRepo" | "removeMember" | "memberTierRepo" | "memberSubscriptionRepo" | "memberSessionRepo" | "magicLinkRepo" | "mailer" | "settleMailer" | "mailStatus" | "setAgentPluginEnabled" | "mailProviderControl" | "mailDomainRequirements">` with body `const { kernel, settingsPrincipals, originRegistry, redirectRepo, redirectHitSink, trash, removeUser, isInTrash, redirectsWriteDeps, runtimeMode, memberRepo, resolvedMailer, mailDurableOutboxReady } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`), then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsMembersMail({ kernel, settingsPrincipals, originRegistry, redirectRepo, redirectHitSink, trash, removeUser, isInTrash, redirectsWriteDeps, runtimeMode, memberRepo, resolvedMailer, mailDurableOutboxReady }),
```
- **Inputs** (`RouteDepsMembersMailRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `kernel` | value | `const kernel = store.content;` |
| `settingsPrincipals` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["settingsPrincipals"]` |
| `originRegistry` | value | B07 output → `ReturnType<typeof composeEventsOrigin>["originRegistry"]` |
| `redirectRepo` | value | B07 output → `ReturnType<typeof composeEventsOrigin>["redirectRepo"]` |
| `redirectHitSink` | value | B07 output → `ReturnType<typeof composeEventsOrigin>["redirectHitSink"]` |
| `trash` | value | B11 output → `ReturnType<typeof composeTrashService>["trash"]` |
| `removeUser` | value | B11 output → `ReturnType<typeof composeTrashService>["removeUser"]` |
| `isInTrash` | value | B11 output → `ReturnType<typeof composeTrashService>["isInTrash"]` |
| `redirectsWriteDeps` | value | B12 output → `ReturnType<typeof composeRedirects>["redirectsWriteDeps"]` |
| `runtimeMode` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["runtimeMode"]` |
| `memberRepo` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["memberRepo"]` |
| `resolvedMailer` | value | B19 output → `ReturnType<typeof composeMailHttp>["resolvedMailer"]` |
| `mailDurableOutboxReady` | value | B19 output → `ReturnType<typeof composeMailHttp>["mailDurableOutboxReady"]` |

### `routeDepsMailFormsNewsletter` — tip 2416-2495 (37 entries, 44 code lines; first key `mailActivity`, last `formsRateLimiter`)
- **To** `apps/website/src/server/runtime/composition/site-deps/route-deps-members-mail.ts`: `export function routeDepsMailFormsNewsletter(required: RouteDepsMailFormsNewsletterRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "mailActivity" | "mailSuppressionAdmin" | "menuRepo" | "navLocationBindingRepo" | "removeMenu" | "webhookSubscriptionRepo" | "webhookDeliveryRepo" | "webhookSigner" | "mediaRepo" | "assetBlobRepo" | "assetRenditionRepo" | "mediaContentTypeStore" | "blobStore" | "documentTextExtractors" | "blobHydrationReady" | "adminPasswordResetReady" | "transformDefinitionRepo" | "imageTransformer" | "imageCodec" | "newsletterReady" | "newsletterCampaignRepo" | "newsletterListRepo" | "newsletterSubscriptionRepo" | "newsletterAudienceSnapshotRepo" | "newsletterSendRepo" | "newsletterConfirmationTokenRepo" | "membersConsentCapability" | "newsletterSubscriberDirectory" | "newsletterKeyring" | "newsletterHooks" | "formDefinitionRepo" | "formCollectionProviders" | "formSubmissionRepo" | "formSubmissionAttempts" | "removeFormSubmission" | "executeCommand" | "formsRateLimiter">` with body `const { kernel, blobStore, clock, adminPasswordResetReady, menuRepo, navLocationBindingRepo, newsletterListRepo, newsletterReady, transformDefinitionRepo, blobHydrationReady, assetRenditionRepo, trash, formDefinitionRepo, formCollectionProviders, formSubmissionRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks, mediaRepo, assetBlobRepo, mediaContentTypeStore } = required;` then `return {`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as `name()`), then `};`. The `Pick<…>` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
```ts
    ...routeDepsMailFormsNewsletter({ kernel, blobStore, clock, adminPasswordResetReady, menuRepo, navLocationBindingRepo, newsletterListRepo, newsletterReady, transformDefinitionRepo, blobHydrationReady, assetRenditionRepo, trash, formDefinitionRepo, formCollectionProviders, formSubmissionRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks, mediaRepo, assetBlobRepo, mediaContentTypeStore }),
```
- **Inputs** (`RouteDepsMailFormsNewsletterRequired`):

| field | how passed | type source (after the earlier sheets) |
|---|---|---|
| `kernel` | value | `const kernel = store.content;` |
| `blobStore` | value | B02 output → `ReturnType<typeof composeMediaStorage>["blobStore"]` |
| `clock` | value | B03 output → `ReturnType<typeof composeStoreBasics>["clock"]` |
| `adminPasswordResetReady` | value | B05 output → `ReturnType<typeof composeIdentitySettings>["adminPasswordResetReady"]` |
| `menuRepo` | value | B06 output → `ReturnType<typeof startBootData>["menuRepo"]` |
| `navLocationBindingRepo` | value | B06 output → `ReturnType<typeof startBootData>["navLocationBindingRepo"]` |
| `newsletterListRepo` | value | B06 output → `ReturnType<typeof startBootData>["newsletterListRepo"]` |
| `newsletterReady` | value | B06 output → `ReturnType<typeof startBootData>["newsletterReady"]` |
| `transformDefinitionRepo` | value | B06 output → `ReturnType<typeof startBootData>["transformDefinitionRepo"]` |
| `blobHydrationReady` | value | B06 output → `ReturnType<typeof startBootData>["blobHydrationReady"]` |
| `assetRenditionRepo` | value | B07 output → `ReturnType<typeof composeEventsOrigin>["assetRenditionRepo"]` |
| `trash` | value | B11 output → `ReturnType<typeof composeTrashService>["trash"]` |
| `formDefinitionRepo` | value | B14 output → `ReturnType<typeof composeContentRepos>["formDefinitionRepo"]` |
| `formCollectionProviders` | value | `let formCollectionProviders = () => createFormCollectionRegistry({});` |
| `formSubmissionRepo` | value | B15 output → `ReturnType<typeof composeContentResolversComments>["formSubmissionRepo"]` |
| `newsletterKeyring` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["newsletterKeyring"]` |
| `newsletterSubscriberDirectory` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["newsletterSubscriberDirectory"]` |
| `newsletterHooks` | value | B16 output → `ReturnType<typeof composeSiteKeysMembers>["newsletterHooks"]` |
| `mediaRepo` | value | B20 output → `ReturnType<typeof composeContentStores>["mediaRepo"]` |
| `assetBlobRepo` | value | B20 output → `ReturnType<typeof composeContentStores>["assetBlobRepo"]` |
| `mediaContentTypeStore` | value | B21 output → `ReturnType<typeof composePublishingStoresThemes>["mediaContentTypeStore"]` |

Type each required field mechanically: a B-sheet output → `ReturnType<typeof composeX>["name"]` as shown; `const x = f(…)` → `ReturnType<typeof f>`; `const x = await f(…)` → `Awaited<ReturnType<typeof f>>`; `const { x } = f(…)` → `ReturnType<typeof f>["x"]`; `new C(…)` → `C`; an annotated declaration → its annotation; `overrides` → `Partial<CreateSiteRouteDepsOverrides>` from `./overrides.js`; `dbPath` → `string`; `store` → `SiteStore`; `onStoreClose` → `(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void` with `StoreCloseRegistration` from `./open-store.js`; `kernel` → `SiteStore["content"]`; `workspaceId` → `string`. A getter field is `() => T` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

A getter is required wherever the binding is declared after the call or is a root `let` reassigned after it; passing such a binding as a value is either a TypeScript error (TS2448/TS2454) or reads a stale cell — the characterization test fails on the latter.

### Imports used by the moved entries
| name | from (as written in deps.ts) | action |
|---|---|---|
| `FORMS_SUBMIT_PROFILE` | `#src/features/forms/index` | **move** (delete from deps.ts) |
| `SharpImageTransformer` | `#src/features/media/index` | **move** (delete from deps.ts) |
| `SqliteMagicLinkTokenRepo` | `#src/features/members/index` | **move** (delete from deps.ts) |
| `SqliteMemberSessionRepo` | `#src/features/members/index` | **move** (delete from deps.ts) |
| `SqliteMemberSubscriptionRepo` | `#src/features/members/index` | **move** (delete from deps.ts) |
| `SqliteMemberTierRepo` | `#src/features/members/index` | **move** (delete from deps.ts) |
| `SqliteNewsletterAudienceSnapshotRepo` | `#src/features/newsletter/repo.sqlite` | **move** (delete from deps.ts) |
| `SqliteNewsletterCampaignRepo` | `#src/features/newsletter/repo.sqlite` | **move** (delete from deps.ts) |
| `SqliteNewsletterConfirmationTokenRepo` | `#src/features/newsletter/repo.sqlite` | **move** (delete from deps.ts) |
| `SqliteNewsletterSendRepo` | `#src/features/newsletter/repo.sqlite` | **move** (delete from deps.ts) |
| `SqliteNewsletterSubscriptionRepo` | `#src/features/newsletter/repo.sqlite` | **move** (delete from deps.ts) |
| `SqliteWebhookDeliveryRepo` | `#src/platform/db/sqlite/webhook-repo.sqlite` | **move** (delete from deps.ts) |
| `SqliteWebhookSubscriptionRepo` | `#src/platform/db/sqlite/webhook-repo.sqlite` | **move** (delete from deps.ts) |
| `bindRemoveEntity` | `@jini-ai/cms/trash` | copy (still used in deps.ts) |
| `createKeyringBackedSigner` | `#src/features/webhooks/signing.keyring` | **move** (delete from deps.ts) |
| `createMailActivityRepo` | `#src/features/mail/activity.repo` | **move** (delete from deps.ts) |
| `createMailSuppressionAdminRepo` | `#src/features/mail/suppression-admin.repo` | **move** (delete from deps.ts) |
| `createMammothDocumentTextExtractor` | `@jini-ai/cms/media/plugins/document-text/mammoth` | **move** (delete from deps.ts) |
| `createRateLimiter` | `#src/contracts/core/rate-limit/rate-limit` | **move** (delete from deps.ts) |
| `createShareArchiveReader` | `#src/features/site-backup/import-archive-reader` | **move** (delete from deps.ts) |
| `createUnpdfDocumentTextExtractor` | `@jini-ai/cms/media/plugins/document-text/unpdf` | **move** (delete from deps.ts) |
| `formSubmissionAttemptsFor` | `#src/features/forms/index` | **move** (delete from deps.ts) |
| `importYauzl` | `yauzl` | **move** (delete from deps.ts) |
| `removeEntityWithoutBlocker` | `#src/features/trash/index` | copy (still used in deps.ts) |
| `wrapMailerWithPurposeGate` | `#src/platform/mail/purpose-scoped-mailer` | **move** (delete from deps.ts) |

Relative specifiers gain one `../` in `site-deps/` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`); `#src/…` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).

Also import `type NewsletterRouteDeps` (`../../../inbound/admin-http/routes/newsletter/deps.js`) and `type ByokToolSurfaceDeps` (deps.ts's specifier with one more `../`) for the return types; both stay imported by deps.ts (the root literal's annotation).

## Importers to repoint
None.

## Source readers of deps.ts (literal match on the tip)
- `apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts` — its literal(s) found in this range: `capability-inventory.ts`, `newsletterKeyring`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-members-mail.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts` — its literal(s) found in this range: `apps/website/src`, `server/runtime/composition/app.ts`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-members-mail.ts` (read both files where the test reads deps.ts); no other change to it.
- `apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts` — its literal(s) found in this range: `package.json`, `apps/website/`, `apps/website/src/server/`, `apps/website/src/server`. If step 6 fails in this file, point that assertion at `apps/website/src/server/runtime/composition/site-deps/route-deps-members-mail.ts` (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-members-mail.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins: each run's call sits in the routeDeps literal exactly where its entries sat (between the same
// neighbours, spreads included), each run returns its keys in tip order, and getters are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const RUNS = new URL("../route-deps-members-mail.ts", import.meta.url);
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

test("L4: the run calls sit where their entries sat", () => {
  const items = literalItems();
  const at = items.findIndex((t) => t.startsWith("...routeDepsMembersMail("));
  assert.ok(at >= 0, "first run call missing");
  assert.ok(items[at - 1].startsWith("...identity"));
  const expected: readonly string[] = ["...routeDepsMembersMail(","...resolvedMailer.operations","...routeDepsMailFormsNewsletter(","siteAssistantRateLimiter: createRateLimiter({ profile: SITE_ASSISTANT_PER_IP, clock })"];
  expected.forEach((prefix, i) => assert.ok(items[at + i]?.startsWith(prefix), `item ${at + i}: ${items[at + i]}`));
});

test("L4: each run returns its keys in tip order", () => {
  const file = parse(RUNS);
  const keys: Record<string, readonly string[]> = {"routeDepsMembersMail":["principalRepo","removeUser","isInTrash","redirectRepo","redirectHitSink","originRegistry","redirectsWriteDeps","memberRepo","removeMember","memberTierRepo","memberSubscriptionRepo","memberSessionRepo","magicLinkRepo","mailer","settleMailer","mailStatus","setAgentPluginEnabled","mailProviderControl","mailDomainRequirements"],"routeDepsMailFormsNewsletter":["mailActivity","mailSuppressionAdmin","menuRepo","navLocationBindingRepo","removeMenu","webhookSubscriptionRepo","webhookDeliveryRepo","webhookSigner","mediaRepo","assetBlobRepo","assetRenditionRepo","mediaContentTypeStore","blobStore","documentTextExtractors","blobHydrationReady","adminPasswordResetReady","transformDefinitionRepo","imageTransformer","imageCodec","newsletterReady","newsletterCampaignRepo","newsletterListRepo","newsletterSubscriptionRepo","newsletterAudienceSnapshotRepo","newsletterSendRepo","newsletterConfirmationTokenRepo","membersConsentCapability","newsletterSubscriberDirectory","newsletterKeyring","newsletterHooks","formDefinitionRepo","formCollectionProviders","formSubmissionRepo","formSubmissionAttempts","removeFormSubmission","executeCommand","formsRateLimiter"]};
  for (const [name, expected] of Object.entries(keys)) {
    const ret = bodyOf(file, name).find((s): s is ts.ReturnStatement => ts.isReturnStatement(s));
    assert.ok(ret?.expression && ts.isObjectLiteralExpression(ret.expression), name);
    assert.deepEqual(ret.expression.properties.map((p) => p.name?.getText() ?? ""), expected);
  }
});

test("L4: getter inputs are only read lazily", () => {
  const file = parse(RUNS);
  for (const name of ["routeDepsMembersMail","routeDepsMailFormsNewsletter"]) assert.deepEqual(eagerReads(bodyOf(file, name), []), [], name);
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
# routeDepsMembersMail
test "$(grep -cxF -- '    principalRepo: settingsPrincipals,' "$F")" -eq 1
s=$(grep -nxF -- '    principalRepo: settingsPrincipals,' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+34))p" "$F" | sha256sum | cut -d' ' -f1)" = 50c41ae831f6ea39c98239429a3af8b6dfbbb1d86e804614e034df686c4266c2
# routeDepsMailFormsNewsletter
test "$(grep -cxF -- '    // Email page phase 4: send history over the ledgers, and the live purpose gate asked without sending.' "$F")" -eq 1
s=$(grep -nxF -- '    // Email page phase 4: send history over the ledgers, and the live purpose gate asked without sending.' "$F" | cut -d: -f1)
test "$(sed -n "$((s-0)),$((s+79))p" "$F" | sha256sum | cut -d' ' -f1)" = 2fa91eefe33825c7a0ebcc9200fccc887fb559ef54b90f5796859b8225222110
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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/route-deps-members-mail.ts
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
  apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-members-mail.characterization.unit.test.ts
```
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/route-deps-members-mail.ts apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-members-mail.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): L4 route-deps-members-mail literal runs move out of composeSiteRouteDeps (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only this sheet's files and the readers step 4 changed, and `development/scripts/size-debt.json` only if `check:size` printed `Delete stale debt entry` for a deps.ts row (delete exactly that row) — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
