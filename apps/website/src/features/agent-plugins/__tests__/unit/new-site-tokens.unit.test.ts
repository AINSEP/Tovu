import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import {
  describeNewSiteTokenRefusal,
  firstNewSiteTokenRefusal,
  listBundledAgentPluginServers,
  NEW_SITE_TOKENS_SHAPE_ERROR,
  parseNewSiteAgentPluginTokens,
  resolveBundledAgentPlugin,
} from "../../new-site-tokens.js";
import { listTokenSignInPlugins } from "../../token-sign-in.js";

/**
 * @file `new-site-tokens.ts`: the create-time token rules the admin route and `tovu init` share —
 * shape, refusal messages, and reading the bundled plugins a new site will get.
 */

const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

let root: string;

function writePlugin(dirName: string, name: string, mcp: unknown): void {
  const dir = path.join(root, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name, version: "1.0.0" }));
  fs.writeFileSync(path.join(dir, "mcp.json"), JSON.stringify({ $schema: MCP_SCHEMA, ...(mcp as object) }));
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "new-site-tokens-"));
  writePlugin("supabase", "supabase", {
    mcpServers: {
      supabase: {
        type: "streamable-http",
        url: "https://mcp.supabase.com/mcp",
        tovuTokenAuth: { helpUrl: "https://supabase.com/dashboard/account/tokens", probeUrl: "https://api.supabase.com/v1/projects" },
      },
    },
  });
  writePlugin("plain", "plain", { mcpServers: { plain: { type: "streamable-http", url: "https://example.com/mcp" } } });
  // Retired ids are never seeded, so never offered.
  writePlugin("tovu-deploy-fly", "tovu-deploy-fly", {
    mcpServers: { fly: { type: "streamable-http", url: "https://fly.example/mcp", tovuTokenAuth: { helpUrl: "https://fly.example/t", probeUrl: "https://fly.example/p" } } },
  });
  fs.mkdirSync(path.join(root, "no-manifest"));
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

test("parse: absent is none; blanks are dropped; values are trimmed", () => {
  assert.deepEqual(parseNewSiteAgentPluginTokens(undefined), { ok: true, tokens: {} });
  assert.deepEqual(parseNewSiteAgentPluginTokens(null), { ok: true, tokens: {} });
  assert.deepEqual(parseNewSiteAgentPluginTokens({ supabase: "  sbp_x  ", other: "   " }), { ok: true, tokens: { supabase: "sbp_x" } });
});

test("parse: a non-object, a bad plugin id, a non-string, an over-long token, or too many entries are refused", () => {
  const refused = { ok: false, error: NEW_SITE_TOKENS_SHAPE_ERROR };
  assert.deepEqual(parseNewSiteAgentPluginTokens("sbp_x"), refused);
  assert.deepEqual(parseNewSiteAgentPluginTokens(["sbp_x"]), refused);
  assert.deepEqual(parseNewSiteAgentPluginTokens({ "Not An Id": "x" }), refused);
  assert.deepEqual(parseNewSiteAgentPluginTokens({ supabase: 5 }), refused);
  assert.deepEqual(parseNewSiteAgentPluginTokens({ supabase: "x".repeat(4097) }), refused);
  const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${i}`, "x"]));
  assert.deepEqual(parseNewSiteAgentPluginTokens(nine), refused);
});

test("refusals: invalid and unsupported stop the create with the plugin's name; ok and unavailable do not", () => {
  assert.deepEqual(describeNewSiteTokenRefusal("supabase", "invalid"), {
    code: "AGENT_PLUGIN_TOKEN_INVALID",
    error: "That Supabase access token didn't work. Check it, or leave it empty and connect Supabase later from chat. No site was created.",
  });
  assert.equal(describeNewSiteTokenRefusal("supabase", "unsupported")?.code, "AGENT_PLUGIN_TOKEN_UNSUPPORTED");
  assert.equal(describeNewSiteTokenRefusal("supabase", "ok"), null);
  assert.equal(describeNewSiteTokenRefusal("supabase", "unavailable"), null);
});

test("firstNewSiteTokenRefusal names the first refused plugin and never carries a token", async () => {
  const checked: { pluginId: string; token: string }[] = [];
  const refusal = await firstNewSiteTokenRefusal(async ({ pluginId, token }) => {
    checked.push({ pluginId, token });
    return pluginId === "b" ? "invalid" : "ok";
  }, { a: "tok-a", b: "tok-b", c: "tok-c" });
  assert.equal(refusal?.pluginId, "b");
  assert.deepEqual(checked, [{ pluginId: "a", token: "tok-a" }, { pluginId: "b", token: "tok-b" }], "checking stops at the first refusal");
  assert.ok(!JSON.stringify(refusal).includes("tok-b"));
  assert.equal(await firstNewSiteTokenRefusal(async () => "ok", { a: "x" }), null);
});

test("bundled plugins: read by manifest name; retired and manifest-less dirs are skipped; an absent root is empty", async () => {
  const ids = (await listBundledAgentPluginServers(root)).map((p) => p.pluginId).sort();
  assert.deepEqual(ids, ["plain", "supabase"]);
  assert.deepEqual(await listBundledAgentPluginServers(path.join(root, "missing")), []);
  assert.ok(await resolveBundledAgentPlugin(root)("supabase"));
  assert.equal(await resolveBundledAgentPlugin(root)("nope"), null);
});

test("the token sign-in list over bundled plugins offers only plugins that declare tovuTokenAuth", async () => {
  const plugins = await listTokenSignInPlugins("new-site", () => listBundledAgentPluginServers(root));
  assert.deepEqual(plugins, [{ pluginId: "supabase", displayName: "Supabase", helpUrl: "https://supabase.com/dashboard/account/tokens" }]);
});
