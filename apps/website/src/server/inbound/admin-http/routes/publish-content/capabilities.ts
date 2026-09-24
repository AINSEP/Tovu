import { buildPublishContentCatalog } from "#src/features/publish-content/type-registry";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";

import { toPublishContentDeps, type PublishContentRouteRegistrar } from "./deps.js";

/**
 * @file S-F1 of `ADS-memory/.local-artifacts/publish-files-plan-2026-09-24.md` §5/§6.
 *
 * `GET /api/admin/v1/workspaces/:workspaceId/publish-content/capabilities` — what THIS instance can
 * accept, asked BEFORE a peer stages a single entity. Without it, `bundle-create.ts` refuses the
 * WHOLE bundle the moment it carries any entity type outside the caller's grant (§5), which turns
 * every new type this codebase ever adds into a hard publish failure against an older destination
 * until that destination is redeployed. `peer-transport.ts`'s `pushBundleToPeer` calls this route
 * first, drops the types it names as unsupported, and reports them back as `notSupportedByLive`
 * instead — nothing is refused, and no blob is wasted uploading an entity that will not be sent.
 *
 * `entityTypes` is the intersection of two independent facts, both already checked separately
 * elsewhere in this directory and joined here into one answer:
 * - Every type THIS instance has a registered handler for (`buildPublishContentCatalog` — the same
 *   allowlist `export.ts`/`bundle-create.ts` already enforce).
 * - Every type the CALLING principal's publishing grant permits, when it authenticated through one
 *   (`getPublishTrustContext`). An explicitly-configured peer API key carries no such grant — the
 *   same "no grant present, so the allowlist check does not run" reading `bundle-create.ts` already
 *   gives that credential kind — so a caller of that kind sees every registered type unfiltered.
 *
 * A peer that predates this route answers the GET with an ordinary 404 from Express's own router;
 * nothing here has to special-case that absence. `peer-transport.ts`'s own probe reads a 404 as
 * "legacy `{post,page,media}`", the fixed set every pre-S-F1 destination accepted.
 */
export const registerPublishContentCapabilitiesRoute: PublishContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/publish-content/capabilities", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "publish_content.apply",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const catalog = buildPublishContentCatalog(toPublishContentDeps(deps));
      const registeredTypes = catalog.handlers.map((handler) => handler.entityType);

      // `null` (no publishing grant on this request — an explicitly-configured peer key) means
      // "every registered type", matching `bundle-create.ts`'s own reading of the same absence.
      const grantedTypes = getPublishTrustContext(res)?.entityTypes ?? null;
      const entityTypes =
        grantedTypes === null ? registeredTypes : registeredTypes.filter((entityType) => grantedTypes.includes(entityType));

      const schemaVersions: Record<string, number> = {};
      for (const handler of catalog.handlers) {
        if (entityTypes.includes(handler.entityType)) schemaVersions[handler.entityType] = handler.schemaVersion;
      }

      // publish-overwrite-live-plan §4/S6 — unconditional, unlike `entityTypes`: it names a CODE
      // capability of this instance's import ceremony (whether `forcedEntityKeys`/`retires` are
      // understood at all), not a per-caller content-type grant, so no credential or handler
      // narrows it. `peer-transport.ts`'s probe (S7) reads its absence as `liveCanOverwrite: false`
      // — the same "older peer answers without a field it doesn't know" reading `entityTypes` itself
      // already relies on for a pre-S-F1 destination's plain 404.
      res.status(200).json({ entityTypes, schemaVersions, features: ["overwrite-live"] });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
