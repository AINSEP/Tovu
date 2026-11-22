# X-skills-1 — skills → @jini-ai/agentic (Jini step J then Tovu step T)

Lane X. Batch J:20 T:21. Depends on: none (only already-Jini code). Est: J 42 min, T 19 min.

## J — move verbatim into Jini (3 files, 35 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/skills/install-adapters.ts` | `packages/agentic/src/skills/site/install-adapters.ts` | 8 |  |
| `apps/website/src/features/skills/live-registration.ts` | `packages/agentic/src/skills/site/live-registration.ts` | 19 |  |
| `apps/website/src/features/skills/state.ts` | `packages/agentic/src/skills/site/state.ts` | 8 | W1 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/agentic" exports["./skills/site/install-adapters"]
- "@jini-ai/agentic" exports["./skills/site/live-registration"]
- "@jini-ai/agentic" exports["./skills/site/state"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (4, 338 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/skills/__tests__/unit/archive.unit.test.ts`
- `apps/website/src/features/skills/__tests__/unit/validation.unit.test.ts`
- `apps/website/src/features/skills/__tests__/unit/jini-adapters.hwa.test.ts`
- `apps/website/src/features/skills/__tests__/unit/state.unit.test.ts`


## T — Tovu repoint: delete the 3 sources, rewrite every importer (5 lines)

```
apps/website/src/features/skills/install-service.ts:7  './install-adapters.js' -> '@jini-ai/agentic/skills/site/install-adapters'
apps/website/src/features/skills/__tests__/unit/hot-paths.unit.test.ts:13  '../../live-registration.js' -> '@jini-ai/agentic/skills/site/live-registration'
apps/website/src/features/skills/tool-registrations.ts:10  './live-registration.js' -> '@jini-ai/agentic/skills/site/live-registration'
apps/website/src/features/skills/install-service.ts:6  './state.js' -> '@jini-ai/agentic/skills/site/state'
apps/website/src/features/skills/tool-registrations.ts:11  './state.js' -> '@jini-ai/agentic/skills/site/state'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/website/src/features/skills/__tests__/unit/hot-paths.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/skills/state.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/skills/state.ts:5: export const SKILL_STATE_FILE = ".tovu-install.json";
```

## Named mutation
in the Jini copy of `live-registration.ts`, negate the first `if (` condition of its first exported function; `jini-adapters.hwa.test.ts` must go red, then revert
