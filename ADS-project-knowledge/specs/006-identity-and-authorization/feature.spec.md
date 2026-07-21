# Feature Spec: Identity & Authorization — Principals, Roles/Policies, the `authorize()` Gate

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-006 |
| version | 0.6.0 |
| status | DRAFT |
| content_hash | sha256:2f74289036a419715d2210352d3de271500e0f8dcd5679207bf4d6ae4d3d65dc |
| feature_name | FEAT-006-identity-and-authorization |
| last_edited | 2026-07-21 |
| revision_note | **0.6.0-DRAFT (2026-07-21) — AMENDMENT: completes the users/roles/policies admin CRUD surface** (Coordinator dispatch, "Users/Roles/Policies + Plugins admin surface" slice). v0.5.6's security core (authorize matcher / INV-07 clamp / composite FKs / hash-only secrets) is **byte-unchanged**; this amendment is purely additive scope, so **status reverts to DRAFT pending a fresh human checkpoint + Red-Team pass over the new material only** — see the Implementation Readiness Gate for the itemized reopen. **What's new:** (1) two transitions this spec already fully specified — `DISABLE_PRINCIPAL` (REQ-11) and `WRITE_POLICY_PERMISSION` (INV-07) — were approved in v0.5.x but never got an HTTP route; this amendment gives them one. (2) Five brand-new transitions close the actual CRUD gap: `ENABLE_PRINCIPAL` (symmetric re-activation of a disabled user — no prior spec covered re-enabling), `UPDATE_USER` (edit a user's `email`), `RESET_USER_PASSWORD` (admin-initiated credential reset, distinct from the still-deferred self-service OQ-04 flow), `UPDATE_ROLE`/`UPDATE_POLICY` (rename a non-built-in role; rename/re-describe a non-built-in, non-frozen policy), and `DELETE_ROLE`/`DELETE_POLICY` (hard-delete a non-built-in, non-frozen role/policy **with zero live references** — see the new INV-09 rationale for why this is a deliberate, disclosed divergence from principals' disable-only rule, not an inconsistency). (3) **Disclosed pre-existing drift repaired:** api.spec.md's Endpoint Registry (§1) previously listed only 5 endpoints and stated in §6 that "user/role/policy management is core/CLI in v1 ... admin UI is deferred (OQ-06)" — that has been **false since the "Admin-sweep feature drop" commit** (`c2f9869`, predating this amendment), which added 8 working HTTP endpoints (`list`/`create` for users, roles, policies; `assign-role`; `attach-policy`) and a real `Users.tsx`/`Roles.tsx` admin UI, none of which api.spec.md ever documented. This amendment brings api.spec.md current with reality (documents the 8 pre-existing endpoints) in the same pass as adding the 9 new ones, rather than layering more drift on top. OQ-06 is marked RESOLVED below. Prior history: 0.5.6-APPROVED (2026-07-09) — **DRAFT→APPROVED human checkpoint cleared** by owner Leon Aburime. The coupled approval-gate markers were flipped: Implementation Readiness Gate CONDITIONAL PASS → PASS; DoD B-03 (status) and B-32 (readiness gate) FAIL → PASS; Overall DoD FAIL → PASS. No normative content changed since 0.5.6 (security core still byte-unchanged); the canonical content_hash was recomputed only to absorb the in-body gate-marker flips. 0.5.5 — v0.5.4 ROUND-5 FINAL CONFIRM fix (`/audit-work` round 5, TM-SPEC006-DELTA-01; Gemini 3.1 Pro High FAIL 3.0 + Codex GPT-5.5 xhigh FAIL 7.8 + internal Fable Security FAIL 7.5). Fable's exhaustive writer census confirmed the 4-round **bound-principal api_key-inheritance class is CLOSED/terminal**, but all three converged on ONE new HIGH, **F-054-01** — a *different* wall, bounded below owner-`*`: v0.5.4 froze the grant *rows* at issuance but not the *permissions those rows resolve to*. A shared non-built-in policy attached at issuance could be widened later by `WRITE_POLICY_PERMISSION` (a **legal** edit for an owner / `role.manage` holder, clamped to the *widener*), and `resolveEffectivePermissions` reads policies **live**, so an already-issued api_key key grew post-issuance above what its issuer could clamp-grant (the drift-**up** twin of the already-accepted EC-07/OQ-02 demoted-issuer asymmetry; can never reach owner-`*`, since `*` lives only on the immutable built-in owner policy). Fix (**issuance snapshot**): `ISSUE_API_KEY` no longer attaches a live reference to a caller-supplied shared policy — it **copies** the clamped permissions into a fresh `is_frozen=true`, machine-owned policy and attaches *that*; `WRITE_POLICY_PERMISSION` refuses any `is_frozen` (or `is_builtin`) policy, so a later legal widening of a *source* policy can never reach an already-issued key. This makes "a key's authority is fixed at issuance" true against *permission* drift, not only *row* drift. New **AC-26**; `policies.is_frozen` flag; INV-07 issuance-snapshot clause; state.spec §1/§3/§5 updates. Security core still byte-unchanged. 0.5.4 — v0.5.3 ROUND-4 FINAL CONFIRM fix (`/audit-work` round 4, TM-SPEC006-DELTA-01; Codex GPT-5.5 xhigh FAIL 8.0 + Gemini 3.1 Pro High FAIL 7.5 both blocked on the unclamped `role_policies` writer; internal Fable Security FAIL 7.5 found the deeper **F-053-01**). **F-053-01 (HIGH, two-actor api_key escalation):** the v0.5.3 grant clamp locks every transition that *writes* a grant, but `ISSUE_API_KEY` reads only the issuance-time *attached* policies, not the bound principal's *pre-existing* authority — and v0.5.3 made `api_key`-kind principals endowable to owner-tier via `ASSIGN_ROLE`/`ATTACH_POLICY`. Path: owner legally endows an `api_key` principal K to owner-`*` → admin (holds `apikey.manage`) issues a second key bound to K with a modest policy → the kind check and attached-policy clamp both pass → admin's raw key authenticates as K = owner-`*`. **Class-closing fix (isolates machine authority to one clamped issuance):** (1) `ISSUE_API_KEY`'s bound principal must be **grantless / freshly minted** (no pre-existing `principal_roles`/`principal_policies` rows) — its authority is then exactly the issuance-time attached policies, already INV-07-clamped to the issuer; a non-grantless bound principal → `VALIDATION_ERROR` (AC-25a). (2) `ASSIGN_ROLE`/`ATTACH_POLICY` target **human** (`kind='user'`) principals only — an `api_key`/`system` target → `VALIDATION_ERROR` (AC-25b); machine authority is set solely at issuance, restoring the REQ-02 human/machine split, so an api_key principal's authority is immutable after its single issuance and an admin can never obtain an owner-`*` key. (3) **F-053-02 (LOW):** `role_policies` (custom role→policy binding) is declared **not user-writable in v1** — custom grants flow via `principal_policies`/`ATTACH_POLICY`; no AC needs custom-role composition. INV-07 now enumerates all grant writers + the grantless-issuance rule; **AC-24** reconciled (assigning a role to an api_key principal is now `VALIDATION_ERROR`, not `GRANT_EXCEEDS_ISSUER`); new **AC-25** certifies both `VALIDATION_ERROR` paths. Security core still byte-unchanged. 0.5.3 — v0.5.2 RE-CONFIRM round (`/audit-work` round 3, TM-SPEC006-DELTA-01; Codex GPT-5.5 xhigh FAIL 7.2 + Gemini 3.1 Pro High FAIL 6.0 + internal Fable Security PASS 9.5). The two external auditors flagged the v0.5.2 F2 transitions (`ASSIGN_ROLE`/`ATTACH_POLICY`) as a privilege-escalation path; Fable proved via REQ-09 that `role.manage` is owner-only so the seeded-config exploit is unreachable, but the boundary rested entirely on that fact. Fix (structural, honoring INV-07's own "any future direct grant" language): **INV-07 generalized into a grant-authority clamp** over ALL grant-writing transitions — `ISSUE_API_KEY`, `ASSIGN_ROLE`, `ATTACH_POLICY`, `WRITE_POLICY_PERMISSION` — so no principal may grant authority it does not itself hold unconstrained; assigning/attaching the built-in `owner` role/policy therefore requires holding `*` (owner-only), closing the mint-`api_key`→assign-`owner`→issue-key chain (Codex F-052-01) and the delegated-`role.manage` self-escalation (Gemini/Codex F-052-02). Also: dropped the wrong INV-06 citation on `ATTACH_POLICY` (built-in policy attach is clamp-bounded, not forbidden — aligns with AC-15/Fable F4); added `role.manage` gate to `WRITE_POLICY_PERMISSION` (Fable V-1); documented `role.manage` as owner-equivalent (Fable V-2). New **AC-24** certifies the generalized clamp. Security core still byte-unchanged. 0.5.2 — v0.5.1 CONFIRMING delta re-audit fixes (`/audit-work` round 2, TM-SPEC006-DELTA-01; internal Fable Security verifier 8.5 + Codex GPT-5.5 xhigh 9.6 + Gemini 3.1 Pro High 10; all 3 confirmed MF-1/2/3+SF-1/2/3 resolved and the gate PASS, but the Fable falsification pass caught 2 gaps the externals missed). **F1 (HIGH escalation — api_key twin of MF-1):** `ISSUE_API_KEY` had no enforceable precondition that the bound `principalId` is `kind='api_key'` (only an api §4 field description), so an `apikey.manage` admin could bind a key to the seeded owner principal and authenticate as owner. Fixed: REQ-08 + state.spec §3 `ISSUE_API_KEY` now require the bound principal to be `kind='api_key'` (minted via `CREATE_PRINCIPAL`); non-`api_key` target → `VALIDATION_ERROR`; new **AC-23** (negative, twin of AC-22) + behavior §7 row. **F2 (MEDIUM buildability):** no transition wrote `principal_roles`/human `principal_policies`, so editor/admin/non-seed-owner principals (AC-03/AC-11/AC-21) were unconstructable. Fixed: state.spec §3 adds `ASSIGN_ROLE`/`ATTACH_POLICY` (gated `role.manage`, INV-06-respecting); REQ-02 documents it; AC-21 reworded to be per-workspace and construct the second owner via `ASSIGN_ROLE`. **F3 (LOW):** api §6 unmapped-codes note now includes `OWNER_REQUIRED`. F4/F5 deferred (safe as written / Architect seam). Security core still byte-unchanged. 0.5.1 — v0.5.0 delta re-audit fixes (TM-SPEC006-DELTA-01; Codex GPT-5.5 xhigh + Gemini 3.1 Pro + Fable). **MF-1 (Codex blocker):** RT-003's `CREATE_USER` took a caller-supplied existing `principalId` → an admin (`member.manage`) could bind a password to the seeded owner principal and log in as owner (escalation around authorize()). Fixed: REQ-01 — a `users` row is only ever created together with a NEW `kind='user'` principal in one transaction; a credential is never attached to a pre-existing principal; gated by `user.manage` OR `member.manage` (admin can onboard); new AC-22 (negative). `CREATE_PRINCIPAL` is machine-only (api_key; agent refused). **MF-2 (Fable HIGH):** the seeded owner principal is now un-disable-able in v1 (REQ-11/INV-08/AC-21) — it is REQ-13's CLI resolution target, so disabling it would brick the CLI-only management plane. **MF-3 (3-way converge):** INV-08 count-check + disable now one atomic transaction (no concurrent-disable lockout). **SF:** REQ-13 excludes plugin in-process callers from owner-resolution; REQ-14/api §3 pin the forwarded-for parse rule; new `OWNER_REQUIRED` error names the lockout refusal; stale v0.4.1 binding comments/notes corrected. Security core still byte-unchanged. 0.5.0 — Red-Team revision pass (report `reports/pipeline/006-identity-and-authorization/red-team-findings.md`). Closes RT-001 (BLOCKING) + RT-002..005 (ADVISORY); RT-006 flagged for Architect. **RT-001:** non-HTTP callers (`tovu` CLI / in-process core) had no defined principal, so REQ-05's "authorize every mutation" was unrealizable for the v1 CLI surface → NEW REQ-13 + AC-17 + EC-12: the CLI resolves to the seeded owner principal ("local shell == owner" trust boundary, ADR-021), retiring the Article VI exception for mutations; revisit tracked as OQ-08 (owner's explicit request to come back to this). **RT-002:** rate limiting traced to no REQ/AC → NEW REQ-14 + AC-18 anchoring the three profiles + the LOGIN_STRICT trusted-proxy client-IP rule. **RT-003:** creation transitions unmodeled → state.spec §3 adds CREATE_PRINCIPAL/CREATE_USER/CREATE_ROLE/CREATE_POLICY; NEW AC-19 certifies the duplicate-username RESOURCE_CONFLICT. **RT-004:** session lifetime unpinned + no expired-session test → behavior §4 pins absolute 30-day expiry; NEW EC-13 + AC-20. **RT-005:** disable was an unguarded kill-switch → REQ-11 pins the `user.manage` gate, NEW INV-08 (last-owner lockout guard) + AC-21. The audit-clean security core (authorize matcher / INV-07 clamp / composite FKs / hash-only secrets) is unchanged. 0.4.1 — package-completeness pass (Open Questions + Constitution Compliance + Implementation Readiness Gate). 0.4.0 — round-3 audit fix: INV-07/REQ-08/AC-15/EC-11 require the issuer to hold each delegated permission UNCONSTRAINED (owner's `*` qualifies). 0.3.0 = R2 fixes; 0.2.0 = B1-B3+A1/A2. |
| owner | Leon Aburime |
| spec_agent | Coordinator (Primary) |
| spec_mode | brownfield |

---

## Overview

ADR-021 made real: replace the single hardcoded `user-local` actor (the "Article VI dev-only
exception") with a **principal-centric identity & authorization model**. One `principals` table
roots every actor (human user, AI agent, API key, system); humans get RBAC (roles → policies →
permissions, Directus-shaped); machines get scoped grants; plugin capabilities stay a separate
axis (SPEC-005, untouched). Authorization is an ordinary core function `authorize()` — **not a
port** (ADR-006: one evaluator) — that the SPEC-001 command gateway calls before every mutation,
stamping a real durable `actorId` on the change-set. This unblocks agent editing (ADR-016) and
every permissioned admin surface, and it hardens the schema against the two defects a swarm
debate flagged unanimously: **cross-workspace privilege leaks** and **audit-trail destruction**.

---

## Problem Statement

**Current state:** `server/deps.ts` hardcodes a single admin and stamps every change-set
`actorId: "user-local"`. There are no users, roles, permissions, sessions, or API keys. The
gateway's reserved actor/permission seam (SPEC-001) is stubbed; any authenticated caller can do
anything. Agent editing (ADR-016) and any multi-user or permissioned surface are blocked.

**Desired state:** A real owner principal is seeded at first boot; humans log in (username +
argon2id password) and receive a revocable server-side session; every gateway mutation is gated
by `authorize(principalId, permission, {workspaceId, entityType, entityId?})` and stamped with
the caller's principal id; API keys let Tovu-Runner (and integrations) authenticate headlessly as
a principal; agents act as delegated principals bounded by their delegator's live permissions.

**Why now:** The gateway seam and audit trail (SPEC-001), the plugin capability model (SPEC-005),
and the agent surface (ADR-013/014/016) all assume an identity model that does not yet exist.
Retrofitting authorization after agents can already mutate content is the breaking rewrite ADR-008
warned about. Identity must land before the first real actor variety appears.

**Success signal:** From a fresh `tovu init`, a seeded owner logs in; an editor principal can
update a post but is denied `changeset.revert`; a disabled principal's session stops working
immediately; an API key authenticates a headless request as its principal and is revocable; every
mutation's change-set carries the acting principal's id; a role/policy/session row from workspace
A cannot be attached to a principal in workspace B; no principal can be hard-deleted.

---

## User Journey

1. **Trigger:** `tovu init` seeds a `system` principal and an `owner` user (or first-boot creates
   the owner); later, a user signs in at `/admin`, or Tovu-Runner calls the API with a key.
2. **Steps:**
   1. First boot seeds the `system` principal, the four built-in roles + policies, and the owner.
   2. A human posts credentials to the login endpoint; on success a server-side `sessions` row is
      created and an `HttpOnly`+`SameSite=Strict` cookie is set (admin origin only).
   3. The user edits a post; the route resolves the session → principal, and the gateway calls
      `authorize(principal, "content.write", {workspaceId, entityType:"post", entityId})` before
      executing; the change-set records the real `actorId`.
   4. The owner creates an editor user and assigns the `editor` role; the editor can write content
      but is denied `changeset.revert` and `plugin.enable` with a typed reason.
   5. An operator issues an API key (bound to a principal + policy); Tovu-Runner uses it to serve
      and mutate headlessly; the key is later revoked and immediately stops working.
3. **Outcome:** Every actor is a durable, auditable, revocable principal; every mutation is gated
   and attributed; workspace isolation and audit history are relationally guaranteed.
4. **Alternate paths:** Wrong password / expired or revoked session / disabled principal → 401.
   Insufficient permission → 403 with a typed reason. A permission row with an uninterpretable
   `constraint_json` → **deny** (fail-closed). A cross-workspace attach attempt → rejected by a
   composite foreign key.

---

## Scope

**In scope (v1):**
- The `principals` root + `users` (argon2id) + `sessions` (revocable) + `api_keys` — REQ-01, REQ-08
- RBAC tables `roles`, `policies`, `policy_permissions`, `role_policies`, `principal_roles`; seed
  four built-in roles mapped 1:1 to four built-in policies — REQ-02, REQ-09
- The registered **permission catalog** + `authorize()` core function — REQ-03, REQ-04
- Gateway wiring: `authorize()` before every mutation; real `actorId` on the change-set — REQ-05
- Login / logout / session lifecycle; `whoami` + effective-permission introspection — REQ-06, REQ-07
- API-key issuance/verification/revocation, principal-bound — REQ-08
- Direct policy attachment to a principal (`principal_policies`) — the machine-grant path an API
  key needs to hold any permission (roles are the human path) — REQ-02, REQ-08
- Composite `(workspace_id, id)` foreign keys on every scoped join — REQ-10 (INV-01)
- Disable-only principals; no hard delete, gated by `user.manage`, never removing the last owner —
  REQ-11 (INV-02, INV-08)
- `tovu permissions list` catalog enumeration — REQ-12
- Non-HTTP (CLI / in-process core) callers resolve to the seeded owner principal so every mutation
  is authorized and attributed — REQ-13 (retires the Article VI mutation exception; revisit OQ-08)
- Rate limiting on the auth + mutation surface (login brute-force guard + write/read limits) — REQ-14
- **(0.6.0)** HTTP routes for the two transitions this spec already specified but never surfaced —
  `DISABLE_PRINCIPAL`, `WRITE_POLICY_PERMISSION` — REQ-11/INV-07 (unchanged transitions, new routes)
- **(0.6.0)** Re-activating a disabled user (`ENABLE_PRINCIPAL`) — REQ-15
- **(0.6.0)** Editing a user's `email` (`UPDATE_USER`) and admin-initiated password reset
  (`RESET_USER_PASSWORD`) — REQ-16, REQ-17
- **(0.6.0)** Renaming a non-built-in role; renaming/re-describing a non-built-in, non-frozen policy
  (`UPDATE_ROLE`, `UPDATE_POLICY`) — REQ-18
- **(0.6.0)** Deleting an unused, non-built-in, non-frozen role or policy (`DELETE_ROLE`,
  `DELETE_POLICY`) — REQ-19

**Out of scope (deferred — see OQs):**
- Agents / `agents` / `agent_grants` / delegated-grant evaluation — OQ-01 (AI phase; ADR-013/014/016)
- ~~Direct `principal_policies` grants~~ — **the table + attach path is now v1** (a v1 API key is
  otherwise un-grantable). Still deferred: a *live delegator-clamp* on direct grants — a demoted
  issuer's keys keep their power until revoked (EC-07) — OQ-02.
- Policy-rule *engine*: field/row-level `constraint_json` interpretation (ABAC) — OQ-03 (seam only in v1)
- Password reset / email flows, MFA, OAuth/OIDC, desktop-host SSO — OQ-04
- Cross-site identity federation in Tovu-Runner (the shell owns operator auth) — OQ-05 (ADR-011)
- ~~Admin UI for user/role management (this spec is API + core)~~ — **OQ-06 RESOLVED (0.6.0):**
  `Users.tsx`/`Roles.tsx` already exist and this amendment completes their missing backend surface
- ADR-014 tool-registry `auth`-axis re-expression (lands with the assistant spec) — OQ-07
- **(0.6.0)** Changing a user's `username` — the login identity, unlike `email`, has audit/session/
  lookup-normalization implications (behavior.spec §5.1) not worth reopening for a v1 admin edit
  screen — OQ-09
- **(0.6.0)** Removing a single permission from a policy (the inverse of `WRITE_POLICY_PERMISSION`)
  — no transition defined; shrinking a policy's permission set in v1 means `DELETE_POLICY` (only
  when unused) + recreate — OQ-10
- **(0.6.0)** Custom role→policy composition (`role_policies` writable for non-built-in roles) —
  still not user-writable in v1 (F-053-02, unchanged); `UPDATE_ROLE` renames a role, it does not
  give it policies — a custom role remains attachable-with-zero-conferred-permissions unless/until
  F-053-02 is revisited (tracked there, not reopened here)

---

## Requirements

- REQ-01: A `principals` table roots identity: `id`, `workspace_id`, `kind` (`user | agent |
  api_key | system`), `display_name`, `status` (`active | disabled`), `disabled_at`, `created_at`.
  `change_set.actorId` references `principals` by composite `(workspace_id, id)` (see REQ-10), and
  `change_sets` therefore carries its own `workspace_id`. `users` holds human auth: `principal_id`,
  **`workspace_id`**, `username` (unique per workspace), `email`, `password_hash` (**argon2id**),
  `last_login_at`; it references `principals` by `(workspace_id, principal_id)`. A `users` row is
  **only ever created together with a new `kind='user'` principal in the same transaction** — a human
  user *is* a principal. A password credential is **never** attached to a pre-existing principal, so
  user creation can never bind a login to an existing (possibly privileged) principal such as `owner`,
  `system`, or an `api_key` principal (closes the delta-audit escalation MF-1). Creating a user
  requires `user.manage` **or** `member.manage` (an admin may onboard; disabling stays owner-only,
  REQ-11).
- REQ-02: RBAC is `principal → role → policy → permission`, plus a direct `principal → policy`
  path for machine principals. `roles` (`id`, `workspace_id`, `name`, `is_builtin`), `policies`
  (`id`, `workspace_id`, `name`, `description`, `is_builtin`, `is_frozen` — `is_frozen=true` only on an
  API-key issuance snapshot, REQ-08; `CREATE_POLICY` rows and built-ins are `is_frozen=false`),
  `policy_permissions` (`workspace_id`,
  `policy_id`, `permission`, nullable `resource_type`, nullable `constraint_json`), `role_policies`
  (`workspace_id`, `role_id`, `policy_id`), `principal_roles` (`workspace_id`, `principal_id`,
  `role_id`), and **`principal_policies` (`workspace_id`, `principal_id`, `policy_id`) — v1** — a
  policy attached directly to a principal, so a `kind='api_key'` (or future `agent`) principal can
  hold permissions without a human role. Every child references its parent(s) by composite
  `(workspace_id, id)` (REQ-10). Policies exist independently of roles so a human role and a machine
  principal attach the identical policy shape. Assigning a role to a principal (`principal_roles`) or
  attaching a policy directly to a principal (`principal_policies`) is a modeled transition gated by
  `role.manage` **and bounded by the INV-07 grant clamp** (a principal may not assign a role or attach a
  policy conferring authority it does not itself hold unconstrained) — state.spec §3 `ASSIGN_ROLE` /
  `ATTACH_POLICY`. **These two transitions target `kind='user'` (human) principals only** — an `api_key`
  or `system` target is rejected `VALIDATION_ERROR` (AC-25). A machine (`api_key`) principal's authority
  is set **solely at issuance** by `ISSUE_API_KEY` (the sole writer of its `principal_policies` rows,
  clamped to the issuer, against a **grantless** bound principal — REQ-08), so machine authority is
  immutable after that one issuance and cannot be grown by a later human-grant transition. This preserves
  the REQ-02 human/machine split (v0.5.4 delta-audit F-053-01). This is how non-seed owner/admin/editor/viewer
  (human) principals come to exist; assigning the **built-in `owner` role** is the supported way to hold `*`
  beyond the seed, and the clamp means only an existing owner (`*`) can do it (INV-06 bars mutating built-ins,
  not assigning a built-in role/policy). By construction `role.manage` is therefore owner-tier: delegating it
  is owner-equivalent, since its holder could assign itself any role its own authority already covers.
  **`role_policies` (custom role→policy binding) is not user-writable in v1** — there is no transition that
  writes it for a custom role; custom grants flow through `principal_policies` via `ATTACH_POLICY`, and no
  v1 AC requires custom-role→policy composition (v0.5.4 delta-audit F-053-02, deferred).
- REQ-03: Permissions are flat dotted strings validated against a **code-side registered catalog**
  (not a DB enum). Core owns the base vocabulary: `content.read/write/publish/delete`,
  `media.write`, `theme.set`, `plugin.read/enable/disable`, `changeset.read/revert`,
  `member.manage`, `user.manage`, `role.manage`, `settings.write`, `apikey.manage`. Features may
  register additional permissions at startup. Writing a `policy_permissions.permission` not in the
  catalog is rejected (`PERMISSION_UNKNOWN`).
- REQ-04: `authorize(principalId, permission, { workspaceId, entityType?, entityId? }) → { allowed:
  boolean, reason: string }` is ordinary core code (**not** a port — ADR-006). It resolves the
  principal's effective permission rows — the union of (a) its roles' policies' permissions and
  (b) policies attached directly via `principal_policies` — all scoped to `workspaceId`. A row
  **matches** iff **all** of: its `permission` string equals `permission`; its `workspace_id`
  equals `workspaceId`; (`resource_type IS NULL` **OR** `resource_type == context.entityType`);
  and `constraint_json IS NULL`. `authorize()` returns `allowed=true` iff ≥1 row matches, else
  `allowed=false` (**fail-closed**). Explicit deny conditions: a disabled principal; no matching
  row (`no_grant`); a resource-scoped row (`resource_type` non-null) evaluated with a **missing or
  mismatched** `context.entityType` (`resource_scope_mismatch`); or a candidate row whose
  `constraint_json` is non-null and not interpretable by the v1 evaluator (`unconstrained_deny`). A
  resource-scoped grant therefore never acts globally. **Owner wildcard:** the built-in `owner`
  policy carries the wildcard permission `*` (an unconstrained row — `resource_type` and
  `constraint_json` both null), and a `*` row **matches any `permission`** (still subject to the
  `workspaceId` check). `owner` is therefore evaluated dynamically and automatically covers
  permissions features register after seed (REQ-03/REQ-09) — no enumerated owner list to fall stale.
  `*` is owner-only and built-in; a non-built-in policy may not hold `*`.
- REQ-05: The SPEC-001 command gateway authenticates the caller and calls `authorize()` **before
  the idempotency short-circuit** (and thus before feature execution / inverse capture) for every
  mutation, using a permission the route declares. On `allowed=false` it aborts with `FORBIDDEN`
  (403) — returning **no** `DUPLICATE_COMMAND` result and **no** original `changeSetId` even for a
  replayed command id — executes no mutation, and records no change-set. Ordering is load-bearing:
  authorization must gate before any idempotency-cache lookup so a duplicate is never disclosed to
  an unauthorized (e.g. demoted or revoked-key) caller. This **amends SPEC-001 REQ-01's ordered
  step list** — `authenticate → authorize` is prepended ahead of the idempotency check; the relative
  order of SPEC-001's existing steps is otherwise preserved. On success it stamps the caller's
  principal id as the change-set `actorId` (replacing the `user-local` stub; satisfies SPEC-001
  REQ-02/REQ-09/REQ-12).
- REQ-06: `POST …/auth/login` verifies `username` + password (argon2id) for an `active` principal,
  creates a `sessions` row (`id`, `workspace_id`, `principal_id`, `token_hash`, `created_at`,
  `expires_at`, `revoked_at`, `ip`, `user_agent`) referencing its principal by
  `(workspace_id, principal_id)`, and sets an `HttpOnly`, `SameSite=Strict`, `Secure` cookie
  bound to the admin origin. `POST …/auth/logout` revokes the current session. Sessions are
  validated server-side on every request; expired/revoked/disabled → 401.
- REQ-07: `GET …/auth/me` returns the current principal and its **effective permission set** (the
  introspection surface — the authZ analog of `tovu hooks list`).
- REQ-08: An API key is issued bound to a `kind='api_key'` principal: `api_keys` (`id`,
  `workspace_id`, `principal_id`, `label`, `key_hash`, `prefix`, `last_used_at`, `expires_at`,
  `revoked_at`), referencing its principal by `(workspace_id, principal_id)`. Issuance **snapshots the
  requested permissions — copied *field-identically* (each `permission` with its `resource_type` and
  `constraint_json` preserved verbatim, never scope-widened) — into a fresh, `is_frozen=true`, machine-owned
  policy created at issuance and attaches *that frozen policy* to the key's principal via `principal_policies`
  (REQ-02)** — this is how a machine principal holds permissions, since roles are the human path. The source
  `policyIds` must be **in the caller's workspace** and **may not carry the wildcard `*`** — the built-in
  `owner` policy cannot be a snapshot source, so an api_key snapshot never carries `*` (REQ-04) and **an
  api_key is never owner-tier**; a `*`-bearing source → `VALIDATION_ERROR` (AC-26). The frozen policy is a
  **copy**, not a live reference to the caller-supplied source policies: a later legal `WRITE_POLICY_PERMISSION`
  widening of a source policy therefore **cannot grow an already-issued key** (an `is_frozen` policy is
  immutable — `WRITE_POLICY_PERMISSION` refuses it, AC-26), so the key's authority is genuinely fixed at
  issuance (F-054-01). A key whose snapshot carries no permission can authenticate but is authorized for
  nothing. Revoking a key retires its issuance-owned frozen policy. The raw key is shown once at creation;
  only its hash is stored. A request presenting a valid, non-expired, non-revoked key whose principal is
  `active` authenticates as that principal and is authorized identically to a session. Revocation
  takes effect immediately. Issuing/revoking a key and attaching its policies requires `apikey.manage`.
  **The bound `principal_id` MUST reference a `kind='api_key'` principal (minted via `CREATE_PRINCIPAL`) in
  the issuer's workspace — binding a key to a `kind='user'`, `system`, or the seeded `owner` principal is
  rejected `VALIDATION_ERROR` (AC-23).** A key authenticates *as its bound principal*, so binding to a
  privileged principal would let its holder inherit that principal's grants (e.g. the owner `*`), re-opening
  the MF-1 escalation class on the api_key path — the clamp (INV-07) below governs the *attached policies*, not
  the *bound principal*, so this is a separate, enforced precondition (v0.5.2 delta-audit F1).
  **The bound principal MUST also be *grantless* — freshly minted, with no pre-existing `principal_roles` or
  `principal_policies` rows — so the key's authority is *exactly* the issuance-time attached policies (which
  are themselves INV-07-clamped to the issuer), never the bound principal's accumulated authority.** A
  non-grantless bound principal → `VALIDATION_ERROR`, no key (AC-25). This closes the two-actor escalation in
  which an owner first endows an `api_key` principal to owner-`*` (via a human-grant transition) and an
  `apikey.manage` admin then issues a key bound to it: with `ASSIGN_ROLE`/`ATTACH_POLICY` restricted to human
  principals (REQ-02) an api_key principal can never *acquire* pre-existing authority in the first place, and
  the grantless precondition is the belt-and-suspenders check at issuance. Machine authority is thereby
  isolated to a single clamped issuance and is immutable thereafter (v0.5.4 delta-audit F-053-01).
  **Issuance-time authority clamp (INV-07):** for **every** permission carried by a policy being
  attached to a new key, the issuer must itself hold that permission in its own effective set as an
  **unconstrained hold** — a matching row with `resource_type IS NULL` **and** `constraint_json IS
  NULL` in the same `workspaceId` (owner's wildcard `*` counts as an unconstrained hold of every
  permission). An issuer that holds a permission only **conditionally** (resource-scoped or
  constraint-bound) may **not** delegate it to a key in v1 — string-level possession is insufficient,
  so a scoped grant cannot be widened into an unconstrained one. Any permission the issuer does not
  hold unconstrained → reject with `GRANT_EXCEEDS_ISSUER`. The attached grant may itself be equal or
  narrower (it may carry its own `resource_type`/`constraint_json`); it may never be broader than the
  issuer's unconstrained hold. This bounds `apikey.manage` so it cannot mint a credential exceeding
  its issuer — e.g. an `admin` cannot attach the built-in `owner` policy, and an admin who holds
  `content.write` only for `resource_type='post'` cannot mint a key with unconstrained `content.write`.
  This issuance-time bound is distinct from the deferred *live* delegator-clamp (OQ-02, EC-07), which
  concerns what happens after the issuer is later demoted. (Rationale: comparing "is scope A narrower
  than scope B" would itself need the deferred `constraint_json` engine — OQ-03; requiring an
  unconstrained hold is the fail-closed v1 rule that needs no such comparison.)
