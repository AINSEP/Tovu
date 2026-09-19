import type { Express, Response } from "express";

import {
  authorizeForHooks,
  confirm,
  execute,
  ForbiddenError,
  plan,
  PlanStaleError,
  type GatedMutationHooks,
} from "#src/contracts/core/gated-mutations/gateway";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "#src/contracts/core/gated-mutations/token";
import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import {
  buildPublishContentImportHooks,
  PublishContentApplyNotImplementedError,
  PublishContentBundleNotFoundError,
} from "#src/features/publish-content/gated-hooks";
import { executePublishContentImport, RestorePointUnavailableError } from "#src/features/publish-content/execute-import";
import { gatedPrincipalKindFor, getAuthedCredentialKind, getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { withPublishTrustAuthorize, withPublishTrustContentAuthorize } from "#src/server/inbound/admin-http/publish-trust-auth";
import { listPublishContentContributors } from "#src/features/publish-content/type-registry";
import { toPublishContentDeps, type PublishContentRouteRegistrar } from "./deps.js";

/**
 * @file Task 7 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.5/§4 task 7.
 *
 * `POST /api/admin/v1/workspaces/:workspaceId/publish-content/import/{plan,confirm,execute}` —
 * the gated import ceremony over a bundle already staged by Task 6's
 * `POST .../publish-content/bundles`. Mirrors `taxonomy/merge-term.ts`'s 3-endpoint-in-one-file
 * shape (the established precedent for a gated-mutation route triple in this codebase) and
 * `database/migrate-forward.ts`'s `costClass` pre-check at `/execute` — see `gated-hooks.ts`'s file
 * header for why that check lives here, wrapping `gatewayExecute()`, rather than inside
 * `hooks.executeMutation()` itself.
 *
 * `plan` and `execute` both take `{bundleId}` in the body — the SAME bundle must be named at both
 * steps, since `buildPublishContentImportHooks` closes over it fresh per request (mirrors
 * `merge-term.ts`'s `intoTermId` being required in both `plan` and `execute` bodies for the
 * identical reason: `computePlan()`/`executeMutation()` need to know what to recompute against).
 */
function statusFor(err: unknown): { status: number; code: string } {
  if (err instanceof ForbiddenError) return { status: 403, code: err.reasonCode };
  if (err instanceof PlanStaleError) return { status: 409, code: "PLAN_STALE" };
  if (err instanceof TokenExpiredError) return { status: 409, code: "TOKEN_EXPIRED" };
  if (err instanceof TokenAlreadyRedeemedError) return { status: 409, code: "TOKEN_ALREADY_REDEEMED" };
  if (err instanceof RestorePointUnavailableError) return { status: 409, code: "RESTORE_POINT_UNAVAILABLE" };
  if (err instanceof PublishContentBundleNotFoundError) return { status: 404, code: "BUNDLE_NOT_FOUND" };
  // Loud, specific, never a generic 500 — see `gated-hooks.ts`'s own doc for why this throws at all
  // (Task 8's apply loop is not wired yet).
  if (err instanceof PublishContentApplyNotImplementedError) return { status: 501, code: "APPLY_NOT_IMPLEMENTED" };
  return { status: 500, code: "INTERNAL_ERROR" };
}

export const registerPublishContentImportRoutes: PublishContentRouteRegistrar = (app: Express, deps) => {
  /** `permission -> entityType` for every registered type, so the publishing attenuation can answer
   *  a type's OWN write permission for exactly the types a grant names, and nothing else. Built per
   *  request from the bag the handlers will actually run against, the same way the export route and
   *  the planner already resolve contributors. */
  function registeredTypePermissions(publishContentDeps: ReturnType<typeof toPublishContentDeps>): ReadonlyMap<string, string> {
    const byPermission = new Map<string, string>();
    for (const contributor of listPublishContentContributors()) {
      byPermission.set(contributor.build(publishContentDeps).permission, contributor.entityType);
    }
    return byPermission;
  }

  function buildHooks(bundleId: string, actorId: string, res: Response) {
    const publishContentDeps = toPublishContentDeps(deps);
    return buildPublishContentImportHooks({
      workspaceId: deps.workspaceId,
      bundleId,
      actorId,
      clock: deps.clock,
      idGen: deps.idGen,
      // The apply loop authorizes each entity against its TYPE's own write permission. For a human
      // that is RBAC, unchanged. For a publishing credential it has to be the grant, or the
      // ceremony fails at execute — see `withPublishTrustContentAuthorize`'s own doc.
      publishContentDeps: withPublishTrustContentAuthorize(res, publishContentDeps, registeredTypePermissions(publishContentDeps)),
      bundleRepo: deps.publishContentBundleRepo,
      baselineRepo: deps.publishContentBaselineRepo,
      blobStore: deps.blobStore,
      dbOps: deps.dbOps,
      restorePointsRepo: deps.restorePointsRepo,
      applyPort: deps.publishContentApplyPort,
    });
  }

  app.post("/api/admin/v1/workspaces/:workspaceId/publish-content/import/plan", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      const bundleId = req.body?.bundleId;
      if (typeof bundleId !== "string") {
        res.status(400).json({ error: "'bundleId' (string) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const hooks = buildHooks(bundleId, principal.id, res);
      const result = await plan({
        deps: withPublishTrustAuthorize(res, deps.gatedMutations.gatewayDeps),
        principalId: principal.id,
        principalKind: gatedPrincipalKindFor(getAuthedCredentialKind(res)),
        hooks: hooks as unknown as GatedMutationHooks<unknown, unknown>,
      });

      res.json(result);
    } catch (err) {
      const { status, code } = statusFor(err);
      res.status(status).json({ error: err instanceof Error ? err.message : "internal error", code });
    }
  });

  app.post("/api/admin/v1/workspaces/:workspaceId/publish-content/import/confirm", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      const { planId, planHash } = req.body ?? {};
      if (typeof planId !== "string" || typeof planHash !== "string") {
        res.status(400).json({ error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const hooks = buildConfirmOnlyHooks({
        domain: "publish_content.import",
        readPermission: "publish_content.read",
        mutatePermission: "publish_content.apply",
        scopeId: deps.workspaceId,
      });

      const record = await confirm({
        deps: withPublishTrustAuthorize(res, deps.gatedMutations.gatewayDeps),
        principalId: principal.id,
        // Reports the credential that actually authenticated this request rather than the literal
        // `"user"` this used to pass for every caller: a session is a human, an api_key is a peer
        // push, and a `publish_key` is the zero-setup publishing handshake. No `agent`-kind
        // principal can reach this handler — nothing authenticates as an agent through the admin
        // HTTP gate — so the "agent cannot confirm" property is still proved directly against
        // `gateway.confirm()` in this feature's unit tests, not via HTTP (`gated-hooks.test.ts`).
        principalKind: gatedPrincipalKindFor(getAuthedCredentialKind(res)),
        hooks,
        planId,
        planHash,
      });

      res.json({ confirmationToken: record.confirmationToken });
    } catch (err) {
      const { status, code } = statusFor(err);
      res.status(status).json({ error: err instanceof Error ? err.message : "internal error", code });
    }
  });

  app.post("/api/admin/v1/workspaces/:workspaceId/publish-content/import/execute", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      const { bundleId, confirmationToken } = req.body ?? {};
      if (typeof bundleId !== "string" || typeof confirmationToken !== "string") {
        res.status(400).json({ error: "'bundleId' and 'confirmationToken' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      // Pre-check mirroring `database/migrate-forward.ts`'s AUD-001 fix: authorize BEFORE the
      // costClass refusal ever runs, so an authenticated-but-unauthorized caller cannot learn this
      // workspace's restore-point capability at all. `gateway.execute()`'s own fresh authorize()
      // (CIC U-001) remains the authoritative check and is unchanged by this.
      const preCheck = await authorizeForHooks(
        withPublishTrustAuthorize(res, deps.gatedMutations.gatewayDeps),
        buildConfirmOnlyHooks({
          domain: "publish_content.import",
          readPermission: "publish_content.read",
          mutatePermission: "publish_content.apply",
          scopeId: deps.workspaceId,
        }),
        { principalId: principal.id, permission: "publish_content.apply" }
      );
      if (!preCheck.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'publish_content.apply' (${preCheck.reason})`,
          code: "NOT_AUTHORIZED",
        });
        return;
      }

      const hooks = buildHooks(bundleId, principal.id, res);
      const capabilities = await deps.dbOps.getCapabilities();

      const result = await executePublishContentImport({
        workspaceId: deps.workspaceId,
        costClass: capabilities.restorePoint.costClass,
        gatewayExecute: () =>
          execute({
            deps: withPublishTrustAuthorize(res, deps.gatedMutations.gatewayDeps),
            principalId: principal.id,
            principalKind: gatedPrincipalKindFor(getAuthedCredentialKind(res)),
            hooks: hooks as unknown as GatedMutationHooks<unknown, { restorePointId: string; changeSetIds: readonly string[] }>,
            confirmationToken,
          }),
      });

      res.json(result);
    } catch (err) {
      const { status, code } = statusFor(err);
      res.status(status).json({ error: err instanceof Error ? err.message : "internal error", code });
    }
  });
};
