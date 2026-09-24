import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryPublishContentPeerRepo } from "#src/features/publish-content/peers";
import { EgressRefusedError, type HttpClientPort } from "#src/platform/http/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { PublishContentRouteDeps } from "../deps.js";
import { registerPublishContentPeerRoutes } from "../peers.js";
import { registerPublishContentPeerTransportRoutes } from "../peer-transport.js";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * Certifies the FROZEN CONTRACT this task's dispatch named, at the HTTP boundary a client actually
 * sees — not just at the store:
 *
 * - `GET .../peers` answers `{peers: [{id, label, baseUrl, remoteWorkspaceId, masked, hasCredential}]}`
 *   and nothing else;
 * - `publish_content.read` gates the list, `publish_content.apply` gates every mutation, and
 *   `content.read`/`content.write` are NEVER consulted (asserted by recording every permission
 *   string the routes ask for);
 * - plan/confirm/execute take a `peerId`, never a URL or a credential from the client;
 * - a private-address peer answers 502 with the `devHostAllowlist` diagnosis intact, not a 500.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/publish-content/peers`;
const API_KEY = "tovu_live_0123456789abcdef";

function buildApp(
  options: { allow?: boolean; httpClient?: HttpClientPort } = {}
): { app: express.Express; askedPermissions: string[]; repo: InMemoryPublishContentPeerRepo } {
  const askedPermissions: string[] = [];
  const repo = new InMemoryPublishContentPeerRepo();
  const keyring = new InMemoryKeyring();
  let n = 0;

  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async ({ permission }: { permission: string }) => {
      askedPermissions.push(permission);
      return { allowed: options.allow ?? true, reason: "matched" };
    },
    clock: { nowIso: () => "2026-09-18T00:00:00.000Z" },
    idGen: { newId: () => `peer-${++n}` },
    publishContentPeerRepo: repo,
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    siteAssistantSecretKeyring: keyring,
    publishContentPeerHttpClient: options.httpClient ?? { send: async () => ({ status: 200, headers: {}, bodyText: "{}" }) },
    workspaceRepo: { findById: async () => ({ id: WORKSPACE_ID, name: "Local Site" }) },
    blobStore: { exists: async () => false, get: async () => new Uint8Array() },
    publishContentBundleRepo: { save: async () => {}, findById: async () => null },
    postRepo: {},
    outbox: {},
    pluginBeforeSaveHook: undefined,
  } as unknown as PublishContentRouteDeps;

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerPublishContentPeerRoutes(app, deps);
  registerPublishContentPeerTransportRoutes(app, deps);
  return { app, askedPermissions, repo };
}

async function createPeer(server: string, overrides: Record<string, unknown> = {}) {
  return fetch(`${server}${BASE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      label: "production",
      baseUrl: "https://tovu.example.com",
      remoteWorkspaceId: "remote-ws-9",
      apiKey: API_KEY,
      ...overrides,
    }),
  });
}

test("GET .../peers answers exactly {peers:[{id,label,baseUrl,remoteWorkspaceId,masked,hasCredential}]}", async (t) => {
  const { app } = buildApp();
  const server = await startTestServer(app, t);
  assert.equal((await createPeer(server)).status, 201);

  const res = await fetch(`${server}${BASE}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { peers: Array<Record<string, unknown>> };
  assert.deepEqual(Object.keys(body), ["peers"]);
  assert.deepEqual(body.peers, [
    {
      id: "peer-1",
      label: "production",
      baseUrl: "https://tovu.example.com",
      remoteWorkspaceId: "remote-ws-9",
      masked: "••••cdef",
      hasCredential: true,
    },
  ]);
});

test("no response body ever carries sealed material or the raw key", async (t) => {
  const { app, repo } = buildApp();
  const server = await startTestServer(app, t);
  const createdText = await (await createPeer(server)).text();
  const listedText = await (await fetch(`${server}${BASE}`)).text();
  const patchedText = await (
    await fetch(`${server}${BASE}/peer-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "prod-eu" }),
    })
  ).text();

  const stored = await repo.findById({ workspaceId: WORKSPACE_ID, id: "peer-1" });
  assert.ok(stored?.sealed, "the row must actually be sealed, or this test proves nothing");

  for (const payload of [createdText, listedText, patchedText]) {
    assert.equal(payload.includes(API_KEY), false, "raw api key reached a response body");
    assert.equal(payload.includes(stored.sealed.ciphertext), false, "sealed ciphertext reached a response body");
    assert.equal(payload.includes(stored.sealed.nonce), false, "sealed nonce reached a response body");
    for (const field of ["sealedCiphertext", "sealedNonce", "sealedKeyId", "sealedAlg"]) {
      assert.equal(payload.includes(field), false, `${field} reached a response body`);
    }
  }
});

