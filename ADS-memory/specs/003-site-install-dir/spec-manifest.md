# Spec Manifest: Site Install Dir — Instantiate a Template, Serve the Folder

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-003 |
| feature_name | FEAT-003-site-install-dir |
| version | 1.2.0 |
| last_edited | 2026-07-29T01:00:00Z |
| spec_naming | prefixed |
| spec_root | ADS-memory/specs/003-site-install-dir/ |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | Public surface is the `tovu` CLI + process contract; template's endpoint registry adapted to commands (no HTTP changes) |
| `state.spec.md` | PRESENT | `state.spec.md` | The install-dir layout, JSON file schemas, and template format ARE the feature's durable state |
| `orchestrator.spec.md` | OMITTED | `—` | init/serve are synchronous single-process flows; no queues, workers, or coordinator state (outbox worker unchanged) |
| `ui.spec.md` | OMITTED | `—` | No UI surface — CLI only; the desktop-host site manager is open-design's product (ADR-011), not this repo's UI |
| `errors.spec.md` | PRESENT | `errors.spec.md` | 7 CLI codes with exit-code registry (template's HTTP column adapted to exit codes) |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | init/serve ordering, commit-marker discipline, precedence rules |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error/BR coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, ADR-011, ADR-012 |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `spec-dod.md`, `behavior.spec.md`, `errors.spec.md`, ADR, tasks |
| `programmer` | `feature.spec.md`, `traceability.spec.md`, `api.spec.md`, `state.spec.md`, `errors.spec.md`, `behavior.spec.md`, ADR, certified tests |

---

## Brownfield / Reverse-Spec References

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-memory/reports/architecture/ADR-012-site-template-and-instantiation.md` | codebase-analysis | The governing decision: create = instantiate versioned template data; runtime shared, never copied. This spec implements its Create + (partial) Customize flows |
| `ADS-memory/reports/architecture/ADR-011-deployment-topologies-open-design-host.md` | codebase-analysis | Install dir is the portability contract between standalone and desktop-hosted modes (INV-06); standalone stays the CI-enforced primary |
| `src/index.ts` | source touchpoint | Current entrypoint the CLI subsumes; legacy env behavior preserved verbatim (REQ-10) |
| `src/server/deps.ts` (`createSqliteRouteDeps`, hardcoded `seededWorkspace.id`) | source touchpoint | The hardcode REQ-06 removes; composition reused under `serve` |
| `src/infra/sqlite/content-db.ts` (`openContentDb` → Drizzle `migrate()`, `seedContentDb`) + `src/infra/db/schema.ts` + `drizzle/meta/_journal.json` | source touchpoint | Migration engine is Drizzle (adopted 2026-07-06); the seed path lives here; `runtimeSchemaVersion` derives from the count of bundled migrations in `drizzle/` |
| `src/server/seed.ts` | source touchpoint | Seed content that becomes `templates/starter/seed-content.json` (equality-tested until retired) |
| `package.json` (scripts, no `bin` today) | source touchpoint | Gains the `tovu` bin entry (REQ-09) |
| `ADS-memory/specs/002-content-entry-authoring/` (SPEC-002 v1.0.0) | upstream spec | Seed includes the `about` page; `kind` column is part of the schema the template stamps |
| `START-HERE.md` (v1 first slice §1/§5) | codebase-analysis | This feature is slice steps 1 (site-as-folder) and 5 (serve) |
| `tovu-v2-design.md` §3.5 tier 5 (`tovu init` first-boot) | codebase-analysis | Product-surface framing: init must beat WordPress's 5-minute install |

---

## Validation Notes

- Validator last run: 2026-07-07T03:55:00Z (re-validated after revision R1)
- Validator result: PASS (`--phase spec`)
- Validator manual waiver: N/A
- Canonical hash verified at: 2026-07-07T03:55:00Z (see feature.spec.md header for the current hash)
- Notes: Original v1.0.0 hash was `sha256:db23ab2f…eb28`.

## Revision History

- **R1 (2026-07-07, pre-checkpoint):** Reconciled the migration/schema-version contract with **Drizzle ORM** (adopted repo-wide 2026-07-06). REQ-05, the `runtimeSchemaVersion` selector, and state.spec §7 now define forward migration as Drizzle `migrate()` over the generated `drizzle/` migrations (idempotent via `__drizzle_migrations`), with `runtimeSchemaVersion` derived from the bundled-migration count in `drizzle/meta/_journal.json`. The `.site-meta.json.schemaVersion` install-dir portability stamp is retained and clarified as complementary to (not replaced by) Drizzle's per-db journal. Brownfield refs updated. Content-only refinement of an as-yet-unratified spec — version held at 1.0.0, hash recomputed. Also part of the retroactive Spec-Agent persona audit (see spec-dod.md sign-off).
