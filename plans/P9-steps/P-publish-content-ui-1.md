# P-publish-content-ui-1 — publish-content-ui → @jini-ai/admin (Jini step J then Tovu step T)

Lane P. Batch J:1 T:2. Depends on: none (only already-Jini code). Est: J 29 min, T 20 min.

## J — move verbatim into Jini (1 files, 104 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/publish-content/ui/sections.ts` | `packages/admin/src/publish-content/sections.ts` | 104 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./publish-content/sections"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 1 sources, rewrite every importer (5 lines)

```
apps/website/src/features/publish-content/ui/__tests__/index.test.ts:15  '../sections.js' -> '@jini-ai/admin/publish-content/sections'
apps/website/src/features/publish-content/ui/__tests__/sections.test.ts:22  '../sections.js' -> '@jini-ai/admin/publish-content/sections'
apps/website/src/features/publish-content/ui/index.ts:58  './sections.js' -> '@jini-ai/admin/publish-content/sections'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/publish-content/ui/index.ts:65  './sections.js' -> '@jini-ai/admin/publish-content/sections'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/publish-content/ui/report-rows.ts:2  './sections.js' -> '@jini-ai/admin/publish-content/sections'
```

## Tovu tests that must stay green (2; import lines are repointed above, assertions untouched)
- `apps/website/src/features/publish-content/ui/__tests__/index.test.ts`
- `apps/website/src/features/publish-content/ui/__tests__/sections.test.ts`

## Named mutation
in the Jini copy of `sections.ts`, negate the first `if (` condition of its first exported function; `index.test.ts` must go red, then revert
