HARD RULE (first): stop before ~250k tokens of context. If you get close, stop at a consistent point (no half-moved row or edge), list DONE rows and a REMAINING list in your report, and stop. Stopping early at a consistent point is always correct.

# Terra job, stage 03: cut the import cycles that need no design

READY. Self-contained. Background only: `development/refactor-patterns/move-to-jini/PLAN.md` sections 1.1 and 1.2.

## Why
The website features form one import cycle of 24 features. Five runtime imports hold it together; three of them (this job) are plain repoints, and 18 more back edges are type-only imports that point "up". Moving those shared types down into `contracts/core` (the lowest Tovu layer) makes the graph one-way. Admin has 3 one-line back edges, Jini 2 module cycles. Behaviour does not change anywhere: only import paths and where declarations live.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

## Owner gate D2 (persistent; applies to every row, symbol and fallback in this job)
Owner decision D2 (may `@jini-ai/core` hold runtime helpers outside `core/contracts/`?) is OPEN; its default is WAIT. Until the coordinator replaces this block with the owner's answer:
- A row or symbol whose destination is `@jini-ai/core` outside a `contracts` subpath, or whose survey text names core as its home for runtime code, WAITS: do not move it, do not split it, and do NOT choose another package for it (not "the nearest domain package", not a new package). Report it as WAITING with `waits_on: owner:D2`.
- Not affected: types and interfaces under `@jini-ai/core/contracts/*`, and IMPORTING an existing `@jini-ai/core` export.

## Gate numbers (measured on `design-d1`, 2026-11-13; re-run first and paste)
```
cd /Users/la/Programming/tovu-terra-d1
node development/refactor-patterns/move-to-jini/feature-cycles.mjs                               # now: sccs=1 sizes=[24] mutual-pairs=3
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type                # now: sccs=2 sizes=[32,2] mutual-pairs=18
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type    # now: sccs=2 sizes=[3,2] mutual-pairs=3
```
Expected after each step (run the first command after steps 1 and 2, all three at the end):
- after step 1 (C1): runtime `sccs=1 sizes=[7]`
- after step 2 (C2): runtime `sccs=1 sizes=[5]`
- at the end: runtime `sccs=1 sizes=[5] mutual-pairs=3`; include-type `sccs=1 sizes=[5] mutual-pairs=3` (only custom-credentials, deployments, form-destinations, site-backup, source-control are left: stage 04 cuts those); admin `sccs=0 mutual-pairs=0`.
- and this must exit 0:
```
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type --assert-no-edge "publish-trust->deployments,project-keys->api-connections,agent-plugins->api-connections,agent-plugins->external-mcp,agent-plugins->member-login,database->recovery,media->post,navigation->post,publish-content->content-types,publish-content->deployments,publish-content->entries,publish-content->media,publish-content->navigation,publish-content->post,publish-content->taxonomy,publish-content->theme,site-inspection->deployments,taxonomy->post,theme->site-guide,vendor-credentials->source-control"
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type --assert-no-edge "publish-content->dashboard,themes->pages,pages->posts"
```
If the "now" numbers differ because stages 01-02b landed first, take your measured numbers as the baseline; the "at the end" numbers must still hold. A different end number means an edge below was missed or a new one was added: `--edges` (add `--include-type`) prints file:line for every edge in a cycle.

## Step 1. C1: publish-trust -> deployments (one line)
`apps/website/src/features/publish-trust/connect.ts:1` imports `isContainedDeployConfigPath` from `"../deployments/index.js"`. That name is only a re-export of `@jini-ai/devops/deploy` (`features/deployments/deploy-config-registry.ts:8-16`). Prove it: `grep -rn "isContainedDeployConfigPath" node_modules/@jini-ai/devops/dist/deploy/*.d.ts`. Then change the specifier to `"@jini-ai/devops/deploy"`. Nothing else.

