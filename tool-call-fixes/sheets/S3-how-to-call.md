# S3. Every answer says how to call the tool, by its real published name (C1b, mechanism M2, Jini half)

Repo: Jini. Packages: `core`, `mcp`. Estimate: 170k Sonnet. Prerequisites: S1 (creates `core/src/tool-call-text.ts`).
Blocking decision: none.
Landed check: `rg -n "unknownToolSentence" packages/core/src/tool-call-text.ts`.

## The fact this sheet is built on (judge finding 7; lesson 36)
A registry id is **not** the name a CLI calls. `core/src/tool-exposure.ts` (`nameBase`, `assignName`) publishes an id
that is not a safe name (dots, hyphens, over the length limit) as `tool_<readable>_<hash>` and adds `_1`, `_2`… on
collision; `tool-server.ts` indexes tools by that **wire name**. So "call it directly" must print the wire name the
exposure assigned, and the gateway form must print the registry id.

## Read first
`../DESIGN.md` §2.2, M2. `rg -n "describeToolTool" packages/mcp/src/server/tools/tool-catalog-tools.ts` ·
`rg -n "createToolPublisher|exposure.promote|wireName" packages/mcp/src/server/tool-server.ts` ·
`rg -n "publishTool" packages/mcp/src/server/tool-protocol.ts` · `rg -n "nameBase|assignName|schema-byte-limit|tool-limit" packages/core/src/tool-exposure.ts`.

## Inventory step
`rg -n "describe_tool" packages --glob '*test*'` and `rg -n "tools/list" ../Tovu/apps ../Tovu/development`: every test
or fixture asserting `describe_tool`'s description or result shape. Update the Jini ones here; list the Tovu ones for S4b.

## Characterization (passes today)
`mcp/src/server/__tests__/tool-publication.limit.unit.test.ts`: with `maxTools: 2` and two startup tools,
`describe_tool` of a third tool resolves normally, the tool index does not contain it, no `tools/list_changed` is
sent, and the result has no field telling the caller so. Also pin: a startup tool with id `content_read.menu` is
indexed under a name matching `/^tool_content_read_menu_[0-9a-f]{8}$/`, not under its id.

## Red-first (fails: no `callAs`; a skipped promotion is silent)
1. third tool (not promoted, `tool-limit`) → result has `callAs: "gateway"` and
   `call: 'execute_delegated_tool({"toolId":"third_tool","input":{}})'`; a read-only descriptor →
   `execute_readonly_delegated_tool` in the same form.
2. promoted tool with a safe id → `callAs: "direct"`, `call: "third_tool"`.
3. promoted tool with id `content_read.menu` → `callAs: "direct"` and `call` equals the **wire name** from the
   exposure (assert it equals the name found in `tools/list`, and is not the id).
4. id longer than the wire limit; and an id equal to a local tool name (`search_tools`) → `call` is the suffixed or
   hashed wire name that `tools/list` shows.
5. `schema-byte-limit` skip → `callAs: "gateway"`.
6. schema-less family descriptor → `callAs: "none"`, no `call`.
7. round trip: calling the returned `call` name through `handleToolCall` with a fake daemon reaches the daemon with the
   **registry id** in the request body, for cases 2, 3 and 4.

## Change
1. `core/src/tool-call-text.ts`: add `toolCallText({ toolId }, { wireName, readOnly, input })`. With `wireName` it
   returns the wire name; without, the gateway form. `input` is rendered only when the caller passes it.
2. `McpToolContext.publishTool` returns `{ wireName: string } | { skipped: 'tool-limit' | 'schema-byte-limit' | 'not-found' }`
   instead of `void`. `createToolPublisher` reads the name from the promotion result (an already published id returns
   its existing wire name). Update the port type and every implementer found by `rg -n "publishTool" packages/mcp/src`.
3. `describeToolTool`: add `callAs` / `call` from that return value. Replace the one sentence of its description that
   promises publication with: `The result's callAs and call fields say exactly how to call it.`
4. `tool-server.ts` is 438 lines at merge-final: result shaping stays in `tools/tool-catalog-tools.ts`.

## Acceptance
- No path leaves a described tool without an exact, working call text (case 7).
- Description snapshot tests updated in the same commit; counts recorded; gate green.
