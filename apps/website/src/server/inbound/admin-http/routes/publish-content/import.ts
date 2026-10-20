import type { Express, Response } from "express";

import {
  authorizeForHooks,
  confirm,
  execute,
  plan,
  type GatedMutationHooks,
} from "#src/contracts/core/gated-mutations/gateway";
import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import { buildPublishContentImportHooks } from "#src/features/publish-content/gated-hooks";
import { executePublishContentImport } from "#src/features/publish-content/execute-import";
import { getPublishContentRunStatus } from "#src/features/publish-content/run-repo";
import type { PublishContentReport } from "#src/features/publish-content/planner";
import { gatedPrincipalKindFor, getAuthedCredentialKind, getAuthedPrincipal, type CredentialKindForbiddenBody } from "#src/server/inbound/admin-http/dev-auth";
import { withPublishTrustAuthorize, withPublishTrustContentAuthorize } from "#src/server/inbound/admin-http/publish-trust-auth";
import { registeredPublishTypePermissions } from "#src/features/publish-content/type-registry";
import { toPublishContentDeps, type PublishContentRouteRegistrar } from "./deps.js";
import { readBackstopApplyReport } from "./apply-report.js";
import { importErrorResponse } from "./import-errors.js";
import { toPublishContentReportDto } from "./report-dto.js";
import {
  acceptOverwriteEntityKeys,
  authorizedPrincipalId,
  bodyRecord,
  OVERWRITE_REFUSED,
  rejectForeignWorkspace,
  sendRefusal,
} from "./route-helpers.js";
import { buildBackstopPreview } from "#src/features/publish-content/backstop-preview";
import type { PackedEntity } from "#src/features/publish-content/type-registry";
import { readBackstopMetadata } from "#src/features/publish-content/backstop-service";

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
/**
 * publish-overwrite-live-plan §7: "Overwrite on live" ticks come only from a person's click — here,
 * a signed-in admin session, or a publishing instance relaying its own admin's click (its relay
 * refuses an API key the same way, `peer-transport.ts`'s `mayOverwrite`). An API key on this
 * instance is refused. Empty ticks ask for nothing and pass.
 *
 * @returns `true` when the request may proceed. On `false` the 403 has already been sent.
 * @complexity O(1).
 */
function mayOverwrite(res: Response, overwriteEntityKeys: readonly string[] | null): boolean {
  if (overwriteEntityKeys === null || overwriteEntityKeys.length === 0) return true;
  if (getAuthedCredentialKind(res) !== "api_key") return true;
  const body: CredentialKindForbiddenBody = {
    error: "'overwriteEntityKeys' can only be sent from a signed-in admin session or a publishing instance",
    code: "FORBIDDEN",
    details: { permission: "publish_content.apply", reason: "credential_kind_not_permitted" },
  };
  res.status(403).json(body);
  return false;
}

/** The confirm-only hooks the `confirm` step and `execute`'s authorization pre-check both use. */
function confirmOnlyHooks(workspaceId: string) {
  return buildConfirmOnlyHooks({
    domain: "publish_content.import",
    readPermission: "publish_content.read",
    mutatePermission: "publish_content.apply",
    scopeId: workspaceId,
  });
}

/** True when a plan carries manual-publish rows, whose values the preview would show.
 *  @complexity O(n) in the report's rows. */
function planCarriesRawRows(report: PublishContentReport): boolean {
  return !report.refused && report.rows.some((row) => row.entityType === "raw-row" || row.entityType === "raw-file");
}

/** Returned by `rawPlanPreview` once it has sent the 403. */
const RAW_VALUES_REFUSED = Symbol("raw-values-refused");

