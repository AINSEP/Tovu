#!/usr/bin/env python3
"""Writes the stage prompts 03, 04, 06-11 and 12-16 from the shared blocks in prompt-blocks.py.

Why generated: every Terra prompt must be self-contained (Terra gets nothing else), so the shared
rules are pasted into each one; generating keeps them identical, and the MOVE stages embed a per-row
pre-check table from move-table.py that goes stale when the stage lists are rebuilt.

Usage (from the Tovu clone root): python3 development/refactor-patterns/move-to-jini/write-prompts.py
Optional: --move-stage NN --input <tsv>  writes stage-NN.terra-prompt.md for any MOVE-shaped list
(stage 13 READY rows, stage 12 re-runs) with the same template.
"""
import importlib.util, os, runpy, sys

HERE = os.path.dirname(os.path.abspath(__file__))
B = runpy.run_path(os.path.join(HERE, "prompt-blocks.py"))
spec = importlib.util.spec_from_file_location("move_table", os.path.join(HERE, "move-table.py"))
MT = importlib.util.module_from_spec(spec)
spec.loader.exec_module(MT)

D, TOVU, JINI = B["D"], B["TOVU"], B["JINI"]
BUDGET, REPOS, READY, PORTS, REPORT, CYCLE_GATE = B["BUDGET"], B["REPOS"], B["READY"], B["PORTS"], B["REPORT"], B["CYCLE_GATE"]
RULES_TERRA, RULES_OPUS = B["RULES_TERRA"], B["RULES_OPUS"]
F = f"node {D}/feature-cycles.mjs"
REPORT_T = REPORT.replace("3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.", "3. Changed, added and deleted paths per repo (you do not commit).")
assert REPORT_T != REPORT
BUDGET_T = BUDGET.replace("commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.",
                          "stop at a consistent point (no half-moved row or edge), list DONE rows and a REMAINING list in your report, and stop. Stopping early at a consistent point is always correct.")
assert BUDGET_T != BUDGET

RATCHET = f"""## Ratchet gate (stage 04 has landed: every count must be 0; run before and after, paste both)
```
cd {TOVU}
{F} --include-type --max-scc 0 --max-pairs 0
{F} --app admin --include-type --max-scc 0 --max-pairs 0
```
Exit code 1 = you added a feature cycle. Find it with `--edges` and undo the import that made it (moved code must not import back up into a Tovu feature).
"""

C1_C5 = "publish-trust->deployments,project-keys->api-connections,custom-credentials->deployments,custom-credentials->source-control,source-control->site-backup"
T18 = ("agent-plugins->api-connections,agent-plugins->external-mcp,agent-plugins->member-login,database->recovery,media->post,"
       "navigation->post,publish-content->content-types,publish-content->deployments,publish-content->entries,publish-content->media,"
       "publish-content->navigation,publish-content->post,publish-content->taxonomy,publish-content->theme,site-inspection->deployments,"
       "taxonomy->post,theme->site-guide,vendor-credentials->source-control")


def write(name, text):
    with open(os.path.join(HERE, name), "w", encoding="utf8") as fh:
        fh.write(text.rstrip() + "\n")
    print("wrote", name)


