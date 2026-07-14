# ADR-PIPE-011: Newsletter — Implementation Architecture

- Status: ACCEPTED 2026-07-13 (human approval: Leona Burime, blanket approval across ADR-PIPE-008..015; Red-Team has NOT run for SPEC-011 — accepted with that acknowledged gap; the `declareDataModule()` mechanism is spike-quality code now load-bearing — the required failure/rollback test against Newsletter's real 5-table manifest is a hard precondition, not optional, before any non-dev deploy)
- Date: 2026-07-13
- Spec: SPEC-011 v1.0.0 (hash: sha256:dc29d67a0df612ed7ba71a36b40279eb3dfb934c3d91e8538fa429cb4eb5a583)
- Author: Software Architect Agent

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No custom crypto/mail-transport/URL-parsing/queue is introduced. Reuses `KeyringPort.derive()` (unsubscribe token), `MailerPort`/`OutboundEmail` (ADR-037), `OriginRegistryPort.canonicalOrigin` (ADR-040), and the generic `processOutbox`/`OutboxPort`/`EventBusPort` claim/publish loop (`src/core/events/outbox-worker.ts`) exactly as-is. No new library evaluated or rejected. |
| II — Test-First | COMPLIES | No implementation exists beyond `src/newsletter/ports.ts`/`types.ts` interface/type stubs. TDD Agent certifies failing tests from SPEC-011's ACs/INVs/ECs/behavior rules before Programmer writes any adapter/route/UI code. |
| III — Simplicity Gate | COMPLIES | Every module below traces to a named REQ (see Module/Service Boundaries). No speculative generality: the `HttpApiMailerAdapter`, open/click analytics, A/B testing, segmentation, and the general ADR-023 dataModule engine are explicitly NOT built here (spec Out-of-Scope + this ADR's Migration Safety). |
| IV — Anti-Abstraction Gate | COMPLIES | No new ADR-006 rule-of-two port is introduced. `SubscriberDirectoryPort` stays the already-corrected single-evaluator typed dependency (ADR-034 Round-3 fold) implemented by the real `MembersSubscriberDirectory` — untouched by this ADR. This ADR adds one more typed dependency of the identical class — `MembersConsentCapability` (§ Rationale, Pattern Evaluation) — for the not-yet-built Members consent capability; it is declared the same way `SubscriberDirectoryPort` was (a single-evaluator seam into a sibling module, not a rule-of-two port), so it inherits that precedent's justification rather than opening a new one. `MailerPort`/`OriginRegistryPort`/`KeyringPort` are imported, already-decided seams (ADR-037/040/036), not re-declared. |
| V — Integration-First Testing | COMPLIES | Every P1 AC has an HTTP-route, cross-module (Members consent capability call, outbox worker fan-out), or DB-transaction boundary; traced in `traceability.spec.md` §1. |
| VI — Security-by-Default | COMPLIES | Every admin route is `authorize()`-gated with a specific `admin.newsletter.*` permission (REQ-25/AC-42); the two public endpoints (`CONFIRM_SUBSCRIPTION`/`UNSUBSCRIBE`) are deliberately unauthenticated by design (no session, no login, token-only — same class as the constitution's standing Art. VI local-dev-only exception, but here the "no auth" posture is a permanent, intentional property of a lawful one-click-unsubscribe surface, not a temporary dev gap) and are fail-closed on any token/signature/expiry/consent-revision mismatch. The Launch Readiness Gate (REQ-21/INV-05) is evaluated fresh at every `authorizeSend` call, never cached, never client-overridable (`SEND_CAMPAIGN` has no request body). |
| VII — Spec Integrity | COMPLIES | This ADR and every downstream artifact cite SPEC-011 v1.0.0, hash `sha256:dc29d67a0df612ed7ba71a36b40279eb3dfb934c3d91e8538fa429cb4eb5a583`. |
| VIII — Observability | COMPLIES | Every write emits a structured error (errors.spec.md registry) with `correlationId`; every state transition emits a workspace-scoped `newsletter.*` outbox event carrying `campaignId`/`sendId` correlation ids (feature.spec.md § Constitution Compliance, Art. VIII). `NEWSLETTER_LAUNCH_GATE_BLOCKED`'s `unmetPreconditions` array is itself an observability contract — an operator always sees every unmet precondition, never a fix-one-discover-the-next loop (behavior.spec.md §1.2). |

No unjustified EXCEPTION rows. Complexity Justification table is empty (see Rationale for why `MembersConsentCapability` does not require an entry there).

## Research Summary

- Research artifact: N/A — no library, framework, or persistence-mechanism choice is open. Persistence is Drizzle/SQLite (ADR-015) for the bespoke campaign table pair (see Decision §2); the `p_newsletter__*` own-tables ride the existing `declareDataModule()` mechanism (ADR-023, `src/features/plugins/data-module.ts`) already committed at the ADR-034 level. Mail/HTTP/origin/keyring primitives are ADR-037/038/040/036 — already decided, imported as-is. The one genuinely open implementation question — how the five `p_newsletter__*` tables actually get created given ADR-023's v1 "reject every dataModule declaration" disposition — is a reuse-vs-wait call resolved in Pattern Evaluation below, not a technology choice.
- Key decision: N/A (see above).

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS — provider-local validator `--phase preflight`, exit 0, run 2026-07-13 against spec hash `sha256:dc29d67a0df612ed7ba71a36b40279eb3dfb934c3d91e8538fa429cb4eb5a583` (re-verified by this agent as part of this dispatch; see Note below).
- Spec hash verified at: 2026-07-13 (provider-local validator, `--phase spec --update-hash`, per `pipeline-state.md`).
- Red-Team status and artifact: NOT STARTED per `pipeline-state.md` (`red_team_status: NOT STARTED`). Per this dispatch's explicit directive ("Produce the implementation ADR + implementation outline for the human-approved Newsletter spec... governed by already-ACCEPTED ADR-034. Translate the spec, don't re-debate"), this run proceeds on that directive. **Flagged, not silently assumed:** `pipeline-state.md`'s own `stage` field text ("Planning Preflight PASSED 2026-07-13 — awaiting human approval") is internally inconsistent with its `planning_preflight_status: NOT STARTED` field and its own "Next steps" note ("bring this spec package to the human for the approval checkpoint, then Coordinator Planning Preflight"). This agent independently re-ran the mechanical validator (`--phase preflight`, exit 0, see below) and confirmed `feature.spec.md`'s own `status: APPROVED`, zero `[NEEDS CLARIFICATION]` markers, and a completed Coordinator sign-off row in `spec-dod.md` — the spec package itself is mechanically and textually ready for Software Architect work regardless of the stale `pipeline-state.md` field. Recommend the Coordinator reconcile `pipeline-state.md`'s fields before the next stage (see Report).
- System Blueprint status and artifact: Not produced for this feature — no macro-topology change (Newsletter is a new feature module inside the existing modular-monolith admin server, consuming already-decided Tier-2 primitives; not a new service/deployment boundary).
- CodeBase Analyzer reports consumed: None formal; this ADR performed direct source inspection of `src/newsletter/{ports.ts,types.ts}`, `src/mail/{ports.ts,types.ts,index.ts}`, `src/members/{subscriber-directory.ts,INFO.md}`, `src/origin/{ports.ts,origin.ts}`, `src/integrations/ports.ts` (`KeyringPort`), `src/core/events/outbox-worker.ts`, `src/features/plugins/data-module.ts`, `src/features/post/post.ts`, `src/identity/permissions.ts`, `src/server/routes/admin/{members,menus}/*`, `src/server/routes/site/media-rendition.ts`, and `src/server/app.ts` to ground module boundaries and naming conventions in actual repo precedent, plus a repo-wide grep confirming zero call sites reference the stale `NEWSLETTER_PERMISSIONS`/`newsletter.*` strings outside `src/newsletter/types.ts` itself.
- Reverse-spec artifacts consumed: None (SPEC-011 is brownfield via `spec-manifest.md`'s Brownfield References section, not a reverse-spec extraction).
- Validator result or waiver: PASS, no waiver needed (python3 available; `validate_spec_package.py ADS-project-knowledge/specs/011-newsletter --phase preflight` → exit 0).

## Context

SPEC-011 needs to become buildable tasks. The architecture is already decided at the governance level — ADR-034 (ACCEPTED 2026-07-10, cleared a 3-round `/audit-work` gate) specifies the two-tier split (Tier-2 `MailerPort` + Tier-3 `plugins/newsletter`), the data model shape (campaign-as-entry + four own-tables, later a fifth per the Round-2 fold), the ports (`SubscriberDirectoryPort` demoted to single-evaluator dependency), the permission catalog, the event/hook vocabulary, and the outbox-driven send pipeline. This ADR does not re-litigate ADR-034; it does the work ADR-034 deliberately left to the Software Architect stage and that SPEC-011 explicitly flags as open implementation-planning decisions:

1. **Concrete module/file boundaries** inside this specific codebase, extending the real `src/newsletter/{ports.ts,types.ts}` stubs rather than inventing a parallel structure.
2. **The campaign storage-mechanism decision** SPEC-011's own Dependencies table names as unresolved: extend `src/features/post`'s bespoke-table pattern vs. a dedicated `dataModule` table — because no generalized `entries`/content-type-registry substrate exists in this repo (only the concrete `post` feature), ADR-034's original "campaign is a seeded `entries` content-type" design has no substrate to land on yet.
3. **The `p_newsletter__*` own-table creation-path decision** — ADR-034's own Round-3 fold states plainly that neither the ADR-023 reconciliation engine nor a fully specified first-party interim table-creation path exists today, and directs Software Architect to name/build one or wait for the engine.
4. **The Launch Readiness Gate (REQ-21) as an explicit, always-checked gate function** — the task's central ask, and the highest-risk contract in this ADR (see Quality Attribute Scorecard, Risks).
5. **The orchestration layer (audience freeze → outbox fan-out → completion) as a first-class contract**, not folded into a synchronous request/response shape — `orchestrator.spec.md` is genuinely present here (unlike SEO/Redirects/Forms), and this ADR's Module Map treats `NewsletterSendPipeline` as its own module, wired onto the existing generic outbox worker without forking it.
6. **A parallel delivery plan** so `/tasks` can safely mark slices `[P]`, and an explicit migration-safety statement for the one brownfield surface this feature touches today (the stale `NEWSLETTER_PERMISSIONS` constant).

## Decision

Adopt ADR-034's two-tier design (Tier-2 `MailerPort` already built as interfaces via ADR-037, Tier-3 `plugins/newsletter`) as the persistence and domain architecture for SPEC-011, implemented as an extended `src/newsletter/` feature module following this repo's established feature-module convention (mirrors `src/members/`, `src/features/settings/`). Campaign editorial state lands in a **new, bespoke Drizzle table pair** (`newsletter_campaigns` + `newsletter_campaign_revisions`) rather than a generalized `entries` substrate (which does not exist) or the ADR-023 `dataModule` path (reserved for genuinely relational, high-volume plugin data, not a single per-campaign editorial row). The five `p_newsletter__*` relational tables (lists, subscriptions, audience snapshots, sends, confirmation tokens) are created via the existing `declareDataModule()` snapshot-before-DDL mechanism (`src/features/plugins/data-module.ts`), invoked once at boot for Newsletter specifically as a first-party bundled plugin — per ADR-034's Round-3 fold citing sweep §A.2's sanction of first-party bundled execution through that path, distinct from the general third-party `dataModule` registration surface ADR-023 §12 still rejects in v1. The Launch Readiness Gate ships as one exported, always-evaluated pure-ish function (`evaluateLaunchGate`), called exactly once inside `authorizeSend`'s transaction — never a scattered set of if-checks. The send pipeline (`NewsletterSendPipeline`) rides the existing generic `processOutbox`/`EventBusPort` primitive by registering a bus subscriber for a new `newsletter.send.batch.claimed` event, not by forking a bespoke claim loop. `NEWSLETTER_PERMISSIONS` is renamed from the stale unprefixed `newsletter.*` strings to the frozen `admin.newsletter.*` convention — confirmed additive (zero existing call sites reference the old strings anywhere in `src/`).

**Pattern(s) selected:** Hexagonal ports-and-adapters at the persistence and cross-module boundaries (rule-of-two where it applies: none new — see Article IV note above), inside a modular-monolith feature module; an outbox-driven async orchestrator for the send pipeline (ADR-009 lineage, reusing the existing generic worker); a single write chokepoint per state family (campaign chokepoint, subscription/confirmation chokepoint, send-result chokepoint) mirroring ADR-022/028's discipline without depending on `entries` or the unbuilt `dataModule` engine.

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: FOLLOWS
- Notes: `src/newsletter/` is a vertical feature slice consistent with every existing feature module (`members`, `features/settings`, `features/post`). The hexagonal seams this ADR adds (`NewsletterCampaignRepoPort`-family persistence, the `MembersConsentCapability`/`SubscriberDirectoryPort` cross-module dependencies) are justified by real external I/O (DB, a sibling module's not-yet-built capability) exactly the way every other repo port is — not additional ceremony. The admin UI ships as a single flat `apps/admin/src/sections/Newsletter.tsx` file per the repo's established convention (`Members.tsx`, `Menus.tsx`, `Settings.tsx`), internally composed of the 9 `ui.spec.md` components, rather than a heavier nested-component tree the rest of `apps/admin` doesn't use.

## Rationale

Map the decision to the system drivers:
- **Driver: SPEC-011's own flagged storage-mechanism gap (no generalized `entries` substrate) must not block this feature indefinitely, nor invent a large speculative content-type-registry system** → addressed by treating `CampaignRecord` as a bespoke, Drizzle-authored table pair (`newsletter_campaigns`/`newsletter_campaign_revisions`) — the same "just build the concrete table" move `post` and `settings` already made, with an explicit revision table added (unlike `post`, which has no revisions) so REQ-06/INV-01's chokepoint+same-tx-revision requirement is met without waiting for a generalized substrate that isn't this feature's job to build.
- **Driver: ADR-034's own Round-3 fold names the `p_newsletter__*` table-creation path as a real, unresolved gap this ADR must close** → addressed by invoking the already-written `declareDataModule()` snapshot-before-DDL spike (`src/features/plugins/data-module.ts`) directly, scoped to Newsletter's own boot-time manifest only — not exposed as a general third-party plugin API. This is the "first-party interim table-creation path" ADR-034 asks Software Architect to name; it is not invented here, it is *named and wired*, since the mechanism's code already exists (see Risks — this code is explicitly labeled a "spike" and needs hardening scrutiny before this ADR's contracts are trusted at production scale).
- **Driver: REQ-21's Launch Readiness Gate must be one explicit, always-checked function, never scattered if-checks (task directive)** → addressed by `launch-gate.ts`'s single exported `evaluateLaunchGate()`, called exactly once inside `authorizeSend`'s transaction, evaluating and reporting all four preconditions every time (never short-circuiting), matching `behavior.spec.md` §1.2 exactly.
- **Driver: the orchestration layer must be a first-class contract, not folded into request/response** → addressed by `send-pipeline.ts`'s `NewsletterSendPipeline` module, whose six actions (`authorizeSend`/`freezeAudience`/`claimBatch`/`dispatchRow`/`recordResult`/`completeIfDrained`/`pause`/`resume`) are each independently named, typed, and testable contracts (Contract Map C-01x below), riding the existing generic outbox worker rather than forking a bespoke claim loop.
- **Driver: the Members consent capability and the mail adapters are real, named, unbuilt preconditions (not this spec's job to build) that must not silently block architecture work** → addressed by declaring `MembersConsentCapability` as a typed, injectable dependency (mirroring `SubscriberDirectoryPort`'s already-blessed treatment) that the Launch Readiness Gate's precondition (b) checks for a real (non-null, non-stub) binding — Newsletter's architecture is fully specifiable and buildable today without Members' consent ledger existing yet.
- **Driver: `/tasks` needs safe `[P]` parallelization across a feature this large (32 REQs, 43 ACs, a full orchestrator)** → addressed by the parallel delivery plan below, sequencing schema/chokepoint/gate work ahead of the API/UI/orchestrator-wiring slices that depend on it.

## Pattern Evaluation

The core hexagonal/chokepoint/outbox pattern is **inherited from ADR-034/037/038/040/023/009/022/006** and is not re-evaluated here. Three genuinely open implementation-level choices this ADR resolves:

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| **Campaign storage: bespoke Drizzle table pair** (`newsletter_campaigns` + `newsletter_campaign_revisions`) | Strong fit | High | measured (read `src/features/post/post.ts` — no revision table exists there either, confirming no generalized substrate to reuse) | Zero new abstraction; matches the real `post`/`settings` precedent exactly; adds the one thing `post` is missing (a revision table) to satisfy REQ-06/INV-01 without inventing a bigger system | Newsletter's campaign row does not get "for free" whatever a future generalized `entries` registry would add (e.g. cross-content-type search) | Accepts a narrower campaign table today in exchange for shipping now; a future `entries` generalization can migrate this table in, not the other way around | **SELECTED** |
| Build a minimal generalized `entries`/content-type registry now, so campaigns are truly a registered content-type per ADR-034 §2's original text | Weak fit | Medium | analogical | Would make ADR-034 §2 literally true | Large, speculative, out-of-spec-scope system (Article III violation — no REQ in SPEC-011 asks for a content-type registry); blocks this feature on an unrelated, unscoped build | Trades a huge scope increase for literal ADR-034 §2 fidelity the spec itself already reinterprets ("independent of which concrete mechanism...") | Not selected — SPEC-011 §Dependencies explicitly defers this exact choice to Software Architect and does not ask for a registry |
| Extend the ADR-023 `dataModule` path to the campaign row too (treat it as a 6th `p_newsletter__*` table) | Viable fit | Medium | analogical | One creation mechanism for all six tables (uniformity) | `dataModule`'s namespace/shape is designed for genuinely relational plugin data (ADR-023 §5/§7), not a single per-campaign editorial row with revisions and status-machine semantics closer to `entries`; would also load the still-spike-quality `declareDataModule()` path with a 6th table for no benefit | Uniformity is not itself a requirement; the campaign row's revision/status shape is closer to `post`'s pattern than to the audience/delivery tables | Not selected — mixing concerns for uniformity's own sake, no REQ asks for it |
| **`p_newsletter__*` tables: invoke the existing `declareDataModule()` spike at boot (first-party bundled scope only)** | Strong fit | Medium | measured (read `src/features/plugins/data-module.ts` — the snapshot-before-DDL mechanism is real, working code today) | Uses the exact mechanism ADR-034's own Round-3 fold names (sweep §A.2's first-party bundled sanction); no waiting on the unbuilt reconciliation engine; snapshot-before-DDL discipline is real, not invented for this ADR | The code's own header calls itself an "exploratory spike... to surface real problems," written before ADR-023 was ACCEPTED — it has not been hardened or audited as a production write path; using it for real production tables carries real risk (see Risks) | Accepts using a spike-quality mechanism now, with an explicit hardening/audit follow-up, in exchange for not blocking this entire feature on the unbuilt general engine | **SELECTED**, flagged as this ADR's highest-risk infrastructure dependency after the Launch Gate itself |
| Wait for the ADR-023 reconciliation engine to ship, then build Newsletter's tables | Rejected | High | prior_art (ADR-023 §12: "build the engine v-next... against real demand") | Uses only fully-hardened, engine-mediated infrastructure | Indefinitely blocks this entire feature on an unscheduled, un-owned engine build (ADR-023 Open items have no committed date) | Trades correctness-by-construction for an open-ended delay this dispatch's directive ("translate the spec, don't re-litigate") does not authorize | Not selected — SPEC-011 is due for architecture now, per explicit dispatch; ADR-034 already named the interim path as the sanctioned alternative |
| Bypass `dataModule` entirely: add the five tables directly to `src/infra/db/schema.ts` like Settings/Members (core-owned Drizzle tables, no `p_newsletter__*` namespace) | Viable fit | Medium | analogical (Settings/Members precedent) | Reuses the most-hardened, most-proven table-creation path in the repo (plain Drizzle migration, no spike code) | Contradicts ADR-034 §2's explicit `p_newsletter__*` namespace decision and Newsletter's Tier-3 (not Tier-2) placement — Members/Settings are Tier-2 core libraries by ADR decision; Newsletter is deliberately Tier-3 (disable-able), and giving it core-table treatment blurs that boundary ADR-034 §1 spent real analysis establishing | Trades architectural fidelity to an already-ACCEPTED, audited placement decision for implementation convenience | Not selected — would silently re-litigate ADR-034 §1's core placement decision, which this dispatch is explicitly not authorized to do |

## Quality Attribute Scorecard

Most axes are governed by ADR-034/037/038/040's own scorecards (security posture of the mail/origin/keyring primitives, cost, reliability of the outbox spine — unchanged, since this ADR adds no new tables/chokepoints beyond what those ADRs already specify in kind). Scored here for the concrete surface this ADR adds: the module wiring, the Launch Readiness Gate, the send pipeline, and the `declareDataModule()` reuse.

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Ease of changing Newsletter behavior later | 4 | measured | Feature module isolated behind repo ports; chokepoints are single files; the gate is one function | The bespoke campaign table can't yet inherit a future generalized `entries` registry's benefits without a migration | Matches every other feature module's shape; a future `entries` generalization migrating this table in is a named, expected follow-up, not a surprise | Repo convention (bespoke feature tables) stays acceptable at this feature's complexity | always-on | If a generalized `entries` registry ships later, migrating `newsletter_campaigns` into it is a named follow-up (see Re-evaluation Triggers) | Owner: future Software Architect pass; trigger: `entries` registry ships | — |
| modularity | Cross-module coupling | 3 | measured | `newsletter` depends on `mail`, `origin`, `integrations` (`KeyringPort`), `members` (`SubscriberDirectoryPort`, read-only) — same shape as other features; no new dependency direction | Adds one more cross-module seam (`MembersConsentCapability`) atop the existing `SubscriberDirectoryPort` — two distinct typed dependencies into the same sibling module | Both seams are read/call-only, never write directly into Members' tables (INV-03); the second seam is unavoidable given ADR-030 D1c's consent-ownership decision, not a design choice this ADR could avoid | `members` will eventually implement both seams for real | always-on | Code Review should confirm no Newsletter code ever imports a concrete Members module path, only the two typed interfaces | Owner: Code Review; trigger: any new Newsletter import from `../members/*` beyond the two named seams | -1 vs a hypothetical single merged Members-facing interface (rejected — see Pattern Evaluation; ADR-030 already separates the read-directory seam from the consent-capability seam at the ADR level, this ADR does not re-merge them) |
| scalability | Send-volume headroom | 3 | prior_art | Outbox claim batch size (20, bounded 1-200) matches the existing generic worker's tuning; per-row `SendRow` ledger is the ADR-034-designed scale mechanism | `p_newsletter__sends` is unbounded (recipients × campaigns) — OPEN-4/OQ-04 retention policy is explicitly inherited unresolved, not this ADR's to fix | No new scaling concern is introduced beyond what ADR-034/037 already accepted; this ADR does not attempt to solve ledger retention | Retention is a future Storage/Backups primitive concern | always-on | None owed by this ADR (explicitly deferred, per spec OQ-04) | Owner: future Storage/Backups primitive owner; trigger: ledger size becomes operationally material | — |
| reliability | Never-brick / crash-safety of the send pipeline | 4 | measured | Audience freeze is idempotent-by-presence-check (INV-06); per-row `idempotencyKey` + mail-lib send-dedup ledger prevents double-send on outbox redelivery (INV-10/EC-04); pause/resume never interrupts in-flight atomic work (EC-05) | The campaign-table write chokepoint and the `p_newsletter__*` table-creation path are two *different* mechanisms with two different maturity levels (Drizzle migration = hardened; `declareDataModule()` = spike) — a reliability story that is not uniform across the feature's own persisted state | Both mechanisms are individually sound for their scope; the non-uniformity is disclosed, not hidden | `declareDataModule()`'s snapshot-before-DDL logic behaves as documented | always-on | Programmer must add a dedicated integration test exercising `declareDataModule()`'s failure/rollback path specifically for Newsletter's manifest before this ships to any environment beyond local dev | Owner: TDD/Programmer; trigger: before first non-dev deployment | — |
| security | Fail-closed posture of the public, unauthenticated surface | 4 | measured | Unsubscribe token fails closed on `consentRevisionId` mismatch (INV-04/AC-18); confirm token fails closed on expiry/reuse (AC-17/EC-02); Launch Readiness Gate never proceeds while unmet (INV-05); links built only from `OriginRegistryPort.canonicalOrigin`, never raw `Host` (REQ-30/INV-09/AC-39) | The two public routes (`/newsletter/confirm`, `/newsletter/unsubscribe`) sit on the *same* Express app/process as the admin routes today (no literal separate origin/port exists in this repo yet, despite the ADR-020/025/027 "cookie-less origin isolation lineage" language) — the isolation is path-based (no session middleware applied to these paths) and constant-response/no-cookie by construction, not process/origin-separated | The path-based isolation is sufficient for this feature's actual guarantees (no session ever issued or read on these routes; token is the only credential) even though it is weaker than a literal separate origin | No separate origin/deployment exists anywhere else in this repo either (site routes, media rendition, etc. all share the one Express app) | always-on | None new — matches every other "isolated" surface in this repo today; flagged as a known repo-wide gap, not a Newsletter-specific regression | Owner: whoever eventually builds real multi-origin deployment (out of this ADR's scope) | — |
| operability | Ops/debugging surface | 4 | prior_art | Structured errors + `correlationId` (errors.spec.md); every campaign/send/subscriber state transition emits a `newsletter.*` event; `NEWSLETTER_LAUNCH_GATE_BLOCKED` names every unmet precondition at once | No new alerting/dashboard surface for send-pipeline health (queue depth, stuck-`sending` campaigns) | Not required by any REQ; matches the "no new production alerting surface" posture every other admin feature in this repo has today | — | always-on | — | — | — |
| cost | Build/run cost | 4 | measured | No new infrastructure; SQLite, the existing server process, the existing generic outbox worker | Two persistence mechanisms (Drizzle + `declareDataModule()`) for one feature is marginally more moving parts than a single-mechanism feature | Accepted — see Pattern Evaluation; each mechanism is the right-fit tool for its half of the data | — | always-on | — | — | — |
| testability | Ease of certifying behavior | 5 | measured | Every REQ/AC/INV/EC/behavior-rule in SPEC-011 is written Given/When/Then against pure or near-pure functions (`evaluateLaunchGate`, the campaign status-machine guard, the hook-ordering dispatcher) plus a repo port with an in-memory adapter — TDD can certify the full domain layer without a real database or a real mail/HTTP provider | The orchestrator's multi-step nature (freeze → claim → dispatch → record → complete) needs integration-level tests at the outbox boundary, not just unit tests, to certify INV-06/INV-10/EC-04/EC-05 | Matches this repo's established test-first pattern (`members`, `settings` both certify pure cores against `repo.memory.ts`, then integration-test the transactional/async boundary) | — | always-on | — | — | — |

No axis scored ≤2. Mitigations Required section captures the two forward-looking notes above (dedicated `declareDataModule()` failure-path test; Code Review import-boundary check on the two Members-facing seams) as Owner/Enforcement-tagged items, not separate open items.

## Overall Strengths

- Every new module traces directly to a REQ; nothing is speculative (Article III).
- The Launch Readiness Gate — the feature's single highest-risk contract — ships as one explicit, always-evaluated function, never scattered if-checks, exactly per the task directive.
- The orchestration layer is a first-class, independently-testable set of contracts (six named `NewsletterSendPipeline` actions), not folded into request/response handling.
- Two genuinely open storage-mechanism gaps ADR-034 left unresolved (campaign storage; `p_newsletter__*` table creation) are each resolved with a concrete, grounded-in-real-code answer rather than left as an implementation-time surprise.

## Overall Weaknesses

- The `declareDataModule()` reuse rests on code its own header calls an "exploratory spike... to surface real problems," predating ADR-023's ACCEPTED status — this is a real, disclosed risk, not a clean green light (see Risks).
- Newsletter's persisted state spans two different creation mechanisms (Drizzle migration for the campaign pair; `declareDataModule()` for the five relational tables) with two different maturity levels — more moving parts than a single-mechanism feature, though each is the right-fit tool for its half.
- The "cookie-less origin isolation" language this feature inherits from ADR-020/025/027/034 is aspirational relative to this repo's current single-Express-app reality; the actual guarantee delivered here is narrower (no session middleware on these two paths, token-only credential) than a literal separate origin would provide.

## Tradeoff Tension

We are trading a single, uniform table-creation mechanism for Newsletter's entire persisted state in exchange for using the right-fit tool for each half (a hardened Drizzle migration for the singular campaign row; the ADR-034-sanctioned `declareDataModule()` spike for the five genuinely relational tables) — and, separately, we are trading "wait for the unbuilt ADR-023 engine" for "use the sanctioned interim path now, with a named hardening follow-up," per this dispatch's explicit directive not to re-litigate ADR-034.

## Why This Won

Every alternative that avoided the `declareDataModule()` risk (waiting for the engine, or bypassing `dataModule` and using core-owned Drizzle tables like Settings/Members) either indefinitely blocks this feature on work with no committed owner/date, or silently re-litigates ADR-034 §1's already-ACCEPTED, audited Tier-3 placement decision — both are out of scope for a translate-don't-re-debate dispatch. The selected path uses exactly the mechanism ADR-034's own Round-3 fold names as sanctioned, with the risk disclosed and mitigated (a required dedicated failure-path test) rather than hidden.

## Runner-Up Comparison

- Runner-up: Bypass `dataModule` entirely and add the five `p_newsletter__*` tables directly to `src/infra/db/schema.ts`, exactly like Settings/Members.
- Why it lost: it is the safer *implementation* choice in isolation, but it silently converts Newsletter from a Tier-3 disable-able bundled plugin into a Tier-2-like core table owner — exactly the boundary ADR-034 §1 spent a full placement analysis establishing the other way. Taking that shortcut here would be an unauthorized re-decision of an ACCEPTED ADR's core claim, not a Software Architect implementation detail.

## Consequences

**Positive:**
- The Launch Readiness Gate is a single, testable, always-evaluated function — the exact shape the task asked for, and the hardest thing to get right in this feature.
- Newsletter's two open storage-mechanism gaps are closed with concrete, grounded answers instead of being carried forward as more ambiguity for Programmer to improvise around.
- The send pipeline reuses 100% of the existing generic outbox/event-bus infrastructure — zero new async infrastructure is introduced.
- `admin.newsletter.*` permission rename is provably additive (zero existing call sites), removing any migration risk from that surface.

**Negative / Tradeoffs:**
- `declareDataModule()`'s spike-quality code is now load-bearing for five production tables; if it has an undiscovered bug in its rollback path, Newsletter installation could leave a workspace's `content.db` in a state requiring manual recovery (mitigated by the required dedicated failure-path test, but not eliminated).
- The feature's persisted state is split across two creation mechanisms, which Code Review and future maintainers must understand are deliberately different, not an oversight.

**Risks:**
- Risk: `declareDataModule()`'s snapshot-before-DDL path has never been exercised against Newsletter's actual five-table manifest, and its own header discloses it was written to "surface real problems," not as hardened production code → plan: TDD/Programmer must add an integration test that forces a mid-DDL failure against Newsletter's real manifest and asserts the pre-DDL snapshot restores cleanly (mirrors the existing `data-module.ts` design's own stated intent), before this ships anywhere beyond local dev.
- Risk: `evaluateLaunchGate()` diverges from `behavior.spec.md` §1.2's fixed (a)→(d) evaluation-and-reporting order if reimplemented inconsistently at the route layer vs. the pipeline layer → plan: TDD Agent certifies `evaluateLaunchGate()` as an isolated, directly-testable function with a test asserting exactly two of four preconditions unmet are both named in fixed order, before `authorizeSend` is wired to call it (same pattern SPEC-007 used for `deriveRequiredPermission`).
- Risk: `MembersConsentCapability`'s "registered and live, not an unbound stub" check (Launch Gate precondition (b)) is trivially satisfiable by a naive stub that merely returns success, defeating the gate's intent → plan: Code Review must verify the runtime binding check distinguishes "no implementation wired" (precondition unmet) from "an implementation is wired, whatever it does" — the gate checks *presence of a real binding*, not the binding's internal correctness, and this distinction must be documented at the call site, not just implied.

## Mitigations Required

- Weak axis: reliability (`declareDataModule()` reuse, spike-quality code now load-bearing).
  - Mitigation: dedicated integration test exercising the failure/rollback path against Newsletter's real 5-table manifest.
  - Owner: TDD Agent (test), Programmer (fix any bug the test surfaces).
  - Enforcement: Code Review blocks approval of the schema-creation task without this test present and passing.
  - Deadline or trigger: before Newsletter's `p_newsletter__*` tables are created in any environment beyond local dev.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | **The only brownfield surface this feature touches is `src/newsletter/types.ts`'s `NEWSLETTER_PERMISSIONS` constant** (unprefixed `newsletter.*` strings → `admin.newsletter.*`). A repo-wide grep (`grep -rn "NEWSLETTER_PERMISSIONS\|newsletter\.campaign\.\|newsletter\.read\|newsletter\.list\.manage\|newsletter\.subscriber\." src --include="*.ts"` excluding `types.ts` itself) returned **zero matches** — confirmed no code anywhere registers, checks, or reads these strings today. This is a pure rename, not an expand/contract migration: the constant's callers do not exist yet. | Programmer |
| Dual-write or read-routing plan | N/A — no runtime consumer exists to dual-write for. The rename lands in the same commit as the permission-catalog registration (`src/identity/permissions.ts` gains the `admin.newsletter.*` entries per REQ-25's Agent Directive), so there is never a moment where both old and new strings are simultaneously "live." | Programmer |
| Backfill plan | N/A — no persisted data references the old permission strings (nothing is implemented yet; no grants exist to migrate). | N/A |
| Reconciliation checks | A grep-based CI-style check (or a Code Review manual check) confirming zero remaining `newsletter.campaign.*`/`newsletter.read`/`newsletter.list.manage`/`newsletter.subscriber.*` unprefixed string literals in `src/` after the rename lands. | Code Review |
| Observability proving phase health | N/A — no runtime behavior changes as a result of the rename; it is a compile-time string constant edit. | N/A |
| Rollback test | N/A — reverting the rename (if ever needed) is a plain revert of the same commit; no data or running system depends on the interim state. | N/A |
| Cutover approval and timing | Lands in the same task/PR as the initial permission-catalog registration — no separate approval gate beyond normal Code Review (mirrors SPEC-009's identical `admin.redirects.manage` naming reconciliation). | Coordinator / Code Review |
| Point of no return | None — this is a rename with zero live consumers; there is no destructive step. | N/A |
| Post-cutover verification | Code Review confirms `src/identity/permissions.ts`'s registered catalog and every route's `deps.authorize()` call site both use `admin.newsletter.*` consistently (AC-42). | Code Review |

The remaining "brownfield" facts named in `spec-manifest.md` (`mail`/`KeyringPort` adapters unbuilt, Members' consent ledger unbuilt, no `entries` substrate, ADR-023 engine unbuilt) are **not migrations** — they are named, unbuilt *preconditions* this ADR's architecture is deliberately buildable and testable against today without requiring, per the Launch Readiness Gate's entire purpose (REQ-21). They are addressed as typed dependency seams and a boot-time table-creation decision above, not as data migrations, because no prior version of this feature's data exists to migrate from.

## Re-evaluation Triggers

- Calendar trigger: None — this ADR builds directly on already-audited, ACCEPTED governance ADRs; no forced revisit date.
- Scale trigger: If `p_newsletter__sends` grows large enough to make ledger retention operationally material, revisit OQ-04 (owned by a future Storage/Backups primitive, not this ADR).
- Topology trigger: If a generalized `entries`/content-type registry ever ships, revisit whether `newsletter_campaigns` should migrate into it (named follow-up, not required now — see Overall Weaknesses/modifiability).
- Dependency trigger: The moment `src/features/plugins/data-module.ts`'s reconciliation engine graduates from spike to hardened/audited (ADR-023 Open items), re-evaluate whether Newsletter's boot-time `declareDataModule()` invocation should move to whatever the hardened engine's real registration API becomes. Also: the moment Members ships a real `member_consents`/`members.consent.*` implementation, re-evaluate whether `MembersConsentCapability`'s binding-presence check in the Launch Gate needs updating to call the real implementation's health/liveness surface rather than a presence check alone.

## Module / Service Boundaries

```
src/newsletter/                             # EXTENDED feature module (existing ports.ts/types.ts stubs)
  INFO.md                                   # NEW: module purpose, mirrors members/settings INFO.md convention;
                                             #   discloses the declareDataModule() spike-reuse risk explicitly
  ports.ts                                  # EXTENDED: existing SubscriberDirectoryPort/SendBatchJob stay;
                                             #   adds NewsletterCampaignRepoPort, NewsletterListRepoPort,
                                             #   NewsletterSubscriptionRepoPort, NewsletterAudienceSnapshotRepoPort,
                                             #   NewsletterSendRepoPort, NewsletterConfirmationTokenRepoPort,
                                             #   and MembersConsentCapability (the not-yet-built Members seam,
                                             #   declared here — same treatment as SubscriberDirectoryPort)
  types.ts                                  # EXTENDED: existing types stay; NEWSLETTER_PERMISSIONS renamed to
                                             #   admin.newsletter.* (REQ-25 Agent Directive); adds
                                             #   ConfirmationTokenRecord (OQ-03 resolved: dedicated table,
                                             #   mirrors MagicLinkTokenRecord shape per spec directive)
  campaign.ts                               # NEW: pure domain core for the campaign status machine
                                             #   (REQ-04/05/07/18, behavior.spec §1.1 transition-authority rule)
  campaign-write-service.ts                 # NEW: THE campaign write chokepoint (REQ-06/INV-01) — the only
                                             #   writer of newsletter_campaigns/newsletter_campaign_revisions
  lists.ts                                  # NEW: list CRUD + default-list protection (REQ-08/09)
  subscriptions.ts                          # NEW: subscription add/import/remove chokepoint (REQ-10/31),
                                             #   calls SubscriberDirectoryPort for existence check
  confirmation.ts                           # NEW: ISSUE_CONFIRMATION_TOKEN / CONSUME_CONFIRMATION_TOKEN
                                             #   (REQ-11/12/13), calls MembersConsentCapability.request/.confirm
  unsubscribe.ts                            # NEW: PROCESS_UNSUBSCRIBE (REQ-14/15), verifies the KeyringPort-
                                             #   derived token against consentRevisionIdAtSubscribe (INV-04),
                                             #   calls MembersConsentCapability.revoke
  launch-gate.ts                            # NEW: evaluateLaunchGate() — THE Launch Readiness Gate (REQ-21),
                                             #   one exported function, always evaluates all 4 preconditions in
                                             #   fixed (a)->(d) order (behavior.spec §1.2) — see Contract Map C-013
  send-pipeline.ts                          # NEW: NewsletterSendPipeline — authorizeSend/freezeAudience/
                                             #   claimBatch/dispatchRow/recordResult/completeIfDrained/pause/
                                             #   resume (orchestrator.spec.md §4), registers the outbox job
                                             #   handler; NEVER holds a live MailerPort instance (INV-08)
  hooks.ts                                  # NEW: beforeSend/recipient.filter dispatch + registration
                                             #   (REQ-23, behavior.spec §1.3 fixed ordering, fail-closed)
  feedback.ts                               # NEW: mail.feedback.received consumer -> APPLY_FEEDBACK_PROJECTION
                                             #   (REQ-22), filters on sourceContext.module==='newsletter'
  erasure.ts                                # NEW: principal.erasure.requested handler -> ANONYMIZE_SEND_LOG
                                             #   (REQ-27)
  errors.ts                                 # NEW: typed error classes for every errors.spec.md NEWSLETTER_*
                                             #   code — mirrors src/members/types.ts's error-class pattern
  repo.memory.ts                            # NEW: in-memory adapter for all 6 repo ports above (one file,
                                             #   matches the one-memory-file-per-feature convention)
  repo.sqlite.ts                            # NEW: Drizzle/SQLite adapter for newsletter_campaigns/
                                             #   newsletter_campaign_revisions; declareDataModule()-backed
                                             #   accessors for the 5 p_newsletter__* tables
  data-module-manifest.ts                   # NEW: Newsletter's DataModuleDecl (5 tables: lists, subscriptions,
                                             #   audience_snapshots, sends, confirmation_tokens) + the boot-time
                                             #   declareDataModule() invocation, scoped first-party-only
  __specs__/                                # NEW: spec-linked test fixtures, mirrors members/settings convention
  __tests__/                                # NEW: unit + integration tests

src/infra/db/schema.ts                      # MODIFIED: add 2 Drizzle table defs — newsletterCampaigns,
                                             #   newsletterCampaignRevisions (bespoke pair, NOT dataModule)

src/identity/permissions.ts                 # MODIFIED: BASE_CATALOG-adjacent registration of the
                                             #   admin.newsletter.* catalog (REQ-25 Agent Directive), following
                                             #   the existing registerPermission() pattern used for
                                             #   navigation.manage/integration.manage

src/server/routes/admin/newsletter/         # NEW route module, mirrors routes/admin/members/ shape
  deps.ts                                   # NewsletterRouteDeps (mirrors MembersRouteDeps pattern exactly)
  list-campaigns.ts, get-campaign.ts, create-campaign.ts, update-campaign.ts, cancel-campaign.ts,
  schedule-campaign.ts, send-campaign.ts, send-test-campaign.ts, pause-campaign.ts, resume-campaign.ts,
  list-lists.ts, create-list.ts, archive-list.ts, list-subscriptions.ts, create-subscription.ts,
  remove-subscription.ts, import-subscriptions.ts, resend-confirmation.ts, list-send-log.ts
                                             # 19 route registrar files, one per api.spec.md §1 endpoint ID

src/server/routes/site/                     # EXISTING public-route home (mirrors media-rendition.ts's
                                             #   unauthenticated-by-design pattern; not under /api/admin)
  newsletter-confirm.ts                     # NEW: CONFIRM_SUBSCRIPTION (api.spec.md §1a)
  newsletter-unsubscribe.ts                 # NEW: UNSUBSCRIBE (api.spec.md §1a), GET+POST (RFC 8058)

src/server/app.ts                           # MODIFIED: import + register the 19 admin route registrars
                                             #   (inside the existing /api/admin gated block) + 2 site route
                                             #   registrars (outside it, alongside registerMediaRenditionRoute)
                                             #   + wire the outbox bus subscriber for
                                             #   'newsletter.send.batch.claimed' (mirrors the existing
                                             #   'workspace.created' bus.subscribe demonstration in app.ts)
src/server/seed.ts                          # MODIFIED: invoke data-module-manifest.ts's boot-time
                                             #   declareDataModule() call + seed each workspace's default
                                             #   NewsletterListRow (REQ-08)

apps/admin/src/sections/Newsletter.tsx      # NEW: single flat file (matches Members.tsx/Menus.tsx/
                                             #   Settings.tsx convention), internally composed of the 9
                                             #   ui.spec.md components (NewsletterCampaigns, CampaignRow,
                                             #   CampaignEditor, CampaignSendPanel, NewsletterLists,
                                             #   SubscriptionTable, SendLogTable, LaunchGateBanner, ErrorBanner)
apps/admin/src/App.tsx                      # MODIFIED: import + mount <Newsletter /> (matches the existing
                                             #   per-section import/route block)
```

**Out of this feature's scope (explicitly deferred, not silently dropped):** the `HttpApiMailerAdapter` provider adapter (ADR-037 follow-up); open/click analytics; A/B subject testing; audience segmentation; the ADR-023 reconciliation engine itself; a public unauthenticated signup form; building Members' `member_consents` ledger or `members.consent.*` handlers (ADR-030's own deliverable — this ADR only declares the typed seam Newsletter calls).

## API / Event Contract Summary

What interfaces does this decision define that other agents must respect?

- `NewsletterCampaignRepoPort`, `NewsletterListRepoPort`, `NewsletterSubscriptionRepoPort`, `NewsletterAudienceSnapshotRepoPort`, `NewsletterSendRepoPort`, `NewsletterConfirmationTokenRepoPort` (`src/newsletter/ports.ts`) — six persistence interfaces, each with exactly two adapters (`repo.memory.ts`, `repo.sqlite.ts`); TDD/Programmer must not add a third write path per table family.
- `MembersConsentCapability` (`src/newsletter/ports.ts`) — the typed, not-yet-implemented seam into Members' consent capability. Programmer must NOT implement a Newsletter-local stand-in that returns success by default; an unbound/`null` binding is the correct state until Members ships, and the Launch Gate must observe that absence (Risks item 3).
- `evaluateLaunchGate()` (`src/newsletter/launch-gate.ts`) — the single, always-evaluated Launch Readiness Gate function; `authorizeSend` must call it exactly once, inside its transaction, and must not duplicate any of its four checks at the route layer.
- `NewsletterSendPipeline`'s six actions (`src/newsletter/send-pipeline.ts`) — `authorizeSend`, `freezeAudience`, `claimBatch`, `dispatchRow`, `recordResult`, `completeIfDrained`, plus `pause`/`resume` — the orchestrator contract per `orchestrator.spec.md` §4; Programmer must not fork `processOutbox`'s claim loop.
- `NEWSLETTER_LAUNCH_GATE_BLOCKED` + the full `errors.spec.md` registry — new error codes; Programmer maps each typed error class (`errors.ts`) to its HTTP code at the route layer.
- 19 admin HTTP endpoints + 2 public endpoints per `api.spec.md` §1/§1a — each gated by its named auth profile.
- `newsletter.campaign.*`/`newsletter.send.*`/`newsletter.subscriber.unsubscribed` outbox events (already named in `types.ts`) — durable, workspace-scoped, correlation-id-bearing.

## Enforcement

How do we prevent violations?
- Code Review Agent flags any import of `repo.memory.ts`/`repo.sqlite.ts` from outside the chokepoint files (`campaign-write-service.ts`, `lists.ts`, `subscriptions.ts`, `confirmation.ts`, `unsubscribe.ts`, `send-pipeline.ts`) — mirrors ADR-022/settings' chokepoint-boundary review pattern.
- Code Review Agent verifies `evaluateLaunchGate()` has direct unit test coverage proving all four preconditions are always evaluated (never short-circuited) and reported in fixed order, before approving the `authorizeSend` wiring PR.
- Code Review Agent verifies no Newsletter code ever holds a live `MailerPort` instance (INV-08) — `send-pipeline.ts`'s `dispatchRow` must describe the send effect as data, never construct or store the port itself.
- Code Review Agent verifies the `declareDataModule()` boot-time invocation has the required dedicated failure-path integration test (Mitigations Required) before approving the schema-creation task.
- Code Review Agent verifies every one of the 19 admin route registrars calls `deps.authorize()` with its specific `admin.newsletter.*` permission (AC-42) — none falls back to a broader or missing check.
- Code Review Agent verifies the two public routes (`newsletter-confirm.ts`, `newsletter-unsubscribe.ts`) are registered outside the `/api/admin` gated block and never read or set a session cookie.

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.*

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| — | — | — | — |

## Related Decisions

- Extends: ADR-034 (Newsletter, ACCEPTED 2026-07-10) — this ADR implements its two-tier design; ADR-037 (core/mail, ACCEPTED); ADR-038 (core/http, ACCEPTED); ADR-040 (core/origin, ACCEPTED); ADR-030 (Members, ACCEPTED — `AudienceDirectoryPort`/`member_consents` seams consumed, not built here); ADR-023 (core-mediated plugin data modules, ACCEPTED — the `declareDataModule()` interim-path reuse); ADR-036 (Integrations — `KeyringPort`'s current home); ADR-026 (atomic multi-write envelope, ACCEPTED, no implementation yet — REQ-24/INV-02's counter-update mechanism is inherited unbuilt, not this ADR's to build); ADR-009 (outbox async spine); ADR-006 (rule-of-two); ADR-021 (`authorize()`, permission catalog)
- Relates to: ADR-PIPE-007 (Settings, the structural precedent this ADR's shape follows); SPEC-030/ADR-030 (Members — the sibling parallel dispatch whose files this ADR deliberately does not touch)
