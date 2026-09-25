import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EnvOrFileKeyring,
  defaultRootKeyFilePath,
  fingerprintRootKeyHex,
  generateFileRootKey,
  inspectRootKeyMaterial,
  revealRootKeyMaterial,
  RootKeyFileAlreadyExistsError,
  UnusableRootKeyError,
} from "../keyring.env.js";
import type { SiteKeySource } from "../site-key-sources.js";

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
      {
        name: "UnusableRootKeyError",
        message:
          'TOVU_TEST_INTEGRATIONS_ROOT_KEY is not usable as a root key: it contains characters that are not hex digits (only 0-9 and a-f are allowed; a "0x" prefix, whitespace inside the value, or a base64 or PEM body all fail this). Tovu refuses to derive any key material from it rather than sealing under a shortened or empty key.',
      }
    );

    // Odd length hex
    process.env[ENV_VAR] = "abc";
    const keyring2 = new EnvOrFileKeyring({ envVarName: ENV_VAR, allowFileFallback: false });
    await assert.rejects(
      () => keyring2.deriveSigningSecret({ workspaceId: "ws-1", subscriptionId: "sub-1", version: 1 }),
      {
        name: "UnusableRootKeyError",
        message:
          "TOVU_TEST_INTEGRATIONS_ROOT_KEY is not usable as a root key: it has an odd number of hex digits (3), so it does not describe whole bytes — usually a partial write or a truncated copy. Tovu refuses to derive any key material from it rather than sealing under a shortened or empty key.",
      }
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

// ---------------------------------------------------------------------------
// 2026-09-16 fix: the FILE branch of resolveRootKey validates what the ENV
// branch validates (and a minimum length), and shares ONE verdict with
// inspectRootKeyMaterial.
//
// Before this fix the file branch was a bare `Buffer.from(hex, "hex")`:
// non-hex content silently became a ZERO-length buffer, `hkdfSync` accepted it,
// and every credential on that install was sealed under an AES key that is a
// fixed function of public constants — computable by anyone with the source.
// Meanwhile `inspectRootKeyMaterial` (its own validator) reported the same file
// as unusable, so the Secrets screen and the sealer disagreed and the sealer won.
// ---------------------------------------------------------------------------

/** Every way a real operator produces a broken key file, plus what is wrong with each. */
const MALFORMED_KEY_FILE_CONTENTS: ReadonlyArray<{ label: string; contents: string; reason: RegExp }> = [
  { label: "a pasted 0x prefix", contents: `0x${"ab".repeat(32)}`, reason: /not hex digits/ },
  { label: "wholly non-hex content", contents: "not-hex-at-all", reason: /not hex digits/ },
  { label: "a base64 body someone pasted instead of hex", contents: "c2VjcmV0LXJvb3Qta2V5", reason: /not hex digits/ },
  { label: "an odd number of hex digits (a partial write)", contents: "ab".repeat(31) + "c", reason: /odd number of hex digits/ },
  { label: "a truncated copy", contents: "ab".repeat(8), reason: /at least 32 bytes/ },
  { label: "an empty file", contents: "", reason: /empty/ },
];

for (const { label, contents, reason } of MALFORMED_KEY_FILE_CONTENTS) {
  test(`resolveRootKey REFUSES a key file containing ${label} — it never seals under truncated bytes`, async () => {
    await withTempDir(async (dir) => {
      const keyFilePath = join(dir, "root-key.hex");
      writeFileSync(keyFilePath, contents, { mode: 0o600 });

      const keyring = new EnvOrFileKeyring({
        envVarName: "TOVU_TEST_UNSET_VAR_MALFORMED_FILE",
        keyFilePath,
        allowFileFallback: true,
        allowFileAutoGenerate: false,
      });

      await assert.rejects(
        () => keyring.derive({ workspaceId: "ws-1", purpose: "secret-sealer", info: "v1" }),
        reason,
        `a key file containing ${label} must not produce usable key material`
      );
      // The refused resolve must not have "repaired" the file behind the operator's back.
      assert.equal(readFileSync(keyFilePath, "utf8"), contents, "a refused resolve must never rewrite the key file");
    });
  });
}

/**
 * RED evidence, 2026-09-16, pre-fix: for a key file containing `not-hex-at-all`, `derive({ workspaceId:
 * "ws-1", purpose: "secret-sealer", info: "v1" })` RETURNED `e1d4c02ee8ce76d8…` — byte-identical to
 * `hkdfSync("sha256", Buffer.alloc(0), "tovu-integrations-root-key-hkdf-v1", "secret-sealer:ws-1:v1", 32)`,
 * i.e. a key anyone with the source can compute. The assertion is on the typed refusal, which is the
 * only outcome that rules that value out.
 */
test("a non-hex key file is refused with a typed UnusableRootKeyError, not collapsed to the publicly computable zero-length-IKM key", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    writeFileSync(keyFilePath, "not-hex-at-all", { mode: 0o600 });

    const keyring = new EnvOrFileKeyring({
      envVarName: "TOVU_TEST_UNSET_VAR_ZERO_IKM",
      keyFilePath,
      allowFileFallback: true,
      allowFileAutoGenerate: false,
    });

    await assert.rejects(
      () => keyring.derive({ workspaceId: "ws-1", purpose: "secret-sealer", info: "v1" }),
      (err: unknown) => {
        assert.ok(err instanceof UnusableRootKeyError);
        assert.equal(err.source, "file");
        assert.equal(err.reason, "not-hex");
        return true;
      }
    );
  });
});

