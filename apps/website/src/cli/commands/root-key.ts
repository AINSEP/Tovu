import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import {
  DEFAULT_ROOT_KEY_ENV_VAR_NAME,
  RootKeyFileAlreadyExistsError,
  defaultRootKeyFilePath,
  generateFileRootKey,
  inspectRootKeyMaterial,
  type RootKeyStatus,
} from "../../features/webhooks/keyring.env.js";
import { resolveRuntimeMode, type RuntimeMode } from "../../contracts/core/runtime-mode.js";
import { resolveSiteRoot } from "../../platform/site-dir/site-root.js";

/**
 * @file `tovu root-key ensure [--quiet]` — SPEC-003-adjacent CLI command backing decisions 2 and 3
 * of `ADS-memory/.local-artifacts/npm-start-just-works-plan-2026-09-24.md` (Slice 1). Also the
 * `run-from-zip-plan-2026-09-23.md` S1 command — that plan explicitly defers to this one rather
 * than shipping a second implementation.
 *
 * Purpose:
 * A dumb, idempotent "make sure a usable root key exists" step `development/scripts/start.mjs`
 * (Slice 2) spawns before boot, so `npm start` never needs a manually-set
 * `TOVU_INTEGRATIONS_ROOT_KEY` on a fresh checkout. Reuses {@link inspectRootKeyMaterial} and
 * {@link generateFileRootKey} from `keyring.env.ts` as-is — this file owns none of the
 * env-var/file precedence or hex validation, only the decision of WHETHER to mint a file and what
 * to print about it.
 *
 * Architectural role:
 * `cli` layer. The decision itself ({@link planRootKeyEnsure}) is a pure function over an
 * already-computed {@link RootKeyStatus}, runtime mode, and one boolean — kept separate from
 * {@link runRootKeyEnsureCommand}'s I/O (env/file read, DB scan, generate, print) so the decision
 * table is testable without touching a filesystem or process env at all.
 */

const KEY_DEPENDENT_DATA_REFUSAL =
  "tovu: this site has saved credentials but its security key is missing. Set TOVU_INTEGRATIONS_ROOT_KEY (in .env or your shell) to the key they were saved with.";

export type RootKeyEnsureAction = "noop" | "generate" | "refuse" | "invalid";

export interface RootKeyEnsurePlan {
  readonly action: RootKeyEnsureAction;
}

export interface PlanRootKeyEnsureInput {
  /** A fresh {@link inspectRootKeyMaterial} read — never cached across calls (see that function's
   *  own doc for why). */
  readonly status: RootKeyStatus;
  readonly mode: RuntimeMode;
  /** Whether any in-scope site DB holds data only the CURRENT key can decrypt/verify
   *  ({@link findKeyDependentData}) — irrelevant to every branch except `generate`, so a caller may
   *  pass `false` unconditionally when `status.active || status.invalid` already short-circuits it. */
  readonly siteDbsWithKeyData: boolean;
}

/**
 * Pure decision table for `tovu root-key ensure` (npm-start-just-works-plan decision 2). Order is
 * significant and mirrors the decision's own prose exactly:
 *
 * 1. An unreadable existing source (`status.invalid`) is reported before anything else — an
 *    invalid env var or file is never silently treated as absent, and never overwritten.
 * 2. An already-active key (env or file) is always a no-op — this command only ever fills a GAP.
 * 3. Outside local mode, this command never mints a key — production keeps its own, separate gate
 *    (`composition/deps.ts`'s `allowFileAutoGenerate: false`); nothing to report either way.
 * 4. In local mode with nothing configured, existing key-dependent data blocks a fresh generate —
 *    minting a new key here would permanently orphan credentials already sealed under the old one.
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
 * Whether any database in `dbPaths` holds data that only the CURRENT root key can decrypt or
 * verify — decision 2(c)'s guard against silently minting a fresh key that would orphan
 * already-sealed credentials. Checks every table whose schema mentions `sealed_ciphertext` (the
 * column all 13 sealed tables share) for a non-null row, plus `webhook_subscriptions` (signing
 * secrets derived from the root key, not stored under a `sealed_ciphertext` column at all).
 *
 * Fails closed: a database this function cannot open or query at all counts as "has data" — a
 * database it never got to inspect could hold sealed rows.
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

/** Every sibling site's `content.db` under this install's `sites/` root
 *  (`path.dirname(resolveSiteRoot())/*\/content.db`) — not just the currently-active site, since
 *  any site folder in this install could hold data sealed under the current key. Missing entries
 *  (a site folder with no `content.db` yet) are skipped rather than fed to
 *  {@link findKeyDependentData}'s fail-closed path, which is reserved for a path that exists but
 *  cannot be read. */
