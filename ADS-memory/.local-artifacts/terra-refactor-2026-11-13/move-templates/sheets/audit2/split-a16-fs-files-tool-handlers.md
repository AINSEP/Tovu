# SPLIT-A16: fs-files agent-tool handlers -> `@jini-ai/platform/fs/tools` (templates T-SPLIT + T-MOVE)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`); every cited line read that day. Row `audit2:A16` (3 files, 506 lines): `agent-tools.ts` (195), `site-file-request.ts` (88), `tool-registrations.ts` (223). **Hard precondition: CLASSIFY row 41 (`website/features/fs-files`, MOVE-AFTER) must land first**: these three files import the other six fs-files files (`fs-files.ts`, `layout.ts`, `write-files.ts`, `custom-root-permission.ts`, `custom-root-store.ts`, `native-folder-picker.ts`) through `./`. This sheet is written for the state *after* row 41, with each of those names resolved from Jini leaf files in the same package (`@jini-ai/platform` `fs/`: CLASSIFY-files.tsv:708-710 says `custom-root-store`, `write-files` -> `platform/fs`, `native-folder-picker` -> `desktop-host`/`platform`). If row 41 chose different homes the executor re-reads step 0 and STOPs.

Tier: one Jini slice (Sonnet + Opus review: three authorization sites and a write-approval path) + one Tovu slice. est. executor tokens ≈ 40k (Jini 24k, Tovu 16k). Execute **after wave B merge and row 41**.

## Why this is not a straight move (read first)
Moving the three files as they stand would break COMMON rule 5 in four places. All four are resolvable with ports; nothing is blocked:
1. **Approval primitive is not in Jini.** `tool-registrations.ts:11` imports `approvalToolHandler`, `refuseUnexpectedKeys`, `HumanConfirmSpec` from Tovu `#src/contracts/core/human-confirm` (319 lines, blob `b3496e96…`; `rg -ln "HumanConfirmSpec|approvalToolHandler" /home/user/Jini/packages` prints nothing). It stays in Tovu; the Jini tools take it as a **port** (`ApprovalPort`).
2. **`toolMetadata`** (`tool-registrations.ts:2`, Tovu `contracts/core/tool-metadata/fs-files.ts`, blob `36be162d…`) is product data (risk metadata per tool id): injected as `deps.metadata`.
3. **Daemon default for `surfaces`** (`tool-registrations.ts:7-8,148-149`: `createSurfaceExchangeStore`/`createTimeoutScheduler` from `@jini-ai/daemon`, plus `createSystemClock`/`createRandomUuidGenerator` from `platform/system`): platform may not import daemon. In Jini the `surfaces` argument is **required** (no default); Tovu's binding builds the default exactly as today.
4. **`@jini-ai/cms/core`** (`:4`, `requireToolPermission`, `adaptLegacyAuthorize`): both already exist in `@jini-ai/core` (`core/src/tool-permissions.ts:75,87`), so the Jini file imports them from core: a pure import swap, no behaviour change. Same for `ToolInputError, buildDomainRegistrations, indexCatalogById, optional*, require*, withSchemaOnRejection` (all `core/src/registration-kit.ts`).

