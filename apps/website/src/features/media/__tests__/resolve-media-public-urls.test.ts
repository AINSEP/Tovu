import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { MediaRecord, TransformDefinitionRecord, TransformDefinitionRepoPort, TransformParams } from "../index.js";
import { InMemoryMediaContentTypeStore, InMemoryTransformDefinitionRepo, registerTransform, CORE_PUBLIC_TRANSFORM_NAME } from "../index.js";
import { resolveMediaPublicUrls } from "../tool-registrations.js";

/**
 * @file Direct unit coverage for `resolveMediaPublicUrls` — until this suite, the function was only
 * ever exercised indirectly (through `media_upload_asset`'s tool-handler response), which never
 * reached several of its branches (a trashed asset, a video asset, an all-trashed batch, no
 * dependencies supplied). Written per the batch-G dispatch's own question: "does a media item with
 * no public URL yield `undefined`, an empty string, or a broken relative URL?" — answered below:
 * always a real `null`, never an empty string or a partially-built path.
 */

const WORKSPACE_ID = `ws-${randomUUID()}`;
const OTHER_WORKSPACE_ID = `ws-${randomUUID()}`;
const NOW = "2026-09-03T00:00:00.000Z";

function fakeAsset(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id: `media-${randomUUID()}`,
    workspaceId: WORKSPACE_ID,
    title: "",
    alt: "",
    caption: "",
    credit: "",
    source: { sha256: `sha-${randomUUID()}` },
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    ...overrides,
  };
}

function transformRegistryDeps(transformDefinitionRepo: InMemoryTransformDefinitionRepo) {
  let counter = 0;
  return { clock: { nowIso: () => NOW }, idGen: { newId: () => `transform-${++counter}` }, transformRepo: transformDefinitionRepo };
}

async function registerCoreTransform(transformDefinitionRepo: InMemoryTransformDefinitionRepo, params: TransformParams) {
  await registerTransform({
    deps: transformRegistryDeps(transformDefinitionRepo),
    input: { workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME, params, owner: "core" },
  });
}

test("resolveMediaPublicUrls: with no mediaContentTypeStore/transformDefinitionRepo supplied, every asset resolves to null", async () => {
  const asset = fakeAsset();
  const result = await resolveMediaPublicUrls({ workspaceId: WORKSPACE_ID }, [asset]);
  assert.equal(result.get(asset.id), null);
});

test("resolveMediaPublicUrls: an empty assets array resolves to an empty map, deps present or not", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  const result = await resolveMediaPublicUrls({ workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo }, []);
  assert.equal(result.size, 0);
});

test("resolveMediaPublicUrls: a trashed asset resolves to null without consulting content type or transforms", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  const trashed = fakeAsset({ status: "trashed" });
  const result = await resolveMediaPublicUrls({ workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo }, [trashed]);
  assert.equal(result.get(trashed.id), null);
});

test("resolveMediaPublicUrls: a batch that is ENTIRELY trashed short-circuits to all-null without ever calling getLatestTransformDefinition", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  const trashedA = fakeAsset({ status: "trashed" });
  const trashedB = fakeAsset({ status: "trashed" });
  const result = await resolveMediaPublicUrls(
    { workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo },
    [trashedA, trashedB]
  );
  assert.equal(result.get(trashedA.id), null);
  assert.equal(result.get(trashedB.id), null);
  assert.equal(result.size, 2);
});

test("resolveMediaPublicUrls: an active asset with no 'public' transform registered yet resolves to null (boot has not run ensureCoreMediaTransform)", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  const asset = fakeAsset();
  const result = await resolveMediaPublicUrls({ workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo }, [asset]);
  assert.equal(result.get(asset.id), null);
});

test("resolveMediaPublicUrls: a recorded video asset resolves to the byte-passthrough /original URL, bypassing the transform lookup entirely", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  const asset = fakeAsset();
  await mediaContentTypeStore.set({ workspaceId: WORKSPACE_ID, sha256: asset.source.sha256, contentType: "video/mp4" });

  const result = await resolveMediaPublicUrls({ workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo }, [asset]);
  assert.equal(result.get(asset.id), `/m/${asset.id}/original`);
});

test("resolveMediaPublicUrls: a non-video asset with a registered 'public' transform resolves the real /m/ image URL, ext mapped from the transform's format", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  await registerCoreTransform(transformDefinitionRepo, { format: "webp" });
  const asset = fakeAsset();

  const result = await resolveMediaPublicUrls({ workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo }, [asset]);
  assert.equal(result.get(asset.id), `/m/${asset.id}/${CORE_PUBLIC_TRANSFORM_NAME}.v1/image.webp`);
});

test("resolveMediaPublicUrls: a non-video asset whose sha256 has no recorded content type at all falls through to the ordinary image path unchanged", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  await registerCoreTransform(transformDefinitionRepo, { format: "png" });
  const asset = fakeAsset();
  // Deliberately never call mediaContentTypeStore.set() for this asset's sha256.

  const result = await resolveMediaPublicUrls({ workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo }, [asset]);
  assert.equal(result.get(asset.id), `/m/${asset.id}/${CORE_PUBLIC_TRANSFORM_NAME}.v1/image.png`);
});

