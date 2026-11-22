# T-newsletter-1 — newsletter → @jini-ai/user-management (Jini step J then Tovu step T)

Lane T. Batch J:5 T:8. Depends on: C-contracts-core-3. Est: J 35 min, T 32 min.

## J — move verbatim into Jini (2 files, 364 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/newsletter/errors.ts` | `packages/user-management/src/newsletter/errors.ts` | 115 |  |
| `apps/website/src/contracts/core/tool-metadata/newsletter.ts` | `packages/user-management/src/newsletter/tool-metadata.ts` | 249 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/user-management" exports["./newsletter/errors"]
- "@jini-ai/user-management" exports["./newsletter/tool-metadata"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 112 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/newsletter/__tests__/errors.test.ts`


## T — Tovu repoint: delete the 2 sources, rewrite every importer (18 lines)

```
apps/website/src/features/newsletter/__tests__/campaign-write-service.test.ts:13  '../errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/__tests__/confirmation.test.ts:9  '../errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/__tests__/lists.test.ts:8  '../errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/__tests__/send-pipeline.test.ts:34  '../errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/__tests__/subscriptions.test.ts:13  '../errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/__tests__/unsubscribe.test.ts:9  '../errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/campaign-write-service.ts:20  './errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/confirmation.ts:15  './errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/delivery/tool-registrations.ts:20  '../errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/index.ts:28  './errors.js' -> '@jini-ai/user-management/newsletter/errors'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/newsletter/lists.ts:13  './errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/send-pipeline.ts:25  './errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/subscriptions.ts:16  './errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/tool-registrations.ts:50  './errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/features/newsletter/unsubscribe.ts:19  './errors.js' -> '@jini-ai/user-management/newsletter/errors'
apps/website/src/contracts/core/tool-metadata/index.ts:34  './newsletter.js' -> '@jini-ai/user-management/newsletter/tool-metadata'
apps/website/src/features/newsletter/delivery/tool-registrations.ts:1  '../../../contracts/core/tool-metadata/newsletter.js' -> '@jini-ai/user-management/newsletter/tool-metadata'
apps/website/src/features/newsletter/tool-registrations.ts:2  '../../contracts/core/tool-metadata/newsletter.js' -> '@jini-ai/user-management/newsletter/tool-metadata'
```

## Tovu tests that must stay green (6; import lines are repointed above, assertions untouched)
- `apps/website/src/features/newsletter/__tests__/campaign-write-service.test.ts`
- `apps/website/src/features/newsletter/__tests__/confirmation.test.ts`
- `apps/website/src/features/newsletter/__tests__/lists.test.ts`
- `apps/website/src/features/newsletter/__tests__/send-pipeline.test.ts`
- `apps/website/src/features/newsletter/__tests__/subscriptions.test.ts`
- `apps/website/src/features/newsletter/__tests__/unsubscribe.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/newsletter/errors.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `newsletter.ts`, negate the first `if (` condition of its first exported function; `errors.test.ts` must go red, then revert
