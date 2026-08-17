import type { Express } from "express";

import { restartAssistantDaemon as restartAssistantDaemonReal, type RestartAssistantDaemonResult } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin "Restart assistant" action — `POST /api/admin/v1/workspaces/:workspaceId/system/
 * assistant-daemon/restart`, the manual recovery seam for the locally-spawned agent daemon
 * (`src/assistant/daemon-supervisor.ts`). Sibling to the on-demand recovery wired into
 * `server/modules/assistant.ts`'s daemon-proxy code (`respondIfDaemonKnownFailed` now calls
 * `ensureAssistantDaemonStarted()` automatically on every known-failed request) — this route exists
 * for the case an operator wants to force it NOW rather than wait for the next request to trigger
 * it, or wants to recover a daemon whose crash-loop cap has already tripped (on-demand recovery
 * covers that too, but only once a request happens to arrive).
 *
 * `system.write`-gated, matching `dockerfile-source.ts`'s `PUT` route: this is a mutation on system
 * process state, not a read.
 *
 * ## What this route does NOT do
 *
 * `restartAssistantDaemon()` (`daemon-supervisor.ts`) is synchronous and returns as soon as the
 * restart has been INITIATED — it does not, and structurally cannot, wait for the new daemon
 * process to become healthy, because no "daemon became healthy" signal exists anywhere in this
 * codebase (see that function's own header). So this route's response means "a restart was
 * accepted", never "the assistant is back up". Reporting anything stronger — "restarted
 * successfully" as if that implied health — would be exactly the lying-comment failure mode a past
 * defect in this repo was caused by. Live status after the click is the caller's job, by polling
 * the existing `GET /readyz` (unauthenticated, already carries `assistantDaemonKnownFailed: true`
 * once a fresh failure latches) or `GET .../system/module-status` (`system.read`-gated, full detail,
 * `readiness-state.ts`'s `recordAssistantDaemonFailure` already folds the daemon's own failures into
 * that same snapshot) — this route intentionally returns neither.
 *
 * `restartAssistantDaemon()` refuses with `{ok: false, reason: "shutting down"}` only while THIS
 * Tovu process is itself tearing down (`daemon-supervisor.ts`'s `terminating` flag, set once by
 * `shutdown()` and never cleared) — a crash-loop cap having tripped does NOT refuse a manual
 * restart; that is the whole point of this seam existing separately from automatic respawn. Every
 * refusal reason is relayed to the caller verbatim, never translated into a generic error.
 */
export type AdminAssistantDaemonDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  /**
   * Defaults to the real `restartAssistantDaemon` (`src/assistant`, backed by
   * `daemon-supervisor.ts`'s process-wide singleton). Injectable so a route test can prove both the
   * `{ok: true}` and `{ok: false, reason}` response shapes directly — the real implementation's
   * `{ok: true}` branch only occurs once a daemon process has actually been spawned this boot
   * (`startAssistantDaemon()`), which a route-level test has no business doing.
   */
  restartAssistantDaemon?: () => RestartAssistantDaemonResult;
};

export function registerAdminAssistantDaemonRoutes(app: Express, deps: AdminAssistantDaemonDeps): void {
  const restartAssistantDaemon = deps.restartAssistantDaemon ?? restartAssistantDaemonReal;

  app.post("/api/admin/v1/workspaces/:workspaceId/system/assistant-daemon/restart", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "system.write",
        workspaceId: deps.workspaceId,
        entityType: "assistant-daemon",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'system.write' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "system.write", reason: authResult.reason },
        });
        return;
      }

      const result = restartAssistantDaemon();
      if (!result.ok) {
        // 409, not 500: this is an ordinary "cannot do that right now" business-rule refusal (the
        // process is shutting down), the same status `publish-site.ts` uses for its own "a publish
        // is already running" refusal — never a server fault.
        res.status(409).json({ ok: false, reason: result.reason, code: "ASSISTANT_DAEMON_RESTART_REFUSED" });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[system/assistant-daemon] unexpected error restarting the agent daemon", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
