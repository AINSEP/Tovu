import { InMemoryPublishHistoryStore, listPublishDestinations } from "#src/features/deployments/static-publish/publish-history";
import { loadBundledDeployTargets } from "#src/features/deployments/deploy-targets/__tests__/bundled-deploy-targets.fixture";
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
    assert.equal(request.headers.authorization, `Bearer ${API_KEY}`, `${request.method} requests must authenticate`);
    this.calls.push(request);
    // Every peer route retains the feature's intended total budget, independently
    // of the network policy's shorter socket idle ceiling.
    assert.equal(request.totalDeadlineMs, 60_000);
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
    throw new EgressRefusedError({ message: "egress to 'peer.internal' (10.1.2.3) rejected: resolved address is private" }, {
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
    skipped: [],
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
    new EgressRefusedError({ message: "full" }, { callerSafeMessage: "refused" }),
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

  // A peer can echo the request's key in its body, so rejection diagnostics omit that body.
  const rejecting = new FakeHttpClient([{ match: /\/bundles$/, status: 403, bodyText: '{"error":"not authorized"}' }]);
  await assert.rejects(
    () => pushBundleToPeer(pushDeps(rejecting), { bundle: bundle() }),
    (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError);
      assert.equal(err.code, "PEER_REJECTED");
      assert.equal(err.peerStatus, 403);
      assert.equal(err.message.includes(API_KEY), false, "the api key leaked into a peer-rejection message");
      assert.match(err.message, /HTTP 403$/);
      assert.equal(err.message.includes("not authorized"), false);
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
  assert.deepEqual(JSON.parse(Buffer.from(http.calls[1].body ?? "{}").toString("utf8")), { dataBase64: Buffer.from([1, 2, 3]).toString("base64") });
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
  assert.deepEqual(JSON.parse(Buffer.from(http.calls[1].body ?? "{}").toString("utf8")), { shas: [shaMedia] });

  // The bundle actually staged on the peer holds only the two accepted types.
  const staged = JSON.parse(Buffer.from(http.calls[2].body ?? "{}").toString("utf8")) as { entities: Array<{ entityType: string }> };
  assert.deepEqual(staged.entities.map((entity) => entity.entityType), ["post", "media"]);
});

test("L061 a peer cannot request a blob removed by capability trimming", async () => {
  const keptSha = "1".repeat(64);
  const excludedSha = "2".repeat(64);
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, status: 404 },
    { match: /\/blobs\/probe$/, json: { missing: [keptSha, excludedSha] } },
  ]);
  const deps = { ...pushDeps(http),
    computeStorageKey: () => { return assert.fail("must validate the trimmed manifest before storage access"); },
    blobSource: {
      exists: async () => { return assert.fail("must not probe local storage"); },
      get: async () => { return assert.fail("must not read local bytes"); },
    },
  };
  await assert.rejects(pushBundleToPeer(deps, { bundle: bundle({
    entities: [
      packedEntity({ entityType: "media", requiredBlobs: [keptSha] }),
      packedEntity({ entityType: "redirect", requiredBlobs: [excludedSha] }),
    ],
    blobManifest: [keptSha, excludedSha],
  }) }), (error: unknown) => {
    assert.ok(error instanceof PublishContentPeerTransportError);
    assert.equal(error.code, "PEER_RESPONSE_INVALID");
    return true;
  });
  assert.equal(http.calls.length, 2, "refuse before any upload or staging request");
  assert.deepEqual(JSON.parse(Buffer.from(http.calls[1].body ?? "{}").toString("utf8")), { shas: [keptSha] });
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
  assert.deepEqual(JSON.parse(Buffer.from(http.calls[0].body ?? "{}").toString("utf8")), { planId: "p1", planHash: "h1" });

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
        entities: [{ entityType: "post", id: "p-1", schemaVersion: 2, hashVersion: 1,
          contentHash: "peer-agreement-hash", requiredBlobs: ["d".repeat(64)],
          state: { title: "Peer article", slug: "peer-article", bodyHtml: "<p>Published text</p>", status: "published" },
        }],
        blobManifest: ["d".repeat(64)],
      },
    },
  ]);
  const envelope = await pullBundleFromPeer({ httpClient: http, credential: CREDENTIAL });
  assert.equal(envelope.artifactFormatVersion, PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION);
  assert.equal(envelope.hashVersion, 1);
  assert.equal(envelope.sourceLabel, "Remote Site");
  assert.equal(envelope.entities.length, 1);
  assert.deepEqual(envelope.entities, [{ entityType: "post", id: "p-1", schemaVersion: 2, hashVersion: 1,
    contentHash: "peer-agreement-hash", requiredBlobs: ["d".repeat(64)],
    state: { title: "Peer article", slug: "peer-article", bodyHtml: "<p>Published text</p>", status: "published" },
  }]);
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
      assert.match(err.message, /could not be reached\.$/);
      assert.equal(err.message.includes("connect ETIMEDOUT"), false);
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

