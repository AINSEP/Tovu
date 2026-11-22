# X-navigation-1 — navigation → @jini-ai/cms (Jini step J then Tovu step T)

Lane X. Batch J:10 T:11. Depends on: C-contracts-core-5. Est: J 45 min, T 32 min.

## J — move verbatim into Jini (6 files, 376 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/navigation/menu-html-permission.ts` | `packages/cms/src/navigation/site/menu-html-permission.ts` | 7 |  |
| `apps/website/src/features/navigation/menu-trash-follow-ups.ts` | `packages/cms/src/navigation/site/menu-trash-follow-ups.ts` | 95 |  |
| `apps/website/src/features/navigation/menu-version-conflict-error.ts` | `packages/cms/src/navigation/site/menu-version-conflict-error.ts` | 13 |  |
| `apps/website/src/features/navigation/trash-menu.ts` | `packages/cms/src/navigation/site/trash-menu.ts` | 63 |  |
| `apps/website/src/features/navigation/trash-aware-memory-menu-repo.ts` | `packages/cms/src/navigation/site/trash-aware-memory-menu-repo.ts` | 135 |  |
| `apps/website/src/features/navigation/tool-registrations.ts` | `packages/cms/src/navigation/site/tool-registrations.ts` | 63 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./navigation/site/menu-html-permission"]
- "@jini-ai/cms" exports["./navigation/site/menu-trash-follow-ups"]
- "@jini-ai/cms" exports["./navigation/site/menu-version-conflict-error"]
- "@jini-ai/cms" exports["./navigation/site/tool-registrations"]
- "@jini-ai/cms" exports["./navigation/site/trash-aware-memory-menu-repo"]
- "@jini-ai/cms" exports["./navigation/site/trash-menu"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 6 sources, rewrite every importer (18 lines)

```
apps/website/src/features/navigation/index.ts:135  './menu-html-permission.js' -> '@jini-ai/cms/navigation/site/menu-html-permission'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/trash/__tests__/menu-trash-flow.test.ts:11  '#src/features/navigation/menu-trash-follow-ups' -> '@jini-ai/cms/navigation/site/menu-trash-follow-ups'
apps/website/src/server/runtime/composition/site-deps/trash-follow-up-hooks.ts:3  '#src/features/navigation/menu-trash-follow-ups' -> '@jini-ai/cms/navigation/site/menu-trash-follow-ups'
apps/website/src/features/navigation/__tests__/import-menu.test.ts:6  '../menu-version-conflict-error.js' -> '@jini-ai/cms/navigation/site/menu-version-conflict-error'
apps/website/src/features/navigation/__tests__/repo.sqlite.compare-and-set.test.ts:10  '../menu-version-conflict-error.js' -> '@jini-ai/cms/navigation/site/menu-version-conflict-error'
apps/website/src/features/navigation/index.ts:139  './menu-version-conflict-error.js' -> '@jini-ai/cms/navigation/site/menu-version-conflict-error'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/navigation/__tests__/trash-menu.test.ts:5  '../trash-menu.js' -> '@jini-ai/cms/navigation/site/trash-menu'
apps/website/src/features/navigation/index.ts:132  './trash-menu.js' -> '@jini-ai/cms/navigation/site/trash-menu'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/navigation/__tests__/repo.sqlite.compare-and-set.test.ts:9  '../trash-aware-memory-menu-repo.js' -> '@jini-ai/cms/navigation/site/trash-aware-memory-menu-repo'
apps/website/src/features/navigation/__tests__/trash-aware-memory-menu-repo.test.ts:5  '../trash-aware-memory-menu-repo.js' -> '@jini-ai/cms/navigation/site/trash-aware-memory-menu-repo'
apps/website/src/features/navigation/__tests__/trash-menu.test.ts:4  '../trash-aware-memory-menu-repo.js' -> '@jini-ai/cms/navigation/site/trash-aware-memory-menu-repo'
apps/website/src/server/runtime/composition/memory-deps/slices/memory-trash.ts:22  '#src/features/navigation/trash-aware-memory-menu-repo' -> '@jini-ai/cms/navigation/site/trash-aware-memory-menu-repo'
apps/website/src/server/runtime/composition/memory-deps/slices/nav-form-content-repos.ts:3  '#src/features/navigation/trash-aware-memory-menu-repo' -> '@jini-ai/cms/navigation/site/trash-aware-memory-menu-repo'
apps/website/src/server/runtime/composition/memory-deps/slices/publish-apply.ts:10  '#src/features/navigation/trash-aware-memory-menu-repo' -> '@jini-ai/cms/navigation/site/trash-aware-memory-menu-repo'
apps/website/src/server/runtime/composition/memory-deps/slices/trash-adapters-forms-widgets.ts:7  '#src/features/navigation/trash-aware-memory-menu-repo' -> '@jini-ai/cms/navigation/site/trash-aware-memory-menu-repo'
apps/website/src/assistant/__tests__/tool-registrations.menus.test.ts:28  '../../features/navigation/tool-registrations.js' -> '@jini-ai/cms/navigation/site/tool-registrations'
apps/website/src/assistant/tool-registrations.ts:88  '../features/navigation/tool-registrations.js' -> '@jini-ai/cms/navigation/site/tool-registrations'
apps/website/src/server/runtime/composition/tool-catalog-manifest.ts:128  '#src/features/navigation/tool-registrations' -> '@jini-ai/cms/navigation/site/tool-registrations'
```

## Tovu tests that must stay green (6; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/tool-registrations.menus.test.ts`
- `apps/website/src/features/navigation/__tests__/import-menu.test.ts`
- `apps/website/src/features/navigation/__tests__/repo.sqlite.compare-and-set.test.ts`
- `apps/website/src/features/navigation/__tests__/trash-aware-memory-menu-repo.test.ts`
- `apps/website/src/features/navigation/__tests__/trash-menu.test.ts`
- `apps/website/src/features/trash/__tests__/menu-trash-flow.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/navigation/tool-registrations.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `trash-aware-memory-menu-repo.ts`, negate the first `if (` condition of its first exported function; `repo.sqlite.compare-and-set.test.ts` must go red, then revert
