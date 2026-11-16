# MV-publish-transfer-1: publish transfer contracts, staging and blob index -> `@jini-ai/cms/publish` (template T-MOVE)

Row: audit2 B01 (`AUDIT-ADDITIONS-2-b.tsv`). Kind MOVE (9 files, ~700 lines) + 3 moved tests. Written 2026-11-16 against Tovu `integ/wave-b` 10378809 / Jini `integ/wave-b` ab8711ed. Planning only.
untangle_overlap: **YES -> execute after wave B merge.** (1) C5 (`core/contracts/blob`, `runtime`) may re-home `BlobStorePort`; the sheet imports it from the cms leaf `../media/ports.js` (exists today, `packages/cms/src/media/ports.ts:115`) so a C5 re-home only touches that one import line. (2) C3/C4/R-BARRELS rewrite import lines in `apps/website/src/server/runtime/composition/{deps,app}.ts`, `server/routes/types.ts`, `admin-http/routes/publish-content/*` (all in the importer list) -> importer edits are TEXT-guarded (each OLD specifier occurs the stated count), not blob-guarded. The 9 moved Tovu files and the 3 moved tests are blob-guarded; none has a wave row.
Order inside the publish engine (B01 -> B02 -> B03, no broken middle state): B01 lands first and creates the subpath `./publish` plus `./publish/node`; B02 and B03 only ADD files to `packages/cms/src/publish/` and lines to the same two barrels. Every Tovu file that stays after B01 (planner, type-registry, apply-loop, peer-transport, composite-blob-source, ...) imports the moved names from `@jini-ai/cms/publish`; B02/B03 rewrite those lines to relative leaf imports when they move the importer itself.
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base
Tier: Sonnet 5.5 high executor, Opus review of the signature conversions (J-3). est. executor tokens: ~140k (2 commits; ~92 importer files are scripted, 16 `stageBundle` call sites by hand).

## Design decisions made here (the executor makes none)
- Subpath: `@jini-ai/cms/publish` (universal; leaf files in `packages/cms/src/publish/`) and `@jini-ai/cms/publish/node` (node; `src/publish/node.ts`). New isolation domain `publish` -> `src/publish`. Row 140's framework files (planner, type-registry, content-hash, seed-hash, run-repo, repo-handler, file-tree-policy ...) land in the same directory with their CURRENT file names, so B02/B03 moved files keep their `./planner.js`-style relative imports unchanged.
- `blob-staging.ts` uses `node:crypto` -> goes under `./publish/node`. `bundle-staging.ts` uses the Node global `Buffer` (universal entry must not) -> one listed edit swaps it for `TextEncoder` (identical UTF-8 byte count, pinned by a new characterization test).
- The two re-export lines in `backstop-ports.ts` (`export type { RawValue, ... } from "./backstop-audit.js"`) and `backstop-audit.ts` (`export type { BackstopMetadata } from "./packed-entity.js"`) are DELETED in the copy (owner rule 19: no forwarders); every name stays available from the `./publish` barrel (it `export *`s all three leaves) and every Tovu importer already gets it from there.
- Positional exports are converted to `(required, optional = {})`: `sha256Hex(bytes)` -> `sha256Hex({ bytes }, _optional = {})`; `stageBundle(input, deps)` -> `stageBundle({ input, deps }, _optional = {})`; `computeBundleExpiry`, `isBundleActive`, `loadActiveBundle`, `bytesMatchSha256` gain `_optional = {}` (no caller change).
- NOT in B01 (both stay in Tovu until their blockers land): `composite-blob-source.ts` (needs `PeerBlobSource` from `peer-transport.ts`) -> B03 slice B03-0; `content-references.ts` (needs `PublishContentReference` from `type-registry.ts`, `media-references.ts`, Tovu `entry-refs`) -> after row 140, tracked in B02 slice B02-5.

