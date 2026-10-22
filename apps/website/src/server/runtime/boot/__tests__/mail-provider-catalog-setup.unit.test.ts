import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCustomCredentialSetRepo, CustomCredentialSecretStoreUnconfiguredError } from "#src/features/custom-credentials/index";
import type { MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import type { HttpClientPort } from "#src/platform/http/index";
import type { SecretSealerPort } from "#src/features/webhooks/index";
import { loadMailProviderCatalog, SMTP_PROVIDER_SETUP, credentialFailureReason } from "../mail-provider-catalog.js";

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

test("a saved SMTP row without username is incomplete in the configuration DTO", async () => {
  const { describeMailProviders } = await import("../mail-provider-configuration.js");
  const { MAIL_SMTP_CREDENTIAL_LABEL } = await import("../mail-provider-catalog.js");
  const catalog = await loadMailProviderCatalog({ workspaceId: "ws", customCredentialRepo: new InMemoryCustomCredentialSetRepo(), sealer: {} as SecretSealerPort, httpClient: {} as HttpClientPort, loadMailAdapters: async () => registry() });
  const report = describeMailProviders({ catalog, records: [{ id: "smtp-key", label: MAIL_SMTP_CREDENTIAL_LABEL, updatedAt: "2026-10-22T00:00:00Z" }] as never, setting: { transactional: "smtp", bulk: "smtp" } });
  const smtp = report.providers.find(p => p.id === "smtp")!;
  assert.equal(smtp.credential.saved, false); assert.equal(smtp.selectable, false);
  assert.equal(smtp.refusal, `has no complete saved credential "${MAIL_SMTP_CREDENTIAL_LABEL}" under Access Tokens (category "ops")`);
});


test("credential failures disclose fixed text while preserving detail only in server diagnostics", () => {
  for (const err of [new CustomCredentialSecretStoreUnconfiguredError("token=secret-decrypt"), new Error("token=secret-store"), "secret-non-error"]) {
    const diagnostics: unknown[][] = [];
    const reason = credentialFailureReason({ label: "Mail key", err }, { log: (...args) => { diagnostics.push(args); } });
    assert.equal(reason, err instanceof CustomCredentialSecretStoreUnconfiguredError ? 'the "Mail key" credential is saved but could not be decrypted' : 'the "Mail key" credential could not be read');
    assert.doesNotMatch(reason, /secret/);
    assert.deepEqual(diagnostics, [["[mail] credential lookup failed", err]]);
    assert.equal(credentialFailureReason({ label: "Mail key", err }, { log: () => { throw new Error("logger unavailable"); } }), reason);
  }
});
