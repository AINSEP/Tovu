import type { Express, Response } from "express";
import {
  SiteShareUploadRefusal, siteShareAcknowledgeRoute, siteShareArtifactDeleteRoute, siteShareCreateRoute,
  siteShareListRoute, siteShareRevokeRoute, siteShareStaticCreateRoute, siteShareStaticOptionsRoute,
  type SiteShareFailureArgs, type SiteShareRoute, type SiteShareRouteBackend, type SiteShareRouteDeps,
} from "@jini-ai/cms/admin-http/routes/system/site-shares";
import type { RouteBodyRefusal } from "@jini-ai/core/contracts/server";
import type { RouteDeps } from "#src/server/routes/types";
import { mountAdminRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import type { AdminJsonRouteMountOptions } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { adminPublishTrustFor } from "#src/server/inbound/admin-http/admin-request-facts";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { readShareInput, registerAdminSiteShareArtifactUploadRoute, registerAdminSiteShareDownloadRoute } from "#src/server/inbound/admin-http/routes/system/site-shares";
import { createSiteSharePasswordHandler, sendSiteShareFailure } from "#src/server/inbound/admin-http/routes/system/site-share-password";
import { parseStaticExportInput } from "#src/features/site-backup/static-export-selection";
import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { SHARE_LIMITS } from "#src/features/site-backup/share-policy";
import { SHARE_FILE, SHARE_TOKEN } from "#src/features/site-backup/share-registry";
import { receiveSiteShareArtifact } from "#src/features/site-backup/share-service";
import type { SiteShareBackend } from "#src/features/site-backup/share-backend";

/**
 * @file K1 (RT-K1-adm-system-13): the admin site-share routes. Eight are the Jini raw specs
 * (`@jini-ai/cms/admin-http/routes/system/site-shares`) behind the admin ports; the ZIP download
 * (`res.sendFile` + a mid-stream socket destroy) and the saved-keys password reveal stay host routes.
 * The registrar binds what the specs cannot import: the share backend, the input parsers, the
 * registry's token/file rules, the publish-trust lookup and `sendSiteShareFailure`'s copy and
 * incident reporting (with `deps.tracker`, as before). Wire kept from the hand-written routes
 * (`site-shares.wire.test.ts`): the step's own `NOT_FOUND` workspace refusal (`workspaceRefusal`),
 * a missing session reaching the spec's failure reply (`deferMissingPrincipal`), and the pinned order.
 */

/** body-parser's error `type` per neutral refusal: `sendSiteShareFailure` owns the upload copy. */
const PARSER_TYPE_BY_REFUSAL: Readonly<Partial<Record<RouteBodyRefusal["reason"], string>>> = {
  "too-large": "entity.too.large", "unsupported-encoding": "encoding.unsupported", malformed: "entity.parse.failed",
  aborted: "request.aborted", "size-mismatch": "request.size.invalid",
};

/** The step label each spec's workspace refusal names (the hand-written routes' fixed labels). */
const STEP_BY_ROUTE = new Map<SiteShareRoute, string>([
  [siteShareListRoute, "Export history"], [siteShareCreateRoute, "Export creation"],
  [siteShareStaticOptionsRoute, "Static export options"], [siteShareStaticCreateRoute, "Static export creation"],
  [siteShareAcknowledgeRoute, "Export acknowledgement"], [siteShareRevokeRoute, "Export revocation"],
  [siteShareArtifactDeleteRoute, "Share artifact deletion"],
]);

/** `sendSiteShareFailure`'s reply, captured: the same copy, status and tracker report the hand-written
 * routes wrote, with the request facts its route-derived copy reads.
 * @complexity The shared failure lifecycle. */
function siteShareFailureReply({ deps, args }: { deps: RouteDeps; args: SiteShareFailureArgs }, _optional: Record<string, never> = {}): { status: number; body: unknown } {
  const { error, step, method, path, authenticated } = args;
  const reason = error instanceof SiteShareUploadRefusal ? PARSER_TYPE_BY_REFUSAL[error.refusal.reason] : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const failure = reason ? Object.assign(new Error(message), { type: reason }) : error;
  const reply = { status: 500, body: undefined as unknown };
  const res = {
    status: (status: number) => ({ json: (body: unknown) => { reply.status = status; reply.body = body; } }),
    locals: authenticated ? { principal: true } : {}, req: { method, route: { path } },
  };
  // Only `status().json()`, `locals` and `req.method/route` are read (`admin-failure.ts` `FailureResponse`).
  sendSiteShareFailure({ res: res as unknown as Response, error: failure, tracker: deps.tracker }, { step });
  return reply;
}

/** The registry rows behind one artifact: disabled, then its bytes deleted. @complexity O(rows). */
async function removeSiteShareArtifact({ backend, site, token, file }: { backend: SiteShareBackend; site: string; token: string; file: string }, _optional: Record<string, never> = {}): Promise<boolean> {
  const registry = backend.registry;
  const row = (await registry.list({ site })).find(row => row.token === token && row.file === file);
  if (!row) return false;
  await registry.disable({ shareId: row.shareId, site });
  await registry.deleteArtifact({ shareId: row.shareId });
  return true;
}

/** The specs' deps, built from `RouteDeps` (never passed whole). `siteShareBackend` is read per request.
 * @complexity O(1). */
function siteShareRouteDeps({ deps }: { deps: RouteDeps }, _optional: Record<string, never> = {}): SiteShareRouteDeps & { authorize: RouteDeps["authorize"] } {
  return {
    workspaceId: deps.workspaceId,
    authorize: (params) => deps.authorize(params),
    backend: () => deps.siteShareBackend as (SiteShareRouteBackend & SiteShareBackend) | undefined,
    isPublishTrusted: ({ context }: { context: OperatorPrincipalRecord }) => adminPublishTrustFor({ context }) !== null,
    readCreateInput: ({ body }) => readShareInput({ body }),
    readStaticInput: ({ body }) => ({ ...parseStaticExportInput({ input: body === undefined ? {} : body }) }),
    isArtifactIdentity: ({ token, file }) => SHARE_TOKEN.test(token) && SHARE_FILE.test(file),
    invalidArtifact: () => new SiteShareRefusal({ code: "INVALID_INPUT", message: "Expected a .tovu.zip artifact with a 16-letter token and application/zip body." }),
    receiveArtifact: ({ backend, token, file, archive }: { backend: SiteShareBackend; token: string; file: string; archive: Uint8Array }) =>
      receiveSiteShareArtifact({ registry: backend.registry, site: deps.workspaceId, token, file, archive: Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength) }),
    removeArtifact: ({ backend, token, file }: { backend: SiteShareBackend; token: string; file: string }) => removeSiteShareArtifact({ backend, site: deps.workspaceId, token, file }),
    failureReply: (args) => siteShareFailureReply({ deps, args }),
    maxArchiveBytes: SHARE_LIMITS.maxArchiveBytes,
  };
}

