import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { pullBlobsFromPeer, PublishContentPeerTransportError } from "../peer-transport.js";
import type { ResolvedPeerCredential } from "../peers.js";

/**
 * @file The PULL direction's blob leg — `pullBlobsFromPeer`, the client half of
 * `GET .../publish-content/blobs/:sha`.
 *
 * Sibling of `peer-transport.test.ts` (which certifies the push leg and the credential-leak
 * properties); kept in its own file so the pull-blob work is one revertible unit, per the
 * dispatching brief's "additive and easy to revert" constraint.
 *
 * ## The property this file exists to hold
 *
 * The bytes a peer hands back are UNTRUSTED. The sha is the identity everywhere in this feature
 * (baselines, `requiredBlobs`, `blobManifest`), and `BlobStorePort.putIfAbsent` does NOT verify
 * that bytes hash to the sha256 it is told (`blob-staging.ts`'s own header traces this) — it
 * derives the storage key from that string and writes whatever it was handed. So a peer that
 * answers `GET .../blobs/<X>` with bytes that are not X would poison this instance's
 * content-addressed store: every later "do you have X?" would answer yes, for the wrong bytes.
 * `pullBlobsFromPeer` therefore hashes what it received and refuses BEFORE `putIfAbsent`, and that
 * refusal is loud (a thrown typed error) rather than a silently skipped blob.
 */

const API_KEY = "tovu_live_SUPERSECRET_0123456789";

const CREDENTIAL: ResolvedPeerCredential = {
  id: "peer-1",
  label: "production",
  baseUrl: "https://tovu.example.com",
  remoteWorkspaceId: "remote-ws-9",
  apiKey: API_KEY,
};

const WORKSPACE = "local-ws-1";

function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Answers `GET .../blobs/:sha` from a sha -> body map; records every request so a test can assert
 *  which shas were actually asked for (the "already present locally" short-circuit). */
class FakeBlobPeer implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly bodies: Record<string, { status?: number; json?: unknown; bodyText?: string }>) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const sha = request.url.split("/").pop() ?? "";
    const route = this.bodies[sha];
    if (!route) return { status: 404, headers: {}, bodyText: JSON.stringify({ error: "blob was not found", code: "BLOB_NOT_FOUND" }) };
    return {
      status: route.status ?? 200,
      headers: {},
      bodyText: route.bodyText ?? JSON.stringify(route.json ?? {}),
    };
  }
}

/** A `BlobStorePort` write-seam double: records every `putIfAbsent`, so "nothing was written" is
 *  asserted against the real call list rather than inferred. */
class RecordingBlobSink {
  readonly written: Array<{ sha256: string; bytes: Uint8Array }> = [];
  constructor(private readonly present: Set<string> = new Set()) {}

  async exists({ storageKey }: { storageKey: string }): Promise<boolean> {
    return this.present.has(storageKey);
  }

  async putIfAbsent({ sha256, bytes }: { workspaceId: string; sha256: string; bytes: Uint8Array }) {
    this.written.push({ sha256, bytes });
    return { storageKey: `key/${sha256}`, written: true };
  }
}

function pullDeps(httpClient: HttpClientPort, blobSink: RecordingBlobSink, overrides: { maxBlobs?: number } = {}) {
  return {
    httpClient,
    credential: CREDENTIAL,
    blobSink,
    workspaceId: WORKSPACE,
    computeStorageKey: (sha256: string) => `key/${sha256}`,
    ...overrides,
  };
}

test("pull downloads each missing blob and writes the bytes it verified, under the PEER's workspace path", async () => {
  const first = Buffer.from([0x00, 0xff, 0x10, 0x42]);
  const second = Buffer.from("second blob bytes");
  const firstSha = sha256Of(first);
  const secondSha = sha256Of(second);

  const peer = new FakeBlobPeer({
    [firstSha]: { json: { sha256: firstSha, dataBase64: first.toString("base64") } },
    [secondSha]: { json: { sha256: secondSha, dataBase64: second.toString("base64") } },
  });
  const sink = new RecordingBlobSink();

  const result = await pullBlobsFromPeer(pullDeps(peer, sink), { blobManifest: [firstSha, secondSha] });

  assert.deepEqual([...result.downloaded], [firstSha, secondSha]);
  assert.deepEqual([...result.unavailable], []);
  assert.deepEqual(
    sink.written.map((entry) => entry.sha256),
    [firstSha, secondSha]
  );
  assert.deepEqual(Buffer.from(sink.written[0].bytes), first, "the stored bytes must be byte-for-byte what the peer sent");
  assert.deepEqual(Buffer.from(sink.written[1].bytes), second);
  assert.ok(
    peer.calls.every((call) => call.url.includes(`/workspaces/${CREDENTIAL.remoteWorkspaceId}/publish-content/blobs/`)),
    "every blob fetch must be built under the PEER's workspace id, never this instance's"
  );
  assert.ok(peer.calls.every((call) => call.method === "GET"));
});

test("pull never re-downloads a blob this instance already holds", async () => {
  const bytes = Buffer.from("already here");
  const sha = sha256Of(bytes);
  const peer = new FakeBlobPeer({ [sha]: { json: { sha256: sha, dataBase64: bytes.toString("base64") } } });
  const sink = new RecordingBlobSink(new Set([`key/${sha}`]));

  const result = await pullBlobsFromPeer(pullDeps(peer, sink), { blobManifest: [sha] });

  assert.deepEqual([...result.alreadyPresent], [sha]);
  assert.deepEqual([...result.downloaded], []);
  assert.equal(peer.calls.length, 0, "an already-present sha must cost no network call");
  assert.equal(sink.written.length, 0);
});

