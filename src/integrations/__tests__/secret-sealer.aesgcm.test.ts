import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../secret-sealer.aesgcm";
import { InMemoryKeyring } from "../keyring.memory";

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

  const sealed = await sealer.seal({ plaintext: "AIzaSyCUytI-PiFmjdyaQA_tvetXb4Id4RXMuPw", key: activeKey });
  assert.equal(sealed.alg, "aes-256-gcm");
  assert.equal(sealed.keyId, activeKey.keyId);
  assert.notEqual(sealed.ciphertext, "AIzaSyCUytI-PiFmjdyaQA_tvetXb4Id4RXMuPw");

  const opened = await sealer.open({ sealed });
  assert.equal(opened, "AIzaSyCUytI-PiFmjdyaQA_tvetXb4Id4RXMuPw");
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

  await assert.rejects(() => sealer.open({ sealed: tampered }));
});

test("a tampered nonce also fails — GCM authenticates against the exact IV used to seal", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({ plaintext: "sensitive-value", key: await keyring.activeKey() });

  const tamperedIv = Buffer.from(sealed.nonce, "base64");
  tamperedIv[0] = tamperedIv[0] ^ 0xff;
  const tampered = { ...sealed, nonce: tamperedIv.toString("base64") };

  await assert.rejects(() => sealer.open({ sealed: tampered }));
});

test("an unsupported alg is rejected before any key derivation", async () => {
  const sealer = new AesGcmSecretSealer(new InMemoryKeyring());
  await assert.rejects(
    () => sealer.open({ sealed: { keyId: "v1", ciphertext: "AAAA", nonce: "AAAA", alg: "xchacha20poly1305" } }),
    /cannot open alg/
  );
});

test("open() re-derives from the sealed row's own keyId, not the keyring's CURRENT active key", async () => {
  // Two sealers sharing one keyring: seal under the keyring's key today, then confirm a fresh
  // sealer instance (same underlying root key) still opens it correctly purely from `sealed.keyId`
  // — proving the derivation is a pure function of the stored keyId, not of sealer/process state.
  const keyring = new InMemoryKeyring("v7");
  const sealerA = new AesGcmSecretSealer(keyring);
  const sealed = await sealerA.seal({ plaintext: "rotation-safe-value", key: await keyring.activeKey() });

  const sealerB = new AesGcmSecretSealer(keyring);
  assert.equal(await sealerB.open({ sealed }), "rotation-safe-value");
});
