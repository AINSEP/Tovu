SHEETS Website extraction COMPLETE: 9 sheets (6 Jini / 3 Tovu), 9 OPUS-REVIEW, 6 files move, 0 STAYS-HOST, 0 BLOCKED

| First-pass NOT-SHEETED item | Status | Jini destination | Blocker resolved by |
|---|---|---|---|
| `features/media-import/tool-registrations.ts` | SHEETED | `@jini-ai/cms/media/site-import/tool-registrations` | J19 defines the guarded ingress, refusal, and persistence ports. T18 binds the existing HTTP client, roots, conversion, and upload policy. |
| `features/asset-transfer/asset-destinations.ts` | SHEETED | `@jini-ai/cms/asset-transfer/asset-destinations` | J20 replaces the intersection of two registrar bags with destination-specific ports. T18 binds the picked-folder batch and theme writer. |
| `features/asset-transfer/copy-tool.ts` | SHEETED | `@jini-ai/cms/asset-transfer/copy-tool` | J21 uses J19–J20 and requires the host’s source readers and document archive reader. T18 retains `yauzl` and agent-plugin archive construction. |
| `features/image-transform/tool.ts` | SHEETED | `@jini-ai/cms/media/site-transform/tool` | J22 uses the shared destination and refusal seams. T18 injects the real approval builder, codec, source reader, and theme binding. |
| `features/media-generation/tool-registrations.ts` | SHEETED | `@jini-ai/cms/media/site-generation/tool-registrations` | J23 separates model selection, credential precedence, and storage from dispatch and host credentials. T19 binds the existing registry, guard, and credential setup. |
| `features/recovery/tool-registrations.ts` | SHEETED | `@jini-ai/db/recovery/tool-registrations` | J24 defines the plan, confirm, execute, and lock ports together. T20 binds the existing gateway, shared lock, and actual human-confirmation transport. |

**Build order** after W1 J18 and T17 is **J19 → J20 → J21 → J22 → T18 → J23 → T19 → J24 → T20**. T18 is one cutover because deleting any of its four sources early would leave a live dependent on the old path. No dependency on an unbuilt P9 step. Use the W1 J01/T01 approval seam and J12/T11 filesystem catalog seam. J14/T13 owns provider credential tooling, not generation execution. The media-import row repeated in W2 is the same source and should not be dispatched twice.

**Anchors and verification.** The fetched merge-23 refs resolve to Tovu `c0f1068a59` and Jini `fd06f45b12`, newer than the first-pass SHAs. Paths below use those fetched refs. No files were changed, and no tests, builds, installs, or type-checks were run.

**Sheet conventions.** Tovu paths are relative to `apps/website/src` unless stated otherwise. `F` = `features`, `A` = `assistant`, `C` = `server/runtime/composition`, and `K` = `contracts/core`. `pkg:path` means `packages/pkg/src/path.ts` and the public subpath `@jini-ai/pkg/path`. `Empty` below means `Record<string, never>`. Every new public function or factory uses two object arguments and an `_optional = {}` pad unless the second object carries named options. Existing interfaces such as `ToolContributor.build(deps, surfaces)` and platform callbacks keep their ABI. Keep why-comments with the behavior they explain. Keep Tovu-only names, policy history, and copy on the host. Do not add re-export shells.

**Release and build rules.** For each new Jini export below, add an exact `package.json` entry with `types: "./dist/<path>.d.ts"`, `import: "./dist/<path>.js"`, and `default: "./dist/<path>.js"`. For core and CMS, add the corresponding key to `jini.entries` with the stated runtime. DB inherits its package `node` runtime. Each J sheet gets one additive minor changeset for its named packages and the indicated `api-baseline/jini-ai__<pkg>.json` update. SOL writes the named tests first, then the code and release metadata. Opus runs the tests, checks mutations, and regenerates the named baselines. T sheets add no package exports, changesets, or API baselines. Tovu already depends on the three packages. Re-run `git grep -nI` at cutover for the old specifiers, including relative `.js`/`.ts`, `#src/`, dynamic imports, and child-process strings. Preserve the one canonical package dependency set. No new vendor SDK or server-framework dependency in Jini.

## J19 — Media import execution and shared ingress ports · BUILDER: SOL · OPUS-REVIEW

**Move** `F/media-import/tool-registrations.ts:101–205,226–451` to `cms:media/site-import/tool-registrations` (`node`). Extract the portable types from `:58–99,189–205,214–233` into `core:contracts/site/media-tool-ports` (`universal`). Host-only pieces at `:1,11–24,52–56,76–96,208–224,260–268,236–244,330–332` are bound in T18. Keep `F/media-import/fetch-image.ts` in Tovu. Its byte validation already delegates to `cms:media/import`. Its current HTTP fixture translation and independent transport backstop are host policy.

**Contracts.** `media-tool-ports` owns `MediaToolUploadInput` with `workspaceId`, `bytes: Uint8Array`, `filename`, `contentType`, `createdByPrincipal`, optional `alt`, `caption`, `credit`, `description`, and optional `provenance: MediaProvenance`. Use `MediaRecord` and `MediaProvenance` from core `contracts/site/cms-media`. Move the full `ImportedMediaView` projection, including `createdBy: string | null` and `sourceUrl: string`. Add these narrow ports, with `Empty` as the optional second object unless specified:

| Port | Required argument → result |
|---|---|
| `MediaToolStoragePorts.upload` | `{ input: MediaToolUploadInput }` → `Promise<{ media: MediaRecord }>` |
| `MediaToolStoragePorts.recordContentType` | `{ workspaceId, sha256, contentType }` → `Promise<void>` |
| `MediaToolStoragePorts.resolvePublicUrls` | `{ assets: readonly MediaRecord[] }` → `Promise<Map<string, string \| null>>`, closed over the current host workspace and stores |
| `MediaImportSourcePorts.fetchRemote` | `{ url: string }` → `Promise<{ bytes: Uint8Array; contentType: string; url: URL }>` |
| `MediaImportSourcePorts.resolveLocal` | `{ root: string; relativePath: string }` → `{ rootPath: string; relativePath: string }` |
| `MediaImportSourcePorts.readLocal` | `{ rootPath, relativePath, maxBytes: number }` → `Promise<Uint8Array>` |
| `MediaImportSourcePorts.localReadLimit` | `{ relativePath: string }` → `number` |
| `MediaImportSourcePorts.validateBytes` | `{ source: URL \| string; bytes: Uint8Array; bytesTruncated: boolean }` → `string` |
| `MediaImportRefusalPorts` | `isEgressRefusal({ error: unknown }) → boolean`, `describeEgressRefusal({ error: unknown }) → { logMessage: string; callerSafeError: Error } \| undefined`, `logEgressRefusal({ line: string }) → void`, `isPathRefusal({ error: unknown }) → boolean` |

The CMS `MediaImportToolDeps` holds `workspaceId`, `authorize: ToolPermissionAuthorizationPort`, `storage`, `source`, `refusals`, optional `tracker` and `imageCodec`, and a `replacement` port. The replacement port has `findById({ id }) → Promise<MediaRecord | null>`, `isAvailable({}) → boolean`, and `replace({ media, bytes, contentType, provenance, principalId }, { signal }) → Promise<MediaRecord | null>`. `provenance` is a required `MediaProvenance` for this call and `signal` is a required `AbortSignal` in its second object. Do not carry filesystem roots, a native client, the video adapter, or a whole media repository bag into the registrar.

**Public signatures.**

