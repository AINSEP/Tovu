import assert from "node:assert/strict";
import test from "node:test";

import { agentPluginOverlaysDir } from "../../host-overlays-dir.js";
import { agentPluginOverlaysDir as sitePathsOverlaysDir } from "#src/server/runtime/composition/site-paths";

// The overlay formatter itself is Jini's (`@jini-ai/agent-plugins/site/host-plugin-guidance`); only the product's
// directory binding stays here.
test("the overlays directory honors TOVU_AGENT_PLUGIN_OVERLAYS_DIR, defaults to the product's content tree, and site-paths re-exports the same resolver", () => {
  assert.equal(agentPluginOverlaysDir({}, { env: { TOVU_AGENT_PLUGIN_OVERLAYS_DIR: "/srv/overlays" } }), "/srv/overlays");
  assert.match(agentPluginOverlaysDir({}, { env: {} }), /[/\\]content[/\\]agent-plugin-overlays$/);
  assert.equal(sitePathsOverlaysDir, agentPluginOverlaysDir);
});
