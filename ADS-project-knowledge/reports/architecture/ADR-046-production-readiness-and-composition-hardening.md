# ADR-046: Production-readiness and composition hardening

- Status: ACCEPTED 2026-07-16 (owner sign-off; debated 2026-07-16 — 2-round swarm debate, Primary/agy/Codex + two Fable adversarial-review additions; unanimous on Candidate A/staged hardening, 8 amendments folded below; full record: `reports/swarm-consensus/runs/20260716T-adr046-production-readiness-consensus-report.md`).
- Date: 2026-07-13
- Spec: N/A — cross-cutting remediation program; each implementation phase requires its own approved, hash-verified spec before code changes begin.
- Author: Coordinator (Pipeline) — architecture proposal pending human and Software Architect review

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---|---|---|
| I — Library-First | COMPLIES | Use a maintained dependency-rule tool (`dependency-cruiser`) for static import enforcement rather than building an AST analyzer. No new runtime library is selected. |
| II — Test-First | COMPLIES | This ADR changes no runtime behavior. Every phase must begin with certified failing restart, readiness, route, and boundary tests before implementation. |
| III — Simplicity Gate | COMPLIES | Retains the modular monolith and its existing ports; explicitly rejects microservices and a general DI container. |
| IV — Anti-Abstraction Gate | COMPLIES | `ServerModule` is an application-composition convention with multiple immediate consumers, not a new core port. No new feature port is introduced merely to support bootstrapping. (2026-07-15 `/audit-work` note, finding B-02: the convention and its consumers do not exist yet — rule-of-two is satisfied *at Phase-3 introduction time*, when the convention lands together with its first consumer modules, not today.) |
| V — Integration-First Testing | COMPLIES | Durability, readiness, and feature activation requirements are verified through real SQLite, HTTP, and restart boundaries. |
| VI — Security-by-Default | COMPLIES | Production mode becomes fail-closed for unsafe/dev-only configuration and incomplete egress or media capabilities. |
| VII — Spec Integrity | N/A | There is no active feature spec to cite. This ADR is not authorization to implement; phase specs must cite their hash. |
| VIII — Observability | COMPLIES | Readiness, module lifecycle, migration, outbox, and delivery outcomes gain structured signals and health semantics. |

## Research Summary

