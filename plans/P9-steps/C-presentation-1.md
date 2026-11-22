# C-presentation-1 — presentation → @jini-ai/cms (Jini step J then Tovu step T)

Lane C. Batch J:1 T:2. Depends on: none (only already-Jini code). Est: J 30 min, T 17 min.

## J — move verbatim into Jini (1 files, 59 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/presentation/active-theme-id.ts` | `packages/cms/src/presentation/site/active-theme-id.ts` | 59 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./presentation/site/active-theme-id"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 59 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/presentation/__tests__/active-theme-id.unit.test.ts`


## T — Tovu repoint: delete the 1 sources, rewrite every importer (4 lines)

```
apps/website/src/features/presentation/index.ts:25  './active-theme-id.js' -> '@jini-ai/cms/presentation/site/active-theme-id'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/site-inspection/deps.ts:1  '#src/features/presentation/active-theme-id' -> '@jini-ai/cms/presentation/site/active-theme-id'
apps/website/src/server/inbound/public-http/middleware/render-theme-override.ts:3  '#src/features/presentation/active-theme-id' -> '@jini-ai/cms/presentation/site/active-theme-id'
apps/website/src/server/inbound/public-http/middleware/theme-preview-switcher.ts:4  '#src/features/presentation/active-theme-id' -> '@jini-ai/cms/presentation/site/active-theme-id'
```

## Tovu tests that must stay green (0; import lines are repointed above, assertions untouched)

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/presentation/active-theme-id.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `active-theme-id.ts`, negate the first `if (` condition of its first exported function; `active-theme-id.unit.test.ts` must go red, then revert