// ---------------------------------------------------------------------------
// S7: liveCanOverwrite + overwriteEntityKeys forwarding — overwrite-live-plan §4/S7.
// ---------------------------------------------------------------------------

test("a capabilities probe with no 'features' array gives liveCanOverwrite:false", async () => {
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, json: { entityTypes: ["post"] } },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);
  const result = await pushBundleToPeer(pushDeps(http), { bundle: bundle({ entities: [packedEntity()] }) });
  assert.equal(result.liveCanOverwrite, false);
});

test("a capabilities probe naming 'overwrite-live' in 'features' gives liveCanOverwrite:true", async () => {
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, json: { entityTypes: ["post"], features: ["overwrite-live"] } },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);
  const result = await pushBundleToPeer(pushDeps(http), { bundle: bundle({ entities: [packedEntity()] }) });
  assert.equal(result.liveCanOverwrite, true);
});

test("an old peer (404/401 legacy probe) always gives liveCanOverwrite:false", async () => {
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, status: 404 },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);
  const result = await pushBundleToPeer(pushDeps(http), { bundle: bundle({ entities: [packedEntity()] }) });
  assert.equal(result.liveCanOverwrite, false);
});

test("liveCanOverwrite is false, not undefined, when the probe is skipped for an empty bundle", async () => {
  const http = new FakeHttpClient([
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);
  const result = await pushBundleToPeer(pushDeps(http), { bundle: bundle() });
  assert.equal(result.liveCanOverwrite, false);
});

test("pushBundleToPeer sends overwriteEntityKeys on /import/plan when given, and omits the field entirely when not", async () => {
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, json: { entityTypes: ["post"], features: ["overwrite-live"] } },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);
  await pushBundleToPeer(pushDeps(http), { bundle: bundle(), overwriteEntityKeys: ["post:p1"] });
  const planCall = http.calls.find((call) => call.url.includes("/import/plan"));
  assert.deepEqual(JSON.parse(Buffer.from(planCall?.body ?? "{}").toString("utf8")), { bundleId: "remote-bundle-1", overwriteEntityKeys: ["post:p1"] });

  const http2 = new FakeHttpClient([
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-2" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);
  await pushBundleToPeer(pushDeps(http2), { bundle: bundle() });
  const planCall2 = http2.calls.find((call) => call.url.includes("/import/plan"));
  const parsed = JSON.parse(Buffer.from(planCall2?.body ?? "{}").toString("utf8")) as Record<string, unknown>;
  assert.equal("overwriteEntityKeys" in parsed, false, "an unspecified overwriteEntityKeys must not appear as an empty array or null");
});

test("executePeerImport sends overwriteEntityKeys when given, and omits the field entirely when not", async () => {
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, json: { entityTypes: ["post"], features: ["overwrite-live"] } },
    { match: /\/import\/execute$/, json: { restorePointId: "rp-1", runId: "run-1", changeSetIds: [] } },
  ]);
  await executePeerImport({ httpClient: http, credential: CREDENTIAL }, { bundleId: "b1", confirmationToken: "tok-1", overwriteEntityKeys: ["post:p1"] });
  const executeCall = http.calls.find((call) => call.url.includes("/import/execute"));
  assert.deepEqual(JSON.parse(Buffer.from(executeCall?.body ?? "{}").toString("utf8")), {
    bundleId: "b1",
    confirmationToken: "tok-1",
    overwriteEntityKeys: ["post:p1"],
  });

  const http2 = new FakeHttpClient([{ match: /\/import\/execute$/, json: { restorePointId: "rp-1", runId: "run-1", changeSetIds: [] } }]);
  await executePeerImport({ httpClient: http2, credential: CREDENTIAL }, { bundleId: "b1", confirmationToken: "tok-1" });
  const parsed = JSON.parse(Buffer.from(http2.calls[0].body ?? "{}").toString("utf8")) as Record<string, unknown>;
  assert.equal("overwriteEntityKeys" in parsed, false);
});

