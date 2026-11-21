# jm7-a delivery plan

Base for every sheet: `06cd7ae7e` (`integ/merge-7-2026-11-20`). No commits, staging, tests, builds, installs, type checks, linters, catalog generation or API generation were run. Each sheet's tests were written and read for the new assertions before its source was added. Status below means implemented and reviewed, not executed or verified green.

## AG2-J — done

Files:
- `packages/chat/src/core/assistant-client/ag-ui-fetch-agent.ts`
- `packages/chat/src/core/assistant-client/__tests__/ag-ui-fetch-agent.test.ts`
- `packages/chat/src/core/assistant-client/ag-ui-transport.ts`
- `.changeset/jm7-ag2-fetch-agent.md` — patch `@jini-ai/chat`

Tests (new file: 0 → 5 cases):
- `joins split SSE frames, ignores comments and delivers the first event before response completion`: joins network chunks, ignores comments, preserves input/signal, delivers before EOF and completes once.
- `abort cancels the response reader and releases its lock`: cancellation reaches the upstream stream and releases its reader.
- `reports a host refusal before the response once`: the original refusal reaches error once, with no next/complete.
- `consumes a registered live directive before transcript reduction`: one visitor callback, no transcript event, one empty completion.
- `an event failing EventSchemas ends once without reaching the live consumer or transcript`: only the valid first event reaches the live port; invalid and following frames reach neither consumer nor transcript; error and completion each occur once.

Mutations owed to combine: split by network chunk; omit abort; double refusal settlement; reduce a consumed directive; skip `EventSchemas.parse`.

API delta: `@jini-ai/chat/transports/ag-ui` exports `createAgUiFetchAgent({ request }, optional = {})`; `request({ input, signal })` returns the host's response and owns headers/refusal wording. `AgUiClientPorts.onLiveEvent({ event })` optionally returns whether it consumed the event. The new file imports only types from the transport, avoiding a runtime back edge. The pre-existing subscription cast remains in place.

Diff reread deletions: none from the original tree. Replaced newly introduced convenience matchers with separate once/argument assertions for compatibility.

## AG3-J — done

Files:
- `packages/chat/src/core/ag-ui/__tests__/interrupts.test.ts`
- `packages/chat/src/core/ag-ui/event-projection.ts`
- `packages/chat/src/core/assistant-client/ag-ui-transport.ts`
- `.changeset/jm7-ag3-interrupts.md` — patch `@jini-ai/chat`

Tests (new file: 0 → 8 cases):
- `reads one matching %s confirmation and treats dismissal as denial` (allow, deny, dismissed): accepts matching answers and maps dismissal to denial.
- `rejects wrong thread, parent, interrupt, repeated settlement and forwardedProps answers`: rejects mismatches/multiple answers and ignores model forwarding; cancelled resume denies.
- `claims the retained handoff once for its owner and thread`: foreign owner/thread/run/interrupt cannot consume it; replay fails.
- `applies global and host scope caps atomically and releases removed or abandoned handoffs`: enforces both caps and releases their capacity.
- `exchange expiry denies the tool while the retained continuation remains claimable`: the real exchange expires, its confirmation classifier denies, and retained state remains available.
- `hands an interrupt to the live consumer before finish and resumes on the same thread with a fresh run`: official event validation, live-before-done ordering, no collected interrupt, one finish, fresh run ID, parent ID and resume entries.

Mutations owed to combine: trust `forwardedProps`; omit owner/thread matching; leave a claimed record reusable; discard/cancel the continuation on exchange expiry.

API delta: `@jini-ai/chat/core/ag-ui` exports `confirmationInterrupt`, `readConfirmationResume`, `createAgUiPauseStore`. The interrupt helper takes the official `Interrupt` shape and emits a confirmation outcome. The resume reader validates `RunAgentInputSchema`, matches thread/parent/interrupt and accepts raw payload strings `allow`, `deny`, `dismissed`; cancelled status denies. The host combines this reader with an authenticated one-time claim. Pause-store methods are only `park`, `claim`, `remove`; host inputs are `caps: { global, perScope }`, `nowMs`, and one scope key per handoff. It stores owner/thread/original run/interrupt/state/abandon deadline, never an approval answer. `AgUiRunClient.resumeAgUiRun` is added to `transports/ag-ui` and the existing type re-export in `transports/http`. Existing start callers retain their input shape and behavior.

