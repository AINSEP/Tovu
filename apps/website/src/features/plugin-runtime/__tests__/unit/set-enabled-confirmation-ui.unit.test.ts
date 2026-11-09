import { renderHumanApproval } from "../../../../__tests__/support/render-human-approval.js";
import assert from "node:assert/strict";
import test from "node:test";
import { describeEnableApproval } from "../../tool-registrations.js";

// Adapter contract (F1.1/F2.5/F2.6): run the real renderer, then read its actual action payload.
for (const family of ["agent-plugin", "site-runtime"] as const) {
  test(`${family} enable surface encodes identity and both callback requests for the held exchange`, async () => {
    const resource = await renderHumanApproval({ spec: describeEnableApproval({ subject: { family, pluginId: "tools/x ?", label: "A <B>", version: "2.7.0" } }), exchangeId: "exchange-42" });
    assert.equal(resource.resource.uri, "ui://tovu/plugins-set-enabled/exchange-42");
    const html = resource.resource.text;
    assert.ok(html);
    assert.equal(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1], "Enable A &lt;B&gt;?");
    const match = html.match(/var PLAN = (.*);/);
    assert.ok(match);
    const plan = JSON.parse(match[1]);
    assert.deepEqual(plan.confirm, { toolName: "plugins_set_enabled", params: { __exchangeId: "exchange-42", decision: "confirm" } });
    assert.deepEqual(plan.cancel, { toolName: "plugins_set_enabled", params: { __exchangeId: "exchange-42", decision: "cancel" } });
    // The family-specific warning is a promised fragment of the resource, not a loose identity match.
    assert.ok(html.includes(family === "agent-plugin"
      ? "guidance and tools"
      : "change its database"));
    assert.doesNotMatch(html, /injects|daemon|six assistant execution settings/);
    assert.match(html, /Only the listed access is turned on/, "plain language must retain the access disclosure");
    assert.ok(html.includes("<dt>Version</dt><dd>2.7.0</dd>"));
  });
}
test("id-only enable surface names the id and omits an absent Version detail", async () => {
  const resource = await renderHumanApproval({ spec: describeEnableApproval({ subject: { family: "agent-plugin", pluginId: "bare-plugin" } }), exchangeId: "bare-exchange" });
  const html = resource.resource.text;
  assert.ok(html);
  assert.equal(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1], "Enable bare-plugin?");
  assert.ok(!html.includes("<dt>Version</dt>"));
  assert.equal(resource.resource.uri, "ui://tovu/plugins-set-enabled/bare-exchange");
});

const scope = { personId: "owner", siteId: "site-1" };
const bodyText = (html: string) => html.slice(html.indexOf("<body")).replace(/<(script|style)[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, " ");

test("an agent plugin card names the plugin once, hides the developer rows and explains in a neutral note", async () => {
  const resource = await renderHumanApproval({ spec: describeEnableApproval({ subject: { family: "agent-plugin", pluginId: "composio", adds: ["mail.send"], resources: [{ id: "mcp:gmail", label: "Gmail", previous: null, proposed: { access: "send" }, revision: null }] }, scope }), exchangeId: "e1" });
  const html = resource.resource.text!;
  const text = bodyText(html);
  assert.equal(text.match(/composio/g)?.length, 1, "the plugin name is the title only");
  assert.doesNotMatch(text, /Family|Capabilities|agent-plugin/);
  assert.match(text, /Adds/);
  assert.match(text, /mail\.send/, "what is turned on is still stated");
  assert.match(text, /Gmail/, "another resource the plugin gets is still disclosed");
  assert.match(html, /class="mcpui-notice"[^>]*>[^<]*guidance and tools/);
  assert.doesNotMatch(html, /class="mcpui-warning"/);
});

test("a site plugin keeps its red warning for full server access", async () => {
  const resource = await renderHumanApproval({ spec: describeEnableApproval({ subject: { family: "site-runtime", pluginId: "shop" } }), exchangeId: "e2" });
  assert.match(resource.resource.text!, /class="mcpui-warning">[^<]*change its database/);
});
