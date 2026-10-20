import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { callPeer, pullBlobsFromPeer, pushBundleToPeer, PublishContentPeerTransportError } from "../peer-transport.js";
import type { ResolvedPeerCredential } from "../peers.js";
import type { PublishContentExportEnvelope } from "../export-bundle.js";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "../artifact-format.js";

const credential: ResolvedPeerCredential = { id: "peer", label: "Live", baseUrl: "https://live.example", remoteWorkspaceId: "remote", apiKey: ["fixture", "credential"].join("-") };
function client({ reply }: { reply: (request: HttpRequest) => HttpResponse }, _options = {}) {
  const calls: HttpRequest[] = [];
  const httpClient: HttpClientPort = { send: async (request) => { calls.push(request); return reply(request); } };
  return { httpClient, credential, calls };
}
function response({ status = 200, bodyText = "{}" }: { status?: number; bodyText?: string }, _options = {}): HttpResponse { return { status, headers: {}, bodyText }; }

test("L061 peer call preserves archive precedence, JSON/null encoding, empty body and deadlines", async () => {
  const deps = client({ reply: () => response({ status: 204 }) });
  const archive = new Uint8Array([1, 2]);
  for (const payload of [{}, { body: null }, { body: { x: 1 } }, { body: { ignored: true }, archive }]) {
    assert.equal(await callPeer(deps, { method: "POST", path: "/route", ...payload }), undefined);
  }
  assert.equal(deps.calls[0].body, undefined);
  assert.equal(deps.calls[0].headers["content-type"], undefined);
  assert.equal(deps.calls[1].body, "null");
  assert.equal(deps.calls[2].body, '{"x":1}');
  assert.equal(deps.calls[2].headers["content-type"], "application/json");
  assert.equal(deps.calls[3].body, archive);
  assert.equal(deps.calls[3].headers["content-type"], "application/zip");
  for (const call of deps.calls) {
    assert.equal(call.headers.authorization, `Bearer ${credential.apiKey}`);
    assert.equal(call.timeoutMs, 60_000);
    assert.equal(call.totalDeadlineMs, 60_000);
  }
});

test("L061 peer call retains rejection, invalid JSON and network error contracts", async () => {
  for (const status of [199, 300, 403, 500]) {
    const deps = client({ reply: () => response({ status, bodyText: "x".repeat(500) }) });
    await assert.rejects(callPeer(deps, { method: "GET", path: "/route" }), (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError);
      assert.equal(err.code, "PEER_REJECTED");
      assert.equal(err.peerStatus, status);
      assert.equal(err.message, `the peer refused GET /route with HTTP ${status}`);
      return true;
    });
  }
  const refusal = client({ reply: () => response({ status: 403, bodyText: JSON.stringify({ details: { reason: "credential_kind_not_permitted" } }) }) });
  await assert.rejects(callPeer(refusal, { method: "POST", path: "/route" }), /Connect this computer/);
  const invalid = client({ reply: () => response({ bodyText: "not-json" }) });
  await assert.rejects(callPeer(invalid, { method: "GET", path: "/route" }), (err: unknown) => err instanceof PublishContentPeerTransportError && err.code === "PEER_RESPONSE_INVALID");
  const good = client({ reply: () => response({ bodyText: "null" }) });
  assert.equal(await callPeer(good, { method: "GET", path: "/route" }), null);
  for (const failure of [new Error("offline"), "offline"]) {
    const httpClient: HttpClientPort = { send: async () => { throw failure; } };
    await assert.rejects(callPeer({ httpClient, credential }, { method: "GET", path: "/route" }), /could not be reached\.$/);
  }
});

test("L061 push pins mixed missing blobs and malformed probe fallback before stage/plan", async () => {
  const bundle: PublishContentExportEnvelope = { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: 1, sourceLabel: "Local", entities: [], blobManifest: ["held", "gone"], skipped: [] };
  for (const missing of [["held", 1, "gone"], undefined, "bad"]) {
    const deps = client({ reply: (request) => {
      if (request.url.endsWith("/blobs/probe")) return response({ bodyText: JSON.stringify({ missing }) });
      if (request.url.endsWith("/bundles")) return response({ bodyText: '{"bundleId":"b"}' });
      return response({});
    } });
    const result = await pushBundleToPeer({ ...deps, computeStorageKey: (sha) => sha, blobSource: {
      exists: async ({ sha256 }) => sha256 === "held", get: async () => new Uint8Array([1]),
    } }, { bundle });
    assert.deepEqual(result.blobsUploaded, Array.isArray(missing) ? ["held"] : []);
    assert.deepEqual(result.blobsUnavailable, Array.isArray(missing) ? ["gone"] : []);
    assert.ok(deps.calls.at(-2)?.url.endsWith("/bundles"));
    assert.ok(deps.calls.at(-1)?.url.endsWith("/import/plan"));
  }
});

