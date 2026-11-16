# SP-A08: cms/media server additions -> `@jini-ai/cms/media` (template T-SPLIT) — HARD-BLOCKED, execute after CLASSIFY rows 152 and 121

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A08`. **Row numbers 152/121 in the audit rows are 0-based data rows of `CLASSIFY.tsv`; the features are line 153 `website/features/media` (MOVE) and line 122 `website/features/image-transform` (MOVE), the rows whose sheets move `media-service`, `image-ops` and the image codec.** A08 is the part those rows did not name (five `features/media` files and `image-transform/tool.ts`). It cannot run before them, because (a) `import-media-entity.ts:3-4` imports `MediaConflictError, resolveWriteOnceSource, replaceMediaFile, sniffContentType`, `MediaRecord`, `VersionedMediaRepoPort`, `AssetBlobRepoPort`, `BlobStorePort` from Tovu's `./index.js` barrel, and the Jini `cms/media` owner of those names is the move target of row 152; (b) `tool.ts` imports `image-ops.js` (row 121). After those land, **every Tovu import of those names is already `@jini-ai/cms/media`**, and this sheet's text guards must be re-taken from the then-current files (blobs below will differ).

Tier: S1 Sonnet + Opus review (write-once/rollback semantics), S2 Sonnet. est. executor tokens ≈ 80k (S1 50k, S2 30k). Read-before-execute: the executor re-runs the census and re-takes blobs; any other hit = STOP.

## Guards (blobs at integ/wave-b, BEFORE rows 152/121 land)
```
tovu_files:
  - apps/website/src/features/media/access-evidence.ts | blob 71fa0a8cc53644b1019d29c57533d3bf9b20c602
  - apps/website/src/features/media/import-media-entity.ts | blob 2936f6674d7cc17e465313345c32bf82389d911c
  - apps/website/src/features/media/public-path.ts | blob 05d306e19e8a3fdf11430ac29916ea202e85835b
  - apps/website/src/features/media/tool-registrations.ts | blob b1be00c29cdee6a75edbb7b6684a9d9cfd030b4f
  - apps/website/src/features/media/where-used.ts | blob e2796646cb4d2242e93230f8dcf573b3f2e01b33
  - apps/website/src/features/image-transform/tool.ts | blob b493646ebdbc81939471e84b29d3cb5fa5cf35e6
tovu_tests (move or repoint):
  - apps/website/src/features/media/__tests__/public-path.test.ts | blob ec93317575a762a408e4d7ebb7533dd21698efea
  - apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts | blob 20492bc4428c0788a3344772caa9daef3be7336a
  - apps/website/src/features/trash/__tests__/post-trash-media-evidence.integration.test.ts | blob 9b3738cb51923a92c03e1f9a9680e9ffb4230f86
jini_guards:
  - packages/cms/package.json | blob 1d49bc2899be0d9925a391340bd1fea61777e17d
  - packages/cms/src/media/index.ts | blob 57ff8140622fd366c801c1df5a2a182fe3780391
  - packages/cms/src/media/ports.ts | blob e5d68fe8eb45b8fa49911bad20c7ee3f9d4fc21c
  - packages/cms/src/media/media-service.ts | blob fe5652b50f136fbcce4460ba35aafcb3a58fa9d3
  - packages/cms/src/media/import/index.ts | blob 970ff6d9373c3b5e51106242495df7aa5f4f1893
  - packages/cms/src/media/slug.ts | blob f8b079c9c77d19e9e895fcfc789a9935f4829edc
  - packages/cms/src/media/{import-entity.ts,public-path.ts,where-used.ts,access-evidence.ts,image-transform-tool.ts} must not exist; `rg -n "importMediaEntity|mediaUrlKey|findMediaWhereUsed|getMediaAccessEvidenceCache" packages/cms/src` prints nothing
