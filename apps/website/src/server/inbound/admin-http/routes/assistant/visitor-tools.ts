/** Admin page transport for the same visitor-tools service that assistant chat uses. */
import type { Express, Request, Response } from "express";
import { ForbiddenError, ValueValidationFailedError } from "@jini-ai/core/settings";
import { VisitorToolPolicyValidationError } from "#src/contracts/site-assistant/visitor-tools";
import type { VisitorToolsManagementPort } from "#src/contracts/site-assistant/visitor-tools-management";
import { VisitorToolsRevisionConflictError } from "#src/features/settings/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

export interface VisitorToolsRouteDeps { workspaceId: string; visitorToolsManagement?: VisitorToolsManagementPort }
export const ADMIN_VISITOR_TOOLS_PATH = "/api/admin/v1/workspaces/:workspaceId/assistant/visitor-tools";

/** Map typed service errors without leaking settings/provider failures. @complexity O(1). */
function respondError({ error, res }: { error: unknown; res: Response }, _options = {}): void {
  if (error instanceof VisitorToolsRevisionConflictError) {
    res.status(409).json({ error: error.message, code: "VISITOR_TOOLS_REVISION_CONFLICT", reload: true });
    return;
  }
  if (error instanceof ForbiddenError) {
    res.status(403).json({ error: "visitor-tools.manage is required", code: "FORBIDDEN" });
    return;
  }
  if (error instanceof VisitorToolPolicyValidationError || error instanceof ValueValidationFailedError) {
    res.status(400).json({ error: error.message, code: "VISITOR_TOOLS_VALIDATION_ERROR" });
    return;
  }
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

/** Single workspace/session boundary; auth and fresh revision checks remain service-owned. */
async function handle({ req, res, deps, operation }: {
  req: Request; res: Response; deps: VisitorToolsRouteDeps; operation: "list" | "configure";
}, _options = {}): Promise<void> {
  if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
    res.status(404).json({ error: "workspace was not found" });
    return;
  }
  try {
    const service = deps.visitorToolsManagement;
    if (!service) throw new Error("Visitor tools service unavailable.");
    const callerPrincipalId = getAuthedPrincipal(res).id;
    if (operation === "list") {
      res.json({ data: await service.list({ callerPrincipalId }) });
      return;
    }
    const prepared = await service.prepare({ callerPrincipalId, input: req.body });
    res.json({ data: await service.apply({ callerPrincipalId, prepared }) });
  } catch (error) { respondError({ error, res }); }
}

/** GET/PUT require visitor-tools.manage through the service; the enclosing admin module requires a session.
 * PUT body is {toolId, expectedRevisionSeq, mode?, limits?}; both return {data: VisitorToolsView}.
 * @complexity O(1) transport work plus bounded service I/O.
 * @example registerAdminVisitorToolsRoutes({app, deps});
 */
export function registerAdminVisitorToolsRoutes({ app, deps }: { app: Express; deps: VisitorToolsRouteDeps }, _options = {}): void {
  app.get(ADMIN_VISITOR_TOOLS_PATH, (req, res) => handle({ req, res, deps, operation: "list" }));
  app.put(ADMIN_VISITOR_TOOLS_PATH, (req, res) => handle({ req, res, deps, operation: "configure" }));
}
