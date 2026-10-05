import assert from "node:assert/strict";
import test from "node:test";

import { buildUninstallConfirmationResource } from "../../uninstall-confirmation-ui.js";

test("a versionless plugin still names the plugin and all packages, with exact confirm and cancel correlation", () => {
  const ui = buildUninstallConfirmationResource({ preview: { pluginId: "vendor/plugin & tools", versions: [], archiveDigests: ["digest-a", "digest-b", "digest-c"] }, exchangeId: "exchange-b08", expiresAtMs: 1_300_000 });
  assert.equal(ui.resource.uri, "ui://tovu/agent-plugins-uninstall/vendor%2Fplugin%20%26%20tools");
  const html = ui.resource.text;
  assert.match(html, /<dt>Plugin<\/dt><dd>vendor\/plugin &amp; tools<\/dd>/);
  assert.match(html, /<dt>Packages removed<\/dt><dd>3<\/dd>/);
  assert.doesNotMatch(html, /<dt>Version<\/dt>/);
  assert.match(html, /There is no trash and no undo/);
  const match = html.match(/var PLAN = (.+);/);
  assert.ok(match);
  // F2.5/F4.1: the delivered actions, not an imported tool-id constant, are the oracle.
  assert.deepEqual(JSON.parse(match[1]), {
    confirm: { toolName: "plugins_uninstall", params: { __exchangeId: "exchange-b08", decision: "confirm" } },
    "delete-memory": { toolName: "plugins_uninstall", params: { __exchangeId: "exchange-b08", decision: "confirm", choice: "delete-memory" } },
    cancel: { toolName: "plugins_uninstall", params: { __exchangeId: "exchange-b08", decision: "cancel" } },
  });
  // F1.3/F2.5: removing the alternative or attaching its choice to ordinary confirm must fail.
  assert.match(html, /<button[^>]*data-mcpui-action="delete-memory"[^>]*>Uninstall and delete memory<\/button>/);
  assert.match(html, /<button[^>]*data-mcpui-action="confirm"[^>]*>Uninstall · keep memory<\/button>/);
});

test("all declared versions are displayed in the version detail", () => {
  const ui = buildUninstallConfirmationResource({ preview: { pluginId: "plugin", versions: ["1.2.0", "2.4.0"], archiveDigests: ["a", "b"] }, exchangeId: "exchange", expiresAtMs: 1_300_000 });
  assert.match(ui.resource.text, /<dt>Version<\/dt><dd>1\.2\.0, 2\.4\.0<\/dd>/);
});

test("the two memory choices are in the operator's admin language when one is given", () => {
  const html = buildUninstallConfirmationResource({ preview: { pluginId: "plugin", versions: [], archiveDigests: ["a"] }, exchangeId: "exchange", expiresAtMs: 1_300_000 }, { locale: "es" }).resource.text;
  assert.match(html, /<button[^>]*data-mcpui-action="confirm"[^>]*>Desinstalar · conservar memoria<\/button>/);
  assert.match(html, /<button[^>]*data-mcpui-action="delete-memory"[^>]*>Desinstalar y eliminar memoria<\/button>/);
});
