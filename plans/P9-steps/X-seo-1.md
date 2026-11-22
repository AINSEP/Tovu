# X-seo-1 — seo → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:13 T:14. Depends on: none (only already-Jini code). Est: J 28 min, T 18 min.

## J — move verbatim into Jini (1 files, 44 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/seo/page-head-contributor.ts` | `packages/cms/src/seo/site/page-head-contributor.ts` | 44 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./seo/site/page-head-contributor"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 1 sources, rewrite every importer (3 lines)

```
apps/website/src/features/seo/__tests__/cover-image-head.test.ts:9  '../page-head-contributor.js' -> '@jini-ai/cms/seo/site/page-head-contributor'
apps/website/src/features/seo/index.ts:26  './page-head-contributor.js' -> '@jini-ai/cms/seo/site/page-head-contributor'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/server/inbound/public-http/routes/site/pages/extra-head.ts:1  '#src/features/seo/page-head-contributor' -> '@jini-ai/cms/seo/site/page-head-contributor'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/website/src/features/seo/__tests__/cover-image-head.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/seo/page-head-contributor.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `page-head-contributor.ts`, negate the first `if (` condition of its first exported function; `cover-image-head.test.ts` must go red, then revert
