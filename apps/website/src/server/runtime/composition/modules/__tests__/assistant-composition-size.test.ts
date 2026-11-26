import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

test("BYOK composition files each stay within 500 physical lines", () => {
  const files = readdirSync(new URL("../", import.meta.url)).filter(name => /^assistant-byok(?:-.*)?\.ts$/.test(name));
  assert.ok(files.includes("assistant-byok.ts"));
  for (const name of files) {
    const lines = readFileSync(new URL(`../${name}`, import.meta.url), "utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    assert.ok(lines.length <= 500, `${name}: ${lines.length} physical lines exceeds 500`);
  }
});

test("visitor composition files each stay within 500 physical lines", () => {
  const files = readdirSync(new URL("../", import.meta.url)).filter(name => /^site-assistant(?:-.*)?\.ts$/.test(name));
  assert.ok(files.includes("site-assistant.ts"));
  for (const file of files) {
    const lines = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    assert.ok(lines.length <= 500, `${file}: ${lines.length} physical lines exceeds 500`);
  }
});
