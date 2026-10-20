/**
 * @file Wiring pin for the daemon's executable Agent Plugin tools (C4b). Reads the SOURCE of
 * `agent-daemon-server.ts` rather than importing it, like the other `agent-daemon-server.*-wiring`
 * tests next to this file: importing it opens a real SQLite connection and binds a real port, so no
 * in-process test can execute its `start()`; the line is measured as not loaded by any test.
 *
 * The fact pinned: the confirmation transport the installed-extension registrar hands executable
 * plugin tools is the SAME module-level exchange store the daemon's MCP-UI callback route delivers
 * answers to. A second store would show a card whose Confirm can never reach the parked call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

function indexOfOrFail(needle: string, from = 0): number {
  const index = SOURCE.indexOf(needle, from);
  assert.ok(index > -1, `anchor must still exist verbatim: ${needle}`);
  return index;
}

test("executable plugin tools get the daemon's one exchange store, the one the MCP-UI callback route answers", () => {
  assert.equal(SOURCE.match(/createSurfaceExchangeStore\(/g)?.length, 1, "exactly one exchange store in the daemon");
  assert.match(SOURCE, /^const surfaceExchanges = createSurfaceExchangeStore\(/m);
  assert.match(SOURCE, /registerMcpUiToolCallsRoute\(app, \{ toolExecutor, surfaceExchanges \}\);/);
  const attach = indexOfOrFail("const extensions = attachAssistantToolExtensions(");
  const call = SOURCE.slice(attach, indexOfOrFail("registerInstalled: registerInstalledExtensionTools,", attach));
  assert.match(call, /\n\s+surfaces: \{ surfaceExchanges \},\n/, "the registrar's deps carry that store as `surfaces`");
});
