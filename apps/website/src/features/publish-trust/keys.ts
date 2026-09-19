import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";

import type { KeyringPort } from "#src/features/webhooks/index";

/**
 * @file Zero-setup publishing auth — key material.
 * Design note: `ADS-memory/reports/2026-09-19-publish-zero-setup-auth-design.md`.
 *
 * THE ONE IDEA IN THIS FILE: a publishing credential is **derived, never issued**. There is no key
 * to mint on the destination, no key to copy back, no key column to add, and no key at rest for an
 * attacker to steal from `content.db` or a backup. Everything below is HKDF over the install's
 * existing root key (`KeyringPort.derive`, `features/webhooks/ports.ts`), which already holds the
 * "root key lives OUTSIDE content.db" invariant this codebase depends on everywhere else.
 *
 * Two derivations, deliberately domain-separated by `purpose` (the port contract requires
 * implementations to bind `purpose` into the derivation, so these cannot collide):
 *
 * - {@link deriveInstallationId} — this install's STABLE identity. Survives credential rotation,
 *   because rotation bumps a generation counter and never touches this. It is what
 *   `publish_content_baselines.peerPrincipalId` ends up holding, so a rotation does not make every
 *   baseline row look like a first publish (Codex §4 failure mode 1 / §6 risk 6).
 * - {@link derivePublishSigningKey} — the Ed25519 keypair for one (source, target, generation)
 *   triple. Separate targets get separate keys by construction: `targetOrigin` is in the info
 *   string, so one destination can never present a signature that authenticates at another.
 *
 * WHAT MAY LEAVE THE MACHINE: `publicKeyB64u` and a signature. Nothing else in this module is
 * serializable — {@link PublishSigningKey} carries a closure, not bytes, so there is no field for a
 * caller to accidentally log, return in a response body, or write to a report.
 */

/** HKDF `purpose` for {@link deriveInstallationId}. Changing this re-identifies the install. */
const INSTALLATION_ID_PURPOSE = "publish-trust-installation-id";

/** HKDF `purpose` for {@link derivePublishSigningKey}. */
const SIGNING_KEY_PURPOSE = "publish-trust-signing-key";

/** Bytes of the installation-id digest that become the printed id. 16 bytes = 128 bits, which is
 *  far past collision risk for a value whose whole job is to be distinct, while keeping the id
 *  short enough to read in a log line. */
const INSTALLATION_ID_BYTES = 16;

/** DER prefix for a PKCS#8-wrapped Ed25519 private key (RFC 8410 §7). The 32-byte seed follows. */
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/** DER prefix for an SPKI-wrapped Ed25519 public key (RFC 8410 §4). The 32-byte point follows. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Raw Ed25519 key length, both halves. */
const ED25519_RAW_KEY_BYTES = 32;

/** Raw Ed25519 signature length. */
const ED25519_SIGNATURE_BYTES = 64;

/** Prefix every stable publishing principal id carries, so a reader of an audit row can tell at a
 *  glance that the actor was a publishing installation and not a human or an API key. */
export const PUBLISH_PRINCIPAL_ID_PREFIX = "pub:";

/** @complexity O(n) in the byte length. */
function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Decodes base64url back to bytes, returning `null` rather than throwing on anything malformed.
 *
 * `Buffer.from(x, "base64url")` is famously lenient — it ignores characters it cannot decode
 * instead of failing — so a length check on the RESULT is the only reliable rejection. Callers
 * verifying attacker-supplied material depend on that, which is why this returns `null` and takes
 * an expected length rather than trusting the decoder.
 *
 * @complexity O(n) in the input length.
 */
function fromBase64Url(value: string, expectedBytes: number): Buffer | null {
  if (typeof value !== "string" || value === "") return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === expectedBytes ? decoded : null;
}

