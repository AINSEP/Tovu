import assert from "node:assert/strict";
import test from "node:test";
import { VaultError } from "@jini-ai/platform/secrets/credential-sets";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { KeyringPort } from "../../webhooks/index.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import {
  createCustomCredential,
  describeCredentialByLabel,
  listCustomCredentials,
  updateCustomCredential,
  CustomCredentialDuplicateLabelError,
  CustomCredentialSecretStoreUnconfiguredError,
  resolveCustomCredentialByLabel,
  type CustomCredentialWriteDeps,
} from "../store.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/**
 * @file `resolveCustomCredentialByLabel` — the first real decrypting reader for
 * `custom_credential_sets` (added for `server/runtime/boot/resolve-mailer.ts`). Mirrors
 * `vendor-credentials/__tests__/store.unit.test.ts`'s own `resolveForVendor` coverage shape
 * (real `AesGcmSecretSealer` + `InMemoryKeyring`, no plaintext-passthrough sealer double — see
 * that class's own header for why one is deliberately not built).
 */

const WORKSPACE = "ws-1";

/** Same double every sibling credential store's own test file uses for "the site key is
 *  unavailable" — see `vendor-credentials/__tests__/store.unit.test.ts`'s own `BrokenKeyring`. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no Site key: TOVU_SITE_KEY is not set and allowFileFallback is disabled");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no Site key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no Site key");
  }
}

function makeWriteDeps(overrides: Partial<CustomCredentialWriteDeps> = {}): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  return {
    repo: new InMemoryCustomCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: createFakeClock({ startIso: "2026-08-31T00:00:00.000Z" }),
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
    ...overrides,
  };
}

test("resolveCustomCredentialByLabel returns null when no row has that label (not configured is not an error)", async () => {
  const deps = makeWriteDeps();
  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "Tovu Mail — Resend API" });
  assert.equal(resolved, null);
});

test("label/origin descriptions and lists open no credentials; resolution opens only the selected row", async () => {
  const deps = makeWriteDeps();
  await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "selected", category: "ops",
    baseUrl: "https://api.example.com/v1", additionalHosts: ["https://other.example.com/path"],
    connection: { token: "selected-token-1234", username: "operator" } });
  await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "decoy", category: "general",
    baseUrl: "https://decoy.example.com", connection: { token: "decoy-token-5678" } });
  let opens = 0;
  const open = deps.sealer.open.bind(deps.sealer);
  deps.sealer.open = (input, options) => { opens++; return open(input, options); };
  const described = await describeCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "selected" });
  assert.equal(described?.baseUrl, "https://api.example.com/v1");
  assert.deepEqual(described?.additionalHosts, ["https://other.example.com"]);
  assert.deepEqual(described?.tokenHint, { length: 19, last4: "1234" });
  assert.equal((await listCustomCredentials(deps, { workspaceId: WORKSPACE })).length, 2);
  assert.equal(opens, 0);
  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "selected" });
  assert.deepEqual(resolved?.connection, { token: "selected-token-1234", username: "operator" });
  assert.deepEqual(resolved?.additionalHosts, described?.additionalHosts);
  assert.equal(opens, 1);
});

test("custom labels remain workspace-wide unique on create and rename, with the typed duplicate error", async () => {
  const deps = makeWriteDeps();
  const input = { workspaceId: WORKSPACE, label: "unique", category: "ops", baseUrl: "https://example.com", connection: { token: "long-token-1234" } };
  const first = await createCustomCredential(deps, input);
  await assert.rejects(createCustomCredential(deps, input), CustomCredentialDuplicateLabelError);
  const second = await createCustomCredential(deps, { ...input, label: "second", category: "hosting" });
  await assert.rejects(updateCustomCredential(deps, { workspaceId: WORKSPACE, id: second.id, label: "unique" }), CustomCredentialDuplicateLabelError);
  assert.equal((await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "unique" }))?.id, first.id);
  assert.equal((await listCustomCredentials(deps, { workspaceId: WORKSPACE })).length, 2);
});

test("a metadata-only custom edit preserves its hints/envelope with an unavailable key", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "original", category: "ops",
    baseUrl: "https://example.com", connection: { token: "original-token-1234", username: "operator" } });
  const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });
  const broken = { ...deps, keyring: new BrokenKeyring(), sealer: new AesGcmSecretSealer(new BrokenKeyring()) };
  const changed = await updateCustomCredential(broken, { workspaceId: WORKSPACE, id: created.id, label: "renamed", username: null, connection: { token: "" } });
  assert.deepEqual(changed.tokenHint, created.tokenHint);
  assert.equal("username" in changed, false);
  assert.deepEqual((await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id }))?.sealed, before?.sealed);
  assert.deepEqual((await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "renamed" }))?.connection, { token: "original-token-1234" });
});

test("short custom tokens never expose a suffix through saved hints", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "short", category: "general",
    baseUrl: "https://example.com", connection: { token: "short" } });
  assert.deepEqual(created.tokenHint, { length: 5, last4: null });
  assert.deepEqual((await describeCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "short" }))?.tokenHint, created.tokenHint);
});

test("a gated custom rotation fails CAS instead of overwriting a newer token and saved origins", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "raced", category: "general",
    baseUrl: "https://original.example.com", connection: { token: "original-token-1234" } });
  let entered!: () => void;
  let release!: () => void;
  const sealing = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const seal = deps.sealer.seal.bind(deps.sealer);
  const stale = updateCustomCredential({ ...deps, sealer: {
    open: deps.sealer.open.bind(deps.sealer), seal: async input => { entered(); await gate; return seal(input); },
  } }, { workspaceId: WORKSPACE, id: created.id, connection: { token: "stale-token-5678" } });
  const rejected = assert.rejects(stale, VaultError);
  await sealing;
  try {
    await updateCustomCredential(deps, { workspaceId: WORKSPACE, id: created.id,
      connection: { token: "newer-token-9999" }, baseUrl: "https://newer.example.com", additionalHosts: ["https://other.example.com"] });
  } finally { release(); }
  await rejected;
  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "raced" });
  assert.deepEqual(resolved?.connection, { token: "newer-token-9999" });
  assert.equal(resolved?.baseUrl, "https://newer.example.com");
  assert.deepEqual(resolved?.additionalHosts, ["https://other.example.com"]);
});

test("resolveCustomCredentialByLabel finds the row by exact label and decrypts its connection", async () => {
  const deps = makeWriteDeps();
  await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Tovu Mail — Resend API",
    category: "ops",
    baseUrl: "https://api.resend.com",
    connection: { token: "re_live_abc123" },
  });
  // A decoy row with a different label must not be matched.
  await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Some other integration",
    category: "general",
    baseUrl: "https://example.com",
    connection: { token: "unrelated" },
  });

  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "Tovu Mail — Resend API" });
  assert.ok(resolved);
  assert.equal(resolved?.category, "ops");
  assert.equal(resolved?.baseUrl, "https://api.resend.com");
  assert.deepEqual(resolved?.connection, { token: "re_live_abc123" });
});

test("resolveCustomCredentialByLabel is workspace-scoped: a same-labeled row in a different workspace is never returned", async () => {
  const deps = makeWriteDeps();
  await createCustomCredential(deps, {
    workspaceId: "ws-other",
    label: "Tovu Mail — Resend API",
    category: "ops",
    baseUrl: "https://api.resend.com",
    connection: { token: "belongs-to-ws-other" },
  });

  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "Tovu Mail — Resend API" });
  assert.equal(resolved, null);
});

test("resolveCustomCredentialByLabel throws CustomCredentialSecretStoreUnconfiguredError, never a raw error, when the keyring is broken", async () => {
  const workingDeps = makeWriteDeps();
  await createCustomCredential(workingDeps, {
    workspaceId: WORKSPACE,
    label: "Tovu Mail — SMTP Server",
    category: "ops",
    baseUrl: "https://smtp.example.com:587",
    connection: { token: "app-password", username: "mailer@example.com" },
  });

  const brokenResolveDeps = { repo: workingDeps.repo, sealer: new AesGcmSecretSealer(new BrokenKeyring()) };
  await assert.rejects(
    () => resolveCustomCredentialByLabel(brokenResolveDeps, { workspaceId: WORKSPACE, label: "Tovu Mail — SMTP Server" }),
    (err: unknown) => {
      assert.ok(err instanceof CustomCredentialSecretStoreUnconfiguredError);
      assert.equal(
        (err as Error).message,
        "The credential could not be saved or unlocked. Check the site credential store."
      );
      return true;
    }
  );
});
