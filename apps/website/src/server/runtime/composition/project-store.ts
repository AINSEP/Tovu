import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";

import { createAgentPluginStateStore } from "#src/features/api-connections/plugin-state";
import { createApiConnectionVault } from "#src/features/api-connections/vault-stores";
import { FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { mintSiteKeyHex } from "#src/features/webhooks/site-key-ensure";
import { closeSqliteConnection, openNativeSqlite, sqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { migrateProjectDatabase } from "#src/platform/db/migrations/index";
import { createVaultProviderConfigSource, type ProviderConfigSource } from "./provider-config-source.js";

/**
 * @file The PROJECT store (owner decisions 2026-10-25): one `project.db` shared by every site of a
 * project, used by BOTH the local web app (`development/scripts/dev.mjs`) and the desktop app. Both
 * run this same server composition, and both find their sites through the same shared sites root
 * (`platform/site-dir/sites-home.ts`'s `resolveSitesHome`: `TOVU_SITES_HOME`, else the saved
 * `~/.tovu/sites-home.json`, else `~/Documents/Tovu`; desktop's child process shares its profile via
 * `TOVU_DESKTOP_USER_DATA_DIR`), so `<sites root>/project.db` is the SAME file whichever starts.
 * Never desktop app-data.
 *
 * Rows: the same `secrets_vault` shape as a site's (workspace `'project'`, no FK to site tables), own
 * migration ledger (`tovu_project_migrations`, `migrations/project/`), sealed with the project key
 * `~/.tovu/project-key.hex`, minted here like the site key (32 random bytes, hex, file mode 0600,
 * never exported, never inside a site folder). Fly / single-site production has no project store:
 * there the project IS the site and the site vault answers (`provider-config-source.ts`).
 */

export const PROJECT_WORKSPACE_ID = "project";
export const PROJECT_DB_FILENAME = "project.db";

/** `<sites root>/project.db`. */
export function projectDbPath({ sitesHome }: { sitesHome: string }, _optional: Record<string, never> = {}): string {
  return path.join(sitesHome, PROJECT_DB_FILENAME);
}

/** `~/.tovu/project-key.hex` — beside the site keys, outside every site folder. */
export function projectKeyFilePath({ home }: { home: string }, _optional: Record<string, never> = {}): string {
  return path.join(home, ".tovu", "project-key.hex");
}

const KEY_HEX = /^[0-9a-f]{64}$/;

/**
 * Reads the project key, minting it on first use. `wx` makes a concurrent first start (web and
 * desktop together) converge on whichever file landed first instead of overwriting it.
 * @throws When the file exists but does not hold a 64-hex key (never silently replaced: rows sealed
 *   with the old key would become unreadable).
 * @complexity O(1) file I/O.
 */
export function ensureProjectKey({ home }: { home: string }, optional: { mint?: () => string } = {}): string {
  const file = projectKeyFilePath({ home });
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(file, `${(optional.mint ?? mintSiteKeyHex)()}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
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
 * @param required.home The OS user's home (where `~/.tovu/project-key.hex` lives).
 * @complexity O(m) pending migrations.
 */
export async function openProjectStore(required: { sitesHome: string; home: string }, optional: { clock?: { nowMs(): number } } = {}): Promise<ProjectStore> {
  const hex = ensureProjectKey({ home: required.home });
  const dbPath = projectDbPath({ sitesHome: required.sitesHome });
  fs.mkdirSync(required.sitesHome, { recursive: true });
  const db = openNativeSqlite(dbPath, {});
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
  return { projectId: projectIdFor({ sitesHome: required.sitesHome }), config, dbPath, close: () => closeSqliteConnection(db) };
}
