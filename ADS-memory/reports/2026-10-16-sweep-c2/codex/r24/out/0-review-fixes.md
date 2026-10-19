TDD(Execution): Loaded the TDD persona to strengthen the four tests using existing seams.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/admin/src/features/collections/__tests__/use-collections.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/collections/__tests__/use-collection-entries.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/settings/__tests__/ai-agent-presentation.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts

The tests now pin these product lines:

- `use-collections.hooks.ts:94`: an empty loaded registry becomes `types: []`.
- `use-collection-entries.hooks.ts:74–75`: entry-read failures expose the error and leave rows unloaded.
- `use-ai-agent-presentation.hooks.ts:19`: `if (live.current)` suppresses late publication, observed through a setter spy with a mounted positive control.
- `playwright-site-preview-capture.ts:84`: real Sharp output is a 640×400 JPEG, with browser cleanup retained. A separate boundary test pins `lazy-browser.ts:26` host-loader delegation.

NOT DONE: Tests, mutation runs, typecheck, builds, and package scripts were not run, as instructed. No commits or git-state changes. Jini remained read-only.
