import type { Express, Request, Response } from "express";

/**
 * @file `POST /api/federation/reload` — re-admits federated MCP connections an operator authorized
 * AFTER this daemon process already booted, without a restart. See
 * `assistant/mcp-federation/reload.ts` for the coordinator this route is a thin HTTP wrapper over,
 * and that file's own header for the R5 guarantee this route cannot violate: it only ever widens the
 * admitted set with connections that have NEVER been admitted before; an edit to an already-admitted
 * connection is invisible to it, exactly as it was before this route existed.
 *
 * Authenticated by the SAME mechanism as every other route in this process — `agent-daemon-
 * server.ts` mounts `requireAgentDaemonToken()` globally, as the very first `app.use`, before any
 * route (including this one) is registered, and this path is never added to that gate's
 * `exemptPaths`. See `federation-admissions-route.ts`'s identical note, and `daemon-auth.ts`.
 *
 * Failure stays VISIBLE, never silent, per the feature's own hard requirement: a rejection from
 * `deps.reload()` is logged here (this process's own stderr — the channel every other failure in
 * this file's siblings already uses) and reported to the caller as a real, non-200 status, so a
 * caller that awaits this route (today: the public OAuth callback and the admin PUT route, both in
 * the main web server process) can decide whether to surface it, rather than the reload silently
 * doing nothing while the operator is told their connection succeeded. `GET
 * /api/federation/admissions` and its manual restart button (`external-mcp-admissions-rules.ts`)
 * remain the escape hatch either way — this route never removes or downgrades a connection that was
 * already admitted, so a failed reload attempt leaves an operator no worse off than "the new
 * connection needs the same restart it would have needed before this route existed."
 */

export const FEDERATION_RELOAD_PATH = "/api/federation/reload";

export interface FederationReloadRouteDeps {
  /** The coordinator's own `reload()` — see `mcp-federation/reload.ts`. Injected rather than
   *  constructed here so this route stays a pure Express adapter, testable without a real
   *  `ToolRegistry` or a real external MCP connection. */
  readonly reload: () => Promise<{ readonly newlyAdmittedConnectionIds: readonly string[] }>;
}

/**
 * Mounts the reload route.
 *
 * @complexity O(1) plus whatever `deps.reload()` costs (documented on
 * `FederationReloadCoordinator.reload`).
 * @overallScore 100
 */
export function registerFederationReloadRoute(app: Express, deps: FederationReloadRouteDeps): void {
  app.post(FEDERATION_RELOAD_PATH, async (_req: Request, res: Response) => {
    try {
      const result = await deps.reload();
      res.status(200).json({ ok: true, newlyAdmittedConnectionIds: result.newlyAdmittedConnectionIds });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[agent-daemon] mcp-federation: reload failed — ${message}`);
      res.status(500).json({ ok: false, error: "federation reload failed" });
    }
  });
}
