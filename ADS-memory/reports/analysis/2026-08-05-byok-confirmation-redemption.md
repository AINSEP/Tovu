# BYOK confirmation redemption gap — closed (2026-08-05)

Owner: Bug 3 dispatch (BYOK confirmation redemption gap). Programmer agent, `refactor/jini-admin-extraction`.

## Starting state

`content_post_delete` is the one production tool that reads `ctx.emitSurface` to park on a human
confirmation (ADR-055 Decision 2). BYOK mode (`assistant-byok.ts` / `byok-tool-surface.ts`) never
supplied `emitSurface` when calling `ToolExecutor.execute`, so the tool's own fail-closed guard fired
instead: it threw `"no interactive confirmation channel"` rather than parking. Safe, but a BYOK admin
could never actually delete a post through the assistant — proven by the (now superseded) test at
`assistant-byok-routes.test.ts` asserting exactly that failure.

## Design implemented (matches the owner's settled design, confirmed viable before coding)

1. `createByokToolSurface` now builds a real `SurfaceEmitter` seam: `executeMetaTool` takes an
   optional 5th `emitSurface` argument and threads it straight into `ToolExecutor.execute`'s own
   optional 6th parameter (this parameter already existed in `@jini-ai/daemon` — nothing new needed
   there). `surfaceExchanges` is exposed on the returned `ByokToolSurface`.
