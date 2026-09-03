import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerContentPostGetRoute } from "../../inbound/public-http/routes/content/posts/get-by-slug.js";
import type { RouteDeps } from "../../routes/types.js";
import type { PostRecord } from "../../../features/post/post.js";
import { startTestServer, extractRouteHandler, createCapturingResponse } from "../helpers/http-test-server.js";

/**
 * @file Coverage-gap fill for the PUBLIC, UNAUTHENTICATED content route `GET
 * /api/content/v1/workspaces/:workspaceId/posts/:slug` (`content/posts/get-by-slug.ts`). Previously
 * exercised only indirectly (via `packet-one-routes.test.ts`'s one happy path and
 * `admin-post-page-delete-routes.test.ts`'s before/after-delete pair), so the workspace-mismatch,
 * `PresentationSettingsNotFoundError`, and generic-500 branches were never reached.
 *
 * SECURITY FINDING (reported, not fixed here -- see the coverage-gap report): this route applies
 * NO member-content gating. `getPublishedPostBySlug` (`features/post/post.ts`) correctly excludes
 * drafts and trashed rows, but does not consult `MemberAccessResolver`/`resolvePostMemberAccess` at
 * all, unlike `routes/site/pages.ts`'s `GET /:slug` (gated 2026-09-02, commit 7fb47f55). A post whose
 * `memberAccessJson` marks it `members`/`paid`/`tiers` is served here to ANY anonymous caller who
 * knows its slug. This suite deliberately does NOT add a passing test asserting that a gated post
 * 200s for an anonymous caller -- that would enshrine the bug. The tests below cover the route's
 * genuinely correct behavior (published-only visibility, workspace scoping, presentation-missing,
 * unexpected-error) without asserting anything about member-gated content.
 */

const WORKSPACE_ID = "workspace-local";

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerContentPostGetRoute(app, deps);
  return { app, deps };
}

function contentUrl(slug: string): string {
  return `/api/content/v1/workspaces/${WORKSPACE_ID}/posts/${slug}`;
}

function makePost(overrides: Partial<PostRecord> & Pick<PostRecord, "id" | "slug">): PostRecord {
  return {
    workspaceId: WORKSPACE_ID,
    title: "Untitled",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test("GET content post by slug: a workspace id that is not this site's is 404, before any repo lookup", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/content/v1/workspaces/not-this-site/posts/anything`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "workspace was not found");
});

test("GET content post by slug: a published post is served with presentation settings", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  await deps.postRepo.save(makePost({ id: "p-published", slug: "public-hello", title: "Public Hello", status: "published" }));

  const res = await fetch(`${baseUrl}${contentUrl("public-hello")}`);
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw) as { post: { title: string }; presentation: { activeThemeId: string } };
  assert.equal(body.post.title, "Public Hello");
  assert.ok(body.presentation.activeThemeId.length > 0);
});

test("GET content post by slug: a draft post 404s (never served to an anonymous visitor)", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  await deps.postRepo.save(makePost({ id: "p-draft", slug: "draft-hello", status: "draft" }));

  const res = await fetch(`${baseUrl}${contentUrl("draft-hello")}`);
  assert.equal(res.status, 404);
});

test("GET content post by slug: a trashed (soft-deleted) post 404s even though the row still exists", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  await deps.postRepo.save(
    makePost({ id: "p-trashed", slug: "trashed-hello", status: "published", deletedAt: "2026-09-01T00:00:00.000Z" })
  );

  const res = await fetch(`${baseUrl}${contentUrl("trashed-hello")}`);
  assert.equal(res.status, 404);
});

test("GET content post by slug: a workspace with no presentation settings row 404s (PresentationSettingsNotFoundError), not 500", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  await deps.postRepo.save(makePost({ id: "p-no-presentation", slug: "no-presentation", status: "published" }));

  const originalFind = deps.presentationRepo.findByWorkspaceId.bind(deps.presentationRepo);
  deps.presentationRepo.findByWorkspaceId = async () => null;
  try {
    const res = await fetch(`${baseUrl}${contentUrl("no-presentation")}`);
    assert.equal(res.status, 404);
  } finally {
    deps.presentationRepo.findByWorkspaceId = originalFind;
  }
});

test("GET content post by slug: an unexpected repo error surfaces as a generic 500", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const originalFindBySlug = deps.postRepo.findBySlug.bind(deps.postRepo);
  deps.postRepo.findBySlug = async () => {
    throw new Error("boom");
  };
  try {
    const res = await fetch(`${baseUrl}${contentUrl("anything")}`);
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "internal error" });
  } finally {
    deps.postRepo.findBySlug = originalFindBySlug;
  }
});

test("GET content post by slug: req.params.slug is always populated by Express for a matched route (defensive ?? \"\" fallback is unreachable through real HTTP)", async () => {
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "get", "/api/content/v1/workspaces/:workspaceId/posts/:slug");
  const { res, capture } = createCapturingResponse();

  await handler({ params: { workspaceId: WORKSPACE_ID } }, res);

  assert.equal(capture.statusCode, 404);
});

test("GET content post by slug: req.params.workspaceId is likewise always populated by Express (its own ?? \"\" fallback is equally unreachable through real HTTP)", async () => {
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "get", "/api/content/v1/workspaces/:workspaceId/posts/:slug");
  const { res, capture } = createCapturingResponse();

  await handler({ params: {} }, res);

  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});
