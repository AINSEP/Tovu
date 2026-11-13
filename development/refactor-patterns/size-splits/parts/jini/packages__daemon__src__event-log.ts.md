### jini:packages/daemon/src/event-log.ts
- **Over:** `createInMemoryEventLog` 104
- **Phase:** now · **Batch:** size-07
- **Tests:** `src/__tests__/event-log.test.ts`, `src/__tests__/run-lifecycle.test.ts` (smoke). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `TERMINAL_EVENT`, `DEFAULT_*`, `InMemoryEventLogOptions`, `RunLog`, `compactRunLog` | constants/types (stay) |
| B | in `createInMemoryEventLog`: `const endedRuns`, `removeRun`, `noteRunPhase`, `enforceRunCap` | ended-run retention + run cap |
| C | `createInMemoryEventLog` rest: options, `runs`, `getOrCreateRunLog`, returned `append`/`replay` | the log itself |

- **Splits:**
  1. HELPER `createRunRetention({ runs, terminalRetentionMs, maxRuns, scheduler }: CreateRunRetentionInput): { removeRun(runId: string): void; noteRunPhase(runId: string, runLog: RunLog, event: string): void; enforceRunCap(): void }` — module level above `createInMemoryEventLog` ← statements `const endedRuns = new Set<string>();` through `function enforceRunCap(): void {` (the `endedRuns` and `noteRunPhase`/`enforceRunCap` "why" comments move with them). `createInMemoryEventLog` keeps `runs`, calls `const { removeRun, noteRunPhase, enforceRunCap } = createRunRetention({ runs, terminalRetentionMs, maxRuns, scheduler });` right after `const runs = …` (same position as before). Inner function signatures stay positional (they are existing closures, not new helpers).
- **Importers to update:** none (nothing exported moves).
- **After:** file ~140; `createInMemoryEventLog` ~80; `createRunRetention` ~27.
- **Risks / notes:** `removeRun` is also used by the returned object (`uses: removeRun`) — destructure it from the helper result. Order of scheduler calls in `noteRunPhase` unchanged.
