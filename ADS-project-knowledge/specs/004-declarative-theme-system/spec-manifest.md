# Spec Manifest: Declarative Theme System — Manifest, Hierarchy Resolver, Activation

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-004 |
| feature_name | FEAT-004-declarative-theme-system |
| version | 1.0.0 |
| last_edited | 2026-07-07T02:35:00Z |
| spec_naming | prefixed |
| spec_root | ADS-project-knowledge/specs/004-declarative-theme-system/ |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | 1 new endpoint, 4 modified surfaces, type widening on wire contracts |
| `state.spec.md` | PRESENT | `state.spec.md` | The theme package format IS durable ecosystem state; discovery record + token/template schemas |
| `orchestrator.spec.md` | OMITTED | `—` | Discovery/validation/render are synchronous in-process operations; no queues or async coordination |
| `ui.spec.md` | PRESENT | `ui.spec.md` | Appearance section generalizes from 3 hardcoded themes to the discovery-driven list (REQ-11) |
| `errors.spec.md` | PRESENT | `errors.spec.md` | 2 new HTTP codes + 16-code validation vocabulary |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Resolution chain, validation ordering, discovery precedence, activation guard, fallback |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | full package + ADR-010, ADR-002, SPEC-003 state.spec.md (`themes/` dir), SPEC-001 (activation audit) |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `behavior.spec.md`, `errors.spec.md`, `spec-dod.md`, fixture-theme plan, ADR, tasks |
| `programmer` | full package, ADR, certified tests, `server/http/site/render.ts` (the module that grows into the template renderer) |

---

## Brownfield / Reverse-Spec References

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-project-knowledge/reports/architecture/ADR-010-declarative-themes-by-default.md` | codebase-analysis | The governing decision this spec implements (declarative default, no-code rule, validation posture, component-by-reference) |
| `ADS-project-knowledge/reports/architecture/ADR-002-blessed-rendering-target.md` | codebase-analysis | Renderer-agnostic contracts; React as eventual implementation — contract here must not assume the string renderer |
| `src/server/http/site/render.ts` (`THEME_STYLES`, `renderNode`, `pageShell`) | source touchpoint | The stand-in renderer: node vocabulary reused as template vocabulary (REQ-04); THEME_STYLES deleted (REQ-07); pageShell fallback formalized (BR-06) |
| `src/features/presentation/presentation.ts` (`ALLOWED_THEME_IDS`, `setActiveTheme`) | source touchpoint | Hardcode replaced by discovery-driven guard (REQ-08) |
| `src/headless/contracts.ts` (`HeadlessThemeId`) | source touchpoint | 3-id union widens to string (api §7 compatibility rule) |
| `src/server/routes/site/pages.ts` | source touchpoint | Route context (home vs entry) feeding the resolver |
| `apps/admin/src/sections/Appearance.tsx` | source touchpoint | UI surface generalizing per ui.spec.md |
| SPEC-001 / SPEC-002 / SPEC-003 packages | upstream specs | Gateway-audited activation; `kind` driving the hierarchy; `themes/` dir location |
| `tovu-v2-design.md` §5 Themes, §6 Phase 3 | codebase-analysis | Phase framing: Ghost lifecycle + WP hierarchy, declarative default; preview/settings deferred from the Phase-3 exit criteria are recorded as OQ-03 |

---

## Validation Notes

- Validator last run: 2026-07-07T03:40:00Z (`validate_spec_package.py --phase spec --update-hash`)
- Validator result: PASS — strict Speckit package passed mechanical validation
- Validator manual waiver: N/A
- Canonical hash verified at: `sha256:03d4a4aab5aecb5a270219522e17bb7644e8df90c60118d707e1f1d5009ce727`
- Notes: `spec-dod.md` written and PASS (91/96 PASS, 5 NA — orchestrator layer omitted); package now 8/8 present logical files + manifest. Awaits human spec checkpoint before Red-Team/Architect dispatch.
