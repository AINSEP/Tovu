# Red-Team Findings (Round 2 — Fresh Re-Review): content-admin-core-contract

- Feature: FEAT-016-content-admin-core-contract
- Spec version: 1.1.0
- Spec hash: sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d (mechanically
  verified via `validate_spec_package.py --phase spec`, no `--update-hash` needed — stored hash
  matched the canonical recomputation)
- Red-Team completed: 2026-07-14T23:30:00Z
- Finding count: 2 BLOCKING · 5 ADVISORY · 0 CONSTITUTION_FLAG (RT-011 from round 1 is carried
  forward unchanged — see Prior-Finding Verdicts; no new constitution pressure was found)

This is a fresh, full adversarial pass against the current v1.1.0 package (all 9 files read in
full), not a diff-only check. It also includes the two Coordinator-mandated checks: (1) a verdict
on each of the 11 round-1 findings (RT-001–RT-011), and (2) a dedicated look at the round-1
revision's own new content for newly introduced defects.

---

## Part 1 — Prior-Finding Verdicts (RT-001 through RT-011)

| Finding | Verdict | Basis |
|---|---|---|
| RT-001 (TTL ~10min ambiguity) | **RESOLVED** | Every occurrence of "~10 minutes"/"approximately" is gone. REQ-10, AC-14, `state.spec.md` §1, `api.spec.md` §5, and `behavior.spec.md` §3/§4 all state "exactly 600 seconds... no jitter or tolerance band." The TTL-boundary edge case (`behavior.spec.md` §7: `now == expiresAt` → treated as expired, exclusive upper bound) closes the exact question RT-001 raised about EC/§7's boundary test. |
| RT-002 (undefined error code for actor-class rejection) | **RESOLVED** | `errors.spec.md` §4's Ownership table now lists `execute()`'s actor-class redemption check (REQ-13) as a second, explicit producer of `FORBIDDEN` alongside `authorize()`, distinguished via `details.reason`. REQ-13, AC-18, AC-19 all consistently cite this. (A residual, narrower gap in *how precisely* `details.reason` is specified is real but is a new, different-grained problem — see RT-013 below — not a failure to resolve what RT-002 actually asked for.) |
| RT-003 (`costClass:'expensive'` unreachable) | **RESOLVED** | REQ-19 now states the exact trigger ("Postgres-backed site with `pg_dump`/blue-green restore tooling configured and working"), AC-33 was added, and the Dependencies table row was updated. `'expensive'` is now reachable and tested. (The sibling field `restorePoint.kind`'s `'external'` value has the identical defect and was missed — see RT-012 — but that is outside what RT-003 itself was scoped to.) |
| RT-004 (missing state/action contract for composite actor-identity) | **PARTIALLY RESOLVED** | `state.spec.md` §2 now has an `ActorIdentityRef` entity and §3 has an `APPEND_ACTOR_REFERENCE` action, mirroring `STAMP_WATERMARK`'s treatment exactly as RT-004 asked. However, REQ-18 (in the same REQ-16–18 scope block RT-004 was about) explicitly names **two** flavors of "soft cross-boundary reference": the composite actor-identity pair *and* "a polymorphic content reference such as `(workspaceId, contentType, contentId)`." Only the actor-identity flavor got a state/action entry; the polymorphic-content-reference flavor — named in REQ-18's own text as an equally-covered example — still has no entity or Action Catalog row anywhere in `state.spec.md`, and nothing in the package states whether that asymmetry is an intentional domain-boundary split (concrete polymorphic-reference tables belong to dependent domains) or an oversight. See RT-014. |
| RT-005 (REQ-02 "wants" subjective trigger) | **RESOLVED** | REQ-02 now requires each dependent domain's own `## Integration Contracts` section to explicitly name every watermark-stamping chokepoint, with "any write chokepoint not named there is treated as not watermark-stamped." AC-34 makes this an auditable, testable commitment rather than an implicit intent-based judgment call. |
| RT-006 (OQ-02 siteId/workspaceId scoping note) | **RESOLVED** | OQ-02 now explicitly requires its eventual resolution to state whether `storage_write_watermark` scoping is per-`content.db`-file or per-site. This was the entirety of what RT-006 (an ADVISORY, non-blocking) asked for. |
| RT-007 (AC-11 "succeed identically" vague) | **RESOLVED** | AC-11 now specifies only `planHash` must be identical across principal kinds; `planId`/`details` are explicitly exempted from the identity requirement. |
| RT-008 (watermark integer width/overflow unstated) | **RESOLVED** | REQ-01 and `state.spec.md`'s `watermark.value` row both now state "64-bit signed integer... Overflow... explicitly out of scope: unreachable within any realistic product lifetime." |
| RT-009 (unknown/forged token undefined) | **RESOLVED** | REQ-11, AC-35, EC-09, and the `errors.spec.md` `TOKEN_EXPIRED` ownership note all now state an unrecognized/forged token is treated identically to `TOKEN_EXPIRED`, never a distinct code. |
| RT-010 (api_key attribution asymmetry unstated) | **RESOLVED** | REQ-16 and AC-23 now explicitly extend the `(delegatedByWorkspaceId, delegatedById)` requirement to `kind='api_key'` actions and state the symmetry is intentional ("no asymmetry between agent delegation and api_key ownership for this purpose"). |
| RT-011 (Anti-Abstraction Gate constitution pressure) | **RESOLVED** (no content change required) | Re-verified: `spec-dod.md` item G-04 still carries the rule-of-three justification (Storage/Recovery/Collections, with ADR citations) unchanged, in a form directly reusable by the Software Architect for an ADR Complexity Justification table. The Spec Agent's judgment that no further content change was needed is correct — this is architect-facing context, not a defect to fix. |

**Summary:** 10 of 11 prior findings are fully RESOLVED. RT-004 is PARTIALLY RESOLVED — the fix
faithfully addressed the literal actor-identity case but left an equally-named sibling case (the
polymorphic content reference) in the same REQ block without the state/action formalization RT-004
was asking this whole mechanism class to have.

---

## Part 2 — Fresh Findings (this round's own attack-vector pass, including scrutiny of the revision's new content)

## BLOCKING Findings

Spec must be revised before Software Architect dispatch.

### RT-012
- Severity: BLOCKING
- Category: missing-failure-mode / untestable
- Location: REQ-19; `SPEC-016-feature.spec.md` line 222 (`restorePoint.kind` enum)
- Description: REQ-19 declares `restorePoint.kind` as `'file-snapshot' | 'logical-dump' | 'external'`. `'file-snapshot'` is produced by REQ-20/AC-28 (SQLite). `'logical-dump'` is produced by REQ-21/AC-31 and the newly added AC-33 (Postgres, configured/working tooling). `'external'` is never mentioned anywhere else in this 9-file package — not in a requirement, not in an AC, not in the Dependencies table, not in `state.spec.md`'s selectors, not in `traceability.spec.md`. This is the identical defect class RT-003 was BLOCKING for in round 1 (an unreachable enum value with no defined trigger condition), just on the sibling field `kind` instead of `costClass`, and the round-1 revision — which specifically touched this exact REQ-19 sentence to fix `costClass:'expensive'` — did not notice or fix the parallel gap sitting one clause later in the same requirement. A dependent domain spec (or an implementer) has no way to know what condition should ever produce `'external'`, nor can a test be written for it.
- Suggested resolution: Either define the concrete condition that produces `restorePoint.kind: 'external'` (e.g., a future third storage engine, or an externally-managed backup service some site operators plug in) with a corresponding AC, or remove `'external'` from the enum entirely if no such condition is currently in scope for any of the four dependent domains.

### RT-013
- Severity: BLOCKING
- Category: untestable
- Location: REQ-13; AC-18, AC-19; `SPEC-016-errors.spec.md` §3 (`FORBIDDEN.details.reason`)
- Description: The round-1 fix for RT-002 correctly gave the actor-class rejection a defined error *code* (`FORBIDDEN`, second producer), but the field it uses to let a caller/test distinguish "ordinary `authorize()` denial" from "actor-class redemption mismatch" — `details.reason` — is typed only as a bare `string` with illustrative `# e.g. "..."` comments, never a closed enum or a stable discriminator value. AC-18 and AC-19 (both P1) require the response to have `details.reason` "identifying an actor-class redemption mismatch," but "identifying" is not a measurable threshold — one implementer could write `"actor-class redemption mismatch: token confirmed by a different user"` (the exact example string given), another could write a shorter or differently-worded message, and both would satisfy the AC's words while producing different real strings. No single deterministic assertion (e.g. `expect(details.reason).toBe(...)`) can be written against AC-18/AC-19 as worded without the TDD Agent inventing its own exact string, which is precisely the multiple-independent-restatement risk this whole core contract exists to prevent. This is the same untestability shape RT-002 itself was BLOCKING for, one layer deeper — RT-002 fixed "which code" but not "which stable value distinguishes the two producers of that code."
- Suggested resolution: Add a closed, stable secondary discriminator — either an enum `details.reasonCode: enum['NOT_KIND_USER', 'AUTHORIZE_DENIED', 'DELEGATOR_NO_LONGER_GRANTS', 'ACTOR_CLASS_MISMATCH_WRONG_USER', 'ACTOR_CLASS_MISMATCH_WRONG_DELEGATOR', ...]` alongside the free-text `reason` message, or state a single fixed literal string each AC can assert on exactly (e.g. `details.reason === "actor-class redemption mismatch"` verbatim, with any additional detail appended after a fixed delimiter). Update AC-18/AC-19 to assert against the fixed value, not the word "identifying."

---

## ADVISORY Findings

Spec Agent and human are informed. Human decides whether to revise or accept risk. None of these
block Software Architect dispatch on their own.

### RT-014
- Severity: ADVISORY
- Category: missing-failure-mode / ambiguity
- Location: REQ-18; `SPEC-016-state.spec.md` §2–§3 (asymmetric coverage — see RT-004 verdict above)
- Description: See the RT-004 verdict in Part 1 — this is the same gap stated as a forward-looking finding rather than a backward verdict. REQ-18 explicitly covers two flavors of soft cross-boundary reference (composite actor identity across a physical boundary; polymorphic content reference such as `(workspaceId, contentType, contentId)`), but `state.spec.md` only formalizes the first with an entity + Action Catalog row. If the polymorphic-content-reference flavor is intentionally left to each dependent domain to formalize in its own `state.spec.md` (since concrete tables like `entry_terms` are out of scope here per this spec's own Out-of-Scope section), that reasoning is plausible but is never stated anywhere in this package.
- Suggested resolution: Add one sentence to REQ-18 or `state.spec.md`'s Purpose explicitly stating that the polymorphic-content-reference flavor's concrete entity/action contract is each dependent domain's own responsibility (citing REQ-18's validation/orphan-tolerance/sweep rule by number), while this core contract only formalizes the actor-identity instance directly. If that's not the intent, add a generic `PolymorphicContentRef` entity and an `APPEND_CONTENT_REFERENCE` (or similarly named) action mirroring `ActorIdentityRef`/`APPEND_ACTOR_REFERENCE`.

### RT-015
- Severity: ADVISORY
- Category: ambiguity / missing-failure-mode
- Location: REQ-19; AC-33; Dependencies table (Postgres row)
- Description: REQ-19's new trigger condition for `costClass:'expensive'` is "tooling configured and working"; the `'unavailable'` case is "tooling unavailable or unconfigured." Two things are underspecified: (1) how "working" is verified — a live health probe executed at `getCapabilities()` call time (with associated latency/side-effect implications for what is otherwise a cheap read-only capability check), or a static configuration-presence check with no live verification. (2) A Postgres site with tooling *configured* but *non-functional* (wrong binary path, missing permissions, etc.) is not given an explicit bucket — it's only reachable by inference that "unavailable" is meant as a broad catch-all covering any non-working state, not literally "was never configured." That inference is reasonable but is never stated.
- Suggested resolution: State explicitly whether "working" implies a live probe or a static config check, and state explicitly that "unavailable" is the catch-all for any Postgres site that isn't confirmed both configured and currently verified-working (i.e., configured-but-broken tooling also reports `'unavailable'`, not a silently-wrong `'expensive'`).

### RT-016
- Severity: ADVISORY
- Category: untestable / ambiguity
- Location: REQ-14; AC-21; `SPEC-016-api.spec.md` §4 (Request Contracts)
- Description: REQ-14 and AC-21 describe precedence behavior for "a mutating call that has both an idempotency key and an authorization requirement," and this is listed in Scope under the gated-mutation gateway's REQ range (REQ-08–REQ-15). However, no endpoint in this package's own `api.spec.md` §4 (`GATEWAY_PLAN`, `GATEWAY_CONFIRM`, `GATEWAY_EXECUTE`) has an idempotency-key request field anywhere in its schema. It is unclear whether REQ-14 is meant to govern the gateway's own endpoints (in which case a concrete field is missing from the contract) or is a generic rule intended for dependent domains' own ordinary write endpoints that happen to be grouped under this REQ range by document structure. As worded, a test for AC-21 has no concrete request shape to exercise within this package alone.
- Suggested resolution: Either add an idempotency-key field to one of the gateway endpoints' request contracts (if REQ-14 is meant to apply to this contract's own surface) or state explicitly in REQ-14/Scope that this rule is a generic cross-cutting precedence rule for any mutating call site in any dependent domain (gated or not) that happens to use an idempotency key, with the concrete field owned by that domain's own `api.spec.md`.

