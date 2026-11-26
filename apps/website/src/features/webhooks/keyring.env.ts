import {
  FixedSiteKeyKeyring as JiniFixedSiteKeyKeyring,
  UnusableSiteKeyError as JiniUnusableSiteKeyError,
  parseSiteKeyHex as parseKeyHex,
  fingerprintSiteKeyHex as fingerprintKeyHex,
  generateFileSiteKey as generateKeyFile,
  SiteKeyFileAlreadyExistsError as JiniSiteKeyFileAlreadyExistsError,
} from "@jini-ai/platform/secrets";
import { InMemoryKeyring as PlatformInMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { bindSiteKeyrings } from "@jini-ai/platform/secrets/root-key/ordered-keyring";
import { SITE_KEY_ENV_VAR_NAME, readSiteKeySourceMaterial, siteKeyFilePathFrom, type SiteKeySource } from "./site-key-read-bindings.js";

// Validation/derivation rationale: Jini packages/platform/src/secrets/keyring.env.ts.
/**
 * @file `KeyringPort` implementation backed by an env var, with a generated-file fallback
 * (ADR-PIPE-015 Phase 1, GAP-02/GAP-03).
 *
 * Purpose:
 * The real site-key source `signing.keyring.ts`'s signer depends on. Never persists the derived
 * signing secret itself (ADR-024 secret invariant, ADR-036 §5) — only the *root* key material is
 * held, and every signing secret is re-derived via HKDF on demand from it.
 *
 * ## Site key sources and durability
 *
 * This is the one site key the Security page manages. The source-policy module owns how the
 * `TOVU_SITE_KEY` env source is read, so reader defaults can never disagree with the boot gate or UI.
 * Ordered sources are required and read-only; `ensureSiteKey` owns unattended local creation.
 * A credential reader must never silently mint a key for a paid third-party credential, and an
 * anonymous newsletter request must never choose the key the credential store adopts.
 *
 * Local per-site keys stay outside the portable `sites/<name>/` folder (ADR-012). Production
 * files live at `<cwd>/sites/.tovu/` on the durable data volume rather than the ephemeral rootfs
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
 * not pass {@link parseSiteKeyHex}.
 *
 * Both branches validate through that ONE parser, the same one {@link inspectSiteKeyMaterial}
 * uses, so the Secrets screen and this sealer cannot disagree about whether a key is usable.
 * Before 2026-09-16 only the env branch validated: the file branch was a bare
 * `Buffer.from(hex, "hex")`, which turns non-hex content into a zero-length buffer that
 * `hkdfSync` accepts — every credential was then sealed under a key computable from this
 * module's public constants, while the status screen said the key was unusable.
 *
 * @throws {UnusableSiteKeyError} The env var or key file is present but malformed or too short.
 *
 * The required ordered-source resolver (site-key
 * plan §A.1 slice 1). Tries each source in order; the first one whose material is PRESENT wins —
 * present-but-invalid still wins (and throws), it does not fall through to the next source, for
 * the same reason the hardcoded path never silently skips a malformed env var: silently trying
 * the next source could seal data under a DIFFERENT key than the operator thinks is active.
 *
 * Never auto-generates: minting a site key is `ensureSiteKey`'s job; all readers stay read-only.
 *
 * @throws {UnusableSiteKeyError} The first present source's material fails {@link parseSiteKeyHex}.
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
 * HKDF(siteKey, info = `${workspaceId}:${subscriptionId}:v${version}`) — shared by every keyring
 *  here so a key checked in memory derives exactly what the installed one will.
 *
 * `purpose` is bound into the info string (not just a label) so it is a real domain-separation
 *  boundary from {@link deriveSigningSecretFromSiteKey} (ports.ts KeyringPort doc).
 *
 * A {@link KeyringPort} over one given site key, held only in memory — for checking a candidate
 * (a pasted site key, or the key "Start fresh" keeps) against sealed rows BEFORE it is written
 * anywhere. Derives exactly as {@link EnvOrFileKeyring} does.
 *
 * @throws {Error} `hex` is not a valid site key ({@link parseSiteKeyHex}) — callers validate first.
 */

export const HKDF_EXTRACTION_SALT = "tovu-integrations-root-key-hkdf-v1"; // site-key-frozen: never change (every sealed row depends on these bytes)

const SITE_KEY_LENGTH_BYTES = 32;

export interface EnvOrFileKeyringOptions {
  keyId?: string;
  /** Readers never mint. The first present source wins; invalid material never falls through. */
  sources: readonly SiteKeySource[];
}

/** Snapshot port for isolated readers/tests; the host reads process.env on each call by default. */
export interface SiteKeyReaderDeps {
  env?: () => Record<string, string | undefined>;
}

export type SiteKeyRejection = "empty" | "not-hex" | "odd-length" | "too-short";

/** {@link parseSiteKeyHex}'s result. Exported so `site-key-ensure.ts` (site-key plan §A.2) can
 *  classify per-site/adoptable material through the SAME validator this module's own resolution
 *  and status functions use, rather than a second, independently-reasoned hex check. */
export type ParsedSiteKeyHex =
  | { readonly ok: true; readonly hex: string }
  | { readonly ok: false; readonly reason: SiteKeyRejection; readonly hexDigits: number };

const SITE_KEY_REJECTION_DETAIL: Record<SiteKeyRejection, (required: { hexDigits: number }, optional?: Record<string, never>) => string> = {
  empty: () => "it is empty",
  "not-hex": () =>
    'it contains characters that are not hex digits (only 0-9 and a-f are allowed; a "0x" prefix, whitespace inside the value, or a base64 or PEM body all fail this)',
  "odd-length": ({ hexDigits }) =>
    `it has an odd number of hex digits (${hexDigits}), so it does not describe whole bytes — usually a partial write or a truncated copy`,
  "too-short": ({ hexDigits }) =>
    `it is ${hexDigits / 2} bytes (${hexDigits} hex digits); a site key must be at least ${SITE_KEY_LENGTH_BYTES} bytes (${SITE_KEY_LENGTH_BYTES * 2} hex digits) — usually a truncated copy`,
};

export const {
  InMemoryKeyring, EnvOrFileKeyring, FixedSiteKeyKeyring, isNoSiteKeyError,
  parseSiteKeyHex, UnusableSiteKeyError, fingerprintSiteKeyHex, inspectSiteKeyMaterial,
  revealSiteKeyMaterial, SiteKeyFileAlreadyExistsError, generateFileSiteKey,
} = bindSiteKeyrings({
  hkdfSalt: HKDF_EXTRACTION_SALT,
  defaultKeyId: "v1",
  env: () => process.env,
  readSourceMaterial: readSiteKeySourceMaterial,
  siteKeyFilePathFrom,
  describeSource: source => source.kind === "env" ? `env var ${SITE_KEY_ENV_VAR_NAME}` : `the site key file at ${source.path}`,
  FixedSiteKeyKeyring: JiniFixedSiteKeyKeyring,
  InMemoryKeyring: PlatformInMemoryKeyring,
  UnusableSiteKeyError: JiniUnusableSiteKeyError,
  SiteKeyFileAlreadyExistsError: JiniSiteKeyFileAlreadyExistsError,
  parseSiteKeyHex: parseKeyHex,
  fingerprintSiteKeyHex: fingerprintKeyHex,
  generateFileSiteKey: generateKeyFile,
  prepareDirectory: ({ keyFilePath }) => {
    // Jini performs the exclusive create; this adapter retains Tovu's directory mode and error identity.
    // 0700 like `ensureSiteKey`'s own writer (site-key plan §A.1) — only applies to directories this call creates.
    mkdirSync(dirname(keyFilePath), { recursive: true, mode: 0o700 });
  },
  copy: {
    envVarName: SITE_KEY_ENV_VAR_NAME,
    fileWarningSubject: "this file",
    envWarningSubject: "this value",
    rejectionDetail: SITE_KEY_REJECTION_DETAIL,
    refusal: ({ subject, detail }) => `${subject} is not usable as a site key: ${detail}. Tovu refuses to derive any key material from it rather than sealing under a shortened or empty key.`,
    sealedWarning: ({ subject }) => ` IMPORTANT: anything this site sealed while ${subject} was in place was sealed under key material derived from these same bytes, ` +
      `not from a real ${SITE_KEY_LENGTH_BYTES}-byte key, so those stored credentials are not protected as intended — with empty or very short material the derived key is computable from published constants. ` +
      `Replacing or regenerating the key will NOT restore them; it will make them unreadable. ` +
      `Do not overwrite, delete or regenerate this key until you have decided what to do with the credentials already stored.`,
    alreadyExists: ({ keyFilePath }) => `a site key file already exists at ${keyFilePath} — generate never overwrites an existing key`,
    rootRefusal: "The keyring refuses",
    siteRefusal: "Tovu refuses",
  },
});

export type InMemoryKeyring = InstanceType<typeof InMemoryKeyring>;
export type EnvOrFileKeyring = InstanceType<typeof EnvOrFileKeyring>;
export type FixedSiteKeyKeyring = InstanceType<typeof FixedSiteKeyKeyring>;
export type UnusableSiteKeyError = InstanceType<typeof UnusableSiteKeyError>;
export type SiteKeyFileAlreadyExistsError = InstanceType<typeof SiteKeyFileAlreadyExistsError>;
export type SiteKeyStatus = ReturnType<typeof inspectSiteKeyMaterial>;
export type SiteKeyReveal = ReturnType<typeof revealSiteKeyMaterial>;
export type GeneratedFileSiteKey = ReturnType<typeof generateFileSiteKey>;
export type InspectSiteKeyMaterialOptions = Parameters<typeof inspectSiteKeyMaterial>[0];
