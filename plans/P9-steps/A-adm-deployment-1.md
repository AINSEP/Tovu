# A-adm-deployment-1 — adm-deployment → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:29 T:30. Depends on: A-adm-shell-lib-3, A-adm-other-2. Est: J 31 min, T 17 min.

## J — move verbatim into Jini (2 files, 24 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/deployment/Deployment.hooks.ts` | `packages/admin/src/deployment/Deployment.hooks.ts` | 7 |  |
| `apps/admin/src/features/deployment/hooks/static-export-port.hooks.ts` | `packages/admin/src/deployment/hooks/static-export-port.hooks.ts` | 17 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./deployment/Deployment.hooks"]
- "@jini-ai/admin" exports["./deployment/hooks/static-export-port.hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 2 sources, rewrite every importer (3 lines)

```
apps/admin/src/features/deployment/Deployment.tsx:1  './Deployment.hooks' -> '@jini-ai/admin/deployment/Deployment.hooks'
apps/admin/src/features/deployment/hooks/static-export-dependencies.hooks.ts:3  './static-export-port.hooks' -> '@jini-ai/admin/deployment/hooks/static-export-port.hooks'
apps/admin/src/features/deployment/hooks/use-static-export.hooks.ts:12  './static-export-port.hooks' -> '@jini-ai/admin/deployment/hooks/static-export-port.hooks'
```

## Tovu tests that must stay green (0; import lines are repointed above, assertions untouched)

## Named mutation
in the Jini copy of `static-export-port.hooks.ts`, negate the first `if (` condition of its first exported function; a NEW characterization test (write it first, tests-first rule) must go red, then revert
