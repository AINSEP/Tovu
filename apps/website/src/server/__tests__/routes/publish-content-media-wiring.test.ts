import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { MediaRecord } from "#src/features/media/index";
import type { PublishContentReport } from "#src/features/publish-content/planner";
import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file The WIRED media path for the publish-content feature — `media`'s contributor, its `apply()`
 * and its registration in `publish-content-manifest.ts` were all landed and green
 * (`features/media/__tests__/publish-content.apply.test.ts`) while media STILL could not travel,
 * because every place that builds a `PublishContentDeps` bag omitted `mediaRepo`/`assetBlobRepo`/
 * `blobStore`. `features/media/publish-content.ts` degrades SILENTLY when they are absent — `pack()`
 * returns at `if (!deps.mediaRepo) return;` and `inspect()` returns `null` — so the failure showed up
 * as "media simply is not in the bundle", with no error anywhere.
 *
 * These two tests therefore assert TRAVEL, never field presence. A `assert.ok(deps.mediaRepo)`-style
 * check would pass against every broken wiring this file exists to catch.
 *
 * 1. **Round trip** — a media row on a source instance is exported, staged on a SECOND instance,
 *    plans as `created` (never `blocked`), and after execute the destination's own `mediaRepo`
 *    actually holds the row. That covers three of the five deps-bag builders at once:
 *    `routes/publish-content/export.ts` (pack), `routes/publish-content/import.ts` (inspect +
 *    precheck — an unwired bag makes media's `precheck` return "no mediaRepo wired…", which the
 *    planner turns into `blocked`), and `composition/app.ts`'s apply-port bag (an unwired bag makes
 *    `apply()` throw its named wiring error, which aborts the run rather than downgrading a row).
 * 2. **Push** — the outbound driver's own bundle, built through
 *    `routes/publish-content/peer-transport.ts`'s deps bag, carries the media entity. This is a
 *    SEPARATE proof: that route file has its own builder, and a push walks `buildExportBundle`
 *    rather than the export route, so it can be broken while test 1 is green.
 *
 * The real SQLite composition root (`composition/deps.ts`) has no hermetic harness; it is held to the
 * same contract by `toPublishContentApplyDeps`'s REQUIRED media parameters, which make an omission
 * there a compile error rather than a silent skip.
 */

const WORKSPACE = "workspace-local";

/** Real sha256 of these exact bytes, pinned as a literal rather than recomputed at test time — same
 *  discipline as `features/media/__tests__/publish-content.apply.test.ts`'s own pinned digest. */
const PHOTO_BYTES = new TextEncoder().encode("a real imported photo's bytes");
const PHOTO_SHA256 = "86d9075d85c1cce55da0605a557dceaea6c27f18df8702ce86accccce8a41aa9";

const MEDIA_ID = "source-system-asset-42";

type Deps = ReturnType<typeof createRouteDeps>;

async function startServer(deps: Deps = createRouteDeps()) {
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { deps, server, baseUrl: `http://127.0.0.1:${address.port}` };
}

/** Reads a response body exactly once and asserts `status` against that same read — avoids the
 *  "Body is unusable" double-consume bug an `assert.equal(res.status, N, await res.text())` plus
 *  `res.json()` would hit even on the passing path. */
async function expectJson<T>(res: Response, status: number): Promise<T> {
  const raw = await res.text();
  assert.equal(res.status, status, raw);
  return JSON.parse(raw) as T;
}

