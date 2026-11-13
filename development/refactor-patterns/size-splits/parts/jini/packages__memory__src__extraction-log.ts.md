### jini:packages/memory/src/extraction-log.ts
- **Over:** `createExtractionLog` 118
- **Phase:** now · **Batch:** size-25
- **Tests:** `src/__tests__/extraction-log.test.ts`, `src/__tests__/extract-facts.test.ts`, `src/__tests__/extract-facts.l088.characterization.test.ts` (`pnpm --filter @jini-ai/memory exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `nowMs`, `nextId`, `defer`, `records`, `events`, `emit`, `pushNewest`, `findById` | log state + event emit (stays) |
| B | `startExtraction`, `recordSkip`, `recordHeuristic` | creating new records |
| C | `markProvider`, `markProposed`, `markSuccess`, `markFailed` | advancing an existing record |
| D | `list`, `remove`, `clear`, `return` | reading/clearing (stays) |

- **Splits** (module level, above `createExtractionLog`):
  1. HELPER `createExtractionRecorders({ nowMs, nextId, pushNewest, emit }: CreateExtractionRecordersInput): Pick<ExtractionLog, 'startExtraction' | 'recordSkip' | 'recordHeuristic'>` ← the three function declarations verbatim.
  2. HELPER `createExtractionMarkers({ findById, nowMs, emit }: CreateExtractionMarkersInput): Pick<ExtractionLog, 'markProvider' | 'markProposed' | 'markSuccess' | 'markFailed'>` ← the four `mark*` declarations verbatim.
  3. Main: `const { startExtraction, recordSkip, recordHeuristic } = createExtractionRecorders({ … });` and the same for markers, placed where `startExtraction` was; `return {…}` unchanged. Input field types: `nowMs: () => number`, `nextId: () => string`, `pushNewest: (record: ExtractionRecord) => void`, `emit: typeof emit` → declare `type EmitExtractionEvent = (record: Parameters<…>[0]) => void` as the existing `emit` signature, `findById: (id: string) => ExtractionRecord | null`.
- **Importers to update:** none.
- **After:** file ~178; `createExtractionLog` ~45; helpers ~48 / ~33.
- **Risks / notes:** if `ExtractionLog` method types differ from the inner functions' declared types, use the inner signatures as an explicit return object type instead of `Pick`.
