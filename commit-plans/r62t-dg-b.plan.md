Six Tovu sheets are ready for source and test edits. The `RouteDeps` gate has a separate sheet that needs a baseline from the combined tree. I selected site search for the composition pilot. Its request and worker already share a narrow runtime, but the two root assembly functions exceed the owner’s 50-line limit. The pilot needs a prerequisite split before dispatch.

I inspected Tovu `8d1a4c2742` and used Git to read the successor refs from `/Users/la/Programming/Tovu` because the dispatch clone lacks those refs. Jini evidence comes from Git objects at merge-8 `3ad0c5671` and merge-9 `fb41117be`. No files changed and no checks ran.

## Disposition

| ID | Disposition | Reason and evidence |
|---|---|---|
| DG2-01 · Tovu public entries and direction | READY-FOR-CODEX | `tv-c7b` fixed the two stale theme entry groups. The boundary report still identifies five callers of two existing theme leaves, one SEO caller, and one CLI caller of the site-directory errors leaf. |
| DG2-02 · Tovu emitted runtime graph | READY-FOR-CODEX | `check-architecture.ts:369,420,926` builds both graphs from a pre-compilation cruise. Jini merge-9 demonstrates the emitted-graph settings in `scripts/runtime-cycles.depcruise.mjs:15–31`. |
| DG2-03 · Credentials → source control | READY-FOR-CODEX | `credential-ports.ts:14` imports two unused names. The import is a reported rank error and an unbaselined cross-feature edge. |
| DG2-04 · Backup plan → source control | READY-FOR-CODEX | `plan-content.ts:3` needs a type that Jini already exports from `@jini-ai/devops/source-control` on both named refs. |
| DG2-05 · Media access evidence | READY-FOR-CODEX | One dependency-free cache serves multiple read and write owners. Moving the existing file clears four boundary errors and three unbaselined cross-feature edges. |
| DG2-06 · Theme barrels on public reads | READY-FOR-CODEX | Seven verified value imports reach the theme barrel through public page or render paths. Each has an existing implementation leaf. |
| DG2-07 · Architecture baseline | OPUS-CLOUD | Reconcile the exact cycle and edge rows from the combined emitted graph. Combine-7 already reported three retired cycle pairs, but its graph used the old extraction method. |
| DG2-08 · Theme preview and entry-list repairs | RETIRE | `tv-c7b` `a672fdc35e` declares `preview-policy` and `entry-list-markup` and repoints preview refresh to `theme-roster-ports`. |
| DG2-09 · Jini boundary and cycle gate | RETIRE | Merge-9 `scripts/guard.ts:71–94`, `check-package-layers.ts:181–199` and `lib/injection-gate.ts:26–49` already enforce package direction through the existing baseline and approved exceptions. The emitted-cycle gate is already in `guard`. |
| DG2-10 · Residual boundary and worker graph | OPUS-CLOUD | The remaining historical edges and worker failures need a fresh trace on the combined, packed Jini artifact. Combine-7’s worker report includes a linked `jsdom → canvas` resolution failure. |
| DG1-01 · Site-search pilot | NEEDS-DECISION | **May a prerequisite sheet split the existing root assembly functions at their current phase boundaries?** Recommend yes, with a verbatim split and startup-order proof. `composeSiteRouteDeps` is 83 physical lines, the memory `createRouteDeps` is 63, and production `wireFormsAndSearch` is 73. |
| DG1-02 · `RouteDeps` import gate | READY-FOR-CODEX after baseline handoff | `check:boundaries` already runs `check-feature-ranks.mjs`. The gate can reject new imports of the symbol while distinguishing the other types exported by `server/routes/types.ts`. |
| DG1-03 · Remaining features | RETIRE from this dispatch | The ordered inventory below is for later sheets, as requested. |

`W` means `apps/website/src`. Line anchors are merge-7 unless a successor is named. An import shown as **retained** already uses the approved leaf, so only the gate declaration changes. The sheets use existing package exports or Tovu’s existing `#src/*` mapping.

## Codex job brief

Copy this block into each dispatched job. It applies to every sheet below.

