# Spec Manifest: forms

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-010 |
| feature_name | FEAT-010-forms |
| version | 1.0.0 |
| last_edited | 2026-07-13T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-project-knowledge/specs/010-forms |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the Forms strict Speckit compatibility flow.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | Feature exposes 8 endpoints (7 admin + 1 public submission route) |
| `state.spec.md` | PRESENT | `state.spec.md` | Feature introduces two new durable tables (`form_definitions`, `form_submissions`) plus derived read-time state |
| `orchestrator.spec.md` | OMITTED | `—` | No distinct frontend orchestrator/coordinator layer exists or is warranted — the admin UI calls `api.*` service functions directly from `useState`/`useEffect`, matching the existing `apps/admin/src/sections/{Members,Posts,IntegrationDeliveries}.tsx` convention (no Redux-style store in this codebase's admin app); same reasoning SEO/Redirects already applied |
| `ui.spec.md` | PRESENT | `ui.spec.md` | Feature has a real admin UI surface: forms list, form editor (incl. a structured, non-drag-drop fields editor), and a submissions list+detail |
| `errors.spec.md` | PRESENT | `errors.spec.md` | Feature defines 6 new error codes beyond the shared cross-cutting codes |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Feature has genuine immutability rules (slug, field-id removal), a honeypot silent-discard rule, non-obvious defaults, and numeric limits that affect behavior, not just validation |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error-code/behavior-rule coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, plus `ADR-024-plugin-execution-and-trust-model.md`, `ADR-037-core-mail-primitive.md`, `ADR-036-integrations-api.md` (composite governing set — see `pipeline-state.md`) |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `spec-dod.md`, `behavior.spec.md`, `errors.spec.md`, the three governing ADRs, `tasks.md` |
| `programmer` | `feature.spec.md`, `traceability.spec.md`, all `PRESENT` contract files (`api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`), the three governing ADRs, certified tests, `src/mail/{types,ports,index}.ts`, `src/integrations/{types,ports,index}.ts` |

---

## Brownfield / Reverse-Spec References

This feature is `greenfield` for its own surface (no prior `src/forms` stub or shipped code
exists), but it consumes two real, already-built brownfield libraries whose gaps materially
affect implementation. Recorded here per the Spec Agent's read-before-write instructions, not
because this spec itself is brownfield.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `src/mail/{types,ports,index}.ts` | source touchpoint | Real `MailerPort` interface (ADR-037) this feature's notification subscriber consumes; the mail lib itself ships **interfaces only** — no adapter lives in `src/mail`. The one concrete adapter that exists, `ConsoleMailerAdapter`, lives under `src/members/mailer.console.ts` (member-scoped) — Software Architect must name which concrete `MailerPort` Forms' subscriber is wired against (`feature.spec.md` Dependencies) |
| `src/integrations/{types,ports,delivery,subscriptions,index}.ts` | source touchpoint | Real webhook-subsystem business logic (fan-out enqueue, delivery worker, subscription CRUD) this feature's `form.submission.received` topic rides with zero Forms-specific dispatch code; only **in-memory** repo adapters exist for `webhook_subscriptions`/`webhook_deliveries` — no SQLite persistence lands yet |
| `src/features/plugins/data-module.ts`, `src/features/plugins/store/store-plugin.ts`, `src/index.ts` | source touchpoint | Confirms **no Tier-1 declarative-plugin manifest loader/registry exists** anywhere in this codebase — only the Tier-3 `dataModule` spike and the hand-wired Store sample plugin, both activated by a direct function call in `src/index.ts`, not through any install/enable/disable-as-a-package mechanism. This is the load-bearing finding behind Open Question OQ-01 and the corresponding Scope exclusion in `feature.spec.md` |
| `src/infra/db/schema.ts` | source touchpoint | Confirms no generic ADR-022 `entries` table exists (only `posts`, `presentation_settings`, and the settings-ledger tables) — Forms attaches to two new bespoke tables, not a generic entries model, same posture SEO/Redirects already recorded |
| `apps/admin/src/sections/{Members,Posts,IntegrationDeliveries}.tsx` | source touchpoint | UI/route conventions `ui.spec.md` mirrors (fetch-on-mount `useState`/`useEffect`, `list-table` class, list+detail navigation pattern) |
| `ADR-024-plugin-execution-and-trust-model.md` | governing ADR | Defines the Tier-1 declarative/zero-code contract this feature's field-config vocabulary and enable/disable-only lifecycle satisfy; also the source of the "core-mediated primitives" framing this spec closes the loop on |
| `ADR-037-core-mail-primitive.md` | governing ADR | Defines `MailerPort` this feature consumes for REQ-12 |
| `ADR-036-integrations-api.md` | governing ADR | Defines the webhook subsystem this feature rides for REQ-11, including the `{entity}.{action}` topic-namespace convention `form.submission.received` follows |
| `todos.md` (AW-7 section) | source brief | The owner-approved scope/why/build-order this spec translates: "Contact form (submissions as core entries; email/webhook on submit)... forces ADR-024 audit-condition #1" |

---

## Validation Notes

- Validator last run: 2026-07-13, `--phase spec --update-hash`
- Validator result: PASS (feature hash computed:
  `sha256:d2d727639ef9e1e6131494e2d2dfe90290d917775733b8da72343f8bbfb0d87e`); a follow-up run after
  fixing `spec-dod.md` B-04/G-07 wording is expected to exit clean with zero violations
- Validator manual waiver: N/A
- Canonical hash verified at: 2026-07-13 (provider-local validator)
- Notes: Package authored in full for FEAT-010-forms.
