import assert from "node:assert/strict";
import test from "node:test";

import { isSiteSwitcherEnabled } from "../../site-switcher-enabled.js";

// F4.3/F7.2/F7.6: reject truthiness parsing; each input and the ambient env are owned here.
for (const raw of [undefined, "", " ", "0", "false", "yes", "on", "2", "true-ish"]) {
  test(`site switcher is off for ${JSON.stringify(raw)}`, () => {
    assert.equal(isSiteSwitcherEnabled(raw === undefined ? {} : { TOVU_ENABLE_SITE_SWITCHER: raw }), false);
  });
}
for (const raw of ["1", "true", " TRUE ", "\t1\n", "TrUe"]) {
  test(`site switcher is on for ${JSON.stringify(raw)}`, () => {
    assert.equal(isSiteSwitcherEnabled({ TOVU_ENABLE_SITE_SWITCHER: raw }), true);
  });
}

test("the default argument reads current process env on each call and an explicit env wins", () => {
  const previous = process.env.TOVU_ENABLE_SITE_SWITCHER;
  try {
    process.env.TOVU_ENABLE_SITE_SWITCHER = "1";
    assert.equal(isSiteSwitcherEnabled(), true);
    assert.equal(isSiteSwitcherEnabled({}), false);
    delete process.env.TOVU_ENABLE_SITE_SWITCHER;
    assert.equal(isSiteSwitcherEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.TOVU_ENABLE_SITE_SWITCHER;
    else process.env.TOVU_ENABLE_SITE_SWITCHER = previous;
  }
});
