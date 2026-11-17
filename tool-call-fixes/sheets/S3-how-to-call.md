# S3. Every answer says how to call the tool (C1b, mechanism M2, Jini half)

Repo: Jini. Packages: `core`, `mcp`. Estimate: 150k Sonnet. Prerequisites: none (S1 helps but is not required).

## Read first
`../DESIGN.md` §2.2, M2. `mcp/src/server/tools/tool-catalog-tools.ts` (`describeToolTool`, its description text),
`mcp/src/server/tool-server.ts` (`createToolPublisher`, `exposure.promote`, the `CallToolRequestSchema` handler),
`mcp/src/server/tool-protocol.ts` (`McpToolContext`), `core/src/tool-exposure.ts` (`ToolExposurePromotion.skipped`).

## Inventory step
Every test and fixture that asserts `describe_tool`'s description or result shape (`rg "describe_tool" packages --glob '*test*'`), and the Tovu overlay/eval files that quote it (`rg "tools/list" ../Tovu/apps ../Tovu/development`). List them; update those in Jini here, list the Tovu ones for S4b.

## Characterization (passes today)
`mcp/src/server/__tests__/tool-publication.limit.unit.test.ts`: with `maxTools: 2` and two startup tools, `describe_tool` of a third tool resolves normally, the tool index does **not** contain it, no `tools/list_changed` is sent, and the result has no field telling the caller so.

## Red-first (fails: no `callAs`, promotion skip is silent)
Same file:
1. third tool described → result includes `callAs: "gateway"` and
   `call: 'execute_delegated_tool({"toolId":"third_tool","input":{}})'` (read-only descriptor → `execute_readonly_delegated_tool`).
2. a tool that was promoted → `callAs: "direct"`, `call: "third_tool"`.
3. schema-less family descriptor → `callAs: "none"` and no `call`.

## Change
1. `core/src/tool-call-text.ts` (new, pure): `toolCallText({ toolId, input? }, { direct, readOnly? })`. Exact formats above. Input values are never invented: `input` is rendered only when the caller passes it.
2. `publishTool` returns `{ direct: boolean; reason?: 'tool-limit' | 'schema-limit' }` instead of `void` (update the port type and its two implementers: `createToolPublisher`, `resolveStartupTools`'s collector).
3. `McpToolContext.isDirectTool?(required: { name: string }): boolean`, supplied by the call handler from `toolIndex`.
4. `describeToolTool`: add `callAs` / `call` to the returned object; rewrite the one sentence of its description that promises publication so it reads: "The result's `callAs` says how to call it."
5. `tool-server.ts` is 409 lines: put the result shaping in `tools/tool-catalog-tools.ts`, not in `tool-server.ts`.

## Acceptance
- No path leaves a described tool without an exact, working call text. A test calls the returned `call` form through `handleToolCall` with a fake daemon and gets the tool's result.
- Tool-description snapshot tests updated in the same commit; test counts recorded.
- `pnpm guard`, `pnpm typecheck`, `core` and `mcp` tests green.
