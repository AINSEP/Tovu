# X-form-destinations-1 — form-destinations → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:11 T:12. Depends on: none (only already-Jini code). Est: J 32 min, T 20 min.

## J — move verbatim into Jini (2 files, 180 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/form-destinations/pull.ts` | `packages/cms/src/forms/destinations/pull.ts` | 127 | W2 |
| `apps/website/src/features/form-destinations/select.ts` | `packages/cms/src/forms/destinations/select.ts` | 53 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./forms/destinations/pull"]
- "@jini-ai/cms" exports["./forms/destinations/select"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 2 sources, rewrite every importer (5 lines)

```
apps/website/src/features/form-destinations/__tests__/pull.unit.test.ts:5  '../pull.js' -> '@jini-ai/cms/forms/destinations/pull'
apps/website/src/features/form-destinations/index.ts:27  './pull.js' -> '@jini-ai/cms/forms/destinations/pull'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/form-destinations/__tests__/select.unit.test.ts:5  '../select.js' -> '@jini-ai/cms/forms/destinations/select'
apps/website/src/features/form-destinations/index.ts:24  './select.js' -> '@jini-ai/cms/forms/destinations/select'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/form-destinations/port.ts:5  './select.js' -> '@jini-ai/cms/forms/destinations/select'
```

## Tovu tests that must stay green (2; import lines are repointed above, assertions untouched)
- `apps/website/src/features/form-destinations/__tests__/pull.unit.test.ts`
- `apps/website/src/features/form-destinations/__tests__/select.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/form-destinations/pull.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `pull.ts`, negate the first `if (` condition of its first exported function; `pull.unit.test.ts` must go red, then revert
