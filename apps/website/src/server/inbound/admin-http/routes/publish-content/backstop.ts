import type { Request, Response } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { BACKSTOP_FORBIDDEN, mayUseBackstop, validateBackstopRequest, readBackstopMetadata, runAuditedBackstop } from "#src/features/publish-content/backstop-service";
import type { BackstopAuditPort, BackstopAuditRecord, BackstopInverse } from "#src/features/publish-content/backstop-audit";
import type { BackstopPorts, BackstopSelection, RawFilePort } from "#src/features/publish-content/backstop-ports";
import { contributeRawRowPublish, undoRawRow } from "#src/features/publish-content/raw-row-contributor";
import { contributeRawFilePublish, undoRawFile } from "#src/features/publish-content/raw-file-contributor";
import type { PackedEntity, PublishContentDeps, SkippedPackEntity } from "#src/features/publish-content/type-registry";
import { CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import { entityKey } from "#src/features/publish-content/planner";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import { createCompositePeerBlobSource } from "#src/features/publish-content/composite-blob-source";
import { computeBlobStorageKey } from "#src/features/media/index";
import { resolvePublishDestinationCredential } from "#src/features/publish-content/destination-credential";
import { pushBundleToPeer, confirmPeerImport, executePeerImport, type PeerCallDeps } from "#src/features/publish-content/peer-transport";
import type { PublishContentPeerRecord } from "#src/features/publish-content/peers";
import { toPublishContentDeps, type PublishContentRouteDeps, type PublishContentRouteRegistrar } from "./deps.js";
import { bodyRecord, rejectForeignWorkspace, sendRefusal, type RouteRefusal } from "./route-helpers.js";

/** Whether `actorId` may send by hand: the `publish.backstop` permission AND the owner or a
 *  built-in admin/owner role. @complexity O(r) role reads. */
async function mayActorUseBackstop(deps: PublishContentRouteDeps, actorId: string): Promise<boolean> {
  const allowed = await deps.authorize({ principalId: actorId, permission: "publish.backstop", workspaceId: deps.workspaceId });
  return allowed.allowed && mayUseBackstop({ actorId, ownerId: await deps.ownerPrincipalId, roles: { list: async () => {
    const links = await deps.principalRoleRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId: actorId });
    const roles = await Promise.all(links.map((link) => deps.roleRepo.findById({ workspaceId: deps.workspaceId, id: link.roleId })));
    return roles.filter((role): role is NonNullable<typeof role> => role !== null);
  } } });
}

/** Session-only: neither an API key nor an assistant can perform the manual confirmation.
 *  @returns the actor id, or `null` once the 403 has been sent. */
async function backstopActorId(res: Response, deps: PublishContentRouteDeps): Promise<string | null> {
  if (!rejectUnlessSessionCredential(res, { message: BACKSTOP_FORBIDDEN, permission: "publish.backstop" })) return null;
  const id = getAuthedPrincipal(res).id;
  if (await mayActorUseBackstop(deps, id)) return id;
  res.status(403).json({ error: BACKSTOP_FORBIDDEN, code: "FORBIDDEN" });
  return null;
}

/** The audit port when its storage is installed, else `null`. @complexity O(1) plus one probe. */
async function readyAudit(audit: BackstopAuditPort | undefined): Promise<BackstopAuditPort | null> {
  return audit && (await audit.ready()) ? audit : null;
}

/** A destination-side run can be undone after a success, or after a failure that recorded inverses. */
function hasUndo(log: BackstopAuditRecord): boolean {
  return log.result === "success" || (log.result === "failure" && log.inverses.length > 0);
}

/** The checked request a send/plan acts on. */
interface BackstopTarget {
  peerId: string;
  destination: PublishContentPeerRecord;
  host: string;
  request: { reason: string; typedHost: string; selection: BackstopSelection };
}

/** Reads the peer, its live address and the operator's confirmation off a send/plan body.
 *  @complexity O(n) in the selected rows/files, plus one peer read. */
