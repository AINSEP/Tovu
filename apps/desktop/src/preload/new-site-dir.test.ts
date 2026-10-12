/** Check the real preload method with an injected IPC port, without importing Electron. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("./preload.mts", import.meta.url), "utf8");

test("destination preview forwards the exact name over the read-only channel", async () => {
  const parsed = ts.createSourceFile("preload.mts", source, ts.ScriptTarget.Latest, true);
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(parsed) === "planNewDir") initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(initializer, "the real preload must expose destination planning");
  const compiled = ts.transpileModule(`const plan = ${initializer.getText(parsed)};`, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText;
  const calls: unknown[][] = [];
  const answer = { path: "/sites/corner-bakery-2", homeDir: "/Users/la" };
  const ipcRenderer = { invoke: async (...args: unknown[]) => { calls.push(args); return answer; } };
  const { SITE_IPC_CHANNELS } = await import("../contracts/project.ts");
  const plan = new Function("ipcRenderer", "SITE_IPC_CHANNELS", compiled + "return plan;")(ipcRenderer, SITE_IPC_CHANNELS) as (input: { name: string }) => Promise<typeof answer>;
  const input = { name: "Corner Bakery" };
  assert.equal(await plan(input), answer);
  assert.deepEqual(calls, [["runner:sites:plan-new-dir", input]]);
});
