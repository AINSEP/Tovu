import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { federatedCallConfirmationForAction } from "@jini-ai/mcp/federation";

import { classifyAgentPluginMcpServerTrust } from "../../../../apps/website/src/features/agent-plugins/capability-projection.ts";
import { planAgentPluginMcpFederation } from "../../../../apps/website/src/features/agent-plugins/federate-mcp.ts";
import { parseAgentPluginMcpConfig } from "../../../../apps/website/src/features/agent-plugins/mcp-metadata.ts";
import { parsePluginCredentialCards } from "../../../../apps/website/src/features/agent-plugins/credential-cards.ts";
import { buildAgentPluginAccessTokenForm } from "../../../../apps/website/src/features/agent-plugins/connect-card-ui.ts";

/**
 * @file The Resend plugin's connection to Resend's official hosted MCP server: one remote server
 * the federation auto-provisions, OAuth sign-in with the generic access-token fallback, default
 * tools that leave out what the per-call confirm card cannot catch, and a skill that keeps the
 * site's own mail on Tovu's tools. Parses the real package files; no network.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const MCP_URL = "https://mcp.resend.com/mcp";

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(PACKAGE_ROOT, relativePath), "utf8"));
}

async function readServer() {
  const parsed = parseAgentPluginMcpConfig({ value: await readJson("mcp.json") }, { pluginManifest: await readJson("plugin.json") });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.config.serverIds, ["resend"]);
  const server = parsed.config.servers.resend;
  assert.ok(server && server.type !== "stdio");
  return server;
}

async function readSkill() {
  return readFile(path.join(PACKAGE_ROOT, "skills/resend/SKILL.md"), "utf8");
}

test("mcp.json declares Resend's hosted streamable-http server, OAuth first, auto-provisioned as 'resend'", async () => {
  const server = await readServer();
  assert.deepEqual({ type: server.type, url: server.url, tovuAuthMode: server.tovuAuthMode }, { type: "streamable-http", url: MCP_URL, tovuAuthMode: "oauth" });
  assert.equal(server.headers, undefined, "a key in a header would never be sealed; it goes through the token form");
  assert.equal(classifyAgentPluginMcpServerTrust(server), "auto-admit");
  const plan = planAgentPluginMcpFederation({ servers: { resend: server } });
  assert.deepEqual(plan.skipped, []);
  assert.deepEqual(plan.toUpsert, [{ connectionId: "resend", serverKey: "resend", url: MCP_URL, authMode: "oauth", acceptsAccessToken: true }]);
});

test("the key fallback points at Resend's API keys page and probes an endpoint a Sending access key cannot read", async () => {
  const server = await readServer();
  // GET /domains: 200 for Full access, 401 restricted_api_key for Sending access (refused before saving).
  assert.deepEqual(server.tovuTokenAuth, { helpUrl: "https://resend.com/api-keys", probeUrl: "https://api.resend.com/domains" });
});

test("default tools: within the cap, read and write partition allow, and the happy path is granted", async () => {
  const { allow, write, read } = (await readServer()).tovuDefaultTools;
  assert.ok(allow.length <= 64);
  assert.equal(new Set(allow).size, allow.length);
  assert.deepEqual([...read, ...write].sort(), [...allow].sort());
  assert.ok(read.every((name) => /^(?:get|list)-/.test(name)), "only get/list tools are declared read");
  for (const needed of ["list-domains", "get-domain", "create-domain", "verify-domain", "list-broadcasts", "create-broadcast", "list-contacts", "create-contact", "list-segments", "list-templates", "send-email", "get-usage"]) {
    assert.ok(allow.includes(needed), `'${needed}' must be granted on sign-in`);
  }
});

test("default tools leave out removals, mass sends, and anything that would put a new secret in the chat", async () => {
  const { allow } = (await readServer()).tovuDefaultTools;
  for (const name of allow) {
    assert.doesNotMatch(name, /^(?:remove|batch-remove)-/, `${name}: removals cannot be undone and get no confirm card`);
  }
  for (const name of ["send-broadcast", "create-api-key", "update-api-key", "remove-api-key", "create-webhook", "update-webhook", "rotate-webhook-signing-secret", "replay-webhook-event", "revoke-oauth-grant", "create-contact-import"]) {
    assert.equal(allow.includes(name), false, `${name} must stay off by default`);
  }
});

test("every granted tool that mails a person asks the person first", async () => {
  const { allow } = (await readServer()).tovuDefaultTools;
  const sends = allow.filter((name) => name.startsWith("send-"));
  assert.deepEqual(sends.sort(), ["send-batch-emails", "send-email"]);
  for (const remoteName of sends) {
    assert.equal(federatedCallConfirmationForAction({ remoteName, annotations: undefined, args: {} }), "confirm");
  }
});

test("SKILL.md keeps site mail on Tovu's tools and connects before any Resend account tool", async () => {
  const skill = await readSkill();
  for (const tool of ["system_get_mail_status", "mail_set_provider", "mail_send_test", "dns_*", "agent_plugin_connect { pluginId: \"resend\" }"]) {
    assert.ok(skill.includes(tool), `SKILL.md must name ${tool}`);
  }
  assert.ok(skill.indexOf("agent_plugin_connect") < skill.indexOf('credential_save { kind: "plugin-provider", target: "resend-mcp" }'));
});

test("SKILL.md saves both keys through the secure form, each with the permission it needs", async () => {
  const skill = await readSkill();
  assert.ok(skill.includes('credential_save { kind: "plugin-provider", target: "resend-mcp" }'), "the Full access key goes through the plugin's own card");
  assert.match(skill, /\*\*Full access\*\*/);
  assert.ok(skill.includes('credential_save { kind: "plugin-provider", target: "resend" }'), "the site-mail key goes through the plugin's own key card");
  assert.match(skill, /\*\*Sending access\*\*/);
  assert.match(skill, /Never ask for the key in chat/);
});

