import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import Database from "better-sqlite3";

import { fingerprintRootKeyHex, parseRootKeyHex, type RootKeyRejection } from "./keyring.env.js";
import { readSiteKeySourceMaterial, resolveSiteKeyId, siteKeySources, type SiteKeySource } from "./site-key-sources.js";
import { resolveRuntimeMode, type RuntimeMode } from "#src/contracts/core/runtime-mode";
import { CONTENT_DB_FILENAME } from "#src/platform/site-dir/layout";

/**
 * @file Site-key plan (`ADS-memory/.local-artifacts/plan-site-key-2026-09-24.md`) §A.2 — the ONE
 * writer for a site's key file. `planRootKeyEnsure`/`findKeyDependentData` (the CLI's
 * `tovu root-key ensure`, `cli/commands/root-key.ts:41-134`) live HERE now — `root-key.ts`
 * re-exports them (its own `runRootKeyEnsureCommand` is unchanged and still consumes them
 * directly) until Stage A3b deletes that CLI command outright.
 *
 * Purpose:
 * `ensureSiteKey` runs once per server boot, local mode only (A.2): a per-site file already there
 * and valid is a no-op; missing with an env/legacy-file key already in effect ADOPTS that exact
 * material into the per-site file (never re-keys, never orphans); missing with nothing anywhere
 * and no key-dependent data yet MINTS a fresh one; missing with key-dependent data already sealed
 * REFUSES rather than silently starting a new key nothing can decrypt with. Production is always a
 * no-op — it never had a per-site file to begin with (A.1's "why per-site rather than one key per
 * OS user"; A.3's "production never mints").
 *
 * The write itself is race-safe with no single-instance lock (A.2's "atomic write, safe with many
 * instances running at once"): a temp file is written and fsynced, then linked onto the final
 * path — `link(2)` refuses `EEXIST` atomically, so at most one process's bytes ever become the
 * file. Both the winner and every loser then read the FINAL file back rather than trusting their
 * own in-memory candidate, so two instances racing (one adopting, one minting) always converge on
 * the same key — see {@link atomicCreateSiteKeyFile}.
 *
 * Architectural role:
 * `features/webhooks` domain writer. Depends on `keyring.env.ts` (shared hex validator and
 * fingerprint) and `site-key-sources.ts` (candidate ordering) — never the reverse: both keyrings
 * stay readers (`allowFileAutoGenerate: false`), and this module is the only place `randomBytes`
 * feeds a site key file. Nothing under `server/inbound/**` may import this module (site-key plan
 * §A.3: "no request path can reach it") — Stage A3a's own wiring test enforces that; this file
 * does not import anything from `server/inbound` in either direction.
 */

// ---------------------------------------------------------------------------
// Moved from cli/commands/root-key.ts (unchanged) — the CLI's own decision table and
// key-dependent-data scan. `root-key.ts` re-exports both by name.
// ---------------------------------------------------------------------------

export type RootKeyEnsureAction = "noop" | "generate" | "refuse" | "invalid";

export interface RootKeyEnsurePlan {
  readonly action: RootKeyEnsureAction;
}

/** Mirrors `keyring.env.ts`'s `RootKeyStatus` shape without importing it — this decision table
 *  only ever reads `active`/`invalid`, so a structural duck-type keeps `root-key.ts`'s existing
 *  call site (which passes a real `RootKeyStatus`) working unchanged. */
export interface RootKeyEnsureStatus {
  readonly active: boolean;
  readonly invalid?: boolean;
}

export interface PlanRootKeyEnsureInput {
  readonly status: RootKeyEnsureStatus;
  readonly mode: RuntimeMode;
  readonly siteDbsWithKeyData: boolean;
}

/**
 * Pure decision table for `tovu root-key ensure` (moved verbatim from `cli/commands/root-key.ts`
 * — see that file's own history for the original reasoning). Order is significant:
 *
 * 1. An unreadable existing source (`status.invalid`) is reported before anything else.
 * 2. An already-active key (env or file) is always a no-op.
 * 3. Outside local mode, this command never mints a key.
 * 4. In local mode with nothing configured, existing key-dependent data blocks a fresh generate.
 * 5. Only once all four checks pass does this command mint a file.
 *
 * @complexity O(1) — a fixed sequence of boolean checks over already-computed inputs.
 */
