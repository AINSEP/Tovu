import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { observeTier2Success, observeTier2Timeout } from "../fixtures/extract-s6-g-plug-tier2-observe.js";

/**
 * @file EXTRACT-S6 G-plug item 4 with REAL workers: one tier-2 before-save call that succeeds, one
 * runaway call the real timeout stops, and the preview of each (a preview saves nothing and never
 * counts toward quarantine). Recorded once before any seam/move and frozen.
 *
 * Behavioral proof of the same paths stays in
 * `server/runtime/plugin-tier2/__tests__/tier2-runtime.integration.test.ts` ("built-in tier-2: enable
 * probes in a worker, save writes ext through a worker, preview saves nothing" and "built-in tier-2:
 * a looping filter is stopped by the timeout; previews fail without counting, saves quarantine");
 * this file pins the exact bytes of those outcomes.
 */

const FIXTURE = new URL("./extract-s6-g-plug.tier2.golden.json", import.meta.url);
const FIXTURE_SHA256 = "a31f6574887d0db308446ba8d9fb793520d06a7608c5608f1221c619266a9768";
const frozenBytes = readFileSync(FIXTURE, "utf8");
const frozen = JSON.parse(frozenBytes) as Record<string, unknown>;

test("G-plug tier-2 fixture: the frozen file is the recorded one (never regenerated)", () => {
  assert.equal(createHash("sha256").update(frozenBytes).digest("hex"), FIXTURE_SHA256);
});

const observed: Record<string, unknown> = {};

test("G-plug 4: a real-worker tier-2 call succeeds, saves ext, and its preview saves nothing", async () => {
  observed["success"] = await observeTier2Success();
  assert.deepStrictEqual(observed["success"], frozen["success"]);
});

test("G-plug 4: a runaway tier-2 call is stopped by the real timeout; the preview does not count, saves quarantine", async () => {
  observed["timeout"] = await observeTier2Timeout();
  assert.deepStrictEqual(observed["timeout"], frozen["timeout"]);
});

test("G-plug tier-2 fixture: the whole file is exactly the serialization of both observations", () => {
  assert.equal(`${JSON.stringify({ success: observed["success"], timeout: observed["timeout"] }, null, 2)}\n`, frozenBytes);
});
