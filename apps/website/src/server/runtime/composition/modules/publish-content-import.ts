import {
  importConfirmRoute,
  importExecuteRoute,
  importPlanRoute,
  importRunStatusRoute,
  type ImportConfirmRouteDeps,
  type ImportExecuteRouteDeps,
  type ImportPlanRouteDeps,
  type ImportRouteBaseDeps,
  type ImportRunStatusRouteDeps,
  type OverwriteEntityKeys,
} from "@jini-ai/cms/admin-http/routes/publish-content/import";
import { executePublishContentImport } from "@jini-ai/cms/publish/content/execute-import";
import { buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";
import { authorizeForHooks, confirm, execute, plan } from "#src/contracts/core/gated-mutations/gateway";
import type { GatedMutationHooks } from "@jini-ai/core/gated-mutations";
import { buildBackstopPreview } from "#src/features/publish-content/backstop-preview";
import { readBackstopMetadata } from "#src/features/publish-content/backstop-service";
import { buildPublishContentImportHooks } from "#src/features/publish-content/gated-hooks";
import type { PublishContentReport } from "#src/features/publish-content/plan-rows";
import { getPublishContentRunStatus } from "@jini-ai/cms/publish/content/run-repo";
import { registeredPublishTypePermissions, type PackedEntity } from "#src/features/publish-content/type-registry";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { adminPublishTrustFor, adminRequestFactsFor } from "#src/server/inbound/admin-http/admin-request-facts";
import { gatedPrincipalKindFor, type OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { withGrantAuthorize, withGrantContentAuthorize } from "#src/server/inbound/admin-http/publish-trust-auth";
import { IMPORT_FAILURE, knownImportErrorResponse } from "#src/server/inbound/admin-http/routes/publish-content/import-errors";
import { toPublishContentDeps, type PublishContentRouteDeps, type PublishContentRouteRegistrar } from "#src/server/inbound/admin-http/routes/publish-content/deps";

/**
 * @file K1 (w3 C3c): the gated import ceremony (`import/{plan,confirm,execute}`, `runs/:runId`) as Jini
 * route specs (`@jini-ai/cms/admin-http/routes/publish-content/import`) behind the admin ports. The
 * gateway, the per-request import hooks, the publishing-grant attenuation and the typed error classes
 * stay here and reach the specs as functions keyed on the spec's `context` — the grant through
 * `adminPublishTrustFor`, the credential kind through `adminRequestFactsFor`, never `res`.
 */

type Context = { id: string } | undefined;
const principalRecord = (context: Context) => context as OperatorPrincipalRecord | undefined;
const grantOf = (context: Context) => adminPublishTrustFor({ context: principalRecord(context) });
const principalKindOf = (context: Context) => gatedPrincipalKindFor(adminRequestFactsFor({ context: principalRecord(context) }).credentialKind);

/** The ports plus the typed-error mapping every import spec reads; `authorize` read per request. */
function importBaseDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}): ImportRouteBaseDeps & AdminJsonRoutePortDeps {
  return {
    workspaceId: deps.workspaceId,
    authorize: (params) => deps.authorize(params),
    importRefusal: ({ error }) => knownImportErrorResponse({ err: error }),
  };
}

/** The gateway bag, attenuated to the request's publishing grant when it carries one. */
const gatewayDepsFor = ({ deps, context }: { deps: PublishContentRouteDeps; context: Context }) =>
  withGrantAuthorize({ grant: grantOf(context), deps: deps.gatedMutations.gatewayDeps });

/** The confirm-only hooks the `confirm` step and `execute`'s authorization pre-check both use. */
function confirmOnlyHooks({ workspaceId }: { workspaceId: string }, _optional: Record<string, never> = {}) {
  return buildConfirmOnlyHooks({ domain: "publish_content.import", readPermission: "publish_content.read", mutatePermission: "publish_content.apply", scopeId: workspaceId });
}

