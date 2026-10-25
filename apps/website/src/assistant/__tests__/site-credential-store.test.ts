import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import type { KeyringPort, SecretSealerPort } from "../../features/webhooks/index.js";
import { InMemorySiteAssistantCredentialRepo } from "../site-credential-store.memory.js";
import {
  SiteAssistantCredentialValidationError,
  SiteAssistantSecretStoreUnconfiguredError,
  deleteSiteAssistantCredential,
  getSiteAssistantCredential,
  resolveSiteAssistantApiKey,
  setSiteAssistantCredential,
} from "../site-credential-store.js";
import { buildVaultAad, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { assistantVaultContext, assistantVaultRepo, createAssistantVault, readAssistantVault } from "../assistant-vault.js";

/**
 * @file `site-credential-store.ts` — ADR-058's write-only credential contract and the runtime
 * consumer's never-throws read path.
 *
 * The assertions that matter most: `apiKey` is never echoed back by GET or by the view SET/DELETE
 * return, an omitted `apiKey` on SET never reseals the key, a missing site key fails closed
 * with a distinct error rather than a plaintext write, and `resolveSiteAssistantApiKey` truly never
 * throws — every failure mode it can hit resolves to `null` instead.
 */

const WORKSPACE = "workspace-1";
const clock = { nowMs: () => Date.parse("2026-08-04T00:00:00.000Z"), nowIso: () => "2026-08-04T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemorySiteAssistantCredentialRepo();
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

test("assistant repositories without singleton lookup are rejected as invalid records", () => {
  for (const vault of [undefined, null, {}]) {
    assert.throws(() => assistantVaultRepo({ repo: { vault } }), { name: "VaultError", code: "invalid-record" });
  }
});

test("assistant vault creation refuses non-assistant credential kinds", () => {
  const { repo } = makeDeps();
  const context = { ...assistantVaultContext({ workspaceId: WORKSPACE, kind: "site-assistant" }), kind: "media-provider" as const };
  assert.throws(() => createAssistantVault({ repo: repo.vault, context }), { name: "VaultError", code: "context" });
});

test("assistant snapshot reads require singleton lookup even when a record is supplied", async () => {
  const { deps, repo } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, model: "saved-model" });
  const context = assistantVaultContext({ workspaceId: WORKSPACE, kind: "site-assistant" });
  const record = await repo.vault.findOne(context);
  assert.ok(record);
  const incompleteRepo = Object.create(repo.vault) as VaultRepoPort;
  incompleteRepo.findOne = undefined;

  await assert.rejects(readAssistantVault({ repo: incompleteRepo, context }, { record }), {
    name: "VaultError", code: "invalid-record",
  });
});

test("assistant settings refuse metadata returned from another workspace", async t => {
  const { deps, repo } = makeDeps();
  const otherWorkspace = "workspace-other";
  await setSiteAssistantCredential(deps, { workspaceId: otherWorkspace, model: "other-workspace-model" });
  const record = await repo.vault.findOne(assistantVaultContext({ workspaceId: otherWorkspace, kind: "site-assistant" }));
  assert.ok(record);
  t.mock.method(repo.vault, "findOne", async () => record);

  await assert.rejects(getSiteAssistantCredential({ repo }, { workspaceId: WORKSPACE }), {
    name: "VaultError", code: "context",
  });
});

// ---------------------------------------------------------------------------
// getSiteAssistantCredential
// ---------------------------------------------------------------------------

test("a workspace nobody has configured reads as not-set, with sensible defaults", async () => {
  const { deps } = makeDeps();
  const view = await getSiteAssistantCredential(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(view, { isSet: false, masked: null, tokenHint: null, provider: "google", baseUrl: null, model: null, updatedAt: null });
});

// ---------------------------------------------------------------------------
// setSiteAssistantCredential
// ---------------------------------------------------------------------------

test("setting an apiKey seals it, masks it, and never returns the plaintext", async () => {
  const { deps, repo } = makeDeps();
  const view = await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "AIzaSyABCDEFGHIJKLMNOPqrst9999" });

  assert.equal(view.isSet, true);
  assert.equal(view.masked, "••••9999");
  assert.ok(!("apiKey" in view));
  assert.ok(!JSON.stringify(view).includes("AIzaSy"));

  // And the stored row genuinely holds ciphertext, not the plaintext, at the repo layer too.
  const stored = await repo.findByWorkspaceId(WORKSPACE);
  assert.ok(stored?.sealed);
  assert.notEqual(stored?.sealed?.ciphertext, "AIzaSyABCDEFGHIJKLMNOPqrst9999");
});

