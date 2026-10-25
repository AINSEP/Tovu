# AI-run tracing — plan & prototype (2026-10-25, cloud run, branches only)

Owner ask: a swappable adapter (Langfuse first) recording prompts, model calls, tool calls,
failures and cost for **every** agent provider; contract in Jini so Open Marketing can reuse it.

Prototype code: Jini branch `cloud/ai-tracing-1025-jini` (**local only — push refused, see REPORT**),
shipped here as `jini-patches/jini-ai-tracing.diff` (applies cleanly to Jini `3e2fbae8`,
`git apply jini-patches/jini-ai-tracing.diff`).

---

## 1. The seam — before / after

### Before
`packages/agent-runtime/src/telemetry-sink.ts` defines `TelemetrySink` / `RunLifecycleEvent`
(`run_started | run_finished | run_failed | tool_use | artifact_written`, opaque `data`), but
**nothing in Jini emits it** (only `ports.test.ts` references it), and nothing supplies a sink.

What *does* exist is a de-facto universal vocabulary: every provider normalizer already emits
the same event shapes before the daemon sees them:

```ts
// claude-stream.ts (same shapes in copilot-stream, qoder-stream, json-event-stream, ACP session, tool-turn)
| { type: 'status'; label: string; model?: unknown; ttftMs?: number }
| { type: 'text_delta' | 'thinking_delta'; delta: string }
| { type: 'tool_use'; id: unknown; name: unknown; input: unknown }
| { type: 'tool_result'; toolUseId: unknown; content: string; isError: boolean }
| { type: 'usage'; usage: unknown; costUsd: unknown; durationMs: unknown; stopReason: string | null }
| { type: 'error'; message: string; code: string }
```

and every daemon path (child stream parsers, ACP, pi-rpc) publishes them through ONE call:

```ts
// daemon/src/agent-executor/events.ts (×15 call sites)
lifecycle.emit({ runId, input: { event: 'agent', data } })
```

### After (prototype)
1. **Contract** `agent-runtime/src/ai-trace/types.ts` — a *sibling* port `AiTraceSink { record(event); flush?(); shutdown?() }`
   with `AiTraceEvent = run_started | model_turn | tool_call | run_finished`.
   *Why sibling, not more `RunLifecycleEvent` variants:* `TelemetrySink` is the product-analytics
   port whose `data` is deliberately opaque; a trace is a typed span tree every backend maps
   field-for-field. Widening the analytics union would force analytics sinks to understand spans.
   (`TelemetrySink` can later be fed *from* the recorder if anyone wants `tool_use` analytics.)
2. **Recorder** `ai-trace/recorder.ts` — `createAiTraceRecorder({ sink, runId, agentId }, { provider, model, sessionId, capture, priceUsage, … })`
   consumes the normalized vocabulary (`observe(event)`), zero per-vendor code.
3. **Single tap** `daemon/src/ai-trace-lifecycle.ts` — `withAiTracing({ lifecycle, sink }, options)`
   decorates `RunLifecycle.start/emit/finish`. Because every provider path converges on
   `lifecycle.emit`, this one decorator traces Claude Code, Codex, Copilot, Qoder, OpenCode,
   Cursor, Kimi, ACP agents (Gemini etc.) and pi-rpc.
4. **Host knob** `server/src/kernel-base.ts` — optional `aiTrace: { sink, capture, … }` on
   `CreateJiniKernelBaseOptions`; absent ⇒ the lifecycle is not wrapped at all.
5. **Adapters** — `noopAiTraceSink`, `createRecordingAiTraceSink` (in-memory),
   `createFanOutAiTraceSink`, `createLazyAiTraceSink` (bounded queue while an SDK loads), and
   `@jini-ai/agent-runtime/ai-trace/langfuse` (separate subpath; SDK dynamically imported only
   when configured).

```ts
// AFTER — the whole tap (daemon/src/ai-trace-lifecycle.ts, abridged)
async emit(args) {
  const event = await lifecycle.emit(args);            // run behaviour unchanged, trace after
  const recorder = recorders.get(args.runId);
  if (args.input.event === 'agent') recorder?.observe(args.input.data);
  if (args.input.event === 'error') recorder?.observe({ type: 'error', message: args.input.data.message });
  return event;
},
```