// A live that refuses ticks from a saved API key (`import.ts`'s `mayOverwrite`, 403
// credential_kind_not_permitted) gets a sentence the operator can act on, not the raw JSON body.
test("a 403 credential_kind_not_permitted from live becomes a plain sentence, for plan and execute", async () => {
  const refusal = {
    status: 403,
    json: {
      error: "'overwriteEntityKeys' can only be sent from a signed-in admin session or a publishing instance",
      code: "FORBIDDEN",
      details: { permission: "publish_content.apply", reason: "credential_kind_not_permitted" },
    },
  };
  const expected =
    "https://tovu.example.com only accepts \"Overwrite on live\" from a computer connected to it, not from a saved API key. " +
    "Connect this computer to https://tovu.example.com, then publish again.";
  const capabilities = { match: /\/capabilities$/, json: { entityTypes: ["post"], features: ["overwrite-live"] } };

  const planHttp = new FakeHttpClient([
    capabilities,
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, ...refusal },
  ]);
  const executeHttp = new FakeHttpClient([capabilities, { match: /\/import\/execute$/, ...refusal }]);

  for (const call of [
    () => pushBundleToPeer(pushDeps(planHttp), { bundle: bundle(), overwriteEntityKeys: ["post:p1"] }),
    () =>
      executePeerImport(
        { httpClient: executeHttp, credential: CREDENTIAL },
        { bundleId: "b1", confirmationToken: "tok-1", overwriteEntityKeys: ["post:p1"] }
      ),
  ]) {
    await assert.rejects(call, (err: unknown) => {
      assert.ok(err instanceof PublishContentPeerTransportError);
      assert.equal(err.code, "PEER_REJECTED");
      assert.equal(err.peerStatus, 403);
      assert.equal(err.message, expected);
      return true;
    });
  }
});

// An older live ignores a body field it doesn't know, so forwarding ticks to it would publish
// without the overwrite the operator asked for. Both calls refuse before anything is sent.
const OLD_LIVE_OVERWRITE_REFUSAL =
  "https://tovu.example.com is on an older Tovu, so it can't overwrite these yet. Update https://tovu.example.com, then publish again.";

test("pushBundleToPeer refuses overwriteEntityKeys when the peer does not advertise 'overwrite-live', and stages nothing", async () => {
  for (const capabilities of [{ json: { entityTypes: ["post"] } }, { status: 404 }]) {
    const http = new FakeHttpClient([
      { match: /\/capabilities$/, ...capabilities },
      { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
      { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
    ]);
    await assert.rejects(
      pushBundleToPeer(pushDeps(http), { bundle: bundle({ entities: [packedEntity()] }), overwriteEntityKeys: ["post:p1"] }),
      { name: "PublishContentPeerTransportError", code: "PEER_CANNOT_OVERWRITE", message: OLD_LIVE_OVERWRITE_REFUSAL }
    );
    assert.deepEqual(
      http.calls.map((call) => new URL(call.url).pathname.split("/").pop()),
      ["capabilities"],
      "nothing may be staged or planned once the refusal is known"
    );
  }
});

test("pushBundleToPeer with an empty overwriteEntityKeys list is not a request to overwrite, so an older peer is fine", async () => {
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, json: { entityTypes: ["post"] } },
    { match: /\/bundles$/, status: 201, json: { bundleId: "remote-bundle-1" } },
    { match: /\/import\/plan$/, json: { planId: "p1", planHash: "h1" } },
  ]);
  const result = await pushBundleToPeer(pushDeps(http), { bundle: bundle({ entities: [packedEntity()] }), overwriteEntityKeys: [] });
  assert.equal(result.liveCanOverwrite, false);
});

test("executePeerImport refuses overwriteEntityKeys when the peer does not advertise 'overwrite-live', and never calls execute", async () => {
  const http = new FakeHttpClient([
    { match: /\/capabilities$/, status: 404 },
    { match: /\/import\/execute$/, json: { restorePointId: "rp-1", runId: "run-1", changeSetIds: [] } },
  ]);
  await assert.rejects(
    executePeerImport({ httpClient: http, credential: CREDENTIAL }, { bundleId: "b1", confirmationToken: "tok-1", overwriteEntityKeys: ["post:p1"] }),
    { name: "PublishContentPeerTransportError", code: "PEER_CANNOT_OVERWRITE", message: OLD_LIVE_OVERWRITE_REFUSAL }
  );
  assert.equal(http.calls.some((call) => call.url.includes("/import/execute")), false);
});