export function planRootKeyEnsure(input: PlanRootKeyEnsureInput): RootKeyEnsurePlan {
  if (input.status.invalid) return { action: "invalid" };
  if (input.status.active) return { action: "noop" };
  if (input.mode !== "local") return { action: "noop" };
  if (input.siteDbsWithKeyData) return { action: "refuse" };
  return { action: "generate" };
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

// ---------------------------------------------------------------------------
// New: ensureSiteKey — the per-site decision table and its one writer.
// ---------------------------------------------------------------------------

export type SiteKeyEnsureAction = "noop" | "adopt" | "mint" | "refuse" | "invalid" | "production-noop";

export interface SiteKeyEnsurePlan {
  readonly action: SiteKeyEnsureAction;
}

/** One material check's outcome — never carries a "why" beyond what {@link planSiteKeyEnsure}
 *  needs to decide; the payload (`hex`/`reason`) a caller needs afterward stays in the caller's
 *  own variable, this type is not threaded back out of the pure decision. */
export type SiteKeyMaterialCheck = { readonly kind: "absent" } | { readonly kind: "valid" } | { readonly kind: "invalid" };

export interface PlanSiteKeyEnsureInput {
  readonly mode: RuntimeMode;
  /** This site's own `~/.tovu/site-keys/<id>.hex`. */
  readonly perSite: SiteKeyMaterialCheck;
  /** The first-present candidate among every OTHER source (env var, legacy shared file) — i.e.
   *  `siteKeySources` with `perSite` excluded. */
  readonly other: SiteKeyMaterialCheck;
  /** Irrelevant unless both `perSite` and `other` are `"absent"` — a caller may pass `false`
   *  unconditionally otherwise, the same convention `PlanRootKeyEnsureInput.siteDbsWithKeyData`
   *  already uses. */
  readonly siteDbsWithKeyData: boolean;
}

/**
 * Pure decision table for `ensureSiteKey` (site-key plan §A.2). Order mirrors the plan's own
 * prose:
 *
 * 1. Production never touches a per-site file at all — always `"production-noop"`, regardless of
 *    every other input (A.1: production keeps the env-var/legacy-volume mechanism unchanged).
 * 2. A valid per-site file is always a no-op — this function only ever fills a GAP, never
 *    re-validates or repairs an already-usable key.
 * 3. An INVALID per-site file is reported, never silently treated as absent and never overwritten.
 * 4. Per-site absent, and some other source resolves to valid material → adopt that exact material
 *    (§A.2: "this mirrors exactly what the server already uses, so nothing can become
 *    undecryptable").
 * 5. Per-site absent, and the one other source present is invalid → reported the same way #3 is;
 *    adopting broken material would just move the breakage.
 * 6. Nothing anywhere: existing key-dependent data blocks a fresh mint (would orphan it).
 * 7. Only once every other check passes does this mint a fresh key.
 *
 * @complexity O(1) — a fixed sequence of checks over already-computed inputs.
 */
export function planSiteKeyEnsure(input: PlanSiteKeyEnsureInput): SiteKeyEnsurePlan {
  if (input.mode === "production") return { action: "production-noop" };
  if (input.perSite.kind === "valid") return { action: "noop" };
  if (input.perSite.kind === "invalid") return { action: "invalid" };
  // perSite.kind === "absent" from here on.
  if (input.other.kind === "valid") return { action: "adopt" };
  if (input.other.kind === "invalid") return { action: "invalid" };
  // other.kind === "absent" too — nothing anywhere.
  if (input.siteDbsWithKeyData) return { action: "refuse" };
  return { action: "mint" };
}

export interface EnsureSiteKeyInput {
  /** This site's own directory — only its `content.db` is scanned for key-dependent data (A.2:
   *  "its dependency-data check scans only this site's content.db (per-site keys)"), never every
   *  sibling site the way the CLI's `tovu root-key ensure` did. */
  readonly siteDir: string;
  /** `.site-meta.json`'s `siteKeyId` (A.1/A.4). */
  readonly siteKeyId: string;
  /** Defaults to {@link resolveRuntimeMode}. Test-injected so a suite never depends on the real
   *  `TOVU_RUNTIME_MODE`. */
  readonly mode?: RuntimeMode;
  /** Defaults to `process.env`. Test-injected so a suite never touches real env vars. */
  readonly env?: NodeJS.ProcessEnv;
  /** Defaults to `homedir()`. Test-injected so a suite never touches the real `~/.tovu`. */
  readonly home?: string;
  /** Defaults to `process.cwd()`. Only reaches {@link siteKeySources}'s production branch, which
   *  `ensureSiteKey` never takes (production is always `"production-noop"`) — kept for symmetry
   *  with {@link siteKeySources}'s own input shape and so a future caller has a real seam if that
   *  ever changes. */
  readonly cwd?: string;
}

export interface EnsureSiteKeyResult {
  readonly action: SiteKeyEnsureAction;
  /** Absent for `"production-noop"` — production has no per-site file to name. */
  readonly perSiteFilePath?: string;
  /** Present for `"noop"`, `"adopt"`, `"mint"` — the fingerprint of the key now in the per-site
   *  file (site-key plan §A.2's fingerprint stamp reuses this same value). */
  readonly fingerprint?: string;
  /** Present for `"invalid"` — which {@link RootKeyRejection} the offending material failed. */
  readonly reason?: RootKeyRejection;
}

/**
 * The only writer of a site's key file (site-key plan §A.2). Safe to call on every boot: a valid
 * existing file is read, not rewritten, and the two write-producing outcomes (`"adopt"`, `"mint"`)
 * both go through {@link atomicCreateSiteKeyFile}'s race-safe create.
 *
 * @throws whatever the underlying `fs`/`better-sqlite3` calls throw for a path that exists but
 *   cannot be read (permissions, a torn file, a corrupt database) — this function never swallows
 *   those into a wrong decision.
 * @complexity O(1) fs/env reads plus {@link findKeyDependentData}'s cost, and only on the one
 *   branch (`perSite` and `other` both absent) that needs it.
 */
export function ensureSiteKey(input: EnsureSiteKeyInput): EnsureSiteKeyResult {
  const env = input.env ?? process.env;
  const mode = input.mode ?? resolveRuntimeMode({ env });

  if (mode === "production") {
    return { action: "production-noop" };
  }

  const home = input.home ?? homedir();
  const cwd = input.cwd ?? process.cwd();
  const sources = siteKeySources({ mode, env, home, cwd, siteKeyId: input.siteKeyId });
  const perSiteSource = sources.find((source): source is SiteKeySource & { path: string } => source.kind === "per-site-file");
  if (!perSiteSource) {
    // Invariant guard, not a real runtime branch: `siteKeyId` is always passed above, and
    // `siteKeySources` always includes a per-site candidate when one is given.
    throw new Error("ensureSiteKey: siteKeySources did not return a per-site-file candidate for a given siteKeyId");
  }
  const perSiteFilePath = perSiteSource.path;
  const otherSources = sources.filter((source) => source.kind !== "per-site-file");

  const perSiteRaw = readSiteKeySourceMaterial(perSiteSource, env);
  const perSiteParsed = perSiteRaw === undefined ? undefined : parseRootKeyHex(perSiteRaw);

  const otherRaw = findFirstPresentMaterial(otherSources, env);
  const otherParsed = otherRaw === undefined ? undefined : parseRootKeyHex(otherRaw);

  const contentDbPath = join(input.siteDir, CONTENT_DB_FILENAME);
  const needsDataCheck = perSiteParsed === undefined && otherParsed === undefined;
  const siteDbsWithKeyData = needsDataCheck && existsSync(contentDbPath) ? findKeyDependentData([contentDbPath]) : false;

  const plan = planSiteKeyEnsure({
    mode,
    perSite: materialCheckOf(perSiteParsed),
    other: materialCheckOf(otherParsed),
    siteDbsWithKeyData,
  });

  switch (plan.action) {
    case "noop": {
      if (!perSiteParsed?.ok) throw new Error("ensureSiteKey: 'noop' plan implies a valid per-site key");
      return { action: "noop", perSiteFilePath, fingerprint: fingerprintRootKeyHex(perSiteParsed.hex) };
    }
    case "invalid": {
      const rejected = perSiteParsed?.ok === false ? perSiteParsed : otherParsed?.ok === false ? otherParsed : undefined;
      if (!rejected) throw new Error("ensureSiteKey: 'invalid' plan implies a rejected key");
      return { action: "invalid", perSiteFilePath, reason: rejected.reason };
    }
    case "adopt": {
      if (!otherParsed?.ok) throw new Error("ensureSiteKey: 'adopt' plan implies valid adoptable material");
      const written = atomicCreateSiteKeyFile(perSiteFilePath, otherParsed.hex);
      return { action: "adopt", perSiteFilePath, fingerprint: fingerprintRootKeyHex(written) };
    }
    case "refuse":
      return { action: "refuse", perSiteFilePath };
    case "mint": {
      const generatedHex = randomBytes(32).toString("hex");
      const written = atomicCreateSiteKeyFile(perSiteFilePath, generatedHex);
      return { action: "mint", perSiteFilePath, fingerprint: fingerprintRootKeyHex(written) };
    }
    case "production-noop":
      // Unreachable here (the mode==="production" branch above already returned) — kept only so
      // this switch stays exhaustive against SiteKeyEnsureAction without a `default` escape hatch.
      return { action: "production-noop" };
  }
}

export interface EnsureSiteKeyForBootInput {
  /** This site's own directory — same meaning as {@link EnsureSiteKeyInput.siteDir}. */
  readonly siteDir: string;
  readonly mode?: RuntimeMode;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
  readonly cwd?: string;
}

/**
 * Site-key plan §A3a's actual boot-path call site: `cli/commands/serve.ts` and `src/index.ts` call
 * this, not {@link ensureSiteKey} directly, so neither has to resolve `siteKeyId` itself. Resolves it
 * from `siteDir`'s own `.site-meta.json` via {@link resolveSiteKeyId} and, only when that succeeds,
 * calls through to {@link ensureSiteKey}.
 *
 * A `siteDir` with no readable `.site-meta.json` (or none present) returns `undefined` and touches
 * nothing — {@link ensureSiteKey} itself throws an invariant-guard error for an empty `siteKeyId`
 * (it assumes a caller only ever invokes it with a real one), so this guard exists precisely to keep
 * that assumption true at the one real call site that cannot itself guarantee a resolvable id. Every
 * real `tovu serve`/`index.ts` boot already validated `.site-meta.json`'s presence upstream
 * (`readSiteDir`), so this is a safety net for the genuinely unusual case (a corrupt or unrepaired
 * site), not the expected path — that site simply keeps its pre-site-key env/legacy-file-only
 * behavior, exactly as before this feature existed.
 *
 * @complexity O(1) fs read for `resolveSiteKeyId`, plus {@link ensureSiteKey}'s own cost when it runs.
 */
export function ensureSiteKeyForBoot(input: EnsureSiteKeyForBootInput): EnsureSiteKeyResult | undefined {
  const siteKeyId = resolveSiteKeyId({ siteDir: input.siteDir });
  if (!siteKeyId) return undefined;
  return ensureSiteKey({ siteDir: input.siteDir, siteKeyId, mode: input.mode, env: input.env, home: input.home, cwd: input.cwd });
}

/** {@link planSiteKeyEnsure}'s input shape from a raw {@link parseRootKeyHex} result (or
 *  `undefined` for "nothing there"). */
function materialCheckOf(parsed: ReturnType<typeof parseRootKeyHex> | undefined): SiteKeyMaterialCheck {
  if (parsed === undefined) return { kind: "absent" };
  return parsed.ok ? { kind: "valid" } : { kind: "invalid" };
}

/** The first source in `sources` that has ANY material — present-but-invalid still counts and
 *  stops the scan (site-key plan §A.2: adopting silently past a broken source would still be
 *  wrong, the same reasoning `keyring.env.ts`'s own env-then-file resolution already follows). */
function findFirstPresentMaterial(sources: readonly SiteKeySource[], env: NodeJS.ProcessEnv): string | undefined {
  for (const source of sources) {
    const raw = readSiteKeySourceMaterial(source, env);
    if (raw !== undefined) return raw;
  }
  return undefined;
}

/**
 * Writes `hex` to `filePath`, race-safe with no single-instance lock (site-key plan §A.2): write a
 * temp file in the same directory (`0600`, fsynced), then `linkSync` it onto `filePath` — `link(2)`
 * fails atomically with `EEXIST` if anything is already there, so at most one process's bytes ever
 * become the file. The loser's temp file is still removed; its `EEXIST` is swallowed, not
 * propagated. Both the winner and every loser then read `filePath` back and return THAT (never
 * their own `hex` argument), so two instances racing on the same `siteKeyId` always converge on
 * the one file that won, whichever process actually wrote it.
 *
 * @param filePath - the target `~/.tovu/site-keys/<id>.hex`. Its containing directory is created
 *   (`0700`) if missing.
 * @param hex - this call's own candidate key material, used only if no one else wins the race.
 * @returns the final file's content (trimmed) — always read from disk, never `hex` verbatim.
 * @throws whatever `fs` throws other than `EEXIST` from the `linkSync` step.
 * @complexity O(1) — a fixed number of syscalls, independent of `hex`'s length.
 */
function atomicCreateSiteKeyFile(filePath: string, hex: string): string {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = join(dir, `.${basename(filePath)}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  const fd = openSync(tmpPath, "w", 0o600);
  try {
    writeSync(fd, hex);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(tmpPath, 0o600);
  try {
    linkSync(tmpPath, filePath);
  } catch (err) {
    if (!isLinkTargetTakenError(err)) throw err;
    // Lost the race — another process's file is now canonical; fall through to read it back.
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Already gone (e.g. a concurrent cleanup of the same temp name) — nothing left to remove.
    }
  }
  return readFileSync(filePath, "utf8").trim();
}

/** Whether a failed `linkSync` failed BECAUSE the target path was already taken, as opposed to a
 *  genuine I/O or permission fault that must keep propagating. */
function isLinkTargetTakenError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  return (err as { code?: unknown }).code === "EEXIST";
}