- Research artifact: static graph review of the indexed repository (17,333 nodes / 27,501 edges); direct review of `src/server/app.ts`, `src/server/deps.ts`, core ports, feature `INFO.md` files, and adapter contract tests.
- Key decision: harden the existing modular monolith by making capability durability, asynchronous boot readiness, module composition, and dependency-boundary enforcement explicit and testable.
- Library decision: use `dependency-cruiser` as a development/CI dependency for import rules and cycle detection. It supports TypeScript dependency validation with repository-defined rules and non-zero failure on violations ([project documentation](https://github.com/sverweij/dependency-cruiser)). Pin its exact version in the phase spec/lockfile; do not install it under this ADR alone.

## Planning Preflight Evidence

- Coordinator Planning Preflight: NOT RUN — no implementation spec exists yet.
- Spec hash verified at: N/A.
- Red-Team status and artifact: NOT RUN. Required before any phase that enables egress, public ingress, persistence migration, or production deployment.
- System Blueprint status and artifact: existing modular-monolith topology retained; no service/deployment topology change.
- CodeBase Analyzer reports consumed: codebase-memory graph architecture, symbol, call-path, and source inspection on 2026-07-13.
- Reverse-spec artifacts consumed: N/A.
- Validator result or waiver: N/A — documentation-only ADR proposal.

## Context

Tovu has a strong intended architecture: vertical feature slices, framework-agnostic core ports, ports/adapters for external I/O, contract tests for several repositories, and an event/outbox model. The graph confirms a real modular monolith rather than a folder-only design.

The production composition is not yet at the same maturity as the design. `createApp()` is a 295-line, high-fan-out composition root that registers route families, establishes cross-feature subscriptions, encodes public-route ordering, and embeds feature-specific wiring. `createSqliteRouteDeps()` is a second 207-line composition root with asynchronous initialization and a broad dependency bag. This is workable now but increasingly fragile as feature count grows.

More importantly, the persistent composition still selects in-memory state for capabilities exposed by the running server. These include the outbox, change sets, member repositories, webhook subscription/delivery repositories, origin settings, media metadata/transform registry, and analytics buffer. In-memory implementations remain excellent test doubles and are acceptable for explicitly local-only walking skeletons; they are not acceptable as invisible production defaults for user-visible or security-sensitive state.

Several boot operations are started asynchronously and their failures are logged or swallowed. The process can therefore become reachable while a schema/data-module initialization, seed, or derived-index rebuild has failed. In the same composition, an analytics root key has a dev-only default and public analytics is wired with always-enabled stub configuration. These are disclosed gaps, but disclosure alone does not provide a safe runtime contract.

**Correction (2026-07-15 `/audit-work` finding B-01, three-auditor batch):** an earlier draft of this ADR claimed `sharp` was "explicitly not installed," citing it as a Phase-0 containment example. That claim is false as of this ADR's own 2026-07-13 date — `sharp` was added as a pinned dependency on 2026-07-11 (two days earlier) and loads successfully; `src/media/image-transformer.sharp.ts`'s adapter already reflects this. The stale claim (and a matching stale comment in `src/server/deps.ts`) has been corrected. This does not change the Phase-0 decision below — a real dependency still needs its native-binary install, resource limits, and integration tests verified before its routes are trusted in production mode — only the premise that it is *absent*.

Finally, the repository has focused boundary canaries and extensive tests, but no repository-wide, CI-enforced import policy. The documented rule that features must not depend on server/framework code is consequently a convention rather than a release gate. A few `INFO.md` files also lag code and ADR evolution, weakening their value as navigation and decision records.

Doing nothing gradually converts a well-designed modular monolith into a boot-time service locator with implicit feature states. The first restart, failed initialization, or new cross-feature integration will then reveal state loss or ordering defects after users encounter them.

## Decision

Adopt a staged **production-readiness and composition-hardening program**. A capability is either explicitly local/experimental and unavailable outside that mode, or it meets a defined durability, readiness, security, observability, and integration-test contract before its routes or workers are enabled in production mode.

The program has four ordered workstreams:

1. Establish runtime modes and a capability inventory; contain incomplete capabilities before adding new behavior.
2. Make stateful, externally visible capabilities durable and make async work restart-safe.
3. Replace the two growing composition roots with typed feature-module bootstraps and explicit readiness/lifecycle handling.
4. Enforce architectural boundaries and documentation freshness in CI.

**Pattern(s) selected:** modular monolith + vertical feature modules + ports/adapters + transactional outbox + explicit readiness lifecycle + static dependency rules.

## Debate Fold-In (2026-07-16)

A 2-round Swarm Consensus debate (Primary + agy/Gemini 3.1 Pro + Codex gpt-5.6-terra, plus two Fable subagent adversarial-review additions requested mid-debate specifically to stress-test convergence rather than let it stand unchallenged) unanimously confirmed Candidate A (this staged program) over three alternatives: a general DI container (rejected — would be the first framework-level abstraction shift across 46 prior accepted decisions, for a problem that doesn't need it), a process/service split (rejected — solves a scaling problem this single-node SQLite product doesn't have), and continued feature-by-feature patching (rejected — the observed status quo, and the direct cause of the composition-root fragility this ADR exists to fix). Full record: `reports/swarm-consensus/runs/20260716T-adr046-production-readiness-consensus-report.md`.

The debate also surfaced concrete, code-verified findings that amend the plan below rather than its overall shape:

1. **The outbox transaction fix is not a routine adapter task.** `src/core/commands/command.ts`'s BR-04 explicitly documents outbox enqueue as OUTSIDE the domain-write transaction today ("an enqueue failure propagates but never rolls back the committed change set"). Phase 1's "write domain state and outbox rows in the same database transaction" therefore requires its own resolved design decision before implementation starts — pick one: amend BR-04 itself, make enqueue repo-owned inside the existing chokepoint transaction, or thread an explicit transaction handle through `OutboxPort`. Do this as a small, bounded design note, not as part of routine Phase 1 coding.
2. **Outbox durability is demand-paged, with a named trigger: activation of the first production SMTP mailer adapter** — not "webhooks," not strict-serial-behind-the-full-inventory, not immediately in parallel. Investigation found the outbox currently backs no user-critical production consumer (`ConsoleMailerAdapter` in `deps.ts` is a stub); the two live mailer-egress paths have opposite needs — members' magic-link email is interactive and correctly loss-tolerant by direct-send design (confirmed via the code's own comments, which even pre-planned an eventual outbox migration), while forms' lead-notification path is the one that genuinely needs durability and is already outbox-shaped (`notify-subscriber.ts` is a bus subscriber; swapping `InMemoryOutbox` for a durable SQLite outbox needs zero subscriber changes). The durable outbox must exist by the time a real SMTP adapter ships, not before, not indefinitely after.
3. **The Phase-0 enforcement mechanism must be a purpose-scoped port-seam gate, not a constructor-level registry.** A constructor-gated "durable path ready?" check cannot discriminate between mailer call sites — verified: both `src/members/write-service.ts` and `src/forms/notify-subscriber.ts` tag their sends with the identical `purpose: "transactional"`, so a purpose-keyed gate as originally conceived cannot tell the interactive lane (should pass direct) from the notification lane (should be gated on the durable outbox existing) apart. Fix: gate at a `MailerPort` decorator/seam, keyed per-send on a split purpose vocabulary (or `sourceContext.module`), built in Phase 0.5 while there is exactly one real adapter to migrate against. Keep the CI import-rule idea from Phase 4 for the separate problems of dormant/parked send code (newsletter) and bare adapter construction outside factories — it's necessary, just not sufficient alone.
4. **Phase 1's capability-durability table is pull-based per capability, not a uniform sweep.** Several rows (webhooks, media, analytics) back walking-skeleton features from auto-drafted overnight-sweep ADRs with no shipping commitment yet. Schedule each row's durability work when that capability is actually decided to ship, not on a fixed program timeline — Phase 0 containment (fail-closed defaults, in-memory adapters demoted to explicit local/test-only) already delivers most of the safety value cheaply and immediately.
5. **Fold in as a named Phase-1 pre-requisite for webhooks specifically:** `src/integrations/repo.sqlite.ts`'s `enqueue()` inserts `payload_json: null`, with a separate later `save()` call `.update()`-ing it in — already self-disclosed in-code as GAP-05/GAP-12, but not previously connected to production-readiness blocking status. A crash between the two writes leaves a claimable delivery with no envelope. Make the insert-and-envelope-write atomic, or write the envelope at enqueue time, before webhooks are enabled in production.
6. **Analytics caution for Phase 0's capability inventory:** `LocalBufferSink.capabilities()` returns `durable: true` despite being explicitly process-only (the scoping is disclosed only in a doc comment, not the type). Whoever builds the Phase 0 inventory must not trust this flag at face value.
7. **Move `dependency-cruiser`'s report-only baseline to run alongside Phase 0**, not after Phase 3 as originally sequenced — it's cheap, independent of everything else, and most valuable exactly during the period of heaviest composition-root churn. The blocking-mode escalation can still wait until after Phase 3.
8. **During Phase 3's composition-root migration window, mandate git-worktree isolation for any concurrent agent work touching composition files.** Motivated by an observed same-evening incident (a background agent's mid-edit of `deps.ts` broke `tsc` repo-wide for the rest of the session) — but the debate also corrected the anecdote's original use: it's evidence for workspace hygiene during concurrent editing, not evidence for the composition-root split itself, and Phase 3's own migration period (dual paths behind a stability façade) will temporarily *increase* the number of composition files concurrent agents touch, briefly amplifying the same failure mode unless this mitigation is in place.