function buildHooks({ deps, context, bundleId, overwriteEntityKeys }: { deps: PublishContentRouteDeps; context: { id: string }; bundleId: string; overwriteEntityKeys: OverwriteEntityKeys }, _optional: Record<string, never> = {}) {
  const publishContentDeps = toPublishContentDeps(deps);
  return buildPublishContentImportHooks({
    workspaceId: deps.workspaceId, bundleId, actorId: context.id, clock: deps.clock, idGen: deps.idGen,
    // The apply loop authorizes each entity against its TYPE's own write permission. For a human
    // that is RBAC, unchanged. For a publishing credential it has to be the grant, or the
    // ceremony fails at execute — see `withPublishTrustContentAuthorize`'s own doc.
    publishContentDeps: withGrantContentAuthorize({ grant: grantOf(context), deps: publishContentDeps, typePermissions: registeredPublishTypePermissions(publishContentDeps) }),
    bundleRepo: deps.publishContentBundleRepo, baselineRepo: deps.publishContentBaselineRepo, blobStore: deps.blobStore,
    dbOps: deps.dbOps, restorePointsRepo: deps.restorePointsRepo, applyPort: deps.publishContentApplyPort, getSeedHash: deps.publishContentSeedHash,
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
async function mayReadRawValues({ deps, context, report }: { deps: PublishContentRouteDeps; context: { id: string }; report: { rows: readonly { entityType: string }[] } }, _optional: Record<string, never> = {}): Promise<boolean> {
  const projection = toPublishContentDeps(deps);
  const authorized = withGrantContentAuthorize({ grant: grantOf(context), deps: { authorize: deps.authorize }, typePermissions: registeredPublishTypePermissions(projection) });
  for (const publishType of new Set(report.rows.map((row) => row.entityType))) {
    const allowed = await authorized.authorize({ principalId: context.id, permission: "publish.backstop", workspaceId: deps.workspaceId, publishType } as Parameters<typeof deps.authorize>[0]);
    if (!allowed.allowed) return false;
  }
  return true;
}

/** The manual-send value preview of the staged bundle, or `undefined` when there is none to show. */
async function backstopPreview({ deps, bundleId }: { deps: PublishContentRouteDeps; bundleId: string }, _optional: Record<string, never> = {}): Promise<unknown> {
  const backstop = toPublishContentDeps(deps).backstop;
  const staged = await deps.publishContentBundleRepo.findById({ workspaceId: deps.workspaceId, id: bundleId });
  if (!staged || !backstop) return undefined;
  const entities = JSON.parse(staged.entitiesJson) as PackedEntity[];
  readBackstopMetadata({ entities });
  return buildBackstopPreview({ entities, backstop, workspaceId: deps.workspaceId });
}

function planDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}): ImportPlanRouteDeps & AdminJsonRoutePortDeps {
  return {
    ...importBaseDeps({ deps }),
    credentialKind: ({ context }) => adminRequestFactsFor({ context: principalRecord(context) }).credentialKind,
    planImport: async ({ context, bundleId, overwriteEntityKeys }) => {
      const hooks = buildHooks({ deps, context, bundleId, overwriteEntityKeys });
      const result = await plan({ deps: gatewayDepsFor({ deps, context }), principalId: context.id, principalKind: principalKindOf(context), hooks: hooks as unknown as GatedMutationHooks<unknown, unknown> });
      return { result: result as unknown as Record<string, unknown>, report: result.details as PublishContentReport };
    },
    mayReadRawValues: ({ context, report }) => mayReadRawValues({ deps, context, report }),
    backstopPreview: ({ bundleId }) => backstopPreview({ deps, bundleId }),
  };
}

function confirmDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}): ImportConfirmRouteDeps & AdminJsonRoutePortDeps {
  return {
    ...importBaseDeps({ deps }),
    // Reports the credential that actually authenticated this request: a session is a human, an
    // api_key is a peer push, and a `publish_key` is the zero-setup publishing handshake. No
    // `agent`-kind principal can reach this handler — nothing authenticates as an agent through the
    // admin HTTP gate — so the "agent cannot confirm" property is still proved directly against
    // `gateway.confirm()` in this feature's unit tests, not via HTTP (`gated-hooks.test.ts`).
    confirmImport: ({ context, planId, planHash }) => confirm({ deps: gatewayDepsFor({ deps, context }), principalId: context.id, principalKind: principalKindOf(context), hooks: confirmOnlyHooks({ workspaceId: deps.workspaceId }), planId, planHash }),
  };
}

function executeDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}): ImportExecuteRouteDeps & AdminJsonRoutePortDeps {
  return {
    ...importBaseDeps({ deps }),
    credentialKind: ({ context }) => adminRequestFactsFor({ context: principalRecord(context) }).credentialKind,
    authorizeExecute: ({ context }) => authorizeForHooks({ deps: gatewayDepsFor({ deps, context }), hooks: confirmOnlyHooks({ workspaceId: deps.workspaceId }), required: { principalId: context.id, permission: "publish_content.apply" } }),
    executeImport: async ({ context, bundleId, confirmationToken, overwriteEntityKeys }) => {
      const hooks = buildHooks({ deps, context, bundleId, overwriteEntityKeys });
      const capabilities = await deps.dbOps.getCapabilities();
      const result = await executePublishContentImport({
        workspaceId: deps.workspaceId,
        costClass: capabilities.restorePoint.costClass,
        gatewayExecute: () => execute({ deps: gatewayDepsFor({ deps, context }), principalId: context.id, principalKind: principalKindOf(context), hooks: hooks as unknown as GatedMutationHooks<unknown, { runId: string }>, confirmationToken }),
      });
      return result as Record<string, unknown> & { runId: string };
    },
    backstopAudit: () => toPublishContentDeps(deps).backstop?.audit,
  };
}

function runStatusDeps({ deps }: { deps: PublishContentRouteDeps }, _optional: Record<string, never> = {}): ImportRunStatusRouteDeps & AdminJsonRoutePortDeps {
  return {
    ...importBaseDeps({ deps }),
    runStatus: ({ runId }) => getPublishContentRunStatus({ repo: deps.publishContentRunRepo, input: { workspaceId: deps.workspaceId, runId } }),
  };
}

/** Every import mount: `"guarded"` (only the run status asks the authorizer itself), the import copy for an unmapped error. */
const IMPORT_MOUNT: AdminJsonRouteMountOptions = { authorization: "guarded", failure: { ...IMPORT_FAILURE }, failureCopy: "operation" };

/**
 * `POST .../import/{plan,confirm,execute}` and `GET .../runs/:runId` (Task 7): four Jini specs behind
 * the admin ports, registered in the hand-written order. An unmapped error answers `importErrorResponse`'s
 * redacted 500 (same operation and copy, the request's tracker) through `failureCopy: "operation"`.
 */
export const registerPublishContentImportRoutes: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: importPlanRoute, deps: planDeps({ deps }) }, IMPORT_MOUNT);
  mountAdminJsonRoute({ app, spec: importConfirmRoute, deps: confirmDeps({ deps }) }, IMPORT_MOUNT);
  mountAdminJsonRoute({ app, spec: importExecuteRoute, deps: executeDeps({ deps }) }, IMPORT_MOUNT);
  mountAdminJsonRoute({ app, spec: importRunStatusRoute, deps: runStatusDeps({ deps }) }, IMPORT_MOUNT);
};
