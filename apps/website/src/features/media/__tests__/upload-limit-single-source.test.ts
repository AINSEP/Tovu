import assert from "node:assert/strict";
import test from "node:test";
import { MAX_DOCUMENT_BYTES } from "@jini-ai/cms/media";
import { MAX_UPLOAD_BYTES } from "@tovu/contracts/upload-limits";
import { MEDIA_IMPORT_MAX_BYTES } from "#src/features/media-import/fetch-image";
import { LARGE_UPLOAD_JSON_BODY_LIMIT } from "#src/server/inbound/shared/json-body-parsers";

/** One upload limit for the whole site (owner 2026-10-29). The server enforces Jini's `MAX_DOCUMENT_BYTES`
 *  (every `TOVU_MAX_UPLOAD_BYTES` alias is that value); admin screens read the same number from
 *  `@tovu/contracts/upload-limits`. If Jini changes its value, this fails loudly instead of the two drifting. */
test("the shared contract limit is the exact value the server enforces", () => {
  assert.equal(MAX_UPLOAD_BYTES, MAX_DOCUMENT_BYTES);
  assert.equal(MEDIA_IMPORT_MAX_BYTES, MAX_UPLOAD_BYTES, "assistant URL imports accept the same size");
});

test("the upload route's JSON body limit still fits the limit once base64 inflates it", () => {
  const megabytes = Number.parseInt(LARGE_UPLOAD_JSON_BODY_LIMIT, 10);
  const base64Bytes = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4;
  assert.ok(base64Bytes <= megabytes * 1024 * 1024, "a limit-sized file would be refused by the body parser");
});