test("L061 pull cap counts missing fetches, skips held blobs and deduplicates before network I/O", async () => {
  const bytes = Buffer.from("verified");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const deps = client({ reply: (request) => request.url.endsWith("/gone") ? response({ status: 404 }) : response({ bodyText: JSON.stringify({ dataBase64: bytes.toString("base64") }) }) });
  const written: string[] = [];
  const result = await pullBlobsFromPeer({ ...deps, workspaceId: "local", maxBlobs: 2, computeStorageKey: (s) => s, blobSink: {
    exists: async ({ storageKey }) => storageKey === "held",
    putIfAbsent: async ({ sha256 }) => { written.push(sha256); return { storageKey: sha256, written: true }; },
  } }, { blobManifest: ["held", "gone", "gone", sha, "deferred", "held"] });
  assert.deepEqual(result, { downloaded: [sha], alreadyPresent: ["held"], unavailable: ["gone"], deferredOverCap: ["deferred"] });
  assert.deepEqual(written, [sha]);
  assert.equal(deps.calls.length, 2);
});

test("L061 pull refuses malformed payloads and non-404 failures before any write", async () => {
  for (const reply of [response({ bodyText: "[]" }), response({}), response({ bodyText: '{"dataBase64":"garbage"}' }), response({ status: 500 })]) {
    const deps = client({ reply: () => reply });
    await assert.rejects(pullBlobsFromPeer({ ...deps, workspaceId: "local", computeStorageKey: (s) => s, blobSink: {
      exists: async () => false, putIfAbsent: async () => { assert.fail("must not write"); },
    } }, { blobManifest: ["a".repeat(64)] }), PublishContentPeerTransportError);
  }
});

test("L061 transport errors omit upstream messages and bodies, including opaque credentials", async () => {
  for (const failure of [new Error(credential.apiKey), credential.apiKey, { body: credential.apiKey }]) {
    const httpClient: HttpClientPort = { send: async () => { throw failure; } };
    await assert.rejects(callPeer({ httpClient, credential }, { method: "GET", path: "/route" }), (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError);
      assert.equal(err.code, "PEER_UNREACHABLE");
      assert.equal(err.message, "the peer at 'live.example' could not be reached.");
      assert.equal(err.message.includes(credential.apiKey), false);
      return true;
    });
  }
  for (const status of [401, 403, 500]) {
    const deps = client({ reply: () => response({ status, bodyText: JSON.stringify({ error: credential.apiKey }) }) });
    await assert.rejects(callPeer(deps, { method: "GET", path: "/route" }), (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError);
      assert.equal(err.code, "PEER_REJECTED");
      assert.equal(err.peerStatus, status);
      assert.equal(err.message, `the peer refused GET /route with HTTP ${status}`);
      assert.equal(err.message.includes(credential.apiKey), false);
      return true;
    });
  }
});

test("L061 diagnostics reuse secret redaction for credential-shaped request context", async () => {
  const secret = ["ghp", "_", "a".repeat(36)].join("");
  const deps = client({ reply: () => response({ status: 500 }) });
  await assert.rejects(callPeer(deps, { method: "GET", path: `/route/${secret}` }), (err: unknown) => {
    assert.ok(err instanceof PublishContentPeerTransportError);
    assert.equal(err.code, "PEER_REJECTED");
    assert.equal(err.message.includes(secret), false);
    assert.match(err.message, /REDACTED/);
    return true;
  });
});

test("L061 a peer cannot request uploads outside the selected manifest, even after a valid hash", async () => {
  for (const missing of [["unrelated"], ["selected", "unrelated"], ["unrelated", "selected"]]) {
    const deps = client({ reply: request => {
      assert.ok(request.url.endsWith("/blobs/probe"));
      return response({ bodyText: JSON.stringify({ missing }) });
    } });
    const bundle: PublishContentExportEnvelope = { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: 1, sourceLabel: "Local", entities: [], blobManifest: ["selected"], skipped: [] };
    await assert.rejects(pushBundleToPeer({ ...deps,
      computeStorageKey: () => { return assert.fail("must not compute an unapproved storage key"); },
      blobSource: {
        exists: async () => { return assert.fail("must not probe local storage"); },
        get: async () => { return assert.fail("must not read local bytes"); },
      },
    }, { bundle }), (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError);
      assert.equal(err.code, "PEER_RESPONSE_INVALID");
      assert.equal(err.message, "the peer requested a blob outside the selected manifest");
      return true;
    });
    assert.equal(deps.calls.length, 1, 'invalid probes must neither upload nor stage a bundle');
  }
});
