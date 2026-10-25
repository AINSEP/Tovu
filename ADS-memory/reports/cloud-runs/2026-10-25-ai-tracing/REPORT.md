# AI-run tracing prototype — REPORT (cloud run 2026-10-25)

Plan / design / provider table / host wiring: **AI-TRACING-PLAN.md** (same folder).
Env: `vm`, 4 cores, Node 24.22.0, Jini at `3e2fbae8` (cloud/overnight-1024-jini). Unattended; nothing merged.

## ⚠️ Jini push was refused
`git push origin cloud/ai-tracing-1025-jini` → `403: AINSEP/Jini is not in this session's authorized
repository set`. Attaching the repo (`add_repo`, push access) reported `push_check: refused` — the
Claude GitHub App has no write access to AINSEP/Jini for this org. Fix: an org admin installs the
Claude GitHub App on AINSEP/Jini (https://github.com/apps/claude/installations/select_target) or
reconnects GitHub in claude.ai settings.
**Fallback (rules allow pushing only the Tovu branch):** the whole Jini change is in
`jini-patches/jini-ai-tracing.diff` (squashed, `git apply --check` OK on `3e2fbae8`) with the 7
local commit subjects in `jini-patches/COMMITS.txt`. To land it:
`cd Jini && git checkout -b cloud/ai-tracing-1025-jini 3e2fbae8 && git apply <tovu>/ADS-memory/reports/cloud-runs/2026-10-25-ai-tracing/jini-patches/jini-ai-tracing.diff`.
(Squashed on purpose: an early commit's test held a vendor-key-*shaped* fake string that GitHub push
protection could flag; the final diff has none.)

## Commits
**Jini** (local branch `cloud/ai-tracing-1025-jini`, 18 files, +1298/−3):
```
2fc06dc9 feat(agent-runtime): vendor-neutral AI-trace port, recorder over normalized agent events, Langfuse adapter
544ab0da test(agent-runtime): per-provider AI-trace fixtures over real normalizers; post-stream tool_use → closing turn; CCN<=10
1acf1445 feat(daemon): withAiTracing RunLifecycle decorator — one tap traces every provider path
87b72e61 feat(agent-runtime): lazy AI-trace sink (bounded queue) for hosts that build lifecycles synchronously
4503bf6c perf(agent-runtime): keep streamed text only in full capture; counts otherwise
fe3f1309 test(agent-runtime): labeled fake secret instead of a vendor-key-shaped string
6016485c feat(server): optional aiTrace option on createJiniKernelBase (no option = lifecycle unwrapped)
```
**Tovu** (`cloud/ai-tracing-1025-tovu`): report files only — `REPORT.md`, `AI-TRACING-PLAN.md`,
`jini-patches/`. No Tovu source touched (so no Tovu tsc/link:jini run was needed).

New Jini files: `agent-runtime/src/ai-trace/{types,usage,capture,classify,recorder,sinks,langfuse,index}.ts`,
`ai-trace/__tests__/{ai-trace,providers}.test.ts`, `daemon/src/ai-trace-lifecycle.ts` (+test);
edits: `agent-runtime/package.json` (subpaths `./ai-trace`, `./ai-trace/langfuse`), `agent-runtime/src/index.ts`,
`daemon/src/index.ts` (+1 export each), `server/src/kernel-base.ts` (+`aiTrace` option, 1 helper).

## Seam BEFORE / AFTER (excerpts — full version in PLAN §1)
BEFORE: `TelemetrySink`/`RunLifecycleEvent` existed but **nothing emitted it**; every provider's
events already flowed through `lifecycle.emit({ runId, input: { event: 'agent', data } })`.
AFTER:
```ts
// server: opt-in, absent ⇒ unwrapped
lifecycle = tracedIfConfigured(createRunLifecycle({ eventLog }), options.aiTrace);
// daemon: one decorator for every provider path
async emit(args) { const e = await lifecycle.emit(args); if (args.input.event === 'agent') recorders.get(args.runId)?.observe(args.input.data); … }
// agent-runtime: vendor-neutral port
interface AiTraceSink { record(event: AiTraceEvent): void; flush?(): Promise<void>; shutdown?(): Promise<void> }
```

## Provider mapping (measured via the real normalizers — PLAN §2 has the full table)
Claude Code ✅ model/tokens/cache/provider cost/tools/errors (1 turn per CLI run) · Copilot ✅ tools/errors, tokens & cost **null**
· Qoder ✅ tokens+cost, **no tool events in stream** · Codex ✅ model/tokens/cache/tools/errors, cost null
· ACP (Gemini etc.) ✅ model/tokens/thought, **only artifact-write tool calls surface** (gap) · HTTP OpenAI/Azure/Anthropic/Google
✅ per-call turns/tokens/tools/errors, model must come from host, cost via `priceUsage` (estimated) ·
OpenCode/Cursor/Kimi/pi-rpc: flow through the same tap, **not fixture-tested**.

## Test + tsc numbers (counts = tests executed)
| Check | Result |
|---|---|
| New tests | 38: agent-runtime ai-trace 34 (swap proof, capture/redaction, failure handling, classifier, usage, lazy SDK load, lazy sink, 6 provider fixtures), daemon 3, server 1 |
| agent-runtime full vitest | **175 files, 4195 passed, 1 skipped** |
| daemon full vitest | **154 files, 3565 passed** |
| server full vitest | **23 files, 411 passed, 1 skipped** |
| `tsc --noEmit -p` agent-runtime / daemon / server | **0 / 0 / 0** errors (after full `pnpm -r build`, exit 0; before the full build daemon/server showed only unbuilt-dependency errors, identical with my change stashed) |
| `eslint --rule complexity:[error,10]` on all new/touched files | **0 errors** (4 pre-existing-style sonarjs warnings: regex complexity in classifier, expression complexity in `addNullable`, `void` in recording sink) |
| Overhead (Node 24, 200k events) | noop/recording + `metadata`: **44–70 ns/event**; `full` with redaction: **0.45–0.53 µs/event**; tracing not configured: lifecycle not wrapped (0) |
| Langfuse SDK in root import graph | none (`dist/index.js`, `dist/ai-trace/*` do not reference `langfuse`; it is a dynamic import on the `./ai-trace/langfuse` subpath only) |

Vitest 2 here needs `--maxWorkers=2 --minWorkers=1` (`--maxWorkers=2` alone → tinypool "minThreads and maxThreads must not conflict").

## Swap proof
One scenario (run → "Creating the post." → `content_post_create {body}` fails `Unknown input 'body'` →
retry with `{content}` succeeds → usage+cost → succeeded) fanned out to **recording + Langfuse(fake
client) + noop** in the same run: recording yields `run_started, tool_call(input_validation), tool_call(ok), model_turn, run_finished{toolErrors:1}`;
Langfuse receives exactly `recording.events.map(toLangfuseCall)` = `trace, span(level ERROR, statusMessage input_validation, parent = generation), span, generation(usageDetails, costDetails), trace(outcome tag)`; noop accepts it.
No network, no keys: the SDK is a recording fake of the `langfuse` v3 client shape.

## Measured bugs found & fixed during the run
1. HTTP adapters emit `usage` before `tool_use` → tool call was attributed to the *next* turn and a phantom empty turn was created by the trailing `end`. Fixed (tool_use between turns → turn that just closed; `end`/`turn_end` only annotate an open turn).
2. `metadata` mode was concatenating the full streamed output just to count it → now counts only.

## Top 3 owner questions
1. **ACP tool visibility**: ACP agents (Gemini CLI etc.) only surface artifact writes as tool events, so their tool failures are invisible to traces *and* the UI. Emit `tool_use`/`tool_result` for every ACP tool call? (UI-visible change.)
2. **Default capture mode in prod**: `metadata` (counts only) as proposed, with `full` opt-in per environment/tenant — or `full` for internal Tovu staff runs only?
3. **Langfuse SDK v3 client vs. OTel**: keep the dedicated Langfuse adapter (built, simplest), or route everything through one OTel GenAI adapter inside the diagnostics OTel plugin the parallel observability run is building (Langfuse/Phoenix/Datadog via OTLP; Langfuse JS v4 is OTel-based anyway)?

## What this does NOT cover
No real Langfuse round-trip; no Tovu source wiring (sketch in PLAN §6); no sampling; resumed runs
not re-traced; sub-agent/delegated runs not linked to a parent trace; OpenCode/Cursor/Kimi/pi-rpc
not fixture-tested; ACP/Qoder source gaps documented not fixed; error classes are lexical on result
text; Jini branch not on GitHub (push refused — see top).

AITRACE DONE 2026-10-25T19:56Z — wall ≈ 25 min (19:31→19:56 UTC), rough tokens ≈ 0.25M.
