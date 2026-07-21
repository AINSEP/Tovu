# Spec Manifest: Identity & Authorization

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. Bound to feature.spec.md v0.5.6 (SPEC-006). -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-006 |
| feature_name | FEAT-006-identity-and-authorization |
| version | 0.6.0 |
| last_edited | 2026-07-21T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-project-knowledge/specs/006-identity-and-authorization |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow — the authoritative list of
which SPEC-006 spec files exist, which are intentionally omitted and why, and which files each
downstream stage must read.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | feature.spec.md | Canonical primary requirements spec (REQ/AC/INV/EC), hash anchor |
| `api.spec.md` | PRESENT | api.spec.md | Real HTTP surface: auth login/logout/me, api-key issue/revoke, users/roles/policies admin CRUD (§1a, 0.6.0), and the cross-cutting gateway gate |
| `state.spec.md` | PRESENT | state.spec.md | Persistent server state: principals/users/sessions/api_keys/RBAC tables, transitions (incl. 0.6.0's ENABLE_PRINCIPAL/UPDATE_USER/RESET_USER_PASSWORD/UPDATE_ROLE/UPDATE_POLICY/DELETE_ROLE/DELETE_POLICY), authorize() projection |
| `orchestrator.spec.md` | OMITTED | — | No async orchestration/coordinator layer; authorize() is a synchronous ordinary core function (REQ-04, ADR-006), the gateway pipeline is defined in api.spec §0 and behavior.spec §2 |
| `ui.spec.md` | OMITTED | — | **(0.6.0 revised reason)** `Users.tsx`/`Roles.tsx` already exist and OQ-06 is resolved, but neither was ever built from a formal `ui.spec.md` — this package continues that established practice: REQ/AC are the behavioral contract, the specific new affordances (disable/enable toggle, email-edit field, delete-role/policy buttons, a permission-picker row for `WRITE_POLICY_PERMISSION`) are Software Architect/Programmer implementation detail, same as the pre-existing grant-management UI was |
| `errors.spec.md` | PRESENT | errors.spec.md | Error registry: FORBIDDEN, UNAUTHENTICATED, GRANT_EXCEEDS_ISSUER, PERMISSION_UNKNOWN, RESOURCE_CONFLICT, OWNER_REQUIRED, and standard codes — **0.6.0 introduces zero new codes**, only new emission sites for three pre-existing ones |
| `behavior.spec.md` | PRESENT | behavior.spec.md | Deterministic rules: matcher precedence, load-bearing pipeline ordering, defaults, limits, username dedup |
| `traceability.spec.md` | PRESENT | traceability.spec.md | Seeds REQ/AC/INV/EC + error + behavior coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | spec-manifest.md | This package index |
| `spec-dod.md` | PRESENT | spec-dod.md | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | feature.spec.md, traceability.spec.md, spec-dod.md, api.spec.md, state.spec.md, errors.spec.md, behavior.spec.md, ADR-021 |
| `tdd` | feature.spec.md, traceability.spec.md, spec-dod.md, api.spec.md, state.spec.md, errors.spec.md, behavior.spec.md, ADR-021, tasks |
| `programmer` | feature.spec.md, traceability.spec.md, api.spec.md, state.spec.md, errors.spec.md, behavior.spec.md, ADR-021, certified tests |

---

## Brownfield / Reverse-Spec References

This feature extends an existing system (`spec_mode = brownfield`): it replaces the hardcoded
`user-local` actor and wires authorization into the existing SPEC-001 command gateway. Concrete
touchpoints:

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| src/server/deps.ts (hardcoded admin, `actorId: "user-local"`) | source touchpoint | The stub this spec replaces; REQ-05 stamps the real principal id and EC-09/AC-01 seed a disabled `user-local` principal so legacy change_sets still resolve |
| SPEC-001 command gateway (reserved actor/permission seam, ordered step list) | source touchpoint | REQ-05 amends SPEC-001 REQ-01 by prepending authenticate→authorize before the idempotency check (INV-04, EC-08) |
| ADR-021 Identity & Authorization (accepted architecture decision) | codebase-analysis | The governing decision this spec makes real; §5 retains change-set history as-is |
| ADR-015 Drizzle repos + content.db schema/migrations | source touchpoint | The rule-of-two persistence (memory + SQLite) the new tables land in; composite-FK migrations |
| SPEC-005 plugin capability axis | source touchpoint | The separate axis this spec deliberately does NOT re-route (keep axes distinct) |
| ADR-020 origin isolation (admin origin vs cookie-less theme origin) | codebase-analysis | The session cookie model (HttpOnly/SameSite/Secure, admin origin) depends on this isolation |

---

## Validation Notes

- **v0.6.0 (2026-07-21) — CRUD-completion amendment, status reopened to DRAFT.** Coordinator-dispatched
  slice covering three related gaps; this is the SPEC-006 leg. Adds REQ-15..19 (`ENABLE_PRINCIPAL`,
  `UPDATE_USER`, `RESET_USER_PASSWORD`, `UPDATE_ROLE`/`UPDATE_POLICY`, `DELETE_ROLE`/`DELETE_POLICY`),
  AC-27..32, INV-09 (delete-safety rationale: roles/policies aren't audit-referenced by `change_sets`
  the way principals are, so a zero-reference hard delete is safe where principal hard-delete is not),
  EC-14..17, behavior §6.3. Also repairs disclosed pre-existing drift: api.spec.md previously claimed
  "user/role/policy management is core/CLI in v1" and omitted the 8 HTTP endpoints
  (`list`/`create` for users, roles, policies; `assign-role`; `attach-policy`) that actually shipped
  before this amendment (commit `c2f9869`) — §1a now documents all 17 endpoints (8 pre-existing + 9
  new). Zero new error codes; `PERMISSION_UNKNOWN`/`OWNER_REQUIRED` reach their first HTTP surface,
  `RESOURCE_CONFLICT` gains a new emission site. OQ-06 marked RESOLVED. New OQ-09 (username change,
  deferred) and OQ-10 (single-permission removal from a policy, deferred). **Security core
  (authorize() matcher, INV-07 clamp, composite FKs, hash-only secrets, AC-01..26) is byte-unchanged.**
  Status reverted `APPROVED` → `DRAFT` for the whole document because the new REQ-15..19 scope has not
  been through Red-Team or an owner checkpoint — same two-step gate the original v0.5.x→APPROVED path
  used. Validator run pending (see below); spec-dod.md's Section B carries the itemized reopen.
- Validator last run: 2026-07-08 (post v0.5.6 snapshot-precision editorial pass)
- v0.5.6: editorial/hardening pass folding the round-6 residuals (all spec-precision, none exceeding the INV-07
  issuer ceiling; escalation class already declared terminal at v0.5.5). **M-1 (Codex+Fable MED):** a source
  policy carrying `*` (the built-in `owner` policy) may not be snapshotted — `ISSUE_API_KEY` rejects a
  `*`-bearing source `VALIDATION_ERROR`; an api_key snapshot never carries `*` (an api_key is never owner-tier),
  resolving the REQ-04-vs-snapshot contradiction; AC-15 owner clause scoped to non-`*`. **M-2 (all three MED/LOW):**
  the snapshot copies `policy_permissions` **field-identically** (`permission`/`resource_type`/`constraint_json`
  preserved, never scope-widened) — pinned in REQ-08/state §3/api §4 + AC-26 scoped-source clause. **L-1:** source
  `policyIds` must be in the caller's workspace. **L-2 (agy):** `REVOKE_API_KEY` retires the key's issuance-owned
  frozen policy (no orphan accumulation). **L-3:** `policies.is_frozen` default `false` pinned (REQ-02 field list,
  behavior §3 defaults, `CREATE_POLICY`). **L-4:** stale wording refreshed (api §6, INV-07 writer enumeration). New
  `is_frozen` handling only; no new AC. Ranges AC-01..26. Security core byte-unchanged.
- v0.5.5: applied `/audit-work` round 5 (final confirm) findings — Gemini FAIL 3.0 + Codex FAIL 7.8 + internal
  Fable FAIL 7.5. Fable's exhaustive writer census confirmed the 4-round **bound-principal api_key-inheritance
  class is CLOSED/terminal**; all three converged on one new HIGH, **F-054-01** (a different wall, bounded below
  owner-`*`): v0.5.4 froze the grant *rows* at issuance but not the *permissions they resolve to* — a shared
  non-built-in policy attached at issuance could be widened later by `WRITE_POLICY_PERMISSION` (legal for an
  owner/`role.manage` holder, clamped to the widener), and `resolveEffectivePermissions` reads live, so an
  already-issued api_key key grew post-issuance. Fix (**issuance snapshot**): `ISSUE_API_KEY` copies the clamped
  permissions into a fresh `is_frozen=true` machine-owned policy and attaches that, not a live reference;
  `WRITE_POLICY_PERMISSION` refuses `is_frozen`/`is_builtin` policies, so a later widening of a source policy
  can't reach an issued key. `policies.is_frozen` flag; INV-07 issuance-snapshot clause; new **AC-26**; state
  §1/§3/§5 updates. Ranges AC-01..26. Security core byte-unchanged.
- v0.5.4: applied `/audit-work` round 4 (final confirm) findings — Codex FAIL 8.0 + Gemini FAIL 7.5 blocked on
  the unclamped `role_policies` writer; internal Fable FAIL 7.5 found the deeper **F-053-01** (two-actor api_key
  escalation: owner endows an `api_key` principal to owner-`*`, then an `apikey.manage` admin issues a second key
  bound to it → admin's key authenticates as owner, because `ISSUE_API_KEY` read only the *attached* policies, not
  the bound principal's *pre-existing* authority). Class-closing fix (isolates machine authority to one clamped
  issuance): (1) `ISSUE_API_KEY` binds only a **grantless** principal → non-grantless target `VALIDATION_ERROR`;
  (2) `ASSIGN_ROLE`/`ATTACH_POLICY` target `kind='user'` only → api_key/system target `VALIDATION_ERROR`;
  (3) `role_policies` declared not-user-writable in v1 (F-053-02, deferred). INV-07 now enumerates all grant
  writers + the grantless rule; AC-24 reconciled; new **AC-25**. Ranges AC-01..25. Security core byte-unchanged.
- v0.5.3: applied `/audit-work` round 3 (re-confirm) findings — Codex FAIL 7.2 + Gemini FAIL 6.0 both flagged
  the v0.5.2 `ASSIGN_ROLE`/`ATTACH_POLICY` transitions as a privilege-escalation path; internal Fable PASS 9.5
  proved `role.manage` is owner-only (REQ-09) so the seeded exploit is unreachable, but the boundary rested on
  that fact alone. Fix (structural): **INV-07 generalized into a grant-authority clamp** over `ISSUE_API_KEY`/
  `ASSIGN_ROLE`/`ATTACH_POLICY`/`WRITE_POLICY_PERMISSION` — assigning/attaching the built-in owner role/policy
  now requires holding `*` (owner-only). Dropped the wrong INV-06 citation on ATTACH_POLICY; added `role.manage`
  gate to WRITE_POLICY_PERMISSION; documented `role.manage` as owner-equivalent. New AC-24; ranges AC-01..24.
  Security core byte-unchanged.
- v0.5.2: applied the v0.5.1 CONFIRMING delta re-audit findings (`/audit-work` round 2, TM-SPEC006-DELTA-01;
  internal Fable Security verifier 8.5 + Codex GPT-5.5 xhigh 9.6 + Gemini 3.1 Pro High 10 — gate PASS, but
  Fable caught 2 gaps the externals missed). F1 (HIGH): `ISSUE_API_KEY` now requires the bound principal to be
  `kind='api_key'` (REQ-08/state §3), non-`api_key` → `VALIDATION_ERROR`, new AC-23 (api_key twin of AC-22).
  F2 (MED): state §3 adds `ASSIGN_ROLE`/`ATTACH_POLICY` so editor/admin/non-seed-owner principals are
  constructible; AC-21 reworded per-workspace. F3 (LOW): api §6 lists `OWNER_REQUIRED`. New AC-23; ranges now
  AC-01..23. Security core still byte-unchanged.
- v0.5.1: applied the v0.5.0 external delta re-audit findings (TM-SPEC006-DELTA-01; Codex GPT-5.5 xhigh
  + Gemini 3.1 Pro + Fable). MF-1 CREATE_USER escalation (fresh-principal-only + gate), MF-2 seeded-owner
  un-disable-able, MF-3 INV-08 atomicity, plus SF plugin-exclusion / forwarded-for parse rule /
  `OWNER_REQUIRED` code / stale-binding-comment fixes. New AC-22, new error code. Security core unchanged.
- Validator result (v0.5.6, superseded): PASS (DRAFT→APPROVED human checkpoint cleared 2026-07-09)
- Validator result (v0.6.0): run at spec-handoff time with `--phase spec --update-hash`; see the
  freshly-computed `content_hash` in feature.spec.md's Header Metadata. Package-structural checks
  (all 10 logical files PRESENT/OMITTED with reasons, spec-dod.md fully PASS/NA) are green; the
  **status/DoD B-03/B-32 gate is expected FAIL** by design — status is `DRAFT` pending the Red-Team +
  owner checkpoint, not a defect to fix before handoff.
- Validator manual waiver: N/A
- Canonical hash verified at: 2026-07-09 (v0.5.6 APPROVED, sha256:d1a88416…) — **superseded 2026-07-21
  by the v0.6.0 recompute** (new hash in feature.spec.md; the v0.5.6 security-core bytes it covers
  are unchanged, only new sections were added below the hash boundary)
- Notes: All conditional files present or justified-omitted. **v0.5.0 is the Red-Team revision pass**
  (report `reports/pipeline/006-identity-and-authorization/red-team-findings.md`): closes RT-001
  (BLOCKING — CLI/core callers now resolve to the owner principal, REQ-13/AC-17/EC-12/OQ-08) plus
  RT-002..005 (rate-limiting REQ-14/AC-18; creation transitions + AC-19; session-lifetime pin +
  EC-13/AC-20; disable gate + last-owner lockout INV-08/AC-21); RT-006 recorded as an Article-I
  Complexity-Justification item for the Architect. The audit-clean security core (authorize matcher /
  INV-07 clamp / composite FKs / hash-only secrets) is unchanged. The coupled human-checkpoint items
  — `status must be APPROVED` plus DoD B-03 (status) and B-32 (readiness gate) and the overall-PASS
  gate — were all resolved 2026-07-09 by the owner's DRAFT→APPROVED flip; the validator is now green.
  Prior history: v0.4.1 package-completeness pass; package
  externally audited (TM-SPEC006-PKG-01: round 1 Fable 9.0 / Codex 8.2 / Gemini 7.5 → fixes applied →
  round 2 PASS Fable 9.3 / Codex 9.2 / Gemini 10.0).
