import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo, VaultError, type VaultContext, type VaultRecord, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import type { KeyringPort } from "../../features/webhooks/index.js";
import { assistantVaultContext, assistantVaultId, assistantVaultRepo, createAssistantVault, readAssistantVault } from "../assistant-vault.js";

const clock = { nowMs: () => Date.parse("2026-08-04T00:00:00.000Z"), nowIso: () => "2026-08-04T00:00:00.000Z" };
const SITE = assistantVaultContext({ workspaceId: "ws", kind: "site-assistant" });
const PERSONAL = assistantVaultContext({ workspaceId: "ws", kind: "personal-execution", principalId: "p1" });
const API_KEY = "sk-test-ABCDEFGHIJKLMNOP9876";

/** Seals one singleton through the real vault lifecycle and returns the stored row. */
async function seed(required: { repo: InMemoryVaultRepo; context: VaultContext; payload?: Record<string, string>; keyring?: KeyringPort }): Promise<VaultRecord> {
  const keyring = required.keyring ?? new InMemoryKeyring();
  const vault = createAssistantVault({ repo: required.repo, context: required.context, keyring, sealer: new AesGcmSecretSealer(keyring), clock });
  await vault.put({ ...required.context, expectedRevision: null, provider: "google", label: "", meta: {}, payload: required.payload ?? { apiKey: API_KEY } });
  return (await required.repo.findOne(required.context))!;
}

/** Keyring whose active key read fails with a non-Error value, as a misbehaving adapter might. */
class ThrowingKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> { throw "keyring offline"; }
  async derive(): Promise<Uint8Array> { throw "keyring offline"; }
  async deriveSigningSecret(): Promise<Uint8Array> { throw "keyring offline"; }
}

test("assistantVaultRepo refuses a repository object with no vault property", () => {
  assert.throws(() => assistantVaultRepo({ repo: {} }), { name: "VaultError", code: "invalid-record" });
});

for (const [name, vault] of [["an undefined vault", undefined], ["a vault without singleton lookup", {}]] as const) {
  test(`assistantVaultRepo refuses ${name}`, () => {
    assert.throws(() => assistantVaultRepo({ repo: { vault } }), { name: "VaultError", code: "invalid-record" });
  });
}

test("assistantVaultRepo returns the exposed vault port itself", () => {
  const vault = new InMemoryVaultRepo({});
  assert.equal(assistantVaultRepo({ repo: { vault } }), vault);
});

test("assistantVaultContext pins Tovu ownership, no binding and a null principal by default", () => {
  assert.deepEqual(SITE, { workspaceId: "ws", kind: "site-assistant", ownerKey: "tovu", principalId: null, binding: null });
  assert.equal(PERSONAL.principalId, "p1");
});

test("assistantVaultId encodes kind and principal as the migration's singleton ID", () => {
  assert.equal(assistantVaultId({ context: PERSONAL }), 'vault:["personal-execution","p1"]');
});

test("createAssistantVault mints the singleton ID for new personal-execution records", async () => {
  const repo = new InMemoryVaultRepo({});
  assert.equal((await seed({ repo, context: PERSONAL })).id, assistantVaultId({ context: PERSONAL }));
});

test("createAssistantVault without a sealer refuses to seal a payload", async () => {
  const vault = createAssistantVault({ repo: new InMemoryVaultRepo({}), context: SITE, keyring: new InMemoryKeyring(), clock });
  await assert.rejects(vault.put({ ...SITE, expectedRevision: null, provider: "google", label: "", meta: {}, payload: { apiKey: API_KEY } }),
    { name: "VaultError", code: "invalid-record" });
});

test("createAssistantVault without a sealer refuses to open a stored envelope", async () => {
  const repo = new InMemoryVaultRepo({});
  await seed({ repo, context: SITE });
  await assert.rejects(createAssistantVault({ repo, context: SITE }).findOne(SITE), { name: "VaultError", code: "invalid-record" });
});

