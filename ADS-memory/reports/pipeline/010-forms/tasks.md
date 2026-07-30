# Tasks: forms

- Spec: SPEC-010 v1.0.0 (hash: sha256:d2d727639ef9e1e6131494e2d2dfe90290d917775733b8da72343f8bbfb0d87e)
- ADR: ADR-PIPE-010 (ACCEPTED 2026-07-13)
- Outline: ADS-memory/reports/pipeline/010-forms/implementation-outline.md (Status: PRODUCED)
- Date: 2026-07-13T00:00:00Z
- Author: Coordinator

## ⚠ Coordinator Audit (2026-07-13, post-session-limit termination)

The implementation agent was killed by an API session limit mid-run, not by a task failure. Audited by direct file inspection + scoped test runs. **Individual task checkboxes below are NOT updated** — verified at phase/module level, not task-by-task. Findings — **this feature is essentially complete**:

- **Done and verified (23/23 scoped tests passing, `tsc` clean):** `manifest.ts` seam, full domain layer (`forms.ts`/`write-service.ts`/`submit-service.ts`/`notify-subscriber.ts`/`rate-limit-profile.ts`/both repo adapters). All 7 admin routes + the public submit route exist and ARE wired into `server/app.ts`. The fire-and-forget invariant (REQ-16/INV-05) is correctly implemented — confirmed `void processOutbox(...)` in `submit-service.ts`, not `await`, with an inline comment citing the exact risk. Admin UI (`FormsList.tsx`/`FormEditor.tsx`) built and mounted in `App.tsx`.
- **Unverified (not disproven, just not directly checked):** whether the `server/app.ts`/`routes/types.ts` edits are in their FINAL state or mid-edit when killed — worth a fresh `tsc`/full-suite check before treating as stable, though current scoped results are clean. Polish tasks similarly unverified.
- **Next step if resuming:** looks ready to consider done pending a final full-suite convergence pass — not a resume-from-the-middle situation.

## Format

`[ID] [P?] [Story ref] Description` — [P] = parallel-safe (different files, no shared mutable state within the phase). Phases + order derived from the implementation outline's Module Map, File Map, Contract Map, Wiring Map, and Downstream Handoff Notes, which themselves encode the ADR's own build order: schema + `forms.ts`/`ports.ts`/adapters + `write-service.ts` first, then `submit-service.ts` + subscribers, then admin routes/UI last.

Task checkboxes are **Coordinator-owned state**. TDD, Programmer, TestRunner, and Code Review treat this file as **read-only** unless the Coordinator explicitly delegates a task-list update.

---

## ⚠️ CROSS-FEATURE SEQUENCING NOTE (read before dispatching Phase 3)

