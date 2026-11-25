import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/** Files allowed to import the restore flow: the flow's own modules and the storage CLI. */
const ALLOWED = new Set([
  "features/storage/compaction-recovery.ts",
  "features/storage/compaction-recovery-ports.ts",
  "features/storage/compaction-recovery.types.ts",
  "cli/commands/storage-maintenance.ts",
  "cli/program.ts",
]);

test("compaction-recovery is imported only by the storage CLI", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const importers: string[] = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== "__tests__" && entry.name !== "node_modules") pending.push(file);
      if (entry.isFile() && /\.(ts|tsx|mts)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && /compaction-recovery/.test(readFileSync(file, "utf8"))) {
        importers.push(path.relative(root, file).split(path.sep).join("/"));
      }
    }
  }
  // The server and boot graph never reach it: a restore replaces a live database file.
  assert.deepEqual(importers.filter((file) => !ALLOWED.has(file)), []);
});
