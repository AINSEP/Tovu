#!/usr/bin/env node
/**
 * @file `npm run seed:site` — turns the live `sites/<site>/content.db` into a small, committable
 * seed at `sites/<site>/content.seed.db`.
 *
 * WHY THIS EXISTS. `sites/` was un-gitignored (2026-08-31) so a deployed container ships with a
 * real site instead of an empty volume. But the live `content.db` accumulates operational/session
 * data without bound — on the day this was written, 34 MB of it, 96% of that a single table
 * (`ai_chat_messages.events_json`, dev chat transcripts). Committing the live file as-is would bloat
 * git history forever and leak real secrets (sealed provider API keys, a live OAuth grant, a GitHub
 * account name) and real PII (login IPs/user-agents, the owner's own name+email from test form
 * submissions). This script produces a pruned, VACUUMed copy that keeps every table a deployed site
 * actually needs to render and log in, and drops everything that is either operational history or a
 * secret with zero value to a fresh deploy.
 *
 * WHY TWO FILES, NOT ONE. `content.db` is the developer's own live, growing database — every
 * table/pragma assumption in `platform/db/sqlite/content-db.ts` and the CLI/composition-root boot
 * paths point at it by default, and it must never be treated as disposable. This script is not
 * allowed to write to it (see `assertLiveDbUntouched` below): it copies the live db to a scratch
 * location FIRST, prunes and VACUUMs the copy, and only ever writes the result to the separate
 * `content.seed.db` path. `.gitignore` now ignores every site's `content.db` itself (the live file) and
 * leaves `content.seed.db` trackable — see this repo's `.gitignore` for the paired comment. Getting
 * `content.seed.db` promoted to the literal `content.db` a fresh container boots from (or wiring
 * `TOVU_CONTENT_DB` to point at it directly) is a Dockerfile/entrypoint concern, deliberately left
 * out of this script — see this change's own report for the open coordination item.
 *
 * Usage: `npm run seed:site` (or `node --import tsx development/scripts/seed-site.mjs [--site <name>]`).
 * `--site` defaults to `TOVU_SITE`, then `"tovu-com"` — the same precedence
 * `platform/site-dir/site-root.ts`'s `resolveSiteRoot()` uses for its own `TOVU_SITE` fallback.
 * The tsx loader is there because this script imports one TypeScript module, the site-title pin reset
 * it shares with `duplicateSite` (SPEC-050 REQ-12/REQ-14), so both copy paths run the same SQL.
 */
import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resetLegacySiteTitlePin } from "../../apps/website/src/platform/db/sqlite/reset-legacy-site-title-pin.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Tables holding operational/audit history or live secrets — never needed to render or log into a
 * fresh deployed site, and in several cases actively unsafe to ship. Grouped and commented by why,
 * not alphabetically, so the reasoning stays attached to the list instead of living only here in
 * prose. `ai_chats` is listed even though its `ON DELETE CASCADE` already clears `ai_chat_messages`
 * and `assistant_agent_sessions` (both FK `conversation_id -> ai_chats.id`) — those two are still
 * deleted explicitly first, so pruning is correct even if `foreign_keys` were ever off.
 */
