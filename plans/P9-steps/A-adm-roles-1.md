# A-adm-roles-1 — adm-roles → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:23 T:24. Depends on: none (only already-Jini code). Est: J 28 min, T 26 min.

## J — move verbatim into Jini (1 files, 29 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/roles/api/roles-api.types.ts` | `packages/admin/src/roles/api/roles-api.types.ts` | 29 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./roles/api/roles-api.types"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 1 sources, rewrite every importer (13 lines)

```
apps/admin/src/features/roles/PoliciesSection.tsx:3  './api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/PolicyRow.tsx:3  './api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/RoleConfirmDialogs.tsx:3  './api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/Roles.tsx:1  './api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/RolesSection.tsx:4  './api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx:5  '@/features/roles/api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/__tests__/rules.unit.test.ts:3  '@/features/roles/api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/__tests__/use-roles.unit.test.tsx:5  '@/features/roles/api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/api/roles-api.ts:3  './roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/hooks/roles-row-actions.ts:2  '@/features/roles/api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/hooks/use-roles-state.hooks.ts:2  '@/features/roles/api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/hooks/use-roles.hooks.ts:1  '@/features/roles/api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
apps/admin/src/features/roles/rules.ts:3  './api/roles-api.types' -> '@jini-ai/admin/roles/api/roles-api.types'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx`
- `apps/admin/src/features/roles/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/roles/__tests__/use-roles.unit.test.tsx`

## Named mutation
in the Jini copy of `roles-api.types.ts`, negate the first `if (` condition of its first exported function; `Roles.unit.test.tsx` must go red, then revert
