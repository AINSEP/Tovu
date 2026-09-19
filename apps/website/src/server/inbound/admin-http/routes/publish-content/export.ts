import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import { CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import { packAuthorizedEntities } from "#src/features/publish-content/export-bundle";
import { toPublishContentDeps, type PublishContentRouteRegistrar } from "./deps.js";

/**
 * @file Task 4 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.1/§4 task 4.
 *
 * `GET /api/admin/v1/workspaces/:workspaceId/publish-content/export` — read-only (never writes a
 * row), streams `{hashVersion, sourceLabel, entities[], blobManifest[]}`.
 *
 * ## The security property this route exists to hold (plan §3 rule 5, §5 risk #8)
 *
 * The type filter is an ALLOWLIST of registered publish-content types, never a deny-list: this
 * route never reads any table directly, and never enumerates "every table except the ones on some
 * excluded-list" — its ONLY source of entities is `listPublishContentContributors()` (Task 2),
 * called fresh at request time (never cached — see `type-registry.ts`'s own "fresh-read" rule). A
 * table added tomorrow with no contributor registered for it is therefore invisible to this route
 * BY CONSTRUCTION, not because someone remembered to add it to a deny-list. This is exactly the
 * property `__tests__/export.test.ts`'s "empty registry -> empty bundle, despite real DB content"
 * test pins directly, and `__tests__/export-no-leak.integration.test.ts` pins end-to-end against a
 * real SQLite db seeded with a canary row in every named sensitive table.
 *
 * ## Two DIFFERENT permission checks, not one
 *
 * 1. `publish_content.read` gates the route itself — a principal without it never reaches the
 *    registry loop at all (403, not a partial/empty 200 that could be mistaken for "nothing to
 *    export").
 * 2. Each registered type's OWN `permission` (plan §3: "the resource's OWN existing write
 *    permission", e.g. `content.write` for `post`/`page` — `PublishContentHandler.permission`)
 *    gates that ONE type's inclusion. A principal holding `publish_content.read` but not, say,
 *    `content.write` still gets a 200 — just with that type's entities silently omitted, never a
 *    500. This is what makes "a principal allowed posts but not media is refused media by
 *    construction" (plan §3) true for the export side, not just the apply side.
 *
 * ## Why this streams rather than buffers
 *
 * `PublishContentHandler.pack()` is an async generator specifically so a large collection never
 * has to be held in memory whole (`type-registry.ts`'s own doc: "Task 4's export route streams its
 * response body from this directly"). This handler writes the JSON envelope by hand
 * (`res.write()` per entity) rather than building an array and calling `res.json()` once, so memory
 * use stays bounded by one entity at a time regardless of corpus size.
 */

export const registerPublishContentExportRoute: PublishContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/publish-content/export", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);

      // A publishing credential is refused here, loudly, even though it holds
      // `publish_content.read`. The route-level gate is not the only check this handler applies:
      // `packAuthorizedEntities` below ALSO asks for each registered type's own write permission
      // (this file's header, "Two DIFFERENT permission checks"), and a per-type denial omits that
      // type and continues rather than failing. A publishing grant's capability set is closed and
      // cannot contain `content.write` (`features/publish-trust/grant.ts`), so every type would be
      // omitted and the caller would receive a well-formed bundle containing NOTHING — a silently
      // wrong answer, which is worse than a refusal. Pull-by-publishing-credential needs the
      // per-type gate to be answerable from the grant's `entityTypes`; until it is, this says so.
      if (getPublishTrustContext(res)) {
        res.status(403).json({
          error: "a publishing credential cannot export from this site",
          code: "FORBIDDEN",
          details: { permission: "publish_content.read", reason: "publish_trust_export_not_wired" },
        });
        return;
      }

      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "publish_content.read",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const workspace = await deps.workspaceRepo.findById(deps.workspaceId);
      const sourceLabel = workspace?.name ?? deps.workspaceId;
      const publishContentDeps = toPublishContentDeps(deps);

      res.setHeader("content-type", "application/json");
      res.write(
        `{"hashVersion":${JSON.stringify(CONTENT_HASH_VERSION)},"sourceLabel":${JSON.stringify(sourceLabel)},"entities":[`
      );

      const requiredBlobs = new Set<string>();
      let wroteEntity = false;
      // The registry walk and the per-type gate (see this file's own header, "Two DIFFERENT
      // permission checks") live in `export-bundle.ts` so Task 10's push driver runs the IDENTICAL
      // loop rather than a second copy of it. A per-type denial omits that type and continues; it
      // never turns into a 500 or aborts the stream. This route keeps its own streaming write, which
      // is the one thing the two callers genuinely do differently.
      for await (const entity of packAuthorizedEntities({
        workspaceId: deps.workspaceId,
        principalId: principal.id,
        authorize: deps.authorize,
        publishContentDeps,
      })) {
        if (wroteEntity) res.write(",");
        res.write(JSON.stringify(entity));
        wroteEntity = true;
        for (const sha of entity.requiredBlobs) requiredBlobs.add(sha);
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
