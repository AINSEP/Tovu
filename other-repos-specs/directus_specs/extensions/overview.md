# Directus Extensions Overview

**Source files analyzed:**
- `other-repos/directus/packages/constants/src/extensions.ts`
- `other-repos/directus/packages/extensions/src/shared/constants/pkg-key.ts`
- `other-repos/directus/packages/extensions/src/shared/schemas/manifest.ts`
- `other-repos/directus/packages/extensions/src/shared/schemas/options.ts`
- `other-repos/directus/packages/types/src/extensions/app-extension-config.ts`
- `other-repos/directus/packages/extensions/src/node/utils/get-extensions.ts`
- `other-repos/directus/packages/extensions/src/node/utils/generate-extensions-entrypoint.ts`
- `other-repos/directus/packages/extensions-sdk/src/cli/commands/create.ts`
- `other-repos/directus/packages/extensions-sdk/src/cli/commands/build.ts`
- `other-repos/directus/packages/extensions-sdk/src/cli/commands/link.ts`
- `other-repos/directus/app/src/extensions.ts`
- `other-repos/directus/app/src/stores/extensions.ts`
- `other-repos/directus/api/src/extensions/manager.ts`
- `other-repos/directus/api/src/controllers/extensions.ts`
- `other-repos/directus/api/src/services/extensions.ts`

---

## 1. Overview

Directus extensions are not a single plugin type. The source tree divides them into four runtime categories:

- app extensions, which register UI capabilities in the admin app
- API extensions, which register backend hooks and endpoints
- hybrid extensions, which split app and API entrypoints
- bundle extensions, which package multiple nested extensions under one installable unit

This is a platform-level extension system, not just a build-time convention. The API loads extension definitions from disk and registry installs, persists extension settings in `directus_extensions`, and exposes those settings through the `/extensions` controller. The admin app then consumes the resulting extension registry to render UI types and to know when a reload is required.

---

## 2. Extension Type Families

`packages/constants/src/extensions.ts` defines the product taxonomy:

- app extensions: `interface`, `display`, `layout`, `module`, `panel`, `theme`
- API extensions: `hook`, `endpoint`
- hybrid extensions: `operation`
- bundle extensions: `bundle`

The grouped constants matter because different runtime paths only accept subsets:

- `NESTED_EXTENSION_TYPES` excludes bundles
- `APP_OR_HYBRID_EXTENSION_TYPES` are the browser-visible extension families
- `APP_OR_HYBRID_EXTENSION_PACKAGE_TYPES` are the browser-visible families plus bundles

This makes the extension system explicitly typed around where each extension can execute.

---

## 3. Manifest Contract

The extension package manifest is validated by `ExtensionManifest` and keyed by `directus:extension`.

Required package fields:

- `name`
- `version`
- `directus:extension`

Optional package fields:

- `type` at the package level, used by the SDK to decide whether built output should target ESM or CJS
- `description`
- `icon`
- `dependencies`
- `devDependencies`

The `directus:extension` object controls runtime behavior. Its schema distinguishes:

- `host`
- optional `hidden`
- app extension `path` and `source`
- API extension `path`, `source`, and optional `sandbox`
- hybrid extension split `path` and `source` objects with `app` and `api`
- bundle extension `path`, optional `partial`, and nested `entries`

The source docs make a hard distinction between:

- `source` or `input` locations used during development/build
- `path` locations used after build output exists

That separation is what lets Directus compile one representation and load another at runtime.

---

## 4. Runtime Extension Shapes

`packages/types/src/extensions/app-extension-config.ts` defines the internal runtime shapes.

### 4.1 App and API extensions

An `AppExtension` stores:

- `path`
- `name`
- `local`
- optional `version`
- optional `host`
- a string `entrypoint`
- a type from the app extension set

An `ApiExtension` stores the same base fields plus:

- optional `sandbox`
- a string `entrypoint`
- a type from the API extension set

### 4.2 Hybrid extensions

A `HybridExtension` uses split entrypoints:

- `entrypoint.app`
- `entrypoint.api`

It also carries optional sandbox metadata. That split is important because the app side and API side are loaded through different mechanisms.

### 4.3 Bundle extensions

A `BundleExtension` adds:

- `partial`
- split `entrypoint`
- `entries[]`

Each bundle entry is only a lightweight descriptor with:

- `name`
- `type`

The bundle itself is what Directus loads, while the entry list tells the platform what nested extensions exist inside it.

---

## 5. Discovery And Resolution

`packages/extensions/src/node/utils/get-extensions.ts` is the source-side discovery layer.

### 5.1 Filesystem extensions

Local extension folders are discovered by scanning the extensions root and reading each folder's `package.json`.

Rules:

- invalid folders are ignored
- manifests are parsed through `ExtensionManifest`
- each parsed manifest is converted into a runtime `Extension` record

### 5.2 Module extensions

Module extensions are discovered from package dependencies:

