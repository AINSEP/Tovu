import assert from "node:assert/strict";
import test from "node:test";

/**
 * @file Closes the mutation-sweep gap on `keys.ts:177`'s
 * `if (!rawPublicKey || !signature) return false;` — the fail-closed guard after decoding
 * signature-verification inputs (`ADS-memory/reports/2026-09-20-mutation-sweep-changed-files.md`
 * §6b, highest-priority survivor in that batch).
 *
 * `keys.test.ts`'s "malformed key material is refused, not thrown on" test already asserts
 * `verifyPublishSignature` returns `false` for a bad key or a bad signature — but that assertion
 * cannot kill the mutation-sweep tool's `guard-never-fires` mutant on this exact line. Read in
 * full: `fromBase64Url` (line 73) only ever returns `null` for input that is genuinely malformed —
 * wrong length or undecodable — so `rawPublicKey`/`signature` here are always either a
 * correctly-sized `Buffer` or `null`, never anything in between. Passing `null` into
 * `Buffer.concat([..., null])` (line 181, inside `createPublicKey`'s argument) or into `verify(...,
 * signature)` (line 185) THROWS — confirmed directly (`Buffer.concat([x, null])` raises
 * `TypeError: Cannot read properties of null (reading 'length')`) — and the surrounding `try { ...
 * } catch { return false; }` (lines 179-188) swallows that throw into the exact same `false` this
 * guard returns. Deleting line 177 outright is therefore invisible to any test that only checks the
 * return value: the outer catch is a silent second fail-safe for precisely this condition. That is
 * exactly why the mutation-sweep tool flagged it — a future change that also loosened the catch (or
 * made the downstream call tolerate `null` without throwing, e.g. a `node:crypto` upgrade) would
 * silently turn this into a signature-bypass, and no existing test would notice.
 *
 * To make the guard itself provably load-bearing — not merely "shadowed by an accident of how
 * `node:crypto` happens to throw today" — this proves the STRONGER property the guard's own doc
 * comment claims ("Fail-closed... return false" — before, not via, a downstream throw): malformed
 * input never even REACHES the effect containing `createPublicKey`/`verify`. The original test used
 * this repo's `mock.module()` technique for a check shadowed by a later, coincidentally equivalent
 * path — see `members/__tests__/disable.unit.test.ts` and
 * `theme/__tests__/write-file-atomically-eloop.unit.test.ts`'s file headers. The injected effect now
 * witnesses that boundary directly, without requiring experimental module replacement.
 *
 * The old module mock required registration before dynamically importing `keys.js`: it could not
 * retroactively change an already-resolved binding. Injection removes that import-order dependency.
 */

/** A minimal, deterministic `KeyringPort` double — same shape `keys.test.ts`'s own `testKeyring`
 *  uses, simplified to a fixed 32-byte seed since this test only needs ONE valid keypair to
 *  generate a genuine signature to mutate away from. */
function fixedKeyring() {
  return { derive: async () => new Uint8Array(32).fill(7) } as unknown as import("#src/features/webhooks/index").KeyringPort;
}

test("verifyPublishSignature: a malformed public key never reaches createPublicKey/verify — the line-177 guard fires before any crypto call, not merely via the outer catch's coincidental throw", async () => {
  let cryptoEffectCalls = 0;
  const cryptoEffect = {
    verifyDecoded: () => {
      cryptoEffectCalls += 1;
      // Deliberately tolerates anything: only the input guard can prevent acceptance in this arm.
      return true;
    },
  };

  const { verifyPublishSignature, derivePublishSigningKey } = await import("../keys.js");

  const key = await derivePublishSigningKey({
    keyring: fixedKeyring(),
    workspaceId: "ws-1",
    sourceInstallationId: "src-install",
    targetOrigin: "https://tovu.com",
    generation: 1,
  });
  const message = "message-to-verify";
  const goodSignature = key.sign(message);

  assert.equal(verifyPublishSignature({ publicKeyB64u: key.publicKeyB64u, message, signatureB64u: goodSignature }), true);
  assert.equal(verifyPublishSignature({ publicKeyB64u: key.publicKeyB64u, message, signatureB64u: goodSignature }, cryptoEffect), true);
  assert.equal(cryptoEffectCalls, 1, "valid input must reach the injected crypto effect");

  // `derivePublishSigningKey` above legitimately calls `createPublicKey` itself (to compute its own
  // public half from the derived private key) — reset the witness here so what follows measures
  // ONLY the calls `verifyPublishSignature` itself makes.
  cryptoEffectCalls = 0;

  // Left side of the `||`: the public key half is malformed/absent. Paired with a GENUINE
  // signature, so this cannot be mistaken for the right side of the `||` also firing.
  for (const badKey of ["", "not-base64url-!!!", key.publicKeyB64u.slice(0, 10)]) {
    const result = verifyPublishSignature({ publicKeyB64u: badKey, message, signatureB64u: goodSignature }, cryptoEffect);
    assert.equal(result, false, `malformed public key ${JSON.stringify(badKey)} must be refused`);
  }
  assert.equal(
    cryptoEffectCalls,
    0,
    "a malformed public key must never reach createPublicKey — that is the guard's own job, not an accident of node:crypto throwing on null"
  );

  // Right side of the `||`: the signature half is malformed/absent, paired with the GENUINE key.
  for (const badSig of ["", "not-base64url-!!!", goodSignature.slice(0, 10)]) {
    const result = verifyPublishSignature({ publicKeyB64u: key.publicKeyB64u, message, signatureB64u: badSig }, cryptoEffect);
    assert.equal(result, false, `malformed signature ${JSON.stringify(badSig)} must be refused`);
  }
  assert.equal(
    cryptoEffectCalls,
    0,
    "a malformed signature must never reach createPublicKey either — the guard checks BOTH halves before any crypto call runs"
  );
  assert.equal(cryptoEffectCalls, 0, "a malformed signature must never reach verify() — the guard must fire before, not rely on a downstream throw");
});
