/** Comments build 2026-10-21: a live post page with the built-in thread is never cached, so approval,
 * provider selection and disable all show on the very next request; the no-JS form round-trips. */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { startTestServer } from "../helpers/http-test-server.js";

test("comments: the Starter post page is no-store, the form 303s to #comment-pending, and approval shows on the next GET", async (t) => {
  const base = createRouteDeps();
  const post = buildPostRecord({ workspaceId: base.workspaceId, slug: "comments-live", templateChoice: "posts-default.html", status: "published" });
  // Saved into the composed repo (not swapped in), so the comments target lookup sees the same post.
  await base.postRepo.save(post);
  const deps = { ...base,
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: base.workspaceId, activeThemeId: "tovu-starter", updatedAt: "2026-10-21T00:00:00.000Z" }] }) };
  const baseUrl = await startTestServer(createApp(deps), t);

  const page = await fetch(`${baseUrl}/comments-live`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "private, no-store");
  assert.match(html, /<form method="post" action="\/api\/site\/comments">/);

  const origin = new URL(baseUrl).origin;
  const submitted = await fetch(`${baseUrl}/api/site/comments`, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin },
    body: new URLSearchParams({ entryId: post.id, returnTo: "/comments-live", authorName: "Visitor <b>", body: "Held until approved", website: "" }) });
  assert.equal(submitted.status, 303);
  assert.equal(submitted.headers.get("location"), "/comments-live#comment-pending");
  const [held] = (await deps.commentRepo.listModerationQueue({ workspaceId: deps.workspaceId, status: "pending", limit: 5 })).items;
  assert.ok(held, "moderated by default: the comment waits in the queue");
  assert.doesNotMatch(await (await fetch(`${baseUrl}/comments-live`)).text(), /Held until approved/);

  const crossSite = await fetch(`${baseUrl}/api/site/comments`, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.test" },
    body: new URLSearchParams({ entryId: post.id, authorName: "x", body: "forged" }) });
  assert.equal(crossSite.status, 403);

  await deps.commentWriteService.applyModeration({ workspaceId: deps.workspaceId, id: held.id, expectedVersion: held.version,
    action: "approve", toStatus: "approved", actorPrincipalId: await deps.ownerPrincipalId, note: null });
  const approved = await (await fetch(`${baseUrl}/comments-live`)).text();
  assert.match(approved, /Held until approved/);
  assert.match(approved, /Visitor &lt;b&gt;/);

  const exported = await fetch(`${baseUrl}/comments-live`, { headers: { "x-tovu-static-export": "1" } });
  const exportedHtml = await exported.text();
  assert.match(exportedHtml, /<div data-comments-surface><\/div>/, "a static export ships an empty surface: no dead form, no stale snapshot");
  assert.doesNotMatch(exportedHtml, /Held until approved|action="\/api\/site\/comments"/);
});
