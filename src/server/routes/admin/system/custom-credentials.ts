import type { Express, Request, Response } from "express";

import {
  createCustomCredential,
  CustomCredentialDuplicateLabelError,
  CustomCredentialNotFoundError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
  deleteCustomCredential,
  listCustomCredentials,
  updateCustomCredential,
  type CustomCredentialSummary,
} from "#src/features/custom-credentials/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Access Tokens page's "Add custom provider" CRUD backend.
 *
 * Registers `GET`/`POST` on the collection and `PUT`/`DELETE` on a single credential set, all under
 * `/api/admin/v1/workspaces/:workspaceId/system/custom/credentials`. Deliberately a THIN HTTP
 * adapter over `features/custom-credentials/store.ts` — every validation, uniqueness, and shape
 * rule already lives there; this route's only job is: check auth, shape the request into
 * `store.ts`'s input types, map its thrown errors to HTTP status codes, and return
 * `CustomCredentialSummary` — never the sealed connection, never a token, never a username.
 * Structurally mirrors `source-control-credentials.ts` byte-for-byte.
 *
 * `custom-credentials.write`-gated on every verb, a NEW dot-namespaced permission (not reused from
 * either sibling feature) — matches the established per-feature permission convention
 * `source-control-credentials.ts`'s own header traces; the seeded owner's wildcard grant authorizes
 * it immediately with no seed edit required.
 */
export type AdminCustomCredentialsDeps = RouteDeps;

const PERMISSION = "custom-credentials.write";
const ENTITY_TYPE = "custom-credentials";

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/custom/credentials";

/** Every error this route can produce, shaped once so each handler below stays a thin dispatch —
 *  mirrors `source-control-credentials.ts`'s own `sendStoreError`. */
function sendStoreError(res: Response, err: unknown): void {
  if (err instanceof CustomCredentialValidationError) {
    res.status(400).json({ error: "VALIDATION", detail: err.message });
    return;
  }
  if (err instanceof CustomCredentialDuplicateLabelError) {
    res.status(409).json({ error: "DUPLICATE_LABEL", detail: err.message });
    return;
  }
  if (err instanceof CustomCredentialNotFoundError) {
    res.status(404).json({ error: "NOT_FOUND", detail: err.message });
    return;
  }
  if (err instanceof CustomCredentialSecretStoreUnconfiguredError) {
    res.status(503).json({ error: "SECRET_STORE_UNCONFIGURED", detail: err.message });
    return;
  }
  console.error("[custom-credentials] unexpected error", err);
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

export function registerAdminCustomCredentialsRoutes(app: Express, deps: AdminCustomCredentialsDeps): void {
  const readDeps = { repo: deps.customCredentialSetRepo };
  const writeDeps = {
    repo: deps.customCredentialSetRepo,
    sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
  };

  /** Shared workspace-path-param + `custom-credentials.write` authorization check every verb below
   *  performs first — mirrors `source-control-credentials.ts`'s own `rejectUnlessAuthorized`.
   *  Returns `true` and has already written the response iff the caller should stop. */
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
    try {
      const credentials: CustomCredentialSummary[] = await listCustomCredentials(readDeps, { workspaceId: deps.workspaceId });
      res.status(200).json({ credentials });
    } catch (err) {
      sendStoreError(res, err);
    }
  });

  app.post(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const credential = await createCustomCredential(writeDeps, {
        workspaceId: deps.workspaceId,
        label: body.label,
        category: body.category,
        baseUrl: body.baseUrl,
        connection: body.connection,
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
      const credential = await updateCustomCredential(writeDeps, {
        workspaceId: deps.workspaceId,
        id: req.params.id,
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl } : {}),
        ...(body.connection !== undefined ? { connection: body.connection } : {}),
      });
      res.status(200).json({ credential });
    } catch (err) {
      sendStoreError(res, err);
    }
  });

  app.delete(`${BASE_PATH}/:id`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    try {
      // Idempotent — `deleteCustomCredential`/`CustomCredentialSetRepoPort.delete` are both no-ops
      // (not errors) for a missing row, matching this route's own documented 204-always contract.
      await deleteCustomCredential(readDeps, { workspaceId: deps.workspaceId, id: req.params.id });
      res.status(204).end();
    } catch (err) {
      sendStoreError(res, err);
    }
  });
}
