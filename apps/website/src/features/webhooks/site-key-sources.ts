import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";

import { DEFAULT_ROOT_KEY_ENV_VAR_NAME } from "./keyring.env.js";
import type { RuntimeMode } from "#src/contracts/core/runtime-mode";

/**
 * @file Site-key plan (`ADS-memory/.local-artifacts/plan-site-key-2026-09-24.md` §A.1/A.2) —
 * candidate source ORDER only. Pure: describes WHERE the site key could be found, never reads a
 * file or an env var itself, and never validates or mints anything (that is
 * `site-key-ensure.ts`'s job).
 *
 * Local mode checks, in order: this site's own key file, the env var, then the one legacy shared
 * file every install used before per-site keys existed. Production checks only the env var and the
 * legacy durable-volume file — it never has (or wants) a per-site file; see A.1's "why per-site
 * rather than one key per OS user" and A.3's "production never mints".
 *
 * The env var name itself is `TOVU_SITE_KEY` when already set, otherwise the current (pre-rename)
 * `TOVU_INTEGRATIONS_ROOT_KEY` — Stage D1 (not built yet) is what turns this into a real dual-name
 * alias with conflict detection; today this module only prefers the new name when it happens to
 * already be present.
 *
 * Architectural role:
 * `features/webhooks` domain helper, alongside `keyring.env.ts` (whose readers this feeds) and
 * `site-key-ensure.ts` (whose one writer consumes the same ordering).
 */

/** The site key's forward-looking env var name (site-key plan §B.1: the eventual rename target).
 *  Preferred over {@link DEFAULT_ROOT_KEY_ENV_VAR_NAME} whenever it is already set. */
export const SITE_KEY_ENV_VAR_NAME = "TOVU_SITE_KEY";

/** The legacy shared-file name every pre-per-site-key install still carries — reused verbatim (not
 *  duplicated) via {@link legacySharedFilePath}/{@link legacyVolumeFilePath}, so this module and
 *  `keyring.env.ts`'s `defaultRootKeyFilePath` can never drift on the same literal. */
const LEGACY_KEY_FILENAME = "integrations-root-key.hex";

export type SiteKeySourceKind = "per-site-file" | "env" | "legacy-shared-file" | "legacy-volume-file";

/** One candidate place to look for the site key, in the order a caller should try them. Exactly
 *  one of `path`/`envVarName` is set, matching `kind` (`"env"` → `envVarName`, everything else →
 *  `path`) — never both, never neither. */
export interface SiteKeySource {
  readonly kind: SiteKeySourceKind;
  readonly path?: string;
  readonly envVarName?: string;
}

export interface SiteKeySourcesInput {
  readonly mode: RuntimeMode;
  /** A snapshot of the process env to consult — never read directly, so this stays pure and
   *  testable without mutating `process.env`. */
  readonly env: Record<string, string | undefined>;
  readonly home: string;
  readonly cwd: string;
  /** This site's `siteKeyId` (`.site-meta.json`, A.4). Omitted, empty, or not a safe file name
   *  ({@link isSafeSiteKeyId}) drops the per-site candidate entirely. */
  readonly siteKeyId?: string;
}

/**
 * The ordered list of places to look for this site's key. Order is significant — the FIRST source
 * whose material resolves wins (site-key plan §A.2's "the per-site file wins over the env var").
 *
 * @complexity O(1) — a fixed-size list, no I/O.
 */
export function siteKeySources(input: SiteKeySourcesInput): SiteKeySource[] {
  const envSource: SiteKeySource = { kind: "env", envVarName: resolveEnvVarName(input.env) };

  if (input.mode === "production") {
    return [envSource, { kind: "legacy-volume-file", path: legacyVolumeFilePath(input.cwd) }];
  }

  const sources: SiteKeySource[] = [];
  if (input.siteKeyId && isSafeSiteKeyId(input.siteKeyId)) {
    sources.push({ kind: "per-site-file", path: perSiteFilePath(input.home, input.siteKeyId) });
  }
  sources.push(envSource);
  sources.push({ kind: "legacy-shared-file", path: legacySharedFilePath(input.home) });
  return sources;
}

