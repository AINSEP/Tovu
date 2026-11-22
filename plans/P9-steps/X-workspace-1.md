# X-workspace-1 — workspace → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:15 T:16. Depends on: C-contracts-core-6. Est: J 32 min, T 22 min.

## J — move verbatim into Jini (2 files, 133 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/workspace/agent-tools.ts` | `packages/cms/src/workspace/site/agent-tools.ts` | 19 |  |
| `apps/website/src/features/workspace/tool-registrations.ts` | `packages/cms/src/workspace/site/tool-registrations.ts` | 114 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./workspace/site/agent-tools"]
- "@jini-ai/cms" exports["./workspace/site/tool-registrations"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 2 sources, rewrite every importer (6 lines)

```
apps/website/src/features/workspace/index.ts:35  './agent-tools.js' -> '@jini-ai/cms/workspace/site/agent-tools'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/assistant/__tests__/tool-registrations.workspace.test.ts:10  '../../features/workspace/tool-registrations.js' -> '@jini-ai/cms/workspace/site/tool-registrations'
apps/website/src/features/workspace/__tests__/tool-registrations.get.test.ts:6  '../tool-registrations.js' -> '@jini-ai/cms/workspace/site/tool-registrations'
apps/website/src/features/workspace/__tests__/tool-registrations.list.test.ts:6  '../tool-registrations.js' -> '@jini-ai/cms/workspace/site/tool-registrations'
apps/website/src/features/workspace/index.ts:40  './tool-registrations.js' -> '@jini-ai/cms/workspace/site/tool-registrations'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/workspace/index.ts:41  './tool-registrations.js' -> '@jini-ai/cms/workspace/site/tool-registrations'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.workspace.test.ts`
- `apps/website/src/features/workspace/__tests__/tool-registrations.get.test.ts`
- `apps/website/src/features/workspace/__tests__/tool-registrations.list.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/workspace/tool-registrations.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `tool-registrations.ts`, negate the first `if (` condition of its first exported function; `tool-registrations.workspace.test.ts` must go red, then revert
