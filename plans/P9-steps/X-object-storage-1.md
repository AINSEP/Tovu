# X-object-storage-1 — object-storage → @jini-ai/platform (Jini step J then Tovu step T)

Lane X. Batch J:17 T:18. Depends on: none (only already-Jini code). Est: J 30 min, T 19 min.

## J — move verbatim into Jini (1 files, 37 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/object-storage/setting.ts` | `packages/platform/src/object-store/site/setting.ts` | 37 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/platform" exports["./object-store/site/setting"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 97 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/object-storage/__tests__/setting.unit.test.ts`


## T — Tovu repoint: delete the 1 sources, rewrite every importer (3 lines)

```
apps/website/src/features/object-storage/__tests__/index.unit.test.ts:8  '../setting.js' -> '@jini-ai/platform/object-store/site/setting'
apps/website/src/features/object-storage/index.ts:3  './setting.js' -> '@jini-ai/platform/object-store/site/setting'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/server/runtime/composition/__tests__/site-backup-wiring.integration.test.ts:26  '#src/features/object-storage/setting' -> '@jini-ai/platform/object-store/site/setting'
```

## Tovu tests that must stay green (2; import lines are repointed above, assertions untouched)
- `apps/website/src/features/object-storage/__tests__/index.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/site-backup-wiring.integration.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/object-storage/setting.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `setting.ts`, negate the first `if (` condition of its first exported function; `setting.unit.test.ts` must go red, then revert