/**
 * This install's stable publishing identity.
 *
 * Derived, not stored, for three reasons: no migration, no value for an operator to mistype, and
 * nothing that can drift between two copies of the same install. It changes only if the root key or
 * the workspace changes — both of which ARE a different install, which is the behavior the
 * destination's "was this site restored from a backup?" check wants.
 *
 * @returns An opaque lowercase base64url id. Not secret: it is published inside the grant.
 * @complexity O(1) — one HKDF.
 */
export async function deriveInstallationId(input: {
  keyring: KeyringPort;
  workspaceId: string;
}): Promise<string> {
  const material = await input.keyring.derive({
    workspaceId: input.workspaceId as never,
    purpose: INSTALLATION_ID_PURPOSE,
    info: "self",
  });
  return toBase64Url(material.slice(0, INSTALLATION_ID_BYTES));
}

/** The stable principal id a publishing session authenticates as on the destination.
 *  @complexity O(1). */
export function publishPrincipalIdFor(sourceInstallationId: string): string {
  return `${PUBLISH_PRINCIPAL_ID_PREFIX}${sourceInstallationId}`;
}

/** A derived Ed25519 keypair. NEVER serialize: `sign` closes over the private key, and there is no
 *  field on this type that exposes it. */
export interface PublishSigningKey {
  /** The only half that leaves the machine. Raw 32-byte Ed25519 point, base64url. */
  readonly publicKeyB64u: string;
  /** Which rotation generation produced this key — audit metadata, never identity. */
  readonly generation: number;
  /** Detached Ed25519 signature over `message` (UTF-8), base64url. */
  sign(message: string): string;
}

/**
 * Derives the publishing keypair for one `(source install, destination origin, generation)` triple.
 *
 * `targetOrigin` is inside the HKDF info string on purpose: it makes a signature produced for one
 * destination cryptographically unusable at another, so a hostile or compromised destination cannot
 * relay a captured challenge response onward (Codex §4 failure mode 3: never share one publishing
 * secret across preview, staging and production).
 *
 * @param generation - Rotation counter. Bumping it produces a completely different keypair; the
 *   previous public key stays in the destination's grant for the overlap window.
 * @complexity O(1) — one HKDF plus one Ed25519 key construction.
 */
export async function derivePublishSigningKey(input: {
  keyring: KeyringPort;
  workspaceId: string;
  sourceInstallationId: string;
  targetOrigin: string;
  generation: number;
}): Promise<PublishSigningKey> {
  const seed = await input.keyring.derive({
    workspaceId: input.workspaceId as never,
    purpose: SIGNING_KEY_PURPOSE,
    info: `${input.sourceInstallationId}:${input.targetOrigin}:v${input.generation}`,
  });

  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed.slice(0, ED25519_RAW_KEY_BYTES))]),
    format: "der",
    type: "pkcs8",
  });
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const rawPublicKey = spki.subarray(spki.length - ED25519_RAW_KEY_BYTES);

  return {
    publicKeyB64u: toBase64Url(rawPublicKey),
    generation: input.generation,
    sign(message: string): string {
      return toBase64Url(cryptoSign(null, Buffer.from(message, "utf8"), privateKey));
    },
  };
}

/**
 * Verifies a detached Ed25519 signature against a raw public key.
 *
 * Fail-closed in every direction a caller cannot control: a malformed key, a malformed signature,
 * the wrong length, or a `node:crypto` throw all return `false`. A verifier that threw on garbage
 * would hand an attacker a 500-vs-401 oracle; this one cannot.
 *
 * @complexity O(n) in the message length plus one Ed25519 verification.
 */
export function verifyPublishSignature(input: {
  publicKeyB64u: string;
  message: string;
  signatureB64u: string;
}): boolean {
  const rawPublicKey = fromBase64Url(input.publicKeyB64u, ED25519_RAW_KEY_BYTES);
  const signature = fromBase64Url(input.signatureB64u, ED25519_SIGNATURE_BYTES);
  if (!rawPublicKey || !signature) return false;

  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(null, Buffer.from(input.message, "utf8"), publicKey, signature);
  } catch {
    return false;
  }
}
