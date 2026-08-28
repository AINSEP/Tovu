import type { Express, Request, Response } from "express";

import type { FederatedAdmissionReport } from "../../../assistant/mcp-federation/trust.js";

/**
 * @file `GET /api/federation/admissions` — reports what THIS daemon process actually admitted from
 * every configured external MCP connection at boot, rather than only writing that accounting to
 * this process's own stderr and discarding it (`mcp-federation/bootstrap.ts`'s
 * `logFederatedAdmissionReport`, which still runs and is unaffected by this route).
 *
 * Why this exists: `mcp-federation/trust.ts` R5 freezes the admitted set at connect, on purpose
 * (rug-pull protection — see that file's own header). The tab an operator edits, though, is not the
 * thing this daemon actually loaded; today the only way to see the gap between "what was saved" and
 * "what is live" is to read this process's terminal at the moment it booted. That is how this
 * project discovered Higgsfield's blocked `generate_image` in the first place. This route is the
 * structured, machine-readable form of the same accounting — see the write-tools implementation
 * outline, C-009 and §3.1 Source B.
 *
 * Authenticated by the SAME mechanism as every other route in this process: `agent-daemon-
 * server.ts` mounts `requireAgentDaemonToken()` globally, as the very first `app.use`, before any
 * route (including this one) is registered, and this path is never added to that gate's
 * `exemptPaths`. So a caller with no/invalid bearer token gets the gate's own fail-closed 401 (or
 * 503 if the daemon's own token is unconfigured) before this handler ever runs — there is
 * deliberately no second auth check inside this file. See `daemon-auth.ts`.
 *
 * In-memory and boot-scoped, matching R5's own framing: `reports` is handed in once, at
 * registration time, as a plain snapshot of what `attachFederatedMcpTools` returned during this
 * boot — never re-read, never persisted, and lost on restart, which is correct: it describes THIS
 * process's frozen admitted set, and a stale answer here would be worse than an honest "ask again
 * after the next boot."
 *
 * The intended caller is `src/server/routes/admin/external-mcp` (a separate phase, C-008), which
 * proxies this over the same authenticated `AGENT_DAEMON_URL` + `AGENT_DAEMON_TOKEN_ENV_VAR` channel
 * `assistant-daemon-client.ts` already uses. This route itself does not know or care who calls it —
 * it is the daemon's own honest answer to "what did you actually admit."
 */

export const FEDERATION_ADMISSIONS_PATH = "/api/federation/admissions";

export interface FederationAdmissionsRouteDeps {
  /**
   * The snapshot `attachFederatedMcpTools` returned at boot — `AttachFederatedToolsResult.reports`
   * verbatim, one entry per connection that reached admission. A connection that failed before
   * admission (bad spawn, timed-out handshake, native-id collision) contributes no entry, matching
   * that field's own contract.
   */
  readonly reports: readonly { readonly connectionId: string; readonly report: FederatedAdmissionReport }[];
}

/**
 * Mounts the read-only admissions report route.
 *
 * @param app - The daemon's Express app, already gated by `requireAgentDaemonToken`.
 * @param deps.reports - This boot's admission snapshot; see {@link FederationAdmissionsRouteDeps}.
 * @complexity O(1) — serves an already-computed snapshot; no work happens per request.
 * @overallScore 100
 */
export function registerFederationAdmissionsRoute(app: Express, deps: FederationAdmissionsRouteDeps): void {
  app.get(FEDERATION_ADMISSIONS_PATH, (_req: Request, res: Response) => {
    res.status(200).json({ connections: deps.reports });
  });
}
