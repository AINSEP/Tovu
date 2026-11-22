# X-taxonomy-1 — taxonomy → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:8 T:10. Depends on: C-contracts-core-3, C-contracts-core-7. Est: J 37 min, T 23 min.

## J — move verbatim into Jini (3 files, 167 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/taxonomy/agent-tools.ts` | `packages/cms/src/taxonomy/site/agent-tools.ts` | 40 |  |
| `apps/website/src/features/taxonomy/content-targets.ts` | `packages/cms/src/taxonomy/site/content-targets.ts` | 65 |  |
| `apps/website/src/features/taxonomy/gated-hooks.ts` | `packages/cms/src/taxonomy/site/gated-hooks.ts` | 62 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./taxonomy/site/agent-tools"]
- "@jini-ai/cms" exports["./taxonomy/site/content-targets"]
- "@jini-ai/cms" exports["./taxonomy/site/gated-hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 66 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/taxonomy/__tests__/collection-term-policy.test.ts`


## T — Tovu repoint: delete the 3 sources, rewrite every importer (9 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:87  '../../features/taxonomy/agent-tools.js' -> '@jini-ai/cms/taxonomy/site/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts:15  '../../features/taxonomy/agent-tools.js' -> '@jini-ai/cms/taxonomy/site/agent-tools'
apps/website/src/features/taxonomy/tool-registrations.ts:34  './agent-tools.js' -> '@jini-ai/cms/taxonomy/site/agent-tools'
apps/website/src/features/taxonomy/tool-registrations.ts:31  './content-targets.js' -> '@jini-ai/cms/taxonomy/site/content-targets'
apps/website/src/server/inbound/admin-http/routes/taxonomy/assign-terms.ts:5  '#src/features/taxonomy/content-targets' -> '@jini-ai/cms/taxonomy/site/content-targets'
apps/website/src/server/runtime/composition/content-publish-ports.ts:4  '#src/features/taxonomy/content-targets' -> '@jini-ai/cms/taxonomy/site/content-targets'
apps/website/src/features/taxonomy/__tests__/gated-hooks.test.ts:4  '../gated-hooks.js' -> '@jini-ai/cms/taxonomy/site/gated-hooks'
apps/website/src/features/taxonomy/tool-registrations.ts:33  './gated-hooks.js' -> '@jini-ai/cms/taxonomy/site/gated-hooks'
apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts:8  '#src/features/taxonomy/gated-hooks' -> '@jini-ai/cms/taxonomy/site/gated-hooks'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts`
- `apps/website/src/features/taxonomy/__tests__/gated-hooks.test.ts`

## Named mutation
in the Jini copy of `content-targets.ts`, negate the first `if (` condition of its first exported function; `collection-term-policy.test.ts` must go red, then revert