```ts
persistImportedMedia(
  required: {
    storage: MediaToolStoragePorts;
    input: MediaToolUploadInput;
    sourceUrl: string;
    actorId: string;
    tracker?: Tracker;
  },
  _optional: Empty = {},
): Promise<{ media: ImportedMediaView }>

isImportShapeRejection(
  required: { error: unknown; refusals: Pick<MediaImportRefusalPorts, "isEgressRefusal"> },
  _optional: Empty = {},
): boolean

withCallerSafeEgressRefusal<T>(
  required: {
    refusals: MediaImportRefusalPorts;
    work: () => Promise<T>;
  },
  { toolId = "media_import_from_url" }: { toolId?: string } = {},
): Promise<T>

buildMediaImportRegistrations(
  required: { deps: MediaImportToolDeps; catalog: readonly AgentToolDefinition[] },
  _optional: Empty = {},
): ToolRegistration[]

contributeMediaImportTools<D>(
  required: {
    catalog: readonly AgentToolDefinition[];
    bindDeps: (required: { deps: D }, optional?: Empty) => MediaImportToolDeps;
  },
  _optional: Empty = {},
): ToolContributor<D, unknown>
```

Keep `mediaImportDerivedRisk`. Index the injected catalog inside the build, not from a module-global host value. Use J01’s `refuseUnexpectedKeys({ input, allowed })` and core’s `requireToolPermission` with the already adapted evaluator. Call `withCallerSafeEgressRefusal` at the existing boundaries. For URL import it encloses the current URL work. For replacement it encloses remote acquisition only. Log `[media-import] ${toolId} egress refused: ${logMessage}` and throw only `callerSafeError`, with no original cause attached. If the supplied classifier returns no description, rethrow the original error. Keep validation, path, and media-service classifications scoped to their original handlers. A transport failure is still an internal error, not input advice.

- Keep authorize-before-fetch/read. Replacement still checks exactly one source, active status, and both CAS capabilities before source I/O. Retain the abort check and pass the signal into replacement. CAS loss remains the existing explicit retry refusal, not success or an upsert.
- Keep local title construction, normalized local provenance, and redirect-final remote provenance. Check `filename === undefined` after `.at(-1)`. Build `optionalString` properties and the filename override with conditional spreads where absent. Do not add a redirect or content-type fallback.
- Keep upload → sniff and record actual type → analytics → public URL → optional preview. The preview can fail without undoing storage. Recording or URL lookup failure is not success. No catch around storage. Retain the current replacement projection separately from the import projection. Same-package sniffing, analytics, import validation, and preview remain on their canonical implementations.
- Split the replacement source read, replacement target validation, and editors’ optional field projection into small helpers. This keeps handlers under 80 lines and complexity 10 without changing evaluation order.

**Importers** of the moved registrar and its host split are enumerated in T18. J20 uses the core persistence/view contract. J21 and J22 get the J19 refusal predicate through their host bindings.

**Tests first.** `packages/cms/src/media/site-import/__tests__/tool-registrations.test.ts` — “permission denial touches neither source nor storage,” “redirect-final source and sniffed type are recorded,” “replace capability refusal precedes source access,” and “abort after acquiring bytes leaves storage untouched.” Mutations `fetch-before-authorize`, `persist-request-url`, `read-before-cas-capability`, and `drop-import-abort-fence`. In `caller-safe-refusal.test.ts`, “only the safe error reaches schema decoration; ordinary transport errors keep their identity,” mutation `throw-original-refusal`.

**Release.** Exact core and CMS exports above. `.changeset/website-media-import-ports.md` (`core`, `cms` minor). Baselines `jini-ai__core.json` and `jini-ai__cms.json`.

## J20 — Asset destination preparation and writes · BUILDER: SOL · OPUS-REVIEW

**Move** `F/asset-transfer/asset-destinations.ts:18–149` to `cms:asset-transfer/asset-destinations` (`node`), with shared structural types in `core:contracts/site/asset-transfer-tool-ports` (`universal`). Requires J19. Do not copy `AssetToolDeps = FsFilesToolDeps & MediaImportToolDeps`. T18 binds the existing owners rather than teaching CMS where a site or theme lives.

**Contracts.**

- Core owns `AssetTheme { readonly dir: string; readonly status: unknown; readonly errors?: unknown }`, `AssetFile<B extends Uint8Array> { path: string; bytes: B; sourceUrl?: string }`, `OverwritePolicy = "skip" | "overwrite" | "rename"`, and `AssetDestination`. The destination is a discriminated union of `{ kind: "theme"; themeId: string }` and `{ kind: "site" | "media" | "library" | "picked" }`. Neither absent `themeId` nor absent batch needs an explicit `undefined` property in prepared state.
- Core owns `PreparedAssetBatch<B extends Uint8Array> = { readonly folder: string; readonly writes: readonly { readonly path: string; readonly bytes: B; readonly overwrite: boolean }[] }`, and `PreparedAssets<B> = { destination: AssetDestination; files: AssetFile<B>[]; skipped: string[]; batch?: PreparedAssetBatch<B> }`. CMS specializes both to `Buffer`, assignable to the existing FS writer’s structural input without casts.
- `AssetDestinationDeps<Theme extends AssetTheme>` carries `workspaceId`, `authorize: ToolPermissionAuthorizationPort`, `permissions: Readonly<Record<AssetDestination["kind"], string>>`, and three ports:

| Port | Operations |
|---|---|
| `fs` | `siteFolder({}) → string`, `inspect({ folder, path }) → { overwrite: boolean }`, `prepareSite({ folder, files }) → PreparedAssetBatch<Buffer>`, `preparePicked({ files }) → PreparedAssetBatch<Buffer>`, `writePrepared({ folder, writes }) → { written: string[]; notWritten: string[]; failed?: { path: string; reason: string } }`, `chooseNextName({ desiredPath, existingPaths: Set<string> }) → string`. The preparation rows are `{ path: string; content: string; encoding: "base64" }[]`. |
| `theme` | `findTheme({ themeId }) → Theme`, `checkThemeWrite({ theme, relativePath }) → void`, `writeThemeFile({ theme, relativePath, bytes: Buffer }) → void`, `reloadTheme({ theme, themeId }) → Theme`. |
| `media` / `library` | `media.validateBytes` uses J19’s validation signature. `media.persist({ input, sourceUrl, actorId }) → Promise<{ media: ImportedMediaView }>` uses the J19 upload input. `library.saveDocument({ bytes: Uint8Array, name, principalId }) → Promise<{ document: unknown }>` binds an archive reader where the host provides one. |

`AssetDestinationDeps` and `AssetDestinationKit` belong to the CMS entry because their executable boundary uses `Buffer`. Keep shared data contracts in core. Export `AssetDestinationKit` as the shape of these three functions, so J22 can accept the same implementation without adding a media-to-asset-transfer runtime import:

```ts
requireAssetDestination<Theme extends AssetTheme>(
  required: { deps: AssetDestinationDeps<Theme>; ctx: ToolExecutionContext; input: unknown },
  _optional: Empty = {},
): Promise<AssetDestination>

prepareAssetWrites<Theme extends AssetTheme>(
  required: {
    deps: AssetDestinationDeps<Theme>;
    destination: AssetDestination;
    files: AssetFile<Buffer>[];
    policy?: OverwritePolicy;
  },
  _optional: Empty = {},
): PreparedAssets<Buffer>

writeAssetFiles<Theme extends AssetTheme>(
  required: {
    deps: AssetDestinationDeps<Theme>;
    ctx: ToolExecutionContext;
    prepared: PreparedAssets<Buffer>;
  },
  _optional: Empty = {},
): Promise<AssetWriteResult>
```

