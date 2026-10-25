<<SUBAGENT_DISPATCH>>
# AI-run tracing prototype — swappable adapter (Langfuse first) for prompts, model calls, tool calls, failures, cost — every provider (owner 2026-10-25)
Owner: "a branch prototype for a swappable adapter for things like Langfuse to record chat prompts, tool calls, all that stuff for each provider — Codex, OpenAI, Gemini, or whatever… see how we can track the AI behavior and failure." And: "the observability code for AI is going to be in Jini because that's where the agentic runtime is… if I wanted to use this for Open Marketing, I need to be able to do that." Prototype on branches; nothing merges. No human is watching: verify by measuring, never ask.

## What exists (build on it)
- Jini `packages/agent-runtime/src/telemetry-sink.ts`: `TelemetrySink` + `RunLifecycleEvent` (run_started/finished/failed, tool_use, artifact_written; opaque `data`; noop default). Find where it's emitted and who supplies a sink (Tovu? daemon?).
- Per-provider stream normalizers in agent-runtime: `claude-stream.ts`, `copilot-stream.ts`, `qoder-stream.ts`, `json-event-stream.ts`, `providers/openai-chat.ts`, `agent-protocol/acp/*` (Gemini/Codex via ACP or CLI), `claude-segment-usage.ts` (usage/cost). The normalized event stream is the natural single seam for ALL providers.
- Jini `packages/diagnostics/src/observability/` (`ObservabilityPort`, vendor-neutral) — a parallel cloud run (branches cloud/observability-1025-*) is extending it with operations/errors and moving OTel/Sentry into provider plugins. Do NOT edit those branches; mention in the plan how the two fit (e.g. AI traces could also export via OTel GenAI semantic conventions — Langfuse ingests OTel).
- Open Marketing (separate repo) uses `@jini-ai/agent-runtime`, `@jini-ai/diagnostics`, `@jini-ai/agentic`, `@jini-ai/chat` — so the contract must live in Jini and need nothing Tovu-specific.

## Owner rules
Generic contract in Jini; vendor SDKs (Langfuse etc.) only in a provider plugin/adapter, never core, lazily loaded only when configured, zero-cost when off. API args `(requiredObj, optionalObj = {})`, deps as ports, CCN ≤ 10, smallest change, move "why" comments never delete. Secrets/PII redacted before anything leaves the process (reuse Jini `core/src/redact.ts`); prompt/response capture must be switchable (off / metadata-only / full) because prompts can hold customer data.

## THE WORK
1. **Contract (Jini):** extend the existing TelemetrySink/RunLifecycleEvent (or a sibling port if that's cleaner — justify) to a trace shape: run (session/chat id, agent, provider, model) → model turns (input/output text per capture mode, tokens, cost, latency, stop reason) → tool calls (name, input, output, isError, duration, error class: input-validation vs execution vs denied vs timeout) → run outcome. Vendor-neutral names.
2. **Emit from every provider path** through the normalizers (Claude Code stream, Codex/ACP, OpenAI chat, Gemini if present, Copilot/Qoder if cheap). Show the per-provider mapping table; providers that can't supply a field say so (null), never fake it.
3. **Langfuse adapter** as a provider plugin/adapter (`langfuse` npm SDK; or its OTel endpoint — pick the simpler, justify) mapping trace → Langfuse trace/generation/span with tool spans and error levels. Test transport only — no network, no keys.
4. **Swap proof:** a noop adapter + an in-memory "recording" adapter + Langfuse, same recorded scenario (a run with 2 tool calls, one failing with an input-validation error like the real `content_post_create` "Unknown input 'body'" failure) → equivalent traces. Plus a fixture per provider stream proving the mapping.
5. **Host wiring sketch:** how Tovu supplies the sink (config + plugin) and how Open Marketing would (a few lines). Don't wire Open Marketing's repo — document it.
6. `AI-TRACING-PLAN.md`: before/after of the seam, provider table, capture modes + PII, cost/sampling, how Helicone / Arize Phoenix / OTel GenAI backends would slot in as other adapters, and what failure analytics it unlocks (tool failure rate by tool/provider/model, retries, cost per success).

## SETUP / BRANCHES
`hostname && nproc`. Node 24 + Tovu setup per `git show origin/cloud/overnight-1024-tovu:ADS-memory/reports/cloud-runs/2026-10-25-overnight/COMMON.md`. Jini: `git clone --branch cloud/overnight-1024-jini https://github.com/AINSEP/Jini.git /root/Jini && cd /root/Jini && git checkout -b cloud/ai-tracing-1025-jini`. Tovu: this branch `cloud/ai-tracing-1025-tovu`. Rebuild touched Jini packages; `JINI_PACKAGES_DIR=/root/Jini/packages npm run link:jini` if Tovu wiring is touched.
Verify: `tsc --noEmit -p` per touched Jini package (+ Tovu root `tsc -p tsconfig.json` if touched); touched + existing tests of touched files (vitest `--maxWorkers=2`); `npx eslint --rule 'complexity: ["error", 10]' <files>`.

## HARD CAPS (first hit → stop, write the report, push, END)
- 3 h wall clock (at 2 h 40 m stop new work). ~1.5M tokens. No subagents.
- Never push main, never force-push, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule. Push only to Tovu `cloud/ai-tracing-1025-tovu` and Jini `cloud/ai-tracing-1025-jini` (`git pull --rebase` first). Commit + push after each step.
- No real keys; no network to Langfuse or any backend.

## REPORT
`ADS-memory/reports/cloud-runs/2026-10-25-ai-tracing/REPORT.md` (+ AI-TRACING-PLAN.md): commits per repo, BEFORE/AFTER of the seam with code excerpts, provider mapping table, test + tsc numbers, swap proof, top 3 owner questions, what it does NOT cover. End with "AITRACE DONE <UTC>", wall, rough tokens.
