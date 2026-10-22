import type { Express, Request, Response } from "express";

import { mailDnsPorts, readMailDnsStatus, verifyMailDnsStatus, type DnsChangeToolDeps, type MailDnsStatus } from "#src/features/domain-dns/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

/**
 * @file The Email page's **Sender and DNS** section, over the same operations as `mail_dns_status`
 * and `mail_dns_verify` (`features/domain-dns/mail-dns-status.ts`):
 * - `GET  /api/admin/v1/workspaces/:workspaceId/system/mail-dns` (`deployments.read`): provider
 *   verdict, copyable rows and one unsaved record-by-record check.
 * - `POST /api/admin/v1/workspaces/:workspaceId/system/mail-dns/verify` (`deployments.publish`):
 *   **Check again**, saved as the sender domain's tracking state.
 * Both answer 200 with a `MailDnsStatus` whose `state` names why a table is absent (no sender,
 * no provider, verification unavailable for this provider, ...); only an unexpected fault is a 500.
 * Neither changes DNS.
 */
export interface AdminMailDnsDeps {
  workspaceId: string;
  /** The DNS change deps the `dns_*` tools use, built for this workspace by the composition root. */
  dns: DnsChangeToolDeps;
}

type Operation = (required: Record<string, never>, ports: ReturnType<typeof mailDnsPorts>) => Promise<MailDnsStatus>;

/** One authorized call of `operation`, with the mail-status route's 404/403/500 shapes. */
function handler(deps: AdminMailDnsDeps, permission: string, operation: Operation) {
  return async (req: Request, res: Response): Promise<void> => {
    if (req.params.workspaceId !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      const auth = await deps.dns.authorize({ principalId: principal.id, permission, workspaceId: deps.workspaceId, entityType: "domain-dns" });
      if (!auth.allowed) {
        res.status(403).json({ error: `principal '${principal.id}' is not authorized for '${permission}' (${auth.reason})`, code: "FORBIDDEN", details: { permission, reason: auth.reason } });
        return;
      }
      res.status(200).json(await operation({}, mailDnsPorts(deps.dns)));
    } catch (err) {
      console.error("[system/mail-dns] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  };
}

/**
 * Register the two mail DNS routes.
 * @complexity O(1) registration; each request is one operation run.
 * @example registerAdminMailDnsRoutes(app, { workspaceId, dns })
 */
export function registerAdminMailDnsRoutes(app: Express, deps: AdminMailDnsDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/system/mail-dns", handler(deps, "deployments.read", readMailDnsStatus));
  app.post("/api/admin/v1/workspaces/:workspaceId/system/mail-dns/verify", handler(deps, "deployments.publish", verifyMailDnsStatus));
}
