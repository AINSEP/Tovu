# Swarm Consensus Debate Report: ADR-046 (Production Readiness and Composition Hardening)

**Date:** 2026-07-16
**Mode:** debate (Round 1 + Fable adversarial addition + Round 2, scoped to the 6 remaining Phase-1 capabilities, + a second Fable adversarial addition to resolve a Round 2 peer split and verify a hallucination flag)
**Question:** What is the best way to harden Tovu's production composition for durability, boot readiness, composition structure, and architectural boundary enforcement, while staying a single-process modular monolith with no DI container and no new service topology?
**Context packet:** `ADS-memory/.local-artifacts/swarm-consensus/context/CTX-adr046-production-readiness-2026-07-16.md`

## The Swarm

| Role | Model | Requested | Resolved | CLI Version | Source | Status | Voting |
|---|---|---|---|---|---|---|---|
| Primary | Claude Code (host session, Sonnet 5) | — | — | 2.1.201 | host session | Responded | 1 |
| Peer | agy (Gemini) | — | Gemini 3.1 Pro (High) | agy 1.1.2 | local_default, exact | Responded | 1 |
| Peer | Codex | — | gpt-5.6-terra (reasoning=xhigh) | codex-cli 0.144.3 | local_default, exact | Responded | 1 |
| Addition (user-requested, non-CLI) | Fable subagent | — | — | — | in-host, informed round | Responded | disclosed, not counted in candidate-level agreement math |

## Dispatch Diagnostics

- Model-plan lookup run via `cli_smoke_test.py --model-plan-only`; agy and Codex both resolved to exact, non-alias model IDs (proof: `command_model` present for both). Claude CLI was not dispatched — per this repo's own convention ("If you are Claude Code, you dispatch to `agy` and `codex`"), the host session fills Primary directly.
- Peer Handshake Gate: both peers ACK'd `ACK_PACKET_RECEIVED adr046-r1` within the 60s window before the full task timer started.
- Codex independently read `AI-Dev-Shop/AGENTS.md`, `tovu-architecture.md`, and `ADR-INDEX.md` directly from the repo (beyond the self-contained packet) before answering — `-s read-only` sandbox, no crash (codex-cli 0.144.3 on Intel macOS was not in the known-bad tool-execution-crash range).
- Fable subagent dispatched as an **Addition** (user-requested) per the Debate Routing Guard — given the full verbatim Round 1 reasoning of Primary + both peers (informed round), independently re-read the current code (`app.ts`/`deps.ts`, now 729/373 lines — both grown since the packet was written hours earlier), and tasked explicitly with adversarial critique, not confirmation.
- swarm_timeout_seconds: 300 (default); both peer dispatches completed within budget.

## Individual Responses

### Primary (Claude Code, host session) — frozen before any peer response
Candidate A (staged hardening). High confidence. Reasoning: introducing a DI container (C) or process split (D) would be the first framework-level abstraction shift across 46 prior accepted decisions, for a problem that doesn't need it; feature-by-feature patching (B) is the observed status quo and is why composition roots are fragile — a background session's mid-edit of `deps.ts` broke `tsc` repo-wide during this same evening, a live instance of exactly that failure mode. Not fully settled: whether ADR-046's strict-serial sequencing (inventory fully first) is right, or whether the outbox — the single highest-severity known gap — should start in parallel.

### agy (Gemini 3.1 Pro High)
Candidate A, high confidence. Rejects B (fails to address observed composition-root breakage under concurrent AI-agent editing), C (violates the established no-DI-container convention, hinders static analysis), D (violates single-process constraint, massive overcorrection). Strongest self-objection: formal lifecycle machinery may be disproportionate ceremony for a solo developer, and strict sequential ordering delays the outbox fix. Would reconsider a B/A hybrid if the concurrent-agent-editing workflow changed, or abandon the formal lifecycle if it produced "generic soup" in practice.