- REQ-09: First boot seeds: one `system` principal; **a disabled legacy `user-local` principal**
  (`kind='system'`, `status='disabled'`) in the local workspace, so any pre-existing `change_sets`
  stamped `actorId='user-local'` satisfy the REQ-10 composite FK — ADR-021 §5 retains history as-is
  and never rewrites it; four built-in roles `owner`, `admin`, `editor`, `viewer`, each mapped 1:1
  to a built-in policy; and the initial `owner` user. `owner` holds **all catalog permissions,
  represented as the wildcard `*` grant** (REQ-04) — evaluated dynamically so it automatically
  covers permissions features register after seed (REQ-03); an enumerated owner list would lock
  owner out of new capabilities. `admin` holds the enumerated near-superuser set: all seed-time
  catalog permissions **except the owner-only set {`user.manage`, `role.manage`}**; `apikey.manage`
  **is held by both `owner` and `admin`** (so an admin can issue keys — hence the INV-07 clamp).
  `editor` gets `content.*` + `media.write` + `theme.set`; `viewer` gets `*.read`. Non-owner
  built-ins are enumerated and do **not** auto-grow with the catalog; a later feature permission is
  attached to them only by explicit (non-built-in) grant. Built-in roles/policies are
  `is_builtin=true`, **undeletable, and immutable** — their policy→permission mappings are frozen at
  seed AND no new `role_policies`/`policy_permissions` row may reference an `is_builtin` parent
  (INV-06), so a `role.manage` holder can neither delete, edit, nor *attach to* a built-in (e.g.
  cannot add a permission to `viewer`, nor attach a custom policy to the `viewer` role, to escalate);
  new capability comes only from creating new non-built-in policies/roles.
