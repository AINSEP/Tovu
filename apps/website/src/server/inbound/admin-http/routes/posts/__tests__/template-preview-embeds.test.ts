/**
 * @file P1-T3.T — the template-preview embed inspection route (`.../template-preview/embeds`) and its
 * YouTube id projector. The JSON route must see exactly the draft render the HTML preview serves
 * (same renderer, same `content.read`, same pending body and template tri-state) but answer only
 * validated video ids — never the HTML itself. Real composition root (`createApp`), real renderer,
 * real session login; only the post repo, theme list and presentation row are fixture-owned.
 */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer, loginAsOwner, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import type { PublicPostRecord } from "@jini-ai/cms/posts/post";
import { projectPreviewYoutubeIds } from "../template-preview-youtube.js";
import { barePost, bareDeps } from "./preview-fixtures.js";

const TEMPLATE_ID = "tmplVideo01";
const BODY_ID = "bodyVideo02";
const SLOT = `<main data-embed-config='{"type":"content"}'></main>`;

function themeWithTemplateVideo(): DiscoveredTheme {
  return {
    manifest: { id: "embed-theme", name: "Embed", version: "1", tier: "static", engine: 1, templates: ["video.html"] },
    dir: "/unused", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { video: `<html><body><iframe src="https://www.youtube-nocookie.com/embed/${TEMPLATE_ID}?rel=0"></iframe>${SLOT}</body></html>` },
    partials: {}, css: "", source: "site", status: "valid", errors: [],
  } as unknown as DiscoveredTheme;
}

/** Boots the real app over a fixture post, counting every post-repo read (the renderer's only way in). */
async function boot(t: import("node:test").TestContext, post: Partial<PublicPostRecord> = {}) {
  const deps = createRouteDeps();
  const record = { ...barePost, workspaceId: deps.workspaceId, templateChoice: "video.html", bodyHtml: "<p>Saved body</p>", ...post } as PublicPostRecord;
  const { repo, writes } = bareDeps([record]);
  let reads = 0;
  for (const key of ["findById", "findBySlug"] as const) {
    const original = (repo as unknown as Record<string, Function>)[key];
    if (typeof original !== "function") continue;
    Object.defineProperty(repo, key, { value: (...args: unknown[]) => { reads++; return Reflect.apply(original, repo, args); } });
  }
  Object.assign(deps, { postRepo: repo, themes: [themeWithTemplateVideo()] });
  deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: deps.workspaceId, activeThemeId: "embed-theme", updatedAt: record.updatedAt }] });
  const calls: unknown[] = [];
  const realAuthorize = deps.authorize;
  deps.authorize = (params) => { calls.push(params); return realAuthorize(params); };
  const baseUrl = await startTestServer(createApp(deps), t);
  const base = (ws = deps.workspaceId) => `${baseUrl}/api/admin/v1/workspaces/${ws}/posts/${record.id}`;
  const embeds = (init: { cookie?: string; query?: string; body?: unknown; ws?: string }) => fetch(`${base(init.ws)}/template-preview/embeds${init.query ?? ""}`, {
    method: "POST", headers: { "content-type": "application/json", origin: baseUrl, ...(init.cookie ? { cookie: init.cookie } : {}) },
    body: JSON.stringify(init.body ?? {}),
  });
  return { deps, baseUrl, base, embeds, reads: () => reads, writes, calls, record };
}

test("a template-rendered youtube-nocookie iframe yields its id", async (t) => {
  // The saved page body has no video: only the theme template does, so a route that inspected the
  // page body instead of the assembled render would answer nothing.
  const { baseUrl, embeds } = await boot(t);
  const cookie = await loginAsOwner(baseUrl);
  const res = await embeds({ cookie });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { youtubeIds: [TEMPLATE_ID] });
});

test("a renderer-produced youtube node iframe yields its id", async (t) => {
  const bodyJson = { type: "doc", content: [{ type: "youtube", attrs: { src: `https://www.youtube.com/watch?v=${BODY_ID}` } }] };
  const { baseUrl, embeds } = await boot(t, { kind: "post", bodyFormat: "doc", bodyHtml: null, bodyJson, templateChoice: "" });
  const res = await embeds({ cookie: await loginAsOwner(baseUrl), query: "?templateChoice=" });
  assert.deepEqual(await res.json(), { youtubeIds: [BODY_ID] });
});

