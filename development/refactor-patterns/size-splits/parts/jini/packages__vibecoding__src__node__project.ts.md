### jini:packages/vibecoding/src/node/project.ts
- **Over:** `assembleProject` 181 (file 310)
- **Phase:** now · **Batch:** size-41
- **Tests:** `packages/vibecoding/src/node/__tests__/project-turn.test.ts`, `packages/vibecoding/src/node/__tests__/store-recovery.test.ts`, `packages/vibecoding/src/node/__tests__/project-history.test.ts`, `packages/vibecoding/src/node/__tests__/unit/project-contracts.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | lets `current`/`closed`/`selectingCapture`/`queue`, `pointer`, `rawHistory`, `selected`, `serial`, `synchronize`, `locked`, `record`, `collect`, `captureLocked`, `checkExpected` | revision pointer + serialized, locked access (the project's concurrency core) |
| B | `applyTurn`, `commitFiles`, `replay`, `restoreRevision`, `textSnapshot`, `restoreText`, `history` | revision operations |
| C | `listPartsLocked`, `readPartLocked`, `target` | working-tree `EditTarget` |
| D | `applyEdits` | edits → turn adapter |
| E | `project` object | public surface |

- **Splits** (same file, module level above `assembleProject`):
  1. `createRevisionCore({ store, historyLimit }: CreateRevisionCoreInput): RevisionCore` ← unit A verbatim; the four `let`s stay `let`s INSIDE this factory. Returns `{ rawHistory, selected, serial, locked, record, collect, captureLocked, checkExpected, getCurrent: () => current, setCurrent: (next: Current | null) => { current = next; }, isClosed: () => closed, markClosed: () => { closed = true; } }` (only the accessors unit B/E actually need — check each `current =` / `closed =` site in B/E and route it through `setCurrent`/`markClosed`). All comments ("Never replay a local stack…", "The pointer write is the only and last write…", "Drift becomes a normal revision…", "The caller's view is stale…") move with their functions.
  2. `createWorkingTreeTarget({ paths, store, serial, locked, captureLocked, selected, textSnapshot, restoreText }: CreateWorkingTreeTargetInput): EditTarget` ← unit C.
  3. `applyEditsThrough({ edits, capture, applyTurn }: ApplyEditsThroughInput, options: { label?: string } = {}): Promise<readonly ApplyOutcome[]>` ← `applyEdits` body (it calls `project.capture()` → pass `capture: () => project.capture()`); `assembleProject` keeps a 1-line `applyEdits` wrapper so `project.applyEdits` is unchanged.
  `assembleProject` keeps unit B (uses `core.*`) and `project`.
- **Importers to update:** none (`openFileTreeProject` is the export; `assembleProject` is private).
- **After:** `assembleProject` ~90; `createRevisionCore` ~75; file ~340.
- **Risks / notes:** HIGH — concurrency core (queue, lock, `closed` checks inside `serial`). Every read of `current`/`closed` in units B/E must become `core.getCurrent()`/`core.isClosed()`; a captured snapshot would silently break drift handling. `pointer.replacePart` assigns `current` — it stays inside the core, so that assignment is unchanged. Recommend Fable/Opus execution.