### Codex (gpt-5.6-terra, reasoning=xhigh)
Candidate A, refined as staged/capability-gated (not big-bang), confidence ~0.9. Same rejections of B/C/D as agy, on closely aligned reasoning. Concrete refinement: migrate composition incrementally behind stable façades rather than replacing both roots at once; **start the durable outbox as soon as its contract is pinned, in parallel with the rest of the inventory** — this was the independent resolution of Primary's open sequencing question. Would reconsider DI only if explicit typed composition became demonstrably unmaintainable post-split; would reconsider a process split only with an actual new scale/topology need.

### Fable subagent (adversarial addition, informed round)
**Concurs on candidate choice** (A, ~0.9 confidence) but delivers the substantive new content of this debate:
1. The A-vs-B/C/D convergence is partly a decoy effect — C/D were constraint-violating strawmen, so three-way agreement on rejecting them isn't strong validation of A's internals.
2. The `deps.ts`-broke-`tsc` anecdote is evidence for **agent-workspace isolation** (worktrees), not for the composition-root split per se — and Phase 3's migration window (dual paths behind a façade) will temporarily *increase* the number of composition files concurrent agents touch, briefly amplifying the exact failure mode being cited against it.
3. **Verified code-level finding:** `src/core/commands/command.ts` (lines 176–177) documents BR-04 — outbox enqueue is contractually **outside** the domain-write transaction today ("an enqueue failure propagates but never rolls back the committed change set"). ADR-046 Phase 1 proposes "write domain state and outbox rows in the same database transaction" as routine adapter work; it is actually a change to an already-accepted invariant, requiring a real, unresolved design decision (amend BR-04 itself vs. repo-owned enqueue-inside-chokepoint vs. an explicit transaction-handle seam through `OutboxPort`) that none of the other three participants flagged.
4. Checked what actually consumes the outbox in the real production composition today (`deps.ts`): a `ConsoleMailerAdapter` (parked-newsletter state) and contained/fail-closed webhook delivery — nothing user-critical is lost today if the outbox evaporates. The "highest severity data-loss risk" framing all three others accepted is future-tense, materializing only once a real consumer ships.
5. Proposes resolving the sequencing question neither strictly-serial nor Codex's parallel-now, but **demand-paged**: do the transaction-seam design work early (cheap), gate durable-outbox *implementation* to the first real consumer, enforced structurally via Phase 0's fail-closed rule (no production mailer/webhook-egress may enable without its durable outbox path).
6. Phase 1's 7-capability durability table reads as push/uniform-sweep; several rows (webhooks/media/analytics) back walking-skeleton features from auto-drafted ADRs with no shipping commitment — recommends pull-based scheduling (durability work triggered by an actual decision to ship that capability), with Phase 0 containment alone already delivering most of the safety value cheaply.
7. Ordering inversion: `dependency-cruiser` (Phase 4) is cheap, independent, and most valuable *during* churn — recommends baselining it in parallel with Phase 0, not after Phase 3.

