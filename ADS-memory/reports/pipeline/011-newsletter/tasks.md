# Tasks: newsletter

- Spec: SPEC-011 v1.0.0 (hash: sha256:dc29d67a0df612ed7ba71a36b40279eb3dfb934c3d91e8538fa429cb4eb5a583)
- ADR: ADR-PIPE-011 (ACCEPTED 2026-07-13)
- Outline: ADS-memory/reports/pipeline/011-newsletter/implementation-outline.md (Status: PRODUCED)
- Date: 2026-07-13T00:00:00Z
- Author: Coordinator

## ⚠ Coordinator Audit (2026-07-13, post-session-limit termination)

The implementation agent was killed by an API session limit mid-run, not by a task failure — this is the largest of the 6 Wave-1 features (60 tasks) and got the least far, as expected. Audited by direct file inspection + scoped test runs. **Individual task checkboxes below are NOT updated** — verified at phase/module level, not task-by-task. One real bug found and fixed by the Coordinator directly (not by a subagent): `send-pipeline.ts` had a `tsc` error (`DomainEvent<SendBatchJob>` not assignable — missing index signature) from being cut off mid-edit; fixed with the same `event as unknown as DomainEvent` cast Redirects' agent had already established for the identical error shape. Findings:

- **Done and verified (83/83 scoped tests passing, `tsc` clean after the fix above):** Stages 1-4 — all repo ports/adapters, `data-module-manifest.ts` + its REQUIRED gating failure-rollback test (`data-module-manifest.failure-rollback.test.ts`, present and passing — the hard gate WAS respected), `launch-gate.ts`, `campaign.ts`/`campaign-write-service.ts`, `lists.ts`/`subscriptions.ts`/`confirmation.ts`/`unsubscribe.ts`, `send-pipeline.ts`/`hooks.ts`. In-memory adapters wired into `server/app.ts` (`ensureDefaultList` etc.).
- **NOT done:** Stage 5 — `src/server/routes/admin/newsletter/` contains only `deps.ts` (type definitions), **zero actual route handlers** exist for any of the 19 admin + 2 public routes. No admin UI exists.
- **Next step if resuming:** Stage 5 (routes + UI) is the actual resume point — the entire domain/chokepoint layer underneath it is solid and tested, this is a real "continue from here," not a "start over."

## Format

`[ID] [P?] [Story ref] Description` — [P] = parallel-safe (different files, no shared mutable state within the phase). Phases and order are derived **exactly** from the implementation outline's Downstream Handoff Notes 5-stage sequence: (1) schema + data-module-manifest + 6 repo ports/adapters, (2) `campaign.ts`/`campaign-write-service.ts`/`launch-gate.ts` (certified first, highest aggregate risk), (3) `lists.ts`/`subscriptions.ts`/`confirmation.ts`/`unsubscribe.ts`, (4) `send-pipeline.ts`/`hooks.ts` (depends on 2+3), (5) the 19+2 routes and the UI (depend on 1-4 being real, not mocked, per Article V).

Task checkboxes are **Coordinator-owned state**. TDD, Programmer, TestRunner, and Code Review treat this file as **read-only** unless the Coordinator explicitly delegates a task-list update.

---

## ⚠ Flag — Real Sending Is Inherently Blocked Today (Not a Task, Not Closeable By This Tasks List)

Two hard prerequisites for real recipient sending do not exist anywhere in this repo, independent of how completely the tasks below are executed:

- **Zero `MailerPort` adapters exist.** `ConsoleMailerAdapter`/`SmtpMailerAdapter`/`HttpApiMailerAdapter`/`InMemoryMailerAdapter` are all bare `type X = MailerPort` aliases in `src/mail/index.ts` — no class implements any of them.
- **Zero `KeyringPort` adapters exist.** `src/integrations/ports.ts` defines the interface only; no concrete adapter (not even in-memory) exists.

Neither gap is this feature's job to close (SPEC-011 Dependencies table names both as inherited, unbuilt preconditions), and no task in this list attempts to build a mail or keyring adapter. The architecture's answer to this fact is precondition (d) of the **Launch Readiness Gate** (`evaluateLaunchGate`, T018) — it structurally blocks a full-audience send while the bound `MailerPort` reports a `console`/`memory` driver, and precondition (b) blocks it while `MembersConsentCapability` is unbound. Completing every task in this list produces a feature that is fully buildable, testable, and demonstrable end-to-end against in-memory doubles — but it will correctly refuse to send real email to real recipients until a real mail adapter, a real keyring adapter, and Members' real consent capability all exist and are wired in. That is the gate working as designed, not a defect in this tasks.md.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` (lines/branches/functions/statements).
- Integration minimums: defaults `90/90/90/90`.
- E2E minimums: N/A — no browser E2E suite for this backend+admin-screen feature; the Newsletter screen gets a manual `/verify` pass (T055) per the repo's established pattern (mirrors `reports/pipeline/007-settings-core-ledger/tasks.md` T047), not an automated E2E suite in this pass.
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests and all invariants (INV-01…INV-10) passing. No lower threshold requested.
- **Contract Tests** (from outline): shared contract-test suite for the 6 repo ports (`NewsletterCampaignRepoPort`, `NewsletterListRepoPort`, `NewsletterSubscriptionRepoPort`, `NewsletterAudienceSnapshotRepoPort`, `NewsletterSendRepoPort`, `NewsletterConfirmationTokenRepoPort`) run against both `repo.memory.ts` and `repo.sqlite.ts` (matches `members`/`settings` precedent).

