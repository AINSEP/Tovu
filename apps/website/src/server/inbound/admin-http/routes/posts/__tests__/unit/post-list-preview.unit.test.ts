/** Post-list preview parity (2026-10-22): real rendering with DI repositories, no server process. */
import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPostRepo } from "#src/features/post/index";
import { buildPostPreviewRegistrations } from "#src/features/post/preview-tool";
import { renderViaTemplate } from "#src/server/inbound/public-http/routes/site/pages";
import { renderPostPreview } from "../../template-preview-render.js";
import { registerAdminPostTemplatePreviewRoute } from "../../template-preview.js";
import { postListPreviewDeps } from "../preview-fixtures.js";

const MORE_LIST = `<section data-jini-see-more data-embed-config='{"type":"post-previews","limit":24}'>List placeholder</section>`;
const PENDING_BODY = `<p>Unsaved writing page</p>${MORE_LIST}`;

/** Assert actual card links, so a fallback or a script mentioning posts cannot satisfy the test. */
function listedSlugs(html: string): string[] {
  return [...html.matchAll(/href="\/(listed-\d+)"/g)].map(match => match[1]!);
}

test("draft homepage preview resolves an unsaved 24-post listing and its See more button without writes", async () => {
  const { deps, post, repo, writes } = postListPreviewDeps({ count: 25, slug: "/" });
  const preview = await renderPostPreview(deps, { post, bodyHtml: PENDING_BODY });
  assert.deepEqual(listedSlugs(preview.html), Array.from({ length: 24 }, (_, i) => `listed-${i}`));
  assert.match(preview.html, /<button[^>]+data-jini-more="1"[^>]+data-jini-more-href="\/_more\/1\/24"[^>]*>See more<\/button>/);
  assert.match(preview.html, /data-jini-see-more-script/);
  assert.match(preview.html, /Unsaved writing page/);
  assert.doesNotMatch(preview.html, /Saved draft|List placeholder/);
  assert.deepEqual(await repo.findById({ workspaceId: "w", id: post.id }), post);
  assert.equal(writes(), 0);
});

test("a full final 24-post batch has no See more button", async () => {
  const { deps, post, writes } = postListPreviewDeps({ count: 24, slug: "writing" });
  const { html } = await renderPostPreview(deps, { post, bodyHtml: MORE_LIST });
  assert.equal(listedSlugs(html).length, 24);
  assert.doesNotMatch(html, /<button[^>]+data-jini-more=/);
  assert.equal(writes(), 0);
});

test("preview without a post-list keeps the existing output and performs no listing read", async () => {
  const { deps, post, theme, writes } = postListPreviewDeps({ count: 25, slug: "writing" });
  deps.postRepo.listPublishedPreviews = async () => { throw new Error("unexpected listing read"); };
  const bodyHtml = "<p>Unsaved page without a listing</p>";
  const previous = await renderViaTemplate(deps, theme, post, undefined, undefined, bodyHtml);
  const preview = await renderPostPreview(deps, { post, bodyHtml });
  assert.equal(preview.html, previous);
  assert.match(preview.html, /Unsaved page without a listing/);
  assert.doesNotMatch(preview.html, /data-jini-more/);
  assert.equal(writes(), 0);
});

