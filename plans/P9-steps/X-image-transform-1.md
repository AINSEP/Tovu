# X-image-transform-1 — image-transform → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:7 T:8. Depends on: none (only already-Jini code). Est: J 31 min, T 16 min.

## J — move verbatim into Jini (1 files, 171 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/image-transform/image-ops.ts` | `packages/cms/src/media/site-transform/image-ops.ts` | 171 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./media/site-transform/image-ops"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 158 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/image-transform/__tests__/image-ops.test.ts`


## T — Tovu repoint: delete the 1 sources, rewrite every importer (1 lines)

```
apps/website/src/features/image-transform/tool.ts:14  './image-ops.js' -> '@jini-ai/cms/media/site-transform/image-ops'
```

## Tovu tests that must stay green (0; import lines are repointed above, assertions untouched)

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/image-transform/image-ops.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `image-ops.ts`, negate the first `if (` condition of its first exported function; `image-ops.test.ts` must go red, then revert
