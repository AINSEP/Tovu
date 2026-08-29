/**
 * @file The admin assistant's master off switch (`TOVU_ADMIN_ASSISTANT=off`).
 *
 * Scope: the ADMIN assistant only. The public visitor assistant (ADR-054) is a separate product with
 * its own master switch (`assistant/public-assistant-settings.ts`, surfaced by
 * `modules/assistant-settings.ts`) and is deliberately untouched here.
 *
 * A real disable, not a hidden widget — matching the posture ADR-054 already established for the
 * visitor assistant: when off, the admin assistant's routes are never mounted at all, rather than
 * mounted and then 403/404'd. `app.ts` gates the `mountRoutes` calls; `index.ts`/`serve.ts` gate the
 * agent-daemon spawn.
 *
 * Default ON: absent the var, behavior is bit-for-bit unchanged.
 *
 * **Why the daemon spawn is NOT gated on this alone.** The agent daemon is not a chat-only process:
 * `agent-daemon-server.ts`'s `start()` calls `attachFederatedMcpTools` unconditionally (and
 * `void start()` runs at module load), so external-MCP connection, OAuth device flow, and tool
 * admission all bootstrap inside the daemon whether or not chat is ever opened —
 * `routes/external-mcp/admissions.ts` proxies that live daemon and 503s
 * `AGENT_DAEMON_UNAVAILABLE` without it. Gating the spawn on chat alone would silently break the
 * External MCP settings tab for an operator who wants MCP tools but no admin chat. See
 * {@link shouldStartAgentDaemon}.
 */

/** `TOVU_ADMIN_ASSISTANT=off` (case-insensitive) is the only value that disables. Anything else —
 *  unset, empty, "on", a typo — leaves the assistant enabled, so a mistyped value can never silently
 *  turn off a feature the operator believes is running. */
export function isAdminAssistantEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TOVU_ADMIN_ASSISTANT?.trim().toLowerCase() !== "off";
}

/**
 * Whether this process should spawn the agent daemon.
 *
 * Deliberately NOT just `isAdminAssistantEnabled()` — see this file's header. The daemon also owns
 * external-MCP federation, so it must still start when external MCP is configured even with the
 * admin assistant off.
 *
 * @param externalMcpConfigured - whether this site has any external MCP server configured. Passed in
 *   rather than read here so this module stays free of db/deps imports (it is imported by the `cli`
 *   layer, which must not reach into feature data access).
 */
export function shouldStartAgentDaemon(
  externalMcpConfigured: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isAdminAssistantEnabled(env) || externalMcpConfigured;
}
