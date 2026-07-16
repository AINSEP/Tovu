# Red-Team Findings (Round 3 — Fresh Re-Review): content-admin-core-contract

- Feature: FEAT-016-content-admin-core-contract
- Spec version: 1.2.0
- Spec hash: sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981 (mechanically
  verified via `validate_spec_package.py --phase spec`, no `--update-hash` needed — the validator's
  own canonical-hash recomputation confirmed the stored `content_hash` matches; exit code 0, "PASS:
  strict Speckit package passed mechanical validation.")
- Red-Team completed: 2026-07-15T01:37:00Z
- Finding count: 1 BLOCKING · 2 ADVISORY · 0 CONSTITUTION_FLAG (RT-011 from round 1 is carried
  forward unchanged — see Prior-Finding Verdicts; no new constitution pressure was found)

This is a fresh, full adversarial pass against the current v1.2.0 package (all 9 spec files read in
full, plus `spec-dod.md`, `spec-manifest.md`, `pipeline-state.md`, and the governance constitution
template), not a diff-only check. It also includes the two Coordinator-mandated checks: (1) a
verdict on each of round 2's seven findings (RT-012–RT-018), and (2) a dedicated look at the v1.2.0
revision's own new content (the `reasonCode` enum, the reordered `execute()` check sequence, the
widened REQ-14/REQ-19 language) for newly introduced defects.

---

## Part 1 — Prior-Finding Verdicts (RT-012 through RT-018)

