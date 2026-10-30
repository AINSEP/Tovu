/** Pins public media serving outcomes not covered by the server-level media route suites:
 * featured-image gating, private library documents, and the saved-widget scan's skip rules. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createApp, createRouteDeps } from "../../../../../runtime/composition/app.js";
import { startTestServer } from "../../../../../__tests__/helpers/http-test-server.js";
import { registerTransform, uploadMedia } from "../../../../../../features/media/index.js";
import type { PostRecord } from "../../../../../../features/post/index.js";
import { buildWidgetInstanceFieldsJson } from "@jini-ai/cms/widgets";
import type { EntryListPort } from "../../../../../../features/entries/index.js";

type Deps = ReturnType<typeof createRouteDeps>;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>');

async function boot(t: TestContext) {
  const deps = createRouteDeps();
  const baseUrl = await startTestServer(createApp(deps), t);
  await registerTransform({ deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo }, input: { workspaceId: deps.workspaceId, name: "public", params: { format: "webp" }, owner: "core" } });
  return { deps, baseUrl };
}

async function upload(deps: Deps, input: { bytes: Uint8Array; filename: string; contentType: string; kind?: "document" }) {
  const { media } = await uploadMedia({
    deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
    input: { workspaceId: deps.workspaceId, createdByPrincipal: "user-1", ...input },
  });
  return media;
}

function post(deps: Deps, overrides: Partial<PostRecord> & Pick<PostRecord, "id" | "slug">): PostRecord {
  return { workspaceId: deps.workspaceId, title: "T", bodyJson: { type: "doc", content: [] }, status: "published", kind: "post", bodyFormat: "doc", bodyHtml: null, updatedAt: "2026-10-20T00:00:00.000Z", version: 1, ...overrides };
}

const MEMBERS_ONLY = JSON.stringify({ visibility: "members" });

test("a members-only post's featured image is a 404 private no-store for an anonymous caller", async t => {
  const { deps, baseUrl } = await boot(t);
  const media = await upload(deps, { bytes: PNG, filename: "hero.png", contentType: "image/png" });
  await deps.postRepo.save(post(deps, { id: "p1", slug: "gated", memberAccessJson: MEMBERS_ONLY, featuredMediaId: media.id }));
  const response = await fetch(`${baseUrl}/m/${media.id}/public.v1/hero.webp`);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: "rendition not found" });
});

test("a public post's featured image keeps the asset ungated with bare-id revalidation", async t => {
  const { deps, baseUrl } = await boot(t);
  const media = await upload(deps, { bytes: SVG, filename: "hero.svg", contentType: "image/svg+xml" });
  await deps.postRepo.save(post(deps, { id: "p1", slug: "open", featuredMediaId: media.id }));
  await deps.postRepo.save(post(deps, { id: "p2", slug: "gated", memberAccessJson: MEMBERS_ONLY, featuredMediaId: media.id }));
  const response = await fetch(`${baseUrl}/m/${media.id}/public.v1/hero.webp`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=60, must-revalidate");
});

test("a library document is never served on the rendition route, even unreferenced", async t => {
  const { deps, baseUrl } = await boot(t);
  const media = await upload(deps, { bytes: new TextEncoder().encode("private"), filename: "plan.md", contentType: "text/markdown", kind: "document" });
  const response = await fetch(`${baseUrl}/m/${media.id}/public.v1/plan.webp`);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: "rendition not found" });
});

test("a library document is never served on the original route", async t => {
  const { deps, baseUrl } = await boot(t);
  const media = await upload(deps, { bytes: new TextEncoder().encode("private"), filename: "plan.md", contentType: "text/markdown", kind: "document" });
  const response = await fetch(`${baseUrl}/m/${media.id}/original`);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: "video rendition not found" });
});

/** A members-only post placing saved widget `media-widget`, which shows SVG `shown`. Whether
 *  `shown` is gated tells whether the scan indexed that saved widget's config. */
async function savedWidgetScenario(t: TestContext, payload: { status: "active" | "trash"; malformed?: boolean; placedBy?: string }) {
  const { deps, baseUrl } = await boot(t);
  const shown = await upload(deps, { bytes: SVG, filename: "shown.svg", contentType: "image/svg+xml" });
  const fieldsJson = payload.malformed ? "{}" : buildWidgetInstanceFieldsJson({ payload: { widgetType: "media", status: payload.status, config: { mode: "media", items: [{ slug: shown.slug }], layout: "single" } } });
  const now = "2026-10-20T00:00:00.000Z";
  await deps.entryRepo.save({ id: "media-widget", workspaceId: deps.workspaceId, type: "widget", slug: "member-media", title: "W", status: "draft", bodyJson: null, fieldsJson, publishedAt: null, createdAt: now, updatedAt: now, version: 1 });
  const bodyJson = { type: "doc", content: [{ type: "widgetEmbed", attrs: { placementId: "p", widgetEntryId: payload.placedBy ?? "media-widget" } }] };
  await deps.postRepo.save(post(deps, { id: "p1", slug: "gated", memberAccessJson: MEMBERS_ONLY, bodyJson }));
  return { deps, shownUrl: `${baseUrl}/m/${shown.id}/public.v1/shown.webp` };
}

test("an active saved widget placed in a gated post gates the media it shows", async t => {
  const { shownUrl } = await savedWidgetScenario(t, { status: "active" });
  const response = await fetch(shownUrl);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("a trashed saved widget does not render, so it gates nothing", async t => {
  const { shownUrl } = await savedWidgetScenario(t, { status: "trash" });
  assert.equal((await fetch(shownUrl)).status, 200);
});

test("a malformed saved widget does not render, so it gates nothing", async t => {
  const { shownUrl } = await savedWidgetScenario(t, { status: "active", malformed: true });
  assert.equal((await fetch(shownUrl)).status, 200);
});

test("a soft-deleted saved widget row does not render, so it gates nothing", async t => {
  const { deps, shownUrl } = await savedWidgetScenario(t, { status: "active" });
  // Real SQL repos already hide trashed rows; model a port that returns them with `deletedAt` set.
  const listPort: EntryListPort = deps.entryRepo;
  const original = listPort.listByWorkspace.bind(listPort);
  t.mock.method(deps.entryRepo, "listByWorkspace", async (input: Parameters<typeof original>[0], options?: Parameters<typeof original>[1]) =>
    (await original(input, options)).map(row => ({ ...row, deletedAt: "2026-10-20T00:00:00.000Z" })));
  assert.equal((await fetch(shownUrl)).status, 200);
});

test("a saved widget placed by its slug gates the media it shows", async t => {
  const { shownUrl } = await savedWidgetScenario(t, { status: "active", placedBy: "member-media" });
  assert.equal((await fetch(shownUrl)).status, 404);
});

test("saved widgets are not listed when no live entry places a widget", async t => {
  const { deps, baseUrl } = await boot(t);
  const media = await upload(deps, { bytes: SVG, filename: "a.svg", contentType: "image/svg+xml" });
  await deps.postRepo.save(post(deps, { id: "p1", slug: "plain", memberAccessJson: MEMBERS_ONLY }));
  const listings = t.mock.method(deps.entryRepo, "listByWorkspace");
  assert.equal((await fetch(`${baseUrl}/m/${media.id}/public.v1/a.webp`)).status, 200);
  assert.equal(listings.mock.callCount(), 0);
});