function defaultSiteDbPaths(): string[] {
  const sitesRoot = path.dirname(resolveSiteRoot());
  if (!existsSync(sitesRoot)) return [];
  return readdirSync(sitesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(sitesRoot, entry.name, "content.db"))
    .filter((dbPath) => existsSync(dbPath));
}

export interface RunRootKeyEnsureCommandInput {
  /** Suppresses the one-line announcement on `noop`(active)/`generate` success. `refuse`/`invalid`
   *  always print — the owner needs to see those regardless. Defaults to `false`. */
  readonly quiet?: boolean;
  /** Defaults to {@link defaultRootKeyFilePath}. Test-injected so a suite never touches the real
   *  `~/.tovu/integrations-root-key.hex`. */
  readonly keyFilePath?: string;
  /** Source for `TOVU_RUNTIME_MODE` (via {@link resolveRuntimeMode}) only. `inspectRootKeyMaterial`
   *  below has no env-injection seam of its own and always reads the real `process.env` for
   *  `TOVU_INTEGRATIONS_ROOT_KEY` — a caller that needs to exercise the env-active branch under
   *  test replaces `process.env` itself for the call (see `root-key-ensure.unit.test.ts`'s
   *  `withProcessEnv`, mirroring `serve-site-dir-pin.unit.test.ts`'s own helper). Defaults to
   *  `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Defaults to {@link defaultSiteDbPaths}. Test-injected so a suite never scans a real install's
   *  `sites/` tree. */
  readonly siteDbPaths?: readonly string[];
}

/**
 * Runs one `tovu root-key ensure` invocation: reads the current root-key status, decides via
 * {@link planRootKeyEnsure}, and performs the one action that decision calls for. Never overwrites
 * an existing key file or key-dependent database, and never prints key material.
 *
 * @throws whatever {@link generateFileRootKey} throws other than
 *   {@link RootKeyFileAlreadyExistsError} (a lost generate race — caught and treated as a no-op,
 *   since another process already won it).
 * @complexity O(1) plus {@link findKeyDependentData}'s cost, and only on the branch that needs it.
 */
export async function runRootKeyEnsureCommand(input: RunRootKeyEnsureCommandInput = {}): Promise<void> {
  const keyFilePath = input.keyFilePath ?? defaultRootKeyFilePath();
  const mode = resolveRuntimeMode({ env: input.env ?? process.env });
  const status = inspectRootKeyMaterial({ keyFilePath });

  // Only the `generate` branch needs this, and it is the one DB-scanning cost this command has —
  // skip it whenever the decision can't possibly reach `generate` anyway.
  const siteDbsWithKeyData =
    status.active || status.invalid === true || mode !== "local"
      ? false
      : findKeyDependentData(input.siteDbPaths ?? defaultSiteDbPaths());

  const plan = planRootKeyEnsure({ status, mode, siteDbsWithKeyData });

  switch (plan.action) {
    case "invalid": {
      const subject = status.source === "env" ? `in ${DEFAULT_ROOT_KEY_ENV_VAR_NAME}` : `at ${status.keyFilePath}`;
      process.stderr.write(`tovu: security key ${subject} is unreadable (${status.reason}). Nothing was changed.\n`);
      return;
    }
    case "refuse": {
      process.stderr.write(`${KEY_DEPENDENT_DATA_REFUSAL}\n`);
      return;
    }
    case "noop": {
      // The silent (production, nothing configured) case: no source to announce.
      if (!status.active) return;
      if (!input.quiet) {
        process.stdout.write(`tovu root-key: source=${status.source} fingerprint=${status.fingerprint} path=${status.keyFilePath}\n`);
      }
      return;
    }
    case "generate": {
      let generated;
      try {
        generated = generateFileRootKey({ keyFilePath });
      } catch (err) {
        if (err instanceof RootKeyFileAlreadyExistsError) return; // lost race — another process just won it
        throw err;
      }
      if (!input.quiet) {
        process.stdout.write(`tovu root-key: source=generated fingerprint=${generated.fingerprint} path=${generated.keyFilePath}\n`);
      }
      return;
    }
  }
}
