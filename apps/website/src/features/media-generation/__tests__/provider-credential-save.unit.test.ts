import { parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import { createHash } from "node:crypto";
import { CREDENTIAL_MESSAGES, CredentialInputError, normalizeCredentialToken } from "@jini-ai/platform/secrets/credential-token";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import { MEDIA_PROVIDERS } from "@jini-ai/integrations/media-providers/catalog";
import { createTovuStoreVault } from "#src/platform/secrets/vault-kinds";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import type { UUID } from "@jini-ai/core/primitives";

import { TurnLock } from "@jini-ai/db/kernel";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryMediaProviderCredentialRepo } from "@jini-ai/cms/media/site/provider-credential-store.memory";
import { getMediaProviderCredentials, saveMediaProviderCredentials } from "@jini-ai/cms/media/site/provider-credential-store";
import { mediaVaultScope } from "@jini-ai/cms/media/site/provider-credential-vault";
import { InMemoryKeyring } from "../../webhooks/keyring.env.js";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { saveMediaProviderKey } from "@jini-ai/cms/media/site-generation/provider-credential-save";

const MEDIA_CREDENTIAL_POLICY = { ownerKey: "tovu", legacyIds: { grok: ["xai-grok-imagine"] },
  parseMeta: ({ meta }: { meta: unknown }) => parseTovuStoreMeta({ kind: "media-provider", meta }) as { baseUrl: string | null; model: string | null } };
const MEDIA_CREDENTIAL_BINDINGS = { vaultPolicy: MEDIA_CREDENTIAL_POLICY,
  credentialPolicy: { assertCredentialFreeField, normalizeCredentialToken }, builtInProviderIds: new Set(MEDIA_PROVIDERS.map(provider => provider.id)),
  credentialInputMessage: ({ error }: { error: unknown }) => error instanceof CredentialInputError ? error.message : undefined,
  storageMessage: CREDENTIAL_MESSAGES.storage, sha256Hex: ({ text }: { text: string }) => createHash("sha256").update(text).digest("hex"),
  createVault: (required: Omit<Parameters<typeof createTovuStoreVault>[0], "kind">) => createTovuStoreVault({ ...required, kind: "media-provider" }),
};


/**
 * @file `saveMediaProviderKey`: the agent tool's single-provider key save over the admin PUT's
 * whole-set store path. The store's own validation and sealing are tested in
 * `media/__tests__/provider-credential-store.test.ts`; here, the single-provider patch: other rows
 * are never tombstoned, and the saved provider keeps its model/baseUrl.
 */

const WS = "ws-media" as UUID;
const clock = { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z"), nowIso: () => "2026-10-04T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemoryMediaProviderCredentialRepo({ vault: new InMemoryVaultRepo({}), policy: MEDIA_CREDENTIAL_POLICY, providerWrites: new TurnLock() });
  const keyring = new InMemoryKeyring();
  return { repo, deps: { repo, keyring, sealer: new AesGcmSecretSealer({ keyring }), clock } };
}

test("a first key for a provider is saved and reported configured, with no model or baseUrl", async () => {
  const { repo, deps } = makeDeps();
  assert.deepEqual(await saveMediaProviderKey({ saveProviders: ({ deps, workspaceId }, { providers }) => saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, input: { workspaceId, providers } }), deps, workspaceId: WS, provider: "openai", apiKey: "sk-first-abcd1234" }), { configured: true, tokenHint: { length: 17, last4: "1234" } });
  const [row] = await repo.listByWorkspaceId({ workspaceId: WS });
  assert.equal(row!.providerId, "openai");
  assert.equal(row!.baseUrl, null);
  assert.equal(row!.model, null);
});

test("saving one provider's key keeps its model/baseUrl and leaves every other provider untouched", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, input: { workspaceId: WS, providers: {
    openai: { apiKey: "sk-old-abcd1234", baseUrl: "https://proxy.example.test/v1", model: "gpt-image-1" },
    fal: { apiKey: "fal-key-wxyz9876" },
  } } });
  const before = await getMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, workspaceId: WS });
  assert.deepEqual(await saveMediaProviderKey({ saveProviders: ({ deps, workspaceId }, { providers }) => saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, input: { workspaceId, providers } }), deps, workspaceId: WS, provider: "openai", apiKey: "sk-new-efgh5678" }), { configured: true, tokenHint: { length: 15, last4: "5678" } });
  const after = await getMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, workspaceId: WS });
  assert.equal(after.openai!.baseUrl, "https://proxy.example.test/v1");
  assert.equal(after.openai!.model, "gpt-image-1");
  assert.equal(after.openai!.apiKeyTail, "5678");
  assert.deepEqual(after.fal, before.fal);
});

test("store validation errors propagate and nothing is written", async () => {
  const { repo, deps } = makeDeps();
  await assert.rejects(saveMediaProviderKey({ saveProviders: ({ deps, workspaceId }, { providers }) => saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, input: { workspaceId, providers } }), deps, workspaceId: WS, provider: "not-a-provider", apiKey: "sk-abcd1234" }));
  assert.deepEqual(await repo.listByWorkspaceId({ workspaceId: WS }), []);
});

test("a blank key preserves a migrated provider whose token length is unknown and returns no hint", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, input: { workspaceId: WS, providers: {
    openai: { apiKey: "sk-existing-abcd1234", baseUrl: "https://proxy.example.test/v1", model: "gpt-image-1" },
  } } });
  const scope = mediaVaultScope({ workspaceId: WS, providerId: "openai", policy: MEDIA_CREDENTIAL_POLICY });
  const [before] = await repo.vault.list(scope);
  assert.ok(before);
  // Boot migration can retain an envelope without an authoritative token-length hint.
  await repo.vault.put({ record: { ...before, tokenLength: null, last4: null, revision: before.revision + 1 }, expectedRevision: before.revision });

  assert.deepEqual(await saveMediaProviderKey({ saveProviders: ({ deps, workspaceId }, { providers }) => saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, input: { workspaceId, providers } }), deps, workspaceId: WS, provider: "openai", apiKey: "" }, {}), { configured: true, tokenHint: null });
  assert.deepEqual((await getMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, workspaceId: WS })).openai, {
    apiKeyConfigured: true, baseUrl: "https://proxy.example.test/v1", model: "gpt-image-1",
  });
  const [after] = await repo.vault.list(scope);
  assert.ok(after);
  assert.deepEqual(after.sealed, before.sealed);
  assert.equal(after.tokenLength, null);
  assert.equal(after.last4, null);
  assert.equal(after.createdAt, before.createdAt);
});
