import { CONTENT_HASH_VERSION } from "./content-hash.js";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "./artifact-format.js";
import { entityKey } from "./planner.js";
import {
  buildPublishContentCatalog,
  type PackedEntity,
  type PublishContentDeps,
  type PublishContentHandler,
  type SkippedPackEntity,
} from "./type-registry.js";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * The ONE place the export side's "which types may this principal export, and what do they pack"
 * loop lives. Extracted from `routes/publish-content/export.ts` (Task 4) when Task 10's outbound
 * PUSH driver needed the same bundle in memory rather than streamed down a response: two copies of
 * this loop would be two places the per-type permission gate could drift, and that gate is the
 * property plan §3 rule 5 / §5 risk #8 rest on.
 *
 * The two callers differ only in what they do with the entities, which is why the generator is the
 * shared piece and the envelope assembly is not:
 * - `export.ts` streams `packAuthorizedEntities()` straight into the response body, one entity at a
 *   time, so memory stays bounded by one entity regardless of corpus size.
 * - {@link buildExportBundle} accumulates the same generator into an in-memory envelope, because a
 *   push has to hand the whole bundle to `HttpClientPort.send` as one request body. That is a real
 *   memory difference and a disclosed one: a push is bounded by the corpus, a browser download is
 *   not.
 */

/** The narrow authorize seam this module needs — structurally identical to `RouteDeps.authorize`,
 *  declared locally so `features/` never has to import the server's route-deps type. */
export type PublishContentAuthorize = (input: {
  principalId: string;
  permission: string;
  workspaceId: string;
}) => Promise<{ allowed: boolean }>;

export interface PackAuthorizedEntitiesDeps {
  readonly workspaceId: string;
  readonly principalId: string;
  readonly authorize: PublishContentAuthorize;
  readonly publishContentDeps: PublishContentDeps;
}

/**
 * Every entity this principal is allowed to export, across every registered type.
 *
 * `buildPublishContentCatalog()` reads and validates the registry FRESH on every call, never caches
 * it — a contributor registered after an earlier call is visible to the next one.
 *
 * A per-type authorization denial OMITS that type and continues; it is never an error. A principal
 * holding `publish_content.read` but not a given type's own write permission gets a bundle without
 * that type, never a failure — see `export.ts`'s "Two DIFFERENT permission checks" header.
 *
 * @complexity O(t + e) — one `authorize()` call per registered type `t`, then one yield per entity
 * `e` the allowed types pack. Memory is O(1) in the corpus: entities are yielded, never collected.
 */
export async function* packAuthorizedEntities(deps: PackAuthorizedEntitiesDeps): AsyncGenerator<PackedEntity> {
  for (const handler of buildPublishContentCatalog(deps.publishContentDeps).handlers) {
    const typeAuth = await deps.authorize({
      principalId: deps.principalId,
      permission: handler.permission,
      workspaceId: deps.workspaceId,
    });
    if (!typeAuth.allowed) continue;

    for await (const entity of handler.pack()) {
      if (entity.entityType !== handler.entityType || entity.schemaVersion !== handler.schemaVersion) {
        throw new Error(
          `publish-content handler '${handler.entityType}' packed incompatible entity metadata ` +
            `(entityType '${entity.entityType}', schema version ${entity.schemaVersion}; expected ` +
            `'${handler.entityType}' version ${handler.schemaVersion})`
        );
      }
      yield entity;
    }
  }
}

/** The export envelope, exactly as `GET .../publish-content/export` serializes it and exactly as
 *  `POST .../publish-content/bundles` accepts it — one shape, so a push never has to reshape what a
 *  pull would have received. */
export interface PublishContentExportEnvelope {
  readonly artifactFormatVersion: number;
  readonly hashVersion: number;
  readonly sourceLabel: string;
  readonly entities: readonly PackedEntity[];
  /** De-duplicated union of every packed entity's `requiredBlobs`, in first-seen order. */
  readonly blobManifest: readonly string[];
  /** Every whole unit an authorized handler found but refused to pack (`SkippedPackEntity`, e.g. a
   *  theme tree `file-tree-policy.ts` blocked) — collected by {@link collectSkippedEntities}. Never
   *  narrowed by {@link selectBundleEntities}: a skipped unit was never selectable in the first
   *  place, so an operator's row selection has nothing to say about it. */
  readonly skipped: readonly SkippedPackEntity[];
}

