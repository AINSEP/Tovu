# Dispatch handoff

Base for every sheet: `f3a766a24`. All eight sheets are implemented; no sheet STOPPED. Tests were edited and read before source changes; red reasons below are inspection evidence, not execution results. No tests, builds, installs, type checks, linters, API generation, commits, or staging were run. No package manifests or API baselines were edited.

Path abbreviations: AR = `packages/agent-runtime/src/agent-protocol/acp`; DA = `packages/daemon/src/agent-executor`.

## ACP-3

- Base: `f3a766a24`.
- Files: AR `session-results.ts`, `__tests__/session.test.ts`, `__tests__/resume-failure.unit.test.ts`, `__tests__/session.handlers.unit.test.ts`; DA `acp-events.ts`, `launch.ts`, `__tests__/agent-executor.test.ts`; `.changeset/jz2-acp-3.md`.
- Tests added: `fails resume when the agent does not offer session/load`; `forwards resume and returns the durable ACP session id for an eligible def`; `omits ACP resume and durable sessionRef without the def flag`. Changed: `getDurableSessionId falls back to the ACP sessionId`; resume handshake fixtures and both direct initialize-handler calls. Existing captured-ID precedence test retained.
- Red reason: base sends load without an advertised capability, loses a fresh ACP handle, and neither forwards the resume handle nor reads the controller's durable handle at finish.
- Combine mutations owed: remove the capability refusal; restore the old durable fallback; omit forwarding/controller lookup; remove the def gate. Run the full runtime/daemon suites and dispatched parity checks.
- Changeset: patch `@jini-ai/agent-runtime` and `@jini-ai/daemon`.
- API reconciliation: `handleInitializeAck` now requires `result`; new daemon fields are optional and resume accepts null. Existing direct dispatch callers remain compatible.
- Over 500 lines: AR `__tests__/session.test.ts` (1903), `__tests__/session.handlers.unit.test.ts` (800); DA `launch.ts` (1708), `__tests__/agent-executor.test.ts` (7311). Continue per dispatch.
- Diff reread deletions: replaced the old null-durable expectation; no unrelated deletion.

## ACP-4

- Base: `f3a766a24`.
- Files: AR `models.ts`, `session-results.ts`, `session-run.ts`, `session-state.ts`, `session-types.ts`, `__tests__/session.test.ts`; DA `acp-events.ts`, `launch.ts`, `__tests__/agent-executor.test.ts`; `packages/daemon/src/ports/agent-runtime-sessions.ts`; `.changeset/jz2-acp-4.md`.
- Tests added: `sets an offered reasoning effort before prompting`; `fails without prompting when reasoning effort is not offered`; `uses reasoning effort options from the model switch reply`; `forwards reasoning effort only when supplied (%s)` (high and absent). Changed: `fails instead of silently changing an explicitly selected concrete model`; `does not treat a null-id RPC error as a model-selection reply`.
- Red reason: base reports a raw explicit-model failure, mistakes null for an outstanding model request, ignores effort, and never forwards reasoning to ACP. The existing fixture resolver accepts reasoning; no daemon case STOPPED.
- Combine mutations owed: restore the null-ID predicate/raw model error, bypass effort selection, discard model-reply configOptions, omit daemon effort forwarding.
- Changeset: patch `@jini-ai/agent-runtime` and `@jini-ai/daemon`.
- API reconciliation: new `findEffortConfigOption`, effort options/effects, session-state fields; daemon effort inputs remain optional.
- Over 500 lines: AR `models.ts` (506), `session-run.ts` (632), `__tests__/session.test.ts` (1903); DA `launch.ts` (1708), `__tests__/agent-executor.test.ts` (7311). Continue per dispatch.
- Diff reread deletions: removed the obsolete null-ID bug comment and model-status/early-prompt expectation; replaced the raw-error expectation. No unrelated deletion.

## ACP-5

