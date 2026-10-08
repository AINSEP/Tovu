import { buildWidgetHostPorts } from "#src/features/widgets/deps";
/**
 * @file A published VIDEO media item must render as a `<video>` on the receiving site, with its
 * poster there too — the 2026-09-26 live bug: tovu.dev rendered the home hero's
 * `{"type":"media","slug":"tovu-promo-01"}` marker as `<img src="/m/tovu-promo-01/public.v1/image.jpg"
 * poster="/m/tovu-promo-poster/...">`, and the poster media item was never sent.
 *
 * Two causes, each pinned here end to end (pack → carry-along → plan → apply → embed render):
 * - the embed resolver picks `<video>` from the destination's recorded blob content type
 *   (`MediaContentTypeStorePort`), and media's publish `write` never recorded one, so the destination
 *   fell back to the image path;
 * - the poster is named only inside the video's own `htmlAttributes`, and media declared no
 *   `references`, so a scoped publish of the video never carried the poster along.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { InMemoryEntryRepo } from "#src/features/entries/index";
import {
  CORE_PUBLIC_TRANSFORM_NAME,
  computeBlobStorageKey,
  findMediaByIdOrSlug,
  InMemoryAssetBlobRepo,
  InMemoryBlobStore,
  InMemoryMediaContentTypeStore,
  InMemoryTransformDefinitionRepo,
  InMemoryVersionedMediaRepo,
  type MediaRecord,
} from "#src/features/media/index";
import { contributeMediaPublish } from "#src/features/media/publish-content";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import { renderHtmlPageBody } from "#src/server/inbound/public-http/http/site/render";

import { includeReferencedEntities } from "../export-bundle.js";
import { buildPublishContentCatalog, type PublishContentPorts } from "../type-registry.js";
import { applyReport, makeSite, packAll, plan, registerOnly, WORKSPACE_ID } from "./round-trip-harness.js";

/** A minimal ISO-BMFF `ftyp` box with an `isom` major brand — what `sniffContentType` reads as
 *  `video/mp4` — followed by filler standing in for the rest of the file. */
const VIDEO_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, ...new TextEncoder().encode("ftypisom"), 0x00, 0x00, 0x02, 0x00,
  ...new TextEncoder().encode("isommp41"), ...new TextEncoder().encode("mdat-filler"),
]);
/** JPEG SOI + APP0 marker — `image/jpeg` to the sniffer. */
const POSTER_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new TextEncoder().encode("JFIF-poster")]);

const sha256Of = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const VIDEO_SHA = sha256Of(VIDEO_BYTES);
const POSTER_SHA = sha256Of(POSTER_BYTES);

function mediaRecord(overrides: Partial<MediaRecord> & Pick<MediaRecord, "id" | "slug" | "source">): MediaRecord {
  return {
    workspaceId: WORKSPACE_ID,
    title: overrides.slug ?? "media",
    alt: "",
    caption: "",
    credit: "",
    status: "active",
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    ...overrides,
  };
}

const VIDEO = mediaRecord({
  id: "video-asset-1",
  slug: "promo-01",
  alt: "Promo clip",
  source: { sha256: VIDEO_SHA },
  htmlAttributes: 'poster="/m/promo-poster/public.v1/image.webp"',
});
const POSTER = mediaRecord({ id: "poster-asset-1", slug: "promo-poster", alt: "Promo poster", source: { sha256: POSTER_SHA } });

/** One site's media ports, with every blob in `blobs` stored and typed the way an upload leaves it. */
async function mediaSite(records: MediaRecord[], blobs: readonly Uint8Array[], typed: boolean) {
  const repo = new InMemoryVersionedMediaRepo(records);
  const assetBlobRepo = new InMemoryAssetBlobRepo({});
  const blobStore = new InMemoryBlobStore();
  const contentTypeStore = new InMemoryMediaContentTypeStore();
  for (const bytes of blobs) {
    const sha256 = sha256Of(bytes);
    const { storageKey } = await blobStore.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256, bytes });
    await assetBlobRepo.save({
      id: `blob-${sha256.slice(0, 8)}`,
      workspaceId: WORKSPACE_ID,
      sha256,
      storageKey,
      createdByPrincipal: "owner",
      createdAt: "2026-09-26T00:00:00.000Z",
      status: "active",
    });
    if (typed) await contentTypeStore.set({ workspaceId: WORKSPACE_ID, sha256, contentType: bytes === VIDEO_BYTES ? "video/mp4" : "image/jpeg" });
  }
  const media: PublishContentPorts["media"] = { repo, assetBlobRepo, blobStore, contentTypeStore };
  return { repo, blobStore, contentTypeStore, ports: { media } };
}

