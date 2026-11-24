import {
  backstopGapsRoute, backstopRunRoute, backstopSendRoute, backstopStatusRoute, backstopUndoRoute,
  type BackstopActorDeps, type BackstopPlanOutcome, type BackstopRefusalFn, type BackstopTarget, type BackstopUndo,
} from "@jini-ai/cms/admin-http/routes/publish-content/backstop";
import { CONTENT_HASH_VERSION } from "@jini-ai/cms/publish/content/content-hash";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "@jini-ai/cms/publish/transfer";
import type { BackstopAuditPort, BackstopAuditRecord, BackstopInverse, BackstopPorts, RawFilePort } from "@jini-ai/cms/publish/transfer";
import { nowIso } from "@jini-ai/core/primitives";
import { computeBlobStorageKey } from "#src/features/media/index";
import { BackstopRefusal } from "@jini-ai/cms/publish/content/backstop-refusal";
import { BACKSTOP_FORBIDDEN, mayUseBackstop, readBackstopMetadata, runAuditedBackstop, validateBackstopRequest } from "#src/features/publish-content/backstop-service";
import { createCompositePeerBlobSource } from "@jini-ai/cms/publish/content/composite-blob-source";
import { resolvePublishDestinationCredential } from "#src/features/publish-content/destination-credential";
import { confirmPeerImport, executePeerImport, pushBundleToPeer, type PeerCallDeps } from "#src/features/publish-content/peer-transport";
import { entityKey } from "@jini-ai/cms/publish/content/plan-rows";
import { contributeRawFilePublish, undoRawFile } from "#src/features/publish-content/raw-file-contributor";
import { contributeRawRowPublish, undoRawRow } from "#src/features/publish-content/raw-row-contributor";
import type { PackedEntity, PublishContentDeps, SkippedPackEntity } from "#src/features/publish-content/type-registry";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { toPublishContentDeps, type PublishContentRouteDeps, type PublishContentRouteRegistrar } from "#src/server/inbound/admin-http/routes/publish-content/deps";
import { knownPeerActionRefusal } from "#src/server/inbound/admin-http/routes/publish-content/peer-transport";

/**
 * @file K1 (w3 C3d): send by hand (`backstop/status`, `runs/:runId/backstop`, `backstop`,
 * `backstop/gaps`, `runs/:runId/undo-backstop`) as Jini route specs
 * (`@jini-ai/cms/admin-http/routes/publish-content/backstop`) behind the admin ports. Who may send by
 * hand, the audit storage, the raw row/file contributors, the peer transport and the undo transaction
 * stay here and reach the specs as functions; the session-only gate is the mount's `sessionCredentialOnly`.
 */

/** Whether `actorId` may send by hand: the `publish.backstop` permission AND the owner or a
 *  built-in admin/owner role. @complexity O(r) role reads. */
async function mayActorUseBackstop({ deps, actorId }: { deps: PublishContentRouteDeps; actorId: string }, _options: Record<string, never> = {}): Promise<boolean> {
  const allowed = await deps.authorize({ principalId: actorId, permission: "publish.backstop", workspaceId: deps.workspaceId });
  return allowed.allowed && mayUseBackstop({ actorId, ownerId: await deps.ownerPrincipalId, roles: { list: async () => {
    const links = await deps.principalRoleRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId: actorId });
    const roles = await Promise.all(links.map((link) => deps.roleRepo.findById({ workspaceId: deps.workspaceId, id: link.roleId })));
    return roles.filter((role): role is NonNullable<typeof role> => role !== null);
  } } });
}

/** The audit port when its storage is installed, else `null`. @complexity O(1) plus one probe. */
async function readyAudit({ audit }: { audit: BackstopAuditPort | undefined }, _options: Record<string, never> = {}): Promise<BackstopAuditPort | null> {
  return audit && (await audit.ready()) ? audit : null;
}

/** The per-call transport bag for this run's peer, with its backstop-scoped credential. */
async function openBackstopPeer({ deps, peerId }: { deps: PublishContentRouteDeps; peerId: string }, _options: Record<string, never> = {}): Promise<PeerCallDeps> {
  return { httpClient: deps.publishContentPeerHttpClient,
    publishHistory: { store: deps.publishHistoryStore, workspaceId: deps.workspaceId, clock: deps.clock }, credential: await resolvePublishDestinationCredential({ deps: {
    repo: deps.publishContentPeerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, httpClient: deps.publishContentPeerHttpClient,
  }, input: { workspaceId: deps.workspaceId, id: peerId, backstop: true } }) };
}

