import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import type { MediaRecord } from "#src/features/media/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
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
 * - `resolveMediaAssetMetadataForRender`'s local `collectMediaRefAssetIds`/`isPlainObject` walk over
 *   an arbitrary TipTap-shaped `bodyJson` tree — every existing HTTP-level fixture authors a
 *   well-formed doc tree (real objects throughout), so the walk's own defensive handling of a
 *   malformed node (a bare primitive or a literal `null` sitting where an object was expected) has
 *   never actually run.
 *
 * 2026-09-11 addition — the generic `media` doc node's content-type plumbing: the tests above (and
 * `tiptap-render-contract.test.ts`'s own `media` rows) prove `render.ts`'s `renderDocMedia` dispatch
 * given a HAND-BUILT `mediaAssetMetadata` map. Neither proves the map itself gets built correctly
 * from a real `MediaRepoPort`/`MediaContentTypeStorePort` pair — that this function actually reads
 * `MediaContentTypeStorePort.getMany`, keyed by the resolved record's `source.sha256` (NOT by
 * `assetId`), and writes the result onto `contentType`. The test below is that missing link, using
 * `createRouteDeps()`'s real (in-memory) adapters end to end rather than a fake.
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
      // object would be — none is a plain object, so `collectMediaRefAssetIds`'s own `isPlainObject`
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
      // case is already handled by collectMediaRefAssetIds's own `Array.isArray(node)` branch one
      // level up) -- `attrs` being an array is the other call site (`isPlainObject(node.attrs)`).
      content: [{ type: "image", attrs: ["not", "a", "real", "attrs", "object"] }],
    },
  });
  const result = await resolveMediaAssetMetadataForRender(deps, post);
  assert.equal(result.size, 0, "an array-shaped attrs must be rejected by isPlainObject, not read as a real attrs object");
});

/** A minimal, fully-specified `MediaRecord` — every field explicit (no partial/defaulting helper)
 *  since this is the one place this file constructs one directly against the real repo, not through
 *  `uploadMedia`'s own defaulting. */
function mediaRecord(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id: "asset-1",
    workspaceId: "workspace-local",
    title: "Asset",
    slug: "asset",
    alt: "",
    caption: "",
    credit: "",
    source: { sha256: "sha-1" },
    status: "active",
    createdAt: "2026-09-11T00:00:00.000Z",
    updatedAt: "2026-09-11T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    ...overrides,
  };
}

test(
  "resolveMediaAssetMetadataForRender: a media node's assetId resolves contentType through the REAL mediaRepo/mediaContentTypeStore pair, keyed by the resolved record's source.sha256 (not by assetId) — the end-to-end plumbing render.ts's renderDocMedia dispatch depends on, not just its own hand-built-map contract tests",
  async () => {
    const deps = createRouteDeps();
    await deps.mediaRepo.save(mediaRecord({ id: "asset-vid-1", source: { sha256: "sha-video-1" } }));
    // Deliberately a DIFFERENT sha256 than the one just saved — proves the lookup is keyed by the
    // BYTES' identity, not by assetId: if this function mistakenly kept the id as the key, this red
    // herring would be read instead and the assertion below would see the wrong (or no) type.
    await deps.mediaContentTypeStore.set({ workspaceId: "workspace-local", sha256: "sha-unrelated", contentType: "image/png" });
    await deps.mediaContentTypeStore.set({ workspaceId: "workspace-local", sha256: "sha-video-1", contentType: "video/mp4" });
    const post = postRecord({
      bodyJson: { type: "doc", content: [{ type: "media", attrs: { assetId: "asset-vid-1", transformName: "public" } }] },
    });

    const result = await resolveMediaAssetMetadataForRender(deps, post);

    assert.deepEqual(result.get("asset-vid-1"), {
      width: null,
      height: null,
      cssClass: null,
      htmlAttributes: null,
      slug: "asset",
      contentType: "video/mp4",
    });
  }
);

test(
  "resolveMediaAssetMetadataForRender: an asset whose blob has never been sniffed (no mediaContentTypeStore entry for its sha256) resolves contentType: null, not a crash or a fabricated guess",
  async () => {
    const deps = createRouteDeps();
    await deps.mediaRepo.save(mediaRecord({ id: "asset-unsniffed-1", source: { sha256: "sha-unsniffed-1" } }));
    const post = postRecord({
      bodyJson: { type: "doc", content: [{ type: "media", attrs: { assetId: "asset-unsniffed-1", transformName: "public" } }] },
    });

    const result = await resolveMediaAssetMetadataForRender(deps, post);

    assert.deepEqual(result.get("asset-unsniffed-1"), {
      width: null,
      height: null,
      cssClass: null,
      htmlAttributes: null,
      slug: "asset",
      contentType: null,
    });
  }
);
