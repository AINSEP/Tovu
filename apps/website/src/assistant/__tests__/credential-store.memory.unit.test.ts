import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import { InMemorySiteAssistantCredentialRepo } from "../site-credential-store.memory.js";
import { InMemoryAdminExecutionCredentialRepo } from "../execution-credential-store.memory.js";
import { assistantVaultContext, assistantVaultId } from "../assistant-vault.js";
import type { SiteAssistantCredentialRecord } from "../site-credential-store.js";
import type { AdminExecutionCredentialRecord } from "../execution-credential-store.js";

/** Real Jini memory repo that also records every CAS write so tests can assert the exact row written. */
class RecordingVaultRepo extends InMemoryVaultRepo {
  readonly puts: { record: VaultRecord; expectedRevision: number | null }[] = [];
  constructor() { super({}); }
  override async put(input: { record: VaultRecord; expectedRevision: number | null }): Promise<VaultRecord> {
    this.puts.push(structuredClone(input));
    return super.put(input);
  }
}

const SEALED = { keyId: "k1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" };
const OTHER_SEALED = { ...SEALED, ciphertext: "b3RoZXI=" };
const SITE_CONTEXT = assistantVaultContext({ workspaceId: "ws", kind: "site-assistant" });
const PERSONAL_CONTEXT = assistantVaultContext({ workspaceId: "ws", kind: "personal-execution", principalId: "p1" });

function siteRecord(overrides: Partial<SiteAssistantCredentialRecord> = {}): SiteAssistantCredentialRecord {
  return { workspaceId: "ws", provider: "anthropic", baseUrl: "https://api.example", model: "m1", sealed: SEALED,
    masked: "••••9999", aadVersion: 2, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z", ...overrides };
}
function executionRecord(overrides: Partial<AdminExecutionCredentialRecord> = {}): AdminExecutionCredentialRecord {
  return { workspaceId: "ws", principalId: "p1", protocol: "anthropic", providerId: "anthropic", baseUrl: null, model: "m1", maxTokens: 512,
    sealed: SEALED, masked: "••••9999", aadVersion: 2, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z", ...overrides };
}
/** A previously stored singleton carrying a hint, label, default flag and an extra meta key the write must keep. */
function storedRow(context: typeof SITE_CONTEXT, overrides: Partial<VaultRecord> = {}): VaultRecord {
  return { ...context, id: "existing-id", provider: "anthropic", label: "Main", isDefault: true, revision: 1, sealed: SEALED,
    last4: "1234", tokenLength: 40, meta: { extra: "kept", baseUrl: "old", model: "old" },
    createdAt: "2025-12-01T00:00:00.000Z", updatedAt: "2025-12-02T00:00:00.000Z", ...overrides };
}

test("site upsert creates the singleton with fresh identity and no unverifiable hint", async () => {
  const vault = new RecordingVaultRepo();
  await new InMemorySiteAssistantCredentialRepo({ vault }).upsert(siteRecord());
  assert.deepEqual(vault.puts, [{ expectedRevision: null, record: { ...SITE_CONTEXT, id: assistantVaultId({ context: SITE_CONTEXT }),
    provider: "anthropic", label: "", isDefault: false, revision: 1, meta: { baseUrl: "https://api.example", model: "m1" }, sealed: SEALED,
    last4: null, tokenLength: null, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" } }]);
});

test("site upsert of an identical envelope keeps identity, extra meta and the stored hint", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(SITE_CONTEXT), expectedRevision: null });
  await new InMemorySiteAssistantCredentialRepo({ vault }).upsert(siteRecord());
  assert.deepEqual(vault.puts[1], { expectedRevision: 1, record: { ...SITE_CONTEXT, id: "existing-id", provider: "anthropic", label: "Main",
    isDefault: true, revision: 2, meta: { extra: "kept", baseUrl: "https://api.example", model: "m1" }, sealed: SEALED,
    last4: "1234", tokenLength: 40, createdAt: "2025-12-01T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" } });
});

test("site upsert of a different envelope drops the stored hint", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(SITE_CONTEXT), expectedRevision: null });
  await new InMemorySiteAssistantCredentialRepo({ vault }).upsert(siteRecord({ sealed: OTHER_SEALED }));
  assert.equal(vault.puts[1]!.record.last4, null);
  assert.equal(vault.puts[1]!.record.tokenLength, null);
});

test("site upsert with no envelope drops the hint even when the stored envelope is also empty", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(SITE_CONTEXT, { sealed: null }), expectedRevision: null });
  await new InMemorySiteAssistantCredentialRepo({ vault }).upsert(siteRecord({ sealed: null }));
  assert.equal(vault.puts[1]!.record.last4, null);
  assert.equal(vault.puts[1]!.record.tokenLength, null);
});

test("site find maps a keyed row to a masked v2 record", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(SITE_CONTEXT), expectedRevision: null });
  assert.deepEqual(await new InMemorySiteAssistantCredentialRepo({ vault }).findByWorkspaceId("ws"), { workspaceId: "ws", provider: "anthropic",
    baseUrl: "old", model: "old", sealed: SEALED, masked: "••••1234", aadVersion: 2,
    createdAt: "2025-12-01T00:00:00.000Z", updatedAt: "2025-12-02T00:00:00.000Z" });
});

test("site find maps a keyless row to an unmasked v0 record", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(SITE_CONTEXT, { sealed: null, last4: null }), expectedRevision: null });
  const found = await new InMemorySiteAssistantCredentialRepo({ vault }).findByWorkspaceId("ws");
  assert.equal(found?.masked, null);
  assert.equal(found?.aadVersion, 0);
});