`AssetWriteResult` always has `written` and `skipped`. Its FS branch also has `notWritten` and optional `failed`. Its media branch has `media: ImportedMediaView[]`, its Library branch `documents: unknown[]`, and its theme branch `status: unknown` and `errors: unknown`. Do not synthesize FS fields for other branches.

**Behavior.** Narrow `kind` with an explicit predicate or switch before indexing permissions. Preserve scope exactly at `:45–54`, including the picked `fs-root` scope, Library’s media scope, and the theme’s specific ID. Validate and authorize before source reads. Keep the existing case-insensitive in-batch reservation, on-disk collision check, 1,000-probe rename bound, and same errors and order for skip and overwrite. Keep the separate per-theme check on every output, and media basename and type checks. Prepare the full batch before any effect. If `approvalBatch` returns no batch, return the prepared object without a `batch` key. Use the prepared bytes, order, and paths at execution. Preserve FS partial failures, one reload for a nonempty theme write, and sequential media and Library writes. In the media case preserve `sourceUrl` on the result but do not invent upload provenance for copy/transform. The old asset-to-media path does not request video conversion. Preserve the existing empty-input and skipped-output behavior of each caller.

**Importers.** `F/asset-transfer/{copy-tool.ts:14,asset-sources.ts:14}`, `F/image-transform/tool.ts:11`, `F/fs-files/__tests__/asset-tool-fixture.ts:17`, `C/asset-tool-host.ts:5`. J21 uses the new CMS entry, and J22 uses the injected kit. T18 handles all remaining consumers.

**Tests first.** `packages/cms/src/asset-transfer/__tests__/asset-destinations.test.ts` — “destination permission binds the correct entity,” “preparation never writes and preserves the picked-folder batch,” “rename observes disk and case-folded in-batch reservations,” and “site execution returns the first failure and remaining paths.” Mutations `authorize-picked-as-site`, `write-during-prepare`, `ignore-batch-collision`, and `drop-partial-failure`.

**Release.** Exact core and CMS exports above. `.changeset/website-asset-destinations.md` (`core`, `cms` minor). Baselines `jini-ai__core.json` and `jini-ai__cms.json`.

## J21 — Files copy registrar and archive injection · BUILDER: SOL · OPUS-REVIEW

**Move** `F/asset-transfer/copy-tool.ts:26–174` to `cms:asset-transfer/copy-tool` (`node`). Requires J19–J20 and W1 J01/J12. Keep `:20–24` in T18. Keep file ownership and the guarded listing in `F/asset-transfer/asset-sources.ts:22–63` and `F/fs-files/fs-files.ts:191,219`. A file-copy recipe must not be able to choose the site base, widen the list limit, or opt out of archive admission.

**Signatures and deps.**

```ts
buildFilesCopyAgentToolCatalog(
  required: { sourceSchema: AssetSourceSchema; fsReadPermission: string },
  _optional: Empty = {},
): AgentToolDefinition[]

buildFilesCopyRegistrations<Theme extends AssetTheme>(
  required: {
    deps: FilesCopyToolDeps<Theme>;
    surfaces: HumanConfirmSurfaceDeps;
    catalog: readonly AgentToolDefinition[];
    approval: AssetBatchApproval;
  },
  _optional: Empty = {},
): ToolRegistration[]

contributeFilesCopyTools<D, Theme extends AssetTheme>(
  required: {
    catalog: readonly AgentToolDefinition[];
    approval: AssetBatchApproval;
    bindDeps: (required: { deps: D }, optional?: Empty) => FilesCopyToolDeps<Theme>;
  },
  _optional: Empty = {},
): ToolContributor<D, AssistantSurfaceDeps>
```

`AssetSourceSchema` describes the existing `F/asset-transfer/asset-sources.ts:16–20` literal structurally, including readonly `properties.root.enum: readonly string[]`. It is a type in J20’s shared core contract. Keep the actual root list and descriptions in Tovu. `AssetBatchApproval` holds `approvalToolHandler: ReturnType<typeof createHumanConfirmationKit>["approvalToolHandler"]` and `describeWriteBatch({ batch: PreparedAssetBatch<Buffer>, toolId: string }) → HumanConfirmSpec`. Export the type from this same CMS subpath for J22’s type-only import. The copy deps are:

- `destination: AssetDestinationDeps<Theme>`.
- `source.readAsset({ ctx, input: unknown, maxBytes }) → Promise<AssetFile<Buffer>>`, `source.resolveFolder({ ctx, source: Record<string, unknown> }) → Promise<{ rootPath: string; relativePath: string }>`, `source.list({ rootPath, relativePath }) → { files: readonly string[]; truncated: boolean }`, `source.readFile({ rootPath, relativePath, maxBytes }) → Promise<Buffer>`, and `source.fetchUrl({ url, media: boolean, maxBytes }) → Promise<{ bytes: Uint8Array; url: URL }>`. The last callback applies the J19 safe refusal wrapper in T18.
- `documentArchiveReader: DocumentArchiveReaderPort` is **required**. `documents.maxBytes` and `documents.validate({ filename, bytes }, { archiveReader }) → Promise<unknown>` come from the existing document owner. The same reader instance also reaches the Library saver through `destination.library`. No `yauzl`, agent-plugins, or unguarded fetch reference in CMS.
- `isFsShapeRejection`, `isDocumentShapeRejection`, `isThemeShapeRejection`, and `isImportShapeRejection` each take `{ error: unknown }`. T18 binds the same classes and predicates as `:53–55`. Do not convert a source/storage fault into input advice just because it is an `Error`.

Move `FILES_COPY_LIMITS`, `filesCopyDerivedRisk`, the exact catalog wording and schema, and all orchestration. Retain the destination `picked` refusal even for direct handler calls. Keep URL-to-Library refusal, no URL glob, site/theme prefixes, native `matchesGlob` over the bounded listing, and local per-entry guarded reads after listing. Preserve the `maxFiles: 50`, `maxFileBytes: 10_000_000`, `maxTotalBytes: 25 * 1024 * 1024` rules and the existing Library exception using the document cap for both a single file and the aggregate. Validate every Library item before saving any. Keep folder flattening for Library only, the original overflow and deny messages, and the `applied` and `failed` behavior. For `overwrite`, narrow with an explicit switch or predicate before constructing `OverwritePolicy`, with the same default `"skip"` and refusal text. Keep one card for a prepared site batch, no card when no write is prepared, and use the J01 builder’s branded handler directly. Keep `catalogModule` a diagnostic reference to this Jini subpath.

**Importers.** T18 repoints `A/__tests__/tool-registrations.contracts.test.ts:99`, `F/{fs-files/__tests__/copy-library.test.ts:6,20,fs-files/__tests__/copy-tool.test.ts:8,14,26,157–163,media/__tests__/library-save-text.test.ts:10}`, and `C/tool-catalog-manifest.ts:109,558`. J22 uses only the shared approval type, not this registrar at runtime.

**Tests first.** `packages/cms/src/asset-transfer/__tests__/copy-tool.test.ts` — “a denied destination never calls the source port,” “a truncated glob cannot prepare a batch,” “a refused later document prevents the first save,” and “a site writer receives only the approved batch.” Mutations `read-before-destination-check`, `accept-truncated-glob`, `save-documents-during-preflight`, and `skip-site-approval`.

**Release.** Exact CMS export above. `.changeset/website-files-copy.md` (`cms` minor). Baseline `jini-ai__cms.json`.