- REQ-10: Every foreign key crossing a workspace-scoped table is **composite on `(workspace_id,
  id)`**, which requires every scoped child/join table to carry its own `workspace_id` column.
  `users`, `sessions`, `api_keys`, `principal_roles`, `role_policies`, `policy_permissions`,
  `principal_policies`, and **`change_sets`** (whose `actorId` references `principals` by
  `(workspace_id, actorId)`) each carry `workspace_id` and reference their parent(s) by
  `(workspace_id, id)`, so no cross-workspace attachment is representable (INV-01). This is only
  buildable because each child carries `workspace_id` — see REQ-01/02/06/08.
- REQ-11: Principals are **disable-only**. There is no hard-delete path; "removing" a principal
  sets `status='disabled'` + `disabled_at`. `change_set.actorId` therefore never dangles (INV-02).
  Disabling a principal requires the **`user.manage`** permission (owner-only, REQ-09) and is
  **refused if it would leave the workspace with zero `active` principals holding the owner `*`
  grant** — including a self-disable that would do so — so the site can never be locked out of
  ownership (INV-08); refusal raises `OWNER_REQUIRED`. Additionally, the **seeded owner principal**
  (REQ-09) is **never disable-able in v1** (a stronger rule than the count guard): it is the CLI/core
  resolution target (REQ-13), so disabling it — even with other owners present — would strand the
  CLI-only management plane behind the disabled short-circuit (behavior §1.1). The owner-count check
  and the status update execute in **one atomic transaction**, so two concurrent disables cannot both
  observe a surviving owner and both commit (INV-08).
