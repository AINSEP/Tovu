import {
  FixedRootKeyKeyring as JiniFixedRootKeyKeyring,
  UnusableRootKeyError as JiniUnusableRootKeyError,
  parseRootKeyHex as parseKeyHex,
  fingerprintRootKeyHex as fingerprintKeyHex,
  generateFileRootKey as generateKeyFile,
} from "@jini-ai/platform/secrets";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { KeyringPort } from "./ports.js";
import { LEGACY_SITE_KEY_ENV_VAR_NAME, SITE_KEY_ENV_VAR_NAME, resolveSiteKeyEnv, readSiteKeySourceMaterial, siteKeyFilePathFrom, type SiteKeySource } from "./site-key-sources.js";

// Validation/derivation rationale: Jini packages/platform/src/secrets/keyring.env.ts.
/**
 * @file `KeyringPort` implementation backed by an env var, with a generated-file fallback
 * (ADR-PIPE-015 Phase 1, GAP-02/GAP-03).
 *
 * Purpose:
 * The real root-key source `signing.keyring.ts`'s signer depends on. Never persists the derived
 * signing secret itself (ADR-024 secret invariant, ADR-036 §5) — only the *root* key material is
 * held, and every signing secret is re-derived via HKDF on demand from it.
 *
 * ## Site key sources and durability
 *
 * This is the one site key the Security page manages. The source-policy module owns the
 * temporary environment alias, so reader defaults can never disagree with the boot gate or UI.
 * Ordered sources are required and read-only; `ensureSiteKey` owns unattended local creation.
 * A credential reader must never silently mint a key for a paid third-party credential, and an
 * anonymous newsletter request must never choose the key the credential store adopts.
 *
 * Local per-site keys stay outside the portable `sites/<name>/` folder (ADR-012). Production
 * files live at `<cwd>/sites/.tovu/` on the durable Fly volume rather than the ephemeral rootfs
 * `homedir()` used to select (the 2026-09-09 durability bug, ddfa5e07). A sibling of each site
 * folder keeps individual site exports portable. Newsletter signing remains env-only in
 * production; credential storage may read an existing volume file. That accepted tradeoff means
 * a full volume backup can contain both encrypted credentials and the key that unlocks them.
 *
 * Architectural role:
 * Production `KeyringPort` adapter. `EnvOrFileKeyring` itself has zero knowledge of webhooks —
 * `deriveSigningSecret` is the one webhook-specific method the port still carries (see
 * `ports.ts`); `derive` is the generic seam other consumers (Analytics, Newsletter) use.
 *
 * Contract rationale for the Jini implementation and this host boundary:
 *
 * Resolve the configured sources on every derivation, so recovery takes effect without a restart. Throws — never
 * returns a placeholder — if neither source is available, or if the source that IS present does
 * not pass {@link parseRootKeyHex}.
 *
 * Both branches validate through that ONE parser, the same one {@link inspectRootKeyMaterial}
 * uses, so the Secrets screen and this sealer cannot disagree about whether a key is usable.
 * Before 2026-09-16 only the env branch validated: the file branch was a bare
 * `Buffer.from(hex, "hex")`, which turns non-hex content into a zero-length buffer that
 * `hkdfSync` accepts — every credential was then sealed under a key computable from this
 * module's public constants, while the status screen said the key was unusable.
 *
 * @throws {UnusableRootKeyError} The env var or key file is present but malformed or too short.
 *
 * The required ordered-source resolver (site-key
 * plan §A.1 slice 1). Tries each source in order; the first one whose material is PRESENT wins —
 * present-but-invalid still wins (and throws), it does not fall through to the next source, for
 * the same reason the hardcoded path never silently skips a malformed env var: silently trying
 * the next source could seal data under a DIFFERENT key than the operator thinks is active.
 *
 * Never auto-generates: minting a site key is `ensureSiteKey`'s job; all readers stay read-only.
 *
 * @throws {UnusableRootKeyError} The first present source's material fails {@link parseRootKeyHex}.
 * @throws {Error} No source in the list has any material at all.
 * @complexity O(n) in `sources.length`, each step at most one file read.
 *
 * The env source. Only a too-short value can have been accepted
 *  before 2026-09-16 (malformed hex always threw here), so only that case carries the
 *  already-sealed warning.
 *
 * The file source. Every rejection here carries the already-sealed
 *  warning: before 2026-09-16 this branch accepted ANY file content, so an install may have been
 *  sealing under it. Never rewrites, deletes or "repairs" the file — recovery is a separate,
 *  owner-level decision this module does not make.
 *
 * HKDF(rootKey, info = `${workspaceId}:${subscriptionId}:v${version}`) — shared by every keyring
 *  here so a key checked in memory derives exactly what the installed one will.
 *
 * `purpose` is bound into the info string (not just a label) so it is a real domain-separation
 *  boundary from {@link deriveSigningSecretFromRootKey} (ports.ts KeyringPort doc).
 *
 * A {@link KeyringPort} over one given root key, held only in memory — for checking a candidate
 * (a pasted site token, or the key "Start fresh" keeps) against sealed rows BEFORE it is written
 * anywhere. Derives exactly as {@link EnvOrFileKeyring} does.
 *
 * @throws {Error} `hex` is not a valid root key ({@link parseRootKeyHex}) — callers validate first.
 */