## J22 — Image transform registrar · BUILDER: SOL · OPUS-REVIEW

**Move** `F/image-transform/tool.ts:15–92` to `cms:media/site-transform/tool` (`node`). Requires J19–J21 and W1 J01/J12. Use `image-ops.ts` from the same CMS media domain. Do not import the host reader, theme implementation, platform error constructors, or FS registrar. Use the J20 `AssetDestinationKit` injected by T18, with a type-only import. Keep the source wiring in the host.

```ts
buildImageTransformAgentToolCatalog(
  required: { sourceSchema: AssetSourceSchema; fsReadPermission: string },
  _optional: Empty = {},
): AgentToolDefinition[]

buildImageTransformRegistrations<Theme extends AssetTheme>(
  required: {
    deps: ImageTransformToolDeps<Theme>;
    surfaces: HumanConfirmSurfaceDeps;
    catalog: readonly AgentToolDefinition[];
    approval: AssetBatchApproval;
    destinationKit: AssetDestinationKit;
  },
  _optional: Empty = {},
): ToolRegistration[]

contributeImageTransformTools<D, Theme extends AssetTheme>(
  required: {
    catalog: readonly AgentToolDefinition[];
    approval: AssetBatchApproval;
    destinationKit: AssetDestinationKit;
    bindDeps: (required: { deps: D }, optional?: Empty) => ImageTransformToolDeps<Theme>;
  },
  _optional: Empty = {},
): ToolContributor<D, AssistantSurfaceDeps>
```

`ImageTransformToolDeps<Theme>` has `destination: AssetDestinationDeps<Theme>`, `source: Pick<FilesCopyToolDeps<Theme>["source"], "readAsset">`, required `imageCodec: ImageCodecPort` from core, and the FS, theme and import refusal predicates from J21. Do not add the copy-specific document predicate to transform. Export `IMAGE_TRANSFORM_TOOL_ID` and `imageTransformDerivedRisk` unchanged. Keep description, permissions, source/destination schema, recipes and limits. Use `refuseUnexpectedKeys` from J01.

**Approval witness.** With no outputs, read and inspect, return `applied: false`, and never resolve or prepare a destination. Otherwise normalize outputs, authorize the destination, read the bounded source, inspect/render all outputs, then prepare exactly one batch. Use that `PreparedAssets<Buffer>` in both the description and run callbacks. Site and picked writes must ask via the current card with the current tool ID. A missing channel or decline does not write. No reread, rerender, or rebuild of the batch after the click. Theme writes still validate, use the injected writer and reload once, without a file-batch card. Keep media destination validation, including refusal of unsupported ICO bytes. Return the unchanged rendered metadata and merge the writer response. Use a checked `"failed" in outcome` test instead of the source’s cast to `{ failed?: unknown }`. No `imageCodec` fallback even in fixtures that execute this tool.

**Importers.** `A/{tool-registrations.ts:179,__tests__/tool-registrations.contracts.test.ts:100}`, `F/image-transform/__tests__/tool.test.ts:11,20,29`, `C/tool-catalog-manifest.ts:146,564`. T18 covers each. Keep the README’s theme and guarded-writer rationale, with the new source locations.

**Tests first.** `packages/cms/src/media/site-transform/__tests__/tool.test.ts` — “inspect never calls the destination kit,” “the site and picked card describes the exact rendered bytes later written,” and “a declined picked batch never calls the writer.” Mutations `prepare-destination-on-inspect`, `render-again-after-confirm`, and `skip-picked-approval`.

**Release.** Exact CMS export above. `.changeset/website-image-transform.md` (`cms` minor). Baseline `jini-ai__cms.json`.

## T18 — Bind and cut over media import, asset destinations, copy, and transform · BUILDER: SOL · OPUS-REVIEW

Requires J19–J22 and W1 T01/T11. Delete the four original source files only after all bindings and importer edits in this sheet are in place.

**Media bindings.** Add `F/media-import/ingress-host.ts` for `resolveLocalImportRequest({ routeDeps: SiteFileRequestDeps, root, relativePath }, _optional = {})`, `bindMediaImportRefusals({ log? }, _optional = {})`, and `MediaImportIngressHostDeps`. The type is `SiteFileRequestDeps` plus the current required `mediaImportHttpClient` and optional `outboundTestOrigins`, `mediaImportEgressRefusalLog`, and `mediaImportLocalMaxBytes`. Move the resolver’s exact fallback sentence from the old `:214–224`. Keep `FsFilePathError` unchanged and translate other resolver failures to the package’s `MediaImportValidationError` as before. `bindMediaImportRefusals` uses the actual host `EgressRefusedError` and creates a fresh same-class error from `callerSafeMessage`. The optional logger still defaults to host `console.warn`. Never fall back to `.message` for the caller.

Add `F/media-import/tool-host.ts` for the bound `mediaImportAgentToolCatalog`, `MediaImportHostDeps`, `bindImportedMediaStorage({ deps, resolvePublicUrls }, { videoImport } = {})`, and `bindMediaImportToolDeps({ deps, resolvePublicUrls }, { videoImport } = {})`. Keep the catalog at the old `:56` values and source `FS_ROOT_IDS`, picker text, and `"content_read.media_asset"` from the current owners. Define the host deps from ingress plus the existing auth, tracker/codec, clock/ID, replacement/media/blob/rendition stores, content-type store, and transform repo fields at `:63–98`. Do not push a new contract into process-wide route deps.

- `bindImportedMediaStorage` closes over the current stores. Bind `upload` to `createConvertingUploader` at `F/media/import-video-conversion.ts:141`, with original `UPLOAD_CAPS` and optional `videoImport`. Existing asset callers omit `videoImport`. `recordContentType` delegates to the same `set`, and the URL callback calls the supplied `resolveMediaPublicUrls({ deps, assets })`. `bindMediaImportToolDeps` adapts the existing authorization, passes the optional codec/tracker only if present, and binds `replacement` to the same `findById`, dual capability check, and `replaceMediaFile` with caps, optional probe, and original signal. Do not turn replace into a converting upload.
- Remote import uses `F/media-import/fetch-image.ts:155` with the existing `mediaImportHttpClient`, the same test-origin allowlist if present, and the existing default media policy. Do not substitute the generation client or raw `fetch`. Local resolution at `F/fs-files/site-file-request.ts:71` and reads at `F/fs-files/fs-files.ts:219` retain the selected root, denied names, and bounded read. Compute `ceiling = uploadLimitForFile({ name: relativePath, type: "" })` and `Math.min(deps.mediaImportLocalMaxBytes ?? ceiling, ceiling)`. Keep binary/MIME verification and configured media/video caps in their owners. Pass `outboundTestOrigins` and the codec probe conditionally, not as absent-valued optionals.

**Asset bindings.** Refactor `C/asset-tool-host.ts:5,11–28` into real host adapters. Keep `AssetSourceDeps` in `F/asset-transfer/asset-sources.ts`, with `FsFilesToolDeps`, `ThemeToolDeps`, `mediaRepo`, `assetBlobRepo`, and `blobStore` as used by `:25–62`. The source uses existing `findThemeOrThrow`, `sniffThemeImportType`, `resolvePickedFolder`, guarded FS, and original media readers under the current authorization. Keep `ASSET_SOURCE_SCHEMA` in that file. Do not import composition from this feature. Point its FS read permission directly to W1 `@jini-ai/cms/fs-files/agent-tools`.