# ---------------------------------------------------------------- stage 03 (Terra)
STAGE03 = BUDGET_T + f"""
# Terra job, stage 03: cut the import cycles that need no design

READY. Self-contained. Background only: `{D}/PLAN.md` sections 1.1 and 1.2.

## Why
The website features form one import cycle of 24 features. Five runtime imports hold it together; three of them (this job) are plain repoints, and 18 more back edges are type-only imports that point "up". Moving those shared types down into `contracts/core` (the lowest Tovu layer) makes the graph one-way. Admin has 3 one-line back edges, Jini 2 module cycles. Behaviour does not change anywhere: only import paths and where declarations live.

{REPOS}
## Gate numbers (measured on `design-d1`, 2026-11-13; re-run first and paste)
```
cd {TOVU}
{F}                               # now: sccs=1 sizes=[24] mutual-pairs=3
{F} --include-type                # now: sccs=2 sizes=[32,2] mutual-pairs=18
{F} --app admin --include-type    # now: sccs=2 sizes=[3,2] mutual-pairs=3
```
Expected after each step (run the first command after steps 1 and 2, all three at the end):
- after step 1 (C1): runtime `sccs=1 sizes=[7]`
- after step 2 (C2): runtime `sccs=1 sizes=[5]`
- at the end: runtime `sccs=1 sizes=[5] mutual-pairs=3`; include-type `sccs=1 sizes=[5] mutual-pairs=3` (only custom-credentials, deployments, form-destinations, site-backup, source-control are left: stage 04 cuts those); admin `sccs=0 mutual-pairs=0`.
- and this must exit 0:
```
{F} --include-type --assert-no-edge "publish-trust->deployments,project-keys->api-connections,{T18}"
{F} --app admin --include-type --assert-no-edge "publish-content->dashboard,themes->pages,pages->posts"
```
If the "now" numbers differ because stages 01-02b landed first, take your measured numbers as the baseline; the "at the end" numbers must still hold. A different end number means an edge below was missed or a new one was added: `--edges` (add `--include-type`) prints file:line for every edge in a cycle.

## Step 1. C1: publish-trust -> deployments (one line)
`apps/website/src/features/publish-trust/connect.ts:1` imports `isContainedDeployConfigPath` from `"../deployments/index.js"`. That name is only a re-export of `@jini-ai/devops/deploy` (`features/deployments/deploy-config-registry.ts:8-16`). Prove it: `grep -rn "isContainedDeployConfigPath" node_modules/@jini-ai/devops/dist/deploy/*.d.ts`. Then change the specifier to `"@jini-ai/devops/deploy"`. Nothing else.

## Step 2. C2: project-keys -> api-connections
a) `features/project-keys/site-references.ts:4` imports `apiConnectionVaultScope, PLUGIN_STATE_FORMAT` from `../api-connections/vault-stores.js`.
   - Move `API_CONNECTION_VAULT_KIND` (`vault-stores.ts:28`) and `apiConnectionVaultScope` (`vault-stores.ts:61-63`, with its doc comment if any) into `apps/website/src/platform/secrets/vault-api-connection-meta.ts` (it already declares `PLUGIN_STATE_FORMAT`). Add `import type {{ VaultContext }} from "@jini-ai/platform/secrets/credential-sets";` there. Keep the values byte-identical (`ownerKey: "tovu"` included).
   - In `vault-stores.ts`: import both names from `"#src/platform/secrets/vault-api-connection-meta"` (merge into the existing import on line 12) and re-export them on the existing line 13 (`export {{ PLUGIN_STATE_FORMAT, API_CONNECTION_VAULT_KIND, apiConnectionVaultScope }} from ...`), so `plugin-state-bindings.ts` and the tests keep their imports.
   - `site-references.ts:4`: import both names from `"#src/platform/secrets/vault-api-connection-meta"`.
   - Check: `grep -n "^import" apps/website/src/platform/secrets/vault-api-connection-meta.ts` shows no `#src/features` import.
   - Test: `apps/website/src/features/api-connections/__tests__/plugin-state-format.pin.unit.test.ts` (single-file command below).
b) `features/project-keys/shared-oauth-disconnect.ts:4` `import type {{ SharedOAuthOwnerStorage }}` from `../api-connections/shared-owner.js` (declared `shared-owner.ts:79`): apply the TYPE-DOWN recipe (step 4).

## Step 3. C4a: delete the source-control repository-target pass-through
`apps/website/src/features/source-control/repository-target.ts` is a 20-line wrapper: `repositoryTargetError(target, validateTarget)` calls `@jini-ai/devops/source-control` `repositoryTargetError(target, {{ validateTarget }})`. Prove the Jini export: `grep -rn "repositoryTargetError" node_modules/@jini-ai/devops/dist/source-control/*.d.ts`.
- Callers: `features/source-control/commit-site.ts:18`, `features/custom-credentials/write-files-validation.ts:3`, test `features/source-control/__tests__/repository-target.unit.test.ts:3`. Import from `"@jini-ai/devops/source-control"` and rewrite each call `repositoryTargetError(x, v)` -> `repositoryTargetError(x, {{ validateTarget: v }})` (a call with no second argument stays as is).
- The wrapper's `@file` comment explains the order of the checks (host rules first, then the generic one-segment rule). Move it, unchanged except "this file" wording, to sit above the `repositoryTargetError` import in `commit-site.ts`. Update the two comments that name the deleted path (`commit-site.ts:85`, `write-files-validation.ts:16`) to name `@jini-ai/devops/source-control` `repositoryTargetError` instead.
- `write-files-validation.ts:2` imports type `RepositoryTargetValidator` from `../source-control/provider-module.js`. It is declared in Jini (`@jini-ai/devops/source-control`, `contracts.ts:43`). If `provider-module.ts` only re-exports it, import it from `"@jini-ai/devops/source-control"` instead (prove it in the installed `.d.ts` first).
- Delete `repository-target.ts`. Run the moved test file once.
- Expected: no change in the feature numbers (custom-credentials -> source-control still has a runtime edge in `credential-ports.ts:15`; stage 04 cuts it).

## Step 4. TYPE-DOWN: the type-only back edges
Every import below is `import type` (or an inline `import("...").Name` in a type position). For each edge, per imported name, apply the FIRST rule that fits:
- R1 (declared in Jini). Follow `export ... from` lines from the imported file to the declaring file (at most 3 hops). If it ends in `@jini-ai/<pkg>/<sub>`, import the name from that Jini specifier directly (`import type`). Prove the name exists in `node_modules/@jini-ai/<pkg>/dist/<sub>/*.d.ts` with `grep -rn -w` first.
- R2 (whole types-only file). The declaring file has no runtime export (no `export const|function|class|enum`, no `export {{ value }}`) and imports only `@jini-ai/*`, npm, `node:*`, `#src/platform/*` or `#src/contracts/*`: `git mv` it to `apps/website/src/contracts/core/<feature>/<basename>.ts`, fix its relative imports for the new folder, and recreate the old path as ONE line: `export type * from "#src/contracts/core/<feature>/<basename>";` (keeps every other importer working). The `@file` comment moves with the file.
- R3 (mixed file). Move only the named declaration(s) plus every same-file type they reference (transitively), each with its doc comment, to `apps/website/src/contracts/core/<feature>/<declaring-basename>.ts` (create it; start it with a one-line `@file` comment: "Types shared by <feature> and the features below it; moved here so imports point one way."). In the declaring file add `import type {{ ... }} from "#src/contracts/core/<feature>/<basename>";` (only the names it still uses) and `export type {{ ... }} from "#src/contracts/core/<feature>/<basename>";` so its other importers need no change. A referenced type from ANOTHER file of the same feature: apply R1-R3 to it too. A referenced type from another FEATURE, a runtime value (`typeof x`, an enum, a class, a const array used in a type) or more than 600 moved lines from one declaring file: the edge is BLOCKED (report the reason and the line count; leave the file as it was).
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
| publish-content->media | `publish-content/type-registry.ts:4`; `backstop-ports.ts:22` (inline `import("#src/features/media/index").BlobStorePort`) | `AssetBlobRepoPort, BlobStorePort` / `MediaContentTypeStorePort` / `VersionedMediaRepoPort` | first two: `@jini-ai/cms/media` (R1); `media/content-type-store.ts:34`, `media/versioned-media-repo.ts:39` (R3). In `backstop-ports.ts` replace the inline import by a top-level `import type {{ BlobStorePort }} from "@jini-ai/cms/media";` |
| publish-content->navigation | `publish-content/type-registry.ts:5` | `MenuRepoPort, NavLocationBindingRepoPort` | follow `navigation/index.ts` -> `repo.ts:8-11` (expect R1 `@jini-ai/cms/navigation`) |
| publish-content->content-types | `publish-content/type-registry.ts:8` | `ContentTypeListPort, ContentTypeRepoPort, IndexProvisionerPort` | expect R1 `@jini-ai/cms/content-types` |
| publish-content->taxonomy | `publish-content/type-registry.ts:9-21`; `:22` | 11 port names; `EntryTermReadPort, TaxonomyPublishReadPort, TermPublishReadPort` | the 11: R1 `@jini-ai/cms/taxonomy`; the 3: `taxonomy/contracts.ts` (types only, imports only `@jini-ai/cms/taxonomy`: R2) |
| publish-content->entries | `publish-content/type-registry.ts:23`; `:26` | `EntryListPort, EntryRepoPort`; `EntryListExcludingTypesPort, EntryPublishReadPort` | first: R1 `@jini-ai/cms/entries` (follow `entries/index.ts`); second: `entries/contracts.ts:31,51` (has runtime consts: R3) |
| publish-content->theme | `publish-content/type-registry.ts:33` | `DiscoveredTheme` | `theme/catalog.ts:2` re-exports `theme/theme.ts:46` (R3, new file `contracts/core/theme/theme.ts`) |
| publish-content->deployments | `publish-content/peer-transport.ts:11`; `tool-deps.ts:1`; `tool-registrations.ts:3` | `PublishHistoryStore, PublishTrigger`; `PublishHistoryStore`; `PublishHistoryStore` | `deployments/static-publish/publish-history.ts:85,44` (R3) |
| site-inspection->deployments | `features/site-inspection/live-url.ts:5` | `PublishHistoryStore` | as above |
| theme->site-guide | `features/theme/capability-card.ts:2` | `CapabilityCard` | `site-guide/contracts.ts:3` (25 lines; R2 if types only, else R3) |
| vendor-credentials->source-control | `features/vendor-credentials/vault-adapter.ts:4` | `SourceControlCredentialSetRecord` | `source-control/types.ts:23` (R3). It references `SealedSecret` (`../webhooks/index.js`: follow, expect Jini) and `CredentialProjectHalf<R>` (`vendor-credentials/project-scope.ts:19`, references `SecretSealerPort` from `../webhooks/index.js`). Move `CredentialProjectHalf` down too, to `contracts/core/vendor-credentials/project-scope.ts` (R3), so `contracts/core/source-control/types.ts` imports it from contracts/core, never from a feature. If `webhooks/index.js` does not lead to Jini for those two names: BLOCKED. |
| project-keys->api-connections | `features/project-keys/shared-oauth-disconnect.ts:4` | `SharedOAuthOwnerStorage` | `api-connections/shared-owner.ts:79` (R3) |

After this step, `{F} --include-type --edges` must not list any of these importing file:line pairs. The 4 remaining type edges of the 5-feature SCC (`custom-credentials/tool-registrations.ts:9`, `:49`, ...) belong to stage 04: leave them.

## Step 5. Admin: 3 back edges (apps/admin/src)
a) `features/publish-content/hooks/use-publish-section-button.hooks.ts:4` imports `t` from `../../dashboard/dashboard-i18n`. `git mv apps/admin/src/features/dashboard/dashboard-i18n.ts apps/admin/src/lib/dashboard-i18n.ts`, fix its own relative imports, and repoint EVERY importer (`rg -l "dashboard-i18n" apps/admin/src`, tests included).
b) `features/themes/hooks/use-theme-explore.hooks.ts:10` imports `homeFallbackPublishReason` from `../../pages/lib/theme-page-publish-state`. Move that one function with its doc comment (`theme-page-publish-state.ts:~88-106`) to a new `apps/admin/src/features/themes/lib/home-fallback-publish-reason.ts`. Its parameter type `ThemePageSlugCollision` comes from pages, which would recreate the edge: type the parameter structurally with only the member it reads, `homePage: {{ readonly title: string }} | null` (wider, so every caller still compiles). `Translate` stays `import type` from `@jini-ai/ui/panel-kit`. `theme-page-publish-state.ts` imports it from `../../themes/lib/home-fallback-publish-reason` (pages -> themes already exists) and re-exports it (`export {{ homeFallbackPublishReason }} from ...`) so `pages/__tests__/theme-page-publish-state.unit.test.ts` keeps working. `use-theme-explore.hooks.ts:10` imports from `../lib/home-fallback-publish-reason`. Update the two comments that name the old location (`use-theme-explore.hooks.ts:394`, `:432`).
c) `features/pages/page-editor-i18n.ts:13` imports `t` from `../posts/posts-i18n`. `git mv apps/admin/src/features/posts/posts-i18n.ts apps/admin/src/lib/posts-i18n.ts`; repoint every importer (`rg -l "posts-i18n" apps/admin/src`).
Tests: run each admin test file that imports a moved file once (admin single-file command). Lint the changed files.

## Step 6. Jini: 2 module cycles (Jini clone, `{JINI}`)
a) `packages/cms/src/forms/errors.ts:51,53` uses inline `import('./stale-form.js').FormRetryDraft`, and `stale-form.ts` imports `errors.ts`. Move `FormRetryAnswer` and `FormRetryDraft` (`stale-form.ts:7-8`) into `packages/cms/src/forms/types.ts`. `stale-form.ts` imports them from `./types.js` and keeps exporting them (`export type {{ FormRetryAnswer, FormRetryDraft }} from './types.js';`) so the public surface is unchanged; `errors.ts` uses a top-level `import type {{ FormRetryDraft }} from './types.js';` in place of the two inline imports. Check: `grep -n "stale-form" packages/cms/src/forms/errors.ts` prints nothing.
b) `packages/admin/src/comments/react/hooks/QueueSection.hooks.ts:8` imports the component file that imports these hooks. Move the `QueueActionsCell` component (`components/QueueSection.tsx:52-` to its end) to a new `components/QueueActionsCell.tsx`, and `useQueueActionsCell` (`hooks/QueueSection.hooks.ts:23-` to its end) to a new `hooks/QueueActionsCell.hooks.ts`. The original files import from the new ones and re-export the moved names (the package's public exports must not change: `grep -rn "QueueActionsCell\\|useQueueActionsCell" packages/admin/src --include=index.ts` before and after must resolve). Check: neither new file imports `QueueSection`.
Checks: `pnpm --filter @jini-ai/cms exec tsc -p tsconfig.json --noEmit` and the same for `@jini-ai/admin`; run the existing tests of those files one at a time (`ls packages/cms/src/forms/__tests__ packages/admin/src/comments/react/**/__tests__ 2>/dev/null`, pick the ones naming errors/stale-form/QueueSection). Do NOT build or publish Jini; this stage changes no export.

{RULES_TERRA}
## Done check
- The assert commands under "Gate numbers" exit 0 and the three counts match "at the end".
- `npx eslint <every changed Tovu file>`; each changed or moved test file run once.
- `grep -rln "features/" apps/website/src/contracts/core/*/` prints nothing new.

Change summary for the coordinator's commits (Tovu, then Jini): `refactor(tovu): cut feature import cycles, move shared types down (move-to-jini stage 03)` and `refactor(jini): break two module cycles in cms forms and admin comments (move-to-jini stage 03)`.

{REPORT_T}"""

