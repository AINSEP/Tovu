### jini:packages/ui/src/features/execution/react/hooks/useExecutionTab.ts
- **Over:** `useExecutionTab` 155 (file 188, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/execution/__tests__/react/hooks/useExecutionTab.test.ts`, `src/features/execution/__tests__/react/hooks/useExecutionTab.ordering.test.ts`, `src/features/execution/__tests__/index.test.ts`
- **Responsibility map** (inside `useExecutionTab`):

| unit | statements | job |
|---|---|---|
| A | `describeProbeErrorRef` (+ assignment), `detectionTimer`, `alive`, the unmount `useEffect` | liveness + shared refs — stays |
| B | `agents`, `scan`, `detectionTicket`, `runDetection`, the `autoDetect` effect, `rescan` | local-agent detection edge |
| C | `connectionTest`, `connectionTestTicket`, `testConnection` | connection-test edge |
| D | `agentTest`, `agentTestTicket`, `testAgent` | agent-check edge |
| E | `modelDiscovery`, `modelDiscoveryTicket`, `loadModels`, `resetModelDiscovery` | model-discovery edge |

- **Splits** (same file, sub-hooks at module level above `useExecutionTab`, in order B→E; statements verbatim incl. comments; each `useCallback`/`useEffect` keeps its deps array):
  1. SUB-HOOK `useAgentDetection({ port, autoDetect, alive, detectionTimer }: UseAgentDetectionInput): Pick<UseExecutionTabResult, 'agents' | 'scan' | 'rescan'>` ← unit B. `alive: MutableRefObject<boolean>`; `detectionTimer: MutableRefObject<ReturnType<typeof setTimeout> | undefined>`; `port`/`autoDetect` typed from `UseExecutionTabOptions`.
  2. SUB-HOOK `useConnectionTestEdge({ port, alive, describeProbeErrorRef }: UseConnectionTestEdgeInput): Pick<UseExecutionTabResult, 'connectionTest' | 'testConnection'>` ← unit C. `describeProbeErrorRef: MutableRefObject<(error: unknown) => string>` (use the option's declared type: `MutableRefObject<NonNullable<UseExecutionTabOptions['describeProbeError']>>`).
  3. SUB-HOOK `useAgentTestEdge({ port, alive }: UseAgentTestEdgeInput): Pick<UseExecutionTabResult, 'agentTest' | 'testAgent'>` ← unit D (keeps `describeErrorMessage(error)` as today — NOT the ref).
  4. SUB-HOOK `useModelDiscoveryEdge({ port, alive, describeProbeErrorRef }: UseModelDiscoveryEdgeInput): Pick<UseExecutionTabResult, 'modelDiscovery' | 'loadModels' | 'resetModelDiscovery'>` ← unit E (the "Error-reporting contract §3.2" and "Taking a new ticket…" comments move).
  5. `useExecutionTab` keeps unit A in its current order, then — under the "One monotonic ticket per async edge. …" block comment, kept verbatim here (it explains the ticket each sub-hook owns) — calls the four sub-hooks in order detection, connection, agent, models, then the same `return { … }` (same keys/order; `port` still returned if it is today).
- **Importers to update:** none (no exports move).
- **After:** file ~215; `useExecutionTab` ~40; `useAgentDetection` ~45; others 22–35.
- **Risks / notes:** the unmount effect (sets `alive.current = true`) must stay BEFORE the detection sub-hook call so it registers before the `autoDetect` effect — same order as today. If `Pick<UseExecutionTabResult, …>` names do not exactly match (e.g. the result calls it differently), use the result interface's own field names. No `vi.mock` of this file.
