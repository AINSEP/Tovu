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

// L11 Stryker: each `context.<field> !== …` clause mutated to `false` survived — a mismatch on one
// field alone must refuse, so each field gets its own row with every other field matching.
test("a context that differs in exactly one field is refused with VaultError{code:'context'}", async () => {
  const sealed = await sealExternalMcpVaultPayload({ deps, identity, kind: "mcp-env", payload });
  const record = externalMcpVaultRecord({ sealed, identity, kind: "mcp-env" });
  assert.equal(externalMcpVaultRecord({ sealed: externalMcpVaultEnvelope({ record })!, identity, kind: "mcp-env" }).id, record.id, "the unmodified record passes");
  for (const [field, value] of [
    ["workspaceId", "ws-other"], ["ownerKey", "server-b"], ["kind", "mcp-auth"],
    ["principalId", "principal-1"], ["binding", { kind: "site" }], ["principalId", ""],
  ] as const) {
    const altered = externalMcpVaultEnvelope({ record: { ...record, [field]: value } as VaultRecord })!;
    assert.throws(() => externalMcpVaultRecord({ sealed: altered, identity, kind: "mcp-env" }), vaultCode("context"), `${field}=${JSON.stringify(value)}`);
    await assert.rejects(openExternalMcpVaultPayload({ sealer, sealed: altered, identity, kind: "mcp-env" }), vaultCode("context"), `open ${field}`);
  }
});

test("both supported kinds seal and open; every other kind is refused before crypto", async () => {
  for (const kind of ["mcp-env", "mcp-auth"] as const) {
    const sealed = await sealExternalMcpVaultPayload({ deps, identity, kind, payload });
    assert.deepEqual(await openExternalMcpVaultPayload({ sealer, sealed, identity, kind }), payload, kind);
  }
  let sealCalls = 0;
  const countingSealer = { open: sealer.open.bind(sealer), seal: async (...args: Parameters<typeof sealer.seal>) => { sealCalls += 1; return sealer.seal(...args); } };
  for (const foreign of ["mcp-other", "", "MCP-ENV", "publish-credential"]) {
    await assert.rejects(sealExternalMcpVaultPayload({ deps: { sealer: countingSealer, keyring }, identity, kind: foreign as "mcp-env", payload }), vaultCode("context"), foreign);
  }
  assert.equal(sealCalls, 0);
});

test("an existing record under the same id with another kind or owner is a conflict, not a silent reuse", async () => {
  const sealed = await sealExternalMcpVaultPayload({ deps, identity, kind: "mcp-env", payload });
  const record = externalMcpVaultRecord({ sealed, identity, kind: "mcp-env" });
  for (const [field, value] of [["kind", "mcp-auth"], ["ownerKey", "server-b"]] as const) {
    const repo = new InMemoryVaultRepo({});
    await repo.put({ record: { ...record, [field]: value, revision: 1 }, expectedRevision: null });
    await assert.rejects(persistExternalMcpVaultEnvelope({ repo, sealed, identity, kind: "mcp-env" }), vaultCode("conflict"), field);
  }
});