### Trace shape
```
run_started  { traceId, runId, agentId, provider, model, sessionId, input?, tags }
 ├─ model_turn { turnId, index, model, input?, output?, reasoning?, usage{in,out,cacheRead,cacheWrite,reasoning}, costUsd, costSource, ttftMs, stopReason, error, startedAt, endedAt }
 │    └─ tool_call { toolCallId, turnId, name, input?, output?, isError, errorClass: input_validation|execution|denied|timeout, startedAt, endedAt|null }
 └─ run_finished { outcome: succeeded|failed|cancelled, error{message,code}, totals{turns, toolCalls, toolErrors, inputTokens, outputTokens, costUsd} }
```
A **model turn = one provider usage-report window**: HTTP providers report per model call
(one turn per call); Claude Code / Copilot / Qoder CLIs report once per run (one turn holding all
tool calls). That is the granularity the provider gives — not a guess. `null` = not reported.

---

## 2. Provider mapping table (measured by fixtures through the REAL normalizers)

Fixtures: `agent-runtime/src/ai-trace/__tests__/providers.test.ts`.

| Provider path (normalizer) | model | tokens in/out | cache | reasoning | cost | tool calls | tool result text | isError / class | turn granularity |
|---|---|---|---|---|---|---|---|---|---|
| Claude Code CLI (`claude-stream`) | ✅ init/status | ✅ | ✅ read (+write when sent) | ❌ null | ✅ provider (`total_cost_usd`) | ✅ | ✅ | ✅ / ✅ | 1 per CLI run (result frame) |
| GitHub Copilot CLI (`copilot-stream`) | ✅ | ❌ null (CLI reports duration only) | ❌ | ❌ | ❌ null | ✅ | ✅ | ✅ / ✅ (`denied` measured) | 1 per run |
| Qoder CLI (`qoder-stream`) | ✅ | ✅ | ❌ | ❌ | ✅ provider | ❌ **stream has no tool events** | — | — | 1 per run |
| Codex CLI (`json-event-stream` codex) | ✅ thread/turn receipts | ✅ | ✅ read | ❌ | ❌ null | ✅ command, MCP, file_change | ✅ (file_change = placeholder text) | ✅ exit_code / MCP error ✅ | 1 per `turn.completed` |
| ACP agents — Gemini CLI, Codex-ACP, … (`acp/session`) | ✅ `current_model_update` | ✅ | ✅ read | ✅ thought | ❌ null | ⚠️ **only artifact writes** (name `Write`) | ❌ none | failed status only, no text → class `execution` | 1 per prompt |
| HTTP OpenAI / Azure / Anthropic / Google (`runProviderToolTurn`) | ❌ not in stream → host passes `model` option | ✅ per call | ✅ (OpenAI `prompt_tokens_details`) | ✅ (OpenAI/Google) | ❌ → `priceUsage` hook marks `estimated` | ✅ | ✅ | ✅ (`[tool error]` fold) / ✅ | **1 per model call** ✅ |
| OpenCode / Cursor / Kimi (`json-event-stream`) | receipts exist | OpenCode ✅ | ? | ? | OpenCode ✅ | ✅ | ✅ | ✅ | **not fixture-tested this run** |
| pi-rpc | via same `lifecycle.emit` | ? | ? | ? | ? | ? | ? | ? | **not fixture-tested** |

Measured gaps worth fixing at the source (not faked in the recorder):
1. **ACP tool calls are invisible** except artifact writes (`session.ts` `mirrorArtifactWriteToolEvent`).
   A Gemini run's failed shell/MCP call never reaches the trace. Fix = emit `tool_use`/`tool_result`
   for every `tool_call`/`tool_call_update` with terminal status (UI-visible change → owner call).
2. **Qoder** stream carries no tool events at all.
3. **HTTP tool-turn ordering**: adapters emit `usage` while streaming and `tool_use` after the
   stream ends. The recorder attributes such a call to the turn that just closed (measured bug,
   fixed in commit 2).
4. **Cost** is only provider-reported for Claude Code, Qoder, OpenCode. Everyone else is `null`
   unless the host supplies `priceUsage` (then `costSource: 'estimated'`).

---

## 3. Capture modes + PII

`capture: 'off' | 'metadata' | 'full'` (default **`metadata`**) applies to prompt, model output,
reasoning, tool input and tool output alike.

