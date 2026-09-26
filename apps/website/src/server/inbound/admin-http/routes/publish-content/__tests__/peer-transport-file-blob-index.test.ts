import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { createFileBlobIndex } from "#src/features/publish-content/file-blob-index";
import { InMemoryPublishContentPeerRepo } from "#src/features/publish-content/peers";
import { CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import {
  registerPublishContentContributor,
  resetPublishContentContributorsForTests,
  type PackedEntity,
  type PublishContentContributor,
} from "#src/features/publish-content/type-registry";
import type { HttpClientPort } from "#src/platform/http/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { PublishContentRouteDeps } from "../deps.js";
import { registerPublishContentPeerRoutes } from "../peers.js";
import { registerPublishContentPeerTransportRoutes } from "../peer-transport.js";

/**
 * @file S18 (S-F3) route wiring — `publish-files-plan-2026-09-24.md` §3. Proves that `push/plan`
 * (the ROUTE file `peer-transport.ts`, not the feature module of the same name) sources a missing
 * blob through `createCompositePeerBlobSource` rather than `deps.blobStore` directly, so a blob that
 * lives ONLY in `RouteDeps.fileBlobIndex` (what a file-tree type's `pack()`, e.g. `theme-files`,
 * fills) is uploaded to the peer instead of reported `blobsUnavailable`.
 *
 * A synthetic `file-index-canary` contributor stands in for a real file-tree type — `theme-files`
 * is not registered on `publish-content-manifest.ts` yet (S19, out of scope here); registering one
 * directly via `registerPublishContentContributor` proves the same route-level wiring without
 * depending on S19 landing first. Harness copied from `peers.routes.test.ts`'s `buildApp`.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/publish-content/peers`;
const API_KEY = "tovu_live_0123456789abcdef";

function buildApp(options: {
  httpClient: HttpClientPort;
  fileBlobIndex: ReturnType<typeof createFileBlobIndex>;
}): { app: express.Express; repo: InMemoryPublishContentPeerRepo } {
  const repo = new InMemoryPublishContentPeerRepo();
  const keyring = new InMemoryKeyring();
  let n = 0;

  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowIso: () => "2026-09-24T00:00:00.000Z" },
    idGen: { newId: () => `peer-${++n}` },
    publishContentPeerRepo: repo,
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    siteAssistantSecretKeyring: keyring,
    publishContentPeerHttpClient: options.httpClient,
    workspaceRepo: { findById: async () => ({ id: WORKSPACE_ID, name: "Local Site" }) },
    // Deliberately lacks the fixture blob — the only way `push/plan` can find it is by falling
    // back to `fileBlobIndex`, which is exactly the wiring this test certifies.
    blobStore: { exists: async () => false, get: async () => { throw new Error("blobStore.get must not be reached for a file-index-only blob"); } },
    fileBlobIndex: options.fileBlobIndex,
    publishContentBundleRepo: { save: async () => {}, findById: async () => null },
    postRepo: {},
    outbox: {},
    pluginBeforeSaveHook: undefined,
  } as unknown as PublishContentRouteDeps;

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    res.locals.authCredentialKind = "session";
    next();
  });
  registerPublishContentPeerRoutes(app, deps);
  registerPublishContentPeerTransportRoutes(app, deps);
  return { app, repo };
}

async function createPeer(server: string) {
  return fetch(`${server}${BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      label: "production",
      baseUrl: "https://tovu.example.com",
      remoteWorkspaceId: "remote-ws-9",
      apiKey: API_KEY,
    }),
  });
}

function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("push/plan uploads a blob that exists only in the file index (never in the blob store)", async (t) => {
  resetPublishContentContributorsForTests();
  t.after(() => resetPublishContentContributorsForTests());

  const dir = mkdtempSync(path.join(tmpdir(), "peer-transport-file-blob-index-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "theme.css");
  const content = "body { color: red; } /* pushed from the file index */";
  writeFileSync(filePath, content);
  const sha = sha256Of(Buffer.from(content));

  const fileBlobIndex = createFileBlobIndex();
  fileBlobIndex.set(sha, { absPath: filePath, size: content.length });

  const canaryEntity: PackedEntity = {
    entityType: "file-index-canary",
    id: "canary-1",
    schemaVersion: 1,
    contentHash: "canary-hash",
    hashVersion: CONTENT_HASH_VERSION,
    requiredBlobs: [sha],
    state: {},
  };
  const canaryContributor: PublishContentContributor = {
    entityType: "file-index-canary",
    dependsOn: [],
    build: () => ({
      entityType: "file-index-canary",
      schemaVersion: 1,
      permission: "publish_content.read",
      dependsOn: [],
      async *pack() {
        yield canaryEntity;
      },
      inspect: async () => null,
      precheck: async () => null,
      apply: async () => {
        throw new Error("not exercised by this test");
      },
    }),
  };
  registerPublishContentContributor(canaryContributor);

  let uploadedBody: { dataBase64?: string } | undefined;
  const httpClient: HttpClientPort = {
    send: async (request) => {
      if (request.url.includes("/capabilities")) {
        return { status: 200, headers: {}, bodyText: JSON.stringify({ entityTypes: ["file-index-canary"], features: [] }) };
      }
      if (request.url.includes("/blobs/probe")) {
        return { status: 200, headers: {}, bodyText: JSON.stringify({ missing: [sha] }) };
      }
      if (request.method === "PUT" && request.url.includes("/blobs/")) {
        uploadedBody = JSON.parse(String(request.body ?? "{}")) as { dataBase64?: string };
        return { status: 200, headers: {}, bodyText: "{}" };
      }
      if (request.url.includes("/bundles")) {
        return { status: 201, headers: {}, bodyText: JSON.stringify({ bundleId: "remote-bundle-1" }) };
      }
      if (request.url.includes("/import/plan")) {
        return {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            domain: "publish_content.import",
            planId: "p1",
            planHash: "h1",
            details: { refused: false, refusalReason: null, applyOrder: [], rows: [] },
          }),
        };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    },
  };

  const { app } = buildApp({ httpClient, fileBlobIndex });
  const server = await startTestServer(app, t);
  await createPeer(server);

  const res = await fetch(`${server}${BASE}/peer-1/push/plan`, { method: "POST" });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw) as { blobsUploaded: string[]; blobsUnavailable: string[] };
  assert.deepEqual(body.blobsUploaded, [sha], "a file-index-only blob must be uploaded, not skipped");
  assert.deepEqual(body.blobsUnavailable, [], "a blob present in the file index must never be reported unavailable");
  assert.ok(uploadedBody?.dataBase64, "the peer must actually receive a PUT with bytes");
  assert.equal(Buffer.from(uploadedBody!.dataBase64!, "base64").toString("utf8"), content, "the uploaded bytes must be the real file contents");
});