async function readBackstopTarget(body: Record<string, unknown>, deps: PublishContentRouteDeps): Promise<BackstopTarget | RouteRefusal> {
  const peerId = body.peerId;
  if (typeof peerId !== "string") return { status: 400, body: { error: "Choose a connected live site.", code: "VALIDATION_ERROR" } };
  const destination = await deps.publishContentPeerRepo.findById({ workspaceId: deps.workspaceId, id: peerId });
  if (!destination) return { status: 404, body: { error: "The connected live site was not found." } };
  const host = new URL(destination.baseUrl).host;
  // Checking is not the human confirmation. A supplied wrong host still fails, but the UI
  // leaves this field empty until the operator has seen the plan. Send always requires it.
  const checked = validateBackstopRequest({ body: body.action === "plan" && body.typedHost === undefined
    ? { ...body, typedHost: host } : body, destinationHost: host });
  if ("error" in checked) return { status: 400, body: { error: checked.error, code: "VALIDATION_ERROR" } };
  return { peerId, destination, host, request: checked.request };
}

/** Everything one send/plan request carries once its target is checked and audit is ready. */
interface BackstopRun {
  deps: PublishContentRouteDeps;
  actorId: string;
  target: BackstopTarget;
  audit: BackstopAuditPort;
  projection: PublishContentDeps;
  backstop: BackstopPorts;
}

/** The per-call transport bag for this run's peer, with its backstop-scoped credential. */
async function openBackstopPeer(deps: PublishContentRouteDeps, peerId: string): Promise<PeerCallDeps> {
  return { httpClient: deps.publishContentPeerHttpClient,
    publishHistory: { store: deps.publishHistoryStore, workspaceId: deps.workspaceId, clock: deps.clock }, credential: await resolvePublishDestinationCredential({ deps: {
    repo: deps.publishContentPeerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, httpClient: deps.publishContentPeerHttpClient,
  }, input: { workspaceId: deps.workspaceId, id: peerId, backstop: true } }) };
}

/** The checked plan `send` redeems: this actor's own `planned` source log for the same
 *  destination, reason and peer. Anything else must be checked again. */
function isSendablePlan(log: BackstopAuditRecord | null, run: BackstopRun): log is BackstopAuditRecord {
  return log !== null && log.direction === "source" && log.actorId === run.actorId && log.destination === run.target.destination.baseUrl &&
    log.result === "planned" && log.reason === run.target.request.reason && log.details.peerId === run.target.peerId;
}

/** `send`: confirms and executes the plan a previous `plan` call recorded. */
async function sendCheckedPlan(res: Response, run: BackstopRun, logId: unknown): Promise<void> {
  const { deps, audit } = run;
  const log = typeof logId === "string" ? await audit.get({ workspaceId: deps.workspaceId, id: logId }) : null;
  if (!isSendablePlan(log, run)) {
    res.status(409).json({ error: "Check what would change again before sending." }); return;
  }
  const result = await runAuditedBackstop({ audit, record: log, work: async () => {
    const peer = await openBackstopPeer(deps, run.target.peerId);
    const plan = log.details.plan as Record<string, unknown>;
    const confirmation = await confirmPeerImport(peer, { planId: String(plan.planId), planHash: String(plan.planHash) });
    return executePeerImport(peer, { bundleId: String(log.details.bundleId), confirmationToken: confirmation.confirmationToken,
      overwriteEntityKeys: log.details.overwriteEntityKeys as string[] | undefined });
  } });
  res.json({ ...result, logId: log.id, destination: run.target.destination.baseUrl });
}

/** Packs the selected raw rows and files, and what each contributor had to skip. */
async function packSelection(run: BackstopRun): Promise<{ entities: PackedEntity[]; skipped: SkippedPackEntity[] }> {
  const entities: PackedEntity[] = [];
  const skipped: SkippedPackEntity[] = [];
  for (const contributor of [contributeRawRowPublish(), contributeRawFilePublish()]) {
    const handler = contributor.build({ ...run.projection, backstop: run.backstop });
    for await (const entity of handler.pack()) entities.push(entity);
    skipped.push(...await handler.listSkipped!());
  }
  return { entities, skipped };
}

