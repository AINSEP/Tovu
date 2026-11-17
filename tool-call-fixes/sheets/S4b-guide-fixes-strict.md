# S4b. Fix every guide mention, pin the named tools, switch the lint to strict (C1b, mechanism M2)

Repo: Tovu (and the Jini texts S4a listed). Estimate: 220k Sonnet. Prerequisites: S4a merged with `unknownCalls` and
the fit result reviewed; OD-7 answered if the named set did not fit.

## Read first
`development/parity/tool-guides.json`, `../DESIGN.md` M2,
`apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` (`startupToolIds`),
Jini `core/src/tool-call-text.ts` (S3).

## Characterization (passes today)
`agent-daemon-server.typed-tools.integration.test.ts` (or a sibling): the startup list begins with the four theme file tools. Pin the first 10 ids.

## Red-first
1. `npm run check:tool-guides -- --strict` fails today; paste its output.
2. New test `startup-tool-order.unit.test.ts`: every id in `tool-guides.json.named` that is registered comes before every unnamed id, and the four theme file tools follow the named set (fails: order is theme-first only).
3. For each `unknownCall`, a test at the owning feature asserting the corrected text exactly (one test per message).

## Change
1. Extract `startupToolIds` ordering into `apps/website/src/assistant/startup-tool-order.ts` (pure: `{ visibleIds, namedIds }` → ordered ids). `namedIds` is imported from a generated module written by `check-tool-guides.ts --write-pins` (committed). The scope file loses lines, it does not gain them.
2. Fix each `unknownCall`: replace the invented name with the real id, or reword without a tool name.
3. For a mention that cannot be pinned (OD-7 overflow only): render it with `toolCallText({ toolId }, { direct: false })`.
4. Call-form mentions of pinned tools (`load_agent_plugin({...})`) stay as written; they are now true.
5. Make the check strict in `package.json` and add it to the local CI script that runs the other `check:*` gates.
6. Update every test from S4a's "reads guide text" list in the same commit as the text it reads. Do not regenerate search-eval fixtures unless a description changed; if one did, say which.

## Acceptance
- `npm run check:tool-guides -- --strict` exits 0. `unknownCalls` is empty. Fit margin printed.
- A wire test (existing typed-tools integration style) lists the MCP tools for a run and finds **every** named, registered, visible id in `tools/list`.
- Removing one named id from the pins makes the strict check fail (prove once, then restore).
- `npm run typecheck`, `check:size`, `check:complexity` green; test counts recorded.
