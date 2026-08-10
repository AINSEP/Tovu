import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../../integrations/keyring.memory";
import type { KeyringPort } from "../../integrations/ports";
import { AesGcmSecretSealer } from "../../integrations/secret-sealer.aesgcm";
import { InMemoryMediaProviderCredentialRepo } from "../provider-credential-store.memory";
import {
  MediaProviderCredentialSecretStoreUnconfiguredError,
  MediaProviderCredentialValidationError,
  getMediaProviderCredentials,
  saveMediaProviderCredentials,
} from "../provider-credential-store";

/**
 * @file `provider-credential-store.ts` — the whole-map-replace credential contract behind the
 * admin's Media → "Media providers" tab.
 *
 * The assertions that matter most: a key is never echoed back, an omitted provider is DELETED
 * rather than left alone (the tab expresses Clear as an omission), an entry with no `apiKey` keeps
 * the stored key so a `baseUrl`-only edit does not silently wipe it, UI-spelled provider ids are
 * REJECTED so the engine-canonical id is the only thing that can ever reach storage, and a missing
 * master secret fails closed before any row is written rather than persisting a partial map.
 */

const WORKSPACE = "workspace-1";
const clock = { nowIso: () => "2026-08-09T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemoryMediaProviderCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, deps: { repo, keyring, sealer, clock } };
}

/** A `KeyringPort` that always fails — simulates a missing `TOVU_INTEGRATIONS_ROOT_KEY` without
 *  touching real env state. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no root key: TOVU_INTEGRATIONS_ROOT_KEY is not set");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
}

test("save stores a key and returns markers only, never the key", async () => {
  const { deps } = makeDeps();

  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-test-abcd1234", baseUrl: "https://api.openai.com/v1", model: "dall-e-3" } },
  });

  assert.deepEqual(saved, {
    openai: {
      baseUrl: "https://api.openai.com/v1",
      model: "dall-e-3",
      apiKeyConfigured: true,
      apiKeyTail: "1234",
    },
  });
  assert.equal(JSON.stringify(saved).includes("sk-test-abcd1234"), false);
});

test("the stored value round-trips through a fresh read", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { grok: { apiKey: "xai-key-wxyz", baseUrl: "https://api.x.ai/v1" } },
  });

  const read = await getMediaProviderCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });

  assert.deepEqual(read, {
    grok: { baseUrl: "https://api.x.ai/v1", apiKeyConfigured: true, apiKeyTail: "wxyz" },
  });
});

test("a provider omitted from the payload is DELETED, not left alone", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-one-1111" }, grok: { apiKey: "xai-two-2222" } },
  });

  // The tab expresses "Clear grok" by sending a map that simply lacks it.
  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKeyConfigured: true, apiKeyTail: "1111" } },
  });

  assert.deepEqual(Object.keys(saved), ["openai"]);
  const read = await getMediaProviderCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });
  assert.deepEqual(Object.keys(read), ["openai"]);
});

test("an entry with no apiKey keeps the stored key while editing other fields", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-keep-9999" } },
  });

  // What the tab actually re-sends for an untouched provider: the markers it was handed, no key.
  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKeyConfigured: true, apiKeyTail: "9999", model: "gpt-image-2" } },
  });

  assert.equal(saved.openai?.apiKeyConfigured, true);
  assert.equal(saved.openai?.apiKeyTail, "9999");
  assert.equal(saved.openai?.model, "gpt-image-2");
});

test("a blank apiKey is treated as absent, not as a clear", async () => {
  const { deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-blank-7777" } },
  });

  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "   " } },
  });

  assert.equal(saved.openai?.apiKeyConfigured, true);
  assert.equal(saved.openai?.apiKeyTail, "7777");
});

test("a provider with no key at all is stored without markers", async () => {
  const { deps } = makeDeps();

  const saved = await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { baseUrl: "https://proxy.example.com/v1" } },
  });

  assert.deepEqual(saved, { openai: { baseUrl: "https://proxy.example.com/v1" } });
});

test("UI-spelled provider ids are rejected so only engine-canonical ids reach storage", async () => {
  const { deps } = makeDeps();

  // The exact divergence that would otherwise persist keys the dispatch engine never finds.
  for (const uiSpelling of ["xai-grok-imagine", "nano-banana", "fal-ai", "leonardo-ai", "custom-image-api", "volcengine-ark"]) {
    await assert.rejects(
      saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: { [uiSpelling]: { apiKey: "k-1234" } } }),
      MediaProviderCredentialValidationError,
      `${uiSpelling} must be rejected`
    );
  }

  // ...and each one's engine-canonical counterpart is accepted.
  for (const canonical of ["grok", "nanobanana", "fal", "leonardo", "custom-image", "volcengine"]) {
    const saved = await saveMediaProviderCredentials(deps, {
      workspaceId: WORKSPACE,
      providers: { [canonical]: { apiKey: "k-1234" } },
    });
    assert.equal(saved[canonical]?.apiKeyConfigured, true, `${canonical} must be accepted`);
  }
});

test("a non-string or oversized field is rejected", async () => {
  const { deps } = makeDeps();

  await assert.rejects(
    saveMediaProviderCredentials(deps, {
      workspaceId: WORKSPACE,
      providers: { openai: { apiKey: 42 as unknown as string } },
    }),
    MediaProviderCredentialValidationError
  );
  await assert.rejects(
    saveMediaProviderCredentials(deps, {
      workspaceId: WORKSPACE,
      providers: { openai: { baseUrl: "x".repeat(2049) } },
    }),
    MediaProviderCredentialValidationError
  );
});

test("a missing master secret fails closed WITHOUT writing or deleting anything", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-intact-5555" }, grok: { apiKey: "xai-intact-6666" } },
  });

  const broken = { ...deps, keyring: new BrokenKeyring(), sealer: new AesGcmSecretSealer(new BrokenKeyring()) };
  await assert.rejects(
    // Also drops `grok` — proving the abort happens before the tombstone pass, not midway through.
    saveMediaProviderCredentials(broken, { workspaceId: WORKSPACE, providers: { openai: { apiKey: "sk-new-0000" } } }),
    MediaProviderCredentialSecretStoreUnconfiguredError
  );

  const after = await getMediaProviderCredentials({ repo }, { workspaceId: WORKSPACE });
  assert.deepEqual(after, {
    openai: { apiKeyConfigured: true, apiKeyTail: "5555" },
    grok: { apiKeyConfigured: true, apiKeyTail: "6666" },
  });
});

test("one workspace's providers are invisible to another", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-w1-1111" } },
  });
  await saveMediaProviderCredentials(deps, {
    workspaceId: "workspace-2",
    providers: { grok: { apiKey: "xai-w2-2222" } },
  });

  assert.deepEqual(Object.keys(await getMediaProviderCredentials({ repo }, { workspaceId: WORKSPACE })), ["openai"]);
  assert.deepEqual(Object.keys(await getMediaProviderCredentials({ repo }, { workspaceId: "workspace-2" })), ["grok"]);
});

test("an empty map clears every provider and reads back empty", async () => {
  const { repo, deps } = makeDeps();
  await saveMediaProviderCredentials(deps, {
    workspaceId: WORKSPACE,
    providers: { openai: { apiKey: "sk-gone-3333" } },
  });

  assert.deepEqual(await saveMediaProviderCredentials(deps, { workspaceId: WORKSPACE, providers: {} }), {});
  assert.deepEqual(await getMediaProviderCredentials({ repo }, { workspaceId: WORKSPACE }), {});
});
