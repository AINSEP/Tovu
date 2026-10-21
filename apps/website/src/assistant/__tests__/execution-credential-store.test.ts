import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import type { KeyringPort } from "../../features/webhooks/index.js";
import { InMemoryAdminExecutionCredentialRepo } from "../execution-credential-store.memory.js";
import {
  ExecutionCredentialSecretStoreUnconfiguredError,
  ExecutionCredentialValidationError,
  deleteExecutionCredential,
  getExecutionCredential,
  resolveExecutionCredential,
  setExecutionCredential,
} from "../execution-credential-store.js";
import { buildVaultAad } from "@jini-ai/platform/secrets/credential-sets";
import { assistantVaultContext } from "../assistant-vault.js";

/**
 * @file `execution-credential-store.ts` — the ADMIN's own BYOK credential, write-only contract and
 * the never-throws runtime read path. Mirrors `site-credential-store.test.ts`'s assertion shape for
 * the sibling ADR-058 store, plus the property that store did not need: row-level isolation across
 * the `(workspaceId, principalId)` composite scope, so one admin's PUT/DELETE can never touch
 * another admin's row, or another workspace's row for the SAME principal id.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const ADMIN_A = "principal-admin-a";
const ADMIN_B = "principal-admin-b";
const clock = { nowMs: () => Date.parse("2026-08-05T00:00:00.000Z"), nowIso: () => "2026-08-05T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemoryAdminExecutionCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, keyring, sealer, deps: { repo, keyring, sealer, clock } };
}

/** A `KeyringPort` that always fails `derive()`/`activeKey()` — simulates a missing
 *  `TOVU_SITE_KEY` without touching real env state. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no site key: TOVU_SITE_KEY is not set and allowFileFallback is disabled");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no site key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no site key");
  }
}

// ---------------------------------------------------------------------------
// getExecutionCredential
// ---------------------------------------------------------------------------

test("an admin nobody has configured reads as not-set, with sensible defaults", async () => {
  const { deps } = makeDeps();
  const view = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.deepEqual(view, {
    isSet: false,
    masked: null,
    tokenHint: null,
    protocol: "anthropic",
    providerId: null,
    baseUrl: null,
    model: null,
    maxTokens: null,
    updatedAt: null,
  });
});

// ---------------------------------------------------------------------------
// setExecutionCredential
// ---------------------------------------------------------------------------

test("setting an apiKey seals it, masks it, and never returns the plaintext", async () => {
  const { deps, repo } = makeDeps();
  const view = await setExecutionCredential(deps, {
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
    apiKey: "sk-ant-api03-EXAMPLE9999",
  });

  assert.equal(view.isSet, true);
  assert.equal(view.masked, "••••9999");
  assert.ok(!("apiKey" in view));
  assert.ok(!JSON.stringify(view).includes("sk-ant-api03"));

  const stored = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.ok(stored?.sealed);
  assert.notEqual(stored?.sealed?.ciphertext, "sk-ant-api03-EXAMPLE9999");
});

test("an empty apiKey is rejected — DELETE clears a key, PUT does not accept blank", async () => {
  const { deps } = makeDeps();
  await assert.rejects(
    () => setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "   " }),
    ExecutionCredentialValidationError
  );
});

test("a non-string protocol/baseUrl/model is rejected before any write", async () => {
  const { deps, repo } = makeDeps();
  for (const field of ["protocol", "baseUrl", "model"] as const) {
    await assert.rejects(
      () => setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, [field]: 12345 }),
      (error: unknown) => {
        assert.ok(error instanceof ExecutionCredentialValidationError);
        assert.equal(error.message, `${field} must be a string`);
        return true;
      },
    );
    assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
  }
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "existing-key", model: "original-model" });
  const before = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
  for (const field of ["protocol", "baseUrl", "model"] as const) {
    await assert.rejects(
      () => setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, [field]: 12345 }),
      (error: unknown) => {
        assert.ok(error instanceof ExecutionCredentialValidationError);
        assert.equal(error.message, `${field} must be a string`);
        return true;
      },
    );
    assert.deepEqual(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), before);
  }
});

test("a non-positive maxTokens is rejected before any write", async () => {
  const { deps, repo } = makeDeps();
  for (const maxTokens of [0, -1, NaN]) {
    await assert.rejects(
      () => setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, maxTokens }),
      ExecutionCredentialValidationError,
    );
    assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
  }
});

test("a non-string providerId is rejected before creating a credential", async () => {
  const { deps, repo } = makeDeps();
  const scope = { workspaceId: WORKSPACE, principalId: ADMIN_A };

  await assert.rejects(
    setExecutionCredential(deps, { ...scope, providerId: 12345 as unknown as string }),
    (error: unknown) => {
      assert.ok(error instanceof ExecutionCredentialValidationError);
      assert.equal(error.message, "providerId must be a string or null");
      return true;
    },
  );
  assert.equal(await repo.findByWorkspaceAndPrincipal(scope), null);
});

test("omitting apiKey leaves the previously-stored key untouched — only model changes", async () => {
  const { deps } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "first-key-0000" });
  const afterFirst = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });

  const afterSecond = await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, model: "claude-opus-4-8" });

  assert.equal(afterSecond.isSet, true);
  assert.equal(afterSecond.masked, afterFirst.masked);
  assert.equal(afterSecond.model, "claude-opus-4-8");

  // The runtime path still resolves the ORIGINAL key — proves the sealed blob itself was untouched.
  const resolved = await resolveExecutionCredential({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(resolved?.apiKey, "first-key-0000");
});

test("a rotation (second apiKey) fully replaces the first — the old key no longer resolves", async () => {
  const { deps } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "old-key-1111" });
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "new-key-2222" });

  const resolved = await resolveExecutionCredential({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(resolved?.apiKey, "new-key-2222");
});

test("a missing site key fails CLOSED with a distinct error, and writes nothing", async () => {
  const { repo } = makeDeps();
  const brokenKeyring = new BrokenKeyring();
  const brokenSealer = new AesGcmSecretSealer(brokenKeyring);

  await assert.rejects(
    () =>
      setExecutionCredential(
        { repo, sealer: brokenSealer, keyring: brokenKeyring, clock },
        { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "would-be-a-real-key" }
      ),
    ExecutionCredentialSecretStoreUnconfiguredError
  );

  assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
});

// ---------------------------------------------------------------------------
// Row-level isolation — the property this store has that ADR-058's sibling did not need
// ---------------------------------------------------------------------------

test("two different admins in the SAME workspace have fully independent credentials", async () => {
  const { deps } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "admin-a-key-1111", model: "claude-opus-4-8" });
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_B, apiKey: "admin-b-key-2222", model: "gpt-4o" });

  const viewA = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  const viewB = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_B });
  assert.equal(viewA.masked, "••••1111");
  assert.equal(viewB.masked, "••••2222");
  assert.equal(viewA.model, "claude-opus-4-8");
  assert.equal(viewB.model, "gpt-4o");

  // Deleting A's key must not touch B's.
  await deleteExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  const afterDelete = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_B });
  assert.equal(afterDelete.isSet, true);
  assert.equal(afterDelete.masked, "••••2222");
});

test("the SAME principal id in two different workspaces has fully independent credentials", async () => {
  const { deps } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "workspace-1-key-1111" });
  await setExecutionCredential(deps, { workspaceId: OTHER_WORKSPACE, principalId: ADMIN_A, apiKey: "workspace-2-key-2222" });

  const inFirst = await getExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  const inSecond = await getExecutionCredential(deps, { workspaceId: OTHER_WORKSPACE, principalId: ADMIN_A });
  assert.equal(inFirst.masked, "••••1111");
  assert.equal(inSecond.masked, "••••2222");
});

// ---------------------------------------------------------------------------
// deleteExecutionCredential
// ---------------------------------------------------------------------------

test("delete clears only the key — protocol/providerId/baseUrl/model/maxTokens survive", async () => {
  const { deps } = makeDeps();
  await setExecutionCredential(deps, {
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
    apiKey: "to-be-deleted",
    protocol: "openai",
    providerId: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    maxTokens: 4096,
  });

  const view = await deleteExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });

  assert.equal(view.isSet, false);
  assert.equal(view.masked, null);
  assert.equal(view.protocol, "openai");
  assert.equal(view.providerId, "openai");
  assert.equal(view.baseUrl, "https://api.openai.com/v1");
  assert.equal(view.model, "gpt-4o");
  assert.equal(view.maxTokens, 4096);
});

test("deleting an already-unset key is a harmless no-op, not an error", async () => {
  const { deps } = makeDeps();
  const view = await deleteExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(view.isSet, false);
});

// ---------------------------------------------------------------------------
// resolveExecutionCredential — must never throw
// ---------------------------------------------------------------------------

test("resolveExecutionCredential's onDecryptFailure defaults to a silent no-op — a decrypt failure with no callback supplied still just resolves null", async () => {
  const { deps, repo } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "some-key" });

  const otherSealer = new AesGcmSecretSealer(new InMemoryKeyring("different-generation"));
  const resolved = await resolveExecutionCredential({ repo, sealer: otherSealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });

  assert.equal(resolved, null, "the default no-op must still let the failure resolve to null rather than throwing");
});

test("resolveExecutionCredential returns null when no row exists", async () => {
  const { repo, sealer } = makeDeps();
  const resolved = await resolveExecutionCredential({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(resolved, null);
});

test("resolveExecutionCredential refuses a decrypted payload with a non-string apiKey", async () => {
  const { deps, repo, keyring, sealer } = makeDeps();
  const scope = { workspaceId: WORKSPACE, principalId: ADMIN_A };
  await setExecutionCredential(deps, { ...scope, apiKey: "valid-original-key" });
  const record = await repo.vault.findOne(assistantVaultContext({ ...scope, kind: "personal-execution" }));
  assert.ok(record);
  const sealed = await sealer.seal({
    plaintext: JSON.stringify({ apiKey: 12345 }), key: await keyring.activeKey(), aad: buildVaultAad(record),
  });
  await repo.vault.put({ record: { ...record, sealed, revision: record.revision + 1 }, expectedRevision: record.revision });

  assert.equal(await resolveExecutionCredential(deps, scope), null);
});

test("resolveExecutionCredential returns null (not a throw) when the sealed row cannot be opened", async () => {
  const { deps, repo } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "some-key" });

  // A sealer over a DIFFERENT site key generation — simulates a rotated/reset site key.
  const otherSealer = new AesGcmSecretSealer(new InMemoryKeyring("different-generation"));
  let warned = 0;
  const resolved = await resolveExecutionCredential(
    { repo, sealer: otherSealer },
    { workspaceId: WORKSPACE, principalId: ADMIN_A },
    () => {
      warned += 1;
    }
  );

  assert.equal(resolved, null);
  assert.equal(warned, 1);
});

test("resolveExecutionCredential returns the key and config together on success", async () => {
  const { deps, repo, sealer } = makeDeps();
  await setExecutionCredential(deps, {
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
    apiKey: "resolvable-key",
    protocol: "anthropic",
    providerId: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-opus-4-8",
    maxTokens: 8192,
  });

  const resolved = await resolveExecutionCredential({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.deepEqual(resolved, {
    apiKey: "resolvable-key",
    protocol: "anthropic",
    providerId: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-opus-4-8",
    maxTokens: 8192,
  });
});

// ---------------------------------------------------------------------------
// Writes bind workspaceId/principalId into AAD so ciphertext cannot be transplanted across rows.
// S2 boot tests own legacy-AAD normalization; ordinary reads accept only vault envelopes.
// ---------------------------------------------------------------------------

test("a freshly saved key is sealed with AAD bound to (workspaceId, principalId) and the row is marked vault aadVersion 2", async () => {
  const { deps, repo, sealer } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "aad-bound-key-1234" });

  const row = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(row?.aadVersion, 2);

  await assert.rejects(() => sealer.open({ sealed: row!.sealed! }));
  const opened = await sealer.open({ sealed: row!.sealed! }, { aad: buildVaultAad((await repo.vault.findOne!(assistantVaultContext({ kind: "personal-execution", workspaceId: WORKSPACE, principalId: ADMIN_A })))!) });
  assert.deepEqual(JSON.parse(opened), { apiKey: "aad-bound-key-1234" });
});


test("AAD binding: swapping the sealed key onto a DIFFERENT PRINCIPAL's row in the SAME workspace fails closed (adversarial cross-row transplant)", async () => {
  const { deps, repo } = makeDeps();
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "admin-a-key" });
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_B, apiKey: "admin-b-key" });

  const rowA = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
  const rowB = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_B });

  // Simulate an attacker (or a bad migration) with DB write access moving admin B's ciphertext onto
  // admin A's row — the AAD (bound to the row's OWN principalId) must reject this even though the
  // AES key is shared app-wide.
  await repo.upsert({ ...rowA!, sealed: rowB!.sealed, masked: rowB!.masked });

  const resolved = await resolveExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A });
  assert.equal(resolved, null, "resolveExecutionCredential never throws — a transplanted ciphertext must resolve to null, not the wrong plaintext");
});

test("AAD binding rejects a ciphertext transplanted across workspaces for the same principal", async () => {
  const { deps, repo } = makeDeps();
  const otherWorkspace = "ws-other";
  await setExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "workspace-one" });
  await setExecutionCredential(deps, { workspaceId: otherWorkspace, principalId: ADMIN_A, apiKey: "workspace-two" });
  const destination = await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A });
  const source = await repo.findByWorkspaceAndPrincipal({ workspaceId: otherWorkspace, principalId: ADMIN_A });
  assert.ok(destination && source);
  await repo.upsert({ ...destination, sealed: source.sealed, masked: source.masked });
  assert.equal(await resolveExecutionCredential(deps, { workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
  assert.equal((await resolveExecutionCredential(deps, { workspaceId: otherWorkspace, principalId: ADMIN_A }))?.apiKey, "workspace-two");
});


test("BYOK hints use the shared server policy on writes and reads, including short keys and open failures", async () => {
  const { deps } = makeDeps();
  const scope = { workspaceId: WORKSPACE, principalId: ADMIN_A };
  for (const [apiKey, expected] of [
    ["a".repeat(14) + "a9F2", { length: 18, last4: "a9F2" }],
    ["tiny", { length: 4, last4: null }],
  ] as const) {
    const written = await setExecutionCredential(deps, { ...scope, apiKey });
    const read = await getExecutionCredential(deps, scope);
    assert.deepEqual(written.tokenHint, expected);
    assert.deepEqual(read.tokenHint, expected);
    assert.equal(JSON.stringify(written).includes(apiKey), false);
    assert.equal(JSON.stringify(read).includes(apiKey), false);
    if (expected.last4 === null) assert.equal(read.masked, null);
  }
  const unavailable = { ...deps, sealer: { ...deps.sealer, seal: deps.sealer.seal.bind(deps.sealer), open: async () => { throw new Error("unavailable"); } } };
  const metadata = await getExecutionCredential(unavailable, scope);
  assert.equal(metadata.isSet, true);
  assert.equal(metadata.tokenHint, null);
  assert.equal(metadata.masked, null);
});

test("providerId moves and explicit null preserve the personal envelope and identity", async () => {
  const { deps, repo } = makeDeps();
  const scope = { workspaceId: WORKSPACE, principalId: ADMIN_A };
  const context = assistantVaultContext({ ...scope, kind: "personal-execution" });
  await setExecutionCredential(deps, { ...scope, apiKey: "personal-provider-key", providerId: "first", protocol: "openai", maxTokens: 4096 });
  const before = await repo.vault.findOne!(context);
  const sealedOnly = { ...deps, keyring: new BrokenKeyring(), sealer: {
    open: deps.sealer.open.bind(deps.sealer), seal: async () => { throw new Error("provider edit must never reseal"); },
  } };
  await setExecutionCredential(sealedOnly, { ...scope, providerId: "second", model: "next-model" });
  await setExecutionCredential(sealedOnly, { ...scope, providerId: null });
  const after = await repo.vault.findOne!(context);
  assert.equal(after?.id, before?.id);
  assert.equal(after?.createdAt, before?.createdAt);
  assert.deepEqual(after?.sealed, before?.sealed);
  assert.equal(after?.last4, before?.last4);
  assert.equal(after?.tokenLength, before?.tokenLength);
  assert.equal(after?.provider, null);
  assert.deepEqual(await resolveExecutionCredential(deps, scope), { apiKey: "personal-provider-key", protocol: "openai", providerId: null, model: "next-model", baseUrl: null, maxTokens: 4096 });
});

test("gated personal rotation never exposes mixed settings/key and never changes a sibling", async () => {
  const { deps } = makeDeps();
  const scope = { workspaceId: WORKSPACE, principalId: ADMIN_A };
  const sibling = { workspaceId: WORKSPACE, principalId: ADMIN_B };
  await setExecutionCredential(deps, { ...scope, apiKey: "old-personal-key", model: "old-model" });
  await setExecutionCredential(deps, { ...sibling, apiKey: "sibling-personal-key", model: "sibling-model" });
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const sealing = new Promise<void>(resolve => { started = resolve; });
  const pending = setExecutionCredential({ ...deps, sealer: {
    open: deps.sealer.open.bind(deps.sealer), seal: async input => { started(); await held; return deps.sealer.seal(input); },
  } }, { ...scope, apiKey: "new-personal-key", model: "new-model", protocol: "openai" });
  try {
    await sealing;
    assert.equal((await resolveExecutionCredential(deps, scope))?.apiKey, "old-personal-key");
    assert.equal((await getExecutionCredential(deps, scope)).model, "old-model");
    assert.equal((await resolveExecutionCredential(deps, sibling))?.apiKey, "sibling-personal-key");
  } finally { release(); await pending; }
  assert.equal((await resolveExecutionCredential(deps, scope))?.apiKey, "new-personal-key");
  assert.equal((await resolveExecutionCredential(deps, scope))?.model, "new-model");
  assert.equal((await resolveExecutionCredential(deps, sibling))?.model, "sibling-model");
});

test("a stale prepared personal rotation loses CAS without overwriting a committed settings edit", async () => {
  const { deps } = makeDeps();
  const scope = { workspaceId: WORKSPACE, principalId: ADMIN_A };
  await setExecutionCredential(deps, { ...scope, apiKey: "original-personal-key", model: "original-model" });
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const sealing = new Promise<void>(resolve => { started = resolve; });
  const pending = setExecutionCredential({ ...deps, sealer: {
    open: deps.sealer.open.bind(deps.sealer), seal: async input => { started(); await held; return deps.sealer.seal(input); },
  } }, { ...scope, apiKey: "stale-replacement-key", model: "stale-model" });
  const rejected = assert.rejects(pending, error => error instanceof Error && error.name === "VaultError");
  try {
    await sealing;
    await setExecutionCredential(deps, { ...scope, model: "committed-model" });
  } finally { release(); await rejected; }
  assert.equal((await resolveExecutionCredential(deps, scope))?.apiKey, "original-personal-key");
  assert.equal((await resolveExecutionCredential(deps, scope))?.model, "committed-model");
});

test("personal runtime rejects a row from another principal before opening it", async t => {
  const { deps, repo } = makeDeps();
  const scope = { workspaceId: WORKSPACE, principalId: ADMIN_A };
  await setExecutionCredential(deps, { ...scope, apiKey: "admin-a-private-key" });
  const row = await repo.vault.findOne!(assistantVaultContext({ ...scope, kind: "personal-execution" }));
  t.mock.method(repo.vault, "findOne", async () => row);
  const opens = t.mock.method(deps.sealer, "open");
  assert.equal(await resolveExecutionCredential(deps, { ...scope, principalId: ADMIN_B }), null);
  assert.equal(opens.mock.callCount(), 0);
});

test('TW3 execution settings-only creation, partial update and explicit provider clearing retain their defaults and key', async () => {
  const { deps, repo } = makeDeps();
  const scope = { workspaceId: WORKSPACE, principalId: ADMIN_A };
  const first = await setExecutionCredential(deps, { ...scope, model: 'first' });
  assert.deepEqual(first, { isSet: false, masked: null, tokenHint: null, protocol: 'anthropic', providerId: null, baseUrl: null, model: 'first', maxTokens: null, updatedAt: clock.nowIso() });
  await setExecutionCredential(deps, { ...scope, apiKey: ['test', 'credential', '1234'].join('-'), protocol: 'openai', providerId: 'custom', baseUrl: 'https://example.test', maxTokens: 42 });
  const stored = await repo.findByWorkspaceAndPrincipal(scope);
  const changed = await setExecutionCredential(deps, { ...scope, providerId: null, model: 'second' });
  assert.equal(changed.providerId, null);
  assert.equal(changed.protocol, 'openai');
  assert.equal(changed.baseUrl, 'https://example.test');
  assert.equal(changed.maxTokens, 42);
  assert.equal(changed.model, 'second');
  assert.equal(changed.masked, '••••1234');
  assert.deepEqual((await repo.findByWorkspaceAndPrincipal(scope))?.sealed, stored?.sealed);
});

/** A keyring whose failure is a bare (non-Error) rejection value, as some native bindings produce. */
class NonErrorKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw "keyring offline";
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw "keyring offline";
  }
  async derive(): Promise<Uint8Array> {
    throw "keyring offline";
  }
}

test("a non-Error seal failure still fails closed with the distinct error, carrying the raw reason", async () => {
  const { repo } = makeDeps();
  const keyring = new NonErrorKeyring();
  await assert.rejects(
    () => setExecutionCredential(
      { repo, sealer: new AesGcmSecretSealer(keyring), keyring, clock },
      { workspaceId: WORKSPACE, principalId: ADMIN_A, apiKey: "would-be-a-real-key" }
    ),
    (error: unknown) => error instanceof ExecutionCredentialSecretStoreUnconfiguredError && /keyring offline/.test(error.message),
  );
  assert.equal(await repo.findByWorkspaceAndPrincipal({ workspaceId: WORKSPACE, principalId: ADMIN_A }), null);
});
