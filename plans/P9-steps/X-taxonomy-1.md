# X-taxonomy-1 — taxonomy → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:9 T:12. Depends on: C-contracts-core-3, C-contracts-core-7. Est: J 42 min, T 45 min.

## J — move verbatim into Jini (4 files, 227 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/taxonomy/agent-tools.ts` | `packages/cms/src/taxonomy/site/agent-tools.ts` | 40 |  |
| `apps/website/src/features/taxonomy/index.ts` | `packages/cms/src/taxonomy/site/index.ts` | 60 |  |
| `apps/website/src/features/taxonomy/content-targets.ts` | `packages/cms/src/taxonomy/site/content-targets.ts` | 65 |  |
| `apps/website/src/features/taxonomy/gated-hooks.ts` | `packages/cms/src/taxonomy/site/gated-hooks.ts` | 62 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./taxonomy/site"]
- "@jini-ai/cms" exports["./taxonomy/site/agent-tools"]
- "@jini-ai/cms" exports["./taxonomy/site/content-targets"]
- "@jini-ai/cms" exports["./taxonomy/site/gated-hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 128 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/taxonomy/__tests__/gated-hooks.test.ts`
- `apps/website/src/features/taxonomy/__tests__/collection-term-policy.test.ts`


## T — Tovu repoint: delete the 4 sources, rewrite every importer (34 lines)

```
apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts:87  '../../features/taxonomy/agent-tools.js' -> '@jini-ai/cms/taxonomy/site/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts:15  '../../features/taxonomy/agent-tools.js' -> '@jini-ai/cms/taxonomy/site/agent-tools'
apps/website/src/features/taxonomy/tool-registrations.ts:34  './agent-tools.js' -> '@jini-ai/cms/taxonomy/site/agent-tools'
apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts:22  '../../features/taxonomy/index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/entries/__tests__/unit/publish-content.test.ts:9  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/entries/publish-content.ts:10  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/taxonomy/__tests__/integration/repo.sqlite.integration.test.ts:20  '../../index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/taxonomy/__tests__/integration/repo.sqlite.integration.test.ts:21  '../../index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/taxonomy/__tests__/publish-content.test.ts:7  '../index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/taxonomy/__tests__/repo.characterization.test.ts:6  '../index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/taxonomy/__tests__/repo.dialects.test.ts:5  '../index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts:27  '../index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/taxonomy/publish-content.ts:19  './index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/taxonomy/publish-term-ids.ts:5  './index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/taxonomy/tool-registrations.ts:37  './index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts:6  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/inbound/admin-http/routes/taxonomy/__tests__/assign-terms-error-mapping.unit.test.ts:8  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/inbound/admin-http/routes/taxonomy/assign-terms.ts:15  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/inbound/admin-http/routes/taxonomy/create-taxonomy.ts:5  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/inbound/admin-http/routes/taxonomy/create-term.ts:14  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/inbound/admin-http/routes/taxonomy/list.ts:4  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts:6  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/inbound/admin-http/routes/taxonomy/rename-term.ts:5  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/routes/types.ts:111  '../../features/taxonomy/index.js' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/runtime/composition/app.ts:82  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/runtime/composition/memory-deps/route-deps/model-comments-plugins.ts:1  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/runtime/composition/memory-deps/slices/taxonomy-trash-repos.ts:6  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/runtime/composition/site-deps/trash-follow-up-hooks.ts:21  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/server/runtime/composition/site-deps/trash-stores.ts:6  '#src/features/taxonomy/index' -> '@jini-ai/cms/taxonomy/site'
apps/website/src/features/taxonomy/tool-registrations.ts:31  './content-targets.js' -> '@jini-ai/cms/taxonomy/site/content-targets'
apps/website/src/server/inbound/admin-http/routes/taxonomy/assign-terms.ts:5  '#src/features/taxonomy/content-targets' -> '@jini-ai/cms/taxonomy/site/content-targets'
apps/website/src/server/runtime/composition/content-publish-ports.ts:4  '#src/features/taxonomy/content-targets' -> '@jini-ai/cms/taxonomy/site/content-targets'
apps/website/src/features/taxonomy/tool-registrations.ts:33  './gated-hooks.js' -> '@jini-ai/cms/taxonomy/site/gated-hooks'
apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts:8  '#src/features/taxonomy/gated-hooks' -> '@jini-ai/cms/taxonomy/site/gated-hooks'
```

## Tovu tests that must stay green (10; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts`
- `apps/website/src/features/entries/__tests__/unit/publish-content.test.ts`
- `apps/website/src/features/taxonomy/__tests__/integration/repo.sqlite.integration.test.ts`
- `apps/website/src/features/taxonomy/__tests__/publish-content.test.ts`
- `apps/website/src/features/taxonomy/__tests__/repo.characterization.test.ts`
- `apps/website/src/features/taxonomy/__tests__/repo.dialects.test.ts`
- `apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts`
- `apps/website/src/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/taxonomy/__tests__/assign-terms-error-mapping.unit.test.ts`

## Named mutation
in the Jini copy of `content-targets.ts`, negate the first `if (` condition of its first exported function; `collection-term-policy.test.ts` must go red, then revert
