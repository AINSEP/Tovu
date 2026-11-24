/**
 * @file The agent daemon's `GET /api/active` — the route `@jini-ai/mcp`'s `get_active_context` tool
 * and its active-resource read call, answered from the admin screen each live run was started from.
 *
 * Run-start screen context is already known; use it instead of requiring a separate client POST
 * to populate the generic active-context pointer.
 *
 * Which run: `GET /api/active` carries no run id, so the route cannot tell which run is asking. It therefore answers only
 * when every live run's screen agrees, and `{active: false}` when two live runs were sent from
 * different screens: an ambiguous answer is reported as none, never as another conversation's
 * screen. The run's own prompt carries its exact screen either way (`buildPageContextPromptBlock`).
 *
 * Age: a recording older than http-kit's `ACTIVE_CONTEXT_TTL_MS` is ignored, matching the 5-minute
 * contract `get_active_context`'s own description states.
 *
 * Trust: every value comes from the browser via `readRunPageContext`, already validated and capped.
 *
 * The per-run store itself is `@jini-ai/daemon/http`'s `createRunActiveContextStore`; this file is the
 * Express mount only.
 */
import type { Express } from "express";
import type { RunActiveContextStore } from "@jini-ai/daemon/http";

/** The route `@jini-ai/mcp`'s `get_active_context` calls. */
export const ACTIVE_CONTEXT_PATH = "/api/active";

/**
 * Mounts `GET /api/active` on the daemon app. Mount it AFTER `requireAgentDaemonToken`: `jini-mcp`
 * sends the daemon token (`mcp-injection.ts`), and nothing else may read the operator's screen.
 */
export function registerRunActiveContextRoute({ app, store }: { app: Pick<Express, "get">; store: Pick<RunActiveContextStore, "read"> }, _optional: Record<string, never> = {}): void {
  app.get(ACTIVE_CONTEXT_PATH, (_req, res) => {
    res.json(store.read());
  });
}
