### jini:packages/chat/src/embed-widget/vanilla/index.ts
- **Over:** `mountVanillaChat` 256
- **Phase:** now · **Batch:** size-11
- **Tests:** `src/embed-widget/vanilla/__tests__/widget.test.ts`, `src/embed-widget/vanilla/__tests__/state.test.ts` (smoke), `src/embed-widget/vanilla/__tests__/state.edges.test.ts` (smoke). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `ARIA_LABEL`, re-exports, `VanillaChatCopy`, `MountVanillaChatArgs`, `svgIcon` | contract |
| B element factory | closures `node`, `button` | create classed elements/buttons |
| C DOM build | statements `const shell = node(…)` through `element.replaceChildren(shell);` (~L68-137) | build the panel tree with ARIA |
| D chrome | `renderChrome` | reflect open/busy/error on chrome |
| E rows | `rows`, `liveReplies`, `createRow`, `renderRow`, `announce`, `announceSettledReplies`, `renderRows` | render message rows + live announcements |
| F (stays) | `wasOpen`, `initialized`, `focusEntry`, `moveFocus`, `renderFocus`, `latestState`, `framePending`, `cancelRenderFrame`, `render`, `controller`, `listeners`, `listen`, init, return | render scheduling + lifecycle |
| G events | from `suggestionEntries.forEach(… listen(button, 'click'…` through `listen(element, 'jini-chat-open', …)` (~L243-301) incl. `dismissConfirmation`, `onEscape`, `trapTab` | wire user input to the controller |

- **Splits** (module level, above `mountVanillaChat`, below `svgIcon`; bodies verbatim, comments move):
  1. `createVanillaElementFactory({ document }: CreateVanillaElementFactoryInput): VanillaElementFactory` returning `{ node, button }` (the two closures verbatim; export nothing).
  2. `buildVanillaChatDom({ document, element, copy, ids, suggestions, factory }: BuildVanillaChatDomInput): VanillaChatDom` ← unit C; returns an object with every node the rest uses (`shell, fab, panel, reset, close, confirmation, confirm, keep, log, status, announcements, error, form, input, send, stop, greeting, suggestions, suggestionEntries, suggestionButtons`). `ids` = `args.ids`, `suggestions` = `args.suggestions`. Mount destructures it with the same names, so later code is unchanged.
  3. `renderVanillaChrome({ dom, copy, state }: RenderVanillaChromeInput): void` ← `renderChrome` body; mount keeps `const renderChrome = ({ state }) => renderVanillaChrome({ dom, copy, state });`.
  4. `createVanillaRows({ dom, node, renderMarkdown }: CreateVanillaRowsInput): { renderRows(input: { state: VanillaChatState }): void; liveReplies: Set<string> }` ← unit E (the "Bound the additions-only…" and "A dedicated additions-only region…" comments move). `render` uses the returned `liveReplies` and `renderRows`.
  5. `wireVanillaChatEvents({ dom, document, element, copy, controller, renderChrome, focusEntry, listen }: WireVanillaChatEventsInput): void` ← unit G verbatim (the `trapTab` comment moves). `listen` and `listeners` stay in mount (the return's destroy uses `listeners`). Listener registration order unchanged.
- **Importers to update:** none (no export moves; file is the `./vanilla` package entry and keeps its exports).
- **After:** `mountVanillaChat` ~75; `buildVanillaChatDom` ~75; `wireVanillaChatEvents` ~55; `createVanillaRows` ~40; file ~320.
- **Risks / notes:** `element.replaceChildren(shell)` must still happen before `rows`/controller creation (inside the build helper, same position). `wasOpen`/`initialized` stay `let`s in mount because `moveFocus`/`renderFocus`/`render` and the final `initialized = true` share them. `announcements.firstElementChild!` is existing code moved verbatim.
