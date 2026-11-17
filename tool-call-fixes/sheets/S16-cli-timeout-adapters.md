# S16. Measure each agent CLI, then stage tool-call timeouts as adapter data (C7, mechanism M9)

Repo: Jini. Packages: `agent-runtime`, `mcp`, `daemon`. Estimate: 180k Sonnet. Prerequisites: S15 merged.
Order: after lane K has moved the per-CLI MCP config code (reconcile SEQUENCE H2 step 5); if K has not landed, do
Step 0 only and stop.

## Why measurement comes first
The design could not verify any CLI's behaviour. Writing a timeout key a CLI does not know can break its config
(the stale-entry and union-schema incidents were of that kind). So: measure, record, then write only what was measured.

## Step 0: probe (commit the result as `packages/agent-runtime/docs/mcp-tool-call-behaviour.md`)
For every agent def that injects MCP (`rg "externalMcpInjection" packages/agent-runtime/src/defs`): run the CLI, if it
is installed in the environment, against a recording MCP server (reuse `mcp/src/federation/testing` or the smoke
harness) exposing one tool that waits. Record per CLI and version:
| Field | How |
|---|---|
| sends `_meta.progressToken` on `tools/call` | read the recorded request |
| resets its timer on `notifications/progress` | tool waits longer than the CLI's documented limit while sending progress |
| per-server or global tool timeout key | the CLI's own `--help` / documentation for the installed version; quote the source |
| default limit | documentation, else measured |
A CLI that is not installed or cannot run headless is recorded as `unknown`. Do not fill a cell from memory.

## Red-first
`defs` tests: for each CLI with a measured timeout key, the generated MCP config contains that key with the host's value
and nothing else changes (golden diff of the config object). For `unknown` CLIs the config is byte-identical to today.

## Change
1. `RuntimeAgentDef` capability: `mcpToolCall?: { sendsProgressToken: boolean; resetsOnProgress: boolean; timeoutConfig?: { key: string; unit: 'ms' | 's' } }`.
2. The MCP config writers (`mcp/src/core/config.ts`, `core/opencode/config.ts`, and the per-CLI writers lane K created) emit the key when the def declares one and the host passes `toolCallTimeoutMs`.
3. Host option only; no default value in Jini. Tovu sets it in a later one-line change once the owner picks the number (OD-6).

## Acceptance
The table is committed with sources; config goldens green; `pnpm guard` (no vendor name outside `defs/` and config writers); existing agent-install tests unchanged.
