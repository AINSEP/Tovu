/**
 * @file ADR-049 Decision 2 — resolves the `jini-mcp` bin `@jini-ai/daemon`'s `AgentExecutor` spawns
 * as a CLI-injected MCP server, so a spawned coding-agent CLI (Claude Code today — the one def
 * whose `externalMcpInjection` is `'claude-mcp-json'`) can reach Tovu's own registered tools
 * (`tool-registrations.ts`) through the daemon's `/api/delegated-tool-calls` route, instead of
 * only its own native filesystem/shell tools.
 *
 * Resolved via `require.resolve("@jini-ai/mcp")` + a sibling-path walk, NOT
 * `require.resolve("@jini-ai/mcp/dist/bin/serve.js")` directly: the package's `exports` map only
 * declares `"."` (`./dist/index.js`) — `bin` entries are outside that map, so Node's strict
 * subpath resolution rejects a direct `require.resolve` of the bin script with
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` even though the file is really on disk (verified against
 * `@jini-ai/mcp@0.1.2`). Resolving the package's one exported entry point and walking to
 * `bin/serve.js` as a plain filesystem path sidesteps the exports map entirely — this is a path
 * string handed to `spawn`, never itself passed back through `require`/`import`.
 *
 * `credential` was missing until now — confirmed live (2026-07-30) that its absence silently
 * broke the entire delegated-tool surface: with no `JINI_DAEMON_TOKEN` env var, the spawned
 * `jini-mcp` child's every callback to `/api/tools/search`, `/api/tools/:id`, and
 * `/api/delegated-tool-calls` hit `daemon-auth.ts`'s `requireAgentDaemonToken` gate with no
 * `Authorization` header and failed — so neither Forms nor Identity tools were ever reachable by
 * a spawned Claude Code or Codex CLI, despite being correctly registered and tested. Floor-tier
 * fix, disclosed as such: this reuses `TOVU_AGENT_DAEMON_TOKEN`, the single boot-wide token
 * `ensureAgentDaemonToken` mints — NOT the genuinely per-run, narrowly-scoped credential the
 * upstream doc comment on `McpJsonInjectionOptions.credential` asks for ("Never hand this the
 * host's own inbound API token... its credential should authorize its own callback route and
 * nothing else"). Tovu's daemon currently has only one token tier, so this is what's available;
 * a real per-run credential (minted per `runId`, checked only against that run's own delegated
 * routes) is the correct follow-up, not a drive-by here.
 */
import { dirname, join } from "node:path";
import type { McpJsonInjectionOptions } from "@jini-ai/daemon";
import { AGENT_DAEMON_TOKEN_ENV_VAR } from "./daemon-auth";

export function resolveMcpJsonInjection(daemonUrl: string): McpJsonInjectionOptions {
  const entryPoint = require.resolve("@jini-ai/mcp");
  const script = join(dirname(entryPoint), "bin", "serve.js");
  return {
    command: process.execPath,
    args: [script],
    daemonUrl,
    credential: () => {
      const token = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
      if (!token) {
        throw new Error(`mcp-injection: ${AGENT_DAEMON_TOKEN_ENV_VAR} is unset — the daemon should have minted it before this ever runs`);
      }
      return token;
    },
  };
}