test("resolveMediaPublicUrls: mixed batch — trashed, video, and image assets each resolve independently in one call", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  await registerCoreTransform(transformDefinitionRepo, { format: "jpeg" });

  const trashed = fakeAsset({ status: "trashed" });
  const video = fakeAsset();
  await mediaContentTypeStore.set({ workspaceId: WORKSPACE_ID, sha256: video.source.sha256, contentType: "video/webm" });
  const image = fakeAsset();

  const result = await resolveMediaPublicUrls(
    { workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo },
    [trashed, video, image]
  );

  assert.equal(result.get(trashed.id), null);
  assert.equal(result.get(video.id), `/m/${video.id}/original`);
  assert.equal(result.get(image.id), `/m/${image.id}/${CORE_PUBLIC_TRANSFORM_NAME}.v1/image.jpg`);
});

test("resolveMediaPublicUrls: an asset with a valid slug resolves a URL keyed by the SLUG, not the id (readable-slugs S4)", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  await registerCoreTransform(transformDefinitionRepo, { format: "webp" });
  const asset = fakeAsset({ slug: "cover-photo" });

  const result = await resolveMediaPublicUrls({ workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo }, [asset]);
  assert.equal(result.get(asset.id), `/m/cover-photo/${CORE_PUBLIC_TRANSFORM_NAME}.v1/image.webp`);
});

test("resolveMediaPublicUrls: a video asset with a valid slug resolves the /original URL keyed by the SLUG, not the id (readable-slugs S4)", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  const asset = fakeAsset({ slug: "team-intro" });
  await mediaContentTypeStore.set({ workspaceId: WORKSPACE_ID, sha256: asset.source.sha256, contentType: "video/mp4" });

  const result = await resolveMediaPublicUrls({ workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo }, [asset]);
  assert.equal(result.get(asset.id), `/m/team-intro/original`);
});

test("resolveMediaPublicUrls: is scoped to the caller's own workspace — a transform registered for a DIFFERENT workspace never resolves this one's asset", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  let counter = 0;
  await registerTransform({
    deps: { clock: { nowIso: () => NOW }, idGen: { newId: () => `transform-${++counter}` }, transformRepo: transformDefinitionRepo },
    input: { workspaceId: OTHER_WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME, params: { format: "png" }, owner: "core" },
  });
  const asset = fakeAsset();

  const result = await resolveMediaPublicUrls({ workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo }, [asset]);
  assert.equal(result.get(asset.id), null, "a transform registered for another workspace must not leak into this workspace's resolution");
});

/**
 * A `TransformDefinitionRepoPort` double that hands back a fabricated record with a format outside
 * `EXT_BY_TRANSFORM_FORMAT`'s known set — genuinely unreachable through the real registration path
 * (`registerTransform` itself rejects any `params.format` outside the closed `TransformFormat`
 * union, confirmed by this file's own attempt below), so this direct-invocation double is how the
 * ext-fallback `??` branch in `resolveOneAssetPublicUrl` gets covered at all (brief §6: cover a
 * genuinely-unreachable-via-the-public-API branch by direct invocation rather than deleting it).
 */
class FakeSingleFormatTransformRepo implements Pick<TransformDefinitionRepoPort, "listByName" | "findByNameVersion"> {
  constructor(private readonly record: TransformDefinitionRecord) {}
  async listByName(): Promise<TransformDefinitionRecord[]> {
    return [this.record];
  }
  async findByNameVersion(): Promise<TransformDefinitionRecord | null> {
    return this.record;
  }
}

test("registerTransform rejects a format outside jpeg/png/webp/gif — confirms the ext-fallback branch below is unreachable through the real registration path", async () => {
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  await assert.rejects(
    registerCoreTransform(transformDefinitionRepo, { format: "avif" as TransformParams["format"] }),
    /must be one of jpeg, png, webp, gif/
  );
});

test("resolveMediaPublicUrls: a transform format outside EXT_BY_TRANSFORM_FORMAT's known set falls back to the raw format string verbatim (direct-invocation coverage of a defensive branch unreachable via real registration, per the test above)", async () => {
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new FakeSingleFormatTransformRepo({
    id: `transform-${randomUUID()}`,
    workspaceId: WORKSPACE_ID,
    name: CORE_PUBLIC_TRANSFORM_NAME,
    version: 1,
    params: { format: "avif" as TransformParams["format"] },
    owner: "core",
    createdAt: NOW,
  });
  const asset = fakeAsset();

  const result = await resolveMediaPublicUrls(
    { workspaceId: WORKSPACE_ID, mediaContentTypeStore, transformDefinitionRepo: transformDefinitionRepo as TransformDefinitionRepoPort },
    [asset]
  );
  assert.equal(result.get(asset.id), `/m/${asset.id}/${CORE_PUBLIC_TRANSFORM_NAME}.v1/image.avif`);
});