# ---------------------------------------------------------------- stage 04 (Opus)
STAGE04 = BUDGET + f"""
# OPUS job, stage 04: cut the last 3 cycle edges with ports and one module move

EXECUTOR: Opus (not Terra). Why: port inversion through the composition roots, and moving a tool definition between features; deciding what each bound port carries is judgment.
Precondition: stage 03 has landed. Check first: `{F}` prints `sccs=1 sizes=[5]` and `{F} --include-type` prints `sccs=1 sizes=[5] mutual-pairs=3`. Anything else: stop and report.

{REPOS}
Read first: `{D}/PLAN.md` sections 1.1 (rows C3, C4, C5) and 1.3 (port sketches: follow them; deviate only with a one-line reason in the report).

## Edges to cut (evidence: `{F} --include-type --edges`)
- C3 custom-credentials -> deployments: `features/custom-credentials/tool-registrations.ts:7` (value `invalidatePublishCredentialCompatibility` from `../deployments/publish-credentials/index.js`), `:9` (type `DeployTargetRegistry` from `../deployments/contracts.js`). Used at `tool-registrations.ts:427-429` through `CustomCredentialsToolDeps.loadDeployTargets` (`:92`) and `.publishCredentialVerificationCache` (`:95`).
- C4b custom-credentials -> source-control: `features/custom-credentials/credential-ports.ts:15` (`buildSourceControlProviderForApi`, `LoadSourceControlProviders` from `../source-control/provider-registry.js`; `bindSourceControlWritePort` is declared at `credential-ports.ts:68`), `tool-registrations.ts:49` (type from `provider-registry.ts`), `:91` (`loadSourceControlProviders` dep), `:299` (`.list()` of providers), `:363` (`bindSourceControlWritePort(...)`). (`write-files-validation.ts:2-3` were handled in stage 03.)
- C5 source-control -> site-backup (pending owner decision D3, default yes: write it, and say in the report it is pending D3): `features/source-control/commit-site.ts:7-11` (static-copy, static-download-layout, static-download-landing, share-zip, share-policy) and `features/source-control/tool-registrations.ts:4` (static-download-landing).

## Do
1. C3 (PLAN 1.3 `CredentialChangedPort`): declare it in `custom-credentials/credential-ports.ts` (doc comment names deployments as the typical binder). `CustomCredentialsToolDeps` drops `loadDeployTargets` and `publishCredentialVerificationCache`, gains `readonly onCredentialChanged?: CredentialChangedPort`; the handler at `:427-429` calls it with `{{ workspaceId, after }}` exactly where `invalidatePublishCredentialCompatibility` ran (same ordering, same error handling: if the old code swallowed a failure, the port call does too). Bind it in BOTH composition roots that build these deps today: `server/runtime/composition/deps.ts:~2758-2775` and `server/runtime/composition/app.ts:~1663-1679` (both build `loadDeployTargets`/`publishCredentialVerificationCache` now). The binding (a small function in `features/deployments/`, e.g. `custom-credentials-binding.ts`) closes over the registry loader and the verification cache and calls `invalidatePublishCredentialCompatibility`. Tests: the existing custom-credentials tool tests that cover credential rotate/delete invalidation must pass unchanged in meaning; add one test that a missing `onCredentialChanged` is a no-op.
2. C4b (PLAN 1.3 `CustomCredentialsSourceControlPort`): `SourceControlWritePort` already comes from `@jini-ai/core/contracts/credentials`. Move `bindSourceControlWritePort` (`credential-ports.ts:68-`) into `features/source-control/custom-credentials-write-port.ts` (keep its comments); add `listProviders` there (replaces `tool-registrations.ts:299`). `CustomCredentialsToolDeps` drops `loadSourceControlProviders`, gains `readonly sourceControl: CustomCredentialsSourceControlPort` (required). Bind in the same two composition roots. Repoint the tests that built `loadSourceControlProviders` fakes to build the port instead (smallest change).
3. C5 (pending D3): `git mv features/source-control/commit-site.ts features/site-backup/commit-site.ts` (plus its tests in `source-control/__tests__/` that only test it), fix imports (site-backup -> source-control is the allowed direction). Move the `source_control_execute_commit` tool definition from `source-control/tool-registrations.ts` into `site-backup/tool-registrations.ts` with the tool name, schema, description and handler unchanged (the model-facing name must not change). Check every place that registers or lists tools by feature (`rg -n "source_control_execute_commit" apps development`) and keep the tool registered exactly once; if a tool manifest/snapshot test pins which feature owns it, update the pin and say so. `source-control/tool-registrations.ts:4` (static-download-landing) must go too: move whatever uses it with the tool, or report why not.
4. Ratchet: add to the root `package.json` a script `"check:feature-cycles": "node {D}/feature-cycles.mjs --include-type --max-scc 0 --max-pairs 0 && node {D}/feature-cycles.mjs --app admin --include-type --max-scc 0 --max-pairs 0"`, and wire it next to the existing static checks (find them: `rg -n "check-no-linked-jini|hygiene-audit|bug-class" package.json development/scripts`). Do not add it to any pre-push hook that runs heavy suites.

{RULES_OPUS}
## Done check
```
cd {TOVU}
{F} --max-scc 0 --max-pairs 0                     # sccs=0 mutual-pairs=0
{F} --include-type --max-scc 0 --max-pairs 0      # sccs=0 mutual-pairs=0
{F} --app admin --include-type --max-scc 0 --max-pairs 0
npm run check:feature-cycles
```
Plus: each changed test file run once (single-file commands); `npx eslint <changed files>`. No full tsc (the coordinator's cloud batch runs it).

Commit message: `refactor(tovu): invert custom-credentials ports, move commit-site to site-backup (move-to-jini stage 04)` (C5 part pending D3: say so in the body).

{REPORT}"""

