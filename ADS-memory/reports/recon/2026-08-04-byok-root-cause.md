# BYOK — confirmed root causes for both symptoms

**Date:** 2026-08-04
**Source:** Programmer (dispatched subagent, Sonnet 5), interim report before the fix
**Status:** interim, persisted on arrival. Both of the Coordinator's original hypotheses were
**refuted**; the real causes are below.

## Symptom 1 — Gemini model discovery shows a red error while Test Connection is green

### Refuted: "each call site passes a different config object"

`apps/admin/src/lib/execution-settings.ts:390-416` — `testConnection` and `listModels` read
`config.apiKey` from the *same* `ByokConfig` parameter. No divergence. And
`apps/admin/src/sections/SettingsUi.tsx:279-287` gates the whole Settings UI on
`slices.value !== null`, so `ExecutionTab` never mounts with a stale or empty config — the saved
localStorage key is present on the first render.

### Confirmed root cause — a stale error that nothing can clear

`Jini/packages/ui/src/features/execution/react/components/ExecutionTab.tsx:99-111`. The
model-discovery `useEffect` deliberately excludes `apiKey` from its trigger deps (protocol, baseUrl
and providerId only) "to avoid spamming the provider on every keystroke". Its inline comment then
claims:

> "An operator who pastes a new key without touching the endpoint can still force a refresh via
> 'Test connection' below."

**That claim is false.** Line 212's `onTestConnection={() => testConnection(config.byok)}` calls only
`testConnection` — never `loadModels`. Grepping the component tree (`useExecutionTab.ts`,
`ByokProviderForm.tsx`) found nothing wiring a successful connection test back to a models refresh.

Net effect: the first time discovery ran for this preset — before any key existed, or on any earlier
transient failure — it produced the red error, and **nothing re-triggers it.** Not typing a key, not
saving it, not a successful Test Connection. The error is permanently stale until the operator
changes protocol, baseUrl or providerId. That matches the report exactly: key saved and masked, Test
Connection green, Model field still red.

See [[feedback_verify_claims_in_code_comments]] — this is a second measured instance of an
evidence-shaped comment in this workspace asserting behavior the code does not implement.

### Confirmed, independent of the above: no empty-key guard

`src/server/routes/admin/assistant/list-models.ts:51-74` and `test-connection.ts:62-79` never
validate `apiKey` as non-empty before forwarding to the provider. Class-wide gap across protocols.

### Noted, deliberately NOT acted on

Google sends the key via an `x-goog-api-key` header on the completion call
(`connection-test.ts:234`) but only via a `?key=` query param on model listing (`google.ts:43-47`).
A real asymmetry — but Google's ESP returns "unregistered callers" only when it sees *no* credential,
and a non-empty `?key=` should authenticate fine. No evidence it is implicated; changing it would be
unjustified scope creep. Recorded so it is not rediscovered as novel.

## Symptom 2 — the "Use API · BYOK" row is greyed out as "not configured"

### Refuted: "a server-side readiness predicate reads the ledger, which never sees the key"

**There is no server-side readiness predicate at all.**

### Confirmed cause

`Jini/packages/chat`'s `AgentRuntimePicker.tsx:36-75`: `apiModeAvailable`, `executionMode` and
`onExecutionModeChange` are plain props with hardcoded defaults — `apiModeAvailable = false`. Tovu's
only render of this picker, `apps/admin/src/components/AssistantDock.tsx`'s `<ChatPane>` call, never
passes any of the three. The default therefore always applies, entirely independent of what Settings
has saved.

### But wiring the prop through is NOT the fix

`src/assistant/agent-daemon-server.ts` has **no execution path that could run a BYOK/API-provider
request.** `createAgentExecutor` (`@jini-ai/daemon`) only spawns local CLI subprocesses; there is zero
`apiKey` / `providerConfig` / `executionMode` handling in that file or in `assistant-transport.ts`.
`ChatPane.tsx` does nothing with `executionMode` beyond passing it to the picker.

So a fully-wired prop would light up a working-looking "Use API · BYOK" button with nowhere to
dispatch to — trading one dishonest label for another.

**This independently corroborates SPEC-047's OQ-1 finding** (see
`2026-08-04-spec-047-midpoint-findings.md`), reached from a different direction: that agent traced
provider-function call sites and found none; this one traced the daemon's executor and found no
provider handling. Two paths, same conclusion.

## Scope decision (Coordinator)

- **Fix Symptom 1**: the class-wide empty-key guard in `listProviderModels` /
  `testProviderConnection`, plus making `ExecutionTab` refresh model discovery on a successful Test
  Connection so the stale-error case self-heals and the comment's claim becomes true.
- **Do NOT wire the Symptom 2 prop.** Write it up as a confirmed architectural finding with options.
  Building a real BYOK execution path in the daemon — accepting per-run provider config and calling
  `@jini-ai/agent-runtime` providers directly instead of spawning a CLI — is a separate feature and
  an owner decision, not a bug fix.
