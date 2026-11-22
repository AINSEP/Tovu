# X-site-search-1 — site-search → @jini-ai/search (Jini step J then Tovu step T)

Lane X. Batch J:9 T:11. Depends on: none (only already-Jini code). Est: J 28 min, T 19 min.

## J — move verbatim into Jini (1 files, 85 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/site-search/settings.ts` | `packages/search/src/site/settings.ts` | 85 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/search" exports["./site/settings"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 1 sources, rewrite every importer (4 lines)

```
apps/website/src/features/site-search/__tests__/settings.test.ts:10  '../settings.js' -> '@jini-ai/search/site/settings'
apps/website/src/server/runtime/composition/modules/__tests__/site-search.unit.test.ts:15  '#src/features/site-search/settings' -> '@jini-ai/search/site/settings'
apps/website/src/server/runtime/composition/modules/site-search.ts:19  '#src/features/site-search/settings' -> '@jini-ai/search/site/settings'
apps/website/src/server/runtime/composition/site-deps/identity-settings.ts:31  '#src/features/site-search/settings' -> '@jini-ai/search/site/settings'
```

## Tovu tests that must stay green (2; import lines are repointed above, assertions untouched)
- `apps/website/src/features/site-search/__tests__/settings.test.ts`
- `apps/website/src/server/runtime/composition/modules/__tests__/site-search.unit.test.ts`

## Named mutation
in the Jini copy of `settings.ts`, negate the first `if (` condition of its first exported function; `settings.test.ts` must go red, then revert
