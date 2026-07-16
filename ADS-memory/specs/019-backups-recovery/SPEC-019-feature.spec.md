# Feature Spec: backups-recovery

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-019 |
| version | 1.1.0 |
| status | APPROVED |
| content_hash | sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d |
| feature_name | FEAT-019-backups-recovery |
| last_edited | 2026-07-14T23:30:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (Claude Sonnet 5, delegated subagent run, 2026-07-14) |
| spec_mode | brownfield |

---

## Overview

This spec defines the Backups/Recovery admin screen (ADR-045): a distinct `/admin/recovery` screen for
restore-point management and restore execution, centered on a blocking, itemized discarded-write-window
disclosure shown before any restore is confirmed. It is a dependent domain spec that instantiates
SPEC-016's shared watermark/gated-mutation-gateway/actor-identity/`db-ops` contract for the concrete
"restore" operation — it does not redefine any of those mechanisms.

---

## Problem Statement

**Current state:** ADR-041 designed the backend primitive for site migration, snapshots, and restore
(the `db-ops` port, restore points, the `plan→confirm→execute` gateway, the sidecar `ops/` journal) but
deliberately left the Recovery/Backups screen's own information architecture unspecified beyond "it is a
sibling of the Storage Timeline, not the same screen." ADR-045 designed that screen's IA and closed that
gap. No spec yet exists that turns ADR-045's decision into testable requirements, typed contracts, and an
agent-tool catalog.

**Desired state:** Operators have a single, carefully-designed Recovery screen that lists restore points,
shows capability- and state-aware degraded modes, and walks a restore through an itemized, blocking
disclosure before any confirmation token is minted. Agents can read restore-point state and plan a restore,
but can never confirm one — restore always requires a human confirmation token, for every actor including
the site owner.

**Why now:** ADR-041, ADR-043, ADR-044, and ADR-045 are all Accepted as of 2026-07-14, and SPEC-016 (the
shared core contract they all depend on) is already written. Writing SPEC-019 now, citing SPEC-016's exact
REQ/AC/INV ids, is the only way to get the Recovery screen speced without re-deriving or silently drifting
from the watermark/gateway mechanics SPEC-016 already owns.

**Success signal:** A developer can implement the Recovery screen's IA, its restore flow, its disclosure
UI, and its degraded-mode banners from this spec plus SPEC-016's contract alone, without asking a
scope/behavior/error/state question about anything ADR-045 already decided.

---

## User Journey

1. **Trigger:** An operator's site suffered a bad migration, a bad content change, or the operator simply
   wants to inspect what restore points exist. They navigate to Recovery (a distinct screen, never a tab
   inside Storage), or they arrive via a deep link from the Site-Health storage card or the Storage
   Timeline.
2. **Steps:**
   1. The operator sees the capability/status bar (`costClass`, in-flight-operation indicator) and the
      restore-points list, newest-first.
   2. The operator selects a restore point and calls `plan()` (backup.read), seeing the target schema,
      the `quiesceIntegrity` note, and a cost/disk estimate.
   3. The operator reads the blocking, itemized discarded-write-window disclosure (Step 2) — explicitly
      labeled partial, never exhaustive — and acknowledges the partial-coverage caveat.
   4. The operator calls `confirm()`, minting a single-use, short-TTL confirmation token.
   5. The operator (or the delegate they authorized) calls `execute()`; a non-dismissable progress panel
      tracks `QUIESCING → SNAPSHOTTING → RESTORING → RESTORED | RESTORE_FAILED`, read live from the sidecar
      ops journal so a page refresh never loses progress visibility.
3. **Outcome:** The restore completes; the screen shows a deep-link back to the Storage Timeline so the
   incident thread closes in one place.
4. **Alternate paths:** If `costClass` is `'unavailable'`, no restore action is offered at all — a runbook
   pointer replaces it. If the site is in `PENDING_MIGRATION`, Recovery's banner deep-links the operator to
   Storage's forward-migration ceremony instead of offering a restore-flow resolution. If a
   `migration.interrupted` boot event exists, it surfaces at the top of the screen with a single unblock
   action. If an agent attempts the restore end-to-end, it can call `plan()` and, once a human has minted a
   token, `execute()` — but it can never call `confirm()`; no such tool exists.

---

## Scope

**In scope:**
- The Recovery screen's information architecture: capability/status bar, restore-points list, and the
  five-step restore flow (plan → disclosure → confirm → execute → completion), per ADR-045 §3.
- The blocking, itemized discarded-write-window disclosure (Step 2) as a direct consumer of SPEC-016's
  watermark/disclosure contract, including its partial-coverage labeling and covered-category restriction.
- Capability- and state-aware degraded modes: `costClass: 'unavailable'`, watermark-baseline-unavailable,
  operation-in-flight, `PENDING_MIGRATION` deep-link routing, and `migration.interrupted` surfacing, per
  ADR-045 §4.
- The deep-link contract's Recovery-side consumption of ADR-041 §7's `StorageContextEnvelope`, including
  mandatory server-side re-lookup of every carried id.
