# Bug-fix handoff

Verification is deferred to cloud per dispatch: no tests, builds, installs, type checks, or linters were run locally. `.git` remains read-only, so no commits were created. Each sheet below is a separate proposed commit.

## J-401 — DONE (verification pending)

- Base: merge-6 `d3e78b387dba2713dc5d0f3be650d375a5a2ed3d`, equal to HEAD.
- Proposed commit: `bg-jini: J-401 avoid writing the unauthenticated body`.
- Files touched: `packages/daemon/src/http/__tests__/tool-execution-rpc.test.ts`; this plan.
- Test first: retained the existing 401 and zero-executor-call witness and authenticated 413 control; the unauthenticated request declares JSON content type and the large content length but omits the body argument. This sheet is test-only.
- Red witness on merge-6: **flaky-red**, original `write ECONNRESET` in 2 of 9 runs, supplied by dispatch; not reproduced locally under the no-tests rule.
- Cloud mutation: move authentication after the body read; the unauthenticated 401 assertion or existing deadline must fail.
- STOP/skip: none. Raw helper forwards explicit headers and ends the request; harness mounts the gated route ahead of its body parser.
- Debt rows: unchanged. Files over 500 lines: none.
- Final diff re-read deletions: none beyond replacing the unauthenticated request's body argument with explicit headers.

## J-EMBED — DONE (verification pending)

- Base: merge-6 `d3e78b387dba2713dc5d0f3be650d375a5a2ed3d`, equal to HEAD.
- Proposed commit: `bg-jini: J-EMBED provide surfaces to the imperative embed`.
- Files touched: `packages/chat/src/embed-widget/react/embed.tsx`, `packages/chat/src/embed-widget/react/__tests__/embed.test.tsx`, new `packages/chat/src/embed-widget/react/__tests__/embed-surfaces.test.tsx`, `packages/chat/docs/spec/api.spec.md`; this plan.
- Test first: wrote two real-pane cases before the fix: imperative mount renders the composer and open dialog and unmount empties the supplied element; direct React widget renders the composer under the existing provider without another widget prop. No pane mocks or extra host ports were added.
- Red witness on merge-6: imperative mount reaches the real `ChatPane` -> `useChatPaneAgentControl` -> `useChatSurfaces`, which throws without a provider. Source-confirmed, not executed locally; cloud must confirm runtime red (merge-6's old signature also lacks the required surfaces argument).
- Cloud mutation: remove `ChatSurfacesProvider` from the imperative mount; the real-pane mount must fail.
- BREAKS: imperative `mountEmbedChat` callers must pass `surfaces: ChatSurfaces` in the first bag.
- Importer check: the prescribed `git grep` found only the listed mocked composition test caller, the definition, and documentation. No production caller or unlisted test importer was found. `./react/embed` export stays in place; only the specified API signature text changed.
- Chrome look owed: open, close, unmount; not performed locally under the no-tests rule.
- STOP/skip: none identified by source inspection; cloud must confirm the real embed renders without another host port.
- Debt rows: unchanged. Files over 500 lines: none. REFRESH.md entries: none.
- Final diff re-read deletions: none beyond replacing the imperative render with its provider-wrapped render and updating the old signature/caller.

## J-LOCK-OWNER — DONE (verification pending)

- Base: merge-6 `d3e78b387dba2713dc5d0f3be650d375a5a2ed3d`, equal to HEAD.
- Proposed commit: `bg-jini: J-LOCK-OWNER retain identified holders without proof of death`.
- Files touched: `packages/platform/src/fs/file-lock.ts`, `packages/platform/src/fs/__tests__/file-lock.agent-plugins.test.ts`, `packages/platform/src/fs/__tests__/file-lock.test.ts`; this plan.
- Test first: extended U7 before changing production code. Both adapters inspect fresh and 60-second-old fully parseable foreign holders with finite staleness, deterministic elapsed time and sleep. Each case asserts timeout, matching bytes, zero local liveness probes, and zero critical-section calls. U3/U4 dead-owner controls and U6 live-local control stay unchanged.
- Existing behavior witness updated: `file-lock.test.ts` refresh-between-inspections fixture now uses literal `"unidentified-holder"` instead of an identified foreign JSON holder; its three-line description names an unidentified holder. Inode, bytes, timeout and read-count assertions remain intact. No existing test explicitly asserting age eviction of a fully identified foreign holder was found in the supplied sheet evidence.
- Red witness on merge-6: aged U7 foreign holder has unknown liveness and is evicted on age, entering the critical section instead of timing out. Source-confirmed, not executed locally under the no-tests rule.
- Cloud mutation 1: remove the identified-holder guard to restore age-only eviction for unknown liveness; aged U7 must fail in both adapters.
- Cloud mutation 2: remove the `unchanged(observed, current)` guard; the refreshed unidentified-holder test must fail.
- STOP/skip: none. HEAD is the base; no successor is applied. No liveness-probe or partial-record recovery code changed; both removal paths still use `stale`.
- Debt rows: unchanged. Files over 500 lines: none. REFRESH.md entries: none.
- Final diff re-read deletions: none beyond replacing U7's original single-adapter setup with the specified cases, replacing the identified fixture bytes/description, and replacing the stale decision with the specified guards.
