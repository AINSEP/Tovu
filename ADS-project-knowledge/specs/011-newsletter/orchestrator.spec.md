# Orchestrator Contract Spec: newsletter send pipeline

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/orchestrator.spec.md`

- Spec ID: `SPEC-011`
- Feature: `FEAT-011-newsletter`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Unlike SPEC-007 (settings) and SPEC-009 (redirects), which correctly omitted this file (no
async orchestration distinct from a synchronous write chokepoint), Newsletter has a genuine
async, multi-step orchestration layer: audience freeze → outbox-driven batch fan-out →
per-row send → completion detection. This file adapts the template's generic
fetch/create/update orchestrator shape to that backend pipeline rather than a frontend data
hook, since that is what actually needs ordering/lifecycle/failure contracts here. The admin
UI itself has no separate orchestrator — it talks to the API directly (see `ui.spec.md`),
consistent with every other admin section in this repo.

## 1) Orchestrator Identity
- Name: `NewsletterSendPipeline`
- Responsibility: Drive a campaign from an authorized `send` through audience freeze,
  outbox-driven per-recipient fan-out, and completion detection — crash-safe, idempotent,
  and pausable — without ever holding a live `MailerPort` instance itself (INV-08; core
  injects and calls the port on the pipeline's behalf).

## 2) Input Contract
| Input | Required | Type | Default | Validation/Bounds | Notes |
|---|---|---|---|---|---|
| `workspaceId` | yes | `string (uuid)` | none | must resolve to a real workspace | Scope anchor (ADR-007) |
| `campaignId` | yes | `string (ulid)` | none | campaign must be `status: 'scheduled'` at entry | The unit of work this pipeline drives to `sent` |
| `batchSize` | no | `integer` | `20` | `1..200` | Matches `processOutbox`'s existing default (`src/core/events/outbox-worker.ts`); Newsletter reuses, does not fork, this primitive |
| `launchGateSnapshot` | yes (computed, not caller-supplied) | `{ met: boolean; unmetPreconditions: string[] }` | none | Evaluated fresh at `AUTHORIZE_SEND` time (REQ-21); never cached/reused from an earlier check | Server-computed only — never accepted as a client-supplied override (§ api.spec.md `SEND_CAMPAIGN` has no body) |

## 3) Output State Contract
| Field | Type | Nullability | Source | Notes |
|---|---|---|---|---|
| `campaign` | `CampaignRecord` | never null once the pipeline starts | derived | Reflects live `status`/`counters` |
| `audienceSnapshot` | `AudienceSnapshotRow` | nullable until `FREEZE_AUDIENCE` completes | derived | Immutable once created (INV-06) |
| `pendingSendCount` | `integer` | non-null | derived (`count(SendRow) where status='pending'` for this snapshot) | Drives `COMPLETE_CAMPAIGN` eligibility |
| `isDraining` | `boolean` | non-null | derived | `true` while `status==='sending'` and `pendingSendCount > 0` |
| `isPaused` | `boolean` | non-null | derived | `true` while `status==='paused'` |
| `lastError` | `Error \| null` | nullable | derived | Most recent pipeline-level (not per-row) failure, e.g. a `FREEZE_AUDIENCE` transaction failure |

## 4) Action Contracts
| Action | Inputs | Returns | Side Effects | Failure Codes |
|---|---|---|---|---|
| `authorizeSend` | `{ workspaceId, campaignId }` | `Result<{ campaign, launchGateSnapshot }>` | Flips campaign to `sending`, sets `sendStartedAt`, in one transaction with the launch-gate check (REQ-21) | `NEWSLETTER_LAUNCH_GATE_BLOCKED, NEWSLETTER_CAMPAIGN_NOT_EDITABLE, FORBIDDEN` |
| `freezeAudience` | `{ workspaceId, campaignId, listId }` | `Result<AudienceSnapshotRow>` | Inserts one snapshot row + N `SendRow`s, filtered through `newsletter.recipient.filter` + the mail-lib suppression ledger, resolved via the Members directory seam | `INTERNAL_ERROR` (never a partial write — one transaction) |
| `claimBatch` | `{ workspaceId, campaignId, batchSize }` | `Result<SendBatchJob>` | Delegates to the existing `processOutbox`/`OutboxPort.claimPending` primitive — Newsletter registers a job handler, it does not fork the claim loop | `UPSTREAM_ERROR` (transient — outbox retries) |
| `dispatchRow` | `SendRow` | `Result<MailerSendResult>` | Runs `beforeSend` (message transform) + `recipient.filter` re-check, then `MailerPort.send()` with the row's `idempotencyKey` (core-injected — the pipeline never holds the port itself, INV-08) | `NEWSLETTER_LAUNCH_GATE_BLOCKED` is never raised here — the gate is checked only at `authorizeSend`, not per row; a row-level suppression hit is a normal `failed` outcome (EC-01), not a pipeline failure code |
| `recordResult` | `{ sendId, MailerSendResult }` | `Result<{ sendRow, counters }>` | Atomic multi-write: `SendRow` terminal status + campaign `counters`, both-or-neither (REQ-24/INV-02) | `INTERNAL_ERROR` |
| `completeIfDrained` | `{ workspaceId, campaignId }` | `Result<CampaignRecord \| null>` | Flips campaign to `sent` + emits `newsletter.campaign.sent` only when `pendingSendCount === 0` for the active snapshot; returns `null` (no-op) otherwise | none — idempotent no-op when not yet drained |
| `pause` / `resume` | `{ workspaceId, campaignId }` | `Result<CampaignRecord>` | Flips `status` between `sending`/`paused`; `claimBatch` for this campaign is a no-op while `paused` | `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` |

## 5) Lifecycle Hooks
| Hook | Trigger | Ordering | Failure Behavior |
|---|---|---|---|
| `onAuthorizeSend` | immediately before the `draft`/`scheduled` → `sending` transition commits | Launch Readiness Gate check runs inside the same transaction as the status flip — never checked-then-committed separately | Any unmet precondition aborts the transition entirely; campaign stays `scheduled` (fail-closed) |
| `onFreezeAudience` | immediately after `authorizeSend` commits, before any batch is claimed | Single transaction; never runs twice for the same `sendStartedAt` (idempotent by campaign id + snapshot-not-yet-exists check) | A failure here leaves the campaign `sending` with no snapshot — resumable by re-running `freezeAudience`, never silently retried as a duplicate snapshot |
| `beforeSend` (ADR-024 §7 plugin hook — distinct from this table's internal lifecycle hooks) | per row, immediately before `MailerPort.send()` | Runs after `recipient.filter`, ordered/synchronous/fail-closed per ADR-024 §7 | A `beforeSend` hook throwing aborts that row's send attempt as `failed`, never silently skips the hook |
| `onRecordResult` | after each `MailerPort.send()`/`sendBatch()` settles | Runs once per row, never batched across rows for the atomic-write step | Non-fatal to the batch — one row's write failure does not abort sibling rows in the same batch |
| `onDrainCheck` | after every `recordResult` | Checked once per settled row, not on a separate poll loop | `completeIfDrained` is naturally idempotent (a no-op when not drained) — safe to call redundantly |

## 6) Invariants
- [ ] `isDraining` is `true` if and only if `campaign.status === 'sending'` and at least one
  `SendRow` for the active snapshot is still `pending`.
- [ ] `authorizeSend` and its Launch Readiness Gate check always commit or fail together —
  never a status flip with a skipped gate check.
- [ ] `freezeAudience` runs at most once per `sendStartedAt` value (idempotent by
  presence-check, mirroring Redirects' `SlugChangeCapture` idempotent-by-`changeSetId`
  pattern).
- [ ] `completeIfDrained` never flips a campaign to `sent` while any `SendRow` for its
  active snapshot is non-terminal.
- [ ] `claimBatch` never claims rows for a `paused` campaign.
- [ ] No action in this table ever constructs or holds a `MailerPort` instance directly in
  Newsletter-owned code (INV-08) — `dispatchRow` describes the effect, not the object
  reference; core's composition root is the sole holder.

## 7) Acceptance Checklist
- [x] Inputs/outputs/actions are fully documented.
- [x] Failure codes align with `errors.spec.md`.
- [x] Entity field names align with `state.spec.md` and `ui.spec.md`.
