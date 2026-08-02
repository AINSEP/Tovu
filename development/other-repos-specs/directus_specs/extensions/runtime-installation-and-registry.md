# Directus Extension Runtime, Installation, And Registry

**Source files analyzed:**
- `other-repos/directus/api/src/controllers/extensions.ts`
- `other-repos/directus/api/src/services/extensions.ts`
- `other-repos/directus/api/src/extensions/manager.ts`
- `other-repos/directus/api/src/extensions/lib/installation/manager.ts`
- `other-repos/directus/api/src/extensions/lib/sync/sync.ts`
- `other-repos/directus/api/src/extensions/lib/get-extensions-settings.ts`
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/app/src/stores/extensions.ts`
- `other-repos/directus/packages/extensions-registry/src/modules/list/schemas/registry-list-response.ts`
- `other-repos/directus/packages/extensions-registry/src/modules/describe/schemas/registry-describe-response.ts`
- `other-repos/directus/packages/extensions-registry/src/modules/download/download.ts`
- `other-repos/directus/packages/extensions-sdk/src/cli/commands/build.ts`
- `other-repos/directus/packages/extensions-sdk/src/cli/commands/link.ts`
- `other-repos/directus/packages/extensions-sdk/src/cli/commands/validators/check-directus-config.ts`
- `other-repos/directus/packages/extensions-sdk/src/cli/commands/validators/check-built-code.ts`

---

## 1. Overview

The extension runtime in Directus has three distinct phases:

1. discover extensions from filesystem, workspace packages, and registry installs
2. persist extension settings and register runtime hooks, endpoints, and app sources
3. serve admin-app extension chunks and expose registry/install APIs for management

The important detail is that installation is not just "download a tarball". It updates stored extension settings, syncs extension files into the configured extensions location, reloads the extension manager, and may require a browser refresh before the admin app sees the new UI surface.

---

## 2. Registry Surfaces

`api/src/controllers/extensions.ts` exposes the registry-facing endpoints.

### 2.1 Installed extension list

`GET /extensions`

This returns the persisted extension records plus runtime schema data. The service waits for in-flight extension reloads before returning data, so callers see a consistent snapshot.

### 2.2 Marketplace list and detail

Admin-only registry routes:

- `GET /extensions/registry`
- `GET /extensions/registry/account/:pk`
- `GET /extensions/registry/extension/:pk`

The registry list accepts query filters for:

- search
- limit
- offset
- sort by `popular`, `recent`, or `downloads`
- `by`
- `type`

The registry endpoints are gated to admins. They also respect environment overrides:

- `MARKETPLACE_REGISTRY` can redirect the registry base URL
- `MARKETPLACE_TRUST=sandbox` forces sandboxed registry queries

### 2.3 Registry install lifecycle

Admin-only mutation routes:

- `POST /extensions/registry/install`
- `POST /extensions/registry/reinstall`
- `DELETE /extensions/registry/uninstall/:pk`

These routes are thin wrappers over `ExtensionsService`. The actual install/uninstall work happens in the service and extension manager.

### 2.4 Extension metadata update and removal

Additional routes:

- `PATCH /extensions/:pk`
- `DELETE /extensions/:pk`

These mutate the stored record in `directus_extensions`, not a remote registry entry.

---

## 3. Stored Extension Settings

`ExtensionsService` persists extension state through `directus_extensions`.

Each stored row captures:

- `id`
- `source` (`module`, `registry`, or `local`)
- `enabled`
- `bundle`
- `folder`

The service re-reads data through the item service and re-hydrates runtime schemas from the extension manager. That means the API response is a join of database metadata and runtime extension definitions.

### 3.1 Read consistency

`readAll()` and `readOne()` both wait for the extension manager to finish reloading before returning. That is the mechanism that keeps the admin UI from seeing half-updated extension state during install or refresh cycles.

### 3.2 Update behavior

`updateOne()` updates the extension metadata inside a transaction, then schedules a manager reload and broadcast notification.

Important side effect:

- changing `enabled` on a bundle entry can cause parent/child enabled states to be synchronized

### 3.3 Delete behavior

`deleteOne()` removes the selected extension row and any children whose `bundle` matches that extension id. Bundle removal is therefore recursive at the metadata layer.

---

## 4. Install And Reinstall Flow

`api/src/services/extensions.ts` implements the registry operations.

### 4.1 Pre-install validation

`preInstall()` resolves the registry extension and version, then checks:

- the version exists on the selected registry entry
- the configured extension count limit has not been exceeded

Bundle extensions are counted by nested bundled entries rather than as a single slot. That closes the obvious loophole where a bundle could hide many extensions behind one install record.

### 4.2 Install

`install(extensionId, versionId)` does the following:

1. validate the registry version
2. create a root settings row with `source: 'registry'`
3. if the extension is a bundle, create settings rows for nested bundled entries
4. call `extensionManager.install(versionId)`

That sequence matters because the settings rows must exist before the manager finishes its reload cycle.

### 4.3 Reinstall

`reinstall(id)` is allowed only for registry-installed root extensions. It rejects:

- non-registry extensions
- bundled child entries

It re-validates the version and then re-runs the manager install path.

### 4.4 Uninstall

`uninstall(id)` is allowed only for registry-installed root extensions. It rejects:

- local or module installs
- bundled child entries

This keeps Directus from removing a child extension separately from its owning bundle.

---

## 5. Extension File Sync And Extraction

`api/src/extensions/lib/installation/manager.ts` handles registry download and extraction.

### 5.1 Download

The manager downloads the selected version from the registry using the registry client.

If download fails, the manager raises a marketplace-facing service error. That keeps network/registry failures separate from local extraction errors.

### 5.2 Package validation

After extracting the tarball, the manager reads the package manifest and validates it through `ExtensionManifest`.

Critical checks:

- the extracted package must declare `directus:extension`
- the extension type must be present
- the unpacked content must be extractable into the local or remote extensions location

### 5.3 Local and remote write paths

If `EXTENSIONS_LOCATION` is configured:

- files are copied into the configured storage location under `EXTENSIONS_PATH/.registry/<versionId>/...`

Regardless of remote storage:

- the extracted package is moved into the local extensions cache under `.registry/<versionId>`

The install flow therefore targets both:

- durable remote storage when configured
- local runtime file availability for the current process

### 5.4 Cleanup

Temporary install directories are removed after installation succeeds or fails.

---

## 6. Extension Location Sync

`api/src/extensions/lib/sync/sync.ts` keeps the runtime cache aligned with the configured extensions location.

### 6.1 Multi-process coordination

Sync uses a lock and a bus channel so only one process at a time performs the filesystem sync. Other processes wait for the completion signal instead of racing the copy.

### 6.2 Incremental behavior

The sync logic can:

- force a full sync
- partially sync a single extension folder
- skip syncing on the process that already handled an install or uninstall

### 6.3 File-level reconciliation

The sync pass:

- creates the local extensions directory if needed
- compares remote and local metadata when not forcing
- copies remote files into the local cache
- cleans up dangling local files

This is operationally important because the extension manager loads from the local cache, not directly from remote storage.

---

## 7. App Chunk Delivery

The admin app cannot directly load extension code from the database. It gets generated JavaScript chunks from the API.

### 7.1 Bundle generation

`api/src/extensions/manager.ts` generates an app extension bundle after loading extensions when `SERVE_APP` is enabled.

It uses:

- the discovered extension maps
- the persisted extension settings
- `generateExtensionsEntrypoint(...)`
- Rollup or Rolldown

### 7.2 Chunk storage

The generated chunks are written into a temp directory under `TEMP_PATH/app-extensions`. The manager tracks the emitted chunk file names in memory.

### 7.3 HTTP delivery

`GET /extensions/sources/:chunk`

Behavior:

- `index.js` resolves to the generated entry chunk
- any other chunk name resolves against the stored chunk list
- missing chunks return `RouteNotFoundError`
- response is served as JavaScript
- cache headers are derived from `EXTENSIONS_CACHE_TTL`

This is the bridge between the backend runtime and the admin app's extension loader.

---

## 8. Admin Reload Semantics

`app/src/stores/extensions.ts` shows how the UI reacts to backend extension changes.

### 8.1 Enabled browser-visible set

The store computes browser-visible extension ids from:

- enabled app and hybrid extensions
- enabled entries inside bundles

Bundle parents are only treated as enabled for browser reload detection when they are non-partial and at least one child is enabled.

### 8.2 Reload notification

After refresh, the store compares the previous enabled browser-visible set with the new one.

If the set changed, it shows a persistent reload warning and offers a reload action.

That means extension changes can be reflected in the API immediately while still requiring a browser reload to fully activate the app-side code.

---

## 9. Build And Link Tooling

The SDK commands explain what Directus expects on disk.

### 9.1 Build output

`packages/extensions-sdk/src/cli/commands/build.ts` uses the manifest to decide whether to build:

- single app/API extensions
- hybrid extensions
- bundles

The build output format depends on the package `type` field:

- `module` -> ESM
- `commonjs` -> CJS

### 9.2 Link behavior

`packages/extensions-sdk/src/cli/commands/link.ts` creates a symlink into the configured extensions folder.

Important detail:

- extension names are flattened by replacing `/` with `-`

That keeps scoped package names detectable in the extensions directory.

### 9.3 Validation

The SDK validators enforce:

- presence of `directus:extension`
- a valid extension type
- valid output paths
- valid host semver range
- built files exist at the configured output path

This is the front-line contract that prevents invalid extension packages from reaching runtime.

---

## 10. Operational Implications

The runtime behavior has a few non-obvious consequences:

- registry installs are source-restricted and admin-restricted
- uninstall and reinstall are intentionally blocked for locally managed extensions
- bundle children cannot be independently uninstalled if they were installed as part of a bundle
- app bundle delivery depends on backend chunk generation, so browser-visible changes may lag until the reload notification is acted on
- extension sync is process-coordinated, which matters in multi-instance deployments
- `EXTENSIONS_LIMIT` is enforced in terms of effective extension count, not package count

This is a fairly strict lifecycle model. Directus is treating extensions as managed runtime assets with schema, storage, and reload semantics, not as loose userland plugins.

---

## 11. Follow-Up Areas

Second-pass specs should inspect:

- `api/src/extensions/lib/sandbox/*`
- `api/src/extensions/lib/get-extensions.ts`
- `packages/extensions-registry/src/modules/*`
- `packages/extensions-sdk/src/cli/commands/add.ts`
- `app/src/extensions.ts`

---

## 12. Tovu Reconstruction Notes

### 12.1 Why this exists

This subsystem exists because extension support is not finished once manifests load. The platform also needs installation, sync, enablement, reload semantics, registry rules, and operational constraints around what came from where.

### 12.2 What Tovu should preserve

- Installation and runtime enablement are separate lifecycle steps
- Source provenance matters: local, bundled, registry, or otherwise
- Browser-visible extension changes may require their own refresh/reload path
- Multi-instance sync/reload behavior should be treated as operational infrastructure, not incidental UI state

### 12.3 What Tovu can simplify

- V1 does not need marketplace install flows
- Extension sync and reload can start simpler if the lifecycle model remains explicit
- Bundle-specific edge cases can come later if Tovu begins with simpler extension package shapes

### 12.4 Possible Tovu seams

- `src/features/extensions/` for install/sync/enable/disable workflows
- `src/core/ports/ExtensionInstallPort.ts` for registry/local installation logic
- `src/core/ports/ExtensionReloadPort.ts` for runtime/app refresh coordination

### 12.5 Suggested priority

- `V1`: local extension lifecycle and explicit reload semantics
- `Later`: registry installs, bundle-specific workflows, distributed sync coordination
