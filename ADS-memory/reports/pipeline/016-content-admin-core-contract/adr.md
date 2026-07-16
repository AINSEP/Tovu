# ADR-PIPE-016: Content Admin Core Contract — Gated-Mutation Gateway, Write Watermark, and Composite Actor Identity

- Status: ACCEPTED
- Date: 2026-07-15T07:00:00Z
- Spec: SPEC-016 v1.4.0 (hash: sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f)
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode) / Leona Burime

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | `ADS-memory/governance/constitution.md` is an unfilled template (literal `[PRINCIPLE NAME]` placeholders, no ratified article text) — no concrete compliance target exists. Confirmed by direct read of the file; matches SPEC-016's own Constitution Compliance table. |
| II — Test-First | N/A | Same template-placeholder state. |
| III — Simplicity Gate | N/A | Same template-placeholder state — this ADR's own Pattern Evaluation section applies simplicity/adaptability judgment independently of any ratified article. |
| IV — Anti-Abstraction Gate | N/A | Same template-placeholder state — see Complexity Justification below for the rule-of-three evidence applied anyway, on the same discipline SPEC-016's own G-04 item used. |
| V — Integration-First Testing | N/A | Same template-placeholder state. |
| VI — Security-by-Default | N/A | Same template-placeholder state — this ADR's own fail-closed `authorize()` requirements stand on ADR-021's decision, not a constitution article. |
| VII — Spec Integrity | N/A | Same template-placeholder state — `spec_id`/`content_hash` discipline is carried regardless per the Speckit compatibility contract. |
| VIII — Observability | N/A | Same template-placeholder state — the error envelope's `correlationId` (SPEC-016 `errors.spec.md` §1) is carried regardless. |

No EXCEPTION rows exist; the Complexity Justification table below is filled anyway because SPEC-016's own spec-dod.md G-04 item flagged a rule-of-three obligation for the generic `{domain}`/`{action}` gateway parametrization, and that evidence should live in the ADR that actually selects the implementation pattern, not only in the spec.

## Research Summary

