# VERIFIED CRITICAL — cross-tenant settings write via body-supplied `workspaceId`

Date: 2026-07-31. Verifier: Coordinator (Claude Opus 5, 1M context), reading the code directly.
Origin: Terra batch 3 finding #1 (`20260801-terra-audit-batch3-tovu.md`).

**Verdict: CONFIRMED. Terra was right that the bug is real, but pointed at the wrong line.**

Terra filed it against `write-service.ts:264`. That line is not the defect — it is a defensive
fallback. **The attacker-controlled input is in the three HTTP routes**, and the fallback never fires
for an HTTP request because every route explicitly supplies `authWorkspaceId`.

## The actual mechanism

All three settings mutation routes do the same two things:

```ts
// src/server/routes/admin/settings/set.ts:79      (also clear.ts:48, reset.ts:48)
const workspaceId = body.workspaceId ? String(body.workspaceId) : /* fallback */;
//                  ^^^^^^^^^^^^^^^^ WRITE TARGET — from the request body

// src/server/routes/admin/settings/set.ts:99      (also clear.ts:58, reset.ts:53)
const authWorkspaceId = deps.workspaceId;
//                      ^^^^^^^^^^^^^^^^ AUTHORIZATION TARGET — ambient, route-pinned
```

Both are then passed into the write service, which authorizes against one and writes to the other:

- `write-service.ts:265-270` — `authorize({ workspaceId: authWorkspaceId, ... })`
- `write-service.ts:293` — revision append uses `input.workspaceId`
- `write-service.ts:320-329` — `saveWorkspaceValue` / `saveUserValue` use `input.workspaceId`

Nothing anywhere requires the two to be equal.

`assertTargetPrincipalInWorkspace` (line 235) does **not** close this. It returns early unless
`scope === "user"` AND a *different* `principalId` was named (lines 239-240), so `scope: "workspace"`
is entirely unguarded, and a user-scoped write targeting the caller's own principal is too.

## Failure scenario

A principal authorized in workspace A, hitting workspace A's route:

```http
POST /admin/workspaces/A/settings/core.appearance/theme
{ "scope": "workspace", "workspaceId": "B", "valueJson": "dark" }
```

1. `set.ts:79` → `workspaceId = "B"` (from body)
2. `set.ts:99` → `authWorkspaceId = "A"` (ambient)
3. `set.ts:100` → authorize `settings.workspace.write` in **A** → **allowed**
4. `write-service.ts:265` → authorizes again with `authWorkspaceId` = **A** → allowed
5. `write-service.ts:322` → `saveWorkspaceValue({ workspaceId: "B" })` → **writes tenant B's row**

The revision ledger records it under B with `actor` = the A principal, so it is at least auditable
after the fact — but it is not prevented.

**`reset.ts` is the worst of the three**: it takes the same body-supplied `workspaceId` and wipes an
entire namespace, so one request clears every setting in a namespace for another tenant.

## Why it was missed

The `workspaceId` fallback in `set.ts:79-83` was added on 2026-07-31 in commit `292ca12` to fix a
real 500 (user/workspace-scoped writes arriving with `workspaceId: undefined`). Its 22-line comment
reasons carefully about the *default* — "the `:workspaceId` path param is authorized against and
pinned to `deps.workspaceId` (ADR-007), so the ambient `deps.workspaceId` is always the right default
when the body doesn't name one explicitly."

That reasoning is correct and it is also beside the point: the fix made the *absent* case safe while
leaving `body.workspaceId` as an accepted **override** that takes precedence over the pinned value.
The comment never asks what happens when the body *does* name one.

`clear.ts` and `reset.ts` predate that commit and have the same shape.

## Scope of exposure

- **Requires an authenticated principal** with `settings.workspace.write` (or
  `settings.reset.workspace`) in *some* workspace. Not a pre-auth vulnerability.
- **Requires a multi-workspace `content.db`.** That configuration is supported and intentional in
  this product, not an error state. The current dev database happens to hold 1 workspace, so it is
  not exploitable *on this machine right now* — that is a property of the data, not of the code.
- **No test covers it.** `settings-auth.test.ts`'s SET/CLEAR coverage is `scope: "global"` only
  (noted in `set.ts`'s own comment). No test in `src/server/__tests__/routes/` sends a
  `body.workspaceId` that differs from the route's workspace.

## Fix

Two layers, both cheap. Do both — the route fix is the real one, the service fix is the backstop that
makes a future route incapable of reintroducing it.

1. **Routes (`set.ts:79`, `clear.ts:48`, `reset.ts:48`)** — stop reading `body.workspaceId`. For
   non-global scopes the target is always `deps.workspaceId`. If a body `workspaceId` is present and
   differs, reject with 400 rather than silently ignoring it, so a mis-integrated caller fails loudly.

2. **`write-service.ts` `set`/`clear`/`resetNamespace`** — after computing `authWorkspaceId`, assert
   that every non-global target `workspaceId` equals it, and throw before any mutation. This is the
   invariant the module header already claims to hold.

3. **Tests** — a route-level test per verb sending `body.workspaceId = <other workspace>` and
   asserting a 4xx plus zero rows written to the other tenant. Then a write-service unit test
   asserting the mismatch throws even when a caller supplies both directly.

## Note on the agent-callable tool

`tool-registrations.ts:320` passes `authWorkspaceId: routeDeps.workspaceId` and — per Terra's own
verified analysis of the four structural bounds — never lets an input-supplied `workspaceId` reach
the write. **The agent tool does not have this bug.** The exposure is the generic HTTP surface.