- Base: `f3a766a24`.
- Files: AR `session-run.ts`, `session-types.ts`, `__tests__/session.test.ts`; DA `acp-events.ts`, `contracts.ts`, `__tests__/agent-executor.test.ts`, `__tests__/mcp-bridge-staging.test.ts`; `packages/daemon/src/ports/agent-runtime-sessions.ts`; `.changeset/jz2-acp-5.md`.
- Tests added: `waits for the hook before closing stdin and starting the clean exit timer`; `waits for the hook before signalling a failed child`; `releases the child even when the hook rejects`; `stops recorded descendants before finishing the ACP run`; `reports an ACP release snapshot failure and still finishes`. Changed only the expected attachment keys in `mcp-bridge-staging.test.ts`.
- Red reason: base closes stdin/signals immediately, offers no release hook, and never snapshots/stops descendants on close.
- Combine mutations owed: bypass release waiting, ignore hook rejection, omit descendant recording/stopping, omit the cleanup-failure report. Verify clean, failure, and abort release paths on the combined tree.
- Changeset: patch `@jini-ai/agent-runtime` and `@jini-ai/daemon`.
- API reconciliation: optional `beforeRelease` on both attachment types; `acp-release` cleanup phase. New private `releaseChild` uses one destructured object per the owner rule. Release tails and why-comments were moved verbatim into callbacks.
- Over 500 lines: AR `session-run.ts` (632), `__tests__/session.test.ts` (1903); DA `contracts.ts` (726), `__tests__/agent-executor.test.ts` (7311). Continue per dispatch.
- Size reread: `wireAcpLifecycle` 48 lines; `createFakeAttachAcpSession` 47; `createAcpExecutor` 29; `dispatchAcpPrompt` 44; `runAcpDispatch` 48.
- Diff reread deletions: none beyond replacing immediate release statements with the specified wrappers.

## E4-J-TRACKER

- Base: `f3a766a24`.
- Files: `packages/core/src/errors/reporter.ts`, `packages/core/src/errors/__tests__/reporter.test.ts`; `.changeset/jz2-e4-tracker.md`. Reviewed `testing.ts`; it already records the imported report type without adaptation, so no edit was needed.
- Census: no live core reporter tracker consumer. `testing.ts` is the recording fake; the same-named private HTTP-kit function is unrelated.
- Tests changed: `an unknown error gets one ID from the ID port, the time from the clock, one host record and one tracker report`; `the host diagnostic blanks secrets and the tracker receives the original error and call secrets`. The existing record single-report assertion, warning level, rejected-promise handling, and skip cases remain.
- Red reason: base hands the tracker a replacement Error and omits call exactSecrets; the new assertions require original-object identity and the exact call list while keeping all three host-diagnostic redaction checks.
- Combine mutations owed: restore trackerCarrier, omit exactSecrets, omit tracker handoff.
- Changeset: patch `@jini-ai/core`, with the dispatched sentence.
- API reconciliation: `IncidentTrackerReport.context` gains `readonly exactSecrets?: readonly string[]`.
- Diff reread deletions: `trackerCarrier` and its obsolete comment; replaced the obsolete host-record comment and tracker-redaction expectation as required. No unrelated deletion.

## E6a-J-NOTICE

- Base: `f3a766a24`.
- Files: `packages/ui/src/features/panel-kit/ErrorNotice.tsx`, its `__tests__/ErrorNotice.test.tsx`; `.changeset/jz2-e6a-notice.md`.
- Tests added: `shows only the words and error ID in id-only mode`; `shows words without an ID prompt when id-only mode has no error ID`. Existing full-mode clipboard tests are unchanged.
- Red reason: base has no disclosure prop and always renders details/copy controls; it never renders the error-ID reporting prompt.
- Combine mutation owed: render `<details>` in id-only; suppress the ID prompt.
- Changeset: patch `@jini-ai/ui`, with the dispatched sentence.
- API reconciliation: `ErrorNoticeProps.disclosure?: 'full' | 'id-only'`. Hook stays first and unconditional; no hook/clipboard/admin-kit edits.
- Diff reread deletions: none.

## E9-J-FRAME

