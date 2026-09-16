import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EnvOrFileKeyring,
  defaultRootKeyFilePath,
  generateFileRootKey,
  inspectRootKeyMaterial,
  revealRootKeyMaterial,
  RootKeyFileAlreadyExistsError,
} from "../keyring.env.js";

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

// ---------------------------------------------------------------------------
// 2026-09-09 fix: allowFileAutoGenerate decouples "may READ a file" from "may
// MINT one unattended" — the shape siteAssistantSecretKeyring now uses.
// ---------------------------------------------------------------------------

test("allowFileAutoGenerate: false throws rather than minting a file, when neither env var nor file exists", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    const keyring = new EnvOrFileKeyring({ envVarName: "TOVU_TEST_UNSET_VAR_AUTOGEN", keyFilePath, allowFileFallback: true, allowFileAutoGenerate: false });

    await assert.rejects(
      () => keyring.deriveSigningSecret({ workspaceId: "ws-1", subscriptionId: "sub-1", version: 1 }),
      /does not auto-generate one/
    );
    assert.equal(existsSync(keyFilePath), false, "must never create the file as a side effect of a refused resolve");
  });
});

test("allowFileAutoGenerate: false still READS a file an explicit generateFileRootKey already created", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    const generated = generateFileRootKey({ keyFilePath });

    const keyring = new EnvOrFileKeyring({ envVarName: "TOVU_TEST_UNSET_VAR_AUTOGEN_2", keyFilePath, allowFileFallback: true, allowFileAutoGenerate: false });
    const secret = await keyring.deriveSigningSecret({ workspaceId: "ws-1", subscriptionId: "sub-1", version: 1 });

    assert.equal(secret.length, 32);
    // Same file content still on disk — this instance read it, it did not overwrite it.
    assert.equal(readFileSync(keyFilePath, "utf8").trim(), generated.hex);
  });
});

test("allowFileAutoGenerate defaults to whatever allowFileFallback resolved to — unset behaves exactly as before this option existed", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "nested", "root-key.hex");
    const keyring = new EnvOrFileKeyring({ envVarName: "TOVU_TEST_UNSET_VAR_AUTOGEN_3", keyFilePath });

    // No allowFileAutoGenerate passed, allowFileFallback defaults to true -> must still auto-generate.
    const secret = await keyring.deriveSigningSecret({ workspaceId: "ws-1", subscriptionId: "sub-1", version: 1 });
    assert.equal(secret.length, 32);
    assert.equal(existsSync(keyFilePath), true);
  });
});

// ---------------------------------------------------------------------------
// 2026-09-09 durability fix: defaultRootKeyFilePath is mode-aware.
// ---------------------------------------------------------------------------

test("defaultRootKeyFilePath resolves under homedir() in local mode (TOVU_RUNTIME_MODE unset)", () => {
  const original = process.env.TOVU_RUNTIME_MODE;
  try {
    delete process.env.TOVU_RUNTIME_MODE;
    assert.equal(defaultRootKeyFilePath(), join(homedir(), ".tovu", "integrations-root-key.hex"));
  } finally {
    if (original === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = original;
  }
});

test("defaultRootKeyFilePath resolves under <cwd>/sites/.tovu in production mode — the durable Fly-volume path, not homedir()", () => {
  const original = process.env.TOVU_RUNTIME_MODE;
  try {
    process.env.TOVU_RUNTIME_MODE = "production";
    assert.equal(defaultRootKeyFilePath(), join(process.cwd(), "sites", ".tovu", "integrations-root-key.hex"));
  } finally {
    if (original === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = original;
  }
});

// ---------------------------------------------------------------------------
// generateFileRootKey — create-only, never overwrite.
// ---------------------------------------------------------------------------

test("generateFileRootKey writes a fresh 32-byte key and returns its hex/fingerprint/path", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    const result = generateFileRootKey({ keyFilePath });

    assert.equal(result.keyFilePath, keyFilePath);
    assert.equal(result.hex.length, 64, "32 bytes, hex-encoded, is 64 characters");
    assert.match(result.hex, /^[0-9a-f]{64}$/);
    assert.equal(result.fingerprint.length, 12);
    assert.equal(readFileSync(keyFilePath, "utf8").trim(), result.hex);
  });
});