test("publishing only a video media item carries its poster along, and the receiving site renders the embed as a <video> with a poster that resolves", async () => {
  registerOnly([contributeMediaPublish()]);
  const source = await mediaSite([VIDEO, POSTER], [VIDEO_BYTES, POSTER_BYTES], true);
  const destination = await mediaSite([], [], false);
  const sourceDeps = makeSite(source.ports, "source");
  const destinationDeps = makeSite(destination.ports, "destination");

  // The operator ticks only the video row; the carry-along must add what it uses.
  const all = await packAll(sourceDeps);
  const video = all.find((entity) => entity.id === VIDEO.id)!;
  const { handlerByType } = buildPublishContentCatalog(sourceDeps);
  const envelope = { artifactFormatVersion: 1, hashVersion: 1, entities: [video], blobManifest: [VIDEO_SHA] };
  const widened = includeReferencedEntities(envelope as never, { ...envelope, entities: all } as never, handlerByType);
  const sent = widened.envelope.entities;
  assert.deepEqual(sent.map((entity) => entity.id).sort(), [POSTER.id, VIDEO.id]);

  // The blob pre-flight PUT: every required blob lands in the destination's store before apply.
  for (const bytes of [VIDEO_BYTES, POSTER_BYTES]) {
    await destination.blobStore.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256: sha256Of(bytes), bytes });
  }
  const report = await plan(sent, destinationDeps);
  await applyReport(report, sent, destinationDeps);

  const html = `<figure class="hero-media"><div class="video-embed" data-embed-config='{"type":"media","slug":"promo-01"}' autoplay muted loop playsinline></div></figure>`;
  const resolved = await resolveHtmlPageEmbeds({
    deps: { host: buildWidgetHostPorts({}, {}),
      entryRepo: new InMemoryEntryRepo(),
      mediaRepo: destination.repo,
      transformRepo: new InMemoryTransformDefinitionRepo({}, { initialRows: [
        { id: "t-1", workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME, version: 1, params: { format: "webp" }, owner: "core", createdAt: "2026-09-26T00:00:00.000Z" },
      ] }),
      mediaContentTypeStore: destination.contentTypeStore,
    },
    input: { workspaceId: WORKSPACE_ID, html },
  });
  const rendered = renderHtmlPageBody(html, resolved);

  assert.doesNotMatch(rendered, /<img\b/);
  assert.match(rendered, /<video\b[^>]*\bsrc="\/m\/promo-01\/original"/);
  assert.match(rendered, /<video\b[^>]*\bposter="\/m\/promo-poster\/public\.v1\/image\.webp"/);

  // The poster URL resolves on the receiving site: its media row and bytes are both there.
  const poster = await findMediaByIdOrSlug({ deps: { mediaRepo: destination.repo }, input: { workspaceId: WORKSPACE_ID, idOrSlug: "promo-poster" } });
  assert.equal(poster?.id, POSTER.id);
  assert.equal(await destination.blobStore.exists({ storageKey: computeBlobStorageKey({ workspaceId: WORKSPACE_ID, sha256: POSTER_SHA }) }), true);
});

test("the post-publish check repairs a video an older build published without a recorded type, so its embed renders as <video>", async () => {
  registerOnly([contributeMediaPublish()]);
  // tovu.dev's state after the 2026-09-26 publish: the row and its bytes arrived, no type recorded.
  const destination = await mediaSite([VIDEO, POSTER], [VIDEO_BYTES, POSTER_BYTES], false);
  const destinationDeps = makeSite(destination.ports, "destination");
  const source = await mediaSite([VIDEO, POSTER], [VIDEO_BYTES, POSTER_BYTES], true);
  const entities = await packAll(makeSite(source.ports, "source"));

  const { handlerByType } = buildPublishContentCatalog(destinationDeps);
  const problems = await handlerByType.get("media")!.verifyApplied!({ entities });

  assert.deepEqual(problems, []);
  const types = await destination.contentTypeStore.getMany({ workspaceId: WORKSPACE_ID, sha256s: [VIDEO_SHA, POSTER_SHA] });
  assert.equal(types.get(VIDEO_SHA), "video/mp4");
  assert.equal(types.get(POSTER_SHA), "image/jpeg");
});

test("the post-publish check names a media item that arrived without its file", async () => {
  registerOnly([contributeMediaPublish()]);
  const destination = await mediaSite([POSTER], [], false);
  const destinationDeps = makeSite(destination.ports, "destination");
  const entities = await packAll(makeSite((await mediaSite([POSTER], [POSTER_BYTES], true)).ports, "source"));

  const { handlerByType } = buildPublishContentCatalog(destinationDeps);
  const problems = await handlerByType.get("media")!.verifyApplied!({ entities });

  assert.deepEqual(problems, ["Media 'promo-poster' is on the site without its file, so it cannot be shown."]);
});
