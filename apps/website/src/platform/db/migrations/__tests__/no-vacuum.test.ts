import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("no migration performs vacuum", () => {
  const pending = [path.resolve(import.meta.dirname, "..")];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== "__tests__") pending.push(file);
      if (entry.isFile() && entry.name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(entry.name)) {
        assert.doesNotMatch(readFileSync(file, "utf8"), /\bvacuum\b|auto_vacuum/i, file);
      }
    }
  }
});
