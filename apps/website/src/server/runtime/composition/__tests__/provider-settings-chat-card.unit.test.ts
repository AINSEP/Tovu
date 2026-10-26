import { fakeAttachments } from "#src/features/project-keys/__tests__/helpers";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ToolExecutionContext, ToolHandler } from "@jini-ai/core";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";

import type { AgentPluginStateStore } from "#src/features/api-connections/plugin-state";
import { parsePluginCredentialCards } from "#src/features/agent-plugins/credential-cards";
import { buildCredentialSaveRegistrations, type CredentialSaveAdapters } from "#src/features/custom-credentials/credential-save-tool";
import { buildProviderSettingsCredentialHandler, buildProviderSettingsForm } from "#src/features/custom-credentials/provider-settings-card";
import { buildProviderStatusRegistrations } from "#src/features/plugin-runtime/provider-status-tool";

import { createVaultProviderConfigSource, withAttachedProject } from "../provider-config-source.js";
import { bindProviderSettingsCardPorts, listProviderStatuses } from "../provider-settings-save.js";

/**
 * @file The assistant's provider-settings key card end to end, with DI fakes for the two vaults: an
 * agent plugin's card (the real bundled PostHog manifest) opened by `credential_save` kind
 * plugin-provider saves through the admin card's shared rule into the PROJECT store, never the site
 * vault, a credential row, the model-facing result or the transcript; `provider_status` reports
 * presence only.
 */

const PLUGIN = "analytics-posthog";
// Built at runtime so no literal key sits in the source.
const secret = ["phc", "test", String(Date.now()), "k3y"].join("_");

/** The provider plugin's declared settings, as its Jini manifest declares them. */
const record = {
  id: PLUGIN,
  manifest: { contributes: { providers: [{ contract: "product_analytics", id: "posthog", contractVersion: 1, settings: [
    { name: "host", label: "Region / host", required: true, default: "https://us.i.posthog.com", allowCustom: true,
      options: [{ value: "https://us.i.posthog.com", label: "US Cloud" }, { value: "https://eu.i.posthog.com", label: "EU Cloud" }] },
    { name: "apiKey", label: "Project API key", secret: true, required: true },
  ] }] } },
} as unknown as PluginDiscoveryRecord;

function fakeState(): { state: AgentPluginStateStore; rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  const view = ({ workspaceId, pluginId }: { workspaceId: string; pluginId: string }) => ({
    get: async ({ key }: { key: string }) => (rows.get(`${workspaceId}/${pluginId}/${key}`) ?? null) as never,
    set: async ({ key, value }: { key: string; value: unknown }) => { rows.set(`${workspaceId}/${pluginId}/${key}`, value); },
    delete: async () => {},
  });
  return { rows, state: { forPlugin: view, readerFor: view, describe: async () => ({ keys: [] }) } as unknown as AgentPluginStateStore };
}

const bundledCards = () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(new URL("../../../../../../../content/agent-plugins/posthog/plugin.json", import.meta.url), "utf8") });
  assert.equal(parsed.ok, true);
  return parsed.ok ? parsed.descriptors : [];
};

const refuse: ToolHandler = async () => { throw new Error("wrong save kind"); };

