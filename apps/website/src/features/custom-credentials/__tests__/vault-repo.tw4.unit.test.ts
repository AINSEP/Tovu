import assert from "node:assert/strict";
import test from "node:test";
import { VaultError, type VaultRecord, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { CustomCredentialVaultRepo, customVaultRecord } from "../vault-repo.js";
import type { CustomCredentialSetRecord } from "../types.js";

function row(overrides: Partial<VaultRecord> = {}, _options = {}): VaultRecord {
  return { workspaceId: "workspace", id: "credential", kind: "vendor", ownerKey: "tovu", principalId: null,
    binding: null, provider: null, label: "Example", isDefault: true, revision: 3,
    sealed: { keyId: "key", ciphertext: "ciphertext", nonce: "nonce", alg: "aes-256-gcm" },
    last4: "tail", tokenLength: 24,
    meta: { credentialType: "custom", worksFor: ["host"], category: "general", baseUrl: "https://example.com", additionalHosts: [], username: null },
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", ...overrides };
}

function fixture({ existing = null, failure, siblings = [] }: { existing?: VaultRecord | null; failure?: Error; siblings?: VaultRecord[] } = {}, _options = {}) {
  const puts: Parameters<VaultRepoPort["put"]>[0][] = [];
  const vault: VaultRepoPort = {
    find: async () => existing,
    list: async input => siblings.filter(item => item.kind === input.kind),
    put: async input => { puts.push(input); if (failure) throw failure; return { ...input.record, isDefault: input.record.isDefault ?? false }; },
    patchMeta: async () => { throw new Error("unexpected patch"); },
    delete: async () => false,
  };
  return { repo: new CustomCredentialVaultRepo({ vault }), puts };
}

for (const overrides of [
  { kind: "source-control" }, { kind: "vendor", meta: {} }, { ownerKey: "foreign" },
  { principalId: "person" }, { binding: "bound" }, { provider: "provider" },
] satisfies Partial<VaultRecord>[]) {
  test(`custom record refuses foreign context ${JSON.stringify(overrides)}`, () => {
    assert.throws(() => customVaultRecord({ row: row(overrides) }), error => error instanceof VaultError && error.code === "context");
  });
}

test("projection supports legacy/custom vendor rows, metadata-only usernames and private revisions", () => {
  for (const kind of ["custom", "vendor"] as const) {
    for (const username of [null, undefined, "account"]) {
      const source = row({ kind });
      if (username === undefined) delete source.meta.username;
      else source.meta.username = username;
      const record = customVaultRecord({ row: source, expectedRevision: null });
      assert.equal(record.username, username ?? undefined);
      assert.equal(Object.hasOwn(record, "username"), username != null);
      assert.equal(record.vaultExpectedRevision, null);
      assert.equal(Object.keys(record).includes("vaultRecord"), false);
      assert.equal(Object.keys(record).includes("vaultExpectedRevision"), false);
      assert.equal(customVaultRecord({ row: source }).vaultExpectedRevision, undefined);
    }
  }
  assert.throws(() => customVaultRecord({ row: row({ sealed: null }) }), error => error instanceof VaultError && error.code === "invalid-record");
});

test("find filters unrelated kinds but keeps context validation on matching kinds", async () => {
  for (const existing of [null, row({ kind: "source-control" }), row({ meta: {} })]) {
    assert.equal(await fixture({ existing }).repo.findById({ workspaceId: "workspace", id: "credential" }), null);
  }
  await assert.rejects(fixture({ existing: row({ ownerKey: "foreign" }) }).repo.findById({ workspaceId: "workspace", id: "credential" }), { code: "context" });
});

for (const kind of ["custom", "vendor"] as const) {
  test(`compatibility ${kind} writes preserve identical-envelope hints and metadata fallbacks`, async () => {
    const source = row({ kind });
    const dto = { ...customVaultRecord({ row: source }) };
    for (const field of [undefined, "keyId", "ciphertext", "nonce", "alg"] as const) {
      const { repo, puts } = fixture({ existing: source });
      const sealed = { ...dto.sealed };
      if (field) sealed[field] += "-changed";
      const { worksFor: _oldWorksFor, ...withoutWorksFor } = dto;
      await repo.update({ ...withoutWorksFor, sealed, updatedAt: "2026-10-03T00:00:00.000Z" });
      const written = puts[0]!;
      assert.equal(written.expectedRevision, 3);
      assert.equal(written.record.kind, kind);
      assert.equal(written.record.revision, 4);
      assert.equal(written.record.last4, field ? null : "tail");
      assert.equal(written.record.tokenLength, field ? null : 24);
      assert.deepEqual(written.record.meta.worksFor, ["host"]);
      assert.equal(written.record.meta.username, null);
      assert.equal(written.record.isDefault, true);
      assert.equal(written.record.createdAt, source.createdAt);
    }
  });
}

test("insert defaults and explicit compatibility IDs are preserved; missing update is a no-op", async () => {
  const dto = { ...customVaultRecord({ row: row() }), worksFor: [] };
  const { repo, puts } = fixture();
  await repo.update(dto);
  assert.equal(puts.length, 0);
  await repo.insert(dto);
  assert.equal(puts[0]!.expectedRevision, null);
  assert.equal(puts[0]!.record.revision, 1);
  assert.equal(puts[0]!.record.last4, null);
  assert.equal(puts[0]!.record.isDefault, false);
  assert.deepEqual(puts[0]!.record.meta.worksFor, []);
  const { worksFor: _worksFor, ...withoutWorksFor } = dto;
  await repo.insert(withoutWorksFor);
  assert.deepEqual(puts[1]!.record.meta.worksFor, []);
});

test("prepared records carry CAS unchanged and reject mismatched identities before persistence", async () => {
  const source = row();
  const { repo, puts } = fixture();
  await repo.update(customVaultRecord({ row: source, expectedRevision: 3 }));
  assert.deepEqual(puts[0], { record: source, expectedRevision: 3 });
  for (const changed of [{ id: "other" }, { workspaceId: "other" }]) {
    const record: CustomCredentialSetRecord = { ...customVaultRecord({ row: source }), ...changed, vaultRecord: source, vaultExpectedRevision: 3 };
    await assert.rejects(repo.update(record), { code: "context" });
  }
  await assert.rejects(repo.update({ ...customVaultRecord({ row: source }), vaultExpectedRevision: 3, vaultRecord: row({ ownerKey: "foreign" }) }), { code: "context" });
  await repo.update({ ...customVaultRecord({ row: source }), vaultExpectedRevision: 3 });
  assert.equal(puts[1]!.expectedRevision, 3);
  assert.equal(puts[1]!.record.last4, null);
});

test("only a conflicting sibling label maps to the historical UNIQUE error", async () => {
  const dto = customVaultRecord({ row: row() });
  for (const failure of [new VaultError({ code: "conflict" }), new Error("storage failure")]) {
    for (const siblings of [[], [row()], [row({ id: "other", label: "different" })], [row({ id: "other" })]]) {
      const { repo } = fixture({ failure, siblings });
      const mapped = failure instanceof VaultError && siblings[0]?.id === "other" && siblings[0].label === dto.label;
      await assert.rejects(repo.insert(dto), error => mapped
        ? error instanceof Error && error.message === "UNIQUE constraint failed: secrets_vault.workspace_id, secrets_vault.kind, secrets_vault.label"
        : error === failure);
    }
  }
});