const PRUNE_TABLES = [
  // Dev chat transcripts. 96% of a live content.db's bytes on the day this was measured, and the
  // whole point of the exercise: real conversations, not demo content.
  "ai_chat_messages",
  "assistant_agent_sessions",
  "ai_chats",
  // Auth session log — real login IP/user-agent PII, no rendering role.
  "sessions",
  // Internal execution/audit/undo logs. Each has a live "current" table (posts, entries, settings,
  // ...) that already holds the authoritative state byte-for-byte; these are history ONLY, read by
  // admin "activity"/"revert" UI, which degrades to an honest empty state on a fresh site rather than
  // breaking. No FK references them (verified via `PRAGMA foreign_key_list` both directions), so
  // deleting them cannot orphan anything else.
  "agent_tool_attempts",
  "outbox_events",
  "change_set_items",
  "change_sets",
  "setting_revisions",
  "entry_revisions",
  "content_type_revisions",
  "redirect_revisions",
  "taxonomy_revisions",
  "member_revisions",
  "newsletter_campaign_revisions",
  // Live secrets: sealed (AES-256-GCM) provider API keys, a real GitHub account's publish token, a
  // real OAuth grant (client id + refresh ciphertext) to a third-party MCP server, and a revoked but
  // still-identifying API key issuance record. Every `sealed_ciphertext` column in `schema.ts` is
  // covered by one of the ten tables below (verified by grep — see the seed-site report for the
  // exact search). Two independent reasons to prune all of them, not just the ones with real rows
  // today: (1) a fresh deploy's operator configures their own, so the owner's, even sealed, must
  // never sit in git history; (2) the seal is an envelope encrypted against `TOVU_INTEGRATIONS_ROOT_KEY`
  // (`AesGcmSecretSealer`), which is per-environment — a deployed container almost certainly has a
  // DIFFERENT root key than whatever produced the seed, so a shipped sealed row would not just be
  // inert, it would be ciphertext that fails to decrypt at USE time, a far more confusing failure
  // than the honest "not configured yet" empty state pruning these tables produces instead.
  "admin_execution_credentials",
  "site_assistant_credentials",
  "publish_credential_sets",
  "external_mcp_servers",
  "composio_config",
  "composio_connector_credentials",
  "vendor_credential_sets",
  "media_provider_credentials",
  "custom_credential_sets",
  "source_control_credential_sets",
  "api_keys",
  // QA/dev test submissions. One row carries the site owner's own real name+email; the rest are
  // synthetic ("QA Regression Test", "Rate Limit Probe", ...). A fresh site's form inbox legitimately
  // starts empty — this is not "content" the way a published page is.
  "form_submissions",
];

/** @returns {{ siteName: string, liveDir: string, liveDbPath: string, seedDbPath: string }} */
function resolvePaths() {
  const siteFlagIndex = process.argv.indexOf("--site");
  const siteName = siteFlagIndex !== -1 ? process.argv[siteFlagIndex + 1] : (process.env.TOVU_SITE ?? "tovu-com");
  const liveDir = path.join(REPO_ROOT, "sites", siteName);
  return {
    siteName,
    liveDir,
    liveDbPath: path.join(liveDir, "content.db"),
    seedDbPath: path.join(liveDir, "content.seed.db"),
  };
}

/** @returns {{ size: number, mtimeMs: number }} */
function statLiveDb(liveDbPath) {
  if (!fs.existsSync(liveDbPath)) {
    throw new Error(`seed-site: no live content.db at ${liveDbPath} — nothing to seed from.`);
  }
  const stat = fs.statSync(liveDbPath);
  return { size: stat.size, mtimeMs: stat.mtimeMs };
}

/**
 * Plain filesystem copy of `content.db` and its WAL/SHM sidecars (whichever exist) into a fresh
 * scratch dir — never opens the live db, so nothing this script does can trigger a checkpoint,
 * journal, or any other write against it. This is the ONLY step that reads the live files.
 *
 * @returns the scratch copy's `content.db` path.
 */
function copyLiveDbToScratch(liveDir, scratchDir) {
  for (const name of ["content.db", "content.db-wal", "content.db-shm"]) {
    const source = path.join(liveDir, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(scratchDir, name));
  }
  return path.join(scratchDir, "content.db");
}

/**
 * Folds the scratch copy's WAL into its main file and confirms the result is a valid, consistent
 * database — on the SCRATCH copy only. `TRUNCATE` (not the default `PASSIVE`) so the pruned/VACUUMed
 * output below is never accompanied by a stray `-wal`/`-shm` sidecar.
 */