```
id: MV-publish-transfer-1
feature: website/features/publish-content (transfer contracts + staging)
precondition: -
tovu_files:
  - apps/website/src/features/publish-content/apply-errors.ts | blob 58ccf003e48bea768e51be23e699c9e5b501f765 | delete
  - apps/website/src/features/publish-content/artifact-format.ts | blob 7496ede9716caed270cac24f8db40236be9abde4 | delete
  - apps/website/src/features/publish-content/backstop-audit.ts | blob 0ddb2cc75fd183f359913feaf15cd34110148a72 | delete
  - apps/website/src/features/publish-content/backstop-ports.ts | blob 90f073ee860a185164219f61162668769b848cd5 | delete
  - apps/website/src/features/publish-content/baseline-repo.ts | blob 8d458e35e371efbb02c4f03700001031a7097a65 | delete
  - apps/website/src/features/publish-content/bundle-staging.ts | blob 91ab4839c0b9e59b3a69a135e7303d58472dadf3 | delete
  - apps/website/src/features/publish-content/file-blob-index.ts | blob b566ab9a2e64bbac5617e1d0dbda99a9fd492b0f | delete
  - apps/website/src/features/publish-content/packed-entity.ts | blob 34a9796afd13f07a85510aa5539e4ee0cbddab7e | delete
  - apps/website/src/features/publish-content/blob-staging.ts | blob 106fd906012a8af8f95184279213be4625086a42 | delete
tovu_tests:
  - apps/website/src/features/publish-content/__tests__/blob-staging.test.ts | blob ad5873e2d320ce7bb632c60d8fec35a6c6b0db1c | move-to-jini
  - apps/website/src/features/publish-content/__tests__/bundle-staging.test.ts | blob ecab5a97705fce4c68d93adaed24e4a35a018a44 | move-to-jini
  - apps/website/src/features/publish-content/__tests__/file-blob-index.test.ts | blob b03e8ab574742dec250b93631839103db85cb822 | move-to-jini
jini_target: cms ./publish (new, universal) + ./publish/node (new, node), files under packages/cms/src/publish/
jini_guards:
  - packages/cms/src/publish must not exist
  - packages/cms/package.json blob 1d49bc2899be0d9925a391340bd1fea61777e17d
  - packages/cms/README.md blob a604eb8ec382cc0819305ed0939995519ed1157b
  - packages/cms/src/media/ports.ts exports `BlobStorePort` (rg -n "export interface BlobStorePort" packages/cms/src/media/ports.ts prints 1 line)
  - rg -n "PublishContentApplyRowError|createFileBlobIndex|stageBundle|PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION|bytesMatchSha256|InMemoryPublishContentBaselineRepo" packages/*/src -> prints nothing
symbol_map:      # every name keeps its name; the specifier changes
  - all names of apply-errors, artifact-format, backstop-audit (incl. BackstopMetadata), backstop-ports (incl. RawValue/RawColumn/RawRowSnapshot/RawFileInverse), baseline-repo, bundle-staging, file-blob-index, packed-entity -> @jini-ai/cms/publish
  - all names of blob-staging (PUBLISH_CONTENT_BLOB_PROBE_MAX_SHAS, bytesMatchSha256, isValidSha256Hex, sha256Hex) -> @jini-ai/cms/publish/node
  - sha256Hex(bytes) -> sha256Hex({ bytes }, _optional = {})        (callers: blob-staging.ts:60 only; the moved test, 4 sites)
  - stageBundle(input, deps) -> stageBundle({ input, deps }, _optional = {})   (callers: see shape_changes)
values_injected: -   # no Tovu value is baked in; TTL/body-size constants are generic and stay as exported constants
leaf_import_rewrites:
  - backstop-ports.ts: add `import type { BlobStorePort } from "../media/ports.js";` as line 1 and replace `import("#src/features/media/index").BlobStorePort` -> `BlobStorePort`
  - backstop-ports.ts keeps `import("./backstop-audit.js").X` / `import("./file-blob-index.js").FileBlobIndexPort` / `import type {...} from "./backstop-audit.js"` unchanged (same directory)
  - bundle-staging.ts keeps `import { nowIso, type Clock } from "@jini-ai/core/primitives";` unchanged (rule 5b)
deletions_in_copy:
  - backstop-ports.ts: the line `export type { RawValue, RawColumn, RawRowSnapshot, RawFileInverse } from "./backstop-audit.js";`
  - backstop-audit.ts: the line `export type { BackstopMetadata } from "./packed-entity.js";`
```

## Copy edits (apply in order to the byte-for-byte copy of each Tovu file)

### E-apply-errors.ts  -> `packages/cms/src/publish/apply-errors.ts`
Replace the whole header comment (line 1 `/**` through the first `*/`, 40 lines) with:
```ts
/**
 * @file The one seam a publish content TYPE uses to say "this failure is about ONE entity — downgrade
 * its report row and keep the run going", rather than "the run is broken".
 *
 * The apply loop's per-row catch has two behaviours: downgrade the row, or rethrow and abort the whole
 * run (persisting a `failed` run row with whatever change sets landed first). The loop recognises THIS
 * base class instead of naming each content type's own error classes, so a new content type raises it
 * (or a subclass) and needs no edit to the loop — the generic pipeline never grows one import per
 * content type. A type that already has its own conflict classes may keep them and name them through
 * its handler's `isApplyConflict` rather than retrofit this base onto its error hierarchy.
 *
 * ## Dependency direction
 *
 * This module imports NOTHING, which is what lets a resource feature value-import it while the apply
 * loop imports it too: there is no path back, so no cycle is possible. It is deliberately not part of
 * the type registry module — a resource feature must never take a value edge into the registry.
 */
```
Then inside the file: OLD `` *  `planner.ts`'s `PublishContentOutcomeKind` `` stays (planner is a sibling leaf in this directory after row 140). OLD `` * errors in a "changed on the destination during apply" prefix precisely because their messages do `` -> unchanged. Nothing else changes (the comment on `PublishContentApplyRowOutcome` and the class body are neutral).

