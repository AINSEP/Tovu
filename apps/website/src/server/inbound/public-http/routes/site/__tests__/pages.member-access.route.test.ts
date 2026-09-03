import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { MemberSessionRecord } from "#src/features/members/index";
import { InMemoryMemberSessionRepo } from "#src/features/members/index";
import { loadTheme } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file Regression coverage for the 2026-09-02 member-gating dispatch (ADR-030 §4).
 *
 * `MemberAccessResolver.decide()` (`features/members/access-resolver.ts`) previously had ZERO
 * production call sites — every `.decide(` call in the repo lived only in
 * `features/members/__tests__/access-resolver.test.ts`. This file proves the wiring added to
 * `pages.ts`'s `GET /` and `GET /:slug` handlers: the single-post gate (a denied visitor gets the
 * same 404 a missing slug gets, never a distinguishable response) AND the post-list filter (a
 * members-only post must not advertise its title/link on the ungated home/nav listing even while its
 * own page 404s — gating only the direct page fetch would be protection that looks real and isn't).
 *
 * Real HTTP requests via `createApp`, in-memory repos — same technique `pages.route.test.ts`
 * (same directory) already uses for this route family.
 */

const WORKSPACE_ID = createRouteDeps().workspaceId;
const RAW_MEMBER_TOKEN = "test-raw-member-session-token-for-gating-regression";

function memberGatedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-member-gating-test",
    workspaceId: WORKSPACE_ID,
    title: "Members Only Post",
    slug: "members-only-post",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-09-02T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as PostRecord;
}

function activeMemberSession(): MemberSessionRecord {
  return {
    id: "session-member-gating-test",
    workspaceId: WORKSPACE_ID,
    memberId: "member-gating-test-1",
    // Same `createHash("sha256").update(rawToken).digest("hex")` shape `access-resolver.ts`'s own
    // (private) `hashToken` uses — duplicated here deliberately rather than importing it, the same
    // "each side owns its own copy of a one-line hash" precedent that file's own header documents.
    tokenHash: createHash("sha256").update(RAW_MEMBER_TOKEN).digest("hex"),
    createdAt: "2026-09-02T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

async function startServer(overrides: Partial<ReturnType<typeof createRouteDeps>>) {
  const deps = { ...createRouteDeps(), ...overrides };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

test("GET /:slug -- an anonymous visitor is 404'd for a members-only post", async (t) => {
  const post = memberGatedPost({ memberAccessJson: JSON.stringify({ visibility: "members" }) });
  const { server, baseUrl } = await startServer({ postRepo: new InMemoryPostRepo([post]) });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/${post.slug}`);
  assert.equal(res.status, 404, "an anonymous visitor must not be able to read a members-only post");
});

test("GET /:slug -- a signed-in member CAN read a members-only post", async (t) => {
  const post = memberGatedPost({ memberAccessJson: JSON.stringify({ visibility: "members" }) });
  const { server, baseUrl } = await startServer({
    postRepo: new InMemoryPostRepo([post]),
    memberSessionRepo: new InMemoryMemberSessionRepo([activeMemberSession()]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/${post.slug}`, {
    headers: { cookie: `tovu_member_session=${RAW_MEMBER_TOKEN}` },
  });
  assert.equal(res.status, 200, "a signed-in member holding no tier at all must still read a members-only post");
  const html = await res.text();
  assert.match(html, /Members Only Post/, "the gated post's own page must render its real content for an entitled member");
});

test("GET / -- a members-only post's title does not appear in the anonymous home/nav listing", async (t) => {
  // The shipped default theme ("basic") is `tier: "static"` — its home route serves a hand-authored
  // static `pages/index.html` and never touches `ctx.posts` at all, so it can't prove this fix one
  // way or the other. `themes/dispatch` (loaded the same way `render.test.ts`'s own "renders the
  // live themes/dispatch home page: ... entry grid ..." test does) is a `templated`-tier Tier-2
  // demonstrator whose home page genuinely loops over `posts` and prints each title — the real
  // surface `filterVisiblePosts` has to reach for this test to mean anything.
  const theme = loadTheme({
    themeDir: path.join(process.cwd(), "development", "fixtures", "theme-archive", "dispatch"),
    id: "dispatch",
    source: "built-in",
  });
  assert.equal(theme.status, "valid", `expected dispatch to load valid, got errors: ${JSON.stringify(theme.errors)}`);

  const gatedPost = memberGatedPost({ memberAccessJson: JSON.stringify({ visibility: "members" }) });
  const publicPost = memberGatedPost({ id: "post-member-gating-public-control", slug: "public-control-post", title: "Public Control Post" });
  const { server, baseUrl } = await startServer({
    themes: [theme],
    postRepo: new InMemoryPostRepo([gatedPost, publicPost]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(baseUrl);
  assert.equal(res.status, 200);
  const html = await res.text();
  // Positive control FIRST: proves the entry list actually renders posts at all on this theme, so
  // the negative assertion below can't false-pass because nothing rendered.
  assert.match(html, /Public Control Post/, "a public post must still appear in the entry list (positive control)");
  assert.doesNotMatch(
    html,
    /Members Only Post/,
    "a gated post must not advertise its title on the ungated home listing even though its own page 404s"
  );
});

test("GET /:slug -- a NULL memberAccessJson post still renders publicly (pre-existing behavior, unchanged)", async (t) => {
  const post = memberGatedPost(); // memberAccessJson left unset -> NULL column, decodes as public
  const { server, baseUrl } = await startServer({ postRepo: new InMemoryPostRepo([post]) });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/${post.slug}`);
  assert.equal(res.status, 200, "a post with no member-access value ever set must keep rendering publicly, unchanged");
});
