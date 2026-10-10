# Owner account protections — 2026-10-07

Agent: Codex (Peer). Inputs: owner dispatch and verbatim decision, AI-Dev-Shop/AGENTS.md, architecture sections 13/14, final identity/Users/Trash route and tool source, read-only Jini user-management source. Graph navigation tools were unavailable; direct source inspection was used. Shared-tree edits by the mobile-layout peer were preserved.

## Rules 1–5: before → after

| Rule | Before | After and evidence |
|---|---|---|
| 1. Self account | DELETE Users already threw `SelfDeleteError`; disable had no self check. Generic HTTP Trash purge trusted per-kind permissions without checking self. User-delete tool checked self, but generic purge paths needed the same protection. | Shared `assertUserAccountAction` in `apps/website/src/features/identity/delete-user-service.ts:223` refuses own trash/delete/disable. HTTP disable maps `409 SELF_DELETE` with `you cannot disable your own account` (`routes/users/disable.ts:84`); trash keeps `you cannot delete your own account`. Registered `identity_user_disable` runs the same rule inside its transaction (`features/identity/tool-registrations.ts:233`). DELETE Users and `trash_item` share `trashUser` (`delete-user-service.ts:296`). HTTP Trash purge reports `{outcome:"forbidden"}` per self row; all three permanent-delete tools refuse self before confirmation. |
| 2. Last owner | Jini disable and Tovu trash already counted active unrestricted wildcard holders, and seeded-owner protection existed. Active users were refused by the purge adapter. Built-in owner roles cannot be renamed/deleted; there is no role-unassign route/tool. A custom last owner's unrestricted `*` could nevertheless be removed through policy-permission DELETE. | Shared guard keeps the active-owner floor for trash/disable/purge (`delete-user-service.ts:223`), including stale Trash markers and retention. Production adapter executes the injected guard inside its write transaction (`features/trash/adapters/user.ts:118`, `:201`; `composition/deps.ts:1489`). Policy-permission removal now checks `assertActiveOwnerFloor` after its write inside the reentrant identity transaction; failure rolls the removal back with `409 OWNER_REQUIRED`, exact string `the workspace must keep at least one active owner-\`*\` principal` (`routes/users/remove-policy-permission.ts:80`; helper `delete-user-service.ts:203`). Non-owner removal of an unrestricted wildcard is also refused. Tests separately cover floor checks for trash/disable/purge, stale-marker HTTP/tool/retention purge, unchanged role links through PATCH/enable, built-in role DELETE/PATCH refusals, and rollback of custom-owner grant removal. |
| 3. Admin/owner targets | Trash admitted builtin admins regardless of admin targets. `user.manage` holders could disable/reset admin targets; Jini protected owner-wildcard targets only. Builtin admins needed extra `user.manage` grants for ordinary disable/reset. | Builtin admin OR builtin owner role, seeded owner, and unrestricted owner wildcard targets require an owner caller for delete/trash/disable/reset (`delete-user-service.ts:211`, `:223`). HTTP returns `409 OWNER_REQUIRED`, exact string `only an owner can delete, trash, disable or reset the password of an admin or owner account`. Protected-target checks precede permissive base Trash authorization (`composition/trash-user-admin-override.ts:43`). Purge preparation and post-confirmation execution recheck target authority (`composition/permanent-delete-deps.ts:96`). Host boot reconciliation gives builtin admins `user.manage` for ordinary users (`features/identity/user-manage-permission.ts:6`; `composition/app-permission-grants.ts:31`). `identity_user_delete` now advertises `user.manage` and still applies role-scoped target checks, plus human confirmation (`features/permanent-delete/agent-tools.ts:10`). The decision block quotes the owner's words and records 2026-10-07 (`delete-user-service.ts:131`). |
| 4. Menu | A screen-wide delete flag controlled Delete; active rows always offered Disable/Reset password, including self/protected targets. | `userAccountCapabilities` calculates self/protected-target affordances centrally (`apps/admin/src/features/users/rules.ts:113`). The hook derives caller ownership from the server roster's owner classification and guards action handlers (`hooks/use-users.hooks.ts:393`). The row passes those capabilities to the menu (`Users.tsx:406`). Unknown caller/role state fails closed. Render tests verify owner self menu and non-owner protected-target menu. Server checks remain authoritative. |
| 5. Owner label | Username was `admin`; raw role key `owner` was displayed, with no Owner badge next to the login. | Username stays `admin`. The row adds the translated Owner badge (`Users.tsx:375`), and builtin owner role names/select options use the users dictionary (`rules.ts:200`, `:205`). Owner is translated for all 21 non-English locales (`users-i18n.ts:1517`). GET Users exposes `isOwner`/`isProtectedAccount`, including owners granted through policies (`routes/users/list.ts:85`; admin model `lib/api.ts:1571`). Render tests check login preservation and badge/role display; all locale strings are asserted exactly. |

