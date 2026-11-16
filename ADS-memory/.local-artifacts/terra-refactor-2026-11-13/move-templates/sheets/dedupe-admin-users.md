id: DD-admin-users-1   (template T-DEDUPE, executed with T-DELETE's reduce form; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton by make-sheet.py)
feature: admin/features/users   (W1 #32, level 3)
status: READY
kind: re-kinded SPLIT+DEDUPE -> DEDUPE (one slice, Tovu-only, no Jini commit). Same shape as sheets/dedupe-admin-members.md:
  - Tovu `UsersPort` (users-port.hooks.ts:19) == Jini `UsersPort` (packages/user-management/src/react/ports.ts:9, on `@jini-ai/user-management/react`). Only difference: Jini's four readers take `(required: Record<string, never>)` -> callers pass `{}`.
  - Tovu `createFakeUsersPort`/`FakeUsersPortOptions`/`fakeUser` (users-dependencies.hooks.ts:31-160) == Jini `createFakeUsersPort(_required, options)` (src/react/testing.ts, `@jini-ai/user-management/react/testing`): same seed fields, same "fake user not found: <id>" text, same meId/canManageUserTrash defaults, same trash-removes-from-list. ONE behaviour difference, Jini is the superset: Jini `updateUser` keeps the current username when `opts.username` is undefined (`username: opts?.username ?? current.username`); Tovu's spread would write `username: undefined` when a caller passes `{ username: undefined }`. No Tovu test passes `username: undefined` (grep below); it is a test-fake fix, not product behaviour -> no RED test. Check: `rg -n "username: undefined" apps/admin/src/features/users/__tests__` must print nothing; else SKIP.
  - `toJiniUsersPort` (users-dependencies.hooks.ts:162) is the identity once the port is typed as Jini's: DELETE.
  STAY-WIRING: `defaultUsersPort` (lib/api binding + the `canManageUserTrash ?? false` / `effectivePermissions ?? []` defaults for older servers).

guarded files (blob at b28d38c6; mismatch = SKIP):
  - apps/admin/src/features/users/hooks/users-port.hooks.ts | blob 64cc2cc1e6e4c786b988f872d383579de853d7c0 | delete
  - apps/admin/src/features/users/hooks/users-dependencies.hooks.ts | blob 230f69fadc889c1a394ec4a191e3192e7f9715a1 | rewrite to FILE_AFTER
  - apps/admin/src/features/users/hooks/users-controller.hooks.ts | blob 3c4a144091f17535ab13c5d23b598abb91d3c699
  - apps/admin/src/features/users/UsersPanel.tsx | blob 9fa493d09fe5e4eb7612ee23cb3a85f805f5c547
  - apps/admin/src/features/users/__tests__/use-users.unit.test.tsx | blob bd469fd68413b6eeb10333340a15f789095f1056
  - apps/admin/src/features/users/__tests__/change-username.unit.test.tsx | blob 8e68b76ca7e886efc1c5078d90ee941dc91ccdeb
  - apps/admin/src/features/users/__tests__/users-agent-drive.unit.test.tsx | blob 3b86886ecb0508534efac0d816a47959df10f2ce
  - apps/admin/src/features/users/__tests__/account-protections.unit.test.tsx | blob 659f1fd9ac7bcd425b56b4cb4a4cf11cd6e99e7a
  - development/scripts/hardwiring-debt.json | text-guarded
  - Jini read-only: `rg -n "export function createFakeUsersPort\(_required: Record<string, never>" packages/user-management/src/react/testing.ts` prints 1 line; else SKIP.

census (must equal): users-port.hooks.ts <- users-controller.hooks.ts:8, users-dependencies.hooks.ts:2. users-dependencies.hooks.ts <- users-controller.hooks.ts:7, UsersPanel.tsx:6, __tests__/use-users.unit.test.tsx:6, change-username.unit.test.tsx:5, users-agent-drive.unit.test.tsx:9, account-protections.unit.test.tsx:5.
reach_check: rg -n --no-heading -w "toJiniUsersPort|users-port\.hooks" apps --glob '!**/node_modules/**' -> only lines edited below, plus comment-only mentions in features/roles/hooks/roles-port.hooks.ts:9 ("matching `users-port.hooks.ts`'s identical reasoning") -> comment_ref: "matching `users-port.hooks.ts`'s identical reasoning" -> "matching the users screen's identical reasoning (its port is now `UsersPort` in `@jini-ai/user-management/react`)"; features/trash/hooks/trash-dependencies.hooks.ts:16 names users-dependencies.hooks.ts (still exists): leave.

edits (exact old -> new, each once unless a count is given):
  hooks/users-controller.hooks.ts:
    - "import { useCallback, useMemo } from \"react\";" -> "import { useCallback } from \"react\";"   (FIRST check `rg -c "useMemo" hooks/users-controller.hooks.ts` prints 2: the import and line 31; else keep the import unchanged)
    - "import { useUsers as useJiniUsers, type UsersController as JiniController } from \"@jini-ai/user-management/react\";" -> "import { useUsers as useJiniUsers, type UsersController as JiniController, type UsersPort } from \"@jini-ai/user-management/react\";"
    - "import { defaultUsersPort, toJiniUsersPort } from \"./users-dependencies.hooks\";" -> "import { defaultUsersPort } from \"./users-dependencies.hooks\";"
    - delete line "import type { UsersPort } from \"./users-port.hooks\";"
    - delete line "  const jiniPort = useMemo(() => toJiniUsersPort({ port }), [port]);"
    - "useJiniUsers({ port: jiniPort, translate, queryScope: WORKSPACE_ID }, {" -> "useJiniUsers({ port, translate, queryScope: WORKSPACE_ID }, {"
  UsersPanel.tsx:
    - "import { defaultUsersPort, toJiniUsersPort } from \"./hooks/users-dependencies.hooks\";" -> "import { defaultUsersPort } from \"./hooks/users-dependencies.hooks\";"
    - "const port = toJiniUsersPort({ port: defaultUsersPort });" -> "const port = defaultUsersPort;"
  __tests__/use-users.unit.test.tsx:
    - "import { createFakeUsersPort, defaultUsersPort, toJiniUsersPort } from \"../hooks/users-dependencies.hooks\";" -> "import { createFakeUsersPort } from \"@jini-ai/user-management/react/testing\";\nimport { defaultUsersPort } from \"../hooks/users-dependencies.hooks\";"
    - "    const port = toJiniUsersPort({ port: fake });" -> "    const port = fake;"   (the test "Jini's object-shaped status and delete adapters change the backing user list" keeps every assertion)
    - ALL 23 "createFakeUsersPort({ " -> "createFakeUsersPort({}, { "; the 1 "createFakeUsersPort()" -> "createFakeUsersPort({})"
    - ALL of ".me()" (4: lines ~990,991,992,1022), ".listRoles()" (1), ".listPolicies()" (1), ".listUsers()" (3) -> same with "({})". Total 9; count before must be 9.
  __tests__/change-username.unit.test.tsx, users-agent-drive.unit.test.tsx, account-protections.unit.test.tsx:
    - "import { createFakeUsersPort } from \"../hooks/users-dependencies.hooks\";" -> "import { createFakeUsersPort } from \"@jini-ai/user-management/react/testing\";"
    - every "createFakeUsersPort({ " -> "createFakeUsersPort({}, { " (counts 1 / 1 / 2)
  features/roles/hooks/roles-port.hooks.ts: the comment_ref above (blob: record `git hash-object` before edit; text must occur once).
  development/scripts/hardwiring-debt.json: remove the 7-line object whose "file" is "apps/admin/src/features/users/hooks/users-dependencies.hooks.ts" and "reason" "Export createFakeUsersPort duplicates a Jini function without using its owner." (fingerprint 69d895dbd44eb85c9ee27974cabde11ae66ace5eb12ffed0cb739cc43c9f4aaf), with its separating comma; JSON.parse check after.
  No assertion line changes besides those call-shape edits (COMMON rule 20).

git rm -q apps/admin/src/features/users/hooks/users-port.hooks.ts

FILE_AFTER (whole new apps/admin/src/features/users/hooks/users-dependencies.hooks.ts, ending with one newline):
```ts
import type { UsersPort } from "@jini-ai/user-management/react";
import { api } from "@/lib/api";

/**
 * @file The only place the users screen reaches `lib/api`. The port it binds and the in-memory fake
 * tests use both live in `@jini-ai/user-management` (`/react` and `/react/testing`); Tovu keeps only
 * this binding to its HTTP client.
 *
 * `me()` (password-banner plan 2026-09-24, Slice 3; delete-user plan v2, Slice 4): the signed-in
 * caller's own id, so the screen can open the reset-password dialog on their row, plus whether THIS
 * caller may trash/restore/purge users (owner or the built-in `admin` role, computed server-side by
 * `/auth/me` via `callerMayManageUserTrash`, the same function the DELETE route is gated on). That
 * flag only hides the row-menu Delete item; it is never the real boundary.
 */

/** The live implementation, as a module-level singleton. */
export const defaultUsersPort: UsersPort = {
  listUsers: () => api.listUsers(),
  // `canManageUserTrash` defaults to `false` against an older server build that predates the field
  // (delete-user plan v2) — same "absent means not yet supported" convention `effectivePermissions`
  // already uses elsewhere on this same response.
  me: async () => {
    const res = await api.me();
    return { user: { id: res.user.id }, canManageUserTrash: res.canManageUserTrash ?? false, effectivePermissions: res.effectivePermissions ?? [] };
  },
  listRoles: () => api.listRoles(),
  listPolicies: () => api.listPolicies(),
  createUser: (input, options = {}) => api.createUser(input, options),
  updateUser: (target, options = {}) => api.updateUser(target, options),
  disableUser: ({ principalId }, _options = {}) => api.disableUser({ principalId }),
  enableUser: ({ principalId }, _options = {}) => api.enableUser({ principalId }),
  resetUserPassword: (input, _options = {}) => api.resetUserPassword(input),
  assignRole: (input, _options = {}) => api.assignRole(input),
  attachPolicy: (input, _options = {}) => api.attachPolicy(input),
  deleteUser: ({ principalId }, _options = {}) => api.deleteUser({ principalId }),
};
```
STOP extra: eslint/tsc-visible error that `api.createUser(input, options)` rejects Jini's `email?: string | undefined` under exactOptionalPropertyTypes -> SKIP and report (do not cast).
why_moves: the "one shared port, not split by concern" rationale in users-port.hooks.ts:9-17 is about the port's shape, which Jini now owns; it is dropped (Jini ports.ts has no header to carry Tovu's AI-Dev-Shop skill reference). Record in the commit body.
untangle_overlap: none
jini_commit: -
tovu_msg: "refactor(admin-users): use the shared UsersPort and fake from @jini-ai/user-management" | body: "Tovu keeps the lib/api binding; toJiniUsersPort was an identity adapter. The shared fake keeps the current username on an update without one."
Order: guards; census; edits; FILE_AFTER; git rm; reach_check; eslint 8 .ts/.tsx; JSON check; one Tovu commit (10 paths).
Cloud run owes: every apps/admin/src/features/users/__tests__ file, Tovu typecheck, hardwiring gate.
est. executor tokens: ~50k Sonnet.
