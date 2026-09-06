import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { registerTransform, uploadMedia } from "#src/features/media/index";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { startTestServer } from "../helpers/http-test-server.js";

/**
 * @file Characterizes the seam between `seo/media.ts`'s `resolveSeoImageRef` (never generates a
 * rendition — ADR-PIPE-008 EC-07, certified by `seo/__tests__/media.test.ts`'s "a registered
 * transform with no generated rendition yet resolves undefined") and the public media-rendition
 * route (`routes/site/media-rendition.ts`), which CAN lazily generate the same rendition on demand.
 *
 * The 2026-09-05 owner ruling ("published content and its media must be anonymously reachable and
 * crawlable") makes the gap between those two facts directly load-bearing: a share-card image that
 * is never embedded in any entry body (the normal shape for a dedicated OG/featured image — the
 * admin's own `Seo.tsx` field is a plain text ref input with no picker/preview that would otherwise
 * trigger a fetch) has no OTHER code path that ever generates its rendition. So `og:image`/
 * `twitter:image` can go on being omitted from the rendered page forever, even though the exact URL
 * `resolveSeoImageRef` would have emitted is fully public and 200s the moment anything requests it.
 *
 * This file does not change behavior — `resolveSeoImageRef`'s "never generates" rule is a certified,
 * ADR-governed decision this task does not have a mandate to overturn (see the handoff). It exists so
 * the gap is pinned down as measured, reproducible behavior rather than inferred from reading code.
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

test("SEO/media-gate seam: a dedicated (never-embedded) OG image whose rendition has not yet been generated is omitted from the page, even though its exact /m/ URL is already publicly servable", async (t) => {
  const deps = createRouteDeps();
  const { media } = await uploadOne(deps, imageBytes("dedicated-og-image-never-embedded"), "cover.png");
  const { definition } = await registerOgTransform(deps);
  // No rendition generated yet -- nobody's browser has ever requested this asset+transform combo,
  // since it is only ever referenced via `seoExtJson.ogImage`, never placed in any entry body.
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
  assert.equal(
    extractOgImage(html),
    undefined,
    "resolveSeoImageRef's EC-07 rule (never generates) omits og:image until SOMETHING else has generated this rendition"
  );

  // The gate is not what is blocking this -- the identical URL `resolveSeoImageRef` would have
  // composed is already 200-able to a plain anonymous fetch, no cookies, no auth.
  const directUrl = `${baseUrl}/m/${media.id}/${definition.name}.v${definition.version}/cover.webp`;
  const direct = await fetch(directUrl);
  assert.equal(
    direct.status,
    200,
    "the media gate already allows this asset through anonymously -- the missing tag is the only blocker"
  );
  assert.equal(direct.headers.get("cache-control"), "public, max-age=31536000, immutable");
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
  assert.equal(crawlerFetch.headers.get("cache-control"), "public, max-age=31536000, immutable");
});
