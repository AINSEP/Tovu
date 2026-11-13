### jini:packages/plugins/src/host/node/source-drafts.ts
- **Over:** `createPluginSourceService` 180
- **Phase:** now · **Batch:** size-34
- **Tests:** `src/host/__tests__/unit/source-drafts.unit.test.ts` (`pnpm --filter @jini-ai/plugins exec vitest run src/host/__tests__/unit/source-drafts.unit.test.ts --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `root`, `drafts`, `draft`, `marker`, `approval`, `locked` | paths + cross-process lock (stays) |
| B | `versions`, `snapshot`, `putDraft`, `open`, `write`, `read` | draft file operations |
| C | `validate`, `publish`, `stageSealedPackage`, `reloadAndPrune` | seal + publish a draft |
| D | props `isSealedHere`, `readApproval` | seal provenance queries |
| E | `return {` remaining props | port surface (stays) |

- **Splits** (module level above `createPluginSourceService`):
  1. HELPER `createDraftFiles({ root, drafts, draft }: CreateDraftFilesInput): { versions; snapshot; putDraft; open; write; read }` ← `async function versions(` through `async function read(`.
  2. HELPER `createDraftSealer({ required, optional, root, marker, versions }: CreateDraftSealerInput): { publish }` ← `function validate(` through `async function reloadAndPrune(` (keep the "Writes the draft files, then the manifest" comment). Also return `validate` if a remaining prop calls it.
  3. HELPER `createSealProvenance({ root, marker, approval, versions }: CreateSealProvenanceInput): { isSealedHere; readApproval }` ← the two prop values verbatim (as arrow/method functions); props become `isSealedHere, readApproval` shorthand (keep the doc comments above the props on the helper's functions).
  4. Main keeps unit A, calls the three helpers, `return {`.
- **Importers to update:** none (`node/index.ts` `export *` — helpers are not exported).
- **After:** file ~312; `createPluginSourceService` ~75; helpers ≤ 60.
- **Risks / notes:** input field types: `required: PluginSourceDeps`, `optional`: the function's existing optional param type (extract it to a named `PluginSourceServiceOptions` type alias at module level, same shape). Lock usage (`locked`) stays in props.
