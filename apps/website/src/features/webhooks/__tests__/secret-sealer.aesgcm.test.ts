import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { FixedSiteKeyKeyring } from "../keyring.env.js";
import { AesGcmSecretSealer, SECRET_OPEN_FAILED } from "../secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../keyring.memory.js";

/**
 * @file `AesGcmSecretSealer` — ADR-058's first real `SecretSealerPort` implementation.
 *
 * What matters most here, in order: a value round-trips through REAL AES-GCM (not a stub), a
 * tampered ciphertext or auth tag is rejected rather than silently decrypted into garbage, an
 * unsupported `alg` is rejected before any key derivation happens, and two `seal()` calls for the
 * same plaintext never produce the same ciphertext (a fresh IV every time — GCM's core requirement).
 */

test("seal then open round-trips the plaintext exactly", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  const sealed = await sealer.seal({ plaintext: "not-a-real-credential-just-fixture-plaintext", key: activeKey });
  assert.equal(sealed.alg, "aes-256-gcm");
  assert.equal(sealed.keyId, activeKey.keyId);
  assert.notEqual(sealed.ciphertext, "not-a-real-credential-just-fixture-plaintext");

  const opened = await sealer.open({ sealed });
  assert.equal(opened, "not-a-real-credential-just-fixture-plaintext");
});

test("two seals of the same plaintext produce different ciphertext and nonce (fresh IV every call)", async () => {
  const sealer = new AesGcmSecretSealer(new InMemoryKeyring());
  const activeKey = await (new InMemoryKeyring()).activeKey();

  const first = await sealer.seal({ plaintext: "same-secret", key: activeKey });
  const second = await sealer.seal({ plaintext: "same-secret", key: activeKey });

  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.nonce, second.nonce);
});

test("a tampered ciphertext fails auth-tag verification rather than opening to garbage", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({ plaintext: "sensitive-value", key: await keyring.activeKey() });

  const tamperedBytes = Buffer.from(sealed.ciphertext, "base64");
  tamperedBytes[0] = tamperedBytes[0] ^ 0xff;
  const tampered = { ...sealed, ciphertext: tamperedBytes.toString("base64") };

  await assert.rejects(() => sealer.open({ sealed: tampered }), /unable to authenticate data/);
});

test("a tampered nonce also fails — GCM authenticates against the exact IV used to seal", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({ plaintext: "sensitive-value", key: await keyring.activeKey() });

  const tamperedIv = Buffer.from(sealed.nonce, "base64");
  tamperedIv[0] = tamperedIv[0] ^ 0xff;
  const tampered = { ...sealed, nonce: tamperedIv.toString("base64") };

  await assert.rejects(() => sealer.open({ sealed: tampered }), /unable to authenticate data/);
});

test("an unsupported alg is rejected before any key derivation", async () => {
  const keyring = new InMemoryKeyring();
  let deriveCalls = 0;
  keyring.derive = async () => {
    deriveCalls += 1;
    throw new Error("derive must not be reached for an unsupported algorithm");
  };
  const sealer = new AesGcmSecretSealer(keyring);
  await assert.rejects(
    () => sealer.open({ sealed: { keyId: "v1", ciphertext: "AAAA", nonce: "AAAA", alg: "xchacha20poly1305" } }),
    /cannot open alg/
  );
  assert.equal(deriveCalls, 0);
});

/**
 * `aad` regression coverage (2026-08-15, `publish_credential_sets` hardening) — see
 * `secret-sealer.aesgcm.ts`'s file header for the full design. These four tests are the exact
 * scenarios the fix must satisfy: existing no-AAD callers are untouched, and AAD becomes a real
 * cryptographic binding, not a decorative parameter.
 */

test("backward compatibility: a value sealed with no aad still opens with no aad (existing rows keep working)", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({ plaintext: "legacy-row-value", key: await keyring.activeKey() });

  const opened = await sealer.open({ sealed });
  assert.equal(opened, "legacy-row-value");
});

test("a value sealed with aad opens correctly when the SAME aad is supplied", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const aad = "ws-1:github-pages:cred-42";
  const sealed = await sealer.seal({ plaintext: "scoped-token", key: await keyring.activeKey(), aad });

  const opened = await sealer.open({ sealed }, { aad });
  assert.equal(opened, "scoped-token");
});

test("a value sealed with aad A throws when opened with aad B (cross-tenant/cross-record transplant is rejected)", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({ plaintext: "scoped-token", key: await keyring.activeKey(), aad: "ws-1:github-pages:cred-42" });

  await assert.rejects(() => sealer.open({ sealed }, { aad: "ws-2:github-pages:cred-42" }));
});

test("a value sealed with aad A throws when opened with NO aad", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({ plaintext: "scoped-token", key: await keyring.activeKey(), aad: "ws-1:github-pages:cred-42" });

  await assert.rejects(() => sealer.open({ sealed }));
});

