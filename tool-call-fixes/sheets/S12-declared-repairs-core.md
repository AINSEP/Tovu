# S12. Declared repairs: `clamp` and `obtainFrom` in the one normalizer (C5, mechanism M7, Jini)

Repo: Jini. Packages: `core`, `mcp`. Estimate: 170k Sonnet. Prerequisites: none. OD-8 (clamp is opt-in) assumed yes.

## Read first
`../DESIGN.md` §2.7, M7. `core/src/tool-input-normalization.ts` (`coerceNumber`, `normalizeValue`, `matchesDeclaredKey`
for how `aliases` is read, the notes contract "value-free"), `mcp/src/server/tool-arguments.ts`
(`namedFieldMessage`, `argumentShapeMessage`, `normalizeToolArguments`), `mcp/src/server/tool-protocol.ts`
(`normalizeCallArguments`, the validator built with the strict flag), `mcp/src/server/tool-result-pages.ts`,
`mcp/src/server/adapters/protocol.ts` (`parseMcpToolInputSchema`).

## Step 0: unknown keywords are safe (test before any feature code)
A schema carrying `clamp: true` and `obtainFrom: "x"` on a property must (a) compile in the MCP validator,
(b) pass `parseMcpToolInputSchema`, (c) be published unchanged by `toolsToList`. If (a) or (b) rejects unknown
keywords, stop and report: the keywords then need an `x-` prefix or a side table (state which consumer rejected).

## Characterization (passes today)
- `read_tool_result({ resultId, limit: 8300 })` → `invalid arguments for read_tool_result: change \`limit\`: …` (pin the exact text).
- a typed tool with required `themeId` called with `{}` → `invalid arguments for <tool>: supply required argument \`themeId\`; Input schema: {…}`.

## Red-first
1. `limit: 8300` on a property with `maximum: 8000, clamp: true` → handler receives 8000; result carries the note `limit was lowered to its maximum, 8000`. Below `minimum` → raised, note `… raised to its minimum, 1`.
2. same value **without** `clamp` → refused exactly as today.
3. `clamp` on a non-numeric property or without the bound → ignored (schema data error is not the caller's problem), and a registry-time assertion helper `assertRepairKeywords({ inputSchema })` throws for it (used by S13's gate).
4. missing required `themeId` whose property has `obtainFrom: "theme_list"` → `invalid arguments for <tool>: supply required argument \`themeId\`; list valid values with theme_list; Input schema: {…}`.
5. `read_tool_result({ resultId, limit: "8300" })` (string) → 8000 with both notes (coercion then clamp), order pinned.
6. non-finite / non-integer for an integer property → refused as today (no clamp).

## Change
1. `core/src/tool-input-normalization.ts` (271 lines): add clamp in the number path, in a small helper file `core/src/tool-input-repairs.ts` if the file would pass 330 lines. Notes stay value-free: they quote the bound from the schema, never the caller's value.
2. `mcp/src/server/tool-arguments.ts`: `namedFieldMessage` reads `obtainFrom` from the schema property it names.
3. `read_tool_result`: `limit` gets `clamp: true`; the tool opts into `argumentNormalization: { schemaInput: true }`. Check that this does not change its other error texts (pin them first).
4. `search_tools.limit` / `max_results`: add `clamp: true` (the daemon already clamps; the MCP schema refused 26).

## Acceptance
Six cases green with exact text; `tool-argument-recovery.test.ts` and `tool-arguments.test.ts` counts not lower; `pnpm guard`, `pnpm typecheck`, `core` and `mcp` tests green.
