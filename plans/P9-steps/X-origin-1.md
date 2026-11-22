# X-origin-1 — origin → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:17 T:18. Depends on: C-contracts-core-2. Est: J 33 min, T 17 min.

## J — move verbatim into Jini (2 files, 92 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/origin/configured-origin.ts` | `packages/cms/src/origin/configured-origin.ts` | 83 | W7 |
| `apps/website/src/features/origin/index.ts` | `packages/cms/src/origin/index.ts` | 9 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./origin"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 312 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/origin/__tests__/configured-origin.test.ts`


## T — Tovu repoint: delete the 2 sources, rewrite every importer (2 lines)

```
apps/website/src/features/seo/__tests__/sitemap.test.ts:8  '../../origin/index.js' -> '@jini-ai/cms/origin'
apps/website/src/server/runtime/composition/site-deps/events-origin.ts:10  '#src/features/origin/index' -> '@jini-ai/cms/origin'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/website/src/features/seo/__tests__/sitemap.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/origin/configured-origin.ts` (7)
- `apps/website/src/features/origin/index.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/origin/configured-origin.ts:32: "No public origin is configured for this production deployment: TOVU_PUBLIC_URL is unset or was " +
apps/website/src/features/origin/configured-origin.ts:35: "unavailable until TOVU_PUBLIC_URL names this deployment's origin.";
apps/website/src/features/origin/configured-origin.ts:54: envVarName: "TOVU_PUBLIC_URL",
apps/website/src/features/origin/configured-origin.ts:76: envVarName: "TOVU_PUBLIC_URL",
```

## Named mutation
in the Jini copy of `configured-origin.ts`, negate the first `if (` condition of its first exported function; `configured-origin.test.ts` must go red, then revert
