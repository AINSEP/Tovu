# SEC-settings-workspace-scoping — Security Adjudication of Code Review CR-001

- Date: 2026-07-28
- Reviewer: Security Agent
- Dispatch: Code Review CR-001 adjudication — `src/server/routes/admin/settings/get-raw.ts` (SPEC-007 `SETTINGS_GET_RAW`) query-param workspace-override vs. path-bound `authorize()` check, plus the pre-existing sibling `get-effective.ts`.
- Skills loaded: `AI-Dev-Shop/agents/security/skills.md`, `AI-Dev-Shop/skills/security-review/SKILL.md`, `AI-Dev-Shop/skills/architecture-decisions/SKILL.md`, `AI-Dev-Shop/skills/general-behavior/SKILL.md`.

## Scope and Method

Traced the full data/authorization path for both flagged routes: `authorize()` in `src/identity/authorize.ts`, the settings repo (`src/features/settings/repo.sqlite.ts`), the server composition root (`src/server/deps.ts`), session validation (`src/server/middleware/dev-auth.ts`), the SPEC-044 workspace-administration slice (`src/features/workspace/*`, `src/server/routes/admin/workspace/*`), and ADR-007 (`ADS-memory/reports/architecture/ADR-007-structural-workspace-scoping.md`). Also inspected the three settings *write* routes (`set.ts`/`clear.ts`/`reset.ts`) since they share the same override shape and matter for the "fix both files consistently" instruction and for judging whether this is a one-off or systemic pattern.

## Trust Boundary Map (this surface)

- Entry point: authenticated admin session (`tovu_session` cookie) → `requireAdminSession` → `getAuthedPrincipal(res)`.
- Trust boundary crossed: authenticated admin principal → arbitrary workspace's settings ledger (global/workspace/user layers), via two independent, attacker-controlled query/body parameters (`workspaceId`, `principalId`) that are *not* re-validated against the principal's actual grant scope.
- Sensitive data: settings values can be marked `secret` (`SettingDefinitionRecord.secret`) and include arbitrary per-workspace/per-user configuration (API-shaped, potentially credentials/PII depending on what a namespace stores).
- Data model intent (ADR-007): Tovu is explicitly "multisite-native" — `workspaceId` is a required, first-class parameter on every repo port method *by design*, with the expectation that **authorization**, not the repo layer, is the enforcement point ("Route-level checks are defense in depth, not the mechanism"). This finding is a violation of that stated mechanism, not of an accidental parameter.

## Finding 1 — Query-override `workspaceId` bypasses the authorized scope (CR-001)

- **Severity: Medium (current) / escalates to Critical the moment a second workspace becomes a live, session-reachable tenant**
- **Type:** Broken Access Control — authorization/data-read scope mismatch (authorize-then-substitute-the-resource, a TOCTOU-flavored IDOR at the tenant level)
- **Affected files:**
  - `src/server/routes/admin/settings/get-raw.ts:43-84` (new, SPEC-007)
  - `src/server/routes/admin/settings/get-effective.ts:35-61` (pre-existing sibling, same pattern)

### Description

Both routes validate the path param against `deps.workspaceId` (line 34/26 respectively — fine), then call `deps.authorize({ ..., workspaceId: deps.workspaceId, ... })` (also fine — this is the path-bound workspace). Immediately after, both compute:

```ts
const workspaceId = req.query.workspaceId ? String(req.query.workspaceId) : deps.workspaceId;
```

and use *that* value — not `deps.workspaceId` — for every subsequent data read (`getGlobalValue`/`getWorkspaceValue`/`getUserValue` in `get-raw.ts`; `listActiveDefinitions`/`getEffective` in `get-effective.ts`). `resolveDefinition`/`getEffective`/the repo methods are pure parameterized reads with zero authorization logic of their own (confirmed in `src/features/settings/settings.ts` and `src/features/settings/repo.sqlite.ts` — by ADR-007 design, the repo layer trusts its caller completely). Nothing between the `authorize()` call and the data read re-checks that the caller is entitled to the *query-supplied* `workspaceId`.

