# S16b. Tool-call timeouts as adapter data, bound by the host (C7, mechanism M9)

Repos: Jini (`agent-runtime`, `mcp`, `daemon`), then Tovu. Estimate: 170k Sonnet.
Prerequisites: S16a; lane K (it moves the per-CLI MCP config code; reconcile SEQUENCE H2 step 5). Needs decision: **OD-6** (the number).
Landed checks: `test -f ../Jini/packages/agent-runtime/docs/mcp-tool-call-behaviour.md`; lane K moved the per-CLI
folders out of the daemon: `test ! -d ../Jini/packages/daemon/src/agent-executor/claude && rg -l "mcp-delivery" ../Jini/packages/agent-runtime/src`
(at the plan's base the writers are `daemon/src/agent-executor/claude/mcp-delivery.ts` and `…/codex/mcp-delivery.ts`,
with `mcp-bridge.ts`). If lane K has not landed: STOP.

Only rows the S16a matrix marks **measured with a timeout key** are touched. `unknown` and `unsupported` rows keep
byte-identical config. If the matrix has no measured key at all: report that and stop (nothing to build).

## Read first
The S16a doc. `rg -ln "mcp-delivery|claude-mcp-json|codex-toml|opencode-env-content" packages/agent-runtime/src packages/mcp/src` (the config writers after lane K) ·
`rg -n "interface RuntimeAgentDef" packages/agent-runtime/src` · Tovu `rg -n "startupToolIds" apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` (the launch options object nearby).

## Characterization (passes today)
Golden of the generated MCP config object for each measured CLI (no timeout key present).

## Red-first
1. per measured CLI: with `toolCallTimeoutMs: 600_000` from the host, the generated config contains exactly that
   CLI's documented key with the value in the documented unit, and nothing else changes (golden diff).
2. without the host option → byte-identical to the characterization.
3. `unknown` / `unsupported` CLIs → byte-identical with or without the option.
4. Tovu: the launch passes the OD-6 number; a run for a measured CLI gets the key (integration test over the real launch-options builder with a fake executor).

## Change (one gated commit per item)
1. `RuntimeAgentDef` gains `mcpToolCall?: { sendsProgressToken: boolean; resetsOnProgress: boolean; timeoutConfig?: { key: string; unit: 'ms' | 's' } }`; filled only from the matrix.
2. The config writers emit the key when the def declares one and the host passes `toolCallTimeoutMs`. No default in Jini.
3. Tovu (linked build): pass `toolCallTimeoutMs` from one named constant beside the launch options, with a comment naming OD-6.
   The scope file grows by one line at most (`check:size`).

## Acceptance
Goldens green; `pnpm guard` (no vendor name outside `defs/` and the config writers); existing agent-install tests unchanged; gate green in both repos.