test("generateFileRootKey throws RootKeyFileAlreadyExistsError, and never overwrites, when a file is already there", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    const first = generateFileRootKey({ keyFilePath });

    assert.throws(() => generateFileRootKey({ keyFilePath }), RootKeyFileAlreadyExistsError);
    // Untouched — the original value survived the refused second call.
    assert.equal(readFileSync(keyFilePath, "utf8").trim(), first.hex);
  });
});

/**
 * "Never overwrites" has to hold structurally, not just sequentially.
 *
 * A pre-check followed by a separate write is a check-then-write race: two concurrent
 * `POST .../generate` calls, or a double-clicked Generate button, can both observe "no key here"
 * and the second write then replaces the first key — orphaning every credential already sealed
 * under it, with a 201 and no error. A dangling symlink is the deterministic way to observe the
 * same missing guarantee, because `existsSync` follows the link and reports `false` for a target
 * that is not there while an ordinary `writeFileSync` follows it and creates one. An exclusive
 * create (`O_CREAT | O_EXCL`) refuses both, which is why the assertion is on the refusal and not
 * on any particular timing.
 */
test("generateFileRootKey refuses a target it did not create, even one existsSync() reports as absent", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    const linkTarget = join(dir, "somewhere-else.hex");
    symlinkSync(linkTarget, keyFilePath);

    assert.equal(existsSync(keyFilePath), false, "precondition: a dangling symlink reads as absent");

    assert.throws(() => generateFileRootKey({ keyFilePath }), RootKeyFileAlreadyExistsError);
    assert.equal(existsSync(linkTarget), false, "the key must not have been written through the link");
  });
});

// ---------------------------------------------------------------------------
// inspectRootKeyMaterial / revealRootKeyMaterial — status vs. reveal.
// ---------------------------------------------------------------------------

test("inspectRootKeyMaterial: none active when neither env var nor file resolves", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    const status = inspectRootKeyMaterial({ envVarName: "TOVU_TEST_UNSET_VAR_INSPECT_1", keyFilePath });
    assert.deepEqual(status, { active: false, source: "none", keyFilePath });
  });
});

test("inspectRootKeyMaterial: active via env var, with a fingerprint, and NEVER the raw value", async () => {
  const envVarName = "TOVU_TEST_INSPECT_ENV";
  process.env[envVarName] = "bb".repeat(32);
  try {
    const status = inspectRootKeyMaterial({ envVarName, keyFilePath: "/should/never/be/touched" });
    assert.equal(status.active, true);
    assert.equal(status.source, "env");
    assert.equal(status.fingerprint?.length, 12);
    assert.equal((status as { hex?: string }).hex, undefined, "status must never carry the raw key value");
  } finally {
    delete process.env[envVarName];
  }
});

test("inspectRootKeyMaterial: active via file when the env var is unset", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    const generated = generateFileRootKey({ keyFilePath });
    const status = inspectRootKeyMaterial({ envVarName: "TOVU_TEST_UNSET_VAR_INSPECT_2", keyFilePath });
    assert.equal(status.active, true);
    assert.equal(status.source, "file");
    assert.equal(status.fingerprint, generated.fingerprint);
  });
});

test("inspectRootKeyMaterial: invalid hex in the env var reports invalid, not active, and no fingerprint", async () => {
  const envVarName = "TOVU_TEST_INSPECT_INVALID";
  process.env[envVarName] = "not-valid-hex!!";
  try {
    const status = inspectRootKeyMaterial({ envVarName, keyFilePath: "/should/never/be/touched" });
    assert.equal(status.active, false);
    assert.equal(status.source, "env");
    assert.equal(status.invalid, true);
    assert.equal(status.fingerprint, undefined);
  } finally {
    delete process.env[envVarName];
  }
});

test("revealRootKeyMaterial: includes the raw hex value when active — the one function in this pair that can", async () => {
  const envVarName = "TOVU_TEST_REVEAL_ENV";
  const value = "cc".repeat(32);
  process.env[envVarName] = value;
  try {
    const reveal = revealRootKeyMaterial({ envVarName, keyFilePath: "/should/never/be/touched" });
    assert.equal(reveal.active, true);
    assert.equal(reveal.hex, value);
  } finally {
    delete process.env[envVarName];
  }
});

test("revealRootKeyMaterial: no hex field when nothing is active", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    const reveal = revealRootKeyMaterial({ envVarName: "TOVU_TEST_UNSET_VAR_REVEAL", keyFilePath });
    assert.equal(reveal.active, false);
    assert.equal(reveal.hex, undefined);
  });
});
