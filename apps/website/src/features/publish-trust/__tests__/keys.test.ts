import assert from "node:assert/strict";
import { hkdfSync } from "node:crypto";
import test from "node:test";

import type { KeyringPort } from "../../webhooks/index.js";
import {
  derivePublishSigningKey,
  deriveInstallationId,
  publishPrincipalIdFor,
  verifyPublishSignature,
} from "../keys.js";

/**
 * @file Security proofs for the derived publishing keypair.
 *
 * Every negative case below was additionally confirmed RED by deliberately breaking the
 * implementation and re-running — see the file `deliberate-break-log.md` note in the handoff. A
 * crypto test that has only ever been green proves nothing about whether it can fail.
 */

/** A faithful {@link KeyringPort} double: the SAME HKDF construction `keyring.env.ts` uses
 *  (sha256, 32-byte output, `purpose` bound into the info string), over a fixed root key. A
 *  friendlier double — one that returned the info string hashed differently, or ignored `purpose` —
 *  would let a domain-separation bug pass here and fail in production. */
function testKeyring(rootKeyHex: string): KeyringPort {
  const rootKey = Buffer.from(rootKeyHex, "hex");
  return {
    async activeKey() {
      return { keyId: "v1" };
    },
    async deriveSigningSecret() {
      throw new Error("not used by publish-trust");
    },
    async derive(input: { workspaceId: string; purpose: string; info: string }) {
      const effectiveInfo = `${input.purpose}:${input.workspaceId}:${input.info}`;
      return new Uint8Array(hkdfSync("sha256", rootKey, Buffer.alloc(0), effectiveInfo, 32));
    },
  } as unknown as KeyringPort;
}

const ROOT_A = "a".repeat(64);
const ROOT_B = "b".repeat(64);
const WORKSPACE = "ws-1";

function keyInput(overrides: Partial<Parameters<typeof derivePublishSigningKey>[0]> = {}) {
  return {
    keyring: testKeyring(ROOT_A),
    workspaceId: WORKSPACE,
    sourceInstallationId: "src-install",
    targetOrigin: "https://tovu.com",
    generation: 1,
    ...overrides,
  };
}

test("the publishing keypair is derived, not stored — same inputs always produce the same key", async () => {
  const first = await derivePublishSigningKey(keyInput());
  const second = await derivePublishSigningKey(keyInput());
  assert.equal(first.publicKeyB64u, second.publicKeyB64u);
  // This is what makes "no key at rest" possible: the key is recomputed, never persisted.
});

test("rotating the generation produces a completely different key", async () => {
  const gen1 = await derivePublishSigningKey(keyInput({ generation: 1 }));
  const gen2 = await derivePublishSigningKey(keyInput({ generation: 2 }));
  assert.notEqual(gen1.publicKeyB64u, gen2.publicKeyB64u);
});

test("each destination gets its own key — a signature for one cannot authenticate at another", async () => {
  const prod = await derivePublishSigningKey(keyInput({ targetOrigin: "https://tovu.com" }));
  const staging = await derivePublishSigningKey(keyInput({ targetOrigin: "https://staging.tovu.com" }));
  assert.notEqual(prod.publicKeyB64u, staging.publicKeyB64u);

  // The property that matters, stated directly: prod's signature does NOT verify against staging's
  // key, so a compromised staging cannot relay a captured challenge response to production.
  const message = "challenge:abc";
  assert.equal(
    verifyPublishSignature({ publicKeyB64u: staging.publicKeyB64u, message, signatureB64u: prod.sign(message) }),
    false
  );
});

test("regenerating the Site Token changes the publishing key — rotation for free", async () => {
  const underSiteTokenA = await derivePublishSigningKey(keyInput({ keyring: testKeyring(ROOT_A) }));
  const underSiteTokenB = await derivePublishSigningKey(keyInput({ keyring: testKeyring(ROOT_B) }));
  assert.notEqual(underSiteTokenA.publicKeyB64u, underSiteTokenB.publicKeyB64u);
});

test("a genuine signature verifies", async () => {
  const key = await derivePublishSigningKey(keyInput());
  const message = "challenge:nonce-1|aud:target-install|src:src-install";
  assert.equal(
    verifyPublishSignature({ publicKeyB64u: key.publicKeyB64u, message, signatureB64u: key.sign(message) }),
    true
  );
});

test("a signature from the WRONG key is refused", async () => {
  const real = await derivePublishSigningKey(keyInput());
  const attacker = await derivePublishSigningKey(keyInput({ sourceInstallationId: "attacker-install" }));
  const message = "challenge:nonce-1";

  assert.equal(
    verifyPublishSignature({ publicKeyB64u: real.publicKeyB64u, message, signatureB64u: attacker.sign(message) }),
    false
  );
});

test("a tampered message is refused — the signature does not cover a rewritten challenge", async () => {
  const key = await derivePublishSigningKey(keyInput());
  const signed = key.sign("challenge:nonce-1|aud:target-install");

  assert.equal(
    verifyPublishSignature({
      publicKeyB64u: key.publicKeyB64u,
      message: "challenge:nonce-1|aud:SOMEONE-ELSE",
      signatureB64u: signed,
    }),
    false
  );
});

test("malformed key material is refused, not thrown on — no 500-vs-401 oracle", async () => {
  const key = await derivePublishSigningKey(keyInput());
  const message = "challenge:nonce-1";
  const good = key.sign(message);

  for (const badKey of ["", "!!!not-base64!!!", "c2hvcnQ", key.publicKeyB64u.slice(0, 10)]) {
    assert.equal(verifyPublishSignature({ publicKeyB64u: badKey, message, signatureB64u: good }), false);
  }
  for (const badSig of ["", "!!!", good.slice(0, 20), `${good}AA`]) {
    assert.equal(verifyPublishSignature({ publicKeyB64u: key.publicKeyB64u, message, signatureB64u: badSig }), false);
  }
});

test("the installation id is stable across key rotation, and distinct per install", async () => {
  const a1 = await deriveInstallationId({ keyring: testKeyring(ROOT_A), workspaceId: WORKSPACE });
  const a2 = await deriveInstallationId({ keyring: testKeyring(ROOT_A), workspaceId: WORKSPACE });
  const b = await deriveInstallationId({ keyring: testKeyring(ROOT_B), workspaceId: WORKSPACE });
  const otherWorkspace = await deriveInstallationId({ keyring: testKeyring(ROOT_A), workspaceId: "ws-2" });

  assert.equal(a1, a2, "the same install must keep one identity — baselines are keyed on it");
  assert.notEqual(a1, b);
  assert.notEqual(a1, otherWorkspace);
});

test("the installation id is domain-separated from the signing key derivation", async () => {
  // Both derive from the same root key over the same workspace. If `purpose` were decorative in an
  // implementation, these could collide and the published installation id would leak key material.
  const installationId = await deriveInstallationId({ keyring: testKeyring(ROOT_A), workspaceId: WORKSPACE });
  const key = await derivePublishSigningKey(keyInput());
  assert.notEqual(installationId, key.publicKeyB64u);
  assert.ok(!key.publicKeyB64u.startsWith(installationId));
});

test("the publishing principal id is stable and self-describing", () => {
  assert.equal(publishPrincipalIdFor("src-install"), "pub:src-install");
});

test("a derived key exposes no way to serialize its private half", async () => {
  const key = await derivePublishSigningKey(keyInput());
  // Structural proof of the "never serialize" rule: the only own enumerable data is the PUBLIC key
  // and the generation. `sign` is a closure, so JSON.stringify drops it entirely.
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(key))).sort(), ["generation", "publicKeyB64u"]);
});