export const HKDF_EXTRACTION_SALT = "tovu-integrations-root-key-hkdf-v1"; // site-key-frozen: never change (every sealed row depends on these bytes)
const ROOT_KEY_LENGTH_BYTES = 32;

/** Read-only compatibility export; the legacy literal belongs to the source policy module. */
export const DEFAULT_ROOT_KEY_ENV_VAR_NAME = LEGACY_SITE_KEY_ENV_VAR_NAME;

export interface EnvOrFileKeyringOptions {
  keyId?: string;
  /** Readers never mint. The first present source wins; invalid material never falls through. */
  sources: readonly SiteKeySource[];
}

/** Snapshot port for isolated readers/tests; the host reads process.env on each call by default. */
export interface SiteKeyReaderDeps {
  env?: () => Record<string, string | undefined>;
}

/**
 * `KeyringPort` adapter resolving root-key material from an env var, or a generated file outside
 * the portable site folder. Thrown errors never carry a placeholder secret — a caller that
 * catches and swallows the error, then proceeds, is a bug in the caller, not this module.
 *
 * @overallScore 100
 */
export class EnvOrFileKeyring implements KeyringPort {
  private readonly keyId: string;
  private readonly sources: readonly SiteKeySource[];
  private readonly env: () => Record<string, string | undefined>;

  constructor(options: EnvOrFileKeyringOptions, deps: SiteKeyReaderDeps = {}) {
    this.keyId = options.keyId ?? "v1";
    this.sources = options.sources;
    // Reread on every derivation so recovery takes effect without a restart.
    this.env = deps.env ?? (() => process.env);
  }

  async activeKey(): Promise<{ readonly keyId: string }> {
    return { keyId: this.keyId };
  }

  async deriveSigningSecret(input: { workspaceId: string; subscriptionId: string; version: number }): Promise<Uint8Array> {
    try { return await this.resolveKeyring().deriveSigningSecret(input); }
    catch (error) { return rethrowKeyringError(error); }
  }

  async derive(input: { workspaceId: string; purpose: string; info: string }): Promise<Uint8Array> {
    try { return await this.resolveKeyring().derive(input); }
    catch (error) { return rethrowKeyringError(error); }
  }

