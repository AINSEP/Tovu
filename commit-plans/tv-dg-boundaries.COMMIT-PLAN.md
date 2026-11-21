# DG2 boundary sheets

Branch: `codex/tv-dg-boundaries`. Base: supplied `2095ffdd47` (`codex/tv-engaps2`).
`W` below means `apps/website/src`; `D` means `development/scripts`.
Only DG2-01 through DG2-06 were considered, in order. No commits or other `.git` writes.
No tests, builds, installs, type checks, linters, or graph tools were run, as dispatched.
All existing `_optional = {}` / `_options = {}` pads and the args rule are preserved.
The new fixture was written before DG2-02 production changes; existing named cases were read before the other production changes. RED/GREEN execution and all named mutations remain owed to combine.

## DG2-01 — STOPPED

- Base: `2095ffdd47`; sheet expects `codex/tv-c7b` and `fix/cloud-bugs-1120` in combine.
- Reason: unlisted production importers of the proposed `platform/site-dir/errors` entry: `W/cli/commands/init.ts:4` and `W/server/runtime/composition/move-site-storage.ts:11`. The hard inventory STOP applies. Details in `REFRESH.md`.
- Files: none. `.dependency-cruiser.mjs` and its test remain unchanged.
- Tests: no new case because preflight stopped the sheet. On resumption, add the named scratch-tree declared-leaf/private-file/upward-value case and copy the actual rank table. Retain published-but-unlisted theme page, publication, SEO cover and stdin-cap cases.
- Mutation owed to combine: remove the chosen leaf declaration, suppress each rejection rule separately, and require each corresponding assertion to fail.
- API-baseline delta (Jini): none. Architecture baseline: unchanged.
- Look owed: published theme-page and visitor-tool HTML with DG2-06.
- Diff re-read deletions: none; no edits attempted.

## DG2-02 — done, execution owed

- Base: `2095ffdd47`; DG2-01 is stopped independently.
- Files: `D/__tests__/check-architecture.test.ts`, `D/check-architecture.ts`.
- Tests: added only the inline named `type` import fixture with `verbatimModuleSyntax: true`; the flag is absent from the serialized configs for the other fixtures. It expects one runtime back-edge, one mutual cycle and a two-module SCC. Before the source change, the pre-compilation type filter discards this emitted `import {}` edge, so those assertions are expected red. Statement-level `import type` still expects zero runtime edges and one all-import back-edge. Existing new cross-feature rejection remains.
- Source: separate pre-compilation and emitted cruises under the existing `--no-config` / `--ts-config tsconfig.json`; graph scope and ratchet comparisons retained. Private cruise/buildFileGraph/measureFileGraphs remain below 50 lines and complexity 10 by source inspection; no new production function.
- Mutation owed to combine: reuse the all-import cruise for runtime; separately restore the old type-tag filter. Both must lose the emitted-import witness. Plant a feature-to-composition back-edge and require the existing hard check to reject it. Confirm installed cruiser behavior before any baseline changes.
- API-baseline delta (Jini): none. Architecture baseline: unchanged.
- Look owed: none.
- File over 500 lines: `D/check-architecture.ts` is 1,024 lines; continue per owner correction.
- Diff re-read deletions: required removal of `isTypeOnlyDependency`, its obsolete documentation/reference, `CruiseModule.dependencies.dependencyTypes`, private graph options/filter, shared cruise variable and obsolete one-cruise explanation. No incidental additions found to delete.

## DG2-03 — done, execution owed

- Base: `2095ffdd47`.
- Files: `W/features/custom-credentials/credential-ports.ts`.
- Tests: none added; reuse request forwarding at `W/features/custom-credentials/__tests__/extract-s8-c2p1-credential-ports.test.ts:104` and verify/probe at `:123`. These pin unchanged behavior; the boundary mutation supplies the red evidence.
- Source: deleted only the exact unused source-control import. Targeted lookup confirmed both bindings appeared only there in this file. `bindCredentialedRequestPort` and caller imports unchanged.
- Mutation owed to combine: restore the exact deleted import; require the rank error and `NEW cross-feature edge` for this edge.
- API-baseline delta (Jini): none. Architecture baseline: unchanged.
- Look owed: none.
- Diff re-read deletions: the named import line only; no extras to delete.

## DG2-04 — done, execution owed