- `bindAssetDestinationDeps({ deps: AssetHostDeps }, { archiveReader } = {}) → AssetDestinationDeps<DiscoveredTheme>`. `AssetHostDeps` is the host union of required collaborators, expressed as intersections of the source, media persistence, and theme/Library slices. Replace `resolveImportedMediaUrls` on the host bag with a bound callback to the existing `resolveMediaPublicUrls`; a test override belongs on the binder’s options if needed. Bind permission values to current custom-root manage, theme edit, and media upload values. Use the real `resolveFsFilePath` for `inspectWriteTarget`, site preparation, and `writePreparedFiles`. Use `preparePickedFolderBatch` and `describeWriteBatch` from `F/fs-files/tool-registrations.ts:121,142`. Inject `nextAvailableFileName` from the existing CMS theme filename owner. Keep `assertThemeFileWritable` plus `resolveThemeFilePath` with `themesDir` in the existing `checkThemeWrite` binding. Use the same writer, roster and reload and the same `saveLibraryDocument`.
- `bindFilesCopyDeps({ deps: AssetHostDeps, documentArchiveReader }, _optional = {}) → FilesCopyToolDeps<DiscoveredTheme>` supplies the source functions, archive validator, and shape predicates. Keep `createDocumentArchiveReader({ yauzl, createArchiveReader: createYauzlAgentPluginArchiveReader })` in composition. Reuse the existing narrow SDK interop adapter only there. Use one reader instance per copy binding for both preflight and save. Keep copy’s media URL policy as `{ ...MEDIA_IMPORT_POLICY, maxBytes: FILES_COPY_LIMITS.maxFileBytes }`, and theme/non-media URL policy and `Accept` from `THEME_IMPORT_POLICY` / `THEME_IMPORT_ACCEPT`. Bind the J19 refusal wrapper with `toolId: "files_copy"`. The repointed cap test must continue exercising the actual injected policy and header, not just compare literals.
- `bindImageTransformDeps({ deps: AssetHostDeps & { imageCodec: ImageCodecPort } }, _optional = {}) → ImageTransformToolDeps<DiscoveredTheme>` shares destination and source adapters, without injecting a fake archive reader. Bind the required codec from the existing route deps. Bind both asset catalogs with `ASSET_SOURCE_SCHEMA` and W1’s canonical FS read permission. Expose the bound catalogs from the real asset composition binding for catalog-only callers. Supply the three J20 functions as the destination kit and W1 T01’s real `approvalToolHandler`. Adapt `describeWriteBatch({ batch, toolId })` to the existing `describeWriteBatch(batch, { toolId })`. Bind runtime deps lazily where needed so metadata-only catalog construction does not read a folder, open a store/archive, or require a live codec call.

**Importer repoints.** These paths are from `git grep`, including relative and dynamic imports.

| Current importer | Repoint or change |
|---|---|
| `C/tool-catalog-manifest.ts:109,110,146,148,151,558,564,568` | Bind the three contributors at their current positions. Keep the import contributor’s original `mediaConversionPorts` and `operatorLogVideoNote` sink. Use the existing composition registry, not new module-side registration. |
| `A/tool-registrations.ts:87,179,182` | Use `MediaImportHostDeps` at the registry boundary. Replace the old image registrar indexed type with `{ imageCodec: ImageCodecPort }` from core, preserving requiredness. |
| `C/content-target-inputs.ts:13`; `A/__tests__/{media-import-search-discoverability.test.ts:9,owner-chat-tool-inputs.unit.test.ts:6,tool-registrations.contracts.test.ts:114}`; `F/media/__tests__/large-upload-routing.test.ts:5` | Import the bound media catalog from `F/media-import/tool-host.ts`. No second catalog projection for content targeting. |
| `A/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts:18,80`; `F/media-import/__tests__/{import-local-file.test.ts:23,39,60,224,import-video-conversion-wiring.test.ts:13,53,replace-file.test.ts:13,41,tool-registrations.test.ts:32,56,480}`; `F/media/__tests__/media-producing-previews.test.ts:20,61` | Builders, contributors, risk, and refusal wrapper go directly to Jini. Supply the real host binder against the existing fixture deps, including video ports where already supplied. Catalog/type imports go to the host owner. Bind the logger and classifier in the standalone refusal test. |
| `F/theme/import-theme-file-tool.ts:11,38,104,125–130` | Use the narrow `MediaImportIngressHostDeps` fields, the relocated host root resolver, and J19’s predicate/wrapper with `bindMediaImportRefusals`. Do not move or alter theme publication, original cap/accept, signal, or reload rules. |
| `F/media-generation/__tests__/tool-registrations.test.ts:35,883–886,903–907` | Call the J19 `persistImportedMedia` directly with `storage: bindImportedMediaStorage(...)` and the same per-fixture URL resolver and actor. Drop the old media-import bag cast. T19 handles this file’s separate generation wiring. |
| `F/asset-transfer/asset-sources.ts:10,14,25,36,51`; `C/asset-tool-host.ts:5,11–28`; `F/fs-files/__tests__/asset-tool-fixture.ts:17,19,25–26,50–62` | Replace old `AssetToolDeps` / `AssetHostPort` references with the source slice, new core contracts, or the typed CMS destination/registrar input as appropriate. Give the fixture its real host deps and opened exchange. Build copy and transform using the actual binders. Do not cast the theme or exchange to make a split work. |
| `A/__tests__/tool-registrations.contracts.test.ts:99–100`; `F/media/__tests__/library-save-text.test.ts:10` | Use the one bound host projection per asset tool. |
| `F/fs-files/__tests__/copy-tool.test.ts:8,14,26,157–163`; `F/fs-files/__tests__/copy-library.test.ts:6,20`; `F/image-transform/__tests__/tool.test.ts:11,20,29` | Use the public Jini builders/risk/ID exports and pass real host catalogs, approval, and source/destination binders. Preserve the test archive-reader seam for Library fixtures and the actual Sharp codec for transform. A catalog-only check can construct a contribution but must not supply a no-op production port. |

The four old files’ internal edges become the Jini imports or ports in J19–J22. Refresh live path references in `F/{asset-transfer/README.md,image-transform/README.md,media/README.md}`, and clean obsolete edges for these four paths in root `development/scripts/check-architecture.baseline.json` and the expired copy→document-archive allowance in `.dependency-cruiser.mjs:714`. Repoint the live source-location records in root `development/parity/tool-guides.json:1805,1990` to their new owners. Historical reports are not importers. Do not add a broad architecture exemption.

**Tests first.** Preserve the existing real-delegated `BAD_REQUEST`/internal-error egress tests and add “the same guarded refusal remains caller-safe for copy and theme,” mutation `bind-full-egress-message`. In `import-video-conversion-wiring.test.ts`, pin “only the intended imports use configured conversion,” mutation `drop-host-conversion`. In `copy-library.test.ts`, pin “one host archive reader validates the whole batch and is passed to save,” mutation `omit-archive-reader-at-save`. In `image-transform/__tests__/tool.test.ts`, retain the real site/picked approval and theme reload witnesses, mutation `bind-new-exchange-store`. No package/API changes.

## J23 — Media generation execution · BUILDER: SOL · OPUS-REVIEW

**Move** `F/media-generation/tool-registrations.ts:227–308,331–508` and the saved-first control flow at `:180–205` to `cms:media/site-generation/tool-registrations` (`node`). Requires J19’s storage port. Move host-only dependencies from `:8–19,25–41,86–178,195–204,319–329` to T19 as bindings. J14/T13 is adjacent, but do not reuse credential-card save or provider listing as the generation dispatcher.