test("an empty apiKey is rejected — DELETE clears a key, PUT does not accept blank", async () => {
  const { deps } = makeDeps();
  await assert.rejects(
    () => setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "   " }),
    SiteAssistantCredentialValidationError
  );
});

test("a non-string provider/baseUrl/model is rejected before any write", async () => {
  const { deps, repo } = makeDeps();
  await assert.rejects(
    () => setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, provider: 12345 as unknown as string }),
    SiteAssistantCredentialValidationError
  );
  assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
});

test("a non-string baseUrl or model is also rejected before any write — not just provider", async () => {
  const { deps, repo } = makeDeps();
  await assert.rejects(
    () => setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, baseUrl: 12345 as unknown as string }),
    SiteAssistantCredentialValidationError
  );
  await assert.rejects(
    () => setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, model: { not: "a string" } as unknown as string }),
    SiteAssistantCredentialValidationError
  );
  assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
});

test("setting nothing at all on a never-before-configured workspace seeds an empty row with defaults, touching neither sealer nor keyring", async () => {
  const repo = new InMemorySiteAssistantCredentialRepo();
  const keyring = new BrokenKeyring();
  const sealer: SecretSealerPort = {
    seal: async () => { throw new Error("metadata setup must never seal"); },
    open: async () => { throw new Error("metadata setup must never open"); },
  };
  const deps = { repo, keyring, sealer, clock };
  const view = await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE });

  assert.equal(view.isSet, false);
  assert.equal(view.masked, null);
  assert.equal(view.provider, "google");
  assert.equal(view.baseUrl, null);
  assert.equal(view.model, null);
  assert.deepEqual(await repo.findByWorkspaceId(WORKSPACE), {
    workspaceId: WORKSPACE, provider: "google", baseUrl: null, model: null,
    sealed: null, masked: null, aadVersion: 0,
    createdAt: clock.nowIso(), updatedAt: clock.nowIso(),
  });
});

test("omitting apiKey leaves the previously-stored key untouched — only provider/baseUrl/model change", async () => {
  const { deps } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "first-key-0000" });
  const afterFirst = await getSiteAssistantCredential(deps, { workspaceId: WORKSPACE });

  const afterSecond = await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, model: "gemini-flash-latest" });

  assert.equal(afterSecond.isSet, true);
  assert.equal(afterSecond.masked, afterFirst.masked);
  assert.equal(afterSecond.model, "gemini-flash-latest");

  // The runtime path still resolves the ORIGINAL key — proves the sealed blob itself was untouched,
  // not just that `masked` happens to match.
  const resolved = await resolveSiteAssistantApiKey({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE });
  assert.equal(resolved?.apiKey, "first-key-0000");
});

test("a rotation (second apiKey) fully replaces the first — the old key no longer resolves", async () => {
  const { deps } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "old-key-1111" });
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "new-key-2222" });

  const resolved = await resolveSiteAssistantApiKey({ repo: deps.repo, sealer: deps.sealer }, { workspaceId: WORKSPACE });
  assert.equal(resolved?.apiKey, "new-key-2222");
});

test("a missing site key fails CLOSED with a distinct error, and writes nothing", async () => {
  const { repo, sealer } = makeDeps();
  const brokenKeyring = new BrokenKeyring();
  const brokenSealer = new AesGcmSecretSealer(brokenKeyring); // sealer over the broken keyring
  void sealer; // unused — deliberately shadowed by the broken one below

  await assert.rejects(
    () =>
      setSiteAssistantCredential(
        { repo, sealer: brokenSealer, keyring: brokenKeyring, clock },
        { workspaceId: WORKSPACE, apiKey: "would-be-a-real-key" }
      ),
    SiteAssistantSecretStoreUnconfiguredError
  );

  assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
});

test("a non-Error seal failure still fails CLOSED and names the thrown value", async () => {
  const { repo } = makeDeps();
  const stringThrowingKeyring = new BrokenKeyring();
  stringThrowingKeyring.activeKey = async () => { throw "keyring offline"; };
  stringThrowingKeyring.derive = async () => { throw "keyring offline"; };
  const sealer = new AesGcmSecretSealer(stringThrowingKeyring);

  await assert.rejects(
    () => setSiteAssistantCredential({ repo, sealer, keyring: stringThrowingKeyring, clock }, { workspaceId: WORKSPACE, apiKey: "would-be-a-real-key" }),
    (error: unknown) => error instanceof SiteAssistantSecretStoreUnconfiguredError &&
      error.message === "site assistant secret store is unconfigured: keyring offline",
  );
  assert.equal(await repo.findByWorkspaceId(WORKSPACE), null);
});

