# Spec Manifest: integrations

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-015 |
| feature_name | FEAT-015-integrations |
| version | 1.0.0 |
| last_edited | 2026-07-13T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-project-knowledge/specs/015-integrations |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow for FEAT-015. **This package is a lightweight as-built backfill** for a feature that shipped directly from ADR-036 (2026-07-10 admin-section sweep) without a formal spec package — it documents real, already-existing code, not a design proposal.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary as-built requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | Five real, wired admin HTTP routes (list/create/pause/delete/deliveries) are in scope |
| `state.spec.md` | PRESENT | `state.spec.md` | Real durable-shaped state (`WebhookSubscriptionRecord`/`WebhookDeliveryRecord`/envelope side-channel), backed today only by in-memory adapters |
| `orchestrator.spec.md` | OMITTED | — | No client-side orchestration/coordinator abstraction exists — both admin UI components talk directly to the API via the shared thin fetch wrapper (`apps/admin/src/lib/api.ts`), mirroring the SPEC-007 (settings) and SPEC-009 (redirects) precedent's identical omission reasoning. The backend two-stage delivery worker (`enqueueDelivery`/`processDueDeliveries`) is a batch/worker process, not a UI-facing orchestrator contract, and is fully covered by `state.spec.md` §3 (Action Catalog) and `behavior.spec.md` instead. |
| `ui.spec.md` | PRESENT | `ui.spec.md` | Two real, shipped admin screens (`Integrations.tsx`, `IntegrationDeliveries.tsx`) are in scope |
| `errors.spec.md` | PRESENT | `errors.spec.md` | Real error codes with a real (partially non-idealized) wire envelope shape are documented |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Non-trivial ordering/precedence rules exist in the real code: topic-match precedence, hook-priority ordering, exponential backoff+jitter, idempotent fan-out, most-recent-delivery tie-break |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | As-built matrix — every REQ/AC/INV/EC/error/behavior-rule resolved to a real impl file/function and (where one exists) a real test |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate, adapted for an as-built backfill (see its own header note) |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` (for the still-missing runtime wiring only — GAP-01 through GAP-12) | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, plus ADR-036 (and its Round-2/3/4 folds), ADR-038 (`src/http/`), ADR-040 (`core/origin`, not yet built), `src/integrations/*`, `src/server/routes/admin/integrations/*`, `src/server/routes/types.ts` |
| `tdd` (for hardening the untested rows in `traceability.spec.md` § 6.2) | `feature.spec.md`, `traceability.spec.md`, `behavior.spec.md`, `errors.spec.md` |
| `programmer` (for GAP work) | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, ADR-036, the real source files already cited throughout this package |

---

## Brownfield / Reverse-Spec References

This feature is `brownfield` — specifically, a **lightweight as-built backfill** of already-shipped, already-tested code (per Coordinator dispatch instruction, the full 5-pass reverse-spec pipeline was explicitly skipped in favor of a direct read-the-code-and-document pass).

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `src/integrations/{types,ports,index,subscriptions,delivery,signing,repo.memory,http.memory}.ts` | source touchpoint (read in full) | The library's real, tested implementation — every REQ in `feature.spec.md` traces here |
| `src/integrations/__tests__/{delivery,subscriptions,signing,repo.memory}.test.ts` | test touchpoint (read in full) | Real, passing tests cited by name throughout `traceability.spec.md` |
| `src/server/routes/admin/integrations/{list,create,pause,delete,deliveries,deps}.ts` | source touchpoint (read in full) | The real, wired admin HTTP API this package's `api.spec.md` documents |
| `src/server/http/admin/integrations.ts` | source touchpoint (read in full) | The real response-DTO projection functions `api.spec.md` §5 mirrors exactly |
| `src/server/__tests__/admin-integrations-routes.test.ts` | test touchpoint (read in full) | Real, passing integration-level route tests cited throughout `traceability.spec.md` |
| `apps/admin/src/sections/{Integrations,IntegrationDeliveries}.tsx` | source touchpoint (read in full) | The real, shipped admin UI `ui.spec.md` documents |
| `apps/admin/src/lib/api.ts` (integrations section) | source touchpoint | The real fetch-client shapes (`AdminWebhookSubscription`/`AdminWebhookDelivery`) `ui.spec.md`/`api.spec.md` cross-reference |
| `src/http/{types,ports,index}.ts` | source touchpoint (read in full) | Confirms `HttpClientPort`/`EgressPolicy` are types/ports ONLY in this repo pass — no concrete adapter or composition-root factory exists anywhere (GAP-04); read to verify ADR-036's "imports from ADR-038" claim is accurate as far as it goes, and that ADR-038 itself is also unimplemented at the transport level |
| `src/identity/permissions.ts` | source touchpoint (read in full) | Confirms the REAL registered permission is `integration.manage` (owner: `"integrations"`), with an explicit code comment disclosing the deviation from ADR-036's/`ADR-INDEX.md`'s stated `admin.integrations.manage` |
| `src/server/routes/types.ts` | source touchpoint (read in full) | Confirms `webhookSigner`'s own field doc: "DEV-ONLY placeholder wiring... Not consumed by any route yet — the delivery worker is the first real consumer" — cross-checked against a repo-wide search confirming the delivery worker itself is never invoked outside its unit tests (GAP-01, GAP-02) |
| `src/server/{app,deps}.ts` | source touchpoint (grepped for `webhook`/`integration`) | Confirms the composition root wires only the five admin routes + in-memory repos + the dev-placeholder signer — no fan-out subscriber, no scheduled delivery-worker call |
| ADR-036-integrations-api.md (+ Round-2/3/4 folds) | architecture (ACCEPTED) | Governing ADR; cross-checked clause-by-clause against the real code — two material deviations found and disclosed (permission string; "first real consumer" claim understates that there is currently NO consumer) |
| ADR-038-core-http-egress-primitive.md | architecture (ACCEPTED) | `HttpClientPort`/`EgressPolicy` are declared here per ADR-036's Round-2 fold; confirmed this ADR's own implementation is also types/ports-only in the current repo (no transport/composition-root code found) |
| ADR-040-core-origin-registry-v0.md | architecture (ACCEPTED) | The real egress-allowlist oracle `isAllowedTarget` is meant to call in production; confirmed the admin route wires a permit-all stand-in instead (GAP-06) |

---

## Validation Notes

- Validator: to be run with `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-project-knowledge/specs/015-integrations --phase spec --update-hash` immediately after this package is written.
- `content_hash` in `feature.spec.md` is `sha256:PENDING` until that run completes and rewrites it.
- **Two real deviations found between ADR-036/ADR-INDEX prose and the shipped code, disclosed rather than silently resolved:**
  1. **Permission string.** ADR-036's Round-2 fold and `ADR-INDEX.md` both state `admin.integrations.manage`. The actually-registered, actually-tested permission is `integration.manage` (unprefixed, singular). `src/identity/permissions.ts`'s own comment explains why: the `admin.<section>.manage` convention "has no implementation behind it anywhere in this codebase" at the time this landed. Notably, the sibling `009-redirects` spec later found and recorded that `admin.<section>.manage` IS the frozen, owner-decided convention (`sweep-crosscutting-decisions-20260710.md` line 71) — so Integrations (like Menus/Members before it, per that same spec's notes) is a retroactive-migration candidate, not a drafting error to silently fix here. See `feature.spec.md`'s OQ-01.
  2. **Delivery-worker "first real consumer" claim.** `webhookSigner`'s field doc in `src/server/routes/types.ts` says the delivery worker "is the first real consumer" of the dev-placeholder signer, phrased as though the worker itself runs. A repo-wide search (excluding test files) found zero non-test callers of `enqueueDelivery` or `processDueDeliveries` — there is no outbox subscriber, no scheduler, nothing invoking Stage A or Stage B in the running server. The claim is accurate about the signer (not consumed by any route) but understates that the worker that WOULD consume it also never runs. Documented as GAP-01 in `feature.spec.md`.
- No brownfield `ANALYSIS-*`/`MIGRATION-*`/`TESTABILITY-*` reports exist for this feature (none were requested or produced) — this package's own read-the-code pass (listed above) is the evidence base instead, per the lightweight-backfill dispatch instruction.
