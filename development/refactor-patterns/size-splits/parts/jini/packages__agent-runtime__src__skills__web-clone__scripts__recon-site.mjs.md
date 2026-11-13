### jini:packages/agent-runtime/src/skills/web-clone/scripts/recon-site.mjs
- **Over:** `collectSignals` 260 · `<arg of page.evaluate>` 258
- **Phase:** now · **Batch:** size-20
- **Tests:** `src/skills/web-clone/scripts/__tests__/recon-site.unit.test.mjs`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `usage`, `ARG_SPEC`, `parseArgs`, `summarizeFlags`, summary line builders, `summaryMarkdown`, `scrollThroughPage`, `captureWidth`, `recon`, `main` | CLI + summary |
| B | the `page.evaluate(() => { … })` callback: ~30 nested one-concern helpers (`sheetRules`, `sectionOf`, CSS `url()` scanner, `fontFaceOf`, `loadedResources`, `paletteOf`, `motionSignals`, `frameworkSignals`, `countSignals`, `documentSignals`) + the final assembly | collect page signals in the browser |

- **Splits:** none planned. The callback is serialized by Playwright (`fn.toString()`) and run in the page, so it cannot reference module-level helpers; the file's own comment (~L111) says so: "it must stay self-contained: every helper is nested in the callback (Playwright serializes only the function itself), and each nested helper keeps one concern". Each nested helper is already ≤ 18 lines. The only behaviour-neutral alternative would be shipping helpers as a separate init script via `page.addInitScript` / string injection, which changes how the page is instrumented — out of scope for a size split.
- **Importers to update:** none.
- **After:** unchanged (file 426; function 260).
- **Risks / notes:** splitting the callback into module-level functions would throw `ReferenceError` in the browser at run time and the unit test (which stubs `page.evaluate`) may not catch it.
- **Owner exception candidate:** `collectSignals` / its `page.evaluate` callback — must be one self-contained serialized function; internal helpers already split by concern.
