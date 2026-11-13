import { isDeepStrictEqual } from 'node:util';
import type { SiteKeyReferences } from "#src/features/project-keys/site-references";
import { migrateProviderSettings, type PluginProviderDeclaration } from "@jini-ai/plugins/host";
import { providerKeyId } from "#src/features/project-keys/service";
import type { ProviderConfigSource, ProviderKeyUsage, ProviderPluginConfig, ProviderSettingsView } from "@jini-ai/plugins/host";
export type { ProviderConfigSource, ProviderKeyUsage, ProviderPluginConfig, ProviderSettingsView, ProviderWriteResult } from "@jini-ai/plugins/host";
import type { KeyAttachments, ProjectKeyTransaction } from "#src/features/project-keys/attachments";
import type { AgentPluginStateStore } from "#src/features/api-connections/plugin-state";
import { SECRET_OPEN_FAILED } from "#src/features/webhooks/secret-sealer.aesgcm";

/**
 * @file Where a provider plugin's saved settings live (provider wave 2 fix, owner 2026-10-25): a
 * neutral port, `pluginId → { settings, secrets }`, so boot and the admin settings card never know
 * which store answered. Two adapters: the site vault (default) and the project store (`project.db`,
 * visible to attached sites only — see `project-store.ts`). Earlier site overrides could keep a
 * copied key usable after revoke; grants now govern shared rows only, while independently owned local rows stay first.
 *
 * Both adapters reuse the existing plugin-state rows (`plugin-state:<pluginId>:<key>` in a
 * `secrets_vault` table, sealed with that store's key — `features/api-connections/plugin-state.ts`),
 * so no new table and no new vault kind. Never env, files, logs or manifests.
 *
 * Why ONE row holds both halves (Codex fix-lane HIGH): an endpoint and the credential sent to it are
 * one unit. As two rows, a save that failed between them, or a boot reading between another site's
 * two commits, could pair the old endpoint with the new secret and send it to the wrong backend. One
 * row is one revision-checked vault write and one read, so a save lands whole or not at all and every
 * read is one saved snapshot. The cost: the admin card's public read opens that envelope too; it
 * returns secret names only, never a value.
 */

/**
 * A plugin's settings row exists but cannot be opened on this machine: the store's key was lost or
 * re-minted (e.g. `project.db` copied to another machine without its `project-key.hex`). Boot
 * treats it as unconfigured (noop); the card asks for the settings again; a save overwrites the row.
 */
export class ProviderConfigUnreadableError extends Error {
  constructor(required: { pluginId: string; cause: unknown }, _optional: Record<string, never> = {}) {
    super(`the saved settings for '${required.pluginId}' can't be read on this machine; enter them again`, { cause: required.cause });
    this.name = "ProviderConfigUnreadableError";
  }
}

/**
 * The project store is configured here but could not open this run (its folder can't be created:
 * EACCES/ENOSPC; a refused key; a damaged file). A save is refused with this rather than written to the
 * site vault by a shared-only write path; ordinary local edits retain their independent source.
 */
export class ProviderStoreUnavailableError extends Error {
  readonly code = "PROVIDER_SETTINGS_UNAVAILABLE";
  constructor(required: { reason: string }, _optional: Record<string, never> = {}) {
    super(`Project settings can't be saved right now: ${required.reason}`);
    this.name = "ProviderStoreUnavailableError";
  }
}

const UNREADABLE_VIEW: ProviderSettingsView = Object.freeze({ settings: Object.freeze({}), secretNames: Object.freeze([]), unreadable: true });

const CONFIG_KEY = "provider.config";

const stringRecord = (value: unknown): Record<string, string> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
};

/**
 * True only for a failure to OPEN a sealed row (Tovu's sealer tags it `SECRET_OPEN_FAILED`: a wrong,
 * lost or re-minted key, a tampered row, a damaged envelope), or the vault's `invalid-record` (the row
 * opened but its payload is not a record). By code, never by message: the auth-tag failure's wording
 * belongs to the crypto runtime (Electron's BoringSSL vs Node's OpenSSL). A driver/DB error
 * (SQLITE_BUSY, a dropped connection) or any other vault code is the store failing and is false.
 * @complexity O(1).
 */
function isOpenFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  // By name + code, not `instanceof`: Jini's VaultError can load as more than one module copy.
  if (error.name === "VaultError") return code === "invalid-record";
  return code === SECRET_OPEN_FAILED;
}

/**
 * The provider config adapter over one plugin-state store (a site's or the project's vault).
 * @param required.state The plugin-state store; `workspaceId` is the scope that store serves.
 * @param required.scope Reported to the admin card.
 * @param optional.configExists Selected metadata lookup for the owner store, avoiding a plugin-state inventory.
 * @complexity O(1) vault reads/writes per call.
 */
export function createVaultProviderConfigSource(
  required: { state: AgentPluginStateStore; workspaceId: string; scope: ProviderConfigSource["scope"] },
  optional: { configExists?: (input: { pluginId: string }) => Promise<boolean> } = {},
): ProviderConfigSource {
  const exists = optional.configExists ?? (async ({ pluginId }: { pluginId: string }) =>
    (await required.state.describe({ workspaceId: required.workspaceId, pluginId })).keys.some(entry => entry.key === CONFIG_KEY));
  const store = ({ pluginId }: { pluginId: string }) => required.state.forPlugin({ workspaceId: required.workspaceId, pluginId });
  /**
   * Classifies a failed row read: the row is listed (the listing opens no envelope) and the failure
   * is one of OPENING it ({@link isOpenFailure}) → unreadable on this machine; otherwise the store
   * itself is failing → the original error. Narrow on purpose: a transient SQLITE_BUSY read as
   * "unreadable" would show "not configured", and a public-only save would then write secrets {}
   * over a valid key.
   */
  async function unreadableOr({ pluginId, error }: { pluginId: string; error: unknown }): Promise<never> {
    const listed = isOpenFailure(error) && await exists({ pluginId }).catch(() => false);
    throw listed ? new ProviderConfigUnreadableError({ pluginId, cause: error }) : error;
  }
  async function read({ pluginId }: { pluginId: string }): Promise<ProviderPluginConfig | null> {
    const row = (await store({ pluginId }).get({ key: CONFIG_KEY }).catch((error: unknown) => unreadableOr({ pluginId, error }))) as { settings?: unknown; secrets?: unknown } | null;
    if (!row || typeof row !== "object") return null;
    return { settings: stringRecord(row.settings) ?? {}, secrets: stringRecord(row.secrets) ?? {} };
  }
  return {
    scope: required.scope,
    read,
    async readSettings({ pluginId }) {
      let found: ProviderPluginConfig | null;
      try {
        found = await read({ pluginId });
      } catch (error) {
        if (error instanceof ProviderConfigUnreadableError) return UNREADABLE_VIEW;
        throw error;
      }
      if (!found) return null;
      const { settings, secrets } = found;
      return { settings, secretNames: Object.keys(secrets).filter((name) => secrets[name] !== "") };
    },
    async usage({ pluginId }) {
      const saved = await exists({ pluginId });
      return { ...(saved ? { keyId: providerKeyId({ pluginId }) } : {}), store: required.scope,
        usedByThisSite: saved && required.scope === "site", usedBy: [] };
    },
    async write({ pluginId, config }) {
      await store({ pluginId }).set({ key: CONFIG_KEY, value: { settings: { ...config.settings }, secrets: { ...config.secrets } } });
      return { keyId: providerKeyId({ pluginId }), store: required.scope, usedByThisSite: required.scope === "site", usedBy: [] };
    },
  };
}

/** Local settings remain editable and take precedence. Shared settings require a current grant. Project saves attach in the same transaction, so status and live apply see the
 * committed config. Other project values stay invisible until explicitly attached. The unfiltered
 * store detects existing identities without granting a site permission to replace a shared key.
 */
