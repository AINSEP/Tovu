import { hkdfSync, randomBytes } from "node:crypto";

import type { KeyringPort } from "./ports";

/**
 * @file An in-memory `KeyringPort` test/dev double (ADR-PIPE-015 Phase 1 T017).
 *
 * Purpose:
 * Backs the hermetic `RouteDeps` composition (`server/app.ts`'s `createRouteDeps()`, used by
 * every route test) with the REAL `createKeyringBackedSigner`/HKDF derivation code path, without
 * touching the filesystem or an env var the way `EnvOrFileKeyring` does. A random root key is
 * generated once per process and held only in memory.
 */
const HKDF_EXTRACTION_SALT = Buffer.from("tovu-integrations-root-key-hkdf-v1", "utf8");
const DERIVED_SECRET_LENGTH_BYTES = 32;

export class InMemoryKeyring implements KeyringPort {
  private readonly rootKey = randomBytes(32);
  private readonly keyId: string;

  constructor(keyId = "v1") {
    this.keyId = keyId;
  }

  async activeKey(): Promise<{ readonly keyId: string }> {
    return { keyId: this.keyId };
  }

  async deriveSigningSecret(input: {
    workspaceId: string;
    subscriptionId: string;
    version: number;
  }): Promise<Uint8Array> {
    const info = `${input.workspaceId}:${input.subscriptionId}:v${input.version}`;
    return new Uint8Array(
      hkdfSync("sha256", this.rootKey, HKDF_EXTRACTION_SALT, info, DERIVED_SECRET_LENGTH_BYTES)
    );
  }

  async derive(input: { workspaceId: string; purpose: string; info: string }): Promise<Uint8Array> {
    const effectiveInfo = `${input.purpose}:${input.workspaceId}:${input.info}`;
    return new Uint8Array(
      hkdfSync("sha256", this.rootKey, HKDF_EXTRACTION_SALT, effectiveInfo, DERIVED_SECRET_LENGTH_BYTES)
    );
  }
}
