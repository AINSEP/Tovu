import assert from "node:assert/strict";
import test from "node:test";
import type { PluginProviderSettingField } from "@jini-ai/plugins/host";

import { buildProviderSettingsForm } from "#src/features/custom-credentials/provider-settings-card";
import type { ProviderConfigSource, ProviderPluginConfig } from "../provider-config-source.js";
import { providerInputOf } from "../provider-plugins.js";
import { providerSettingsStatus, saveProviderSettings } from "../provider-settings-save.js";

const pluginId = "observability-opentelemetry";
const hint = 'Choose "No authentication" only for a local collector.';
const fields: readonly PluginProviderSettingField[] = [
  { name: "endpoint", label: "OTLP endpoint", required: true },
  { name: "auth", label: "Authentication", required: true, default: "token", options: [
    { value: "token", label: "Token" }, { value: "none", label: "No authentication (local collector, advanced)" },
  ] },
  { name: "token", label: "Token", secret: true, required: true, requiredUnless: { field: "auth", equals: "none" }, hint },
];
const declaration = { contract: "observability", id: "opentelemetry", contractVersion: 1 as const, settings: fields };
const endpoint = "http://collector.example.test";

/** In-memory config port: assertions observe persistence without a vault or any external I/O. */
function fixture(current: ProviderPluginConfig | null = null) {
  let saved = current;
  let writes = 0;
  const config: ProviderConfigSource = {
    scope: "project",
    read: async () => saved,
    readSettings: async () => saved && ({ settings: saved.settings, secretNames: Object.keys(saved.secrets) }),
    write: async ({ config: next }) => { saved = next; writes++; },
  };
  return { config, saved: () => saved, writes: () => writes };
}

test("save refuses absent, blank and whitespace tokens unless the explicit local mode is selected", async () => {
  for (const values of [{ endpoint }, { endpoint, token: "" }, { endpoint, auth: "token", token: "  " }, { endpoint, auth: "unknown" }]) {
    const f = fixture();
    assert.deepEqual(await saveProviderSettings({ config: f.config, pluginId, fields, values }), {
      refusal: { code: "PROVIDER_SETTINGS_REQUIRED", error: `Token is required. ${hint}` },
    });
    assert.equal(f.writes(), 0);
  }
  const f = fixture();
  assert.deepEqual(await saveProviderSettings({ config: f.config, pluginId, fields, values: { endpoint, auth: "none", token: "" } }), {
    saved: true, configured: true, store: "project", usedByThisSite: true, usedBy: [], appliesAt: "restart",
  });
  assert.deepEqual(f.saved(), { settings: { endpoint, auth: "none" }, secrets: {} });
  assert.deepEqual(await saveProviderSettings({ config: fixture().config, pluginId, fields, values: { auth: "none" } }), {
    refusal: { code: "PROVIDER_SETTINGS_REQUIRED", error: "OTLP endpoint is required." },
  });
});

test("a saved token without auth keeps working; changing a public field still requires secret re-entry", async () => {
  const token = ["token", String(Date.now()), "test"].join("-");
  const saved = { settings: { endpoint }, secrets: { token } };
  const f = fixture(saved);
  assert.deepEqual(await saveProviderSettings({ config: f.config, pluginId, fields, values: { endpoint, auth: "token", token: "" } }), {
    saved: true, configured: true, store: "project", usedByThisSite: true, usedBy: [], appliesAt: "restart",
  });
  assert.equal(f.saved()?.secrets.token, token);
  const moved = await saveProviderSettings({ config: f.config, pluginId, fields, values: { endpoint: "http://other.example.test", token: "" } });
  assert.deepEqual(moved, { refusal: { code: "PROVIDER_SETTINGS_SECRET_REENTRY", error: "Changing OTLP endpoint needs Token entered again." } });
  const switched = await saveProviderSettings({ config: f.config, pluginId, fields, values: { auth: "none", token: "" } });
  assert.deepEqual(switched, { refusal: { code: "PROVIDER_SETTINGS_SECRET_REENTRY", error: "Changing Authentication needs Token entered again." } });
  assert.equal(f.writes(), 1);
});

test("boot and provider_status agree for absent auth, explicit local auth, and defaults", async () => {
  const token = ["token", String(Date.now())].join("-");
  for (const [saved, missing] of [
    [null, ["OTLP endpoint", "Token"]],
    [{ settings: { endpoint }, secrets: {} }, ["Token"]],
    [{ settings: { endpoint }, secrets: { token } }, []],
    [{ settings: { endpoint, auth: "none" }, secrets: {} }, []],
  ] as const) {
    const status = await providerSettingsStatus({ config: fixture(saved).config, pluginId, fields });
    assert.deepEqual(status.missing, missing);
    assert.equal(status.configured, missing.length === 0);
    assert.equal(Boolean(providerInputOf({ declaration, saved })), missing.length === 0);
    assert.equal(JSON.stringify(status).includes(token), false);
  }
});

test("chat declares a default Token choice and conditional blank handling without exposing saved secrets", () => {
  const form = buildProviderSettingsForm({ prep: { pluginId, fields, saved: null } });
  const auth = form.fields.find((field) => field.name === "auth");
  const token = form.fields.find((field) => field.name === "token");
  assert.equal(auth?.value, "token");
  assert.deepEqual(token, { kind: "string", name: "token", label: "Token", secret: true, required: true, requiredUnless: { field: "auth", equals: "none" }, allowBlank: true, hint });
  const kept = buildProviderSettingsForm({ prep: { pluginId, fields, saved: { settings: { endpoint }, secretNames: ["token"] } } }).fields.find((field) => field.name === "token");
  assert.equal(kept?.required, false);
  assert.equal(kept?.value, undefined);
});