## Step 2. C2: project-keys -> api-connections
a) `features/project-keys/site-references.ts:4` imports `apiConnectionVaultScope, PLUGIN_STATE_FORMAT` from `../api-connections/vault-stores.js`.
   - Move `API_CONNECTION_VAULT_KIND` (`vault-stores.ts:28`) and `apiConnectionVaultScope` (`vault-stores.ts:61-63`, with its doc comment if any) into `apps/website/src/platform/secrets/vault-api-connection-meta.ts` (it already declares `PLUGIN_STATE_FORMAT`). Add `import type { VaultContext } from "@jini-ai/platform/secrets/credential-sets";` there. Keep the values byte-identical (`ownerKey: "tovu"` included).
   - In `vault-stores.ts`: import both names from `"#src/platform/secrets/vault-api-connection-meta"` (merge into the existing import on line 12) and re-export them on the existing line 13 (`export { PLUGIN_STATE_FORMAT, API_CONNECTION_VAULT_KIND, apiConnectionVaultScope } from ...`), so `plugin-state-bindings.ts` and the tests keep their imports.
   - `site-references.ts:4`: import both names from `"#src/platform/secrets/vault-api-connection-meta"`.
   - Check: `grep -n "^import" apps/website/src/platform/secrets/vault-api-connection-meta.ts` shows no `#src/features` import.
   - Test: `apps/website/src/features/api-connections/__tests__/plugin-state-format.pin.unit.test.ts` (single-file command below).
b) `features/project-keys/shared-oauth-disconnect.ts:4` `import type { SharedOAuthOwnerStorage }` from `../api-connections/shared-owner.js`. Do NOT apply the TYPE-DOWN recipe here: that name is declared as `ReturnType<typeof createSharedOAuthOwnerStorage>` (`shared-owner.ts:79`), a runtime-value reference, so moving it would drag the factory (and the edge) along. The designer has specified an explicit contract instead; write exactly this:
   - New file `apps/website/src/contracts/core/api-connections/shared-owner.ts` (`@file` one line: "The shared OAuth owner storage contract; the api-connections factory implements it, project-keys consumes it."). Move into it, with their doc comments, `SharedOAuthIssuingContext` (`shared-owner.ts:10-17`) and `ApiConnectionVaultRecordStore` (`vault-stores.ts:42-46`), then declare:
```ts
/** The owner store for one shared (project-scope) OAuth connection: sealed issuing context, the
 *  connection record store and the token store. Implemented by `createSharedOAuthOwnerStorage`. */
export interface SharedOAuthOwnerStorage {
  readonly vault: SecretsVaultService;
  readonly records: ApiConnectionVaultRecordStore;
  readContext(required: { credentialId: string }): Promise<SharedOAuthIssuingContext | null>;
  saveContext(required: { credentialId: string; context: SharedOAuthIssuingContext }): Promise<void>;
  tokensFor(required: { context: SharedOAuthIssuingContext }): ApiConnectionTokenStore;
  readConnection(required: { credentialId: string }): Promise<SharedOAuthConnection | null>;
}
```
     Its imports are type-only and Jini-only: `SecretsVaultService` from `@jini-ai/platform/secrets/credential-sets`; `ApiConnectionRecordStore`, `ApiConnectionAttempt`, `ApiConnectionTokenStore`, `SharedOAuthConnection`, `ApiConnectionClientKind`, `ApiConnectionDescriptor` from `@jini-ai/integrations/api-connections`; `OAuthClient` from `@jini-ai/oauth` (prove each in the installed `.d.ts` with `grep -rn -w`; one missing = BLOCKED, leave all files as they were).
   - `api-connections/shared-owner.ts`: annotate the factory's return type `): SharedOAuthOwnerStorage {`, replace line 79 by `export type { SharedOAuthOwnerStorage, SharedOAuthIssuingContext } from "#src/contracts/core/api-connections/shared-owner";` plus an `import type` of the names it still uses. `api-connections/vault-stores.ts`: `import type` + `export type { ApiConnectionVaultRecordStore }` from the new file. Every other importer keeps its import.
   - Check each member signature against the factory's object literal (`shared-owner.ts:53-77`) by reading it; a member whose parameter or return type differs from the list above: stop on this edge and report BLOCKED with the line (the coordinator's cloud typecheck is the final proof).
   - `shared-oauth-disconnect.ts:4` imports `type { SharedOAuthOwnerStorage }` from `"#src/contracts/core/api-connections/shared-owner"`.
   - SUCCESSOR lines for the report: `apps/website/src/features/api-connections/shared-owner.ts#SharedOAuthOwnerStorage -> apps/website/src/contracts/core/api-connections/shared-owner.ts#SharedOAuthOwnerStorage` (same for `SharedOAuthIssuingContext`, `ApiConnectionVaultRecordStore`).