/** Prefers the new `TOVU_SITE_KEY` name when it is already set; otherwise names the current real
 *  var so an unmodified install (nothing D1-renamed yet) still resolves. */
function resolveEnvVarName(env: Record<string, string | undefined>): string {
  return env[SITE_KEY_ENV_VAR_NAME] !== undefined ? SITE_KEY_ENV_VAR_NAME : DEFAULT_ROOT_KEY_ENV_VAR_NAME;
}

/** Characters a `siteKeyId` may contain: `initSite` writes a UUID, so letters, digits, `-`, `_` and
 *  `.` cover every real id. Anything else — above all a path separator or a drive prefix — is
 *  refused, because the id is joined into `~/.tovu/site-keys/<id>.hex` and `.site-meta.json` lives
 *  in the site folder, where an agent or an imported site controls its content. */
const SAFE_SITE_KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Whether `id` can be used as a key-file name without escaping `~/.tovu/site-keys/`. */
export function isSafeSiteKeyId(id: string): boolean {
  return SAFE_SITE_KEY_ID.test(id) && id !== "." && id !== "..";
}

/** `~/.tovu/site-keys/<siteKeyId>.hex` — A.1's per-site local path. */
function perSiteFilePath(home: string, siteKeyId: string): string {
  return join(home, ".tovu", "site-keys", `${siteKeyId}.hex`);
}

/** `~/.tovu/integrations-root-key.hex` — the one shared file every install had before per-site
 *  keys, still read (never written by a reader) as an adoption source. */
function legacySharedFilePath(home: string): string {
  return join(home, ".tovu", LEGACY_KEY_FILENAME);
}

/** `<cwd>/sites/.tovu/integrations-root-key.hex` — the production durable-volume path
 *  (`keyring.env.ts`'s `defaultRootKeyFilePath` production branch), reused here unchanged. */
function legacyVolumeFilePath(cwd: string): string {
  return join(cwd, "sites", ".tovu", LEGACY_KEY_FILENAME);
}

/**
 * `.site-meta.json`'s raw parsed object under `siteDir`, or `undefined` when the file is missing,
 * unreadable, not valid JSON, or not a JSON object. The one shared parse every field-specific
 * reader in this module ({@link resolveSiteKeyId}, {@link resolveSiteKeyFingerprint}) builds on, so
 * a corrupt-file/non-object verdict can never drift between them — and the one
 * `site-key-ensure.ts`'s own fingerprint-stamp reconciliation imports (site-key plan §A.4), since
 * that module depends on this one, never the reverse (this file's own header).
 *
 * Never throws — same never-throws contract every reader built on it shares.
 *
 * @complexity O(1) — one small, bounded-size file read.
 */
