# Terra job size-35: split 7 Jini file(s) by responsibility (size limits)

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
### jini:packages/ui/src/features/memory/dependencies.ts
- **Over:** `createMemoryHttpPorts` 105 (file 222, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/dependencies.test.ts`, `src/features/memory/__tests__/http-ports.test.ts`, `src/features/memory/__tests__/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `requiredField`, `requiredNonNullField` | response-field validators — stay |
| B | `createMemoryHttpPorts`: `function request(...)` | fetch binding with timeout — stays |
| C | `// ─── Config cluster` … `const memoryConfigPort` | config REST port |
| D | `// ─── Entries/index cluster` … `const memoryEntriesPort` | entries/index REST port |
| E | `// ─── Extraction history cluster` … `const memoryExtractionsPort` | extraction-history REST port |
| F | `createFakeMemoryConnectorsPort`, session helpers, `notifyConnectorsChanged`, singletons | connectors demo cluster — stays |

- **Splits** (same file, module level, between `requiredNonNullField` and `createMemoryHttpPorts`, in this order):
  0. TYPE `type MemoryHttpRequest = (url: string, init: RequestInit, options: { timeoutMs: number }) => Promise<Response>;` (module-private) — the existing shape of `request`.
  1. HELPER `createMemoryConfigHttpPort({ request }: CreateMemoryConfigHttpPortInput): MemoryConfigPort` ← from `// ─── Config cluster (real HTTP)` through `const memoryConfigPort: MemoryConfigPort = { … };` then `return memoryConfigPort;`. Input type `{ request: MemoryHttpRequest }`.
  2. HELPER `createMemoryEntriesHttpPort({ request }: CreateMemoryEntriesHttpPortInput): MemoryEntriesPort` ← from `// ─── Entries/index cluster (real HTTP)` (with the big `BUG FIX` doc comment on `fetchMemoryList`, word for word) through `const memoryEntriesPort: MemoryEntriesPort = { … };`, then `return memoryEntriesPort;`. Inner function names unchanged (the inner `fetchMemoryList` shadows the module export as it does today).
  3. HELPER `createMemoryExtractionsHttpPort({ request }: CreateMemoryExtractionsHttpPortInput): MemoryExtractionsPort` ← from `// ─── Extraction history cluster (real HTTP)` through `const memoryExtractionsPort …`, then `return memoryExtractionsPort;`.
  4. `createMemoryHttpPorts` keeps its signature, `function request(...)` (annotate nothing new), and ends with `return { config: createMemoryConfigHttpPort({ request }), entries: createMemoryEntriesHttpPort({ request }), extractions: createMemoryExtractionsHttpPort({ request }) };` — construction order config → entries → extractions as today.
- **Importers to update:** none (no export moves; `createMemoryHttpPorts`, singletons and `fetchMemoryList` keep their names and location).
- **After:** file ~230; `createMemoryHttpPorts` ~10; `createMemoryEntriesHttpPort` ~62; config ~12; extractions ~30.
- **Risks / notes:** `request` closes over `fetch` from the options object; passing it in keeps that binding. No mocks of this module.

### jini:packages/ui/src/features/memory/react/components/MemoryAdvancedModal.tsx
- **Over:** `MemoryAdvancedModal` 172 (file 176, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/react/components/MemoryAdvancedModal.test.tsx`, `src/features/memory/__tests__/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MemoryAdvancedModal` portal shell (backdrop, dialog, head) | modal chrome + open/host guard |
| B | first `<details className="library-group memory-advanced-card">` (MEMORY.md index textarea + Reset/Save row) | raw index editor |
| C | `treeFolders.length > 0 ? (<details ...>` block | technical memory-tree view |
| D | body of `treeFolders.map((folder) => { ... })` | one folder card with its child rows |

- **Splits** (same file, sub-components at module level above `MemoryAdvancedModal`, in this order; each calls `const t = useT();` itself like the parent; JSX moved verbatim incl. inline styles):
  1. SUB-COMPONENT `MemoryTreeFolderCard({ folder, nodes, onStartEdit }: MemoryTreeFolderCardProps): JSX.Element` ← the JSX returned inside `treeFolders.map` (the `<div key={folder.id} className="library-card" ...>` element, minus `key`), with the local `children` renamed `nodes` (a prop named `children` would collide with React's). Props: `folder: MemoryTreeNode; nodes: MemoryTreeNode[]; onStartEdit: (id: string) => void`. The parent map keeps `const children = treeChildren.get(folder.id) ?? [];` and renders `<MemoryTreeFolderCard key={folder.id} folder={folder} nodes={children} onStartEdit={onStartEdit} />`.
  2. SUB-COMPONENT `MemoryTreeDetails({ memoryTree, treeFolders, treeChildren, onStartEdit }: MemoryTreeDetailsProps): JSX.Element` ← the `<details ...>` of unit C (the `treeFolders.length > 0 ? ... : null` guard stays in the parent).
  3. SUB-COMPONENT `MemoryIndexEditorDetails({ index, indexDraft, onIndexDraftChange, onSaveIndex, busy }: MemoryIndexEditorDetailsProps): JSX.Element` ← unit B's `<details>` verbatim.
  4. `MemoryAdvancedModal` keeps `useT`, the `if (!open || !modalHost) return null;` guard, `createPortal(...)`, backdrop (with its "why" comment on `onMouseDown`), dialog, head, body/stack, and renders B and C.
- **Importers to update:** none (no exports move; sub-components are module-private).
- **After:** file ~185; `MemoryAdvancedModal` ~45; `MemoryIndexEditorDetails` ~55; `MemoryTreeDetails` ~22; `MemoryTreeFolderCard` ~50.
- **Risks / notes:** pure JSX lift; DOM order and classNames unchanged so tests' queries keep working. No mocks of this file.

### jini:packages/ui/src/features/memory/react/components/MemoryConnectedPanel.tsx
- **Over:** file 520 lines · `MemoryConnectedPanel` 153
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/react/components/MemoryConnectedPanel.test.tsx`, `src/features/memory/__tests__/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `Translate`, `ConnectorRowContext`, `ConnectorRowState`, `isStatusResolved`, `connectorRowState`, `connectorHint`, `connectButtonLabel`, `MemoryConnectButton`, `MemoryConnectorPicker`, `MemoryConnectorRow`, `MemoryConnectorRunBar` + the `<div className="memory-connector-workbench">` JSX in `MemoryConnectedPanel` | connector picker workbench (choose/connect apps, run scan) |
| B | `MemoryConnectedSummary`, `MemorySuggestionCard`, `MemorySuggestionPanel`, `MemoryConnectorDiagnostics`, `MemoryScanHistory` | summary, suggestion review, diagnostics, history — stay |
| C | `MemoryConnectedPanel` | panel composition — stays |

- **Splits** (in order):
  1. NEW `MemoryConnectedPanel-connector-picker.tsx` — job: the connector picker workbench. Moves (verbatim, same order): `Translate`, `ConnectorRowContext`, `ConnectorRowState`, `isStatusResolved`, `connectorRowState`, `connectorHint`, `connectButtonLabel`, `MemoryConnectButton`, `MemoryConnectorPicker`, `MemoryConnectorRow`, `MemoryConnectorRunBar`. Adds SUB-COMPONENT `MemoryConnectorWorkbench(props: MemoryConnectorWorkbenchProps): JSX.Element` ← the `<div className="memory-connector-workbench">…</div>` element from `MemoryConnectedPanel`'s return, verbatim (calls `const t = useT();`). Props (destructured): `connectorLoadError: string | null; selectedConnectedConnectorIds: string[]; memoryConnectors: Connector[]; rowContext: ConnectorRowContext; toggleConnectorSelection: (connectorId: string) => void; onConnectMemoryConnector: (connectorId: string) => void; enabled: boolean; connectorExtracting: boolean; connectorSaving: boolean; connectedCount: number; connectorScanLabel: string; onSuggestConnectorMemory: () => void` (body uses `context={rowContext}` as before). Exports: `ConnectorRowContext` (type), `MemoryConnectorWorkbench`. Imports: `Connector`, `ConnectorStatusMap` types, `ConnectorLogo`, `Icon`, `useT`. Header comment: copy the original header's sentence about `ConnectorLogo` (the "`ConnectorLogo` is `@jini-ai/ui`'s own … before handing `logoUrl` in." paragraph tail) into the new file's header; keep it in the original too only if `ConnectorLogo` is still referenced there (it is not — move it). Imports nothing from the original.
  2. Original: remove now-unused imports (`ConnectorLogo`, `ConnectorStatusMap` if unused — it is still used in the props type, keep it); import `{ MemoryConnectorWorkbench, type ConnectorRowContext }` from `./MemoryConnectedPanel-connector-picker.js`.
  3. TYPE in original: lift the inline props type of `MemoryConnectedPanel` to `interface MemoryConnectedPanelProps` (module level, above it; keep the `nowClock` doc comment on its field). Signature becomes `export function MemoryConnectedPanel({ ...same destructuring... }: MemoryConnectedPanelProps)`.
  4. SUB-COMPONENT `MemoryConnectorOutcome({ connectorStatus, connectorError, connectorAttempts, connectorContextBytes, connectorExtractions, nowClock, onOpenPreview, onDeleteExtraction }: MemoryConnectorOutcomeProps): JSX.Element` in the original, above `MemoryConnectedPanel` ← the four trailing blocks of the return from `{connectorStatus ? (` through the `{connectorExtractions.length > 0 ? (<MemoryScanHistory …/>) : null}` block, wrapped in a fragment `<>…</>` (no extra DOM element).
- **Importers to update:** none (moved names were module-private; `MemoryConnectedPanel` stays in place; package index unchanged).
- **After:** original ~345; `MemoryConnectedPanel` ~85; new file ~200 (`MemoryConnectorWorkbench` ~45).
- **Risks / notes:** DOM order unchanged (summary → workbench → suggestions → outcome blocks). No `vi.mock` of this file. No cycle: new file imports nothing from the original; `ConnectorRowContext` lives in the new file and the original imports the type.

### jini:packages/ui/src/features/memory/react/components/MemoryManualEditor.tsx
- **Over:** `MemoryManualEditor` 200 (file 207, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/react/components/MemoryManualEditor.test.tsx`, `src/features/memory/__tests__/react/hooks/useMemoryEntries.test.tsx`, `src/features/memory/__tests__/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `<div className="memory-source-summary">` + flash pill | tab header (summary, New button, flash) — stays |
| B | `{!editing.id ? (<div ...> {t('Start from')} ... STARTERS.map ...)` | starter-template picker for a new draft |
| C | the column `<div>` holding Name / Type / Description / Details fields | draft field inputs |
| D | the footer `<div>` with hint + Cancel / Save-or-Create buttons | form actions |
| E | `editing ? (<div ref={editorRef} className="library-card" ...>` wrapper | form card shell — stays, renders B/C/D |

- **Splits** (same file, sub-components at module level above `MemoryManualEditor`, in this order; each that renders text calls `const t = useT();`; JSX verbatim incl. inline styles):
  1. SUB-COMPONENT `MemoryStarterPicker({ draftId, onEditingChange }: MemoryStarterPickerProps): JSX.Element` ← unit B's inner `<div>` (the `!editing.id` guard stays in the parent). Uses `id: draftId` where it used `editing.id` (always `undefined`/falsy there — keep the expression `id: draftId` so behavior is identical). Props: `draftId: DraftEntry['id']; onEditingChange: (draft: DraftEntry) => void`.
  2. SUB-COMPONENT `MemoryDraftFields({ editing, onEditingChange, editorNameRef }: MemoryDraftFieldsProps): JSX.Element` ← unit C. Computes `const typeLabel = useMemo(() => memoryTypeLabels(t), [t]);` itself (move that line out of the parent — only C reads it). Props: `editing: DraftEntry; onEditingChange: (draft: DraftEntry) => void; editorNameRef: MutableRefObject<HTMLInputElement | null>`.
  3. SUB-COMPONENT `MemoryDraftActions({ isExisting, canSave, onCancel, onSave }: MemoryDraftActionsProps): JSX.Element` ← unit D. Parent passes `isExisting={Boolean(editing.id)}` and `canSave={!busy && Boolean(editing.name.trim())}`; inside: `disabled={!canSave}` and `{isExisting ? t('Save') : t('Create')}`. (Equivalent to `busy || !editing.name.trim()` / `editing.id ? ...`.)
  4. `MemoryManualEditor` keeps `t`, `flashLabel`, unit A, and E's wrapper rendering 1–3.
- **Importers to update:** none (no exports move).
- **After:** file ~215; `MemoryManualEditor` ~65; `MemoryStarterPicker` ~45; `MemoryDraftFields` ~70; `MemoryDraftActions` ~30.
- **Risks / notes:** `editorNameRef` must stay on the Name `<input>` (focus effect in useMemoryEntries targets it). `editorRef` stays on the card wrapper in the parent. No mocks of this file.

### jini:packages/ui/src/features/memory/react/hooks/useMemoryConfig.hooks.ts
- **Over:** `useMemoryConfig` 130 (file 204, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/react/hooks/useMemoryConfig.test.ts`, `src/features/memory/__tests__/react/host-ports.test.tsx`, `src/features/memory/__tests__/dependencies.test.ts`, `src/features/memory/__tests__/index.test.ts`, `src/features/memory/__tests__/react/hooks/useMemoryEntries.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `PendingConfigWrite`, `ConfigWriteQueue`, `newConfigWriteQueue`, `hasUnsettledConfigWrite`, `enqueueConfigWrite` | per-setting write queue — stays |
| B | `useMemoryConfig`: `enabled`, `error`, `enabledConfirmedRef`, `enabledQueueRef`, `hydrationGuardRef`, `captureHydrationRevision`, `hydrate`, `onToggleEnabled` | master toggle + hydration — stays |
| C | `useMemoryConfig`: `chatExtractionEnabled`/`profileEnabled`/`rewriteEnabled`/`verifyEnabled` states, `hookConfirmedRef`, `hookQueuesRef`, `setters`, `onToggleHook`, `hookFlags`, the four per-hook `if (!hasUnsettledConfigWrite(hookQueuesRef.current.<key>))` blocks in `hydrate` | the four per-hook flag toggles |

- **Splits:**
  1. SUB-HOOK `useMemoryHookFlagToggles({ port, hydrationGuardRef, setError }: UseMemoryHookFlagTogglesInput): MemoryHookFlagToggles` in the same file, above `useMemoryConfig`. Input: `port: MemoryConfigPort; hydrationGuardRef: MutableRefObject<ReturnType<typeof createAsyncCommitGuard>>; setError: Dispatch<SetStateAction<string | null>>`. Return: `{ hookFlags: MemoryConfigController['hookFlags']; onToggleHook: MemoryConfigController['onToggleHook']; applyHydratedHookFlags: (next: Record<MemoryConfigFlagKey, boolean>) => void }`. Body, in order: the four `useState(true)` lines for `chatExtractionEnabled`, `profileEnabled`, `rewriteEnabled`, `verifyEnabled`; `const hookConfirmedRef = …`; `const hookQueuesRef = …`; NEW `const applyHydratedHookFlags = useCallback((next: Record<MemoryConfigFlagKey, boolean>) => { <the four per-hook if-blocks from hydrate, verbatim, in the same order: chatExtraction, profile, rewrite, verify> }, []);`; the `setters` memo (with its "Map each hook key…" comment); `onToggleHook`; `hookFlags`; `return { hookFlags, onToggleHook, applyHydratedHookFlags };`.
  2. `useMemoryConfig` keeps `enabled`, `error`, the big "Each toggle flips its own state optimistically…" comment + `enabledConfirmedRef`, `enabledQueueRef` (the comment explains both queues — keep it here and copy its first two sentences above `hookQueuesRef` in the sub-hook), `hydrationGuardRef` (+ comment), then calls `const { hookFlags, onToggleHook, applyHydratedHookFlags } = useMemoryHookFlagToggles({ port, hydrationGuardRef, setError });`, then `captureHydrationRevision`, `hydrate` (guard, `next`, the "A list response can have raced…" comment, the `enabledQueueRef` block, then `applyHydratedHookFlags(next);` — deps `[applyHydratedHookFlags]`), `onToggleEnabled`, `return { … }` unchanged.
- **Importers to update:** none (no export moves).
- **After:** file ~210; `useMemoryConfig` ~62; `useMemoryHookFlagToggles` ~72.
- **Risks / notes:** `hydrate`'s per-key order is preserved (enabled first, then the four hooks in the same order). `applyHydratedHookFlags` has `[]` deps (refs + stable setters) so `hydrate` stays stable. State declaration order shifts (hook flags now declared after `hydrationGuardRef`) — no behavior effect. `next` includes `enabled`; passing it to `applyHydratedHookFlags` is structurally fine (extra key ignored); if TS excess-property checks complain, pass `next` as is (it is a variable, not a literal, so no excess check).

### jini:packages/ui/src/features/memory/react/hooks/useMemoryEntries.hooks.ts
- **Over:** `useMemoryEntries` 254 (file 319, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/react/hooks/useMemoryEntries.test.tsx`, `src/features/memory/__tests__/react/hooks/useMemoryConfig.test.ts`, `src/features/memory/__tests__/dependencies.test.ts`, `src/features/memory/__tests__/index.test.ts`, `src/features/memory/__tests__/react/components/MemoryManualEditor.test.tsx`
- **Responsibility map** (all inside `useMemoryEntries`):

| unit | statements | job |
|---|---|---|
| A | `busy`, `busyOperationCountRef` (+comment), `beginBusy`, `endBusy` | overlapping-write busy counter |
| B | `rootDir`, `index`, `entries`, `loadError`, `memoryTree`, `reloadCommitGuardRef` (+comment), `reload`, `filter`, `filtered`, `treeFolders`, `treeChildren` | list/tree load + filtering |
| C | `previewId`, `previewBody`, `previewRequestTokenRef` (+comment), `openPreview` | entry preview |
| D | `editing`/`setEditingState`, `editingRevisionRef` (+comment), `setEditing`, `entrySaveInFlightRef`, `editorRef`, `editorNameRef`, `editingTarget`, `editRequestTokenRef`, the focus `useEffect` on `editingTarget`, `startEdit`, `startNew`, `cancelEdit`, `onSave` | create/edit draft + save |
| E | `indexDraft`, `indexSaveInFlightRef`, `onSaveIndex` | MEMORY.md index draft + save |
| F | `deletingEntryIdsRef`, `onDelete`, `onCopyPath` | stay in `useMemoryEntries` |

- **Splits** (same file, sub-hooks at module level above `useMemoryEntries`, in this order; statements verbatim with their comments; each `useCallback` keeps its exact deps array):
  1. SUB-HOOK `useBusyCounter(): { busy: boolean; beginBusy: () => void; endBusy: () => void }` ← unit A (no input — it takes none, so no input object).
  2. SUB-HOOK `useMemoryEntryList({ port, captureConfigHydrationRevision, hydrateConfig }: UseMemoryEntryListInput): MemoryEntryList` ← unit B. `MemoryEntryList = Pick<MemoryEntriesController, 'entries' | 'filtered' | 'memoryTree' | 'treeFolders' | 'treeChildren' | 'rootDir' | 'index' | 'filter' | 'setFilter' | 'reload'> & { loadError: string | null; setLoadError: Dispatch<SetStateAction<string | null>>; setIndex: Dispatch<SetStateAction<string>> }`. Input types from `MemoryEntriesPort` and `MemoryEntriesCoordination['captureConfigHydrationRevision' | 'hydrateConfig']`.
  3. SUB-HOOK `useMemoryEntryPreview({ port, setLoadError }: UseMemoryEntryPreviewInput): Pick<MemoryEntriesController, 'previewId' | 'previewBody' | 'openPreview'>` ← unit C.
  4. SUB-HOOK `useMemoryEntryEditor({ port, openEditor, closeEditor, fireFlash, setLoadError, reload, beginBusy, endBusy }: UseMemoryEntryEditorInput): Pick<MemoryEntriesController, 'editing' | 'setEditing' | 'editorRef' | 'editorNameRef' | 'startEdit' | 'startNew' | 'cancelEdit' | 'onSave'>` ← unit D.
  5. SUB-HOOK `useMemoryIndexDraft({ port, setIndex, setLoadError, fireFlash, beginBusy, endBusy }: UseMemoryIndexDraftInput): Pick<MemoryEntriesController, 'indexDraft' | 'setIndexDraft' | 'onSaveIndex'>` ← unit E.
  6. `useMemoryEntries` keeps: `coord` destructure; calls in order `useBusyCounter()`, `useMemoryEntryList(...)`, `useMemoryEntryPreview(...)`, `useMemoryEntryEditor(...)`, `useMemoryIndexDraft(...)` (destructure each result into the same local names used today); then `deletingEntryIdsRef`, `onCopyPath`, `onDelete` verbatim; then the same `return { … }` (same 28 keys, same order).
- **Importers to update:** none (no exports move).
- **After:** file ~385; `useMemoryEntries` ~80; `useMemoryEntryEditor` ~90; `useMemoryEntryList` ~60; others ≤ 35.
- **Risks / notes:** hook/state declaration order changes (e.g. `editing` now declared after the list state) — no behavior effect. The focus effect must stay in the same sub-hook as `editorRef`/`editorNameRef`/`editingTarget`. `reload` must be the same stable callback passed to `useMemoryEntryEditor` (it is: defined in the list sub-hook with unchanged deps). If `useMemoryEntryEditor` lands over 100 in `--check`, move `onSave` and `entrySaveInFlightRef` back into `useMemoryEntries` (sub-hook then also returns `editingRevisionRef`) — main stays < 100. No `vi.mock` of this file.

### jini:packages/ui/src/features/memory/react/hooks/useMemoryExtractions.hooks.ts
- **Over:** `useMemoryExtractions` 114 (file 137, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/react/hooks/useMemoryExtractions.test.tsx`, `src/features/memory/__tests__/react/hooks/useMemoryExtractions.store.test.ts`, `src/features/memory/__tests__/index.test.ts`
- **Responsibility map** (inside `useMemoryExtractions`):

| unit | statements | job |
|---|---|---|
| A | `extractions`, `loadError`, `storeRef`, `store` | history store + render mirror — stays |
| B | `isRefreshing`, `reloadGuard` (+ "Orders reloadExtractions()…" comment), `inFlightReloads` (+comment), `reloadExtractions` | ordered, counted reload of the history |
| C | `applyExtractionEvent`, `onDeleteExtraction`, `clearExtractions`, `showNoProviderBanner`, `nowClock` + its effect, `connectorExtractions` | mutations + derived view — stay |

- **Splits:**
  1. SUB-HOOK `useExtractionHistoryReload({ port, store, setLoadError }: UseExtractionHistoryReloadInput): { isRefreshing: boolean; reloadExtractions: MemoryExtractionsController['reloadExtractions'] }` in the same file above `useMemoryExtractions` ← unit B verbatim (all comments incl. the `endReload` "Released at every exit point…" block), same deps `[port, store]`. Input: `port: MemoryExtractionsPort; store: ExtractionHistoryStore; setLoadError: Dispatch<SetStateAction<string | null>>`.
  2. `useMemoryExtractions` keeps unit A, then `const { isRefreshing, reloadExtractions } = useExtractionHistoryReload({ port, store, setLoadError });`, then unit C and the `return` unchanged.
- **Importers to update:** none.
- **After:** file ~145; `useMemoryExtractions` ~75; `useExtractionHistoryReload` ~38.
- **Risks / notes:** `isRefreshing` useState moves after `storeRef` — no behavior effect. `LOAD_ERROR_MESSAGE` is module-level, reachable from the sub-hook. No `vi.mock` of this file.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/ui/src/features/memory/dependencies.ts packages/ui/src/features/memory/react/components/MemoryAdvancedModal.tsx packages/ui/src/features/memory/react/components/MemoryConnectedPanel.tsx packages/ui/src/features/memory/react/components/MemoryManualEditor.tsx packages/ui/src/features/memory/react/hooks/useMemoryConfig.hooks.ts packages/ui/src/features/memory/react/hooks/useMemoryEntries.hooks.ts packages/ui/src/features/memory/react/hooks/useMemoryExtractions.hooks.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