test("the status screen and the sealer cannot disagree: whatever inspectRootKeyMaterial calls unusable, resolveRootKey refuses", async () => {
  await withTempDir(async (dir) => {
    const envVarName = "TOVU_TEST_UNSET_VAR_AGREEMENT";
    const keyFilePath = join(dir, "root-key.hex");

    for (const { contents } of MALFORMED_KEY_FILE_CONTENTS) {
      writeFileSync(keyFilePath, contents, { mode: 0o600 });

      const status = inspectRootKeyMaterial({ envVarName, keyFilePath });
      assert.equal(status.active, false, `inspect must report ${JSON.stringify(contents)} unusable`);

      const keyring = new EnvOrFileKeyring({ envVarName, keyFilePath, allowFileFallback: true, allowFileAutoGenerate: false });
      await assert.rejects(
        () => keyring.derive({ workspaceId: "ws-1", purpose: "secret-sealer", info: "v1" }),
        `resolveRootKey must refuse the same material inspect reports unusable: ${JSON.stringify(contents)}`
      );
    }
  });
});

test("a hex key shorter than 32 bytes is unusable through BOTH paths — a short env var is not a root key either", async () => {
  const envVarName = "TOVU_TEST_SHORT_ENV_KEY";
  process.env[envVarName] = "ab".repeat(16); // 16 bytes: valid hex, even length, still too short.
  try {
    const status = inspectRootKeyMaterial({ envVarName, keyFilePath: "/should/never/be/touched" });
    assert.equal(status.active, false);
    assert.equal(status.invalid, true);

    const keyring = new EnvOrFileKeyring({ envVarName, allowFileFallback: false });
    await assert.rejects(
      () => keyring.derive({ workspaceId: "ws-1", purpose: "secret-sealer", info: "v1" }),
      /at least 32 bytes/
    );
  } finally {
    delete process.env[envVarName];
  }
});