> **OWNER RULES (HARD)**
>
> Behaviour identical; API args (required, optional = {}) for NEW functions only; no re-export shells; no new deps; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines and complexity <= 10 (HARD). A file going over 500 lines is NOT a stop reason (owner correction 11-20: note it in COMMIT-PLAN.md and continue). STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or the function/complexity limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters; no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root. Hooks are injected as props. No vendor code in Jini domain packages (vendors live in provider packages); no specific server framework in Jini domain code (`{ app: Server }` style). Anything needing a lockfile change, a new npm dependency or a new Jini package = OPUS-CLOUD.
>
> **NO OVER-ENGINEERING. Read before each edit.** Do only the named edits. Add only the named declarations and test cases. Preserve statements, order, names, and why-comments in moves. Preserve every existing `_optional = {}` and `_options = {}` pad. Add no pads, incidental guards, fallbacks, retries, catches, configuration, unused exports, or extra test scaffolding. Add comments only where the sheet names a one-line note. Re-read the diff, delete extras, and record deletions in root `COMMIT-PLAN.md`. Combine runs tests and the named mutations.

### DG2-01 · Declare existing public entries and pin dependency direction

**Tovu · after `codex/tv-c7b` and `fix/cloud-bugs-1120` · 1.3k tokens.** Sole owner of `.dependency-cruiser.mjs` in this batch.

**Tests first.** Add one case in `development/scripts/__tests__/dependency-cruiser.test.ts`, beside `:10`, using its scratch-tree pattern. Copy the actual rank table into the scratch config’s expected path. Exercise an external production caller importing one declared theme leaf and one private theme file, plus a lower-ranked feature importing a public entry of a strictly higher-ranked feature. Assert the private edge and upward value edge produce their respective `no-deep-imports:features/theme` and `feature-rank:<n>` errors. Inspect JSON violations and the process signal. Removing the leaf declaration makes the approved case red. Suppressing either rule makes its rejection assertion red.

**Source.** In `.dependency-cruiser.mjs`, `PUBLIC_ENTRIES:674` on `tv-c7b`, add the entries below. Keep the existing rule scope at `noDeepImportRules:735` and the rank direction at `FEATURE_RANK_RULES:861`. The policy is that cross-feature callers use declared entries, runtime value imports go toward lower ranks, and the architecture ratchet also counts type edges. `check:architecture` owns emitted module cycles after DG2-02. `worker-import-graph.test.ts` owns transitive restrictions for public reads and render workers.

| Declared entry | Verified caller and exact retained import |
|---|---|
| `features/theme/theme-page-eligibility` | `W/server/inbound/public-http/routes/site/pages/handlers/marketing.ts:6` — `import { isStandaloneThemePage } from "#src/features/theme/theme-page-eligibility";` |
| `features/theme/visitor-publication` | `W/server/inbound/public-http/middleware/published-webmcp.ts:1` — `import { publishVisitorPage } from '#src/features/theme/visitor-publication';` |
| Same | `W/assistant/site/visitor-confirmation-gate.ts:1`, `visitor-frontend-control.ts:15`, `visitor-page-tools.ts:9` — `import { readVisitorPagePublication } from '#src/features/theme/visitor-publication';` |
| `features/seo/page-head-contributor` | `W/server/inbound/public-http/routes/site/pages/extra-head.ts:1` — `import { createSeoPageHeadHook } from "#src/features/seo/page-head-contributor";` |
| `platform/site-dir/errors` | `W/cli/commands/stdin-input.ts:2` on `fix/cloud-bugs-1120` — `import { ValidationError } from "../../platform/site-dir/errors.js";` |

Also declare the five existing theme entries needed by DG2-06: `static-render-content`, `static-render-menus`, `static-render-previews`, `static-template-choice`, and `static-template-resolution`.

**Other importers.** No repoints in this sheet. The direct test imports are theme `__tests__/theme-page-publish.test.ts:8` and `__tests__/visitor-handles.unit.test.ts:5`, SEO `__tests__/cover-image-head.test.ts:9`, assistant site `__tests__/visitor-frontend-control.unit.test.ts:7` and `__tests__/visitor-page-policy.unit.test.ts:5`, server `__tests__/site-assistant-routes.test.ts:1` and `__tests__/site-chat-stream.golden.test.ts:17`, and CLI `__tests__/stdin-input.unit.test.ts:6` after `tv-c7a`. The theme barrel’s existing eligibility export and its internal readers stay in place.

**Proof and STOP.** Combine also runs the existing published-but-unlisted theme page case, `published-webmcp.test.ts:7`, `cover-image-head.test.ts:49`, and the flag-specific stdin cap case at `stdin-input.unit.test.ts:9`. Stop if an entry has acquired a transitive write or tool-registry dependency on the successor tree. No debt, manifest, or package API rows. Chrome owes a published theme-page and visitor-tool HTML check with DG2-06.

