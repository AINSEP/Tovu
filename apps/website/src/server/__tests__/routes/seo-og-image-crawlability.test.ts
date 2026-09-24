import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { registerTransform, uploadMedia } from "#src/features/media/index";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { startTestServer } from "../helpers/http-test-server.js";

/**
 * @file Certifies the 2026-09-05 owner-directed fix to the seam between `seo/media.ts`'s
 * `resolveSeoImageRef` and the public media-rendition route (`routes/site/media-rendition.ts`).
 *
 * Before this fix (ADR-PIPE-008 EC-07's original "never generates" clause, certified by
 * `seo/__tests__/media.test.ts`'s "a registered transform with no generated rendition yet resolves
 * undefined"), `resolveSeoImageRef` required a rendition row to already exist before it would emit a
 * URL. Since a dedicated OG/featured image is the normal shape for `seoExtJson.ogImage`/
 * `twitterImage` — never embedded in any entry body (the admin's own `Seo.tsx` field is a plain text
 * ref input with no picker/preview that would otherwise trigger a fetch) — no OTHER code path ever
 * generated its rendition, so `og:image`/`twitter:image` was omitted from the rendered page forever,
 * even though the exact URL `resolveSeoImageRef` would have emitted was fully public and 200s the
 * moment anything requests it (the public route's own `isLatestTransformVersion` bound always allows
 * anonymous lazy generation for the LATEST registered transform version — the only version
 * `resolveSeoImageRef` ever selects).
 *
 * The owner ruled ("I want this to be viewable by everybody... I want this to be indexed by any
 * crawler or anything like that"): relax the rule. See ADR-PIPE-008's Amendments section for the
 * record of the override and its safety argument.
 *
 * This file's first test is the load-bearing end-to-end proof that the relaxed rule is actually
 * safe — it does not just assert the tag's presence (a tag pointing at a 404 would be worse than no
 * tag at all), it fetches the EXACT published URL anonymously, no cookies, no Authorization header,
 * and asserts a real 200 with an image content-type. The second test guards the pre-existing
 * "already warmed" case, which must keep working unchanged.
 */

const OG_TRANSFORM_NAME = "public";

function imageBytes(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

/** Same `blobRepo`/`renditionRepo` field-naming mapping every sibling media-rendition suite uses —
 *  `uploadMedia`/`registerTransform`'s deps shape isn't `RouteDeps` verbatim. */
async function uploadOne(deps: ReturnType<typeof createRouteDeps>, bytes: Uint8Array, filename: string) {
  return uploadMedia({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      mediaRepo: deps.mediaRepo,
      blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo,
      blobStore: deps.blobStore,
    },
    input: { workspaceId: deps.workspaceId, bytes, filename, contentType: "image/png", createdByPrincipal: "user-1" },
  });
}

async function registerOgTransform(deps: ReturnType<typeof createRouteDeps>) {
  return registerTransform({
    deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name: OG_TRANSFORM_NAME, params: { format: "webp" }, owner: "core" },
  });
}

function publishedPostWithOgImageRef(input: {
  id: string;
  slug: string;
  workspaceId: string;
  ogImageRef: string;
}): PostRecord {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    title: "A Public Post With A Dedicated Share-Card Image",
    slug: input.slug,
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "body text" }] }] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    seoExtJson: JSON.stringify({ ogImage: input.ogImageRef }),
    updatedAt: new Date().toISOString(),
    version: 1,
  } as unknown as PostRecord;
}

/** Extracts `og:image`'s `content` attribute from a rendered page, or `undefined` if the tag is absent. */
function extractOgImage(html: string): string | undefined {
  return html.match(/<meta property="og:image" content="([^"]*)"/)?.[1];
}