test("createAssistantVault maps a non-Error storage failure to invalid-record", async () => {
  const keyring = new ThrowingKeyring();
  const vault = createAssistantVault({ repo: new InMemoryVaultRepo({}), context: SITE, keyring, sealer: new AesGcmSecretSealer(keyring), clock });
  await assert.rejects(vault.put({ ...SITE, expectedRevision: null, provider: "google", label: "", meta: {}, payload: { apiKey: API_KEY } }),
    { name: "VaultError", code: "invalid-record" });
});

test("createAssistantVault hands crypto failures to onSealFailure", async () => {
  const keyring = new ThrowingKeyring();
  const seen: unknown[] = [];
  const vault = createAssistantVault({ repo: new InMemoryVaultRepo({}), context: SITE, keyring, sealer: new AesGcmSecretSealer(keyring), clock },
    { onSealFailure: error => { seen.push(error); throw new Error("site key unconfigured"); } });
  await assert.rejects(vault.put({ ...SITE, expectedRevision: null, provider: "google", label: "", meta: {}, payload: { apiKey: API_KEY } }),
    { message: "site key unconfigured" });
  assert.deepEqual(seen, ["keyring offline"]);
});

test("readAssistantVault returns an empty read when no singleton exists", async () => {
  assert.deepEqual(await readAssistantVault({ repo: new InMemoryVaultRepo({}), context: SITE }), { record: null, tokenHint: null });
});

test("readAssistantVault opens the stored envelope and derives the token hint", async () => {
  const repo = new InMemoryVaultRepo({});
  const keyring = new InMemoryKeyring();
  const stored = await seed({ repo, context: SITE, keyring });
  const read = await readAssistantVault({ repo, context: SITE, sealer: new AesGcmSecretSealer(keyring) });
  assert.deepEqual(read.record, stored);
  assert.deepEqual(read.tokenHint, { last4: "9876", length: API_KEY.length });
});

test("readAssistantVault uses a supplied snapshot instead of reading the repository", async t => {
  const repo = new InMemoryVaultRepo({});
  const stored = await seed({ repo, context: SITE });
  const findOne = t.mock.method(repo, "findOne");
  const read = await readAssistantVault({ repo, context: SITE }, { record: stored });
  assert.deepEqual(read, { record: stored, tokenHint: null });
  assert.equal(findOne.mock.callCount(), 0);
});

test("readAssistantVault refuses a row whose identity is outside the requested scope", async () => {
  const repo = new InMemoryVaultRepo({});
  const stored = await seed({ repo, context: SITE });
  await assert.rejects(readAssistantVault({ repo, context: SITE }, { record: { ...stored, workspaceId: "other" } }),
    { name: "VaultError", code: "context" });
});

test("readAssistantVault keeps settings but drops the hint when the envelope cannot be opened", async () => {
  const repo = new InMemoryVaultRepo({});
  const stored = await seed({ repo, context: SITE });
  const read = await readAssistantVault({ repo, context: SITE, sealer: new AesGcmSecretSealer(new InMemoryKeyring("v2")) });
  assert.deepEqual(read, { record: stored, tokenHint: null });
});

test("readAssistantVault gives no hint when the opened payload has no string apiKey", async () => {
  const repo = new InMemoryVaultRepo({});
  const keyring = new InMemoryKeyring();
  await seed({ repo, context: SITE, payload: { other: "value" }, keyring });
  assert.equal((await readAssistantVault({ repo, context: SITE, sealer: new AesGcmSecretSealer(keyring) })).tokenHint, null);
});

test("readAssistantVault does not open a keyless row", async t => {
  const repo = new InMemoryVaultRepo({});
  const stored = await seed({ repo, context: SITE });
  const sealer = new AesGcmSecretSealer(new InMemoryKeyring());
  const open = t.mock.method(sealer, "open");
  assert.deepEqual(await readAssistantVault({ repo, context: SITE, sealer }, { record: { ...stored, sealed: null } }),
    { record: { ...stored, sealed: null }, tokenHint: null });
  assert.equal(open.mock.callCount(), 0);
});

test("readAssistantVault refuses a repository without singleton lookup", async () => {
  const repo: VaultRepoPort = Object.create(new InMemoryVaultRepo({}));
  repo.findOne = undefined;
  await assert.rejects(readAssistantVault({ repo, context: SITE }), (error: unknown) => error instanceof VaultError && error.code === "invalid-record");
});
