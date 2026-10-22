import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import type { MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import type { HttpClientPort } from "#src/platform/http/index";
import type { SecretSealerPort } from "#src/features/webhooks/index";
import { loadMailProviderCatalog, SMTP_PROVIDER_SETUP } from "../mail-provider-catalog.js";

/**
 * @file `MailProviderCatalog.setupFor`: SMTP's protocol form is core, a plugin's comes from its
 * descriptor (or plain defaults from its credential keys), and keyless providers ask for nothing.
 */

const module = (id: string) => ({ id, capabilities: { hosted: true, feedback: false, domainVerification: false }, create: () => { throw new Error("unused"); } }) as never;

function registry(): MailAdapterRegistry {
  const base = { module: "a.mjs", feedback: false, schemaVersion: 2 as const };
  return { refusals: [], list: () => [
    { pluginId: "p", module: module("declared"), descriptor: { ...base, id: "declared", label: "Declared", credentialLabel: "Declared key", credentialKeys: ["token"], setup: { helpUrl: "https://declared.test", fields: [{ key: "token", label: "Secret", type: "secret", required: true }] } } },
    { pluginId: "p", module: module("plain"), descriptor: { ...base, id: "plain", label: "Plain", credentialLabel: "Plain key", credentialKeys: ["token"] } },
    { pluginId: "p", module: module("keyless"), descriptor: { ...base, id: "keyless", label: "Keyless", credentialLabel: "unused", credentialKeys: [] } },
    { pluginId: "p", module: { create: () => { throw new Error("unused"); } } as never, descriptor: { id: "legacy", label: "Legacy", module: "a.mjs", credentialLabel: "Legacy key" } },
  ] };
}

test("setupFor: core SMTP form, declared plugin form, defaults from credential keys, nothing for keyless or unknown", async () => {
  const catalog = await loadMailProviderCatalog({
    workspaceId: "ws", customCredentialRepo: new InMemoryCustomCredentialSetRepo(), sealer: {} as SecretSealerPort, httpClient: {} as HttpClientPort,
    loadMailAdapters: async () => registry(),
  });
  assert.equal(catalog.setupFor({ id: "smtp" }), SMTP_PROVIDER_SETUP);
  assert.deepEqual(SMTP_PROVIDER_SETUP.fields.map((f) => [f.key, f.type]), [["baseUrl", "url"], ["username", "text"], ["token", "secret"]]);
  assert.deepEqual(catalog.setupFor({ id: "declared" }), { helpUrl: "https://declared.test", fields: [{ key: "token", label: "Secret", type: "secret", required: true }] });
  assert.deepEqual(catalog.setupFor({ id: "plain" }).fields.map((f) => f.key), ["token", "baseUrl"]);
  assert.deepEqual(catalog.setupFor({ id: "legacy" }).fields.map((f) => f.key), ["token", "baseUrl"]);
  assert.deepEqual(catalog.setupFor({ id: "keyless" }), { fields: [] });
  assert.deepEqual(catalog.setupFor({ id: "console" }), { fields: [] });
  assert.equal(catalog.credentialLabelFor({ id: "keyless" }), undefined);
  assert.equal(catalog.credentialLabelFor({ id: "legacy" }), "Legacy key");
});
