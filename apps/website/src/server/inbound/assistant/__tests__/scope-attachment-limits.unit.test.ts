import assert from "node:assert/strict";
import test from "node:test";
import { MAX_UPLOAD_BATCH_BYTES, MAX_UPLOAD_BYTES, VIDEO_UPLOAD_LIMIT_BYTES } from "@tovu/contracts/upload-limits";
import { SCOPE_ATTACHMENT_LIMITS, openScopeAttachments } from "../agent-daemon-scope-attachments.js";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AttachmentRejectedError } from "@jini-ai/daemon/http";

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

test("a clean scope accepts a complete maximum-size composer batch", async t => {
  const uploadDirectory = await mkdtemp(join(tmpdir(), "scope-attachment-limits-"));
  t.after(() => rm(uploadDirectory, { recursive: true, force: true }));
  const store = await openScopeAttachments({ ATTACHMENT_UPLOAD_DIRECTORY: uploadDirectory });
  const registered = [];
  for (const [batchId, name, size] of [
    ["batch-complete", "clip.mov", VIDEO_UPLOAD_LIMIT_BYTES],
    ["batch-complete", "companion.png", MAX_UPLOAD_BYTES],
    ["batch-extra", "extra.txt", 1],
  ] as const) {
    const directory = await store.createBatchDirectory({ batchId }, {});
    const path = join(directory, name);
    const file = await open(path, "w");
    await file.truncate(size);
    await file.close();
    const registration = store.register({ input: { batchId, path, name, size, kind: "file", ownerId: "owner" } }, {});
    if (batchId === "batch-extra") {
      await assert.rejects(registration, error => error instanceof AttachmentRejectedError && error.reason === "storage-full");
    } else {
      registered.push(await registration);
    }
  }
  assert.equal(registered.length, 2);
});
