import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("OAuth contracts have no Tovu ports forwarding shell", () => {
  assert.equal(fs.existsSync(new URL("../ports.ts", import.meta.url)), false);
});
