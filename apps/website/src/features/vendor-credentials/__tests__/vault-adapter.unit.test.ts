import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo, VaultError, type VaultMeta, type VaultRecord, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { credentialHint, credentialScope, credentialVault, TovuCredentialSetVaultAdapter, VendorCredentialSetVaultRepo } from "../vault-adapter.js";
import type { VendorCredentialSetRecord } from "../types.js";
import type { SourceControlCredentialSetRecord } from "../../source-control/types.js";

const NOW = "2026-10-16T00:00:00.000Z";
const envelope = { keyId: "v1", ciphertext: "ciphertext", nonce: "nonce", alg: "aes-256-gcm" as const };
function row(patch: Partial<VaultRecord> = {}): VaultRecord {
  return { workspaceId: "ws", id: "credential", kind: "vendor", ownerKey: "tovu", principalId: null, binding: null,
    provider: "host", label: "Backup", sealed: envelope, meta: { credentialType: "vendor", worksFor: ["host"], accountLabel: null }, last4: "tail", tokenLength: 20,
    isDefault: true, revision: 1, createdAt: NOW, updatedAt: NOW, ...patch };
}
function dto(patch: Partial<VendorCredentialSetRecord> = {}): VendorCredentialSetRecord {
  return { workspaceId: "ws", id: "credential", vendorId: "host", credentialType: "vendor", worksFor: ["host"], label: "Backup", sealed: envelope,
    tokenTail: "tail", accountLabel: null, isDefault: true, createdAt: NOW, updatedAt: NOW, ...patch };
}
function adapter(vault: VaultRepoPort) {
  return new VendorCredentialSetVaultRepo({ vault, kind: "vendor", vendor: true });
}

for (const patch of [{ kind: "source-control" }, { ownerKey: "another" }, { principalId: "owner" }, { binding: "endpoint" }] as const) {
  test(`foreign ${Object.keys(patch)[0]} cannot be read, updated, patched or deleted through a vendor adapter`, async () => {
    const vault = new InMemoryVaultRepo({});
    const original = await vault.put({ record: row(patch), expectedRevision: null });
    const repo = adapter(vault);
    assert.equal(await repo.findById(original), null);
    await repo.update(dto({ label: "Overwrite" }));
    await repo.updateAccountLabel({ workspaceId: "ws", id: "credential", accountLabel: "overwrite" });
    await repo.delete(original);
    assert.deepEqual(await vault.find(original), original);
  });
}
for (const patch of [{ sealed: null }, { provider: null }] as const) test(`incomplete ${Object.keys(patch)[0]} fails closed`, async () => {
  const vault = new InMemoryVaultRepo({});
  await vault.put({ record: row(patch), expectedRevision: null });
  await assert.rejects(adapter(vault).findById({ workspaceId: "ws", id: "credential" }), { message: "Secrets vault: invalid-record" });
});

for (const [length, last4, tail, hint] of [
  [null, "tail", "", null], [0, null, "", { length: 0, last4: null }],
  [11, "tail", "", { length: 11, last4: null }], [12, null, "", { length: 12, last4: null }],
  [12, "tail", "tail", { length: 12, last4: "tail" }],
] as const) test(`vendor read model protects the suffix for length ${length} and tail ${last4}`, async () => {
  const vault = new InMemoryVaultRepo({});
  await vault.put({ record: row({ tokenLength: length, last4, meta: { credentialType: "vendor", worksFor: ["host"] } }), expectedRevision: null });
  const found = await adapter(vault).findById({ workspaceId: "ws", id: "credential" });
  assert.ok(found);
  assert.equal(found.accountLabel, null);
  assert.equal(found.tokenTail, tail);
  assert.deepEqual(found.tokenHint, hint);
  assert.equal(Object.keys(found).includes("tokenHint"), false);
  assert.deepEqual(credentialHint({ record: { tokenLength: length, last4 } }, {}), hint);
});

test("source-control DTOs retain providerId and never acquire vendor-only fields", async () => {
  const vault = new InMemoryVaultRepo({});
  const repo = new TovuCredentialSetVaultAdapter<SourceControlCredentialSetRecord>({ vault, kind: "source-control" }, {});
  const record: SourceControlCredentialSetRecord = { workspaceId: "ws", id: "source", providerId: "github", label: "Source", sealed: envelope, isDefault: true, accountLabel: "owner", createdAt: NOW, updatedAt: NOW };
  await repo.insert(record, {});
  assert.deepEqual(await repo.findById(record, {}), record);
  assert.deepEqual(await repo.findDefaultByProvider({ workspaceId: "ws", providerId: "github" }, {}), record);
  assert.deepEqual(await repo.listByProvider({ workspaceId: "ws", providerId: "github" }, {}), [record]);
  assert.deepEqual(await repo.listByWorkspace({ workspaceId: "ws" }, {}), [record]);
  assert.deepEqual(credentialScope({ workspaceId: "ws", kind: "source-control" }, {}), { workspaceId: "ws", kind: "source-control", ownerKey: "tovu", principalId: null, binding: null });
  assert.deepEqual(credentialScope({ workspaceId: "ws", kind: "source-control", id: "source" }), { workspaceId: "ws", kind: "source-control", ownerKey: "tovu", principalId: null, binding: null, id: "source" });
});

