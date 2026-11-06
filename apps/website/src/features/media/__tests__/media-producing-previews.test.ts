import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import type { BatchResult, ToolExecutionContext } from "@jini-ai/core";
import { applyBatchInputs } from "#src/assistant/batch-tool-inputs";
import { executeRegisteredTool } from "#src/assistant/__tests__/fixtures/execute-registered-tool";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { SharpImageTransformer } from "@jini-ai/cms/media/node";
import { createMediaProviderRegistry } from "@jini-ai/integrations/media-providers";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteAssetBlobRepo, SqliteAssetRenditionRepo, SqliteMediaRepo, SqliteMediaContentTypeStore } from "#src/platform/db/sqlite/media-repo.sqlite";
import { InMemoryBlobStore, InMemoryTransformDefinitionRepo, registerTransform, uploadMedia } from "../index.js";
import { buildMediaRegistrationsForTovu } from "../tool-registrations.js";
import { buildMediaGenerationRegistrations } from "../../media-generation/tool-registrations.js";
import { buildMediaImportRegistrations } from "../../media-import/tool-registrations.js";
import { buildPromoteChatAttachmentTool } from "../promote-chat-attachment.js";
import { InMemoryMediaProviderCredentialRepo } from "../provider-credential-store.memory.js";
import { withChatPreview } from "../chat-preview.js";

// Exercise the real registered handlers, upload/replacement services and codec. Only paid vendor
// generation and outbound downloads are substituted; no HTTP server or external I/O is needed.
test("every registered media-producing tool returns the same inline image preview as imports", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "media-previews-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = await sharp({ create: { width: 640, height: 400, channels: 3, background: "red" } }).png().toBuffer();
  await writeFile(path.join(root, "preview.png"), bytes);
  const db = openContentDb(":memory:");
  t.after(() => db.$client.close());
  let ids = 0;
  const deps = {
    workspaceId: "workspace-local", siteBinding: { dir: root },
    clock: { nowMs: () => Date.parse("2026-10-31T00:00:00Z") }, idGen: { newId: () => `preview-${++ids}` },
    authorize: async () => ({ allowed: true, reason: "matched" as const }),
    mediaRepo: new SqliteMediaRepo(db), assetBlobRepo: new SqliteAssetBlobRepo(db), assetRenditionRepo: new SqliteAssetRenditionRepo(db),
    blobStore: new InMemoryBlobStore(), mediaContentTypeStore: new SqliteMediaContentTypeStore(db),
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}), imageCodec: new SharpImageTransformer(),
    resolveRoots: () => ({ repo: root, site: root, custom: root }),
    mediaImportHttpClient: { send: async () => ({ status: 200, headers: {}, bodyText: "", bodyBytes: bytes, bodyTruncated: false }) },
    mediaGenerationHttpClient: { send: async () => { throw new Error("unexpected generation HTTP"); } },
    mediaProviderRegistry: createMediaProviderRegistry(), mediaProviderCredentialRepo: new InMemoryMediaProviderCredentialRepo(),
    siteAssistantSecretSealer: { seal: async () => { throw new Error("unexpected seal"); }, open: async () => { throw new Error("unexpected open"); } },
    env: { OPENAI_API_KEY: "test-preview-key" },
    generateMedia: async () => ({ bytes, providerNote: "test fixture", providerId: "openai", usedStubFallback: false, warnings: [] }),
    removeMedia: async () => { throw new Error("unexpected removal"); },
  };
  await registerTransform({ deps: { transformRepo: deps.transformDefinitionRepo, clock: deps.clock, idGen: deps.idGen },
    input: { workspaceId: deps.workspaceId, name: "public", params: { format: "webp" }, owner: "core" } });
  const { media } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
    input: { workspaceId: deps.workspaceId, filename: "preview.png", contentType: "image/png", bytes, createdByPrincipal: "owner" } });
  const registrations = [
    ...buildMediaRegistrationsForTovu(deps, { surfaceExchanges: createSurfaceExchangeStore({
      scheduler: createTimeoutScheduler({}), clock: deps.clock, idGenerator: deps.idGen, defaultChannel: "mcp-ui",
    }) }),
    ...buildMediaGenerationRegistrations(deps),
    ...buildMediaImportRegistrations(deps),
  ];
  const upload = registrations.find(tool => tool.descriptor.id === "media_upload_asset")!;
  registrations.push(buildPromoteChatAttachmentTool({
    getStore: () => ({ resolveForRun: async () => ({ path: path.join(root, "preview.png"), name: "preview.png", kind: "file" as const }) }),
    readFile: async () => bytes, mediaUploadHandler: upload.handler,
  }));
  const values: Record<string, unknown> = {
    prompt: "preview", model: "gpt-image-2", filename: "preview.png", contentType: "image/png", dataBase64: bytes.toString("base64"),
    url: "https://example.com/preview.png", root: "site", path: "preview.png", mediaId: media.id,
    attachmentRef: "attachment:11111111-1111-4111-8111-111111111111",
  };
  const producers = registrations.filter(tool => /^media_(upload|generate|import|replace|promote)_/.test(tool.descriptor.id));
  assert.ok(producers.length >= 6, "cover upload, generation, both imports, replacement and attachment promotion");
  const expected = await deps.imageCodec.encode({ source: bytes, autoOrient: true, format: "webp", quality: 70,
    resize: { width: 320, height: 320, fit: "inside", withoutEnlargement: true } });
  for (const tool of producers) await t.test(tool.descriptor.id, async () => {
    const properties = (tool.descriptor.inputSchema as { properties: Record<string, unknown> }).properties;
    const input = Object.fromEntries(Object.keys(properties).filter(key => key in values).map(key => [key, values[key]]));
    // Replacement chooses exactly one source; local and URL imports retain their own contracts.
    if ("mediaId" in properties) { delete input.root; delete input.path; }
    const ctx: ToolExecutionContext = { input, executionId: "preview", principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal };
    const result = await tool.handler(ctx) as { content?: Array<Record<string, unknown>> };
    assert.ok(result.content, `${tool.descriptor.id}: saved media must be visible in chat`);
    const text = result.content.find(block => block.type === "text");
    const saved = JSON.parse(text!.text as string).media;
    assert.equal(saved.sha256, media.source.sha256, "preview preserves the saved media result");
    assert.deepEqual(result.content.find(block => block.type === "image"), {
      type: "image", mimeType: "image/webp", data: Buffer.from(expected.bytes).toString("base64"), title: "preview", href: saved.publicUrl,
    });
    assert.ok(saved.publicUrl, "the inline preview links to the saved file");
    // Exercise production's generic batch wrapper through the real executor. The trace records
    // the known preview gap; this does not certify image omission as the desired chat behavior.
    const registration = applyBatchInputs({ registrations: [tool] })[0]!;
    const batch = await executeRegisteredTool({ registration, input: { items: [input, input] } }, { principalId: 'owner' });
    assert.equal(batch.status, 'completed');
    const output = batch.output as BatchResult;
    assert.equal(output.succeeded, 2);
    const itemContents = output.results.map(row => (row.result as { content: Array<Record<string, unknown>> }).content);
    for (const content of itemContents) {
      const stored = JSON.parse(content.find(block => block.type === 'text')!.text as string).media;
      assert.equal(stored.sha256, media.source.sha256);
      assert.ok(stored.publicUrl);
    }
    const batchImages = itemContents.flat().filter(block => block.type === 'image').length;
    t.diagnostic(`C30 ${tool.descriptor.id}: single image blocks=1; two-item batch image blocks=${batchImages}; saved media results=2`);
  });
});