# ---------------------------------------------------------------- stages 06-11 (Terra MOVE)
MOVE_SCOPE = {
    "06": ("http-kit, diagnostics, analytics, sidecar, db, search", ""),
    "07": ("integrations, mcp, daemon, agentic, agent-runtime, agent-plugins, plugins", ""),
    "08": ("user-management, devops, platform, desktop-host, core",
           "\n- Rows with pkg `core`: owner decision D2 is open (runtime helpers in `@jini-ai/core` outside `contracts/`). Default: those rows are BLOCKED (\"waits for D2\"); do not move them unless the coordinator has added the line `D2 = allow` at the top of this prompt.\n"),
    "09": ("ui, ui-kit, admin, chat (non-visual only)",
           "\n- NON-VISUAL ONLY: a row whose file has `className`, `style=`, a CSS import or renders markup that sets layout/colour is BLOCKED (\"visual: stage 12\"); UI moves need a visual check in a real browser, which this job cannot do. The pre-check column flags the obvious ones; check the rest yourself.\n- `react` imports are allowed only when the destination folder is under a `react/` folder of the package.\n"),
    "10": ("cms (navigation, taxonomy, comments, redirects, trash, content-duplication, seo)", ""),
    "11": ("cms (media, post, entries, forms, form-destinations, widgets, content-types, plugin-runtime, contracts)", ""),
}