/** `send`: confirms and executes the plan a previous `plan` call recorded. */
async function redeemPlan({ deps, target, audit, log }: { deps: PublishContentRouteDeps; target: BackstopTarget; audit: BackstopAuditPort; log: BackstopAuditRecord }, _options: Record<string, never> = {}) {
  return runAuditedBackstop({ audit, record: log, work: async () => {
    const peer = await openBackstopPeer({ deps, peerId: target.peerId });
    const plan = log.details.plan as Record<string, unknown>;
    const confirmation = await confirmPeerImport({ deps: peer, required: { planId: String(plan.planId), planHash: String(plan.planHash) } });
    return executePeerImport({
      deps: peer,
      required: { bundleId: String(log.details.bundleId), confirmationToken: confirmation.confirmationToken,
        overwriteEntityKeys: log.details.overwriteEntityKeys as string[] | undefined },
    });
  } });
}

/** Packs the selected raw rows and files, and what each contributor had to skip. */
async function packSelection({ projection, backstop }: { projection: PublishContentDeps; backstop: BackstopPorts }, _options: Record<string, never> = {}): Promise<{ entities: PackedEntity[]; skipped: SkippedPackEntity[] }> {
  const entities: PackedEntity[] = [];
  const skipped: SkippedPackEntity[] = [];
  for (const contributor of [contributeRawRowPublish(), contributeRawFilePublish()]) {
    const handler = contributor.build({ ...projection, backstop });
    for await (const entity of handler.pack()) entities.push(entity);
    if (!handler.listSkipped) throw new Error("backstop contributor has no skipped-items listing");
    skipped.push(...await handler.listSkipped());
  }
  return { entities, skipped };
}

/** `overwriteEntityKeys` may only name items this plan selected. @complexity O(k) in the keys. */
function overwriteKeysAreSelected(overwriteEntityKeys: unknown, entities: readonly PackedEntity[]): overwriteEntityKeys is string[] | undefined {
  if (overwriteEntityKeys === undefined) return true;
  const keys = new Set(entities.map((entity) => entityKey({ entityType: entity.entityType, entityId: entity.id })));
  return Array.isArray(overwriteEntityKeys) && overwriteEntityKeys.every((key) => typeof key === "string" && keys.has(key));
}

/** One `plan` request: the readied audit (kept as the run's audit port) and the checked target. */
interface PlanRequest { deps: PublishContentRouteDeps; actorId: string; target: BackstopTarget; audit: BackstopAuditPort; overwriteEntityKeys: unknown }

/** `plan`: packs the selection, pushes it to the peer as a staged bundle, and records the
 *  peer's plan as this actor's `planned` source log for `send` to redeem. */
