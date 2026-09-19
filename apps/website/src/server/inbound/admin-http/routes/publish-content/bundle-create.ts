import { stageBundle, PUBLISH_CONTENT_BUNDLE_MAX_BODY_BYTES } from "#src/features/publish-content/bundle-staging";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import { rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";

import type { PublishContentRouteRegistrar } from "./deps.js";

/**
 * @file Task 6 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 6.
 *
 * `POST /api/admin/v1/workspaces/:workspaceId/publish-content/bundles` — stages a received bundle
 * (Task 4's export envelope: `{hashVersion, sourceLabel, entities, blobManifest}`, whether pushed by
 * a peer or fetched by this instance's own pull) in `publish_content_bundles`, so Task 7's gated
 * `plan()`/`execute()` has a stable, already-persisted input to hash and re-hash. Never writes any
 * OTHER table — see `bundle-staging.ts`'s `stageBundle` for what "staging" means.
 *
 * `expiresAt` is never read from the request body — `stageBundle` always computes it server-side
 * from `receivedAt` + a fixed TTL (`bundle-staging.ts`'s own header). `sourcePrincipalId` is always
 * this request's AUTHENTICATED principal, never a bundle-declared identity (plan §1.6 / §5 risk #9).
 */

/** Body-shape validation extracted from the handler: `hashVersion` must be a finite integer,
 *  `entities` and `blobManifest` must be arrays (`blobManifest` additionally an array of strings —
 *  it is compared against blob sha256s downstream). This module never inspects an entity's own
 *  shape — that is `planImport`'s job (Task 5, already built); duplicating it here would just be a
 *  second, driftable copy of the same rule.
 *  @complexity O(n) in `blobManifest.length` (one type check per element). */
function validateBundleBody(
  rawBody: unknown
): { hashVersion: number; sourceLabel: string | undefined; entities: unknown[]; blobManifest: string[] } | { error: string } {
  const body = (rawBody ?? {}) as Record<string, unknown>;

  if (typeof body.hashVersion !== "number" || !Number.isFinite(body.hashVersion)) {
    return { error: "hashVersion must be a number" };
  }
  if (!Array.isArray(body.entities)) {
    return { error: "entities must be an array" };
  }
  if (!Array.isArray(body.blobManifest) || body.blobManifest.some((sha) => typeof sha !== "string")) {
    return { error: "blobManifest must be an array of strings" };
  }
  if (body.sourceLabel !== undefined && typeof body.sourceLabel !== "string") {
    return { error: "sourceLabel must be a string when present" };
  }

  return {
    hashVersion: body.hashVersion,
    sourceLabel: body.sourceLabel as string | undefined,
    entities: body.entities,
    blobManifest: body.blobManifest as string[],
  };
}

export const registerPublishContentBundleCreateRoute: PublishContentRouteRegistrar = (app, deps) => {
  app.post(
    "/api/admin/v1/workspaces/:workspaceId/publish-content/bundles",
    rejectOversizedJsonBody({ maxBytes: PUBLISH_CONTENT_BUNDLE_MAX_BODY_BYTES }),
    async (req, res) => {
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

        const validated = validateBundleBody(req.body);
        if ("error" in validated) {
          res.status(400).json({ error: validated.error });
          return;
        }

        // The grant's entity-type allowlist, enforced at the door a publishing credential comes
        // through. A capability says "may publish"; `entityTypes` says WHAT, and without this the
        // second half of the grant would be decorative. The WHOLE bundle is refused rather than
        // filtered down to the allowed types, matching `grant.ts`'s own refuse-never-repair stance:
        // a source that sent a type it may not send has a wrong idea of what it is allowed to do,
        // and quietly dropping part of its bundle would leave it believing the publish succeeded
        // in full. An empty `entityTypes` allows nothing, which is the correct reading of a
        // permission nobody stated.
        const publishTrust = getPublishTrustContext(res);
        if (publishTrust) {
          // `validated.entities` is `unknown[]` on purpose (see `validateBundleBody`), so an entry
          // that does not declare a string `entityType` is refused rather than skipped: skipping it
          // would let `{}` walk straight past the allowlist and reach `planImport` unchecked.
          // `findIndex`, not `find`, because `find` reports a match by returning the element: a
          // matching `undefined` entry would be indistinguishable from "no match". Not reachable
          // over this route today — JSON has no `undefined`, so a parsed body cannot produce one,
          // and a deliberate break confirmed the tests below do not distinguish the two spellings.
          // Kept because it costs nothing and the next caller may not arrive through JSON.
          const refusedAt = validated.entities.findIndex((entity) => {
            const declared =
              typeof entity === "object" && entity !== null
                ? (entity as { entityType?: unknown }).entityType
                : undefined;
            return typeof declared !== "string" || !publishTrust.entityTypes.includes(declared);
          });
          if (refusedAt >= 0) {
            res.status(403).json({
              error: "this bundle carries an entity type outside the publishing grant",
              code: "FORBIDDEN",
              details: { permission: "publish_content.apply", reason: "entity_type_not_granted" },
            });
            return;
          }
        }

        const { bundleId, expiresAt } = await stageBundle(
          {
            workspaceId: deps.workspaceId,
            sourcePrincipalId: principal.id,
            hashVersion: validated.hashVersion,
            sourceLabel: validated.sourceLabel,
            entities: validated.entities,
            blobManifest: validated.blobManifest,
          },
          { repo: deps.publishContentBundleRepo, clock: deps.clock, idGen: deps.idGen }
        );

        res.status(201).json({ bundleId, expiresAt });
      } catch {
        res.status(500).json({ error: "internal error" });
      }
    }
  );
};