/** One spec behind the admin ports, with its step's own workspace refusal. @complexity O(1). */
function mountSiteShareRoute({ app, spec, routeDeps }: { app: Express; spec: SiteShareRoute; routeDeps: ReturnType<typeof siteShareRouteDeps> }, _optional: Record<string, never> = {}): void {
  const step = STEP_BY_ROUTE.get(spec);
  const mount: AdminJsonRouteMountOptions = {
    workspaceRefusal: () => ({ status: 404, body: { code: "NOT_FOUND", message: `${step} failed: this workspace is not available.` } }),
    // A missing session reached the hand-written gate's authorization, whose failure took the step's copy.
    deferMissingPrincipal: true,
  };
  mountAdminRawRoute({ app, spec, deps: routeDeps }, mount);
}

/** Authenticated management and ZIP-only download. Mounted under the existing admin session gate. */
export function registerAdminSiteShareRoutes(required: { app: Express; deps: RouteDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  const routeDeps = siteShareRouteDeps({ deps });
  for (const spec of [siteShareListRoute, siteShareCreateRoute, siteShareStaticOptionsRoute, siteShareStaticCreateRoute]) mountSiteShareRoute({ app, spec, routeDeps });
  app.post("/api/admin/v1/workspaces/:workspaceId/site-shares/:shareId/password", createSiteSharePasswordHandler({ deps }));
  mountSiteShareRoute({ app, spec: siteShareAcknowledgeRoute, routeDeps });
  registerAdminSiteShareDownloadRoute({ app, deps });
  mountSiteShareRoute({ app, spec: siteShareRevokeRoute, routeDeps });
  registerAdminSiteShareArtifactUploadRoute({ app, deps });
  mountSiteShareRoute({ app, spec: siteShareArtifactDeleteRoute, routeDeps });
}
