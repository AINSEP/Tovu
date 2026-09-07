/**
 * @file Shared scaffold behind every `backfill-*-aad.ts` script (argument parsing, the
 * dry-run/`--apply` split, the per-unit seal-verify-write loop, restore-point capture, and the
 * exit-code convention). Extracted from six near-identical scripts after `c412bc75` ("dry-run must
 * be read-only") had to be hand-applied to all six for a single root cause — see
 * `ADS-memory/reports/2026-09-06-fix-aad-backfill.md` for the enumerated per-store differences this
 * module does NOT try to unify.
 *
 * What stays OUT of this file, deliberately, because it is a genuine per-store difference and not
 * duplication:
 * - Which table(s)/columns are pending, and the shape of a pending unit's identity (bare
 *   `workspaceId`; composite `(workspaceId, connectorId)`; or `external-mcp`'s two independent
 *   sealed blobs per row). Each script's own `loadPending()` stays in that script.
 * - Which AAD builder(s) apply, and the `WHERE`/`SET` shape of the write. Each script's own
 *   `write()` closure stays in that script.
 * - Every operator-facing string. The six scripts' wording is NOT uniform (e.g.
 *   `backfill-connector-credential-aad.ts` says "with credentials to migrate" where four siblings
 *   say "with a key to migrate", and `backfill-external-mcp-aad.ts` counts "blob(s)" not "row(s)")
 *   — this looks tied to what each store actually holds (a bare key vs. a credentials JSON blob vs.
 *   two independent blobs), not accidental drift, so every string is supplied by the caller, not
 *   templated here. Preserving each script's exact byte-for-byte output was a hard constraint of
 *   this refactor.
 */
import path from "node:path";

import { openContentDb, openContentDbReadOnly, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { AesGcmSecretSealer } from "../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../apps/website/src/features/webhooks/keyring.env.js";
import type { KeyringPort, SecretSealerPort } from "../../apps/website/src/features/webhooks/index.js";

import { resolveExistingDbPath } from "./backfill-db-path.js";

export interface AadBackfillArgs {
  readonly dbPath: string;
  readonly apply: boolean;
}

/**
 * Identical across all six scripts, including the default path when `--db` is omitted: every one of
 * them names a path this repo never creates, so a forgotten `--db` is refused by
 * `resolveExistingDbPath` rather than run against a real database. `defaultDbPath` stays a required
 * parameter rather than a shared constant so each script's default is visible in its own file.
 *
 * @complexity O(n) in argv length — one `indexOf` scan.
 */
export function parseAadBackfillArgs(argv: readonly string[], defaultDbPath: string): AadBackfillArgs {
  const dbFlag = argv.indexOf("--db");
  return {
    dbPath: dbFlag === -1 ? defaultDbPath : path.resolve(argv[dbFlag + 1]!),
    apply: argv.includes("--apply"),
  };
}

export interface SealedColumns {
  readonly keyId: string;
  readonly ciphertext: string;
  readonly nonce: string;
  readonly alg: string;
}

/**
 * One row's (or `external-mcp`'s one blob's) worth of work. `label` is already formatted by the
 * caller for logging (identity fields vary per store). `buildAad`/`write` are closures so this
 * module never needs to know a table's identity shape, AAD builder, or column names.
 */
export interface AadBackfillUnit {
  readonly label: string;
  readonly sealed: SealedColumns;
  /** Computes this unit's AAD. Not called for a dry run. */
  readonly buildAad: () => string;
  /** Writes this unit's own `sealed_*`/version columns. Not called for a dry run. */
  readonly write: (sealed: SealedColumns) => void;
}

export interface AadBackfillDeps {
  readonly db: ContentDb;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  /** Defaults to `console.log`. Injected so callers (tests, `main()`) can capture or silence
   *  progress output without this function knowing anything about where it goes. */
  readonly log?: (message: string) => void;
}

export interface AadBackfillResult {
  readonly migrated: number;
  readonly total: number;
}

/** Every operator-facing string a run needs, supplied verbatim by the calling script so this
 *  module never guesses at wording that differs per store (this file's own header). */
export interface AadBackfillMessages {
  readonly found: (pendingCount: number) => string;
  readonly dryRunUnit: (label: string) => string;
  readonly migratedUnit: (label: string) => string;
  readonly mismatch: (label: string) => string;
}

/**
 * The core per-unit upgrade shared by every `backfill-*-aad.ts` script. `opts.apply === false`
 * never touches `deps.sealer`/`deps.keyring` (it only counts and reports what it would do);
 * `opts.apply === true` decrypts under no aad, re-seals under the unit's own derived aad,
 * self-verifies, and writes ONE unit at a time so a crash mid-run leaves every already-migrated
 * unit correct and every other unit untouched.
 *
 * @throws Propagates a decrypt/seal/keyring failure, or this function's own post-seal verification
 *   mismatch — always BEFORE any write for the unit that failed.
 * @complexity O(n) in the pending unit count — one decrypt, one re-seal, one verify-open, and one
 *   write per unit; no nested iteration.
 */
export async function runAadBackfill(
  deps: AadBackfillDeps,
  opts: { apply: boolean },
  config: { loadPending: (db: ContentDb) => AadBackfillUnit[]; messages: AadBackfillMessages }
): Promise<AadBackfillResult> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const pending = config.loadPending(deps.db);
  log(config.messages.found(pending.length));

  let migrated = 0;
  for (const unit of pending) {
    if (!opts.apply) {
      migrated += 1;
      log(config.messages.dryRunUnit(unit.label));
      continue;
    }

    const plaintext = await deps.sealer.open({ sealed: unit.sealed });
    const aad = unit.buildAad();
    const activeKey = await deps.keyring.activeKey();
    const sealed = await deps.sealer.seal({ plaintext, key: activeKey, aad });

    const verifyPlaintext = await deps.sealer.open({ sealed, aad });
    if (verifyPlaintext !== plaintext) {
      throw new Error(config.messages.mismatch(unit.label));
    }

    unit.write(sealed);

    migrated += 1;
    log(config.messages.migratedUnit(unit.label));
  }

  return { migrated, total: pending.length };
}