Extend `core:contracts/site/media-tool-ports` with vendor-neutral generation types:

```ts
interface ImageGenerationCredential {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}
interface GeneratedImageBytes {
  readonly bytes: Uint8Array;
  readonly providerId: string;
  readonly usedStubFallback: boolean;
}
interface ImageGenerationPorts {
  readSavedSelections(
    required: { workspaceId: string }, optional?: Empty,
  ): Promise<Readonly<Record<string, {
    apiKeyConfigured?: boolean;
    model?: string;
  }>>>;
  readSavedCredential(
    required: { workspaceId: string; providerId: string }, optional?: Empty,
  ): Promise<ImageGenerationCredential | null>;
  readEnvCredential(
    required: { providerId: string }, optional?: Empty,
  ): ImageGenerationCredential | null;
  generateImage(
    required: {
      model: string;
      prompt: string;
      providerId: string;
      credentials: ImageGenerationCredential;
      allowStubFallback: boolean;
    },
    optional: { signal: AbortSignal },
  ): Promise<GeneratedImageBytes>;
}
```

In CMS, define `MediaGenerationToolDeps` as `workspaceId`, adapted `authorize`, `storage: MediaToolStoragePorts`, `providers: ImageGenerationPorts`, optional tracker/codec, `findModel({ id }) → { provider: string } | undefined`, and `missingCredential({ providerId }) → { generated: false; message: string; credentialSetup: ToolFailureDiagnostic }`. The diagnostic type is from core `contracts/site/daemon-tool-recovery`. Use the exact issued diagnostic returned by the host. Never clone or fabricate it. Define `MediaGenerationCatalogInput = { imageModelIds: readonly string[]; defaultModelId: string; mediaAssetReadToolId: string }`.

```ts
buildMediaGenerationRegistrations(
  required: { deps: MediaGenerationToolDeps; catalogInput: MediaGenerationCatalogInput },
  _optional: Empty = {},
): ToolRegistration[]

contributeMediaGenerationTools<D>(
  required: {
    bind: (required: { deps: D }, optional?: Empty) => {
      deps: MediaGenerationToolDeps;
      catalogInput: MediaGenerationCatalogInput;
    };
  },
  _optional: Empty = {},
): ToolContributor<D, unknown>
```

**Execution.** Use the same `imageModelIds` for the existing catalog builder and explicit-model validation. Reject an explicit unsupported ID before credential reads or dispatch. For an omitted model, read the saved selection map once. In that ordered enum, first use the saved model for a configured provider if it still matches. Otherwise walk the IDs in order, checking one credential per distinct provider during the scan. Fall back to the injected `defaultModelId` only if the scan finds none. Resolve the selected provider fresh for execution, as the original does. Do not memoize credentials across those steps or across runs. Handle the lookup with a verified model entry before using `.provider`; no non-null assertion or empty provider key.

```ts
const saved = await providers.readSavedCredential({ workspaceId, providerId }, {});
return saved === null
  ? providers.readEnvCredential({ providerId }, {})
  : saved;
```

No `catch` or “truthy apiKey” fallback on the saved result. A keyless row can be `null` from the host store, but an unreadable saved key is a failure and must not reach env or another provider. Keep `media.upload` before any read or dispatch, `allowStubFallback` default `false`, and the non-decorated missing-credential result when the option was not requested. `MediaGenerationValidationError` remains the only schema-decorated rejection in this block.

Fence `ctx.signal` after credentials, immediately before dispatch, and again immediately before the first storage write when generation returns. Pass the signal through the required dispatch option. Do not interrupt an upload transaction after it has started. Preserve `.png` title derivation, fixed initial MIME guess, real sniff and content-type recording, acting principal, optional editorial fields, tracker, public URL, and best-effort preview. Preserve `GeneratedMediaView`, the top-level `model` and actual `provider`, and `media.placeholder` on both real and placeholder results. Stored provenance is `{ kind: "generated", model, provider: generated.providerId }` for real generation and only `{ kind: "generated" }` for the placeholder, even though the response reports the requested model and dispatched provider. Do not turn the prompt into a description. Split default selection, request execution, and result projection to stay within both complexity bounds.

**Importers.** T19 repoints `A/tool-registrations.ts:86,181`, `C/tool-catalog-manifest.ts:149,566`, `F/media-generation/__tests__/{providers-tools.test.ts:18,230,tool-registrations.test.ts:36,76,866}`, and `F/media/__tests__/media-producing-previews.test.ts:19,60`. No runtime `@jini-ai/integrations` or environment read inside CMS.

**Tests first.** `packages/cms/src/media/site-generation/__tests__/tool-registrations.test.ts` — “saved credential errors never reach env or dispatch,” “explicit validation and the published enum use one ordered catalog,” “a late generator result after Stop never writes,” and “stub provenance credits no model or provider.” Mutations `env-after-saved-open-error`, `validate-against-builtins`, `drop-post-dispatch-abort`, and `credit-stub-as-real`.

**Release.** Add exact CMS `./media/site-generation/tool-registrations` export. Update the existing core `./contracts/site/media-tool-ports` declaration surface without a duplicate key. `.changeset/website-media-generation-execution.md` (`core`, `cms` minor). Baselines `jini-ai__core.json` and `jini-ai__cms.json`.

## T19 — Bind live generation, credentials, egress and storage · BUILDER: SOL · OPUS-REVIEW

Requires J23 and T18. Add `F/media-generation/generation-host.ts`, a real host binding. Move the production dispatch code at old `:159–178`, credential access at `:195–204,228–232`, credential setup copy and issuance at `:319–329,466–468`, and storage wiring at `:363–385` into that binding. Delete old `F/media-generation/tool-registrations.ts`.

- Define `MediaGenerationHostDeps` from the existing `:86–139` fields. Preserve required `mediaProviderRegistry` at the assistant-registry boundary. Keep the optional `generateMedia` fixture seam with its current `MediaGenerationRequest`, `ProviderCredentials`, registry and client options, and optional signal. Keep `env?: NodeJS.ProcessEnv` for fixture injection. Export `bindMediaGenerationTool({ deps: MediaGenerationHostDeps, resolvePublicUrls }, _optional = {}) → { deps: MediaGenerationToolDeps; catalogInput: MediaGenerationCatalogInput }`. Use `imageModelIdsFrom({ catalog: deps.mediaProviderRegistry })` for live catalog construction, `"gpt-image-2"` as the existing last resort, and `"content_read.media_asset"` as the existing guidance ID. Bind lookup, provider label, execution, and validation to that **same** registry.
- Preserve the deliberately separate metadata-only path from old `:443–448`. Use a host helper `mediaGenerationCatalogInput({ registry }, _optional = {})` accepting optional `registry`. It returns built-in `IMAGE_MODEL_IDS` only when the host is projecting metadata without the registry. The metadata test builds the actual Jini descriptor with that input and explicit fail-if-called execution ports or a fixture binder, not a cast that makes a bare object a live runtime. No built-in dispatch fallback in production.
- `readSavedSelections` uses `getMediaProviderCredentials` with the current workspace. Return only `model` and `apiKeyConfigured` per provider across the port. `readSavedCredential` uses `resolveMediaProviderCredential` with the existing repo and sealer and returns `null` or `{ apiKey: saved.apiKey, ...(saved.baseUrl ? { baseUrl: saved.baseUrl } : {}) }`. Let the current typed storage/decrypt error escape. Do not remap canonical or persisted IDs. Env reads use `deps.env ?? process.env`, `MEDIA_PROVIDER_ENV_VARS`, and `MEDIA_PROVIDER_ALIASES` from `F/media-generation/host-media-providers.ts:20–41`. Preserve the canonical `grok` row and its public alias lookup. Do not add an alias row, broaden env candidates, or hand the key, env, or credential metadata to the catalog builder or diagnostic.
- Bind `generateImage` to the existing fixture override or `defaultGenerateMedia`. The latter creates a fresh `createMediaDispatchEngine({ registry, httpClient: deps.mediaGenerationHttpClient, guardedFetch: nodeMediaGuardedFetch }, { catalog: registry, credentials: { [providerId]: credentials }, allowStubFallback })`. Pass the signal to the existing `.generate` optional argument. The guard must remain on both vendor requests and provider-returned asset downloads. No engine singleton with a captured key and no fallback transport.
- Bind storage’s `upload` to existing **nonconverting** `uploadMedia` with `UPLOAD_CAPS` and the existing clock, ID, media/blob/rendition repos and blob store. Bind content-type write and `resolveMediaPublicUrls` over the same current workspace. Do not wire J19’s converting uploader here. Drop the unused `MAX_DOCUMENT_BYTES as TOVU_MAX_UPLOAD_BYTES` import, not the actual caps. Bind `missingCredential` to original `buildNoCredentialError` text and `issueCredentialSetup({ setupToolId: "credential_save", prefill: { kind: "media-provider", target: providerId } }, {})`. Keep the issued object intact and keep provider-label and env-candidate copy exactly as in the host source.

