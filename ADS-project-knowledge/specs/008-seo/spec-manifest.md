# Spec Manifest: seo

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-008 |
| feature_name | FEAT-008-seo |
| version | 1.0.0 |
| last_edited | 2026-07-13T20:18:23Z |
| spec_naming | standard |
| spec_root | ADS-project-knowledge/specs/008-seo |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the SEO strict Speckit compatibility flow.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | Feature exposes 8 admin/public HTTP endpoints (per-entry SEO CRUD, settings CRUD, sitemap regenerate, public sitemap/robots) |
| `state.spec.md` | PRESENT | `state.spec.md` | Feature manages durable per-entry override data (`posts.seo_ext_json`) and workspace-level `seo.*` settings, plus derived/cached state (sitemap) |
| `orchestrator.spec.md` | OMITTED | `—` | No distinct frontend orchestrator/coordinator layer exists or is warranted — the admin UI calls `api.*` service functions directly from `useState`/`useEffect`, matching the existing `apps/admin/src/sections/Appearance.tsx` convention (no Redux-style store in this codebase's admin app) |
| `ui.spec.md` | PRESENT | `ui.spec.md` | Feature has a real admin UI surface: a per-entry SEO panel and a dedicated `/admin/seo` settings screen |
| `errors.spec.md` | PRESENT | `errors.spec.md` | Feature defines new error codes (`SEO_FIELD_VALIDATION_ERROR`, `SEO_INVALID_CANONICAL_URL`, `SEO_SETTINGS_VALIDATION_ERROR`, `SEO_ENTRY_NOT_FOUND`) beyond the shared cross-cutting codes |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Feature has a genuine multi-source precedence chain (override ▸ site default ▸ derived), deterministic head-element ordering/dedup rules, and several non-obvious defaults (see behavior.spec.md §1–§7) |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error-code/behavior-rule coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, plus `ADR-032-seo.md` and `ADR-039-routing-contract-v0.md` (governing ADRs) |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `spec-dod.md`, `behavior.spec.md`, `errors.spec.md`, ADR-032, tasks.md |
| `programmer` | `feature.spec.md`, `traceability.spec.md`, all `PRESENT` contract files (`api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`), ADR-032, certified tests |

---

## Brownfield / Reverse-Spec References

This feature is `brownfield`: it extends an existing, partially-stubbed codebase surface and attaches to an existing bespoke table rather than a greenfield model.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `src/seo/ports.ts` | source touchpoint | Existing design-only interface stubs (`SeoQueryPort`, `SeoPluginCaps`, hook handler contracts) this spec fills in; `state.spec.md` §5 documents the permission-namespace mismatch against this file |
| `src/seo/types.ts` | source touchpoint | Existing design-only type stubs (`SeoExtFields`, `SeoSettings`, `SeoPermission`, `HeadElement`); `state.spec.md` §5 documents 3 concrete mismatches this spec resolves rather than silently inherits (storage attachment point, permission namespace, retired `seo.base_url`, and the `RobotsPolicy` stored-vs-computed split) |
| `src/features/post/post.ts`, `src/infra/db/schema.ts` (`posts` table) | source touchpoint | The real, only-implemented content storage this spec attaches `seo_ext_json` to — NOT the generic ADR-022 `entries` model ADR-032 §2 assumes exists (`state.spec.md` §0) |
| `src/routing/ports.ts`, `src/routing/types.ts`, `src/routing/routing.ts` | source touchpoint | Real, already-built `urlFor`/`canonicalUrl` (ADR-039) this feature consumes for every absolute URL (REQ-12); `routing.ts`'s own `composeCanonicalUrl` still uses a documented `originOverride` TODO stand-in rather than `src/origin`'s `OriginRegistryPort.canonicalOrigin` — cited in `feature.spec.md` Dependencies as a routing-owned prerequisite, not a defect this spec introduces or must fix |
| `src/origin/ports.ts`, `src/origin/origin.ts` | source touchpoint | Confirms `OriginRegistryPort.canonicalOrigin` (ADR-040) already exists in code, even though `routing.ts` does not yet call it — relevant context for the dependency note above |
| `src/features/settings/*` (ADR-028 core-only ledger, SPEC-007) | source touchpoint | The existing settings write chokepoint/resolver this feature's `seo.*` settings register against and reuse unmodified |
| `src/identity/permissions.ts`, `src/identity/authorize.ts` | source touchpoint | The existing permission-catalog/`authorize()` mechanism this feature adds exactly one new `PermissionDescriptor` entry to (`admin.seo.manage`) |
| `apps/admin/src/sections/Appearance.tsx`, `src/server/routes/admin/presentation/get.ts`, `src/server/routes/admin/settings/get-effective.ts` | source touchpoint | UI and route conventions this spec's `ui.spec.md`/`api.spec.md` mirror (single-permission-per-domain gating, `useState`/`useEffect` admin screens, `req.params.workspaceId !== deps.workspaceId` 404 guard) |
| `ADR-032-seo.md` | governing ADR | The accepted architecture this spec translates into a testable feature spec — not re-debated here |
| `ADR-039-routing-contract-v0.md` | related ADR | Governs the `urlFor`/`canonicalUrl` contract this spec's REQ-12/INV-07 depend on |
| `sweep-crosscutting-decisions-20260710.md` (line 71) | related decision record | Source of the frozen `admin` + section + verb permission-namespace convention this spec applies (`admin.seo.manage`), superseding ADR-032 §6's original flat `seo.*` list |

---

## Validation Notes

- Validator last run: not-run (pending)
- Validator result: PASS \| FAIL — to be filled after the provider-local validator runs
- Validator manual waiver: N/A
- Canonical hash verified at: not-run (pending)
- Notes: Package authored in full for FEAT-008-seo; awaiting `validate_spec_package.py --phase spec --update-hash` run.
