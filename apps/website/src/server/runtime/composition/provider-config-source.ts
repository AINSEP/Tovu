import { migrateProviderSettings, type PluginProviderDeclaration } from "@jini-ai/plugins/host";
import { providerKeyId, type ProviderKeyUsage, type ProviderWriteResult } from "#src/features/project-keys/service";
export type { ProviderKeyUsage, ProviderWriteResult } from "#src/features/project-keys/service";
import type { KeyAttachments, ProjectKeyTransaction } from "#src/features/project-keys/attachments";
import type { AgentPluginStateStore } from "#src/features/api-connections/plugin-state";
import { SECRET_OPEN_FAILED } from "#src/features/webhooks/secret-sealer.aesgcm";

/**
 * @file Where a provider plugin's saved settings live (provider wave 2 fix, owner 2026-10-25): a
 * neutral port, `pluginId → { settings, secrets }`, so boot and the admin settings card never know
 * which store answered. Two adapters: the site vault (default) and the project store (`project.db`,
 * visible to attached sites only — see `project-store.ts`). Site rows win; a project row is read only
 * when attached to this site.
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

/** Saved values for one provider plugin; keys are the plugin's declared setting names. */
export interface ProviderPluginConfig {
  readonly settings: Readonly<Record<string, string>>;
  readonly secrets: Readonly<Record<string, string>>;
}

/** The admin card's view: public values and the NAMES of saved secrets, never a secret value. */
export interface ProviderSettingsView {
  readonly settings: Readonly<Record<string, string>>;
  readonly secretNames: readonly string[];
  /** A row is saved but this machine cannot open it (the store's key was lost or re-minted): shown as
   *  not configured, with a notice to enter the settings again. */
  readonly unreadable?: true;
}

export interface ProviderConfigSource {
  usage(required: { pluginId: string }, optional?: Record<string, never>): Promise<ProviderKeyUsage>;
  /** Which store this is, for the admin card ("saved for this project" vs "this site"). */
  readonly scope: "project" | "site";
  /** Null when nothing was ever saved for the plugin.
   *  @throws {ProviderConfigUnreadableError} When a row is saved but cannot be opened here. */
  read(required: { pluginId: string }, optional?: Record<string, never>): Promise<ProviderPluginConfig | null>;
  /** Public values and secret names. The row holding both halves is decrypted to read them (see the
   *  file header), but no secret value is returned. Null when nothing was saved. */
  readSettings(required: { pluginId: string }, optional?: Record<string, never>): Promise<ProviderSettingsView | null>;
  /** Saves the whole config, overwriting a row this machine cannot open. */
  write(required: { pluginId: string; config: ProviderPluginConfig }, optional?: Record<string, never>): Promise<ProviderWriteResult | void>;
}

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
 * site vault: the next start that opens the project store would read its rows first and hide that save.
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
 * @complexity O(1) vault reads/writes per call.
 */
export function createVaultProviderConfigSource(
  required: { state: AgentPluginStateStore; workspaceId: string; scope: ProviderConfigSource["scope"] },
  _optional: Record<string, never> = {},
): ProviderConfigSource {
  const store = ({ pluginId }: { pluginId: string }) => required.state.forPlugin({ workspaceId: required.workspaceId, pluginId });
  /**
   * Classifies a failed row read: the row is listed (the listing opens no envelope) and the failure
   * is one of OPENING it ({@link isOpenFailure}) → unreadable on this machine; otherwise the store
   * itself is failing → the original error. Narrow on purpose: a transient SQLITE_BUSY read as
   * "unreadable" would show "not configured", and a public-only save would then write secrets {}
   * over a valid key.
   */
  async function unreadableOr({ pluginId, error }: { pluginId: string; error: unknown }): Promise<never> {
    const listed = isOpenFailure(error) && await required.state.describe({ workspaceId: required.workspaceId, pluginId })
      .then(({ keys }) => keys.some((entry) => entry.key === CONFIG_KEY), () => false);
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
      const exists = (await required.state.describe({ workspaceId: required.workspaceId, pluginId })).keys.some(entry => entry.key === CONFIG_KEY);
      return { ...(exists ? { keyId: providerKeyId({ pluginId }) } : {}), store: required.scope,
        usedByThisSite: exists && required.scope === "site", usedBy: [] };
    },
    async write({ pluginId, config }) {
      await store({ pluginId }).set({ key: CONFIG_KEY, value: { settings: { ...config.settings }, secrets: { ...config.secrets } } });
      return { keyId: providerKeyId({ pluginId }), store: required.scope, usedByThisSite: required.scope === "site", usedBy: [] };
    },
  };
}

/** Site rows win. Project values are invisible until this site's explicit attachment exists. */
export function withAttachedProject(
  { site }: { site: ProviderConfigSource },
  { project, attachments, siteId = "", transaction = async ({ run }) => run() }: { project: ProviderConfigSource; attachments: KeyAttachments; siteId?: string; transaction?: ProjectKeyTransaction },
): ProviderConfigSource {
  const attached = ({ pluginId }: { pluginId: string }) => attachments.isAttached({ siteId, keyId: providerKeyId({ pluginId }) });
  async function usage(input: { pluginId: string }): Promise<ProviderKeyUsage> {
    const own = await site.usage(input);
    if (own.usedByThisSite) return own;
    const keyId = providerKeyId(input);
    const exists = (await project.usage(input)).keyId !== undefined;
    const users = await attachments.usersOf({ keyId });
    return { ...(exists ? { keyId } : {}), store: "project", usedByThisSite: exists && users.some(user => user.siteId === siteId), usedBy: users.map(user => user.siteName) };
  }
  return {
    scope: "project", usage,
    read: async input => (await site.read(input)) ?? (await attached(input) ? project.read(input) : null),
    readSettings: async input => (await site.readSettings(input)) ?? (await attached(input) ? project.readSettings(input) : null),
    write: input => transaction({ run: async () => {
      const current = await usage(input);
      const own = !siteId || current.store === "site" || (!current.usedByThisSite && current.usedBy.length > 0);
      // The unfiltered store owns revision reads; filtering it would hide the row being replaced.
      await (own ? site : project).write(input);
      return usage(input).then(result => ({ ...result, keyId: providerKeyId(input) }));
    } }),
  };
}

/**
 * For a run whose project store failed to open: reads fall back to the site vault (what boot would
 * have read anyway for a plugin the project never saved), and every save is refused with
 * {@link ProviderStoreUnavailableError} instead of landing in a scope a later start would hide.
 */
export function withUnavailableProject(
  required: { site: ProviderConfigSource; reason: string },
  _optional: Record<string, never> = {},
): ProviderConfigSource {
  const { site, reason } = required;
  return {
    scope: "project",
    usage: input => site.usage(input),
    read: (input) => site.read(input),
    readSettings: (input) => site.readSettings(input),
    write: () => Promise.reject(new ProviderStoreUnavailableError({ reason })),
  };
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
