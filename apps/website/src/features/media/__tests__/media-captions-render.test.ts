/**
 * @file G7-9 captions, end to end through the production public render path: a published page's
 * video whose media row carries a `captions` reference renders `<track kind="captions">` pointing at
 * the sibling `.vtt` asset's public original URL; a reference to a missing or non-WebVTT asset
 * renders the plain player (fail closed). Both render paths are pinned: HTML-page embeds
 * (`resolveHtmlPageEmbeds` → `renderHtmlPageBody`) and post-body media nodes
 * (`resolveMediaAssetMetadataForRender`'s `MediaAssetRenderMeta.captionsTrack`).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEntryRepo } from "@jini-ai/cms/entries";
import { InMemoryVersionedMediaRepo } from "@jini-ai/cms/media";
import { InMemoryMediaContentTypeStore } from "@jini-ai/cms/media/site/content-type-store";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import type { PublicPostRecord } from "@jini-ai/cms/posts/post";
import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import { InMemoryTransformDefinitionRepo, type MediaRecord } from "#src/features/media/index";
import { renderHtmlPageBody } from "#src/server/inbound/public-http/http/site/render/page-body";
import { resolveMediaAssetMetadataForRender } from "#src/server/inbound/public-http/routes/site/pages/render-context/media-metadata";

const WORKSPACE_ID = "00000000-0000-4000-8000-0000000000c1";
const VTT_ID = "00000000-0000-4000-8000-0000000000c2";
const JPEG_ID = "00000000-0000-4000-8000-0000000000c3";
const MISSING_ID = "00000000-0000-4000-8000-0000000000c4";
const SHA = { video: "a".repeat(64), vtt: "b".repeat(64), jpeg: "c".repeat(64) };

function mediaRecord(overrides: Partial<MediaRecord> & Pick<MediaRecord, "id" | "slug" | "source">): MediaRecord {
  return {
    workspaceId: WORKSPACE_ID, title: overrides.slug ?? "media", alt: "", caption: "", credit: "", status: "active",
    createdAt: "2026-11-24T00:00:00.000Z", updatedAt: "2026-11-24T00:00:00.000Z", version: 1,
    width: null, height: null, cssClass: null, htmlAttributes: null, ...overrides,
  };
}

const RECORDS: MediaRecord[] = [
  mediaRecord({ id: "video-cc", slug: "promo-cc", source: { sha256: SHA.video }, captions: { assetId: VTT_ID, srclang: "en", label: "English" } }),
  mediaRecord({ id: "video-missing", slug: "promo-missing", source: { sha256: SHA.video }, captions: { assetId: MISSING_ID, srclang: "en" } }),
  mediaRecord({ id: "video-jpeg", slug: "promo-jpeg", source: { sha256: SHA.video }, captions: { assetId: JPEG_ID, srclang: "en" } }),
  mediaRecord({ id: VTT_ID, slug: "promo-captions", source: { sha256: SHA.vtt } }),
  mediaRecord({ id: JPEG_ID, slug: "promo-still", source: { sha256: SHA.jpeg } }),
];

async function site() {
  const mediaRepo = new InMemoryVersionedMediaRepo({}, { initialRows: RECORDS });
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  for (const [sha256, contentType] of [[SHA.video, "video/mp4"], [SHA.vtt, "text/vtt"], [SHA.jpeg, "image/jpeg"]] as const) {
    await mediaContentTypeStore.set({ workspaceId: WORKSPACE_ID, sha256, contentType });
  }
  return { mediaRepo, mediaContentTypeStore };
}

const TRACK = `<track kind="captions" src="/m/promo-captions/original.vtt?v=${SHA.vtt.slice(0, 12)}" srclang="en" label="English" default>`;

async function renderEmbed(slug: string): Promise<string> {
  const { mediaRepo, mediaContentTypeStore } = await site();
  const html = `<div data-embed-config='{"type":"media","slug":"${slug}"}'></div>`;
  const resolved = await resolveHtmlPageEmbeds({
    deps: { host: buildWidgetHostPorts({}, {}), entryRepo: new InMemoryEntryRepo(), mediaRepo, transformRepo: new InMemoryTransformDefinitionRepo({}), mediaContentTypeStore },
    input: { workspaceId: WORKSPACE_ID, html },
  });
  return renderHtmlPageBody({ html, resolved });
}

test("a published page's captioned video renders a same-origin WebVTT <track> inside the <video>", async () => {
  const rendered = await renderEmbed("promo-cc");
  assert.match(rendered, /<video\b[^>]*\bsrc="\/m\/promo-cc\/original\.mp4/);
  assert.ok(rendered.includes(TRACK), rendered);
});

test("captions naming a missing or non-WebVTT asset render the plain player, never a <track>", async () => {
  for (const slug of ["promo-missing", "promo-jpeg"]) {
    const rendered = await renderEmbed(slug);
    assert.match(rendered, /<video\b/, slug);
    assert.doesNotMatch(rendered, /<track\b/, slug);
  }
});

test("post-body media metadata carries the resolved captions track for the doc-node video renderer", async () => {
  const deps = { workspaceId: WORKSPACE_ID, ...(await site()) };
  const media = (assetId: string) => ({ type: "media", attrs: { assetId } });
  const post = { bodyJson: { type: "doc", content: [media("video-cc"), media("video-missing"), media("video-jpeg")] } } as unknown as PublicPostRecord;
  const meta = await resolveMediaAssetMetadataForRender({ deps, post });
  assert.deepEqual(meta.get("video-cc")?.captionsTrack, { src: `/m/promo-captions/original.vtt?v=${SHA.vtt.slice(0, 12)}`, srclang: "en", label: "English" });
  assert.equal(meta.get("video-missing")?.captionsTrack ?? null, null);
  assert.equal(meta.get("video-jpeg")?.captionsTrack ?? null, null);
});
