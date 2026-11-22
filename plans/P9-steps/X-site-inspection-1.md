# X-site-inspection-1 — site-inspection → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:18 T:19. Depends on: C-contracts-core-2. Est: J 49 min, T 32 min.

## J — move verbatim into Jini (4 files, 1269 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/site-inspection/page-body.ts` | `packages/cms/src/site-inspection/page-body.ts` | 115 |  |
| `apps/website/src/features/site-inspection/section-collector.ts` | `packages/cms/src/site-inspection/section-collector.ts` | 178 |  |
| `apps/website/src/features/site-inspection/site-capabilities.ts` | `packages/cms/src/site-inspection/site-capabilities.ts` | 317 |  |
| `apps/website/src/features/site-inspection/site-profile.ts` | `packages/cms/src/site-inspection/site-profile.ts` | 659 | W2 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./site-inspection/page-body"]
- "@jini-ai/cms" exports["./site-inspection/section-collector"]
- "@jini-ai/cms" exports["./site-inspection/site-capabilities"]
- "@jini-ai/cms" exports["./site-inspection/site-profile"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (3, 624 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/site-inspection/__tests__/page-body.T4-07-characterization.unit.test.ts`
- `apps/website/src/features/site-inspection/__tests__/section-collector.unit.test.ts`
- `apps/website/src/features/site-inspection/__tests__/site-profile.unit.test.ts`


## T — Tovu repoint: delete the 4 sources, rewrite every importer (21 lines)

```
apps/website/src/features/post/preview-tool.ts:8  '#src/features/site-inspection/page-body' -> '@jini-ai/cms/site-inspection/page-body'
apps/website/src/features/site-inspection/__tests__/L131-characterization.unit.test.ts:11  '../page-body.js' -> '@jini-ai/cms/site-inspection/page-body'
apps/website/src/features/site-inspection/__tests__/page-body.test.ts:5  '../page-body.js' -> '@jini-ai/cms/site-inspection/page-body'
apps/website/src/features/site-inspection/live-url.ts:9  './page-body.js' -> '@jini-ai/cms/site-inspection/page-body'
apps/website/src/features/site-inspection/published-page.ts:1  './page-body.js' -> '@jini-ai/cms/site-inspection/page-body'
apps/website/src/features/site-inspection/published-page.ts:59  './page-body.js' -> '@jini-ai/cms/site-inspection/page-body'
apps/website/src/features/site-inspection/tool-registrations.ts:5  './page-body.js' -> '@jini-ai/cms/site-inspection/page-body'
apps/website/src/features/web/tool-registrations.ts:9  '../site-inspection/page-body.js' -> '@jini-ai/cms/site-inspection/page-body'
apps/website/src/features/site-inspection/index.ts:58  './section-collector.js' -> '@jini-ai/cms/site-inspection/section-collector'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/site-inspection/__tests__/site-capabilities.unit.test.ts:12  '../site-capabilities.js' -> '@jini-ai/cms/site-inspection/site-capabilities'
apps/website/src/features/site-inspection/__tests__/tool-registrations.unit.test.ts:19  '../site-capabilities.js' -> '@jini-ai/cms/site-inspection/site-capabilities'
apps/website/src/features/site-inspection/agent-tools.ts:2  './site-capabilities.js' -> '@jini-ai/cms/site-inspection/site-capabilities'
apps/website/src/features/site-inspection/deps.ts:10  './site-capabilities.js' -> '@jini-ai/cms/site-inspection/site-capabilities'
apps/website/src/features/site-inspection/index.ts:56  './site-capabilities.js' -> '@jini-ai/cms/site-inspection/site-capabilities'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/site-inspection/tool-registrations.ts:16  './site-capabilities.js' -> '@jini-ai/cms/site-inspection/site-capabilities'
apps/website/src/features/site-inspection/__tests__/tool-registrations.unit.test.ts:20  '../site-profile.js' -> '@jini-ai/cms/site-inspection/site-profile'
apps/website/src/features/site-inspection/agent-tools.ts:3  './site-profile.js' -> '@jini-ai/cms/site-inspection/site-profile'
apps/website/src/features/site-inspection/agent-tools.ts:6  './site-profile.js' -> '@jini-ai/cms/site-inspection/site-profile'
apps/website/src/features/site-inspection/deps.ts:19  './site-profile.js' -> '@jini-ai/cms/site-inspection/site-profile'
apps/website/src/features/site-inspection/index.ts:37  './site-profile.js' -> '@jini-ai/cms/site-inspection/site-profile'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/site-inspection/tool-registrations.ts:17  './site-profile.js' -> '@jini-ai/cms/site-inspection/site-profile'
```

## Tovu tests that must stay green (4; import lines are repointed above, assertions untouched)
- `apps/website/src/features/site-inspection/__tests__/L131-characterization.unit.test.ts`
- `apps/website/src/features/site-inspection/__tests__/page-body.test.ts`
- `apps/website/src/features/site-inspection/__tests__/site-capabilities.unit.test.ts`
- `apps/website/src/features/site-inspection/__tests__/tool-registrations.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/site-inspection/site-profile.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/site-inspection/site-capabilities.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/website/src/features/site-inspection/site-profile.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `site-profile.ts`, negate the first `if (` condition of its first exported function; `site-profile.unit.test.ts` must go red, then revert
