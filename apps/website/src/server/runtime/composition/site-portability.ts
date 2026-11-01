import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { sanitizeShareDatabase as sanitizeWithModules } from "#src/features/site-backup/share-database/repo.sqlite";
import { rebuildImportDatabase as rebuildWithWorker, type RebuildImportDatabaseOptions as WorkerOptions } from "#src/features/site-backup/import-database";
import { FIRST_PARTY_DATA_MODULES } from "./data-modules.js";
import { restoreStagedImport as restoreWithLayout } from "#src/features/site-backup/import-restore";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import Database from "better-sqlite3";
import { inMemoryReadableBytes } from "@jini-ai/db/transfer";
import { homedir } from "node:os";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SecretSealerPort } from "@jini-ai/platform/secrets";
import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { sqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { SqlSettingsRepo } from "#src/features/settings/repo";
import { createSiteSavedKeys, type SavedKeysStore } from "#src/features/site-backup/saved-keys";
import { loadSiteVaultKinds } from "./vault-boot.js";
import type { ProjectVaultScope } from "./project-store.js";
import type { ProjectKeyTransaction } from "#src/features/project-keys/attachments";
import { ensureSiteKey } from "#src/features/webhooks/site-key-ensure";
import { siteKeySources } from "#src/features/webhooks/site-key-sources";
import { EnvOrFileKeyring } from "#src/features/webhooks/keyring.env";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { findSiteKeyDependentData } from "#src/platform/site-dir/site-key-dependent-data";
import { resolveRuntimeMode, type RuntimeMode } from "#src/contracts/core/runtime-mode";
/** Bind the newly allocated destination, never the requesting site's layout or ambient overrides. */
export function restoreStagedImport(required: Omit<Parameters<typeof restoreWithLayout>[0], "pluginLayout" | "openContent">, optional: Parameters<typeof restoreWithLayout>[1] = {}) {
  return restoreWithLayout({ ...required, openContent: ({ filePath }) => openSqliteFileKernel<ContentDatabase>(filePath), pluginLayout: resolveAgentPluginLayout({ siteDir: required.dir }, { env: {} }) }, optional);
}

export { rewriteArchiveMedia } from "#src/features/site-backup/share-database/repo.sqlite";
export { importWorkerLaunch } from "#src/features/site-backup/import-database";
export type RebuildImportDatabaseOptions = WorkerOptions & {
  /** This module's own URL: a `.ts` source run starts the helper through tsx, a build runs its `.js`. */
  moduleUrl?: string;
};

/** Bind this build's trusted declarations, never an archive's catalogue. @complexity O(1) binding. */
export function sanitizeShareDatabase(required: { snapshot: Buffer }, optional: Parameters<typeof sanitizeWithModules>[1] = {}) {
  return sanitizeWithModules({ ...required, modules: FIRST_PARTY_DATA_MODULES }, optional);
}

/** Select the trusted isolated worker shipped beside this composition root. @complexity O(1) binding. */
export function rebuildImportDatabase(required: { snapshot: Buffer }, optional: RebuildImportDatabaseOptions = {}) {
  return rebuildWithWorker({ ...required, moduleUrl: optional.moduleUrl ?? import.meta.url }, optional);
}

/** One registration of host metadata rules and exact scope fencing for archive reads/writes.
 * No legacy fallback: boot normalizes source rows; unsupported recovery rows are left out.
 * @complexity O(1) setup plus the owning metadata catalogue load.
 */
async function archiveVault(required: { workspaceId: string; repo: ProjectVaultScope["repo"]; keyring: KeyringPort; sealer: SecretSealerPort; siteDir?: string }) {
  const { metaParsers } = await loadSiteVaultKinds({ workspaceId: required.workspaceId, siteDir: required.siteDir });
  return new SecretsVaultService({ ...required, metaParsers,
    authorize: async ({ context }) => {
      if (context.workspaceId !== required.workspaceId || context.ownerKey !== "tovu" || context.principalId !== null) throw new Error("Saved keys scope mismatch");
    },
    now: () => new Date().toISOString(), newId: () => { throw new Error("Archive requires an explicit credential identity"); },
  });
}

/** Both repos join the SAME kernel transaction, so an invalid setting cannot leave imported keys.
 * An owning kernel is closed by its caller; creating this adapter never steals an ambient handle.
 * @example const store = await createSavedKeysStore({ kernel, workspaceId, keyring, sealer });
 */
export async function createSavedKeysStore(required: { kernel: StorageKernel<ContentDatabase>; workspaceId: string; keyring: KeyringPort; sealer: SecretSealerPort; siteDir?: string }, _optional: Record<string, never> = {}): Promise<SavedKeysStore> {
  const repo = new SqlSecretsVaultRepo({ kernel: required.kernel as unknown as StorageKernel<SecretsVaultDatabase> });
  return { workspaceId: required.workspaceId, repo, vault: await archiveVault({ ...required, repo }), settings: new SqlSettingsRepo(required.kernel),
    transaction: ({ run }) => required.kernel.transaction(run), close: async () => {} };
}

interface SavedKeysComposition {
  workspaceId: string; keyring: KeyringPort; sealer: SecretSealerPort; settingsRepo: SettingsRepoPort;
  siteDir?: string;
  /** Already filtered by attachedOnlyVault using the site's META UUID in composeProviderConfig. */
  projectVault?: ProjectVaultScope;
  projectTransaction?: ProjectKeyTransaction;
}
interface SavedKeysEnvironment { home?: string; env?: NodeJS.ProcessEnv; mode?: RuntimeMode }

/** Bind exact snapshot bytes and fresh destination key sources, never the requesting site's DB or
 * keyring. Project attachment reads share one project transaction. No server is booted on restore.
 * @example const savedKeys = composeSiteSavedKeys({ workspaceId, keyring, sealer, settingsRepo });
 * @complexity O(snapshot + credentials); existing key/catalog/repository owners do the work.
 */
export function composeSiteSavedKeys(required: SavedKeysComposition, optional: SavedKeysEnvironment = {}) {
  const env = optional.env ?? process.env, home = optional.home ?? homedir(), mode = optional.mode ?? resolveRuntimeMode({ env });
  return createSiteSavedKeys({ ...required,
    trustedDefinitions: async () => [...await required.settingsRepo.listActiveDefinitions({ workspaceId: null }), ...await required.settingsRepo.listActiveDefinitions({ workspaceId: required.workspaceId })],
    openSnapshot: async ({ snapshot, workspaceId }) => {
      // Complete snapshots retain the live site's WAL header; SQLite cannot deserialize that in memory.
      const db = new Database(inMemoryReadableBytes({ bytes: snapshot }), { readonly: true });
      const kernel = sqliteKernel<ContentDatabase>(db);
      try {
        const store = await createSavedKeysStore({ ...required, workspaceId, kernel });
        return { ...store, close: async () => { await kernel.close(); } };
      } catch (error) { await kernel.close(); throw error; }
    },
    ...(required.projectVault && required.projectTransaction ? { captureProject: async <T>({ run }: { run: (store: Pick<SavedKeysStore, "workspaceId" | "repo" | "vault">) => Promise<T> }) => {
      const source = required.projectVault!;
      const vault = await archiveVault({ ...source, siteDir: required.siteDir });
      return required.projectTransaction!({ run: () => run({ ...source, vault }) });
    } } : {}),
    openRecipient: input => openSavedKeysRecipient({ ...input, env, home, mode }),
  });
}

/** Open the allocated recipient with the same key identity its creation commit will persist.
 * Closes the new kernel on setup failure; the returned store owns it on success.
 * @complexity One key ensure (including its dependent-data scan), one workspace query and vault setup.
 */
async function openSavedKeysRecipient(required: { dir: string; dbPath: string; siteId: string; env: NodeJS.ProcessEnv; home: string; mode: RuntimeMode }): Promise<SavedKeysStore> {
  const { env, home, mode } = required;
  // Creation writes its metadata last. Use its allocated identity now so the restored keys
  // remain resolvable after that commit marker is written; boot must not mint another identity.
  await ensureSiteKey({ siteDir: required.dir, siteKeyId: required.siteId, env, home, mode, findSiteKeyDependentData: dir => findSiteKeyDependentData(dir, { env }) });
  const keyring = new EnvOrFileKeyring({ sources: siteKeySources({ siteKeyId: required.siteId, env, home, mode, cwd: process.cwd() }) }, { env: () => env });
  const sealer = new AesGcmSecretSealer(keyring);
  const kernel = openSqliteFileKernel<ContentDatabase>(required.dbPath);
  try {
    const workspaces = await kernel.run(db => db.selectFrom("workspaces").select("id").execute());
    if (workspaces.length !== 1) throw new Error("Saved keys require one recipient workspace");
    const store = await createSavedKeysStore({ kernel, workspaceId: workspaces[0]!.id, keyring, sealer, siteDir: required.dir });
    return { ...store, close: async () => { await kernel.close(); } };
  } catch (error) { await kernel.close(); throw error; }
}
