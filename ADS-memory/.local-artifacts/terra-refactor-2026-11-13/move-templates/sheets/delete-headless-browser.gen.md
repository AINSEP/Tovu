id: DL-headless-browser-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/platform/headless-browser
WARNING KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (importPlaywrightChromium, encodeJpeg); likely DEDUPE/reduce-to-binding or a fold with moved bodies
tovu_file: apps/website/src/platform/headless-browser/lazy-browser.ts | blob 5b9cee61219c96c255eddbe26727ad1ef2b38373
why_dead: TODO(judge)   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}
reach_check:
  - rg -n --no-heading -F "lazy-browser" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/platform/headless-browser/lazy-browser.ts'
census_cmd: rg -n --no-heading -e '["'][^"']*lazy\-browser(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/platform/headless-browser/lazy-browser.ts
importers (2 prod, 3 test; resolved to this file):
  - apps/website/src/features/image-transform/__tests__/image-codec.boundary.test.ts:6 | static | "../../../platform/headless-browser/lazy-browser.ts"
  - apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts:8 | static | "../../../platform/headless-browser/lazy-browser.js"
  - apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts:26 | static | "#src/platform/headless-browser/lazy-browser"
  - apps/website/src/features/web-screenshot/playwright-page-capture.ts:3 | static | "#src/platform/headless-browser/lazy-browser"
  - apps/website/src/platform/headless-browser/__tests__/lazy-browser.unit.test.ts:7 | static | "../lazy-browser.js"
path_literals (rg -F "headless-browser/lazy-browser", not already importers):
  - apps/website/src/features/web-screenshot/playwright-page-capture.ts:10: * shared lazy-browser core (`platform/headless-browser/lazy-browser.ts`) the Sites card previews use.
  - apps/website/src/features/sites/site-preview/playwright-site-preview-capture.ts:15: * (`platform/headless-browser/lazy-browser.ts`), which `web_screenshot_page` uses too.
baselines (json files naming the path): -
declarations (name | line | kind):
  - importPlaywrightChromium | apps/website/src/platform/headless-browser/lazy-browser.ts:26 | function
  - encodeJpeg | apps/website/src/platform/headless-browser/lazy-browser.ts:35 | function
  - createLazyBrowser | apps/website/src/platform/headless-browser/lazy-browser.ts:22 | re-export from "@jini-ai/diagnostics/web-evidence/playwright"
  - ClosableBrowser | apps/website/src/platform/headless-browser/lazy-browser.ts:23 | re-export (type) from "@jini-ai/diagnostics/web-evidence/playwright"
  - LazyBrowser | apps/website/src/platform/headless-browser/lazy-browser.ts:23 | re-export (type) from "@jini-ai/diagnostics/web-evidence/playwright"
  - LazyBrowserTimers | apps/website/src/platform/headless-browser/lazy-browser.ts:23 | re-export (type) from "@jini-ai/diagnostics/web-evidence/playwright"
folds: TODO(judge)
tests:
  - apps/website/src/features/image-transform/__tests__/image-codec.boundary.test.ts | blob 964810992939e771c639a8893ab26143b127d2a4 | TODO(judge) delete|repoint
  - apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts | blob caea8700476c9873bc20147dc8784d54f5780e14 | TODO(judge) delete|repoint
  - apps/website/src/platform/headless-browser/__tests__/lazy-browser.unit.test.ts | blob 0c14e966b5f5c77c7950468759f6becfac154450 | TODO(judge) delete|repoint
why_moves: TODO(judge)
baselines_to_edit: -
