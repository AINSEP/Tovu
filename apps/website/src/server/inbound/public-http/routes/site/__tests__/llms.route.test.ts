import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { SeoRouteDeps } from "#src/server/inbound/admin-http/routes/seo/deps";
import { registerLlmsTxtRoute } from "../llms.js";

/**
 * @file Coverage-gap fill for `registerLlmsTxtRoute` (`routes/site/llms.ts`). The happy path (a
 * curated slug that is currently a PUBLISHED post is listed, one that does not exist at all is
 * silently omitted) is already covered by `src/server/__tests__/routes/seo-site-serving.test.ts`.
 * This file targets `resolveLiveDocs`'s other branch: a curated slug that DOES exist as a post but
 * is not (yet, or no longer) published — e.g. a documentation page drafted before it ships — plus
 * the route's own `catch`.
 */

function curatedDraftPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-llms-draft-fixture",
    workspaceId: createRouteDeps().workspaceId,
    title: "Quickstart",
    slug: "quickstart",
    bodyJson: { type: "doc", content: [] },
    status: "draft",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: new Date().toISOString(),
    version: 1,
    ...overrides,
  } as unknown as PostRecord;
}

function buildLlmsOnlyApp(depsOverrides: Partial<SeoRouteDeps>): express.Express {
  const base = createRouteDeps();
  const deps: SeoRouteDeps = { ...base, ...depsOverrides };
  const app = express();
  registerLlmsTxtRoute(app, deps);
  return app;
}

test("GET /llms.txt: a curated slug that exists but is not published is omitted, same as one that doesn't exist at all", async (t) => {
  const postRepo = new InMemoryPostRepo([curatedDraftPost()]);
  const app = buildLlmsOnlyApp({ postRepo });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/llms.txt`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.doesNotMatch(body, /\/quickstart\)/, "a draft post at a curated slug must not be linked as a live doc");
});

test("GET /llms.txt: a post-read failure is caught and reported as a plain-text 500, not an uncaught rejection", async (t) => {
  // Mutate the real repo instance's own `findBySlug`, rather than spreading it into a plain
  // object -- `InMemoryPostRepo`'s methods live on its prototype, so a spread would silently drop
  // `list`/`save`/etc. too.
  const postRepo = new InMemoryPostRepo([]);
  postRepo.findBySlug = async () => {
    throw new Error("post store unavailable");
  };
  const app = buildLlmsOnlyApp({ postRepo });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/llms.txt`);
  assert.equal(res.status, 500);
  assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
  assert.equal(await res.text(), "internal error");
});