A sibling agent is simultaneously generating `tasks.md` for **Integrations (FEAT-015)**. Both Forms and Integrations need to edit `src/server/app.ts` (Forms wires a `form.submission.received` event-bus subscriber forwarding to `enqueueDelivery`, per ADR-PIPE-010's Decision/Wiring Map W-005; Integrations wires its own delivery-worker scheduler) and `src/server/routes/types.ts` (Forms adds `formDefinitionRepo`/`formSubmissionRepo`/`formsRateLimiter` to `RouteDeps`; Integrations may add its own fields).

**T038 (`routes/types.ts`) and T039 (`server/app.ts`) in this file are explicitly marked NOT `[P]`.** This task and Integrations' equivalent `server/app.ts`/`routes/types.ts` edit must be sequenced by the Coordinator at Programmer-dispatch time — do not run both in parallel. The Coordinator must either (a) sequence the two tasks so one lands and the other rebases against it, or (b) assign both features' edits to the same Programmer dispatch. This repo's own ADR-PIPE-010 (Risks) names this exact convergence point; do not attempt to resolve the actual ordering here — only flag it, since this agent does not know Integrations' task numbering.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` (lines/branches/functions/statements). Coverage tooling is already wired (`npm run test:cov`, node:test `--experimental-test-coverage`, added during SPEC-007) — no Phase 0 setup task needed for the tool itself, only for this feature's directory scaffold.
- Integration minimums: defaults `90/90/90/90`.
- E2E minimums: N/A — no browser E2E suite for this backend+admin-screen feature; the Forms admin screen gets a manual `/verify` pass (T044) per this repo's existing Settings/SEO/Redirects precedent, not an automated E2E suite in this pass.
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests (AC-01, 03–09, 11–17, 19–24) and all invariants (INV-01…09) passing. No lower threshold requested.
- **Contract Tests** (from outline): `FormDefinitionRepoPort`/`FormSubmissionRepoPort` shared contract-test suite run against both `repo.memory.ts` and `repo.sqlite.ts` (C-012).

### Required Suites

- Unit: **required** — field-vocabulary/submission validation (`forms.ts`), honeypot predicate, rate-limit key composition, write-service immutability/slug rules.
- Integration: **required** — 8 HTTP endpoints (7 admin + 1 public) via the real route + SQLite adapter; the fire-and-forget outbox-drain timing assertion (AC-24/INV-05); the webhook fan-out reaching the existing delivery worker's queued row (AC-16).
- E2E: **not applicable** — manual `/verify` pass covers the admin screen's golden path instead (T044).

### Coverage Tool

- Tool: node:test built-in coverage — `npm run test:cov` (already wired repo-wide; no new setup).
- Machine-readable output path: `coverage/lcov.info`.
- Cleanup paths before run: `coverage/`.
- Per-suite output: unit + integration share the node:test run (co-located `*.test.ts`); split reporting by path glob if TestRunner needs per-suite numbers.

### Performance (optional)

- N/A — no latency/throughput NFR beyond the existing `ADMIN_STANDARD`/`FORMS_SUBMIT` rate-limit profiles (api.spec.md §3), which are enforced at the rate-limit layer, not a distinct performance target.

---

## Phase 0 — Setup

No story dependencies. Includes the OQ-01 manifest seam as its own early task — later tasks read it, nothing writes runtime logic into it.

- [ ] T001 [P] Create directory structure: `src/forms/` (+ `__specs__/`, `__tests__/`), `src/server/routes/admin/forms/`
- [ ] T002 [P] Create `src/forms/manifest.ts` — THE OQ-01 seam. Plain, JSON-serializable data only: `pluginId`, `tier: 1`, `displayName`, the closed field-type vocabulary (`text`/`email`/`textarea`/`checkbox`), the 3 `admin.forms.*` capability/permission strings, the admin nav entry descriptor, and the `'form.submission.received'` topic name. Zero functions/closures/imports of runtime code (Code Review enforces this at T049) — read by `app.ts`/`permissions.ts` registration call sites later; never imported by `forms.ts`/`write-service.ts`/`submit-service.ts` (activation-agnostic domain code)
- [ ] T003 [P] Add `formDefinitions`/`formSubmissions` Drizzle table defs to `src/infra/db/schema.ts` per `state.spec.md` §1.1/§1.2: real unique index on `(workspace_id, slug)` (behavior.spec.md §6.1 — DB-level tie-break, no app-level check-then-insert), FK `form_submissions.form_definition_id → form_definitions.id`

---

## Phase 1 — Foundational (schema-adjacent domain core + write chokepoint)

The pure validation core, persistence ports/adapters, typed errors, and the admin-CRUD write chokepoint (`write-service.ts`) — the ADR's own required build order puts all of this ahead of the public submission path and subscribers. **No later phase begins until this checkpoint.**

- [ ] T004 [P] [REQ-02, AC-03, INV-02] Write failing tests: `validateFieldDescriptors` (C-002) — closed vocabulary, 1–20 fields, label 1–200 chars, `maxLength` 1–5000 and forbidden for `checkbox` (behavior.spec.md §4/§7) — `src/forms/__tests__/forms.field-validation.test.ts`
- [ ] T005 [P] [REQ-06, AC-08, AC-09, AC-10, INV-01] Write failing tests: `validateSubmissionPayload` (C-003) — required fields present, maxLength respected, no keys outside declared fields + `_hp` (EC-01, EC-02) — `src/forms/__tests__/forms.submission-validation.test.ts`
- [ ] T006 [P] [REQ-08, AC-13, INV-04] Write failing tests: `isHoneypotTripped` (C-004) — present-and-non-empty-after-trim = true; absent/whitespace-only = false (EC-09) — `src/forms/__tests__/forms.honeypot.test.ts`
- [ ] T007 [P] [C-012] Write failing `FormDefinitionRepoPort`/`FormSubmissionRepoPort` shared contract-test suite (definitions + submissions) — `src/forms/__tests__/repo.contract.test.ts` — runs against **both** adapters (T010, T011); asserts `FormDefinitionRepoPort` exposes no delete method (INV-08, AC-06)
- [ ] T008 [P] [REQ-01, REQ-03, REQ-04, AC-01, AC-02, AC-04, AC-05, AC-06, EC-04] Write failing tests: `createFormDefinition`/`updateFormDefinition`/`setFormDefinitionStatus` (C-005/006/007) — slug immutability (behavior.spec.md §1.1), field-id-removal restriction (behavior.spec.md §1.2), never-delete lifecycle (INV-08), concurrent-create slug race maps to `FORMS_SLUG_CONFLICT` (EC-04, behavior.spec.md §6.1) — `src/forms/__tests__/write-service.test.ts`
- [ ] T009 [C-012] Implement `FormDefinitionRepoPort`/`FormSubmissionRepoPort` interfaces — `src/forms/ports.ts` (depends T007). `FormDefinitionRepoPort` structurally has no delete method (INV-08).
- [ ] T010 [P] [C-012] Implement in-memory adapters — `src/forms/repo.memory.ts` (depends T009)
- [ ] T011 [P] [C-012] Implement Drizzle/SQLite adapters — `src/forms/repo.sqlite.ts` (depends T003, T009)
- [ ] T012 [P] [C-013] Implement typed error classes: `FormFieldValidationError`, `FormSlugConflictError`, `FormDefinitionNotFoundError`, `FormSubmissionValidationError`, `FormSubmissionNotFoundError`, `FormRateLimitExceededError` — `src/forms/errors.ts`
- [ ] T013 [REQ-02, REQ-06, REQ-08, INV-01, INV-02, INV-04] Implement `forms.ts` pure validation core: `validateFieldDescriptors`, `validateSubmissionPayload`, `isHoneypotTripped` — zero I/O (depends T004, T005, T006)
- [ ] T014 [REQ-01, REQ-03, REQ-04, INV-03, INV-08] Implement `write-service.ts` `createFormDefinition`/`updateFormDefinition`/`setFormDefinitionStatus` — each wraps the existing `executeCommand` gateway (mirrors posts/menus/members); slug-uniqueness relies on the DB unique index (T003), not an app-level check — `src/forms/write-service.ts` (depends T008, T009, T012, T013)
- [ ] T015 [P] [REQ-15] Register `admin.forms.manage`, `admin.forms.submissions.read`, `admin.forms.submissions.delete` in `BASE_CATALOG` (verbatim strings from `api.spec.md` §2) — `src/identity/permissions.ts`
- [ ] T016 Run Phase 1 tests to convergence

**Checkpoint**: Domain core + admin-CRUD chokepoint green — the public submission path (Phase 2) and subscribers can now be built against real contracts, not mocks (Article V).

---

## Phase 2 — Public submission path + subscribers (P1)

**Goal**: `submitForm` (C-008) is the sole public write path — validates, honeypot-checks, rate-limits, persists, and enqueues `form.submission.received` without ever awaiting mail/webhook completion. `notify-subscriber.ts` (C-009) is the one piece of Forms-owned logic riding that event.
**Independent test**: POST to `/forms/:slug/submit` with a stubbed slow/throwing `MailerPort` → response resolves before the mailer call settles (AC-24); a honeypot-tripped request returns the identical `201` with zero DB/outbox rows (AC-13).

- [ ] T017 [P] [REQ-09, INV-09] Write failing tests: `buildFormsRateLimitKey` (C-011) — composite `${sourceIp}:${formDefinitionId}` key; two different forms from the same IP get independent windows — `src/forms/__tests__/rate-limit-profile.test.ts`
- [ ] T018 [P] [REQ-05, REQ-06, REQ-07, REQ-08, REQ-09, REQ-16, AC-08, AC-09, AC-10, AC-13, AC-14, AC-15, AC-24, INV-01, INV-04, INV-05, INV-07, EC-09] Write failing integration test: `submitForm` (C-008) full flow at a real boundary — honeypot silent-discard with identical response shape, payload validation rejects, rate-limit rejects, accepted submission persists + enqueues exactly once, and **the fire-and-forget timing assertion**: a stubbed slow/throwing `MailerPort.send()` must not delay the response (AC-24/INV-05) — `src/forms/__tests__/submit-service.test.ts`
- [ ] T019 [P] [REQ-12, AC-17, AC-18, EC-06] Write failing tests: `registerFormNotifySubscriber` (C-009) — notify-enabled definition → `MailerPort.send()` invoked per recipient with the ADR-037-required `idempotencyKey` built from `submissionId`; notify-disabled → never invoked; a `SUPPRESSED` mailer result is logged, not thrown — `src/forms/__tests__/notify-subscriber.test.ts`
- [ ] T020 [REQ-09] Implement `rate-limit-profile.ts`: `FORMS_SUBMIT_PROFILE` (5 req/60s) + `buildFormsRateLimitKey`, wrapping the **existing** `createRateLimiter`/`resolveClientIp` from `src/server/middleware/rate-limit.ts` (Article I reuse — do not hand-roll a second limiter) — `src/forms/rate-limit-profile.ts` (depends T017)
- [ ] T021 [REQ-05, REQ-07, REQ-10, REQ-16, INV-01, INV-04, INV-05, INV-07] Implement `submit-service.ts` `submitForm` (C-008): resolve slug → honeypot check → validate → rate-limit → persist → enqueue `form.submission.received` onto `OutboxPort` → return, **without awaiting** outbox drainage — `src/forms/submit-service.ts` (depends T009–T014, T018, T020). Deliberately bypasses `executeCommand` (no actor/permission fits an anonymous visitor); mirrors `routes/site/analytics-ingest.ts`'s `ingestHit` shape.
- [ ] T022 [REQ-12] Implement `notify-subscriber.ts` `registerFormNotifySubscriber` (C-009) — subscribes `form.submission.received`, loads definition + submission, calls `MailerPort.send()` per recipient when `notify.enabled`; failures logged, never thrown back into `publish()`'s subscriber loop — `src/forms/notify-subscriber.ts` (depends T009–T014, T019)
- [ ] T023 [REQ-16, INV-05, AC-24] **Invariant-audit task — do not skip.** Verify `submit-service.ts` never contains `await processOutbox(...)` (or any transitively-mail/webhook-blocking `await`) in its call path; the call must be `void processOutbox(...)`. **This is a real-bug risk, not a formality**: the only existing caller of `processOutbox` in this codebase — `POST /workspaces` in `src/server/app.ts:286` (`await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });`) — is synchronous-and-blocking, and that call site has zero mail/webhook subscribers so its blocking behavior is invisible today. Copying that one existing pattern verbatim into `submit-service.ts` (which now has a real `MailerPort.send()` subscriber) would silently reintroduce the exact blocking bug REQ-16/INV-05 forbid, and nothing before this task would have exercised the difference. Verify via: (a) T018's AC-24 timing assertion is actually failing red before T021 lands and green after; (b) a source-level static check (grep for `await processOutbox` / `await.*\.send(` inside `submit-service.ts`) as a standing Code Review gate, per ADR-PIPE-010 Enforcement
- [ ] T024 Run Phase 2 tests to convergence

**Checkpoint**: `submitForm`/notify subscriber green — public submission path independently testable against real contracts. **The `server/app.ts` webhook-fanout wiring (W-005) and route registration itself are deferred to Phase 3, where they land as a single sequenced task (T039) per the cross-feature note above.**

---

## Phase 3 — HTTP wiring: admin routes, public route, composition-root registration (P1)

**Goal**: All 8 endpoints (7 admin + 1 public) are live, permission-gated per `api.spec.md` §2, and error-mapped per `errors.spec.md` §2; the webhook fan-out forwarding line and the notify subscriber are registered at boot.
**Independent test**: call each admin endpoint without its matching permission → 403 (AC-21/22/23); POST to the public submit route with no `Authorization` header → 201 (AC-07); after an accepted submission, a matching webhook subscription's delivery-worker row is queued (AC-16).

- [ ] T025 [P] [REQ-01, REQ-02, REQ-03, REQ-04, AC-01, AC-02, AC-03, AC-04, AC-05, AC-06] Write failing integration tests: admin CRUD golden path at the real HTTP boundary — create → 201, GET returns unchanged (AC-01); notify config round-trips (AC-02); `type: "date"` rejected, nothing created (AC-03); duplicate slug → 409 `FORMS_SLUG_CONFLICT` (AC-04); disable stops new submissions, GET still shows disabled (AC-05); no delete route exists for definitions (AC-06) — `src/server/__tests__/routes/forms-admin-crud.test.ts`
- [ ] T026 [P] [REQ-15, AC-21, AC-22, AC-23, INV-06] Write failing integration tests: each of the 7 admin routes without its matching `admin.forms.*` permission → 403 `FORBIDDEN` — `src/server/__tests__/routes/forms-auth.test.ts`
- [ ] T027 [P] [REQ-13, REQ-14, AC-19, AC-20, EC-08] Write failing integration tests: submissions list is newest-first (behavior.spec.md §2.1), get returns full field values, delete permanently removes a submission (404s + disappears from list, AC-20), empty-list state (EC-08) — `src/server/__tests__/routes/forms-submissions.test.ts`
- [ ] T028 [P] [REQ-05, REQ-07, AC-07, AC-11, AC-12] Write failing integration tests: public `FORMS_POST_SUBMIT` requires no `Authorization` header, 201 (AC-07); nonexistent slug → `FORMS_DEFINITION_NOT_FOUND` (AC-11); disabled slug → identical `FORMS_DEFINITION_NOT_FOUND`, indistinguishable from nonexistent (AC-12, REQ-07) — `src/server/__tests__/routes/forms-submit.test.ts`
- [ ] T029 [P] [REQ-11, AC-16, EC-07] Write failing integration test: after an accepted submission, a matching webhook subscription's delivery-worker row is queued (verified by inspecting the delivery worker's queued row, not a Forms-owned code path, per AC-16's own scoping); no matching subscription → no row queued (EC-07) — `src/server/__tests__/routes/forms-webhook-fanout.test.ts`
- [ ] T030 [P] [REQ-01] Implement `registerAdminFormsListRoute` — `src/server/routes/admin/forms/list.ts` (depends T014)
- [ ] T031 [P] [REQ-01] Implement `registerAdminFormsCreateRoute` — `src/server/routes/admin/forms/create.ts` (depends T014)
- [ ] T032 [P] [REQ-04] Implement `registerAdminFormsGetRoute` — `src/server/routes/admin/forms/get-by-id.ts` (depends T014)
- [ ] T033 [P] [REQ-04] Implement `registerAdminFormsUpdateRoute` (incl. `status` toggle) — `src/server/routes/admin/forms/update.ts` (depends T014)
- [ ] T034 [P] [REQ-13] Implement `registerAdminFormsListSubmissionsRoute` (cursor pagination per `api.spec.md` §4) — `src/server/routes/admin/forms/list-submissions.ts` (depends T009–T011)
- [ ] T035 [P] [REQ-13] Implement `registerAdminFormsGetSubmissionRoute` — `src/server/routes/admin/forms/get-submission.ts` (depends T009–T011)
- [ ] T036 [P] [REQ-14] Implement `registerAdminFormsDeleteSubmissionRoute` (permanent delete) — `src/server/routes/admin/forms/delete-submission.ts` (depends T009–T011)
- [ ] T037 [P] [REQ-05] Implement `registerFormsSubmitRoute` — `src/server/routes/site/forms-submit.ts` (depends T021). Mirrors `routes/site/analytics-ingest.ts`; must reuse `resolveClientIp` (`server/middleware/rate-limit.ts`), not re-derive IP resolution; register **before** the site `/:slug` catch-all.
- [ ] T038 **[NOT [P] — cross-feature convergence point, see note above]** [REQ-01..04, 13..15] Modify `src/server/routes/types.ts`: `RouteDeps` gains `formDefinitionRepo`, `formSubmissionRepo`, `formsRateLimiter` (mirrors the existing `webhookSubscriptionRepo`/`webhookDeliveryRepo` field-addition precedent). **Sequence against Integrations' equivalent `routes/types.ts` edit — do not dispatch in parallel with it.**
- [ ] T039 **[NOT [P] — cross-feature convergence point, see note above]** [REQ-01..05, 11, 12] Modify `src/server/app.ts`: import + register all 8 route registrars (T030–T037; public route before the `/:slug` catch-all) **and** add `bus.subscribe('form.submission.received', event => enqueueDelivery({ deps: {...}, input: { event } }))` — importing `enqueueDelivery` from `../integrations/delivery`, zero Forms-owned dispatch logic (REQ-11) — **and** register `notify-subscriber.ts`'s C-009 subscriber (depends T022, T030–T037). **Sequence against Integrations' equivalent `server/app.ts` edit (its own delivery-worker/scheduler wiring) — do not dispatch in parallel with it.** Add a doc comment at the `bus.subscribe` call site cross-referencing `src/forms/notify-subscriber.ts` and ADR-036 (ADR-PIPE-010 Quality Attribute Scorecard, operability axis).
- [ ] T040 Run Phase 3 tests to convergence

**Checkpoint**: All 8 endpoints live and permission-gated; webhook fan-out and notify subscriber wired at boot. **PASSED when T025–T029 are green against the real SQLite adapter.**

---

## Phase 4 — Admin UI (depends on Phase 3)

**Goal**: `FormsList`/`FormEditor` (incl. `FormFieldsEditor`, `FormSubmissions`, `FormSubmissionDetail`) let an operator manage definitions and view/delete submissions, per `ui.spec.md`.
**Independent test**: open the Forms screen, create a definition, verify the slug field becomes read-only after save (behavior.spec.md §1.1), attempt to remove an existing field id and confirm the control is disabled (behavior.spec.md §1.2), view a submission and delete it with the inline-confirm step.

- [ ] T041 [P] Implement `FormsList.tsx` — list + empty state ("No forms yet.") + `onFormSelect`/`onNewForm` — `apps/admin/src/sections/FormsList.tsx` (depends T030, T031)
- [ ] T042 [P] Implement `FormEditor.tsx` — composed of `FormFieldsEditor` (remove-row disabled for `existingFieldIds`, `maxLength` hidden for `checkbox`), `FormSubmissions` (empty state, `onLoadMore`), `FormSubmissionDetail` (inline-confirm delete) per `ui.spec.md` §1–§5; slug field editable only when `formId === "new"` (behavior.spec.md §1.1) — `apps/admin/src/sections/FormEditor.tsx` (depends T032–T037, T040). May split into local sub-files if it exceeds this repo's practical single-file size, same escape hatch ADR-PIPE-007 pre-approved for `Settings.tsx`.
- [ ] T043 Mount the Forms routes — `apps/admin/src/App.tsx` (depends T041, T042)
- [ ] T044 Manual `/verify` pass: exercise the golden path (list → create → edit fields → toggle status → view submissions → delete a submission) in a running browser session

**Checkpoint**: Admin UI complete; T044 manual verification passed.

---

## Phase N — Polish

- [ ] T045 [P] Create `src/forms/INFO.md` documenting module purpose, mirroring `settings`/`members`/`integrations` `INFO.md` convention
- [ ] T046 [P] Additional unit/integration tests for edge cases not fully exercised above: EC-01 (only-required-fields submission), EC-03 (submission to a recently-disabled slug), EC-05 (definition disabled mid-flight of an in-progress submission), and the full behavior.spec.md §7 boundary matrix (20/21 fields, 10/11 notify recipients, 5th/6th-submission rate-limit rows, whitespace-only `_hp`, PUT body including `slug`, UPDATE patch omitting an existing field id)
- [ ] T047 Full `npm run test:cov` pass — confirm coverage minimums (98/98/98/98 unit, 90/90/90/90 integration) or file a human-approved override with TestRunner's actual measured numbers
- [ ] T048 Update `ADS-memory/specs/010-forms/traceability.spec.md` impl/test columns from `pending` to real file/function/test references
- [ ] T049 Code Review static-check pass per ADR-PIPE-010 Enforcement: `manifest.ts` contains only plain data literals (no imports of `forms.ts`/`write-service.ts`/`submit-service.ts`/any runtime function, no closures); `submit-service.ts` never `await`s `processOutbox(...)` or any mail/webhook-adjacent call inline (ties back to T023); the `bus.subscribe('form.submission.received', ...)` line in `server/app.ts` forwards to `integrations`' existing `enqueueDelivery` verbatim; no import of `repo.memory.ts`/`repo.sqlite.ts` from outside `write-service.ts`/`submit-service.ts`; no port added under `src/forms/` beyond the two named in C-012

---

## Parallelization Rules

- Tasks marked `[P]` in the same phase can be dispatched simultaneously
- Modules must have no shared mutable state during parallel execution
- No Programmer instance writes to a file another instance reads
- If a shared utility needs changes, serialize — do not parallelize writes to shared code
- **T038 and T039 are explicitly excluded from `[P]` status** even though they sit inside a phase with other `[P]` tasks — both touch files (`routes/types.ts`, `server/app.ts`) shared with the parallel Integrations (FEAT-015) sibling spec. See the Cross-Feature Sequencing Note above; the Coordinator must sequence these against Integrations' equivalent edits at Programmer-dispatch time, not just within this feature's own phase.
- Within Phase 3, T030–T037 (8 route files) are mutually `[P]`-safe with each other (disjoint files) but all must land before T039, which is the single shared-file convergence task
- Phase 1 must fully checkpoint before Phase 2 begins (Phase 2 depends on real ports/adapters/write-service, not mocks, per Article V)
- Phase 2 must fully checkpoint before Phase 3's route-implementation tasks begin (routes delegate to `submit-service.ts`/`notify-subscriber.ts`), though Phase 3's test-writing tasks (T025–T029) may be authored in parallel with late Phase 2 work
- Phase 4 depends on Phase 3's checkpoint (UI calls the real HTTP routes)

## Execution Strategies

**Sequential (single agent):** Phase 0 → Phase 1 checkpoint → Phase 2 checkpoint → Phase 3 checkpoint → Phase 4 → Phase N

**Parallel (multiple Programmer instances):** Phase 0 → Phase 1 checkpoint → Phase 2 checkpoint → {T025–T029 tests, T030–T037 route impls} in parallel within Phase 3 → **T038/T039 sequenced against Integrations, not parallelized** → Phase 3 checkpoint → Phase 4 (T041/T042 parallel) → Phase N

---

## Coverage Summary Against SPEC-010 v1.0.0

Every REQ, AC, INV, EC, error code, and behavior rule has explicit task coverage. No ADR-backed deferrals beyond what ADR-PIPE-010 itself already scopes out (real Tier-1 loader, `webhookSigner`/`KeyringPort` production wiring, SQLite adapter for `webhook_subscriptions`/`webhook_deliveries` — all pre-existing gaps in `integrations`, not Forms' scope).

| Spec Item | Priority | Task Coverage |
|---|---|---|
| REQ-01 / AC-01, AC-02 | P1/P2 | T003, T008, T014, T025 |
| REQ-02 / AC-03 | P1 | T004, T013, T025 |
| REQ-03 / AC-04 | P1 | T003, T008, T014, T025 |
| REQ-04 / AC-05, AC-06 | P1 | T008, T009, T014, T025 |
| REQ-05 / AC-07 | P1 | T021, T028, T037 |
| REQ-06 / AC-08, AC-09, AC-10 | P1/P2 | T005, T013, T018, T028 |
| REQ-07 / AC-11, AC-12 | P1 | T021, T028 |
| REQ-08 / AC-13 | P1 | T006, T013, T018 |
| REQ-09 / AC-14 | P1 | T017, T018, T020, T021 |
| REQ-10 / AC-15 | P1 | T003, T018, T021 |
| REQ-11 / AC-16 | P1 | T029, T039 |
| REQ-12 / AC-17, AC-18 | P1/P2 | T019, T022 |
| REQ-13 / AC-19 | P1 | T027, T034, T035 |
| REQ-14 / AC-20 | P1 | T027, T036 |
| REQ-15 / AC-21, AC-22, AC-23 | P1 | T015, T026 |
| REQ-16 / AC-24 | P1 | T018, T021, T023 |
| INV-01 | — | T005, T013, T021 |
| INV-02 | — | T004, T013 |
| INV-03 | — | T003, T014 |
| INV-04 | — | T006, T013, T018, T021 |
| INV-05 | — | T018, T021, T023 (dedicated invariant-audit task) |
| INV-06 | — | T026 |
| INV-07 | — | T018, T021 |
| INV-08 | — | T009, T025 |
| INV-09 (internal) | — | T017, T020 |
| EC-01 | — | T005, T018, T046 |
| EC-02 | — | T005, T018 |
| EC-03 | — | T028, T046 |
| EC-04 | — | T008, T014 |
| EC-05 | — | T046 |
| EC-06 | — | T019, T022 |
| EC-07 | — | T029, T046 |
| EC-08 | — | T027 |
| EC-09 | — | T006, T018 |
| `FORMS_FIELD_VALIDATION_ERROR` | — | T004, T013, T025 |
| `FORMS_SLUG_CONFLICT` | — | T008, T014, T025 |
| `FORMS_DEFINITION_NOT_FOUND` | — | T009, T021, T028 |
| `FORMS_SUBMISSION_VALIDATION_ERROR` | — | T005, T013, T018 |
| `FORMS_SUBMISSION_NOT_FOUND` | — | T027, T035, T036 |
| `FORMS_RATE_LIMIT_EXCEEDED` | — | T017, T018, T020 |
| `UNAUTHENTICATED` / `FORBIDDEN` | — | T026 |
| `INTERNAL_ERROR` | — | existing cross-cutting infra, no Forms-specific task |
| behavior.spec.md §1.1 slug immutability | — | T008, T014, T042 |
| behavior.spec.md §1.2 field-id removal | — | T008, T014 |
| behavior.spec.md §2.1 submission order | — | T027, T034 |
| behavior.spec.md §3 defaults (status/notify) | — | T008, T014 |
| behavior.spec.md §4 limits (fields/checkbox/recipients/rate-limit) | — | T004, T013, T017, T020, T046 |
| behavior.spec.md §5 honeypot rule | — | T006, T018, T021 |
| behavior.spec.md §6.1 slug race tie-break | — | T008, T014 |
| behavior.spec.md §7 edge-case boundary matrix | — | T046 |

---

## Deferred (ADR-backed, not a coverage gap)

- Real Tier-1 plugin-manifest loader/registry (OQ-01's full resolution) — `manifest.ts` (T002) is the seam, not the loader itself, per ADR-PIPE-010 Decision/Consequences.
- `webhookSigner`/`KeyringPort` production wiring — pre-existing `integrations` gap, unaffected by Forms.
- SQLite adapter for `webhook_subscriptions`/`webhook_deliveries` — pre-existing `integrations` gap; Forms' webhook fan-out (T039) forwards to `enqueueDelivery` as-is, does not fix this.
- Deleting/reshaping toward a generic ADR-022 `entries` model — explicitly out of scope per `state.spec.md` §0; `form_submissions.data_json` would map by rename, not reshape, if that model ever lands.
