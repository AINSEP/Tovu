TDD(Direct): Loaded the TDD persona for coverage test design. Added five focused tests to existing suites; production code is unchanged.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/admin/src/features/pages/__tests__/embed-placeholder.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/pages/__tests__/theme-page-publish-state.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/posts/__tests__/rules.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/posts/__tests__/post-schedule-featured.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/publish-content/__tests__/publish-request.store.unit.test.ts

**PER FILE:**

| Source file | Added coverage |
|---|---|
| `theme-canvas-wrapper.ts` | No test added; remaining branch is unreachable below. |
| `embed-placeholder.ts` | Line 122: legacy placeholder with an authored element ID. |
| `prettify-html.ts` | No test added; remaining branch is unreachable below. |
| `theme-page-publish-state.ts` | Line 84: direct `lockedPublishReason("index")` call. |
| `posts/rules.ts` | Line 586: empty title node omitting its content array. |
| `use-post-featured-image.hooks.ts` | Line 58: closing the picker preserves the current image. |
| `use-post-url-dialog.hooks.ts` | No test added; remaining branch is unreachable below. |
| `publish-request.store.ts` | Line 80: real server rendering reads the null snapshot while a client request is open. Added store cleanup between tests. |

**UNREACHABLE:**

- [theme-canvas-wrapper.ts:39](/Users/la/Programming/Tovu/apps/admin/src/features/pages/hooks/theme-canvas-wrapper.ts:39): candidates come from `[data-embed-config]`; their attribute cannot be absent during this synchronous scan.
- [prettify-html.ts:126](/Users/la/Programming/Tovu/apps/admin/src/features/pages/lib/prettify-html.ts:126): `raw` already matched `TAG_PATTERN`, which guarantees the tag-name capture; the empty fallback cannot occur.
- [use-post-url-dialog.hooks.ts:33](/Users/la/Programming/Tovu/apps/admin/src/features/posts/hooks/use-post-url-dialog.hooks.ts:33): after the HTTP(S) prefix guard and successful native URL parsing, hostname is present and protocol is HTTP(S).

These branches remain unchanged for the owner’s keep/delete decision.

**NOT DONE:** No tests, typecheck, builds, coverage runs, or package scripts executed, as instructed. Final 100% coverage remains unverified. No git mutations or Jini edits.
