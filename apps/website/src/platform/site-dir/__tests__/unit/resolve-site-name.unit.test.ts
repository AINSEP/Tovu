import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { resolveSiteName } from "../../init-site.js";

/** L11 Stryker: `trimmed.length === 0 || > MAX_NAME_LENGTH` (L115) — every condition survived. */
const refusal = { name: "ValidationError", message: "initSite: --name must be 1..200 chars after trim" };

test("an omitted name falls back to the target folder's basename", () => {
  assert.equal(resolveSiteName("/sites/my-site", undefined), "my-site");
});

test("a provided name is trimmed and accepted from 1 to 200 characters", () => {
  assert.equal(resolveSiteName("/sites/x", "  Acme  "), "Acme");
  assert.equal(resolveSiteName("/sites/x", "a"), "a");
  assert.equal(resolveSiteName("/sites/x", "b".repeat(200)), "b".repeat(200));
  assert.equal(resolveSiteName("/sites/x", ` ${"c".repeat(200)}\n`), "c".repeat(200), "surrounding whitespace does not count");
});

test("an empty, whitespace-only or over-long name is refused, never silently replaced by the folder name", () => {
  for (const name of ["", "   ", "\n\t", "d".repeat(201), ` ${"e".repeat(201)} `]) {
    assert.throws(() => resolveSiteName("/sites/x", name), refusal, JSON.stringify(name.slice(0, 10)));
  }
});