- REQ-12: `tovu permissions list` enumerates the registered permission catalog (id + owner +
  description) at runtime.
- REQ-13: **Non-HTTP callers** — the `tovu` CLI (SPEC-003) and in-process core callers — authenticate
  to the command gateway by resolving to the **seeded `owner` principal** (REQ-09), so every CLI/core
  mutation carries a real `principalId`, is gated by `authorize()` with owner authority, and stamps
  that principal id as the change-set `actorId`. There is no separate CLI login step in v1.
  **Trust boundary (documented, ADR-021):** local shell / filesystem access to `content.db` is
  treated as **owner-equivalent** — a local operator can already read and rewrite the database
  directly, so running the CLI as `owner` grants no authority beyond what shell access already
  confers. This **retires the standing Article VI local-dev no-auth exception for mutations**: the
  CLI acts as a real, attributable, authorized principal rather than an unauthenticated caller
  (composes REQ-05/INV-04). Because the `owner` principal holds the wildcard `*`, CLI mutations
  satisfy the INV-07 issuance clamp and can mint API keys — an accepted v1 consequence of the trust
  boundary, **flagged for future hardening (OQ-08)**. This resolution grants **no** implicit
  principal to HTTP callers; browser and API-key callers still authenticate per REQ-06/REQ-08.
  **Plugin-originated in-process invocations (SPEC-005) are NOT "core callers"** and never inherit the
  owner principal: they remain gated by the separate SPEC-005 capability axis (and, later, agent
  principals — OQ-01), so a plugin can never silently acquire owner authority through this path.
- REQ-14: The authentication and mutation surface is **rate-limited**. Three profiles (defined in
  api.spec §3, mirrored in behavior §4): **`LOGIN_STRICT`** (10 requests / 60s, burst 0) on
  `AUTH_LOGIN`; **`WRITE_STANDARD`** (30 / 60s, burst 5) on mutation/write endpoints; and
  **`READ_STANDARD`** (300 / 60s, burst 50) on reads. Exceeding a profile returns
  `RATE_LIMIT_EXCEEDED` (429) with `details.retryAfterSeconds`. `LOGIN_STRICT` is a brute-force guard
  keyed by **client IP**; the client IP is taken from a forwarded-for header **only when the immediate
  peer is on a configured trusted-proxy list**, and otherwise from the socket peer address — an
  untrusted forwarded-for header is never honored, so the limiter can be neither globally tripped by a
  shared proxy IP nor bypassed by a spoofed header. The client IP is resolved by walking the
  forwarded-for chain **right-to-left, taking the first address that is not a configured trusted
  proxy** (equivalently, the trusted proxy MUST overwrite/sanitize client-supplied values); a
  malformed or absent header falls back to the socket peer address (api.spec §3). Rate limiting
  applies at the **HTTP boundary only**; REQ-13 CLI/core callers are unmetered.
  `WRITE_STANDARD`/`READ_STANDARD` are keyed by `principalId`.