/** Every operator-facing string `runAadBackfillMain` prints outside the per-unit loop — again
 *  supplied verbatim per script (this file's own header). */
export interface AadBackfillMainMessages extends AadBackfillMessages {
  readonly dryRunSummary: (result: AadBackfillResult) => string;
  readonly nothingToMigrate: () => string;
  readonly done: (result: AadBackfillResult) => string;
}

export interface AadBackfillMainConfig {
  readonly defaultDbPath: string;
  readonly restorePointScopeId: string;
  readonly loadPending: (db: ContentDb) => AadBackfillUnit[];
  readonly messages: AadBackfillMainMessages;
  /** Defaults to `console.log`/`console.error` — injected only so a script can override if it ever
   *  needs to, matching every script's own prior direct use of the `console` globals. */
  readonly print?: (message: string) => void;
}

/**
 * The `main()` skeleton shared by every `backfill-*-aad.ts` script: resolve `--db`, open
 * read-only and dry-run when `--apply` is absent, otherwise open normally, skip the restore point
 * when there is nothing pending, capture one when there is, then run `runAadBackfill` for real.
 *
 * Exit codes: `0` on success (including "nothing to do"); `1` if any unit fails to decrypt, fails
 * its post-seal verification, or this function otherwise throws — left to the caller's own
 * `main().catch(...)`, which this function does not wrap so each script keeps its own identical
 * top-level handler visible in its own file (readers should not need to open this module to see a
 * script's exit-code convention).
 *
 * @complexity O(n) in the pending unit count, delegated entirely to `runAadBackfill`.
 */
export async function runAadBackfillMain(argv: readonly string[], config: AadBackfillMainConfig): Promise<void> {
  const print = config.print ?? ((message: string) => console.log(message));
  const args = parseAadBackfillArgs(argv, config.defaultDbPath);
  // Prove the database is really there BEFORE opening it: `openContentDb` creates and migrates on
  // open, so a wrong path would otherwise yield an empty db and a false all-clear.
  const dbPath = resolveExistingDbPath(args.dbPath);

  if (!args.apply) {
    // Read-only open: a dry run must never migrate or write the bootstrap watermark row.
    const db = openContentDbReadOnly(dbPath);
    const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
    const sealer = new AesGcmSecretSealer(keyring);
    const result = await runAadBackfill({ db, sealer, keyring }, { apply: false }, config);
    print(config.messages.dryRunSummary(result));
    return;
  }

  const db = openContentDb(dbPath);
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);

  const pendingCount = config.loadPending(db).length;
  if (pendingCount === 0) {
    print(config.messages.nothingToMigrate());
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: config.restorePointScopeId });
  print(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  const result = await runAadBackfill({ db, sealer, keyring }, { apply: true }, config);
  print(config.messages.done(result));
}
