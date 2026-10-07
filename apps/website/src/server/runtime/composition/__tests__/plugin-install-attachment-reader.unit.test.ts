import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createPluginInstallAttachmentReader } from "../plugin-install-attachment-reader.js";

test("plugin install attachment reader enforces owner, accepted message/run, size and integrity on disk", async t => {
  const uploadDirectory = await realpath(await mkdtemp(path.join(tmpdir(), "plugin-attachment-")));
  t.after(() => rm(uploadDirectory, { recursive: true, force: true }));
  const ref = "attachment:12345678-1234-1234-1234-123456789012", batchId = "batch-12345678";
  const filePath = path.join(uploadDirectory, batchId, "plugin.zip");
  await mkdir(path.dirname(filePath)); await mkdir(path.join(uploadDirectory, ".records"));
  await writeFile(filePath, "zip bytes");
  const info = await lstat(filePath);
  await writeFile(path.join(uploadDirectory, ".records", "attachment_12345678-1234-1234-1234-123456789012.json"), JSON.stringify({
    id: ref, batchId, filePath, name: "plugin.zip", kind: "file", size: info.size, dev: info.dev, ino: info.ino, createdAt: 1, ownerId: "owner",
  }));
  const read = createPluginInstallAttachmentReader({}, { uploadDirectory, getMessageAttachmentRefs: ({ runId }) => runId === "accepted" ? [ref] : [] });
  const required = { ref, ownerId: "owner", runId: "accepted" };
  const result = await read(required, { maxBytes: 32 * 1024 * 1024 });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(Buffer.from(result.bytes).toString(), "zip bytes");
  assert.deepEqual(await read({ ...required, ownerId: "other" }, { maxBytes: 32 * 1024 * 1024 }), { ok: false, refusal: "not-owner" });
  assert.deepEqual(await read({ ...required, runId: "different" }, { maxBytes: 32 * 1024 * 1024 }), { ok: false, refusal: "no-record" });
  assert.deepEqual(await read(required, { maxBytes: 1 }), { ok: false, refusal: "too-large" });
  await writeFile(filePath, "different bytes");
  assert.deepEqual(await read(required, { maxBytes: 32 * 1024 * 1024 }), { ok: false, refusal: "integrity" });
});
