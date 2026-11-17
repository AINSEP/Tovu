# S1. Unknown tool id answers `404 UNKNOWN_TOOL` on every path (C1a, mechanism M1)

Repos: Jini (`protocol`, `core`, `daemon`, `mcp`), then Tovu (tests that read the old answer). Estimate: 190k Sonnet.
Blocking decision: **OD-1**.
Prerequisites: none. No family handling here (S2a, S2b).
Coordinate: error-system E5a reads the same status table; R7 moves `daemon/src/http/*`. If `delegated-tools.ts` is
not at the path below, find `delegatedToolExecuteRoute` with `rg` and apply there; say so in the report.

## Read first
`../DESIGN.md` §2.1, M1. Symbol checks (README §4.2), all in Jini `packages/`:
`rg -n "GENERIC_ERROR_CODES" protocol/src/errors.ts` · `rg -n "ERROR_STATUS_BY_CODE" core/src/contracts/server/api-error.ts` ·
`rg -n "checkReadOnlyConstraint|delegatedToolExecuteRoute|instanceof ToolInputError" daemon/src/http/delegated-tools.ts` ·
`rg -n "unknownToolMessage|checkReadOnlyTool" daemon/src/core/read-only-tools.ts` · `rg -n "unknown tool: " mcp/src/server/tool-protocol.ts`.
Tovu: `rg -n "isRegistered" apps/website/src/server/inbound/assistant/durable-run-routes.ts` (the durable guard lets an
unregistered id through to "the daemon's not-found response" on purpose; this sheet keeps that).

## Inventory step (paste in the report)
- `rg -n "TOOL_OPERATION_DENIED" packages ../Tovu/apps ../Tovu/packages ../Tovu/development` : every reader, tests included.
- `rg -n "\.status\b" packages/mcp/src` restricted to `DaemonHttpError` readers.
- `rg -n 'no tool "|is registered; use search_tools|unknown tool' packages ../Tovu/apps ../Tovu/development` : every test or
  fixture asserting the old texts.
- Every caller of `checkReadOnlyTool` (Tovu calls it too). Its return for a **registered** tool must not change.

## Characterization (passes today; commit first)
`daemon/src/http/__tests__/delegated-tools.unknown-tool.integration.test.ts` (fakes of `RunLifecycle`, `ToolExecutor`,
`resolvePrincipal`; no module mocks):
1. read-only gateway + made-up id → 403 `TOOL_OPERATION_DENIED`.
2. unconstrained gateway + made-up id → 400 `BAD_REQUEST`.
3. made-up id on path 1: `resolvePrincipal` fake records zero calls. Record what path 2 does today.
4. unknown `runId` → 404 `NOT_FOUND` on both (the run check answers first).

## Red-first (fails: status is 403 / 400 and the text differs)
Same file. Registry holds `content_read.menu`.
- both gateways + `content_reed` → 404, code `UNKNOWN_TOOL`, message exactly
  `There is no tool named "content_reed". Closest names: content_read.menu. Find tools with search_tools.`
- no candidates → `There is no tool named "zzz". Find tools with search_tools.`
- `resolvePrincipal` and the executor fake record **zero** calls on both gateways.
- security: a tool that exists in another registry but not in the registry given to the route gets the
  byte-identical answer a made-up id gets (same status, code, message, candidates).
- gate order (README §4.12): unknown `runId` still answers 404 `NOT_FOUND` before the tool answer; a registered
  non-read tool on the read-only gateway still answers today's 403 text unchanged.

## Change (each numbered item is one gated commit)
1. `protocol/src/errors.ts`: add `'UNKNOWN_TOOL'` to `GENERIC_ERROR_CODES`. `core/.../api-error.ts`: `UNKNOWN_TOOL: 404`.
   Protocol and core tests in the same commit.
2. New `core/src/tool-call-text.ts` (pure, no `node:` import): `unknownToolSentence({ toolId, candidates }, {})`.
   Public entry in the same commit: `exports["./tool-call-text"]` and `jini.entries["./tool-call-text"]: "universal"`
   in `core/package.json` (README §4.9). Unit test with the two exact sentences.
3. New `daemon/src/core/tool-target.ts`: `resolveToolTarget({ toolId, input, registry }, {})` and `unknownToolMessage`
   as in DESIGN M1, **without** the family option. Reuses `toolCandidates` and `unknownToolSentence`.
4. `delegated-tools.ts` (392 lines; the route gains at most 6): call `resolveToolTarget` once, after the run-existence
   check and before `checkReadOnlyConstraint`. Unknown → `err({ error: createApiError({ code: 'UNKNOWN_TOOL', message }) })`.
   `checkReadOnlyTool` keeps its own unknown branch for its other callers. Move the "Before `resolvePrincipal`…"
   comment block with the code it explains. Flip characterization rows 1 and 2 in this commit.
5. `mcp/src/server/tool-protocol.ts`: the local `unknown tool: x` answer becomes `unknownToolSentence` with the local
   tool names as candidates (import `@jini-ai/core/tool-call-text`). `check_messages` keeps its own sentence.
6. Jini tests from the inventory: updated in the commit that changes what they read.
7. Tovu part (linked build): update every Tovu test and fixture from the inventory that asserts the old status or
   text; change no Tovu source unless a reader treated 403 as "tool missing" (list each reader and what you did).

## Acceptance
- Both gateways, describe (`404 NOT_FOUND`, text unchanged) and local dispatch covered with exact text.
- The gate (README §3) green in both repos; counts recorded; new export listed for REL.