export const registerPublishContentImportRoutes: PublishContentRouteRegistrar = (app: Express, deps) => {
  function buildHooks(bundleId: string, actorId: string, res: Response, overwriteEntityKeys: readonly string[] | null) {
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
      publishContentDeps: withPublishTrustContentAuthorize(res, publishContentDeps, registeredPublishTypePermissions(publishContentDeps)),
      bundleRepo: deps.publishContentBundleRepo,
      baselineRepo: deps.publishContentBaselineRepo,
      blobStore: deps.blobStore,
      dbOps: deps.dbOps,
      restorePointsRepo: deps.restorePointsRepo,
      applyPort: deps.publishContentApplyPort,
      getSeedHash: deps.publishContentSeedHash,
      // publish-overwrite-live-plan §4/S6 — closed over fresh per request, exactly like `bundleId`
      // itself (this function's own doc), so a caller's ticks changing between plan/confirm and
      // execute changes the re-derived report and is caught by the existing PLAN_STALE mechanism
      // (`gated-hooks.ts`'s own doc on `forcedEntityKeys`), not by anything bespoke here.
      ...(overwriteEntityKeys === null ? {} : { forcedEntityKeys: new Set(overwriteEntityKeys) }),
    });
  }

  /** A read-capable account cannot turn the raw plan into a private-data reader. Both the
   *  separate capability and each explicitly granted raw type are checked by this port.
   *  @complexity O(t) sequential `authorize()` calls, one per distinct entity type; stops at the first denial. */
  async function mayReadRawValues(res: Response, principalId: string, report: PublishContentReport): Promise<boolean> {
    const projection = toPublishContentDeps(deps);
    const authorized = withPublishTrustContentAuthorize(res, { authorize: deps.authorize }, registeredPublishTypePermissions(projection));
    const types = [...new Set(report.rows.map((row) => row.entityType))];
    for (const publishType of types) {
      const allowed = await authorized.authorize({ principalId, permission: "publish.backstop", workspaceId: deps.workspaceId, publishType } as Parameters<typeof deps.authorize>[0]);
      if (!allowed.allowed) return false;
    }
    return true;
  }

  /**
   * The planner does not attach backstop metadata; the apply loop adds that to the durable
   * run later. Detect raw rows themselves so the first manual plan also has a value review.
   * @returns the preview, `undefined` when there is none to show, or {@link RAW_VALUES_REFUSED}
   *   once the 403 has been sent.
   */
  async function rawPlanPreview(res: Response, input: { principalId: string; bundleId: string; report: PublishContentReport }) {
    if (!planCarriesRawRows(input.report)) return undefined;
    if (!(await mayReadRawValues(res, input.principalId, input.report))) {
      res.status(403).json({ error: "Manual publishing values are not available to this account.", code: "FORBIDDEN" });
      return RAW_VALUES_REFUSED;
    }
    const backstop = toPublishContentDeps(deps).backstop;
    const staged = await deps.publishContentBundleRepo.findById({ workspaceId: deps.workspaceId, id: input.bundleId });
    if (!staged || !backstop) return undefined;
    const entities = JSON.parse(staged.entitiesJson) as PackedEntity[];
    readBackstopMetadata({ entities });
    return buildBackstopPreview({ entities, backstop, workspaceId: deps.workspaceId });
  }

  app.post("/api/admin/v1/workspaces/:workspaceId/publish-content/import/plan", async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      const principal = getAuthedPrincipal(res);
      const bundleId = req.body?.bundleId;
      if (typeof bundleId !== "string") {
        res.status(400).json({ error: "'bundleId' (string) is required", code: "VALIDATION_ERROR" });
        return;
      }
      const overwriteEntityKeys = acceptOverwriteEntityKeys(res, req.body.overwriteEntityKeys, mayOverwrite);
      if (overwriteEntityKeys === OVERWRITE_REFUSED) return;

      const hooks = buildHooks(bundleId, principal.id, res, overwriteEntityKeys);
      const result = await plan({
        deps: withPublishTrustAuthorize(res, deps.gatedMutations.gatewayDeps),
        principalId: principal.id,
        principalKind: gatedPrincipalKindFor(getAuthedCredentialKind(res)),
        hooks: hooks as unknown as GatedMutationHooks<unknown, unknown>,
      });

      const report = result.details as PublishContentReport;
      const backstopPreview = await rawPlanPreview(res, { principalId: principal.id, bundleId, report });
      if (backstopPreview === RAW_VALUES_REFUSED) return;
      res.json({
        ...result,
        details: toPublishContentReportDto(report),
        ...(backstopPreview === undefined ? {} : { backstopPreview }),
      });
    } catch (err) {
      sendRefusal(res, importErrorResponse(err));
    }
  });

  app.post("/api/admin/v1/workspaces/:workspaceId/publish-content/import/confirm", async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      const principal = getAuthedPrincipal(res);
      const { planId, planHash } = bodyRecord(req.body);
      if (typeof planId !== "string" || typeof planHash !== "string") {
        res.status(400).json({ error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

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
        hooks: confirmOnlyHooks(deps.workspaceId),
        planId,
        planHash,
      });

      res.json({ confirmationToken: record.confirmationToken });
    } catch (err) {
      sendRefusal(res, importErrorResponse(err));
    }
  });

  app.post("/api/admin/v1/workspaces/:workspaceId/publish-content/import/execute", async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      const principal = getAuthedPrincipal(res);
      const body = bodyRecord(req.body);
      const { bundleId, confirmationToken } = body;
      if (typeof bundleId !== "string" || typeof confirmationToken !== "string") {
        res.status(400).json({ error: "'bundleId' and 'confirmationToken' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }
      const overwriteEntityKeys = acceptOverwriteEntityKeys(res, body.overwriteEntityKeys, mayOverwrite);
      if (overwriteEntityKeys === OVERWRITE_REFUSED) return;

      // Pre-check mirroring `database/migrate-forward.ts`'s AUD-001 fix: authorize BEFORE the
      // costClass refusal ever runs, so an authenticated-but-unauthorized caller cannot learn this
      // workspace's restore-point capability at all. `gateway.execute()`'s own fresh authorize()
      // (CIC U-001) remains the authoritative check and is unchanged by this.
      const preCheck = await authorizeForHooks(
        withPublishTrustAuthorize(res, deps.gatedMutations.gatewayDeps),
        confirmOnlyHooks(deps.workspaceId),
        { principalId: principal.id, permission: "publish_content.apply" }
      );
      if (!preCheck.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'publish_content.apply' (${preCheck.reason})`,
          code: "NOT_AUTHORIZED",
        });
        return;
      }

      const hooks = buildHooks(bundleId, principal.id, res, overwriteEntityKeys);
      const capabilities = await deps.dbOps.getCapabilities();
      const result = await executePublishContentImport({
        workspaceId: deps.workspaceId,
        costClass: capabilities.restorePoint.costClass,
        gatewayExecute: () =>
          execute({
            deps: withPublishTrustAuthorize(res, deps.gatedMutations.gatewayDeps),
            principalId: principal.id,
            principalKind: gatedPrincipalKindFor(getAuthedCredentialKind(res)),
            hooks: hooks as unknown as GatedMutationHooks<
              unknown,
              {
                restorePointId: string;
                runId: string;
                changeSetIds: readonly string[];
                retiredChangeSetIds: readonly string[];
                repointChangeSetIds: readonly string[];
                menuLinksUpdated: number;
                menuLinksNotUpdated: readonly string[];
                verificationProblems: readonly string[];
              }
            >,
            confirmationToken,
          }),
      });

      // The manual result must name apply-time skips rather than repeat the dry-run prediction;
      // `readBackstopApplyReport` keeps that audit read advisory (its own doc).
      const applyReport = await readBackstopApplyReport({ audit: toPublishContentDeps(deps).backstop?.audit, workspaceId: deps.workspaceId, runId: result.runId });
      res.json({ ...result, ...applyReport });
    } catch (err) {
      sendRefusal(res, importErrorResponse(err));
    }
  });

  app.get("/api/admin/v1/workspaces/:workspaceId/publish-content/runs/:runId", async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      if ((await authorizedPrincipalId(res, deps, "publish_content.read")) === null) return;

      const runId = req.params.runId;
      const status = await getPublishContentRunStatus(deps.publishContentRunRepo, {
        workspaceId: deps.workspaceId,
        runId,
      });
      if (!status) {
        res.status(404).json({ error: "publish-content run was not found", code: "RUN_NOT_FOUND" });
        return;
      }
      res.json(status);
    } catch (err) {
      sendRefusal(res, importErrorResponse(err));
    }
  });
};