async function loginAsOwner(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(res.status, 200, await res.text());
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function makeMediaRecord(): MediaRecord {
  return {
    id: MEDIA_ID,
    workspaceId: WORKSPACE,
    title: "Team Photo",
    slug: "team-photo",
    alt: "The whole team",
    caption: "",
    credit: "",
    source: { sha256: PHOTO_SHA256 },
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 7,
    width: 800,
    height: 600,
    cssClass: "rounded",
    htmlAttributes: null,
  } as unknown as MediaRecord;
}

/** Puts one media row plus its bytes on an instance, exactly where a real upload would leave them:
 *  the row in `mediaRepo`, the bytes in the content-addressed `blobStore`. */
async function seedMedia(deps: Deps): Promise<MediaRecord> {
  const record = makeMediaRecord();
  await deps.mediaRepo.save(record);
  await deps.blobStore.putIfAbsent({ workspaceId: WORKSPACE, sha256: PHOTO_SHA256, bytes: PHOTO_BYTES });
  return record;
}

function mediaRowOf(report: PublishContentReport) {
  return report.rows.find((row) => row.entityType === "media" && row.entityId === MEDIA_ID);
}

// ---------------------------------------------------------------------------
// 1. Export -> stage -> plan -> execute: media actually lands on the destination
// ---------------------------------------------------------------------------

test("publish-content media: a media row exports, plans as 'created' (never 'blocked'), and apply() writes it on the destination", async (t) => {
  const source = await startServer();
  t.after(() => new Promise<void>((resolve) => source.server.close(() => resolve())));
  const destination = await startServer();
  t.after(() => new Promise<void>((resolve) => destination.server.close(() => resolve())));

  const record = await seedMedia(source.deps);
  const sourceCookie = await loginAsOwner(source.baseUrl);
  const destinationCookie = await loginAsOwner(destination.baseUrl);

  // (a) The EXPORT bag — `routes/publish-content/export.ts`. Unwired, `pack()` returns immediately
  //     and the bundle simply has no media in it.
  const bundle = await expectJson<{ entities: Array<{ entityType: string; id: string; requiredBlobs: string[] }> }>(
    await fetch(`${source.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/export`, { headers: { cookie: sourceCookie } }),
    200
  );
  const packed = bundle.entities.find((entity) => entity.entityType === "media" && entity.id === record.id);
  assert.ok(packed, `the export bundle must carry the media entity; got types ${JSON.stringify(bundle.entities.map((e) => e.entityType))}`);
  assert.deepEqual(packed.requiredBlobs, [PHOTO_SHA256]);

  // The destination received the bytes through Task 6's blob pre-flight before any plan runs.
  await destination.deps.blobStore.putIfAbsent({ workspaceId: WORKSPACE, sha256: PHOTO_SHA256, bytes: PHOTO_BYTES });

  const { bundleId } = await expectJson<{ bundleId: string }>(
    await fetch(`${destination.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/bundles`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: destinationCookie },
      body: JSON.stringify(bundle),
    }),
    201
  );

  // (b) The PLAN bag — `routes/publish-content/import.ts`. Unwired, media's own `precheck` answers
  //     "no mediaRepo wired for this deps bag" and the planner reports the row as `blocked`.
  const planned = await expectJson<{ planId: string; planHash: string; details: PublishContentReport }>(
    await fetch(`${destination.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: destinationCookie },
      body: JSON.stringify({ bundleId }),
    }),
    200
  );
  const row = mediaRowOf(planned.details);
  assert.ok(row, `the plan must contain a row for the media entity; got ${JSON.stringify(planned.details.rows)}`);
  assert.notEqual(row.outcome, "blocked", `media planned as blocked: ${row.reason}`);
  assert.equal(row.outcome, "created");
  assert.equal(row.writes, true);

  const { confirmationToken } = await expectJson<{ confirmationToken: string }>(
    await fetch(`${destination.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: destinationCookie },
      body: JSON.stringify({ planId: planned.planId, planHash: planned.planHash }),
    }),
    200
  );

  // (c) The APPLY bag — `composition/app.ts`. Unwired, `media.apply()` throws its named
  //     "requires PublishContentDeps.mediaRepo/assetBlobRepo/blobStore" error, which is a bare
  //     `Error` and so aborts the whole run with a 500 instead of downgrading one row.
  await expectJson<{ restorePointId: string; changeSetIds: string[] }>(
    await fetch(`${destination.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import/execute`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: destinationCookie },
      body: JSON.stringify({ bundleId, confirmationToken }),
    }),
    200
  );

  const landed = await destination.deps.mediaRepo.findById({ workspaceId: WORKSPACE, id: record.id });
  assert.ok(landed, "apply() must have written the media row on the destination — media did not travel");
  assert.equal(landed.title, "Team Photo");
  assert.equal(landed.slug, "team-photo");
  // The SOURCE id is preserved (`importMediaEntity`'s own contract), which is what makes a post's
  // embedded reference to this asset still resolve after the import.
  assert.equal(landed.id, MEDIA_ID);
});

