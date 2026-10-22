import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";

import type { UIResource } from "#src/assistant/index";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { credentialSaveFixtureRegistrations } from "#src/__tests__/support/credential-save";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createCustomCredential, InMemoryCustomCredentialSetRepo, resolveCustomCredentialByLabel } from "#src/features/custom-credentials/index";
import { buildPluginCredentialForm, type PluginCredentialCard } from "#src/features/custom-credentials/plugin-credential-card";
import { buildApiCredentialSaveHandlers, type CustomCredentialsToolDeps } from "#src/features/custom-credentials/tool-registrations";
import { loadBundledMailAdapterRegistry, MAIL_ADAPTERS_FILENAME, type MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { loadMailCredentialCards, MAIL_CREDENTIAL_CATEGORY } from "../mail-provider-catalog.js";

/**
 * @file Plugin-declared mail key cards: a v2 mail descriptor's `credentialCard` becomes a
 * `PluginCredentialCard` filed under the adapter's own credential label, and `credential_save`
 * `{kind:"plugin-provider"}` saves the key there. Runs the bundled plugins' real descriptors.
 */

const SOURCE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const WORKSPACE_ID = "ws-mail-card";
const PRINCIPAL_ID = "owner";
const RESEND_LABEL = "Tovu Mail — Resend API";

const bundledCards = () => loadMailCredentialCards({ loadMailAdapters: () => loadBundledMailAdapterRegistry({ sourceRoot: SOURCE_ROOT }) });

test("the bundled resend descriptor declares its key card, filed under its credential label", async () => {
  const cards = await bundledCards();
  assert.deepEqual(cards.find(card => card.providerId === "resend"), {
    providerId: "resend",
    label: RESEND_LABEL,
    category: MAIL_CREDENTIAL_CATEGORY,
    title: "Connect Resend",
    intro: "Connect Resend so this site can send its email (sign-in links, confirmations, form notifications).",
    helpUrl: "https://resend.com/api-keys",
    helpLabel: "Get a key at resend.com/api-keys",
    keyHint: "Create a key with Sending access",
    baseUrl: "https://api.resend.com",
  });
});

test("an adapter without a card declares none; a bad card is ignored with a note while the adapter loads", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mail-card-"));
  try {
    for (const [pluginId, credentialCard] of [["bad-card", { title: "Connect", baseUrl: "http://plain.example" }], ["no-card", undefined]] as const) {
      const dir = path.join(root, pluginId);
      await mkdir(path.join(dir, "adapters"), { recursive: true });
      await writeFile(path.join(dir, "plugin.json"), JSON.stringify({ name: pluginId }));
      await writeFile(path.join(dir, "adapters", "m.mjs"), "export default { create() { return {}; } };");
      const id = pluginId.replace("-", "_");
      await writeFile(path.join(dir, MAIL_ADAPTERS_FILENAME), JSON.stringify({ schemaVersion: 2, adapters: [{ id, label: id, module: "adapters/m.mjs", credentialKeys: ["token"], feedback: false, ...(credentialCard ? { credentialCard } : {}) }] }));
    }
    const registry = await loadBundledMailAdapterRegistry({ sourceRoot: root });
    assert.deepEqual(registry.list().map(adapter => adapter.descriptor.id), ["bad_card", "no_card"]);
    assert.deepEqual(registry.refusals, ["mail adapter 'bad_card' from 'bad-card' key card was ignored: adapters[0].credentialCard.baseUrl must be an https URL"]);
    assert.deepEqual(await loadMailCredentialCards({ loadMailAdapters: async () => registry }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a mail adapter list that cannot be read yields no cards rather than throwing", async () => {
  assert.deepEqual(await loadMailCredentialCards({ loadMailAdapters: async (): Promise<MailAdapterRegistry> => { throw new Error("disk"); } }), []);
});

test("the plugin card form carries exactly one masked secret field and no Works-for", async () => {
  const card = (await bundledCards()).find(entry => entry.providerId === "resend")!;
  const form = buildPluginCredentialForm({ card });
  assert.equal(form.fields.length, 1);
  assert.deepEqual([form.fields[0]!.name, form.fields[0]!.secret, form.fields[0]!.required], ["token", true, true]);
  assert.equal(form.title, "Connect Resend");
  assert.ok(!JSON.stringify(form).match(/works.?for/i), "no Works-for control on a plugin card");
});

function harness(cards: readonly PluginCredentialCard[]) {
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  let n = 0;
  const idGen = { newId: () => `cred-${++n}` };
  const deps: CustomCredentialsToolDeps = {
    loadAuthSchemes: async () => [],
    loadSourceControlProviders: async () => ({ list: () => [], get: () => undefined, refusals: [] }),
    loadPluginCredentialCards: async () => cards,
    workspaceId: WORKSPACE_ID,
    clock: createFakeClock({ startIso: "2026-10-22T00:00:00.000Z" }),
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    idGen,
    customCredentialsHttpClient: { send: async () => { throw new Error("a key card never calls the network"); } },
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handlers = buildApiCredentialSaveHandlers({ routeDeps: deps, surfaces: { surfaceExchanges } });
  const [save] = credentialSaveFixtureRegistrations({ adapters: { pluginProvider: handlers.pluginProvider } }) as [ToolRegistration];
  const writeDeps = { repo, sealer, keyring, clock: deps.clock, idGen };
  return { save, surfaceExchanges, repo, sealer, writeDeps };
}

async function submitKey({ h, token, fields = {} }: { h: ReturnType<typeof harness>; token: string; fields?: Record<string, unknown> }, _options = {}): Promise<unknown> {
  const emitted: unknown[] = [];
  const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input: { kind: "plugin-provider", target: "resend" }, signal: new AbortController().signal };
  const pending = h.save.handler(ctx, { emitSurface: async (surface) => void emitted.push(surface) });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))![1]!;
  assert.deepEqual(h.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL_ID, params: { ...fields, token } }, { toolId: "credential_save" }), { ok: true });
  return pending;
}

