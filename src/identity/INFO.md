# identity Overview

Implements ADR-021 / SPEC-006's core path: every actor is a `principals` row;
humans get RBAC (`roles -> policies -> permissions`); machines get direct
policy grants (`principal_policies`); `authorize()` is the one fail-closed
evaluator the command gateway calls before every mutation.

## Responsibilities

- Root identity (`principals`) and human credentials (`users`, argon2id).
- Revocable server-side sessions (`sessions`), absolute 30-day expiry.
- RBAC schema + first-boot seed (4 built-in roles/policies, disabled legacy
  `user-local` principal, owner user).
- `authorize()` — ordinary core function, not a port (ADR-006/ADR-021 §2).
- The registered permission catalog (REQ-03/REQ-12).

## Rules

- Every scoped table/join carries its own `workspaceId` and is looked up by
  composite `(workspaceId, id)` — never a bare id (ADR-021 §4/INV-01).
- Principals are disable-only; there is no hard-delete path (INV-02).
- `authorize()` is fail-closed: a non-null `constraintJson` it cannot
  interpret, or a `resourceType` that doesn't match `entityType`, both deny —
  never treated as an unconstrained/global grant (ADR-021 §8/INV-03).
- Passwords and session tokens are hashed; raw values are never stored or
  logged (INV-05).

## Scope note (this pass)

Out of scope, deferred per the Programmer handoff: API keys (`api_keys`,
`ISSUE_API_KEY`), agent principals/delegation, rate limiting, the grant-writing
transitions (`ASSIGN_ROLE`, `ATTACH_POLICY`, `WRITE_POLICY_PERMISSION`,
`CREATE_USER`, `DISABLE_PRINCIPAL`) and their INV-07 grant-authority clamp. The
schema shapes (`isFrozen` on policies, the `agent`/`api_key` `PrincipalKind`
variants) are built to the full ADR-021 §9 target so those transitions are
additive later, not a repaint.

## Persistence direction

In-memory adapters only this pass (`repo.memory.ts`), matching the disclosed
precedent of `members`/`navigation`/`integrations`/`analytics` — see
`src/server/deps.ts`'s comments. A SQLite adapter (Drizzle, ADR-015
rule-of-two) is a later step.