Verified independently by Coordinator: both cited code locations (`command.ts:176-177`, `deps.ts`'s `ConsoleMailerAdapter`/in-memory webhook repos) confirmed accurate on direct read.

## Synthesis — Solution Slate

**Ranking criteria:** consistency with 46 prior accepted architectural decisions; speed of reducing actual (not theoretical) data-loss risk; operational cost given the observed concurrent-AI-agent-editing pattern; provability via tests; avoids new unresolved-design-work being scheduled as routine implementation.

| Option | Description | Trade-offs |
|---|---|---|
| **1 (leading, unanimous on candidate, amended on internals)** | Candidate A, with: BR-04/transaction-seam resolved as its own explicit design step before Phase 1 implementation; outbox durability *implementation* demand-paged to first real consumer (structurally gated, not a judgment call); Phase 1 durability scheduling pull-based per capability, not a uniform sweep; `dependency-cruiser` baselined alongside Phase 0; Phase 3 migration mandates worktree isolation for concurrent composition-touching agent work | Slightly more up-front design work (the BR-04 decision) before any Phase 1 code; requires the ADR to be amended, not just approved as-is |
| **2 (runner-up)** | Candidate A exactly as originally drafted (strict serial: full inventory → all 7 capabilities' adapters → composition split → CI enforcement after) | Simpler to review as a single unamended document; but ships the outbox fix later than necessary, schedules durability work for walking-skeleton features with no shipping commitment, and risks Phase 1 implementers discovering the BR-04 conflict mid-implementation rather than up front |

**Recommendation:** Option 1. **Cheapest de-risking test:** resolve the BR-04/transaction-seam question as a small, bounded, same-week design note (not full Phase 1 implementation) — pick one of the three mechanisms Fable named, write it as a one-page amendment to ADR-046 or a short companion decision, and confirm it doesn't require touching `command.ts`'s existing certified tests. This proves the "cheap on paper" claim before committing the rest of Phase 1's schedule to it.

**Sample mechanism sketch (backing the leading option, per debate-mode requirement):**
```ts
// Option: repo-owned enqueue-inside-chokepoint (least invasive of the 3 Fable named —
// keeps BR-04's existing rollback semantics for the domain mutation, only widens what's
// INSIDE the transaction boundary to include the outbox row)
export interface ChangeSetRepoPort {
  insert(tx: TxHandle, changeSet: ChangeSetRecord): Promise<void>;
}
export interface OutboxPort {
  // NEW: optional tx handle — omitted call sites keep today's BR-04 behavior (enqueue
  // outside the transaction) until they're migrated; passing txHandle opts a call site
  // into the durable, same-transaction path.
  enqueue(event: DomainEvent, txHandle?: TxHandle): Promise<void>;
}
// executeCommand (command.ts) — only the tx-aware call sites change behavior:
await changeSetRepo.insert(tx, changeSet);
await outbox.enqueue(event, tx); // now rolls back together with the domain mutation
```

## Decision Ledger

| Decision point | Primary | agy | Codex | Fable | Converged? |
|---|---|---|---|---|---|
| Candidate choice (A/B/C/D) | A | A | A | A (concurs) | **Yes — unanimous, survived adversarial pressure** |
| Reject DI container (C) | Yes | Yes | Yes | Yes, stress-tested on merits not just convention | **Yes** |
| Reject process split (D) | Yes | Yes | Yes | Yes, steelman (crash isolation) answered by durable-queue-plus-in-process-worker | **Yes** |
| Outbox sequencing | Open question | Objects to strict-serial | Resolves: parallel-start now | Resolves differently: demand-paged, structurally gated | **Partially — all reject strict-serial; parallel-now vs. demand-paged is the live disagreement, resolved in favor of demand-paged per the verified BR-04 finding** |
| BR-04/transaction-seam as its own design step | Not raised | Not raised | Not raised (assumed adapter-level work) | **Raised, code-verified** | New information — folded into Option 1 |
| Phase 1 scheduling shape (push vs. pull) | Not raised | Not raised | Not raised | **Raised: pull-based recommended** | New information — folded into Option 1 |
| `dependency-cruiser` timing | Not raised | Not raised | Not raised | **Raised: move to Phase 0.5** | New information — folded into Option 1 |
| `deps.ts` anecdote's actual implication | Cited for composition split | Cited for composition split | Cited for composition split | **Reframed: evidence for worktree isolation during migration, not for the split itself** | New information — folded into Option 1 as a process note |

## Final Recommendation

**Candidate A is the converged, adversarially-tested answer at the architecture-choice level** — three independent reasoners plus a fourth explicitly adversarial reviewer all landed there, and the reject-C/reject-D reasoning survived a genuine stress test rather than just pattern-matching to "stay consistent."

**ADR-046 should not move PROPOSED → ACCEPTED unamended.** Fold in, before acceptance: (1) BR-04/transaction-seam resolved as its own explicit pre-Phase-1 design step; (2) outbox durability implementation demand-paged to the first real production consumer, structurally enforced via Phase 0's fail-closed rule; (3) Phase 1's capability-durability table reframed pull-based per capability rather than a uniform sweep; (4) `dependency-cruiser` baseline moved to run alongside Phase 0; (5) a process note mandating worktree isolation for concurrent agent work touching composition files during the Phase 3 migration window.

This is a Coordinator recommendation for the human owner's sign-off, not a self-executing decision — consistent with how ADR-025 required explicit owner approval even after its own debate converged.

## Debate Trace

- **Round 1 (blind):** Primary, agy, Codex all reasoned independently with no visibility into each other's answers. Converged on Candidate A at high confidence, with a shared but unresolved concern about outbox sequencing.
- **Round 2 substitute (informed, Addition):** rather than run a full second CLI round (Coordinator judgment: the candidate-level question showed no real disagreement to hash out, only confirmation-seeking, which the user flagged as wasteful earlier this session), a Fable subagent was dispatched instead — explicitly informed of all three Round 1 positions verbatim, tasked adversarially. This surfaced the debate's actual substantive content (the BR-04 finding) that a same-question Round 2 with agy/Codex likely would not have, since neither peer had reason to re-examine the codebase's transaction-chokepoint contract specifically.
- Both of Fable's central factual claims were independently verified by the Coordinator against the live source (`command.ts:176-177`, `deps.ts`'s `ConsoleMailerAdapter`) before being accepted into this report.

---

## Round 2 (Informed) — Scoped Check of the Remaining 6 Phase-1 Capabilities

**Packet:** `ADS-memory/reports/swarm-consensus/runs/20260716-adr046-r2/round2-packet.md`. Both peers given full verbatim Round 1 responses (Primary/agy/Codex/Fable) plus the Coordinator's Round 2 hypothesis (frozen before either peer's Round 2 response, per the "Primary is a participant every round" rule): change sets and analytics likely lower-risk; webhooks and media most likely to hide a BR-04-style conflict; members worth a specific check.

