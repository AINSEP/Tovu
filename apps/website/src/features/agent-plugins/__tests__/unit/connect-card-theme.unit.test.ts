import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentPluginConnectCard } from "../../connect-card-ui.js";

/**
 * @file Regression (e90162791): the connected card wore a hard-coded orange instead of the admin's
 * theme. Its builder passed literal `--jini-mcpui-*` tokens, emitted as a `:root:root` rule that
 * outranks the host-theme `:root` rule `@jini-ai/ui`'s McpUiHost writes into every surface.
 */
test("the connected card sets no palette of its own, so the host theme wins", () => {
  const html = buildAgentPluginConnectCard({
    pluginId: "supabase",
    pluginDisplayName: "Supabase",
    state: "connected",
  }).resource.text as string;
  assert.match(html, /data-state="done">Connected ✓<\/p>/);

  assert.doesNotMatch(html, /:root:root/);
  // Colour literals may only appear in the shared default token block the host theme overrides.
  const afterDefaults = html.replace(/:root \{[^}]*\}/, "");
  assert.doesNotMatch(afterDefaults, /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/i);
});
