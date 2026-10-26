import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";

import { createAgentPluginStateStore } from "#src/features/api-connections/plugin-state";
import { createApiConnectionVault } from "#src/features/api-connections/vault-stores";
import { FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { atomicCreateSiteKeyFile, mintSiteKeyHex } from "#src/features/webhooks/site-key-ensure";
import { closeSqliteConnection, openNativeSqlite, sqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { migrateProjectDatabase } from "#src/platform/db/migrations/index";
import { openProjectDb, relocateProjectDb, type ProjectDbOpener, type ProjectFiles, type RelocateOptions } from "./project-store-relocate.js";
import { createVaultProviderConfigSource, type ProviderConfigSource } from "./provider-config-source.js";

/**
 * @file The PROJECT store (owner decisions 2026-10-25): one `project.db` shared by every site of a
 * project, used by BOTH the local web app (`development/scripts/dev.mjs`) and the desktop app. Both
 * run this same server composition, and both find their sites through the same shared sites root
 * (`platform/site-dir/sites-home.ts`'s `resolveSitesHome`: `TOVU_SITES_HOME`, else the saved
 * `~/.tovu/sites-home.json`, else `~/Documents/Tovu`; desktop's child process shares its profile via
 * `TOVU_DESKTOP_USER_DATA_DIR`). The project id is a hash of that root, so
 * `~/.tovu/projects/<projectId>/project.db` is the SAME file whichever starts. Never desktop
 * app-data, and (owner, 8:05 PM) never the sites root itself: that is often iCloud-synced
 * `~/Documents`, and a live SQLite file with its -wal must not sync. A file left in the sites root by
 * the first layout is moved here on the next start (`project-store-relocate.ts`).
 *
 * Rows: the same `secrets_vault` shape as a site's (workspace `'project'`, no FK to site tables), own
 * migration ledger (`tovu_project_migrations`, `migrations/project/`), sealed with the project key
 * `project-key.hex` in the same folder, minted here like the site key (32 random bytes, hex, file
 * mode 0600, never exported, never inside a site folder). One key per project rather than the first
 * layout's single `~/.tovu/project-key.hex`: a project folder then holds its database and the key that
 * opens it together (removed, backed up or restored as one), and one project's key never opens
 * another's rows. Fly / single-site production has no project store: there the project IS the site
 * and the site vault answers (`provider-config-source.ts`).
 */

export const PROJECT_WORKSPACE_ID = "project";
export const PROJECT_DB_FILENAME = "project.db";

const PROJECT_KEY_FILENAME = "project-key.hex";

/** `~/.tovu/projects/<projectId>/` — the project's database and its key, outside every site folder. */
function projectDir({ home, projectId }: { home: string; projectId: string }): string {
  return path.join(home, ".tovu", "projects", projectId);
}

/** `~/.tovu/projects/<projectId>/project.db`. */
export function projectDbPath(required: { home: string; projectId: string }, _optional: Record<string, never> = {}): string {
  return path.join(projectDir(required), PROJECT_DB_FILENAME);
}

/** `~/.tovu/projects/<projectId>/project-key.hex`, beside the database it seals. */
export function projectKeyFilePath(required: { home: string; projectId: string }, _optional: Record<string, never> = {}): string {
  return path.join(projectDir(required), PROJECT_KEY_FILENAME);
}

/** The first layout's pair: `<sites root>/project.db` sealed with the single `~/.tovu/project-key.hex`. */
export function legacyProjectFiles({ home, sitesHome }: { home: string; sitesHome: string }, _optional: Record<string, never> = {}): ProjectFiles {
  return { dbPath: path.join(sitesHome, PROJECT_DB_FILENAME), keyFile: path.join(home, ".tovu", PROJECT_KEY_FILENAME) };
}

/** The project's own pair: `~/.tovu/projects/<projectId>/{project.db, project-key.hex}`. */
const projectFiles = (required: { home: string; projectId: string }): ProjectFiles =>
  ({ dbPath: projectDbPath(required), keyFile: projectKeyFilePath(required) });

/**
 * The database + key this start uses: the project's own folder, after moving a first-layout file
 * there (`relocateProjectDb`; the old pair only for a run where another process still holds it open).
 */
export function resolveProjectFiles(required: { home: string; sitesHome: string; projectId: string }, optional: RelocateOptions = {}): ProjectFiles {
  return relocateProjectDb({ from: legacyProjectFiles(required), to: projectFiles(required) }, optional);
}

const KEY_HEX = /^[0-9a-f]{64}$/;

/**
 * Holds an existing key file to the site key's own policy: a regular file (a symlink could point
 * anywhere), owned by this OS user, and no broader than 0600. A wider mode (a key restored or copied
 * as 0644) is narrowed rather than refused, since narrowing loses nothing; the other two are refused.
 */
function checkKeyFile(file: string, uid: (() => number) | undefined): void {
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error(`the project key at ${file} is not a regular file; replace it with the key file itself`);
  if (uid && stat.uid !== uid()) throw new Error(`the project key at ${file} is owned by another user; restore your own copy`);
  if ((stat.mode & 0o077) !== 0) fs.chmodSync(file, 0o600);
}

/**
 * Reads the project key, minting it on first use through the site key's publisher
 * (`atomicCreateSiteKeyFile`: a private fsynced temp file linked into place), so a concurrent first
 * start (web and desktop together) converges on whichever key landed first, and an opener never
 * sees the final file before its bytes are in.
 * @param optional.uid This process's OS user (`process.getuid`; absent on Windows: no owner check).
 * @throws When the file exists but does not hold a 64-hex key (never silently replaced: rows sealed
 *   with the old key would become unreadable), is not a regular file, or belongs to another user.
 * @complexity O(1) file I/O.
 */
export function ensureProjectKey({ keyFile: file }: { keyFile: string }, optional: { mint?: () => string; uid?: () => number } = {}): string {
  if (!fs.existsSync(file)) atomicCreateSiteKeyFile(file, (optional.mint ?? mintSiteKeyHex)());
  checkKeyFile(file, optional.uid ?? process.getuid);
  const hex = fs.readFileSync(file, "utf8").trim();
  if (!KEY_HEX.test(hex)) throw new Error(`the project key file at ${file} does not hold a 64-character hex key; restore it from a backup`);
  return hex;
}

const idOfPath = (root: string): string => `project-${createHash("sha256").update(root).digest("hex").slice(0, 16)}`;

/**
 * The root as the filesystem names it: `realpath` (native: symlinks resolved, and on macOS/Windows the
 * on-disk case, drive letter included) of the nearest folder that exists, plus the rest as spelled.
 * The filesystem decides what is "the same folder", so a case-sensitive disk keeps two cases apart.
 * @complexity O(depth) stats.
 */
function canonicalRoot(root: string): string {
  const rest: string[] = [];
  for (let head = root; ; head = path.dirname(head)) {
    try {
      return path.join(fs.realpathSync.native(head), ...rest);
    } catch {
      if (path.dirname(head) === head) return root;
      rest.unshift(path.basename(head));
    }
  }
}

/**
 * A stable id for the project at this sites root: the same for web and desktop however each spells
 * the root (TOVU_SITES_HOME vs `sites-home.json`, a symlinked root, another case, a drive letter's
 * case), opaque. A hash of the canonical root ({@link canonicalRoot}), not of a stored id file: a file
 * in the sites root would sync (iCloud) and be copied with it, and a root that is already canonical
 * keeps exactly the id it had before (the hash input is unchanged), so no existing store moves.
 */
export function projectIdFor({ sitesHome }: { sitesHome: string }, _optional: Record<string, never> = {}): string {
  return idOfPath(canonicalRoot(path.resolve(sitesHome)));
}

/**
 * The id this start uses. A store saved under the first layout's id for this spelling (a hash of the
 * root as spelled) is renamed to the canonical id, so its settings and key are kept. When the rename
 * can't happen (Windows: a file inside is open), the old id is used for this run; when both ids
 * already hold a store, the canonical one wins and the other is named in a warning.
 * @complexity O(depth) stats plus one rename.
 */
function adoptSpelledProjectId(required: { home: string; sitesHome: string }): string {
  const projectId = projectIdFor(required);
  const spelledId = idOfPath(path.resolve(required.sitesHome));
  const spelledDir = projectDir({ home: required.home, projectId: spelledId });
  if (spelledId === projectId || !fs.existsSync(spelledDir)) return projectId;
  const canonicalDir = projectDir({ home: required.home, projectId });
  if (fs.existsSync(canonicalDir)) {
    console.warn(`[project-store] two stores for one sites root; using ${canonicalDir}, ${spelledDir} is left as it is`);
    return projectId;
  }
  try {
    fs.renameSync(spelledDir, canonicalDir);
  } catch {
    // Another start renamed it first (fine), or it can't move now: use it where it is this run.
    if (!fs.existsSync(canonicalDir) && fs.existsSync(spelledDir)) return spelledId;
  }
  return projectId;
}

type NativeDb = ReturnType<typeof openNativeSqlite>;

/** Opens a project.db with the same pragmas every site database opener sets; an old-place file only if it exists. */
const sqliteOpener: ProjectDbOpener<NativeDb> = {
  open({ files, mustExist }) {
    const db = openNativeSqlite(files.dbPath, { fileMustExist: mustExist });
    try {
      // The same pragmas every site database opener sets (`chat-db.ts`, `content-db.ts`): web and desktop
      // hold this file open together, so WAL readers never block on a writer, and a briefly held lock is
      // retried rather than thrown.
      db.pragma("busy_timeout = 5000");
      db.pragma("journal_mode = WAL");
    } catch (error) {
      closeSqliteConnection(db);
      throw error;
    }
    return db;
  },
  close: (db) => closeSqliteConnection(db),
};

export interface ProjectStore {
  readonly projectId: string;
  readonly config: ProviderConfigSource;
  readonly dbPath: string;
  close(required: Record<string, never>, optional?: Record<string, never>): void;
}

/**
 * Opens (creating when absent) and migrates `project.db`, and returns its provider-settings adapter.
 * @param required.sitesHome The shared sites root (`resolveSitesHome`).
 * @param required.home The OS user's home (`os.homedir()`: HOME, or USERPROFILE on Windows), where
 *   `~/.tovu/projects/<projectId>/` lives.
 * @param optional.relocate Seams for moving a first-layout file (`project-store-relocate.ts`).
 * @complexity O(m) pending migrations; O(file size) once, when a first-layout file is moved.
 */
export async function openProjectStore(
  required: { sitesHome: string; home: string },
  optional: { clock?: { nowMs(): number }; relocate?: RelocateOptions } = {},
): Promise<ProjectStore> {
  const projectId = adoptSpelledProjectId(required);
  const { files: { dbPath, keyFile }, db } = openProjectDb({ from: legacyProjectFiles(required),
    to: projectFiles({ home: required.home, projectId }), opener: sqliteOpener }, optional.relocate);
  const kernel = sqliteKernel<SecretsVaultDatabase>(db);
  let hex: string;
  try {
    hex = ensureProjectKey({ keyFile });
    await migrateProjectDatabase(kernel as unknown as StorageKernel<unknown>);
  } catch (error) {
    closeSqliteConnection(db);
    throw error;
  }
  const keyring = new FixedSiteKeyKeyring(hex);
  const vault = createApiConnectionVault({ repo: new SqlSecretsVaultRepo({ kernel }), keyring, sealer: new AesGcmSecretSealer(keyring),
    clock: optional.clock ?? { nowMs: () => Date.now() }, workspaceId: PROJECT_WORKSPACE_ID });
  const config = createVaultProviderConfigSource({ workspaceId: PROJECT_WORKSPACE_ID, scope: "project",
    state: createAgentPluginStateStore({ vault, workspaceId: PROJECT_WORKSPACE_ID }) });
  return { projectId, config, dbPath, close: () => closeSqliteConnection(db) };
}
