import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { registerTransform, uploadMedia } from "../../features/media/index.js";
import type { PostRecord } from "../../features/post/index.js";
import type { MemberSessionRecord } from "../../features/members/index.js";
import { InMemoryMemberSessionRepo } from "../../features/members/index.js";

/**
 * @file The member/paid gate on `routes/site/media-rendition.ts`'s TWO public routes, exercised
 * against the content shapes the original 2026-09-03 gate never scanned — the 2026-09-05 audit's
 * CRITICAL finding 1 and HIGH finding 2.
 *
 * Sibling to `media-rendition-route.test.ts` (transform route) and
 * `media-original-video-route.test.ts` (video route), which between them already pin the gate's
 * behavior for a `bodyFormat: "doc"` post embedding a ref-based TipTap `image` node. This file
 * covers what those two do NOT: an `"html"`-format Page's `body_html` embed markers (the
 * `data-embed-config` vocabulary `core/embeds/marker.ts` owns), `kind: "page"` rows, video assets,
 * and the status/cache-header interactions the audit found. Same real-`createApp()`, real-HTTP
 * style both siblings use.
 */
async function withServer(run: (baseUrl: string, deps: ReturnType<typeof createRouteDeps>) => Promise<void>) {
  const deps = createRouteDeps();
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`, deps);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Same `blobRepo`/`assetBlobRepo` field-naming mapping both sibling suites' own `uploadOne`
 *  documents — `uploadMedia`'s deps shape isn't `RouteDeps` verbatim. */
async function uploadOne(deps: ReturnType<typeof createRouteDeps>, bytes: Uint8Array, filename: string, declaredContentType: string) {
  return uploadMedia({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      mediaRepo: deps.mediaRepo,
      blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo,
      blobStore: deps.blobStore,
    },
    input: { workspaceId: deps.workspaceId, bytes, filename, contentType: declaredContentType, createdByPrincipal: "user-1" },
  });
}

/** Same `transformRepo`/`transformDefinitionRepo` mapping `media-rendition-route.test.ts` documents. */
async function registerOne(deps: ReturnType<typeof createRouteDeps>, name: string) {
  return registerTransform({
    deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name, params: { format: "webp" }, owner: "core" },
  });
}

function bytesFrom(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

/** Same minimal `ftyp`/`isom` box `media-original-video-route.test.ts` uses so `sniffContentType`
 *  reports `video/mp4` from the bytes themselves. */
function mp4Bytes(payload: string): Uint8Array {
  const b = new Uint8Array(16 + payload.length);
  b.set(new TextEncoder().encode("ftyp"), 4);
  b.set(new TextEncoder().encode("isom"), 8);
  b.set(new TextEncoder().encode(payload), 16);
  return b;
}

/** Same shape both sibling suites' own `makePost` uses. */
function makePost(overrides: Partial<PostRecord> & Pick<PostRecord, "id" | "slug">, workspaceId: string): PostRecord {
  return {
    workspaceId,
    title: "Untitled",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-09-03T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

/** A ref-based TipTap `image` node — the one `bodyJson` shape the gate's scan has always recognized. */
function imageBody(assetId: string): PostRecord["bodyJson"] {
  return { type: "doc", content: [{ type: "image", attrs: { assetId, transformName: "public" } }] };
}

/** An `"html"`-format Page body embedding `assetId` through the `data-embed-config` marker
 *  vocabulary `core/embeds/marker.ts` parses and `widgets/resolver-service.ts`'s
 *  `resolveMediaTypeEmbeds` resolves — the ONLY way an `"html"` Page can reference an asset, and
 *  (per `render.ts`'s `renderWidgetMediaImage` -> `renderVideoTag`) the only way ANY entry can
 *  reference a video. Single-quoted attribute so the JSON's own double quotes need no escaping,
 *  exactly as that module's header specifies. */
function htmlEmbedBody(assetId: string): string {
  return `<section><div data-embed-config='{"type":"media","id":"${assetId}"}'></div></section>`;
}

const MEMBERS_ONLY = JSON.stringify({ visibility: "members" });

const RAW_MEMBER_TOKEN = "test-raw-member-session-token-for-media-gating-bypass";
function activeMemberSession(workspaceId: string): MemberSessionRecord {
  return {
    id: "session-media-gating-bypass-test",
    workspaceId,
    memberId: "member-media-gating-bypass-test-1",
    tokenHash: createHash("sha256").update(RAW_MEMBER_TOKEN).digest("hex"),
    createdAt: "2026-09-05T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Audit finding 1 — content shapes the reference scan never saw.
// ---------------------------------------------------------------------------

test("media gate: a VIDEO whose only referrer is a members-only html Page's media embed marker is 404'd for an anonymous caller, and served to an entitled member", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, mp4Bytes("gated-video-in-html-page"), "gated.mp4", "video/mp4");
    await deps.postRepo.save(
      makePost(
        {
          id: "p-html-video",
          slug: "gated-html-page-with-video",
          kind: "page",
          bodyFormat: "html",
          bodyHtml: htmlEmbedBody(media.id),
          memberAccessJson: MEMBERS_ONLY,
        },
        deps.workspaceId
      )
    );

    const anon = await fetch(`${baseUrl}/m/${media.id}/original`);
    assert.equal(anon.status, 404, "a members-only Page's video must not serve to an anonymous caller");
    assert.equal(anon.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await anon.json(), { error: "video rendition not found" });

    deps.memberSessionRepo = new InMemoryMemberSessionRepo([activeMemberSession(deps.workspaceId)]);
    const member = await fetch(`${baseUrl}/m/${media.id}/original`, {
      headers: { cookie: `tovu_member_session=${RAW_MEMBER_TOKEN}` },
    });
    assert.equal(member.status, 200, "an entitled signed-in member must still get the video");
    assert.equal(member.headers.get("content-type"), "video/mp4");
    assert.deepEqual(new Uint8Array(await member.arrayBuffer()), mp4Bytes("gated-video-in-html-page"));
  });
});

test("media gate: an IMAGE whose only referrer is a members-only html Page's media embed marker is 404'd for an anonymous caller, and served to an entitled member", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, bytesFrom("gated-image-in-html-page"), "gated.png", "image/png");
    const { definition } = await registerOne(deps, "public");
    await deps.postRepo.save(
      makePost(
        {
          id: "p-html-image",
          slug: "gated-html-page-with-image",
          kind: "page",
          bodyFormat: "html",
          bodyHtml: htmlEmbedBody(media.id),
          memberAccessJson: MEMBERS_ONLY,
        },
        deps.workspaceId
      )
    );

    const url = `${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/hero.webp`;
    const anon = await fetch(url);
    assert.equal(anon.status, 404, "a members-only Page's image must not serve to an anonymous caller");
    assert.equal(anon.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await anon.json(), { error: "rendition not found" });

    deps.memberSessionRepo = new InMemoryMemberSessionRepo([activeMemberSession(deps.workspaceId)]);
    const member = await fetch(url, { headers: { cookie: `tovu_member_session=${RAW_MEMBER_TOKEN}` } });
    assert.equal(member.status, 200, "an entitled signed-in member must still get the rendition");
    assert.equal(member.headers.get("cache-control"), "private, no-store");
  });
});

test("media gate: a PUBLIC html Page's media embed marker keeps its asset ungated and ordinarily cacheable — the extended scan must not gate what was always meant to be public", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, bytesFrom("public-image-in-html-page"), "public.png", "image/png");
    const { definition } = await registerOne(deps, "public");
    await deps.postRepo.save(
      makePost(
        { id: "p-html-public", slug: "public-html-page", kind: "page", bodyFormat: "html", bodyHtml: htmlEmbedBody(media.id) },
        deps.workspaceId
      )
    );

    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/p.webp`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  });
});

