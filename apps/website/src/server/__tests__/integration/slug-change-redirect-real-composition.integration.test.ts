import assert from "node:assert/strict";
import test from "node:test";

import type { ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { buildPostRegistrations } from "#src/features/post/tool-registrations";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file SPEC-009 REQ-15 end to end, through the real `tovu serve` composition on both dialects: a
 * published page or post whose slug changes leaves a 301 from its old URL, whichever surface made
 * the change (the Pages route, the Posts route, or the `content_post_update` agent tool). Also the
 * update half of SPEC-002 REQ-04 (a reserved or over-120-character slug is refused on update with
 * create's message), and the same for an over-200-character title (api.spec.md §4 `title` maxLength).
 *
 * `deps.ts` binds `RedirectSlugChangeCapture` into routing's slot; until `updatePost` called it,
 * the old URL 404ed. The same expectations are drafted in
 * `pages-real-composition.unrun.integration.test.ts`; this file is the executed version.
 */

interface AdminPost {
  id: string;
  title: string;
  slug: string;
  status: string;
  bodyJson: unknown;
}

interface RedirectRow {
  fromPattern: string;
  toTarget: string;
  statusCode: number;
  status: string;
  sourceEntryId: string | null;
}

function doc(text: string): Record<string, unknown> {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

async function create(site: BootedSite, collection: "pages" | "posts", body: Record<string, unknown>): Promise<AdminPost> {
  return (await expectJson<{ post: AdminPost }>(await send(site, "POST", `${site.ws}/${collection}`, body), 201)).post;
}

async function put(site: BootedSite, collection: "pages" | "posts", entry: AdminPost, patch: Record<string, unknown>): Promise<Response> {
  return send(site, "PUT", `${site.ws}/${collection}/${entry.id}`, {
    title: entry.title,
    slug: entry.slug,
    bodyJson: entry.bodyJson,
    status: entry.status,
    ...patch,
  });
}

async function visit(site: BootedSite, pathname: string): Promise<{ status: number; location: string | null }> {
  const res = await fetch(`${site.baseUrl}${pathname}`, { redirect: "manual" });
  await res.arrayBuffer();
  return { status: res.status, location: res.headers.get("location") };
}

async function autoRedirects(site: BootedSite): Promise<RedirectRow[]> {
  const body = await expectJson<{ data: RedirectRow[] }>(await send(site, "GET", `${site.ws}/redirects?source=auto_slug_change`), 200);
  return body.data.map(({ fromPattern, toTarget, statusCode, status, sourceEntryId }) => ({ fromPattern, toTarget, statusCode, status, sourceEntryId }));
}

/** The real `content_post_update` registration over the booted site's own `RouteDeps`, called as
 *  the seeded owner so the real `authorize` passes. */
async function agentUpdateTool(site: BootedSite): Promise<(input: Record<string, unknown>) => Promise<unknown>> {
  const owner = await site.deps.userRepo.findByUsername({ workspaceId: site.deps.workspaceId, username: "admin" });
  assert.ok(owner, "the seeded owner exists");
  const registration = buildPostRegistrations(site.deps, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }).find(
    (r: ToolRegistration) => r.descriptor.id === "content_post_update"
  );
  assert.ok(registration, "content_post_update is registered");
  return (input) =>
    Promise.resolve(
      registration.handler({
        executionId: "exec-slug-change",
        principal: { id: owner.principalId },
        run: { id: "run-slug-change" },
        input,
        signal: new AbortController().signal,
      })
    );
}

for (const dialect of SITE_DIALECTS) {
  test(`slug change [${dialect}]: a published page renamed through PUT /pages leaves a 301 from its old URL`, async (t) => {
    const site = await bootSite(t, dialect);
    const page = await create(site, "pages", { title: "Pricing", slug: "pricing-old", bodyJson: doc("pricing body"), status: "published" });
    assert.equal((await visit(site, "/pricing-old")).status, 200);

    const moved = (await expectJson<{ post: AdminPost }>(await put(site, "pages", page, { slug: "pricing-new" }), 200)).post;

    assert.equal(moved.slug, "pricing-new");
    assert.equal((await visit(site, "/pricing-new")).status, 200);
    assert.deepEqual(await autoRedirects(site), [
      { fromPattern: "/pricing-old", toTarget: "/pricing-new", statusCode: 301, status: "active", sourceEntryId: page.id },
    ]);
    assert.deepEqual(await visit(site, "/pricing-old"), { status: 301, location: "/pricing-new" });
  });

  test(`slug change [${dialect}]: a published post renamed through PUT /posts leaves a 301 from its old URL`, async (t) => {
    const site = await bootSite(t, dialect);
    const post = await create(site, "posts", { title: "Launch", slug: "launch-old", bodyJson: doc("launch body"), status: "published" });

    await expectJson(await put(site, "posts", post, { slug: "launch-new" }), 200);

    assert.deepEqual(await visit(site, "/launch-old"), { status: 301, location: "/launch-new" });
  });

  test(`slug change [${dialect}]: a draft renamed leaves no redirect, and its old URL stays a 404`, async (t) => {
    const site = await bootSite(t, dialect);
    const page = await create(site, "pages", { title: "Draft", slug: "draft-old", bodyJson: doc("draft body") });

    await expectJson(await put(site, "pages", page, { slug: "draft-new" }), 200);

    assert.deepEqual(await autoRedirects(site), []);
    assert.equal((await visit(site, "/draft-old")).status, 404);
  });

  test(`slug change [${dialect}]: the content_post_update agent tool's rename leaves a 301 too`, async (t) => {
    const site = await bootSite(t, dialect);
    const page = await create(site, "pages", { title: "Team", slug: "team-old", bodyJson: doc("team body"), status: "published" });
    const updateTool = await agentUpdateTool(site);

    await updateTool({ id: page.id, kind: "page", slug: "team-new" });

    assert.deepEqual(await autoRedirects(site), [
      { fromPattern: "/team-old", toTarget: "/team-new", statusCode: 301, status: "active", sourceEntryId: page.id },
    ]);
    assert.deepEqual(await visit(site, "/team-old"), { status: 301, location: "/team-new" });
  });

  test(`reserved slug [${dialect}]: renaming a page to 'admin' is 400 with create's message, and nothing moves`, async (t) => {
    const site = await bootSite(t, dialect);
    const created = await expectJson<{ error: string }>(await send(site, "POST", `${site.ws}/pages`, { title: "Shadow", slug: "admin" }), 400);
    const page = await create(site, "pages", { title: "Rename", slug: "rename-me" });

    const updated = await expectJson<{ error: string }>(await put(site, "pages", page, { slug: "admin" }), 400);

    assert.equal(created.error, "slug 'admin' is reserved");
    assert.deepEqual(updated, created);
    const stored = await expectJson<{ post: AdminPost }>(await send(site, "GET", `${site.ws}/pages/${page.id}`), 200);
    assert.equal(stored.post.slug, "rename-me");
  });

  test(`slug length [${dialect}]: a 121-character rename is 400 with create's message on PUT and the agent tool; 120 passes`, async (t) => {
    const site = await bootSite(t, dialect);
    const tooLong = "a".repeat(121);
    const created = await expectJson<{ error: string }>(await send(site, "POST", `${site.ws}/pages`, { title: "Long", slug: tooLong }), 400);
    const page = await create(site, "pages", { title: "Rename", slug: "rename-me" });
    const updateTool = await agentUpdateTool(site);

    const updated = await expectJson<{ error: string }>(await put(site, "pages", page, { slug: tooLong }), 400);
    await assert.rejects(() => updateTool({ id: page.id, kind: "page", slug: tooLong }), /slug must be 120 characters or fewer/);

    assert.equal(created.error, "slug must be 120 characters or fewer");
    assert.deepEqual(updated, created);
    const stored = await expectJson<{ post: AdminPost }>(await send(site, "GET", `${site.ws}/pages/${page.id}`), 200);
    assert.equal(stored.post.slug, "rename-me");
    const atLimit = (await expectJson<{ post: AdminPost }>(await put(site, "pages", stored.post, { slug: "a".repeat(120) }), 200)).post;
    assert.equal(atLimit.slug, "a".repeat(120));
  });

  test(`title length [${dialect}]: a 201-character retitle is 400 with create's message on PUT /posts, PUT /pages and the agent tool; 200 passes`, async (t) => {
    const site = await bootSite(t, dialect);
    const tooLong = "t".repeat(201);
    const created = await expectJson<{ error: string }>(await send(site, "POST", `${site.ws}/posts`, { title: tooLong }), 400);
    const post = await create(site, "posts", { title: "Short", slug: "short-post" });
    const page = await create(site, "pages", { title: "Short", slug: "short-page" });
    const updateTool = await agentUpdateTool(site);

    const updatedPost = await expectJson<{ error: string }>(await put(site, "posts", post, { title: tooLong }), 400);
    const updatedPage = await expectJson<{ error: string }>(await put(site, "pages", page, { title: tooLong }), 400);
    await assert.rejects(() => updateTool({ id: post.id, kind: "post", title: tooLong }), /title must be 200 characters or fewer/);

    assert.equal(created.error, "title must be 200 characters or fewer");
    // PUT /posts answers `{ error }` without the `code` POST /posts and PUT /pages send — a route-level
    // shape difference outside this rule, so only its message is compared.
    assert.equal(updatedPost.error, created.error);
    assert.deepEqual(updatedPage, created);
    const stored = await expectJson<{ post: AdminPost }>(await send(site, "GET", `${site.ws}/posts/${post.id}`), 200);
    assert.equal(stored.post.title, "Short");
    const atLimit = (await expectJson<{ post: AdminPost }>(await put(site, "posts", stored.post, { title: "t".repeat(200) }), 200)).post;
    assert.equal(atLimit.title, "t".repeat(200));
  });
}