### E-artifact-format.ts, E-packed-entity.ts: no change except
- packed-entity.ts: OLD `` * planner (Task 5), and handed back `` -> NEW `` * planner, and handed back ``.

### E-backstop-audit.ts / E-backstop-ports.ts: only the listed deletion (backstop-audit) and the deletion + `BlobStorePort` import (backstop-ports). In backstop-ports.ts after the edit the `BackstopPorts.blobs` line reads `  readonly blobs?: BlobStorePort;`.

### E-baseline-repo.ts
Replace the header (line 1 `/**` through first `*/`) with:
```ts
/**
 * @file Read/write seam over the per-peer sync memory: the content hash of each entity as last
 * exchanged with that peer. The planner only ever READS through this port; the apply loop is the one
 * writer ("baseline upserted for `created`/`unchanged`/`applied`/`forced` only").
 *
 * `peerPrincipalId` is always the AUTHENTICATED principal who pushed/staged the bundle being compared
 * (`StagedBundleRecord.sourcePrincipalId`), never a bundle-declared identity and never the
 * confirming/executing admin's own principal id. A caller building the key this port reads/writes by
 * must use that value — getting this backwards would let any key-holder poison another peer's
 * baselines into "safe to overwrite".
 */
```
Then: OLD `` /** One persisted baseline row — mirrors `publishContentBaselines` (`platform/db/schema.sqlite.ts`)
 *  field-for-field. */ `` -> NEW `` /** One persisted baseline row; the host's storage adapter maps it field-for-field. */ ``.
OLD `` /** The `publish_content_runs` row this baseline was last stamped by (Task 8/10's audit trail) — `` -> NEW `` /** The run row this baseline was last stamped by (the audit trail) — ``.
OLD (3 lines) `` /** Replaces the baseline for `(workspaceId, peerPrincipalId, entityType, entityId)` — the table's
   *  own `publish_content_baselines_unique` index target. Not called anywhere in Task 7; Task 8's
   *  apply loop is the real caller (plan §4 task 8's own "baseline upserted for created/unchanged/
   *  applied/forced only"). */ `` -> NEW `` /** Replaces the baseline for `(workspaceId, peerPrincipalId, entityType, entityId)` — the storage
   *  adapter's unique-key target. The apply loop is the only caller. */ ``.
Remaining `` `PublishContentBundleRepo` `` / `` `bundle-staging.ts` `` mentions are sibling leaves: unchanged. OLD ``Mirrors `InMemoryPublishContentBundleRepo`'s shape (`bundle-staging.ts`)`` unchanged.

### E-bundle-staging.ts
1. Replace the header (line 2 `/**` through first `*/`, the block starting `@file Task 6 of the publish-content`) with:
```ts
/**
 * @file Staging area for a received bundle (the export envelope `{hashVersion, sourceLabel, entities,
 * blobManifest}`): it waits here between the peer's push/pull and the gated `plan()`/`execute()`, so
 * the plan hash has a stable input and large media bytes upload exactly once. Bytes are NOT stored
 * here — see `blob-staging.ts` (node entry).
 *
 * `expiresAt` is ALWAYS computed here, server-side, from `receivedAt` + a fixed TTL — never accepted
 * from the caller. A client-controlled expiry would let a peer stage a bundle that never expires
 * ("a staged bundle accumulating unbounded").
 *
 * `StageBundleInput` accepts an optional `sourceLabel` (the envelope carries one) but does NOT persist
 * it: it is display-only and never used in any comparison or trust decision, so dropping it costs
 * nothing safety-relevant. The planner already treats the bundle's `sourceLabel` as optional.
 *
 * ## Why "past `expiresAt`" is a REPO-level concept, not just an HTTP one
 *
 * `loadActiveBundle` lives next to the staging write for the same reason a token's `isRedeemable`
 * lives next to its `mintToken`: the expiry rule is a property of the bundle's own lifecycle,
 * directly testable against an in-memory repo without any gated-mutation machinery, and the planner
 * must get it for free rather than re-deriving the same boundary check against the same column.
 */
```
2. OLD `` /** One staged bundle row — the in-process shape `PublishContentBundleRepoPort` reads/writes.
 *  Mirrors `publishContentBundles` (`platform/db/schema.sqlite.ts`) field-for-field; `sourceLabel` is
 *  `string | null` here (not `string | undefined`) to match Drizzle's own nullable-column convention
 *  used throughout this codebase's other repo record shapes (e.g. `PublishHistoryEntry`'s optional
 *  fields via `row.x !== null`). */ `` -> NEW `` /** One staged bundle row — the in-process shape `PublishContentBundleRepoPort` reads/writes. The
 *  host's storage adapter maps it field-for-field. */ `` (the record has no `sourceLabel` field; the old text was stale).
