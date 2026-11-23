/**
 * @file Coverage for `window-bounds-file.ts`: the host's `window-bounds.json` location and JSON store,
 * bound to Jini's bounds read/write (whose on-screen decision `sites-home-window.test.ts` and Jini's
 * own `electron/usability` tests cover).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readWindowBounds, windowBoundsFilePath, writeWindowBounds } from "./window-bounds-file.ts";
import type { WindowBounds } from "@jini-ai/desktop-host/electron/usability";

/** A fresh scratch `userData`-like directory per test, cleaned up after. */
function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-window-bounds-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("windowBoundsFilePath names window-bounds.json under the given userData dir", () => {
  assert.equal(windowBoundsFilePath({ userDataDir: "/x/userData" }), path.join("/x/userData", "window-bounds.json"));
});

test("readWindowBounds: null when the file does not exist yet", () => {
  withTempDir((dir) => {
    assert.equal(readWindowBounds({ boundsPath: windowBoundsFilePath({ userDataDir: dir }) }), null);
  });
});

test("writeWindowBounds then readWindowBounds round-trips exactly", () => {
  withTempDir((dir) => {
    const boundsPath = windowBoundsFilePath({ userDataDir: dir });
    const bounds: WindowBounds = { x: 120, y: 80, width: 1360, height: 900 };
    writeWindowBounds({ boundsPath, bounds });
    assert.deepEqual(readWindowBounds({ boundsPath }), bounds);
  });
});

test("writeWindowBounds stores pretty-printed JSON, the file format earlier launches wrote", () => {
  withTempDir((dir) => {
    const boundsPath = windowBoundsFilePath({ userDataDir: dir });
    writeWindowBounds({ boundsPath, bounds: { x: 1, y: 2, width: 800, height: 600 } });
    assert.equal(fs.readFileSync(boundsPath, "utf8"), JSON.stringify({ x: 1, y: 2, width: 800, height: 600 }, null, 2));
  });
});

test("readWindowBounds: null for malformed JSON, a non-object, or a missing/non-finite field", () => {
  withTempDir((dir) => {
    const boundsPath = windowBoundsFilePath({ userDataDir: dir });
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(boundsPath, "not json");
    assert.equal(readWindowBounds({ boundsPath }), null, "malformed JSON");

    fs.writeFileSync(boundsPath, "42");
    assert.equal(readWindowBounds({ boundsPath }), null, "a non-object");

    fs.writeFileSync(boundsPath, JSON.stringify({ x: 0, y: 0, width: 800 }));
    assert.equal(readWindowBounds({ boundsPath }), null, "missing height");

    fs.writeFileSync(boundsPath, JSON.stringify({ x: 0, y: 0, width: Infinity, height: 900 }));
    assert.equal(readWindowBounds({ boundsPath }), null, "a non-finite field");
  });
});

test("writeWindowBounds creates the userData dir if it does not exist yet", () => {
  withTempDir((dir) => {
    const nested = path.join(dir, "not-yet-created");
    const boundsPath = windowBoundsFilePath({ userDataDir: nested });
    writeWindowBounds({ boundsPath, bounds: { x: 0, y: 0, width: 800, height: 600 } });
    assert.deepEqual(readWindowBounds({ boundsPath }), { x: 0, y: 0, width: 800, height: 600 });
  });
});
