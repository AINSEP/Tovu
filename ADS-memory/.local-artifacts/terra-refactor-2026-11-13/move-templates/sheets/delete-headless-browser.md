id: DL-headless-browser-1   (template T-DELETE; written 2026-11-15 from Tovu 54dac1ff3 / Jini af2389793, refactor/terra; replaces delete-headless-browser.skip.md)
feature: website/platform/headless-browser
decision: DELETE lazy-browser.ts as a fold with moved bodies. Both real functions STAY in Tovu, each next to its only production caller's host binding:
  - importPlaywrightChromium is host module resolution of the Playwright vendor module: it belongs with playwrightModuleLoader in platform/headless-browser/playwright-loader.ts (Tovu binding). A vendor (Playwright) dependency may not enter a Jini domain package (COMMON rule 4); Jini already takes the loader as a port (openPlaywrightRenderBrowser({}, { moduleLoader })).
  - encodeJpeg is a 3-line call of the ImageCodecPort with the preview's quality policy; its one production caller is the Sites card preview capture, which already wraps it (resizeWithCodec). A Jini export (it would have to be @jini-ai/cms/media, the owner of ImageCodecPort; diagnostics may not import cms under rule 5) would add public API and a minor bump for all @jini-ai/* for one host caller. It moves into playwright-site-preview-capture.ts, exported (the relocated tests import it).
  - createLazyBrowser + 3 types were a re-export of @jini-ai/diagnostics/web-evidence/playwright (packages/diagnostics/package.json "./web-evidence/playwright" -> dist/web-evidence/playwright-browser.js, which does `export * from "./lazy-browser.js"` at src/web-evidence/playwright-browser.ts:24): the one production importer repoints. Its 4 Tovu tests test Jini code and are not all covered by the Jini twin test (double close, failed launch not cached, release with no idle/no launch are absent there), so they RELOCATE to Jini verbatim.
tovu_file: apps/website/src/platform/headless-browser/lazy-browser.ts | blob 5b9cee61219c96c255eddbe26727ad1ef2b38373
non_reexport_statements: 2 (importPlaywrightChromium lines 25-29, encodeJpeg lines 31-41); both have a moved_bodies row
why_dead: pass-through to @jini-ai/diagnostics/web-evidence/playwright (createLazyBrowser, ClosableBrowser, LazyBrowser, LazyBrowserTimers) + two host functions moved next to their callers
tovu_file_after: delete
file_after: -

other guarded files (blob at HEAD 54dac1ff3; any mismatch = SKIP):
  - apps/website/src/platform/headless-browser/playwright-loader.ts | blob ca0597e95c17fdf774bc8c6e78c8272ea3fcdd22
  - apps/website/src/platform/headless-browser/__tests__/lazy-browser.unit.test.ts | blob 0c14e966b5f5c77c7950468759f6becfac154450
  - apps/website/src/platform/headless-browser/__tests__/playwright-loader.unit.test.ts | blob f7d4fb3138aa54901f18b06e4f78ebae6f07b737
  - apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts | blob 576e4628b145b21cc3345c4e99e7a44f9b61528e
  - apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts | blob caea8700476c9873bc20147dc8784d54f5780e14
  - apps/website/src/features/web-screenshot/playwright-page-capture.ts | blob ba1f184591a277157fc760642ec4ca6996b7871a
  - apps/website/src/features/image-transform/__tests__/image-codec.boundary.test.ts | blob 964810992939e771c639a8893ab26143b127d2a4
  - Jini packages/diagnostics/src/web-evidence/lazy-browser.ts | blob 7e9cd8643c02c184efb33f77734d36ea162eb8ba (read-only guard: createLazyBrowser + LazyBrowserTimers exported from it)
  - Jini packages/diagnostics/src/web-evidence/__tests__/lazy-browser-owner.test.ts must NOT exist

moved_bodies:
  - importPlaywrightChromium -> apps/website/src/platform/headless-browser/playwright-loader.ts | append at end of file after one blank line | exported? yes | text: verbatim from tovu_file lines 25-29 (the line `/** Dynamic so a deployment without Playwright gets a rejected capture, not a boot failure. */` through the closing `}`)
  - destination import edits: playwright-loader.ts: none (playwrightModuleLoader is declared in the same file)
  - encodeJpeg -> apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts | before: "async function resizeWithCodec({ png, width, imageCodec }: { png: Buffer; width: number; imageCodec: ImageCodecPort }, _options = {}): Promise<Buffer> {" | exported? yes | text: verbatim from tovu_file lines 31-41 (the `/**` line through the closing `}`), followed by one blank line
  - destination import edits: playwright-site-preview-capture.ts: none (`import type { ImageCodecPort } from "@jini-ai/cms/media";` is already line 1; Buffer is a Node global)

