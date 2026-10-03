import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import { createToolRegistry, isReadOnlyTool, ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";

import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaRepo, uploadMedia } from "../index.js";
import {
  MEDIA_VIEW_IMAGE_TOOL_ID,
  buildMediaViewImageRegistrations,
  mediaViewImageDerivedRisk,
  type MediaViewImageToolDeps,
} from "../view-image-tool.js";

/**
 * @file `media_view_image` — the tool that lets the assistant actually LOOK at a media
 * image. Born from a real run: asked to write alt text, the assistant said none of its tools could
 * open an image and refused to guess.
 *
 * Every fixture is a REAL image encoded by `sharp` (the same codec the tool uses), seeded through the
 * real `uploadMedia`, and every returned image is DECODED again with `sharp` to check its pixels and
 * dimensions — a test that only checked `mimeType` would pass for a tool returning the original
 * 3000px bytes unchanged, or a blank canvas.
 */

const WORKSPACE_ID = "ws-media-view-image";
const PRINCIPAL_ID = "principal-view-image";
const NOW = "2026-10-01T00:00:00.000Z";

interface Harness {
  deps: MediaViewImageToolDeps;
  mediaRepo: InMemoryMediaRepo;
  assetBlobRepo: InMemoryAssetBlobRepo;
  blobStore: InMemoryBlobStore;
  checkedPermissions: string[];
}

function makeHarness(options: { allow?: boolean } = {}): Harness {
  const mediaRepo = new InMemoryMediaRepo({});
  const assetBlobRepo = new InMemoryAssetBlobRepo({});
  const blobStore = new InMemoryBlobStore();
  const checkedPermissions: string[] = [];
  const deps: MediaViewImageToolDeps = {
    workspaceId: WORKSPACE_ID,
    mediaRepo,
    assetBlobRepo,
    blobStore,
    authorize: async (request) => {
      checkedPermissions.push(request.permission);
      return options.allow === false ? { allowed: false, reason: "insufficient_permission" as const } : { allowed: true, reason: "matched" as const };
    },
  };
  return { deps, mediaRepo, assetBlobRepo, blobStore, checkedPermissions };
}

/** Left half red, right half blue — so a decoded result can be checked for being THIS picture, not
 *  merely "some image of the right size". */
async function splitColorPng(width: number, height: number): Promise<Uint8Array> {
  const half = Math.floor(width / 2);
  const left = await sharp({ create: { width: half, height, channels: 3, background: { r: 220, g: 20, b: 20 } } }).png().toBuffer();
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 20, g: 20, b: 220 } } })
    .composite([{ input: left, left: 0, top: 0 }])
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

let idCounter = 0;
async function seed(
  harness: Harness,
  file: { bytes: Uint8Array; filename: string; contentType: string; alt?: string },
): Promise<{ id: string; slug: string; title: string }> {
  const { media } = await uploadMedia({
    deps: {
      clock: { nowMs: () => Date.parse(NOW) },
      idGen: { newId: () => `seed-${++idCounter}` },
      mediaRepo: harness.mediaRepo,
      blobRepo: harness.assetBlobRepo,
      renditionRepo: new InMemoryAssetRenditionRepo({}),
      blobStore: harness.blobStore,
    },
    input: {
      workspaceId: WORKSPACE_ID,
      bytes: file.bytes,
      filename: file.filename,
      contentType: file.contentType,
      alt: file.alt,
      createdByPrincipal: PRINCIPAL_ID,
    },
  });
  return { id: media.id, slug: media.slug, title: media.title };
}

function viewTool(harness: Harness): ToolRegistration {
  const found = buildMediaViewImageRegistrations(harness.deps).find((r) => r.descriptor.id === MEDIA_VIEW_IMAGE_TOOL_ID);
  assert.ok(found, `expected ${MEDIA_VIEW_IMAGE_TOOL_ID} to be registered`);
  return found;
}

function call(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
  return registration.handler(ctx);
}

interface ContentEnvelope {
  content: Array<{ type: string; text?: string; mimeType?: string; data?: string }>;
}

function imageBlockOf(output: unknown): { mimeType: string; data: string } {
  const blocks = (output as ContentEnvelope).content;
  assert.ok(Array.isArray(blocks), `expected an MCP content envelope; got ${JSON.stringify(output).slice(0, 200)}`);
  const images = blocks.filter((block) => block.type === "image");
  assert.equal(images.length, 1, "expected exactly one image block");
  const image = images[0]!;
  assert.equal(typeof image.data, "string");
  assert.equal(typeof image.mimeType, "string");
  return { mimeType: image.mimeType!, data: image.data! };
}

function metadataOf(output: unknown): Record<string, unknown> {
  const text = (output as ContentEnvelope).content.find((block) => block.type === "text")?.text;
  assert.ok(text, "expected a text block carrying the asset's metadata");
  return JSON.parse(text) as Record<string, unknown>;
}

