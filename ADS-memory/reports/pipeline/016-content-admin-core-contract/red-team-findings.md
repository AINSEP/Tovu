# Red-Team Findings: content-admin-core-contract

- Feature: FEAT-016-content-admin-core-contract
- Spec version: 1.0.0
- Spec hash: sha256:0d527b31e34a595a0c3c8b0715e9134c97ac1bc7389af21f4212d3f395157142
- Red-Team completed: 2026-07-14T21:15:00Z
- Finding count: 4 BLOCKING · 6 ADVISORY · 1 CONSTITUTION_FLAG

---

## BLOCKING Findings

Spec must be revised before Software Architect dispatch. 4 BLOCKING findings exist (≥3) — per the
Red-Team persona's escalation rule this is a systemic quality problem in the spec, not a set of
isolated nits. Route back to Spec Agent; do not patch inline.

### RT-001
- Severity: BLOCKING
- Category: untestable
- Location: REQ-10, AC-14; `SPEC-016-behavior.spec.md` §3 (Default Values) and §4 (Limits and Bounds); `SPEC-016-state.spec.md` §1 (`confirmationToken.expiresAt`)
- Description: The confirmation-token TTL is stated everywhere in this package as "~10 minutes" (REQ-10: "a fixed ~10-minute TTL"; AC-14: "expiresAt set to approximately 10 minutes after createdAt"; behavior.spec.md's Default Values and Limits tables both restate "~10 minutes" / "~10 minutes" again). No file in the package gives an exact numeric value (e.g. 600 seconds) or an explicit tolerance band (e.g. ±5 seconds). This is exactly the class of relative-qualifier language the spec-writing quality bar bans ("appropriate," "fast" — here, "approximately," "~") without a measurable threshold. The behavior spec's own edge case 2.2/§7 ("execute() called exactly at the TTL boundary — treated as expired") depends on there being one exact boundary value; as written, two implementers computing "approximately 10 minutes" from `createdAt` could legitimately pick 590s, 600s, or 605s and each satisfy every AC's wording, yet produce different real answers to that exact boundary test. Checking the origin ADR (ADR-041 §3) confirms this imprecision is inherited, not newly introduced here — it also only ever says "~10 min TTL." Since this core contract exists specifically to be the one place that stops four domains from re-deriving/restating an imprecise mechanism differently, this is precisely the kind of ambiguity this spec was written to eliminate, and it did not.
- Suggested resolution: State an exact numeric TTL (e.g. "exactly 600 seconds after `createdAt`") in REQ-10, AC-14, and both behavior.spec.md tables, replacing every "~10 minutes" / "approximately 10 minutes" occurrence. If some jitter is intentionally allowed (e.g. for clock skew), state the exact tolerance band explicitly instead of "approximately."

### RT-002
- Severity: BLOCKING
- Category: untestable (bordering contradiction)
- Location: REQ-13; AC-18, AC-19; `SPEC-016-errors.spec.md` §2 and §4 (Ownership and Source Rules)
- Description: REQ-13's actor-class redemption rule is a distinct, later gate than `authorize()` — behavior.spec.md §2.2's ordering is `authorize()` → token expiry/redemption-state check → plan hash comparison → **actor-class redemption rule** → mutation. A principal that fails the actor-class check has already passed `authorize()` (it does hold the `{domain}.{mutating-verb}` permission — `authorize()` doesn't know which specific token it's trying to redeem). Yet no REQ, AC, or the errors registry ever states what error code an actor-class-rule rejection (AC-18: wrong user; AC-19: wrong agent delegator) returns. The only category-appropriate code, `FORBIDDEN`, is explicitly scoped in `errors.spec.md` §4's Ownership table to be "Produced By: `authorize()` via the Gateway (`confirm()` or `execute()`)" — i.e. the package's own ownership table documents `FORBIDDEN` as an `authorize()`-produced code, not an actor-class-rule-produced one. As written, a strict implementer following the ownership table would have no defined code to return for AC-18/AC-19's rejection at all. Two dependent domains could each invent a different resolution (one reuses `FORBIDDEN` anyway, another adds a domain-specific code), producing exactly the four-domains-diverge risk this contract exists to prevent, and no single deterministic assertion can be written for AC-18/AC-19 as currently worded.
- Suggested resolution: Either (a) explicitly add "the gateway's actor-class redemption check (REQ-13)" as a second producer of `FORBIDDEN` in `errors.spec.md` §4's Ownership row, with a `details.reason` example such as `"actor-class redemption mismatch"`, or (b) mint a new dedicated code (e.g. `TOKEN_REDEMPTION_NOT_PERMITTED`) and add it to the registry, api.spec.md's error mapping, and AC-18/AC-19's text. Either is acceptable; leaving it undefined is not.

### RT-003
- Severity: BLOCKING
- Category: missing-failure-mode
- Location: REQ-19, REQ-21; AC-28, AC-29; `SPEC-016-feature.spec.md` Dependencies table (Postgres row)
- Description: `getCapabilities()`'s `restorePoint.costClass` enum is declared as `'cheap' | 'expensive' | 'unavailable'` (REQ-19), but no REQ, AC, or dependency row anywhere in the package ever produces or defines the `'expensive'` value. AC-28 covers SQLite → `cheap`/`file-snapshot`. AC-29 covers Postgres **with no configured tooling** → `unavailable`. REQ-21 mandates concrete, working Postgres restore-point-capture behavior (`pg_dump -Fc` + blue/green repoint) for the case where tooling *is* configured — which necessarily means Postgres is not always `unavailable` — yet no requirement states what `costClass` a Postgres-with-configured-tooling site should report. The Dependencies table's Postgres row only documents the unavailable-tooling failure mode ("If the tooling is unavailable or unconfigured, `getCapabilities()` reports `costClass: 'unavailable'`") and is silent on the configured-tooling case. `'expensive'` is consequently an unreachable enum value under the spec as written — a dependent spec (SPEC-019's degraded-mode banners, cited in Scope as consuming this exact capability shape) cannot determine from this contract alone whether a working Postgres site should report `cheap` or `expensive`, and two dependent specs could each guess differently.
- Suggested resolution: Add an AC (or extend AC-29's sibling case) stating the `costClass` value `getCapabilities()` returns for a Postgres-backed site with dump/blue-green tooling configured — presumably `'expensive'`, given `pg_dump -Fc` plus a blue/green schema repoint is a materially heavier operation than a SQLite file copy — and add the corresponding Dependencies-table row language.

### RT-004
- Severity: BLOCKING
- Category: ambiguity
- Location: REQ-16, REQ-17, REQ-18; `SPEC-016-state.spec.md` §1 (State Shape), §2 (Entity Contracts), §3 (Action Catalog)
- Description: The composite actor-identity / soft cross-boundary reference pattern is one of the five mechanisms this core contract exists to own precisely (per the Overview: "...the composite actor-identity and soft cross-boundary reference pattern..."), and REQ-16/17/18 place real, load-bearing obligations on it (population-at-write-time only via "the core-mediated write path," workspace/type validation at write time, orphan tolerance, reconciliation sweep). Yet `state.spec.md` — the file whose own stated Purpose is to define "the durable state this core contract itself owns" — has no corresponding entry for this mechanism anywhere: §1's State Shape table has no `actorIdentity`/composite-reference row, §2's Entity Contracts define `MirrorStaleness`, `TokenStatus`, `ConfirmationToken`, `WatermarkState`, and `MirrorState`, but no `ActorIdentity`/`CompositeActorRef` type, and §3's Action Catalog defines `STAMP_WATERMARK`, `RECONCILE_MIRROR`, `MINT_TOKEN`, `REDEEM_TOKEN`, and `EXPIRE_TOKEN` but has no action for populating or reconciling the composite actor-identity pair. Every other REQ block with a shared-implementation obligation (watermark stamping, token minting/redemption) has a matching Entity/Action Catalog entry; REQ-16/17/18 does not. Without a state/action contract for this mechanism, each of the four dependent domains has nothing in this shared package to conform its own "core-mediated write path" implementation to beyond prose, which is exactly the "four independent, silently-drifting restatements" failure mode this spec's own Problem Statement says it exists to prevent.
- Suggested resolution: Add an `ActorIdentityRef` (or similarly named) entity to `state.spec.md` §2 with fields `actorWorkspaceId`, `actorId`, optional `delegatedByWorkspaceId`/`delegatedById`; add an Action Catalog row (e.g. `APPEND_ACTOR_REFERENCE`) documenting its precondition (write chokepoint has independently validated target existence/workspace ownership per REQ-18), state change (row appended with the composite pair populated), and failure handling (orphan-tolerant on read, swept on reconciliation) — mirroring the treatment already given to `STAMP_WATERMARK`.

---

## ADVISORY Findings

Spec Agent and human are informed. Human decides whether to revise or accept risk.

### RT-005
- Severity: ADVISORY
- Category: ambiguity
- Location: REQ-02; AC-03
- Description: REQ-02's trigger condition — "Any core write chokepoint that **wants** a write to count toward the discarded-write-window disclosure... MUST call the watermark-stamping function" — makes stamping conditional on a chokepoint's own intent rather than an enumerable, objective rule. AC-03 pins the outcome concretely for two named exemplars (Collections' entry write-service, Taxonomy's write-service), but the contract gives no criterion for any other core write chokepoint across the four dependent domains to determine whether it "wants" (and therefore must provide) disclosure coverage. This mirrors REQ-08's already-accepted pattern of leaving gated-mutation classification to each domain, so it may be intentional, but as worded it leaves room for two dependent specs to reach different conclusions about which of their own write paths must stamp, with no way to test the divergence since the requirement's own trigger is subjective intent, not an enumerated list.
- Suggested resolution: Either enumerate the closed set of core write chokepoints this contract considers "core" (beyond the two named examples) or explicitly require each dependent domain spec's own `## Integration Contracts` section to declare, by name, which of its write chokepoints call the watermark-stamping function — making the "wants to" decision an auditable, spec-level commitment rather than an implicit implementation choice.

### RT-006
- Severity: ADVISORY
- Category: ambiguity
- Location: REQ-01; OQ-02
- Description: REQ-01 calls `storage_write_watermark` a "single global" counter "stored authoritatively in `content.db`." If a future desktop multi-site host configuration ever has more than one site sharing a single physical `content.db`, "global" is ambiguous between "global across the one `content.db` instance" and "global across the whole installation." OQ-02 already tracks the related `siteId` vs `workspaceId` scoping question and defers its resolution to before the desktop multi-site host ships, so this is not a fresh gap so much as an adjacent under-specification worth surfacing now, since SPEC-017 will need to pick one reading when it defines its own per-site boot reconciliation.
- Suggested resolution: When OQ-02 is resolved, have that resolution explicitly state whether `storage_write_watermark` scoping is per-`content.db`-file or per-site (in a hypothetical shared-file topology), even if the answer is "not applicable because each site always has its own `content.db`."

### RT-007
- Severity: ADVISORY
- Category: untestable
- Location: AC-11 (REQ-09)
- Description: AC-11 states that `plan()` calls from a `kind='agent'`, `kind='api_key'`, and `kind='user'` principal (each holding `{domain}.read`) must "succeed identically." "Identically" is not defined — identical HTTP status, identical `planHash`, byte-identical response body, or something looser. Given `details` is an explicitly domain-defined, open-ended payload (api.spec.md §5), a strict byte-identical reading may be stricter than intended.
- Suggested resolution: Replace "succeed identically" with a specific assertion, e.g. "all three calls return `200` with the same `planId`, `planHash`, and `details` payload" (or state explicitly that only `planHash` equality is required, if `details` is permitted to vary by caller in some domain-specific way).

### RT-008
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: REQ-01; INV-01; `SPEC-016-state.spec.md` §1 (`watermark.value: integer`)
- Description: No file in the package states the integer width backing `storage_write_watermark` (e.g. 64-bit) or what happens if the counter were ever to reach the maximum representable value for whatever type is chosen. In practice, with a 64-bit counter this is not a realistic operational risk, but the contract as written gives no guarantee of that width and no stated behavior at the boundary, leaving it fully to whichever implementation the Architect chooses.
- Suggested resolution: State the intended storage width (e.g. "a 64-bit signed integer, matching SQLite's native `INTEGER` affinity") in REQ-01 or state.spec.md §1, and note that overflow is out of scope because the chosen width makes it unreachable within any realistic product lifetime — turning an implicit assumption into an explicit, falsifiable one.

### RT-009
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: REQ-11; `SPEC-016-orchestrator.spec.md` §5 (`onBeforeExecute`); `SPEC-016-errors.spec.md` §2
- Description: AC-15/AC-16/EC-03 all reason from "given a valid token" or "given the recomputed plan hash does not match." No REQ, AC, or error code addresses `execute()` being called with a `confirmationToken` string that was never issued at all (garbage/forged, not merely expired or already-redeemed). `TOKEN_EXPIRED` and `TOKEN_ALREADY_REDEEMED` both presuppose a real, previously-minted token record; there is no equivalent code for "no such token."
- Suggested resolution: Add an edge case and error code (or explicitly state that an unknown token is treated identically to `TOKEN_EXPIRED` for response purposes, to avoid leaking whether a token ever existed) so `execute()`'s behavior against a never-issued token is deterministic and testable.

### RT-010
- Severity: ADVISORY
- Category: ambiguity
- Location: REQ-16; REQ-13 (third clause, `kind='api_key'`)
- Description: REQ-16 requires the extra `(delegatedByWorkspaceId, delegatedById)` attribution pair "when the action was performed by a delegated agent." REQ-13 separately establishes that a `kind='api_key'` principal's token confirmer must be the api_key's owning user — i.e. an api_key is itself a delegated-authority mechanism analogous to an agent's delegation. REQ-16's extra-attribution clause is textually scoped only to "delegated agent," not to api_key-driven executions, leaving unstated whether a ledger row produced by a `kind='api_key'` execute() call should also carry an owning-user attribution pair (analogous to `delegatedBy`) or only the bare api_key `actorId`. Two dependent domains could reasonably diverge on this for their own audit/ledger rows.
- Suggested resolution: Either extend REQ-16's "delegated agent" language to explicitly include `kind='api_key'` actions (specifying which fields carry the owning user's identity), or explicitly state that api_key-driven rows carry only the api_key's own `actorId`/`actorWorkspaceId` with no owning-user pair, and why that asymmetry with agent delegation is intentional.

---

## CONSTITUTION_FLAG Findings

Likely to require a constitution exception. Flagged for Architect awareness so Complexity
Justification entries can be prepared proactively. `ADS-memory/governance/constitution.md` is an
unratified template (all 8 articles are placeholder text) — this finding is evaluated against the
AI Dev Shop's default provider-profile articles (architecture-decisions skill), not against any
project-specific ratified rule, since none exists yet to be pressured.

### RT-011
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article IV — Anti-Abstraction Gate (default provider profile)
- Location: REQ-08, REQ-22; `SPEC-016-api.spec.md` §7 (the generic `{domain}`/`{action}` gateway and tool-catalog parametrization)
- Description: The generic `plan()`/`confirm()`/`execute()` gateway and its `{domain}_plan_{action}` / `{domain}_execute_{action}` tool-naming convention are a shared abstraction instantiated by multiple domains before any one of them has been implemented — the textbook shape Anti-Abstraction Gate scrutinizes. `SPEC-016-spec-dod.md`'s own item G-04 already records a rule-of-three justification (three named concrete consumers: Storage's forward-migration ceremony per ADR-041 §3, Recovery's restore ceremony per ADR-045 §3, and Collections' destructive-cleanup step per ADR-043 §6), so the justification exists — it just lives in the spec's DoD checklist, not in an ADR's own Complexity Justification table, which is where the constitution's exception process for this article expects it to be recorded.
- Architect note: Carry `spec-dod.md` G-04's three-consumer rule-of-three justification forward verbatim into the ADR's Complexity Justification table for whichever of SPEC-017/018/019/020 first implements this gateway, rather than re-deriving it. No new research is needed — the justification is already written.

---

## Routing Decision

4 BLOCKING findings. **Route back to Spec Agent.** Per the Red-Team persona's escalation rule, 3 or
more BLOCKING findings indicates a systemic quality problem in the spec package, not a set of
isolated nits to patch inline — this is not a close call (4 clears the threshold), and this finding
is not being softened. Software Architect dispatch should not proceed on this spec version until
RT-001 through RT-004 are resolved and the package is re-validated (hash will change; Red-Team
should re-run against the revised hash before Architect dispatch).

ADVISORY findings RT-005 through RT-010 and CONSTITUTION_FLAG RT-011 should be included in the
Spec Agent's revision context regardless of the BLOCKING routing — several (RT-005, RT-010) touch
the same REQ blocks as the BLOCKING findings (REQ-02 and REQ-16 respectively) and are cheapest to
fix in the same revision pass.
