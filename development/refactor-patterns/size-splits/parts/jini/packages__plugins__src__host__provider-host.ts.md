### jini:packages/plugins/src/host/provider-host.ts
- **Over:** `createPluginProviderHost` 134
- **Phase:** now · **Batch:** size-34
- **Tests:** `src/host/__tests__/unit/provider-contributions.unit.test.ts`, `src/host/__tests__/unit/provider-guidance.unit.test.ts` (`pnpm --filter @jini-ai/plugins exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | timeouts, `contracts` map, sets, `closed`/`shutdown` lets, `current`, `track`, `cleanup`, `unsubscribe`, `report`, `findProvider`, `initialize`, `return {` | host state + entry points (stays) |
| B | `validatePort` (reads no locals) | contract shape check |
| C | `releaserFor`, `leaseResource`, `admit` | admit a factory result as a disposable lease |
| D | `untilRetiredOrDeadline` | race factory vs retirement vs deadline |

- **Splits** (module level above `createPluginProviderHost`):
  1. Lift `function validatePort(input: …)` verbatim.
  2. HELPER `createLeaseAdmission({ disposers, timeoutMs, report, current, acquired, track, cleanup }: CreateLeaseAdmissionInput): { admit }` ← `function releaserFor(` , `function leaseResource(`, `async function admit(` (with its "Admit one factory result" comment).
  3. HELPER `untilRetiredOrDeadline({ current, initializeTimeoutMs, wakers, …input }: UntilRetiredOrDeadlineInput)` — merge the existing `input` fields into the one object; main keeps a same-named local arrow passing them, so `initialize` is unchanged.
- **Importers to update:** none.
- **After:** file ~228; `createPluginProviderHost` ~80; helpers ≤ 40.
- **Risks / notes:** `closed`/`shutdown` are `let`s — they stay in main; `current` (reads `closed`) is passed as a function, so it still sees the live value.
