import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { seededWorkspace } from "../../../apps/website/src/server/runtime/configuration/seed.js";

import { assertNoUndefinedProperties, generate } from "../generate-seed-content.js";

/**
 * @file Direct unit test for `generate-seed-content.ts`'s pure `generate()` function and its
 * `assertNoUndefinedProperties` guard — see that file's own header for why `generate()` is a pure,
 * side-effect-free export specifically so it is importable here without writing or drift-checking
 * the real checked-in `seed-content.json` as a side effect of the import.
 *
 * Two things this file exists to prove:
 *
 * 1. `generate()`'s own output still matches the checked-in file — this test IS the "this script's
 *    own unit test" that file's header comment refers to (Sol audit finding, LOW: that claim was
 *    false until this file existed — verified 0 prior references, 2026-08-21).
 *
 * 2. `assertNoUndefinedProperties` closes a narrow false-pass class in `--check` (Sol audit
 *    finding, LOW): `JSON.stringify` silently drops any own-enumerable property whose value is
 *    `undefined` (this repo does not set `exactOptionalPropertyTypes`), so changing a seeded post
 *    from omitting a property entirely to setting it to `undefined` produces byte-identical
 *    generated output — `--check` would pass while the live seed object and the parsed JSON differ
 *    structurally (`"ext" in post` disagrees; `Object.keys` disagrees). Relying on
 *    `read-template.unit.test.ts`'s deep-equality assertion to catch this instead is NOT a
 *    substitute: that test lives under the general `npm test`/`test:ci` suite, which CI runs only
 *    as an informational, `continue-on-error` step (see ci.yml's own "Test" step comment) — the
 *    ONLY step in this class that is actually a BLOCKING CI gate is `check:seed-content-drift`
 *    itself. `assertNoUndefinedProperties` makes that blocking gate fail loudly instead of passing
 *    silently on this input class.
 */

test("generate() output matches the checked-in seed-content.json (this IS the unit test generate-seed-content.ts's header comment refers to)", () => {
  const checkedInPath = path.resolve(
    import.meta.dirname,
    "../../../content/templates/starter/seed-content.json"
  );
  const checkedIn = fs.readFileSync(checkedInPath, "utf8");
  assert.equal(generate(), checkedIn);
});

test("assertNoUndefinedProperties throws on a top-level undefined-valued property, exact message", () => {
  assert.throws(
    () => assertNoUndefinedProperties({ id: "post-1", ext: undefined }, "seed content"),
    {
      message:
        "seed content: property '$.ext' is undefined -- JSON.stringify silently drops undefined-valued properties, which would make generated output byte-identical to a version WITHOUT this property and hide real structural drift from `--check`. Remove the property entirely instead of setting it to undefined.",
    }
  );
});

test("assertNoUndefinedProperties finds an undefined value nested inside an array of objects (the seeded-post shape)", () => {
  assert.throws(
    () =>
      assertNoUndefinedProperties(
        { entries: [{ id: "a" }, { id: "b", ext: undefined }] },
        "seed content"
      ),
    {
      message:
        "seed content: property '$.entries[1].ext' is undefined -- JSON.stringify silently drops undefined-valued properties, which would make generated output byte-identical to a version WITHOUT this property and hide real structural drift from `--check`. Remove the property entirely instead of setting it to undefined.",
    }
  );
});

test("assertNoUndefinedProperties does not throw when no property is undefined, including nested objects/arrays", () => {
  assert.doesNotThrow(() =>
    assertNoUndefinedProperties(
      { id: "post-1", nested: { a: 1, b: [1, 2, { c: 3 }] }, list: [null, "x"] },
      "seed content"
    )
  );
});

test("assertNoUndefinedProperties does not throw on the real generate() output (no undefined-valued property anywhere in the live seed data)", () => {
  assert.doesNotThrow(() => generate());
});

test("generate rejects undefined in its seed input before serialization can drop it", () => {
  const property = "auditUndefinedProbe";
  assert.equal(Object.hasOwn(seededWorkspace, property), false);
  Object.defineProperty(seededWorkspace, property, { value: undefined, enumerable: true, configurable: true });
  try {
    assert.throws(() => generate(), /property '\$\.workspace\.auditUndefinedProbe' is undefined/);
  } finally {
    Reflect.deleteProperty(seededWorkspace, property);
  }
});

test("CLI checks matching and drifting output without writing, then regenerates exact bytes", (t) => {
  const repo = path.resolve(import.meta.dirname, "../../..");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "seed-generator-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = path.join(root, "development/scripts/generate-seed-content.ts");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(path.join(repo, "development/scripts/generate-seed-content.ts"), script);
  for (const name of ["package.json", "tsconfig.json"]) fs.copyFileSync(path.join(repo, name), path.join(root, name));
  for (const name of ["apps", "node_modules"]) fs.symlinkSync(path.join(repo, name), path.join(root, name), "dir");
  const output = path.join(root, "content/templates/starter/seed-content.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const expected = fs.readFileSync(path.join(repo, "content/templates/starter/seed-content.json"), "utf8");
  fs.writeFileSync(output, expected);
  const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", script, ...args], { cwd: root, encoding: "utf8" });
  const matching = run("--check");
  assert.equal(matching.status, 0, matching.stderr);
  assert.equal(fs.readFileSync(output, "utf8"), expected);
  const drift = '{"fixture":"drift"}\n';
  fs.writeFileSync(output, drift);
  const mismatching = run("--check");
  assert.equal(mismatching.status, 1, mismatching.stderr);
  assert.match(mismatching.stderr, /DRIFT/);
  assert.equal(fs.readFileSync(output, "utf8"), drift);
  const written = run();
  assert.equal(written.status, 0, written.stderr);
  assert.equal(fs.readFileSync(output, "utf8"), expected);
  assert.equal(run("--check").status, 0);
});
