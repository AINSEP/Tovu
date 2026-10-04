import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { computeBlobStorageKey } from "@jini-ai/cms/media";

import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file End-to-end proof that blob BYTES travel on the pull direction — the thing that was
 * impossible before `GET .../publish-content/blobs/:sha` existed (2026-09-19).
 *
 * Two real composition roots on two real HTTP servers. The bytes go:
 *
 *   source `PUT .../blobs/:sha`  (real route, real blob store)
 *     -> destination `POST .../peers/:id/pull`  (real route, real peer row, real sealed credential)
 *       -> `pullBundleFromPeer` + `pullBlobsFromPeer`  (real drivers)
 *         -> source `GET .../blobs/:sha`  (real route, real authorization)
 *           -> destination blob store  (real `putIfAbsent`)
 *
 * and the assertion reads them back out of the DESTINATION's store, plus through the destination's
 * own `blobs/probe` route — the product-visible answer to "do you have this blob now?", which was
 * `no` for every pulled media asset until this leg existed.
 *
 * ## The two things this harness substitutes, and why
 *
 * 1. **The transport.** `publishContentPeerHttpClient` is replaced with a client that forwards to
 *    the source server by path. The real one is ADR-038-guarded and https-only with private
 *    addresses denied (`createPublishContentPeerEgressPolicy`), so it cannot dial a loopback test
 *    server by design — that refusal is itself certified in `peers.routes.test.ts`. The peer ROW
 *    still holds a normal `https://` URL and a real sealed credential, so nothing in the route or
 *    the driver knows this is a test.
 * 2. **The source's export envelope.** The forwarder answers `/export` with a hand-built envelope
 *    naming the uploaded sha. Real entities would require the media packing path, which is being
 *    changed concurrently by another task; the manifest is the only input `pullBlobsFromPeer`
 *    takes, and the bytes behind it are fetched from the REAL source route, so the byte path under
 *    test is untouched by the substitution.
 *
 * The blob route's own authorization is certified separately and against real principals in
 * `publish-content-blob-get.test.ts`; this file is about the wiring and the bytes.
 */

const WORKSPACE = "workspace-local";

async function startServer(deps: ReturnType<typeof createRouteDeps>) {
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  await deps.identityReady;
  const address = server.address() as AddressInfo;
  return { deps, server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function loginAsOwner(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(res.status, 200, `login failed: ${await res.text()}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Forwards authentication unchanged; only a successfully authorized export's entity body is replaced. */
function forwardingPeerClient(source: { baseUrl: string }, envelope: unknown): HttpClientPort & { paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    async send(request: HttpRequest): Promise<HttpResponse> {
      const path = new URL(request.url).pathname;
      paths.push(path);
      const forwarded = await fetch(`${source.baseUrl}${path}`, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body as string }),
      });
      const bodyText = await forwarded.text();
      return { status: forwarded.status, headers: {}, bodyText: forwarded.status === 200 && path.endsWith("/publish-content/export") ? JSON.stringify(envelope) : bodyText };
    },
  };
}

async function issueSourceReadKey(source: Awaited<ReturnType<typeof startServer>>, cookie: string): Promise<string> {
  const policyId = "pull-reader-policy";
  await source.deps.policyRepo.save({ id: policyId, workspaceId: WORKSPACE, name: "Pull reader", isBuiltin: false, isFrozen: false });
  await source.deps.policyPermissionRepo.save({ id: "pull-reader-grant", workspaceId: WORKSPACE, policyId, permission: "publish_content.read", resourceType: null, constraintJson: null });
  const principalRes = await fetch(`${source.baseUrl}/api/admin/v1/api-keys/principals`, {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ displayName: "Pull reader" }),
  });
  assert.equal(principalRes.status, 201, await principalRes.clone().text());
  const { principal } = await principalRes.json() as { principal: { id: string } };
  const keyRes = await fetch(`${source.baseUrl}/api/admin/v1/api-keys`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ principalId: principal.id, label: "Pull", policyIds: [policyId] }),
  });
  assert.equal(keyRes.status, 201, await keyRes.clone().text());
  return (await keyRes.json() as { apiKey: { rawKey: string } }).apiKey.rawKey;
}

async function createPeer(baseUrl: string, cookie: string, apiKey = "tovu_live_0123456789abcdef"): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/peers`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      label: "source-of-truth",
      baseUrl: "https://source.example.com",
      remoteWorkspaceId: WORKSPACE,
      apiKey,
    }),
  });
  const raw = await res.text();
  assert.equal(res.status, 201, `creating the peer row failed: ${raw}`);
  return (JSON.parse(raw) as { peer: { id: string } }).peer.id;
}

