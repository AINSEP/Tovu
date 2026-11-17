# S12b. Declared repair `obtainFrom`: a missing argument names the tool that lists valid values, on both paths (C5, M7, Jini)

Repo: Jini. Packages: `core`, `mcp`, `daemon`. Estimate: 150k Sonnet. Prerequisites: S12a, S1.
Blocking decision: none.
Landed checks: `rg -n "assertRepairKeywords" packages/core/src/tool-input-repairs.ts` and `rg -n "resolveToolTarget" packages/daemon/src/http/delegated-tools.ts`.

## Two paths, one contract (judge finding 11)
| Path | Who refuses a missing `themeId` today | Where the guidance is added |
|---|---|---|
| Typed MCP tool | the MCP validator, before any HTTP call (`argumentShapeMessage` / `namedFieldMessage`) | mcp, from the published schema |
| Gateway (`execute_delegated_tool`) | the **handler** in the daemon (`requireString` in `core/src/registration-kit.ts` throws `ToolInputError`; the gateway's MCP schema knows nothing of the domain input) | the daemon route's validation answer, from the registered descriptor's schema |

Both call one pure function, so the sentence is the same.

## Read first
`rg -n "function namedFieldMessage|function argumentShapeMessage" packages/mcp/src/server/tool-arguments.ts` ·
`rg -n "errorKind === 'validation'" packages/daemon/src/http/delegated-tools.ts` · `rg -n "function requiredFieldError" packages/core/src/registration-kit.ts` (593 lines: do not add to it).

## Characterization (passes today)
- typed tool with required `themeId`, called with `{}` → `invalid arguments for <tool>: supply required argument \`themeId\`; Input schema: {…}` (pin exactly).
- gateway call of the same registered tool with `input: {}` and a handler that calls `requireString({ input, key: 'themeId' })`
  → `400 BAD_REQUEST` with the handler's text (pin exactly).

## Red-first (property `themeId` has `obtainFrom: "theme_list"`)
1. typed path → `invalid arguments for <tool>: supply required argument \`themeId\`; list valid values with theme_list; Input schema: {…}`.
2. gateway path → the pinned handler text followed by exactly ` List valid values for \`themeId\` with theme_list.`
3. a required property that **is** present, or has no `obtainFrom` → both texts byte-identical to the characterization.
4. `obtainFrom` naming a tool that is not in the route's registry → no clause (never point at a tool the run cannot see).
5. a validation failure about something else (bad format of a present field) → no clause.
6. unknown tool (S1) and non-validation failures → unchanged.

## Change
1. `core/src/tool-input-repairs.ts`: `missingArgumentGuidance({ inputSchema, input }, { isKnownTool })` → sentences for
   required properties that are absent and declare `obtainFrom`.
2. mcp `tool-arguments.ts`: `namedFieldMessage` appends the typed-path clause.
3. daemon: new `daemon/src/http/validation-guidance.ts` (≤ 40 lines) used by the `errorKind === 'validation'` arm in
   `delegated-tools.ts` (net growth there ≤ 4 lines); it reads the descriptor S1's `resolveToolTarget` already found.

## Acceptance
Six cases green with exact text on both paths and on both gateways; gate green for `core`, `mcp`, `daemon`.
