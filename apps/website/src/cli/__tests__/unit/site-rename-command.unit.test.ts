import assert from "node:assert/strict";
import test from "node:test";
import { runSiteRenameCommand } from "../../commands/site-rename.js";

test("rename forwards folder names and prints the committed paths, including Windows separators", async () => {
  const input = { oldName: "old-site", newName: "new-site" };
  const changed = { from: "C:\\Users\\owner\\Documents\\Tovu\\old-site", to: "C:\\Users\\owner\\Documents\\Tovu\\new-site" };
  const output: string[] = [];
  await runSiteRenameCommand(input, {
    rename: async (received) => { assert.deepEqual(received, input); return changed; },
    writeStdout: (text) => { output.push(text); },
  });
  assert.deepEqual(output, [`${JSON.stringify(changed)}\n`]);
});

test("a refused or rolled-back rename emits no success output", async () => {
  const error = new Error("Site is running");
  const output: string[] = [];
  await assert.rejects(runSiteRenameCommand({ oldName: "old", newName: "new" }, {
    rename: async () => { throw error; }, writeStdout: (text) => { output.push(text); },
  }), (actual) => actual === error);
  assert.deepEqual(output, []);
});
