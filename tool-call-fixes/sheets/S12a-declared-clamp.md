# S12a. Declared repair `clamp` in the one normalizer, used by registry tools and MCP-local tools (C5, M7, Jini)

Repo: Jini. Packages: `core`, `mcp`. Estimate: 160k Sonnet.
Blocking decision: **OD-8**.
Prerequisites: S3, S6 (shared files only: `tool-catalog-tools.ts` after S3, `tool-protocol.ts` after S6; INDEX §3).
Landed checks: `rg -n "toolCallText" packages/core/src/tool-call-text.ts` and `rg -n "diagnosticVocabulary" packages/mcp/src/server/tool-protocol.ts`.

## Facts that shape this sheet (judge finding 11)
- `normalizeCallArguments` (`mcp/src/server/tool-protocol.ts`) calls core's `normalizeToolInput` **only** when the tool
  sets `argumentNormalization.schemaInput`. `search_tools` and `read_tool_result` do not; `search_tools` declares
  aliases only. Adding a keyword to their schema alone changes nothing.
- `normalizeToolArguments` (`mcp/src/server/tool-arguments.ts`, `coerceIntegerStrings`) turns `"8300"` into `8300`
  **without a note**. That stays (no silent change): a clamped string input yields **one** note, the clamp's.
- Turning `schemaInput` on for the two local tools would also change their refusal texts (they would gain the input
  contract). This sheet does not do that. Local tools opt in to the clamp alone.

## Read first
`../DESIGN.md` §2.7, M7. `rg -n "function coerceNumber|function normalizeValue|matchesDeclaredKey|export async function normalizeToolInput" packages/core/src/tool-input-normalization.ts` ·
`rg -n "argumentNormalization|schemaInput" packages/mcp/src/server` · `rg -n "maximum" packages/mcp/src/server/tool-result-pages.ts packages/mcp/src/server/tools/tool-catalog-tools.ts` ·
`rg -n "parseMcpToolInputSchema" packages/mcp/src/server/adapters/protocol.ts`.

## Step 0: unknown keywords are safe (test before any feature code; commit it)
A schema carrying `clamp: true` and `obtainFrom: "x"` on a property must (a) compile in the MCP validator
(`new Validator(schema, '2020-12', true)`), (b) pass `parseMcpToolInputSchema`, (c) be published unchanged by
`toolsToList`. If (a) or (b) rejects unknown keywords: STOP and report which consumer; the keywords then need a side table.

## Characterization (passes today)
- `read_tool_result({ resultId, limit: 8300 })` and `search_tools({ query, limit: 26 })` → pin both exact refusal texts.
- `search_tools({ query, max_results: "8" })` → runs with 8, no note.
- a registry tool (through `normalizeToolInput`) with `limit: 8300`, `maximum: 8000` → pin today's outcome.

## Red-first
1. core: property `{ type: 'integer', minimum: 1, maximum: 8000, clamp: true }`, input 8300 → 8000 with the note exactly
   `limit was lowered to its maximum, 8000`; input 0 → 1 with `limit was raised to its minimum, 1`. The note never
   contains the caller's value.
2. same value **without** `clamp` → refused exactly as the characterization.
3. `clamp` on a non-numeric property or without the bound → ignored at call time, and
   `assertRepairKeywords({ inputSchema }, {})` throws for it with the property path (S13's gate uses it).
4. non-finite or non-integer for an integer property → refused as today (no clamp).
5. mcp: `read_tool_result({ resultId, limit: 8300 })` → handler receives 8000; result carries the one note.
   `limit: "8300"` → 8000, **one** note (the clamp's). `search_tools({ query, limit: 26 })` and `max_results: 26` → 25 with the note.
6. the other refusal texts of both local tools are byte-identical to the characterization.

## Change (one gated commit per item)
1. New `core/src/tool-input-repairs.ts` (pure, ≤ 150 lines), public entry `./tool-input-repairs` (`universal`):
   `clampDeclaredBounds({ input, inputSchema }, {})` → `{ input, notes }` and `assertRepairKeywords`. Top-level and
   nested object properties, depth ≤ 6.
2. `core/src/tool-input-normalization.ts` (271 lines): `normalizeToolInput` calls `clampDeclaredBounds` after its number
   coercion. Registry tools get it on every path that already runs the normalizer: typed MCP tools (`tool-protocol.ts`), the
   registry's own execution path (`core/src/tool-registry.ts`, which the gateway reaches) and `core/src/batch-tool-inputs.ts`.
   Add one test per path (typed, gateway through a real `ToolRegistry`, one batch item).
3. `mcp`: `McpToolArgumentContract.argumentNormalization.clamp?: true`; `normalizeCallArguments` runs
   `clampDeclaredBounds` for such a tool and returns its notes. `read_tool_result.limit` and
   `search_tools.limit` / `max_results` get `clamp: true` and the tools opt in.

## Acceptance
Six cases green with exact text; `tool-argument-recovery.test.ts` and `tool-arguments.test.ts` counts not lower; gate
green for `core` and `mcp`; new export listed for REL.
