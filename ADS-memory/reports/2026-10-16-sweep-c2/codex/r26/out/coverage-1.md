TDD(Direct): Selected TDD for behavior-focused coverage gap tests. Added six tests; verification remains pending.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/admin/src/features/voice-input/__tests__/voice-input-port.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/web-screenshot/__tests__/own-site-opener.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/web-screenshot/__tests__/web-screenshot.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/platform/headless-browser/__tests__/lazy-browser.unit.test.ts

**PER FILE:**

- `voice-input-port.ts:51–52`: injected bridge precedence and runtime without `window`.
- `own-site-opener.ts:39`: `"none"` fallback when no installed theme is valid; asserts exact refusal and no server boot.
- `screenshot-image.ts:8`: default quality with omitted options and empty options; asserts real JPEG output.
- `lazy-browser.ts:36`: explicit quality override; asserts JPEG bytes and dimensions.

**UNREACHABLE:**

- `/Users/la/Programming/Tovu/apps/admin/src/features/voice-input/voice-input-port.ts:51`: optional-chain nullish path is unreachable under `Window | undefined` after excluding `undefined`. Reaching it requires unsupported `null`. Left unchanged for owner disposition.

**NOT DONE:**

Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. Actual 100% coverage is unverified. No production code or git state was changed.
