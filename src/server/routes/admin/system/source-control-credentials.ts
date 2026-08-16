import type { Express, Request, Response } from "express";

import {
  createSourceControlCredential,
  deleteSourceControlCredential,
  listSourceControlCredentials,
  SourceControlCredentialDuplicateLabelError,
  SourceControlCredentialNotFoundError,
  SourceControlCredentialSecretStoreUnconfiguredError,
  SourceControlCredentialValidationError,
  updateSourceControlCredential,
  type SourceControlCredentialSummary,
} from "#src/features/source-control/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Source Control page's credential CRUD backend.
 *
 * Registers `GET`/`POST` on the collection and `PUT`/`DELETE` on a single credential set, all under
 * `/api/admin/v1/workspaces/:workspaceId/system/source-control/credentials`. Deliberately a THIN
 * HTTP adapter over `features/source-control/store.ts` — every validation, uniqueness, and
 * default-slot rule already lives there; this route's only job is: check auth, shape the request
 * into `store.ts`'s input types, map its thrown errors to HTTP status codes, and return
 * `SourceControlCredentialSummary` — never the sealed connection, never a token, never a username.
 *
 * `source-control.credentials.write`-gated on every verb, NOT `system.publish` — the permission
 * `publish-credentials.ts` uses for its own structurally-identical route. Reusing `system.publish`
 * here would be wrong semantics: this page connects a source-control IDENTITY (GitHub/GitLab/
 * Bitbucket), which is not a publish target and never triggers a publish (see
 * `apps/admin/src/features/source-control/SourceControl.tsx`'s own header for that scope
 * boundary — GitLab/Bitbucket aren't deploy targets at all, and this is scoped to connecting an
 * identity only, no commit history, sync, or versioning). A saved connection's existence and label
 * are themselves operationally sensitive (which external accounts this workspace can reach with a
 * write-scoped credential) — the same "gate the read same as the write" reasoning
 * `publish-credentials.ts`'s own header gives for its single-permission-on-every-verb shape, which
 * this route mirrors with its own dedicated permission string instead. Matches the established
 * per-feature permission convention `deployments.read`/`deployments.credentials.write` and
 * `analytics.read`/`backup.read`/`comments.read` already set (`routes/admin/deployments/list.ts`'s
 * own header traces the precedent): a NEW dot-namespaced permission, not a reused one, and the
 * seeded owner's wildcard grant authorizes it immediately with no seed edit required.
 */
export type AdminSourceControlCredentialsDeps = RouteDeps;

const PERMISSION = "source-control.credentials.write";
const ENTITY_TYPE = "source-control";

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/source-control/credentials";

/** Every 4xx this route can produce, shaped once so each handler below stays a thin dispatch.
 *  Mirrors `publish-credentials.ts`'s own `sendStoreError`. */
function sendStoreError(res: Response, err: unknown): void {
  if (err instanceof SourceControlCredentialValidationError) {
    res.status(400).json({ error: "VALIDATION", detail: err.message });
    return;
  }
  if (err instanceof SourceControlCredentialDuplicateLabelError) {
    res.status(409).json({ error: "DUPLICATE_LABEL", detail: err.message });
    return;
  }
  if (err instanceof SourceControlCredentialNotFoundError) {
    res.status(404).json({ error: "NOT_FOUND", detail: err.message });
    return;
  }
  if (err instanceof SourceControlCredentialSecretStoreUnconfiguredError) {
    res.status(503).json({ error: "SECRET_STORE_UNCONFIGURED", detail: err.message });
    return;
  }
  throw err;
}

export function registerAdminSourceControlCredentialsRoutes(app: Express, deps: AdminSourceControlCredentialsDeps): void {
  const readDeps = { repo: deps.sourceControlCredentialSetRepo };
  const writeDeps = {
    repo: deps.sourceControlCredentialSetRepo,
    sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
  };

  /** Shared workspace-path-param + `source-control.credentials.write` authorization check every
   *  verb below performs first — mirrors `publish-credentials.ts`'s own
   *  `rejectUnlessAuthorized`. Returns `true` and has already written the response iff the caller
   *  should stop. */
  async function rejectUnlessAuthorized(req: Request, res: Response): Promise<boolean> {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return true;
    }
    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: PERMISSION,
      workspaceId: deps.workspaceId,
      entityType: ENTITY_TYPE,
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for '${PERMISSION}' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: PERMISSION, reason: authResult.reason },
      });
      return true;
    }
    return false;
  }

  app.get(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    const credentials: SourceControlCredentialSummary[] = await listSourceControlCredentials(readDeps, { workspaceId: deps.workspaceId });
    res.status(200).json({ credentials });
  });

  app.post(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const credential = await createSourceControlCredential(writeDeps, {
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
      const credential = await updateSourceControlCredential(writeDeps, {
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
    // Idempotent — `deleteSourceControlCredential`/`SourceControlCredentialSetRepoPort.delete` are
    // both no-ops (not errors) for a missing row, matching this route's own documented 204-always
    // contract.
    await deleteSourceControlCredential(readDeps, { workspaceId: deps.workspaceId, id: req.params.id });
    res.status(204).end();
  });
}
