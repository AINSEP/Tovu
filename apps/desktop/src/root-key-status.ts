/**
 * @file Does THIS desktop launch have usable integrations root-key material? A read-only,
 * dependency-injected check the shell runs once at boot, before any site is started.
 *
 * ## Why the desktop shell needs its own copy of this check
 *
 * On 2026-09-18 the app was relaunched with `electron .` from `apps/desktop` (its `npm run dev`)
 * rather than `npm run desktop` from the repo root. Only the repo-root launcher runs
 * `development/scripts/dev-desktop.mjs`, which calls `loadRepoRootEnvFile` — so `.env` was never
 * read, `TOVU_INTEGRATIONS_ROOT_KEY` was unset, and every site server the shell spawned inherited
 * that `process.env`. The app looked completely normal. Hours later the first credentialed action
 * (`custom_credential_make_request` during a Fly deploy) failed, and the only statement of the real
 * cause was one line in a daemon log nobody was tailing.
 *
 * The shell is the process whose environment is wrong, and the process that boots first, so the
 * shell is where the detection belongs. It cannot ask a site server — at boot there may be no site
 * running at all, and a site that IS running inherited the same broken environment.
 *
 * ## Why this mirrors `keyring.env.ts` instead of importing it
 *
 * The authority on root-key material is `apps/website/src/features/webhooks/keyring.env.ts` —
 * `inspectRootKeyMaterial()` is what the admin Secrets page reports and what
 * `EnvOrFileKeyring.resolveRootKey()` seals with. This file deliberately reproduces its rules
 * rather than importing them: `apps/website` is a separate package with its own `#src/*` path
 * aliases and its own tsconfig, and the Electron main process loads plain type-stripped `.ts` with
 * no bundler, so that import does not resolve here. `root-key-parity.test.ts` reads BOTH sources
 * and fails if the env var name, key length, hex rule, rejection vocabulary, fingerprint recipe or
 * key-file paths drift apart, so the mirror cannot quietly stop agreeing with the authority.
 *
 * The rules mirrored, all from that file:
 * - resolution order: env var first, then the key file, else nothing;
 * - `parseRootKeyHex`: trim surrounding whitespace, then require non-empty, hex-only, an even
 *   number of digits, and at least {@link ROOT_KEY_LENGTH_BYTES} bytes;
 * - `fingerprintRootKeyHex`: `sha256` of the key BYTES, hex, first 12 characters;
 * - `defaultRootKeyFilePath`: `~/.tovu/…` in local mode, `<cwd>/sites/.tovu/…` in production.
 *
 * ## The secret invariant
 *
 * Nothing this module returns ever carries key material. {@link RootKeyBootStatus} has no field
 * that can hold it, the fingerprint is a one-way truncated digest, and no branch here logs, echoes
 * or copies a value. The status is designed to cross an IPC boundary into a renderer, so that is a
 * hard property, not a style preference.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The env var every Tovu process reads a hex root key from. Mirrors `keyring.env.ts`'s
 *  `DEFAULT_ROOT_KEY_ENV_VAR_NAME`. */
export const ROOT_KEY_ENV_VAR_NAME = "TOVU_INTEGRATIONS_ROOT_KEY";

/** The key length `keyring.env.ts` generates and derives from; anything shorter caps the entropy
 *  of every secret derived from it below its own size. Mirrors its `ROOT_KEY_LENGTH_BYTES`. */
export const ROOT_KEY_LENGTH_BYTES = 32;

/** Why present material was refused. Mirrors `keyring.env.ts`'s `RootKeyRejection`, plus
 *  `unreadable` — a case that file cannot reach (it lets the I/O error propagate to a caller that
 *  is already failing a request) but this one must, because a boot check may never throw. */
export type RootKeyRejection = "empty" | "not-hex" | "odd-length" | "too-short" | "unreadable";

/**
 * What the shell learned about root-key material at boot. Crosses IPC to the renderer as-is, so
 * every field here is either a boolean, a filesystem path, a fixed vocabulary word, or a one-way
 * digest — never key material.
 */
export interface RootKeyBootStatus {
  /** `true` only when a source resolved to material that passes every rule below. */
  readonly present: boolean;
  /** Which source was consulted last: `"none"` when nothing at all is configured. A source that
   *  is configured but broken reports itself here with `invalid: true`, so a caller can tell
   *  "you never set one" apart from "the one you set is damaged" — two different remedies. */
  readonly source: "env" | "file" | "none";
  /** Present iff `present`. `sha256(key bytes)` truncated to 12 hex characters — the same recipe
   *  the admin Secrets page shows, so an operator can match the two by eye. Not reversible, and
   *  deliberately not the HKDF any real secret is derived with. */
  readonly fingerprint?: string;
  /** `true` when a source WAS found but its content is unusable. `present` is `false` either way. */
  readonly invalid?: true;
  /** Present iff `invalid`. */
  readonly reason?: RootKeyRejection;
  /** Where a generated key file lives, or would live. Not secret — a path convention — and always
   *  present, so even a `"none"` status can tell an operator exactly where to look. */
  readonly keyFilePath: string;
  /** Named rather than assumed, so the remedy text has one source. */
  readonly envVarName: string;
}

/** Ambient readers {@link inspectRootKeyForBoot} and {@link defaultRootKeyFilePath} use, all
 *  injectable so a test never touches the real environment, the real home directory, or the real
 *  key file — and so a test machine that happens to have a key cannot change any result. */
export interface RootKeyProbeDeps {
  env?: Record<string, string | undefined>;
  keyFilePath?: string;
  exists?: (path: string) => boolean;
  readFile?: (path: string) => string;
  home?: () => string;
  cwd?: () => string;
}