test("outbound successful and partial peer applies append saved-peer history and list only that workspace's saved destinations", async () => {
  const historyStore = new InMemoryPublishHistoryStore();
  const at = "2026-10-18T10:00:00.000Z";
  for (const report of [{ refused: false, rows: [] }, { refused: false, rows: [{ outcome: "conflict" }] }]) {
    const result = { runId: "remote-run", report };
    const http = new FakeHttpClient([{ match: /\/import\/execute$/, json: result }]);
    assert.deepEqual(await executePeerImport({ httpClient: http, credential: CREDENTIAL,
      publishHistory: { store: historyStore, workspaceId: "source-ws", clock: { nowMs: () => Date.parse(at) } },
    }, { bundleId: "b1", confirmationToken: "token" }), result);
  }
  const rows = await historyStore.list({ workspaceId: "source-ws" });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.kind, "tovu-peer");
  assert.equal(rows[0]!.target, CREDENTIAL.id);
  const registry = await loadBundledDeployTargets();
  const peers = [{ id: CREDENTIAL.id, label: CREDENTIAL.label, baseUrl: CREDENTIAL.baseUrl }];
  const list = (workspaceId: string, saved = peers) => listPublishDestinations({ workspaceId, historyStore, registry, peers: saved });
  assert.deepEqual(await list("source-ws"), [{ id: `tovu-peer:${CREDENTIAL.id}`, kind: "tovu-peer", peerId: CREDENTIAL.id,
    label: CREDENTIAL.label, url: CREDENTIAL.baseUrl, lastPublishedAt: at }]);
  assert.deepEqual(await list("source-ws", []), [], "removed peers or unauthorized peer metadata are omitted");
  assert.deepEqual(await list("foreign-ws"), []);
  assert.equal(JSON.stringify(rows).includes(API_KEY), false);
});

test("a throwing history store preserves the successful remote apply and logs no error payload", async (t) => {
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  const store = new InMemoryPublishHistoryStore();
  store.recordSuccess = async () => { throw new Error(`database parameters: ${API_KEY}`); };
  const result = { runId: "remote-run", report: { refused: false, rows: [] } };
  const http = new FakeHttpClient([{ match: /\/import\/execute$/, json: result }]);
  assert.deepEqual(await executePeerImport({ httpClient: http, credential: CREDENTIAL,
    publishHistory: { store, workspaceId: "source-ws", clock: { nowMs: () => 0 } },
  }, { bundleId: "b1", confirmationToken: "token" }), result);
  assert.equal(http.calls.length, 1);
  assert.deepEqual(warnings, [["[publish-content] destination history write failed after remote apply"]]);
});

test("outbound failures, refusals and malformed success bodies never establish destinations", async () => {
  const store = new InMemoryPublishHistoryStore();
  for (const json of [{ ok: false, runId: "failed" }, { runId: "refused", report: { refused: true } }, {}]) {
    await executePeerImport({ httpClient: new FakeHttpClient([{ match: /\/import\/execute$/, json }]), credential: CREDENTIAL,
      publishHistory: { store, workspaceId: "source-ws", clock: { nowMs: () => 0 } },
    }, { bundleId: "b1", confirmationToken: "token" });
  }
  await assert.rejects(executePeerImport({ httpClient: new FakeHttpClient([{ match: /\/import\/execute$/, status: 500, json: {} }]), credential: CREDENTIAL,
    publishHistory: { store, workspaceId: "source-ws", clock: { nowMs: () => 0 } },
  }, { bundleId: "b1", confirmationToken: "token" }));
  assert.deepEqual(await store.list({ workspaceId: "source-ws" }), []);
});

test("pull labels an envelope with no sourceLabel after the saved peer", async () => {
  const http = new FakeHttpClient([
    { match: /\/export$/, json: { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: 1, entities: [], blobManifest: [] } },
  ]);
  const envelope = await pullBundleFromPeer({ httpClient: http, credential: CREDENTIAL });
  assert.equal(envelope.sourceLabel, "production");
});

test("a transport error raised inside the http client passes through unchanged, not re-wrapped as unreachable", async () => {
  const original = new PublishContentPeerTransportError("the peer refused the upload size", "PEER_RESPONSE_INVALID");
  const http: HttpClientPort = { send: async () => { throw original; } };
  await assert.rejects(pullBundleFromPeer({ httpClient: http, credential: CREDENTIAL }), (err: unknown) => err === original);
});
