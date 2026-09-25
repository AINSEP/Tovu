import { createHash, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { KeyringPort } from "./ports.js";
import { readSiteKeySourceMaterial, siteKeyFilePathFrom, type SiteKeySource } from "./site-key-sources.js";
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
 * ## One thing, three names
 * The admin UI's Security page calls this the **"Site Token"**; this codebase calls it the **root
 * key**; the environment variable is **`TOVU_INTEGRATIONS_ROOT_KEY`**. They are the same secret.
 * Reading two names as two mechanisms has already cost real time here, so do not go looking for a
 * separate "site token" — `features/identity/site-token-permission.ts` and
 * `server/inbound/admin-http/routes/system/site-token.ts` both manage exactly this key.
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
  /**
   * Site-key plan A.1 slice 1 (`site-key-sources.ts`). When set, resolution walks this ordered
   * list instead of the hardcoded env-then-file precedence above - the first source whose material
   * parses (via {@link parseRootKeyHex}) wins. `envVarName`/`keyFilePath` above are ignored for
   * resolution once `sources` is given.
   *
   * No caller passes this yet (site-key plan Stage A3a wires the real boot path); this option
   * exists so `site-key-ensure.ts` and future callers have a seam without a second parallel
   * resolver. A `sources` list NEVER triggers auto-generation, regardless of
   * `allowFileAutoGenerate` - minting is `ensureSiteKey`'s job now (site-key plan A.3), and a
   * reader stays a reader: exhausting every source throws the same "no root key" shape the
   * unconfigured case always has.
   */
  sources?: readonly SiteKeySource[];
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
  private readonly sources: readonly SiteKeySource[] | undefined;
  private cachedRootKey: Buffer | undefined;

  constructor(options: EnvOrFileKeyringOptions = {}) {
    this.envVarName = options.envVarName ?? DEFAULT_ROOT_KEY_ENV_VAR_NAME;
    this.keyFilePath = options.keyFilePath ?? defaultRootKeyFilePath();
    this.keyId = options.keyId ?? "v1";
    this.allowFileFallback = options.allowFileFallback ?? true;
    this.allowFileAutoGenerate = options.allowFileAutoGenerate ?? this.allowFileFallback;
    this.sources = options.sources;
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
   */
  private resolveRootKey(): Buffer {
    if (this.cachedRootKey) return this.cachedRootKey;

    if (this.sources) {
      this.cachedRootKey = this.resolveRootKeyFromSources(this.sources);
      return this.cachedRootKey;
    }

    const fromEnv = process.env[this.envVarName];
    if (fromEnv) {
      this.cachedRootKey = this.parseEnvRootKey(fromEnv);
      return this.cachedRootKey;
    }

    if (!this.allowFileFallback) {
      throw new Error(
        `no root key: ${this.envVarName} is not set and allowFileFallback is disabled`
      );
    }

    if (existsSync(this.keyFilePath)) {
      this.cachedRootKey = this.parseFileRootKey(readFileSync(this.keyFilePath, "utf8"));
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

  /**
   * The `sources`-driven counterpart to {@link resolveRootKey}'s hardcoded precedence (site-key
   * plan §A.1 slice 1). Tries each source in order; the first one whose material is PRESENT wins —
   * present-but-invalid still wins (and throws), it does not fall through to the next source, for
   * the same reason the hardcoded path never silently skips a malformed env var: silently trying
   * the next source could seal data under a DIFFERENT key than the operator thinks is active.
   *
   * Never auto-generates — a `sources` list is read-only regardless of `allowFileAutoGenerate`
   * (see that option's doc above: minting a site key is `ensureSiteKey`'s job now).
   *
   * @throws {UnusableRootKeyError} The first present source's material fails {@link parseRootKeyHex}.
   * @throws {Error} No source in the list has any material at all.
   * @complexity O(n) in `sources.length`, each step at most one file read.
   */
  private resolveRootKeyFromSources(sources: readonly SiteKeySource[]): Buffer {
    for (const source of sources) {
      const raw = readSiteKeySourceMaterial(source, process.env);
      if (raw === undefined) continue;
      const parsed = parseRootKeyHex(raw);
      if (parsed.ok) return Buffer.from(parsed.hex, "hex");
      throw new UnusableRootKeyError({
        source: source.kind === "env" ? "env" : "file",
        reason: parsed.reason,
        message: unusableRootKeyMessage({
          subject: describeSiteKeySource(source),
          detail: describeRootKeyRejection(parsed),
          sealedWarningSubject: parsed.reason === "too-short" ? "this value" : undefined,
        }),
      });
    }
    throw new Error(
      `no root key: none of the configured sources resolved (${sources.map(describeSiteKeySource).join(", ")})`
    );
  }

  /** The env branch of {@link resolveRootKey}. Only a too-short value can have been accepted
   *  before 2026-09-16 (malformed hex always threw here), so only that case carries the
   *  already-sealed warning. */
  private parseEnvRootKey(raw: string): Buffer {
    const parsed = parseRootKeyHex(raw);
    if (parsed.ok) return Buffer.from(parsed.hex, "hex");
    throw new UnusableRootKeyError({
      source: "env",
      reason: parsed.reason,
      message: unusableRootKeyMessage({
        subject: this.envVarName,
        detail: describeRootKeyRejection(parsed),
        sealedWarningSubject: parsed.reason === "too-short" ? "this value" : undefined,
      }),
    });
  }

  /** The file branch of {@link resolveRootKey}. Every rejection here carries the already-sealed
   *  warning: before 2026-09-16 this branch accepted ANY file content, so an install may have been
   *  sealing under it. Never rewrites, deletes or "repairs" the file — recovery is a separate,
   *  owner-level decision this module does not make. */
  private parseFileRootKey(raw: string): Buffer {
    const parsed = parseRootKeyHex(raw);
    if (parsed.ok) return Buffer.from(parsed.hex, "hex");
    throw new UnusableRootKeyError({
      source: "file",
      reason: parsed.reason,
      message: unusableRootKeyMessage({
        subject: `the root key file at ${this.keyFilePath}`,
        detail: describeRootKeyRejection(parsed),
        sealedWarningSubject: "this file",
      }),
    });
  }
}

/** A short, human-readable name for a {@link SiteKeySource} — error messages and the "none of the
 *  configured sources resolved" list only, never the material itself. */
function describeSiteKeySource(source: SiteKeySource): string {
  return source.kind === "env" ? `env var ${source.envVarName}` : `${source.kind} at ${source.path}`;
}

const HEX_KEY_PATTERN = /^[0-9a-f]+$/i;

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
  const hex = raw.trim();
  if (hex.length === 0) return { ok: false, reason: "empty", hexDigits: 0 };
  if (!HEX_KEY_PATTERN.test(hex)) return { ok: false, reason: "not-hex", hexDigits: hex.length };
  if (hex.length % 2 !== 0) return { ok: false, reason: "odd-length", hexDigits: hex.length };
  if (hex.length < ROOT_KEY_LENGTH_BYTES * 2) return { ok: false, reason: "too-short", hexDigits: hex.length };
  return { ok: true, hex };
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
    `it is ${hexDigits / 2} bytes (${hexDigits} hex digits); a root key must be at least ${ROOT_KEY_LENGTH_BYTES} bytes (${ROOT_KEY_LENGTH_BYTES * 2} hex digits) — usually a truncated copy`,
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
  const refusal = `${input.subject} is not usable as a root key: ${input.detail}. Tovu refuses to derive any key material from it rather than sealing under a shortened or empty key.`;
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
  readonly reason: RootKeyRejection;

  constructor(input: { source: "env" | "file"; reason: RootKeyRejection; message: string }) {
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
  return createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex").slice(0, 12);
}

/** {@link inspectRootKeyMaterial}'s result — never carries the key value itself. */
export interface RootKeyStatus {
  readonly active: boolean;
  /** `"none"` when neither the env var nor the key file resolves to usable material. */
  readonly source: "env" | "file" | "none";
  /** Present iff `active` — see {@link fingerprintRootKeyHex}. */
  readonly fingerprint?: string;
  /** `true` when a source was found (env var set, or file present) but its content fails
   *  {@link parseRootKeyHex} — `active` is `false` in this case too; surfaced separately so a caller
   *  can tell "nothing is configured" apart from "something is configured but broken". */
  readonly invalid?: boolean;
  /** Present iff `invalid` — the same {@link RootKeyRejection} {@link EnvOrFileKeyring} would throw
   *  with for this material. */
  readonly reason?: RootKeyRejection;
  /** The path a generated file lives (or would live) at — not secret, just a filesystem
   *  convention, always present so a `"none"` status can still tell an operator where Generate
   *  would write. */
  readonly keyFilePath: string;
}

export interface InspectRootKeyMaterialOptions {
  envVarName?: string;
  keyFilePath?: string;
  /**
   * Site-key plan §A3b. When set, resolution walks this ordered list (`site-key-sources.ts`'s
   * `siteKeySources`) instead of the hardcoded env-then-file precedence below — the first source
   * WITH ANY MATERIAL wins, same semantics as `EnvOrFileKeyring.resolveRootKeyFromSources`, except
   * this never throws: a status/reveal read must always return a result, so a present-but-invalid
   * source surfaces as `{invalid: true, reason}` the same way the hardcoded env/file path already
   * does for its own case, rather than propagating {@link UnusableRootKeyError}.
   *
   * `envVarName`/`keyFilePath` above are ignored once `sources` is given (mirrors
   * `EnvOrFileKeyringOptions.sources`'s own doc comment) — the reported `keyFilePath` is instead
   * whichever source in the list is `"per-site-file"`, or the legacy default when none is
   * ({@link siteKeyFilePathFrom}).
   */
  sources?: readonly SiteKeySource[];
}

type ActiveRootKeyMaterial = { source: "env" | "file" | "none"; hex?: string; invalid?: boolean; reason?: RootKeyRejection };

/** One raw read of whichever source is active — the shared core both {@link inspectRootKeyMaterial}
 *  and {@link revealRootKeyMaterial} build on, so the env-first/file-second precedence exists in
 *  exactly one place here, and the validity verdict is {@link parseRootKeyHex}'s — the same one
 *  `EnvOrFileKeyring.resolveRootKey` throws on. Holds no state, performs no caching (this file's own
 *  header on why that's deliberate). @complexity O(1) plus one file read when the file path applies,
 *  or O(n) in `sources.length` when given (each step at most one env/file read). */
function readActiveRootKeyMaterial(input: {
  envVarName: string;
  keyFilePath: string;
  sources?: readonly SiteKeySource[];
}): ActiveRootKeyMaterial {
  if (input.sources) return readActiveRootKeyMaterialFromSources(input.sources);
  const fromEnv = process.env[input.envVarName];
  if (fromEnv) return toActiveRootKeyMaterial("env", fromEnv);
  if (existsSync(input.keyFilePath)) return toActiveRootKeyMaterial("file", readFileSync(input.keyFilePath, "utf8"));
  return { source: "none" };
}

/** The `sources`-driven counterpart to {@link readActiveRootKeyMaterial}'s hardcoded precedence —
 *  walks `sources` in order, the FIRST one with any material wins (present-but-invalid still wins
 *  and is reported invalid; it never silently tries the next source, matching
 *  `EnvOrFileKeyring.resolveRootKeyFromSources`'s own reasoning). Never throws — a status read, not
 *  a resolution. An `"env"`-kind source maps to `source: "env"`; every other kind maps to
 *  `source: "file"` (this module's existing `RootKeyStatus.source` union has no third option). */
function readActiveRootKeyMaterialFromSources(sources: readonly SiteKeySource[]): ActiveRootKeyMaterial {
  for (const source of sources) {
    const raw = readSiteKeySourceMaterial(source, process.env);
    if (raw === undefined) continue;
    return toActiveRootKeyMaterial(source.kind === "env" ? "env" : "file", raw);
  }
  return { source: "none" };
}

function toActiveRootKeyMaterial(source: "env" | "file", raw: string): ActiveRootKeyMaterial {
  const parsed = parseRootKeyHex(raw);
  return parsed.ok ? { source, hex: parsed.hex } : { source, invalid: true, reason: parsed.reason };
}

/** `options.sources`' reported `keyFilePath` (the per-site-file candidate, or the legacy default
 *  when none) when given; otherwise the caller's own `keyFilePath` option or the legacy default —
 *  shared by {@link inspectRootKeyMaterial} and {@link revealRootKeyMaterial} so the two can never
 *  disagree about which file Generate would target. */
function resolveReportedKeyFilePath(options: InspectRootKeyMaterialOptions): string {
  if (options.sources) return siteKeyFilePathFrom(options.sources, defaultRootKeyFilePath());
  return options.keyFilePath ?? defaultRootKeyFilePath();
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
  const keyFilePath = resolveReportedKeyFilePath(options);
  const raw = readActiveRootKeyMaterial({ envVarName, keyFilePath, sources: options.sources });

  if (raw.hex) return { active: true, source: raw.source, fingerprint: fingerprintRootKeyHex(raw.hex), keyFilePath };
  return { active: false, source: raw.source, ...invalidFields(raw), keyFilePath };
}

/** The `invalid`/`reason` pair both status functions spread onto an inactive result — present
 *  together or not at all. */
function invalidFields(raw: ActiveRootKeyMaterial): { invalid?: true; reason?: RootKeyRejection } {
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
export function revealRootKeyMaterial(options: InspectRootKeyMaterialOptions = {}): RootKeyReveal {
  const envVarName = options.envVarName ?? DEFAULT_ROOT_KEY_ENV_VAR_NAME;
  const keyFilePath = resolveReportedKeyFilePath(options);
  const raw = readActiveRootKeyMaterial({ envVarName, keyFilePath, sources: options.sources });

  if (raw.hex) return { active: true, source: raw.source, hex: raw.hex, fingerprint: fingerprintRootKeyHex(raw.hex), keyFilePath };
  return { active: false, source: raw.source, ...invalidFields(raw), keyFilePath };
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
export function generateFileRootKey(options: { keyFilePath?: string } = {}): GeneratedFileRootKey {
  const keyFilePath = options.keyFilePath ?? defaultRootKeyFilePath();
  const generated = randomBytes(ROOT_KEY_LENGTH_BYTES);
  const hex = generated.toString("hex");
  // 0700 like `ensureSiteKey`'s own writer (site-key plan §A.1) — only applies to directories this call creates.
  mkdirSync(dirname(keyFilePath), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(keyFilePath, hex, { mode: 0o600, flag: "wx" });
  } catch (err) {
    if (isAlreadyExistsError(err)) throw new RootKeyFileAlreadyExistsError(keyFilePath);
    throw err;
  }
  return { hex, fingerprint: fingerprintRootKeyHex(hex), keyFilePath };
}

/** Whether a failed exclusive create failed BECAUSE the path was taken (`EEXIST`), as opposed to a
 *  genuine I/O or permission fault that must keep propagating. `ELOOP` is the same answer wearing a
 *  different errno: a symlink chain the kernel refused to follow is still "something is there". */
function isAlreadyExistsError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  const code = (err as { code?: unknown }).code;
  return code === "EEXIST" || code === "ELOOP";
}