  /** Ordered site sources are host policy. Reread them for each derive so recovery takes effect
   * immediately; a present invalid source throws before trying any other source.
   * @complexity O(sources), with one small env/file read per attempted source.
   */
  private resolveKeyring(): JiniFixedRootKeyKeyring {
    // Present-but-invalid wins and throws: falling through could seal data under a different
    // key than the operator configured. Ordered sources are readers only; ensureSiteKey owns minting.
    const env = this.env();
    if (resolveSiteKeyEnv({ env }).kind === "conflict") throw siteKeyEnvConflictError();
    for (const source of this.sources) {
      const material = readSiteKeySourceMaterial(source, env);
      if (material === undefined) continue;
      if ("conflict" in material) throw siteKeyEnvConflictError();
      const parsed = parseRootKeyHex(material.raw);
      if (parsed.ok) return new JiniFixedRootKeyKeyring({ hex: parsed.hex, hkdfSalt: HKDF_EXTRACTION_SALT }, { keyId: this.keyId });
      throw new UnusableRootKeyError({
        source: source.kind === "env" ? "env" : "file",
        reason: parsed.reason,
        message: unusableRootKeyMessage({
          subject: source.kind === "env" ? material.envVarName ?? SITE_KEY_ENV_VAR_NAME : describeSiteKeySource(source),
          detail: describeRootKeyRejection(parsed),
          sealedWarningSubject: source.kind !== "env" ? "this file" : parsed.reason === "too-short" ? "this value" : undefined,
        }),
      });
    }
    throw new Error(`no site key: none of the configured sources resolved (${this.sources.map(describeSiteKeySource).join(", ")})`);
  }
}

/** Candidate-key adapter supplies Tovu's immutable HKDF salt; no root material is persisted. */
// Recovery checks a pasted/retained Site Token against sealed rows BEFORE writing it anywhere;
// the candidate must derive exactly what the installed keyring would derive.
export class FixedRootKeyKeyring implements KeyringPort {
  private readonly keyring: JiniFixedRootKeyKeyring;

  constructor(hex: string, keyId = "v1") {
    this.keyring = new JiniFixedRootKeyKeyring({ hex, hkdfSalt: HKDF_EXTRACTION_SALT }, { keyId });
  }

  activeKey(): Promise<{ readonly keyId: string }> { return this.keyring.activeKey({}); }
  deriveSigningSecret(input: { workspaceId: string; subscriptionId: string; version: number }): Promise<Uint8Array> {
    return this.keyring.deriveSigningSecret(input);
  }
  derive(input: { workspaceId: string; purpose: string; info: string }): Promise<Uint8Array> {
    return this.keyring.derive(input);
  }
}

/** Jini owns key validation; Tovu retains its operator-facing refusal wording and error identity. */
function rethrowKeyringError(error: unknown): never {
  if (error instanceof JiniUnusableRootKeyError) {
    throw new UnusableRootKeyError({ source: error.source, reason: error.reason,
      message: error.message.replace("The keyring refuses", "Tovu refuses"),
    });
  }
  throw error;
}

/** A short, human-readable name for a {@link SiteKeySource} — error messages and the "none of the
 *  configured sources resolved" list only, never the material itself. */
function describeSiteKeySource(source: SiteKeySource): string {
  return source.kind === "env" ? `env var ${SITE_KEY_ENV_VAR_NAME}` : `the site key file at ${source.path}`;
}

/** Why present root-key material was refused. `"too-short"` means valid hex of fewer than
 *  {@link ROOT_KEY_LENGTH_BYTES} bytes — the exact length this module itself generates, and the
 *  length of every secret HKDF derives from it, so anything shorter caps the derived key's entropy
 *  below its own size (a truncated copy or partial write lands here). */
export type RootKeyRejection = "empty" | "not-hex" | "odd-length" | "too-short";

/** {@link parseRootKeyHex}'s result. Exported so `site-key-ensure.ts` (site-key plan §A.2) can
 *  classify per-site/adoptable material through the SAME validator this module's own resolution
 *  and status functions use, rather than a second, independently-reasoned hex check. */
export type ParsedRootKeyHex =
  | { readonly ok: true; readonly hex: string }
  | { readonly ok: false; readonly reason: RootKeyRejection; readonly hexDigits: number };