/** `overwriteEntityKeys` may only name items this plan selected. @complexity O(k) in the keys. */
function overwriteKeysAreSelected(overwriteEntityKeys: unknown, entities: readonly PackedEntity[]): overwriteEntityKeys is string[] | undefined {
  if (overwriteEntityKeys === undefined) return true;
  const keys = new Set(entities.map((entity) => entityKey(entity.entityType, entity.id)));
  return Array.isArray(overwriteEntityKeys) && overwriteEntityKeys.every((key) => typeof key === "string" && keys.has(key));
}

/** `plan`: packs the selection, pushes it to the peer as a staged bundle, and records the
 *  peer's plan as this actor's `planned` source log for `send` to redeem. */
async function planSelection(res: Response, run: BackstopRun, overwriteEntityKeys: unknown): Promise<void> {
  const { deps, actorId, target, audit } = run;
  const { entities, skipped } = await packSelection(run);
  if (entities.length === 0) { res.json({ entities: [], skipped, logId: null }); return; }
  const metadata = { mode: "backstop" as const, reason: target.request.reason, sourceActor: actorId, destinationHost: target.host, gapLabels: [] };
  const carrying = entities.map((entity) => ({ ...entity, backstop: metadata }));
  const verifiedMetadata = readBackstopMetadata({ entities: carrying })!;
  const auditedEntities = entities.map((entity) => ({ ...entity, backstop: verifiedMetadata }));
  if (!overwriteKeysAreSelected(overwriteEntityKeys, entities)) {
    res.status(400).json({ error: "Only selected items can be overwritten.", code: "VALIDATION_ERROR" }); return;
  }
  const overwrite = overwriteEntityKeys === undefined ? {} : { overwriteEntityKeys };
  const record: BackstopAuditRecord = { id: deps.idGen.newId(), workspaceId: deps.workspaceId, direction: "source", actorId,
    destination: target.destination.baseUrl, reason: target.request.reason, at: nowIso({ clock: deps.clock }), gapLabels: verifiedMetadata.gapLabels,
    items: entities.map((e) => ({ entityType: e.entityType, id: e.id, afterHash: e.contentHash })), result: "pending", runId: null, details: {}, inverses: [] };
  const result = await runAuditedBackstop({ audit, record, successResult: "planned", work: async () => {
    const peer = await openBackstopPeer(deps, target.peerId);
    const pushed = await pushBundleToPeer({ ...peer, blobSource: createCompositePeerBlobSource({ blobStore: deps.blobStore, fileBlobIndex: deps.fileBlobIndex }),
      computeStorageKey: (sha256) => computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256 }) }, {
      bundle: { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION,
        sourceLabel: deps.workspaceId, entities: auditedEntities, blobManifest: [...new Set(entities.flatMap((e) => e.requiredBlobs))], skipped },
      ...overwrite,
    });
    if (pushed.notSupportedByLive.length > 0) throw new Error("Live can't accept send by hand yet; update live and enable its backstop grant.");
    return { ...pushed, peerId: target.peerId, entities, skipped, ...overwrite };
  } });
  res.json({ ...result, logId: record.id });
}