## Step 3. C4a: delete the source-control repository-target pass-through
`apps/website/src/features/source-control/repository-target.ts` is a 20-line wrapper: `repositoryTargetError(target, validateTarget)` calls `@jini-ai/devops/source-control` `repositoryTargetError(target, { validateTarget })`. Prove the Jini export: `grep -rn "repositoryTargetError" node_modules/@jini-ai/devops/dist/source-control/*.d.ts`.
- Callers: `features/source-control/commit-site.ts:18`, `features/custom-credentials/write-files-validation.ts:3`, test `features/source-control/__tests__/repository-target.unit.test.ts:3`. Import from `"@jini-ai/devops/source-control"` and rewrite each call `repositoryTargetError(x, v)` -> `repositoryTargetError(x, { validateTarget: v })` (a call with no second argument stays as is).
- The wrapper's `@file` comment explains the order of the checks (host rules first, then the generic one-segment rule). Move it, unchanged except "this file" wording, to sit above the `repositoryTargetError` import in `commit-site.ts`. Update the two comments that name the deleted path (`commit-site.ts:85`, `write-files-validation.ts:16`) to name `@jini-ai/devops/source-control` `repositoryTargetError` instead.
- `write-files-validation.ts:2` imports type `RepositoryTargetValidator` from `../source-control/provider-module.js`. It is declared in Jini (`@jini-ai/devops/source-control`, `contracts.ts:43`). If `provider-module.ts` only re-exports it, import it from `"@jini-ai/devops/source-control"` instead (prove it in the installed `.d.ts` first).
- Delete `repository-target.ts`. Run the moved test file once.
- Expected: no change in the feature numbers (custom-credentials -> source-control still has a runtime edge in `credential-ports.ts:15`; stage 04 cuts it).

## Step 4. TYPE-DOWN: the type-only back edges
Every import below is `import type` (or an inline `import("...").Name` in a type position). For each edge, per imported name, apply the FIRST rule that fits:
- R1 (declared in Jini). Follow `export ... from` lines from the imported file to the declaring file (at most 3 hops). If it ends in `@jini-ai/<pkg>/<sub>`, import the name from that Jini specifier directly (`import type`). Prove the name exists in `node_modules/@jini-ai/<pkg>/dist/<sub>/*.d.ts` with `grep -rn -w` first.
- R2 (whole types-only file). The declaring file has no runtime export (no `export const|function|class|enum`, no `export { value }`) and imports only `@jini-ai/*`, npm, `node:*`, `#src/platform/*` or `#src/contracts/*`: `git mv` it to `apps/website/src/contracts/core/<feature>/<basename>.ts`, fix its relative imports for the new folder, and recreate the old path as ONE line: `export type * from "#src/contracts/core/<feature>/<basename>";` (keeps every other importer working). The `@file` comment moves with the file.
- R3 (mixed file). Move only the named declaration(s) plus every same-file type they reference (transitively), each with its doc comment, to `apps/website/src/contracts/core/<feature>/<declaring-basename>.ts` (create it; start it with a one-line `@file` comment: "Types shared by <feature> and the features below it; moved here so imports point one way."). In the declaring file add `import type { ... } from "#src/contracts/core/<feature>/<basename>";` (only the names it still uses) and `export type { ... } from "#src/contracts/core/<feature>/<basename>";` so its other importers need no change. A referenced type from ANOTHER file of the same feature: apply R1-R3 to it too. A referenced type from another FEATURE, a runtime value (`typeof x`, an enum, a class, a const array used in a type) or more than 600 moved lines from one declaring file: the edge is BLOCKED (report the reason and the line count; leave the file as it was).
- Then the back-edge file imports from the new home (`#src/contracts/core/...` or Jini) with `import type`. Do not add the new files to `contracts/core/index.ts`.
- Rule for `contracts/core`: its files import only `@jini-ai/*`, npm, `node:*`, `#src/platform/*` and `#src/contracts/*`. Check every file you created or moved there: `grep -n "features/" <file>` must print nothing.

