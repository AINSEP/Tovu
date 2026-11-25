import assert from "node:assert/strict";
import test from "node:test";
import { MAX_UPLOAD_BATCH_BYTES, MAX_UPLOAD_BYTES, VIDEO_UPLOAD_LIMIT_BYTES } from "@tovu/contracts/upload-limits";
import { SCOPE_ATTACHMENT_LIMITS } from "../agent-daemon-scope-attachments";

/** Chat attachments are staged before anything is sniffed, so the streaming cap is picked by file name:
 *  a video may stage up to the video limit, every other name stays at 50 MiB (owner 2026-11-24). */
test("the staged-attachment stream cap is the video limit for a video name and 50 MiB for everything else", () => {
  assert.equal(SCOPE_ATTACHMENT_LIMITS.maxAttachmentBytesFor({ name: "clip.mp4" }), VIDEO_UPLOAD_LIMIT_BYTES);
  assert.equal(SCOPE_ATTACHMENT_LIMITS.maxAttachmentBytesFor({ name: "photo.png" }), MAX_UPLOAD_BYTES);
  assert.equal(SCOPE_ATTACHMENT_LIMITS.maxAttachmentBytesFor({ name: "notes.pdf" }), MAX_UPLOAD_BYTES);
});

test("one turn's staged attachments may total the same batch limit the composer checks", () => {
  assert.equal(SCOPE_ATTACHMENT_LIMITS.maxBatchBytes, MAX_UPLOAD_BATCH_BYTES);
});
