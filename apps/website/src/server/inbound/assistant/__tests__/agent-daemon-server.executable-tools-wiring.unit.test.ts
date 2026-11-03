/** ADR-070: executable plugins and their confirmation parks live on the same server surface.
 * The daemon keeps only the local frontend exchange store. Public callback delivery already tries
 * the server-owned store before forwarding local UI answers to the daemon.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { daemonSource } from "./helpers/daemon-source.js";

const serverSurface = readFileSync(new URL("../../../../assistant/byok-tool-surface.ts", import.meta.url), "utf8");
const serverModule = readFileSync(new URL("../../../runtime/composition/modules/assistant-byok.ts", import.meta.url), "utf8");

test("server executable plugin tools share the server's confirmation store", () => {
  assert.match(serverSurface, /surfaces:\s*\{\s*surfaceExchanges\s*\}/);
  assert.match(serverSurface, /surfaceExchanges,\s*\n\s*executeMetaTool/);
  assert.match(serverModule, /surfaces:\s*\{\s*surfaceExchanges:\s*resolvedToolSurface\.surfaceExchanges\s*\}/);
  assert.match(serverModule, /registry\.register\(automaticPluginRuns\.loadRegistration\)/);
  const daemon = daemonSource.statements.map(statement => statement.getText(daemonSource)).join("\n");
  assert.equal(daemon.includes("attachAssistantToolExtensions"), false);
  assert.match(daemon, /registerMcpUiToolCallsRoute\(app, \{ toolExecutor, surfaceExchanges \}\)/);
});