// b692dbeef route wiring: a whole unit THIS side refused to pack never reaches the peer, so the only
// way the admin table can show it is `push/plan` appending it to the peer's rows.
test("push/plan appends a locally refused unit to the peer's plan as a non-selectable blocked row", async (t) => {
  resetPublishContentContributorsForTests();
  t.after(() => resetPublishContentContributorsForTests());

  const canaryEntity: PackedEntity = {
    entityType: "file-index-canary",
    id: "canary-1",
    schemaVersion: 1,
    contentHash: "canary-hash",
    hashVersion: CONTENT_HASH_VERSION,
    requiredBlobs: [],
    state: {},
  };
  const reason = "Can't publish: contains a video file (clip.mp4)";
  registerPublishContentContributor({
    entityType: "file-index-canary",
    dependsOn: [],
    build: () => ({
      entityType: "file-index-canary",
      schemaVersion: 1,
      permission: "publish_content.read",
      dependsOn: [],
      async *pack() {
        yield canaryEntity;
      },
      listSkipped: async () => [{ entityType: "file-index-canary", id: "static/showcase", label: "static/showcase", reason }],
      inspect: async () => null,
      precheck: async () => null,
      apply: async () => {
        throw new Error("not exercised by this test");
      },
    }),
  });

  const peerRow = { entityType: "file-index-canary", entityId: "canary-1", outcome: "applied", writes: true };
  const httpClient: HttpClientPort = {
    send: async (request) => {
      if (request.url.includes("/capabilities")) {
        return { status: 200, headers: {}, bodyText: JSON.stringify({ entityTypes: ["file-index-canary"], features: [] }) };
      }
      if (request.url.includes("/blobs/probe")) return { status: 200, headers: {}, bodyText: JSON.stringify({ missing: [] }) };
      if (request.url.includes("/bundles")) return { status: 201, headers: {}, bodyText: JSON.stringify({ bundleId: "remote-bundle-1" }) };
      if (request.url.includes("/import/plan")) {
        return {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            domain: "publish_content.import",
            planId: "p1",
            planHash: "h1",
            details: { refused: false, refusalReason: null, applyOrder: [], rows: [peerRow] },
          }),
        };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    },
  };

  const { app } = buildApp({ httpClient, fileBlobIndex: createFileBlobIndex() });
  const server = await startTestServer(app, t);
  await createPeer(server);

  const res = await fetch(`${server}${BASE}/peer-1/push/plan`, { method: "POST" });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw) as { details: { rows: Array<Record<string, unknown>> } };
  assert.equal(body.details.rows.length, 2, raw);
  assert.deepEqual(body.details.rows[1], {
    entityType: "file-index-canary",
    entityId: "static/showcase",
    entityLabel: "static/showcase",
    outcome: "blocked",
    writes: false,
    reason,
    canOverwrite: false,
    retires: null,
  });
});