test("list asks publish_content.read; every mutation asks publish_content.apply; content.* is never asked", async (t) => {
  const { app, askedPermissions } = buildApp();
  const server = await startTestServer(app, t);

  await fetch(`${server}${BASE}`);
  assert.deepEqual(askedPermissions, ["publish_content.read"]);

  askedPermissions.length = 0;
  await createPeer(server);
  await fetch(`${server}${BASE}/peer-1`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "prod-eu" }),
  });
  await fetch(`${server}${BASE}/peer-1`, { method: "DELETE" });
  assert.deepEqual(askedPermissions, ["publish_content.apply", "publish_content.apply", "publish_content.apply"]);
  assert.equal(
    askedPermissions.some((permission) => permission.startsWith("content.")),
    false,
    "reusing content.read/content.write would silently widen who can export this workspace's content"
  );
});

test("every peers route 403s when the permission is denied, naming the publish_content permission", async (t) => {
  const { app } = buildApp({ allow: false });
  const server = await startTestServer(app, t);

  const listed = await fetch(`${server}${BASE}`);
  assert.equal(listed.status, 403);
  assert.match(((await listed.json()) as { error: string }).error, /'publish_content\.read'/);

  const created = await createPeer(server);
  assert.equal(created.status, 403);
  assert.match(((await created.json()) as { error: string }).error, /'publish_content\.apply'/);

  for (const path of ["/push/plan", "/push/confirm", "/push/execute", "/pull"]) {
    const res = await fetch(`${server}${BASE}/peer-1${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "p", planHash: "h", bundleId: "b", confirmationToken: "t" }),
    });
    assert.equal(res.status, 403, `${path} must be gated`);
  }
});

test("every peers route 404s on a mismatched workspace id before doing anything else", async (t) => {
  const { app, askedPermissions } = buildApp();
  const server = await startTestServer(app, t);
  const wrong = "/api/admin/v1/workspaces/not-real/publish-content/peers";

  for (const [method, path] of [
    ["GET", ""],
    ["POST", ""],
    ["PATCH", "/peer-1"],
    ["DELETE", "/peer-1"],
    ["POST", "/peer-1/push/plan"],
    ["POST", "/peer-1/pull"],
  ] as const) {
    const res = await fetch(`${server}${wrong}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "GET" || method === "DELETE" ? {} : { body: "{}" }),
    });
    assert.equal(res.status, 404, `${method} ${path}`);
  }
  assert.deepEqual(askedPermissions, [], "a mismatched workspace must never reach an authorize call");
});

test("a create refusing validation is a 400 with a code, not a 500", async (t) => {
  const { app } = buildApp();
  const server = await startTestServer(app, t);
  const res = await createPeer(server, { baseUrl: "http://tovu.example.com" });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: "baseUrl was refused because its scheme must be https",
    code: "VALIDATION_ERROR",
  });
});

test("a duplicate label is a 409 DUPLICATE_LABEL", async (t) => {
  const { app } = buildApp();
  const server = await startTestServer(app, t);
  await createPeer(server);
  const res = await createPeer(server, { baseUrl: "https://other.example.com" });
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code: string }).code, "DUPLICATE_LABEL");
});

test("DELETE is idempotent 204", async (t) => {
  const { app } = buildApp();
  const server = await startTestServer(app, t);
  await createPeer(server);
  assert.equal((await fetch(`${server}${BASE}/peer-1`, { method: "DELETE" })).status, 204);
  assert.equal((await fetch(`${server}${BASE}/peer-1`, { method: "DELETE" })).status, 204);
});

test("push/pull address a peer by peerId only — an unknown one is 404 PEER_NOT_FOUND", async (t) => {
  const { app } = buildApp();
  const server = await startTestServer(app, t);
  const res = await fetch(`${server}${BASE}/does-not-exist/pull`, { method: "POST" });
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { code: string }).code, "PEER_NOT_FOUND");
});