- Base: `2095ffdd47`; combine includes `codex/tv-c7a` / `codex/tv-sharezip` and the Jini merge-9 artifact after `codex/jx-engaps`.
- Files: `W/features/site-backup/plan-content.ts`, `W/features/source-control/provider-module.ts`.
- Tests: none added; reuse the fake-provider plan/push round trip at `W/features/site-backup/__tests__/integration/archive-round-trip.integration.test.ts:106`. Its `SiteBackupPlanContent` import is unchanged. Runtime behavior is unchanged; the graph mutation supplies the red evidence.
- Source: both direct users now import `BackupRepositoryState` from `@jini-ai/devops/source-control`; the identical Tovu interface is removed. Targeted symbol lookup found only the two named users. Read-only Jini `origin/codex/jx-engaps` objects confirm the exact fields in `contracts.ts:17`, the `entry.ts:1` export and existing package subpath. No manifest or lockfile edit.
- Mutation owed to combine: restore the local type import in `plan-content.ts`; require the exact `plan-content.ts -> provider-module.ts` graph edge. Resolve the type against the combined packed Jini artifact; if that requires a manifest/lockfile change, route to OPUS-CLOUD.
- API-baseline delta (Jini): none; consuming an existing exported type. Architecture baseline: unchanged.
- Look owed: none.
- Diff re-read deletions: only the identical local interface; no extras to delete.

## DG2-05 — done, execution owed

- Base: `2095ffdd47`.
- Files: verbatim move `W/features/media/access-evidence.ts` to `W/platform/media-access-evidence.ts`; import-only repoints in:
  - `W/features/entries/repo.sqlite.ts`
  - `W/features/entries/__tests__/support/trash-aware-entry-repo.ts`
  - `W/features/post/repo.ts`
  - `W/features/post/repo.memory.ts`
  - `W/server/runtime/composition/memory-deps/slices/repos.ts`
  - `W/server/runtime/composition/site-deps/trash-service.ts`
  - `W/features/entries/__tests__/repo.characterization.test.ts`
  - `W/features/entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts`
  - `W/features/trash/__tests__/post-trash-media-evidence.integration.test.ts`
  - `W/server/inbound/public-http/routes/site/media-rendition.ts`
- Tests: none added; existing SQLite successful-save / transaction, memory successful-save, and post-trash hide/restore cases now read the platform cache. Test/support repoints preceded the production move. Existing media-rendition worker graph case is the runtime control. The move's bytes match HEAD's original exactly; both WeakMaps, functions, types, comments and pads are together, with no forwarding export or second copy.
- Mutation owed to combine: separately remove SQLite's `onWriteSettled`, the memory test binding callback, and production trash transaction invalidation. Corresponding cache-empty assertions must each fail; SQLite transaction cases pin both resolve and reject settlement.
- API-baseline delta (Jini): none. Architecture baseline: unchanged.
- Look owed: combined public-read check only.
- File over 500 lines: `W/server/inbound/public-http/routes/site/media-rendition.ts` remains 760 lines; continue per owner correction.
- Diff re-read deletions: old cache path removed as part of the verbatim move; no extras to delete.

## DG2-06 — done, execution owed

- Base: `2095ffdd47`; combine includes `codex/tv-c7b`. DG2-01 declarations remain owed after its inventory STOP.
- Files: only the seven import repoints under `W/server/inbound/public-http/`:
  - `http/site/render/components/entry-lists.ts`
  - `http/site/render/page-body.ts`
  - `routes/site/pages/handlers/post.ts`
  - `routes/site/pages/handlers/virtual-page.ts`
  - `routes/site/pages/render-context/static-menus.ts`
  - `routes/site/pages/render-context/post-previews.ts`
  - `routes/site/pages/template-render.ts`
- Tests: none added; reuse worker/public-read cases in `W/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts:139-167,241-264`, read before repointing. Existing graphs pin transitive dependencies. Destination declarations and their Tovu runtime dependencies were inspected; no return to the theme barrel was found. No declarations or helper-test imports changed.
- Mutation owed to combine: restore the barrel import in `render/page-body.ts`, separately in the virtual-page handler, and separately make `static-render-content.ts` transitively load the theme barrel. Each respective report must expose the barrel or its offending edge, even with other graph failures. Final complete worker/public-read pass belongs to combine.
- API-baseline delta (Jini): none. Architecture baseline: unchanged.
- Look owed: templated public page with a menu and entry list, member page, storefront; DG2-01 publication/visitor-tool HTML. No Electron look.
- Diff re-read deletions: only replaced barrel import lines; no extras to delete.