3. OLD `` *  Mirrors `publish_content_baselines.peerPrincipalId`'s own rule (plan §1.6 / §5 risk #9): a `` -> NEW `` *  Mirrors the baseline repo's `peerPrincipalId` rule: a ``.
4. OLD `` decoded and validated by Task 7's `planImport`, `` -> NEW `` decoded and validated by the planner's `planImport`, ``.
5. OLD `` * Hard TTL for a staged bundle (plan §5 risk #13). 24 hours: `` -> NEW `` * Hard TTL for a staged bundle. 24 hours: ``; OLD `` objects, left to the existing blob GC per the schema's own doc). `` -> NEW `` objects, left to the blob GC). ``.
6. Replace the doc block of `PUBLISH_CONTENT_BUNDLE_MAX_BODY_BYTES` (`/**` before `export const PUBLISH_CONTENT_BUNDLE_MAX_BODY_BYTES` through `*/`) with:
```ts
/**
 * Body-size ceiling a host applies to the "stage a bundle" request. A bundle's `entities[]` is metadata
 * only (blob bytes travel through a separate per-blob request), but an unbounded JSON body is still an
 * unbounded-memory request. 20 MiB comfortably covers a measured real corpus (54 posts, ~1 KB average
 * body) with generous headroom while staying under a typical host-wide JSON body ceiling.
 */
```
7. OLD `` * Computes a staged bundle's `expiresAt` from its `receivedAt`, exactly `ttlMs` later — same shape
 * as `contracts/core/gated-mutations/token.ts`'s `mintToken` deriving `expiresAt` from `createdAt`
 * (`new Date(new Date(x).getTime() + ms).toISOString()`), no jitter. `` -> NEW `` * Computes a staged bundle's `expiresAt` from its `receivedAt`, exactly `ttlMs` later
 * (`new Date(new Date(x).getTime() + ms).toISOString()`), no jitter. ``.
8. OLD `` * mirroring `token.ts`'s `isRedeemable` boundary exactly. Pure; `` -> NEW `` * mirroring a token's `isRedeemable` boundary. Pure; ``.
9. OLD `` it never inspects an entity's shape (that is `planImport`'s job, Task 7). */ `` -> NEW `` it never inspects an entity's shape (that is `planImport`'s job). */ ``.
10. OLD `` `CONTENT_HASH_VERSION` — Task 7's `planImport` (already built, Task 5) owns both of those checks `` -> NEW `` `CONTENT_HASH_VERSION` — the planner's `planImport` owns both of those checks ``.
11. OLD `` * — the two cases are deliberately collapsed into one result, mirroring `token.ts`'s
 * `TokenExpiredError` doc: "an unrecognized token and a genuinely expired token... indistinguishable
 * (REQ-11)". Both mean `` -> NEW `` * — the two cases are deliberately collapsed into one result (an unrecognized id and a genuinely
 * expired bundle are indistinguishable to the caller). Both mean ``.
12. OLD `` Mirrors `InMemoryTokenStore`'s shape (plain `Map`, defensive copies on
 *  read/write so a caller mutating a returned record can never corrupt this store's own state). */ `` -> NEW `` Plain `Map`, defensive copies on read/write so a caller mutating a returned
 *  record can never corrupt this store's own state. */ ``.
