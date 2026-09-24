import assert from "node:assert/strict";
import test from "node:test";

import { EgressRefusedError, type HttpClientPort, type HttpRequest, type HttpResponse } from "../../../platform/http/index.js";
import type { PublishContentExportEnvelope } from "../export-bundle.js";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "../artifact-format.js";
import {
  confirmPeerImport,
  describePeerEgressRefusal,
  executePeerImport,
  pullBundleFromPeer,
  pushBundleToPeer,
  PublishContentPeerTransportError,
} from "../peer-transport.js";
import type { ResolvedPeerCredential } from "../peers.js";
import type { PackedEntity } from "../type-registry.js";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.6/§4 task 10.
 *
 * Certifies the two properties this task's dispatch names explicitly:
 *
 * 1. A private-address peer with no `devHostAllowlist` entry fails with a message that NAMES
 *    `devHostAllowlist`, not a generic network error.
 * 2. The sealed key never appears in a log, a report, or an error body — asserted against the
 *    driver's real outputs (every result and every thrown error), not by code review.
 *
 * Plus the push order the correctness of a plan depends on: blobs, THEN the bundle, THEN the plan.
 */

const API_KEY = "tovu_live_SUPERSECRET_0123456789";

const CREDENTIAL: ResolvedPeerCredential = {
  id: "peer-1",
  label: "production",
  baseUrl: "https://tovu.example.com",
  remoteWorkspaceId: "remote-ws-9",
  apiKey: API_KEY,
};

/** Route-matching fake `HttpClientPort` — each entry answers the first request whose URL matches.
 *  Records every request so a test can assert the ORDER the driver called the peer in, which is the
 *  property a plan's correctness depends on. Kept local per this codebase's "each test file owns its
 *  own fixtures" convention. */
class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly routes: Array<{ match: RegExp; status?: number; json?: unknown; bodyText?: string }>) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const route = this.routes.find((candidate) => candidate.match.test(request.url));
    if (!route) throw new Error(`unexpected request: ${request.method} ${request.url}`);
    return {
      status: route.status ?? 200,
      headers: {},
      bodyText: route.bodyText ?? JSON.stringify(route.json ?? {}),
    };
  }
}

/** An `HttpClientPort` that refuses every call the way `client.ts` refuses a non-public resolved
 *  address — the REAL error class and the REAL two-message split, not a stand-in. */
class RefusingHttpClient implements HttpClientPort {
  async send(): Promise<HttpResponse> {
    throw new EgressRefusedError("egress to 'peer.internal' (10.1.2.3) rejected: resolved address is private", {
      callerSafeMessage: "egress to 'peer.internal' rejected: resolved address is private",
    });
  }
}

function bundle(overrides: Partial<PublishContentExportEnvelope> = {}): PublishContentExportEnvelope {
  return {
    artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
    hashVersion: 1,
    sourceLabel: "Local Site",
    entities: [],
    blobManifest: [],
    ...overrides,
  };
}

function packedEntity(overrides: Partial<PackedEntity> = {}): PackedEntity {
  return {
    entityType: "post",
    id: "e1",
    schemaVersion: 1,
    contentHash: "hash1",
    hashVersion: 1,
    requiredBlobs: [],
    state: {},
    ...overrides,
  };
}

function pushDeps(httpClient: HttpClientPort, blobs: Record<string, Uint8Array> = {}) {
  return {
    httpClient,
    credential: CREDENTIAL,
    blobSource: {
      exists: async ({ storageKey }: { storageKey: string }) => storageKey in blobs,
      get: async ({ storageKey }: { storageKey: string }) => blobs[storageKey],
    },
    computeStorageKey: (sha256: string) => `key/${sha256}`,
  };
}

