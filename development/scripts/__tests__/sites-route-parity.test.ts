/** Job C: the persisted Sites route mapping follows the folded content_read.site card. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyParity, hasProblems, type ParityFile } from "../lib/route-tool-parity.js";

test("Sites list route resolves through content_read.site without an unknown-tool parity error", async () => {
  const route = "GET /api/admin/v1/workspaces/:workspaceId/system/sites";
  const file = JSON.parse(await readFile(new URL("../../parity/route-tool-parity.json", import.meta.url), "utf8")) as ParityFile;
  const entry = file.routes[route];
  assert.deepEqual(entry, { tools: ["content_read.site"] });
  const report = classifyParity({
    routes: [{ method: "GET", path: "/api/admin/v1/workspaces/:workspaceId/system/sites" }],
    toolIds: new Set(["content_read.site"]), file: { routes: { [route]: entry } },
  });
  assert.deepEqual(report.covered, [route]);
  assert.deepEqual(report.unknownToolIds, []);
  assert.equal(hasProblems(report), false);
});
