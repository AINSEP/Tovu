### jini:packages/chat/src/server/durable-runs/recover.ts
- **Over:** `createDurableRecovery` 122
- **Phase:** now (JINI 122) · **Batch:** size-28
- **Tests:** `src/server/durable-runs/__tests__/recover.test.ts`, `recover-boundaries.test.ts`, `missing-resume.test.ts`, `accept.cov-j2.test.ts` (package `@jini-ai/chat`). No test mocks the module.
- **Responsibility map** (closures inside `createDurableRecovery`):

| unit | closures | job |
|---|---|---|
| A port actions | `attach`, `nativeAllowed`, `launchNext`, `probeAttempt` | single attempt actions that read only `ports` |
| B decision | `finalize`, `continueDead`, `reattach`, `finalizeFailure`, `decide`, `decideDead`, `resolveMissing`, `reload`, `resolveDead`, returned `recover` | recovery decision tree (stays) |

- **Splits** (HELPERS in the same file, module level, directly above `createDurableRecovery` and below `interface Decision`, in this order; bodies verbatim, with `ports` now coming from the input object):
  1. `function attachAttempt({ ports, run }: AttachAttemptInput): void` ← `attach` (move its 3-line doc comment). `interface AttachAttemptInput { ports: RecoveryPorts; run: DurableRun }`.
  2. `async function nativeResumeAllowed({ ports, run }: NativeResumeAllowedInput): Promise<boolean>` ← `nativeAllowed`.
  3. `async function launchNextAttempt({ ports, run, next, native }: LaunchNextAttemptInput, _optional = {}): Promise<DurableRun>` ← `launchNext` (move its doc comment "Persist rejection evidence…" and both inner why-comments).
  4. `async function probeAttempt({ ports, run, trigger, liveRunId }: ProbeAttemptInput, _optional = {}): Promise<RunProbe>` ← `probeAttempt` (keep its comment).
  - Call sites inside `createDurableRecovery`: `attach(launched)` → `attachAttempt({ ports, run: launched })`; `attach(run)` in `reattach` and `resolveDead` → `attachAttempt({ ports, run })`; `await nativeAllowed(run)` → `await nativeResumeAllowed({ ports, run })`; `launchNext({ run, next, native })` → `launchNextAttempt({ ports, run, next, native })`; `probeAttempt({ run, trigger, liveRunId })` → `probeAttempt({ ports, run, trigger, liveRunId })`.
- **Importers to update:** none (new helpers are not exported).
- **After:** `createDurableRecovery` ~86; helpers 10/5/19/4; file ~225 counted.
- **Risks / notes:** `ports` is the same object, so behavior is identical. `missingResume && await nativeAllowed(run)` keeps its short-circuit (`!missingResume && await nativeResumeAllowed(...)`). The existing `events[noticeIndex]!` is moved code, so it stays.
