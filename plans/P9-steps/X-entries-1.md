# X-entries-1 — entries → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:9 T:11. Depends on: C-contracts-core-4. Est: J 34 min, T 21 min.

## J — move verbatim into Jini (3 files, 92 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/entries/contracts.ts` | `packages/cms/src/entries/site/contracts.ts` | 20 |  |
| `apps/website/src/features/entries/render-entry.ts` | `packages/cms/src/entries/site/render-entry.ts` | 3 |  |
| `apps/website/src/features/entries/tool-registrations.ts` | `packages/cms/src/entries/site/tool-registrations.ts` | 69 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./entries/site/contracts"]
- "@jini-ai/cms" exports["./entries/site/render-entry"]
- "@jini-ai/cms" exports["./entries/site/tool-registrations"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 3 sources, rewrite every importer (8 lines)

```
apps/website/src/features/entries/public-list.ts:5  './contracts.js' -> '@jini-ai/cms/entries/site/contracts'
apps/website/src/features/entries/public-list.ts:6  './contracts.js' -> '@jini-ai/cms/entries/site/contracts'
apps/website/src/features/entries/public-list.ts:7  './contracts.js' -> '@jini-ai/cms/entries/site/contracts'
apps/website/src/features/entries/public-list.ts:8  './contracts.js' -> '@jini-ai/cms/entries/site/contracts'
apps/website/src/server/inbound/public-http/http/site/render/widgets/social-entries.ts:9  '#src/features/entries/render-entry' -> '@jini-ai/cms/entries/site/render-entry'
apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts:16  '../../features/entries/tool-registrations.js' -> '@jini-ai/cms/entries/site/tool-registrations'
apps/website/src/assistant/tool-registrations.ts:52  '../features/entries/tool-registrations.js' -> '@jini-ai/cms/entries/site/tool-registrations'
apps/website/src/server/runtime/composition/tool-catalog-manifest.ts:85  '#src/features/entries/tool-registrations' -> '@jini-ai/cms/entries/site/tool-registrations'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/entries/tool-registrations.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `tool-registrations.ts`, negate the first `if (` condition of its first exported function; `tool-registrations.entries.test.ts` must go red, then revert
