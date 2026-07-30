# Spec Manifest: Plugin System — Artifact, Loader, One Hook, `ext.*` Fields (v1)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-005 |
| feature_name | FEAT-005-plugin-system |
| version | 1.1.2 |
| last_edited | 2026-07-28T00:00:00Z |
| spec_naming | prefixed |
| spec_root | ADS-memory/specs/005-plugin-system/ |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | 2 new admin endpoints + additive `ext` on entry DTOs + a fail-closed 500 path. **(1.1.2)** `PLUGINS_LIST`'s response gains one additive field, `tier` (REQ-10/REQ-18, resolves RT-010) |
| `state.spec.md` | PRESENT | `state.spec.md` | The artifact/manifest format + `ext` column + `plugin_activations` + the `@tovu/sdk` public surface are the feature's durable state. **(1.1.2)** `PluginDiscoveryRecord` gains `tier`, projected from `PluginManifest.tier` |
| `orchestrator.spec.md` | OMITTED | `—` | Discovery/validation/load/hook-run are synchronous in-process operations; no queues or async coordination (the existing outbox worker is unchanged) |
| `ui.spec.md` | PRESENT | `ui.spec.md` | **(1.1.0)** Admin plugins list + enable/disable screen — resolves OQ-02 for this slice (REQ-12..17); install-via-upload and per-plugin settings/config UI remain deferred (OQ-11). **(1.1.2)** REQ-18 adds a per-row trust-tier badge, resolving RT-010 |
| `errors.spec.md` | PRESENT | `errors.spec.md` | 4 new HTTP codes + an 18-code plugin-validation vocabulary + 3 carried over |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Load pipeline, validation ordering, capability enforcement, hook firing, enable/disable, `ext` writes, fail-closed |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error/BR coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | full package (incl. **(1.1.0)** `ui.spec.md`) + ADR-003, ADR-004, ADR-005, ADR-015; SPEC-001 (gateway), SPEC-002 (write path + `ext` column host), SPEC-003 (`plugins/` dir), SPEC-004 (discovery/validation pattern) |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `behavior.spec.md`, `errors.spec.md`, `spec-dod.md`, fixture-plugin plan (valid/tampered/incompatible/bad-hook/bad-field/queryable), SDK snapshot plan, ADR, tasks; **(1.1.0)** `ui.spec.md` for the `Plugins` screen's render/interaction test plan |
| `programmer` | full package, ADRs, certified tests, `src/features/post/*` (hook insertion point), `src/infra/db/schema.ts` (`ext` + `plugin_activations`), `src/features/presentation` (gateway-activation pattern); **(1.1.0)** `ui.spec.md` + `apps/admin/src/nav.ts` (`plugins` entry) + `apps/admin/src/App.tsx` (`case "section"` dispatch) + `apps/admin/src/sections/Roles.tsx`/`Redirects.tsx` (list+toggle conventions to mirror, `ui.spec.md` §0) |

---