test("the Full access card is the plugin's own, saves to the account connection, and says which key to make", async () => {
  const parsed = parsePluginCredentialCards({ raw: await readFile(path.join(PACKAGE_ROOT, "plugin.json"), "utf8") });
  assert.equal(parsed.ok, true);
  const card = parsed.descriptors.find((descriptor) => descriptor.providerId === "resend-mcp");
  assert.deepEqual(card.usedFor, ["Adds and verifies your email domain", "Manages contacts and broadcasts", "Manages email templates and reads email activity and account usage", "Sends one-off emails you request"]);
  // agent-plugin-token on "resend" seals it on the MCP row, apart from the site's sending key.
  assert.deepEqual({ saveKind: card.saveKind, saveTarget: card.saveTarget, helpUrl: card.helpUrl }, { saveKind: "agent-plugin-token", saveTarget: "resend", helpUrl: "https://resend.com/api-keys" });
  const form = JSON.stringify(buildAgentPluginAccessTokenForm({ pluginDisplayName: "Resend", helpUrl: card.helpUrl, credentialCard: card }));
  assert.match(form, /Connect Resend with a Full access key/);
  assert.match(form, /Create API Key.*Full access/);
  assert.match(form, /keeps your site's sending key/);
});

test("every mcp__resend__ tool SKILL.md names is granted by default", async () => {
  const skill = await readSkill();
  const { allow } = (await readServer()).tovuDefaultTools;
  const named = [...skill.matchAll(/mcp__resend__([a-z-]+)/g)].map((match) => match[1]).filter((name) => !name.endsWith("-"));
  assert.ok(named.length > 0);
  for (const name of named) assert.ok(allow.includes(name), `SKILL.md names mcp__resend__${name}, which is not granted`);
});

test("no file in the package carries a Resend key or webhook secret", async () => {
  const files = (await readdir(PACKAGE_ROOT, { recursive: true })).filter((file) => /\.(?:json|md|mjs)$/.test(file) && !file.startsWith("__tests__"));
  for (const file of files) {
    const text = await readFile(path.join(PACKAGE_ROOT, file), "utf8");
    assert.doesNotMatch(text, /\bre_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9+/]{8,}/, file);
  }
});