test("a private-address peer answers 502 with the devHostAllowlist diagnosis intact, never a generic 500", async (t) => {
  const refusing: HttpClientPort = {
    send: async () => {
      throw new EgressRefusedError("egress to 'peer.internal' (10.1.2.3) rejected: resolved address is private", {
        callerSafeMessage: "egress to 'peer.internal' rejected: resolved address is private",
      });
    },
  };
  const { app } = buildApp({ httpClient: refusing });
  const server = await startTestServer(app, t);
  await createPeer(server, { baseUrl: "https://peer.internal" });

  const res = await fetch(`${server}${BASE}/peer-1/pull`, { method: "POST" });
  assert.equal(res.status, 502);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "EGRESS_REFUSED");
  assert.match(body.error, /devHostAllowlist/);
  assert.match(body.error, /TOVU_PUBLISH_CONTENT_DEV_HOSTS/);
  assert.match(body.error, /add 'peer\.internal'/);
  assert.equal(body.error.includes("10.1.2.3"), false, "the resolved address must not be echoed to a caller");
  assert.equal(body.error.includes(API_KEY), false);
});

test("push/confirm and push/execute validate their bodies before opening the peer credential", async (t) => {
  const { app } = buildApp();
  const server = await startTestServer(app, t);
  await createPeer(server);

  for (const path of ["/push/confirm", "/push/execute"]) {
    const res = await fetch(`${server}${BASE}/peer-1${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { code: string }).code, "VALIDATION_ERROR");
  }
});

test("push/plan refuses a malformed selectedEntityKeys with a 400 code, before it opens the peer", async (t) => {
  // The per-row selection (owner-directed, 2026-09-19) narrows the bundle this route stages on the
  // destination. It is validated at the boundary like every other body field here: a bad selection
  // is a client error with a code, never a 500 and never a silently ignored parameter that would
  // publish everything.
  const { app } = buildApp();
  const server = await startTestServer(app, t);

  for (const selectedEntityKeys of [["post:p1", 7], "post:p1", { "post:p1": true }]) {
    const res = await fetch(`${server}${BASE}/peer-1/push/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedEntityKeys }),
    });
    assert.equal(res.status, 400, `${JSON.stringify(selectedEntityKeys)} must be refused`);
    assert.deepEqual(await res.json(), {
      error: "'selectedEntityKeys' must be an array of strings",
      code: "VALIDATION_ERROR",
    });
  }
});

test("push/plan treats an absent selection as 'everything', not as an empty one", async (t) => {
  // A bodyless plan is what an untouched dialog sends and what every caller sent before the
  // checkbox column existed; it must not be read as "the operator selected nothing". Asserted by
  // getting PAST validation — the request then fails on the peer, which does not exist here.
  const { app } = buildApp();
  const server = await startTestServer(app, t);

  const res = await fetch(`${server}${BASE}/peer-1/push/plan`, { method: "POST" });
  assert.notEqual(res.status, 400, "a plan with no selection must not be rejected as malformed");
});

// ---------------------------------------------------------------------------
// S7: overwriteEntityKeys forwarding + liveCanOverwrite echo — overwrite-live-plan §4/S7.
// ---------------------------------------------------------------------------

test("push/plan refuses a malformed overwriteEntityKeys with a 400 code, before it opens the peer", async (t) => {
  const { app } = buildApp();
  const server = await startTestServer(app, t);

  for (const overwriteEntityKeys of [["post:p1", 7], "post:p1", { "post:p1": true }]) {
    const res = await fetch(`${server}${BASE}/peer-1/push/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overwriteEntityKeys }),
    });
    assert.equal(res.status, 400, `${JSON.stringify(overwriteEntityKeys)} must be refused`);
    assert.deepEqual(await res.json(), {
      error: "'overwriteEntityKeys' must be an array of strings",
      code: "VALIDATION_ERROR",
    });
  }
});

test("push/execute refuses a malformed overwriteEntityKeys with a 400 code, before it opens the peer", async (t) => {
  const { app } = buildApp();
  const server = await startTestServer(app, t);

  const res = await fetch(`${server}${BASE}/peer-1/push/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bundleId: "b1", confirmationToken: "t1", overwriteEntityKeys: "not-an-array" }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: "'overwriteEntityKeys' must be an array of strings",
    code: "VALIDATION_ERROR",
  });
});

