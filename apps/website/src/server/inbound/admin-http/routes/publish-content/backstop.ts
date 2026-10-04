import type { Response } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { BACKSTOP_FORBIDDEN, mayUseBackstop, validateBackstopRequest, readBackstopMetadata, runAuditedBackstop } from "#src/features/publish-content/backstop-service";
import type { BackstopAuditRecord } from "#src/features/publish-content/backstop-audit";
import { contributeRawRowPublish, undoRawRow } from "#src/features/publish-content/raw-row-contributor";
import { contributeRawFilePublish, undoRawFile } from "#src/features/publish-content/raw-file-contributor";
import type { PackedEntity, SkippedPackEntity } from "#src/features/publish-content/type-registry";
import { CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import { entityKey } from "#src/features/publish-content/planner";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import { createCompositePeerBlobSource } from "#src/features/publish-content/composite-blob-source";
import { computeBlobStorageKey } from "#src/features/media/index";
import { resolvePublishDestinationCredential } from "#src/features/publish-content/destination-credential";
import { pushBundleToPeer, confirmPeerImport, executePeerImport } from "#src/features/publish-content/peer-transport";
import { toPublishContentDeps, type PublishContentRouteRegistrar } from "./deps.js";

/** Session-only: neither an API key nor an assistant can perform the manual confirmation. */
export const registerPublishBackstopRoutes: PublishContentRouteRegistrar = (app, deps) => {
  const base = "/api/admin/v1/workspaces/:workspaceId/publish-content";
  async function actor(res: Response): Promise<string | null> {
    if (!rejectUnlessSessionCredential(res, { message: BACKSTOP_FORBIDDEN, permission: "publish.backstop" })) return null;
    const id = getAuthedPrincipal(res).id;
    const allowed = await deps.authorize({ principalId: id, permission: "publish.backstop", workspaceId: deps.workspaceId });
    if (!allowed.allowed || !(await mayUseBackstop({ actorId: id, ownerId: await deps.ownerPrincipalId, roles: { list: async () => {
      const links = await deps.principalRoleRepo.listByPrincipalId({ workspaceId: deps.workspaceId, principalId: id });
      const roles = await Promise.all(links.map((link) => deps.roleRepo.findById({ workspaceId: deps.workspaceId, id: link.roleId })));
      return roles.filter((role): role is NonNullable<typeof role> => role !== null);
    } } }))) {
      res.status(403).json({ error: BACKSTOP_FORBIDDEN, code: "FORBIDDEN" }); return null;
    }
    return id;
  }
  app.get(`${base}/backstop/status`, async (req, res) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    try {
      if (!(await actor(res))) return;
      const audit = toPublishContentDeps(deps).backstop?.audit;
      res.json({ allowed: true, installed: !!audit && await audit.ready() });
    } catch { res.status(500).json({ error: "Manual publishing availability could not be read." }); }
  });
  app.get(`${base}/runs/:runId/backstop`, async (req, res) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    try {
      if (!(await actor(res))) return;
      const audit = toPublishContentDeps(deps).backstop?.audit;
      if (!audit || !(await audit.ready())) { res.status(503).json({ error: "Send by hand needs its audit storage installed.", code: "BACKSTOP_NOT_INSTALLED" }); return; }
      const log = await audit.get({ workspaceId: deps.workspaceId, id: String(req.params.runId) });
      if (!log || log.direction !== "destination") { res.status(404).json({ error: "This send was not found on this site." }); return; }
      res.json({ runId: log.runId, reason: log.reason, items: log.items.map(({ entityType, id }) => ({ entityType, id })),
        canUndo: log.result === "success" || (log.result === "failure" && log.inverses.length > 0) });
    } catch { res.status(500).json({ error: "This send could not be read." }); }
  });
  app.post(`${base}/backstop`, async (req, res) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    try {
      const actorId = await actor(res); if (!actorId) return;
      const peerId = req.body?.peerId;
      if (typeof peerId !== "string") { res.status(400).json({ error: "Choose a connected live site.", code: "VALIDATION_ERROR" }); return; }
      const destination = await deps.publishContentPeerRepo.findById({ workspaceId: deps.workspaceId, id: peerId });
      if (!destination) { res.status(404).json({ error: "The connected live site was not found." }); return; }
      const host = new URL(destination.baseUrl).host;
      // Checking is not the human confirmation. A supplied wrong host still fails, but the UI
      // leaves this field empty until the operator has seen the plan. Send always requires it.
      const checked = validateBackstopRequest({ body: req.body.action === "plan" && req.body.typedHost === undefined
        ? { ...req.body, typedHost: host } : req.body, destinationHost: host });
      if ("error" in checked) { res.status(400).json({ error: checked.error, code: "VALIDATION_ERROR" }); return; }
      const projection = toPublishContentDeps(deps);
      const backstop = { ...projection.backstop!, selection: checked.request.selection };
      const audit = backstop.audit;
      if (!audit || !(await audit.ready())) { res.status(503).json({ error: "Send by hand needs its audit storage installed before it can send anything.", code: "BACKSTOP_NOT_INSTALLED" }); return; }
      const resolvePeer = async () => ({ httpClient: deps.publishContentPeerHttpClient, credential: await resolvePublishDestinationCredential({
        repo: deps.publishContentPeerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, httpClient: deps.publishContentPeerHttpClient,
      }, { workspaceId: deps.workspaceId, id: peerId, backstop: true }) });
      if (req.body.action === "send") {
        const log = typeof req.body.logId === "string" ? await audit.get({ workspaceId: deps.workspaceId, id: req.body.logId }) : null;
        if (!log || log.direction !== "source" || log.actorId !== actorId || log.destination !== destination.baseUrl || log.result !== "planned" || log.reason !== checked.request.reason || log.details.peerId !== peerId) {
          res.status(409).json({ error: "Check what would change again before sending." }); return;
        }
        const result = await runAuditedBackstop({ audit, record: log, work: async () => {
          const peer = await resolvePeer();
          const plan = log.details.plan as Record<string, unknown>;
          const confirmation = await confirmPeerImport(peer, { planId: String(plan.planId), planHash: String(plan.planHash) });
          return executePeerImport(peer, { bundleId: String(log.details.bundleId), confirmationToken: confirmation.confirmationToken,
            overwriteEntityKeys: log.details.overwriteEntityKeys as string[] | undefined });
        } });
        res.json({ ...result, logId: log.id, destination: destination.baseUrl }); return;
      }
      if (req.body.action !== "plan") { res.status(400).json({ error: "Choose Check what would change or Send to live." }); return; }
      const entities: PackedEntity[] = [];
      const skipped: SkippedPackEntity[] = [];
      for (const contributor of [contributeRawRowPublish(), contributeRawFilePublish()]) {
        const handler = contributor.build({ ...projection, backstop });
        for await (const entity of handler.pack()) entities.push(entity);
        skipped.push(...await handler.listSkipped!());
      }
      if (entities.length === 0) { res.json({ entities: [], skipped, logId: null }); return; }
      const metadata = { mode: "backstop" as const, reason: checked.request.reason, sourceActor: actorId, destinationHost: host, gapLabels: [] };
      const carrying = entities.map((entity) => ({ ...entity, backstop: metadata }));
      const verifiedMetadata = readBackstopMetadata({ entities: carrying })!;
      const auditedEntities = entities.map((entity) => ({ ...entity, backstop: verifiedMetadata }));
      const overwriteEntityKeys = req.body.overwriteEntityKeys as unknown;
      const keys = new Set(entities.map((entity) => entityKey(entity.entityType, entity.id)));
      if (overwriteEntityKeys !== undefined && (!Array.isArray(overwriteEntityKeys) || overwriteEntityKeys.some((key) => typeof key !== "string" || !keys.has(key)))) {
        res.status(400).json({ error: "Only selected items can be overwritten.", code: "VALIDATION_ERROR" }); return;
      }
      const record: BackstopAuditRecord = { id: deps.idGen.newId(), workspaceId: deps.workspaceId, direction: "source", actorId,
        destination: destination.baseUrl, reason: checked.request.reason, at: nowIso({ clock: deps.clock }), gapLabels: verifiedMetadata.gapLabels,
        items: entities.map((e) => ({ entityType: e.entityType, id: e.id, afterHash: e.contentHash })), result: "pending", runId: null, details: {}, inverses: [] };
      const result = await runAuditedBackstop({ audit, record, successResult: "planned", work: async () => {
        const peer = await resolvePeer();
        const pushed = await pushBundleToPeer({ ...peer, blobSource: createCompositePeerBlobSource({ blobStore: deps.blobStore, fileBlobIndex: deps.fileBlobIndex }),
          computeStorageKey: (sha256) => computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256 }) }, {
          bundle: { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION,
            sourceLabel: deps.workspaceId, entities: auditedEntities, blobManifest: [...new Set(entities.flatMap((e) => e.requiredBlobs))], skipped },
          ...(overwriteEntityKeys === undefined ? {} : { overwriteEntityKeys: overwriteEntityKeys as string[] }),
        });
        if (pushed.notSupportedByLive.length > 0) throw new Error("Live can't accept send by hand yet; update live and enable its backstop grant.");
        return { ...pushed, peerId, entities, skipped, ...(overwriteEntityKeys === undefined ? {} : { overwriteEntityKeys }) };
      } });
      res.json({ ...result, logId: record.id });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "This send could not complete." }); }
  });

  app.get(`${base}/backstop/gaps`, async (req, res) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    try {
      const principal = getAuthedPrincipal(res);
      const allowed = await deps.authorize({ principalId: principal.id, permission: "publish_content.read", workspaceId: deps.workspaceId });
      if (!allowed.allowed) { res.status(403).json({ error: "Publishing history is not available to this account." }); return; }
      const audit = toPublishContentDeps(deps).backstop?.audit;
      res.json({ gaps: audit && await audit.ready() ? await audit.gaps({ workspaceId: deps.workspaceId }) : [] });
    } catch { res.status(500).json({ error: "Publishing history could not be read." }); }
  });

  app.post(`${base}/runs/:runId/undo-backstop`, async (req, res) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    try {
      if (!(await actor(res))) return;
      const projection = toPublishContentDeps(deps);
      const { audit, rows, files } = projection.backstop ?? {};
      if (!audit || !rows || !(await audit.ready())) { res.status(503).json({ error: "Send by hand needs its audit storage installed." }); return; }
      const log = await audit.get({ workspaceId: deps.workspaceId, id: String(req.params.runId) });
      if (!log || log.direction !== "destination" || !(log.result === "success" || (log.result === "failure" && log.inverses.length > 0))) { res.status(404).json({ error: "This send has no undo available." }); return; }
      const skipped: string[] = [];
      const fileRollbacks: Array<() => Promise<void>> = [];
      try {
        await rows.transaction({ work: async () => {
          for (const inverse of [...log.inverses].reverse()) {
            if (inverse.kind === "raw-row") {
              const reason = await undoRawRow({ deps: projection, ...inverse }); if (reason) skipped.push(reason);
            } else {
              const beforeUndo = files ? await files.capture({ relPath: inverse.entity.id }) : null;
              const reason = await undoRawFile({ deps: projection, ...inverse });
              if (reason) skipped.push(reason);
              else if (beforeUndo && files) fileRollbacks.push(() => files.restore({ inverse: beforeUndo }));
            }
          }
          await audit.save({ record: { ...log, result: "undone", details: { ...log.details, undoSkipped: skipped } } });
        } });
      } catch (error) { for (const rollback of fileRollbacks.reverse()) await rollback(); throw error; }
      res.json({ runId: log.runId, undone: log.inverses.length - skipped.length, skipped });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "This send could not be undone." }); }
  });
};
