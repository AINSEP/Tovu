# A-adm-recovery-1 — adm-recovery → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:30 T:31. Depends on: A-adm-other-1, A-adm-other-3, A-adm-shell-lib-3. Est: J 40 min, T 29 min.

## J — move verbatim into Jini (4 files, 145 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/recovery/api/recovery-api.types.ts` | `packages/admin/src/recovery/api/recovery-api.types.ts` | 69 |  |
| `apps/admin/src/features/recovery/hooks/recovery-port.hooks.ts` | `packages/admin/src/recovery/hooks/recovery-port.hooks.ts` | 17 |  |
| `apps/admin/src/features/recovery/hooks/restore-flow-port.hooks.ts` | `packages/admin/src/recovery/hooks/restore-flow-port.hooks.ts` | 15 |  |
| `apps/admin/src/features/recovery/hooks/use-recovery-navigation.hooks.ts` | `packages/admin/src/recovery/hooks/use-recovery-navigation.hooks.ts` | 44 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./recovery/api/recovery-api.types"]
- "@jini-ai/admin" exports["./recovery/hooks/recovery-port.hooks"]
- "@jini-ai/admin" exports["./recovery/hooks/restore-flow-port.hooks"]
- "@jini-ai/admin" exports["./recovery/hooks/use-recovery-navigation.hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 57 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/recovery/__tests__/use-recovery-navigation.unit.test.ts`


## T — Tovu repoint: delete the 4 sources, rewrite every importer (16 lines)

```
apps/admin/src/features/recovery/Recovery.tsx:7  './api/recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/__tests__/Recovery.unit.test.tsx:9  '@/features/recovery/api/recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/__tests__/rules.unit.test.ts:4  '@/features/recovery/api/recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/__tests__/use-recovery.unit.test.ts:4  '@/features/recovery/api/recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/__tests__/use-restore-flow.unit.test.ts:4  '@/features/recovery/api/recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/api/recovery-api.ts:3  './recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/hooks/recovery-dependencies.hooks.ts:1  '@/features/recovery/api/recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/hooks/restore-flow-dependencies.hooks.ts:2  '@/features/recovery/api/recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/hooks/use-recovery.hooks.ts:6  '@/features/recovery/api/recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/hooks/use-restore-flow.hooks.ts:3  '@/features/recovery/api/recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/rules.ts:1  './api/recovery-api.types' -> '@jini-ai/admin/recovery/api/recovery-api.types'
apps/admin/src/features/recovery/hooks/recovery-dependencies.hooks.ts:5  './recovery-port.hooks' -> '@jini-ai/admin/recovery/hooks/recovery-port.hooks'
apps/admin/src/features/recovery/hooks/use-recovery.hooks.ts:15  './recovery-port.hooks' -> '@jini-ai/admin/recovery/hooks/recovery-port.hooks'
apps/admin/src/features/recovery/hooks/restore-flow-dependencies.hooks.ts:4  './restore-flow-port.hooks' -> '@jini-ai/admin/recovery/hooks/restore-flow-port.hooks'
apps/admin/src/features/recovery/hooks/use-restore-flow.hooks.ts:9  './restore-flow-port.hooks' -> '@jini-ai/admin/recovery/hooks/restore-flow-port.hooks'
apps/admin/src/features/recovery/Recovery.tsx:16  './hooks/use-recovery-navigation.hooks' -> '@jini-ai/admin/recovery/hooks/use-recovery-navigation.hooks'
```

## Tovu tests that must stay green (4; import lines are repointed above, assertions untouched)
- `apps/admin/src/features/recovery/__tests__/Recovery.unit.test.tsx`
- `apps/admin/src/features/recovery/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/recovery/__tests__/use-recovery.unit.test.ts`
- `apps/admin/src/features/recovery/__tests__/use-restore-flow.unit.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/features/recovery/hooks/recovery-port.hooks.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/features/recovery/hooks/restore-flow-port.hooks.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `recovery-api.types.ts`, negate the first `if (` condition of its first exported function; `use-recovery-navigation.unit.test.ts` must go red, then revert