census:                                    # python3 scripts/census.py /Users/la/Programming/tovu-codex-trial-terra apps/website/src/platform/headless-browser/lazy-browser.ts
  - apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts:26 | static | "#src/platform/headless-browser/lazy-browser"
  - apps/website/src/features/web-screenshot/playwright-page-capture.ts:3 | static | "#src/platform/headless-browser/lazy-browser"
  - apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts:8 | static | "../../../platform/headless-browser/lazy-browser.js"
  - apps/website/src/platform/headless-browser/__tests__/lazy-browser.unit.test.ts:7 | static | "../lazy-browser.js"
  - apps/website/src/features/image-transform/__tests__/image-codec.boundary.test.ts:6 | path-literal | "../../../platform/headless-browser/lazy-browser.ts"
reach_check:
  - rg -n --no-heading -F "platform/headless-browser/lazy-browser" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/platform/headless-browser/lazy-browser.ts'
    expected before the edit: the 4 census import lines above, the path literal, and the 2 comment_refs below. After the edit: nothing.
    (apps/admin/src/lib/agent-screenshot.ts:58 "Tovu's own existing headless-browser adapter" is a conceptual mention and stays; it does not match this pattern.)

importers:
  - apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts:26 | "import { createLazyBrowser, encodeJpeg } from \"#src/platform/headless-browser/lazy-browser\";" -> (delete the line)
  - apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts:27 | "import { openPlaywrightRenderBrowser } from \"@jini-ai/diagnostics/web-evidence/playwright\";" -> "import { createLazyBrowser, openPlaywrightRenderBrowser } from \"@jini-ai/diagnostics/web-evidence/playwright\";"
  - apps/website/src/features/web-screenshot/playwright-page-capture.ts:3 | "import { importPlaywrightChromium } from \"#src/platform/headless-browser/lazy-browser\";" -> "import { importPlaywrightChromium } from \"#src/platform/headless-browser/playwright-loader\";"
  - apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts:7 | "import { createPlaywrightSitePreviewCapture, createSitePreviewCaptureForHost, type PreviewBrowser, type PreviewBrowserLauncher } from \"../site-preview/playwright-site-preview-capture.js\";" -> "import { createPlaywrightSitePreviewCapture, createSitePreviewCaptureForHost, encodeJpeg, type PreviewBrowser, type PreviewBrowserLauncher } from \"../site-preview/playwright-site-preview-capture.js\";"
  - apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts:8 | "import { importPlaywrightChromium } from \"../../../platform/headless-browser/lazy-browser.js\";" -> (delete the line)
  - apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts:9 | "import { playwrightModuleLoader } from \"../../../platform/headless-browser/playwright-loader.js\";" -> "import { importPlaywrightChromium, playwrightModuleLoader } from \"../../../platform/headless-browser/playwright-loader.js\";"
folds: -
comment_refs:
  - apps/website/src/features/web-screenshot/playwright-page-capture.ts:10 | " * shared lazy-browser core (`platform/headless-browser/lazy-browser.ts`) the Sites card previews use." -> " * shared lazy-browser core (`createLazyBrowser`, `@jini-ai/diagnostics/web-evidence/playwright`) the Sites card previews use."
  - apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts:14-15 | " * The lazy launch/close lifecycle and the JPEG encode are the shared headless-capture core\n * (`platform/headless-browser/lazy-browser.ts`), which `web_screenshot_page` uses too." -> " * The lazy launch/close lifecycle is the shared headless-capture core (`createLazyBrowser`,\n * `@jini-ai/diagnostics/web-evidence/playwright`), which `web_screenshot_page` uses too; the JPEG\n * encode is {@link encodeJpeg} below."
path_literals:
  - apps/website/src/features/image-transform/__tests__/image-codec.boundary.test.ts:6 | "\"../../../platform/headless-browser/lazy-browser.ts\"" -> "\"../../sites/site-preview/playwright-site-preview-capture.ts\"" | why: encodeJpeg, the consumer this scan pinned, now lives there; that file imports no `sharp` (only comments mention it), so the assertion holds.
tests:
  - apps/website/src/platform/headless-browser/__tests__/lazy-browser.unit.test.ts | blob 0c14e966b5f5c77c7950468759f6becfac154450 | relocate blocks per relocations, then delete (git rm -q): lines 1-13 are imports + @file header only; every test block is relocated below.
  - apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts | blob caea8700476c9873bc20147dc8784d54f5780e14 | repoint import (importers rows above) + receives relocation R2
  - apps/website/src/platform/headless-browser/__tests__/playwright-loader.unit.test.ts | blob f7d4fb3138aa54901f18b06e4f78ebae6f07b737 | receives relocation R3