def move_prompt(nn, scope, extra, table, input_tsv):
    return BUDGET_T + f"""
# Terra job, stage {nn}: move Tovu files into Jini ({scope})

READY. Self-contained. Background only: `{D}/PLAN.md` sections 4 and 5.

## Why
These files are generic (the 2026-11-11 survey labelled them MOVE): they belong in a Jini package, and Tovu keeps only the wiring. Jini half first (additive: new files and new exports only, nothing removed or renamed), Tovu half second (import from Jini, delete the copy). Every live Tovu build keeps working against the published Jini 0.7.x because nothing is removed from Jini.

{REPOS}
## Release rule (owner decision D1, default)
No npm publish, no version bump, no `changeset version`, no prerelease. Tovu consumes this Jini clone through `link:jini` (already set up by the coordinator) until one final lockstep 0.8.0 release in stage 16. Your release note is a changeset FILE only (Jini half, step 6).

## Preflight (stop and report if 1 or 2 fails)
1. `test -w {JINI}/packages && git -C {JINI} status --short` (note pre-existing changes; never touch them).
2. Tovu `node_modules` must be the coordinator's APFS copy linked to this Jini clone, never the live tree:
```
cd {TOVU}
test ! -L node_modules && echo "node_modules is a real folder"
python3 -c 'import os;print(os.path.realpath("node_modules/@jini-ai/core"))'   # must print {JINI}/packages/core
```
   If `node_modules` is a symlink, or `@jini-ai/core` resolves into `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini`: do the Jini half only, skip the whole Tovu half, and report "Tovu half skipped: node_modules not linked to the Jini clone (PLAN.md 4.2)". Never fix it yourself.
3. Run the ratchet gate (below) and paste the output.

## Input
`{input_tsv}` (columns: path, loc, action, pkg, subpath, exists_now, feature, label, home). `home` is the survey's text: the destination and the host contract (what the host must supply). Scope: {scope}.{extra}
Pre-check table (computed when this prompt was written; it is a HINT: re-check every row). "export -> entry file" = the `package.json` export key and the Jini source file behind it; the moved file goes in that entry's folder. Tests: `M` = only imports files of this stage (candidate to move to Jini), `S(...)` = stays in Tovu, repointed (reason in brackets). "prod importers" = non-test Tovu files to repoint. "pre-check" = imports or strings that block the move unless a port solves them.

{table}

## Label check (per row, first; mechanical)
Read the file. The row's `home`/`label` text must still describe it: every host contract the text names is still how the file gets that thing, and the file has not grown new Tovu imports or Tovu-specific exports since the survey. If the text no longer fits (the file was split, merged, or now does something the text does not mention), the row is BLOCKED "label stale: <one line>". Do not re-label it yourself.

{READY}
6. Destination: the folder of the row's entry file (table column), e.g. entry `src/sqlite/index.ts` -> `packages/db/src/sqlite/<basename>`. If `home` names a different EXISTING export of the same package, use that one. If `home` asks for a new subpath or a new file name, keep the original basename and use the closest existing export only if the `home` text names it; otherwise BLOCKED "needs new subpath".

{PORTS}
## Jini half (per READY row; group the work by package)
1. Copy the file to `{JINI}/packages/<pkg>/<dest folder>/<basename>` (same name; no `git mv` across repos). Rewrite its imports: the target package's own subpaths -> relative paths inside the package; files of this stage that move with it -> relative paths; host-contract types -> the port declared in the file (Ports). Keep every comment; drop Tovu SPEC/ADR/U/D IDs and the word Tovu from comments by minimal rewording ("the host").
2. Export it from the entry file: add `export * from './<basename>.js';` (or `export {{ a, b }} from` / `export type {{ ... }} from` when the entry uses named lists). If a name collides with an existing export of that entry, BLOCKED "name clash: <name>".
3. Tests. Each `M` test: copy to `<dest folder>/__tests__/<test basename>` in Jini and convert `node:test` to vitest: `import {{ describe, it, test, beforeEach, afterEach, beforeAll, afterAll }} from 'vitest'` (map `before` -> `beforeAll`, `after` -> `afterAll`), keep `node:assert/strict` as is, repoint its import of the subject to the relative Jini path. A test that uses `mock`/`t.mock` from `node:test`, Tovu fixtures or helpers, or files outside this stage stays in Tovu (Tovu half, step 3). If the moved file ends up with no test in Jini, report it as `NO-JINI-TEST` (the package has a 100% coverage gate; the coordinator's cloud run measures it).
4. Per moved test: `cd {JINI} && pnpm --filter @jini-ai/<pkg> exec vitest run <test path relative to the package> --maxWorkers=2`.
5. Per touched package: `pnpm --filter @jini-ai/<pkg> exec tsc -p tsconfig.json --noEmit`, then build it so the linked Tovu sees the new exports: `pnpm --filter @jini-ai/<pkg> run build`. `npx eslint <new Jini files>` from `{JINI}`.
6. Release note: write `{JINI}/.changeset/move-to-jini-stage-{nn}.md`:
```
---
"@jini-ai/<pkg>": minor
---
New exports (moved from a host application, additive, nothing removed): `@jini-ai/<pkg>/<subpath>` `<name>`, `<name>`; ...
```
   One front-matter line per touched package. No host-app names in it.

## Tovu half (only if Preflight 2 passed; per row whose Jini half is DONE)
1. Repoint every importer (table column; re-find with `rg -n -e "<stem>(\\.js)?['\\"]" apps development`, keep hits that resolve to the file): same imported names, specifier `@jini-ai/<pkg>/<subpath>` (or `@jini-ai/<pkg>` for the root export); `import type` stays `import type`. `#src/...` re-export barrels that listed the file: re-export from Jini instead only if other files use the barrel name; otherwise drop the line.
2. Port rows: pass the existing Tovu implementation at each call site (at most 5 call sites, no new composition wiring; otherwise undo the Jini half for that row and mark it BLOCKED).
3. Tests: delete the Tovu copies of tests you moved; repoint `S` tests to the Jini import and run each once (single-file command).
4. Delete the Tovu file. Confirm `rg -n "<path without extension>" apps development package.json` has no hit outside comments (path-loaded uses: vite entries, spawn paths, scripts); a hit means undo the delete and mark BLOCKED.
5. `npx eslint <changed Tovu files>`; ratchet gate after.
6. Put this trailer in the Tovu change summary: `Jini-Base: <git -C {JINI} rev-parse HEAD>` (the Jini commit the coordinator makes from your Jini half; if not committed yet, write `Jini-Base: pending (stage {nn} Jini half)`).

{RATCHET}
{RULES_TERRA}
## Done check
- Every DONE row: the Tovu file is gone, `rg` finds no importer of its old path, the Jini file exists and is exported, the package typechecks and builds.
- Every BLOCKED row: untouched in both repos.
- The ratchet gate still exits 0.

Change summaries for the coordinator's commits: Jini `feat(<pkgs>): add exports moved from the host app (move-to-jini stage {nn})`; Tovu `refactor(tovu): import moved code from Jini (move-to-jini stage {nn})` with the `Jini-Base:` trailer.

{REPORT_T}5. Per DONE row: the Jini path, the export key, tests moved / stayed / NO-JINI-TEST.
"""


