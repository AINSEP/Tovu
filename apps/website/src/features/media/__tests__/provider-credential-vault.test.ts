import assert from "node:assert/strict";
import test from "node:test";

import { VaultError, type VaultBatchOp, type VaultBatchResult, type VaultQuery, type VaultRecord, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { MediaProviderCredentialRecord } from "../provider-credential-store.js";
import { MediaProviderCredentialVaultRepo, mediaProviderVault, mediaVaultRecord, mediaVaultScope } from "../provider-credential-vault.js";

/**
 * @file `provider-credential-vault.ts` — the SECURITY-SENSITIVE adapter between media's historical
 * credential DTO and Jini's vault rows. Every guard and every hint-preservation branch is pinned
 * here directly against a typed recording port, so the vault row Jini receives (identity, CAS
 * revision, preserved hints) is asserted exactly rather than inferred from a round trip.
 * Fixture envelopes are inert placeholders; no real key material is involved.
 */

const WORKSPACE = "workspace-1";
const ENVELOPE = { keyId: "k1", ciphertext: "c1", nonce: "n1", alg: "aes-256-gcm" };
const DEFAULT_ID = `vault:${JSON.stringify(["media-provider", "openai"])}`;

function vaultRow(overrides: Partial<VaultRecord> = {}): VaultRecord {
  return { workspaceId: WORKSPACE, kind: "media-provider", ownerKey: "tovu", principalId: null, binding: null,
    id: DEFAULT_ID, provider: "openai", label: "openai", isDefault: false, revision: 1, sealed: null,
    last4: null, tokenLength: null, meta: { baseUrl: null, model: null },
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", ...overrides };
}

function dto(overrides: Partial<MediaProviderCredentialRecord> = {}): MediaProviderCredentialRecord {
  return { workspaceId: WORKSPACE, providerId: "openai", baseUrl: null, model: null, sealed: null, keyTail: null,
    aadVersion: 0, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", ...overrides };
}

/** A DTO carrying private prepared vault context, as `buildProviderUpsertRow` produces. */
function preparedDto(prepared: VaultRecord, overrides: Partial<MediaProviderCredentialRecord> = {}): MediaProviderCredentialRecord {
  const record = dto(overrides);
  Object.defineProperty(record, "vaultRecord", { value: prepared });
  return record;
}

/** Typed recording port: `list` serves fixed rows, writes are captured for exact assertions. */
class RecordingVault implements VaultRepoPort {
  readonly calls: string[] = [];
  readonly listQueries: VaultQuery[] = [];
  readonly puts: { record: VaultRecord; expectedRevision: number | null }[] = [];
  readonly batches: (readonly VaultBatchOp[])[] = [];
  constructor(private readonly rows: VaultRecord[] = [], private readonly batchResult: VaultBatchResult[] = []) {}
  async find(input: { workspaceId: string; id: string }) { this.calls.push(`find:${input.id}`); return null; }
  async list(input: VaultQuery) { this.calls.push("list"); this.listQueries.push(input); return this.rows; }
  async put(input: { record: VaultRecord; expectedRevision: number | null }) { this.calls.push("put"); this.puts.push(input); return input.record; }
  async patchMeta(input: { workspaceId: string; id: string; expectedRevision: number }) { this.calls.push(`patchMeta:${input.id}`); return vaultRow(); }
  async delete(input: { workspaceId: string; id: string; expectedRevision: number }) { this.calls.push(`delete:${input.id}`); return true; }
  async applyBatch(input: { ops: readonly VaultBatchOp[] }) { this.calls.push("applyBatch"); this.batches.push(input.ops); return this.batchResult; }
}

/** A port written before `applyBatch` existed (the method is optional on `VaultRepoPort`). */
class NoBatchVault implements VaultRepoPort {
  async find() { return null; }
  async list() { return [vaultRow()]; }
  async put(input: Parameters<VaultRepoPort["put"]>[0]) { return { ...input.record, isDefault: input.record.isDefault ?? false }; }
  async patchMeta() { return vaultRow(); }
  async delete() { return true; }
}

async function putRowFor(input: { record: MediaProviderCredentialRecord; existing?: VaultRecord }) {
  const vault = new RecordingVault(input.existing ? [input.existing] : []);
  await new MediaProviderCredentialVaultRepo({ vault }).upsert(input.record);
  return vault.puts[0]!;
}

function assertVaultCode(code: VaultError["code"]) {
  return (error: unknown) => error instanceof VaultError && error.code === code && error.message === `Secrets vault: ${code}`;
}

// --- mediaVaultScope ---------------------------------------------------------------------------

test("mediaVaultScope without a provider is the nonpersonal media ownership with no provider key", () => {
  assert.deepEqual(mediaVaultScope({ workspaceId: WORKSPACE }),
    { workspaceId: WORKSPACE, kind: "media-provider", ownerKey: "tovu", principalId: null, binding: null });
});

test("mediaVaultScope with a provider adds the exact provider filter", () => {
  assert.deepEqual(mediaVaultScope({ workspaceId: WORKSPACE, providerId: "openai" }),
    { workspaceId: WORKSPACE, kind: "media-provider", ownerKey: "tovu", principalId: null, binding: null, provider: "openai" });
});

// --- mediaProviderVault ------------------------------------------------------------------------

test("mediaProviderVault forwards every non-singleton port operation unchanged", async () => {
  const inner = new RecordingVault([vaultRow()]);
  const vault = mediaProviderVault({ vault: inner, providerId: "openai" });
  await vault.find({ workspaceId: WORKSPACE, id: "a" });
  await vault.list({ workspaceId: WORKSPACE, kind: "media-provider", ownerKey: "tovu", principalId: null });
  await vault.put({ record: vaultRow(), expectedRevision: null });
  await vault.patchMeta({ workspaceId: WORKSPACE, id: "b", expectedRevision: 1, patch: {}, updatedAt: "2026-09-01T00:00:00.000Z" });
  await vault.delete({ workspaceId: WORKSPACE, id: "c", expectedRevision: 1 });
  assert.deepEqual(inner.calls, ["find:a", "list", "put", "patchMeta:b", "delete:c"]);
});

test("mediaProviderVault.findOne lists the exact nonpersonal provider group and returns its first row", async () => {
  const inner = new RecordingVault([vaultRow({ id: "first" }), vaultRow({ id: "second" })]);
  const found = await mediaProviderVault({ vault: inner, providerId: "openai" }).findOne!({ workspaceId: WORKSPACE, kind: "media-provider" });
  assert.equal(found?.id, "first");
  assert.deepEqual(inner.listQueries, [{ workspaceId: WORKSPACE, kind: "media-provider", ownerKey: "tovu", principalId: null, provider: "openai" }]);
});

test("mediaProviderVault.findOne returns null when the provider group is empty", async () => {
  const found = await mediaProviderVault({ vault: new RecordingVault([]), providerId: "openai" }).findOne!({ workspaceId: WORKSPACE, kind: "media-provider" });
  assert.equal(found, null);
});

test("mediaProviderVault.findOne refuses a row for another provider with a context error", async () => {
  const vault = mediaProviderVault({ vault: new RecordingVault([vaultRow({ provider: "grok" })]), providerId: "openai" });
  await assert.rejects(vault.findOne!({ workspaceId: WORKSPACE, kind: "media-provider" }), assertVaultCode("context"));
});

// --- mediaVaultRecord: ownership guards --------------------------------------------------------

for (const [name, overrides] of [
  ["another kind", { kind: "vendor" }],
  ["another owner key", { ownerKey: "someone" }],
  ["a personal principal", { principalId: "principal-1" }],
  ["an endpoint binding", { binding: "https://example.com" }],
  ["no provider", { provider: null }],
] as const) {
  test(`mediaVaultRecord refuses a row with ${name} as a context error`, () => {
    assert.throws(() => mediaVaultRecord({ row: vaultRow(overrides) }), assertVaultCode("context"));
  });
}

// --- mediaVaultRecord: DTO mapping --------------------------------------------------------------

test("mediaVaultRecord maps an unsealed row to the historical DTO with no tail and aadVersion 0", () => {
  const row = vaultRow({ meta: { baseUrl: "https://api.example.com", model: "m1" } });
  assert.deepEqual({ ...mediaVaultRecord({ row }) }, { workspaceId: WORKSPACE, providerId: "openai", baseUrl: "https://api.example.com",
    model: "m1", sealed: null, keyTail: null, aadVersion: 0, createdAt: row.createdAt, updatedAt: row.updatedAt });
});

test("mediaVaultRecord keeps the vault row private: non-enumerable and absent from JSON", () => {
  const row = vaultRow();
  const record = mediaVaultRecord({ row });
  assert.equal(record.vaultRecord, row);
  assert.equal(Object.keys(record).includes("vaultRecord"), false);
  assert.equal(JSON.stringify(record).includes("vaultRecord"), false);
});

test("mediaVaultRecord exposes last4 as the tail for a sealed token of 12+ characters", () => {
  const record = mediaVaultRecord({ row: vaultRow({ sealed: ENVELOPE, tokenLength: 12, last4: "wxyz" }) });
  assert.deepEqual([record.keyTail, record.aadVersion], ["wxyz", 1]);
});

test("mediaVaultRecord withholds the tail for a sealed token shorter than 12 characters", () => {
  assert.equal(mediaVaultRecord({ row: vaultRow({ sealed: ENVELOPE, tokenLength: 11, last4: "wxyz" }) }).keyTail, "");
});

test("mediaVaultRecord withholds the tail for a sealed token of unknown length", () => {
  assert.equal(mediaVaultRecord({ row: vaultRow({ sealed: ENVELOPE, tokenLength: null, last4: "wxyz" }) }).keyTail, "");
});

test("mediaVaultRecord yields an empty tail for a long sealed token with no stored last4", () => {
  assert.equal(mediaVaultRecord({ row: vaultRow({ sealed: ENVELOPE, tokenLength: 40, last4: null }) }).keyTail, "");
});

// --- listByWorkspaceId / upsert ----------------------------------------------------------------

test("listByWorkspaceId reads the workspace's nonpersonal media group and maps each row", async () => {
  const vault = new RecordingVault([vaultRow({ provider: "openai" }), vaultRow({ id: "g", provider: "grok" })]);
  const rows = await new MediaProviderCredentialVaultRepo({ vault }).listByWorkspaceId(WORKSPACE);
  assert.deepEqual(rows.map(row => row.providerId), ["openai", "grok"]);
  assert.deepEqual(vault.listQueries, [mediaVaultScope({ workspaceId: WORKSPACE })]);
});

test("upsert of a new provider creates revision 1 under the deterministic id with CAS null", async () => {
  const record = dto({ baseUrl: "https://api.example.com", model: "m1" });
  const put = await putRowFor({ record });
  assert.equal(put.expectedRevision, null);
  assert.deepEqual(put.record, { ...mediaVaultScope(record), id: DEFAULT_ID, provider: "openai", label: "openai",
    meta: { baseUrl: "https://api.example.com", model: "m1" }, sealed: null, last4: null, tokenLength: null,
    isDefault: false, revision: 1, createdAt: record.createdAt, updatedAt: record.updatedAt });
});

test("upsert over an existing row keeps its id, createdAt, default flag and extra meta, and bumps its revision", async () => {
  const existing = vaultRow({ id: "existing-id", revision: 4, isDefault: true, meta: { baseUrl: "old", model: null, normalization: "conflict" } });
  const put = await putRowFor({ record: dto({ baseUrl: "new" }), existing });
  assert.equal(put.expectedRevision, 4);
  assert.deepEqual([put.record.id, put.record.revision, put.record.isDefault, put.record.createdAt],
    ["existing-id", 5, true, existing.createdAt]);
  assert.deepEqual(put.record.meta, { baseUrl: "new", model: null, normalization: "conflict" });
});

test("upsert uses the prepared row's id when no row exists yet", async () => {
  const put = await putRowFor({ record: preparedDto(vaultRow({ id: "prepared-id" })) });
  assert.equal(put.record.id, "prepared-id");
});

test("upsert refuses a prepared row whose id differs from the stored row's id as a conflict", async () => {
  const vault = new RecordingVault([vaultRow({ id: "stored-id" })]);
  await assert.rejects(new MediaProviderCredentialVaultRepo({ vault }).upsert(preparedDto(vaultRow({ id: "prepared-id" }))),
    assertVaultCode("conflict"));
  assert.deepEqual(vault.puts, []);
});

test("upsert keeps the existing row's hints when the envelope is unchanged", async () => {
  const existing = vaultRow({ sealed: ENVELOPE, last4: "wxyz", tokenLength: 20 });
  const put = await putRowFor({ record: dto({ sealed: { ...ENVELOPE } }), existing });
  assert.deepEqual([put.record.sealed, put.record.last4, put.record.tokenLength], [ENVELOPE, "wxyz", 20]);
});

test("upsert prefers the prepared row's hints over the stored row's when both match the envelope", async () => {
  const existing = vaultRow({ sealed: ENVELOPE, last4: "old4", tokenLength: 20 });
  const put = await putRowFor({ record: preparedDto(vaultRow({ sealed: ENVELOPE, last4: "new4", tokenLength: 30 }), { sealed: ENVELOPE }), existing });
  assert.deepEqual([put.record.last4, put.record.tokenLength], ["new4", 30]);
});

for (const [field, changed] of [["keyId", "k2"], ["ciphertext", "c2"], ["nonce", "n2"], ["alg", "other"]] as const) {
  test(`upsert drops stored hints when the envelope's ${field} differs`, async () => {
    const existing = vaultRow({ sealed: ENVELOPE, last4: "wxyz", tokenLength: 20 });
    const put = await putRowFor({ record: dto({ sealed: { ...ENVELOPE, [field]: changed } }), existing });
    assert.deepEqual([put.record.last4, put.record.tokenLength], [null, null]);
  });
}

test("upsert drops hints when the record carries no envelope", async () => {
  const put = await putRowFor({ record: dto(), existing: vaultRow({ sealed: ENVELOPE, last4: "wxyz", tokenLength: 20 }) });
  assert.deepEqual([put.record.sealed, put.record.last4, put.record.tokenLength], [null, null, null]);
});

test("upsert drops hints when the stored row has no envelope to compare", async () => {
  const put = await putRowFor({ record: dto({ sealed: ENVELOPE }), existing: vaultRow({ sealed: null, last4: "wxyz", tokenLength: 20 }) });
  assert.deepEqual([put.record.last4, put.record.tokenLength], [null, null]);
});

test("upsert drops hints for a new envelope with no stored or prepared row", async () => {
  const put = await putRowFor({ record: dto({ sealed: ENVELOPE }) });
  assert.deepEqual([put.record.last4, put.record.tokenLength], [null, null]);
});

// --- deleteByProviderIds / replaceWorkspace ----------------------------------------------------

test("deleteByProviderIds with no ids touches nothing at all", async () => {
  const vault = new RecordingVault([vaultRow()]);
  await new MediaProviderCredentialVaultRepo({ vault }).deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: [] });
  assert.deepEqual(vault.calls, []);
});

test("deleteByProviderIds batches one CAS delete per distinct stored provider, skipping unknown ids", async () => {
  const vault = new RecordingVault([vaultRow({ id: "o", revision: 3 })], [true]);
  await new MediaProviderCredentialVaultRepo({ vault }).deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["openai", "openai", "missing"] });
  assert.deepEqual(vault.batches, [[{ delete: { workspaceId: WORKSPACE, id: "o", expectedRevision: 3 } }]]);
});

