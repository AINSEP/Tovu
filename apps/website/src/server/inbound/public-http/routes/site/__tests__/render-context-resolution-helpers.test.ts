import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { createRouteDeps } from "../../../../../runtime/composition/app.js";
import { resolveHtmlEmbedsForRender, resolveMediaAssetMetadataForRender } from "../pages.js";

/**
 * @file Direct-import characterization for `pages.ts`'s exported `resolve*ForRender` helpers'
 * branches that no real HTTP request reaches:
 *
 * - `resolveHtmlEmbedsForRender`/`resolveMediaAssetMetadataForRender`'s `!post` guard — both are
 *   declared `post: PostRecord | undefined`, but every real call site in `registerSiteRoutes`
 *   (`renderGenericPostPage`) only ever calls them with an already-resolved, defined `PostRecord`,
 *   so the `!post` arm is unreachable through any real request and only reachable by calling the
 *   exported function directly, the same reason `resolveHtmlFormatContentMarkers` gets its own
 *   direct-import test file rather than relying on HTTP round trips alone.
 * - `resolveMediaAssetMetadataForRender`'s local `collectImageAssetIds`/`isPlainObject` walk over
 *   an arbitrary TipTap-shaped `bodyJson` tree — every existing HTTP-level fixture authors a
 *   well-formed doc tree (real objects throughout), so the walk's own defensive handling of a
 *   malformed node (a bare primitive or a literal `null` sitting where an object was expected) has
 *   never actually run.
 */

function postRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: "workspace-local",
    title: "A post",
    slug: "a-post",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-08-17T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as PostRecord;
}

test("resolveHtmlEmbedsForRender: an undefined post short-circuits to undefined, never touching resolveHtmlPageEmbeds", async () => {
  const deps = createRouteDeps();
  const result = await resolveHtmlEmbedsForRender(deps, undefined);
  assert.equal(result, undefined);
});

test("resolveHtmlEmbedsForRender: an html-format post with a null bodyHtml falls back to an empty string, not a crash", async () => {
  const deps = createRouteDeps();
  const post = postRecord({ bodyFormat: "html", bodyHtml: null });
  const result = await resolveHtmlEmbedsForRender(deps, post);
  assert.notEqual(result, undefined, "an html-format post must still resolve (against the empty-string fallback), not short-circuit");
});

test("resolveMediaAssetMetadataForRender: an undefined post short-circuits to an empty map, never scanning for image assetIds", async () => {
  const deps = createRouteDeps();
  const result = await resolveMediaAssetMetadataForRender(deps, undefined);
  assert.equal(result.size, 0);
});

test("resolveMediaAssetMetadataForRender: a malformed bodyJson tree (a bare primitive and a literal null among the content array) is walked without crashing", async () => {
  const deps = createRouteDeps();
  const post = postRecord({
    bodyJson: {
      type: "doc",
      // "just a string", a literal null, and a nested array all sit where a real TipTap node
      // object would be — none is a plain object, so `collectImageAssetIds`'s own `isPlainObject`
      // guard must reject each one instead of crashing on `node.type`/`node.attrs` lookups.
      content: ["just a string", null, [{ type: "paragraph", content: null }]],
    },
  });
  const result = await resolveMediaAssetMetadataForRender(deps, post);
  assert.equal(result.size, 0, "no real image node exists anywhere in this malformed tree, so nothing should resolve");
});

test("resolveMediaAssetMetadataForRender: an image node whose attrs is itself an array (not a plain object) is skipped, not crashed on", async () => {
  const deps = createRouteDeps();
  const post = postRecord({
    bodyJson: {
      type: "doc",
      // isPlainObject's own `!Array.isArray(value)` arm is only exercised when something that IS
      // an array is handed to it as a value that isn't the top-level walked `node` itself (that
      // case is already handled by collectImageAssetIds's own `Array.isArray(node)` branch one
      // level up) -- `attrs` being an array is the other call site (`isPlainObject(node.attrs)`).
      content: [{ type: "image", attrs: ["not", "a", "real", "attrs", "object"] }],
    },
  });
  const result = await resolveMediaAssetMetadataForRender(deps, post);
  assert.equal(result.size, 0, "an array-shaped attrs must be rejected by isPlainObject, not read as a real attrs object");
});
