# BYOK Gemini model discovery + execution-mode readiness

Symptom 1 (Gemini model discovery) has a landed fix in both repos, tested. Symptom 2
(BYOK row "not configured") does **not** have a landed fix, because it is not a bug:
the label is currently an *accurate* description of a mode that was never wired to any
execution path. Details below.

**Related notes** (read together, not duplicated here):

- `ADS-memory/reports/recon/2026-08-04-byok-root-cause.md` — this Programmer's own
  interim root-cause report, persisted by the Coordinator before the fix landed. Same
  content as the "Root cause" subsections below, without the fix/test/verification
  material added afterward.
- `ADS-memory/reports/recon/2026-08-04-spec-047-midpoint-findings.md` — a parallel
  SPEC-047 Spec Agent's independent resolution of OQ-1 ("does BYOK normalize tool calls
  the same way the daemon path does"), reached by grepping provider-tool-turn call
  sites rather than tracing the daemon's executor. Its conclusion and this note's
  Symptom 2 finding corroborate each other from two different directions — see the
  OQ-1 section below for the cross-check.

## Symptom 1 — "Could not load live models" despite a saved, working key

### Root cause (confirmed, not the dispatch brief's hypothesis)

The brief's lead was that `listModels` and `testConnection` might read `apiKey` from
different config objects. That is refuted:

- `apps/admin/src/lib/execution-settings.ts:390-416` — both methods read `config.apiKey`
  off the identical `ByokConfig` parameter. No divergence.
- `apps/admin/src/sections/SettingsUi.tsx:279-287` gates the whole Settings UI on every
  slice's value being non-null, so `ExecutionTab` never mounts with a stale/empty
  config — the real, already-saved key (from `localStorage`) is present on the very
  first render.

The actual root cause is in Jini, in `packages/ui/src/features/execution/react/
components/ExecutionTab.tsx:99-111`. The model-discovery `useEffect` deliberately
excludes `apiKey` from its trigger dependencies (only `protocol`/`baseUrl`/`providerId`
re-trigger it) to avoid spamming the provider on every keystroke. Its own inline comment
claimed a mitigation that did not exist in the code:

> "An operator who pastes a new key without touching the endpoint can still force a
> refresh via 'Test connection' below."

`onTestConnection={() => testConnection(config.byok)}` (old line 212) called **only**
`testConnection` — never `loadModels`. Nothing else in `useExecutionTab.ts` or
`ByokProviderForm.tsx` wired a successful connection test back into a models refresh
either.

Net effect: the first time discovery ran for a preset (e.g. before any key was ever
saved for it, or after any transient failure) it produced the raw upstream error and
left it on screen **permanently** — typing a key, saving it, and even confirming it
works via a green Test Connection never cleared it, because nothing re-triggered
discovery. This exactly matches the report: key saved and masked, Test Connection green,
Model field still red.

