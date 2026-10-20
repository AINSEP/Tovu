import { stageBundle, PUBLISH_CONTENT_BUNDLE_MAX_BODY_BYTES } from "#src/features/publish-content/bundle-staging";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import { buildPublishContentCatalog } from "#src/features/publish-content/type-registry";
import { backstopGrantAllows, isBackstopEntityType } from "#src/features/publish-trust/grant";
import { readBackstopMetadata } from "#src/features/publish-content/backstop-service";
import type { PackedEntity } from "#src/features/publish-content/type-registry";
import type { BackstopMetadata } from "#src/features/publish-content/backstop-audit";
import { getPublishTrustContext, type PublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import { rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import { buildPublishBackstopPorts } from "#src/server/runtime/composition/publish-backstop-ports";

import { toPublishContentDeps, type PublishContentRouteDeps, type PublishContentRouteRegistrar } from "./deps.js";
import { authorizedPrincipalId, bodyRecord, rejectForeignWorkspace, sendRefusal, type RouteRefusal } from "./route-helpers.js";

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

/** An entity that passed {@link validateBundleBody}: an object with a non-empty string
 *  `entityType` and an integer `schemaVersion`. Every other field stays opaque. */
export type ValidatedBundleEntity = Record<string, unknown> & { entityType: string; schemaVersion: number };

/** A bundle envelope that passed {@link validateBundleBody}. */
export interface ValidatedBundle {
  artifactFormatVersion: number;
  hashVersion: number;
  sourceLabel: string | undefined;
  entities: ValidatedBundleEntity[];
  blobManifest: string[];
}

/** The version fields, in check order. @complexity O(1). */
function envelopeVersionError(body: Record<string, unknown>): string | undefined {
  if (!Number.isInteger(body.artifactFormatVersion)) return "artifactFormatVersion must be an integer";
  if (body.artifactFormatVersion !== PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION) {
    return (
      `unsupported artifactFormatVersion ${String(body.artifactFormatVersion)}; ` +
      `this instance supports ${PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION}`
    );
  }
  if (!Number.isInteger(body.hashVersion)) return "hashVersion must be an integer";
  return undefined;
}

/** One entity's envelope fields. @complexity O(1). */
function entityError(entity: unknown, index: number): string | undefined {
  if (typeof entity !== "object" || entity === null || Array.isArray(entity)) return `entities[${index}] must be an object`;
  const candidate = entity as Record<string, unknown>;
  if (typeof candidate.entityType !== "string" || candidate.entityType.length === 0) {
    return `entities[${index}].entityType must be a non-empty string`;
  }
  if (!Number.isInteger(candidate.schemaVersion)) return `entities[${index}].schemaVersion must be an integer`;
  return undefined;
}

/** `entities` itself, then each entry in order; the first refusal wins. @complexity O(n). */
function entitiesError(entities: unknown): string | undefined {
  if (!Array.isArray(entities)) return "entities must be an array";
  for (const [index, entity] of entities.entries()) {
    const error = entityError(entity, index);
    if (error) return error;
  }
  return undefined;
}

/** The fields checked after the entities. @complexity O(n) in `blobManifest.length`. */
function manifestAndLabelError(body: Record<string, unknown>): string | undefined {
  if (!Array.isArray(body.blobManifest) || body.blobManifest.some((sha) => typeof sha !== "string")) {
    return "blobManifest must be an array of strings";
  }
  if (body.sourceLabel !== undefined && typeof body.sourceLabel !== "string") return "sourceLabel must be a string when present";
  return undefined;
}

/** Body-shape validation extracted from the handler: `hashVersion` must be a finite integer,
 *  `entities` and `blobManifest` must be arrays (`blobManifest` additionally an array of strings —
 *  it is compared against blob sha256s downstream). This module never inspects an entity's own
 *  shape — that is `planImport`'s job (Task 5, already built); duplicating it here would just be a
 *  second, driftable copy of the same rule.
 *  @complexity O(n) in `blobManifest.length` (one type check per element). */
export function validateBundleBody(rawBody: unknown): ValidatedBundle | { error: string } {
  const body = bodyRecord(rawBody);
  const error = envelopeVersionError(body) ?? entitiesError(body.entities) ?? manifestAndLabelError(body);
  if (error) return { error };
  return {
    artifactFormatVersion: body.artifactFormatVersion as number,
    hashVersion: body.hashVersion as number,
    sourceLabel: body.sourceLabel as string | undefined,
    entities: body.entities as ValidatedBundleEntity[],
    blobManifest: body.blobManifest as string[],
  };
}

/** A registered type whose handler speaks another `schemaVersion` refuses the bundle; an
 *  unregistered type passes here and is left to `planImport`. @complexity O(n). */
function schemaVersionRefusal(deps: PublishContentRouteDeps, entities: readonly ValidatedBundleEntity[]): RouteRefusal | null {
  const catalog = buildPublishContentCatalog(toPublishContentDeps(deps));
  for (const entity of entities) {
    const handler = catalog.handlerByType.get(entity.entityType);
    if (handler && entity.schemaVersion !== handler.schemaVersion) {
      return {
        status: 400,
        body: {
          error:
            `unsupported schemaVersion ${String(entity.schemaVersion)} for entity type '${entity.entityType}'; ` +
            `this instance supports ${handler.schemaVersion}`,
        },
      };
    }
  }
  return null;
}

/**
 * The grant's entity-type allowlist, enforced at the door a publishing credential comes
 * through. A capability says "may publish"; `entityTypes` says WHAT, and without this the
 * second half of the grant would be decorative. The WHOLE bundle is refused rather than
 * filtered down to the allowed types, matching `grant.ts`'s own refuse-never-repair stance:
 * a source that sent a type it may not send has a wrong idea of what it is allowed to do,
 * and quietly dropping part of its bundle would leave it believing the publish succeeded
 * in full. An empty `entityTypes` allows nothing, which is the correct reading of a
 * permission nobody stated.
 * @complexity O(n · t) in entities and granted types.
 */
function grantRefusal(publishTrust: PublishTrustContext | null, entities: readonly ValidatedBundleEntity[]): RouteRefusal | null {
  if (entities.some(({ entityType }) => isBackstopEntityType({ entityType }) && !backstopGrantAllows({ grant: publishTrust, entityType }))) {
    return { status: 403, body: { error: "Send by hand requires the destination's backstop grant and raw entity type.",
      code: "FORBIDDEN", details: { permission: "publish_content.backstop", reason: "backstop_not_granted" } } };
  }
  // `validated.entities` is `unknown[]` on purpose (see `validateBundleBody`), so an entry
  // that does not declare a string `entityType` is refused rather than skipped: skipping it
  // would let `{}` walk straight past the allowlist and reach `planImport` unchecked.
  // `findIndex`, not `find`, because `find` reports a match by returning the element: a
  // matching `undefined` entry would be indistinguishable from "no match". Not reachable
  // over this route today — JSON has no `undefined`, so a parsed body cannot produce one,
  // and a deliberate break confirmed the tests below do not distinguish the two spellings.
  // Kept because it costs nothing and the next caller may not arrive through JSON.
  // Now structural instead: `validateBundleBody` types every entry as an object with a
  // non-empty string `entityType` and refuses anything else as a 400 before this runs, so an
  // entry with no declared type can no longer reach the allowlist at all, and `some` over the
  // declared types replaces the `findIndex` guard.
  if (publishTrust && entities.some(({ entityType }) => !publishTrust.entityTypes.includes(entityType))) {
    return {
      status: 403,
      body: {
        error: "this bundle carries an entity type outside the publishing grant",
        code: "FORBIDDEN",
        details: { permission: "publish_content.apply", reason: "entity_type_not_granted" },
      },
    };
  }
  return null;
}

/**
 * A manual send (raw rows/files): its send details must read, its confirmed address must be this
 * destination, and the audit storage must be installed. `null` for a bundle with no raw entity.
 * @complexity O(n) in entities, plus one audit-table probe.
 */
async function backstopRefusal(host: string | undefined, deps: PublishContentRouteDeps, entities: readonly ValidatedBundleEntity[]): Promise<RouteRefusal | null> {
  let metadata: BackstopMetadata | null;
  try {
    // Envelope validation leaves entity fields opaque; the planner checks their full
    // shape before any writes. This read validates only the manual-send metadata.
    metadata = readBackstopMetadata({ entities: entities as unknown as PackedEntity[] });
  } catch (error) {
    return { status: 400, body: { error: (error as Error).message } };
  }
  if (metadata === null) return null;
  if (metadata.destinationHost !== host) return { status: 400, body: { error: "The confirmed live address does not match this destination." } };
  if (!(await buildPublishBackstopPorts(deps).audit?.ready())) {
    return { status: 503, body: { error: "Send by hand needs its audit storage installed before it can send anything.", code: "BACKSTOP_NOT_INSTALLED" } };
  }
  return null;
}

export const registerPublishContentBundleCreateRoute: PublishContentRouteRegistrar = (app, deps) => {
  app.post(
    "/api/admin/v1/workspaces/:workspaceId/publish-content/bundles",
    rejectOversizedJsonBody({ maxBytes: PUBLISH_CONTENT_BUNDLE_MAX_BODY_BYTES }),
    async (req, res) => {
      if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;

      try {
        const principalId = await authorizedPrincipalId(res, deps, "publish_content.apply");
        if (principalId === null) return;

        const validated = validateBundleBody(req.body);
        if ("error" in validated) {
          res.status(400).json({ error: validated.error });
          return;
        }

        const refusal =
          schemaVersionRefusal(deps, validated.entities) ??
          grantRefusal(getPublishTrustContext(res), validated.entities) ??
          (await backstopRefusal(req.get("host"), deps, validated.entities));
        if (refusal) {
          sendRefusal(res, refusal);
          return;
        }

        const { bundleId, expiresAt } = await stageBundle(
          {
            workspaceId: deps.workspaceId,
            sourcePrincipalId: principalId,
            artifactFormatVersion: validated.artifactFormatVersion,
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
