import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { observeAdminDto, observeCapabilityTools, observeDeclarativeEnable, observePluginsTools } from "../fixtures/extract-s6-g-plug-observe.js";

/**
 * @file EXTRACT-S6 G-plug golden: the plugin tool, capability tool, declarative enable and admin DTO
 * behavior of the pinned tree, recorded ONCE before any L1 seam or move and frozen. A later seam is
 * correct only if these observers still reproduce the committed fixture byte for byte.
 *
 * The fixture is never regenerated: its SHA-256 is pinned below, so an edited fixture fails here
 * even if the observed behavior was changed to match it. Coverage map:
 * `cloud/reports/extract-s6/g-plug-inventory.md`.
 */

const FIXTURE = new URL("./extract-s6-g-plug.golden.json", import.meta.url);
const FIXTURE_SHA256 = "6fd502d4676ca2eaa0c873ba55f2f3d5268db72e3b218d38290c088d060b347a";
const frozenBytes = readFileSync(FIXTURE, "utf8");
const frozen = JSON.parse(frozenBytes) as Record<string, unknown>;

function serialized(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

test("G-plug fixture: the frozen file is the recorded one (never regenerated)", () => {
  assert.equal(createHash("sha256").update(frozenBytes).digest("hex"), FIXTURE_SHA256);
});

test("G-plug 1: plugins_* catalog, descriptors, approval copy, results and refusals are unchanged", async () => {
  const observed = await observePluginsTools();
  assert.deepStrictEqual(observed, frozen["pluginsTools"]);
  assert.equal(serialized(observed), serialized(frozen["pluginsTools"]));
});

test("G-plug 2: capability tool ids, descriptions, schema, gate and call results are unchanged", async () => {
  const observed = await observeCapabilityTools();
  assert.deepStrictEqual(observed, frozen["capabilityTools"]);
  assert.equal(serialized(observed), serialized(frozen["capabilityTools"]));
});

test("G-plug 3: declarative enable create/keep/conflict/tombstone and lost-race winners are unchanged", async () => {
  const observed = await observeDeclarativeEnable();
  assert.deepStrictEqual(observed, frozen["declarativeEnable"]);
  assert.equal(serialized(observed), serialized(frozen["declarativeEnable"]));
});

test("G-plug 5: the admin plugin DTO envelope is unchanged", () => {
  const observed = observeAdminDto();
  assert.deepStrictEqual(observed, frozen["adminDto"]);
  assert.equal(serialized(observed), serialized(frozen["adminDto"]));
});

test("G-plug fixture: the whole file is exactly the serialization of every observer", async () => {
  const all = { pluginsTools: await observePluginsTools(), capabilityTools: await observeCapabilityTools(), declarativeEnable: await observeDeclarativeEnable(), adminDto: observeAdminDto() };
  assert.equal(`${serialized(all)}\n`, frozenBytes);
});
