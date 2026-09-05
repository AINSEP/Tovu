import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerContentPostGetRoute } from "../../inbound/public-http/routes/content/posts/get-by-slug.js";
import type { RouteDeps } from "../../routes/types.js";
import type { PostRecord } from "../../../features/post/post.js";
import type { MemberSessionRecord } from "../../../features/members/index.js";
import { InMemoryMemberSessionRepo } from "../../../features/members/index.js";
import { startTestServer, extractRouteHandler, createCapturingResponse } from "../helpers/http-test-server.js";

/**
 * @file Coverage-gap fill for the PUBLIC, UNAUTHENTICATED content route `GET
 * /api/content/v1/workspaces/:workspaceId/posts/:slug` (`content/posts/get-by-slug.ts`). Previously
 * exercised only indirectly (via `packet-one-routes.test.ts`'s one happy path and
 * `admin-post-page-delete-routes.test.ts`'s before/after-delete pair), so the workspace-mismatch,
 * `PresentationSettingsNotFoundError`, and generic-500 branches were never reached.
 *
 * SECURITY FIX (2026-09-03): this route previously applied NO member-content gating -- a post whose
 * `memberAccessJson` marked it `members`/`paid`/`tiers` was served in full to ANY anonymous caller
 * who knew its slug, unlike `routes/site/pages.ts`'s `GET /:slug` (gated 2026-09-02, commit
 * `7fb47f55`, which this route was missed by). The two "member gating" tests below prove the fix:
 * an anonymous caller is refused (404, same shape a nonexistent slug gets, with the gated title and
 * body text absent from the response entirely) and an entitled signed-in member still reads the
 * real content. The rest of the suite is unchanged: published-only visibility, workspace scoping,
 * presentation-missing, and unexpected-error handling.
 */

const WORKSPACE_ID = "workspace-local";
const RAW_MEMBER_TOKEN = "test-raw-member-session-token-for-content-api-gating";

function buildTestApp(overrides: Partial<RouteDeps> = {}): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = { ...createRouteDeps(), ...overrides };
  const app = express();
  app.use(express.json());
  registerContentPostGetRoute(app, deps);
  return { app, deps };
}

/** Same `createHash("sha256").update(rawToken).digest("hex")` shape `access-resolver.ts`'s own
 *  (private) `hashToken` uses -- duplicated here rather than imported, same precedent
 *  `pages.member-access.route.test.ts` (`routes/site/__tests__/`) already follows. */
function activeMemberSession(): MemberSessionRecord {
  return {
    id: "session-content-api-gating-test",
    workspaceId: WORKSPACE_ID,
    memberId: "member-content-api-gating-test-1",
    tokenHash: createHash("sha256").update(RAW_MEMBER_TOKEN).digest("hex"),
    createdAt: "2026-09-03T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
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

test("GET content post by slug: the 200 response sets Cache-Control: private, no-store -- BUG (2026-09-05 Gemini audit finding #7): this member-gated JSON route set no Cache-Control at all, so a reverse proxy/shared cache could legally cache and replay a member-only post's JSON to a later unauthenticated caller. Matches the convention `routes/site/pages.ts`'s CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE and `routes/site/media-rendition.ts`'s gated branch both already use.", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  await deps.postRepo.save(makePost({ id: "p-cache-control", slug: "cache-control-hello", title: "Cache Control Hello", status: "published" }));

  const res = await fetch(`${baseUrl}${contentUrl("cache-control-hello")}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
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

test("GET content post by slug: an anonymous caller is 404'd for a members-only post, and the gated title/body never appear in the response", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  await deps.postRepo.save(
    makePost({
      id: "p-members-only",
      slug: "members-only-post",
      title: "Members Only Secret Title",
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "MEMBERS_ONLY_SECRET_BODY_TEXT" }] }] },
      status: "published",
      memberAccessJson: JSON.stringify({ visibility: "members" }),
    })
  );

  const res = await fetch(`${baseUrl}${contentUrl("members-only-post")}`);
  const raw = await res.text();
  assert.equal(res.status, 404, raw);
  assert.doesNotMatch(raw, /Members Only Secret Title/, "the gated title must not leak into the 404 response body");
  assert.doesNotMatch(raw, /MEMBERS_ONLY_SECRET_BODY_TEXT/, "the gated body text must not leak into the 404 response body");
  assert.deepEqual(JSON.parse(raw), { error: "post 'members-only-post' was not found" }, "must be the SAME shape a nonexistent slug gets -- indistinguishable from 'no such post'");
});

test("GET content post by slug: an unrelated or malformed cookie header does not grant member access to a gated post", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  await deps.postRepo.save(
    makePost({
      id: "p-members-only-unrelated-cookies",
      slug: "members-only-post-unrelated-cookies",
      status: "published",
      memberAccessJson: JSON.stringify({ visibility: "members" }),
    })
  );

  const res = await fetch(`${baseUrl}${contentUrl("members-only-post-unrelated-cookies")}`, {
    headers: { cookie: "malformed_cookie_with_no_equals_sign; some_other_cookie=some_value" },
  });
  assert.equal(res.status, 404, "a malformed or unrelated cookie header must not be mistaken for a member session");
});

test("GET content post by slug: an entitled signed-in member CAN read a members-only post's real content", async (t) => {
  const { app, deps } = buildTestApp({ memberSessionRepo: new InMemoryMemberSessionRepo([activeMemberSession()]) });
  const baseUrl = await startTestServer(app, t);
  await deps.postRepo.save(
    makePost({
      id: "p-members-only-entitled",
      slug: "members-only-post-entitled",
      title: "Members Only Secret Title",
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "MEMBERS_ONLY_SECRET_BODY_TEXT" }] }] },
      status: "published",
      memberAccessJson: JSON.stringify({ visibility: "members" }),
    })
  );

  const res = await fetch(`${baseUrl}${contentUrl("members-only-post-entitled")}`, {
    headers: { cookie: `tovu_member_session=${RAW_MEMBER_TOKEN}` },
  });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw) as { post: { title: string } };
  assert.equal(body.post.title, "Members Only Secret Title", "a signed-in member holding no tier at all must still read a members-only post");
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
