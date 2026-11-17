# S1. Unknown tool id answers `404 UNKNOWN_TOOL` on every path (C1a, mechanism M1)

Repo: Jini. Packages: `protocol`, `core`, `daemon`, `mcp`. Estimate: 170k Sonnet. Prerequisites: none.
Coordinate: error-system E5a edits the same status table; R7 moves `daemon/src/http/*`. If R7's move of
`delegated-tools.ts` has landed, apply the same change at its new path and say so.

## Read first
`../DESIGN.md` §2.1 and M1. Files: `protocol/src/errors.ts` (`GENERIC_ERROR_CODES`), `core/src/contracts/server/api-error.ts`
(`ERROR_STATUS_BY_CODE`), `daemon/src/http/delegated-tools.ts` (`checkReadOnlyConstraint`, the route `handle`, the
`ToolInputError` catch), `daemon/src/core/read-only-tools.ts` (`unknownToolMessage`, `checkReadOnlyTool`),
`daemon/src/core/tool-candidates.ts`, `mcp/src/server/tool-protocol.ts` (`handleToolCall`, "unknown tool:").

## Inventory step (do before editing; paste the lists in the report)
- Every reader of `TOOL_OPERATION_DENIED` and of `DaemonHttpError.status` in Jini and Tovu (`rg` both repos, tests included).
- Every test that asserts the texts `no tool "` , `is registered; use search_tools`, `unknown tool`.
- Every caller of `checkReadOnlyTool` (Tovu calls it too: `agent-daemon-scope.ts`, `isReadOnly`). Its return contract for a registered tool must not change.

## Characterization (passes today)
`daemon/src/http/__tests__/delegated-tools.unknown-tool.integration.test.ts`:
1. read-only gateway + made-up id → status 403, code `TOOL_OPERATION_DENIED`.
2. unconstrained gateway + made-up id → status 400, code `BAD_REQUEST`.
3. made-up id never reaches `resolvePrincipal` on path 1 (fake port records zero calls). Record what path 2 does today.

## Red-first (must fail because the status is 403 / 400 and the text differs)
Same file: both gateways + made-up id `content_reed` with a registry holding `content_read.menu` →
status `404`, code `UNKNOWN_TOOL`, message exactly
`There is no tool named "content_reed". Closest names: content_read.menu. Find tools with search_tools.`
No candidates → `There is no tool named "zzz". Find tools with search_tools.`
Also: `resolvePrincipal` and the executor fake record **zero** calls on both gateways.
Also (security): a tool that exists but is absent from the registry passed to the route gets the byte-identical answer a made-up id gets.

## Change
1. `protocol/src/errors.ts`: add `'UNKNOWN_TOOL'` to `GENERIC_ERROR_CODES`. `core/.../api-error.ts`: `UNKNOWN_TOOL: 404`.
2. New `daemon/src/core/tool-target.ts`: `resolveToolTarget`, `unknownToolMessage` exactly as in DESIGN M1, **without** the family port (S2 adds it). Reuse `toolCandidates`.
3. `delegated-tools.ts`: call `resolveToolTarget` once after the run-existence check. Unknown → `err(createApiError({ code: 'UNKNOWN_TOOL', message }))`. Pass the resolved id on. Keep `checkReadOnlyConstraint` for registered tools; its unknown branch becomes unreachable from the route, so remove that branch from the route path only after the test proves it (keep `checkReadOnlyTool`'s own behaviour for its other callers).
4. `delegated-tools.ts` is 392 lines: new code goes in `tool-target.ts`; the route gains at most 6 lines.
5. `mcp/src/server/tool-protocol.ts`: the local "unknown tool" answer uses the same sentence with local names as candidates. `@jini-ai/mcp` may not import `@jini-ai/daemon`: put the pure sentence builder in `@jini-ai/core` (`core/src/tool-unknown-message.ts`) and have `tool-target.ts` call it.
6. Update the tests found in the inventory in the same commit as the behaviour change.

## Acceptance
- Both gateways, describe (`404 NOT_FOUND` stays as is, text unchanged) and local dispatch covered by tests with exact text.
- `rg "TOOL_OPERATION_DENIED"` readers reviewed: none treats 403 as "tool missing" any more (list each and what you did).
- Gate order test: removing the run-existence check or the read-only check makes a named test fail.
- `pnpm guard`, `pnpm typecheck`, tests of `protocol`, `core`, `daemon`, `mcp` green; counts recorded.
