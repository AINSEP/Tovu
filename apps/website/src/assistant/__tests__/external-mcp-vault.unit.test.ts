import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryVaultRepo, VaultError, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";

import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import {
  deleteExternalMcpVaultEnvelope,
  externalMcpVaultEnvelope,
  externalMcpVaultRecord,
  openExternalMcpVaultPayload,
  persistExternalMcpVaultEnvelope,
  sealExternalMcpVaultPayload,
} from "../external-mcp-vault.js";

/**
 * @file The External MCP vault envelope: a sealed payload carries its vault context in memory only,
 * opens only for the identity and kind it was sealed for, persists once (a staged envelope) and is
 * idempotent for the same bytes, and refuses any mismatch with a `VaultError` rather than guessing.
 */

const keyring = new InMemoryKeyring();
const sealer = new AesGcmSecretSealer(keyring);
const deps = { sealer, keyring };
const identity = { workspaceId: "ws-vault", serverId: "server-a" };
const payload = { TOKEN_ENV: "value-built-at-runtime" };

function vaultCode(code: VaultError["code"]) {
  return (error: unknown) => error instanceof VaultError && error.code === code;
}

test("a sealed payload opens back to the same payload for its own identity and kind", async () => {
  const sealed = await sealExternalMcpVaultPayload({ deps, identity, kind: "mcp-env", payload });
  assert.deepEqual(await openExternalMcpVaultPayload({ sealer, sealed, identity, kind: "mcp-env" }), payload);
  assert.deepEqual(Object.keys(sealed).sort(), ["alg", "ciphertext", "keyId", "nonce"], "the vault context never serializes with the envelope");
});

test("the envelope refuses to open for another server, workspace or kind", async () => {
  const sealed = await sealExternalMcpVaultPayload({ deps, identity, kind: "mcp-auth", payload });
  await assert.rejects(openExternalMcpVaultPayload({ sealer, sealed, identity: { ...identity, serverId: "server-b" }, kind: "mcp-auth" }), vaultCode("context"));
  await assert.rejects(openExternalMcpVaultPayload({ sealer, sealed, identity: { ...identity, workspaceId: "ws-other" }, kind: "mcp-auth" }), vaultCode("context"));
  await assert.rejects(openExternalMcpVaultPayload({ sealer, sealed, identity, kind: "mcp-env" }), vaultCode("context"));
  assert.throws(() => externalMcpVaultRecord({ sealed: { ...sealed }, identity, kind: "mcp-auth" }), vaultCode("context"), "a plain copy has lost its context");
});

test("a foreign vault kind is refused before any sealing", async () => {
  const foreign = "publish-credential" as unknown as "mcp-env";
  await assert.rejects(sealExternalMcpVaultPayload({ deps, identity, kind: foreign, payload }), vaultCode("context"));
});

test("externalMcpVaultEnvelope is null for a record with nothing sealed", () => {
  const record = { workspaceId: identity.workspaceId, id: "x", sealed: null } as unknown as VaultRecord;
  assert.equal(externalMcpVaultEnvelope({ record }), null);
});

test("a staged envelope persists once, re-persists idempotently, and refuses different bytes under the same id", async () => {
  const repo = new InMemoryVaultRepo({});
  assert.equal(await persistExternalMcpVaultEnvelope({ repo, sealed: null, identity, kind: "mcp-env" }), null);
  const sealed = await sealExternalMcpVaultPayload({ deps, identity, kind: "mcp-env", payload });
  const id = await persistExternalMcpVaultEnvelope({ repo, sealed, identity, kind: "mcp-env" });
  assert.equal(typeof id, "string");
  const stored = await repo.find({ workspaceId: identity.workspaceId, id: id! });
  assert.equal(stored?.ownerKey, identity.serverId);
  assert.equal(await persistExternalMcpVaultEnvelope({ repo, sealed, identity, kind: "mcp-env" }), id, "the same bytes again are a no-op");

  const record = externalMcpVaultRecord({ sealed, identity, kind: "mcp-env" });
  const tampered = externalMcpVaultEnvelope({ record: { ...record, sealed: { ...record.sealed!, ciphertext: `${record.sealed!.ciphertext}AA` } } }, { staged: true })!;
  await assert.rejects(persistExternalMcpVaultEnvelope({ repo, sealed: tampered, identity, kind: "mcp-env" }), vaultCode("conflict"));
});

test("an envelope that was read back (not staged) is never written as a new record", async () => {
  const repo = new InMemoryVaultRepo({});
  const sealed = await sealExternalMcpVaultPayload({ deps, identity, kind: "mcp-env", payload });
  const record = externalMcpVaultRecord({ sealed, identity, kind: "mcp-env" });
  const readBack = externalMcpVaultEnvelope({ record })!;
  await assert.rejects(persistExternalMcpVaultEnvelope({ repo, sealed: readBack, identity, kind: "mcp-env" }), vaultCode("conflict"));
  assert.equal((await repo.find({ workspaceId: identity.workspaceId, id: record.id })) ?? null, null);
});

test("delete removes a stored envelope and is a no-op for a null or missing id", async () => {
  const repo = new InMemoryVaultRepo({});
  const sealed = await sealExternalMcpVaultPayload({ deps, identity, kind: "mcp-auth", payload });
  const id = (await persistExternalMcpVaultEnvelope({ repo, sealed, identity, kind: "mcp-auth" }))!;
  await deleteExternalMcpVaultEnvelope({ repo, workspaceId: identity.workspaceId, id: null });
  await deleteExternalMcpVaultEnvelope({ repo, workspaceId: identity.workspaceId, id: "missing-id" });
  assert.equal((await repo.find({ workspaceId: identity.workspaceId, id }))?.id, id);
  await deleteExternalMcpVaultEnvelope({ repo, workspaceId: identity.workspaceId, id });
  assert.equal((await repo.find({ workspaceId: identity.workspaceId, id })) ?? null, null);
});