Edges (file:line -> names; "decl" = where the name is declared today, a hint: verify):
| Edge | Importing file:line | Names | Decl / expected rule |
|---|---|---|---|
| agent-plugins->api-connections | `features/agent-plugins/connect-tool.ts:24`, `service-ports.ts:12` | `DeclaredApiConnection` | `api-connections/contribution.ts:33` (R3) |
| agent-plugins->api-connections | `features/agent-plugins/service-ports.ts:13` | `ApiConnectionConnectStatus` | re-export of `@jini-ai/integrations/api-connections` (R1) |
| agent-plugins->external-mcp | `features/agent-plugins/service-ports.ts:4` | `ExternalMcpConnectStart` | `external-mcp/contracts.ts:10-14` export-type block; follow it (R1 if Jini, else R2/R3) |
| agent-plugins->member-login | `features/agent-plugins/exports/runtime.ts:7` | `LoginProvider` | `member-login/types.ts` re-exports `@jini-ai/user-management/server` (R1) |
| database->recovery | `features/database/repo.memory.ts:2` | `CreateRestorePointRepoPort` | `recovery/restore-points.ts` is `export * from "@jini-ai/db/recovery/restore-point-create"` (R1) |
| media->post | `features/media/access-evidence.ts:1` | `PostRecord` | `post/post.ts:41` (R3) |
| media->post | `features/media/where-used.ts:7` | `PostRepoPort` | `post/post.ts:324` (R3, same new file as PostRecord: `contracts/core/post/post.ts`) |
| navigation->post | `features/navigation/page-target-resolver.ts:1` | `PostRepoPort` | as above |
| taxonomy->post | `features/taxonomy/tool-registrations.ts:47` | `PostRepoPort` | as above |
| publish-content->post | `publish-content/push-plan.ts:8`; `tool-deps.ts:11`; `tool-registrations.ts:53`; `type-registry.ts:3` | `PostRecord`; `BeforeSaveHookPort`; `BeforeSaveHookPort`; `BeforeSaveHookPort, ForgetRemovedPostFn, PostRepoPort, RemovePostFn` | `post/post.ts:41,275,2011,324,724` (R3; `post-vocabulary.ts` types follow R2/R3) |
| publish-content->media | `publish-content/type-registry.ts:4`; `backstop-ports.ts:22` (inline `import("#src/features/media/index").BlobStorePort`) | `AssetBlobRepoPort, BlobStorePort` / `MediaContentTypeStorePort` / `VersionedMediaRepoPort` | first two: `@jini-ai/cms/media` (R1); `media/content-type-store.ts:34`, `media/versioned-media-repo.ts:39` (R3). In `backstop-ports.ts` replace the inline import by a top-level `import type { BlobStorePort } from "@jini-ai/cms/media";` |
| publish-content->navigation | `publish-content/type-registry.ts:5` | `MenuRepoPort, NavLocationBindingRepoPort` | follow `navigation/index.ts` -> `repo.ts:8-11` (expect R1 `@jini-ai/cms/navigation`) |
| publish-content->content-types | `publish-content/type-registry.ts:8` | `ContentTypeListPort, ContentTypeRepoPort, IndexProvisionerPort` | expect R1 `@jini-ai/cms/content-types` |
| publish-content->taxonomy | `publish-content/type-registry.ts:9-21`; `:22` | 11 port names; `EntryTermReadPort, TaxonomyPublishReadPort, TermPublishReadPort` | the 11: R1 `@jini-ai/cms/taxonomy`; the 3: `taxonomy/contracts.ts` (types only, imports only `@jini-ai/cms/taxonomy`: R2) |
| publish-content->entries | `publish-content/type-registry.ts:23`; `:26` | `EntryListPort, EntryRepoPort`; `EntryListExcludingTypesPort, EntryPublishReadPort` | first: R1 `@jini-ai/cms/entries` (follow `entries/index.ts`); second: `entries/contracts.ts:31,51` (has runtime consts: R3) |
| publish-content->theme | `publish-content/type-registry.ts:33` | `DiscoveredTheme` | `theme/catalog.ts:2` re-exports `theme/theme.ts:46` (R3, new file `contracts/core/theme/theme.ts`) |
| publish-content->deployments | `publish-content/peer-transport.ts:11`; `tool-deps.ts:1`; `tool-registrations.ts:3` | `PublishHistoryStore, PublishTrigger`; `PublishHistoryStore`; `PublishHistoryStore` | `deployments/static-publish/publish-history.ts:85,44` (R3) |
| site-inspection->deployments | `features/site-inspection/live-url.ts:5` | `PublishHistoryStore` | as above |
| theme->site-guide | `features/theme/capability-card.ts:2` | `CapabilityCard` | `site-guide/contracts.ts:3` (25 lines; R2 if types only, else R3) |
| vendor-credentials->source-control | `features/vendor-credentials/vault-adapter.ts:4` | `SourceControlCredentialSetRecord` | `source-control/types.ts:23` (R3). It references `SealedSecret` (`../webhooks/index.js`: follow, expect Jini) and `CredentialProjectHalf<R>` (`vendor-credentials/project-scope.ts:19`, references `SecretSealerPort` from `../webhooks/index.js`). Move `CredentialProjectHalf` down too, to `contracts/core/vendor-credentials/project-scope.ts` (R3), so `contracts/core/source-control/types.ts` imports it from contracts/core, never from a feature. If `webhooks/index.js` does not lead to Jini for those two names: BLOCKED. |
| project-keys->api-connections | `features/project-keys/shared-oauth-disconnect.ts:4` | `SharedOAuthOwnerStorage` | NOT this recipe: step 2b (explicit contract; the name is a `ReturnType<typeof factory>`) |