// ---------------------------------------------------------------------------
// deleteSiteAssistantCredential
// ---------------------------------------------------------------------------

test("delete clears only the key — provider/baseUrl/model survive", async () => {
  const { deps } = makeDeps();
  await setSiteAssistantCredential(deps, {
    workspaceId: WORKSPACE,
    apiKey: "to-be-deleted",
    provider: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-flash-latest",
  });

  const view = await deleteSiteAssistantCredential(deps, { workspaceId: WORKSPACE });

  assert.equal(view.isSet, false);
  assert.equal(view.masked, null);
  assert.equal(view.provider, "google");
  assert.equal(view.baseUrl, "https://generativelanguage.googleapis.com");
  assert.equal(view.model, "gemini-flash-latest");
});

test("deleting an already-unset key is a harmless no-op, not an error", async () => {
  const { deps } = makeDeps();
  const view = await deleteSiteAssistantCredential(deps, { workspaceId: WORKSPACE });
  assert.equal(view.isSet, false);
});

// ---------------------------------------------------------------------------
// resolveSiteAssistantApiKey — must never throw
// ---------------------------------------------------------------------------

test("resolveSiteAssistantApiKey returns null (not a throw) when the repo read itself fails", async () => {
  const { sealer } = makeDeps();
  const brokenRepo = new InMemorySiteAssistantCredentialRepo();
  brokenRepo.vault.findOne = async () => { throw new Error("connection reset"); };
  let warned: unknown;
  const resolved = await resolveSiteAssistantApiKey({ repo: brokenRepo, sealer }, { workspaceId: WORKSPACE }, (err) => {
    warned = err;
  });

  assert.equal(resolved, null);
  assert.ok(warned instanceof Error && warned.message === "connection reset");
});

test("resolveSiteAssistantApiKey returns null when no row exists", async () => {
  const { repo, sealer } = makeDeps();
  const resolved = await resolveSiteAssistantApiKey({ repo, sealer }, { workspaceId: WORKSPACE });
  assert.equal(resolved, null);
});

test("resolveSiteAssistantApiKey refuses a decrypted payload with a non-string apiKey", async () => {
  const { deps, repo, keyring, sealer } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "valid-original-key" });
  const record = await repo.vault.findOne(assistantVaultContext({ workspaceId: WORKSPACE, kind: "site-assistant" }));
  assert.ok(record);
  const sealed = await sealer.seal({
    plaintext: JSON.stringify({ apiKey: 12345 }), key: await keyring.activeKey(), aad: buildVaultAad(record),
  });
  await repo.vault.put({ record: { ...record, sealed, revision: record.revision + 1 }, expectedRevision: record.revision });

  assert.equal(await resolveSiteAssistantApiKey(deps, { workspaceId: WORKSPACE }), null);
});

test("resolveSiteAssistantApiKey returns null (not a throw) when the sealed row cannot be opened", async () => {
  const { deps, repo } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "some-key" });

  // A sealer over a DIFFERENT site key than the one that sealed the row — simulates a rotated or
  // reset site key. `open()` must reject (wrong key -> auth tag mismatch), and the resolver
  // must swallow that into `null`, never propagate it to the caller.
  const otherSealer = new AesGcmSecretSealer(new InMemoryKeyring("different-generation"));
  let warned = 0;
  const resolved = await resolveSiteAssistantApiKey(
    { repo, sealer: otherSealer },
    { workspaceId: WORKSPACE },
    () => {
      warned += 1;
    }
  );

  assert.equal(resolved, null);
  assert.equal(warned, 1);
});

test("resolveSiteAssistantApiKey's onDecryptFailure defaults to a silent no-op — a decrypt failure with no callback supplied still just resolves null", async () => {
  const { deps, repo } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "some-key" });

  const otherSealer = new AesGcmSecretSealer(new InMemoryKeyring("different-generation"));
  const resolved = await resolveSiteAssistantApiKey({ repo, sealer: otherSealer }, { workspaceId: WORKSPACE });

  assert.equal(resolved, null, "the default no-op must still let the failure resolve to null rather than throwing");
});