/**
 * THE root-key validator — the one both {@link EnvOrFileKeyring}'s resolution (env and file
 * branches alike) and {@link inspectRootKeyMaterial}/{@link revealRootKeyMaterial} call, so no two
 * paths in this module can reach different verdicts on the same material. Trims surrounding
 * whitespace (a trailing newline from `echo >` is not a malformed key), nothing else.
 *
 * @complexity O(n) in the value's length.
 */
export function parseRootKeyHex(raw: string): ParsedRootKeyHex {
  return parseKeyHex({ raw });
}

/** Plain-language "what is wrong with it", per rejection. A `Record` over the union, so adding a
 *  rejection without a description is a compile error. Never echoes the value itself. */
const ROOT_KEY_REJECTION_DETAIL: Record<RootKeyRejection, (hexDigits: number) => string> = {
  empty: () => "it is empty",
  "not-hex": () =>
    'it contains characters that are not hex digits (only 0-9 and a-f are allowed; a "0x" prefix, whitespace inside the value, or a base64 or PEM body all fail this)',
  "odd-length": (hexDigits) =>
    `it has an odd number of hex digits (${hexDigits}), so it does not describe whole bytes — usually a partial write or a truncated copy`,
  "too-short": (hexDigits) =>
    `it is ${hexDigits / 2} bytes (${hexDigits} hex digits); a site key must be at least ${ROOT_KEY_LENGTH_BYTES} bytes (${ROOT_KEY_LENGTH_BYTES * 2} hex digits) — usually a truncated copy`,
};

function describeRootKeyRejection(parsed: { reason: RootKeyRejection; hexDigits: number }): string {
  return ROOT_KEY_REJECTION_DETAIL[parsed.reason](parsed.hexDigits);
}

/**
 * Builds the refusal message. `sealedWarningSubject` is set only where an install may already
 * have been sealing under this exact material (see the two call sites), and the warning it adds
 * deliberately does NOT suggest that replacing the key fixes anything: rows sealed under the old
 * bytes open only under those bytes, so a replacement makes them unreadable rather than safe.
 */
function unusableRootKeyMessage(input: { subject: string; detail: string; sealedWarningSubject: string | undefined }): string {
  const refusal = `${input.subject} is not usable as a site key: ${input.detail}. Tovu refuses to derive any key material from it rather than sealing under a shortened or empty key.`;
  if (input.sealedWarningSubject === undefined) return refusal;
  return (
    `${refusal} IMPORTANT: anything this site sealed while ${input.sealedWarningSubject} was in place was sealed under key material derived from these same bytes, ` +
    `not from a real ${ROOT_KEY_LENGTH_BYTES}-byte key, so those stored credentials are not protected as intended — with empty or very short material the derived key is computable from published constants. ` +
    `Replacing or regenerating the key will NOT restore them; it will make them unreadable. ` +
    `Do not overwrite, delete or regenerate this key until you have decided what to do with the credentials already stored.`
  );
}

/**
 * Thrown by {@link EnvOrFileKeyring} when a root-key source IS present but fails
 * {@link parseRootKeyHex}. Distinct from the plain "no root key" errors (nothing configured):
 * this one means something is configured and broken. Never carries the key material.
 */
export class UnusableRootKeyError extends Error {
  readonly source: "env" | "file";
  readonly reason: RootKeyRejection | "env-conflict";

  constructor(input: { source: "env" | "file"; reason: RootKeyRejection | "env-conflict"; message: string }) {
    super(input.message);
    this.name = "UnusableRootKeyError";
    this.source = input.source;
    this.reason = input.reason;
  }
}

/**
 * A short, one-way fingerprint of root-key material — safe to display in an admin UI, never
 * reversible to the key itself (`sha256`, truncated). Deliberately NOT `deriveSigningSecret`'s
 * HKDF (different salt, different purpose, different output length) — this must never be
 * confused with a real derived secret, it exists purely for a human to recognize "same key as
 * before" across a page reload.
 *
 * Exported so `site-key-ensure.ts` (site-key plan §A.2) stamps the SAME 12-hex fingerprint this
 * module's own status/reveal functions compute — one algorithm, not two independently-reasoned
 * ones that could silently diverge.
 */
