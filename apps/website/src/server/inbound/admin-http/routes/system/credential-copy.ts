import type { Express, Request, Response } from "express";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "../../dev-auth.js";
import { authorizeOrRespond } from "../../authorize-guard.js";
import { isLocalAdminRequest } from "../../local-admin-request.js";
import { LocalCredentialCopyError } from "#src/server/runtime/composition/local-credential-copy";
import type { RouteDeps } from "#src/server/routes/types";

type Deps = Pick<RouteDeps, "workspaceId" | "ownerPrincipalId" | "authorize" | "gatedMutations" | "localCredentialCopy">;
const BASE = "/api/admin/v1/workspaces/:workspaceId/system/credential-copy";

async function authorizedCopy({ res, deps, actorId }: { res: Response; deps: Deps; actorId: string }, _options = {}): Promise<boolean> {
  if (!await authorizeOrRespond(res, deps.authorize, { principalId: actorId, permission: "system.write", workspaceId: deps.workspaceId })) return false;
  const instance = deps.gatedMutations.gatewayDeps.authorizeInstance;
  if (instance && !(await instance({ principalId: actorId, permission: "system.write" })).allowed) {
    res.status(403).json({ reasonCode: "owner-only" }); return false;
  }
  return true;
}

/** Every verb requires the seeded owner's session, existing RBAC and optional instance admission. */
async function admitted({ req, res, deps }: { req: Request; res: Response; deps: Deps }, _options = {}): Promise<boolean> {
  res.setHeader("Cache-Control", "no-store");
  if (!rejectUnlessSessionCredential(res, { message: "Use the owner's session to copy keys.", permission: "system.write" })) return false;
  if (req.params.workspaceId !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return false; }
  const actorId = getAuthedPrincipal(res).id;
  if (actorId !== await deps.ownerPrincipalId) { res.status(403).json({ reasonCode: "owner-only" }); return false; }
  if (!await authorizedCopy({ res, deps, actorId })) return false;
  if (!deps.localCredentialCopy?.localHost || !isLocalAdminRequest({ req })) {
    res.status(403).json({ reasonCode: "local-host-only" }); return false;
  }
  return true;
}

function validCopyIds({ ids }: { ids: unknown }, _options = {}): boolean {
  return Array.isArray(ids) && ids.length >= 1 && ids.length <= 100 &&
    ids.every((id: unknown) => typeof id === "string" && id.length > 0 && id.length <= 512 && !/[\x00-\x1f\x7f]/.test(id));
}

/** One endpoint shared by both UIs; source discovery and vault transfer remain injected operations. */
export function registerAdminCredentialCopyRoutes({ app, deps }: { app: Express; deps: Deps }, _options = {}): void {
  const handle = (action: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    try {
      if (await admitted({ req, res, deps })) await action(req, res);
    } catch (error) {
      // Never serialize a driver/crypto exception or include it in a diagnostic log.
      if (error instanceof LocalCredentialCopyError) res.status(409).json({ reasonCode: error.reasonCode, message: error.message });
      else res.status(500).json({ reasonCode: "copy-failed", message: "Copying keys failed. Try again." });
    }
  };
  app.get(BASE, handle(async (_req, res) => {
    res.json({ sources: await deps.localCredentialCopy!.list({}) });
  }));
  app.post(BASE, handle(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => !["sourceSiteId", "ids", "overwrite"].includes(key)) ||
      typeof body.sourceSiteId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.sourceSiteId) ||
      !validCopyIds({ ids: body.ids }) ||
      typeof body.overwrite !== "boolean") {
      res.status(400).json({ reasonCode: "invalid-request" }); return;
    }
    res.json({ results: await deps.localCredentialCopy!.copy({ sourceSiteId: body.sourceSiteId,
      ids: body.ids, overwrite: body.overwrite, actorId: getAuthedPrincipal(res).id }) });
  }));
}
