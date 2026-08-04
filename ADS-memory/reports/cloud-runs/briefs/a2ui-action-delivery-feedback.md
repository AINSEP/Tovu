# Brief — A2UI action-delivery feedback: close the silent-failure gap

**Read `../RUN-PROTOCOL.md` in full first.** It is mandatory and covers the branch, the run log, the
commit/push discipline, and the evidence standard. Everything below assumes it.

- **Run log path:** `ADS-memory/reports/cloud-runs/2026-08-04-a2ui-action-delivery-feedback.md` (Tovu repo)
- **Fallback branch if push is rejected:** `a2ui-action-delivery-feedback`
- **Repos touched:** **both** — `Jini` (`packages/chat`) and `Tovu-AI-CMS` (`apps/admin`)
- **Deliverable:** working code + tests in both repos, plus a short findings section in the run log

## Bootstrap

1. Read `AI-Dev-Shop/agents/programmer/skills.md` in the Tovu repo before any work. If missing, log and STOP.
2. Confirm persona load in your first line of output.
3. Do NOT read `AI-Dev-Shop/AGENTS.md` or the root `CLAUDE.md` — the `<<SUBAGENT_DISPATCH>>` marker exempts you.

## Setup

This is a code task, so you do need installs. Both repos are already `npm`-based and Tovu consumes
Jini through `file:` deps symlinked into `node_modules/@jini-ai/*`.

**Critical:** if you change anything under `Jini/packages/<pkg>/src`, you MUST run
`npm --prefix packages/<pkg> run build` in the Jini repo. Tovu imports the built `dist/`, so an
unbuilt change silently does not exist from Tovu's side. This has bitten this project before.

## Background — what exists, so you do not rebuild it

A mechanism landed this week that lets one agent tool call stay open while a human answers, across
several turns. You do not need to change any of it, but you need to understand where your change sits.

- `Tovu/src/assistant/surface-exchanges.ts` — `createSurfaceExchangeStore()`, giving
  `open(binding, emit) -> { id, send, receive, close }`. Multi-turn, buffered inbox.
- `Tovu/src/assistant/a2ui-actions-route.ts` — `POST /api/admin/v1/a2ui/actions`. Validates the
  renderer→agent envelope with `parseRendererToAgentMessage`, cross-checks the declared `surfaceId`
  against the route's `exchangeId`, and delivers into the exchange. Returns **409** when the exchange
  is not open, **400** on a malformed or mismatched envelope, **401** with no principal header.
- `Tovu/apps/admin/src/lib/a2ui-action-poster.ts` — the browser half that POSTs to that route.
- `Tovu/apps/admin/src/components/AssistantDock.tsx` — registers the `a2ui` ext-event renderer.
- `Jini/packages/chat/src/react/components/A2uiSurfaceCard.tsx` — the card itself.

## The problem

**When a human clicks something in an A2UI surface and the delivery fails, they are told nothing.**

The card already handles two neighbouring cases well, which is what makes the third one's silence
conspicuous rather than merely incomplete:

- `A2uiSurfaceCard.tsx:205-208` — a *refused* action (`buildAction` returns `!ok`) sets
  `refusalNotice`, which renders visibly.
- `A2uiSurfaceCard.tsx:222` — when **no** `onAgentAction` handler is supplied at all, it sets
  `pendingAgentAction` and shows the module doc's honest "nowhere to send this yet" notice, rather
  than dropping the action silently. That posture is deliberate; read the module doc at
  `A2uiSurfaceCard.tsx:25`.

The gap is the case in between. `onAgentAction` is declared at `A2uiSurfaceCard.tsx:156` as:

```ts
onAgentAction?: (runId: string | undefined, message: unknown) => void;
```

It returns `void`. So when a handler **is** supplied and the POST fails — 409 because the exchange
already closed, 400 because the envelope was malformed, a network error, the tab having sat idle past
the exchange's deadline — the card has no way to learn that. Today the failure reaches
`console.error` in the Tovu poster and nowhere else. The human sees their click do nothing, with no
indication whether it worked, and the agent is still sitting there waiting.

Contrast MCP-UI, which does not have this hole: its dialog gets a live error relay back into the
iframe (`@mcp-ui/client`'s `ui-message-received` / `ui-message-response`, see
`Tovu/src/assistant/mcp-ui.ts`). A2UI's `onAgentAction` has no equivalent response channel.

## What to build

Give `onAgentAction` a response channel, and have the card show a delivery failure the way it already
shows a refusal.

Suggested shape — **argue for a better one if you see it, do not follow this blindly**:

1. **Jini, `packages/chat`.** Widen `onAgentAction`'s return type so a host can report an outcome —
   e.g. `=> void | Promise<{ ok: true } | { ok: false; reason: string }>`. Keep it **backward
   compatible**: a host returning `void` must behave exactly as today, because that is the contract
   `examples/reference-web/src/A2uiLab.tsx` uses and you must not break it.
2. **Jini, `packages/chat`.** In the card, await the result when one is returned and render a visible
   failure notice on `ok: false` or a rejection. Reuse or sit beside the existing `refusalNotice`
   presentation — do not invent a third visual language for "this did not work."
3. Consider whether the human should be able to **retry**. If you conclude retry is wrong here (an
   exchange that closed will never reopen, so a retry would always fail), say so and do not build it.
4. **Tovu, `apps/admin/src/lib/a2ui-action-poster.ts`.** Return the outcome instead of only
   `console.error`ing it. Map the route's real status codes to reasons a non-technical person can act
   on. A 409 means "this surface is no longer waiting for you" — that is the common case and deserves
   wording that does not read as an error in the user's own work.
5. **Tests** in both repos. The Jini side needs a card test proving the failure notice renders and
   that a `void`-returning host still behaves as before. The Tovu side needs poster tests for the
   409 / 400 / network-error mappings.
6. **Rebuild `@jini-ai/chat`** (`npm --prefix packages/chat run build`) so Tovu sees the change.

## Constraints — do not violate these

- **Human-only channel.** Nothing on this path may put surface content into model context. An error
  message shown to the human must not be routed into the agent's tool result as if it were the
  human's answer. See `Jini/packages/daemon/src/tool-result-surfaces.ts` for why this is structural.
- **Do not make a delivery failure resolve the exchange.** The agent is still waiting; a failed POST
  means the human's answer did not arrive, not that they declined. Turning it into an answer would
  put a fabricated result in front of the model — the exact class of bug ADR-055 exists to remove.
- **Backward compatibility on `onAgentAction`** — see (1). Verify `A2uiLab.tsx` still compiles and its
  tests pass.
- Match the surrounding comment style. These files explain *why*, with specific evidence and named
  rejected alternatives. Terse comments will look wrong.

## Verification before you report done

- `npm --prefix packages/chat run test` (Jini) and `npm --prefix packages/chat run build`
- `cd apps/admin && npx vitest run` (Tovu)
- `npx tsc --noEmit -p tsconfig.json` (Tovu root)
- `npm run check:architecture` (Tovu) — must not regress
- Scoped test globs only. Do **not** run Tovu's full root suite.

## Pushback is wanted

Per RUN-PROTOCOL §5. Specifically plausible here: you may find the right fix is in the **poster**
rather than the card, or that the card's existing `pendingAgentAction` notice can be reused for this
case with almost no new code. If the honest answer is "this is 15 lines, not a subsystem," say that
in a `Concerns` section rather than inventing scope to justify the assignment.
