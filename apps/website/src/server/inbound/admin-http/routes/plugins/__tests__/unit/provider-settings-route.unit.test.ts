import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import express from "express";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";

import type { ProviderConfigSource, ProviderPluginConfig } from "#src/server/runtime/composition/provider-config-source";
import { registerPluginProviderSettingsRoutes, type ProviderSettingsRouteDeps } from "../../provider-settings.js";

/**
 * @file The provider plugin's settings card route with DI fakes: declared fields from the manifest, public
 * values read back, secrets write-only (never in any response), blank secrets kept, authorization per
 * verb, and every refusal arm.
 */

const WS = "ws-1";
const MANIFEST = { contributes: { providers: [
  { contract: "observability", id: "opentelemetry", contractVersion: 1, settings: [
    { name: "endpoint", label: "OTLP endpoint", required: true, hint: "https://…" }, { name: "headers", label: "OTLP headers", secret: true }] },
  { contract: "observability", id: "second", contractVersion: 1, settings: [{ name: "endpoint", label: "dup" }] },
  { contract: "observability", id: "third", contractVersion: 1 },
] } };
const RECORDS = [
  { id: "obs", name: "Obs", version: "1.0.0", source: "site", status: "valid", errors: [], manifest: MANIFEST },
  { id: "plain", name: "Plain", version: "1.0.0", source: "site", status: "valid", errors: [] },
] as unknown as PluginDiscoveryRecord[];

function memoryConfig(): ProviderConfigSource & { saved: Map<string, ProviderPluginConfig> } {
  const saved = new Map<string, ProviderPluginConfig>();
  return {
    scope: "project", saved,
    read: async ({ pluginId }) => saved.get(pluginId) ?? null,
    readSettings: async ({ pluginId }) => { const found = saved.get(pluginId); return found ? { settings: found.settings, secretNames: Object.keys(found.secrets) } : null; },
    write: async ({ pluginId, config }) => { saved.set(pluginId, config); },
  };
}

