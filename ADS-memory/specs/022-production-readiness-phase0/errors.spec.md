# Error Code Registry Spec: Production Readiness Phase 0 — Capability Inventory & Runtime-Mode Containment

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-022`
- Feature: `FEAT-022-production-readiness-phase0`
- Version: `1.0.0`
- Content Hash: anchored in feature.spec.md
- Last Edited: `2026-07-16T00:00:00Z`

## Purpose
Error/refusal codes this phase introduces. Most are boot-time or composition-level (not a caller-facing HTTP request/response pair), since this phase's job is refusing unsafe activation, not handling user input — the envelope still applies for structured logging/observability (Article VIII).

## 1) Error Envelope (Base Payload)
All errors MUST include:

```yaml
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null
details: object|null
```

## 2) Error Code Registry

| Code | Category | Layer (`api\|orchestrator\|ui\|integration`) | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `PRODUCTION_BOOT_UNSAFE_DEFAULT` | boot-refusal | `integration` | N/A (process exits before serving) | no | Operator-facing only: "Refusing to boot in production mode: `<specific unsafe default>` detected." |
| `PRODUCTION_CAPABILITY_NOT_DURABLE` | boot-refusal | `integration` | N/A (process exits before serving) | no | Operator-facing only: "Refusing to boot in production mode: capability `<name>` is classified production but has no durable adapter configured." |
| `SHARP_READINESS_FAILED` | boot-refusal | `integration` | N/A (media transform routes simply do not register) | no | Operator-facing only: "Media transform routes disabled: `sharp` readiness check failed (`<specific check>`)." |
| `MAILER_SEND_REFUSED_NO_DURABLE_PATH` | egress-refusal | `integration` | N/A (internal seam refusal, not a caller-facing HTTP response) | no | Operator-facing only (observability signal): "Notification-lane mailer send refused: no durable outbox path registered for capability `<name>`." |
| `DEPENDENCY_CRUISER_REPORT_FAILURE` | tooling | `integration` | N/A (CI-time) | yes (re-run) | CI-facing only: "`dependency-cruiser` reporting step failed to execute — treat as unknown, not zero violations." |
| `CAPABILITY_INVENTORY_STALE` | governance | `integration` | N/A (CI/review-time) | yes (fix and re-run) | CI-facing only: "Route/worker `<name>` registered in `deps.ts`/`app.ts` has no matching capability-inventory entry." |

## 3) Per-Code Details Schema

```yaml
PRODUCTION_BOOT_UNSAFE_DEFAULT:
  details:
    checkName: string      # e.g. "dev-secret-placeholder", "localhost-egress-allowance", "always-enabled-analytics-stub"

PRODUCTION_CAPABILITY_NOT_DURABLE:
  details:
    capabilityName: string
    missingRequirement: string   # e.g. "durable-adapter", "security-dependency"

SHARP_READINESS_FAILED:
  details:
    checkName: string       # "native-binary-load" | "resource-limits" | "integration-test-signal"

MAILER_SEND_REFUSED_NO_DURABLE_PATH:
  details:
    capabilityName: string
    lane: string             # "notification" (interactive-lane sends never produce this code)

CAPABILITY_INVENTORY_STALE:
  details:
    routeOrWorkerName: string
    file: string              # "deps.ts" | "app.ts"
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `PRODUCTION_BOOT_UNSAFE_DEFAULT` | Boot-time production-mode validator | Structured boot log | Fatal — process does not bind the listening socket. |
| `PRODUCTION_CAPABILITY_NOT_DURABLE` | Boot-time production-mode validator | Structured boot log | Fatal — same as above; names the specific capability from the inventory. |
| `SHARP_READINESS_FAILED` | Media route registration gate | Structured boot log | Non-fatal to the whole process — only media transform routes are withheld. |
| `MAILER_SEND_REFUSED_NO_DURABLE_PATH` | `MailerPort` purpose-scoped seam gate | Structured log + correlation id on the originating write | Never silently drops — always an observable refusal. |
| `DEPENDENCY_CRUISER_REPORT_FAILURE` | CI reporting step | CI job output | Must not be conflated with "zero violations found" (EC-05). |
| `CAPABILITY_INVENTORY_STALE` | CI/review-gate staleness check | CI job output / PR check | Non-blocking in Phase 0 (report-only), same posture as `dependency-cruiser`. |

## 5) Acceptance Checklist
- [x] Every error/refusal this phase introduces appears in Section 2.
- [x] Every code has clear retry behavior (all "no" except the two CI-tooling codes, which are re-runnable).
- [x] No `api.spec.md` exists for this phase (see spec-manifest.md) — no cross-check needed.
- [x] User-safe (here: operator/CI-safe) message guidance is provided for every code.