### DG2-02 · Measure emitted runtime edges

**Tovu · merge-7 after DG2-01 · 1.2k tokens.**

**Tests first.** Extend the existing fixture table in `development/scripts/__tests__/check-architecture.test.ts:10–35` with an inline named `type` import under `verbatimModuleSyntax: true`. Set that flag only for the new fixture, whose import emits `import {}`. Expect one runtime back-edge and a two-module SCC. The existing statement-level `import type` fixture continues to expect zero runtime edges and one all-import back-edge. Reusing the pre-compilation cruise for runtime or applying the old type-tag filter to emitted imports must fail the new case. Keep the existing new cross-feature edge rejection.

**Source.** In `development/scripts/check-architecture.ts:369`, give private `cruise` the named input `{ runtimeOnly: boolean }`. Supply `--ts-pre-compilation-deps` for the all-import invocation. Omit that option for the emitted invocation under `--no-config` and the existing `--ts-config tsconfig.json`. At `measureFileGraphs:926`, feed each graph from its corresponding cruise. At `buildFileGraph:420`, remove the private `opts` parameter and the `isTypeOnlyDependency` filter. Delete `isTypeOnlyDependency:350` and the now-unused `dependencyTypes` field from `CruiseModule:336`. Replace the obsolete one-cruise note with one line explaining that runtime metrics use emitted imports. Preserve the graph scope and existing ratchet comparisons.

**Importers, debt, STOP.** Only the two calls in `measureFileGraphs` use `cruise`. No import, export, package API, manifest, or baseline edits. If the installed cruiser fails the emitted-import witness, stop before changing the baseline. Combine also plants a feature-to-composition back-edge and requires the existing hard back-edge check to reject it. The source `no-circular` warning remains a diagnostic. A file-level runtime-cycle ledger is separate partial work below.

### DG2-03 · Delete the unused source-control import

**Tovu · merge-7 · 0.4k tokens.**

**Tests first.** Use the existing request forwarding and verify/probe cases at `W/features/custom-credentials/__tests__/extract-s8-c2p1-credential-ports.test.ts:104,123`. The boundary mutation restores the exact deleted import and must restore the rank error and `NEW cross-feature edge`.

**Source.** Delete this entire unused line at `W/features/custom-credentials/credential-ports.ts:14`.

```ts
import { buildSourceControlProviderForApi, type LoadSourceControlProviders } from "../source-control/provider-registry.js";
```

The exact replacement is deletion. Both names occur only on that import in this file. `bindCredentialedRequestPort:48` is unchanged, including its caller imports. There is no baseline row for this edge. The existing credentials/source-control cycle pair has other call sites and remains for DG2-07 to evaluate. Stop if either deleted binding gains a use after branch refresh. No package, UI, or Electron look.

### DG2-04 · Use Jini’s backup repository state

**Tovu · after `codex/tv-c7a` and `codex/tv-sharezip` · 0.7k tokens.** Producer is the combined Jini merge-9 artifact after `codex/jx-engaps`.

**Tests first.** Use the existing fake-provider plan/push round trip in `W/features/site-backup/__tests__/integration/archive-round-trip.integration.test.ts:106` after `tv-sharezip`. Restore the Tovu cross-feature type import as the architecture mutation and require the exact `plan-content.ts → provider-module.ts` edge to reappear. The source change erases at runtime, so the mutation belongs at the graph gate.

**Source and importers.** In `W/features/site-backup/plan-content.ts:3` after `tv-sharezip`, replace the local type import with the line below. In `W/features/source-control/provider-module.ts:90` after `tv-c7a`, delete the identical local interface and add the same import for `InspectBackupRepositoryResult:100`. These are the only direct users of the type. The round-trip test’s import of `SiteBackupPlanContent` at `:15` stays in place.

```ts
import type { BackupRepositoryState } from "@jini-ai/devops/source-control";
```

Jini’s declaration is `packages/devops/src/source-control/contracts.ts:17`, exported by `entry.ts:1` and `package.json:57`. No export or manifest edit. No architecture baseline row exists for the removed edge. Stop and route to OPUS-CLOUD if the combined artifact needs a lockfile or manifest change to expose the type. No UI look.

### DG2-05 · Move the shared media-access cache

**Tovu · merge-7 · 1.2k tokens.**