test("the malformed-key-file error names the file, says what is wrong, and does NOT imply replacing it restores anything", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    writeFileSync(keyFilePath, `0x${"ab".repeat(32)}`, { mode: 0o600 });

    const keyring = new EnvOrFileKeyring({
      envVarName: "TOVU_TEST_UNSET_VAR_MESSAGE",
      keyFilePath,
      allowFileFallback: true,
      allowFileAutoGenerate: false,
    });

    await assert.rejects(() => keyring.derive({ workspaceId: "ws-1", purpose: "secret-sealer", info: "v1" }), {
      name: "UnusableRootKeyError",
      source: "file",
      reason: "not-hex",
      message:
        `the root key file at ${keyFilePath} is not usable as a root key: it contains characters that are not hex digits (only 0-9 and a-f are allowed; a "0x" prefix, whitespace inside the value, or a base64 or PEM body all fail this). Tovu refuses to derive any key material from it rather than sealing under a shortened or empty key. ` +
        "IMPORTANT: anything this site sealed while this file was in place was sealed under key material derived from these same bytes, not from a real 32-byte key, so those stored credentials are not protected as intended — with empty or very short material the derived key is computable from published constants. " +
        "Replacing or regenerating the key will NOT restore them; it will make them unreadable. " +
        "Do not overwrite, delete or regenerate this key until you have decided what to do with the credentials already stored.",
    });
  });
});

test("a malformed env var that could never have sealed anything gets no already-sealed warning; a too-short one that could have, does", async () => {
  const envVarName = "TOVU_TEST_ENV_WARNING_SCOPE";
  try {
    process.env[envVarName] = "zz".repeat(32);
    const neverAccepted = new EnvOrFileKeyring({ envVarName, allowFileFallback: false });
    const notHexError = await neverAccepted.derive({ workspaceId: "ws-1", purpose: "p", info: "i" }).then(() => undefined, (err: Error) => err);
    assert.ok(notHexError instanceof UnusableRootKeyError);
    assert.doesNotMatch(notHexError.message, /IMPORTANT/);

    process.env[envVarName] = "ab".repeat(16);
    const previouslyAccepted = new EnvOrFileKeyring({ envVarName, allowFileFallback: false });
    const tooShortError = await previouslyAccepted.derive({ workspaceId: "ws-1", purpose: "p", info: "i" }).then(() => undefined, (err: Error) => err);
    assert.ok(tooShortError instanceof UnusableRootKeyError);
    assert.equal(tooShortError.reason, "too-short");
    assert.match(tooShortError.message, /^TOVU_TEST_ENV_WARNING_SCOPE is not usable as a root key: it is 16 bytes \(32 hex digits\); a root key must be at least 32 bytes \(64 hex digits\)/);
    assert.match(tooShortError.message, /anything this site sealed while this value was in place/);
  } finally {
    delete process.env[envVarName];
  }
});

test("inspectRootKeyMaterial reports the SAME rejection reason resolveRootKey throws with", async () => {
  await withTempDir(async (dir) => {
    const envVarName = "TOVU_TEST_UNSET_VAR_REASON_AGREEMENT";
    const keyFilePath = join(dir, "root-key.hex");
    writeFileSync(keyFilePath, "ab".repeat(8), { mode: 0o600 });

    assert.deepEqual(inspectRootKeyMaterial({ envVarName, keyFilePath }), {
      active: false,
      source: "file",
      invalid: true,
      reason: "too-short",
      keyFilePath,
    });
    const reveal = revealRootKeyMaterial({ envVarName, keyFilePath });
    assert.equal(reveal.hex, undefined, "reveal must not disclose rejected material either");
    assert.equal(reveal.reason, "too-short");

    const keyring = new EnvOrFileKeyring({ envVarName, keyFilePath, allowFileFallback: true, allowFileAutoGenerate: false });
    await assert.rejects(() => keyring.derive({ workspaceId: "ws-1", purpose: "p", info: "i" }), { reason: "too-short" });
  });
});