- The human admin routes and the agent-tool catalog for the Recovery domain (`backup.read`/`backup.create`/
  `backup.restore`), instantiating SPEC-016's `plan()`/`confirm()`/`execute()` gateway for the restore
  action with `domain="backup"`, `action="restore"`.
- The classification of restore-point creation (`backup.create`) as an ordinary, non-gated
  authorize()-gated mutation, distinct from the gated restore action.
- The explicit supersession of the pre-ADR-041 `/admin/backups` and `/admin/database` sitemap entries.

**Out of scope:**
- The global `storage_write_watermark` counter contract, the `plan()`/`confirm()`/`execute()` gateway's
  generic mechanics, the composite actor-identity/soft-reference pattern, and the `db-ops` port's
  `getCapabilities()`/restore-point-capture contract — all owned by SPEC-016, cited here by REQ/AC id only.
- The Storage/Timeline screen itself, its migrate-forward state machine, `SERVE_SITE`/`PENDING_MIGRATION`
  boot reconciliation, `migration.interrupted` boot-scanner mechanics, and the ADR-041 §8 Tier-3 read-only
  browser's own implementation — all owned by SPEC-017 (Storage/Timeline), per ADR-041 §§1, 3, 8, 9, 10.
  This spec only defines how Recovery's banners deep-link into that surface, not the surface itself.
- The write-path inventory and remediation work that brings additional legacy write paths onto the
  watermark chokepoint (sessions, Collections `entries`, etc.) — tracked as ADR-041 item 11's own
  deliverable, not this spec's implementation surface. This spec only states that Recovery's disclosure
  must not claim coverage of a category before that work lands.
- The Collections content-type registry (SPEC-020) and the Categories & Tags taxonomy (SPEC-018) — neither
  is read or written by the Recovery screen itself.
- The full ADR-021 identity & authorization schema and the full ADR-022 content-model design — cited here
  by reference only, per this project's Brownfield/Legacy Code Rule 3.

---

## Requirements

- REQ-01: The system MUST present Recovery as a screen distinct from the Storage Timeline screen, reachable
  at its own route (`/admin/recovery`), and MUST NOT implement Recovery as a tab, toggle, or inline mode
  switch within the Storage Timeline screen.
- REQ-02: The Recovery screen MUST gate viewing (restore-points list, capability bar, disclosure preview)
  behind a `backup.read`-class permission, MUST gate restore-point creation behind `backup.create`, and MUST
  gate restore confirmation/execution behind `backup.restore`.