async function planSelection({ deps, actorId, target, audit, overwriteEntityKeys }: PlanRequest, _options: Record<string, never> = {}): Promise<BackstopPlanOutcome> {
  const projection = toPublishContentDeps(deps);
  if (!projection.backstop) throw new Error("backstop plan has no audit storage");
  const { entities, skipped } = await packSelection({ projection, backstop: { ...projection.backstop, audit, selection: target.request.selection } });
  if (entities.length === 0) return { value: { entities: [], skipped, logId: null } };
  const metadata = { mode: "backstop" as const, reason: target.request.reason, sourceActor: actorId, destinationHost: target.host, gapLabels: [] };
  const carrying = entities.map((entity) => ({ ...entity, backstop: metadata }));
  const verifiedMetadata = readBackstopMetadata({ entities: carrying });
  if (!verifiedMetadata) throw new Error("backstop plan has no verified metadata");
  const auditedEntities = entities.map((entity) => ({ ...entity, backstop: verifiedMetadata }));
  if (!overwriteKeysAreSelected(overwriteEntityKeys, entities)) return { overwriteNotSelected: true };
  const overwrite = overwriteEntityKeys === undefined ? {} : { overwriteEntityKeys };
  const record: BackstopAuditRecord = { id: deps.idGen.newId(), workspaceId: deps.workspaceId, direction: "source", actorId,
    destination: target.destination.baseUrl, reason: target.request.reason, at: nowIso({ clock: deps.clock }), gapLabels: verifiedMetadata.gapLabels,
    items: entities.map((e) => ({ entityType: e.entityType, id: e.id, afterHash: e.contentHash })), result: "pending", runId: null, details: {}, inverses: [] };
  const result = await runAuditedBackstop({ audit, record, successResult: "planned", work: async () => {
    const peer = await openBackstopPeer({ deps, peerId: target.peerId });
    const pushed = await pushBundleToPeer({
      deps: { ...peer, blobSource: createCompositePeerBlobSource({ blobStore: deps.blobStore, fileBlobIndex: deps.fileBlobIndex }),
        computeStorageKey: ({ sha256 }: { sha256: string }, _options: Record<string, never> = {}) => computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256 }) },
      required: {
        bundle: { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION,
          sourceLabel: deps.workspaceId, entities: auditedEntities, blobManifest: [...new Set(entities.flatMap((e) => e.requiredBlobs))], skipped },
        ...overwrite,
      },
    });
    if (pushed.notSupportedByLive.length > 0) throw new BackstopRefusal({ message: "Live can't accept send by hand yet; update live and enable its backstop grant." });
    return { ...pushed, peerId: target.peerId, entities, skipped, ...overwrite };
  } });
  return { value: { ...result, logId: record.id } };
}

/** Undoes one recorded inverse. A restored file's prior bytes are captured first and queued on
 *  `fileRollbacks`, so a later failure in the same transaction can put the file back.
 *  @returns the reason the item was left alone, or `null` once it is undone. */
async function undoInverse(
  { inverse, projection, files, fileRollbacks }: { inverse: BackstopInverse; projection: PublishContentDeps; files: RawFilePort; fileRollbacks: Array<() => Promise<void>> }
): Promise<string | null> {
  if (inverse.kind === "raw-row") return undoRawRow({ deps: projection, ...inverse });
  const beforeUndo = await files.capture({ relPath: inverse.entity.id });
  const reason = await undoRawFile({ deps: projection, ...inverse });
  if (!reason) fileRollbacks.push(() => files.restore({ inverse: beforeUndo }));
  return reason;
}

type ProjectedBackstop = NonNullable<PublishContentDeps["backstop"]>;
type ReadyBackstop = { [Port in "audit" | "rows" | "files"]-?: NonNullable<ProjectedBackstop[Port]> };

/** The audit, row and file ports an undo needs, or null while the audit storage is not installed. */
async function readyUndoBackstop({ backstop }: { backstop: ProjectedBackstop | undefined }, _options: Record<string, never> = {}): Promise<ReadyBackstop | null> {
  const { audit, rows, files } = backstop ?? {};
  if (!audit || !rows || !files || !(await audit.ready())) return null;
  return { audit, rows, files };
}

/** Undoes every inverse newest-first in one row transaction, then restores the files it already
 * touched if anything throws. Returns the reasons for the inverses that were skipped. */
async function undoAllInverses(
  { log, projection, backstop }: { log: BackstopAuditRecord; projection: PublishContentDeps; backstop: ReadyBackstop }, _options: Record<string, never> = {},
): Promise<string[]> {
  const skipped: string[] = [];
  const fileRollbacks: Array<() => Promise<void>> = [];
  try {
    await backstop.rows.transaction({ work: async () => {
      for (const inverse of [...log.inverses].reverse()) {
        const reason = await undoInverse({ inverse, projection, files: backstop.files, fileRollbacks });
        if (reason) skipped.push(reason);
      }
      await backstop.audit.save({ record: { ...log, result: "undone", details: { ...log.details, undoSkipped: skipped } } });
    } });
  } catch (error) {
    for (const rollback of fileRollbacks.reverse()) { await rollback(); }
    throw error;
  }
  return skipped;
}

