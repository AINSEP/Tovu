# ADR-021: Identity & Authorization — Principal-Centric Hybrid, No PolicyPort, Workspace-Isolated by Composite Key

- Status: ACCEPTED 2026-07-07 (fills the SPEC-001 actor/permission seam; relates to ADR-006, ADR-007, ADR-008, ADR-011, ADR-013/014/016, ADR-015, ADR-020; specs SPEC-001, SPEC-005)
- Date: 2026-07-07
- Author: Claude Opus 4.8 (Primary) / Leon Aburime — synthesized from a 2-round Swarm Debate (Codex gpt-5.5, Gemini 3.1 Pro via `agy`, Fable subagent)

## Context

Tovu authenticates a single hardcoded local admin (`actorId: "user-local"`) — the "Article VI
dev-only exception." There is no identity, role, or permission model. Meanwhile the command
gateway (SPEC-001) already routes every admin mutation through an auditable, revertible
change-set and **reserves an actor/permission seam** stubbed to `user-local`. Plugins already
hold capabilities enforced at the SDK boundary (SPEC-005), and AI agents are slated to be
first-class principals riding the same capability-scoped API (ADR-013/014/016). Every domain
event, repo call, job, and cache key is already workspace-scoped (ADR-007). The question: what
identity & authorization model fills the gateway seam, uniformly serving humans, AI agents,
plugins, and API clients, without repainting later?

**Topology is settled (owner, 2026-07-07): local-first / self-hosted.** Each site is a folder
with its own SQLite `content.db`; a desktop shell (Tovu-Runner, Electron) manages several local
sites *above* the core (ADR-011 topology 2). There is **no hosted multi-tenant server.** This is
load-bearing: a hosted model would have justified a central identity/policy service (a real
second adapter) and thus a port; local-first does not.

This ADR was produced by a two-round adversarial debate. Round 1 (blind) surfaced five candidate
models (A: WordPress roles+caps; B: Directus roles→policies→permissions; C: object-capability
tokens; D: Zanzibar/ReBAC; E: hybrid behind a PolicyPort). Round 2 (informed) critiqued a
proposed relational schema; three independent voices returned **adopt-with-changes** (confidence
0.85–0.90) and converged on the refinements recorded below.

## Decision

### 1. Principal-centric hybrid; RBAC for humans, scoped grants for machines