test("preview skips unsanitized SVG and non-images, and preserves successful writes on codec failure", async t => {
  const imageCodec = new SharpImageTransformer();
  const encode = t.mock.method(imageCodec, "encode", async () => { throw new Error("codec unavailable"); });
  const result = { media: { title: "saved", publicUrl: null, id: "saved-id" } };
  const bytes = new Uint8Array([1, 2, 3]);
  for (const contentType of ["image/svg+xml", "video/mp4", "audio/mpeg"]) {
    assert.strictEqual(await withChatPreview({ routeDeps: { imageCodec }, bytes, contentType, result }), result);
  }
  assert.equal(encode.mock.callCount(), 0, "untrusted SVG and non-images never reach the rasterizer");
  assert.strictEqual(await withChatPreview({ routeDeps: {}, bytes, contentType: "image/png", result }), result);
  assert.strictEqual(await withChatPreview({ routeDeps: { imageCodec }, bytes, contentType: "image/png", result }), result);
  assert.equal(encode.mock.callCount(), 1, "an encode failure keeps the original successful result");
});

test("preview without a public URL omits the link and never enlarges a small image", async () => {
  const bytes = await sharp({ create: { width: 16, height: 8, channels: 3, background: "blue" } }).png().toBuffer();
  const result = { media: { title: "small", publicUrl: null } };
  const reply = await withChatPreview({ routeDeps: { imageCodec: new SharpImageTransformer() }, bytes, contentType: "image/png", result });
  assert.ok("content" in reply);
  const image = reply.content.find(block => block.type === "image")!;
  assert.equal(Object.hasOwn(image, "href"), false);
  assert.equal(image.title, "small");
  const metadata = await sharp(Buffer.from(image.data, "base64")).metadata();
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ["webp", 16, 8]);
  assert.deepEqual(JSON.parse(reply.content[0]!.text!), result);
});