test("push/plan echoes overwriteEntityKeys back exactly as sent, and forwards the same keys to the peer's own /import/plan", async (t) => {
  // No `/capabilities` route stubbed: this test's fixture app registers no publish-content
  // contributors (`buildApp` never imports the manifest), so the exported bundle is always empty
  // and `pushBundleToPeer` skips the probe — `liveCanOverwrite` is covered against a REAL probe
  // response at the feature level (`peer-transport.test.ts`); this test's job is only the route's
  // own read-forward-echo wiring for `overwriteEntityKeys`.
  const httpClient: HttpClientPort = {
    send: async (request) => {
      if (request.url.includes("/bundles")) {
        return { status: 201, headers: {}, bodyText: JSON.stringify({ bundleId: "remote-bundle-1" }) };
      }
      if (request.url.includes("/import/plan")) {
        // The peer echoes back exactly what it was told to force, mirroring `import.ts`'s own
        // `forced` outcome for a row named by that key — this fake only needs to prove the SOURCE
        // route relays and re-echoes it, not the destination's own planning logic.
        const body = JSON.parse(String(request.body ?? "{}")) as { overwriteEntityKeys?: string[] };
        return {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            domain: "publish_content.import",
            planId: "p1",
            planHash: "h1",
            details: { refused: false, refusalReason: null, applyOrder: [], rows: [] },
            overwriteEntityKeysSeenByPeer: body.overwriteEntityKeys ?? null,
          }),
        };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    },
  };
  const { app } = buildApp({ httpClient });
  const server = await startTestServer(app, t);
  await createPeer(server);

  const res = await fetch(`${server}${BASE}/peer-1/push/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ overwriteEntityKeys: ["post:p1"] }),
  });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw) as { overwriteEntityKeys?: string[]; liveCanOverwrite?: boolean; overwriteEntityKeysSeenByPeer?: string[] | null };
  assert.deepEqual(body.overwriteEntityKeys, ["post:p1"], "push/plan must echo back the ticks it was given");
  assert.equal(body.liveCanOverwrite, false, "an empty bundle in this fixture never reaches the probe (see the comment above)");
  assert.deepEqual(body.overwriteEntityKeysSeenByPeer, ["post:p1"], "the peer's own /import/plan must have received the same keys");
});

test("push/plan omits overwriteEntityKeys from its response, and reports liveCanOverwrite:false, when nothing was ticked", async (t) => {
  // No `/capabilities` route stubbed on purpose: this fixture workspace exports no entities, so
  // `pushBundleToPeer` must skip the probe entirely (same as the feature-level test of that
  // short-circuit) — an unexpected call here would throw and fail this test.
  const httpClient: HttpClientPort = {
    send: async (request) => {
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
  const { app } = buildApp({ httpClient });
  const server = await startTestServer(app, t);
  await createPeer(server);

  const res = await fetch(`${server}${BASE}/peer-1/push/plan`, { method: "POST" });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw) as Record<string, unknown>;
  assert.equal("overwriteEntityKeys" in body, false, "an untouched dialog's plan must not echo an empty/null overwrite set");
  assert.equal(body.liveCanOverwrite, false, "an empty fixture workspace exports no entities, so the capabilities probe never runs");
});

test("push/execute forwards overwriteEntityKeys to the peer's own /import/execute", async (t) => {
  let executeBody: Record<string, unknown> | undefined;
  const httpClient: HttpClientPort = {
    send: async (request) => {
      if (request.url.includes("/import/execute")) {
        executeBody = JSON.parse(String(request.body ?? "{}")) as Record<string, unknown>;
        return { status: 200, headers: {}, bodyText: JSON.stringify({ restorePointId: "rp-1", runId: "run-1", changeSetIds: [] }) };
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    },
  };
  const { app } = buildApp({ httpClient });
  const server = await startTestServer(app, t);
  await createPeer(server);

  const res = await fetch(`${server}${BASE}/peer-1/push/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bundleId: "b1", confirmationToken: "t1", overwriteEntityKeys: ["post:p1"] }),
  });
  assert.equal(res.status, 200, await res.text());
  assert.deepEqual(executeBody, { bundleId: "b1", confirmationToken: "t1", overwriteEntityKeys: ["post:p1"] });
});