- Research artifact: N/A — no library or technology choice is undecided. The transaction/concurrency runtime (better-sqlite3 WAL; Postgres MVCC, deferred) is already fixed by ADR-015; no new dependency is being evaluated.
- Key decision: implement the shared contract as a new first-class core module (`src/core/gated-mutations/`), not as an extension of the existing `src/core/commands/` ordinary-mutation gateway, and not as a per-domain reimplementation.

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS
- Spec hash verified at: 2026-07-15T05:35:00Z (Coordinator Planning Preflight, `validate_spec_package.py --phase preflight`, exit 0) — hash later recomputed to `sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f` on 2026-07-15T07:00:00Z when this package was renumbered from SPEC-001 to SPEC-016 (see `ADS-memory/reports/pipeline/016-content-admin-core-contract/pipeline-state.md`); re-verified clean at `--phase preflight` after renumbering, same day.
- Red-Team status and artifact: `cleared_for_architect`, round 5, 0 BLOCKING — `ADS-memory/reports/pipeline/016-content-admin-core-contract/red-team-findings-round5.md` (against the pre-renumbering hash `sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe`; the renumbering pass was a mechanical, content-hash-only change — every `SPEC-001`→`SPEC-016` and `001-content-admin-core-contract`→`016-content-admin-core-contract` substitution — carrying no requirement/AC/behavior change, so Red-Team's substantive clearance stands against the renumbered package without needing a round 6).
- System Blueprint status and artifact: none produced for this feature (brownfield, single-domain-clear self-check path per Spec Agent persona steps 5-6); not required — see Coordinator's preflight note that the real multi-domain design-level work already happened via 4 independently Accepted ADRs (041/043/044/045) this spec derives from.
- CodeBase Analyzer reports consumed: none exist (`ADS-memory/reports/codebase-analysis/` confirmed absent); this ADR instead does direct-codebase verification below (Brownfield Grounding).
- Reverse-spec artifacts consumed: N/A — not a reverse-spec extraction.
- Validator result or waiver: PASS, `validate_spec_package.py --phase preflight`, exit 0, re-confirmed after renumbering (2026-07-15T07:00:00Z). No waiver needed — `python3` available throughout.

## Context

Four independent ADRs — ADR-041 (Storage/Timeline), ADR-043 (Collections), ADR-044 (Categories & Tags), ADR-045 (Backups/Recovery) — were each Accepted on 2026-07-14, and each restates or half-restates a set of mechanisms none of them individually owns: a global write watermark, a human-confirm gated-mutation gateway (`plan → confirm → execute`), a composite actor-identity shape crossing a physical file boundary, and a `db-ops` restore-point capability surface. ADR-041 §5's own six-round audit history (rounds 1-6, three different external auditors, each independently finding gaps the previous round missed) is direct empirical evidence of what happens when a cross-cutting mechanism is described informally in prose inside one ADR and cited by reference from others: the informal description itself needed six correction rounds before it was internally consistent, and even then required an explicit, tooling-backed inventory process rather than hand-written enumeration.

System drivers:
- **Coupling risk**: 4 dependent domains (Storage, Collections, Categories & Tags, Backups/Recovery) each need the identical watermark-stamping obligation, gated-mutation sequencing, and composite actor-identity rule. Any drift between their independent restatements is a correctness bug waiting to surface at integration time, not implementation time.
- **Blast radius**: the gated-mutation gateway exists specifically to bound human error and unauthorized action on destructive operations (forward migration, restore, destructive Collections cleanup). A bug in one domain's reimplementation of `authorize()`-before-idempotency ordering, or in actor-class redemption, is a security-relevant defect, not a cosmetic one.
- **Brownfield constraint**: this is an existing, running modular-monolith TypeScript codebase (Drizzle + better-sqlite3, single-writer WAL, Postgres deferred) with an established identity/authorization module (`src/identity/`) and an established *ordinary*-mutation gateway (`src/core/commands/executeCommand`). Any new mechanism must compose with both without silently duplicating or fragmenting them.
- **Team/scale context**: self-hosted, single-tenant-per-install product; no case for a separate service boundary for this mechanism.

What happens if we do nothing: each of SPEC-017/018/019/020 (Storage, Categories & Tags, Backups/Recovery, Collections) independently implements its own version of the watermark counter, its own gated-mutation sequencing, and its own actor-identity attribution — reproducing exactly the drift ADR-041's audit history already proved happens, four times over, with no single place to fix a defect once found.

## Decision

Implement SPEC-016's shared mechanisms as one new core library module, **`src/core/gated-mutations/`**, sitting alongside (not replacing) the existing `src/core/commands/` ordinary-mutation gateway. It exports: the `GatedMutationGateway` orchestrator (`plan`/`confirm`/`execute` functions parameterized by `domain`/`action`), the watermark-stamping function and its sidecar-mirror reconciliation, and the composite actor-identity helper (`ActorIdentityRef` + an append-reference function). Each dependent domain (SPEC-017/018/019/020) imports this module and supplies its own domain-specific plan/execute business logic as a callback; none of them re-implements the sequencing, token lifecycle, or actor-attribution logic themselves.

**Pattern(s) selected:** Shared kernel module (hexagonal-adjacent: the module defines the `db-ops` port and the gateway orchestration; each dependent domain's own repo/adapter layer implements `db-ops` for its own concrete tables where applicable) within the existing modular monolith — not a new service, not a generic workflow engine.

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: **FOLLOWS**
- Notes: The gateway and watermark mechanism is exactly the "business-critical logic that justifies an explicit boundary" case the heuristic reserves hexagonal treatment for (human-confirm high-blast-radius mutations, fail-closed authorization). It is not promoted to a service — it stays a core module inside the same process/deploy unit, consistent with this codebase's existing `src/core/` shape (`commands/`, `events/`, `ports.ts`). No new deployable, no new network boundary.

## Rationale

- Driver 1 (coupling risk / drift across 4 dependents) → addressed by extracting the shared mechanism into one module every dependent imports, rather than restates.
- Driver 2 (blast-radius / security relevance of gated mutations) → addressed by centralizing the `authorize()` re-evaluation ordering, actor-class redemption rule, and non-disclosure precedence (REQ-11/REQ-13/REQ-14) in one tested implementation instead of four.
- Driver 3 (brownfield composition) → addressed by keeping this module independent of, but co-existing with, `src/core/commands/executeCommand` — see Brownfield Grounding and Migration Safety below for why they are not merged.
- Driver 4 (self-hosted, single-tenant scale) → addressed by rejecting a service-boundary candidate outright (see Pattern Evaluation).

## Pattern Evaluation

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Shared core module (`src/core/gated-mutations/`), domain-parameterized | Strong fit | High | measured (direct read of `src/core/commands/`, `src/identity/`, `src/infra/db/schema.ts`) | Single implementation of watermark/gateway/actor-identity logic; matches this repo's existing `src/core/` shared-kernel shape; testable once, reused four times; rule-of-three satisfied (Storage, Recovery, Collections per SPEC-016 G-04, plus Categories & Tags' watermark-only obligation) | Requires each dependent domain to adapt its own business logic to the gateway's callback shape rather than writing ad hoc code | A small integration tax per dependent domain, traded for eliminating four independent drift surfaces | **SELECTED** |
| Extend `src/core/commands/executeCommand` to also handle gated mutations | Weak fit | Low | measured (read `command.ts` in full) | Reuses an existing, working, tested gateway; no new module | `executeCommand`'s shape (idempotency-key + rollback + changeset audit, single call) is a different risk-tier mutation pattern than plan→confirm→execute with a human-only confirm step and a minted token; forcing both into one function conflates two contracts with different callers, different actor shapes (`CommandActor` has no `workspaceId`/no `api_key` kind — see Brownfield Grounding), and different failure semantics | Would require widening `CommandActor`/`ExecuteCommandDeps` for every existing ordinary-mutation caller just to serve a mutation class none of them are | Not selected — violates single-responsibility for no adaptability gain; the two gateways serve genuinely different risk tiers |
| Per-domain reimplementation (status quo before this spec) | Rejected | Low | prior_art (ADR-041 §5's own six-round audit history) | No new shared code to write up front | Empirically proven to drift — six independent audit rounds each found a fresh inconsistency in the informally-restated version of this exact mechanism | The very problem this spec exists to close | Not selected — this is the defect class SPEC-016 was written to eliminate |
| Generic reusable workflow/BPMN-style engine for arbitrary multi-step ceremonies | Rejected | Medium | analogical | Could in principle serve any future multi-step ceremony, not just plan/confirm/execute | Speculative generality with only 3-4 named concrete consumers today (Storage, Recovery, Collections, Categories & Tags' lighter watermark-only need); the Anti-Abstraction discipline this project already applies elsewhere (SPEC-016 G-04) rejects abstracting beyond what 3+ concrete uses actually need | Over-engineering risk vs. a scoped gateway; a generic engine would need its own state-machine DSL, adding real complexity with no current second use case beyond this exact shape | Not selected — no third distinct *shape* of ceremony exists yet, only three consumers of the same shape, which the selected pattern already serves |
| Separate microservice/process for the gateway | Rejected | Medium | analogical | Independent scaling/deployment | Distributed-systems overhead (network boundary, serialization, its own auth) for a self-hosted, single-tenant-per-install product with no multi-instance requirement anywhere in scope | Operational overhead with zero driver justifying it | Not selected — violates the project's default modular-monolith heuristic with no offsetting requirement |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Cost of changing the gateway/watermark/actor-identity mechanism later | 4 | measured | One module to change instead of four | Every dependent domain must re-verify its own integration when the shared module's contract changes (SPEC-016 REQ-02's own auditable citation requirement mitigates this) | Centralizing the mechanism is exactly what makes future fixes single-site instead of four-site | Dependent domains keep their own citations current per REQ-02 | always-on | — | If a dependent domain's own integration-contract citation goes stale (drifts from the shared module's actual current REQ/AC text), Red-Team's cross-package review (already exercised once for RT4-001) is the enforcement mechanism | Any future SPEC-016 revision | +2 vs. per-domain reimplementation (which scores 2: each domain's own drift risk is independent and uncorrelated) |
| modularity | Boundary clarity between this module and existing `core/commands`/`identity` | 4 | measured | Clean separation: `gated-mutations` never imports `identity` directly (composition root binds a closure, mirroring `command.ts`'s own existing `AuthorizeFn` pattern) | The two gateways (`commands` and `gated-mutations`) both wrap authorize()-gated mutations, so a future reader must know which one to reach for | Directly mirrors this repo's own existing seam (`core/commands` already keeps `identity` out of its own dependency graph via a bound `AuthorizeFn` closure) — same discipline applied to the new module, not a new pattern | Composition roots (`server/deps.ts`) are the only place that binds the real `authorize()` closure, exactly as `command.ts` already does | always-on | Owner: this ADR's own Module/Service Boundaries section names both modules and when to use each; Enforcement: code review checks new gated (plan/confirm/execute) mutations land in `gated-mutations`, not `commands` | If a third gateway shape emerges, re-evaluate whether a shared base is warranted (still would need a 3rd concrete distinct shape, not just a 3rd caller of an existing shape) | +1 vs. extending `executeCommand` (which scores 3: reuses one boundary but blurs its contract) |
| scalability | Behavior under concurrent gated-mutation load | 3 | assumed | Gated mutations are explicitly rare, human-paced, high-stakes (SPEC-016 `api.spec.md` §3's own `GATED_WRITE` rate-limit profile: 5 req/60s, no burst) — this is not a scaling-sensitive path | `storage_write_watermark`'s single-row-counter contention under concurrent *ordinary* writes (not gated mutations) is unbenchmarked (SPEC-016 OQ-01, inherited from ADR-041) | Scalability concern is almost entirely about the watermark counter's write-serialization cost under concurrent chokepoint writes, not the rare gated-mutation flow itself | Self-hosted, single-writer-WAL scale (ADR-022's own stated ≤~100k-entries ceiling) makes single-row contention a non-issue at v1 scale | always-on | Owner: Software Architect for SPEC-017 (Storage) per SPEC-016 OQ-01; Enforcement: benchmark before any claim of higher-scale support; Deadline: before SPEC-017 architecture sign-off | If write volume approaches ADR-022's stated ceiling | 0 vs. runner-up (same concern applies to any pattern that centralizes the counter) |
| reliability | Behavior across `content.db` open/close, boot, and crash | 4 | measured | REQ-04/REQ-05's explicit boot-reconciliation-from-authoritative-source rule, and REQ-03's honest bounded-eventual (not synchronous) mirror guarantee, were both hardened across 3 Red-Team rounds (RT-012 through RT-021) before this ADR — see `red-team-findings-round2.md`/`round3.md` | Sidecar mirror is a non-authoritative, rebuildable cache by design (ADR-041 item 2) — an explicit, accepted tradeoff, not a hidden gap | The watermark's authoritative-source-of-truth-is-always-`content.db`, mirror-is-fallback-only design was itself the product of a real defect correction (ADR-041 round 2's audit fold) — this ADR inherits an already-hardened design, not a fresh one | `content.db` failing to open is the one case explicitly handled (REQ-05: unknown/lower-bound disclosure, never a stale precise number) | always-on | — | — | +1 vs. an in-`content.db`-only ledger design (ADR-041's own R1 draft, which the sidecar-journal fix superseded) |
| security | Authorization/actor-attribution correctness on gated mutations | 5 | measured | `authorize()` re-run fail-closed at both confirm and execute (never cached, REQ-11), actor-class redemption rule evaluated before plan re-derivation (REQ-13, closing a non-disclosure gap found in Red-Team round 2's RT-017), token non-disclosure for unknown/forged strings (REQ-11/AC-35) | Confirmation-token TTL (600s) and redemption-count (1) are enforced at the application check-sequence layer, not the database layer alone — a defense-in-depth gap if that check sequence itself has a bug | This axis is the primary reason SPEC-016 exists as a formal contract at all — every check-ordering rule here was independently Red-Team-adversarially reviewed across 5 rounds specifically hunting for disclosure/ordering defects | `principals.kind` already supports `user`/`agent`/`api_key`/`system` natively at the schema level (verified: `src/infra/db/schema.ts:629-637`) — no schema gap for the 3-kind actor-class rule | always-on | — | Any future principal kind added to `principals.kind` must be evaluated against REQ-13's actor-class rule before being granted gated-mutation execute rights | +2 vs. per-domain reimplementation (uncorrelated defect risk across 4 independent implementations of the same security-critical ordering) |
| operability | Observability of gated-mutation and watermark state | 3 | assumed | Structured error envelope with `correlationId` (`errors.spec.md` §1); `isGatedOperationInFlight` derived state gives an obvious operability signal | No metrics/tracing requirement is stated anywhere in SPEC-016 (out of scope — owned by dependent domains' own UI/observability, e.g. the Storage Timeline) | This module's own scope is the mechanism, not its dashboarding; each dependent domain's `ui.spec.md` (where present) owns operator-facing observability | — | always-on | — | If a production incident surfaces a gap, revisit whether the shared module needs its own structured logging beyond what dependents provide | 0 vs. runner-up |
| cost | Implementation/maintenance cost of the shared module vs. alternatives | 4 | assumed | One implementation, one test suite, reused four times, vs. four independent implementations each needing their own test suite | Nonzero fixed cost to build the shared module before any dependent domain can ship | Amortized cost is lower than 4x independent implementation + 4x independent defect-fixing (empirically demonstrated by ADR-041's six-round audit cost for just describing the mechanism once, informally) | — | always-on | — | — | +2 vs. per-domain reimplementation |
| testability | Ease of writing deterministic tests for the gateway/watermark/actor-identity logic | 5 | measured | Pure, deterministic check-sequence ordering (behavior.spec.md §2.2) with no hidden state; `state.spec.md`'s selectors (`isTokenRedeemable`, `isMirrorStale`, `computeDiscardedCount`) are explicitly side-effect-free | — | Every REQ has a traced AC in `traceability.spec.md`; the check-sequence's strict ordering (behavior 2.2) is itself a first-class testable contract, not incidental | — | always-on | — | — | +1 vs. extending `executeCommand` (whose existing test surface would need to grow a second, differently-shaped contract) |

## Overall Strengths

- Centralizes the single highest-blast-radius mechanism (human-confirm gated mutations) this codebase will have, in one place with one test surface.
- Composes cleanly with existing seams (`identity/authorize.ts`'s bound-closure pattern, `principals`' already-3-kind-plus-system schema) rather than inventing new ones.
- Directly inherits the hardening from ADR-041's six-round audit history and SPEC-016's own 5 Red-Team rounds, instead of re-deriving correctness from scratch per dependent domain.

## Overall Weaknesses

- Introduces a second gateway shape alongside `executeCommand`, which a future contributor must learn to distinguish (mitigated by this ADR's Module Boundaries section and the Enforcement note above).
- The watermark counter's concurrency cost at scale remains unbenchmarked (inherited open question, not a new gap this ADR introduces).

## Tradeoff Tension

We are trading a small conceptual surface-area increase (two gateway shapes instead of one) for eliminating four independent, empirically-proven-to-drift restatements of the same security-critical mechanism.

## Why This Won

The shared-module pattern is the only candidate that directly addresses the dominant driver (coupling/drift risk across 4 dependents) without either under-solving it (per-domain reimplementation, generic engine with no third distinct shape) or over-solving it (a separate service). Extending `executeCommand` was the closest runner-up but fails on contract clarity: gated mutations and ordinary mutations are different risk tiers with different actor-identity requirements (3 kinds + composite workspace pairing vs. `CommandActor`'s 2 kinds + bare id), and conflating them would force every existing ordinary-mutation caller to carry gated-mutation-shaped baggage it doesn't need.

## Runner-Up Comparison

- Runner-up: Extend `src/core/commands/executeCommand` to also serve gated mutations.
- Why it lost: `CommandActor` (`{id, kind: "user"|"agent", onBehalfOfId}`) has no `workspaceId` field and no `api_key` kind — it cannot represent SPEC-016's composite `(actorWorkspaceId, actorId)` + 3-principal-kind actor-class rule without a breaking change to every existing `executeCommand` caller. `executeCommand`'s own contract (idempotency-key replay protection, single-call rollback-on-record-failure) is also a fundamentally different shape from plan→confirm→execute's human-only confirm step and minted-token replay protection. Widening one gateway to serve both would have been the actual violation of this project's own Anti-Abstraction discipline — solving for a case (gated mutations) the existing abstraction was never shaped for.

## Consequences

**Positive:**
- A single, testable implementation of the watermark counter, gated-mutation gateway, and composite actor-identity mechanism that SPEC-017/018/019/020 each import rather than restate.
- Directly reuses `principals`' existing 3-kind(+system)/composite-workspace shape — no identity-schema change required.
- Preserves `executeCommand`'s existing contract and callers untouched — zero blast radius on already-shipped ordinary-mutation code.

**Negative / Tradeoffs:**
- Two gateway shapes now exist in `src/core/`; a contributor adding a new mutation must correctly classify it as ordinary vs. gated.
- The sidecar mirror's non-authoritative status (an accepted ADR-041 tradeoff) means any consumer reading `mirror.value` directly instead of via the documented selectors risks treating a stale value as authoritative.

**Risks:**
- Risk: A dependent domain (SPEC-017/018/019/020) implements its own gated mutation's business logic without going through the `gated-mutations` module's orchestrator, silently reintroducing the exact drift this ADR exists to prevent. Plan: each dependent domain's own ADR must cite this module's exported orchestrator functions by name in its Module/Service Boundaries section, and Code Review Agent should treat a hand-rolled plan/confirm/execute sequence as a Required finding.
- Risk: `storage_write_watermark`'s single-row-counter contention (OQ-01) turns out to matter sooner than assumed. Plan: benchmark owed before SPEC-017's architecture sign-off (already an open question this ADR does not resolve, per SPEC-016 itself).

## Mitigations Required

No axis scored ≤2; no mitigation rows required beyond the Owner/Enforcement/Deadline cells already filled inline in the Quality Attribute Scorecard for `scalability` (OQ-01 benchmark, owed at SPEC-017 sign-off) and `modularity` (code-review enforcement of gateway choice).

## Migration Safety (required for brownfield, reverse-spec, or migration work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | Purely additive at the schema level: new `storage_write_watermark` column/counter, new sidecar `ops/` tree (per ADR-041 item 2), new confirmation-token state (in-memory/short-lived, not a durable table per `state.spec.md` — TTL is 600s). No existing column or table is altered or dropped. | Software Architect for SPEC-017 (owns the concrete schema mapping into `content.db`) |
| Dual-write or read-routing plan | N/A — no existing watermark/gateway mechanism exists to migrate away from; this is new capability, not a replacement of a running one. `executeCommand`'s existing ordinary-mutation path is untouched and continues unchanged. | This ADR (N/A confirmed) |
| Backfill plan | `storage_write_watermark` initializes at `0` on first boot of a new `content.db` (behavior.spec.md §3) — no historical backfill is meaningful or required; existing content predates the counter and is simply not covered by any pre-counter disclosure window (an accepted, stated limitation, not a defect — REQ-07 already requires the disclosure to state it covers only watermark-stamped categories). | Software Architect for SPEC-017 |
| Reconciliation checks | REQ-04's boot-time reconciliation (sidecar mirror ← `content.db` authoritative counter, never from `storage_ledger`) is the built-in reconciliation check, already Red-Team-hardened (round 1's RT-... / ADR-041 round 2 audit fold corrected the original wrong "reconcile from ledger" design). | This module's own implementation (`gated-mutations`) |
| Observability proving phase health | `mirror.staleness` (`'fresh' \| 'unrefreshable'`) is the built-in health signal a dependent domain's UI (e.g. Storage Timeline) surfaces; `isGatedOperationInFlight` covers gateway-in-progress observability. | Dependent domain UIs (SPEC-017's Timeline, SPEC-019's Recovery screen) |
| Rollback test | Not applicable in the traditional sense — there is no prior version of this mechanism to roll back to. The gated mutation's own `execute()` failure modes (`PLAN_STALE`, `TOKEN_EXPIRED`, `FORBIDDEN`) are the "abort before mutation" paths, already covered by REQ-11/REQ-12/REQ-13's ACs. | Software Architect for SPEC-017/019 (their own domain-specific rollback-on-failed-migration/restore semantics) |
| Cutover approval and timing | N/A for this shared contract itself — cutover semantics (e.g. Postgres blue/green `CUTOVER`) are owned by SPEC-017 per this spec's own Out-of-Scope section; this ADR defines only the watermark/gateway/actor-identity mechanisms SPEC-017 depends on. | Software Architect for SPEC-017 |
| Point of no return | The single-use confirmation-token redemption (INV-03) is this contract's own point-of-no-return marker: once `execute()` redeems a token successfully, the domain-specific mutation is defined to have run exactly once. | This module's own implementation |
| Post-cutover verification | N/A for this shared contract; owned by whichever dependent domain performs an actual cutover (SPEC-017's Postgres blue/green `VERIFYING` state). | Software Architect for SPEC-017 |

## Re-evaluation Triggers

- Calendar trigger: none stated; re-evaluate if this contract has not been revisited within 2 major dependent-domain implementations (i.e., after SPEC-017 and one more dependent ship, confirm the shared module's contract held without a hotfix).
- Scale trigger: `storage_write_watermark` write-serialization cost exceeding ADR-022's stated ~100k-entry ceiling assumption (OQ-01).
- Topology trigger: any move toward a shared-file, multi-site topology reopens SPEC-016 OQ-02 (`siteId` vs `workspaceId` scoping) and this ADR's watermark-scoping assumption (per-`content.db`-file).
- Dependency trigger: a Postgres `db-ops` adapter's concrete `CUTOVER` repoint mechanism (OQ-03) landing — at that point, confirm the watermark's Postgres-`BIGINT` mechanism (REQ-01, self-defined by SPEC-016 per the RT4-001 fix) still holds against the adapter's actual transaction behavior.

## Module / Service Boundaries

```
src/core/
  commands/            # EXISTING — ordinary mutations: idempotency-key + rollback + changeset audit
    command.ts          #   executeCommand(), CommandActor (2 kinds, bare id) — UNCHANGED by this ADR
  gated-mutations/      # NEW — this ADR's module
    gateway.ts           #   plan()/confirm()/execute() orchestrator, domain-parameterized
    watermark.ts         #   stampWatermark(), sidecar-mirror reconciliation (RECONCILE_MIRROR)
    actor-identity.ts     #   ActorIdentityRef, appendActorReference() (composite workspaceId+id pair,
                          #   sourced directly from `principals`' native shape — no new actor type)
    token.ts              #   ConfirmationToken lifecycle (MINT_TOKEN/REDEEM_TOKEN/EXPIRE_TOKEN)
    ports.ts               #   DbOpsPort (dialect-neutral: getCapabilities(), restore-point capture)
  ports.ts              # EXISTING — shared cross-cutting ports (ClockPort, IdGeneratorPort, OutboxPort, etc.)
identity/
  authorize.ts          # EXISTING, UNCHANGED — gated-mutations binds a closure over this, exactly as
                         # core/commands/command.ts already does; gated-mutations never imports identity/ directly
infra/
  db/schema.ts          # `storage_write_watermark` column added to content.db's schema (SPEC-017 owns the
                         # concrete Drizzle mapping); `principals`' existing kind/workspaceId columns reused as-is
  sqlite/                # `db-ops` SQLite adapter implementation (whole-file online-backup)
  postgres/ (deferred)   # `db-ops` Postgres adapter (pg_dump -Fc + blue/green), per SPEC-017's own scope
```

Dependent domains (SPEC-017 Storage, SPEC-018 Categories & Tags, SPEC-019 Backups/Recovery, SPEC-020 Collections) each own their own `features/<domain>/` slice and import `core/gated-mutations`'s exported functions; none of them re-implements gateway sequencing, watermark stamping, or actor-identity attribution.

## API / Event Contract Summary

- `GatedMutationGateway.plan({domain, principalId, principalKind, ...domainParams})` — read-only, returns `GatewayPlan` (SPEC-016 `orchestrator.spec.md` §4).
- `GatedMutationGateway.confirm({domain, principalId, principalKind, planId, planHash})` — human-only, mints `ConfirmationToken` (600s TTL).
- `GatedMutationGateway.execute({domain, principalId, principalKind, confirmationToken})` — check-sequence per `behavior.spec.md` §2.2 (`authorize()` → token state → actor-class rule → plan re-derivation → domain mutation), then delegates to the calling domain's own execute callback.
- `stampWatermark(txHandle)` — must be called inside an already-open `content.db` transaction; increments `storage_write_watermark` by exactly 1 (REQ-01/AC-01/AC-02). Every dependent domain's own write chokepoint that wants disclosure coverage calls this and names the call site in its own `## Integration Contracts` section (REQ-02/AC-34).
- `appendActorReference({actorWorkspaceId, actorId, delegatedByWorkspaceId?, delegatedById?})` — populates a composite actor-identity pair on a ledger/audit row at append time (REQ-16-18).
- `DbOpsPort.getCapabilities()` / `.captureRestorePoint()` — dialect-neutral; SQLite and Postgres adapters implement it. Consumed by SPEC-017 (Storage) and SPEC-019 (Backups/Recovery).
- Error codes (`PLAN_STALE`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED`, `FORBIDDEN` with `details.reasonCode`) — canonical registry in SPEC-016 `errors.spec.md` §2; every dependent domain's own `errors.spec.md` reuses these rather than defining parallel codes.

## Enforcement

- Code Review Agent treats a hand-rolled plan/confirm/execute sequence in any dependent domain (bypassing `core/gated-mutations`'s orchestrator) as a Required finding.
- Code Review Agent treats a new gated-mutation write chokepoint that does not call `stampWatermark` inside its own transaction, and is not explicitly named in that domain's own `## Integration Contracts` write-chokepoint list (REQ-02/AC-34), as a Required finding.
- CI: any new `sqliteTable` export whose name suggests a ledger/audit/revision row (per the ADR-041 §5 write-path-inventory automation this ADR inherits as a dependency, not reinvents) triggers the same coverage-class classification obligation ADR-041 item 5 already establishes.

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.* No EXCEPTION rows exist (all 8 articles are N/A — unfilled constitution template). Filled anyway per SPEC-016 spec-dod.md item G-04's own flagged obligation:

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| IV — Anti-Abstraction Gate (N/A, no ratified article — applied as a discipline anyway) | The generic `{domain}`/`{action}` gated-mutation gateway parametrization has 3 named concrete consumers today: Storage's forward-migration ceremony (SPEC-017, ADR-041 §3), Recovery's restore ceremony (SPEC-019, ADR-045 §3), and Collections' destructive-cleanup step (SPEC-020, ADR-043 §6) — satisfying the rule-of-three before generalizing, not a speculative one-off abstraction. Categories & Tags (SPEC-018) additionally depends on the watermark-stamping obligation alone (not the full gated gateway). | Each of the 3 gated-mutation consumers implements its own plan/confirm/execute sequence independently. | Empirically proven insufficient by ADR-041 §5's own six-round audit history — independent restatement of this exact mechanism drifted every time it was tried informally. |

## Related Decisions

- Supersedes: none (this is a new pipeline ADR, not a revision of an existing one).
- Relates to: ADR-041 (Storage/Timeline — primary source touchpoint), ADR-043 (Collections §4), ADR-044 (Categories & Tags §4), ADR-045 (Backups/Recovery §2/§3), ADR-021 (identity & authorization — `authorize()`, composite `(workspace_id,id)` convention, agent delegation, §§2/4/6/9), ADR-022 (append-only revisions/write-chokepoint discipline), ADR-015 (Drizzle behind ports — Postgres `BIGINT` mapping for the watermark counter), ADR-012 (install-dir layout — the sidecar `ops/` tree).

## Brownfield Grounding (direct codebase verification, this ADR)

Performed directly against the live codebase, not from CodeBase Analyzer output (none exists for this surface):

- `src/infra/db/schema.ts`: confirmed no `storage_ledger`, `migration_runs`, `restore_points`, or `storage_write_watermark` table/column exists yet — this is genuinely new capability, consistent with SPEC-016's own brownfield-evidence note. Confirmed `principals` (line 629) already has `kind: text("kind")` supporting `"user" | "agent" | "api_key" | "system"` and a `(workspaceId, id)`-shaped primary key pair — SPEC-016 REQ-16's composite actor-identity requirement and 3-principal-kind actor-class rule (REQ-13) are already fully representable against this existing table with no schema change to `principals` itself.
- `src/identity/authorize.ts`: confirmed `authorize()` is implemented as an ordinary function (not a port, matching ADR-021 §2/§8's "one evaluator" decision) with fail-closed precedence (disabled-principal short-circuit > owner wildcard > exact match > fail-closed default) — this is the exact function SPEC-016 REQ-10/REQ-11/REQ-14 call into; no new authorization evaluator is introduced by this ADR.
- `src/core/commands/command.ts`: confirmed an existing, working ordinary-mutation gateway (`executeCommand`) already enforces `authorize()`-before-idempotency ordering (REQ-14's precedence rule, already satisfied for ordinary mutations) via its own `CommandActor`/`ExecuteCommandDeps` shapes. Confirmed `CommandActor` is `{id, kind: "user"|"agent", onBehalfOfId?}` — narrower than SPEC-016's required shape (no `workspaceId` field on the actor itself, no `api_key` kind, `onBehalfOfId` is a single bare id rather than a composite `(delegatedByWorkspaceId, delegatedById)` pair). This confirms the Pattern Evaluation's rejection of "extend `executeCommand`" as the correct call — the two mutation classes need genuinely different actor-identity contracts, and `gated-mutations` sources its actor references directly from `principals`' own native shape instead of adopting `CommandActor`'s narrower one.
- `src/infra/sqlite/content-db.ts`: confirmed `content.db` is already a per-site SQLite file opened via Drizzle + better-sqlite3 (matching REQ-01's SQLite-backed path exactly); confirmed no Postgres adapter exists yet in code (ADR-006's "future Postgres adapter" is still future) — REQ-01's Postgres-backed branch, EC-01's Postgres-specific concurrency argument, and OQ-03's `CUTOVER` mechanism remain correctly forward-looking/unimplemented, not a gap in this ADR.

## Implementation Outline: PRODUCED

Triggers checked (per `AI-Dev-Shop/skills/implementation-outline/SKILL.md`'s Trigger Decision Matrix): **Boundary Cross** (crosses `core/`, `identity/`, `infra/db/`, and 4 dependent `features/` domains), **Contract Change** (new API endpoints, new error codes, new exported orchestrator functions consumed outside this module), **System Wiring** (plan→confirm→execute sequencing orchestrated across dependent domains), **Data And Persistence** (new watermark column, new sidecar journal tree, confirmation-token state), **Brownfield Dependency** (extends existing `principals`/`authorize()` without modifying them), **Critical Cross-Boundary Invariant** (INV-01 through INV-07 span the gateway, the watermark, and actor-identity attribution across 4 dependent domains) — all apply. See `ADS-memory/reports/pipeline/016-content-admin-core-contract/implementation-outline.md`.

## Critical Internal Constraints: PRODUCED

Candidate units evaluated: the `execute()` check-sequence ordering (Security-Critical Sequencing), the watermark same-transaction atomicity (Concurrency/Ordering), the actor-class redemption rule (Security-Critical Sequencing), the boot-time mirror reconciliation direction (Failure/Recovery). See `ADS-memory/reports/pipeline/016-content-admin-core-contract/critical-internal-constraints.md` for designated units, their verification surfaces, and Required Ordering Constraints.

## Governance ADR Promotion

**Evaluated, promotion warranted.** This ADR establishes a cross-cutting rule that outlives this one feature: any future domain in this codebase that introduces a human-confirm, high-blast-radius mutation must use `core/gated-mutations`'s orchestrator rather than hand-rolling its own plan/confirm/execute sequence, and any write chokepoint wanting disclosure-window coverage must call the shared watermark-stamping function and name itself in its own spec. Promoted to `ADS-memory/governance/adrs/GOV-ADR-001-gated-mutation-gateway-and-watermark-chokepoint.md`; `ADR-INDEX.md` updated accordingly.
