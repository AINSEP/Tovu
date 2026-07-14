# Spec Manifest: Members (As-Built)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-013 |
| feature_name | FEAT-013-members |
| version | 1.0.0 |
| last_edited | 2026-07-13T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-project-knowledge/specs/013-members |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow — the authoritative list of
which SPEC-013 files exist, which are omitted and why, and which files each downstream stage must
read. This package documents **already-shipped** code (ADR-030, direct-to-code, no prior spec
package) rather than proposing new design.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | feature.spec.md | Canonical primary requirements spec (REQ/AC/INV/EC), hash anchor |
| `api.spec.md` | PRESENT | api.spec.md | Four real admin HTTP endpoints (list/get/disable/request-magic-link) |
| `state.spec.md` | PRESENT | state.spec.md | Five domain record shapes + in-memory-only persistence (no DB table exists — documented explicitly) |
| `orchestrator.spec.md` | OMITTED | — | No async orchestration/coordinator layer exists; `MembersWriteService` and `DefaultMemberAccessResolver` are synchronous ordinary core code with no queue/job/multi-step coordinator (mirrors SPEC-007's identical reasoning) |
| `ui.spec.md` | PRESENT | ui.spec.md | The 51-line read-only admin Members table — an in-scope, already-shipped UI surface; also the vehicle for documenting the thin-UI-over-fuller-backend gap the dispatch directive asked for |
| `errors.spec.md` | PRESENT | errors.spec.md | Four typed domain error classes + the ad-hoc per-route HTTP mapping; also documents the missing structured-error-envelope gap (Article VIII) |
| `behavior.spec.md` | PRESENT | behavior.spec.md | Fail-closed visibility-decision precedence, anti-enumeration constant-response rule, unpinned TTL defaults, and an undisclosed-until-now email-uniqueness race |
| `traceability.spec.md` | PRESENT | traceability.spec.md | Seeds REQ/AC/INV/EC + error + behavior coverage mapping from real files and real tests (not "pending") |
| `spec-manifest.md` | PRESENT | spec-manifest.md | This package index |
| `spec-dod.md` | PRESENT | spec-dod.md | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | feature.spec.md, traceability.spec.md, spec-dod.md, api.spec.md, state.spec.md, ui.spec.md, errors.spec.md, behavior.spec.md, ADR-030 |
| `tdd` | feature.spec.md, traceability.spec.md, spec-dod.md, api.spec.md, state.spec.md, errors.spec.md, behavior.spec.md, ADR-030, the existing `src/members/__tests__/*` suite (to avoid duplicating coverage) |
| `programmer` | feature.spec.md, traceability.spec.md, api.spec.md, state.spec.md, ui.spec.md, errors.spec.md, behavior.spec.md, ADR-030, the real source files cited throughout this package |

---

## Brownfield / Reverse-Spec References

This feature is a full reverse-spec extraction (`spec_mode = reverse_spec`): the code shipped
directly from ADR-030 with no spec package, and this pass documents what actually exists. Concrete
touchpoints:

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADR-030-members.md` (`ADS-project-knowledge/reports/architecture/`) | codebase-analysis | The governing decision this spec verifies against real code, clause by clause |
| `sweep-crosscutting-decisions-20260710.md` (line 71, permission-namespace ruling; §D1c consent) | codebase-analysis | The frozen `admin.{section}.{action}` convention `member.manage` predates (OQ-03), and the D1c consent decision confirmed unimplemented (REQ-16) |
| `src/members/*.ts` (all 9 non-test files) + `src/members/__tests__/*.test.ts` (6 files, ~1000 lines) | source touchpoint | The domain library this entire package documents |
| `src/server/routes/admin/members/*.ts` (5 files: `deps.ts`, `list.ts`, `get-by-id.ts`, `disable.ts`, `request-magic-link.ts`) | source touchpoint | The wired HTTP surface (`api.spec.md`) |
| `src/server/app.ts` (lines 61-64, 152-156, 221-224) | source touchpoint | Confirms the four routes are actually registered/mounted and how repos are seeded at boot |
| `src/server/routes/types.ts` (lines 22-29, 75-80) | source touchpoint | Confirms `RouteDeps` already declares the members ports directly — contradicts the stale claim in `src/server/routes/admin/members/deps.ts`'s file header that it does not yet |
| `src/server/http/admin/members.ts` | source touchpoint | The `AdminMemberResponse` DTO / `toAdminMemberResponse` serializer (`api.spec.md` §5, `feature.spec.md` REQ-12) |
| `apps/admin/src/sections/Members.tsx` (51 lines, read in full) | source touchpoint | The entire UI surface (`ui.spec.md`) |
| `apps/admin/src/lib/api.ts` (lines 226-235) | source touchpoint | Confirms the admin API client already has `getMember`/`disableMember`/`requestMemberMagicLink` methods the UI component never calls — the UI gap is in the component, not the client |
| `src/identity/permissions.ts` (line 39, `BASE_CATALOG`) | source touchpoint | Confirms `member.manage` is the sole registered permission string (`feature.spec.md` REQ-14) |
| `src/infra/db/schema.ts` (grepped for `member`, zero hits) | testability | Confirms no persistent table exists for any member record (REQ-18) |

---

## Validation Notes

- Validator last run: 2026-07-13T00:00:00Z (`--phase spec --update-hash`)
- Validator result: PASS ("strict Speckit package passed mechanical validation")
- Validator manual waiver: N/A
- Canonical hash verified at: 2026-07-13T00:00:00Z — `sha256:4223c9dd7808b2a49977075b897ed237e979ce83b611ac6b4a963dd6b82eb5b1`
- Notes: v1.0.0 initial as-built package. Every REQ/AC/INV/EC in `feature.spec.md` was verified
  directly against `src/members/`, `src/server/routes/admin/members/`,
  `apps/admin/src/sections/Members.tsx`, `src/identity/permissions.ts`, and
  `src/infra/db/schema.ts` — not inferred from ADR-030 prose alone. Three ADR-030 decisions were
  confirmed **not implemented**: the D1c `member_consents` ledger (REQ-16), the magic-link rate
  limiter (REQ-17), and a durable/SQLite repo adapter (REQ-18). Two structural gaps beyond what
  ADR-030 itself calls out were found and disclosed: `completeSignIn` has no HTTP route anywhere
  (REQ-15/OQ-01), and only the `disable` admin route performs a per-action permission check — `list`,
  `get-by-id`, and `request-magic-link` rely on session auth alone (REQ-10/OQ-02).