test("a value sealed with NO aad throws when opened WITH an aad (asymmetry fails both directions)", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({ plaintext: "unscoped-token", key: await keyring.activeKey() });

  await assert.rejects(() => sealer.open({ sealed }, { aad: "ws-1:github-pages:cred-42" }));
});

test("open() re-derives from the sealed row's own keyId, not the keyring's CURRENT active key", async () => {
  const generations = { v7: new InMemoryKeyring("v7"), v8: new InMemoryKeyring("v8") };
  let activeKeyId: keyof typeof generations = "v7";
  const keyring = {
    activeKey: async () => ({ keyId: activeKeyId }),
    deriveSigningSecret: generations.v7.deriveSigningSecret.bind(generations.v7),
    derive: async (input: { workspaceId: string; purpose: string; info: string }) => {
      const generation = generations[input.info as keyof typeof generations];
      if (!generation) throw new Error(`unknown key generation: ${input.info}`);
      return generation.derive(input);
    },
  };
  const sealerA = new AesGcmSecretSealer(keyring);
  const sealed = await sealerA.seal({ plaintext: "rotation-safe-value", key: await keyring.activeKey() });

  activeKeyId = "v8";
  const sealerB = new AesGcmSecretSealer(keyring);
  assert.equal(await sealerB.open({ sealed }), "rotation-safe-value");
  await assert.rejects(() => sealerB.open({ sealed: { ...sealed, keyId: "v8" } }), /unable to authenticate data/);
  await assert.rejects(() => sealerB.open({ sealed: { ...sealed, keyId: "unknown" } }), /unknown key generation/);
});

for (const aad of [undefined, "workspace-1:empty-verifier"]) {
  test(`empty plaintext round-trips with aad=${String(aad)}`, async () => {
    const keyring = new InMemoryKeyring();
    const sealer = new AesGcmSecretSealer(keyring);
    const sealed = await sealer.seal({ plaintext: "", key: await keyring.activeKey(), aad });
    assert.equal(Buffer.from(sealed.ciphertext, "base64").length, 16);
    assert.equal(await sealer.open({ sealed }, { aad }), "");
  });
}

test("ciphertext shorter than a complete authentication tag is rejected", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({ plaintext: "", key: await keyring.activeKey() });
  await assert.rejects(
    () => sealer.open({ sealed: { ...sealed, ciphertext: Buffer.alloc(15).toString("base64") } }),
    /ciphertext too short to contain an auth tag/
  );
});

test("every failure to open the sealed value itself carries SECRET_OPEN_FAILED (wrong key, tampered, damaged, unknown alg); its message is kept", async () => {
  // Two real, different project keys, built at runtime: the runtime's own wording (OpenSSL in Node,
  // BoringSSL in Electron) never decides how a wrong key is classified, the code does.
  const sealedBy = new AesGcmSecretSealer(new FixedSiteKeyKeyring(randomBytes(32).toString("hex")));
  const openedBy = new AesGcmSecretSealer(new FixedSiteKeyKeyring(randomBytes(32).toString("hex")));
  const keyring = new InMemoryKeyring();
  const sealed = await sealedBy.seal({ plaintext: "fixture-value", key: await keyring.activeKey() });
  const wrongKey = await openedBy.open({ sealed }).catch((caught: unknown) => caught);
  assert.ok(wrongKey instanceof Error);
  assert.equal((wrongKey as { code?: unknown }).code, SECRET_OPEN_FAILED);
  assert.ok((wrongKey as Error).cause instanceof Error, "the runtime's own error is kept as the cause");
  assert.equal((wrongKey as Error).message, ((wrongKey as Error).cause as Error).message);
  for (const damaged of [{ ...sealed, ciphertext: Buffer.from("short").toString("base64") }, { ...sealed, alg: "aes-128-cbc" },
    { ...sealed, ciphertext: Buffer.from(Buffer.from(sealed.ciphertext, "base64").map((byte, index) => index === 0 ? byte ^ 1 : byte)).toString("base64") }]) {
    await assert.rejects(sealedBy.open({ sealed: damaged }), (caught: unknown) => (caught as { code?: unknown }).code === SECRET_OPEN_FAILED);
  }
});

test("a keyring that can't derive (no key, an unusable key) is NOT an open failure: its error passes through as itself", async () => {
  const failure = new Error("no site key: none of the configured sources resolved");
  const keyring = new InMemoryKeyring();
  const sealed = await new AesGcmSecretSealer(keyring).seal({ plaintext: "fixture-value", key: await keyring.activeKey() });
  const broken = Object.assign(Object.create(keyring) as InMemoryKeyring, { derive: async () => { throw failure; } });
  await assert.rejects(new AesGcmSecretSealer(broken).open({ sealed }), (caught) => caught === failure);
});