| Finding | Verdict | Basis |
|---|---|---|
| RT-012 (`restorePoint.kind: 'external'` unreachable) | **RESOLVED** | REQ-19's final sentence now defines a concrete trigger: "A site whose only configured restore mechanism is an externally-managed backup or point-in-time-recovery (PITR) system that the `db-ops` adapter cannot itself execute a capture or restore against... MUST report `restorePoint.kind: 'external'` paired with `restorePoint.costClass: 'unavailable'`." New AC-37 makes this testable, the Dependencies table gained a matching row ("Externally-managed PITR/backup mechanism..."), and the Out of Scope section now explicitly carves out "the concrete detection, configuration, or execution mechanism for any externally-managed PITR/backup service reported via `restorePoint.kind: 'external'`" as SPEC-017/SPEC-019's responsibility. `'external'` is reachable and tested at this contract's own layer (reporting the marker), with the deeper mechanism correctly deferred. |
| RT-013 (`FORBIDDEN.details.reason` unenumerated) | **RESOLVED** | `errors.spec.md` §3 now defines a closed `details.reasonCode: enum[AUTHORIZE_DENIED, ACTOR_CLASS_MISMATCH]` as the deterministic discriminator, with `details.reason` explicitly demoted to "free text, illustrative only... never the field an AC asserts on exactly." AC-18 and AC-19 were rewritten to assert `details.reasonCode` equal to the exact enum literal `'ACTOR_CLASS_MISMATCH'` instead of the word "identifying." REQ-13 states the ordinary `authorize()` denial case sets `'AUTHORIZE_DENIED'`. A single deterministic assertion can now be written for both ACs. |
| RT-014 (polymorphic-content-reference flavor has no state/action contract) | **RESOLVED** | REQ-18 and `state.spec.md`'s Purpose both now explicitly state the reasoning that was previously only inferable: this core contract directly instantiates only the composite actor-identity flavor (because it itself owns principal attribution and populates that reference via REQ-16/REQ-17's core-mediated write path); the polymorphic-content-reference flavor's concrete entity/action contract is "owned and instantiated entirely by the dependent domain spec that defines it," which "MUST define the concrete entity and action contract for its own polymorphic reference table, applying this REQ-18 rule." This closes the exact asymmetry-without-explanation gap RT-014 raised — the asymmetry is now a documented, deliberate domain-boundary statement, not a silent gap. |
| RT-015 (Postgres "working" tooling check underspecified) | **RESOLVED** | REQ-19 now states "working" is determined by "a static configuration-presence check performed at `getCapabilities()` call time — confirming the required binary path, credentials, and target parameters are present and structurally valid — never a live end-to-end dump/restore health probe," and that a site "whose tooling is not confirmed both configured and structurally valid this way — including a site where the tooling is present but misconfigured... — MUST report `'unavailable'`," explicitly stated as "the catch-all for every non-confirmed-working state, not merely a never-configured one." New AC-36 covers the configured-but-broken case. Both underspecified points RT-015 raised are now closed. |
| RT-016 (REQ-14/AC-21 precedence rule has no concrete field in this package's own endpoints) | **RESOLVED, but see fresh finding RT-020 below** | `api.spec.md`'s Purpose and REQ-14 itself now explicitly state the rule is "a generic, cross-cutting precedence rule for any mutating call site — gated or ordinary — in this contract or in any dependent domain that happens to accept an idempotency key," and that this contract's own three gateway endpoints do not themselves carry an idempotency-key field since `GATEWAY_EXECUTE`'s single-use token already provides equivalent replay protection. This directly answers what RT-016 asked (state explicitly whether the rule governs this contract's own surface or is a generic cross-cutting rule) — RT-016's literal ask is satisfied. However, the specific wording chosen to satisfy it — "any dependent domain... or any mutating call site... gated or ordinary" — reaches further than RT-016 asked for and introduces its own new scope-breadth question; see RT-020. |
| RT-017 (actor-class check ordered after plan-staleness, an information-disclosure tension) | **RESOLVED** | `execute()`'s check sequence was reordered: `authorize()` → token expiry/redemption-state check → actor-class redemption rule → plan re-derivation/hash comparison → mutation (previously the actor-class rule ran after plan re-derivation). This is reflected consistently across `feature.spec.md` (REQ-11, REQ-13, new EC-10, new AC-38), `behavior.spec.md` §2.2 (with an explicit tie-break rationale citing REQ-11/REQ-14's non-disclosure pattern) and its §7 edge-case table, `orchestrator.spec.md`'s Lifecycle Hooks (new `onActorClassCheck` hook inserted before `onAfterPlanRecompute`), and `state.spec.md`'s `REDEEM_TOKEN` action's precondition-evaluation-order note. All five surfaces agree with each other. |
| RT-018 (two-hour timestamp discrepancy in `spec-dod.md`) | **RESOLVED** | `spec-dod.md`'s B-06 Notes cell and Sign-Off Block Spec Agent row both now read `2026-07-14T23:45:00Z`, matching the header `filled_date` and `feature.spec.md`'s `last_edited`. Verified directly: `grep` for `20:00:00Z` in `spec-dod.md` returns no hits; the only remaining timestamp is the corrected `23:45:00Z`, with an explicit note that it was "corrected in this revision per RT-018." |

**Summary:** All 7 of round 2's findings (RT-012 through RT-018) are RESOLVED. One of the fixes
(RT-016's) introduces a new, narrower scope-breadth question of its own, captured below as a fresh
ADVISORY finding (RT-020) rather than reopening RT-016 itself — RT-016's own literal ask was fully
answered.

---

## Part 2 — Fresh Findings (this round's own attack-vector pass, including scrutiny of the v1.2.0 revision's new content)

## BLOCKING Findings

Spec must be revised before Software Architect dispatch.

### RT-019
- Severity: BLOCKING
- Category: missing-failure-mode / contradiction
- Location: REQ-01; EC-01; Dependencies table (`SQLite / better-sqlite3 WAL transaction runtime`
  row); `SPEC-016-feature.spec.md` lines 153-158, 440-442, 492
- Description: REQ-01 states `storage_write_watermark` is "stored authoritatively in `content.db`
  as a 64-bit signed integer (matching SQLite's native `INTEGER` affinity)," and EC-01's Expected
  Behavior for concurrent writes is "the underlying single-writer WAL transaction model serializes
  the two commits." The sole Dependencies-table row that provides the atomicity guarantee REQ-01
  depends on is named explicitly `SQLite / better-sqlite3 WAL transaction runtime`, with its
  Failure Mode column stating "If the runtime does not honor the assumed transaction/WAL semantics,
  the same-transaction atomicity guarantee (REQ-01) does not hold" and its Fallback column stating
  "None — this contract has no non-transactional fallback for the watermark stamp." All three of
  these — the type description, the concurrency-safety argument, and the sole enabling dependency —
  are written exclusively in SQLite-specific terms ("SQLite's native `INTEGER` affinity,"
  "single-writer WAL," "better-sqlite3"). But this same core contract's own REQ-19/REQ-21 establish,
  as squarely in scope, that a site's primary database ("content.db" per this spec's own vocabulary,
  matching ADR-041's usage where a Postgres-backed site is reached via a `content.db`
  SQLite-to-Postgres "migrate-forward" state machine) can be Postgres-backed rather than
  SQLite-backed — REQ-21 mandates concrete Postgres restore-point behavior for exactly this case.
  Postgres does not have SQLite's "single-writer WAL" model (Postgres uses MVCC with concurrent
  writers and does not have a `content.db`-file-level type-affinity concept — a native Postgres
  column would be a strictly typed `BIGINT`, not something "matching SQLite's native `INTEGER`
  affinity"), so EC-01's Expected Behavior is not merely under-specified for a Postgres-backed
  site — it describes a mechanism that provably does not apply there, and nothing in this package
  states what does. This is the same defect shape rounds 1 and 2 both found BLOCKING (RT-003:
  `costClass:'expensive'` unreachable for Postgres; RT-004: no state/action contract for the
  actor-identity mechanism; RT-012: `restorePoint.kind:'external'` unreachable) — a mechanism this
  core contract exists specifically to own precisely, described in terms that provably cover only
  one of the two backing engines this same contract elsewhere treats as in scope, with the other
  engine's equivalent left completely unaddressed. Unlike REQ-19–21, which explicitly branch by
  engine ("A SQLite-backed site MUST report..." / "A Postgres-backed site... MUST report..."),
  REQ-01/EC-01 make no engine-conditional statement at all — there is no textual signal anywhere in
  the package for whether (a) a Postgres-backed site's equivalent watermark atomicity/type is
  SPEC-017's responsibility to define (analogous to how RT-014's fix explicitly assigned the
  polymorphic-content-reference flavor to the owning dependent domain), or (b) REQ-01 as literally
  written is meant to be ported unchanged onto a Postgres-backed `content.db`, which is a technical
  impossibility given the SQLite-specific language used. Two implementers — one building the
  SQLite-side watermark and one building a Postgres-backed site's equivalent — have no shared
  contract to converge on, which is exactly the "four domains diverge" (here, "two engines diverge")
  risk this spec's own Problem Statement says it exists to prevent.
- Suggested resolution: Either (a) add an explicit statement — mirroring RT-014's fix for the
  polymorphic-content-reference flavor — that REQ-01/EC-01/the Dependencies-table row describe only
  the SQLite-backed case, and that the equivalent watermark atomicity mechanism, type, and
  concurrency-safety argument for a Postgres-backed `content.db` (post-migrate-forward) is owned and
  defined entirely by SPEC-017 (which owns the migrate-forward state machine per this spec's own
  Out-of-Scope section), or (b) add a parallel Postgres-specific REQ-01 clause, EC-01 sibling edge
  case, and Dependencies-table row analogous to how REQ-19–21 handle the engine split (e.g. "a
  Postgres-backed site stores `storage_write_watermark` as a `BIGINT` column, incremented within the
  same ACID transaction as the write it stamps; concurrent writers are serialized by Postgres's
  normal MVCC/row-locking semantics, not a single-writer WAL model"). Either closes the gap; leaving
  it unstated does not.

---

## ADVISORY Findings

Spec Agent and human are informed. Human decides whether to revise or accept risk. Neither of these
blocks Software Architect dispatch on their own.

### RT-020
- Severity: ADVISORY
- Category: scope-creep
- Location: REQ-14 (as revised for RT-016); `SPEC-016-api.spec.md` Purpose note on REQ-14/AC-21
- Description: This spec's own Problem Statement frames its entire reason for existing as covering
  only "every mechanism more than one of the four domains structurally depends on (not just
  thematically similar to)," and its Scope section places REQ-14 specifically inside "the generic
  `plan()` → `confirm()` → `execute()` gated-mutation gateway pattern: permission tiers per step,
  the `authorize()` call contract (ordering relative to idempotency...)" (REQ-08–REQ-15) — i.e., a
  rule about the gated-mutation gateway's own precedence behavior. The v1.2.0 fix for RT-016 widened
  REQ-14's own text beyond that framing: it now states the rule applies to "any mutating call
  site — gated or ordinary — in this contract **or in any dependent domain** that happens to accept
  an idempotency key," making it a blanket mandate over every ordinary (non-gated) write endpoint in
  all four dependent domains, not just this contract's own gateway. `authorize()` itself, however, is
  owned by ADR-021 (cited in this package's own Dependencies table as the source of "`authorize()`
  semantics, principal kinds, and live grant-intersection rule"), and a general "call `authorize()`
  before any idempotency short-circuit" precedence rule reads as a property of `authorize()`'s own
  contract (an ADR-021 concern) rather than a mechanism specific to the watermark/gateway/actor-
  identity surface this core contract otherwise scopes itself to. As worded now, REQ-14 risks
  becoming a second source of truth for an authorize()-wide ordering rule that arguably belongs
  entirely inside ADR-021's own `authorize()` contract, duplicating (or silently diverging from, if
  ADR-021 is ever updated) a rule this spec did not originate.
- Suggested resolution: Either narrow REQ-14's text back to "this contract's own gated-mutation
  gateway calls `authorize()` before any idempotency short-circuit" (letting each dependent domain's
  own ordinary-mutation endpoints inherit the rule by citing ADR-021 directly, not this spec), or, if
  the cross-cutting breadth is intentional, add one sentence stating this is a restatement of an
  ADR-021-level `authorize()` contract property being surfaced here only for convenience/visibility,
  not a new rule this spec itself originates or owns independently of ADR-021.

