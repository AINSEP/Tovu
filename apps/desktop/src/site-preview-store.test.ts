/**
 * @file Coverage for `site-preview-store.ts` — the preview cache's path convention, its version
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
} from "./site-preview-store.ts";
import { sitePartition } from "./desktop-auth.ts";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-preview-"));
}

/** A tiny but REAL png, so `readPreviewDataUrl`'s output is something a browser would accept. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("the digest is sitePartition's own, so one site has ONE identity in this app", () => {
  // Not a second hashing scheme. `desktop-auth.ts` already derives a per-site digest for the
  // Electron session partition; two schemes could disagree about which site a file belongs to.
  const dir = "/sites/example";
  assert.equal(sitePartition({ siteDir: dir }), `persist:tovu-site-${siteDigest({ siteDir: dir })}`);
  assert.equal(siteDigest({ siteDir: dir }), crypto.createHash("sha256").update(dir).digest("hex").slice(0, 32));
});

test("the digest resolves the path, so two spellings of one directory share a preview", () => {
  assert.equal(siteDigest({ siteDir: "/sites/example" }), siteDigest({ siteDir: "/sites/./example" }));
  assert.equal(siteDigest({ siteDir: "/sites/example" }), siteDigest({ siteDir: "/sites/other/../example" }));
});

test("the preview lives under userData and NOT in the site's own directory", () => {
  // A cache belongs to this app, not to the operator's site folder — which this app is otherwise
  // careful never to write into except for a deliberate rename.
  const userData = tempDir();
  const file = previewPath({ userDataDir: userData, siteDir: "/sites/example" });
  assert.equal(file.startsWith(path.join(userData, "site-previews") + path.sep), true);
  assert.equal(file.endsWith(".png"), true);
  assert.doesNotMatch(file, /\/sites\/example/);
});

test("no capture yet reads as null on BOTH accessors, never as a throw", () => {
  // Every site starts with no preview, so absence is the ordinary case and must not be an error.
  const userData = tempDir();
  assert.equal(readPreviewVersion({ userDataDir: userData, siteDir: "/sites/never-started" }), null);
  assert.equal(readPreviewDataUrl({ userDataDir: userData, siteDir: "/sites/never-started" }), null);
});

test("writePreview creates the directory, stores the bytes, and returns a version", () => {
  const userData = tempDir();
  const version = writePreview({ userDataDir: userData, siteDir: "/sites/example", bytes: PNG });
  assert.equal(typeof version, "number");
  assert.deepEqual(fs.readFileSync(previewPath({ userDataDir: userData, siteDir: "/sites/example" })), PNG);
  assert.equal(readPreviewVersion({ userDataDir: userData, siteDir: "/sites/example" }), version);
});

test("readPreviewDataUrl round-trips the exact bytes as a png data URL", () => {
  const userData = tempDir();
  writePreview({ userDataDir: userData, siteDir: "/sites/example", bytes: PNG });
  const url = readPreviewDataUrl({ userDataDir: userData, siteDir: "/sites/example" });
  assert.match(url!, /^data:image\/png;base64,/);
  assert.deepEqual(Buffer.from(url!.slice("data:image/png;base64,".length), "base64"), PNG);
});

test("a re-capture moves the version forward, which is what the renderer watches", () => {
  // The whole point of the token: the record carries this number, not the image, so the renderer
  // re-fetches bytes only when they actually changed rather than on every 4s poll.
  const userData = tempDir();
  writePreview({ userDataDir: userData, siteDir: "/sites/example", bytes: PNG });
  const file = previewPath({ userDataDir: userData, siteDir: "/sites/example" });
  fs.utimesSync(file, new Date(1_000_000), new Date(1_000_000));
  const first = readPreviewVersion({ userDataDir: userData, siteDir: "/sites/example" });
  const laterBytes = Buffer.concat([PNG, Buffer.from([0])]);
  const second = writePreview({ userDataDir: userData, siteDir: "/sites/example", bytes: laterBytes });
  assert.ok(first !== null && second !== null && second > first);
  assert.equal(readPreviewVersion({ userDataDir: userData, siteDir: "/sites/example" }), second);
  assert.deepEqual(fs.readFileSync(file), laterBytes);
});

test("writePreview leaves no temp file behind, on success or on failure", (t) => {
  const userData = tempDir();
  writePreview({ userDataDir: userData, siteDir: "/sites/example", bytes: PNG });
  assert.deepEqual(fs.readdirSync(path.join(userData, "site-previews")), [
    path.basename(previewPath({ userDataDir: userData, siteDir: "/sites/example" })),
  ]);
  const file = previewPath({ userDataDir: userData, siteDir: "/sites/example" });
  let renameDestination: string | undefined;
  let tempExisted = false;
  t.mock.method(fs, "renameSync", (temp: string, destination: string) => {
    renameDestination = destination;
    tempExisted = fs.existsSync(temp);
    throw new Error("rename refused");
  });
  assert.equal(writePreview({ userDataDir: userData, siteDir: "/sites/example", bytes: Buffer.from("replacement") }), null);
  assert.equal(renameDestination, file);
  assert.equal(tempExisted, true, "failure is after the temp write");
  assert.deepEqual(fs.readFileSync(file), PNG);
  assert.deepEqual(fs.readdirSync(path.join(userData, "site-previews")), [path.basename(file)]);
});

test("writePreview returns null rather than throwing when it cannot write", () => {
  // A preview is decoration. Failing to cache one must never take down the site start that
  // triggered the capture.
  const userData = tempDir();
  // A FILE where the previews directory needs to be, so mkdirSync fails.
  fs.writeFileSync(path.join(userData, "site-previews"), "not a directory");
  assert.equal(writePreview({ userDataDir: userData, siteDir: "/sites/example", bytes: PNG }), null);
});

test("deletePreview removes one site's file and is silent when there is none", () => {
  const userData = tempDir();
  writePreview({ userDataDir: userData, siteDir: "/sites/a", bytes: PNG });
  writePreview({ userDataDir: userData, siteDir: "/sites/b", bytes: PNG });

  deletePreview({ userDataDir: userData, siteDir: "/sites/a" });
  assert.equal(readPreviewVersion({ userDataDir: userData, siteDir: "/sites/a" }), null);
  assert.notEqual(readPreviewVersion({ userDataDir: userData, siteDir: "/sites/b" }), null, "a sibling must survive");

  // Idempotent — the delete path runs alongside `untrackSite`, which is itself unconditional.
  deletePreview({ userDataDir: userData, siteDir: "/sites/a" });
});

test("the boot sweep removes only previews no tracked site claims", () => {
  const userData = tempDir();
  writePreview({ userDataDir: userData, siteDir: "/sites/kept", bytes: PNG });
  writePreview({ userDataDir: userData, siteDir: "/sites/orphan-one", bytes: PNG });
  writePreview({ userDataDir: userData, siteDir: "/sites/orphan-two", bytes: PNG });

  const removed = sweepOrphanedPreviews({ userDataDir: userData, trackedSiteDirs: ["/sites/kept"] });

  assert.equal(removed, 2);
  assert.notEqual(readPreviewVersion({ userDataDir: userData, siteDir: "/sites/kept" }), null);
  assert.equal(readPreviewVersion({ userDataDir: userData, siteDir: "/sites/orphan-one" }), null);
  assert.equal(readPreviewVersion({ userDataDir: userData, siteDir: "/sites/orphan-two" }), null);
});

test("a preview path that cannot be removed is left in place without failing the delete or the sweep", () => {
  const userData = tempDir();
  writePreview({ userDataDir: userData, siteDir: "/sites/orphan", bytes: PNG });
  // A FOLDER where a site's preview file belongs: non-recursive removal refuses it.
  const stuck = previewPath({ userDataDir: userData, siteDir: "/sites/stuck" });
  fs.mkdirSync(path.join(stuck, "inside"), { recursive: true });

  assert.doesNotThrow(() => deletePreview({ userDataDir: userData, siteDir: "/sites/stuck" }));
  assert.ok(fs.statSync(stuck).isDirectory(), "best-effort: an unremovable entry stays for the next boot");

  assert.equal(sweepOrphanedPreviews({ userDataDir: userData, trackedSiteDirs: [] }), 1, "only the entry actually removed is counted");
  assert.equal(readPreviewVersion({ userDataDir: userData, siteDir: "/sites/orphan" }), null);
  assert.ok(fs.statSync(stuck).isDirectory());
});

test("the boot sweep is a no-op on a first run, with no previews directory at all", () => {
  assert.equal(sweepOrphanedPreviews({ userDataDir: tempDir(), trackedSiteDirs: ["/sites/kept"] }), 0);
});

test("the boot sweep keeps every tracked site when nothing is orphaned", () => {
  // The dangerous direction: a sweep that deleted a live site's preview would blank its card until
  // the next start. Asserted explicitly rather than inferred from the orphan case.
  const userData = tempDir();
  const dirs = ["/sites/a", "/sites/b", "/sites/c"];
  for (const dir of dirs) writePreview({ userDataDir: userData, siteDir: dir, bytes: PNG });

  assert.equal(sweepOrphanedPreviews({ userDataDir: userData, trackedSiteDirs: dirs }), 0);
  for (const dir of dirs) assert.notEqual(readPreviewVersion({ userDataDir: userData, siteDir: dir }), null, `${dir} was swept`);
});

test("the sweep matches on the resolved digest, not the raw string it was handed", () => {
  // A tracked row spelled differently from the path the preview was written under must still count
  // as claimed — otherwise a sweep silently deletes a live site's thumbnail every boot.
  const userData = tempDir();
  writePreview({ userDataDir: userData, siteDir: "/sites/example", bytes: PNG });
  assert.equal(sweepOrphanedPreviews({ userDataDir: userData, trackedSiteDirs: ["/sites/other/../example"] }), 0);
  assert.notEqual(readPreviewVersion({ userDataDir: userData, siteDir: "/sites/example" }), null);
});