### BR-04 Resolution (2026-07-16, item 1's follow-up debate)

Fold-in item 1 above named this as a required pre-Phase-1 design note. A dedicated 2-round Swarm Consensus debate (Primary + agy/Gemini 3.1 Pro + Codex gpt-5.6-terra + Fable, full 4/4 convergence — full record: `reports/swarm-consensus/runs/20260716T-br04-outbox-seam-consensus-report.md`) resolved it:

**`ChangeSetRepoPort.insert()` gains an optional third argument, `event?: DomainEvent`.** `SqliteChangeSetRepo.insert()` co-persists it as a durable outbox row inside the same synchronous `db.transaction()` callback already used for the header + items; `InMemoryChangeSetRepo.insert()` forwards it to the injected event bus unchanged. `executeCommand()` passes its `change-set.applied` event through this new argument instead of calling `deps.outbox.enqueue()` separately. Decided by a verified, codebase-specific technical fact that eliminated the two more general-looking alternatives: Drizzle's better-sqlite3 `transaction<T>(fn: (tx) => T): T` is fully synchronous, while both `OutboxPort.enqueue()` and `ChangeSetRepoPort.insert()` are `Promise<void>` — an async transaction handle (thread it through every port) or a coordinator enclosing the async domain write (`mutation.execute()`) are both unbuildable under the current driver without an unsafe held-open transaction or a new, zero-consumer abstraction.