- REQ-03: The Recovery screen MUST render a capability/status bar showing the current `costClass`
  (`'cheap'|'expensive'|'unavailable'`, sourced from SPEC-016 REQ-19's `db-ops.getCapabilities()`) and
  whether a restore or migration operation is currently in flight.
- REQ-04: The Recovery screen MUST render a restore-points list, ordered newest-first, where each row
  displays: capture timestamp, trigger (`pre-migration-auto | manual | template-upgrade`), captured schema
  version+tag, artifact size, `costClass` at capture, and a short discard summary.
- REQ-05: Restore-point creation (`backup.create`) MUST be implemented as an ordinary `authorize()`-gated
  mutation and MUST NOT be routed through the `plan()`/`confirm()`/`execute()` gated-mutation gateway —
  it is non-destructive and produces no discarded-write-window.
- REQ-06: Restore execution (`backup.restore`) MUST be implemented as a direct instantiation of SPEC-016's
  gated-mutation gateway (REQ-08 – REQ-15) with `domain="backup"` and `action="restore"`.
- REQ-07: The restore action's `plan()` step MUST return a preview containing the target schema
  version+tag, a `quiesceIntegrity` note (per ADR-041 §9's chokepoint-only disclosure), and a cost/disk
  estimate.
- REQ-08: The Recovery screen MUST render the discarded-write-window disclosure (Step 2) as a blocking UI
  element, computed via SPEC-016 REQ-06/REQ-07's `watermarkAtCapture` baseline, and MUST require the human
  operator to explicitly acknowledge it before `confirm()` becomes reachable.
- REQ-09: The discarded-write-window disclosure MUST enumerate counts only for categories whose write path
  is confirmed watermark-stamped (as of this spec: `posts`/`pages` writes and ADR-023 §7 plugin-table typed
  writes), and MUST NOT include any other category (including sessions, change-sets, or Collections
  `entries`) until ADR-041 item 11's write-path inventory confirms that category's write path is
  watermark-stamped. The `coveredCategories` list itself MUST be sourced from a versioned constant this
  spec owns (`api.spec.md` §5's `BackupRestorePlanResponse.details.disclosure.coveredCategories`), not from
  an external write-path-registry capability — no such capability is exposed anywhere in SPEC-016, and
  SPEC-016 REQ-02 already places the "name every watermark-stamped write chokepoint" obligation on each
  dependent domain spec's own `## Integration Contracts` section rather than on a shared registry. A future
  revision that adds a category updates this constant directly and bumps this spec's version — it does not
  wait on or delegate to an external inventory service.
- REQ-10: The disclosure's acknowledge control MUST require the operator to affirmatively acknowledge the
  partial-coverage caveat text itself, not merely a checkbox adjacent to a numeric total.
- REQ-11: When the watermark baseline cannot be computed (per SPEC-016 REQ-05, e.g. `content.db` is
  unreadable), the disclosure MUST render an explicit unknown/lower-bound estimate and MUST state plainly
  that the loss window could not be computed, never implying zero or negligible loss.
- REQ-12: When `costClass` is `'unavailable'`, restore points MUST render as read-only markers with no
  restore action, and the primary action area MUST show a runbook-pointer affordance instead of a disabled
  or dead "Restore" button.
- REQ-13: When a restore or migration operation is in flight on either Storage or Recovery, both screens
  MUST enter a blocking "operation in progress" mode that prevents starting a second concurrent restore or
  migrate operation.
- REQ-14: The Recovery screen's in-flight progress panel MUST read its state from the sidecar ops journal's
  live state machine, not from a one-shot API response, so a page refresh mid-restore does not lose
  progress visibility.
- REQ-15: The restore progress panel MUST render the live state machine's states
  (`QUIESCING → SNAPSHOTTING → RESTORING → RESTORED | RESTORE_FAILED`) and MUST be non-dismissable while any
  non-terminal state is active.
- REQ-16: On successful restore completion, the Recovery screen MUST provide a deep-link back to the
  Storage Timeline screen.
- REQ-17: When the site is in a `PENDING_MIGRATION` boot state (owned by SPEC-017/ADR-041 §10), Recovery's
  degraded-state banner's single action MUST be a deep-link into Storage's forward-migration ceremony, and
  MUST NOT offer any restore-flow action on the Recovery screen as an alternative resolution for that
  state.
- REQ-18: A restore executed from Recovery MUST NOT, by itself, clear a `PENDING_MIGRATION` boot state.
- REQ-19: When a `migration.interrupted` boot event exists (owned by SPEC-017/ADR-041 §3), Recovery MUST
  surface it at the top of the screen with a single unblock action, labeled explicitly as an accepted
  downtime vector rather than an apologetic error — the banner's accessible name/text MUST include the
  literal substring `"planned downtime"`, so this requirement is string-testable rather than a matter of
  tone judgment (see `ui.spec.md` §5's analogous rule for the disclosure's caveat-text control).
- REQ-20: Recovery MUST consume the `StorageContextEnvelope` (ADR-041 §7) unchanged on deep-link arrival,
  and MUST re-look-up every id the envelope carries (`restorePointId`, `ledgerEventId`, `siteId`)
  server-side before rendering — the envelope's carried values MUST NOT be treated as authoritative.
- REQ-21: When a `StorageContextEnvelope` carries a `restorePointId` or `ledgerEventId` that no longer
  resolves to a live record, Recovery MUST render a "not found / re-derive from current state" fallback
  rather than proceeding with the envelope's stale value.
- REQ-22: The Recovery screen MUST NOT offer a raw row-edit, SQL console, or "database-first" affordance;
  the ADR-041 §8 Tier-3 read-only browser, where enabled, MUST be surfaced under Storage, not under
  Recovery.
- REQ-23: The agent-tool catalog for the Recovery domain MUST expose `backup_plan_restore` and
  `backup_execute_restore`, per SPEC-016 REQ-22's naming convention, and MUST NOT expose any tool that
  performs the `confirm()` step for a restore.
- REQ-24: The agent-tool catalog MUST expose `backup_create_restore_point` as an agent-callable tool
  requiring `backup.create`, matching REQ-05's ordinary-mutation classification (no plan/confirm/execute
  wrapping).
- REQ-25: The agent-tool catalog MUST expose read-only tools (`backup_list_restore_points`,
  `backup_get_capabilities`) requiring only `backup.read`, callable by any principal kind.
- REQ-26: The restore ceremony (`plan()` → disclosure-acknowledge → `confirm()` → `execute()`) MUST be
  uniform regardless of `costClass` — no abbreviated or one-click restore path MUST exist for
  `costClass: 'cheap'`.
- REQ-27: Recovery MUST supersede the pre-ADR-041 `/admin/backups` sitemap entry; any existing reference to
  `/admin/backups` MUST be updated to route to `/admin/recovery`, and the pre-ADR-041 `/admin/database`
  entry MUST be retired except for the ADR-041 §8 Tier-3 read-only browser, which surfaces under Storage.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given the admin navigates to a URL that previously served the pre-ADR-041 backups
  page, when the route resolves, then the Recovery screen renders at `/admin/recovery` as an independent
  screen, not a tab within the Storage Timeline screen.
- AC-02 (REQ-01) [P2]: Given an operator is on the Storage Timeline screen, when they look for a way to
  reach Recovery, then no tab, dropdown, or in-page toggle switches into Recovery inline — navigation is
  via a distinct nav entry or an explicit deep-link only.
- AC-03 (REQ-02) [P1]: Given a principal holding only `backup.read`, when it requests the Recovery screen's
  restore-points list or capability bar, then the request succeeds and no restore or restore-point-creation
  control is enabled.
- AC-04 (REQ-02) [P1]: Given a principal without `backup.create`, when it attempts to create a restore
  point, then the attempt is rejected with `FORBIDDEN`.
- AC-05 (REQ-02) [P1]: Given a principal without `backup.restore`, when it attempts to confirm or execute a
  restore, then the attempt is rejected with `FORBIDDEN` (per SPEC-016 REQ-10/REQ-11).
- AC-06 (REQ-03) [P1]: Given `dbOps.getCapabilities()` returns `costClass: 'expensive'`, when the Recovery
  screen loads, then the status bar displays `'expensive'` and the operator sees a cost/disk-estimate
  acknowledgment requirement before the restore flow proceeds past `plan()`.
- AC-07 (REQ-03) [P2]: Given a migration is currently in flight on Storage, when the Recovery screen loads,
  then the status bar displays the in-flight indicator.
- AC-08 (REQ-04) [P1]: Given three restore points captured at different times, when the list renders, then
  they are ordered newest-first and each row displays timestamp, trigger, captured schema version+tag,
  size, and `costClass` at capture.
- AC-09 (REQ-04) [P2]: Given a restore point's trigger was a template upgrade, when its row renders, then
  the trigger label reads `template-upgrade`, distinguishable from `manual` and `pre-migration-auto`.
- AC-10 (REQ-05) [P1]: Given a principal holding `backup.create` calls the create-restore-point action,
  when it succeeds, then no confirmation token is minted and no `plan()`/`confirm()` step precedes it.
- AC-11 (REQ-05) [P2]: Given the create-restore-point action is called twice with the same idempotency key,
  when the second call is processed, then `authorize()` still runs before the idempotency short-circuit
  (per SPEC-016 REQ-14).
- AC-12 (REQ-06) [P1]: Given an operator wants to restore to a selected restore point, when they invoke the
  restore action, then the flow is exactly `plan()` → `confirm()` → `execute()` with `domain="backup"`,
  `action="restore"` — no direct single-call restore endpoint exists (per SPEC-016 REQ-08/AC-09).
- AC-13 (REQ-07) [P1]: Given `plan()` is called for a selected restore point, when it returns, then the
  response includes the target schema version+tag, a `quiesceIntegrity` note, and a cost/disk estimate.
- AC-14 (REQ-08) [P1]: Given a plan has been returned, when the operator has not acknowledged the Step 2
  disclosure, then the `confirm()` control is not enabled in the UI.
- AC-15 (REQ-08) [P1]: Given the operator has acknowledged the disclosure, when they call `confirm()`, then
  the call proceeds under SPEC-016 REQ-10's semantics.
- AC-16 (REQ-09) [P1]: Given the current write-path inventory confirms only `posts`/`pages` writes and
  ADR-023 §7 plugin-table writes as watermark-stamped, when the disclosure renders, then it lists counts
  for only those categories and omits sessions, change-sets, and Collections `entries` entirely.
- AC-17 (REQ-09) [P1]: Given ADR-041 item 11's write-path inventory has not yet confirmed Collections
  `entries`' write path as watermark-stamped, when the disclosure renders for a site with Collections data,
  then no `entries` count appears in the disclosure.
- AC-18 (REQ-10) [P1]: Given the disclosure is displayed, when the operator interacts with the acknowledge
  control, then the control's label text requires acknowledging the partial-coverage caveat sentence, not
  merely a checkbox next to a raw number.
- AC-19 (REQ-11) [P1]: Given `content.db` cannot be opened at the time the disclosure is computed, when the
  disclosure renders, then it shows an explicit unknown/lower-bound estimate and states plainly the loss
  window could not be computed (per SPEC-016 REQ-05/AC-06).
- AC-20 (REQ-12) [P1]: Given `costClass` is `'unavailable'`, when the restore-points list renders, then
  each row is a read-only marker with no "Restore" button, disabled or otherwise, and the primary action
  area shows a runbook-pointer affordance instead.
- AC-21 (REQ-13) [P1]: Given a restore is currently executing, when an operator opens the Storage Timeline
  screen, then Storage also renders the blocking "operation in progress" mode and its migrate-forward
  action is disabled.
- AC-22 (REQ-13) [P1]: Given a migration is currently executing on Storage, when an operator opens
  Recovery, then Recovery's restore action is disabled and the in-flight state is shown.
- AC-23 (REQ-14) [P1]: Given a restore is in progress and the operator refreshes the browser page, when
  Recovery reloads, then the progress panel resumes showing the correct live state, because it re-reads the
  sidecar journal rather than relying on cached response state.
- AC-24 (REQ-15) [P1]: Given `execute()` is running, when the progress panel is showing a non-terminal
  state (`QUIESCING`, `SNAPSHOTTING`, or `RESTORING`), then the panel has no close/dismiss control.
- AC-25 (REQ-15) [P1]: Given the restore reaches `RESTORED` or `RESTORE_FAILED`, when the panel updates,
  then the panel becomes dismissable and shows the terminal state.
- AC-26 (REQ-16) [P1]: Given a restore completes with `RESTORED`, when the completion view renders, then it
  includes a deep-link back to the Storage Timeline screen.
- AC-27 (REQ-17) [P1]: Given the site is in `PENDING_MIGRATION`, when Recovery renders its degraded-state
  banner, then the banner's single action is a deep-link into Storage's forward-migration ceremony, and no
  restore-flow action is offered as an alternative resolution for that state.
- AC-28 (REQ-18) [P1]: Given the site is in `PENDING_MIGRATION` and an operator successfully executes a
  restore from Recovery, when the restore completes, then the site's `PENDING_MIGRATION` state is
  unchanged.
- AC-29 (REQ-19) [P1]: Given a `migration.interrupted` boot event exists, when Recovery renders, then it
  appears at the top of the screen with a single unblock action, and the banner's accessible name/text
  contains the literal substring `"planned downtime"`.
- AC-30 (REQ-20) [P1]: Given a deep link carries a `StorageContextEnvelope` with a `restorePointId`, when
  Recovery renders, then it re-looks-up that restore point server-side and renders based on the
  re-looked-up record, never the envelope's carried display value alone.
- AC-31 (REQ-21) [P1]: Given the envelope's `restorePointId` no longer resolves to a live restore point,
  when Recovery attempts the re-lookup, then it renders a not-found/re-derive fallback (an unfocused
  restore-points list) rather than proceeding with the envelope's stale value or erroring out.
- AC-32 (REQ-22) [P1]: Given the Recovery screen's full navigation surface, when it is inspected, then no
  raw row-edit, SQL console, or database-first affordance is present anywhere on the screen.
- AC-33 (REQ-23) [P1]: Given the Recovery domain's agent-tool catalog is inspected, then
  `backup_plan_restore` and `backup_execute_restore` are both present and agent-callable, and no tool
  performs the `confirm()` step (per SPEC-016 REQ-22/AC-32).
- AC-34 (REQ-24) [P1]: Given the agent-tool catalog is inspected, then `backup_create_restore_point` is
  present, agent-callable, requires `backup.create`, and is not wrapped in a plan/confirm/execute sequence.
- AC-35 (REQ-25) [P1]: Given a `kind='agent'` principal holding `backup.read`, when it calls
  `backup_list_restore_points` or `backup_get_capabilities`, then both calls succeed with no durable state
  change.
- AC-36 (REQ-26) [P1]: Given `costClass` is `'cheap'`, when an operator initiates a restore, then the same
  `plan()` → confirm-with-disclosure → `execute()` sequence is required as for `'expensive'`, with no
  abbreviated one-click alternative.
- AC-37 (REQ-27) [P1]: Given the admin's navigation/sitemap configuration, when it is inspected after this
  feature ships, then no entry routes to the pre-ADR-041 `/admin/backups` path, and any reference to it
  points to `/admin/recovery` instead.
- AC-38 (REQ-27) [P2]: Given the pre-ADR-041 `/admin/database` entry, when the admin nav is inspected, then
  only the ADR-041 §8 Tier-3 read-only browser (where enabled) remains, surfaced under Storage — no
  standalone "Database" nav entry exists.

---

## Invariants

- INV-01: The Recovery screen must never render an enabled "Restore" action for a restore point when
  `costClass` is `'unavailable'`.
- INV-02: The Step 2 discarded-write-window disclosure must never be skipped, pre-checked, or
  auto-acknowledged before `confirm()` becomes reachable.
- INV-03: A restore point row must never be presented as restorable while a restore or migration operation
  is already in flight.
- INV-04: Recovery must never treat a `StorageContextEnvelope`'s carried id as authoritative without a
  server-side re-lookup.
- INV-05: The disclosure must never assert a numeric count for a category whose write path is not confirmed
  watermark-stamped.
- INV-06: A `confirm()`-equivalent call must never be reachable through the Recovery agent-tool catalog.
- INV-07: A `PENDING_MIGRATION` banner's action must never route to a restore-flow action rendered on the
  Recovery screen itself.

---

## Edge Cases

- EC-01: What happens when an operator opens Recovery while a Storage migration is already in flight?
  Expected behavior: Recovery enters the blocking "operation in progress" mode; no restore can be started
  until the migration resolves (REQ-13).
- EC-02: What happens when a restore point's `watermarkAtCapture` is null (captured before the column
  existed, per SPEC-016 EC-06)? Expected behavior: the disclosure renders an unknown estimate for that
  restore point and never assumes zero loss, matching SPEC-016 EC-06's expected behavior exactly.
- EC-03: What happens when a deep-link envelope's `restorePointId` no longer exists (deleted or pruned)?
  Expected behavior: Recovery renders the not-found/re-derive fallback; no restore proceeds against a stale
  id (REQ-21).
- EC-04: What happens when an agent calls `backup_execute_restore` with a token it is not entitled to
  redeem (e.g. an agent whose `delegatedBy` does not match the token's confirmer)? Expected behavior:
  rejected under SPEC-016 REQ-13's actor-class rule with `FORBIDDEN`.
- EC-05: What happens when `costClass` transitions from `'cheap'` to `'unavailable'` between when the
  restore-points list was fetched and when the operator opens the restore flow? Expected behavior:
  `plan()` recomputes capabilities fresh; if now `'unavailable'`, the restore flow refuses to proceed past
  `plan()` and the screen shows the degraded runbook-pointer state instead of allowing `confirm()`.
- EC-06: What happens when a `migration.interrupted` event and a `PENDING_MIGRATION` state are both present
  at boot? Expected behavior: the interrupted-run unblock action renders at the top of the screen (the more
  acute condition — an incomplete operation, versus a deferred one), and the `PENDING_MIGRATION` banner
  remains visible beneath it until separately resolved.
- EC-07: What happens when an operator successfully restores while the site was in `PENDING_MIGRATION`?
  Expected behavior: the restore completes normally; `PENDING_MIGRATION` remains in effect afterward
  (REQ-18), and the Storage migration deep-link banner still renders on the next Recovery load.
- EC-08: What happens when the disclosure cannot compute even a partial count because the watermark
  baseline is unavailable (`content.db` unreadable)? Expected behavior: the disclosure's acknowledge copy
  states the loss window could not be computed at all, per SPEC-016 REQ-05/AC-06 — this spec does not
  itself resolve whether `confirm()`/`execute()` can be authorized in that same state, since `authorize()`'s
  backing store is the same `content.db` (see OQ-03).

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| SPEC-016 (watermark contract, gated-mutation gateway, actor identity, `db-ops` capabilities) | The `plan()`/`confirm()`/`execute()` mechanics, the discarded-write-window disclosure computation formula, composite actor identity, and `getCapabilities()` cost-class surface this screen instantiates | If SPEC-016's contract is not implemented, Recovery cannot execute any restore or compute any disclosure | None — Recovery has no independent implementation of these mechanisms |
| ADR-041 sidecar ops journal (`storage_ledger`, `migration_runs`, `restore_points`) | The restore-point records, migration-run state machine, and boot-reconciliation events Recovery reads and acts on | If the sidecar journal is unreadable, Recovery cannot list restore points or read live operation state | None — this is the sole source of live operation state (REQ-14) |
| SPEC-017 (Storage/Timeline) — `PENDING_MIGRATION` boot state, `migration.interrupted` event, forward-migration ceremony | The boot-state signals and target ceremony Recovery's degraded banners deep-link into | If SPEC-017's migration ceremony is unavailable, Recovery's `PENDING_MIGRATION` banner has no working deep-link target | None — Recovery does not implement its own migration path (REQ-17) |
| ADR-021 identity & authorization (`authorize()`, principal kinds, agent delegation) | Permission evaluation for `backup.read`/`backup.create`/`backup.restore` | If unavailable, no Recovery action can be authorized | None — fail-closed, matches SPEC-016 REQ-14/INV-05 |
| ADR-041 §7 `StorageContextEnvelope` / deep-link contract | The envelope shape Recovery consumes on arrival from Site-Health/Storage | If the envelope is malformed, Recovery falls back to an un-focused restore-points list rather than failing to load | Falls back to the unfocused list view (REQ-21's not-found path) |

---

## Open Questions

- OQ-01: Findability of Recovery from Storage (a shared nav group with adjacent wording vs. a dedicated
  Timeline affordance) — inherited from ADR-045's own stated open question. — Owner: whoever runs the first
  operator usability pass — Resolve by: after the first operator user-testing round.
- OQ-02: Whether a lighter-weight "quick restore" path should exist for `costClass: 'cheap'` — this spec
  defaults to the uniform ceremony per REQ-26/ADR-045's stated default; revisit only if user testing shows
  operators are blocked by the friction. — Owner: Software Architect for SPEC-019 — Resolve by: before
  SPEC-019 architecture sign-off, if raised.
- OQ-03: How `authorize()` and the gated-mutation gateway can function at all when `content.db` (which
  stores `principals`) cannot be opened — SPEC-016 REQ-05 states the disclosure degrades to an unknown
  estimate in that state, but neither SPEC-016 nor ADR-041 states whether `confirm()`/`execute()` can be
  authorized at all when `authorize()`'s own backing store is unreadable. — Owner: **SPEC-016, not
  SPEC-019 alone** (reassigned per Red-Team finding RT-006, 2026-07-14) — this is a shared-contract-level
  gap that affects SPEC-017's `storage.migrate-forward` instantiation identically (a `content.db`-unreadable
  state blocks `authorize()` for both `storage.migrate` and `backup.restore` permissions equally); the
  Coordinator should route the resolution to SPEC-016 as a REQ/EC addition rather than have this spec
  resolve it independently. — Resolve by: before SPEC-019 architecture sign-off, coordinated with SPEC-016's
  own resolution timeline.
- OQ-04: **Resolved 2026-07-14 (Spec Agent, Red-Team RT-004 fold-back).** `backup.read` is confirmed as the
  final read-class permission string for this domain. Reasoning: it is consistent with `backup.create`/
  `backup.restore` already sharing the `backup.` prefix (ADR-021 §3's flat-dotted-string house style), and
  every P1 acceptance criterion, auth profile, and agent-tool `authorization.permission` field in this
  package already hard-codes that exact string — the spec was already internally committed to it in
  practice, so leaving it "open" was the actual defect RT-004 identified (a P1 AC cannot be both certifiable
  and hinge on an admittedly undecided value). No alternative naming (e.g. a `recovery.`-prefixed family) is
  adopted. This closes the open question; no further Software Architect decision is owed here.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | `ADS-memory/governance/constitution.md` Article I is an unfilled template placeholder (literal `[PRINCIPLE NAME]` text, no ratified project-specific principle) — there is no concrete compliance target to check this spec against. |
| II — Test-First | N/A | Same template-placeholder state as Article I — no ratified principle text exists in the constitution file to evaluate compliance against. |
| III — Simplicity Gate | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's own scope discipline (see Scope, Out of scope) is documented independently of any constitution article. **CONSTITUTION_FLAG (Red-Team RT-009, default-profile heuristic):** Recovery composes four independently-nontrivial pieces of machinery — (1) the five-step human-gated restore ceremony (REQ-06, REQ-08), (2) the separate non-gated `backup.create` ordinary-mutation path with its own idempotency rule (REQ-05), (3) the cross-screen (Storage + Recovery) mutual-exclusion in-flight lock (REQ-13), and (4) mandatory server-side envelope re-verification on every deep-link arrival (REQ-20) — on top of an already-complex shared gateway. Every piece traces to a named REQ (none is gratuitous), but the aggregate is exactly the "custom complexity where no single library or pattern covers the whole thing" pattern a ratified Article III would flag. Software Architect must prepare a Complexity Justification entry naming each of the four pieces above and its owning REQ before ADR sign-off, per Red-Team's routing note — this is not itself a blocking finding, but it is not optional either. |
| IV — Anti-Abstraction Gate | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against. |
| V — Integration-First Testing | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against. |
| VI — Security-by-Default | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's own permission-gating requirements (REQ-02, AC-04/AC-05) stand on ADR-021's decision, not on a constitution article. |
| VII — Spec Integrity | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec still carries its own `spec_id`/`content_hash` discipline per the Speckit compatibility contract regardless. |
| VIII — Observability | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's error envelope (see `errors.spec.md`) still carries `correlationId` regardless. |

---

## Integration Contracts

This spec is a dependent domain spec over SPEC-016's shared core contract. It does not redefine any of the
mechanisms below — it cites SPEC-016's exact ids and states which of this spec's ACs require the cited
contract to be live.

**Re-sync note (2026-07-14):** Every citation below was re-derived against SPEC-016 v1.1.0
(`content_hash: sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`) following
Red-Team findings RT-002, RT-003, and RT-008 — this was a full re-derivation against SPEC-016's actual
current REQ/AC text, not a spot-check of only the flagged sentences. SPEC-016's REQ-01 – REQ-22 numbering
is unchanged from the version this spec originally cited; the material changes were an exact 600-second
confirmation-token TTL (was "~10 minutes" — see `SPEC-019-behavior.spec.md` §4), a new `AC-33` for
`costClass: 'expensive'` (folded into the `db-ops` capability surface paragraph below), and a named
`ActorIdentityRef` entity / `APPEND_ACTOR_REFERENCE` action for the REQ-16 – REQ-18 composite-identity area
(folded into that paragraph's correction below). No other citation range required a change beyond the
three corrections below.

**Watermark / discarded-write-window disclosure (SPEC-016 REQ-01 – REQ-07, AC-01 – AC-08, INV-01 – INV-02):**
Recovery's Step 2 disclosure (REQ-08 – REQ-11 here) is a direct consumer of SPEC-016's
`storage_write_watermark` counter (REQ-01), the `restore_points.watermarkAtCapture` requirement (REQ-06),
and the generic disclosure-computation rule that requires labeling coverage as partial and rendering an
unknown/lower-bound estimate when the baseline is unreadable (REQ-05, REQ-07). AC-16 – AC-19 here require
SPEC-016 REQ-01 – REQ-07 to be live and correctly implemented; without them, Recovery has no baseline to
compute a disclosure from at all. (`AC-06` here is a `db-ops` capability-surface concern, not a watermark
concern — see that paragraph below; it does not belong in this one.)

**Gated-mutation gateway (SPEC-016 REQ-08 – REQ-15, REQ-22, AC-09 – AC-22, AC-32, INV-03 – INV-05):**
The restore action (REQ-06 – REQ-07, REQ-14 – REQ-15 here) is a direct instantiation of SPEC-016's
`plan()`/`confirm()`/`execute()` gateway with `domain="backup"`, `action="restore"`. AC-12 – AC-15,
AC-21 – AC-22, and AC-33 here require SPEC-016 REQ-08 – REQ-15 and REQ-22 to be live; without the gateway's
`authorize()`-ordering, token-minting, and actor-class-redemption rules, no restore in this spec can be
executed safely. AC-23 – AC-25 here (the restore progress panel's refresh-safety and non-dismissability)
depend instead on the ADR-041 sidecar ops journal already named in this spec's own Dependencies table, not
on this gateway — SPEC-016's own gateway defines only `plan()`/`confirm()`/`execute()` with no
polling/progress action of its own (see `SPEC-016-orchestrator.spec.md` §4), so the live-state read those
ACs test is a mechanism this domain spec reads directly, not a SPEC-016 dependency.

**Composite actor identity / soft cross-boundary reference (SPEC-016 REQ-16 – REQ-18, INV-06 – INV-07):**
The restore action's `execute()` step (REQ-06 here) stamps the composite `(actorWorkspaceId, actorId)` pair
(and the `delegatedBy` pair where applicable) onto the restore-execution ledger row it produces, per
SPEC-016 REQ-16's `APPEND_ACTOR_REFERENCE` action and REQ-17's core-mediated-write-path rule — this is
already covered generically by the "Gated-mutation gateway" paragraph above and by
`SPEC-019-orchestrator.spec.md`'s `executeRestore` action note ("stamps composite actor identity per
SPEC-016 REQ-16"), not a separate dependency this spec must re-derive. **No acceptance criterion in this
package independently renders or tests that ledger row's actor-identity field.** `RestorePointSummary`/
`RestorePointRow` (REQ-04, AC-08) carries no actor field, and neither does the `migration.interrupted`
banner (AC-29) — per ADR-041 §4, composite actor identity is a documented property of the append-only
`storage_ledger`/`migration_runs` rows, not of the `restore_points` artifact table Recovery's list renders
(ADR-041's own round-1 audit fold commits `restore_points` only to persisting `watermarkAtCapture`, never
an actor column), and ADR-045 §3's restore-point row description (timestamp · trigger · schema · size)
likewise carries no actor/creator column. **Reasoning for this correction (Red-Team RT-003):** the prior
citation of AC-08/AC-29 against REQ-16 – REQ-18 was inaccurate — neither AC displays actor context today.
If a future revision decides Recovery's UI should surface "who triggered this restore point" or "who ran
this restore," that is a new REQ/AC and a new `state.spec.md`/`ui.spec.md` field this spec does not
currently define — not an existing, silently-unmet requirement.

**`db-ops` capability surface (SPEC-016 REQ-19 – REQ-21, AC-28 – AC-31, AC-33):** Recovery's
capability/status bar (REQ-03) and its `costClass`-aware degraded modes (REQ-12) are direct consumers of
SPEC-016 REQ-19's `getCapabilities()` shape, and its restore-point rows (REQ-04) read the artifact kind
SPEC-016 REQ-20/REQ-21 define for SQLite/Postgres capture. AC-06, AC-08, and AC-20 here require SPEC-016
REQ-19 – REQ-21 to be live; without `getCapabilities()`, Recovery cannot determine whether to show the
restore action at all. AC-06 here specifically also requires SPEC-016's `AC-33` (the
`costClass: 'expensive'` case, added in SPEC-016 v1.1.0) to be live and correctly implemented, since AC-06
tests that exact capability value and its cost/disk-estimate acknowledgment gate.

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified: `ADS-memory/specs/005-*` and `ADS-memory/reports/pipeline/005-*` were confirmed absent before this run; SPEC-019 is newly assigned here)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (this feature has real precedence/ordering/degraded-mode rules — see Scope)
- [x] traceability.spec.md complete (marked "pending implementation" — no code has been written yet)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] `spec_mode` is `brownfield` — brownfield evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives

Always:
- Instantiate SPEC-016's gated-mutation gateway exactly as defined (SPEC-016 REQ-08 – REQ-15, REQ-22) for
  the restore action — do not introduce a second gateway implementation.
- Use `domain="backup"`, `action="restore"` for the gateway's route and agent-tool naming (REQ-06, REQ-23).

Ask before:
- Introducing any "quick restore" shortcut path for `costClass: 'cheap'` that bypasses the uniform
  plan→confirm→execute ceremony (REQ-26) — ADR-045 explicitly left this open as a possible future revision,
  not a default (OQ-02).
- Adding a session-count or Collections-`entries` category to the discarded-window disclosure before
  ADR-041 item 11's write-path inventory confirms that path is watermark-stamped (REQ-09).

Never:
- Expose a `backup_confirm_restore`-equivalent tool in the agent-tool catalog (REQ-23, SPEC-016 REQ-22).
- Let the disclosure's acknowledge step summarize the partial-coverage caveat into a reassuring one-liner or
  omit it (REQ-08/REQ-10 — ADR-045 §2's central safety requirement).
- Offer a raw row-edit, SQL console, or "database-first" affordance on the Recovery screen (REQ-22).
