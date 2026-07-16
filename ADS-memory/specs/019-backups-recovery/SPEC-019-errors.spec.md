# Error Code Registry Spec: backups-recovery

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-019`
- Feature: `FEAT-019-backups-recovery`
- Version: `1.1.0`
- Content Hash: `sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d`
- Last Edited: `2026-07-14T23:30:00Z`

## Purpose

Recovery-domain-owned error codes. The restore action reuses SPEC-016's gated-mutation-gateway codes
(`PLAN_STALE`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED`, `FORBIDDEN`, `UNAUTHENTICATED`,
`VALIDATION_ERROR`, `RATE_LIMIT_EXCEEDED`, `WATERMARK_BASELINE_UNAVAILABLE`, `INTERNAL_ERROR`) unchanged —
see `SPEC-016-errors.spec.md` for their definitions. This file defines only the codes specific to the
Recovery screen's own concerns: restore-point lookup, the operation-in-flight lock, the `costClass`
degraded state, and deep-link envelope resolution.

## 1) Error Envelope (Base Payload)

Identical to SPEC-016's envelope (`SPEC-016-errors.spec.md` §1) — not restated:

```yaml
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null
details: object|null
```

## 2) Error Code Registry

| Code | Category | Layer | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `RESTORE_POINT_NOT_FOUND` | not-found | `api` | 404 | no | "That restore point no longer exists. Refresh the list and try again." |
| `RESTORE_OPERATION_IN_FLIGHT` | conflict | `api` | 409 | yes (after the in-flight operation resolves) | "Another restore or migration is already in progress. Wait for it to finish before starting a new one." |
| `COST_CLASS_UNAVAILABLE` | integration | `api` | 409 | no (not until backup capability changes) | "In-product restore isn't available for this site right now. See the runbook for manual recovery steps." |
| `DEEP_LINK_TARGET_NOT_FOUND` | not-found | `api` | 404 | no | "That link has expired or points to something that no longer exists. Showing the current restore-points list instead." |

## 3) Per-Code Details Schema

```yaml
RESTORE_POINT_NOT_FOUND:
  details:
    restorePointId: string

RESTORE_OPERATION_IN_FLIGHT:
  details:
    inFlightKind: enum[restore, migration]
    startedAt: string   # ISO-8601 UTC

COST_CLASS_UNAVAILABLE:
  details:
    costClass: "'unavailable'"
    runbookUrl: string

DEEP_LINK_TARGET_NOT_FOUND:
  details:
    envelopeCorrelationId: string
    missingIdKind: enum[restorePointId, ledgerEventId, siteId]
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `RESTORE_POINT_NOT_FOUND` | `RecoveryOrchestrator.planRestore` | Recovery screen's plan step | Distinct from `DEEP_LINK_TARGET_NOT_FOUND` — this is a direct lookup failure, not an envelope re-verification failure |
| `RESTORE_OPERATION_IN_FLIGHT` | `RecoveryOrchestrator.createRestorePoint` / `executeRestore`'s `onBeforeCreateOrExecute` hook | Recovery screen + Storage screen (cross-screen block, REQ-13) | Never silently queues a second operation — always a hard reject |
| `COST_CLASS_UNAVAILABLE` | `RecoveryOrchestrator.planRestore`'s `onBeforePlanRestore` hook | Recovery screen's degraded-state banner | Matches ADR-041 §2's "no attestation override" — there is no bypass path for this code |
| `DEEP_LINK_TARGET_NOT_FOUND` | `RecoveryOrchestrator.resolveDeepLinkContext` | Recovery screen on deep-link arrival | Not a hard API failure — the orchestrator returns `{found: false}` (see `api.spec.md` §5's `RecoveryContextResponse`); the screen renders the not-found/re-derive fallback (REQ-21) rather than erroring |

## 5) Acceptance Checklist
- [x] Every error emitted by this spec's own domain appears in Section 2.
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here or in `SPEC-016-errors.spec.md`.
- [x] User-safe message guidance is provided.