/**
 * Where a generated root key file lives. Mirrors `keyring.env.ts`'s `defaultRootKeyFilePath`,
 * including its mode split: local installs keep the key in the operator's home so that copying one
 * `sites/<name>/` folder never carries it along (ADR-012 portability), while a production install
 * keeps it on the durable volume that survives a redeploy.
 *
 * Any unrecognized `TOVU_RUNTIME_MODE` resolves to local, never production — the same one-sided
 * default `contracts/core/runtime-mode.ts` documents.
 *
 * @complexity O(1) — one env read and a path join.
 */
export function defaultRootKeyFilePath(deps: RootKeyProbeDeps = {}): string {
  const env = deps.env ?? process.env;
  const readHome = deps.home ?? homedir;
  const readCwd = deps.cwd ?? (() => process.cwd());
  if (env.TOVU_RUNTIME_MODE === "production") {
    return join(readCwd(), "sites", ".tovu", "integrations-root-key.hex");
  }
  return join(readHome(), ".tovu", "integrations-root-key.hex");
}

const HEX_KEY_PATTERN = /^[0-9a-f]+$/i;

type ParsedRootKeyHex =
  | { readonly ok: true; readonly hex: string }
  | { readonly ok: false; readonly reason: RootKeyRejection };

/** THE validator, mirroring `keyring.env.ts`'s `parseRootKeyHex`. Trims surrounding whitespace (a
 *  trailing newline from `echo >` is not a malformed key) and nothing else.
 *  @complexity O(n) in the material's length. */
function parseRootKeyHex(raw: string): ParsedRootKeyHex {
  const hex = raw.trim();
  if (hex.length === 0) return { ok: false, reason: "empty" };
  if (!HEX_KEY_PATTERN.test(hex)) return { ok: false, reason: "not-hex" };
  if (hex.length % 2 !== 0) return { ok: false, reason: "odd-length" };
  if (hex.length < ROOT_KEY_LENGTH_BYTES * 2) return { ok: false, reason: "too-short" };
  return { ok: true, hex };
}

/** Mirrors `keyring.env.ts`'s `fingerprintRootKeyHex`: a one-way, truncated digest of the key
 *  BYTES (not of the hex text), so both surfaces print the same 12 characters for the same key. */
function fingerprintRootKeyHex(hex: string): string {
  return createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex").slice(0, 12);
}

/**
 * Reads whichever root-key source is active and reports what it found — env var first, then the
 * key file, else nothing.
 *
 * Never throws and never blocks: an unreadable key file becomes `reason: "unreadable"`, not an
 * exception. A missing root key is recoverable and the operator needs the app running in order to
 * go fix it, so this check exists to make the problem LOUD, never to fail the boot closed.
 *
 * Holds no state and caches nothing — unlike `EnvOrFileKeyring`, which caches its resolved key for
 * a process lifetime. A boot snapshot is taken once by the caller ({@link
 * ../root-key-boot-guard.ts}); caching here would additionally hide a key that appeared later from
 * anyone who asked again.
 *
 * @param deps - injectable env/filesystem readers; defaults to the real process environment.
 * @returns a status that never carries key material. See {@link RootKeyBootStatus}.
 * @complexity O(n) in the material's length, plus at most one small file read.
 */
export function inspectRootKeyForBoot(deps: RootKeyProbeDeps = {}): RootKeyBootStatus {
  const env = deps.env ?? process.env;
  const fileExists = deps.exists ?? existsSync;
  const readFile = deps.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const keyFilePath = deps.keyFilePath ?? defaultRootKeyFilePath(deps);
  const base = { keyFilePath, envVarName: ROOT_KEY_ENV_VAR_NAME };

  const fromEnv = env[ROOT_KEY_ENV_VAR_NAME];
  // An empty var is treated as unset (falling through to the file), exactly as
  // `EnvOrFileKeyring.resolveRootKey`'s own truthiness check does — not as a configured-but-broken
  // source. Otherwise `FOO=` in a shell would mask a perfectly good key file.
  if (fromEnv) return { ...base, ...verdictFor("env", fromEnv) };

  if (!fileExists(keyFilePath)) return { ...base, present: false, source: "none" };

  let contents: string;
  try {
    contents = readFile(keyFilePath);
  } catch {
    // The path exists but cannot be read — permissions, a dangling symlink, a race with a delete.
    // Reported, never rethrown: this runs on the boot path.
    return { ...base, present: false, source: "file", invalid: true, reason: "unreadable" };
  }
  return { ...base, ...verdictFor("file", contents) };
}

/** One source's raw material turned into the present/invalid half of a {@link RootKeyBootStatus}. */
function verdictFor(
  source: "env" | "file",
  raw: string
): Pick<RootKeyBootStatus, "present" | "source" | "fingerprint" | "invalid" | "reason"> {
  const parsed = parseRootKeyHex(raw);
  if (parsed.ok) return { present: true, source, fingerprint: fingerprintRootKeyHex(parsed.hex) };
  // No special case for an "empty" verdict from the env branch. A var set to `""` never reaches
  // here (the truthiness check above falls through to the file, exactly as
  // `EnvOrFileKeyring.resolveRootKey` does), and a var set to WHITESPACE does reach here and is
  // configured-but-broken — which is what `inspectRootKeyMaterial` reports for it too. An earlier
  // draft mapped that case back to `source: "none"`; a mutation sweep found the branch unproven,
  // and checking it against the authority showed it was also wrong.
  return { present: false, source, invalid: true, reason: parsed.reason };
}
