import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { CONTENT_HASH_VERSION } from "#src/features/content-transport/content-hash";
import { listContentTransportContributors } from "#src/features/content-transport/type-registry";
import type { ContentTransportDeps } from "#src/features/content-transport/type-registry";

import type { ContentTransportRouteRegistrar } from "./deps.js";

/**
 * @file Task 4 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.1/§4 task 4.
 *
 * `GET /api/admin/v1/workspaces/:workspaceId/content-transport/export` — read-only (never writes a
 * row), streams `{hashVersion, sourceLabel, entities[], blobManifest[]}`.
 *
 * ## The security property this route exists to hold (plan §3 rule 5, §5 risk #8)
 *
 * The type filter is an ALLOWLIST of registered content-transport types, never a deny-list: this
 * route never reads any table directly, and never enumerates "every table except the ones on some
 * excluded-list" — its ONLY source of entities is `listContentTransportContributors()` (Task 2),
 * called fresh at request time (never cached — see `type-registry.ts`'s own "fresh-read" rule). A
 * table added tomorrow with no contributor registered for it is therefore invisible to this route
 * BY CONSTRUCTION, not because someone remembered to add it to a deny-list. This is exactly the
 * property `__tests__/export.test.ts`'s "empty registry -> empty bundle, despite real DB content"
 * test pins directly, and `__tests__/export-no-leak.integration.test.ts` pins end-to-end against a
 * real SQLite db seeded with a canary row in every named sensitive table.
 *
 * ## Two DIFFERENT permission checks, not one
 *
 * 1. `content.transport.read` gates the route itself — a principal without it never reaches the
 *    registry loop at all (403, not a partial/empty 200 that could be mistaken for "nothing to
 *    export").
 * 2. Each registered type's OWN `permission` (plan §3: "the resource's OWN existing write
 *    permission", e.g. `content.write` for `post`/`page` — `ContentTransportHandler.permission`)
 *    gates that ONE type's inclusion. A principal holding `content.transport.read` but not, say,
 *    `content.write` still gets a 200 — just with that type's entities silently omitted, never a
 *    500. This is what makes "a principal allowed posts but not media is refused media by
 *    construction" (plan §3) true for the export side, not just the apply side.
 *
 * ## Why this streams rather than buffers
 *
 * `ContentTransportHandler.pack()` is an async generator specifically so a large collection never
 * has to be held in memory whole (`type-registry.ts`'s own doc: "Task 4's export route streams its
 * response body from this directly"). This handler writes the JSON envelope by hand
 * (`res.write()` per entity) rather than building an array and calling `res.json()` once, so memory
 * use stays bounded by one entity at a time regardless of corpus size.
 */

/** Builds the narrow `ContentTransportDeps` bag every registered contributor's `build()` closes
 *  over, from this route's own `ContentTransportRouteDeps` slice. Never widened beyond what
 *  `features/post/content-transport.ts`'s `buildHandler` actually reads. */
function toContentTransportDeps(deps: {
  workspaceId: string;
  postRepo: ContentTransportDeps["postRepo"];
  clock: ContentTransportDeps["clock"];
  idGen: ContentTransportDeps["idGen"];
  outbox: ContentTransportDeps["outbox"];
  pluginBeforeSaveHook: ContentTransportDeps["beforeSaveHook"];
}): ContentTransportDeps {
  return {
    workspaceId: deps.workspaceId,
    postRepo: deps.postRepo,
    clock: deps.clock,
    idGen: deps.idGen,
    outbox: deps.outbox,
    beforeSaveHook: deps.pluginBeforeSaveHook,
  };
}

export const registerContentTransportExportRoute: ContentTransportRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/content-transport/export", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "content.transport.read",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const workspace = await deps.workspaceRepo.findById(deps.workspaceId);
      const sourceLabel = workspace?.name ?? deps.workspaceId;
      const contentTransportDeps = toContentTransportDeps(deps);

      res.setHeader("content-type", "application/json");
      res.write(
        `{"hashVersion":${JSON.stringify(CONTENT_HASH_VERSION)},"sourceLabel":${JSON.stringify(sourceLabel)},"entities":[`
      );

      const requiredBlobs = new Set<string>();
      let wroteEntity = false;
      for (const contributor of listContentTransportContributors()) {
        const handler = contributor.build(contentTransportDeps);
        // Per-type gate (see this file's own header, "Two DIFFERENT permission checks"): a denial
        // here omits the type from the bundle — it must never turn into a 500 or abort the stream,
        // since every other already-authorized type still has to reach the response.
        const typeAuth = await deps.authorize({
          principalId: principal.id,
          permission: handler.permission,
          workspaceId: deps.workspaceId,
        });
        if (!typeAuth.allowed) continue;

        for await (const entity of handler.pack()) {
          if (wroteEntity) res.write(",");
          res.write(JSON.stringify(entity));
          wroteEntity = true;
          for (const sha of entity.requiredBlobs) requiredBlobs.add(sha);
        }
      }

      res.write(`],"blobManifest":${JSON.stringify(Array.from(requiredBlobs))}}`);
      res.end();
    } catch {
      // The envelope's opening brace may already be flushed by the time a contributor's pack()
      // throws mid-stream — a second `res.status().json()` on a headers-sent response would itself
      // throw, so this only sends a fresh error body when nothing has gone out yet, and otherwise
      // just ends the connection rather than emitting a byte stream a client could half-parse as
      // valid JSON.
      if (!res.headersSent) res.status(500).json({ error: "internal error" });
      else res.end();
    }
  });
};