function checkpointAndVerify(db) {
  const [checkpoint] = db.pragma("wal_checkpoint(TRUNCATE)");
  if (checkpoint.busy !== 0) {
    throw new Error(`seed-site: WAL checkpoint on the scratch copy reported busy=${checkpoint.busy}; aborting.`);
  }
  const [integrity] = db.pragma("integrity_check");
  if (integrity.integrity_check !== "ok") {
    throw new Error(`seed-site: scratch copy failed integrity_check: ${JSON.stringify(integrity)}`);
  }
}

/** @returns the {@link PRUNE_TABLES} entries that actually exist as tables in `db` right now. */
function existingPruneTables(db) {
  const placeholders = PRUNE_TABLES.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
    .all(...PRUNE_TABLES);
  const present = new Set(rows.map((row) => row.name));
  return PRUNE_TABLES.filter((table) => present.has(table));
}

/**
 * Deletes every row of every table in {@link PRUNE_TABLES} that exists in `db`, and returns
 * `{ removed, skipped }`: `removed` is the per-table count deleted, `skipped` is the entries whose
 * table was not there to begin with.
 *
 * A table can legitimately be absent: `content-db.ts`'s `openContentDb` runs
 * `dropEmptyLegacyChatTables` on every open, which drops `ai_chat_messages`/
 * `assistant_agent_sessions`/`ai_chats` the moment they hold zero rows — true of every site that has
 * never chatted, including a brand-new one. An unconditional `DELETE FROM "<table>"` for those three
 * threw `SqliteError: no such table` in exactly that case; checking `sqlite_master` first (mirroring
 * `dropEmptyLegacyChatTables`'s own `existingChatTables` guard) makes "the table was already gone"
 * an expected, logged outcome rather than a crash. Which tables get pruned and the secret-table list
 * itself are unchanged — this only skips a DELETE against a table that isn't there.
 */
function pruneTransientTables(db) {
  const tablesToPrune = existingPruneTables(db);
  const skipped = PRUNE_TABLES.filter((table) => !tablesToPrune.includes(table));

  const removed = {};
  const pruneAll = db.transaction(() => {
    for (const table of tablesToPrune) {
      removed[table] = db.prepare(`DELETE FROM "${table}"`).run().changes;
    }
  });
  pruneAll();
  return { removed, skipped };
}

/**
 * Scrubs PII that survives table-level pruning because the row itself is legitimate demo content.
 * `identity_users` rows (including the real "admin" login) stay — a deployed site needs a login —
 * but `last_login_at` is the owner's own real login activity and has zero value to a fresh deploy.
 */
function scrubPii(db) {
  return db.prepare(`UPDATE identity_users SET last_login_at = NULL WHERE last_login_at IS NOT NULL`).run().changes;
}

/**
 * `VACUUM` rewrites the b-tree into fewer pages, but in WAL mode that rewrite lands in the WAL, not
 * the main file — `fs.statSync` on the main file (and a naive `fs.copyFileSync` of just that file)
 * would still see/copy the OLD, pre-VACUUM size until a checkpoint folds the WAL back in. Verified
 * empirically: without this second checkpoint, the on-disk main file was byte-identical to its
 * pre-VACUUM size even though `integrity_check` inside the same connection already reported the
 * pruned row counts — reopening the connection was the only thing that shrank it. Checkpointing here
 * (rather than relying on `db.close()` to do it implicitly) makes the shrink happen before this
 * function returns, so {@link publishSeed}'s plain file copy is never racing it.
 */
function vacuumAndVerify(db) {
  db.exec("VACUUM");
  checkpointAndVerify(db);
}