- REQ-15 **(0.6.0)**: `ENABLE_PRINCIPAL` re-activates a `disabled` `kind='user'` principal — the
  symmetric counterpart REQ-11 never defined. Gated by `user.manage` (same gate as `DISABLE_PRINCIPAL`
  — re-activation is exactly as sensitive as deactivation). Target must be `kind='user'`; a
  `system`/`api_key`/`agent` target is rejected `VALIDATION_ERROR` (mirrors AC-25b's human-only
  scoping — `ENABLE_PRINCIPAL` is not a way to resurrect the disabled legacy `user-local` stub or
  reactivate an api_key principal outside `ISSUE_API_KEY`'s own lifecycle). Sets `status='active'`,
  clears `disabled_at`. No INV-08 owner-count interaction: enabling a principal can only ever hold or
  increase the active owner-`*` count, never reduce it, so no atomic count-check is needed (unlike
  `DISABLE_PRINCIPAL`).
- REQ-16 **(0.6.0)**: `UPDATE_USER` edits an existing user's `email` field (set, change, or clear to
  `null`). Gated by `user.manage` **or** `member.manage` (mirrors `CREATE_USER`'s admin-onboarding
  gate — editing a profile field is no more sensitive than creating the account). `username` is
  **not** editable by this transition (OQ-09) and `password` is **not** editable by this transition
  (see REQ-17) — `UPDATE_USER` touches `email` only.
- REQ-17 **(0.6.0)**: `RESET_USER_PASSWORD` sets a **new** password for an existing user without
  requiring the old one (an admin override, distinct from the deferred self-service "forgot password"
  flow, OQ-04). Gated by **`user.manage`** (owner-only, the same gate as `DISABLE_PRINCIPAL` — the
  ability to silently take over any account by resetting its credential is at least as sensitive as
  disabling it; `member.manage` is deliberately **not** sufficient, unlike `CREATE_USER`/`UPDATE_USER`).
  The new password is hashed identically to `CREATE_USER` (argon2id, INV-05). On success, **every one
  of that principal's active `sessions` rows is revoked** (mirrors `DISABLE_PRINCIPAL`'s "immediate
  effect" discipline, AC-05) — a credential reset that left old sessions alive would not actually
  contain a compromised account.
- REQ-18 **(0.6.0)**: `UPDATE_ROLE` renames a non-built-in role (`name`). `UPDATE_POLICY` renames
  and/or re-describes a non-built-in, **non-`is_frozen`** policy (`name`, `description`). Both gated
  by `role.manage`. A built-in (`is_builtin=true`) target is refused — this extends INV-06's existing
  "undeletable, immutable, un-attachable-to" rule to also cover **un-renameable**, closing the same
  escalation shape INV-06 already guards against (an operator relabeling `viewer` to something that
  reads as trusted would be a social-engineering variant of the attacks INV-06 already blocks
  structurally). A `is_frozen` policy target (an `ISSUE_API_KEY` issuance snapshot) is likewise
  refused — consistent with `WRITE_POLICY_PERMISSION`'s existing frozen-policy refusal (AC-26):
  an issuance snapshot's identity is as immutable as its permission set.
- REQ-19 **(0.6.0)**: `DELETE_ROLE` hard-deletes a non-built-in role that carries **zero** live
  references — no `principal_roles` row may name it. `DELETE_POLICY` hard-deletes a non-built-in,
  non-`is_frozen` policy that carries **zero** live references — no `role_policies` or
  `principal_policies` row may name it. Both gated by `role.manage`; both refuse a built-in or (for
  policies) frozen target with the same reasoning as REQ-18. Neither transition is INV-07-clamped —
  clamping governs *granting* authority a caller doesn't hold, and deleting an already-unused
  role/policy grants nothing to anyone. **This is a deliberate, disclosed divergence from REQ-11's
  disable-only rule for principals** — see the new INV-09 for the reasoning: unlike principals,
  roles/policies are never referenced by `change_sets` (the audit trail), so a hard delete of an
  unreferenced row leaves no dangling FK and destroys no audit history; the "in use" guard is what
  does the safety work here, not a soft-delete flag.

---

## Acceptance Criteria

- AC-01 (REQ-09) [P1]: Given a fresh `tovu init`, when the site boots, then a `system` principal,
  four built-in roles each bound to a built-in policy, and one `owner` user exist; the built-in
  roles/policies have `is_builtin=true` and a **delete attempt, an edit attempt (adding a permission
  to `viewer`'s policy), and an *attach* attempt (a new `role_policies` row binding a custom policy
  to the `viewer` role) all fail** (INV-06); a disabled `user-local` principal is also present so
  legacy `actorId='user-local'` change-sets resolve (F1/REQ-09).
- AC-02 (REQ-06) [P1]: Given the seeded owner, when correct credentials are posted to `…/auth/login`,
  then a session row is created and an `HttpOnly`+`SameSite=Strict` cookie is set; when wrong
  credentials are posted, then 401 and no session.
- AC-03 (REQ-05) [P1]: Given an authenticated editor, when they `PUT` a post through the gateway,
  then `authorize(editorPrincipal,"content.write",…)` returns allowed, the mutation runs, and the
  change-set `actorId` equals the editor's principal id (not `user-local`).
- AC-04 (REQ-05/REQ-04) [P1]: Given an authenticated editor, when they call revert on a change-set,
  then `authorize(…, "changeset.revert", …)` returns not-allowed, the response is 403 `FORBIDDEN`
  with a typed reason, and no entity change and no change-set occur.
- AC-05 (REQ-06) [P1]: Given a logged-in principal, when that principal is set `disabled`, then its
  existing session is rejected on the next request (401) — disabling is immediate.
- AC-06 (REQ-08) [P1]: Given an API key issued for a principal, when a request presents the raw key,
  then it authenticates as that principal and is authorized identically to a session; when the key
  is revoked, then the same request returns 401 immediately; only the key hash is stored.
- AC-07 (REQ-10) [P1]: Given rows in workspace A and B in the same `content.db`, when an attempt is
  made to insert **any** cross-workspace link — a `principal_roles` row (principal A ↔ role B), a
  `role_policies` / `policy_permissions` / `principal_policies` row, a `sessions` / `api_keys` /
  `users` row bound across workspaces, or a `change_sets.actorId` pointing to a principal in another
  workspace — then the composite `(workspace_id, id)` foreign key rejects **each** (INV-01).
- AC-08 (REQ-11) [P1]: Given any principal referenced by a change-set, when a hard delete is
  attempted, then it is refused; disabling instead sets `status='disabled'` and the change-set
  `actorId` still resolves (INV-02).
- AC-09 (REQ-04) [P1]: Given a `policy_permissions` row whose `constraint_json` is non-null and not
  interpretable by the v1 evaluator, when `authorize()` evaluates a matching permission, then it
  returns `allowed=false` (fail-closed) — the grant is NOT treated as unconstrained.
- AC-10 (REQ-03) [P1]: Given a policy write naming a permission absent from the registered catalog,
  when validated, then it is rejected with `PERMISSION_UNKNOWN`; given `tovu permissions list`, then
  the full catalog is enumerated.
- AC-11 (REQ-07) [P2]: Given a logged-in editor, when `GET …/auth/me` is called, then it returns the
  editor principal and an effective permission set containing `content.write` but not
  `changeset.revert`.
- AC-12 (REQ-09) [P2]: Given the seeded roles, when their policies are read, then `owner ⊇ admin ⊇
  editor` on the content axis and `viewer` holds only `*.read` permissions.
- AC-13 (REQ-08/REQ-02) [P1]: Given an API key whose `kind='api_key'` principal has **only** a
  policy granting `content.write` attached via `principal_policies` (and no role), when the key
  authenticates, then `authorize(keyPrincipal,"content.write",…)` is allowed while
  `authorize(keyPrincipal,"role.manage",…)` and `authorize(keyPrincipal,"apikey.manage",…)` are
  denied — a key holds a working permission without any management right and without a human role (B2).
- AC-14 (REQ-04) [P1]: Given a `policy_permissions` row with `resource_type='post'` granting
  `content.write`, when `authorize(…,"content.write",{entityType:'post'})` is evaluated it is
  allowed, but the **same** permission evaluated with `{entityType:'page'}` or with no `entityType`
  is denied (`resource_scope_mismatch`, fail-closed) — a resource-scoped grant never acts globally (B3).
- AC-15 (REQ-08/INV-07) [P1]: Given an `admin` holding `apikey.manage` but not owner-only
  permissions, when it issues a key snapshotting a policy carrying a permission admin lacks (e.g.
  `user.manage`), then issuance is rejected with `GRANT_EXCEEDS_ISSUER` and no key is created; **given an
  admin that holds `content.write` only scoped to `resource_type='post'`, when it attaches an
  unconstrained `content.write` policy to a key, then issuance is rejected `GRANT_EXCEEDS_ISSUER`**
  (a conditional hold cannot be widened); when it attaches a policy every permission of which admin
  holds unconstrained, issuance succeeds; **given the `owner` (effective set `*`), when it issues a
  key snapshotting any valid non-`*` policy, issuance succeeds** (the `*` hold satisfies the clamp — owner
  is not fail-closed out of key issuance); a source policy carrying `*` itself (the built-in `owner` policy)
  is rejected `VALIDATION_ERROR` for **any** issuer, since an api_key snapshot never carries `*` (AC-26)
  (R2/R3: issuance-time authority clamp).