After this step, `node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type --edges` must not list any of these importing file:line pairs. The 4 remaining type edges of the 5-feature SCC (`custom-credentials/tool-registrations.ts:9`, `:49`, ...) belong to stage 04: leave them.

## Step 5. Admin: 3 back edges (apps/admin/src)
a) `features/publish-content/hooks/use-publish-section-button.hooks.ts:4` imports `t` from `../../dashboard/dashboard-i18n`. `git mv apps/admin/src/features/dashboard/dashboard-i18n.ts apps/admin/src/lib/dashboard-i18n.ts`, fix its own relative imports, and repoint EVERY importer (`rg -l "dashboard-i18n" apps/admin/src`, tests included).
b) `features/themes/hooks/use-theme-explore.hooks.ts:10` imports `homeFallbackPublishReason` from `../../pages/lib/theme-page-publish-state`. Move that one function with its doc comment (`theme-page-publish-state.ts:~88-106`) to a new `apps/admin/src/features/themes/lib/home-fallback-publish-reason.ts`. Its parameter type `ThemePageSlugCollision` comes from pages, which would recreate the edge: type the parameter structurally with only the member it reads, `homePage: { readonly title: string } | null` (wider, so every caller still compiles). `Translate` stays `import type` from `@jini-ai/ui/panel-kit`. `theme-page-publish-state.ts` imports it from `../../themes/lib/home-fallback-publish-reason` (pages -> themes already exists) and re-exports it (`export { homeFallbackPublishReason } from ...`) so `pages/__tests__/theme-page-publish-state.unit.test.ts` keeps working. `use-theme-explore.hooks.ts:10` imports from `../lib/home-fallback-publish-reason`. Update the two comments that name the old location (`use-theme-explore.hooks.ts:394`, `:432`).
c) `features/pages/page-editor-i18n.ts:13` imports `t` from `../posts/posts-i18n`. `git mv apps/admin/src/features/posts/posts-i18n.ts apps/admin/src/lib/posts-i18n.ts`; repoint every importer (`rg -l "posts-i18n" apps/admin/src`).
Tests: run each admin test file that imports a moved file once (admin single-file command). Lint the changed files.

