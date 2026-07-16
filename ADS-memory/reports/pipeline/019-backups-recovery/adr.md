# ADR-PIPE-019: Backups/Recovery — Restore Ceremony, Disclosure, and Cross-Screen Operation Lock

- Status: ACCEPTED
- Date: 2026-07-15T10:00:00Z
- Spec: SPEC-019 v1.1.0 (hash: sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d)
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode) / Leona Burime

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | Constitution unfilled template. |
| II — Test-First | N/A | Same. |
| III — Simplicity Gate | **EXCEPTION** (per Red-Team RT-009's CONSTITUTION_FLAG routing note) | The constitution article itself is an unfilled template with no ratified text, so there is no live rule to formally violate — but Red-Team explicitly required a Complexity Justification entry to be prepared for this ADR regardless, naming the four pieces of machinery this domain composes: (1) the five-step human-gated restore ceremony, (2) the separate non-gated `backup.create` path with its own idempotency rule, (3) the cross-screen (Storage+Recovery) in-flight lock, (4) mandatory server-side envelope re-verification on every deep-link arrival. See Complexity Justification below — this is filled as a genuine obligation, not a template artifact. |
| IV — Anti-Abstraction Gate | N/A | Same template-placeholder state. |
| V — Integration-First Testing | N/A | Same. |
| VI — Security-by-Default | N/A | Same — REQ-02's permission gating stands on ADR-021. |
| VII — Spec Integrity | N/A | Same. |
| VIII — Observability | N/A | Same. |

## Research Summary

- Research artifact: N/A — no new technology choice.
- Key decision: implement Recovery as `src/features/recovery/`, a `RecoveryOrchestrator` module (the exact name this spec's own errors.spec.md already assumes) that instantiates `core/gated-mutations` for the restore ceremony (`domain="backup"`, `action="restore"`), treats `backup.create` as a separate ordinary mutation, and implements the cross-screen operation-in-flight lock as a single, shared, site-wide primitive that both Storage (SPEC-017) and Recovery consult — not two independent per-screen locks.

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS
- Spec hash verified at: 2026-07-15T05:35:00Z, re-confirmed after the SPEC-005→SPEC-019 renumbering pass at 2026-07-15T07:00:00Z.
- Red-Team status and artifact: `cleared_for_architect`, round 3, 0 BLOCKING — `ADS-memory/reports/pipeline/019-backups-recovery/red-team-findings-round3.md` (citation-sync re-review; content unchanged since round 2, re-confirmed clean).
- System Blueprint status and artifact: none — same brownfield rationale as SPEC-016/017/018.
- CodeBase Analyzer reports consumed: none exist; direct-codebase verification below.
- Reverse-spec artifacts consumed: N/A.
- Validator result or waiver: PASS, exit 0.

## Context

Recovery is the sibling face of Storage over the same restore-point/gated-mutation primitives SPEC-016 defines: where Storage narrates the timeline, Recovery executes a restore, centered on a blocking, itemized discarded-write-window disclosure the operator must acknowledge before any confirmation token can be minted. It is genuinely the most structurally composite of the four dependent domains — Red-Team's own CONSTITUTION_FLAG (RT-009) explicitly named this: four independently-nontrivial pieces of machinery stacked on top of an already-complex shared gateway. This is not a simplification opportunity to paper over; each piece traces to a distinct, named requirement, and the composition is what ADR-045 itself decided after its own audit rounds.

System drivers:
- **Highest-consequence write path in the whole 4-domain set**: an executed restore is, by definition, discarding writes — REQ-08/INV-02's blocking disclosure exists specifically because this is the one operation in this entire pipeline where "the operator didn't realize what they were agreeing to" is the worst possible failure mode.
- **Cross-screen coordination requirement**: REQ-13's in-flight lock is not a Recovery-only concern — it must also block Storage's migrate-forward ceremony, and vice versa. This is a genuine cross-domain concurrency boundary between SPEC-017 and SPEC-019.
- **Untrusted deep-link surface**: REQ-20/REQ-21's mandatory server-side re-verification of every carried envelope id is a real trust-boundary concern (an unsigned, untrusted envelope is exactly the shape an attacker-controlled or stale link could exploit if trusted).
- **Brownfield**: confirmed directly against the codebase — no backup/recovery code exists anywhere in `src/` today.

## Decision

Implement Recovery as `src/features/recovery/`, exporting a `RecoveryOrchestrator` (matching the name this spec's own `errors.spec.md` already assumes for forward compatibility) with four distinct action groups: (1) read actions (`FETCH_RESTORE_POINTS`, `FETCH_CAPABILITIES`) requiring only `backup.read`; (2) `createRestorePoint`, an ordinary `authorize()`-gated mutation, explicitly NOT routed through `core/gated-mutations`; (3) the restore ceremony (`planRestore`/`confirmRestore`/`executeRestore`), a direct instantiation of `core/gated-mutations`'s gateway; (4) `resolveDeepLinkContext`, which never trusts a carried envelope id without a server-side re-lookup. The cross-screen in-flight lock (REQ-13) is implemented as one shared, site-scoped primitive both this module and `features/storage` consult before starting any gated operation — not two independent per-screen locks that happen to agree.

**Pattern(s) selected:** Vertical feature slice composing `core/gated-mutations`, with one explicitly shared cross-domain concurrency primitive (the in-flight lock) rather than a domain-local one.

## Default Heuristic Alignment

- Default heuristic: modular monolith, vertical slices, hexagonal boundaries only where justified.
- Alignment: **FOLLOWS**
- Notes: The one deliberate departure from pure per-slice independence is the shared in-flight lock, which is exactly the case the default heuristic's hexagonal-boundary carve-out exists for — a genuine cross-cutting concern (site-wide mutual exclusion between two domains) that cannot correctly be a per-slice concern.

## Rationale

- Driver 1 (highest-consequence write path) → addressed by the mandatory, non-bypassable disclosure-acknowledgment gate (INV-02) and the uniform, no-shortcut ceremony (REQ-26).
- Driver 2 (cross-screen coordination) → addressed by a single shared in-flight-lock primitive, not two independently-implemented locks.
- Driver 3 (untrusted deep-link surface) → addressed by `resolveDeepLinkContext` always re-verifying server-side, never trusting the envelope.
- Driver 4 (brownfield, no prior code) → addressed by building fresh, reusing `core/gated-mutations` wholesale for the restore ceremony.

## Pattern Evaluation

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| `RecoveryOrchestrator` vertical slice + shared cross-domain in-flight lock | Strong fit | High | measured (spec's own action-catalog and error-ownership tables already name this shape) | Matches the spec's own already-established naming; correctly treats the in-flight lock as genuinely shared, not domain-local | The shared lock is a real coupling point between Storage and Recovery | A small amount of cross-domain coupling (the lock), traded for correctness (no two-independent-locks race) | **SELECTED** |
| Two independent per-screen in-flight locks (Storage checks its own state, Recovery checks its own) | Rejected | Low | measured (directly contradicts REQ-13's explicit cross-screen requirement) | Simpler, no shared primitive | A migration could start on Storage while a restore starts on Recovery, since neither screen's local lock would see the other's in-flight operation | Would silently violate REQ-13/INV-03 | Not selected — REQ-13 explicitly requires a single, site-wide lock |
| Trust the deep-link envelope's carried values directly (skip server re-lookup) | Rejected | Low | measured (directly contradicts REQ-20/REQ-21, ADR-041 §7's own "unsigned, untrusted end-to-end" decision) | Faster rendering, no extra round-trip | An unsigned envelope with a stale or forged id could be trusted implicitly, a real trust-boundary violation | Not selected — this ADR does not reopen ADR-041 §7's already-Accepted decision |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Cost of changing the restore ceremony or disclosure logic later | 4 | measured | Reuses `core/gated-mutations` wholesale; disclosure logic is isolated in its own module | The `coveredCategories` constant (REQ-09) requires a version bump on every future category addition — an intentional friction, not an oversight | REQ-09 explicitly rejects an external write-path-registry dependency in favor of a versioned constant this spec owns directly — deliberately less "automatic," more auditable | — | always-on | — | — | +1 vs. an external-registry-dependent design (which would be more automatic but harder to audit) |
| modularity | Boundary clarity vs. `core/gated-mutations`, Storage, and the shared lock | 4 | measured | Clean composition: restore ceremony delegates to `core/gated-mutations`; `createRestorePoint` is explicitly kept separate | The shared in-flight lock is a real, necessary coupling point between this domain and SPEC-017 | This is the one domain among the four dependents with a genuine cross-domain runtime dependency (not just a design-time citation) — correctly modeled as such, not hidden | — | always-on | Owner: this ADR's Module Boundaries names the shared lock explicitly | If a third domain ever needs the in-flight lock, promote it to a governance-level shared primitive | 0 vs. runner-up |
| scalability | Restore-points list / disclosure computation at scale | 3 | assumed | Paginated list (default 20, max 100); disclosure computation is a single watermark-delta calculation, not a scan | Not benchmarked at high restore-point-count scale | Self-hosted, single-site scale; no driver suggests this needs benchmarking now | — | always-on | — | If restore-point count grows large enough that pagination alone becomes insufficient | 0 vs. runner-up |
| reliability | Behavior across a crashed/interrupted restore, and progress-panel refresh-safety | 5 | measured | REQ-14's live-read-from-sidecar-journal (never cached) makes a page refresh mid-restore safe by construction; REQ-15's non-dismissable panel prevents premature navigation away from an in-flight destructive operation | — | This is the domain's single highest-reliability-relevance requirement and it received explicit, dedicated architecture (read-live, not poll-and-cache) | — | always-on | — | — | +2 vs. a design caching the initial `execute()` response |
| security | Disclosure-gating, deep-link trust boundary, actor-class rule | 5 | measured | INV-02's non-bypassable disclosure gate, REQ-20/21's mandatory server-side re-verification, and the inherited SPEC-016 actor-class rule are all independently Red-Team-reviewed | — | Recovery is the single highest-blast-radius domain in this 4-spec set (it discards writes) and received correspondingly the most explicit security-relevant hardening | — | always-on | — | — | +2 vs. any design trusting the deep-link envelope |
| operability | Observability of restore progress and degraded states | 4 | assumed | Live progress panel, capability/status bar, multi-condition banner precedence are all purpose-built observability surfaces for exactly this domain's failure modes | No metrics/tracing requirement stated | This domain's entire read surface doubles as its own operability feature | — | always-on | — | — | 0 vs. runner-up |
| cost | Implementation cost given the composed-complexity flag | 3 | assumed | Reuses `core/gated-mutations` wholesale for the hardest part (the gateway) | The four-piece composition Red-Team flagged (RT-009) is real, irreducible cost — not padding | Each of the four pieces traces to a distinct REQ; none is gratuitous, but the sum is genuinely more than any single piece alone | — | always-on | — | — | -1 vs. a hypothetical simpler domain (not a real alternative — see Complexity Justification) |
| testability | Ease of testing the ceremony, lock, and disclosure logic | 5 | measured | Every precedence/ordering rule (banner precedence, disclosure-gates-confirm, costClass-fresh-recheck) is explicit and independently testable per behavior.spec.md | — | The domain's own behavior.spec.md already documents 3 explicit test-requirement statements for exactly the properties that most need them | — | always-on | — | — | +1 vs. an implementation without explicit ordering documentation |

## Overall Strengths

- Correctly identifies and implements the one genuine cross-domain runtime coupling (the in-flight lock) rather than pretending each screen is fully independent.
- The disclosure-acknowledgment gate and deep-link re-verification are both structurally non-bypassable, not merely convention.
- Composed complexity is real but fully traced — every piece maps to a distinct, named requirement; Red-Team's own flag (RT-009) is answered directly, not dismissed.

## Overall Weaknesses

- The shared in-flight lock is a real coupling point with SPEC-017 that must be implemented consistently in both domains — a divergent implementation in either domain would silently reopen REQ-13.
- OQ-03 (how `authorize()` functions when `content.db`, which stores `principals`, is itself unreadable) was reassigned to SPEC-016 by Red-Team RT-006, but SPEC-016's own current spec text (v1.4.0, already ADR'd in ADR-PIPE-016) does not actually contain this open question or its resolution — see Consequences below.

## Tradeoff Tension

We are trading a small amount of genuine cross-domain coupling (the shared in-flight lock) for correctness on a requirement (REQ-13) that cannot be satisfied by two independent, domain-local implementations.

## Why This Won

This is the only candidate that satisfies REQ-13's explicit cross-screen requirement without either (a) silently under-implementing it as two independent locks that could race, or (b) inventing a heavier cross-service coordination mechanism the codebase's modular-monolith default heuristic doesn't justify at this scale. The deep-link re-verification decision is not actually a fresh choice — it is required by ADR-041 §7's already-Accepted "unsigned, untrusted end-to-end" decision.

## Runner-Up Comparison

- Runner-up: two independent per-screen in-flight locks.
- Why it lost: directly contradicts REQ-13's explicit text ("MUST be enforced across both Storage and Recovery, not per-screen" — behavior.spec.md §4) and would reopen exactly the race condition the requirement exists to prevent.

## Consequences

**Positive:**
- The restore ceremony is fully covered by SPEC-016's already-hardened gateway — zero reimplementation risk for the hardest part.
- The in-flight lock is correctly a single, shared primitive — REQ-13 cannot be silently violated by divergent per-screen implementations.

**Negative / Tradeoffs:**
- Recovery and Storage now share a genuine runtime dependency (the lock) beyond their common dependency on `core/gated-mutations` — a change to one domain's use of the lock must be coordinated with the other.
- **Open gap surfaced by this ADR, not resolved by it**: OQ-03 (authorize()'s behavior when `content.db` is unreadable) was reassigned to SPEC-016 by Red-Team RT-006 (2026-07-14) on the reasoning that this affects `storage.migrate-forward` and `backup.restore` identically and should be a shared-contract-level answer, not a SPEC-019-local one. Having now written SPEC-016's own ADR (ADR-PIPE-016) directly, I can confirm SPEC-016's current spec text (v1.4.0) does not contain this open question or a resolution for it — the reassignment noted in this spec was never actually folded into SPEC-016 itself. This is a genuine, currently-unresolved gap spanning SPEC-016/017/019, not paper-covered by this ADR. Recommendation: Coordinator should route a SPEC-016 amendment (a new REQ/EC addressing `authorize()`'s behavior when its own backing store is unreadable) before this domain's TDD dispatch, since `execute()`'s very first check (fresh `authorize()`) is exactly the step this gap concerns.

**Risks:**
- Risk: the shared in-flight lock is implemented independently and inconsistently in `features/storage` vs. `features/recovery`. Plan: this ADR's Enforcement section requires both domains to import a single shared lock primitive from a common location, not reimplement it twice.
- Risk: OQ-03 remains unresolved into implementation, leaving `authorize()`'s content.db-unreadable behavior undefined for both `storage.migrate-forward` and `backup.restore`. Plan: flagged above as an explicit Coordinator routing recommendation.

## Mitigations Required

No axis scored ≤2.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | Purely additive — no existing backup/recovery code or route exists. REQ-27's supersession of the pre-ADR-041 `/admin/backups`/`/admin/database` sitemap entries is a routing change, not a data migration. | This ADR |
| Dual-write or read-routing plan | N/A — no prior Recovery data model exists. | This ADR (N/A confirmed) |
| Backfill plan | No historical restore-point data predates this feature; restore points accumulate from first use. | This ADR |
| Reconciliation checks | Recovery reads live from the sidecar ops journal (SPEC-017's own domain) — no independent reconciliation of its own beyond what SPEC-017 already owns. | `features/storage` (upstream), `features/recovery` (consumer) |
| Observability proving phase health | Capability/status bar, restore-points list, and the live progress panel are the built-in observability surfaces. | `features/recovery` |
| Rollback test | The restore ceremony's own failure modes (`PLAN_STALE`, `TOKEN_EXPIRED`, etc.) are its abort-before-mutation paths — already SPEC-016-covered. | `features/recovery` |
| Cutover approval and timing | REQ-27's sitemap supersession (`/admin/backups` → `/admin/recovery`) is the one cutover-shaped change in this ADR — a routing redirect, not a data cutover. | `features/recovery` |
| Point of no return | `executeRestore`'s `RESTORING` state completing — after this point, the pre-restore data is what the discarded-window disclosure already warned about. | `features/recovery` (delegating to `core/gated-mutations`) |
| Post-cutover verification | The restore progress panel's terminal state (`RESTORED`/`RESTORE_FAILED`) plus the deep-link back to Storage Timeline (REQ-16) is the built-in post-restore verification path. | `features/recovery` |

## Re-evaluation Triggers

- Calendar trigger: none stated; re-evaluate once SPEC-017 (Storage) is actually implemented and the shared in-flight lock can be integration-tested end-to-end across both domains.
- Scale trigger: restore-point count or disclosure-computation cost becomes visible in practice.
- Topology trigger: none specific beyond SPEC-016's own (`siteId`/`workspaceId`).
- Dependency trigger: OQ-03's resolution landing in SPEC-016 — re-verify this domain's `execute()` behavior against that resolution once it exists.

## Module / Service Boundaries

```
src/features/recovery/
  recovery-orchestrator.ts   # RecoveryOrchestrator — matches the name this spec's own errors.spec.md
                             #   already assumes; planRestore/confirmRestore/executeRestore delegate to
                             #   core/gated-mutations (domain="backup", action="restore")
  restore-points.ts          # createRestorePoint — ordinary authorize()-gated mutation, explicitly
                             #   NOT routed through core/gated-mutations (REQ-05)
  disclosure.ts               # computeDisclosure — reads SPEC-016's watermarkAtCapture baseline;
                              #   coveredCategories versioned constant (REQ-09)
  deep-link.ts                 # resolveDeepLinkContext — server-side re-lookup of every envelope id,
                                #   never trusts the carried value (REQ-20, REQ-21)
  agent-tools.ts                # backup_plan_restore, backup_execute_restore, backup_create_restore_point,
                                 #   backup_list_restore_points, backup_get_capabilities
  ui/                            # Recovery screen components
core/
  operation-lock.ts              # NEW, SHARED — the site-wide in-flight lock (REQ-13); imported by BOTH
                                  #   features/storage and features/recovery, never reimplemented per-domain
  gated-mutations/                # EXISTING (ADR-PIPE-016) — imported, unmodified
```

## API / Event Contract Summary

- `RECOVERY_LIST_RESTORE_POINTS`, `RECOVERY_GET_CAPABILITIES` — read tier.
- `RECOVERY_CREATE_RESTORE_POINT` — ordinary mutation.
- `RECOVERY_RESTORE_PLAN`/`CONFIRM`/`EXECUTE` — gateway instantiation.
- `RECOVERY_RESOLVE_DEEP_LINK` — envelope re-verification.
- Error codes: `RESTORE_POINT_NOT_FOUND`, `RESTORE_OPERATION_IN_FLIGHT`, `COST_CLASS_UNAVAILABLE`, `DEEP_LINK_TARGET_NOT_FOUND`, plus SPEC-016's reused gateway codes.

## Enforcement

- Code Review Agent treats a second, independent in-flight-lock implementation in either `features/storage` or `features/recovery` as a Required finding — both MUST import the single shared `core/operation-lock.ts` primitive.
- Code Review Agent treats any code path that renders based on a deep-link envelope's carried value without a prior server-side re-lookup as a Required finding.
- Code Review Agent treats a hand-rolled restore sequence bypassing `core/gated-mutations` as a Required finding (per GOV-ADR-001).

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.*

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| III — Simplicity Gate (EXCEPTION, per Red-Team RT-009's explicit routing note — no ratified article text exists, but the obligation to justify was explicit and is honored here) | This domain composes four independently-nontrivial pieces, each tracing to a distinct requirement: (1) the five-step human-gated restore ceremony (REQ-06, REQ-08) — needed because a restore is this pipeline's single most destructive operation and cannot be a one-click action; (2) the separate non-gated `backup.create` path with its own idempotency rule (REQ-05) — needed because restore-point creation is non-destructive and forcing it through the full gateway would add friction with no safety benefit; (3) the cross-screen in-flight lock (REQ-13) — needed because a concurrent migrate-forward and restore against the same site is a genuine data-corruption risk; (4) mandatory server-side envelope re-verification (REQ-20) — needed because ADR-041 §7 already committed to unsigned, untrusted deep links, and trusting them here would silently reopen that decision. | A single unified "recovery action" endpoint handling both restore-point creation and restore execution through one gateway. | Would force `backup.create` (non-destructive, high-frequency) through the same friction-heavy ceremony as `backup.restore` (destructive, rare) — a worse experience for the common case with no safety benefit, since `backup.create` has nothing destructive to gate. |

## Related Decisions

- Supersedes: none.
- Relates to: ADR-045 (Backups/Recovery, primary source), ADR-041 (Storage/Timeline — sidecar journal, `StorageContextEnvelope`, `db-ops` port), ADR-PIPE-016 (core contract, restore ceremony's gateway), ADR-PIPE-017 (Storage — the other consumer of the shared in-flight lock), ADR-021 (identity/authorization).

## Brownfield Grounding (direct codebase verification, this ADR)

- Confirmed via grep: no `backup.restore`/`BackupRestore`/`recovery_restore` code exists anywhere in `src/` today — genuinely new capability.
- Confirmed this spec's own `errors.spec.md` already names `RecoveryOrchestrator` as the assumed module/class name across its Ownership and Source Rules table — this ADR adopts that name directly rather than inventing a new one, for consistency with the spec's own forward references.

## Implementation Outline: PRODUCED

Triggers: Boundary Cross (crosses `core/gated-mutations`, the new shared `core/operation-lock`, `features/storage`, `features/recovery`), Contract Change (new routes, agent tools, error codes), System Wiring (cross-screen lock coordination, deep-link hand-off from Storage), Data And Persistence (reads SPEC-017's sidecar journal, no new tables of its own), Brownfield Dependency (consumes ADR-041 §7's envelope contract unchanged), Critical Cross-Boundary Invariant (INV-01 through INV-07 span this domain and its coordination with SPEC-017). See `ADS-memory/reports/pipeline/019-backups-recovery/implementation-outline.md`.

## Critical Internal Constraints: PRODUCED

Designated units: U-001 (shared cross-domain in-flight lock, Concurrency/Ordering), U-002 (disclosure-acknowledgment gates confirm reachability, Security-Critical Sequencing), U-003 (fresh costClass re-check before gateway delegation, Security-Critical Sequencing). Banner precedence (behavior.spec.md §1.1) was considered and NOT designated — a display-ordering concern with no correctness/security/recovery/parity property at stake, unlike the three designated units. See `ADS-memory/reports/pipeline/019-backups-recovery/critical-internal-constraints.md`.

## Governance ADR Promotion

**Evaluated, promotion warranted.** The shared in-flight lock (`core/operation-lock.ts`) is a genuine cross-cutting rule: any future domain introducing a second gated, high-blast-radius mutation type must consult this same shared lock, not implement its own. Promoted to `ADS-memory/governance/adrs/GOV-ADR-002-shared-operation-in-flight-lock.md`; `ADR-INDEX.md` updated.