- AC-16 (REQ-09/REQ-04) [P1]: Given the seeded `owner` and a feature that registers a **new**
  permission `x.write` at startup (absent at seed time), when `authorize(ownerPrincipal,"x.write",…)`
  is evaluated, then it is allowed (owner's `*` grows with the catalog); the same check for a seeded
  `editor` returns not-allowed unless `x.write` was explicitly granted (R2: owner wildcard vs frozen
  non-owner built-ins).
- AC-17 (REQ-13) [P1]: Given a fresh `tovu init` and **no** HTTP session or API key, when a `tovu`
  CLI (or in-process core) mutation runs through the command gateway, then `authorize()` is invoked
  with the seeded `owner` principal, the mutation is allowed, and the change-set `actorId` equals
  that principal id — the CLI is a real authorized principal, not the legacy `user-local` stub and
  not an unauthenticated caller (RT-001).
- AC-18 (REQ-14) [P1]: Given the `LOGIN_STRICT` profile (10/60s per client IP), when an 11th login
  is attempted from the same client IP within the window, then the response is 429
  `RATE_LIMIT_EXCEEDED` with `details.retryAfterSeconds`; and given a forwarded-for header presented
  by a **non-trusted** peer, when it claims a different IP, then the limiter key is unchanged (the
  header is ignored) — no global trip, no spoof bypass (RT-002).
- AC-19 (REQ-01/REQ-02) [P1]: Given an existing user `username='ed'` in a workspace, when a second
  user `username='ed'` (case-insensitive, NFC-normalized) is created in the **same** workspace, then
  it is rejected with `RESOURCE_CONFLICT` (409, `details.field='username'`) and no row is created;
  the **same** username created in a **different** workspace succeeds (behavior §5; RT-003).
- AC-20 (REQ-06) [P2]: Given a logged-in principal whose session is valid and non-revoked but with
  `now >= expires_at`, when it makes the next request, then the response is 401 `UNAUTHENTICATED`, the
  session is treated as revoked, and `authorize()` is never reached (RT-004).
- AC-21 (REQ-11/INV-08) [P1]: Given a workspace state in which exactly one `active` principal holds the
  owner `*` grant, when a disable that would drop the owner-`*` count to zero is attempted (including a
  self-disable), then it is refused with `OWNER_REQUIRED` and the principal stays `active` (INV-08 — the
  count is **per workspace** and includes the seeded owner); given a **second** active owner-`*` principal
  (constructed by `ASSIGN_ROLE` granting the built-in `owner` role, state.spec §3), disabling one
  **non-seed** owner succeeds; **given the seeded owner principal, a disable is refused unconditionally even
  when other active owners exist** (REQ-11/REQ-13) — so in the seeded workspace the "would-reach-zero" case
  coincides with this seeded-owner floor. Given a caller **without** `user.manage`, when it attempts any
  principal disable, then it is denied 403 `FORBIDDEN` (RT-005/MF-2).
- AC-22 (REQ-01) [P1]: Given an existing principal (the seeded `owner`, `system`, or an `api_key`
  principal), when a `CREATE_USER`/credential-attach is attempted **against that existing principalId**,
  then it is rejected — user creation only ever mints a **fresh `kind='user'` principal** — so no login
  can be bound to a pre-existing (possibly privileged) principal; and given a caller holding only
  `member.manage`, creating a brand-new user **succeeds** (admin onboarding) while that same caller
  cannot disable a user (owner-only) (delta-audit MF-1).
- AC-23 (REQ-08/REQ-01) [P1]: Given an existing `kind='user'`, `system`, or seeded `owner` principal, when
  `ISSUE_API_KEY` is called with that principal's id as the bound `principalId`, then it is rejected 400
  `VALIDATION_ERROR` and no key is created — an API key may bind **only** to a freshly minted `kind='api_key'`
  principal (REQ-08), so an `apikey.manage` holder (e.g. built-in `admin`) cannot mint a key that
  authenticates as `owner`/`user`/`system` (the api_key twin of AC-22; v0.5.2 delta-audit F1).
- AC-24 (INV-07/REQ-02) [P1]: Given a **non-owner** principal that holds `role.manage` but **not** the
  owner `*` (constructed by an owner attaching a custom policy carrying only `role.manage`), when it
  attempts to `ASSIGN_ROLE` the built-in `owner` role (to itself or another **human** principal), to
  `ATTACH_POLICY` the built-in `owner` policy (to a human principal), or to `WRITE_POLICY_PERMISSION`
  adding a permission it does not hold unconstrained, then **each is rejected `GRANT_EXCEEDS_ISSUER` and
  no grant row is written**; given the **owner** (effective `*`), the same grants succeed — the INV-07
  clamp bounds every grant-writing path, not just API-key issuance, so no `role.manage` holder can
  escalate above its own authority (v0.5.3 delta-audit; closes the mint-`api_key`→assign-`owner`→issue-key
  chain). (An attempt to `ASSIGN_ROLE`/`ATTACH_POLICY` targeting an **`api_key` principal** does not reach
  this clamp — it is refused earlier as `VALIDATION_ERROR` per AC-25, since human-grant transitions target
  `kind='user'` principals only.)
- AC-25 (REQ-08/REQ-02/INV-07) [P1]: Two negative certifications that isolate machine authority to one
  clamped issuance (v0.5.4 delta-audit F-053-01). **(a) Grantless-issuance:** given a `kind='api_key'`
  principal that already holds any grant (a `principal_roles` or `principal_policies` row — e.g. one an
  owner endowed to owner-`*`, or a principal that has already had a key issued to it), when `ISSUE_API_KEY`
  is called binding a new key to it, then it is rejected 400 `VALIDATION_ERROR` and no key is created — a
  key may bind only to a **grantless, freshly minted** api_key principal, so the key's authority is exactly
  the issuance-time attached policies (INV-07-clamped) and never the bound principal's accumulated authority.
  **(b) Human-only grants:** given a `kind='api_key'` (or `system`) principal, when `ASSIGN_ROLE` or
  `ATTACH_POLICY` is called with it as the target `principalId`, then it is rejected 400 `VALIDATION_ERROR`
  and no grant row is written — machine authority is set solely at issuance (REQ-02). Together these mean an
  `apikey.manage` admin can never obtain a key that authenticates above the policies it could itself clamp-grant
  at issuance (closes the two-actor owner-endows-then-admin-issues escalation).
- AC-26 (REQ-08/INV-07) [P1]: Issuance-snapshot immutability + fidelity (v0.5.5/0.5.6 delta-audit F-054-01).
  Given a key issued to a grantless api_key principal snapshotting a source policy `P = {content.write}`, when
  an owner (or any `role.manage` holder whose own clamp passes) later calls `WRITE_POLICY_PERMISSION(P,
  "user.manage")`, then `authorize(keyPrincipal, "user.manage", …)` **remains denied** — the key holds a frozen
  `is_frozen` copy made at issuance, not a live reference to `P`, so widening `P` does not grow the key; and a
  direct `WRITE_POLICY_PERMISSION` against the key's own `is_frozen` snapshot policy is **refused** (an issuance
  snapshot is immutable, like a built-in). **Fidelity:** given a source policy scoping `content.write` to
  `resource_type='post'`, the frozen copy carries the **same** `resource_type='post'` (and any `constraint_json`)
  — the snapshot never drops scope to produce an unconstrained grant. **Wildcard:** given a request whose source
  `policyIds` include a policy carrying `*` (the built-in `owner` policy), issuance is rejected 400
  `VALIDATION_ERROR` and no key is created — an api_key snapshot never carries `*`. This certifies that a
  `kind='api_key'` principal's effective permission set is fixed at its single clamped issuance against
  *permission* drift, not only *row* drift, and never exceeds the selected source scope.
- AC-27 (REQ-15) [P1] **(0.6.0)**: Given a `disabled` `kind='user'` principal, when a caller holding
  `user.manage` calls `ENABLE_PRINCIPAL`, then its `status` becomes `active`, `disabled_at` clears,
  and it can log in again; given a caller **without** `user.manage`, then it is denied 403 `FORBIDDEN`;
  given a `system`/`api_key` target, then it is rejected 400 `VALIDATION_ERROR` and no row changes.
- AC-28 (REQ-16) [P1] **(0.6.0)**: Given an existing user, when a caller holding `member.manage` (not
  `user.manage`) calls `UPDATE_USER` with a new `email`, then the update succeeds (mirrors `CREATE_USER`'s
  admin-onboarding gate, AC-22); given a request body containing `username` or `password` fields, then
  those fields are silently ignored (not rejected — `UPDATE_USER`'s contract is `email`-only, not a
  partial-PATCH-of-anything-sent shape).
- AC-29 (REQ-17) [P1] **(0.6.0)**: Given an existing user with two active sessions, when a caller holding
  `user.manage` calls `RESET_USER_PASSWORD`, then the password hash changes, **both** existing sessions
  are revoked (next request on either → 401), and the new password authenticates a fresh login; given a
  caller holding only `member.manage`, then it is denied 403 `FORBIDDEN` (stricter gate than `UPDATE_USER`).
- AC-30 (REQ-18/INV-06) [P1] **(0.6.0)**: Given the built-in `viewer` role, when `UPDATE_ROLE` is called
  renaming it, then it is refused (INV-06 extended); given a non-built-in role, when renamed, then the
  new `name` persists and existing `principal_roles`/assignments to it are unaffected (renaming is not
  re-granting). Given a `is_frozen` policy (an api_key issuance snapshot), when `UPDATE_POLICY` is called
  on it, then it is refused, matching `WRITE_POLICY_PERMISSION`'s existing frozen-policy refusal (AC-26).
- AC-31 (REQ-19/INV-09) [P1] **(0.6.0)**: Given a non-built-in role with **no** `principal_roles` row
  referencing it, when `DELETE_ROLE` is called, then the row is hard-deleted; given a non-built-in role
  **currently assigned** to at least one principal, when `DELETE_ROLE` is called, then it is refused
  409 `RESOURCE_CONFLICT` and the role is not deleted. The policy twin holds identically for
  `DELETE_POLICY` against `role_policies`/`principal_policies` references. Given a built-in role/policy
  or a `is_frozen` policy, when delete is attempted, then it is refused regardless of reference count
  (INV-06 / AC-26 precedence — built-in/frozen status is checked before the reference count).