test("a private-address peer without a devHostAllowlist entry fails with a message naming devHostAllowlist", async () => {
  const privatePeer: ResolvedPeerCredential = { ...CREDENTIAL, baseUrl: "https://peer.internal" };

  await assert.rejects(
    () => pullBundleFromPeer({ httpClient: new RefusingHttpClient(), credential: privatePeer }),
    (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError, "must be this feature's typed transport error");
      assert.equal(err.code, "EGRESS_REFUSED");
      assert.match(err.message, /devHostAllowlist/);
      assert.match(err.message, /TOVU_PUBLISH_CONTENT_DEV_HOSTS/);
      assert.match(err.message, /add 'peer\.internal'/);
      assert.match(err.message, /deliberate SSRF guard, not a network fault/);
      // The FULL refusal names the resolved address; the operator-facing one must not (see
      // `platform/http/errors.ts` on internal-DNS mapping).
      assert.equal(err.message.includes("10.1.2.3"), false, "the resolved address must not be echoed");
      return true;
    }
  );
});

test("the same diagnosis is produced for a push, not only a pull", async () => {
  await assert.rejects(
    () => pushBundleToPeer(pushDeps(new RefusingHttpClient()), { bundle: bundle({ blobManifest: ["a".repeat(64)] }) }),
    (err: unknown) => err instanceof PublishContentPeerTransportError && /devHostAllowlist/.test(err.message)
  );
});

test("describePeerEgressRefusal names the bracket-stripped IPv6 host exactly as an allowlist entry is written", () => {
  const described = describePeerEgressRefusal(
    new EgressRefusedError("full", { callerSafeMessage: "refused" }),
    "https://[fd00::1]:3000"
  );
  assert.match(described.message, /add 'fd00::1'/);
  assert.equal(described.message.includes("["), false);
});

test("the api key is sent as a bearer header and appears in NO result and NO error message", async () => {
  const http = new FakeHttpClient([
    { match: /\/blobs\/probe$/, json: { missing: [] } },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1", expiresAt: "2026-09-19T00:00:00.000Z" } },
    { match: /\/import\/plan$/, json: { domain: "publish_content.import", planId: "p1", planHash: "h1", details: { rows: [] } } },
  ]);

  const result = await pushBundleToPeer(pushDeps(http), { bundle: bundle({ blobManifest: ["a".repeat(64)] }) });

  // The key IS on the wire — that is the point of the credential. It must be there and nowhere else.
  assert.equal(http.calls[0].headers.authorization, `Bearer ${API_KEY}`);
  assert.equal(JSON.stringify(result).includes(API_KEY), false, "the api key leaked into the push result");

  // And a peer rejection quotes the PEER's body, never the request that carried the key.
  const rejecting = new FakeHttpClient([{ match: /\/bundles$/, status: 403, bodyText: '{"error":"not authorized"}' }]);
  await assert.rejects(
    () => pushBundleToPeer(pushDeps(rejecting), { bundle: bundle() }),
    (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError);
      assert.equal(err.code, "PEER_REJECTED");
      assert.equal(err.peerStatus, 403);
      assert.equal(err.message.includes(API_KEY), false, "the api key leaked into a peer-rejection message");
      assert.match(err.message, /not authorized/);
      return true;
    }
  );
});

