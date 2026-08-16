import type { Express, Request, Response } from "express";

import {
  createPublishCredential,
  deletePublishCredential,
  describeCredential,
  listPublishCredentials,
  PublishCredentialDuplicateLabelError,
  PublishCredentialNotFoundError,
  PublishCredentialSecretStoreUnconfiguredError,
  PublishCredentialValidationError,
  updatePublishCredential,
  type PublishCredentialSummary,
} from "#src/features/deployments/publish-credentials/index";
import { verifyPublishCredentialById, type PublishCredentialVerificationResult } from "#src/features/deployments/static-publish/index";
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
 *
 * 2026-08-16 — this is now the ONE place `verifyPublishCredential` (`static-publish/verify.ts`) is
 * ever called from a human action, per that module's own "never agent-facing" contract: `POST`/`PUT`
 * verify the just-saved connection best-effort (awaited, included in the response — the "did what I
 * just typed work" moment) without gating the save itself on the outcome (a rejected credential can
 * still be saved and fixed later — this route only reports what it found, it does not decide the
 * save is invalid because the provider disagrees), and a new `POST .../:id/verify` lets a human
 * re-check a stale or never-verified result without re-saving. Both write ONLY the cached,
 * non-secret `{ok, message, checkedAt}` result — never anything that could leak a credential value.
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
  /** Verifies ONE specific row (the one this route just touched) against its real provider, best-
   *  effort — never throws (see `verifyPublishCredentialById`'s own "never throws" contract,
   *  inherited from every per-provider checker), so a transient verification failure can never turn
   *  a successful save into a 500. Returns `null` only if the row vanished between the write this
   *  handler just performed and this call — treated the same as "nothing to report" by every caller
   *  below, never surfaced as an error for what was otherwise a successful save. */
  async function verifyAfterSave(id: string): Promise<PublishCredentialVerificationResult | undefined> {
    const result = await verifyPublishCredentialById(
      { repo: deps.publishCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, cache: deps.publishCredentialVerificationCache, clock: deps.clock },
      { workspaceId: deps.workspaceId, id }
    );
    return result ?? undefined;
  }

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
      // Only when `connection` was actually supplied — matches `updatePublishCredential`'s own
      // "connection omitted => nothing changed to verify" reasoning below. `createPublishCredential`
      // always requires a connection, so this is always true here; kept as an explicit check (rather
      // than an unconditional call) so both handlers read the same way.
      const verification = body.connection !== undefined ? await verifyAfterSave(credential.id) : undefined;
      res.status(201).json({ credential, ...(verification ? { verification } : {}) });
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
      // A label-only/isDefault-only rename verifies nothing new — the connection (and therefore
      // whatever a previous verification already found) is unchanged, so re-checking here would
      // just repeat the same network call for no new information.
      const verification = body.connection !== undefined ? await verifyAfterSave(credential.id) : undefined;
      res.status(200).json({ credential, ...(verification ? { verification } : {}) });
    } catch (err) {
      sendStoreError(res, err);
    }
  });

  app.post(`${BASE_PATH}/:id/verify`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    const existing = await describeCredential(readDeps, { workspaceId: deps.workspaceId, id: req.params.id });
    if (!existing) {
      res.status(404).json({ error: "NOT_FOUND", detail: `no publish credential '${req.params.id}' in this workspace` });
      return;
    }
    const verification = await verifyAfterSave(existing.id);
    res.status(200).json({ verification });
  });

  app.delete(`${BASE_PATH}/:id`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    // Idempotent — `deletePublishCredential`/`PublishCredentialSetRepoPort.delete` are both no-ops
    // (not errors) for a missing row, matching this route's own documented 204-always contract.
    await deletePublishCredential(readDeps, { workspaceId: deps.workspaceId, id: req.params.id });
    res.status(204).end();
  });
}