# ---------------------------------------------------------------- stages 12-16
PRE_LANDED = "Preconditions (check each; stop and report if one fails):\n"

STAGE12 = BUDGET + f"""
# OPUS job, stage 12: the MOVE rows Terra could not do

EXECUTOR: Opus (UI rows: Opus with Claude in Chrome for the visual check). Why: these rows need a server-contract rewrite, a home decision, a new subpath or a package outside stages 06-11.

{REPOS}
{PRE_LANDED}1. Stage 04 landed: `{F} --include-type --max-scc 0 --max-pairs 0` exits 0.
2. Stages 06-11 landed in both repos (their reports exist; the coordinator lists their BLOCKED rows in `{D}/stage-12.blocked.tsv`, same columns as the stage lists plus `reason`). If that file is missing, do only `stage-12.files.tsv`.
3. The server contract is in THIS Jini clone: `grep -n "ServerMiddleware" {JINI}/packages/core/src/contracts/server.ts` and `grep -rn "readJsonBody\\|withServerMiddleware" {JINI}/packages/http-kit/src --include=*.ts -l` both find it. It is designed and built in another clone: read `/Users/la/Programming/tovu-terra-d2/development/refactor-patterns/server-port.md` (sections 2-3 are the contract; do NOT redesign it). If it is not merged into `{JINI}` yet, do only rows of kinds B-E below and report the Express rows as waiting.
4. Tovu `node_modules` is the APFS copy linked to `{JINI}` (same check as the stage 06 prompt's Preflight 2).

## Input
`{D}/stage-12.files.tsv` (23 rows: Express-bound, no package named, or a package outside 06-11: server, sandbox, commerce, cookie-consent, capability-providers) plus `stage-12.blocked.tsv`.

## Per row, decide the kind, then act
- A. Express-bound: rewrite the handler to the `{{ app: Server }}` contract exactly as `server-port.md` section 2 says (web Request -> Response, `ServerMiddleware` + `withServerMiddleware`, `readJsonBody`, errors by throwing, cookies via `headers.append`). The Express adapter stays in Tovu. Behaviour pins first: before rewriting, make sure a Tovu test pins status, body and headers of each route (write it if missing, run it green on the old code), then it must stay green on the new code.
- B. No package named: pick the home (an existing package and subpath; a new package is an owner decision: report it instead). One line of reasoning per row in the report.
- C. Package outside 06-11: if the package exists in `{JINI}/packages`, move as in stages 06-11; if not (e.g. `server`, `commerce`, `cookie-consent`, `capability-providers`, `sandbox`), check the owner rules (no vendor code in core; commerce is future agent plugins; a new package is an owner decision) and report a recommendation instead of creating it.
- D. Needs a new subpath: add the export key to the package's `package.json` `exports` (dist + types, same shape as its neighbours) and its entry file; this is additive. Name it after what it does, not after the host.
- E. Visual (from stage 09): move it, then LOOK at the admin screen that renders it in the real running admin via Claude in Chrome (never a headless screenshot); the coordinator says which local site to use.
- Mechanics for every move (destination, tests to `__tests__` with node:test -> vitest, typecheck + build the package, changeset file, Tovu repoint and delete, `Jini-Base:` trailer): read and follow `{D}/stage-06.terra-prompt.md` sections "Label check", "READY check", "Ports", "Jini half", "Tovu half".

{RATCHET}
{RULES_OPUS}
Commit messages: Jini `feat(<pkgs>): server-contract and remaining moves from the host app (move-to-jini stage 12)`; Tovu `refactor(tovu): import stage-12 moves from Jini (move-to-jini stage 12)` + `Jini-Base:` trailer.

{REPORT}5. Per row: kind (A-E), decision in one line, DONE/BLOCKED. Owner decisions you need, as a short list.
"""