test("SEO/media fix: a dedicated (never-embedded) OG image with NO pre-existing rendition still gets an og:image tag, and the exact published URL 200s anonymously with an image content-type", async (t) => {
  const deps = createRouteDeps();
  const { media } = await uploadOne(deps, imageBytes("dedicated-og-image-never-embedded"), "cover.png");
  const { definition } = await registerOgTransform(deps);
  // No rendition generated yet -- nobody's browser has ever requested this asset+transform combo,
  // since it is only ever referenced via `seoExtJson.ogImage`, never placed in any entry body. Before
  // the 2026-09-05 fix this was exactly the condition under which og:image stayed omitted forever.
  await deps.postRepo.save(
    publishedPostWithOgImageRef({
      id: randomUUID(),
      slug: "post-with-unwarmed-og-image",
      workspaceId: deps.workspaceId,
      ogImageRef: `${media.id}:${OG_TRANSFORM_NAME}`,
    })
  );

  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  await deps.seoReady;

  const page = await fetch(`${baseUrl}/post-with-unwarmed-og-image`);
  assert.equal(page.status, 200);
  const html = await page.text();
  const ogImage = extractOgImage(html);
  assert.ok(ogImage, "og:image must be present even though nothing has ever generated this rendition before");
  assert.match(ogImage!, /^https?:\/\//, "og:image must be an ABSOLUTE URL -- crawlers do not resolve relative image URLs");
  assert.ok(
    new URL(ogImage!).pathname.startsWith(`/m/${media.slug}/${definition.name}.v${definition.version}/`),
    `og:image path must be keyed by the asset's readable slug (readable-slugs S4), got: ${ogImage}`
  );

  // The load-bearing proof: fetch the EXACT path the page just published, anonymously -- no cookies,
  // no Authorization header. A tag pointing at a 404 would be worse than no tag at all. Refetched
  // against `baseUrl` rather than `ogImage` verbatim, same as the sibling test below: the verified
  // origin this test's deps resolve to is a fixed placeholder, not this test server's real ephemeral
  // port, so the absolute URL's ORIGIN is not meaningful here -- only its path is.
  const ogImagePath = new URL(ogImage!).pathname;
  const crawlerFetch = await fetch(`${baseUrl}${ogImagePath}`);
  assert.equal(
    crawlerFetch.status,
    200,
    "the exact URL published in og:image must itself be publicly fetchable on first request"
  );
  assert.match(
    crawlerFetch.headers.get("content-type") ?? "",
    /^image\//,
    "the fetched og:image URL must actually serve image bytes, not just exist as a string in the markup"
  );
  assert.equal(
    crawlerFetch.headers.get("cache-control"),
    "public, max-age=3600",
    "og:image is now emitted slug-keyed (readable-slugs S4), so an ungated 200 gets the SLUG_KEYED_PUBLIC TTL, not the id-keyed immutable one (S2b)"
  );
});

test("SEO/media-gate seam: once the SAME rendition exists (e.g. an admin previewed it, or a prior crawler attempt generated it), og:image appears with an absolute URL and 200s anonymously with no cookies", async (t) => {
  const deps = createRouteDeps();
  const { media } = await uploadOne(deps, imageBytes("dedicated-og-image-warmed"), "cover2.png");
  const { definition } = await registerOgTransform(deps);
  await deps.postRepo.save(
    publishedPostWithOgImageRef({
      id: randomUUID(),
      slug: "post-with-warmed-og-image",
      workspaceId: deps.workspaceId,
      ogImageRef: `${media.id}:${OG_TRANSFORM_NAME}`,
    })
  );

  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  await deps.seoReady;

  // Simulate the one-time warm-up (an admin's own preview visit, or a first crawler retry).
  const warmUp = await fetch(`${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/cover2.webp`);
  assert.equal(warmUp.status, 200);

  const page = await fetch(`${baseUrl}/post-with-warmed-og-image`);
  const html = await page.text();
  const ogImage = extractOgImage(html);
  assert.ok(ogImage, "og:image must now be present -- the rendition exists, so resolveSeoImageRef resolves it");
  assert.match(ogImage!, /^https?:\/\//, "og:image must be an ABSOLUTE URL -- crawlers do not resolve relative image URLs");

  const ogImagePath = new URL(ogImage!).pathname;
  const crawlerFetch = await fetch(`${baseUrl}${ogImagePath}`);
  assert.equal(crawlerFetch.status, 200, "the exact URL published in og:image must itself be publicly fetchable");
  assert.equal(
    crawlerFetch.headers.get("cache-control"),
    "public, max-age=3600",
    "og:image is now emitted slug-keyed (readable-slugs S4), so an ungated 200 gets the SLUG_KEYED_PUBLIC TTL, not the id-keyed immutable one (S2b)"
  );
});
