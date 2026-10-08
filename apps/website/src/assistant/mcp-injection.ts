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
 * The bridge requires a per-run credential bound to its run's principal and bridge routes.
 * The proxy's boot-wide token trusts a caller-supplied principal header and must never be handed
 * to a model-driven bridge. Missing credentials would leave every delegated callback unauthenticated.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { McpJsonInjectionOptions } from "@jini-ai/daemon";

const require = createRequire(import.meta.url);

/** The process facts that decide how the bridge is launched; injectable so both runtimes are testable. */
export interface BridgeRuntime {
  readonly execPath: string;
  /** `process.versions.electron`: set whenever this process is the Electron binary, even as Node. */
  readonly electronVersion: string | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
}

const currentRuntime = (): BridgeRuntime => ({
  execPath: process.execPath,
  electronVersion: process.versions.electron,
  env: process.env,
});

/**
 * @param mintRunCredential - Mints the bridge's per-run credential.
 *   Required, with no fallback to the proxy's boot-wide token: that token makes a caller's principal
 *   header trusted, which a model-driven bridge must never be.
 */
export function resolveMcpJsonInjection(
  daemonUrl: string,
  mintRunCredential: (runId: string) => string,
  runtime: BridgeRuntime = currentRuntime(),
): McpJsonInjectionOptions {
  const entryPoint = require.resolve("@jini-ai/mcp");
  const script = join(dirname(entryPoint), "bin", "serve.js");
  // Inside the desktop app `execPath` is the Tovu Electron binary, which boots as a GUI app unless
  // ELECTRON_RUN_AS_NODE is set: the bridge then never speaks MCP, Claude times it out, and the run
  // has zero Tovu tools. Jini's agent env allowlist strips this process's own copy
  // before the CLI spawns the bridge, so it has to travel on the bridge entry itself.
  const underElectron = runtime.electronVersion !== undefined || runtime.env.ELECTRON_RUN_AS_NODE !== undefined;
  return {
    command: runtime.execPath,
    args: [script],
    ...(underElectron ? { env: { ELECTRON_RUN_AS_NODE: "1" } } : {}),
    daemonUrl,
    credential: ({ runId }) => mintRunCredential(runId),
  };
}
