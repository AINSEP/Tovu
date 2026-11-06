import { providerKeyId } from "#src/features/project-keys/service";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { sql } from "kysely";
import { openSqliteConnection } from "@jini-ai/db/sqlite";
import { createKeyAttachments, type KeyAttachments, type ProjectKeyTransaction } from "#src/features/project-keys/attachments";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { RuntimeMode } from "#src/contracts/core/runtime-mode";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { VaultRecord, VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";

import { createAgentPluginStateStore } from "#src/features/api-connections/plugin-state";
import { createApiConnectionVault } from "#src/features/api-connections/vault-stores";
import type { KeyringPort, SecretSealerPort } from "#src/features/webhooks/index";
import { FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { atomicCreateSiteKeyFile, mintSiteKeyHex } from "#src/features/webhooks/site-key-ensure";
import { closeSqliteConnection, openNativeSqlite, sqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { migrateProjectDatabase } from "#src/platform/db/migrations/index";
import { createVaultProviderConfigSource, type ProviderConfigSource } from "./provider-config-source.js";

/**
 * @file One owner project.db in resolved app-data, shared by desktop and localhost regardless of
 * the sites root. Keep it outside sites: Documents may sync via iCloud, and live SQLite/WAL files
 * must not sync. The owner encryption root stays beside its DB, mode 0600, never in site config.
 * The earlier root-hashed layout used ~/.tovu/projects/<projectId>; projectId remains telemetry
 * identity only. Production remote access and shared OAuth are outside this local API-key store.
 */

export const PROJECT_WORKSPACE_ID = "project";
export const PROJECT_DB_FILENAME = "project.db";

const PROJECT_KEY_FILENAME = "project-key.hex";

type OwnerStoreLocation = { home: string; projectId?: string; appDataDir?: string };

/** Resolve the same profile as the directory workspace; root changes cannot split Shared Keys. */
function projectDir({ home, appDataDir }: OwnerStoreLocation): string {
  if (appDataDir) return appDataDir;
  // A supplied fixture/home is its own profile. Ambient desktop overrides belong to the actual
  // process home only; the desktop CLI always passes its explicit appDataDir above.
  const env = path.resolve(home) === path.resolve(homedir()) ? process.env : {};
  return createSitesWorkspace({}, { homeDir: home, env, cwd: home, sourceRoots: [] }).config({}).appData;
}

/** Owner database outside every portable site folder. @complexity O(1) path resolution. */
export function projectDbPath(required: OwnerStoreLocation, _optional: Record<string, never> = {}): string {
  return path.join(projectDir(required), PROJECT_DB_FILENAME);
}

/** Private owner encryption root; only trusted host composition opens it. */
export function projectKeyFilePath(required: OwnerStoreLocation, _optional: Record<string, never> = {}): string {
  return path.join(projectDir(required), PROJECT_KEY_FILENAME);
}

/** A configured desktop/localhost profile is host-local even for a production server build.
 * Remote production hosts without that explicit profile retain their existing site-only mode.
 */
export function localOwnerStoreEnabled({ runtimeMode, env }: { runtimeMode: RuntimeMode; env: NodeJS.ProcessEnv }, _options = {}): boolean {
  return runtimeMode !== "production" || Boolean(env.TOVU_DESKTOP_USER_DATA_DIR?.trim());
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
 * Makes a folder's new entry (a just-linked key file) durable, so a power cut cannot keep rows sealed
 * with a key whose name was lost. Windows can't open a folder for fsync (EISDIR/EPERM); NTFS journals
 * the entry itself, so that is skipped.
 */
function fsyncDirectory(dir: string): void {
  if (process.platform === "win32") return;
  const fd = fs.openSync(dir, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Reads the project key, minting it on first use through the site key's publisher
 * (`atomicCreateSiteKeyFile`: a private fsynced temp file linked into place, never overwriting), so a
 * concurrent first start (web and desktop together) converges on whichever key landed first, and an
 * opener never sees the final file before its bytes are in. The folder is then fsynced so the key's
 * name is as durable as its bytes before any row is sealed with it.
 * @param optional.uid This process's OS user (`process.getuid`; absent on Windows: no owner check).
 * @throws When the file exists but does not hold a 64-hex key (never silently replaced: rows sealed
 *   with the old key would become unreadable), is not a regular file, or belongs to another user.
 * @complexity O(1) file I/O.
 */
export function ensureProjectKey({ keyFile: file }: { keyFile: string }, optional: { mint?: () => string; uid?: () => number } = {}): string {
  if (!fs.existsSync(file)) {
    atomicCreateSiteKeyFile(file, (optional.mint ?? mintSiteKeyHex)());
    fsyncDirectory(path.dirname(file));
  }
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
 * in the sites root would sync (iCloud) and be copied with it.
 */
export function projectIdFor({ sitesHome }: { sitesHome: string }, _optional: Record<string, never> = {}): string {
  return idOfPath(canonicalRoot(path.resolve(sitesHome)));
}

/**
 * Opens (creating when absent) a project.db. Two processes creating it at the same moment is safe:
 * SQLite serializes the file's creation, and each migration step runs under `BEGIN IMMEDIATE` and
 * re-checks the ledger first (Jini's runner), so the loser waits (busy_timeout) and then skips it.
 */
function openProjectDb({ dbPath }: { dbPath: string }, _optional: Record<string, never> = {}): ReturnType<typeof openNativeSqlite> {
  const db = openNativeSqlite(dbPath, { fileMustExist: false, timeout: 5000 });
  try {
    // The same pragmas every site database opener sets (`chat-db.ts`, `content-db.ts`): web and desktop
    // hold this file open together, so WAL readers never block on a writer, and a briefly held lock is
    // retried rather than thrown.
    enableProjectWal({ db });
  } catch (error) {
    closeSqliteConnection(db);
    throw error;
  }
  return db;
}

/**
 * WAL setup on a newly created project file can return SQLITE_BUSY without calling SQLite's busy
 * handler. Web and desktop first boots retry that lock only; other errors and exhausted retries
 * propagate to openProjectDb's close-on-error boundary.
 * @complexity O(1): at most 21 attempts and twenty 50 ms sleeps, plus driver lock waits.
 */
function enableProjectWal({ db }: { db: ReturnType<typeof openNativeSqlite> }, _optional: Record<string, never> = {}): void {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt++) {
    try {
      openSqliteConnection({ filePath: db.name, open: () => db });
      return;
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== "SQLITE_BUSY" || attempt >= 20) throw error;
      Atomics.wait(pause, 0, 0, 50);
    }
  }
}

/**
 * The project's own `secrets_vault` with the keyring and sealer that open its rows (owner 2026-10-25:
 * keys save to the project by default). Any credential store builds its project half from this —
 * the same row shape and sealing as a site's, under {@link PROJECT_WORKSPACE_ID}.
 */
export interface ProjectVaultScope {
  readonly workspaceId: string;
  readonly repo: VaultRepoPort;
  readonly replaceRepo?: VaultRepoPort;
  readonly createRepo?: VaultRepoPort;
  readonly keyring: KeyringPort;
  readonly sealer: SecretSealerPort;
}

export interface ProjectStore {
  readonly projectId: string;
  inventory?(required: Record<string, never>, optional?: Record<string, never>): Promise<VaultRecord[]>;
  findByLabel?(input: { label: string; kind: VaultRecord["kind"] }, options?: Record<string, never>): Promise<VaultRecord | null>;
  readonly attachments: KeyAttachments;
  readonly transaction: ProjectKeyTransaction;
  providerRevisions(required: { siteId: string }, optional?: Record<string, never>): Promise<readonly { id: string; revision: number; attached_at: string }[]>;
  readonly config: ProviderConfigSource;
  readonly vault: ProjectVaultScope;
  readonly dbPath: string;
  close(required: Record<string, never>, optional?: Record<string, never>): void;
}

/**
 * Opens (creating when absent) and migrates `project.db`, and returns its provider-settings adapter.
 * @param required.sitesHome The shared sites root (`resolveSitesHome`).
 * @param required.home The OS user's home (`os.homedir()`: HOME, or USERPROFILE on Windows), where
 *   the canonical owner profile lives.
 * @throws When the folder can't be created (EACCES, ENOSPC), the key is refused, or the database can't
 *   be opened or migrated. The caller must not fall back to another store for writes (`deps.ts`).
 * @complexity O(m) pending migrations.
 */
export async function openProjectStore(
  required: { sitesHome: string; home: string; appDataDir?: string },
  optional: { clock?: { nowMs(): number } } = {},
): Promise<ProjectStore> {
  const projectId = projectIdFor(required);
  const dbPath = projectDbPath(required);
  const relative = path.relative(canonicalRoot(path.resolve(required.sitesHome)), canonicalRoot(path.dirname(dbPath)));
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("Shared Keys must stay outside site folders. Choose a separate app-data folder, then restart Tovu. Details: P25_OWNER_STORE_INSIDE_SITES.");
  }
  // 0700: the folder holds the key; `recursive` applies the mode to every folder it creates.
  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  // The key first: no database is created beside a key that is refused.
  const hex = ensureProjectKey({ keyFile: projectKeyFilePath({ ...required, appDataDir: path.dirname(dbPath) }) });
  const db = openProjectDb({ dbPath });
  const kernel = sqliteKernel<SecretsVaultDatabase>(db);
  try {
    await migrateProjectDatabase(kernel as unknown as StorageKernel<unknown>);
  } catch (error) {
    closeSqliteConnection(db);
    throw error;
  }
  const keyring = new FixedSiteKeyKeyring(hex);
  const scope: ProjectVaultScope = { workspaceId: PROJECT_WORKSPACE_ID, repo: new SqlSecretsVaultRepo({ kernel }), keyring, sealer: new AesGcmSecretSealer(keyring) };
  const vault = createApiConnectionVault({ repo: scope.repo, keyring, sealer: scope.sealer,
    clock: optional.clock ?? { nowMs: () => Date.now() }, workspaceId: PROJECT_WORKSPACE_ID });
  const config = createVaultProviderConfigSource({ workspaceId: PROJECT_WORKSPACE_ID, scope: "project",
    state: createAgentPluginStateStore({ vault, workspaceId: PROJECT_WORKSPACE_ID }) }, {
    // Every status/card read × one selected identity; plugin-state.describe lists the whole kind.
    configExists: async input => (await kernel.query(sql`SELECT 1 FROM secrets_vault WHERE workspace_id='project' AND id=${providerKeyId(input)} LIMIT 1`)).length > 0,
  });
  const store: ProjectStore = { projectId, config,
    findByLabel: async ({ label, kind }) => {
      const rows = await kernel.query<{ id: string }>(sql`SELECT id FROM secrets_vault WHERE workspace_id='project' AND kind=${kind} AND label=${label} AND owner_key='tovu' AND principal_id IS NULL LIMIT 2`);
      if (rows.length > 1) throw new Error("More than one Shared Key has this label. Rename the conflicting key in Shared Keys and try again.");
      return rows[0] ? scope.repo.find({ workspaceId: PROJECT_WORKSPACE_ID, id: rows[0].id }) : null;
    },
    inventory: async () => {
      // One picker open × at most 50 metadata rows. Never select ciphertext for owner discovery.
      const rows = await kernel.query<{ id: string; kind: VaultRecord["kind"]; label: string; credential_type: string | null; credential_format: string | null }>(sql`SELECT id, kind, label, json_extract(meta, '$.credentialType') AS credential_type, json_extract(meta, '$.credentialFormat') AS credential_format FROM secrets_vault WHERE workspace_id='project' AND owner_key='tovu' AND principal_id IS NULL AND (kind IN ('vendor','custom','source-control') OR (kind='api-connection' AND (id LIKE 'plugin-state:%:provider.config' OR json_extract(meta, '$.credentialFormat')='oauth-token-set'))) ORDER BY id LIMIT 51`);
      if (rows.length > 50) throw new Error("Shared Keys has more than 50 entries. Narrow the saved keys in Shared Keys before opening this picker.");
      return rows.map((row): VaultRecord => ({ workspaceId: PROJECT_WORKSPACE_ID, id: row.id, kind: row.kind, label: row.label,
        ownerKey: "tovu", principalId: null, binding: null, provider: null, isDefault: false, revision: 1,
        sealed: null, last4: null, tokenLength: null, meta: { ...(row.credential_type ? { credentialType: row.credential_type } : {}), ...(row.credential_format ? { credentialFormat: row.credential_format } : {}) }, createdAt: "", updatedAt: "" }));
    },
    transaction: ({ run }) => kernel.transaction(run),
    providerRevisions: ({ siteId }) => kernel.query<{ id: string; revision: number; attached_at: string }>(sql`SELECT v.id, v.revision, a.attached_at FROM site_key_attachments a JOIN secrets_vault v ON v.id=a.key_id AND v.workspace_id='project' WHERE a.site_id=${siteId} AND v.kind='api-connection' ORDER BY v.id`),
    attachments: createKeyAttachments({ kernel: kernel as unknown as StorageKernel<unknown> }), vault: scope, dbPath, close: () => closeSqliteConnection(db) };
  return store;
}
