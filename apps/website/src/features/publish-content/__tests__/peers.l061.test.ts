import assert from "node:assert/strict";
import test from "node:test";
import { VaultError, type VaultRecord, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { createPublishContentPeer, updatePublishContentPeer, InMemoryPublishContentPeerRepo, PublishContentPeerDuplicateLabelError, PublishContentPeerSecretStoreUnconfiguredError, PublishContentPeerNotFoundError, VaultPublishContentPeerRepo, type PublishContentPeerWriteDeps } from "../peers.js";

function fixture(_required = {}, _options = {}) {
  const repo = new InMemoryPublishContentPeerRepo();
  const keyring = new InMemoryKeyring();
  let id = 0;
  const deps: PublishContentPeerWriteDeps = { repo, keyring, sealer: new AesGcmSecretSealer(keyring), clock: { nowMs: () => 0 }, idGen: { newId: () => `peer-${++id}` } };
  const input = { workspaceId: "ws", label: "Live", baseUrl: "https://live.example", remoteWorkspaceId: "remote", apiKey: ["fixture", "credential"].join("-") };
  return { deps, repo, input };
}

test("L061 peer rename preserves credential bytes and defaults; rotation preserves metadata", async () => {
  const { deps, repo, input } = fixture();
  const created = await createPublishContentPeer(deps, input);
  const before = await repo.vault.find({ workspaceId: "ws", id: created.id });
  assert.ok(before);
  await repo.vault.put({ record: { ...before, meta: { ...before.meta, migration: { originalLabel: "preserved" } }, isDefault: true, revision: before.revision + 1 }, expectedRevision: before.revision });
  await updatePublishContentPeer(deps, { workspaceId: "ws", id: created.id, label: "Renamed", baseUrl: "https://other.example", remoteWorkspaceId: "remote-2" });
  const renamed = await repo.vault.find({ workspaceId: "ws", id: created.id });
  assert.ok(renamed);
  assert.deepEqual(renamed.sealed, before.sealed);
  assert.equal(renamed.isDefault, true);
  assert.equal(renamed.createdAt, before.createdAt);
  assert.deepEqual(renamed.meta.migration, { originalLabel: "preserved" });
  await updatePublishContentPeer(deps, { workspaceId: "ws", id: created.id, apiKey: ["replacement", "credential"].join("-") });
  const rotated = await repo.vault.find({ workspaceId: "ws", id: created.id });
  assert.ok(rotated);
  assert.deepEqual(rotated.meta.migration, { originalLabel: "preserved" });
  assert.notDeepEqual(rotated.sealed, before.sealed);
});

test("L061 vault facade handles absent updates and nullable/short/legacy hints without decryption", async () => {
  const { deps, repo, input } = fixture();
  const created = await createPublishContentPeer(deps, input);
  const record = await repo.findById({ workspaceId: "ws", id: created.id });
  assert.ok(record);
  await repo.update({ ...record, id: "absent" });
  assert.equal(await repo.findById({ workspaceId: "ws", id: "absent" }), null);
  const vault = await repo.vault.find({ workspaceId: "ws", id: created.id });
  assert.ok(vault);
  for (const [patch, masked] of [
    [{ tokenLength: null, last4: "abcd" }, "••••"], [{ tokenLength: 11, last4: "abcd" }, "••••"],
    [{ tokenLength: 12, last4: "abcdef" }, "••••cdef"], [{ tokenLength: 12, last4: null }, "••••"],
    [{ sealed: null, last4: null, tokenLength: null }, null],
  ] as const) {
    const current = await repo.vault.find({ workspaceId: "ws", id: created.id });
    assert.ok(current);
    await repo.vault.put({ record: { ...current, ...patch, revision: current.revision + 1 }, expectedRevision: current.revision });
    assert.equal((await repo.findById({ workspaceId: "ws", id: created.id }))?.masked, masked);
  }
  const current = await repo.findById({ workspaceId: "ws", id: created.id });
  assert.ok(current);
  await repo.update(current);
  assert.equal((await repo.vault.find({ workspaceId: "ws", id: created.id }))?.last4, null);
});

test("L061 create and rotation preserve duplicate-label and sanitized crypto error mapping", async () => {
  const { deps, input } = fixture();
  const first = await createPublishContentPeer(deps, input);
  const second = await createPublishContentPeer(deps, { ...input, label: "Second" });
  await assert.rejects(createPublishContentPeer(deps, input), PublishContentPeerDuplicateLabelError);
  for (const apiKey of [undefined, input.apiKey]) await assert.rejects(updatePublishContentPeer(deps, { workspaceId: "ws", id: second.id, label: "Live", apiKey }), PublishContentPeerDuplicateLabelError);
  for (const failure of [new Error("private driver detail"), new VaultError({ code: "conflict" }), new VaultError({ code: "context" })]) {
    const failing: PublishContentPeerWriteDeps = { ...deps, sealer: { ...deps.sealer, seal: async () => { throw failure; }, open: deps.sealer.open.bind(deps.sealer) } };
    for (const work of [() => createPublishContentPeer(failing, { ...input, label: "Unused" }), () => updatePublishContentPeer(failing, { workspaceId: "ws", id: first.id, apiKey: input.apiKey })]) {
      await assert.rejects(work(), (err: unknown) => failure instanceof VaultError ? err === failure : err instanceof PublishContentPeerSecretStoreUnconfiguredError && !err.message.includes("private driver detail"));
    }
  }
  await assert.rejects(updatePublishContentPeer(deps, { workspaceId: "ws", id: "absent" }), PublishContentPeerNotFoundError);
});

test("L061 vault projection retains every context guard", async () => {
  const { deps, repo, input } = fixture();
  const created = await createPublishContentPeer(deps, input);
  const stored = await repo.vault.find({ workspaceId: "ws", id: created.id });
  assert.ok(stored);
  for (const patch of [{ kind: "other" }, { ownerKey: "other" }, { principalId: "other" }, { provider: "other" }, { binding: "other" }]) {
    const vault = { ...repo.vault, find: async () => ({ ...stored, ...patch }) as VaultRecord, list: repo.vault.list.bind(repo.vault), put: repo.vault.put.bind(repo.vault), delete: repo.vault.delete.bind(repo.vault), patchMeta: repo.vault.patchMeta.bind(repo.vault) };
    // Supply the malformed record through the repository boundary rather than bypassing validation.
    await assert.rejects(new VaultPublishContentPeerRepo({ vault }).findById({ workspaceId: "ws", id: created.id }), VaultError);
  }
});

test("L061 facade rethrows write failures that are not label conflicts", async () => {
  const { deps, repo, input } = fixture();
  const created = await createPublishContentPeer(deps, input);
  const record = await repo.findById({ workspaceId: "ws", id: created.id });
  assert.ok(record);
  for (const failure of [new Error("driver failure"), new VaultError({ code: "context" }), new VaultError({ code: "conflict" })]) {
    const vault: VaultRepoPort = {
      find: repo.vault.find.bind(repo.vault), list: repo.vault.list.bind(repo.vault),
      put: async () => { throw failure; }, delete: repo.vault.delete.bind(repo.vault), patchMeta: repo.vault.patchMeta.bind(repo.vault),
    };
    await assert.rejects(new VaultPublishContentPeerRepo({ vault }).update(record), (err: unknown) => err === failure);
  }
});

test("L061 metadata update rethrows driver failures and rotation refuses a disappeared vault row", async () => {
  const { deps, repo, input } = fixture();
  const created = await createPublishContentPeer(deps, input);
  const failure = new Error("driver failure");
  const failingRepo = { vault: repo.vault, insert: repo.insert.bind(repo), update: async () => { throw failure; },
    findById: repo.findById.bind(repo), listByWorkspace: repo.listByWorkspace.bind(repo), delete: repo.delete.bind(repo) };
  await assert.rejects(updatePublishContentPeer({ ...deps, repo: failingRepo }, { workspaceId: "ws", id: created.id }), (err: unknown) => err === failure);
  const missingVault: VaultRepoPort = { find: async () => null, list: repo.vault.list.bind(repo.vault), put: repo.vault.put.bind(repo.vault),
    delete: repo.vault.delete.bind(repo.vault), patchMeta: repo.vault.patchMeta.bind(repo.vault) };
  await assert.rejects(updatePublishContentPeer({ ...deps, repo: { ...failingRepo, vault: missingVault } }, { workspaceId: "ws", id: created.id, apiKey: input.apiKey }), PublishContentPeerNotFoundError);
});
