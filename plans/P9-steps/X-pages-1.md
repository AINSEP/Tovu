# X-pages-1 — pages → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:13 T:14. Depends on: none (only already-Jini code). Est: J 32 min, T 18 min.

## J — move verbatim into Jini (2 files, 163 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/pages/authoring-html.ts` | `packages/cms/src/pages/authoring-html.ts` | 34 |  |
| `apps/website/src/features/pages/hidden-until-script.ts` | `packages/cms/src/pages/hidden-until-script.ts` | 129 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./pages/authoring-html"]
- "@jini-ai/cms" exports["./pages/hidden-until-script"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 2 sources, rewrite every importer (3 lines)

```
apps/website/src/features/pages/tool-registrations.ts:20  './authoring-html.js' -> '@jini-ai/cms/pages/authoring-html'
apps/website/src/features/pages/__tests__/hidden-until-script.test.ts:7  '../hidden-until-script.js' -> '@jini-ai/cms/pages/hidden-until-script'
apps/website/src/features/pages/tool-registrations.ts:19  './hidden-until-script.js' -> '@jini-ai/cms/pages/hidden-until-script'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/website/src/features/pages/__tests__/hidden-until-script.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/pages/hidden-until-script.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `hidden-until-script.ts`, negate the first `if (` condition of its first exported function; `hidden-until-script.test.ts` must go red, then revert