**Two disclosed, deliberate scope limits — do not let a future reader assume either is silently solved:**
1. This does **not** bring `mutation.execute()` (the actual domain write) inside the transaction. BR-04's compensating-rollback carve-out narrows (one fewer failure path) but persists until Phase 3 gives domain writes a shared transaction-participating boundary. Phase 1's "domain state and outbox rows in the same database transaction" wording is not fully satisfied by this resolution — read it as satisfied for the change-set/outbox pairing specifically, not literally.
2. This resolves exactly one producer (`executeCommand()`'s `change-set.applied` event). The debate's own repo-wide grep found 12 other files calling `OutboxPort.enqueue()` directly and unaddressed by this fix: `features/post/post.ts`, `forms/submit-service.ts`, `features/entries/write-service.ts` (×3 call sites), `features/workspace/create.ts`, `features/taxonomy/write-service.ts`, `features/content-types/lifecycle.ts`, `navigation/menu-service.ts`, `integrations/delivery.ts`, `redirects/phase-handler.ts`, `redirects/redirects.ts`, `newsletter/send-pipeline.ts`. Each is its own future, individually-pulled Phase 1 durability slice per fold-in item 4's pull-based sequencing — applying this same adapter-owned co-persistence pattern locally when that producer's durability is actually prioritized, not a mandate to fix all of them now.

No live outbox path exists to retrofit — `src/core/events/memory-bus.ts` is the only current `OutboxPort` implementation, and no outbox table exists in `infra/db/schema.ts` yet. This resolution's SQLite half is born together with the durable-outbox table migration itself, as part of the Outbox Phase-1 slice — not a rewiring of something already shipping.

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: FOLLOWS.
- Notes: the decision narrows composition and makes existing I/O seams executable. It deliberately does not introduce service boundaries, a generic plugin runtime, or a dependency-injection container.

## Rationale

- Driver: restart safety and user trust → externally visible state must be durable or the capability must be unavailable outside local/experimental mode.
- Driver: a growing number of independently booted features → readiness must be explicit; a listening HTTP port cannot imply that required dependencies succeeded.
- Driver: increasing route and cross-feature count → composition must describe dependencies and route precedence rather than rely on a hand-maintained sequence in one file.
- Driver: ports/adapters are a stated architectural invariant → import direction must fail CI when violated, not depend solely on review discipline.
- Driver: current test culture is strong → use restart, fault-injection, and contract tests to turn the remediation into measurable behavior rather than documentation intent.

## Pattern Evaluation

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---|---|---|---|---|---|---|---|
| Harden the modular monolith with feature bootstraps, durable adapters, readiness, and CI rules | Strong fit | High | measured repository evidence | Preserves existing boundaries and deployment model; incremental; directly closes observed gaps | Requires disciplined migration and temporary dual paths | More explicit boot contracts in exchange for reliable activation | **SELECTED** |
| Keep the current composition roots and fix gaps feature-by-feature | Weak fit | Low | measured repository evidence | Lowest immediate code churn | Repeats route ordering, readiness, and cross-feature wiring mistakes | Short-term convenience compounds coupling | Rejected |
| Introduce a general dependency-injection container | Viable fit | Medium | analogical | Can centralize object construction | Adds hidden resolution, a new framework concern, and does not solve durability/readiness | Less boilerplate at the cost of less explicit composition | Rejected |
| Split features into microservices | Rejected | Medium | analogical | Independent process deployment and scaling | Distributed transactions, queues, deployment, and observability are disproportionate to the current product | Solves a different scale problem while increasing operational risk | Rejected |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| modifiability | Safe feature change cost | 4 | measured | Modules own their boot and routes | Shared migration work initially | Removes composition-root edits from most feature work | Feature boundaries remain stable | always-on | Architecture owner; CI import rules; before next two feature launches | A feature again edits unrelated module boot code | +2 |
| modularity | Independence of components | 4 | measured | Existing ports/slices are retained | Some current cross-feature glue is central | Explicit capability dependencies replace ad hoc wiring | Events remain the async integration path | always-on | Module bootstrap contract; phase 3 | New direct feature-to-feature private import | +2 |
| scalability | Ability to handle more load/features | 3 | assumed | Durable outbox permits safe retry | SQLite/single-process remains a deployment limit | Fixes correctness before horizontal scale | Single-node remains target | always-on | Reassess at multi-process/tenant demand | Multiple server processes or queue demand | +1 |
| reliability | Restart and failure correctness | 2 | measured | Existing adapter seams and tests help | In-memory production state and best-effort boot are unsafe | Highest-priority remediation axis | Existing SQLite layer can host the required records | always-on | Platform owner; phase 2 restart gates; production enablement blocked until complete | Any state loss or unready module incident | +2 |
| security | Safe default operation | 2 | measured | Authz, egress, and keyring designs exist | Dev defaults and incomplete capabilities can become reachable | Unsafe defaults must be mode-gated and fail closed | Runtime mode can be explicit | always-on | Security owner; phase 1 production-mode tests; no external deployment before pass | Non-local deployment or new public/egress route | +2 |
| operability | Diagnose/control a running system | 2 | measured | Comments identify gaps | No authoritative readiness or module status surface | Operators need a trustworthy readiness contract | Structured logging is available | always-on | Platform owner; phase 3 readiness endpoint and lifecycle signals | Startup failure is discovered only by route traffic | +2 |
| cost | Implementation and operating cost | 4 | analogical | Reuses SQLite, Express, and existing test stack | Migration time is non-trivial | Avoids service and broker cost | Single-process remains supported | always-on | Keep no-new-runtime-infrastructure default | Persistent queue or multi-node requirement | +1 |
| testability | Ability to prove behavior | 5 | measured | Existing ports, test doubles, contract suites | Current boot lifecycle is hard to assert | Explicit lifecycle makes failures testable | Test harness can start/restart SQLite app | always-on | TDD owner; required test matrix per phase | New module lacks restart/readiness test | +1 |

Scores of 2 require the mitigations in the next sections before production enablement.

## Required Remediation Work

### Phase 0 — Capability inventory and containment

Before persistence or refactoring changes, create a checked-in capability inventory. For every route family, public worker, and scheduled/background capability, record:

- owner module and public API/event contracts;
- runtime classification: `production`, `local-only`, or `experimental`;
- source of truth and persistence adapter;
- readiness dependencies and startup criticality;
- security dependencies (authentication, authorization, egress, secrets);
- restart, migration, and rollback test owner.

Containment requirements:

- Introduce an explicit runtime mode with safe defaults. Production mode must reject dev-only keys, localhost/dev egress allowances, always-enabled analytics stubs, and missing required adapters. Do not infer safety solely from `NODE_ENV`.
- A capability without its durable adapter must not expose production routes, start a worker, or advertise itself as available. Local/experimental routes must clearly identify their mode in response metadata and readiness output.
- Keep the current in-memory implementations as hermetic test/local adapters. Do not silently substitute them in the persistent composition.
- Do not activate webhook delivery in production until its complete durable path is delivered: subscriptions, delivery state, original event payload/replay source, idempotency key, guarded HTTP client, egress policy, worker lifecycle, and observability.
- `sharp` is installed and pinned (`package.json`, corrected 2026-07-15 — see Context). Treat its *readiness*, not its presence, as the capability gate: verify the native binary installs cleanly, resource limits are set, and integration tests pass, before registering transform-generating routes in production mode.

### Phase 1 — Durable capability baseline

Implement only the durable adapters required by the capability inventory, in dependency order. Each adapter must have a memory/test counterpart and a shared contract suite.

| Capability | Required production behavior | Detailed fix | Production gate |
|---|---|---|---|
| Outbox | Events survive process restart and are delivered at least once | Add a SQLite outbox adapter; write domain state and outbox rows in the same database transaction; claim rows atomically; retain attempts/error/next-attempt state; make consumers idempotent | Crash/restart tests prove no committed event is lost and duplicate delivery is safe |
| Change sets | User-visible mutation history survives restart | Add a SQLite adapter and transaction participation; migrate existing local semantics without changing route contracts | Restart and revert integration tests |
| Webhooks | Subscriptions and delayed deliveries are durable, replayable, and safe | SQLite adapters for subscription/delivery; persist a canonical delivery payload or durable event reference; unique `(subscription_id,event_id)` idempotency; worker starts only after readiness; use the guarded `HttpClientPort` + origin egress oracle | Local controlled receiver proves signing, retry/backoff, restart resume, and SSRF denial |
| Members | Membership, tiers, subscriptions, sessions, magic links, and consent retain their documented lifecycle | Complete the SQLite adapter set or disable the affected public/admin member routes outside local mode | Restart + expiration + auth integration tests |
| Origin registry | Egress/redirect policy is durable and auditable | Persist verified origin/allowlist configuration; retain fail-closed behavior when unavailable | Restart and hostile-origin tests |
| Media metadata and transform registry | Rows and immutable transform versions match durable bytes | Add SQLite adapters, transactional metadata updates, and a durable transform registry; retain local filesystem blob store behind its port | Restart, rendition, and purge/recovery tests |
| Analytics | Retention and loss semantics are explicit | Either add a durable sink before exposing historical/admin reads, or label it best-effort/local and disable those claims in production | Mode-specific API and restart tests |

The EventBusPort may remain process-local. It is a dispatcher, not a durable queue; durability belongs to the outbox and each consumer's idempotent state. Do not create a database-backed event bus merely to make an in-process notification abstraction look persistent.

**Phase 1 status (2026-07-16): all seven rows complete.** Despite fold-in item 4's pull-based/demand-paged sequencing guidance, every row above was pulled and closed in one continuous session, each behind its own SPEC and shared contract-test suite, each independently restart-tested: Change sets (SPEC-023) → Outbox (SPEC-024, includes the BR-04-resolution co-persistence above) → Members (SPEC-025, all 6 adapters pre-existed, only needed wiring) → Webhooks (SPEC-026, both adapters pre-existed; also closed the GAP-05/GAP-12 payload-atomicity pre-requisite named in fold-in item 5) → Origin registry (SPEC-027, new adapter) → Media metadata/transform registry (SPEC-028, new adapter, largest slice) → Analytics (SPEC-029, new adapter; also fixed `LocalBufferSink.capabilities().durable`'s misreport, closing this table's own "Analytics" gate literally as worded — "explicit... or disable those claims" — by making the claim true instead). `capability-inventory.ts` reflects `hasDurableAdapter: true` for all seven. `BlobGcJournalRepoPort` (media) and `MemberConsentRepoPort`'s write path (members) remain deliberately unwired — disclosed in their respective SPECs as no live composition-root consumer exists for either yet, not a gap in this table's scope.

### Phase 2 — Explicit boot, readiness, and shutdown lifecycle

Replace fire-and-forget initialization with a boot contract that distinguishes **critical**, **optional**, and **local-only** capabilities.

- Make server bootstrap asynchronous. `bootServer()`/`createProductionServer()` awaits all critical initialization before binding the listening socket.
- Keep test app construction lightweight by allowing an explicitly supplied, already-ready dependency set. Tests must never accidentally exercise production defaults.
- Every module reports a typed lifecycle result: `ready`, `disabled`, or `failed`, with owner, reason code, dependency, and remediation hint.
- `/healthz` means process liveness only. `/readyz` means all critical modules are ready. Expose a restricted admin/module-status view for non-critical disabled modules; never leak secrets or internal paths.
- Optional modules that fail initialization must not bind routes or start workers. Their APIs return a stable `CAPABILITY_UNAVAILABLE` only where a route must remain for compatibility.
- Worker start/stop handles belong to bootstrap/shutdown, not route modules. Shutdown stops claims, waits for in-flight work within a bounded timeout, and emits a final structured result.
- Replace swallowed startup failures with structured logs/metrics and the lifecycle result. A failed critical migration/data module blocks readiness; a failed optional one disables only that owned module.
- **Partial-boot rollback (2026-07-15 `/audit-work` finding, Codex GPT-5.6-terra, high; refined round-2, same auditor):** boot is two-stage. `prepare` may acquire only reversible resources and must not start external work (workers, subscriptions, listeners). Only after every critical module reports `prepare` success does bootstrap call `start` on each, in dependency order. If any critical module's `prepare` or `start` fails, bootstrap invokes idempotent `stop` on every module that already **completed** `prepare`/`start`, in reverse dependency order, waits for completion, and never binds routes or the listening socket. **Round-2 correction:** the completed-only stop condition above leaves one path open — a module whose `prepare` itself acquires a reversible resource and then throws *before returning* is neither "completed" (so bootstrap's reverse-cleanup loop skips it) nor self-cleaning (nothing required it to). Each module's `prepare` implementation MUST be responsible for its own atomic cleanup on its own failure path (acquire-then-release-on-throw, e.g. `try/catch` releasing whatever it acquired before rethrowing) — bootstrap's reverse-order `stop` loop and each module's internal prepare-failure self-cleanup are two independent, both-mandatory halves of the same guarantee, not one substituting for the other. Without both, an unready process could still retain an earlier module's started worker, acquired resource, or a later module's own mid-prepare resource — the ADR's own "no state loss, no silent partial availability" goal would not hold at the boot boundary itself. The required boot test matrix (below) must include two fault-injection cases: (a) a later critical module's `start` fails after an earlier module fully completed, asserting the earlier module's `stop` is called in reverse order; and (b) a critical module's own `prepare` fails partway through, asserting that module leaves no resource of its own acquired.