test("resolveSiteAssistantApiKey returns the key, provider, baseUrl, and model together on success", async () => {
  const { deps, repo, sealer } = makeDeps();
  await setSiteAssistantCredential(deps, {
    workspaceId: WORKSPACE,
    apiKey: "resolvable-key",
    provider: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-flash-latest",
  });

  const resolved = await resolveSiteAssistantApiKey({ repo, sealer }, { workspaceId: WORKSPACE });
  assert.deepEqual(resolved, {
    apiKey: "resolvable-key",
    provider: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-flash-latest",
  });
});

// ---------------------------------------------------------------------------
// Writes bind workspaceId into AAD so ciphertext cannot be transplanted across workspace rows.
// S2 boot tests own legacy-AAD normalization; ordinary reads accept only vault envelopes.
// ---------------------------------------------------------------------------

test("a freshly saved key is sealed with AAD bound to workspaceId and the row is marked vault aadVersion 2", async () => {
  const { deps, repo, sealer } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "aad-bound-key-1234" });

  const row = await repo.findByWorkspaceId(WORKSPACE);
  assert.equal(row?.aadVersion, 2);

  // Opening under the WRONG aad (the legacy no-aad shape) must fail closed.
  await assert.rejects(() => sealer.open({ sealed: row!.sealed! }));
  const opened = await sealer.open({ sealed: row!.sealed! }, { aad: buildVaultAad((await repo.vault.findOne!(assistantVaultContext({ kind: "site-assistant", workspaceId: WORKSPACE })))!) });
  assert.deepEqual(JSON.parse(opened), { apiKey: "aad-bound-key-1234" });
});



test("AAD binding: swapping the sealed key onto a DIFFERENT workspace's row fails closed (adversarial cross-workspace transplant)", async () => {
  const { deps, repo } = makeDeps();
  const OTHER_WORKSPACE = "workspace-2";
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "workspace-one-key" });
  await setSiteAssistantCredential(deps, { workspaceId: OTHER_WORKSPACE, apiKey: "workspace-two-key" });

  const rowOne = await repo.findByWorkspaceId(WORKSPACE);
  const rowTwo = await repo.findByWorkspaceId(OTHER_WORKSPACE);

  // Simulate an attacker (or a bad migration) with DB write access moving workspace two's
  // ciphertext onto workspace one's row — the AAD (bound to the row's OWN workspaceId) must reject
  // this even though the AES key is shared app-wide.
  await repo.upsert({ ...rowOne!, sealed: rowTwo!.sealed, masked: rowTwo!.masked });

  const resolved = await resolveSiteAssistantApiKey(deps, { workspaceId: WORKSPACE });
  assert.equal(resolved, null, "resolveSiteAssistantApiKey never throws — a transplanted ciphertext must resolve to null, not the wrong plaintext");
});


test("BYOK hints use the shared server policy on writes and reads, including short keys and open failures", async () => {
  const { deps } = makeDeps();
  const scope = { workspaceId: WORKSPACE };
  for (const [apiKey, expected] of [
    ["a".repeat(14) + "a9F2", { length: 18, last4: "a9F2" }],
    ["tiny", { length: 4, last4: null }],
  ] as const) {
    const written = await setSiteAssistantCredential(deps, { ...scope, apiKey });
    const read = await getSiteAssistantCredential(deps, scope);
    assert.deepEqual(written.tokenHint, expected);
    assert.deepEqual(read.tokenHint, expected);
    assert.equal(JSON.stringify(written).includes(apiKey), false);
    assert.equal(JSON.stringify(read).includes(apiKey), false);
    if (expected.last4 === null) assert.equal(read.masked, null);
  }
  const unavailable = { ...deps, sealer: { ...deps.sealer, seal: deps.sealer.seal.bind(deps.sealer), open: async () => { throw new Error("unavailable"); } } };
  const metadata = await getSiteAssistantCredential(unavailable, scope);
  assert.equal(metadata.isSet, true);
  assert.equal(metadata.tokenHint, null);
  assert.equal(metadata.masked, null);
});

