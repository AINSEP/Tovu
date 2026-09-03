import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { EnvOrFileKeyring } from "../keyring.env.js";

const ENV_VAR = "TOVU_TEST_INTEGRATIONS_ROOT_KEY";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "tovu-keyring-test-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("env-var override supplies the root key", async () => {
  const original = process.env[ENV_VAR];
  process.env[ENV_VAR] = "aa".repeat(32);
  try {
    const keyring = new EnvOrFileKeyring({
      envVarName: ENV_VAR,
      keyFilePath: "/should/never/be/touched",
    });
    const secret = await keyring.deriveSigningSecret({
      workspaceId: "ws-1",
      subscriptionId: "sub-1",
      version: 1,
    });
    assert.equal(secret.length, 32);
  } finally {
    if (original === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = original;
  }
});

test("generated-file fallback creates a key outside the caller-specified path only once", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "nested", "root-key.hex");
    const keyring = new EnvOrFileKeyring({ envVarName: "TOVU_TEST_UNSET_VAR", keyFilePath });

    const first = await keyring.deriveSigningSecret({
      workspaceId: "ws-1",
      subscriptionId: "sub-1",
      version: 1,
    });
    const second = await keyring.deriveSigningSecret({
      workspaceId: "ws-1",
      subscriptionId: "sub-1",
      version: 1,
    });

    assert.deepEqual(first, second);

    // A fresh keyring instance pointed at the same file must derive the same secret —
    // proves the key was actually persisted to disk, not just cached in-process.
    const rehydrated = new EnvOrFileKeyring({ envVarName: "TOVU_TEST_UNSET_VAR", keyFilePath });
    const third = await rehydrated.deriveSigningSecret({
      workspaceId: "ws-1",
      subscriptionId: "sub-1",
      version: 1,
    });
    assert.deepEqual(first, third);
  });
});

test("HKDF determinism: same input yields same output; different inputs diverge", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    const keyring = new EnvOrFileKeyring({ envVarName: "TOVU_TEST_UNSET_VAR_2", keyFilePath });

    const base = await keyring.deriveSigningSecret({
      workspaceId: "ws-1",
      subscriptionId: "sub-1",
      version: 1,
    });
    const sameAgain = await keyring.deriveSigningSecret({
      workspaceId: "ws-1",
      subscriptionId: "sub-1",
      version: 1,
    });
    const differentVersion = await keyring.deriveSigningSecret({
      workspaceId: "ws-1",
      subscriptionId: "sub-1",
      version: 2,
    });
    const differentSubscription = await keyring.deriveSigningSecret({
      workspaceId: "ws-1",
      subscriptionId: "sub-2",
      version: 1,
    });
    const differentPurpose = await keyring.derive({
      workspaceId: "ws-1",
      purpose: "analytics-salt",
      info: "2026-01-01",
    });

    assert.deepEqual(base, sameAgain);
    assert.notDeepEqual(base, differentVersion);
    assert.notDeepEqual(base, differentSubscription);
    assert.notDeepEqual(base, differentPurpose);
  });
});

test("missing root key throws and never returns a placeholder secret", async () => {
  const keyring = new EnvOrFileKeyring({
    envVarName: "TOVU_TEST_DEFINITELY_UNSET_VAR",
    allowFileFallback: false,
  });

  await assert.rejects(
    () => keyring.deriveSigningSecret({ workspaceId: "ws-1", subscriptionId: "sub-1", version: 1 }),
    /no root key/
  );
});

test("activeKey returns default keyId or configured keyId", async () => {
  const defaultKeyring = new EnvOrFileKeyring();
  const defaultActive = await defaultKeyring.activeKey();
  assert.equal(defaultActive.keyId, "v1");

  const customKeyring = new EnvOrFileKeyring({ keyId: "v2-custom" });
  const customActive = await customKeyring.activeKey();
  assert.equal(customActive.keyId, "v2-custom");
});

test("invalid hex-encoded env var throws error", async () => {
  const original = process.env[ENV_VAR];
  try {
    // Non-hex characters
    process.env[ENV_VAR] = "not-hex-chars-at-all!!";
    const keyring1 = new EnvOrFileKeyring({ envVarName: ENV_VAR, allowFileFallback: false });
    await assert.rejects(
      () => keyring1.deriveSigningSecret({ workspaceId: "ws-1", subscriptionId: "sub-1", version: 1 }),
      /must be a hex-encoded string/
    );

    // Odd length hex
    process.env[ENV_VAR] = "abc";
    const keyring2 = new EnvOrFileKeyring({ envVarName: ENV_VAR, allowFileFallback: false });
    await assert.rejects(
      () => keyring2.deriveSigningSecret({ workspaceId: "ws-1", subscriptionId: "sub-1", version: 1 }),
      /must be a hex-encoded string/
    );
  } finally {
    if (original === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = original;
  }
});
