import assert from "node:assert/strict";
import test from "node:test";

import { mediaPublicPath, mediaUrlKey } from "../public-path.js";

/**
 * @file `mediaUrlKey`/`mediaPublicPath` (readable-slugs plan S1) — the one place that decides
 * whether a `/m/...` URL is keyed by id or by slug, and the one place that templates the path
 * itself. See `apps/website/src/features/media/public-path.ts`'s own header for the design.
 */

test("mediaUrlKey prefers a valid slug over the id", () => {
  assert.equal(mediaUrlKey({ id: "asset-1", slug: "fox" }), "fox");
});

test("mediaUrlKey falls back to the id for a null, empty, or malformed slug", () => {
  for (const slug of [null, "", "..", "a/b", "550e8400-e29b-41d4-a716-446655440000"]) {
    assert.equal(mediaUrlKey({ id: "asset-1", slug }), "asset-1", `expected fallback to id for slug ${JSON.stringify(slug)}`);
  }
});

test("mediaUrlKey falls back to the id when a slug is not present at all", () => {
  assert.equal(mediaUrlKey({ id: "asset-1" }), "asset-1");
});

test("mediaPublicPath builds the original-video path, encoding the key", () => {
  assert.equal(mediaPublicPath("fox photo", { kind: "original" }), "/m/fox%20photo/original");
});

test("mediaPublicPath builds the versioned-transform path, encoding key and transform name", () => {
  assert.equal(
    mediaPublicPath("fox", { kind: "transform", name: "public", version: 3, ext: "jpg" }),
    "/m/fox/public.v3/image.jpg"
  );
  assert.equal(
    mediaPublicPath("asset-1", { kind: "transform", name: "a b", version: 1, ext: "webp" }),
    "/m/asset-1/a%20b.v1/image.webp"
  );
});
