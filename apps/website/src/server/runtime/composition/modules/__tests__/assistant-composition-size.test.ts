import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("visitor composition files each stay within 500 physical lines", () => {
  for (const file of ["site-assistant.ts", "site-assistant-preflight.ts", "site-assistant-turn.ts"]) {
    const lines = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    assert.ok(lines.length <= 500, `${file}: ${lines.length} physical lines exceeds 500`);
  }
});
