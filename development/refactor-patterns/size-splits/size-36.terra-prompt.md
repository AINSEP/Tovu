# Terra job size-36: split 3 Jini file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Jini clone you are given (Jini only; never edit Tovu). `TOVU` below = the Tovu clone path the coordinator gives you (only for the read-only `outline.mjs` tool). Run `pnpm install --frozen-lockfile` once if `node_modules` is missing.

READY: these files are not reshaped by the Tovu→Jini move.

## Rules
Owner-approved 2026-11-13. These rules are binding for every `size-NN` job and every hard-file plan.
They are inlined into each Terra prompt, so a job needs nothing else.

## Limits and how lines are counted
- A file is over when it has more than **500** counted lines; a function (incl. a React component, hook,
  method, arrow) when it has more than **100**. Counted = non-blank after comments are removed (ESLint
  `max-lines` / `max-lines-per-function` with `skipBlankLines` + `skipComments`). Nested functions count
  on their own, and they also count inside their parent.
- Measure and check with the outline tool (read-only, TypeScript from `<root>/node_modules`):
  `node <TOVU>/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` prints
  every top-level declaration (range, counted lines, same-file names it uses) and, for each function over
  100, its body statements with `decl:` (locals it creates) and `uses:` (earlier locals/params it reads).
  `--check <files...>` prints only what is still over and exits 1 if anything is.
- Exempt (never split): `development/scripts/size-exceptions.json` (locale `*-i18n.ts(x)`, `i18n-common.ts`,
  `*.generated.*`, `migration(s)/`, plus listed entries). `composition/deps.ts` and `composition/app.ts`
  are NOT exempt.

## What a split is
1. **Split by responsibility, never by line number.** Each new module does one job you can name in a few
   words (its file name says it). Each helper does one step you can name. If a piece has no nameable job,
   it stays where it is.
2. **A long function becomes helper functions in the SAME file.** Helpers go at module level directly
   above the function they came from, in the order they run. A step that needs many of the function's
   locals becomes a helper that takes them as one object; for a React hook, a group of state + effects
   becomes a sub-hook `useXxx` in the same file. Only when the file itself is then over 500 do helpers
   move to a sibling file (as the plan says).
3. **A long file splits into sibling modules** in the same folder, named `<original-stem>-<job>.ts(x)`
   (or the name the plan gives). The original file keeps its own name and its main job, and imports
   what moved. No new folder unless the plan says so.
4. **Imports follow the move.** Every importer of a moved export imports it from its new module
   (find them with `rg -n "from ['\"].*<old-stem>(\.js)?['\"]"` across the repo, tests included). The old
   file does NOT re-export moved names — except when the old file is a package entry (a target in a
   `package.json` `exports` map, or an `index.ts` that is one): then it keeps `export { x } from "./new.js"`
   so the public API is unchanged.
5. **No import cycles.** A new module never imports the file it was cut out of. Types both sides need move
   into the new module (or a `<stem>-types.ts` sibling when the plan says so).
6. **Behaviour does not change.** Same statements, same order, same awaits, same error text, same exports
   from the package. Only what crosses a new boundary changes: locals become parameters / return values.
   Do not "improve" code you move.
7. **"Why" comments move with their code** — word for word, including the comment above a moved
   statement and the file header paragraph that explains a moved part (copy that paragraph into the new
   file's header; keep the original header's other paragraphs).
8. **Arguments: `(required, optional = {})`.** A new helper takes ONE destructured object of required
   inputs and, only if it has optional inputs, a second object defaulting to `{}`:
   `function applyRow({ row, store }: ApplyRowInput, { signal }: ApplyRowOptions = {}): Promise<void>`.
   No new positional primitive parameters. Name the input type `<Helper>Input` (and `<Helper>Options`)
   unless the plan names it. Sub-hooks follow the same rule.
9. **React components take props only.** State, effects, refs, callbacks and data loading live in
   `<Component>.hooks.ts` (or the existing hooks file the plan names). A component split into
   sub-components passes plain props; a sub-component never receives the whole hook result object unless
   the plan says so.