export function withAttachedProject(
  { site }: { site: ProviderConfigSource },
  { project, attachments, siteId = "", siteName = siteId, references, transaction = async ({ run }) => run() }: { project: ProviderConfigSource; attachments: KeyAttachments; siteId?: string; siteName?: string; references?: SiteKeyReferences; transaction?: ProjectKeyTransaction },
): ProviderConfigSource {
  const attached = async ({ pluginId }: { pluginId: string }) => {
    const keyId = providerKeyId({ pluginId });
    return attachments.isAttached({ siteId, keyId });
  };
  async function usage(input: { pluginId: string }): Promise<ProviderKeyUsage> {
    const local = await site.usage(input);
    if (local.keyId) return local;
    if (!await attached(input)) return { store: "project", usedByThisSite: false, usedBy: [] };
    const keyId = providerKeyId(input);
    const exists = (await project.usage(input)).keyId !== undefined;
    const users = await attachments.usersOf({ keyId });
    return { ...(exists ? { keyId } : {}), store: "project", usedByThisSite: exists && users.some(user => user.siteId === siteId), usedBy: users.map(user => user.siteName) };
  }
  async function grantedRead<T>(input: { pluginId: string }, read: (input: { pluginId: string }) => Promise<T>): Promise<T | null> {
    try {
      if (!await attached(input)) return null;
      const value = await read(input);
      return await attached(input) ? value : null;
    } catch {
      console.warn('[shared-keys] Provider settings could not be read. Retry Shared Keys; local settings remain available. Details: P25_SHARED_PROVIDER_READ_FAILED; secret values omitted.');
      return null;
    }
  }
  return {
    scope: "project", usage,
    read: async input => await site.read(input) ?? await grantedRead(input, value => project.read(value)),
    readSettings: async input => await site.readSettings(input) ?? await grantedRead(input, value => project.readSettings(value)),
    write: async input => {
      if (!siteId || (await site.usage(input)).keyId) return site.write(input);
      return transaction({ run: async () => {
        const existing = await project.usage(input);
        if (existing.keyId) {
          if (!await attached(input)) throw new ProviderStoreUnavailableError({ reason: "Open Use a saved key to approve this owner key on this site before changing it. Details: P25_PROVIDER_KEY_NOT_GRANTED." });
          if (!isDeepStrictEqual(await project.read(input), input.config)) throw new ProviderStoreUnavailableError({ reason: "Change this shared provider key in Shared Keys, then reopen this site's settings. Details: P25_PROVIDER_KEY_READ_ONLY; secret values omitted." });
          return { ...await usage(input), keyId: providerKeyId(input) };
        }
        await project.write(input);
        const keyId = providerKeyId(input);
        await references?.set({ credentialId: keyId });
        await attachments.attach({ siteId, siteName, keyId });
        return usage(input).then(result => ({ ...result, keyId: providerKeyId(input) }));
      } });
    },
  };
}

/**
 * Owner-store unavailability means no shared key; existing site keys still work.
 * No shared half is supplied, so the site source remains independently readable and editable.
 */
export function withUnavailableProject(
  required: { site: ProviderConfigSource; reason: string },
  _optional: Record<string, never> = {},
): ProviderConfigSource {
  // Shared writes can be retried later; a local edit/save remains usable across owner outages.
  return required.site;
}


/** Apply manifest-owned migrations after scope selection. Reads never write back to either vault. */
export function withProviderSettingsMigrations({ source, providers }: {
  source: ProviderConfigSource; providers: (input: { pluginId: string }) => Promise<readonly PluginProviderDeclaration[]>;
}, _optional = {}): ProviderConfigSource {
  const settings = async ({ pluginId, settings }: { pluginId: string; settings: Readonly<Record<string, string>> }) =>
    migrateProviderSettings({ providers: await providers({ pluginId }), settings });
  return { ...source,
    read: async input => {
      const saved = await source.read(input);
      return saved && { ...saved, settings: await settings({ ...input, settings: saved.settings }) };
    },
    readSettings: async input => {
      const saved = await source.readSettings(input);
      return saved && !saved.unreadable ? { ...saved, settings: await settings({ ...input, settings: saved.settings }) } : saved;
    },
  };
}
