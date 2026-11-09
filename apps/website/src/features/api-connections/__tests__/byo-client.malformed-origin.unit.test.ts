/**
 * @file EXTRACT-S4 Main F3 (Tovu host): a saved BYO client whose stored base URL is malformed
 * rejects with the raw URL parse error, exactly as before S3, instead of being reported as a
 * credential that "could not be read on this site"; a true read failure keeps that refusal.
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
const id = "00000000-0000-4000-8000-0000000000c4";

async function fixtureConnection() {
  const { connections } = await loadDeclaredApiConnections({
    workspaceId: "ws-1",
    loadContributions: (input) => loadPluginContributionsFromSource({ plugin: { pluginId: "acme-office", packageRoot }, definition: input.definition }),
  });
  return connections[0]!;
}

async function savedClient() {
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring("v1");
  const sealer = new AesGcmSecretSealer(keyring);
  await createCustomCredential({ repo, sealer, keyring, clock: { nowMs: () => Date.now() }, idGen: { newId: () => id } }, {
    workspaceId: "ws-1", label: byoClientLabel({ pluginId: "acme-office", connectionId: "account" }), category: "general",
    baseUrl: "https://auth.acme.test/token", connection: { token: secret, username: "byo-client-id" },
  });
  return { repo, keyring, sealer };
}

test("a malformed saved base URL rejects with the raw URL error, not an unreadable refusal", async () => {
  const { repo, keyring, sealer } = await savedClient();
  // A row saved before base-URL validation (or edited outside it) can hold a value URL cannot parse.
  const row = await repo.vault.find({ workspaceId: "ws-1", id });
  assert.ok(row);
  await repo.vault.patchMeta({ workspaceId: "ws-1", id, expectedRevision: row.revision, patch: { baseUrl: "not a url" }, updatedAt: new Date().toISOString() });
  await assert.rejects(resolveByoClient({ credentials: { repo, sealer, keyring }, workspaceId: "ws-1", connection: await fixtureConnection() }),
    (error: unknown) => error instanceof TypeError && (error as { code?: string }).code === "ERR_INVALID_URL");
});

test("a saved client this site cannot open keeps the exact unreadable refusal", async () => {
  const { repo } = await savedClient();
  const otherKeyring = new InMemoryKeyring("v1");
  const resolved = await resolveByoClient({ credentials: { repo, sealer: new AesGcmSecretSealer(otherKeyring), keyring: otherKeyring }, workspaceId: "ws-1", connection: await fixtureConnection() });
  assert.ok(resolved instanceof ApiConnectionError);
  assert.equal(resolved.message, 'Acme Office cannot use your own OAuth client: the saved credential "acme-office/account OAuth client" could not be read on this site. Edit it under Admin > Access Tokens, then retry.');
});

test("a usable saved client on the token origin still resolves", async () => {
  const { repo, keyring, sealer } = await savedClient();
  assert.deepEqual(await resolveByoClient({ credentials: { repo, sealer, keyring }, workspaceId: "ws-1", connection: await fixtureConnection() }), { clientId: "byo-client-id", clientSecret: secret });
});
