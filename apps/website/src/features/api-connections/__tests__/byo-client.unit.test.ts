/**
 * @file Phase-C unit tests for `byo-client.ts`: a saved bring-your-own client that this site
 * cannot open (sealed under another site key) is an actionable refusal that never carries the
 * secret, never a silent fall back to the Tovu-owned client; and the label is derived from the
 * plugin and connection ids alone.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { ApiConnectionError } from "@jini-ai/integrations/api-connections";

import { loadPluginContributionsFromSource } from "../../agent-plugins/lifecycle.js";
import { createCustomCredential, InMemoryCustomCredentialSetRepo } from "../../custom-credentials/index.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { byoClientLabel, resolveByoClient } from "../byo-client.js";
import { loadDeclaredApiConnections } from "../contribution.js";

const packageRoot = path.join(import.meta.dirname, "fixtures", "acme-office");
const secret = "z".repeat(20) + "-byo-secret";

async function fixtureConnection() {
  const { connections } = await loadDeclaredApiConnections({
    workspaceId: "ws-1",
    loadContributions: (input) => loadPluginContributionsFromSource({ plugin: { pluginId: "acme-office", packageRoot }, definition: input.definition }),
  });
  return connections[0]!;
}

test("label: derived from the plugin and connection ids", () => {
  assert.equal(byoClientLabel({ pluginId: "acme-office", connectionId: "account" }), "acme-office/account OAuth client");
});

test("a saved client this site cannot open is refused with a next step and without its secret", async () => {
  const repo = new InMemoryCustomCredentialSetRepo();
  const savedKeyring = new InMemoryKeyring("v1");
  await createCustomCredential({ repo, sealer: new AesGcmSecretSealer(savedKeyring), keyring: savedKeyring, clock: { nowMs: () => Date.now() }, idGen: { newId: () => "00000000-0000-4000-8000-0000000000c3" } }, {
    workspaceId: "ws-1", label: byoClientLabel({ pluginId: "acme-office", connectionId: "account" }), category: "general",
    baseUrl: "https://auth.acme.test/token", connection: { token: secret, username: "byo-client-id" },
  });
  // Another site key: the sealed row exists but cannot be opened here.
  const otherKeyring = new InMemoryKeyring("v1");
  const resolved = await resolveByoClient({ credentials: { repo, sealer: new AesGcmSecretSealer(otherKeyring), keyring: otherKeyring }, workspaceId: "ws-1", connection: await fixtureConnection() });
  assert.ok(resolved instanceof ApiConnectionError);
  assert.equal(resolved.code, "descriptor-invalid");
  assert.equal(resolved.message, 'Acme Office cannot use your own OAuth client: the saved credential "acme-office/account OAuth client" could not be read on this site. Edit it under Admin > Access Tokens, then retry.');
  assert.ok(!resolved.message.includes(secret));
});