Separately, and true regardless of the above: neither
`src/server/routes/admin/assistant/list-models.ts:51-74` nor
`test-connection.ts:62-79` validated `apiKey` non-empty before forwarding to the
provider — an empty key reached the provider and came back as a generic,
protocol-specific "no credential" error (Google's "Method doesn't allow unregistered
callers…" is that exact error). This is the class-wide gap the brief's item 3 asked to
close.

A third theory was checked and **not** treated as confirmed: Google's completion smoke
test sends the key via the `x-goog-api-key` header (`connection-test.ts:234`), while
model listing sends it only via the `?key=` query param (`google.ts:43-47`,
`providerModelsHeaders` returns `{}` for `google`). That asymmetry is real, but Google's
ESP only returns the "unregistered callers" message when it sees *no* credential at
all, and a non-empty `?key=` should register fine — so this was left alone. No evidence
was found that it is load-bearing; changing it would have been unjustified scope creep.

### Fix

**Jini** (`/Users/la/Programming/Jini`, branch `refactor/jini-admin-extraction`):

- `packages/agent-runtime/src/providers/model-catalog.ts` — `listProviderModels` now
  fails fast locally (`{ok:false, kind:'auth_failed', detail:'No API key — model
  discovery needs the key from this browser.'}`) for `openai`/`senseaudio`/`anthropic`/
  `google` when `apiKey` is empty/whitespace, before any DNS or network access.
  `aihubmix` is exempt (its catalogue is public, matching the existing
  `providerModelsHeaders` behavior for a blank key).
- `packages/agent-runtime/src/providers/connection-test.ts` — `testProviderConnection`
  gets the same guard for all 4 supported protocols (`anthropic`/`openai`/`azure`/
  `google`), checked after the unsupported-protocol check and before the base-URL SSRF
  validation.
- `packages/ui/src/features/execution/react/components/ExecutionTab.tsx` — clicking
  "Test connection" now also calls `loadModels(config.byok)` alongside
  `testConnection(config.byok)`, so a stale discovery failure self-heals the moment the
  operator confirms the same config actually works, making the removed comment's claim
  true instead of aspirational.
- Both packages rebuilt (`npm run build` in each) — Tovu's `node_modules/@jini-ai/
  {agent-runtime,ui}` are symlinks to `../../../Jini/packages/*`, so the fix is live for
  Tovu immediately; no separate publish/copy step was needed in this checkout.

**Tovu** (`/Users/la/Programming/Tovu`, same branch): no source fix needed — the routes
already delegated to the Jini functions above and needed no additional validation of
their own. Added route-level tests proving the guard's response reaches the client
through Tovu's proxy (see Tests below).

### Tests (all run scoped, per repo convention — never a full-suite run)

- `npm --prefix packages/agent-runtime run test -- providers/__tests__/model-catalog.test.ts` — 48 passed
  (8 new: empty/whitespace key rejected for each of openai/senseaudio/anthropic/google,
  aihubmix explicitly exempted).
- `npm --prefix packages/agent-runtime run test -- providers/__tests__/connection-test.test.ts` — 20 passed
  (5 new: empty key rejected for each of anthropic/openai/azure/google, plus a
  whitespace-key case checked ahead of an otherwise-invalid base URL).
- `npm --prefix packages/ui run test -- features/execution/__tests__/react/components/ExecutionTab.test.tsx` — 19 passed
  (1 new: clicking "Test connection" calls the port's `listModels` a second time with
  the current `byok` config, proving the stale-error case self-heals).
- Tovu: `node --import tsx --test "src/server/__tests__/admin-assistant-execution-routes.test.ts"` — 11 passed
  (2 new: `test-connection`/`list-models` both surface `{ok:false, message:/no api
  key/i}` for an empty Gemini key, through the real route, proving the fix is actually
  reachable from Tovu's own HTTP surface, not just unit-tested in Jini).

All fake/placeholder API keys only (`sk-test`, `sk-ant-test`, `""`) — no real key was
used or could have been, since none was available in this environment.

### What remains unverified

No browser and no real Gemini API key were available in this environment. **Not
verified end-to-end.** What the owner should check in a real browser:

1. Settings → Execution mode → BYOK → Google Gemini, with a real key saved: the Model
   field's discovery error should now clear itself after clicking "Test connection"
   (previously it required changing protocol/base URL/provider to ever re-fire).
2. Deliberately clear the API key field (don't save) and click "Test connection": both
   the connection-test status and the model-discovery hint should now show a clear
   local "No API key…" message instead of a raw upstream error, for all of
   Anthropic/OpenAI/Azure/Google.
3. The header-vs-query-param Google asymmetry noted above (not fixed, evidence
   inconclusive) — if the discovery error still reproduces in a real browser
   *immediately after* a fresh "Test connection" click (i.e. the self-heal above ran
   but still failed) with a real, unrestricted key, that would be evidence the query-
   param path itself needs to move to the `x-goog-api-key` header. Worth a quick manual
   check before assuming this repo's part is done.

## Symptom 2 — "Use API · BYOK" always shows "not configured"

**This is not a display bug.** "Not configured" is currently an accurate report of a
mode that was never wired to any execution path — not a readiness predicate reading the
wrong storage location, which was the original hypothesis. Making it say "configured"
would be the actual bug: it would offer the operator a mode that does nothing.

### Root cause (confirmed, refutes the dispatch brief's hypothesis) — no fix landed

The brief's lead was a server-side readiness predicate computed from the ledger, which
can never see the browser-local key. There is no such predicate anywhere — the string
"not configured" for this row is a plain, host-supplied UI label with a hardcoded
default:

- `packages/chat/src/react/features/chat-pane/react/components/AgentRuntimePicker.tsx:29-75`
  (Jini `chat` package) — `apiModeAvailable`/`executionMode`/`onExecutionModeChange` are
  ordinary props with defaults `apiModeAvailable = false`, `executionMode = 'local'`.
  When `apiModeAvailable` is false, the row renders disabled with the `'not
  configured'` meta text (line 68).
- `apps/admin/src/components/AssistantDock.tsx` — the **only** place Tovu renders this
  picker (via `<ChatPane>`, the picker's host) — never passes any of the three props.
  The default therefore always applies, completely independent of anything saved in
  Settings → Execution mode.

So wiring `apiModeAvailable` from the saved `ExecutionConfig`'s BYOK completeness would
make the label accurate to "a key is saved" — but that is not the same as the mode being
usable, and it is not usable today:

- `src/assistant/agent-daemon-server.ts` (the daemon `AssistantDock`'s runs actually go
  through) builds its `AgentExecutor` via `@jini-ai/daemon`'s `createAgentExecutor`,
  which only spawns local CLI subprocesses. There is no `apiKey`/provider-config
  handling anywhere in that file, nor in `apps/admin/src/lib/assistant-transport.ts`.
- `packages/chat/src/react/features/chat-pane/react/components/ChatPane.tsx` does
  nothing with `executionMode` beyond passing it straight through to the picker — the
  three props carry no built-in dispatch behavior; a host is expected to implement
  what "api mode" actually does.

In short: the Settings-tab BYOK credentials saved via `execution-settings.ts` currently
have **no consumer that performs real execution** anywhere in Tovu. Flipping
`apiModeAvailable` to `true` without also building that execution path would swap one
dishonest label ("not configured" when a key is saved) for a worse one (a seemingly
working "Use API" button that silently still runs local CLI, or errors) — the same
"architectural, don't smuggle it" situation the dispatch brief anticipated for symptom 1,
except it actually applies to symptom 2.

### Why no fix landed here

Building a real BYOK execution path in the daemon — accept per-run provider config,
call `@jini-ai/agent-runtime`'s provider clients directly instead of spawning a CLI
subprocess, thread that through `runContext`/the transport, decide what "api mode" means
for tool execution (see OQ-1 below) — is a separate, materially larger feature than this
bug-fix scope, not a guard or a stale-cache fix. It was not built. Options for whoever
picks this up next:

- **A.** Build the daemon-side BYOK execution path for real, then wire
  `apiModeAvailable`/`executionMode`/`onExecutionModeChange` into `AssistantDock.tsx`
  from the saved `ExecutionConfig`.
- **B.** Leave the picker's "Use API · BYOK" row absent/disabled (current, de facto
  behavior) until (A) is scheduled, and treat the confusing part not as a bug but as a
  documentation gap: an operator who saves a BYOK key in Settings has no way to know,
  from that screen alone, that nothing in Tovu currently uses it for the admin dock's
  chat.

### Tests / verification

None added — no behavior changed. The finding is code-reading only, confirmed by
tracing every file listed above; no browser was available to double-check the rendered
label, but the prop-plumbing evidence is unambiguous (the prop is simply never passed).

## OQ-1 — RESOLVED: BYOK has no live tool-calling consumer at all (two independent traces)

While tracing symptom 2 from the daemon side (`agent-daemon-server.ts` has zero
`apiKey`/provider-config handling — see above), a parallel SPEC-047 Spec Agent
independently resolved SPEC-046/047's open question OQ-1 from the opposite direction —
grepping every provider-tool-turn function's call sites across `src/` and `apps/`
(`ADS-memory/reports/recon/2026-08-04-spec-047-midpoint-findings.md`):

- `runAnthropicToolTurn` / `runOpenAiToolTurn` / `runAzureToolTurn` — zero call sites
  anywhere in Tovu.
- `runGoogleToolTurn` — exactly one call site, in the **public** site-assistant
  (SPEC-046), which hardcodes Google server-side and bypasses the BYOK/browser-key flow
  entirely.

**Independently re-verified here**, not taken on the other agent's word:

```
$ grep -rn "runAnthropicToolTurn\|runOpenAiToolTurn\|runAzureToolTurn\|runGoogleToolTurn" src/ apps/
# runAnthropicToolTurn / runOpenAiToolTurn / runAzureToolTurn: no matches at all
# runGoogleToolTurn: src/server/modules/site-assistant.ts:262, one call site
```

`src/server/modules/site-assistant.ts:190` confirms the "hardcodes Google server-side"
half of the claim directly: `const apiKey = env.GEMINI_API_KEY?.trim();` — a server
environment variable, not anything read from the admin's Settings-tab BYOK config or
the browser's `localStorage`. That file's own header comment (lines 13-19) even states
the reasoning explicitly: the public route calls the provider adapter in-process
specifically *because* the generic model-proxy route requires a caller-supplied
`apiKey` in the POST body with "no server-side injection hook" — correct for the
admin's BYOK Execution mode, but a key-leak risk for anonymous public traffic. That
comment's phrase "correct for the admin's BYOK Execution mode" reads as if a working
BYOK execution mode exists elsewhere to contrast against; per the daemon-side trace
above, it does not — Execution mode's saved config has no consumer at all today, admin
or public.

Two independent traces (provider-call-site grep vs. daemon-executor trace), same
conclusion: **BYOK today is settings-and-probe scaffolding only** — test-connection,
list-models, detect-agents — with no live tool-calling consumer for any protocol.
Whoever builds Symptom 2's Option A (a real daemon-side BYOK execution path) will need
to design tool-call normalization for it from scratch — the daemon path
(`agent-daemon-server.ts`) normalizes tool calls exclusively through `@jini-ai/daemon`'s
`DelegatedToolBridge`/`ToolExecutor`, which is CLI-subprocess-shaped (MCP-injected
`.mcp.json`, `/api/delegated-tool-calls`); nothing in `@jini-ai/agent-runtime`'s
provider clients (`anthropic-messages.ts`, `google-messages.ts`, etc.) plugs into that
bridge today. This is not a small gap to close alongside the execution path — it is
part of the same work. Not built here, per the dispatch brief's explicit instruction
not to.