### Is it exploitable today? Confirmed: no — but for reasons outside this code, not because of any defense in this code.

Traced the full request path in the current single-process server composition:

1. `src/server/deps.ts` builds exactly **one** `RouteDeps.workspaceId` (`seededWorkspace.id`) at boot. This single value is shared by every route registrar in the process — it is not per-request or per-session.
2. Session validation (`src/server/middleware/dev-auth.ts` → `currentPrincipal`) calls `validateSession({ input: { workspaceId: deps.workspaceId, rawToken } })` — i.e. **every** authenticated session in this process is, by construction, a principal of that one fixed workspace. There is no code path in this repo that creates or validates a session against any other workspace id.
3. `identity/authorize.ts`'s `authorize()` looks the principal up via `principals.findById({ workspaceId: context.workspaceId, id: principalId })` (ADR-007: "a principal belongs to exactly one workspace, not a membership join"). A principal literally cannot hold a grant in a workspace other than the one it was seeded/created in.
4. SPEC-044's workspace-administration slice (`src/features/workspace/create.ts`, `src/server/routes/admin/workspace/*`) **does** let an authorized admin create additional rows in the `workspaces` metadata table (`POST /api/admin/v1/workspaces`) — the port and schema are not limited to one row (`create-workspace.spec.md` explicitly lists "Multi-tenant authorization" as a **non-goal**). But `GET /api/admin/v1/workspaces/:id` and `GET /api/admin/v1/workspaces` (`get.ts`/`list.ts`) are hard-coded to only ever resolve/return `deps.workspaceId` — a second created row is inert metadata: unreachable by path, never assigned a session, principal, or settings ledger of its own. Its own file comments say this outright ("v1 never has more than one row addressable by a running process").
5. Settings *writes* (`set.ts`/`clear.ts`/`reset.ts`) always pin `authWorkspaceId = deps.workspaceId` for the `authorize()` call (never take the override there), and the write target's own `workspaceId` override is separately self-limited by `resolveScopedDefinitionOrThrow` needing a matching, already-registered *definition* row for that literal workspaceId — in this v1 composition, workspace-scoped definitions are only ever registered under `deps.workspaceId` or `null` (platform), so no genuine second-tenant settings data can currently come into existence to leak.

Net result: there is currently no way, in the shipped composition, for a second real, session-reachable workspace with its own settings data to exist. The query-override therefore has no real second workspace to reach into today — supplying an arbitrary `workspaceId` just returns empty/null layers for a tenant that doesn't functionally exist.

### Why it still matters (the latent case)

ADR-007 states the target architecture explicitly: *"Tovu is multisite-native: workspaces are the tenancy primitive (WordPress multisite as a first-class concept...)"*, and its own Decision #1 is that **authorization**, not the repo, is supposed to be the enforcement point for exactly this kind of cross-tenant read. This code inverts that: it authorizes against one workspaceId and reads from another, with the only thing preventing exploitation today being an artifact of current deployment topology (one process = one workspace = one session pool), not a deliberate check. The moment any future work makes a second workspace row session-reachable (multi-workspace-per-install, which ADR-007/SPEC-044 both point toward as the roadmap direction), this becomes a same-session, no-extra-privilege, one-query-param cross-tenant data read — every global/workspace/user-layer setting value (including ones flagged `secret: true`) in *any* other workspace, readable by anyone holding the coarse `settings.read`/`settings.read.raw` grant in their own workspace.

### Exploit Scenario (latent, once a second workspace is session-reachable)