/** credential_save with only the provider-settings adapter real; the human answer is the only other fake. */
async function fixture({ submit, saved, records = [record] }: { submit: Record<string, string>; saved?: { settings: Record<string, string>; secrets: Record<string, string> }; records?: PluginDiscoveryRecord[] }) {
  const site = fakeState();
  const project = fakeState();
  const attachments = fakeAttachments();
  const config = withAttachedProject({ site: createVaultProviderConfigSource({ state: site.state, workspaceId: "ws", scope: "site" }) },
    { project: createVaultProviderConfigSource({ state: project.state, workspaceId: "project", scope: "project" }), attachments, siteId: "site-a" });
  if (saved) { await config.write({ pluginId: PLUGIN, config: saved }); await attachments.attach({ siteId: "site-a", siteName: "A", keyId: `plugin-state:${PLUGIN}:provider.config` }); }
  const clock = createSystemClock();
  const idGen = createRandomUuidGenerator();
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock, idGenerator: idGen, defaultChannel: "mcp-ui" });
  const cards = bundledCards();
  const authorized: string[] = [];
  const adapters: CredentialSaveAdapters = { apiCreate: refuse, apiRotate: refuse, mediaProvider: refuse, sourceControl: refuse, publishHost: refuse, agentPluginToken: refuse, pluginProvider: refuse,
    providerSettings: buildProviderSettingsCredentialHandler({ surfaces: { surfaceExchanges }, loadCards: async () => cards, ports: {
      ...bindProviderSettingsCardPorts({ config, discoverPlugins: async () => records }),
      authorize: async () => { authorized.push("admin.plugins.enable"); },
    } }) };
  const [registration] = buildCredentialSaveRegistrations({ adapters, loadPluginCredentialCards: async () => cards, authorizePluginProvider: async () => { authorized.push("custom-credentials.write"); } });
  let exchangeId = "";
  let transcript = "";
  const input = { kind: "plugin-provider", target: "posthog" };
  const pending = registration!.handler({ executionId: "e1", principal: { id: "owner" }, run: { id: "r1" }, input, signal: new AbortController().signal } as unknown as ToolExecutionContext, {
    emitSurface: async (surface) => {
      transcript += JSON.stringify(surface);
      const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
      const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
      if (match) exchangeId = match[1]!;
    },
  }).catch((error: unknown) => ({ thrown: error instanceof Error ? error.message : String(error) }));
  for (let tick = 0; tick < 200 && !exchangeId; tick++) await new Promise((resolve) => setImmediate(resolve));
  if (exchangeId) assert.ok(surfaceExchanges.deliver({ exchangeId, principalId: "owner", params: submit }, { toolId: "credential_save" }));
  const result = await pending as Record<string, unknown>;
  return { result, transcript, input, site, project, config, authorized };
}

test("the chat card saves the provider's settings into the PROJECT store, not the site vault; the key never reaches the result, transcript or model input", async () => {
  const f = await fixture({ submit: { host: "https://eu.i.posthog.com", apiKey: secret } });
  assert.deepEqual(f.result, { saved: true, configured: false, pluginId: PLUGIN, store: "project", keyId: `plugin-state:${PLUGIN}:provider.config`, usedByThisSite: false, usedBy: [], appliesAt: "restart" });
  assert.deepEqual(f.project.rows.get(`project/${PLUGIN}/provider.config`), { settings: { host: "https://eu.i.posthog.com" }, secrets: { apiKey: secret } });
  assert.equal(f.site.rows.size, 0, "nothing in the site vault");
  assert.deepEqual(f.authorized, ["custom-credentials.write", "admin.plugins.enable"], "the admin Settings card's save permission is checked too");
  assert.ok(f.transcript.includes("Connect PostHog"), "the agent plugin's copy is on the card");
  assert.ok(f.transcript.includes("EU Cloud") && f.transcript.includes("Custom…"), "the provider's declared choices are on the card");
  for (const seen of [JSON.stringify(f.result), f.transcript, JSON.stringify(f.input)]) assert.ok(!seen.includes(secret));
});

test("a Custom… choice saves the typed host", async () => {
  const f = await fixture({ submit: { host: "__custom", host__custom: "https://ph.example.test", apiKey: secret } });
  assert.equal(f.result.saved, true);
  assert.deepEqual((f.project.rows.get(`project/${PLUGIN}/provider.config`) as { settings: unknown }).settings, { host: "https://ph.example.test" });
});

test("the shared re-entry rule: a changed host with the saved key kept is refused and nothing is written", async () => {
  const saved = { settings: { host: "https://us.i.posthog.com" }, secrets: { apiKey: secret } };
  const f = await fixture({ saved, submit: { host: "https://eu.i.posthog.com", apiKey: "" } });
  assert.equal(f.result.saved, false);
  assert.match(String(f.result.message), /Changing Region \/ host needs Project API key entered again/);
  assert.deepEqual(f.project.rows.get(`project/${PLUGIN}/provider.config`), saved);
  assert.ok(!f.transcript.includes(secret), "the saved key is never put on the card");
});