Diff reread deletions: none from the original tree. Removed new-only object-payload handling and redundant parser-side fresh-ID validation (the client mints IDs); removed its extra test input. Removed an unnecessary interrupt-only live-delivery condition so terminal events reach the live consumer before finish. Removed the duplicated cancellation-reader assertion from the expiry case and asserted the real exchange classifier instead. No existing test cases were removed.

## AG3A-J — done

Files:
- `packages/daemon/src/__tests__/surface-exchange-approval-marker.test.ts`
- `packages/chat/src/core/ag-ui/event-projection.ts`
- `packages/chat/src/core/ag-ui/__tests__/run-frames.test.ts`
- `.changeset/jm7-ag3a-pending-approval.md` — patch `@jini-ai/daemon` and `@jini-ai/chat`

Tests:
- `only the decision prompt carries pendingApproval on an exchange that later sends a result` (new daemon file: 0 → 1): same exchange, producer marker only on prompt; result bytes remain unchanged apart from existing recovery metadata.
- `only an explicitly marked pending approval projects an interrupt` (existing frame file: 5 → 6): ordinary and recovery-enabled result cards keep their existing projection; only the marked prompt interrupts via `confirmationInterrupt`.

Mutations owed to combine: stamp every exchange emission; interrupt on `surfaceExchange` alone.

API delta: semantic `SurfaceEmission.payload.pendingApproval` contract uses an official `Interrupt` object. Projection reads and validates this marker from the original frame before resource unwrapping. No core type, run-events entry or run-lifecycle changes. `surface-exchanges.ts` already spreads the open payload correctly, so it needs no production diff. No executable answer is added to result cards.

Diff reread deletions: none; no redundant marker copying or payload-contract type was introduced.

## AG4-J — done

Files:
- `packages/daemon/src/__tests__/frontend-session-ag-ui.test.ts`
- `packages/daemon/src/frontend-session-registry.ts`
- `packages/daemon/src/http/frontend-control.ts`
- `.changeset/jm7-ag4-begin.md` — patch `@jini-ai/daemon`

Tests (new file: 0 → 5 cases):
- `a refused tool never delivers an executable call to a client acting on TOOL_CALL_END`: real deny policy yields no delivery/action; a model call ID cannot begin.
- `a delivered live invocation can begin once before its acknowledgment`: first begin succeeds, replay fails, acknowledgment completes normally.
- `foreign owner, wrong run and wrong invocation cannot consume a delivered call`: mismatches fail without consuming; correct owner claims exactly once.
- `cancel before begin denies permission to act`: abort removes the live pending call.
- `executor timeout before begin denies permission to act`: real executor timeout removes the live pending call.

Mutations owed to combine: authorize execution from model events; skip live pending lookup; match tool name instead of invocation ID; leave begin reusable.

API delta: `FrontendSessionHandle.begin({ runId, invocationId }, optional = {})`; owner-bound `FrontendSessionRegistry.begin({ runId, invocationId, owner }, optional = {})` supports the facade; `FrontendControl.begin` exposes that same owner/run-checked operation through the existing HTTP entry. The shared private `begin` only claims an existing pending invocation. Registry delivery remains the only executable call source. Existing settlement clients need not call begin. The registry remains closed inside `FrontendControl`; no ungated invocation API is exposed. The agentic projection is untouched.

Diff reread deletions: none from the original tree. Removed a newly introduced facade forwarding closure; the facade references the registry's already-bound operation directly. No file crossed 500 lines. No new casts, dependencies, error-swallowing catches, named public types or unrelated helpers were added.