**Phase 2 status (2026-07-16): complete (SPEC-030).** `src/server/boot-lifecycle.ts` implements the two-stage `prepare`/`start` contract with reverse-order rollback exactly as specified above, including both required fault-injection cases (verified against fakes in `boot-lifecycle.unit.test.ts`). `index.ts`'s `main()` now builds 4 concrete `BootModule`s — `settings`/`seo` (critical; these two promises had NO `.catch()` anywhere in their chain before this change, an unhandled-rejection risk, not merely an unawaited one) and `newsletter`/`store-plugin` (optional, matching their pre-existing log-and-continue behavior) — and `process.exit(1)`s cleanly on a critical failure before `app.listen()` binds, in every runtime mode (not gated behind `resolveRuntimeMode()`, since this fixes a universal correctness defect, not a production-only safety default). `GET /healthz` (liveness) and `GET /readyz` (aggregate critical readiness, 503 with a minimized failures list on refusal) are live; `GET /api/admin/v1/workspaces/:workspaceId/system/module-status` (new `system.read` permission) exposes the full per-module detail behind admin auth. Scoped deliberately narrow: no per-feature `src/server/modules/*` split (that's Phase 3), no real background interval worker (none exists in this codebase yet — see SPEC-030's Non-Goals), no `SIGTERM` shutdown wiring (nothing long-lived to drain yet). `menuBindingsReady` (`deps.ts`) stays outside the typed lifecycle — not exposed on `RouteDeps` today, and its existing self-swallow-and-log behavior already matches what an "optional" module's failure would report.

### Phase 3 — Feature-owned server composition

Split `src/server/app.ts` and `src/server/deps.ts` by feature ownership without adding a container.

Create an internal `src/server/modules/` convention. Each module has a small, typed bootstrap that receives only the dependencies it needs and returns route registration, readiness, and shutdown participation. Its immediate consumers are the existing core/content module plus at least two feature modules, satisfying the rule-of-two for this application-level convention.

```text
src/server/
  bootstrap.ts                 # composes explicit modules; awaits critical readiness
  modules/
    core.ts                    # health, auth middleware, shared HTTP setup
    content.ts                 # posts/pages/site rendering
    forms.ts                   # forms routes + owned subscriptions
    integrations.ts            # webhook routes, fan-out, delivery worker
    media.ts                   # media routes + transformer lifecycle
    ...
  readiness.ts                 # lifecycle status aggregation only
```

Rules for the convention:

- Modules receive narrow typed dependencies, never a mutable universal `RouteDeps` service locator.
- A module owns its routes, workers, subscriptions, and readiness dependencies. The composition root may select its concrete adapters but does not contain its business dispatch.
- Cross-feature integration is owned by the consuming module. Move the Forms-to-webhook fan-out from `createApp()` into Integrations' event subscriber, subscribed through the existing event abstraction. The Forms module emits its domain event only.
- Public route precedence is declared by route class (`fixed-public`, `parameterized-public`, `catch-all`) and validated during registration. `/:slug` remains last by rule, not by a fragile comment.
- A feature may only depend on another feature's public contract/index or event, never a private repository/service implementation.

**Phase 3 status (2026-07-16): first slice complete (SPEC-031); NOT fully migrated — disclosed, intentional.** Given this phase's own "highest-risk" framing and fold-in item 8's concurrent-edit incident, this was pulled as a deliberately minimal first slice rather than a big-bang rewrite: the `ServerModuleHandle` convention now exists (`src/server/modules/types.ts`) with exactly 3 real consumers — `core.ts` (health/readyz routes), `forms.ts` (C-009 notify subscriber only), `integrations.ts` (the Forms-to-webhook fan-out subscriber, moved out of `createApp()` verbatim as this section's own bullet names) — satisfying the "core/content module plus at least two feature modules" bar above. `bootstrap.ts` now holds the Phase-2 boot-module list construction, relocated out of the untested `index.ts` for unit-testability. Verified as a pure refactor: full test suite unchanged, live smoke test byte-identical before/after. **Still owed, explicitly**: the ~60 remaining `app.ts` route registrations, `requireAdminSession` relocation, any `deps.ts` split, `content.ts`/`media.ts` modules, and the route-class precedence validation bullet above (still enforced only by the `/:slug`-last comment, not structurally). SPEC-031's own Non-Goals section is the authoritative list — pull the rest demand-paged, per fold-in item 4's established philosophy, not on a fixed timeline.
- Do not introduce a generic IoC container, reflection, or runtime service lookup. Bootstrap stays ordinary typed TypeScript.

### Phase 4 — Architecture fitness and documentation gates

Add `dependency-cruiser` to CI with a small, reviewable rules file. Start in report-only mode for one baseline, then make new violations blocking. Required rules:

- `src/core/**` cannot import `src/server/**`, `apps/**`, feature modules, or concrete infrastructure adapters.
- Feature/domain code cannot import Express, route handlers, admin-app code, or direct database/SDK implementations.
- Only bootstrap/composition modules may construct concrete adapters or select production implementations.
- Features cannot import another feature's private path; public contracts are imported through that feature's explicit public surface.
- Test-only modules cannot be imported by production modules.
- Cycles across module roots are forbidden; approved temporary exceptions have an owner and expiry date.

Complement the static rules with structural tests for the composition conventions and route-order validation. The current HTTP import-boundary canary remains; this phase broadens the safety net rather than replacing focused tests.

Documentation gates:

- Every capability inventory change updates its `INFO.md` and, when a decision changes, the corresponding ADR/index.
- Add a CI check that fails when a file declares a known production gap while the composition selects the supposedly missing production adapter, or vice versa. The first version may be a narrow, explicit registry rather than brittle natural-language parsing.
- Each module status page links its owning ADR/spec and reports whether the capability is production-ready, local-only, or experimental.

**Phase 4 status (2026-07-16): genuinely blocked — decision note, not an implementation gap.** Verified: no `.github/workflows/` directory or any other CI configuration exists anywhere in this repository. "Add `dependency-cruiser` to CI" has no CI to add it to. This is not a scoping choice or something to work around — installing `dependency-cruiser` and writing its rules file without a pipeline to run it in would produce dead configuration nobody enforces, silently regressing to false confidence (the opposite of this phase's own goal). Fold-in item 7's "move `dependency-cruiser`'s report-only baseline to run alongside Phase 0`" is retroactively equally blocked for the same reason. Unblocking this is an infrastructure decision (which CI provider, hosted vs. self-run) outside this ADR's scope — record it as owed, do not attempt a partial implementation. The `src/server/modules/*` convention (Phase 3) and the boot-lifecycle/readiness conventions (Phase 2) already give a future `dependency-cruiser` config real rules to enforce whenever CI exists.

## API / Event Contract Summary

The remediation preserves existing public route and domain-event names unless a phase spec explicitly approves a versioned change.

New internal contracts:

- `ModuleLifecycleStatus`: `{ module, state: "ready" | "disabled" | "failed", critical, code, detail? }`.
- `ServerModule`: internal bootstrap convention with typed `prepare`, `register`, optional `start`, and optional `stop` responsibilities. It is not exported as a domain port.
- `CAPABILITY_UNAVAILABLE`: stable HTTP error for retained compatibility routes whose non-critical module is disabled. No route should return this for a capability classified `production`.
- Outbox delivery remains **at least once**. Consumers must own idempotency; this ADR does not promise exactly-once delivery.

## Required Test Matrix

Every phase spec must map acceptance criteria to these tests before implementation:

| Concern | Required proof |
|---|---|
| Persistence | Write state, terminate/recreate the production composition, and prove the state and required indexes remain available. |
| Outbox | Simulate a crash after transaction commit and before delivery; event is delivered after restart. Simulate delivery twice; consumer state is idempotent. |
| Boot | Critical initialization failure prevents readiness/listening; optional failure disables only the owned module and is visible in module status. |
| Routes | Existing authorized route behavior stays compatible; disabled optional capabilities have deliberate behavior; `/:slug` cannot shadow fixed public routes. |
| Security | Production mode rejects dev keys/defaults, incomplete egress policy, unguarded HTTP clients, and uninstalled mandatory media transform dependencies. |
| Webhooks | Controlled receiver verifies HMAC, payload replay, retry, dead-letter transition, restart resume, and egress deny cases. |
| Boundaries | CI rule fixtures prove prohibited imports/cycles fail and permitted public contracts pass. |
| Documentation | Inventory, module status, `INFO.md`, and ADR references agree for each remediated module. |

## Migration Safety

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | Add SQLite tables/adapters and read paths first; retain existing in-memory adapters only for local/test composition; remove production selection only after verification | Phase owner |
| Dual-write or read-routing plan | Where existing persisted data exists, write new durable store and read with explicit fallback during a bounded migration; no silent memory fallback in production | Phase owner |
| Backfill plan | Idempotent, versioned migrations with a dry-run count and recorded completion marker | Database owner |
| Reconciliation checks | Compare record counts, keys, status distribution, and sampled payload hashes before cutover | QA/Test owner |
| Observability proving phase health | Module lifecycle events, migration outcome, outbox backlog/attempts, disabled-module count, and worker state | Platform owner |
| Rollback test | Revert read routing before destructive cleanup; restore from SQLite backup for migration failure; test both paths | Database owner |
| Cutover approval and timing | Human approval after phase-specific test matrix and red-team gates pass; one capability family per release | Product/technical owner |
| Point of no return | Removing old read compatibility or enabling a previously local-only external worker | Human approver |
| Post-cutover verification | Cold restart, readiness, route smoke test, reconciliation, and error/backlog review | Release owner |

## Consequences

**Positive:**

- A server can no longer look healthy while critical state or initialization is missing.
- Restart behavior becomes an explicit product contract for user-visible capabilities.
- Feature work stops expanding a single central composition file at the same rate as route count.
- Existing ports, adapters, and contract tests gain a consistent production-selection policy.
- Import direction is continuously enforced and architecture drift becomes visible before merge.

**Negative / Tradeoffs:**

- Some currently visible walking-skeleton features will be disabled in production mode until their durable path exists.
- Feature bootstrap code adds a small amount of explicit structure and lifecycle tests.
- Migration work slows net-new feature throughput temporarily.
- SQLite remains a deliberate single-node constraint; this ADR makes it reliable, not horizontally scalable.

**Risks:**

- Risk: a broad persistence sweep becomes a rewrite. Mitigation: one capability family per phase; require the inventory and migration-safety table before code.
- Risk: static rules create excessive friction. Mitigation: baseline once, add narrow rules, require expiry for exceptions, and measure false positives.
- Risk: readiness gates cause deployment failures. Mitigation: distinguish critical/optional ownership, test failure injection, and provide operator-visible reason codes.
- Risk: dual-write introduces divergence. Mitigation: use bounded cutovers, reconciliation checks, and make the new database write transactional where possible.

## Mitigations Required

| Weak axis | Mitigation | Owner | Enforcement | Deadline or trigger |
|---|---|---|---|---|
| reliability | Durable outbox and user-visible state, with restart tests | Phase owners | Production capability gate | Before enabling each capability outside local mode |
| security | Explicit runtime mode; reject unsafe defaults/incomplete egress and media paths | Security + platform owners | Production boot test and release checklist | Before any non-local deployment |
| operability | `/readyz`, module status, worker lifecycle, structured boot outcomes | Platform owner | Integration tests + operational smoke test | Before first phase cutover |

## Re-evaluation Triggers

- Calendar trigger: review this ADR quarterly until all capabilities are classified and production selections are durable.
- Scale trigger: more than one server process, a queue/broker adoption, or sustained worker backlog requires a new topology/outbox ADR.
- Topology trigger: introducing PostgreSQL, cloud object storage, remote worker execution, or a non-local deployment target.
- Dependency trigger: an upgrade/removal of Express, Drizzle, SQLite driver, dependency-cruiser, or the chosen image transformer that changes lifecycle or analysis behavior.

## Enforcement

- No implementation begins without a phase spec, certified TDD tests, migration-safety plan, and named owner.
- CI runs typecheck, test suites, adapter contract suites, dependency-cruiser, structural route-order tests, and documentation/inventory consistency checks.
- Code review treats a production in-memory adapter selection, unawaited critical bootstrap, direct forbidden import, or unclassified new route/worker as a blocking architecture finding.
- Release review requires a cold-restart readiness test and module-status review for every capability changed in the release.

## Complexity Justification

*Empty: no Constitution Check exceptions. The module lifecycle is justified by current multiple feature consumers and directly replaces duplicated/implicit boot behavior; it is not a speculative platform abstraction.*

## Related Decisions

- Relates to: ADR-006 (ports rule of two), ADR-007 (workspace scoping), ADR-009 (hybrid decoupling), ADR-015 (Drizzle behind ports), ADR-027 (media), ADR-030 (members), ADR-035 (analytics), ADR-036 (integrations), ADR-038 (HTTP egress), ADR-040 (origin registry), ADR-042 (structural debt remediation).
- Does not supersede: ADR-042. ADR-042 remains a narrower graph-audit remediation record; this ADR establishes the production-readiness program and its gates.