test("a valid key file with a trailing newline is still usable — trimming whitespace around the value is not malformed", async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "root-key.hex");
    writeFileSync(keyFilePath, `${"cd".repeat(32)}\n`, { mode: 0o600 });

    const status = inspectRootKeyMaterial({ envVarName: "TOVU_TEST_UNSET_VAR_TRAILING_NL", keyFilePath });
    assert.equal(status.active, true);
    const keyring = new EnvOrFileKeyring({ envVarName: "TOVU_TEST_UNSET_VAR_TRAILING_NL", keyFilePath, allowFileFallback: true, allowFileAutoGenerate: false });
    const secret = await keyring.derive({ workspaceId: "ws-1", purpose: "p", info: "i" });
    assert.equal(secret.length, 32);
  });
});

// ---------------------------------------------------------------------------
// Site-key plan §A.1 slice 1: `sources` overrides the hardcoded env-then-file
// precedence. No real caller passes this yet (Stage A3a wires the boot path) —
// these tests exercise the seam directly.
// ---------------------------------------------------------------------------

test("sources: the first source with material wins, later sources are never even read", async () => {
  await withTempDir(async (dir) => {
    const winningFile = join(dir, "winning.hex");
    const neverReadFile = join(dir, "should-not-be-touched.hex");
    const winningHex = "11".repeat(32);
    writeFileSync(winningFile, winningHex, { mode: 0o600 });
    // deliberately no file at neverReadFile

    const sources: SiteKeySource[] = [
      { kind: "per-site-file", path: winningFile },
      { kind: "legacy-shared-file", path: neverReadFile },
    ];
    const keyring = new EnvOrFileKeyring({ sources });
    const secret = await keyring.derive({ workspaceId: "ws-1", purpose: "p", info: "i" });
    assert.equal(secret.length, 32);
  });
});

test("sources: an env-kind source reads the named env var", async () => {
  const envVarName = "TOVU_TEST_SOURCES_ENV";
  process.env[envVarName] = "22".repeat(32);
  try {
    const sources: SiteKeySource[] = [{ kind: "env", envVarName }];
    const keyring = new EnvOrFileKeyring({ sources });
    const secret = await keyring.derive({ workspaceId: "ws-1", purpose: "p", info: "i" });
    assert.equal(secret.length, 32);
  } finally {
    delete process.env[envVarName];
  }
});

test("sources: a present-but-invalid source throws immediately — it does not fall through to the next source", async () => {
  await withTempDir(async (dir) => {
    const invalidFile = join(dir, "invalid.hex");
    const neverReadFile = join(dir, "never-read.hex");
    writeFileSync(invalidFile, "not-hex-at-all", { mode: 0o600 });
    writeFileSync(neverReadFile, "33".repeat(32), { mode: 0o600 });

    const sources: SiteKeySource[] = [
      { kind: "per-site-file", path: invalidFile },
      { kind: "legacy-shared-file", path: neverReadFile },
    ];
    const keyring = new EnvOrFileKeyring({ sources });
    await assert.rejects(
      () => keyring.derive({ workspaceId: "ws-1", purpose: "p", info: "i" }),
      (err: unknown) => {
        assert.ok(err instanceof UnusableRootKeyError);
        assert.equal(err.source, "file");
        assert.equal(err.reason, "not-hex");
        return true;
      }
    );
  });
});

test("sources: exhausting every source throws, and never auto-generates a file — a sources-based keyring stays a reader", async () => {
  await withTempDir(async (dir) => {
    const neverCreatedFile = join(dir, "never-created.hex");
    const sources: SiteKeySource[] = [{ kind: "per-site-file", path: neverCreatedFile }];
    // allowFileAutoGenerate defaults to true (allowFileFallback also defaults true) — proves
    // `sources` overrides that default rather than inheriting it.
    const keyring = new EnvOrFileKeyring({ sources });

    await assert.rejects(
      () => keyring.derive({ workspaceId: "ws-1", purpose: "p", info: "i" }),
      /no root key: none of the configured sources resolved/
    );
    assert.equal(existsSync(neverCreatedFile), false, "a sources-based keyring must never mint a file itself");
  });
});

