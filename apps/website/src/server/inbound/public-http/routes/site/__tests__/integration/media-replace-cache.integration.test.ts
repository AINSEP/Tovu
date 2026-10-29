import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { InMemoryMemberSessionRepo } from "#src/features/members/index";
import { replaceMediaFile } from "@jini-ai/cms/media";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteMediaRepo, SqliteAssetBlobRepo, SqliteAssetRenditionRepo, SqliteMediaContentTypeStore } from "#src/platform/db/sqlite/media-repo.sqlite";
import { uploadMedia, registerTransform } from "#src/features/media/index";
import { resolveMediaPublicUrls } from "#src/features/media/tool-registrations";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

async function fixture(t: test.TestContext) {
  const db = openContentDb(":memory:");
  t.after(() => db.$client.close());
  const deps = createRouteDeps();
  Object.assign(deps, { mediaRepo: new SqliteMediaRepo(db), assetBlobRepo: new SqliteAssetBlobRepo(db),
    assetRenditionRepo: new SqliteAssetRenditionRepo(db), mediaContentTypeStore: new SqliteMediaContentTypeStore(db) });
  const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>');
  const { media } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
    input: { workspaceId: deps.workspaceId, bytes, filename: "cover.svg", contentType: "image/svg+xml", createdByPrincipal: "owner" } });
  await deps.mediaContentTypeStore.set({ workspaceId: deps.workspaceId, sha256: media.source.sha256, contentType: "image/svg+xml" });
  await registerTransform({ deps: { ...deps, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name: "public", params: { format: "webp" }, owner: "core" } });
  const baseUrl = await startTestServer(createApp(deps), t);
  return { deps, media, baseUrl, url: `${baseUrl}/m/${media.id}/public.v1/image.webp` };
}

// Guards renditionCacheControl's bare-id fallback and the response's SHA/rendition ETag writer.
test("replacing bytes keeps a bare id revalidating, changes its strong ETag and serves the new body", async t => {
  const { deps, media, url } = await fixture(t);
  const before = await fetch(url);
  assert.equal(before.status, 200);
  assert.equal(before.headers.get("cache-control"), "public, max-age=60, must-revalidate");
  const oldEtag = before.headers.get("etag")!;
  assert.match(oldEtag, /^"[^"\r\n]+"$/);
  const oldBody = await before.text();
  const oldPublicUrl = (await resolveMediaPublicUrls(deps, [media])).get(media.id);
  assert.equal(oldPublicUrl, `/m/${media.slug}/original.svg?v=${media.source.sha256.slice(0, 12)}`);
  const replacement = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>');
  const saved = await replaceMediaFile({ deps, media, bytes: replacement, contentType: "image/svg+xml", principalId: "owner" });
  assert.ok(saved);
  assert.notEqual(saved.source.sha256, media.source.sha256);
  const newPublicUrl = (await resolveMediaPublicUrls(deps, [saved])).get(saved.id);
  assert.equal(newPublicUrl, `/m/${saved.slug}/original.svg?v=${saved.source.sha256.slice(0, 12)}`);
  assert.notEqual(newPublicUrl, oldPublicUrl);
  const after = await fetch(url, { cache: "no-cache", headers: { "If-None-Match": oldEtag } });
  assert.equal(after.status, 200);
  assert.equal(after.headers.get("cache-control"), "public, max-age=60, must-revalidate");
  assert.notEqual(after.headers.get("etag"), oldEtag);
  const newBody = await after.text();
  assert.notEqual(newBody, oldBody);
  assert.match(newBody, /<circle r="4"/);
  const unchanged = await fetch(url, { cache: "no-cache", headers: { "If-None-Match": after.headers.get("etag")! } });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get("etag"), after.headers.get("etag"));
  assert.equal(unchanged.headers.get("cache-control"), "public, max-age=60, must-revalidate");
  assert.equal(await unchanged.text(), "");
  const stale = await fetch(`${url}?v=${media.source.sha256.slice(0, 12)}`);
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get("cache-control"), "public, max-age=60, must-revalidate");
});

// Guards matching-version eligibility, editable-slug TTL, and Express's conditional GET handling.
test("only the current version on an id is immutable; slugs retain their TTL and validators", async t => {
  const { media, url, baseUrl } = await fixture(t);
  for (const [tail, expected] of [[`?v=${media.source.sha256.slice(0, 12)}`, "public, max-age=31536000, immutable"],
    ["?v=obsolete", "public, max-age=60, must-revalidate"], ["?v=", "public, max-age=60, must-revalidate"],
    [`?v=${media.source.sha256.slice(0, 12)}&v=${media.source.sha256.slice(0, 12)}`, "public, max-age=60, must-revalidate"]]) {
    const response = await fetch(url + tail);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), expected);
  }
  const slugUrl = `${baseUrl}/m/${media.slug}/public.v1/image.webp?v=${media.source.sha256.slice(0, 12)}`;
  const response = await fetch(slugUrl);
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  const conditional = await fetch(slugUrl, { cache: "no-cache", headers: { "If-None-Match": `"other", W/${response.headers.get("etag")}` } });
  assert.equal(conditional.status, 304);
  assert.equal(await conditional.text(), "");
});

// Guards access.gated precedence and sendMediaNotFound: a validator must not bypass authorization.
test("a current version and matching validator never bypass a members-only gate", async t => {
  const { deps, media, url } = await fixture(t);
  const publicResponse = await fetch(url);
  const etag = publicResponse.headers.get("etag")!;
  await deps.postRepo.save({ id: "members", workspaceId: deps.workspaceId, slug: "members", title: "Members",
    status: "published", kind: "post", bodyFormat: "doc", bodyHtml: null, updatedAt: media.updatedAt, version: 1,
    bodyJson: { type: "doc", content: [{ type: "image", attrs: { assetId: media.id, transformName: "public" } }] },
    memberAccessJson: JSON.stringify({ visibility: "members" }) });
  const denied = await fetch(`${url}?v=${media.source.sha256.slice(0, 12)}`, { cache: "no-cache", headers: { "If-None-Match": etag } });
  assert.equal(denied.status, 404);
  assert.equal(denied.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await denied.json(), { error: "rendition not found" });
  const token = "media-cache-member";
  deps.memberSessionRepo = new InMemoryMemberSessionRepo([{ id: "cache-session", workspaceId: deps.workspaceId,
    memberId: "member", tokenHash: createHash("sha256").update(token).digest("hex"), createdAt: media.createdAt,
    expiresAt: "2099-01-01T00:00:00.000Z" }]);
  const allowed = await fetch(`${url}?v=${media.source.sha256.slice(0, 12)}`, { headers: { cookie: `tovu_member_session=${token}` } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("cache-control"), "private, no-store");
});