test("site find returns null when no singleton exists", async () => {
  assert.equal(await new InMemorySiteAssistantCredentialRepo().findByWorkspaceId("ws"), null);
});

test("site clearKey nulls the envelope and hint while keeping settings and identity", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(SITE_CONTEXT), expectedRevision: null });
  await new InMemorySiteAssistantCredentialRepo({ vault }).clearKey({ workspaceId: "ws", updatedAt: "2026-02-01T00:00:00.000Z" });
  assert.deepEqual(vault.puts[1], { expectedRevision: 1, record: { ...storedRow(SITE_CONTEXT), sealed: null, last4: null, tokenLength: null,
    revision: 2, updatedAt: "2026-02-01T00:00:00.000Z" } });
});

test("site clearKey without a stored singleton writes nothing", async () => {
  const vault = new RecordingVaultRepo();
  await new InMemorySiteAssistantCredentialRepo({ vault }).clearKey({ workspaceId: "ws", updatedAt: "2026-02-01T00:00:00.000Z" });
  assert.deepEqual(vault.puts, []);
});

test("execution upsert creates the personal singleton with fresh identity and no unverifiable hint", async () => {
  const vault = new RecordingVaultRepo();
  await new InMemoryAdminExecutionCredentialRepo({ vault }).upsert(executionRecord());
  assert.deepEqual(vault.puts, [{ expectedRevision: null, record: { ...PERSONAL_CONTEXT, id: assistantVaultId({ context: PERSONAL_CONTEXT }),
    provider: "anthropic", label: "", isDefault: false, revision: 1,
    meta: { protocol: "anthropic", baseUrl: null, model: "m1", maxTokens: 512 }, sealed: SEALED,
    last4: null, tokenLength: null, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" } }]);
});

test("execution upsert of an identical envelope keeps identity, extra meta and the stored hint", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(PERSONAL_CONTEXT), expectedRevision: null });
  await new InMemoryAdminExecutionCredentialRepo({ vault }).upsert(executionRecord({ providerId: null }));
  assert.deepEqual(vault.puts[1], { expectedRevision: 1, record: { ...PERSONAL_CONTEXT, id: "existing-id", provider: null, label: "Main",
    isDefault: true, revision: 2, meta: { extra: "kept", protocol: "anthropic", baseUrl: null, model: "m1", maxTokens: 512 }, sealed: SEALED,
    last4: "1234", tokenLength: 40, createdAt: "2025-12-01T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" } });
});

test("execution upsert of a different envelope drops the stored hint", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(PERSONAL_CONTEXT), expectedRevision: null });
  await new InMemoryAdminExecutionCredentialRepo({ vault }).upsert(executionRecord({ sealed: OTHER_SEALED }));
  assert.equal(vault.puts[1]!.record.last4, null);
  assert.equal(vault.puts[1]!.record.tokenLength, null);
});

test("execution upsert with no envelope drops the hint even when the stored envelope is also empty", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(PERSONAL_CONTEXT, { sealed: null }), expectedRevision: null });
  await new InMemoryAdminExecutionCredentialRepo({ vault }).upsert(executionRecord({ sealed: null }));
  assert.equal(vault.puts[1]!.record.last4, null);
});

test("execution find maps a keyed row to a masked v2 record", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(PERSONAL_CONTEXT, { meta: { protocol: "openai", baseUrl: null, model: "m2", maxTokens: 64 } }), expectedRevision: null });
  assert.deepEqual(await new InMemoryAdminExecutionCredentialRepo({ vault }).findByWorkspaceAndPrincipal({ workspaceId: "ws", principalId: "p1" }), {
    workspaceId: "ws", principalId: "p1", protocol: "openai", providerId: "anthropic", baseUrl: null, model: "m2", maxTokens: 64,
    sealed: SEALED, masked: "••••1234", aadVersion: 2, createdAt: "2025-12-01T00:00:00.000Z", updatedAt: "2025-12-02T00:00:00.000Z" });
});

test("execution find maps a keyless row to an unmasked v0 record", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(PERSONAL_CONTEXT, { sealed: null, last4: null }), expectedRevision: null });
  const found = await new InMemoryAdminExecutionCredentialRepo({ vault }).findByWorkspaceAndPrincipal({ workspaceId: "ws", principalId: "p1" });
  assert.equal(found?.masked, null);
  assert.equal(found?.aadVersion, 0);
});

test("execution find returns null for another principal's scope", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(PERSONAL_CONTEXT), expectedRevision: null });
  assert.equal(await new InMemoryAdminExecutionCredentialRepo({ vault }).findByWorkspaceAndPrincipal({ workspaceId: "ws", principalId: "p2" }), null);
});

test("execution clearKey nulls the envelope and hint while keeping settings and identity", async () => {
  const vault = new RecordingVaultRepo();
  await vault.put({ record: storedRow(PERSONAL_CONTEXT), expectedRevision: null });
  await new InMemoryAdminExecutionCredentialRepo({ vault }).clearKey({ workspaceId: "ws", principalId: "p1", updatedAt: "2026-02-01T00:00:00.000Z" });
  assert.deepEqual(vault.puts[1], { expectedRevision: 1, record: { ...storedRow(PERSONAL_CONTEXT), sealed: null, last4: null, tokenLength: null,
    revision: 2, updatedAt: "2026-02-01T00:00:00.000Z" } });
});

test("execution clearKey without a stored singleton writes nothing", async () => {
  const vault = new RecordingVaultRepo();
  await new InMemoryAdminExecutionCredentialRepo({ vault }).clearKey({ workspaceId: "ws", principalId: "p1", updatedAt: "2026-02-01T00:00:00.000Z" });
  assert.deepEqual(vault.puts, []);
});
