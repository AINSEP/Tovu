import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/cms/core";

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
 * Covers `media_upload_asset`'s content-type recording (Defect 2 of the media-pipeline bug batch):
 * before this fix, an asset uploaded through this tool never had ANY content type persisted
 * anywhere (`asset_blobs.content_type` stayed empty), which 500'd the very next request for its
 * public rendition URL. `media_generate_asset` (`features/media-generation`) already recorded a
 * type for its own uploads; this suite proves `media_upload_asset` now does too, through the SAME
 * `MediaToolDeps.recordUploadContentType` hook wired here (`tool-registrations.ts`'s
 * `buildMediaRegistrationsForTovu`), never trusting the caller's declared `contentType` string —
 * the sniffed value is what gets persisted, matching this codebase's "Content-Type is NEVER the
 * client's upload-time string" policy stated in `content-type-store.ts`'s own file header.
 */

resetToolContributorsForTests();
registerToolContributor(contributeMediaTools());

const WORKSPACE_ID = "ws-media-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-02T00:00:00.000Z";

// A real PNG signature — the declared `contentType` below deliberately does NOT match it, so a
// passing test proves the SNIFFED type was recorded, not merely an echo of what the caller claimed.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef]);

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
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

function mediaRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("media_")).map((r) => [r.descriptor.id, r]));
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = mediaRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

test("media_upload_asset records the SNIFFED content type (not the caller's declared string) so the asset is correctly typed afterward", async () => {
  const { deps, mediaContentTypeStore } = fakeRouteDeps();

  const out = (await wired("media_upload_asset", deps).handler(
    executionContext({
      dataBase64: PNG_BYTES.toString("base64"),
      filename: "logo.png",
      // Deliberately WRONG — a caller lying about the type must not poison the recorded value.
      contentType: "image/gif",
    })
  )) as { media: { sha256: string } };

  const recorded = await mediaContentTypeStore.getMany({ workspaceId: WORKSPACE_ID, sha256s: [out.media.sha256] });
  assert.equal(recorded.get(out.media.sha256), "image/png", "the recorded type must come from sniffing the real bytes, not the caller's declared 'image/gif'");
});

test("two uploads of different bytes each get their own recorded content type", async () => {
  const { deps, mediaContentTypeStore } = fakeRouteDeps();
  const gifBytes = Buffer.from("GIF89a" + "\x08\x00\x08\x00\x80\x00\x3f", "latin1");

  const png = (await wired("media_upload_asset", deps).handler(
    executionContext({ dataBase64: PNG_BYTES.toString("base64"), filename: "a.png", contentType: "image/png" })
  )) as { media: { sha256: string } };
  const gif = (await wired("media_upload_asset", deps).handler(
    executionContext({ dataBase64: gifBytes.toString("base64"), filename: "b.gif", contentType: "image/gif" })
  )) as { media: { sha256: string } };

  const recorded = await mediaContentTypeStore.getMany({ workspaceId: WORKSPACE_ID, sha256s: [png.media.sha256, gif.media.sha256] });
  assert.equal(recorded.get(png.media.sha256), "image/png");
  assert.equal(recorded.get(gif.media.sha256), "image/gif");
});
