import assert from "node:assert/strict";
import test from "node:test";

import { createRouteDeps } from "../../../app.js";
import { resolveHtmlEmbedsForRender, resolveMediaAssetMetadataForRender } from "../pages.js";

/**
 * @file Direct-import characterization for two of `pages.ts`'s exported `resolve*ForRender`
 * helpers' `!post` guard branches. Both functions are declared `post: PostRecord | undefined`,
 * but every real call site in `registerSiteRoutes` (`renderGenericPostPage`) only ever calls them
 * with an already-resolved, defined `PostRecord` — the `!post` arm of each guard is dead through
 * any real HTTP request and only reachable by calling the exported function directly, the same
 * reason `resolveHtmlFormatContentMarkers` gets its own direct-import test file rather than relying
 * on HTTP round trips alone.
 */

test("resolveHtmlEmbedsForRender: an undefined post short-circuits to undefined, never touching resolveHtmlPageEmbeds", async () => {
  const deps = createRouteDeps();
  const result = await resolveHtmlEmbedsForRender(deps, undefined);
  assert.equal(result, undefined);
});

test("resolveMediaAssetMetadataForRender: an undefined post short-circuits to an empty map, never scanning for image assetIds", async () => {
  const deps = createRouteDeps();
  const result = await resolveMediaAssetMetadataForRender(deps, undefined);
  assert.equal(result.size, 0);
});
