import type { AgentPluginStateStore } from "#src/features/api-connections/plugin-state";

/**
 * @file Where a provider plugin's saved settings live (provider wave 2 fix, owner 2026-10-25): a
 * neutral port, `pluginId → { settings, secrets }`, so boot and the admin settings card never know
 * which store answered. Two adapters: the site vault (default) and the project store (`project.db`,
 * shared by every site of a project — see `project-store.ts`). Precedence: the project store when one
 * is configured, else the site vault; no per-site override in v1.
 *
 * Both adapters reuse the existing plugin-state rows (`plugin-state:<pluginId>:<key>` in a
 * `secrets_vault` table, sealed with that store's key — `features/api-connections/plugin-state.ts`),
 * so no new table and no new vault kind. Public values and secrets are separate rows so a reader of
 * the public half (the admin card) never opens a secret envelope. Never env, files, logs or manifests.
 */

/** Saved values for one provider plugin; keys are the plugin's declared setting names. */
export interface ProviderPluginConfig {
  readonly settings: Readonly<Record<string, string>>;
  readonly secrets: Readonly<Record<string, string>>;
}

export interface ProviderConfigSource {
  /** Which store this is, for the admin card ("saved for this project" vs "this site"). */
  readonly scope: "project" | "site";
  /** Null when nothing was ever saved for the plugin. */
  read(required: { pluginId: string }, optional?: Record<string, never>): Promise<ProviderPluginConfig | null>;
  /** Public values only (no secret is decrypted); null when nothing was saved. */
  readSettings(required: { pluginId: string }, optional?: Record<string, never>): Promise<{ settings: Readonly<Record<string, string>>; secretNames: readonly string[] } | null>;
  write(required: { pluginId: string; config: ProviderPluginConfig }, optional?: Record<string, never>): Promise<void>;
}

const SETTINGS_KEY = "provider.settings";
const SECRETS_KEY = "provider.secrets";

const stringRecord = (value: unknown): Record<string, string> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
};

/**
 * The provider config adapter over one plugin-state store (a site's or the project's vault).
 * The public row also lists which secret fields hold a value, so `readSettings` opens no secret row.
 * @param required.state The plugin-state store; `workspaceId` is the scope that store serves.
 * @param required.scope Reported to the admin card.
 * @complexity O(1) vault reads/writes per call.
 */
export function createVaultProviderConfigSource(
  required: { state: AgentPluginStateStore; workspaceId: string; scope: ProviderConfigSource["scope"] },
  _optional: Record<string, never> = {},
): ProviderConfigSource {
  const store = ({ pluginId }: { pluginId: string }) => required.state.forPlugin({ workspaceId: required.workspaceId, pluginId });
  async function readSettings({ pluginId }: { pluginId: string }) {
    const row = (await store({ pluginId }).get({ key: SETTINGS_KEY })) as { settings?: unknown; secretNames?: unknown } | null;
    if (!row || typeof row !== "object") return null;
    const secretNames = Array.isArray(row.secretNames) ? row.secretNames.filter((name): name is string => typeof name === "string") : [];
    return { settings: stringRecord(row.settings) ?? {}, secretNames };
  }
  return {
    scope: required.scope,
    readSettings,
    async read({ pluginId }) {
      const found = await readSettings({ pluginId });
      if (!found) return null;
      return { settings: found.settings, secrets: stringRecord(await store({ pluginId }).get({ key: SECRETS_KEY })) ?? {} };
    },
    async write({ pluginId, config }) {
      const state = store({ pluginId });
      // Secrets first: a public row never names a secret that was not saved.
      await state.set({ key: SECRETS_KEY, value: { ...config.secrets } });
      const secretNames = Object.keys(config.secrets).filter((name) => config.secrets[name] !== "");
      await state.set({ key: SETTINGS_KEY, value: { settings: { ...config.settings }, secretNames } });
    },
  };
}

/**
 * Project store first, else the site vault (owner: no per-site override in v1). Reads fall back per
 * plugin; writes go to the project store whenever one is configured.
 */
export function withProjectPrecedence(
  required: { site: ProviderConfigSource },
  optional: { project?: ProviderConfigSource } = {},
): ProviderConfigSource {
  const { project } = optional;
  if (!project) return required.site;
  return {
    scope: "project",
    read: async (input) => (await project.read(input)) ?? required.site.read(input),
    readSettings: async (input) => (await project.readSettings(input)) ?? required.site.readSettings(input),
    write: (input) => project.write(input),
  };
}
