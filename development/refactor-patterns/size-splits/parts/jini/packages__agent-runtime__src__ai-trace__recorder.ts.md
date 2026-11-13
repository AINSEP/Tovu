### jini:packages/agent-runtime/src/ai-trace/recorder.ts
- **Over:** `createAiTraceRecorder` 191
- **Phase:** now · **Batch:** size-16
- **Tests:** `src/ai-trace/__tests__/ai-trace.test.ts`, `src/ai-trace/__tests__/recorder-boundaries.unit.test.ts`, `src/ai-trace/__tests__/regressions.test.ts`, `src/ai-trace/__tests__/providers.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `AgentEvent`, `OpenTurn`, `PendingTool`, `Totals`, options/recorder interfaces, `str`, `num` | types + coercions |
| B run state | the 9 `let`s (`model`, `turn`, `lastBoundary`, `runInput`, `lastError`, `lastErrorCode`, `requestBounded`, `started`, `finished`) | mutable per-run state |
| C turn accounting | `start`, `ensureTurn`, `resolveCost`, `addToTotals`, `ttftOf`, `updateUsage`, `safeCode`, `closeTurn`, `emitTool` | open/close turns, usage, cost, tool spans |
| D event handlers | `const handlers` (~L214-284) | map each agent event type to state changes |
| E (stays) | config consts, `record`, `noteInput`, `observe`, `flushOpenWork`, `runError`, `finish`, return | the recorder API |

- **Splits** (module level above `createAiTraceRecorder`, in this order):
  1. NEW interface `TraceRunState` + replace the 9 `let`s with `const run: TraceRunState = { model: options.model ?? null, turn: null, lastBoundary: now(), runInput: null, lastError: null, lastErrorCode: null, requestBounded: false, started: false, finished: false };` — every read/write of those names becomes `run.<name>` (the `requestBounded` comment moves onto the interface field). Mechanical, no logic change.
  2. `ttftOf` → module-level `ttftOf({ open }: { open: OpenTurn }): number | null` (pure).
  3. `createTraceTurnAccounting({ run, totals, now, traceId, runId, agentId, options, capture, captureStreamed, captureOptions, record }: CreateTraceTurnAccountingInput): TraceTurnAccounting` returning `{ start, ensureTurn, closeTurn, updateUsage, emitTool, safeCode }` ← unit C verbatim (comments on `updateUsage` and `safeCode` move). `resolveCost` and `addToTotals` stay private inside it.
  4. `createTraceEventHandlers({ run, now, keepText, seenTools, pending, turns }: CreateTraceEventHandlersInput): Readonly<Record<string, (event: AgentEvent) => void>>` ← the `handlers` object literal verbatim (all inline comments move), where `turns` is the step-3 result (`ensureTurn`, `closeTurn`, `updateUsage`, `emitTool`).
  The recorder keeps `const turns = createTraceTurnAccounting({...}); const { start, ensureTurn, closeTurn, emitTool, safeCode } = turns; const handlers = createTraceEventHandlers({...});` so the rest of its body is unchanged.
- **Importers to update:** none (no export moves; `ai-trace/index.ts` re-exports unchanged).
- **After:** `createAiTraceRecorder` ~62; `createTraceTurnAccounting` ~78; `createTraceEventHandlers` ~66; file ~285.
- **Risks / notes:** `lastBoundary` is read by `ensureTurn` and written by `start`, `closeTurn` and the `status` handler — the shared `run` object keeps them coherent; do not copy any field into a local. `start` is part of the public return value and must be the same function `ensureTurn` calls.
