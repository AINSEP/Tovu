### jini:packages/agentic/src/core/dom/dom-page-driver.ts
- **Over:** `createDomPageDriver` 171
- **Phase:** now · **Batch:** size-32
- **Tests:** `src/core/dom/__tests__/dom-page-driver.test.ts`, `src/core/dom/__tests__/dom-page-driver-elements.test.ts`, `src/core/dom/__tests__/dom-page-driver-private.test.ts`, `src/core/dom/__tests__/dom-page-driver-conversion.regression.test.ts`, `src/core/dom/__tests__/dom-page-driver-l183.pin.test.ts`, `src/core/dom/__tests__/visitor-publication.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | field/label/state readers, `publicTextOf`, `describe`, `findSelectableOption`, `labelledControls`, `assert*Control`, driver interfaces, `fillEditableRegion`, `currentAgentPage`, `publicationState`, `nativeSubmitter` | DOM readers + guards |
| B handle resolution | closures `ambiguousHandleError`, `controlOf` | handle → control |
| C control effects | method bodies of `settle`, `highlight`, `fill`, `selectOption` (after their `find`/`controlOf` line) | perform one effect on a resolved element |
| D (stays) | `pageOf`, `highlights`, `findAll`, `find`, `publicationFilter`, the returned method table (`findElements`, `listPages`, `describeField`, `describeState`, `scrollTo`, `click`, `navigate`) | the PageDriver API |

- **Splits** (module level, placed after `assertModalControl` and before the driver interfaces; bodies verbatim, all comments move):
  1. `ambiguousHandleError({ handle, count }: AmbiguousHandleErrorInput): Error` (pure). Call sites (`find`, `describeState`) pass an object.
  2. `controlOfElement({ root, element }: ControlOfElementInput, { action = 'read' }: ControlOfElementOptions = {}): Element` ← `controlOf` body (its JSDoc + inline comments move). The closure stays as a one-line adapter `const controlOf = (element: Element, action = 'read'): Element => controlOfElement({ root, element }, { action });` so its 6 call sites don't change.
  3. `settleDom(): Promise<void>` ← the `await new Promise<void>(…)` body of `settle`; method becomes `await settleDom();`. (Zero-arg helper, no inputs to wrap.)
  4. `highlightElement({ element, handle, durationMs, highlights }: HighlightElementInput): void` ← `highlight` statements after `const element = find(handle, 'highlight');` (the refusal comment moves with the `instanceof` check). `highlights` typed as the existing map's type (export a `type HighlightMarkers = Map<string, { timer: …; restore: … }>` alias next to it, using the map's current generic args).
  5. `fillControl({ control, handle, text }: FillControlInput): void` ← `fill` statements after `const control = …`.
  6. `selectControlOption({ control, handle, option }: SelectControlOptionInput, { selected = true }: SelectControlOptionOptions = {}): void` ← `selectOption` statements after `const control = …`.
- **Importers to update:** none (no export moves).
- **After:** `createDomPageDriver` ~95; file ~465.
- **Risks / notes:** `find` must still call the adapter `controlOf` (it is used inside `publicationFilter`'s `fieldOf` before the filter exists — keep declaration order: `findAll`, `find`, `controlOf`, `publicationFilter`). Error message text in `ambiguousHandleError` is asserted by tests — keep the concatenation byte-identical and the `console.warn`. If `createDomPageDriver` is still > 100, also lift `describeState`'s statements after `const control = controlOf(element);` into `describeElementState({ element, control, filtered })`.