### Coordinator Round 2 position (frozen before peer Round 2 responses)
Agreed demand-paged is right for the outbox given the verified BR-04 conflict. Hypothesis on the other 6 rows as above — correctly called change sets/analytics lower-risk and webhooks/media as the ones to watch, but did not predict the specific defects either peer found.

### Codex (gpt-5.6-terra) Round 2 — verified accurate
Full findings: change sets no new conflict (SQLite transaction just realizes the already-accepted BR-04 contract); **webhooks real bug** — `repo.sqlite.ts` `enqueue()` inserts `payloadJson: null`, a separate `save()` call `.update()`s it later (confirmed by Coordinator at lines ~200/333-334; the gap was already disclosed in-code as GAP-05/GAP-12, Codex's contribution was connecting it to Phase-1 blocking status); members cross-repository atomicity gap claimed (superseded by Fable's Round 2 correction below — Members doesn't participate in the chokepoint at all, so "atomicity gap" isn't quite the right frame, but the underlying observation about sequential writes is accurate); origin registry needs an authoring/verification contract, not just an adapter; media needs a journal/recovery protocol for the filesystem/DB dual-write (bytes-before-row is the accepted ordering per SPEC-021's `behavior.spec.md`, the risk is orphaned bytes on DB rollback); **analytics** `LocalBufferSink.capabilities()` returns `durable: true` despite being process-only (confirmed accurate at `ports.ts:51`/`repo.memory.ts:59`, though a doc comment does scope it — Codex's caution about not trusting the raw boolean for Phase-0 inventory purposes still stands). Revised own Round 1 position to demand-paged given the BR-04 finding. Proposed enforcement: a typed production-capability registry gating provider construction, backed by CI import rules. Confidence 0.92.

