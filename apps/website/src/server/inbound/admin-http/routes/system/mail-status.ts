import type { Express } from "express";

import type { MailerPort } from "#src/platform/mail/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file `GET /api/admin/v1/workspaces/:workspaceId/system/mail-status` — reports whether this site
 * can actually deliver email. The admin form editor greys out its notification settings while it
 * cannot (owner ask, 2026-09-22: "no mail adapters are wired … it should be greyed out").
 *
 * Read-only and display-only: stored `notify_json` values and the forms write API are unaffected.
 * Gated on `admin.forms.manage` because the form editor is the consumer, so any principal who can
 * edit a form's notify settings can also see whether they will take effect.
 */
export type AdminMailStatusDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "mailer">;

/**
 * Whether the resolved mailer really sends mail. `ConsoleMailerAdapter` (driver `console`) is
 * `resolve-mailer.ts`'s no-credential fallback and only logs to stdout.
 *
 * Reads `capabilities()` synchronously, so a request in the first milliseconds after boot can
 * still see the pre-swap console adapter — the startup race `resolve-mailer.ts`'s header discloses.
 *
 * @complexity O(1).
 */
export function isMailDeliveryAvailable(mailer: MailerPort): boolean {
  return mailer.capabilities().driver !== "console";
}

export function registerAdminMailStatusRoute(app: Express, deps: AdminMailStatusDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/system/mail-status", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.forms.manage",
        workspaceId: deps.workspaceId,
        entityType: "mail",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.forms.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.forms.manage", reason: authResult.reason },
        });
        return;
      }

      res.status(200).json({ mailDeliveryAvailable: isMailDeliveryAvailable(deps.mailer) });
    } catch (err) {
      console.error("[system/mail-status] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