// ---------------------------------------------------------------------------
// 2. Push: the outbound driver's bundle carries media too
// ---------------------------------------------------------------------------

/** Answers the four calls `pushBundleToPeer` makes, and records every request so the test can read
 *  back the bundle body the driver actually sent. No egress policy is involved: this stands in for
 *  `RouteDeps.publishContentPeerHttpClient` itself, which is the seam the policy lives behind. */
class CapturingPeerClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const json = (value: unknown): HttpResponse => ({ status: 200, headers: {}, bodyText: JSON.stringify(value) });
    // A new-build peer (S-F1): it advertises every type, so nothing is trimmed before staging.
    if (request.url.endsWith("/publish-content/capabilities")) {
      return json({ entityTypes: ["post", "page", "media", "redirect", "menu"], schemaVersions: {} });
    }
    if (request.url.includes("/blobs/probe")) return json({ missing: [] });
    if (request.url.includes("/publish-content/blobs/")) return json({ stored: true });
    if (request.url.endsWith("/publish-content/bundles")) return json({ bundleId: "peer-bundle-1" });
    if (request.url.endsWith("/publish-content/import/plan")) {
      return json({ planId: "peer-plan-1", planHash: "peer-hash-1", details: { refused: false, refusalReason: null, applyOrder: [], rows: [] } });
    }
    throw new Error(`unexpected peer request: ${request.method} ${request.url}`);
  }

  /** The body of the bundle-staging call, parsed — the thing a push actually hands the peer. */
  stagedBundle(): { entities: Array<{ entityType: string; id: string }>; blobManifest: string[] } {
    const staged = this.calls.find((call) => call.method === "POST" && call.url.endsWith("/publish-content/bundles"));
    assert.ok(staged?.body, "the push driver must have staged a bundle on the peer");
    return JSON.parse(staged.body) as { entities: Array<{ entityType: string; id: string }>; blobManifest: string[] };
  }
}

test("publish-content media: a PUSH to a peer carries the media entity and names its blob", async (t) => {
  const deps = createRouteDeps();
  const peerClient = new CapturingPeerClient();
  deps.publishContentPeerHttpClient = peerClient;

  const { baseUrl, server } = await startServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const record = await seedMedia(deps);
  const cookie = await loginAsOwner(baseUrl);

  const peersBase = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/peers`;
  const { peer } = await expectJson<{ peer: { id: string } }>(
    await fetch(peersBase, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        label: "production",
        baseUrl: "https://peer.example.com",
        remoteWorkspaceId: "remote-ws-9",
        apiKey: "tovu_live_0123456789abcdef",
      }),
    }),
    201
  );

  await expectJson<{ bundleId: string }>(
    await fetch(`${peersBase}/${peer.id}/push/plan`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: "{}" }),
    200
  );

  const staged = peerClient.stagedBundle();
  const pushed = staged.entities.find((entity) => entity.entityType === "media" && entity.id === record.id);
  assert.ok(pushed, `the pushed bundle must carry the media entity; got types ${JSON.stringify(staged.entities.map((e) => e.entityType))}`);
  // The manifest is what makes the peer's blob pre-flight ask for these bytes at all — a pushed
  // media entity whose sha never reaches the manifest is blocked on arrival.
  assert.ok(staged.blobManifest.includes(PHOTO_SHA256), `the pushed blobManifest must name the media blob; got ${JSON.stringify(staged.blobManifest)}`);
});