async function pixelAt(data: string, x: number, y: number): Promise<{ r: number; g: number; b: number }> {
  const { data: raw, info } = await sharp(Buffer.from(data, "base64")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return { r: raw[offset]!, g: raw[offset + 1]!, b: raw[offset + 2]! };
}

test("a large image comes back as a real WebP image block, downscaled to a 1568px long edge, and it is THIS picture", async () => {
  const harness = makeHarness();
  const asset = await seed(harness, { bytes: await splitColorPng(3000, 2000), filename: "ai-caps.png", contentType: "image/png", alt: "old alt" });

  const output = await call(viewTool(harness), { mediaId: asset.id });

  const image = imageBlockOf(output);
  assert.equal(image.mimeType, "image/webp");
  const decoded = await sharp(Buffer.from(image.data, "base64")).metadata();
  assert.equal(decoded.format, "webp", "the bytes must really be WebP, not merely labeled so");
  assert.equal(decoded.width, 1568);
  assert.equal(decoded.height, 1045);

  const left = await pixelAt(image.data, 100, 500);
  const right = await pixelAt(image.data, 1468, 500);
  assert.ok(left.r > 180 && left.b < 70, `left half should be red; got ${JSON.stringify(left)}`);
  assert.ok(right.b > 180 && right.r < 70, `right half should be blue; got ${JSON.stringify(right)}`);

  assert.deepEqual(metadataOf(output), {
    id: asset.id,
    slug: asset.slug,
    title: asset.title,
    alt: "old alt",
    caption: "",
    status: "active",
    original: { contentType: "image/png", width: 3000, height: 2000 },
    returned: { mimeType: "image/webp", width: 1568, height: 1045, downscaled: true },
  });
});

test("a tall image is bounded by its long edge (height), not its width", async () => {
  const harness = makeHarness();
  const asset = await seed(harness, { bytes: await splitColorPng(1000, 4000), filename: "tall.png", contentType: "image/png" });

  const image = imageBlockOf(await call(viewTool(harness), { mediaId: asset.id }));
  const decoded = await sharp(Buffer.from(image.data, "base64")).metadata();
  assert.equal(decoded.height, 1568);
  assert.equal(decoded.width, 392);
});

test("a small image is never upscaled", async () => {
  const harness = makeHarness();
  const asset = await seed(harness, { bytes: await splitColorPng(40, 30), filename: "tiny.png", contentType: "image/png" });

  const output = await call(viewTool(harness), { mediaId: asset.id });
  const decoded = await sharp(Buffer.from(imageBlockOf(output).data, "base64")).metadata();
  assert.equal(decoded.width, 40);
  assert.equal(decoded.height, 30);
  assert.deepEqual(metadataOf(output).returned, { mimeType: "image/webp", width: 40, height: 30, downscaled: false });
});

test("the asset can be looked up by slug instead of id", async () => {
  const harness = makeHarness();
  await seed(harness, { bytes: await splitColorPng(50, 50), filename: "other.png", contentType: "image/png" });
  const asset = await seed(harness, { bytes: await splitColorPng(60, 20), filename: "by-slug.png", contentType: "image/png" });

  const output = await call(viewTool(harness), { slug: asset.slug });
  assert.equal(metadataOf(output).id, asset.id);
  const decoded = await sharp(Buffer.from(imageBlockOf(output).data, "base64")).metadata();
  assert.equal(decoded.width, 60);
});

test("an unknown id or slug is a ToolInputError naming what was asked for and how to find a real one", async () => {
  const harness = makeHarness();
  const tool = viewTool(harness);
  await assert.rejects(call(tool, { mediaId: "no-such-id" }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, String(error));
    assert.equal(error.message, "media_view_image: no media asset with id 'no-such-id'. Use content_read.media_asset to list the library and find the right id or slug.");
    return true;
  });
  await assert.rejects(call(tool, { slug: "no-such-slug" }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, String(error));
    assert.equal(error.message, "media_view_image: no media asset with slug 'no-such-slug'. Use content_read.media_asset to list the library and find the right id or slug.");
    return true;
  });
});

test("neither or both of mediaId/slug is a ToolInputError, not a guess", async () => {
  const harness = makeHarness();
  const tool = viewTool(harness);
  for (const input of [{}, { mediaId: "a", slug: "b" }, { mediaId: "" }]) {
    await assert.rejects(call(tool, input), (error: unknown) => {
      assert.ok(error instanceof ToolInputError, `${JSON.stringify(input)}: ${String(error)}`);
      assert.equal(error.message, "media_view_image: pass exactly one of 'mediaId' or 'slug' (a non-empty string).");
      return true;
    });
  }
});

