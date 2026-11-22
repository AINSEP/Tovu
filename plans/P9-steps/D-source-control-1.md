# D-source-control-1 — source-control → @jini-ai/devops (Jini step J then Tovu step T)

Lane D. Batch J:7 T:14. Depends on: C-contracts-core-3. Est: J 40 min, T 23 min.

## J — move verbatim into Jini (4 files, 171 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/source-control/commit-schema.ts` | `packages/devops/src/source-control/site/commit-schema.ts` | 32 |  |
| `apps/website/src/features/source-control/credential-form.ts` | `packages/devops/src/source-control/site/credential-form.ts` | 109 |  |
| `apps/website/src/features/source-control/saved-key-bindings.ts` | `packages/devops/src/source-control/site/saved-key-bindings.ts` | 4 |  |
| `apps/website/src/contracts/core/tool-metadata/source-control.ts` | `packages/devops/src/source-control/site/tool-metadata.ts` | 26 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/devops" exports["./source-control/site/commit-schema"]
- "@jini-ai/devops" exports["./source-control/site/credential-form"]
- "@jini-ai/devops" exports["./source-control/site/saved-key-bindings"]
- "@jini-ai/devops" exports["./source-control/site/tool-metadata"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 100 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/source-control/__tests__/credential-form.unit.test.ts`


## T — Tovu repoint: delete the 4 sources, rewrite every importer (10 lines)

```
apps/admin/src/components/AssistantDock/__tests__/commit-folder-approval.contract.unit.test.ts:3  '../../../../../website/src/features/source-control/commit-schema' -> '@jini-ai/devops/source-control/site/commit-schema'
apps/website/src/features/source-control/tool-registrations.ts:3  './commit-schema.js' -> '@jini-ai/devops/source-control/site/commit-schema'
apps/website/src/features/source-control/provider-registry.ts:13  './credential-form.js' -> '@jini-ai/devops/source-control/site/credential-form'
apps/website/src/features/source-control/store.ts:339  './credential-form.js' -> '@jini-ai/devops/source-control/site/credential-form'
apps/website/src/cli/commands/owner-store-mapping.ts:3  '#src/features/source-control/saved-key-bindings' -> '@jini-ai/devops/source-control/site/saved-key-bindings'
apps/website/src/features/source-control/__tests__/gates.characterization.unit.test.ts:24  '../saved-key-bindings.js' -> '@jini-ai/devops/source-control/site/saved-key-bindings'
apps/website/src/features/source-control/tool-registrations.ts:38  './saved-key-bindings.js' -> '@jini-ai/devops/source-control/site/saved-key-bindings'
apps/website/src/server/runtime/composition/source-control-key-binding.ts:2  '#src/features/source-control/saved-key-bindings' -> '@jini-ai/devops/source-control/site/saved-key-bindings'
apps/website/src/contracts/core/tool-metadata/index.ts:54  './source-control.js' -> '@jini-ai/devops/source-control/site/tool-metadata'
apps/website/src/features/source-control/tool-registrations.ts:4  '../../contracts/core/tool-metadata/source-control.js' -> '@jini-ai/devops/source-control/site/tool-metadata'
```

## Tovu tests that must stay green (2; import lines are repointed above, assertions untouched)
- `apps/admin/src/components/AssistantDock/__tests__/commit-folder-approval.contract.unit.test.ts`
- `apps/website/src/features/source-control/__tests__/gates.characterization.unit.test.ts`

## Named mutation
in the Jini copy of `credential-form.ts`, negate the first `if (` condition of its first exported function; `credential-form.unit.test.ts` must go red, then revert
