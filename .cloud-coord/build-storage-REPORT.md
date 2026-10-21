# build-storage REPORT (2026-10-21)

Branch **cloud/build-storage-2026-10-21** in both repos, based on cloud/integration-2026-10-21. Run 17:01–20:15Z.
Agents hit the usage limit around 17:40–19:55; the owner lifted it. Design: `.cloud-coord/storage-DESIGN.md`.

## Result
Object storage is now **one generic contract** with swappable providers:
- **`ObjectStore`** (`@jini-ai/core/object-store`):
  - methods: put (`ifAbsent` is the atomic create-only write), get (absent → null), head, idempotent delete, optional `publicAccess`;
  - `ObjectStoreProvider.create()` returns a `ProviderResult` instead of throwing;
  - `createObjectStoreRegistry()` uses the shared `createProviderRegistry` (contract `object_store`, default `local`);
  - `deferObjectStore` resolves the provider on first use.
- **Default provider `local`** (`@jini-ai/platform/object-store`): writes at `join(rootDir, key)`, the same path `LocalFsBlobStore` uses. Keys that escape the root are refused.
- **`s3_compatible` is a bundled plugin provider**: `content/agent-plugins/s3-compatible/object-stores/s3-compatible.mjs`, declared in `tovu-object-stores.json` and loaded through `defineProviderContribution` (same trust gates as other plugins). It takes over `S3BlobStore`'s requests unchanged, and `S3BlobStore` is deleted.
- **Old contracts kept as views**: cms `BlobStorePort` = `blobStoreFromObjectStore` (keys unchanged); devops `ArtifactStorePort` is documented as the share view. capability-providers `StorageProvider` and platform `BlobStorage` are marked superseded and stay until their consumers move.
- **Selection** (Tovu `features/object-storage`):
  - Order: env `TOVU_MEDIA_BLOB_STORE` (local|s3) → per-site setting `core.storage.mediaObjectStore` (registered at boot) → `local`.
  - The env override fails loudly and synchronously at boot with the same messages as before. Its S3 provider comes from the bundled source, so the plugin does not need to be switched on.
  - A setting that cannot be honoured makes every media call fail with the reason. It never falls back to local disk.
- **One shared credential**: media and shares both use the saved `s3-compatible` connection. Media goes only to its new optional private `mediaBucket` (plus `mediaKeyPrefix`), never to the public publish bucket.
- **Shares**: deps.ts no longer looks up `loadDeployTargets().get("s3-compatible")`. Any registered provider that offers `createArtifactStore` can deliver shares; the site's media choice wins. share-hosting no longer accepts only `"s3-compatible"`, and saved s3-compatible shares still match.
- **No data loss**: local paths and S3 object keys (`keyPrefix + ws/{ws}/blobs/{sh}/{sha}`) are byte-identical, and tests prove it in both directions.

## Pushed commits
**Jini:**
- ddc1e606: merged provfix helper (fast-forward)
- 1e9a5815: core contract + registry
- 443d1dd9: platform local store
- cd6d1e33: cms view
- 4acf5cc8: deferObjectStore
- 2a82a6ed: superseded-contract docs
- 3b535d9e: isolation domain + exports test

**Tovu:**
- c1d36eda: design
- ef514caa: s3 plugin provider
- f59004b1: object-storage wiring
- d0ee9dff: deps.ts media via registry
- 3c7850f8: shares via registry + tests
- 4a675744: mediaBucket fields
- 469f9017: progress
- 97ecbbfd: retire S3BlobStore (committed as `wip`)
- a91fd760: test-header fix

## Tests (touched packages only)
- **Jini:**
  - new files are each 100% covered: object-store.ts, local-fs.ts, blob-store.object-store.ts;
  - core 1242/1242, platform 2359 pass + 6 skipped, cms 3560/3560 — each package's one failure, from my new subpaths, was fixed in 3b535d9e and its test re-run green.
- **Tovu:**
  - s3 plugin provider: 22 tests, 100% coverage;
  - object-storage: 46 tests, 100% per file;
  - media/*, share-*, boot-options, library-share, bundled s3 plugin and the end-to-end/span cases ported to `createMediaBlobStore`: 220 + 595 tests, all passing;
  - `S3BlobStore`'s 15 deleted tests: 12 are covered in the plugin and cms suites, 3 moved to the new file.
- **Pre-existing failures, unrelated to this work:**
  - Jini `pnpm guard` self-test is red on the baseline too. Its individual checks pass except `check-hardwiring`, whose 43 HW3 hits are all in files I didn't touch.
  - Tovu `tsc` has existing errors in app.ts/deps.ts (ContentKernel, consentAudit), backstop-service, permanent-delete-deps and browser-binding. None are in touched lines.
- eslint: 0 errors on touched files.

## Decisions
- Provider ids follow the frozen grammar (`local`, `s3_compatible`). The env value `s3` maps to `s3_compatible`. A connection's target id is the provider id with `_` replaced by `-`.
- A remote setting takes effect at the next restart, because the provider is resolved once, on first media use.
- Local reads lost `LocalFsBlobStore`'s in-process size cache, which costs one `stat` per `sizeOf`.

## Risks / follow-ups
- Switching a live site from local to S3 makes its existing blobs unreadable until they are copied over. This was already true and is documented.
- When media is remote through the setting rather than env, the site backup still includes the local uploads folder, because `mediaIsRemoteByEnv` only reflects the env override.
- Letting third parties add providers is still blocked by the separate trust decision (audit point 1).
- The plugin.json `provides` list does not yet include `object-store:s3_compatible` (left out: unknown schema).

## LOCAL-RUN NEEDED
- A real S3/R2/MinIO round trip, for both media through `mediaBucket` and env `s3`, and for a share upload and verify.
- The Postgres site variant of the boot.
- The admin UI showing the two new connection fields.
- A full `npm test` / `pnpm -r test`.