async function pull(baseUrl: string, cookie: string, peerId: string) {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/peers/${peerId}/pull`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: "{}",
  });
  const raw = await res.text();
  return { status: res.status, raw, body: JSON.parse(raw) as Record<string, unknown> };
}

test("a pull carries blob BYTES from the source instance into the destination's own blob store", async (t) => {
  const source = await startServer(createRouteDeps());
  t.after(() => new Promise<void>((resolve) => source.server.close(() => resolve())));
  const sourceCookie = await loginAsOwner(source.baseUrl);

  // Real bytes, with a non-UTF-8 byte in them so a lossy text round-trip anywhere on the path
  // would corrupt them and fail the sha check rather than passing silently.
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xfe, 0xff, 0x00, 0x7f]);
  const sha = sha256Of(bytes);
  const upload = await fetch(`${source.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${sha}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: sourceCookie },
    body: JSON.stringify({ dataBase64: bytes.toString("base64") }),
  });
  assert.equal(upload.status, 200, await upload.text());

  const missingSha = sha256Of(Buffer.from("source does not hold these bytes"));
  const sourceKey = await issueSourceReadKey(source, sourceCookie);
  const destDeps = createRouteDeps();
  const envelope = {
    artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
    hashVersion: 1, sourceLabel: "Source Site", entities: [], blobManifest: [sha],
  };
  const client = forwardingPeerClient({ baseUrl: source.baseUrl }, envelope);
  destDeps.publishContentPeerHttpClient = client;
  const dest = await startServer(destDeps);
  t.after(() => new Promise<void>((resolve) => dest.server.close(() => resolve())));
  const destCookie = await loginAsOwner(dest.baseUrl);

  const storageKey = computeBlobStorageKey({ workspaceId: WORKSPACE, sha256: sha });
  assert.equal(await destDeps.blobStore.exists({ storageKey }), false, "the destination must start without these bytes");

  const peerId = await createPeer(dest.baseUrl, destCookie, sourceKey);
  const first = await pull(dest.baseUrl, destCookie, peerId);
  assert.equal(first.status, 201, first.raw);
  assert.deepEqual(first.body.blobsDownloaded, [sha]);
  assert.deepEqual(first.body.blobsUnavailable, []);
  assert.ok(typeof first.body.bundleId === "string");
  const staged = await destDeps.publishContentBundleRepo.findById({ workspaceId: WORKSPACE, id: first.body.bundleId });
  assert.ok(staged, "the returned local bundle ID must address a persisted bundle");
  assert.equal(staged.artifactFormatVersion, 1);
  assert.equal(staged.hashVersion, 1);
  assert.deepEqual(JSON.parse(staged.entitiesJson), []);
  assert.deepEqual(JSON.parse(staged.blobManifestJson), [sha]);
  assert.equal(await destDeps.blobStore.exists({ storageKey: computeBlobStorageKey({ workspaceId: WORKSPACE, sha256: missingSha }) }), false);
  assert.ok(
    client.paths.includes(`/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${sha}`),
    `the driver must have called the peer's blob GET route; called: ${client.paths.join(", ")}`
  );

  // THE claim: the bytes are in the destination's store, byte-for-byte.
  assert.equal(await destDeps.blobStore.exists({ storageKey }), true);
  assert.deepEqual(Buffer.from(await destDeps.blobStore.get({ storageKey })), bytes);

  // And the destination now answers the product-visible question the same way: "I have that blob."
  const probe = await fetch(`${dest.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: destCookie },
    body: JSON.stringify({ shas: [sha] }),
  });
  const probeRaw = await probe.text();
  assert.equal(probe.status, 200, probeRaw);
  assert.deepEqual((JSON.parse(probeRaw) as { missing: string[] }).missing, []);

  // A second pull re-fetches nothing — the `exists()` short-circuit, end to end.
  const callsAfterFirst = client.paths.length;
  const second = await pull(dest.baseUrl, destCookie, peerId);
  assert.equal(second.status, 201, second.raw);
  assert.deepEqual(second.body.blobsAlreadyPresent, [sha]);
  assert.deepEqual(second.body.blobsDownloaded, []);
  assert.deepEqual(second.body.blobsUnavailable, []);
  assert.equal(
    client.paths.slice(callsAfterFirst).filter((path) => path.includes("/blobs/")).length,
    0,
    "a blob already held must cost no second fetch"
  );

  // The same authorized source now names a blob it cannot serve (404): stage the bundle anyway.
  envelope.blobManifest.push(missingSha);
  const callsBeforeMissing = client.paths.length;
  const missing = await pull(dest.baseUrl, destCookie, peerId);
  assert.equal(missing.status, 201, missing.raw);
  assert.deepEqual(missing.body.blobsDownloaded, []);
  assert.deepEqual(missing.body.blobsAlreadyPresent, [sha]);
  assert.deepEqual(missing.body.blobsUnavailable, [missingSha]);
  assert.deepEqual(client.paths.slice(callsBeforeMissing).filter((path) => path.includes("/blobs/")), [
    `/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${missingSha}`,
  ]);
  assert.ok(typeof missing.body.bundleId === "string");
  const partial = await destDeps.publishContentBundleRepo.findById({ workspaceId: WORKSPACE, id: missing.body.bundleId });
  assert.ok(partial);
  assert.deepEqual(JSON.parse(partial.blobManifestJson), [sha, missingSha]);
  assert.equal(await destDeps.blobStore.exists({ storageKey: computeBlobStorageKey({ workspaceId: WORKSPACE, sha256: missingSha }) }), false);

});

test("a pull whose peer serves bytes that do not hash to the requested sha fails 502 and stores NOTHING", async (t) => {
  const source = await startServer(createRouteDeps());
  t.after(() => new Promise<void>((resolve) => source.server.close(() => resolve())));
  const sourceCookie = await loginAsOwner(source.baseUrl);

  // The source holds DIFFERENT bytes under its own (correct) sha; the envelope will ask the
  // destination to fetch a sha the source answers with those other bytes — the poisoning attempt.
  const honest = Buffer.from("the bytes the source actually has");
  const honestSha = sha256Of(honest);
  const upload = await fetch(`${source.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/${honestSha}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: sourceCookie },
    body: JSON.stringify({ dataBase64: honest.toString("base64") }),
  });
  assert.equal(upload.status, 200, await upload.text());

  const victimSha = sha256Of(Buffer.from("what the destination believes it is fetching"));
  const destDeps = createRouteDeps();
  // A hostile peer: every blob fetch, whatever sha is asked for, answers with the honest bytes.
  destDeps.publishContentPeerHttpClient = {
    async send(request: HttpRequest): Promise<HttpResponse> {
      if (new URL(request.url).pathname.endsWith("/publish-content/export")) {
        return {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
            hashVersion: 1,
            sourceLabel: "Hostile",
            entities: [],
            blobManifest: [victimSha],
          }),
        };
      }
      return { status: 200, headers: {}, bodyText: JSON.stringify({ sha256: victimSha, dataBase64: honest.toString("base64") }) };
    },
  };
  const dest = await startServer(destDeps);
  t.after(() => new Promise<void>((resolve) => dest.server.close(() => resolve())));
  const destCookie = await loginAsOwner(dest.baseUrl);

  const peerId = await createPeer(dest.baseUrl, destCookie);
  const result = await pull(dest.baseUrl, destCookie, peerId);

  assert.equal(result.status, 502, result.raw);
  assert.equal(result.body.code, "PEER_RESPONSE_INVALID");
  assert.equal(result.body.error, `the peer's bytes for blob '${victimSha}' do not hash to it — refusing to store them under that sha256, because the hash IS the identity this feature addresses content by`);

  const poisoned = computeBlobStorageKey({ workspaceId: WORKSPACE, sha256: victimSha });
  assert.equal(await destDeps.blobStore.exists({ storageKey: poisoned }), false, "mismatched bytes must never be stored");
  // And the failed pull staged no bundle either — nothing half-applied.
  assert.equal(result.body.bundleId, undefined);
});


test("a pull with an invalid source API key is refused before staging a bundle", async (t) => {
  const source = await startServer(createRouteDeps());
  t.after(() => new Promise<void>((resolve) => source.server.close(() => resolve())));
  const destDeps = createRouteDeps();
  const sha = sha256Of(Buffer.from("unavailable to an invalid credential"));
  destDeps.publishContentPeerHttpClient = forwardingPeerClient(source, {
    artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: 1,
    sourceLabel: "Source", entities: [], blobManifest: [sha],
  });
  const dest = await startServer(destDeps);
  t.after(() => new Promise<void>((resolve) => dest.server.close(() => resolve())));
  const cookie = await loginAsOwner(dest.baseUrl);
  const peerId = await createPeer(dest.baseUrl, cookie, `tovu_ak_000000000000.${"A".repeat(43)}`);
  const result = await pull(dest.baseUrl, cookie, peerId);
  assert.equal(result.status, 502, result.raw);
  assert.equal(result.body.code, "PEER_REJECTED");
  assert.equal(result.body.bundleId, undefined);
  assert.equal(await destDeps.blobStore.exists({ storageKey: computeBlobStorageKey({ workspaceId: WORKSPACE, sha256: sha }) }), false);
});
