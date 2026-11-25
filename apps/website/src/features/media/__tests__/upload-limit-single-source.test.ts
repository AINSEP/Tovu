import assert from "node:assert/strict";
import test from "node:test";
import { MAX_DOCUMENT_BYTES } from "@jini-ai/cms/media";
import { MAX_UPLOAD_BYTES, VIDEO_UPLOAD_LIMIT_BYTES, uploadLimitFor } from "@tovu/contracts/upload-limits";
import { MEDIA_IMPORT_MAX_BYTES } from "#src/features/media-import/fetch-image";
import { LARGE_UPLOAD_JSON_BODY_LIMIT } from "#src/server/inbound/shared/json-body-parsers";

/** One upload limit for the whole site (owner 2026-10-29). The server enforces Jini's `MAX_DOCUMENT_BYTES`
 *  (every `TOVU_MAX_UPLOAD_BYTES` alias is that value); admin screens read the same number from
 *  `@tovu/contracts/upload-limits`. If Jini changes its value, this fails loudly instead of the two drifting. */
test("the shared contract limit is the exact value the server enforces", () => {
  assert.equal(MAX_UPLOAD_BYTES, MAX_DOCUMENT_BYTES);
  assert.equal(MEDIA_IMPORT_MAX_BYTES, VIDEO_UPLOAD_LIMIT_BYTES, "assistant URL imports are bounded by the larger video limit while the type is unknown");
});

test("the upload route's JSON body limit still fits the limit once base64 inflates it", () => {
  const megabytes = Number.parseInt(LARGE_UPLOAD_JSON_BODY_LIMIT, 10);
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