**Tests first.** Use the existing SQLite entry successful-save and transactional invalidation cases in `W/features/entries/__tests__/repo.characterization.test.ts:35,57`, the memory successful-save case in `__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts:35`, and the post trash hide/restore integration at `W/features/trash/__tests__/post-trash-media-evidence.integration.test.ts:19`. In combine, remove the existing SQLite settlement callback, remove the memory test binding callback, and remove the production trash transaction’s invalidation in separate mutations. Each must fail its corresponding invalidation assertion. The existing media-rendition worker graph case is the runtime dependency control.

**Source.** Move `W/features/media/access-evidence.ts:1–38` verbatim to `W/platform/media-access-evidence.ts`. Keep both module-scope `WeakMap`s, both functions, all types and comments together. The new direct entry is `#src/platform/media-access-evidence`. The cache stores Tovu’s access metadata and is shared by post, entry and public media owners.

| Importers | Exact replacement |
|---|---|
| `W/features/entries/repo.sqlite.ts:3` and `__tests__/support/trash-aware-entry-repo.ts:3`; `W/features/post/repo.ts:1` and `repo.memory.ts:1`; `W/server/runtime/composition/memory-deps/slices/repos.ts:10` and `site-deps/trash-service.ts:8` | `import { invalidateMediaAccessEvidence } from "#src/platform/media-access-evidence";` |
| `W/features/entries/__tests__/repo.characterization.test.ts:6` and `__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts:5`; `W/features/trash/__tests__/post-trash-media-evidence.integration.test.ts:12` | `import { getMediaAccessEvidenceCache } from "#src/platform/media-access-evidence";` |
| `W/server/inbound/public-http/routes/site/media-rendition.ts:1` | `import { getMediaAccessEvidenceCache, type AssetReferenceScan, type AssetReferenceIndex } from "#src/platform/media-access-evidence";` |

**Debt and STOP.** The three reported post/entry cross-feature edges are already absent from the committed baseline. No package, manifest or injection-debt rows. Stop if a second copy or forwarding export would be needed. No Chrome or Electron look beyond the combined public-read check.

### DG2-06 · Repoint theme imports on public render paths

**Tovu · after `codex/tv-c7b` and DG2-01 · 1.3k tokens.**

**Tests first.** Use `W/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts:139–167,241–264`. For the worker cases, restore the barrel import in `render/page-body.ts`. For the public-read cases, restore it in the virtual-page handler. The respective report must show the theme barrel again. Also mutate the narrow `static-render-content.ts` leaf to transitively load the theme barrel and require the graph to expose it. When other failures are present, compare the named module or offending edge in the existing assertion output. Combine owes the final full pass.

**Source.** Replace only the import lines below. The implementations already live in the named leaves. Keep the feature barrel for its other callers.

| Path under `W/server/inbound/public-http/` | Exact new import |
|---|---|
| `http/site/render/components/entry-lists.ts:5` | `import { renderCoverImageTag } from "#src/features/theme/static-render-content";` |
| `http/site/render/page-body.ts:4` | `import { postAuthorForContentHeader } from "#src/features/theme/static-render-content";` |
| `routes/site/pages/handlers/post.ts:6` | `import { resolveTemplateBranchChoice, isBarePageChoice } from "#src/features/theme/static-template-choice";` |
| `routes/site/pages/handlers/virtual-page.ts:5` | `import { resolveTemplateBranchChoice } from "#src/features/theme/static-template-choice";` |
| `routes/site/pages/render-context/static-menus.ts:2` | `import { scanMenuEmbedIds, type StaticMenuItem, type StaticMenuContent } from "#src/features/theme/static-render-menus";` |
| `routes/site/pages/render-context/post-previews.ts:5` | `import { postPreviewsBatchSize, isPagedPostPreviewsMarker, type StaticPostPreview, type StaticListingBatch, type StaticPostPreviewsPage } from "#src/features/theme/static-render-previews";` and `import type { StaticFeaturedImage } from "#src/features/theme/static-render-content";` |
| `routes/site/pages/template-render.ts:10` | `import { injectCurrentEntityContentId, injectPageTitle } from "#src/features/theme/static-render-content";` and `import { resolveTemplate } from "#src/features/theme/static-template-resolution";` |

No declarations move. These are the seven repoints, and direct tests of the helpers keep their existing imports. No cross-feature baseline, package API, manifest or injection-debt rows. Stop if a destination leaf loads the barrel through another file. Chrome owes a templated public page with a menu and entry list, a member page, and the storefront render. No Electron look.

