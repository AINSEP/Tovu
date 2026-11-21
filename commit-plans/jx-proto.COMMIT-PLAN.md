# Protocol phase 1 handoff

Branch supplied by dispatch: `codex/jx-proto`. Base for all four sheets: `de4e555b9`.
Edits were made in sheet order, with each test edit preceding its production edit.
No tests, mutations, builds, installs, type checks, linters, staging, commits, or pushes were run.
Runtime RED/GREEN and mutation results remain unverified under the machine rule.

## AG-J1 — done (test edit; execution owed)

- Base: `de4e555b9`.
- Files: `packages/chat/src/core/ag-ui/__tests__/run-frames.test.ts`.
- Tests: extended `only an explicitly marked pending approval projects an interrupt` with text immediately before and after the marked frame; the exact events assertion requires message start/content/end before the interrupt and excludes trailing text. Resource, metadata, interrupt, outcome, and the exact import remain intact. No new test case.
- Expected RED: this characterization is expected to pass on the base; each named mutation must make the exact events assertion fail. No runtime RED claimed.
- Mutations owed to combine: separately remove the marker branch's `closeAgUiRun` emission and its early return in `event-projection.ts` (base lines 265 and 267). Restore each plant.
- API-baseline delta: none; existing entry and baseline unchanged. No production, manifest, injection-debt, or visual edits.
- Look owed: none.
- Diff re-read deletions: only replaced the events assertion line to add its required plain-words message; no assertion, declaration, or file deleted. No out-of-sheet cleanup was needed.
- Separate existing finding: `drainRunFramesToAgUi` projection complexity remains open and unchanged; it was not remeasured because linters are prohibited. This test-only sheet does not repair it.

## AG-J2 — done (test edit; execution owed)

- Base: `de4e555b9`.
- Files: `packages/daemon/src/__tests__/frontend-session-ag-ui.test.ts`.
- Tests: extended `foreign owner, wrong run and wrong invocation cannot consume a delivered call`. The same handle is bound to another run and refused, then the original run is unbound and refused, then rebound before the existing successful begin, settle, and await. Exact import retained. No new test case.
- Expected RED: the base guards already enforce these cases; RED is owed against the two separate named mutations, not against the unchanged base.
- Mutations owed to combine: separately remove `entry.runId !== runId` and the run-binding guard from `frontend-session-registry.ts` (base lines 300 and 298). Each scoped-handle assertion must fail. Restore each plant.
- API-baseline delta: none. No production imports, exports, manifests, injection debt, or visual edits.
- Look owed: none.
- Diff re-read deletions: none; no out-of-sheet cleanup was needed.

## ACP-J1 — done (test and source edits; execution owed)

- Base: `de4e555b9`.
- Files: `packages/agent-runtime/src/agent-protocol/acp/__tests__/session.test.ts`, `packages/agent-runtime/src/agent-protocol/acp/constants.ts`, `packages/agent-runtime/src/agent-protocol/acp/session-results.ts`.
- Tests: added `closes the ACP child when initialize reports an unsupported version`, using the existing fake, `attachWith`, `baseOptions`, `emitResult`, and `writesOf`. Asserts fatal state, killed child, initialize-only writes, exactly one error event, and the required message.
- Expected RED before source edit: the previous initialize handler continues to session creation for version 2, stays nonfatal, and does not close the child or send this error. This is source inspection, not an executed result.
- Source: added the named internal helper; it accepts absent versions and version 1, returning the specified message for any other explicit value. The initialize handler calls existing `effects.fail` and returns before session setup. Existing `_optional` pad and teardown are intact.
- Mutations owed to combine: bypass the new refusal branch; the new test must fail. Restore the plant.
- API-baseline delta: none; only a package-internal declaration was added, with no public entry. No manifest, injection-debt, or visual edits.
- Look owed: none.
- Existing file above 500 lines: `session.test.ts` was 1903 lines and is now 1915. This is not a STOP condition.
- Diff re-read deletions: replaced the constants import with the exact named import; no declaration, assertion, or file deleted. No out-of-sheet cleanup was needed.

## ACP-J2 — done (test and source edits; execution owed)

- Base: `de4e555b9`, after ACP-J1 in the same working tree.
- Files: `packages/agent-runtime/src/agent-protocol/acp/__tests__/models.test.ts`, `packages/agent-runtime/src/agent-protocol/acp/models.ts`.
- Tests: parameterized the existing handshake test over versions 1 and 2. Retained the existing fake and mock setup verbatim. Version 1 keeps model-success and child-cleanup expectations; version 2 expects the specified rejection, killed child, and one written request. Both receive the existing id-2 result so the bypass mutation terminates. One existing case becomes two (+1 case).
- Expected RED before source edit: the previous probe ignores version 2, writes session/new, and resolves models after id 2 instead of rejecting. This is source inspection, not an executed result.
- Source: uses ACP-J1's helper inside the initialize-result branch before updating `expectedId`; existing `failProbe` owns rejection and teardown. Absent-version compatibility is retained. No new casts or mocks.
- Mutations owed to combine: bypass the version refusal; the version-2 case must fail because the promise resolves to models. Restore the plant.
- API-baseline delta: none. No public export entry, manifest, injection-debt, or visual edits.
- Look owed: none.
- Existing files above 500 lines: `models.ts` was 506 lines and is now 511; `models.test.ts` was 644 and is now 650. These are not STOP conditions.
- Diff re-read deletions: replaced the constants import, old handshake test title, absent-version reply, and assertions with their named parameterized equivalents and required messages. No test case, behavior, declaration, or file was deleted. No out-of-sheet cleanup was needed.

## Static handoff review

- Targeted importer checks found only the sheet-listed references for `handleInitializeAck`, `handleProbeResult`, and `unsupportedAcpProtocolVersionMessage`. No extra test importers required repointing.
- Reuse: the version rule is owned by the sheet-named constants helper; session failure reuses `effects.fail`, and metadata failure reuses `failProbe`. No new teardown, dependency, wrapper, port, type, option, or configuration.
- Architecture audit: static review found only the two authorized ACP behavior changes and test-only AG changes. All seven source/test files remain within the named scope. No surviving argument pad was changed, and existing why-comments remain intact.
- Function review (manual, not a linter result): the new helper is 4 lines; the changed initialize handler is 35 lines; the changed probe-result handler is 16 lines. Their control flow remains within the hard complexity limit. The changed individual test callbacks are also below 50 lines and complexity 10. Time/space overhead of the version rule is O(1), with no added I/O or retention.
- Function-quality disposition: helper, initialize handler, and probe-result handler are INCONCLUSIVE for runtime verification; no additional source finding arose in the bounded review. Checks of names, absent-version compatibility, fail-before-write ordering, existing teardown ownership, and unchanged pads found no extra edit to make.
- Test integrity: no tests removed or weakened; one session test added and one probe case added through parameterization. All added or changed assertions have plain-words messages. Coverage and runtime self-validation were not run because the dispatch forbids them.
- Open items and combine verification are recorded in `REFRESH.md`.
