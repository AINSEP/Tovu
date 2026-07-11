# Red-Team Findings: settings-core-ledger

- Feature: FEAT-007
- Spec version: 0.2.0
- Spec hash: sha256:768c5eeb06b1fd41fd77ac677fb5fd8b2c80eb2ebe212e219f934baaa73f9bdd
- Red-Team completed: 2026-07-11T19:40:00Z
- Finding count: 3 BLOCKING · 1 ADVISORY · 0 CONSTITUTION_FLAG

---

## BLOCKING Findings

Spec must be revised before Software Architect dispatch. 3 BLOCKING findings meet the escalation
threshold — routing back to Spec Agent per the Red-Team escalation rule.

### RT-001
- Severity: BLOCKING
- Category: missing-failure-mode
- Location: AC-22, REQ-11, state.spec.md §3 `SET_VALUE`/`CLEAR_VALUE`
- Description: REQ-11/AC-22 (added in the v0.2.0 `/clarify` pass) let an operator holding
  `settings.user.write` set a value for an arbitrary `principalId` selected via `PrincipalSelector`.
  Nothing in the package specifies what happens when that `principalId` does not exist, is not a
  member of the target `workspaceId`, or belongs to a different workspace than the one in scope.
  `state.spec.md` §3's `SET_VALUE` precondition list ("authorized; scope ∈ scopes; value valid") has no
  principal-existence/membership check, and `errors.spec.md` §2 has no error code for it —
  `DEFINITION_NOT_FOUND` is scoped to setting definitions, not principals. Two developers could
  implement this differently: one silently creates an orphaned `setting_values_user` row for a
  nonexistent principal, another 404s, another 403s — none of which is specified.
- Suggested resolution: Add a `SET_VALUE`/`CLEAR_VALUE` precondition — "target `principalId` must be an
  active member of `workspaceId`" — plus a new error code (e.g. `PRINCIPAL_NOT_FOUND` or
  `PRINCIPAL_NOT_IN_WORKSPACE`) in `errors.spec.md`, wired into `api.spec.md` §6 for `SETTINGS_SET`/
  `SETTINGS_CLEAR`, and a new EC/AC pair covering the rejection.

### RT-002
- Severity: BLOCKING
- Category: scope-creep
- Location: ui.spec.md §2.1a `PrincipalSelector`
- Description: `PrincipalSelector` ("Lets an operator holding `settings.user.write` pick a target
  principal") has no defined data source. No endpoint in `api.spec.md` lists or searches principals,
  no dependency on SPEC-006 identity-and-authorization's principal directory is recorded in
  `feature.spec.md`'s Dependencies table, and Constitution Article I (Library-First) / IV
  (Anti-Abstraction) require reusing an existing primitive rather than the Software Architect inventing
  a new principal-lookup surface ad hoc inside Settings. This is an implied dependency on a system not
  mentioned anywhere in the package.
- Suggested resolution: Either (a) add a Dependencies row on SPEC-006's principal-listing capability and
  reference the specific endpoint/selector `PrincipalSelector` calls, or (b) if no such endpoint exists
  yet in SPEC-006, flag that as a cross-spec blocker before Architect dispatch.

### RT-003
- Severity: BLOCKING
- Category: ambiguity
- Location: api.spec.md §2 `AUTH_WRITE_SCOPED` profile; REQ-06
- Description: `AUTH_WRITE_SCOPED` requires "one of `settings.global.write` / `settings.workspace.write`
  / `settings.user.self.write` / `settings.user.write` matching the request scope" for `scope=user`.
  This does not say which of the two user-scope permissions is "matching" when `principalId` is present
  in the body. Two developers could implement this differently: (a) always require `settings.user.write`
  whenever `principalId` is supplied, even if it equals the caller's own id, or (b) require
  `settings.user.self.write` when `principalId` is omitted/equals-self and `settings.user.write` only
  when it differs from the caller. This is a fail-closed authorization decision (Article VI,
  Security-by-Default) and is not testable as currently worded — AC-11's pattern (holder of one
  permission rejected on another scope) has no equivalent AC for the self-vs-other distinction within
  the user scope.
