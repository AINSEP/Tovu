import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test, { describe } from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { ToolInputError } from "@jini-ai/core";
import { AttachmentRejectedError, createDiskAttachmentStore } from "@jini-ai/http-kit";

import {
  buildPromoteChatAttachmentTool,
  resolveChatAttachmentBytes,
  MEDIA_PROMOTE_CHAT_ATTACHMENT_TOOL_ID,
  type ChatAttachmentLookup,
} from "../promote-chat-attachment.js";
import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryMediaContentTypeStore,
  InMemoryMediaRepo,
  InMemoryBlobStore,
  InMemoryTransformDefinitionRepo,
} from "../index.js";
import type { RouteDeps } from "../../../server/routes/types.js";
import { buildAssistantToolRegistrations } from "../../../assistant/tool-registrations.js";
import { resetToolContributorsForTests, registerToolContributor } from "../../../assistant/tool-contribution-registry.js";
import { contributeMediaTools } from "../tool-registrations.js";

/**
 * Regression coverage for the bridge diagnosed in `2026-09-06-handoff-to-tovu-73.md`'s "Task 2": an
 * attachment the chat composer already uploaded (`@jini-ai/http-kit`'s `AttachmentStore`) had no way
 * into `media_upload_asset`, which only ever accepted `dataBase64`. See `promote-chat-attachment.ts`'s
 * own header for the full design.
 *
 * The AVIF fixture and gate-proof style mirror `tool-registrations.test.ts`'s own AVIF regression —
 * deliberately: the point of this suite is to show the SAME recorded-content-type behavior that suite
 * polices for `media_upload_asset` also holds when the bytes arrive via this bridge instead, which is
 * the concrete proof that no second, laxer path was created.
 */

resetToolContributorsForTests();
registerToolContributor(contributeMediaTools());

const WORKSPACE_ID = "ws-attachment-bridge";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-06T00:00:00.000Z";

/** The real leading `ftyp` box of a genuine AVIF file — same fixture `tool-registrations.test.ts`
 *  uses for its own AVIF regression, duplicated per this codebase's "duplicate the tiny thing, don't
 *  reach across test files for it" convention (see `features/media/tool-registrations.ts`'s header). */
const AVIF_BYTES = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x69, 0x66, 0x31, 0x6d, 0x69, 0x61, 0x66, 0x00, 0x00, 0x01, 0x68, 0x6d, 0x65, 0x74, 0x61,
]);

/**
 * A genuine, non-image ISO-BMFF `ftyp` box — same shape as `AVIF_BYTES` above, but with major/
 * compatible brands ("isom"/"iso2"/"mp41") that are NOT in `content-type-sniffer.ts`'s `AVIF_BRANDS`
 * list, so `sniffContentType` classifies it as `video/mp4` via the brand-blind ISO-BMFF fallback.
 * Exists so this suite proves the bridge handles a genuinely different, non-image media type through
 * the exact same code path — it is generic over content type, not AVIF-specific (the AVIF fixture
 * above exists only because that was the file that originally exposed the missing capability, per
 * `2026-09-06-handoff-to-tovu-73.md`).
 */
const MP4_BYTES = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
  0x69, 0x73, 0x6f, 0x32, 0x6d, 0x70, 0x34, 0x31,
]);

function executionContext(input: Record<string, unknown>, runId = "run-1"): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: runId }, input, signal: new AbortController().signal };
}

function fakeRouteDeps() {
  const mediaRepo = new InMemoryMediaRepo();
  const assetBlobRepo = new InMemoryAssetBlobRepo();
  const assetRenditionRepo = new InMemoryAssetRenditionRepo();
  const blobStore = new InMemoryBlobStore();
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  let counter = 0;
  const deps = {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    mediaRepo,
    assetBlobRepo,
    assetRenditionRepo,
    blobStore,
    mediaContentTypeStore,
    transformDefinitionRepo,
  };
  return { deps: deps as unknown as RouteDeps, mediaContentTypeStore, mediaRepo };
}

/** Finds the real, already-wired `media_upload_asset` registration — the same handler this bridge
 *  must delegate to, never a second implementation of it. */
function wiredMediaUploadAsset(deps: RouteDeps): ToolRegistration {
  const found = buildAssistantToolRegistrations(deps).find((r) => r.descriptor.id === "media_upload_asset");
  assert.ok(found, "expected 'media_upload_asset' to be wired");
  return found;
}

