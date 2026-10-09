import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSitePreviewStore, sitePreviewRoot, type SitePreviewFs } from "../site-preview/site-preview-store.js";

/**
 * @file `site-preview-store.ts` — the admin Sites card preview cache. A real temp directory for the
 * happy path; an injected `fs` for each failure branch (no module mocks).
 */

function tempRoot(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "site-preview-store-")), "site-previews");
}

test("sitePreviewRoot is sites/.tovu/site-previews for a switcher binding and null for an install dir", () => {
  assert.equal(sitePreviewRoot({ binding: { dir: "/repo/sites/alpha", switcherCompatible: true } }), "/repo/sites/.tovu/site-previews");
  assert.equal(sitePreviewRoot({ binding: { dir: "/srv/site", switcherCompatible: false } }), null);
});

test("write then read and version round-trip through an atomic rename, creating the directory", () => {
  const root = tempRoot();
  const store = createSitePreviewStore({ root });
  assert.equal(store.version({ name: "alpha" }), null);
  assert.equal(store.read({ name: "alpha" }), null);
  const version = store.write({ name: "alpha", bytes: Buffer.from("jpeg-bytes") });
  assert.equal(typeof version, "number");
  assert.equal(store.version({ name: "alpha" }), version);
  assert.equal(store.read({ name: "alpha" })?.toString(), "jpeg-bytes");
  assert.deepEqual(fs.readdirSync(root), ["alpha.jpg"]);
});

test("a name that is not a site folder name never becomes a path", () => {
  const root = tempRoot();
  const touched: string[] = [];
  const spy = Object.fromEntries(["statSync", "readFileSync", "writeFileSync", "renameSync", "mkdirSync", "rmSync"]
    .map((key) => [key, () => { touched.push(key); throw new Error("touched"); }])) as unknown as SitePreviewFs;
  const store = createSitePreviewStore({ root }, { fs: spy });
  for (const name of ["../alpha", "Alpha", "", "a/b"]) {
    assert.equal(store.version({ name }), null);
    assert.equal(store.read({ name }), null);
    assert.equal(store.write({ name, bytes: Buffer.from("x") }), null);
  }
  assert.deepEqual(touched, []);
});

test("a failed write removes its temp file and reports null; a failed cleanup is swallowed", () => {
  const removed: string[] = [];
  const failing: SitePreviewFs = {
    ...fs,
    mkdirSync: (() => undefined) as SitePreviewFs["mkdirSync"],
    writeFileSync: () => {},
    renameSync: () => { throw new Error("EXDEV"); },
    rmSync: ((file: string) => { removed.push(file); throw new Error("EPERM"); }) as SitePreviewFs["rmSync"],
  };
  const store = createSitePreviewStore({ root: "/previews" }, { fs: failing, pid: 42 });
  assert.equal(store.write({ name: "alpha", bytes: Buffer.from("x") }), null);
  assert.deepEqual(removed, ["/previews/alpha.jpg.42.tmp"]);
});