test("provider-only edits preserve vault identity, envelope and hints without deriving or resealing", async () => {
  const { deps, repo } = makeDeps();
  const scope = { workspaceId: WORKSPACE };
  const context = assistantVaultContext({ ...scope, kind: "site-assistant" });
  await setSiteAssistantCredential(deps, { ...scope, apiKey: "provider-move-key-1234", model: "first-model" });
  const before = await repo.vault.findOne!(context);
  let seals = 0;
  const sealer: SecretSealerPort = { open: deps.sealer.open.bind(deps.sealer), seal: async () => { seals++; throw new Error("must not reseal"); } };
  const view = await setSiteAssistantCredential({ ...deps, keyring: new BrokenKeyring(), sealer }, { ...scope, provider: "openai", model: "second-model" });
  const after = await repo.vault.findOne!(context);
  assert.equal(seals, 0);
  assert.equal(after?.id, before?.id);
  assert.equal(after?.createdAt, before?.createdAt);
  assert.deepEqual(after?.sealed, before?.sealed);
  assert.equal(after?.tokenLength, before?.tokenLength);
  assert.equal(after?.last4, before?.last4);
  assert.equal(after?.revision, before!.revision + 1);
  assert.equal(view.masked, "••••1234");
  assert.deepEqual(await resolveSiteAssistantApiKey(deps, scope), { apiKey: "provider-move-key-1234", provider: "openai", baseUrl: null, model: "second-model" });
});

test("public readiness performs one singleton read and at most one open for each outcome", async t => {
  const { deps, repo } = makeDeps();
  const { resolvePublicAssistantAvailability } = await import("../public-assistant-availability.js");
  const scope = { workspaceId: WORKSPACE };
  await setSiteAssistantCredential(deps, { ...scope, apiKey: "ready-key-123456", model: "saved-model" });
  const reads = t.mock.method(repo.vault, "findOne");
  const opens = t.mock.method(deps.sealer, "open");
  const byId = t.mock.method(repo.vault, "find");
  const lists = t.mock.method(repo.vault, "list");
  assert.equal((await resolvePublicAssistantAvailability({ ...deps, ...scope })).ready, true);
  assert.equal(reads.mock.callCount(), 1);
  assert.equal(opens.mock.callCount(), 1);
  assert.equal(byId.mock.callCount(), 0);
  assert.equal(lists.mock.callCount(), 0);
  await deleteSiteAssistantCredential(deps, scope);
  reads.mock.resetCalls(); opens.mock.resetCalls();
  assert.equal((await resolvePublicAssistantAvailability({ ...deps, ...scope })).ready, false);
  assert.equal(reads.mock.callCount(), 1);
  assert.equal(opens.mock.callCount(), 0);
});

test("gated rotation publishes the key and settings together and leaves old reads usable until commit", async () => {
  const { deps } = makeDeps();
  const scope = { workspaceId: WORKSPACE };
  await setSiteAssistantCredential(deps, { ...scope, apiKey: "old-key-123456", provider: "google", model: "old-model" });
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const sealing = new Promise<void>(resolve => { started = resolve; });
  const sealer: SecretSealerPort = { open: deps.sealer.open.bind(deps.sealer), seal: async input => {
    started(); await held; return deps.sealer.seal(input);
  } };
  const pending = setSiteAssistantCredential({ ...deps, sealer }, { ...scope, apiKey: "new-key-654321", provider: "openai", model: "new-model" });
  try {
    await sealing;
    assert.deepEqual(await resolveSiteAssistantApiKey(deps, scope), { apiKey: "old-key-123456", provider: "google", baseUrl: null, model: "old-model" });
    assert.equal((await getSiteAssistantCredential(deps, scope)).model, "old-model");
  } finally { release(); await pending; }
  assert.deepEqual(await resolveSiteAssistantApiKey(deps, scope), { apiKey: "new-key-654321", provider: "openai", baseUrl: null, model: "new-model" });
});

test("a read gated at open keeps its old metadata when a concurrent rotation commits", async () => {
  const { deps } = makeDeps();
  const scope = { workspaceId: WORKSPACE };
  await setSiteAssistantCredential(deps, { ...scope, apiKey: "old-snapshot-key", model: "old-model" });
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const opening = new Promise<void>(resolve => { started = resolve; });
  const sealer: SecretSealerPort = { seal: deps.sealer.seal.bind(deps.sealer), open: async (input, options) => {
    started(); await held; return deps.sealer.open(input, options);
  } };
  const pending = resolveSiteAssistantApiKey({ ...deps, sealer }, scope);
  try {
    await opening;
    await setSiteAssistantCredential(deps, { ...scope, apiKey: "new-snapshot-key", model: "new-model" });
  } finally { release(); }
  assert.equal((await pending)?.apiKey, "old-snapshot-key");
  assert.equal((await pending)?.model, "old-model");
  assert.equal((await resolveSiteAssistantApiKey(deps, scope))?.model, "new-model");
});