test("preview fills a batch after excluding gated, corrupt, draft, scheduled and Page rows", async () => {
  const { deps, post, posts, writes } = postListPreviewDeps({ count: 25, slug: "writing" });
  const excluded = [
    ...['{"visibility":"members"}', '{"visibility":"paid"}', '{"visibility":"tiers","tierIds":["t"]}', "invalid-json"]
      .map((memberAccessJson, i) => ({ ...posts[0]!, id: `hidden-${i}`, slug: `hidden-${i}`, title: `Hidden ${i}`, publishAt: "2026-02-01T00:00:00.000Z", memberAccessJson })),
    { ...posts[0]!, id: "hidden-draft", slug: "hidden-draft", status: "draft" as const },
    { ...posts[0]!, id: "hidden-scheduled", slug: "hidden-scheduled", publishAt: "2999-01-01T00:00:00.000Z" },
    { ...posts[0]!, id: "hidden-page", slug: "hidden-page", kind: "page" as const },
  ];
  // Seed a new DI repo, so fixture setup is not confused with a preview write.
  const repo = new InMemoryPostRepo([post, ...excluded, ...posts]);
  deps.postRepo.listPublishedPreviews = input => repo.listPublishedPreviews(input);
  deps.memberSessionRepo.findByTokenHash = async () => { throw new Error("preview must not read a member session"); };
  const { html } = await renderPostPreview(deps, { post, bodyHtml: MORE_LIST });
  assert.deepEqual(listedSlugs(html), Array.from({ length: 24 }, (_, i) => `listed-${i}`));
  assert.doesNotMatch(html, /href="\/hidden-|Hidden \d/);
  assert.match(html, /data-jini-more-href="\/writing\/_more\/1\/28"/);
  assert.equal(writes(), 0);
});

test("preview resolves plain, keyed and paged listings from the same assembled draft document", async () => {
  const { deps, post, theme, writes } = postListPreviewDeps({ count: 25, slug: "writing" });
  // The keyed list lives in a partial, the paged list in the unsaved body, and the plain list in the template.
  theme.partials.nav = MORE_LIST;
  theme.pages.page = `<html><body><div data-embed-config='{"type":"partial","id":"nav"}'></div><div data-embed-config='{"type":"post-previews","limit":1}'>Plain placeholder</div><main data-embed-config='{"type":"content"}'></main></body></html>`;
  const bodyHtml = `<div data-embed-config='{"type":"post-previews","limit":2,"paged":true}'>Paged placeholder</div>`;
  const { html } = await renderPostPreview(deps, { post, bodyHtml });
  assert.deepEqual(listedSlugs(html), [
    ...Array.from({ length: 24 }, (_, i) => `listed-${i}`), "listed-0", "listed-0", "listed-1",
  ]);
  assert.match(html, /data-jini-more-href="\/writing\/_more\/1\/24"/);
  assert.match(html, /href="\/writing\/page\/2"/);
  assert.doesNotMatch(html, /Plain placeholder|Paged placeholder|List placeholder/);
  assert.equal(writes(), 0);
});

test("editor Preview route includes the draft listing and retains no-store and its sandbox CSP", async () => {
  const { deps, post, repo, writes } = postListPreviewDeps({ count: 25, slug: "writing" });
  type Handler = (req: unknown, res: unknown) => Promise<void>;
  const handlers: Record<string, Handler> = {};
  registerAdminPostTemplatePreviewRoute({
    get: (_path: string, fn: Handler) => { handlers.get = fn; },
    post: (_path: string, _parser: unknown, fn: Handler) => { handlers.post = fn; },
  } as never, deps);
  for (const method of ["get", "post"]) {
    const headers: Record<string, string> = {};
    let html = "";
    const res = {
      locals: { principal: { id: "p" } },
      set: (key: string, value: string) => { headers[key] = value; return res; },
      type: () => res,
      status: (status: number) => { assert.equal(status, 200); return res; },
      send: (value: string) => { html = value; return res; },
    };
    // GET previews the saved draft; POST replaces its body while keeping the template's listing.
    deps.themes[0]!.pages.page = `<html><body>${MORE_LIST}<main data-embed-config='{"type":"content"}'></main></body></html>`;
    const body = method === "post" ? { bodyHtml: "<p>Unsaved route body</p>" } : {};
    await handlers[method]!({ params: { workspaceId: "w", postId: post.id }, query: {}, body }, res);
    assert.equal(listedSlugs(html).length, 24);
    assert.match(html, /data-jini-more-href="\/writing\/_more\/1\/24"/);
    assert.match(html, method === "post" ? /Unsaved route body/ : /Saved draft/);
    assert.equal(headers["Cache-Control"], "no-store");
    assert.equal(headers["Content-Security-Policy"], "sandbox allow-scripts allow-forms allow-popups");
  }
  assert.deepEqual(await repo.findById({ workspaceId: "w", id: post.id }), post);
  assert.equal(writes(), 0);
});

test("content_post_preview returns real list cards and See more for an unsaved page", async () => {
  const { deps, post, repo, writes } = postListPreviewDeps({ count: 25, slug: "writing" });
  const [registration] = buildPostPreviewRegistrations(deps, { renderPostPreview });
  const result = await registration!.handler({
    principal: { id: "p" }, input: { id: post.id, bodyHtml: PENDING_BODY }, signal: new AbortController().signal,
  } as never) as { body: string; truncated: boolean };
  assert.deepEqual(listedSlugs(result.body), Array.from({ length: 24 }, (_, i) => `listed-${i}`));
  assert.match(result.body, /data-jini-more-href="\/writing\/_more\/1\/24"/);
  assert.match(result.body, />See more<\/button>/);
  assert.match(result.body, /Unsaved writing page/);
  assert.doesNotMatch(result.body, /Saved draft|List placeholder/);
  assert.equal(result.truncated, false);
  assert.deepEqual(await repo.findById({ workspaceId: "w", id: post.id }), post);
  assert.equal(writes(), 0);
});

test("preview preserves keyed listing numbers and JSON card batch URLs", async () => {
  const { deps, post, writes } = postListPreviewDeps({ count: 25, slug: "writing" });
  const card = `<template data-jini-card><article><a data-field-href="href" data-field="title"></a></article></template>`;
  const jsonList = `<section data-jini-see-more data-embed-config='{"type":"post-previews","limit":2}'>${card}JSON placeholder</section>`;
  const { html } = await renderPostPreview(deps, { post, bodyHtml: MORE_LIST + jsonList });
  assert.deepEqual(listedSlugs(html), [...Array.from({ length: 24 }, (_, i) => `listed-${i}`), "listed-0", "listed-1"]);
  assert.match(html, /data-jini-more="1" data-jini-more-href="\/writing\/_more\/1\/24"/);
  assert.match(html, /data-jini-more="2" data-jini-more-href="\/writing\/_more\/2\/2\.json"/);
  assert.equal(html.split("data-jini-see-more-script").length, 2);
  assert.doesNotMatch(html, /JSON placeholder|List placeholder/);
  assert.equal(writes(), 0);
});

test("preview with no published posts retains the authored listing fallback", async () => {
  const { deps, post, writes } = postListPreviewDeps({ count: 0, slug: "writing" });
  const { html } = await renderPostPreview(deps, { post, bodyHtml: MORE_LIST });
  assert.deepEqual(listedSlugs(html), []);
  assert.match(html, /List placeholder/);
  assert.doesNotMatch(html, /<button[^>]+data-jini-more=/);
  assert.equal(writes(), 0);
});

test("listing read failures propagate without saving the pending preview", async () => {
  const { deps, post, repo, writes } = postListPreviewDeps({ count: 25, slug: "writing" });
  const outage = new Error("listing store unavailable");
  deps.postRepo.listPublishedPreviews = async () => { throw outage; };
  await assert.rejects(renderPostPreview(deps, { post, bodyHtml: PENDING_BODY }), error => error === outage);
  assert.deepEqual(await repo.findById({ workspaceId: "w", id: post.id }), post);
  assert.equal(writes(), 0);
});