/** `POST .../backstop`: the source side of send by hand (`plan`, then `send`). */
async function handleBackstopRequest(req: Request, res: Response, deps: PublishContentRouteDeps): Promise<void> {
  const actorId = await backstopActorId(res, deps); if (!actorId) return;
  const body = bodyRecord(req.body);
  const target = await readBackstopTarget(body, deps);
  if ("status" in target) { sendRefusal(res, target); return; }
  const projection = toPublishContentDeps(deps);
  const backstop = { ...projection.backstop!, selection: target.request.selection };
  const audit = await readyAudit(backstop.audit);
  if (!audit) { res.status(503).json({ error: "Send by hand needs its audit storage installed before it can send anything.", code: "BACKSTOP_NOT_INSTALLED" }); return; }
  const run: BackstopRun = { deps, actorId, target, audit, projection, backstop };
  if (body.action === "send") { await sendCheckedPlan(res, run, body.logId); return; }
  if (body.action !== "plan") { res.status(400).json({ error: "Choose Check what would change or Send to live." }); return; }
  await planSelection(res, run, body.overwriteEntityKeys);
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

/** `POST .../runs/:runId/undo-backstop`: the destination side's one-click undo. */
async function handleUndoRequest(req: Request, res: Response, deps: PublishContentRouteDeps): Promise<void> {
  if (!(await backstopActorId(res, deps))) return;
  const projection = toPublishContentDeps(deps);
  // `files` is always present here: `PublishContentRouteDeps` requires `siteBinding`, which is
  // what `buildPublishBackstopPorts` builds the file port from.
  const { audit, rows, files } = projection.backstop!;
  if (!audit || !rows || !(await audit.ready())) { res.status(503).json({ error: "Send by hand needs its audit storage installed." }); return; }
  const log = await audit.get({ workspaceId: deps.workspaceId, id: String(req.params.runId) });
  if (!log || log.direction !== "destination" || !hasUndo(log)) { res.status(404).json({ error: "This send has no undo available." }); return; }
  const skipped: string[] = [];
  const fileRollbacks: Array<() => Promise<void>> = [];
  try {
    await rows.transaction({ work: async () => {
      for (const inverse of [...log.inverses].reverse()) {
        const reason = await undoInverse({ inverse, projection, files: files!, fileRollbacks });
        if (reason) skipped.push(reason);
      }
      await audit.save({ record: { ...log, result: "undone", details: { ...log.details, undoSkipped: skipped } } });
    } });
  } catch (error) { for (const rollback of fileRollbacks.reverse()) await rollback(); throw error; }
  res.json({ runId: log.runId, undone: log.inverses.length - skipped.length, skipped });
}

/** Session-only: neither an API key nor an assistant can perform the manual confirmation. */
export const registerPublishBackstopRoutes: PublishContentRouteRegistrar = (app, deps) => {
  const base = "/api/admin/v1/workspaces/:workspaceId/publish-content";
  app.get(`${base}/backstop/status`, async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      if (!(await backstopActorId(res, deps))) return;
      const audit = await readyAudit(toPublishContentDeps(deps).backstop?.audit);
      res.json({ allowed: true, installed: audit !== null });
    } catch { res.status(500).json({ error: "Manual publishing availability could not be read." }); }
  });
  app.get(`${base}/runs/:runId/backstop`, async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      if (!(await backstopActorId(res, deps))) return;
      const audit = await readyAudit(toPublishContentDeps(deps).backstop?.audit);
      if (!audit) { res.status(503).json({ error: "Send by hand needs its audit storage installed.", code: "BACKSTOP_NOT_INSTALLED" }); return; }
      const log = await audit.get({ workspaceId: deps.workspaceId, id: String(req.params.runId) });
      if (!log || log.direction !== "destination") { res.status(404).json({ error: "This send was not found on this site." }); return; }
      res.json({ runId: log.runId, reason: log.reason, items: log.items.map(({ entityType, id }) => ({ entityType, id })), canUndo: hasUndo(log) });
    } catch { res.status(500).json({ error: "This send could not be read." }); }
  });
  app.post(`${base}/backstop`, async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      await handleBackstopRequest(req, res, deps);
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "This send could not complete." }); }
  });

  app.get(`${base}/backstop/gaps`, async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      const principal = getAuthedPrincipal(res);
      const allowed = await deps.authorize({ principalId: principal.id, permission: "publish_content.read", workspaceId: deps.workspaceId });
      if (!allowed.allowed) { res.status(403).json({ error: "Publishing history is not available to this account." }); return; }
      const audit = await readyAudit(toPublishContentDeps(deps).backstop?.audit);
      res.json({ gaps: audit ? await audit.gaps({ workspaceId: deps.workspaceId }) : [] });
    } catch { res.status(500).json({ error: "Publishing history could not be read." }); }
  });

  app.post(`${base}/runs/:runId/undo-backstop`, async (req, res) => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return;
    try {
      await handleUndoRequest(req, res, deps);
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "This send could not be undone." }); }
  });
};
