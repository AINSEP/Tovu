import type { Express, Request, Response } from "express";

import {
  createVendorCredential,
  deleteVendorCredential,
  listVendorCredentials,
  updateVendorCredential,
  VendorCredentialDuplicateLabelError,
  VendorCredentialNotFoundError,
  VendorCredentialSecretStoreUnconfiguredError,
  VendorCredentialValidationError,
  type VendorCredentialSetSummary,
} from "#src/features/vendor-credentials/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin credential CRUD for the unified `vendor_credential_sets` table (Phase 3) — the
 * eventual replacement for BOTH `server/routes/admin/system/publish-credentials.ts` and
 * `server/routes/admin/system/source-control-credentials.ts` once every install's data is confirmed
 * migrated (`development/scripts/backfill-vendor-credentials.ts`). Registers `GET`/`POST` on the
 * collection and `PUT`/`DELETE` on a single credential set, all under
 * `/api/admin/v1/workspaces/:workspaceId/system/vendor-credentials` — deliberately not
 * `.../vendor-credentials/credentials`: unlike its two predecessors (whose domain segment,
 * `publish`/`source-control`, names a BROADER feature area that credentials are one part of), this
 * table's whole reason to exist IS the credential — there is no separate "vendor-credentials" screen
 * a `/credentials` suffix would need to disambiguate from.
 *
 * A THIN HTTP adapter over `vendor-credentials/store.ts`, mirroring `publish-credentials.ts`'s own
 * "route only checks auth, shapes the request, maps thrown errors to status codes" discipline — see
 * that file's own header for the fuller version of this reasoning, which applies here unchanged.
 * `VendorCredentialSetSummary`'s own shape is what makes "never leaks the sealed connection or a
 * full token" a construction guarantee rather than a discipline this route has to uphold by hand:
 * `tokenTail` is the ONLY secret-adjacent field it carries, by the owner's own explicit design
 * decision (`types.ts`'s `VendorCredentialSetRecord.tokenTail` doc) — 4 characters of a long token,
 * not the token itself.
 *
 * No `POST .../:id/verify` here, unlike `publish-credentials.ts` — this table backs BOTH publish
 * destinations and source-control identities, and no reviewed, provider-agnostic "verify this
 * connection actually authenticates" mechanism exists yet across all seven vendors (`store.ts`'s own
 * `probeAccountLabel` is a best-effort, github-only, SAVE-TIME probe, not a callable re-verify).
 * Building one is real, separate work belonging to whichever pass wires `static-publish/verify.ts`'s
 * provider probes (or new ones for gitlab/bitbucket/s3-compatible) against THIS table — out of scope
 * here, and not silently approximated by reusing the old routes' `verifyAfterSave`, which is typed
 * against `PublishConnectionInput`/`SourceControlConnectionInput`, not `VendorConnectionInput`.
 *
 * `vendor-credentials.write`-gated on every verb — deliberately its OWN permission string, not a
 * reuse of `system.publish` (`publish-credentials.ts`) or `source-control.credentials.write`
 * (`source-control-credentials.ts`): this table's rows can be either kind of credential depending on
 * `vendorId`, so gating it behind either predecessor's permission would either over- or
 * under-authorize a principal relative to what they can actually do today. Same free-form-string
 * `AuthorizeFn` contract both predecessors already rely on (`core/commands/command.ts`) — no central
 * permission registry to update.
 *
 * `deps.vendorCredentialSetRepo` (`RouteDeps`, `server/routes/types.ts`) is backed by the real
 * `SqliteVendorCredentialSetRepo` in `server/deps.ts` and by `InMemoryVendorCredentialSetRepo` in
 * `server/app.ts`'s hermetic composition — same rule-of-two every other repo on `RouteDeps` follows.
 * (2026-08-16: this route was written and reviewed one commit ahead of that composition-root wiring,
 * against a local `RouteDeps & {vendorCredentialSetRepo}` intersection type, so it could be proven
 * correct in isolation without touching the shared `server/deps.ts`/`server/routes/types.ts` files
 * while another pass was actively editing them. That intersection has since collapsed to plain
 * `RouteDeps` below, now that the field is real — the temporary shape did not outlive the reason for
 * it.)
 */
export type AdminVendorCredentialsDeps = RouteDeps;

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/vendor-credentials";
const PERMISSION = "vendor-credentials.write";
const ENTITY_TYPE = "vendor-credential";

/** Every error this route can produce, shaped once so each handler below stays a thin dispatch —
 *  same four-typed-error-plus-fallback shape `publish-credentials.ts`'s own `sendStoreError`
 *  documents (including that file's own found-live lesson: every branch below MUST be reached
 *  through a `try`/`catch`, never relied upon by a caller that assumes a "never throws" contract no
 *  function here actually makes). */
function sendStoreError(res: Response, err: unknown): void {
  if (err instanceof VendorCredentialValidationError) {
    res.status(400).json({ error: "VALIDATION", detail: err.message });
    return;
  }
  if (err instanceof VendorCredentialDuplicateLabelError) {
    res.status(409).json({ error: "DUPLICATE_LABEL", detail: err.message });
    return;
  }
  if (err instanceof VendorCredentialNotFoundError) {
    res.status(404).json({ error: "NOT_FOUND", detail: err.message });
    return;
  }
  if (err instanceof VendorCredentialSecretStoreUnconfiguredError) {
    res.status(503).json({ error: "SECRET_STORE_UNCONFIGURED", detail: err.message });
    return;
  }
  console.error("[vendor-credentials] unexpected error", err);
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

export function registerAdminVendorCredentialsRoutes(app: Express, deps: AdminVendorCredentialsDeps): void {
  const readDeps = { repo: deps.vendorCredentialSetRepo };
  const writeDeps = {
    repo: deps.vendorCredentialSetRepo,
    sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
  };

  /** Shared workspace-path-param + `vendor-credentials.write` authorization check every verb below
   *  performs first — same two-step shape `publish-credentials.ts`/`source-control-credentials.ts`
   *  each repeat per-route. Returns `true` and has already written the response iff the caller
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
    try {
      const credentials: VendorCredentialSetSummary[] = await listVendorCredentials(readDeps, { workspaceId: deps.workspaceId });
      res.status(200).json({ credentials });
    } catch (err) {
      sendStoreError(res, err);
    }
  });

  app.post(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const credential = await createVendorCredential(writeDeps, {
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
      const credential = await updateVendorCredential(writeDeps, {
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
    try {
      // Idempotent — `deleteVendorCredential`/`VendorCredentialSetRepoPort.delete` are both no-ops
      // (not errors) for a missing row, matching `publish-credentials.ts`'s own documented
      // 204-always contract for the identical case.
      await deleteVendorCredential(readDeps, { workspaceId: deps.workspaceId, id: req.params.id });
      res.status(204).end();
    } catch (err) {
      sendStoreError(res, err);
    }
  });
}
