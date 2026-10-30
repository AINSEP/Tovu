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
    usage: async () => ({ store: "project", usedByThisSite: saved !== null, usedBy: [] }),
    read: async () => saved,
    readSettings: async () => saved && ({ settings: saved.settings, secretNames: Object.keys(saved.secrets) }),
    write: async ({ config: next }) => { saved = next; writes++; },
  };
  return { config, saved: () => saved, writes: () => writes };
}

test('a committed save needing restart remains successful without submitted values', async () => {
  const f = fixture();
  const token = ['private', 'fixture', String(456)].join('-');
  const result = await saveProviderSettings({ config: f.config, pluginId, fields, values: { endpoint, token }, reapply: async () => 'restart' });
  assert.deepEqual(result, { saved: true, configured: true, store: 'project', usedByThisSite: true, usedBy: [], appliesAt: 'restart' });
  assert.equal(f.writes(), 1);
  assert.equal(JSON.stringify(result).includes(token), false);
});

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
  assert.equal(kept?.required, true);
  assert.equal(kept?.kind === "string" && kept.hasSavedValue, true);
  assert.equal(kept?.value, undefined);
});


test("Grafana Cloud requires an instance ID on save, boot and status; a kept token satisfies it", async () => {
  const cloudFields: readonly PluginProviderSettingField[] = [
    { name: "auth", label: "Authentication", required: true, default: "grafana-cloud", options: [{ value: "grafana-cloud", label: "Grafana Cloud" }, { value: "bearer", label: "Token only" }, { value: "none", label: "None" }] },
    { name: "username", label: "Instance ID", requiredWhen: { field: "auth", in: ["grafana-cloud"] } },
    fields[2]!,
  ];
  const cloudDeclaration = { ...declaration, settings: cloudFields };
  for (const auth of [undefined, "grafana-cloud"]) {
    const settings: Readonly<Record<string, string>> = auth ? { auth } : {};
    const f = fixture({ settings, secrets: { token: "fixture-token" } });
    assert.deepEqual(await saveProviderSettings({ config: f.config, pluginId, fields: cloudFields, values: { token: "" } }), { refusal: { code: "PROVIDER_SETTINGS_REQUIRED", error: "Instance ID is required." } });
    assert.equal(f.writes(), 0);
    assert.equal(providerInputOf({ declaration: cloudDeclaration, saved: f.saved() }), undefined);
    assert.deepEqual((await providerSettingsStatus({ config: f.config, pluginId, fields: cloudFields })).missing, ["Instance ID"]);
  }
  const f = fixture({ settings: { auth: "grafana-cloud", username: "123456" }, secrets: { token: "fixture-token" } });
  const result = await saveProviderSettings({ config: f.config, pluginId, fields: cloudFields, values: { token: "" } });
  assert.equal("saved" in result && result.configured, true);
  assert.equal(f.saved()?.secrets.token, "fixture-token");
  for (const auth of ["bearer", "none"]) {
    assert.deepEqual((await providerSettingsStatus({ config: fixture({ settings: { auth }, secrets: auth === "bearer" ? { token: "fixture-token" } : {} }).config, pluginId, fields: cloudFields })).missing, []);
  }
});


test('a committed provider startup failure carries safe guidance instead of a restart promise', async () => {
  const f = fixture();
  const result = await saveProviderSettings({ config: f.config, pluginId, fields, values: { endpoint, token: 'fixture-only' },
    reapply: async () => ({ appliesAt: 'failed', reason: 'The exporter could not initialize.', action: 'Change the endpoint and save again.' }) });
  assert.deepEqual(result, { saved: true, configured: true, store: 'project', usedByThisSite: true, usedBy: [], appliesAt: 'failed',
    message: 'Saved, but the provider could not start. The exporter could not initialize. Change the endpoint and save again.' });
  assert.equal(f.writes(), 1);
  assert.doesNotMatch(JSON.stringify(result), /fixture-only|restart|reload/i);
});

test('save refuses non-auth headers before writing; declared auth headers allow tokenless boot and status', async () => {
  const declared: readonly PluginProviderSettingField[] = [...fields.slice(0, 2),
    { ...fields[2]!, requiredUnless: { field: 'auth', equals: 'none', orPresent: 'headers', headerNames: ['Authorization', 'x-api-key'] } },
    { name: 'headers', label: 'Extra headers', secret: true }];
  for (const auth of ['bearer', 'grafana-cloud']) for (const headers of ['X-Scope-OrgID=1', 'authorization=Bearer fixture', 'X-API-Key=fixture']) {
    const f = fixture();
    const result = await saveProviderSettings({ config: f.config, pluginId, fields: declared, values: { endpoint, auth, headers } });
    if (headers.startsWith('X-Scope')) {
      assert.deepEqual(result, { refusal: { code: 'PROVIDER_SETTINGS_REQUIRED', error: `Token is required. ${hint}` } });
      assert.equal(f.writes(), 0);
    } else {
      assert.equal('saved' in result && result.configured, true);
      assert.ok(providerInputOf({ declaration: { ...declaration, settings: declared }, saved: f.saved() }));
      assert.deepEqual((await providerSettingsStatus({ config: f.config, pluginId, fields: declared })).missing, []);
    }
  }
});