test("sources: a blank env var is treated as ABSENT, not present-but-invalid — falls through to the next source", async () => {
  const envVarName = "TOVU_TEST_SOURCES_BLANK_ENV";
  await withTempDir(async (dir) => {
    const fallbackFile = join(dir, "fallback.hex");
    writeFileSync(fallbackFile, "44".repeat(32), { mode: 0o600 });
    process.env[envVarName] = "";
    try {
      const sources: SiteKeySource[] = [
        { kind: "env", envVarName },
        { kind: "legacy-shared-file", path: fallbackFile },
      ];
      const keyring = new EnvOrFileKeyring({ sources });
      const secret = await keyring.derive({ workspaceId: "ws-1", purpose: "p", info: "i" });
      assert.equal(secret.length, 32);
    } finally {
      delete process.env[envVarName];
    }
  });
});

test("sources: a whitespace-only env var is also treated as ABSENT", async () => {
  const envVarName = "TOVU_TEST_SOURCES_WHITESPACE_ENV";
  await withTempDir(async (dir) => {
    const fallbackFile = join(dir, "fallback.hex");
    writeFileSync(fallbackFile, "55".repeat(32), { mode: 0o600 });
    process.env[envVarName] = "   ";
    try {
      const sources: SiteKeySource[] = [
        { kind: "env", envVarName },
        { kind: "legacy-shared-file", path: fallbackFile },
      ];
      const keyring = new EnvOrFileKeyring({ sources });
      const secret = await keyring.derive({ workspaceId: "ws-1", purpose: "p", info: "i" });
      assert.equal(secret.length, 32);
    } finally {
      delete process.env[envVarName];
    }
  });
});

// ---------------------------------------------------------------------------
// Site-key plan §A3b: `inspectRootKeyMaterial`/`revealRootKeyMaterial` accept the same `sources`
// seam as `EnvOrFileKeyring`, but never throw — a status read, not a resolution.
// ---------------------------------------------------------------------------

test("inspectRootKeyMaterial: sources — the first source with material wins and reports active", async () => {
  await withTempDir(async (dir) => {
    const perSiteFile = join(dir, "per-site.hex");
    const legacyFile = join(dir, "legacy.hex");
    const hex = "66".repeat(32);
    writeFileSync(perSiteFile, hex, { mode: 0o600 });
    writeFileSync(legacyFile, "should-not-be-read", { mode: 0o600 });

    const sources: SiteKeySource[] = [
      { kind: "per-site-file", path: perSiteFile },
      { kind: "legacy-shared-file", path: legacyFile },
    ];
    const status = inspectRootKeyMaterial({ sources });

    assert.equal(status.active, true);
    assert.equal(status.source, "file");
    assert.equal(status.fingerprint, fingerprintRootKeyHex(hex));
  });
});

test("inspectRootKeyMaterial: sources — an env-kind source reports source 'env'", async () => {
  const envVarName = "TOVU_TEST_INSPECT_SOURCES_ENV";
  process.env[envVarName] = "77".repeat(32);
  try {
    const sources: SiteKeySource[] = [{ kind: "env", envVarName }];
    const status = inspectRootKeyMaterial({ sources });
    assert.equal(status.active, true);
    assert.equal(status.source, "env");
  } finally {
    delete process.env[envVarName];
  }
});

test("inspectRootKeyMaterial: sources — a present-but-invalid source is reported invalid, never thrown (a status read must not throw)", async () => {
  await withTempDir(async (dir) => {
    const invalidFile = join(dir, "invalid.hex");
    writeFileSync(invalidFile, "not-hex-at-all", { mode: 0o600 });

    const sources: SiteKeySource[] = [{ kind: "per-site-file", path: invalidFile }];
    const status = inspectRootKeyMaterial({ sources });

    assert.equal(status.active, false);
    assert.equal(status.invalid, true);
    assert.equal(status.reason, "not-hex");
  });
});

