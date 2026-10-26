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
import { relocateProjectDb, type ProjectFiles, type RelocateOptions } from "./project-store-relocate.js";
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

/**
 * The database + key this start uses: the project's own folder, after moving a first-layout file
 * there (`relocateProjectDb`; the old pair only for a run where another process still holds it open).
 */
export function resolveProjectFiles(required: { home: string; sitesHome: string; projectId: string }, optional: RelocateOptions = {}): ProjectFiles {
  return relocateProjectDb({ from: legacyProjectFiles(required),
    to: { dbPath: projectDbPath(required), keyFile: projectKeyFilePath(required) } }, optional);
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

/** A stable id for the project at this sites root: the same for web and desktop (same root), opaque. */
export function projectIdFor({ sitesHome }: { sitesHome: string }, _optional: Record<string, never> = {}): string {
  return `project-${createHash("sha256").update(path.resolve(sitesHome)).digest("hex").slice(0, 16)}`;
}

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
  const projectId = projectIdFor({ sitesHome: required.sitesHome });
  const { dbPath, keyFile } = resolveProjectFiles({ home: required.home, sitesHome: required.sitesHome, projectId }, optional.relocate);
  const hex = ensureProjectKey({ keyFile });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = openNativeSqlite(dbPath, {});
  // The same pragmas every site database opener sets (`chat-db.ts`, `content-db.ts`): web and desktop
  // hold this file open together, so WAL readers never block on a writer, and a briefly held lock is
  // retried rather than thrown.
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  const kernel = sqliteKernel<SecretsVaultDatabase>(db);
  try {
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