10. **Banned:** `eslint-disable` (any form), `as any`, `as unknown as`, non-null `!`, `@ts-ignore`,
    `@ts-expect-error`. If a type does not line up after a move, export the existing type from where it
    lives — never loosen it. A pre-existing `eslint-disable-next-line` / `biome-ignore` on a moved line moves
    with that line unchanged (the diff shows it moved, not added); never add a new one.
11. **Tests are not edited**, except an import path of a moved symbol. Before moving an export, run
    `rg -n "vi\.mock\(|mock\.module\(|jest\.mock\(" <test dirs of the file>`: if a test mocks the OLD module
    path and the code under test now gets the moved symbol from the NEW module, the mock stops applying —
    move the mock path in that test to the new module (the only other allowed test edit) and say so in the
    report.

## Running checks (no suites, nothing left running)
- Run ONLY the test files the plan lists for each file, one at a time, after that file is done:
  - Tovu `apps/website`, `packages/*`, `content/*`, `apps/site-chat`:
    `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <test file>`
  - Tovu `apps/admin`: `cd apps/admin && npx vitest run <path relative to apps/admin> --maxWorkers=2`
  - Tovu `apps/desktop` main (`src/` outside `renderer/`, `contracts/`):
    `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <file>`
  - Tovu `apps/desktop` renderer/contracts: `cd apps/desktop && node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1 <file>`
  - Jini: `pnpm --filter <package name> exec vitest run <path relative to the package> --maxWorkers=2`, then
    `pnpm --filter <package name> run typecheck` once per touched package (Jini packages are small enough).
- Tovu: no full `tsc` (admin tsc needs 2+ GB). Run `npx eslint <changed files>` (no new errors, no
  `max-lines`/`max-lines-per-function` warnings left on the planned items).
- Done check per file: `outline.mjs --check <original file> <new files>` → every planned item `OK`
  (an item the plan says stays over, e.g. an owner exception candidate, is listed in the report).
- No watch modes, no dev servers, no suites; kill nothing you did not start; leave nothing running.

## Commit and report
- One commit per file (or per tightly coupled pair the plan names), by explicit paths only:
  `git add -- <paths> && git commit -F msg -- <paths>`; message `refactor(<area>): split <file> by responsibility (size)`.
  Never push, never `git add -A`, never stash or checkout other files.
- If a plan step cannot be done as written (an anchor is missing, a cycle appears, a test fails and
  the cause is the split), stop that file, revert only that file's uncommitted changes
  (`git restore -- <its paths>`, delete its new files), and report it — never improvise a different split.
- Report: per file `OK` / `STOPPED (reason)`, new files, before → after counted lines, tests run with
  pass/fail counts, and any test-mock path you moved.

## For each file, in the order listed
1. `node $TOVU/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` — confirm every declaration / statement anchor the plan names exists. A missing anchor = STOP this file.
2. Complete the test list: `rg -l "<file stem>" <app or package dir> --glob '*.test.*'` (colocated tests are easy to miss); add any hit that exercises the file.
3. Run those tests once BEFORE editing (baseline). A test already failing is noted and compared after; it is not yours to fix.
4. Do the plan's steps in order. After the file: tests again (same pass count), `npx eslint <changed files>`, `outline.mjs --check <original> <new files>`, Jini: the package typecheck. Then commit that file.
5. Worked example of the expected style: `development/refactor-patterns/size-splits/EXAMPLE.md` in the Tovu clone (optional reading).