One `principals` table is the root of identity — every actor (human user, AI agent, API key,
system) is a principal row, and `change_set.actorId` is a principal id. Humans get **roles →
policies → permissions** (Directus-shaped, candidate B's *shape*). Agents and API keys are
distinct principals that receive **scoped grants** (a policy attached directly, not via a role).
**Plugin capabilities stay a separate axis** enforced at the SDK boundary (SPEC-005) — they are
*not* re-routed through the authorization decision. Candidate A is the seed ceremony (four flat
built-in roles), not the terminal model. Candidate D (ReBAC) is rejected for a local single-
workspace-per-`content.db` CMS (SPEC-003). Candidate C is rejected as the model but kept as the
*credential shape*: tokens resolve to a principal row (auditable, revocable), never anonymous
bearer capabilities.

### 2. No PolicyPort in v1 (ADR-006 applied to itself)

Authorization is an ordinary core function — `authorize(principalId, permission, { workspaceId,
entityType, entityId? }) → { allowed, reason }` — called by the gateway before every mutation, and
**before the idempotency short-circuit** so a `DUPLICATE_COMMAND` result (and the original
`changeSetId`) is never disclosed to a caller who is not authorized.
It is **not** a port: ADR-006 requires two plausible adapters, and only one evaluator exists
(the local SQLite rules). "OpenFGA/hosted policy service later" is exactly the speculative second
adapter ADR-006 exists to prevent. The *data* it reads sits behind repo ports that genuinely pass
rule-of-two (Drizzle in-memory + SQLite, ADR-015). Refactor `authorize()` into a port the day a
real second evaluator is built.

### 3. One permission language (no vocabulary drift)

Permissions are **flat dotted strings** (`content.write`, `theme.set`, `changeset.revert`, …)
validated against a **code-side registered catalog** (core owns the base set; features register
more), enumerable at runtime (`tovu permissions list`) — the anti-hook-soup rule (ADR/SPEC-005)
applied to authZ. Not a DB enum (avoids a migration per new permission). The built-in `owner` policy holds the
wildcard `*` (owner-only), evaluated dynamically so `owner` covers permissions features register
after seed — a frozen enumerated owner list would lock the superuser out of new capabilities
(SPEC-006 REQ-04/REQ-09). Non-owner built-ins stay enumerated (least privilege; they do not
auto-grow). **ADR-014's coarse tool-auth ranks (`public<member<admin<owner`) are re-expressed as
these same permission strings now**: the four seed roles *are* those bundles. Keeping a second rank language would mean two evaluators
— the very condition used to reject a PolicyPort.

### 4. Workspace isolation is relational, not conventional

"Every row carries `workspace_id`" is insufficient. **Every foreign key crossing a scoped table
is composite on `(workspace_id, id)`** so a role/policy/session/grant from one workspace cannot
attach to a principal in another within the same `content.db`. This was the unanimous worst-defect
finding of the debate — a bare-id FK is a silent cross-workspace privilege escalation. This
requires **every scoped child/join table to carry its own `workspace_id` column** — `users`,
`sessions`, `api_keys`, `principal_roles`, `role_policies`, `policy_permissions`,
`principal_policies`, and `change_sets` — not just the parents; the composite FKs are otherwise
unbuildable (SPEC-006 REQ-10).

### 5. Audit durability: principals are disable-only

Principals are **never hard-deleted** — `status='disabled'` + `disabled_at`. A `DELETE` would
dangle or cascade `change_set.actorId` and destroy the audit/revert guarantee SPEC-001/ADR-008
rest on. Historical `user-local` actor ids are retained as-is; nothing rewrites history. Because
`change_set.actorId` is now a composite FK into `principals` (§4), first boot **seeds a disabled
`user-local` principal** in the local workspace so pre-existing `user-local` change-sets satisfy
the constraint without any history rewrite (SPEC-006 REQ-09/EC-09).

### 6. Agent & delegation semantics

An agent is a distinct `kind='agent'` principal created by a delegating user. Effective access is
computed **at evaluation time** as `grant ∩ delegator's current effective permissions` — never
snapshotted; a disabled/downgraded delegator instantly collapses the agent's access. Change-sets
stamp the agent's `actorId` plus `delegatedBy`. Chained delegation (an agent creating an agent) is
**forbidden in v1**. Principal `kind` is enforced on both ends of a grant.

### 7. Authentication & storage

Local username/password (**argon2id**), server-side revocable `sessions` in `content.db`, cookie
`HttpOnly`+`SameSite=Strict`. Per ADR-020, the admin session must be unreachable from the theme
plane: admin on its own origin, tier-2/3 theme code on a separate cookie-less origin. **API keys
are in v1** (hashed at rest; resolve to a `kind='api_key'` principal) because **Tovu-Runner needs
headless auth to a served site's core without spoofing a browser session** — a real day-1
consumer, not speculative. Identity lives **per-site in `content.db`** (forced by SPEC-003's
portability contract — an install dir must carry its own admins); the desktop shell federates
*above* site identity (its own operator auth provisions/uses an owner principal per site), keeping
the ADR-011 dependency arrow one-way (Runner → Tovu).

### 8. Fail-closed extensibility seam

`policy_permissions` carries nullable `resource_type` / `constraint_json` as the additive ABAC /
field-scoping seam for later. **The v1 evaluator MUST DENY any permission row bearing a
`constraint_json` it cannot interpret**, and a **`resource_type`-scoped row matches only when
`resource_type == context.entityType`** — a missing or mismatched entity type is denied, never
treated as a global grant. Both seams are fail-closed: otherwise a future field-scoped or
resource-scoped grant read by an old (or under-specified) evaluator silently becomes
*unconstrained*. Growth is additive rows, never a schema repaint.

### 9. Target schema (build the full shape; seed it simple)

`principals`, `users`, `sessions`, `api_keys` **[v1]**; `agents`, `agent_grants` **[later — AI
phase]**. AuthZ: `roles`, `policies`, `policy_permissions`, `role_policies`, `principal_roles`,
and **`principal_policies` [v1]**. `principal_policies` (a policy attached directly to a principal)
is v1 because a `kind='api_key'` principal is v1 (§7) but roles are the human path — **without a
direct-grant path an API key could hold no permission at all**, making the v1 key un-grantable.
v1 seeds four built-in roles (owner/admin/editor/viewer) mapped 1:1 to four built-in policies (so
the roles↔policies indirection is invisible until a feature needs composable bundles) plus a
seeded `system` principal for first-boot bootstrap. Built-in roles/policies are seeded
`is_builtin=true` and **immutable** — undeletable, un-editable, *and* un-attachable-to (no new
`role_policies`/`policy_permissions` row may reference a built-in parent), so a `role.manage` holder
cannot escalate `viewer` (or any built-in) by delete, edit, or attach; new capability comes only
from new non-built-in rows. Full table/field detail lives in SPEC-006.

## Consequences

- **Removes the Article VI exception** and gives the gateway a real, durable `actorId` — unblocking
  agent editing (ADR-016 "an agent cannot exceed its caller's permissions" becomes enforceable, not
  just profile-filtered) and any permissioned admin surface.
- **Three enforcement points, one vocabulary:** the gateway `authorize()` call (mutations), the
  SPEC-005 SDK boundary (plugin capabilities), and the ADR-014 tool-registry filter (agent tool
  discovery) are unified by *shared permission strings + the change-set audit envelope*, not by a
  shared interface. This is the debate's core reframing: unify the vocabularies, not the mechanisms.
- **New v1 build surface:** the identity/authZ tables + `authorize()` + argon2id login + session
  management + API-key issuance/verification + `tovu permissions list`. Bounded; no policy-rule
  engine, no field-level matrices, no ReBAC in v1.
- **Issuance-time authority clamp:** a credential (API key / direct grant) may never be minted
  carrying authority beyond the *issuer's* at issuance. The v1 rule requires the issuer to hold each
  delegated permission **unconstrained** (`resource_type`/`constraint_json` both null; owner's `*`
  qualifies), so neither an owner-policy attach by an admin nor a scope-widening (a `post`-scoped
  `content.write` minted as a global key) is possible (SPEC-006 INV-07/REQ-08). Requiring an
  unconstrained hold is fail-closed and avoids scope-comparison arithmetic (which would need the
  deferred `constraint_json` engine, OQ-03). Without this bound, `apikey.manage` would be arbitrary
  privilege escalation. Built-in policies are also
  **un-attachable-to** (no new `role_policies`/`policy_permissions` row may target an `is_builtin`
  parent) so a built-in cannot be escalated by attachment, only by deletion/edit — all three barred.
- **Known asymmetry (documented, accepted):** an API key or direct grant minted by an admin who is
  later demoted retains its granted power until revoked (no *live* delegator clamp on non-agent
  direct grants — distinct from the issuance-time clamp above, which always holds). Acceptable for
  v1; revisit when direct grants get richer.
- **No security rule relaxed:** ADR-003/004/005 (plugin trust), ADR-007 (workspace scoping — now
  relationally enforced), ADR-008 (actor on every change-set), ADR-020 (session origin isolation)
  all hold or strengthen.

## Alternatives considered

- **A — WordPress roles + flat caps:** rejected as terminal model (no entity scoping; conflates
  plugin-code rights with user rights). Kept as the v1 seed ceremony.
- **B — Directus roles→policies→permissions:** adopted as the schema *shape* and growth path;
  the policy-rule *engine* (filter expressions, field granularity) deferred until a feature needs it.
- **C — Object-capability tokens:** rejected as the model (fails ADR-008's durable-actor and the
  enumerability requirement; distributed-token revocation hole). Kept as the credential shape —
  tokens resolve to principal rows.
- **D — Zanzibar / OpenFGA ReBAC:** rejected for v1 — a second stateful store breaks SPEC-003's
  site-is-a-folder portability; the v1 check is one indexed join. `authorize()` is the seam to put a
  relation-aware evaluator behind *if* per-entity sharing graphs ever become real.
- **E — Hybrid behind a PolicyPort:** the hybrid semantics adopted; the **port rejected** (one real
  adapter — ADR-006), and the "everything through one port" unification rejected as false (plugin
  caps enforce at SDK-construction time, not a runtime call).

## Follow-ups

- **SPEC-006 — Identity & Authorization** (this ADR's implementing spec): the full schema, the
  `authorize()` contract + gateway wiring, login/session/API-key flows, seed data, and the
  permission catalog. To be Red-Teamed + externally audited like SPEC-001…005.
- Re-express ADR-014's tool-registry `auth` axis as permission strings when the assistant surface
  is specced (Phase 5) — the vocabulary is fixed here so that spec inherits it.
- Revisit direct-grant delegator-clamp and richer policy rules when a second human-user / sharing
  use case appears (would also re-open a sliver of D).