/**
 * Whether the file backing one `asset_blobs` row is actually a usable blob: a real, regular file
 * (not a directory, symlink, or other non-regular entry) whose BYTES really hash to the row's own
 * `sha256` column. `fs.existsSync()` alone answers neither question — it returns `true` for a
 * directory or a valid symlink, and says nothing about content — which is exactly how this check's
 * prior version let a directory or wrong-content file pass as a "blob" (see `findMissingSeedBlobs`'s
 * own doc for the incident this closes). Since `storage_key` is content-addressed
 * (`ws/{workspaceId}/blobs/{shard}/{sha256}`, `blob-key.ts`'s own template), the row's `sha256`
 * column IS the one comparison that actually means something: a file at the right path with the
 * wrong bytes is exactly as useless to a fresh deploy as no file at all.
 *
 * `lstatSync` (not `statSync`) deliberately does NOT follow a symlink — a symlink is exactly what
 * `hydrateBlobStoreFromSeed()`'s own directory walk on the runtime side already treats as "not a
 * blob" (its `readdir(..., { withFileTypes: true })` only ever picks up `entry.isFile()` dirents,
 * which report `false` for a symlink); this check uses the SAME definition of "valid blob" the
 * runtime consumer will use, rather than a looser one that could pass a symlink the hydrator would
 * then silently skip.
 *
 * @complexity O(n) full-file reads for n rows — this script is a low-frequency, developer-invoked
 *   build step (`npm run seed:site`), not a request path, and already loads/copies/VACUUMs the
 *   whole live db in-process, so a synchronous full-file hash per blob is consistent with its
 *   existing resource profile rather than a new concern this change introduces.
 */
function seedBlobIsValid(row, liveDir) {
  const filePath = path.join(liveDir, "uploads", row.storage_key);
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    return false; // ENOENT (or any other stat failure) — no file at all.
  }
  if (!stat.isFile()) return false; // a directory, symlink, or other non-regular entry.
  const actualSha256 = createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  return actualSha256 === row.sha256;
}

/**
 * Cross-checks the seed's remaining `asset_blobs` rows against `<site>/uploads/` on disk — every
 * row's `storage_key` must resolve to a real, correctly content-addressed regular file, or this
 * script would publish a seed that ships real `media`/`asset_blobs` ROWS with no way to ever get
 * their BYTES (the exact production incident this check exists to prevent: `content.seed.db` ships
 * regardless of whether `uploads/` has the matching file, since neither table is in
 * `PRUNE_TABLES`, but the Dockerfile's build stage only ships whatever `uploads/` actually
 * contains — see that file's own comment at the `uploads/` extraction step). Read-only against
 * `liveDir` — never writes there, mirrors this script's own "never touch the live tree" rule for
 * `liveDbPath`.
 *
 * Exported (2026-09-02) — `development/scripts/__tests__/seed-site.unit.test.ts` imports this
 * directly, mirroring `generate-seed-content.ts`'s `generate()`/`assertNoUndefinedProperties`
 * precedent for a pure, side-effect-free function pulled out specifically to be unit-testable
 * without running this script's real live-db-copying `main()` as an import side effect (see the
 * `main()` guard at the bottom of this file).
 *
 * @returns every `storage_key` whose file is missing, non-regular, or hash-mismatched — empty
 *   means consistent.
 */
export function findMissingSeedBlobs(db, liveDir) {
  const rows = db.prepare(`SELECT storage_key, sha256 FROM asset_blobs`).all();
  return rows.filter((row) => !seedBlobIsValid(row, liveDir)).map((row) => row.storage_key);
}

/** Atomically publishes the finished scratch copy to `seedDbPath` (write-then-rename, same dir/fs). */
function publishSeed(scratchDbPath, seedDbPath) {
  const tmpPath = `${seedDbPath}.tmp-${randomBytes(4).toString("hex")}`;
  fs.copyFileSync(scratchDbPath, tmpPath);
  fs.renameSync(tmpPath, seedDbPath);
}

/** @throws if the live db's size or mtime moved at all since {@link statLiveDb} was first called. */
function assertLiveDbUntouched(liveDbPath, before) {
  const after = fs.statSync(liveDbPath);
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
    throw new Error(
      `seed-site: LIVE db at ${liveDbPath} changed during this run ` +
        `(size ${before.size} -> ${after.size}, mtime ${before.mtimeMs} -> ${after.mtimeMs}). ` +
        "This script must never mutate it — treat this as a bug and do not trust the seed output."
    );
  }
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * The whole `npm run seed:site` flow for one site: copy the live db to scratch, prune, scrub and
 * reset the copy, check its blobs, publish it to `seedDbPath`, and prove the live db was never written.
 *
 * Exported (SPEC-050 REQ-14) so a test can run this exact flow against a temporary site directory;
 * {@link main} is the only caller that points it at the real `sites/<site>/`.
 *
 * @param {{ siteName: string, liveDir: string, liveDbPath: string, seedDbPath: string }} required
 * @throws if the live db is missing, a scratch-copy check fails, a blob is missing, or the live db
 *   changed during the run. Nothing is published unless every check before `publishSeed` passed.
 */