## Route/tool coverage

- HTTP `DELETE users/:principalId`: shared trash rule; self/admin/owner refusal tests and owner/admin ordinary-user success tests.
- HTTP `POST users/:principalId/disable`: transactional target guard and SELF_DELETE mapping; same refusal/success tests. Jini retains its seeded-owner/floor checks too.
- HTTP `POST users/:principalId/reset-password`: transactional target guard; credential state remains unchanged on refusal; owner/admin ordinary-user success tests.
- HTTP `PATCH users/:principalId` accepts email only. Status/roleIds are ignored; PATCH cannot disable or remove owner role links.
- HTTP `POST users/:principalId/enable` activates only; status input cannot disable. Existing USER_IN_TRASH guard remains.
- HTTP `DELETE roles/:roleId` and `PATCH roles/:roleId`: builtin owner deletion/rename stay refused with exact VALIDATION_ERROR messages. No role-unassign surface exists.
- HTTP `DELETE policies/:policyId/permissions/:policyPermissionId`: newly closes custom last-owner authority removal, with rollback.
- HTTP `POST trash/purge`: target-aware authorize callback, per-item forbidden results, then adapter guard inside the database transaction.
- Generic HTTP `POST trash/items`: user is a bespoke adapter kind, absent from the generic TRASHABLE registry; it has no alternate generic user removal entry. Production user adapter hide is guarded regardless.
- Assistant/MCP `identity_user_disable`: wrapped registration calls the same target guard, then Jini inside one identity transaction; exact SELF_DELETE/OWNER_REQUIRED refusal text is asserted.
- Assistant/MCP `trash_item {entityType:"user"}`: registration delegates to `bindTrashUserForTool`, then the same `trashUser` as HTTP DELETE; exact protected/self refusal strings asserted.
- Assistant/MCP `identity_user_delete`, `trash_purge_item`, `trash_empty`: check every selected user's identity before confirmation and again during execution. Real SQLite tests cover self/admin/owner refusals, last-owner stale markers, promotion after preparation, and ordinary-user permission/confirmation entry.
- Assistant `identity_user_enable` and `identity_user_update_email`: schemas exclude status/roleIds and disallow unexpected fields. No password-reset or role-unassign/permission-remove identity tool exists.
- Retention: user adapter purge has the same injected seeded-owner/active-owner-floor guard without caller impersonation.
- Offline recovery `features/identity/reset-admin-password-self-verified.ts` is an operator recovery helper, not a route or assistant/MCP registration; it was not changed.

## CHANGED FILES

Runtime/UI:

- `apps/admin/src/features/users/Users.tsx`
- `apps/admin/src/features/users/hooks/use-users.hooks.ts`
- `apps/admin/src/features/users/rules.ts`
- `apps/admin/src/features/users/users-i18n.ts`
- `apps/admin/src/lib/api.ts`
- `apps/website/src/features/identity/delete-user-service.ts`
- `apps/website/src/features/identity/tool-registrations.ts`
- `apps/website/src/features/identity/user-manage-permission.ts` (new)
- `apps/website/src/features/permanent-delete/agent-tools.ts`
- `apps/website/src/features/trash/adapters/user.ts`
- `apps/website/src/server/inbound/admin-http/routes/users/deps.ts` (dependency mapper now accepts only its actual inputs)
- `apps/website/src/server/inbound/admin-http/routes/users/disable.ts`
- `apps/website/src/server/inbound/admin-http/routes/users/list.ts`
- `apps/website/src/server/inbound/admin-http/routes/users/remove-policy-permission.ts`
- `apps/website/src/server/inbound/admin-http/routes/users/reset-password.ts`
- `apps/website/src/server/runtime/composition/app-permission-grants.ts`
- `apps/website/src/server/runtime/composition/app.ts` (one seeded-owner binding line in the existing Trash module composition)
- `apps/website/src/server/runtime/composition/deps.ts`
- `apps/website/src/server/runtime/composition/permanent-delete-deps.ts`
- `apps/website/src/server/runtime/composition/trash-user-admin-override.ts`