- Directus reads the root `package.json`
- it resolves dependency packages from the workspace root
- packages that contain `directus:extension` are treated as extensions

This makes module extensions a first-class runtime source rather than a special case in the admin app.

### 5.3 Definition mapping

The manifest-to-runtime mapping is deterministic:

- bundle manifests become bundle runtime records with split entrypoints and nested entries
- hybrid manifests become split app/API runtime records
- hook and endpoint manifests become API runtime records
- app extension manifests become single-entry app runtime records

The runtime object is what the API and admin app consume after loading.

---

## 6. Admin App Registration

`app/src/extensions.ts` is the app-side integration hub.

### 6.1 Extension loading

The admin app tries to import extension configs from:

- `@directus-extensions` in development
- `extensions/sources/index.js` in built/runtime mode

If loading fails, the app only logs a warning and continues booting. That is a deliberate failure mode: extension loading is optional, but the app should remain usable.

### 6.2 Registered families

The app registers:

- interfaces
- displays
- layouts
- modules
- panels
- operations
- themes

Themes are treated as the first family that does not rely on internally scoped extensions.

### 6.3 Translation awareness

The app watches locale changes and re-translates extension metadata reactively. That means extension labels are not static build artifacts; they are part of the app state.

### 6.4 Module hydration

App modules are permission-aware and session-aware. The app only exposes modules that pass their pre-registration checks after hydration.

---

## 7. API Runtime Registration

`api/src/extensions/manager.ts` is the backend runtime orchestrator.

### 7.1 Source buckets

The manager tracks extensions from three sources:

- `local`
- `registry`
- `module`

### 7.2 Load lifecycle

The manager can:

- initialize the extension set
- unload all runtime registrations
- reload with queued sequencing to avoid race conditions
- auto-watch local filesystem changes when enabled

### 7.3 Registration targets

The API registers:

- hooks
- endpoints
- operations
- bundles

It also maintains:

- a custom endpoint router for extension-defined routes
- a local event emitter for extension-scoped events
- embed strings for app HTML head and body injection

### 7.4 Sandbox support

When sandboxing is enabled, API extension code is executed in an isolated VM with a restricted `directus:api` import boundary. That is a security boundary, not just a convenience wrapper.

---

## 8. Why Bundles Are Different

Bundle extensions are not just a directory of sibling extensions.

Source behavior:

- the bundle itself is loaded as one runtime unit
- nested entries are selectively enabled through stored settings
- the API registers only enabled nested hooks, endpoints, and operations
- the app-side bundle generation flattens enabled browser-visible nested entries into a single app bundle

This means bundle-level enablement and child-level enablement both matter.

---

## 9. Operational Implications

The extension subsystem has several real operational consequences:

- extension loading can fail independently from the core app, but the API logs and may abort on critical sync or extraction failures
- extension state is persisted in `directus_extensions`, so runtime behavior is database-backed rather than purely filesystem-backed
- reloads are sequenced to avoid inconsistent registration state
- app-visible extensions can require browser reloads even when the backend has already refreshed
- marketplace-installed extensions must be tracked separately from local extensions because uninstall and reinstall are constrained by source

This makes Directus extensions a coupled runtime/data system, not a simple package manager wrapper.

---

## 10. Follow-Up Areas

Later specs should inspect:

- `api/src/extensions/lib/installation/manager.ts`
- `api/src/extensions/lib/sync/sync.ts`
- `packages/extensions-registry/src/modules/*`
- `app/src/stores/extensions.ts`
- `packages/extensions-sdk/src/cli/commands/*`

---

## 11. Tovu Reconstruction Notes

### 11.1 Why this exists

This subsystem exists so the platform can gain new UI and backend capabilities without rewriting core packages. Directus treats extensions as a managed runtime asset system with manifests, registration rules, persistent state, and safety boundaries.

### 11.2 What Tovu should preserve

- A typed extension taxonomy instead of one undifferentiated “plugin” bucket
- A manifest/registry contract that says where an extension may execute
- Runtime enable/disable state outside the extension package itself
- A security boundary between trusted core code and user-installed backend code

### 11.3 What Tovu can simplify

- V1 does not need every Directus extension family
- Tovu can start with local app modules and backend hooks before adding bundles, themes, marketplace installs, or remote registry sync
- Browser reload detection and partial bundle semantics can come later if the registry model is already explicit

### 11.4 Possible Tovu seams

- `src/features/extensions/` for install/enable/disable/use-case logic
- `src/core/ports/ExtensionRegistryPort.ts` for discovering and storing extension state
- `src/core/ports/ExtensionRuntimePort.ts` for loading app/api extension entrypoints behind adapters
- `src/admin-shell/` should consume extension metadata, not resolve extension packages directly

### 11.5 Suggested priority

- `V1`: explicit manifest contract, local extension discovery, enable/disable state, safe app/backend loading seams
- `Later`: marketplace/registry flows, bundle semantics, stronger sandboxing and install orchestration