1. Attacker authenticates normally as an "admin"-role principal in Workspace A (a role that legitimately holds `settings.read.raw` per `identity/seed.ts`'s `BUILTIN_ADMIN_PERMISSIONS`).
2. `authorize()` is called with `workspaceId: deps.workspaceId` (= Workspace A) and passes — correctly, since the attacker really does hold that grant in A.
3. Attacker sends `GET /api/admin/v1/workspaces/<A>/settings/raw?namespace=stripe&key=secretKey&workspaceId=<B>`.
4. The route reads `settingsRepo.getWorkspaceValue({ workspaceId: B, ... })` / `getUserValue({ workspaceId: B, ... })` directly — Workspace B's raw per-layer values (global/workspace/user) come back in the response, despite the attacker holding zero grants in B.

### Mitigation

Fix `get-raw.ts` and `get-effective.ts` together (per Code Review's own note — do not patch one in isolation):

- Compute the effective `workspaceId` (query override or path-bound default) **before** calling `authorize()`, and pass that effective value as `authorize()`'s `workspaceId`, not `deps.workspaceId`. This is architecturally sound with zero interface change: `authorize()`/`AuthorizeContext` already accept an arbitrary `workspaceId` as a first-class parameter (`src/identity/authorize.ts:36-40`), and because a principal structurally belongs to exactly one workspace (ADR-007), authorizing against the *effective* workspaceId fails closed by construction the instant a caller tries to reach a workspace they are not a principal of (`principals.findById` returns null → `principal_disabled`/deny).
- Apply the identical fix to the write-side siblings' `authWorkspaceId` computation in `set.ts`, `clear.ts`, `reset.ts` — they hard-code `authWorkspaceId = deps.workspaceId` while accepting an independent `body.workspaceId` write-target override, the exact same latent pattern (currently self-limited by definition-lookup 404s, for the same "no second tenant exists yet" reason). Fixing only the two read routes and leaving the three write routes on the old pattern would reintroduce the "inconsistent scoping across near-identical endpoints" problem Code Review already flagged.
- No ADR is required for *this* fix — it is a same-file, same-call-shape correction using existing primitives. (A genuinely separate, larger, already-disclosed open question — SPEC-003 OQ-04 / ADR-041 §7's "`siteId` vs `workspaceId`" — is how a single process would ever route/mount *multiple simultaneously live* workspaces at all; that is out of scope for this fix and should stay tracked separately.)

### Verification Steps

1. Unit/integration test: authenticate as a principal who holds `settings.read.raw`/`settings.read` only in Workspace A; seed a definition + value under a second `workspaceId` (simulate via direct repo write in test, since no live route can create one today); call `GET .../settings/raw?workspaceId=<B>&...`; assert `403 FORBIDDEN`, not the leaked value.
2. Regression: same principal, same route, with `workspaceId` omitted or equal to their own — still succeeds (no functional regression for the current single-workspace-per-install case).
3. Repeat both for `get-effective.ts`.
4. Repeat the 403 assertion for `set.ts`/`clear.ts`/`reset.ts` with a mismatched `workspaceId` body field.

**Human Sign-Off Required:** Yes (authorization-logic change to a shipped admin surface — flagging per this agent's own escalation rule even though current real-world impact is nil; the fix touches five routes).

## Finding 2 — Related, live-today gap: no self-vs-other split on settings *reads* (discovered during this investigation, outside CR-001's original scope)

- **Severity: Low** (no privilege escalation among current built-in roles, but a real, exploitable-today missing access-control axis)
- **Type:** Missing authorization granularity (IDOR-shaped) — same two files, different attacker-controlled parameter (`principalId`, not `workspaceId`)

### Description

Both `get-raw.ts` and `get-effective.ts` also accept a caller-supplied `principalId` query param and pass it straight into `getUserValue`/`getEffective`'s user-layer read, with **no check that `principalId === caller.id`**. This is live today: multiple real principals genuinely coexist in the one real workspace. Compare to the *write* side (`write-service.ts`'s `deriveRequiredPermission`), which deliberately splits `settings.user.self.write` (your own value) from `settings.user.write` (someone else's) — REQ-06's "self-vs-other" rule, closing Red-Team RT-003. The read side has no equivalent split: a single `settings.read`/`settings.read.raw` permission covers reading *anyone's* personal settings values once granted at all.

### Why this isn't currently an escalation

Per `identity/seed.ts`, only the built-in `owner` (wildcard `"*"`) and `admin` roles hold `settings.read`/`settings.read.raw` today, and `admin` *already* separately holds `settings.user.write` ("Set/clear another principal's user-layer value" — by its own catalog description in `identity/permissions.ts:82-85`, explicitly for administering other users' settings). So today, being able to *read* another principal's personal setting via this gap does not exceed what `admin`/`owner` are already entitled to do on the write side. `editor`/`viewer` hold no `settings.*` permissions at all, so they cannot reach this path.

### Why it's still worth tracking

The missing split is a real latent risk the moment any narrower custom role is introduced that holds `settings.read`/`settings.read.raw` without also holding `settings.user.write` (e.g., a future "read-only settings auditor" role) — such a role would silently inherit "read any principal's personal settings," which its own permission's catalog description ("Read effective setting values"/"Read per-layer raw setting values") does not disclose. `authorize()`'s constraint mechanism (`matchesRow`) also does not currently compare `entityId` at all (verified in `identity/authorize.ts:108-113`), so a resource-instance-level constraint isn't available as a mitigation without extending `authorize()` itself — a permission-string split (mirroring the write side) is the cheaper, consistent fix.

### Mitigation

Add `settings.read.self` / `settings.user.read` (or equivalent) mirroring `deriveRequiredPermission`'s self-vs-other rule, applied whenever `principalId` is supplied and differs from the caller. Low priority relative to Finding 1; can ship independently and does not block CR-001's resolution.

**Human Sign-Off Required:** No (Low, does not block release, but should be ticketed).

## Overall Threat Assessment

The settings-route family (`get-raw.ts`, `get-effective.ts`, `set.ts`, `clear.ts`, `reset.ts`) shares one systemic pattern: `authorize()` is always checked against the ambient `deps.workspaceId`, while the actual data read/write target accepts an independent, unrevalidated caller-supplied override (`workspaceId` on all five; `principalId` additionally on the two reads). This is consistent with Code Review's characterization — it is not a one-off mistake in the new `get-raw.ts` file, it is the established shape this whole route family was written to (`get-raw.ts`'s own doc comment: "mirrors get-effective.ts's shape exactly").

Today, this surface is **not exploitable** for genuine cross-tenant data exposure: the running server is architecturally single-workspace (one `deps.workspaceId`, one session pool, one settings ledger), and SPEC-044's workspace-admin CRUD only manipulates inert metadata rows that no other subsystem (sessions, settings, RBAC) is wired to. The one live-today gap (Finding 2, `principalId`) does not currently escalate privilege beyond what the affected roles already hold by design.

However, this is exactly the kind of tenancy control ADR-007 says must never be retrofitted casually ("one unscoped query path is a cross-tenant data leak"), and ADR-007/SPEC-044 both name multi-workspace-per-install as the explicit direction of travel. Left as-is, this becomes a same-session, single-query-param, full-tenant-settings-exfiltration bug (including `secret`-flagged values) the day a second workspace becomes session-reachable — with no code change anywhere else needed to trigger it.

## Verdict on "done" status for the SPEC-007 drift-fix slice

**This does not need to block calling the SPEC-007 drift-fix slice done**, provided the finding is explicitly tracked (not silently accepted) as a known, scoped, currently-latent issue:

- It is a pre-existing pattern (`get-effective.ts` already shipped this shape before this session's `get-raw.ts` addition), not a new regression introduced by this drift-fix.
- It has no exploitable path in the current single-workspace-per-install composition (Finding 1) — confirmed by tracing session validation, `authorize()`, and the workspace-admin slice end to end, not merely asserted.
- The recommended fix is cheap, low-risk, and architecturally sound with existing primitives (no ADR needed) — but it touches five routes together (`get-raw.ts`, `get-effective.ts`, `set.ts`, `clear.ts`, `reset.ts`), per Code Review's own "fix both/all consistently or not at all" instruction, so it should be scheduled as its own small follow-up slice rather than folded ad hoc into this drift-fix.
- Recommend opening a tracked follow-up item (e.g., a SPEC-007 addendum or a small standalone ticket) referencing this report, blocking on human sign-off before patching per this agent's Critical/High-adjacent-authorization-change convention, and require it be resolved **before** any future work makes a second workspace genuinely session-reachable.