test("a deceptive host and a non-YouTube iframe yield nothing", () => {
  const sources = [
    "https://www.youtube.com.evil.example/embed/aaaaaaaaaaa",
    "https://evil.example/www.youtube.com/embed/aaaaaaaaaaa",
    "https://notyoutube.com/embed/aaaaaaaaaaa",
    "https://user:pw@www.youtube.com/embed/aaaaaaaaaaa",
    "https://www.youtube.com:8443/embed/aaaaaaaaaaa",
    "http://www.youtube.com/embed/aaaaaaaaaaa",
    "https://www.youtube.com/embed/tooShort",
    "https://www.youtube.com/embed/waytoolongid1",
    "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    "https://youtu.be/embed/aaaaaaaaaaa",
    "https://player.vimeo.com/video/12345",
    "/embed/aaaaaaaaaaa",
    "not a url",
  ];
  assert.deepEqual(projectPreviewYoutubeIds({ iframeSources: sources }), { youtubeIds: [] });
});

test("every allowed origin and path shape is accepted, deduplicated in first-seen order", () => {
  const sources = [
    "https://youtu.be/BBBBBBBBBBB?t=4", "https://www.youtube.com/embed/AAAAAAAAAAA", "https://youtube.com/embed/AAAAAAAAAAA",
    "https://www.youtube-nocookie.com/embed/C_C-CCCCCCC#x", "https://youtube-nocookie.com/embed/BBBBBBBBBBB", "https://www.youtube.com:443/embed/DDDDDDDDDDD",
  ];
  assert.deepEqual(projectPreviewYoutubeIds({ iframeSources: sources }), { youtubeIds: ["BBBBBBBBBBB", "AAAAAAAAAAA", "C_C-CCCCCCC", "DDDDDDDDDDD"] });
});

test("same auth as the preview route", async (t) => {
  const { deps, baseUrl, embeds, reads, calls } = await boot(t);
  assert.equal((await embeds({})).status, 401, "missing session");
  const owner = await loginAsOwner(baseUrl);
  const foreign = await embeds({ cookie: owner, ws: "other-ws" });
  assert.equal(foreign.status, 404);
  assert.deepEqual(await foreign.json(), { error: "workspace was not found" });
  const bare = await loginAsBarePrincipal(deps, baseUrl);
  calls.length = 0;
  const denied = await embeds({ cookie: bare });
  assert.equal(denied.status, 403);
  assert.doesNotMatch(JSON.stringify(await denied.json()), /youtube|<html/i);
  assert.equal(reads(), 0, "no lookup or render after any refusal");
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0] as object).sort(), ["permission", "principalId", "workspaceId"], "type-free, id-free check");
  assert.equal((calls[0] as { permission: string }).permission, "content.read");
  const allowed = await embeds({ cookie: owner });
  assert.equal(allowed.status, 200);
  assert.ok(reads() > 0);
});

test("pending body and explicit empty template choice match the HTML preview without persisting either", async (t) => {
  const { baseUrl, base, embeds, writes, record } = await boot(t);
  const cookie = await loginAsOwner(baseUrl);
  const bodyHtml = `<p><iframe src="https://www.youtube.com/embed/${BODY_ID}"></iframe></p>`;
  const html = await fetch(`${base()}/template-preview?templateChoice=`, {
    method: "POST", headers: { cookie, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ bodyHtml }),
  });
  assert.equal(html.status, 200);
  assert.equal(html.headers.get("content-security-policy"), "sandbox allow-scripts allow-forms allow-popups");
  assert.equal(html.headers.get("cache-control"), "no-store");
  const htmlText = await html.text();
  assert.ok(htmlText.includes(BODY_ID) && !htmlText.includes(TEMPLATE_ID));
  const explicitNone = await embeds({ cookie, query: "?templateChoice=", body: { bodyHtml } });
  assert.equal(explicitNone.headers.get("cache-control"), "no-store");
  assert.deepEqual(await explicitNone.json(), { youtubeIds: [BODY_ID] });
  const saved = await embeds({ cookie, body: { bodyHtml } });
  assert.deepEqual(await saved.json(), { youtubeIds: [TEMPLATE_ID, BODY_ID] });
  const missing = await embeds({ cookie, body: {}, query: "?templateChoice=" });
  assert.deepEqual(await missing.json(), { youtubeIds: [] }, "no pending body renders the saved body");
  assert.equal(writes(), 0);
  const get = await fetch(`${base()}/template-preview`, { headers: { cookie } });
  assert.equal(get.headers.get("content-security-policy"), "sandbox allow-scripts allow-forms allow-popups");
  assert.equal(record.templateChoice, "video.html");
});

test("an unknown post is a plain JSON 404 with no render detail", async (t) => {
  const { baseUrl, embeds, base } = await boot(t);
  const cookie = await loginAsOwner(baseUrl);
  const res = await fetch(`${base().replace(/draft-1$/, "nope")}/template-preview/embeds`, { method: "POST", headers: { cookie, origin: baseUrl, "content-type": "application/json" }, body: "{}" });
  assert.equal(res.status, 404);
  assert.equal(typeof (await res.json()).error, "string");
  void embeds;
});
