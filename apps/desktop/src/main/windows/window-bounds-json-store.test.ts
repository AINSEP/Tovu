/**
 * @file `window-bounds-json-store.ts`: the real JSON file round trip behind the sites home window's
 * saved bounds (moved here with the store when Jini's duplicate `shell/window-bounds-store` was retired).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readWindowBounds, sitesHomeBoundsPath, writeWindowBounds } from "./window-bounds-json-store.ts";

/** A fresh scratch `userData`-like directory per test, cleaned up after. */
function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-window-bounds-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("sitesHomeBoundsPath keeps the window-bounds.json name earlier launches wrote", () => {
  assert.equal(sitesHomeBoundsPath({ userDataDir: "/x/userData" }), path.join("/x/userData", "window-bounds.json"));
});

test("readWindowBounds: null when the file does not exist yet", () => {
  withTempDir((dir) => assert.equal(readWindowBounds({ boundsPath: sitesHomeBoundsPath({ userDataDir: dir }) }), null));
});

test("writeWindowBounds then readWindowBounds round-trips exactly", () => {
  withTempDir((dir) => {
    const boundsPath = sitesHomeBoundsPath({ userDataDir: dir });
    writeWindowBounds({ boundsPath, bounds: { x: 120, y: 80, width: 1360, height: 900 } });
    assert.deepEqual(readWindowBounds({ boundsPath }), { x: 120, y: 80, width: 1360, height: 900 });
  });
});

test("readWindowBounds: null for malformed JSON, a non-object, or a missing/non-finite field", () => {
  withTempDir((dir) => {
    const boundsPath = sitesHomeBoundsPath({ userDataDir: dir });
    for (const [body, why] of [["not json", "malformed JSON"], ["42", "a non-object"],
      [JSON.stringify({ x: 0, y: 0, width: 800 }), "missing height"], ['{"x":0,"y":0,"width":1e999,"height":900}', "a non-finite field"]]) {
      fs.writeFileSync(boundsPath, body!);
      assert.equal(readWindowBounds({ boundsPath }), null, why);
    }
  });
});

test("writeWindowBounds creates the userData dir if it does not exist yet", () => {
  withTempDir((dir) => {
    const boundsPath = sitesHomeBoundsPath({ userDataDir: path.join(dir, "not-yet-created") });
    writeWindowBounds({ boundsPath, bounds: { x: 0, y: 0, width: 800, height: 600 } });
    assert.deepEqual(JSON.parse(fs.readFileSync(boundsPath, "utf8")), { x: 0, y: 0, width: 800, height: 600 });
  });
});
