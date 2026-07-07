# Error Code Registry Spec: Plugin System — Artifact, Loader, One Hook, `ext.*` Fields (v1)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-005`
- Feature: `FEAT-005-plugin-system`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T04:10:00Z`

## Purpose
Canonical error registry for this feature: HTTP codes on the plugin endpoints and the content write path, plus the plugin-validation vocabulary carried inside `PLUGIN_INVALID` details and `PLUGINS_LIST` records.

## 1) Error Envelope (Base Payload)

SPEC-001/002/004 envelope unchanged:

```yaml
error: string
code: string|null          # REQUIRED on new endpoints and the new failure kinds
details: object|null       # PLUGIN_INVALID carries the validation error list here
```

## 2) Error Code Registry (HTTP)

| Code | Category | Layer | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---|---:|---|
| `PLUGIN_NOT_FOUND` (new) | resource | `api` | 404 | no | "No plugin with that id is installed." |
| `PLUGIN_INVALID` (new) | validation | `api` | 422 | no (fix the plugin) | "This plugin failed validation and cannot be enabled." + error list in details |
| `PLUGIN_INCOMPATIBLE` (new) | validation | `api` | 422 | no | "This plugin requires a different SDK version." (sdkRange miss) |
| `PLUGIN_HOOK_FAILED` (new) | internal | `api`/`feature` | 500 | maybe | "A plugin failed while processing this action; nothing was changed." (fail-closed, EC-10) |
| `VALIDATION_ERROR` | validation | `api` | 400 | no | Malformed request body (existing behavior) |
| `DUPLICATE_COMMAND` | idempotency | `api` | 409 | no | SPEC-001, unchanged |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | Unchanged |

## 3) Validation Error Vocabulary (inside `PLUGIN_INVALID.details.errors[]` and `PLUGINS_LIST.plugins[].errors[]`)

> **Scoping (suite-wide namespace rule).** These codes are **envelope-scoped detail identifiers**, not global error codes. Their canonical identity is the pair `(PLUGIN_INVALID, <code>)` — equivalently `PLUGIN_INVALID.details.errors[].code` — and they live only inside the `PLUGIN_INVALID` / `PLUGINS_LIST` surfaces owned by the plugin validator. SPEC-004 defines a **deliberately parallel** vocabulary scoped to `THEME_INVALID`; identical strings (`MANIFEST_MISSING`, `ID_DUPLICATE`, `ENGINE_UNSUPPORTED`, …) in the two specs are **distinct scoped codes with distinct owners**, not a shared global code. Suite-level tooling, generated enums, and traceability checks MUST key these by `(parent envelope, code)`, never by the bare string. The two validators intentionally mirror each other's shape but never share a registry.

| Validation code | Trigger | REQ/EC |
|---|---|---|
| `MANIFEST_MISSING` | no `tovu.plugin.json` | REQ-01 |
| `MANIFEST_MALFORMED` | unparseable JSON / schema violation / missing required field / unknown top-level key | REQ-01 / AC-12 |
| `ID_FOLDER_MISMATCH` | `id` ≠ install folder name | EC-01 |
| `ID_DUPLICATE` | case-insensitive id collision between site plugins | DUP-01 |
| `SHADOWS_BUILT_IN` | site plugin id equals a built-in id | DUP-01 |
| `CODE_ENTRY_MISSING` | no `server/index.mjs` | REQ-01 / AC-12 |
| `INTEGRITY_FAILED` | a packaged file's bytes ≠ its `integrity` hash | REQ-03 / AC-03 / INV-04 |
| `SDK_RANGE_UNSATISFIED` | `sdkRange` excludes the runtime `@tovu/sdk` version ⇒ status `incompatible` | REQ-03 / AC-04 / EC-02 |
| `ENGINE_UNSUPPORTED` | `engine` newer than the runtime supports | REQ-01 |
| `CAPABILITY_UNKNOWN` | declares a capability outside the v1 vocabulary | REQ-04 |
| `CAPABILITY_DENIED` | (runtime) calls a surface not in declared capabilities | REQ-04 / AC-05 / EC-06 / INV-02 |
| `HOOK_UNKNOWN` | attaches to an undeclared hook point | REQ-05 / AC-06 / EC-05 / INV-06 |
| `FIELD_PATH_INVALID` | field path not `ext.{selfId}.*` | REQ-06 / AC-07 |
| `FIELD_TYPE_MISMATCH` | written value doesn't match the declared field type | REQ-06 / AC-07 |
| `QUERYABLE_UNSUPPORTED_V1` | a field declared `queryable: true` | REQ-06 / AC-08 / EC-04 |
| `DDL_ATTEMPTED` | plugin attempts a schema operation | INV-01 |
| `PACKAGE_TOO_LARGE` | artifact over the size bound (behavior.spec.md §7) | REQ-01 |
| `FILE_NOT_ALLOWED` | file outside the allowed artifact set | REQ-01 |

Every record: `{ code, file: string|null, message }` — `file` names the offending packaged file when applicable.

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `PLUGIN_NOT_FOUND` | enable guard (feature layer, before gateway) | `PLUGIN_SET_ENABLED` route | discovery has no record with that id |
| `PLUGIN_INVALID` | enable-time re-validation | `PLUGIN_SET_ENABLED` route | carries the fresh validation error list |
| `PLUGIN_INCOMPATIBLE` | `sdkRange` check | `PLUGIN_SET_ENABLED` route | distinct from `PLUGIN_INVALID` for actionability |
| `PLUGIN_HOOK_FAILED` | hook runner (capability breach or thrown filter) | `ENTRY_CREATE`/`ENTRY_UPDATE` routes | fail-closed: entry unchanged, no change set (EC-06/EC-10) |
| validation vocabulary (§3) | plugin validator module | `PLUGINS_LIST` records + `PLUGIN_INVALID` details | one validator, two surfaces — never diverge (mirrors SPEC-004) |
| `VALIDATION_ERROR` / `DUPLICATE_COMMAND` / `INTERNAL_ERROR` | existing owners | existing mapping | unchanged |

## 5) Acceptance Checklist

- [x] Every code has HTTP status, retryability, ownership, and user guidance
- [x] Every code maps to at least one AC or EC in feature.spec.md (see traceability.spec.md §4)
- [x] No status code is reused for two distinguishable failure kinds on the same endpoint without distinct `code` values (`PLUGIN_SET_ENABLED`: 404 `PLUGIN_NOT_FOUND` vs 422 `PLUGIN_INVALID` vs 422 `PLUGIN_INCOMPATIBLE` vs 400 `VALIDATION_ERROR`)
- [x] The fail-closed content path is explicit: `PLUGIN_HOOK_FAILED` never leaves a partial write (EC-10)
