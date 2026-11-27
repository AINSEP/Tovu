# Chat bug handoff

Working tree only; coordinator owns commits. No installs, builds, tests,
typechecks, or linters may run in this dispatch. Regression tests are authored
before each implementation; RED/GREEN and mutation execution remain unverified.

## Ordered delivery

1. Sheet 1 — Tovu pending cancellation and shared surface metadata (implemented, unverified).
   - Create `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.pending-stop.unit.test.ts`.
   - Change `apps/admin/src/lib/assistant-transport-ag-ui.ts`.
   - Change `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.unit.test.ts`.
   - Change `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.approvals.unit.test.ts`.
   - Change `apps/website/src/server/runtime/composition/modules/assistant-ag-ui-approval-segment.ts`.
   - Mutation `latch-until-acceptance`: omit the pending cancel request; the
     before-headers cancel assertion must fail.
   - Jini lifecycle tests/implementation and public metadata export are already
     supplied by `origin/codex/bug-chatj`; do not duplicate them in Tovu.
   - Correct the old durable Stop assertion: its follower already completed and
     detached, so the released run must no longer receive a cancel.
   - The pending Stop witness covers both detach-first and acceptance-first
     races, with headers and the cancel response independently held.

2. Sheet 2 — Browser witnesses for the extracted approval relay (implemented, unverified).
   - Change `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.approvals.unit.test.ts`.
   - Mutation `claimed-means-sent`: return true for a repeated refused answer;
     both card acknowledgments must instead report Answer not sent.
   - Production fix already lives in Jini's extracted relay; no Tovu relay exists.
   - Extend the expired-resume test to assert both acknowledgments, one resume
     POST, no fallback and one dock error. Add the explicitly requested concurrent
     success test with the resume stream held until both answers are in flight.

3. Sheet 3 — Durable launch field parity (implemented, unverified).
   - Create `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.launch-context.unit.test.ts`.
   - Change `apps/website/src/server/__tests__/assistant-ag-ui-durable.integration.test.ts`.
   - Change `apps/admin/src/lib/assistant-transport-ag-ui.ts`.
   - Change `apps/website/src/server/runtime/composition/modules/assistant-ag-ui-launch.ts`.
   - Mutation `drop-client-launch-context`: restore the four-key browser allowlist.
   - Mutation `drop-server-launch-context`: remove all three server projections.
   - Reuse `readRunPageContext`; folder validation remains the injected
     `redactAdminRunContextRef` sanitizer before Jini ledger admission; plugin
     decoding remains `readChatAgentPluginState` at daemon start.

## Constraints and review

- Scope: host HTTP binding and allowlists only; generic lifecycle remains Jini.
- The dispatch's complete design governs style; no extra helpers or comments.
- Missing clone-local architecture/memory files were read from
  `/Users/la/Programming/Tovu/ADS-memory/` instead.
- Package consumers currently request `@jini-ai/chat` `^0.7.3-next.2`.
  Upstream must publish/package the Jini changes before runtime verification.
- Deletions beyond the spec: none.

## Final review / coordinator handoff

- No stopped sheets, unresolved anchors, OPUS sheets, or rejected near-matches
  were implemented. All nine near-matches remain skipped as dispatched.
- Tovu HEAD matches `origin/codex/y5-all` at
  `77de055fd0f0cb313a5f0f4cd932af52213f35be`; `.git` was not written.
- Read-only upstream contract/export check: `origin/codex/bug-chatj` is
  `0cbe0534c2191eb72696c915cbb471f4a6242300`. Its binding requires
  `cancelPendingRun`, its core index exports `SURFACE_EXCHANGE_META`, and its
  relay owns the shared answer promise. No Jini code was copied back into Tovu.
- Fresh evidence: read `git diff` and `git status --short`; re-read both new
  test files. No test, mutation, runtime, build, typecheck or lint command ran.
  RED/GREEN, coverage, and real-app checks belong to the next coordinator run.
- Architecture review: source boundaries match the supplied design. Runtime
  integration remains unverified until the upstream Jini changes are packaged.
- Test integrity: the expired-answer assertions are strengthened; the one stale
  completed-run cancellation assertion is corrected and named above. Existing
  server cancellation witnesses remain intact.
- Scope review: three production files, five test files, this uncommitted plan.
  Removed only the specified duplicate metadata key/stale explanation; no
  unrelated implementation, helpers, abstractions, or new comments remain.
- Documentation: existing launch-parser header updated for the added fields;
  existing binding documentation retained. The new member is an explicit thin
  HTTP operation using the existing owned cancellation route.

| Assessment unit | Disposition | Findings / evidence | Local fix |
| --- | --- | --- | --- |
| adminAgUiDurableBinding / pending HTTP member | INCONCLUSIVE | No runtime evidence permitted; pending Stop browser witness authored | Required port forwarded; non-2xx rejects; no delivery signal |
| wireLaunchFields | INCONCLUSIVE | No runtime evidence permitted; actual-request allowlist witness authored | Seven defined fields only, two-object signature |
| readAgUiLaunchFields | INCONCLUSIVE | No runtime evidence permitted; real-decoder/persisted-input/reopen witness authored | Reuses page decoder; raw folders/plugin state retain existing downstream owners |
| readCardMeta import | INCONCLUSIVE | Jini public export verified by source; server runtime not executed | Duplicate literal removed |

Review cost from source: fixed seven-key projection and one pending cancellation
HTTP request per explicitly stopped start. No new retained collection, retry,
timer or subscription. No new complexity/scale notes were needed in source.

Next action: coordinator packages/adopts the Jini branch, commits the units in
the order above, then executes the named regression tests and mutations.
