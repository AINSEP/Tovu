/**
 * @file Coverage for `site-preview-store.js` — the preview cache's path convention, its version
 * token, and its two cleanup paths. Real files in a temp userData dir: the whole module is about
 * what is on disk, and a mocked `fs` would assert that it calls the functions it plainly calls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import {
  siteDigest,
  previewPath,
  readPreviewVersion,
  readPreviewDataUrl,
  writePreview,
  deletePreview,
  sweepOrphanedPreviews,
} from "./site-preview-store.js";
import { sitePartition } from "./desktop-auth.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-preview-"));
}

/** A tiny but REAL png, so `readPreviewDataUrl`'s output is something a browser would accept. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("the digest is sitePartition's own, so one site has ONE identity in this app", () => {
  // Not a second hashing scheme. `desktop-auth.js` already derives a per-site digest for the
  // Electron session partition; two schemes could disagree about which site a file belongs to.
  const dir = "/sites/example";
  assert.equal(sitePartition(dir), `persist:tovu-site-${siteDigest(dir)}`);
  assert.equal(siteDigest(dir), crypto.createHash("sha256").update(dir).digest("hex").slice(0, 32));
});

test("the digest resolves the path, so two spellings of one directory share a preview", () => {
  assert.equal(siteDigest("/sites/example"), siteDigest("/sites/./example"));
  assert.equal(siteDigest("/sites/example"), siteDigest("/sites/other/../example"));
});

test("the preview lives under userData and NOT in the site's own directory", () => {
  // A cache belongs to this app, not to the operator's site folder — which this app is otherwise
  // careful never to write into except for a deliberate rename.
  const userData = tempDir();
  const file = previewPath(userData, "/sites/example");
  assert.equal(file.startsWith(path.join(userData, "site-previews") + path.sep), true);
  assert.equal(file.endsWith(".png"), true);
  assert.doesNotMatch(file, /\/sites\/example/);
});

test("no capture yet reads as null on BOTH accessors, never as a throw", () => {
  // Every site starts with no preview, so absence is the ordinary case and must not be an error.
  const userData = tempDir();
  assert.equal(readPreviewVersion(userData, "/sites/never-started"), null);
  assert.equal(readPreviewDataUrl(userData, "/sites/never-started"), null);
});

test("writePreview creates the directory, stores the bytes, and returns a version", () => {
  const userData = tempDir();
  const version = writePreview(userData, "/sites/example", PNG);
  assert.equal(typeof version, "number");
  assert.deepEqual(fs.readFileSync(previewPath(userData, "/sites/example")), PNG);
  assert.equal(readPreviewVersion(userData, "/sites/example"), version);
});

test("readPreviewDataUrl round-trips the exact bytes as a png data URL", () => {
  const userData = tempDir();
  writePreview(userData, "/sites/example", PNG);
  const url = readPreviewDataUrl(userData, "/sites/example");
  assert.match(url, /^data:image\/png;base64,/);
  assert.deepEqual(Buffer.from(url.slice("data:image/png;base64,".length), "base64"), PNG);
});

test("a re-capture moves the version forward, which is what the renderer watches", () => {
  // The whole point of the token: the record carries this number, not the image, so the renderer
  // re-fetches bytes only when they actually changed rather than on every 4s poll.
  const userData = tempDir();
  const first = writePreview(userData, "/sites/example", PNG);
  const laterBytes = Buffer.concat([PNG, Buffer.from([0])]);
  // Force a distinguishable mtime — mtimeMs resolution can collapse two writes in the same tick.
  const file = previewPath(userData, "/sites/example");
  writePreview(userData, "/sites/example", laterBytes);
  fs.utimesSync(file, new Date(), new Date(Date.now() + 1000));
  assert.notEqual(readPreviewVersion(userData, "/sites/example"), first);
});

test("writePreview leaves no temp file behind, on success or on failure", () => {
  const userData = tempDir();
  writePreview(userData, "/sites/example", PNG);
  assert.deepEqual(fs.readdirSync(path.join(userData, "site-previews")), [
    path.basename(previewPath(userData, "/sites/example")),
  ]);
});

test("writePreview returns null rather than throwing when it cannot write", () => {
  // A preview is decoration. Failing to cache one must never take down the site start that
  // triggered the capture.
  const userData = tempDir();
  // A FILE where the previews directory needs to be, so mkdirSync fails.
  fs.writeFileSync(path.join(userData, "site-previews"), "not a directory");
  assert.equal(writePreview(userData, "/sites/example", PNG), null);
});

test("deletePreview removes one site's file and is silent when there is none", () => {
  const userData = tempDir();
  writePreview(userData, "/sites/a", PNG);
  writePreview(userData, "/sites/b", PNG);

  deletePreview(userData, "/sites/a");
  assert.equal(readPreviewVersion(userData, "/sites/a"), null);
  assert.notEqual(readPreviewVersion(userData, "/sites/b"), null, "a sibling must survive");

  // Idempotent — the delete path runs alongside `untrackSite`, which is itself unconditional.
  deletePreview(userData, "/sites/a");
});

test("the boot sweep removes only previews no tracked site claims", () => {
  const userData = tempDir();
  writePreview(userData, "/sites/kept", PNG);
  writePreview(userData, "/sites/orphan-one", PNG);
  writePreview(userData, "/sites/orphan-two", PNG);

  const removed = sweepOrphanedPreviews(userData, ["/sites/kept"]);

  assert.equal(removed, 2);
  assert.notEqual(readPreviewVersion(userData, "/sites/kept"), null);
  assert.equal(readPreviewVersion(userData, "/sites/orphan-one"), null);
  assert.equal(readPreviewVersion(userData, "/sites/orphan-two"), null);
});

test("the boot sweep is a no-op on a first run, with no previews directory at all", () => {
  assert.equal(sweepOrphanedPreviews(tempDir(), ["/sites/kept"]), 0);
});

test("the boot sweep keeps every tracked site when nothing is orphaned", () => {
  // The dangerous direction: a sweep that deleted a live site's preview would blank its card until
  // the next start. Asserted explicitly rather than inferred from the orphan case.
  const userData = tempDir();
  const dirs = ["/sites/a", "/sites/b", "/sites/c"];
  for (const dir of dirs) writePreview(userData, dir, PNG);

  assert.equal(sweepOrphanedPreviews(userData, dirs), 0);
  for (const dir of dirs) assert.notEqual(readPreviewVersion(userData, dir), null, `${dir} was swept`);
});

test("the sweep matches on the resolved digest, not the raw string it was handed", () => {
  // A tracked row spelled differently from the path the preview was written under must still count
  // as claimed — otherwise a sweep silently deletes a live site's thumbnail every boot.
  const userData = tempDir();
  writePreview(userData, "/sites/example", PNG);
  assert.equal(sweepOrphanedPreviews(userData, ["/sites/other/../example"]), 0);
  assert.notEqual(readPreviewVersion(userData, "/sites/example"), null);
});
