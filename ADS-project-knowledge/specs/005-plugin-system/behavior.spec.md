# Behavior Rules Spec: Plugin System — Artifact, Loader, One Hook, `ext.*` Fields (v1)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-005 |
| feature_name | FEAT-005-plugin-system |
| version | 1.0.0 |
| content_hash | sha256:see feature.spec.md (package hash of record) |
| last_edited | 2026-07-07T04:10:00Z |

**Purpose:** Deterministic rules for the load pipeline, validation ordering, capability enforcement, hook firing, enable/disable lifecycle, `ext` writes, and fail-closed handling. All rules use EARS syntax.

---

## 1. Load Pipeline (BR-01)

- BR-01: WHEN loading a plugin (at boot for enabled plugins, and on enable), the system shall execute in this exact order, short-circuiting on the first failure: (1) verify every packaged file against `integrity` (`INTEGRITY_FAILED`); (2) check `sdkRange` satisfies the runtime `@tovu/sdk` version (`SDK_RANGE_UNSATISFIED` ⇒ status `incompatible`); (3) dynamic `import()` `server/index.mjs` (`CODE_ENTRY_MISSING` if absent); (4) invoke `definePlugin` with a capability-scoped SDK exposing only declared capabilities; (5) attach declared hooks to their declared points. A failure at any step leaves the plugin **not loaded**, its `PluginDiscoveryRecord.status` recording the reason; no partial registration persists.

## 2. Validation Ordering (BR-02…BR-03)

- BR-02: WHEN validating a plugin package, the system shall evaluate in this order and collect ALL statically-determinable errors (not first-failure): (1) package-level (size, disallowed files, `server/index.mjs` presence), (2) manifest (presence, parse, schema, required fields, unknown keys, id/folder match, engine), (3) identity (duplicate ids, built-in shadowing), (4) capabilities (vocabulary membership), (5) hooks (declared points exist), (6) fields (namespacing, `queryable:false`, type shapes). Integrity and `sdkRange` are load-pipeline checks (BR-01), evaluated even when static validation passes.
- BR-03: WHEN any error exists, the status shall be `invalid` (or `incompatible` for `sdkRange` specifically); there is no warning-only tier in v1.

## 3. Capability Enforcement (BR-04-cap)

- BR-04-cap: WHEN a plugin obtains its SDK object, the builder shall expose ONLY the surfaces named by its declared `capabilities`. WHEN the plugin invokes any surface it did not declare, the boundary shall throw `CAPABILITY_DENIED` (INV-02). This is API-surface enforcement, not a sandbox — the module can still reach `fs`/`process`/network (ADR-004; never marketed as isolation).

## 4. Hook Firing (BR-04)

- BR-04: WHEN a content entry is created or updated, the system shall run every enabled plugin's `content.entry.beforeSave` filter, in deterministic order (built-ins first by id asc, then site plugins by id asc — same order as TB-01). Each filter receives the **read-only** entry draft and returns an `ExtPatch`; the system merges each patch into that plugin's own `ext.{pluginId}` namespace (validated per BR-06) before persisting. Filters cannot mutate core entry fields (`title`/`slug`/`status`/`bodyJson`) — a returned key targeting a core field is rejected `FIELD_PATH_INVALID` (RT-001). Because each plugin writes only its own namespace, filter order does not create write conflicts. Disabled plugins' filters shall not run. In v1 exactly one hook point exists.

## 5. Enable / Disable Lifecycle (BR-05)

- BR-05: WHEN an enable or disable is requested, the system shall evaluate: (1) body shape (`VALIDATION_ERROR`), (2) id present in discovery (`PLUGIN_NOT_FOUND`), (3) when enabling, `status "valid"` (else `PLUGIN_INVALID` / `PLUGIN_INCOMPATIBLE`) — and only then enter the SPEC-001 gateway, recording exactly one applied change set. Enabling loads and registers the module; disabling unloads it (hooks detached). Disable is the inverse of enable: reverting the enable change set disables the plugin, and vice versa. `ext.{pluginId}` data is never touched by either transition (INV-03).

## 6. `ext` Field Writes (BR-06)

- BR-06: WHEN an enabled plugin writes an `ext` field inside a `beforeSave` filter, the system shall validate: the path is `ext.{selfId}.{field}` for a field the plugin declared (`FIELD_PATH_INVALID` otherwise), and the value matches the declared type (`FIELD_TYPE_MISMATCH` otherwise). The value is written into the record's `ext` JSON column within the same transaction as the SPEC-002 entry write — and is therefore part of the entry pre-image the SPEC-001 gateway captures for revert (BR-08). No DDL runs (INV-01).

## 7. Fail-Closed Handling (BR-07)

- BR-07: WHEN a `content.entry.beforeSave` filter throws, OR triggers `CAPABILITY_DENIED`, OR produces an invalid `ext` write, the containing content operation shall fail with `PLUGIN_HOOK_FAILED` (500), the entry shall be unchanged, NO change set shall be recorded, and one structured error shall be logged naming the plugin id and cause. (Automatic plugin quarantine / safe-mode is deferred to the `recovery` library — OQ-06.)