export function readSiteMetaJson(siteDir: string): Record<string, unknown> | undefined {
  let raw: string;
  try {
    raw = readFileSync(join(siteDir, ".site-meta.json"), "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
}

export interface ResolveSiteKeyIdInput {
  readonly siteDir: string;
}

/**
 * This site's `siteKeyId` for {@link siteKeySources}, read straight from `.site-meta.json` — a
 * READ-ONLY helper (unlike `site-key-ensure.ts`'s `ensureSiteKey`), safe for a route under
 * `server/inbound/**` to import directly (site-key plan §A3a: nothing under that tree may import
 * `site-key-ensure.ts`, the one WRITER — this module stays the reader both sides can share).
 *
 * Stage A4 (not built yet) is what writes a distinct `siteKeyId` field into `.site-meta.json`; until
 * then every site's key is named after its `siteId` (A.1: "It defaults to siteId when missing"), so
 * a present `siteKeyId` field wins when both exist (forward-compatible with A4's write) and `siteId`
 * is the fallback otherwise.
 *
 * Never throws: a missing file, malformed JSON, or a non-string/empty field all resolve to
 * `undefined` — exactly the input {@link siteKeySources} already treats as "no per-site candidate",
 * so a site with no readable meta (a legacy or unrepaired install) falls back to its pre-site-key
 * env/legacy-file-only behavior rather than crashing a boot or an admin request.
 *
 * @complexity O(1) — one small, bounded-size file read (via {@link readSiteMetaJson}).
 */
export function resolveSiteKeyId(input: ResolveSiteKeyIdInput): string | undefined {
  const meta = readSiteMetaJson(input.siteDir);
  if (meta === undefined) return undefined;
  const id = typeof meta.siteKeyId === "string" && meta.siteKeyId.length > 0 ? meta.siteKeyId : meta.siteId;
  // An unsafe id resolves to "no per-site key" (legacy readers only) rather than falling back to
  // `siteId`: a site whose `siteKeyId` was tampered with must not quietly switch to another key file.
  return typeof id === "string" && id.length > 0 && isSafeSiteKeyId(id) ? id : undefined;
}

export interface ResolveSiteKeyFingerprintInput {
  readonly siteDir: string;
}

/**
 * This site's stamped `siteKeyFingerprint` from `.site-meta.json` (site-key plan §A.4/§A.6) — a
 * READ-ONLY sibling of {@link resolveSiteKeyId}, same never-throws contract and same shared parse
 * ({@link readSiteMetaJson}). Backs the admin Site Token route's `"mismatch"` state: a valid key
 * resolving to a DIFFERENT fingerprint than this one means the physical key file was substituted
 * after the stamp was written (`site-key-ensure.ts`'s `ensureSiteKey` derives the identical
 * `"mismatch"` outcome for the write path from the same two values, via its own
 * `withFingerprintReconciliation` — this function is the read-only counterpart for a caller, like
 * the admin route, that must never write).
 *
 * @complexity O(1) — one small, bounded-size file read (via {@link readSiteMetaJson}).
 */
export function resolveSiteKeyFingerprint(input: ResolveSiteKeyFingerprintInput): string | undefined {
  const meta = readSiteMetaJson(input.siteDir);
  if (meta === undefined) return undefined;
  return typeof meta.siteKeyFingerprint === "string" && meta.siteKeyFingerprint.length > 0 ? meta.siteKeyFingerprint : undefined;
}

/**
 * Whether any database in `dbPaths` holds data that only the CURRENT root/site key can decrypt or
 * verify. Checks every table whose schema mentions `sealed_ciphertext` (the column all sealed
 * tables share) for a non-null row, plus `webhook_subscriptions` (signing secrets derived from the
 * key, not stored under a `sealed_ciphertext` column at all).
 *
 * Fails closed: a database this function cannot open or query at all counts as "has data" — a
 * database it never got to inspect could hold sealed rows. Callers are expected to only pass paths
 * known to exist (`existsSync` first) — a genuinely missing site database is "nothing to scan yet",
 * not "unreadable", and must never reach this fail-closed path.
 *
 * Moved here from `site-key-ensure.ts` (site-key plan §A.6): the admin Site Token route's
 * `"missing-with-data"` state needs this exact scan, and `site-key-ensure.ts` is the one key-file
 * WRITER nothing under `server/inbound/**` may import (`no-site-key-ensure-import.boundary.test.ts`)
 * — this scan is read-only and belongs in the shared reader layer both sides already depend on, not
 * duplicated at the route. `site-key-ensure.ts`'s own `ensureSiteKey` still calls it, now via this
 * module's export.
 *
 * @param dbPaths - `content.db` paths to scan. Each is opened read-only and closed before the
 *   next; never mutates any of them.
 * @complexity O(t) sqlite statements per database, where t is that database's matching table
 *   count — one `sqlite_master` scan plus one bounded `LIMIT 1` probe per matching table.
 */
export function findKeyDependentData(dbPaths: readonly string[]): boolean {
  return dbPaths.some((dbPath) => databaseHasKeyDependentData(dbPath));
}

/** One database's contribution to {@link findKeyDependentData} — isolated so a failure opening or
 *  querying THIS database can be caught and turned into "has data" without aborting the scan of
 *  the others. */
function databaseHasKeyDependentData(dbPath: string): boolean {
  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return true;
  }
  try {
    const sealedTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%sealed_ciphertext%'")
      .all() as { name: string }[];
    for (const { name } of sealedTables) {
      // `name` is quoted as an identifier (never interpolated as a value) — it comes from
      // `sqlite_master` itself, this database's own schema, not external input.
      const row = db.prepare(`SELECT 1 FROM "${name}" WHERE sealed_ciphertext IS NOT NULL LIMIT 1`).get();
      if (row !== undefined) return true;
    }

    const hasWebhookTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'webhook_subscriptions'")
      .get();
    if (hasWebhookTable !== undefined) {
      const row = db.prepare("SELECT 1 FROM webhook_subscriptions LIMIT 1").get();
      if (row !== undefined) return true;
    }
    return false;
  } catch {
    return true;
  } finally {
    db.close();
  }
}

/**
 * The per-site-file candidate's path out of an already-computed {@link SiteKeySource} list, or
 * `fallback` when none exists — production (no per-site candidate at all, A.1) and a site with no
 * resolvable `siteKeyId` both land on `fallback`. Backs the admin Site Token route's `generate`
 * action (owner change: generate stays, but (re)writes THIS site's own key file when one exists) —
 * kept here, not duplicated at the call site, so the "which path does generate target" decision has
 * one home next to the ordering it is derived from.
 *
 * @param fallback - typically `defaultRootKeyFilePath()` (`keyring.env.ts`) — not imported here to
 *   keep this module free of a dependency on that one, since a caller with no fallback opinion of
 *   its own can still pass it in directly.
 * @complexity O(n) in `sources.length` — a single linear find.
 */
export function siteKeyFilePathFrom(sources: readonly SiteKeySource[], fallback: string): string {
  const perSite = sources.find((source) => source.kind === "per-site-file");
  return perSite?.path ?? fallback;
}

/**
 * One {@link SiteKeySource}'s raw material from `env`/the filesystem — `undefined` when that source
 * has none. The ONE place both `keyring.env.ts`'s `EnvOrFileKeyring.resolveRootKeyFromSources` and
 * `site-key-ensure.ts`'s `ensureSiteKey` read a source's material, so the "a blank env var counts
 * as unset" rule below can never drift between the two (it did, briefly — A3a found it duplicated
 * and inconsistent, each side reading the env case slightly differently).
 *
 * A env-kind source whose var IS set but blank or whitespace-only is treated as ABSENT, not
 * present-but-invalid: `development/scripts/start.mjs`'s own `clearBlankRootKeyEnv` exists for the
 * exact same reason — a spawned child (the desktop app's own boot path) can pass a blank value
 * through, and an operator's shell profile can just as easily `export TOVU_SITE_KEY=` with nothing
 * after it. Either way the var must fall through to the next source exactly as if it had never been
 * set, not be reported as a broken/invalid key. A file-kind source's content is NOT trimmed or
 * blank-checked here — a real file that exists and is empty is a genuinely broken on-disk state
 * ({@link parseRootKeyHex}'s own `"empty"` rejection), distinct from an env var nobody set a value
 * for.
 *
 * @complexity O(1) env read, or one `existsSync` plus a file read for a file-kind source.
 */
export function readSiteKeySourceMaterial(
  source: SiteKeySource,
  env: Record<string, string | undefined>
): string | undefined {
  if (source.kind === "env") {
    if (source.envVarName === undefined) return undefined;
    const raw = env[source.envVarName];
    return raw === undefined || raw.trim().length === 0 ? undefined : raw;
  }
  return source.path !== undefined && existsSync(source.path) ? readFileSync(source.path, "utf8") : undefined;
}
