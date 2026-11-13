import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { defaultPgliteSocketDir } from "../drivers/pglite-owner.js";

/** @file Tovu's socket-dir namespace over the shared Jini default: `~/.tovu/run/<key>`, else `/tmp/tovu-<uid>/<key>`. */

const dataDir = "/sites/example/pglite";

test("defaultPgliteSocketDir places the socket dir under the given home's .tovu/run namespace, keyed by data dir", () => {
  const dir = defaultPgliteSocketDir({ dataDir }, { home: "/home/alice" });

  assert.ok(dir.startsWith(join("/home/alice", ".tovu", "run") + "/"), dir);
  assert.equal(defaultPgliteSocketDir({ dataDir }, { home: "/home/alice" }), dir);
  assert.notEqual(defaultPgliteSocketDir({ dataDir: "/sites/other/pglite" }, { home: "/home/alice" }), dir);
});

test("defaultPgliteSocketDir without a home uses the OS home directory", () => {
  assert.equal(defaultPgliteSocketDir({ dataDir }), defaultPgliteSocketDir({ dataDir }, { home: homedir() }));
});

test("defaultPgliteSocketDir falls back to the per-user /tmp/tovu namespace when the home path would overflow a socket path", () => {
  const longHome = "/" + "h".repeat(200);
  const dir = defaultPgliteSocketDir({ dataDir }, { home: longHome });

  assert.ok(dir.startsWith("/tmp/tovu-"), dir);
  assert.equal(dir.split("/").pop(), defaultPgliteSocketDir({ dataDir }, { home: "/home/alice" }).split("/").pop());
});