**Importer repoints.**

- `C/tool-catalog-manifest.ts:149,566` registers J23’s contribution with `bindMediaGenerationTool({ deps, resolvePublicUrls: resolveMediaPublicUrls })` at the same position. `A/tool-registrations.ts:86,181` uses `MediaGenerationHostDeps`, not the CMS execution deps. Production clients stay as assembled in `C/site-deps/assembly-phases.ts:233` and the in-memory root at `C/memory-deps/route-deps/publish-export.ts:229`.
- `F/media-generation/__tests__/providers-tools.test.ts:18,230` uses the Jini builder plus the real generation host binder for the saved-key readback. Keep the independent T13 provider-tool cutover. `F/media-generation/__tests__/tool-registrations.test.ts:36,76,866,876` uses the Jini builder/contributor and host fixture type plus the explicit metadata-only path. Keep fixture overrides and the J19 import parity bindings from T18.
- `F/media/__tests__/media-producing-previews.test.ts:19,60` binds existing deps through the same host adapter before calling the Jini builder. Update live source-location text at `F/media/INFO.md:123` and root `development/parity/tool-guides.json:2069`. Remove obsolete baseline edges for the deleted registrar, with no new allowlist exemption.

**Tests first.** Keep the existing generation suite’s unreadable-saved-key, saved-model, plugin catalog, setup-branding, guarded provider asset download, storage, provenance and abort cases. Add “the provider alias resolves the same persisted key used by the provider tool” in `providers-tools.test.ts`, mutation `use-alias-as-vault-id`, and “an admitted late result does not write after Stop” in `tool-registrations.test.ts`, mutation `drop-write-boundary-abort`. The guarded download tests must use the real dispatch adapter with the existing controlled transport, mutation `bind-unguarded-download`. No package/API changes.

## J24 — Recovery registration with the real gated ceremony · BUILDER: SOL · OPUS-REVIEW

**Move** `F/recovery/tool-registrations.ts:93–453` to `db:recovery/tool-registrations` (`node`). The host-specific parts at `:57–65,121–124,188–227,283–298,301–328,383,399–406` become injected config and gateway/lock bindings. Existing DB orchestrator, deep-link resolver, list service, degraded banners, disclosure implementation, and restore hooks stay their owners. Depends on W1 J01. Do not add a DB → CMS, daemon, platform, or host runtime edge. Use core permission checking and the host-adapted evaluator.

Add `core:contracts/site/recovery-tool-ports` (`universal`). Reuse `GatewayPlan` from core gated mutations, and `OperationLockHandle`/`AcquireOperationLockResult` from core `contracts/site/recovery-operation-lock`. Use the existing outcome shape `{ ok: true; value: T } | { ok: false; error: { code: string; message?: string } }`.

| Required port | Signature and trust boundary |
|---|---|
| `gateway.plan` | `({ actorId, restorePointId }, _optional?) → Promise<Outcome<GatewayPlan>>`. Actor is the execution principal acting as an agent. The host plans with real restore hooks against that point. |
| `gateway.confirm` | `({ actorId, restorePointId, confirmer: HumanConfirmer, planId, planHash, signal }, _optional?) → Promise<Outcome<{ confirmationToken: string }>>`. `confirmer` is core’s actual approval callback value, with `kind: "user"`. Never derive it from model input. |
| `gateway.execute` | `({ actorId, restorePointId, confirmationToken, signal }, _optional?) → Promise<Outcome<{ restoreRunId: string; state: string; restartRequired?: boolean }>>`. The host gateway redeems as the agent and re-resolves actor identity. |
| `operationLock` | `acquireOperationLock({ deps: { clock }, input: { siteId, operationKind } }, _optional?)`, `releaseOperationLock({ deps: { clock }, input: { siteId, handle } }, _optional?)`, `isOperationInFlight({ siteId }, _optional?)`. Same signatures as `db:recovery/operation-lock:41–44`, with core handle/result types. Status only peeks. |

DB’s `RecoveryToolDeps` carries `workspaceId`, adapted `authorize`, `clock`, `dbOps: Pick<DbOpsPort, "getCapabilities">`, `restorePointsRepo: RestorePointListPort`, `siteStatusRepo: Pick<SiteStatusPort, "get">`, `disclosureWatermarkSource`, `deepLinkRestorePointLookup`, and the two ports above. Keep the host gateway bag, ledger, write-side status, ID generator and migration-run repo out of the DB registrar. `RecoveryToolPolicy` has `catalog: readonly AgentToolDefinition[]`, `disclosureCategories: readonly string[]`, and `capabilityGuidance: { fullSiteBackup: { discoveryTool: string; planTool: string; pushTool: string; guidance: string }; portableExport: { href: string; guidance: string } }`. The host supplies the current strings and categories.

```ts
buildRecoveryRegistrations(
  required: {
    deps: RecoveryToolDeps;
    surfaces: HumanConfirmSurfaceDeps;
    policy: RecoveryToolPolicy;
    humanConfirmedToolHandler:
      ReturnType<typeof createHumanConfirmationKit>["humanConfirmedToolHandler"];
  },
  _optional: Empty = {},
): ToolRegistration[]

contributeRecoveryTools<D>(
  required: {
    bindDeps: (required: { deps: D }, optional?: Empty) => RecoveryToolDeps;
    policy: RecoveryToolPolicy;
    humanConfirmedToolHandler:
      ReturnType<typeof createHumanConfirmationKit>["humanConfirmedToolHandler"];
  },
  _optional: Empty = {},
): ToolContributor<D, AssistantSurfaceDeps>
```

No default `surfaces` and no private store, ID generator, clock or scheduler. Use the branded handler from J01 as the registered handler. Preserve `recoveryDerivedRisk`, the exact six registrations, and `UNWIRED_RECOVERY_TOOL_IDS` containing `backup_create_restore_point`. Keep the collision explanation next to that set. The database domain remains the sole creator under that ID.

**Preserve the ceremony.**