2. `assistant-byok.ts`'s `executeTool` builds a fresh `SurfaceEmitter` per tool call (closure over
   `call.id` as the correlation `toolUseId`), transforming each `SurfaceEmission` into the same wire
   shape `@jini-ai/daemon`'s `delegated-tool-bridge.ts` produces (`{...payload, type: channel,
   toolUseId only for 'mcp-ui'}`), written via the existing `sse(res, "agent", ...)` helper. The
   client's `translateRunAgentPayload` (`apps/admin/src/lib/assistant-transport.ts`) is already
   transport-agnostic — zero frontend changes needed, verified by end-to-end test, not just code
   reading.
3. `assistant.ts`'s `proxyMcpUiToolCall` now tries LOCAL delivery first, against a
   `SurfaceExchangeStore` shared with the BYOK module, falling back to the daemon only on
   `unknown-or-closed`. A `binding-mismatch` is answered locally (409), never forwarded — that reason
   means the exchange WAS found here, just not for this caller.
4. The shared store is built exactly once: `createAssistantByokModule` composes it internally
   (default parameter, `= createByokToolSurface(routeDeps)`) and exposes it on its own
   `AssistantByokModuleHandle.toolSurface`. `app.ts` calls the BYOK module's factory first, reads
   `.toolSurface.surfaceExchanges` off the result, and passes that into `createAssistantModule`'s new
   second parameter. **No new `RouteDeps` field** — matches the explicit constraint.

## A real bug this design change surfaced, and a real bug it did NOT have (worth recording both)

- **Real, in the repo's own doc claims**: `byok-tool-surface.ts`'s header previously said a
  surface-raising tool "falls back to returning its surface rather than parking" when `emitSurface`
  is absent, per the generic `@jini-ai/core` contract — and flagged that as unverified. Empirically,
  `content_post_delete` does something stricter: it throws instead. This was already caught and fixed
  by a previous session before this task; I verified it's still accurately disclosed post-change.
- **Real, in my own test code, not production**: my first draft of `extractExchangeId` (test helper)
  did `JSON.stringify(alreadyParsedPayload)` then regexed for `"__exchangeId":"..."` — a double-escape
  bug, since the resource's HTML `text` field is itself a JSON-escaped string; re-stringifying an
  already-parsed object re-escapes it. The regex then never matched, `assert.ok` threw, and because
  the exchange was still parked at that point, `t.after(() => server.close())` would have blocked on
  the still-open connection for up to the production 5.5-minute ceiling — turning a fast assertion
  failure into what looks exactly like the hang this task was warned against. Caught via a standalone
  reproduction script (isolated from `node --test`) before it was ever mistaken for a production bug.
  Fixed by walking the parsed object's string leaves directly (no re-stringify) AND by wrapping both
  redemption tests' bodies in `try/finally { await reader.cancel() }` so ANY future assertion failure
  mid-flow cancels the connection immediately rather than racing the TTL.

## Verification (fresh evidence, this session)

- `npx tsc --noEmit`: 0 errors (repo-wide clean at the time of this change).
- `node --import tsx --test` over `src/assistant/__tests__/*` + `assistant-byok-routes.test.ts` +
  `assistant-proxy-routes.test.ts` + `admin-mcp-ui-tool-calls-route.test.ts`: **908/908 green**, two
  full runs, no intermittent failure observed (dispatcher's unattributed flake was not reproduced).
- Standalone repro (`node --import tsx <script>.mts` against the real `createApp(deps)`, not a mock)
  proved the full park → redeem → delete chain end-to-end in ~80ms before the equivalent `node --test`
  test was even fixed.
- Redemption reachability: `${BYOK_TURN_PATH}: content_post_delete PARKS via a real emitSurface, and
  redeeming the confirmation through the LOCAL (non-daemon) delivery path actually deletes the post` —
  reads the SSE stream live (not buffered), extracts the exchange id from the rendered mcp-ui
  resource, POSTs to `/api/admin/v1/mcp-ui/tool-calls`, asserts `202 {delivered:true}`, drains the
  rest of the stream, asserts the post is genuinely `deletedAt`-marked in the DB.
- No-hang: `...an UNREDEEMED confirmation resolves via its own bounded TTL...` — injects a
  millisecond-scale `SurfaceExchangeStore` via `createByokToolSurface`'s new
  `{ surfaceExchangeStore }` override (test-only seam; production takes the default, unchanged
  5.5-minute ceiling) and proves the SAME code path (not a different one) resolves quickly.
- Cancel branch also covered (`...cancelling the same confirmation dialog leaves the post
  untouched`).

## Architecture audit

- `npm run check:architecture` reports 2 regressed metrics on the current (very dirty, ~317
  uncommitted paths, multi-session) working tree: a new `assistant <-> db` module cycle, and a "core
  size" increase (12.29% baseline → 13.99%).
- **Both traced and found pre-existing, not caused by this task's diff**, via `git stash` bisection:
  - `git stash push -u` (full clean-HEAD isolation, at commit `197bfe8`, zero working-tree changes at
    all) still reports the `assistant <-> db` cycle. It is already present in the last commit itself.
  - Core size at clean HEAD is 11.49% (passing). With the prior sessions' already-uncommitted BYOK
    feature files restored (`byok-tool-surface.ts`, `byok-provider-turn.ts`, `byok-credential.ts`,
    `execution-credential-store.ts`, etc. — a whole feature slice built across earlier sessions, not
    by this task) but WITHOUT this task's specific edits, core size is 13.99% — already regressed. A
    second, narrower `git stash push -- src/server/modules/assistant.ts` (isolating just this task's
    change to that one file) showed **no change at all** to the core-size number either way (89/636
    both with and without that file's edits).
  - Conclusion: the core-size regression is driven by the mere presence of the prior sessions'
    uncommitted BYOK feature files in the dependency graph, not by this task's incremental additions
    on top of them. Not something this task introduced or can reasonably fix without touching files
    outside its assigned scope.
  - The one metric the dispatch explicitly named as a hard constraint — **back-edges into the
    composition root must not grow** — is satisfied: 26 on the current tree with this change, vs. a
    checked-in baseline of 28 (improved, not regressed), and RouteDeps gained no new field.
- Status: **WARNING** — pre-existing, disclosed, out of scope to fix here.

## What's still open / not attempted

- A2UI's own tools (`demo-a2ui`, `assistant_demo_choices`) and `/api/admin/v1/a2ui/actions` are
  untouched — that redemption route still only reaches the daemon's store. An A2UI tool run through
  BYOK mode would park against a store no redemption path for A2UI has been wired to reach yet.
  Disclosed in `byok-tool-surface.ts`'s header; not attempted here, matching the task's stated scope
  (the ONE production tool, `content_post_delete`, MCP-UI channel only).
