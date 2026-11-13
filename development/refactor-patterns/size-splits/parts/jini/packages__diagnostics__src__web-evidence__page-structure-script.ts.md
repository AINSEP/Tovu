### jini:packages/diagnostics/src/web-evidence/page-structure-script.ts
- **Over:** `collectPageStructure` 275
- **Phase:** now (JINI 275) · **Batch:** size-39
- **Tests:** `src/web-evidence/__tests__/web-evidence-structure.test.ts`, `src/__tests__/package-surface.integration.test.ts` (package `@jini-ai/diagnostics`)
- **Responsibility map:** (all of these are closures nested inside `collectPageStructure`)

| unit | nested declarations | job |
|---|---|---|
| A selectors | `terminalSegment`, `siblingSegment`, `selectorFor`, `textOf` | CSS path + text helpers |
| B names | `accessibleNameFrom*` (5), `accessibleNameOf` | accessible-name strategies |
| C collectors | `capped`, `LANDMARK_SELECTOR`, `IMPLICIT_ROLES`, `collectLandmarks`, `collectHeadings`, `collectImages`, `collectFormControls` | per-category evidence |
| D contrast | `parseColor`, `relativeLuminance`, `composite`, `effectiveBackground`, `CONTRAST_CANDIDATE_SELECTOR`, `ContrastSample`, `hasOwnSampleableText`, `isRenderedVisible`, `contrastSampleFor`, `collectContrastSamples` | contrast samples |
| E | `bodyText` … `return` | assemble the capture |

- **Splits:** none.
- **Importers to update:** none.
- **After:** unchanged (275).
- **Risks / notes:** the file header says in so many words that the function "CANNOT reference anything outside its own body … a 'cleanup' that hoists a helper out will fail at runtime, in the browser, with a `ReferenceError` no typechecker can see." `playwright-browser.ts` (~L206) ships it as `var __collect = ${collectPageStructure.toString()};`. Units A–D are clean responsibilities, but they can only move out if that expression builder also serializes each helper (one `toString()` per helper). That changes how the code is delivered, so it's the owner's call and not something for Terra.
- **Owner exception candidate:** this is a function serialized into the browser by design (`fn.toString()`, no outer scope allowed), so a size split can't happen without redesigning the injection in `playwright-browser.ts`.
