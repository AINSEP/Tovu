import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { SeoRouteDeps } from "#src/server/inbound/admin-http/routes/seo/deps";
import { OriginNotVerifiedError, type OriginRegistryPort } from "#src/features/origin/index";
import { registerLlmsTxtRoute } from "../llms.js";

/**
 * @file `registerLlmsTxtRoute` (`routes/site/llms.ts`) — 2026-09-04 rewrite from a hand-curated
 * `CURATED_DOCS` allowlist to a derived index built on `computeIndexableEntries`
 * (`features/seo/sitemap.ts`), the same publish/visibility/indexability filter `sitemap.xml` uses
 * (INV-04/05). This intentionally REPLACES the prior "only these 6 curated slugs, if published and
 * ungated" behavior — every published, publicly-visible, non-`noindex` post/page is now listed, not
 * just a curated subset — because a hand-maintained list drifts the moment a page is published or
 * renamed (see this route's own file header). The prior file's 4 tests exercised that curated-slug
 * behavior specifically (`quickstart`-shaped fixtures) and no longer describe a real code path; this
 * file replaces them with the general form of the same scenarios (published/draft/gated/noindex)
 * plus the absolute-URL and no-origin-degradation coverage the new `toAbsoluteUrl` wiring needs.
 */

function buildLlmsOnlyApp(depsOverrides: Partial<SeoRouteDeps>): express.Express {
  const base = createRouteDeps();
  const deps: SeoRouteDeps = { ...base, ...depsOverrides };
  const app = express();
  registerLlmsTxtRoute(app, deps);
  return app;
}

/** A short single-paragraph body so `deriveExcerpt` (`features/seo/seo.ts`) resolves a real,
 *  non-truncated description from actual content — proving descriptions come from the page's own
 *  SEO meta rather than being invented by the route. */
function pagePost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-llms-fixture",
    workspaceId: createRouteDeps().workspaceId,
    title: "Guide To Everything",
    slug: "guide-to-everything",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A real page about real things." }] }] },
    status: "published",
    kind: "page",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: new Date().toISOString(),
    version: 1,
    seoExtJson: null,
    memberAccessJson: null,
    ...overrides,
  } as unknown as PostRecord;
}

/** Mirrors `robots.route.test.ts`'s/`pages.route.test.ts`'s own identical `NoOriginRegistry` —
 *  simulates a workspace with no verified origin registered yet, the disclosed degradation
 *  `toAbsoluteUrl` falls back to. */
class NoOriginRegistry implements OriginRegistryPort {
  async canonicalOrigin(): Promise<never> {
    throw new OriginNotVerifiedError("no verified origin registered for this workspace");
  }
  async isAllowedRedirectTarget(): Promise<boolean> {
    return false;
  }
  async isAllowedEgressTarget(): Promise<boolean> {
    return false;
  }
}

test("GET /llms.txt: a published, publicly-visible page appears, linked with an absolute URL and its real derived description", async (t) => {
  const postRepo = new InMemoryPostRepo([pagePost()]);
  const app = buildLlmsOnlyApp({ postRepo });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/llms.txt`);
  assert.equal(res.status, 200);
  const body = await res.text();
  // `createRouteDeps()` seeds a verified `dev-capability` origin (`http://localhost:3000`,
  // same fixture `robots.route.test.ts`/`pages.route.test.ts` rely on) — so the default deps here
  // already exercise the absolute-URL path.
  assert.match(
    body,
    /- \[Guide To Everything\]\(http:\/\/localhost:3000\/guide-to-everything\): A real page about real things\./
  );
});

test("GET /llms.txt: a draft page does not appear", async (t) => {
  const postRepo = new InMemoryPostRepo([pagePost({ status: "draft" })]);
  const app = buildLlmsOnlyApp({ postRepo });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/llms.txt`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.doesNotMatch(body, /guide-to-everything/, "a draft post must not be linked as a live page");
});

test("GET /llms.txt: an effective-noindex page does not appear", async (t) => {
  const postRepo = new InMemoryPostRepo([pagePost({ seoExtJson: JSON.stringify({ noindex: true }) })]);
  const app = buildLlmsOnlyApp({ postRepo });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/llms.txt`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.doesNotMatch(body, /guide-to-everything/, "a noindex page must not be listed in an AI-discovery index");
});

test("GET /llms.txt: a members-gated published page does not appear to an anonymous reader (ADR-030 §4)", async (t) => {
  const postRepo = new InMemoryPostRepo([pagePost({ memberAccessJson: JSON.stringify({ visibility: "members" }) })]);
  const app = buildLlmsOnlyApp({ postRepo });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/llms.txt`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.doesNotMatch(
    body,
    /guide-to-everything/,
    "a gated page must not be listed — llms.txt is a single, cache-backed, session-blind document with no per-caller branching, same as sitemap.xml"
  );
});

test("GET /llms.txt: with NO verified origin registered, the page URL degrades to the bare relative path (disclosed fallback, no fabricated origin)", async (t) => {
  const postRepo = new InMemoryPostRepo([pagePost()]);
  const app = buildLlmsOnlyApp({ postRepo, originRegistry: new NoOriginRegistry() });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/llms.txt`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /- \[Guide To Everything\]\(\/guide-to-everything\):/);
  assert.doesNotMatch(body, /localhost:3000/, "no verified origin means no origin may be fabricated");
});

test("GET /llms.txt: a post-read failure is caught and reported as a plain-text 500, not an uncaught rejection", async (t) => {
  // Mutate the real repo instance's own `list`, rather than spreading it into a plain object --
  // `InMemoryPostRepo`'s methods live on its prototype, so a spread would silently drop
  // `findById`/`findBySlug`/etc. too.
  const postRepo = new InMemoryPostRepo([]);
  postRepo.list = async () => {
    throw new Error("post store unavailable");
  };
  const app = buildLlmsOnlyApp({ postRepo });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/llms.txt`);
  assert.equal(res.status, 500);
  assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
  assert.equal(await res.text(), "internal error");
});
