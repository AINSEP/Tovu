import assert from "node:assert/strict";
import test from "node:test";
import type { ToolRegistration } from "@jini-ai/core";
import { MAX_DOCUMENT_BYTES } from "@jini-ai/cms/media";
import { mediaImportAgentToolCatalog } from "../../media-import/tool-registrations.js";
import { withLargeUploadRouting } from "@jini-ai/cms/media/site/large-upload-routing";
import { LARGE_UPLOAD_ROUTING } from "../large-upload-routing-copy.js";

/** @file A212 — the inline upload tool must lead an agent holding a >10 MB video to the local file import. */

const registration = (id: string, description: string): ToolRegistration =>
  ({ descriptor: { id, description }, handler: async () => ({}) }) as unknown as ToolRegistration;

test("media_upload_asset's description routes a large video to media_import_local_file", () => {
  const routed = withLargeUploadRouting({ registration: registration("media_upload_asset", "Upload bytes."), routingText: LARGE_UPLOAD_ROUTING });
  const description = routed.descriptor.description ?? "";
  assert.ok(description.startsWith("Upload bytes. "), "keeps the original description");
  assert.match(description, /media_import_local_file/);
  assert.match(description, /over about 10 MB/);
  assert.match(description, /up to 50 MiB/);
});

test("the routed-to tool exists and its own cap matches the figure the routing states", () => {
  const local = mediaImportAgentToolCatalog.find((tool) => tool.name === "media_import_local_file");
  assert.ok(local, "media_import_local_file must stay in the catalog the routing points at");
  assert.match(local.description, /MP4 and WebM, up to 50 MiB/);
  assert.equal(MAX_DOCUMENT_BYTES, 50 * 1024 * 1024);
  assert.ok(LARGE_UPLOAD_ROUTING.includes(`${MAX_DOCUMENT_BYTES / (1024 * 1024)} MiB`));
});

test("other registrations pass through untouched", () => {
  const other = registration("media_list_assets", "List.");
  assert.equal(withLargeUploadRouting({ registration: other, routingText: LARGE_UPLOAD_ROUTING }), other);
});
