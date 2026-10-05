import { randomBytes } from "node:crypto";
import { FixedRootKeyKeyring as FixedSiteKeyKeyring } from "@jini-ai/platform/secrets"; // site-key-legacy: until @jini-ai/platform release with SiteKey exports; remove on/after 2026-11-01
import { HKDF_EXTRACTION_SALT } from "./keyring.env.js";
import type { KeyringPort } from "./ports.js";

/** Ephemeral host keyring with the same Tovu salt and Jini derivation as persisted keys.
 *
 * Contract rationale for the Jini implementation and this host boundary:
 *
 * @file An in-memory `KeyringPort` test/dev double (ADR-PIPE-015 Phase 1 T017).
 *
 * Purpose:
 * Backs the hermetic `RouteDeps` composition (`server/app.ts`'s `createRouteDeps()`, used by
 * every route test) with the REAL `createKeyringBackedSigner`/HKDF derivation code path, without
 * touching the filesystem or an env var the way `EnvOrFileKeyring` does. A random site key is
 * generated once per instance and held only in memory.
 *
 * Hermetic route composition exercises the real signer/HKDF path without reading an env var
 * or the filesystem. This instance retains one random site key only in memory. */
// Shared derivation: Jini/packages/platform/src/secrets/keyring.env.ts (FixedSiteKeyKeyring).
export class InMemoryKeyring implements KeyringPort {
  private readonly keyring: FixedSiteKeyKeyring;

  constructor(keyId = "v1") {
    this.keyring = new FixedSiteKeyKeyring({
      hex: randomBytes(32).toString("hex"), hkdfSalt: HKDF_EXTRACTION_SALT, // site-key-frozen: never change (every sealed row depends on these bytes)
    }, { keyId });
  }

  activeKey(): Promise<{ readonly keyId: string }> { return this.keyring.activeKey({}); }
  deriveSigningSecret(input: { workspaceId: string; subscriptionId: string; version: number }): Promise<Uint8Array> {
    return this.keyring.deriveSigningSecret(input);
  }
  derive(input: { workspaceId: string; purpose: string; info: string }): Promise<Uint8Array> {
    return this.keyring.derive(input);
  }
}