Tests:

- `apps/admin/src/features/users/__tests__/account-protections.unit.test.tsx` (new; initially `.test.ts`, renamed for JSX render tests)
- `apps/admin/src/features/users/__tests__/users-agent-drive.unit.test.tsx` (updated controller fake and made deletion target distinct from signed-in caller)
- `apps/website/src/features/trash/__tests__/account-protections.test.ts` (new)
- `apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts` (new)
- `apps/website/src/server/runtime/composition/__tests__/account-purge-protections.test.ts` (new)

Project artifacts:

- `ADS-memory/.local-artifacts/owner-account-protections/spec-and-pattern.md` (new)
- `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md` (appended NEEDS-JINI)
- `ADS-memory/reports/2026-10-07-owner-account-protections.md` (this report)

No CSS, schema/migration, or Jini files edited. No Jini dist build, index_repository, staging, commit, push, tag, stash, checkout or reset.

## Exact validation commands

Each test invocation used one file; no whole suite or module mocks. Table histories are chronological pass/fail counts for repeated invocations of the same command.

| Exact command (from repository root) | Results |
|---|---|
| `node --import tsx --test --test-concurrency=1 apps/website/src/server/inbound/admin-http/routes/users/__tests__/account-protections.test.ts` | 0/1 (fixture import correction), 2/12 (RED), 12/2 (response fake lacked send), 14/0, 12/2 (RED ordinary-admin permission), 17/1 (RED last wildcard removal), 18/0, **19/0 final** |
| `node --import tsx --test --test-concurrency=1 apps/website/src/features/trash/__tests__/account-protections.test.ts` | 3/2 (RED adapter seam), **5/0 final** |
| `node --import tsx --test --test-concurrency=1 apps/website/src/server/runtime/composition/__tests__/account-purge-protections.test.ts` | 14/0, 19/0, 19/1 (RED ordinary-admin catalog permission), **21/0 final** |
| `cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/users/__tests__/account-protections.unit.test.ts` | 1/24 (RED), 25/0, 31/0, 31/0; file subsequently renamed to .tsx |
| `cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/users/__tests__/account-protections.unit.test.tsx` | **31/0 final** |
| `cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/users/__tests__/users-agent-drive.unit.test.tsx` | 8/1 (old real-hook test selected its own caller), **9/0 final** after separating target/caller |
| `npx tsc --noEmit -p apps/admin` | Run exactly once. Exit 2: two TS2769 React.createElement errors in the new render tests, one TS2322 controller-fake omission. Fixed by using the established JSX render pattern and supplying rowCapabilities in the fake. **Not rerun**, per the owner's explicit once limit; no green final typecheck claimed. |
| `git diff --check` | Passed; no whitespace errors. |

Final targeted tests: **85 passed, 0 failed** across five final files. The single tsc run failed on three introduced test-fixture type errors, subsequently corrected; final static typecheck remains unverified under the once-only constraint.

## NEEDS-JINI / handoff

NEEDS-JINI: Move `SelfDeleteError`, `assertUserAccountAction`, `userAccountProtection`, and the post-removal active-owner floor into `@jini-ai/user-management/server`. Call them inside disable/reset/trash/purge/grant-removal transactions, with target-aware built-in-admin ordinary-user authority. Retain unrestricted-wildcard, builtin owner/admin, and seeded-owner classification; never infer ownership from flattened permission names. Provide roster protection metadata and the matching React row capabilities/Owner locale labels in `@jini-ai/user-management`. Bind the shared rule into manual and retention user Trash adapters. Tovu enforces these rules today; Jini remains read-only.

No NEEDS-MIGRATION: boot grant reconciliation uses the existing policy tables and registry.

Suggested next assignee: coordinating agent/owner for review; Jini maintainer for extraction. Validation limitation: once-only admin typecheck did not produce a green final result. Jini's existing transaction/store guarantees remain the concurrency boundary; adapter guard is injected in the production composition.
