import assert from "node:assert/strict";
import { mock } from "node:test";
import test from "node:test";

/**
 * @file Unexpected failures inside the credential policy checks must surface unchanged — only a
 * `CredentialInputError` is an operator mistake that becomes a `MediaProviderCredentialValidationError`.
 *
 * The real policy only throws `CredentialInputError`, so the rethrow arms are reachable only with
 * a substituted policy module. `mock.module()` is registered, with the real module's own exports
 * spread through it, before the store is imported, because it cannot rebind a specifier a module
 * already resolved. The substitute fails with a plain `Error` for one sentinel value only.
 */

const SENTINEL = "explode-sentinel";
const unexpected = new Error("policy engine crashed");
const real = await import("#src/contracts/core/credential-token");
mock.module("#src/contracts/core/credential-token", { namedExports: { ...real,
  assertCredentialFreeField: (required: { value: string; field: string }, optional = {}) => {
    if (required.value === SENTINEL) throw unexpected;
    real.assertCredentialFreeField(required, optional);
  },
  normalizeCredentialToken: (required: Parameters<typeof real.normalizeCredentialToken>[0]) => {
    if (required.value === SENTINEL) throw unexpected;
    return real.normalizeCredentialToken(required);
  },
} });

const { InMemoryKeyring } = await import("../../webhooks/keyring.memory.js");
const { AesGcmSecretSealer } = await import("../../webhooks/secret-sealer.aesgcm.js");
const { InMemoryMediaProviderCredentialRepo } = await import("../provider-credential-store.memory.js");
const { saveMediaProviderCredentials } = await import("../provider-credential-store.js");

const clock = { nowMs: () => Date.parse("2026-08-09T00:00:00.000Z"), nowIso: () => "2026-08-09T00:00:00.000Z" };

async function assertRethrown(providers: Record<string, Record<string, string>>) {
  const keyring = new InMemoryKeyring();
  const repo = new InMemoryMediaProviderCredentialRepo();
  await assert.rejects(saveMediaProviderCredentials({ repo, keyring, sealer: new AesGcmSecretSealer(keyring), clock },
    { workspaceId: "workspace-1", providers }), (err: unknown) => err === unexpected);
  assert.deepEqual(await repo.listByWorkspaceId("workspace-1"), []);
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