## Step 6. Jini: 2 module cycles (Jini clone, `/Users/la/Programming/jini-terra-d1`)
a) `packages/cms/src/forms/errors.ts:51,53` uses inline `import('./stale-form.js').FormRetryDraft`, and `stale-form.ts` imports `errors.ts`. Move `FormRetryAnswer` and `FormRetryDraft` (`stale-form.ts:7-8`) into `packages/cms/src/forms/types.ts`. `stale-form.ts` imports them from `./types.js` and keeps exporting them (`export type { FormRetryAnswer, FormRetryDraft } from './types.js';`) so the public surface is unchanged; `errors.ts` uses a top-level `import type { FormRetryDraft } from './types.js';` in place of the two inline imports. Check: `grep -n "stale-form" packages/cms/src/forms/errors.ts` prints nothing.
b) `packages/admin/src/comments/react/hooks/QueueSection.hooks.ts:8` imports `QueueActionsCell` (a value) from the component file that imports these hooks. Move exactly two declarations; everything else stays where it is (`QueueToolbar`, `QueueTable`, `QueueItemsView`, `QueuePurgeDialog`, `QueueSectionProps`, `QueueSection`, `useQueueSection`, `useQueueToolbar`, `queueColumns`, `useQueueTable`):
   - `useQueueActionsCell` = `hooks/QueueSection.hooks.ts:23-31` (from `export function useQueueActionsCell(` to its closing `}` on line 31; it has no doc comment) -> new `hooks/QueueActionsCell.hooks.ts`. Its imports: `import type { AdminComment, CommentModerationAction, CommentStatus } from '../../../core/ports/comments.js';`, `import { commentRowMenuItems } from '../../rules.js';`, `import type { CommentsTranslator } from '../../messages.en.js';`.
   - `QueueActionsCell` = `components/QueueSection.tsx:47-83` (its 4-line doc comment at 47-50, then the function to its closing `}` on line 83) -> new `components/QueueActionsCell.tsx`. Its imports: the `AdminComment, CommentModerationAction, CommentStatus` types, `CommentsTranslator`, `RowActionState` (type, `../../rules.js`), `RowMenu` (`../../../react/components/RowMenu/RowMenu.js`), `interpolate` (`@jini-ai/ui/panel-kit`), and `useQueueActionsCell` from `'../hooks/QueueActionsCell.hooks.js'`.
   - `hooks/QueueSection.hooks.ts:8` becomes `import { QueueActionsCell } from '../components/QueueActionsCell.js';` plus `import type { QueueSectionProps } from '../components/QueueSection.js';` (type-only: no runtime edge). Delete the moved function; drop imports it alone used (`commentRowMenuItems` stays if `queueColumns`/others still use it: check each name with `grep -n -w`).
   - `components/QueueSection.tsx`: delete the moved function; `useQueueActionsCell` leaves its line-10 import (only `QueueActionsCell` used it); drop `RowMenu`/`interpolate` imports only if nothing else in the file uses them (`grep -n -w`).
   - Re-exports, so any importer of the old file keeps working: `QueueSection.tsx` adds `export { QueueActionsCell } from './QueueActionsCell.js';` and `QueueSection.hooks.ts` adds `export { useQueueActionsCell } from './QueueActionsCell.hooks.js';`. Neither name is in a package `index.ts` today (`grep -rn "QueueActionsCell" packages/admin/src --include=index.ts` prints nothing before and after).
   - Check: `grep -n "QueueSection" components/QueueActionsCell.tsx hooks/QueueActionsCell.hooks.ts` prints nothing; `grep -n "^import" hooks/QueueSection.hooks.ts` shows no VALUE import of `../components/QueueSection.js`.
   - Module-cycle check: `python3 /Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini/jini-cycles.py admin > /Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini/.cycles-admin-before.txt` BEFORE the edit, and `python3 /Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini/jini-cycles.py admin --baseline /Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini/.cycles-admin-before.txt` after (must exit 0; it needs `/Users/la/Programming/jini-terra-d1/node_modules`: if missing, say so in the report and skip only this check). Same for `cms` around step 6a.
