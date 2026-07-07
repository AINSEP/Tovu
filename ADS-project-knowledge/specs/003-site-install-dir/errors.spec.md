# Error Code Registry Spec: Site Install Dir — Instantiate a Template, Serve the Folder

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-003`
- Feature: `FEAT-003-site-install-dir`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:20:00Z`

## Purpose
Canonical error registry for the CLI/process surface. This feature has no HTTP errors; the "HTTP Status" column of the template is replaced by **process exit code**, and the envelope is the stderr line contract.

## 1) Error Envelope (Base Payload)

```yaml
stderr_line: "tovu: <CODE>: <human message>"   # exactly one line, machine-parseable prefix
exit_code: integer                              # per §2; contract for CI and the desktop host
```

## 2) Error Code Registry

| Code | Category | Layer | Exit Code | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `VALIDATION` | usage | `cli` | 2 | no | Bad/missing arguments, empty `--name`, unknown command — print usage after the error line. |
| `INIT_DIR_NOT_EMPTY` | validation | `cli` | 3 | no | "Target exists and is not an empty directory." Covers file-at-path too (EC-02). |
| `SITE_DIR_INVALID` | validation | `cli` | 3 | no | "Not a Tovu site (missing/corrupt config.json, .site-meta.json, or content.db)." Include which file failed and why (EC-03, AC-05). |
| `SITE_NEWER_THAN_RUNTIME` | compatibility | `cli` | 4 | no | "This site needs a newer tovu (site schema vN, this tovu supports vM). Upgrade tovu." Never migrate down (REQ-05). |
| `SITE_CORRUPT` | integrity | `cli` | 5 | no | Workspace-count violations (AC-09), unreadable/locked db (EC-05). Name the specific integrity failure. |
| `PORT_IN_USE` | environment | `cli` | 1 | yes (after freeing the port) | "Port <n> is already in use." (EC-04) |
| `INTERNAL` | internal | `cli` | 1 | maybe | Unexpected failure; init performs cleanup first (INV-02), then reports. |

## 3) Per-Code Details Schema

```yaml
SITE_DIR_INVALID:
  file: enum[config.json, .site-meta.json, content.db]   # in the message text
  reason: string                                          # parse error / missing / not a file

SITE_NEWER_THAN_RUNTIME:
  siteSchemaVersion: integer
  runtimeSchemaVersion: integer

PORT_IN_USE:
  port: integer
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `VALIDATION` | CLI arg parser | CLI main | usage printed after the error line |
| `INIT_DIR_NOT_EMPTY` | init target validation (step 1, BR-01) | CLI main | checked before anything is created |
| `SITE_DIR_INVALID` | `readSiteDir` selector | CLI main | serve-time; also covers crashed-init dirs (missing commit marker) |
| `SITE_NEWER_THAN_RUNTIME` | schema guard (serve step 2, BR-05) | CLI main | compares `.site-meta.json.schemaVersion` to the runtime constant |
| `SITE_CORRUPT` | `resolveWorkspace` / db open | CLI main | includes SQLite busy/lock (EC-05) |
| `PORT_IN_USE` | HTTP listener `EADDRINUSE` | CLI main | after all validation passed |
| `INTERNAL` | any uncaught error | CLI main | init path runs cleanup before reporting (INV-02) |

## 5) Acceptance Checklist

- [x] Every code has an exit code, retryability, ownership, and user guidance
- [x] Every code maps to at least one AC or EC in feature.spec.md (see traceability.spec.md §4)
- [x] No exit code is reused for two distinguishable failure kinds without distinct `CODE` values on the stderr line (exit 3 disambiguated by `INIT_DIR_NOT_EMPTY` vs `SITE_DIR_INVALID`; exit 1 by `PORT_IN_USE` vs `INTERNAL`)