async function serve(t: TestContext, deps: Partial<ProviderSettingsRouteDeps> = {}) {
  const permissions: string[] = [];
  const config = memoryConfig();
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerPluginProviderSettingsRoutes(app, { workspaceId: WS, discoverPlugins: async () => RECORDS, providerConfig: config,
    authorize: async ({ permission }: { permission: string }) => { permissions.push(permission); return { allowed: true, reason: "ok" }; }, ...deps } as ProviderSettingsRouteDeps);
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/v1/workspaces`;
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${base}/${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown> };
  };
  return { call, config, permissions };
}

test("GET lists the declared fields (first declaration of a name wins); nothing saved yet", async (t) => {
  const { call, permissions } = await serve(t);
  const { status, json } = await call("GET", `${WS}/plugins/obs/provider-settings`);
  assert.equal(status, 200);
  assert.deepEqual(json, { pluginId: "obs", store: "project", appliesAt: "next-start", fields: [
    { name: "endpoint", label: "OTLP endpoint", hint: "https://…", secret: false, required: true, saved: false },
    { name: "headers", label: "OTLP headers", secret: true, required: false, saved: false },
  ] });
  assert.deepEqual(permissions, ["admin.plugins.read"]);
});

test("PUT saves public values and secrets; responses never carry a secret; a blank secret keeps the saved one", async (t) => {
  const { call, config, permissions } = await serve(t);
  const first = await call("PUT", `${WS}/plugins/obs/provider-settings`, { values: { endpoint: " https://otlp.example.test/otlp ", headers: "Authorization=Basic c2VjcmV0" } });
  assert.equal(first.status, 200);
  assert.ok(!first.text.includes("c2VjcmV0"), "the secret never comes back");
  assert.deepEqual((first.json.fields as { saved: boolean; value?: string }[]).map(({ saved, value }) => [saved, value]), [[true, "https://otlp.example.test/otlp"], [true, undefined]]);
  await call("PUT", `${WS}/plugins/obs/provider-settings`, { values: { endpoint: " https://otlp.example.test/otlp", headers: "  " } });
  assert.deepEqual(config.saved.get("obs"), { settings: { endpoint: "https://otlp.example.test/otlp" }, secrets: { headers: "Authorization=Basic c2VjcmV0" } });
  const read = await call("GET", `${WS}/plugins/obs/provider-settings`);
  assert.ok(!read.text.includes("c2VjcmV0"));
  assert.deepEqual(permissions, ["admin.plugins.enable", "admin.plugins.enable", "admin.plugins.read"]);
});

test("a changed public field never keeps a saved secret: it must be entered again, so a saved key can't be redirected to another server", async (t) => {
  const { call, config } = await serve(t);
  const secret = ["Authorization=Basic", Buffer.from("owner-key").toString("base64")].join(" ");
  await call("PUT", `${WS}/plugins/obs/provider-settings`, { values: { endpoint: "https://otlp.example.test", headers: secret } });
  for (const values of [{ endpoint: "https://attacker.example.test", headers: "" }, { endpoint: "https://attacker.example.test" }, { endpoint: "" }]) {
    const { status, json, text } = await call("PUT", `${WS}/plugins/obs/provider-settings`, { values });
    assert.equal(status, 400, JSON.stringify(values));
    assert.equal(json.code, "PROVIDER_SETTINGS_SECRET_REENTRY");
    assert.equal(json.error, "Changing OTLP endpoint needs OTLP headers entered again.");
    assert.ok(!text.includes("owner-key") && !text.includes(Buffer.from("owner-key").toString("base64")));
  }
  assert.deepEqual(config.saved.get("obs"), { settings: { endpoint: "https://otlp.example.test" }, secrets: { headers: secret } }, "nothing was saved");
  // Re-entering the secret with the new endpoint saves both.
  const other = "Authorization=Bearer x";
  assert.equal((await call("PUT", `${WS}/plugins/obs/provider-settings`, { values: { endpoint: "https://new.example.test", headers: other } })).status, 200);
  assert.deepEqual(config.saved.get("obs"), { settings: { endpoint: "https://new.example.test" }, secrets: { headers: other } });
});

test("PUT refuses undeclared names, non-text values and a malformed body", async (t) => {
  const { call, config } = await serve(t);
  for (const body of [{ values: { token: "x" } }, { values: { endpoint: 3 } }, { values: ["x"] }, { nope: true }]) {
    const { status, json } = await call("PUT", `${WS}/plugins/obs/provider-settings`, body);
    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(json.code, "PROVIDER_SETTINGS_INVALID");
  }
  assert.equal(config.saved.size, 0);
});

test("refusals: other workspace 404, plugin without declared settings 404, no settings store 503, denied 403, store failure 500", async (t) => {
  const { call } = await serve(t);
  assert.equal((await call("GET", `other/plugins/obs/provider-settings`)).status, 404);
  assert.equal((await call("GET", `${WS}/plugins/plain/provider-settings`)).json.code, "PLUGIN_NOT_FOUND");
  assert.equal((await call("GET", `${WS}/plugins/missing/provider-settings`)).status, 404);
  const unavailable = await serve(t, { providerConfig: undefined });
  assert.equal((await unavailable.call("PUT", `${WS}/plugins/obs/provider-settings`, { values: {} })).status, 503);
  const denied = await serve(t, { authorize: (async () => ({ allowed: false, reason: "no" })) as never });
  assert.equal((await denied.call("GET", `${WS}/plugins/obs/provider-settings`)).status, 403);
  const failing = await serve(t, { discoverPlugins: async () => { throw new Error("disk"); } });
  assert.equal((await failing.call("GET", `${WS}/plugins/obs/provider-settings`)).status, 500);
  assert.equal((await failing.call("PUT", `${WS}/plugins/obs/provider-settings`, { values: {} })).status, 500);
});

test("a key saved the retired way (API credential `plugin:<id>`) shows a re-entry notice until new settings are saved (Codex fix-lane MED)", async (t) => {
  const asked: string[] = [];
  const { call } = await serve(t, { legacyProviderCredential: async ({ pluginId }) => { asked.push(pluginId); return pluginId === "obs"; } });
  const before = await call("GET", `${WS}/plugins/obs/provider-settings`);
  assert.equal(before.json.legacyCredential, true);
  assert.deepEqual(asked, ["obs"]);
  await call("PUT", `${WS}/plugins/obs/provider-settings`, { values: { endpoint: "https://otlp.example.test" } });
  const after = await call("GET", `${WS}/plugins/obs/provider-settings`);
  assert.equal("legacyCredential" in after.json, false, "once settings are saved the notice is gone");
  assert.deepEqual(asked, ["obs"], "the retired row is only checked while nothing is saved");
});

test("the retired-key check failing never breaks the card", async (t) => {
  const { call } = await serve(t, { legacyProviderCredential: async () => { throw new Error("db down"); } });
  const { status, json } = await call("GET", `${WS}/plugins/obs/provider-settings`);
  assert.equal(status, 200);
  assert.equal("legacyCredential" in json, false);
});
