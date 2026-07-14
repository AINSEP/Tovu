# Tasks: integrations (webhook-delivery remediation)

- Spec: SPEC-015 v1.0.0 (hash: sha256:f2820497e57ec41382f19b735a4c2f6746f7f78a10f41a3315da79d789aae190)
- ADR: ADR-PIPE-015 (**ACCEPTED** 2026-07-13, human approval: Leona Burime, blanket approval across ADR-PIPE-008..015 — Red-Team has **NOT** run against this ADR; accepted with that acknowledged gap. A Red-Team pass over the new attack surface — real egress transport, real signer, real scheduler — is recommended before Phase 4 dispatch; see Phase 4's gate.)
- Outline: `ADS-project-knowledge/reports/pipeline/015-integrations/implementation-outline.md` (Status: PRODUCED)
- Date: 2026-07-13T00:00:00Z
- Author: Coordinator

## Format

`[ID] [P?] [Story/Contract/GAP ref] Description` — [P] = parallel-safe (different files, no shared mutable state within the phase). Phases, order, and the Phase 4 gate are derived directly from the ADR's Decision/Migration Safety sections and the Implementation Outline's Module Map, Wiring Map, and Downstream Handoff Notes.

Task checkboxes are **Coordinator-owned state**. TDD, Programmer, TestRunner, and Code Review treat this file as **read-only** unless the Coordinator explicitly delegates a task-list update.

---

## ⚠️ HARD SEQUENCING GATE — READ BEFORE DISPATCHING ANY PHASE 4 TASK

This is not a soft recommendation. Per ADR-PIPE-015 Migration Safety, **"Point of no return"**:

> Registering `registerWebhookFanout`/`startWebhookDeliveryWorker` in `server/deps.ts` (the real running server's composition root) is the point of no return for this feature going live. This step is explicitly gated: it may not merge until (a) the `KeyringPort`-backed signer, (b) the guarded `HttpClientPort` transport with `EgressPolicy` enforced, and (c) the SQLite repo adapters are all already merged, tested, and reviewed. Flipping this switch before (a)-(c) exist is not "shipping an incomplete feature," it is exposing a real SSRF surface and a meaningless-signature path to live traffic.

**Encoded here as a phase dependency, not a suggestion**: Phase 4 (below) has a hard `depends on: Phase 1 checkpoint AND Phase 2 checkpoint, both merged and code-reviewed` gate, verified by a dedicated non-code Coordinator gate-check task (T031) that must be satisfied — with evidence recorded — before any Programmer is dispatched on Phase 4 tasks. Phase 4 is never `[P]` with anything.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` (lines/branches/functions/statements) — matches this repo's existing convention (see `reports/pipeline/007-settings-core-ledger/tasks.md`).
- Integration minimums: defaults `90/90/90/90`.
- E2E minimums: N/A — no browser E2E suite for this backend feature; Phase 4 gets a manual `/verify` pass (T038) per ADR-PIPE-015's Post-Cutover Verification note, matching the Settings/Redirects precedent.
- Convergence threshold before Code Review: default `100%` of this remediation's new tests (Phases 0-4) passing, plus zero regressions in the existing baseline suite (`src/integrations/__tests__/*`, `src/server/__tests__/admin-integrations-routes.test.ts`), plus **100% of INV-P1 through INV-P4** (Critical Invariants, Implementation Outline) proven — no lower threshold requested.
- **Contract Tests** (from outline): `WebhookSubscriptionRepoPort` (C-005) and `WebhookDeliveryRepoPort` (C-006) each get a shared contract-test suite run against `repo.memory.ts` and `repo.sqlite.ts` (Phase 2). `createHttpClient` (C-007) gets a policy-enforcement integration suite (Phase 1). The import-boundary canary (C-008) is itself a required CI-enforced test (Phase 1).

### Required Suites

- Unit: **required** — signer determinism, egress policy classification, overlap-guard/error-swallowing behavior of the scheduler wrapper, event-narrowing behavior of the fan-out wrapper, repo contract parity.
- Integration: **required** — real guarded `HttpClientPort` + real signer exercised together against a local test receiver; private-IP target rejected end-to-end at `create.ts`; all five routes' permission-string cutover re-asserted.
- E2E: **not applicable** — see Coverage Profile; a manual `/verify` pass substitutes (T038).

### Coverage Tool

- Tool: node:test built-in coverage (already wired repo-wide — `npm run test:cov` exists in `package.json`; no new setup task needed here).
- Machine-readable output path: `coverage/lcov.info`.
- Cleanup paths before run: `coverage/`.
- Per-suite output: unit + integration share the node:test run (co-located `*.test.ts`).

### Performance (optional)

- N/A — SPEC-015/ADR-PIPE-015 name no new latency/throughput NFR; the delivery worker's own backoff/retry timing is already certified by `processDueDeliveries`'s existing tests and is unchanged by this remediation.

---

## Phase 0 — Setup: Shared Core Primitive (`EventBusPort.subscribeAll`)

Additive to `src/core/`. Not itself security-sensitive or gated — it is a plain interface extension Stage A (Phase 4) will consume. Safe to build first, independently of Phases 1-3.

- [ ] T001 [P] [C-009] Write failing test: `InMemoryEventBus.subscribeAll` delivers events of several different names to one handler; unsubscribing stops delivery — `src/core/events/__tests__/memory-bus.test.ts` (new file; only `outbox-worker.test.ts` exists in `src/core/events/__tests__/` today)
- [ ] T002 [C-009] Add `EventBusPort.subscribeAll(handler): Promise<() => Promise<void>>` as an additive interface method (existing `subscribe(eventName, handler)` callers unaffected) — `src/core/ports.ts` (depends T001)
- [ ] T003 [C-009] Implement `InMemoryEventBus.subscribeAll` — `src/core/events/memory-bus.ts` (depends T002)
- [ ] T004 Run Phase 0 tests to convergence

**Checkpoint**: `subscribeAll` real and tested. Does not touch any gated activation surface — Phase 4's `fanout.ts` is its first real consumer.

---

## Phase 1 — PREREQUISITES: Real Signer + Real Guarded HTTP Transport + Real Egress Wiring (GAP-02, GAP-03, GAP-04, GAP-06)

**Priority (1) per ADR-PIPE-015.** Nothing may call the signer or transport built here until they are real — that is the point of building them now. `[P]` with Phase 2 and Phase 3 (disjoint files, both feed the same Phase 4 gate). **NOT `[P]` with Phase 4**, which strictly depends on this phase completing, merging, and being reviewed.

GAP-06 (wiring the real `core/origin` egress oracle at `create.ts`, replacing `permitAllHttpsTargets`) is grouped into this phase, not its own: the ADR's own Rationale frames the egress allowlist fix alongside the signer/transport fixes as the same "never let 'wired' and 'safe' diverge" driver, and it is a read-only consumption of an oracle that already exists (`OriginRegistry`, ADR-040) — it has no dependency on persistence (Phase 2) or the permission rename (Phase 3).

- [ ] T005 [P] [GAP-02, GAP-03] Write failing tests: `EnvOrFileKeyring` — env-var override; generated-file fallback outside the portable site folder; HKDF determinism (same input → same output; different `version`/`subscriptionId`/`purpose` → different output); missing root key throws, never returns a placeholder secret — `src/integrations/__tests__/keyring.env.test.ts`
- [ ] T006 [P] [GAP-02] Write failing test: `createKeyringBackedSigner` constructs the same signature `createFixedSecretSigner` would for an equivalent secret (behavior-preserving swap, proven at the signing-math level) — `src/integrations/__tests__/signing.keyring.test.ts`
- [ ] T007 [GAP-03] Implement `EnvOrFileKeyring` (C-001, implements `KeyringPort`) — `src/integrations/keyring.env.ts` (depends T005)
- [ ] T008 [GAP-02] Implement `createKeyringBackedSigner` (C-002) — `src/integrations/signing.keyring.ts` (depends T006, T007)
- [ ] T009 [P] [GAP-04, INV-P3] Write failing import-boundary canary: `transport.fetch.ts` must not be importable outside `src/http/` or the named composition-root files (`server/app.ts`, `server/deps.ts`) — `src/http/__tests__/import-boundary.test.ts`
- [ ] T010 [P] [GAP-04] Write failing tests: `createHttpClient` rejects a private/loopback/link-local/metadata target pre-connect for each address family (via a policy-widened `devHostAllowlist` test capability per Constitution Article V — never consumer-side bypass code); a cross-origin redirect strips auth headers and is re-verified against policy; response/decompressed-byte caps and connect/read timeouts enforced — `src/http/__tests__/client.test.ts`
- [ ] T011 [GAP-04] Implement module-private `HttpTransportAdapter` over Node's `fetch`/undici (the raw half of C-007) — `src/http/transport.fetch.ts` (depends T009)
- [ ] T012 [GAP-04] Implement `createHttpClient(transport, policy): HttpClientPort`, the only exported constructor (C-007) — `src/http/client.ts` (depends T010, T011)
- [ ] T013 [P] [GAP-06, INV-P2] Write failing test: `create.ts`'s route rejects a private-IP target end-to-end via the real `OriginRegistry.isAllowedEgressTarget` oracle — `src/server/__tests__/admin-integrations-routes.test.ts` — ⚠ **same file as T026 (Phase 3)**, see intra-feature collision note below
- [ ] T014 [GAP-06] Drop `permitAllHttpsTargets`; inject `deps.originRegistry.isAllowedEgressTarget` as `isAllowedTarget` — `src/server/routes/admin/integrations/create.ts` (depends T013) — ⚠ **same file as T029's `create.ts` edit (Phase 3)**, see intra-feature collision note below
- [ ] T015 [GAP-06] Add `RouteDeps.originRegistry: OriginRegistryPort`; correct `webhookSigner`'s stale "not consumed by any route yet" doc comment — `src/server/routes/types.ts` (depends T014) — **NOT `[P]`** — cross-feature file collision, see note below
- [ ] T016 [GAP-06] Seed a dev-capability verified origin + egress allowlist entry at boot (so the real oracle doesn't fail-closed on every fresh dev server) — `src/server/seed.ts` (depends T015)
- [ ] T017 Wire in-memory `KeyringPort`/`HttpClientPort` test doubles + an in-memory `OriginRegistry` into `src/server/app.ts`'s hermetic `RouteDeps` composition; must **NOT** call `registerWebhookFanout`/`startWebhookDeliveryWorker` (activation stays out of the hermetic test composition) — `src/server/app.ts` (depends T007, T008, T012, T015) — **NOT `[P]`** — cross-feature file collision, see note below
- [ ] T018 Run Phase 1 tests to convergence — signer, transport, import-boundary canary, and egress wiring all green

> **Cross-feature file collision — `src/server/app.ts` and `src/server/routes/types.ts`**: T015 and T017 are marked **NOT `[P]`**. Forms (FEAT-010) is simultaneously generating a `tasks.md` that also edits `src/server/app.ts` (to wire a `form.submission.received` subscriber) and touches the same shared composition/deps surface. **This task and Forms' equivalent `server/app.ts` edit must be sequenced by the Coordinator at Programmer-dispatch time.**
>
> **Intra-feature file collision (within this feature only)**: T013 and T026 (Phase 3) both edit `src/server/__tests__/admin-integrations-routes.test.ts`; T014 and T029 (Phase 3) both edit `src/server/routes/admin/integrations/create.ts`. Even though Phase 1 and Phase 3 are declared `[P]` with each other at the phase level (disjoint concerns), these four specific tasks share two files and must be sequenced or hand-merged by the Coordinator at Programmer-dispatch time — do not dispatch both phases' touches to these two files blindly in parallel.

**Checkpoint — PHASE 1 PREREQUISITE GATE (half of the Phase 4 gate)**: real signer, real guarded transport, real egress wiring merged and code-reviewed.

---

## Phase 2 — PERSISTENCE: SQLite Adapters + Envelope Durability (GAP-05 + GAP-12, folded as one fix)

**Priority (2) per ADR-PIPE-015.** `[P]` with Phase 1 and Phase 3 (disjoint files). Per the ADR's Rationale, GAP-05 (no durable storage) and GAP-12 (no envelope re-hydration path) are the same underlying problem and are fixed together here, not split across passes.

- [ ] T019 [P] [GAP-05] Add `webhookSubscriptions`, `webhookDeliveries` (incl. `payloadJson`) Drizzle tables + a unique index on `(workspace_id, subscription_id, event_id)` per ADR-036 §2 DDL — `src/infra/db/schema.ts`
- [ ] T020 [P] [GAP-05] Write failing shared `WebhookSubscriptionRepoPort` contract-test suite (to run against both `repo.memory.ts` and, once built, `repo.sqlite.ts`) — `src/integrations/__tests__/repo.subscription.contract.test.ts`
- [ ] T021 [P] [GAP-05, GAP-12, INV-P4] Write failing shared `WebhookDeliveryRepoPort` contract-test suite incl. a `payload_json` round-trip assertion (enqueue → claim → `findById` byte-identical envelope) and a restart-simulated fresh-repo-instance read — `src/integrations/__tests__/repo.delivery.contract.test.ts`
- [ ] T022 [GAP-05] Implement `SqliteWebhookSubscriptionRepo` (C-005) — `src/integrations/repo.sqlite.ts` (depends T019, T020)
- [ ] T023 [GAP-05, GAP-12] Implement `SqliteWebhookDeliveryRepo` (C-006) incl. `payload_json` written in the same statement as the row insert; `claimPending` backed by the new unique index (turns the disclosed O(n) idempotency-scan gap into a real fix) — `src/integrations/repo.sqlite.ts` (depends T019, T021) — same file as T022, **NOT `[P]`** with T022 (serialize authorship within this phase)
- [ ] T024 Run Phase 2 tests to convergence — contract-test parity between both adapters proven; INV-P4 round-trip proven

**Checkpoint — PHASE 2 PERSISTENCE GATE (the other half of the Phase 4 gate)**: durable storage + envelope durability merged and code-reviewed.

---

## Phase 3 — PERMISSION RENAME: `admin.integrations.manage` (independent, safely parallel with Phase 1-2)

**Priority (3) per ADR-PIPE-015.** `[P]` with Phase 1 and Phase 2.

> **Cross-feature dependency**: this phase reuses Menus' (FEAT-012) shared `permission-migrations.ts` mechanism — do not reinvent a bespoke migration function. A repo-wide search at the time this tasks.md was generated found no `permission-migrations.ts` anywhere in the repo, meaning FEAT-012's mechanism has not yet landed. **If it still has not landed at Programmer-dispatch time, the Coordinator must either hold this phase until it lands, or explicitly approve a temporary bespoke `migrateLegacyIntegrationsPermission()` (mirroring the already-shipped `migrateLegacyPresentationSettings()` shape) with a recorded follow-up task to refactor onto the shared mechanism once it exists — do not silently ship a bespoke version as if it were the shared mechanism.**

- [ ] T025 [P] [REQ-24, AC-29] Write failing test: every principal holding `integration.manage` pre-migration also holds `admin.integrations.manage` post-migration; migration is idempotent on rerun — `src/identity/__tests__/seed.test.ts` (extend existing file)
- [ ] T026 [P] [REQ-24, AC-29] Update the existing SPEC-006 REQ-05 route-permission test to assert against `admin.integrations.manage` instead of `integration.manage` — `src/server/__tests__/admin-integrations-routes.test.ts` — ⚠ **same file as T013 (Phase 1)**, see intra-feature collision note above
- [ ] T027 Register `admin.integrations.manage` in `BASE_CATALOG`; mark `integration.manage` DEPRECATED (doc-comment, not deleted) — `src/identity/permissions.ts` (depends T025)
- [ ] T028 [CROSS-FEATURE DEPENDENCY] Implement `migrateLegacyIntegrationsPermission()`, built on Menus' (FEAT-012) shared `permission-migrations.ts` mechanism, mirroring `migrateLegacyPresentationSettings()`'s dual-grant shape (additive-only, idempotent) — `src/identity/seed.ts` (depends T027; **blocked** on FEAT-012's shared mechanism existing — see phase note above)
- [ ] T029 Switch all five routes' `authorize()` calls to `admin.integrations.manage`, same PR only (no partial cutover, per Migration Safety) — `src/server/routes/admin/integrations/{list,create,pause,delete,deliveries}.ts` (depends T028) — ⚠ the `create.ts` edit here is the same file as T014 (Phase 1), see intra-feature collision note above
- [ ] T030 Run Phase 3 tests to convergence

**Checkpoint — PHASE 3 GATE**: permission rename complete, mechanically identical to the `settings.write` / Menus precedent. Independent of Phases 1/2/4 — may complete before, during, or after them.

---

## Phase 4 — ACTIVATION: Stage A Fan-Out + Stage B Scheduler — **POINT OF NO RETURN** — HARD GATE

**Priority (4) per ADR-PIPE-015 — LAST. This phase is never `[P]` with anything.**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GATE — DO NOT DISPATCH ANY TASK IN THIS PHASE UNTIL BOTH ARE TRUE:
   1. Phase 1 (T005-T018) is MERGED and CODE-REVIEWED (not just green locally)
   2. Phase 2 (T019-T024) is MERGED and CODE-REVIEWED (not just green locally)

 Per ADR-PIPE-015 Migration Safety, "Point of no return": registering
 registerWebhookFanout / startWebhookDeliveryWorker in the real composition
 root before the real signer, real transport, and real SQLite adapters exist
 is a SECURITY DEFECT (live SSRF surface + meaningless-signature path), not
 an incomplete feature.

 Red-Team has NOT run against ADR-PIPE-015 (accepted with that acknowledged
 gap). A Red-Team pass over this activation's attack surface is recommended
 before this phase begins — escalate to human/Coordinator if it still has
 not run when T031 is reached.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**This codebase has no scheduler primitive anywhere.** `processOutbox` (the one prior outbox precedent, confirmed at `src/server/app.ts:286`) runs inline inside the `POST /workspaces` route handler after that one route's write — it is never invoked on an interval. T033/T035 below are therefore **not** "wire into an existing scheduled-job pattern" — the scheduler mechanism itself is new construction with no repo precedent to extend, and needs its own dedicated design-to-test-to-implementation sequence, called out explicitly rather than folded into a generic "activation wiring" task.

- [ ] T031 **[GATE CHECK — not a Programmer task]** Coordinator verification: confirm Phase 1 and Phase 2 are merged to the integration branch/mainline and have passed Code Review; record the verifying commit SHAs / PR links in `pipeline-state.md` before proceeding. Do not dispatch T032 or any later task until this is recorded.
- [ ] T032 [P] [C-004] Write failing tests: `registerWebhookFanout` subscribes via `EventBusPort.subscribeAll`; publishing `workspace.created` (today's only real emitted domain event) results in `enqueueDelivery` invoked with a correctly-shaped `WebhookSourceEvent`; an event missing `workspaceId` is skipped without throwing — `src/integrations/__tests__/fanout.test.ts` (depends T003 [Phase 0], T031 gate)
- [ ] T033 [P] [C-003, NEW SCHEDULER MECHANISM] Write failing tests for the scheduler primitive itself — two ticks scheduled faster than one pass completes → second tick is a no-op (overlap guard); a pass that throws → the interval keeps running on the next tick; `stop()` → no further passes fire — `src/integrations/__tests__/worker.test.ts` (depends T031 gate)
- [ ] T034 [C-004] Implement `registerWebhookFanout(bus, subscriptionRepo, deliveryRepo, envelopeStore, idGenerator, clock)` — `src/integrations/fanout.ts` (depends T032)
- [ ] T035 [C-003, NEW SCHEDULER MECHANISM] Implement `startWebhookDeliveryWorker` — the scheduler primitive itself: a plain `setInterval` wrapper with an overlap guard and a `stop()` handle around the already-certified `processDueDeliveries`; this is new mechanism construction, not a reuse of any existing pattern in this codebase — `src/integrations/worker.ts` (depends T033)
- [ ] T036 Register the real `EnvOrFileKeyring`, real `createHttpClient(fetchTransport, policy)`, real `OriginRegistry`, `registerWebhookFanout`, and `startWebhookDeliveryWorker` in the real composition root — **THE POINT OF NO RETURN** — `src/server/deps.ts` (depends T034, T035, and the T031 gate) — **NOT `[P]`** with anything; per Migration Safety this must be "the single, narrow, easy-to-scrutinize final diff"
- [ ] T037 Run Phase 4 tests to convergence
- [ ] T038 Manual `/verify` pass per ADR-PIPE-015's Post-Cutover Verification: create a subscription against a controlled test receiver; trigger `enqueueDelivery` once as an interim check (no webhook-relevant domain event exists live yet — ADR Context finding #2); confirm the receiver gets a POST with a valid, verifiable `Tovu-Signature` header; confirm a deliberately-private-IP target is rejected by the egress policy pre-connect; confirm a server restart mid-backoff window still delivers on the next worker pass

**Checkpoint — CUTOVER**: requires explicit Coordinator/human approval **as its own change**, per Migration Safety "Cutover approval and timing" — do not fold this approval into a larger PR's approval.

---

## Phase N — Polish

- [ ] T039 [P] Update `src/integrations/INFO.md` documenting the new adapters/wiring, mirroring the `settings`/`presentation` `INFO.md` convention
- [ ] T040 [P] Close any of `traceability.spec.md` §6.2's cheap untested-but-implemented rows (REQ-02 blank-label test, EC-05/EC-06) if a Programmer notices them while already in a touched file — optional, not required for this remediation's Convergence threshold
- [ ] T041 Full `npm run test:cov` pass — confirm coverage minimums or file a human-approved override with TestRunner's actual measured numbers
- [ ] T042 Update `ADS-project-knowledge/specs/015-integrations/traceability.spec.md` rows for GAP-01, GAP-02, GAP-03, GAP-04, GAP-05, GAP-06, GAP-12 from `NOT_BUILT`/`TYPES ONLY` to `IMPLEMENTED`/`TESTED` with real file/function/test references; leave GAP-07 through GAP-11 unchanged (see Coverage Summary)

---

## Parallelization Rules

- Tasks marked `[P]` in the same phase can be dispatched simultaneously.
- Modules must have no shared mutable state during parallel execution.
- No Programmer instance writes to a file another instance reads.
- Phase 1, Phase 2, and Phase 3 are parallelizable **with each other** (each closes a disjoint priority item) — but two specific cross-cutting collisions exist despite that phase-level independence and must be hand-sequenced by the Coordinator, not blindly parallel-dispatched:
  1. **Cross-feature**: T015/T017 (`server/app.ts`, `server/routes/types.ts`) vs. Forms' (FEAT-010) simultaneous edits to the same files.
  2. **Intra-feature**: T013/T014 (Phase 1) vs. T026/T029 (Phase 3), which share `src/server/__tests__/admin-integrations-routes.test.ts` and `src/server/routes/admin/integrations/create.ts`.
- Phase 4 is **never** `[P]` with Phase 1, 2, or 3 — it strictly follows both Phase 1 and Phase 2's checkpoints (merged + reviewed), per the Hard Sequencing Gate above.
- If a shared utility needs changes, serialize — do not parallelize writes to shared code.

## Execution Strategies

**Sequential (single agent):** Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 gate (T031) → Phase 4 → Phase N

**Parallel (multiple Programmer instances):** Phase 0 → {Phase 1, Phase 2, Phase 3} simultaneously, EXCEPT the two flagged file collisions above are hand-sequenced by the Coordinator → Phase 1 checkpoint + Phase 2 checkpoint both merged+reviewed → T031 gate check recorded → Phase 4 → TestRunner aggregates → Phase N

---

## Coverage Summary Against GAP-01 through GAP-12

| GAP | Description | Disposition | Task Coverage |
|---|---|---|---|
| GAP-01 | No runtime wiring invokes `enqueueDelivery`/`processDueDeliveries` — no outbox subscriber, no scheduler | **CLOSED** | Phase 0 (T001-T004, the `subscribeAll` primitive Stage A needs) + Phase 4 (T032-T036, Stage A fan-out + Stage B scheduler, gated) |
| GAP-02 | No real `WebhookSigner` backed by `KeyringPort` — production wiring is `createFixedSecretSigner(new Map())` | **CLOSED** | Phase 1 (T006, T008) |
| GAP-03 | No concrete `KeyringPort`/`RootKeyHandle` implementation | **CLOSED** | Phase 1 (T005, T007) |
| GAP-04 | No concrete guarded `HttpClientPort`/`EgressPolicy` transport or composition-root factory | **CLOSED** | Phase 1 (T009-T012) |
| GAP-05 | No SQLite/Drizzle adapters for `WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` | **CLOSED** | Phase 2 (T019, T020, T022, T023) |
| GAP-06 | `isAllowedTarget` not wired to the real `core/origin` egress allowlist — permit-all stand-in | **CLOSED** | Phase 1 (T013-T017) |
| GAP-07 | No registered `webhooks.beforeDispatch` hook contributor | **NOT ADDRESSED BY ADR-PIPE-015** — see flag below | No task; not fabricated (Coordinator does not invent architecture) |
| GAP-08 | `integration_secrets` table / `SecretSealerPort` / outbound-connector runtime | **DEFERRED**, named, no design | No task |
| GAP-09 | API-key admin presentation (list/prefixes/last-used/revoke) | **DEFERRED**, named, no design | No task |
| GAP-10 | Subscription secret rotation (dual-signature overlap window) | **DEFERRED**, named, no design | No task |
| GAP-11 | Manual redelivery of `dead` deliveries | **DEFERRED**, named, no design | No task |
| GAP-12 | No re-hydration path for a delivery's original event payload across process/tick boundaries | **CLOSED** | Phase 2 (T021, T023) — folded into GAP-05's fix per the ADR's own Rationale |

**Critical Invariants (Implementation Outline)**: INV-P1 (no live delivery traffic before signer+transport+storage are real) → Phase 4's gate itself (T031, T036) + the Enforcement section's Code Review checklist item. INV-P2 (egress fail-closed) → T013. INV-P3 (no unguarded HTTP client obtainable) → T009. INV-P4 (envelope durability parity) → T021, T023.

**⚠ Flag — GAP-07 is not addressed and not formally deferred**: ADR-PIPE-015's Decision section states it closes "GAP-01 through GAP-06 and GAP-12"; its priority list (item 5) explicitly names only GAP-08/09/10/11 as deferred. GAP-07 (`beforeDispatch` hook contributor) appears in neither list — it is a genuine gap in the ADR itself, not a task-generation omission. No task is fabricated for it here (Coordinator does not make architecture decisions). **Recommend routing this back to Software Architect for an explicit disposition (build it, or add it to the deferred list) before this remediation is considered to have exhausted ADR-PIPE-015's own stated scope.**

---

## Deferred (ADR-backed, not a coverage gap)

- GAP-08 through GAP-11 — see Coverage Summary above; each is named and explicitly deferred by ADR-PIPE-015 itself.
- Deleting `permitAllHttpsTargets` from anywhere it might still be referenced after T014 lands — covered by the ADR's own Enforcement item (grep-verifiable), not a separate task.
- Root-key loss/rotation operator story — named as an open item in ADR-PIPE-015 Overall Weaknesses; recommend a follow-up decision before any non-local deployment, not a task in this remediation.
- `core/origin`'s own SQLite persistence — inherited gap, explicitly out of this feature's file scope per the ADR.

---

## Cross-Feature Dependency Confirmation

- **Forms (FEAT-010) `server/app.ts` / `server/routes/types.ts` collision**: confirmed present at T015 and T017 (both marked `NOT [P]`, both carry the required sequencing note).
- **Menus (FEAT-012) `permission-migrations.ts` mechanism dependency**: confirmed present at Phase 3's header note and at T028 (marked `[CROSS-FEATURE DEPENDENCY]`, explicit blocked-on condition recorded).
