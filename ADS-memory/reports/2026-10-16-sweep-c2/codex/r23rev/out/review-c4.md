Code Inspection(Review): Loaded the Code Inspection persona for test-quality and source-correctness review.

FINDINGS:

1. **test-gap** — `807adf4e7`, [use-collections.unit.test.tsx:176](/Users/la/Programming/Tovu/apps/admin/src/features/collections/__tests__/use-collections.unit.test.tsx:176): The empty-registry test only reads the fake; a hook that keeps an empty result as `null` still passes (F2.6). **Fix:** mount `useCollections` with the empty port and assert it settles to `types: []`.

2. **test-gap** — `2240333fd`, [use-collection-entries.unit.test.tsx:57](/Users/la/Programming/Tovu/apps/admin/src/features/collections/__tests__/use-collection-entries.unit.test.tsx:57): The failure test merely confirms the fake throws its planted error; swallowing entry-read failures in the hook would survive (F2.6). **Fix:** inject that failing port into `useCollectionEntries` and assert the controller’s error and unloaded rows.

3. **test-gap** — `2240333fd`, [ai-agent-presentation.unit.test.ts:45](/Users/la/Programming/Tovu/apps/admin/src/features/settings/__tests__/ai-agent-presentation.unit.test.ts:45): Counting renders after unmount cannot verify the late-publication guard: React suppresses those renders even if `if (live.current)` is removed (F6.1). **Fix:** assert suppression through an observable publication sink rather than render count.

4. **test-gap** — `476a544fb`, [playwright-site-preview-capture.unit.test.ts:66](/Users/la/Programming/Tovu/apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts:66): The new test mocks the Playwright module despite the existing `loadLauncher` injection port. **Fix:** inject the launcher while retaining real Sharp encoding; test default module loading separately at its boundary.

CLEAN:

`74380981c`, `4b2d30453`, `528bc047e`, `566378aab`, `b440318a2`.

The requested uncommitted diffs have no findings: theme resolution uses B’s kernel/workspace, the schema-refusal fixture targets the TS ledger, and omitted `importModule` remains stable across renders.

Static review only; no files edited, tests run, or git state changed.
