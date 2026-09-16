import { createHash, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { KeyringPort } from "./ports.js";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";

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
 *   generated key file. In LOCAL mode that file stays at `~/.tovu/` (outside the portable
 *   `sites/<name>/` folder, so copying/moving one site's own directory never carries the root key
 *   with it — ADR-012 install-dir portability). In PRODUCTION (2026-09-09 durability fix) it moves
 *   to `<cwd>/sites/.tovu/integrations-root-key.hex` — still a SIBLING of every `sites/<name>/`
 *   folder, never inside one, so ADR-012 portability for an individual site is unaffected — but on
 *   the durable Fly volume (`fly.toml`'s `[[mounts]]` destination) rather than the container's own
 *   ephemeral rootfs, which `homedir()` resolves to in production and which does not survive a
 *   redeploy (the ORIGINAL bug this whole file's production story used to have, `ddfa5e07`). See
 *   {@link defaultRootKeyFilePath}'s own doc for the exact split.
 * - `allowFileFallback: false` is a real operational knob (not test-only bypass code): some
 *   deployments may require the env var explicitly rather than ever reading/generating a file.
 * - `allowFileAutoGenerate` (2026-09-09) decouples "may this instance READ an already-generated
 *   file" from "may this instance MINT one itself, unattended, the first time nothing else is
 *   configured." ADR-058's `siteAssistantSecretKeyring` instance wants the first without the
 *   second — see that instance's own construction comment in `composition/deps.ts` for why, and
 *   this option's own doc below for the exact mechanics.
 *
 * Architectural role:
 * Production `KeyringPort` adapter. `EnvOrFileKeyring` itself has zero knowledge of webhooks —
 * `deriveSigningSecret` is the one webhook-specific method the port still carries (see
 * `ports.ts`); `derive` is the generic seam other consumers (Analytics, Newsletter) use.
 */

const HKDF_EXTRACTION_SALT = Buffer.from("tovu-integrations-root-key-hkdf-v1", "utf8");
const DERIVED_SECRET_LENGTH_BYTES = 32;
const ROOT_KEY_LENGTH_BYTES = 32;

/** Default env var name — exported so a caller that never constructs an `EnvOrFileKeyring` (the
 *  admin "Site Token" status/generate functions below) can name the SAME var without duplicating
 *  the literal. */
export const DEFAULT_ROOT_KEY_ENV_VAR_NAME = "TOVU_INTEGRATIONS_ROOT_KEY";

/**
 * Default key file path — same "one place this is computed" reasoning as
 * {@link DEFAULT_ROOT_KEY_ENV_VAR_NAME}; also used by the constructor default below.
 *
 * Mode-aware since the 2026-09-09 durability fix:
 * - LOCAL (`resolveRuntimeMode() !== "production"`): unchanged, `~/.tovu/integrations-root-key.hex`
 *   — no behavior change for any existing local/dev install that may already have a key there.
 * - PRODUCTION: `<cwd>/sites/.tovu/integrations-root-key.hex`. `cwd` is `/workspace/Tovu` inside
 *   the shipped container (`Dockerfile`'s `WORKDIR`), so this resolves to `/workspace/Tovu/sites/
 *   .tovu/integrations-root-key.hex` — under `fly.toml`'s `[[mounts]] destination =
 *   "/workspace/Tovu/sites"`, i.e. the persistent volume, not the rootfs `homedir()` used to
 *   resolve to. `.tovu` is a SIBLING of every `sites/<name>/` folder (never inside one — `.` is
 *   outside `SITE_NAME_PATTERN`'s charset, so no real site can ever collide with this name), which
 *   is what keeps ADR-012's "an individual site's own folder stays portable" property intact:
 *   copying/exporting ONE site's directory still never carries this file with it, only copying the
 *   whole `sites/` tree (the whole install moving, not one site being extracted) would.
 */
export function defaultRootKeyFilePath(): string {
  if (resolveRuntimeMode() === "production") {
    return join(process.cwd(), "sites", ".tovu", "integrations-root-key.hex");
  }
  return join(homedir(), ".tovu", "integrations-root-key.hex");
}

export interface EnvOrFileKeyringOptions {
  /** Env var carrying a hex-encoded root key. Defaults to `TOVU_INTEGRATIONS_ROOT_KEY`. */
  envVarName?: string;
  /** Path to the generated key file. Defaults to {@link defaultRootKeyFilePath}. */
  keyFilePath?: string;
  /** Stamped into every `RootKeyHandle` this instance returns. Defaults to `"v1"` (no rotation yet). */
  keyId?: string;
  /**
   * When `false`, resolution never even looks at a key file — a missing env var throws
   * immediately. Defaults to `true`. A real deployment knob, not test-only scaffolding.
   */
  allowFileFallback?: boolean;
  /**
   * When `allowFileFallback` is `true` and no file exists yet, controls whether THIS instance may
   * silently mint one itself on first use. Defaults to whatever `allowFileFallback` resolved to —
   * i.e. leaving this unset behaves exactly as it always has (read-or-generate as one unit).
   *
   * Pass `false` explicitly to get "may READ an already-generated file, may NEVER generate one
   * itself" — the shape `siteAssistantSecretKeyring` (`composition/deps.ts`) now uses. ADR-058's
   * actual objection to a file-backed key for that instance was never "a file exists" per se, it
   * was an UNATTENDED first-use mint of one under a feature encrypting a real, paid, third-party
   * credential (that ADR's own §2 wording: "a missing root key throws immediately rather than
   * silently minting..."). Splitting read from auto-generate lets an operator create the file
   * through one explicit, attended action (the admin "Site Token" panel's Generate button,
   * `generateFileRootKey` below — a plain function, independent of any instance's own
   * `allowFileAutoGenerate` setting) while this instance still never mints one on its own.
   */
  allowFileAutoGenerate?: boolean;
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
  private readonly allowFileAutoGenerate: boolean;
  private cachedRootKey: Buffer | undefined;

  constructor(options: EnvOrFileKeyringOptions = {}) {
    this.envVarName = options.envVarName ?? DEFAULT_ROOT_KEY_ENV_VAR_NAME;
    this.keyFilePath = options.keyFilePath ?? defaultRootKeyFilePath();
    this.keyId = options.keyId ?? "v1";
    this.allowFileFallback = options.allowFileFallback ?? true;
    this.allowFileAutoGenerate = options.allowFileAutoGenerate ?? this.allowFileFallback;
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

    if (!this.allowFileAutoGenerate) {
      throw new Error(
        `no root key: ${this.envVarName} is not set, no key file exists at ${this.keyFilePath}, and this instance does not auto-generate one — set the env var, or generate a key file explicitly (the admin Secrets page's Site Token tab, or generateFileRootKey())`
      );
    }

    const generated = randomBytes(ROOT_KEY_LENGTH_BYTES);
    mkdirSync(dirname(this.keyFilePath), { recursive: true });
    writeFileSync(this.keyFilePath, generated.toString("hex"), { mode: 0o600 });
    this.cachedRootKey = generated;
    return this.cachedRootKey;
  }
}

const HEX_KEY_PATTERN = /^[0-9a-f]+$/i;

function isValidHexKey(value: string): boolean {
  return value.length > 0 && HEX_KEY_PATTERN.test(value) && value.length % 2 === 0;
}

/**
 * A short, one-way fingerprint of root-key material — safe to display in an admin UI, never
 * reversible to the key itself (`sha256`, truncated). Deliberately NOT `deriveSigningSecret`'s
 * HKDF (different salt, different purpose, different output length) — this must never be
 * confused with a real derived secret, it exists purely for a human to recognize "same key as
 * before" across a page reload.
 */
function fingerprintRootKeyHex(hex: string): string {
  return createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex").slice(0, 12);
}

/** {@link inspectRootKeyMaterial}'s result — never carries the key value itself. */
export interface RootKeyStatus {
  readonly active: boolean;
  /** `"none"` when neither the env var nor the key file resolves to usable material. */
  readonly source: "env" | "file" | "none";
  /** Present iff `active` — see {@link fingerprintRootKeyHex}. */
  readonly fingerprint?: string;
  /** `true` when a source was found (env var set, or file present) but its content is not valid
   *  hex — `active` is `false` in this case too; surfaced separately so a caller can tell "nothing
   *  is configured" apart from "something is configured but broken". */
  readonly invalid?: boolean;
  /** The path a generated file lives (or would live) at — not secret, just a filesystem
   *  convention, always present so a `"none"` status can still tell an operator where Generate
   *  would write. */
  readonly keyFilePath: string;
}

export interface InspectRootKeyMaterialOptions {
  envVarName?: string;
  keyFilePath?: string;
}

/** One raw read of whichever source is active — the shared core both {@link inspectRootKeyMaterial}
 *  and {@link revealRootKeyMaterial} build on, so the env-first/file-second precedence and the hex
 *  validity check exist in exactly one place. Holds no state, performs no caching (this file's own
 *  header on why that's deliberate). @complexity O(1) plus one file read when the file path applies. */
function readActiveRootKeyMaterial(envVarName: string, keyFilePath: string): { source: "env" | "file" | "none"; hex?: string; invalid?: boolean } {
  const fromEnv = process.env[envVarName];
  if (fromEnv) {
    const trimmed = fromEnv.trim();
    return isValidHexKey(trimmed) ? { source: "env", hex: trimmed } : { source: "env", invalid: true };
  }
  if (existsSync(keyFilePath)) {
    const trimmed = readFileSync(keyFilePath, "utf8").trim();
    return isValidHexKey(trimmed) ? { source: "file", hex: trimmed } : { source: "file", invalid: true };
  }
  return { source: "none" };
}

/**
 * Read-only snapshot of the root key material `EnvOrFileKeyring`'s DEFAULT options would resolve
 * — backs the admin "Site Token" panel's status display.
 *
 * Deliberately NOT a method on `EnvOrFileKeyring`: that class caches its resolved key for its own
 * process lifetime (`resolveRootKey`'s `cachedRootKey`), correct for a long-lived signer/sealer
 * but wrong for a status read, which must reflect the CURRENT env/file state on every call. This
 * function holds no state and performs no caching — env var first (matching `resolveRootKey`'s own
 * precedence), else the key file, else `"none"`. Never touches `allowFileFallback`: this is a
 * report of what exists, not a resolution that could throw.
 */
export function inspectRootKeyMaterial(options: InspectRootKeyMaterialOptions = {}): RootKeyStatus {
  const envVarName = options.envVarName ?? DEFAULT_ROOT_KEY_ENV_VAR_NAME;
  const keyFilePath = options.keyFilePath ?? defaultRootKeyFilePath();
  const raw = readActiveRootKeyMaterial(envVarName, keyFilePath);

  if (raw.hex) return { active: true, source: raw.source, fingerprint: fingerprintRootKeyHex(raw.hex), keyFilePath };
  return { active: false, source: raw.source, ...(raw.invalid ? { invalid: true } : {}), keyFilePath };
}

/** {@link revealRootKeyMaterial}'s result. `hex` is present iff `active` — the ONLY other place in
 *  this module's admin-facing surface (besides {@link GeneratedFileRootKey}) that ever carries root
 *  key material in the clear. A caller MUST treat every call as a fresh, sensitive disclosure, not
 *  something to cache or log. */
export interface RootKeyReveal extends RootKeyStatus {
  readonly hex?: string;
}

/**
 * Like {@link inspectRootKeyMaterial}, but includes the raw key value when one is active — backs
 * the admin "Site Token" panel's explicit, permission-gated Reveal action (owner: "i want that
 * token to be visible to admins or else when it breaks they have no idea whats going on" —
 * fingerprint-only was the ORIGINAL brief; this supersedes it). Never called on page load, only
 * from a dedicated route the operator must click through — see `server/inbound/admin-http/routes/
 * system/site-token.ts`'s `POST .../reveal`.
 *
 * Reads whichever source is currently active (env or file, same precedence as `resolveRootKey`),
 * so an admin can confirm the value in this UI matches what they set in `fly secrets`/their shell,
 * not only the file-backed case.
 */
export function revealRootKeyMaterial(options: InspectRootKeyMaterialOptions = {}): RootKeyReveal {
  const envVarName = options.envVarName ?? DEFAULT_ROOT_KEY_ENV_VAR_NAME;
  const keyFilePath = options.keyFilePath ?? defaultRootKeyFilePath();
  const raw = readActiveRootKeyMaterial(envVarName, keyFilePath);

  if (raw.hex) return { active: true, source: raw.source, hex: raw.hex, fingerprint: fingerprintRootKeyHex(raw.hex), keyFilePath };
  return { active: false, source: raw.source, ...(raw.invalid ? { invalid: true } : {}), keyFilePath };
}

/** Thrown by {@link generateFileRootKey} when a key file already exists at the target path. */
export class RootKeyFileAlreadyExistsError extends Error {
  constructor(keyFilePath: string) {
    super(`a root key file already exists at ${keyFilePath} — generate never overwrites an existing key`);
    this.name = "RootKeyFileAlreadyExistsError";
  }
}

/** {@link generateFileRootKey}'s result. `hex` is the raw key this call just wrote to disk, in
 *  the clear — but `server/inbound/admin-http/routes/system/site-token.ts`'s `POST .../generate`
 *  deliberately does NOT forward it in the HTTP response (sol finding 3-2, 2026-09-16): the admin
 *  controller never read it, so echoing it over the wire was pure exposure with no product
 *  behavior. `POST .../reveal` is the one route that discloses the value on purpose. Callers of
 *  this function itself must still never persist or log `hex` beyond what they need it for. */
export interface GeneratedFileRootKey {
  readonly hex: string;
  readonly fingerprint: string;
  readonly keyFilePath: string;
}

/**
 * Generates a fresh root key and writes it to `keyFilePath` (default: the exact same
 * `~/.tovu/integrations-root-key.hex` `EnvOrFileKeyring` reads by default) — backs the admin
 * "Site Token" panel's Generate action.
 *
 * Uses the same `randomBytes(ROOT_KEY_LENGTH_BYTES)` call and `0o600` file mode
 * `resolveRootKey`'s own generated-file fallback above uses — not a second, independently-reasoned
 * source of randomness.
 *
 * Refuses (throws {@link RootKeyFileAlreadyExistsError}) if a file already exists at that path —
 * this function only ever CREATES, it never overwrites. Silently replacing an existing key here
 * would orphan every credential already sealed under the old one with no confirmation at all;
 * a deliberate rotate/replace flow is out of scope for this function (and, as of this writing, not
 * built anywhere in this admin).
 */
export function generateFileRootKey(options: { keyFilePath?: string } = {}): GeneratedFileRootKey {
  const keyFilePath = options.keyFilePath ?? defaultRootKeyFilePath();
  if (existsSync(keyFilePath)) {
    throw new RootKeyFileAlreadyExistsError(keyFilePath);
  }
  const generated = randomBytes(ROOT_KEY_LENGTH_BYTES);
  mkdirSync(dirname(keyFilePath), { recursive: true });
  writeFileSync(keyFilePath, generated.toString("hex"), { mode: 0o600 });
  const hex = generated.toString("hex");
  return { hex, fingerprint: fingerprintRootKeyHex(hex), keyFilePath };
}
