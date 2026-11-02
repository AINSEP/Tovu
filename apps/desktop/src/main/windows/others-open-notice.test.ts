/**
 * @file `others-open-notice.ts`: the "close the other copies first" notice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { othersOpenNotice } from "./others-open-notice.ts";

test("one other copy: singular wording", () => {
  assert.deepEqual(othersOpenNotice({ count: 1 }), {
    type: "info",
    message: "Close the other copies of Tovu first",
    detail: "1 other copy is open. The update installs when the last one quits.",
  });
});

test("several other copies: plural verb and the count", () => {
  // Pins today's text, defect included ("copys"); a wording fix updates this test on purpose.
  for (const count of [2, 3, 0]) {
    assert.equal(othersOpenNotice({ count }).detail, `${count} other copys are open. The update installs when the last one quits.`);
  }
});
