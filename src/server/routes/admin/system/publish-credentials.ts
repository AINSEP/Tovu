import type { Express, Request, Response } from "express";

import {
  createPublishCredential,
  deletePublishCredential,
  listPublishCredentials,
  PublishCredentialDuplicateLabelError,
  PublishCredentialNotFoundError,
  PublishCredentialSecretStoreUnconfiguredError,
  PublishCredentialValidationError,
  updatePublishCredential,
  type PublishCredentialSummary,
} from "#src/features/deployments/publish-credentials/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Deployment panel → Static Site tab's credential CRUD backend.
 *
 * Registers `GET`/`POST` on the collection and `PUT`/`DELETE` on a single credential set, all under
 * `/api/admin/v1/workspaces/:workspaceId/system/publish/credentials`. This is deliberately a THIN
 * HTTP adapter over `publish-credentials/store.ts` — every validation, uniqueness, and default-slot
 * rule already lives there (see that file's own header); this route's only job is: check auth, shape
 * the request into `store.ts`'s input types, map its thrown errors to HTTP status codes, and return
 * `PublishCredentialSummary` — never the sealed connection, never a token, never `accountId`. That
 * "read model never carries a secret field" guarantee is enforced by `PublishCredentialSummary`'s own
 * shape (`types.ts`), not by anything this route does — there is no field here that COULD leak one.
 *
 * `system.publish`-gated on every verb, matching `publish-site.ts`'s reasoning for its own trigger/
 * status routes: a saved connection's `label`/`providerId`/`isDefault` is itself operationally
 * sensitive (which external accounts this workspace can publish to), so this gets the same
 * single-permission gate as the fact of a live publish, not the softer `system.read` the state-less
 * `/publish/preview` route uses.
 */
export type AdminPublishCredentialsDeps = RouteDeps;

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/publish/credentials";

/** Every 4xx this route can produce, shaped once so each handler below stays a thin dispatch. Mirrors
 *  `publish-site.ts`'s inline `{error}`/`{error, code, details}` shapes for the same permission
 *  failure; the four store-error branches are new to this route and have no precedent to match. */
function sendStoreError(res: Response, err: unknown): void {
  if (err instanceof PublishCredentialValidationError) {
    res.status(400).json({ error: "VALIDATION", detail: err.message });
    return;
  }
  if (err instanceof PublishCredentialDuplicateLabelError) {
    res.status(409).json({ error: "DUPLICATE_LABEL", detail: err.message });
    return;
  }
  if (err instanceof PublishCredentialNotFoundError) {
    res.status(404).json({ error: "NOT_FOUND", detail: err.message });
    return;
  }
  if (err instanceof PublishCredentialSecretStoreUnconfiguredError) {
    res.status(503).json({ error: "SECRET_STORE_UNCONFIGURED", detail: err.message });
    return;
  }
  throw err;
}

export function registerAdminPublishCredentialsRoutes(app: Express, deps: AdminPublishCredentialsDeps): void {
  const readDeps = { repo: deps.publishCredentialSetRepo };
  const writeDeps = {
    repo: deps.publishCredentialSetRepo,
    sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
  };

  /** Shared workspace-path-param + `system.publish` authorization check every verb below performs
   *  first — same two-step `publish-site.ts` already repeats per-route; extracted here since this
   *  file has four verbs instead of that file's two. Returns `true` and has already written the
   *  response iff the caller should stop. */
  async function rejectUnlessAuthorized(req: Request, res: Response): Promise<boolean> {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return true;
    }
    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "system.publish",
      workspaceId: deps.workspaceId,
      entityType: "site-publish",
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'system.publish' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "system.publish", reason: authResult.reason },
      });
      return true;
    }
    return false;
  }

  app.get(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    const credentials: PublishCredentialSummary[] = await listPublishCredentials(readDeps, { workspaceId: deps.workspaceId });
    res.status(200).json({ credentials, executionMode: deps.publishExecutionMode });
  });

  app.post(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const credential = await createPublishCredential(writeDeps, {
        workspaceId: deps.workspaceId,
        label: body.label,
        connection: body.connection,
        isDefault: body.isDefault,
      });
      res.status(201).json({ credential });
    } catch (err) {
      sendStoreError(res, err);
    }
  });

  app.put(`${BASE_PATH}/:id`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const credential = await updatePublishCredential(writeDeps, {
        workspaceId: deps.workspaceId,
        id: req.params.id,
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.connection !== undefined ? { connection: body.connection } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      });
      res.status(200).json({ credential });
    } catch (err) {
      sendStoreError(res, err);
    }
  });

  app.delete(`${BASE_PATH}/:id`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    // Idempotent — `deletePublishCredential`/`PublishCredentialSetRepoPort.delete` are both no-ops
    // (not errors) for a missing row, matching this route's own documented 204-always contract.
    await deletePublishCredential(readDeps, { workspaceId: deps.workspaceId, id: req.params.id });
    res.status(204).end();
  });
}