test("push uploads only the blobs the peer is missing, BEFORE staging and planning", async () => {
  const sha = "b".repeat(64);
  const http = new FakeHttpClient([
    { match: /\/blobs\/probe$/, json: { missing: [sha] } },
    { match: new RegExp(`/blobs/${sha}$`), json: { written: true } },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);

  const result = await pushBundleToPeer(pushDeps(http, { [`key/${sha}`]: new Uint8Array([1, 2, 3]) }), {
    bundle: bundle({ blobManifest: [sha] }),
  });

  assert.deepEqual(result.blobsUploaded, [sha]);
  assert.deepEqual(result.blobsUnavailable, []);
  assert.equal(result.bundleId, "remote-bundle-1");
  // Order is the safety property: a blob uploaded AFTER planning would make the plan wrong the
  // moment it is acted on (`planImport` blocks an entity whose blob is absent).
  assert.deepEqual(
    http.calls.map((call) => `${call.method} ${call.url.replace(/^https:\/\/tovu\.example\.com/, "")}`),
    [
      "POST /api/admin/v1/workspaces/remote-ws-9/publish-content/blobs/probe",
      `PUT /api/admin/v1/workspaces/remote-ws-9/publish-content/blobs/${sha}`,
      "POST /api/admin/v1/workspaces/remote-ws-9/publish-content/bundles",
      "POST /api/admin/v1/workspaces/remote-ws-9/publish-content/import/plan",
    ]
  );
  assert.deepEqual(JSON.parse(http.calls[1].body ?? "{}"), { dataBase64: Buffer.from([1, 2, 3]).toString("base64") });
});

test("a blob the peer lacks and this instance no longer holds is reported, never silently skipped", async () => {
  const sha = "c".repeat(64);
  const http = new FakeHttpClient([
    { match: /\/blobs\/probe$/, json: { missing: [sha] } },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);

  const result = await pushBundleToPeer(pushDeps(http), { bundle: bundle({ blobManifest: [sha] }) });
  assert.deepEqual(result.blobsUnavailable, [sha]);
  assert.deepEqual(result.blobsUploaded, []);
});

test("push skips the probe entirely when the bundle needs no blobs", async () => {
  const http = new FakeHttpClient([
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);
  await pushBundleToPeer(pushDeps(http), { bundle: bundle() });
  assert.equal(http.calls.some((call) => call.url.includes("/blobs/")), false);
});

// ---------------------------------------------------------------------------
// S-F1: the capabilities probe + trim — `ADS-memory/.local-artifacts/publish-files-plan-2026-09-24.md` §5/§6.
// ---------------------------------------------------------------------------

test("push skips the capabilities probe entirely when the bundle has no entities", async () => {
  const http = new FakeHttpClient([
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);
  const result = await pushBundleToPeer(pushDeps(http), { bundle: bundle() });
  assert.equal(http.calls.some((call) => call.url.includes("/capabilities")), false);
  assert.deepEqual(result.notSupportedByLive, []);
});

test("push probes capabilities BEFORE blobs/bundle/plan, trims to the legacy set on a 404, and reports what stayed behind", async () => {
  const shaMedia = "1".repeat(64);
  const shaRedirect = "2".repeat(64);
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, status: 404 },
    { match: /\/blobs\/probe$/, json: { missing: [] } },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);

  const result = await pushBundleToPeer(pushDeps(http), {
    bundle: bundle({
      entities: [
        packedEntity({ entityType: "post", id: "p1" }),
        packedEntity({ entityType: "media", id: "m1", requiredBlobs: [shaMedia] }),
        packedEntity({ entityType: "redirect", id: "r1", requiredBlobs: [shaRedirect] }),
      ],
      blobManifest: [shaMedia, shaRedirect],
    }),
  });

  // A 404 means legacy `{post,page,media}` — the redirect is left behind, never an error.
  assert.deepEqual(result.notSupportedByLive, [{ entityType: "redirect", count: 1 }]);

  assert.deepEqual(
    http.calls.map((call) => `${call.method} ${call.url.replace(/^https:\/\/tovu\.example\.com/, "")}`),
    [
      "GET /api/admin/v1/workspaces/remote-ws-9/publish-content/capabilities",
      "POST /api/admin/v1/workspaces/remote-ws-9/publish-content/blobs/probe",
      "POST /api/admin/v1/workspaces/remote-ws-9/publish-content/bundles",
      "POST /api/admin/v1/workspaces/remote-ws-9/publish-content/import/plan",
    ]
  );

  // The redirect's own blob is never even probed — its entity was already trimmed out before the
  // blob leg ran, so no bytes are wasted uploading something that will not be sent.
  assert.deepEqual(JSON.parse(http.calls[1].body ?? "{}"), { shas: [shaMedia] });

  // The bundle actually staged on the peer holds only the two accepted types.
  const staged = JSON.parse(http.calls[2].body ?? "{}") as { entities: Array<{ entityType: string }> };
  assert.deepEqual(staged.entities.map((entity) => entity.entityType), ["post", "media"]);
});

test("an OLD build answers a publishing credential's capabilities probe with 401 (its route allowlist predates the route) — read as the legacy set, and the push proceeds", async () => {
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, status: 401, json: { error: "unauthenticated", code: "UNAUTHENTICATED" } },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);

  const result = await pushBundleToPeer(pushDeps(http), {
    bundle: bundle({ entities: [packedEntity({ entityType: "post", id: "p1" }), packedEntity({ entityType: "menu", id: "menu-header-nav" })] }),
  });

  assert.deepEqual(result.notSupportedByLive, [{ entityType: "menu", count: 1 }]);
  assert.equal(result.bundleId, "remote-bundle-1");
});