test("credential_save plugin-provider saves the key under the plugin's label, base URL and category", async () => {
  const h = harness(await bundledCards());
  const result = (await submitKey({ h, token: "re_brand_new_key" })) as { created: boolean; credential: { label: string } };
  assert.equal(result.created, true);
  assert.equal(result.credential.label, RESEND_LABEL);
  const saved = await resolveCustomCredentialByLabel({ repo: h.repo, sealer: h.sealer }, { workspaceId: WORKSPACE_ID, label: RESEND_LABEL });
  assert.deepEqual([saved?.connection.token, saved?.baseUrl, saved?.category], ["re_brand_new_key", "https://api.resend.com", MAIL_CREDENTIAL_CATEGORY]);
});

test("credential_save plugin-provider refuses a second key under the same label with the rotate message", async () => {
  const h = harness(await bundledCards());
  await createCustomCredential(h.writeDeps, { workspaceId: WORKSPACE_ID, label: RESEND_LABEL, category: MAIL_CREDENTIAL_CATEGORY, baseUrl: "https://api.resend.com", connection: { token: "re_original" } });
  assert.deepEqual(await submitKey({ h, token: "re_attempted_overwrite" }), {
    created: false,
    reason: "duplicate-label",
    message: `A custom credential labeled '${RESEND_LABEL}' already exists in this workspace. To rotate its token, use credential_save with kind api and target set to this label — this tool only creates NEW credentials and never overwrites an existing one.`,
  });
  const saved = await resolveCustomCredentialByLabel({ repo: h.repo, sealer: h.sealer }, { workspaceId: WORKSPACE_ID, label: RESEND_LABEL });
  assert.equal(saved?.connection.token, "re_original");
});

test("a generic plugin card saves its dynamic server and username while preserving fixed row metadata", async () => {
  const card: PluginCredentialCard = { providerId: (await bundledCards())[0]!.providerId, label: "Instance key", category: "general", baseUrl: "", title: "Connect instance", fields: [
    { name: "baseUrl", label: "Server URL", required: true }, { name: "username", label: "Account", required: true },
  ], additionalHosts: ["https://secondary.example.com"] };
  const h = harness([card]);
  const result = await submitKey({ h, token: "instance_private_key", fields: { baseUrl: "https://instance.example.com", username: "account", label: "wrong-row", category: "hosting", additionalHosts: ["https://wrong.example.com"] } });
  assert.equal((result as { created: boolean }).created, true);
  const saved = await resolveCustomCredentialByLabel({ repo: h.repo, sealer: h.sealer }, { workspaceId: WORKSPACE_ID, label: "Instance key" });
  assert.deepEqual([saved?.baseUrl, saved?.category, saved?.connection.username, saved?.connection.token, saved?.additionalHosts], ["https://instance.example.com", "general", "account", "instance_private_key", ["https://secondary.example.com"]]);
  assert.ok(!JSON.stringify(result).includes("instance_private_key"));
});