test("replaceWorkspace refuses a port without batch support as invalid-record before reading", async () => {
  const repo = new MediaProviderCredentialVaultRepo({ vault: new NoBatchVault() });
  await assert.rejects(repo.replaceWorkspace({ workspaceId: WORKSPACE, plan: () => ({ upserts: [], tombstoneProviderIds: [] }) }),
    assertVaultCode("invalid-record"));
});

test("replaceWorkspace hands the planner the current DTOs and puts each upsert against its stored revision", async () => {
  const vault = new RecordingVault([vaultRow({ id: "o", revision: 2 })], []);
  let seen: string[] = [];
  await new MediaProviderCredentialVaultRepo({ vault }).replaceWorkspace({ workspaceId: WORKSPACE, plan: current => {
    seen = current.map(row => row.providerId);
    return { upserts: [dto(), dto({ providerId: "grok" })], tombstoneProviderIds: [] };
  } });
  assert.deepEqual(seen, ["openai"]);
  const puts = vault.batches[0]!.map(op => "put" in op ? [op.put.record.id, op.put.expectedRevision] : null);
  assert.deepEqual(puts, [["o", 2], [`vault:${JSON.stringify(["media-provider", "grok"])}`, null]]);
});

test("replaceWorkspace refuses an upsert for another workspace as a context error without batching", async () => {
  const vault = new RecordingVault([], []);
  await assert.rejects(new MediaProviderCredentialVaultRepo({ vault }).replaceWorkspace({ workspaceId: WORKSPACE,
    plan: () => ({ upserts: [dto({ workspaceId: "workspace-2" })], tombstoneProviderIds: [] }) }), assertVaultCode("context"));
  assert.deepEqual(vault.batches, []);
});

test("replaceWorkspace returns only written rows as DTOs, dropping delete booleans", async () => {
  const vault = new RecordingVault([vaultRow({ id: "g", provider: "grok" })], [vaultRow(), true]);
  const written = await new MediaProviderCredentialVaultRepo({ vault }).replaceWorkspace({ workspaceId: WORKSPACE,
    plan: () => ({ upserts: [dto()], tombstoneProviderIds: ["grok"] }) });
  assert.deepEqual(written.map(row => row.providerId), ["openai"]);
  assert.deepEqual(vault.batches[0]!.map(op => Object.keys(op)[0]), ["put", "delete"]);
});
