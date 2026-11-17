# S4a. `check:tool-guides` in report mode, and the committed inventory (C1b, mechanism M2)

Repo: Tovu (+ a small Jini script). Estimate: 190k Sonnet. Prerequisites: S3 merged (for `toolCallText`'s gateway form).
This sheet changes **no** guide text and no runtime behaviour.

## Read first
`../DESIGN.md` §2.2, M2. `development/scripts/check-route-tool-parity.ts` (how it boots `createApp` and uses
`development/evals/tool-search-eval-registry.ts`), `apps/website/src/assistant/frontend-control-capabilities.ts`,
Jini `mcp/src/server/run-tool-host.ts` (`buildTools`: the MCP-local names).

## Build
1. `development/scripts/lib/tool-guide-scan.ts` (pure, unit-tested): given `{ toolIds, localNames, sources: { path, text }[] }` returns mentions:
   - `named`: a registered id or local name inside a longer string literal / template chunk / description;
   - `gatewayForm`: the mention sits in `toolId":"<id>"` or `toolId: "<id>"`;
   - `unknownCall`: a snake_case token followed by `(` or wrapped in backticks that is not a registered id, not a local name, and not a declared input property name of any tool.
   Use the TypeScript compiler API to read literals (the repo already depends on `typescript`); do not use regex over whole files.
2. `development/scripts/check-tool-guides.ts`: boots the same hermetic registry as the parity check, adds descriptor descriptions and every schema `description`, scans `apps/website/src/**`, `packages/**` (non-test), the shipped plugin guidance content, and Jini `packages/mcp/src/**`, `packages/daemon/src/**` (path from `../Jini`).
3. Output `development/parity/tool-guides.json`: `{ tools: <count>, local: [...], named: { id: [sites] }, unknownCalls: [...], pinnedFit: { tools, schemaBytes, limitTools: 64, limitBytes: 262144 } }`.
4. `package.json`: `"check:tool-guides": "… check-tool-guides.ts"`, report-only (exit 0) with `--strict` available, like `check:route-tool-parity`.

## Tests (red-first for the scanner)
`development/scripts/__tests__/tool-guide-scan.unit.test.ts`, each written before the code:
- `"Use theme_list_files to discover"` → named `theme_list_files`.
- a descriptor's own `id: "theme_list_files"` literal → **not** a mention (literal equals the id).
- `` `load_agent_plugin({pluginId:"x"})` `` → named, call form.
- `execute_delegated_tool({"toolId":"credential_save"…` → gatewayForm.
- `` `menus_list_menus` `` with no such id → unknownCall; `` `old_string` `` (a declared alias/property) → nothing.
- `agent_plugin_<id>` placeholder text → unknownCall.

## Deliverables in the report
- The counts: registered tools, local tools, distinct named tools, guide sites per kind, unknown calls.
- Whether `named + local` fits 64 tools / 256 KiB. **If it does not fit, stop after committing the report**: OD-7 decides.
- The list of tests that read description or guide text (run the suites once with a one-word change to a description in a scratch commit you then drop, or `rg` the quoted texts): S4b needs it.

## Acceptance
`npm run check:tool-guides` prints the summary and writes the JSON; scanner tests green; `npm run typecheck:scripts` green; no file outside `development/` and `package.json` changed.