### DG1-02 · Ratchet imports of `RouteDeps` below composition

**Tovu · after DG2-01 and the combined baseline handoff · 2.3k tokens.** This sheet owns `development/scripts/check-feature-ranks.mjs` and a separate `development/boundaries/route-deps-importers.json`. It does not require the pilot to land first.

**Tests first.** In `development/scripts/__tests__/check-feature-ranks.test.ts`, add one CLI fixture using the normal source path and the new baseline. The allowed fixture has one existing type import from `server/routes/types`, a composition file importing the same type, and a route importing a different named type from that file. Introduce a second `RouteDeps` import in the already-listed route using an alias. Assert failure naming that route. In the same fixture, replace the extra declaration with an inline `import("…").RouteDeps` and require the same failure. Mutate the excess-import check to compare file membership only. Both additions must escape that mutation and thereby fail the test. Update the existing scratch fixture at `:22–29` to provide an empty baseline.

**Source.** In `development/scripts/check-feature-ranks.mjs`, add `import ts from "typescript";` using the installed dependency. Name the new functions `collectRouteDepsImports`, `routeDepsImportCount`, and `isRouteDepsModule`. Use the existing TypeScript parser to count references to this particular aggregate, including aliased named imports, named re-exports, and import-type queries. Count whole-module namespace access and wildcard re-exports from that entry as access to the aggregate. Resolve the existing `#src/server/routes/types` and relative `types` forms to `W/server/routes/types.ts`. A different named type from that entry contributes zero. Scope to production TS sources below `W`, excluding the existing test conventions and exactly `W/server/runtime/composition/**`.

At `main:59–71`, read the committed baseline and combine introduction diagnostics with the existing problems before the current exit decision. Use repo-relative path → count for the table. Each count is a ceiling for that exact file. Remove or reduce a row when a migration retires an import. The existing `check:boundaries` package command at `package.json:59` already runs this script. Its invocation stays the same. `main` is the only in-repo caller of the new collector. There is no package export.

**Baseline handoff and STOP.** The combine owner captures the sorted table with `collectRouteDepsImports` against the unmodified combined source, before any pilot or import-gate mutations. Supply the table to this sheet for the named JSON file. Stop if the combined input is missing or a production import form cannot be attributed to the aggregate entry. A textual count of `RouteDeps` would include comments and omit attribution. No injection-debt, API, or manifest rows. No Chrome or Electron look.

## Composition pilot and later order

**DG1-01 · Site search.** This is the smallest route-and-worker candidate I verified. The public route already uses `SiteSearchRouteDeps` at `W/server/inbound/public-http/routes/site/search.ts:35`. The production runtime is built once at `composition/site-deps/after-assembly-forms-search.ts:114`, the memory root deliberately has no search provider, and `composition/serving-app.ts:120` starts the existing maintenance worker. Webhooks has a good narrow starting contract as well, but a first slice there would also carry five admin routes, the fan-out subscriber, the tools, and a site-key reader.

After the prerequisite split, the pilot should name `createSiteSearchFeature`, `SiteSearchFeatureDeps` and a single `SiteSearchFeature` module. Construct it once from each root, preserving the production runtime binding and the memory root’s disabled behavior. Pass the same module to `registerSiteSearchRoute` in `http-app/mount-admin-data.ts:49`, the subscriber in `site-event-subscriptions.ts:76`, the worker in `serving-app.ts:120`, and the tool consumer in `site-search-tools.ts:85`. Remove the raw `siteSearch` member from `server/routes/types.ts:1120`. Keep the module on the composition return contract. The request registrar receives the module directly. The worker and tools can read its existing runtime internally. Adding another search route then needs no new port wiring at the root.

The proof belongs in the existing `site-search-wiring.integration.test.ts:36` and `create-app-lifecycle.pin.test.ts:35–77`. Send `GET /api/search?q=hello` through both composed apps and assert the existing private `503`/`not_configured` contract. Keep the production assertion that the same runtime records the boot target and supplies the four tools, plus the existing cookie-audience route test. Omitting production module binding must fail the runtime assertion. For startup order, reuse `RecordingBus` and the file’s module-mock pattern to observe `startOutboxDrainer` **synchronously** and assert subscribers are attached when it is called. Moving the starter before `createApp` must turn the test red. Observing the first timer tick alone would miss that mutation. Preserve one store and bus, the existing route registration positions, readiness waits, and worker-stop/store-close order.

Tentative order for later feature sheets. Paths are relative to `W`. Estimates are file counts, including tests.

