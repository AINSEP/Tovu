# API Contract Spec: Site Install Dir — Instantiate a Template, Serve the Folder

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-003`
- Feature: `FEAT-003-site-install-dir`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:20:00Z`

## Purpose
Source of truth for this feature's public surface. **This feature adds no HTTP endpoints and modifies none** — its public surface is the `tovu` command-line interface and the process contract. The registry below adapts the endpoint format to CLI commands; auth/rate-limit sections record the (unchanged) local posture.

## 1) Command Registry (CLI surface)

| Command ID | Invocation | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|
| `CLI_INIT` | `tovu init <dir> [--name <name>]` | Instantiate the starter template into a new install dir | `LOCAL_PROCESS` | `NONE_LOCAL` |
| `CLI_SERVE` | `tovu serve <dir> [--port <n>]` | Validate + migrate + boot the install dir, serve site + admin | `LOCAL_PROCESS` | `NONE_LOCAL` |
| `CLI_HELP` | `tovu --help` / `tovu` / unknown command | Print usage; unknown commands exit 2 | `LOCAL_PROCESS` | `NONE_LOCAL` |
| `LEGACY_DEV_BOOT` (unchanged) | `npm run dev` (+ `TOVU_DB` / `TOVU_CONTENT_DB` / `PORT` envs) | Pre-feature dev/test boot without an install dir | `LOCAL_PROCESS` | `NONE_LOCAL` |

The HTTP surface served by `CLI_SERVE` is byte-identical to the existing app (all SPEC-001/SPEC-002 endpoints); the only behavioral change behind it is workspace resolution (REQ-06), which is invisible on the wire.

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Roles | Notes |
|---|---|---|---|---|---|
| `LOCAL_PROCESS` | `false` | OS user running the process | none | local operator | The CLI trusts the invoking OS user (file-system permissions are the boundary). The served HTTP surface keeps `AUTH_LOCAL_DEV` (SPEC-001 Art. VI exception, unchanged). |

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `NONE_LOCAL` | n/a | n/a | n/a | n/a | No limiting; local CLI + dev server (unchanged from SPEC-001/002). |

## 4) Request Contracts (command inputs)

### Command: `CLI_INIT`
```yaml
dir:    { type: path, required: true, notes: "must not exist, or must be an empty directory (EC-01/EC-02)" }
--name: { type: string, required: false, minLength: 1 (after trim), maxLength: 200, default: "basename(dir)" }
```

### Command: `CLI_SERVE`
```yaml
dir:    { type: path, required: true, notes: "must be a completed install dir (REQ-04)" }
--port: { type: integer, required: false, range: 1..65535, notes: "precedence per BR-02" }
```

### Environment inputs
```yaml
PORT:             { type: integer, required: false, notes: "3rd in port precedence (BR-02)" }
TOVU_DB:          { type: enum[memory], required: false, notes: "legacy dev boot only (REQ-10); ignored when a dir argument is present (EC-08)" }
TOVU_CONTENT_DB:  { type: path, required: false, notes: "legacy flat-db boot only (REQ-10); ignored when a dir argument is present (EC-08)" }
```

## 5) Response Contracts (process outputs)

### `CLI_INIT` — success
```yaml
exit_code: 0
stdout: |
  created site '<name>' at <dir>        # exact wording implementation-owned; MUST include name and dir
  next: tovu serve <dir>
filesystem: install dir per state.spec.md §1 (the real contract)
```

### `CLI_SERVE` — success (long-running)
```yaml
exit_code: (runs until signal; 0 on SIGINT/SIGTERM graceful stop)
stdout: |
  one startup line including: dir, resolved port, schemaVersion, workspace id
http: existing app surface on the resolved port
```

### Error output (all commands)
```yaml
stderr: "tovu: <CODE>: <human message>"   # single machine-parseable line, code from errors.spec.md
exit_code: per errors.spec.md §2 (2 usage, 3 dir-validation, 4 compatibility, 5 corrupt, 1 other)
```

## 6) Status Code Map (exit codes)

| Command | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| `CLI_INIT` | created | internal/unexpected (after cleanup) | usage (`VALIDATION`) | `INIT_DIR_NOT_EMPTY` | — | — |
| `CLI_SERVE` | graceful stop | `PORT_IN_USE` / internal | usage | `SITE_DIR_INVALID` | `SITE_NEWER_THAN_RUNTIME` | `SITE_CORRUPT` (incl. workspace-count, db-lock) |
| `CLI_HELP` | help printed | — | unknown command | — | — | — |

## 7) Compatibility Rules

- The install-dir layout and the two JSON file schemas (state.spec.md §2) are **compatibility surfaces** shared with the future desktop host (ADR-011/ADR-012). Any field addition is additive-only and requires an OQ/ADR touch.
- The served HTTP surface is unchanged — no consumer (admin shell, contract tests) needs modification.
- Legacy env-var boots (`TOVU_DB=memory`, `TOVU_CONTENT_DB`) behave exactly as pre-feature when no dir argument is given (REQ-10 / AC-13); with a dir argument they are ignored with a warning (EC-08).
- Exit codes and the `tovu: <CODE>:` stderr prefix are contracts for the desktop host and CI; changing them is a breaking change.
