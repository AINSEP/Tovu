import assert from "node:assert/strict";
import test from "node:test";
import { bindSearchPluginActivity } from "../after-assembly-forms-search.js";

// B211: activations are written per workspace; reading the site-level root left a disabled search
// provider plugin "active", so it kept receiving index writes and visitor queries.
test("a disabled search provider plugin gets no writes or queries: activation is read from the workspace root", async () => {
  const roots: string[] = [];
  const isActive = bindSearchPluginActivity({
    workspaceId: "ws-1",
    layout: { root: "/site", forWorkspace: ({ workspaceId }: { workspaceId: string }) => ({ root: `/site/workspaces/${workspaceId}` }) } as never,
    lifecycle: { resolveAgentPluginActivation: async ({ workspaceRoot }: { workspaceRoot: string }) => {
      roots.push(workspaceRoot);
      // Only the workspace folder holds the operator's "disabled" choice.
      return { verdict: workspaceRoot === "/site/workspaces/ws-1" ? "disabled" : "active" };
    } } as never,
  });
  assert.equal(await isActive({ pluginId: "algolia" }), false);
  assert.deepEqual(roots, ["/site/workspaces/ws-1"]);
});