test("legacy ports without indexed defaults fail explicitly", async () => {
  const vault = new InMemoryVaultRepo({});
  const legacy: VaultRepoPort = { find: vault.find.bind(vault), list: vault.list.bind(vault), put: vault.put.bind(vault), patchMeta: vault.patchMeta.bind(vault), delete: vault.delete.bind(vault) };
  await assert.rejects(adapter(legacy).findDefaultByVendor({ workspaceId: "ws", vendorId: "host" }), { message: "Secrets vault: invalid-record" });
});

test("a vendor rename preserves its envelope hint and provenance through the public adapter methods", async () => {
  const vault = new InMemoryVaultRepo({});
  const saved = await vault.put({ record: row({ meta: { credentialType: "vendor", worksFor: ["host"], accountLabel: "old-owner", migration: { originalLabel: "Original" } } }), expectedRevision: null });
  const repo = adapter(vault);
  await repo.update(dto({ label: "Renamed", accountLabel: "new-owner" }), {});
  const expected = dto({ label: "Renamed", accountLabel: "new-owner" });
  assert.deepEqual(await repo.findDefaultByVendor({ workspaceId: "ws", vendorId: "host" }, {}), expected);
  assert.deepEqual(await repo.listByVendor({ workspaceId: "ws", vendorId: "host" }, {}), [expected]);
  assert.deepEqual(await vault.find(saved), { ...saved, label: "Renamed", revision: 2, meta: { ...saved.meta, accountLabel: "new-owner" } });
  await repo.delete(saved, {});
  assert.equal(await repo.findById(saved, {}), null);
  await repo.updateAccountLabel({ ...saved, accountLabel: "missing" }, {});
  assert.equal(await vault.find(saved), null);
});

test("updating a missing credential neither inserts it nor changes its siblings", async () => {
  const vault = new InMemoryVaultRepo({});
  const sibling = await vault.put({ record: row({ id: "sibling" }), expectedRevision: null });
  const repo = adapter(vault);
  await repo.update(dto());
  assert.equal(await vault.find({ workspaceId: "ws", id: "credential" }), null);
  assert.deepEqual(await vault.find(sibling), sibling);
});

for (const part of ["ciphertext", "nonce"] as const) test(`changing only the envelope ${part} clears the old hint`, async () => {
  const vault = new InMemoryVaultRepo({});
  await vault.put({ record: row(), expectedRevision: null });
  const repo = adapter(vault);
  await repo.update(dto({ sealed: { ...envelope, [part]: "changed" } }));
  const saved = await vault.find({ workspaceId: "ws", id: "credential" });
  assert.ok(saved);
  assert.deepEqual([saved.last4, saved.tokenLength, saved.revision], [null, null, 2]);
  assert.equal(saved.sealed?.[part], "changed");
});

for (const part of ["keyId", "ciphertext", "nonce", "alg"] as const) test(`a probe from an older ${part} cannot overwrite the account label`, async () => {
  const vault = new InMemoryVaultRepo({});
  const saved = await vault.put({ record: row({ meta: { credentialType: "vendor", worksFor: ["host"], accountLabel: "current" } }), expectedRevision: null });
  await adapter(vault).updateAccountLabel({ workspaceId: "ws", id: "credential", accountLabel: "stale", expectedSealed: { ...envelope, [part]: "different" } as typeof envelope });
  assert.deepEqual(await vault.find(saved), saved);
});

test("a matching probe changes only account metadata and keeps its original update timestamp", async () => {
  const vault = new InMemoryVaultRepo({});
  const saved = await vault.put({ record: row({ meta: { credentialType: "vendor", worksFor: ["host"], accountLabel: "old", migration: { originalLabel: "Original" } } }), expectedRevision: null });
  await adapter(vault).updateAccountLabel({ workspaceId: "ws", id: "credential", accountLabel: "new", expectedSealed: envelope }, {});
  assert.deepEqual(await vault.find(saved), { ...saved, revision: 2, meta: { ...saved.meta, accountLabel: "new" } });
});