13. Signatures (shape): `export function computeBundleExpiry(required: { receivedAt: string; ttlMs?: number }): string {` -> `export function computeBundleExpiry(required: { receivedAt: string; ttlMs?: number }, _optional = {}): string {`; `export function isBundleActive(required: { record: StagedBundleRecord; now: string }): boolean {` -> `... now: string }, _optional = {}): boolean {`; in `loadActiveBundle` the parameter list `(\n  required: { repo: PublishContentBundleRepoPort; workspaceId: string; id: string; now: string }\n)` -> `(\n  required: { repo: PublishContentBundleRepoPort; workspaceId: string; id: string; now: string },\n  _optional = {},\n)`; `stageBundle(\n  input: StageBundleInput,\n  deps: StageBundleDeps\n): Promise<...>` -> `stageBundle(\n  { input, deps }: { input: StageBundleInput; deps: StageBundleDeps },\n  _optional = {},\n): Promise<...>`.
14. OLD `    sizeBytes: Buffer.byteLength(entitiesJson, "utf8") + Buffer.byteLength(blobManifestJson, "utf8"),` -> NEW `    sizeBytes: utf8ByteLength({ text: entitiesJson }) + utf8ByteLength({ text: blobManifestJson }),` and append, immediately above `export async function stageBundle` doc block, this helper:
```ts
/** UTF-8 byte length of `text` (same count as `Buffer.byteLength(text, "utf8")`, without the Node global,
 *  so this universal entry never needs `node:`). @complexity O(n). */
function utf8ByteLength({ text }: { text: string }, _optional = {}): number {
  return new TextEncoder().encode(text).byteLength;
}
```

### E-file-blob-index.ts
1. Replace the header (line 1 `/**` through first `*/`) with:
```ts
/**
 * @file The process-wide address book a file-tree `pack()` fills as it hashes files on disk, so a PUSH
 * or a PULL can later hand those exact bytes to a peer WITHOUT copying them into the media blob store
 * first. The composite blob source is the one reader; this module owns only the mapping and its bound.
 *
 * ## Why an LRU, not an unbounded map
 *
 * The index is filled by every `pack()` call this process makes for its lifetime (never cleared between
 * requests — one shared, process-lifetime instance per composition root). A site with many file trees,
 * repeatedly re-packed across many admin sessions, would otherwise grow this map without bound. Capping
 * it at {@link FILE_BLOB_INDEX_MAX_ENTRIES} and evicting the least-recently-touched entry keeps memory
 * bounded while keeping the entries a caller is about to use (the ones from the MOST RECENT `pack()`)
 * resident.
 *
 * ## Why "recently touched" includes reads, not just inserts
 *
 * What an LRU protects against is a *read* pattern: a peer pulling many blobs in one push touches the
 * same recently-packed entries repeatedly, and those reads should count as "still useful" exactly as
 * much as the insert that created them — otherwise an export with more distinct blobs than the cap could
 * evict an entry between two reads of it within the same push. {@link FileBlobIndexPort.get} therefore
 * bumps recency on every hit.
 */
```
2. OLD `` re-hashes them at the moment it actually needs them ({@link apps/website/src/features/publish-content/composite-blob-source.ts}'s own
 *  doc explains why a cached read would be unsafe here). */ `` -> NEW `` re-hashes them at the moment it actually needs them (a cached read would be unsafe here: the file may
 *  have changed since it was packed). */ ``.
3. OLD `` /** §3's own cap: "LRU of 20k entries". Exported `` -> NEW `` /** The cap: an LRU of 20k entries. Exported ``.
4. OLD `` held as a
 * process-lifetime singleton and threaded through `RouteDeps.fileBlobIndex` (this file's own header). `` (line-wrapped: find `process-lifetime singleton and threaded through`) -> NEW `` held as a
 * process-lifetime singleton and handed to every `pack()` and to the composite blob source. ``.

### E-blob-staging.ts  -> `packages/cms/src/publish/blob-staging.ts`
1. Replace header (lines 3-23, `/**` through first `*/`; line 1 `import { createHash } from "node:crypto";` stays) with:
```ts
/**
 * @file Pure helpers for the blob pre-flight requests (probe, put, get). Kept separate from the route
 * handlers so the security-critical property below has a direct unit test that needs no HTTP request, no
 * `BlobStorePort`, and no auth harness.
 *
 * ## The property this file exists to hold
 *
 * `BlobStorePort.putIfAbsent` does NOT verify that the bytes it is given actually hash to the `sha256` it
 * is told — it only uses that string to derive the storage key and writes a create-only object there; a
 * filesystem store opens the sharded key with `O_CREAT|O_EXCL` and writes whatever it was handed. In this
 * feature the sha IS the identity (baselines, `PackedEntity.requiredBlobs` and the blob manifest all
 * address a blob by its claimed hash) — accepting bytes that do not hash to their claimed sha256 would
 * let a caller poison content-addressed storage: a later reader asking "do you have blob X" would get
 * `true` for bytes that are not actually X. A PUT route MUST call {@link bytesMatchSha256} and refuse a
 * mismatch BEFORE ever calling `putIfAbsent` — `putIfAbsent` itself will not catch it.
 */