/**
 * Every whole unit an authorized handler refused to pack, across every registered type — the
 * `listSkipped()` counterpart to {@link packAuthorizedEntities}'s `pack()` loop, kept as its own
 * function (rather than folded into that generator) because a skip is collected EAGERLY per handler
 * (one `listSkipped()` call), not streamed per entity the way packed entities are.
 *
 * Takes an already-resolved `handlers` list, not a `PublishContentDeps` bag, so this stays testable
 * without the real registered-contributor graph — {@link buildExportBundle} is what resolves the
 * catalog and passes its `handlers` through, exactly as `packAuthorizedEntities` does for its own
 * loop.
 *
 * The SAME per-type authorization gate as `packAuthorizedEntities`: a principal not authorized for a
 * type never learns that type refused something, for the identical reason that principal never sees
 * that type's entities either.
 *
 * @complexity O(t) `authorize()` calls plus one `listSkipped()` call per authorized handler that has
 * one.
 */
export async function collectSkippedEntities(input: {
  readonly handlers: readonly PublishContentHandler[];
  readonly authorize: PublishContentAuthorize;
  readonly workspaceId: string;
  readonly principalId: string;
}): Promise<readonly SkippedPackEntity[]> {
  const skipped: SkippedPackEntity[] = [];
  for (const handler of input.handlers) {
    if (!handler.listSkipped) continue;
    const typeAuth = await input.authorize({
      principalId: input.principalId,
      permission: handler.permission,
      workspaceId: input.workspaceId,
    });
    if (!typeAuth.allowed) continue;
    skipped.push(...(await handler.listSkipped()));
  }
  return skipped;
}

/**
 * Narrows an already-built envelope to the entities the operator actually chose, by
 * `planner.ts`'s own {@link entityKey} string.
 *
 * This is where "deselect a row" becomes real, and it is deliberately HERE rather than at apply
 * time: the destination never receives a deselected entity at all, so no downstream code path —
 * not the peer's planner, not its apply loop, not a peer running an older build that has never
 * heard of a selection — has to remember to skip it. Exclusion by construction, the same property
 * `ui/report-rows.ts`'s header states for a skipped row.
 *
 * `blobManifest` is recomputed from the surviving entities rather than carried over, so a push of
 * two selected posts does not upload the bytes of forty deselected images.
 *
 * An empty `selectedKeys` set returns an EMPTY bundle, not the whole corpus: "the operator selected
 * nothing" and "the operator expressed no preference" are different states, and the caller (never
 * this function) is what decides which one it has — `push/plan` only calls this when a selection
 * was actually sent.
 *
 * @complexity O(e) time in the envelope's entity count, O(e) space for the narrowed copy.
 */
export function selectBundleEntities(
  envelope: PublishContentExportEnvelope,
  selectedKeys: ReadonlySet<string>
): PublishContentExportEnvelope {
  const entities = envelope.entities.filter((entity) => selectedKeys.has(entityKey(entity.entityType, entity.id)));
  const requiredBlobs = new Set<string>();
  for (const entity of entities) for (const sha of entity.requiredBlobs) requiredBlobs.add(sha);
  return { ...envelope, entities, blobManifest: Array.from(requiredBlobs) };
}

/**
 * Accumulates {@link packAuthorizedEntities} into a complete in-memory envelope, for the push
 * driver. See this file's header for why the streaming caller does NOT use this.
 *
 * @complexity O(t + e) time; O(e) MEMORY — the whole corpus is held at once. Deliberate and
 * disclosed: an HTTP request body cannot be produced lazily through `HttpClientPort`.
 */
export async function buildExportBundle(
  deps: PackAuthorizedEntitiesDeps & { sourceLabel: string }
): Promise<PublishContentExportEnvelope> {
  const entities: PackedEntity[] = [];
  const requiredBlobs = new Set<string>();
  for await (const entity of packAuthorizedEntities(deps)) {
    entities.push(entity);
    for (const sha of entity.requiredBlobs) requiredBlobs.add(sha);
  }
  // A second, fresh catalog read (rule 2, this file's header) — cheap (small handler count) and
  // kept separate from the `pack()` loop above rather than sharing one catalog build, since a skip
  // is collected eagerly per handler while packed entities stream per entity.
  const { handlers } = buildPublishContentCatalog(deps.publishContentDeps);
  const skipped = await collectSkippedEntities({
    handlers,
    authorize: deps.authorize,
    workspaceId: deps.workspaceId,
    principalId: deps.principalId,
  });
  return {
    artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
    hashVersion: CONTENT_HASH_VERSION,
    sourceLabel: deps.sourceLabel,
    entities,
    blobManifest: Array.from(requiredBlobs),
    skipped,
  };
}