export function seedSite(required) {
  const { siteName, liveDir, liveDbPath, seedDbPath } = required;
  const liveStatBefore = statLiveDb(liveDbPath);

  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-seed-site-"));
  try {
    const scratchDbPath = copyLiveDbToScratch(liveDir, scratchDir);
    const db = new Database(scratchDbPath);
    try {
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      checkpointAndVerify(db);

      const { removed, skipped } = pruneTransientTables(db);
      const scrubbedLoginTimestamps = scrubPii(db);
      // SPEC-050 REQ-14: the legacy site-title marker and pin record THIS machine's migration history.
      // A deploy that hydrates its content.db from the seed is a different database and renders its
      // own name, so both are reset here, before the VACUUM that reclaims their pages.
      const siteTitleReset = resetLegacySiteTitlePin({ db });
      vacuumAndVerify(db);

      // Rows and bytes ship together or not at all — fail LOUD, before `publishSeed` ever runs, so
      // a broken seed is never written to `content.seed.db` in the first place. See
      // `findMissingSeedBlobs`'s own doc for the incident this prevents.
      const missingBlobs = findMissingSeedBlobs(db, liveDir);
      if (missingBlobs.length > 0) {
        throw new Error(
          `seed-site: ${missingBlobs.length} asset_blobs row(s) reference a storage_key with no file under ` +
            `${path.join(liveDir, "uploads")} — refusing to publish a seed that would ship media rows with ` +
            "permanently missing bytes. Missing:\n" +
            missingBlobs.map((key) => `  - ${key}`).join("\n")
        );
      }

      const seedSize = fs.statSync(scratchDbPath).size;
      publishSeed(scratchDbPath, seedDbPath);

      console.log(`seed-site: site "${siteName}"`);
      console.log(`  live db:  ${liveDbPath} (${formatMb(liveStatBefore.size)}, untouched)`);
      console.log(`  seed db:  ${seedDbPath} (${formatMb(seedSize)})`);
      console.log(
        `  pruned:   ${Object.entries(removed)
          .map(([table, count]) => `${table}=${count}`)
          .join(", ")}`
      );
      if (skipped.length > 0) {
        console.log(`  skipped:  ${skipped.join(", ")} (table(s) not present — nothing to prune)`);
      }
      console.log(`  scrubbed: identity_users.last_login_at nulled on ${scrubbedLoginTimestamps} row(s)`);
      console.log(
        `  site title: ${siteTitleReset.markerRowsDeleted} legacy marker row(s) and ${siteTitleReset.pinRowsDeleted} system pin(s) reset`
      );
      console.log(`  blobs:    every asset_blobs.storage_key has a matching file under ${path.join(liveDir, "uploads")}`);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }

  assertLiveDbUntouched(liveDbPath, liveStatBefore);
}

function main() {
  seedSite(resolvePaths());
}

// Only run when invoked directly, never as a side effect of import — mirrors
// generate-seed-content.ts's own guard, for the same reason: `findMissingSeedBlobs` above is also
// imported directly by this script's unit test, which must never copy/prune/publish the real live
// site db as a side effect of importing a pure function. `process.argv[1]` guarded rather than
// passed to `pathToFileURL` unconditionally: it is `undefined` under some non-CLI module-load paths
// (e.g. a plain `-e`/`--input-type=module` eval used to probe this file's exports), and
// `pathToFileURL(undefined)` throws — which would break every consumer that merely imports this
// module, not just direct CLI invocation.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