### Required Suites

- Unit: **required** — campaign status-machine guard, `evaluateLaunchGate`, `deriveRequiredPermission`-equivalent auth checks, hook-ordering, confirmation reissuance, per-field validation/bounds.
- Integration: **required** — the 21 HTTP routes via the existing `src/server/__tests__/routes/` harness; `campaign-write-service.ts` chokepoint tx integrity at the real SQLite adapter; the `declareDataModule()` failure/rollback path against Newsletter's real 5-table manifest (T010); the full send-pipeline orchestrator cycle.
- E2E: **not applicable** — see Coverage Profile above; T055 is a manual `/verify` pass, not an automated E2E suite.

### Coverage Tool

- Tool: node:test built-in coverage — `node --import tsx --test --experimental-test-coverage` (no new dependency; matches existing `npm run test:cov`, per the Settings precedent).
- Machine-readable output path: `coverage/lcov.info` (via `--test-reporter=lcov`).
- Cleanup paths before run: `coverage/`.
- Per-suite output: unit + integration share the node:test run (co-located `*.test.ts`); split reporting by path glob if TestRunner needs per-suite numbers.

### Performance (optional)

- N/A — SPEC-011 has no latency/throughput NFRs beyond the existing rate-limit middleware and the outbox worker's existing tuning (batch size 1-200, default 20), which this feature reuses unmodified rather than introducing a new performance target.

---

## Phase 0 — Setup

No story dependencies.

- [ ] T001 [P] Create directory structure: `src/newsletter/__specs__/`, `src/newsletter/__tests__/` (existing `src/newsletter/ports.ts`/`types.ts` stay in place, extended not replaced), `src/server/routes/admin/newsletter/`
- [ ] T002 [P] Add the 2 bespoke Drizzle table definitions to `src/infra/db/schema.ts`: `newsletterCampaigns`, `newsletterCampaignRevisions` (state.spec.md §1; NOT the 5 `p_newsletter__*` tables — those are `declareDataModule()`-owned, see Phase 1)
- [ ] T003 [P] Confirm/wire `npm run test:cov` (node:test `--experimental-test-coverage` → `coverage/lcov.info`) — reuse the existing script if already wired by the Settings feature; do not duplicate

---

## Phase 1 — Foundational (Stage 1: schema + data-module-manifest + 6 repo ports/adapters)

Blocks all story phases. This phase also carries the **ADR-PIPE-011-flagged highest infrastructure risk**: `declareDataModule()` (`src/features/plugins/data-module.ts`) is spike-quality code — its own header calls it an "exploratory spike... to surface real problems," written before ADR-023 was ACCEPTED — now being made load-bearing for five production tables. T010 below is a **required, dedicated, gating task**, not an optional or bundled-in test.

