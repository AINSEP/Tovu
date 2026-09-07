/**
 * Copies every `publish_credential_sets`/`source_control_credential_sets` row into the new
 * vendor-scoped `vendor_credential_sets` table (`src/platform/db/schema.ts`, migration `0045`), decrypting
 * each row under its OLD table's AAD and re-sealing the SAME plaintext bytes under the NEW table's
 * AAD (`buildVendorCredentialAad`).
 *
 * ## Why this cannot be a plain `.sql` migration
 *
 * Both source tables' `sealed_ciphertext` is AES-256-GCM, and the additional authenticated data
 * (AAD) bound into each row's auth tag is DERIVED, never stored — `buildPublishCredentialAad`/
 * `buildSourceControlCredentialAad` compute it from `(workspaceId, providerId, id)` at open time
 * (see `integrations/secret-sealer.aesgcm.ts`'s own file header). This migration changes the second
 * component from a destination id (`"github-pages"`) to a vendor id (`"github"`), which changes the
 * derived AAD string, which means the OLD ciphertext's auth tag no longer verifies once moved
 * without also being re-sealed. SQL cannot decrypt or re-encrypt a GCM ciphertext; only application
 * code holding the real root key can. This script is that application code.
 *
 * ## Safety
 *
 * Dry-run by default; `--apply` is required to write, and even then only after a restore point is
 * captured (`SqliteDbOpsAdapter`, the same online-backup mechanism
 * `backfill-slug-collision-defaults.ts` already uses) — skipped entirely when there is nothing
 * pending, same as that script's own posture. A `--db` that does not resolve to a real,
 * already-existing file (the default included) fails loudly via `resolveExistingDbPath` before
 * anything is opened — `openContentDb` creates-and-migrates on open, so a typo'd path used to open
 * (and migrate) a brand-new empty database and report "nothing to migrate" instead of the real
 * problem. A dry run itself opens strictly read-only (`openContentDbReadOnly`), so unlike an
 * ordinary `openContentDb` open it never migrates the schema either — only `--apply` does.
 *
 * `publish_credential_sets`/`source_control_credential_sets` are NEVER written to by this script —
 * only read. Every existing route/tool/store keeps reading and writing them exactly as before; the
 * cutover that points them at `vendor_credential_sets` instead, and the eventual migration that
 * drops the two old tables, are separate, later work (see `src/platform/db/schema.ts`'s
 * `vendorCredentialSets` doc). Because the old tables are never mutated, a crash or `Ctrl-C`
 * mid-run cannot lose a row: whatever was inserted into `vendor_credential_sets` before the
 * interruption stays there (harmless — that table has no reader yet), and whatever was not yet
 * processed is still sitting, completely unchanged, in its original table, exactly as before this
 * script ever ran.
 *
 * Idempotent: every row this script would insert is checked against `vendor_credential_sets` by its
 * own `(workspace_id, id)` first (the id is copied verbatim from the source row — see "Row identity"
 * below) — a row already present is SKIPPED, never re-sealed, never re-inserted, so an interrupted
 * or repeated `--apply` run always converges to "every source row has exactly one target row" and
 * then stops changing anything.
 *
 * Post-seal self-check: immediately after re-sealing a row and BEFORE inserting it, this script
 * opens its own freshly-sealed ciphertext back with the exact same new AAD and asserts the decrypted
 * plaintext is byte-identical to what was decrypted from the OLD row. A row that fails this check is
 * never written — this is the difference between "the row moved" and "the row is provably openable",
 * which is the whole point of this script (see this repo's own dispatch notes on why "moved but
 * unopenable" is the failure mode that matters here, not a hypothetical one).
 *
 * ## Row identity, vendor mapping, label collisions, and `is_default`
 *
 * - **id**: copied verbatim from the source row. A `publish_credential_sets` row and a
 *   `source_control_credential_sets` row are always minted from independent UUID generators, so an
 *   accidental collision between the two source tables is not a realistic concern; reusing the id
 *   keeps the migrated row traceable back to its origin without inventing a new identifier scheme.
 * - **vendor mapping**: `PUBLISH_PROVIDER_TO_VENDOR`/`SOURCE_CONTROL_PROVIDER_TO_VENDOR`
 *   (`src/features/vendor-credentials/types.ts`) — both are `Record`s over their OLD provider-id
 *   union, so an unmapped provider id is a compile-time error in that file, not a runtime surprise
 *   here.
 * - **label collisions**: EXPECTED, not an edge case — every row in both source tables was written
 *   by an admin UI that hardcoded the literal label `"default"` (`PUBLISH_CREDENTIAL_ROW_LABEL`/
 *   `SOURCE_CONTROL_CREDENTIAL_ROW_LABEL`), so a workspace with both a `github-pages` publish
 *   credential and a `github` source-control credential will very commonly try to migrate TWO rows
 *   into the same `(workspace_id, vendor_id="github")` group both labeled `"default"` — and
 *   `vendor_credential_sets` enforces `UNIQUE (workspace_id, vendor_id, label)`. `publish_credential_
 *   sets` rows are processed first (deterministic), so a colliding label from
 *   `source_control_credential_sets` is disambiguated by appending `" (Source Control)"`; a further
 *   collision (e.g. two Source Control rows sharing the same colliding label — not possible from
 *   today's two-table data model, but not assumed impossible either) appends the row's own id prefix,
 *   which is always unique by construction. Same resolution algorithm on every run — this is what
 *   keeps the script idempotent even though the OUTPUT label can differ from the INPUT label.
 * - **`is_default`**: both source tables independently guarantee "at most one default per
 *   `(workspace_id, OLD provider_id)`" — but merging two providers into one vendor group can produce
 *   two independently-true defaults for the SAME vendor (e.g. a `github-pages` default AND a
 *   `github` source-control default both `true`), which `vendor_credential_sets` does not allow to
 *   coexist. Same first-writer-wins resolution as labels: the first row processed for a group that
 *   requests `is_default` keeps it; any later row for the same group is inserted as
 *   `is_default = false`, even if it was the source table's own default. Nothing reads
 *   `vendor_credential_sets` yet (this script has no live consumer to break), so this is a safe,
 *   fully reversible default to leave for a human to revisit in the admin UI once Phase 2 wires a
 *   picker — it is explicitly NOT this script's job to invent a "second default" concept.
 * - **`token_tail`**: the last four characters of the connection's primary secret — `token` for
 *   every vendor except `s3-compatible`, whose bearer-token-shaped field is `secretAccessKey`
 *   instead (see `src/platform/db/schema.ts`'s `vendorCredentialSets.tokenTail` doc). Derived from the SAME
 *   decrypted plaintext being re-sealed, never a separate read.
 *
 * ## Usage
 *
 *   npx tsx development/scripts/backfill-vendor-credentials.ts                (dry run)
 *   npx tsx development/scripts/backfill-vendor-credentials.ts --apply
 *   npx tsx development/scripts/backfill-vendor-credentials.ts --db <path> --apply
 *
 * `--apply` requires `TOVU_INTEGRATIONS_ROOT_KEY` to be set to the SAME root key the live server
 * uses (`EnvOrFileKeyring({ allowFileFallback: false })` — identical construction to
 * `server/deps.ts`'s `siteAssistantSecretKeyring`, the actual instance `publish-credentials/
 * store.ts`/`source-control/store.ts` seal and open through today). Sealing under any OTHER key
 * would produce a `vendor_credential_sets` row nothing in production could ever open — this script
 * deliberately does not fall back to a generated key file (`allowFileFallback: false`) so a missing
 * env var fails loudly instead of silently minting an unrelated key. A dry run never touches the
 * keyring at all (see `runVendorCredentialBackfill`'s own doc), so it needs no env var.
 *
 * Exit codes: `0` on success (including "nothing to do"); `1` if any row fails to decrypt, fails its
 * post-seal verification, or the process otherwise throws — this script never partially writes a row
 * it cannot prove round-trips.
 */