for (const error of [new VaultError({ code: "conflict" }), new VaultError({ code: "invalid-record" }), new Error("database unavailable")]) {
  test(`account-label patch ${error.message} ${error instanceof VaultError && error.code === "conflict" ? "is a stale no-op" : "propagates"}`, async () => {
    class FailingPatchRepo extends InMemoryVaultRepo {
      override async patchMeta(): Promise<VaultRecord> { throw error; }
    }
    const vault = new FailingPatchRepo({});
    const saved = await vault.put({ record: row(), expectedRevision: null });
    const action = adapter(vault).updateAccountLabel({ workspaceId: "ws", id: "credential", accountLabel: "new" });
    if (error instanceof VaultError && error.code === "conflict") await action;
    else await assert.rejects(action, error);
    assert.deepEqual(await vault.find(saved), saved);
  });
}

function serviceFixture() {
  const vault = new InMemoryVaultRepo({});
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const required = { repo: { vault }, keyring, sealer, storageError: () => new Error("credential storage unavailable") };
  const scope = credentialScope({ workspaceId: "ws", kind: "vendor" });
  // New writes declare compatibility explicitly; legacy read defaults do not apply at creation.
  const input = { ...scope, provider: "host", label: "Backup", meta: { credentialType: "vendor", worksFor: ["host"], accountLabel: null }, expectedRevision: null, payload: { token: "private-token" } };
  return { vault, required, scope, input };
}

test("credential vault requires a repository and an injected generated id", async () => {
  const f = serviceFixture();
  assert.throws(() => credentialVault({ ...f.required, repo: {} }), { message: "Secrets vault: invalid-record" });
  await assert.rejects(credentialVault(f.required).put(f.input), { message: "Secrets vault: invalid-record" });
  assert.deepEqual(await f.vault.list(f.scope), []);
});
test("credential vault uses its default epoch clock and seals and opens through the configured ports", async () => {
  const f = serviceFixture();
  const service = credentialVault({ ...f.required, idGen: { newId: () => "generated" } }, {});
  const saved = await service.put(f.input);
  assert.equal(saved.id, "generated");
  assert.equal(saved.createdAt, "1970-01-01T00:00:00.000Z");
  assert.deepEqual((await service.get({ ...f.scope, id: saved.id }))?.payload, { token: "private-token" });
});
test("credential vault rejects new records missing credentialType or worksFor with invalid-meta", async () => {
  const f = serviceFixture();
  const service = credentialVault(f.required);
  const incompleteMetadata: VaultMeta[] = [
    { accountLabel: null },
    { accountLabel: null, worksFor: ["host"] },
    { accountLabel: null, credentialType: "vendor" },
  ];
  for (const meta of incompleteMetadata) {
    await assert.rejects(service.put({ ...f.input, id: "incomplete", meta }), {
      name: "VaultError", message: "Secrets vault: invalid-meta", code: "invalid-meta",
    });
    assert.equal(await f.vault.find({ workspaceId: "ws", id: "incomplete" }), null);
  }
});
test("credential vault accepts source-control ownership and the supplied clock", async () => {
  const f = serviceFixture();
  const scope = credentialScope({ workspaceId: "ws", kind: "source-control" });
  const service = credentialVault({ ...f.required, clock: { nowMs: () => Date.parse(NOW) } });
  // Source-control keeps its own metadata contract rather than inheriting vendor subtype fields.
  const saved = await service.put({ ...f.input, ...scope, id: "source", meta: { accountLabel: null } });
  assert.equal(saved.createdAt, NOW);
  assert.deepEqual((await service.get({ ...scope, id: "source" }))?.payload, { token: "private-token" });
});
// The legacy custom kind is an authorized compatibility scope, so use a store-only kind here.
for (const patch of [{ kind: "media-provider" }, { ownerKey: "foreign" }, { principalId: "foreign" }] as const) {
  test(`credential vault refuses foreign ${Object.keys(patch)[0]}`, async () => {
    const f = serviceFixture();
    await assert.rejects(credentialVault(f.required).get({ ...f.scope, ...patch, id: "missing" }), { message: "Secrets vault: context" });
  });
}
test("credential vault returns null for missing legacy custom records and rejects new custom-kind creation", async () => {
  const f = serviceFixture();
  const scope = credentialScope({ workspaceId: "ws", kind: "custom" });
  const service = credentialVault(f.required);
  assert.equal(await service.get({ ...scope, id: "missing" }), null);
  await assert.rejects(service.put({ ...f.input, ...scope, id: "custom", provider: null,
    meta: { credentialType: "custom", worksFor: [], category: "general" } }), {
    name: "VaultError", message: "Secrets vault: context", code: "context",
  });
  assert.deepEqual(await f.vault.list(scope), []);
});
for (const failure of ["missing-keyring", "active-key", "seal", "open"] as const) {
  test(`credential vault ${failure} errors expose only the feature storage error`, async t => {
    const f = serviceFixture();
    await credentialVault(f.required).put({ ...f.input, id: "existing" });
    const fail = async (): Promise<never> => { throw new Error("sensitive crypto failure"); };
    if (failure === "active-key") t.mock.method(f.required.keyring, "activeKey", fail);
    const required = { ...f.required,
      ...(failure === "missing-keyring" ? { keyring: undefined } : {}),
      sealer: { seal: failure === "seal" ? fail : f.required.sealer.seal.bind(f.required.sealer), open: failure === "open" ? fail : f.required.sealer.open.bind(f.required.sealer) },
    };
    const service = credentialVault(required);
    await assert.rejects(failure === "open" ? service.get({ ...f.scope, id: "existing" }) : service.put({ ...f.input, id: "new" }), { message: "credential storage unavailable" });
    assert.equal(await f.vault.find({ workspaceId: "ws", id: "new" }), null);
  });
}