```

## What goes where (every declaration read on 2026-11-16)
| Tovu file (lines) | Declarations | Jini home | Ports it needs | Stays in Tovu |
|---|---|---|---|---|
| `media/public-path.ts` (65) | `MediaUrlKeySource`, `mediaUrlKey` (slug if valid else id), `MediaPublicPathVariant`, `mediaPublicPath` (`/m/<key>/original.<ext>` and `/m/<key>/<name>.v<N>/image.<ext>` with `?v=<sha[:12]>` cache buster) | `cms/media/public-path.ts` (universal, pure; already imports Jini `media/import` `mediaFileExtension` and `media/slug` `isValidMediaSlugFormat`: switch to own-package leaf relative imports) | none: the `/m` prefix is a path format constant: **it is the public route contract, a wire value**; export `MEDIA_PUBLIC_PATH_PREFIX = "/m"` and take `prefix` as `optional.prefix = "/m"` so Tovu pins the value in its binding | the `/m` ROUTE handler (`server/inbound/public-http/routes/site/media-rendition.ts`), which keeps consuming the same function |
| `media/tool-registrations.ts` `resolveOneAssetPublicUrl` (:33-45) + `resolveMediaPublicUrls` (:58-115) | batched URL planning: per asset choose original for svg/video/audio else the latest core public transform | `cms/media/public-urls.ts` as `planMediaPublicUrls({ assets, transforms, coreTransformName }, { prefix })` pure (the repo reads stay in Tovu's `resolveMediaPublicUrls`, which shrinks to read + call) | `getLatestTransformDefinition` is already in Jini cms/media (rendition/transform registry: `rg -n "getLatestTransformDefinition" packages/cms/src`); `CORE_PUBLIC_TRANSFORM_NAME` constant: required option | tool wiring (`buildMediaRegistrationsForTovu`, `MEDIA_TRASH_TOOL_ID`, assistant actor id), the trash handler (`media_trash_asset`), upload content-type policy (`buildRecordUploadContentType`) |
| `media/where-used.ts` (34) | `findMediaWhereUsed`: keys = media id + current slug + retired slugs; indexed `entry_refs` rows (asset target) UNION a live scan of current post bodies (stale index guard); excludes trashed unless asked | `cms/media/where-used.ts` | `entryRefs.findByTarget({ workspaceId, targetKind: 'asset', targetId })`, `posts.list({ workspaceId })`, `media.listRetiredSlugs({ workspaceId, mediaId })`, `collectReferencedMediaKeys({ bodyJson, bodyHtml, seoExtJson })` as a required function port (Tovu `publish-content/media-references`; its home is row 140's problem), `EntryRefRow` shape as structural `MediaUsageRef` | `PostRepoPort` adapter, `EntryRefsRepoPort` adapter, the `bodyFormat === 'html' ? 'bodyHtml' : 'bodyJson'` field-path mapping is Tovu's post model: passed as `describeFieldPath({ post })` |
| `media/access-evidence.ts` (38) | instance-scoped WeakMap caches keyed by the repo OBJECT (`postRepo`, optionally `entryRepo`), `invalidateMediaAccessEvidence({ owner })` | `cms/media/access-evidence.ts` generic over the owner key: `createAccessEvidenceCaches<TScan>()` returns `{ cacheFor({ owner, linkedOwner? }), invalidate({ owner }) }` | none | which repos are owners, and the post/member access projection (`AssetReferenceScan` = a Tovu access concept: leave the type in Tovu, Jini cache is generic `Map<string, TScan>`) |
| `media/import-media-entity.ts` (442) | `importMediaEntity`/`restoreImportedMedia` + helpers: hash verification (`bytesMatchSha256`, `isValidSha256Hex`), size cap, conditional insert/replace with `baseVersion`, write-once source (`resolveWriteOnceSource`), asset blob ensure, rollback of replaced source, refusal codes `missing-blob | slug-taken | precondition` | `cms/media/import-entity.ts` | `mediaRepo: VersionedMediaRepoPort`, `assetBlobRepo`, `blobStore` (all Jini cms/media ports after row 152), `clock`, `idGen`, **`maxUploadBytes: number` (required option replacing `TOVU_MAX_UPLOAD_BYTES`)**, `verifyBytes: (required: { bytes; sha256 }) => boolean` and `isValidSha256: (required: { value }) => boolean` (Tovu `publish-content/blob-staging`, row 140; if Jini has equivalents by then they are used directly: step 0 `rg -n "bytesMatchSha256" packages`) | `MediaSourceReplacement` type (Tovu `publish-content/type-registry`: structural `{ sourceReplacement?: ... }` generic declared in Jini), the publish-content caller |
| `image-transform/tool.ts` (93) | `image_transform` catalog + `prepare` (strict key check `source/outputs/destination`, inspect needs no destination, all outputs render before approval or write) + approval-gated run | `cms/media/image-transform-tool.ts` — **only the pure prepare/describe/run orchestration**; asset sources/destinations and fs-files writers are other rows (`asset-transfer` CLASSIFY 113 SPLIT, `fs-files`) | ports: `readAssetSource`, `requireAssetDestination`, `prepareAssetWrites`, `writeAssetFiles`, `describeWriteBatch`, `approvalToolHandler`, `refuseUnexpectedKeys`, `isCallerError` classifier: **9 host functions** > the 3-port budget of T-SPLIT, so **this file is deferred**: row says "image-transform inspect/render/prepare/approve/commit handler" but the handler is composition of 5 other unmoved features; S2 therefore moves only `view()`, `Prepared` and the catalog constants if rows 121/113/fs-files have landed; otherwise the file is reported SKIPPED-DEFERRED (not a failure) | metadata table `contracts/core/tool-metadata/image-transform.js`, `FS_FILES_READ_PERMISSION`, theme/import shape rejections |

## Ports (Jini, `cms/src/media/ports.ts` additions; names checked free by `rg` at step 0)
```ts
export interface MediaImportDeps {                         // = ImportMediaEntityDeps
  readonly mediaRepo: VersionedMediaRepoPort; readonly assetBlobRepo: AssetBlobRepoPort; readonly blobStore: BlobStorePort;
  readonly clock: { nowIso(): string }; readonly idGen: { newId(): string };
  readonly maxUploadBytes: number;                          // REQUIRED: a missing cap must not mean unbounded
  readonly verifyBytes: (required: { bytes: Uint8Array; sha256: string }, optional?: Record<string, never>) => boolean;
  readonly isValidSha256: (required: { value: string }, optional?: Record<string, never>) => boolean;
}
export interface MediaWhereUsedDeps {
  readonly entryRefs: { findByTarget(required: { workspaceId: string; targetKind: 'asset'; targetId: string }): Promise<readonly MediaUsageRef[]> };
  readonly posts: { list(required: { workspaceId: string }): Promise<readonly MediaUsagePost[]> };   // { id, deletedAt?, bodyJson, bodyHtml, seoExtJson, bodyFormat }
  readonly media: { listRetiredSlugs(required: { workspaceId: string; mediaId: string }): Promise<readonly string[]> };
  readonly collectReferencedKeys: (required: { bodyJson: unknown; bodyHtml: unknown; seoExtJson: unknown }, optional?: Record<string, never>) => ReadonlySet<string>;
  readonly describeFieldPath: (required: { post: MediaUsagePost }, optional?: Record<string, never>) => string;
}
```
Exported functions take `(required, optional = {})`: `importMediaEntity({ deps, input }, optional = {})`, `findMediaWhereUsed({ deps, input }, { includeTrashed = false } = {})` (already so), `mediaUrlKey({ asset })` (**positional today**: `mediaUrlKey(asset)`; convert in the move and at all call sites: the census list below), `mediaPublicPath` already takes `{ key, variant, sha256 }`.

```
id: SP-A08-1 .. SP-A08-2
feature: website/features/media additions + image-transform tool
jini_target: cms src/media/{public-path.ts,public-urls.ts,where-used.ts,access-evidence.ts,import-entity.ts} (+ image-transform-tool.ts if unblocked); package.json: no new subpath if `./media` exports them from index.ts (the `./media` entry is `node`; public-path and public-urls are pure: add `./media/public-path` universal so the site renderer/browser tooling can import it without node built-ins)
changeset: @jini-ai/cms: minor | "media: public path and URL planning, where-used, access-evidence caches, import entity"
```

## SP-A08-1 — pure + read-only pieces (Jini commit, then Tovu commit)
0. Preconditions: rows 152 (media) and 121 (image-transform) landed (`rg -n "from \"\./index\.js\"" apps/website/src/features/media/import-media-entity.ts` shows `@jini-ai/cms/media`, else STOP). Re-take blobs/census.
1. Failing tests first: `cms/src/media/__tests__/public-path.test.ts` = Tovu `public-path.test.ts` (original `/m/<key>/original.<ext>`, transform `/m/<key>/<name>.v<N>/image.<ext>`, `?v=` first 12 hex chars, key percent-encoding of a slug with `/` or `?` can not occur: assert the encoder handles an id with them), `where-used.test.ts` = `mediawidget-where-used.test.ts` (retired slug still counts, trashed excluded unless `includeTrashed`, stale-index guard: a post body referencing the asset with NO `entry_refs` row is found, index row for a deleted post is dropped), `access-evidence.test.ts` (new: same owner -> same cache; linked owner invalidation clears every linked cache; a scan that completes after `invalidate` never re-inserts, the pending-scan detach rule in the header comment) and `public-urls.test.ts` (svg/video/audio -> original, image -> core public transform latest version, no transform -> original, batch of 200 assets plans without per-asset awaits).
2. Code: move the four files per the table; positional `mediaUrlKey(asset)` -> `mediaUrlKey({ asset })` and update every call site in the same commit (census: `tool-registrations.ts:37`, `server/inbound/public-http/routes/site/media-rendition.ts`, `site/render.ts`, `render-context.ts`, `features/site-export/media-original-urls.ts`, `post/post.ts`, `post/repo.ts`, `post/repo.memory.ts`, `entries/repo.ts`, `entries/trash-aware-memory-repo.ts`, `composition/modules/media.ts`, `deps.ts`; `rg -n "mediaUrlKey\\(" apps` is the authority).
3. Tovu: delete the four Tovu files, `resolveMediaPublicUrls` becomes read-then-`planMediaPublicUrls`, Tovu's `where-used` route (`routes/media/where-used.ts`) calls Jini with adapters; `post-trash-media-evidence.integration.test.ts` repoints to the Jini cache API. Commit.

## SP-A08-2 — import entity (Jini commit, then Tovu commit; Opus review)
1. Failing tests first (RED = module missing; moved cases are the green twins): the cases of the existing import tests (`rg -l "importMediaEntity|restoreImportedMedia" apps/website/src --glob '*test*'` and move every case): hash mismatch -> refused; oversize bytes (`maxUploadBytes`) -> refused BEFORE hashing (assert `verifyBytes` not called); `baseVersion` mismatch -> `precondition` with the mismatch described; slug taken -> `slug-taken` and no blob written; missing blob -> `missing-blob`; write-once source (existing row with a different source sha) -> `MediaSourceImmutableError`; conditional insert race (second writer between read and write) -> `precondition`, first row untouched; `restoreImportedMedia` after a failed replace restores the prior source and blob row. NEW (owner rule: a missing cap is a defect): `maxUploadBytes: 0` refuses everything; omitted option does not type-check (`@ts-expect-error` in the test).
2. Code: `import-entity.ts` = `import-media-entity.ts` with the Tovu imports replaced by the ports (table), the 442 lines split: `importMediaEntity` (:346-388) is 42 lines OK; `replaceImportedMedia` (:389-418), `restoreImportedMedia` (:419-432), `restoreReplacedSource` (:433-442), `writeMediaRowConditionally` (:177-215, 38 lines), `checkedBytes`, `basisRefusal`, `ensureAssetBlob`, `importedRow` each ≤ 50 lines: verify complexity ≤ 10 on `checkedBytes` and `basisRefusal` after the move; split if not. `MediaSourceReplacement` (Tovu type) becomes structural `{ replace: boolean; ... }`: read its fields at `publish-content/type-registry` and copy only the ones read here (step 0 lists them; STOP if more than 3).
3. Tovu: delete `import-media-entity.ts`; the one caller family is `publish-content` (row 140): repoint its import and pass `maxUploadBytes: TOVU_MAX_UPLOAD_BYTES`, `verifyBytes: bytesMatchSha256`, `isValidSha256: isValidSha256Hex` from its binding (`rg -n "importMediaEntity" apps/website/src`: STOP if more than `publish-content` and tests). Commit.

## Opus review points
1. Order of refusals in `importMediaEntity` is unchanged (size before hash before DB read before write-once check before insert).
2. `maxUploadBytes`, `verifyBytes`, `isValidSha256` are required (no permissive defaults).
3. The conditional write is atomic (one repo call carrying `baseVersion`), not read-then-write.
4. `restoreImportedMedia` never deletes a blob another row references (the content-addressed blob is shared): confirm `ensureAssetBlob` is idempotent and restore only touches the source pointer.
5. `/m` prefix pinned by Tovu's binding test (public route contract).

## untangle overlap (execute after wave B merge AND rows 152/121)
- C11-ids edits `cms/src/media/media-service.ts` (clock/ids) and the 9 §3 sites; C5 `core/contracts/blob` (BlobStorePort vocabulary) landed: if `BlobStorePort` moved to core, `ports.ts` here imports it from there.
- C8 touches `cms/forms/*` and `cms/widgets/resolvers/contact-form.ts`, not `cms/media/*` (files above are new).
- R-BARRELS repoints Tovu `media/index.js` barrel users: `import-media-entity.ts:3-4` lines are rewritten before this sheet runs: text guards only.
- A25 (integrations/media-providers) and A63 (cms/media transfer: asset-destinations) are neighbours: A63 is "row 112" and also edits `asset-transfer`; `image-transform/tool.ts` here depends on it (deferral above).
- `publish-content` (row 140) owns `blob-staging` and `media-references`: the ports above are filled by those until row 140 moves them.

## STOP specific to this sheet
- Rows 152/121 not landed.
- `mediaUrlKey` call sites beyond the census list.
- `MediaSourceReplacement` needs more than three fields.
- Any moved function reads `process.env` or imports a Tovu path.