test("a video asset is refused with a clear message saying there is no poster frame, not a broken image", async () => {
  const harness = makeHarness();
  // A real ISO-BMFF `ftyp` box with the `isom` brand — what `sniffContentType` classifies as MP4.
  const mp4 = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from("ftypisom"), 0, 0, 2, 0, ...Buffer.from("isomiso2"), 0, 0, 0, 8, ...Buffer.from("free")]);
  const asset = await seed(harness, { bytes: mp4, filename: "clip.mp4", contentType: "video/mp4" });

  await assert.rejects(call(viewTool(harness), { mediaId: asset.id }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, String(error));
    assert.equal(
      error.message,
      `media_view_image: media asset '${asset.id}' is a video (video/mp4). This tool only shows still images, and no poster frame is available for videos — describe it from its title and caption instead, or ask the human.`,
    );
    return true;
  });
});

test("stored bytes that are not an image at all are refused by what the bytes ARE, not by the declared type", async () => {
  const harness = makeHarness();
  const asset = await seed(harness, { bytes: new TextEncoder().encode("just some text, not a picture"), filename: "fake.png", contentType: "image/png" });

  await assert.rejects(call(viewTool(harness), { mediaId: asset.id }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, String(error));
    assert.equal(error.message, `media_view_image: media asset '${asset.id}' is not a viewable image (its stored bytes are application/octet-stream).`);
    return true;
  });
});

test("an image whose bytes are corrupt is refused with a clear message, not a raw codec stack", async () => {
  const harness = makeHarness();
  const png = await splitColorPng(64, 64);
  const corrupt = new Uint8Array([...png.subarray(0, 40), ...new Uint8Array(200).fill(7)]);
  const asset = await seed(harness, { bytes: corrupt, filename: "broken.png", contentType: "image/png" });

  await assert.rejects(call(viewTool(harness), { mediaId: asset.id }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, String(error));
    assert.equal(error.message, `media_view_image: media asset '${asset.id}' could not be decoded as an image (image/png) — its stored file may be damaged.`);
    return true;
  });
});

test("an asset whose stored blob row is missing is refused with a clear message", async () => {
  const harness = makeHarness();
  const asset = await seed(harness, { bytes: await splitColorPng(20, 20), filename: "gone.png", contentType: "image/png" });
  const record = await harness.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: asset.id });
  await harness.mediaRepo.save({ ...record!, source: { ...record!.source, sha256: "0".repeat(64) } });

  await assert.rejects(call(viewTool(harness), { mediaId: asset.id }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, String(error));
    assert.equal(error.message, `media_view_image: media asset '${asset.id}' has no stored file, so there is nothing to show.`);
    return true;
  });
});

test("it requires media.read, and a denied principal gets ForbiddenError before any bytes are read", async () => {
  const harness = makeHarness({ allow: false });
  const asset = await seed(harness, { bytes: await splitColorPng(20, 20), filename: "secret.png", contentType: "image/png" });

  await assert.rejects(call(viewTool(harness), { mediaId: asset.id }), ForbiddenError);
  assert.deepEqual(harness.checkedPermissions, ["media.read"]);
});

test("it is registered read-only with no side effects, so execute_readonly_delegated_tool accepts it", () => {
  const harness = makeHarness();
  const registration = viewTool(harness);
  assert.equal(isReadOnlyTool({ descriptor: registration.descriptor }), true);
  assert.equal(mediaViewImageDerivedRisk.get(MEDIA_VIEW_IMAGE_TOOL_ID), "none");
});

test("PASS-THROUGH: through the real ToolExecutor and the daemon's read-only delegated-tool route, the image block survives intact (not stringified)", async () => {
  const harness = makeHarness();
  const asset = await seed(harness, { bytes: await splitColorPng(800, 600), filename: "route.png", contentType: "image/png" });
  const direct = imageBlockOf(await call(viewTool(harness), { mediaId: asset.id }));

  const registry = createToolRegistry({});
  for (const registration of buildMediaViewImageRegistrations(harness.deps)) registry.register(registration);
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const { run } = await lifecycle.start({ contextRef: "ctx-view-image" });
  const routeDeps = { toolExecutor: createToolExecutor({ registry }), lifecycle, toolRegistry: registry, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) };

  const result = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-view-1", toolId: MEDIA_VIEW_IMAGE_TOOL_ID, input: { mediaId: asset.id }, requireReadOnly: true },
    routeDeps as never,
  );

  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  if (!result.ok) return;
  const envelope = (result.value as { result: { status: string; output: unknown } }).result;
  assert.equal(envelope.status, "completed");
  const routed = imageBlockOf(envelope.output);
  assert.equal(routed.mimeType, "image/webp");
  assert.equal(routed.data, direct.data, "the routed image bytes must be byte-identical to the handler's own");
});
