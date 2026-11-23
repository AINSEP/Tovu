import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryMediaProviderCredentialRepo } from "../provider-credential-store.memory.js";
import {
  MediaProviderCredentialValidationError,
  mergeMediaProviderCredentials,
  saveMediaProviderCredentials,
} from "../provider-credential-store.js";

/**
 * @file `mergeMediaProviderCredentials` — the partial save (B135/B136). A provider absent from the
 * body is UNTOUCHED, so a key saved by another tab/screen/agent after a stale screen loaded cannot be
 * tombstoned by omission; `null` deletes exactly that one provider, built-in or plugin vendor.
 */

const WORKSPACE = "workspace-1";
const clock = { nowMs: () => Date.parse("2026-08-09T00:00:00.000Z"), nowIso: () => "2026-08-09T00:00:00.000Z" };
const acmeCatalog = { findProvider: ({ id }: { id: string }) => (id === "acme-media" ? { id: "acme-media" } : null) };

function makeDeps() {
  const repo = new InMemoryMediaProviderCredentialRepo();
  const keyring = new InMemoryKeyring();
  return { repo, deps: { repo, keyring, sealer: new AesGcmSecretSealer(keyring), clock, providerCatalog: acmeCatalog } };
}

async function storedIds(repo: InMemoryMediaProviderCredentialRepo): Promise<string[]> {
  return (await repo.listByWorkspaceId({ workspaceId: WORKSPACE })).map(row => row.providerId).sort();
}

test("merge leaves a built-in provider absent from the body untouched, key included (B135)", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: { apiKey: "sk-openai-123456" } } });
  await mergeMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { grok: { apiKey: "xai-grok-123456" } } });

  const saved = await mergeMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: { model: "dall-e-3" } } });

  assert.deepEqual(await storedIds(repo), ["grok", "openai"]);
  assert.equal(saved.grok?.apiKeyConfigured, true);
  assert.equal(saved.openai?.apiKeyConfigured, true, "an entry with no apiKey keeps the stored key");
  assert.equal(saved.openai?.model, "dall-e-3");
});

test("merge with null deletes exactly that provider — a plugin vendor too (B136)", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE,
    providers: { "acme-media": { apiKey: "acme-key-123456" }, openai: { apiKey: "sk-openai-123456" } } });

  const saved = await mergeMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { "acme-media": null } });

  assert.deepEqual(await storedIds(repo), ["openai"]);
  assert.deepEqual(Object.keys(saved), ["openai"]);
});

test("merge with null still removes a plugin vendor's key after the plugin left the registry", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { "acme-media": { apiKey: "acme-key-123456" } } });

  await mergeMediaProviderCredentials({ ...deps, providerCatalog: { findProvider: () => null } },
    { workspaceId: WORKSPACE, providers: { "acme-media": null } });

  assert.deepEqual(await storedIds(repo), []);
});

test("merge with null for a provider that has nothing stored is a no-op, not an error", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { openai: { apiKey: "sk-openai-123456" } } });

  await mergeMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { grok: null } });

  assert.deepEqual(await storedIds(repo), ["openai"]);
});

test("merge refuses a null-delete id that looks like a credential, and a non-object body", async () => {
  const { deps } = makeDeps();
  await assert.rejects(mergeMediaProviderCredentials(deps, { workspaceId: WORKSPACE,
    providers: { "Bearer abcdefghijklmnopqrstuvwxyz0123456789": null } }), MediaProviderCredentialValidationError);
  await assert.rejects(mergeMediaProviderCredentials(deps, { workspaceId: WORKSPACE,
    providers: [] as unknown as Record<string, null> }), MediaProviderCredentialValidationError);
});
