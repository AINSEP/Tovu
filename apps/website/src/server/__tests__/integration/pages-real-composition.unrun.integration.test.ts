// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Round 4 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — the Pages admin surface
 * (`routes/pages/{create,update,delete,list,get-by-id}.ts`) through the REAL site composition on both
 * dialects, ending at the public `GET /:slug` render (`public-http/routes/site/pages.ts`).
 *
 * The PGlite smoke test creates and lists one page; nothing else reaches these routes over a real
 * store. Unproven until here: draft → publish visibility on the live site, a slug change moving the
 * public URL (and, per SPEC-009 REQ-15, leaving a 301 behind), the `kind` guard and the
 * `expectedVersion` compare-and-set over SQLite/Postgres, and delete → Trash → 404.
 *
 * The slug-change test asserts the INTENDED behavior: `deps.ts` binds `RedirectSlugChangeCapture`
 * into the routing slot (`registerSlugChangeCapture`), but no code calls `getSlugChangeCapture()`, so
 * `updatePost` never captures. Expected to fail until the content write chokepoint is wired.
 */

function doc(text: string): Record<string, unknown> {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

interface AdminPost {
  id: string;
  kind: string;
  title: string;
  slug: string;
  status: string;
  version: number;
  bodyFormat: string;
  bodyJson: unknown;
}

async function createPage(site: BootedSite, body: Record<string, unknown>): Promise<AdminPost> {
  return (await expectJson<{ post: AdminPost }>(await send(site, "POST", `${site.ws}/pages`, body), 201)).post;
}

async function putPage(site: BootedSite, page: AdminPost, patch: Record<string, unknown>): Promise<Response> {
  return send(site, "PUT", `${site.ws}/pages/${page.id}`, {
    title: page.title,
    slug: page.slug,
    bodyJson: page.bodyJson,
    status: page.status,
    ...patch,
  });
}

async function visit(site: BootedSite, pathname: string): Promise<{ status: number; location: string | null; html: string }> {
  const res = await fetch(`${site.baseUrl}${pathname}`, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location"), html: await res.text() };
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] pages [${dialect}]: a draft page is invisible on the live site; publishing it serves its body at /<slug>`, async (t) => {
    const site = await bootSite(t, dialect);
    const page = await createPage(site, { title: "Unrun About", slug: "unrun-about", bodyJson: doc("Unrun distinctive about body") });
    assert.deepEqual(
      { kind: page.kind, title: page.title, slug: page.slug, status: page.status, bodyFormat: page.bodyFormat },
      { kind: "page", title: "Unrun About", slug: "unrun-about", status: "draft", bodyFormat: "doc" }
    );
    assert.deepEqual(page.bodyJson, doc("Unrun distinctive about body"), "the TipTap document round-trips the dialect unchanged");
    assert.equal((await visit(site, "/unrun-about")).status, 404, "a draft is not public");

    const published = (await expectJson<{ post: AdminPost }>(await putPage(site, page, { status: "published" }), 200)).post;
    assert.equal(published.status, "published");
    assert.equal(published.version, page.version + 1);

    const live = await visit(site, "/unrun-about");
    assert.equal(live.status, 200);
    assert.ok(live.html.includes("Unrun distinctive about body"), `the published body renders: ${live.html.slice(0, 400)}`);

    const listed = await expectJson<{ posts: Array<{ post: AdminPost }> }>(await send(site, "GET", `${site.ws}/pages`), 200);
    const row = listed.posts.find((entry) => entry.post.id === page.id);
    assert.ok(row, "the page lists");
    assert.equal(row.post.status, "published");
    const one = await expectJson<{ post: AdminPost }>(await send(site, "GET", `${site.ws}/pages/${page.id}`), 200);
    assert.deepEqual(one.post, published, "a read-back returns exactly what the PUT answered");
  });

  test(`[unrun] pages [${dialect}]: changing a published page's slug moves it, and the old URL 301s to the new one (SPEC-009 auto capture)`, async (t) => {
    const site = await bootSite(t, dialect);
    const page = await createPage(site, { title: "Unrun Pricing", slug: "unrun-pricing-old", bodyJson: doc("Unrun pricing body"), status: "published" });
    assert.equal((await visit(site, "/unrun-pricing-old")).status, 200);

    const moved = (await expectJson<{ post: AdminPost }>(await putPage(site, page, { slug: "unrun-pricing-new" }), 200)).post;
    assert.equal(moved.slug, "unrun-pricing-new");

    const fresh = await visit(site, "/unrun-pricing-new");
    assert.equal(fresh.status, 200);
    assert.ok(fresh.html.includes("Unrun pricing body"));

    const auto = await expectJson<{ data: Array<{ fromPattern: string; toTarget: string; statusCode: number; status: string; source: string; sourceEntryId: string | null }> }>(
      await send(site, "GET", `${site.ws}/redirects?source=auto_slug_change`),
      200
    );
    assert.deepEqual(
      auto.data.map((rule) => ({ fromPattern: rule.fromPattern, toTarget: rule.toTarget, statusCode: rule.statusCode, status: rule.status, sourceEntryId: rule.sourceEntryId })),
      [{ fromPattern: "/unrun-pricing-old", toTarget: "/unrun-pricing-new", statusCode: 301, status: "active", sourceEntryId: page.id }],
      "the slug change captured exactly one active auto_slug_change rule"
    );
    const old = await visit(site, "/unrun-pricing-old");
    assert.deepEqual({ status: old.status, location: old.location }, { status: 301, location: "/unrun-pricing-new" });
  });

  test(`[unrun] pages [${dialect}]: a stale expectedVersion is 409 VERSION_CONFLICT and the stored page keeps the winner`, async (t) => {
    const site = await bootSite(t, dialect);
    const page = await createPage(site, { title: "Unrun Contact", slug: "unrun-contact", bodyJson: doc("v1") });
    const first = (await expectJson<{ post: AdminPost }>(await putPage(site, page, { bodyJson: doc("winner"), expectedVersion: page.version }), 200)).post;

    const stale = await expectJson<unknown>(await putPage(site, page, { bodyJson: doc("loser"), expectedVersion: page.version }), 409);
    assert.deepEqual(stale, {
      error: `post '${page.id}' was modified by another save (expected version ${page.version}, current version ${first.version})`,
      code: "VERSION_CONFLICT",
      details: { expectedVersion: page.version, currentVersion: first.version },
    });

    const malformed = await expectJson<{ code: string }>(await putPage(site, page, { expectedVersion: "3" }), 400);
    assert.equal(malformed.code, "VALIDATION_ERROR");

    const stored = await expectJson<{ post: AdminPost }>(await send(site, "GET", `${site.ws}/pages/${page.id}`), 200);
    assert.deepEqual(stored.post.bodyJson, doc("winner"));
    assert.equal(stored.post.version, first.version);
  });

  test(`[unrun] pages [${dialect}]: a duplicate slug is 409 SLUG_CONFLICT on create and update; a post id through /pages is 404 ENTRY_NOT_FOUND`, async (t) => {
    const site = await bootSite(t, dialect);
    const taken = await createPage(site, { title: "Unrun Taken", slug: "unrun-taken" });
    const other = await createPage(site, { title: "Unrun Other", slug: "unrun-other" });

    assert.deepEqual(await expectJson(await send(site, "POST", `${site.ws}/pages`, { title: "Dup", slug: "unrun-taken" }), 409), {
      error: "slug 'unrun-taken' already exists",
      code: "SLUG_CONFLICT",
    });
    assert.deepEqual(await expectJson(await putPage(site, other, { slug: taken.slug }), 409), {
      error: "slug 'unrun-taken' already exists",
      code: "SLUG_CONFLICT",
    });

    const { post } = await expectJson<{ post: AdminPost }>(await send(site, "POST", `${site.ws}/posts`, { title: "Unrun A Post" }), 201);
    assert.deepEqual(await expectJson(await putPage(site, { ...post, kind: "page" }, { title: "Hijack" }), 404), {
      error: `page '${post.id}' was not found`,
      code: "ENTRY_NOT_FOUND",
    });
    const untouched = await expectJson<{ post: AdminPost }>(await send(site, "GET", `${site.ws}/posts/${post.id}`), 200);
    assert.equal(untouched.post.title, "Unrun A Post", "the refused pages-surface PUT did not edit the post");
  });

  test(`[unrun] pages [${dialect}]: the reserved slug 'admin' is refused on create AND on update (400 VALIDATION_ERROR)`, async (t) => {
    const site = await bootSite(t, dialect);
    assert.deepEqual(await expectJson(await send(site, "POST", `${site.ws}/pages`, { title: "Shadow", slug: "admin" }), 400), {
      error: "slug 'admin' is reserved",
      code: "VALIDATION_ERROR",
    });
    // Intended parity with create (BR-03 step 3). `validateUpdatePostInput` checks format only, so
    // a rename onto a reserved word is expected to fail here until update applies the same rule.
    const page = await createPage(site, { title: "Unrun Rename", slug: "unrun-rename" });
    assert.deepEqual(await expectJson(await putPage(site, page, { slug: "admin" }), 400), {
      error: "slug 'admin' is reserved",
      code: "VALIDATION_ERROR",
    });
  });

  test(`[unrun] pages [${dialect}]: DELETE trashes a published page — the live URL 404s, it leaves the list, and it is in the Trash`, async (t) => {
    const site = await bootSite(t, dialect);
    const page = await createPage(site, { title: "Unrun Doomed", slug: "unrun-doomed", bodyJson: doc("doomed"), status: "published" });
    assert.equal((await visit(site, "/unrun-doomed")).status, 200);

    await expectJson(await send(site, "DELETE", `${site.ws}/pages/${page.id}`), 200);
    assert.equal((await visit(site, "/unrun-doomed")).status, 404);
    const listed = await expectJson<{ posts: Array<{ post: AdminPost }> }>(await send(site, "GET", `${site.ws}/pages`), 200);
    assert.equal(listed.posts.some((entry) => entry.post.id === page.id), false);

    const trash = await expectJson<{ items: Array<{ entityType: string; entityId: string; title: string }> }>(await send(site, "GET", `${site.ws}/trash`), 200);
    assert.deepEqual(
      trash.items.filter((item) => item.entityId === page.id).map((item) => ({ entityType: item.entityType, title: item.title })),
      [{ entityType: "post", title: "Unrun Doomed" }]
    );
    // The route's kind guard passes (`findById` returns trashed rows), so the 404 comes from
    // `deletePost`'s own `isTrashed` check — hence "post", not "page", in the message.
    assert.deepEqual(await expectJson(await send(site, "DELETE", `${site.ws}/pages/${page.id}`), 404), {
      error: `post '${page.id}' was not found`,
      code: "ENTRY_NOT_FOUND",
    }, "a second delete of a trashed page reads as not found");
  });
}
