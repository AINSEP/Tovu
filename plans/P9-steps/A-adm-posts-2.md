# A-adm-posts-2 — adm-posts → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:30 T:31. Depends on: A-adm-posts-1. Est: J 31 min, T 16 min.

## J — move verbatim into Jini (2 files, 38 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/posts/editor/toolbar/ToolbarCharacterCount.tsx` | `packages/admin/src/posts/editor/toolbar/ToolbarCharacterCount.tsx` | 14 |  |
| `apps/admin/src/features/posts/editor/toolbar/ToolbarOverflowMenu.tsx` | `packages/admin/src/posts/editor/toolbar/ToolbarOverflowMenu.tsx` | 24 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./posts/editor/toolbar/ToolbarCharacterCount"]
- "@jini-ai/admin" exports["./posts/editor/toolbar/ToolbarOverflowMenu"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 2 sources, rewrite every importer (2 lines)

```
apps/admin/src/features/posts/editor/toolbar/Toolbar.tsx:8  './ToolbarCharacterCount' -> '@jini-ai/admin/posts/editor/toolbar/ToolbarCharacterCount'
apps/admin/src/features/posts/editor/toolbar/Toolbar.tsx:11  './ToolbarOverflowMenu' -> '@jini-ai/admin/posts/editor/toolbar/ToolbarOverflowMenu'
```

## Tovu tests that must stay green (0; import lines are repointed above, assertions untouched)

## Hook-injection gate (Jini `check:hook-injection`)
- `apps/admin/src/features/posts/editor/toolbar/ToolbarOverflowMenu.tsx` imports a custom hook module directly; in Jini the hook must arrive as a prop from the host (owner CI rule). Keep the hook file beside it; the Tovu screen that renders it passes the hook. If that needs more than a prop added at the single call site, STOP and report.

## Class names (Jini packages use `jini-*`)
- `apps/admin/src/features/posts/editor/toolbar/ToolbarCharacterCount.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report
- `apps/admin/src/features/posts/editor/toolbar/ToolbarOverflowMenu.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report

## Named mutation
in the Jini copy of `ToolbarOverflowMenu.tsx`, negate the first `if (` condition of its first exported function; a NEW characterization test (write it first, tests-first rule) must go red, then revert
