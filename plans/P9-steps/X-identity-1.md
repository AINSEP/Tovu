# X-identity-1 — identity → @jini-ai/user-management (Jini step J then Tovu step T)

Lane X. Batch J:19 T:20. Depends on: none (only already-Jini code). Est: J 71 min, T 87 min.

## J — move verbatim into Jini (10 files, 1249 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/identity/api-key-types.ts` | `packages/user-management/src/identity/api-key-types.ts` | 68 | W1 |
| `apps/website/src/features/identity/boot-session-token.ts` | `packages/user-management/src/identity/boot-session-token.ts` | 136 | W3 |
| `apps/website/src/features/identity/builtin-role-grants.ts` | `packages/user-management/src/identity/builtin-role-grants.ts` | 199 |  |
| `apps/website/src/features/identity/owner-reset-env.ts` | `packages/user-management/src/identity/owner-reset-env.ts` | 43 | W1 |
| `apps/website/src/features/identity/user-purge-types.ts` | `packages/user-management/src/identity/user-purge-types.ts` | 85 | W1 |
| `apps/website/src/features/identity/username-change-ports.ts` | `packages/user-management/src/identity/username-change-ports.ts` | 28 | W1 |
| `apps/website/src/features/identity/api-key-secret.ts` | `packages/user-management/src/identity/api-key-secret.ts` | 244 | W7 |
| `apps/website/src/features/identity/delete-user-service.ts` | `packages/user-management/src/identity/delete-user-service.ts` | 364 | W2 |
| `apps/website/src/features/identity/permission-grants.ts` | `packages/user-management/src/identity/permission-grants.ts` | 39 |  |
| `apps/website/src/features/identity/repo.memory.ts` | `packages/user-management/src/identity/repo.memory.ts` | 43 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/user-management" exports["./identity/api-key-secret"]
- "@jini-ai/user-management" exports["./identity/api-key-types"]
- "@jini-ai/user-management" exports["./identity/boot-session-token"]
- "@jini-ai/user-management" exports["./identity/builtin-role-grants"]
- "@jini-ai/user-management" exports["./identity/delete-user-service"]
- "@jini-ai/user-management" exports["./identity/owner-reset-env"]
- "@jini-ai/user-management" exports["./identity/permission-grants"]
- "@jini-ai/user-management" exports["./identity/repo.memory"]
- "@jini-ai/user-management" exports["./identity/user-purge-types"]
- "@jini-ai/user-management" exports["./identity/username-change-ports"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (5, 646 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/identity/__tests__/boot-session-token.test.ts`
- `apps/website/src/features/identity/__tests__/builtin-role-grants.test.ts`
- `apps/website/src/features/identity/__tests__/owner-reset-env.test.ts`
- `apps/website/src/features/identity/__tests__/api-key-secret.no-derivation.test.ts`
- `apps/website/src/features/identity/__tests__/api-key-secret.test.ts`


## T — Tovu repoint: delete the 10 sources, rewrite every importer (76 lines)

```
apps/website/src/features/identity/__tests__/api-key-service.test.ts:10  '../api-key-types.js' -> '@jini-ai/user-management/identity/api-key-types'
apps/website/src/features/identity/__tests__/repo.contract.test.ts:11  '../api-key-types.js' -> '@jini-ai/user-management/identity/api-key-types'
apps/website/src/features/identity/api-key-service.ts:6  './api-key-types.js' -> '@jini-ai/user-management/identity/api-key-types'
apps/website/src/features/identity/repo.authentication.ts:6  './api-key-types.js' -> '@jini-ai/user-management/identity/api-key-types'
apps/website/src/features/identity/wiring.ts:19  './api-key-types.js' -> '@jini-ai/user-management/identity/api-key-types'
apps/website/src/server/inbound/admin-http/http/api-keys.ts:3  '#src/features/identity/api-key-types' -> '@jini-ai/user-management/identity/api-key-types'
apps/website/src/server/routes/types.ts:36  '../../features/identity/api-key-types.js' -> '@jini-ai/user-management/identity/api-key-types'
apps/website/src/cli/commands/serve-listen.ts:5  '#src/features/identity/boot-session-token' -> '@jini-ai/user-management/identity/boot-session-token'
apps/website/src/server/__tests__/admin-boot-session-route.test.ts:10  '../../features/identity/boot-session-token.js' -> '@jini-ai/user-management/identity/boot-session-token'
apps/website/src/server/__tests__/admin-local-boot-session-route.test.ts:9  '../../features/identity/boot-session-token.js' -> '@jini-ai/user-management/identity/boot-session-token'
apps/website/src/server/inbound/admin-http/dev-auth.ts:32  '#src/features/identity/boot-session-token' -> '@jini-ai/user-management/identity/boot-session-token'
apps/website/src/features/identity/__tests__/role-manage-permission.test.ts:21  '../builtin-role-grants.js' -> '@jini-ai/user-management/identity/builtin-role-grants'
apps/website/src/features/identity/__tests__/site-key-permission.test.ts:14  '../builtin-role-grants.js' -> '@jini-ai/user-management/identity/builtin-role-grants'
apps/website/src/features/identity/wiring.ts:13  './builtin-role-grants.js' -> '@jini-ai/user-management/identity/builtin-role-grants'
apps/website/src/features/pages/__tests__/edit-html-permission.test.ts:8  '../../identity/builtin-role-grants.js' -> '@jini-ai/user-management/identity/builtin-role-grants'
apps/website/src/features/settings/__tests__/visitor-tools-permissions.unit.test.ts:9  '../../identity/builtin-role-grants.js' -> '@jini-ai/user-management/identity/builtin-role-grants'
apps/website/src/server/__tests__/routes/pages-update-html-auth.test.ts:15  '#src/features/identity/builtin-role-grants' -> '@jini-ai/user-management/identity/builtin-role-grants'
apps/website/src/server/inbound/admin-http/routes/fs-files/__tests__/custom-root-permission.test.ts:14  '#src/features/identity/builtin-role-grants' -> '@jini-ai/user-management/identity/builtin-role-grants'
apps/website/src/server/runtime/composition/reset-owner.ts:10  '#src/features/identity/owner-reset-env' -> '@jini-ai/user-management/identity/owner-reset-env'
apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:8  '#src/features/identity/owner-reset-env' -> '@jini-ai/user-management/identity/owner-reset-env'
apps/website/src/features/identity/__tests__/delete-user-service.test.ts:16  '../user-purge-types.js' -> '@jini-ai/user-management/identity/user-purge-types'
apps/website/src/features/identity/__tests__/user-purge.test.ts:7  '../user-purge-types.js' -> '@jini-ai/user-management/identity/user-purge-types'
apps/website/src/features/identity/user-purge.ts:5  './user-purge-types.js' -> '@jini-ai/user-management/identity/user-purge-types'
apps/website/src/features/trash/adapters/user.ts:1  '#src/features/identity/user-purge-types' -> '@jini-ai/user-management/identity/user-purge-types'
apps/website/src/server/inbound/admin-http/routes/users/delete.ts:6  '#src/features/identity/user-purge-types' -> '@jini-ai/user-management/identity/user-purge-types'
apps/website/src/server/runtime/composition/trash-user-tool-port.ts:4  '#src/features/identity/user-purge-types' -> '@jini-ai/user-management/identity/user-purge-types'
apps/website/src/features/identity/tool-registrations.ts:33  './username-change-ports.js' -> '@jini-ai/user-management/identity/username-change-ports'
apps/website/src/server/inbound/admin-http/routes/users/deps.ts:7  '#src/features/identity/username-change-ports' -> '@jini-ai/user-management/identity/username-change-ports'
apps/website/src/__tests__/lane-su-pins/p3-p4-api-key-format.test.ts:4  '#src/features/identity/api-key-secret' -> '@jini-ai/user-management/identity/api-key-secret'
apps/website/src/features/identity/api-key-service.ts:5  './api-key-secret.js' -> '@jini-ai/user-management/identity/api-key-secret'
apps/website/src/features/identity/wiring.ts:18  './api-key-secret.js' -> '@jini-ai/user-management/identity/api-key-secret'
apps/website/src/assistant/tool-registrations.ts:187  '../features/identity/delete-user-service.js' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/features/identity/__tests__/delete-user-service.test.ts:15  '../delete-user-service.js' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/features/identity/tool-registrations.ts:6  './delete-user-service.js' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/features/identity/wiring.ts:20  './delete-user-service.js' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/features/trash/__tests__/account-protections.test.ts:7  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/dev-auth.ts:38  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/__tests__/delete.test.ts:36  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/__tests__/enable.test.ts:19  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/__tests__/reset-password.test.ts:15  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/create.ts:8  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/delete.ts:5  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/disable.ts:2  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/enable.ts:8  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/list.ts:5  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/remove-policy-permission.ts:2  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/reset-password.ts:2  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/reset-password.ts:8  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/inbound/admin-http/routes/users/update.ts:8  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/runtime/composition/__tests__/account-purge-protections.test.ts:10  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/runtime/composition/permanent-delete-deps.ts:3  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/runtime/composition/site-deps/trash-adapters.ts:10  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/runtime/composition/trash-user-admin-override.ts:4  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/server/runtime/composition/trash-user-tool-port.ts:3  '#src/features/identity/delete-user-service' -> '@jini-ai/user-management/identity/delete-user-service'
apps/website/src/features/fs-files/custom-root-permission.ts:1  '../identity/permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/identity/__tests__/passkeys.real-postgres.test.ts:12  '../permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/identity/__tests__/user-manage-permission.test.ts:5  '../permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/identity/role-manage-permission.ts:1  './permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/identity/site-key-permission.ts:1  './permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/identity/user-manage-permission.ts:1  './permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/identity/wiring.ts:14  './permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/mail-status/__tests__/delivery-visibility.unit.test.ts:8  '../../identity/permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/mail-status/permissions.ts:2  '../identity/permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/pages/permissions.ts:1  '../identity/permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/publish-content/permissions.ts:1  '../identity/permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/settings/visitor-tools-permissions.ts:2  '../identity/permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/site-backup/__tests__/import.fixture.ts:14  '../../identity/permission-grants.js' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/server/inbound/admin-http/__tests__/owner-passkey-http.integration.test.ts:15  '#src/features/identity/permission-grants' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/server/runtime/composition/__tests__/permission-grants.test.ts:6  '#src/features/identity/permission-grants' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/server/runtime/composition/app-permission-grants.ts:3  '#src/features/identity/permission-grants' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/server/runtime/composition/site-dir.ts:5  '#src/features/identity/permission-grants' -> '@jini-ai/user-management/identity/permission-grants'
apps/website/src/features/identity/__tests__/api-key-service.test.ts:11  '../repo.memory.js' -> '@jini-ai/user-management/identity/repo.memory'
apps/website/src/features/identity/__tests__/repo.contract.test.ts:10  '../repo.memory.js' -> '@jini-ai/user-management/identity/repo.memory'
apps/website/src/features/identity/__tests__/wiring.test.ts:18  '../repo.memory.js' -> '@jini-ai/user-management/identity/repo.memory'
apps/website/src/features/identity/wiring.ts:17  './repo.memory.js' -> '@jini-ai/user-management/identity/repo.memory'
apps/website/src/server/inbound/admin-http/routes/api-keys/__tests__/handler-failures.test.ts:8  '#src/features/identity/repo.memory' -> '@jini-ai/user-management/identity/repo.memory'
```

## Tovu tests that must stay green (26; import lines are repointed above, assertions untouched)
- `apps/website/src/__tests__/lane-su-pins/p3-p4-api-key-format.test.ts`
- `apps/website/src/features/identity/__tests__/api-key-service.test.ts`
- `apps/website/src/features/identity/__tests__/delete-user-service.test.ts`
- `apps/website/src/features/identity/__tests__/passkeys.real-postgres.test.ts`
- `apps/website/src/features/identity/__tests__/repo.contract.test.ts`
- `apps/website/src/features/identity/__tests__/role-manage-permission.test.ts`
- `apps/website/src/features/identity/__tests__/site-key-permission.test.ts`
- `apps/website/src/features/identity/__tests__/user-manage-permission.test.ts`
- `apps/website/src/features/identity/__tests__/user-purge.test.ts`
- `apps/website/src/features/identity/__tests__/wiring.test.ts`
- `apps/website/src/features/mail-status/__tests__/delivery-visibility.unit.test.ts`
- `apps/website/src/features/pages/__tests__/edit-html-permission.test.ts`
- `apps/website/src/features/settings/__tests__/visitor-tools-permissions.unit.test.ts`
- `apps/website/src/features/site-backup/__tests__/import.fixture.ts`
- `apps/website/src/features/trash/__tests__/account-protections.test.ts`
- `apps/website/src/server/__tests__/admin-boot-session-route.test.ts`
- `apps/website/src/server/__tests__/admin-local-boot-session-route.test.ts`
- `apps/website/src/server/__tests__/routes/pages-update-html-auth.test.ts`
- `apps/website/src/server/inbound/admin-http/__tests__/owner-passkey-http.integration.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/api-keys/__tests__/handler-failures.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/fs-files/__tests__/custom-root-permission.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/users/__tests__/delete.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/users/__tests__/enable.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/users/__tests__/reset-password.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/account-purge-protections.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/permission-grants.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/identity/api-key-types.ts` (1)
- `apps/website/src/features/identity/boot-session-token.ts` (3)
- `apps/website/src/features/identity/owner-reset-env.ts` (1)
- `apps/website/src/features/identity/user-purge-types.ts` (1)
- `apps/website/src/features/identity/username-change-ports.ts` (1)
- `apps/website/src/features/identity/api-key-secret.ts` (7)
- `apps/website/src/features/identity/delete-user-service.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/identity/repo.memory.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/identity/api-key-secret.ts:45: const KEY_SCHEME_PREFIX = "tovu_ak_";
apps/website/src/features/identity/api-key-secret.ts:57: const PREFIX_PATTERN = /^tovu_ak_[0-9a-f]{12}$/;
```

## Named mutation
in the Jini copy of `delete-user-service.ts`, negate the first `if (` condition of its first exported function; `boot-session-token.test.ts` must go red, then revert