test("a 401 probe never masks a genuinely refused credential: the next leg's own 401 still aborts the push", async () => {
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, status: 401, json: { error: "unauthenticated" } },
    { match: /\/bundles$/, status: 401, json: { error: "unauthenticated" } },
  ]);
  await assert.rejects(
    () => pushBundleToPeer(pushDeps(http), { bundle: bundle({ entities: [packedEntity()] }) }),
    (err: unknown) => err instanceof PublishContentPeerTransportError && err.code === "PEER_REJECTED" && err.peerStatus === 401
  );
});

test("a peer that names its own accepted types trims to exactly those, counting each excluded type separately", async () => {
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, json: { entityTypes: ["post"] } },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);

  const result = await pushBundleToPeer(pushDeps(http), {
    bundle: bundle({
      entities: [
        packedEntity({ entityType: "post", id: "p1" }),
        packedEntity({ entityType: "media", id: "m1" }),
        packedEntity({ entityType: "media", id: "m2" }),
      ],
    }),
  });

  assert.deepEqual(result.notSupportedByLive, [{ entityType: "media", count: 2 }]);
  assert.equal(http.calls.some((call) => call.url.includes("/blobs/")), false, "nothing here has a requiredBlob");
});

test("a capabilities response with no entityTypes array is a response-shape failure, not a silent 'accepts nothing'", async () => {
  const http = new FakeHttpClient([{ match: /\/capabilities$/, json: { ok: true } }]);
  await assert.rejects(
    () => pushBundleToPeer(pushDeps(http), { bundle: bundle({ entities: [packedEntity()] }) }),
    (err: unknown) => err instanceof PublishContentPeerTransportError && err.code === "PEER_RESPONSE_INVALID"
  );
});

test("a non-404 capabilities failure aborts the push rather than silently falling back to the legacy set", async () => {
  const http = new FakeHttpClient([{ match: /\/capabilities$/, status: 500, bodyText: "boom" }]);
  await assert.rejects(
    () => pushBundleToPeer(pushDeps(http), { bundle: bundle({ entities: [packedEntity()] }) }),
    (err: unknown) =>
      err instanceof PublishContentPeerTransportError && err.code === "PEER_REJECTED" && err.peerStatus === 500
  );
});

test("a peer that stages without returning a bundleId is a response-shape failure, not a silent undefined", async () => {
  const http = new FakeHttpClient([{ match: /\/bundles$/, status: 201, json: { expiresAt: "later" } }]);
  await assert.rejects(
    () => pushBundleToPeer(pushDeps(http), { bundle: bundle() }),
    (err: unknown) => err instanceof PublishContentPeerTransportError && err.code === "PEER_RESPONSE_INVALID"
  );
});

test("a non-JSON peer response is diagnosed as 'is this a Tovu instance', not as a parse crash", async () => {
  const http = new FakeHttpClient([{ match: /\/export$/, bodyText: "<!doctype html><html>nginx</html>" }]);
  await assert.rejects(
    () => pullBundleFromPeer({ httpClient: http, credential: CREDENTIAL }),
    (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError);
      assert.equal(err.code, "PEER_RESPONSE_INVALID");
      assert.match(err.message, /is 'tovu\.example\.com' a Tovu instance\?/);
      return true;
    }
  );
});

