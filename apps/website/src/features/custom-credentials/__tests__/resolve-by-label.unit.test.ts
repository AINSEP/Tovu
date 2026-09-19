import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { KeyringPort } from "../../webhooks/index.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import {
  createCustomCredential,
  CustomCredentialSecretStoreUnconfiguredError,
  resolveCustomCredentialByLabel,
  type CustomCredentialWriteDeps,
} from "../store.js";

/**
 * @file `resolveCustomCredentialByLabel` — the first real decrypting reader for
 * `custom_credential_sets` (added for `server/runtime/boot/resolve-mailer.ts`). Mirrors
 * `vendor-credentials/__tests__/store.unit.test.ts`'s own `resolveForVendor` coverage shape
 * (real `AesGcmSecretSealer` + `InMemoryKeyring`, no plaintext-passthrough sealer double — see
 * that class's own header for why one is deliberately not built).
 */

const WORKSPACE = "ws-1";

/** Same double every sibling credential store's own test file uses for "the master secret is
 *  unavailable" — see `vendor-credentials/__tests__/store.unit.test.ts`'s own `BrokenKeyring`. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no Site Token: TOVU_INTEGRATIONS_ROOT_KEY is not set and allowFileFallback is disabled");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no Site Token");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no Site Token");
  }
}

function makeWriteDeps(overrides: Partial<CustomCredentialWriteDeps> = {}): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  return {
    repo: new InMemoryCustomCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => "2026-08-31T00:00:00.000Z" },
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
        "custom credential could not be decrypted (secret store unconfigured, or the stored row is corrupted): no Site Token"
      );
      return true;
    }
  );
});
