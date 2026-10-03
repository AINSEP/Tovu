import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { mock, test } from "node:test";

// Public fixture material only. Pin the existing adapter before extracting it.
const rootKeyHex = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const iv = Buffer.from("202122232425262728292a2b", "hex");
const aad = "vendor-credential-set:v1:ws-1:github:cred-1";
const plaintext = "not-a-real-credential-just-fixture-plaintext";
const fixture = {
  keyId: "v1",
  ciphertext: "k4x3HnV2IOA/glDbtHXFOSSNNCvrDhyEngtsVHk+d8v4SbXwzfbClqF6LkOS7SXtV6YeiM9IV03tS9H9",
  nonce: "ICEiIyQlJicoKSor",
  alg: "aes-256-gcm",
};

test("current sealing wire bytes and stored fixture remain pinned", async () => {
  const cryptoMock = mock.module("node:crypto", {
    namedExports: { ...crypto, randomBytes: () => Buffer.from(iv) },
  });
  try {
    const { AesGcmSecretSealer } = await import("../secret-sealer.aesgcm.js");
    const { FixedRootKeyKeyring } = await import("../keyring.env.js");
    const keyring = new FixedRootKeyKeyring(rootKeyHex);
    // Independently pin the existing salt and derivation labels as well as the envelope.
    assert.deepEqual(
      await keyring.derive({ workspaceId: "secret-sealer", purpose: "secret-sealer.v1", info: "v1" }),
      new Uint8Array(crypto.hkdfSync("sha256", Buffer.from(rootKeyHex, "hex"),
        "tovu-integrations-root-key-hkdf-v1", "secret-sealer.v1:secret-sealer:v1", 32)),
    );
    const sealer = new AesGcmSecretSealer(keyring);
    assert.deepEqual(await sealer.seal({ plaintext, key: await keyring.activeKey(), aad }), fixture);
    assert.equal(await sealer.open({ sealed: fixture, aad }), plaintext);
  } finally {
    cryptoMock.restore();
  }
});