### agy (Gemini 3.1 Pro High) Round 2 — Members finding NOT confirmed, reversal unsupported
Confirmed change sets/webhooks/origin as no-conflict (consistent with Codex, examined from different angles). **Members finding fabricated**: claimed a nested-SQLite-transaction crash risk and an "un-rollbackable mailer side effect" tied to change-set-transaction rollback in `requestSignInLink`. Coordinator verification: grepped all of `src/members/*.ts` (excl. tests) for `executeCommand`/`changeSetRepo`/`changeSets.` — **zero matches**. Members never participates in the BR-04 change-set/transaction machinery at all, so there is no change-set insert in this flow that could fail and roll back — agy's causal chain doesn't exist in this codebase. Consequently the "nested transaction" claim is also unconfirmed (nothing wraps `MemberConsentRepoPort.transaction()`'s real `BEGIN IMMEDIATE` in an outer `executeCommand` transaction, since Members never calls it). Media dual-write finding (bytes written before DB row, orphaned on rollback) independently corroborates Codex and is not affected by the Members error. agy reversed its sequencing position to parallel-now based on the fabricated Members finding; that reversal does not survive verification. Confidence claimed 0.95 (not supported by the evidence for the load-bearing Members claim).

## Second Fable Adversarial Addition — Resolving the Round 2 Split

Dispatched specifically to (a) resolve the agy/Codex sequencing split now that agy's Members evidence was shown to be fabricated, (b) stress-test whether Codex's proposed enforcement mechanism actually works, (c) render a final go/no-go on ADR-046 readiness for sign-off. Given full verbatim Round 2 responses from both peers plus the Coordinator's verification notes (including the hallucination finding). Did fresh independent verification rather than taking the correction at face value.

**Key findings (Coordinator-verified where checkable):**
1. **agy's conclusion was accidentally right even though its evidence was fabricated.** Fresh grep found 3 real mailer-egress families: members (`write-service.ts:189`, direct/synchronous), forms (`notify-subscriber.ts`, outbox-shaped but riding `InMemoryOutbox`, a zero-infrastructure process-only adapter), newsletter (dormant, routes parked, send code exists and compiles). A real bypass of the (not-yet-built) outbox does exist today — just not for the reason or in the flow agy described.
2. **The two live consumers have opposite durability needs.** Members' magic-link email is interactive, latency-sensitive, and loss-tolerant by design (confirmed via the code's own comments: result intentionally unobserved, and an idempotency-key comment noting "an outbox redelivery of the same request reuses this key" — the eventual outbox migration was pre-planned in the contract). Direct send is arguably correct there. Forms' notification path is the one that actually needs durability (a lost lead on crash is real harm), and it's **already outbox-shaped** — swapping `InMemoryOutbox` for a durable SQLite outbox requires zero subscriber changes.
3. **Concrete, named demand-page trigger:** activation of the first real SMTP adapter (referenced as imminent per a recent commit, "MailerPort shape review before the first real adapter"). Today `ConsoleMailerAdapter` masks the gap (a crash just loses log lines); the moment a real adapter lands, forms' notification path silently becomes "customer emails lost on process death" unless the durable outbox exists by then. This is the real urgency argument — not parallel-now, but demand-paged with an already-visible, named tripwire.
4. **Load-bearing defect in Codex's enforcement mechanism, verified by Coordinator:** both `write-service.ts:183` (members) and `notify-subscriber.ts:78` (forms) tag their send with `purpose: "transactional"` — identical. A constructor-gated registry keyed on purpose cannot distinguish the interactive lane (should pass direct) from the notification lane (should be gated on durable-outbox-exists) as currently coded — it either wrongly blocks magic links or wrongly waves through the lane that actually needs gating. Fix: move the gate from constructor to a port-seam decorator around `MailerPort`, keyed per-send on purpose/lane (requires splitting the purpose vocabulary or keying on `sourceContext.module`), done in Phase 0.5 while there's exactly one real adapter to migrate. Codex's CI import rules remain correct and necessary for the separate newsletter-dormancy and bare-construction problems, just not sufficient alone.

