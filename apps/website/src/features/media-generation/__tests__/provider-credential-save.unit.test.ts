import assert from "node:assert/strict";
import test from "node:test";

import type { UUID } from "@jini-ai/core/primitives";

import { InMemoryMediaProviderCredentialRepo } from "../../media/provider-credential-store.memory.js";
import { getMediaProviderCredentials, saveMediaProviderCredentials } from "../../media/provider-credential-store.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { saveMediaProviderKey } from "../provider-credential-save.js";

/**
 * @file `saveMediaProviderKey`: the agent tool's single-provider key save over the admin PUT's
 * whole-set store path. The store's own validation and sealing are tested in
 * `media/__tests__/provider-credential-store.test.ts`; here, the single-provider patch: other rows
 * are never tombstoned, and the saved provider keeps its model/baseUrl.
 */

const WS = "ws-media" as UUID;
const clock = { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z"), nowIso: () => "2026-10-04T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemoryMediaProviderCredentialRepo();
  const keyring = new InMemoryKeyring();
  return { repo, deps: { repo, keyring, sealer: new AesGcmSecretSealer(keyring), clock } };
}

test("a first key for a provider is saved and reported configured, with no model or baseUrl", async () => {
  const { repo, deps } = makeDeps();
  assert.deepEqual(await saveMediaProviderKey({ deps, workspaceId: WS, provider: "openai", apiKey: "sk-first-abcd1234" }), { configured: true, tokenHint: { length: 17, last4: "1234" } });
  const [row] = await repo.listByWorkspaceId(WS);
  assert.equal(row!.providerId, "openai");
  assert.equal(row!.baseUrl, null);
  assert.equal(row!.model, null);
});

test("saving one provider's key keeps its model/baseUrl and leaves every other provider untouched", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, { workspaceId: WS, providers: {
    openai: { apiKey: "sk-old-abcd1234", baseUrl: "https://proxy.example.test/v1", model: "gpt-image-1" },
    fal: { apiKey: "fal-key-wxyz9876" },
  } });
  const before = await getMediaProviderCredentials(deps, { workspaceId: WS });
  assert.deepEqual(await saveMediaProviderKey({ deps, workspaceId: WS, provider: "openai", apiKey: "sk-new-efgh5678" }), { configured: true, tokenHint: { length: 15, last4: "5678" } });
  const after = await getMediaProviderCredentials(deps, { workspaceId: WS });
  assert.equal(after.openai!.baseUrl, "https://proxy.example.test/v1");
  assert.equal(after.openai!.model, "gpt-image-1");
  assert.equal(after.openai!.apiKeyTail, "5678");
  assert.deepEqual(after.fal, before.fal);
});

test("store validation errors propagate and nothing is written", async () => {
  const { repo, deps } = makeDeps();
  await assert.rejects(saveMediaProviderKey({ deps, workspaceId: WS, provider: "not-a-provider", apiKey: "sk-abcd1234" }));
  assert.deepEqual(await repo.listByWorkspaceId(WS), []);
});