test("a blank key with an unchanged host keeps the saved key", async () => {
  const saved = { settings: { host: "https://us.i.posthog.com" }, secrets: { apiKey: secret } };
  const f = await fixture({ saved, submit: { host: "https://us.i.posthog.com", apiKey: "" } });
  assert.equal(f.result.saved, true);
  assert.deepEqual(f.project.rows.get(`project/${PLUGIN}/provider.config`), saved);
});

test("a provider plugin that is not installed opens no card", async () => {
  const f = await fixture({ records: [], submit: {} });
  assert.match(String(f.result.thrown), /not installed or declares no settings/);
  assert.equal(f.transcript, "");
});

test("provider_status reports presence only: configured, missing, store, never a value", async () => {
  const project = fakeState();
  const attachments = fakeAttachments();
  const config = withAttachedProject({ site: createVaultProviderConfigSource({ state: fakeState().state, workspaceId: "ws", scope: "site" }) },
    { project: createVaultProviderConfigSource({ state: project.state, workspaceId: "project", scope: "project" }), attachments, siteId: "site-a" });
  const [registration] = buildProviderStatusRegistrations({ ports: {
    list: () => listProviderStatuses({ config, discoverPlugins: async () => [record, { id: "plain", manifest: {} } as unknown as PluginDiscoveryRecord],
      activation: async () => ({ enabled: true }) }),
    authorize: async () => {},
  } });
  const run = (input?: unknown) => registration!.handler({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input, signal: new AbortController().signal } as unknown as ToolExecutionContext, {});
  assert.deepEqual(await run(), { providers: [{ pluginId: PLUGIN, enabled: true, configured: false, store: "project", usedByThisSite: false, usedBy: [], appliesAt: "now", missing: ["Project API key"] }] });
  await config.write({ pluginId: PLUGIN, config: { settings: { host: "https://ph.private.example.test" }, secrets: { apiKey: secret } } });
  const pending = await run({ pluginId: PLUGIN }) as { providers: { configured: boolean; usedByThisSite: boolean; keyId: string }[] };
  assert.equal(pending.providers[0]!.configured, false);
  assert.equal(pending.providers[0]!.usedByThisSite, false);
  assert.equal(pending.providers[0]!.keyId, `plugin-state:${PLUGIN}:provider.config`);
  await attachments.attach({ siteId: "site-a", siteName: "A", keyId: pending.providers[0]!.keyId });
  const status = await run({ pluginId: PLUGIN });
  assert.deepEqual(status, { providers: [{ pluginId: PLUGIN, enabled: true, configured: true, store: "project", keyId: `plugin-state:${PLUGIN}:provider.config`, usedByThisSite: true, usedBy: ["A"], appliesAt: "now", missing: [] }] });
  assert.ok(!JSON.stringify(status).includes(secret) && !JSON.stringify(status).includes("ph.private"), "no secret or setting value");
  await assert.rejects(run({ pluginId: "nope" }), /No installed provider plugin 'nope'/);
});


test("a different key card explains site isolation and retains the manifest's help and purposes", () => {
  const form = buildProviderSettingsForm({ prep: { pluginId: "analytics-example", fields: [], saved: null,
    usage: { keyId: "plugin-state:analytics-example:provider.config", store: "project", usedByThisSite: false, usedBy: ["A"] },
    card: { providerId: "example", label: "Example", title: "Connect Example", category: "ops", baseUrl: "", helpUrl: "https://help.example.test", helpLabel: "Key help", keyHint: "Find your project key", usedFor: ["Product events"] },
  } });
  assert.equal(form.description, "Keys are sealed on the server the moment you submit — the assistant never sees them. Your project's saved Example key is used by A. A key entered here is used by this site only.");
  assert.deepEqual(form.details, [{ label: "Key help", value: "https://help.example.test" }, { label: "Where to find it", value: "Find your project key" }, { label: "Used for", value: "Product events" }]);
});
