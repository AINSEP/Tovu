import assert from "node:assert/strict";
import test from "node:test";

import { decodePublishCriteriaFromQuery } from "../criteria.js";

test("query decoder rejects runtime non-string arguments before reading their length", () => {
  for (const raw of [undefined, null, 0, false, {}, []]) {
    assert.equal(Reflect.apply(decodePublishCriteriaFromQuery, undefined, [raw]), null);
  }
});

test("query decoder accepts exactly 4000 raw characters and rejects empty or longer values", () => {
  assert.equal(decodePublishCriteriaFromQuery(""), null);
  assert.deepEqual(decodePublishCriteriaFromQuery(" ".repeat(3998) + "{}"), {});
  assert.equal(decodePublishCriteriaFromQuery(" ".repeat(3999) + "{}"), null);
});

test("query decoder returns null for URI failures, JSON failures, and every non-object JSON shape", () => {
  for (const raw of ["%", "%E0%A4%A", "{", "undefined", "null", "[]", '"page"', "42", "true"]) {
    assert.equal(decodePublishCriteriaFromQuery(raw), null, raw);
  }
});

test("query decoder omits absent, malformed, and wholly invalid lists and non-true overwrite", () => {
  for (const payload of [
    {},
    { types: null, items: "About", overwrite: false },
    { types: {}, items: 42, overwrite: "true" },
    { types: [], items: [null, false, "", "x".repeat(201)], overwrite: 1 },
  ]) {
    assert.deepEqual(decodePublishCriteriaFromQuery(encodeURIComponent(JSON.stringify(payload))), {});
  }
});

test("query decoder preserves list spelling, whitespace, duplicates, and the 200-character boundary", () => {
  const payload = {
    types: [" Pages ", "menu", "menu"],
    items: [" ", "About", "x".repeat(200)],
    overwrite: true,
  };
  assert.deepEqual(decodePublishCriteriaFromQuery(encodeURIComponent(JSON.stringify(payload))), payload);
});

test("query decoder filters invalid entries before keeping the first 50 valid entries in each list", () => {
  const valid = Array.from({ length: 51 }, (_, i) => `v${i}`);
  const mixed = [null, "", 42, ...valid];
  const raw = encodeURIComponent(JSON.stringify({ types: mixed, items: mixed, overwrite: true, extra: true }));
  assert.deepEqual(decodePublishCriteriaFromQuery(raw), {
    types: valid.slice(0, 50),
    items: valid.slice(0, 50),
    overwrite: true,
  });
});
