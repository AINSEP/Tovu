# X-comments-1 — comments → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:10 T:11. Depends on: C-contracts-core-2. Est: J 36 min, T 17 min.

## J — move verbatim into Jini (2 files, 104 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/comments/comment-targets.ts` | `packages/cms/src/comments/site/comment-targets.ts` | 28 |  |
| `apps/website/src/features/comments/ip-hash-salt.ts` | `packages/cms/src/comments/site/ip-hash-salt.ts` | 76 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./comments/site/comment-targets"]
- "@jini-ai/cms" exports["./comments/site/ip-hash-salt"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 98 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/comments/__tests__/comment-targets.test.ts`
- `apps/website/src/features/comments/__tests__/ip-hash-salt.test.ts`


## T — Tovu repoint: delete the 2 sources, rewrite every importer (3 lines)

```
apps/website/src/server/runtime/composition/memory-deps/slices/comments.ts:2  '#src/features/comments/comment-targets' -> '@jini-ai/cms/comments/site/comment-targets'
apps/website/src/server/runtime/composition/site-deps/content-resolvers-comments.ts:9  '#src/features/comments/comment-targets' -> '@jini-ai/cms/comments/site/comment-targets'
apps/website/src/features/comments/index.ts:63  './ip-hash-salt.js' -> '@jini-ai/cms/comments/site/ip-hash-salt'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
```

## Tovu tests that must stay green (0; import lines are repointed above, assertions untouched)

## Named mutation
in the Jini copy of `ip-hash-salt.ts`, negate the first `if (` condition of its first exported function; `ip-hash-salt.test.ts` must go red, then revert