export function fingerprintRootKeyHex(hex: string): string {
  return fingerprintKeyHex({ hex });
}

/** {@link inspectRootKeyMaterial}'s result — never carries the key value itself. */
export interface RootKeyStatus {
  readonly active: boolean;
  /** `"none"` when neither the env var nor the key file resolves to usable material. */
  readonly source: "env" | "file" | "none";
  /** Present iff `active` — see {@link fingerprintRootKeyHex}. */
  readonly fingerprint?: string;
  readonly envVarName?: string;
  readonly deprecated?: boolean;
  /** `true` when a source was found (env var set, or file present) but its content fails
   *  {@link parseRootKeyHex} — `active` is `false` in this case too; surfaced separately so a caller
   *  can tell "nothing is configured" apart from "something is configured but broken". */
  readonly invalid?: boolean;
  /** Present iff `invalid` — the same {@link RootKeyRejection} {@link EnvOrFileKeyring} would throw
   *  with for this material. */
  readonly reason?: RootKeyRejection | "env-conflict";
  /** The path a generated file lives (or would live) at — not secret, just a filesystem
   *  convention. Empty when no safe per-site/new-volume target exists; legacy files are read-only. */
  readonly keyFilePath: string;
}

export interface InspectRootKeyMaterialOptions {
  sources: readonly SiteKeySource[];
}

type ActiveRootKeyMaterial = {
  source: "env" | "file" | "none"; hex?: string; invalid?: boolean;
  reason?: RootKeyRejection | "env-conflict"; envVarName?: string; deprecated?: boolean;
};

/** Status/reveal share the first-present rule with derivation. Never mint, never cache, never
 * silently skip a broken source: that could select a key the operator did not intend. */
function readActiveRootKeyMaterialFromSources(sources: readonly SiteKeySource[], env: Record<string, string | undefined>): ActiveRootKeyMaterial {
  if (resolveSiteKeyEnv({ env }).kind === "conflict") return { source: "env", invalid: true, reason: "env-conflict" };
  for (const source of sources) {
    const material = readSiteKeySourceMaterial(source, env);
    if (material === undefined) continue;
    if ("conflict" in material) return { source: "env", invalid: true, reason: "env-conflict" };
    const parsed = parseRootKeyHex(material.raw);
    const provenance = source.kind === "env" ? { envVarName: material.envVarName, deprecated: material.deprecated } : {};
    return parsed.ok
      ? { source: source.kind === "env" ? "env" : "file", hex: parsed.hex, ...provenance }
      : { source: source.kind === "env" ? "env" : "file", invalid: true, reason: parsed.reason, ...provenance };
  }
  return { source: "none" };
}

/** No write target for a local site with unreadable metadata; legacy shared files are read-only. */
function resolveReportedKeyFilePath(options: InspectRootKeyMaterialOptions): string {
  return siteKeyFilePathFrom(options.sources) ?? "";
}

function siteKeyEnvConflictError(): UnusableRootKeyError {
  return new UnusableRootKeyError({ source: "env", reason: "env-conflict",
    message: `Site key environment variables conflict. Set ${SITE_KEY_ENV_VAR_NAME} to the existing site key and remove the deprecated variable; nothing was changed.` });
}

/**
 * Read-only snapshot over the same explicit sources derivation uses. Re-read on every call so
 * status and recovery never report cached material. A present invalid source refuses resolution;
 * it never falls through to another key. Nothing here generates, replaces or repairs a file.
 */
export function inspectRootKeyMaterial(options: InspectRootKeyMaterialOptions, deps: SiteKeyReaderDeps = {}): RootKeyStatus {
  const keyFilePath = resolveReportedKeyFilePath(options);
  const raw = readActiveRootKeyMaterialFromSources(options.sources, (deps.env ?? (() => process.env))());
  const provenance = raw.source === "env" ? { envVarName: raw.envVarName, deprecated: raw.deprecated } : {};

  if (raw.hex) return { active: true, source: raw.source, fingerprint: fingerprintRootKeyHex(raw.hex), keyFilePath, ...provenance };
  return { active: false, source: raw.source, ...invalidFields(raw), keyFilePath, ...provenance };
}