- [ ] T004 [P] [C-001..C-006] Write failing shared contract-test suite for all 6 repo ports (definitions + CRUD behavior expected of each) — `src/newsletter/__tests__/repo.contract.test.ts` (parameterized to run against both `repo.memory.ts` [T012] and `repo.sqlite.ts` [T013] once they exist)
- [ ] T005 [P] Extend `src/newsletter/ports.ts`: add `NewsletterCampaignRepoPort`, `NewsletterListRepoPort`, `NewsletterSubscriptionRepoPort`, `NewsletterAudienceSnapshotRepoPort`, `NewsletterSendRepoPort`, `NewsletterConfirmationTokenRepoPort`, and the `MembersConsentCapability` typed seam (declared unbound/`null`-by-default — Programmer must NOT implement a local stand-in that returns success)
- [ ] T006 [P] Extend `src/newsletter/types.ts`: add `ConfirmationTokenRecord` (OQ-03, mirrors `MagicLinkTokenRecord`); rename `NEWSLETTER_PERMISSIONS` from unprefixed `newsletter.*` strings to `admin.newsletter.*` (REQ-25 Agent Directive; confirmed additive, zero existing call sites per ADR-PIPE-011 Migration Safety)
- [ ] T007 [REQ-25, AC-42] Register the `admin.newsletter.*` permission catalog in `src/identity/permissions.ts` via the existing `registerPermission()` pattern (depends T006; same pattern SPEC-009 used for `admin.redirects.manage`)
- [ ] T008 [P] Implement typed error classes for every `errors.spec.md` `NEWSLETTER_*` code (`NEWSLETTER_CAMPAIGN_NOT_FOUND`, `NEWSLETTER_LIST_NOT_FOUND`, `NEWSLETTER_SUBSCRIPTION_NOT_FOUND`, `NEWSLETTER_SUBSCRIBER_NOT_FOUND`, `NEWSLETTER_VALIDATION_ERROR`, `NEWSLETTER_CAMPAIGN_NOT_EDITABLE`, `NEWSLETTER_DEFAULT_LIST_PROTECTED`, `NEWSLETTER_CONFLICT`, `NEWSLETTER_LAUNCH_GATE_BLOCKED`, `NEWSLETTER_CONFIRM_TOKEN_INVALID`, `NEWSLETTER_UNSUBSCRIBE_TOKEN_INVALID`) — `src/newsletter/errors.ts` (mirrors `src/members/types.ts`'s error-class pattern)
- [ ] T009 Declare Newsletter's `DataModuleDecl` for the 5 `p_newsletter__*` tables (`lists`, `subscriptions`, `audience_snapshots`, `sends`, `confirmation_tokens`), first-party-bundled scope only — `src/newsletter/data-module-manifest.ts` (declaration only; does not yet wire the boot-time call — see T011, gated by T010)
- [ ] T010 🔴 **REQUIRED, GATING** [ADR-PIPE-011 Mitigations Required] Write a dedicated integration test that forces a mid-DDL failure against Newsletter's **real** 5-table manifest (T009) invoked through the real `declareDataModule()` mechanism, and assert the pre-DDL snapshot restores the target SQLite DB to its exact pre-existing state (no partial tables, no orphaned rows) — `src/newsletter/__tests__/data-module-manifest.failure-rollback.test.ts`. This is the ADR's single highest-risk infrastructure dependency: `declareDataModule()` has never been exercised against Newsletter's actual manifest, and its own header discloses spike-quality status predating ADR-023's ACCEPTED status. **This task MUST pass before T011 is considered complete, and gates every downstream task that writes to a `p_newsletter__*` table (T013, and transitively T026, T027, T028, T029, T037).** Code Review blocks approval of the schema-creation task without this test present and passing (ADR-PIPE-011 Enforcement).
- [ ] T011 Wire `installNewsletterDataModule()` boot-time invocation into `src/server/seed.ts` (depends T009, and **T010 passing**) — idempotent, safe on repeated boot (matches `declareDataModule()`'s own skip-if-exists behavior)
- [ ] T012 [P] Implement in-memory adapter for all 6 repo ports — `src/newsletter/repo.memory.ts` (depends T005)
- [ ] T013 Implement SQLite/Drizzle adapter — `src/newsletter/repo.sqlite.ts`: Drizzle-backed accessors for `newsletterCampaigns`/`newsletterCampaignRevisions` (depends T002) + `declareDataModule()`-backed raw accessors for the 5 `p_newsletter__*` tables per ADR-023 §7/§8 (depends T005, **T010 passing**, T011)
- [ ] T014 Run Phase 1 tests to convergence (contract suite × both adapters, the T010 failure-rollback test, permission-registration test)

**Checkpoint**: Foundation + the `declareDataModule()` risk gate complete. Story phases can now begin — Stage 2 (Phase 2) starts here; Phase 3/4 story work that writes to any `p_newsletter__*` table remains blocked until T010/T013 are green, regardless of Phase 2/3 story sequencing below.

---

## Phase 2 — [Story: REQ-21 Launch Readiness Gate + REQ-06 campaign chokepoint] (P1) — Stage 2, certified FIRST

**Goal**: `evaluateLaunchGate()` ships as ONE exported, always-evaluated function (never scattered if-checks), and the campaign write chokepoint never allows a campaign row to exist without a same-transaction revision row. Per the implementation outline's explicit Downstream Handoff Notes, this stage is certified **before** Stage 4 (`send-pipeline.ts`) is permitted to wire `authorizeSend` against it — mirrors SPEC-007's `deriveRequiredPermission` sequencing treatment.
**Independent test**: call `evaluateLaunchGate` with exactly two of four preconditions unmet → both and only both named, in fixed (a)→(d) order, with no other module wired yet; call `saveCampaign` under a forced mid-transaction failure → assert zero rows persist.

- [ ] T015 [P] [REQ-21, INV-05, EC-05, EC-10, behavior.spec §1.2] Write failing tests for `evaluateLaunchGate`: exactly two of four preconditions unmet → both and only both named, in fixed (a)→(d) order (AC-27/28/29 combinations); all four met → gate reports met (AC-30); `isTestSend: true` with (a)/(b) unmet but (c)/(d) met → gate reports met (AC-31); `isTestSend: true` with no verified origin → still blocked, precondition (c) never waived (EC-10) — `src/newsletter/__tests__/launch-gate.test.ts`
- [ ] T016 [P] [REQ-04, REQ-05, REQ-07, REQ-18, AC-05, AC-06, AC-07, AC-24, behavior.spec §1.1] Write failing tests for `transitionCampaignStatus`: every `(from, to, actorTier)` combination named in behavior.spec §1.1's precedence table, including the compose-tier attempt to set `status: 'sent'` directly → rejected — `src/newsletter/__tests__/campaign.test.ts`
- [ ] T017 [P] [REQ-01, REQ-06, REQ-09, INV-01, AC-01, AC-08, AC-11, EC-06] Write failing integration test for `saveCampaign` at the real DB-transaction boundary: AC-08 forces a mid-tx failure and asserts neither the campaign row nor the revision row persists; unknown `listId` on schedule/send rejected (AC-11); subject 998 chars accepted / 999 chars rejected (behavior.spec §4/§7); concurrent same-`version` writers → second gets `NEWSLETTER_CONFLICT`, never silently merged (EC-06) — `src/newsletter/__tests__/campaign-write-service.test.ts`
- [ ] T018 🔴 **CERTIFIED FIRST** [REQ-21, INV-05] Implement `evaluateLaunchGate()` in `src/newsletter/launch-gate.ts` as ONE exported, always-evaluated function — evaluates all four preconditions (sending_enabled, `MembersConsentCapability` binding presence, `OriginRegistryPort.canonicalOrigin` resolution, non-`console`/`memory` `MailerPort` driver) every single time, never short-circuits, never re-implemented as scattered if-checks anywhere else (depends T015). **Must be green before any Phase 4 task wires `authorizeSend` to call it — no other call site may duplicate or bypass it.**
- [ ] T019 [REQ-04, REQ-05, REQ-07, REQ-18] Implement `transitionCampaignStatus` pure guard — `src/newsletter/campaign.ts` (depends T016)
- [ ] T020 [REQ-01, REQ-06, REQ-09, INV-01] Implement `campaign-write-service.ts`: `saveCampaign`/`cancelCampaign`/`scheduleCampaign` — THE campaign write chokepoint (repo write methods for `newsletter_campaigns`/`newsletter_campaign_revisions` imported here only); calls `campaign.ts`'s `transitionCampaignStatus` before every status-affecting write; campaign + revision write in the same transaction (depends T012, T013, T017, T019)
- [ ] T021 Run Phase 2 tests to convergence

**Checkpoint**: `evaluateLaunchGate()` and the campaign chokepoint certified — this feature's two highest aggregate-risk contracts pass. **PASSED before Phase 4 begins.**

---

## Phase 3 — [Story: REQ-08/09 lists, REQ-10/31 subscriptions, REQ-11/12/13/32 confirmation, REQ-14/15 unsubscribe] (P1) — Stage 3

**Goal**: The remaining four chokepoints — lists, subscriptions, confirmation-token lifecycle, and the fail-closed unsubscribe check — each land as an isolated, single-writer file, per the architect's Stage 3 grouping.
**Independent test**: default list seeded once per workspace and rejects archive (AC-10); a stale-revision unsubscribe token is rejected while a current-revision one succeeds and a repeat of an already-processed token is idempotent success (AC-18/19/20); a confirm consumes only after Members reports `granted` (AC-15).

- [ ] T022 [P] [REQ-08, REQ-09, AC-10] Write failing tests: exactly one default list seeded per workspace; archive rejected for `isDefault: true` (`NEWSLETTER_DEFAULT_LIST_PROTECTED`); unknown `listId` on schedule/send already covered by T017 — `src/newsletter/__tests__/lists.test.ts`
- [ ] T023 [P] [REQ-11, REQ-12, REQ-13, REQ-32, INV-03, AC-14, AC-15, AC-16, AC-17, EC-02] Write failing tests: `issueConfirmationToken` sends the confirm email without changing subscription status yet (AC-14); at most one unconsumed token exists at a time, reissuance invalidates the prior one (behavior.spec §2.1, AC-16); `consumeConfirmationToken` flips `SubscriptionRow.status` to `subscribed` **strictly after** a mocked `MembersConsentCapability.confirm` reports `granted` — never before or regardless of it (AC-15, INV-03); expired/consumed token rejected with no state change (AC-17); a second click on an already-consumed token is invalid, not a repeat success (EC-02, distinguishing it from the unsubscribe EC-03 carve-out) — `src/newsletter/__tests__/confirmation.test.ts`
- [ ] T024 [P] [REQ-14, REQ-15, REQ-30, REQ-32, INV-04, INV-09, AC-18, AC-19, AC-20, AC-39, EC-03] Write failing tests for `processUnsubscribe`: stale-revision token (from a re-subscribe under a new consent grant) rejected (AC-18); current-revision token succeeds and calls `MembersConsentCapability.revoke` (AC-19); a repeat of the same now-processed token is idempotent success, not rejected — three separate tests so the narrow EC-03 carve-out cannot swallow INV-04 (AC-20/EC-03); links built only via `OriginRegistryPort.canonicalOrigin` — an attacker-controlled `Host` header has no effect on the generated link's origin (AC-39/INV-09) — `src/newsletter/__tests__/unsubscribe.test.ts`
- [ ] T025 [P] [REQ-10, REQ-31, AC-12, AC-13, AC-40, EC-07, EC-08] Write failing tests: `saveSubscription` resolves `subscriberId` via `SubscriberDirectoryPort`, creates a `pending` subscription (AC-12); unknown `subscriberId` rejected with `NEWSLETTER_SUBSCRIBER_NOT_FOUND` (AC-13); a `null`/omitted directory result is expected, not an error, when resolving multiple ids (EC-07); `importSubscriptions` routes every row through the **identical** per-row path `saveSubscription` uses — a batch with one invalid id still creates the valid rows via that same path (AC-40/EC-08); import batch of 500 accepted, 501 rejected before any row is written (behavior.spec §4/§7) — `src/newsletter/__tests__/subscriptions.test.ts`
- [ ] T026 [REQ-08, REQ-09] Implement `lists.ts`: `saveList`, `archiveList` + default-list protection (depends T012, T013, T022)
- [ ] T027 [REQ-11, REQ-12, REQ-13, REQ-32, INV-03] Implement `confirmation.ts`: `issueConfirmationToken`, `consumeConfirmationToken` — calls `MembersConsentCapability.request`/`.confirm`; local status flip strictly gated on a `granted` response (depends T012, T013, T023). *Writes to `p_newsletter__confirmation_tokens` — gated by T010/T013.*
- [ ] T028 [REQ-14, REQ-15, REQ-30, INV-04, INV-09] Implement `unsubscribe.ts`: `processUnsubscribe` — verifies the `KeyringPort`-derived token against `consentRevisionIdAtSubscribe`; calls `MembersConsentCapability.revoke`; idempotent on repeat of an already-processed token; builds links only from `OriginRegistryPort.canonicalOrigin` (depends T012, T013, T024). *Writes to `p_newsletter__subscriptions` — gated by T010/T013.*
- [ ] T029 [REQ-10, REQ-31] Implement `subscriptions.ts`: `saveSubscription`, `importSubscriptions` — resolves via `SubscriberDirectoryPort`; triggers `confirmation.ts`'s `issueConfirmationToken` on create (depends T012, T013, T025, T027). *Writes to `p_newsletter__subscriptions` — gated by T010/T013.*
- [ ] T030 [REQ-08] Wire default `NewsletterListRow` seeding into `src/server/seed.ts`, alongside the existing `installNewsletterDataModule()` call (T011) — idempotent on rerun (depends T026)
- [ ] T031 Run Phase 3 tests to convergence

**Checkpoint**: Lists/subscriptions/confirmation/unsubscribe chokepoints passing — each independently testable. **PASSED before Phase 4 begins** (Phase 4 depends on both Phase 2 and Phase 3 per the architect's explicit "depends on 2+3").

---

## Phase 4 — [Story: REQ-16/17/18/19/20/22/23/24/27/28/29] Send pipeline + hooks (P1) — Stage 4, depends on Phase 2 + Phase 3

**Goal**: `NewsletterSendPipeline`'s six orchestrator actions ride the existing generic `processOutbox`/`EventBusPort` primitive without forking the claim loop; `authorizeSend` calls `evaluateLaunchGate` (T018) exactly once, inside its transaction; hook dispatch is fixed-order and fail-closed.
**Independent test**: full compose→authorize→freeze→claim→dispatch→drain cycle against `repo.memory.ts` + an in-memory `MailerPort`/outbox double, including a crash-recovery scenario (EC-04) and a pause/resume scenario (EC-05).

- [ ] T032 [P] [REQ-23, EC-01, behavior.spec §1.3] Write failing tests for `runHookChain`: `beforeSend` never runs for a row `recipient.filter` suppressed (post-freeze unsubscribe case, EC-01); `MailerPort.send()` never runs without a prior `beforeSend` invocation for a kept row; a throwing hook is fail-closed suppression, never "keep by default" (behavior.spec §7) — `src/newsletter/__tests__/hooks.test.ts`
- [ ] T033 [P] [REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-24, REQ-28, REQ-29, INV-02, INV-06, INV-08, INV-10, AC-21, AC-22, AC-23, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-35, AC-38, EC-04, EC-05] Write failing integration tests: full `authorizeSend`→`freezeAudience`→`claimBatch`→`dispatchRow`→`recordResult`→`completeIfDrained` cycle against `repo.memory.ts` + in-memory `MailerPort`/outbox doubles; `authorizeSend` calls `evaluateLaunchGate` exactly once inside its own tx — all 2-of-4-unmet combinations rejected with zero rows written (AC-27/28/29), all-four-met proceeds (AC-30); `freezeAudience` idempotent-by-presence (a retry no-ops, does not double-snapshot); unresolvable subscriber silently excluded from the snapshot (AC-22); compose-only/schedule-only actor cannot call `send` (AC-25); test-send hits only the 1-10 given addresses, no snapshot created (AC-26); pause stops `claimBatch` from claiming new batches, resume continues, in-flight work completes uninterrupted (AC-38/EC-05); crash-recovery: simulate a crash after `MailerPort.send()` but before `recordResult` — redelivery via the dedup ledger does not double-send (EC-04); zero-subscription list drains immediately to `sent` (behavior.spec §7) — `src/newsletter/__tests__/send-pipeline.test.ts`
- [ ] T034 [P] [REQ-22, EC-09, AC-32, AC-33] Write failing tests: `mail.feedback.received` with `sourceContext.module === 'newsletter'` flips the matching subscription (complaint/bounce → excluded from future sends, AC-32); a feedback event for a different module is ignored (EC-09/AC-33) — `src/newsletter/__tests__/feedback.test.ts`
- [ ] T035 [P] [REQ-27, AC-36] Write failing test: `principal.erasure.requested` handler anonymizes `recipientEmail` on send-log rows while preserving `counters` and revision history — `src/newsletter/__tests__/erasure.test.ts`
- [ ] T036 [REQ-23] Implement `hooks.ts`: `registerBeforeSendHook`, `registerRecipientFilterHook`, `runHookChain` (depends T032)
- [ ] T037 [REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-24, REQ-28, REQ-29, INV-02, INV-06, INV-08, INV-10] Implement `send-pipeline.ts`: `NewsletterSendPipeline`'s `authorizeSend`/`freezeAudience`/`claimBatch`/`dispatchRow`/`recordResult`/`completeIfDrained`/`pauseCampaign`/`resumeCampaign` — `authorizeSend` calls `launch-gate.ts`'s `evaluateLaunchGate` (T018) exactly once, inside its own transaction, no duplication at any other layer; `dispatchRow` never constructs, stores, or imports a concrete `MailerPort` adapter (INV-08); `claimBatch` delegates to the existing `processOutbox` unmodified (depends **T018 — Phase 2 checkpoint**, **T027/T028/T029 — Phase 3 checkpoint**, T012, T013, T033, T036). *`freezeAudience`/`recordResult` write to `p_newsletter__audience_snapshots`/`p_newsletter__sends` — gated by T010/T013.*
- [ ] T038 [REQ-22] Implement `feedback.ts`: `applyFeedbackProjection` consumer, filters on `sourceContext.module === 'newsletter'` (depends T034)
- [ ] T039 [REQ-27] Implement `erasure.ts`: `anonymizeSendLog` handler (depends T035)
- [ ] T040 Wire the `newsletter.send.batch.claimed` bus subscriber into `src/server/app.ts`, mirroring the existing `bus.subscribe("workspace.created", ...)` demonstration (depends T037)
- [ ] T041 Run Phase 4 tests to convergence

**Checkpoint**: Send pipeline + hooks + feedback + erasure passing — the orchestrator is independently testable end-to-end against in-memory doubles. **PASSED before Phase 5 begins** (Phase 5 depends on Phases 1-4 being real, not mocked, per Article V).

---

## Phase 5 — [Story: REQ-25/26 routes + admin UI] (P1) — Stage 5, depends on Phases 1-4

**Goal**: 19 admin routes (each gated by its specific `admin.newsletter.*` permission) + 2 public token-only routes (never touching session/cookies) + the `Newsletter.tsx` admin screen, wired against the real domain layer built in Phases 1-4.
**Independent test**: call each admin route without its matching permission → 403 (AC-42); call either public route → no `Set-Cookie`/session-read occurs even on success (AC-39); operate the full UI golden path (compose → schedule → send-test → send) in a running session.

- [ ] T042 Implement `NewsletterRouteDeps` — `src/server/routes/admin/newsletter/deps.ts` (mirrors `MembersRouteDeps`'s exact shape; depends T005)
- [ ] T043 [P] [AC-42] Write failing integration tests: each of the 19 admin routes without its matching `admin.newsletter.*` permission → 403 `FORBIDDEN` — `src/server/__tests__/routes/newsletter-auth.test.ts`
- [ ] T044 [P] [AC-39, INV-09] Write failing integration test: both public routes never set or read a session cookie, even on success, and are registered outside `/api/admin` — `src/server/__tests__/routes/newsletter-public-routes.test.ts`
- [ ] T045 [P] [REQ-26, AC-43] Write failing tests for the 9 `ui.spec.md` components (`NewsletterCampaigns`, `CampaignRow`, `CampaignEditor`, `CampaignSendPanel`, `NewsletterLists`, `SubscriptionTable`, `SendLogTable`, `LaunchGateBanner`, `ErrorBanner`) — component test file per repo UI-test convention
- [ ] T046 [P] [REQ-01, REQ-02, REQ-03, REQ-04, REQ-05, REQ-06, REQ-07, REQ-09, REQ-18, REQ-19, REQ-20, REQ-29] Implement the 10 campaign admin route registrars: `list-campaigns.ts`, `get-campaign.ts`, `create-campaign.ts`, `update-campaign.ts`, `cancel-campaign.ts`, `schedule-campaign.ts`, `send-campaign.ts`, `send-test-campaign.ts`, `pause-campaign.ts`, `resume-campaign.ts` — `src/server/routes/admin/newsletter/*.ts` (depends T020, T037, T042)
- [ ] T047 [P] [REQ-08, REQ-09] Implement the 3 list admin route registrars: `list-lists.ts`, `create-list.ts`, `archive-list.ts` — `src/server/routes/admin/newsletter/*.ts` (depends T026, T042)
- [ ] T048 [P] [REQ-10, REQ-31] Implement the 4 subscription admin route registrars: `list-subscriptions.ts`, `create-subscription.ts`, `remove-subscription.ts`, `import-subscriptions.ts` — `src/server/routes/admin/newsletter/*.ts` (depends T029, T042)
- [ ] T049 [P] [REQ-12] Implement `resend-confirmation.ts` admin route registrar — `src/server/routes/admin/newsletter/resend-confirmation.ts` (depends T027, T042)
- [ ] T050 [P] [REQ-16] Implement `list-send-log.ts` admin route registrar — `src/server/routes/admin/newsletter/list-send-log.ts` (depends T037, T042)
- [ ] T051 [P] [REQ-14, REQ-15, AC-39, INV-09] Implement the 2 public route registrars: `newsletter-confirm.ts` (renders HTML, not JSON), `newsletter-unsubscribe.ts` (GET+POST, RFC 8058 `List-Unsubscribe-Post`) — `src/server/routes/site/*.ts` (depends T027, T028)
- [ ] T052 Wire all 19 admin route registrars (inside the existing `/api/admin` gate) + the 2 site route registrars (outside it) into `src/server/app.ts` (depends T046-T051)
- [ ] T053 [REQ-26] Implement `Newsletter.tsx` — single flat file matching `Members.tsx`/`Menus.tsx`/`Settings.tsx` convention, internally composed of the 9 `ui.spec.md` components (depends T045, T052)
- [ ] T054 Mount `<Newsletter />` in the admin route table — `apps/admin/src/App.tsx` (depends T053)
- [ ] T055 Manual `/verify` pass: exercise the golden path (compose → schedule → send-test → send) and the confirm/unsubscribe public-link flow in a running browser session
- [ ] T056 Run Phase 5 tests to convergence

**Checkpoint**: AC-42/AC-43 passing (automated) + T055 manual verification — admin API and UI complete and independently testable end-to-end against the real SQLite adapter.

---

## Phase N — Polish

Cross-cutting improvements after all required stories pass.

- [ ] T057 [P] Update `src/newsletter/INFO.md` documenting module purpose, mirroring `members`/`settings` `INFO.md` convention — **must explicitly disclose the `declareDataModule()` spike-reuse risk** per the Module/Service Boundaries note in ADR-PIPE-011
- [ ] T058 [P] Additional unit tests for any remaining behavior.spec §3/§4 default/limit gaps not already folded into Phase 2/3/5 tasks (preheader 0-300 chars, unsubscribe-token non-expiry, `newsletter.launch_gate.sending_enabled` defaulting to `false`)
- [ ] T059 Full `npm run test:cov` pass — confirm coverage minimums (98/98/98/98 unit, 90/90/90/90 integration) or file a human-approved override with TestRunner's actual measured numbers
- [ ] T060 Update `ADS-memory/specs/011-newsletter/traceability.spec.md` Impl File/Impl Function/Test File/Test ID/Status columns from `pending` to real references, across all 5 traceability sections (REQ/AC, INV, EC, Error Code, Behavior Rule)

---

## Parallelization Rules

- Tasks marked [P] in the same phase can be dispatched simultaneously.
- Modules must have no shared mutable state during parallel execution.
- No Programmer instance writes to a file another instance reads.
- If a shared utility needs changes, serialize — do not parallelize writes to shared code.
- **Phases are sequential, not parallel, across Stage boundaries** — this follows the architect's explicit 5-stage build order in the implementation outline's Downstream Handoff Notes, not just file-independence: Phase 2 (launch gate + campaign chokepoint) is deliberately certified before Phase 3 begins even though the two stages' files are disjoint, because the architect named Phase 2's contracts this feature's highest aggregate risk and required certification-first treatment (same class as SPEC-007's write chokepoint).
- Within Phase 3, `lists.ts` (T026) and `unsubscribe.ts` (T028) are mutually independent and parallel-safe; `subscriptions.ts` (T029) has a real call dependency on `confirmation.ts` (T027) and must follow it.
- Phase 4 depends on **both** Phase 2 and Phase 3 checkpoints (architect's explicit "depends on 2+3") — do not start Phase 4 implementation tasks (T036-T040) early even if only one of the two checkpoints has passed.
- Within Phase 5, the 5 route-group implementation tasks (T046-T050) and the 2 public-route task (T051) are mutually parallel-safe (disjoint files) once their respective domain-layer dependency is certified; `Newsletter.tsx` (T053) depends on all of them plus T052's app.ts wiring.
- T010 (the `declareDataModule()` failure-rollback test) gates T013, and transitively gates every task that writes to a `p_newsletter__*` table: T026, T027, T028, T029 (Phase 3) and T037 (Phase 4, `freezeAudience`/`recordResult`). Do not treat any of those tasks as mergeable until T010 is green.

## Execution Strategies

**Sequential (single agent):** Phase 0 → Phase 1 checkpoint → Phase 2 checkpoint → Phase 3 checkpoint → Phase 4 checkpoint → Phase 5 → Phase N

**Parallel (multiple Programmer instances):** Phase 0 → Phase 1 checkpoint (T010 gate must be green) → Phase 2 (T015-T021, single-threaded on its own risk-certification priority) → Phase 3 (T022-T031, `lists.ts`/`unsubscribe.ts` parallel with each other, `subscriptions.ts` serialized after `confirmation.ts`) → Phase 4 (T032-T041, needs both 2 and 3) → Phase 5 (T042-T056, route groups + public routes parallel, UI last) → TestRunner aggregates → Phase N

---

## Coverage Summary Against SPEC-011 v1.0.0

Every P1/P2 REQ, AC, INV, and EC has explicit task coverage. No coverage gap exists beyond the ADR-backed deferrals already recorded in ADR-PIPE-011/traceability.spec.md §6.4 (HttpApiMailerAdapter, open/click analytics, A/B testing, segmentation, public signup form, the ADR-023 reconciliation engine itself — none are in this feature's scope by design).

### REQ / AC Coverage (32 REQ, 43 AC)

| Spec Item | Priority | Task Coverage |
|---|---|---|
| REQ-01 / AC-01, AC-02 | P1 | T002, T012, T013, T017, T020, T046 |
| REQ-02 / AC-03 | P2 | T046 (list-campaigns.ts) |
| REQ-03 / AC-04 | P1 | T046 (get-campaign.ts) |
| REQ-04 / AC-05, AC-06 | P1 | T016, T019, T020 |
| REQ-05 / AC-07 | P2 | T016, T019, T020, T046 (cancel-campaign.ts) |
| REQ-06 / AC-08 | P1 | T017, T020 (THE chokepoint) |
| REQ-07 / AC-09 | P1 | T016, T019, T046 (schedule-campaign.ts) |
| REQ-08 / AC-10 | P1 | T022, T026, T030 |
| REQ-09 / AC-11 | P1 | T017, T020 |
| REQ-10 / AC-12, AC-13 | P1 | T025, T029, T048 |
| REQ-11 / AC-14, AC-15 | P1 | T023, T027 |
| REQ-12 / AC-16 | P2 | T023, T027, T049 |
| REQ-13 / AC-17 | P1 | T023, T027 |
| REQ-14 / AC-18, AC-19 | P1 | T024, T028, T051 |
| REQ-15 / AC-20 | P1 | T024, T028, T051 |
| REQ-16 / AC-21, AC-22 | P1/P2 | T033, T037 |
| REQ-17 / AC-23 | P1 | T033, T037, T040 |
| REQ-18 / AC-24 | P1 | T016, T019, T033, T037 |
| REQ-19 / AC-25 | P1 | T033, T046 |
| REQ-20 / AC-26 | P1 | T033, T037, T046 |
| REQ-21 / AC-27, AC-28, AC-29, AC-30, AC-31 | P1/P2 | T015, T018 (certified first), T033, T037 |
| REQ-22 / AC-32, AC-33 | P1/P2 | T034, T038 |
| REQ-23 / AC-34 | P1 | T032, T036 |
| REQ-24 / AC-35 | P1 | T033, T037 |
| REQ-25 / AC-42 | P1 | T006, T007, T043 |
| REQ-26 / AC-43 | P1 | T045, T053, T054 |
| REQ-27 / AC-36 | P2 | T035, T039 |
| REQ-28 / AC-37 | P2 | T033, T037 |
| REQ-29 / AC-38 | P1 | T033, T037, T046 |
| REQ-30 / AC-39 | P1 | T024, T028, T044, T051 |
| REQ-31 / AC-40 | P2 | T025, T029, T048 |
| REQ-32 / AC-41 | P1 | T023, T027, T028 (Code Review architecture check per ADR-PIPE-011 Enforcement — no direct Members-table write) |

### Invariant Coverage (INV-01…INV-10)

| INV | Task Coverage |
|---|---|
| INV-01 (campaign never exists without same-tx revision) | T017, T020 |
| INV-02 (SendRow status + counters commit atomically) | T033, T037 — rides the unbuilt ADR-026 envelope, inherited precondition, flagged not silently assumed |
| INV-03 (never writes member_consents directly) | T023, T027, T024, T028 |
| INV-04 (unsubscribe token fail-closed on consent-revision change) | T024, T028 |
| INV-05 (Launch Gate never bypassed) | T015, T018, T033, T037 |
| INV-06 (frozen snapshot immutability) | T033, T037 |
| INV-07 (mail-lib suppression ledger primacy) | T034, T038 |
| INV-08 (never holds a live MailerPort) | T037 (implementation) + Code Review architecture check per ADR-PIPE-011 Enforcement, no automated test can fully prove this negative |
| INV-09 (no raw Host header for links) | T024, T028, T044 |
| INV-10 (send idempotency under redelivery) | T033, T037 |

### Edge Case Coverage (EC-01…EC-10)

| EC | Task Coverage |
|---|---|
| EC-01 (unsubscribe after freeze, before dispatch) | T032, T036 |
| EC-02 (double confirm-click, second invalid) | T023, T027 |
| EC-03 (double unsubscribe-click, idempotent) | T024, T028 |
| EC-04 (outbox crash mid-batch, dedup prevents double-send) | T033, T037 |
| EC-05 (gate flips unmet mid-send) | T015, T033, T037 |
| EC-06 (concurrent schedule, version conflict) | T017, T020 |
| EC-07 (SubscriberDirectoryPort returns null) | T025, T029 |
| EC-08 (import with unknown subscriberId) | T025, T029 |
| EC-09 (feedback event for a different module) | T034, T038 |
| EC-10 (send_test with no verified origin) | T015, T018 |

### Error Code Coverage (14 codes)

| Error Code | Task Coverage |
|---|---|
| NEWSLETTER_CAMPAIGN_NOT_FOUND | T008, T046 |
| NEWSLETTER_LIST_NOT_FOUND | T008, T017, T020, T047 |
| NEWSLETTER_SUBSCRIPTION_NOT_FOUND | T008, T048 |
| NEWSLETTER_SUBSCRIBER_NOT_FOUND | T008, T025, T029 |
| NEWSLETTER_VALIDATION_ERROR | T008, T017, T020 |
| NEWSLETTER_CAMPAIGN_NOT_EDITABLE | T008, T016, T019, T033, T037 |
| NEWSLETTER_DEFAULT_LIST_PROTECTED | T008, T022, T026 |
| NEWSLETTER_CONFLICT | T008, T017, T020 |
| NEWSLETTER_LAUNCH_GATE_BLOCKED | T008, T015, T018 |
| NEWSLETTER_CONFIRM_TOKEN_INVALID | T008, T023, T027 |
| NEWSLETTER_UNSUBSCRIBE_TOKEN_INVALID | T008, T024, T028 |
| FORBIDDEN | T007, T043 |
| VALIDATION_ERROR | T025, T029, T033 |
| INTERNAL_ERROR | T020, T037 |

### Behavior Rule Coverage

| Rule | Section | Task Coverage |
|---|---|---|
| Campaign status transition authority | §1.1 | T016, T019 |
| Launch Gate evaluation order, all named | §1.2 | T015, T018 |
| Per-row hook ordering (fail-closed) | §1.3 | T032, T036 |
| Confirmation token reissuance (newest wins) | §2.1 | T023, T027 |
| Default values | §3 | T017, T022, T033, T058 |
| Limits and bounds | §4 | T017, T033, T046, T048, T058 |
| Deduplication (one SendRow per triple, redelivery semantics) | §5 | T033, T037 |
| Tie-break: concurrent campaign edits | §6.1 | T017, T020 |
| Edge cases (subject=999, two-gate-unmet, zero-subscription drain, etc.) | §7 | T015, T017, T032, T033 |

---

## Deferred (ADR-backed, not a coverage gap)

- `HttpApiMailerAdapter` provider adapter — deferred to a future feature (ADR-037 follow-up); no task in this list builds it.
- Open/click analytics, A/B subject testing, audience segmentation, public unauthenticated signup form — all explicitly out of this feature's scope per ADR-034 §9 DEFERRED / this spec's own Scope section; no tasks exist for them by design.
- The ADR-023 `dataModule` reconciliation engine itself — Newsletter's tables ride the first-party interim `declareDataModule()` path (T009-T011, T013) per sweep §A.2's sanction, not the general engine; migrating to the hardened engine once it graduates from spike is a named future re-evaluation trigger (ADR-PIPE-011), not a task here.
- A future migration of `newsletter_campaigns`/`newsletter_campaign_revisions` into a generalized `entries` content-type registry, if one ever ships — named follow-up per ADR-PIPE-011 Re-evaluation Triggers, not a task here.