| Order | Feature | Candidate files | Est. |
|---|---|---|---|
| 1 | Redirects | `server/inbound/admin-http/routes/redirects`, `composition/site-deps/redirects.ts`, page dispatch and redirect-hit subscriber | 6–9 |
| 2 | Public content reads | `server/inbound/public-http/routes/site/pages`, `http/site/render`, `composition/http-app/mount-public-site.ts` | 9–14 |
| 3 | Content types and entries | `admin-http/routes/{content-types,entries}`, `composition/modules/content-types.ts`, `http-app/mount-admin-data.ts` | 8–12 |
| 4 | Posts | `admin-http/routes/posts`, public post reads, `composition/modules` post registrations, go-live sweep in `serving-app.ts` | 9–14 |
| 5 | Taxonomy and navigation | `admin-http/routes/{taxonomy,menus}`, `composition/modules/taxonomy.ts`, render contexts | 8–12 |
| 6 | Media | `admin-http/routes/media`, public rendition route, media tools and composition binding | 8–12 |
| 7 | Forms and submissions | `admin-http/routes/forms`, public submit route, `composition/{form-submissions,form-pull-triggers}.ts` | 8–12 |
| 8 | Webhooks | `admin-http/routes/integrations`, `composition/modules/{integrations,integrations-admin}.ts`, `composition/webhook-delivery-worker.ts`, webhooks tools | 12–16 |
| 9 | Members and newsletter | `admin-http/routes/{members,newsletter}`, public member routes, `composition/site-event-subscriptions.ts` | 10–16 |
| 10 | Site, settings, presentation and SEO | Their admin routes, site consent and theme middleware, composition settings and SEO modules | 12–18 |
| 11 | Publishing and backup | Publish-content and share routes, `composition/site-deps/publish-apply.ts`, publish and backup tools | 10–16 |
| 12 | Assistant and plugin registrations | `composition/http-app/mount-assistant.ts`, `assistant/tool-registrations.ts`, affected contributor modules | 12–18 |

## Dispatch and remaining proof

| Job | Repo and base | Order | Executor estimate |
|---|---|---|---|
| `codex/tv-dg-boundaries` | Tovu merge-7 combined after `fix/cloud-bugs-1120`, `codex/tv-c7a`, `codex/tv-c7b`, `codex/tv-z2/z3/z4/z5`, `codex/tv-rs3`, `codex/tv-bg`, `codex/tv-sharezip`, and `codex/tv-engaps`. Use the Jini merge-9 artifact after `codex/jx-engaps`. | DG2-01 → DG2-02 → DG2-03 → DG2-04 → DG2-05 → DG2-06. Append DG1-02 once its baseline is supplied. | 6.1k for six sheets, 8.4k with the gate |

There is no Jini executor job to dispatch ahead of Tovu. The prerequisite is the combined Jini artifact with the existing DevOps export and guard. Keep durable-name migrations with `r62t-breaks` and error-reporting files with `r62t-errfix1`, its addendum, `r62t-err3`, and held `ex-err-jini`.

- **DG2-07 baseline remains partial.** Sole file owner is `development/scripts/check-architecture.baseline.json`. The candidate deletions at `:304–309` are `assistant <-> features/agent-plugins`, `features/agent-plugins <-> features/api-connections`, and `features/custom-credentials <-> features/deployments`. Combine-7 reported those three gone and largest SCC shrinking from 22 to 2. Apply the deletions and adjust the count and SCC fields only after the combined emitted graph proves them. The DG2-03, DG2-04 and DG2-05 edges were already outside the baseline. Restoring a confirmed retired edge or pair after pruning must fail the ratchet. Keep the refresh row-specific.
- **DG2-10 residual graph remains partial.** The historical report identifies 60 unbaselined cross-feature edges and eight red worker/public-read cases. One worker case is already repaired by `tv-c7b`, and DG2-06 removes verified theme barrel edges from the other paths. Combine must trace the remaining post/media barrels and Jini package roots to their first live import on the packed artifact, resolve the optional `canvas` observation, and report any emitted file cycles within a single module. The handoff is complete when the worker graph passes and the architecture gate records zero added cross-feature edges or runtime cycle debt. The source evidence here does not establish that result.
- **DG1-01 remains partial.** The approved prerequisite split, successor-root anchors, exact tool and fixture importer inventory, and the final pilot edit budget are still owed. The `RouteDeps` gate can proceed independently once its baseline is handed off.
