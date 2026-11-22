# A-adm-members-1 — adm-members → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:25 T:26. Depends on: none (only already-Jini code). Est: J 28 min, T 20 min.

## J — move verbatim into Jini (1 files, 12 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/members/api/members-api.types.ts` | `packages/admin/src/members/api/members-api.types.ts` | 12 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./members/api/members-api.types"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 1 sources, rewrite every importer (4 lines)

```
apps/admin/src/features/members/__tests__/members-dependencies.unit.test.ts:3  '@/features/members/api/members-api.types' -> '@jini-ai/admin/members/api/members-api.types'
apps/admin/src/features/members/__tests__/rules.unit.test.ts:3  '@/features/members/api/members-api.types' -> '@jini-ai/admin/members/api/members-api.types'
apps/admin/src/features/members/__tests__/use-members.hooks.unit.test.ts:4  '@/features/members/api/members-api.types' -> '@jini-ai/admin/members/api/members-api.types'
apps/admin/src/features/members/api/members-api.ts:3  './members-api.types' -> '@jini-ai/admin/members/api/members-api.types'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/admin/src/features/members/__tests__/members-dependencies.unit.test.ts`
- `apps/admin/src/features/members/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/members/__tests__/use-members.hooks.unit.test.ts`

## Named mutation
in the Jini copy of `members-api.types.ts`, negate the first `if (` condition of its first exported function; `members-dependencies.unit.test.ts` must go red, then revert
