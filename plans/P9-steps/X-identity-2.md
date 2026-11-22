# X-identity-2 — identity → @jini-ai/user-management (Jini step J then Tovu step T)

Lane X. Batch J:20 T:21. Depends on: X-identity-1. Est: J 42 min, T 29 min.

## J — move verbatim into Jini (4 files, 649 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/identity/api-key-service.ts` | `packages/user-management/src/identity/api-key-service.ts` | 488 |  |
| `apps/website/src/features/identity/role-manage-permission.ts` | `packages/user-management/src/identity/role-manage-permission.ts` | 47 |  |
| `apps/website/src/features/identity/site-key-permission.ts` | `packages/user-management/src/identity/site-key-permission.ts` | 103 | W3 |
| `apps/website/src/features/identity/user-manage-permission.ts` | `packages/user-management/src/identity/user-manage-permission.ts` | 11 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/user-management" exports["./identity/api-key-service"]
- "@jini-ai/user-management" exports["./identity/role-manage-permission"]
- "@jini-ai/user-management" exports["./identity/site-key-permission"]
- "@jini-ai/user-management" exports["./identity/user-manage-permission"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 413 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/identity/__tests__/api-key-service.test.ts`


## T — Tovu repoint: delete the 4 sources, rewrite every importer (15 lines)

```
apps/website/src/features/identity/__tests__/repo.contract.test.ts:9  '../api-key-service.js' -> '@jini-ai/user-management/identity/api-key-service'
apps/website/src/server/__tests__/admin-mcp-ui-tool-calls-route.test.ts:258  '../../features/identity/api-key-service.js' -> '@jini-ai/user-management/identity/api-key-service'
apps/website/src/server/inbound/admin-http/dev-auth.ts:30  '#src/features/identity/api-key-service' -> '@jini-ai/user-management/identity/api-key-service'
apps/website/src/server/inbound/admin-http/routes/api-keys/create-principal.ts:1  '#src/features/identity/api-key-service' -> '@jini-ai/user-management/identity/api-key-service'
apps/website/src/server/inbound/admin-http/routes/api-keys/deps.ts:5  '#src/features/identity/api-key-service' -> '@jini-ai/user-management/identity/api-key-service'
apps/website/src/server/inbound/admin-http/routes/api-keys/issue.ts:1  '#src/features/identity/api-key-service' -> '@jini-ai/user-management/identity/api-key-service'
apps/website/src/server/inbound/admin-http/routes/api-keys/revoke.ts:1  '#src/features/identity/api-key-service' -> '@jini-ai/user-management/identity/api-key-service'
apps/website/src/server/runtime/composition/app-permission-grants.ts:4  '#src/features/identity/role-manage-permission' -> '@jini-ai/user-management/identity/role-manage-permission'
apps/website/src/features/deployments/deploy-ops/__tests__/secrets.test.ts:11  '../../../identity/site-key-permission.js' -> '@jini-ai/user-management/identity/site-key-permission'
apps/website/src/features/deployments/deploy-ops/tool-registrations.ts:6  '#src/features/identity/site-key-permission' -> '@jini-ai/user-management/identity/site-key-permission'
apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:28  '#src/features/identity/site-key-permission' -> '@jini-ai/user-management/identity/site-key-permission'
apps/website/src/server/runtime/composition/__tests__/permission-grants.test.ts:53  '#src/features/identity/site-key-permission' -> '@jini-ai/user-management/identity/site-key-permission'
apps/website/src/server/runtime/composition/app-permission-grants.ts:5  '#src/features/identity/site-key-permission' -> '@jini-ai/user-management/identity/site-key-permission'
apps/website/src/features/identity/__tests__/user-manage-permission.test.ts:6  '../user-manage-permission.js' -> '@jini-ai/user-management/identity/user-manage-permission'
apps/website/src/server/runtime/composition/app-permission-grants.ts:1  '#src/features/identity/user-manage-permission' -> '@jini-ai/user-management/identity/user-manage-permission'
```

## Tovu tests that must stay green (5; import lines are repointed above, assertions untouched)
- `apps/website/src/features/deployments/deploy-ops/__tests__/secrets.test.ts`
- `apps/website/src/features/identity/__tests__/repo.contract.test.ts`
- `apps/website/src/features/identity/__tests__/user-manage-permission.test.ts`
- `apps/website/src/server/__tests__/admin-mcp-ui-tool-calls-route.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/permission-grants.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/identity/site-key-permission.ts` (3)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/identity/site-key-permission.ts:86: "The admin Security page's Site key tab reads/generates the TOVU_SITE_KEY " +
```

## Named mutation
in the Jini copy of `api-key-service.ts`, negate the first `if (` condition of its first exported function; `api-key-service.test.ts` must go red, then revert