relocations:
  - R1 from apps/website/src/platform/headless-browser/__tests__/lazy-browser.unit.test.ts lines 14-82 (fakeTimers, fakeLaunch and the 4 createLazyBrowser tests, from `function fakeTimers() {` through the `});` that ends "release without idleCloseMs, or with nothing launched, schedules nothing") -> NEW Jini file packages/diagnostics/src/web-evidence/__tests__/lazy-browser-owner.test.ts | new file: header block JINI_TEST_HEADER below, then one blank line, then lines 14-82 verbatim | framework change: the header imports `test` from "vitest" instead of "node:test"; assertion lines unchanged
  - R2 from the same file lines 84-99 (the two `encodeJpeg ...` tests) -> apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts | append at end of file after one blank line | import edits: the line-7 row in importers (adds encodeJpeg); SharpImageTransformer, sharp, assert and test are already imported there | framework change: none
  - R3 from the same file lines 101-112 (the `importPlaywrightChromium resolves the host's Playwright adapter, ...` test) -> apps/website/src/platform/headless-browser/__tests__/playwright-loader.unit.test.ts | append at end of file after one blank line | import edits: "import { playwrightModuleLoader } from \"../playwright-loader.js\";" -> "import { importPlaywrightChromium, playwrightModuleLoader } from \"../playwright-loader.js\";" | framework change: none (that file already uses t.mock.module("playwright") at line 28; the runner passes --experimental-test-module-mocks)
why_moves:
  - lazy-browser.ts header lines 2-18: dropped, each idea already sits at a binding: "two owners, launch flags differ on purpose" = playwright-site-preview-capture.ts:59-60 (loopback-only, unsandboxed flags) and playwright-page-capture.ts header lines 12-18 + its `allowUnsandboxed` comment (sandbox on, egress guard); "Cost: one Chromium process" = playwright-site-preview-capture.ts:17; "Jini must be released before the host consumes its new export" is release history (rule 12: tracking text is deleted, not moved).
  - The doc comments of importPlaywrightChromium and encodeJpeg move with their bodies (moved_bodies, verbatim).
baselines: -   (rg -n -F "platform/headless-browser/lazy-browser" over *.json/*.mjs/*.cjs/*.yml/*.yaml: no hit at HEAD)
jini_commit: test-only: packages/diagnostics/src/web-evidence/__tests__/lazy-browser-owner.test.ts (no changeset)
untangle_followup: -   (no untangle TSV row names these files). Coordinator note: features/web-screenshot (MOVE-AFTER, depends_on this feature) will now find `importPlaywrightChromium` imported from `#src/platform/headless-browser/playwright-loader` in playwright-page-capture.ts; when that file moves to Jini its sheet must take the launcher/loader as an injected port, never this import.
jini_msg: "test(diagnostics): cover the lazy browser owner's reuse, failed-launch retry and no-op release" | tovu_msg: "refactor(headless-browser): fold lazy-browser into its callers and import createLazyBrowser from Jini"

JINI_TEST_HEADER (verbatim, new file start):
```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import { createLazyBrowser, type LazyBrowserTimers } from "../lazy-browser.js";

/**
 * @file The lazy browser owner: one lazily launched browser, reused, closed on demand or after
 * idle. Fake browser and timers.
 */
```

Order of work: Jini R1 + commit; then Tovu: moved_bodies, R2, R3, importers, comment_refs, path_literals, git rm -q both lazy-browser.ts and __tests__/lazy-browser.unit.test.ts, eslint, one commit with these paths:
  apps/website/src/platform/headless-browser/lazy-browser.ts (deleted)
  apps/website/src/platform/headless-browser/__tests__/lazy-browser.unit.test.ts (deleted)
  apps/website/src/platform/headless-browser/playwright-loader.ts
  apps/website/src/platform/headless-browser/__tests__/playwright-loader.unit.test.ts
  apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts
  apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts
  apps/website/src/features/web-screenshot/playwright-page-capture.ts
  apps/website/src/features/image-transform/__tests__/image-codec.boundary.test.ts
Checks: Jini rule 2 rg on the new Jini test prints nothing; eslint per COMMON. Cloud run owes: Jini diagnostics vitest (lazy-browser-owner.test.ts), Tovu tests playwright-loader.unit, playwright-site-preview-capture.unit, image-codec.boundary, Tovu typecheck. No behaviour change, no RED test.
Open questions for the owner: none. (Alternative not taken: encodeJpeg as a public @jini-ai/cms/media helper; revisit only if a second host caller appears.)