### RT-017
- Severity: ADVISORY
- Category: missing-failure-mode (information-disclosure tension with the spec's own stated principle)
- Location: `SPEC-016-behavior.spec.md` §2.2 (execute() check ordering)
- Description: The stated check order is `authorize()` → token expiry/redemption-state check → plan re-derivation and hash comparison → actor-class redemption rule → mutation. This means a caller who fails the actor-class rule (e.g., an agent redeeming a token confirmed by someone other than its current delegator) but whose token also happens to be hash-stale would receive `PLAN_STALE`, not `FORBIDDEN` — i.e., they learn the live plan has drifted *before* being told they were never allowed to redeem this token in the first place. This is in tension with a principle this same spec states twice elsewhere: REQ-11 hides whether a `confirmationToken` string was ever minted at all ("so a caller cannot learn whether a given token string was ever issued"), and REQ-14 hides whether a duplicate command exists from an unauthorized caller. The actor-class check is arguably the closer analogue to those two — it is itself an authorization-adjacent gate — yet it is evaluated *after* the plan-staleness check rather than before it, letting an unauthorized-for-this-token caller learn live-state information ahead of being denied.
- Suggested resolution: Either move the actor-class redemption rule earlier in the ordering (immediately after the token expiry/redemption-state check, before plan re-derivation), consistent with REQ-11/REQ-14's established non-disclosure pattern, or explicitly state why the current ordering is an acceptable, low-value information leak (e.g., "whether a plan is stale is not considered sensitive information, unlike token existence or duplicate-command existence").

### RT-018
- Severity: ADVISORY
- Category: ambiguity (internal consistency — minor)
- Location: `SPEC-016-spec-dod.md` Header Metadata (`filled_date`), Section B item B-06 Notes, and Sign-Off Block
- Description: `SPEC-016-spec-dod.md`'s own Header Metadata states `filled_date: 2026-07-14T22:00:00Z`, matching `feature.spec.md`'s `last_edited: 2026-07-14T22:00:00Z`. But item B-06's Notes column ("`last_edited` is a valid ISO-8601 UTC timestamp") cites `2026-07-14T20:00:00Z`, and the Sign-Off Block's Spec Agent row also cites `2026-07-14T20:00:00Z`. This is a two-hour internal discrepancy within the DoD artifact itself — not load-bearing for any REQ/AC, but it is exactly the kind of small drift the traceability/hash discipline in this project exists to catch, and it currently sits uncaught inside the very artifact whose job is quality-gating this package.
- Suggested resolution: Correct B-06's Notes and the Sign-Off Block's Spec Agent row to `2026-07-14T22:00:00Z` to match the header metadata and `feature.spec.md`'s actual `last_edited` value.

---

## CONSTITUTION_FLAG Findings

None newly introduced this round. RT-011 (Article IV — Anti-Abstraction Gate, re-verified RESOLVED
above) remains the only standing constitution-adjacent note, carried forward unchanged from round
1 for Software Architect awareness — it requires no further action here.

---

## Routing Decision

**2 BLOCKING findings (RT-012, RT-013).** This is below the "3 or more" systemic-quality-problem
escalation threshold in the Red-Team persona's own escalation rule, but the Output Format
definition is unconditional: BLOCKING means the spec must be revised before Software Architect
dispatch regardless of count. **Route back to Spec Agent.** Do not patch RT-012/RT-013 inline here.

RT-012 and RT-013 are both narrow, mechanical fixes (one dead enum literal to define or remove; one
free-text field to pin to a closed vocabulary) and should not require another full revision pass —
but per this project's own protocol, Red-Team must re-run against the next hash before Software
Architect dispatch.

ADVISORY findings RT-014 through RT-018 and the carried-forward CONSTITUTION_FLAG (RT-011) should
be included in the Spec Agent's next revision context regardless of the BLOCKING routing — RT-014
in particular touches the same REQ-16–18 block as RT-012/RT-013's neighbors and is cheapest to
resolve in the same pass.
