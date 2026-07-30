# ADR-PIPE-015: Integrations (Webhooks) — Closing the Delivery-Wiring, Signer, Egress, and Persistence Gaps

- Status: ACCEPTED 2026-07-13 (human approval: Leona Burime, blanket approval across ADR-PIPE-008..015; Red-Team has NOT run — accepted with that acknowledged gap; the "Point of No Return" activation gate (real signer + real HTTP transport merged BEFORE live delivery wiring) is a hard sequencing constraint, not a suggestion — task generation must encode it as a dependency order, not a parallel slice)
- Date: 2026-07-13
- Spec: SPEC-015 v1.0.0 (hash: sha256:f2820497e57ec41382f19b735a4c2f6746f7f78a10f41a3315da79d789aae190)
- Author: Software Architect Agent

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | HKDF via `node:crypto` (`hkdfSync`), HTTP transport via Node's built-in `fetch`/`undici` — no new third-party queue/scheduler/crypto library. A background interval is plain `setInterval`, not a job-queue library (see Pattern Evaluation — a library like BullMQ/Agenda would need Redis/a broker this single-process dev server doesn't have; rejected as disproportionate, recorded in Complexity Justification is not needed since this is the *simpler*, not more complex, path). |
| II — Test-First | COMPLIES | No behavior in this ADR ships without TDD-certified tests first (Art. II is non-negotiable). The existing `src/integrations/__tests__/*` and `src/server/__tests__/admin-integrations-routes.test.ts` already certify Stage A/B and route logic in isolation — this pass adds tests for the new adapters (`keyring.env.ts`, `src/http/client.ts`, `repo.sqlite.ts`) and the new wiring (`worker.ts`, `fanout.ts`) before they are wired live. |
| III — Simplicity Gate | COMPLIES | Every new module below traces to a named GAP (GAP-01..GAP-06, GAP-12) in SPEC-015. No speculative generality: the scheduler is a plain `setInterval` wrapper, not a generic job-scheduling primitive; `KeyringPort`'s concrete adapter stays in `src/integrations/` (its ADR-036-declared home) rather than prematurely minting a new Tier-2 `lib/keyring/` library this task wasn't asked to design. GAP-08/09/10/11 (outbound connectors, API-key UI, secret rotation, manual redelivery) are explicitly named and deferred, not stubbed. |
| IV — Anti-Abstraction Gate | COMPLIES | `WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` gain their rule-of-two second adapter (SQLite) — this was already a *named* gap (GAP-05), not a new port. `HttpClientPort` already has its rule-of-two named in ADR-038 (guarded `fetch`/`undici` transport + in-memory test double) — this ADR builds the first, real half. No new port is introduced for the scheduler (a scheduler seam would be premature — see Pattern Evaluation) or for the fan-out subscriber (`EventBusPort.subscribeAll` is one additive method on an existing port, not a new port). |
| V — Integration-First Testing | COMPLIES | The SQLite adapters get the same contract-test treatment as `settings`/`post`/`presentation` (shared suite run against both adapters). The wired signer + guarded transport + real egress oracle are exercised at the `processDueDeliveries` integration boundary against a local, policy-controlled test server (loopback is denied by the policy itself, so tests use a policy-widened `devHostAllowlist` capability, exactly as ADR-038 §3 prescribes — never consumer-side bypass code). |
| VI — Security-by-Default | COMPLIES, with the sequencing constraint below load-bearing | This ADR's entire reason for existing is closing a real security gap: today `permitAllHttpsTargets` is a live SSRF hole waiting only on a scheduler to become reachable, and the signer is inert. Wiring order is therefore constitutionally load-bearing, not just good practice — see Migration Safety's Point of No Return. Per Art. VI's standing exception, the local dev server still has no transport-layer auth; every admin route stays `authorize()`-gated per action (unchanged by this ADR, permission string renamed per §5 below). |
| VII — Spec Integrity | COMPLIES | This ADR and its Implementation Outline cite SPEC-015 v1.0.0, hash `sha256:f282049…9aae190`, and the governing ADR-036 (as amended by its own Round-2/3/4 folds) plus ADR-038/ADR-040. |
| VIII — Observability | COMPLIES (documented as partial, matching SPEC-015's own Art. VIII finding) | New structured signals: worker-pass summary log (`processed/delivered/failed/dead` counts, already returned by `processDueDeliveries` — just needs a log line at the call site), and the fan-out subscriber logs enqueue counts. The `webhook.subscription.*`/`webhook.delivery.*` domain-event emission SPEC-015 flagged as unverified is **not** added in this pass (no REQ/AC in SPEC-015 currently requires it) — named as a follow-up, not silently claimed done. |

No unjustified EXCEPTION rows. Complexity Justification table is empty (see below) — the one place this ADR could be accused of adding complexity (a scheduler) is resolved by picking the *simplest* mechanism that closes the gap, not a heavier one.

## Research Summary

- Research artifact: N/A, per Coordinator dispatch instruction — this reuses ADR-038's already-decided `HttpClientPort`/`EgressPolicy` design (undici/`fetch`-based guarded transport, structural enforcement via a policy-decorator constructor) and ADR-040's already-decided `OriginRegistryPort`/`isAllowedEgressTarget` oracle. No new library or technology choice is open; the two implementation-level choices this ADR does make (scheduler mechanism; root-key storage mechanism) are reuse-vs-build calls, evaluated in Pattern Evaluation below, not technology research.
- Key decision: N/A (see above).

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS (validator `--phase preflight`, run directly by this Software Architect pass since `pipeline-state.md`'s `planning_preflight_status` had not yet been mechanically re-verified for this remediation dispatch — `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/015-integrations --phase preflight` → `PASS: strict Speckit package passed mechanical validation.`)
- Spec hash verified at: 2026-07-13 (matches `feature.spec.md`'s recorded `content_hash`, unchanged since Spec Agent handoff)
- Red-Team status and artifact: NOT STARTED (per `pipeline-state.md`) — this is a lightweight-backfill spec per explicit Coordinator instruction; no Red-Team pass was requested for the as-built documentation phase. This remediation ADR does not treat that as a blocker for *architecture* work (the gaps themselves are already named and evidence-sourced in SPEC-015), but implementation should not begin without a Red-Team pass over this ADR's new attack surface (real egress transport, real signer, real scheduler) — flagged as a review trigger below, not silently skipped.
- System Blueprint status and artifact: Not produced — no macro-topology change. This is new module content inside the existing modular monolith (`src/integrations/`, `src/http/`), not a new service/deployment boundary.
- CodeBase Analyzer reports consumed: None formal. This ADR performed direct source inspection of `src/integrations/*` (incl. all four test files), `src/http/*`, `src/origin/*`, `src/server/{app.ts,routes/types.ts,routes/admin/integrations/*}`, `src/identity/permissions.ts`, `src/core/{ports.ts,events/*}`, `src/infra/db/schema.ts`, and one existing SQLite adapter (`src/features/settings/repo.sqlite.ts`) to ground every module boundary in real repo precedent.
- Reverse-spec artifacts consumed: None — SPEC-015 is a lightweight as-built backfill (spec-manifest.md Brownfield References), not a 5-pass reverse-spec extraction.
- Validator result or waiver: PASS, no waiver needed (python3 available).

## Context

SPEC-015 documents a feature that is real, tested, and wired for CRUD — and completely inert for its actual purpose. `enqueueDelivery`/`processDueDeliveries` are fully implemented and unit-tested in isolation (`src/integrations/__tests__/delivery.test.ts`), but a repo-wide search confirms **zero non-test callers** of either function. The signer (`createFixedSecretSigner(new Map())`), the transport (`src/http/` is types/ports only — no adapter exists anywhere in the repo, confirmed by directory listing), and the egress check (`permitAllHttpsTargets`, a literal `async () => true`) are all dev placeholders sitting behind that same dead switch. `WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` have only in-memory adapters, so even if the switch were flipped, a server restart would lose every subscription and delivery.

Three additional facts, found during this architecture pass and not previously recorded in SPEC-015, materially shape the design:

1. **This codebase has no scheduler primitive at all.** `src/core/events/outbox-worker.ts`'s `processOutbox` — the one precedent ADR-036 cites for "a core outbox subscriber" — is not run on an interval anywhere. It is called exactly once, inline, inside the `POST /workspaces` route handler, after that one route's write. There is no `setInterval`/cron/background-loop pattern anywhere in `src/server/`. Wiring Stage B (`processDueDeliveries`) therefore cannot "follow existing precedent" — the precedent doesn't generalize (webhook retries must fire on their own backoff clock independent of any inbound HTTP request, unlike the one demo route).
2. **`EventBusPort.subscribe` is per-event-name, and no webhook-relevant domain event exists yet.** The only `DomainEvent`s actually emitted in the running server today are `workspace.created`, `change-set.applied`, and `change-set.reverted` — `post.published`, ADR-036's own running example, is not emitted anywhere. Wiring Stage A (fan-out) is therefore correct and completable now, but will have zero live subscription matches until a content-publish event is added by another feature — an honest, disclosed limitation, not a blocker.
3. **`core/origin` (ADR-040) is real, not a stub — but only its in-memory adapter exists.** `OriginRegistry` in `src/origin/origin.ts` is a complete, well-tested implementation of `isAllowedEgressTarget`/`isAllowedRedirectTarget` (WHATWG-parser normalization, IDNA/punycode, backslash/userinfo rejection, fail-closed). SPEC-015's Dependencies table undersells this slightly by implying the whole allowlist mechanism is unbuilt — the *oracle logic* is real and ready to wire; only its `OriginSettingRepoPort` SQLite adapter is missing (origin has no `repo.sqlite.ts`, same gap class as Integrations' own GAP-05, but it is not this feature's file to fix — `core/origin` is a shared cross-cutting primitive from the 2026-07-10 sweep, not one of this dispatch's five named sibling features).

Doing nothing leaves the constitution's own Art. VI logic in a strange state: the egress hole and the inert signer are *currently* harmless only because nothing ever calls the code path that would exercise them. The moment any future change adds a scheduler or a subscriber — even one unrelated to this ADR — that latent SSRF hole and meaningless-signature path become live. This ADR's job is to close the gaps in the order that never creates a window where "wired" and "safe" diverge.

## Decision

Close GAP-01 through GAP-06 and GAP-12 as one coordinated architecture, built and merged in dependency order, with the delivery pipeline's live activation (Stage A subscriber + Stage B scheduler registered in the real composition root) as the last, explicitly gated step — not a step that ships alongside the signer/transport/storage work.

**Pattern(s) selected:**
- Signer: swap `createFixedSecretSigner` for a `KeyringPort`-backed adapter (`EnvOrFileKeyring` + `createKeyringBackedSigner`), keeping `KeyringPort`'s declared home in `src/integrations/ports.ts` per ADR-036's own Round-3 fold ("canonical here until ADR-041").
- Transport: the ADR-038 structural pattern — a module-private `HttpTransportAdapter` (`fetch`/undici-based) wrapped by the only exported constructor, `createHttpClient(transport, policy): HttpClientPort`, enforced by an import-boundary CI canary (mirrors ADR-022's write-chokepoint canary pattern).
- Egress: wire `subscriptions.ts`'s existing `isAllowedTarget` injection seam to `OriginRegistryPort.isAllowedEgressTarget` (ADR-040), replacing `permitAllHttpsTargets`, using the origin registry's existing in-memory adapter (its own SQLite adapter is a separate, pre-existing gap, not created by this ADR — flagged as a risk, not silently absorbed into this feature's scope).
- Persistence: `repo.sqlite.ts` Drizzle adapters for both webhook repo ports, folding the `DeliveryEnvelopeStore`'s payload (GAP-12) directly into a new `payload_json` column on `webhook_deliveries` rather than deferring it separately — see Rationale for why these two gaps are actually one problem.
- Activation: a plain `setInterval`-based worker wrapper (`startWebhookDeliveryWorker`) for Stage B, and one additive `EventBusPort.subscribeAll` method for Stage A — both are ordinary composition-root code, not new ports, matching ADR-036's own "dispatch is core code, not a port" framing.
- Permission: register `admin.integrations.manage` (the frozen convention already recorded in `ADR-INDEX.md` for every sibling section), migrate via the same dual-grant, deprecate-don't-delete pattern this repo already used for `settings.write` (`identity/seed.ts`).

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: FOLLOWS
- Notes: Every new adapter lands inside its already-hexagonal home (`src/integrations/`, `src/http/`) behind an already-declared port — no new module boundary is invented. The scheduler and fan-out wiring are deliberately *not* elevated to ports (Article IV) — they are composition-root glue, matching how `processOutbox` itself is called directly from `app.ts` rather than through an abstraction. This is the case where the simpler choice (a function + `setInterval`, not a job-queue library or a `SchedulerPort`) is also the one that avoids unjustified ceremony for a single-process dev server.

## Rationale

Map the decision to the system drivers:
- **Driver: the feature is fully coded but has zero live callers (GAP-01)** → addressed by treating "turn it on" as its own last, gated phase rather than bundling it with the prerequisite work, so the codebase is never in a state where the switch could be flipped by an unrelated future change before its dependencies are real.
- **Driver: no scheduler primitive exists anywhere in this codebase** → addressed by the smallest mechanism that solves the actual problem (an interval loop with an overlap guard and a `stop()` handle for graceful shutdown/tests), not a new abstraction layer — a `SchedulerPort` would fail Article IV today (one real use, no second adapter in sight) and a job-queue library would fail Article I's "conscious, recorded" bar (this single-process dev server has no broker for it to manage).
- **Driver: signer and transport are inert dev stand-ins on a security-relevant path** → addressed by building both real adapters (KeyringPort-backed signer, guarded HTTP transport) *before* anything can call them in production, so "inert" never briefly becomes "live but wrong."
- **Driver: the egress allowlist is a literal permit-all** → addressed by wiring the already-real `OriginRegistry` oracle now; this is the one gap where the *hard problem* (SSRF-safe normalization) was already solved by a sibling ADR (040) and only needed connecting, not designing.
- **Driver: GAP-05 (no durable storage) and GAP-12 (no envelope re-hydration path) are the same underlying problem** → addressed by fixing them together: a SQLite adapter that can't also durably store the payload a real, later-process delivery worker needs to replay is not actually a fix for "the server loses everything on restart," it just moves the loss from "everything" to "everything except retry counters." Splitting these into separate future passes (as SPEC-015's gap numbering implies) would ship a persistence layer that still can't survive a restart mid-delivery.
- **Driver: the permission-string drift is a repo-wide cross-cutting decision, not local to Integrations** → addressed by reusing the exact migration mechanism (`identity/seed.ts` dual-grant, `permissions.ts` DEPRECATED-not-deleted) this repo already applied to `settings.write`, so Integrations' rename is mechanically identical to what Menus/Members/every other Wave-1 sibling ADR already committed to, not a bespoke approach.

## Pattern Evaluation

The persistence/security patterns (hexagonal ports-and-adapters, rule-of-two, structural egress enforcement) are inherited unchanged from ADR-006/036/038/040 and are not re-litigated here. Two genuinely open implementation choices exist: **how Stage B gets scheduled**, and **where the root key lives**.

| Pattern (Stage B scheduling) | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---|---|---|---|---|---|---|---|
| Plain `setInterval` wrapper with an overlap guard + `stop()` handle | Strong fit | High | measured (matches `processOutbox`'s existing call-and-await shape; single Node process, no broker in this repo) | Zero new infrastructure; trivial to test (call the exported function directly); trivial graceful shutdown | Runs in-process — if the server restarts mid-interval, the next boot just resumes (rows stay `pending`/`delivering` and get reclaimed); no cross-instance coordination if this ever runs multi-process | A future multi-instance deployment would need a leader-election or DB-level claim lock — `claimPending`'s status-flip-on-claim already gives at-least-once single-writer safety, so this is a scale trigger, not a correctness gap, today | **SELECTED** |
| A `SchedulerPort` abstraction (pluggable cron/interval/queue backends) | Weak fit | Low | analogical | Would let a future deployment swap in a real scheduler (cron, cloud scheduler, BullMQ) without touching call sites | Zero real second implementation today — pure speculative generality (Article IV); this repo doesn't even have ONE scheduled job yet, let alone two shapes to abstract over | None that justify the abstraction now | Not selected — textbook premature port; revisit if/when a second scheduled job (e.g. delivery-log GC) actually needs the same shape |
| A job-queue library (BullMQ/Agenda/etc.) | Rejected | Medium | analogical | Battle-tested retry/backoff/concurrency semantics out of the box | Requires Redis or an equivalent broker this single-process SQLite-backed dev server doesn't run; `processDueDeliveries` already implements its own backoff/retry/dead-letter logic — adopting a queue library would mean either double-implementing retry semantics or ripping out the already-tested domain logic | Operational overhead (new infra dependency) not justified pre-PMF, matching this repo's existing rejection of message brokers elsewhere (ADR-009's own in-memory outbox choice) | Not selected — violates Article I's "conscious tradeoff" bar for zero corresponding benefit at this scale |

| Pattern (root-key storage) | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---|---|---|---|---|---|---|---|
| Env var override, falling back to a generated file outside the portable site folder (`EnvOrFileKeyring`) | Strong fit | High | measured (ADR-036 §5 explicitly names "env var now → OS keychain next" as its own rule-of-two) | Satisfies ADR-024's secret invariant by construction (the key never lives beside `content.db`); zero new infra; matches the ADR's own stated plan | Operator must understand the key's file location is machine-local, not portable — first-boot provisioning story needs documentation | Lost/rotated key re-derives every signing secret (receivers must re-copy) — ADR-036's own named Open risk, unchanged by this ADR, just implemented per its stated v1 answer | **SELECTED** |
| OS keychain (via a native keytar-style binding) | Viable fit | Medium | analogical | Stronger at-rest protection; the named rule-of-two second adapter | Adds a native-binding dependency (platform-specific) before there is a second real consumer forcing the issue; this repo's precedent (media/image-transformer) shows native deps get deferred until forced | Right long-term answer for the Tovu-Runner desktop host; premature for this pass | Not selected now — explicitly named as the rule-of-two second adapter to build when the desktop host (which already has OS keychain access patterns) needs it |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Ease of changing delivery/signing/egress behavior later | 4 | measured | Every new piece lands behind an already-declared port (`KeyringPort`, `HttpClientPort`, repo ports) — swapping the root-key mechanism or transport later is a DI change, not a call-site rewrite | The scheduler wrapper is a concrete function, not a port — swapping mechanisms later touches its one call site in `server/deps.ts` | Matches the "don't abstract before a second real need" principle | No second scheduled job exists yet | always-on | If a second scheduled job appears (e.g. delivery-log GC per ADR-036 §8), extract a shared `startIntervalWorker(name, intervalMs, fn)` helper at that point, not now | Owner: Software Architect; trigger: a second interval-based worker is proposed | — |
| modularity | Cross-module coupling | 4 | measured | `integrations` gains exactly one new read dependency (`core/origin`'s `OriginRegistryPort`, via DI) beyond what it already had; `http` stays a leaf module with zero domain knowledge | `server/deps.ts`/`server/app.ts` now compose one more cross-cutting adapter (`KeyringPort`) shared in principle with Analytics/Newsletter (not built by them yet) | Same dependency shape every other admin feature already has on `identity`/`core` | Analytics/Newsletter's own `KeyringPort` consumption is out of this pass's scope (sibling agents) | always-on | — | — | — |
| scalability | Delivery throughput headroom | 3 | measured | `claimPending`'s batch-and-flip-status claim model is single-writer-safe even with the new SQLite adapter | The idempotency check (`isAlreadyEnqueued`) is still an O(n) scan per subscription's delivery history — SPEC-015's own disclosed gap, not fixed by this ADR | A production adapter needs a unique index on `(workspace_id, subscription_id, event_id)`; this ADR's SQLite adapter adds that index (turns the disclosed scaling gap into a real fix as a side effect of GAP-05 work) | Delivery volume stays modest (single self-hosted workspace scale) until multi-tenant/high-fanout use appears | always-on | If p95 enqueue latency or delivery-table row count becomes a concern, revisit the unique-index-backed idempotency check's query plan | Scale trigger: delivery table exceeds ~100k rows per workspace, or multi-instance deployment is planned | — |
| reliability | Never-brick / correctness under failure | 5 | measured | `claimPending`'s status-flip-on-claim + at-least-once semantics survive a mid-pass crash (row stays `delivering`, retried next pass since nothing marks it delivered); envelope now durably stored alongside the delivery row (GAP-12 folded into GAP-05) so a restart mid-Stage-B no longer loses the payload | A `delivering` row whose worker crashed mid-attempt has no watchdog to reclaim it faster than its natural backoff — acceptable given `attempts` was already incremented at claim time (bounded by `MAX_DELIVERY_ATTEMPTS`), not a silent bug | Matches the existing `InMemoryOutbox`/ADR-009 reliability posture; not weaker than the pattern this mirrors | — | always-on | — | — | — |
| security | Authorization + SSRF + signing correctness | 5 | measured | Closes a real SSRF hole (permit-all → real fail-closed oracle) and a real meaningless-signature gap (empty map → KeyringPort-derived secret) — this is the axis this entire ADR exists for | The sequencing risk itself (see Migration Safety) is the residual risk if the phases are ever merged out of order by a future change | Every mitigation is structural (import-boundary canary, fail-closed oracle, DI-only signer) not just documentary, matching ADR-038's own "structural, not documentary" standard | Assumes the Migration Safety gate is actually enforced at merge/cutover time, not just written down | always-on | Owner: Code Review Agent — block any PR that registers the fan-out subscriber or starts the interval worker in the same change as the transport/signer work; Enforcement: Code Review checklist item (see Enforcement section); Deadline: before any activation PR merges | Red-Team pass over this ADR before implementation begins (see Planning Preflight Evidence) | +2 vs. shipping activation in the same PR as the adapters (rejected, see Migration Safety) |
| operability | Ops/debugging surface | 4 | measured | Worker-pass summary (`processed/delivered/failed/dead`) is already computed by `processDueDeliveries` — this pass just logs it; `stop()` handle enables clean shutdown | No alerting/runbook surface yet for a delivery entering `dead` at volume — named as a follow-up (matches SPEC-015's own Art. VIII partial finding) | Inherits the existing structured-error convention (`lastError`/`lastResponseStatus` columns) | — | always-on | — | — | — |
| cost | Build/run cost | 5 | measured | No new infrastructure (no broker, no external secret manager, no new service) | None | Pure in-process addition to an existing modular monolith | — | always-on | — | — | — |
| testability | Ease of certifying behavior | 4 | measured | `startWebhookDeliveryWorker`/`registerWebhookFanout` are thin wrappers around already-certified pure logic (`processDueDeliveries`/`enqueueDelivery`) — TDD only needs to certify the wrapper's scheduling/overlap-guard behavior and the two new adapters, not re-certify the domain core | The guarded HTTP transport's redirect/DNS-pinning logic is inherently harder to unit test than pure functions — needs a local test server + policy-widened `devHostAllowlist`, not just in-memory mocks | Matches ADR-038's own stated test approach (policy capability widening, never consumer-side bypass) | — | always-on | — | — | — |

No axis scored ≤2; the one axis with a named residual risk (security) has an explicit owner/enforcement/deadline mitigation above.

## Overall Strengths

- Closes a real, disclosed SSRF exposure and a real, disclosed meaningless-signature gap using components that already exist elsewhere in the repo (ADR-038's design, ADR-040's implementation) rather than inventing new security-critical code from scratch.
- Treats "turn the feature on" as a first-class, separately-gated architectural decision rather than an implementation afterthought — directly answers the dispatch's central sequencing concern.
- Every new module traces to a named gap; nothing is spuriously generalized (no `SchedulerPort`, no job-queue library, no premature `lib/keyring/` promotion).

## Overall Weaknesses

- The root-key file's machine-local storage location needs an explicit first-boot operator story (what happens on a fresh clone, a container rebuild, a desktop-host reinstall) that this ADR names as a requirement but does not fully specify — flagged as an open item, matching ADR-036's own unresolved root-key-management crux.
- `core/origin`'s own persistence (its SQLite adapter) remains a gap this ADR does not fix — wiring Integrations to it improves correctness (fail-closed real oracle) but not durability (the verified-origin/allowlist settings still reset on server restart, a pre-existing cross-cutting gap this feature inherits rather than causes).

## Tradeoff Tension

We are trading a slightly slower rollout (four sequenced phases instead of one PR that "just wires it all up") for the guarantee that the feature is never live with a fake signer, a permit-all egress check, or in-memory-only storage behind it at the same time as real delivery traffic.

## Why This Won

The dispatch itself named the exact risk this design is built around: a half-finished cutover — wiring the scheduler before the egress policy is real — is a security risk, not merely an incomplete feature. Every alternative that bundles activation with the prerequisite adapters (build everything in one PR, "since it's all related") fails that test the moment a rebase or partial revert reorders the merge. Sequencing activation as its own last, explicitly gated phase is the only design that keeps the codebase safe at every intermediate commit, not just at the final one.

## Runner-Up Comparison

- Runner-up: Ship all six gaps (signer, transport, egress, storage, scheduler, permission rename) as one large PR/feature branch, reasoning that they're all part of "turning Integrations on" anyway.
- Why it lost: A single large change has no safe intermediate state to pause at — if Red-Team or Code Review flags an issue in the transport's redirect-handling (a plausible, non-trivial review finding), the whole bundle either ships with a known gap or blocks entirely, including the already-safe parts (SQLite adapters, permission rename) that have nothing to do with the flagged issue. Sequencing lets each prerequisite land and be reviewed independently, with activation as the single, narrow, easy-to-scrutinize final diff.

## Consequences

**Positive:**
- The feature described in SPEC-015's User Journey ("no webhook is actually ever delivered by the running server") becomes true end-to-end, with a signer that produces a verifiable signature and a transport that can't be pointed at an internal service.
- The permission-string drift disclosed in SPEC-015's OQ-01 is resolved using the exact mechanism already proven safe for `settings.write`, keeping Integrations' migration mechanically identical to its Wave-1 siblings (Menus, Members) rather than a bespoke approach that Code Review would need to evaluate separately.
- GAP-12 (envelope re-hydration) stops being a deferred, separately-tracked risk and is resolved as a natural side effect of building the SQLite adapter correctly.

**Negative / Tradeoffs:**
- Four sequenced phases (adapters → storage → permission rename [parallel] → activation) mean the feature stays "coded but off" for longer in absolute PR count than a single bundled change would.
- The root key's file-based storage is a machine-local artifact that needs deliberate backup/restore documentation (distinct from the portable `content.db` backup story) — a new operational surface this repo didn't have before.

**Risks:**
- Risk: A future change activates the fan-out subscriber or interval worker before the transport/signer/storage phases land (e.g., someone "just wires it up" without reading this ADR) → mitigation: Code Review Agent enforcement item (below) blocks any PR registering `registerWebhookFanout`/`startWebhookDeliveryWorker` in `server/app.ts`/`server/deps.ts` unless the PR diff also shows the real `KeyringPort`/`HttpClientPort` adapters already merged.
- Risk: The root key is lost (host reinstall, container rebuild without a persisted volume) → plan: this ADR does not solve key durability (ADR-036's own named Open item); document the file's path prominently in the composition root's boot log the first time it is generated, and flag key rotation as a required follow-up decision before this ships to any non-local deployment.
- Risk: `core/origin`'s in-memory-only persistence resets the verified-origin/egress-allowlist settings on every server restart, meaning a freshly restarted dev server would fail-closed every egress check until re-seeded → plan: seed a dev-capability verified origin + egress allowlist entry at boot (mirrors `server/seed.ts`'s existing bootstrap pattern), documented in the Implementation Outline's Wiring Map.

## Mitigations Required

- Weak axis: none scored ≤2. The security axis's residual sequencing risk (scored 5, not weak) still carries an explicit mitigation per the Quality Attribute Scorecard row above.
- Mitigation: Code Review Agent blocks any PR that registers the fan-out subscriber or starts the interval worker unless the real transport/signer adapters are already merged (see Enforcement).
- Owner: Code Review Agent (enforcement), Software Architect (this decision).
- Enforcement: PR checklist item, named explicitly in Enforcement section below.
- Deadline or trigger: before the activation PR (Phase 4, see Migration Safety) merges.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

This is brownfield remediation of an already-shipped, partially-dead feature — Migration Safety applies both to the permission-string rename (a real data migration) and, more importantly, to the **phased activation sequence**, which is the load-bearing safety mechanism this whole ADR is built around.

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | **Permission rename:** register `admin.integrations.manage` alongside the existing `integration.manage` (expand); a boot-time migration (`migrateLegacyIntegrationsPermission()`, mirroring `migrateLegacyPresentationSettings()`) grants the new string to every existing `integration.manage` holder; all five route `authorize()` calls switch to check the new string only, once the migration has run; `integration.manage` stays registered but marked DEPRECATED (contract — old grants inert but not deleted) until a follow-up confirms zero live dependence. **Activation:** the four phases below (adapters → storage → [permission rename, parallel] → activation) are themselves an expand/contract shape — each phase is independently mergeable and independently revertible without breaking the phase before it. | Software Architect (this decision), Programmer (migration script + route updates) |
| Dual-write or read-routing plan | Permission check reads only the new string post-migration (no dual-check window needed — the migration is a one-time additive grant, and `authorize()`'s existing OR-across-grants semantics make the cutover atomic at read time once the migration has run). No dual-write applies to the phased-adapter rollout — each adapter (signer, transport, SQLite repo) fully replaces its dev placeholder at its own merge, with the placeholder simply no longer imported afterward. | Programmer |
| Backfill plan | Permission migration backfills every existing grant holder exactly once (idempotent re-grant, safe to rerun on restart, same pattern as the settings.write precedent). No data backfill applies to the SQLite adapters — there is no legacy webhook data in any durable store today (the in-memory adapter has never persisted anything past a restart), so the SQLite tables start empty; this is the rare brownfield migration with nothing to move. | Programmer |
| Reconciliation checks | Permission migration: an integration test asserts every principal holding `integration.manage` pre-migration also holds `admin.integrations.manage` post-migration, and that every existing route test (already passing against `integration.manage`) is updated to assert against the new string and still passes. SQLite adapters: the same contract-test suite already used for `settings`/`post`/`presentation` (`repo.memory.ts` and `repo.sqlite.ts` must satisfy identical behavior) is extended to `WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort`. | TDD Agent / Code Review |
| Observability proving phase health | Each phase's own tests are the proof (no separate migration telemetry needed) — the permission migration's grants are visible via existing `PrincipalRepoPort`/grant-listing test assertions; the activation phase's health is proven by the worker-pass summary log line landing once activated. | Programmer |
| Rollback test | Each of the four phases is independently revertible: reverting the permission-migration PR simply stops granting the new string (existing `integration.manage` grants are untouched, since they were never deleted); reverting the adapters/storage PRs is a normal code revert since nothing is wired live yet; reverting the activation PR (unregister the subscriber + stop the interval) returns the server to today's exact "coded but inert" state with zero data-loss risk, since no production data has accumulated in the interim. | Software Architect (this decision), Programmer (execution) |
| Cutover approval and timing | **The activation phase (Phase 4) is a named cutover requiring explicit Coordinator/human approval as its own change**, separate from approving the adapter/storage work. This is the point where "coded" becomes "live" for real outbound HTTP traffic and real signing — it must not be nodded through as part of a larger PR. | Coordinator / human |
| Point of no return | **Registering `registerWebhookFanout`/`startWebhookDeliveryWorker` in `server/deps.ts` (the real running server's composition root) is the point of no return** for this feature going live. This step is explicitly gated: it may not merge until (a) the `KeyringPort`-backed signer, (b) the guarded `HttpClientPort` transport with `EgressPolicy` enforced, and (c) the SQLite repo adapters are all already merged, tested, and — per the constitution's own logic — reviewed. Flipping this switch before (a)-(c) exist is not "shipping an incomplete feature," it is exposing a real SSRF surface and a meaningless-signature path to live traffic; the dispatch's own framing ("a half-finished cutover is a security risk, not just a partial feature") is adopted verbatim as this ADR's hardest constraint. | Coordinator (schedules/approves the cutover), Software Architect (this decision) |
| Post-cutover verification | A manual `/verify`-style pass: create a subscription against a controlled test receiver, trigger a real domain event (or, until one of webhook-relevant shape exists, manually invoke `enqueueDelivery` once for a test event as an interim check), confirm the receiver gets a POST with a valid `Tovu-Signature` header verifiable against the derived secret, confirm a deliberately-private-IP target is rejected by the egress policy pre-connect, and confirm a server restart mid-backoff window still delivers on the next worker pass. | TDD Agent, then human/`/verify` |

## Re-evaluation Triggers

- Calendar trigger: Revisit the root-key storage mechanism (env/file vs. OS keychain) once the Tovu-Runner desktop host work needs a shared keyring story — this is the named rule-of-two second adapter, not a forced deadline.
- Scale trigger: If delivery volume grows enough that the O(n) idempotency scan (even with the new unique index) or single-process `setInterval` scheduling becomes a bottleneck, revisit the "plain interval, no SchedulerPort" call in Pattern Evaluation.
- Topology trigger: If this server ever runs multi-instance, `claimPending`'s single-writer claim semantics need re-verification under concurrent claimers (today's status-flip-on-claim is safe for one process; a second process changes the reasoning, not necessarily the correctness).
- Dependency trigger: If `core/origin` gains a SQLite adapter (closing its own persistence gap) or ADR-041 (the dedicated `KeyringPort` home) is written, re-point the DI wiring accordingly — no call-site changes needed beyond composition root, since both are already consumed via their ports.

## Module / Service Boundaries

```
src/integrations/                         # EXISTING module, extended
  keyring.env.ts                          # NEW: EnvOrFileKeyring implements KeyringPort
                                           #   (GAP-02/GAP-03) — env var override, else a
                                           #   generated file outside the portable site folder
  signing.keyring.ts                      # NEW: createKeyringBackedSigner(keyring): WebhookSigner
                                           #   (GAP-02) — replaces createFixedSecretSigner in prod
  worker.ts                               # NEW: startWebhookDeliveryWorker (GAP-01, Stage B) —
                                           #   setInterval wrapper around processDueDeliveries,
                                           #   overlap guard, stop() handle
  fanout.ts                               # NEW: registerWebhookFanout (GAP-01, Stage A) —
                                           #   subscribes to EventBusPort.subscribeAll, calls
                                           #   enqueueDelivery per event
  repo.sqlite.ts                          # NEW: Drizzle adapters for WebhookSubscriptionRepoPort/
                                           #   WebhookDeliveryRepoPort (GAP-05), folding
                                           #   DeliveryEnvelopeStore's payload into
                                           #   webhook_deliveries.payload_json (GAP-12)

src/http/                                 # EXISTING module (types/ports only today), extended
  transport.fetch.ts                      # NEW, module-private: HttpTransportAdapter impl over
                                           #   Node's fetch/undici (GAP-04) — never imported
                                           #   outside src/http/ + the composition root
  client.ts                               # NEW: createHttpClient(transport, policy) — the only
                                           #   exported constructor (GAP-04/GAP-06), enforces
                                           #   EgressPolicy structurally
  __tests__/import-boundary.test.ts       # NEW: CI canary asserting transport.fetch.ts is not
                                           #   imported outside src/http/ + composition root

src/core/ports.ts                         # MODIFIED: EventBusPort gains subscribeAll (additive)
src/core/events/memory-bus.ts             # MODIFIED: InMemoryEventBus implements subscribeAll

src/infra/db/schema.ts                    # MODIFIED: add webhookSubscriptions, webhookDeliveries
                                           #   Drizzle tables (ADR-036 §2 DDL + payload_json)

src/identity/permissions.ts               # MODIFIED: register admin.integrations.manage; mark
                                           #   integration.manage DEPRECATED (GAP-05 numbering
                                           #   note: this is the permission-rename item, listed
                                           #   as priority 5 in the dispatch)
src/identity/seed.ts                      # MODIFIED: migrateLegacyIntegrationsPermission() boot
                                           #   migration (dual-grant)

src/server/routes/admin/integrations/*.ts # MODIFIED: authorize() calls switch to
                                           #   admin.integrations.manage; create.ts drops
                                           #   permitAllHttpsTargets, injects real isAllowedTarget
                                           #   via OriginRegistryPort.isAllowedEgressTarget
src/server/routes/types.ts                # MODIFIED: RouteDeps gains originRegistry:
                                           #   OriginRegistryPort; webhookSigner field doc
                                           #   corrected once a real consumer (the worker) exists
src/server/app.ts                         # MODIFIED: hermetic test composition wires in-memory
                                           #   KeyringPort/HttpClientPort test doubles (no live
                                           #   activation in the test composition)
src/server/deps.ts                        # MODIFIED (Phase 4 only): real KeyringPort/HttpClientPort
                                           #   composed; registerWebhookFanout +
                                           #   startWebhookDeliveryWorker registered — THE POINT OF
                                           #   NO RETURN, gated per Migration Safety
src/server/seed.ts                        # MODIFIED: seed a dev-capability verified origin +
                                           #   egress allowlist entry at boot (so the real oracle
                                           #   doesn't fail-closed on every fresh dev server)

Out of scope this pass (named, deferred — GAP-08/09/10/11):
  integration_secrets / SecretSealerPort runtime (outbound connectors)
  API-key admin presentation view
  Subscription secret rotation
  Manual redelivery of dead deliveries
```

## API / Event Contract Summary

- `EventBusPort.subscribeAll(handler): Promise<() => Promise<void>>` — new additive method every future core subscriber (not just webhooks) can use instead of enumerating event names; `integrations`' `fanout.ts` is its first consumer.
- `createHttpClient(transport: HttpTransportAdapter, policy: EgressPolicy): HttpClientPort` — the only way to obtain a guarded client; Newsletter/Analytics (sibling ADRs, out of this pass's scope) will call the same factory once they wire their own consumption.
- `KeyringPort.deriveSigningSecret`/`.derive()` — unchanged shape (ADR-036 Round-3/4 folds already froze it); `EnvOrFileKeyring` is simply its first concrete implementation.
- `RouteDeps.originRegistry: OriginRegistryPort` — new composition-root-injected dependency every integrations admin route that validates a target URL must consume; Programmer must not re-implement egress checking locally.
- Admin HTTP contract (`api.spec.md` §1-6) is otherwise **unchanged** by this ADR — no new endpoints, no response-shape changes; the permission string checked is the only externally-observable difference (and only to callers who inspect the 403 `details.permission` field).

## Enforcement

How do we prevent violations?
- Code Review Agent flags any import of `src/http/transport.fetch.ts` from outside `src/http/` or the composition root (`server/app.ts`/`server/deps.ts`) — enforced by the import-boundary CI canary test, mirroring ADR-022's write-chokepoint pattern and ADR-038's own amendment 3 requirement.
- Code Review Agent blocks any PR that adds `registerWebhookFanout(...)`/`startWebhookDeliveryWorker(...)` calls to `server/deps.ts` unless the same PR (or an already-merged prior PR, verifiable in the diff/history) shows the real `KeyringPort` and `HttpClientPort` adapters already in place — this is the Migration Safety Point of No Return, enforced as a review gate, not a comment.
- Code Review Agent verifies both `WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` SQLite adapters pass the same contract-test suite as `repo.memory.ts` before approving the persistence PR.
- Code Review Agent verifies all five integrations admin routes' `authorize()` calls check `admin.integrations.manage` (not the deprecated string) in the same PR that lands the permission migration — no partial cutover.
- Code Review Agent verifies `permitAllHttpsTargets` no longer exists in `create.ts` once the egress-wiring PR merges (grep-verifiable).

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.*

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| — | — | — | — |

## Related Decisions

- Extends: ADR-036 (Integrations — the governing ADR this remediation closes gaps against), ADR-038 (`HttpClientPort`/`EgressPolicy` — this ADR builds ADR-038's first real transport), ADR-040 (`core/origin` — this ADR wires ADR-040's already-real oracle), ADR-009 (outbox pattern — Stage A/B mirror its retry/claim shape), ADR-006 (rule-of-two), ADR-021 (`authorize()`, permission catalog, flat-string grants), ADR-022 (write-chokepoint/CI-canary precedent this ADR's import-boundary canary mirrors), ADR-024 (secret invariant — the reason the root key can't live beside `content.db`)
- Relates to: SPEC-015 (the as-built spec this ADR remediates), `sweep-crosscutting-decisions-20260710.md` §E (permission-namespace convention, shared migration mechanism with Menus/Members/other Wave-1 siblings)