test("media gate: `kind: \"page\"` was never the gap — a doc-format Page's ref-based image node has always been scanned, because `PostRepoPort.list` is kind-blind", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, bytesFrom("gated-doc-page-image"), "docpage.png", "image/png");
    const { definition } = await registerOne(deps, "public");
    await deps.postRepo.save(
      makePost(
        { id: "p-doc-page", slug: "gated-doc-page", kind: "page", bodyJson: imageBody(media.id), memberAccessJson: MEMBERS_ONLY },
        deps.workspaceId
      )
    );

    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/dp.webp`);
    assert.equal(res.status, 404, "a members-only doc-format Page gates its media exactly as a members-only post does");
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  });
});

// ---------------------------------------------------------------------------
// Audit finding 2 — unpublishing a gated entry as a takedown.
// ---------------------------------------------------------------------------

test("media gate: reverting a published, members-only post to DRAFT does not release its media to the public web with a year-long CDN cache header", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, bytesFrom("takedown-bytes"), "takedown.png", "image/png");
    const { definition } = await registerOne(deps, "public");
    const url = `${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/t.webp`;
    const gatedPost = makePost(
      { id: "p-takedown", slug: "takedown-post", memberAccessJson: MEMBERS_ONLY, bodyJson: imageBody(media.id) },
      deps.workspaceId
    );
    await deps.postRepo.save(gatedPost);

    const whilePublished = await fetch(url);
    assert.equal(whilePublished.status, 404, "gated while published");

    await deps.postRepo.save({ ...gatedPost, status: "draft", version: 2 });

    const afterUnpublish = await fetch(url);
    assert.equal(
      afterUnpublish.status,
      404,
      "unpublishing a gated post is a takedown, not a release — its media must not become anonymously fetchable"
    );
    assert.equal(
      afterUnpublish.headers.get("cache-control"),
      "private, no-store",
      "and must never be stamped with the year-long shared/CDN immutable header"
    );
  });
});

test("media gate: an entitled member still reads the media of a gated post that was reverted to draft — the takedown fix gates, it does not blanket-deny", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, bytesFrom("takedown-member-bytes"), "takedown2.png", "image/png");
    const { definition } = await registerOne(deps, "public");
    await deps.postRepo.save(
      makePost(
        { id: "p-takedown-member", slug: "takedown-post-member", status: "draft", memberAccessJson: MEMBERS_ONLY, bodyJson: imageBody(media.id) },
        deps.workspaceId
      )
    );

    deps.memberSessionRepo = new InMemoryMemberSessionRepo([activeMemberSession(deps.workspaceId)]);
    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/tm.webp`, {
      headers: { cookie: `tovu_member_session=${RAW_MEMBER_TOKEN}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  });
});

// ---------------------------------------------------------------------------
// Audit finding 4 — the `Cache-Control` existence oracle.
// ---------------------------------------------------------------------------

test("media gate: a gate-denied 404 is byte-for-byte indistinguishable from an unknown-asset 404 — status, body AND Cache-Control", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, bytesFrom("oracle-bytes"), "oracle.png", "image/png");
    const { definition } = await registerOne(deps, "public");
    await deps.postRepo.save(
      makePost(
        { id: "p-oracle", slug: "oracle-post", memberAccessJson: MEMBERS_ONLY, bodyJson: imageBody(media.id) },
        deps.workspaceId
      )
    );

    const spec = `${definition.name}.v${definition.version}`;
    const gated = await fetch(`${baseUrl}/m/${media.id}/${spec}/o.webp`);
    const unknown = await fetch(`${baseUrl}/m/no-such-asset-id/${spec}/o.webp`);

    assert.equal(gated.status, 404);
    assert.equal(unknown.status, 404);
    assert.deepEqual(await gated.json(), await unknown.json());
    assert.equal(
      gated.headers.get("cache-control"),
      unknown.headers.get("cache-control"),
      "a differing Cache-Control is a free oracle for `this assetId exists and is gated` vs `does not exist`"
    );
  });
});

test("media gate: the same indistinguishability holds on the video route — a gated video's 404 matches a not-a-video 404", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, mp4Bytes("oracle-video"), "oracle.mp4", "video/mp4");
    await deps.postRepo.save(
      makePost(
        {
          id: "p-oracle-video",
          slug: "oracle-page-video",
          kind: "page",
          bodyFormat: "html",
          bodyHtml: htmlEmbedBody(media.id),
          memberAccessJson: MEMBERS_ONLY,
        },
        deps.workspaceId
      )
    );
    const { media: image } = await uploadOne(deps, bytesFrom("not-a-video"), "still.png", "image/png");

    const gated = await fetch(`${baseUrl}/m/${media.id}/original`);
    const notVideo = await fetch(`${baseUrl}/m/${image.id}/original`);

    assert.equal(gated.status, 404);
    assert.equal(notVideo.status, 404);
    assert.deepEqual(await gated.json(), await notVideo.json());
    assert.equal(gated.headers.get("cache-control"), notVideo.headers.get("cache-control"));
  });
});

// ---------------------------------------------------------------------------
// The fail-closed default for a body this scan cannot read — the guard against
// finding 1 recurring the next time a body format is added.
// ---------------------------------------------------------------------------

/** A `bodyFormat` outside `PostBodyFormat`'s two members, which is what a THIRD format would look
 *  like to this route on the day it lands: `bodyFormat` reaches the gate as a database column
 *  (`repo.sqlite.ts`'s `toRecord`), so a new value is live data here long before any type error
 *  points at `media-rendition.ts`. Cast because that is exactly the gap being exercised. */
const UNKNOWN_BODY_FORMAT = "mdx" as PostRecord["bodyFormat"];

test("media gate: a live GATED entry whose body format this scan cannot read denies an otherwise-unreferenced asset to an anonymous caller, and allows an entitled member", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, bytesFrom("unreadable-body-bytes"), "unreadable.png", "image/png");
    const { definition } = await registerOne(deps, "public");
    await deps.postRepo.save(
      makePost(
        {
          id: "p-unknown-format",
          slug: "gated-unknown-format",
          bodyFormat: UNKNOWN_BODY_FORMAT,
          bodyJson: {},
          memberAccessJson: MEMBERS_ONLY,
        },
        deps.workspaceId
      )
    );

    const url = `${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/u.webp`;
    const anon = await fetch(url);
    assert.equal(anon.status, 404, "an unreadable gated body must fail CLOSED — the scan cannot claim the asset is unreferenced");
    assert.equal(anon.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await anon.json(), { error: "rendition not found" });

    deps.memberSessionRepo = new InMemoryMemberSessionRepo([activeMemberSession(deps.workspaceId)]);
    const member = await fetch(url, { headers: { cookie: `tovu_member_session=${RAW_MEMBER_TOKEN}` } });
    assert.equal(member.status, 200, "it gates, it does not blanket-deny");
    assert.equal(member.headers.get("cache-control"), "private, no-store");
  });
});

test("media gate: a PUBLIC entry with an unreadable body format gates nothing — the fail-closed fallback keys off the author's own gating, not off unreadability alone", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, bytesFrom("unreadable-public-bytes"), "unreadable-public.png", "image/png");
    const { definition } = await registerOne(deps, "public");
    await deps.postRepo.save(
      makePost(
        { id: "p-unknown-format-public", slug: "public-unknown-format", bodyFormat: UNKNOWN_BODY_FORMAT, bodyJson: {} },
        deps.workspaceId
      )
    );

    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/up.webp`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  });
});

