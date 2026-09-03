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
 * `credential` was missing until 2026-07-30 — confirmed live that its absence silently broke the
 * entire delegated-tool surface: with no `JINI_DAEMON_TOKEN` env var, the spawned `jini-mcp`
 * child's every callback to `/api/tools/search`, `/api/tools/:id`, and
 * `/api/delegated-tool-calls` hit `daemon-auth.ts`'s `requireAgentDaemonToken` gate with no
 * `Authorization` header and failed — so neither Forms nor Identity tools were ever reachable by
 * a spawned Claude Code or Codex CLI, despite being correctly registered and tested. The floor-tier
 * fix that landed that day reused `TOVU_AGENT_DAEMON_TOKEN` verbatim — the single boot-wide token
 * `ensureAgentDaemonToken` mints — handed unmodified to the least-trusted process in the run, and
 * disclosed itself as exactly that: NOT the genuinely per-run, narrowly-scoped credential the
 * upstream doc comment on `McpJsonInjectionOptions.credential` asks for.
 *
 * This revision replaces that. `credential` now returns `daemon-auth.ts`'s
 * `deriveDelegatedToolCredential(TOVU_AGENT_DAEMON_TOKEN, runId)` — an HMAC-SHA256 of the boot
 * token, keyed to this one run — instead of the boot token itself. The spawned `jini-mcp`
 * subprocess (and, since it inherits env, everything IT can reach) now never holds
 * `TOVU_AGENT_DAEMON_TOKEN` at all: only a value that authenticates this run's own
 * `/api/delegated-tool-calls` callbacks and nothing else, matching the upstream contract verbatim
 * ("Never hand this the host's own inbound API token... its credential should authorize its own
 * callback route and nothing else"). `TOVU_AGENT_DAEMON_TOKEN` becomes a pure signing key here,
 * read only in this process and never transmitted. The matching verification-side gate is
 * `daemon-auth.ts`'s `requireDelegatedToolCredential`, mounted at `DELEGATED_TOOL_CALLS_PATH` in
 * `agent-daemon-server.ts` — `requireAgentDaemonToken`'s own gate cannot check this value, since it
 * is never equal to the boot-wide token that gate expects.
 *
 * No new storage or expiry logic needed: the derivation is stateless, so liveness is still enforced
 * entirely by `resolvePrincipal`'s existing `principalByRunId` check, unchanged by this fix.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { McpJsonInjectionOptions } from "@jini-ai/daemon";
import { AGENT_DAEMON_TOKEN_ENV_VAR, deriveDelegatedToolCredential } from "./daemon-auth.js";

const require = createRequire(import.meta.url);

export function resolveMcpJsonInjection(daemonUrl: string): McpJsonInjectionOptions {
  const entryPoint = require.resolve("@jini-ai/mcp");
  const script = join(dirname(entryPoint), "bin", "serve.js");
  return {
    command: process.execPath,
    args: [script],
    daemonUrl,
    credential: (runId: string) => {
      const secret = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
      if (!secret) {
        throw new Error(`mcp-injection: ${AGENT_DAEMON_TOKEN_ENV_VAR} is unset — the daemon should have minted it before this ever runs`);
      }
      return deriveDelegatedToolCredential(secret, runId);
    },
  };
}