STAGE13 = BUDGET + f"""
# OPUS job, stage 13: check the MOVE-AFTER preconditions, hand READY rows to Terra

EXECUTOR: Opus first (judgment: is the precondition met?), then a Terra run per batch using the generated MOVE prompt.

{REPOS}
{PRE_LANDED}1. Stages 06-12 landed (each row's precondition usually names a file that one of them moved). 2. Ratchet gate exits 0 (below).

## Input
`{D}/stage-13.files.tsv` (271 rows, 36.5k lines). The `label` column is `MOVE-AFTER(<precondition>)`, the `home` column names the destination and host contract; 108 rows name no package.

## Do (no code edits in this job)
1. Per row, classify the precondition and check it against the CURRENT trees:
   - "after <file> moves" / "after <file>": met when that Tovu file no longer exists and its code is exported from Jini (`rg` the names in `{JINI}/packages/*/src`).
   - "after Jini hardening/parity of X": met only when the Jini symbol now has the behaviour the survey says it lacked (read the code; cite file:line).
   - "after an owner decision": not met; list the decision.
   - unclear: not met; one line why.
2. For rows that are met, fill `pkg` and `subpath` (existing export keys only; a new subpath = stage-12 kind D, list it separately) and write them to `{D}/stage-13.ready.tsv` (same columns as the stage lists). Rows not met go to `{D}/stage-13.waiting.tsv` with a `reason` column.
3. Generate the Terra prompt: `cd {TOVU} && python3 {D}/write-prompts.py --move-stage 13 --input {D}/stage-13.ready.tsv`, which writes `{D}/stage-13.terra-prompt.md` with the same template as stages 06-11 and a fresh pre-check table. If the READY set is over ~40 files, split it into batches by package (`stage-13a.ready.tsv`, ...; `--move-stage 13a`).
4. The coordinator runs Terra on each generated prompt.

Rules: read-only in both repos except the files you write under `{D}/`. Run no tests. Commit with `git add -- <paths> && git commit -F msg -- <paths>`; message `docs(refactor): stage 13 READY/waiting split (move-to-jini)`.

{RATCHET}
{REPORT}"""

STAGE14 = BUDGET + f"""
# FABLE/OPUS job, stage 14: harden the Jini survivor, then dedupe

EXECUTOR: Fable for the rows the coordinator marks HARD (auth, sessions, permissions, money, or 3+ listed behaviour differences); Opus for the rest. Split by the coordinator into batches of at most ~20 rows.

{REPOS}
{PRE_LANDED}1. Stage 04 landed (ratchet below exits 0). 2. Tovu `node_modules` is linked to `{JINI}` (stage 06 Preflight 2). 3. No other job is editing the same Jini package (ask the coordinator).

## Input
`{D}/stage-14.files.tsv` (100 rows, 15.8k lines): DEDUPE-AFTER-HARDENING (33), DEDUPE-UNVERIFIED (17), DELETE-AFTER-PARITY (50). `home` lists the Jini survivor and the behaviour differences the survey found (e.g. `useAdminShellSession` vs Tovu `useAdminSession`: bootstrap and permissions).

## Per row
1. DEDUPE-UNVERIFIED: first prove it is a duplicate (read both; same inputs, outputs, errors, side effects). Not a duplicate: reclassify (MIXED / STAY) in the report and stop on that row.
2. List each behaviour Tovu relies on that the Jini survivor lacks (cite Tovu file:line and Jini file:line).
3. For each: write the failing Jini test first and run it RED; then harden Jini ADDITIVELY (new optional parameter in the `optional` object, new port, or a fix that cannot change existing callers' results); run it GREEN; mutate the fix once to prove the test catches it, restore. A hardening that would change an existing Jini caller's behaviour: stop on that row, report it (owner decision).
4. Typecheck + build the Jini package, add `.changeset/move-to-jini-stage-14.md` lines (`minor`, new optional parameters named).
5. Tovu: as stage 02 (`{D}/stage-02.terra-prompt.md` "What to do per row" steps 4-5): repoint, delete the Tovu copy, keep comments.
6. DELETE-AFTER-PARITY: parity proven by the tests from step 3 (or Jini already passing equivalent tests: cite them), then delete as stage 01 does.

{RATCHET}
{RULES_OPUS}
Commit messages: Jini `fix(<pkgs>): parity for host duplicates (move-to-jini stage 14)`; Tovu `refactor(tovu): drop duplicates now covered by Jini (move-to-jini stage 14)` + `Jini-Base:` trailer.

{REPORT}5. Per row: differences found, tests added (path), Jini change in one line, or the owner decision needed.
"""