| mode | what leaves the process |
|---|---|
| `off` | no text, no lengths — only structure, tokens, cost, timings, tool names, error classes |
| `metadata` | character counts only (`{ chars }`) |
| `full` | text after `@jini-ai/core` `redactSecretsWithCounts` (credential shapes, labeled secrets, email, phone, Luhn cards, host `exactSecrets`), then truncated to `maxCapturedChars` (16 000), with per-category redaction counts |

- Redact **before** truncate (a cut through a secret would leave an unmatched prefix).
- In `off`/`metadata` the recorder does not even keep the streamed text (counts only) — measured
  44–48 ns/event vs 455 ns/event in `full`.
- What redaction does NOT catch: names, addresses, business secrets, anything semantic. That is
  why `metadata` is the default; `full` should be a per-tenant/per-environment opt-in.
- Langfuse also offers server-side masking; client-side redaction is still required because the
  rule is "nothing sensitive leaves the process".

## 4. Cost & sampling
- Cost precedence: provider-reported (`costSource: 'provider'`) > host `priceUsage` (`'estimated'`) > `null`.
  Never inferred silently.
- Overhead (measured, Node 24, 200k events): ≈45–70 ns/event recording with `metadata`; ≈0.45–0.53 µs with `full` redaction.
  No tracing configured ⇒ the lifecycle is not wrapped (literally zero).
- Sampling (not built): decide at `start()` — e.g. `sample: ({ agentId }) => boolean` in
  `AiTracingOptions`; always keep failed runs by buffering a run's events and dropping them at
  `finish` only when `outcome === 'succeeded'` and the sample says no ("tail sampling").
- Backends batch: Langfuse SDK batches/retries itself; `flush()` on request end in serverless,
  `shutdown()` on process exit.

## 5. Backends as adapters (same port)

| Backend | How it slots in |
|---|---|
| **Langfuse** (built) | `loadLangfuseAiTraceSink({ publicKey, secretKey }, { baseUrl })` → trace / generation per turn (`usageDetails`, `costDetails`, `completionStartTime`) / span per tool (`parentObservationId` = turn, `level: ERROR`, `statusMessage` = error class). SDK client shape chosen over Langfuse's OTel endpoint: 4 calls with built-in batching/retry/upsert-by-id vs. an OTel SDK + exporter + GenAI attribute mapping. |
| **OTel GenAI semconv** (generic) | One `otel` adapter mapping `model_turn` → span `gen_ai.chat` (`gen_ai.request.model`, `gen_ai.usage.input_tokens/output_tokens`, `gen_ai.response.finish_reasons`), `tool_call` → `gen_ai.execute_tool` span (`gen_ai.tool.name`, `gen_ai.tool.call.id`, `error.type`). Should be built *inside* the diagnostics OTel provider plugin the parallel `cloud/observability-1025-*` run is creating, reusing its tracer — then Langfuse (which ingests OTLP), Arize Phoenix, Honeycomb, Datadog all work through it. |
| **Arize Phoenix** | Either the OTel adapter above (Phoenix is OTLP + OpenInference), or a thin adapter mapping to OpenInference attribute names (`llm.token_count.prompt`, `tool.name`). |
| **Helicone** | Proxy-style (rewrites the provider base URL) — fits only the HTTP `runProviderToolTurn` path, not CLIs. As an adapter: its async logging API (`/custom/v1/log`) from `model_turn` events. Lower fidelity for CLI agents. |
| Recording / noop / fan-out | built; fan-out lets Langfuse + a local JSONL debug log run together. |

Relation to `diagnostics/observability` (`ObservabilityPort`): that port is ops telemetry
(operations, errors, metrics). AI traces stay a separate port because their payload is
prompt-bearing and has its own capture/redaction policy; the bridge is the future OTel GenAI
adapter living in the same OTel plugin, so one exporter carries both.

## 6. Host wiring

### Tovu (sketch — not applied; needs the Jini packages published/linked first)
`apps/website/src/server/inbound/assistant/agent-daemon-server.ts:479` builds the lifecycle
synchronously at module load, so it uses the lazy sink:

