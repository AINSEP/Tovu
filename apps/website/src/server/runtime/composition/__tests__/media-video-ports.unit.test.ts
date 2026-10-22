import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createMediaVideoToolPorts } from "../media-video-ports.js";

/** Hardwiring audit #19: without the booted site's attachments dir the reader must refuse rather
 * than guess a directory; with one, every read is the owner-checked store reader. */
test("readAttachment refuses as no-record when the composition supplied no upload directory", async () => {
  const ports = createMediaVideoToolPorts({});
  assert.deepEqual(await ports.readAttachment({ ref: "attachment:abcdefgh", ownerId: "owner" }, { maxBytes: 10 }), { ok: false, refusal: "no-record" });
});

test("readAttachment delegates to the owner-checked store reader for the booted site's upload directory", async (t) => {
  const uploadDirectory = await mkdtemp(path.join(tmpdir(), "media-video-ports-"));
  t.after(() => rm(uploadDirectory, { recursive: true, force: true }));
  const ports = createMediaVideoToolPorts({}, { uploadDirectory });
  // A malformed ref is the reader's own refusal — distinct from the no-directory arm above.
  assert.deepEqual(await ports.readAttachment({ ref: "../escape", ownerId: "owner" }, { maxBytes: 10 }), { ok: false, refusal: "malformed-ref" });
  assert.equal(typeof ports.extractor.extract, "function");
});