// ---------------------------------------------------------------------------
// resolveChatAttachmentBytes — the pure resolution step, against a fake store
// ---------------------------------------------------------------------------

describe("resolveChatAttachmentBytes", () => {
  test("reads bytes through the store's resolved path and returns the attachment's name", async () => {
    const store: ChatAttachmentLookup = {
      resolveForRun: async (ref, runId) => {
        assert.equal(ref, "attachment:abc");
        assert.equal(runId, "run-1");
        return { path: "/fake/path/ai-caps.avif", name: "ai-caps.avif", kind: "file" };
      },
    };
    const result = await resolveChatAttachmentBytes(
      { store, readFile: async (p) => { assert.equal(p, "/fake/path/ai-caps.avif"); return AVIF_BYTES; } },
      { ref: "attachment:abc", runId: "run-1" },
    );
    assert.deepEqual(result, { bytes: AVIF_BYTES, name: "ai-caps.avif" });
  });

  test("throws ToolInputError when the store has never heard of the ref", async () => {
    const store: ChatAttachmentLookup = { resolveForRun: async () => undefined };
    await assert.rejects(
      resolveChatAttachmentBytes({ store, readFile: async () => AVIF_BYTES }, { ref: "attachment:missing", runId: "run-1" }),
      ToolInputError,
    );
  });

  test("re-classifies AttachmentRejectedError (a different run's claim) as ToolInputError", async () => {
    const store: ChatAttachmentLookup = {
      resolveForRun: async () => {
        throw new AttachmentRejectedError("attachment-unknown-or-claimed", "Attachment is unknown or already claimed");
      },
    };
    await assert.rejects(
      resolveChatAttachmentBytes({ store, readFile: async () => AVIF_BYTES }, { ref: "attachment:foreign", runId: "run-1" }),
      ToolInputError,
    );
  });

  test("does not mask an unrelated store failure as a ToolInputError", async () => {
    const store: ChatAttachmentLookup = { resolveForRun: async () => { throw new Error("disk exploded"); } };
    await assert.rejects(
      resolveChatAttachmentBytes({ store, readFile: async () => AVIF_BYTES }, { ref: "attachment:x", runId: "run-1" }),
      /disk exploded/,
    );
  });
});

// ---------------------------------------------------------------------------
// buildPromoteChatAttachmentTool — end to end, real AttachmentStore + real media_upload_asset
// ---------------------------------------------------------------------------