## Brownfield / Reverse-Spec References

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-memory/reports/architecture/ADR-003-plugins-never-get-ddl.md` | codebase-analysis | Governing decision: no plugin DDL; `ext.{pluginId}` JSON; indexing/promotion deferred (OQ-04) |
| `ADS-memory/reports/architecture/ADR-004-plugin-artifact-format.md` | codebase-analysis | Governing decision: `.tovu-plugin` envelope, prebuilt ESM, integrity day-one, versioned side-by-side, API-surface enforcement (not sandbox) |
| `ADS-memory/reports/architecture/ADR-005-sdk-compatibility-promise.md` | codebase-analysis | Governing decision: public API = `@tovu/sdk` exports; semver + deprecation ladder + snapshot test; no private-API back doors |
| `ADS-memory/reports/architecture/ADR-015-drizzle-sql-data-layer-behind-ports.md` | codebase-analysis | `ext` column + `plugin_activations` land as Drizzle schema edits + generated migrations, behind the repo ports |
| `src/features/post/post.ts` (`createEntry`/`updatePost`) | source touchpoint | The write path the `content.entry.beforeSave` filter wraps; `ext` writes join the same transaction (SPEC-002) |
| `src/features/presentation/presentation.ts` (`setActiveTheme` gateway pattern) | source touchpoint | Model for gateway-backed enable/disable; `plugin_activations` mirrors `presentation_settings` |
| `src/infra/db/schema.ts` (Drizzle) | source touchpoint | `posts.ext` column + `plugin_activations` table added here; `drizzle-kit generate` emits the migration |
| `src/core/commands` (SPEC-001 gateway) | source touchpoint | Enable/disable execute as commands; revert = disable/enable inverse |
| SPEC-003 `plugins/` dir + `runtimeSchemaVersion` | upstream spec | Install location; the new migration increments the schema-version stamp |
| SPEC-004 theme validator/registry/discovery | upstream spec | Reused discover→validate→list→enable shape (one validator, two surfaces) |
| `docs/research/competitor-analysis.md` (Payload plugin-as-config-fn; Directus taxonomy; Strapi RBAC-gated tools + porous-boundary warning) | codebase-analysis | Design guidance: declared capabilities not the kernel; hold the Directus-clean boundary; SDK-as-public-API |
| `tovu-v2-design.md` §3 (kernel registries 3/4/5), §3.5 tier 4 | codebase-analysis | The extension substrate this slice builds the thin first cut of; deferred registries are OQ-01/03/04/07 |
| `ADS-memory/specs/045-plugins-admin/feature.spec.md` (SPEC-045 scoping memo) | codebase-analysis | **(1.1.0)** The owner-greenlit Option A decision that triggered this amendment: build SPEC-005's OQ-02 UI on top of the already-approved REQ-10/11 contract |
| `ADS-memory/specs/006-identity-and-authorization/feature.spec.md` (v0.6.0 amendment header) | codebase-analysis | **(1.1.0)** The amendment/versioning convention this file's `revision_note`, status-revert, and DoD reopen pattern mirror |
| `ADS-memory/reports/architecture/ADR-024-plugin-execution-and-trust-model.md` | codebase-analysis | **(1.1.1)** Governing decision for REQ-01's `tier` field: the tiered plugin trust model (Tier-1 declarative / Tier-2 sandboxed / Tier-3 trusted) and `plugin.tier`'s onboarding/install-consent role, mirroring `theme.json.tier` (ADR-020) |
| `ADS-memory/specs/032-datamodule-engine-safety-mechanics/feature.spec.md` (REQ-01, `DataModuleDecl.pluginTier`) | codebase-analysis | **(1.1.1)** The existing, approved precedent for encoding ADR-024's tier taxonomy as a literal string enum (`"tier-1" \| "tier-2" \| "tier-3"`) — reused verbatim for REQ-01's `tier` field rather than inventing a new spelling |
| `apps/admin/src/nav.ts`, `apps/admin/src/App.tsx` | source touchpoint | **(1.1.0)** The `plugins` nav entry (currently `soon: true`, no `href`) and the `case "section":` route dispatch this amendment's REQ-17 wires up |
| `apps/admin/src/sections/Roles.tsx`, `apps/admin/src/sections/Redirects.tsx` | source touchpoint | **(1.1.0)** The list-screen/toggle/error-handling conventions `ui.spec.md` §0 mirrors rather than inventing new UI patterns; **(1.1.2)** `Redirects.tsx`'s `status status-${rule.status}` badge (line ~281) is the exact convention REQ-18's tier badge mirrors verbatim |
| `ADS-memory/reports/pipeline/005-plugin-system/red-team-findings-v1.1.1-amendment.md` (RT-010) | codebase-analysis | **(1.1.2)** The ADVISORY finding this amendment resolves: `ui.spec.md` §9 disclosed the `capabilities` array's deferral but never the new `tier` field's operator-visibility; owner decision 2026-07-28 picks RT-010's resolution option (b) — display it now |

---

## Validation Notes

### v1.0.0 (2026-07-07) — original walking-skeleton package
- Validator last run: 2026-07-07T04:15:00Z (`validate_spec_package.py --phase spec --update-hash`)
- Validator result: PASS — strict Speckit package passed mechanical validation
- Validator manual waiver: N/A
- Canonical hash verified at: `sha256:4b8a8ce77579383517c544de3de577a33ce9afedb4cf7d321d74a3c4ce0d94ea`
- Notes: `ui.spec.md` and `orchestrator.spec.md` OMITTED with reasons above (86/96 PASS, 10 NA); thin walking-skeleton slice (owner-approved 2026-07-07) — deferred extension surface tracked as OQ-01…OQ-08 in feature.spec.md. Written persona-loaded (`agents/spec/skills.md`) this session.

### 1.1.0 (2026-07-28) — OQ-02 resolution amendment (`ui.spec.md` added)
- Validator last run: 2026-07-28T00:00:00Z (`validate_spec_package.py --phase spec --update-hash`)
- Validator result: **NOT clean — 4 disclosed, by-design violations, all coupled to the intentional
  DRAFT status.** `feature.spec.md: status must be APPROVED, found DRAFT`;
  `spec-dod.md: B-03 must be PASS or NA, found FAIL`; `spec-dod.md: B-32 must be PASS or NA, found
  FAIL`; `spec-dod.md: overall result must be PASS`. All four stem from the same, single, disclosed
  fact: this amendment's status is intentionally `DRAFT` pending a fresh Red-Team pass + owner
  DRAFT→APPROVED checkpoint (feature.spec.md's Implementation Readiness Gate, `revision_note`; this
  file's Validation Notes above). This validator script hard-requires `status: APPROVED` and an
  Overall DoD Result of PASS unconditionally (`validate_spec_package.py` lines ~358-360, ~439-440) —
  it has no allowance for a structurally-complete-but-intentionally-unapproved amendment state.
  **Empirically confirmed this is not unique to this file:** running the same validator against
  `ADS-memory/specs/006-identity-and-authorization` (the precedent this amendment's
  status-revert/DoD-reopen pattern mirrors) produces the identical four-violation shape today —
  that amendment's own spec-manifest.md discloses "Validator run pending" rather than a clean pass,
  for the same reason. Beyond these four, **zero other violations exist**: every REQ/AC/EC this
  amendment adds is present in `traceability.spec.md`, the content_hash is canonical
  (`--update-hash` applied), no `[NEEDS CLARIFICATION]`/blocking marker or template placeholder is
  present, and `spec-dod.md`'s Sign-Off Block is complete for the `spec` phase.
- Validator manual waiver: N/A (the runtime is available and ran; this is a disclosed content-state
  gap, not a missing-tool waiver — see `AI-Dev-Shop/skills/spec-writing/SKILL.md`'s waiver clause,
  which is scoped to validator-runtime unavailability, not this case)
- Canonical hash verified at: `sha256:de159d09c4cec9e2d1e3758334faa0cd9dbe7888d8bca178f8742d2d99ac2ad9`
- Notes: `ui.spec.md` flips OMITTED→PRESENT (89/96 PASS, 2 FAIL — B-03/B-32 by design, 5 NA).
  Coordinator: this amendment requires a fresh human DRAFT→APPROVED checkpoint before Red-Team or
  Software Architect/TDD dispatch — see `feature.spec.md`'s Implementation Readiness Gate and
  `spec-dod.md`'s Blocking Issues table for the itemized reopen.

### 1.1.1 (2026-07-28) — `plugin.tier` REQ-01 fix + DRAFT→APPROVED human checkpoint cleared
- Validator last run: 2026-07-28T00:00:00Z (`validate_spec_package.py --phase spec --update-hash`)
- Validator result: **PASS** — clean run, zero violations.
- Validator manual waiver: N/A (runtime available and ran clean)
- Canonical hash verified at: see `feature.spec.md`'s `content_hash` (recomputed by `--update-hash`
  this pass; the prior 1.1.0 hash `sha256:de159d09c4cec9e2d1e3758334faa0cd9dbe7888d8bca178f8742d2d99ac2ad9`
  is superseded)
- Notes: Two independent things landed in the same pass, both required before Software
  Architect/TDD could proceed: (1) **content fix** — REQ-01 gains the required `tier` field
  (ADR-024's plugin trust tier: `tier-1` \| `tier-2` \| `tier-3`, literal vocabulary per SPEC-032/
  ADR-023 precedent; v1 manifests declare `tier-3`), threaded into `state.spec.md`
  (`PluginManifest.tier`) and `behavior.spec.md` (BR-02 + §10), mirroring the RT-002 `engine` fix
  shape exactly; no new error code — `MANIFEST_MALFORMED` already covers a missing/invalid value.
  (2) **checkpoint** — owner Leon Aburime's 2026-07-28 approval to build SPEC-005 in full (Option A,
  `reports/pipeline/005-plugin-system/pipeline-state.md`) is formally recorded: `feature.spec.md`
  status DRAFT→APPROVED, version 1.1.0→1.1.1, Implementation Readiness Gate CONDITIONAL→PASS,
  `spec-dod.md` B-03/B-32 FAIL→PASS, Overall DoD Result FAIL→PASS. **This checkpoint does not
  substitute for Red-Team:** REQ-12..17/AC-18..25/EC-11/`ui.spec.md` and the new `tier` addition to
  REQ-01 have not yet been reviewed by Red-Team — that pass is still owed before TDD may certify
  tests against this material. Next step: Coordinator routes to Red-Team, not Software Architect/TDD.

### 1.1.2 (2026-07-28) — RT-010 resolution: `tier` field displayed in the plugin list (owner decision)
- Validator last run: 2026-07-28T00:00:00Z (`validate_spec_package.py --phase spec --update-hash`)
- Validator result: PASS — clean run, zero violations.
- Validator manual waiver: N/A (runtime available and ran clean)
- Canonical hash verified at: see `feature.spec.md`'s `content_hash` (recomputed by `--update-hash`
  this pass; the prior 1.1.1 hash `sha256:057bcf45540398391aa7ac4b96a451bf1f8ee256ebcc75e8335f7ab53f29d479`
  is superseded)
- Notes: Red-Team's `red-team-findings-v1.1.1-amendment.md` (RT-010, ADVISORY) flagged that
  `ui.spec.md` §9's "Capability tier" disclosure item covered only the `capabilities` array, never
  disclosing whether the separate `tier` field (added to REQ-01 at 1.1.1) — whose entire stated
  purpose per ADR-024 §1 is operator-facing install/trust consent — was shown to operators or
  deliberately deferred. **Owner Leon Aburime decided (2026-07-28): show it.** This pass adds new
  REQ-18 (`ui.spec.md` §5: a per-row trust-tier badge, mirroring the existing `status` badge
  convention verbatim — no invented label copy) and new AC-26 [P2] (the badge renders whichever of
  `tier-1`/`tier-2`/`tier-3` a record actually carries, not merely today's universal `tier-3`,
  keeping the AC meaningfully testable even though no tier-1/tier-2 plugin exists yet). Supporting
  the badge required one additive change to REQ-10's already-approved response contract: `tier` is
  now included in `PLUGINS_LIST` (`api.spec.md` §5) and in `PluginDiscoveryRecord`
  (`state.spec.md` §2), projected verbatim from the already-required, already-validated
  `PluginManifest.tier` — mirroring exactly how `enabled` is already projected from
  `plugin_activations` into the same record. No new error code, invariant, or edge case was needed:
  `errors.spec.md`/`behavior.spec.md` are content-unchanged (package-level version bump only).
  **Red-Team disposition:** not re-dispatched for a fresh pass before this content lands — RT-010
  itself already reviewed and pre-cleared this exact fork (fold into OQ-11, or display now) as
  ADVISORY, and this change is small/additive/well-precedented (one new response field, one new
  badge mirroring an existing convention, no new component/error/state-transition) — judged
  equivalent in risk to this session's earlier RT-002-style micro-fixes, which also proceeded
  straight to TDD without a dedicated fresh round. TDD may certify AC-26 as a small addendum
  alongside its certification of REQ-12..17/AC-18..25/EC-11 (per the parallel TDD pass already
  running against 1.1.1's content — Coordinator reconciles timing).
