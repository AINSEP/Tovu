# S16a. Measure each agent CLI's tool-call behaviour; commit the support matrix (C7, mechanism M9)

Repo: Jini. Package: `agent-runtime` (docs + a probe test helper). Estimate: 150k Sonnet. Prerequisites: S15.
Blocking decision: none.
Branching decision: **OD-11** (while OPEN: record the Gemini and Aider rows as the code shows them, below; "no" starts a separate design, outside this plan).
Landed check: `rg -n "export function startCallProgress" packages/mcp/src/server/call-progress.ts`.
This sheet changes **no** runtime behaviour and no generated config.

## The matrix this sheet fills (judge finding 14). Rows and transports are from the code at the plan's base.
| CLI | Agent def | How tools reach it today | Row state before measuring |
|---|---|---|---|
| Claude Code | `defs/claude.ts` | `externalMcpInjection: 'claude-mcp-json'` | measure |
| Codex | `defs/codex.ts` | `externalMcpInjection: 'codex-toml'` | measure |
| OpenCode | `defs/opencode.ts` | `externalMcpInjection: 'opencode-env-content'` | measure |
| Gemini CLI | **retired**: `defs/__tests__/gemini.test.ts` asserts it cannot be selected; only `defs/gemini/event-stream.ts` remains | none | `unsupported: retired def` (OD-11). Its successor in the registry is Antigravity (`defs/antigravity/index.ts`, `externalMcpInjection: 'env-passthrough'`): measure that row |
| Aider | `defs/aider.ts` | **none**: `mcpIsolation: 'no-client'`, no `externalMcpInjection`; the file's comment says upstream has no MCP client | `unsupported: no tool transport` (OD-11). No tool call can happen, so none of C1 to C8 can occur for it |
| every other def with `externalMcpInjection` | `rg -n "externalMcpInjection" packages/agent-runtime/src/defs` | as declared | measure if installed, else `unknown` |

Everything in S1 to S15 lives in the daemon and the MCP host, behind whatever transport a CLI uses, so it applies to
every row that has a tool transport. Only the timeout key (S16b) is per CLI.

## Probe
For each "measure" row: run the CLI, if it is installed in the environment, against a recording MCP server (reuse
`packages/mcp/src/federation/testing` or the smoke harness) exposing one tool that waits. Record per CLI **and version**:
| Field | How |
|---|---|
| sends `_meta.progressToken` on `tools/call` | read the recorded request |
| resets its timer on `notifications/progress` | the tool waits longer than the CLI's documented limit while sending progress |
| per-server or global tool timeout key, and its unit | the CLI's own `--help` / documentation for the installed version; quote the source |
| default limit | documentation, else measured |
A CLI that is not installed or cannot run headless is `unknown`. Do not fill a cell from memory.

## Deliverables (one gated commit each)
1. `packages/agent-runtime/docs/mcp-tool-call-behaviour.md`: the matrix with versions, sources and dates; the two
   `unsupported` rows with the file:line that proves each.
2. `packages/agent-runtime/src/defs/__tests__/mcp-tool-call-matrix.test.ts`: fails if a def gains or loses
   `externalMcpInjection` without a row in the matrix (reads the committed doc's table); `gemini` stays unselectable;
   `aider` stays `no-client`.

## Acceptance
The matrix is committed with a source per filled cell; every def with a tool transport has a row; gate green for `agent-runtime`.
