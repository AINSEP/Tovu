# Error Code Registry Spec: Declarative Theme System — Manifest, Hierarchy Resolver, Activation

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-004`
- Feature: `FEAT-004-declarative-theme-system`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:35:00Z`

## Purpose
Canonical error registry for this feature: two new HTTP codes plus the validation-error vocabulary carried inside `THEME_INVALID` details and `THEMES_LIST` records.

## 1) Error Envelope (Base Payload)

SPEC-001/002 envelope unchanged:

```yaml
error: string
code: string|null          # REQUIRED on new endpoints and the new PATCH failure kinds
details: object|null       # THEME_INVALID carries the validation error list here
```

## 2) Error Code Registry (HTTP)

| Code | Category | Layer | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `THEME_NOT_FOUND` (new) | resource | `api` | 404 | no | "No theme with that id is installed." |
| `THEME_INVALID` (new) | validation | `api` | 422 | no (fix the theme) | "This theme failed validation and cannot be activated." + error list in details |
| `VALIDATION_ERROR` | validation | `api` | 400 | no | Malformed request body (existing behavior) |
| `DUPLICATE_COMMAND` | idempotency | `api` | 409 | no | SPEC-001, unchanged |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | Unchanged; never caused by theme data on public routes (INV-05) |

## 3) Validation Error Vocabulary (inside `THEME_INVALID.details.errors[]` and `THEMES_LIST.themes[].errors[]`)

> **Scoping (suite-wide namespace rule).** These codes are **envelope-scoped detail identifiers**, not global error codes. Their canonical identity is the pair `(THEME_INVALID, <code>)` — equivalently `THEME_INVALID.details.errors[].code` — and they live only inside the `THEME_INVALID` / `THEMES_LIST` surfaces owned by the theme validator. SPEC-005 defines a **deliberately parallel** vocabulary scoped to `PLUGIN_INVALID`; identical strings (`MANIFEST_MISSING`, `ID_DUPLICATE`, `ENGINE_UNSUPPORTED`, …) in the two specs are **distinct scoped codes with distinct owners**, not a redefinition of one global code. Suite-level tooling, generated enums, and traceability checks MUST key these by `(parent envelope, code)`, never by the bare string.

| Validation code | Trigger | REQ/EC |
|---|---|---|
| `MANIFEST_MISSING` | no `theme.json` | REQ-01 |
| `MANIFEST_MALFORMED` | unparseable JSON / schema violation / unknown top-level key | REQ-02 |
| `ID_FOLDER_MISMATCH` | `theme.json.id` ≠ folder name | EC-01 |
| `ID_DUPLICATE` | case-insensitive id collision between site themes | EC-02 |
| `SHADOWS_BUILT_IN` | site theme id equals a built-in id | REQ-05 / AC-09 |
| `ENGINE_UNSUPPORTED` | `engine` newer than the runtime supports | state.spec.md §7 |
| `CODE_FILE_PRESENT` | any executable file extension in the package | REQ-01 / AC-06 / INV-01 |
| `TEMPLATE_MISSING` | `home.json` or `entry.json` absent | REQ-01 |
| `TEMPLATE_MALFORMED` | unparseable/invalid node, unknown node type or slot name | REQ-04 |
| `TEMPLATE_TOO_COMPLEX` | depth > 50 or nodes > 5000 | EC-04 |
| `COMPONENT_UNKNOWN` | component id not in the registry | REQ-04 / AC-05 |
| `TOKENS_MISSING` / `TOKENS_MALFORMED` | required token absent / bad value | EC-03 |
| `CSS_FORBIDDEN` | fails the CSS allowlist: `@import`, external or `data:` `url()`, `@font-face` external `src`, `javascript:`/`expression()`/`-moz-binding`, or any other non-allowlisted construct | REQ-06 / AC-04 |
| `CSS_TOO_LARGE` | `styles.css` > 128 KiB | REQ-06 |
| `PACKAGE_TOO_LARGE` | total > 10 MiB | REQ-06 |
| `FILE_NOT_ALLOWED` | file outside the allowed set | REQ-06 |

Every record: `{ code, file: string|null, message }` — `file` names the offending package file when applicable.

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `THEME_NOT_FOUND` | activation guard (feature layer, before gateway) | presentation PATCH route | discovery has no record with that id |
| `THEME_INVALID` | activation re-validation (INV-02) | presentation PATCH route | carries the fresh validation error list |
| validation vocabulary (§3) | theme validator module | `THEMES_LIST` records + `THEME_INVALID` details | one validator, two surfaces — never diverge |
| `VALIDATION_ERROR` / `DUPLICATE_COMMAND` / `INTERNAL_ERROR` | existing owners | existing mapping | unchanged |

## 5) Acceptance Checklist

- [x] Every code has HTTP status, retryability, ownership, and user guidance
- [x] Every code maps to at least one AC or EC in feature.spec.md (see traceability.spec.md §4)
- [x] No status code is reused for two distinguishable failure kinds on the same endpoint without distinct `code` values (PATCH: 404 `THEME_NOT_FOUND` vs 422 `THEME_INVALID` vs 400 `VALIDATION_ERROR`)
