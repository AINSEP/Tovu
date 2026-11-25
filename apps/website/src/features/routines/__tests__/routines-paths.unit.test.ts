import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { routinesPaths } from "../routines-paths.js";

/**
 * @file `routinesPaths`: the routine sidecar DB and beacon follow the ACTUAL content path into
 * `ops/`, including relocated content (`data.nosync`), never a guessed `<siteDir>/content.db`.
 */

test("routine files live in ops/ beside the content database", () => {
  const contentDbPath = path.join("/sites", "demo", "content.db");
  assert.deepEqual(routinesPaths({ contentDbPath }), {
    dir: path.join("/sites", "demo", "ops"),
    db: path.join("/sites", "demo", "ops", "routines.db"),
    beacon: path.join("/sites", "demo", "ops", "routines-beacon.json"),
  });
});

test("relocated content keeps routine files beside the relocated database", () => {
  const contentDbPath = path.join("/sites", "demo", "data.nosync", "content.db");
  const paths = routinesPaths({ contentDbPath });
  assert.equal(paths.db, path.join("/sites", "demo", "data.nosync", "ops", "routines.db"));
  assert.equal(paths.beacon, path.join("/sites", "demo", "data.nosync", "ops", "routines-beacon.json"));
});