## Files
### jini:packages/sidecar/src/json-ipc.ts
- **Over:** `createJsonIpcServer` 157 · its `createNetServer` callback 132 · `requestJsonIpc` 129 · its Promise executor 124
- **Phase:** now · **Batch:** size-36
- **Tests:** `src/__tests__/json-ipc.contract.test.ts`, `src/__tests__/index.test.ts` (`pnpm --filter @jini-ai/sidecar exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | trace helpers, `jsonIpcError`, `staleUnixSocketExists`, `prepareIpcPath`, `ipcResponseError` | unchanged |
| B | server connection state, idle timer, `claimFrame`, error/close listeners, data listener up to `buffer = buffer.slice(newlineIndex + 1);` | per-connection framing (stays) |
| C | data listener: `if (receivedBytes > maxFrameBytes) {` branch body after `claimFrame();` | refuse an oversized frame |
| D | data listener from `let message: unknown;` to its end | parse one frame, run the handler, write the reply |
| E | client: `socket.on("connect", () => {` body | send the request frame |
| F | client: `socket.on("error", (error) => {` body | fail the request on socket error |

- **Splits** (module level, C and D above `createJsonIpcServer`, E and F above `requestJsonIpc`):
  1. HELPER `rejectOversizedFrame({ socket, startedAt, maxFrameBytes, receivedBytes, socketPath, traceId }: RejectOversizedFrameInput): void` ← the `traceJsonIpc("server.frame_too_large", …)` call and the `socket.end(…FRAME_TOO_LARGE…)` call. In place: `claimFrame(); rejectOversizedFrame({ … }); return;`.
  2. HELPER `answerJsonIpcFrame({ frame, socket, handler, socketPath, traceId, startedAt }: AnswerJsonIpcFrameInput): Promise<void>` ← from `let message: unknown;` to the end of the data listener (both `try` blocks, verbatim). In place: `await answerJsonIpcFrame({ … });`.
  3. HELPER `sendJsonIpcRequest({ socket, payload, socketPath, timeoutMs, traceId, startedAt, messageSummary }: SendJsonIpcRequestInput): void` ← body of the client `"connect"` listener (pass exactly what it reads).
  4. HELPER `failJsonIpcRequest({ error, socketPath, traceId, startedAt, messageSummary, settle, rejectRequest }: FailJsonIpcRequestInput): void` ← body of the client `"error"` listener (`settle: (callback: () => void) => void`, `rejectRequest: (reason: unknown) => void`).
- **Importers to update:** none.
- **After:** file ~395; `createJsonIpcServer` ~80; connection callback ~55; `requestJsonIpc` ~85; executor ~80; `answerJsonIpcFrame` ~68; others ≤ 35.
- **Risks / notes:** `buffer`, `receivedBytes`, `handled` (server) and `buffer`, `settled` (client) are `let`s — they stay in their closures; only immutable values cross. The `claimFrame()` before awaiting the handler must stay in the listener before `await answerJsonIpcFrame` (SEC-004 one-request guard). All trace event names and reply JSON byte-identical. The client `"data"` listener (mutates `buffer`) stays.

### jini:packages/ui/src/features/asset-grid/react/components/AssetGrid.tsx
- **Over:** `AssetGrid` 210
- **Phase:** now (JINI 210) · **Batch:** size-36
- **Tests:** `src/features/asset-grid/__tests__/react/components/AssetGrid.test.tsx`, `AssetGrid.per-card-delete.test.tsx`, `AssetGridBody.test.tsx`, `src/features/asset-grid/react/components/__tests__/AssetGrid.l161.characterization.test.tsx`, `AssetGrid.j5-07.characterization.test.tsx`, `src/features/asset-grid/__tests__/dependencies.test.ts` (package `@jini-ai/ui`). No test mocks the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A wiring | `useAssetGridFilters`, `viewMode` state, `useWiredAssetGridDataHook`, `useWiredAssetGridLiveUpdates`, selection hook, `containerRef`, `useRubberBandDrag`, `useAssetGridKeyboardShortcuts`, `getDayKey` | grid state |
| B delete | `confirmDeleteOpen`, `deleteError` states, `requestDeleteSelected`, `runDelete`, `confirmDelete`, `handleDeleteAsset`, module `withoutAssetIds` | bulk and per-card delete that drops rows only after the host deletes |
| C cards | `handlePreview`, `renderCard` | build one `AssetCard` per asset |
| D view | `const t`, `return (<div className="asset-grid-root">…)` | layout (stays) |

- **Splits:**
  1. NEW `AssetGrid.hooks.tsx` in the same folder. It's `.tsx` because `renderCard` returns JSX, and there's precedent in `ui/src/features/admin-widgets/components/InfoTip.hooks.tsx`. Job: AssetGrid's state, delete flow and card renderer. It contains:
     - `function withoutAssetIds` and `export function useAssetGridDelete<TAsset extends AssetGridItem>({ selectedIds, setSelectedIds, setAssets, onDeleteSelected, onDeleteAsset }: UseAssetGridDeleteInput<TAsset>): AssetGridDelete`. This is unit B verbatim: both `useState`s with the `deleteError` doc comment, the long `runDelete` doc comment ("Two distinct defects…") and the `handleDeleteAsset` comment. It returns `{ confirmDeleteOpen, setConfirmDeleteOpen, deleteError, requestDeleteSelected, confirmDelete, handleDeleteAsset }`.
     - `export function useAssetGridCardRenderer<TAsset extends AssetGridItem>({ assets, selectors, selectedIds, kindFacetLabels, sourceFacetLabels, renderThumbnail, renderThumbnailPlaceholder, renderCardExtra, toggleOne, rangeTo, onPreview, onDeleteAsset, handleDeleteAsset }: UseAssetGridCardRendererInput<TAsset>): (asset: TAsset, index: number) => ReactElement`. This is unit C verbatim, with the same deps arrays. It returns `renderCard`.
     - `export function useAssetGrid<TAsset extends AssetGridItem>(props: AssetGridProps<TAsset>): UseAssetGridResult<TAsset>`. Its first statement is the component's current props destructuring, with all defaults (`active = true`, `isPreviewOpen = false`, `initialViewMode = 'grid'`, both injected-hook defaults). After that comes unit A verbatim (keep the "`dependencies` (host-supplied…" comment), then `useAssetGridDelete(...)` placed right after the rubber-band line and `useAssetGridCardRenderer(...)` placed where `renderCard` was. It returns the values the JSX reads: `kind, setKind, source, setSource, search, setSearch, kindFacets, sourceFacets, viewMode, setViewMode, assets, loading, reload, selectedIds, selectAll, clearSelection, requestDeleteSelected, containerRef, band, dragging, onMouseDown, getDayKey, renderCard, deleteError, confirmDeleteOpen, setConfirmDeleteOpen, confirmDelete`. Write `UseAssetGridResult<TAsset>` out as an explicit interface with those fields.
     - `AssetGridProps` stays exported from `AssetGrid.tsx` and is imported here with `import type`, which doesn't create a runtime cycle. If lint flags the type cycle, move `AssetGridProps` into the hooks file and re-export it from `AssetGrid.tsx` with `export type { AssetGridProps } from './AssetGrid.hooks.js'`, because the package index exports it.
  2. `AssetGrid` becomes `export function AssetGrid<TAsset extends AssetGridItem>(props: AssetGridProps<TAsset>)`. Inside: `const t = useT();`, then destructure `useAssetGrid(props)`. The unchanged JSX reads `searchPlaceholder`, `toolbarActions`, `renderBulkActions` and `emptyState` from `props`. `renderGridContent` stays in AssetGrid.tsx.
- **Importers to update:** none. `AssetGrid` and `AssetGridProps` keep their module. Check with `rg -n "AssetGrid(\.js)?['\"]" packages/ui/src`.
- **After:** `AssetGrid` about 62 lines, `useAssetGrid` about 60, `useAssetGridDelete` about 50, `useAssetGridCardRenderer` about 47. AssetGrid.tsx about 110 lines, AssetGrid.hooks.tsx about 190.
- **Risks / notes:** Hook call order moves (the delete `useState`s now come after the data/selection hooks). It stays the same on every render, so it's safe, but don't put any call behind a condition. Every `useCallback`/`useMemo` deps array stays byte for byte, including `onDeleteAsset` in `renderCard`'s deps. The `t` from `useT()` stays in the component because only the JSX uses it. `batch[0]!` is moved code, so it stays.

### jini:packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx
- **Over:** `AssetTreeFileRow` 140 (file 162, fine)
- **Phase:** now · **Batch:** size-36
- **Tests:** `src/features/asset-tree-browser/__tests__/react/components/AssetTreeFileRow.test.tsx`, `src/features/asset-tree-browser/__tests__/index.test.ts` (smoke: any `AssetTreeBrowser*.test.tsx` under `src/features/asset-tree-browser/__tests__` — complete with `rg -l "AssetTreeFileRow|AssetTreeBrowser" packages/ui/src/features/asset-tree-browser --glob '*.test.*'`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `lastActivationRef`, `handleNameKeyDown`, `handleMenuTrigger` | keyboard double-activation + menu-anchor handlers |
| B | first `<span className="asset-tree-row-check" …>` | hover-revealed select checkbox |
| C | `<div className="asset-tree-row-name-wrap">` (rename `<input>` vs name `<button>`) | name cell / inline rename |
| D | row shell, glyph, size/time cells, `⋯` menu span | row layout — stays |

- **Splits** (in order):
  1. NEW `AssetTreeFileRow.hooks.ts` — job: row handlers. `export function useAssetTreeFileRowHandlers({ path, onOpen, onSelectPreview, onOpenMenu }: UseAssetTreeFileRowHandlersInput): { handleNameKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void; handleMenuTrigger: (event: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>) => void }` ← `const lastActivationRef = useRef…`, `function handleNameKeyDown…`, `function handleMenuTrigger…` verbatim, then `return { handleNameKeyDown, handleMenuTrigger };`. Input types: `Pick<AssetTreeFileRowProps, 'path' | 'onOpen' | 'onSelectPreview' | 'onOpenMenu'>` — to avoid a cycle, type the four fields explicitly (`path: string; onOpen: (path: string) => void; onSelectPreview: (path: string) => void; onOpenMenu: (path: string, anchor: MenuAnchorRect) => void`) instead of importing the props type. Imports `useRef`, React event types, `isDoubleActivation`, `MenuAnchorRect` from `../../rules.js`. Copy the doc sentence "Keyboard parity with the mouse: Enter/Space … row name button)." above the hook as well (keep it on the component too).
  2. SUB-COMPONENT in the original above `AssetTreeFileRow`: `AssetTreeRowCheckbox({ selected, displayName, onToggle }: AssetTreeRowCheckboxProps): JSX.Element` ← unit B verbatim, with `onToggleSelect(path)` replaced by `onToggle()`; parent passes `onToggle={() => onToggleSelect(path)}`. Calls `useT()`.
  3. SUB-COMPONENT `AssetTreeFileRowName({ displayName, kindLabel, renaming, onSelect, onOpenFile, onNameKeyDown, onRenameDraftChange, onCommitRename, onCancelRename }: AssetTreeFileRowNameProps): JSX.Element` ← unit C verbatim; `() => onSelectPreview(path)` → `onSelect`, `() => onOpen(path)` → `onOpenFile` (parent passes `onSelect={() => onSelectPreview(path)}` `onOpenFile={() => onOpen(path)}`), `handleNameKeyDown` → `onNameKeyDown`. Calls `useT()`.
  4. `AssetTreeFileRow` keeps `t`, `relativeTime`, `timeLabel`, calls `const { handleNameKeyDown, handleMenuTrigger } = useAssetTreeFileRowHandlers({ path, onOpen, onSelectPreview, onOpenMenu });`, and renders D with B/C. Remove `useRef`/`isDoubleActivation` imports if unused.
- **Importers to update:** none (no export moves).
- **After:** file ~175; `AssetTreeFileRow` ~60; `AssetTreeFileRowName` ~45; `AssetTreeRowCheckbox` ~25; hooks file ~30.
- **Risks / notes:** `autoFocus` and the `data-skip-rename-commit` blur guard stay on the same `<input>`. Only the `onClick`/`onDoubleClick` closures change form (inline arrow → passed arrow) — same calls. No `vi.mock` of this file.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/sidecar/src/json-ipc.ts packages/ui/src/features/asset-grid/react/components/AssetGrid.tsx packages/ui/src/features/asset-tree-browser/react/components/AssetTreeFileRow.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