test("a repeated sha in the manifest is fetched ONCE", async () => {
  const bytes = Buffer.from("shared by two entities");
  const sha = sha256Of(bytes);
  const peer = new FakeBlobPeer({ [sha]: { json: { sha256: sha, dataBase64: bytes.toString("base64") } } });
  const sink = new RecordingBlobSink();

  const result = await pullBlobsFromPeer(pullDeps(peer, sink), { blobManifest: [sha, sha, sha] });

  assert.deepEqual([...result.downloaded], [sha]);
  assert.equal(peer.calls.length, 1);
  assert.equal(sink.written.length, 1);
});

test("bytes that do not hash to the requested sha FAIL LOUDLY and are never written to the store", async () => {
  const requested = sha256Of(Buffer.from("the real blob"));
  const impostor = Buffer.from("attacker-controlled bytes");
  const peer = new FakeBlobPeer({ [requested]: { json: { sha256: requested, dataBase64: impostor.toString("base64") } } });
  const sink = new RecordingBlobSink();

  await assert.rejects(
    () => pullBlobsFromPeer(pullDeps(peer, sink), { blobManifest: [requested] }),
    (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError, `expected a typed transport error, got ${String(err)}`);
      assert.equal(err.code, "PEER_RESPONSE_INVALID");
      assert.match(err.message, /hash/i);
      assert.ok(err.message.includes(requested), "the operator needs to be told WHICH sha the peer got wrong");
      assert.ok(!err.message.includes(API_KEY), "no failure message may carry the sealed key");
      return true;
    }
  );

  assert.equal(sink.written.length, 0, "a mismatched blob must never reach putIfAbsent");
});

test("a peer that answers a blob fetch with a non-object, or with no dataBase64, is refused rather than written", async () => {
  const shaA = sha256Of(Buffer.from("a"));
  const shaB = sha256Of(Buffer.from("b"));

  const notAnObject = new FakeBlobPeer({ [shaA]: { bodyText: JSON.stringify(["not", "an", "object"]) } });
  const sinkA = new RecordingBlobSink();
  await assert.rejects(
    () => pullBlobsFromPeer(pullDeps(notAnObject, sinkA), { blobManifest: [shaA] }),
    (err: unknown) => err instanceof PublishContentPeerTransportError && err.code === "PEER_RESPONSE_INVALID"
  );
  assert.equal(sinkA.written.length, 0);

  const noBytes = new FakeBlobPeer({ [shaB]: { json: { sha256: shaB } } });
  const sinkB = new RecordingBlobSink();
  await assert.rejects(
    () => pullBlobsFromPeer(pullDeps(noBytes, sinkB), { blobManifest: [shaB] }),
    (err: unknown) => err instanceof PublishContentPeerTransportError && err.code === "PEER_RESPONSE_INVALID"
  );
  assert.equal(sinkB.written.length, 0);
});

test("a blob the peer does not hold is REPORTED, not thrown — the entity that needs it is blocked by planImport, which is the fail-closed outcome", async () => {
  const held = Buffer.from("this one exists");
  const heldSha = sha256Of(held);
  const goneSha = sha256Of(Buffer.from("this one does not"));

  const peer = new FakeBlobPeer({ [heldSha]: { json: { sha256: heldSha, dataBase64: held.toString("base64") } } });
  const sink = new RecordingBlobSink();

  const result = await pullBlobsFromPeer(pullDeps(peer, sink), { blobManifest: [goneSha, heldSha] });

  assert.deepEqual([...result.unavailable], [goneSha]);
  assert.deepEqual([...result.downloaded], [heldSha], "one absent blob must not abort the rest of the pull");
  assert.equal(sink.written.length, 1);
});

test("a peer failure that is NOT a 404 aborts the pull instead of being silently recorded as unavailable", async () => {
  const sha = sha256Of(Buffer.from("server is broken"));
  const peer = new FakeBlobPeer({ [sha]: { status: 500, bodyText: JSON.stringify({ error: "internal error" }) } });
  const sink = new RecordingBlobSink();

  await assert.rejects(
    () => pullBlobsFromPeer(pullDeps(peer, sink), { blobManifest: [sha] }),
    (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError);
      assert.equal(err.code, "PEER_REJECTED");
      assert.equal(err.peerStatus, 500);
      assert.ok(!err.message.includes(API_KEY));
      return true;
    }
  );
  assert.equal(sink.written.length, 0);
});

test("the number of blobs one pull will fetch is CAPPED; the remainder is deferred, never silently dropped", async () => {
  const bodies: Record<string, { json: unknown }> = {};
  const shas: string[] = [];
  for (const label of ["one", "two", "three", "four"]) {
    const bytes = Buffer.from(label);
    const sha = sha256Of(bytes);
    shas.push(sha);
    bodies[sha] = { json: { sha256: sha, dataBase64: bytes.toString("base64") } };
  }
  const peer = new FakeBlobPeer(bodies);
  const sink = new RecordingBlobSink();

  const result = await pullBlobsFromPeer(pullDeps(peer, sink, { maxBlobs: 2 }), { blobManifest: shas });

  assert.deepEqual([...result.downloaded], shas.slice(0, 2));
  assert.deepEqual([...result.deferredOverCap], shas.slice(2));
  assert.equal(peer.calls.length, 2, "the cap must bound the network work, not merely the reported list");
});
