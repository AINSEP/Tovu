import assert from "node:assert/strict";
import test from "node:test";
import { buildUninstallConfirmationResource } from "../../uninstall-confirmation-ui.js";

test("site plugin uninstall surface encodes both decisions for plugins_uninstall with the exact exchange", () => {
  const resource = buildUninstallConfirmationResource({ preview: { pluginId: "site/x", name: "Site Plugin", version: "3.2.1" }, exchangeId: "uninstall-42" });
  assert.equal(resource.resource.uri, "ui://tovu/plugins-uninstall/site%2Fx");
  const html = resource.resource.text;
  assert.ok(html);
  assert.equal(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1], "Move Site Plugin to trash?");
  const match = html.match(/var PLAN = (.*);/);
  assert.ok(match);
  const plan = JSON.parse(match[1]);
  assert.deepEqual(plan.confirm, { toolName: "plugins_uninstall", params: { __exchangeId: "uninstall-42", decision: "confirm" } });
  assert.deepEqual(plan.cancel, { toolName: "plugins_uninstall", params: { __exchangeId: "uninstall-42", decision: "cancel" } });
  assert.ok(html.includes("all workspaces on this site"));
  assert.ok(html.includes("version 3.2.1"));
  assert.ok(html.includes("Trash for 60 days"));
});
