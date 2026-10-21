/** @file `readSiteName`: the window title is the site's configured name, else its folder name. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readSiteName } from "./site-name.ts";

test("uses config.json's non-blank name, read from the site folder on disk", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-name-"));
  try {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "Bakery" }));
    assert.equal(readSiteName({ siteDir: dir }), "Bakery");
    fs.writeFileSync(path.join(dir, "config.json"), "{not json");
    assert.equal(readSiteName({ siteDir: dir }), path.basename(dir));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(readSiteName({ siteDir: dir }), path.basename(dir));
});

test("falls back to the folder name for a blank, non-string or absent name", () => {
  const reads: string[] = [];
  for (const body of ['{"name":"   "}', '{"name":7}', "{}"]) {
    assert.equal(readSiteName({ siteDir: "/sites/my-shop" }, { readFile: (file) => { reads.push(file); return body; } }), "my-shop");
  }
  assert.deepEqual(reads, Array(3).fill(path.join("/sites/my-shop", "config.json")));
});
