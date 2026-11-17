# S4a. `check:tool-guides` in report mode, over model-facing text only (C1b, mechanism M2)

Repo: Tovu (reads Jini sources from `../Jini`). Estimate: 200k Sonnet. Prerequisites: S3.
Landed check: `rg -n "toolCallText" ../Jini/packages/core/src/tool-call-text.ts`.
This sheet changes **no** guide text and no runtime behaviour. Files outside `development/` and `package.json` do not change.

## What is scanned (judge finding 18; lesson 37)
Not "every string in the source". A string is checked only when it is **text a model reads**, known by where it comes from:

| Source | How it is collected |
|---|---|
| A. Registry text | every descriptor `description` and every schema `description` from the booted hermetic registry (`development/evals/tool-search-eval-registry.ts`, as `check-route-tool-parity.ts` boots it) |
| B. MCP-local tool text | `name`/`description`/schema descriptions of the tool objects in Jini `packages/mcp/src/server/tools/*.ts`, and the `INSTRUCTIONS` constant in `run-tool-host.ts`, read with the TypeScript compiler API from those files only |
| C. Declared guide modules | string literals and template chunks in the files listed in the new, committed `development/parity/tool-guide-sources.json` (each entry: path, kind, one-line reason) |

Seed for C (verify each path with `ls`; drop and report any that is gone): `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts`,
`…/assistant-runtime-guidance.ts`, `apps/website/src/features/agent-plugins/bundled-catalog.ts`, `…/agent-plugins/host-tool-ports.ts`,
`apps/website/src/features/plugin-runtime/plugin-tool-messages.ts`, `…/plugin-runtime/capability-card.ts`,
Jini `packages/daemon/src/core/read-only-tools.ts`, Jini `packages/mcp/src/server/tool-result-pages.ts`, the shipped plugin guidance content files.

Completeness of C is measured, not assumed: a second, **report-only** pass lists "candidate" files outside A to C in
which a registered tool id appears inside a string literal that also contains a space (prose). Each candidate is
classified by hand in `tool-guide-sources.json` as `guide` (joins C) or `not-guide` with a reason. The candidate
pass never fails the check and never classifies a call by itself.

## Build
1. `development/scripts/lib/tool-guide-scan.ts` (pure, unit-tested): `{ toolIds, localNames, wireNames, sources: { path, kind, text }[] }` → mentions:
   - `named`: a registered id or local name inside a longer text;
   - `gatewayForm`: the mention sits in `toolId":"<id>"` or `toolId: "<id>"`;
   - `unknownCall`: in sources A to C only, a snake_case token followed by `(` or wrapped in backticks that is not a
     registered id, a local name, a wire name, or a declared input property or alias of any tool.
2. `development/scripts/check-tool-guides.ts`: collects A, B, C, runs the scan, runs the candidate pass.
3. Output `development/parity/tool-guides.json`:
   `{ tools, local: [...], named: { id: [sites] }, unknownCalls: [...], candidates: { unclassified: [...] }, pinnedFit: { namedDescriptors, schemaBytes, limitTools: 64, limitBytes: 262144 } }`.
   `pinnedFit` counts **exposed registry descriptors only**: `limitReason` in Jini `core/src/tool-exposure.ts` compares
   `snapshot.tools.length` with `maxTools`, and MCP-local tools are reserved names that are not in that list.
4. `package.json`: `"check:tool-guides"`, report-only (exit 0) with `--strict` available, like `check:route-tool-parity`.

## Tests (each written before the code), `development/scripts/__tests__/tool-guide-scan.unit.test.ts`
Positive:
- `"Use theme_list_files to discover"` → named `theme_list_files`.
- `` `load_agent_plugin({pluginId:"x"})` `` → named, call form. `execute_delegated_tool({"toolId":"credential_save"…` → gatewayForm.
- `` `menus_list_menus` `` with no such id → unknownCall. `agent_plugin_<id>` placeholder text → unknownCall.
Negative (must produce **no** mention and **no** unknownCall):
- SQL in a guide-kind source: ``SELECT json_extract(data, '$.x') FROM t WHERE json_valid(data)``, `json_each(`, `json_quote(`.
- a template placeholder `${tool_name}(…)`; a TypeScript identifier `some_helper(arg)` in a `not-guide` file;
  JSON-schema syntax `"type":"object","additional_properties":false`; a declared alias in backticks (`` `old_string` ``).
- a descriptor's own `id: "theme_list_files"` literal (the literal equals the id).
- real files, run as fixtures: `apps/website/src/platform/db/migrations/0003_coercion_json_as_json.ts` and
  `apps/website/src/platform/db/sqlite/fresh-content-db.ts` (both contain SQL `json_*(` calls at the plan's base) produce zero findings (they are not in A to C, and the
  candidate pass ignores literals without a registered id).

## Deliverables in the report
- Counts: registered tools, local tools, distinct named tools, sites per kind, unknown calls, unclassified candidates.
- `pinnedFit`, and whether the named descriptors fit 64 tools / 256 KiB. **If not, stop after committing the report**: OD-7.
- The tests that read description or guide text (`rg` the quoted texts of every `named` site): S4b needs the list.

## Acceptance
`npm run check:tool-guides` prints the summary and writes the JSON; scanner tests green; `npm run typecheck:scripts`
green; `git diff --stat $BASE...HEAD` lists only `development/**` and `package.json`.
