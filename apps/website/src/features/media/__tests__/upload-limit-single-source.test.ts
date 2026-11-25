import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MEDIA_MAX_UPLOAD_BYTES } from "@jini-ai/core/contracts/site/media-upload-limits";
import { MAX_DOCUMENT_BYTES } from "@jini-ai/cms/media";
import { MAX_UPLOAD_BATCH_BYTES, MAX_UPLOAD_BYTES, UPLOAD_CAPS, VIDEO_UPLOAD_LIMIT_BYTES, uploadLimitFor, uploadLimitForFile } from "@tovu/contracts/upload-limits";
import { MEDIA_IMPORT_MAX_BYTES } from "#src/features/media-import/fetch-image";
import { MEDIA_UPLOAD_JSON_BODY_LIMIT } from "#src/server/inbound/shared/json-body-parsers";

/** One upload limit for the whole site (owner 2026-10-29). The server enforces Jini's `MAX_DOCUMENT_BYTES`
 *  (every `TOVU_MAX_UPLOAD_BYTES` alias is that value); admin screens read the same number from
 *  `@tovu/contracts/upload-limits`. If Jini changes its value, this fails loudly instead of the two drifting. */
test("the shared contract limit is the exact value the server enforces", () => {
  assert.equal(MAX_UPLOAD_BYTES, MAX_DOCUMENT_BYTES);
  assert.equal(MEDIA_IMPORT_MAX_BYTES, VIDEO_UPLOAD_LIMIT_BYTES, "assistant URL imports are bounded by the larger video limit while the type is unknown");
});

test("the upload route's JSON body limit still fits the limit once base64 inflates it", () => {
  const megabytes = Number.parseInt(MEDIA_UPLOAD_JSON_BODY_LIMIT, 10);
  const base64Bytes = Math.ceil(VIDEO_UPLOAD_LIMIT_BYTES / 3) * 4;
  assert.ok(base64Bytes <= megabytes * 1024 * 1024, "a limit-sized video would be refused by the body parser");
});

test("videos get the 500 MiB limit and every other type stays at 50 MiB", () => {
  assert.equal(uploadLimitFor({ contentType: "video/mp4" }), VIDEO_UPLOAD_LIMIT_BYTES);
  assert.equal(uploadLimitFor({ contentType: "video/quicktime" }), VIDEO_UPLOAD_LIMIT_BYTES);
  assert.equal(uploadLimitFor({ contentType: "image/png" }), MAX_UPLOAD_BYTES);
  assert.equal(uploadLimitFor({ contentType: "application/pdf" }), MAX_UPLOAD_BYTES);
  assert.equal(MAX_UPLOAD_BYTES, 50 * 1024 * 1024);
  assert.equal(VIDEO_UPLOAD_LIMIT_BYTES, 500 * 1024 * 1024);
});

/** The ordinary limit is Jini's one media policy value, not a second copy of 50 MiB: Library/composer staging
 *  (by filename) and the final byte-sniffed import cap both read it, while a video keeps its larger intake ceiling. */
test("library media staging and final import agree at the ordinary limit while video keeps its intake ceiling", () => {
  const source = readFileSync(new URL("../../../../../../packages/contracts/src/upload-limits.ts", import.meta.url), "utf8");
  assert.match(source, /from "@jini-ai\/core\/contracts\/site\/media-upload-limits"/, "the contract must bind the core media policy value, not restate it");
  assert.equal(MAX_UPLOAD_BYTES, MEDIA_MAX_UPLOAD_BYTES);
  assert.equal(UPLOAD_CAPS.maxUploadBytes, MEDIA_MAX_UPLOAD_BYTES, "final import cap");
  assert.equal(uploadLimitForFile({ name: "notes.pdf", type: "application/pdf" }), MEDIA_MAX_UPLOAD_BYTES, "staging by name");
  assert.equal(uploadLimitForFile({ name: "photo.png", type: "" }), MEDIA_MAX_UPLOAD_BYTES);
  for (const name of ["clip.mov", "clip.m4v", "clip.mp4", "clip.webm"]) {
    assert.equal(uploadLimitForFile({ name, type: "" }), VIDEO_UPLOAD_LIMIT_BYTES, `${name} staging keeps the video ceiling`);
  }
  assert.equal(UPLOAD_CAPS.maxVideoUploadBytes, VIDEO_UPLOAD_LIMIT_BYTES, "final video cap");
  assert.equal(MAX_UPLOAD_BATCH_BYTES, VIDEO_UPLOAD_LIMIT_BYTES + MEDIA_MAX_UPLOAD_BYTES);
});
