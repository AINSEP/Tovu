### jini:packages/vibecoding/src/core/session.ts
- **Over:** `createVibecodingSession` 126 (file 170)
- **Phase:** now · **Batch:** size-41
- **Tests:** `packages/vibecoding/src/react/__tests__/session.test.ts`, `packages/vibecoding/src/session/__tests__/session-exports.test.ts`, `packages/vibecoding/src/__tests__/integration.test.ts`, `packages/vibecoding/src/node/__tests__/project-history.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | returned `undo`, `redo` (+ `cacheChange`, `restoredPatch` they use) | replay history into the part cache |
| B | returned `applyEdits` | apply one model turn of edits |
| C | `history`, `applyTurn`, `listeners`, `partContent`, `current`, `commit`, `run`, return (`getSnapshot`, `subscribe`, `refresh`, `readPart`, `takeSnapshot`, `restoreSnapshot`) | session state core (stays) |

- **Splits** (same file, module level above `createVibecodingSession`):
  1. `createHistoryReplay({ target, history, applyTurn, partContent, run, getCurrent }: CreateHistoryReplayInput): Pick<VibecodingSession, 'undo' | 'redo'>` ← the `undo` and `redo` method bodies verbatim, plus `cacheChange` and `restoredPatch` as inner functions (with their comments) ONLY if nothing else in the factory uses them — `restoreSnapshot` likely uses `restoredPatch`; if so keep both in the factory and pass them in instead. `current.parts` (read at run time inside `undo`/`redo`) becomes `getCurrent().parts`; pass `getCurrent: () => current`.
  2. `createApplyEdits({ target, history, applyTurn, partContent, run, options }: CreateApplyEditsInput): VibecodingSession['applyEdits']` ← `applyEdits` method body.
  Return object: `...createHistoryReplay(...)` / `applyEdits: createApplyEdits(...)` in the original key positions.
- **Importers to update:** none (the factory and its types stay; `./session` and `./core` entries unchanged).
- **After:** `createVibecodingSession` ~80; file ~195.
- **Risks / notes:** `current` is a reassigned `let` — every read inside moved code must go through `getCurrent()` (a captured value would be stale). Check `run` is typed generic — pass it as-is.