- AC-32 (REQ-11/INV-07 route parity) [P1] **(0.6.0)**: Given the already-specified `DISABLE_PRINCIPAL`
  and `WRITE_POLICY_PERMISSION` transitions (REQ-11, INV-07 — approved since v0.5.0/v0.5.3 with no
  HTTP route until now), when their new HTTP endpoints are called, then every precondition, state
  change, and failure code already certified by AC-08/AC-21 (`DISABLE_PRINCIPAL`) and AC-10/AC-24/AC-26
  (`WRITE_POLICY_PERMISSION`) holds identically over HTTP — the route is a thin transport wrapper, not
  a re-specification (no new business rule is introduced by giving these two transitions a route).

---

## Invariants

- INV-01: No workspace-crossing attachment is representable: every scoped child/join table carries
  its own `workspace_id` and references its parent by composite `(workspace_id, id)`; a
  role/policy/session/key/user/direct-grant/**change-set** always shares the principal's workspace.
- INV-02: A principal referenced by any change-set is never hard-deleted; `change_set.actorId`
  always resolves to an existing principal row (disabled or active).
- INV-03: `authorize()` is fail-closed — absence of an explicit allowing permission, a disabled
  principal, a resource-scoped grant evaluated with a missing/mismatched `entityType`, or an
  uninterpretable `constraint_json` all yield `allowed=false`.
- INV-04: Every gateway mutation is preceded by exactly one `authorize()` call **that runs before
  the idempotency short-circuit** (so a duplicate result is never disclosed to an unauthorized
  caller) and, on success, produces exactly one change-set stamped with the caller's principal id
  (composes SPEC-001 INV-01).
- INV-05: Passwords are stored only as argon2id hashes; API keys only as hashes; raw secrets are
  never persisted or logged.
- INV-06: Built-in roles and policies (`is_builtin=true`) are undeletable, **immutable** (permission
  mappings frozen at seed — no edit path), **un-attachable-to** (no new `role_policies` or
  `policy_permissions` row may reference an `is_builtin` parent), **and (0.6.0) un-renameable**
  (`UPDATE_ROLE`/`UPDATE_POLICY` refuse a built-in target) — so a built-in cannot be escalated
  by deletion, edit, attachment, or relabeling; and always present after seed. **(0.6.0)** The same
  refusal extends to any `is_frozen` policy target for `UPDATE_POLICY` and `DELETE_POLICY` (an
  issuance snapshot, REQ-08) — already true for `WRITE_POLICY_PERMISSION` (AC-26); rename/delete are
  held to the identical immutability bar as permission edits.
- INV-07 (grant-authority clamp): **No principal may grant — by API-key issuance (`ISSUE_API_KEY`),
  role assignment (`ASSIGN_ROLE`), direct policy attach (`ATTACH_POLICY`), or widening a policy
  (`WRITE_POLICY_PERMISSION`) — an effective permission it does not itself hold unconstrained at grant
  time.** Every permission conferred by the issued key, the assigned role's policies, the attached
  policy, or the added policy-permission must be a matching effective row the granter holds with
  `resource_type` AND `constraint_json` both null in the same workspace (owner's `*` qualifies as an
  unconstrained hold of every permission). A permission held only **conditionally** (resource-scoped or
  constraint-bound) cannot be delegated, and a scoped hold cannot be widened into an unconstrained grant
  (`GRANT_EXCEEDS_ISSUER`). Evaluated via the REQ-04 matcher. Consequence: assigning the built-in `owner`
  role (or attaching the built-in `owner` policy) requires the granter to hold `*` — i.e. be an owner —
  so no `role.manage` holder can escalate a principal above its own authority (v0.5.3 delta-audit). This is a
  grant-time bound; the *live* delegator-clamp for after-the-fact granter demotion is deferred (OQ-02, EC-07)
  and does not weaken this bound. **Complete writer enumeration + grantless-issuance rule (v0.5.4):** the only
  transitions that write grant rows are `ISSUE_API_KEY` (→ a fresh `is_frozen` `policies` row + its
  `policy_permissions` snapshot + one `principal_policies` row for its bound principal), `ASSIGN_ROLE` (→
  `principal_roles`), `ATTACH_POLICY` (→ `principal_policies`), and `WRITE_POLICY_PERMISSION`
  (→ `policy_permissions`, refused on `is_builtin`/`is_frozen` parents); `role_policies` has **no** user-facing
  writer in v1 (F-053-02, deferred). Each of
  those four writers is clamped above. `ASSIGN_ROLE`/`ATTACH_POLICY` additionally target **human** (`kind='user'`)
  principals only, and `ISSUE_API_KEY` requires a **grantless** bound principal (no pre-existing grant rows) —
  so a machine (`api_key`) principal's authority equals exactly its single clamped issuance and can never be
  grown afterward. This closes the class in which `ISSUE_API_KEY` read only the *attached* policies while the
  *bound* principal had separately accumulated broader authority (F-053-01). **Issuance-snapshot immutability
  (v0.5.5):** `ISSUE_API_KEY` does not attach a live reference to a caller-supplied shared policy — it copies
  the clamped permissions into a fresh `is_frozen=true`, machine-owned policy and attaches *that*.
  `WRITE_POLICY_PERMISSION` refuses any `is_frozen` (or `is_builtin`) policy, so a later **legal** widening of
  a *source* policy (by an owner/`role.manage` holder, whose own clamp passes) can never reach an
  already-issued key. This makes "a key's authority is fixed at issuance" true against *permission* drift, not
  only *row* drift — closing F-054-01, the drift-up twin of the accepted EC-07/OQ-02 demoted-issuer asymmetry.
- INV-08: The workspace is never locked out of ownership: **at least one `active` principal holding
  the owner `*` grant always exists after seed**, and the **seeded owner principal specifically is
  never disabled in v1** (REQ-11/REQ-13). Any disable that would leave zero owner-`*` principals
  (including a self-disable), and any attempt to disable the seeded owner, is refused (`OWNER_REQUIRED`);
  disabling is gated by `user.manage`. The count check and the status update are performed in **one
  atomic transaction**, so concurrent disables cannot both succeed and race the count to zero. Because
  built-ins are immutable and only the owner grant confers `user.manage`/`role.manage` and `*`, losing
  the last active owner would be unrecoverable — so it is structurally prevented.
- INV-09 **(0.6.0, REQ-19)**: A non-built-in, non-`is_frozen` role or policy may be hard-deleted **iff**
  zero rows reference it at delete time (`principal_roles` for a role; `role_policies` or
  `principal_policies` for a policy) — the reference check and the delete are performed as one atomic
  operation, so a concurrent `ASSIGN_ROLE`/`ATTACH_POLICY` cannot race a `DELETE_ROLE`/`DELETE_POLICY`
  into leaving a grant row pointing at a deleted parent (mirrors INV-08's concurrent-disable reasoning,
  applied to reference-counting instead of owner-counting). This invariant is the **reason** REQ-19's
  hard delete is safe despite REQ-11/INV-02's disable-only rule for principals: principals are
  referenced by the audit trail (`change_sets.actorId`, which must always resolve — INV-02); roles and
  policies are never referenced by `change_sets`, so a delete with zero live references leaves no
  dangling foreign key and destroys no audit history. The two rules protect the same property
  (referential integrity) by different means because the two entities have different reference shapes.

---

## Edge Cases

- EC-01: First mutation during first boot before any human logs in (e.g. seed writes).
  Expected: seed writes are attributed to the `system` principal (not `user-local`), consistent
  with SPEC-002/003 seed-exemption from change-sets where applicable.
- EC-02: A session whose principal is disabled mid-session.
  Expected: next request 401; the session is treated as revoked.
- EC-03: An API key whose bound principal is disabled.
  Expected: 401 — key validity requires an `active` principal, not just a non-revoked key.
- EC-04: A permission checked that exists in the catalog but is in no policy the principal holds.
  Expected: `authorize()` returns `allowed=false` with reason `no_grant`; 403 at the route.
- EC-05: Concurrent logins for one principal.
  Expected: multiple valid session rows may coexist; revoking one does not revoke the others;
  disabling the principal invalidates all.
- EC-06: A policy row with `resource_type` set but `constraint_json` null (coarse resource scope,
  no field rule).
  Expected: v1 **does** interpret `resource_type` — the grant applies **only** when
  `context.entityType == resource_type`; a missing or mismatched `entityType` is denied
  (fail-closed, AC-14), never treated as a global grant. A non-null uninterpretable
  `constraint_json` also triggers fail-closed (AC-09).
- EC-07: An admin who issued an API key is later demoted.
  Expected (documented asymmetry, ADR-021): the key retains its granted power until revoked — v1
  applies no live delegator clamp to non-agent direct credentials; recorded as a known limitation.
- EC-08: A demoted principal (or a caller holding a revoked API key) replays a command id that
  previously succeeded.
  Expected: `authorize()` runs **before** the idempotency lookup and returns 403 `FORBIDDEN`; the
  caller never receives `DUPLICATE_COMMAND` or the original `changeSetId` (no audit-metadata leak /
  replay oracle) — the A1 fix (REQ-05, INV-04).
- EC-09: A pre-existing site is migrated whose `change_sets` already carry `actorId='user-local'`
  (from the Article VI stub).
  Expected: first boot seeds a disabled `user-local` principal in the local workspace so the new
  REQ-10 composite FK `(workspace_id, actorId)` holds; history is never rewritten (ADR-021 §5). A
  migration that would leave a `user-local` change-set with no matching principal is a build defect.
- EC-10: An `admin` (holding `apikey.manage`) tries to escalate by minting a key carrying
  owner-only powers.
  Expected: rejected at issuance with `GRANT_EXCEEDS_ISSUER` (INV-07/AC-15); the attach path cannot
  exceed the issuer, and the built-in `owner` policy cannot be attached by a non-owner.
- EC-11: An issuer holds a permission only **conditionally** (resource-scoped, e.g. `content.write`
  for `resource_type='post'`, or constraint-bound) and tries to attach it to a key.
  Expected: `GRANT_EXCEEDS_ISSUER` — v1 requires an **unconstrained** hold to delegate; a scoped hold
  can be neither delegated nor widened at issuance (INV-07/AC-15). Comparing "is scope A ⊆ scope B"
  would need the deferred `constraint_json` engine (OQ-03); the unconstrained-hold rule is the
  fail-closed v1 substitute. Owner's `*` always qualifies as an unconstrained hold.
- EC-12: A `tovu` CLI (or in-process core) mutation is invoked with **no** HTTP session or API key.
  Expected: the gateway resolves the caller to the seeded `owner` principal (REQ-13), `authorize()`
  runs with owner authority, and the change-set is stamped with that principal id — the CLI is never
  an unauthenticated caller and never bypasses `authorize()` (RT-001).
- EC-13: A session that is valid and non-revoked but **past its `expires_at`**.
  Expected: the next request with it returns 401 `UNAUTHENTICATED` (treated as revoked) and never
  reaches `authorize()`. Session lifetime is an **absolute** expiry set at creation (behavior §4);
  sliding renewal is deferred (OQ-04) (RT-004).
- EC-14 **(0.6.0)**: `ENABLE_PRINCIPAL` is called on the seeded, disabled legacy `user-local` `system`
  principal (REQ-09's migration-compat row).
  Expected: rejected `VALIDATION_ERROR` — `ENABLE_PRINCIPAL` targets `kind='user'` only; `user-local`
  is `kind='system'` and has no credentials to reactivate (it exists solely so old change-sets
  resolve, EC-09).
- EC-15 **(0.6.0)**: `DELETE_ROLE` (or `DELETE_POLICY`) is called on a role/policy the caller just
  removed the last assignment from, in the same logical operation window as a concurrent
  `ASSIGN_ROLE`/`ATTACH_POLICY` targeting it.
  Expected: INV-09's atomic reference-check-and-delete means exactly one of the two operations
  observes a consistent state — either the delete sees the new reference and refuses
  `RESOURCE_CONFLICT`, or the assign/attach runs after the delete and gets `RESOURCE_NOT_FOUND`; never
  a grant row left pointing at a deleted parent.
- EC-16 **(0.6.0)**: `RESET_USER_PASSWORD` is called on a user with **zero** active sessions (already
  logged out everywhere).
  Expected: the password still changes; the session-revocation step is a no-op over an empty set
  (idempotent, same discipline as `LOGOUT` on an already-revoked session).
- EC-17 **(0.6.0)**: `UPDATE_USER` is called with an empty-string or absent `email`.
  Expected: `email` is set to `null` (cleared) — an empty string is not stored as a distinct
  "blank but present" state, avoiding a third ambiguous value alongside `null`/populated.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| SPEC-001 command gateway | The mutation seam `authorize()` plugs into; `actorId` on change-sets | Seam signature drift | none — blocks REQ-05 |
| ADR-015 Drizzle repos | `content.db` schema + migrations for the new tables (rule-of-two: memory + SQLite) | schema drift | none — blocks all persistence |
| ADR-007 workspace scoping | `workspaceId` on every row; the composite-FK isolation builds on it | — | none |
| SPEC-005 plugin capabilities | The separate capability axis this spec deliberately does NOT re-route | conflation | keep axes distinct |
| ADR-020 origin isolation | Admin-origin/cookie-less-theme-origin rule the session model depends on | same-origin session theft | admin isolated origin |
| argon2 (library) | Password + API-key hashing behind a `HasherPort` (rule-of-two candidate) | weak hashing | none — INV-05 |

---

## Open Questions

Questions that do not block Software Architect dispatch but must be resolved before TDD begins.
Every item has an owner and a resolution target date (planning targets, tied to the phase that
opens the question). These were tracked inline in Scope in 0.4.0; 0.4.1 promotes them to explicit
Open Questions per the template.

- OQ-01: Agents / `agents` / `agent_grants` / delegated-grant evaluation (ADR-013/014/016). — Owner: Leon Aburime — Resolve by: 2026-09-30
- OQ-02: Live delegator-clamp on direct grants — should a demoted issuer's already-issued keys lose power before revocation (EC-07)? — Owner: Software Architect — Resolve by: 2026-09-30
- OQ-03: Policy-rule engine — field/row-level `constraint_json` (ABAC) interpretation beyond the v1 fail-closed seam. — Owner: Software Architect — Resolve by: 2026-12-31
- OQ-04: Password reset / email flows, MFA, OAuth/OIDC, desktop-host SSO. — Owner: Leon Aburime — Resolve by: 2026-10-31
- OQ-05: Cross-site identity federation in Tovu-Runner (the shell owns operator auth, ADR-011). — Owner: Leon Aburime — Resolve by: 2026-11-30
- OQ-06: Admin UI for user/role management (this spec is API + core). — Owner: Leon Aburime — Resolve by: 2026-08-31
- OQ-07: ADR-014 tool-registry `auth`-axis re-expression (lands with the assistant spec). — Owner: Software Architect — Resolve by: 2026-09-30
- OQ-08: **Revisit the v1 CLI/core-caller authentication model (REQ-13).** v1 runs the `tovu` CLI as
  the seeded `owner` principal on a documented "local shell == owner" trust boundary (RT-001, owner's
  explicit request to return to this). Future hardening to weigh: a **distinct, attributable
  `cli-operator` principal** so CLI writes are distinguishable from the human owner in the audit
  trail; a **scoped / least-privilege CLI credential** or a `tovu login` step; and whether
  local-shell-as-owner remains acceptable once multi-user / remote-operator scenarios (OQ-05) land.
  Because owner holds `*`, the current model lets any local-shell user mint API keys (INV-07 is
  satisfied) — the primary reason to revisit. — Owner: Leon Aburime — Resolve by: 2026-10-31

---

## Constitution Compliance

Completed by the Spec Agent. Verified by the Software Architect Agent.
Any EXCEPTION requires a justification row in the ADR's Complexity Justification table.

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES (with Architect note) | Hashing uses the `argon2` library behind `HasherPort` (INV-05), not custom crypto; persistence uses ADR-015 Drizzle repos, not a hand-rolled store. **The session store (REQ-06) and rate limiter (REQ-14) are hand-rolled in v1** — Red-Team RT-006 flags build-vs-adopt: the Software Architect must record a Complexity Justification in ADR-021 (adopt a session/rate-limit library, or justify ownership on security-boundary + ADR-020 admin-origin-cookie-coupling grounds). |
| II — Test-First | COMPLIES | TDD Agent is dispatched before the Programmer; every P1 AC is testable pre-implementation (traceability.spec §1). |
| III — Simplicity Gate | COMPLIES | Every table and module in the contract files traces to a REQ (see traceability.spec §1); no module without a requirement. |
| IV — Anti-Abstraction Gate | COMPLIES | `authorize()` is ordinary core code, explicitly **not** a port (REQ-04, ADR-006 one-evaluator); the only port, `HasherPort`, is a rule-of-two candidate with real memory+argon2 uses. No speculative abstraction. |
| V — Integration-First Testing | COMPLIES | Each P1 AC (AC-01..10, AC-13..19, AC-21..26; AC-11/12/20 are P2) maps to an integration-level test row in traceability.spec §1 (currently pending, pre-TDD). |
| VI — Security-by-Default | COMPLIES | This spec **is** the security feature: it retires the Article VI dev-only `user-local` exception. Fail-closed `authorize()` (INV-03), argon2id (INV-05), hashed revocable credentials, issuance clamp (INV-07); Security Agent review required before merge. |
| VII — Spec Integrity | COMPLIES | All package files reference spec_id SPEC-006 and version 0.6.0; feature.spec carries the canonical content_hash (VII / DoD G-07). |
| VIII — Observability | COMPLIES | errors.spec defines a structured envelope with `correlationId` for all server-side errors; `authorize()` failure reasons are typed (`no_grant`, `resource_scope_mismatch`, `unconstrained_deny`, `principal_disabled`). |

---

## Implementation Readiness Gate

This checklist must be fully checked before the spec is handed off to the Software Architect Agent.
The Spec Agent completes this. The Coordinator verifies before routing.

- [x] spec_id assigned and unique (SPEC-006, verified against `ADS-project-knowledge/reports/pipeline/` and specs/)
- [x] version set to correct semver (0.6.0 — minor: additive CRUD-completion scope, no change to the
      security core)
- [ ] status set to APPROVED (not DRAFT or REVIEW) — **REOPENED at 0.6.0.** The pre-existing v0.5.6
      content (through AC-26/INV-08) keeps its 2026-07-09 APPROVED provenance and is unchanged. The
      **new** 0.6.0 material (REQ-15..19, AC-27..32, INV-09, EC-14..17, plus the api.spec/state.spec
      documentation-of-existing-drift) has **not** been through Red-Team or an owner DRAFT→APPROVED
      checkpoint yet — this amendment is the Spec Agent's output only. Coordinator: route to Red-Team
      before Software Architect dispatch, same as the original v0.4.1→v0.5.0 pass.
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly (FEAT-006-identity-and-authorization)
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (non-trivial ordering/precedence rules present)
- [x] traceability.spec.md complete (seeded, marked "pending implementation")
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT`/`OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA — B-03 (status APPROVED) resolved at the 2026-07-09 human checkpoint; B-32 resolved with it.
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row reserved for Planning Preflight
- [x] If `spec_mode` is brownfield, evidence paths are recorded in `spec-manifest.md`

**Gate result:** CONDITIONAL — the pre-existing v0.5.6 scope remains PASS (unchanged, still
APPROVED-quality). The **0.6.0 amendment is DRAFT**, pending the same two-step checkpoint v0.5.6
itself went through: (1) Red-Team pass over REQ-15..19/AC-27..32/INV-09/EC-14..17, (2) owner
DRAFT→APPROVED sign-off. Not cleared for Software Architect dispatch until both land. This spec
package is otherwise complete and internally consistent (see spec-dod.md's 0.6.0 section for the
itemized status) — the only gap is the approval ceremony for the new material, exactly the shape
the 0.5.x gate was in before 2026-07-09.
