/** ADR-070: executable plugins and their confirmation parks live on the same server surface.
 * The daemon keeps only the local frontend exchange store. Public callback delivery already tries
 * the server-owned store before forwarding local UI answers to the daemon.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { daemonManifest, statementsFor } from "./helpers/daemon-source.js";

const serverSurface = readFileSync(new URL("../../../../assistant/byok-tool-surface.ts", import.meta.url), "utf8");
const serverModule = readFileSync(new URL("../../../runtime/composition/modules/assistant-byok.ts", import.meta.url), "utf8");

test("server executable plugin tools share the server's confirmation store", () => {
  assert.match(serverSurface, /surfaces:\s*\{\s*surfaceExchanges\s*\}/);
  assert.match(serverSurface, /surfaceExchanges,\s*\n\s*executeMetaTool/);
  assert.match(serverModule, /surfaces:\s*\{\s*surfaceExchanges:\s*resolvedToolSurface\.surfaceExchanges,\s*assertAccessApprover:\s*createAccessApprover\(routeDeps\)\s*\}/);
  // The run controller is reached through an accessor (`automaticPluginRuns()`) since 8761768b1: the surface
  // is built before the controller (the controller needs the surface's exchange store), so the hook must
  // read the controller lazily, at the awaited extension pass, rather than capture it by value.
  assert.match(serverModule, /registry\.register\(automaticPluginRuns\(\)\.loadRegistration\)/);
  const daemon = [...daemonManifest.values()].flatMap(bodies => bodies.get("<file>") ?? []).map(statement => statement.getText(statement.getSourceFile())).join("\n");
  assert.equal(daemon.includes("attachAssistantToolExtensions"), false);
  // The MCP-UI callback route is mounted by `mountSurfaceRoutes` (agent-daemon-scope-http.ts, split out of the
  // old single-file scope in b533ee19f; the `(app, deps)` call became `({ app, deps })` in 3df93bd18). Pin it on
  // that function's own body, and pin that `createScopeApp` actually calls it, so a dead helper cannot satisfy this.
  const surfaceRoutes = statementsFor("agent-daemon-scope-http.ts", "mountSurfaceRoutes").map(statement => statement.getText(statement.getSourceFile())).join("\n");
  assert.match(surfaceRoutes, /registerMcpUiToolCallsRoute\(\{ app, deps: \{ toolExecutor, surfaceExchanges, scheduler: nodeIntervalScheduler \} \}\)/);
  const scopeApp = statementsFor("agent-daemon-scope-http.ts", "createScopeApp").map(statement => statement.getText(statement.getSourceFile())).join("\n");
  assert.match(scopeApp, /mountSurfaceRoutes\(ports\)/);
});
