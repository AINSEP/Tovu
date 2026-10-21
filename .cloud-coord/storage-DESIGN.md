# Object storage — one contract, swappable providers (design, 2026-10-21)

Persona: AI-Dev-Shop software-architect. Input: provider AUDIT.md rows *storage (media blobs)* and
*site-backup share/export*. Shared registry: Jini `@jini-ai/core/provider-registry` (ddc1e606, merged).

## Problem
Five byte-storage contracts grew independently (audit found four; the fifth is platform's):
| # | Contract | Where | Callers today |
|---|---|---|---|
| 1 | `BlobStorePort` (put/putIfAbsent/get/sizeOf/exists/remove, sha-keyed) | J/cms/src/media/ports.ts:112 | all Tovu media (`RouteDeps.blobStore`) |
| 2 | `StorageProvider` (put/get→null/delete/list) | J/capability-providers/src/storage.ts | none in Tovu (orphaned) |
| 3 | `ArtifactStorePort` (upload→url/delete/verify) | J/devops/src/core/artifact-store.ts | Tovu site-share |
| 4 | S3 code: `S3BlobStore` (T/features/media/blob-store.s3.ts) + s3-compatible plugin `artifactStore` | Tovu + C/s3-compatible | media (env), shares |
| 5 | `BlobStorage` (namespace/path files) | J/platform/src/blob-storage.ts | capability-providers adapter |
Selection: env `TOVU_MEDIA_BLOB_STORE=local|s3` if-chain (deps.ts:410-440); shares hard-code
`loadDeployTargets().get("s3-compatible")` (deps.ts:2762). Media S3 and share S3 use two different
credentials (env vars vs the saved `s3-compatible` connection).

## Decision
**One contract `ObjectStore` in `@jini-ai/core/object-store`** (universal, types + pure helpers only; every
storage package already depends on core). Key → bytes, nothing else:
```ts
interface ObjectStore {
  put({ key, bytes }, { contentType?, headers?, ifAbsent?, signal? }?): Promise<{ written: boolean }>;
  get({ key }, { signal? }?): Promise<Uint8Array | null>;      // null = absent; other faults reject
  head({ key }, { signal? }?): Promise<{ size: number } | null>;
  delete({ key }, { signal? }?): Promise<void>;                 // idempotent
  readonly publicAccess?: PublicObjectAccess;                   // only when objects are anonymously readable
}
interface PublicObjectAccess { url({ key }): string; verify({ key, url, present, bytes? }, { signal? }?): Promise<boolean> }
interface ObjectStoreProvider<H = unknown> {
  create({ settings, credential?, host }, {}?): ProviderResult<ObjectStore>;  // never throws for bad input
}
```
- `ifAbsent: true` is the atomic create-only write (`O_EXCL` / S3 `If-None-Match: *`), absorbing
  `putIfAbsent`'s TOCTOU rule verbatim (its comment moves to the contract).
- Registry: `createObjectStoreRegistry()` = `createProviderRegistry<ObjectStoreProvider>({ contract:
  'object_store' }, { defaultProviderId: 'local' })`. Ids follow the frozen grammar: `local`, `s3_compatible`.
- Views, not new contracts: `blobStoreFromObjectStore({ store })` in J/cms/media (keys still
  `computeBlobStorageKey` → `ws/{ws}/blobs/{sh}/{sha}`; `get` miss throws the existing
  `blob '<key>' was not found` text). `ArtifactStorePort` = `ObjectStore` + `publicAccess` (devops view
  later). `StorageProvider`/`BlobStorage` marked superseded; their adapters stay until a consumer moves.

## Providers
- **`local` (default, core)**: `createLocalFsObjectStore({ rootDir })` in `@jini-ai/platform/object-store`
  (node runtime). Path = `join(rootDir, key)` — byte-identical to `LocalFsBlobStore`, so existing
  uploads read unchanged. `ifAbsent` via `"wx"`; head via `stat`; delete via `rm({ force: true })`.
- **`s3_compatible` (bundled plugin)**: C/s3-compatible ships `tovu-object-stores.json` →
  `object-stores/s3-compatible.mjs`, default export an `ObjectStoreProvider` signing with
  `kit.createSigV4Client` (plain JS, no npm deps). Ports `S3BlobStore`'s request semantics (412 on
  `ifAbsent`, 404→null, non-404 faults reject, HEAD content-length validation). Loaded by
  `defineProviderContribution` (same trust gates as every executable seam). `S3BlobStore` is deleted.

## Selection (Tovu wiring, T/features/object-storage)
1. Env override `TOVU_MEDIA_BLOB_STORE` (`local` | `s3` → `s3_compatible`) wins, unchanged semantics: env
   `TOVU_S3_*` vars are the credential, validated **synchronously at boot** (same loud errors), and the
   provider comes from the bundled *source* registry so an inactive plugin cannot break an env install.
2. Else per-site setting `core.storage.mediaObjectStore` (settings ledger, workspace scope, default `""` →
   registry default `local`).
3. A non-local setting resolves the **shared credential**: the saved `s3-compatible` connection (the same
   record shares use). Media writes go to its optional `mediaBucket` field; if absent, media stays
   refused (loud log, falls back to `local`) — the share/publish bucket is public by design and must not
   silently hold unpublished media.
The blob store is resolved once per boot behind a lazy view (boot is sync; plugin/settings reads are
async). A setting change applies on next restart (documented in the setting description).

## Callers migrated
- deps.ts `resolveBlobStore` → `resolveMediaObjectStore` (env check sync, provider resolve lazy).
- deps.ts share `s3` delivery → object-store registry: any provider whose store exposes `publicAccess`
  and `createArtifactStore` (s3_compatible) instead of the hard-coded deploy-target id.
- `peer-site-reads.ts` stays local (it reads a peer's local uploads dir by design).

## Lots (one commit each, push after each)
J1 core contract + registry helper + tests · J2 platform local fs store + tests · J3 cms
`blobStoreFromObjectStore` + tests · T1 s3 plugin object-store module + manifest + digests + tests ·
T2 Tovu object-storage feature (registry, select, setting, lazy view) + tests · T3 deps.ts migration,
delete `blob-store.s3.ts` · T4 share path via registry.

## No data loss
Keys/paths never change: local path formula identical; S3 object key = `keyPrefix + storageKey` as
before (env `TOVU_S3_KEY_PREFIX` kept). No byte migration happens; switching providers on a site with
existing media is the operator's copy job (same as today).

## Risks
- Switching a live site local→S3 makes old blobs unreadable until copied (pre-existing; documented).
- Lazy resolution moves a plugin-load failure from boot to first media op: logged at boot, ops reject
  with the cause; env path keeps sync loud validation.
- Bundled digests must be regenerated for C/s3-compatible (trust gate).
- Shares now follow the registry; a site whose connection lacks `publicUrl` loses shares (as today).
- Opening providers to third parties remains the separate trust decision (audit point 1).