STAGE15 = BUDGET + f"""
# OPUS -> TERRA job, stage 15: split the MIXED files (function-level)

EXECUTOR: Opus writes a split spec per package batch; Terra applies each spec with the stage 06-11 mechanics. Largest stage (474 files, 145.3k lines): run it in batches, never all at once.

{REPOS}
{PRE_LANDED}1. Stages 04, 06-14 landed (the ratchet below exits 0; their reports exist). 2. Tovu `node_modules` linked to `{JINI}`. 3. Owner decision D2 answered for the 40 rows naming `core` (default: send them to the nearest domain package instead).

## Input
`{D}/stage-15.files.tsv`. Batch order = fewest host contracts first, by package: http-kit, diagnostics, agent-runtime, agentic, mcp, desktop-host, plugins, integrations, db, user-management, daemon, agent-plugins, devops, chat, platform, admin, ui, cms, core (D2), then the 96 rows with no package (home decision per row, like stage 12 kind B). At most ~40 files per batch.

## Opus: the split spec (per batch), no code edits
Write `{D}/stage-15/<batch>.split.tsv` with one row per symbol that moves: `path`, `symbol`, `kind` (function/type/const/class), `jini_pkg`, `export_key` (existing only; new = list separately as stage-12 kind D), `port` (name + members, `(required, optional = {{}})` shape, declared by the consumer, doc comment naming the binder), `stays` (the Tovu part that stays and calls the Jini symbol), `tests` (Tovu tests that cover the symbol). Rules: a symbol moves only with everything it needs (same-file helpers, types); never move a symbol that reads Tovu config, routes, env vars or feature modules unless that dependency becomes a port; keep the Tovu file as the product part plus the port binding. Then generate a Terra prompt for the batch: copy `{D}/stage-06.terra-prompt.md`, replace its Input/table section with the spec (symbol-level), and keep every other section unchanged. Commit the spec and prompt (explicit paths).

## Terra: apply the spec
Same as stages 06-11, at symbol level: move the listed symbols (and their doc comments) into the Jini file at the export's folder (one Jini file per Tovu file, same basename unless it clashes), export them, declare the ports, then in Tovu import the symbols from Jini and bind the ports at the call sites the spec names. The ratchet gate must stay at 0.

{RATCHET}
{RULES_OPUS}
{REPORT}"""

STAGE16 = BUDGET_T + f"""
# Terra job, stage 16: final gates and the one coordinated Jini 0.8.0 version bump (no publish)

READY when the coordinator says the owner said "merge". Self-contained. Background only: `{D}/PLAN.md` section 4.

## Why
All moves landed while Tovu used the linked Jini clone. This job prepares the single lockstep release: version bump in Jini (0.7.x -> 0.8.0 via the changeset files the stages wrote) and the matching dependency ranges in Tovu. Publishing and relinking are the coordinator's steps after this job (owner decision D1: one final release, no prereleases).

{REPOS}
## Preconditions (stop and report if one fails)
1. `ls {JINI}/.changeset/move-to-jini-stage-*.md` lists the stage release notes.
2. Ratchet gate (below) exits 0 for website and admin.
3. `git -C {JINI} status --short` and `git -C {TOVU} status --short` show nothing staged or modified (untracked files are fine).

## Do
1. Removals (the only breaking part of 0.8.0): only the exports listed in `{D}/stage-16.remove-exports.tsv` (written by the coordinator: package, export key, symbol, proof that no Tovu or Jini code imports it). If the file is missing, remove nothing. For each row: `rg -n -w "<symbol>" {JINI}/packages /Users/la/Programming/tovu-terra-d1/apps` must show only the declaration; then delete the export line (and the declaration if nothing else uses it). Add a `major`-free note to `.changeset/move-to-jini-stage-16.md` (`"@jini-ai/<pkg>": minor`, "Removed `<symbol>` from `<export key>`; it only served a host shim.").
2. Jini version: `cd {JINI} && pnpm changeset version`. Expect every `@jini-ai/*` package at `0.8.0` (the changeset config is `fixed: [["@jini-ai/*"]]`). Check: `grep -h '"version"' packages/*/package.json | sort | uniq -c` shows one line, `0.8.0`. Anything else: stop and report (do not hand-edit versions).
3. Per touched package: `pnpm --filter @jini-ai/<pkg> exec tsc -p tsconfig.json --noEmit` (packages listed in the changesets only).
4. Tovu ranges: in the root `package.json` and every `apps/*/package.json`, change each `"@jini-ai/<pkg>": "^0.7.0"` (or `^0.7.1`) to `"^0.8.0"`. Do not touch the lockfile and do not install.
5. Do NOT run `npm publish`, `pnpm publish`, `changeset publish`, `npm run unlink:jini`, `npm install` or any tag/push. Those are the coordinator's steps, in this order: publish 0.8.0 from the Jini root, `npm run unlink:jini`, install, published-package typecheck (Tovu's release gate), cloud suites.

{RATCHET}
{RULES_TERRA}
Change summaries for the coordinator's commits: Jini `chore(release): version packages 0.8.0 (move-to-jini)`; Tovu `chore(deps): @jini-ai/* ^0.8.0 (move-to-jini stage 16)`.

{REPORT_T}5. The version check output and the list of `package.json` files changed.
"""


def main():
    args = sys.argv[1:]
    index = MT.importers_index()
    if "--move-stage" in args:
        nn = args[args.index("--move-stage") + 1]
        tsv = args[args.index("--input") + 1]
        write(f"stage-{nn}.terra-prompt.md", move_prompt(nn, "see the pkg column", "", MT.table_from(tsv, nn, index), tsv))
        return
    write("stage-03.terra-prompt.md", STAGE03)
    write("stage-04.opus-prompt.md", STAGE04)
    for nn, (scope, extra) in MOVE_SCOPE.items():
        tsv = f"{D}/stage-{nn}.files.tsv"
        write(f"stage-{nn}.terra-prompt.md", move_prompt(nn, scope, extra, MT.table_from(tsv, nn, index), tsv))
    write("stage-12.opus-prompt.md", STAGE12)
    write("stage-13.opus-prompt.md", STAGE13)
    write("stage-14.opus-prompt.md", STAGE14)
    write("stage-15.opus-prompt.md", STAGE15)
    write("stage-16.terra-prompt.md", STAGE16)


if __name__ == "__main__":
    main()