test("confirm and execute relay to the peer's own gated ceremony", async () => {
  const http = new FakeHttpClient([
    { match: /\/import\/confirm$/, json: { confirmationToken: "tok-1" } },
    { match: /\/import\/execute$/, json: { restorePointId: "rp-1", runId: "run-1", changeSetIds: ["cs-1"] } },
  ]);

  const confirmed = await confirmPeerImport({ httpClient: http, credential: CREDENTIAL }, { planId: "p1", planHash: "h1" });
  assert.deepEqual(confirmed, { confirmationToken: "tok-1" });
  assert.deepEqual(JSON.parse(http.calls[0].body ?? "{}"), { planId: "p1", planHash: "h1" });

  const executed = await executePeerImport({ httpClient: http, credential: CREDENTIAL }, { bundleId: "b1", confirmationToken: "tok-1" });
  assert.deepEqual(executed, { restorePointId: "rp-1", runId: "run-1", changeSetIds: ["cs-1"] });
});

test("a peer that confirms without returning a token is a response-shape failure", async () => {
  const http = new FakeHttpClient([{ match: /\/import\/confirm$/, json: {} }]);
  await assert.rejects(
    () => confirmPeerImport({ httpClient: http, credential: CREDENTIAL }, { planId: "p1", planHash: "h1" }),
    (err: unknown) => err instanceof PublishContentPeerTransportError && err.code === "PEER_RESPONSE_INVALID"
  );
});

test("pull returns the peer's envelope, and a non-bundle response is refused rather than staged", async () => {
  const http = new FakeHttpClient([
    {
      match: /\/export$/,
      json: {
        artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
        hashVersion: 1,
        sourceLabel: "Remote Site",
        entities: [{ entityType: "post", id: "p-1", schemaVersion: 1 }],
        blobManifest: ["d".repeat(64)],
      },
    },
  ]);
  const envelope = await pullBundleFromPeer({ httpClient: http, credential: CREDENTIAL });
  assert.equal(envelope.artifactFormatVersion, PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION);
  assert.equal(envelope.hashVersion, 1);
  assert.equal(envelope.sourceLabel, "Remote Site");
  assert.equal(envelope.entities.length, 1);
  assert.deepEqual(envelope.blobManifest, ["d".repeat(64)]);

  const wrong = new FakeHttpClient([{ match: /\/export$/, json: { ok: true } }]);
  await assert.rejects(
    () => pullBundleFromPeer({ httpClient: wrong, credential: CREDENTIAL }),
    (err: unknown) =>
      err instanceof PublishContentPeerTransportError &&
      err.code === "PEER_RESPONSE_INVALID" &&
      /was not a publish-content bundle/.test(err.message)
  );

  const unknownVersion = new FakeHttpClient([
    {
      match: /\/export$/,
      json: { artifactFormatVersion: 2, hashVersion: 1, entities: [], blobManifest: [] },
    },
  ]);
  await assert.rejects(
    () => pullBundleFromPeer({ httpClient: unknownVersion, credential: CREDENTIAL }),
    (err: unknown) =>
      err instanceof PublishContentPeerTransportError &&
      err.code === "PEER_RESPONSE_INVALID" &&
      /artifact format version 2/.test(err.message)
  );
});

test("a transport failure that is not an egress refusal reads as unreachable, and still carries no key", async () => {
  const exploding: HttpClientPort = {
    send: async () => {
      throw new Error("connect ETIMEDOUT");
    },
  };
  await assert.rejects(
    () => pullBundleFromPeer({ httpClient: exploding, credential: CREDENTIAL }),
    (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError);
      assert.equal(err.code, "PEER_UNREACHABLE");
      assert.match(err.message, /connect ETIMEDOUT/);
      assert.equal(err.message.includes("devHostAllowlist"), false, "an ordinary timeout must not be diagnosed as an allowlist gap");
      assert.equal(err.message.includes(API_KEY), false);
      return true;
    }
  );
});

test("every peer route is built under the PEER's workspace id, never this instance's", async () => {
  const http = new FakeHttpClient([
    { match: /\/bundles$/, status: 201, json: { bundleId: "b" } },
    { match: /\/import\/plan$/, json: { planId: "p", planHash: "h" } },
  ]);
  await pushBundleToPeer(pushDeps(http), { bundle: bundle() });
  for (const call of http.calls) {
    assert.match(call.url, /\/workspaces\/remote-ws-9\//);
  }
});
