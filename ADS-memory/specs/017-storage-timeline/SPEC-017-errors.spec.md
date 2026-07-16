# Error Code Registry Spec: storage-timeline

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-017`
- Feature: `FEAT-017-storage-timeline`
- Version: `1.3.0`
- Content Hash: `sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8`
- Last Edited: `2026-07-15T00:45:00Z`

## Purpose

Domain-specific error codes for the Storage/Timeline surface. SPEC-016's gateway/watermark codes
(`PLAN_STALE`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED`, `FORBIDDEN`, `UNAUTHENTICATED`,
`VALIDATION_ERROR`, `RATE_LIMIT_EXCEEDED`, `WATERMARK_BASELINE_UNAVAILABLE`, `INTERNAL_ERROR`)
apply here unchanged and are not redefined — only the codes specific to migrate-forward, drift,
and the Tier-3 browser are registered below.

## 1) Error Envelope (Base Payload)

Identical to SPEC-016 `errors.spec.md` §1 — not restated.

## 2) Error Code Registry

| Code | Category | Layer | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `SCHEMA_DRIFT_DIVERGED` | conflict | `api` | 409 | yes (re-plan, then re-confirm) | "This site's schema has diverged from a different migration lineage than the one you planned against. Review the current drift status before retrying." |
| `RESTORE_POINT_UNAVAILABLE` | integrity | `api` | 422 | no (until the underlying capability changes) | "A restore point cannot currently be captured for this site, so this operation cannot run safely. See the runbook link for how to enable restore points." |
| `TIER3_DISABLED` | authz | `api` | 403 | no | "The read-only table browser is not enabled for this site." |
| `MIGRATION_ALREADY_IN_FLIGHT` | conflict | `api` | 409 | yes (wait, then retry) | "A migration is already running for this site. Wait for it to finish before starting another." |

## 3) Per-Code Details Schema

```yaml
SCHEMA_DRIFT_DIVERGED:
  details:
    siteSchemaTag: string
    runtimeSchemaTag: string
    schemaVersionIndex: integer   # equal on both sides — divergence is detected by tag, not index (REQ-03)

RESTORE_POINT_UNAVAILABLE:
  details:
    costClass: "unavailable"
    runbookUrl: string

MIGRATION_ALREADY_IN_FLIGHT:
  details:
    migrationRunId: string
    currentStatus: string   # a MigrationRunStatus value
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `SCHEMA_DRIFT_DIVERGED` | the drift check (REQ-03), evaluated at `plan()` and re-evaluated at `execute()` | `DriftBanner` / `MigrateForwardWizard` | Distinguished from SPEC-016's `PLAN_STALE`: `PLAN_STALE` means "the plan you confirmed is out of date"; `SCHEMA_DRIFT_DIVERGED` means "the site's own lineage no longer matches what a fresh plan could safely target" |
| `RESTORE_POINT_UNAVAILABLE` | `execute()` (REQ-08) and `backup_create_restore_point` (REQ-22) | `MigrateForwardWizard` / `RestorePointsPanel` | Never bypassable by any attestation field, per REQ-08's explicit no-override rule |
| `TIER3_DISABLED` | `STORAGE_TIER3_DESCRIBE_TABLES` / `STORAGE_TIER3_READ_ROWS` | `Tier3BrowserPanel` (or its absence) | Also returned if a non-`user` principal kind somehow reaches this endpoint, since REQ-25 makes it human-only regardless of tier |
| `MIGRATION_ALREADY_IN_FLIGHT` | `executeMigrateForward` orchestrator action | `MigrateForwardWizard` | A concurrency guard distinct from `PLAN_STALE` — the plan hash may still match, but a second concurrent execution is refused outright |

## 5) Acceptance Checklist
- [x] Every error emitted by this domain appears in Section 2, plus SPEC-016's codes reused
      unchanged.
- [x] Every code has clear retry behavior.
- [x] Every code used in `api.spec.md` appears here or in SPEC-016's `errors.spec.md`.
- [x] User-safe message guidance is provided.