/** The `invalid`/`reason` pair both status functions spread onto an inactive result — present
 *  together or not at all. */
function invalidFields(raw: ActiveRootKeyMaterial): { invalid?: true; reason?: RootKeyRejection | "env-conflict" } {
  return raw.invalid ? { invalid: true, reason: raw.reason } : {};
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
export function revealRootKeyMaterial(options: InspectRootKeyMaterialOptions, deps: SiteKeyReaderDeps = {}): RootKeyReveal {
  const keyFilePath = resolveReportedKeyFilePath(options);
  const raw = readActiveRootKeyMaterialFromSources(options.sources, (deps.env ?? (() => process.env))());
  const provenance = raw.source === "env" ? { envVarName: raw.envVarName, deprecated: raw.deprecated } : {};

  if (raw.hex) return { active: true, source: raw.source, hex: raw.hex, fingerprint: fingerprintRootKeyHex(raw.hex), keyFilePath, ...provenance };
  return { active: false, source: raw.source, ...invalidFields(raw), keyFilePath, ...provenance };
}

/** Thrown by {@link generateFileRootKey} when a key file already exists at the target path. */
export class RootKeyFileAlreadyExistsError extends Error {
  constructor(keyFilePath: string) {
    super(`a site key file already exists at ${keyFilePath} — generate never overwrites an existing key`);
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
 * Refuses (throws {@link RootKeyFileAlreadyExistsError}) if anything already exists at that path —
 * this function only ever CREATES, it never overwrites. Silently replacing an existing key here
 * would orphan every credential already sealed under the old one with no confirmation at all;
 * a deliberate rotate/replace flow is out of scope for this function (and, as of this writing, not
 * built anywhere in this admin).
 *
 * That refusal is the WRITE ITSELF, via `O_CREAT | O_EXCL` (`flag: "wx"`), not a preceding
 * `existsSync` — a pre-check plus a separate write is a check-then-write race, and the thing it
 * races for is the key that every stored credential is sealed under. Two concurrent
 * `POST .../generate` calls (a double-clicked Generate button is enough) could both see "no key
 * here" and the second would replace the first, returning `201` either way. The exclusive create
 * also refuses a path that is a SYMLINK, dangling or not, which `existsSync` follows and reports
 * as absent.
 *
 * @throws {RootKeyFileAlreadyExistsError} Anything already occupies `keyFilePath`.
 * @complexity One 32-byte random draw plus one exclusive file create.
 */
export function generateFileRootKey(options: { keyFilePath: string }, _optional = {}): GeneratedFileRootKey {
  const keyFilePath = options.keyFilePath;
  // Jini performs the exclusive create; this adapter retains Tovu's directory mode and error identity.
  // 0700 like `ensureSiteKey`'s own writer (site-key plan §A.1) — only applies to directories this call creates.
  mkdirSync(dirname(keyFilePath), { recursive: true, mode: 0o700 });
  try { return generateKeyFile({ keyFilePath }); }
  catch (error) {
    if (isAlreadyExistsError(error) || (error instanceof Error && error.name === "RootKeyFileAlreadyExistsError")) {
      throw new RootKeyFileAlreadyExistsError(keyFilePath);
    }
    throw error;
  }
}

/** Whether a failed exclusive create failed BECAUSE the path was taken (`EEXIST`), as opposed to a
 *  genuine I/O or permission fault that must keep propagating. `ELOOP` is the same answer wearing a
 *  different errno: a symlink chain the kernel refused to follow is still "something is there". */
function isAlreadyExistsError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  const code = (err as { code?: unknown }).code;
  return code === "EEXIST" || code === "ELOOP";
}
