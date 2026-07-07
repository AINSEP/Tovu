# Behavior Rules Spec: Site Install Dir — Instantiate a Template, Serve the Folder

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-003 |
| feature_name | FEAT-003-site-install-dir |
| version | 1.0.0 |
| content_hash | sha256:see feature.spec.md (package hash of record) |
| last_edited | 2026-07-07T02:20:00Z |

**Purpose:** Deterministic ordering for init/serve, precedence rules, and the commit-marker discipline. All rules use EARS syntax.

---

## 1. Init Ordering (BR-01)

- BR-01: WHEN `tovu init` runs, the system shall execute strictly in this order: (1) argument validation (`VALIDATION`), (2) target validation — path absent or empty dir (`INIT_DIR_NOT_EMPTY`), (3) template read + seed validation (`INTERNAL` on corrupt template; nothing created yet), (4) directory + subdirectory creation, (5) `config.json` write, (6) `content.db` create + migrate, (7) seed insertion from template data, (8) `.site-meta.json` write (commit marker). IF any step 4–7 fails, THEN the system shall remove everything it created before exiting (INV-02) and shall never write the commit marker.

## 2. Serve Ordering (BR-04…BR-07)

- BR-04: WHEN `tovu serve` receives a dir argument, the system shall ignore `TOVU_DB`/`TOVU_CONTENT_DB` env vars and log a warning naming the ignored variable (EC-08). WHEN no dir argument is given (legacy `npm run dev` path), pre-feature env behavior applies unchanged (REQ-10).
- BR-05: WHEN serving, the system shall evaluate in this order, first failure wins: (1) dir readable + `config.json` valid (`SITE_DIR_INVALID`), (2) `.site-meta.json` present + valid (`SITE_DIR_INVALID`), (3) `content.db` present + openable (`SITE_DIR_INVALID` / `SITE_CORRUPT` for lock), (4) schema guard (`SITE_NEWER_THAN_RUNTIME`), (5) forward migration when older, then `schemaVersion` bump, (6) workspace resolution (`SITE_CORRUPT`), (7) listener bind (`PORT_IN_USE`).
- BR-06: The system shall bump `.site-meta.json.schemaVersion` only AFTER `runMigrations` completes successfully, and shall never lower it (INV-05, EC-09).
- BR-07: WHEN the process receives SIGINT/SIGTERM while serving, the system shall stop accepting connections, close the db handle, and exit 0.

## 3. Default Values

| Field | Default | Why |
|---|---|---|
| site `name` (init) | directory basename | Zero-question init (`tovu init my-site` just works); `--name` overrides (BR-03) |
| `port` (serve) | 3000 | Existing dev-server default; overridden per BR-02 |
| `templateId` | `starter` | Only template in v1 (ADR-012 defers the gallery) |
| `config.json.domain` / `config.json.port` | absent | Optional identity fields; absence means "unset", not null-serialized |
| `siteId` | generated UUID at init | Host-level identity distinct from workspace id (OQ-04) |

## 4. Limits and Bounds

| Constraint | Value | Enforcement |
|---|---:|---|
| `--name` length (after trim) | 1…200 chars | CLI validation ⇒ `VALIDATION` (exit 2) |
| `--port` range | 1…65535 integer | CLI validation ⇒ `VALIDATION` (exit 2) |
| `config.json` size | ≤ 64 KiB | `readSiteDir` ⇒ `SITE_DIR_INVALID` (corruption guard) |
| `.site-meta.json` size | ≤ 64 KiB | same |
| Init target depth | parent directory must exist | `INIT_DIR_NOT_EMPTY` class (no recursive `mkdir -p` of arbitrary ancestors — typo guard) |

## 5. Precedence Rules

- BR-02 (port): WHEN resolving the serve port, the system shall evaluate `--port` flag, then `config.json.port`, then `PORT` env, then 3000 — first present value wins; a present-but-invalid value at any tier is an error (`VALIDATION`), not a fall-through.
- BR-03 (name): WHEN resolving the site name at init, the system shall use `--name` (trimmed) when provided, else the directory basename; a provided-but-empty `--name` is `VALIDATION`, not a fall-through (EC-06).

## 6. Tie-Break Logic

- TB-01: Not applicable — no collection ordering exists in this feature (single template, single workspace). Recorded for completeness; any future template list orders by id ascending.

## 7. Edge Case Handling (EARS)

- IF the init target exists as a file, THEN the system shall fail with `INIT_DIR_NOT_EMPTY` before creating anything (EC-02).
- IF the init target is an existing EMPTY directory, THEN init shall proceed using it (EC-01 note).
- IF `config.json` fails to parse at serve time, THEN the system shall fail with `SITE_DIR_INVALID` naming the file and parse error (EC-03).
- IF the listener bind fails with `EADDRINUSE`, THEN the system shall exit with `PORT_IN_USE` naming the port and shall leave no partial listener (EC-04).
- IF `content.db` is locked by another process, THEN the system shall exit with `SITE_CORRUPT`-class messaging naming the lock (EC-05).
- IF `.site-meta.json.templateId` is unknown to this runtime, THEN serve shall proceed and log a warning (provenance only, EC-07).
- IF serve crashes mid-migration, THEN the next serve shall re-run the idempotent migrations and only then bump the stamp (EC-09, BR-06).
- WHEN a completed install dir is moved or renamed, serve shall behave identically at the new path (AC-10; guaranteed by INV "no absolute paths persisted").
