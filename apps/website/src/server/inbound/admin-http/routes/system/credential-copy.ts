import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import type { Express, Request, Response } from "express";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "../../dev-auth.js";
import { authorizeOrRespond } from "../../authorize-guard.js";
import { isLocalAdminRequest } from "../../local-admin-request.js";
import { ToolInputError } from "@jini-ai/core";
import type { RouteDeps } from "#src/server/routes/types";

type Deps = Pick<RouteDeps, "workspaceId" | "ownerPrincipalId" | "authorize" | "gatedMutations" | "projectKeys">;
const BASE = "/api/admin/v1/workspaces/:workspaceId/system/credential-copy";

async function authorizedCopy({ res, deps, actorId, permission = "system.write" }: { res: Response; deps: Deps; actorId: string; permission?: string }, _options = {}): Promise<boolean> {
  if (!await authorizeOrRespond(res, deps.authorize, { principalId: actorId, permission, workspaceId: deps.workspaceId })) return false;
  const instance = deps.gatedMutations.gatewayDeps.authorizeInstance;
  if (instance && !(await instance({ principalId: actorId, permission })).allowed) {
    res.status(403).json({ reasonCode: "owner-only" }); return false;
  }
  return true;
}

/** Every verb requires the seeded owner's session, existing RBAC and optional instance admission. */
async function admitted({ req, res, deps }: { req: Request; res: Response; deps: Deps }, _options = {}): Promise<boolean> {
  res.setHeader("Cache-Control", "no-store");
  if (!rejectUnlessSessionCredential(res, { message: "Use the owner's session to use saved keys.", permission: "system.write" })) return false;
  if (req.params.workspaceId !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return false; }
  const actorId = getAuthedPrincipal(res).id;
  if (actorId !== await deps.ownerPrincipalId) { res.status(403).json({ reasonCode: "owner-only" }); return false; }
  if (!await authorizedCopy({ res, deps, actorId })) return false;
  if (!deps.projectKeys || !isLocalAdminRequest({ req })) {
    res.status(403).json({ reasonCode: "local-host-only" }); return false;
  }
  return true;
}

function validCopyIds({ ids }: { ids: unknown }, _options = {}): boolean {
  return Array.isArray(ids) && ids.length >= 1 && ids.length <= 100 &&
    ids.every((id: unknown) => typeof id === "string" && id.length > 0 && id.length <= 512 && !/[\x00-\x1f\x7f]/.test(id));
}

/** Owner-only browser picker; one approval submits one reference to this server-bound site. */
export function registerAdminCredentialCopyRoutes({ app, deps }: { app: Express; deps: Deps }, _options = {}): void {
  const handle = (action: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    try {
      if (await admitted({ req, res, deps })) await action(req, res);
    } catch (error) {
      // Never serialize raw driver/crypto exceptions; logs receive only the shared redacted diagnostic.
      if (error instanceof ToolInputError) res.status(409).json({ reasonCode: "saved-key-refused", message: error.message });
      else sendAdminFailure({ res, error }, { operation: "routes/system/credential-copy", code: "INTERNAL_ERROR", field: "message", message: "Using the saved key failed. Reopen Shared Keys and choose the key again.", details: { reasonCode: "copy-failed" } });
    }
  };
  app.get(BASE, handle(async (_req, res) => {
    const rows = await deps.projectKeys!.list({});
    res.json({ sources: [{ siteId: "shared-keys", name: "Shared Keys", keys: rows.map(row => ({
      kind: row.kind, id: row.keyId, label: row.name, provider: null, worksFor: [],
    })) }] });
  }));
  app.post(BASE, handle(async (req, res) => {
    const body = req.body;
    const isObject = body && typeof body === "object" && !Array.isArray(body);
    const validKeys = isObject && !Object.keys(body).some(key => !["sourceSiteId", "ids", "overwrite"].includes(key));
    const validSource = validKeys && body.sourceSiteId === "shared-keys";
    if (!validSource || !validCopyIds({ ids: body.ids }) || body.ids.length !== 1 || body.overwrite !== false) {
      res.status(400).json({ reasonCode: "invalid-request" }); return;
    }
    const keyId = body.ids[0] as string;
    const permission = await deps.projectKeys!.permissionFor({ keyId });
    if (!await authorizedCopy({ res, deps, actorId: getAuthedPrincipal(res).id, permission })) return;
    await deps.projectKeys!.use({ keyId, use: true });
    res.json({ results: [{ kind: "reference", id: keyId, status: "granted" }] });
  }));
}
