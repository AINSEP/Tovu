# Spec Manifest: Plugin System — Artifact, Loader, One Hook, `ext.*` Fields (v1)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-005 |
| feature_name | FEAT-005-plugin-system |
| version | 1.0.0 |
| last_edited | 2026-07-07T04:10:00Z |
| spec_naming | prefixed |
| spec_root | ADS-project-knowledge/specs/005-plugin-system/ |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | 2 new admin endpoints + additive `ext` on entry DTOs + a fail-closed 500 path |
| `state.spec.md` | PRESENT | `state.spec.md` | The artifact/manifest format + `ext` column + `plugin_activations` + the `@tovu/sdk` public surface are the feature's durable state |
| `orchestrator.spec.md` | OMITTED | `—` | Discovery/validation/load/hook-run are synchronous in-process operations; no queues or async coordination (the existing outbox worker is unchanged) |
| `ui.spec.md` | OMITTED | `—` | No UI in this slice — enable/disable is API + gateway only; the admin extension-manager UI is deferred (OQ-02) |
| `errors.spec.md` | PRESENT | `errors.spec.md` | 4 new HTTP codes + an 18-code plugin-validation vocabulary + 3 carried over |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Load pipeline, validation ordering, capability enforcement, hook firing, enable/disable, `ext` writes, fail-closed |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error/BR coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | full package + ADR-003, ADR-004, ADR-005, ADR-015; SPEC-001 (gateway), SPEC-002 (write path + `ext` column host), SPEC-003 (`plugins/` dir), SPEC-004 (discovery/validation pattern) |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `behavior.spec.md`, `errors.spec.md`, `spec-dod.md`, fixture-plugin plan (valid/tampered/incompatible/bad-hook/bad-field/queryable), SDK snapshot plan, ADR, tasks |
| `programmer` | full package, ADRs, certified tests, `src/features/post/*` (hook insertion point), `src/infra/db/schema.ts` (`ext` + `plugin_activations`), `src/features/presentation` (gateway-activation pattern) |

---

## Brownfield / Reverse-Spec References

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-project-knowledge/reports/architecture/ADR-003-plugins-never-get-ddl.md` | codebase-analysis | Governing decision: no plugin DDL; `ext.{pluginId}` JSON; indexing/promotion deferred (OQ-04) |
| `ADS-project-knowledge/reports/architecture/ADR-004-plugin-artifact-format.md` | codebase-analysis | Governing decision: `.tovu-plugin` envelope, prebuilt ESM, integrity day-one, versioned side-by-side, API-surface enforcement (not sandbox) |
| `ADS-project-knowledge/reports/architecture/ADR-005-sdk-compatibility-promise.md` | codebase-analysis | Governing decision: public API = `@tovu/sdk` exports; semver + deprecation ladder + snapshot test; no private-API back doors |
| `ADS-project-knowledge/reports/architecture/ADR-015-drizzle-sql-data-layer-behind-ports.md` | codebase-analysis | `ext` column + `plugin_activations` land as Drizzle schema edits + generated migrations, behind the repo ports |
| `src/features/post/post.ts` (`createEntry`/`updatePost`) | source touchpoint | The write path the `content.entry.beforeSave` filter wraps; `ext` writes join the same transaction (SPEC-002) |
| `src/features/presentation/presentation.ts` (`setActiveTheme` gateway pattern) | source touchpoint | Model for gateway-backed enable/disable; `plugin_activations` mirrors `presentation_settings` |
| `src/infra/db/schema.ts` (Drizzle) | source touchpoint | `posts.ext` column + `plugin_activations` table added here; `drizzle-kit generate` emits the migration |
| `src/core/commands` (SPEC-001 gateway) | source touchpoint | Enable/disable execute as commands; revert = disable/enable inverse |
| SPEC-003 `plugins/` dir + `runtimeSchemaVersion` | upstream spec | Install location; the new migration increments the schema-version stamp |
| SPEC-004 theme validator/registry/discovery | upstream spec | Reused discover→validate→list→enable shape (one validator, two surfaces) |
| `docs/research/competitor-analysis.md` (Payload plugin-as-config-fn; Directus taxonomy; Strapi RBAC-gated tools + porous-boundary warning) | codebase-analysis | Design guidance: declared capabilities not the kernel; hold the Directus-clean boundary; SDK-as-public-API |
| `tovu-v2-design.md` §3 (kernel registries 3/4/5), §3.5 tier 4 | codebase-analysis | The extension substrate this slice builds the thin first cut of; deferred registries are OQ-01/03/04/07 |

---

## Validation Notes

- Validator last run: 2026-07-07T04:15:00Z (`validate_spec_package.py --phase spec --update-hash`)
- Validator result: PASS — strict Speckit package passed mechanical validation
- Validator manual waiver: N/A
- Canonical hash verified at: `sha256:4b8a8ce77579383517c544de3de577a33ce9afedb4cf7d321d74a3c4ce0d94ea`
- Notes: `ui.spec.md` and `orchestrator.spec.md` OMITTED with reasons above (86/96 PASS, 10 NA); thin walking-skeleton slice (owner-approved 2026-07-07) — deferred extension surface tracked as OQ-01…OQ-08 in feature.spec.md. Written persona-loaded (`agents/spec/skills.md`) this session.