test("concurrent first saves with different providers contend on one singleton identity", async () => {
  const { deps, repo } = makeDeps();
  const scope = { workspaceId: WORKSPACE };
  const results = await Promise.allSettled([
    setSiteAssistantCredential(deps, { ...scope, apiKey: "first-create-key", provider: "google" }),
    setSiteAssistantCredential(deps, { ...scope, apiKey: "second-create-key", provider: "openai" }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal((await repo.vault.list(assistantVaultContext({ ...scope, kind: "site-assistant" }))).length, 1);
});

test('TW3 site settings-only creation and omitted settings retain defaults, identity and key', async () => {
  const { deps, repo } = makeDeps();
  const scope = { workspaceId: WORKSPACE };
  const first = await setSiteAssistantCredential(deps, { ...scope, model: 'first' });
  assert.deepEqual(first, { isSet: false, masked: null, tokenHint: null, provider: 'google', baseUrl: null, model: 'first', updatedAt: clock.nowIso() });
  await setSiteAssistantCredential(deps, { ...scope, apiKey: ['test', 'credential', '5678'].join('-'), provider: 'openai', baseUrl: 'https://example.test' });
  const stored = await repo.findByWorkspaceId(WORKSPACE);
  const changed = await setSiteAssistantCredential(deps, { ...scope, model: 'second' });
  assert.equal(changed.provider, 'openai');
  assert.equal(changed.baseUrl, 'https://example.test');
  assert.equal(changed.model, 'second');
  assert.equal(changed.masked, '••••5678');
  assert.deepEqual((await repo.findByWorkspaceId(WORKSPACE))?.sealed, stored?.sealed);
});

// L11 Stryker: lines 23–27 of public-assistant-availability (unsupported provider, missing model)
// were never executed. Each refusal is asserted by code AND message, and none leaks the key.
test("public readiness refuses an unsupported provider, a missing or blank model, and a blank key, by code", async () => {
  const { resolvePublicAssistantAvailability } = await import("../public-assistant-availability.js");
  const cases: Array<[Record<string, unknown>, string, string]> = [
    [{ apiKey: "ready-key-123456", provider: "mistral", model: "m" }, "PROVIDER_UNSUPPORTED",
      'site assistant is configured for an unsupported provider "mistral" — supported providers are anthropic, openai, azure, google.'],
    [{ apiKey: "ready-key-123456", provider: "openai" }, "MODEL_NOT_CONFIGURED",
      "site assistant has no saved model — choose one in AI Assistant before enabling the public assistant."],
    [{ apiKey: "ready-key-123456", provider: "openai", model: "   " }, "MODEL_NOT_CONFIGURED",
      "site assistant has no saved model — choose one in AI Assistant before enabling the public assistant."],
  ];
  for (const [input, code, error] of cases) {
    const { deps } = makeDeps();
    try { await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, ...input } as never); }
    catch (refused) { assert.fail(`fixture save refused for ${JSON.stringify(input)}: ${String(refused)}`); }
    const result = await resolvePublicAssistantAvailability({ ...deps, workspaceId: WORKSPACE });
    assert.deepEqual(result, { ready: false, code, error }, JSON.stringify(input));
    assert.equal(JSON.stringify(result).includes("ready-key-123456"), false, "the key never appears in a refusal");
  }
  for (const provider of ["anthropic", "openai", "azure", "google"]) {
    const { deps } = makeDeps();
    await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "ready-key-123456", provider, model: "m" } as never);
    const result = await resolvePublicAssistantAvailability({ ...deps, workspaceId: WORKSPACE });
    assert.equal(result.ready, true, provider);
  }
  const { deps } = makeDeps();
  const unconfigured = await resolvePublicAssistantAvailability({ ...deps, workspaceId: WORKSPACE });
  assert.equal(unconfigured.ready === false && unconfigured.code, "NOT_CONFIGURED");
});

test("public readiness reports a decrypt failure to the callback and stays key-free", async () => {
  const { resolvePublicAssistantAvailability } = await import("../public-assistant-availability.js");
  const { deps } = makeDeps();
  await setSiteAssistantCredential(deps, { workspaceId: WORKSPACE, apiKey: "ready-key-123456", model: "m" });
  const failure = new Error("sealer offline");
  const failures: unknown[] = [];
  const sealer = { seal: deps.sealer.seal.bind(deps.sealer), open: async () => { throw failure; } };
  const result = await resolvePublicAssistantAvailability({ ...deps, sealer, workspaceId: WORKSPACE }, { onCredentialFailure: error => failures.push(error) });
  assert.equal(result.ready === false && result.code, "NOT_CONFIGURED");
  assert.deepEqual(failures, [failure]);
});