```
2. OLD `the route-layer input-shape gate the interface routes to this file's real check. */` -> keep. OLD `` * Hashes `bytes` with SHA-256, lowercase hex — the same digest shape used everywhere else a sha256
 * is stored or compared in this feature (`content-hash.ts`'s own `contentHash` uses the identical
 * `createHash("sha256")...digest("hex")` shape, for the same "one canonical form" reason). `` stays (sibling leaf `content-hash.ts` is row 140; the reference stays valid in the Jini directory).
3. OLD `` * Resource-bounds cap (Programmer skill 5a4) for `blobs/probe`'s request array — an unbounded
 * `shas[]` would let one request force an unbounded number of `blobStore.exists()` calls. Chosen
 * generously above any real bundle's blob count (this feature's own local corpus is 54 posts,
 * ~1 KB average body — plan §6 item 7) while still being a real, enforced ceiling rather than `` -> NEW `` * Resource-bounds cap for the probe request's `shas[]` — an unbounded array would let one request
 * force an unbounded number of `blobStore.exists()` calls. Chosen generously above any real bundle's
 * blob count (a measured real corpus is 54 posts) while still being a real, enforced ceiling rather than ``.
4. Shapes: `export function sha256Hex(bytes: Uint8Array): string {` -> `export function sha256Hex({ bytes }: { bytes: Uint8Array }, _optional = {}): string {`; in `bytesMatchSha256`: `export function bytesMatchSha256(required: { bytes: Uint8Array; claimedSha256: string }): boolean {` -> `... claimedSha256: string }, _optional = {}): boolean {` and body `sha256Hex(required.bytes)` -> `sha256Hex({ bytes: required.bytes })`.

