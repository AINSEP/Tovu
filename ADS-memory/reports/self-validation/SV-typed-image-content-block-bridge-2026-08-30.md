# Self-Validation — typed image content blocks dropped crossing the Jini delegated-tool bridge

- Service: Jini `packages/daemon` + `packages/mcp` (Tovu's admin chat assistant consumes both via
  `apps/website/src/server/inbound/assistant/agent-daemon-server.ts`'s `mcpJsonInjection`)
- Owner: Programmer (dispatched directly by team-lead)
- Run date: 2026-08-30T21:25-0700
- Outcome: PASS — real image content block confirmed reaching the model end to end

## Root cause (two independent bugs, both required for the fix)

1. `packages/daemon/src/delegated-tool-bridge.ts`'s `execute()` extracted a completed call's `image`
   content block out of `output` into a separate `media` field on the run's lifecycle `tool_result`
   event (useful for a browser UI reading the event stream), then discarded it from the RETURN VALUE
   entirely — the value `packages/mcp/src/server/tools/delegated-tool.ts`'s `execute_delegated_tool`
   hands back to the calling agent CLI as the model's own tool result, with no access to that event
   stream. `packages/daemon/src/tool-result-surfaces.ts`'s `MODEL_VISIBLE_BLOCK_TYPES` (`['text']`
   only) forced this: `image` was not classified as model-safe, only text was.
2. Even with the image present in `output`, `execute_delegated_tool`'s handler returned the whole
   `{executionId, status, output}` envelope, and `packages/mcp/src/server/tool-protocol.ts`'s
   `okResult()` unconditionally `JSON.stringify`s any non-string payload into one text block —
   flattening a typed image block into inert base64-in-quotes text.

## Fix

- Added `'image'` to `MODEL_VISIBLE_BLOCK_TYPES` (deliberate whitelist addition, per that module's
  own documented invitation) and stopped feeding the bridge's de-imaged `remainder` into
  `splitToolResultSurfaces` — it now runs on `executed.output` directly, so an image block survives
  in the bridge's own return value while `media` is still collected (non-destructively) for the event.
- Added an `unwrapMcpContentEnvelope` step in `execute_delegated_tool`'s handler (unwraps to `output`
  only when `status === 'completed'` and `output` is itself a `{content:[...]}` envelope — every
  other shape, including a non-completed status, is returned byte-identical to before) and taught
  `okResult()` to pass a well-formed content envelope through verbatim instead of stringifying it.

## Environment preflight

- `pnpm build` (tsc) clean for both `packages/daemon` and `packages/mcp` — zero errors.
- Unit suites: `packages/daemon` 861/861 passed (33 files), `packages/mcp` 407/407 passed (22 files) —
  full package runs, not scoped-only, to catch cross-file regressions from the whitelist/envelope
  change. Zero regressions; 3 tests intentionally rewritten (one pre-existing test asserted the bug's
  own behavior — see handoff for detail) plus 9 new tests added, all RED before the fix (verified by
  hand-reverting the source edits, confirmed 3/9 failures with the expected diffs, then reapplying).

## Runtime harness

- Harness: `development/scripts/agent-run-probe.mjs --isolate-memory`, the real `POST /api/runs` path
  the admin composer itself uses — not a synthetic call. Live dev stack already running
  (website :3000, admin :5173, Jini agent-daemon-server.ts pid family started 21:23:01, i.e. after
  this fix's `pnpm build`s completed); no process was restarted, killed, or stopped as part of this
  work.
- Critical path: prompted the agent to call `assistant_demo_image` (the project's own known-good
  typed-image control tool). Event trace shows `mcp__jini__search_tools` -> `describe_tool` ->
  `mcp__jini__execute_delegated_tool {toolId: "assistant_demo_image"}`, and the daemon's own inner
  `tool_result` event for the delegated call carries `media:[{type:"image",...}]` alongside a
  `content` string whose embedded JSON still contains the image block (both channels intact). The
  model's own final turn: *"Yes — I received actual image content: a 64×64 solid indigo/blue-violet
  PNG swatch rendered inline, alongside the text line, not just a description of one."*
- Result: PASS. Raw event log: `<scratchpad>/probe-out/prefix-baseline.events.jsonl` (31 events),
  summary: `prefix-baseline.summary.json`.
- Negative/edge path not separately re-run live: `admin.capture_screenshot` was not re-probed —
  per the dispatch brief it is not the suspect (the transport bug reproduces identically on the demo
  control), and its own capture logic is unchanged by this fix.

## Known limitation found, not fixed (flagged, not silently omitted)

- Tovu's BYOK provider-turn path (`apps/website/src/assistant/byok-tool-surface.ts`,
  `byok-provider-turn.ts`) has its own, structurally similar `{content: string}` flattening for tool
  results — but `byok-provider-turn.ts`'s own module doc documents its flattened `{role, content}`
  turn shape as deliberately carrying "no image/tool-call" support at all, repo-wide, not specific to
  this bridge. Treated as a pre-existing, out-of-scope product limitation rather than a third
  occurrence of this bug; not touched.
