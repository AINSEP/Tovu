# A-adm-users-1 — adm-users → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:23 T:24. Depends on: none (only already-Jini code). Est: J 30 min, T 28 min.

## J — move verbatim into Jini (1 files, 16 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/users/api/users-api.types.ts` | `packages/admin/src/users/api/users-api.types.ts` | 16 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./users/api/users-api.types"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 103 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/users/__tests__/use-reset-password-fields.unit.test.tsx`


## T — Tovu repoint: delete the 1 sources, rewrite every importer (10 lines)

```
apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx:4  '@/features/users/api/users-api.types' -> '@jini-ai/admin/users/api/users-api.types'
apps/admin/src/features/trash/hooks/trash-dependencies.hooks.ts:1  '@/features/users/api/users-api.types' -> '@jini-ai/admin/users/api/users-api.types'
apps/admin/src/features/trash/hooks/trash-port.hooks.ts:1  '@/features/users/api/users-api.types' -> '@jini-ai/admin/users/api/users-api.types'
apps/admin/src/features/users/__tests__/account-protections.unit.test.tsx:7  '@/features/users/api/users-api.types' -> '@jini-ai/admin/users/api/users-api.types'
apps/admin/src/features/users/__tests__/rules.unit.test.ts:3  '@/features/users/api/users-api.types' -> '@jini-ai/admin/users/api/users-api.types'
apps/admin/src/features/users/__tests__/use-users.unit.test.tsx:4  '@/features/users/api/users-api.types' -> '@jini-ai/admin/users/api/users-api.types'
apps/admin/src/features/users/__tests__/users-agent-drive.unit.test.tsx:12  '@/features/users/api/users-api.types' -> '@jini-ai/admin/users/api/users-api.types'
apps/admin/src/features/users/api/users-api.ts:3  './users-api.types' -> '@jini-ai/admin/users/api/users-api.types'
apps/admin/src/lib/__tests__/api-users.test-d.ts:2  '../../features/users/api/users-api.types' -> '@jini-ai/admin/users/api/users-api.types'
apps/admin/src/lib/__tests__/api-users.unit.test.ts:3  '../../features/users/api/users-api.types' -> '@jini-ai/admin/users/api/users-api.types'
```

## Tovu tests that must stay green (7; import lines are repointed above, assertions untouched)
- `apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx`
- `apps/admin/src/features/users/__tests__/account-protections.unit.test.tsx`
- `apps/admin/src/features/users/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/users/__tests__/use-users.unit.test.tsx`
- `apps/admin/src/features/users/__tests__/users-agent-drive.unit.test.tsx`
- `apps/admin/src/lib/__tests__/api-users.test-d.ts`
- `apps/admin/src/lib/__tests__/api-users.unit.test.ts`

## Named mutation
in the Jini copy of `users-api.types.ts`, negate the first `if (` condition of its first exported function; `use-reset-password-fields.unit.test.tsx` must go red, then revert
