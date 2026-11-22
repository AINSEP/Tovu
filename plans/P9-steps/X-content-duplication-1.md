# X-content-duplication-1 — content-duplication → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:16 T:19. Depends on: none (only already-Jini code). Est: J 34 min, T 20 min.

## J — move verbatim into Jini (2 files, 241 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/content-duplication/agent-tools.ts` | `packages/cms/src/content-duplication/agent-tools.ts` | 105 |  |
| `apps/website/src/features/content-duplication/derive-available-name.ts` | `packages/cms/src/content-duplication/derive-available-name.ts` | 136 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./content-duplication/agent-tools"]
- "@jini-ai/cms" exports["./content-duplication/derive-available-name"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 119 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/content-duplication/__tests__/derive-available-name.test.ts`


## T — Tovu repoint: delete the 2 sources, rewrite every importer (6 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:37  '../../features/content-duplication/agent-tools.js' -> '@jini-ai/cms/content-duplication/agent-tools'
apps/website/src/features/content-duplication/tool-registrations.ts:52  './agent-tools.js' -> '@jini-ai/cms/content-duplication/agent-tools'
apps/website/src/features/forms/index.ts:63  '../content-duplication/derive-available-name.js' -> '@jini-ai/cms/content-duplication/derive-available-name'
apps/website/src/features/forms/tool-registrations.ts:29  '../content-duplication/derive-available-name.js' -> '@jini-ai/cms/content-duplication/derive-available-name'
apps/website/src/features/media/duplicate-asset.ts:14  '../content-duplication/derive-available-name.js' -> '@jini-ai/cms/content-duplication/derive-available-name'
apps/website/src/features/post/post-tool-duplicate.ts:12  '../content-duplication/derive-available-name.js' -> '@jini-ai/cms/content-duplication/derive-available-name'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/content-duplication/derive-available-name.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `derive-available-name.ts`, negate the first `if (` condition of its first exported function; `derive-available-name.test.ts` must go red, then revert