## Jini steps (commit 1)
J-1. Create `packages/cms/src/publish/` with the 8 universal files (apply-errors, artifact-format, backstop-audit, backstop-ports, baseline-repo, bundle-staging, file-blob-index, packed-entity) and `blob-staging.ts`, each = Tovu file byte for byte + its E-section edits.
J-2. NEW `packages/cms/src/publish/index.ts`:
```ts
/** @file `@jini-ai/cms/publish`: the content-sync (publish) transfer contracts — packed-entity wire shape, artifact format version, backstop audit and raw-row/raw-file ports, per-peer baselines, staged bundles and the file-blob index. Universal: no `node:` built-ins. */
export * from "./apply-errors.js";
export * from "./artifact-format.js";
export * from "./backstop-audit.js";
export * from "./backstop-ports.js";
export * from "./baseline-repo.js";
export * from "./bundle-staging.js";
export * from "./file-blob-index.js";
export * from "./packed-entity.js";
```
NEW `packages/cms/src/publish/node.ts`:
```ts
/** @file `@jini-ai/cms/publish/node`: node-bound publish helpers (sha256 verification of blob bytes). */
export * from "./blob-staging.js";
```
J-3. `packages/cms/package.json` (validate with JSON.parse): (a) `jini.entries`: OLD `      "./core/commands": "universal"\n    },` -> NEW `      "./core/commands": "universal",\n      "./publish": "universal",\n      "./publish/node": "node"\n    },`. (b) `jini.isolation.domains`: OLD `        "listing": [\n          "src/listing"\n        ]\n      },` -> NEW `        "listing": [\n          "src/listing"\n        ],\n        "publish": [\n          "src/publish"\n        ]\n      },`. (c) `exports`: after the `"./core/commands": {...}` block (ends `"default": "./dist/core/commands/index.js"\n    }\n  },`) insert before the closing: `    },\n    "./publish": {\n      "types": "./dist/publish/index.d.ts",\n      "import": "./dist/publish/index.js",\n      "default": "./dist/publish/index.js"\n    },\n    "./publish/node": {\n      "types": "./dist/publish/node.d.ts",\n      "import": "./dist/publish/node.js",\n      "default": "./dist/publish/node.js"\n    }\n  },` (i.e. add a comma after the existing last block and the two new blocks).
J-4. README: append after the row ending `plugin-export template resolution. |` (line 32) two rows: `| \`./publish\` | universal | Content-sync transfer contracts: packed entity, artifact format version, backstop audit/raw-row/raw-file ports, per-peer baseline repo, staged bundles, apply-row error, file-blob index. |` and `| \`./publish/node\` | node | sha256 verification of blob bytes before content-addressed storage. |`.
J-5. Moved tests -> `packages/cms/src/publish/__tests__/{blob-staging,bundle-staging,file-blob-index}.test.ts` = Tovu test byte for byte + test_edits. `test_edits`: line `import test from "node:test";` -> `import { test } from "vitest";` (keep `import assert from "node:assert/strict"`); `from "../blob-staging.js"` etc. unchanged (same relative layout); header doc blocks: replace the `@file Task 6 ... §4 task 6.` pair of lines with `@file`-neutral first line (blob-staging.test: ` * @file Pins the security property blob-staging.ts states:`; bundle-staging.test: ` * @file Pins bundle staging:`; file-blob-index.test: ` * @file {@link createFileBlobIndex}'s round-trip, ...` replacing the `publish-files-plan-2026-09-24.md §3 —` prefix); bundle-staging.test.ts line 89 title `... — required Task 6 property` -> `... — required property`; blob-staging.test: every `sha256Hex(X)` -> `sha256Hex({ bytes: X })` (4 sites: lines 24, 29, 35, 41); bundle-staging.test: every `stageBundle(A, B)` -> `stageBundle({ input: A, deps: B })` (7 sites: lines 34, 52, 92, 105, 134, 137, 140; multi-line sites keep their layout).
J-6. NEW test (GREEN on both sides, characterization of the `Buffer` -> `TextEncoder` swap) appended to the moved bundle-staging test:
```ts
test("stageBundle sizeBytes counts UTF-8 bytes of non-ASCII entities exactly like Buffer.byteLength", async () => {
  const repo = new InMemoryPublishContentBundleRepo();
  const entities = [{ entityType: "post", id: "p-é", state: { title: "日本語 🚀 café" } }];
  const { bundleId } = await stageBundle(
    { input: { workspaceId: "ws-1", sourcePrincipalId: "principal-1", artifactFormatVersion: 1, hashVersion: 1, entities, blobManifest: ["a".repeat(64)] },
      deps: { repo, clock: fakeClock("2026-09-18T00:00:00.000Z"), idGen: fakeIdGen("bundle-utf8") } },
  );
  const stored = await repo.findById({ workspaceId: "ws-1", id: bundleId });
  const expected = Buffer.byteLength(JSON.stringify(entities), "utf8") + Buffer.byteLength(JSON.stringify(["a".repeat(64)]), "utf8");
  assert.equal(stored?.sizeBytes, expected);
});
```
J-7. NEW `.changeset/cms-publish-transfer-contracts.md`: `---\n"@jini-ai/cms": minor\n---\n\nNew \`@jini-ai/cms/publish\` (universal) and \`@jini-ai/cms/publish/node\` subpaths: the content-sync transfer contracts (packed entity, artifact format version, backstop audit and raw-row/raw-file ports, per-peer baseline repo, staged-bundle repo and staging service, file-blob index, apply-row error) and blob-byte sha256 verification.\n`
J-8. Rule checks: `rg -n -i "tovu|site-chat|apps/(admin|website|desktop)|schema\.sqlite|plan §|Task [0-9]|ADS-memory" packages/cms/src/publish` prints nothing; `rg -n "from ['\"]express|process\.env|console\.|await import\(|Buffer" packages/cms/src/publish --glob '!__tests__/**'` prints nothing; `rg -n "from ['\"]node:" packages/cms/src/publish` prints only `blob-staging.ts` (`node:crypto`) in non-test files and `node:assert/strict` in tests; every `@jini-ai/*` import is `@jini-ai/core/primitives`. eslint the new files. Commit `MV-publish-transfer-1-jini.msg`: `feat(cms): publish transfer contracts, staging and blob index under @jini-ai/cms/publish` | body "Moved from the host's publish-content feature verbatim apart from the listed edits (neutral headers, args shapes, TextEncoder for Buffer). The universal entry has no node: built-ins; blob sha256 verification is under /publish/node."

