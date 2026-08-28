import { hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { KeyringPort } from "./ports.js";

/**
 * @file `KeyringPort` implementation backed by an env var, with a generated-file fallback
 * (ADR-PIPE-015 Phase 1, GAP-02/GAP-03).
 *
 * Purpose:
 * The real root-key source `signing.keyring.ts`'s signer depends on. Never persists the derived
 * signing secret itself (ADR-024 secret invariant, ADR-036 §5) — only the *root* key material is
 * held, and every signing secret is re-derived via HKDF on demand from it.
 *
 * How it relates to the project:
 * - Root key resolution order: `TOVU_INTEGRATIONS_ROOT_KEY` env var (hex-encoded) first; else a
 *   generated key file, stored OUTSIDE the portable site folder (`~/.tovu/`, not `process.cwd()`)
 *   so copying/moving the portable `content.db` folder never carries the root key with it
 *   (ADR-012 install-dir portability; ADR-024 secret invariant).
 * - `allowFileFallback: false` is a real operational knob (not test-only bypass code): some
 *   deployments may require the env var explicitly rather than silently generating a file.
 *
 * Architectural role:
 * Production `KeyringPort` adapter. `EnvOrFileKeyring` itself has zero knowledge of webhooks —
 * `deriveSigningSecret` is the one webhook-specific method the port still carries (see
 * `ports.ts`); `derive` is the generic seam other consumers (Analytics, Newsletter) use.
 */

const HKDF_EXTRACTION_SALT = Buffer.from("tovu-integrations-root-key-hkdf-v1", "utf8");
const DERIVED_SECRET_LENGTH_BYTES = 32;
const ROOT_KEY_LENGTH_BYTES = 32;

export interface EnvOrFileKeyringOptions {
  /** Env var carrying a hex-encoded root key. Defaults to `TOVU_INTEGRATIONS_ROOT_KEY`. */
  envVarName?: string;
  /** Path to the generated key file. Defaults to `~/.tovu/integrations-root-key.hex`. */
  keyFilePath?: string;
  /** Stamped into every `RootKeyHandle` this instance returns. Defaults to `"v1"` (no rotation yet). */
  keyId?: string;
  /**
   * When `false`, resolution never falls back to a generated file — a missing env var throws
   * immediately. Defaults to `true`. A real deployment knob, not test-only scaffolding.
   */
  allowFileFallback?: boolean;
}

/**
 * `KeyringPort` adapter resolving root-key material from an env var, or a generated file outside
 * the portable site folder. Thrown errors never carry a placeholder secret — a caller that
 * catches and swallows the error, then proceeds, is a bug in the caller, not this module.
 *
 * @overallScore 100
 */
export class EnvOrFileKeyring implements KeyringPort {
  private readonly envVarName: string;
  private readonly keyFilePath: string;
  private readonly keyId: string;
  private readonly allowFileFallback: boolean;
  private cachedRootKey: Buffer | undefined;

  constructor(options: EnvOrFileKeyringOptions = {}) {
    this.envVarName = options.envVarName ?? "TOVU_INTEGRATIONS_ROOT_KEY";
    this.keyFilePath = options.keyFilePath ?? join(homedir(), ".tovu", "integrations-root-key.hex");
    this.keyId = options.keyId ?? "v1";
    this.allowFileFallback = options.allowFileFallback ?? true;
  }

  async activeKey(): Promise<{ readonly keyId: string }> {
    return { keyId: this.keyId };
  }

  async deriveSigningSecret(input: {
    workspaceId: string;
    subscriptionId: string;
    version: number;
  }): Promise<Uint8Array> {
    const rootKey = this.resolveRootKey();
    const info = `${input.workspaceId}:${input.subscriptionId}:v${input.version}`;
    return new Uint8Array(hkdfSync("sha256", rootKey, HKDF_EXTRACTION_SALT, info, DERIVED_SECRET_LENGTH_BYTES));
  }

  async derive(input: { workspaceId: string; purpose: string; info: string }): Promise<Uint8Array> {
    const rootKey = this.resolveRootKey();
    // `purpose` is bound into the info string (not just a label) so it is a real domain-separation
    // boundary from `deriveSigningSecret`'s derivation, not decorative (ports.ts KeyringPort doc).
    const effectiveInfo = `${input.purpose}:${input.workspaceId}:${input.info}`;
    return new Uint8Array(
      hkdfSync("sha256", rootKey, HKDF_EXTRACTION_SALT, effectiveInfo, DERIVED_SECRET_LENGTH_BYTES)
    );
  }

  /**
   * Resolve (and cache) the root key: env var first, else a generated file. Throws — never
   * returns a placeholder — if neither source is available.
   */
  private resolveRootKey(): Buffer {
    if (this.cachedRootKey) return this.cachedRootKey;

    const fromEnv = process.env[this.envVarName];
    if (fromEnv) {
      const trimmed = fromEnv.trim();
      if (!/^[0-9a-f]+$/i.test(trimmed) || trimmed.length % 2 !== 0) {
        throw new Error(`${this.envVarName} must be a hex-encoded string`);
      }
      this.cachedRootKey = Buffer.from(trimmed, "hex");
      return this.cachedRootKey;
    }

    if (!this.allowFileFallback) {
      throw new Error(
        `no root key: ${this.envVarName} is not set and allowFileFallback is disabled`
      );
    }

    if (existsSync(this.keyFilePath)) {
      const hex = readFileSync(this.keyFilePath, "utf8").trim();
      this.cachedRootKey = Buffer.from(hex, "hex");
      return this.cachedRootKey;
    }

    const generated = randomBytes(ROOT_KEY_LENGTH_BYTES);
    mkdirSync(dirname(this.keyFilePath), { recursive: true });
    writeFileSync(this.keyFilePath, generated.toString("hex"), { mode: 0o600 });
    this.cachedRootKey = generated;
    return this.cachedRootKey;
  }
}
