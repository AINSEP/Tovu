# A-adm-source-control-1 — adm-source-control → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:30 T:31. Depends on: A-adm-shell-lib-3. Est: J 28 min, T 16 min.

## J — move verbatim into Jini (1 files, 7 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/source-control/SourceControl.hooks.ts` | `packages/admin/src/source-control/host/SourceControl.hooks.ts` | 7 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./source-control/host/SourceControl.hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 1 sources, rewrite every importer (1 lines)

```
apps/admin/src/features/source-control/SourceControl.tsx:1  './SourceControl.hooks' -> '@jini-ai/admin/source-control/host/SourceControl.hooks'
```

## Tovu tests that must stay green (0; import lines are repointed above, assertions untouched)

## Named mutation
in the Jini copy of `SourceControl.hooks.ts`, negate the first `if (` condition of its first exported function; a NEW characterization test (write it first, tests-first rule) must go red, then revert
