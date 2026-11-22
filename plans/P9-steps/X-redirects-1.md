# X-redirects-1 — redirects → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:12 T:13. Depends on: C-platform-routing-1. Est: J 32 min, T 23 min.

## J — move verbatim into Jini (1 files, 96 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/redirects/phase-handler.ts` | `packages/cms/src/redirects/site/phase-handler.ts` | 96 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./redirects/site/phase-handler"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 135 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/redirects/__tests__/phase-handler.disposer-scope.test.ts`
- `apps/website/src/features/redirects/__tests__/phase-handler.error-isolation.test.ts`


## T — Tovu repoint: delete the 1 sources, rewrite every importer (6 lines)

```
apps/website/src/features/redirects/__tests__/index.test.ts:9  '#src/features/redirects/phase-handler' -> '@jini-ai/cms/redirects/site/phase-handler'
apps/website/src/features/redirects/__tests__/phase-handler.multi-site-lifecycle.test.ts:233  '../phase-handler.js' -> '@jini-ai/cms/redirects/site/phase-handler'
apps/website/src/features/redirects/index.ts:3  './phase-handler.js' -> '@jini-ai/cms/redirects/site/phase-handler'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/redirects/index.ts:4  './phase-handler.js' -> '@jini-ai/cms/redirects/site/phase-handler'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/platform/routing/__tests__/routing.wiring.test.ts:5  '#src/features/redirects/phase-handler' -> '@jini-ai/cms/redirects/site/phase-handler'
apps/website/src/server/runtime/composition/__tests__/app-module-load-registers-no-phase-handler.test.ts:4  '#src/features/redirects/phase-handler' -> '@jini-ai/cms/redirects/site/phase-handler'
```

## Tovu tests that must stay green (4; import lines are repointed above, assertions untouched)
- `apps/website/src/features/redirects/__tests__/index.test.ts`
- `apps/website/src/features/redirects/__tests__/phase-handler.multi-site-lifecycle.test.ts`
- `apps/website/src/platform/routing/__tests__/routing.wiring.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/app-module-load-registers-no-phase-handler.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/redirects/phase-handler.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `phase-handler.ts`, negate the first `if (` condition of its first exported function; `phase-handler.disposer-scope.test.ts` must go red, then revert
