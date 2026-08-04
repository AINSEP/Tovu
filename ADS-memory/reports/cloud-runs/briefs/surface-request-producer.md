# Brief — a producer for the protocol-neutral `surface_request` / `surface_response` pair

**Read `../RUN-PROTOCOL.md` in full first.** It is mandatory and covers the branch, the run log, the
commit/push discipline, and the evidence standard. Everything below assumes it.

- **Run log path:** `ADS-memory/reports/cloud-runs/2026-08-04-surface-request-producer.md` (Tovu repo)
- **Fallback branch if push is rejected:** `surface-request-producer`
- **Repos touched:** primarily `Tovu-AI-CMS`; `Jini` only if you conclude something belongs there
- **Deliverable:** working code + tests, plus a `Concerns` section in the run log

## Bootstrap

1. Read `AI-Dev-Shop/agents/programmer/skills.md` in the Tovu repo before any work. If missing, log and STOP.
2. Confirm persona load in your first line of output.
3. Do NOT read `AI-Dev-Shop/AGENTS.md` or the root `CLAUDE.md` — the `<<SUBAGENT_DISPATCH>>` marker exempts you.

## Setup

Code task, so installs are needed. If you change `Jini/packages/<pkg>/src`, you MUST run
`npm --prefix packages/<pkg> run build` — Tovu imports the built `dist/`, so an unbuilt change
silently does not exist from Tovu's side.

## Phase 1 — recon before you build. Do not skip; it may change the answer.

**Read these before writing anything, and cite `file:line` for what you conclude:**

- `Jini/packages/protocol/src/events.ts` — find the `surface_request` / `surface_response` variants
  in `RunAgentPayload`. Read their doc comments in full, including the paragraph distinguishing them
  from the much larger real A2UI spec. They are deliberately a *narrow* "ask a structured question,
  get a value back" primitive — no component tree, no data binding.
- `Jini/packages/agentic/src/gen-ui/encoder.ts:116-121` — **these already have a consumer.** The
  encoder maps them onto AG-UI's `ui.surface_requested` / `ui.surface_responded`. This is the single
  most important fact in this brief: a producer would light up an already-built path, not create a
  dead end.
- `Tovu/src/assistant/surface-exchanges.ts` — the held-open-call machinery you will drive it from.
- `Tovu/src/assistant/a2ui-actions-route.ts` and `Tovu/src/assistant/mcp-ui-tool-calls-route.ts` —
  the two existing inbound routes. Note how each handles correlation, and that neither calls
  `toolExecutor.execute`.
- `Tovu/src/assistant/demo-a2ui-tool.ts` and `Tovu/src/assistant/demo-choices-tool.ts` — the two
  existing surface-raising demo tools, both env-gated by `TOVU_ENABLE_DEMO_TOOLS`.

## The problem

`surface_request` / `surface_response` is the **paradigm-neutral** human-in-the-loop pair in this
codebase's run protocol. It carries an opaque caller-defined `payload`, a `surfaceKind` from a small
closed list (`'form' | 'choice' | 'confirmation' | 'oauth-prompt'`), a `surfaceId` for correlation,
and — on the response — `respondedBy: 'user' | 'agent' | 'auto' | 'cache'`.

It has a consumer (the AG-UI encoder above). **It has no producer.** Nothing in this codebase ever
emits one, so the encoder path is unreachable in practice and the protocol's most transport-agnostic
surface primitive is inert.

That matters beyond tidiness. MCP-UI needs a sandboxed HTML host; A2UI needs a component catalog and
an interpreter. `surface_request` needs neither — it is the one channel a host with no UI framework
at all could still answer. It is the natural fit for a headless client, a CLI, a mobile shell, or a
paradigm nobody has written yet.

## What to build

1. **A producer path.** Drive `surface_request` from a surface exchange, the same way
   `demo-a2ui-tool.ts` drives `a2ui`: open an exchange, `send` a `surface_request` naming the
   exchange id as its `surfaceId`, `receive` the answer, close, return it. The channel-neutral emit
   seam already supports this — `SurfaceEmission { channel, payload }`, see
   `Jini/packages/daemon/src/delegated-tool-bridge.ts`. **You should not need to change the emitter.**
   If you find you do, that is a finding worth reporting.
2. **An inbound path for the response.** Decide — and justify — whether this needs its own route or
   whether `mcp-ui-tool-calls-route.ts`'s existing top-level `exchangeId` carrier already serves it.
   That carrier was built precisely so a channel that can name its exchange directly does not have to
   smuggle correlation through tool-call params. **Reusing it may be the right answer; say so if it is.**
3. **`respondedBy` must be honest.** The protocol distinguishes `'user'` from `'auto'`, and a timeout
   is represented as a response with `respondedBy: 'auto'` (see the variant's own doc). Map the
   exchange's `expired` / `abandoned` statuses onto that faithfully rather than reporting everything
   as `'user'`. Getting this wrong would put a fabricated human answer in front of the model.
4. **A demo tool** proving the loop, env-gated exactly like the two existing ones — same
   `TOVU_ENABLE_DEMO_TOOLS` variable, same "writes nothing" posture, same `sideEffects: "none"`
   honesty. Exercise at least two of the four `surfaceKind` values.
5. **Tests** for the producer, the inbound path, the `respondedBy` mapping, and the demo tool.

## Constraints — do not violate these

- **Human-only channel.** Nothing on this path may reach model context. See
  `Jini/packages/daemon/src/tool-result-surfaces.ts`.
- **Never re-run the authorization gate on an inbound response.** The held-open call already passed
  it when the agent made it; re-gating would authorize the human's *answer* as a fresh invocation.
- **Correlation:** use the exchange id as `surfaceId`. Do **not** attach `toolUseId` — 
  `delegated-tool-bridge.ts`'s `CHANNELS_CARRYING_TOOL_USE_ID` deliberately excludes everything but
  `mcp-ui`, and there is a test asserting it.
- **Deadlines:** an exchange's total ceiling is 5.5 min, sized to sit inside `@jini-ai/mcp`'s 6-min
  delegated-tool request deadline. Do not raise either without saying so prominently.
- **Do not widen `surfaceKind`.** It is a closed list on purpose. If your demo wants a fifth kind,
  that is a finding to report, not a change to make.
- Match the surrounding comment style: explain *why*, with evidence and named rejected alternatives.

## Verification before you report done

- `node --import tsx --test "src/assistant/__tests__/*.test.ts"` (Tovu) — **scoped globs only**, never
  the full root suite
- `npx tsc --noEmit -p tsconfig.json` (Tovu)
- `npm run check:architecture` (Tovu) — must not regress
- Any Jini package you touch: `npm --prefix packages/<pkg> run test` **and** `run build`

## Pushback is wanted

Per RUN-PROTOCOL §5, and this brief is more speculative than most — flag it hard if:

- **The pair is redundant.** If, having read all three channels, you conclude `surface_request` adds
  nothing over what `a2ui` and `mcp-ui` already cover for this product, **say so and stop**. "This
  primitive should stay inert until something actually needs it" is a legitimate and valuable
  outcome. Do not build a producer to justify the assignment.
- **The AG-UI encoder path is not actually reachable** end to end from Tovu. Verify it rather than
  trusting this brief's claim; if the encoder is only wired in an example or a lab, the value
  proposition above is weaker than stated and you should say so.