describe("media_promote_chat_attachment (end to end)", () => {
  async function withRealStore(run: (store: Awaited<ReturnType<typeof createDiskAttachmentStore>>) => Promise<void>) {
    const uploadDirectory = await mkdtemp(resolve(tmpdir(), "tovu-promote-attachment-"));
    const store = await createDiskAttachmentStore({ uploadDirectory });
    try {
      await run(store);
    } finally {
      await store.dispose();
      await rm(uploadDirectory, { recursive: true, force: true });
    }
  }

  test("promotes a real AVIF chat attachment into the media library, recording image/avif — not video/mp4 — via the SAME gate media_upload_asset uses", async () => {
    await withRealStore(async (store) => {
      const { deps, mediaContentTypeStore } = fakeRouteDeps();
      const batchDirectory = await store.createBatchDirectory("batch-e2e-1");
      const filePath = resolve(batchDirectory, "raw-upload-name.bin");
      await writeFile(filePath, AVIF_BYTES, { mode: 0o600 });
      const registered = await store.register({ batchId: "batch-e2e-1", path: filePath, name: "ai-caps.avif", kind: "file", size: AVIF_BYTES.length });

      const tool = buildPromoteChatAttachmentTool({
        getStore: () => store,
        mediaUploadHandler: wiredMediaUploadAsset(deps).handler,
        readFile: (p) => readFile(p) as unknown as Promise<Uint8Array>,
      });

      const out = (await tool.handler(executionContext({ attachmentRef: registered.path }))) as { media: { sha256: string } };

      const recorded = await mediaContentTypeStore.getMany({ workspaceId: WORKSPACE_ID, sha256s: [out.media.sha256] });
      assert.equal(recorded.get(out.media.sha256), "image/avif", "must record the SNIFFED type, exactly what media_upload_asset itself records");
    });
  });

  test("promotes a real, non-image (video/mp4) chat attachment through the SAME path — the bridge is generic over content type, not AVIF-specific", async () => {
    await withRealStore(async (store) => {
      const { deps, mediaContentTypeStore } = fakeRouteDeps();
      const batchDirectory = await store.createBatchDirectory("batch-e2e-video");
      const filePath = resolve(batchDirectory, "raw-upload-name.bin");
      await writeFile(filePath, MP4_BYTES, { mode: 0o600 });
      const registered = await store.register({ batchId: "batch-e2e-video", path: filePath, name: "clip.mp4", kind: "file", size: MP4_BYTES.length });

      const tool = buildPromoteChatAttachmentTool({
        getStore: () => store,
        mediaUploadHandler: wiredMediaUploadAsset(deps).handler,
        readFile: (p) => readFile(p) as unknown as Promise<Uint8Array>,
      });

      const out = (await tool.handler(executionContext({ attachmentRef: registered.path }))) as { media: { sha256: string; title: string } };

      assert.equal(out.media.title, "clip");
      const recorded = await mediaContentTypeStore.getMany({ workspaceId: WORKSPACE_ID, sha256s: [out.media.sha256] });
      assert.equal(recorded.get(out.media.sha256), "video/mp4", "a non-image attachment must be sniffed and recorded on its own merits, with no image-specific branching in the bridge");
    });
  });

  test("resolves by the real absolute path too, not only the opaque attachment id", async () => {
    await withRealStore(async (store) => {
      const { deps } = fakeRouteDeps();
      const batchDirectory = await store.createBatchDirectory("batch-e2e-2");
      const filePath = resolve(batchDirectory, "photo.bin");
      await writeFile(filePath, AVIF_BYTES, { mode: 0o600 });
      await store.register({ batchId: "batch-e2e-2", path: filePath, name: "photo.avif", kind: "file", size: AVIF_BYTES.length });

      const tool = buildPromoteChatAttachmentTool({
        getStore: () => store,
        mediaUploadHandler: wiredMediaUploadAsset(deps).handler,
        readFile: (p) => readFile(p) as unknown as Promise<Uint8Array>,
      });

      // The model was told the real PATH (image-prompt-delivery.ts narrates paths, never ids) — this
      // is the identifier it actually has in the common same-turn case.
      const out = (await tool.handler(executionContext({ attachmentRef: filePath }))) as { media: { title: string } };
      assert.equal(out.media.title, "photo");
    });
  });

  test("refuses to promote an attachment a DIFFERENT run already claimed — the authorization scoping this bridge adds", async () => {
    await withRealStore(async (store) => {
      const { deps } = fakeRouteDeps();
      const batchDirectory = await store.createBatchDirectory("batch-e2e-3");
      const filePath = resolve(batchDirectory, "other.bin");
      await writeFile(filePath, AVIF_BYTES, { mode: 0o600 });
      const registered = await store.register({ batchId: "batch-e2e-3", path: filePath, name: "other.avif", kind: "file", size: AVIF_BYTES.length });
      // A different chat session's run claims it first.
      await store.claim([registered], "run-owner");

      const tool = buildPromoteChatAttachmentTool({
        getStore: () => store,
        mediaUploadHandler: wiredMediaUploadAsset(deps).handler,
        readFile: (p) => readFile(p) as unknown as Promise<Uint8Array>,
      });

      await assert.rejects(
        tool.handler(executionContext({ attachmentRef: registered.path }, "run-stranger")),
        ToolInputError,
      );
    });
  });

  test("the tool descriptor never asks the model for contentType or dataBase64", () => {
    const { deps } = fakeRouteDeps();
    const tool = buildPromoteChatAttachmentTool({
      getStore: () => undefined,
      mediaUploadHandler: wiredMediaUploadAsset(deps).handler,
      readFile: async () => AVIF_BYTES,
    });
    assert.equal(tool.descriptor.id, MEDIA_PROMOTE_CHAT_ATTACHMENT_TOOL_ID);
    const schema = tool.descriptor.inputSchema as { properties: Record<string, unknown> };
    assert.ok(!("contentType" in schema.properties), "contentType must be sniffed, never model-declared");
    assert.ok(!("dataBase64" in schema.properties), "bytes must come from the attachment store, never re-sent as base64");
  });
});