## Guards (blobs at integ/wave-b)
```
tovu_files (move, then delete or reduce):
  - apps/website/src/features/fs-files/agent-tools.ts | blob 4184b877087c02800f818ce940523c82a2790e7c
  - apps/website/src/features/fs-files/site-file-request.ts | blob 31d5c02954688d5ce2fc24dc4b574ff1cc9fff85
  - apps/website/src/features/fs-files/tool-registrations.ts | blob 610c38433b104eacb759965fa6a606398f442f57   (reduce to the Tovu binding)
tovu_tests (move or adapt):
  - apps/website/src/features/fs-files/__tests__/site-file-request.unit.test.ts | blob 3c1e202f84926441ca19f9aed3fbd1a91addeb75
  - apps/website/src/features/fs-files/__tests__/tool-registrations.test.ts | blob 038fa67a7d0a143d6711f4b96ea2e533e5d4f48f
  - apps/website/src/features/fs-files/__tests__/wiring.integration.test.ts | blob de921c5e3920bbc745f462960358a76dd8228fc3   (STAYS: composition proof)
  - apps/website/src/features/fs-files/__tests__/site-folder-delegation.integration.test.ts | blob a71ec225818e573980a6524a41e2dffd525005a9   (STAYS)
tovu_edited (stay):
  - apps/website/src/contracts/core/human-confirm.ts | blob b3496e96e15659cf973720c0681b31a0b1ca2ac8   (not edited)
  - apps/website/src/contracts/core/tool-metadata/fs-files.ts | blob 36be162de9c573748810b7b4f8e0360a8278bca0   (not edited)
  - apps/website/src/features/fs-files/{layout,fs-files,write-files,custom-root-permission}.ts | blobs 8b894c57…, bbdaf7da…, 1604af17…, c4f77182…   (row 41's files: STATE AT STEP 0 DECIDES; these are the pre-row-41 blobs)
```
Importer census (rg 2026-11-16; every hit repointed in the Tovu commit): `routes/fs-files/custom-root.ts:7` (`FS_FILES_READ_PERMISSION`); `assistant/__tests__/tool-registrations.contracts.test.ts:41` (`getFsFilesAgentToolCatalog`); `assistant/__tests__/tool-input-chat-regressions.test.ts:12` (`buildFsFilesRegistrations`); `features/skills/__tests__/unit/tool-registrations.unit.test.ts:384` (dynamic `import("../../../fs-files/tool-registrations.js")`, `buildFsFilesRegistrations`); `features/media-import/agent-tools.ts:4` (`FS_FOLDER_READ_RECOVERY`); `features/media-import/tool-registrations.ts:27` (`resolveSiteFileRequest`); `features/asset-transfer/copy-tool.ts:17,20` (`FS_FILES_READ_PERMISSION`, `describeWriteBatch`); `asset-sources.ts:12,15` (`FS_FILES_READ_PERMISSION`, `resolvePickedFolder`); `asset-destinations.ts:18` (`preparePickedFolderBatch`, types `FsFilesToolDeps`, `PreparedWriteBatch`); `features/image-transform/tool.ts:6,9` (`FS_FILES_READ_PERMISSION`, `describeWriteBatch`: **A08 defers this file; it keeps importing from the moved location here**); `server/runtime/composition/tool-catalog-manifest.ts:92` (`contributeFsFilesTools`); the two row-41 integration tests. The `rg` over `apps` also prints ~70 *other* features' own `./agent-tools.js`/`./tool-registrations.js`: those are different files, not importers.
Dependency on other rows: `asset-transfer` (CLASSIFY 113) and `image-transform` (A08) import `describeWriteBatch`/`resolvePickedFolder`/`preparePickedFolderBatch`; after this sheet they import them from Jini via the Tovu binding *or* directly from `@jini-ai/platform/fs/tools` (decision below).

## Target and legal imports
`@jini-ai/platform` new subpath **`./fs/tools`** (runtime `node`: `node:path`, `node:os` for `homedir`; add `exports` entry + `jini.entries "./fs/tools": "node"` + README line, COMMON 17). Files: `fs/tools/{catalog.ts,site-file-request.ts,registrations.ts,ports.ts,index.ts}`. Imports allowed: own package leaf files (`../layout.js`, `../fs-files.js`, `../write-files.js`, `../custom-root-permission.js`, after row 41), `@jini-ai/core` (root: registration kit + permissions, `@jini-ai/core/contracts/events` for `AuthorizeFn`), `node:*`. Nothing from `daemon`, `cms`, `platform/system` (the clock/uuid factories were only used by the default `surfaces`).