test("inspectRootKeyMaterial: sources — a blank env var falls through to the next source, exactly like EnvOrFileKeyring", async () => {
  const envVarName = "TOVU_TEST_INSPECT_SOURCES_BLANK_ENV";
  await withTempDir(async (dir) => {
    const fallbackFile = join(dir, "fallback.hex");
    const hex = "88".repeat(32);
    writeFileSync(fallbackFile, hex, { mode: 0o600 });
    process.env[envVarName] = "";
    try {
      const sources: SiteKeySource[] = [
        { kind: "env", envVarName },
        { kind: "legacy-shared-file", path: fallbackFile },
      ];
      const status = inspectRootKeyMaterial({ sources });
      assert.equal(status.active, true);
      assert.equal(status.source, "file");
      assert.equal(status.fingerprint, fingerprintRootKeyHex(hex));
    } finally {
      delete process.env[envVarName];
    }
  });
});

test("inspectRootKeyMaterial: sources — nothing present anywhere reports inactive, source 'none', not invalid", () => {
  const status = inspectRootKeyMaterial({ sources: [{ kind: "per-site-file", path: "/never/created.hex" }] });
  assert.equal(status.active, false);
  assert.equal(status.source, "none");
  assert.equal(status.invalid, undefined);
});

test("inspectRootKeyMaterial: sources — keyFilePath is the per-site-file candidate's path, not the legacy default; envVarName/keyFilePath options are ignored", () => {
  const sources: SiteKeySource[] = [{ kind: "per-site-file", path: "/site-keys/site-abc.hex" }];
  const status = inspectRootKeyMaterial({ sources, keyFilePath: "/should/be/ignored.hex" });
  assert.equal(status.keyFilePath, "/site-keys/site-abc.hex");
});

test("revealRootKeyMaterial: sources — includes the raw hex when a source resolves", async () => {
  await withTempDir(async (dir) => {
    const perSiteFile = join(dir, "per-site.hex");
    const hex = "99".repeat(32);
    writeFileSync(perSiteFile, hex, { mode: 0o600 });

    const sources: SiteKeySource[] = [{ kind: "per-site-file", path: perSiteFile }];
    const reveal = revealRootKeyMaterial({ sources });

    assert.equal(reveal.active, true);
    assert.equal(reveal.hex, hex);
    assert.equal(reveal.fingerprint, fingerprintRootKeyHex(hex));
  });
});

test("revealRootKeyMaterial: sources — a present-but-invalid source is reported invalid, never thrown", () => {
  const reveal = revealRootKeyMaterial({ sources: [{ kind: "env", envVarName: "TOVU_TEST_REVEAL_SOURCES_MISSING" }] });
  assert.equal(reveal.active, false);
  assert.equal(reveal.source, "none");
  assert.equal(reveal.hex, undefined);
});

test("a key longer than 32 bytes is still accepted — the floor is a minimum, not an exact length", async () => {
  const envVarName = "TOVU_TEST_LONG_ENV_KEY";
  process.env[envVarName] = "ef".repeat(64);
  try {
    assert.equal(inspectRootKeyMaterial({ envVarName, keyFilePath: "/should/never/be/touched" }).active, true);
    const keyring = new EnvOrFileKeyring({ envVarName, allowFileFallback: false });
    const secret = await keyring.derive({ workspaceId: "ws-1", purpose: "p", info: "i" });
    assert.equal(secret.length, 32);
  } finally {
    delete process.env[envVarName];
  }
});

test("generateFileRootKey creates a missing key directory at mode 0700 (site-key plan §A.1: the site-keys dir is 0700)", { skip: process.platform === "win32" }, async () => {
  await withTempDir(async (dir) => {
    const keyFilePath = join(dir, "site-keys", "site-1.hex");
    generateFileRootKey({ keyFilePath });
    const { statSync } = await import("node:fs");
    assert.equal(statSync(join(dir, "site-keys")).mode & 0o777, 0o700);
    assert.equal(statSync(keyFilePath).mode & 0o777, 0o600);
  });
});
