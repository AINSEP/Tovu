import assert from "node:assert/strict";
import test from "node:test";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import { CREDENTIAL_MESSAGES, normalizeCredentialToken } from "@jini-ai/platform/secrets/credential-token";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryMediaProviderCredentialRepo } from "../provider-credential-store.memory.js";
import { MediaProviderCredentialValidationError, saveMediaProviderCredentials } from "../provider-credential-store.js";

/**
 * @file Unexpected failures inside the credential policy checks must surface unchanged — only a
 * `CredentialInputError` is an operator mistake that becomes a `MediaProviderCredentialValidationError`.
 *
 * The real policy only throws `CredentialInputError`, so the rethrow arms are reachable only with
 * a substituted policy. The store takes its policy as `deps.credentialPolicy` (defaulting to the real
 * pair), so the substitute is passed in; no module is mocked. It fails with a plain `Error` for one
 * sentinel value only and otherwise delegates to the real rules.
 */

const SENTINEL = "explode-sentinel";
const unexpected = new Error("policy engine crashed");
const credentialPolicy = {
  assertCredentialFreeField: (required: { value: string; field: string }, optional = {}) => {
    if (required.value === SENTINEL) throw unexpected;
    assertCredentialFreeField(required, optional);
  },
  normalizeCredentialToken: (required: Parameters<typeof normalizeCredentialToken>[0]) => {
    if (required.value === SENTINEL) throw unexpected;
    return normalizeCredentialToken(required);
  },
};


const clock = { nowMs: () => Date.parse("2026-08-09T00:00:00.000Z"), nowIso: () => "2026-08-09T00:00:00.000Z" };

async function assertRethrown(providers: Record<string, Record<string, string>>) {
  const keyring = new InMemoryKeyring();
  const repo = new InMemoryMediaProviderCredentialRepo();
  await assert.rejects(saveMediaProviderCredentials({ repo, keyring, sealer: new AesGcmSecretSealer(keyring), clock, credentialPolicy },
    { workspaceId: "workspace-1", providers }), (err: unknown) => err === unexpected);
  assert.deepEqual(await repo.listByWorkspaceId({ workspaceId: "workspace-1" }), []);
}

test("an unexpected failure checking the provider id is rethrown unchanged", async () => {
  await assertRethrown({ [SENTINEL]: {} });
});

test("an unexpected failure checking a metadata field is rethrown unchanged", async () => {
  await assertRethrown({ openai: { apiKey: "k-1234", baseUrl: SENTINEL } });
});

test("an unexpected failure normalizing a new key is rethrown unchanged", async () => {
  await assertRethrown({ openai: { apiKey: SENTINEL } });
});

test("with no credentialPolicy supplied, a secret-shaped baseUrl is refused as a validation error", async () => {
  const keyring = new InMemoryKeyring();
  const repo = new InMemoryMediaProviderCredentialRepo();
  await assert.rejects(saveMediaProviderCredentials({ repo, keyring, sealer: new AesGcmSecretSealer(keyring), clock },
    { workspaceId: "workspace-1", providers: { openai: { baseUrl: "https://api.openai.com/v1?token=ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8" } } }),
  // The message proves the store's own default policy refused it, not a later vault rule that also rejects secret-shaped metadata.
  (err: unknown) => err instanceof MediaProviderCredentialValidationError && err.message === CREDENTIAL_MESSAGES.plain);
  assert.deepEqual(await repo.listByWorkspaceId({ workspaceId: "workspace-1" }), []);
});