### RT-021
- Severity: ADVISORY
- Category: ambiguity / untestable
- Location: REQ-03; AC-04; `SPEC-016-state.spec.md` §3 (`RECONCILE_MIRROR` Action Catalog row,
  Precondition column)
- Description: REQ-03 states the sidecar mirror "MUST maintain a mirror of
  `storage_write_watermark`'s value, refreshed after every `content.db` commit that changes it" —
  wording that reads as a synchronous, commit-triggered refresh. But AC-04 (REQ-03)'s own Given/
  When/Then only commits to "the sidecar mirror's stored value is refreshed to match **by the next
  reconciliation opportunity** in the same boot session" — a materially weaker, time-unbounded
  guarantee — and `state.spec.md` §3's `RECONCILE_MIRROR` action's Precondition column names only
  two triggers, "boot, or a periodic tick," with no third "immediately after a watermark-changing
  commit" trigger and no stated interval for what "a periodic tick" means in seconds/minutes. Two
  implementers could both satisfy the words of REQ-03/AC-04/`RECONCILE_MIRROR` while producing very
  different real behavior: one refreshes the mirror synchronously inside the same commit path
  (matching REQ-03's literal "after every commit" language), another refreshes it only on a periodic
  tick that could be minutes long (matching `RECONCILE_MIRROR`'s stated triggers), and no assertion
  can be written today that would fail against the second, weaker implementation, since "next
  reconciliation opportunity" has no numeric bound. Note this is functionally lower-risk than a
  typical untestability finding because REQ-05 already forces any disclosure computed while
  `content.db` is unreachable to render as an explicit unknown/lower-bound estimate rather than a
  precise number — so a stale mirror cannot itself produce a wrong precise answer — but AC-04 as
  currently worded still cannot be verified with a specific, deterministic assertion, which is this
  project's own bar for a testable AC.
- Suggested resolution: Either state an exact interval for "a periodic tick" (e.g. "every N
  seconds, and additionally within the same transaction as any watermark-changing commit" if
  synchronous refresh is actually intended) and update AC-04 to assert against that concrete bound,
  or explicitly soften REQ-03's "after every... commit" language to match `RECONCILE_MIRROR`'s actual
  boot-and-periodic-tick-only triggers, so the two do not read as different guarantees.

---

## CONSTITUTION_FLAG Findings

None newly introduced this round. RT-011 (Article IV — Anti-Abstraction Gate, re-verified RESOLVED
in round 2 and unchanged in v1.2.0's own content) remains the only standing constitution-adjacent
note, carried forward unchanged for Software Architect awareness — it requires no further action
here. `ADS-memory/governance/constitution.md` is still an unratified template (all 8 articles
placeholder text), confirmed by re-reading it in full this round; no new default-provider-profile
pressure point was found beyond RT-011.

---

## Routing Decision

**1 BLOCKING finding (RT-019).** This is well below the "3 or more" systemic-quality-problem
escalation threshold, but the Output Format definition is unconditional: BLOCKING means the spec
must be revised before Software Architect dispatch regardless of count. **Route back to Spec
Agent.** Do not patch RT-019 inline here.

RT-019 is a narrow, mechanical fix in the same family as round 1's RT-003/RT-004 and round 2's
RT-012 — add an explicit engine-scoping statement (or a parallel Postgres-specific clause) to
REQ-01/EC-01/the Dependencies table — and should not require another full revision pass.

ADVISORY findings RT-020 and RT-021 should be included in the Spec Agent's next revision context
regardless of the BLOCKING routing. RT-020 in particular touches the same REQ-14 text RT-019's
sibling engine-scoping fix will likely also touch stylistically (both are about how precisely this
core contract states what is and is not its own scope), and is cheapest to resolve in the same pass.
