/** t09: strict transport and stateful ports; the real staging, planner and gateway remain active. */
import assert from "node:assert/strict";
import { computeBlobStorageKey } from "@jini-ai/cms/media";
import type { ToolExecutionContext } from "@jini-ai/core";
import { InMemoryTokenStore } from "../../../contracts/core/gated-mutations/token.js";
import { InMemoryPublishContentBundleRepo } from "../bundle-staging.js";
import { InMemoryPublishContentBaselineRepo } from "../baseline-repo.js";
import { InMemoryPublishContentPeerRepo, type PublishContentPeerRecord } from "../peers.js";
import { InMemoryPublishContentRunRepo } from "../run-repo.js";
import { contentHash } from "../content-hash.js";
import { registerPublishContentContributor, resetPublishContentContributorsForTests, type PackedEntity } from "../type-registry.js";
import type { PublishContentToolDeps } from "../tool-registrations.js";
import type { HttpRequest } from "../../../platform/http/index.js";

export const NOW = "2026-10-01T12:00:00.000Z";
export const OWNER = "human-owner";
export function packed(id: string, title = `Live ${id}`, requiredBlobs: string[] = []): PackedEntity {
  return { entityType: "pull-fixture", id, schemaVersion: 1, hashVersion: 1, contentHash: contentHash("pull-fixture", { title }), requiredBlobs, state: { title } };
}
export function peerRow(id = "live", label = "Live site", connected = false): PublishContentPeerRecord {
  return { workspaceId: "local", id, label, baseUrl: `https://${id}.example`, remoteWorkspaceId: "remote", sealed: connected ? null : { keyId: "key", iv: "iv", ciphertext: "sealed", tag: "tag" } as never, masked: "***", aadVersion: 1, createdAt: NOW, updatedAt: NOW };
}
export function context(input: unknown, extra: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return { executionId: "execution", principal: { id: OWNER }, run: { id: "run" }, signal: new AbortController().signal, input, ...extra };
}
export async function fixture(entities: PackedEntity[] = [packed("new")]) {
  let sequence = 0;
  let now = NOW;
  const clock = { nowIso: () => now };
  const idGen = { newId: () => `pull-${++sequence}` };
  const bundleRepo = new InMemoryPublishContentBundleRepo();
  const runRepo = new InMemoryPublishContentRunRepo();
  const peerRepo = new InMemoryPublishContentPeerRepo();
  await peerRepo.insert(peerRow());
  const baselineRepo = new InMemoryPublishContentBaselineRepo();
  const destination = new Map<string, { version: number; hash: string; title: string }>();
  const blobs = new Map<string, Buffer>();
  const remoteBlobs = new Map<string, Buffer>();
  const requests: HttpRequest[] = [];
  const authCalls: Array<Record<string, unknown>> = [];
  const applied: Array<Record<string, unknown>> = [];
  const restorePoints = new Map<string, unknown>();
  const denied = new Set<string>();
  const authorize = async (args: Record<string, unknown>) => {
    authCalls.push(args);
    return { allowed: !denied.has(args.permission as string), reason: denied.has(args.permission as string) ? "insufficient_permission" : "matched" };
  };
  resetPublishContentContributorsForTests();
  registerPublishContentContributor({ entityType: "pull-fixture", dependsOn: [], build: () => ({
    entityType: "pull-fixture", schemaVersion: 1, permission: "content.write", dependsOn: [],
    pack: async function* () {}, inspect: async (id) => destination.get(id) ?? null,
    precheck: async (entity) => entity.id === "blocked" ? "Local item is locked" : null,
    apply: async () => { throw new Error("use the apply port"); },
  }) });
  const deps = {
    workspaceId: "local", clock, idGen, authorize, pluginBeforeSaveHook: undefined, outbox: undefined,
    publishContentPeerRepo: peerRepo, workspaceRepo: { findById: async () => ({ name: "Local" }) },
    siteAssistantSecretSealer: { open: async () => "private-key" }, siteAssistantSecretKeyring: {} as never,
    findPublishCandidate: async () => null, publishTrustProvisioning: {} as never, publishContentPorts: {},
    publishContentBundleRepo: bundleRepo, publishContentRunRepo: runRepo, publishContentBaselineRepo: baselineRepo,
    publishContentPeerHttpClient: { send: async (request: HttpRequest) => {
      requests.push(request);
      assert.equal(request.method, "GET");
      assert.equal(request.headers?.authorization, "Bearer private-key");
      const url = new URL(request.url);
      assert.equal(url.hostname, "live.example");
      if (url.pathname === "/api/admin/v1/workspaces/remote/publish-content/export") {
        return { status: 200, headers: {}, bodyText: JSON.stringify({ artifactFormatVersion: 1, hashVersion: 1, sourceLabel: "Untrusted label", sourcePrincipalId: "peer-declared-owner", entities, blobManifest: entities.flatMap(e => e.requiredBlobs) }) };
      }
      const prefix = "/api/admin/v1/workspaces/remote/publish-content/blobs/";
      assert.equal(url.pathname.startsWith(prefix), true, request.url);
      const sha = url.pathname.slice(prefix.length);
      const bytes = remoteBlobs.get(sha);
      return { status: bytes ? 200 : 404, headers: {}, bodyText: JSON.stringify(bytes ? { sha256: sha, dataBase64: bytes.toString("base64") } : { error: "absent", code: "BLOB_NOT_FOUND" }) };
    } },
    blobStore: {
      exists: async ({ storageKey }: { storageKey: string }) => blobs.has(storageKey),
      putIfAbsent: async ({ workspaceId, sha256, bytes }: { workspaceId: string; sha256: string; bytes: Uint8Array }) => {
        assert.equal(workspaceId, "local");
        const storageKey = computeBlobStorageKey({ workspaceId, sha256 });
        blobs.set(storageKey, Buffer.from(bytes));
        return { storageKey, written: true };
      },
    },
    gatedMutations: { gatewayDeps: { clock, idGen, authorize, tokens: new InMemoryTokenStore() } },
    dbOps: { getCapabilities: async () => ({ restorePoint: { costClass: "cheap" } }), captureRestorePoint: async () => ({ artifactRef: "backup", watermarkAtCapture: 3 }) },
    restorePointsRepo: { save: async (record: { restorePointId: string }) => { restorePoints.set(record.restorePointId, record); } },
    publishContentApplyPort: { applyReport: async (args: any) => {
      assert.equal(restorePoints.has(args.restorePointId), true);
      applied.push(args);
      for (const row of args.report.rows) {
        if (!row.writes) continue;
        const entity = entities.find(e => e.id === row.entityId)!;
        destination.set(entity.id, { version: 1, hash: entity.contentHash, title: (entity.state as { title: string }).title });
      }
      await runRepo.save({ id: "applied-run", workspaceId: "local", direction: "import", peerPrincipalId: OWNER, peerLabel: "Live site", phase: "applied", restorePointId: args.restorePointId, changeSetIdsJson: "[]", actorId: args.principalId, startedAt: NOW, finishedAt: NOW, reportJson: JSON.stringify(args.report), itemsJson: "[]" });
      return { runId: "applied-run", changeSetIds: [], retiredChangeSetIds: [], repointChangeSetIds: [], menuLinksUpdated: 0, menuLinksNotUpdated: [], verificationProblems: [] };
    } },
  } as unknown as PublishContentToolDeps;
  return { deps, entities, destination, bundleRepo, runRepo, peerRepo, baselineRepo, blobs, remoteBlobs, requests, denied, authCalls, applied, restorePoints, setNow: (value: string) => { now = value; } };
}
export async function tool(deps: PublishContentToolDeps, id: string, surfaces: any = { surfaceExchanges: { open: () => { throw new Error("unexpected dialog"); } } }) {
  const { buildPublishContentRegistrations } = await import("../tool-registrations.js");
  const registration = buildPublishContentRegistrations(deps, surfaces).find(r => r.descriptor.id === id);
  assert.notEqual(registration, undefined, `${id} must be registered`);
  return registration!;
}
