# Critical Internal Constraints: identity-and-authorization (API-key issuance plumbing)

- Spec: SPEC-006 v0.6.0 (hash: sha256:2f74289036a419715d2210352d3de271500e0f8dcd5679207bf4d6ae4d3d65dc)
- ADR: ADR-PIPE-006 (mirrored as ADR-048)
- Implementation Outline: `reports/pipeline/006-identity-and-authorization/implementation-outline.md`
- Prior designations consulted: searched `reports/pipeline/*/critical-internal-constraints.md` for prior designations touching `identity/*`, `authorize.ts`, `grant-service.ts`, `principal_policies`/`policies`/`policy_permissions` — none found (this is the first CIC artifact produced for SPEC-006; the feature predates this skill's introduction into the pipeline).
- Status: PRODUCED
- Trigger result: Security-Critical Sequencing Constraint (1 unit), Algorithmic Correctness Constraint (1 unit)
- Source sync: verified 2026-07-28
- Date: 2026-07-28T00:00:00Z
- Author: Software Architect

> Constraint ledger for designated units only. Does not restate the Implementation Outline's contracts, wiring, or data boundaries — reference by Contract ID (`C-xxx`)/Invariant ID (`INV-x`) only.

## Trigger Decision Matrix

| Trigger | Applies? | Designated Unit(s) | Plausible Wrong Implementation | Broken Property | Required Constraint | Source Trace |
|---|---:|---|---|---|---|---|
| Algorithmic Correctness Constraint | yes | U-002 (`revokeApiKey`, C-006) | Delete the bound principal's frozen policy by re-deriving it from the *requested* `keyId` alone (e.g. assume a stored `policyId` field exists on `ApiKeyRecord`, which it does not per state.spec §2), or blindly delete *all* `principal_policies` rows for the bound principal without first confirming there is exactly one | Orphaned frozen policy rows (never retired) if the wrong row is targeted, or deletion of a different principal's grant if the row-count assumption is wrong | Resolve the frozen policy via `principalPolicies.listByPrincipalId({workspaceId, principalId: apiKey.principalId})`, assert the result has exactly one row, then retire that row's policy | REQ-08, state.spec §3 `REVOKE_API_KEY` row |
| Stateful Protocol Constraint | no | — | — | — | — | — |
| Concurrency / Ordering / Idempotency Constraint | no (revocation is already documented idempotent by the state.spec row itself; no new race is introduced beyond what `disablePrincipal`'s existing "atomic by construction" precedent already covers) | — | — | — | — | — |
| Security-Critical Sequencing Constraint | yes | U-001 (`issueApiKey`, C-005) | Treat the INV-07 grant-authority clamp (`assertGrantClamp`) as sufficient to also enforce AC-26 ("no `*`-bearing source policy"), since an owner caller's clamp check always passes (owner holds `*` unconstrained) — an implementer who runs the clamp first and assumes it "covers" wildcard rejection will let an owner mint an api_key snapshotting the built-in owner policy, producing an owner-tier machine credential | AC-26 (an api_key principal must never be owner-tier); REQ-04's "`*` is owner-only and built-in" invariant | The `*`-bearing-source-policy check (AC-26) MUST run as an independent check, not inferred from or folded into the INV-07 clamp result, and MUST run before any write | feature.spec REQ-08, AC-26, F-054-01 |
| Explicit Performance Budget Constraint | no | — | — | — | — | — |
| Failure / Recovery Constraint | no (no partial-failure/compensation semantics beyond the existing "atomic by construction, no yielded `await` mid-check" convention already accepted elsewhere in this codebase) | — | — | — | — | — |
| Characterization Parity Constraint | no (no brownfield behavior — zero prior plumbing exists, confirmed by the Programmer's escalation) | — | — | — | — | — |

## Designated Units

| Unit ID | Name | Location (module / contract ref) | Designating Trigger(s) | Outline Refs | Trace |
|---|---|---|---|---|---|
| U-001 | `issueApiKey` validation/snapshot ordering | `identity/api-key-service.ts` — C-005 | Security-Critical Sequencing | C-005, INV-A/INV-B/INV-C | REQ-08, INV-07, AC-23/25a/26, F-053-01, F-054-01 |
| U-002 | `revokeApiKey` frozen-policy retirement derivation | `identity/api-key-service.ts` — C-006 | Algorithmic Correctness | C-006, INV-D | REQ-08, state.spec §3 `REVOKE_API_KEY` |

## Unit Constraints

### U-001 `issueApiKey` validation/snapshot ordering

- Responsibility: validate an `ISSUE_API_KEY` request against every REQ-08/INV-07 precondition and, only if all pass, mint the frozen policy snapshot + `api_keys` row.
- Designation: Security-Critical Sequencing — a competent implementer could reasonably treat the INV-07 grant-authority clamp as the single gate for "is this permission delegation allowed," since every other grant-writing transition (`ASSIGN_ROLE`/`ATTACH_POLICY`/`WRITE_POLICY_PERMISSION`) uses the clamp as its only INV-07-flavored check. `ISSUE_API_KEY` is the one transition with a *second*, independent rule (AC-26: no wildcard source) that the clamp cannot express, because the clamp's whole job is "the issuer holds this unconstrained" — and an owner caller holds `*` unconstrained by definition, so the clamp always passes for an owner caller regardless of what is being snapshotted. Omitting the independent wildcard check, or running it only when the clamp fails, breaks AC-26 exactly in the one case that matters (an owner-caller issuing a key).
- Outline refs: C-005, INV-A, INV-B, INV-C

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-001-B1 | The bound `principalId` MUST be confirmed `kind='api_key'` before any other check runs | ESCALATE_SECURITY | AC-23 (no privileged-principal binding → no MF-1-class escalation on the api_key path) | observable: `IssueApiKey` rejects with `VALIDATION_ERROR` and creates no `api_keys` row when the target is `kind != 'api_key'` | AC-23 |
| U-001-B2 | The bound principal MUST be confirmed grantless (zero `principal_roles` AND zero `principal_policies` rows) before any write | ESCALATE_SECURITY | AC-25a; closes F-053-01 (prevents re-issuing a second key to an already-key-bearing principal, and prevents any accumulated authority beyond the issuance-time attached policies) | observable: a second `ISSUE_API_KEY` call against an already-issued principal rejects `VALIDATION_ERROR`, no new row | AC-25a, F-053-01 |
| U-001-B3 | Every requested source `policyId`'s permission rows MUST be scanned for a `permission === "*"` row, independently of the INV-07 clamp, and reject `VALIDATION_ERROR` if any is found — this check MUST NOT be inferred from, short-circuited by, or ordered after a passing clamp result | ESCALATE_SECURITY | AC-26 / REQ-04 ("an api_key is never owner-tier") | observable: an owner-caller request naming the built-in owner policy as a source still rejects `VALIDATION_ERROR`, no key created | AC-26, F-054-01 |
| U-001-B4 | The INV-07 clamp (`assertGrantClamp`, reused unmodified from `grant-service.ts`) MUST run over the distinct union of permission strings carried by all requested source policies, and MUST reject before any write if it fails | — (pre-existing invariant, not newly introduced by this unit) | INV-07 | observable: `GRANT_EXCEEDS_ISSUER` (403) returned, no key created, when the caller lacks an unconstrained hold of a requested permission | INV-07, AC-15 |
| U-001-B5 | All of B1-B4 MUST complete successfully before the frozen policy, its permission rows, the `principal_policies` attachment, or the `api_keys` row are written — no partial mutation on any rejection | ESCALATE_SECURITY | Prevents a half-issued key (e.g. a frozen policy that exists but is never attached, or an attached policy with no `api_keys` row) | observable: on any rejection path, a workspace-wide scan finds no new `policies`/`policy_permissions`/`principal_policies`/`api_keys` rows | REQ-08 (transactional framing consistent with `createUser`'s existing "atomic by construction" precedent) |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-001-ORD1 | B1 (kind check) before B2 (grantless check) before B3 (wildcard-source check) before B4 (INV-07 clamp) before any write | Each check's error code is independently reachable and testable (AC-23 vs AC-25a vs AC-26 vs `GRANT_EXCEEDS_ISSUER` must each be triggerable by a request that fails *only* that check) — reversing B3 and B4 would make B3 unreachable for an owner caller (see Designation) | distinct HTTP status/error-code pairs for each isolated failure case | ESCALATE_SECURITY | AC-23, AC-25a, AC-26, AC-15 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-07 | feature.spec.md | U-001-B3, U-001-B4 |
| AC-23 | feature.spec.md / state.spec.md §3 | U-001-B1 |
| AC-25a | feature.spec.md / state.spec.md §3 | U-001-B2 |
| AC-26 | feature.spec.md / state.spec.md §3 | U-001-B3 |

#### Design Context (optional, non-binding)

The grantless check (B2) is not primarily a race guard — `ASSIGN_ROLE`/`ATTACH_POLICY` already refuse any `api_key`-kind target (AC-25b), so an api_key principal can never receive a grant through the human path at all. B2's real job is preventing *re-issuance reuse*: a second `ISSUE_API_KEY` call targeting a principal that already has a frozen policy attached from a prior issuance. An implementer reasoning "AC-25b already makes api_key principals ungrantable, so B2 is redundant" would miss this case.

### U-002 `revokeApiKey` frozen-policy retirement derivation

- Responsibility: revoke an `api_keys` row and retire exactly the one frozen `policies` row (+ its `policy_permissions` rows + its `principal_policies` attachment) that `issueApiKey` created for it.
- Designation: Algorithmic Correctness — `ApiKeyRecord` (state.spec §2) carries no `policyId`/`frozenPolicyId` field, so the frozen policy to retire must be *derived*, not looked up by a stored pointer. The derivation is only correct because of an invariant that lives in a different unit (U-001-B2/B5: a grantless bound principal receives at most one `principal_policies` row, ever, for the lifetime of this design). A plausible wrong implementation either invents a lookup that doesn't match this derivation (e.g. matching frozen policies by name/label string) or skips the "exactly one" assertion and silently deletes zero, one-of-several, or (worse) iterates and deletes every `principal_policies` row for that principal without confirming they all belong to this key.
- Outline refs: C-006, INV-D

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-002-B1 | Resolve the frozen policy to retire via `principalPolicies.listByPrincipalId({workspaceId, principalId: apiKey.principalId})`, never via a name/label match or a stored pointer field that does not exist on `ApiKeyRecord` | ESCALATE_IRREVERSIBLE | Correct target selection for a permanent delete | observable: integration test asserts the correct policy id is deleted | REQ-08, state.spec §3 `REVOKE_API_KEY` |
| U-002-B2 | Before deleting, assert the `listByPrincipalId` result has exactly one row; if it does not, abort the retirement step without deleting any policy row (the `api_keys.revokedAt` write may still proceed — REQ-08 requires the key to stop authenticating immediately regardless) and surface this as an internal error, not a silent no-op | ESCALATE_IRREVERSIBLE | Prevents deleting zero rows (orphaned frozen policy) or an unintended row under an invariant violation elsewhere | observable: a fault-injection test that pre-violates the one-row invariant (constructs 0 or 2 `principal_policies` rows for the principal before calling `revokeApiKey`) surfaces an internal error rather than deleting an arbitrary row | state.spec §3 `REVOKE_API_KEY`, INV-07 (defense-in-depth) |
| U-002-B3 | Deletion order: delete `policy_permissions` rows for the frozen policy, then the `principal_policies` attachment, then the `policies` row itself, then set `api_keys.revokedAt` — OR any ordering that leaves no window where the frozen policy is attached-but-permission-less in a way `resolveEffectivePermissions` could read as "unconstrained" (see Required Ordering below) | ESCALATE_SECURITY | A mid-sequence read must never observe a frozen policy with its permission rows already gone but its `principal_policies` attachment still present in a shape that could be misread by a concurrent `authorize()` call | audit-only: single-connection/single-event-loop execution makes this unobservable in the current runtime (matches `deletePolicy`'s existing accepted reasoning for its own cascade order); re-verify if this codebase ever moves to multi-connection concurrent writes | REQ-08 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-002-ORD1 | Resolve-and-assert-exactly-one (B1+B2) before any delete | Prevents an incorrect or partial delete on the very first observable step | integration test: pre-violate the invariant, confirm no delete occurs and an internal error is surfaced | ESCALATE_IRREVERSIBLE | REQ-08 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-D (this outline) | `implementation-outline.md` Critical Invariants | U-002-B1, U-002-B2 |
| REQ-08 | feature.spec.md | U-002-B3 |

#### Design Context (optional, non-binding)

This unit's fragility (deriving a 1:1 relationship without a stored FK) is a direct consequence of `ApiKeyRecord`'s state.spec-specified shape, which this ADR does not alter (state.spec §2 is spec-owned, not architecture-owned). Adding an explicit `frozenPolicyId` column to `api_keys` would remove the need for U-002 entirely and is a reasonable future spec amendment, but is out of scope here — flagged as a risk in the ADR instead of unilaterally added.

## Deviation And Promotion Protocol

- `ESCALATE_SECURITY`/`ESCALATE_IRREVERSIBLE` constraints above (U-001-B1/B2/B3/B5/ORD1, U-002-B1/B2/B3/ORD1): any deviation requires a recorded `[CIC_DEVIATION_APPROVED]` entry before implementation, per the critical-internal-constraints skill.
- No other Binding constraints in this artifact (all rows above carry an escalation marker).

## Downstream Handoff Notes

- Coordinator: tasks touching `identity/api-key-service.ts` must reference U-001/U-002 in `tasks.md`.
- TDD focus: U-001-B3 (wildcard-source rejection independent of the clamp) and U-002-B2 (fault-injected non-one-row case) are the two highest-value tests in this entire slice — both encode a failure mode that "obvious" test coverage (happy path + single rejection reason) would miss.
- Programmer audit focus: confirm the four checks in U-001 are literally four separate conditionals in source order (not folded/short-circuited), and confirm U-002 asserts row count before deleting rather than trusting it implicitly.
- Open risks or ambiguities: none beyond what the ADR's Risks section records (the missing `frozenPolicyId` field, noted above as Design Context).