test("media gate: a REAL referrer outranks the unreadable-body fallback — an asset embedded in a public post stays public even while a gated unreadable entry exists", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, bytesFrom("real-referrer-wins"), "wins.png", "image/png");
    const { definition } = await registerOne(deps, "public");
    await deps.postRepo.save(makePost({ id: "p-public-referrer", slug: "public-referrer", bodyJson: imageBody(media.id) }, deps.workspaceId));
    await deps.postRepo.save(
      makePost(
        { id: "p-unreadable-bystander", slug: "unreadable-bystander", bodyFormat: UNKNOWN_BODY_FORMAT, bodyJson: {}, memberAccessJson: MEMBERS_ONLY },
        deps.workspaceId
      )
    );

    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/w.webp`);
    assert.equal(res.status, 200, "once the scan has FOUND the entries that embed an asset, an unrelated unreadable entry has no say");
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  });
});

test("media gate: an unparseable embed marker in a gated Page does NOT gate unrelated assets — a rejected marker is inert at render time, so it is not a hidden reference", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media } = await uploadOne(deps, bytesFrom("inert-marker-bystander"), "inert.png", "image/png");
    const { definition } = await registerOne(deps, "public");
    await deps.postRepo.save(
      makePost(
        {
          id: "p-broken-marker",
          slug: "gated-broken-marker",
          kind: "page",
          bodyFormat: "html",
          bodyHtml: `<div data-embed-config='{"type":"media","id":}'></div>`,
          memberAccessJson: MEMBERS_ONLY,
        },
        deps.workspaceId
      )
    );

    const res = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/i.webp`);
    assert.equal(
      res.status,
      200,
      "scanHtmlEmbeds/substituteHtmlEmbeds both skip a rejected marker, so it resolves to nothing and serves no asset"
    );
  });
});