**Verdict:** Candidate A + all prior amendments endorsed as sound, including folding the webhook NULL-payload fix as a Phase-1 pre-req (closing an already-disclosed IOU, not a new discovery). One item required before sign-off: amend the enforcement mechanism from constructor-gated to purpose-scoped port-seam-gated, with a split send-purpose vocabulary, and name "first production SMTP adapter" as the outbox's explicit demand-page trigger in the ADR text. Media's journal/recovery design and the origin registry's authoring contract are correctly scoped as ordinary Phase-1 design items, not sign-off blockers. Confidence 0.90.

## Updated Decision Ledger (supersedes Round 1's table on sequencing)

| Decision point | Resolution |
|---|---|
| Outbox sequencing | **Demand-paged, with a named trigger: first production SMTP adapter.** Not strict-serial-behind-full-inventory, not parallel-now. |
| Which capability actually needs the durable outbox first | **Forms' notification path** (already outbox-shaped, zero subscriber changes needed) — not members (interactive, correctly direct-send by design). |
| Enforcement mechanism | Codex's registry concept correct in spirit, wrong altitude — must be a purpose-scoped port-seam gate, not a constructor-level check, given the verified `purpose: "transactional"` collision between members and forms. Requires a small, scoped send-purpose vocabulary split. |
| Webhooks | Real, already-disclosed gap (GAP-05/GAP-12) confirmed as a genuine Phase-1 pre-req, not new but newly load-bearing. |
| Analytics | `durable: true` capability flag is misleading if read without its doc comment — Phase 0's capability inventory must not trust it at face value. |
| Members | No hidden conflict found (the one claimed was fabricated) — direct-send is likely the correct design, not a bug. |
| Change sets, origin registry | No hidden transaction conflicts; origin registry needs a bigger (but ordinary, non-blocking) authoring/verification contract than "just add an adapter." |
| Media | Real dual-write/orphan-on-rollback risk, confirmed independently by both peers — needs a journal/recovery protocol, correctly scoped as Phase-1 design work, not a blocker. |

## Final Recommendation (supersedes Round 1's)

**Candidate A, staged hardening, with the following amendments folded in before PROPOSED → ACCEPTED:**

1. Resolve the BR-04/transaction-seam question as its own explicit pre-Phase-1 design step (three options named: amend BR-04 itself, repo-owned enqueue-inside-chokepoint, or an explicit transaction-handle seam through `OutboxPort`).
2. Outbox durability is demand-paged, with an explicit, named trigger written into the ADR: **activation of the first production SMTP mailer adapter** (not webhooks, not "someday") — structurally enforced, not a runtime convention.
3. Enforcement mechanism is a **purpose-scoped port-seam gate** around `MailerPort` (and analogously for other gated egress), not a constructor-level registry — requires splitting the send-purpose vocabulary (or keying on `sourceContext.module`) so the interactive and notification lanes are actually distinguishable. Do this in Phase 0.5, while there is exactly one real adapter to migrate.
4. Phase 1's capability-durability table is pull-based per capability (triggered by an actual shipping decision), not a uniform sweep — Phase 0 containment alone delivers most of the safety value cheaply.
5. Fold the webhook NULL-then-update fix (`enqueue`/`save` must be atomic, or the envelope must be written at enqueue time) as a named Phase-1 pre-requisite — closes an already-disclosed IOU (GAP-05/GAP-12).
6. Note the analytics `durable: true` capability-flag caution for whoever builds Phase 0's capability inventory — don't trust it without reading the adapter's own scoping comment.
7. `dependency-cruiser` (Phase 4) baselines alongside Phase 0 (report-only), not after Phase 3.
8. Mandate worktree isolation for concurrent agent work touching composition files during the Phase 3 migration window.

This is a Coordinator recommendation for the human owner's sign-off, not a self-executing decision — consistent with ADR-025.