## Tovu steps (commit 2)
shape_changes (every `stageBundle` caller; edit `stageBundle(A, B)` -> `stageBundle({ input: A, deps: B })`, layout preserved): `features/publish-content/pull.ts:63`; `server/inbound/admin-http/routes/publish-content/bundle-create.ts:216`; tests: `publish-content/__tests__/{planner-hash-upgrade.test.ts:98, backstop-batch.apply-loop.test.ts:52, no-dead-apply-stub.boundary.test.ts:55, publish-tool.test.ts:69, apply-loop.test.ts:276}`, `platform/db/sqlite/__tests__/publish-content-bundle-repo.sqlite.integration.test.ts:35,43,53`, `admin-http/routes/publish-content/__tests__/{import.routes.pins.test.ts:87, backstop-import-ui.routes.test.ts:35}`. Any `stageBundle(` hit not on this list = STOP. `sha256Hex` from blob-staging has no Tovu caller outside the moved file and the moved test (the other `sha256Hex` hits are local definitions in site-backup and two tests: leave them).
census:
  cmd: `python3 -I scripts/census.py` equivalent used at planning: walk `apps development content packages` `*.ts/*.tsx`, find import/export-from/dynamic-import specifiers whose last segment is one of `apply-errors|artifact-format|backstop-audit|backstop-ports|baseline-repo|bundle-staging|file-blob-index|packed-entity|blob-staging` and that is relative (`./`, `../`) resolving to `features/publish-content/<name>` or contains `publish-content/`. Also `rg -n 'import\("[^"]*(apply-errors|artifact-format|backstop-audit|backstop-ports|baseline-repo|bundle-staging|file-blob-index|packed-entity|blob-staging)'`.
  allowed: the 92 files / 143 lines in `move-templates/sheets/audit2/move-B01-publish-transfer.census.txt` (planning census at wave-b). Any file not in that list = STOP; lines in the 9 moved files themselves are removed with them.
importer_edits (scripted; one rule per specifier form, applied to every census line outside the 9 moved files):
  - `#src/features/publish-content/{apply-errors,artifact-format,backstop-audit,backstop-ports,baseline-repo,bundle-staging,file-blob-index,packed-entity}` -> `@jini-ai/cms/publish`
  - `#src/features/publish-content/blob-staging` -> `@jini-ai/cms/publish/node`
  - `./X.js`, `../X.js`, `../../features/publish-content/X.js` (X as above, `.js` or none) -> same two targets (blob-staging only -> `/node`)
  - inline `import("./backstop-audit.js").BackstopMetadata` (planner.ts:150) -> `import("@jini-ai/cms/publish").BackstopMetadata`; dynamic `await import("../baseline-repo.js")`, `("../bundle-staging.js")`, `("../artifact-format.js")` in tests -> `await import("@jini-ai/cms/publish")`
  - Two imports from the same new specifier in one file (e.g. value + `import type` lines of bundle-staging) stay as two lines (no merge; eslint `import/no-duplicates` is a gate-debt-free rule here only if it fires: if it does, merge them into one line, value names first).
  - Names are unchanged except the two call-shape edits above.
  - After rewrite, `type-registry.ts:34` (`BackstopPorts`) and `:27` (`FileBlobIndexPort`) and `:35` (`BackstopMetadata`) import from `@jini-ai/cms/publish`.
architecture baseline: `development/scripts/check-architecture.baseline.json` — delete every array element naming a moved file as its edge target or source: the 8 `-> apps/website/src/features/publish-content/apply-errors.ts` lines (59, 129, 200, 256, 321, 405, 408, 418), the 2 `-> .../blob-staging.ts` lines (197, 201), the `file-blob-index.ts` line (420), and the `backstop-ports.ts -> .../media/index.ts` line (269). After deletion `node -e 'JSON.parse(require("fs").readFileSync("development/scripts/check-architecture.baseline.json","utf8"))'` must pass (fix a dangling comma on the previous element if one of the deleted lines was last). `cloud/reports/extract-integ2-gates.json` is a historical report: leave it. `rg -F "publish-content/{apply-errors,...}"` over `*.json/*.mjs/*.cjs/*.yml` outside `ADS-memory/` and `cloud/reports/` must print nothing afterwards.
deletions: `git rm -q` the 9 Tovu files and 3 tests (listed in the commit pathspec).
tovu_msg: `refactor(publish-content): use @jini-ai/cms/publish for transfer contracts, staging and the blob index` | body "Repointed ~90 importers; stageBundle and sha256Hex take required-object args; architecture baseline entries for the moved files removed."
extra_stops: a moved file's blob differs; `rg -n "stageBundle\(" apps` shows a caller outside shape_changes; `@jini-ai/cms/publish` already resolves in the Tovu linked clone to a different file set (B01 already applied); `BlobStorePort` missing from `packages/cms/src/media/ports.ts`; a Tovu file other than the 9 declares an `export` that one of the nine re-exported (e.g. someone added a consumer of `RawValue` through `backstop-ports` — covered because every name is in the barrel).

## Expected afterwards (batched cloud run, not here)
Jini: vitest `packages/cms/src/publish/__tests__`, `packages/cms/src/__tests__/subpath-isolation.contract.test.ts` and `integration-package.contract.test.ts` (new entries/domain), `scripts/check-packaging.mjs`, typecheck, complexity/size gates. Tovu: typecheck of `apps/website` after linking the Jini clone; `check-architecture` (baseline shrinks); the 22 test files above. RED-expected: none (pure moves; the new UTF-8 characterization test is GREEN on both sides).
