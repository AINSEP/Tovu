/**
 * @file Task 12 of the publish-content (Publish Content) feature — required test #2 from the
 * dispatch: "a post importing alongside it renders its embed (this is the actual user-visible
 * property; a passing id test alone does not prove it)".
 *
 * A separate file from `import-media-entity.test.ts` because this one crosses into a different
 * module boundary — `server/inbound/public-http/http/site/render.ts`'s real, existing
 * `renderDocNode` — rather than staying inside `features/media/`. Nothing in `render.ts` is changed
 * or added for this test; it reuses the SAME ref-image resolution path every real site render
 * already goes through (`renderDocNode: a ref-based image node with a resolved transformName
 * renders a real <img>...` in `render.test.ts` is the existing pin this test extends against a REAL
 * imported row instead of a hand-built map).
 *
 * What this proves that `import-media-entity.test.ts`'s id-preservation test alone does not: an
 * `image` doc node authored against the SOURCE system's asset id — exactly what a post's `bodyJson`
 * carries when it embeds media — resolves to a real `<img>` tag, with the imported row's own
 * width/height/cssClass, once that id has gone through `importMediaEntity`. Before this fix
 * (`uploadMedia` minting a fresh id), the identical setup would render the placeholder: the doc's
 * `assetId` would point at nothing, because the destination's media row would exist under a
 * DIFFERENT, freshly-minted id.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject } from "@jini-ai/cms/core";

import { InMemoryAssetBlobRepo, InMemoryBlobStore, InMemoryVersionedMediaRepo, type MediaRecord } from "#src/features/media/index";
import { renderDocNode, type MediaAssetRenderMeta } from "#src/server/inbound/public-http/http/site/render";

import { importMediaEntity, type ImportMediaEntityDeps } from "../import-media-entity.js";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
const SOURCE_BYTES = new TextEncoder().encode("a real imported photo's bytes");
// Real sha256 of SOURCE_BYTES — computed once and pinned, same discipline as the sibling test file.
const SOURCE_SHA256 = "86d9075d85c1cce55da0605a557dceaea6c27f18df8702ce86accccce8a41aa9";

function makeDeps(): ImportMediaEntityDeps & { mediaRepo: InMemoryVersionedMediaRepo } {
  const mediaRepo = new InMemoryVersionedMediaRepo();
  return {
    mediaRepo,
    assetBlobRepo: new InMemoryAssetBlobRepo(),
    blobStore: new InMemoryBlobStore(),
    clock: { nowIso: () => "2026-09-18T00:00:00.000Z" },
    idGen: (() => {
      let n = 0;
      return { newId: () => `blob-${++n}` };
    })(),
  };
}

test("importMediaEntity + renderDocNode: an image node authored against the SOURCE asset id renders a real <img> with the imported row's own sizing, never the placeholder", async () => {
  const deps = makeDeps();
  const sourceRecord: MediaRecord = {
    id: "source-system-asset-42",
    workspaceId: WORKSPACE_ID,
    title: "Team Photo",
    slug: "team-photo",
    alt: "The whole team",
    caption: "",
    credit: "",
    source: { sha256: SOURCE_SHA256 },
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: 800,
    height: 600,
    cssClass: "rounded",
    htmlAttributes: null,
  };

  const importResult = await importMediaEntity({
    deps,
    input: { workspaceId: WORKSPACE_ID, record: sourceRecord, bytes: SOURCE_BYTES, blobCreatedByPrincipal: "importer-1", baseVersion: null },
  });
  assert.equal(importResult.status, "imported");

  // Resolve the SAME way a real render caller would: look the imported row back up by the id a
  // post's doc node would carry, and build the render maps from what's actually there — not from
  // an assumption that the id "should" match.
  const imported = await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: "source-system-asset-42" });
  assert.ok(imported, "the imported row must be findable by the source id");

  const mediaAssetMetadata = new Map<string, MediaAssetRenderMeta>([
    [
      imported!.id,
      { width: imported!.width, height: imported!.height, cssClass: imported!.cssClass, htmlAttributes: imported!.htmlAttributes, contentType: null },
    ],
  ]);
  const mediaTransformVersions = new Map<string, number>([["public", 1]]);

  // The exact doc-node shape a post's bodyJson uses to embed media by id (render.ts's own ref-image
  // path: `{type:"image", attrs:{assetId, transformName}}`).
  const postBodyDoc: JsonObject = {
    type: "doc",
    content: [{ type: "image", attrs: { assetId: "source-system-asset-42", transformName: "public", alt: "The whole team" } }],
  };

  const html = renderDocNode(postBodyDoc, undefined, mediaTransformVersions, mediaAssetMetadata);

  assert.match(
    html,
    /<img src="\/m\/source-system-asset-42\/public\.v1\/image\.jpg" alt="The whole team" width="800" height="600" class="rounded"/
  );
  assert.doesNotMatch(html, /media-ph/, "must render the real image, never the missing-asset placeholder");
});

test("importMediaEntity + renderDocNode: the SAME doc node against an unresolved render (nothing imported/resolved yet) degrades to the placeholder — the control this test's positive case is contrasted against", async () => {
  // Empty maps, exactly `render.test.ts`'s own pinned "no entries resolved at all" case
  // (`renderDocNode: a ref-based image node with an empty mediaTransformVersions map degrades to
  // the placeholder (default param, every pre-existing caller)`) — a real render caller only ever
  // populates these maps from assets it actually resolved, so this is the honest "before import"
  // baseline, not a fabricated one.
  const postBodyDoc: JsonObject = {
    type: "doc",
    content: [{ type: "image", attrs: { assetId: "source-system-asset-42", transformName: "public", alt: "The whole team" } }],
  };

  const html = renderDocNode(postBodyDoc);
  assert.match(html, /media-ph/);
});