- Base: `f3a766a24`.
- Files: `packages/sidecar/src/json-ipc.ts`, `src/__tests__/audit-regressions.test.ts`, `src/__tests__/json-ipc.contract.test.ts`, `src/__tests__/index.test.ts`, `docs/spec/api.spec.md`; `.changeset/jz2-e9-frame.md`.
- Census: jsonIpcError had only the named parse reply, direct tests, and spec line; private errorMessage had only jsonIpcError as a user.
- Tests changed: `a malformed IPC frame gets a fixed BAD_FRAME refusal and no input echo`; `unparseable frame: fixed BAD_FRAME refusal; parse-failed trace`. The real-socket canary checks the exact refusal and absence of echoed input; existing trace assertions remain.
- Red reason: base returns the parser message with no BAD_FRAME code and can echo frame contents.
- Combine mutation owed: put the parser text back.
- Changeset: patch `@jini-ai/sidecar`, with the dispatched sentence. No supported package entry breaks.
- Over 500 lines: `src/json-ipc.ts` (514), `src/__tests__/index.test.ts` (1247). The one-statement parse fix does not grow the existing server function; the dispatched size exception applies. Handler incident path unchanged.
- Diff reread deletions: jsonIpcError, private errorMessage, their comments, both direct-test imports/describes (3 index cases + 7 contract table cases), obsolete spec name, and parser-text construction in the audit case. errorCode and tests reaching it through other paths remain.

## E-C-J

- Base: `f3a766a24`.
- Files: `packages/cli/src/daemon-url.ts`, `main.ts`, `local-daemon-discovery.ts`, `__tests__/daemon-url.test.ts`, `__tests__/daemon-url.pins.test.ts`, `__tests__/local-daemon-discovery.test.ts`, `__tests__/integration-surface.test.ts`, `packages/cli/README.md`, `packages/cli/docs/spec/api.spec.md`; `packages/sidecar/src/daemon-registry.ts` (one comment line only).
- Census: the only production call is main.ts and already has an env map. All named tests/examples were repointed. envVarName, envCandidate, flag/env/discovery/default precedence, and error text are unchanged.
- Tests: repointed existing calls; added only `hands discover the supplied env object by identity`. The ambient-env case now explicitly passes process.env. Existing truth table and edge pins remain.
- Combine mutation owed: pass a different env object (`{}`) to discover; reconcile E12/API baseline and public examples.
- BREAKS: @jini-ai/cli resolveDaemonUrl(required: { env }, options = {})
- Changeset: none here; combine owns the breaking-signature changeset and API baseline.
- Diff reread deletions: env option/doc/default read; options.env wiring and test-helper envUrl plumbing moved to the required argument. No donor replay, configuredUrl, or unrelated deletion.

## E-O-J

- Base: `f3a766a24`.
- Files: `packages/devops/src/local-dev/node-runtime.ts`, `__tests__/node-runtime.test.ts`.
- Census: no additional production caller or probe under packages; the existing local-dev export remains unchanged.
- Tests: repointed the four existing selector calls; added only `both candidate probes receive the supplied env object by identity`. Candidate ordering and native-probe environment assertions remain.
- Combine mutation owed: pass `{}` to usable; reconcile E29/API baseline and the later host binding.
- BREAKS: @jini-ai/devops ./local-dev selectNodeRuntime signature (only caller: the host dev script, fixed by a later host sheet)
- Changeset: none here; combine owns the breaking-signature changeset and API baseline.
- Diff reread deletions: RuntimeOptions.env and the ambient process.env default; env now comes from RuntimeInput. No unrelated deletion.

## Test declaration inventory (read only)

These are source declaration counts, not executed/expanded case counts. Against the base: AR session 129 → 136; daemon executor 356 → 361; reporter 29 → 29; ErrorNotice 3 → 5; audit-regressions 2 → 2; sidecar index 66 → 63; IPC contract 20 → 19; daemon-url 24 → 25; daemon-url pins 17 → 17; Node selector 5 → 6. The only removed tests are E9's explicitly dispatched direct tests (10 expanded cases). No coverage exclusions, thresholds, or debt numbers changed.