1. Keep the read permission checks and scopes before any status, capability, deep-link or list read. For `backup_plan_restore`, authorize before the cost class can short-circuit, and keep explicit existence validation ahead of planning. Deep-link parsing retains field-specific `ToolInputError`s for both nullable fields and all required types. Keep the display-only status computation, including `watermarkBaselineAvailable: false`.
2. Common planning calls `planRestore` with fresh capabilities and a closure over `gateway.plan`. Compute the disclosure with the host category list. Return the **full** existing plan with disclosure for `backup_plan_restore`. For execution preparation, validate the orchestrator’s `unknown` plan through the core `isRecord({ value })` guard and check `planId` and `planHash` are strings. Keep only that exact pair plus `restorePointId` and optional `createdAt` in the prepared card state. Preserve the danger card’s wording and timestamp, including that there is no new snapshot first. No arbitrary model-supplied plan or token.
3. After a real click, call `confirmRestore` with `disclosureAcknowledged: true`, the human’s identity and the prepared plan pair. The `confirm` adapter passes the signal to the host. Check the returned `unknown` token record with the same record guard and a string field check instead of `as { confirmationToken: string }`. With no successful confirmation, do not reach execute.
4. Call `executeRestore` with `AGENT_TOOL_PRINCIPAL_KIND`, the run’s principal ID, `delegatedByPrincipalId: confirmer.id`, and the confirmed token. Pass the **same prepared restore point** to the host execute port and the real shared lock and clock to the orchestrator. The orchestrator owns acquire before execute, release in `finally`, and timeline deep link. The gateway owns current authorization, token status, actor-class equality, stale-plan handling, and redemption. Preserve the existing error mapping and the `restored: true` envelope. Do not flatten human and agent **roles** even when their IDs have the same string. Do not clear pending migration in the registrar.

Keep planning, card preparation, confirming, executing, status, and capability handlers separate to meet the caps. Use `createdAt === undefined` conditional spread in prepared state. No `as` cast for the reviewed pair or token, and no assertion to make a malformed result executable.

**Importers.** T20 repoints `A/{tool-registrations.ts:62,162,__tests__/tool-registrations.contracts.test.ts:78,__tests__/tool-registrations.database-recovery.test.ts:22,35,50}`, `F/recovery/__tests__/unit/{agent-tools.unit.test.ts:4,catalog-pin.unit.test.ts:4,permissions.unit.test.ts:6,112,tool-registrations.deep-link-validation-status.unit.test.ts:8,25–26}`, and `C/tool-catalog-manifest.ts:127,617`.

**Tests first.** `packages/db/src/__tests__/recovery/tool-registrations.test.ts` — “denied plan cannot reach the unavailable-capability branch,” “the card’s point and plan pair reach confirm and execution unchanged,” “the confirmer is human and execute is agent under the shared lock,” and “Recovery never registers restore-point creation.” Mutations `capabilities-before-authorize`, `confirm-different-plan`, `confirm-as-agent`, `execute-outside-shared-lock`, and `wire-duplicate-create`.

**Release.** Exact core export above. Add `./recovery/tool-registrations` explicitly to DB exports so the additive API receives an actual declaration baseline rather than being visible only through existing `./recovery/*`. Keep the wildcard unchanged and inherit `jini.runtime: "node"`. `.changeset/website-recovery-registrations.md` (`core`, `db` minor). Baselines `jini-ai__core.json` and `jini-ai__db.json`.

## T20 — Recovery gateway, lock, and approval cutover · BUILDER: SOL · OPUS-REVIEW

Requires J24 and W1 T01. Add `F/recovery/tool-host.ts` to own the bound catalog, policy, `RecoveryToolHostDeps`, and `bindRecoveryToolDeps({ deps }, _optional = {}) → RecoveryToolDeps`. The host deps keep the existing names at `F/recovery/tool-registrations.ts:78–91`, including `gatedMutations.gatewayDeps`, the full DB ops needed by the hooks, and the current ledger, ID, migration and status stores. Repoint `A/tool-registrations.ts:62,162` to the host type. No change to HTTP routes, authorization wiring, database schema or migrations.

- Move the exact catalog args at `:62–65` into the host binding, including the restore-point tool references and `resolveDeepLinkCitation: "INV-04"`. Move the exact capability guidance at `:399–406` and `["posts_pages", "plugin_table"]` at `:124`. Keep the current `/admin/sites` link and portable archive name on the host, not in DB. Do not import a private route constant to assemble the tool.
- In the binder use `F/recovery/gated-hooks.ts:2–10` and `K/gated-mutations/gateway.ts:171,184,218–end` for all three phases. Build hooks from `workspaceId`, original restore-point repo, DB ops, current ledger/status/migration repos, clock and ID. Use the prepared restore point and `actor: { id: actorId, kind: "agent" }` in **all** phases, including confirm, because that is the effect’s identity and ledger attribution. Call gateway `plan` with the agent kind, `confirm` with `confirmer.id` and `"user"` plus plan pair and signal, and `execute` with the agent kind plus token and signal. Use the existing `toRecoveryResult` around each to retain the error taxonomy. When execute checks delegated identity, the current gateway/hook resolver is authoritative, not a caller field or captured substitute. Do not call `restoreFromArtifact` directly from the registrar or binder.
- Supply the actual `K/operation-lock.ts:5` functions as one port. It is the existing host-lifetime singleton shared with admin restore and migration. Do not instantiate another lock for the tool. Use the J01 kit bound by T01 for confirmation, with `({ surfaces, spec }, {})` at the injected seam. If the T01 host module exposes the positional compatibility adapter to old callers, bind its underlying kit method here. Pass the exact surface bag received by the contributor, including any optional approval extensions. The central registry’s behavior is unchanged. There is no recovery-local fallback.
- `C/tool-catalog-manifest.ts:127,617` registers the Jini contributor with the host binder and policy at the same position. Keep the separate `contributeDatabaseTools` registration. Delete `F/recovery/tool-registrations.ts`. Update live references in `F/{database/tool-registrations.ts:97,deployments/publish-agent-tools.ts:872–873,deployments/tool-registrations.ts:37}` and remove the obsolete recovery registrar edge in root `development/scripts/check-architecture.baseline.json:95`.

**Test importer repoints.** `A/__tests__/tool-registrations.contracts.test.ts:78` and `F/recovery/__tests__/unit/{agent-tools.unit.test.ts:4,catalog-pin.unit.test.ts:4}` use the bound host catalog. `A/__tests__/tool-registrations.database-recovery.test.ts:22,35,50` uses that catalog plus the Jini contribution and real T20 binder on the fixture’s existing gateway and surfaces. Keep T02’s repository repoints if already landed. `F/recovery/__tests__/unit/{permissions.unit.test.ts:6,112,tool-registrations.deep-link-validation-status.unit.test.ts:8,25–26}` imports the Jini builder and passes explicit surfaces, policy, and bound deps. A read-only fixture can use fail-if-called effect ports, but cannot establish that real restore works. Keep the real-click tests for that witness.

**Tests first.** In `A/__tests__/tool-registrations.database-recovery.test.ts`, retain “applies the selected artifact only after confirmation,” “Stopped restore during confirm authorization saves no token,” “Stopped restore after token save leaves approval unused,” and the Database-to-Recovery single-create workflow. Add “a held migration lock blocks the confirmed restore before redemption, while recovery status reports the held lock.” Exercise a real card on the supplied exchange and the actual shared lock, then assert no token redemption, artifact swap, or success ledger entry on refusal. Mutations `bind-private-recovery-lock`, `bind-private-recovery-surface`, `lose-confirm-abort-signal`, and `restore-different-artifact`. No package/API changes.