import path from "node:path";

import { openContentDb, openContentDbReadOnly, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { publishCredentialSets, sourceControlCredentialSets, vendorCredentialSets } from "../../apps/website/src/platform/db/schema.js";
import { resolveExistingDbPath } from "./backfill-db-path.js";
import { AesGcmSecretSealer } from "../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../apps/website/src/features/webhooks/keyring.env.js";
import type { KeyringPort, SecretSealerPort } from "../../apps/website/src/features/webhooks/ports.js";
import { buildPublishCredentialAad } from "../../apps/website/src/features/deployments/publish-credentials/aad.js";
import type { PublishProviderId } from "../../apps/website/src/features/deployments/publish-credentials/types.js";
import { buildSourceControlCredentialAad } from "../../apps/website/src/features/source-control/aad.js";
import type { SourceControlProviderId } from "../../apps/website/src/features/source-control/types.js";
import { buildVendorCredentialAad } from "../../apps/website/src/features/vendor-credentials/aad.js";
import { PUBLISH_PROVIDER_TO_VENDOR, SOURCE_CONTROL_PROVIDER_TO_VENDOR, type VendorId } from "../../apps/website/src/features/vendor-credentials/types.js";
import { resolveLabel, type GroupState, type Origin } from "./backfill-vendor-credentials-helpers.js";

// Re-exported so every caller keeps importing from this one file — see
// `backfill-vendor-credentials-helpers.ts`'s own header for why `resolveLabel`/`GroupState`/`Origin`
// live in a separate, side-effect-free module in the first place (this script's own `main()` runs
// unconditionally at import time, which a direct in-process unit test must never trigger).
export { resolveLabel, type GroupState, type Origin };

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

interface Args {
  readonly dbPath: string;
  readonly apply: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const dbFlag = argv.indexOf("--db");
  return {
    dbPath: dbFlag === -1 ? path.join(REPO_ROOT, "infra", "content.db") : path.resolve(argv[dbFlag + 1]),
    apply: argv.includes("--apply"),
  };
}

/** One source-table row, normalized to the shape this script's merge logic needs — a origin tag,
 *  the mapped `VendorId`, and the OLD AAD already computed (each origin uses its own table's own
 *  AAD builder — see this file's own header for why the two cannot be unified before this pass). */
interface SourceRow {
  readonly origin: Origin;
  readonly workspaceId: string;
  readonly id: string;
  readonly vendorId: VendorId;
  readonly label: string;
  readonly sealed: { keyId: string; ciphertext: string; nonce: string; alg: string };
  readonly oldAad: string;
  readonly isDefault: boolean;
  readonly accountLabel: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Every row from both source tables, normalized and merged — `publish_credential_sets` rows FIRST,
 * `source_control_credential_sets` rows second. That order is load-bearing, not incidental: it is
 * what makes label-collision and `is_default` disambiguation deterministic (this file's own header).
 *
 * @complexity O(p + s) — p publish rows, s source-control rows, both inherently small (this
 *   codebase's own established "bounded by how many connections a human bothers to save" reasoning,
 *   restated on both source tables' own `listByWorkspace` doc comments).
 */
function loadSourceRows(db: ContentDb): SourceRow[] {
  const fromPublish: SourceRow[] = db
    .select()
    .from(publishCredentialSets)
    .all()
    .map((row) => ({
      origin: "publish" as const,
      workspaceId: row.workspaceId,
      id: row.id,
      vendorId: PUBLISH_PROVIDER_TO_VENDOR[row.providerId as PublishProviderId],
      label: row.label,
      sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
      oldAad: buildPublishCredentialAad({ workspaceId: row.workspaceId, providerId: row.providerId as PublishProviderId, id: row.id }),
      isDefault: row.isDefault,
      accountLabel: row.accountLabel,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

  const fromSourceControl: SourceRow[] = db
    .select()
    .from(sourceControlCredentialSets)
    .all()
    .map((row) => ({
      origin: "source-control" as const,
      workspaceId: row.workspaceId,
      id: row.id,
      vendorId: SOURCE_CONTROL_PROVIDER_TO_VENDOR[row.providerId as SourceControlProviderId],
      label: row.label,
      sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
      oldAad: buildSourceControlCredentialAad({ workspaceId: row.workspaceId, providerId: row.providerId as SourceControlProviderId, id: row.id }),
      isDefault: row.isDefault,
      accountLabel: row.accountLabel,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

  return [...fromPublish, ...fromSourceControl];
}

function groupKey(workspaceId: string, vendorId: VendorId): string {
  return `${workspaceId}\u0000${vendorId}`;
}

interface TargetState {
  readonly migratedIds: Set<string>;
  readonly groups: Map<string, GroupState>;
}

/** Reads the CURRENT `vendor_credential_sets` contents into the two structures every later decision
 *  in this script needs: which `(workspace_id, id)` pairs are already migrated (skip them), and
 *  which labels/default-slots are already taken per vendor group (never collide with, or duplicate,
 *  an already-migrated row). Called once per run — cheap, same small-collection reasoning as
 *  {@link loadSourceRows}. */
function loadTargetState(db: ContentDb): TargetState {
  const rows = db.select().from(vendorCredentialSets).all();
  const migratedIds = new Set<string>();
  const groups = new Map<string, GroupState>();
  for (const row of rows) {
    migratedIds.add(`${row.workspaceId}\u0000${row.id}`);
    const key = groupKey(row.workspaceId, row.vendorId as VendorId);
    const state = groups.get(key) ?? { takenLabels: new Set<string>(), hasDefault: false };
    state.takenLabels.add(row.label);
    if (row.isDefault) state.hasDefault = true;
    groups.set(key, state);
  }
  return { migratedIds, groups };
}

/** Extracts `token_tail` from the just-decrypted plaintext — `secretAccessKey` for `s3-compatible`
 *  (the only vendor whose primary secret is not called `token`), `token` for every other vendor. See
 *  `src/platform/db/schema.ts`'s `vendorCredentialSets.tokenTail` doc for the full reasoning.
 *
 * @throws If the expected field is missing or not a non-empty string — a decrypted connection that
 *   fails this shape check is corrupt or was sealed by code this script does not recognize, and
 *   this script must never guess or default a tail for it.
 * @complexity O(1).
 */
function deriveTokenTail(plaintext: string, vendorId: VendorId): string {
  const parsed = JSON.parse(plaintext) as Record<string, unknown>;
  const field = vendorId === "s3-compatible" ? parsed.secretAccessKey : parsed.token;
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`cannot derive token_tail for vendor '${vendorId}': expected a non-empty string secret field in the decrypted connection`);
  }
  return field.slice(-4);
}

export interface VendorCredentialBackfillDeps {
  readonly db: ContentDb;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  /** Defaults to `console.log`. Injected so callers (tests, `main()`) can capture or silence
   *  progress output without this function knowing anything about where it goes. */
  readonly log?: (message: string) => void;
}

export interface VendorCredentialBackfillResult {
  readonly migrated: number;
  readonly skipped: number;
  readonly total: number;
}

/**
 * The core merge — see this file's header for the full design. `opts.apply === false` NEVER touches
 * `deps.sealer`/`deps.keyring` (it only reads both source tables and the target table, and reports
 * what it would do); `opts.apply === true` decrypts, re-seals, self-verifies, and inserts one row at
 * a time, already-migrated rows skipped.
 *
 * @throws Propagates whatever `deps.sealer.open`/`deps.sealer.seal`/`deps.keyring.activeKey()`
 *   throws (a genuine decrypt failure or an unconfigured root key), `deriveTokenTail`'s shape error,
 *   or this function's own post-seal verification mismatch — always BEFORE any write for the row
 *   that failed, and never swallowed into a partial or best-guess result. A caller (this file's own
 *   `main()`) that wants a "stop at the first failure" script — the correct behavior for an
 *   irreversible-secret migration — gets it for free by simply not catching this.
 * @complexity O(n) in the total row count across both source tables — one decrypt, one derive, one
 *   re-seal, one verify-open, and one insert per row that is not already migrated; no nested
 *   iteration over the row collection itself.
 */
export async function runVendorCredentialBackfill(deps: VendorCredentialBackfillDeps, opts: { apply: boolean }): Promise<VendorCredentialBackfillResult> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const sourceRows = loadSourceRows(deps.db);
  log(`Found ${sourceRows.length} row(s) across publish_credential_sets + source_control_credential_sets.`);

  const { migratedIds, groups } = loadTargetState(deps.db);

  let migrated = 0;
  let skipped = 0;

  for (const row of sourceRows) {
    const targetKey = `${row.workspaceId}\u0000${row.id}`;
    if (migratedIds.has(targetKey)) {
      skipped += 1;
      log(`SKIPPED (already migrated): origin=${row.origin} workspace=${row.workspaceId} id=${row.id} vendor=${row.vendorId}`);
      continue;
    }

    if (!opts.apply) {
      migrated += 1;
      log(`DRY RUN: would migrate origin=${row.origin} workspace=${row.workspaceId} id=${row.id} vendor=${row.vendorId} -> vendor_credential_sets`);
      continue;
    }

    const plaintext = await deps.sealer.open({ sealed: row.sealed, aad: row.oldAad });
    const tokenTail = deriveTokenTail(plaintext, row.vendorId);

    const key = groupKey(row.workspaceId, row.vendorId);
    const state = groups.get(key) ?? { takenLabels: new Set<string>(), hasDefault: false };
    const label = resolveLabel(row.label, state, row.origin, row.id);
    const isDefault = row.isDefault && !state.hasDefault;

    const newAad = buildVendorCredentialAad({ workspaceId: row.workspaceId, vendorId: row.vendorId, id: row.id });
    const activeKey = await deps.keyring.activeKey();
    const sealed = await deps.sealer.seal({ plaintext, key: activeKey, aad: newAad });

    // Post-seal self-check (this file's own header) — never insert a row this process cannot itself
    // prove re-opens to the exact plaintext it just sealed.
    const verifyPlaintext = await deps.sealer.open({ sealed, aad: newAad });
    if (verifyPlaintext !== plaintext) {
      throw new Error(
        `vendor-credential backfill: post-seal verification mismatch for workspace=${row.workspaceId} id=${row.id} — refusing to write a row that cannot be proven to re-open correctly`
      );
    }

    deps.db
      .insert(vendorCredentialSets)
      .values({
        id: row.id,
        workspaceId: row.workspaceId,
        vendorId: row.vendorId,
        label,
        sealedKeyId: sealed.keyId,
        sealedCiphertext: sealed.ciphertext,
        sealedNonce: sealed.nonce,
        sealedAlg: sealed.alg,
        tokenTail,
        isDefault,
        accountLabel: row.accountLabel,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
      .run();

    state.takenLabels.add(label);
    if (isDefault) state.hasDefault = true;
    groups.set(key, state);
    migratedIds.add(targetKey);

    migrated += 1;
    log(`MIGRATED: origin=${row.origin} workspace=${row.workspaceId} id=${row.id} vendor=${row.vendorId} label='${label}' isDefault=${isDefault}`);
  }

  return { migrated, skipped, total: sourceRows.length };
}

/** Read-only pending-row count — used by `main()` to decide whether an `--apply` run has anything to
 *  do BEFORE paying for a restore-point capture, same "skip the backup when there's nothing to back
 *  up for" posture `backfill-slug-collision-defaults.ts`'s own `main()` already follows. */
function countPending(db: ContentDb): number {
  const sourceRows = loadSourceRows(db);
  const { migratedIds } = loadTargetState(db);
  return sourceRows.filter((row) => !migratedIds.has(`${row.workspaceId}\u0000${row.id}`)).length;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Prove the database is really there BEFORE opening it: `openContentDb` creates-and-migrates on
  // open, so a mistyped path would otherwise open (and migrate) a brand-new empty database and
  // report a false "nothing to migrate" instead of the real problem — no such database.
  const dbPath = resolveExistingDbPath(args.dbPath);
  // A dry run must never migrate the schema — which `openContentDb` does unconditionally. Only
  // `--apply` gets the read-write, migrating open; every dry run opens strictly read-only.
  const db = args.apply ? openContentDb(dbPath) : openContentDbReadOnly(dbPath);
  // Constructed unconditionally but touches no env var until `sealer.open`/`sealer.seal` is actually
  // called (`EnvOrFileKeyring`'s own doc) — a dry run below never calls either, so a dry run needs no
  // `TOVU_INTEGRATIONS_ROOT_KEY` at all.
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);

  if (!args.apply) {
    const result = await runVendorCredentialBackfill({ db, sealer, keyring }, { apply: false });
    console.log(
      `DRY RUN: ${result.migrated} row(s) would be migrated, ${result.skipped} already migrated, ${result.total} total source row(s). Re-run with --apply to write.`
    );
    return;
  }

  const pending = countPending(db);
  if (pending === 0) {
    console.log("Nothing to migrate — every publish_credential_sets/source_control_credential_sets row already has a vendor_credential_sets counterpart.");
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: "backfill-vendor-credentials" });
  console.log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  const result = await runVendorCredentialBackfill({ db, sealer, keyring }, { apply: true });
  console.log(`Done: ${result.migrated} row(s) migrated, ${result.skipped} already migrated, ${result.total} total source row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
