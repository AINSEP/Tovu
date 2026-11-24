import { createAgentDaemonOriginResolver } from "@jini-ai/sidecar/daemon-origin";

import { delegatedAssistantDaemonConnection } from "./assistant-daemon-connection.js";

/**
 * @file This process's one agent-daemon origin resolver. The resolution contract (explicit
 * `JINI_AGENT_DAEMON_URL`/`JINI_AGENT_DAEMON_PORT` first, else a self-allocated free port) lives in
 * `@jini-ai/sidecar/daemon-origin`; this file owns the production instance, which `index.ts` and
 * `cli/commands/serve.ts` `ensure()` before `createApp()` and `daemon-supervisor.ts` reads per spawn,
 * plus the delegated-connection override of the URL.
 */

// The live process environment object: a test harness that sets `JINI_AGENT_DAEMON_URL` after this
// module was first imported still wins (the resolver re-reads it on every call).
const productionResolver = createAgentDaemonOriginResolver({ env: process.env });

/** Production entry point — see {@link AgentDaemonOriginResolver.ensure}. */
export function ensureAgentDaemonPortResolved(): Promise<void> {
  return productionResolver.ensure();
}

/** Production entry point — see {@link AgentDaemonOriginResolver.getUrl}. */
export function getAgentDaemonUrl(): string {
  return delegatedAssistantDaemonConnection({}, {})?.url ?? productionResolver.getUrl();
}

/** Production entry point — see {@link AgentDaemonOriginResolver.getPortForSpawnEnv}. */
export function getAgentDaemonPortForSpawnEnv(): string | undefined {
  return productionResolver.getPortForSpawnEnv();
}

/** Refresh only the self-selected port immediately before demand; explicit origin precedence stands. */
export function refreshAgentDaemonPort(): Promise<void> {
  return productionResolver.refresh();
}