Checks: `pnpm --filter @jini-ai/cms exec tsc -p tsconfig.json --noEmit` and the same for `@jini-ai/admin`; run the existing tests of those files one at a time (`ls packages/cms/src/forms/__tests__ packages/admin/src/comments/react/**/__tests__ 2>/dev/null`, pick the ones naming errors/stale-form/QueueSection). Do NOT build or publish Jini; this stage changes no export.

## Rules for every edit
- Keep every comment. A comment that explains WHY moves with the code it explains; never delete one to make a move fit. Do not add new comments except the doc comments this prompt asks for.
- No new `as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, non-null `!`, no lazy `await import()`.
- Do not change behaviour, error text, signatures or argument order unless this prompt says so. Functions keep the `(required, optional = {})` shape they have.
- Never `git add -A`, `git stash`, `git checkout -- <file>` or `git reset`. Other agents may share the tree.
- Run NO test suites and no repo-wide `tsc`. Allowed checks, one file at a time:
  - Tovu website/assistant/server test: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <one test file>`
  - Tovu admin test: `cd apps/admin && npx vitest run <one test file> --maxWorkers=2`
  - Jini test: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec vitest run <one test file> --maxWorkers=2`
  - Jini typecheck of a package you touched: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec tsc -p tsconfig.json --noEmit`
  - Lint: `npx eslint <changed files>` (no new errors).
  Single-file tests only: never run a whole suite, a glob or a directory. Leave nothing running (no watchers, servers or background jobs); if a command hangs past 5 minutes, kill only the process you started.
- Do NOT commit and do NOT push, in either repo: the coordinator reviews and commits. Your report lists every changed, added and deleted path per repo.

## Done check
- The assert commands under "Gate numbers" exit 0 and the three counts match "at the end".
- `npx eslint <every changed Tovu file>`; each changed or moved test file run once.
- `grep -rln "features/" apps/website/src/contracts/core/*/` prints nothing new.

Change summary for the coordinator's commits (Tovu, then Jini): `refactor(tovu): cut feature import cycles, move shared types down (move-to-jini stage 03)` and `refactor(jini): break two module cycles in cms forms and admin comments (move-to-jini stage 03)`.

## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), WAITING, or SKIPPED (why). Use the row's `was` path if set, else its path, as the key. Every row that is not DONE also gets `waits_on:` = what must land first: `path:<tovu path>` (a file that must be gone), `stage:<id>` (e.g. `stage:15-cms`), `owner:<Dn>`, or `design:<one line>`. The coordinator copies these into `development/refactor-patterns/move-to-jini/ledger.tsv`; rows come back automatically when their dependency lands (`stage-lists.mjs --retry`).
   Every file or symbol you moved or renamed: one line `SUCCESSOR <old path>[#symbol] -> <new path or @jini-ai specifier>[#symbol]` (the coordinator copies them into `successors.tsv` so later stage lists follow the code).
2. The gate outputs (before/after).
3. Changed, added and deleted paths per repo (you do not commit).
4. Anything surprising, in one line each. Do not paste diffs.