```ts
import { createRunLifecycle, withAiTracing } from "@jini-ai/daemon";
import { createLazyAiTraceSink } from "@jini-ai/agent-runtime";

function aiTraceSinkFromEnv(env: NodeJS.ProcessEnv) {
  if (env.TOVU_AI_TRACE !== "langfuse") return null;                       // off ⇒ nothing loaded
  return createLazyAiTraceSink({
    load: async () => (await import("@jini-ai/agent-runtime/ai-trace/langfuse"))
      .loadLangfuseAiTraceSink({ publicKey: env.LANGFUSE_PUBLIC_KEY!, secretKey: env.LANGFUSE_SECRET_KEY! }, { baseUrl: env.LANGFUSE_BASE_URL }),
  }, { onLoadError: (error) => console.warn("[ai-trace] langfuse unavailable; tracing off", error) });
}

const baseLifecycle = createRunLifecycle({ eventLog }, { dropEventsOnEviction: true });
const aiTraceSink = aiTraceSinkFromEnv(process.env);
const lifecycle = aiTraceSink
  ? withAiTracing({ lifecycle: baseLifecycle, sink: aiTraceSink }, {
      capture: (process.env.TOVU_AI_TRACE_CAPTURE as "off" | "metadata" | "full") ?? "metadata",
      exactSecrets: [process.env.ANTHROPIC_API_KEY, process.env.OPENAI_API_KEY],
    })
  : baseLifecycle;
// + call lifecycle.noteRunInput({ runId, input: promptText }) where the prompt is sent (if capture != off)
// + await aiTraceSink?.shutdown() in the existing close-store-on-shutdown path
```
- `langfuse` as an `optionalDependencies` entry of `apps/website` only.
- BYOK HTTP path (`apps/website/src/assistant/byok-provider-turn.ts` → `runProviderToolTurn`)
  is not on the daemon lifecycle: wrap its `onEvent` with a recorder
  (`createAiTraceRecorder({ sink, runId, agentId: 'byok' }, { provider: protocol, model })`).
- Desktop (`apps/desktop/src/desktop-agent.ts:310`) is the same 3-line wrap.
- Secrets: env/Secret Manager only; capture mode per environment (`metadata` in prod).

### Open Marketing (document only)
If it boots through `@jini-ai/server`:
```ts
const kernel = await createJiniKernelBase({
  storage,
  aiTrace: { sink: createLazyAiTraceSink({ load: () => import("@jini-ai/agent-runtime/ai-trace/langfuse")
    .then((m) => m.loadLangfuseAiTraceSink({ publicKey, secretKey })) }), capture: "metadata" },
});
```
If it drives runs itself: `withAiTracing({ lifecycle, sink })` (needs `@jini-ai/daemon`), or —
with only `@jini-ai/agent-runtime` — `createAiTraceRecorder(...)` and pipe whatever normalized
events it already consumes through `observe()`. Nothing Tovu-specific is involved.

## 7. Failure analytics this unlocks
Every `tool_call` carries `{ name, isError, errorClass, turnId }` and every run carries
`{ agentId, provider, model, outcome, totals }`, so a backend query can answer:
- **Tool failure rate by tool × provider × model**, split by class: `input_validation` (the model
  called it wrong — schema/prompt problem, e.g. `content_post_create` "Unknown input 'body'") vs
  `execution` (tool bug) vs `denied` (approval/policy) vs `timeout`.
- **Retries**: consecutive `tool_call`s with the same `name` after an `input_validation` error
  inside one trace (the scenario fixture shows exactly this pattern); retry-success rate per model.
- **Cost per success**: `sum(totals.costUsd) / count(outcome = succeeded)` per agent/model; cost
  wasted on failed runs; tokens per tool error.
- **Latency**: TTFT and turn duration per provider; tool duration p95 per tool; unresolved tools
  (`endedAt: null`) = hangs/cancellations.
- **Provider regressions**: failure-class mix shifting after a CLI/model upgrade.

## 8. What it does NOT cover
- No real Langfuse round-trip (no keys, no network by rule) — transport is tested against a
  recording fake of the SDK client shape (`trace/generation/span/flushAsync/shutdownAsync`, the
  `langfuse` v3 JS client API). The v4 SDK is OTel-based; a v4 adapter = the OTel adapter above.
- No Tovu code changed; no sampling; resumed runs are not re-traced; sub-agent / delegated runs
  are separate traces (no parent link yet); ACP/Qoder source gaps are documented, not fixed.
- Error classification is lexical on the result text; an unhelpful message lands in `execution`.