## Contracts (new, `fs/tools/ports.ts`)
```ts
/** The approval-card runner the host owns (Tovu: contracts/core/human-confirm `approvalToolHandler`). */
export interface FsToolApprovalPort {
  handler<TPrepared>(
    required: {
      prepare: (args: { ctx: ToolContext }) => Promise<TPrepared>;
      describe: (args: { prepared: TPrepared }) => FsWriteConfirmCard;
      run: (args: { prepared: TPrepared }) => Promise<Record<string, unknown>>;
    },
    optional?: { flag?: string },
  ): ToolHandler;
  refuseUnexpectedKeys(required: { input: Record<string, unknown>; allowed: readonly string[] }, optional?: Record<string, never>): void;
}
/** Structural twin of Tovu's HumanConfirmSpec for the one card this domain draws. */
export interface FsWriteConfirmCard {
  readonly toolId: string; readonly errorCode: string; readonly title: string;
  readonly details: readonly { label: string; value: string; format?: 'code' }[];
  readonly warning?: string; readonly danger?: boolean; readonly confirmLabel: string;
}
export interface FsFilesToolDeps {            // = Tovu FsFilesToolDeps (tool-registrations.ts:43), unchanged fields
  authorize: AuthorizeFn; workspaceId: string; siteBinding: { readonly dir: string };
  resolveRoots?: () => Record<FsRootId, string | undefined>;
}
export interface FsToolsHost {
  readonly metadata: DomainToolMetadata;      // Tovu: toolMetadata from contracts/core/tool-metadata/fs-files
  readonly approval: FsToolApprovalPort;
}
export function buildFsFilesRegistrations(required: { deps: FsFilesToolDeps; surfaces: AssistantSurfaceDeps; host: FsToolsHost }, optional?: Record<string, never>): ToolRegistration[];
export function contributeFsFilesTools(required: { host: FsToolsHost; surfaces: AssistantSurfaceDeps }, optional?: Record<string, never>): ToolContributor<FsFilesToolDeps, AssistantSurfaceDeps>;
```
`ToolContext`, `ToolHandler`, `ToolRegistration`, `ToolContributor`, `DomainToolMetadata` (the type of `toolMetadata`: read it at `contracts/core/tool-metadata/fs-files.ts` and use the `@jini-ai/core` type it is declared against), `AssistantSurfaceDeps` (**check**: it is imported from `@jini-ai/daemon/surface-exchanges` today; platform may not import daemon. S1 step 0: `rg -n "AssistantSurfaceDeps" /home/user/Jini/packages/core/src`. If it is declared only in daemon, declare the 1-field structural subset the handlers actually use (`surfaceExchanges`) in `ports.ts` and let the host's richer type be assignable; **STOP if it needs more than that**).
**Signature changes (existing exports, all callers converted in the Tovu commit):** `buildFsFilesRegistrations(routeDeps, surfaces?)` becomes `({ deps, surfaces, host })` (rule 10: it was positional with a defaulted second argument); `contributeFsFilesTools()` takes the host. The *Tovu* binding keeps both original signatures (it is the wiring file) and calls Jini; so only the Tovu binding changes its body, importers keep their calls (`tool-catalog-manifest.ts:92` and the two tests call the Tovu binding).
**`describeWriteBatch` / `resolvePickedFolder` / `preparePickedFolderBatch` / `PreparedWriteBatch`** move to Jini `registrations.ts` unchanged except `HumanConfirmSpec` -> `FsWriteConfirmCard` and `kb` -> `formatByteSize` (see overlap with A10: **do not depend on A10**; keep the local `kb`, whose output `"1.5 KB"` differs from every A10 variant, and let A16 report it as a 9th formatter that A10 may fold in later). `describeWriteBatch`'s `{ toolId = FS_WRITE_FILES_TOOL_ID }` option is preserved (`image_transform`/`files_copy` reuse the card).

```
id: SPLIT-A16-1 .. 2
feature: website/features/fs-files tool handlers -> platform/fs/tools
jini_target: platform src/fs/tools/{catalog,site-file-request,registrations,ports,index}.ts ; package.json "./fs/tools"
changeset: @jini-ai/platform: minor | "fs/tools: filesystem agent tools (fs_list_files, fs_read_file, fs_write_files) behind approval and metadata ports"
```

## SPLIT-A16-1 — Jini (commit 1, Opus review: security)
0. Branch rule; blobs; precondition: `ls packages/platform/src/fs/{layout,fs-files,write-files,custom-root-permission}.ts` all exist (row 41 landed) — else STOP "precondition: CLASSIFY-41". `rg -n "fs/tools|FS_LIST_FILES_TOOL_ID" packages/platform/src` prints nothing. Read `core/src/registration-kit.ts` exports used (`ToolInputError`, `buildDomainRegistrations(spec)`, `withSchemaOnRejection`, `optionalBoolean/Number/String`, `requireInputRecord`, `requireString`, `indexCatalogById`) and confirm each is exported from `@jini-ai/core` root; any missing -> STOP (do not copy).
1. Tests first (move, red on the parent = module missing; behaviour is unchanged so they are moves, plus the NEW cases):
   - from `site-file-request.unit.test.ts` (all cases) -> `fs/tools/__tests__/site-file-request.test.ts` (vitest; `node:test` -> vitest mechanical);
   - from `tool-registrations.test.ts` (read/list/write handlers, permission refusal `ForbiddenError`, `repo` refused, `site` selector refused, `custom` unset message, cursor/limit bounds, derived risk map): the Tovu test builds `FsFilesToolDeps` with a fake `authorize`; in Jini it builds the registrations with a fake `FsToolsHost` (`createFakeFsToolsHost`: `metadata` = a minimal valid object, `approval` = a recording fake whose `handler` runs prepare -> describe -> run and records the card). `ForbiddenError` is imported from `@jini-ai/core` if exported there (**verify**: Tovu imports it from `@jini-ai/cms/core`; if core lacks it, the test asserts on the error's `name`/`code` the same `requireToolPermission` throws);
   - NEW (red): (a) `fs_write_files` with an extra key is refused through `host.approval.refuseUnexpectedKeys` **before** any permission check or filesystem access (assert the fake's call order: refuse, then `authorize`, then prepare); (b) `fs_write_files` requires `FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION` while the two read tools require `FS_FILES_READ_PERMISSION` (a fake `authorize` that grants only read denies the write: pins the permission split across the move); (c) `buildFsFilesRegistrations` without `host.approval` fails at construction (required port, no permissive default).
2. Code per Contracts: `catalog.ts` = `agent-tools.ts` with its `./` imports pointing at `../` leaf files (the long `@file` header moves reworded neutral: dates "owner 2026-10-23/10-29/09-10" are the *reason* trail for the site-agent boundary; keep the reason, drop the Tovu-specific names `theme/agent-tools.ts`, `site-evidence/...`); `site-file-request.ts` verbatim with `os.homedir` kept (node leaf; the home expansion rule is the file's own); `registrations.ts` = `tool-registrations.ts` with the four resolutions above, function bodies untouched except: the three `requireToolPermission` calls keep their argument objects; `buildDomainRegistrations({ metadata: host.metadata, … })`; `approvalToolHandler<PreparedWriteBatch>({…},{ flag:"applied" })` becomes `host.approval.handler<PreparedWriteBatch>({…},{ flag:"applied" })`; `refuseUnexpectedKeys(input, ["files"])` becomes `host.approval.refuseUnexpectedKeys({ input, allowed: ["files"] })`. Complexity: `buildFsFilesRegistrations` is ~70 lines today: split into `buildListHandler`, `buildReadHandler`, `buildWriteHandler` (each ≤ 30 lines, complexity ≤ 8) in the move (COMMON 11).
3. Checks: COMMON 2-9; `rg -n -i "tovu|site-chat|apps/|#src|@jini-ai/(cms|daemon)" packages/platform/src/fs/tools` prints nothing; no `console.*`, no `process.env`; eslint; changeset; commit `feat(platform/fs): filesystem agent tools behind approval and metadata ports`.
**Opus review points (security, 5):** (1) `repo` root and `site` selector refusals still precede every filesystem call; (2) the picked-folder read grant (`resolveReadScope`, `externalPicked`) is unchanged byte-for-byte; (3) the write path still calls `requirePickedFolder` with `siteDir` and the approval card is shown before `writePreparedFiles`; (4) permission constants identical (`content.read`, the manage permission); (5) no default `approval`/`surfaces` slipped in.

## SPLIT-A16-2 — Tovu binding (commit 2; after SPLIT-A16-1 is linked)
1. `features/fs-files/tool-registrations.ts` reduces to the wiring (the file Tovu importers keep calling; this is the *binding*, with product content: the metadata import, the `human-confirm` port object, the default `surfaces`):
```ts
import { buildFsFilesRegistrations as buildJini, contributeFsFilesTools as contributeJini, type FsFilesToolDeps } from "@jini-ai/platform/fs/tools";
const host = { metadata: toolMetadata, approval: { handler: approvalToolHandler, refuseUnexpectedKeys: ({ input, allowed }) => refuseUnexpectedKeys(input, allowed) } } satisfies FsToolsHost;
export function buildFsFilesRegistrations(routeDeps: FsFilesToolDeps, surfaces: AssistantSurfaceDeps = defaultSurfaces()): ToolRegistration[] { return buildJini({ deps: routeDeps, surfaces, host }); }
export function contributeFsFilesTools() { return contributeJini({ host, surfaces: defaultSurfaces() }); }
```
(`defaultSurfaces()` = the `createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), default… })` expression moved verbatim from `:148-149`: read the full line, it is cut off here.) It is **not** a forwarder shell: it owns the Tovu default surfaces, the metadata, and the approval adapter. `describeWriteBatch`, `resolvePickedFolder`, `preparePickedFolderBatch`, `PreparedWriteBatch`, `FsFilesToolDeps`, `fsFilesDerivedRisk` are **not re-exported**: their 7 importers (census) import them from `@jini-ai/platform/fs/tools` directly in this commit (rule 19).
2. `git rm` `agent-tools.ts`, `site-file-request.ts`; `FS_FILES_READ_PERMISSION` / `FS_FOLDER_READ_RECOVERY` / catalog importers repoint to `@jini-ai/platform/fs/tools`. `skills/.../tool-registrations.unit.test.ts:384` dynamic import stays on the Tovu binding (it needs the wired registrations).
3. Tests: `site-file-request.unit.test.ts` and the pure parts of `tool-registrations.test.ts` are deleted after their Jini twins exist (report before/after test count; none dropped: `wiring.integration.test.ts` and `site-folder-delegation.integration.test.ts` stay and are the end-to-end proof). `tool-registrations.test.ts` keeps only a 3-case *binding* test: contributor domain id `fs-files`, derived risk map equals `fsFilesDerivedRisk` of Jini, metadata is the Tovu one.
4. Census: `rg -n "fs-files/(agent-tools|site-file-request)" apps` prints nothing; `rg -n "from \"#src/features/fs-files/tool-registrations\"|fs-files/tool-registrations" apps` hits only `tool-catalog-manifest.ts:92`, the two assistant tests, `skills` test and the binding's own test; `apps/website/package.json` already lists `@jini-ai/platform` (check; STOP if not). eslint; commit `refactor(website): serve filesystem agent tools from @jini-ai/platform/fs/tools`.

## untangle overlap (execute after wave B merge and CLASSIFY row 41)
- Row 41 itself (the six sibling files) is the precondition; `server-port` and C4 edit `tool-catalog-manifest.ts` (:92 import): text guard.
- A08 (`image-transform/tool.ts` deferred) and CLASSIFY 113 (`asset-transfer`) import the same three helpers: **run A16 before them** or let them repoint in their own slice; whichever is second re-reads the import lines.
- C4 composition edits `contributeFsFilesTools` call site (`tool-catalog-manifest.ts`): the Tovu binding keeps its exported name, so no collision.
- A10 touches no file here. `kb` in `tool-registrations.ts:113` is reported to A10 as a candidate (do not edit).

## STOP specific to this sheet
- Row 41 has not landed (the leaf files are not in `platform/fs`).
- A needed registration-kit function is not exported from `@jini-ai/core` root (do not copy it).
- `AssistantSurfaceDeps` cannot be reduced to a structural subset without importing daemon.
- Any permission string, `root` refusal or error wording changes; any handler gains a default for `host`/`approval`/`surfaces`.
- A moved test needs an expectation change.