// Characterization pins for the sealed-DTO compatibility mapping and write fallbacks.
test("custom subtypes in vendor storage are filtered before sealed-row validation", async () => {
  const vault = new InMemoryVaultRepo({});
  const saved = await vault.put({ record: row({ sealed: null, provider: null,
    meta: { credentialType: "custom", worksFor: [], category: "general" } }), expectedRevision: null });
  const repo = adapter(vault);
  assert.equal(await repo.findById(saved), null);
  assert.deepEqual(await repo.listByWorkspace({ workspaceId: "ws" }), []);
  await repo.update(dto());
  assert.deepEqual(await vault.find(saved), saved);
});

test("invalid owned metadata is rejected before incomplete sealed-row validation", async () => {
  const vault = new InMemoryVaultRepo({});
  const saved = await vault.put({ record: row({ sealed: null, meta: { credentialType: "unknown" } }), expectedRevision: null });
  await assert.rejects(adapter(vault).findById(saved), { code: "invalid-meta" });
});

for (const worksFor of [undefined, [], ["other-host"]]) {
  test(`insert compatibility ${JSON.stringify(worksFor)} defaults only when omitted and starts without a hint`, async () => {
    const vault = new InMemoryVaultRepo({});
    await adapter(vault).insert(dto({ worksFor }));
    const saved = await vault.find({ workspaceId: "ws", id: "credential" });
    assert.ok(saved);
    assert.deepEqual(saved.meta, { credentialType: "vendor", worksFor: worksFor ?? ["host"], accountLabel: null });
    assert.deepEqual([saved.last4, saved.tokenLength, saved.revision], [null, null, 1]);
  });
}

for (const existingWorksFor of [undefined, [], ["other-host"]]) {
  test(`update compatibility inherits ${JSON.stringify(existingWorksFor)} before falling back to vendor identity`, async () => {
    const vault = new InMemoryVaultRepo({});
    const meta: VaultMeta = { credentialType: "vendor", accountLabel: "old-owner" };
    if (existingWorksFor !== undefined) meta.worksFor = existingWorksFor;
    await vault.put({ record: row({ meta }), expectedRevision: null });
    await adapter(vault).update(dto({ worksFor: undefined }));
    const saved = await vault.find({ workspaceId: "ws", id: "credential" });
    assert.ok(saved);
    assert.deepEqual(saved.meta, { credentialType: "vendor", worksFor: existingWorksFor ?? ["host"], accountLabel: null });
    assert.deepEqual([saved.last4, saved.tokenLength, saved.revision], ["tail", 20, 2]);
  });
}

test("an explicit compatibility list replaces existing compatibility without dropping provenance", async () => {
  const vault = new InMemoryVaultRepo({});
  await vault.put({ record: row({ meta: { credentialType: "vendor", worksFor: ["old-host"], migration: { originalLabel: "Original" } } }), expectedRevision: null });
  await adapter(vault).update(dto({ worksFor: [] }));
  assert.deepEqual((await vault.find({ workspaceId: "ws", id: "credential" }))?.meta,
    { credentialType: "vendor", worksFor: [], migration: { originalLabel: "Original" }, accountLabel: null });
});

test("source-control updates retain metadata and hints while replacing accountLabel", async () => {
  const vault = new InMemoryVaultRepo({});
  const saved = await vault.put({ record: row({ kind: "source-control", meta: { accountLabel: "old", migration: { originalLabel: "Original" } } }), expectedRevision: null });
  const repo = new TovuCredentialSetVaultAdapter<SourceControlCredentialSetRecord>({ vault, kind: "source-control" });
  const found = await repo.findById(saved);
  assert.ok(found);
  await repo.update({ ...found, accountLabel: null });
  assert.deepEqual(await vault.find(saved), { ...saved, revision: 2, meta: { ...saved.meta, accountLabel: null } });
});