## 7a. `ext` Under Gateway Revert (BR-08)

- BR-08: WHEN the SPEC-001 gateway captures the inverse pre-image for a content-entry create or update (SPEC-001 BR-02), the pre-image shall include the entry's pre-edit `ext` object alongside its core fields, so the change-set item's `inversePayload` restores `ext` together with `title`/`slug`/`bodyJson`/`status`. WHEN a content-save change set is reverted, the restoring write shall re-apply the stored pre-edit `ext` snapshot verbatim and shall **NOT** fire `content.entry.beforeSave` — a revert re-applies a pre-image, it is not a genuine create/update (BR-04 fires only on the latter) — so no plugin recompute occurs during the revert; the next genuine save recomputes `ext` through the hook. Restoring the `ext` snapshot shall not require the contributing plugin to be enabled or installed (its data is retained inert per INV-03; the restore is a pure data write). This keeps SPEC-001's undo promise whole: revert returns the entry — core fields and plugin-derived `ext` — to exactly its pre-edit state in one step, with no stale plugin-visible values.

## 8. Deduplication Rules

- DUP-01: Two plugin records are duplicates iff their ids match case-insensitively. Site-vs-site duplicates mark BOTH `ID_DUPLICATE`; site-vs-built-in marks the site one `SHADOWS_BUILT_IN` and the built-in is unaffected (parity with SPEC-004 themes).

## 9. Ordering (TB-01)

- TB-01: `PLUGINS_LIST` ordering and hook-composition order shall both be: built-ins first by id ascending, then site plugins by id ascending. (One deterministic order for listing and execution avoids surprise.)

## 10. Default Values

| Field | Default | Why |
|---|---|---|
| `posts.ext` | `{}` | No plugin data on a fresh/legacy record |
| `plugin_activations` (unseeded) | absent ⇒ disabled | Seed enables nothing; opt-in only |
| `manifest.engine` absent | reject (`MANIFEST_MALFORMED`) | Required forward-compat gate |
| Discovery in legacy mode | built-ins only | No `plugins/` dir (EC-09) |
| Hook composition (no enabled plugins) | identity (draft unchanged) | Zero-plugin path is a no-op |

## 11. Limits and Bounds

| Constraint | Value | Enforcement |
|---|---:|---|
| Artifact total size | ≤ 10 MiB | validator ⇒ `PACKAGE_TOO_LARGE` |
| Plugin id length | 1…50 chars `^[a-z0-9-]+$` | validator ⇒ `MANIFEST_MALFORMED` |
| v1 capability vocabulary | exactly `content.read`, `content.extend`, `hooks.attach` | validator ⇒ `CAPABILITY_UNKNOWN` |
| v1 hook points | exactly `content.entry.beforeSave` | validator ⇒ `HOOK_UNKNOWN` |
| `ext` field `queryable` | must be `false` | validator ⇒ `QUERYABLE_UNSUPPORTED_V1` |
| Allowed artifact files | `tovu.plugin.json`, `server/*.mjs`, `admin/*` (parsed, unused v1), `assets/*`, `LICENSE`, `README.md` | validator ⇒ `FILE_NOT_ALLOWED` |

## 12. Edge Case Handling (EARS)

- IF `tovu.plugin.json.id` differs from its install folder name, THEN the plugin shall be `invalid` with `ID_FOLDER_MISMATCH` (EC-01).
- IF `sdkRange` excludes the runtime SDK version, THEN status shall be `incompatible` with `SDK_RANGE_UNSATISFIED` and enable shall return 422 `PLUGIN_INCOMPATIBLE` (EC-02).
- IF a packaged file's bytes do not match its `integrity` hash, THEN the plugin shall be `invalid` with `INTEGRITY_FAILED` and shall not load (EC-03).
- IF a field is declared `queryable: true`, THEN the plugin shall be `invalid` with `QUERYABLE_UNSUPPORTED_V1` (EC-04).
- IF a plugin attaches to any hook name other than `content.entry.beforeSave`, THEN it shall be `invalid` with `HOOK_UNKNOWN` (EC-05).
- IF a plugin calls an undeclared capability at runtime, THEN the boundary shall throw `CAPABILITY_DENIED` and the content op shall fail `PLUGIN_HOOK_FAILED`, entry unchanged (EC-06).
- IF a plugin is disabled, THEN its `ext` data shall remain readable (inert) and its filters shall not run (EC-07).
- IF two installed versions of one id exist, THEN only the active-pointer (`plugin_activations.version`) module shall load (EC-08).
- IF the runtime serves without an install dir, THEN discovery shall return built-ins only (EC-09).
- WHEN a `beforeSave` filter throws, THEN the save shall fail fail-closed with `PLUGIN_HOOK_FAILED`, no entry change, no change set, structured log (EC-10).
