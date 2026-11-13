# Terra job size-40: split 6 Jini file(s) by responsibility (size limits)

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
### jini:packages/ui/src/features/viewer-shell/react/hooks/useMarkdownScrollSync.ts
- **Over:** `useMarkdownScrollSync` 126 (file 147)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/features/viewer-shell/__tests__/react/hooks/useMarkdownScrollSync.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `clearProgrammaticScrollSoon`, `getEditorBlockOffsets`, `applyScrollSync`, `scheduleScrollSync` | compute and apply one frame-batched pane sync |
| B | refs, `blockLines`, invalidation/cleanup effects, `shouldIgnoreScroll`, scroll handlers, `activatePane`, resync effect | pane event wiring (stays) |

- **Splits:**
  1. SUB-HOOK (same file, above) `useScrollSyncScheduler({ mode, sourceText, editorRef, previewRef, previewSelector, blockLines, editorBlockOffsetsRef, scrollSyncFrameRef, programmaticScrollClearFrameRef, pendingScrollSyncRef, programmaticScrollRef }: UseScrollSyncSchedulerInput): (sourcePane: MarkdownScrollPane, targetPane: MarkdownScrollPane) => void` (use `scheduleScrollSync`'s exact existing parameter list) ← the four `useCallback`s of unit A in order, with deps verbatim; returns `scheduleScrollSync`.
- **Importers to update:** none.
- **After:** `useMarkdownScrollSync` ~62; file ~165.
- **Risks / notes:** refs stay declared in the main hook (the cleanup and resync effects need them) and are passed in. useCallback slot order unchanged (the four were contiguous).

### jini:packages/ui/src/react/components/CustomSelect.tsx
- **Over:** `CustomSelect` 101 (file 493 — any in-file helper would push it past 500, so a file split comes first)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/__tests__/components/CustomSelect.test.tsx`, `packages/ui/src/react/__tests__/components/default-agent-handles.test.tsx`, `packages/ui/src/react/__tests__/components/agent-handles-driver.integration.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `CustomSelectOriginTheme`, `resolveCustomSelectSchemeAttributes`, `resolveCustomSelectOriginTheme`, `useCustomSelectOriginTheme` | theme of the place the menu opened from |
| B | types, constants, pure geometry/keyboard helpers, `useCustomSelect` | select behaviour (stays) |
| C | `customSelectMenuStyle`, `mountCustomSelectMenu`, `CustomSelectMenuOptions`, `CustomSelect`, `CustomSelectOptionButton` | render (stays) |

- **Splits:**
  1. NEW `CustomSelect-origin-theme.ts` — job: resolve the opener's theme/scheme. Moves unit A with all comments (the long block above `useCustomSelectOriginTheme` included). Exports `CustomSelectOriginTheme`, `resolveCustomSelectOriginTheme`, `useCustomSelectOriginTheme`. Imports nothing from the original.
  2. SUB-COMPONENT `CustomSelectMenu` (same file, above `CustomSelect`) ← the `const menu = (` JSX block; plain props = the names it reads (`menuRef`, `idBase`, `onMenuKeyDown`, `originTheme`, `originPage`, `agentProps`, `className`, `portal`, `menuClassName`, `ariaLabel`, `position`, `menuHeader`, `base`, `options`, …; take the exact list from the block). `CustomSelect` keeps `const menu = <CustomSelectMenu … />`.
- **Importers to update:** `packages/ui/src/react/__tests__/components/CustomSelect.test.tsx` (`resolveCustomSelectOriginTheme` → `../../components/CustomSelect-origin-theme.js`); any barrel: `rg -n "CustomSelectOriginTheme|resolveCustomSelectOriginTheme|useCustomSelectOriginTheme" packages/ui/src --glob '!**/CustomSelect*.ts*'` (found only the test today).
- **After:** CustomSelect.tsx ~455; `CustomSelect` ~75; new file ~50.
- **Risks / notes:** check `packages/ui/src/react/index.ts`/components barrel for `export * from './components/CustomSelect.js'` — if present, add `export * from './components/CustomSelect-origin-theme.js'` there (barrel is the public entry; keeps package API).

### jini:packages/ui/src/react/components/OnboardingDropdown.tsx
- **Over:** `useOnboardingDropdown` 102 (file 411)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/__tests__/components/OnboardingDropdown.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | outside-pointer `useEffect(() => {` (~L282, uses `open`, `rootRef`, `setOpen`) | dismiss on outside press |
| B | open-event `useEffect` (~L311) + `toggleOpen` | one-open-dropdown-at-a-time broadcast |
| C | rest | dropdown state + derived values (stays) |

- **Splits** (same file, directly above `useOnboardingDropdown`):
  1. SUB-HOOK `useDismissOnOutsidePress({ open, rootRef, setOpen }: UseDismissOnOutsidePressInput): void` ← unit A effect + deps verbatim.
  2. SUB-HOOK `useExclusiveOpen({ dropdownIdRef, setOpen }: UseExclusiveOpenInput): () => void` ← unit B (effect then `toggleOpen`), returns `toggleOpen`.
  Call sites stay in the same place relative to the query-reset effect (A, then query-reset effect, then B).
- **Importers to update:** none (no export moves).
- **After:** `useOnboardingDropdown` ~68; file ~430.
- **Risks / notes:** the hook stays in the component file: it is the exported `useOnboardingDropdown` prop seam typed into `OnboardingDropdownBaseProps` (`typeof useOnboardingDropdown`), so moving it to a `.hooks.ts` would create a type cycle (rule 5). Component already takes props only.

### jini:packages/ui/src/react/components/TooltipLayer.tsx
- **Over:** `useTooltipLayer` 208 (file 315)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/__tests__/components/TooltipLayer.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `suppressedTitleRef`, `restoreNativeTitle`, `suppressNativeTitle` | hide/restore the native `title` while our tip shows |
| B | `updatePosition`, `scheduleUpdatePosition`, `useLayoutEffect(() => {` (~L222) | measure + place the open tip |
| C | the document-listener `useEffect(() => {` (~L250, 87 lines) | decide show/hide from pointer, touch, focus, scroll |
| D | refs, `state`, `hideTooltip`, `hideTooltipForActivation`, `showTooltip`, cleanup + auto-hide effects, return | layer core (stays) |

- **Splits** (same file, above `useTooltipLayer`, in order):
  1. SUB-HOOK `useNativeTitleSuppression(): { restoreNativeTitle, suppressNativeTitle }` ← unit A.
  2. SUB-HOOK `useTooltipPositioning({ tooltipRef, rafRef, openTargetRef, state, setState }: UseTooltipPositioningInput): { scheduleUpdatePosition }` ← unit B (both callbacks + the layout effect).
  3. SUB-HOOK `useTooltipTriggers({ lastInputRef, touchTapRef, openTargetRef, showTooltip, hideTooltip, hideTooltipForActivation, suppressNativeTitle, scheduleUpdatePosition }: UseTooltipTriggersInput): void` ← unit C verbatim (keep the "Touch has no hover…" comment on `touchTapRef` in the main hook where the ref stays).
- **Importers to update:** none.
- **After:** `useTooltipLayer` ~62; `useTooltipTriggers` ~90; file ~335.
- **Risks / notes:** effect order: positioning layout effect (B) must stay declared before the cleanup effect (~L228), the auto-hide effect (~L235) and the listener effect — call `useTooltipPositioning` where `updatePosition` was. `useNativeTitleSuppression` is called where `restoreNativeTitle` was (before `hideTooltip`).

### jini:packages/ui/src/react/hooks/useResizableSplitPane.ts
- **Over:** `useResizableSplitPane` 209 (file 279)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/hooks/__tests__/useResizableSplitPane.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `const storageKey = options.storageKey ?? …` … `minNormalContainerWidth` | resolve options with defaults |
| B | `resizeStateRef`, `pointerCleanupRef`, `pointerFrameRef`, `pendingPointerClientXRef`, `finishResize`, unmount `useEffect(() => () => finishResize(false)…` | end a drag gesture |
| C | `onHandlePointerDown` (66) | run a pointer drag |
| D | container-fit `useLayoutEffect(() => {` (~L197) | clamp to container width |
| E | `onHandleKeyDown` | keyboard resize |
| F | width state/refs, `renderPreferredWidth`, `applyWidth`, sync effects, `onHandleBlur`, return | core (stays) |

- **Splits** (same file, above the hook):
  1. HELPER `resolveSplitPaneOptions({ options }: ResolveSplitPaneOptionsInput): ResolvedSplitPaneOptions` ← unit A (returns the 8 names).
  2. SUB-HOOK `useFinishResize({ setIsResizing, renderPreferredWidth, preferredWidthRef, storageKey, minWidth, maxWidthOption }: UseFinishResizeInput): { finishResize, resizeStateRef, pointerCleanupRef, pointerFrameRef, pendingPointerClientXRef }` ← the four refs + `finishResize` (refs created here; unmount effect stays in the main hook at its old place).
  3. SUB-HOOK `useHandlePointerDown({ containerRef, pointerCleanupRef, setIsResizing, resizeStartPreferredWidthRef, preferredWidthRef, resizeStateRef, applyWidth, pointerFrameRef, pendingPointerClientXRef, widthRef, finishResize, renderPreferredWidth }: UseHandlePointerDownInput): (event: <existing param type>) => void` ← unit C.
  4. SUB-HOOK `useFitToContainer({ containerRef, minNormalContainerWidth, minSecondaryWidth, maxWidthOption, handleWidth, maxWidthRef, setSecondaryMinWidth, setMaxWidth, renderPreferredWidth, preferredWidthRef }: UseFitToContainerInput): void` ← unit D.
  5. SUB-HOOK `useHandleKeyDown({ containerRef, keyboardStep, widthRef, minWidth, maxWidthRef, applyWidth, storageKey, maxWidthOption }: UseHandleKeyDownInput): (event: <existing type>) => void` ← unit E.
- **Importers to update:** none (`readSavedWidth`/`saveWidth` stay).
- **After:** `useResizableSplitPane` ~85; `useHandlePointerDown` ~70; file ~320.
- **Risks / notes:** ref creation moves (B's refs are now created after `renderPreferredWidth`/`applyWidth`; they are only read at event time) — keep `useFinishResize` called exactly where `finishResize` was. Effect/layout-effect order must stay: width sync, maxWidth sync, fit layout effect, unmount flush.

### jini:packages/ui/src/react/mcp-ui/useMcpUiHost.ts
- **Over:** `useMcpUiHost` 116 (file 155)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/mcp-ui/__tests__/useMcpUiHost.test.tsx`, `packages/ui/src/react/mcp-ui/__tests__/McpUiHost.height.test.tsx` (vi.mocks `../useMcpUiHost.js` with `importOriginal` and overrides `useMcpUiHost` — new helpers stay in the same module and are not exported, so the mock still covers the hook)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `handleCallTool`, `handleOpenLink` | answer the View's tool-call and open-link requests |
| B | rest (state, watchdog, size/error handlers, teardown, `rendererProps`) | host protocol core (stays) |

- **Splits:**
  1. SUB-HOOK (same file, above) `useViewRequestHandlers({ optionsRef, emit }: UseViewRequestHandlersInput): { handleCallTool, handleOpenLink }` ← both `useCallback`s verbatim (typed `NonNullable<AppRendererProps['onCallTool']>` / `['onOpenLink']`). Called where `handleCallTool` was.
- **Importers to update:** none.
- **After:** `useMcpUiHost` ~80; file ~165.
- **Risks / notes:** file header comments are long; none move.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/ui/src/features/viewer-shell/react/hooks/useMarkdownScrollSync.ts packages/ui/src/react/components/CustomSelect.tsx packages/ui/src/react/components/OnboardingDropdown.tsx packages/ui/src/react/components/TooltipLayer.tsx packages/ui/src/react/hooks/useResizableSplitPane.ts packages/ui/src/react/mcp-ui/useMcpUiHost.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