- Suggested resolution: Add an explicit rule (behavior.spec.md or api.spec.md) stating exactly how the
  server derives self vs. other for `scope=user` (e.g., "required permission is `settings.user.write`
  when the target `principalId` differs from the caller's own principal id; otherwise
  `settings.user.self.write`"), plus an AC covering an operator with only `settings.user.self.write`
  attempting to write another principal's value (expect `FORBIDDEN`).

---

## ADVISORY Findings

### RT-004
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: api.spec.md §3 `WRITE_STANDARD` (30 req/60s, keyed by `userId`)
- Description: An admin using the new `PrincipalSelector` to bulk-configure several other principals'
  user-scope settings (e.g., during workspace onboarding) could plausibly exceed 30 writes/60s, since
  the limit is keyed by the acting admin's `userId` regardless of how many distinct target principals
  they're writing for.
- Suggested resolution: Acceptable as specified — flagging as a known operational limit; no spec change
  required unless the human wants a higher bulk-admin allowance.

---

## CONSTITUTION_FLAG Findings

None. The clarify-pass addition (REQ-11 target-principal affordance) reuses the existing chokepoint and
permission catalog; it does not by itself introduce a library-first, simplicity, or anti-abstraction
pressure point once RT-001/RT-002/RT-003 are resolved.

---

## Routing Decision (original, v0.2.0)

**3 BLOCKING findings.** Route back to Spec Agent — spec is NOT cleared for Software Architect
dispatch. All three trace to the OQ-02 "ship a UI affordance now" resolution added in this session's
`/clarify` pass (REQ-11, AC-22, AC-23, `PrincipalSelector`); the original v0.1.0 package (before OQ-02)
had no BLOCKING findings on this axis. Recommend the human choose: (a) fix RT-001..003 in the spec
before continuing, or (b) fall back to OQ-02's other option (API-only, no UI affordance this pass),
which removes the underspecified surface entirely and reopens `/plan` immediately.

ADVISORY finding RT-004 is included in Software Architect context if/when dispatch proceeds.

---

## Confirm-Pass (v0.3.1, 2026-07-11T20:20:00Z)

Human chose (a): fix in place. Re-checked each BLOCKING finding against the v0.3.1 package.

- **RT-001 — CLOSED.** REQ-13 adds the target-principal check; `PRINCIPAL_NOT_FOUND` is registered in
  `errors.spec.md` §2/§4 and wired into `api.spec.md` §6 for `SETTINGS_SET`/`SETTINGS_CLEAR` (404);
  `state.spec.md` §3 `SET_VALUE`/`CLEAR_VALUE` preconditions and §5 now state the check; AC-24/EC-11
  certify it. During this confirm-pass, a follow-up precision issue was caught and fixed in v0.3.1:
  the initial v0.3.0 wording ("member of workspaceId") implied a workspace-membership join that
  doesn't exist in this codebase's identity model — SPEC-006/ADR-007 tie each principal to exactly one
  `workspace_id` directly (structural scoping, no join table). Reworded to "principal whose own
  `workspace_id` equals the request's `workspaceId`" throughout (REQ-13, INV-09, AC-24, EC-11,
  state.spec.md, behavior.spec.md), referencing the already-listed ADR-007 dependency. No outstanding
  gap.
- **RT-002 — CLOSED.** `PrincipalSelector` (ui.spec.md §2.1a/3.1a) is now specified as a validated
  identifier text field with its own resolve/error contract (`onSubmitPrincipal`,
  `validationState`/`lastError`), not a directory/search picker. No dependency on an unbuilt
  principal-listing endpoint remains; the existing `SETTINGS_SET`/`SETTINGS_GET_EFFECTIVE`
  `principalId` parameter plus the new `PRINCIPAL_NOT_FOUND` response are sufficient to back it.
- **RT-003 — CLOSED.** `behavior.spec.md` §1.3 states the exact self-vs-other derivation rule;
  `api.spec.md` §2 `AUTH_WRITE_SCOPED` notes reference it; `feature.spec.md` REQ-06 states it inline;
  AC-25 (negative) and AC-26 (positive) certify both branches.

No new BLOCKING or ADVISORY findings surfaced in this confirm-pass beyond the RT-001 precision fix
already folded into v0.3.1.

**Updated Routing Decision: 0 BLOCKING findings remain. Spec is cleared for Software Architect
dispatch** (pending a fresh Coordinator Planning Preflight sign-off against v0.3.1, per the compatibility
gate). RT-004 (ADVISORY, rate-limit note) remains open and travels with the spec into Architect context.
