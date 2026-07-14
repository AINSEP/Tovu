# Spec Manifest: redirects

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-009 |
| feature_name | FEAT-009-redirects |
| version | 1.0.0 |
| last_edited | 2026-07-12T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-project-knowledge/specs/009-redirects |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow for FEAT-009.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | Admin CRUD + import + hit-read HTTP surface (REQ-01–REQ-05, REQ-26, hit stats read) is in scope |
| `state.spec.md` | PRESENT | `state.spec.md` | Durable redirect rule/revision/hit-stat state (ADR-033 §2's three core-owned tables) plus admin-UI client state |
| `orchestrator.spec.md` | OMITTED | — | No async orchestration/coordinator layer distinct from the write chokepoint and the routing-chain phase handler, both of which are synchronous ordinary core code (mirrors SPEC-007 settings' identical omission reasoning); the admin UI talks directly to the API via a thin fetch wrapper, no orchestrator abstraction in scope |
| `ui.spec.md` | PRESENT | `ui.spec.md` | The Redirects admin screen (list + create/edit form) is an in-scope UI surface (REQ-23–REQ-25) |
| `errors.spec.md` | PRESENT | `errors.spec.md` | New error registry: `REDIRECT_NOT_FOUND`, `REDIRECT_VALIDATION_ERROR`, `REDIRECT_TARGET_NOT_ALLOWED`, `REDIRECT_CONFLICT`, `REDIRECT_LOOP_DETECTED`, `LINK_PRESERVATION_UNAVAILABLE` + standard codes |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Non-trivial ordering/precedence: match-type precedence, phase eligibility, tie-break, one-hop chain collapse, dynamic-set cap and eviction policy |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error-code/behavior-rule coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, plus ADR-033, ADR-039, ADR-040, ADR-026 (tx-handle fix), `src/redirects/ports.ts`/`types.ts`, `src/routing/*` |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `behavior.spec.md`, `errors.spec.md`, `spec-dod.md`, governing ADRs, tasks |
| `programmer` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, ADRs, certified tests |

---

## Brownfield / Reverse-Spec References

This feature is `brownfield`: real interface/type stubs already exist for it, and it
integrates with real, already-implemented `routing`/`origin` libraries.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `src/redirects/ports.ts` | source touchpoint | Pre-existing `RedirectRepoPort`/`RedirectMatcher`/`RedirectHitSink`/`RedirectResolver` interface stubs (ADR-033-governed, no adapters yet). This spec's REQ-06/REQ-07/REQ-08/REQ-13/REQ-14/REQ-20/REQ-21 must be satisfied against these exact interfaces. |
| `src/redirects/types.ts` | source touchpoint | Pre-existing `RedirectRecord`/`RedirectRevision`/`RedirectHitStats`/`RedirectResolution`/error-class shapes this spec's `state.spec.md` and `errors.spec.md` mirror directly. **Contains a known deviation**: its local `SlugChangeCapture` type (flat payload, no method) predates ADR-039 and collides by name with `src/routing/types.ts`'s `SlugChangeCapture` (a method-bearing implementer interface). Flagged in `feature.spec.md`'s Agent Directives — not silently resolved either way; Software Architect must reconcile/rename during implementation planning. |
| `src/routing/types.ts`, `src/routing/ports.ts`, `src/routing/routing.ts`, `src/routing/index.ts` | source touchpoint | Real, already-implemented ADR-039 forward-pipeline registration seam (`registerResolvePhase`), `SlugChangeCapture` slot (`registerSlugChangeCapture`/`getSlugChangeCapture`), and `RouteResolvePhaseHandler`/`RouteResolvePhaseOutcome` shapes this feature's phase-handler adapter (REQ-18/REQ-19, Dependencies table) must translate to/from `RedirectRequest`/`RedirectResolution`. |
| `src/origin/origin.ts`, `src/origin/ports.ts` | source touchpoint | Real, already-implemented `OriginRegistry.isAllowedRedirectTarget` (ADR-040) this spec's REQ-08/REQ-09/REQ-10 call directly — write- and read-path open-redirect checks use this one oracle, not a redirects-local allowlist. |
| `src/identity/permissions.ts` | source touchpoint | Real `PermissionDescriptor` catalog and registration pattern; REQ-12's `admin.redirects.manage` must be registered here following the existing flat-string convention. **Naming-convention note**: every currently-registered permission in this file is unprefixed (`content.write`, `settings.definitions.manage`, `navigation.manage`, `member.manage`) — `admin.redirects.manage` (as directed by ADR-033's Round-2 fold and this task's fixed identifier) would be the first `admin.`-prefixed permission in the catalog. Recorded as a flagged deviation, not silently normalized away, per Coordinator instruction. |
| `apps/admin/src/sections/Menus.tsx`, `MenuEditor.tsx`, `src/server/routes/admin/menus/*.ts` | source touchpoint | UI/route convention reference this spec's `ui.spec.md`/`api.spec.md` follow (hash-routed list+editor screens, `getAuthedPrincipal` + direct `authorize()` gating, plain fetch-wrapper `api` client, no state-management library). |
| ADR-033-redirects.md | architecture (ACCEPTED) | Governing ADR for this entire feature; §2–§8 map directly to REQ-01–REQ-26. |
| ADR-039-routing-contract-v0.md | architecture (ACCEPTED) | Owns the forward resolver-chain contract and `SlugChangeCapture` slot this spec's REQ-15–REQ-19 depend on; answers ADR-033's own Q-1/Q-2. |
| ADR-040-core-origin-registry-v0.md | architecture (ACCEPTED) | Owns the single open-redirect oracle (`isAllowedRedirectTarget`) this spec's REQ-08/REQ-09/REQ-10 depend on. |

---

## Validation Notes

- Validator last run: 2026-07-12, `--phase spec --update-hash`
- Validator result: PASS (exit 0) — `sha256:666f3726f38eda3cc6274ebb3bfd1ee5642bcfeffb2eb80bc3f48e89fc3986ef`
- Validator manual waiver: N/A
- Canonical hash verified at: 2026-07-12 (provider-local validator)
- Notes: `orchestrator.spec.md` omitted following the SPEC-007 (settings) precedent
  reasoning verbatim-adapted for this feature — no async orchestration layer distinct from
  the synchronous write chokepoint and routing-chain phase handler exists in scope. Two
  deviations between the pre-existing ADR-033 stub/ADR text and this spec's chosen contract
  are recorded above rather than silently resolved: (1) the `SlugChangeCapture` name
  collision between `src/redirects/types.ts` and `src/routing/types.ts`, resolved in favor
  of the routing-owned (ADR-039, already-implemented) shape; (2) the `admin.` permission
  prefix, used as directed, despite being inconsistent with every other registered
  permission in `src/identity/permissions.ts`.
