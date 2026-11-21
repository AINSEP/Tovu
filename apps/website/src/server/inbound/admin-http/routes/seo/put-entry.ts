import { adminFailureResponse, type AdminFailurePorts } from "#src/server/inbound/shared/admin-failure";
import { ToolInputError } from "@jini-ai/core";
import { parseExpectedVersion, RecordVersionConflictError, versionConflictBody } from "@jini-ai/core/optimistic-concurrency";
import {
  getEntryMeta,
  setEntrySeoOverrides,
  SeoConcurrentWriteError,
  SeoEntryNotFoundError,
  SeoFieldValidationError,
  SeoInvalidCanonicalUrlError,
} from "@jini-ai/cms/seo";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { withContentImageSource, withCoverReadDeps } from "@jini-ai/cms/seo/cover-image";
import { entityNotLiveResponse } from "#src/server/inbound/admin-http/http/entity-not-live";
import type { SeoRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** Maps `setEntrySeoOverrides`/`getEntryMeta`'s known thrown error types to this route's documented
 *  4xx response shapes; any other error (including a real bug) falls through to a generic 500. */
function seoPutEntryErrorResponse({ err }: { err: unknown }, options: AdminFailurePorts = {}): { status: number; body: { error: string; code: string } } {
  // Why first: Jini's EntityNotLiveError extends ToolInputError, so the generic 400 below would swallow a trashed entry's 409.
  const live = entityNotLiveResponse({ err });
  if (live) return live;
  if (err instanceof ToolInputError) return { status: 400, body: { error: err.message, code: "VALIDATION_ERROR" } };
  if (err instanceof RecordVersionConflictError) return { status: 409, body: versionConflictBody({ error: err }) };
  if (err instanceof SeoFieldValidationError) {
    return { status: 400, body: { error: err.message, code: "SEO_FIELD_VALIDATION_ERROR" } };
  }
  if (err instanceof SeoInvalidCanonicalUrlError) {
    return { status: 400, body: { error: err.message, code: "SEO_INVALID_CANONICAL_URL" } };
  }
  if (err instanceof SeoEntryNotFoundError) {
    return { status: 404, body: { error: err.message, code: "SEO_ENTRY_NOT_FOUND" } };
  }
  // 409, not the generic 500 below: the request was well-formed and authorized, it simply lost the
  // row to another writer three times running. Resending it is the correct next move, which is the
  // one thing a 500 would not tell the caller (2026-09-07, fable bugs audit SEO-01).
  if (err instanceof SeoConcurrentWriteError) {
    return { status: 409, body: { error: err.message, code: "SEO_CONCURRENT_WRITE" } };
  }
  return adminFailureResponse({ error: err, tracker: options.tracker }, { operation: "routes/seo/put-entry" });
}

/**
 * PUT (partial) SEO overrides for an entry (SPEC-008 api.spec.md `SEO_PUT_ENTRY_META`, tasks.md T047).
 * `setEntrySeoOverrides` is its own chokepoint (does its own `authorize()` call) — this route still
 * does the route-layer authorize-then-403 dance first, matching every sibling admin route's shape,
 * so a caller lacking the permission never reaches the chokepoint at all (fail-closed, INV-07-style).
 */
export const registerAdminSeoPutEntryRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      await deps.seoReady;
      const principal = getAuthedPrincipal(res);
      const entryId = String(req.params.entryId ?? "");
      const authorized = await authorizeOrRespond({ res, authorize: deps.authorize, params: {
        principalId: principal.id,
        permission: "admin.seo.manage",
        workspaceId: deps.workspaceId,
        entityType: "seo-entry",
        entityId: entryId,
      } });
      if (!authorized) return;

      const { expectedVersion: rawExpectedVersion, ...patch } = req.body ?? {};
      const expectedVersion = parseExpectedVersion({ value: rawExpectedVersion });

      await setEntrySeoOverrides({
        deps: {
          postRepo: deps.seoDeps.postRepo,
          authorize: deps.authorize,
          invalidateSitemapCache: deps.sitemapService.invalidateSitemapCache,
          clock: deps.clock,
          media: deps.seoDeps.media,
        },
        input: {
          workspaceId: deps.workspaceId,
          entryId,
          patch,
          callerPrincipalId: principal.id,
        },
      }, expectedVersion === undefined ? {} : { expectedVersion });

      const read = await withCoverReadDeps({ deps: deps.seoDeps, workspaceId: deps.workspaceId, entryId });
      const meta = await getEntryMeta({
        deps: read.deps,
        input: { workspaceId: deps.workspaceId, entryId },
      }, {});
      res.json({ data: withContentImageSource({ meta, rawPost: read.rawPost }) });
    } catch (err) {
      const { status, body } = seoPutEntryErrorResponse({ err }, { tracker: res.locals?.adminFailureTracker });
      res.status(status).json(body);
    }
  });
};