/** The undo storage, or `null` while the audit storage is not installed. */
async function openUndo({ deps }: { deps: PublishContentRouteDeps }, _options: Record<string, never> = {}): Promise<BackstopUndo | null> {
  const projection = toPublishContentDeps(deps);
  // `files` is always present here: `PublishContentRouteDeps` requires `siteBinding`, which is
  // what `buildPublishBackstopPorts` builds the file port from.
  const backstop = await readyUndoBackstop({ backstop: projection.backstop });
  if (!backstop) return null;
  return { audit: backstop.audit, undoAll: ({ log }) => undoAllInverses({ log, projection, backstop }) };
}

/** A manual-send failure the owner can act on: the refusal's 409, else a peer action's own answer. */
const backstopRefusal: BackstopRefusalFn = ({ error }) =>
  error instanceof BackstopRefusal ? { status: 409, body: { error: error.message } } : knownPeerActionRefusal({ err: error });

/** The ports, the actor gate and the audit storage every backstop spec reads; `authorize` read per request. */
function backstopDeps({ deps }: { deps: PublishContentRouteDeps }, _options: Record<string, never> = {}): BackstopActorDeps & AdminJsonRoutePortDeps & { readyAudit(): Promise<BackstopAuditPort | null> } {
  return {
    workspaceId: deps.workspaceId,
    authorize: (params) => deps.authorize(params),
    forbiddenMessage: BACKSTOP_FORBIDDEN,
    mayUseBackstop: ({ context }) => mayActorUseBackstop({ deps, actorId: context.id }),
    readyAudit: () => readyAudit({ audit: toPublishContentDeps(deps).backstop?.audit }),
  };
}

/** A backstop mount: the hand-written routes asked `deps.authorize` directly (`"direct"`) and answered `failure` for an unexpected error. */
function backstopMount({ failure, sessionOnly = true }: { failure: { operation: string; message: string; code?: string }; sessionOnly?: boolean }): AdminJsonRouteMountOptions {
  return { authorization: "direct", failure, ...(sessionOnly ? { sessionCredentialOnly: { message: BACKSTOP_FORBIDDEN, permission: "publish.backstop" } } : {}) };
}

const READ_FAILURE = { operation: "routes/publish-content/backstop", code: "INTERNAL_ERROR" } as const;
// A send/undo failure answers like a peer action's (`peer-transport.ts`'s `respondWithError`).
const SEND_FAILURE = { operation: "routes/publish-content/route-helpers" } as const;

/** Session-only: neither an API key nor an assistant can perform the manual confirmation. */
export const registerPublishBackstopRoutes: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const base = backstopDeps({ deps });
  mountAdminJsonRoute({ app, spec: backstopStatusRoute, deps: base }, backstopMount({ failure: { ...READ_FAILURE, message: "Manual publishing availability could not be read." } }));
  mountAdminJsonRoute({ app, spec: backstopRunRoute, deps: base }, backstopMount({ failure: { ...READ_FAILURE, message: "This send could not be read." } }));
  const sendDeps = {
    ...base, backstopRefusal,
    findPeer: ({ peerId }: { peerId: string }) => deps.publishContentPeerRepo.findById({ workspaceId: deps.workspaceId, id: peerId }),
    checkRequest: ({ body, destinationHost }: { body: Record<string, unknown>; destinationHost: string }) => validateBackstopRequest({ body, destinationHost }),
    redeemPlan: (input: { target: BackstopTarget; audit: BackstopAuditPort; log: BackstopAuditRecord }) => redeemPlan({ deps, ...input }),
    planSelection: (input: Omit<PlanRequest, "deps">) => planSelection({ deps, ...input }),
  };
  mountAdminJsonRoute({ app, spec: backstopSendRoute, deps: sendDeps }, backstopMount({ failure: { ...SEND_FAILURE, message: "This send could not complete." } }));
  mountAdminJsonRoute({ app, spec: backstopGapsRoute, deps: base }, {
    ...backstopMount({ failure: { ...READ_FAILURE, message: "Publishing history could not be read." }, sessionOnly: false }),
    forbidden: () => ({ status: 403, body: { error: "Publishing history is not available to this account." } }),
  });
  mountAdminJsonRoute({ app, spec: backstopUndoRoute, deps: { ...base, backstopRefusal, openUndo: () => openUndo({ deps }) } },
    backstopMount({ failure: { ...SEND_FAILURE, message: "This send could not be undone." } }));
};
