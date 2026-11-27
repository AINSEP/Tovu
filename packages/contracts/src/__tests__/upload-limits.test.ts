import assert from "node:assert/strict";
import test from "node:test";
import { MAX_UPLOAD_BATCH_BYTES, MAX_UPLOAD_BYTES, VIDEO_UPLOAD_LIMIT_BYTES, uploadLimitFor, uploadLimitForFile } from "../upload-limits.js";

test("the shared upload limit is 50 MiB, and one chat message may carry two such files", () => {
  assert.equal(MAX_UPLOAD_BYTES, 50 * 1024 * 1024);
  assert.ok(MAX_UPLOAD_BATCH_BYTES >= 2 * MAX_UPLOAD_BYTES);
});

test("a chat message may carry one largest video plus one other full-size file, so the batch cap never refuses a file the per-file cap allows", () => {
  assert.equal(MAX_UPLOAD_BATCH_BYTES, VIDEO_UPLOAD_LIMIT_BYTES + MAX_UPLOAD_BYTES);
});

test("a file is held to the video limit by its type, or by its extension when the type is unknown (chat attachments upload as octet-stream)", () => {
  assert.equal(uploadLimitForFile({ name: "a", type: "video/mp4" }), VIDEO_UPLOAD_LIMIT_BYTES);
  for (const name of ["clip.mp4", "CLIP.MOV", "a.b.webm", "x.m4v"]) assert.equal(uploadLimitForFile({ name, type: "" }), VIDEO_UPLOAD_LIMIT_BYTES, name);
  for (const name of ["photo.png", "doc.pdf", "mp4", "video.mp4.txt", "noext"]) assert.equal(uploadLimitForFile({ name, type: "" }), MAX_UPLOAD_BYTES, name);
  assert.equal(uploadLimitForFile({ name: "clip.mp4", type: "image/png" }), VIDEO_UPLOAD_LIMIT_BYTES, "a declared image type does not hide a video extension from the server-side name check");
});

test("the content-type upload policy matches video MIME case-insensitively and keeps other files at 50 MiB", () => {
  assert.equal(uploadLimitFor({ contentType: "VIDEO/WEBM" }), 500 * 1024 * 1024);
  assert.equal(uploadLimitFor({ contentType: "application/video" }), 50 * 1024 * 1024);
});
